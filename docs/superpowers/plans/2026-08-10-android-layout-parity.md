# 안드로이드 전 기종 배치 파리티 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 안드로이드 어떤 기종(저가 360dp·플래그십·폴드·태블릿)에서 열어도 배치가 iOS와 다르지 않게 만든다.

**Architecture:** 콘텐츠 최대 폭을 480dp로 clamp하는 단일 출처(Stage)를 만들고, 루트 컨테이너 한 겹으로 전 화면에 적용한다. RN `<Modal>`은 윈도우 최상위에 그려져 루트를 벗어나므로 바텀시트 본체에만 개별로 `maxWidth`를 준다. 폭이 스크롤 계산에 들어가는 12개 파일만 실시간 훅으로 바꾸고, 나머지 모듈 상수는 clamp된 값을 쓰게 치환한다. 회귀는 정적 검사 스크립트로 막는다.

**Tech Stack:** React Native 0.81.5 / React 19.1 / Expo SDK 54 / TypeScript. 테스트는 jest 미사용 — `*.verify.ts`(src) / `*.verify.mjs`(scripts)를 `npm test`(= `node scripts/run-verify.mjs`)가 tsx로 실행하며, 각 파일이 자체 assert로 ✓/✗를 출력하고 0/1로 종료한다.

**Spec:** `docs/superpowers/specs/2026-08-10-android-layout-parity-design.md`

## Global Constraints

- **iOS 화면이 정답, Android 코드만 보정** — 기존 파리티 감사의 대원칙.
- `STAGE_MAX_W = 480` — 430이 아니다. Pixel 8 Pro/9 Pro XL이 448dp라 430이면 일반 폰이 레터박스된다.
- **딤 배경(backdrop)은 절대 클램프하지 않는다.** 시트 본체만 클램프한다. 배경을 좁히면 폴드에서 양옆이 안 어두워진다.
- **"화면 가득"이 의도인 요소는 창 전체 폭**(`useWindowDimensions`), **"폰 레이아웃"이 의도인 요소는 Stage 폭**(`useStageWidth`).
- `MAX_FONT_SCALE = 1.2` — `utils/fitText.ts:11`의 기존 값과 일치시킨다.
- 디자인 토큰: 배경 `#0A0A0F`, 카드 `#2E2E3B`, 보라 네온 `#BF85FC`.
- **지시한 파일만 수정한다** (CLAUDE.md 규칙). 각 Task의 Files 목록 밖은 건드리지 않는다.
- 커밋 메시지는 한글, `type(scope): 요약` 형식.
- 검증 명령: `npx tsc --noEmit` / `npm run lint` / `npm test`.

### 결정: 글꼴 배율 상한은 양 플랫폼에 적용한다

`utils/fitText.ts:3`에 "iOS 렌더링은 절대 변경하지 않는다"가 명시돼 있으나, 글꼴 배율만은 **양 플랫폼에 동일하게** 적용한다. 목표가 "두 플랫폼이 다르지 않게"인데 Android만 1.2로 자르면 사용자가 배율을 올렸을 때 오히려 두 플랫폼이 갈라지기 때문이다.

**대가:** iOS Dynamic Type을 크게 쓰는 사용자에게 글자가 120%까지만 커진다(현재는 무제한). 되돌릴 수 있게 `src/ui/Text.tsx` 한 파일의 상수 하나로 분기 가능하게 둔다 — Task 6 Step 3의 주석 참조.

---

## File Structure

**신규**

| 파일 | 책임 |
|---|---|
| `src/utils/stageMath.ts` | 순수 계산만 — `STAGE_MAX_W`, `clampStageWidth(w)`. RN을 import하지 않아 tsx로 직접 검증 가능 |
| `src/utils/stageMath.verify.ts` | 위 순수 함수 검증 |
| `src/utils/stage.ts` | RN 의존부 — `useStageWidth()`, `stageWidthNow()` |
| `src/ui/Text.tsx` | `maxFontSizeMultiplier`가 기본으로 걸린 `Text`/`TextInput` 재수출 |
| `scripts/layout-parity.verify.mjs` | 정적 회귀 가드 — 규칙을 Task마다 한 줄씩 추가해 나간다 |

**수정**

| 파일 | 변경 |
|---|---|
| `App.tsx` | 루트 클램프 컨테이너 한 겹 |
| 실시간 12개 파일 | 모듈 상수 → 훅 (Task 3 표) |
| 나머지 30곳 | `Dimensions.get('window').width` → `stageWidthNow()` |
| 바텀시트 36곳 | 시트 본체 스타일에 `maxWidth`·`alignSelf` |
| 93개 파일 | `Text`/`TextInput` import 출처 교체 |
| `src/utils/fitText.ts` | 하드코딩 `1.2` → `MAX_FONT_SCALE` 참조 |
| `eslint.config.js` | `no-restricted-imports` 가드 |
| 키보드 모달 5곳 | `KeyboardAvoidingView` 추가 |

**스펙과 순서가 다른 점:** 스펙 §9는 바텀시트를 2번에 뒀지만, 이 계획에서는 **정적 가드를 먼저 세우고 코드모드를 나중에** 돌린다. 가드 없이 36곳·93곳을 기계 치환하면 오주입을 사람 눈으로만 잡아야 한다.

---

## Task 1: Stage 단일 출처

