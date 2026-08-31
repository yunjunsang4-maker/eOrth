/**
 * 개인화 재순위 — 기존 게시물의 형식 사용 빈도로 후보 가중 + 형식 다양성 보장 (설계 §5)
 *
 * v1은 형식 빈도만 반영한다. conceptHist(무드 분포)는 과거 사진 재분석 비용 때문에
 * 타입 자리만 예약(2차에서 사용 로그·분석 캐시 기반으로 채움).
 */
import type { RecoCandidate } from './recoTypes';

export interface UserStylePrior {
  viewTypeCounts: Record<string, number>;
  conceptHist?: Partial<Record<string, number>>; // v2 예약
}

const PERSONAL_WEIGHT = 0.3; // 개인화가 원점수를 뒤집을 수 있는 최대 폭

export function buildStylePrior(records: { viewType?: string }[]): UserStylePrior {
  const viewTypeCounts: Record<string, number> = {};
  for (const r of records) {
    if (!r.viewType) continue;
    viewTypeCounts[r.viewType] = (viewTypeCounts[r.viewType] ?? 0) + 1;
  }
  return { viewTypeCounts };
}

/**
 * 재순위 + 다양성 보장.
 * 1) 개인화 점수 = score * (1 + PERSONAL_WEIGHT * 형식 사용 비율)
 * 2) 1라운드: 형식별 최고 후보를 형식당 1개씩 점수순으로 채운다 (다양성 — "게시물이 있어도 여러 버전")
 * 3) 2라운드: 자리가 남으면 나머지 후보를 점수순으로 채운다
 */
export function rankCandidates(
  cands: RecoCandidate[],
  prior: UserStylePrior,
  maxCards: number = 3
): RecoCandidate[] {
  if (cands.length === 0) return [];
  const total = Object.values(prior.viewTypeCounts).reduce((s, n) => s + n, 0);

  const personalScore = (c: RecoCandidate): number => {
    const freq = total > 0 ? (prior.viewTypeCounts[c.viewType] ?? 0) / total : 0;
    return c.score * (1 + PERSONAL_WEIGHT * freq);
  };

  const sorted = [...cands].sort((a, b) => personalScore(b) - personalScore(a));

  const picked: RecoCandidate[] = [];
  const usedTypes = new Set<string>();
  for (const c of sorted) {
    if (picked.length >= maxCards) break;
    if (usedTypes.has(c.viewType)) continue;
    usedTypes.add(c.viewType);
    picked.push(c);
  }
  for (const c of sorted) {
    if (picked.length >= maxCards) break;
    if (!picked.includes(c)) picked.push(c);
  }
  return picked;
}
