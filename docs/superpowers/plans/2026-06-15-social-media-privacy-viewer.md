# 소셜탭 미디어 비공개 뷰어 연동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 소셜 피드/상세에서 `mediaPrivacy`를 뷰어(친구로 보기) 기준으로 적용해, 비공개 대상 친구 시점에선 해당 사진이 보이지 않게 한다.

**Architecture:** 순수 함수 util(`mediaPrivacy.ts`)이 (기록, 뷰어)를 받아 보이는 medias/대표사진을 계산한다. 전역 뷰어 상태는 `RecordProvider`(`useRecords`)에 둔다. 소셜 피드는 데이터 파이프라인의 `allVisible`에서, 상세는 `records.find` 직후에 기록을 한 번 변환해 하위 렌더가 자동으로 따라오게 한다. 피드 상단 칩으로 뷰어를 전환한다.

**Tech Stack:** React Native (Expo), TypeScript, React Context. 테스트는 리포 관행대로 `*.verify.ts` + `npx tsx`(jest 미사용).

설계 문서: `docs/superpowers/specs/2026-06-15-social-media-privacy-viewer-design.md`

---

## File Structure

- Create: `src/constants/friends.ts` — 비공개/뷰어 후보 친구 이름 단일 출처
- Create: `src/utils/mediaPrivacy.ts` — 뷰어 기준 가시성 순수 함수
- Create: `src/utils/mediaPrivacy.verify.ts` — 순수 함수 단위 검증
- Modify: `src/store/recordStore.tsx` — `currentViewer`/`setCurrentViewer` 전역 상태
- Modify: `src/screens/SocialScreen.tsx` — 뷰어 칩 + 피드 변환 적용
- Modify: `src/screens/PostDetailScreen.tsx` — 상세 기록 변환 적용
- Modify: `src/screens/NewRecordScreen.tsx` — 로컬 `DUMMY_FRIENDS` → 공용 상수 import
- Modify: `src/screens/BlogRecordScreen.tsx` — 로컬 `DUMMY_FRIENDS` → 공용 상수 import

---

## Task 1: 친구 상수 단일 출처 추출

**Files:**
- Create: `src/constants/friends.ts`
- Modify: `src/screens/NewRecordScreen.tsx:1074`
- Modify: `src/screens/BlogRecordScreen.tsx:710`

- [ ] **Step 1: 상수 파일 생성**

Create `src/constants/friends.ts`:

```ts
// 비공개 대상 선택 / 뷰어(친구로 보기) 후보로 쓰이는 더미 친구 이름.
// NewRecordScreen·BlogRecordScreen·소셜 뷰어 칩이 동일 목록을 공유한다.
export const DUMMY_FRIENDS = ['김민수', '이서연', '박준호', '최유진', '정하늘'];
```

- [ ] **Step 2: NewRecordScreen이 공용 상수를 쓰도록 교체**

In `src/screens/NewRecordScreen.tsx`, remove the local declaration (line ~1074):

```ts
  const DUMMY_FRIENDS = ['김민수', '이서연', '박준호', '최유진', '정하늘'];
```

그리고 파일 상단 import 블록(예: `import type { RootStackScreenProps } from '../navigation/types';` 줄 아래)에 추가:

```ts
import { DUMMY_FRIENDS } from '../constants/friends';
```

- [ ] **Step 3: BlogRecordScreen도 동일 교체**

In `src/screens/BlogRecordScreen.tsx`, remove the local declaration (line ~710):

```ts
  const DUMMY_FRIENDS = ['김민수', '이서연', '박준호', '최유진', '정하늘'];
```

그리고 파일 상단 import 블록에 추가:

```ts
import { DUMMY_FRIENDS } from '../constants/friends';
```

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0건 (PASS)

- [ ] **Step 5: 커밋**

```bash
git add src/constants/friends.ts src/screens/NewRecordScreen.tsx src/screens/BlogRecordScreen.tsx
git commit -m "refactor(privacy): DUMMY_FRIENDS 공용 상수로 추출"
```

---

