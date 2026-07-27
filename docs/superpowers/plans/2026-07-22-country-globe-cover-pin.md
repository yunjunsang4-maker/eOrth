# 지구본 국가 대표사진 핀 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미 사진으로 활성화된 나라에 새 사진기록을 추가할 때 대표사진 강제를 없애고, 저장 시 확인 없이 지구본 국가 사진이 덮어써지지 않게 한다.

**Architecture:** 국가별 대표사진 핀(`countryCovers`)을 recordStore에 영속 저장(충돌 시에만 지연 생성). `getCountryPhoto`를 recordStore로 중앙화해 핀 우선·기존 최신순 폴백(하위호환). NewRecordScreen(단일국가 신규)에서 강제 해제 + 저장 시 유지/바꾸기 확인.

**Tech Stack:** React Native/TypeScript, recordStore(Context + persist).

**검증 관례:** 이 저장소엔 RN 화면/스토어용 자동 테스트 러너가 없다. 각 태스크 검증은 `npx tsc --noEmit`(타입·문법) + ko/en 키셋 파리티(node) + 수동 QA. 커밋 트레일러 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. 파일 단위 스테이징([[eorth-uncommitted-wip-entanglement]]).

**범위:** 강제 해제·확인 프롬프트·핀 설정은 **단일 국가(selectedCountries.length === 1) 신규 사진기록**에서만. 다국가/블로그/네컷은 기존 동작 유지하되, **핀이 있는 나라는 어떤 기록도 덮지 않는다**(getCountryPhoto 핀 우선).

## File Structure
- **Create** `src/utils/countryMatch.ts` — `koAliases`/`matchesCountry`(MainScreen에서 추출, recordStore·MainScreen 공유)
- **Modify** `src/store/recordStore.tsx` — `countryCovers` 상태·영속, `getCountryPhoto`/`getCountryPhotoRecord`/`setCountryCover`, 삭제/편집 정합성
- **Modify** `src/screens/MainScreen.tsx` — 로컬 `koAliases`/`matchesCountry`/`getCountryPhoto` 제거, 스토어 사용
- **Modify** `src/i18n/locales/ko.ts`, `src/i18n/locales/en.ts` — 확인 문구 4키
- **Modify** `src/screens/NewRecordScreen.tsx` — 강제 해제 + 저장 시 확인/핀

---

### Task 1: koAliases/matchesCountry 공유 유틸 추출

**Files:** Create `src/utils/countryMatch.ts` · Modify `src/screens/MainScreen.tsx`(~294-302 정의, import 추가)

- [ ] **Step 1: 유틸 생성**

`src/utils/countryMatch.ts`:
```ts
// 국가명 별칭·매칭 — MainScreen과 recordStore가 공유(지구본 국가 대표사진 계산용)
export const koAliases = (name?: string | null): string[] =>
  name === '대한민국' || name === '한국' ? ['대한민국', '한국'] : name ? [name] : [];

export const matchesCountry = (
  r: { countryName?: string; countries?: { name: string }[] },
  name: string,
): boolean => {
  const set = koAliases(name);
  return set.includes(r.countryName ?? '') || !!r.countries?.some((c) => set.includes(c.name));
};
```

- [ ] **Step 2: MainScreen에서 로컬 정의 제거 + import**

`src/screens/MainScreen.tsx`의 아래 로컬 정의(294~302) 삭제:
```ts
const koAliases = (name?: string | null): string[] =>
  name === '대한민국' || name === '한국' ? ['대한민국', '한국'] : name ? [name] : [];
const matchesCountry = (
  r: { countryName?: string; countries?: { name: string }[] },
  name: string
): boolean => {
  const set = koAliases(name);
  return set.includes(r.countryName ?? '') || !!r.countries?.some((c) => set.includes(c.name));
};
```
파일 상단 import 블록에 추가:
```ts
import { koAliases, matchesCountry } from '../utils/countryMatch';
```

- [ ] **Step 3: 검증·커밋**

