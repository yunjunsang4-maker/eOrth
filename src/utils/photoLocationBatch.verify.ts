// 네이티브 좌표 배치 조회 순수 로직 검증 (jest 미사용).
import {
  chunkIds,
  isUsableLatLon,
  normalizeLocations,
  fetchLocationsInBatches,
  LOCATION_BATCH_SIZE,
} from './photoLocationBatch';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failures++; console.error(`  ✗ ${msg}`); }
}

// -- chunkIds --
{
  assert(chunkIds([], 10).length === 0, '빈 배열은 배치 0개');
  assert(chunkIds(['a', 'b', 'c'], 2).length === 2, '3개를 2씩 → 2배치');
  const c = chunkIds(['a', 'b', 'c'], 2);
  assert(JSON.stringify(c) === '[["a","b"],["c"]]', '마지막 배치는 남은 만큼');
  assert(chunkIds(['a', 'b'], 5)[0].length === 2, '크기보다 적으면 1배치');
  assert(chunkIds(['a', 'b'], 0).length === 1, 'size 0이면 통째로 1배치(무한루프 금지)');
  const ids = Array.from({ length: 200_000 }, (_, i) => String(i));
  assert(chunkIds(ids).length === 200_000 / LOCATION_BATCH_SIZE, '20만 장은 기본 크기로 100배치');
}

// -- isUsableLatLon --
{
  assert(isUsableLatLon(37.5, 127.0) === true, '정상 좌표');
  assert(isUsableLatLon(-33.9, 151.2) === true, '남반구·동경');
  assert(isUsableLatLon(0, 0) === false, '(0,0)은 GPS 빈 값 → 버림');
  assert(isUsableLatLon(0, 127) === true, '적도상 실제 좌표는 유효');
  assert(isUsableLatLon(91, 0) === false, '위도 범위 초과');
  assert(isUsableLatLon(0, 181) === false, '경도 범위 초과');
  assert(isUsableLatLon(NaN, 127) === false, 'NaN');
  assert(isUsableLatLon('37.5', 127) === false, '문자열은 좌표 아님');
  assert(isUsableLatLon(undefined, undefined) === false, 'undefined');
}

// -- normalizeLocations --
{
  const m = normalizeLocations({ a: [37.5, 127.0], b: [0, 0], c: [1], d: 'nope', e: [35.6, 139.7] });
  assert(m.size === 2, '쓸 수 있는 항목만 남는다 (a, e)');
  assert(m.get('a')?.latitude === 37.5 && m.get('a')?.longitude === 127.0, '위도·경도 순서 유지');
  assert(m.has('b') === false, '(0,0) 제외');
  assert(m.has('c') === false, '길이 부족한 배열 제외');
  assert(m.has('d') === false, '배열이 아닌 값 제외');
  assert(normalizeLocations(null).size === 0, 'null이어도 빈 Map');
  assert(normalizeLocations('x').size === 0, '객체가 아니어도 빈 Map');
  assert(normalizeLocations({ a: [37.5, 127.0, 99] }).size === 1, '여분 요소는 무시');
}

// -- fetchLocationsInBatches -- (tsx의 cjs 출력은 top-level await 불가 → 함수로 감싼다)
async function asyncChecks() {
{
  const ids = ['1', '2', '3', '4', '5'];
  const seen: string[][] = [];
  const m = await fetchLocationsInBatches(
    ids,
    async (batch) => {
      seen.push(batch);
      return Object.fromEntries(batch.map((id) => [id, [37 + Number(id) / 100, 127]]));
    },
    { size: 2 }
  );
  assert(seen.length === 3, '5개를 2씩 → 3회 호출');
  assert(m.size === 5, '모든 배치 결과가 합쳐진다');
  assert(m.get('3')?.latitude === 37.03, '배치별 값이 섞이지 않는다');
}

// 배치 하나가 던져도 나머지는 살아야 한다 — 한 덩이 실패로 스캔 전체를 버리지 않는다
{
  const m = await fetchLocationsInBatches(
    ['1', '2', '3', '4'],
    async (batch) => {
      if (batch[0] === '1') throw new Error('네이티브 실패');
      return Object.fromEntries(batch.map((id) => [id, [37.5, 127.0]]));
    },
    { size: 2 }
  );
  assert(m.size === 2, '실패한 배치만 빠지고 나머지는 수집');
  assert(m.has('1') === false && m.has('3') === true, '실패 배치의 id는 없고 성공분은 있다');
}

// 진행 콜백은 배치마다 1회, 총 개수를 함께 준다
{
  const calls: string[] = [];
  await fetchLocationsInBatches(['1', '2', '3'], async () => ({}), {
    size: 1,
    onBatch: (done, total) => calls.push(`${done}/${total}`),
  });
  assert(calls.join(',') === '1/3,2/3,3/3', '진행 콜백이 배치마다 누적으로 온다');
}

// 빈 입력은 호출조차 하지 않는다
{
  let called = false;
  const m = await fetchLocationsInBatches([], async () => { called = true; return {}; });
  assert(!called && m.size === 0, '빈 입력이면 fetcher를 부르지 않는다');
}
}

asyncChecks().then(() => {
  console.log(failures === 0 ? '\n모든 검증 통과' : `\n실패 ${failures}건`);
  if (failures > 0) process.exitCode = 1;
});
