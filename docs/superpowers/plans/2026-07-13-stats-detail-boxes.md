# 상세통계 박스형 재구성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상세통계 화면(`StatsDetailScreen`)을 카테고리별로 [히어로 + 관련 박스 여러 개] 형태로 재구성하고, 내부 드릴다운 단계를 제거한다.

**Architecture:** 신규 파생 통계(Recent Trips·하이라이트)는 순수 함수 모듈 `statsDetailExtras.ts`로 분리해 `.verify.ts`로 검증한다. 그라데이션 테두리 박스는 재사용 컴포넌트 `DetailBox`로 통일한다. 화면은 `statType`별 뷰모델(`hero` + `boxes[]`)을 만들어 박스를 세로로 렌더한다(world만 지구본 히어로 + ‹›순환, 나머지는 수치 히어로).

**Tech Stack:** React Native (Expo), TypeScript, react-native-svg, i18next, 프로젝트 자체 `*.verify.ts` 검증 러너(`npm test`).

**검증 방식(이 프로젝트 규칙):** 단위 테스트는 순수 로직에 한해 `*.verify.ts` + `npm test`. RN 렌더는 `npx tsc --noEmit`(타입) + 수동 시각 확인. jest 없음.

---

## File Structure

- **Create** `src/screens/statsDetailExtras.ts` — 순수 파생 통계(레코드 → 평문 데이터). t() 미사용.
- **Create** `src/screens/statsDetailExtras.verify.ts` — 위 순수 함수 자체 assert 검증.
- **Create** `src/components/DetailBox.tsx` — 그라데이션 테두리 박스 카드(제목 + children). 기존 `tableCard`+네온 SVG 테두리 패턴 이식.
- **Modify** `src/screens/StatsDetailScreen.tsx` — content useMemo를 `{ hero, boxes }` 뷰모델로 재구성, 렌더를 박스 나열로 교체, 드릴다운 셰브런 제거, world만 지구본 히어로.
- **Modify** `src/i18n/`(ko/en 리소스) — 신규 라벨 키 추가.

레코드 필드(참고, `recordStore`): `countries?: {name; flag}[]`, `countryName?`, `countryFlag?`, `regionName?`(도시), `startDate?`, `endDate?`, `date?`, `timestamp`, `rating?`, `perCountryData?`.

---

## Task 1: 순수 파생 통계 모듈 + 검증

**Files:**
- Create: `src/screens/statsDetailExtras.ts`
- Test: `src/screens/statsDetailExtras.verify.ts`

- [ ] **Step 1: 순수 모듈 작성**

`src/screens/statsDetailExtras.ts`:

