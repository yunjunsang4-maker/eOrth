/**
 * 라벨 매핑 테이블 — 플랫폼 원시 장면 라벨 → 공통 컨셉 점수
 *
 * iOS VNClassifyImageRequest(약 1,300 라벨)와 Android ML Kit(약 400 라벨)의
 * 라벨 체계가 다르다. 양쪽 라벨을 여기서만 해석해 파리티 차이를 이 파일 하나에 격리한다.
 *
 * 매칭은 **토큰 단위**다(부분 문자열이 아니다). 구분자를 쪼개고 단순 복수형만 벗겨
 * 정확히 맞춘다 — 'sunset', 'sunsets', 'sunset_sky', 'Night Life' 모두 잡는다.
 */
import type { ConceptScores, RecoConcept } from './recoTypes';

/**
 * 키워드 → (컨셉, 가중치). 신뢰도와 곱해 누적된다.
 *
 * ⚠️ 표에 **emotional·vivid·mono 항목이 없는 것은 의도된 것**이다. 이 셋은 톤 컨셉이라
 *    키워드가 아니라 colorStats로만 판정한다(recoTypes.ts의 RecoConcept 주석 참고).
 *    여기에 키워드를 넣으면 "라벨이 없어 버려지는 사진을 색으로 건진다"는 톤 컨셉의
 *    목적이 흐려지고, 라벨 컨셉과 이중으로 발화한다.
 *
 * 한 키워드가 여러 컨셉에 걸리는 것은 정상이다('pool'=stay+swimming은 activity,
 * 'night market'=night+shopping). 가중치 감각: 특이도 높은 단어 0.5~0.6, 범용어 0.25~0.35.
 */
