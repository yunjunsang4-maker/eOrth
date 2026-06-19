/**
 * Step 3(기능) / Step 4 — 베스트컷 선정
 *
 * 품질(Step 2)·의미(semantic) 신호를 가중 합산하여 점수를 매기고,
 * 스팟 그룹별로 상위 1~3장만 bestCutIds 로 추출한다.
 *
 * 제외 규칙:
 *  - semantic.isDocument(영수증/지도/스크린샷) → 후보 제외
 *  - quality.passed === false(흔들림/노출 불량) → 후보 제외
 *
 * 가중치 설계:
 *  - 현재 네이티브가 제공하는 신호: aestheticsScore / blurScore / exposureScore / isDocument
 *  - 얼굴(웃음)/음식/랜드마크 등 semantic 필드는 추후 ML Kit/Vision 검출기를 붙이면
 *    semanticBonus 가 자동 반영되도록 확장 지점을 열어 둠.
 */

import type { PhotoMeta, PhotoSemantic, SpotGroup } from './types';

export interface ScoreWeights {
  aesthetics: number; // 미학(구도/색감)
  sharpness: number;  // 선명도
  exposure: number;   // 노출 적정도
}

export interface SelectionOptions {
  weights?: Partial<ScoreWeights>;
  /** 그룹당 최대 베스트컷 수. 기본 3 */
  maxPerGroup?: number;
}

const DEFAULT_WEIGHTS: ScoreWeights = {
  aesthetics: 0.5,
  sharpness: 0.3,
  exposure: 0.2,
};

/** 의미 분석 가산점 (검출기가 붙기 전엔 모두 0) */
function semanticBonus(s?: PhotoSemantic): number {
  if (!s) return 0;
  let bonus = 0;
  if (s.isSmiling) bonus += 0.15;
  else if (s.hasFace) bonus += 0.08;
  if (s.isLandmark) bonus += 0.08;
  if (s.isFood) bonus += 0.06;
  if (s.isLandscape) bonus += 0.04;
  return bonus;
}

/**
 * 사진 1장의 베스트컷 점수(0~1+). 제외 대상은 0.
 */
export function scorePhoto(p: PhotoMeta, weights: ScoreWeights = DEFAULT_WEIGHTS): number {
  if (p.semantic?.isDocument) return 0;        // 문서/영수증/스크린샷 제외
  if (p.quality?.passed === false) return 0;   // 기술적 불량 제외

  // 미지원/미측정 신호는 중립값 0.5
  const aesthetics = p.quality?.aestheticsScore ?? 0.5;
  const sharp = p.quality?.blurScore ?? 0.5;
  const exposure = p.quality?.exposureScore ?? 0.5;

  const base =
    aesthetics * weights.aesthetics +
    sharp * weights.sharpness +
    exposure * weights.exposure;

  return base + semanticBonus(p.semantic);
}

/**
 * 한 그룹에서 베스트컷 id 목록(점수 내림차순, 최대 maxPerGroup)을 고른다.
 */
export function selectBestCuts(
  group: SpotGroup,
  photosById: Map<string, PhotoMeta>,
  options: SelectionOptions = {}
): string[] {
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights };
  const maxPerGroup = options.maxPerGroup ?? 3;

  return group.photoIds
    .map((id) => photosById.get(id))
    .filter((p): p is PhotoMeta => p !== undefined)
    .map((p) => ({ id: p.id, score: scorePhoto(p, weights) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPerGroup)
    .map((x) => x.id);
}

/**
 * 모든 그룹에 bestCutIds 를 채운 새 배열 반환(입력 불변).
 */
export function attachBestCuts(
  groups: SpotGroup[],
  photos: PhotoMeta[],
  options: SelectionOptions = {}
): SpotGroup[] {
  const byId = new Map(photos.map((p) => [p.id, p]));
  return groups.map((g) => ({
    ...g,
    bestCutIds: selectBestCuts(g, byId, options),
  }));
}