**Files:**
- Create: `src/utils/stageMath.ts`
- Create: `src/utils/stageMath.verify.ts`
- Create: `src/utils/stage.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `STAGE_MAX_W: 480` (`stageMath.ts`)
  - `clampStageWidth(w: number): number` (`stageMath.ts`)
  - `useStageWidth(): number` (`stage.ts`) — 훅
  - `stageWidthNow(): number` (`stage.ts`) — 훅 아님, 모듈 상수 초기화용

- [ ] **Step 1: 실패하는 검증을 먼저 쓴다**

`src/utils/stageMath.verify.ts`:

```ts
// Stage 폭 계산 검증 — 이 값이 틀어지면 전 화면 배치가 함께 틀어진다.
// RN을 import하지 않는 순수 모듈만 검사한다(tsx가 react-native를 해석하지 못함).
import { STAGE_MAX_W, clampStageWidth } from './stageMath';

let fail = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) fail++;
};

console.log('Stage 폭 계산');

// 430이 아니라 480인 이유: Pixel 8 Pro/9 Pro XL이 448dp라
// 430으로 자르면 일반 폰이 레터박스된다.
check(STAGE_MAX_W === 480, `STAGE_MAX_W === 480 (실제 ${STAGE_MAX_W})`);

// 실존 폰 폭은 전부 그대로 통과해야 한다 — 하나라도 깎이면 회귀다.
for (const w of [360, 384, 392, 411, 412, 428, 440, 448]) {
  check(clampStageWidth(w) === w, `폰 ${w}dp는 그대로 통과`);
}

// 대화면만 clamp된다.
check(clampStageWidth(763) === 480, '폴드 펼침 763dp → 480');
check(clampStageWidth(800) === 480, '태블릿 800dp → 480');
check(clampStageWidth(600) === 480, '대화면 기준점 600dp → 480');

// 경계값.
check(clampStageWidth(480) === 480, '480dp 경계는 그대로');
check(clampStageWidth(481) === 480, '481dp는 480으로');

// 방어: 측정 실패로 0이나 NaN이 들어와도 레이아웃이 사라지면 안 된다.
check(clampStageWidth(0) === 0, '0은 0으로 (조기 렌더 시 onLayout 전)');
check(!Number.isNaN(clampStageWidth(NaN)), 'NaN이 전파되지 않는다');

