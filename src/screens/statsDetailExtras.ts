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
  viewType?: string; // 기록 형식(feed/blog/album/snap/cut). 스냅 제외 카운트에 사용
  tripGroupId?: string | null; // 여행 묶음(카드) ID — 총 기록을 카드당 셀 때 사용
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
    const rs = Object.values(r.perCountryData).map((d) => d.rating).filter((v): v is number => v !== undefined);
    if (rs.length > 0) return Math.round(rs.reduce((a, b) => a + b, 0) / rs.length);
  }
  return undefined;
}

export interface RecentTrip {
  country: string;
  city: string;
  period: string;
  records: number; // 그 나라의 총 기록(레코드) 수
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
      // 'YYYY.MM.DD' → [YYYY,MM,DD] (4자리 연도 형식일 때만), 아니면 null
      const ymd = (s: string): [string, string, string] | null => {
        const p = s.split(/[.\-/]/);
        return p.length >= 3 && p[0].length === 4 ? [p[0], p[1], p[2]] : null;
      };
      const sp = ymd(start);
      let period = start;
      if (sp) {
        const startC = `${sp[0].slice(2)}.${sp[1]}.${sp[2]}`; // 2자리 연도 압축
        period = startC;
        const ep = end ? ymd(end) : null;
        if (ep) {
          // 같은 연·월이면 종료 '일'만, 같은 연이면 종료 '월.일', 아니면 종료 '연.월.일'까지
          if (sp[0] === ep[0] && sp[1] === ep[1]) period = `${startC}-${ep[2]}`;
          else if (sp[0] === ep[0]) period = `${startC}-${ep[1]}.${ep[2]}`;
          else period = `${startC}-${ep[0].slice(2)}.${ep[1]}.${ep[2]}`;
        }
      } else if (start && end) {
        period = `${start} ~ ${end}`;
      }
      return { country, city, period, records: cardRecordCount(r, records) };
    });
}

export function countryVisitCounts(records: TripRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  records.forEach((r) => recordCountryNames(r).forEach((n) => { out[n] = (out[n] || 0) + 1; }));
  return out;
}

// 여행 카드당 '총 기록' 수 — 스냅(viewType 'snap') 제외.
// 같은 여행 묶음(tripGroupId)이면 그 묶음의 비-스냅 기록 수, 묶음이 없으면 그 기록 자체(비-스냅이면 1).
export function cardRecordCount(record: TripRecord, allRecords: TripRecord[]): number {
  if (record.tripGroupId) {
    return allRecords.filter((r) => r.tripGroupId === record.tripGroupId && r.viewType !== 'snap').length;
  }
  return record.viewType === 'snap' ? 0 : 1;
}

/** 기록 단위 재방문 국가 수 — 카드 단위 규칙 도입 전 정의(검증용으로 남긴다). 화면은 아래 이벤트 버전을 쓴다. */
export function revisitedCountryCount(records: TripRecord[]): number {
  const counts = countryVisitCounts(records);
  return Object.values(counts).filter((c) => c >= 2).length;
}

/** 방문 1회 = 여행 카드 1장인 이벤트(tripVisitStats.VisitEvent) */
export interface VisitEventLike {
  countries: { name: string }[];
}

/**
 * 재방문(2회 이상 방문) 국가 수 — 카드(방문 이벤트) 단위.
 * 기록 단위로 세면 "일본 1카드 2기록"이 재방문으로 잡혀 방문 횟수(1회)와 모순됐다.
 * 국가별 방문 횟수 목록(countriesItems)과 같은 이름 어휘로 세어 화면 간 값이 어긋나지 않게 한다.
 */
export function revisitedCountryCountFromEvents(events: VisitEventLike[]): number {
  const counts: Record<string, number> = {};
  events.forEach((ev) => ev.countries.forEach((c) => { counts[c.name] = (counts[c.name] || 0) + 1; }));
  return Object.values(counts).filter((c) => c >= 2).length;
}

/**
 * 가장 최근 방문 국가. exclude(거주국 등)에 든 국가는 건너뛴다 —
 * 단 도시(regionName)를 붙인 기록은 거주국이어도 방문이다(화면 카운트와 동일 규칙, 2026-08-13)
 */
export function mostRecentCountry(records: TripRecord[], exclude?: Set<string>): string | undefined {
  const sorted = [...records].sort((a, b) => travelTime(b) - travelTime(a));
  for (const r of sorted) {
    const name = recordCountryNames(r).find((n) => !exclude?.has(n) || !!r.regionName);
    if (name) return name;
  }
  return undefined;
}

export function canonicalCountryName(name: string): string {
  return name === '한국' ? '대한민국' : name;
}

export function continentOf(name: string): Continent | undefined {
  const lookup = canonicalCountryName(name);
  const meta = COUNTRIES.find((c) => c.name === lookup);
  if (!meta) return undefined;
  let cont = meta.continent;
  if (cont === '북아메리카' || cont === '남아메리카') cont = '아메리카';
  return (CONTINENTS as readonly string[]).includes(cont) ? (cont as Continent) : undefined;
}

/**
 * exclude(거주국 등)에 든 국가는 대륙 집계에서 뺀다 — "거주국은 방문국이 아니다" 규칙.
 * 단 도시(regionName)를 붙인 기록은 거주국이어도 방문이다(화면 카운트와 동일 규칙, 2026-08-13)
 */
export function continentCountryCounts(records: TripRecord[], exclude?: Set<string>): Record<Continent, number> {
  const sets: Record<Continent, Set<string>> = {
    '아시아': new Set(), '유럽': new Set(), '아메리카': new Set(), '오세아니아': new Set(), '아프리카': new Set(),
  };
  records.forEach((r) => recordCountryNames(r).forEach((n) => {
    if (exclude?.has(n) && !r.regionName) return;
    const cont = continentOf(n);
    if (cont) sets[cont].add(canonicalCountryName(n));
  }));
  return {
    '아시아': sets['아시아'].size, '유럽': sets['유럽'].size, '아메리카': sets['아메리카'].size,
    '오세아니아': sets['오세아니아'].size, '아프리카': sets['아프리카'].size,
  };
}

export function mostVisitedContinent(records: TripRecord[], exclude?: Set<string>): Continent | undefined {
  const counts = continentCountryCounts(records, exclude);
  let best: Continent | undefined; let max = 0;
  CONTINENTS.forEach((c) => { if (counts[c] > max) { max = counts[c]; best = c; } });
  return best;
}

export function unvisitedContinents(records: TripRecord[], exclude?: Set<string>): Continent[] {
  const counts = continentCountryCounts(records, exclude);
  return CONTINENTS.filter((c) => counts[c] === 0);
}

function extractYear(r: TripRecord): string {
  const s = r.date || r.startDate || '';
  const y = s.split(/[.\-/]/)[0];
  return y && y.length === 4 ? y : '';
}

export function yearlyVisitCounts(records: TripRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  records.forEach((r) => {
    const y = extractYear(r);
    if (y) out[y] = (out[y] || 0) + 1;
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
