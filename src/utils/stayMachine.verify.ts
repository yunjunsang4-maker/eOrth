// src/utils/stayMachine.verify.ts
import { decideOnVisitedChange, shouldNudgeEnd, stayCoversDate, isAmbiguousForPausedStay, STAY_NUDGE_MS, StaySnapshot } from './stayMachine';
import { parseDotDate } from './momentMatch';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const stayJP: StaySnapshot = { countryCode: 'JP', status: 'active', lastActiveAt: 1000 };
const pausedJP: StaySnapshot = { countryCode: 'JP', status: 'paused', lastActiveAt: 1000 };

// 거주국(KR) 복귀 → active 체류 일시정지
eq(decideOnVisitedChange({ visitedCountryCode: 'KR', homeCountryCode: 'KR', stay: stayJP }),
   { pauseStay: true, resumeStay: false, isNewAbroadCountry: false }, 'KR 복귀 → 일시정지');

// 체류국(JP) 유지 (이미 active) → 아무 것도 안 함
eq(decideOnVisitedChange({ visitedCountryCode: 'JP', homeCountryCode: 'KR', stay: stayJP }),
   { pauseStay: false, resumeStay: false, isNewAbroadCountry: false }, 'JP 유지 → none');

// 체류국(JP) 복귀 (paused) → 재개
eq(decideOnVisitedChange({ visitedCountryCode: 'JP', homeCountryCode: 'KR', stay: pausedJP }),
   { pauseStay: false, resumeStay: true, isNewAbroadCountry: false }, 'JP 복귀 → 재개');

// 제3국(TH) 감지 (JP active 중) → 체류 일시정지 + 새 해외국
eq(decideOnVisitedChange({ visitedCountryCode: 'TH', homeCountryCode: 'KR', stay: stayJP }),
   { pauseStay: true, resumeStay: false, isNewAbroadCountry: true }, 'TH → 일시정지+새국');

// 이미 paused인 체류에는 다시 pauseStay가 나오지 않아야 한다 — recordStore가 pause 때 lastActiveAt을 now로 갱신하므로
// (QA M1) 제3국→거주국 같은 재판정이 '처음 떠난 시각'을 덮으면 넛지·애매 판정 기준이 밀린다
eq(decideOnVisitedChange({ visitedCountryCode: 'KR', homeCountryCode: 'KR', stay: pausedJP }),
   { pauseStay: false, resumeStay: false, isNewAbroadCountry: false }, 'paused 중 KR 감지 → 재일시정지 아님(lastActiveAt 유지)');
eq(decideOnVisitedChange({ visitedCountryCode: 'TH', homeCountryCode: 'KR', stay: pausedJP }),
   { pauseStay: false, resumeStay: false, isNewAbroadCountry: true }, 'paused 중 제3국 감지 → 재일시정지 아님(새국만)');

// 체류 없음 + 새 해외국(JP) → 프롬프트 후보
eq(decideOnVisitedChange({ visitedCountryCode: 'JP', homeCountryCode: 'KR', stay: null }),
   { pauseStay: false, resumeStay: false, isNewAbroadCountry: true }, '체류없음 새 해외국');

// 넛지: paused + 60일 경과
eq(shouldNudgeEnd(pausedJP, 1000 + STAY_NUDGE_MS), true, '넛지: 60일 경과');
eq(shouldNudgeEnd(pausedJP, 1000 + STAY_NUDGE_MS - 1), false, '넛지: 60일 미만');
eq(shouldNudgeEnd(stayJP, 1000 + STAY_NUDGE_MS), false, '넛지: active는 제외');

// ─── stayCoversDate: 회고·타기기 기록을 체류 카드에 붙일지(기간 포함, 양끝 포함) ───
const d = (s: string) => parseDotDate(s)!;
const now = d('2026.11.02') + 15 * 60 * 60 * 1000; // 오늘 오후 3시
const ended = { startedAt: '2026.03.01', endedAt: '2026.08.31' };
const open = { startedAt: '2026.03.01' };
eq(stayCoversDate(ended, d('2026.03.01'), now), true, '체류 시작일 당일 기록 → 포함');
eq(stayCoversDate(ended, d('2026.02.28'), now), false, '체류 시작 전날 기록 → 제외');
eq(stayCoversDate(ended, d('2026.08.31'), now), true, '체류 종료일 당일 기록 → 포함');
eq(stayCoversDate(ended, d('2026.09.01'), now), false, '체류 종료 다음날 기록 → 제외');
eq(stayCoversDate(open, d('2026.11.02'), now), true, '미종료: 오늘 기록 → 포함(상한=지금)');
eq(stayCoversDate(open, d('2026.11.03'), now), false, '미종료: 내일(미래) 날짜 기록 → 제외');
eq(stayCoversDate(open, d('2026.06.15'), now), true, '미종료: 기간 중간 기록 → 포함');
// endedAt은 기록 날짜(endDate 등)에서 오므로 하이픈 표기가 섞일 수 있다 — 숫자 비교라 같은 결과여야 한다
eq(stayCoversDate({ startedAt: '2026.03.01', endedAt: '2026-08-31' }, d('2026.08.31'), now), true, '표기 섞임: 하이픈 endedAt 당일 → 포함');
// 날짜를 못 읽으면 붙이지 않는다(엉뚱한 카드 합류보다 기존 7일 규칙으로 떨어지는 게 안전)
eq(stayCoversDate({ startedAt: '' }, d('2026.06.15'), now), false, '빈 startedAt → 제외');
eq(stayCoversDate({ startedAt: '2026.03.01', endedAt: 'garbage' }, d('2026.06.15'), now), false, '못 읽는 endedAt → 제외');

