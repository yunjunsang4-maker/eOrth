// src/utils/tripPhotoPool.verify.ts
import {
  samplePoolPhotos,
  pickCoverCandidates,
  prunePools,
  capPools,
  poolAssetIds,
  parsePools,
  mergePool,
  collectAssetIds,
  type TripPhotoPool,
  type TripPhotoPoolMap,
} from './tripPhotoPool';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  if (actual !== expected) { failed++; console.error(`✗ ${msg}\n   expected ${expected}\n   got      ${actual}`); }
  else console.log(`✓ ${msg}`);
}
function eqJson(actual: unknown, expected: unknown, msg: string) {
  eq(JSON.stringify(actual), JSON.stringify(expected), msg);
}

// ── samplePoolPhotos ──
const ten = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
eqJson(samplePoolPhotos(ten, 20), ten, '상한보다 적으면 전부 그대로');
eqJson(samplePoolPhotos(ten, 10), ten, '상한과 같으면 전부 그대로');
eqJson(samplePoolPhotos(ten, 4), [0, 3, 6, 9], '균등 간격으로 솎고 처음·끝 포함');
eqJson(samplePoolPhotos(ten, 2), [0, 9], '2장이면 처음과 끝');
eqJson(samplePoolPhotos(ten, 1), [0], '1장이면 첫 장');
eqJson(samplePoolPhotos(ten, 0), [], '0이면 빈 목록');
eqJson(samplePoolPhotos([], 5), [], '빈 입력은 빈 출력');
// 솎은 결과에 중복 인덱스가 생기면 사진첩에 같은 장이 두 번 뜬다
{
  const big = Array.from({ length: 1000 }, (_, i) => i);
  const s = samplePoolPhotos(big, 400);
  eq(s.length, 400, '1000→400 솎기 개수');
  eq(new Set(s).size, 400, '솎기 결과에 중복 없음');
  eq(s[0], 0, '솎기 첫 원소는 원본 첫 원소');
  eq(s[s.length - 1], 999, '솎기 마지막 원소는 원본 마지막 원소');
}
// 원본 배열을 건드리지 않는다(호출부가 같은 배열을 계속 쓴다)
{
  const src = [1, 2, 3];
  samplePoolPhotos(src, 2);
  eqJson(src, [1, 2, 3], '원본 배열 불변');
}

// ── pickCoverCandidates ──
// rand를 주입해 결정적으로 검증한다. 항상 0을 돌려주면 부분 셔플이 원본 순서를 유지한다.
const zero = () => 0;
eqJson(pickCoverCandidates(['a', 'b', 'c'], 2, zero), ['a', 'b'], 'rand=0이면 앞에서부터');
eqJson(pickCoverCandidates(['a', 'b', 'c'], 5, zero), ['a', 'b', 'c'], '요청이 장수보다 많으면 전부');
eqJson(pickCoverCandidates([], 3, zero), [], '빈 목록이면 후보 없음');
eqJson(pickCoverCandidates(['a'], 0, zero), [], '0개 요청이면 빈 목록');
// rand()가 1을 돌려줘도(경계) 인덱스가 범위를 벗어나 undefined가 섞이면 안 된다
{
  const one = () => 1;
  const got = pickCoverCandidates(['a', 'b', 'c'], 3, one);
  eq(got.length, 3, 'rand=1 경계에서도 3개');
  eq(got.every((v) => v !== undefined), true, 'rand=1 경계에서 undefined 없음');
  eq(new Set(got).size, 3, 'rand=1 경계에서도 중복 없음');
}
// 무작위여도 후보는 서로 달라야 한다(같은 장을 두 번 시도하면 폴백이 무의미)
{
  let seed = 0.123456789;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280 / 233280; return seed; };
  for (let trial = 0; trial < 50; trial++) {
    const got = pickCoverCandidates(ten, 3, rand);
    if (got.length !== 3 || new Set(got).size !== 3) { failed++; console.error('✗ 무작위 후보 3개가 서로 달라야 함'); break; }
    if (trial === 49) console.log('✓ 무작위 후보 3개가 서로 다름(50회)');
  }
}

