// src/services/photoAI/labelTaxonomy.verify.ts
import { conceptAffinityFromLabels, ZERO_CONCEPT_SCORES } from './labelTaxonomy';

/** 기대 "전부 0" 객체. 컴셉을 늘릴 때마다 이 파일의 리터럴을 손으로 고치지 않도록 앱 상수를 쓴다 */
const ZERO = ZERO_CONCEPT_SCORES;

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

// ── 석양/해변 → nature 우세 ──
// 2026-09-18: 지형 어휘 18개가 emotional에서 nature로 옮겨졌다. emotional은 '감성 톤'
// 전용이 되어 **키워드가 하나도 없다** — 라벨만으로는 emotional이 절대 오르지 않는다.
const sunset = conceptAffinityFromLabels([
  { label: 'sunset', confidence: 0.9 },
  { label: 'beach', confidence: 0.7 },
]);
gt(sunset.nature, sunset.hip, '석양+해변은 nature > hip');
gt(sunset.nature, 0, 'nature 양수');

// ── 야경/네온 → night 우세 ──
// night·neon·nightlife는 hip에서 night으로 옮겨졌다. hip은 city 0.3만 받는다.
const night = conceptAffinityFromLabels([
  { label: 'nightlife', confidence: 0.8 },
  { label: 'neon', confidence: 0.6 },
  { label: 'city', confidence: 0.5 },
]);
gt(night.night, night.hip, '야경은 night > hip');
gt(night.hip, 0, "hip은 'city'로 여전히 양수 — 도시 어휘는 hip에 남았다");

// ── 음식/카페 분리 ──
// dessert·coffee·cake·bread·drink·cafe는 food에서 cafe로 옮겨졌다.
const dessert = conceptAffinityFromLabels([{ label: 'dessert', confidence: 0.9 }]);
gt(dessert.cafe, 0.3, '디저트는 cafe 강신호');
const meal = conceptAffinityFromLabels([{ label: 'meal', confidence: 0.9 }]);
gt(meal.food, 0.3, '식사는 food에 남아 있다');

// ── 방어 ──
eq(conceptAffinityFromLabels(undefined), ZERO, 'undefined 안전');
eq(conceptAffinityFromLabels([]), ZERO, '빈 배열 안전');
eq(conceptAffinityFromLabels([{ label: 'zzz-unknown', confidence: 0.9 }]),
  ZERO, '미등록 라벨은 0');

function isZero(actual: number, msg: string) {
  if (actual === 0) console.log(`✓ ${msg}`);
  else { failed++; console.error(`✗ ${msg}\n   expected 0\n   got      ${actual}`); }
}

// ── 단어 경계: 짧은 키워드가 긴 단어 안에 박혀 오탐하면 안 된다 ──
// 예전 구현은 lower.includes(keyword)라 아래가 전부 오탐이었다(2026-09-06 수정).
{
  const cathedral = conceptAffinityFromLabels([{ label: 'cathedral', confidence: 0.9 }]);
  gt(cathedral.info, 0, '성당은 info 신호');
  // 'cat'은 2026-09-18에 fun → animal로 옮겨졌다. 오탐이 나면 이제 '동물' 점수로 나타나므로
  // 검사 대상 컨셉을 따라 옮긴다. fun도 함께 0인지 본다(옛 배치로 되돌아가는 것도 잡는다).
  isZero(cathedral.animal, "성당이 'cat'에 걸려 animal을 얻지 않는다");
  isZero(cathedral.fun, "성당이 'cat'에 걸려 fun을 얻지 않는다(cat은 animal로 옮겨졌다)");

  const bride = conceptAffinityFromLabels([{ label: 'bride', confidence: 0.9 }]);
  isZero(bride.fun, "신부가 'ride'에 걸려 fun을 얻지 않는다");
  // 'bride'는 이제 표에 people로 들어 있다 — 'ride'(fun) 오탐이 아니라 정당한 매칭이다.
  gt(bride.people, 0, "'bride'는 people로 잡힌다(표에 명시된 자기 키워드)");

  const design = conceptAffinityFromLabels([{ label: 'design', confidence: 0.9 }]);
  isZero(design.info, "디자인이 'sign'에 걸려 info를 얻지 않는다");

  const barbecue = conceptAffinityFromLabels([{ label: 'barbecue', confidence: 0.9 }]);
  isZero(barbecue.hip, "바비큐가 'bar'에 걸려 hip을 얻지 않는다");
}

