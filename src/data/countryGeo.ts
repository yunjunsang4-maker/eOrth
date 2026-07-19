// 국가별 GADM Level-1 지역 데이터 로더 - 26개국.
// 데이터는 국가별 모듈(./geo/*)로 분리되어 있고, 처음 요청될 때만 로드된다(시작 메모리 보호).
// 새 국가 추가: ./geo/{ISO3}.ts 생성 + 아래 LOADERS 한 줄 + homeRegions.ISO2_TO_GEO + MainScreen.REGION_COUNTRIES.
const LOADERS: Record<string, () => any> = {
  ARE: () => require("./geo/ARE").default,
  AUT: () => require("./geo/AUT").default,
  BRA: () => require("./geo/BRA").default,
  CAN: () => require("./geo/CAN").default,
  CHN: () => require("./geo/CHN").default,
  COL: () => require("./geo/COL").default,
  DEU: () => require("./geo/DEU").default,
  EGY: () => require("./geo/EGY").default,
  ESP: () => require("./geo/ESP").default,
  FRA: () => require("./geo/FRA").default,
  GBR: () => require("./geo/GBR").default,
  GRC: () => require("./geo/GRC").default,
  ITA: () => require("./geo/ITA").default,
  JPN: () => require("./geo/JPN").default,
  MAR: () => require("./geo/MAR").default,
  MEX: () => require("./geo/MEX").default,
  MYS: () => require("./geo/MYS").default,
  NLD: () => require("./geo/NLD").default,
  PRT: () => require("./geo/PRT").default,
  SAU: () => require("./geo/SAU").default,
  THA: () => require("./geo/THA").default,
  TUN: () => require("./geo/TUN").default,
  TUR: () => require("./geo/TUR").default,
  USA: () => require("./geo/USA").default,
  VNM: () => require("./geo/VNM").default,
  ZAF: () => require("./geo/ZAF").default,
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
