// src/services/photoAI/conceptClassifier.verify.ts
import { ruleConceptClassifier, topConcept } from './conceptClassifier';
import type { PhotoMeta } from './types';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const base = (over: Partial<PhotoMeta>): PhotoMeta => ({
  id: 'p1', uri: 'file:///p1.jpg', thumbnailUri: null,
  creationTime: 1756600000000, width: 100, height: 100, location: null, ...over,
});

// 석양 + 고미학 + 저채도·따뜻 → emotional
// 'sunset' 라벨은 이제 nature(0.6)를 올린다. 그래도 emotional이 이기는지 보는 케이스가 아니라,
// **nature가 이기는 것이 맞다**. 아래 emotionalToneOnly가 emotional의 진짜 정체성(톤)을 검증한다.
const emo = ruleConceptClassifier(base({
  quality: { aestheticsScore: 0.8, passed: true },
  signal: {
    sceneLabels: [{ label: 'sunset', confidence: 0.9 }],
    colorStats: { saturation: 0.25, warmth: 0.62, contrast: 0.3, darkness: 0.1 },
  },
}));
eq(topConcept(emo).concept, 'nature', '석양 라벨이 있으면 nature가 이긴다(라벨 > 톤)');
eq(emo.emotional, 0, '라벨이 서면 톤은 0 — sunset 0.54가 TONE_LABEL_FLOOR(0.3)를 넘어 게이트가 닫힌다');

// ── 톤 컨셉 3종: 라벨이 하나도 없는 사진을 색감으로 건진다 ──
// 이 셋의 존재 이유가 "전부 0점으로 버려지던 사진"이라, 케이스도 라벨 없이 짠다.

// emotional: 미학 + 저채도·따뜻함 2규칙 = 0.5 (2026-09-18 QA: 풍경 가산은 nature로 나갔다)
const emotionalToneOnly = ruleConceptClassifier(base({
  quality: { aestheticsScore: 0.8, passed: true },
  semantic: { isLandscape: true },
  signal: { colorStats: { saturation: 0.25, warmth: 0.62, contrast: 0.3, darkness: 0.1 } },
}));
eq(emotionalToneOnly.emotional, 0.5, '미학 0.25 + 저채도·따뜻 0.25 = 0.5 (톤 상한)');
eq(emotionalToneOnly.nature, 0.2, 'isLandscape 가산 0.2는 emotional이 아니라 nature에 붙는다');
eq(topConcept(emotionalToneOnly).concept, 'emotional', '라벨 없는 따뜻한 풍경 = emotional (0.5 > 0.2)');

// 톤 상한 0.5는 FEED_CONCEPT_THRESHOLD(0.45, formatCandidates.ts)와 짝이다.
// 한 규칙만 서면 0.25로 임계 미달 → 피드 후보가 안 만들어진다(의도된 동작).
const emotionalOneRule = ruleConceptClassifier(base({
  quality: { aestheticsScore: 0.8, passed: true },
  signal: { colorStats: { saturation: 0.5, warmth: 0.5, contrast: 0.3, darkness: 0.1 } },
}));
eq(emotionalOneRule.emotional, 0.25, '미학만 서면 0.25 — 피드 임계 0.45 미달(카드 안 생김)');

// ── isLandscape가 켜진 조합 (QA 경고 2: 어느 케이스도 이 조합을 보지 않았다) ──
// 이전 배치(isLandscape → emotional +0.15)에서는 저신뢰 nature 라벨이 emotional에 졌다.
// 가산을 nature로 옮긴 뒤에는 저신뢰 구간에서도 nature가 이긴다.
const sunsetLandscape = ruleConceptClassifier(base({
  quality: { aestheticsScore: 0.8, passed: true },
  semantic: { isLandscape: true },
  signal: {
    sceneLabels: [{ label: 'sunset', confidence: 0.6 }],
    colorStats: { saturation: 0.25, warmth: 0.62, contrast: 0.3, darkness: 0.1 },
  },
}));
eq(sunsetLandscape.nature, 0.56, "sunset conf 0.6(=0.36) + 풍경 0.2 = nature 0.56");
eq(sunsetLandscape.emotional, 0, '같은 사진의 emotional은 0 — 라벨 0.36이 이미 게이트를 닫는다');
eq(topConcept(sunsetLandscape).concept, 'nature', '저신뢰 sunset + 풍경도 nature가 이긴다');

