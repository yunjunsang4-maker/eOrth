// src/utils/mergeMyRecords.verify.ts
import {
  mergeMyRecords,
  findMissingPostIds,
  classifyServerPosts,
  mergeServerUpdate,
  type MergeableRecord,
  type ServerPostRef,
} from './mergeMyRecords';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// 픽스처: 사진 URI를 함께 들고 다녀야 "서버본이 로컬 사진을 덮는가"를 볼 수 있다.
type Rec = MergeableRecord & { photo?: string; title?: string };
/** 로컬에서 쓴 글 — 로컬 id + 서버 uuid(remoteId) 조합, 사진은 로컬 영속 경로 */
const localRec = (id: string, remoteId: string | undefined, extra: Partial<Rec> = {}): Rec =>
  ({ id, remoteId, ...extra });
/** 서버에서 받은 글 — mapRowToRecord가 id === remoteId === row.id 로 만든다 */
const serverRec = (remoteId: string, extra: Partial<Rec> = {}): Rec =>
  ({ id: remoteId, remoteId, ...extra });
const idsOf = (list: Rec[]) => list.map((r) => r.id);

// 1) 빈 로컬 + 서버 3건 — 새 기기 최초 복원(계정 전환 경로도 resetRecords 직후라 이 모양)
eq(
  idsOf(mergeMyRecords([], [serverRec('r1'), serverRec('r2'), serverRec('r3')])),
  ['r1', 'r2', 'r3'],
  '빈 로컬에 서버 3건이 그대로 들어온다(교체 방식과 결과 동일 — 계정 전환 경로 회귀 없음)'
);

// 2) 완전 중복 — 이미 다 있는 상태에서 동기화가 또 돌아도 늘어나면 안 된다
const dupLocal = [localRec('local-1', 'r1'), localRec('local-2', 'r2')];
eq(
  idsOf(mergeMyRecords(dupLocal, [serverRec('r1'), serverRec('r2')])),
  ['local-1', 'local-2'],
  '완전 중복이면 아무것도 추가하지 않는다(로컬 id가 서버 uuid로 바뀌지도 않는다)'
);
eq(
  mergeMyRecords(dupLocal, [serverRec('r1'), serverRec('r2')]) === dupLocal,
  true,
  '추가분이 없으면 원본 배열 참조를 유지한다(헛 리렌더 방지)'
);

// 3) 부분 중복 — 이번 수정의 본체. 다른 기기에서 쓴 r3만 넘어와야 한다
eq(
  idsOf(mergeMyRecords(
    [localRec('local-1', 'r1')],
    [serverRec('r1'), serverRec('r3')]
  )),
  ['local-1', 'r3'],
  '서버에만 있는 글(r3 = 다른 기기에서 쓴 내 글)만 뒤에 추가된다'
);

// 4) remoteId 없는 로컬 초안·미발행 글 보존 — 교체 방식(setRecords(mine))이 날려먹던 지점
eq(
  idsOf(mergeMyRecords(
    [localRec('draft-1', undefined), localRec('local-1', 'r1')],
    [serverRec('r1'), serverRec('r2')]
  )),
  ['draft-1', 'local-1', 'r2'],
  'remoteId 없는 로컬 초안은 무조건 보존된다'
);

// 5) 로컬에만 있고 서버 목록에 없는 remoteId 보존 —
//    fetchMyPosts는 중간 페이지 실패 시 부분 목록을 주고 MAX_POSTS 상한도 있어
//    "목록에 없다"가 "삭제됐다"가 아니다. 삭제 전파는 이 함수의 범위가 아니다.
eq(
  idsOf(mergeMyRecords(
    [localRec('local-1', 'r1'), localRec('local-9', 'r9')],
    [serverRec('r1')]
  )),
  ['local-1', 'local-9'],
  '서버 목록에 없는 로컬 기록도 지우지 않는다(부분 응답을 삭제로 오인 금지)'
);

