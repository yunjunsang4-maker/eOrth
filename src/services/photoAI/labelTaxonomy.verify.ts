// src/services/photoAI/labelTaxonomy.verify.ts
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

function isZero(actual: number, msg: string) {
  if (actual === 0) console.log(`✓ ${msg}`);
  else { failed++; console.error(`✗ ${msg}\n   expected 0\n   got      ${actual}`); }
}

// ── 단어 경계: 짧은 키워드가 긴 단어 안에 박혀 오탐하면 안 된다 ──
// 예전 구현은 lower.includes(keyword)라 아래가 전부 오탐이었다(2026-09-06 수정).
{
  const cathedral = conceptAffinityFromLabels([{ label: 'cathedral', confidence: 0.9 }]);
  gt(cathedral.info, 0, '성당은 info 신호');
  isZero(cathedral.fun, "성당이 'cat'에 걸려 fun을 얻지 않는다");

  const bride = conceptAffinityFromLabels([{ label: 'bride', confidence: 0.9 }]);
  isZero(bride.fun, "신부가 'ride'에 걸려 fun을 얻지 않는다");

  const design = conceptAffinityFromLabels([{ label: 'design', confidence: 0.9 }]);
  isZero(design.info, "디자인이 'sign'에 걸려 info를 얻지 않는다");

  const barbecue = conceptAffinityFromLabels([{ label: 'barbecue', confidence: 0.9 }]);
  isZero(barbecue.hip, "바비큐가 'bar'에 걸려 hip을 얻지 않는다");
}

// ── 표 안에서 키워드가 겹칠 때 한 라벨이 이중 계상되면 안 된다 ──
{
  // 'skyline'은 hip 0.4다. 예전에는 'sky'(emotional 0.3)에도 걸려 감성 점수까지 얻었다.
  const skyline = conceptAffinityFromLabels([{ label: 'skyline', confidence: 1 }]);
  gt(skyline.hip, 0, '스카이라인은 hip 신호');
  isZero(skyline.emotional, "스카이라인이 'sky'에 걸려 emotional을 얻지 않는다");

  // 'nightlife'는 hip 0.6이다. 예전에는 'night'(hip 0.5)와 합쳐 1.1 → 상한 1.0이 됐다.
  const nightlife = conceptAffinityFromLabels([{ label: 'nightlife', confidence: 1 }]);
  eq(nightlife.hip, 0.6, "'nightlife'는 'night'와 이중 계상되지 않는다");
}

// ── 반대로, 정당한 매칭은 살아 있어야 한다 ──
{
  // 플랫폼 라벨은 구분자가 섞인다: 'sunset_sky', 'Night Life', 'sunsets'
  const compound = conceptAffinityFromLabels([{ label: 'sunset_sky', confidence: 0.9 }]);
  gt(compound.emotional, 0, "'sunset_sky'는 토큰이 갈려 sunset이 잡힌다");

  const spaced = conceptAffinityFromLabels([{ label: 'Night Life', confidence: 0.9 }]);
  gt(spaced.hip, 0, "'Night Life'는 대소문자·공백을 넘어 잡힌다");

  const plural = conceptAffinityFromLabels([{ label: 'sunsets', confidence: 0.9 }]);
  gt(plural.emotional, 0, "복수형 'sunsets'도 잡힌다");

  // 예전 substring 매칭이 우연히 잡아주던 합성어는 표에 명시해 유지한다
  const seafood = conceptAffinityFromLabels([{ label: 'seafood', confidence: 0.9 }]);
  gt(seafood.food, 0, "'seafood'는 food로 잡힌다");
  isZero(seafood.emotional, "'seafood'가 'sea'에 걸려 emotional을 얻지 않는다");
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