const KEYWORD_AFFINITY: [string, RecoConcept, number][] = [
  // ── nature: 자연·지형·계절 ──
  // 2026-09-18: 아래 18개(sunset~mist)는 emotional에 있던 것을 **가중치 그대로** 옮겼다.
  // emotional이 '감성 톤' 전용이 되면서 지형 어휘가 갈 곳이 nature로 정리됐다.
  ['sunset', 'nature', 0.6], ['sunrise', 'nature', 0.6],
  ['beach', 'nature', 0.4], ['sea', 'nature', 0.35], ['ocean', 'nature', 0.35],
  ['sky', 'nature', 0.3], ['cloud', 'nature', 0.3],
  ['mountain', 'nature', 0.35], ['lake', 'nature', 0.35], ['river', 'nature', 0.3],
  ['forest', 'nature', 0.35], ['flower', 'nature', 0.35], ['nature', 'nature', 0.3],
  ['snow', 'nature', 0.3], ['field', 'nature', 0.25], ['waterfall', 'nature', 0.4],
  ['fog', 'nature', 0.4], ['mist', 'nature', 0.4],
  // 신규. 'park'는 'amusement park'에서 amusement(fun 0.5)와 함께 잡히지만 0.25라 밀린다.
  // 'trail'은 'hiking_trail'에서 hiking(activity 0.55)과 함께 잡힌다 — 등산로는 둘 다 맞다.
  ['trail', 'nature', 0.4], ['canyon', 'nature', 0.55], ['desert', 'nature', 0.5],
  ['island', 'nature', 0.4], ['garden', 'nature', 0.35], ['park', 'nature', 0.25],
  ['valley', 'nature', 0.45], ['glacier', 'nature', 0.55], ['volcano', 'nature', 0.55],
  ['cave', 'nature', 0.45], ['meadow', 'nature', 0.45], ['tree', 'nature', 0.25],
  ['hill', 'nature', 0.3], ['cliff', 'nature', 0.45], ['coast', 'nature', 0.4],
  ['rainbow', 'nature', 0.5],
  // ── hip: 도시·거리·낙서 (야간 어휘는 night으로 나갔다) ──
  ['city', 'hip', 0.3], ['street', 'hip', 0.3], ['skyline', 'hip', 0.4],
  ['bar', 'hip', 0.35], ['club', 'hip', 0.35],
  ['skyscraper', 'hip', 0.35], ['graffiti', 'hip', 0.5], ['alley', 'hip', 0.4],
  // ── night: 야경·조명 ──
  // night·neon·nightlife·nightclub은 hip에서 가중치 그대로 옮겼다.
  // ⚠️ 'sunset'·'sunrise'는 night에 넣지 않는다 — 노을은 시간대가 아니라 자연 풍경이다.
  ['night', 'night', 0.5], ['neon', 'night', 0.6], ['nightlife', 'night', 0.6],
  ['firework', 'night', 0.55], ['illumination', 'night', 0.5], ['lantern', 'night', 0.4],
  ['moon', 'night', 0.45], ['star', 'night', 0.35], ['dusk', 'night', 0.45],
  ['twilight', 'night', 0.5], ['midnight', 'night', 0.45], ['streetlight', 'night', 0.4],
  ['candle', 'night', 0.35],
  // ── fun: 놀이·파티 (사람·동물은 people·animal로 나갔다) ──
  ['party', 'fun', 0.5], ['amusement', 'fun', 0.5], ['ride', 'fun', 0.3],
  // ── people: 인물 ──
  // selfie·smile·people·crowd는 fun에서 가중치 그대로 옮겼다.
  // 'bride'/'groom'은 단어경계 회귀 케이스와 짝이다 — 'ride'에 걸리지 않고 people만 얻는다.
  ['selfie', 'people', 0.5], ['smile', 'people', 0.5], ['people', 'people', 0.3],
  ['crowd', 'people', 0.3],
  // 'friend'는 단수로 넣는다 — variants()가 복수→단수로만 벗기므로(아래 variants 주석)
  // 'friends'로 넣으면 라벨 'friend'를 영영 못 잡는다. 표의 나머지 전부가 단수형이다.
  ['portrait', 'people', 0.55], ['friend', 'people', 0.45], ['family', 'people', 0.45],
  ['group', 'people', 0.25], ['couple', 'people', 0.45], ['wedding', 'people', 0.5],
  ['child', 'people', 0.35], ['baby', 'people', 0.35], ['person', 'people', 0.35],
  ['bride', 'people', 0.45], ['groom', 'people', 0.45], ['hug', 'people', 0.4],
  // ⚠️ variants()는 '-ing'을 벗기지 않는다 → 'laughing'과 'laugh'를 모두 넣는다.
  ['laughing', 'people', 0.4], ['laugh', 'people', 0.35],
  // ── animal: 동물 ──
  // dog·cat은 fun에서 가중치 그대로 옮겼다. 'cat'은 "cathedral" 오탐 회귀 케이스의 주인공이라
  // 컨셉이 바뀌어도 단어경계 검사(labelTaxonomy.verify.ts)를 반드시 유지해야 한다.
  ['dog', 'animal', 0.35], ['cat', 'animal', 0.35],
  ['animal', 'animal', 0.45], ['bird', 'animal', 0.45], ['wildlife', 'animal', 0.55],
  ['zoo', 'animal', 0.5], ['aquarium', 'animal', 0.5], ['deer', 'animal', 0.5],
  ['horse', 'animal', 0.4], ['fish', 'animal', 0.35], ['butterfly', 'animal', 0.5],
  ['monkey', 'animal', 0.5], ['cow', 'animal', 0.4], ['sheep', 'animal', 0.4],
  ['squirrel', 'animal', 0.5], ['seagull', 'animal', 0.5], ['penguin', 'animal', 0.5],
  ['pet', 'animal', 0.35],
  // ── food: 식사 (카페·디저트는 cafe로 나갔다) ──
  ['food', 'food', 0.6], ['meal', 'food', 0.5], ['dish', 'food', 0.5],
  ['restaurant', 'food', 0.5],
  ['fruit', 'food', 0.4], ['noodle', 'food', 0.5],
  ['sushi', 'food', 0.55], ['pizza', 'food', 0.5],
  // ── cafe: 카페·디저트·음료 ──
  // coffee·cafe·cake·dessert·bread·drink는 food에서 가중치 그대로 옮겼다.
  ['coffee', 'cafe', 0.45], ['cafe', 'cafe', 0.45], ['cake', 'cafe', 0.5],
  ['dessert', 'cafe', 0.55], ['bread', 'cafe', 0.45], ['drink', 'cafe', 0.4],
  ['bakery', 'cafe', 0.55], ['brunch', 'cafe', 0.5], ['latte', 'cafe', 0.55],
  ['tea', 'cafe', 0.4], ['teahouse', 'cafe', 0.55], ['pastry', 'cafe', 0.55],
  ['espresso', 'cafe', 0.55], ['croissant', 'cafe', 0.5], ['macaron', 'cafe', 0.5],
  ['chocolate', 'cafe', 0.35], ['juice', 'cafe', 0.3],
  // ── culture: 공연·전시·예술 ──
  // concert는 hip에서, festival은 fun에서 가중치 그대로 옮겼다.
  // 'mural'(벽화)은 hip의 'graffiti'(낙서)와 갈라 culture에 둔다 — 벽화는 공공 예술·전시
  // 성격이고 낙서는 거리 문화다. 랩 어휘(vocab.txt)에도 둘이 따로 있어 구분이 가능하다.
  ['concert', 'culture', 0.5], ['festival', 'culture', 0.45],
  ['exhibition', 'culture', 0.55], ['gallery', 'culture', 0.5], ['theater', 'culture', 0.5],
  ['performance', 'culture', 0.5], ['dance', 'culture', 0.45], ['parade', 'culture', 0.5],
  ['art', 'culture', 0.3], ['artwork', 'culture', 0.4], ['opera', 'culture', 0.55],
  ['orchestra', 'culture', 0.55], ['costume', 'culture', 0.45], ['ceremony', 'culture', 0.45],
  ['mural', 'culture', 0.45], ['sculpture', 'culture', 0.45], ['stage', 'culture', 0.4],
  // ── stay: 숙소 ──
  // 'pool'은 activity의 'swimming'과 함께 잡힌다(호텔 수영장) — 의도된 겹침이다.
  ['hotel', 'stay', 0.55], ['hostel', 'stay', 0.55], ['motel', 'stay', 0.5],
  ['resort', 'stay', 0.5], ['villa', 'stay', 0.5], ['guesthouse', 'stay', 0.55],
  ['accommodation', 'stay', 0.55], ['bedroom', 'stay', 0.5], ['bed', 'stay', 0.4],
  // ⚠️ 'room' 단독은 넣지 않는다(2026-09-18 QA 삭제). iOS Vision 어휘에 'dining room'·
  //    'living room'이 실재해 식당·거실 사진이 stay 0.30을 얻고 있었다. 'bedroom'은
  //    합성어 한 토큰이라 갈리지 않으니 안전하다. 'hotel room'처럼 구를 넣는 것도 안 된다 —
  //    토큰 'hotel'이 이미 stay 0.55를 주므로 구 경로와 이중 계상된다(위 PHRASE 주석).
  ['suite', 'stay', 0.5], ['lobby', 'stay', 0.45],
  ['balcony', 'stay', 0.4], ['terrace', 'stay', 0.35], ['pool', 'stay', 0.4],
  // ── shopping: 쇼핑 ──
  // 'market'은 night의 'night market'에서 함께 잡힌다(야시장) — 의도된 겹침이다.
  ['shopping', 'shopping', 0.55], ['market', 'shopping', 0.4], ['shop', 'shopping', 0.45],
  ['store', 'shopping', 0.45], ['mall', 'shopping', 0.5], ['souvenir', 'shopping', 0.55],
  ['boutique', 'shopping', 0.55], ['bazaar', 'shopping', 0.55], ['storefront', 'shopping', 0.5],
  ['supermarket', 'shopping', 0.5], ['bookstore', 'shopping', 0.45], ['stall', 'shopping', 0.4],
  // ── 합성어 명시 ──
  // 토큰 단위 매칭으로 바꾸면서(2026-09-06) 예전 부분 문자열 매칭이 우연히 잡아주던
  // 합성어가 빠졌다. 유용했던 것만 골라 표에 되살린다. 'seafood'는 특히 중요한데,
  // 예전에는 'sea'에 걸려 emotional까지 잘못 얻고 있었다 — 이제 food만 얻는다.
  ['seafood', 'food', 0.55],
  ['nightclub', 'night', 0.5], ['cityscape', 'hip', 0.4],
  // ── 공백이 든 키워드 → PHRASE_KEYWORDS로 자동 분류된다 ──
  // ⚠️ **구 키워드는 토큰만으로 못 잡히는 것만 넣는다.** 구 경로와 토큰 경로는 서로 다른
  //    키로 applied에 등록되므로(아래 conceptAffinityFromLabels 주석) 같은 컨셉이면 둘 다
  //    더해져 이중 계상된다. 'ice cream'은 'ice'·'cream' 단독 항목이 없어 구가 필요한
  //    진짜 사례다. 2026-09-18 QA: 'street market'(구 0.5 + 토큰 market 0.4 = 0.9)과
  //    'shopping bag'(구 0.5 + 토큰 shopping 0.55 = 상한 1.0)은 라벨 한 장으로 상한에
  //    닿아 어떤 컨셉도 이길 수 없게 만들었다 → 삭제. 토큰만으로 같은 컨셉을 이미 얻으므로
  //    손실이 없다('street market' → street(hip 0.3) + market(shopping 0.4)).
  ['ice cream', 'cafe', 0.55],
  // ── info: 랜드마크·구조물·전시 ──
  ['landmark', 'info', 0.55], ['monument', 'info', 0.5], ['castle', 'info', 0.5],
  ['temple', 'info', 0.5], ['church', 'info', 0.45], ['cathedral', 'info', 0.45],
  ['museum', 'info', 0.5], ['bridge', 'info', 0.4], ['tower', 'info', 0.4],
  ['statue', 'info', 0.45], ['palace', 'info', 0.5], ['architecture', 'info', 0.4],
  ['building', 'info', 0.25], ['sign', 'info', 0.3], ['map', 'info', 0.3],
  // ── transit: 여정 — 오가는 길(공항·기차·배·도로·짐) ──
  // ⚠️ -ing/명사 두 형태를 모두 넣는다. variants()는 단순 복수형만 벗기고 '-ing'은
  //    벗기지 않아서, 'ski'만 넣으면 라벨 'skiing'을 영영 못 잡는다(activity 구역도 동일).
  ['airport', 'transit', 0.6], ['airplane', 'transit', 0.55], ['flight', 'transit', 0.45],
  ['train', 'transit', 0.5], ['railway', 'transit', 0.45], ['station', 'transit', 0.35],
  ['subway', 'transit', 0.4], ['tram', 'transit', 0.35], ['bus', 'transit', 0.3],
  ['taxi', 'transit', 0.3], ['car', 'transit', 0.25],
  ['ferry', 'transit', 0.5], ['cruise', 'transit', 0.5], ['boat', 'transit', 0.35],
  ['ship', 'transit', 0.35], ['harbor', 'transit', 0.35],
  ['road', 'transit', 0.35], ['highway', 'transit', 0.4], ['tunnel', 'transit', 0.3],
  ['luggage', 'transit', 0.55], ['suitcase', 'transit', 0.55],
  ['scooter', 'transit', 0.3], ['motorcycle', 'transit', 0.3],
  // ── activity: 액티비티 — 몸으로 하는 것 ──
  ['hiking', 'activity', 0.55], ['hike', 'activity', 0.5], ['trekking', 'activity', 0.55],
  ['camping', 'activity', 0.5], ['camp', 'activity', 0.4],
  ['swimming', 'activity', 0.45], ['swim', 'activity', 0.4],
  ['snorkeling', 'activity', 0.55], ['diving', 'activity', 0.55], ['dive', 'activity', 0.45],
  ['surfing', 'activity', 0.55], ['surf', 'activity', 0.5],
  ['kayak', 'activity', 0.55], ['sailing', 'activity', 0.5],
  ['skiing', 'activity', 0.55], ['ski', 'activity', 0.5], ['snowboard', 'activity', 0.55],
  ['cycling', 'activity', 0.5], ['bicycle', 'activity', 0.4],
  ['climbing', 'activity', 0.5], ['climb', 'activity', 0.4], ['rafting', 'activity', 0.5],
  ['running', 'activity', 0.35], ['yoga', 'activity', 0.4],
  ['fishing', 'activity', 0.45], ['golf', 'activity', 0.45], ['picnic', 'activity', 0.4],
];