// 6) incoming 자체의 중복 — 서버 페이지 경계가 겹치면 같은 행이 두 번 올 수 있다
eq(
  idsOf(mergeMyRecords([], [serverRec('r1'), serverRec('r1'), serverRec('r2')])),
  ['r1', 'r2'],
  'incoming 내부 중복도 remoteId로 제거한다'
);

// 7) 로컬 사진 URI가 서버 URL로 덮이지 않는다 —
//    덮으면 persistRecordPhotos가 만든 영속 URI가 원격 URL로 밀려 오프라인에서 사진이 깨진다.
const photoMerged = mergeMyRecords(
  [localRec('local-1', 'r1', { photo: 'file:///docs/eorth/r1.jpg', title: '도쿄' })],
  [serverRec('r1', { photo: 'https://cdn.example/r1.jpg', title: '도쿄(서버본)' })]
);
eq(
  photoMerged[0],
  { id: 'local-1', remoteId: 'r1', photo: 'file:///docs/eorth/r1.jpg', title: '도쿄' },
  '이미 있는 글은 로컬본을 그대로 둔다 — 사진 경로도 제목도 서버본이 덮지 않는다'
);

// 8) 경계 — 빈 incoming / 양쪽 다 빈 경우
const only = [localRec('local-1', 'r1')];
eq(mergeMyRecords(only, []) === only, true, '서버가 0건이면 원본 참조 그대로(로컬을 비우지 않는다)');
eq(mergeMyRecords([], []), [], '양쪽 다 비면 빈 배열');

// 9) 널 계열 — remoteId가 undefined / 빈 문자열인 서버본은 대조 키가 없다.
//    받아들이면 동기화가 돌 때마다 같은 글이 한 벌씩 늘어난다(무한 증식).
eq(
  idsOf(mergeMyRecords([], [{ id: 'x' } as Rec, { id: 'y', remoteId: '' } as Rec, serverRec('r1')])),
  ['r1'],
  'remoteId가 없거나 빈 문자열인 서버본은 버린다(키 없는 행의 무한 증식 방지)'
);

// 10) 불변식: 반환 길이 >= local 길이. 어떤 입력에서도 로컬 기록은 사라지지 않는다.
const invariantCases: [Rec[], Rec[]][] = [
  [[], []],
  [[localRec('a', undefined)], []],
  [[localRec('a', 'r1')], [serverRec('r2')]],
  [[localRec('a', 'r1'), localRec('b', undefined)], [serverRec('r1'), serverRec('r1')]],
  [[localRec('a', 'r1')], [{ id: 'z' } as Rec]],
];
eq(
  invariantCases.every(([l, i]) => mergeMyRecords(l, i).length >= l.length),
  true,
  '불변식: 결과 길이가 로컬 길이보다 작아지는 입력이 없다'
);
// 로컬 원소가 전부 그대로 남아 있는지도 확인(길이만 맞고 내용이 바뀌는 사고 방지)
eq(
  invariantCases.every(([l, i]) => {
    const out = mergeMyRecords(l, i);
    return l.every((r) => out.includes(r));
  }),
  true,
  '불변식: 로컬 원소는 객체 참조 그대로 결과에 남는다'
);

// ─────────────────────────────────────────────
// findMissingPostIds — 서버 프로브 결과에서 '본문을 받아야 할 글' 고르기
// ─────────────────────────────────────────────
const srv = (id: string, clientId?: string | null): ServerPostRef => ({ id, clientId });

// 11) 정상 경로 — 로컬에 없는 서버 글만 고른다
eq(
  findMissingPostIds([localRec('local-1', 'r1')], [srv('r1'), srv('r2'), srv('r3')]),
  ['r2', 'r3'],
  '로컬 remoteId에 없는 서버 글만 고른다'
);

// 12) 전부 있는 정상 상태 — 추가 요청 0회여야 한다(이 동기화의 비용 전제)
eq(
  findMissingPostIds([localRec('local-1', 'r1'), localRec('local-2', 'r2')], [srv('r1'), srv('r2')]),
  [],
  '빠진 글이 없으면 빈 배열 — 본문 조회가 아예 안 나간다'
);