Run: `npx tsc --noEmit` → exit 0.
```bash
git add src/utils/countryMatch.ts src/screens/MainScreen.tsx
git commit -m "refactor: koAliases/matchesCountry를 공유 유틸로 추출

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: recordStore — countryCovers 상태 + getCountryPhoto 중앙화 + setCountryCover

**Files:** Modify `src/store/recordStore.tsx`

- [ ] **Step 1: 타입·import**

파일 상단 import에 추가:
```ts
import { koAliases, matchesCountry } from '../utils/countryMatch';
```
`TravelRecord` import 근처(또는 타입 선언부)에 추가:
```ts
export interface CountryCover { recordId: string; uri: string }
```

- [ ] **Step 2: Context 타입에 노출 (RecordContextType)**

`RecordContextType`(`addRecord: ...` 선언들 근처, ~239행 영역)에 추가:
```ts
  countryCovers: Record<string, CountryCover>;
  getCountryPhoto: (countryName: string) => string | null;
  getCountryPhotoRecord: (countryName: string) => CountryCover | null;
  setCountryCover: (countryName: string, recordId: string, uri: string) => void;
```

- [ ] **Step 3: 상태 선언**

`const [tripGroups, setTripGroups] = useState<TripGroup[]>([]);`(~356행) 다음에:
```ts
  const [countryCovers, setCountryCovers] = useState<Record<string, CountryCover>>({});
```

- [ ] **Step 4: getCountryPhotoRecord / getCountryPhoto / setCountryCover 구현**

Provider 본문(다른 useCallback들 근처)에 추가:
```ts
  // 국가의 대표사진 '기록'을 찾는다: 핀 우선(핀 기록이 살아있을 때만), 없으면 기존 최신순 폴백.
  const getCountryPhotoRecord = useCallback((countryName: string): CountryCover | null => {
    for (const a of koAliases(countryName)) {
      const pin = countryCovers[a];
      if (pin && records.some((r) => r.id === pin.recordId)) return pin; // 핀 유효
    }
    const aliases = koAliases(countryName);
    const matchingRecords = records.filter((r) => matchesCountry(r, countryName));
    for (const r of matchingRecords) {
      for (const a of aliases) {
        if (r.perCountryData?.[a]?.representativePhoto) return { recordId: r.id, uri: r.perCountryData[a]!.representativePhoto! };
      }
      if (aliases.includes(r.countryName ?? '') && r.representativePhoto) return { recordId: r.id, uri: r.representativePhoto };
      if (r.viewType === 'cut' && r.cutPhoto?.previewUri) return { recordId: r.id, uri: r.cutPhoto.previewUri };
      if (r.viewType === 'snap' && r.snapBackUri) return { recordId: r.id, uri: r.snapBackUri };
      if (r.medias && r.medias.length > 0) return { recordId: r.id, uri: r.medias[0] };
    }
    return null;
  }, [countryCovers, records]);

  const getCountryPhoto = useCallback(
    (countryName: string): string | null => getCountryPhotoRecord(countryName)?.uri ?? null,
    [getCountryPhotoRecord],
  );

  // 국가 대표사진 핀 설정('바꾸기'/'유지 고정'/첫 활성화). 키는 대표 별칭 하나로 저장.
  const setCountryCover = useCallback((countryName: string, recordId: string, uri: string) => {
    const key = koAliases(countryName)[0] ?? countryName;
    if (!key || !recordId || !uri) return;
    setCountryCovers((prev) => ({ ...prev, [key]: { recordId, uri } }));
  }, []);
```

- [ ] **Step 5: 영속(persist)·복원·백업·리셋에 countryCovers 포함**

- persist 대상 useMemo(~437행 `() => ({ records, archivedIds, ... })`)에 `countryCovers` 추가:
```ts
    () => ({ records, archivedIds, blockedUsers, tripGroups, drafts, neighbors, commentsByPost, reportedPostIds, mutedHandles, viewedSnapIds, tripSessionGroups: tripSession, countryCovers }),
```
  그리고 의존성 배열에도 `countryCovers` 추가.
- restore(하이드레이트, `p.tripGroups` 처리하는 곳): 다음 한 줄 추가:
```ts
      if (p.countryCovers && typeof p.countryCovers === 'object') setCountryCovers(p.countryCovers as Record<string, CountryCover>);