```ts
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

// 레코드의 '여행 시각'(날짜 우선, 없으면 timestamp)
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

// 레코드 대표 별점(rating 우선, 없으면 perCountryData 평균 반올림)
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
  period: string; // 'YY.MM.DD-DD' 또는 시작일
  records: number; // 해당 국가 등장 기록 수(간단히 1로 집계되는 레코드 단위)
}

// 최근 여행 N개(여행 시각 내림차순). 국가/도시/기간 표시.
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
        const endTail = end.split(/[.\-/]/).slice(-1)[0]; // 종료 '일'만
        period = `${start}-${endTail}`;
      }
      return { country, city, period, records: 1 };
    });
}

// 국가별 방문 횟수(레코드 등장 횟수 합)
export function countryVisitCounts(records: TripRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  records.forEach((r) => recordCountryNames(r).forEach((n) => { out[n] = (out[n] || 0) + 1; }));
  return out;
}

// 재방문 국가 수(2회 이상)
export function revisitedCountryCount(records: TripRecord[]): number {
  const counts = countryVisitCounts(records);
  return Object.values(counts).filter((c) => c >= 2).length;
}

// 최근 방문 국가(여행 시각 최신 레코드의 대표 국가)
export function mostRecentCountry(records: TripRecord[]): string | undefined {
  if (records.length === 0) return undefined;
  const latest = [...records].sort((a, b) => travelTime(b) - travelTime(a))[0];
  return recordCountryNames(latest)[0];
}

// 국가명 → 대륙(북/남아메리카 병합). 미등록이면 undefined.
export function continentOf(name: string): Continent | undefined {
  const lookup = name === '한국' ? '대한민국' : name;
  const meta = COUNTRIES.find((c) => c.name === lookup);
  if (!meta) return undefined;
  let cont = meta.continent;
  if (cont === '북아메리카' || cont === '남아메리카') cont = '아메리카';
  return (CONTINENTS as readonly string[]).includes(cont) ? (cont as Continent) : undefined;
}

// 대륙별 방문 국가 수
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

// 연도별 방문 횟수(레코드 수)
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

// 활동한 연도 평균 방문 수(소수 1자리)
export function activeYearAverage(records: TripRecord[]): string {
  const counts = yearlyVisitCounts(records);
  const years = Object.keys(counts);
  if (years.length === 0) return '0.0';
  const total = years.reduce((a, y) => a + counts[y], 0);
  return (total / years.length).toFixed(1);
}

// 최고 평점 여행(최고 rating 중 여행 시각 최신)
export function highestRatedTrip(records: TripRecord[]): { country: string; rating: number } | undefined {
  const rated = records
    .map((r) => ({ r, rating: recordRating(r) }))
    .filter((x): x is { r: TripRecord; rating: number } => x.rating !== undefined);
  if (rated.length === 0) return undefined;
  rated.sort((a, b) => (b.rating - a.rating) || (travelTime(b.r) - travelTime(a.r)));
  return { country: recordCountryNames(rated[0].r)[0] ?? '-', rating: rated[0].rating };
}

// 최근 평가 여행(rating 있는 레코드 중 여행 시각 최신)
export function mostRecentRatedTrip(records: TripRecord[]): { country: string; rating: number } | undefined {
  const rated = records
    .map((r) => ({ r, rating: recordRating(r) }))
    .filter((x): x is { r: TripRecord; rating: number } => x.rating !== undefined)
    .sort((a, b) => travelTime(b.r) - travelTime(a.r));
  if (rated.length === 0) return undefined;
  return { country: recordCountryNames(rated[0].r)[0] ?? '-', rating: rated[0].rating };
}
```

- [ ] **Step 2: 검증 스크립트 작성**

`src/screens/statsDetailExtras.verify.ts` (기존 `dmShareLogic.verify.ts`와 동일 스타일: 자체 assert, 실패 시 `process.exit(1)`):

```ts
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
ok('activeYearAverage=1.0', activeYearAverage(recs) === '1.0'); // 4개 연도 각 1회

ok('mostVisitedContinent=아시아', mostVisitedContinent(recs) === '아시아');
ok('unvisitedContinents 오세아니아 포함', unvisitedContinents(recs).includes('오세아니아'));

ok('highestRatedTrip=일본(5)', highestRatedTrip(recs)?.rating === 5 && highestRatedTrip(recs)?.country === '일본');
ok('mostRecentRatedTrip=대만(4)', mostRecentRatedTrip(recs)?.country === '대만');

if (failed > 0) { console.error(`\n${failed}개 실패`); process.exit(1); }
console.log('\n모든 검증 통과');
```

- [ ] **Step 3: 검증 실행(실패→통과 확인)**

Run: `npm test`
Expected: `statsDetailExtras.verify.ts`에서 `모든 검증 통과`, 종료코드 0. (대륙/연도 값은 `COUNTRIES` 실제 매핑에 의존 — 실패 시 assert 기대값을 실제 출력에 맞춰 조정)

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 통과.

- [ ] **Step 5: 커밋**

```bash
git add src/screens/statsDetailExtras.ts src/screens/statsDetailExtras.verify.ts
git commit -m "feat(stats): 상세통계 박스용 순수 파생 계산 모듈 + 검증"
```

---

## Task 2: 재사용 박스 컴포넌트 DetailBox

**Files:**
- Create: `src/components/DetailBox.tsx`

