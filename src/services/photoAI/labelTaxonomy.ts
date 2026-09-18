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
  // ── 합성어 명시 ──
  // 토큰 단위 매칭으로 바꾸면서(2026-09-06) 예전 부분 문자열 매칭이 우연히 잡아주던
  // 합성어가 빠졌다. 유용했던 것만 골라 표에 되살린다. 'seafood'는 특히 중요한데,
  // 예전에는 'sea'에 걸려 emotional까지 잘못 얻고 있었다 — 이제 food만 얻는다.
  ['seafood', 'food', 0.55],
  ['nightclub', 'hip', 0.5], ['cityscape', 'hip', 0.4],
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
};

/**
 * 키워드 → [컨셉, 가중치] 목록. 표를 한 번만 훑어 만든다(라벨마다 표 전체를 순회하지 않는다).
 * 한 키워드가 여러 컨셉에 걸릴 수 있으므로 값이 배열이다.
 */
const KEYWORD_MAP = new Map<string, [RecoConcept, number][]>();
/** 공백이 든 키워드(구 단위). 현재는 없지만 표를 넓힐 때 쓰인다. */
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
