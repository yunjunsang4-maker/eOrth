// 순간 메모 ↔ 여행/작성화면 매칭 — 순수 함수 (스펙 ③·④의 매칭 규칙).
// 규칙: 국가·기간 둘 다 알면 AND, 국가만 알면 국가, 순간에 국가가 없으면(역지오코딩 실패) 기간만.
import { COUNTRIES } from '../constants/countries';
import type { TravelMoment } from '../store/momentStore';

const DAY_MS = 24 * 60 * 60 * 1000;
// 항공편·시차로 기록 날짜와 캡처 시각이 하루쯤 어긋날 수 있어 앞뒤 1일 여유
const TRIP_PAD_MS = DAY_MS;

// 한글 국가명 → ISO2 코드 (SnapDetector와 동일한 term 규칙)
export function countryNameToCode(name?: string | null): string | null {
  if (!name) return null;
  const c = COUNTRIES.find((k) => k.name === name);
  return c ? c.term.split(' ')[0].toUpperCase() : null;
}

// 'YYYY.MM.DD' 또는 'YYYY-MM-DD' → epoch ms (badgeRules.parseDate와 동일 규칙)
export function parseDotDate(s?: string | null): number | null {
  if (!s) return null;
  const t = new Date(s.replace(/\./g, '-')).getTime();
  return Number.isFinite(t) ? t : null;
}

// 여행 그룹에 속한 기록들의 날짜에서 [최소 시작, 최대 종료]를 뽑는다. 날짜가 하나도 없으면 null.
export function tripPeriodOf(
  records: { startDate?: string; endDate?: string; date?: string }[],
): { startMs: number; endMs: number } | null {
  let start: number | null = null;
  let end: number | null = null;
  for (const r of records) {
    const s = parseDotDate(r.startDate) ?? parseDotDate(r.date);
    const e = parseDotDate(r.endDate) ?? s;
    if (s != null && (start == null || s < start)) start = s;
    if (e != null && (end == null || e > end)) end = e;
  }
  return start != null && end != null ? { startMs: start, endMs: end } : null;
}

export interface MomentMatchQuery {
  countryCode?: string | null; // ISO2 (없으면 국가 무시)
  startMs?: number | null;
  endMs?: number | null;
}

export function matchMoments(moments: TravelMoment[], q: MomentMatchQuery): TravelMoment[] {
  return moments.filter((m) => {
    const bothCodes = !!m.countryCode && !!q.countryCode;
    const codeOk = bothCodes && m.countryCode!.toUpperCase() === q.countryCode!.toUpperCase();
    const hasPeriod = q.startMs != null && q.endMs != null;
    const dateOk =
      hasPeriod &&
      m.createdAt >= (q.startMs as number) - TRIP_PAD_MS &&
      m.createdAt <= (q.endMs as number) + TRIP_PAD_MS;
    if (bothCodes && hasPeriod) return codeOk && dateOk;
    if (bothCodes) return codeOk;   // 기간 정보 없음 → 국가만
    if (hasPeriod) return dateOk;   // 국가 정보 없는 순간 → 날짜 겹칠 때만 (스펙 ④)
    return false;
  });
}
