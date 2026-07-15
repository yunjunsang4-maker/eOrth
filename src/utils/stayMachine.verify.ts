// src/utils/stayMachine.verify.ts
import { decideOnVisitedChange, shouldNudgeEnd, STAY_NUDGE_MS, StaySnapshot } from './stayMachine';

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

// 체류 없음 + 새 해외국(JP) → 프롬프트 후보
eq(decideOnVisitedChange({ visitedCountryCode: 'JP', homeCountryCode: 'KR', stay: null }),
   { pauseStay: false, resumeStay: false, isNewAbroadCountry: true }, '체류없음 새 해외국');

// 넛지: paused + 60일 경과
eq(shouldNudgeEnd(pausedJP, 1000 + STAY_NUDGE_MS), true, '넛지: 60일 경과');
eq(shouldNudgeEnd(pausedJP, 1000 + STAY_NUDGE_MS - 1), false, '넛지: 60일 미만');
eq(shouldNudgeEnd(stayJP, 1000 + STAY_NUDGE_MS), false, '넛지: active는 제외');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
