/**
 * 소셜 그래프 서비스 (neighbors / post_likes / comments)
 *
 * 로컬 스토어가 즉시 반영(낙관적 업데이트)하고, 이 서비스가 백엔드로 동기화한다.
 * id 규칙: 사용자는 profile uuid, 게시물은 posts.id(uuid=remoteId).
 * Supabase 미설정 시 모두 무동작.
 */

import { supabase } from './supabase';
import { getMyUserId } from './profile';
import type { PostComment } from '../store/recordStore';

// ─── 메이트 (서로메이트) ───
export interface NeighborProfile {
  id: string;
  handle: string | null;
  emoji: string | null;
  photo: string | null; // 아바타 URL
}

// 메이트신청 — 상대가 이미 나에게 pending이면 자동 수락(양쪽 신청 → 즉시 서로메이트)
export async function requestNeighbor(targetId: string): Promise<void> {
  if (!supabase || !targetId) return;
  const uid = await getMyUserId();
  if (!uid || uid === targetId) return;
  const { data: reverse } = await supabase
    .from('neighbors')
    .select('status')
    .eq('requester_id', targetId).eq('addressee_id', uid)
    .maybeSingle();
  if (reverse) { await acceptNeighbor(targetId); return; }
  const { error } = await supabase.from('neighbors')
    .insert({ requester_id: uid, addressee_id: targetId, status: 'pending' });
  if (error && error.code !== '23505') throw error;
}

export async function cancelNeighborRequest(targetId: string): Promise<void> {
  if (!supabase || !targetId) return;
  const uid = await getMyUserId();
  if (!uid) return;
  const { error } = await supabase.from('neighbors')
    .delete().eq('requester_id', uid).eq('addressee_id', targetId).eq('status', 'pending');
  if (error) throw error;
}

export async function acceptNeighbor(requesterId: string): Promise<void> {
  if (!supabase || !requesterId) return;
  const { error } = await supabase.rpc('accept_neighbor', { requester: requesterId });
  if (error) throw error;
}

export async function declineNeighbor(requesterId: string): Promise<void> {
  if (!supabase || !requesterId) return;
  const uid = await getMyUserId();
  if (!uid) return;
  const { error } = await supabase.from('neighbors')
    .delete().eq('requester_id', requesterId).eq('addressee_id', uid).eq('status', 'pending');
  if (error) throw error;
}

// 메이트 끊기 — accepted 관계 삭제 (양쪽 방향 어느 행이든)
export async function removeNeighbor(otherId: string): Promise<void> {
  if (!supabase || !otherId) return;
  const uid = await getMyUserId();
  if (!uid) return;
  const { error } = await supabase.from('neighbors')
    .delete()
    .or(`and(requester_id.eq.${uid},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${uid})`)
    .eq('status', 'accepted');
  if (error) throw error;
}

// 내 메이트 목록 (오류 시 null → 로컬 캐시 유지)
export async function fetchNeighbors(): Promise<NeighborProfile[] | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  try {
    const { data, error } = await supabase.rpc('neighbor_list_of', { target: uid });
    if (error) return null;
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id, handle: r.handle ?? null, emoji: r.emoji ?? null, photo: r.profile_photo ?? null,
    }));
  } catch { return null; }
}

// 타인 프로필의 메이트 목록 (오류 시 null)
export async function fetchNeighborsOf(userId: string): Promise<NeighborProfile[] | null> {
  if (!supabase || !userId) return null;
  try {
    const { data, error } = await supabase.rpc('neighbor_list_of', { target: userId });
    if (error) return null;
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id, handle: r.handle ?? null, emoji: r.emoji ?? null, photo: r.profile_photo ?? null,
    }));
  } catch { return null; }
}

// 메이트 수 (오류 시 null)
export async function fetchNeighborCount(userId: string): Promise<number | null> {
  if (!supabase || !userId) return null;
  try {
    const { data, error } = await supabase.rpc('neighbor_counts', { ids: [userId] });
    if (error) return null;
    const row = (data as { user_id: string; neighbor_count: number }[] | null)?.[0];
    return row?.neighbor_count ?? 0;
  } catch { return null; }
}

// 공유 기록 수 (visibility='neighbors' 글 집계) — 비메이트 프로필 여행수 스탯 동기화용. 오류 시 null
export async function fetchPostCount(userId: string): Promise<number | null> {
  if (!supabase || !userId) return null;
  try {
    const { data, error } = await supabase.rpc('post_counts', { ids: [userId] });
    if (error) return null;
    const row = (data as { user_id: string; post_count: number }[] | null)?.[0];
    return row?.post_count ?? 0;
  } catch { return null; }
}