```
- `resetRecords`(모든 상태 초기화하는 함수)에 `setCountryCovers({});` 추가.
- `exportLocalStateBackup`(반환 객체)에 `countryCovers` 추가, `applyLocalStateBackup`(복원)에 `if (b.countryCovers) setCountryCovers(b.countryCovers as Record<string, CountryCover>);` 추가.

- [ ] **Step 6: Provider value에 노출**

`<RecordContext.Provider value={{ ... }}>`의 value 객체에 추가:
```ts
      countryCovers, getCountryPhoto, getCountryPhotoRecord, setCountryCover,
```

- [ ] **Step 7: 검증·커밋**

Run: `npx tsc --noEmit` → exit 0.
```bash
git add src/store/recordStore.tsx
git commit -m "feat(record): 국가 대표사진 핀(countryCovers) + getCountryPhoto 중앙화

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: recordStore — 삭제/편집 시 핀 정합성

**Files:** Modify `src/store/recordStore.tsx` (`deleteRecord`, `updateRecord`)

- [ ] **Step 1: deleteRecord — 삭제 기록을 가리키는 핀 제거**

`const deleteRecord = (id: string) => {` 본문에서 records 제거 직후에:
```ts
    setCountryCovers((prev) => {
      const next: Record<string, CountryCover> = {};
      for (const [k, v] of Object.entries(prev)) if (v.recordId !== id) next[k] = v;
      return next;
    });
```

- [ ] **Step 2: updateRecord — 편집 기록이 핀이면 uri 갱신**

`const updateRecord = (id: string, patch: ...) => {` 본문에서 record 갱신 후, patch에 대표사진 변화가 반영되도록:
```ts
    // 이 기록이 어떤 나라의 지구본 대표 핀이면 대표사진 변경을 핀에도 반영
    setCountryCovers((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [k, v] of Object.entries(prev)) {
        if (v.recordId === id) {
          const newUri = (patch as Partial<TravelRecord>).representativePhoto;
          if (typeof newUri === 'string' && newUri && newUri !== v.uri) { next[k] = { recordId: id, uri: newUri }; changed = true; }
        }
      }
      return changed ? next : prev;
    });
```
(patch 파라미터명이 다르면 실제 이름에 맞춘다.)

- [ ] **Step 3: 검증·커밋**

Run: `npx tsc --noEmit` → exit 0.
```bash
git add src/store/recordStore.tsx
git commit -m "feat(record): 기록 삭제/편집 시 국가 대표사진 핀 정합성 유지

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: MainScreen — 스토어 getCountryPhoto 사용

**Files:** Modify `src/screens/MainScreen.tsx` (로컬 getCountryPhoto ~628-653 제거)

- [ ] **Step 1: useRecords에서 getCountryPhoto 가져오기**

`useRecords()` 구조분해에 `getCountryPhoto` 추가(기존 `records` 등 옆).

- [ ] **Step 2: 로컬 getCountryPhoto 제거**

아래 로컬 정의(628~653) 전체 삭제:
```ts
  const getCountryPhoto = useCallback((countryName: string) => {
    ...
    return null;
  }, [records]);
```
이제 하단의 `getCountryPhoto(...)` 호출들은 스토어 함수를 그대로 사용(시그니처 동일).

- [ ] **Step 3: 검증·커밋**

Run: `npx tsc --noEmit` → exit 0. (미사용 `useCallback` import가 남아 경고면 유지 — 다른 곳에서 사용 중일 수 있음)
```bash
git add src/screens/MainScreen.tsx
git commit -m "refactor(main): getCountryPhoto를 recordStore 것으로 대체(핀 반영)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: i18n — 확인 문구 4키

**Files:** Modify `src/i18n/locales/ko.ts`, `src/i18n/locales/en.ts` (`newRecord` 네임스페이스, `missRepPhoto` 근처)

- [ ] **Step 1: ko.ts**

`missRepPhoto: '대표 사진 지정',`(817행) 다음에:
```ts
    coverConflictTitle: '지구본 대표 사진',
    coverConflictBody: '이 사진을 {{country}} 지구본 대표로 바꿀까요?',
    coverKeep: '유지',
    coverReplace: '바꾸기',
```

- [ ] **Step 2: en.ts**