const skyCloudLandscape = ruleConceptClassifier(base({
  quality: { aestheticsScore: 0.8, passed: true },
  semantic: { isLandscape: true },
  signal: {
    sceneLabels: [{ label: 'sky', confidence: 0.9 }, { label: 'cloud', confidence: 0.7 }],
    colorStats: { saturation: 0.25, warmth: 0.62, contrast: 0.3, darkness: 0.1 },
  },
}));
eq(Math.round(skyCloudLandscape.nature * 100) / 100, 0.68,
  "sky 0.27 + cloud 0.21 + 풍경 0.2 = nature 0.68");
eq(topConcept(skyCloudLandscape).concept, 'nature', '약한 지형 라벨(sky·cloud)도 nature 우세');

// vivid: 고채도 + 고대비. contrast > 0.5 가산은 hip에서 여기로 옮겨졌다.
// 2026-09-18 QA: 상한이 0.4라 피드 임계(0.45)를 영영 못 넘었다 → 0.25+0.25 = 0.5로 올렸다.
const vivid = ruleConceptClassifier(base({
  signal: { colorStats: { saturation: 0.7, warmth: 0.5, contrast: 0.6, darkness: 0.2 } },
}));
eq(vivid.vivid, 0.5, '고채도 0.25 + 고대비 0.25 = 0.5 (피드 임계 0.45 통과)');
eq(vivid.hip, 0, '고대비는 더 이상 hip으로 가지 않는다');
eq(topConcept(vivid).concept, 'vivid', '라벨 없는 선명한 사진 = vivid');

// 한 규칙만 서면 0.25 — 임계 미달
const vividOneRule = ruleConceptClassifier(base({
  signal: { colorStats: { saturation: 0.7, warmth: 0.5, contrast: 0.3, darkness: 0.2 } },
}));
eq(vividOneRule.vivid, 0.25, '고채도만 서면 0.25 — 피드 임계 미달');

// ⚠️ 핵심 게이트: 어두운 사진은 vivid에서 제외한다. 네온 야경(고채도·고대비·어두움)이
// 예전엔 vivid 0.4 > night 0.2로 잘못 갔다(QA 경고 3).
const neonNight = ruleConceptClassifier(base({
  signal: { colorStats: { saturation: 0.8, warmth: 0.5, contrast: 0.7, darkness: 0.6 } },
}));
eq(neonNight.vivid, 0, '어두우면(darkness ≥ 0.45) vivid는 0 — 게이트가 통째로 막는다');
// 2단 가산은 **초과**(> 0.6)라 정확히 0.6은 1단만 붙는다 — 경계를 값으로 못 박는다.
eq(neonNight.night, 0.25, 'darkness 0.6은 1단(> 0.4)만 = night 0.25');
eq(topConcept(neonNight).concept, 'night', '라벨 없는 네온 야경 = night (vivid 아님)');

// 더 어두운 야경은 2단까지 붙어 0.4 — night 비라벨 상한이다(톤 3종의 0.5와 다르다).
const deepNight = ruleConceptClassifier(base({
  signal: { colorStats: { saturation: 0.8, warmth: 0.5, contrast: 0.7, darkness: 0.7 } },
}));
eq(deepNight.night, 0.4, 'darkness 0.7: 1단 0.25 + 2단 0.15 = night 0.4 (비라벨 상한)');
eq(deepNight.vivid, 0, '아주 어두운 사진도 vivid 0');

// mono: 채도가 매우 낮음(흑백). 2026-09-18 QA: 0.4 → 0.35+0.15 = 0.5로 올렸다.
const mono = ruleConceptClassifier(base({
  signal: { colorStats: { saturation: 0.05, warmth: 0.5, contrast: 0.45, darkness: 0.3 } },
}));
eq(mono.mono, 0.5, '진짜 흑백(sat 0.05): 0.35 + 0.15 = 0.5 (피드 임계 통과)');
eq(mono.vivid, 0, '무채색은 vivid를 얻지 않는다');
eq(topConcept(mono).concept, 'mono', '라벨 없는 흑백 사진 = mono');