// ── 표 안에서 키워드가 겹칠 때 한 라벨이 이중 계상되면 안 된다 ──
{
  // 'skyline'은 hip 0.4다. 예전에는 'sky'(지금은 nature 0.3)에도 걸려 점수를 더 얻었다.
  const skyline = conceptAffinityFromLabels([{ label: 'skyline', confidence: 1 }]);
  gt(skyline.hip, 0, '스카이라인은 hip 신호');
  isZero(skyline.nature, "스카이라인이 'sky'에 걸려 nature를 얻지 않는다");
  isZero(skyline.emotional, 'emotional은 키워드가 없어 라벨만으로는 절대 오르지 않는다');

  // 'nightlife'는 night 0.6이다. 예전에는 'night'(0.5)와 합쳐 1.1 → 상한 1.0이 됐다.
  const nightlife = conceptAffinityFromLabels([{ label: 'nightlife', confidence: 1 }]);
  eq(nightlife.night, 0.6, "'nightlife'는 'night'와 이중 계상되지 않는다");
  isZero(nightlife.hip, "'nightlife'는 hip에서 night으로 옮겨졌다");
}

// ── 반대로, 정당한 매칭은 살아 있어야 한다 ──
{
  // 플랫폼 라벨은 구분자가 섞인다: 'sunset_sky', 'Night Life', 'sunsets'
  const compound = conceptAffinityFromLabels([{ label: 'sunset_sky', confidence: 0.9 }]);
  gt(compound.nature, 0, "'sunset_sky'는 토큰이 갈려 sunset이 잡힌다");

  const spaced = conceptAffinityFromLabels([{ label: 'Night Life', confidence: 0.9 }]);
  gt(spaced.night, 0, "'Night Life'는 대소문자·공백을 넘어 잡힌다");

  const plural = conceptAffinityFromLabels([{ label: 'sunsets', confidence: 0.9 }]);
  gt(plural.nature, 0, "복수형 'sunsets'도 잡힌다");

  // 예전 substring 매칭이 우연히 잡아주던 합성어는 표에 명시해 유지한다
  const seafood = conceptAffinityFromLabels([{ label: 'seafood', confidence: 0.9 }]);
  gt(seafood.food, 0, "'seafood'는 food로 잡힌다");
  isZero(seafood.nature, "'seafood'가 'sea'에 걸려 nature를 얻지 않는다");

  // 공백이 든 키워드는 PHRASE_KEYWORDS로 자동 분류돼 구 단위로 맞는다.
  // 'ice cream'은 'ice'·'cream' 단독 항목이 없어 구가 필요한 진짜 사례다 — 여전히 동작한다.
  const iceCream = conceptAffinityFromLabels([{ label: 'ice cream', confidence: 1 }]);
  eq(iceCream.cafe, 0.55, "'ice cream'은 구 단위 키워드로 잡힌다(토큰으로는 못 잡는 진짜 구)");
  isZero(iceCream.food, "'ice cream'은 cafe만 얻는다 — food로 새지 않는다");

  // ⚠️ 2026-09-18 QA 회귀: **구 키워드와 토큰이 같은 컨셉이면 이중 계상되면 안 된다.**
  // applied Set의 키가 키워드 문자열이라 구 'street market'과 토큰 'market'은 서로를
  // 막지 못한다 → 예전엔 0.5+0.4=0.9로 라벨 한 장이 상한에 육박했다.
  // 해법은 매칭기가 아니라 표다: 토큰만으로 같은 컨셉을 얻는 구는 표에 넣지 않는다.
  const streetMarket = conceptAffinityFromLabels([{ label: 'street market', confidence: 1 }]);
  eq(streetMarket.shopping, 0.4, "'street market'은 토큰 'market'(0.4) 한 번만 — 구 항목 없음");
  gt(streetMarket.hip, 0, "'street market'의 'street'는 hip에 걸린다(다른 컨셉이라 정상)");
  // 'shopping bag'도 같은 이유로 표에서 빠졌다 — 토큰 'shopping' 0.55만 얻는다.
  const shoppingBag = conceptAffinityFromLabels([{ label: 'shopping bag', confidence: 1 }]);
  eq(shoppingBag.shopping, 0.55, "'shopping bag'은 토큰 'shopping'(0.55) 한 번만 — 상한 1.0에 안 닿는다");
}

