// 선택한 국가에 이미 기록된 날짜 집합 — 기간 선택 캘린더에 "기록 있음" 점 표시용.
// 같은 여행에 기록을 추가할 때 기존 기록의 기간을 한눈에 보고 날짜를 맞출 수 있게 한다.
import type { TravelRecord } from '../store/recordStore';

// 'YYYY.MM.DD' / 'YYYY-MM-DD' → 로컬 자정 Date.
// new Date('YYYY-MM-DD')는 UTC 자정 해석이라 미주 등에서 하루 밀린다 — 직접 파싱한다.
const parseLocal = (s?: string): Date | null => {
  if (!s) return null;
  const m = s.match(/^(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
};

const pad = (n: number) => String(n).padStart(2, '0');
/** 캘린더 셀 키와 동일한 'YYYY-MM-DD' 포맷 */
export const toRecordedDateKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// '한국'(구버전 표기) ↔ '대한민국'(표준) 별칭 — 기록에 두 표기가 섞여 있어 함께 매칭
const withAliases = (names: string[]): Set<string> => {
  const set = new Set(names);
  if (set.has('대한민국') || set.has('한국')) { set.add('대한민국'); set.add('한국'); }
  return set;
};

/**
 * 주어진 국가들에 대한 기존 기록의 날짜 키('YYYY-MM-DD') 집합.
 * @param countryNames 필터할 국가명 — null이면 국가 구별 없이 전체 기록 대상. []는 빈 집합(기존 호환)
 * @param excludeId 편집 중인 기록 id — 자기 자신의 기간은 표시하지 않음
 */
export function collectRecordedDateKeys(
  records: TravelRecord[],
  countryNames: string[] | null,
  excludeId?: string,
): Set<string> {
  const out = new Set<string>();
  if (countryNames !== null && countryNames.length === 0) return out;
  const names = countryNames !== null ? withAliases(countryNames) : null;
  for (const r of records) {
    if (excludeId && r.id === excludeId) continue;
    if (r.isMyPost === false || r.isDraft) continue; // 타인 게시물·임시저장 제외
    if (names) {
      const match = names.has(r.countryName) || !!r.countries?.some(c => names.has(c.name));
      if (!match) continue;
    }
    const start = parseLocal(r.startDate) ?? parseLocal(r.date);
    const end = parseLocal(r.endDate) ?? start;
    if (!start || !end) continue;
    const days = Math.round((end.getTime() - start.getTime()) / 86400000);
    if (days < 0 || days > 400) continue; // 비정상 기간 방어 (역순·연 단위 초과)
    for (let i = 0; i <= days; i++) {
      out.add(toRecordedDateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
    }
  }
  return out;
}

/**
 * 밴드(기존 여행) 한 칸의 메타 — 탭 동기화(그 날의 대표 여행)에서 사용.
 * 겹치는 날은 가장 늦게 끝나는 여행(=그 날 시작하거나 계속되는 쪽)이 맵 값이고, 나머지는 others.
 * 그리기는 이 맵을 칸마다 읽지 않고 `layoutBandRuns`가 행 단위 조각으로 바꾼 것을 쓴다.
 */
export type RecordedRange = {
  start: Date; end: Date; recordId: string; countryLabel: string;
  others?: RecordedRange[];
};

/** 기록의 국가 라벨 — 단일이면 국가명, 다국가면 '일본 외 2' */
const countryLabelOf = (r: TravelRecord): string => {
  const names = (r.countries?.map(c => c.name).filter(Boolean) as string[] | undefined) ?? [];
  if (names.length === 0 && r.countryName) names.push(r.countryName);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names[0]} 외 ${names.length - 1}`;
};

/**
 * 기록이 있는 날 → 그 날을 덮는 여행 맵('YYYY-MM-DD' → RecordedRange).
 * 국가 구별 없음. 겹치는 날은 가장 늦게 끝나는 여행(같으면 늦게 시작한 것)이 맵 값, 나머지는 `others`.
 * 인수인계 날(스페인이 끝나고 포르투갈이 시작)에 탭하면 시작하는 쪽이 선택된다.
 */
export function collectRecordedRanges(
  records: TravelRecord[],
  excludeId?: string,
): Map<string, RecordedRange> {
  const metas: RecordedRange[] = [];
  for (const r of records) {
    if (excludeId && r.id === excludeId) continue;
    if (r.isMyPost === false || r.isDraft) continue;
    const start = parseLocal(r.startDate) ?? parseLocal(r.date);
    const end = parseLocal(r.endDate) ?? start;
    if (!start || !end) continue;
    const days = Math.round((end.getTime() - start.getTime()) / 86400000);
    if (days < 0 || days > 400) continue;
    metas.push({ start, end, recordId: r.id, countryLabel: countryLabelOf(r) });
  }
  const perDay = new Map<string, RecordedRange[]>();
  for (const m of metas) {
    const days = Math.round((m.end.getTime() - m.start.getTime()) / 86400000);
    for (let i = 0; i <= days; i++) {
      const key = toRecordedDateKey(new Date(m.start.getFullYear(), m.start.getMonth(), m.start.getDate() + i));
      const list = perDay.get(key) ?? [];
      list.push(m);
      perDay.set(key, list);
    }
  }
  const out = new Map<string, RecordedRange>();
  for (const [key, list] of perDay) {
    list.sort((a, b) => b.end.getTime() - a.end.getTime() || b.start.getTime() - a.start.getTime());
    const [top, ...rest] = list;
    out.set(key, rest.length ? { ...top, others: rest } : top);
  }
  return out;
}

/**
 * 달력 한 달 격자 위에 그릴 알약(캡슐) 조각 — 같은 여행이 주(행)를 넘으면 행마다 하나.
 * 디자인(2026-09-14 시안): 알약은 칸 폭을 꽉 채우고, 조각마다 국가 칩을 가운데 위에 얹으며,
 * 겹치는 날은 두 알약을 그대로 겹쳐 그린다(줄 나눔·반 분할 없음). tripIndex는 칩 색 번갈아 쓰기용.
 */
export type BandRun = {
  recordId: string;
  countryLabel: string;
  row: number;
  startCol: number;
  endCol: number;
  /** 시작일 순 여행 번호(0부터) — 칩 색을 번갈아 준다. 늦게 시작한 여행이 위에 그려진다 */
  tripIndex: number;
};

export function layoutBandRuns(grid: (Date | null)[], ranges: Map<string, RecordedRange>): BandRun[] {
  const byId = new Map<string, RecordedRange>();
  const put = (r: RecordedRange) => { if (!byId.has(r.recordId)) byId.set(r.recordId, r); };
  for (const r of ranges.values()) { put(r); r.others?.forEach(put); }
  const trips = [...byId.values()].sort((a, b) =>
    a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime() || a.recordId.localeCompare(b.recordId));
  const runs: BandRun[] = [];
  const rows = Math.ceil(grid.length / 7);
  // tripIndex는 **이 달에 보이는** 여행끼리 매긴다 — 전체 이력 기준이면 한 달에 여행이 하나뿐인데도 두 번째 색이 나온다
  const indexOf = new Map<string, number>();
  for (let row = 0; row < rows; row++) {
    const cells = grid.slice(row * 7, row * 7 + 7);
    for (const t of trips) {
      const s = toRecordedDateKey(t.start), e = toRecordedDateKey(t.end);
      let startCol = -1;
      let endCol = -1;
      cells.forEach((d, col) => {
        if (!d) return;
        const k = toRecordedDateKey(d);
        if (k < s || k > e) return; // 키는 0 패딩 ISO라 문자열 비교 = 날짜 순서
        if (startCol < 0) startCol = col;
        endCol = col;
      });
      if (startCol < 0) continue;
      if (!indexOf.has(t.recordId)) indexOf.set(t.recordId, indexOf.size);
      runs.push({ recordId: t.recordId, countryLabel: t.countryLabel, row, startCol, endCol, tripIndex: indexOf.get(t.recordId)! });
    }
  }
  return runs;
}
