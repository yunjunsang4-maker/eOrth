// 뽑기 재고 검증. 여기서 틀리면 3등이 배정 수량보다 많이 나가거나,
// 첫날에 있지도 않은 항공권이 당첨된다.
import {
  GRADE_KEYS, GRADES, DAY_POOLS, EVENT_DAYS, makePool, drawOne, undoLast, setRemaining,
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
  // null과 비교해야 한다 — drawOne은 grade를 null로 시작해 키를 넣거나 null을 유지하므로
  // undefined를 돌려주는 경로가 없다. undefined와 비교하면 클램프가 깨져도 항상 통과한다.
  ok_(first.grade !== null, '가중 추출이 항상 등급을 반환한다');

  // 지키려는 대상은 drawOne의 클램프다. rand가 0.999면 클램프를 지워도 값이 같아 아무것도
  // 못 잡으므로, 1을 돌려주는 구현을 직접 넣어 클램프가 있어야만 통과하게 만든다.
  const edge = drawOne(makePool('D2'), () => 1, 0);
  ok_(edge.grade !== null, 'rand가 1을 돌려줘도 마지막 표로 고정돼 등급이 나온다');

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
  eq(st.history.length, 0, '2만 번을 뽑아도 원본 이력은 비어 있다(불변)');
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
  const orig = makePool('D2');
  const st = setRemaining(orig, 'g3', 7);
  eq(remaining(st).g3, 7, '남은 수량을 직접 지정할 수 있다');
  eq(remaining(orig).g3, 50, '보정이 원본을 건드리지 않는다');
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
  // 잘린 JSON을 붙여넣는 사고를 막는다 — 아래 두 부류가 통과하면 부스에서 재고가 조용히 틀어진다
  eq(restore('{"version":1,"day":"D2","remaining":{"g5":2},"history":[]}'), null, '등급 키가 빠지면 null');
  eq(restore('{"version":1,"day":"D1","remaining":' + JSON.stringify(DAY_POOLS.D1) + ',"history":[1,2]}'), null, 'history 항목이 객체가 아니면 null');
  eq(restore('{"version":1,"day":"D1","remaining":' + JSON.stringify(DAY_POOLS.D1) + ',"history":[{"at":0,"grade":"g9"}]}'), null, 'history의 등급이 알 수 없는 값이면 null');
  eq(restore('{"version":1,"day":"D1","remaining":' + JSON.stringify(DAY_POOLS.D1) + ',"history":[{"grade":"g5"}]}'), null, 'history에 시각이 없으면 null');
}

// ── 표 사이 대응 ──
// renderPass가 GRADES[k].stripe와 EVENT_DAYS[day].date를 무방호로 읽는다.
// 여기서 안 잡으면 등급 키 오타나 날짜 추가가 npm test를 전부 통과한 채 부스에서 터진다.
{
  ok_(GRADE_KEYS.every((k) => GRADES[k]), 'GRADE_KEYS가 전부 GRADES에 정의돼 있다');
  ok_(Object.keys(DAY_POOLS).every((d) => EVENT_DAYS[d]), 'DAY_POOLS의 모든 날짜가 EVENT_DAYS에 있다');
}

// ── 알 수 없는 날짜 ──
throws(() => makePool('D3'), '정의되지 않은 날짜는 거부한다');

console.log(fail === 0 ? '\n뽑기 재고 ✓ 전부 통과' : `\n뽑기 재고 ✗ ${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
