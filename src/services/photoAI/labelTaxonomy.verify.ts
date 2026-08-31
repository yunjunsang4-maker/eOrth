import { conceptAffinityFromLabels } from './labelTaxonomy';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}
function gt(actual: number, threshold: number, msg: string) {
  if (actual > threshold) console.log(`✓ ${msg}`);
  else { failed++; console.error(`✗ ${msg}\n   expected > ${threshold}\n   got      ${actual}`); }
}

// ── 석양/해변 → emotional 우세 ──
const sunset = conceptAffinityFromLabels([
  { label: 'sunset', confidence: 0.9 },
  { label: 'beach', confidence: 0.7 },
]);
gt(sunset.emotional, sunset.hip, '석양+해변은 emotional > hip');
gt(sunset.emotional, 0, 'emotional 양수');

// ── 야경/네온 → hip 우세 ──
const night = conceptAffinityFromLabels([
  { label: 'nightlife', confidence: 0.8 },
  { label: 'neon', confidence: 0.6 },
  { label: 'city', confidence: 0.5 },
]);
gt(night.hip, night.emotional, '야경은 hip > emotional');

// ── 음식 → food ──
const food = conceptAffinityFromLabels([{ label: 'dessert', confidence: 0.9 }]);
gt(food.food, 0.3, '디저트는 food 강신호');

// ── 방어 ──
eq(conceptAffinityFromLabels(undefined), { emotional: 0, hip: 0, fun: 0, food: 0, info: 0 }, 'undefined 안전');
eq(conceptAffinityFromLabels([]), { emotional: 0, hip: 0, fun: 0, food: 0, info: 0 }, '빈 배열 안전');
eq(conceptAffinityFromLabels([{ label: 'zzz-unknown', confidence: 0.9 }]),
  { emotional: 0, hip: 0, fun: 0, food: 0, info: 0 }, '미등록 라벨은 0');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