기존 `StatsDetailScreen`의 `tableCard`+네온 테두리(SVG `detailTableRing`, rx 28, 마젠타→시안) 패턴을 컴포넌트로 이식. 제목(상단) + children(카드 내부).

- [ ] **Step 1: 컴포넌트 작성**

`src/components/DetailBox.tsx`:

```tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Defs as SvgDefs, LinearGradient as SvgLinearGradient, Stop as SvgStop, Rect as SvgRect } from 'react-native-svg';
import { Colors, Typography } from '../constants';

// 시안 카드: 흰 3% 패널 + 마젠타→시안 그라데이션 1px 스트로크(rx 28). 높이는 onLayout로 측정해 테두리에 반영.
export default function DetailBox({ title, children }: { title?: string; children: React.ReactNode }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View style={styles.wrap}>
      {!!title && <Text style={styles.title}>{title}</Text>}
      <View
        style={styles.card}
        onLayout={(e) => setSize({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) })}
      >
        {children}
        {size.w > 0 && size.h > 0 && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg width={size.w} height={size.h}>
              <SvgDefs>
                <SvgLinearGradient id="detailBoxRing" x1="15%" y1="0%" x2="70%" y2="72%">
                  <SvgStop offset="0" stopColor="#FF14E4" />
                  <SvgStop offset="0.6" stopColor="#00D8F3" stopOpacity={0} />
                  <SvgStop offset="1" stopColor="#00D8F3" stopOpacity={0.5} />
                </SvgLinearGradient>
              </SvgDefs>
              <SvgRect x={0.5} y={0.5} width={size.w - 1} height={size.h - 1} rx={28} stroke="url(#detailBoxRing)" strokeWidth={1} fill="none" />
            </Svg>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 20 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10, marginLeft: 4 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 28,
    paddingVertical: 6,
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
});
```

> 주의: SVG `id`가 화면 내 다른 그라데이션과 충돌하지 않도록 `detailBoxRing` 고유값 사용. 여러 박스가 같은 id를 써도 defs가 각 Svg 내부라 충돌 없음.

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 통과(아직 미사용 — import 경고만 없으면 OK).

- [ ] **Step 3: 커밋**

```bash
git add src/components/DetailBox.tsx
git commit -m "feat(stats): 그라데이션 테두리 박스 컴포넌트 DetailBox"
```

---

## Task 3: i18n 신규 키 추가

**Files:**
- Modify: `src/i18n/` ko/en 리소스(기존 `statsDetail` 네임스페이스에 추가)

- [ ] **Step 1: 키 위치 확인**

Run(경로 확인): `Grep "statsDetail" src/i18n` → ko/en 리소스 파일에서 `statsDetail` 블록을 찾는다.

- [ ] **Step 2: 다음 키를 ko/en 양쪽에 추가**

ko:
```
recentTrips: '최근 여행',
colCountry: '방문 나라', colCity: '방문 도시', colPeriod: '여행 기간', colRecords: '총 기록',
boxMostActiveYear: '가장 활발했던 해',
boxHighlights: '하이라이트',
boxYearlyStatus: '연도별 방문 현황',
boxContinentStatus: '대륙별 방문 현황',
boxCountryVisits: '국가별 방문 횟수',
boxRatingDist: '별점 분포',
hlThisYear: '올해 방문', hlYearAvg: '연평균', hlMostContinent: '최다 방문 대륙',
hlUnvisited: '미방문 대륙', hlRecentCountry: '최근 방문 국가', hlRevisited: '재방문 국가',
hlTopRated: '최고 평점 여행', hlRecentRated: '최근 평가', hlRatedCount: '평가한 기록',
heroTotalVisitsLbl: '총 방문 횟수', heroTopCountryLbl: 'Top 국가',
```
en(대응 번역):
```
recentTrips: 'Recent Trips',
colCountry: 'Country', colCity: 'City', colPeriod: 'Period', colRecords: 'Records',
boxMostActiveYear: 'Most Active Year',
boxHighlights: 'Highlights',
boxYearlyStatus: 'Visits by Year',
boxContinentStatus: 'Visits by Continent',
boxCountryVisits: 'Visits by Country',
boxRatingDist: 'Rating Distribution',
hlThisYear: 'This Year', hlYearAvg: 'Yearly Avg', hlMostContinent: 'Top Continent',
hlUnvisited: 'Unvisited', hlRecentCountry: 'Recent Country', hlRevisited: 'Revisited',
hlTopRated: 'Top Rated', hlRecentRated: 'Latest Rating', hlRatedCount: 'Rated Records',
heroTotalVisitsLbl: 'Total Visits', heroTopCountryLbl: 'Top Country',
```

