// src/services/photoAI/recoTypes.verify.ts
import {
  mediasFingerprint,
  dhashHamming,
  isPendingStale,
  isUnavailableRetryDue,
  STALE_PENDING_MS,
  UNAVAILABLE_RETRY_MS,
  type RecoState,
} from './recoTypes';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// ── mediasFingerprint ──
eq(mediasFingerprint(['a', 'b']) === mediasFingerprint(['a', 'b']), true, '같은 입력 = 같은 지문');
eq(mediasFingerprint(['a', 'b']) === mediasFingerprint(['b', 'a']), false, '순서 변경 감지');
eq(mediasFingerprint(['a']) === mediasFingerprint(['a', 'b']), false, '추가 감지');
eq(mediasFingerprint([]).startsWith('0:'), true, '빈 배열도 안전');

// ── dhashHamming ──
eq(dhashHamming('0000000000000000', '0000000000000000'), 0, '동일 해시 거리 0');
eq(dhashHamming('0000000000000000', 'ffffffffffffffff'), 64, '반전 해시 거리 64');
eq(dhashHamming('0000000000000000', '0000000000000001'), 1, '1비트 차이');
eq(dhashHamming(undefined, '0000000000000000'), 64, 'undefined는 최대 거리');
eq(dhashHamming('짧음', '0000000000000000'), 64, '형식 불량은 최대 거리');

// ── isPendingStale: 하트비트 기준 고착 판정 ──
// 분석 상한이 250장이 되면서 "시작 후 3분"으로 판정하면 살아 있는 분석을 죽이고
// 무한 재분석이 된다. 마지막 '진행'이 언제였는지로 판정해야 한다.
const baseState = (over: Partial<RecoState>): RecoState => ({
  tripGroupId: 'g1',
  sourceFingerprint: '3:abc',
  status: 'pending',
  cards: [],
  dismissedIds: [],
  updatedAt: 0,
  ...over,
});

eq(isPendingStale(baseState({ status: 'ready', updatedAt: 0 }), 999_999), false,
  'ready 상태는 고착이 아니다');
eq(isPendingStale(baseState({ status: 'unavailable', updatedAt: 0 }), 999_999), false,
  'unavailable 상태는 고착이 아니다');
eq(isPendingStale(baseState({ updatedAt: 0 }), STALE_PENDING_MS - 1), false,
  '한계 시간 이내면 고착이 아니다');
eq(isPendingStale(baseState({ updatedAt: 0 }), STALE_PENDING_MS + 1), true,
  '한계 시간을 넘고 진행이 없으면 고착');
// 핵심: 진행이 계속되면 총 경과가 아무리 길어도 고착이 아니다
eq(
  isPendingStale(baseState({ updatedAt: 10 * 60_000, progress: { done: 120, total: 250 } }), 10 * 60_000 + 1_000),
  false,
  '10분이 지나도 마지막 진행이 최근이면 살아 있는 분석',
);
eq(
  isPendingStale(baseState({ updatedAt: 10 * 60_000, progress: { done: 120, total: 250 } }), 10 * 60_000 + STALE_PENDING_MS + 1),
  true,
  '진행이 멈춘 채 한계 시간을 넘기면 고착',
);
eq(isPendingStale(baseState({ updatedAt: 1_000 }), 500), false,
  '미래 시각이 저장돼 있어도 고착으로 보지 않는다(시계 변경 방어)');

// ── isUnavailableRetryDue: unavailable 재시도 쿨다운 판정 ──
// RecoSection(호출할지)과 recoEngine(호출돼도 돌지)이 같은 함수를 쓴다.
// 판정이 갈라지면 "섹션은 부르는데 엔진이 막는" 죽은 조합이 생긴다(2026-09 실제 결함).
eq(isUnavailableRetryDue(baseState({ status: 'unavailable', updatedAt: 0 }), UNAVAILABLE_RETRY_MS - 1), false,
  '쿨다운 이내면 아직 재시도하지 않는다');
eq(isUnavailableRetryDue(baseState({ status: 'unavailable', updatedAt: 0 }), UNAVAILABLE_RETRY_MS), true,
  '쿨다운 경계(정확히 30분)부터 재시도한다 — >= 라서 엔진 게이트(< 차단)와 정확히 상보');
eq(isUnavailableRetryDue(baseState({ status: 'unavailable', updatedAt: 0 }), UNAVAILABLE_RETRY_MS + 1), true,
  '쿨다운을 넘기면 재시도한다');
eq(isUnavailableRetryDue(baseState({ status: 'ready', updatedAt: 0 }), UNAVAILABLE_RETRY_MS + 1), false,
  'ready 상태는 재시도 대상이 아니다');
eq(isUnavailableRetryDue(baseState({ status: 'pending', updatedAt: 0 }), UNAVAILABLE_RETRY_MS + 1), false,
  'pending 상태는 재시도 대상이 아니다(고착 판정은 isPendingStale 몫)');
eq(isUnavailableRetryDue(baseState({ status: 'unavailable', updatedAt: 1_000 }), 500), false,
  '미래 시각이 저장돼 있어도 재시도하지 않는다(시계 변경 방어 — isPendingStale과 동일)');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
