// 매칭 % 표시 규칙 검증.
import { matchPercent, MATCH_BADGE_MIN, pickReason } from './matchScore';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const ok = actual === expected;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) { console.log(`   기대: ${expected} / 실제: ${actual}`); failed++; }
}

console.log('▶ src/utils/matchScore.verify.ts');

// 총점이 100 만점이라 점수를 그대로 %로 쓴다
eq(matchPercent(72), 72, '72점 = 72%');
eq(matchPercent(15), 15, '임계값 15점 = 15% (배지 표시)');

// 임계 미만은 배지를 아예 숨긴다 — 예전 하한 30%가 근거 없는 매칭을
// 30%로 부풀려 보이게 하던 것을 없앤다
eq(matchPercent(14), null, '14점 = null (배지 숨김)');
eq(matchPercent(1), null, '1점 = null');
eq(matchPercent(0), null, '0점 = null');
eq(matchPercent(undefined), null, 'undefined = null');
eq(matchPercent(null), null, 'null = null');
eq(matchPercent(-5), null, '음수 = null');
eq(matchPercent(NaN), null, 'NaN = null');

// 100%는 과한 확신이라 99로 막는다
eq(matchPercent(100), 99, '100점 = 99% (상한)');
eq(matchPercent(120), 99, '초과 점수도 99%');

// 소수는 반올림
eq(matchPercent(72.4), 72, '72.4 → 72');
eq(matchPercent(72.6), 73, '72.6 → 73');

eq(MATCH_BADGE_MIN, 15, '임계 상수 노출');

// ── 근거 문구 선택 ──
// placeScore(희소성 비율×25 반올림)는 도시·나라 분기의 가드로 쓰지 않는다 —
// 흔한 나라 1곳만 겹쳐도 비율이 작아 반올림 시 0이 될 수 있어서다.
// ReasonInput에는 애초에 placeScore 필드가 없다(sharedCities/sharedCount만으로 판단).
// season/interest/taste 3축은 서버가 survey_score로 대체(상시 0 반환)하며 ReasonInput에서 제거됐다.
const base = {
  recencyScore: 0, surveyScore: 0,
  mutualCount: 0, sharedCities: [] as string[], sharedCount: 0,
};

// 도시가 있으면 나라보다 강한 근거 — "둘 다 교토"가 "둘 다 일본"보다 구체적이다
eq(
  pickReason({ ...base, sharedCities: ['교토'], sharedCount: 1 })?.key,
  'friends.reasonCity',
  '도시 겹침이 나라보다 우선',
);

// 새 동작 고정: placeScore 없이 sharedCities만으로도 도시 근거가 나온다
// (0점으로 반올림된 흔한 나라 1곳 겹침도 국기 칩·문구가 일치해야 한다)
eq(
  pickReason({ ...base, sharedCities: ['방콕'] })?.key,
  'friends.reasonCity',
  'placeScore 없이 sharedCities만으로 도시 근거',
);

// 도시가 없으면 나라
eq(
  pickReason({ ...base, sharedCount: 1 })?.key,
  'friends.overlapReason',
  '도시 없으면 나라 근거',
);

// 새 동작 고정: placeScore 없이 sharedCount만으로도 나라 근거가 나온다
eq(
  pickReason({ ...base, sharedCount: 3 })?.key,
  'friends.overlapReason',
  'placeScore 없이 sharedCount만으로 나라 근거',
);

// 장소가 없으면 시의성
eq(pickReason({ ...base, recencyScore: 15 })?.key, 'friends.reasonRecent', '장소 없으면 시의성');

// 그다음 설문 성향(임계 20 이상)
eq(pickReason({ ...base, surveyScore: 20 })?.key, 'friends.reasonDna', '설문 성향 근거');

// 임계 미만이면 다음 축(공통 메이트)으로 넘어간다
eq(
  pickReason({ ...base, surveyScore: 19, mutualCount: 2 })?.key,
  'friends.mutualReason',
  '설문 성향 임계 미만이면 넘어감',
);

// 그다음 공통 메이트
eq(pickReason({ ...base, mutualCount: 2 })?.key, 'friends.mutualReason', '공통 메이트 근거');

// 아무 근거도 없으면 null (호출부가 중립 문구로 폴백)
eq(pickReason({ ...base }), null, '근거 없으면 null');

// 도시·나라 데이터가 전혀 없으면 다음 축(시의성)으로 넘어간다
eq(
  pickReason({ ...base, sharedCount: 0, recencyScore: 15 })?.key,
  'friends.reasonRecent',
  '장소 데이터 없으면 다음 축',
);

// 시의성 문구에는 날짜 관련 파라미터가 없어야 한다 (개인정보 원칙)
eq(Object.keys(pickReason({ ...base, recencyScore: 15 })?.params ?? {}).length, 0,
   '시의성 문구에 날짜 파라미터 없음');

// 우선순위 고정 — 두 축이 동시에 있을 때 더 구체적인 쪽이 이겨야 한다.
// (각 축을 하나씩만 켜서 테스트하면 분기 순서가 뒤바뀌어도 전부 통과한다)
eq(
  pickReason({ ...base, recencyScore: 15, surveyScore: 20 })?.key,
  'friends.reasonRecent',
  '시의성 > 설문 성향',
);
eq(
  pickReason({ ...base, surveyScore: 20, mutualCount: 2 })?.key,
  'friends.reasonDna',
  '설문 성향 > 공통 메이트',
);

if (failed > 0) { console.log(`\n❌ ${failed}건 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