- [ ] **Step 3: 타입/런타임 확인**

Run: `npx tsc --noEmit`
Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
git add src/i18n
git commit -m "i18n(stats): 상세통계 박스 라벨 키 추가"
```

---

## Task 4: 뷰모델 재구성 — content useMemo가 hero + boxes 반환

**Files:**
- Modify: `src/screens/StatsDetailScreen.tsx` (content useMemo, 약 371-420행의 switch)

기존 switch가 `{ title, subtitle, hero, heroLabel, items }`를 반환하던 것을, 카테고리별 `{ title, hero, boxes }`로 바꾼다. 기존 중간 변수(`countryCount, cityCount, recordsCount, totalDays, worldCoveragePct, mostActiveYear, mostActiveCount, firstTravelYear, firstTravelLoc, yearlyItems, regionItems, countriesItems, ratingItems, avgRating, ratedRecordsCount, totalYearlyVisits, totalRegionCount`)는 그대로 재사용하고, Task1 헬퍼로 신규 값을 계산한다.

- [ ] **Step 1: 헬퍼 import 추가(파일 상단 import 블록)**

```ts
import { recentTrips, revisitedCountryCount, mostRecentCountry, thisYearVisitCount, activeYearAverage, mostVisitedContinent, unvisitedContinents, highestRatedTrip, mostRecentRatedTrip } from './statsDetailExtras';
```

- [ ] **Step 2: 뷰모델 타입 정의(파일 상단, StatType 근처)**

```ts
type BoxRow = { label: string; value: string; sub?: string };
type Box =
  | { kind: 'rows'; title: string; rows: BoxRow[] }
  | { kind: 'trips'; title: string; trips: { country: string; city: string; period: string; records: number }[] };
