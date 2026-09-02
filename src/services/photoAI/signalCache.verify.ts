// src/services/photoAI/signalCache.verify.ts
import {
  signalKey,
  parseSignalMap,
  applyCached,
  collectSignals,
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

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
