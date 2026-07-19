// 거주국가(국내) 기록의 지역 선택 프리셋 — 피드 기록에서 국내 기록은 지역 단위로 여행 카드를 구분한다.
// 한국은 시/도 프리셋(koreaRegions), 그 외 국가는 대륙 지도와 동일한 GADM Level-1 데이터(countryGeo)에서
// 지역 목록을 뽑는다. nameEn(NAME_1)이 대륙 지도 활성화 키(regionNameEn)와 같아 지도 매칭이 그대로 동작한다.
import { KOREA_REGIONS, normalizeKoreaRegion } from './koreaRegions';
import { getCountryGeo } from '../data/countryGeo';

export interface HomeRegion {
  name: string;   // 표시·저장용 한글 표기 (예: '교토부', '캘리포니아')
  nameEn: string; // 대륙 지도 매칭 키 (GADM NAME_1, 예: 'Kyoto', 'California')
}

// 거주국가 코드(ISO2, settingsStore.homeCountryCode) → countryGeo 키(ISO3)
const ISO2_TO_GEO: Record<string, string> = {
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

// countryGeo에는 주(admin-1) 외에 인기명소 '도시' 피처가 섞여 있다(구분 속성 없음).
// CountryMapView의 CITY_TO_PROV(도시→상위 주)와 동일 규칙으로 도시 피처를 지역 목록에서 제외한다
// — 정규화한 NAME_1이 아래 매핑에서 자기 자신이 아닌 주로 매핑되면 도시.
const CITY_TO_PROV: Record<string, Record<string, string>> = {
  JPN: { tokyocity: 'Tokyo', osakacity: 'Osaka', kyotocity: 'Kyoto', fukuokacity: 'Fukuoka', sapporo: 'Hokkaido', naha: 'Okinawa', yokohama: 'Kanagawa', kobe: 'Hyōgo', nagoya: 'Aichi', hiroshimacity: 'Hiroshima', sendai: 'Miyagi' },
  CHN: { guangzhou: 'Guangdong', shenzhen: 'Guangdong', chengdu: 'Sichuan', hangzhou: 'Zhejiang', xian: 'Shaanxi', wuhan: 'Hubei', qingdao: 'Shandong', nanjing: 'Jiangsu' },
  USA: { losangeles: 'California', sanfrancisco: 'California', lasvegas: 'Nevada', miami: 'Florida', chicago: 'Illinois', seattle: 'Washington', honolulu: 'Hawaii', newyorkcity: 'NewYork', boston: 'Massachusetts', washingtondc: 'Maryland', houston: 'Texas', denver: 'Colorado', philadelphia: 'Pennsylvania', atlanta: 'Georgia' },
  DEU: { munich: 'Bayern', frankfurt: 'Hessen', stuttgart: 'Baden-Württemberg', cologne: 'Nordrhein-Westfalen', nordlingen: 'Bayern', dresden: 'Sachsen', dusseldorf: 'Nordrhein-Westfalen', hannover: 'Niedersachsen' },
  ESP: { granada: 'Andalucía', malaga: 'Andalucía', sevilla: 'Andalucía', barcelona: 'Cataluña', madrid: 'ComunidaddeMadrid', valencia: 'ComunidadValenciana', bilbao: 'PaísVasco' },
  GBR: { london: 'England', birmingham: 'England', manchester: 'England', liverpool: 'England', leeds: 'England', edinburgh: 'Scotland', glasgow: 'Scotland', cardiff: 'Wales', belfast: 'NorthernIreland', oxford: 'England', bristol: 'England' },
  FRA: { paris: 'Île-de-France', nice: "Provence-Alpes-Côted'Azur", lyon: 'Auvergne-Rhône-Alpes', marseille: "Provence-Alpes-Côted'Azur", bordeaux: 'Nouvelle-Aquitaine', strasbourg: 'GrandEst', toulouse: 'Occitanie', lille: 'Hauts-de-France', nantes: 'PaysdelaLoire', montpellier: 'Occitanie', cannes: "Provence-Alpes-Côted'Azur" },
  ITA: { rome: 'Lazio', milan: 'Lombardia', florence: 'Toscana', venice: 'Veneto', naples: 'Campania', verona: 'Veneto', pisa: 'Toscana', turin: 'Piemonte', bologna: 'Emilia-Romagna', genoa: 'Liguria', palermo: 'Sicily', bari: 'Apulia' },
  TUR: { cappadocia: 'Nevsehir', pamukkale: 'Denizli', fethiye: 'Mugla' },
  GRC: { athens: 'Attica', santorini: 'Aegean', thira: 'Aegean', mykonos: 'Aegean', meteora: 'ThessalyandCentralGreece', kalambaka: 'ThessalyandCentralGreece', zakynthos: 'Peloponnese,WesternGreeceand' },
  AUT: { salzburgcity: 'Salzburg', hallstatt: 'Oberösterreich', innsbruck: 'Tirol', vienna: 'Wien' },
  PRT: { lisboncity: 'Lisboa', lisbon: 'Lisboa', portocity: 'Porto', sintra: 'Lisboa', lagos: 'Faro', cabodaroca: 'Lisboa', colares: 'Lisboa' },
  NLD: { amsterdam: 'Noord-Holland', rotterdam: 'Zuid-Holland', zaanseschans: 'Noord-Holland', zaanstad: 'Noord-Holland', thehague: 'Zuid-Holland', denhaag: 'Zuid-Holland', sgravenhage: 'Zuid-Holland' },
  THA: { pattaya: 'ChonBuri', banglamung: 'ChonBuri' },
  MYS: { kotakinabalu: 'Sabah', johorbahru: 'Johor', johorbaharu: 'Johor', langkawi: 'Kedah' },
};

const isCityFeature = (geoKey: string, nameEn: string): boolean => {
  const prov = CITY_TO_PROV[geoKey]?.[fold(nameEn).replace(/[\s\-'’.]/g, '')];
  return !!prov && prov !== nameEn;
};

// countryGeo 파싱 결과 캐시 — 국가당 1회만 추출
const regionCache: Record<string, HomeRegion[]> = {};

/**
 * 거주국가의 지역 프리셋. 한국은 시/도, countryGeo 수록 8개국은 주/현 목록.
 * 지역 데이터가 없는 국가는 빈 배열 — 호출부는 칩을 숨기고 기존(자유 문자열) 동작을 유지한다.
 */
export function getHomeRegions(countryCode?: string | null): HomeRegion[] {
  const cc = (countryCode || '').toUpperCase();
  if (!cc) return [];
  if (cc === 'KR') return KOREA_REGIONS.map(r => ({ name: r.name, nameEn: r.nameEn }));

  const geoKey = ISO2_TO_GEO[cc];
  if (!geoKey) return [];
  if (regionCache[geoKey]) return regionCache[geoKey];

  const features: any[] = getCountryGeo(geoKey)?.features ?? [];
  const seen = new Set<string>();
  const regions: HomeRegion[] = [];
  for (const f of features) {
    const nameEn = f?.properties?.NAME_1;
    if (!nameEn || seen.has(nameEn)) continue; // 한 지역이 여러 피처로 쪼개진 경우 중복 제거
    seen.add(nameEn);
    if (isCityFeature(geoKey, nameEn)) continue; // 인기명소 도시 피처는 지역 선택에서 제외
    regions.push({ name: f?.properties?.NL_NAME_1 || nameEn, nameEn });
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
    return kr ? { name: kr.name, nameEn: kr.nameEn } : null;
  }
  const regions = getHomeRegions(cc);
  if (regions.length === 0) return null;
  const q = fold(raw).replace(/[\s\-'’.]/g, '');
  // 1) 도시 → 상위 주 매핑 우선 (Yokohama→Kanagawa 등, 지도와 동일 규칙)
  const geoKey = ISO2_TO_GEO[cc];
  const viaCity = geoKey ? CITY_TO_PROV[geoKey]?.[q] : undefined;
  if (viaCity) return regions.find(r => r.nameEn === viaCity) ?? null;
  return (
    // 2) 도시명에 지역명이 포함되거나(예: "Kyoto City") 그 반대(예: "Berlin")인 경우 모두 허용
    regions.find(r => {
      const en = fold(r.nameEn).replace(/[\s\-'’.]/g, '');
      return q.includes(en) || en.includes(q) || raw.includes(r.name);
    }) ?? null
  );
}