// 미디어 비공개 가시성 순수 로직 검증 (jest 미사용). 실행: npx tsx src/utils/mediaPrivacy.verify.ts
import { visibleMediaIndices, visibleMedias, visibleRepresentative, applyViewer, isPostHiddenForViewer } from './mediaPrivacy';

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

// isPostHiddenForViewer: 블로그/스트립(cut)은 기록 전체가 뷰어에게서 숨겨진다
{
  const blog = { viewType: 'blog', medias: ['b0', 'b1'], mediaPrivacy: { 0: ['김민수'] } };
  const strip = { viewType: 'cut', medias: ['s0'], mediaPrivacy: { 0: ['이서연'] } };
  const feed = { viewType: 'feed', medias: ['f0'], mediaPrivacy: { 0: ['김민수'] } };

  assert(isPostHiddenForViewer(blog, '김민수') === true, '블로그: 비공개 대상 뷰어 → 글 숨김');
  assert(isPostHiddenForViewer(blog, '이서연') === false, '블로그: 대상 아닌 뷰어 → 노출');
  assert(isPostHiddenForViewer(blog, null) === false, 'viewer=null → 숨김 없음');
  assert(isPostHiddenForViewer(strip, '이서연') === true, '스트립: 비공개 대상 뷰어 → 글 숨김');
  assert(isPostHiddenForViewer(feed, '김민수') === false, '피드는 post-level 숨김 대상 아님(사진 단위)');
  assert(isPostHiddenForViewer({ viewType: 'blog' }, '김민수') === false, 'mediaPrivacy 없으면 숨김 없음');
}

// ── applyViewer: 사진별 글(photoTexts)도 같은 index로 걸러야 한 칸씩 밀리지 않는다(5번) ──
{
  const rec = { medias: ['p0', 'p1', 'p2'], photoTexts: ['글0', '비밀1', '글2'], mediaPrivacy: { 1: ['김민수'] } };
  assert(JSON.stringify(applyViewer(rec, '김민수').photoTexts) === JSON.stringify(['글0', '글2']), '가린 사진(1)의 글이 빠지고 글2가 p2와 짝 유지');
  assert(JSON.stringify(applyViewer(rec, '이서연').photoTexts) === JSON.stringify(['글0', '비밀1', '글2']), '대상 아닌 뷰어 → 글 그대로');
  assert(applyViewer(rec, null) === rec, 'viewer=null → 원본 그대로');
  assert(!('photoTexts' in applyViewer({ medias: ['p0'], mediaPrivacy: { 0: ['김민수'] } }, '김민수')), 'photoTexts 없으면 키를 만들지 않음');
  const short = { medias: ['p0', 'p1', 'p2'], photoTexts: ['글0'], mediaPrivacy: { 0: ['김민수'] } };
  assert(JSON.stringify(applyViewer(short, '김민수').photoTexts) === JSON.stringify(['', '']), '글 배열이 짧으면 빈 글로 채움(p1·p2 짝 유지)');
}

// ── applyViewer: memo(대표 사진 글 복사본)도 가린 대표 사진의 글을 흘리지 않는다 ──
{
  const base = { medias: ['p0', 'p1', 'p2'], photoTexts: ['비밀0', '글1', '글2'], representativePhoto: 'p0', memo: '비밀0' };
  const repHidden = { ...base, mediaPrivacy: { 0: ['김민수'] } };
  assert(applyViewer(repHidden, '김민수').memo === '글1', '대표(p0) 가림 → memo는 새 대표(p1)의 글');
  assert(applyViewer(repHidden, '이서연').memo === '비밀0', '대상 아닌 뷰어 → memo 그대로');
  const allHidden = { ...base, mediaPrivacy: { 0: ['김민수'], 1: ['김민수'], 2: ['김민수'] } };
  assert(applyViewer(allHidden, '김민수').memo === '', '사진 전부 가림 → memo 비움(본문 폴백으로 새지 않음)');
  const otherHidden = { ...base, mediaPrivacy: { 2: ['김민수'] } };
  assert(applyViewer(otherHidden, '김민수').memo === '비밀0', '대표 아닌 사진만 가림 → memo 그대로');
  const bySource = { ...base, representativePhoto: 'crop://x', representativePhotoSource: 'p1', memo: '글1', mediaPrivacy: { 1: ['김민수'] } };
  assert(applyViewer(bySource, '김민수').memo === '', '크롭 대표: 출처(p1) 가림 → 새 대표(외부 URI)의 글 없음 → 비움');
  const unknownSrc = { ...base, representativePhoto: 'crop://x', memo: '비밀0', mediaPrivacy: { 0: ['김민수'] } };
  assert(applyViewer(unknownSrc, '김민수').memo === '', '출처 모름: 가린 사진 글과 같으면 비움');
  const oldMemo = { medias: ['p0'], representativePhoto: 'p0', memo: '옛 본문', mediaPrivacy: { 0: ['김민수'] } };
  assert(applyViewer(oldMemo, '김민수').memo === '옛 본문', 'photoTexts 없는 옛 글: memo는 진짜 본문이라 그대로');
}

// ── applyViewer 멱등: 사본에 한 번 더 걸려도(FriendProfile → TripDetail → PostDetail) 결과가 같다 ──
{
  const rec = {
    medias: ['p0', 'p1', 'p2', 'p3'],
    photoTexts: ['글0', '비밀1', '글2', '글3'],
    representativePhoto: 'p0', memo: '글0',
    mediaPrivacy: { 1: ['김민수'], 3: ['이서연'] },
  };
  const once = applyViewer(rec, '김민수');
  const twice = applyViewer(once, '김민수');
  assert(JSON.stringify(once.medias) === JSON.stringify(['p0', 'p2', 'p3']), '1회: 김민수에게 p1만 가림');
  assert(JSON.stringify(twice.medias) === JSON.stringify(['p0', 'p2', 'p3']), '2회 적용해도 p2가 가려지지 않음(옛 index 1 오적용 없음)');
  assert(JSON.stringify(twice.photoTexts) === JSON.stringify(['글0', '글2', '글3']), '2회 적용해도 사진별 글 짝 유지');
  assert(JSON.stringify(once.mediaPrivacy) === JSON.stringify({ 2: ['이서연'] }), '사본 mediaPrivacy는 걸러진 index로 재매김(p3 → 2)');
  assert(JSON.stringify(applyViewer(once, '이서연').medias) === JSON.stringify(['p0', 'p2']), '재매김된 사본에 다른 뷰어 → 그 사람 대상(p3)만 가림');
  assert(!('mediaPrivacy' in applyViewer({ medias: ['p0'] }, '김민수')), 'mediaPrivacy 없으면 키를 만들지 않음');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