// ── prunePools / capPools / poolAssetIds ──
const mk = (id: string, savedAt: number, ids: string[]): TripPhotoPool => ({
  tripGroupId: id, recordId: `rec-${id}`,
  country: '🇯🇵 일본', countryName: '일본', countryFlag: '🇯🇵',
  title: '일본 여행', startDate: '2025.01.01', endDate: '2025.01.05',
  photos: ids.map((a) => ({ id: a, uri: `file://${a}.jpg`, creationTime: 1 })),
  assetIds: [...ids],
  totalCount: ids.length, savedAt,
});
const pools: TripPhotoPoolMap = { g1: mk('g1', 100, ['a', 'b']), g2: mk('g2', 200, ['c']) };

eqJson(Object.keys(prunePools(pools, ['g2'])), ['g2'], '없어진 카드의 보관은 제거');
eqJson(Object.keys(prunePools(pools, ['g1', 'g2'])), ['g1', 'g2'], '살아 있으면 유지');
eqJson(Object.keys(prunePools(pools, [])), [], '카드가 하나도 없으면 전부 제거');

eqJson(Object.keys(capPools(pools, 5)), ['g1', 'g2'], '상한 이하면 그대로');
eqJson(Object.keys(capPools(pools, 1)), ['g2'], '넘치면 최근 저장분만 남김');
// capPools는 원본을 변형하지 않아야 한다
capPools(pools, 1);
eqJson(Object.keys(pools).sort(), ['g1', 'g2'], 'capPools가 원본 맵을 변형하지 않음');

eqJson([...poolAssetIds(pools)].sort(), ['a', 'b', 'c'], '보관된 자산 id 전부 수집');
eq(poolAssetIds({}).size, 0, '빈 맵이면 자산 id 없음');
// id 없는 사진(스캔에서 자산 id를 못 얻은 경우)은 집합에 들어가면 안 된다
{
  const noId: TripPhotoPoolMap = { g: { ...mk('g', 1, []), photos: [{ uri: 'file://x.jpg' }] } };
  eq(poolAssetIds(noId).size, 0, 'id 없는 사진은 제외');
}
// ★ 핵심 불변식: 후보(photos)가 솎여도 자산 id는 전량이 제외 집합에 들어가야 한다.
//   여기가 깨지면 솎여 나간 사진이 재스캔에 다시 잡혀 이미 가져온 여행이 목록에 재등장한다.
{
  const all = Array.from({ length: 1000 }, (_, i) => `a${i}`);
  const sampled: TripPhotoPoolMap = {
    g: {
      ...mk('g', 1, []),
      photos: samplePoolPhotos(all.map((a) => ({ id: a, uri: `file://${a}.jpg` })), 200),
      assetIds: all,
    },
  };
  eq(sampled.g.photos.length, 200, '후보는 솎여 200장');
  eq(poolAssetIds(sampled).size, 1000, '제외 집합은 솎기와 무관하게 1000개 전부');
}
// assetIds가 없던 시절 항목도 최소한 후보만큼은 제외된다(하위 호환)
{
  const legacy = { g: { ...mk('g', 1, ['x', 'y']), assetIds: undefined as unknown as string[] } };
  eqJson([...poolAssetIds(legacy)].sort(), ['x', 'y'], 'assetIds 없는 옛 항목은 후보 id로 대체');
}

// ── collectAssetIds ──
eqJson(collectAssetIds([{ id: 'a', uri: 'x' }, { id: 'b', uri: 'y' }]), ['a', 'b'], '자산 id 추출');
eqJson(collectAssetIds([{ id: 'a', uri: 'x' }, { id: 'a', uri: 'y' }]), ['a'], '중복 id 제거');
eqJson(collectAssetIds([{ uri: 'x' }, { id: 'b', uri: 'y' }]), ['b'], 'id 없는 항목 제외');
eqJson(collectAssetIds([]), [], '빈 입력은 빈 출력');

