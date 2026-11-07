// src/utils/tripCover.verify.ts — 여행기록카드 커버 고르기 검증
import { recordCoverUri, thumbSheetPick, tripCoverUri, type CoverSource, type ThumbSource } from './tripCover';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// 고치기 전 화면들이 쓰던 한 줄(ProfileScreen·MainScreen·TripDetail currentCardUri) — 기존 동작 보존 비교용
const oldCover = (g: string | undefined, r?: CoverSource) => g ?? r?.representativePhoto ?? r?.medias?.[0];

// ── 기존 동작 보존 — medias[0]·대표 사진 우선·group.coverUri 우선 ──
const feed: CoverSource = { medias: ['file:///p1.jpg', 'file:///p2.jpg'] };
eq(recordCoverUri(feed), 'file:///p1.jpg', '피드: medias[0]이 커버');
eq(recordCoverUri(feed), oldCover(undefined, feed), '피드: 예전 한 줄과 같은 결과');
const cropped: CoverSource = { representativePhoto: 'file:///crop.jpg', medias: ['file:///p1.jpg'] };
eq(recordCoverUri(cropped), 'file:///crop.jpg', '대표 사진(크롭본)이 medias[0]보다 우선');
eq(recordCoverUri(cropped), oldCover(undefined, cropped), '크롭본: 예전 한 줄과 같은 결과');
eq(tripCoverUri('file:///override.jpg', cropped, [cropped]), 'file:///override.jpg', '카드 오버라이드(group.coverUri)가 최우선');
eq(tripCoverUri('file:///override.jpg', cropped, [cropped]), oldCover('file:///override.jpg', cropped), '오버라이드: 예전 한 줄과 같은 결과');
eq(tripCoverUri(undefined, feed, [feed]), oldCover(undefined, feed), '오버라이드 없음: 예전 한 줄과 같은 결과');

// ── A. 스냅·네컷 — 사진이 medias 밖에 있음(예전엔 이모지로 떨어짐) ──
const snap: CoverSource = { snapBackUri: 'file:///back.jpg', snapFrontUri: 'file:///front.jpg' };
eq(oldCover(undefined, snap), undefined, '재현: 예전 한 줄은 스냅 기록에서 커버를 못 찾음');
eq(recordCoverUri(snap), 'file:///back.jpg', 'A: 스냅은 후면 사진이 커버');
eq(recordCoverUri({ snapFrontUri: 'file:///front.jpg' }), 'file:///front.jpg', 'A: 후면이 없으면 전면 사진');
eq(recordCoverUri({ cutPhoto: { previewUri: 'file:///cut.jpg' } }), 'file:///cut.jpg', 'A: 네컷은 합성 미리보기가 커버');

// ── B. 대표 기록엔 사진이 없고 같은 카드 다른 기록엔 있음 ──
const textOnly: CoverSource = { medias: [] };
const later: CoverSource = { medias: ['file:///later.jpg'] };
eq(oldCover(undefined, textOnly), undefined, '재현: 예전 한 줄은 대표 기록에 사진이 없으면 끝');
eq(tripCoverUri(undefined, textOnly, [textOnly, later]), 'file:///later.jpg', 'B: 멤버 중 사진 있는 첫 기록으로 폴백');
eq(tripCoverUri(undefined, textOnly, [textOnly, snap, later]), 'file:///back.jpg', 'B: 멤버 순서를 지킨다(스냅이 먼저면 스냅)');
eq(tripCoverUri(undefined, undefined, [later]), 'file:///later.jpg', 'B: 대표 기록이 없어도(빈 카드 id) 멤버에서 찾음');

// ── 빈 문자열·널 계열 — 셋을 따로 본다 ──
eq(recordCoverUri({ representativePhoto: '', medias: ['file:///p1.jpg'] }), 'file:///p1.jpg', "빈 대표 사진('')은 없는 것으로");
eq(recordCoverUri({ medias: ['', 'file:///p2.jpg'] }), 'file:///p2.jpg', "medias 안의 ''는 건너뜀");
eq(recordCoverUri({ medias: [], snapBackUri: '', snapFrontUri: 'file:///f.jpg' }), 'file:///f.jpg', "빈 snapBackUri('')는 건너뜀");
eq(recordCoverUri({ cutPhoto: { previewUri: '' } }), undefined, "빈 네컷 미리보기('')는 undefined(빈 문자열을 돌려주지 않음)");
eq(recordCoverUri(undefined), undefined, '기록 undefined → undefined');
eq(recordCoverUri(null), undefined, '기록 null → undefined');
eq(tripCoverUri('', feed, [feed]), 'file:///p1.jpg', "빈 group.coverUri('')는 없는 것으로");
eq(tripCoverUri(null, feed, [feed]), 'file:///p1.jpg', 'group.coverUri null → 기록에서 찾음');