type Hero = { globe: boolean; label: string; value: string; sub?: string; cycle?: BoxRow[] };
type DetailContent = { title: string; hero: Hero; boxes: Box[] };
```

- [ ] **Step 3: switch를 아래로 교체(각 case가 `{ title, hero, boxes }` 반환)**

```ts
switch (statType) {
  case 'world': {
    const cycle: BoxRow[] = [
      { label: t('statsDetail.heroTotalCountries'), value: t('statsDetail.countriesN', { n: countryCount }) },
      { label: t('statsDetail.labelVisitedCities'), value: t('statsDetail.countN', { n: cityCount }) },
      { label: t('statsDetail.labelTotalRecords'), value: t('statsDetail.countN', { n: recordsCount }) },
      { label: t('statsDetail.labelTotalDays'), value: t('statsDetail.daysN', { n: totalDays }) },
      { label: t('statsDetail.labelWorldCoverage'), value: worldCoveragePct },
    ];
    return {
      title: t('statsDetail.worldTitle'),
      hero: { globe: true, label: cycle[0].label, value: cycle[0].value, cycle },
      boxes: [
        { kind: 'trips', title: t('statsDetail.recentTrips'), trips: recentTrips(myRecords, 5) },
        { kind: 'rows', title: t('statsDetail.boxMostActiveYear'), rows: [
          { label: mostActiveYear, value: mostActiveCount > 0 ? t('statsDetail.visitedNTimes', { n: mostActiveCount }) : t('statsDetail.noRecord') },
          { label: t('statsDetail.labelFirstTravel'), value: firstTravelYear, sub: firstTravelLoc },
        ] },
      ],
    };
  }
  case 'yearly':
    return {
      title: t('statsDetail.yearlyTitle'),
      hero: { globe: false, label: t('statsDetail.heroTotalVisitsLbl'), value: t('statsDetail.visitsN', { n: totalYearlyVisits }) },
      boxes: [
        { kind: 'rows', title: t('statsDetail.boxYearlyStatus'), rows: yearlyItems.map((i) => ({ label: i.label, value: i.value, sub: i.sub })) },
        { kind: 'rows', title: t('statsDetail.boxHighlights'), rows: [
          { label: t('statsDetail.boxMostActiveYear'), value: mostActiveYear, sub: mostActiveCount > 0 ? t('statsDetail.visitedNTimes', { n: mostActiveCount }) : '' },
          { label: t('statsDetail.hlThisYear'), value: t('statsDetail.visitsN', { n: thisYearVisitCount(myRecords) }) },
          { label: t('statsDetail.hlYearAvg'), value: activeYearAverage(myRecords) },
        ] },
      ],
    };
  case 'region': {
    const mvc = mostVisitedContinent(myRecords);
    const unv = unvisitedContinents(myRecords);
    return {
      title: t('statsDetail.regionTitle'),
      hero: { globe: false, label: t('statsDetail.heroVisitedContinents'), value: t('statsDetail.continentsN', { n: totalRegionCount }) },
      boxes: [
        { kind: 'rows', title: t('statsDetail.boxContinentStatus'), rows: regionItems.map((i) => ({ label: i.label, value: i.value, sub: i.sub })) },
        { kind: 'rows', title: t('statsDetail.boxHighlights'), rows: [
          { label: t('statsDetail.hlMostContinent'), value: mvc ? continentName(mvc) : t('statsDetail.noRecord') },
          { label: t('statsDetail.hlUnvisited'), value: t('statsDetail.countN', { n: unv.length }), sub: unv.map(continentName).join(' · ') },
        ] },
      ],
    };
  }
  case 'countries': {
    const top = countriesItems[0];
    return {
      title: t('statsDetail.countryTitle'),
      hero: { globe: false, label: t('statsDetail.heroTopCountryLbl'), value: top ? top.label : '-', sub: top ? top.value : '' },
      boxes: [
        { kind: 'rows', title: t('statsDetail.boxCountryVisits'), rows: countriesItems.slice(0, 8).map((i) => ({ label: i.label, value: i.value, sub: i.sub })) },
        { kind: 'rows', title: t('statsDetail.boxHighlights'), rows: [
          { label: t('statsDetail.hlRecentCountry'), value: mostRecentCountry(myRecords) ?? '-' },
          { label: t('statsDetail.hlRevisited'), value: t('statsDetail.countN', { n: revisitedCountryCount(myRecords) }) },
        ] },
      ],
    };
  }
  case 'rating': {
    const top = highestRatedTrip(myRecords);
    const recent = mostRecentRatedTrip(myRecords);
    return {
      title: t('statsDetail.ratingTitle'),
      hero: { globe: false, label: t('statsDetail.heroAvgRating'), value: t('statsDetail.starN', { n: avgRating }) },
      boxes: [
        { kind: 'rows', title: t('statsDetail.boxRatingDist'), rows: ratingItems.map((i) => ({ label: i.label, value: i.value, sub: t('statsDetail.percentN', { n: i.sub }) })) },
        { kind: 'rows', title: t('statsDetail.boxHighlights'), rows: [
          { label: t('statsDetail.hlTopRated'), value: top ? top.country : '-', sub: top ? `★ ${top.rating}` : '' },
          { label: t('statsDetail.hlRecentRated'), value: recent ? recent.country : '-', sub: recent ? `★ ${recent.rating}` : '' },
          { label: t('statsDetail.hlRatedCount'), value: t('statsDetail.countN', { n: ratedRecordsCount }) },
        ] },
      ],
    };
  }
}
```

> 참고: `percentN` 키가 없으면 `String(i.sub) + '%'`로 대체하거나 Task3에 `percentN: '{{n}}%'`를 추가한다.

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 렌더가 아직 옛 `content.items/hero/heroLabel/subtitle`를 참조해 에러 발생 — Task 5에서 렌더를 교체하며 해소. 이 단계에서는 useMemo 반환 타입이 `DetailContent`로 바뀐 것만 확인(렌더 에러는 예상됨).

- [ ] **Step 5: 커밋(렌더 교체와 함께 하기 위해 여기서는 스테이지만, 실제 커밋은 Task 5 후)**

이 태스크는 Task 5와 한 커밋으로 묶는다(중간 상태가 컴파일되지 않으므로).

---

## Task 5: 렌더 교체 — 히어로 분기 + 박스 나열 + 셰브런 제거

**Files:**
- Modify: `src/screens/StatsDetailScreen.tsx` (렌더 500-624행, 특히 히어로/섹션헤더/단일표 부분)

- [ ] **Step 1: `content`/`items`/`featured` 참조 정리**

기존:
```ts
const items = content?.items ?? [];
const featured = items[safeIdx];
```
로 남아있던 부분을 아래로 교체:
```ts
const hero = content.hero;
const cycleItems = hero.cycle ?? [];
const featured = hero.globe && cycleItems.length > 0 ? cycleItems[heroIdx % cycleItems.length] : { label: hero.label, value: hero.value, sub: hero.sub };
```
`cycle` 함수는 `cycleItems.length` 기준으로 순환하도록 `items.length` → `cycleItems.length`로 변경.

- [ ] **Step 2: 지구본 히어로를 world(=`hero.globe`)에서만 렌더**

기존 지구본 히어로 `<Animated.View>` 블록(524-573행)을 `{hero.globe ? ( …기존 지구본 JSX… ) : ( …수치 히어로… )}`로 감싼다. `‹ ›` 화살표 조건 `items.length > 1`은 `cycleItems.length > 1`로 변경. 스포트라이트 텍스트는 `featured.label/value/sub` 사용(그대로).

수치 히어로(비 world):
```tsx
<Animated.View style={{ opacity: heroOpacity, transform: [{ scale: heroScale }] }}>
  <View style={s.numHero}>
    <Text style={s.numHeroLabel}>{hero.label}</Text>
    <Text style={s.numHeroValue}>{hero.value}</Text>
    {!!hero.sub && <Text style={s.numHeroSub}>{hero.sub}</Text>}
  </View>
