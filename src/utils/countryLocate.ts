/**
 * countryLocate.ts
 * 오프라인 국가 판정 — Natural Earth **10m** admin-0 폴리곤에 point-in-polygon.
 * 여행 자동 불러오기의 국가 판정을 네트워크 지오코딩 없이 즉시 수행한다.
 * 폴리곤에 포함되지 않는 좌표(먼바다 등)는 null → 호출부가 지오코딩으로 폴백.
 *
 * ⚠️ 2026-09-11: 원천을 110m(vendorWorldGeo) → 10m(vendorCountries10m)로 **전면 교체**했다.
 *   110m는 국가 하나가 꼭짓점 수십 개라 국경이 통째로 밀려 있었다. 실측(유럽 43곳)에서
 *   제네바(CH)→FR, 모나코(MC)→FR, 바티칸(VA)→IT, 산마리노(SM)→IT, 파두츠(LI)→AT,
 *   안도라(AD)→FR, 지브롤터(GI)→ES, 가르미슈(DE)→AT, 마스트리흐트(NL)→BE, 아헨(DE)→BE,
 *   샤모니(FR)→IT — 11곳이 **옆 나라로 판정**됐다. 그리고 몰타·세우타 같은 작은 영토와
 *   오키나와·괌·사이판·발리·푸켓·몰디브·이스탄불 등 인기 여행지는 폴리곤에 아예 없어
 *   매번 네트워크 역지오코딩으로 폴백했다 — 행사장처럼 네트워크가 불안하면 그 사진들이
 *   미상이 되고, 미상 사진은 앞뒤 구간 국가를 물려받으므로 **여행이 통째로 한국 구간에
 *   흡수**됐다. 10m로 바꾸면 위 11곳이 전부 맞고 인기 여행지 50곳 중 49곳이 오프라인으로 잡힌다.
 *
 *   2026-09-09에 남북한만 10m로 갈아끼운 `data/koreaBorder10m`은 이 교체로 존재 이유가
 *   사라져 삭제했다(전체가 10m다).
 *
 * ⚠️ 비용: vendorCountries10m는 1.3MB TopoJSON 문자열이다. **모듈 로드 시점에 파싱하면 안 된다** —
 *   이 모듈은 화면 여럿이 import하므로 앱 시작이 그만큼 늦어진다. GlobeView.tsx:4175와 같은
 *   방식으로 첫 `locateCountry` 호출에서 lazy `require` → 1회 디코드 → 모듈 변수에 캐시한다.
 *
 * 10m 피처의 속성은 `name`(영문)·`name_ko`(한글) 둘뿐이다. **ISO 코드가 없어** 아래
 * `EN_TO_ISO`가 유일한 매핑이며, 여기에도 `EXCLUDED_10M`에도 없는 이름이 하나라도 생기면
 * 그 나라가 조용히 판정 대상에서 빠진다 → `__DEV__` 경고 + `unmappedCountryNames()`로
 * 검증에서 기계적으로 막는다.
 */

