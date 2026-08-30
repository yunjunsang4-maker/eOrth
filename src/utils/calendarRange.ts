/**
 * 달력(CalendarBottomSheet) 순수 계산.
 *
 * 화면 컴포넌트 안에 흩어져 있던 날짜 계산을 여기로 모은다 — 검증 파일이 붙을 수 있는
 * 단위가 되고, 달력을 쓰는 화면(기록·스트립·블로그·사진첩)이 같은 규칙을 공유한다.
 *
 * 규칙: 이 파일의 함수는 **'날짜'만** 본다. 시:분:초와 표준시 변화(DST)를 타지 않도록
 * 비교·차이 계산은 전부 연/월/일로 환산한 뒤 수행한다.
 */

/** 로컬 시각 기준 'YYYY-MM-DD'. 문자열 사전순 비교가 곧 날짜 순서가 된다. */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 같은 '날'인가 — 시각은 무시한다 */
export function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

/** a가 b보다 이전 '날'인가 — 같은 날이면 false */
export function isBeforeDay(a: Date, b: Date): boolean {
  return toDateKey(a) < toDateKey(b);
}

/**
 * 6주(42칸) 고정 달력 그리드. 앞부분은 1일의 요일만큼 null로 채우고, 뒤는 42칸까지 null 패딩.
 *
 * 왜 항상 42칸인가: 월마다 4~6주로 달라지면 월을 넘길 때 시트 높이가 출렁인다.
 * (month는 0-based — JS Date와 같은 기준)
 */
export function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    date.setHours(0, 0, 0, 0);
    cells.push(date);
  }
  while (cells.length < 42) cells.push(null);
  return cells;
}

/** 그 달의 일수 */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * delta 개월 이동. 연 경계를 알아서 넘긴다(12월+1 → 다음 해 1월).
 * 여러 달을 한 번에 건너뛰는 경우(연·월 점프)도 같은 함수로 처리한다.
 */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/**
 * 두 날짜 사이 '박' 수. 같은 날이면 0, 시작이 종료보다 뒤면 0.
 *
 * UTC 자정끼리 빼는 이유: 로컬 밀리초로 빼면 서머타임이 있는 지역에서 하루가
 * 23시간/25시간이 되어 반올림이 어긋난다(해외여행 앱이라 실제로 걸린다).
 */
export function nightsBetween(start: Date, end: Date): number {
  const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const b = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** 여행 길이 — n박 (n+1)일. 헤더의 "3박 4일" 요약에 쓴다 */
export function tripLength(start: Date, end: Date): { nights: number; days: number } {
  const nights = nightsBetween(start, end);
  return { nights, days: nights + 1 };
}