// 애매한 저채도(0.06~0.12)는 0.35에 머물러 임계 미달 — 카드가 안 되는 것이 의도다.
const monoAmbiguous = ruleConceptClassifier(base({
  signal: { colorStats: { saturation: 0.1, warmth: 0.5, contrast: 0.45, darkness: 0.3 } },
}));
eq(monoAmbiguous.mono, 0.35, '빛바랜 저채도(sat 0.10)는 0.35 — 피드 임계 0.45 미달(의도)');

// 톤은 라벨을 이기지 못한다 — 이것이 톤 가중치를 낮게 잡은 이유다.
const toneVsLabel = ruleConceptClassifier(base({
  signal: {
    sceneLabels: [{ label: 'airport', confidence: 1 }, { label: 'luggage', confidence: 0.8 }],
    colorStats: { saturation: 0.85, warmth: 0.5, contrast: 0.7, darkness: 0.2 },
  },
}));
eq(toneVsLabel.vivid, 0, '라벨이 선 사진에서 톤은 가산되지 않는다(상한 비교가 아니라 게이트)');
eq(topConcept(toneVsLabel).concept, 'transit',
  '강한 라벨(airport 0.6)은 톤 상한 0.5를 여전히 이긴다 — 톤 상향의 전제');

// 야경 라벨 + 어두움 → night (2026-09-18: 'night' 라벨과 darkness 가산이 모두 night으로 갔다)
const night = ruleConceptClassifier(base({
  signal: {
    sceneLabels: [{ label: 'night', confidence: 0.8 }, { label: 'city', confidence: 0.6 }],
    colorStats: { saturation: 0.6, warmth: 0.4, contrast: 0.7, darkness: 0.55 },
  },
}));
eq(topConcept(night).concept, 'night', '야경 라벨·어두움 = night');

// ⚠️ 핵심 이동 1: 어두움(darkness > 0.4)은 hip이 아니라 night이 받는다.
// 라벨을 모두 없애고 어두움만 남겨 "그 가산이 어디로 갔는지"만 본다.
const darkOnly = ruleConceptClassifier(base({
  signal: { colorStats: { saturation: 0.4, warmth: 0.5, contrast: 0.3, darkness: 0.6 } },
}));
eq(darkOnly.night, 0.25, '어두움 1단(darkness > 0.4) 가산 0.25는 night에 붙는다');
eq(darkOnly.vivid, 0, '어두우면 vivid 게이트가 닫힌다(sat 0.4라 원래도 0이지만 함께 고정)');
eq(darkOnly.hip, 0, 'hip은 어두움을 받지 않는다 — 이제 라벨(city·street·graffiti)로만 판정한다');
eq(topConcept(darkOnly).concept, 'night', '라벨 없이 어두운 사진은 night으로 건져진다');

// ⚠️ 핵심 이동 2: 얼굴·웃음은 fun이 아니라 people이 받는다.
// 옮기지 않으면 인물 사진이 fun 0.4로 계속 이겨 people이 사실상 발화하지 못한다.
const faces = ruleConceptClassifier(base({
  semantic: { hasFace: true, isSmiling: true },
  signal: { faceCount: 2 },
}));
eq(faces.people, 0.55, '웃음 0.4 + 2인 이상 0.15 = people 0.55');
eq(faces.fun, 0, 'fun은 얼굴 신호를 받지 않는다 — party·amusement·ride 라벨만 남았다');
eq(topConcept(faces).concept, 'people', '웃는 얼굴 = people');

// fun은 라벨로만 오른다
const funByLabel = ruleConceptClassifier(base({
  signal: { sceneLabels: [{ label: 'party', confidence: 0.9 }, { label: 'amusement', confidence: 0.7 }] },
}));
eq(topConcept(funByLabel).concept, 'fun', '파티·놀이공원 라벨 = fun');

// 음식 + 텍스트(메뉴판) → food
const food = ruleConceptClassifier(base({
  semantic: { isFood: true },
  signal: { hasText: true },
}));
eq(topConcept(food).concept, 'food', '음식+메뉴판 = food');

