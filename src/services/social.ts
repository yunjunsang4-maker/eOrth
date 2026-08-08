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
  // 23505 = 이미 내 신청이 있거나, '동시에 맞신청'해서 상대 행이 방금 먼저 들어간 경우
  // (uq_neighbors_pair 대칭 유일 인덱스가 두 번째 insert를 거절한다).
  // 후자면 위의 역방향 조회 시점엔 없었으므로 다시 조회해 수락으로 수렴시킨다 —
  // 안 하면 양쪽 다 '신청됨' 상태로 멈춰 서로 수락을 기다리게 된다.
  if (error?.code === '23505') {
    const { data: rev2 } = await supabase
      .from('neighbors')
      .select('status')
      .eq('requester_id', targetId).eq('addressee_id', uid)
      .maybeSingle();
    if (rev2?.status === 'pending') await acceptNeighbor(targetId);
  }
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

// ─── 알림 ───
// notifications 테이블은 서버 트리거로 채워진다 (schema.sql 10-c/d/e):
//   neighbor_request·neighbor_accept — 메이트 신청/수락
//   like·comment·reply              — 내 게시물/댓글에 대한 반응 (post_id 있음)
//   friend_post                     — 이웃의 새 기록 (post_id 있음)
// ⚠️ 조회에서 타입을 필터하지 말 것 — 예전엔 neighbor_*만 조회해서, 서버·푸시로는
//    좋아요/댓글 알림이 오는데 앱 목록은 비어 있었다(타입 추가 시 여기도 자동 포함되게 유지).
export type AppNotificationType =
  | 'neighbor_request' | 'neighbor_accept'
  | 'like' | 'comment' | 'reply' | 'friend_post';
export interface AppNotification {
  id: string;
  type: AppNotificationType;
  actorId: string;
  actorHandle: string | null;
  actorEmoji: string | null;
  actorPhoto: string | null; // 프로필 사진 — 알림 아바타는 사진 우선(없으면 제작 실루엣)
  postId: string | null;     // like·comment·reply·friend_post의 대상 게시물 (딥링크용)
  read: boolean;
  createdAt: number; // ms
}

// 알림 보존 기간 — 화면 표시와 미읽음 카운트가 같은 기준을 쓰도록 여기 둔다.
// (서버 행은 남아 있어도 이보다 오래된 것은 조회·집계 대상에서 뺀다)
export const NOTIFICATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
function notifSinceISO(): string {
  return new Date(Date.now() - NOTIFICATION_MAX_AGE_MS).toISOString();
}

export async function fetchAppNotifications(): Promise<AppNotification[]> {
  if (!supabase) return [];
  const uid = await getMyUserId();
  if (!uid) return [];
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, actor_id, post_id, read, created_at, profiles:public_profiles!notifications_actor_id_fkey(handle, emoji, profile_photo)')
      .eq('user_id', uid)
      .gte('created_at', notifSinceISO()) // 오래된 행이 limit을 잡아먹어 신규를 밀어내지 않게
      .order('created_at', { ascending: false })
      .limit(100);
    if (error || !data) return [];
    return (data as any[]).map((r) => {
      const p = r.profiles ?? {};
      return {
        id: r.id as string,
        type: r.type as AppNotificationType,
        actorId: r.actor_id as string,
        actorHandle: p.handle ?? null,
        actorEmoji: p.emoji ?? null,
        actorPhoto: p.profile_photo ?? null,
        postId: r.post_id ?? null,
        read: !!r.read,
        createdAt: new Date(r.created_at).getTime(),
      };
    });
  } catch {
    return [];
  }
}

// 미읽음 알림 개수 — 헤더 벨 배지용. 행을 받지 않고 count만 세어 가볍다(head: true).
// ⚠️ 목록(fetchAppNotifications)과 반드시 같은 기준을 써야 한다 —
//    범위가 다르면 "배지엔 3인데 목록은 비어 있음"이 된다(보존 기간 필터 포함).
// 실패·미로그인은 0 (배지 미표시).
export async function fetchUnreadNotificationCount(): Promise<number> {
  if (!supabase) return 0;
  const uid = await getMyUserId();
  if (!uid) return 0;
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid)
      .eq('read', false)
      .gte('created_at', notifSinceISO());
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