en.ts의 `missRepPhoto` 대응 줄 다음에:
```ts
    coverConflictTitle: 'Globe cover photo',
    coverConflictBody: 'Use this photo as the globe cover for {{country}}?',
    coverKeep: 'Keep',
    coverReplace: 'Replace',
```

- [ ] **Step 3: 파리티·검증·커밋**

Run:
```bash
node -e 'const fs=require("fs");const k=f=>(fs.readFileSync(f,"utf8").match(/^\s*[A-Za-z0-9_]+:/gm)||[]).length;console.log("ko",k("src/i18n/locales/ko.ts"),"en",k("src/i18n/locales/en.ts"))'
```
Expected: ko/en 동일.
Run: `npx tsc --noEmit` → exit 0.
```bash
git add src/i18n/locales/ko.ts src/i18n/locales/en.ts
git commit -m "feat(i18n): 지구본 대표사진 유지/바꾸기 확인 키

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: NewRecordScreen — 강제 해제 + 저장 시 유지/바꾸기 확인 + 핀

**Files:** Modify `src/screens/NewRecordScreen.tsx`

- [ ] **Step 1: useRecords에서 함수 가져오기**

`useRecords()` 구조분해에 `getCountryPhoto, getCountryPhotoRecord, setCountryCover` 추가.

- [ ] **Step 2: 활성화 판정**

`missing()` 함수(~960행) 위(렌더 본문)에 파생값 추가:
```ts
  // 단일 국가 신규 기록에서, 그 나라가 이미 사진으로 활성화돼 있으면 대표사진 강제 해제 + 저장 시 확인
  const singleCountryName = selectedCountries.length === 1 ? selectedCountries[0].name : null;
  const countryActivated = !isEdit && !!singleCountryName && !!getCountryPhoto(singleCountryName);
```

- [ ] **Step 3: missRepPhoto 강제 완화**

`missing()`의 아래 줄(963행):
```ts
    if (!representativePhoto) return { key: 'photo', msg: t('newRecord.missRepPhoto') };
```
을 다음으로 교체:
```ts
    if (!representativePhoto && !countryActivated) return { key: 'photo', msg: t('newRecord.missRepPhoto') };
```

- [ ] **Step 4: doSave에 핀 적용 (활성화된 단일국가일 때)**

`doSave` 내부에서 신규 기록 저장(`const recId = addRecord(...)`, ~1077행) **직전에** 현재 대표를 캡처하고, **직후에** 핀 적용. addRecord 호출을 감싸는 else 블록(1076~) 안, `const recId = addRecord(...)` 앞뒤에:
```ts
        // (핀) 활성화된 단일국가면 addRecord 전 현재 대표를 캡처(새 기록이 최신순으로 잡히기 전)
        const preCover = countryActivated && singleCountryName ? getCountryPhotoRecord(singleCountryName) : null;

        const recId = addRecord(
          { user: { name: '', emoji: '✈️', handle: '' }, viewType: 'feed', ...payload },
          { linkTrip: !splitByCountry }
        );

        // (핀) 지구본 국가 대표사진 반영
        if (countryActivated && singleCountryName) {
          if (coverActionRef.current === 'replace') {
            const repUri = firstRepHiRes || representativePhoto || medias[0];
            if (repUri) setCountryCover(singleCountryName, recId, repUri);
          } else if (preCover) {
            setCountryCover(singleCountryName, preCover.recordId, preCover.uri); // 유지(기존 고정)
          }
        }
```
주의: `firstRepHiRes`는 저장 로직에서 이미 계산되는 고해상 대표사진 변수명(파일에서 확인해 실제 이름 사용). 없으면 `representativePhoto`/`medias[0]` 폴백.

- [ ] **Step 5: 미지정 시 대표사진 기본값(카드 커버) — 저장 payload 보정**

payload 구성 시 `representativePhoto`가 비어있고 `countryActivated`면 첫 사진으로 채운다. payload에서 대표사진을 넣는 지점 근처에:
```ts
        const effectiveRep = representativePhoto || (countryActivated ? medias[0] : representativePhoto);
