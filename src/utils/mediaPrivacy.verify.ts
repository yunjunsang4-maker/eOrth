// 미디어 비공개 가시성 순수 로직 검증 (jest 미사용). 실행: npx tsx src/utils/mediaPrivacy.verify.ts
import { visibleMediaIndices, visibleMedias, visibleRepresentative, applyViewer } from './mediaPrivacy';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}

const rec = {
  medias: ['m0', 'm1', 'm2'],
  mediaPrivacy: { 1: ['김민수'], 2: ['김민수', '이서연'] },
  representativePhoto: 'm0',
};

// viewer=null → 전체
{
  assert(JSON.stringify(visibleMedias(rec, null)) === JSON.stringify(['m0', 'm1', 'm2']), 'viewer=null 전체 노출');
  assert(visibleRepresentative(rec, null) === 'm0', 'viewer=null 대표 유지');
}

// 일부 가림
{
  assert(JSON.stringify(visibleMedias(rec, '김민수')) === JSON.stringify(['m0']), '김민수: m1,m2 가림');
  assert(JSON.stringify(visibleMedias(rec, '이서연')) === JSON.stringify(['m0', 'm1']), '이서연: m2만 가림');
  assert(JSON.stringify(visibleMediaIndices(rec, '김민수')) === JSON.stringify([0]), '인덱스도 원본 기준');
}

// 대표사진이 가려지면 첫 보이는 사진으로 폴백
{
  const r2 = { medias: ['a', 'b'], mediaPrivacy: { 0: ['박준호'] }, representativePhoto: 'a' };
  assert(visibleRepresentative(r2, '박준호') === 'b', '대표 가림 → 첫 보이는 사진 폴백');
}

// 전부 가림 → 빈 배열 + 대표 undefined
{
  const r3 = { medias: ['x'], mediaPrivacy: { 0: ['최유진'] }, representativePhoto: 'x' };
  assert(visibleMedias(r3, '최유진').length === 0, '전부 가림 → 빈 배열');
  assert(visibleRepresentative(r3, '최유진') === undefined, '전부 가림 → 대표 undefined');
}

// mediaPrivacy 없음 → 전부 노출
{
  const r4 = { medias: ['p', 'q'] };
  assert(JSON.stringify(visibleMedias(r4, '김민수')) === JSON.stringify(['p', 'q']), 'privacy 없음 → 전부 노출');
}

// 외부 대표(크롭본 등, medias에 없음) → 평가 불가, 유지
{
  const r5 = { medias: ['m0'], mediaPrivacy: {}, representativePhoto: 'cover-baked.jpg' };
  assert(visibleRepresentative(r5, '김민수') === 'cover-baked.jpg', '외부 대표는 유지');
}

// applyViewer: medias/대표만 교체한 얕은 복사본
{
  const out = applyViewer(rec, '김민수');
  assert(JSON.stringify(out.medias) === JSON.stringify(['m0']), 'applyViewer medias 교체');
  assert(out.representativePhoto === 'm0', 'applyViewer 대표 유지(m0 보임)');
  assert(applyViewer(rec, null) === rec, 'viewer=null이면 원본 그대로 반환');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
