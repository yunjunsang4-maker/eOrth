// src/store/stableActions.verify.ts
// recordStore 액션 슬라이스의 "참조 영구 안정 + 호출은 최신 클로저" 계약을 지킨다.
// React 렌더 없이 확인할 수 있는 부분(래퍼 생성 로직)만 본다.
import { makeStableActions } from './stableActions';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// 렌더 1회차의 클로저 묶음 — count는 그 렌더의 '상태' 역할
type Acts = { add: (n: number) => number; label: (s?: string) => string; nothing: () => void };
const make = (count: number): Acts => ({
  add: (n) => count + n,
  label: (s) => `${s ?? '없음'}@${count}`,
  nothing: () => {},
});
const ref: { current: Acts } = { current: make(1) };
const stable = makeStableActions(ref);
const addRef = stable.add;

// 반환값이 그대로 전달돼야 한다 — addRecord가 id를, addTripGroup이 카드를 돌려준다
eq(stable.add(10), 11, '반환값 전달: 1회차 상태(1)+10 → 11');
// 선택 인자(undefined)도 그대로 넘어가야 한다 — addRecord(rec, opts?) 같은 시그니처
eq(stable.label(), '없음@1', '선택 인자 생략 → undefined 그대로 전달');

// Provider가 다시 렌더되어 ref.current만 바뀐 상황
ref.current = make(5);
eq(stable.add === addRef, true, '재렌더 후에도 래퍼 참조는 그대로(소비자 리렌더·effect 재실행 없음)');
eq(stable.add(10), 15, '재렌더 후 호출은 최신 클로저(상태 5)로 실행된다 — 낡은 상태를 읽지 않음');
eq(stable.label('x'), 'x@5', '인자가 있는 호출도 최신 클로저로');

// 키는 빠짐없이, 함수로 만들어져야 한다 — 하나라도 빠지면 소비자에서 undefined 호출로 터진다
eq(Object.keys(stable).sort(), ['add', 'label', 'nothing'], '생성 시점의 키 전부에 래퍼가 있다');
eq(Object.values(stable).every((f) => typeof f === 'function'), true, '모든 값이 함수');
eq(stable.nothing(), undefined, 'void 액션은 undefined 반환');

// 빈 묶음 — 경계
eq(Object.keys(makeStableActions({ current: {} })), [], '빈 묶음 → 빈 객체');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
