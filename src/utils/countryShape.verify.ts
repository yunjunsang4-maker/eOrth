// 나라 실루엣 감량 검증 — 감량한 패스가 원본 실루엣에 빈 곳을 내지 않는지.
// 회귀 사례: 점 수 상한 맞춘 일률 솎기가 미국 주 모서리·경계에 빈 틈을 냈다(2026-11-02, 미리보기 폭에서 1.57%).
import { buildCountryShape, buildSilhouettePaths } from './countryShape';

let failed = 0;
function ok(cond: boolean, label: string, detail = '') {
  console.log(`${cond ? '✓' : '✗'} ${label}`);
  if (!cond) { if (detail) console.log(`   ${detail}`); failed++; }
}
function inside(x: number, y: number, r: number[][]) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

console.log('▶ src/utils/countryShape.verify.ts');

// 팝업 미리보기와 같은 폭(≈302px). 1px 격자에서 '원본으로는 나라 안인데 감량 패스로는 밖'인 칸 비율.
for (const code of ['USA', 'KOR']) {
  const s = buildCountryShape(code)!;
  const w = 302, h = w * (s.dy / s.dx), k = w / s.dx;
  const full = s.rings.map(r => r.map(([x, y]) => [(x - s.minX) * k, (y - s.minY) * k]));
  const simp = buildSilhouettePaths(s, w, h).linePath.split('Z').map(seg => {
    const n = (seg.match(/-?[\d.]+/g) || []).map(Number);
    const r: number[][] = [];
    for (let i = 0; i + 1 < n.length; i += 2) r.push([n[i], n[i + 1]]);
    return r;
  }).filter(r => r.length >= 3);
  let inFull = 0, gap = 0;
  for (let x = 0.5; x < w; x++) for (let y = 0.5; y < h; y++) {
    if (!full.some(r => inside(x, y, r))) continue;
    inFull++;
    if (!simp.some(r => inside(x, y, r))) gap++;
  }
  const pct = (100 * gap) / inFull;
  ok(pct < 0.6, `${code}: 감량 실루엣의 빈 곳 0.6% 미만`, `실제 ${pct.toFixed(2)}%`);
}

if (failed > 0) { console.error(`✗ ${failed}개 실패`); process.exit(1); }
console.log('✅ 모든 검증 통과');