// ── 2026-09-18 QA 오탐 2건: 표에서 뺀 것/고친 것이 되살아나면 안 된다 ──
{
  // 'room' 단독 항목을 삭제했다. iOS Vision에 'dining room'·'living room'이 실재해
  // 식당·거실 사진이 '숙소' 점수(0.30)를 얻고 있었다.
  const diningRoom = conceptAffinityFromLabels([{ label: 'dining room', confidence: 1 }]);
  isZero(diningRoom.stay, "'dining room'은 stay를 얻지 않는다 — 'room' 단독 키워드를 뺐다");
  const livingRoom = conceptAffinityFromLabels([{ label: 'living room', confidence: 1 }]);
  isZero(livingRoom.stay, "'living room'도 stay를 얻지 않는다");
  // 'bedroom'은 합성어 한 토큰이라 갈리지 않는다 — 숙소 신호는 그대로 살아 있어야 한다
  const bedroom = conceptAffinityFromLabels([{ label: 'bedroom', confidence: 1 }]);
  eq(bedroom.stay, 0.5, "'bedroom'은 stay 0.5 그대로 (한 토큰이라 'room'과 무관)");
  const hotel = conceptAffinityFromLabels([{ label: 'hotel', confidence: 1 }]);
  eq(hotel.stay, 0.55, "'hotel'은 stay 0.55 — 숙소 판정의 주력은 그대로다");

  // 'friends' → 'friend'로 고쳤다. variants()는 복수→단수로만 벗기므로 단수형으로 넣어야
  // 양쪽 라벨이 다 잡힌다. 표의 나머지 233개가 전부 단수형인데 이 줄만 예외였다.
  const friendSingular = conceptAffinityFromLabels([{ label: 'friend', confidence: 1 }]);
  eq(friendSingular.people, 0.45, "단수 라벨 'friend'가 people 0.45로 잡힌다(예전엔 0이었다)");
  const friendPlural = conceptAffinityFromLabels([{ label: 'friends', confidence: 1 }]);
  eq(friendPlural.people, 0.45, "복수 라벨 'friends'도 같은 키워드로 한 번만 잡힌다");
}

// ── transit / activity (컨셉 7종 확장, 2026-09-17) ──
// 표를 넓힌 목적은 iOS Vision 1,300 라벨 중 해석되는 비율을 올리는 것이다.
{
  const airport = conceptAffinityFromLabels([{ label: 'airport', confidence: 1 }]);
  eq(airport.transit, 0.6, "'airport'는 transit 0.6");
  isZero(airport.info, "공항이 'building'·'sign' 같은 info 키워드를 우연히 얻지 않는다");
  isZero(airport.shopping, "공항이 'shop'·'store'에 걸려 shopping을 얻지 않는다(단어경계)");

  const luggage = conceptAffinityFromLabels([{ label: 'luggage', confidence: 0.8 }]);
  gt(luggage.transit, 0, "'luggage'는 transit 신호");

  // ⚠️ 핵심 회귀: variants()는 단순 복수형만 벗기고 '-ing'은 벗기지 않는다.
  //    표에 'ski'만 넣으면 라벨 'skiing'이 영영 안 잡힌다 → 두 형태를 모두 표에 넣어뒀다.
  const skiing = conceptAffinityFromLabels([{ label: 'skiing', confidence: 1 }]);
  eq(skiing.activity, 0.55, "'-ing' 라벨 'skiing'이 그대로 잡힌다(원형 'ski'로 안 벗겨짐)");
  const ski = conceptAffinityFromLabels([{ label: 'ski', confidence: 1 }]);
  eq(ski.activity, 0.5, "원형 'ski'도 따로 잡힌다");

  const hiking = conceptAffinityFromLabels([{ label: 'hiking', confidence: 1 }]);
  eq(hiking.activity, 0.55, "'-ing' 라벨 'hiking'이 잡힌다");
  const hikingTrail = conceptAffinityFromLabels([{ label: 'hiking_trail', confidence: 1 }]);
  eq(hikingTrail.activity, 0.55, "'hiking_trail'의 activity는 hiking 한 번만 계상된다");
  // 2026-09-18에 'trail'이 nature로 들어왔다 → 등산로는 activity·nature 양쪽을 얻는다(의도).
  eq(hikingTrail.nature, 0.4, "'hiking_trail'은 'trail'로 nature도 얻는다(의도된 겹침)");

  // 한 사진이 두 컨셉 점수를 함께 받는 건 정상이다(해변 서핑 = emotional + activity).
  const surfBeach = conceptAffinityFromLabels([
    { label: 'surfing', confidence: 0.9 },
    { label: 'beach', confidence: 0.8 },
  ]);
  gt(surfBeach.activity, 0, '서핑+해변은 activity 신호');
  gt(surfBeach.nature, 0, '서핑+해변은 nature 신호도 함께 받는다(의도된 겹침)');
  isZero(surfBeach.emotional, '라벨만으로는 emotional이 오르지 않는다(톤 컨셉)');
}

