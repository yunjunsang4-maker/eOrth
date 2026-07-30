// src/utils/scanProfiler.verify.ts
import { ScanProfiler } from './scanProfiler';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// 가짜 시계 — 계측 결과가 결정적으로 나오게
const clock = () => { let t = 0; return { now: () => t, tick: (ms: number) => { t += ms; } }; };

// 1. 구간 하나 측정
{
  const c = clock();
  const p = new ScanProfiler(c.now);
  const end = p.begin('페이지네이션');
  c.tick(300);
  end(3);
  c.tick(100); // 구간 밖 시간도 총계에는 포함
  const r = p.report();
  eq(r.totalMs, 400, '총 시간은 생성~report 전체');
  eq(r.rows[0], { label: '페이지네이션', ms: 300, count: 3, pct: 75, avgMs: 100 }, '구간 ms·건수·비율·평균');
}

// 2. 같은 라벨 누적 — 반복 호출을 한 줄로 합친다
{
  const c = clock();
  const p = new ScanProfiler(c.now);
  for (const ms of [100, 200, 300]) { const e = p.begin('좌표조회'); c.tick(ms); e(); }
  const r = p.report();
  eq(r.rows.length, 1, '같은 라벨은 한 줄로 누적');
  eq([r.rows[0].ms, r.rows[0].count, r.rows[0].avgMs], [600, 3, 200], '누적 ms·건수·평균');
}

// 3. 라벨 순서 보존 — 보고서를 스캔 순서대로 읽게
{
  const c = clock();
  const p = new ScanProfiler(c.now);
  p.add('B', 10); p.add('A', 10); p.add('B', 10);
  eq(p.report().rows.map((x) => x.label), ['B', 'A'], '처음 등장한 순서 유지');
}

// 4. bump — 시간 없이 건수만 (캐시 히트 등)
{
  const c = clock();
  const p = new ScanProfiler(c.now);
  p.bump('캐시히트', 5);
  c.tick(100);
  const r = p.report();
  eq([r.rows[0].ms, r.rows[0].count, r.rows[0].avgMs], [0, 5, 0], 'bump은 건수만 센다');
}

// 5. 총 시간 0이어도 나눗셈이 깨지지 않는다
{
  const c = clock();
  const p = new ScanProfiler(c.now);
  p.bump('x', 1);
  eq(p.report().rows[0].pct, 0, '총 0ms에서 비율 0 (0으로 나누지 않음)');
}

// 6. 출력 형식 — 총계 줄 + 구간 줄
{
  const c = clock();
  const p = new ScanProfiler(c.now);
  const e = p.begin('지오코딩폴백'); c.tick(2500); e(10);
  const lines = p.formatLines();
  eq(lines.length, 2, '총계 1줄 + 구간 1줄');
  eq(lines[0], '[스캔 계측] 총 2.5초', '총계 줄');
  eq(lines[1].includes('지오코딩폴백') && lines[1].includes('100%') && lines[1].includes('10건'), true, '구간 줄에 라벨·비율·건수');
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
