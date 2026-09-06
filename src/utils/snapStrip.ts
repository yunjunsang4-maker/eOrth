// 소셜 탭 스냅 링 줄 정렬 — '내 스냅 +' 입구(2026-09-07)를 위해 내 대표 항목을 맨 앞에 둔다.
// 내 항목이 여러 개(나라별 대표)여도 하나만 옮긴다 — 배지는 맨 앞 하나에만 붙는다.
// 어느 하나인가: rank가 있으면 rank 최대(=가장 최신 timestamp), 없으면 배열 순서상 첫 번째.
// rank가 필요한 이유(QA F-1): snapItems는 모두 열람 상태면 오래된 순으로 재정렬되므로
// 배열 첫 번째를 집으면 방금 찍은 스냅이 아니라 가장 오래된 나라의 스냅이 앞에 온다.

/** 내 대표 항목 하나를 맨 앞으로(나머지 순서 유지). 없으면 같은 순서의 새 배열. 입력은 mutate하지 않는다. */
export function putMineFirst<T>(items: T[], isMine: (item: T) => boolean, rank?: (item: T) => number): T[] {
  let idx = -1;
  let best = -Infinity;
  items.forEach((it, i) => {
    if (!isMine(it)) return;
    const r = rank ? rank(it) : 0;
    // 동점이면 먼저 나온 것 유지(> 비교)
    if (idx < 0 || r > best) { idx = i; best = r; }
  });
  if (idx <= 0) return items.slice();
  return [items[idx], ...items.slice(0, idx), ...items.slice(idx + 1)];
}
