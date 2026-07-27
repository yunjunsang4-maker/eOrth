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

/** 밴드(기존 여행) 한 칸의 메타 — 캘린더 렌더링·탭 동기화에서 사용 */
export type RecordedRange = { start: Date; end: Date; recordId: string; countryLabel: string };

/** 기록의 국가 라벨 — 단일이면 국가명, 다국가면 '일본 외 2' */
const countryLabelOf = (r: TravelRecord): string => {
  const names = (r.countries?.map(c => c.name).filter(Boolean) as string[] | undefined) ?? [];
  if (names.length === 0 && r.countryName) names.push(r.countryName);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names[0]} 외 ${names.length - 1}`;
};

/**
 * 기록이 있는 날 → 그 기록의 전체 기간·recordId·국가라벨 맵('YYYY-MM-DD' → RecordedRange).
 * 국가 구별 없음. 겹치는 기록이 있으면 먼저 만난 기록을 유지한다.
 */
export function collectRecordedRanges(
  records: TravelRecord[],
  excludeId?: string,
): Map<string, RecordedRange> {
  const out = new Map<string, RecordedRange>();
  for (const r of records) {
    if (excludeId && r.id === excludeId) continue;
    if (r.isMyPost === false || r.isDraft) continue;
    const start = parseLocal(r.startDate) ?? parseLocal(r.date);
    const end = parseLocal(r.endDate) ?? start;
    if (!start || !end) continue;
    const days = Math.round((end.getTime() - start.getTime()) / 86400000);
    if (days < 0 || days > 400) continue;
    const meta: RecordedRange = { start, end, recordId: r.id, countryLabel: countryLabelOf(r) };
    for (let i = 0; i <= days; i++) {
      const key = toRecordedDateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
      if (!out.has(key)) out.set(key, meta);
    }
  }
  return out;
}
