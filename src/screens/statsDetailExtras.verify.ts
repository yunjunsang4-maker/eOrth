import {
  recentTrips, revisitedCountryCount, mostRecentCountry, thisYearVisitCount,
  activeYearAverage, mostVisitedContinent, unvisitedContinents, highestRatedTrip,
  mostRecentRatedTrip, countryVisitCounts, TripRecord,
} from './statsDetailExtras';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}

const recs: TripRecord[] = [
  { countries: [{ name: '일본' }], regionName: '후쿠오카', startDate: '2025.08.10', endDate: '2025.08.13', timestamp: 300, rating: 5 },
  { countries: [{ name: '일본' }], regionName: '도쿄', startDate: '2024.05.01', endDate: '2024.05.05', timestamp: 200, rating: 3 },
  { countryName: '대만', regionName: '타이베이', startDate: '2026.07.12', endDate: '2026.07.23', timestamp: 400, rating: 4 },
  { countryName: '프랑스', regionName: '파리', date: '2023.03.02', timestamp: 100 },
];

const rt = recentTrips(recs, 3);
assert(rt[0].country === '대만', 'recentTrips 최신순 첫 항목=대만');
assert(rt[0].period === '26.07.12-23', 'recentTrips 기간 압축=26.07.12-23');
assert(rt[0].records === 1, '카드당 기록수: 묶음 없는 기록=1');
assert(rt.length === 3, 'recentTrips limit 적용');

// 개별 여행카드(사진첩 1개씩, 묶음 없음) → 각 카드 1
const sepCards: TripRecord[] = [
  { countryName: '일본', timestamp: 1, viewType: 'album' },
  { countryName: '일본', timestamp: 2, viewType: 'album' },
  { countryName: '일본', timestamp: 3, viewType: 'album' },
];
assert(recentTrips(sepCards, 5)[0].records === 1, '카드당 기록수: 개별 사진첩 카드=1');

// 한 여행카드(같은 tripGroupId)에 feed+snap+blog → 스냅 제외 2
const oneCard: TripRecord[] = [
  { tripGroupId: 'g1', countryName: '일본', timestamp: 1, viewType: 'feed' },
  { tripGroupId: 'g1', countryName: '일본', timestamp: 2, viewType: 'snap' },
  { tripGroupId: 'g1', countryName: '일본', timestamp: 3, viewType: 'blog' },
];
assert(recentTrips(oneCard, 5)[0].records === 2, '카드당 기록수: 한 카드 feed+blog(스냅제외)=2');

assert(countryVisitCounts(recs)['일본'] === 2, 'countryVisitCounts 일본=2');
assert(revisitedCountryCount(recs) === 1, 'revisitedCountryCount=1(일본)');
assert(mostRecentCountry(recs) === '대만', 'mostRecentCountry=대만');

assert(thisYearVisitCount(recs, 2026) === 1, 'thisYearVisitCount(2026)=1');
assert(activeYearAverage(recs) === '1.0', 'activeYearAverage=1.0');

assert(mostVisitedContinent(recs) === '아시아', 'mostVisitedContinent=아시아');

const unvisited = unvisitedContinents(recs);
assert(unvisited.includes('오세아니아'), 'unvisitedContinents 오세아니아 포함');
assert(unvisited.includes('아프리카'), 'unvisitedContinents 아프리카 포함');
assert(!unvisited.includes('아시아'), 'unvisitedContinents 아시아 미포함');

const best = highestRatedTrip(recs);
assert(best?.rating === 5 && best?.country === '일본', 'highestRatedTrip=일본(5)');
assert(mostRecentRatedTrip(recs)?.country === '대만', 'mostRecentRatedTrip=대만(4)');

// ── 거주국 제외 × 도시(regionName) 규칙 (2026-08-13) ──
// 도시를 붙인 거주국 기록은 방문이다. 도시 없는 거주국 기록(홈 스냅 등)은 종전대로 제외.
const home = new Set(['대한민국', '한국']);
const homeRecs: TripRecord[] = [
  // 부산 여행(도시 있음) — 최신. 방문으로 세야 한다
  { countries: [{ name: '대한민국' }], regionName: '부산', startDate: '2026.08.01', timestamp: 500 },
  // 집에서 찍은 스냅(도시 없음) — 더 최신이어도 방문이 아니다
  { countryName: '대한민국', startDate: '2026.08.10', timestamp: 600, viewType: 'snap' },
  ...recs,
];
assert(mostRecentCountry(homeRecs, home) === '대한민국', 'mostRecentCountry: 도시 붙은 거주국 기록은 방문');
assert(
  mostRecentCountry([homeRecs[1], ...recs], home) === '대만',
  'mostRecentCountry: 도시 없는 거주국 기록(스냅)은 제외 유지',
);
assert(
  mostVisitedContinent([homeRecs[0], { countryName: '프랑스', regionName: '파리', date: '2023.03.02', timestamp: 100 }], home) === '아시아',
  'continentCounts: 부산 여행이 아시아에 잡힌다(대한민국)',
);
assert(
  mostVisitedContinent([homeRecs[1], { countryName: '프랑스', regionName: '파리', date: '2023.03.02', timestamp: 100 }], home) === '유럽',
  'continentCounts: 도시 없는 거주국 기록은 대륙 집계에서도 제외 유지',
);

if (failures > 0) { console.error(`\n${failures}개 실패`); process.exit(1); }
console.log('\n모든 검증 통과');
