# 소셜 탭 스냅 입구 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 소셜 탭 스냅 링 줄 맨 앞에 '내 스냅 +' 칸을 두어 바로 스냅 카메라로 진입하게 한다.

**Architecture:** 정렬 규칙(내 대표를 맨 앞으로)은 `utils/snapStrip.ts` 순수 함수로 빼고 검증을 붙인다. `SocialScreen`은 그 결과로 `snapDisplay`를 만들고, 내 스냅이 없으면 자리표시 항목을, 있으면 내 링에 `+` 배지를 그린다. 촬영 화면·지구본 탭 버튼은 손대지 않는다.

**Tech Stack:** React Native(Expo SDK 54), TypeScript, react-i18next, `*.verify.ts` 검증(`tsx`).

**Spec:** `docs/superpowers/specs/2026-09-07-social-snap-entry-design.md`

## Global Constraints

- 결과·주석·커밋 메시지는 한글. 지시한 파일만 수정. 커밋은 파일 단위 스테이징, `git add -A` 금지.
- 검증은 `*.verify.ts` 스크립트(`node node_modules/tsx/dist/cli.mjs <파일>`, 파이프 금지). jest/vitest 없음.
- 햅틱은 `utils/haptics`의 의미 함수만(`select`). RNSVG 아이콘은 터치 대상 안에서 `View pointerEvents="none"`으로 감싼다.
- 손대는 파일: `src/utils/snapStrip.ts`(신규), `src/utils/snapStrip.verify.ts`(신규), `src/screens/SocialScreen.tsx`, `src/i18n/locales/ko.ts`, `src/i18n/locales/en.ts`.
- 커밋 메시지 끝 두 줄:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01DamVNVYz2Zur3W5ET5KLHg
  ```

---

### Task 1: `putMineFirst` 순수 함수 + 검증

**Files:** Create `src/utils/snapStrip.ts`, `src/utils/snapStrip.verify.ts`

**Interfaces:** Produces `export function putMineFirst<T>(items: T[], isMine: (item: T) => boolean): T[]`

- [ ] **Step 1: 검증 파일 작성**

```ts
/**
 * snapStrip 검증 — node node_modules/tsx/dist/cli.mjs src/utils/snapStrip.verify.ts
 */
import { putMineFirst } from './snapStrip';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

type S = { id: string; mine?: boolean };
const isMine = (s: S) => s.mine === true;

// 경계 — 빈 배열·내 항목 없음은 순서 그대로
eq(putMineFirst<S>([], isMine), [], '빈 배열 → 빈 배열');
eq(putMineFirst<S>([{ id: 'a' }, { id: 'b' }], isMine).map((s) => s.id), ['a', 'b'], '내 항목 없음 → 순서 유지');

// 정상 — 내 항목이 중간에 있으면 맨 앞으로, 나머지 상대 순서 유지
eq(putMineFirst<S>([{ id: 'a' }, { id: 'me', mine: true }, { id: 'b' }], isMine).map((s) => s.id), ['me', 'a', 'b'], '중간의 내 항목 → 맨 앞');
eq(putMineFirst<S>([{ id: 'me', mine: true }, { id: 'a' }], isMine).map((s) => s.id), ['me', 'a'], '이미 맨 앞 → 그대로');
eq(putMineFirst<S>([{ id: 'a' }, { id: 'b' }, { id: 'me', mine: true }], isMine).map((s) => s.id), ['me', 'a', 'b'], '맨 뒤의 내 항목 → 맨 앞');

// 내 항목 2개(나라별 대표) — 첫 번째만 이동, 두 번째는 제자리(다른 항목과의 상대 순서 유지)
eq(putMineFirst<S>([{ id: 'a' }, { id: 'me1', mine: true }, { id: 'b' }, { id: 'me2', mine: true }], isMine).map((s) => s.id),
  ['me1', 'a', 'b', 'me2'], '내 항목 2개 → 첫 번째만 앞으로');

// 원본 불변 — 화면 useMemo 결과를 다른 곳에서도 쓰므로 mutate하면 안 된다
const src: S[] = [{ id: 'a' }, { id: 'me', mine: true }];
putMineFirst(src, isMine);
eq(src.map((s) => s.id), ['a', 'me'], '입력 배열은 그대로');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
```

- [ ] **Step 2: 실패 확인** — Run: `node node_modules/tsx/dist/cli.mjs src/utils/snapStrip.verify.ts` → 모듈 없음 오류, 종료코드 1.

- [ ] **Step 3: 구현**

```ts
// 소셜 탭 스냅 링 줄 정렬 — '내 스냅 +' 입구(2026-09-07)를 위해 내 대표 항목을 맨 앞에 둔다.
// 내 항목이 여러 개(나라별 대표)여도 첫 번째 하나만 옮긴다 — 배지는 맨 앞 하나에만 붙는다.

