// 여행 상세(TripDetailScreen)의 형식 행 정렬 규칙.
//
// 화면에서 떼어낸 이유는 이게 순수 함수라 검증 파일(tripDetailSort.verify.ts)로 규칙을 고정할
// 수 있어서다. 화면 안에 두면 컴포넌트 렌더 없이는 규칙을 확인할 길이 없다.

export type SortOrder = 'latest' | 'oldest';

/**
 * 형식 행(피드·블로그·스트립·스냅·사진첩)을 "그 형식의 가장 최근 기록 시각" 기준으로 정렬한다.
 *
 * - `latest`: 최근에 쓴 형식이 위 (내림차순)
 * - `oldest`: 먼저 쓴 형식이 위 (오름차순)
 * - 동률: `formatOrder`(FORMAT_ORDER) 순서로 떨어뜨린다. 하루짜리 여행처럼 timestamp가 같은
 *   기록만 있으면 정렬이 안정적이지 않으면 매 렌더 순서가 흔들린다 — 그걸 막는 타이브레이커다.
 *
 * timestamp가 없는 기록은 0으로 센다. 스토어는 생성 시 Date.now()를 넣지만 서버에서 받아온
 * 게스트 기록·옛 데이터에는 비어 있을 수 있다.
 *
 * 원본 배열은 건드리지 않는다(복사 후 정렬). 호출부의 `modules`는 매 렌더 파생되는 값이라
 * 제자리 정렬하면 같은 프레임 안에서 그 배열을 공유하는 다른 계산의 순서까지 바뀐다.
 */
export function sortFormatModules<T extends { vt: string; items: { timestamp?: number }[] }>(
  mods: T[],
  order: SortOrder,
  formatOrder: string[],
): T[] {
  const latestOf = (m: T) => m.items.reduce((max, r) => Math.max(max, r.timestamp ?? 0), 0);
  // 목록에 없는 형식은 맨 뒤로 — indexOf의 -1을 그대로 쓰면 오히려 맨 앞으로 올라온다
  const rank = (vt: string) => {
    const i = formatOrder.indexOf(vt);
    return i === -1 ? formatOrder.length : i;
  };
  return [...mods].sort((a, b) => {
    const diff = latestOf(a) - latestOf(b);
    if (diff !== 0) return order === 'latest' ? -diff : diff;
    return rank(a.vt) - rank(b.vt);
  });
}
