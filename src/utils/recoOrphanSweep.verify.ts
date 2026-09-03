// src/utils/recoOrphanSweep.verify.ts
//
// 이 로직이 틀리면 사용자의 저장된 글에서 사진이 사라진다(복구 불가).
// 그래서 "지운다" 판정보다 "남긴다" 판정의 경계를 훨씬 촘촘히 본다.
import {
  buildReferenceText,
  isRecoFolderReferenced,
  parseAcceptTs,
  maxAcceptTs,
  shouldDeleteRecoFolder,
  RECO_DIR_PREFIX,
  RECO_ORPHAN_MIN_AGE_MS,
} from './recoOrphanSweep';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  if (actual !== expected) { failed++; console.error(`✗ ${msg}\n   expected ${expected}\n   got      ${actual}`); }
  else console.log(`✓ ${msg}`);
}

// ── buildReferenceText ──
{
  const rec = { id: 'r1', medias: ['file:///docs/trips/reco-feed_food-1700000000000/0.jpg'] };
  const text = buildReferenceText([[rec], [], {}]);
  eq(text != null, true, '정상 소스는 직렬화된다');
  eq(text!.includes('trips/reco-feed_food-1700000000000/0.jpg'), true, '직렬화 결과에 uri가 그대로 담긴다(/ 이스케이프 없음)');
}
{
  // 순환 참조 — 전수 판정 불가 → null (호출부는 청소를 통째로 포기해야 한다)
  const a: Record<string, unknown> = {};
  a.self = a;
  eq(buildReferenceText([a]), null, '직렬화 실패 소스가 있으면 null');
  eq(buildReferenceText([[{ ok: 1 }], a]), null, '하나만 실패해도 전체가 null');
}
eq(buildReferenceText([]), '', '소스가 없으면 빈 문자열(참조 0건으로 취급)');
eq(buildReferenceText([undefined]), '', 'undefined 소스는 빈 조각(stringify가 undefined를 돌려줘도 죽지 않는다)');

// ── isRecoFolderReferenced ──
// 참조는 TravelRecord 어느 필드에 있어도 잡혀야 한다 — 필드별 대표 사례로 확인
{
  const records = [
    { medias: ['file:///d/trips/reco-feed_food-1700000000001/0.jpg'] },
    { representativePhotoSource: 'file:///d/trips/reco-feed_city-1700000000002/3.jpg' },
    { blogBlocks: [{ kind: 'images', uris: ['file:///d/trips/reco-blog_nature-1700000000003/1.jpg'] }] },
    // 컷 카드 id에 iOS 자산 id(ABCD/L0/001)가 들어가 폴더가 중첩된다 — 수락 ts는 말단 세그먼트에 붙는다
    { cutPhoto: { photos: ['file:///d/trips/reco-cut_fun_spot_1690000000000_ABCD/L0/001-1700000000004/2.jpg'] } },
    { perCountryData: { JP: { medias: ['file:///d/trips/reco-feed_sea-1700000000005/0.jpg'] } } },
    // uploadedMediaUrls는 '키'가 로컬 uri다 — 값만 보는 판정이면 놓친다
    { uploadedMediaUrls: { 'file:///d/trips/reco-feed_sky-1700000000006/0.jpg': 'https://cdn/x.jpg' } },
  ];
  const text = buildReferenceText([records])!;
  eq(isRecoFolderReferenced(text, 'reco-feed_food-1700000000001'), true, 'medias 참조를 잡는다');
  eq(isRecoFolderReferenced(text, 'reco-feed_city-1700000000002'), true, 'representativePhotoSource 참조를 잡는다');
  eq(isRecoFolderReferenced(text, 'reco-blog_nature-1700000000003'), true, 'blogBlocks 내부 이미지 참조를 잡는다');
  // 중첩 컷 폴더: trips/ 직속 이름은 슬래시 앞까지다 — 그 이름으로 판정해야 한다
  eq(isRecoFolderReferenced(text, 'reco-cut_fun_spot_1690000000000_ABCD'), true, '중첩 컷 폴더(최상위 이름)를 잡는다');
  eq(isRecoFolderReferenced(text, 'reco-feed_sea-1700000000005'), true, 'perCountryData 내부 참조를 잡는다');
  eq(isRecoFolderReferenced(text, 'reco-feed_sky-1700000000006'), true, 'uploadedMediaUrls 키 참조를 잡는다');
  eq(isRecoFolderReferenced(text, 'reco-feed_none-1700000000009'), false, '참조 없는 폴더는 미참조');
}
// 접두 오탐 — 'reco-a'가 'reco-ab' 참조에 걸리면 반대로 'reco-ab' 판정도 부정확해진다
{
  const text = buildReferenceText([[{ medias: ['file:///d/trips/reco-ab/0.jpg'] }]])!;
  eq(isRecoFolderReferenced(text, 'reco-ab'), true, '정확히 그 폴더는 참조로 판정');
  eq(isRecoFolderReferenced(text, 'reco-a'), false, '접두가 겹치는 다른 폴더는 오탐하지 않는다');
}

