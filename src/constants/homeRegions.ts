// 거주국가(국내) 기록의 지역 선택 프리셋 — 피드 기록에서 국내 기록은 지역 단위로 여행 카드를 구분한다.
// 한국은 시/도 프리셋(koreaRegions), 그 외 국가는 대륙 지도와 동일한 지오 데이터(countryGeo)에서
// 지역 목록을 뽑는다. nameEn(CODE)이 대륙 지도 활성화 키(regionNameEn)와 같아 지도 매칭이 그대로 동작한다.
import { KOREA_REGIONS, normalizeKoreaRegion } from './koreaRegions';
import { getCountryGeo } from '../data/countryGeo';
// resolveRegionCode는 normalizeHomeRegion 안에서 지연 require한다(아래 참고) — 여기서 최상단
// import하지 않는다.

export interface HomeRegion {
  name: string;   // 한글 표시명 (NL_NAME_1)
  // 저장 키 = 지오의 CODE ('JP-14'). 이름과 내용이 어긋나 보이지만, 이 값을 저장하는
  // 호출부(taggedRegions.nameEn·TravelRecord.regionNameEn)가 이미 코드 체계로
  // 마이그레이션돼 있다. 여기서 이름을 바꾸면 오히려 저장 계층과 어긋난다.
  nameEn: string;
  latin: string;  // 영문명 (NAME_1) — GPS 도시명 매칭 전용, 저장하지 않는다
}

// 거주국가 코드(ISO2, settingsStore.homeCountryCode) → countryGeo 키(ISO3)
// KR도 대륙 지도용으로 수록(2026-07-30). 단 거주 지역 칩은 getHomeRegions의 KR 분기가
// 이 표보다 먼저 koreaRegions 프리셋을 반환하므로 국내 기록 어휘('Seoul' 등)는 변하지 않는다.
export const ISO2_TO_GEO: Record<string, string> = {
  KR: 'KOR',
  JP: 'JPN', CN: 'CHN', US: 'USA', DE: 'DEU',
  ES: 'ESP', GB: 'GBR', FR: 'FRA', IT: 'ITA',
  // 2026-07-20 확장 18개국
  TR: 'TUR', GR: 'GRC', AT: 'AUT', PT: 'PRT', NL: 'NLD',
  TH: 'THA', MY: 'MYS', VN: 'VNM', SA: 'SAU', AE: 'ARE',
  MA: 'MAR', EG: 'EGY', TN: 'TUN', ZA: 'ZAF',
  MX: 'MEX', CA: 'CAN', BR: 'BRA', CO: 'COL',
};