// ─── 10m 영문 국가명 → ISO 3166-1 alpha-2 ──────────────────────────────────────
// 10m는 축약 표기가 많다(`Bosnia and Herz.`, `Dem. Rep. Congo`, `N. Mariana Is.` …).
// 110m용 별칭(`USA`·`England`·`Republic of Serbia` 등)은 10m에 한 건도 없어 전부 지웠다 —
// 그래서 이 파일에는 GEO_NAME_FIX가 더 이상 없다. 표기가 흔들릴 여지 자체를 없앤 쪽이
// 안전하다(별칭이 남아 있으면 "왜 안 잡히지"를 두 표에서 찾게 된다).
const EN_TO_ISO: Record<string, string> = {
  'Afghanistan': 'af', 'Albania': 'al', 'Algeria': 'dz', 'American Samoa': 'as',
  'Andorra': 'ad', 'Angola': 'ao', 'Anguilla': 'ai', 'Antigua and Barb.': 'ag',
  'Argentina': 'ar', 'Armenia': 'am', 'Aruba': 'aw', 'Australia': 'au', 'Austria': 'at',
  'Azerbaijan': 'az', 'Bahamas': 'bs', 'Bahrain': 'bh', 'Bangladesh': 'bd',
  'Barbados': 'bb', 'Belarus': 'by', 'Belgium': 'be', 'Belize': 'bz', 'Benin': 'bj',
  'Bermuda': 'bm', 'Bhutan': 'bt', 'Bolivia': 'bo', 'Bosnia and Herz.': 'ba',
  'Botswana': 'bw', 'Brazil': 'br', 'British Virgin Is.': 'vg', 'Brunei': 'bn',
  'Bulgaria': 'bg', 'Burkina Faso': 'bf', 'Burundi': 'bi', 'Cabo Verde': 'cv',
  'Cambodia': 'kh', 'Cameroon': 'cm', 'Canada': 'ca', 'Cayman Is.': 'ky',
  'Central African Rep.': 'cf', 'Chad': 'td', 'Chile': 'cl', 'China': 'cn',
  'Colombia': 'co', 'Comoros': 'km', 'Congo': 'cg', 'Cook Is.': 'ck',
  'Costa Rica': 'cr', 'Croatia': 'hr', 'Cuba': 'cu', 'Curaçao': 'cw', 'Cyprus': 'cy',
  'Czechia': 'cz', "Côte d'Ivoire": 'ci', 'Dem. Rep. Congo': 'cd', 'Denmark': 'dk',
  'Djibouti': 'dj', 'Dominica': 'dm', 'Dominican Rep.': 'do', 'Ecuador': 'ec',
  'Egypt': 'eg', 'El Salvador': 'sv', 'Eq. Guinea': 'gq', 'Eritrea': 'er',
  'Estonia': 'ee', 'Ethiopia': 'et', 'Faeroe Is.': 'fo', 'Falkland Is.': 'fk',
  'Fiji': 'fj', 'Finland': 'fi', 'Fr. Polynesia': 'pf', 'France': 'fr', 'Gabon': 'ga',
  'Gambia': 'gm', 'Georgia': 'ge', 'Germany': 'de', 'Ghana': 'gh', 'Gibraltar': 'gi',
  'Greece': 'gr', 'Greenland': 'gl', 'Grenada': 'gd', 'Guam': 'gu', 'Guatemala': 'gt',
  'Guernsey': 'gg', 'Guinea': 'gn', 'Guinea-Bissau': 'gw', 'Guyana': 'gy', 'Haiti': 'ht',
  'Honduras': 'hn', 'Hong Kong': 'hk', 'Hungary': 'hu', 'Iceland': 'is', 'India': 'in',
  'Indonesia': 'id', 'Iran': 'ir', 'Iraq': 'iq', 'Ireland': 'ie', 'Isle of Man': 'im',
  'Israel': 'il', 'Italy': 'it', 'Jamaica': 'jm', 'Japan': 'jp', 'Jersey': 'je',
  'Jordan': 'jo', 'Kazakhstan': 'kz', 'Kenya': 'ke', 'Kiribati': 'ki', 'Kosovo': 'xk',
  'Kuwait': 'kw', 'Kyrgyzstan': 'kg', 'Laos': 'la', 'Latvia': 'lv', 'Lebanon': 'lb',
  'Lesotho': 'ls', 'Liberia': 'lr', 'Libya': 'ly', 'Liechtenstein': 'li',
  'Lithuania': 'lt', 'Luxembourg': 'lu', 'Macao': 'mo', 'Madagascar': 'mg',
  'Malawi': 'mw', 'Malaysia': 'my', 'Maldives': 'mv', 'Mali': 'ml', 'Malta': 'mt',
  'Marshall Is.': 'mh', 'Mauritania': 'mr', 'Mauritius': 'mu', 'Mexico': 'mx',
  'Micronesia': 'fm', 'Moldova': 'md', 'Monaco': 'mc', 'Mongolia': 'mn',
  'Montenegro': 'me', 'Montserrat': 'ms', 'Morocco': 'ma', 'Mozambique': 'mz',
  'Myanmar': 'mm',
  // 북키프로스는 미승인 국가다. 여권·항공권·앱의 나라 목록 어디에도 따로 없으므로 CY로 합친다
  // (분리하면 니코시아 북쪽에서 찍은 사진만 존재하지 않는 나라 카드가 된다).
  'N. Cyprus': 'cy',
  'N. Mariana Is.': 'mp', 'Namibia': 'na', 'Nauru': 'nr', 'Nepal': 'np',
  'Netherlands': 'nl', 'New Caledonia': 'nc', 'New Zealand': 'nz', 'Nicaragua': 'ni',
  'Niger': 'ne', 'Nigeria': 'ng', 'Niue': 'nu', 'North Korea': 'kp',
  'North Macedonia': 'mk', 'Norway': 'no', 'Oman': 'om', 'Pakistan': 'pk',
  'Palau': 'pw', 'Palestine': 'ps', 'Panama': 'pa', 'Papua New Guinea': 'pg',
  'Paraguay': 'py', 'Peru': 'pe', 'Philippines': 'ph', 'Poland': 'pl',
  'Portugal': 'pt', 'Puerto Rico': 'pr', 'Qatar': 'qa', 'Romania': 'ro', 'Russia': 'ru',
  'Rwanda': 'rw', 'S. Sudan': 'ss', 'Saint Helena': 'sh', 'Saint Lucia': 'lc',
  'Samoa': 'ws', 'San Marino': 'sm', 'Saudi Arabia': 'sa', 'Senegal': 'sn',
  'Serbia': 'rs', 'Seychelles': 'sc', 'Sierra Leone': 'sl', 'Singapore': 'sg',
  'Sint Maarten': 'sx', 'Slovakia': 'sk', 'Slovenia': 'si', 'Solomon Is.': 'sb',
  'Somalia': 'so',
  // 소말릴란드도 미승인 — 소말리아로 합친다(위 N. Cyprus와 같은 이유).
  'Somaliland': 'so',
  'South Africa': 'za', 'South Korea': 'kr', 'Spain': 'es', 'Sri Lanka': 'lk',
  'St-Barthélemy': 'bl', 'St-Martin': 'mf', 'St. Kitts and Nevis': 'kn',
  'St. Pierre and Miquelon': 'pm', 'St. Vin. and Gren.': 'vc', 'Sudan': 'sd',
  'Suriname': 'sr', 'Sweden': 'se', 'Switzerland': 'ch', 'Syria': 'sy',
  'São Tomé and Principe': 'st', 'Taiwan': 'tw', 'Tajikistan': 'tj', 'Tanzania': 'tz',
  'Thailand': 'th', 'Timor-Leste': 'tl', 'Togo': 'tg', 'Tonga': 'to',
  'Trinidad and Tobago': 'tt', 'Tunisia': 'tn', 'Turkey': 'tr', 'Turkmenistan': 'tm',
  'Turks and Caicos Is.': 'tc', 'Tuvalu': 'tv', 'U.S. Virgin Is.': 'vi', 'Uganda': 'ug',
  'Ukraine': 'ua', 'United Arab Emirates': 'ae', 'United Kingdom': 'gb',
  'United States of America': 'us', 'Uruguay': 'uy', 'Uzbekistan': 'uz',
  'Vanuatu': 'vu', 'Vatican': 'va', 'Venezuela': 've', 'Vietnam': 'vn',
  'W. Sahara': 'eh', 'Yemen': 'ye', 'Zambia': 'zm', 'Zimbabwe': 'zw',
  'eSwatini': 'sz', 'Åland': 'ax',
};