// 13) 발행 orphan (F2의 본체) — insert는 됐는데 remoteId 부착 전에 앱이 죽은 경우.
//     로컬 R은 remoteId가 없지만 서버 S의 client_id가 R의 로컬 id다.
eq(
  findMissingPostIds(
    [localRec('rec-1757-ab12', undefined)],
    [srv('r-uuid-1', 'rec-1757-ab12')]
  ),
  [],
  'client_id가 로컬 레코드 id와 맞으면 빠진 글이 아니다(발행 orphan 중복 방지)'
);

// 14) 다른 기기에서 쓴 글은 client_id가 이 기기의 어떤 로컬 id와도 안 겹친다 → 정상 수신
eq(
  findMissingPostIds(
    [localRec('rec-1757-ab12', 'r1')],
    [srv('r1', 'rec-1757-ab12'), srv('r2', 'rec-9999-zz99')]
  ),
  ['r2'],
  '다른 기기 글(client_id가 로컬에 없음)은 그대로 빠진 글로 잡힌다'
);

// 15) client_id가 없는 옛 행 — 조건 ②를 적용할 수 없으니 조건 ①만으로 판정
eq(
  findMissingPostIds([localRec('local-1', undefined)], [srv('r1'), srv('r2', null)]),
  ['r1', 'r2'],
  'client_id가 undefined·null인 옛 행은 조건 ①만으로 판정한다'
);

// 16) 빈 문자열 client_id — 로컬 id 집합과 대조하면 안 된다(빈 id가 있을 리 없지만 방어)
eq(
  findMissingPostIds([localRec('local-1', undefined)], [srv('r1', '')]),
  ['r1'],
  "client_id가 빈 문자열이면 매칭 키로 쓰지 않는다"
);

// 17) 경계 — 서버 0건 / 로컬 0건 / 프로브 중복 / 키 없는 행
eq(findMissingPostIds([localRec('local-1', 'r1')], []), [], '서버 0건이면 빈 배열');
eq(findMissingPostIds([], [srv('r1'), srv('r2')]), ['r1', 'r2'], '로컬이 비면 서버 전부가 대상(새 기기)');
eq(findMissingPostIds([], [srv('r1'), srv('r1'), srv('r2')]), ['r1', 'r2'], '프로브 페이지 경계 중복은 제거한다');
eq(
  findMissingPostIds([], [{ id: '' } as ServerPostRef, srv('r1')]),
  ['r1'],
  'id 없는 서버 행은 버린다(본문 조회 대상이 될 수 없다)'
);

// 18) 순서 보존 — 프로브는 최신순이라 그 순서를 유지해야 본문 조회도 최신 우선이 된다
eq(
  findMissingPostIds([], [srv('r3'), srv('r1'), srv('r2')]),
  ['r3', 'r1', 'r2'],
  '입력(최신순) 순서를 유지한다'
);

// ─────────────────────────────────────────────
// classifyServerPosts — 프로브 한 번으로 새 글/삭제/수정 세 갈래
// ─────────────────────────────────────────────
/** 프로브 행 — updatedAt·deletedAt까지 지정 가능 */
const row = (id: string, o: Partial<ServerPostRef> = {}): ServerPostRef => ({ id, ...o });
/** 기준선(serverUpdatedAt)이 있는 로컬 기록 */
const baseRec = (id: string, remoteId: string, at?: number): Rec =>
  ({ id, remoteId, ...(at === undefined ? {} : { serverUpdatedAt: at }) });

// 19) 세 갈래가 한 번에 나온다 — 이 함수의 본체
{
  const local = [
    baseRec('local-1', 'r1', 1000),  // 서버가 더 최신 → stale
    baseRec('local-2', 'r2', 5000),  // 서버가 같음 → 아무것도 아님
    baseRec('local-3', 'r3', 3000),  // 삭제표식 → tombstoned
  ];
  const server = [
    row('r1', { updatedAt: 2000 }),
    row('r2', { updatedAt: 5000 }),
    row('r3', { updatedAt: 4000, deletedAt: 4000 }),
    row('r4', { updatedAt: 7000 }), // 다른 기기에서 쓴 새 글 → missing
  ];
  const c = classifyServerPosts(local, server);
  eq(c.stale, ['r1'], '서버 updated_at이 로컬 기준선보다 크면 stale');
  eq(c.tombstoned, ['local-3'], '삭제표식은 **로컬 레코드 id**로 돌려준다(호출부가 그 id로 지운다)');
  eq(c.missing, ['r4'], '로컬에 없는 살아있는 글만 missing');
  eq(c.baseline, [], '기준선이 이미 있는 기록은 baseline에 안 들어간다');
}

