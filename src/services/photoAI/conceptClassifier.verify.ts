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
const emo = ruleConceptClassifier(base({
  quality: { aestheticsScore: 0.8, passed: true },
  signal: {
    sceneLabels: [{ label: 'sunset', confidence: 0.9 }],
    colorStats: { saturation: 0.25, warmth: 0.62, contrast: 0.3, darkness: 0.1 },
  },
}));
eq(topConcept(emo).concept, 'emotional', '석양·고미학·따뜻한 톤 = emotional');

// 야경 + 고대비 + 어두움 → hip
const hip = ruleConceptClassifier(base({
  signal: {
    sceneLabels: [{ label: 'night', confidence: 0.8 }, { label: 'city', confidence: 0.6 }],
    colorStats: { saturation: 0.6, warmth: 0.4, contrast: 0.7, darkness: 0.55 },
  },
}));
eq(topConcept(hip).concept, 'hip', '야경·고대비·어두움 = hip');

// 웃는 얼굴 → fun
const fun = ruleConceptClassifier(base({
  semantic: { hasFace: true, isSmiling: true },
  signal: { faceCount: 2 },
}));
eq(topConcept(fun).concept, 'fun', '웃는 얼굴 = fun');

// 음식 + 텍스트(메뉴판) → food
const food = ruleConceptClassifier(base({
  semantic: { isFood: true },
  signal: { hasText: true },
}));
eq(topConcept(food).concept, 'food', '음식+메뉴판 = food');

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

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
