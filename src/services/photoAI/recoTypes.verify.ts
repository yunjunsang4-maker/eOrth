// src/services/photoAI/recoTypes.verify.ts
import {
  mediasFingerprint,
  dhashHamming,
  isPendingStale,
  isUnavailableRetryDue,
  STALE_PENDING_MS,
  UNAVAILABLE_RETRY_MS,
  RECO_CONCEPTS,
  type RecoState,
} from './recoTypes';
import { ZERO_CONCEPT_SCORES } from './labelTaxonomy';

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

// ── RECO_CONCEPTS: 컨셉 목록의 단일 출처 ──
// formatCandidates가 예전에 컨셉 배열을 두 벌 하드코딩하고 있어서, 컨셉을 늘려도
// 새 컨셉의 피드 후보가 영영 안 만들어지는 상태였다(2026-09-17 제거).
// 아래 두 검사는 "출처가 다시 갈라지면 즉시 깨지게" 두는 장치다.
eq(RECO_CONCEPTS.length, 17, '컨셉 17종(라벨 14종 + 톤 3종)');
eq(RECO_CONCEPTS[0], 'emotional',
  '동률 우선순위 1번은 emotional — 새 컨셉은 배열 끝에 붙여야 기존 사진 판정이 안 흔들린다');
// 앞 7개가 자리를 지켜야 기존 사진의 동률 판정이 그대로다. 중간 삽입을 이 단정이 잡는다.
eq(RECO_CONCEPTS.slice(0, 7), ['emotional', 'hip', 'fun', 'food', 'info', 'transit', 'activity'],
  '기존 7종의 위치가 그대로 — 중간 삽입은 기존 사진의 동률 판정을 조용히 바꾼다');
eq(RECO_CONCEPTS.slice(7), ['people', 'night', 'animal', 'cafe', 'culture', 'nature', 'stay', 'shopping', 'vivid', 'mono'],
  '2026-09-18 추가분 10개가 배열 끝에 이 순서로 붙어 있다');
eq(new Set(RECO_CONCEPTS).size, RECO_CONCEPTS.length,
  '중복 없음 — 오타로 같은 키가 두 번 들어가면 ZERO 키 집합 비교를 통과해 버린다');
eq([...Object.keys(ZERO_CONCEPT_SCORES)].sort(), [...RECO_CONCEPTS].sort(),
  'ZERO_CONCEPT_SCORES 키 = RECO_CONCEPTS (갈라지면 새 컨셉이 타입 오류 없이 조용히 0으로 고정된다)');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
