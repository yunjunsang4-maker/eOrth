# 튜토리얼 시작 딜레이 제거 · 전환 렉 계측 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 튜토리얼 등장 전 약 750ms의 빈 대기를 없애고, 단계 전환 렉의 원인을 숫자로 특정할 수 있는 계측을 심는다.

**Architecture:** 세 화면(메인·통계·프로필)에 복붙돼 있는 `setTimeout(450ms) → 측정` 패턴을 `InteractionManager.runAfterInteractions() → 프레임 단위 측정 재시도`로 교체하고, 그 로직을 `coachStart.ts` 하나로 합친다. 판정 로직(`isValidRect`)은 플랫폼 의존이 없는 별도 파일로 떼어 `npm test`로 검증한다. 계측은 `perfTrace.ts`(개발 빌드 전용, 릴리스에서 no-op)가 담당하며 화면과 `MainCoachmark`이 호출한다.

**Tech Stack:** React Native (Expo SDK 54), TypeScript, `InteractionManager` / `requestAnimationFrame`, 검증은 jest 없이 `*.verify.ts` + `npm test`(tsx).

**설계 문서:** `docs/superpowers/specs/2026-07-26-tutorial-startup-delay-and-trace-design.md`

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `src/utils/coachRect.ts` (신규) | 측정값 유효성 판정. **순수 함수만**, import 없음 |
| `src/utils/coachRect.verify.ts` (신규) | 위 판정 검증 |
| `src/utils/coachStart.ts` (신규) | 준비 대기 + 측정 재시도. `react-native` 의존 |
| `src/utils/perfTrace.ts` (신규) | 구간 시간 로그. 개발 빌드 전용 |
| `src/screens/MainScreen.tsx` (수정) | 고정 지연 제거, 공용 유틸 사용, 트레이스 호출 |
| `src/screens/StatsScreen.tsx` (수정) | 동일 |
| `src/screens/ProfileScreen.tsx` (수정) | 동일 |
| `src/components/MainCoachmark.tsx` (수정) | 전환 트레이스, 등장 페이드 260→200ms |

**설계 문서와의 차이 1건**: 스펙은 `isValidRect`를 `coachStart.ts`에 두었으나, 이 계획은 `coachRect.ts`로 분리한다. 이유는 `npm test`(`scripts/run-verify.mjs`)가 `*.verify.ts`를 **node에서 tsx로** 실행하기 때문이다. `react-native`를 import하는 모듈은 node에서 실행되지 않는다(Flow 문법). 실제로 기존 검증 대상 유틸(`scanSampling.ts`, `importPhotoStore.ts` 등)은 모두 상단 import가 하나도 없다. 따라서 순수 판정과 플랫폼 의존 코드를 파일로 가른다. `coachStart.ts`가 `isValidRect`를 re-export하므로 호출부는 한 곳만 보면 된다.

---

### Task 1: 계측 유틸 `perfTrace.ts`

**Files:**
- Create: `src/utils/perfTrace.ts`

**단위 테스트를 만들지 않는 이유**: 이 모듈의 동작 전부가 `console.log` 출력이다. 순수 계산은 `t - last` 뺄셈 하나뿐이라 테스트가 검증할 대상이 없다. 동작 확인은 Task 8의 기기 실측에서 실제 로그가 찍히는 것으로 갈음한다.

- [ ] **Step 1: `src/utils/perfTrace.ts` 작성**

