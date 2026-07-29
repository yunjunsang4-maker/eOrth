// 국가별 지역(admin-1) 데이터 로더.
//
// 원래 GADM 4.1 Level-1을 썼는데, GADM 라이선스가 학술·비영리 이용만 무료이고
// 재배포·상업적 이용에 사전 허가를 요구해서 출시 전에 제거했었다(2026-07-28).
// 2026-07-29 Natural Earth 10m admin-1(퍼블릭 도메인)로 재구축해 복원했다 —
// 생성 절차는 scripts/build-region-geo.md, 코드 산출 규칙은 scripts/lib/neRegionCode.ts.
//
// 새 국가 추가: scripts/lib/neRegionCode.ts의 ISO3 + 아래 LOADERS 한 줄 +
//              homeRegions.ISO2_TO_GEO + constants/regionCountries.ts를 함께 고친다.
//              (src/data/regionGeoSync.verify.ts가 넷의 어긋남을 잡아준다)
const LOADERS: Record<string, () => any> = {
  ARE: () => require('./geo/ARE').default,
  AUT: () => require('./geo/AUT').default,
  BRA: () => require('./geo/BRA').default,
  CAN: () => require('./geo/CAN').default,
  CHN: () => require('./geo/CHN').default,
  COL: () => require('./geo/COL').default,
  DEU: () => require('./geo/DEU').default,
  EGY: () => require('./geo/EGY').default,
  ESP: () => require('./geo/ESP').default,
  FRA: () => require('./geo/FRA').default,
  GBR: () => require('./geo/GBR').default,
  GRC: () => require('./geo/GRC').default,
  ITA: () => require('./geo/ITA').default,
  JPN: () => require('./geo/JPN').default,
  MAR: () => require('./geo/MAR').default,
  MEX: () => require('./geo/MEX').default,
  MYS: () => require('./geo/MYS').default,
  NLD: () => require('./geo/NLD').default,
  PRT: () => require('./geo/PRT').default,
  SAU: () => require('./geo/SAU').default,
  THA: () => require('./geo/THA').default,
  TUN: () => require('./geo/TUN').default,
  TUR: () => require('./geo/TUR').default,
  USA: () => require('./geo/USA').default,
  VNM: () => require('./geo/VNM').default,
  ZAF: () => require('./geo/ZAF').default,
};

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
