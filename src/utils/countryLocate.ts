/**
 * countryLocate.ts
 * 오프라인 국가 판정 — 지구본용 세계 GeoJSON(WORLD_GEO_TEXT)에 point-in-polygon.
 * 여행 자동 불러오기의 국가 판정을 네트워크 지오코딩 없이 즉시 수행한다.
 * 폴리곤에 포함되지 않는 좌표(해안·국경 인접 등)는 null → 호출부가 지오코딩으로 폴백.
 *
 * 이름/ISO 매핑은 GlobeView의 GEO_NAME_FIX·EN_TO_ISO와 동일해야 한다(같은 GeoJSON 사용).
 */
import { WORLD_GEO_TEXT } from '../data/vendorWorldGeo';

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

function buildIndex(): CountryShape[] {
  const out: CountryShape[] = [];
  const geo = JSON.parse(WORLD_GEO_TEXT) as {
    features: { properties?: { name?: string }; geometry?: { type: string; coordinates: any } }[];
  };
  for (const f of geo.features) {
    const raw = f.properties?.name;
    if (!raw || !f.geometry) continue;
    const name = GEO_NAME_FIX[raw] || raw;
    const iso = EN_TO_ISO[name];
    if (!iso) continue; // 매핑 없는 지형(남극 등)은 판정 대상에서 제외
    const polys: Ring[][] =
      f.geometry.type === 'Polygon' ? [f.geometry.coordinates]
      : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates
      : [];
    if (polys.length === 0) continue;
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const poly of polys) {
      for (const [lon, lat] of poly[0]) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
    out.push({ code: iso.toUpperCase(), name, bbox: [minLon, minLat, maxLon, maxLat], polys });
  }
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
 * 좌표의 국가를 오프라인으로 판정한다. 미포함이면 null (호출부가 지오코딩 폴백).
 * 반환 code는 ISO2 대문자 — expo-location의 isoCountryCode와 같은 형식.
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