/**
 * 판정 대상에서 **의도적으로** 뺀 10m 지형.
 *
 * 왜 명시 집합인가: "매핑에 없으면 그냥 건너뛴다"로 두면 진짜 누락(새 나라·표기 변경)과
 * 구분이 안 된다. 여기 적힌 것만 침묵하고 나머지는 경고를 띄운다.
 *
 * 기준: 사람이 여행으로 갈 수 없거나(남극·빙하·무인 암초), ISO2가 없거나(주권 미정 지대),
 * 군사 기지·완충 지대라 여행 카드가 되면 안 되는 곳.
 */
const EXCLUDED_10M = new Set<string>([
  'Antarctica', 'Fr. S. Antarctic Lands', 'Heard I. and McDonald Is.', 'S. Geo. and the Is.',
  'Southern Patagonian Ice Field', 'Siachen Glacier',
  'Dhekelia', 'Akrotiri', 'Cyprus U.N. Buffer Zone', 'USNB Guantanamo Bay', 'Baikonur',
  'Bir Tawil', 'Brazilian I.',
  'Spratly Is.', 'Scarborough Reef', 'Bajo Nuevo Bank', 'Serranilla Bank',
  'Coral Sea Is.', 'Ashmore and Cartier Is.', 'Clipperton I.',
  'U.S. Minor Outlying Is.', 'Br. Indian Ocean Ter.', 'Indian Ocean Ter.',
  'Pitcairn Is.', 'Norfolk Island', 'Wallis and Futuna Is.',
]);

