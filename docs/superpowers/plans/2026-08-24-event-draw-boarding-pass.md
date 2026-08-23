# 온라인 뽑기 — 보딩패스 발권기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단대축제 부스의 종이 뽑기를, 스태프 기기에서 도는 발권기 화면 한 장으로 대체한다.

**Architecture:** 서버가 없다. 순수 로직(`docs/draw-core.js`)과 화면(`docs/draw.html`)을 나누고,
재고는 기기의 `localStorage`에 둔다. `draw-core.js`는 생성물이 아니라 브라우저와 Node가 같은
파일을 그대로 읽는 ESM이라, 번들 생성물이 낡아도 검사가 통과하는 함정이 생기지 않는다.

**Tech Stack:** 순수 ESM JavaScript, HTML/CSS. 빌드 없음. 검증은 저장소 규약대로 `*.verify.mjs`
자체 assert(`npm test` = `node scripts/run-verify.mjs`가 자동 수집). 게시는 gh-pages.

**설계 문서:** `docs/superpowers/specs/2026-08-24-event-draw-boarding-pass-design.md`
**결과 화면 시안:** https://claude.ai/code/artifact/9ab0c66b-c475-4aba-b641-c1f46ea27e5c

## Global Constraints

- 모든 주석·문구·커밋 메시지는 한글로 쓴다.
- **네트워크 요청을 하나도 넣지 않는다.** 뽑기는 설문 DB와 완전히 분리돼야 개인정보 고지를
  다시 쓰지 않아도 된다. `fetch`·`XMLHttpRequest`·외부 폰트/스크립트 URL 전부 금지.
- 개인정보를 받지 않는다. 탑승권 승객명은 `부스 방문객` 고정 문구다.
- 디자인 토큰: 배경 `#0A0A0F` · 카드 `#2E2E3B` · 보라 네온 `#BF85FC` · 보라 딥 `#6B21A8` ·
  텍스트 흐림 `#A1A1B0` · 구분선 `#1A1A26` · 빨강 `#FF3B30`. 다크 단일 테마.
- **꽝에는 빨강을 쓰지 않는다** — 당첨 실패가 아니라 앱 오류로 읽힌다.
- 노선은 전 등급 공통 `EOR 이어스 → DKU 단국대`.
- **1등 항공권은 D2에만 들어간다.** D1 재고는 0이다.
- `innerHTML`을 쓰지 않는다 — 저장소 훅이 차단한다. `<template>` 복제 + `textContent`를 쓴다.
- `docs/` 아래 파일을 새로 만들면 `scripts/lib/pagesFiles.mjs`의 `PUBLISHED_FILES`에 반드시
  등록한다. 빠뜨리면 게시도 안 되고 `check-docs-sync`도 변경을 못 알아챈다.

---

### Task 1: 뽑기 로직

**Files:**
- Create: `docs/draw-core.js`
- Test: `scripts/draw-core.verify.mjs`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `GRADES: Record<GradeKey, { rank, cls, seat, stripe, prize, gold?, isVoid? }>`
  - `GRADE_KEYS: GradeKey[]` — `['g1','g2','g3','g4','g5','miss']`
  - `DAY_POOLS: Record<'D1'|'D2', Record<GradeKey, number>>`
  - `EVENT_DAYS: Record<'D1'|'D2', { label, date, flight }>`
  - `makePool(day: 'D1'|'D2'): State`
  - `drawOne(state: State, rand?: () => number, now?: number): { grade: GradeKey, state: State }`
  - `undoLast(state: State): State`
  - `setRemaining(state: State, grade: GradeKey, n: number): State`
  - `remaining(state): Record<GradeKey, number>` / `totalRemaining(state): number`
  - `isExhausted(state): boolean` / `tally(state): Record<GradeKey, number>`
  - `restore(raw: string | null): State | null`
  - `State = { version: 1, day, remaining, history: Array<{ at: number, grade: GradeKey }> }`

- [ ] **Step 1: 검증 파일을 먼저 쓴다**

`scripts/draw-core.verify.mjs`:

```js
// 뽑기 재고 검증. 여기서 틀리면 3등이 배정 수량보다 많이 나가거나,
// 첫날에 있지도 않은 항공권이 당첨된다.
import {
  GRADE_KEYS, DAY_POOLS, makePool, drawOne, undoLast, setRemaining,
  remaining, totalRemaining, isExhausted, tally, restore,
} from '../docs/draw-core.js';

let fail = 0;
const eq = (got, want, msg) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? '✓' : '✗'} ${msg}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) fail++;
};
const ok_ = (cond, msg) => {
  console.log(`  ${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) fail++;
};
const near = (got, want, tol, msg) => {
  const ok = Math.abs(got - want) <= tol;
  console.log(`  ${ok ? '✓' : '✗'} ${msg}${ok ? '' : ` — got ${got}, want ~${want}`}`);
  if (!ok) fail++;
};
const throws = (fn, msg) => {
  let threw = false;
  try { fn(); } catch { threw = true; }
  console.log(`  ${threw ? '✓' : '✗'} ${msg}`);
  if (!threw) fail++;
};

// 시드 고정 난수 — 검증이 실행할 때마다 다른 결과를 내면 안 된다
const seeded = (seed) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

/**
 * 재고가 바닥날 때까지 뽑아 등급별 발권 수를 센다.
 * 집계는 반드시 GRADE_KEYS 순서로 되돌린다 — eq가 JSON.stringify로 비교하는데,
 * 뽑히는 순서대로 키가 박히면 값이 같아도 키 순서가 달라 거짓 실패가 난다.
 */