// ── 확장이 기존 배치를 흔들지 않았는지 고정 ──
{
  // 놀이기구는 '여정'이 아니라 '유쾌'다
  const ride = conceptAffinityFromLabels([{ label: 'ride', confidence: 1 }]);
  gt(ride.fun, 0, "'ride'는 fun에 남아 있다");
  isZero(ride.transit, "'ride'가 transit으로 옮겨가지 않았다");
  // 다리·탑은 명소(info)다
  const bridge = conceptAffinityFromLabels([{ label: 'bridge', confidence: 1 }]);
  gt(bridge.info, 0, "'bridge'는 info에 남아 있다");
  isZero(bridge.transit, "'bridge'가 transit으로 옮겨가지 않았다");
}

// ── 2026-09-18 컨셉 17종 세분화: **이동이 제대로 됐는지** 고정 ──
// 표를 옮기다 한 줄을 빼먹으면 타입 오류도 검증 실패도 없이 그 컨셉만 조용히 죽는다.
// 아래는 "옛 컨셉이 0이 됐고 새 컨셉이 강신호"라는 짝을 전부 확인한다.
{
  const sunsetOnly = conceptAffinityFromLabels([{ label: 'sunset', confidence: 1 }]);
  eq(sunsetOnly.nature, 0.6, "'sunset'은 nature 0.6 (가중치 보존)");
  isZero(sunsetOnly.emotional, "'sunset'의 emotional은 0 — 지형 어휘는 전부 nature로 갔다");
  isZero(sunsetOnly.night, "'sunset'은 night이 아니다 — 노을은 시간대가 아니라 자연 풍경이다");

  const selfie = conceptAffinityFromLabels([{ label: 'selfie', confidence: 1 }]);
  eq(selfie.people, 0.5, "'selfie'는 people 0.5 (fun에서 이동, 가중치 보존)");
  isZero(selfie.fun, "'selfie'의 fun은 0");

  const coffee = conceptAffinityFromLabels([{ label: 'coffee', confidence: 1 }]);
  eq(coffee.cafe, 0.45, "'coffee'는 cafe 0.45 (food에서 이동, 가중치 보존)");
  isZero(coffee.food, "'coffee'의 food는 0");

  const dogOnly = conceptAffinityFromLabels([{ label: 'dog', confidence: 1 }]);
  eq(dogOnly.animal, 0.35, "'dog'는 animal 0.35 (fun에서 이동)");
  isZero(dogOnly.fun, "'dog'의 fun은 0");

  const concert = conceptAffinityFromLabels([{ label: 'concert', confidence: 1 }]);
  eq(concert.culture, 0.5, "'concert'는 culture 0.5 (hip에서 이동)");
  isZero(concert.hip, "'concert'의 hip은 0");

  const festival = conceptAffinityFromLabels([{ label: 'festival', confidence: 1 }]);
  eq(festival.culture, 0.45, "'festival'은 culture 0.45 (fun에서 이동)");
  isZero(festival.fun, "'festival'의 fun은 0");

  // hip에 남겨둔 것들이 함께 끌려가지 않았는지
  const cityStreet = conceptAffinityFromLabels([
    { label: 'city', confidence: 1 }, { label: 'graffiti', confidence: 1 },
  ]);
  gt(cityStreet.hip, 0.7, 'city·graffiti는 hip에 남아 있다');
  isZero(cityStreet.night, '도시 어휘만으로는 night이 오르지 않는다(어두움은 판정기 몫)');
}

