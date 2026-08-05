// src/utils/gridHitTest.verify.ts
// 사진 선택 그리드의 좌표 → 인덱스 변환 검증.
// 이게 어긋나면 드래그 다중선택이 '손가락이 닿지도 않은 사진'을 고른다 — 화면상 원인이 안 보인다.
import { indexAtPoint, rangeBetween, type GridGeometry } from './gridHitTest';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// ImportPhotoSelectScreen 과 같은 기하: 폭 390 기준 CELL = (390 - 32 - 16) / 3 = 114
const G: GridGeometry = { cell: 114, gap: 8, padding: 16, columns: 3, count: 10 };
const STRIDE = G.cell + G.gap; // 122

// ── 1) 각 셀 중앙이 자기 인덱스로 찍히는가 ──
{
  const hits: (number | null)[] = [];
  for (let i = 0; i < G.count; i++) {
    const row = Math.floor(i / G.columns), col = i % G.columns;
    const x = G.padding + col * STRIDE + G.cell / 2;
    const y = G.padding + row * STRIDE + G.cell / 2;
    hits.push(indexAtPoint(x, y, 0, G));
  }
  eq(hits, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], '셀 중앙 → 자기 인덱스');
}

// ── 2) 셀 경계(안쪽 끝)도 자기 셀로 인정 ──
{
  const x = G.padding + G.cell;      // 첫 셀의 오른쪽 끝
  const y = G.padding + G.cell;      // 첫 셀의 아래쪽 끝
  eq(indexAtPoint(x, y, 0, G), 0, '셀 경계(안쪽 끝)는 자기 셀');
}

// ── 3) 간격(gap) 위는 null — 가장 가까운 셀로 끌어붙이지 않는다 ──
{
  const gapX = G.padding + G.cell + G.gap / 2;   // 0열과 1열 사이
  const midY = G.padding + G.cell / 2;
  eq(indexAtPoint(gapX, midY, 0, G), null, '세로 간격 위 → null');

  const midX = G.padding + G.cell / 2;
  const gapY = G.padding + G.cell + G.gap / 2;   // 0행과 1행 사이
  eq(indexAtPoint(midX, gapY, 0, G), null, '가로 간격 위 → null');
}

// ── 4) 여백(padding) 안쪽은 null ──
{
  eq(indexAtPoint(4, 4, 0, G), null, '좌상단 여백 → null');
  eq(indexAtPoint(G.padding + G.cell / 2, 4, 0, G), null, '상단 여백 → null');
}

// ── 5) 열 범위 밖(오른쪽 빈 공간)은 null — 마지막 열 오른쪽을 4번째 열로 세면 안 된다 ──
{
  const x = G.padding + G.columns * STRIDE + 5;
  const y = G.padding + G.cell / 2;
  eq(indexAtPoint(x, y, 0, G), null, '열 범위 밖 → null');
}

// ── 6) 아이템 수를 넘는 칸(마지막 줄 빈칸)은 null ──
{
  // count=10 → 인덱스 10(4행 1열)은 빈칸
  const row = 3, col = 1;
  const x = G.padding + col * STRIDE + G.cell / 2;
  const y = G.padding + row * STRIDE + G.cell / 2;
  eq(indexAtPoint(x, y, 0, G), 10 < G.count ? 10 : null, '마지막 줄 빈칸 → null');
}

// ── 7) 스크롤 오프셋이 세로에만 더해지는가 ──
{
  // 0행이 화면 위로 한 줄 밀려 올라간 상태에서 화면 첫 줄은 1행(인덱스 3)이다
  const x = G.padding + G.cell / 2;
  const y = G.padding + G.cell / 2;
  eq(indexAtPoint(x, y, STRIDE, G), 3, '스크롤 1줄 → 화면 첫 줄이 1행');
  eq(indexAtPoint(x, y, 0, G), 0, '스크롤 0 → 화면 첫 줄이 0행');
}

// ── 8) 방어: 잘못된 기하는 조용히 null ──
{
  eq(indexAtPoint(50, 50, 0, { ...G, cell: 0 }), null, 'cell=0 → null');
  eq(indexAtPoint(50, 50, 0, { ...G, columns: 0 }), null, 'columns=0 → null');
  eq(indexAtPoint(50, 50, 0, { ...G, count: 0 }), null, 'count=0 → null');
}

// ── 9) rangeBetween 은 순서와 무관하게 [작은 값, 큰 값] ──
{
  eq(rangeBetween(2, 7), [2, 7], 'rangeBetween(2,7)');
  eq(rangeBetween(7, 2), [2, 7], 'rangeBetween(7,2) — 역방향 드래그');
  eq(rangeBetween(5, 5), [5, 5], 'rangeBetween(5,5) — 제자리');
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