console.log(fail === 0 ? '\n✅ 통과' : `\n❌ ${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test`
Expected: FAIL — `Cannot find module './stageMath'`

- [ ] **Step 3: 순수 모듈을 만든다**

`src/utils/stageMath.ts`:

```ts
// 콘텐츠가 놓이는 최대 폭(Stage) — 배치 파리티의 단일 출처.
//
// 480인 이유: 실존하는 안드로이드 폰의 최대 폭이 448dp(Pixel 9 Pro XL)이고
// iPhone 16 Pro Max가 440pt다. 480으로 두면 모든 폰이 지금과 똑같이 화면을 채우고,
// 안드로이드 공식 대화면 기준점인 600dp 이상(폴드 펼침·태블릿)만 중앙 컬럼이 된다.
// 430으로 낮추면 Pixel Pro 계열 일반 폰이 레터박스되어 오히려 손해다.
//
// RN을 import하지 않는다 — npm test(tsx)가 이 파일을 그대로 실행할 수 있어야 한다.
export const STAGE_MAX_W = 480;

/** 창 폭을 Stage 폭으로 자른다. NaN이 들어오면 전파시키지 않고 0으로 떨어뜨린다. */
export function clampStageWidth(windowWidth: number): number {
  if (!Number.isFinite(windowWidth)) return 0;
  return Math.min(windowWidth, STAGE_MAX_W);
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npm test`
Expected: PASS — `✓ STAGE_MAX_W === 480` 외 전 항목 ✓

- [ ] **Step 5: RN 의존부를 만든다**

`src/utils/stage.ts`:

```ts
import { Dimensions, useWindowDimensions } from 'react-native';
import { clampStageWidth } from './stageMath';

export { STAGE_MAX_W, clampStageWidth } from './stageMath';

/**
 * 렌더 중 Stage 폭. 창 크기가 바뀌면(폴드 펼침·분할화면) 즉시 반영된다.
 * 폭이 스크롤 계산에 들어가는 곳에 쓴다 — stale 값이면 페이저가 엉뚱한 항목을 가리킨다.
 */
export function useStageWidth(): number {
  return clampStageWidth(useWindowDimensions().width);
}

/**
 * 훅이 아니다. 모듈 최상위 상수를 초기화할 때만 쓴다.
 * 값은 여전히 앱 시작 시점에 박제되지만 clamp된 값이라, 폴드 펼침 시 폭 변화가
 * 360→763(2.1배)에서 360→480(1.3배)로 줄어 어긋남이 눈에 띄지 않는다.
 * 새 코드에서는 useStageWidth()를 쓸 것.
 */
export function stageWidthNow(): number {
  return clampStageWidth(Dimensions.get('window').width);
}
```

- [ ] **Step 6: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 오류 0건

- [ ] **Step 7: 커밋**

```bash
git add src/utils/stageMath.ts src/utils/stageMath.verify.ts src/utils/stage.ts
git commit -m "feat(layout): Stage 폭 단일 출처 추가 — 최대 480dp"
```

---

## Task 2: 루트 클램프 + 정적 회귀 가드

**Files:**
- Create: `scripts/layout-parity.verify.mjs`
- Modify: `App.tsx` (현재 117~150행의 Provider 스택 바깥)

**Interfaces:**
- Consumes: `STAGE_MAX_W` (Task 1)
- Produces: `scripts/layout-parity.verify.mjs` — 이후 Task들이 규칙을 한 줄씩 추가하는 가드 파일

- [ ] **Step 1: 실패하는 가드를 먼저 쓴다**

`scripts/layout-parity.verify.mjs`:

```js
// 배치 파리티 정적 가드 — 코드모드로 대량 치환한 규칙이 조용히 원상복귀되는 것을 막는다.
// 이 저장소는 76곳 코드모드 주입 이력이 있고(8/3 파리티 감사), 그때 오주입 여부를
// 사람 눈으로만 확인했다. 같은 일을 반복하지 않기 위한 자동 검사다.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const SKIP = new Set(['node_modules', 'geo-tmp', 'tmp-frames', 'intro1']);

function collect(dir, ext, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, ext, out);
    else if (name.endsWith(ext)) out.push(full);
  }
  return out;
}

const rel = (p) => p.split(sep).join('/');
// collect·rel은 규칙 3부터 쓴다(Task 4). 지금은 정의만 해둔다 —
// lint가 미사용을 지적하면 규칙 3을 추가할 때 자연히 해소되므로 무시한다.
let fail = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) fail++;
};

console.log('배치 파리티');

// ── 규칙 1: 루트 클램프가 살아 있다 ──
// 이게 빠지면 폴드·태블릿에서 전 화면이 늘어난다. 값은 stageMath와 같아야 한다.
const stageMath = readFileSync('src/utils/stageMath.ts', 'utf8');
const maxW = Number(stageMath.match(/STAGE_MAX_W = (\d+)/)?.[1]);
const app = readFileSync('App.tsx', 'utf8');
check(maxW === 480, `STAGE_MAX_W === 480 (실제 ${maxW})`);
check(
  app.includes('STAGE_MAX_W') && /maxWidth:\s*STAGE_MAX_W/.test(app),
  'App.tsx가 maxWidth: STAGE_MAX_W로 루트를 클램프한다',
);
check(
  /alignSelf:\s*'center'/.test(app),
  'App.tsx 루트 컨테이너가 중앙 정렬된다',
);

console.log(fail === 0 ? '\n✅ 통과' : `\n❌ ${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test`
Expected: FAIL — `✗ App.tsx가 maxWidth: STAGE_MAX_W로 루트를 클램프한다`

- [ ] **Step 3: App.tsx에 루트 클램프를 넣는다**

`App.tsx` 상단 import에 추가:

```tsx
import { STAGE_MAX_W } from './src/utils/stage';
```

현재 구조(117~150행):

```tsx
<GestureHandlerRootView style={{ flex: 1 }}>
  <SafeAreaProvider>
    <SettingsProvider>
      …
    </SettingsProvider>
  </SafeAreaProvider>
</GestureHandlerRootView>
```

`<SafeAreaProvider>` **안쪽**, `<SettingsProvider>` **바깥쪽**에 두 겹을 넣는다:

```tsx
<GestureHandlerRootView style={{ flex: 1 }}>
  <SafeAreaProvider>
    {/* 폴드 펼침·태블릿에서 콘텐츠가 무한정 늘어나지 않게 Stage 폭으로 가둔다.
        바깥 View는 클램프 양옆에 남는 여백의 배경색. SafeAreaProvider를 바깥에 두는
        이유: 인셋은 클램프된 컬럼이 아니라 실제 화면 기준으로 계산돼야 한다. */}
    <View style={{ flex: 1, backgroundColor: '#0A0A0F' }}>
      <View style={{ flex: 1, width: '100%', maxWidth: STAGE_MAX_W, alignSelf: 'center' }}>
        <SettingsProvider>
          …기존 그대로…
        </SettingsProvider>
      </View>
    </View>
  </SafeAreaProvider>
</GestureHandlerRootView>
```

`View`가 `App.tsx`에 아직 import돼 있지 않다면 `react-native`에서 추가한다(110행에서 이미 쓰고 있으므로 대개 이미 있다 — 확인만 할 것).

- [ ] **Step 4: 통과를 확인한다**

Run: `npm test`
Expected: PASS — 규칙 1 전 항목 ✓

- [ ] **Step 5: 타입·린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 0건

- [ ] **Step 6: 커밋**

```bash
git add App.tsx scripts/layout-parity.verify.mjs
git commit -m "feat(layout): 루트 Stage 클램프 + 배치 파리티 정적 가드"
```

---

## Task 3: 실시간 반응 12개 파일

폭이 스크롤 계산에 들어가거나 화면 가득이 의도인 파일만 훅으로 바꾼다.

**Files (Modify):**

| 파일 | 기준 | 대체할 상수 |
|---|---|---|
| `src/components/PhotoViewerModal.tsx:22` | 창 전체 | `W`, `H` |
| `src/components/CutPhotoAdjustModal.tsx:10` | 창 전체 | `SW`, `SH` |
| `src/components/PuzzlePhotoAdjustOverlay.tsx:14` | 창 전체 | `SW`, `SH` |
| `src/components/QuickShareOverlay.tsx:8` | 창 전체 | `SCREEN_W`, `SCREEN_H` |
| `src/components/CameraCaptureModal.tsx` | 창 전체 | (상수 없음 — 확인만) |
| `src/components/record/PhotoPagerSection.tsx:10` | Stage | `SCREEN_W`, `PAGE_W`, `PAGE_H` |
| `src/components/record/MediaPickerModal.tsx:30` | Stage | `PICKER_CELL` |
| `src/screens/PostDetailScreen.tsx:67` | Stage | `SCREEN_W`, `SCREEN_H` |
| `src/screens/BlogRecordScreen.tsx:90,187` | Stage | `SCREEN_W`, `SCREEN_H` |
| `src/screens/AppIntroScreen.tsx:35` | Stage | `SW` |
| `src/screens/TripDetailScreen.tsx:34` | Stage | `SCREEN_WIDTH` |
| `src/components/PuzzleShareCard.tsx:13` | Stage | `SW` |

**Interfaces:**
- Consumes: `useStageWidth()` (Task 1), `useWindowDimensions()` (RN)
- Produces: 없음 (내부 변경)

**제외 — 건드리지 말 것:** `src/components/MainCoachmark.tsx:21`. 상수는 초기값일 뿐이고 136행에서 `onLayout` 측정값(`rootSize`)으로 갱신된다. 이미 자가 치유한다.

- [ ] **Step 1: 가드에 규칙 2를 추가한다**

`scripts/layout-parity.verify.mjs`의 규칙 1 아래에 붙인다:

```js
// ── 규칙 2: 실시간 대상 파일에 모듈 최상위 Dimensions 상수가 남아 있지 않다 ──
// 이 파일들은 폭이 스크롤 오프셋 계산에 들어간다. 박제된 값이면 폴드를 펼쳤을 때
// 페이저가 엉뚱한 사진을 가리키고 getItemLayout 스크롤 위치가 어긋난다.
const REALTIME = [
  'src/components/PhotoViewerModal.tsx',
  'src/components/CutPhotoAdjustModal.tsx',
  'src/components/PuzzlePhotoAdjustOverlay.tsx',
  'src/components/QuickShareOverlay.tsx',
  'src/components/record/PhotoPagerSection.tsx',
  'src/components/record/MediaPickerModal.tsx',
  'src/screens/PostDetailScreen.tsx',
  'src/screens/BlogRecordScreen.tsx',
  'src/screens/AppIntroScreen.tsx',
  'src/screens/TripDetailScreen.tsx',
  'src/components/PuzzleShareCard.tsx',
];
for (const f of REALTIME) {
  const src = readFileSync(f, 'utf8');
  // 모듈 최상위 = 줄 맨 앞에서 시작하는 const/let 선언
  const frozen = src.split('\n').filter((l) => /^(const|let)\s.*Dimensions\.get\(/.test(l));
  check(frozen.length === 0, `${f} 모듈 최상위 Dimensions 상수 없음 (${frozen.length}건)`);
}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test`
Expected: FAIL — 11개 파일 전부 `✗ … (1건)` 또는 `(2건)`

- [ ] **Step 3: 창 전체 기준 4개 파일을 바꾼다**

패턴은 동일하다. `PhotoViewerModal.tsx` 예:

```tsx
// 삭제 (22행):
// const { width: W, height: H } = Dimensions.get('window');

// 컴포넌트 함수 본문 첫 줄에 추가:
const { width: W, height: H } = useWindowDimensions();
```

`react-native` import에서 `Dimensions`를 빼고 `useWindowDimensions`를 넣는다. 단 같은 파일에서 `Dimensions`를 다른 용도로도 쓰면 남긴다.

**주의:** `W`/`H`가 `StyleSheet.create()` 안에서 쓰이고 있으면 그대로 옮길 수 없다 — `StyleSheet.create`는 모듈 최상위에서 한 번 실행되기 때문이다. 그 경우 해당 스타일만 인라인으로 내리거나, 스타일을 `useMemo`로 감싼다:

```tsx
const s = useMemo(() => StyleSheet.create({ page: { width: W, height: H } }), [W, H]);
```

같은 요령을 `CutPhotoAdjustModal.tsx`(`SW`/`SH`), `PuzzlePhotoAdjustOverlay.tsx`(`SW`/`SH`), `QuickShareOverlay.tsx`(`SCREEN_W`/`SCREEN_H`)에 적용한다.

- [ ] **Step 4: `CameraCaptureModal.tsx`는 확인만 한다**

Run: `grep -n "Dimensions" src/components/CameraCaptureModal.tsx`
Expected: 결과 없음 → **파일을 수정하지 않는다.** 결과가 있으면 창 전체 기준으로 위와 동일하게 처리한다.

- [ ] **Step 5: Stage 기준 7개 파일을 바꾼다**

```tsx
import { useStageWidth } from '../utils/stage';   // 경로는 파일 깊이에 맞춘다

// 컴포넌트 본문:
const SCREEN_W = useStageWidth();
```

파일별 파생값도 함께 본문으로 내린다:

- `PhotoPagerSection.tsx` — `PAGE_W = SCREEN_W`, `PAGE_H = Math.round(SCREEN_W * 1.05)`
- `MediaPickerModal.tsx` — `PICKER_CELL = Math.floor((SCREEN_W - 6) / 3)`.
  이 값은 100~101행 `getItemLayout`의 `length`/`offset`에도 들어가므로, `getItemLayout`을
  `useCallback`으로 감싸고 의존성에 `PICKER_CELL`을 넣는다:

```tsx
const getItemLayout = useCallback(
  (_: unknown, index: number) => ({
    length: PICKER_CELL + 2,
    offset: (PICKER_CELL + 2) * Math.floor(index / 3),
    index,
  }),
  [PICKER_CELL],
);
```

- `BlogRecordScreen.tsx` — 90행 `SCREEN_W`와 187행 `SCREEN_H` 둘 다
- `TripDetailScreen.tsx` — `SCREEN_WIDTH`. 790행 `snapToInterval={cardW + SWIPE_GAP}`의 `cardW`가 이 값에서 파생되는지 확인하고, 그렇다면 함께 본문으로 내린다

- [ ] **Step 6: 통과를 확인한다**

Run: `npm test`
Expected: PASS — 규칙 2의 11개 파일 전부 ✓

- [ ] **Step 7: 타입·린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 0건. 훅을 조건문·조기 return 뒤에 두면 `react-hooks/rules-of-hooks`가 잡는다 — 잡히면 훅 호출을 본문 최상단으로 올린다.

- [ ] **Step 8: 커밋**

```bash
git add src/components/PhotoViewerModal.tsx src/components/CutPhotoAdjustModal.tsx \
  src/components/PuzzlePhotoAdjustOverlay.tsx src/components/QuickShareOverlay.tsx \
  src/components/record/PhotoPagerSection.tsx src/components/record/MediaPickerModal.tsx \
  src/screens/PostDetailScreen.tsx src/screens/BlogRecordScreen.tsx \
  src/screens/AppIntroScreen.tsx src/screens/TripDetailScreen.tsx \
  src/components/PuzzleShareCard.tsx scripts/layout-parity.verify.mjs
git commit -m "fix(layout): 폭 의존 12개 파일 실시간 반응 — 폴드 펼침 시 페이저 어긋남 해소"
```

---

## Task 4: 나머지 상수 치환 + 고정 폭 오버플로우

**Files (Modify):** Task 3에서 다루지 않은 나머지 파일들의 모듈 최상위 `Dimensions.get('window')` — 아래 Step 1로 목록을 확정한다. 추가로:
- `src/screens/NaverBlogImportScreen.tsx:595` (`width: 390`)
- `src/screens/introVisuals.tsx:301` (`width: 367`)

**Interfaces:**
- Consumes: `stageWidthNow()` (Task 1)
- Produces: 없음

- [ ] **Step 1: 대상 목록을 뽑는다**

Run:
```bash
grep -rn "^\(const\|let\)\s.*Dimensions\.get(" src --include=*.tsx --include=*.ts
```
Expected: Task 3에서 처리한 11개 파일은 사라지고 나머지만 남는다(약 23개 파일). 이 목록을 그대로 대상으로 삼는다.

- [ ] **Step 2: 치환한다**

`.width`를 읽는 경우:

```tsx
// before
const { width: SCREEN_W } = Dimensions.get('window');
// after
import { stageWidthNow } from '../utils/stage';
const SCREEN_W = stageWidthNow();
```

**`.height`는 clamp하지 않는다.** Stage는 가로 폭만 제한한다 — 세로는 어떤 기기든 그대로 써야 한다.

```tsx
// before
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
// after
const SCREEN_W = stageWidthNow();
const SCREEN_H = Dimensions.get('window').height;
```

- [ ] **Step 3: 고정 폭 2건을 고친다**

`src/screens/NaverBlogImportScreen.tsx:595` — `width: 390` → `width: '100%', maxWidth: 390`
`src/screens/introVisuals.tsx:301` — `width: 367` → `width: '100%', maxWidth: 367`

360dp 기기에서 넘치던 것이 해소된다.

- [ ] **Step 4: 가드에 규칙 3을 추가한다**

```js
// ── 규칙 3: src 전역에 모듈 최상위 Dimensions 폭 상수가 없다 ──
// 새 화면을 만들 때 Dimensions.get('window').width를 다시 쓰면 폴드에서 어긋난다.
// 세로(.height)는 clamp 대상이 아니므로 허용한다.
const ALLOW_FROZEN = new Set([
  'src/components/MainCoachmark.tsx', // 초기값일 뿐, onLayout으로 갱신됨(136행)
]);
for (const f of collect('src', '.tsx').concat(collect('src', '.ts'))) {
  const p = rel(f);
  if (ALLOW_FROZEN.has(p)) continue;
  const bad = readFileSync(f, 'utf8').split('\n').filter(
    (l) => /^(const|let)\s.*Dimensions\.get\(/.test(l) && /width/.test(l),
  );
  check(bad.length === 0, `${p} 모듈 최상위 폭 상수 없음`);
}

// ── 규칙 4: 320dp를 넘는 고정 폭이 없다 ──
// 360dp 기기에서 가로로 넘친다.
for (const f of collect('src', '.tsx')) {
  const over = [...readFileSync(f, 'utf8').matchAll(/(?<!max)[Ww]idth:\s*(\d{3,})/g)]
    .filter((m) => Number(m[1]) > 320);
  check(over.length === 0, `${rel(f)} 320dp 초과 고정 폭 없음`);
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npm test`
Expected: PASS. 규칙 4가 예상 밖 파일을 잡으면 **가드를 느슨하게 만들지 말고** 그 파일도 `'100%' + maxWidth`로 고친다.

- [ ] **Step 6: 타입·린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 0건

- [ ] **Step 7: 커밋**

```bash
git add src scripts/layout-parity.verify.mjs
git commit -m "fix(layout): 잔여 폭 상수 Stage 치환 + 360dp 오버플로우 2건 해소"
```

---

## Task 5: 바텀시트 36곳 클램프

**Files (Modify):** `justifyContent: 'flex-end'`로 정의된 시트를 가진 파일들 — Step 1로 확정한다.

**Interfaces:**
- Consumes: `STAGE_MAX_W` (Task 1)
- Produces: 없음

- [ ] **Step 1: 대상을 뽑고 눈으로 분류한다**

Run:
```bash
grep -rn "justifyContent: 'flex-end'" src --include=*.tsx
```

각 결과에 대해 **그 스타일이 딤 배경인지 시트 본체인지** 판단한다. 판별법:

- **딤 배경** — `flex: 1`을 함께 갖고, 배경색이 `rgba(0,0,0,…)` 계열. **손대지 않는다.**
- **시트 본체** — 배경색이 카드색(`#2E2E3B` 등), `borderTopLeftRadius`를 가짐. **여기에만 추가한다.**

배경까지 클램프하면 폴드에서 양옆이 안 어두워진다. 이 판단은 자동화하지 않는다.

- [ ] **Step 2: 시트 본체에 세 속성을 추가한다**

```tsx
// 시트 본체 스타일에 추가:
width: '100%',
maxWidth: STAGE_MAX_W,
alignSelf: 'center',
```

각 파일에 `import { STAGE_MAX_W } from '…/utils/stage';`를 추가한다.

`StyleSheet.create` 안이라도 `STAGE_MAX_W`는 상수이므로 그대로 쓸 수 있다 — Task 3의 `useMemo` 처리가 필요 없다.

- [ ] **Step 3: 전수 diff 검토**

Run: `git diff`
확인할 것 — 8/3 코드모드 때 오주입 여부를 사람 눈으로만 봤던 전례가 있으므로 이번엔 명시적 단계로 둔다:

1. 딤 배경에 `maxWidth`가 들어간 곳이 **없어야** 한다
2. `flex: 1`을 가진 스타일에 `maxWidth`가 들어간 곳이 **없어야** 한다
3. 추가된 줄이 전부 시트 본체인지 스타일 이름으로 재확인 (`sheet`, `panel`, `card` 등)

- [ ] **Step 4: 가드에 규칙 5를 추가한다**

```js
// ── 규칙 5: 딤 배경에 maxWidth가 섞이지 않았다 ──
// flex:1과 maxWidth: STAGE_MAX_W가 같은 스타일 객체에 있으면 배경을 클램프한 것이다.
// 그러면 폴드에서 시트 양옆이 어두워지지 않는다.
for (const f of collect('src', '.tsx')) {
  const src = readFileSync(f, 'utf8');
  // 스타일 객체 하나를 { … } 단위로 훑는다
  const objs = src.match(/\{[^{}]*\}/g) || [];
  const bad = objs.filter((o) => /flex:\s*1/.test(o) && /maxWidth:\s*STAGE_MAX_W/.test(o));
  check(bad.length === 0, `${rel(f)} 딤 배경 클램프 없음`);
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add src scripts/layout-parity.verify.mjs
git commit -m "fix(layout): 바텀시트 Stage 클램프 — 딤 배경은 전체 폭 유지"
```

---

## Task 6: 글꼴 배율 상한

**Files:**
- Create: `src/ui/Text.tsx`
- Modify: `src/utils/fitText.ts:11`
- Modify: `eslint.config.js`
- Modify: `<Text>`/`<TextInput>`을 쓰는 93개 파일의 import 구문

**Interfaces:**
- Consumes: 없음
- Produces:
  - `MAX_FONT_SCALE: 1.2` (`src/ui/Text.tsx`)
  - `Text`, `TextInput` (`src/ui/Text.tsx`) — RN 동일 props + `maxFontSizeMultiplier` 기본값

- [ ] **Step 1: 가드에 규칙 6을 추가한다**

```js
// ── 규칙 6: react-native에서 Text/TextInput을 직접 import하지 않는다 ──
// React 19에서 함수형 컴포넌트의 defaultProps가 제거돼 전역 주입 트릭을 쓸 수 없다.
// 래퍼를 우회해 직접 import하면 그 화면만 글꼴 배율 상한이 빠져 배치가 무너진다.
for (const f of collect('src', '.tsx')) {
  const p = rel(f);
  if (p === 'src/ui/Text.tsx') continue; // 래퍼 자신은 예외
  const src = readFileSync(f, 'utf8');
  const rnImports = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'react-native'/g)];
  const direct = rnImports.filter((m) => /\b(Text|TextInput)\b/.test(m[1]));
  check(direct.length === 0, `${p} react-native에서 Text 직접 import 없음`);
}

// ── 규칙 7: 글꼴 배율 상한이 한 곳에서만 정의된다 ──
const ui = readFileSync('src/ui/Text.tsx', 'utf8');
check(/MAX_FONT_SCALE = 1\.2/.test(ui), 'MAX_FONT_SCALE === 1.2');
check(
  !/maxFontSizeMultiplier:\s*1\.2/.test(readFileSync('src/utils/fitText.ts', 'utf8')),
  'fitText.ts가 1.2를 하드코딩하지 않는다',
);
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test`
Expected: FAIL — 93개 파일 대부분에서 `✗ … Text 직접 import 없음`, `src/ui/Text.tsx` 없음 오류

- [ ] **Step 3: 래퍼를 만든다**

`src/ui/Text.tsx`:

```tsx
import React from 'react';
import { Text as RNText, TextInput as RNTextInput } from 'react-native';
import type { TextProps, TextInputProps } from 'react-native';

/**
 * 시스템 글꼴 배율 상한.
 *
 * React 19에서 함수형 컴포넌트의 defaultProps가 제거되어
 * `Text.defaultProps = { maxFontSizeMultiplier }` 전역 주입이 동작하지 않는다.
 * 그래서 래퍼를 두고 import 출처를 바꾼다(eslint no-restricted-imports로 강제).
 *
 * 값 1.2는 utils/fitText.ts의 andFitText와 같은 기준이다.
 *
 * ⚠️ 이 상한은 iOS에도 적용된다 — 목표가 "두 플랫폼이 다르지 않게"인데 Android만
 * 자르면 사용자가 배율을 올렸을 때 오히려 갈라지기 때문이다. 대가로 iOS Dynamic Type이
 * 120%에서 멈춘다. iOS를 원래대로 되돌리려면 아래 한 줄을 바꾼다:
 *   const CAP = Platform.OS === 'android' ? MAX_FONT_SCALE : undefined;
 * 그리고 두 컴포넌트의 maxFontSizeMultiplier에 CAP을 넘긴다.
 */
export const MAX_FONT_SCALE = 1.2;

// props를 뒤에 펼쳐 개별 화면이 필요하면 상한을 덮어쓸 수 있게 한다.
export const Text = React.forwardRef<React.ComponentRef<typeof RNText>, TextProps>(
  (props, ref) => <RNText ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />,
);
Text.displayName = 'Text';

export const TextInput = React.forwardRef<React.ComponentRef<typeof RNTextInput>, TextInputProps>(
  (props, ref) => <RNTextInput ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />,
);
TextInput.displayName = 'TextInput';
```

`forwardRef`가 필요한 이유: `TextInput`은 `.focus()`/`.blur()`를 ref로 호출하는 화면이 있다. ref를 흘리지 않으면 그 화면들이 조용히 깨진다.

- [ ] **Step 4: `fitText.ts`가 상수를 참조하게 한다**

`src/utils/fitText.ts`:

```ts
import { Platform } from 'react-native';
import { MAX_FONT_SCALE } from '../ui/Text';
```

11행의 `maxFontSizeMultiplier: 1.2` → `maxFontSizeMultiplier: MAX_FONT_SCALE`.
`as const`가 붙어 있으므로 타입 오류가 나면 `as const`를 유지한 채 값만 바꾼다.

- [ ] **Step 5: 코드모드로 93개 파일 import를 교체한다**

스크래치패드에 `fix-text-imports.mjs`로 저장해 실행한다(저장소에 커밋하지 않는다 — 계획서에 전문이 있으므로 재현 가능):

```js
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';

const ROOT = process.argv[2];
const SKIP = new Set(['node_modules', 'geo-tmp', 'tmp-frames', 'intro1']);
const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    if (SKIP.has(n)) continue;
    const f = join(d, n);
    statSync(f).isDirectory() ? walk(f) : n.endsWith('.tsx') && files.push(f);
  }
})(join(ROOT, 'src'));

const WRAPPER = join(ROOT, 'src', 'ui', 'Text.tsx');
let changed = 0;

for (const file of files) {
  if (file === WRAPPER) continue;
  let src = readFileSync(file, 'utf8');
  const m = src.match(/import\s*\{([^}]*)\}\s*from\s*'react-native';/);
  if (!m) continue;

  const names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
  const moved = names.filter((n) => n === 'Text' || n === 'TextInput');
  if (moved.length === 0) continue;

  const kept = names.filter((n) => !moved.includes(n));

  // 파일 깊이에 맞춘 상대 경로 (Windows 구분자를 '/'로 정규화)
  let rel = relative(dirname(file), join(ROOT, 'src', 'ui', 'Text')).split(sep).join('/');
  if (!rel.startsWith('.')) rel = './' + rel;

  const rnLine = kept.length ? `import { ${kept.join(', ')} } from 'react-native';\n` : '';
  src = src.replace(m[0] + '\n', rnLine + `import { ${moved.join(', ')} } from '${rel}';\n`);
  writeFileSync(file, src, 'utf8');
  changed++;
}
console.log(`${changed}개 파일 변경`);
```

Run: `node <스크래치패드>/fix-text-imports.mjs "C:/Users/2023user/OneDrive/바탕 화면/eOrth"`
Expected: `93개 파일 변경` 내외

**한계 두 가지 — 코드모드 후 직접 확인할 것:**
1. `import { Text } from 'react-native'`가 여러 줄에 걸쳐 있으면 정규식이 놓친다
2. `import RN from 'react-native'` 후 `RN.Text`로 쓰는 형태는 잡지 못한다

Run: `npm test` — 규칙 6이 놓친 파일을 이름으로 알려준다. 남은 것은 손으로 고친다.

- [ ] **Step 6: eslint 가드를 추가한다**

`eslint.config.js`의 `rules` 블록(19~22행)에 추가:

```js
rules: {
  'react/no-unescaped-entities': 'off',
  // 글꼴 배율 상한을 우회하지 못하게 한다. React 19에서 defaultProps가 제거돼
  // 전역 주입이 불가능하므로, import 출처를 강제하는 것이 유일한 방어선이다.
  'no-restricted-imports': ['error', {
    paths: [{
      name: 'react-native',
      importNames: ['Text', 'TextInput'],
      message: "Text/TextInput은 'src/ui/Text'에서 import하세요 (글꼴 배율 상한 1.2 적용).",
    }],
  }],
},
```

`src/ui/Text.tsx` 자신은 예외가 필요하므로 config 배열 끝에 덧붙인다:

```js
{
  files: ['src/ui/Text.tsx'],
  rules: { 'no-restricted-imports': 'off' },
},
```

- [ ] **Step 7: 전부 통과시킨다**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: 전부 0 오류.

타입 오류가 나기 쉬운 지점 — `Text`에 RN 전용 props(`onTextLayout` 등)를 쓰는 화면. `TextProps`를 그대로 쓰므로 통과해야 하지만, 실패하면 래퍼의 props 타입을 `React.ComponentProps<typeof RNText>`로 바꾼다.

- [ ] **Step 8: 커밋**

```bash
git add src/ui/Text.tsx src/utils/fitText.ts eslint.config.js src scripts/layout-parity.verify.mjs
git commit -m "fix(a11y): 글꼴 배율 상한 1.2 전역 적용 — React 19 defaultProps 제거 대응"
```

---

## Task 7: 키보드 가림 5곳

`statusBarTranslucent`가 안드로이드 Modal의 `adjustResize`를 끄기 때문에, KeyboardAvoidingView가 없는 입력 모달에서 키보드가 입력창을 가린다.

**Files (Modify):**
- `src/screens/MainScreen.tsx` — 국가시트(1676 부근), 지역태깅(1553 부근)
- `src/screens/TripRecordScreen.tsx` — 섹션이름(670 부근)
- `src/screens/BlogRecordScreen.tsx` — PickerModal
- `src/components/record/CurrencyPickerModal.tsx`

행 번호는 8/3 감사 시점 기준이므로 **착수 시 재확인한다.**

**Interfaces:**
- Consumes: 없음
- Produces: 없음

- [ ] **Step 1: 실제 위치를 재확인한다**

Run:
```bash
grep -n "statusBarTranslucent" src/screens/MainScreen.tsx src/screens/TripRecordScreen.tsx \
  src/screens/BlogRecordScreen.tsx src/components/record/CurrencyPickerModal.tsx
```

각 Modal 안에 `TextInput`이 있는지, `KeyboardAvoidingView`가 이미 있는지 확인한다. 이미 있으면 **그 곳은 건너뛴다.**

- [ ] **Step 2: 기존 패턴을 따라 KAV를 추가한다**

이 저장소는 `TripRecordScreen.tsx:552`에 확립된 패턴이 있다 — 그대로 따른다:

```tsx
<KeyboardAvoidingView
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  style={{ flex: 1, justifyContent: 'flex-end' }}
>
  {/* 시트 본체 */}
</KeyboardAvoidingView>
```

시트 하단 패딩도 같은 패턴으로:

```tsx
paddingBottom: keyboardVisible ? 8 : insets.bottom + 8,
```

- [ ] **Step 3: 타입·린트·테스트**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: 전부 0 오류. Task 5의 규칙 5(딤 배경 클램프 금지)가 KAV 추가로 깨지지 않는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/screens/MainScreen.tsx src/screens/TripRecordScreen.tsx \
  src/screens/BlogRecordScreen.tsx src/components/record/CurrencyPickerModal.tsx
git commit -m "fix(android): 입력 모달 키보드 가림 5곳 — statusBarTranslucent adjustResize 회피"
```

---

## Task 8: 에뮬레이터 4종 검증

**Files:** 없음 (검증 전용)

**Interfaces:**
- Consumes: Task 1~7 전부
- Produces: 검증 결과 기록

- [ ] **Step 1: 자동 검사 전체를 돌린다**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: 전부 0 오류

- [ ] **Step 2: 에뮬레이터 프로파일 4종을 준비한다**

이 PC에서는 **ANGLE 렌더러 + wipe-data**가 필요하다.

| 프로파일 | 해상도 / 밀도 | 결과 폭 |
|---|---|---|
| 저가 폰 | 1080×2340 / 480dpi | 360dp |
| 플래그십 | 1440×3120 / 560dpi | 411dp |
| 폴드 | 접음 1080×2316 / 420dpi ↔ 펼침 1812×2176 / 380dpi | 411 ↔ 763dp |
| 태블릿 | 1600×2560 / 320dpi | 800dp |

폴드 프로파일이 없으면 실행 중에 만든다:
```bash
adb shell wm size 1812x2176 && adb shell wm density 380   # 펼침 재현
adb shell wm size reset && adb shell wm density reset      # 원복
```

- [ ] **Step 3: 화면별 스크린샷을 뽑는다**

```bash
adb exec-out screencap -p > shot.png
```

확인 화면: 피드(SocialScreen), 게시물 상세(사진 페이저), 사진 뷰어, 미디어 피커,
프로필, 기록 작성 시트, 탭 바.

- [ ] **Step 4: 프로파일별 판정 기준**

| 프로파일 | 통과 조건 |
|---|---|
| 360dp | 가로 스크롤·잘림 없음, 한글 라벨 줄바꿈 없음 |
| 411dp | **작업 전과 픽셀 단위로 동일** — 다르면 회귀다 |
| 폴드 접음→펼침 | 콘텐츠가 480dp 중앙 컬럼, 양옆 `#0A0A0F`. **앱을 끄지 않고 펼쳐서** 사진 뷰어·페이저·미디어 피커가 즉시 재배치되는지 |
| 태블릿 | 480dp 중앙 컬럼, 탭 바 폭이 콘텐츠와 일치 |

411dp 회귀 검사를 위해 **작업 시작 전 스크린샷을 먼저 찍어둔다.** 지금 없다면 `git stash` 후 촬영한다.

- [ ] **Step 5: 글꼴 배율을 확인한다**

```bash
adb shell settings put system font_scale 1.3
adb shell wm density 480        # 삼성 "화면 크게 보기" 재현
# 확인 후 원복
adb shell settings put system font_scale 1.0
adb shell wm density reset
```
Expected: 글자가 120%에서 멈추고 라벨이 두 줄로 넘어가지 않는다.

- [ ] **Step 6: 실기기 항목을 분리해 기록한다**

**에뮬레이터로 판정하지 않는다:** `GlobeView`·WebView 화면, 대면적 블러 화면
(`StatsScreen`, `ProfileVisuals`). 에뮬레이터에서 느려 판단이 불가능하다.

이 항목들은 **"미검증"으로 명시해 남긴다.** 에뮬레이터 결과만으로 "검증 완료"라고 적지 않는다.

- [ ] **Step 7: 결과를 커밋한다**

검증 결과를 `docs/superpowers/plans/2026-08-10-android-layout-parity.md` 하단에
"검증 결과" 절로 추가한다 — 프로파일별 통과/실패, 미검증 항목, 발견된 문제.

```bash
git add docs/superpowers/plans/2026-08-10-android-layout-parity.md
git commit -m "docs(plan): 배치 파리티 에뮬레이터 검증 결과 기록"
```

---

## 범위 밖 (건드리지 않는다)

- 색감·성능 항목: 컬러 `shadowColor` 22곳, 대면적 `dimezisBlurView` 9곳, 그라데이션 밴딩,
  `useNativeDriver:false` 25곳, RN Image→expo-image
- 태블릿 적응형 레이아웃(2열 피드 등) — 요구가 "iOS와 다르지 않게"이므로 재구성은 요구에 반한다
- `src/components/MainCoachmark.tsx` — 이미 `onLayout`으로 자가 치유
- `src/components/CameraCaptureModal.tsx` — 모듈 상수가 없으면 수정하지 않는다
