// 상세통계 '박스'용 순수 파생 계산 — t()/RN 의존 없음(테스트 가능)
// 대륙 매핑은 화면과 동일 규칙: 북/남아메리카 → '아메리카', 미등록 국가명은 대륙 통계 제외.
import { COUNTRIES } from '../constants/countries';

export interface TripRecord {
  countries?: { name: string; flag?: string }[];
  countryName?: string;
  countryFlag?: string;
  regionName?: string;
  startDate?: string;
  endDate?: string;
  date?: string;
  timestamp: number;
  rating?: number;
  perCountryData?: Record<string, { rating?: number }>;
}

export const CONTINENTS = ['아시아', '유럽', '아메리카', '오세아니아', '아프리카'] as const;
export type Continent = (typeof CONTINENTS)[number];

export function travelTime(r: TripRecord): number {
  const s = r.startDate || r.date;
  if (s) {
    const [y, m, d] = s.split(/[.\-/]/).map((p) => parseInt(p, 10));
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      return new Date(y, m - 1, d).getTime();
    }
  }
  return r.timestamp;
}

export function recordCountryNames(r: TripRecord): string[] {
  if (r.countries && r.countries.length > 0) return r.countries.map((c) => c.name);
  if (r.countryName) return [r.countryName];
  return [];
}

export function recordRating(r: TripRecord): number | undefined {
  if (r.rating !== undefined) return r.rating;
  if (r.perCountryData) {
    const rs = Object.values(r.perCountryData).map((d) => d.rating).filter(Boolean) as number[];
    if (rs.length > 0) return Math.round(rs.reduce((a, b) => a + b, 0) / rs.length);
  }
  return undefined;
}

export interface RecentTrip {
  country: string;
  city: string;
  period: string;
  records: number;
}

export function recentTrips(records: TripRecord[], limit = 5): RecentTrip[] {
  return [...records]
    .sort((a, b) => travelTime(b) - travelTime(a))
    .slice(0, limit)
    .map((r) => {
      const country = recordCountryNames(r)[0] ?? '-';
      const city = r.regionName ?? '';
      const start = (r.startDate || r.date || '').trim();
      const end = (r.endDate || '').trim();
      let period = start;
      if (start && end) {
        const endTail = end.split(/[.\-/]/).slice(-1)[0];
        period = `${start}-${endTail}`;
      }
      return { country, city, period, records: 1 };
    });
}

export function countryVisitCounts(records: TripRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  records.forEach((r) => recordCountryNames(r).forEach((n) => { out[n] = (out[n] || 0) + 1; }));
  return out;
}

export function revisitedCountryCount(records: TripRecord[]): number {
  const counts = countryVisitCounts(records);
  return Object.values(counts).filter((c) => c >= 2).length;
}

export function mostRecentCountry(records: TripRecord[]): string | undefined {
  if (records.length === 0) return undefined;
  const latest = [...records].sort((a, b) => travelTime(b) - travelTime(a))[0];
  return recordCountryNames(latest)[0];
}

export function continentOf(name: string): Continent | undefined {
  const lookup = name === '한국' ? '대한민국' : name;
  const meta = COUNTRIES.find((c) => c.name === lookup);
  if (!meta) return undefined;
  let cont = meta.continent;
  if (cont === '북아메리카' || cont === '남아메리카') cont = '아메리카';
  return (CONTINENTS as readonly string[]).includes(cont) ? (cont as Continent) : undefined;
}

export function continentCountryCounts(records: TripRecord[]): Record<Continent, number> {
  const sets: Record<Continent, Set<string>> = {
    '아시아': new Set(), '유럽': new Set(), '아메리카': new Set(), '오세아니아': new Set(), '아프리카': new Set(),
  };
  records.forEach((r) => recordCountryNames(r).forEach((n) => {
    const cont = continentOf(n);
    if (cont) sets[cont].add(n === '한국' ? '대한민국' : n);
  }));
  return {
    '아시아': sets['아시아'].size, '유럽': sets['유럽'].size, '아메리카': sets['아메리카'].size,
    '오세아니아': sets['오세아니아'].size, '아프리카': sets['아프리카'].size,
  };
}

export function mostVisitedContinent(records: TripRecord[]): Continent | undefined {
  const counts = continentCountryCounts(records);
  let best: Continent | undefined; let max = 0;
  CONTINENTS.forEach((c) => { if (counts[c] > max) { max = counts[c]; best = c; } });
  return best;
}

export function unvisitedContinents(records: TripRecord[]): Continent[] {
  const counts = continentCountryCounts(records);
  return CONTINENTS.filter((c) => counts[c] === 0);
}

export function yearlyVisitCounts(records: TripRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  records.forEach((r) => {
    const y = (r.date || r.startDate || '').split('.')[0];
    if (y && y.length === 4) out[y] = (out[y] || 0) + 1;
  });
  return out;
}

export function thisYearVisitCount(records: TripRecord[], year = new Date().getFullYear()): number {
  return yearlyVisitCounts(records)[String(year)] || 0;
}

export function activeYearAverage(records: TripRecord[]): string {
  const counts = yearlyVisitCounts(records);
  const years = Object.keys(counts);
  if (years.length === 0) return '0.0';
  const total = years.reduce((a, y) => a + counts[y], 0);
  return (total / years.length).toFixed(1);
}

export function highestRatedTrip(records: TripRecord[]): { country: string; rating: number } | undefined {
  const rated = records
    .map((r) => ({ r, rating: recordRating(r) }))
    .filter((x): x is { r: TripRecord; rating: number } => x.rating !== undefined);
  if (rated.length === 0) return undefined;
  rated.sort((a, b) => (b.rating - a.rating) || (travelTime(b.r) - travelTime(a.r)));
  return { country: recordCountryNames(rated[0].r)[0] ?? '-', rating: rated[0].rating };
}

export function mostRecentRatedTrip(records: TripRecord[]): { country: string; rating: number } | undefined {
  const rated = records
    .map((r) => ({ r, rating: recordRating(r) }))
    .filter((x): x is { r: TripRecord; rating: number } => x.rating !== undefined)
    .sort((a, b) => travelTime(b.r) - travelTime(a.r));
  if (rated.length === 0) return undefined;
  return { country: recordCountryNames(rated[0].r)[0] ?? '-', rating: rated[0].rating };
}