// 같은 isFood라도 카페 라벨이 붙으면 cafe가 이긴다 (isFood 0.5는 food 고정, 나머지는 라벨 몫)
const cafe = ruleConceptClassifier(base({
  semantic: { isFood: true },
  signal: { sceneLabels: [{ label: 'coffee', confidence: 1 }, { label: 'cake', confidence: 1 }, { label: 'bakery', confidence: 1 }] },
}));
eq(topConcept(cafe).concept, 'cafe', '커피·케이크·베이커리 라벨 = cafe (isFood만으로는 food를 못 이긴다)');

// 랜드마크 + 텍스트 → info
const info = ruleConceptClassifier(base({
  semantic: { isLandmark: true },
  signal: { hasText: true },
}));
eq(topConcept(info).concept, 'info', '랜드마크+표지판 = info');

// 신호 전무(구 네이티브) → 전부 0이어도 크래시 없음
const empty = ruleConceptClassifier(base({}));
eq(Object.values(empty).every((v) => v === 0), true, '신호 없음 = 전부 0, 안전');

// 공항 + 수하물 → transit
// 이 두 케이스는 "컨셉을 늘릴 때 판정기(ruleConceptClassifier)를 고칠 필요가 없다"는
// 설계를 고정한다. 판정기는 RECO_CONCEPTS를 순회할 뿐이고, 새 컨셉의 근거는
// labelTaxonomy 표 하나뿐이다 — 여기가 깨지면 둘 중 하나가 어긋난 것이다.
const transit = ruleConceptClassifier(base({
  signal: {
    sceneLabels: [{ label: 'airport', confidence: 0.9 }, { label: 'luggage', confidence: 0.7 }],
  },
}));
eq(topConcept(transit).concept, 'transit', '공항+수하물 = transit');

// 하이킹 + 트레킹 → activity
const activity = ruleConceptClassifier(base({
  signal: {
    sceneLabels: [{ label: 'hiking', confidence: 0.9 }, { label: 'trekking', confidence: 0.6 }],
  },
}));
eq(topConcept(activity).concept, 'activity', '하이킹+트레킹 = activity');

// ── 톤 게이트 (TONE_LABEL_FLOOR = 0.3) ──
// 상한을 낮추는 방식으로는 못 막던 뒤집힘을 고정한다. 게이트가 없으면 아래 party 사진의
// top이 fun(0.45)에서 vivid(0.5)로 뒤집힌다 — 2026-09-18 QA 2라운드가 지적한 결함이다.
const partyVivid = ruleConceptClassifier(base({
  signal: {
    sceneLabels: [{ label: 'party', confidence: 0.9 }],
    colorStats: { saturation: 0.85, warmth: 0.5, contrast: 0.7, darkness: 0.2 },
  },
}));
eq(topConcept(partyVivid).concept, 'fun', '중간 신뢰도 라벨(party 0.45)이 톤을 이긴다 — 게이트가 없으면 vivid로 뒤집힌다');
eq(partyVivid.vivid, 0, '그 사진의 vivid는 0');

// 약한 라벨 하나는 "라벨이 섰다"고 보지 않는다 — 그래야 버려지는 사진을 톤이 건진다.
const weakLabelMono = ruleConceptClassifier(base({
  signal: {
    sceneLabels: [{ label: 'building', confidence: 0.8 }],   // info 0.25 x 0.8 = 0.2 < 0.3
    colorStats: { saturation: 0.05, warmth: 0.5, contrast: 0.4, darkness: 0.3 },
  },
}));
eq(weakLabelMono.mono, 0.5, '약한 라벨(0.2)은 게이트를 닫지 않아 mono가 0.5까지 오른다');
eq(topConcept(weakLabelMono).concept, 'mono', '그 사진의 top은 mono');

// 경계: 정확히 0.3이면 닫힌다(미만일 때만 열린다)
const atFloor = ruleConceptClassifier(base({
  signal: {
    sceneLabels: [{ label: 'sky', confidence: 1 }],          // nature 0.3 = FLOOR
    colorStats: { saturation: 0.05, warmth: 0.5, contrast: 0.4, darkness: 0.3 },
  },
}));
eq(atFloor.mono, 0, '라벨 최고점이 정확히 0.3이면 게이트가 닫힌다(< 비교)');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
