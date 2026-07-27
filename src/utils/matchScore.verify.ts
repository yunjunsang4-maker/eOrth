// 매칭 % 표시 규칙 검증.
import { matchPercent, MATCH_BADGE_MIN } from './matchScore';

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

if (failed > 0) { console.log(`\n❌ ${failed}건 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