// ── parsePools ──
eqJson(parsePools(null), {}, 'null이면 빈 맵');
eqJson(parsePools('{{'), {}, '깨진 JSON이면 빈 맵');
eqJson(parsePools('[]'), {}, '배열이면 빈 맵');
eqJson(parsePools('"x"'), {}, '문자열이면 빈 맵');
eqJson(Object.keys(parsePools(JSON.stringify(pools))), ['g1', 'g2'], '왕복 후 키 보존');
eq(parsePools(JSON.stringify(pools)).g1.photos.length, 2, '왕복 후 사진 수 보존');
// tripGroupId가 없거나 photos가 배열이 아니면 그 항목만 버린다
{
  const broken = JSON.stringify({ ok: mk('ok', 1, ['a']), bad1: { photos: [] }, bad2: { tripGroupId: 'x' } });
  eqJson(Object.keys(parsePools(broken)), ['ok'], '형태가 어긋난 항목만 버림');
}
// 사진 배열 안의 쓰레기도 걸러진다(uri 없는 항목)
{
  const dirty = JSON.stringify({ g: { tripGroupId: 'g', photos: [{ uri: 'a' }, null, { id: 'no-uri' }, 5] } });
  eq(parsePools(dirty).g.photos.length, 1, 'uri 없는 사진 항목 제거');
  eq(parsePools(dirty).g.totalCount, 1, 'totalCount 누락 시 남은 장수로 보정');
}

// ── mergePool ──
// 장기체류 카드는 여러 여행을 흡수한다 — 덮어쓰면 먼저 들어온 여행의 사진이 사라진다
{
  const prev: TripPhotoPool = {
    ...mk('g', 100, ['a', 'b']), startDate: '2025.03.10', endDate: '2025.03.14',
    photos: [
      { id: 'a', uri: 'file://a.jpg', creationTime: 300 },
      { id: 'b', uri: 'file://b.jpg', creationTime: 100 },
    ],
  };
  const next: TripPhotoPool = {
    ...mk('g', 200, []), startDate: '2025.02.01', endDate: '2025.03.20',
    photos: [
      { id: 'b', uri: 'file://b.jpg', creationTime: 100 }, // 겹치는 장
      { id: 'c', uri: 'file://c.jpg', creationTime: 200 },
    ],
    assetIds: ['b', 'c'],
  };
  const m = mergePool(prev, next);
  eqJson(m.photos.map((p) => p.id), ['b', 'c', 'a'], '합치기: 중복 제거 + 촬영순 정렬');
  eq(m.startDate, '2025.02.01', '합치기: 시작일은 더 이른 쪽');
  eq(m.endDate, '2025.03.20', '합치기: 종료일은 더 늦은 쪽');
  eqJson([...m.assetIds].sort(), ['a', 'b', 'c'], '합치기: 자산 id는 합집합');
  eq(m.totalCount, 3, '합치기: totalCount는 중복 제거 후 실제 장수');
  eqJson(prev.photos.map((p) => p.id), ['a', 'b'], '합치기가 이전 보관분을 변형하지 않음');
}
eq(mergePool(undefined, mk('g', 1, ['a'])).photos.length, 1, '이전 보관분이 없으면 그대로');
// 빈 날짜 문자열이 섞여도 있는 쪽을 채택해야 한다(빈 문자열이 '가장 이른 날'로 이기면 안 됨)
{
  const m = mergePool(
    { ...mk('g', 1, []), startDate: '', endDate: '' },
    { ...mk('g', 2, []), startDate: '2025.05.01', endDate: '2025.05.03' },
  );
  eq(m.startDate, '2025.05.01', '빈 시작일은 있는 쪽으로 채움');
  eq(m.endDate, '2025.05.03', '빈 종료일은 있는 쪽으로 채움');
}
// 자산 id가 없는 사진은 uri로 중복을 판정한다
{
  const noId = (uri: string, t: number) => ({ uri, creationTime: t });
  const m = mergePool(
    { ...mk('g', 1, []), photos: [noId('file://x.jpg', 1)] },
    { ...mk('g', 2, []), photos: [noId('file://x.jpg', 1), noId('file://y.jpg', 2)] },
  );
  eqJson(m.photos.map((p) => p.uri), ['file://x.jpg', 'file://y.jpg'], 'id 없으면 uri로 중복 판정');
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