// ── D. 카드에 사진이 정말 하나도 없음 → undefined(화면이 국기 커버로 그린다) ──
eq(tripCoverUri(undefined, textOnly, [textOnly, { medias: [] }]), undefined, 'D: 사진 없는 카드는 undefined');
eq(tripCoverUri(undefined, undefined, []), undefined, 'D: 멤버 0개(갓 시작한 체류 카드)는 undefined');

// ── 썸네일 변경 시트(thumbSheetPick) — applies = 화면 confirmThumbPicker 조건(!unchanged && highlight) ──
type Sel = { uri: string; t: { scale: number } | null } | null;
const sheet = (g: string | undefined, rec: ThumbSource | undefined, members: ThumbSource[], sel: Sel) => {
  const r = thumbSheetPick(g, rec, members, sel);
  return { highlight: r.highlight, preview: r.preview, unchanged: r.unchanged, applies: !r.unchanged && !!r.highlight };
};

// M1: 대표 기록이 스냅이고 다른 기록에 사진 — 예전엔 폴백 첫 장(later)이 '현재'라 눌러도 적용 안 됨
eq(sheet(undefined, snap, [snap, later], null),
  { highlight: undefined, preview: 'file:///back.jpg', unchanged: true, applies: false },
  'M1: 열 때 — 카드(스냅 후면) 미리보기, 줄에 없는 사진이라 선택 표시 없음');
eq(sheet(undefined, snap, [snap, later], { uri: 'file:///later.jpg', t: null }),
  { highlight: 'file:///later.jpg', preview: 'file:///later.jpg', unchanged: false, applies: true },
  'M1: 첫 사진을 조정 없이 고르면 미리보기가 바뀌고 확인이 적용된다');
const netcut: ThumbSource = { cutPhoto: { previewUri: 'file:///cut.jpg' } };
eq(sheet(undefined, netcut, [netcut, later], { uri: 'file:///later.jpg', t: null }).applies, true, 'M1: 네컷 대표도 같다');
const outside: ThumbSource = { representativePhoto: 'file:///reroll.jpg', representativePhotoSource: 'file:///reroll.jpg', medias: ['file:///a.jpg'] };
eq(sheet(undefined, outside, [outside], null).highlight, undefined, 'M1: medias 밖 대표 사진 — medias[0]을 현재로 치지 않음');
eq(sheet(undefined, outside, [outside], { uri: 'file:///a.jpg', t: null }).applies, true, 'M1: medias 밖 대표 사진 카드에서 medias[0]을 고르면 적용');
eq(sheet('file:///ov-crop.jpg', feed, [feed], { uri: 'file:///p1.jpg', t: null }).applies, true, '줄 밖 오버라이드(옛 크롭) 카드에서 고른 사진은 적용');
eq(sheet('file:///p2.jpg', feed, [feed], null).highlight, 'file:///p2.jpg', '줄 안 오버라이드는 그 칸에 선택 표시');

// B: 대표 기록엔 사진 없음 — '확인만'은 아무것도 적용하지 않음
eq(sheet(undefined, textOnly, [textOnly, later], null),
  { highlight: 'file:///later.jpg', preview: 'file:///later.jpg', unchanged: true, applies: false },
  'B: 확인만 — 선택 표시는 카드 사진(later), 적용 없음');
eq(sheet(undefined, textOnly, [textOnly, later], { uri: 'file:///later.jpg', t: null }).applies, false, 'B: 같은 사진을 다시 눌러도 적용 없음');

// 크롭본 보존(a6dff96) — 원본을 조정 없이 다시 고르면 크롭본을 원본으로 덮지 않음
const cropRec: ThumbSource = { representativePhoto: 'file:///crop.jpg', representativePhotoSource: 'file:///p1.jpg', medias: ['file:///p1.jpg', 'file:///p2.jpg'] };
eq(sheet(undefined, cropRec, [cropRec], null),
  { highlight: 'file:///p1.jpg', preview: 'file:///crop.jpg', unchanged: true, applies: false },
  '크롭: 열 때 — 원본 칸에 선택 표시, 미리보기는 크롭본');
eq(sheet(undefined, cropRec, [cropRec], { uri: 'file:///p1.jpg', t: null }),
  { highlight: 'file:///p1.jpg', preview: 'file:///crop.jpg', unchanged: true, applies: false },
  '크롭: 다른 사진 눌렀다 원본으로 돌아와도 크롭본 유지·적용 없음');
eq(sheet(undefined, cropRec, [cropRec], { uri: 'file:///p1.jpg', t: { scale: 2 } }).applies, true, '크롭: 원본을 다시 조정하면 적용');
eq(sheet(undefined, cropRec, [cropRec], { uri: 'file:///p2.jpg', t: null }).applies, true, '크롭: 다른 사진을 고르면 적용');
const oldCrop: ThumbSource = { representativePhoto: 'file:///crop.jpg', medias: ['file:///p1.jpg'] };
eq(sheet(undefined, oldCrop, [oldCrop], null).applies, false, '원본 필드 없는 옛 크롭: 확인만은 적용 없음(크롭 유지)');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
