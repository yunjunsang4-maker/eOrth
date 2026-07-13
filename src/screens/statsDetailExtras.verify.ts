import {
  recentTrips, revisitedCountryCount, mostRecentCountry, thisYearVisitCount,
  activeYearAverage, mostVisitedContinent, unvisitedContinents, highestRatedTrip,
  mostRecentRatedTrip, countryVisitCounts, TripRecord,
} from './statsDetailExtras';

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? '✓' : '✗'} ${name}`);
  if (!cond) failed++;
}

const recs: TripRecord[] = [
  { countries: [{ name: '일본' }], regionName: '후쿠오카', startDate: '2025.08.10', endDate: '2025.08.13', timestamp: 300, rating: 5 },
  { countries: [{ name: '일본' }], regionName: '도쿄', startDate: '2024.05.01', endDate: '2024.05.05', timestamp: 200, rating: 3 },
  { countryName: '대만', regionName: '타이베이', startDate: '2026.07.12', endDate: '2026.07.23', timestamp: 400, rating: 4 },
  { countryName: '프랑스', regionName: '파리', date: '2023.03.02', timestamp: 100 },
];

const rt = recentTrips(recs, 3);
ok('recentTrips 최신순 첫 항목=대만', rt[0].country === '대만');
ok('recentTrips 기간 병합=2026.07.12-23', rt[0].period === '2026.07.12-23');
ok('recentTrips limit 적용', rt.length === 3);

ok('countryVisitCounts 일본=2', countryVisitCounts(recs)['일본'] === 2);
ok('revisitedCountryCount=1(일본)', revisitedCountryCount(recs) === 1);
ok('mostRecentCountry=대만', mostRecentCountry(recs) === '대만');

ok('thisYearVisitCount(2026)=1', thisYearVisitCount(recs, 2026) === 1);
ok('activeYearAverage=1.0', activeYearAverage(recs) === '1.0');

ok('mostVisitedContinent=아시아', mostVisitedContinent(recs) === '아시아');
ok('unvisitedContinents 오세아니아 포함', unvisitedContinents(recs).includes('오세아니아'));

ok('highestRatedTrip=일본(5)', highestRatedTrip(recs)?.rating === 5 && highestRatedTrip(recs)?.country === '일본');
ok('mostRecentRatedTrip=대만(4)', mostRecentRatedTrip(recs)?.country === '대만');

if (failed > 0) { console.error(`\n${failed}개 실패`); process.exit(1); }
console.log('\n모든 검증 통과');