</Animated.View>
```

- [ ] **Step 3: 섹션 헤더(드릴다운 ‹ ›)와 단일 표(575-621행)를 박스 나열로 교체**

```tsx
{content.boxes.map((box, bi) => (
  <FadeSlideView key={bi} delay={200 + bi * 80} from={12}>
    <DetailBox title={box.title}>
      {box.kind === 'trips' ? (
        box.trips.length === 0 ? (
          <Text style={s.tableEmpty}>{t('statsDetail.noRecord')}</Text>
        ) : (
          <>
            <View style={s.tripHead}>
              <Text style={[s.tripCell, s.tripColCountry, s.tripHeadTxt]}>{t('statsDetail.colCountry')}</Text>
              <Text style={[s.tripCell, s.tripColCity, s.tripHeadTxt]}>{t('statsDetail.colCity')}</Text>
              <Text style={[s.tripCell, s.tripColPeriod, s.tripHeadTxt]}>{t('statsDetail.colPeriod')}</Text>
            </View>
            {box.trips.map((tp, i) => (
              <View key={i} style={s.tableRow}>
                <Text style={[s.tripCell, s.tripColCountry, s.tableLabel]} numberOfLines={1}>{tp.country}</Text>
                <Text style={[s.tripCell, s.tripColCity, s.tableSub]} numberOfLines={1}>{tp.city}</Text>
                <Text style={[s.tripCell, s.tripColPeriod, s.tableValue]} numberOfLines={1}>{tp.period}</Text>
              </View>
            ))}
          </>
        )
      ) : (
        box.rows.length === 0 ? (
          <Text style={s.tableEmpty}>{t('statsDetail.noRecord')}</Text>
        ) : (
          box.rows.map((row, i) => (
            <View key={i} style={s.tableRow}>
              <View style={s.tableRowLeft}>
                <Text style={s.tableLabel} numberOfLines={1}>{row.label}</Text>
                {!!row.sub && <Text style={s.tableSub} numberOfLines={1}>{row.sub}</Text>}
              </View>
              <Text style={s.tableValue} numberOfLines={1}>{row.value}</Text>
            </View>
          ))
        )
      )}
    </DetailBox>
  </FadeSlideView>
))}
```

기존 `setTableH`/`tableH` 상태와 단일표의 네온 테두리 SVG는 DetailBox가 대체하므로 제거. `heroIdx`/`setHeroIdx`는 지구본 순환에만 사용(유지). 표 행 탭으로 `setHeroIdx` 하던 상호작용은 제거(박스엔 순환 히어로 연동 없음).

- [ ] **Step 4: import에 DetailBox 추가**

```ts
import DetailBox from '../components/DetailBox';
```

- [ ] **Step 5: 필요한 스타일 추가(`s` StyleSheet)**

```ts
numHero: { alignItems: 'center', paddingVertical: 28 },
numHeroLabel: { fontSize: 13, color: Colors.textMuted, marginBottom: 6 },
numHeroValue: { fontSize: 40, fontWeight: '800', color: Colors.textPrimary },
numHeroSub: { fontSize: 13, color: '#E0C9FF', marginTop: 4 },
tripHead: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
tripHeadTxt: { color: Colors.textMuted, fontSize: 11 },
tripCell: { fontSize: 13 },
tripColCountry: { width: '30%' },
tripColCity: { width: '34%' },
tripColPeriod: { width: '36%', textAlign: 'right' },
```
(기존 `tableRow, tableRowLeft, tableLabel, tableSub, tableValue, tableEmpty`는 그대로 재사용.)

- [ ] **Step 6: 미사용 정리**

옛 `content.subtitle/heroLabel/items`, `setTableH`, `tableH`, `detailTableRing` SVG, `Item` 타입의 `visits` 정렬용 필드 외 잔여 참조 제거. 미사용 import 정리.

- [ ] **Step 7: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 통과.

- [ ] **Step 8: 커밋(Task 4 + Task 5)**

```bash
git add src/screens/StatsDetailScreen.tsx
git commit -m "feat(stats): 상세통계 화면 박스형 재구성 + 드릴다운 제거"
```

---

## Task 6: 시각 확인 & 마감

- [ ] **Step 1: 앱 실행 확인 항목**

`npx expo start` 후 각 카테고리 진입해 확인:
- world: 지구본 히어로 ‹›순환 + Recent Trips 표 + 가장 활발했던 해 박스
- yearly/region/countries/rating: 수치 히어로 + 각 박스 2개, 드릴다운 셰브런 없음
- 박스 그라데이션 테두리(마젠타→시안)와 빈 데이터('노 레코드') 정상

- [ ] **Step 2: 전체 검증**

Run: `npm test && npx tsc --noEmit`
Expected: 모두 통과.

- [ ] **Step 3: 최종 커밋(있다면)**

```bash
git add -A src/screens/StatsDetailScreen.tsx
git commit -m "fix(stats): 상세통계 박스 시각 마감"
```

---

## Self-Review 반영 메모

- 스펙 커버리지: world(시안), yearly/region/countries/rating 박스 정의 → Task4 각 case로 1:1 매핑. 드릴다운 제거 → Task5 Step3.
- 신규 계산(Recent Trips·하이라이트) → Task1 순수 함수 + verify로 검증.
- 타입 일관성: `Box/Hero/BoxRow/DetailContent`(Task4)와 렌더(Task5)에서 동일 이름 사용. 헬퍼 함수명은 Task1 export와 Task4 import 일치.
- 미해결 위험: `activeYearAverage`/대륙 매핑 기대값은 실제 `COUNTRIES` 데이터에 의존 → Task1 Step3에서 실제 출력으로 assert 보정.