## Task 2: 가시성 순수 함수 + 검증 (TDD)

**Files:**
- Create: `src/utils/mediaPrivacy.ts`
- Test: `src/utils/mediaPrivacy.verify.ts`

- [ ] **Step 1: 실패하는 검증 테스트 작성**

Create `src/utils/mediaPrivacy.verify.ts`:

```ts
// 미디어 비공개 가시성 순수 로직 검증 (jest 미사용). 실행: npx tsx src/utils/mediaPrivacy.verify.ts
import { visibleMediaIndices, visibleMedias, visibleRepresentative, applyViewer } from './mediaPrivacy';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}

const rec = {
  medias: ['m0', 'm1', 'm2'],
  mediaPrivacy: { 1: ['김민수'], 2: ['김민수', '이서연'] },
  representativePhoto: 'm0',
};

// viewer=null → 전체
{
  assert(JSON.stringify(visibleMedias(rec, null)) === JSON.stringify(['m0', 'm1', 'm2']), 'viewer=null 전체 노출');
  assert(visibleRepresentative(rec, null) === 'm0', 'viewer=null 대표 유지');
}

// 일부 가림
{
  assert(JSON.stringify(visibleMedias(rec, '김민수')) === JSON.stringify(['m0']), '김민수: m1,m2 가림');
  assert(JSON.stringify(visibleMedias(rec, '이서연')) === JSON.stringify(['m0', 'm1']), '이서연: m2만 가림');
  assert(JSON.stringify(visibleMediaIndices(rec, '김민수')) === JSON.stringify([0]), '인덱스도 원본 기준');
}

// 대표사진이 가려지면 첫 보이는 사진으로 폴백
{
  const r2 = { medias: ['a', 'b'], mediaPrivacy: { 0: ['박준호'] }, representativePhoto: 'a' };
  assert(visibleRepresentative(r2, '박준호') === 'b', '대표 가림 → 첫 보이는 사진 폴백');
}

// 전부 가림 → 빈 배열 + 대표 undefined
{
  const r3 = { medias: ['x'], mediaPrivacy: { 0: ['최유진'] }, representativePhoto: 'x' };
  assert(visibleMedias(r3, '최유진').length === 0, '전부 가림 → 빈 배열');
  assert(visibleRepresentative(r3, '최유진') === undefined, '전부 가림 → 대표 undefined');
}

// mediaPrivacy 없음 → 전부 노출
{
  const r4 = { medias: ['p', 'q'] };
  assert(JSON.stringify(visibleMedias(r4, '김민수')) === JSON.stringify(['p', 'q']), 'privacy 없음 → 전부 노출');
}

// 외부 대표(크롭본 등, medias에 없음) → 평가 불가, 유지
{
  const r5 = { medias: ['m0'], mediaPrivacy: {}, representativePhoto: 'cover-baked.jpg' };
  assert(visibleRepresentative(r5, '김민수') === 'cover-baked.jpg', '외부 대표는 유지');
}

// applyViewer: medias/대표만 교체한 얕은 복사본
{
  const out = applyViewer(rec, '김민수');
  assert(JSON.stringify(out.medias) === JSON.stringify(['m0']), 'applyViewer medias 교체');
  assert(out.representativePhoto === 'm0', 'applyViewer 대표 유지(m0 보임)');
  assert(applyViewer(rec, null) === rec, 'viewer=null이면 원본 그대로 반환');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: 실패 확인**

Run: `npx tsx src/utils/mediaPrivacy.verify.ts`
Expected: FAIL — `Cannot find module './mediaPrivacy'` (구현 전)

- [ ] **Step 3: 순수 함수 구현**

Create `src/utils/mediaPrivacy.ts`:

```ts
// 미디어 비공개(mediaPrivacy)를 뷰어 기준으로 해석하는 순수 함수.
// mediaPrivacy: 미디어 원본 index → 그 사진을 비공개할 친구 이름 목록.
// viewer=null = 작성자/전체공개 시점(가림 없음).

export interface PrivacyRecord {
  medias?: string[];
  mediaPrivacy?: Record<number, string[]>;
  representativePhoto?: string;
}

