/**
 * 컨셉(무드) 판정기 — 사진 1장의 신호를 컨셉 5종 점수로 변환
 *
 * ConceptClassifier는 교체 가능한 경계다: v1은 규칙 기반(ruleConceptClassifier),
 * 2차에 온디바이스 임베딩(CLIP류) 판정기로 이 타입만 맞춰 갈아끼운다. (설계 §4)
 */
import { conceptAffinityFromLabels, ZERO_CONCEPT_SCORES } from './labelTaxonomy';
import type { ConceptScores, RecoConcept } from './recoTypes';
import { RECO_CONCEPTS } from './recoTypes';
import type { PhotoMeta } from './types';

export type ConceptClassifier = (photo: PhotoMeta) => ConceptScores;

export const ruleConceptClassifier: ConceptClassifier = (photo) => {
  const out: ConceptScores = { ...ZERO_CONCEPT_SCORES };
  const s = photo.semantic;
  const g = photo.signal;
  const cs = g?.colorStats;

  // 1) 장면 라벨 기여 (가장 큰 재료)
  const label = conceptAffinityFromLabels(g?.sceneLabels);
  for (const c of RECO_CONCEPTS) out[c] += label[c];

  // 2) emotional: 미학 + 저채도·따뜻한 톤, 풍경
  const aesthetics = photo.quality?.aestheticsScore;
  if (aesthetics !== undefined && aesthetics > 0.6) out.emotional += 0.2;
  if (cs && cs.saturation < 0.35 && cs.warmth > 0.55) out.emotional += 0.15;
  if (s?.isLandscape) out.emotional += 0.15;

  // 3) hip: 어두움 + 고대비
  if (cs && cs.darkness > 0.4) out.hip += 0.2;
  if (cs && cs.contrast > 0.5) out.hip += 0.15;

  // 4) fun: 얼굴·웃음 (미학 점수 무관 — 설계 §4)
  if (s?.isSmiling) out.fun += 0.4;
  else if (s?.hasFace) out.fun += 0.2;
  if ((g?.faceCount ?? 0) >= 2) out.fun += 0.15;

  // 5) food: 음식 + 메뉴판 텍스트
  if (s?.isFood) out.food += 0.5;
  if (s?.isFood && g?.hasText) out.food += 0.1;

  // 6) info: 랜드마크 + 텍스트(표지판/안내판)
  if (s?.isLandmark) out.info += 0.3;
  if (g?.hasText) out.info += 0.2;

  // 상한 1.0
  for (const c of RECO_CONCEPTS) out[c] = Math.min(1, out[c]);
  return out;
};

/** 최고 점수 컨셉. 동률이면 RECO_CONCEPTS 순서 우선 */
export function topConcept(scores: ConceptScores): { concept: RecoConcept; score: number } {
  let best: RecoConcept = RECO_CONCEPTS[0];
  for (const c of RECO_CONCEPTS) {
    if (scores[c] > scores[best]) best = c;
  }
  return { concept: best, score: scores[best] };
}
