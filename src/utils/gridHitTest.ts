/**
 * 고정 격자(grid) 좌표 → 아이템 인덱스 (순수 로직, 테스트 대상)
 *
 * 사진 선택 그리드의 드래그 다중선택에서 쓴다. 셀 크기·열 수·여백이 모두 상수라
 * 손가락 좌표를 인덱스로 바꾸는 데 레이아웃 측정이 필요 없다 — 계산으로 떨어진다.
 *
 * 좌표계: 리스트(FlatList) 좌상단 기준. GestureDetector는 뷰를 추가하지 않고 자식에
 * 붙으므로 제스처 이벤트의 x/y가 곧 이 좌표다. 세로만 scrollY를 더해 콘텐츠 좌표로 만든다.
 */

export interface GridGeometry {
  /** 셀 한 변(px) — 정사각형 가정 */
  cell: number;
  /** 셀 사이 간격(px). 가로·세로 동일 가정 */
  gap: number;
  /** 콘텐츠 컨테이너 안쪽 여백(px). 좌·상 동일 가정 */
  padding: number;
  /** 열 수 */
  columns: number;
  /** 전체 아이템 수 — 마지막 줄의 빈칸을 걸러내는 데 쓴다 */
  count: number;
}

/**
 * 좌표에 있는 아이템 인덱스. 아이템이 없는 지점이면 null.
 *
 * null을 주는 경우는 셋이다.
 *   · 여백(padding) 안쪽 — 첫 셀보다 위/왼쪽
 *   · 셀 사이 간격(gap) 위 — 어느 셀도 아니다
 *   · 격자 범위 밖 또는 마지막 줄 빈칸
 *
 * 드래그 중 gap을 지나갈 때 null이 나오는데, 호출부는 이때 '직전 인덱스를 유지'하면 된다.
 * (가장 가까운 셀로 끌어붙이면 손가락이 닿지도 않은 옆 셀이 선택된다)
 */
export function indexAtPoint(x: number, y: number, scrollY: number, g: GridGeometry): number | null {
  if (g.cell <= 0 || g.columns <= 0) return null;
  const stride = g.cell + g.gap;
  const cx = x - g.padding;
  const cy = y + scrollY - g.padding;
  if (cx < 0 || cy < 0) return null;

  const col = Math.floor(cx / stride);
  const row = Math.floor(cy / stride);
  if (col < 0 || col >= g.columns || row < 0) return null;

  // 셀 안쪽인지 — stride 안에서 cell을 넘어간 부분은 gap이다
  if (cx - col * stride > g.cell) return null;
  if (cy - row * stride > g.cell) return null;

  const index = row * g.columns + col;
  if (index < 0 || index >= g.count) return null;
  return index;
}

/** 두 인덱스 사이의 닫힌 구간 [start, end] (순서 무관) */
export function rangeBetween(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a];
}
