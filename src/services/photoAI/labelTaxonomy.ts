/**
 * 라벨 매핑 테이블 — 플랫폼 원시 장면 라벨 → 공통 컨셉 점수
 *
 * iOS VNClassifyImageRequest(약 1,300 라벨)와 Android ML Kit(약 400 라벨)의
 * 라벨 체계가 다르다. 양쪽 라벨을 여기서만 해석해 파리티 차이를 이 파일 하나에 격리한다.
 * 매칭은 소문자 contains — 'sunset', 'sunsets', 'sunset_sky' 모두 잡는다.
 */
import type { ConceptScores, RecoConcept } from './recoTypes';

/** 키워드 → (컨셉, 가중치). 신뢰도와 곱해 누적된다. */
const KEYWORD_AFFINITY: [string, RecoConcept, number][] = [
  // ── emotional: 자연·노을·잔잔함 ──
  ['sunset', 'emotional', 0.6], ['sunrise', 'emotional', 0.6],
  ['beach', 'emotional', 0.4], ['sea', 'emotional', 0.35], ['ocean', 'emotional', 0.35],
  ['sky', 'emotional', 0.3], ['cloud', 'emotional', 0.3],
  ['mountain', 'emotional', 0.35], ['lake', 'emotional', 0.35], ['river', 'emotional', 0.3],
  ['forest', 'emotional', 0.35], ['flower', 'emotional', 0.35], ['nature', 'emotional', 0.3],
  ['snow', 'emotional', 0.3], ['field', 'emotional', 0.25], ['waterfall', 'emotional', 0.4],
  ['fog', 'emotional', 0.4], ['mist', 'emotional', 0.4],
  // ── hip: 야경·도시·네온·거리 ──
  ['night', 'hip', 0.5], ['neon', 'hip', 0.6], ['nightlife', 'hip', 0.6],
  ['city', 'hip', 0.3], ['street', 'hip', 0.3], ['skyline', 'hip', 0.4],
  ['concert', 'hip', 0.5], ['bar', 'hip', 0.35], ['club', 'hip', 0.35],
  ['skyscraper', 'hip', 0.35], ['graffiti', 'hip', 0.5], ['alley', 'hip', 0.4],
  // ── fun: 사람·이벤트·놀이 ──
  ['selfie', 'fun', 0.5], ['smile', 'fun', 0.5], ['people', 'fun', 0.3],
  ['crowd', 'fun', 0.3], ['party', 'fun', 0.5], ['festival', 'fun', 0.45],
  ['amusement', 'fun', 0.5], ['ride', 'fun', 0.3], ['dog', 'fun', 0.35], ['cat', 'fun', 0.35],
  // ── food ──
  ['food', 'food', 0.6], ['meal', 'food', 0.5], ['dish', 'food', 0.5],
  ['dessert', 'food', 0.55], ['cake', 'food', 0.5], ['coffee', 'food', 0.45],
  ['drink', 'food', 0.4], ['restaurant', 'food', 0.5], ['cafe', 'food', 0.45],
  ['fruit', 'food', 0.4], ['bread', 'food', 0.45], ['noodle', 'food', 0.5],
  ['sushi', 'food', 0.55], ['pizza', 'food', 0.5],
  // ── info: 랜드마크·구조물·전시 ──
  ['landmark', 'info', 0.55], ['monument', 'info', 0.5], ['castle', 'info', 0.5],
  ['temple', 'info', 0.5], ['church', 'info', 0.45], ['cathedral', 'info', 0.45],
  ['museum', 'info', 0.5], ['bridge', 'info', 0.4], ['tower', 'info', 0.4],
  ['statue', 'info', 0.45], ['palace', 'info', 0.5], ['architecture', 'info', 0.4],
  ['building', 'info', 0.25], ['sign', 'info', 0.3], ['map', 'info', 0.3],
];

export const ZERO_CONCEPT_SCORES: ConceptScores = {
  emotional: 0, hip: 0, fun: 0, food: 0, info: 0,
};

/**
 * 원시 라벨 배열 → 컨셉 점수. 신뢰도 가중 누적, 컨셉당 상한 1.0.
 * 라벨이 없으면(구 네이티브·미지원) 전부 0 — 호출부는 다른 신호로만 판정한다.
 */
export function conceptAffinityFromLabels(
  labels: { label: string; confidence: number }[] | undefined
): ConceptScores {
  const out: ConceptScores = { ...ZERO_CONCEPT_SCORES };
  if (!labels || labels.length === 0) return out;

  for (const { label, confidence } of labels) {
    if (!label || confidence <= 0) continue;
    const lower = label.toLowerCase();
    for (const [keyword, concept, weight] of KEYWORD_AFFINITY) {
      if (lower.includes(keyword)) {
        out[concept] = Math.min(1, out[concept] + weight * confidence);
      }
    }
  }
  return out;
}
