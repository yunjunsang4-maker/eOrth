// src/utils/postCountSync.verify.ts
import { mergeServerPostCounts, type PostCountTarget, type ServerPostCounts } from './postCountSync';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

type Rec = PostCountTarget & { liked?: boolean; title?: string };
const rec = (id: string, remoteId: string | undefined, likes: number, comments = 0, extra: Partial<Rec> = {}): Rec =>
  ({ id, remoteId, likes, comments, ...extra });
const counts = (pairs: [string, ServerPostCounts][]) => new Map<string, ServerPostCounts>(pairs);
const pairsOf = (list: Rec[]) => list.map((r) => [r.likes, r.comments]);

// 1) 정상 경로 — 남이 누른 좋아요·남이 단 댓글이 서버에서 돌아온다(이 버그의 본체)
eq(
  pairsOf(mergeServerPostCounts([rec('l1', 'r1', 0, 0)], counts([['r1', { likes: 3, comments: 2 }]]))),
  [[3, 2]],
  '남이 누른 좋아요 3·댓글 2가 로컬 0을 덮는다'
);

// 2) 서버 값이 더 작을 때도 따른다 — 좋아요 취소·댓글 삭제
eq(
  pairsOf(mergeServerPostCounts([rec('l1', 'r1', 5, 4)], counts([['r1', { likes: 2, comments: 1 }]]))),
  [[2, 1]],
  '취소·삭제로 줄어든 서버 값도 반영한다(증가만 반영하면 영영 안 줄어든다)'
);

// 3) 미발행 로컬 글 — remoteId가 없으면 서버에 대응 행이 없다
eq(
  pairsOf(mergeServerPostCounts([rec('l1', undefined, 4, 3)], counts([['r1', { likes: 9, comments: 9 }]]))),
  [[4, 3]],
  'remoteId 없는 로컬 글은 건드리지 않는다'
);

// 4) 이번 조회에 안 딸려온 글 — 0으로 덮으면 화면의 진짜 카운트가 사라진다
eq(
  pairsOf(mergeServerPostCounts([rec('l1', 'r1', 7, 6)], counts([['r2', { likes: 1, comments: 1 }]]))),
  [[7, 6]],
  'counts에 없는 글은 0으로 덮지 않고 로컬 값을 유지한다'
);

// 5) 좋아요 낙관 반영 진행 중 — 내 탭이 서버로 가는 중에 옛 카운트가 도착하면 하트가 되돌아 보인다
eq(
  pairsOf(mergeServerPostCounts(
    [rec('l1', 'r1', 4, 1)],
    counts([['r1', { likes: 3, comments: 2 }]]),
    { isLikePending: (id) => id === 'l1' }
  )),
  [[4, 2]],
  '좋아요는 진행 중이라 건너뛰되 댓글 수는 그대로 반영한다(가드는 축별로 독립)'
);

// 6) 댓글 목록이 이미 로드된 글 — commentsByPost가 단일 출처라 서버 카운트가 끼어들면 숫자가 깜빡인다
eq(
  pairsOf(mergeServerPostCounts(
    [rec('l1', 'r1', 0, 3)],
    counts([['r1', { likes: 5, comments: 9 }]]),
    { isCommentsLoaded: (id) => id === 'l1' }
  )),
  [[5, 3]],
  '댓글 로드된 글은 댓글 수만 건너뛰고 좋아요는 반영한다'
);
eq(
  pairsOf(mergeServerPostCounts(
    [rec('l1', 'r1', 0, 3), rec('l2', 'r2', 0, 0)],
    counts([['r1', { likes: 5, comments: 9 }], ['r2', { likes: 1, comments: 4 }]]),
    { isCommentsLoaded: (id) => id === 'l1' }
  )),
  [[5, 3], [1, 4]],
  '가드는 해당 글에만 걸리고 나머지는 정상 반영한다'
);

// 7) 참조 동일성 — 바뀐 게 없으면 새 배열을 만들지 않는다(리렌더 방지)
const same = [rec('l1', 'r1', 3, 2)];
eq(mergeServerPostCounts(same, counts([['r1', { likes: 3, comments: 2 }]])) === same, true, '값이 같으면 원본 배열 참조를 유지한다');
const changedList = [rec('l1', 'r1', 3, 2)];
eq(mergeServerPostCounts(changedList, counts([['r1', { likes: 3, comments: 5 }]])) === changedList, false, '댓글 수만 바뀌어도 새 배열을 만든다');
const guardedAll = [rec('l1', 'r1', 3, 2)];
eq(
  mergeServerPostCounts(guardedAll, counts([['r1', { likes: 9, comments: 9 }]]), {
    isLikePending: () => true, isCommentsLoaded: () => true,
  }) === guardedAll,
  true,
  '두 가드에 모두 걸리면 원본 참조 그대로(헛 리렌더 없음)'
);

// 8) 경계 — 빈 목록 / 빈 counts
const emptyList: Rec[] = [];
eq(mergeServerPostCounts(emptyList, counts([['r1', { likes: 1, comments: 1 }]])) === emptyList, true, '빈 목록은 그대로 반환');
const one = [rec('l1', 'r1', 2, 2)];
eq(mergeServerPostCounts(one, counts([])) === one, true, '빈 counts(서버가 0건)면 원본 유지');

// 9) 널 계열·이상값 — 서버 이상값이 화면에 새지 않게
eq(
  pairsOf(mergeServerPostCounts([rec('l1', 'r1', 5, 5)], counts([['r1', { likes: NaN, comments: NaN }]]))),
  [[5, 5]],
  'NaN은 무시하고 로컬 값을 지킨다(화면에 NaN이 찍히면 카운트가 통째로 깨진다)'
);
eq(
  pairsOf(mergeServerPostCounts([rec('l1', 'r1', 5, 5)], counts([['r1', { likes: -3, comments: -1 }]]))),
  [[0, 0]],
  '음수는 0으로 바닥친다'
);
eq(
  pairsOf(mergeServerPostCounts([rec('l1', 'r1', 1, 1)], counts([['r1', { likes: 2.7, comments: 3.9 }]]))),
  [[2, 3]],
  '소수는 버림 — 카운트는 정수여야 한다'
);
eq(
  pairsOf(mergeServerPostCounts([rec('l1', 'r1', 3, 3)], counts([['r1', { likes: 0, comments: 0 }]]))),
  [[0, 0]],
  '서버 0은 유효한 값이라 반영한다(전원 취소·전량 삭제)'
);
eq(
  pairsOf(mergeServerPostCounts(
    [rec('l1', 'r1', 3, 3)],
    counts([['r1', { likes: 4, comments: undefined as unknown as number }]])
  )),
  [[4, 3]],
  '한 축이 undefined면 그 축만 로컬 유지(나머지는 반영)'
);

// 10) 다른 필드 보존 — 카운트만 갈아끼우고 liked(내 하트)·본문은 그대로여야 한다
const merged = mergeServerPostCounts(
  [rec('l1', 'r1', 0, 0, { liked: true, title: '도쿄' })],
  counts([['r1', { likes: 5, comments: 2 }]])
);
eq(merged[0], { id: 'l1', remoteId: 'r1', likes: 5, comments: 2, liked: true, title: '도쿄' }, 'liked·기타 필드는 보존한다');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