// 보이는 미디어의 원본 index 목록. 인덱스는 항상 원본 medias 기준으로 평가한다.
export function visibleMediaIndices(record: PrivacyRecord, viewer: string | null): number[] {
  const medias = record.medias ?? [];
  if (viewer === null) return medias.map((_, i) => i);
  const priv = record.mediaPrivacy ?? {};
  const out: number[] = [];
  for (let i = 0; i < medias.length; i++) {
    const hidden = priv[i]?.includes(viewer) ?? false;
    if (!hidden) out.push(i);
  }
  return out;
}

export function visibleMedias(record: PrivacyRecord, viewer: string | null): string[] {
  const medias = record.medias ?? [];
  return visibleMediaIndices(record, viewer).map((i) => medias[i]);
}

// 대표사진: medias에 속하고 가려졌으면 첫 보이는 사진으로 폴백.
// 외부 대표(크롭본 등 medias에 없는 URI)는 가림 평가가 불가하므로 그대로 유지.
export function visibleRepresentative(record: PrivacyRecord, viewer: string | null): string | undefined {
  const medias = record.medias ?? [];
  const vis = visibleMedias(record, viewer);
  const rep = record.representativePhoto;
  if (!rep) return vis[0];
  if (!medias.includes(rep)) return rep;
  if (vis.includes(rep)) return rep;
  return vis[0];
}

// 피드/상세에 넘기기 좋게 medias/representativePhoto만 뷰어 기준으로 교체한 얕은 복사본.
// viewer=null이면 원본 객체를 그대로 반환(불필요한 재생성 방지).
export function applyViewer<T extends PrivacyRecord>(record: T, viewer: string | null): T {
  if (viewer === null) return record;
  return {
    ...record,
    medias: visibleMedias(record, viewer),
    representativePhoto: visibleRepresentative(record, viewer),
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx tsx src/utils/mediaPrivacy.verify.ts`
Expected: `ALL PASS`, 종료코드 0

- [ ] **Step 5: 타입 체크 + 커밋**

Run: `npx tsc --noEmit` (에러 0건)

```bash
git add src/utils/mediaPrivacy.ts src/utils/mediaPrivacy.verify.ts
git commit -m "feat(privacy): 뷰어 기준 미디어 가시성 순수 함수 + 검증"
```

---

## Task 3: 전역 뷰어 상태 (recordStore)

**Files:**
- Modify: `src/store/recordStore.tsx` (타입 ~521, 상태 ~546, Provider value ~822)

- [ ] **Step 1: 컨텍스트 타입에 필드 추가**

In `src/store/recordStore.tsx`, find (line ~521):

```ts
  resetRecords: () => void; // 모든 데이터를 첫 실행 상태(시드)로 되돌림
}
```

Replace with:

```ts
  resetRecords: () => void; // 모든 데이터를 첫 실행 상태(시드)로 되돌림
  // 소셜 미리보기 뷰어 — null=작성자/전체공개 시점. 비영구(저장 안 함).
  currentViewer: string | null;
  setCurrentViewer: (name: string | null) => void;
}
```

- [ ] **Step 2: 상태 추가**

Find (line ~546):

```ts
  const [commentsByPost, setCommentsByPost] = useState<Record<string, PostComment[]>>(INITIAL_COMMENTS);
```

Add directly below:

```ts
  const [currentViewer, setCurrentViewer] = useState<string | null>(null);
```

- [ ] **Step 3: Provider value에 노출**

Find (line ~822) the provider value object and add `currentViewer, setCurrentViewer` before the closing `}}`:

```tsx
    <RecordContext.Provider value={{ records, addRecord, updateRecord, deleteRecord, toggleLike, markSnapViewed, archivedIds, archiveRecord, unarchiveRecord, blockedUsers, blockUser, unblockUser, followingUsers, followUser, unfollowUser, commentsByPost, addComment, tripGroups, addTripGroup, deleteTripGroup, updateTripGroup, drafts, saveDraft, updateDraft, deleteDraft, publishDraft, addImportedAlbum, resetRecords, currentViewer, setCurrentViewer }}>
