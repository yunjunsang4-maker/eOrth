// 과거여행 스캔 샘플링 순수 로직 검증 (jest 미사용). 실행: npx tsx src/utils/scanSampling.verify.ts
import {
  bucketRanges,
  probeOrder,
  segmentsFromProbes,
  fillCountries,
  nextBoundaryProbe,
  collectImportedAssetIds,
  excludeImported,
  overlapsImportedTrip,
  geocodeWaitMs,
  GEOCODE_MIN_GAP_MS,
  BUCKET_MS,
  type ProbePoint,
} from './scanSampling';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const a = (t: number) => ({ creationTime: t });

// ── bucketRanges ──
{
  assert(bucketRanges([]).length === 0, '빈 배열 → 버킷 없음');

  const one = bucketRanges([a(0)]);
  assert(one.length === 1 && one[0].start === 0 && one[0].end === 1, '사진 1장 → 버킷 1개');

  // 같은 12시간 안 3장 → 버킷 1개
  const same = bucketRanges([a(0), a(2 * HOUR), a(11 * HOUR)]);
  assert(same.length === 1 && same[0].end === 3, '같은 버킷 안 3장 → 버킷 1개');

  // 12시간 경계를 넘으면 새 버킷
  const split = bucketRanges([a(0), a(11 * HOUR), a(13 * HOUR)]);
  assert(split.length === 2 && split[0].end === 2 && split[1].start === 2, '12시간 초과 → 버킷 분리');

  // 사진이 없는 긴 공백 — 빈 버킷을 만들지 않는다(3년 공백이어도 버킷 2개)
  const gap = bucketRanges([a(0), a(1000 * DAY)]);
  assert(gap.length === 2, '긴 공백에도 빈 버킷 없음(2개)');

  // 버킷 수는 기간에 비례, 사진 수와 무관 — 하루 200장 × 10일
  const many: { creationTime: number }[] = [];
  for (let d = 0; d < 10; d++) for (let k = 0; k < 200; k++) many.push(a(d * DAY + k * 60 * 1000));
  const mb = bucketRanges(many, BUCKET_MS);
  assert(many.length === 2000 && mb.length <= 20, `사진 2000장 → 버킷 ${mb.length}개(≤20, 기간 비례)`);
  assert(mb[mb.length - 1].end === 2000, '마지막 버킷이 배열 끝까지 덮음');
}

// ── probeOrder ──
{
  assert(probeOrder(0, 0).length === 0, '빈 구간 → 탐침 없음');
  assert(JSON.stringify(probeOrder(0, 1)) === JSON.stringify([0]), '1장 → 자기 자신만');
  assert(JSON.stringify(probeOrder(0, 2)) === JSON.stringify([0, 1]), '2장 → 중복 없이 2개');
  const p = probeOrder(10, 20);
  assert(p.length === 3 && p[0] === 10 && p[1] === 19 && p[2] === 15, '첫 장 → 마지막 장 → 가운데 순');
  assert(new Set(p).size === p.length, '탐침 인덱스 중복 없음');
  assert(p.every((i) => i >= 10 && i < 20), '탐침이 구간 밖으로 안 나감');
  assert(probeOrder(0, 100, 1).length === 1, 'max로 개수 제한');
}

// ── segmentsFromProbes ──
{
  assert(segmentsFromProbes([], 10).length === 0, '탐침 없음 → 구간 없음');
  assert(segmentsFromProbes([{ index: 0, code: null }], 10).length === 0, '전부 미상 → 구간 없음');

  // 단일 국가 — 전 구간을 덮는다
  const single = segmentsFromProbes([{ index: 3, code: 'KR' }], 10);
  assert(single.length === 1 && single[0].start === 0 && single[0].end === 10, '단일 국가 → 전체 구간');

  // 전환 — 중간에 경계
  const two = segmentsFromProbes([{ index: 0, code: 'KR' }, { index: 10, code: 'JP' }], 20);
  assert(two.length === 2 && two[0].code === 'KR' && two[1].code === 'JP', '2국가 → 구간 2개');
  assert(two[0].end === two[1].start, '구간이 빈틈없이 이어짐');
  assert(two[1].end === 20, '마지막 구간이 끝까지');

  // 이분 탐색으로 붙은 탐침(9,10) → 경계가 정확히 10
  const tight = segmentsFromProbes([{ index: 9, code: 'KR' }, { index: 10, code: 'JP' }], 20);
  assert(tight[0].end === 10 && tight[1].start === 10, '인접 탐침 → 경계 정확');

  // 미상 탐침은 앞 국가가 이어진 것으로 무시
  const withNull = segmentsFromProbes(
    [{ index: 0, code: 'JP' }, { index: 5, code: null }, { index: 9, code: 'JP' }],
    10
  );
  assert(withNull.length === 1 && withNull[0].code === 'JP', '미상 탐침은 구간을 쪼개지 않음');

  // 같은 국가 연속 → 병합
  const merged = segmentsFromProbes(
    [{ index: 0, code: 'JP' }, { index: 3, code: 'JP' }, { index: 6, code: 'JP' }],
    9
  );
  assert(merged.length === 1, '같은 국가 연속 → 1개로 병합');

  // 정렬되지 않은 탐침도 처리
  const unsorted = segmentsFromProbes([{ index: 10, code: 'JP' }, { index: 0, code: 'KR' }], 20);
  assert(unsorted[0].code === 'KR' && unsorted[1].code === 'JP', '탐침 순서가 뒤섞여도 정렬 처리');

  // 3국 연속 (한국 → 일본 → 대만)
  const three = segmentsFromProbes(
    [{ index: 0, code: 'KR' }, { index: 10, code: 'JP' }, { index: 20, code: 'TW' }],
    30
  );
  assert(three.length === 3 && three.map((s) => s.code).join(',') === 'KR,JP,TW', '3국 연속 구간');
}