// 20) 삭제표식이 있는 글은 missing에 절대 들어가면 안 된다 —
//     들어가면 다른 기기에서 지운 글을 본문까지 받아와 되살린다(가장 비싼 실패).
eq(
  classifyServerPosts([], [row('r1', { deletedAt: 9000, updatedAt: 9000 })]).missing,
  [],
  '삭제표식이 있고 로컬에 없으면 아무 갈래에도 안 들어간다(되살리기 금지)'
);
eq(
  classifyServerPosts([], [row('r1', { deletedAt: 9000 })]).tombstoned,
  [],
  '로컬에 없는 글의 삭제표식은 지울 대상이 없다'
);

// 21) client_id로도 삭제를 매칭한다 — 발행 orphan(remoteId 미부착) 상태에서 다른 기기가 지운 경우.
//     remoteId만 보면 영영 못 지운다.
eq(
  classifyServerPosts(
    [localRec('rec-1757-ab12', undefined)],
    [row('r-uuid-1', { clientId: 'rec-1757-ab12', deletedAt: 9000 })]
  ).tombstoned,
  ['rec-1757-ab12'],
  'client_id로 매칭된 orphan도 삭제표식으로 지운다'
);

// 22) serverUpdatedAt이 없는 기록은 stale로 잡지 않는다 —
//     잡으면 이 기능을 켜는 첫 동기화에서 전 기록의 본문을 통째로 다시 받는다.
{
  const c = classifyServerPosts([localRec('local-1', 'r1')], [row('r1', { updatedAt: 8000 })]);
  eq(c.stale, [], '기준선 없는(A안 이전) 기록은 stale로 잡지 않는다');
  eq(c.baseline, [{ postId: 'r1', updatedAt: 8000 }], '대신 본문 재조회 없이 기준선만 심는다');
}

// 23) 기준선과 같거나 더 오래된 서버 값 — 내가 방금 쓴 글이 매번 다시 내려오면 안 된다
eq(
  classifyServerPosts([baseRec('local-1', 'r1', 5000)], [row('r1', { updatedAt: 5000 })]).stale,
  [],
  '서버 updated_at이 기준선과 같으면 stale이 아니다(내가 방금 쓴 글 재수신 방지)'
);
eq(
  classifyServerPosts([baseRec('local-1', 'r1', 5000)], [row('r1', { updatedAt: 4000 })]).stale,
  [],
  '서버 updated_at이 더 오래됐으면 stale이 아니다'
);

// 24) 구 서버 폴백 — updatedAt/deletedAt이 없으면(undefined·null) 수정·삭제 전파가 조용히 꺼진다.
//     이때도 '새 글 받기'는 계속 동작해야 한다(A안 수준으로 열화될 뿐).
{
  const c = classifyServerPosts([localRec('local-1', 'r1')], [srv('r1'), srv('r2')]);
  eq(c.stale, [], '구 서버 폴백(updatedAt 없음)에서는 stale이 안 생긴다');
  eq(c.tombstoned, [], '구 서버 폴백(deletedAt 없음)에서는 삭제도 안 생긴다');
  eq(c.missing, ['r2'], '구 서버 폴백에서도 새 글 받기는 그대로 동작한다');
  eq(c.baseline, [], 'updatedAt이 없으면 심을 기준선도 없다');
}

// 25) deletedAt이 0/null인 행은 살아있는 글이다(널 계열 구분)
eq(
  classifyServerPosts([baseRec('local-1', 'r1', 1000)], [row('r1', { updatedAt: 2000, deletedAt: null })]).stale,
  ['r1'],
  'deletedAt이 null이면 살아있는 글로 보고 수정 판정을 한다'
);