export const ZERO_CONCEPT_SCORES: ConceptScores = {
  emotional: 0, hip: 0, fun: 0, food: 0, info: 0, transit: 0, activity: 0,
  people: 0, night: 0, animal: 0, cafe: 0, culture: 0, nature: 0, stay: 0, shopping: 0,
  vivid: 0, mono: 0,
};

/**
 * 키워드 → [컨셉, 가중치] 목록. 표를 한 번만 훑어 만든다(라벨마다 표 전체를 순회하지 않는다).
 * 한 키워드가 여러 컨셉에 걸릴 수 있으므로 값이 배열이다.
 */
const KEYWORD_MAP = new Map<string, [RecoConcept, number][]>();
/** 공백이 든 키워드(구 단위). 'ice cream'처럼 토큰 하나로는 못 잡는 것들만 둔다. */
const PHRASE_KEYWORDS: [string, RecoConcept, number][] = [];
for (const [keyword, concept, weight] of KEYWORD_AFFINITY) {
  if (keyword.includes(' ')) {
    PHRASE_KEYWORDS.push([keyword, concept, weight]);
    continue;
  }
  const list = KEYWORD_MAP.get(keyword);
  if (list) list.push([concept, weight]);
  else KEYWORD_MAP.set(keyword, [[concept, weight]]);
}

