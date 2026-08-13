/**
 * 통계의 "방문 1회" = 여행 카드(TripGroup) 1장 — 기록 수가 아니다 (사용자 확정 2026-07-30).
 *
 * 같은 여행에서 기록을 여러 개 남겨도 방문은 1회다. 카드의 국가·날짜 해석은 카드 UI와
 * 동일 규칙을 쓴다: 오버라이드(countryName/date — 다국가 분할 카드) 우선, 없으면 첫 멤버
 * 기록 값(recordStore의 그룹 매칭·ProfileScreen 렌더와 같은 규칙).
 *
 * 어느 카드에도 속하지 않은 기록(구버전 가져오기 등)은 기록 1건 = 방문 1회로 폴백한다 —
 * 통계에서 조용히 사라지는 것을 막는다. 이때 다국가 기록은 "한 번의 여행에서 N개국 방문"
 * 이므로 이벤트 1개에 국가 N개를 담는다(연도별 집계는 1회, 국가별 집계는 국가마다 1회).
 *
 * 순수 함수 — 스토어/RN 의존 없음. tripVisitStats.verify.ts로 검증한다.
 */

export interface VisitGroupLike {
  records: string[];
  countryName?: string;
  countryFlag?: string;
  date?: string; // YYYY.MM.DD
  regionName?: string; // 국내(거주국) 카드의 지역 구분 — "부산 여행"
}

export interface VisitRecordLike {
  id: string;
  isMyPost?: boolean;
  countryName?: string;
  countryFlag?: string;
  countries?: { name: string; flag: string }[];
  date?: string;
  startDate?: string;
  regionName?: string; // 지역(도시) 지정 기록 — 거주국 방문 판정에 사용
}

/** 방문 1회(여행 카드 1장 또는 미소속 기록 1건) */
export interface VisitEvent {
  countries: { name: string; flag: string }[]; // 카드 유래면 항상 1개, 미소속 다국가 기록이면 N개
  year: string; // 'YYYY' — 날짜를 못 읽으면 ''
  // 지역(도시)이 붙은 방문 — 카드 또는 멤버 기록에 regionName이 있으면 true.
  // "도시로 기록하면 국가도 방문으로 센다" 규칙(2026-08-13): 화면의 거주국 제외 필터가
  // 이 값이 true인 이벤트는 거주국이어도 통과시킨다. 도시 없는 거주국 기록(홈 스냅 등)은
  // 종전대로 제외 — 그렇지 않으면 집에서 찍은 스냅 한 장에 방문 국가가 +1 된다.
  hasRegion: boolean;
}

const yearOf = (s: string | undefined): string => {
  const y = (s ?? '').split(/[.\-/]/)[0];
  return y && y.length === 4 ? y : '';
};

export function buildVisitEvents(groups: VisitGroupLike[], records: VisitRecordLike[]): VisitEvent[] {
  const byId = new Map<string, VisitRecordLike>();
  for (const r of records) {
    if (r.isMyPost === false) continue; // 타인 글은 내 통계가 아니다
    byId.set(r.id, r);
  }

  const events: VisitEvent[] = [];
  const groupedIds = new Set<string>();

  for (const g of groups) {
    const members = g.records.map((id) => byId.get(id)).filter(Boolean) as VisitRecordLike[];
    // 멤버가 전부 삭제됐어도 이 카드에 "속했던" 기록이 폴백으로 이중 집계되지 않게 먼저 표시
    for (const id of g.records) groupedIds.add(id);
    if (members.length === 0) continue; // 빈 카드(기록 전부 삭제)는 방문으로 세지 않는다
    const first = members[0];
    const countryName = g.countryName ?? first.countryName ?? '';
    if (!countryName) continue;
    const countryFlag = g.countryFlag || first.countryFlag || '';
    events.push({
      countries: [{ name: countryName, flag: countryFlag }],
      year: yearOf(g.date ?? first.date ?? first.startDate),
      hasRegion: !!(g.regionName || members.some((m) => m.regionName)),
    });
  }

  // 카드 미소속 기록 폴백 — 기록 1건 = 방문 1회
  for (const r of byId.values()) {
    if (groupedIds.has(r.id)) continue;
    const countries =
      r.countries && r.countries.length > 0
        ? r.countries.map((c) => ({ name: c.name, flag: c.flag || '' }))
        : r.countryName
          ? [{ name: r.countryName, flag: r.countryFlag || '' }]
          : [];
    if (countries.length === 0) continue;
    events.push({ countries, year: yearOf(r.date ?? r.startDate), hasRegion: !!r.regionName });
  }

  return events;
}

/** 연도별 방문 횟수 — 이벤트(카드) 단위. 날짜 없는 이벤트는 제외 */
export function yearlyCountsFromEvents(events: VisitEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of events) {
    if (!e.year) continue;
    out[e.year] = (out[e.year] || 0) + 1;
  }
  return out;
}

/** 연평균 방문 — 기록이 있는 연도들의 평균 (기존 activeYearAverage와 같은 정의, 단위만 카드) */
export function activeYearAverageFromEvents(events: VisitEvent[]): string {
  const counts = yearlyCountsFromEvents(events);
  const years = Object.keys(counts);
  if (years.length === 0) return '0.0';
  const total = years.reduce((a, y) => a + counts[y], 0);
  return (total / years.length).toFixed(1);
}
