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
      // profiles 테이블은 본인 행만 select 가능(RLS) — 타인 표시는 public_profiles 뷰로 임베드
      // (별칭 'profiles'로 응답 키 유지, 힌트는 기반 테이블 FK 이름 사용)
      .select('following_id, profiles:public_profiles!follows_following_id_fkey(id, handle, emoji)')
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
      .select('follower_id, profiles:public_profiles!follows_follower_id_fkey(id, handle, emoji)')
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

// ─── 팔로우 요청 (비공개 계정) ───
// 비공개 계정은 follows 직접 insert가 RLS로 막히므로 요청 → 대상 수락(RPC)을 거친다.

export async function requestFollow(targetId: string): Promise<void> {
  if (!supabase || !targetId) return;
  const uid = await getMyUserId();
  if (!uid || uid === targetId) return;
  const { error } = await supabase.from('follow_requests').insert({ requester_id: uid, target_id: targetId });
  if (error && error.code !== '23505') throw error; // 이미 요청(중복)만 정상 취급
}

export async function cancelFollowRequest(targetId: string): Promise<void> {
  if (!supabase || !targetId) return;
  const uid = await getMyUserId();
  if (!uid) return;
  const { error } = await supabase.from('follow_requests').delete().eq('requester_id', uid).eq('target_id', targetId);
  if (error) throw error;
}

export async function declineFollowRequest(requesterId: string): Promise<void> {
  if (!supabase || !requesterId) return;
  const uid = await getMyUserId();
  if (!uid) return;
  const { error } = await supabase.from('follow_requests').delete().eq('requester_id', requesterId).eq('target_id', uid);
  if (error) throw error;
}

// 수락 — SECURITY DEFINER RPC (요청 검증 → follows 생성 → 요청 삭제 → 수락 알림)
export async function acceptFollowRequest(requesterId: string): Promise<void> {
  if (!supabase || !requesterId) return;
  const { error } = await supabase.rpc('accept_follow_request', { requester: requesterId });
  if (error) throw error;
}

// 내가 보낸(대기 중) 요청의 대상 id 목록 — 버튼 '요청됨' 상태 표시용. 오류 시 null(로컬 유지)
export async function fetchMyPendingRequestTargets(): Promise<string[] | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  try {
    const { data, error } = await supabase.from('follow_requests').select('target_id').eq('requester_id', uid);
    if (error) return null;
    return (data ?? []).map((r: any) => r.target_id as string);
  } catch {
    return null;
  }
}

// 내가 받은 요청 목록 (요청자 프로필 조인) — 팔로워 화면 상단 표시용
export interface IncomingFollowRequest {
  requesterId: string;
  handle: string | null;
  emoji: string | null;
  createdAt: number;
}

export async function fetchIncomingFollowRequests(): Promise<IncomingFollowRequest[]> {
  if (!supabase) return [];
  const uid = await getMyUserId();
  if (!uid) return [];
  try {
    const { data, error } = await supabase
      .from('follow_requests')
      .select('requester_id, created_at, profiles:public_profiles!follow_requests_requester_id_fkey(handle, emoji)')
      .eq('target_id', uid)
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return (data as any[]).map((r) => {
      const p = r.profiles ?? {};
      return {
        requesterId: r.requester_id as string,
        handle: p.handle ?? null,
        emoji: p.emoji ?? null,
        createdAt: new Date(r.created_at).getTime(),
      };
    });
  } catch {
    return [];
  }
}

// ─── 알림 (팔로우) ───
// notifications 테이블은 follows insert 트리거(notify_on_follow)로 채워진다.
export type FollowNotificationType = 'follow' | 'follow_request' | 'follow_accept';
export interface FollowNotification {
  id: string;
  type: FollowNotificationType;
  actorId: string;
  actorHandle: string | null;
  actorEmoji: string | null;
  read: boolean;
  createdAt: number; // ms
}

export async function fetchFollowNotifications(): Promise<FollowNotification[]> {
  if (!supabase) return [];
  const uid = await getMyUserId();
  if (!uid) return [];
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, actor_id, read, created_at, profiles:public_profiles!notifications_actor_id_fkey(handle, emoji)')
      .eq('user_id', uid)
      .in('type', ['follow', 'follow_request', 'follow_accept'])
      .order('created_at', { ascending: false })
      .limit(50);
    if (error || !data) return [];
    return (data as any[]).map((r) => {
      const p = r.profiles ?? {};
      return {
        id: r.id as string,
        type: r.type as FollowNotificationType,
        actorId: r.actor_id as string,
        actorHandle: p.handle ?? null,
        actorEmoji: p.emoji ?? null,
        read: !!r.read,
        createdAt: new Date(r.created_at).getTime(),
      };
    });
  } catch {
    return [];
  }
}

// 알림 읽음 처리 — 표시용이라 실패해도 조용히 넘어간다(다음 진입 시 다시 시도됨)
export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (!supabase || ids.length === 0) return;
  const uid = await getMyUserId();
  if (!uid) return;
  try {
    await supabase.from('notifications').update({ read: true }).in('id', ids).eq('user_id', uid);
  } catch {
    /* 무시 */
  }
}

// ─── 추천 친구 ───
// friend_suggestions RPC(SECURITY DEFINER) — 내가 팔로우한 사람들이 팔로우하는 사용자.
export interface FriendSuggestion {
  id: string;
  handle: string | null;
  emoji: string | null;
  profilePhoto: string | null;
  isPrivate: boolean;  // 비공개 계정 — 팔로우 대신 요청 흐름
  mutualCount: number; // 나와 함께 아는(내 팔로잉 중 이 사람을 팔로우하는) 수
}

export async function fetchFriendSuggestions(maxCount = 10): Promise<FriendSuggestion[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.rpc('friend_suggestions', { max_count: maxCount });
    if (error || !data) return [];
    return (data as any[]).map((r) => ({
      id: r.id as string,
      handle: r.handle ?? null,
      emoji: r.emoji ?? null,
      profilePhoto: r.profile_photo ?? null,
      isPrivate: !!r.is_private,
      mutualCount: r.mutual_count ?? 0,
    }));
  } catch {
    return [];
  }
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
      .select('user_id, created_at, profiles:public_profiles!post_likes_user_id_fkey(handle, emoji, profile_photo)')
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
      .select('id, author_id, parent_id, text, created_at, profiles:public_profiles!comments_author_id_fkey(handle, emoji, profile_photo)')
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
