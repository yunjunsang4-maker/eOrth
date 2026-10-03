// src/store/minuteTick.verify.ts — 분 단위 공용 시계(구독 수에 따른 타이머 켜기/끄기, 분 변경 알림)
import { createMinuteTick, MINUTE_MS } from './minuteTick';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// 가짜 시계·타이머·포그라운드 — 실제 시간을 기다리지 않고 경계를 재현한다
let clock = 10 * MINUTE_MS + 20_000; // 10분 20초
let pending: { cb: () => void; ms: number } | null = null;
let timersSet = 0, timersCleared = 0;
let fg: (() => void) | null = null;
let fgSubs = 0;
const tick = createMinuteTick({
  now: () => clock,
  setTimer: (cb, ms) => { timersSet++; pending = { cb, ms }; return pending; },
  clearTimer: (h) => { if (h === pending) { pending = null; } timersCleared++; },
  onForeground: (cb) => { fgSubs++; fg = cb; return () => { fgSubs--; fg = null; }; },
});
const fire = () => { const p = pending!; clock += p.ms; pending = null; p.cb(); };

// 구독자 0 — 타이머·포그라운드 리스너 모두 없다(시간 텍스트가 화면에 없으면 아무것도 돌지 않는다)
eq(tick.isRunning(), false, '구독 전: 타이머 없음');
eq(fgSubs, 0, '구독 전: 포그라운드 리스너 없음');
eq(tick.getSnapshot(), 10, '스냅샷 = 현재 분(10)');

// 첫 구독 → 타이머 1개 + 리스너 1개, 다음 분 경계까지 남은 시간(40초 + 여유 50ms)
let a = 0, b = 0;
const offA = tick.subscribe(() => { a++; });
eq(tick.isRunning(), true, '첫 구독: 타이머 켜짐');
eq(fgSubs, 1, '첫 구독: 포그라운드 리스너 1개');
eq(pending && (pending as { ms: number }).ms, 40_050, '첫 타이머: 다음 분 경계까지 40초+50ms');

// 두 번째 구독 → 타이머·리스너를 더 늘리지 않는다(카드가 많아도 공용 1개)
const offB = tick.subscribe(() => { b++; });
eq(timersSet, 1, '두 번째 구독: 타이머 추가 없음');
eq(fgSubs, 1, '두 번째 구독: 리스너 추가 없음');

// 분 경계 통과 → 스냅샷 11, 구독자마다 알림 1회, 다음 타이머는 정확히 1분+여유 뒤
fire();
eq(tick.getSnapshot(), 11, '경계 통과: 스냅샷 11');
eq([a, b], [1, 1], '경계 통과: 구독자마다 알림 1회');
eq(pending && (pending as { ms: number }).ms, MINUTE_MS - 50 + 50, '다음 타이머: 경계(+50ms 지점)에서 다음 경계까지');

// 같은 분 안에서 포그라운드 복귀 → 분이 같으면 알림 없음(헛 리렌더 0)
clock += 1_000;
fg!();
eq([a, b], [1, 1], '같은 분 포그라운드 복귀: 알림 없음');

// 백그라운드에서 타이머가 멈춰 있다가 5분 뒤 복귀 → 즉시 한 번 맞춘다
clock += 5 * MINUTE_MS;
fg!();
eq(tick.getSnapshot(), 16, '5분 뒤 포그라운드 복귀: 스냅샷 즉시 16');
eq([a, b], [2, 2], '5분 뒤 포그라운드 복귀: 알림 1회');

// 하나 해제 → 아직 구독자가 있으니 타이머 유지, 해제된 쪽엔 알림 없음
offA();
eq(tick.isRunning(), true, '하나 해제: 타이머 유지');
fire();
eq([a, b], [2, 3], '해제된 구독자엔 알림 없음');

// 마지막 해제 → 타이머·포그라운드 리스너 모두 정리
offB();
eq(tick.isRunning(), false, '마지막 해제: 타이머 꺼짐');
eq(pending, null, '마지막 해제: 대기 타이머 취소');
eq(fgSubs, 0, '마지막 해제: 포그라운드 리스너 해제');

// 쉬는 동안 분이 흐른 뒤 다시 구독 → 켤 때 한 번 맞추고 새 타이머 1개
clock += 3 * MINUTE_MS;
let c = 0;
const offC = tick.subscribe(() => { c++; });
eq(tick.getSnapshot() >= 19, true, '재구독: 쉬는 동안 흐른 분을 반영');
eq(tick.isRunning(), true, '재구독: 타이머 다시 켜짐');
eq(fgSubs, 1, '재구독: 리스너 1개');
offC();
eq(tick.isRunning(), false, '재구독 해제: 타이머 꺼짐');

// 알림 도중 마지막 구독자가 동기로 해제 → 타이머 콜백이 다음 타이머를 다시 걸지 않아야 한다(고아 타이머 방지)
let offD: (() => void) | null = null;
offD = tick.subscribe(() => { offD?.(); offD = null; });
eq(tick.isRunning(), true, '알림 중 해제: 구독 직후 타이머 켜짐');
fire();
eq(tick.isRunning(), false, '알림 중 해제: 콜백 뒤 타이머 꺼짐');
eq(pending, null, '알림 중 해제: 다음 타이머를 걸지 않음');
eq(fgSubs, 0, '알림 중 해제: 리스너 0');

// getSnapshot은 분이 안 바뀌면 같은 값 — useSyncExternalStore 무한 리렌더 방지
eq(tick.getSnapshot() === tick.getSnapshot(), true, '연속 조회: 같은 값');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
