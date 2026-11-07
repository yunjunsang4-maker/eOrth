// ─── 나라(ISO2 대문자) → 대표 IANA 시간대 (null = 여러 시간대 나라 → 기기 시간대) ───
// 사진첩(앨범)의 날짜 줄·하루 보기를 '여행지 날짜'로 나누는 데 쓴다(utils/albumTimeZone albumTimeZoneOf).
// constants/countries.ts COUNTRIES(2026-11-07 기준 198개)가 전부 키로 들어 있다 — 값이 문자열이면 대표 시간대, null이면 아래
// 다중 시간대 목록. albumTimeZone.verify.ts가 누락 0을 검사한다(나라를 추가하면 여기도).
//
// null 기준(2026-11-07 QA·오케스트레이터 결정): 대표 시간대에서 2시간 이상 벗어나는 주요 여행지가 있는 나라는 대표를 두지 않는다.
// 대표를 잘못 고르면 기기 시간대(한국)보다 더 나빠진다 — 예: 🇺🇸 대표를 뉴욕으로 두면 괌·사이판 사진첩은 하루 24시간 중
// 14~15시간대가 전날로 갔다(기기 KST면 1시간대). null이면 albumTimeZoneOf가 undefined → 예전처럼 기기 시간대.
//   US 괌·사이판 +14~15h·하와이 −5~6h·LA −3h(뉴욕 기준) · CA 밴쿠버 −3h · RU 블라디보스토크 +7h · AU 퍼스 −2~3h
//   MX 로스카보스 −2h·티후아나 −3h(칸쿤 기준) · CL 이스터섬 −2h · KI 키리티마티 +2h(타라와 기준)
//   BR·ID·KZ: 주요 여행지는 대표에서 1~2시간 안쪽이지만(BR 마나우스 −1h, ID 자카르타·파푸아 ±1h, KZ 옛 tzdata 1h)
//     오케스트레이터 최소 목록이라 함께 null.
// 1시간 이하라 대표를 유지한 나라: ES 카나리아 −1h · PT 아조레스 −1h · EC 갈라파고스 −1h · MN 호브드 −1h · CD 루붐바시 +1h
//   PG 부건빌 +1h · FM 추크 −1h · NZ 채텀 +0:45.
// 해외 영토(FR 타히티·누벨칼레도니, NL 보네르, DK 그린란드, GB 케이맨 등)는 국기가 따로 있는 별개 여행지로 보고 본토 대표를 유지했다
//   — 🇫🇷로 누벨칼레도니 사진첩을 만들면 파리 기준이라 어긋난다(판단 필요 사항으로 보고함).
// ponytail: 다중 시간대 나라는 기기 시간대(예전 동작)라 원래 증상이 남는다. 업그레이드 경로는 사진 위치로 정하기 —
//   iOS 역지오코딩 시간대(utils/albumPlaceLookup placeOfAsset의 tz, 하루 보기가 이미 순간마다 구한다)의 앨범 내 다수결,
//   또는 사진 좌표 → 시간대 표(안드로이드는 역지오코딩에 tz가 없다). 앨범에 결정된 tz를 저장하면 기기·플랫폼 간 일치.
// id는 오래된 기기 ICU에도 있는 이름을 쓴다(예: Europe/Kyiv 대신 Europe/Kiev, Pacific/Kanton 대신 Pacific/Tarawa) —
// 모르는 id는 Intl이 RangeError를 던져 기기 시간대로 폴백할 뿐이지만, 그러면 고친 의미가 없다.
export const COUNTRY_TIME_ZONES: Record<string, string | null> = {
  // 아시아
  KR: 'Asia/Seoul', JP: 'Asia/Tokyo', CN: 'Asia/Shanghai', TW: 'Asia/Taipei', HK: 'Asia/Hong_Kong', MO: 'Asia/Macau',
  TH: 'Asia/Bangkok', VN: 'Asia/Ho_Chi_Minh', PH: 'Asia/Manila', ID: null, MY: 'Asia/Kuala_Lumpur',
  SG: 'Asia/Singapore', KH: 'Asia/Phnom_Penh', LA: 'Asia/Vientiane', MM: 'Asia/Yangon', BN: 'Asia/Brunei', TL: 'Asia/Dili',
  IN: 'Asia/Kolkata', LK: 'Asia/Colombo', NP: 'Asia/Kathmandu', BT: 'Asia/Thimphu', PK: 'Asia/Karachi', BD: 'Asia/Dhaka',
  MV: 'Indian/Maldives', MN: 'Asia/Ulaanbaatar', KZ: null, UZ: 'Asia/Tashkent', TM: 'Asia/Ashgabat',
  TJ: 'Asia/Dushanbe', KG: 'Asia/Bishkek', AF: 'Asia/Kabul', IR: 'Asia/Tehran', IQ: 'Asia/Baghdad', SA: 'Asia/Riyadh',
  AE: 'Asia/Dubai', KW: 'Asia/Kuwait', BH: 'Asia/Bahrain', QA: 'Asia/Qatar', OM: 'Asia/Muscat', YE: 'Asia/Aden',
  JO: 'Asia/Amman', IL: 'Asia/Jerusalem', PS: 'Asia/Hebron', LB: 'Asia/Beirut', SY: 'Asia/Damascus', TR: 'Europe/Istanbul',
  CY: 'Asia/Nicosia', AM: 'Asia/Yerevan', AZ: 'Asia/Baku', GE: 'Asia/Tbilisi',
  // 유럽
  GB: 'Europe/London', FR: 'Europe/Paris', DE: 'Europe/Berlin', IT: 'Europe/Rome', ES: 'Europe/Madrid', PT: 'Europe/Lisbon',
  NL: 'Europe/Amsterdam', BE: 'Europe/Brussels', CH: 'Europe/Zurich', AT: 'Europe/Vienna', SE: 'Europe/Stockholm',
  NO: 'Europe/Oslo', DK: 'Europe/Copenhagen', FI: 'Europe/Helsinki', IS: 'Atlantic/Reykjavik', IE: 'Europe/Dublin',
  PL: 'Europe/Warsaw', CZ: 'Europe/Prague', SK: 'Europe/Bratislava', HU: 'Europe/Budapest', RO: 'Europe/Bucharest',
  BG: 'Europe/Sofia', GR: 'Europe/Athens', HR: 'Europe/Zagreb', SI: 'Europe/Ljubljana', RS: 'Europe/Belgrade',
  BA: 'Europe/Sarajevo', ME: 'Europe/Podgorica', MK: 'Europe/Skopje', AL: 'Europe/Tirane',
  XK: 'Europe/Belgrade', // 코소보 — 자체 IANA id가 없고 베오그라드와 같은 CET
  RU: null, UA: 'Europe/Kiev', BY: 'Europe/Minsk', MD: 'Europe/Chisinau', EE: 'Europe/Tallinn',
  LV: 'Europe/Riga', LT: 'Europe/Vilnius', LU: 'Europe/Luxembourg', MC: 'Europe/Monaco', AD: 'Europe/Andorra',
  LI: 'Europe/Vaduz', SM: 'Europe/San_Marino', VA: 'Europe/Vatican', MT: 'Europe/Malta',
  // 북아메리카
  US: null, CA: null, MX: null, GT: 'America/Guatemala', BZ: 'America/Belize',
  HN: 'America/Tegucigalpa', SV: 'America/El_Salvador', NI: 'America/Managua', CR: 'America/Costa_Rica',
  PA: 'America/Panama', CU: 'America/Havana', JM: 'America/Jamaica', HT: 'America/Port-au-Prince',
  DO: 'America/Santo_Domingo', TT: 'America/Port_of_Spain', BS: 'America/Nassau', BB: 'America/Barbados',
  GD: 'America/Grenada', LC: 'America/St_Lucia', VC: 'America/St_Vincent', AG: 'America/Antigua',
  KN: 'America/St_Kitts', DM: 'America/Dominica',
  // 남아메리카
  BR: null, AR: 'America/Argentina/Buenos_Aires', CL: null, CO: 'America/Bogota',
  PE: 'America/Lima', EC: 'America/Guayaquil', BO: 'America/La_Paz', PY: 'America/Asuncion', UY: 'America/Montevideo',
  VE: 'America/Caracas', GY: 'America/Guyana', SR: 'America/Paramaribo',
  // 아프리카
  EG: 'Africa/Cairo', MA: 'Africa/Casablanca', TN: 'Africa/Tunis', DZ: 'Africa/Algiers', LY: 'Africa/Tripoli',
  SD: 'Africa/Khartoum', SS: 'Africa/Juba', ET: 'Africa/Addis_Ababa', ER: 'Africa/Asmara', DJ: 'Africa/Djibouti',
  SO: 'Africa/Mogadishu', KE: 'Africa/Nairobi', TZ: 'Africa/Dar_es_Salaam', UG: 'Africa/Kampala', RW: 'Africa/Kigali',
  BI: 'Africa/Bujumbura', ZA: 'Africa/Johannesburg', NG: 'Africa/Lagos', GH: 'Africa/Accra', SN: 'Africa/Dakar',
  CI: 'Africa/Abidjan', CM: 'Africa/Douala', AO: 'Africa/Luanda', MZ: 'Africa/Maputo', ZW: 'Africa/Harare',
  ZM: 'Africa/Lusaka', MW: 'Africa/Blantyre', MG: 'Indian/Antananarivo', MU: 'Indian/Mauritius', SC: 'Indian/Mahe',
  KM: 'Indian/Comoro', CF: 'Africa/Bangui', CG: 'Africa/Brazzaville', CD: 'Africa/Kinshasa', GA: 'Africa/Libreville',
  GQ: 'Africa/Malabo', ST: 'Africa/Sao_Tome', CV: 'Atlantic/Cape_Verde', GW: 'Africa/Bissau', GN: 'Africa/Conakry',
  SL: 'Africa/Freetown', LR: 'Africa/Monrovia', TG: 'Africa/Lome', BJ: 'Africa/Porto-Novo', BF: 'Africa/Ouagadougou',
  ML: 'Africa/Bamako', NE: 'Africa/Niamey', TD: 'Africa/Ndjamena', MR: 'Africa/Nouakchott', GM: 'Africa/Banjul',
  NA: 'Africa/Windhoek', BW: 'Africa/Gaborone', LS: 'Africa/Maseru', SZ: 'Africa/Mbabane',
  // 오세아니아
  AU: null, NZ: 'Pacific/Auckland', PG: 'Pacific/Port_Moresby', FJ: 'Pacific/Fiji',
  SB: 'Pacific/Guadalcanal', VU: 'Pacific/Efate', WS: 'Pacific/Apia', TO: 'Pacific/Tongatapu', FM: 'Pacific/Pohnpei',
  PW: 'Pacific/Palau', MH: 'Pacific/Majuro', KI: null, TV: 'Pacific/Funafuti', NR: 'Pacific/Nauru',
};