/** 라벨을 소문자 토큰으로 쪼갠다. 'Sunset_Sky' → ['sunset','sky'], 'Night Life' → ['night','life'] */
function tokenize(label: string): string[] {
  return label.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * 토큰의 매칭 후보 — 원형 + 단순 복수형 제거.
 * 'sunsets'→'sunset', 'dishes'→'dish'. 'glass'는 -ss라 건드리지 않는다.
 */
function variants(token: string): string[] {
  const out = [token];
  if (token.length > 4 && token.endsWith('es')) out.push(token.slice(0, -2));
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) out.push(token.slice(0, -1));
  return out;
}

/**
 * 원시 라벨 배열 → 컨셉 점수. 신뢰도 가중 누적, 컨셉당 상한 1.0.
 * 라벨이 없으면(구 네이티브·미지원) 전부 0 — 호출부는 다른 신호로만 판정한다.
 *
 * **토큰 단위로 맞춘다. 부분 문자열이 아니다.**
 * 예전에는 `라벨.includes(키워드)`였는데, 짧은 키워드가 긴 단어 안에 박혀 오탐했다:
 * 'cat'이 "cathedral"에, 'ride'가 "bride"에, 'sign'이 "design"에, 'bar'가 "barbecue"에,
 * 'sea'가 "seafood"에 걸렸다(2026-09-06 발견, labelTaxonomy.verify.ts가 5건 모두 고정한다).
 * 성당 사진이 '유쾌' 점수를 얻는 식이라 조용히 추천 품질을 갉아먹었다.
 *
 * 표 안에서 키워드가 겹칠 때 한 라벨이 여러 번 발화하던 문제도 함께 사라진다 —
 * "skyline"이 'sky'와 'skyline' 양쪽에, "nightlife"가 'night'와 'nightlife' 양쪽에
 * 걸려 이중 계상되고 있었다.
 *
 * ⚠️ 단 **구 키워드(PHRASE_KEYWORDS)는 이 보호를 받지 않는다.** 아래 add()의 applied는
 * 키워드 문자열이 키라서, 구 'street market'과 토큰 'market'은 다른 키로 각각 더해진다.
 * 그래서 구 키워드는 토큰만으로 못 잡히는 것만 표에 넣는다(KEYWORD_AFFINITY의 PHRASE 주석).
 *
 * 대신 예전 부분 매칭이 우연히 잡아주던 합성어는 **표에 명시**해야 한다 —
 * 표를 넓힐 때 이 점을 잊지 말 것. 어떤 라벨이 버려지는지는
 * `node node_modules/tsx/dist/cli.mjs scripts/reco-lab.ts`의 '라벨 해석률'이 보여준다.
 */
