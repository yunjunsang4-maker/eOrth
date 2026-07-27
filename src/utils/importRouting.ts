// src/utils/importRouting.ts
// 과거 사진 가져오기에서 스캔된 여행 후보를 어디로 보낼지 판정 (순수).
// 'stay' = 진행 중 체류 카드로 흡수, 'trip' = 별도 여행 카드, 'skip' = 거주국(제외).
// clusterForeignTrips는 거주국을 이미 제외하므로 'skip'은 방어용.
export type ImportTarget = 'stay' | 'trip' | 'skip';

export function classifyImportTarget(
  tripCountryName: string,
  homeCountryName: string | null,
  stayCountryName: string | null,
): ImportTarget {
  const isHome = (n: string) =>
    !!homeCountryName && (n === homeCountryName ||
      (homeCountryName === '대한민국' && n === '한국') ||
      (homeCountryName === '한국' && n === '대한민국'));
  if (stayCountryName && tripCountryName === stayCountryName) return 'stay';
  if (isHome(tripCountryName)) return 'skip';
  return 'trip';
}