// ── parseAcceptTs ──
eq(parseAcceptTs('reco-feed_food-1700000000000'), 1700000000000, '13자리 ms 접미를 파싱');
eq(parseAcceptTs('001-1700000000000'), 1700000000000, '중첩 컷의 말단 세그먼트(001-{ts})도 파싱');
eq(parseAcceptTs('reco-cut_fun_spot_1690000000000_ABCD'), null, '중간의 13자리(스팟 시각)는 접미가 아니라 무시');
eq(parseAcceptTs('reco-feed_food-170000000000'), null, '12자리는 시각이 아니다');
eq(parseAcceptTs('reco-feed_food-17000000000000'), null, '14자리는 시각이 아니다');
eq(parseAcceptTs('reco-cut_x_1000000123'), null, '안드로이드 자산 id(짧은 숫자) 접미를 시각으로 오판하지 않는다');
eq(parseAcceptTs('L0'), null, '숫자 없는 세그먼트는 null');
eq(parseAcceptTs('0.jpg'), null, '파일명은 null');

// ── maxAcceptTs ──
eq(maxAcceptTs(['reco-cut_x_ABCD', 'L0', '001-1700000000001', '001-1700000000009']), 1700000000009, '여러 수락 중 가장 최근을 고른다');
eq(maxAcceptTs(['reco-cut_x_ABCD', 'L0']), null, '어디에도 시각이 없으면 null');
eq(maxAcceptTs([]), null, '빈 목록은 null');

// ── shouldDeleteRecoFolder ──
const NOW = 1700000000000 + 10 * 24 * 60 * 60 * 1000; // 최소 나이를 넉넉히 넘긴 기준 시각
const EMPTY = '';
eq(
  shouldDeleteRecoFolder({ name: 'reco-feed_food-1700000000000', refText: EMPTY, newestTs: 1700000000000, now: NOW }),
  true,
  '미참조 + 나이 충분 → 삭제',
);
eq(
  shouldDeleteRecoFolder({
    name: 'reco-feed_food-1700000000000',
    refText: buildReferenceText([[{ medias: ['file:///d/trips/reco-feed_food-1700000000000/0.jpg'] }]])!,
    newestTs: 1700000000000,
    now: NOW,
  }),
  false,
  '참조가 있으면 아무리 오래돼도 삭제 금지',
);
eq(
  shouldDeleteRecoFolder({ name: 'reco-feed_food-1700000000000', refText: EMPTY, newestTs: null, now: NOW }),
  false,
  '나이를 모르면 삭제 금지',
);
eq(
  shouldDeleteRecoFolder({ name: 'reco-feed_food-1700000000000', refText: EMPTY, newestTs: NOW - 1000, now: NOW }),
  false,
  '어린 폴더(작성 중일 수 있음)는 유예',
);
eq(
  shouldDeleteRecoFolder({
    name: 'reco-feed_food-1700000000000',
    refText: EMPTY,
    newestTs: NOW - RECO_ORPHAN_MIN_AGE_MS + 1,
    now: NOW,
  }),
  false,
  '최소 나이 경계 직전(1ms 모자람)은 유예',
);
eq(
  shouldDeleteRecoFolder({
    name: 'reco-feed_food-1700000000000',
    refText: EMPTY,
    newestTs: NOW - RECO_ORPHAN_MIN_AGE_MS,
    now: NOW,
  }),
  true,
  '최소 나이 경계 도달이면 삭제',
);
eq(
  shouldDeleteRecoFolder({ name: 'reco-feed_food-1700000000000', refText: EMPTY, newestTs: NOW + 60_000, now: NOW }),
  false,
  '미래 시각(기기 시계 이동)은 유예',
);
eq(
  shouldDeleteRecoFolder({ name: 'trip-normal-1700000000000', refText: EMPTY, newestTs: 1700000000000, now: NOW }),
  false,
  'reco- 접두가 아닌 폴더(일반 여행 폴더)는 절대 삭제 대상이 아니다',
);
eq(RECO_DIR_PREFIX, 'reco-', '접두는 RecoSection의 폴더명 규칙(reco-{카드id}-{ts})과 일치해야 한다');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