/**
 * 앱의 다른 표기 → 10m 표준 이름.
 *
 * 왜 필요한가: 사진첩 국가 필터(`utils/photoCountryFilter` ← `AlbumCreateScreen`)가
 * `MainScreen.KO_TO_EN`의 값을 그대로 넘기는데, 그 표는 110m 시절·일반 영문 표기라
 * 10m의 축약 표기와 다르다. 전수 확인(2026-09-11) 결과 201개 값 중 **22개**가 안 풀렸다.
 *
 * ⚠️ 이 표는 `countryCodeByNameEn`만 쓴다. 폴리곤 판정 경로(`locateCountry`)는 10m 원본
 *    이름만 보므로 여기에 뭘 넣어도 판정이 흔들리지 않는다.
 */
const EN_ALIAS: Record<string, string> = {
  'Antigua and Barbuda': 'Antigua and Barb.',
  'Bosnia and Herzegovina': 'Bosnia and Herz.',
  'Cape Verde': 'Cabo Verde',
  'Central African Republic': 'Central African Rep.',
  'Czech Republic': 'Czechia',
  'Democratic Republic of the Congo': 'Dem. Rep. Congo',
  'Dominican Republic': 'Dominican Rep.',
  'East Timor': 'Timor-Leste',
  'Equatorial Guinea': 'Eq. Guinea',
  'Eswatini': 'eSwatini',
  'Guinea Bissau': 'Guinea-Bissau',
  'Ivory Coast': "Côte d'Ivoire",
  'Macau': 'Macao',
  'Marshall Islands': 'Marshall Is.',
  'Saint Kitts and Nevis': 'St. Kitts and Nevis',
  'Saint Vincent and the Grenadines': 'St. Vin. and Gren.',
  'Sao Tome and Principe': 'São Tomé and Principe',
  'Solomon Islands': 'Solomon Is.',
  'South Sudan': 'S. Sudan',
  'The Bahamas': 'Bahamas',
  'Vatican City': 'Vatican',
  'Western Sahara': 'W. Sahara',
};

/**
 * 같은 ISO를 두 피처가 나눠 갖는 경우, **한글 이름 색인에서 제외할 쪽**.
 * 색인은 먼저 만난 피처가 이기는데 TopoJSON의 피처 순서는 보장이 없어서,
 * 이걸 안 걸면 CY가 '북키프로스', SO가 '소말릴란드'가 될 수 있다.
 */
const NAME_KO_ALIAS = new Set<string>(['N. Cyprus', 'Somaliland']);

/**
 * 객체 리터럴에서 **자기 키만** 읽는다.
 *
 * 왜: `EN_TO_ISO['constructor']`는 `Object.prototype.constructor`(함수)를 준다. 그대로
 * `.toUpperCase()`를 부르면 TypeError로 죽는데, 이 조회는 `AlbumCreateScreen`의 `useMemo`
 * 안에서 돌아 **화면이 통째로 크래시**한다(2026-09-11 QA F3). 110m 시절 구현은 배열 `find`라
 * 같은 입력에서 그냥 null이었다 — 되돌리지 말 것.
 */
