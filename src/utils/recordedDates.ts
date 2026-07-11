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
 * @param excludeId 편집 중인 기록 id — 자기 자신의 기간은 표시하지 않음
 */
export function collectRecordedDateKeys(
  records: TravelRecord[],
  countryNames: string[],
  excludeId?: string,
): Set<string> {
  const out = new Set<string>();
  if (countryNames.length === 0) return out;
  const names = withAliases(countryNames);
  for (const r of records) {
    if (excludeId && r.id === excludeId) continue;
    if (r.isMyPost === false || r.isDraft) continue; // 타인 게시물·임시저장 제외
    const match = names.has(r.countryName) || !!r.countries?.some(c => names.has(c.name));
    if (!match) continue;
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