const drainAll = (day, rand) => {
  let st = makePool(day);
  const raw = {};
  while (!isExhausted(st)) {
    const r = drawOne(st, rand, 0);
    raw[r.grade] = (raw[r.grade] || 0) + 1;
    st = r.state;
  }
  const counts = Object.fromEntries(GRADE_KEYS.filter((k) => raw[k]).map((k) => [k, raw[k]]));
  return { counts, st };
};

console.log('뽑기 재고');

// ── 소진 정확성 ──
{
  const { counts } = drainAll('D2', seeded(1));
  const want = Object.fromEntries(
    GRADE_KEYS.filter((k) => DAY_POOLS.D2[k] > 0).map((k) => [k, DAY_POOLS.D2[k]]),
  );
  eq(counts, want, 'D2 전량을 뽑으면 등급별 발권 수가 초기 수량과 정확히 같다');
}
{
  const { st } = drainAll('D2', seeded(2));
  eq(totalRemaining(st), 0, '소진 후 남은 수량 합계는 0');
  eq(st.history.length, 502, '이력 건수는 초기 총량과 같다');
}

// ── 첫날에는 항공권이 없다 ──
{
  const { counts } = drainAll('D1', seeded(3));
  ok_(!counts.g1, 'D1은 전량을 뽑아도 1등이 한 번도 나오지 않는다');
  eq(DAY_POOLS.D1.g1, 0, 'D1 초기 재고의 1등은 0');
  eq(DAY_POOLS.D2.g1, 1, 'D2 초기 재고의 1등은 1');
}

// ── 소진된 등급은 다시 나오지 않는다 ──
{
  let st = makePool('D2');
  st = setRemaining(st, 'g3', 1);
  const first = drawOne(st, () => 0.999, 0);   // 마지막 등급(miss)이 0이면 g5가 잡힌다
  ok_(first.grade !== undefined, '가중 추출이 항상 등급을 반환한다');

  let cur = setRemaining(makePool('D2'), 'g5', 0);
  cur = setRemaining(cur, 'g4', 0);
  cur = setRemaining(cur, 'g3', 0);
  cur = setRemaining(cur, 'g2', 0);
  const only = drawOne(cur, seeded(7), 0);
  eq(only.grade, 'g1', '1등만 남으면 1등만 나온다');
}

// ── 전부 소진되면 조용히 꽝을 주지 않고 예외를 던진다 ──
{
  const { st } = drainAll('D1', seeded(4));
  ok_(isExhausted(st), '전량 소진 후 isExhausted가 참');
  throws(() => drawOne(st, seeded(5), 0), '소진 상태에서 drawOne은 예외를 던진다');
}

// ── 가중치: 재고 비율이 곧 확률 ──
{
  const st = makePool('D2');                    // 총 502 = 1+1+50+150+300
  const rnd = seeded(20260824);
  const counts = {};
  for (let i = 0; i < 20000; i++) {
    const r = drawOne(st, rnd, 0);              // 같은 상태를 계속 쓴다(불변이므로 재고가 안 준다)
    counts[r.grade] = (counts[r.grade] || 0) + 1;
  }
  near(counts.g5, 20000 * 300 / 502, 400, '5등 비율이 재고 비율(300/502)에 수렴');
  near(counts.g4, 20000 * 150 / 502, 400, '4등 비율이 재고 비율(150/502)에 수렴');
  near(counts.g3, 20000 * 50 / 502, 300, '3등 비율이 재고 비율(50/502)에 수렴');
  eq(remaining(st), DAY_POOLS.D2, '2만 번을 뽑아도 원본 상태는 그대로다(불변)');
}

// ── 되돌리기 ──
{
  const before = makePool('D2');
  const { state: after } = drawOne(before, seeded(9), 1234);
  const back = undoLast(after);
  eq(remaining(back), remaining(before), '되돌리면 재고가 원상복구된다');
  eq(back.history.length, 0, '되돌리면 이력도 원상복구된다');
  eq(undoLast(before).history.length, 0, '이력이 없을 때 되돌리기는 아무것도 하지 않는다');
}

// ── 관리자 보정 ──
{
  const st = setRemaining(makePool('D2'), 'g3', 7);
  eq(remaining(st).g3, 7, '남은 수량을 직접 지정할 수 있다');
  eq(remaining(makePool('D2')).g3, 50, '보정이 원본을 건드리지 않는다');
  throws(() => setRemaining(makePool('D2'), 'g3', -1), '음수 재고는 거부한다');
  throws(() => setRemaining(makePool('D2'), 'g9', 1), '없는 등급은 거부한다');
}

// ── 정산 ──
{
  let st = makePool('D2');
  for (let i = 0; i < 5; i++) st = drawOne(st, seeded(11 + i), i).state;
  const t = tally(st);
  eq(Object.values(t).reduce((a, b) => a + b, 0), 5, '정산 합계가 발권 건수와 같다');
}