// 26) 프로브 중복 행이 같은 로컬 기록을 두 번 지우게 하지 않는다
eq(
  classifyServerPosts(
    [baseRec('local-1', 'r1', 1000)],
    [row('r1', { deletedAt: 9000 }), row('r1', { deletedAt: 9000 })]
  ).tombstoned,
  ['local-1'],
  '프로브 페이지 경계 중복이 있어도 tombstoned는 한 번만'
);

// 27) findMissingPostIds는 classifyServerPosts의 래퍼 — 기존 계약이 그대로 유지된다
eq(
  findMissingPostIds([localRec('local-1', 'r1')], [row('r1'), row('r2'), row('r3', { deletedAt: 1 })]),
  ['r2'],
  '래퍼는 missing만 돌려준다(삭제표식 행은 여기서도 빠진다)'
);

// ─────────────────────────────────────────────
// mergeServerUpdate — 수정된 서버본 덮되 미디어·로컬 전용 필드는 보존
// ─────────────────────────────────────────────
type FullRec = MergeableRecord & {
  content?: string;
  medias?: string[];
  representativePhoto?: string;
  snapFrontUri?: string;
  thumbs?: Record<string, string>;
  cutPhoto?: { previewUri: string; photos: string[]; frameImage?: string; frameId?: string };
  blogBlocks?: Record<string, any>[];
  perCountryData?: Record<string, { medias?: string[]; representativePhoto?: string; rating?: number }>;
  liked?: boolean;
  isMyPost?: boolean;
  uploadedMediaUrls?: Record<string, string>;
  mediaAssetIds?: Record<string, string>;
  tripGroupId?: string | null;
};

// 28) 핵심 규칙 — 로컬 파일은 지키고 원격 URL 자리는 서버본을 채택한다
{
  const local: FullRec = {
    id: 'local-1',
    remoteId: 'r1',
    serverUpdatedAt: 1000,
    content: '옛 본문',
    medias: ['file:///docs/eorth/a.jpg', 'https://cdn.example/old-b.jpg'],
  };
  const server: FullRec = {
    id: 'r1',
    remoteId: 'r1',
    serverUpdatedAt: 2000,
    content: '고친 본문',
    medias: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'],
  };
  const out = mergeServerUpdate(local, server);
  eq(out.content, '고친 본문', '본문은 서버본을 채택한다(이게 수정 전파의 본체)');
  eq(
    out.medias,
    ['file:///docs/eorth/a.jpg', 'https://cdn.example/b.jpg'],
    '로컬 파일 자리는 지키고(오프라인 사진 보호), 원격 URL 자리는 서버본으로 갱신한다'
  );
  eq(out.id, 'local-1', '로컬 id를 유지한다 — 서버 uuid로 바꾸면 여행 카드 참조가 끊긴다');
  eq(out.remoteId, 'r1', 'remoteId는 유지된다');
  eq(out.serverUpdatedAt, 2000, '기준선을 서버 값으로 옮긴다(같은 수정을 매번 다시 받지 않게)');
  eq(local.content, '옛 본문', '입력(local)을 변형하지 않는다');
}

// 29) 장수가 달라지면 인덱스 대응이 깨지므로 서버본을 통째로 채택한다
eq(
  mergeServerUpdate(
    { id: 'l', remoteId: 'r1', medias: ['file:///a.jpg', 'file:///b.jpg'] } as FullRec,
    { id: 'r1', remoteId: 'r1', medias: ['https://cdn/a.jpg'] } as FullRec
  ).medias,
  ['https://cdn/a.jpg'],
  '사진 장수가 달라졌으면(다른 기기에서 넣거나 뺌) 서버본을 통째로 쓴다'
);

