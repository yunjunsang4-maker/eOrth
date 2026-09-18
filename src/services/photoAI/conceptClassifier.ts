/**
 * 컨셉(무드) 판정기 — 사진 1장의 신호를 컨셉 17종 점수로 변환
 *
 * ConceptClassifier는 교체 가능한 경계다: v1은 규칙 기반(ruleConceptClassifier),
 * 2차에 온디바이스 임베딩(CLIP류) 판정기로 이 타입만 맞춰 갈아끼운다. (설계 §4)
 */
import { conceptAffinityFromLabels, ZERO_CONCEPT_SCORES } from './labelTaxonomy';
import type { ConceptScores, RecoConcept } from './recoTypes';
import { RECO_CONCEPTS } from './recoTypes';
import type { PhotoMeta } from './types';

/**
 * 톤 컨셉을 끄는 라벨 신호 하한. 라벨 컨셉 최고점이 이 값 이상이면 "라벨이 섰다"고 보고
 * emotional·vivid·mono를 전부 0으로 둔다(톤은 라벨이 없는 사진 전용 구제 수단이다).
 */
const TONE_LABEL_FLOOR = 0.3;

export type ConceptClassifier = (photo: PhotoMeta) => ConceptScores;

export const ruleConceptClassifier: ConceptClassifier = (photo) => {
  const out: ConceptScores = { ...ZERO_CONCEPT_SCORES };
  const s = photo.semantic;
  const g = photo.signal;
  const cs = g?.colorStats;

  // 1) 장면 라벨 기여 (가장 큰 재료)
  const label = conceptAffinityFromLabels(g?.sceneLabels);
  for (const c of RECO_CONCEPTS) out[c] += label[c];

  // ── 톤 컨셉 3종(emotional·vivid·mono) — 키워드 없이 색감으로만 판정한다 ──
  // 목적은 "라벨이 하나도 안 잡혀 전부 0점으로 버려지는 사진"을 색으로 건지는 것이다.
  //
  // ⚠️ **라벨 신호가 서 있으면 톤은 아예 더하지 않는다(toneAllowed 게이트).**
  //    상한만 낮춰서는 이 목적이 지켜지지 않는다 — 톤 상한이 0.5면 가중치 0.5짜리
  //    라벨(graffiti·party·amusement·concert)은 신뢰도 1.00이어야만 이기고,
  //    party conf 0.9(=0.45) 사진이 밝고 채도가 높으면 top이 fun에서 vivid로 뒤집힌다
  //    (2026-09-18 QA 2라운드 실측). 임계를 옮기면 경계가 밀릴 뿐 계속 어딘가에서 뒤집힌다.
  //    그래서 "누가 이기나"를 산술로 다투지 않고, 라벨이 있으면 톤을 끈다.
  //    TONE_LABEL_FLOOR(0.3)는 "약한 라벨 하나(building 0.25, sky 0.3×conf)까지는
  //    라벨이 섰다고 보지 않는다"는 뜻이다. 이 값을 올리면 톤이 라벨을 잡아먹기 시작한다.
  //
  // ⚠️ 톤 컨셉의 **상한은 0.5로 맞춘다.** 이 숫자는 임의가 아니라
  //    `formatCandidates.ts`의 `FEED_CONCEPT_THRESHOLD`(0.45)와 짝이다:
  //     - 0.5 상한이면 **두 규칙이 다 발화할 때만** 0.45를 넘어 피드 후보가 된다.
  //       한 규칙만 서면 0.25~0.35로 임계 미달이라 카드가 안 생긴다(의도).
  //     - 그러면서 강한 라벨 신호(0.55~0.6)에는 여전히 지므로
  //       "라벨이 있으면 라벨이 이긴다"는 설계가 그대로 유지된다.
  //    2026-09-18 QA: 이전 상한이 0.40이라 vivid·mono는 임계를 **영원히** 못 넘어
  //    피드 후보를 구조적으로 만들 수 없었다. 상한을 고칠 때는 0.45도 함께 보라 —
  //    한쪽만 고치면 톤 컨셉이 다시 조용히 죽거나 반대로 라벨을 이기기 시작한다.

  const labelPeak = Math.max(...RECO_CONCEPTS.map((c) => label[c]));
  const toneAllowed = labelPeak < TONE_LABEL_FLOOR;

  // 2) emotional: '감성 톤' — 미학 + 저채도·따뜻함 (최대 0.5)
  //    (2026-09-18 지형 키워드 18개가 nature로 나가면서 정체성이 톤 전용이 됐다.)
  const aesthetics = photo.quality?.aestheticsScore;
  if (toneAllowed) {
    if (aesthetics !== undefined && aesthetics > 0.6) out.emotional += 0.25;
    if (cs && cs.saturation < 0.35 && cs.warmth > 0.55) out.emotional += 0.25;
  }

  // isLandscape는 감성 톤의 근거가 아니라 **자연의 근거**다 → nature로 옮겼다.
  // 라벨 없는 풍경 사진은 이제 nature 0.2로 떨어진다. 라벨이 있으면(sunset 0.6×conf 등)
  // 그쪽이 더 크므로 nature 판정이 강화될 뿐 뒤집히지 않는다.
  // 실측(2026-09-18, 미학 0.8 + 저채도·따뜻 조건이 선 흔한 풍경 사진 기준):
  //   sunset conf 0.6 → nature 0.36+0.2 = 0.56 > emotional 0.5 → nature
  //   sky 0.9 + cloud 0.7 → nature 0.27+0.21+0.2 = 0.68 > emotional 0.5 → nature
  //   라벨 없음 → nature 0.2 < emotional 0.5 → emotional (톤이 건진다)
  // 즉 저신뢰 라벨 구간에서도 nature가 이긴다 — 이전 주석의 "항상 이긴다"는 주장이
  // 실제로는 sunset conf 0.83 이상에서만 참이었다(QA 경고 2).
  if (s?.isLandscape) out.nature += 0.2;

  // 3) vivid: 선명한 색 — 고채도 + 고대비 (최대 0.5)
  //    contrast > 0.5는 예전에 hip에 있었다. hip을 라벨(city·street·graffiti) 전용으로
  //    정리하면서 이 신호가 갈 곳은 vivid다 — 고대비는 도시성이 아니라 색감 성질이다.
  //    ⚠️ 어두운 사진은 게이트(darkness < 0.45)로 통째로 제외한다. 네온 야경은
  //    고채도·고대비·어두움이 동시에 서는데, 그건 vivid가 아니라 night이 잡아야 한다
  //    (게이트가 없던 시절 실측: sat 0.8/contrast 0.7/darkness 0.6 → vivid 0.4 > night 0.2).
  if (toneAllowed && cs && cs.darkness < 0.45) {
    if (cs.saturation > 0.6) out.vivid += 0.25;
    if (cs.contrast > 0.5) out.vivid += 0.25;
  }

  // 4) mono: 무채색 — 채도가 매우 낮음(흑백·빛바랜 톤) (최대 0.5)
  //    emotional의 저채도 조건(< 0.35)과 달리 여기는 훨씬 아래다. 세피아(저채도+따뜻함)는
  //    양쪽에 걸릴 수 있는데, 둘 다 톤 컨셉이라 어느 쪽이 이겨도 문구가 크게 틀리지 않는다.
  //    애매한 저채도(0.06~0.12)는 0.35에 머물러 피드 임계(0.45) 미달 → 카드가 안 된다(의도).
  //    진짜 흑백(< 0.06)만 0.5로 카드가 된다.
  if (toneAllowed && cs && cs.saturation < 0.12) out.mono += 0.35;
  if (toneAllowed && cs && cs.saturation < 0.06) out.mono += 0.15;

  // 5) night: 어두움 (야경) — 비라벨 신호 최대 0.4
  //    예전엔 hip이 받았다. night 컨셉이 생기면서 어두움의 주인이 바뀌었다 —
  //    hip은 이제 라벨(city·street·graffiti)로만 판정한다.
  //    2단계로 나눈 이유: 라벨 없는 야경이 vivid에 지지 않게 하려면 0.2로는 부족했다.
  //    톤 3종과 달리 상한이 0.4인 것은 의도다 — night은 라벨(night·neon 0.5~0.6)이
  //    주력이고 색감은 보조라, 비라벨 단독으로 피드 후보가 되지는 않는다.
  if (cs && cs.darkness > 0.4) out.night += 0.25;
  if (cs && cs.darkness > 0.6) out.night += 0.15;

  // 6) people: 얼굴·웃음 (미학 점수 무관 — 설계 §4)
  //    예전엔 fun이 받았다. 옮기지 않으면 인물 사진이 fun 0.4로 계속 이겨
  //    people 컨셉이 사실상 발화하지 못한다. fun은 party·amusement·ride 라벨만 남는다.
  if (s?.isSmiling) out.people += 0.4;
  else if (s?.hasFace) out.people += 0.2;
  if ((g?.faceCount ?? 0) >= 2) out.people += 0.15;

  // 7) food: 음식 + 메뉴판 텍스트
  //    isFood는 카페 디저트에도 뜨지만 cafe/food를 가르는 건 라벨(coffee·dessert 등)의 몫이다.
  if (s?.isFood) out.food += 0.5;
  if (s?.isFood && g?.hasText) out.food += 0.1;

  // 8) info: 랜드마크 + 텍스트(표지판/안내판)
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