// ── 신규 컨셉 8종(라벨 있는 것)의 대표 케이스 ──
// 톤 컨셉 3종(emotional·vivid·mono)은 여기에 없다 — 키워드가 없어 라벨로는 영원히 0이다.
// 그 판정은 conceptClassifier.verify.ts가 colorStats로 검증한다.
{
  const people = conceptAffinityFromLabels([
    { label: 'portrait', confidence: 0.9 }, { label: 'friends', confidence: 0.6 },
  ]);
  gt(people.people, 0.5, '인물+친구 = people 강신호');

  const nightScene = conceptAffinityFromLabels([
    { label: 'fireworks', confidence: 0.9 }, { label: 'illumination', confidence: 0.6 },
  ]);
  gt(nightScene.night, 0.5, '불꽃+조명 = night 강신호');
  // 복수형 'fireworks'가 단수 키워드 'firework'로 벗겨져 잡히는지(variants)
  const fireworkSingular = conceptAffinityFromLabels([{ label: 'firework', confidence: 1 }]);
  eq(fireworkSingular.night, 0.55, "단수 'firework'도 같은 키워드로 잡힌다");

  const animal = conceptAffinityFromLabels([
    { label: 'wildlife', confidence: 0.9 }, { label: 'deer', confidence: 0.7 },
  ]);
  gt(animal.animal, 0.5, '야생동물+사슴 = animal 강신호');

  const cafe = conceptAffinityFromLabels([
    { label: 'bakery', confidence: 0.9 }, { label: 'latte', confidence: 0.6 },
  ]);
  gt(cafe.cafe, 0.5, '베이커리+라떼 = cafe 강신호');

  const culture = conceptAffinityFromLabels([
    { label: 'exhibition', confidence: 0.9 }, { label: 'gallery', confidence: 0.6 },
  ]);
  gt(culture.culture, 0.5, '전시+갤러리 = culture 강신호');
  // 'mural'(벽화)은 culture, 'graffiti'(낙서)는 hip — 결이 달라 일부러 갈랐다
  const mural = conceptAffinityFromLabels([{ label: 'mural', confidence: 1 }]);
  eq(mural.culture, 0.45, "'mural'은 culture (공공 예술)");
  isZero(mural.hip, "'mural'은 hip이 아니다 — 낙서(graffiti)와 갈라뒀다");

  const nature = conceptAffinityFromLabels([
    { label: 'canyon', confidence: 0.9 }, { label: 'valley', confidence: 0.6 },
  ]);
  gt(nature.nature, 0.5, '협곡+계곡 = nature 강신호');

  const stay = conceptAffinityFromLabels([
    { label: 'hotel', confidence: 0.9 }, { label: 'bedroom', confidence: 0.6 },
  ]);
  gt(stay.stay, 0.5, '호텔+침실 = stay 강신호');
  // 'swimming pool'은 stay(pool)와 activity(swimming) 양쪽에 걸린다 — 의도된 겹침
  const pool = conceptAffinityFromLabels([{ label: 'swimming pool', confidence: 1 }]);
  gt(pool.stay, 0, "'swimming pool'은 stay 신호(호텔 수영장)");
  gt(pool.activity, 0, "'swimming pool'은 activity 신호도 함께 받는다(의도된 겹침)");

  const shopping = conceptAffinityFromLabels([
    { label: 'souvenir', confidence: 0.9 }, { label: 'boutique', confidence: 0.6 },
  ]);
  gt(shopping.shopping, 0.5, '기념품+부티크 = shopping 강신호');
  // 'night market'은 night(0.5) + shopping(0.4) — 야시장은 둘 다 맞다
  const nightMarket = conceptAffinityFromLabels([{ label: 'night market', confidence: 1 }]);
  gt(nightMarket.night, 0, "'night market'은 night 신호");
  gt(nightMarket.shopping, 0, "'night market'은 shopping 신호도 함께 받는다");
}

// ── 톤 컨셉 3종은 표에 키워드가 없다 (의도된 것) ──
// 여기에 키워드를 넣으면 "라벨이 없어 버려지는 사진을 색으로 건진다"는 목적이 흐려지고
// 라벨 컨셉과 이중으로 발화한다. 대표 라벨을 몰아 넣고도 세 컨셉이 0인지 본다.
{
  const everyLabel = [
    'sunset', 'city', 'party', 'food', 'landmark', 'airport', 'hiking',
    'portrait', 'night', 'dog', 'coffee', 'exhibition', 'mountain', 'hotel', 'market',
    'ice cream', 'street market', 'seafood', 'nightclub', 'cityscape', 'shopping bag',
  ].map((label) => ({ label, confidence: 1 }));
  const all = conceptAffinityFromLabels(everyLabel);
  isZero(all.emotional, 'emotional은 키워드가 없다 — 톤 컨셉(색감만으로 판정)');
  isZero(all.vivid, 'vivid는 키워드가 없다 — 톤 컨셉');
  isZero(all.mono, 'mono는 키워드가 없다 — 톤 컨셉');
  // 반대로 라벨 컨셉 14종은 위 목록으로 전부 한 번씩은 올라야 한다(표 누락 탐지)
  const LABEL_CONCEPTS = ['hip', 'fun', 'food', 'info', 'transit', 'activity', 'people',
    'night', 'animal', 'cafe', 'culture', 'nature', 'stay', 'shopping'] as const;
  for (const c of LABEL_CONCEPTS) {
    gt(all[c], 0, `라벨 컨셉 '${c}'는 대표 라벨로 발화한다`);
  }
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
