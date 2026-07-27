// 여행 DNA 점수 → 매칭률(%) 표시 규칙.
//
// mate_suggestions.total_score는 만점이 정확히 100이라(축 배점 합) 점수를 그대로 %로 쓴다.
//
// 예전엔 하한 30%를 뒀는데, 근거가 거의 없는 매칭도 30%로 보여 "점수가 사실과
// 안 맞는다"는 인상을 줬다. 하한을 없애고 대신 임계 미만이면 배지 자체를 숨긴다
// (근거 문구는 그대로 보여주므로 정보가 사라지지는 않는다).
export const MATCH_BADGE_MIN = 15; // 이 점수 미만이면 % 배지를 그리지 않는다
const MATCH_MAX_PERCENT = 99;      // 100%는 과한 확신

/** 배지에 표시할 % — null이면 배지를 그리지 않는다 */
export function matchPercent(score?: number | null): number | null {
  if (score == null || !Number.isFinite(score)) return null;
  if (score < MATCH_BADGE_MIN) return null;
  return Math.min(MATCH_MAX_PERCENT, Math.round(score));
}