/** 내 대표 항목이 있으면 맨 앞으로(나머지 순서 유지), 없으면 같은 순서의 새 배열. 입력은 mutate하지 않는다. */
export function putMineFirst<T>(items: T[], isMine: (item: T) => boolean): T[] {
  const idx = items.findIndex(isMine);
  if (idx <= 0) return items.slice();
  return [items[idx], ...items.slice(0, idx), ...items.slice(idx + 1)];
}
```

- [ ] **Step 4: 통과 확인** — 같은 명령, 전부 `✓`.
- [ ] **Step 5: 커밋** — `git add src/utils/snapStrip.ts src/utils/snapStrip.verify.ts` / `feat(social): 스냅 링 줄 정렬 순수 함수 putMineFirst + 검증`

---

### Task 2: i18n 키

**Files:** `src/i18n/locales/ko.ts`(`social:` 섹션, 747행 부근), `src/i18n/locales/en.ts`(같은 섹션)

- [ ] **Step 1:** ko `social` 섹션 끝에 `mySnap: '내 스냅', mySnapA11y: '스냅 찍기',` / en에 `mySnap: 'My snap', mySnapA11y: 'Take a snap',`. 두 파일 나란히 비교(en 누락은 tsc가 못 잡는다).
- [ ] **Step 2:** `npx tsc --noEmit` 0.
- [ ] **Step 3: 커밋** — `feat(social): '내 스냅' i18n 키(ko/en)`

---

### Task 3: 소셜 화면 — 자리표시 항목·`+` 배지

**Files:** `src/screens/SocialScreen.tsx` — import(31행 `haptics`, 아이콘 import 줄), `snapDisplay`(2986행 부근), 링 줄 map(3058행 부근), 스타일 `s`(3454행 부근)

- [ ] **Step 1: import** — `import { putMineFirst } from '../utils/snapStrip';` 추가. `PlusIcon`이 아이콘 import에 없으면 추가(`PersonIcon`은 이미 있음).

- [ ] **Step 2: `snapDisplay` 교체** — 설계 §2 코드. `MY_SNAP_PLACEHOLDER`는 컴포넌트 밖 모듈 상수 `{ id: '__my-snap-entry__', _mySnapEntry: true }`. `hasMine`·`ordered`를 렌더에서도 쓰므로 같은 스코프에 둔다.

- [ ] **Step 3: 렌더** — map 콜백 첫 줄에서 `if (snap._mySnapEntry)`이면 아래 JSX 반환:

```tsx
<TouchableOpacity
  key={snap.id}
  style={s.storyItem}
  activeOpacity={0.8}
  onPress={() => { select(); navigation.navigate('SnapRecord'); }}
  accessibilityRole="button"
  accessibilityLabel={t('social.mySnapA11y')}
>
  <LinearGradient colors={['#3A3A4A', '#3A3A4A']} style={s.storyRing}>
    <View style={s.storyAvatarWrap}>
      <View style={s.storyAvatar}>
        {globalProfilePhoto
          ? <Image source={{ uri: globalProfilePhoto }} style={{ width: 52, height: 52, borderRadius: 26 }} />
          : <PersonIcon size={30} color="#A0A0B0" />}
      </View>
    </View>
  </LinearGradient>
  {/* + 배지 — 아이콘은 RNSVG라 터치 대상 안에서 pointerEvents none으로 감싼다 */}
  <View style={[s.storyPlusBadge, { backgroundColor: skinAccent.accent }]} pointerEvents="none">
    <PlusIcon size={12} color="#0A0A0F" />
  </View>
  <Text style={s.storyName} numberOfLines={1}>{t('social.mySnap')}</Text>
</TouchableOpacity>
```

기존 항목 분기: `hasMine && snap.id === ordered[0].id`이면 기존 `TouchableOpacity` 안(라벨 `Text` 앞)에 배지 버튼 추가:

```tsx
<TouchableOpacity
  style={[s.storyPlusBadge, { backgroundColor: skinAccent.accent }]}
  hitSlop={8}
  onPress={() => { select(); navigation.navigate('SnapRecord'); }}
  accessibilityRole="button"
  accessibilityLabel={t('social.mySnapA11y')}
>
  <View pointerEvents="none"><PlusIcon size={12} color="#0A0A0F" /></View>
</TouchableOpacity>
```

- [ ] **Step 4: 스타일** — `storyName:` 위에 추가:

```ts
// '내 스냅 +' 배지 — 링 우하단, 라벨(높이 약 16) 위에 걸치도록 bottom 18
storyPlusBadge: {
  position: 'absolute', right: 2, bottom: 18,
  width: 22, height: 22, borderRadius: 11,
  borderWidth: 2, borderColor: '#0A0A0F',
  alignItems: 'center', justifyContent: 'center',
},
```

- [ ] **Step 5:** `npx tsc --noEmit` 0, `npm test` 전체 통과(로그 파일로 리다이렉트).
- [ ] **Step 6: 커밋** — `feat(social): 스냅 링 줄 맨 앞 '내 스냅 +' 입구 — 없으면 자리표시, 있으면 내 링에 배지`

---

## 수동 확인

1. 스냅 0개: 링 줄 = [내 스냅 +, 데모]. 탭 → 카메라.
2. 타인 스냅만: [내 스냅 +, 타인…].
3. 촬영·저장 후 소셜 복귀: 내 링이 맨 앞 + 배지. 링 본체 탭 = 상세, 배지 탭 = 카메라(hitSlop으로 링 탭과 겹치지 않는지).
4. 프로필 사진 없음 → 사람 아이콘. 안드로이드에서 배지 아이콘이 터치를 삼키지 않는지.