// ── fillCountries ──
{
  const segs = segmentsFromProbes([{ index: 0, code: 'KR' }, { index: 10, code: 'JP' }], 12);
  const filled = fillCountries(12, segs);
  assert(filled.length === 12, '자산 수만큼 반환');
  assert(filled[0] === 'KR' && filled[11] === 'JP', '앞은 KR, 뒤는 JP');
  assert(filled.every((c) => c !== null), 'GPS 없던 사진도 구간 국가를 물려받음');

  // 구간이 전체를 못 덮는 경우 null 유지
  const partial = fillCountries(5, [{ start: 1, end: 3, code: 'JP' }]);
  assert(partial[0] === null && partial[1] === 'JP' && partial[2] === 'JP' && partial[3] === null, '구간 밖은 null');

  // 범위를 넘는 구간도 안전
  const over = fillCountries(3, [{ start: 0, end: 99, code: 'JP' }]);
  assert(over.length === 3 && over.every((c) => c === 'JP'), '구간 end가 total을 넘어도 안전');
}

// ── nextBoundaryProbe (이분 탐색) ──
{
  assert(nextBoundaryProbe(0, 1) === null, '인접하면 더 좁힐 곳 없음');
  assert(nextBoundaryProbe(0, 2) === 1, '중간 인덱스');
  assert(nextBoundaryProbe(0, 100) === 50, '중간 인덱스(큰 구간)');

  // 실제 수렴 시나리오: 0..63 사이 어딘가에서 KR→JP 전환(정답 37)
  const TRUTH = 37;
  let lo = 0, hi = 63, steps = 0;
  while (true) {
    const mid = nextBoundaryProbe(lo, hi);
    if (mid == null) break;
    steps++;
    if (mid < TRUTH) lo = mid; else hi = mid;
    if (steps > 20) break;
  }
  assert(hi === TRUTH, `이분 탐색이 정확한 경계로 수렴(${hi})`);
  assert(steps <= 6, `64구간을 ${steps}회로 좁힘(≤6)`);
}

// ── 통합 시나리오: 국내 → 일본 5일 → 국내 (실내 사진 다수 포함) ──
{
  const assets: { creationTime: number; truth: string }[] = [];
  for (let d = 0; d < 5; d++) for (let k = 0; k < 30; k++) assets.push({ creationTime: d * DAY + k * 20 * 60 * 1000, truth: 'KR' });
  const tripStart = assets.length;
  for (let d = 5; d < 10; d++) for (let k = 0; k < 30; k++) assets.push({ creationTime: d * DAY + k * 20 * 60 * 1000, truth: 'JP' });
  const tripEnd = assets.length;
  for (let d = 10; d < 15; d++) for (let k = 0; k < 30; k++) assets.push({ creationTime: d * DAY + k * 20 * 60 * 1000, truth: 'KR' });

  // 버킷마다 첫 장만 탐침 — 단, 3장 중 1장만 GPS가 있다고 가정(나머지는 실내)
  const buckets = bucketRanges(assets);
  const probes: ProbePoint[] = [];
  let calls = 0;
  for (const b of buckets) {
    for (const idx of probeOrder(b.start, b.end)) {
      calls++;
      const hasGps = idx % 3 === 0; // 3장 중 1장만 좌표 있음
      if (hasGps) { probes.push({ index: idx, code: assets[idx].truth }); break; }
      probes.push({ index: idx, code: null });
    }
  }
  const segs = segmentsFromProbes(probes, assets.length);
  const filled = fillCountries(assets.length, segs);

  const wrong = filled.filter((c, i) => c !== assets[i].truth).length;
  assert(calls < assets.length / 5, `좌표 조회 ${calls}회 / 사진 ${assets.length}장 (5분의 1 미만)`);
  assert(filled.every((c) => c !== null), '전 사진에 국가가 채워짐(실내 사진 포함)');
  // 경계는 탐침 간 중간으로 잡히므로 전환 지점 주변 반 버킷 정도 오차 허용
  assert(wrong <= 30, `경계 오차 ${wrong}장 (반 버킷 이내)`);
  const jpRun = filled.filter((c) => c === 'JP').length;
  assert(jpRun >= 120 && jpRun <= 180, `일본 구간 ${jpRun}장 (실제 150장 근처)`);
  // 여행 구간이 통째로 잡혔는지 — 중앙부는 반드시 JP
  assert(filled[tripStart + 75] === 'JP' && filled[(tripStart + tripEnd) / 2] === 'JP', '여행 중앙부는 확실히 JP');
}

