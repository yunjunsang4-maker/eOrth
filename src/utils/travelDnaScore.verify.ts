// src/utils/travelDnaScore.verify.ts
// 여행 DNA 채점 검증. 이게 깨지면 매칭 점수가 조용히 틀어진다 — 화면상 원인이 안 보인다.
import { DNA_QUESTIONS, DNA_AXES, ONBOARDING_QUESTION_IDS } from '../constants/travelDna';
import { scoreAxes, answeredCount, isValidDna, makeTypeLabel, type DnaAnswers } from './travelDnaScore';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// ── 1) 문항 데이터 무결성 ──
{
  const ids = DNA_QUESTIONS.map((q) => q.id);
  eq(new Set(ids).size, ids.length, '문항 id 중복 없음');
  eq(DNA_QUESTIONS.filter((q) => q.weight !== 1 && q.weight !== 2).length, 0, '가중치는 1 또는 2');
  const axesWithQ = new Set(DNA_QUESTIONS.map((q) => q.axis));
  eq(DNA_AXES.filter((a) => !axesWithQ.has(a)), [], '모든 축에 문항이 1개 이상');
  const missingText = DNA_QUESTIONS.filter((q) => !q.ko.s || !q.ko.a || !q.ko.b || !q.en.s || !q.en.a || !q.en.b);
  eq(missingText.map((q) => q.id), [], '모든 문항에 ko/en 문구가 채워져 있음');
  // 온보딩 축약판은 축마다 정확히 1문항이어야 한다 — 빠진 축이 있으면 그 축이 영영 중립에 머문다
  const onbAxes = ONBOARDING_QUESTION_IDS.map((id) => DNA_QUESTIONS.find((q) => q.id === id)?.axis);
  eq(onbAxes.filter((a) => !a), [], '축약판 id가 모두 실제 문항');
  eq([...new Set(onbAxes)].length, DNA_AXES.length, '축약판이 모든 축을 정확히 한 번씩 덮음');
}

// ── 2) 전체 응답 — 한쪽으로 몰면 극단값 ──
{
  const allA: DnaAnswers = {}; DNA_QUESTIONS.forEach((q) => { allA[q.id] = 'A'; });
  const allB: DnaAnswers = {}; DNA_QUESTIONS.forEach((q) => { allB[q.id] = 'B'; });
  eq(DNA_AXES.map((a) => scoreAxes(allA)[a]), DNA_AXES.map(() => 0), '전부 A → 모든 축 0');
  eq(DNA_AXES.map((a) => scoreAxes(allB)[a]), DNA_AXES.map(() => 100), '전부 B → 모든 축 100');
}

// ── 3) 수축 — 축약판 1문항이 극단이 되면 안 된다 ──
{
  const onlyOnb: DnaAnswers = {};
  ONBOARDING_QUESTION_IDS.forEach((id) => { onlyOnb[id] = 'B'; });
  const s = scoreAxes(onlyOnb);
  // plan 축: 전체 가중치 2+1+1+1+2 = 7, 답한 가중치 2 → conf = 2/7
  // raw = 100 → 50 + 50 * (2/7) = 64.28 → 64
  eq(s.plan, 64, '축약판 1문항(B) → 극단(100)이 아니라 64');
  const extremes = DNA_AXES.filter((a) => s[a] === 0 || s[a] === 100);
  eq(extremes, [], '축약판만으로는 어떤 축도 극단이 되지 않는다');
}

// ── 4) 무응답 축은 중립 ──
{
  eq(scoreAxes({})['plan'], 50, '응답 없음 → 50');
  const onlyPlan: DnaAnswers = { 1: 'B' };
  eq(scoreAxes(onlyPlan)['pace'], 50, '해당 축 무응답 → 50');
}

// ── 5) 유효 판정 — 모든 축에 1개 이상 ──
{
  const onb: DnaAnswers = {}; ONBOARDING_QUESTION_IDS.forEach((id) => { onb[id] = 'A'; });
  eq(isValidDna(onb), true, '축약판 7문항 → 유효');
  eq(isValidDna({ 1: 'A' }), false, '한 축만 답함 → 무효');
  eq(isValidDna({}), false, '무응답 → 무효');
  eq(answeredCount(onb), 7, '응답 수 집계');
}

// ── 6) 모르는 id는 무시 (구버전 응답에 삭제된 문항이 남아 있을 수 있다) ──
{
  const withGhost: DnaAnswers = { 1: 'B', 999: 'B' };
  eq(scoreAxes(withGhost)['plan'], scoreAxes({ 1: 'B' })['plan'], '존재하지 않는 문항 id는 무시');
  eq(answeredCount(withGhost), 1, '집계에서도 무시');
}

// ── 7) 유형 라벨 ──
{
  const mid = {} as any; DNA_AXES.forEach((a) => { mid[a] = 50; });

  // 모든 축이 중립 → 폴백
  eq(makeTypeLabel(mid).key, 'neutral', '전 축 중립 → 폴백 라벨');

  // 1위 purpose(A쪽 20 → 강도 30), 2위 pace(B쪽 85 → 강도 35)... 강도 큰 쪽이 1위다
  const s1 = { ...mid, purpose: 10, pace: 85 };  // 강도 40, 35
  eq(makeTypeLabel(s1).ko, '부지런한 미식가', '1위=명사(미식가), 2위=수식어(부지런한)');
  eq(makeTypeLabel(s1).key, 'purposeA-paceB', '라벨 키 형식');

  // 방향이 뒤집히면 반대쪽 문구
  const s2 = { ...mid, purpose: 90, pace: 15 };  // 강도 40, 35
  eq(makeTypeLabel(s2).ko, '느긋한 관람객', '점수>50이면 B쪽 문구');

  // 동점이면 축 순서(DNA_AXES)가 빠른 쪽이 명사
  const s3 = { ...mid, plan: 90, pace: 90 };
  eq(makeTypeLabel(s3).key, 'planB-paceB', '동점 → 앞선 축이 명사');

  // 결정성 — 동점 케이스에서 tie-break가 안정적인지 검증 (같은 입력이면 항상 같은 출력)
  eq(makeTypeLabel(s3).key, makeTypeLabel({ ...s3 }).key, '동점 재호출 → key 일관성');
  eq(makeTypeLabel(s3).ko, makeTypeLabel({ ...s3 }).ko, '동점 재호출 → ko 일관성');

  // 1위 강도가 문턱 미만이면 폴백 (2위가 아무리 있어도)
  eq(makeTypeLabel({ ...mid, plan: 60 }).key, 'neutral', '1위 강도 10 < 15 → 폴백');
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