// 30) 로컬 전용 필드 보존 — 서버본의 값이 덮으면 안 되는 것들
{
  const local: FullRec = {
    id: 'local-1', remoteId: 'r1',
    liked: true, isMyPost: true,
    uploadedMediaUrls: { 'file:///a.jpg': 'https://cdn/a.jpg' },
    mediaAssetIds: { 'file:///a.jpg': 'asset-1' },
    tripGroupId: 'trip-local-9',
  };
  const server: FullRec = {
    id: 'r1', remoteId: 'r1',
    liked: false, isMyPost: false,
    tripGroupId: 'trip-other-device',
  };
  const out = mergeServerUpdate(local, server);
  eq(out.isMyPost, true, 'isMyPost가 false로 뒤집히지 않는다(뒤집히면 수정·삭제 경로가 막힌다)');
  eq(out.liked, true, '내 좋아요는 로컬 값을 지킨다');
  eq(out.uploadedMediaUrls, { 'file:///a.jpg': 'https://cdn/a.jpg' }, '업로드 캐시는 이 기기 자산이다');
  eq(out.mediaAssetIds, { 'file:///a.jpg': 'asset-1' }, '사진첩 assetId 참조도 이 기기 자산이다');
  eq(out.tripGroupId, 'trip-local-9', '여행 카드 id는 로컬 id 공간 — 서버본 값은 남의 카드 id다');
}

// 31) 중첩 구조 ① 네컷(cutPhoto) — 4장·미리보기·프레임 사진이 각각 판정된다
{
  const out = mergeServerUpdate(
    {
      id: 'l', remoteId: 'r1',
      cutPhoto: {
        previewUri: 'file:///p.jpg',
        photos: ['file:///1.jpg', 'https://cdn/old2.jpg', 'file:///3.jpg', 'file:///4.jpg'],
        frameImage: 'file:///frame.jpg',
        frameId: 'basic',
      },
    } as FullRec,
    {
      id: 'r1', remoteId: 'r1',
      cutPhoto: {
        previewUri: 'https://cdn/p.jpg',
        photos: ['https://cdn/1.jpg', 'https://cdn/2.jpg', 'https://cdn/3.jpg', 'https://cdn/4.jpg'],
        frameImage: 'https://cdn/frame.jpg',
        frameId: 'polaroid',
      },
    } as FullRec
  );
  eq(out.cutPhoto?.previewUri, 'file:///p.jpg', '네컷 미리보기: 로컬 파일 유지');
  eq(
    out.cutPhoto?.photos,
    ['file:///1.jpg', 'https://cdn/2.jpg', 'file:///3.jpg', 'file:///4.jpg'],
    '네컷 4장: 로컬 파일 자리만 지키고 나머지는 서버본'
  );
  eq(out.cutPhoto?.frameImage, 'file:///frame.jpg', '프레임 배경 사진도 로컬 파일이면 유지');
  eq(out.cutPhoto?.frameId, 'polaroid', '사진이 아닌 네컷 설정(frameId)은 서버본이 이긴다');
}