function own(table: Record<string, string>, key: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

type Ring = [number, number][]; // [lon, lat]
interface CountryShape {
  code: string;   // ISO2 대문자 (expo-location isoCountryCode와 동일 형식)
  name: string;   // 10m 영문명
  nameKo?: string; // 10m 한글명 (name_ko)
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  polys: Ring[][]; // 폴리곤 목록 — 각 폴리곤은 [외곽링, ...구멍링]
}

let shapes: CountryShape[] | null = null;
let koByCode: Record<string, string> = {};
let unmapped: string[] = [];

/**
 * 매핑은 있는데 **10m 데이터에 폴리곤이 없는** 나라. 현재 바티칸 하나뿐이다
 * (mapshaper 30% 단순화에서 소실 — 258피처 중 유일한 null 지오메트리).
 * 이 코드로는 `locateCountry`가 영원히 다른 나라를 주므로, 국가 단위 필터
 * (`photoCountryFilter.getCountryFeature`)가 이걸 받으면 "사진 0장"이 된다 → 필터를 끈다.
 *
 * ⚠️ 상수로 두는 이유: 실제 확인에는 1.3MB 디코드가 필요한데 이 검사는 화면 렌더 경로에서 돈다.
 *    데이터와 어긋나지 않는지는 verify가 `polygonlessCountryCodes()`로 대조한다.
 */
export const NO_POLYGON_CODES = new Set(['VA']);

// ─── TopoJSON 미니 디코더 ─────────────────────────────────────────────────────
// 참조 구현은 `GlobeView.tsx`의 `topoDecode`인데, 그건 WebView에 주입되는 **HTML 문자열
// 안**이라 import할 수 없다. 같은 로직(transform 델타 누적 → arcs → ringFromArcs,
// 이음점 중복 제거, 음수 인덱스는 뒤집기)을 여기에 옮겨 적었다. 둘 중 하나를 고치면
// 다른 하나도 봐야 한다.
type TopoArc = [number, number][];
interface TopoGeom { type: string; arcs: any; properties?: { name?: string; name_ko?: string } }
interface Topo {
  transform?: { scale: [number, number]; translate: [number, number] };
  arcs: TopoArc[];
  objects: Record<string, { geometries?: TopoGeom[] }>;
}

function decodeArcs(topo: Topo): Ring[] {
  const tf = topo.transform;
  return topo.arcs.map((arc) => {
    if (!tf) return arc.map((p) => [p[0], p[1]] as [number, number]);
    let x = 0;
    let y = 0;
    return arc.map((p) => {
      x += p[0];
      y += p[1];
      return [x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]] as [number, number];
    });
  });
}

function ringFromArcs(arcs: Ring[], idxs: number[]): Ring {
  const ring: Ring = [];
  for (const ai of idxs) {
    const pts = ai >= 0 ? arcs[ai] : arcs[~ai].slice().reverse();
    // 이음점 중복 제거 — 이어붙일 때 앞 arc의 끝점 = 뒤 arc의 시작점이라 첫 점을 버린다
    for (let i = ring.length ? 1 : 0; i < pts.length; i++) ring.push(pts[i]);
  }
  return ring;
}

function bboxOf(polys: Ring[][]): [number, number, number, number] {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const poly of polys) {
    for (const [lon, lat] of poly[0]) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [minLon, minLat, maxLon, maxLat];
}

function buildIndex(): CountryShape[] {
  // lazy require — 모듈 로드가 아니라 첫 판정에서만 1.3MB를 만진다(GlobeView.tsx:4175와 동일 방식)
  const { COUNTRIES_10M_TOPO } = require('../data/vendorCountries10m');
  const topo = JSON.parse(COUNTRIES_10M_TOPO) as Topo;
  const arcs = decodeArcs(topo);
  const out: CountryShape[] = [];
  koByCode = {};
  unmapped = [];
  for (const g of topo.objects.countries?.geometries || []) {
    const name = g.properties?.name;
    if (!name) continue;
    if (EXCLUDED_10M.has(name)) continue;
    const iso = own(EN_TO_ISO, name);
    if (!iso) { unmapped.push(name); continue; }
    const code = iso.toUpperCase();
    const nameKo = g.properties?.name_ko;
    // 한글 이름 색인은 **폴리곤보다 먼저** 채운다 — 바티칸은 mapshaper 30% 단순화에서
    // 폴리곤이 통째로 사라진 null 지오메트리라(258개 중 유일) 아래 continue에 걸리는데,
    // 이름은 표시용이라 폴리곤 유무와 상관없이 있어야 한다.
    if (nameKo && !NAME_KO_ALIAS.has(name) && !own(koByCode, code)) koByCode[code] = nameKo;
    const polys: Ring[][] =
      g.type === 'Polygon' ? [(g.arcs as number[][]).map((r) => ringFromArcs(arcs, r))]
      : g.type === 'MultiPolygon' ? (g.arcs as number[][][]).map((poly) => poly.map((r) => ringFromArcs(arcs, r)))
      : [];
    if (polys.length === 0) continue;
    out.push({ code, name, nameKo, bbox: bboxOf(polys), polys });
  }
  if (unmapped.length && typeof __DEV__ !== 'undefined' && __DEV__) {
    // 매핑 표에도 제외 집합에도 없는 이름 = 그 나라가 조용히 판정에서 빠진 상태다
    console.warn('[countryLocate] 10m 이름 미매핑 — EN_TO_ISO 또는 EXCLUDED_10M에 추가하라:', unmapped);
  }
  // 작은 영토(바티칸·모나코·홍콩·마카오 등 큰 나라 안 엔클레이브) 먼저 판정 —
  // 겹치는 좌표에서 작은 쪽이 이기게 bbox 면적 오름차순. 10m는 이 작은 나라들이 전부
  // 별도 피처라 110m 때보다 이 정렬이 더 중요하다.
  out.sort((a, b) =>
    (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]) - (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1])
  );
  return out;
}

