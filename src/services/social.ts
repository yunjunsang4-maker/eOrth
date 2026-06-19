/**
 * 소셜 그래프 서비스 (follows / post_likes / comments)
 *
 * 로컬 스토어가 즉시 반영(낙관적 업데이트)하고, 이 서비스가 백엔드로 동기화한다.
 * id 규칙: 사용자는 profile uuid, 게시물은 posts.id(uuid=remoteId).
 * Supabase 미설정 시 모두 무동작.
 */

import { supabase } from './supabase';
import { getMyUserId } from './profile';
import type { PostComment } from '../store/recordStore';

// ─── 팔로우 ───
export interface FollowedProfile {
  id: string;
  handle: string | null;
  nickname: string | null;
  emoji: string | null;
  isMutual: boolean;
}

export async function followUser(targetId: string): Promise<void> {
  if (!supabase || !targetId) return;
  const uid = await getMyUserId();
  if (!uid || uid === targetId) return;
  try {
    await supabase.from('follows').insert({ follower_id: uid, following_id: targetId });
  } catch {
    /* 이미 팔로우 등 무시 */
  }
}

export async function unfollowUser(targetId: string): Promise<void> {
  if (!supabase || !targetId) return;
  const uid = await getMyUserId();
  if (!uid) return;
  try {
    await supabase.from('follows').delete().eq('follower_id', uid).eq('following_id', targetId);
  } catch {
    /* 무시 */
  }
}

// 내가 팔로우한 사람 + 맞팔 여부 (오류 시 null → 로컬 캐시 유지용)
export async function fetchFollowing(): Promise<FollowedProfile[] | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  try {
    const { data: following } = await supabase
      .from('follows')
      .select('following_id, profiles!follows_following_id_fkey(id, handle, nickname, emoji)')
      .eq('follower_id', uid);
    if (!following) return [];
    const { data: followers } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('following_id', uid);
    const followerSet = new Set((followers ?? []).map((r: any) => r.follower_id));
    return (following as any[]).map((row) => {
      const p = row.profiles ?? {};
      return {
        id: row.following_id as string,
        handle: p.handle ?? null,
        nickname: p.nickname ?? null,
        emoji: p.emoji ?? null,
        isMutual: followerSet.has(row.following_id),
      };
    });
  } catch {
    return null;
  }
}

// 특정 사용자의 팔로워 수
export async function fetchFollowerCount(userId: string): Promise<number> {
  if (!supabase || !userId) return 0;
  try {
    const { count } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', userId);
    return count ?? 0;
  } catch {
    return 0;
  }
}

// ─── 좋아요 ───
export async function likePost(postId: string): Promise<void> {
  if (!supabase || !postId) return;
  const uid = await getMyUserId();
  if (!uid) return;
  try {
    await supabase.from('post_likes').insert({ post_id: postId, user_id: uid });
  } catch {
    /* 중복 무시 */
  }
}

export async function unlikePost(postId: string): Promise<void> {
  if (!supabase || !postId) return;
  const uid = await getMyUserId();
  if (!uid) return;
  try {
    await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', uid);
  } catch {
    /* 무시 */
  }
}

// 내가 좋아요한 게시물 id 목록
export async function fetchMyLikedPostIds(): Promise<string[]> {
  if (!supabase) return [];
  const uid = await getMyUserId();
  if (!uid) return [];
  try {
    const { data } = await supabase.from('post_likes').select('post_id').eq('user_id', uid);
    return (data ?? []).map((r: any) => r.post_id as string);
  } catch {
    return [];
  }
}

// ─── 댓글 ───
// 평면(parent_id) 행을 중첩 PostComment[]로 변환
export async function fetchComments(postId: string): Promise<PostComment[]> {
  if (!supabase || !postId) return [];
  try {
    const uid = await getMyUserId();
    const { data } = await supabase
      .from('comments')
      .select('id, author_id, parent_id, text, created_at, profiles!comments_author_id_fkey(handle, nickname, emoji, profile_photo)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (!data) return [];
    // 댓글 좋아요 집계 (좋아요 수 + 내가 누른 댓글)
    const ids = (data as any[]).map((r) => r.id);
    const likeCount = new Map<string, number>();
    const myLiked = new Set<string>();
    if (ids.length) {
      const { data: likes } = await supabase
        .from('comment_likes')
        .select('comment_id, user_id')
        .in('comment_id', ids);
      for (const l of (likes ?? []) as any[]) {
        likeCount.set(l.comment_id, (likeCount.get(l.comment_id) ?? 0) + 1);
        if (uid && l.user_id === uid) myLiked.add(l.comment_id);
      }
    }
    const byId = new Map<string, PostComment>();
    const roots: PostComment[] = [];
    for (const row of data as any[]) {
      const p = row.profiles ?? {};
      const c: PostComment = {
        id: row.id,
        emoji: p.emoji || '🙂',
        name: p.nickname || p.handle || '여행자',
        photo: p.profile_photo || undefined,
        text: row.text,
        createdAt: new Date(row.created_at).getTime(),
        replies: [],
        liked: myLiked.has(row.id),
        likes: likeCount.get(row.id) ?? 0,
        isMine: !!uid && row.author_id === uid,
      };
      byId.set(row.id, c);
    }
    for (const row of data as any[]) {
      const c = byId.get(row.id)!;
      if (row.parent_id && byId.has(row.parent_id)) {
        byId.get(row.parent_id)!.replies!.push(c);
      } else {
        roots.push(c);
      }
    }
    return roots;
  } catch {
    return [];
  }
}

// 댓글 작성 → 생성된 댓글 id 반환(실패 시 null)
export async function addComment(postId: string, text: string, parentId?: string): Promise<string | null> {
  if (!supabase || !postId) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  try {
    const { data, error } = await supabase
      .from('comments')
      .insert({ post_id: postId, author_id: uid, parent_id: parentId ?? null, text })
      .select('id')
      .single();
    if (error || !data) return null;
    return data.id as string;
  } catch {
    return null;
  }
}

// 댓글 좋아요
export async function likeComment(commentId: string): Promise<void> {
  if (!supabase || !commentId) return;
  const uid = await getMyUserId();
  if (!uid) return;
  try {
    await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: uid });
  } catch {
    /* 중복 무시 */
  }
}

export async function unlikeComment(commentId: string): Promise<void> {
  if (!supabase || !commentId) return;
  const uid = await getMyUserId();
  if (!uid) return;
  try {
    await supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', uid);
  } catch {
    /* 무시 */
  }
}

// 댓글 삭제 (RLS로 본인 댓글만 삭제 가능)
export async function deleteComment(commentId: string): Promise<void> {
  if (!supabase || !commentId) return;
  const uid = await getMyUserId();
  if (!uid) return;
  try {
    await supabase.from('comments').delete().eq('id', commentId).eq('author_id', uid);
  } catch {
    /* 무시 */
  }
}