// -- 중복 방지: 이미 가져온 자산 제외 --
{
  const recs: { mediaAssetIds?: Record<string, string> }[] = [
    { mediaAssetIds: { 'file://a.jpg': 'asset-1', 'file://b.jpg': 'asset-2' } },
    { mediaAssetIds: undefined },
    { mediaAssetIds: { 'file://c.jpg': 'asset-3' } },
  ];
  const ids = collectImportedAssetIds(recs);
  assert(ids.size === 3 && ids.has('asset-1') && ids.has('asset-3'), '기록에서 가져온 자산 id 수집');
  assert(collectImportedAssetIds([]).size === 0, '기록 없으면 빈 집합');

  const assets = [{ id: 'asset-1' }, { id: 'asset-9' }, { id: 'asset-3' }];
  const left = excludeImported(assets, ids);
  assert(left.length === 1 && left[0].id === 'asset-9', '이미 가져온 자산은 스캔 대상에서 제외');
  assert(excludeImported(assets, new Set<string>()) === assets, '제외 대상 없으면 원본 그대로(복사 없음)');
}

// -- 중복 방지: 기간 겹침 2차 방어선 --
{
  const imported = [{ countryName: '일본', startDate: '2026.03.01', endDate: '2026.03.07' }];
  const hit = { countryName: '일본', startDate: '2026.03.05', endDate: '2026.03.10' };
  assert(overlapsImportedTrip(hit, imported) === true, '같은 국가 + 기간 겹침 → 이미 가져옴');

  const other = { countryName: '일본', startDate: '2026.05.01', endDate: '2026.05.05' };
  assert(overlapsImportedTrip(other, imported) === false, '같은 국가라도 기간이 안 겹치면 새 여행');

  const diffCountry = { countryName: '대만', startDate: '2026.03.02', endDate: '2026.03.06' };
  assert(overlapsImportedTrip(diffCountry, imported) === false, '기간이 겹쳐도 국가가 다르면 새 여행');

  const touching = { countryName: '일본', startDate: '2026.03.07', endDate: '2026.03.09' };
  assert(overlapsImportedTrip(touching, imported) === true, '하루만 걸쳐도 겹침으로 판정');

  const oneDay = [{ countryName: '일본', startDate: '2026.03.01', endDate: undefined }];
  assert(overlapsImportedTrip({ countryName: '일본', startDate: '2026.03.01', endDate: '2026.03.01' }, oneDay) === true, '종료일 없는 기록은 시작일 하루로 취급');

  assert(overlapsImportedTrip({ countryName: '일본', startDate: 'bad', endDate: 'bad' }, imported) === false, '날짜 형식이 아니면 겹침 판정 안 함');
  assert(overlapsImportedTrip(hit, []) === false, '가져온 기록이 없으면 항상 false');
}
// -- 지오코딩 레이트리밋: 경과 시간 기준 대기 --
{
  const G = GEOCODE_MIN_GAP_MS;
  assert(geocodeWaitMs(0, 10_000) === 0, '첫 호출(lastCallAt=0)은 대기 없음');
  assert(geocodeWaitMs(1_000, 1_000 + G) === 0, '간격이 정확히 채워졌으면 대기 없음');
  assert(geocodeWaitMs(1_000, 1_000 + G + 5_000) === 0, '한참 지났으면 대기 없음');
  assert(geocodeWaitMs(1_000, 1_000) === G, '즉시 연속 호출은 간격 전체를 대기');
  assert(geocodeWaitMs(1_000, 1_100) === G - 100, '일부만 지났으면 남은 만큼만 대기');
  // 시계가 뒤로 간 경우(사용자 수동 변경) — 과소 대기로 레이트리밋을 뚫지 않게 전체 대기
  assert(geocodeWaitMs(5_000, 1_000) === G, '경과가 음수면 간격 전체를 대기');
  assert(geocodeWaitMs(1_000, 1_050, 100) === 50, 'minGapMs 인자를 따른다');
}

console.log(failures === 0 ? '\n모든 검증 통과' : `\n실패 ${failures}건`);
if (failures > 0) process.exitCode = 1;
