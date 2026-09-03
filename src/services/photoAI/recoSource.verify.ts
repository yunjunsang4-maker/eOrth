// src/services/photoAI/recoSource.verify.ts
import {
  adaptAlbumToPool,
  pickForAnalysis,
  sourceFingerprint,
  RECO_ANALYZE_MAX,
} from './recoSource';
import type { PoolPhoto } from '../../utils/tripPhotoPool';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  if (actual !== expected) { failed++; console.error(`✗ ${msg}\n   expected ${expected}\n   got      ${actual}`); }
  else console.log(`✓ ${msg}`);
}
function eqJson(actual: unknown, expected: unknown, msg: string) {
  eq(JSON.stringify(actual), JSON.stringify(expected), msg);
}

// ── adaptAlbumToPool ──
eqJson(adaptAlbumToPool({}), [], 'medias가 없으면 빈 목록');
eqJson(adaptAlbumToPool({ medias: [] }), [], '빈 medias는 빈 목록');
eqJson(
  adaptAlbumToPool({
    medias: ['file://1.jpg', 'file://2.jpg'],
    mediaAssetIds: { 'file://1.jpg': 'asset-1' },
    mediaTimes: { 'file://1.jpg': 100, 'file://2.jpg': 200 },
  }),
  [
    { id: 'asset-1', uri: 'file://1.jpg', creationTime: 100 },
    { uri: 'file://2.jpg', creationTime: 200 },
  ],
  '자산 id가 있으면 싣고 없으면 uri만 — 표시 순서 유지',
);
// id 없는 항목에 id 키가 들어가면 poolAssetIds가 undefined를 모아 스캔 제외가 오염된다
{
  const got = adaptAlbumToPool({ medias: ['file://x.jpg'] });
  eq('id' in got[0], false, 'id가 없으면 키 자체를 넣지 않는다');
  eq(got[0].creationTime, undefined, '촬영시각이 없으면 넣지 않는다');
}

// ── pickForAnalysis ──
const many: PoolPhoto[] = Array.from({ length: 1000 }, (_, i) => ({ uri: `u${i}`, creationTime: i }));
{
  const got = pickForAnalysis(many, 250);
  eq(got.length, 250, '1000장에서 250장으로 솎는다');
  eq(got[0].uri, 'u0', '첫 장을 포함한다');
  eq(got[got.length - 1].uri, 'u999', '마지막 장을 포함한다');
  eq(new Set(got.map((p) => p.uri)).size, 250, '중복이 없다');
}
{
  const few: PoolPhoto[] = [{ uri: 'a' }, { uri: 'b' }];
  eqJson(pickForAnalysis(few, 250), few, '상한 이하면 그대로');
}
eqJson(pickForAnalysis([], 250), [], '빈 입력은 빈 출력');
eq(pickForAnalysis(many).length, RECO_ANALYZE_MAX, 'max를 생략하면 RECO_ANALYZE_MAX');
eq(RECO_ANALYZE_MAX, 250, '기본 분석 상한은 250');

// ── sourceFingerprint ──
{
  const a: PoolPhoto[] = [{ id: 'x', uri: 'ph://x' }, { uri: 'file://y' }];
  const b: PoolPhoto[] = [{ id: 'x', uri: 'ph://DIFFERENT' }, { uri: 'file://y' }];
  eq(sourceFingerprint(a), sourceFingerprint(b), 'id가 같으면 uri가 달라져도 같은 지문');
}
{
  const a: PoolPhoto[] = [{ uri: 'a' }, { uri: 'b' }];
  const b: PoolPhoto[] = [{ uri: 'b' }, { uri: 'a' }];
  eq(sourceFingerprint(a) === sourceFingerprint(b), false, '순서가 다르면 다른 지문');
}
{
  const a: PoolPhoto[] = [{ uri: 'a' }];
  const b: PoolPhoto[] = [{ uri: 'a' }, { uri: 'b' }];
  eq(sourceFingerprint(a) === sourceFingerprint(b), false, '장수가 다르면 다른 지문');
}
{
  const a: PoolPhoto[] = [{ uri: 'a', creationTime: 1 }];
  const b: PoolPhoto[] = [{ uri: 'a', creationTime: 999 }];
  eq(sourceFingerprint(a), sourceFingerprint(b), '촬영시각은 지문에 영향을 주지 않는다');
}
eq(sourceFingerprint([]), sourceFingerprint([]), '빈 목록도 안정적인 지문');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
