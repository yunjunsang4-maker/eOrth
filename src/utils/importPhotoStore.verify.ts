// 실행: npx tsx src/utils/importPhotoStore.verify.ts
import { tripDir, tripPhotoPath, runWithConcurrency, compactCopyResults } from './importPhotoStore';

let failures = 0;
function assert(c: boolean, m: string) { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } }

// 경로 헬퍼는 base를 인자로 받아 순수하게 동작(파일시스템 접근 없음)
{
  const base = 'file:///app/docs/';
  assert(tripDir(base, 'trip-x') === 'file:///app/docs/trips/trip-x/', 'tripDir 경로');
  assert(tripPhotoPath(base, 'trip-x', 0) === 'file:///app/docs/trips/trip-x/0.jpg', '사진 경로 0');
  assert(tripPhotoPath(base, 'trip-x', 12) === 'file:///app/docs/trips/trip-x/12.jpg', '사진 경로 12');
}

// ── compactCopyResults: 병렬 복사 결과의 순서 보존 ──
{
  const r = compactCopyResults(['a.jpg', null, 'c.jpg', null, 'e.jpg']);
  assert(JSON.stringify(r.uris) === JSON.stringify(['a.jpg', 'c.jpg', 'e.jpg']), '실패 장을 걸러도 원본 순서 유지');
  assert(JSON.stringify(r.srcIndexes) === JSON.stringify([0, 2, 4]), 'srcIndexes가 원본 인덱스를 가리킴');
  assert(r.firstItemCopied === true, '커버(0번) 성공 표시');

  const noCover = compactCopyResults([null, 'b.jpg']);
  assert(noCover.firstItemCopied === false, '커버 실패 시 false (커버 크롭 오굽기 방지)');
  assert(noCover.uris[0] === 'b.jpg' && noCover.srcIndexes[0] === 1, '커버 실패해도 나머지는 보존');

  assert(compactCopyResults([]).uris.length === 0, '빈 입력 안전');
  assert(compactCopyResults([null, null]).firstItemCopied === false, '전부 실패 안전');
}

// ── runWithConcurrency: 전량 처리 + 동시 실행 상한 ──
(async () => {
  const N = 50;
  const LIMIT = 4;
  const seen: number[] = [];
  let inFlight = 0;
  let peak = 0;
  await runWithConcurrency(N, LIMIT, async (i) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((res) => setTimeout(res, (i % 3) + 1)); // 제각각인 소요 시간
    seen.push(i);
    inFlight--;
  });
  assert(seen.length === N, `모든 항목 처리(${seen.length}/${N})`);
  assert(new Set(seen).size === N, '중복 처리 없음');
  assert(peak <= LIMIT, `동시 실행 상한 준수(peak=${peak} <= ${LIMIT})`);

  let calls = 0;
  await runWithConcurrency(0, 4, async () => { calls++; });
  assert(calls === 0, '개수 0이면 실행 없음');
  await runWithConcurrency(2, 99, async () => { calls++; });
  assert(calls === 2, 'limit이 개수보다 커도 정확히 개수만큼');

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