// 내가 보낸 대기 신청 대상 id (버튼 '신청됨' 표시용). 오류 시 null(로컬 유지)
export async function fetchMyOutgoingNeighborRequests(): Promise<string[] | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  try {
    const { data, error } = await supabase.from('neighbors')
      .select('addressee_id').eq('requester_id', uid).eq('status', 'pending');
    if (error) return null;
    return (data ?? []).map((r: any) => r.addressee_id as string);
  } catch { return null; }
}

export interface IncomingNeighborRequest {
  requesterId: string;
  handle: string | null;
  emoji: string | null;
  photo: string | null;
  createdAt: number;
}

export async function fetchIncomingNeighborRequests(): Promise<IncomingNeighborRequest[]> {
  if (!supabase) return [];
  const uid = await getMyUserId();
  if (!uid) return [];
  try {
    const { data, error } = await supabase
      .from('neighbors')
      .select('requester_id, created_at, profiles:public_profiles!neighbors_requester_id_fkey(handle, emoji, profile_photo)')
      .eq('addressee_id', uid).eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return (data as any[]).map((r) => {
      const p = r.profiles ?? {};
      return {
        requesterId: r.requester_id as string,
        handle: p.handle ?? null, emoji: p.emoji ?? null, photo: p.profile_photo ?? null,
        createdAt: new Date(r.created_at).getTime(),
      };
    });
  } catch { return []; }
}

// 게시물 신고 접수 — 서버 reports 테이블에 저장(운영자 확인용). 로컬 숨김과 별개. (schema.sql 재실행 필요)
export async function reportPostToServer(postRemoteId: string | null, reason: string | null): Promise<void> {
  if (!supabase) return;
  const uid = await getMyUserId();
  if (!uid) return;
  const { error } = await supabase.from('reports').insert({ reporter_id: uid, post_id: postRemoteId, reason });
  if (error) throw error;
}

// ─── 차단 ───
// blocks 테이블에 넣어야 서버 RLS(게시물·댓글·DM 차단 필터)가 실제로 동작한다.
export async function blockUser(targetId: string): Promise<void> {
  if (!supabase || !targetId) return;
  const uid = await getMyUserId();
  if (!uid || uid === targetId) return;
  const { error } = await supabase.from('blocks').insert({ blocker_id: uid, blocked_id: targetId });
  if (error && error.code !== '23505') throw error; // 이미 차단(중복)만 정상 취급
  // 차단 시 메이트 관계도 정리 (서로 메이트 목록에 남지 않게). 실패해도 차단 자체는 유효.
  await supabase.from('neighbors')
    .delete()
    .or(`and(requester_id.eq.${uid},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${uid})`);
}

export async function unblockUser(targetId: string): Promise<void> {
  if (!supabase || !targetId) return;
  const uid = await getMyUserId();
  if (!uid) return;
  const { error } = await supabase.from('blocks').delete().eq('blocker_id', uid).eq('blocked_id', targetId);
  if (error) throw error;
}

// ─── 알림 (메이트) ───
// notifications 테이블은 메이트 신청/수락 시 채워진다.
export type NeighborNotificationType = 'neighbor_request' | 'neighbor_accept';
export interface NeighborNotification {
  id: string;
  type: NeighborNotificationType;
  actorId: string;
  actorHandle: string | null;
  actorEmoji: string | null;
  read: boolean;
  createdAt: number; // ms
}

export async function fetchNeighborNotifications(): Promise<NeighborNotification[]> {
  if (!supabase) return [];
  const uid = await getMyUserId();
  if (!uid) return [];
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, actor_id, read, created_at, profiles:public_profiles!notifications_actor_id_fkey(handle, emoji)')
      .eq('user_id', uid)
      .in('type', ['neighbor_request', 'neighbor_accept'])
      .order('created_at', { ascending: false })
      .limit(50);
    if (error || !data) return [];
    return (data as any[]).map((r) => {
      const p = r.profiles ?? {};
      return {
        id: r.id as string,
        type: r.type as NeighborNotificationType,
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

// ─── 추천 메이트 ───
// friend_suggestions RPC(SECURITY DEFINER) — 내 메이트들이 메이트 맺은 사용자.
export interface FriendSuggestion {
  id: string;
  handle: string | null;
  emoji: string | null;
  profilePhoto: string | null;
  mutualCount: number; // 나와 함께 아는(내 메이트 중 이 사람과 메이트인) 수
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
      mutualCount: r.mutual_count ?? 0,
    }));
  } catch {
    return [];
  }
}

