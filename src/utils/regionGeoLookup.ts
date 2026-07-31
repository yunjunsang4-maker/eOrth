/**
 * 지역 지오 데이터 조회 — 코드로 표시명 찾기, 전체 지역 수 세기.
 *
 * 두 가지 용도로 쓴다.
 *  ① 기록에 한글 지역명(regionName)이 없을 때의 표시 폴백. 예전에는 regionNameEn을
 *     그대로 썼는데, 지역 키 마이그레이션 이후 그 값이 ISO 코드(JP-13)라 목록에
 *     "JP-13"이 노출됐다. 지오에는 코드마다 한글명(NL_NAME_1)이 있으므로 그걸 쓴다.
 *  ② 대륙 모드 진행도("47곳 중 5곳")의 분모.
 *
 * 지오 조회 자체는 순수하지 않지만(모듈 require), 판정 로직은 전부 여기 모아
 * regionGeoLookup.verify.ts가 실제 지오 데이터로 검증한다.
 */
import { getCountryGeo } from '../data/countryGeo';

interface RegionProps {
  CODE?: string;
  NAME_1?: string;   // 영문 지역명
  NL_NAME_1?: string; // 한글 지역명
}

/** 국가(ISO3)의 코드 → 속성 맵. 지오가 없는 국가는 빈 맵 */
function propsByCode(iso3: string): Record<string, RegionProps> {
  const geo = getCountryGeo(iso3);
  const out: Record<string, RegionProps> = {};
  if (!geo?.features) return out;
  for (const f of geo.features) {
    const p = (f?.properties ?? {}) as RegionProps;
    if (p.CODE) out[p.CODE] = p;
  }
  return out;
}

// 국가당 한 번만 만든다 — 지역 목록을 그릴 때마다 47개를 다시 훑을 이유가 없다
const cache: Record<string, Record<string, RegionProps>> = {};
function codeMap(iso3: string): Record<string, RegionProps> {
  if (!cache[iso3]) cache[iso3] = propsByCode(iso3);
  return cache[iso3];
}

/**
 * 지역 코드로 표시명을 찾는다. lang이 'en'이면 영문명, 아니면 한글명.
 * 지오에 없는 코드(수록되지 않은 국가·오래된 코드)면 null — 호출부가 스스로 폴백한다.
 */
export function regionNameByCode(iso3: string, code: string, lang: string): string | null {
  if (!iso3 || !code) return null;
  const p = codeMap(iso3)[code];
  if (!p) return null;
  const name = lang === 'en' ? p.NAME_1 : p.NL_NAME_1;
  return name?.trim() || null;
}

/** 그 국가에 수록된 전체 지역 수. 지오가 없으면 0 (진행도를 숨기는 신호) */
export function totalRegionCount(iso3: string): number {
  if (!iso3) return 0;
  return Object.keys(codeMap(iso3)).length;
}

/**
 * 방문 지역 코드 중 실제 지오에 있는 것만 센다.
 * 지오에 없는 코드까지 세면 "47곳 중 48곳"이 나올 수 있다 — 오래된 기록이나
 * 별칭 표에만 있는 코드가 섞이는 경우다.
 */
export function visitedRegionCount(iso3: string, codes: string[]): number {
  if (!iso3) return 0;
  const m = codeMap(iso3);
  const seen = new Set<string>();
  for (const c of codes) if (c && m[c]) seen.add(c);
  return seen.size;
}