// 발음 구별 기호 제거(Ōsaka→Osaka) — GPS 도시명과 GADM 영문명 표기차 흡수
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// GPS 도시명 → 상위 주(광역) 매핑. 지오 데이터에는 도시 피처가 없어 지도 판정용이 아니라,
// normalizeHomeRegion에서 GPS가 준 도시명(예: Yokohama)을 상위 지역(Kanagawa)으로 올려붙이는 데만 쓴다.
// 값은 GADM 시절 주 영문명 표기라 CODE가 아니라 latin(NAME_1)과 대조해야 한다.
// USA.washingtondc는 예외적으로 인접 주(Maryland)가 아니라 'WashingtonD.C.'다 —
// 지오 데이터에 US-DC 피처가 따로 있는데 메릴랜드로 승격되던 문제. 별칭 표의
// 'USA|washingtondc' → US-DC 항목(생성기 MANUAL에 명시)으로 해석된다.
export const CITY_TO_PROV: Record<string, Record<string, string>> = {
  JPN: { tokyocity: 'Tokyo', osakacity: 'Osaka', kyotocity: 'Kyoto', fukuokacity: 'Fukuoka', sapporo: 'Hokkaido', naha: 'Okinawa', yokohama: 'Kanagawa', kobe: 'Hyōgo', nagoya: 'Aichi', hiroshimacity: 'Hiroshima', sendai: 'Miyagi' },
  CHN: { guangzhou: 'Guangdong', shenzhen: 'Guangdong', chengdu: 'Sichuan', hangzhou: 'Zhejiang', xian: 'Shaanxi', wuhan: 'Hubei', qingdao: 'Shandong', nanjing: 'Jiangsu' },
  USA: { losangeles: 'California', sanfrancisco: 'California', lasvegas: 'Nevada', miami: 'Florida', chicago: 'Illinois', seattle: 'Washington', honolulu: 'Hawaii', newyorkcity: 'NewYork', boston: 'Massachusetts', washingtondc: 'WashingtonD.C.', houston: 'Texas', denver: 'Colorado', philadelphia: 'Pennsylvania', atlanta: 'Georgia' },
  DEU: { munich: 'Bayern', frankfurt: 'Hessen', stuttgart: 'Baden-Württemberg', cologne: 'Nordrhein-Westfalen', nordlingen: 'Bayern', dresden: 'Sachsen', dusseldorf: 'Nordrhein-Westfalen', hannover: 'Niedersachsen' },
  ESP: { granada: 'Andalucía', malaga: 'Andalucía', sevilla: 'Andalucía', barcelona: 'Cataluña', madrid: 'ComunidaddeMadrid', valencia: 'ComunidadValenciana', bilbao: 'PaísVasco' },
  GBR: { london: 'England', birmingham: 'England', manchester: 'England', liverpool: 'England', leeds: 'England', edinburgh: 'Scotland', glasgow: 'Scotland', cardiff: 'Wales', belfast: 'NorthernIreland', oxford: 'England', bristol: 'England' },
  FRA: { paris: 'Île-de-France', nice: "Provence-Alpes-Côted'Azur", lyon: 'Auvergne-Rhône-Alpes', marseille: "Provence-Alpes-Côted'Azur", bordeaux: 'Nouvelle-Aquitaine', strasbourg: 'GrandEst', toulouse: 'Occitanie', lille: 'Hauts-de-France', nantes: 'PaysdelaLoire', montpellier: 'Occitanie', cannes: "Provence-Alpes-Côted'Azur" },
  ITA: { rome: 'Lazio', milan: 'Lombardia', florence: 'Toscana', venice: 'Veneto', naples: 'Campania', verona: 'Veneto', pisa: 'Toscana', turin: 'Piemonte', bologna: 'Emilia-Romagna', genoa: 'Liguria', palermo: 'Sicily', bari: 'Apulia' },
  TUR: { cappadocia: 'Nevsehir', pamukkale: 'Denizli', fethiye: 'Mugla' },
  // zakynthos는 구 광역명이 아니라 'Zakynthos'로 — 자킨토스는 이오니아 제도(GR-F)다.
  // 구 광역명('Peloponnese,WesternGreeceand')을 두면 별칭 표가 GR-J(펠로폰네소스)로 해석해
  // GPS 거주지역이 엉뚱하게 잡힌다(지도 검색 표 CountryMapView와 동일하게 맞춤).
  GRC: { athens: 'Attica', santorini: 'Aegean', thira: 'Aegean', mykonos: 'Aegean', meteora: 'ThessalyandCentralGreece', kalambaka: 'ThessalyandCentralGreece', zakynthos: 'Zakynthos' },
  AUT: { salzburgcity: 'Salzburg', hallstatt: 'Oberösterreich', innsbruck: 'Tirol', vienna: 'Wien' },
  PRT: { lisboncity: 'Lisboa', lisbon: 'Lisboa', portocity: 'Porto', sintra: 'Lisboa', lagos: 'Faro', cabodaroca: 'Lisboa', colares: 'Lisboa' },
  NLD: { amsterdam: 'Noord-Holland', rotterdam: 'Zuid-Holland', zaanseschans: 'Noord-Holland', zaanstad: 'Noord-Holland', thehague: 'Zuid-Holland', denhaag: 'Zuid-Holland', sgravenhage: 'Zuid-Holland' },
  THA: { pattaya: 'ChonBuri', banglamung: 'ChonBuri' },
  MYS: { kotakinabalu: 'Sabah', johorbahru: 'Johor', johorbaharu: 'Johor', langkawi: 'Kedah' },
  VNM: { nhatrang: 'KhánhHòa', hoian: 'QuảngNam', halong: 'QuảngNinh', halongbay: 'QuảngNinh', phuquoc: 'KiênGiang' },
  SAU: { riyadh: 'ArRiyad', jeddah: 'Makkah', jiddah: 'Makkah', mecca: 'Makkah', medina: 'AlMadinah', alula: 'AlMadinah' },
  MAR: { marrakech: 'Marrakech-Tensift-AlHaouz', marrakesh: 'Marrakech-Tensift-AlHaouz', casablanca: 'GrandCasablanca', fes: 'Fès-Boulemane', fez: 'Fès-Boulemane', chefchaouen: 'Tanger-Tétouan' },
  EGY: { giza: 'AlJizah', luxor: 'AlUqsur', aswancity: 'Aswan', hurghada: 'AlBahralAhmar', alghurdaqah: 'AlBahralAhmar' },
  TUN: { carthage: 'Tunis', sidibousaid: 'Tunis', eljem: 'Mahdia', tozeurcity: 'Tozeur' },
  ZAF: { capetown: 'WesternCape', johannesburg: 'Gauteng', pretoria: 'Gauteng', tshwane: 'Gauteng' },
  MEX: { cancun: 'QuintanaRoo', benitojuarez: 'QuintanaRoo', playadelcarmen: 'QuintanaRoo', solidaridad: 'QuintanaRoo', tulum: 'QuintanaRoo', guadalajara: 'Jalisco', oaxacacity: 'Oaxaca', oaxacadejuarez: 'Oaxaca', guanajuatocity: 'Guanajuato' },
  CAN: { vancouver: 'BritishColumbia', greatervancouver: 'BritishColumbia', toronto: 'Ontario', montreal: 'Québec', niagarafalls: 'Ontario', quebeccity: 'Québec' },
  BRA: { riodejaneirocity: 'RiodeJaneiro', saopaulocity: 'SãoPaulo', salvador: 'Bahia', manaus: 'Amazonas', fozdoiguacu: 'Paraná', iguazufalls: 'Paraná' },
  COL: { medellin: 'Antioquia', cartagena: 'Bolívar', cartagenadeindias: 'Bolívar', cali: 'ValledelCauca', santiagodecali: 'ValledelCauca', salento: 'Quindío' },
};