// ── 복원 ──
{
  const st = makePool('D1');
  eq(restore(JSON.stringify(st)), st, '저장한 상태를 그대로 복원한다');
  eq(restore(null), null, '값이 없으면 null');
  eq(restore('{'), null, '깨진 JSON이면 null');
  eq(restore('{"version":99,"day":"D1","remaining":{},"history":[]}'), null, '버전이 다르면 null');
  eq(restore('{"version":1,"day":"D9","remaining":{},"history":[]}'), null, '없는 날짜면 null');
  eq(restore('{"version":1,"day":"D1","history":[]}'), null, '재고가 없으면 null');
  eq(restore('{"version":1,"day":"D1","remaining":{"g3":"많음"},"history":[]}'), null,
     '재고 값이 숫자가 아니면 null');
}

// ── 알 수 없는 날짜 ──
throws(() => makePool('D3'), '정의되지 않은 날짜는 거부한다');

console.log(fail === 0 ? '\n뽑기 재고 ✓ 전부 통과' : `\n뽑기 재고 ✗ ${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: 실패하는지 확인한다**

Run: `node scripts/draw-core.verify.mjs`
Expected: FAIL — `Cannot find module ... docs/draw-core.js`

- [ ] **Step 3: 로직을 구현한다**

`docs/draw-core.js`:

```js
/**
 * 부스 뽑기 재고 — 순수 로직.
 *
 * 브라우저(docs/draw.html)와 Node(scripts/draw-core.verify.mjs)가 이 파일을 그대로 읽는다.
 * 생성물이 아니다 — 번들 생성물로 두면 "재생성 검사가 항상 통과하는" 함정이 다시 생긴다.
 *
 * 상태는 절대 제자리에서 고치지 않는다. 모든 함수가 새 객체를 돌려준다.
 */

export const STATE_VERSION = 1;

/** 추출 순서 고정 — 가중 추출이 이 순서로 구간을 훑는다 */
export const GRADE_KEYS = ['g1', 'g2', 'g3', 'g4', 'g5', 'miss'];

/**
 * 등급 정의. 등급 차이는 stripe 색 하나로만 낸다 —
 * 등급마다 카드를 다시 칠하면 6종이 서로 다른 앱처럼 보인다.
 */
export const GRADES = {
  g1:   { rank: '1등', cls: 'FIRST CLASS', seat: '01A', stripe: '#FFD9A0',
          prize: '후쿠오카 왕복 항공권', gold: true },
  g2:   { rank: '2등', cls: 'BUSINESS',    seat: '04C', stripe: '#BF85FC',
          prize: '필름카메라' },
  g3:   { rank: '3등', cls: 'PREMIUM',     seat: '12B', stripe: '#9C6BE8',
          prize: '세계 간식 5개 + 스티커' },
  g4:   { rank: '4등', cls: 'ECONOMY',     seat: '27A', stripe: '#A1A1B0',
          prize: '세계 간식 3개 + 스티커' },
  g5:   { rank: '5등', cls: 'BASIC',       seat: '44F', stripe: '#6E6E82',
          prize: '세계 간식 1개 + 스티커' },
  miss: { rank: '꽝',  cls: 'STANDBY',     seat: '---', stripe: '#3A3A48',
          prize: '다음 기회에', isVoid: true },
};

/**
 * 날짜별 초기 재고. 이월 계산을 하지 않는 이유는 D1 데이터가 날아갔을 때
 * 조용히 2명이 당첨되는 것을 막기 위해서다.
 *
 * ⚠️ 1등 항공권은 D2에만 있다(사용자 확정). D1의 g1이 0이라 가중치도 0이고,
 *    첫날 화면에 1등이 나올 수 있는 경로 자체가 없다.
 * ⚠️ miss(꽝)는 아직 미정이라 0이다. 정해지면 이 표만 고치면 된다.
 *    스티커 발주가 정확히 1,000매(여유 0)라 꽝 지급 여부와 함께 정해야 한다.
 */
export const DAY_POOLS = {
  D1: { g1: 0, g2: 1, g3: 50, g4: 150, g5: 300, miss: 0 },
  D2: { g1: 1, g2: 1, g3: 50, g4: 150, g5: 300, miss: 0 },
};

/**
 * 탑승권에 찍히는 날짜와 편명.
 * ⚠️ 행사 날짜가 아직 확정되지 않아 임시값이다. 확정되면 여기만 고친다.
 */
export const EVENT_DAYS = {
  D1: { label: '첫날',   date: '09 SEP 2026', flight: 'EO 0910' },
  D2: { label: '둘째날', date: '10 SEP 2026', flight: 'EO 0911' },
};

export function makePool(day) {
  if (!DAY_POOLS[day]) throw new Error(`정의되지 않은 날짜: ${day}`);
  return { version: STATE_VERSION, day, remaining: { ...DAY_POOLS[day] }, history: [] };
}

export function remaining(state) {
  return { ...state.remaining };
}

export function totalRemaining(state) {
  return GRADE_KEYS.reduce((n, k) => n + (state.remaining[k] || 0), 0);
}

export function isExhausted(state) {
  return totalRemaining(state) === 0;
}

/**
 * 남은 수량을 가중치로 하는 비복원 추출.
 * 소진된 등급은 가중치가 0이라 후보에서 자동으로 빠지므로 별도 확률표가 필요 없다.
 *
 * rand와 now를 주입받는 이유는 검증에서 시드를 고정하기 위해서다.
 */
export function drawOne(state, rand = Math.random, now = Date.now()) {
  if (isExhausted(state)) throw new Error('재고가 모두 소진되어 더 뽑을 수 없습니다');

  const total = totalRemaining(state);
  // rand()가 1을 돌려주는 구현을 대비해 마지막 표로 고정한다 — 안 그러면 grade가 null이 된다
  let ticket = Math.min(Math.floor(rand() * total), total - 1);

  let grade = null;
  for (const k of GRADE_KEYS) {
    const n = state.remaining[k] || 0;
    if (ticket < n) { grade = k; break; }
    ticket -= n;
  }

  return {
    grade,
    state: {
      ...state,
      remaining: { ...state.remaining, [grade]: state.remaining[grade] - 1 },
      history: [...state.history, { at: now, grade }],
    },
  };
}

/** 마지막 1건 되돌리기. 부스에서 오조작은 반드시 생긴다. */
export function undoLast(state) {
  if (!state.history.length) return state;
  const last = state.history[state.history.length - 1];
  return {
    ...state,
    remaining: { ...state.remaining, [last.grade]: (state.remaining[last.grade] || 0) + 1 },
    history: state.history.slice(0, -1),
  };
}

/** 관리자 보정 — 실물이 먼저 떨어졌을 때 해당 등급을 0으로 내린다 */
export function setRemaining(state, grade, n) {
  if (!GRADE_KEYS.includes(grade)) throw new Error(`알 수 없는 등급: ${grade}`);
  if (!Number.isInteger(n) || n < 0) throw new Error(`재고는 0 이상의 정수여야 합니다: ${n}`);
  return { ...state, remaining: { ...state.remaining, [grade]: n } };
}

/** 등급별 발권 수 */
export function tally(state) {
  const out = {};
  for (const h of state.history) out[h.grade] = (out[h.grade] || 0) + 1;
  return out;
}

/**
 * 저장된 상태 복원. 형태가 조금이라도 어긋나면 null을 돌려준다 —
 * 깨진 상태로 부스를 돌리면 재고가 조용히 틀어지고 아무도 못 알아챈다.
 */
export function restore(raw) {
  if (!raw) return null;
  let o;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  if (o.version !== STATE_VERSION) return null;
  if (!DAY_POOLS[o.day]) return null;
  if (!o.remaining || typeof o.remaining !== 'object') return null;
  if (!Array.isArray(o.history)) return null;
  for (const k of Object.keys(o.remaining)) {
    if (!GRADE_KEYS.includes(k)) return null;
    if (!Number.isInteger(o.remaining[k]) || o.remaining[k] < 0) return null;
  }
  return o;
}
```

- [ ] **Step 4: 통과하는지 확인한다**

Run: `node scripts/draw-core.verify.mjs`
Expected: PASS — `뽑기 재고 ✓ 전부 통과`

- [ ] **Step 5: 게이트가 실제로 실패하는지 확인한다**

검사가 있는데 그 검사가 못 잡는 것이 이 저장소에서 실제로 반복된 결함 유형이다.
아래를 **하나씩 임시로 넣고** ✗가 뜨는지 본 뒤 되돌린다.

1. `DAY_POOLS.D1.g1`을 `1`로 → "D1은 전량을 뽑아도 1등이 한 번도 나오지 않는다" ✗
2. `drawOne`의 `history` 갱신을 `state.history.push(...)`로 (제자리 수정) → 불변성 ✗
3. `undoLast`에서 `+ 1`을 빼기 → 되돌리기 ✗
4. `restore`의 `o.version !== STATE_VERSION` 검사를 지우기 → 버전 ✗

Run: 각 변경마다 `node scripts/draw-core.verify.mjs`
Expected: 각각 해당 항목만 ✗ — 하나라도 통과하면 그 검사는 아무것도 지키지 못하고 있다.

- [ ] **Step 6: 커밋**

```bash
git add docs/draw-core.js scripts/draw-core.verify.mjs
git commit -F - <<'EOF'
feat(event): 부스 뽑기 재고 로직

남은 수량 가중 비복원 추출. 소진된 등급은 가중치 0이라 후보에서 자동으로 빠져
별도 확률표가 필요 없다. 1등 항공권은 D2 재고에만 있다.

브라우저와 Node가 같은 파일을 그대로 읽는다 — 번들 생성물로 두면
"재생성 검사가 항상 통과하는" 함정이 다시 생긴다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: 발권 화면

**Files:**
- Create: `docs/draw.html`
- Modify: 없음

**Interfaces:**
- Consumes: Task 1의 `GRADES` `GRADE_KEYS` `DAY_POOLS` `EVENT_DAYS` `makePool` `drawOne`
  `restore` `isExhausted` `remaining`
- Produces: 전역 없음. Task 3이 이 파일의 `state` / `save()` / `renderPass(grade)` /
  `refreshKiosk()` 함수와 `#face-label` 요소를 이어받는다.

- [ ] **Step 1: 시안을 출발점으로 복사한다**

```bash
cp "C:/Users/2023user/AppData/Local/Temp/claude/C--Users-2023user-OneDrive-------eOrth/d7c870d3-44c2-43c5-ab3d-5c5110fa2e3c/scratchpad/boarding-pass.html" "docs/draw.html"
```

스크래치패드가 이미 정리됐다면 시안 아티팩트에서 받는다:
https://claude.ai/code/artifact/9ab0c66b-c475-4aba-b641-c1f46ea27e5c

- [ ] **Step 2: 시안용 요소를 걷어낸다**

`docs/draw.html`에서 삭제한다:
- `<header class="masthead">` 전체 (시안 설명 머리말)
- `등급별 변형` 섹션 (`.gallery`와 그 `sec-head`)
- `확정이 필요한 값` 섹션 (`.decisions` 전체)
- 대응하는 CSS: `.masthead` `.eyebrow` `h1` `.lede` `.gallery` `.cell` `.note` `.tag`
  `.decisions` `.scroller`
- 대응하는 JS: 갤러리 생성 블록(`const gallery = ...` 이하 `gallery.appendChild(cell);` 까지)
  과 `GRADES` 배열 리터럴(로직이 `draw-core.js`에서 온다)

남기는 것: `<style>` 안의 `:root` 토큰 · `body` · `.sec` · `.stage` · `.stars` ·
발권기 일습(`.kiosk` `.face` `.led` `.start` `.slot` `.exit` `.feed` + 키프레임) ·
보딩패스 일습(`.pass` `.main` `.brand` `.route` `.grid` `.prize` `.stub` `.barcode` `.seal`) ·
`<template id="passTpl">` · 별 배경 JS.

- [ ] **Step 3: 문서를 실제 도구 형태로 바꾼다**

`<title>`을 `eOrth 부스 뽑기`로 바꾸고, `<div class="page">` 안을 다음으로 교체한다.
(`<canvas class="stars">`와 `<div class="kiosk">` 마크업은 시안 그대로 유지한다.)

```html
<div class="page">

  <!-- 날짜 선택 — 저장된 상태가 없을 때만 뜬다 -->
  <section class="sec setup" id="setup">
    <h2>오늘은 며칠째인가요?</h2>
    <p class="setup-note">한 번 고르면 이 기기의 재고가 그날 것으로 정해집니다.
      바꾸려면 관리 패널에서 초기화해야 합니다.</p>
    <div class="day-picks">
      <button class="day" data-day="D1">
        <span class="day-name">첫날</span>
        <span class="day-sub">항공권 없음 · 501개</span>
      </button>
      <button class="day" data-day="D2">
        <span class="day-name">둘째날</span>
        <span class="day-sub">항공권 포함 · 502개</span>
      </button>
    </div>
  </section>

  <!-- 발권기 -->
  <section class="sec kiosk-wrap hidden" id="kioskWrap">
    <div class="stage" id="stage">
      <canvas class="stars" id="stars"></canvas>
      <div class="kiosk">
        <div class="face" id="face">
          <div class="face-top">
            <span class="led"></span>
            <span class="face-label" id="faceLabel">eOrth Boarding Pass</span>
          </div>
          <button class="start" id="start">시작하기</button>
          <div class="slot"><i class="slot-glow"></i></div>
        </div>
        <div class="exit">
          <div class="feed" id="feed"><div id="passSlot"></div></div>
        </div>
      </div>
    </div>
    <p class="done-note hidden" id="doneNote">오늘 발권이 모두 끝났습니다.</p>
  </section>

</div>
```

CSS에 다음을 추가한다(기존 토큰만 쓴다):

```css
  .setup{align-items:center;text-align:center;padding-top:48px}
  .setup h2{font-size:22px}
  .setup-note{color:var(--dim);font-size:14px;max-width:36ch;margin:0}
  .day-picks{display:grid;grid-template-columns:1fr 1fr;gap:14px;width:min(100%,420px);margin-top:8px}
  .day{
    display:flex;flex-direction:column;gap:6px;padding:22px 14px;cursor:pointer;
    background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:16px;
    font-family:var(--sans);transition:border-color .15s,transform .1s
  }
  .day:hover{border-color:var(--neon)}
  .day:active{transform:translateY(1px)}
  .day:focus-visible{outline:2px solid var(--neon);outline-offset:2px}
  .day-name{font-size:18px;font-weight:800}
  .day-sub{font-size:12px;color:var(--dim);font-family:var(--mono);letter-spacing:.03em}
  .kiosk-wrap{align-items:center}
  .done-note{color:var(--dim);font-size:14px;text-align:center;margin:0}
  .hidden{display:none}
```

`.face-label`에 스태프가 길게 누를 것이므로 다음을 추가한다:

```css
  .face-label{cursor:default;user-select:none;-webkit-user-select:none}
```

- [ ] **Step 4: 스크립트를 실제 뽑기로 바꾼다**

`<script>` 태그를 `<script type="module">`로 바꾸고(`import`를 쓰려면 필수),
시안의 `GRADES` 배열 · `buildPass` · 발권 시퀀스 블록을 아래로 통째로 교체한다.
별 배경(`paintStars`) 블록은 그대로 둔다.

```js
import {
  GRADES, EVENT_DAYS, makePool, drawOne, restore, isExhausted,
} from './draw-core.js';

const KEY = 'eorth_draw_v1';

const setup     = document.getElementById('setup');
const kioskWrap = document.getElementById('kioskWrap');
const face      = document.getElementById('face');
const feed      = document.getElementById('feed');
const start     = document.getElementById('start');
const passSlot  = document.getElementById('passSlot');
const doneNote  = document.getElementById('doneNote');
const tpl       = document.getElementById('passTpl');

let state = restore(localStorage.getItem(KEY));

function save(){
  localStorage.setItem(KEY, JSON.stringify(state));
}

/** 템플릿을 복제해 등급 하나를 그린다. innerHTML은 저장소 훅이 막으므로 textContent만 쓴다. */
function renderPass(gradeKey){
  const g = GRADES[gradeKey];
  const day = EVENT_DAYS[state.day];
  const node = tpl.content.firstElementChild.cloneNode(true);

  node.style.setProperty('--stripe', g.stripe);
  if (g.gold) node.classList.add('gold');
  if (g.isVoid) node.classList.add('void');

  const set = (name, text) => { node.querySelector('[data-f="' + name + '"]').textContent = text; };
  set('cls', g.cls);
  set('seat', g.seat);
  set('boarding', g.isVoid ? 'WAIT' : 'NOW');
  set('prize', g.prize);
  set('date', day.date);
  set('flight', day.flight);
  set('rankNum', g.isVoid ? '꽝' : g.rank.replace('등', ''));
  set('rankUnit', g.isVoid ? '' : '등');
  set('cap', day.flight.replace(' ', '') + ' · ' + g.seat);

  passSlot.replaceChildren(node);
}

/** 재고가 바닥나면 버튼을 잠근다 — 조용히 꽝을 주지 않는다 */
function refreshKiosk(){
  const dry = isExhausted(state);
  start.disabled = dry;
  doneNote.classList.toggle('hidden', !dry);
  if (dry) start.textContent = '발권 종료';
}

function run(){
  if (isExhausted(state)) return;
  start.disabled = true;

  const result = drawOne(state);
  state = result.state;
  save();                                  // 애니메이션 전에 저장한다 — 도중에 앱이 꺼져도 재고가 맞는다
  renderPass(result.grade);

  face.classList.remove('done');
  feed.classList.remove('out');
  void feed.offsetWidth;                   // 리플로우 — 두 번째부터도 애니메이션이 다시 걸리게
  face.classList.add('busy');
  feed.classList.add('out');
}

feed.addEventListener('animationend', function(){
  face.classList.remove('busy');
  face.classList.add('done');
  start.textContent = '다시 뽑기';
  start.disabled = false;
  refreshKiosk();
});

start.addEventListener('click', run);

// ── 날짜 선택 ──
for (const btn of document.querySelectorAll('.day')){
  btn.addEventListener('click', function(){
    state = makePool(btn.dataset.day);
    save();
    enterKiosk();
  });
}

function enterKiosk(){
  setup.classList.add('hidden');
  kioskWrap.classList.remove('hidden');
  paintStars();
  refreshKiosk();
  keepAwake();
}

// ── 화면 꺼짐 방지 ──
// 부스에서 화면이 꺼지면 스태프가 매번 깨워야 한다. 미지원 브라우저에서는 조용히 넘어간다.
let wakeLock = null;
async function keepAwake(){
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch { /* 배터리 절약 모드 등에서 거부될 수 있다 — 기능이 아니라 편의다 */ }
}
document.addEventListener('visibilitychange', function(){
  if (document.visibilityState === 'visible') keepAwake();
});

if (state) enterKiosk();
```

`<template id="passTpl">`에서 `Date`와 `Flight` 값이 하드코딩돼 있으므로 자리표시자를 붙인다:

```html
        <div class="f"><dt>Flight</dt><dd data-f="flight"></dd></div>
        <div class="f"><dt>Date</dt><dd data-f="date"></dd></div>
```

- [ ] **Step 5: 브라우저에서 직접 확인한다**

`docs/`는 모듈 import를 쓰므로 `file://`로 열면 CORS로 막힌다. 로컬 서버로 연다:

```bash
npx --yes http-server docs -p 4173 -c-1
```

브라우저에서 `http://localhost:4173/draw.html`을 열고 확인한다:

1. 날짜 선택이 뜬다 → "첫날"을 고른다
2. 시작하기 → 기계가 떨리고 탑승권이 밀려 나온다
3. 여러 번 눌러 4등·5등이 주로 나오고 **1등은 나오지 않는다**
4. 새로고침 → 날짜 선택이 다시 뜨지 않고 발권기가 바로 뜬다
5. DevTools 콘솔에 오류가 없고, Network 탭에 **요청이 하나도 없다**
6. DevTools → Application → Local Storage에서 `eorth_draw_v1`의 `remaining`이 줄어 있다

- [ ] **Step 6: 커밋**

```bash
git add docs/draw.html
git commit -F - <<'EOF'
feat(event): 부스 뽑기 발권 화면

발권기에서 보딩패스가 밀려 나오며 등급이 공개된다. 급지는 steps(20) —
부드럽게 미끄러지면 종이가 아니라 화면 전환으로 보인다.

재고는 localStorage에 있고 애니메이션 전에 저장한다. 도중에 앱이 꺼져도
이미 나간 상품과 재고가 어긋나지 않는다. 네트워크 요청은 하나도 없다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: 관리 패널

**Files:**
- Modify: `docs/draw.html`

**Interfaces:**
- Consumes: Task 1의 `GRADE_KEYS` `GRADES` `undoLast` `setRemaining` `remaining` `tally`
  `restore` `makePool`, Task 2의 `state` `save()` `refreshKiosk()` `#faceLabel`
- Produces: 없음 (최종 소비자)

- [ ] **Step 1: 마크업을 추가한다**

`#kioskWrap` 섹션 안, `</section>` 직전에 넣는다:

```html
    <div class="admin hidden" id="admin">
      <div class="admin-head">
        <h3>관리</h3>
        <button class="x" id="adminClose" aria-label="닫기">✕</button>
      </div>

      <table class="admin-table">
        <thead><tr><th>등급</th><th>남음</th><th>발권</th></tr></thead>
        <tbody id="adminRows"></tbody>
      </table>

      <div class="admin-acts">
        <button class="ghost" id="undo">마지막 1건 되돌리기</button>
        <button class="ghost" id="copyState">상태 복사</button>
        <button class="ghost" id="pasteState">상태 붙여넣기</button>
        <button class="ghost danger" id="resetDay">날짜 다시 고르기</button>
      </div>

      <p class="admin-msg" id="adminMsg"></p>
    </div>
```

- [ ] **Step 2: CSS를 추가한다**

```css
  .admin{
    width:min(100%,420px);background:var(--card);border:1px solid var(--line);
    border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:14px
  }
  .admin-head{display:flex;align-items:center;justify-content:space-between}
  .admin-head h3{margin:0;font-size:16px}
  .x{background:none;border:0;color:var(--dim);font-size:16px;cursor:pointer;padding:4px 8px}
  .x:hover{color:var(--ink)}
  .admin-table{width:100%;border-collapse:collapse;font-size:14px}
  .admin-table th{
    font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;
    color:var(--dim);text-align:left;font-weight:500;padding-bottom:6px
  }
  .admin-table td{padding:6px 0;border-top:1px solid var(--line);font-variant-numeric:tabular-nums}
  .admin-table td:nth-child(2),.admin-table td:nth-child(3){width:76px}
  .admin-table input{
    width:64px;background:var(--bg);color:var(--ink);border:1px solid var(--line);
    border-radius:8px;padding:6px 8px;font-family:var(--mono);font-size:14px
  }
  .admin-table input:focus-visible{outline:2px solid var(--neon);outline-offset:1px}
  .admin-acts{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .ghost{
    background:transparent;color:var(--ink);border:1px solid var(--line);border-radius:10px;
    padding:11px;font-size:13px;font-family:var(--sans);cursor:pointer
  }
  .ghost:hover{border-color:var(--neon);color:var(--neon)}
  .ghost:focus-visible{outline:2px solid var(--neon);outline-offset:2px}
  .ghost.danger:hover{border-color:var(--red);color:var(--red)}
  .admin-msg{margin:0;font-size:13px;color:var(--neon);min-height:18px}
```

- [ ] **Step 3: 스크립트를 추가한다**

Task 2의 import 목록을 다음으로 넓힌다:

```js
import {
  GRADES, GRADE_KEYS, EVENT_DAYS, makePool, drawOne, undoLast, setRemaining,
  remaining, tally, restore, isExhausted,
} from './draw-core.js';
```

파일 끝(`if (state) enterKiosk();` 직전)에 넣는다:

```js
// ── 관리 패널 ──
// 라벨을 3초 길게 눌러 연다. 참가자가 실수로 열 수 없어야 하고,
// 스태프는 안내 없이도 찾을 수 있어야 해서 "누르고 있으면 열리는" 방식을 골랐다.
const admin     = document.getElementById('admin');
const adminRows = document.getElementById('adminRows');
const adminMsg  = document.getElementById('adminMsg');
const faceLabel = document.getElementById('faceLabel');

let holdTimer = 0;
const startHold = () => {
  clearTimeout(holdTimer);
  holdTimer = setTimeout(openAdmin, 3000);
};
const cancelHold = () => clearTimeout(holdTimer);

faceLabel.addEventListener('pointerdown', startHold);
faceLabel.addEventListener('pointerup', cancelHold);
faceLabel.addEventListener('pointercancel', cancelHold);
faceLabel.addEventListener('pointerleave', cancelHold);

function say(msg){
  adminMsg.textContent = msg;
  setTimeout(function(){ if (adminMsg.textContent === msg) adminMsg.textContent = ''; }, 3000);
}

function openAdmin(){
  renderAdmin();
  admin.classList.remove('hidden');
}

function renderAdmin(){
  const left = remaining(state);
  const done = tally(state);
  adminRows.replaceChildren();

  for (const k of GRADE_KEYS){
    const tr = document.createElement('tr');

    const name = document.createElement('td');
    name.textContent = GRADES[k].rank + ' · ' + GRADES[k].prize;

    const leftCell = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.value = String(left[k] || 0);
    input.addEventListener('change', function(){
      const n = Number(input.value);
      try {
        state = setRemaining(state, k, n);
        save();
        refreshKiosk();
        say(GRADES[k].rank + ' 재고를 ' + n + '개로 맞췄습니다');
      } catch (e) {
        input.value = String(remaining(state)[k] || 0);
        say('0 이상의 정수만 넣을 수 있습니다');
      }
    });
    leftCell.appendChild(input);

    const doneCell = document.createElement('td');
    doneCell.textContent = String(done[k] || 0);

    tr.append(name, leftCell, doneCell);
    adminRows.appendChild(tr);
  }
}

document.getElementById('adminClose').addEventListener('click', function(){
  admin.classList.add('hidden');
});

document.getElementById('undo').addEventListener('click', function(){
  if (!state.history.length){ say('되돌릴 발권이 없습니다'); return; }
  const last = state.history[state.history.length - 1];
  state = undoLast(state);
  save();
  renderAdmin();
  refreshKiosk();
  say(GRADES[last.grade].rank + ' 1건을 되돌렸습니다');
});

// 클립보드는 권한·보안 컨텍스트에 따라 막힌다. 실패하면 텍스트를 화면에 띄워
// 스태프가 직접 복사할 수 있게 한다 — "복사됐겠거니" 하고 넘어가면 백업이 없다.
document.getElementById('copyState').addEventListener('click', async function(){
  const text = JSON.stringify(state);
  try {
    await navigator.clipboard.writeText(text);
    say('상태를 복사했습니다');
  } catch {
    window.prompt('아래 내용을 직접 복사해 두세요', text);
  }
});

document.getElementById('pasteState').addEventListener('click', function(){
  const raw = window.prompt('복사해 둔 상태를 붙여넣으세요');
  if (raw === null) return;
  const next = restore(raw.trim());
  if (!next){ say('형식이 맞지 않아 반영하지 않았습니다'); return; }
  state = next;
  save();
  renderAdmin();
  refreshKiosk();
  say('상태를 복원했습니다');
});

document.getElementById('resetDay').addEventListener('click', function(){
  const n = state.history.length;
  if (!window.confirm('발권 ' + n + '건 기록이 지워지고 재고가 초기화됩니다. 계속할까요?')) return;
  localStorage.removeItem(KEY);
  location.reload();
});
```

- [ ] **Step 4: 브라우저에서 직접 확인한다**

`http://localhost:4173/draw.html`에서:

1. 몇 번 뽑은 뒤 기계 라벨(`eOrth Boarding Pass`)을 **3초 길게 누른다** → 관리 패널이 열린다
2. 짧게 누르면 열리지 않는다
3. "발권" 열의 합계가 뽑은 횟수와 같다
4. 3등 남음을 `0`으로 바꾼다 → 이후 3등이 나오지 않는다
5. `-1`을 넣으면 값이 되돌아가고 "0 이상의 정수만" 안내가 뜬다
6. "마지막 1건 되돌리기" → 해당 등급 남음이 1 늘고 발권이 1 줄어든다
7. "상태 복사" → "상태 붙여넣기"에 그대로 넣으면 같은 상태가 유지된다
8. 붙여넣기에 `{`를 넣으면 "형식이 맞지 않아" 안내가 뜨고 상태가 안 바뀐다
9. 모든 등급을 0으로 만들면 버튼이 "발권 종료"로 잠기고 안내 문구가 뜬다
10. "날짜 다시 고르기" → 확인 후 날짜 선택 화면으로 돌아간다

- [ ] **Step 5: 커밋**

```bash
git add docs/draw.html
git commit -F - <<'EOF'
feat(event): 부스 뽑기 관리 패널

라벨 3초 길게 누르기로 연다. 재고 직접 보정·마지막 1건 되돌리기·
상태 복사/붙여넣기·날짜 초기화.

되돌리기는 부스에서 반드시 필요하다(오조작·참가자 이탈). 상태 복사는
localStorage가 날아갔을 때의 유일한 복구 수단이라, 클립보드가 막히면
prompt로 원문을 띄워 스태프가 직접 복사하게 한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: 게시 등록과 전체 검증

**Files:**
- Modify: `scripts/lib/pagesFiles.mjs`

**Interfaces:**
- Consumes: Task 1~3의 `docs/draw-core.js`, `docs/draw.html`
- Produces: 없음

- [ ] **Step 1: 게시 목록에 등록한다**

`scripts/lib/pagesFiles.mjs`의 `PUBLISHED_FILES` 배열 끝(`'event.html',` 다음)에 추가한다:

```js
  'draw-core.js',            // 부스 뽑기 재고 로직 (docs/draw.html이 import)
  'draw.html',               // 부스 뽑기 발권 화면
```

- [ ] **Step 2: 전체 검증을 돌린다**

```bash
npm test
```

Expected: 전부 통과. `draw-core.verify.mjs`가 목록에 포함돼 실행되는지 출력에서 확인한다.
`check-docs-sync`가 "게시 대기"로 새 파일 2개를 보고하면 정상이다(아직 게시 전이므로).

- [ ] **Step 3: 게시 대기 상태를 확인한다**

```bash
npm run pages:check
```

Expected: `draw.html`과 `draw-core.js`가 `new`로 표시된다. 아직 게시하지 않는다 —
행사 날짜와 꽝 비율이 확정되기 전에 공개본을 올릴 이유가 없다.

- [ ] **Step 4: 커밋**

```bash
git add scripts/lib/pagesFiles.mjs
git commit -F - <<'EOF'
chore(event): 뽑기 페이지를 게시 목록에 등록

PUBLISHED_FILES에 빠져 있으면 게시도 안 되고 check-docs-sync도
변경을 못 알아챈다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## 행사 전에 반드시 해야 하는 것

구현이 끝나도 아래가 남는다. 코드가 아니라 값과 절차의 문제다.

1. **꽝 비율 확정** → `DAY_POOLS`의 `miss`. 스티커 발주(1,000매, 여유 0)와 함께 정해야 한다.
2. **행사 날짜 확정** → `EVENT_DAYS`의 `date`와 `flight`. 지금은 임시값이다.
3. **`npm run pages:publish`** — gh-pages에 올려야 실제로 열린다. master 푸시만으로는 안 바뀐다.
4. **실기기 왕복 확인** — 부스에서 쓸 그 기기·그 브라우저로 열어 발권·새로고침·관리 패널까지.
5. **스태프 인수인계** — 관리 패널 여는 법(라벨 3초), 정오·종료 시 "상태 복사" 백업.
6. **기기를 2대 쓴다면** — B 기기는 관리 패널에서 1등·2등을 0으로 내리고 3·4·5등을 절반으로
   맞춘다. 안 하면 하나뿐인 필름카메라가 양쪽에서 각각 당첨된다.