// ─── 추천 메이트(여행 DNA) ───
// mate_suggestions RPC — 나라 겹침+여행 스타일+함께 아는 메이트 합산 랭킹.
// extraCountries: 로컬 여행기록카드·미발행·나만보기 나라(내 매칭 입력 전용, 타인에게 비노출).
// 부가 기능 — 실패 시 빈 배열(섹션 미표시).
export interface MateSuggestionRow {
  authorId: string;
  handle: string;
  emoji: string | null;
  profilePhoto: string | null;
  sharedCount: number;
  sampleCountries: string[]; // country_name(한글, 예: '일본')
  mutualCount: number;
  styleScore: number;
  totalScore: number;
}

export async function fetchMateSuggestions(limit = 10, extraCountries: string[] = []): Promise<MateSuggestionRow[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.rpc('mate_suggestions', { match_limit: limit, extra_countries: extraCountries });
    if (error || !data) return [];
    return (data as any[]).map((r) => ({
      authorId: r.author_id,
      handle: r.handle,
      emoji: r.emoji ?? null,
      profilePhoto: r.profile_photo ?? null,
      sharedCount: r.shared_count,
      sampleCountries: r.sample_countries ?? [],
      mutualCount: r.mutual_count ?? 0,
      styleScore: r.style_score ?? 0,
      totalScore: r.total_score ?? 0,
    }));
  } catch {
    return [];
  }
}

// 특정 유저와의 여행 겹침(타인 프로필 "나와 겹치는 나라" 줄). 실패 시 null(줄 미표시).
export async function fetchOverlapWith(targetId: string, extraCountries: string[] = []): Promise<{ sharedCount: number; sampleCountries: string[] } | null> {
  if (!supabase || !targetId) return null;
  try {
    const { data, error } = await supabase.rpc('overlap_with', { target: targetId, extra_countries: extraCountries });
    if (error || !data) return null;
    const row = (data as any[])[0];
    if (!row) return null;
    return { sharedCount: row.shared_count ?? 0, sampleCountries: row.sample_countries ?? [] };
  } catch { return null; }
}

// 나라별 화면 "이 나라 다녀온 사람". 실패 시 빈 배열(섹션 미표시).
export interface CountryVisitor {
  authorId: string;
  handle: string;
  emoji: string | null;
  profilePhoto: string | null;
  visitPosts: number;
}
export async function fetchCountryVisitors(countryName: string, limit = 12): Promise<CountryVisitor[]> {
  if (!supabase || !countryName) return [];
  try {
    const { data, error } = await supabase.rpc('country_visitors', { target_country: countryName, match_limit: limit });
    if (error || !data) return [];
    return (data as any[]).map((r) => ({
      authorId: r.author_id,
      handle: r.handle,
      emoji: r.emoji ?? null,
      profilePhoto: r.profile_photo ?? null,
      visitPosts: r.visit_posts ?? 0,
    }));
  } catch { return []; }
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
    return (data as any[])
      // public_profiles 임베드가 null = 차단 관계(뷰가 서버단에서 숨김) 또는 탈퇴 사용자 —
      // '좋아요한 사람' 시트에 노출하지 않는다 (post_likes 자체는 RLS가 열려 있어 여기서 거른다)
      .filter((r) => r.profiles)
      .map((r) => {
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
// 평면(parent_id) 행을 중첩 PostComment[]로 변환.
// 실패(네트워크/RLS 오류)는 null 반환 — 빈 배열([])과 구분해 호출부가 로컬 댓글을 지우지 않게 한다.
export async function fetchComments(postId: string): Promise<PostComment[] | null> {
  if (!supabase || !postId) return null;
  try {
    const uid = await getMyUserId();
    const { data, error } = await supabase
      .from('comments')
      .select('id, author_id, parent_id, text, created_at, profiles:public_profiles!comments_author_id_fkey(handle, emoji, profile_photo)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (error || !data) return null;
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
        authorId: row.author_id ?? undefined, // 댓글 작성자 프로필 이동용
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
    return null;
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