```
그리고 payload의 `representativePhoto`/`representativePhotoSource`에 `effectiveRep`를 사용(기존 값 대신). (기존 `firstRepHiRes` 계산도 `effectiveRep` 기준으로.)

- [ ] **Step 6: 확인(Alert) — 활성화 + 대표 지정 + 현재와 다름**

`coverActionRef` 선언(컴포넌트 상단 다른 ref들 근처):
```ts
  const coverActionRef = useRef<'keep' | 'replace'>('keep');
```
`handleSave`(972행) 초입에, 단일국가 신규 + 활성화 + 대표 지정 + 현재 사진과 다를 때 확인을 띄우고 선택에 따라 저장:
```ts
    // 지구본 대표 충돌: 활성화된 단일국가에 대표사진을 지정했고 현재 국가 대표와 다르면 유지/바꾸기 확인
    if (
      countryActivated && singleCountryName && representativePhoto &&
      representativePhoto !== getCountryPhoto(singleCountryName)
    ) {
      Alert.alert(
        t('newRecord.coverConflictTitle'),
        t('newRecord.coverConflictBody', { country: singleCountryName }),
        [
          { text: t('newRecord.coverKeep'), onPress: () => { coverActionRef.current = 'keep'; doSave(false); } },
          { text: t('newRecord.coverReplace'), onPress: () => { coverActionRef.current = 'replace'; doSave(false); } },
        ]
      );
      return;
    }
    coverActionRef.current = 'keep'; // 그 외(미지정/동일)는 유지
```
이 블록은 기존 다국가 분할 Alert **앞**에 둔다(단일국가 조건이라 상호 배타). `Alert` import 확인.

- [ ] **Step 7: 검증·커밋**

Run: `npx tsc --noEmit` → exit 0. `git diff`로 의도 밖 변경 없는지.
```bash
git add src/screens/NewRecordScreen.tsx
git commit -m "feat(record): 활성화된 나라 새 사진기록 — 대표사진 강제 해제 + 유지/바꾸기 확인

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 최종 검증 (수동 QA)

- [ ] **Step 1: 전체 tsc + 파리티**

Run: `npx tsc --noEmit`(exit 0), i18n 파리티 node 스니펫(동일).

- [ ] **Step 2: 수동 QA** (`npx expo start -c`)

- 새 나라 첫 사진기록 → 대표사진 필수 유지, 저장 후 지구본 활성화
- 같은 나라 2번째 사진기록, 대표 미지정 → 저장됨(막힘 없음), 지구본 사진 그대로, 프로필 카드 커버=첫 사진
- 2번째 기록 대표 지정(다른 사진) → "…지구본 대표로 바꿀까요?" [유지/바꾸기] → 유지: 지구본 그대로 / 바꾸기: 새 사진으로
- 지정 사진 == 현재 국가사진 → 프롬프트 없이 저장, 지구본 그대로
- 핀 기록 삭제 → 지구본이 다른 기록으로 폴백
- 기존 데이터(핀 없는 나라)·다국가/블로그/네컷 회귀 없음

---

## Self-Review 결과

**Spec coverage:** 데이터 모델(§1)→Task 2 ✓ / getCountryPhoto 중앙화·핀 우선(§2)→Task 2,4 ✓ / 핀 조작(§3)→Task 2(setCountryCover), preCover 캡처로 '유지' 처리(Task 6) ✓ / NewRecord 흐름(§4)→Task 6 ✓ / 핀 수명주기(§5)→Task 3 ✓ / 범위·엣지(§6)→Task 6(단일국가 게이트)+범위 명시 ✓ / 테스트(§7)→각 태스크 tsc+Task 7 ✓.

**Placeholder scan:** 코드 블록 구체. `firstRepHiRes`/patch 파라미터명은 "실제 이름 확인" 명시(파일 의존 변수) — 값은 폴백까지 제시.

**Type consistency:** `CountryCover{recordId,uri}` 일관. `getCountryPhoto`/`getCountryPhotoRecord`/`setCountryCover`/`countryCovers` 명칭 태스크 간 일치. `coverActionRef: 'keep'|'replace'` Task 6 내 일관. 스펙의 freezeCountryCover는 계획에서 preCover 캡처+setCountryCover로 대체(타이밍 안전) — 명시함.