```ts
// 개발 중 구간 시간 계측 — 릴리스 빌드에서는 전부 no-op이다.
//
// 왜 필요한가: 튜토리얼 렉을 네 차례 '추정'으로 고쳤고 그중 두 번이 빗나갔다.
// 어디서 시간이 가는지 숫자로 본 뒤에 고치기 위한 최소 도구다.
//
// 사용법:
//   traceStart('coach:main');
//   traceStep('coach:main', 'measured');   // [perf] coach:main · measured +312ms (총 312ms)
//   traceEnd('coach:main', 'visible');     // [perf] coach:main · visible +18ms (총 330ms) ─ 끝
//
// 릴리스 빌드에서 한 번 재보고 싶으면 아래 TRACE_ENABLED를 true로 바꿔 빌드한다.
// (기본값 __DEV__ 로 커밋할 것 — 릴리스에 로그가 남으면 안 된다)
const TRACE_ENABLED = __DEV__;

type Group = { start: number; last: number };
const groups = new Map<string, Group>();

/** 그룹의 기준점을 잡는다. 같은 이름으로 다시 부르면 기준점이 재설정된다. */
export function traceStart(group: string): void {
  if (!TRACE_ENABLED) return;
  const t = Date.now();
  groups.set(group, { start: t, last: t });
}

/** 직전 지점부터의 경과와 그룹 시작부터의 총합을 찍는다. */
export function traceStep(group: string, label: string): void {
  if (!TRACE_ENABLED) return;
  const g = groups.get(group);
  if (!g) return; // traceStart 없이 호출된 경우(예: 첫 렌더) 조용히 무시한다
  const t = Date.now();
  console.log(`[perf] ${group} · ${label} +${t - g.last}ms (총 ${t - g.start}ms)`);
  g.last = t;
}

/** 마지막 지점을 찍고 그룹을 정리한다. */
export function traceEnd(group: string, label: string): void {
  if (!TRACE_ENABLED) return;
  const g = groups.get(group);
  if (!g) return;
  const t = Date.now();
  console.log(`[perf] ${group} · ${label} +${t - g.last}ms (총 ${t - g.start}ms) ─ 끝`);
  groups.delete(group);
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 없이 종료(종료코드 0). `__DEV__`는 react-native 타입이 전역으로 선언하며 코드베이스에서 이미 쓰인다(`src/services/supabase.ts:45` 등).

- [ ] **Step 3: 커밋**

```bash
git add src/utils/perfTrace.ts
git commit -m "feat(perf): 개발 전용 구간 시간 계측 유틸 추가"
```

---

### Task 2: 측정값 판정 `coachRect.ts` (TDD)

**Files:**
- Create: `src/utils/coachRect.verify.ts`
- Create: `src/utils/coachRect.ts`

- [ ] **Step 1: 실패하는 테스트 작성 — `src/utils/coachRect.verify.ts`**

```ts
// 코치마크 측정값 판정 검증 (jest 미사용). 실행: npx tsx src/utils/coachRect.verify.ts
import { isValidRect } from './coachRect';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}

// ── 정상 값 ──
{
  assert(isValidRect({ x: 10, y: 20, width: 60, height: 60 }) === true, '정상 rect는 유효');
  assert(isValidRect({ x: 0, y: 0, width: 1, height: 1 }) === true, '원점 1x1도 유효');
  assert(isValidRect({ x: -30, y: -120, width: 100, height: 40 }) === true,
    '음수 좌표는 유효 — 스크롤로 화면 위로 밀린 요소의 정상 값');
  assert(isValidRect({ x: 0.5, y: 12.75, width: 60.25, height: 60.25 }) === true, '소수 좌표 유효');
}

// ── 레이아웃 전(0 크기) ──
{
  assert(isValidRect({ x: 0, y: 0, width: 0, height: 0 }) === false, '0x0은 무효(레이아웃 전)');
  assert(isValidRect({ x: 10, y: 10, width: 0, height: 50 }) === false, '폭 0은 무효');
  assert(isValidRect({ x: 10, y: 10, width: 50, height: 0 }) === false, '높이 0은 무효');
  assert(isValidRect({ x: 10, y: 10, width: -5, height: 50 }) === false, '음수 폭은 무효');
  assert(isValidRect({ x: 10, y: 10, width: 50, height: -5 }) === false, '음수 높이는 무효');
}

// ── 비정상 수치 ──
{
  assert(isValidRect({ x: NaN, y: 0, width: 10, height: 10 }) === false, 'NaN은 무효');
  assert(isValidRect({ x: 0, y: NaN, width: 10, height: 10 }) === false, 'y가 NaN이어도 무효');
  assert(isValidRect({ x: 0, y: 0, width: Infinity, height: 10 }) === false, 'Infinity는 무효');
  assert(isValidRect({ x: -Infinity, y: 0, width: 10, height: 10 }) === false, '-Infinity는 무효');
  assert(isValidRect({ x: '10', y: 0, width: 10, height: 10 }) === false, '문자열 좌표는 무효');
}