// 32) 중첩 구조 ② 블로그 블록 — **id로 대응**시킨다.
//     다른 기기에서 문단을 하나 끼워 넣어도 사진 블록의 로컬 파일을 계속 알아봐야 한다.
{
  const out = mergeServerUpdate(
    {
      id: 'l', remoteId: 'r1',
      blogBlocks: [
        { id: 'b1', type: 'image', uri: 'file:///img1.jpg' },
        { id: 'b2', type: 'images', items: [{ uri: 'file:///g1.jpg' }, { uri: 'https://cdn/old-g2.jpg' }], layout: 'grid2' },
        { id: 'b3', type: 'video', uri: 'file:///v.mp4', thumbnail: 'file:///vt.jpg' },
      ],
    } as FullRec,
    {
      id: 'r1', remoteId: 'r1',
      blogBlocks: [
        { id: 'b0', type: 'text', value: '새로 넣은 문단' },
        { id: 'b1', type: 'image', uri: 'https://cdn/img1.jpg', caption: '캡션 추가' },
        { id: 'b2', type: 'images', items: [{ uri: 'https://cdn/g1.jpg' }, { uri: 'https://cdn/g2.jpg' }], layout: 'grid3' },
        { id: 'b3', type: 'video', uri: 'https://cdn/v.mp4', thumbnail: 'https://cdn/vt.jpg' },
      ],
    } as FullRec
  );
  eq(out.blogBlocks?.length, 4, '블록 개수·순서는 서버본을 따른다(문단 추가가 전파된다)');
  eq(out.blogBlocks?.[0], { id: 'b0', type: 'text', value: '새로 넣은 문단' }, '로컬에 없던 블록은 서버본 그대로');
  eq(
    out.blogBlocks?.[1],
    { id: 'b1', type: 'image', uri: 'file:///img1.jpg', caption: '캡션 추가' },
    '이미지 블록: uri는 로컬 파일 유지, 캡션 같은 나머지는 서버본'
  );
  eq(
    out.blogBlocks?.[2].items,
    [{ uri: 'file:///g1.jpg' }, { uri: 'https://cdn/g2.jpg' }],
    '여러장 블록: 항목별로 로컬 파일만 지킨다'
  );
  eq(out.blogBlocks?.[2].layout, 'grid3', '여러장 블록의 레이아웃 변경은 전파된다');
  eq(
    out.blogBlocks?.[3],
    { id: 'b3', type: 'video', uri: 'file:///v.mp4', thumbnail: 'file:///vt.jpg' },
    '영상 블록: uri와 썸네일 둘 다 로컬 파일이면 유지'
  );
}

// 33) 중첩 구조 ③ 국가별 데이터 + 썸네일 매핑
{
  const out = mergeServerUpdate(
    {
      id: 'l', remoteId: 'r1',
      perCountryData: { 일본: { medias: ['file:///jp.jpg'], representativePhoto: 'file:///jp.jpg', rating: 3 } },
      thumbs: { 'https://cdn/a.jpg': 'https://cdn/a-640.jpg' },
    } as FullRec,
    {
      id: 'r1', remoteId: 'r1',
      perCountryData: {
        일본: { medias: ['https://cdn/jp.jpg'], representativePhoto: 'https://cdn/jp.jpg', rating: 5 },
        대만: { medias: ['https://cdn/tw.jpg'] },
      },
      thumbs: { 'https://cdn/b.jpg': 'https://cdn/b-640.jpg' },
    } as FullRec
  );
  eq(out.perCountryData?.['일본'].medias, ['file:///jp.jpg'], '국가별 사진도 로컬 파일이면 유지');
  eq(out.perCountryData?.['일본'].rating, 5, '국가별 평점 변경은 전파된다');
  eq(out.perCountryData?.['대만'].medias, ['https://cdn/tw.jpg'], '서버에만 있는 국가는 그대로 들어온다');
  eq(
    out.thumbs,
    { 'https://cdn/a.jpg': 'https://cdn/a-640.jpg', 'https://cdn/b.jpg': 'https://cdn/b-640.jpg' },
    '축소본 매핑은 합집합(로컬이 만든 축소본을 잃으면 목록이 원본을 내려받는다)'
  );
}

// 34) 널 계열 — 서버본에 미디어 필드가 아예 없을 때(글에서 사진을 전부 뺌).
//     ★ 규칙: medias의 '자리'가 통째로 사라졌으므로 거기 딸린 대표사진도 함께 서버본으로 간다.
//     (예전에는 대표사진만 file://로 남아 존재하지 않는 사진 집합을 가리켰다 — F5)
{
  const out = mergeServerUpdate(
    {
      id: 'l', remoteId: 'r1',
      medias: ['file:///a.jpg'],
      representativePhoto: 'file:///a.jpg',
      snapFrontUri: 'file:///front.jpg',
    } as FullRec,
    { id: 'r1', remoteId: 'r1' } as FullRec
  );
  eq(out.medias, undefined, '서버가 사진 필드를 안 주면(글에서 사진을 다 뺌) 로컬 배열도 따라 비운다');
  eq(
    out.representativePhoto,
    undefined,
    '대표사진은 medias에 딸린다 — 사진 집합이 사라지면 로컬 파일이라도 함께 비운다'
  );
  eq(
    out.snapFrontUri,
    'file:///front.jpg',
    '배열에 딸리지 않은 독립 uri(스냅 전면)는 로컬 파일이 계속 이긴다'
  );
}

