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

// ── 추천 근거 문구 선택 ──
//
// 총점만 보여주면 "왜 이 사람인지"를 알 수 없다. 가장 기여도 높은 축을 골라 설명한다.
// 우선순위는 '구체적일수록 앞'이다 — 도시 > 나라 > 시의성 > 관심사 > 계절 > 공통 메이트 > 성향.
//
// ⚠️ 개인정보: 시의성 문구에 날짜·기간을 넣지 않는다("3일 전"·"지난주" 금지).
//    실시간 위치 추적으로 읽힐 수 있어 "최근"까지만 표현한다.
export interface ReasonInput {
  placeScore: number;
  recencyScore: number;
  seasonScore: number;
  interestScore: number;
  tasteScore: number;
  mutualCount: number;
  sharedCities: string[];
  sharedKeywords: string[];
  sharedCount: number;
}

export interface ReasonResult {
  key: string;
  params: Record<string, string | number>;
}

/** 가장 기여도 높은 축의 문구 키. 근거가 없으면 null(호출부가 중립 문구로 폴백) */
export function pickReason(input: ReasonInput): ReasonResult | null {
  if (input.placeScore > 0 && input.sharedCities.length > 0) {
    return { key: 'friends.reasonCity', params: { city: input.sharedCities[0] } };
  }
  if (input.placeScore > 0 && input.sharedCount > 0) {
    return { key: 'friends.overlapReason', params: { count: input.sharedCount } };
  }
  if (input.recencyScore > 0) {
    // 날짜 없음 — "최근"만 (개인정보 원칙)
    return { key: 'friends.reasonRecent', params: {} };
  }
  if (input.interestScore > 0 && input.sharedKeywords.length > 0) {
    return { key: 'friends.reasonInterest', params: { keyword: input.sharedKeywords[0] } };
  }
  if (input.seasonScore > 0) {
    return { key: 'friends.reasonSeason', params: {} };
  }
  if (input.mutualCount > 0) {
    return { key: 'friends.mutualReason', params: { count: input.mutualCount } };
  }
  if (input.tasteScore > 0) {
    return { key: 'friends.styleReason', params: {} };
  }
  return null;
}
