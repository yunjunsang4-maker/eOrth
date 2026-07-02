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
  emoji: string | null;
  isMutual: boolean;
}

export async function followUser(targetId: string): Promise<void> {
  if (!supabase || !targetId) return;
  const uid = await getMyUserId();
  if (!uid || uid === targetId) return;
  // supabase-js는 실패해도 throw하지 않고 error를 반환하므로 직접 확인해서 던져야
  // 호출부(recordStore)의 .catch(notifySyncError)가 동작한다.
  const { error } = await supabase.from('follows').insert({ follower_id: uid, following_id: targetId });
  if (error && error.code !== '23505') throw error; // 이미 팔로우(중복)만 정상 취급
}

export async function unfollowUser(targetId: string): Promise<void> {
  if (!supabase || !targetId) return;
  const uid = await getMyUserId();
  if (!uid) return;
  const { error } = await supabase.from('follows').delete().eq('follower_id', uid).eq('following_id', targetId);
  if (error) throw error;
}

// 내가 팔로우한 사람 + 맞팔 여부 (오류 시 null → 로컬 캐시 유지용)
export async function fetchFollowing(): Promise<FollowedProfile[] | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  try {
    // 오류를 빈 목록으로 반환하면 호출부(refreshFollowing)가 로컬 팔로잉을 전부 지워버리므로
    // error 시 반드시 null을 반환해 로컬 캐시를 유지한다.
    const { data: following, error } = await supabase
      .from('follows')
      .select('following_id, profiles!follows_following_id_fkey(id, handle, emoji)')
      .eq('follower_id', uid);
    if (error) return null;
    if (!following) return [];
    const { data: followers, error: followersError } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('following_id', uid);
    if (followersError) return null; // 맞팔 정보가 틀린 목록으로 덮어쓰지 않음
    const followerSet = new Set((followers ?? []).map((r: any) => r.follower_id));
    return (following as any[]).map((row) => {
      const p = row.profiles ?? {};
      return {
        id: row.following_id as string,
        handle: p.handle ?? null,
        emoji: p.emoji ?? null,
        isMutual: followerSet.has(row.following_id),
      };
    });
  } catch {
    return null;
  }
}

// 나를 팔로우한 사람(팔로워) 목록 + 맞팔 여부 (오류 시 null)
export async function fetchFollowers(): Promise<FollowedProfile[] | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  try {
    // 오류와 "팔로워 없음"을 구분해야 하므로 error 시 null 반환 (빈 목록 오표시 방지)
    const { data: followers, error } = await supabase
      .from('follows')
      .select('follower_id, profiles!follows_follower_id_fkey(id, handle, emoji)')
      .eq('following_id', uid);
    if (error) return null;
    if (!followers) return [];
    // 내가 팔로우하는 사람 집합(맞팔 판정)
    const { data: following, error: followingError } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', uid);
    if (followingError) return null;
    const followingSet = new Set((following ?? []).map((r: any) => r.following_id));
    return (followers as any[]).map((row) => {
      const p = row.profiles ?? {};
      return {
        id: row.follower_id as string,
        handle: p.handle ?? null,
        emoji: p.emoji ?? null,
        isMutual: followingSet.has(row.follower_id),
      };
    });
  } catch {
    return null;
  }
}

// 특정 사용자의 팔로워 수
// follows 조회가 '본인 당사자 행'으로 제한(RLS)되어 직접 count는 타인에 대해 틀린 값을 주므로
// follower_counts RPC(SECURITY DEFINER, 공개 통계)로 조회한다.
export async function fetchFollowerCount(userId: string): Promise<number> {
  if (!supabase || !userId) return 0;
  try {
    const { data, error } = await supabase.rpc('follower_counts', { ids: [userId] });
    if (error) return 0;
    const row = (data as { user_id: string; follower_count: number }[] | null)?.[0];
    return row?.follower_count ?? 0;
  } catch {
    return 0;
  }
}

// ─── 차단 ───
// blocks 테이블에 넣어야 서버 RLS(게시물·댓글·DM 차단 필터)가 실제로 동작한다.
export async function blockUser(targetId: string): Promise<void> {
  if (!supabase || !targetId) return;
  const uid = await getMyUserId();
  if (!uid || uid === targetId) return;
  const { error } = await supabase.from('blocks').insert({ blocker_id: uid, blocked_id: targetId });
  if (error && error.code !== '23505') throw error; // 이미 차단(중복)만 정상 취급
}

export async function unblockUser(targetId: string): Promise<void> {
  if (!supabase || !targetId) return;
  const uid = await getMyUserId();
  if (!uid) return;
  const { error } = await supabase.from('blocks').delete().eq('blocker_id', uid).eq('blocked_id', targetId);
  if (error) throw error;
}

// ─── 좋아요 ───
export async function likePost(postId: string): Promise<void> {
  if (!supabase || !postId) return;
  const uid = await getMyUserId();
  if (!uid) return;
  const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: uid });
  if (error && error.code !== '23505') throw error; // 이미 좋아요(중복)만 정상 취급
}

export async function unlikePost(postId: string): Promise<void> {
  if (!supabase || !postId) return;
  const uid = await getMyUserId();
  if (!uid) return;
  const { error } = await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', uid);
  if (error) throw error;
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

// 게시물 좋아요 누른 사람 목록 (프로필 조인)
export interface PostLiker {
  id: string;
  name: string;
  handle: string;
  emoji: string;
  photo?: string;
}
export async function fetchPostLikers(postId: string): Promise<PostLiker[]> {
  if (!supabase || !postId) return [];
  try {
    const { data } = await supabase
      .from('post_likes')
      .select('user_id, created_at, profiles!post_likes_user_id_fkey(handle, emoji, profile_photo)')
      .eq('post_id', postId)
      .order('created_at', { ascending: false });
    if (!data) return [];
    return (data as any[]).map((r) => {
      const p = r.profiles ?? {};
      return {
        id: r.user_id,
        name: p.handle || '여행자',
        handle: p.handle || '',
        emoji: p.emoji || '🙂',
        photo: p.profile_photo || undefined,
      };
    });
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
      .select('id, author_id, parent_id, text, created_at, profiles!comments_author_id_fkey(handle, emoji, profile_photo)')
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
        name: p.handle || '여행자',
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
  // 실패는 throw로 전달해 호출부 .catch(notifySyncError)가 사용자에게 알리게 한다
  const { data, error } = await supabase
    .from('comments')
    .insert({ post_id: postId, author_id: uid, parent_id: parentId ?? null, text })
    .select('id')
    .single();
  if (error) throw error;
  return (data?.id as string) ?? null;
}

// 댓글 좋아요
export async function likeComment(commentId: string): Promise<void> {
  if (!supabase || !commentId) return;
  const uid = await getMyUserId();
  if (!uid) return;
  const { error } = await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: uid });
  if (error && error.code !== '23505') throw error; // 중복만 정상 취급
}

export async function unlikeComment(commentId: string): Promise<void> {
  if (!supabase || !commentId) return;
  const uid = await getMyUserId();
  if (!uid) return;
  const { error } = await supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', uid);
  if (error) throw error;
}

// 댓글 삭제 (RLS로 본인 댓글만 삭제 가능)
export async function deleteComment(commentId: string): Promise<void> {
  if (!supabase || !commentId) return;
  const uid = await getMyUserId();
  if (!uid) return;
  const { error } = await supabase.from('comments').delete().eq('id', commentId).eq('author_id', uid);
  if (error) throw error;
}
