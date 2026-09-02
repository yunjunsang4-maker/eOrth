/**
 * 서버의 게시물 카운터(좋아요·댓글 수)를 로컬 기록 목록에 병합한다.
 *
 * 왜 필요한가 — 내 글(records)의 `likes`·`comments`는 '내가' 움직일 때만 바뀐다.
 * 남이 누른 좋아요·남이 단 댓글은 서버 posts.likes_count/comments_count 에만 쌓이고
 * 앱으로 돌아오는 경로가 없었다(fetchFeed는 내 글을 제외하고, hydrateMyRecords는
 * 계정 전환 때만 돈다) → 작성자에게는 좋아요가 영원히 0으로 보였다. 여기가 그 되돌아오는 길이다.
 *
 * 화면(React)에서 쓰기 때문에 **변경이 없으면 원본 배열 참조를 그대로 돌려준다** —
 * 매번 새 배열을 만들면 setRecords가 항상 리렌더를 일으킨다.
 */
export interface ServerPostCounts {
  /** 옛 행이나 이상 응답이면 없을 수 있다 — 그 축은 로컬 값을 지킨다 */
  likes?: number;
  comments?: number;
}

export interface PostCountTarget {
  /** 로컬 id — 진행 중/로드됨 판정(가드)의 키 */
  id: string;
  /** 서버 posts.id. 미발행 글은 없다 */
  remoteId?: string;
  likes: number;
  comments: number;
}

export interface MergeCountsGuards {
  /** 그 글의 좋아요 서버 반영이 진행 중이거나 방금 탭했는가 — 서버 값이 낙관 반영을 되돌린다 */
  isLikePending?: (localId: string) => boolean;
  /**
   * 그 글의 댓글 목록이 이미 로드돼 있는가.
   *
   * 로드된 글의 `comments`는 commentsByPost(실제 댓글 목록)가 단일 출처이고 스토어의
   * 동기화 effect가 그 값으로 계속 덮는다. 여기서 서버 카운트를 밀어 넣으면 두 출처가
   * 서로를 덮어 숫자가 깜빡이므로, 로드된 글의 댓글 수는 건드리지 않는다.
   * (좋아요는 그런 상세 출처가 없어 이 규칙을 적용하지 않는다.)
   */
  isCommentsLoaded?: (localId: string) => boolean;
}

/** 서버가 준 카운터를 화면에 쓸 수 있는 정수로 — 이상값이 UI에 새지 않게 */
const sanitize = (n: number | undefined, current: number): number => {
  if (n === undefined || !Number.isFinite(n)) return current;
  return Math.max(0, Math.trunc(n));
};

export function mergeServerPostCounts<T extends PostCountTarget>(
  list: T[],
  counts: Map<string, ServerPostCounts>,
  guards: MergeCountsGuards = {}
): T[] {
  if (list.length === 0 || counts.size === 0) return list;
  const { isLikePending, isCommentsLoaded } = guards;
  let changed = false;
  const next = list.map((r) => {
    if (!r.remoteId) return r; // 미발행 로컬 글 — 서버에 대응 행이 없다
    const c = counts.get(r.remoteId);
    if (!c) return r; // 이번 조회에 안 딸려온 글 — 0으로 덮으면 안 된다
    const likes = isLikePending?.(r.id) ? r.likes : sanitize(c.likes, r.likes);
    const comments = isCommentsLoaded?.(r.id) ? r.comments : sanitize(c.comments, r.comments);
    if (likes === r.likes && comments === r.comments) return r;
    changed = true;
    return { ...r, likes, comments };
  });
  return changed ? next : list;
}