function ensureIndex(): CountryShape[] {
  if (!shapes) shapes = buildIndex();
  return shapes;
}

// 레이 캐스팅 — 링 방향(시계/반시계)과 무관하게 동작
function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(lon: number, lat: number, poly: Ring[]): boolean {
  if (!pointInRing(lon, lat, poly[0])) return false;
  for (let h = 1; h < poly.length; h++) {
    if (pointInRing(lon, lat, poly[h])) return false; // 구멍 안이면 제외
  }
  return true;
}

/**
 * 오프라인 폴리곤이 낸 판정을 **신뢰할지** 결정한다. 순수 함수 — 기하가 아니라 정책이다.
 *
 * 규칙 하나뿐: **오프라인 판정이 KP인데 사용자의 거주국이 KR이면 신뢰하지 않는다.**
 *
 * 왜: 한국 거주자는 북한 방문이 법적으로 불가하므로, 그 사용자의 사진에 찍힌 KP는
 * 한강 하구·군사분계선 구간의 접경 오차일 확률이 압도적이다. 실측(2026-09-09)에서
 * 강화 평화전망대(37.8836, 126.4494)·제적봉·판문점이 **KP 폴리곤 안에만** 들어간다
 * (KR=false / KP=true). 두 폴리곤이 겹치는 게 아니라 검사 순서로는 못 고치고,
 * 원본 데이터부터 이 구간이 애매해 해상도를 올려도 없앨 수 없다.
 *
 * 반대로 **거주국이 한국이 아닌 사용자에게는 실제 방북이 가능하므로 KP를 그대로 신뢰한다.**
 * 이 앱은 해외 사용자로 확장하며, 방북 중에는 로밍이 안 돼 대개 오프라인이라 오프라인
 * 판정을 막아버리면 그들의 여행이 영영 안 잡힌다.
 *
 * ⚠️ 한계: 거주국은 국적이 아니라 설정값(`settingsStore.homeCountryCode`)이다. 따라서
 *    **한국에 거주하는 외국인**은 실제로 방북해도 이 함수가 KP를 보류하므로, 온라인
 *    지오코딩이 KP를 확인해 준 경우에만 북한 기록을 얻는다. 오프라인 방북은 미상이 된다.
 *    거주국을 잠시 바꾸면 우회되지만 그 안내는 하지 않는다(예외가 드물다).
 *
 * `locateCountry`는 이 판단을 하지 않는다 — 순수 기하 함수에 정책을 넣으면 호출부마다
 * 다른 정책이 필요해질 때 갈라진다. 호출부가 명시적으로 이 함수를 불러 쓴다.
 */
export function isOfflineCountryTrusted(code: string, homeCountryCode?: string): boolean {
  if (code.toUpperCase() !== 'KP') return true; // KP 외에는 거주국과 무관하게 항상 신뢰
  return homeCountryCode?.toUpperCase() !== 'KR';
}

/**
 * 좌표의 국가를 오프라인으로 판정한다. 미포함이면 null (호출부가 지오코딩 폴백).
 * 반환 code는 ISO2 대문자 — expo-location의 isoCountryCode와 같은 형식.
 * ⚠️ 이 함수는 폴리곤 포함 여부만 본다. "그 판정을 믿을 것인가"는 정책이라 여기 넣지 않는다 —
 *    호출부가 `isOfflineCountryTrusted`로 따로 판단한다.
 */
