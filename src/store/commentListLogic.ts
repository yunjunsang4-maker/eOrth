import type { PostComment } from './recordStore';

/** 목록에서 빠진 댓글 1개와 원래 자리 — 서버 삭제 실패 시 그 하나만 되돌리는 데 쓴다 */
export interface RemovedComment {
  comment: PostComment;
  parentId: string | null; // 답글이면 부모 top-level 댓글 id
  index: number;           // top-level 목록 또는 부모 replies 안 위치
}

/** 댓글(top-level 또는 답글)을 뺀다. 못 찾으면 list 그대로·removed null. 입력은 mutate하지 않는다. */
export function removeComment(list: PostComment[], id: string): { next: PostComment[]; removed: RemovedComment | null } {
  const top = list.findIndex((c) => c.id === id);
  if (top >= 0) return { next: list.filter((_, i) => i !== top), removed: { comment: list[top], parentId: null, index: top } };
  for (const c of list) {
    const ri = c.replies?.findIndex((r) => r.id === id) ?? -1;
    if (ri >= 0) {
      return {
        next: list.map((p) => (p === c ? { ...p, replies: p.replies!.filter((_, i) => i !== ri) } : p)),
        removed: { comment: c.replies![ri], parentId: c.id, index: ri },
      };
    }
  }
  return { next: list, removed: null };
}

/**
 * 뺐던 댓글 하나만 원래 자리로 되돌린다. 목록 스냅샷으로 통째 복원하면 그 사이에 단 댓글이
 * 지워진다(2026-09-29 소셜 탭 점검 9번). 이미 있으면 그대로, 부모가 사라졌으면 되돌리지 않는다.
 */
export function restoreComment(list: PostComment[], removed: RemovedComment): PostComment[] {
  const { comment, parentId, index } = removed;
  if (parentId === null) {
    if (list.some((c) => c.id === comment.id)) return list;
    const at = Math.min(index, list.length);
    return [...list.slice(0, at), comment, ...list.slice(at)];
  }
  return list.map((p) => {
    if (p.id !== parentId) return p;
    const replies = p.replies ?? [];
    if (replies.some((r) => r.id === comment.id)) return p;
    const at = Math.min(index, replies.length);
    return { ...p, replies: [...replies.slice(0, at), comment, ...replies.slice(at)] };
  });
}
