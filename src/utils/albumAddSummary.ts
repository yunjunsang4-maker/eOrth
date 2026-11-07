/**
 * 사진첩(앨범) 사진 추가의 순수 로직 — TripRecordScreen에서 떼어 albumAddSummary.verify.ts로 검증한다.
 *  - dayKeyToDate: 날짜 줄 키 → 기간 사진 격자(DateRangePhotoSheet)에 넘길 그날 Date
 *  - summarizeAddedDays: 추가가 끝난 뒤 "N장을 3월 2일 외 1일에 넣었어요" 안내용 집계
 *
 * 날짜 키는 둘 다 'YYYY.MM.DD'다(utils/albumSections buildAlbumTimeline과 같은 기준 — 앨범 시간대, 없으면 기기 로컬).
 * new Date('YYYY-MM-DD')는 UTC 자정으로 읽혀 미주에서 하루 밀리므로 쓰지 않는다(dateRangePhotoPick 주석의 그 사고).
 */
import { dayKey } from './dateRangePhotoPick';

/**
 * 'YYYY.MM.DD' → 그 달력 날짜의 로컬 00:00 Date. 'undated'·형식 오류·없는 날짜(02.30)는 null.
 * 시간대 인자가 없는 이유: 키가 이미 앨범 시간대 날짜라, 돌려준 Date의 로컬 연·월·일·요일(getDay)이 곧 그 달력 날짜다.
 * 라벨(월·일·요일)은 이 값으로 만들고, 기간 격자는 이 Date의 로컬 날짜를 tz 하루로 다시 읽는다(dateRangePhotoPick dayRangeMs tz).
 */
export function dayKeyToDate(key: string | null | undefined): Date | null {
  const m = (key ?? '').match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  // Date는 2026.02.30을 3월 2일로 넘겨 버린다 — 되읽어 같은 날이 아니면 무효
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? dt : null;
}

/**
 * 이번에 담은 사진들의 촬영시각 → 들어간 날짜 키(오름차순, 중복 없음)와 시각 있는/없는 장수.
 * 키는 dayKey(타임라인과 같은 날짜 — tz는 타임라인에 넘긴 앨범 시간대와 같은 값) — 시각이 없거나 깨졌으면(0·음수·NaN) '날짜 미상'으로 센다.
 */
export function summarizeAddedDays(times: (number | null | undefined)[], tz?: string | null): { days: string[]; dated: number; undated: number } {
  const days = new Set<string>();
  let undated = 0;
  for (const ts of times) {
    const k = dayKey(ts, tz);
    if (k) days.add(k);
    else undated++;
  }
  return { days: [...days].sort(), dated: times.length - undated, undated };
}