// 실시간 알림 구독 — 내 알림 INSERT를 받아 배지·목록을 즉시 갱신한다.
// (RLS가 본인 행만 전달하지만, 필터를 함께 걸어 불필요한 브로드캐스트를 줄인다)
// 해제 함수 반환 — DM subscribeInbox와 동일 패턴.
export function subscribeNotifications(userId: string, onInsert: () => void): () => void {
  if (!supabase || !userId) return () => {};
  const channel = supabase
    .channel(`notif-${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      () => onInsert()
    )
    .subscribe();
  return () => {
    try { supabase!.removeChannel(channel); } catch { /* 무시 */ }
  };
}

// 알림 전체 읽음 처리 — 목록을 연 시점 기준. 실패해도 조용히 넘어간다(다음 진입 시 재시도).
export async function markAllNotificationsRead(): Promise<void> {
  if (!supabase) return;
  const uid = await getMyUserId();
  if (!uid) return;
  try {
    await supabase.from('notifications').update({ read: true }).eq('user_id', uid).eq('read', false);
  } catch {
    /* 무시 */
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
  // 축별 점수 — 어느 근거로 추천됐는지 문구를 만드는 데 쓴다(만점 100의 구성 요소).
  // placeScore·styleScore·mutualScore는 지금 화면에서 직접 쓰지 않는다(근거 문구는 mutualCount를
  // 쓰고, 장소 근거는 sharedCities/sharedCount로 판단한다). RPC 반환 계약을 그대로 비추는
  // 미러라 지우지 않는다 — 지우면 다음에 축을 쓸 때 계약과 어긋난 부분 매핑이 된다.
  placeScore: number;    // 나라(희소성 가중 자카드) + 도시
  recencyScore: number;  // 최근 1년 내 겹친 나라
  seasonScore: number;   // 같은 나라·같은 계절 — 서버가 설문 도입 후 상시 0 반환(하위 호환용 미러)
  interestScore: number; // 키워드 겹침 — 상동, 상시 0
  tasteScore: number;    // 별점·예산·항공편 — 상동, 상시 0
  mutualScore: number;   // 공통 메이트(축 점수 — 사람 수는 mutualCount)
  sharedCities: string[];   // 겹친 도시(최대 3)
  sharedKeywords: string[]; // 겹친 키워드(최대 3)
  surveyScore: number;   // 설문 성향 유사도(0~35). 한쪽이라도 미완료면 0
  // 상대의 여행 DNA 유형 키(public_profiles.dna_type_key) — utils/travelDnaScore의
  // labelFromKey로 문구화한다. 축 점수는 비공개(설계 §9), 키만 공개.
  // null: 설문 미완료 또는 배포 직후 컬럼 없는 캐시 행(레거시 캐시 대비 ?? null 필수).
  dnaTypeKey: string | null;
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
      sharedCount: r.shared_count ?? 0,
      sampleCountries: r.sample_countries ?? [],
      mutualCount: r.mutual_count ?? 0,
      styleScore: r.style_score ?? 0,
      totalScore: r.total_score ?? 0,
      // 구버전 RPC(축별 점수 없음)에서도 앱이 깨지지 않게 전부 기본값을 둔다
      placeScore: r.place_score ?? 0,
      recencyScore: r.recency_score ?? 0,
      seasonScore: r.season_score ?? 0,
      interestScore: r.interest_score ?? 0,
      tasteScore: r.taste_score ?? 0,
      mutualScore: r.mutual_score ?? 0,
      sharedCities: r.shared_cities ?? [],
      sharedKeywords: r.shared_keywords ?? [],
      // 배포 직후 캐시된 행은 survey_score 컬럼이 없어 undefined일 수 있어 0으로 고정
      surveyScore: r.survey_score ?? 0,
      // 배포 직후 캐시된 행은 dna_type_key 컬럼 자체가 없어 undefined일 수 있다 — null로 고정
      dnaTypeKey: r.dna_type_key ?? null,
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

/**
 * 주어진 게시물들에 대한 '내 좋아요' 여부만 조회.
 *
 * 전량 조회(구 fetchMyLikedPostIds — 2026-08-09 제거)는 좋아요가 쌓인 사용자일수록
 * 수천 개의 uuid를 내려받고, PostgREST 기본 행 상한(1000)에 걸리면 오래된 좋아요가
 * 조용히 빠져 하트가 빈 채로 보였다. 항상 이 함수로 필요한 id만 조회할 것.
 */
export async function fetchMyLikesFor(postIds: string[]): Promise<Set<string>> {
  if (!supabase || postIds.length === 0) return new Set();
  const uid = await getMyUserId();
  if (!uid) return new Set();
  try {
    // 200개 단위 청크 — 대량 id를 .in() 하나로 보내면 URL 길이 한도에 걸린다.
    // (fetchMyPosts처럼 수백~수천 건을 넘기는 호출부도 안전하게 쓰도록 여기서 나눈다)
    const CHUNK = 200;
    const out = new Set<string>();
    for (let i = 0; i < postIds.length; i += CHUNK) {
      const { data } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', uid)
        .in('post_id', postIds.slice(i, i + CHUNK));
      for (const r of (data ?? []) as any[]) out.add(r.post_id as string);
    }
    return out;
  } catch {
    return new Set();
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