/** 대륙 지도 국가(ISO3)의 선택 가능한 지역 목록. nameEn은 지도 매칭 키(CODE)와 동일. */
export function getCountryRegionOptions(geoKey: string): HomeRegion[] {
  const features: any[] = getCountryGeo(geoKey)?.features ?? [];
  const seen = new Set<string>();
  const out: HomeRegion[] = [];
  for (const f of features) {
    const p = f?.properties ?? {};
    if (!p.CODE || seen.has(p.CODE)) continue;
    seen.add(p.CODE);
    out.push({ name: p.NL_NAME_1 || p.NAME_1, nameEn: p.CODE, latin: p.NAME_1 || '' });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return out;
}

// countryGeo 파싱 결과 캐시 — 국가당 1회만 추출
const regionCache: Record<string, HomeRegion[]> = {};

/**
 * 거주국가의 지역 프리셋. 한국은 시/도, countryGeo 수록 8개국은 주/현 목록.
 * 지역 데이터가 없는 국가는 빈 배열 — 호출부는 칩을 숨기고 기존(자유 문자열) 동작을 유지한다.
 */
export function getHomeRegions(countryCode?: string | null): HomeRegion[] {
  const cc = (countryCode || '').toUpperCase();
  if (!cc) return [];
  if (cc === 'KR') return KOREA_REGIONS.map(r => ({ name: r.name, nameEn: r.nameEn, latin: r.nameEn }));

  const geoKey = ISO2_TO_GEO[cc];
  if (!geoKey) return [];
  if (regionCache[geoKey]) return regionCache[geoKey];

  const features: any[] = getCountryGeo(geoKey)?.features ?? [];
  const seen = new Set<string>();
  const regions: HomeRegion[] = [];
  for (const f of features) {
    const p = f?.properties ?? {};
    if (!p.CODE || seen.has(p.CODE)) continue; // 한 지역이 여러 피처로 쪼개진 경우 중복 제거
    seen.add(p.CODE);
    regions.push({ name: p.NL_NAME_1 || p.NAME_1, nameEn: p.CODE, latin: p.NAME_1 || '' });
  }
  regions.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  regionCache[geoKey] = regions;
  return regions;
}


/**
 * GPS 도시명 등 자유 문자열을 거주국가 지역 프리셋으로 정규화 (수원시→경기, Kyoto→교토부).
 * 매칭 실패 시 null — 호출부는 원본을 그대로 쓰거나 미지정 처리.
 */
export function normalizeHomeRegion(countryCode?: string | null, raw?: string | null): HomeRegion | null {
  if (!raw) return null;
  const cc = (countryCode || '').toUpperCase();
  if (cc === 'KR') {
    const kr = normalizeKoreaRegion(raw);
    return kr ? { name: kr.name, nameEn: kr.nameEn, latin: kr.nameEn } : null;
  }
  const regions = getHomeRegions(cc);
  if (regions.length === 0) return null;
  const q = fold(raw).replace(/[\s\-'’.]/g, '');
  // 1) 도시 → 상위 주 매핑 우선 (Yokohama→Kanagawa 등, 지도와 동일 규칙)
  //    CITY_TO_PROV 값은 GADM 시절 주 이름이라 새 지오 데이터의 latin(NAME_1, 예: 'Kanagawa
  //    Prefecture')과 표기가 어긋날 수 있다(독일 'Bayern'↔'Bavaria'처럼 언어 자체가 달라
  //    부분 문자열로도 못 잇는 경우가 있다). 그래서 이름끼리 대조하지 않고, 정확히 이 표기차를
  //    흡수하도록 만들어진 별칭 표(regionKeyAliases, GADM 이름→코드)를 거쳐 코드로 건너간 뒤
  //    코드(nameEn)로 정확히 매칭한다.
  const geoKey = ISO2_TO_GEO[cc];
  const viaCity = geoKey ? CITY_TO_PROV[geoKey]?.[q] : undefined;
  if (viaCity && geoKey) {
    // 지연 require — scripts/build-region-aliases.ts(별칭 표 생성기)는 CITY_TO_PROV를 얻으려고
    // 이 파일을 import한다. 여기서 최상단 import로 regionKeyMigration(→ 생성기의 산출물인
    // regionKeyAliases.ts)을 끌어오면, 산출물이 없거나 깨진 상태(정확히 생성기가 복구해야 하는
    // 그 상황)에서 생성기 자신이 모듈 로드 단계부터 죽어 실행조차 못 하게 된다. require를
    // 함수 실행 시점까지 미뤄 CITY_TO_PROV의 가용성과 regionKeyAliases.ts의 유효성을 분리한다.
    const { resolveRegionCode } = require('../utils/regionKeyMigration') as typeof import('../utils/regionKeyMigration');
    const code = resolveRegionCode(geoKey, viaCity);
    const viaMatch = code ? regions.find(r => r.nameEn === code) : undefined;
    if (viaMatch) return viaMatch;
  }
  return (
    // 2) 도시명에 지역명이 포함되거나(예: "Kyoto City") 그 반대(예: "Berlin")인 경우 모두 허용
    regions.find(r => {
      const en = fold(r.latin).replace(/[\s\-'’.]/g, '');
      return !!en && (q.includes(en) || en.includes(q) || raw.includes(r.name));
    }) ?? null
  );
}