/**
 * countryLocate.ts
 * 오프라인 국가 판정 — 지구본용 세계 GeoJSON(WORLD_GEO_TEXT)에 point-in-polygon.
 * 여행 자동 불러오기의 국가 판정을 네트워크 지오코딩 없이 즉시 수행한다.
 * 폴리곤에 포함되지 않는 좌표(해안·국경 인접 등)는 null → 호출부가 지오코딩으로 폴백.
 *
 * 이름/ISO 매핑은 GlobeView의 GEO_NAME_FIX·EN_TO_ISO와 동일해야 한다(같은 GeoJSON 사용).
 *
 * ⚠️ 남북한만 10m, 나머지는 110m다.
 *   110m(WORLD_GEO_TEXT)의 남한은 꼭짓점 19개짜리 폴리곤 1개뿐이고 제주도조차 없다. 휴전선이
 *   실제보다 남쪽으로 처져 있어 파주 임진각·도라산역·강화 접경지가 북한 폴리곤 안에 들어갔고,
 *   그 결과 과거여행 불러오기가 **가본 적 없는 북한 여행 카드**를 만들었다(2026-09-09).
 *   제주·울릉도·통영·목포는 폴리곤에 아예 없어 매번 네트워크 역지오코딩으로 폴백했다.
 *   그래서 이 두 나라만 10m 폴리곤(data/koreaBorder10m)으로 교체한다.
 *   전 세계를 10m로 올리지 않는 이유: vendorCountries10m는 1.3MB TopoJSON이라 런타임 디코드
 *   비용이 크고, 오판이 실제로 사고를 낸 곳은 휴전선뿐이다. 다른 국경에서 같은 사고가 나면
 *   그 나라만 같은 방식으로 추가하면 된다(koreaBorder10m 생성 주석 참조).
 */
import { WORLD_GEO_TEXT } from '../data/vendorWorldGeo';
import { KOREA_SHAPES } from '../data/koreaBorder10m';

// GeoJSON의 구식 국가명 → 표준 이름 (GlobeView와 동일)
const GEO_NAME_FIX: Record<string, string> = {
  'USA': 'United States of America',
  'England': 'United Kingdom',
  'Republic of Serbia': 'Serbia',
  'United Republic of Tanzania': 'Tanzania',
  'Macedonia': 'North Macedonia',
  'Swaziland': 'Eswatini',
  'Republic of the Congo': 'Congo',
  'West Bank': 'Palestine',
};

// GeoJSON 영문 국가명 → ISO 3166-1 alpha-2 (GlobeView와 동일)
const EN_TO_ISO: Record<string, string> = {
  'Hong Kong': 'hk', 'Macau': 'mo', // 중국에서 분리한 별도 지역
  'Belize': 'bz', 'Benin': 'bj', 'Burkina Faso': 'bf', 'Burundi': 'bi', 'Central African Republic': 'cf',
  'Djibouti': 'dj', 'East Timor': 'tl', 'Equatorial Guinea': 'gq', 'Eritrea': 'er', 'Fiji': 'fj',
  'Gabon': 'ga', 'Gambia': 'gm', 'Lesotho': 'ls', 'Liberia': 'lr', 'Malawi': 'mw', 'Mauritania': 'mr',
  'Rwanda': 'rw', 'Sierra Leone': 'sl', 'Solomon Islands': 'sb', 'Suriname': 'sr', 'The Bahamas': 'bs',
  'Trinidad and Tobago': 'tt', 'Vanuatu': 'vu', 'Ivory Coast': 'ci', 'Guinea Bissau': 'gw',
  'Afghanistan': 'af', 'Albania': 'al', 'Algeria': 'dz', 'Angola': 'ao',
  'Argentina': 'ar', 'Armenia': 'am', 'Australia': 'au', 'Austria': 'at',
  'Azerbaijan': 'az', 'Bangladesh': 'bd', 'Belarus': 'by', 'Belgium': 'be',
  'Bhutan': 'bt', 'Bolivia': 'bo', 'Bosnia and Herzegovina': 'ba',
  'Botswana': 'bw', 'Brazil': 'br', 'Brunei': 'bn', 'Bulgaria': 'bg',
  'Cambodia': 'kh', 'Cameroon': 'cm', 'Canada': 'ca', 'Chad': 'td',
  'Chile': 'cl', 'China': 'cn', 'Colombia': 'co', 'Congo': 'cg',
  'Costa Rica': 'cr', 'Croatia': 'hr', 'Cuba': 'cu',
  'Czech Republic': 'cz', 'Czechia': 'cz',
  'Democratic Republic of the Congo': 'cd',
  'Denmark': 'dk', 'Dominican Republic': 'do',
  'Ecuador': 'ec', 'Egypt': 'eg', 'El Salvador': 'sv',
  'Estonia': 'ee', 'Ethiopia': 'et', 'Finland': 'fi', 'France': 'fr',
  'Georgia': 'ge', 'Germany': 'de', 'Ghana': 'gh', 'Greece': 'gr',
  'Guatemala': 'gt', 'Guinea': 'gn', 'Guyana': 'gy', 'Haiti': 'ht',
  'Honduras': 'hn', 'Hungary': 'hu', 'Iceland': 'is', 'India': 'in',
  'Indonesia': 'id', 'Iran': 'ir', 'Iraq': 'iq', 'Ireland': 'ie',
  'Israel': 'il', 'Italy': 'it', 'Jamaica': 'jm', 'Japan': 'jp',
  'Jordan': 'jo', 'Kazakhstan': 'kz', 'Kenya': 'ke',
  'Kuwait': 'kw', 'Kyrgyzstan': 'kg', 'Laos': 'la',
  'Latvia': 'lv', 'Lebanon': 'lb', 'Libya': 'ly',
  'Lithuania': 'lt', 'Luxembourg': 'lu',
  'Madagascar': 'mg', 'Malaysia': 'my', 'Mali': 'ml',
  'Mexico': 'mx', 'Moldova': 'md', 'Mongolia': 'mn', 'Montenegro': 'me',
  'Morocco': 'ma', 'Mozambique': 'mz', 'Myanmar': 'mm',
  'Namibia': 'na', 'Nepal': 'np', 'Netherlands': 'nl',
  'New Zealand': 'nz', 'Nicaragua': 'ni', 'Niger': 'ne',
  'Nigeria': 'ng', 'North Korea': 'kp', 'Norway': 'no',
  'Oman': 'om', 'Pakistan': 'pk', 'Panama': 'pa',
  'Papua New Guinea': 'pg', 'Paraguay': 'py', 'Peru': 'pe',
  'Philippines': 'ph', 'Poland': 'pl', 'Portugal': 'pt',
  'Qatar': 'qa', 'Romania': 'ro', 'Russia': 'ru',
  'Saudi Arabia': 'sa', 'Senegal': 'sn', 'Serbia': 'rs',
  'Slovakia': 'sk', 'Slovenia': 'si', 'Somalia': 'so',
  'South Africa': 'za', 'South Korea': 'kr', 'South Sudan': 'ss',
  'Spain': 'es', 'Sri Lanka': 'lk', 'Sudan': 'sd',
  'Sweden': 'se', 'Switzerland': 'ch', 'Syria': 'sy',
  'Taiwan': 'tw', 'Tajikistan': 'tj', 'Tanzania': 'tz',
  'Thailand': 'th', 'Togo': 'tg', 'Tunisia': 'tn',
  'Turkey': 'tr', 'Turkmenistan': 'tm',
  'Uganda': 'ug', 'Ukraine': 'ua',
  'United Arab Emirates': 'ae',
  'United Kingdom': 'gb', 'United States of America': 'us',
  'Uruguay': 'uy', 'Uzbekistan': 'uz',
  'Venezuela': 've', 'Vietnam': 'vn',
  'Yemen': 'ye', 'Zambia': 'zm', 'Zimbabwe': 'zw',
  'Greenland': 'gl', 'Western Sahara': 'eh',
  'Palestine': 'ps', 'Cyprus': 'cy', 'Kosovo': 'xk',
  'North Macedonia': 'mk', 'Eswatini': 'sz',
};