```

(주의: `currentViewer`는 의도적으로 `RecordPersistPayload`/persistence에 넣지 않는다 — 미리보기용 임시 상태.)

- [ ] **Step 4: 타입 체크 + 커밋**

Run: `npx tsc --noEmit` (에러 0건)

```bash
git add src/store/recordStore.tsx
git commit -m "feat(privacy): 전역 currentViewer 상태 추가"
```

---

## Task 4: 소셜 피드 적용 + 뷰어 칩

**Files:**
- Modify: `src/screens/SocialScreen.tsx` (import 상단, 구조분해 ~1923, allVisible ~2005, ScrollView 내부 ~2077)

- [ ] **Step 1: import 추가**

In `src/screens/SocialScreen.tsx` 상단 import 블록에 추가:

```ts
import { applyViewer } from '../utils/mediaPrivacy';
import { DUMMY_FRIENDS } from '../constants/friends';
```

- [ ] **Step 2: 메인 화면에서 currentViewer 구독**

Find (line ~1923):

```ts
  const { records, toggleLike, blockedUsers, blockUser, deleteRecord, archivedIds, archiveRecord } = useRecords();
```

Replace with:

```ts
  const { records, toggleLike, blockedUsers, blockUser, deleteRecord, archivedIds, archiveRecord, currentViewer, setCurrentViewer } = useRecords();
```

- [ ] **Step 3: allVisible을 뷰어 기준으로 변환**

Find (line ~2005):

```ts
  const allVisible = records.filter(
    (r) =>
      (r.visibility === 'friends' || r.visibility === 'public') &&
      !blockedNames.includes(r.user.name) &&
      !archivedIds.includes(r.id)
  );
```

Replace with:

```ts
  const allVisible = records
    .filter(
      (r) =>
        (r.visibility === 'friends' || r.visibility === 'public') &&
        !blockedNames.includes(r.user.name) &&
        !archivedIds.includes(r.id)
    )
    // 선택된 뷰어 시점에서 비공개 사진을 제거한 사본으로 교체 (viewer=null이면 원본 그대로)
    .map((r) => applyViewer(r, currentViewer));
```

- [ ] **Step 4: 피드 상단에 뷰어 칩 추가**

Find (line ~2077) the opening of the scroll content (snap 스토리 직전):

```tsx
        scrollEventThrottle={16}
      >
        {/* 스냅 스토리 라인 (인스타 스토리 스타일) */}