export function conceptAffinityFromLabels(
  labels: { label: string; confidence: number }[] | undefined
): ConceptScores {
  const out: ConceptScores = { ...ZERO_CONCEPT_SCORES };
  if (!labels || labels.length === 0) return out;

  for (const { label, confidence } of labels) {
    if (!label || confidence <= 0) continue;
    const tokens = tokenize(label);
    if (tokens.length === 0) continue;

    // 한 라벨 안에서 같은 키워드가 두 번 적용되지 않게 한다
    // (원형과 복수형이 같이 잡히거나 같은 토큰이 반복되는 경우).
    const applied = new Set<string>();
    const add = (keyword: string, hits: [RecoConcept, number][]) => {
      if (applied.has(keyword)) return;
      applied.add(keyword);
      for (const [concept, weight] of hits) {
        out[concept] = Math.min(1, out[concept] + weight * confidence);
      }
    };

    for (const token of tokens) {
      for (const v of variants(token)) {
        const hits = KEYWORD_MAP.get(v);
        if (hits) add(v, hits);
      }
    }

    if (PHRASE_KEYWORDS.length > 0) {
      // 토큰을 다시 이어 붙여 구 단위로 맞춘다. 양끝 공백으로 감싸 부분 일치를 막는다.
      const padded = ` ${tokens.join(' ')} `;
      for (const [keyword, concept, weight] of PHRASE_KEYWORDS) {
        if (padded.includes(` ${keyword} `)) add(keyword, [[concept, weight]]);
      }
    }
  }
  return out;
}