// 34-b) 장수가 바뀌면 대표사진·대표원본도 서버본으로 — 한 레코드 안에서 규칙이 갈리지 않는다
{
  const out = mergeServerUpdate(
    {
      id: 'l', remoteId: 'r1',
      medias: ['file:///a.jpg', 'file:///b.jpg'],
      representativePhoto: 'file:///a.jpg',
    } as FullRec,
    {
      id: 'r1', remoteId: 'r1',
      medias: ['https://cdn/a.jpg', 'https://cdn/b.jpg', 'https://cdn/c.jpg'],
      representativePhoto: 'https://cdn/a.jpg',
    } as FullRec
  );
  eq(out.medias, ['https://cdn/a.jpg', 'https://cdn/b.jpg', 'https://cdn/c.jpg'], '장수 변경 → 배열은 서버본');
  eq(out.representativePhoto, 'https://cdn/a.jpg', '장수 변경 → 대표사진도 서버본(혼합 상태 방지)');
}

// 34-c) medias가 애초에 없는 기록은 대표사진이 독립 uri다 — 로컬 파일 승리 규칙 유지
eq(
  mergeServerUpdate(
    { id: 'l', remoteId: 'r1', representativePhoto: 'file:///cover.jpg' } as FullRec,
    { id: 'r1', remoteId: 'r1', representativePhoto: 'https://cdn/cover.jpg' } as FullRec
  ).representativePhoto,
  'file:///cover.jpg',
  '양쪽 다 medias가 없으면 딸린 관계가 없다 — 대표사진은 로컬 파일이 이긴다'
);

// 34-d) 네컷 미리보기는 photos에 딸린다(4장을 합성한 결과물)
{
  const out = mergeServerUpdate(
    {
      id: 'l', remoteId: 'r1',
      cutPhoto: { previewUri: 'file:///p.jpg', photos: ['file:///1.jpg'], frameImage: 'file:///f.jpg' },
    } as FullRec,
    {
      id: 'r1', remoteId: 'r1',
      cutPhoto: {
        previewUri: 'https://cdn/p.jpg',
        photos: ['https://cdn/1.jpg', 'https://cdn/2.jpg'],
        frameImage: 'https://cdn/f.jpg',
      },
    } as FullRec
  );
  eq(out.cutPhoto?.previewUri, 'https://cdn/p.jpg', '네컷 장수가 바뀌면 미리보기도 서버본(합성 원본이 달라졌다)');
  eq(out.cutPhoto?.frameImage, 'file:///f.jpg', '프레임 배경은 photos에 딸리지 않은 독립 uri — 로컬 유지');
}

// 34-e) 국가별 대표사진도 그 국가 medias에 딸린다
eq(
  mergeServerUpdate(
    {
      id: 'l', remoteId: 'r1',
      perCountryData: { 일본: { medias: ['file:///jp.jpg'], representativePhoto: 'file:///jp.jpg' } },
    } as FullRec,
    {
      id: 'r1', remoteId: 'r1',
      perCountryData: { 일본: { medias: ['https://cdn/jp1.jpg', 'https://cdn/jp2.jpg'], representativePhoto: 'https://cdn/jp1.jpg' } },
    } as FullRec
  ).perCountryData?.['일본'].representativePhoto,
  'https://cdn/jp1.jpg',
  '국가별 사진 장수가 바뀌면 그 국가 대표사진도 서버본'
);

// 35) 서버본에 기준선이 없으면 로컬 기준선을 잃지 않는다(퇴행 방지)
eq(
  mergeServerUpdate(
    { id: 'l', remoteId: 'r1', serverUpdatedAt: 1000 } as FullRec,
    { id: 'r1', remoteId: 'r1' } as FullRec
  ).serverUpdatedAt,
  1000,
  '서버본에 serverUpdatedAt이 없으면 로컬 기준선을 유지한다'
);

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
