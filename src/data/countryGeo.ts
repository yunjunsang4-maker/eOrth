// 국가별 지역(admin-1) 데이터 로더.
//
// 데이터는 현재 비어 있다 — 원래 GADM 4.1 Level-1을 썼는데, GADM 라이선스가
// 학술·비영리 이용만 무료이고 재배포·상업적 이용에 사전 허가를 요구해서
// 출시 전에 제거했다(2026-07-28). 상세는 featureFlags.REGION_MAP_ENABLED 주석 참고.
//
// LOADERS를 비워두는 것이 핵심이다: require는 정적 분석 대상이라 한 줄이라도
// 남기면 Metro가 그 데이터를 번들에 그대로 싣는다. UI만 플래그로 가려도
// 데이터는 배포되므로 라이선스 문제가 해결되지 않는다.
//
// 복원(OSM 재구축) 절차: Important2/gadm-backup-2026-07-28/README.txt
// 새 국가 추가: ./geo/{ISO3}.ts 생성 + 아래 LOADERS 한 줄 + homeRegions.ISO2_TO_GEO
//              + MainScreen.REGION_COUNTRIES + featureFlags.REGION_MAP_ENABLED=true
const LOADERS: Record<string, () => any> = {};

const cache: Record<string, any> = {};

/** 국가(ISO3)의 지역 FeatureCollection - 미수록 국가는 undefined */
export function getCountryGeo(code: string): any | undefined {
  if (cache[code]) return cache[code];
  const load = LOADERS[code];
  if (!load) return undefined;
  cache[code] = load();
  return cache[code];
}

/** 지역 데이터가 수록된 국가 코드 목록 */
export const GEO_COUNTRY_CODES = Object.keys(LOADERS);