// ── 구조 자체가 없는 경우 ──
{
  assert(isValidRect(null) === false, 'null 안전');
  assert(isValidRect(undefined) === false, 'undefined 안전');
  assert(isValidRect({}) === false, '빈 객체는 무효');
  assert(isValidRect({ x: 0, y: 0, width: 10 }) === false, '필드 누락은 무효');
  assert(isValidRect(42) === false, '숫자 인자 안전');
  assert(isValidRect('rect') === false, '문자열 인자 안전');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인**

Run: `npx tsx src/utils/coachRect.verify.ts`
Expected: FAIL — `Cannot find module './coachRect'` (아직 구현 파일이 없다)

- [ ] **Step 3: 최소 구현 — `src/utils/coachRect.ts`**

```ts
// 코치마크(튜토리얼) 강조 요소의 측정값 판정 — 순수 함수만 둔다.
//
// ⚠️ 이 파일은 import를 두지 않는다. npm test(scripts/run-verify.mjs)가 *.verify.ts를
//    node에서 tsx로 실행하는데, react-native를 import하면 node에서 실행되지 않는다.
//    플랫폼에 의존하는 측정 로직은 coachStart.ts에 있다.

export interface CoachRectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * measureInWindow 결과가 쓸 수 있는 값인지 판정한다.
 *
 * 폭·높이 0은 '아직 레이아웃 전'이라는 뜻이므로 무효로 본다.
 * (기존 세 화면의 측정 헬퍼는 NaN만 걸러내고 0을 통과시켰다. 레이아웃 전에 측정되면
 *  스포트라이트가 화면 좌상단에 점으로 찍힌다.)
 *
 * 좌표의 부호는 따지지 않는다 — 스크롤로 화면 위로 밀린 요소는 정상적으로 음수 y를 갖는다.
 */
export function isValidRect(r: unknown): r is CoachRectLike {
  if (!r || typeof r !== 'object') return false;
  const { x, y, width, height } = r as Record<string, unknown>;
  if (![x, y, width, height].every((v) => typeof v === 'number' && Number.isFinite(v))) return false;
  return (width as number) > 0 && (height as number) > 0;
}
```

- [ ] **Step 4: 테스트를 돌려 통과를 확인**

Run: `npx tsx src/utils/coachRect.verify.ts`
Expected: 모든 줄에 `✓`, 마지막 줄 `ALL PASS`, 종료코드 0

Run: `npm test`
Expected: 기존 14개 verify 파일 + 신규 1개가 모두 통과

- [ ] **Step 5: 커밋**

```bash
git add src/utils/coachRect.ts src/utils/coachRect.verify.ts
git commit -m "feat(coachmark): 측정값 유효성 판정 분리 + 검증

폭·높이 0을 무효로 본다 — 기존 세 화면의 측정 헬퍼는 NaN만 걸러내고
0을 통과시켜, 레이아웃 전에 측정되면 스포트라이트가 좌상단에 점으로 찍혔다."
```

---

### Task 3: 준비 대기 + 측정 재시도 `coachStart.ts`

**Files:**
- Create: `src/utils/coachStart.ts`

**단위 테스트가 없는 이유**: 두 함수 모두 플랫폼 API(`InteractionManager`, `requestAnimationFrame`, 네이티브 `measureInWindow`)에 전적으로 의존한다. node에서 실행할 수 없고, 목으로 대체하면 목의 동작을 검증하는 셈이 된다. 판정 로직은 Task 2에서 이미 검증했고, 나머지는 Task 8의 기기 점검으로 확인한다.

- [ ] **Step 1: `src/utils/coachStart.ts` 작성**

```ts
import type { MutableRefObject } from 'react';
import { InteractionManager } from 'react-native';
import { isValidRect } from './coachRect';
import type { CoachRect } from '../components/MainCoachmark';

// 튜토리얼(코치마크) 시작 시 강조 요소를 측정하는 공용 유틸.
// 메인·통계·프로필 세 화면이 각자 복붙해 쓰던 로직을 하나로 합쳤다.

export { isValidRect };

/**
 * 화면 전환 애니메이션이 끝난 뒤로 미룬다.
 *
 * 기존 코드의 setTimeout(450ms)가 하려던 일이 바로 이것이다 — 전환 중에 측정하면
 * 이동 중인 좌표가 잡힌다. 고정 시간 대신 실제 신호를 기다리면 빠른 기기에서는
 * 수십 ms로 끝나고, 느린 기기에서도 필요한 만큼만 기다린다.
 */
export function whenReadyToMeasure(): Promise<void> {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve());
  });
}

// 재시도 상한. 60fps 기준 약 330ms — 이보다 오래 0×0이면 그 요소는 화면에 없다고 본다.
const MAX_FRAMES = 20;

/**
 * 유효한 값이 나올 때까지 프레임마다 measureInWindow를 다시 시도한다.
 * 유효해지는 즉시 반환하고, 상한까지 얻지 못하면 null을 반환한다.
 *
 * null이어도 호출부는 진행해야 한다 — 해당 단계의 스포트라이트만 생략되고
 * 튜토리얼 자체는 뜬다.
 */
export function measureWithRetry(
  ref: MutableRefObject<any>,
  maxFrames: number = MAX_FRAMES,
): Promise<CoachRect | null> {
  return new Promise((resolve) => {
    let left = maxFrames;
    const attempt = () => {
      const node = ref.current;
      if (!node || typeof node.measureInWindow !== 'function') {
        // 노드가 아직 안 붙었을 수 있으니 남은 프레임 동안은 기다려 본다
        if (left-- > 0) requestAnimationFrame(attempt);
        else resolve(null);
        return;
      }
      node.measureInWindow((x: number, y: number, width: number, height: number) => {
        const r = { x, y, width, height };
        if (isValidRect(r)) resolve(r);
        else if (left-- > 0) requestAnimationFrame(attempt);
        else resolve(null);
      });
    };
    attempt();
  });
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 없이 종료

- [ ] **Step 3: 커밋**

```bash
git add src/utils/coachStart.ts
git commit -m "feat(coachmark): 준비 대기·측정 재시도 공용 유틸 추가"
```

---

### Task 4: 메인 화면 적용

**Files:**
- Modify: `src/screens/MainScreen.tsx` (측정 헬퍼 `378-388`, `startCoach` `393-474`)

- [ ] **Step 1: import 추가**

`src/screens/MainScreen.tsx:47` 의 `import MainCoachmark, { CoachStep, CoachRect } from '../components/MainCoachmark';` **바로 아래**에 두 줄을 추가한다.

```tsx
import { whenReadyToMeasure, measureWithRetry } from '../utils/coachStart';
import { traceStart, traceStep, traceEnd } from '../utils/perfTrace';
```

- [ ] **Step 2: 중복 측정 헬퍼 삭제**

다음 블록(`src/screens/MainScreen.tsx:378-388`)을 **통째로 삭제**한다. `coachStart.measureWithRetry`가 대체한다.

```tsx
  const measure = (ref: React.MutableRefObject<any>) =>
    new Promise<CoachRect | null>((resolve) => {
      const node = ref.current;
      if (!node || typeof node.measureInWindow !== 'function') return resolve(null);
      node.measureInWindow((x: number, y: number, width: number, height: number) => {
        if ([x, y, width, height].some((v) => typeof v !== 'number' || Number.isNaN(v))) {
          resolve(null);
        } else {
          resolve({ x, y, width, height });
        }
      });
    });
```

- [ ] **Step 3: 고정 지연을 준비 신호로 교체**

`startCoach` 안에서 `const timer = setTimeout(async () => {` 로 시작하는 줄부터 측정 블록까지를 바꾼다.

**변경 전:**

```tsx
    const timer = setTimeout(async () => {
      const [globe, toggle, settings, snapMeasured] = await Promise.all([
        measure(globeRef),
        measure(toggleRef),
        measure(settingsRef),
        measure(snapAnchorRef), // 숨김 앵커 → 스냅 버튼 실제 위치
      ]);
      if (cancelled) return;
```

**변경 후:**

```tsx
    (async () => {
      traceStart('coach:main');
      // 고정 지연(구 450ms) 대신 화면 전환이 실제로 끝나는 신호를 기다린다.
      await whenReadyToMeasure();
      if (cancelled) return;
      traceStep('coach:main', 'waited');
      const [globe, toggle, settings, snapMeasured] = await Promise.all([
        measureWithRetry(globeRef),
        measureWithRetry(toggleRef),
        measureWithRetry(settingsRef),
        measureWithRetry(snapAnchorRef), // 숨김 앵커 → 스냅 버튼 실제 위치
      ]);
      if (cancelled) return;
      traceStep('coach:main', 'measured');
```

- [ ] **Step 4: 종료부와 cleanup 교체**

**변경 전** (`setCoachVisible(true);` 부터 `startCoach` 끝까지):

```tsx
      setCoachVisible(true);
      shown = true;
      // 계정당 1회 기록 — 설정 컨텍스트를 구독하는 모든 탭 화면이 리렌더되므로,
      // 오버레이 등장 애니메이션이 끝난 뒤로 미뤄 등장 프레임에 커밋이 겹치지 않게 한다.
      setTimeout(() => markTutorialSeen('main'), 900);
      // 재진입(탭 전환 후 복귀) 시 다시 뜨지 않도록 플래그 제거
      if (route.params?.startTutorial) navigation.setParams({ startTutorial: undefined });
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      // 띄우기 전에 취소됐다면(탭 전환 등) 다음 진입에서 다시 시도할 수 있게 되돌린다
      if (!shown) coachRunRef.current = false;
    };
  };
```

**변경 후:**

```tsx
      setCoachVisible(true);
      // 커밋·페인트가 끝난 다음 프레임에 찍어야 '등장까지 걸린 시간'이 된다
      requestAnimationFrame(() => traceEnd('coach:main', 'visible'));
      shown = true;
      // 계정당 1회 기록 — 설정 컨텍스트를 구독하는 모든 탭 화면이 리렌더되므로,
      // 오버레이 등장 애니메이션이 끝난 뒤로 미뤄 등장 프레임에 커밋이 겹치지 않게 한다.
      setTimeout(() => markTutorialSeen('main'), 900);
      // 재진입(탭 전환 후 복귀) 시 다시 뜨지 않도록 플래그 제거
      if (route.params?.startTutorial) navigation.setParams({ startTutorial: undefined });
    })();
    return () => {
      // 타이머가 사라졌으므로 취소는 이 플래그로만 한다. 각 await 뒤에서 확인한다.
      cancelled = true;
      // 띄우기 전에 취소됐다면(탭 전환 등) 다음 진입에서 다시 시도할 수 있게 되돌린다
      if (!shown) coachRunRef.current = false;
    };
  };
```

- [ ] **Step 5: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 없이 종료.

`CoachRect` import가 여전히 쓰이는지 확인한다 — `snap`·`fab` 상수 폴백에서 `const snap: CoachRect = ...` 로 쓰이므로 **남겨둔다**(`src/screens/MainScreen.tsx:410`, `421`).

- [ ] **Step 6: 커밋**

```bash
git add src/screens/MainScreen.tsx
git commit -m "perf(coachmark): 메인 튜토리얼 고정 450ms 지연 제거

전환 종료 신호(InteractionManager) + 프레임 단위 측정 재시도로 교체.
빠른 기기에서 1~2프레임이면 끝나고 느린 기기에서도 필요한 만큼만 기다린다."
```

---

### Task 5: 통계 화면 적용

**Files:**
- Modify: `src/screens/StatsScreen.tsx` (측정 헬퍼 `442-451`, 튜토리얼 포커스 효과 `455-487`)

- [ ] **Step 1: import 추가**

`src/screens/StatsScreen.tsx:24` 의 `import MainCoachmark, { CoachStep, CoachRect } from '../components/MainCoachmark';` **바로 아래**에 추가한다.

```tsx
import { whenReadyToMeasure, measureWithRetry } from '../utils/coachStart';
import { traceStart, traceStep, traceEnd } from '../utils/perfTrace';
```

- [ ] **Step 2: 중복 측정 헬퍼 삭제**

다음 블록(`src/screens/StatsScreen.tsx:442-451`)을 통째로 삭제한다.

```tsx
  const measure = (ref: React.MutableRefObject<any>) =>
    new Promise<CoachRect | null>((resolve) => {
      const node = ref.current;
      if (!node || typeof node.measureInWindow !== 'function') return resolve(null);
      node.measureInWindow((x: number, y: number, width: number, height: number) => {
        if ([x, y, width, height].some((v) => typeof v !== 'number' || Number.isNaN(v))) resolve(null);
        else resolve({ x, y, width, height });
      });
    });
```

- [ ] **Step 3: 고정 지연을 준비 신호로 교체**

**변경 전:**

```tsx
      const timer = setTimeout(async () => {
        if (cancelled) return;
        const hero = await measure(heroRef);
        if (cancelled) return;
```

**변경 후:**

```tsx
      (async () => {
        traceStart('coach:stats');
        // 고정 지연(구 450ms) 대신 화면 전환이 실제로 끝나는 신호를 기다린다.
        await whenReadyToMeasure();
        if (cancelled) return;
        traceStep('coach:stats', 'waited');
        const hero = await measureWithRetry(heroRef);
        if (cancelled) return;
        traceStep('coach:stats', 'measured');
```

- [ ] **Step 4: 종료부와 cleanup 교체**

**변경 전:**

```tsx
        setCoachVisible(true);
        // 등장 애니메이션과 설정 컨텍스트 연쇄 리렌더가 겹치지 않게 지연 기록
        setTimeout(() => markTutorialSeen('stats'), 900);
      }, 450);
      return () => {
        cancelled = true;
        clearTimeout(timer);
        tutorialStarted.current = false; // 다시 들어올 때 재확인(설정에서 되살린 경우 대비)
      };
```

**변경 후:**

```tsx
        setCoachVisible(true);
        // 커밋·페인트가 끝난 다음 프레임에 찍어야 '등장까지 걸린 시간'이 된다
        requestAnimationFrame(() => traceEnd('coach:stats', 'visible'));
        // 등장 애니메이션과 설정 컨텍스트 연쇄 리렌더가 겹치지 않게 지연 기록
        setTimeout(() => markTutorialSeen('stats'), 900);
      })();
      return () => {
        // 타이머가 사라졌으므로 취소는 이 플래그로만 한다. 각 await 뒤에서 확인한다.
        cancelled = true;
        tutorialStarted.current = false; // 다시 들어올 때 재확인(설정에서 되살린 경우 대비)
      };
```

- [ ] **Step 5: 미사용 import 정리**

이 파일에서 `CoachRect`를 쓰던 곳은 Step 2에서 지운 측정 헬퍼(`443`) 하나뿐이다. 따라서 `src/screens/StatsScreen.tsx:24` 를 다음으로 줄인다.

```tsx
import MainCoachmark, { CoachStep } from '../components/MainCoachmark';
```

Run: `grep -n "CoachRect" src/screens/StatsScreen.tsx`
Expected: 출력 없음

- [ ] **Step 6: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 없이 종료

- [ ] **Step 7: 커밋**

```bash
git add src/screens/StatsScreen.tsx
git commit -m "perf(coachmark): 통계 튜토리얼 고정 450ms 지연 제거"
```

---

### Task 6: 프로필 화면 적용

**Files:**
- Modify: `src/screens/ProfileScreen.tsx` (측정 헬퍼 `1378-1386`, 튜토리얼 포커스 효과 `1388-1450`)

- [ ] **Step 1: import 추가**

`src/screens/ProfileScreen.tsx:51` 의 `import MainCoachmark, { CoachStep, CoachRect } from '../components/MainCoachmark';` **바로 아래**에 추가한다.

```tsx
import { whenReadyToMeasure, measureWithRetry } from '../utils/coachStart';
import { traceStart, traceStep, traceEnd } from '../utils/perfTrace';
```

- [ ] **Step 2: 중복 측정 헬퍼 삭제**

다음 블록(`src/screens/ProfileScreen.tsx:1378-1386`)을 통째로 삭제한다. 이 파일만 이름이 `measureRect`다.

```tsx
  const measureRect = (ref: React.MutableRefObject<any>) =>
    new Promise<CoachRect | null>((resolve) => {
      const node = ref.current;
      if (!node || typeof node.measureInWindow !== 'function') return resolve(null);
      node.measureInWindow((x: number, y: number, width: number, height: number) => {
        if ([x, y, width, height].some((v) => typeof v !== 'number' || Number.isNaN(v))) resolve(null);
        else resolve({ x, y, width, height });
      });
    });
```

- [ ] **Step 3: 고정 지연을 준비 신호로 교체**

**변경 전:**

```tsx
      const timer = setTimeout(async () => {
        if (cancelled) return;
        const [avatar, badge, archive] = await Promise.all([
          measureRect(avatarRef),
          measureRect(badgeRef),
          measureRect(archiveRef),
        ]);
        if (cancelled) return;
```

**변경 후:**

```tsx
      (async () => {
        traceStart('coach:profile');
        // 고정 지연(구 450ms) 대신 화면 전환이 실제로 끝나는 신호를 기다린다.
        await whenReadyToMeasure();
        if (cancelled) return;
        traceStep('coach:profile', 'waited');
        const [avatar, badge, archive] = await Promise.all([
          measureWithRetry(avatarRef),
          measureWithRetry(badgeRef),
          measureWithRetry(archiveRef),
        ]);
        if (cancelled) return;
        traceStep('coach:profile', 'measured');
```

- [ ] **Step 4: 종료부와 cleanup 교체**

**변경 전:**

```tsx
        setCoachVisible(true);
        // 등장 애니메이션과 설정 컨텍스트 연쇄 리렌더가 겹치지 않게 지연 기록
        setTimeout(() => markTutorialSeen('profile'), 900);
      }, 450);
      return () => {
        cancelled = true;
        clearTimeout(timer);
        tutorialStarted.current = false; // 다시 들어올 때 재확인(설정에서 되살린 경우 대비)
      };
```

**변경 후:**

```tsx
        setCoachVisible(true);
        // 커밋·페인트가 끝난 다음 프레임에 찍어야 '등장까지 걸린 시간'이 된다
        requestAnimationFrame(() => traceEnd('coach:profile', 'visible'));
        // 등장 애니메이션과 설정 컨텍스트 연쇄 리렌더가 겹치지 않게 지연 기록
        setTimeout(() => markTutorialSeen('profile'), 900);
      })();
      return () => {
        // 타이머가 사라졌으므로 취소는 이 플래그로만 한다. 각 await 뒤에서 확인한다.
        cancelled = true;
        tutorialStarted.current = false; // 다시 들어올 때 재확인(설정에서 되살린 경우 대비)
      };
```

- [ ] **Step 5: import는 그대로 둔다 (확인만)**

통계 화면과 달리 이 파일은 `CoachRect`를 `badgeRect`·`archiveRect` 선언(`1406`, `1410`)에서도 쓴다. **import를 건드리지 않는다.**

Run: `grep -n "CoachRect" src/screens/ProfileScreen.tsx`
Expected: import 줄과 `badgeRect`·`archiveRect` 두 줄, 총 3줄이 남는다 (측정 헬퍼의 `Promise<CoachRect | null>` 줄만 사라진다)

- [ ] **Step 6: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 없이 종료

- [ ] **Step 7: 커밋**

```bash
git add src/screens/ProfileScreen.tsx
git commit -m "perf(coachmark): 프로필 튜토리얼 고정 450ms 지연 제거"
```

---

### Task 7: 코치마크 전환 계측 + 등장 페이드 단축

**Files:**
- Modify: `src/components/MainCoachmark.tsx` (등장 페이드 `164`, 단계 이펙트 `173-175`, `animateTo` `287-297`)

- [ ] **Step 1: import 추가**

`src/components/MainCoachmark.tsx:18` 의 `import { setCoachFreezeGlobe } from './coachOverlayState';` **바로 아래**에 추가한다.

```tsx
import { traceStart, traceStep, traceEnd } from '../utils/perfTrace';
```

- [ ] **Step 2: 등장 페이드 260ms → 200ms**

`src/components/MainCoachmark.tsx:164` 한 줄을 바꾼다. 종료 페이드(220ms)는 **건드리지 않는다** — 사라지는 연출은 체감 딜레이와 무관하다.

**변경 전:**

```tsx
      Animated.timing(mount, { toValue: 1, duration: 260, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
```

**변경 후:**

```tsx
      // 등장 260→200ms. 튜토리얼이 뜨기까지의 체감 대기에 그대로 더해지는 구간이라 줄인다.
      Animated.timing(mount, { toValue: 1, duration: 200, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
```

- [ ] **Step 3: 커밋 완료 지점 계측 이펙트 추가**

기존 `onStepChange` 이펙트(`src/components/MainCoachmark.tsx:173-175`) **바로 아래**에 새 이펙트를 추가한다. 기존 이펙트는 그대로 둔다.

```tsx
  // 단계 전환 계측 — 이펙트는 커밋 완료 후 실행되므로 커밋 종료 시점의 근사치가 된다.
  // animateTo가 traceStart를 부르지 않은 경우(첫 렌더 등)에는 traceStep이 조용히 무시된다.
  useEffect(() => {
    traceStep('coach:step', 'committed');
  }, [idx]);
```

- [ ] **Step 4: `animateTo`에 구간 마크 추가**

`src/components/MainCoachmark.tsx:287-297` 의 `animateTo`를 바꾼다.

**변경 전:**

```tsx
  const animateTo = (target: number) => {
    Haptics.selectionAsync().catch(() => {});
    // 글라이드 모드에서만 글로우를 미리 접는다(이동 중 헤일로는 애니메이션 대상이 아니라서).
    // 글라이드 off면 글로우는 아예 애니메이션하지 않는다 — iOS에서 그림자(shadowRadius) 달린
    // 뷰의 투명도 페이드는 프레임마다 오프스크린 렌더+블러라, 지구본만 한 헤일로에선 그 자체가 렉이다.
    if (SPOTLIGHT_GLIDE) Animated.timing(glow, { toValue: 0, duration: 120, useNativeDriver: true }).start();
    Animated.timing(trans, { toValue: 0, duration: 130, easing: Easing.in(Easing.ease), useNativeDriver: true }).start(() => {
      setIdx(target);
      Animated.timing(trans, { toValue: 1, duration: 220, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
    });
  };
```

**변경 후:**

```tsx
  const animateTo = (target: number) => {
    // 전환 계측 — 한 그룹에 4개 지점을 찍는다. 각 지점의 '+Nms'가 곧 그 구간의 비용이다.
    //   faded-out : 페이드아웃 실측(설계값 130ms). 크게 벗어나면 JS 스레드가 막혀 있다는 뜻
    //   committed : 리액트 커밋 비용  ← 전환 렉의 원인을 가르는 핵심 숫자
    //   settled   : 페이드인 실측(설계값 220ms)
    traceStart('coach:step');
    Haptics.selectionAsync().catch(() => {});
    // 글라이드 모드에서만 글로우를 미리 접는다(이동 중 헤일로는 애니메이션 대상이 아니라서).
    // 글라이드 off면 글로우는 아예 애니메이션하지 않는다 — iOS에서 그림자(shadowRadius) 달린
    // 뷰의 투명도 페이드는 프레임마다 오프스크린 렌더+블러라, 지구본만 한 헤일로에선 그 자체가 렉이다.
    if (SPOTLIGHT_GLIDE) Animated.timing(glow, { toValue: 0, duration: 120, useNativeDriver: true }).start();
    Animated.timing(trans, { toValue: 0, duration: 130, easing: Easing.in(Easing.ease), useNativeDriver: true }).start(() => {
      traceStep('coach:step', 'faded-out');
      setIdx(target);
      Animated.timing(trans, { toValue: 1, duration: 220, easing: Easing.out(Easing.ease), useNativeDriver: true }).start(
        ({ finished }) => { if (finished) traceEnd('coach:step', 'settled'); }
      );
    });
  };
```

- [ ] **Step 5: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 없이 종료

- [ ] **Step 6: 커밋**

```bash
git add src/components/MainCoachmark.tsx
git commit -m "perf(coachmark): 단계 전환 구간 계측 + 등장 페이드 260→200ms

전환을 faded-out/committed/settled 세 구간으로 나눠 찍는다.
committed(리액트 커밋 비용)가 전환 렉의 원인을 가르는 숫자다."
```

---

### Task 8: 기기 실측 및 회귀 점검

**Files:** 없음 (측정과 확인만)

이 태스크는 사람이 기기에서 수행한다. 결과 숫자를 사용자에게 보고하고, 설계 문서의 판단 기준표에 따라 다음 조치를 정한다.

- [ ] **Step 1: 튜토리얼 다시 보기 준비**

설정 → 튜토리얼 보기로 재생할 수 있다(1회 게이트를 무시하고 강제 재생). 통계·프로필은 설정에서 초기화 후 해당 탭에 진입한다.

- [ ] **Step 2: 개발 빌드에서 측정**

Run: `npx expo start`

메인·통계·프로필 튜토리얼을 각각 한 번씩 실행하고, 각 단계에서 "다음"을 끝까지 누른다. Metro 콘솔에서 `[perf]` 로 시작하는 줄을 모두 기록한다.

기대 출력 형태:

```
[perf] coach:main · waited +28ms (총 28ms)
[perf] coach:main · measured +17ms (총 45ms)
[perf] coach:main · visible +34ms (총 79ms) ─ 끝
[perf] coach:step · faded-out +136ms (총 136ms)
[perf] coach:step · committed +?ms (총 ?ms)
[perf] coach:step · settled +?ms (총 ?ms) ─ 끝
```

- [ ] **Step 3: 성공 기준 대조**

| 항목 | 기준 | 실측 |
|---|---|---|
| `coach:*` 총합 (trigger → visible) | 250ms 이하 (수정 전 약 750ms) | |
| `coach:step`의 `committed` 구간 | 50ms 이하 | |

`committed`가 기준을 넘으면 설계 문서 3절의 판단 기준표에서 해당 행의 조치를 다음 작업으로 잡는다.

- [ ] **Step 4: 회귀 점검**

| 항목 | 확인 내용 | 결과 |
|---|---|---|
| 3개 화면 | 메인·통계·프로필 튜토리얼이 각각 정상 등장 | |
| 스포트라이트 위치 | 특히 스냅·FAB(상수 폴백 경로)이 제자리인지 | |
| 지구본 원형 강조 | 메인 1단계 원이 지구본을 정확히 감싸는지 | |
| 측정 실패 폴백 | 요소를 못 찾아도 튜토리얼이 뜨는지 (탭 진입 직후 빠르게 전환해 확인) | |
| 1회 게이트 | 계정당 탭별 1회 노출·설정에서 다시보기가 그대로인지 | |
| 터치 차단 | 튜토리얼 중 탭 바·스냅·FAB가 안 눌리는지 | |

- [ ] **Step 5: 릴리스 기준선 측정 (`committed`가 개발 빌드에서 기준을 넘은 경우에만)**

`src/utils/perfTrace.ts` 의 `const TRACE_ENABLED = __DEV__;` 를 `const TRACE_ENABLED = true;` 로 임시 변경하고 릴리스 번들로 실행한다.

Run: `npx expo start --no-dev --minify`

같은 절차로 숫자를 기록한 뒤 **`TRACE_ENABLED`를 `__DEV__`로 되돌린다.** 이 변경은 커밋하지 않는다.

릴리스의 `committed`가 50ms 이하이면 설계 문서의 중단 조건에 해당한다 — 전환 렉은 더 손대지 않고 종료한다.

- [ ] **Step 6: 결과 보고**

측정값과 회귀 점검 결과를 사용자에게 보고하고, 다음 조치(추가 수정 여부)에 대한 판단을 받는다. 이 단계에서 코드를 더 고치지 않는다.

---

## 완료 조건

- `npm test` 통과 (`coachRect.verify.ts` 포함)
- `npx tsc --noEmit` 통과
- 세 화면의 튜토리얼이 정상 동작하며 등장 대기가 눈에 띄게 짧아짐
- 전환 구간의 실측 숫자를 확보하고, 다음 조치가 판단 기준표로 결정됨

## 범위 밖

- 전환 렉의 실제 수정 — Task 8의 숫자를 본 뒤 별도 계획으로 진행한다
- `SPOTLIGHT_GLIDE`·`RING_PULSE` 재활성화
- 튜토리얼 내용·문구·단계 구성 변경