export function locateCountry(lat: number, lon: number): { code: string; name: string; nameKo?: string } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  for (const s of ensureIndex()) {
    const [minLon, minLat, maxLon, maxLat] = s.bbox;
    if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
    for (const poly of s.polys) {
      if (pointInPolygon(lon, lat, poly)) return { code: s.code, name: s.name, nameKo: s.nameKo };
    }
  }
  return null;
}

/**
 * ISO2 → 10m 데이터의 한글 국가명. 모르면 undefined.
 *
 * 왜 필요한가: 앱의 나라 목록(`constants/countries.ts`)에는 괌·사이판·지브롤터·바티칸처럼
 * 여행지이지만 "나라"로 안 넣은 곳이 없어서, 가져온 여행 카드 이름이 `'GU'`·`'MP'`처럼
 * 코드 그대로 떨어졌다. 10m 피처가 `name_ko`를 갖고 있으니 그걸 쓴다.
 * (`constants/countries.ts`는 지구본 매핑 4곳과 동기화되는 제품 데이터라 건드리지 않는다)
 *
 * ⚠️ **이 함수는 절대 스스로 디코드하지 않는다.** 인덱스가 아직 없으면 그냥 `undefined`다.
 *
 *   왜: 유일한 호출부인 `pastTripScan.countryInfoFromCode`가 `FriendProfileScreen`의
 *   `useMemo` **렌더 중**에도 불린다. 거기 들어오는 `profiles.country`는 클라이언트가 쓰는
 *   컬럼이라, 옛 버전·타 기기가 넣은 이상한 코드 하나면 친구 프로필을 여는 것만으로
 *   1.3MB `JSON.parse`가 렌더를 막는다(2026-09-11 QA F2).
 *
 *   왜 그래도 쓸모 있나: 이 폴백이 **실제로 필요한 순간**은 스캔 결과로 카드 이름을 만들 때인데
 *   (`TravelImportScreen`·`recentPhotoCountryScan`), 그 스캔은 직전에 `locateCountry`를 수백 번
 *   불러 인덱스가 이미 서 있다. 반대로 프로필 등 다른 화면은 저장된 `countryName`을 그대로
 *   그리므로 색인이 필요 없다 — 없으면 종전처럼 코드 문자열로 떨어질 뿐 손해가 없다.
 */
export function countryNameKoByCode(code: string): string | undefined {
  if (!code || !shapes) return undefined; // ← ensureIndex()를 부르지 않는 것이 요점이다
  return own(koByCode, code.toUpperCase());
}

/**
 * 영문 국가명 → ISO2 대문자. 모르면 undefined.
 *
 * `locateCountry`가 쓰는 것과 **같은 매핑 표**를 본다 — 표가 두 벌이면 또 어긋난다
 * (110m 시절 `photoCountryFilter`가 자기 `GEO_NAME_FIX`를 따로 들고 있다가 그렇게 됐다).
 * 10m 표준 이름과 `EN_ALIAS`의 다른 표기 둘 다 받는다. 디코드를 유발하지 않는 순수 조회다.
 */
export function countryCodeByNameEn(nameEn: string): string | undefined {
  const n = nameEn?.trim();
  if (!n) return undefined;
  const alias = own(EN_ALIAS, n);
  const iso = own(EN_TO_ISO, n) ?? (alias ? own(EN_TO_ISO, alias) : undefined);
  return iso ? iso.toUpperCase() : undefined;
}

/**
 * 검증 전용 — `EN_TO_ISO`에도 `EXCLUDED_10M`에도 없어 판정에서 빠진 10m 이름 목록.
 * 비어 있지 않으면 그 나라의 사진이 조용히 미상이 된다는 뜻이다.
 */
export function unmappedCountryNames(): string[] {
  ensureIndex();
  return unmapped.slice();
}

/**
 * 검증 전용 — 매핑에는 있으나 실제 폴리곤이 한 개도 없는 ISO 코드. `NO_POLYGON_CODES`의 대조군.
 * 디코드를 유발하므로 런타임 경로에서 부르지 말 것.
 */
export function polygonlessCountryCodes(): string[] {
  const withPolys = new Set(ensureIndex().map((s) => s.code));
  const all = new Set(Object.values(EN_TO_ISO).map((c) => c.toUpperCase()));
  return [...all].filter((c) => !withPolys.has(c)).sort();
}