// ─── isAmbiguousForPausedStay: 일시정지 체류에 조용히 붙이지 말고 물어야 하나(QA F1) ───
// lastActiveAt = 7월 20일 오후 6시(귀국 직전 마지막 체류국 활동). 시각이 자정이 아니어도 '날짜'로 비교해야 한다.
const lastAt = d('2026.07.20') + 18 * 60 * 60 * 1000;
const pausedStay = { status: 'paused' as const, startedAt: '2026.03.01', lastActiveAt: lastAt };
eq(isAmbiguousForPausedStay(pausedStay, d('2026.07.20'), now), false, 'paused: lastActiveAt 당일 기록 → 애매 아님(체류 카드로)');
eq(isAmbiguousForPausedStay(pausedStay, d('2026.07.21'), now), true, 'paused: lastActiveAt 다음날 기록 → 애매(묻기)');
eq(isAmbiguousForPausedStay(pausedStay, d('2026.05.10'), now), false, 'paused: lastActiveAt 이전 기록 → 애매 아님');
// F1 재현 입력: 11월에 쓴 "10월 오사카" 회고
eq(isAmbiguousForPausedStay(pausedStay, d('2026.10.10'), now), true, 'paused: 석 달 뒤 회고 여행 → 애매(묻기)');
// active 체류는 지금처럼 조용히 체류 카드로(체류국에 있는 중이라 애매하지 않다)
eq(isAmbiguousForPausedStay({ ...pausedStay, status: 'active' }, d('2026.10.10'), now), false, 'active 체류 → 애매 아님');
// ended 체류는 기간이 닫혀 있어 묻지 않는다
eq(isAmbiguousForPausedStay({ ...pausedStay, status: 'ended', endedAt: '2026.10.31' }, d('2026.10.10'), now), false, 'ended 체류 → 애매 아님');
// 기간 밖(시작 전·미래)은 체류 대상이 아니라 애매하지도 않다
eq(isAmbiguousForPausedStay(pausedStay, d('2026.02.28'), now), false, 'paused: 체류 시작 전 기록 → 애매 아님(기간 밖)');
eq(isAmbiguousForPausedStay(pausedStay, d('2026.11.03'), now), false, 'paused: 미래 날짜 기록 → 애매 아님(기간 밖)');
// recStart가 자정이 아닌 값(ISO 폴백)이어도 같은 날이면 애매 아님
eq(isAmbiguousForPausedStay(pausedStay, d('2026.07.20') + 23 * 60 * 60 * 1000, now), false, 'paused: 같은 날 늦은 시각 recStart → 애매 아님(일 단위)');
// QA M1 재현: 3/1 시작, 체류 중 실시간 기록 없음(마지막 활동 = 시작일) → 7/20 귀국 감지로 일시정지.
// 일시정지 때 lastActiveAt을 감지 시각으로 올리므로, 귀국 뒤 쓴 6월 교토 회고는 체류 기간 안 → 애매 아님.
const pausedAtReturn = { status: 'paused' as const, startedAt: '2026.03.01', lastActiveAt: d('2026.07.20') + 9 * 60 * 60 * 1000 };
eq(isAmbiguousForPausedStay(pausedAtReturn, d('2026.06.15'), now), false, 'M1: 일시정지 전 체류 기간 회고(실시간 기록 없었음) → 애매 아님');
eq(isAmbiguousForPausedStay(pausedAtReturn, d('2026.07.20'), now), false, 'M1: 떠난 날 당일 기록 → 애매 아님');
eq(isAmbiguousForPausedStay(pausedAtReturn, d('2026.08.05'), now), true, 'M1: 귀국 뒤 날짜 기록 → 애매(묻기)');
// 갱신 전 값(시작일)이었다면 같은 6월 회고가 애매로 잘못 판정됐다 — 이 케이스가 M1의 원인
eq(isAmbiguousForPausedStay({ ...pausedAtReturn, lastActiveAt: d('2026.03.01') }, d('2026.06.15'), now), true, 'M1 원인: lastActiveAt이 시작일에 머물면 체류 중 회고도 애매');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
