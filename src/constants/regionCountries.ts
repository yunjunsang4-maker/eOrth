// 대륙 모드 국가 목록 — countryGeo.LOADERS·homeRegions.ISO2_TO_GEO와 항상 일치해야 한다.
// (regionGeoSync.verify.ts가 셋을 교차 검증한다)
export const REGION_COUNTRIES = [
  { code: 'KOR', flag: '🇰🇷', name: '대한민국' }, // 거주국 — 목록 맨 앞 (2026-07-30 추가)
  { code: 'JPN', flag: '🇯🇵', name: '일본' },
  { code: 'CHN', flag: '🇨🇳', name: '중국' },
  { code: 'USA', flag: '🇺🇸', name: '미국' },
  { code: 'DEU', flag: '🇩🇪', name: '독일' },
  { code: 'ESP', flag: '🇪🇸', name: '스페인' },
  { code: 'GBR', flag: '🇬🇧', name: '영국' },
  { code: 'FRA', flag: '🇫🇷', name: '프랑스' },
  { code: 'ITA', flag: '🇮🇹', name: '이탈리아' },
  // 2026-07-20 확장 18개국 (인기 여행국 30위 기반, 사용자 확정)
  { code: 'TUR', flag: '🇹🇷', name: '튀르키예' },
  { code: 'GRC', flag: '🇬🇷', name: '그리스' },
  { code: 'AUT', flag: '🇦🇹', name: '오스트리아' },
  { code: 'PRT', flag: '🇵🇹', name: '포르투갈' },
  { code: 'NLD', flag: '🇳🇱', name: '네덜란드' },
  { code: 'THA', flag: '🇹🇭', name: '태국' },
  { code: 'MYS', flag: '🇲🇾', name: '말레이시아' },
  { code: 'VNM', flag: '🇻🇳', name: '베트남' },
  { code: 'SAU', flag: '🇸🇦', name: '사우디아라비아' },
  { code: 'ARE', flag: '🇦🇪', name: '아랍에미리트' },
  { code: 'MAR', flag: '🇲🇦', name: '모로코' },
  { code: 'EGY', flag: '🇪🇬', name: '이집트' },
  { code: 'TUN', flag: '🇹🇳', name: '튀니지' },
  { code: 'ZAF', flag: '🇿🇦', name: '남아프리카공화국' },
  { code: 'MEX', flag: '🇲🇽', name: '멕시코' },
  { code: 'CAN', flag: '🇨🇦', name: '캐나다' },
  { code: 'BRA', flag: '🇧🇷', name: '브라질' },
  { code: 'COL', flag: '🇨🇴', name: '콜롬비아' },
];
