// src/services/photoAI/signalCache.verify.ts
import {
  signalKey,
  parseSignalMap,
  applyCached,
  collectSignals,
  signalFileToTripGroupId,
  selectDeadSignalFiles,
  SIGNAL_CACHE_VERSION,
  type SignalMap,
} from './signalCache';
import type { PhotoMeta } from './types';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  if (actual !== expected) { failed++; console.error(`✗ ${msg}\n   expected ${expected}\n   got      ${actual}`); }
  else console.log(`✓ ${msg}`);
}
function eqJson(actual: unknown, expected: unknown, msg: string) {
  eq(JSON.stringify(actual), JSON.stringify(expected), msg);
}

const mk = (id: string | undefined, uri: string): PhotoMeta => ({
  id: id ?? uri, uri, thumbnailUri: null, creationTime: 0, width: 0, height: 0, location: null,
});

// ── signalKey: 자산 id가 1순위 ──
eq(signalKey({ id: 'asset-1', uri: 'ph://x' }), 'asset-1', '자산 id가 있으면 id가 키');
eq(signalKey({ uri: 'file://a.jpg' }), 'file://a.jpg', 'id가 없으면 uri가 키');
eq(signalKey({ id: '', uri: 'file://a.jpg' }), 'file://a.jpg', '빈 id는 없는 것으로 본다');

// ── parseSignalMap: 버전 불일치는 통째로 버린다 ──
eqJson(parseSignalMap(null), {}, 'null이면 빈 캐시');
eqJson(parseSignalMap('nope'), {}, '깨진 JSON이면 빈 캐시');
eqJson(
  parseSignalMap(JSON.stringify({ v: SIGNAL_CACHE_VERSION + 1, entries: { a: { signal: {} } } })),
  {},
  '캐시 버전이 다르면 전부 폐기',
);
eqJson(
  parseSignalMap(JSON.stringify({ v: SIGNAL_CACHE_VERSION, entries: { a: { signal: { faceCount: 2 } } } })),
  { a: { signal: { faceCount: 2 } } },
  '버전이 같으면 항목을 살린다',
);
eqJson(
  parseSignalMap(JSON.stringify({ v: SIGNAL_CACHE_VERSION, entries: { a: 5, b: { signal: {} } } })),
  { b: { signal: {} } },
  '객체가 아닌 항목은 버리고 나머지는 살린다',
);

// ── applyCached: 적중분은 채우고 미적중분만 분석 대상으로 남긴다 ──
{
  const photos = [mk('a', 'ph://a'), mk('b', 'ph://b'), mk('c', 'ph://c')];
  const cache: SignalMap = {
    a: { quality: { passed: true }, signal: { faceCount: 1 } },
    c: { quality: { passed: false } },
  };
  const { hydrated, missing } = applyCached(photos, cache);
  eq(hydrated.length, 3, '적중 여부와 무관하게 전체 장수는 유지');
  eq(hydrated[0].signal?.faceCount, 1, '적중분에 신호가 채워진다');
  eq(hydrated[1].signal, undefined, '미적중분은 비어 있다');
  eq(hydrated[2].quality?.passed, false, '적중분에 품질이 채워진다');
  eqJson(missing.map((p) => p.id), ['b'], '미적중분만 분석 대상');
}
{
  const photos = [mk('a', 'ph://a')];
  const { missing } = applyCached(photos, {});
  eqJson(missing.map((p) => p.id), ['a'], '빈 캐시면 전부 미적중');
}
// 입력 배열을 변형하면 호출부가 같은 배열을 다시 쓸 때 오염된다
{
  const photos = [mk('a', 'ph://a')];
  applyCached(photos, { a: { signal: { faceCount: 9 } } });
  eq(photos[0].signal, undefined, '입력 배열은 변형하지 않는다');
}

// ── collectSignals: 분석 결과를 캐시 항목으로 ──
{
  const analyzed: PhotoMeta[] = [
    { ...mk('a', 'ph://a'), quality: { passed: true }, signal: { faceCount: 2 } },
    mk('b', 'ph://b'), // 신호 없음 — 캐시에 넣지 않는다
  ];
  const map = collectSignals(analyzed);
  eqJson(Object.keys(map), ['a'], '신호가 있는 사진만 캐시에 담는다');
  eq(map.a.signal?.faceCount, 2, '신호가 그대로 담긴다');
}

// ── signalFileToTripGroupId: 캐시 파일명 → tripGroupId 복원 ──
eq(signalFileToTripGroupId('trip-a.json'), 'trip-a', '일반 파일명 복원');
eq(signalFileToTripGroupId(`${encodeURIComponent('여행/한글 id')}.json`), '여행/한글 id',
  'encodeURIComponent 왕복 — 한글·구분자 섞인 id도 원형 복원');
eq(signalFileToTripGroupId('trip-a.txt'), null, '확장자가 다르면 캐시 파일이 아니다');
eq(signalFileToTripGroupId('.json'), null, '이름이 빈 파일은 캐시 파일이 아니다');
eq(signalFileToTripGroupId('%zz.json'), null, '깨진 인코딩은 null — 모르는 파일은 지우지 않는다');

// ── selectDeadSignalFiles: 죽은 그룹 것만 고른다 ──
// 불변식: 살아 있는 여행 것은 절대 고르지 않는다(오삭제 = 재분석 수 분 손실).
{
  const files = ['trip-a.json', 'trip-b.json', 'trip-ab.json', 'readme.txt'];
  eqJson(selectDeadSignalFiles(files, ['trip-a']), ['trip-b.json', 'trip-ab.json'],
    '살아 있는 것은 남기고 죽은 것만 — trip-a가 살아 있어도 trip-ab는 별개(접두 오판 없음)');
  eqJson(selectDeadSignalFiles(files, ['trip-a', 'trip-b', 'trip-ab']), [],
    '전부 살아 있으면 고르는 것이 없다');
  eqJson(selectDeadSignalFiles(files, []), [],
    'alive가 비면 아무것도 고르지 않는다 — hydrate 실패가 빈 목록으로 위장할 수 있다');
  eqJson(selectDeadSignalFiles(['readme.txt', '%zz.json'], ['trip-a']), [],
    '캐시 파일이 아닌 것(다른 확장자·깨진 이름)은 죽었어도 건드리지 않는다');
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
