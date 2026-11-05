/**
 * 사진첩(앨범) 사진 추가의 순수 로직 — TripRecordScreen에서 떼어 albumAddSummary.verify.ts로 검증한다.
 *  - dayKeyToDate: 날짜 줄 키 → 기간 사진 격자(DateRangePhotoSheet)에 넘길 그날 Date
 *  - summarizeAddedDays: 추가가 끝난 뒤 "N장을 3월 2일 외 1일에 넣었어요" 안내용 집계
 *
 * 날짜 키는 둘 다 기기 로컬 'YYYY.MM.DD'다(utils/albumSections buildAlbumTimeline과 같은 기준).
 * new Date('YYYY-MM-DD')는 UTC 자정으로 읽혀 미주에서 하루 밀리므로 쓰지 않는다(dateRangePhotoPick 주석의 그 사고).
 */
import { dayKey } from './dateRangePhotoPick';

/** 'YYYY.MM.DD'(로컬) → 그날 로컬 00:00 Date. 'undated'·형식 오류·없는 날짜(02.30)는 null */
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
 * 키는 dayKey(타임라인과 같은 로컬 날짜) — 시각이 없거나 깨졌으면(0·음수·NaN) '날짜 미상'으로 센다.
 */
export function summarizeAddedDays(times: (number | null | undefined)[]): { days: string[]; dated: number; undated: number } {
  const days = new Set<string>();
  let undated = 0;
  for (const ts of times) {
    const k = dayKey(ts);
    if (k) days.add(k);
    else undated++;
  }
  return { days: [...days].sort(), dated: times.length - undated, undated };
}