type Ring = [number, number][]; // [lon, lat]
interface CountryShape {
  code: string; // ISO2 대문자 (expo-location isoCountryCode와 동일 형식)
  name: string; // GeoJSON 표준 영문명
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  polys: Ring[][]; // 폴리곤 목록 — 각 폴리곤은 [외곽링, ...구멍링]
}

let shapes: CountryShape[] | null = null;

// 10m로 대체하는 국가의 GeoJSON 표준 영문명. 여기 적힌 이름은 110m 피처를 **건너뛴다** —
// 저해상도 폴리곤이 남아 있으면 bbox 면적 오름차순 정렬에서 먼저 걸려 정밀 폴리곤을 가린다.
const HI_RES_NAMES = new Set(KOREA_SHAPES.map((s) => s.name));

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
  const out: CountryShape[] = [];
  const geo = JSON.parse(WORLD_GEO_TEXT) as {
    features: { properties?: { name?: string }; geometry?: { type: string; coordinates: any } }[];
  };
  for (const f of geo.features) {
    const raw = f.properties?.name;
    if (!raw || !f.geometry) continue;
    const name = GEO_NAME_FIX[raw] || raw;
    if (HI_RES_NAMES.has(name)) continue; // 10m 폴리곤으로 대체된 국가 — 저해상도판은 버린다
    const iso = EN_TO_ISO[name];
    if (!iso) continue; // 매핑 없는 지형(남극 등)은 판정 대상에서 제외
    const polys: Ring[][] =
      f.geometry.type === 'Polygon' ? [f.geometry.coordinates]
      : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates
      : [];
    if (polys.length === 0) continue;
    out.push({ code: iso.toUpperCase(), name, bbox: bboxOf(polys), polys });
  }
  for (const s of KOREA_SHAPES) {
    out.push({ code: s.code, name: s.name, bbox: bboxOf(s.polys), polys: s.polys });
  }
  // 작은 영토(홍콩·마카오 등 중국 안 엔클레이브) 먼저 판정 — 겹치는 좌표에서 작은 쪽이 이기게 bbox 면적 오름차순
  out.sort((a, b) =>
    (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]) - (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1])
  );
  return out;
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
export function locateCountry(lat: number, lon: number): { code: string; name: string } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (!shapes) shapes = buildIndex();
  for (const s of shapes) {
    const [minLon, minLat, maxLon, maxLat] = s.bbox;
    if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
    for (const poly of s.polys) {
      if (pointInPolygon(lon, lat, poly)) return { code: s.code, name: s.name };
    }
  }
  return null;
}