```

Replace with:

```tsx
        scrollEventThrottle={16}
      >
        {/* 친구로 보기 — 비공개 미리보기 뷰어 전환 */}
        <View style={vc.bar}>
          <Text style={vc.label}>미리보기</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={vc.row}>
            <TouchableOpacity
              style={[vc.chip, currentViewer === null && vc.chipOn]}
              onPress={() => setCurrentViewer(null)}
              activeOpacity={0.8}
            >
              <Text style={[vc.chipTxt, currentViewer === null && vc.chipTxtOn]}>전체 보기</Text>
            </TouchableOpacity>
            {DUMMY_FRIENDS.map((name) => {
              const on = currentViewer === name;
              return (
                <TouchableOpacity
                  key={name}
                  style={[vc.chip, on && vc.chipOn]}
                  onPress={() => setCurrentViewer(on ? null : name)}
                  activeOpacity={0.8}
                >
                  <Text style={[vc.chipTxt, on && vc.chipTxtOn]}>{name}로 보기</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* 스냅 스토리 라인 (인스타 스토리 스타일) */}
```

- [ ] **Step 5: 칩 스타일 추가**

In `src/screens/SocialScreen.tsx`, 파일 맨 끝(마지막 `StyleSheet.create` 정의들 뒤)에 새 스타일 객체를 추가:

```ts
const vc = StyleSheet.create({
  bar: { paddingTop: 10, paddingBottom: 4, paddingHorizontal: 16, gap: 6 },
  label: { color: '#A1A1B0', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  row: { gap: 8, paddingVertical: 4 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.04)',
  },
  chipOn: { borderColor: '#BF85FC', backgroundColor: 'rgba(191,133,252,0.18)' },
  chipTxt: { color: '#A1A1B0', fontSize: 13, fontWeight: '500' },
  chipTxtOn: { color: '#FFFFFF', fontWeight: '700' },
});
```

- [ ] **Step 6: 타입 체크 + 커밋**

Run: `npx tsc --noEmit` (에러 0건)

```bash
git add src/screens/SocialScreen.tsx
git commit -m "feat(privacy): 소셜 피드에 뷰어 칩 + 비공개 적용"
```

---

## Task 5: 게시물 상세 적용

**Files:**
- Modify: `src/screens/PostDetailScreen.tsx` (import 상단, 구조분해 ~894, record ~917)

- [ ] **Step 1: import 추가**

In `src/screens/PostDetailScreen.tsx` 상단 import 블록에 추가:

```ts
import { applyViewer } from '../utils/mediaPrivacy';
```

- [ ] **Step 2: currentViewer 구독**

Find (line ~894):

```ts
  const { records, toggleLike, deleteRecord, archiveRecord, markSnapViewed, commentsByPost, addComment: addCommentToStore } = useRecords();
```

Replace with:

```ts
  const { records, toggleLike, deleteRecord, archiveRecord, markSnapViewed, commentsByPost, addComment: addCommentToStore, currentViewer } = useRecords();
```

- [ ] **Step 3: 기록을 뷰어 기준으로 변환**

Find (line ~917):

```ts
  const record = records.find((r) => r.id === postId);
```

Replace with:

```ts
  const rawRecord = records.find((r) => r.id === postId);
  // 선택된 뷰어 시점에서 비공개 사진을 제거한 사본 (viewer=null이면 원본 그대로)
  const record = rawRecord ? applyViewer(rawRecord, currentViewer) : rawRecord;
```

- [ ] **Step 4: 타입 체크 + 커밋**

Run: `npx tsc --noEmit` (에러 0건)

```bash
git add src/screens/PostDetailScreen.tsx
git commit -m "feat(privacy): 게시물 상세에 뷰어 기준 비공개 적용"
```

---

## Task 6: 통합 수동 검증

**Files:** (코드 변경 없음 — 동작 확인)

- [ ] **Step 1: 순수 함수 재검증**

Run: `npx tsx src/utils/mediaPrivacy.verify.ts`
Expected: `ALL PASS`

- [ ] **Step 2: 타입 체크 전체**

Run: `npx tsc --noEmit`
Expected: 에러 0건

- [ ] **Step 3: 앱에서 수동 확인 (기기/시뮬)**

1. 피드 기록을 하나 만들고, 사진 2장 이상 + 한 장에 특정 친구(예: 김민수) 비공개 설정 후 저장.
2. 소셜탭 상단 "미리보기" 칩에서 `전체 보기` → 모든 사진 보임 확인.
3. `김민수로 보기` 선택 → 비공개 설정한 사진이 피드 카드/썸네일·상세에서 사라짐 확인.
4. 대표사진을 비공개로 지정했던 경우 → 카드 썸네일이 다음 보이는 사진으로 바뀜 확인.
5. 칩을 `전체 보기`로 되돌리면 원래대로 복원 확인.

---

## Self-Review 결과

- **Spec coverage:** 뷰어 식별(Task 3·4 칩), 가림=제거(Task 2 visibleMedias), 대표 폴백(Task 2 visibleRepresentative), 피드/썸네일/상세 적용(Task 4·5), 친구 단일 출처(Task 1), 테스트(Task 2), 블로그 본문 제외(applyViewer는 medias/대표만 다룸) — 모두 매핑됨.
- **Placeholder scan:** 없음 — 모든 코드/명령 구체화됨.
- **Type consistency:** `visibleMediaIndices/visibleMedias/visibleRepresentative/applyViewer`, `currentViewer/setCurrentViewer`, `DUMMY_FRIENDS` 명칭이 전 Task에서 일치.
