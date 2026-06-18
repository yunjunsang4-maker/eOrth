import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { View } from 'react-native';
import type { BlogBlock, BlogCategory } from '../types/blogBlocks';
import { useSettings } from './settingsStore';
import { usePersistence, STORE_KEYS } from './persist';
import { isSupabaseConfigured } from '../services/supabase';
import { publishPost, updatePost, deletePost, fetchFeed } from '../services/posts';
import {
  followUser as apiFollow,
  unfollowUser as apiUnfollow,
  fetchFollowing,
  likePost,
  unlikePost,
  fetchMyLikedPostIds,
  fetchComments,
  addComment as apiAddComment,
} from '../services/social';

// ─────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────
export type Visibility = 'private' | 'friends' | 'public';

export type RecordViewType =
  | 'feed'        // 피드 (기본값)
  | 'blog'        // 블로그
  | 'album'       // 앨범 (보관, 휴면)
  | 'snap'        // 스냅 (BeReal 스타일)
  | 'cut';        // 네컷/컷사진

export interface TravelRecord {
  id: string;
  user: { name: string; emoji: string; handle: string; photo?: string };
  authorId?: string; // 작성자 profile uuid (백엔드 글) — 작성자 프로필 이동용
  country: string;          // 예: "🇯🇵 일본" (대표 국가, 하위 호환)
  countryName: string;      // 예: "일본"
  countryFlag: string;      // 예: "🇯🇵"
  countries?: { flag: string; name: string }[];  // 복수 국가 지원
  perCountryData?: Record<string, {              // 국가별 데이터
    medias?: string[];
    startDate?: string;
    endDate?: string;
    rating?: number;
    representativePhoto?: string;
  }>;
  representativePhoto?: string; // 대표 사진 (지구본/대륙 활성화용)
  date: string;             // 예: "2025.04.13"
  content: string;
  likes: number;
  comments: number;
  liked: boolean;
  isVoyager?: boolean;  // 보관 처리됨 (미사용)
  isMyPost?: boolean;
  remoteId?: string;    // Supabase posts.id (백엔드 발행 시 연결) — 수정/삭제 동기화용
  visibility: Visibility;
  timestamp: number;
  // v2 새 필드
  memo?: string;
  rating?: number;
  companions?: string[];
  companionFriends?: string[];
  medias?: string[];
  mediaPrivacy?: Record<number, string[]>;
  budget?: { amount: number; currency: string };
  weather?: string;
  flightType?: string;
  keywords?: string[];
  startDate?: string;
  endDate?: string;
  viewType?: RecordViewType;  // 뷰 형식 (기본값 'feed')
  tripGroupId?: string | null;    // 묶음 여행 ID
  tripGroupOrder?: number | null; // 묶음 안에서 순서
  // v3 블로그 확장 필드
  blogBlocks?: BlogBlock[];           // 블록 기반 콘텐츠 (viewType='blog'일 때)
  blogCategory?: BlogCategory;       // 블로그 카테고리
  scheduledAt?: number;               // 예약 발행 시각 (timestamp, 없으면 즉시 발행)
  isDraft?: boolean;                  // 임시저장 여부
  // v4 스냅 필드 (viewType='snap'일 때)
  snapFrontUri?: string;              // 전면 카메라 사진
  snapBackUri?: string;               // 후면 카메라 사진
  snapCaption?: string;               // 한줄 캡션
  snapDetectedCountry?: string;       // 감지된 국가명
  snapLateSeconds?: number;           // 알림 후 촬영까지 소요 시간(초)
  snapExpiresAt?: number;             // 24시간 후 만료 시각
  snapViewed?: boolean;               // 스냅 열람 여부
  snapHour?: number;                  // 촬영 시점 '현지 시각'의 시(0~23) — 89·90 시간대 배지용
  // v5 네컷 필드 (viewType='cut'일 때)
  cutPhoto?: {
    layout: import('../constants/cutFrames').CutLayout;
    frameId: string;
    frameColor?: string;              // 기본 프레임의 사용자 지정 색 (RGB)
    photos: string[];                 // 슬롯 순서대로 사진 URI
    previewUri: string;               // 합성 미리보기 이미지
  };
  regionName?: string;                // 예: "도쿄" (대륙 기록 시 사용)
  regionNameEn?: string;              // 예: "Tokyo" (대륙 기록 시 사용)
}

// ─────────────────────────────────────────────
// 여행 묶음 타입
// ─────────────────────────────────────────────
export interface TripGroup {
  id: string;
  title: string;
  records: string[];       // 포함된 TravelRecord id 배열
  createdAt: Date;
  coverRecordId: string;   // 대표 기록 id
}

// ─────────────────────────────────────────────
// 초기 더미 데이터 (기존 SocialScreen 데이터 이전)
// ─────────────────────────────────────────────
// 신규 사용자는 빈 피드로 시작 — 소셜/프로필/통계는 실제 작성 기록으로 채워진다 (데모 시드 제거)
const INITIAL_RECORDS: TravelRecord[] = [];

// ─────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────
export interface BlockedUser {
  name: string;
  emoji: string;
  blockedAt: number;
}

export interface FollowedFriend {
  id: string;
  username: string;
  isAbroad: boolean;
  currentCountry: string | null;
  currentCountryFlag: string | null;
  followedAt: number;
  isMutual?: boolean; // 맞팔(서로 팔로우) 여부 — '친구 수' 배지(78·81·82·83) 판정용
}

export interface PostComment {
  id: string;
  emoji: string;
  name: string;
  text: string;
  photo?: string; // 작성자 프로필 사진(URL) — 없으면 emoji 표시
  createdAt: number;
  time?: string; // 시드 댓글용 고정 표기 (없으면 createdAt 기준 상대시간으로 표시)
  replies?: PostComment[];
}

// 신규 사용자는 빈 상태로 시작 (데모 시드 제거)
const INITIAL_FOLLOWING: FollowedFriend[] = [];
const INITIAL_COMMENTS: Record<string, PostComment[]> = {};

interface RecordContextType {
  records: TravelRecord[];
  addRecord: (record: Omit<TravelRecord, 'id' | 'likes' | 'comments' | 'liked' | 'timestamp'>) => void;
  updateRecord: (id: string, changes: Partial<Omit<TravelRecord, 'id' | 'timestamp'>>) => void;
  deleteRecord: (id: string) => void;
  toggleLike: (id: string) => void;
  archivedIds: string[];
  archiveRecord: (id: string) => void;
  unarchiveRecord: (id: string) => void;
  blockedUsers: BlockedUser[];
  blockUser: (user: { name: string; emoji: string }) => void;
  unblockUser: (name: string) => void;
  followingUsers: FollowedFriend[];
  followUser: (user: Omit<FollowedFriend, 'followedAt'>) => void;
  unfollowUser: (username: string) => void;
  setFollowMutual: (username: string, isMutual: boolean) => void;
  commentsByPost: Record<string, PostComment[]>;
  addComment: (postId: string, text: string, replyToId?: string) => void;
  tripGroups: TripGroup[];
  addTripGroup: (group: Omit<TripGroup, 'id' | 'createdAt'>) => void;
  deleteTripGroup: (id: string) => void;
  updateTripGroup: (id: string, changes: Partial<Omit<TripGroup, 'id' | 'createdAt'>>) => void;
  markSnapViewed: (id: string) => void;
  // 임시저장
  drafts: TravelRecord[];
  saveDraft: (record: Omit<TravelRecord, 'id' | 'likes' | 'comments' | 'liked' | 'timestamp'>) => string;
  updateDraft: (id: string, changes: Partial<Omit<TravelRecord, 'id' | 'timestamp'>>) => void;
  deleteDraft: (id: string) => void;
  publishDraft: (id: string) => void;
  addImportedAlbum: (data: {
    countryName: string; countryFlag: string; country: string;
    date: string; startDate: string; endDate: string;
    title: string; medias: string[];
    representativePhoto?: string; // 카드 썸네일용 크롭본 (없으면 medias[0] 사용)
  }) => string; // 생성된 record id 반환
  resetRecords: () => void; // 모든 데이터를 첫 실행 상태(시드)로 되돌림
  // 소셜 미리보기 뷰어 — null=작성자/전체공개 시점. 비영구(저장 안 함).
  currentViewer: string | null;
  setCurrentViewer: (name: string | null) => void;
  // 백엔드 피드(남들의 공개/친구 글). Supabase 미설정 시 항상 빈 배열.
  feedPosts: TravelRecord[];
  refreshFeed: () => Promise<void>;
  refreshComments: (postId: string, remoteId?: string) => Promise<void>;
}

const RecordContext = createContext<RecordContextType | null>(null);

// JSON 직렬화 시 TripGroup.createdAt(Date)은 ISO 문자열이 되므로 복원 시 Date로 되살린다
interface RecordPersistPayload {
  records: TravelRecord[];
  archivedIds: string[];
  blockedUsers: BlockedUser[];
  tripGroups: (Omit<TripGroup, 'createdAt'> & { createdAt: string | Date })[];
  drafts: TravelRecord[];
  // 아래 두 필드는 나중에 추가됨 — 과거 저장본에는 없을 수 있어 복원 시 시드로 폴백
  followingUsers?: FollowedFriend[];
  commentsByPost?: Record<string, PostComment[]>;
}

export function RecordProvider({ children }: { children: React.ReactNode }) {
  const { nickname, handle, profilePhoto } = useSettings();
  const [records, setRecords] = useState<TravelRecord[]>(INITIAL_RECORDS);
  const [archivedIds, setArchivedIds] = useState<string[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [tripGroups, setTripGroups] = useState<TripGroup[]>([]);
  const [drafts, setDrafts] = useState<TravelRecord[]>([]);
  const [followingUsers, setFollowingUsers] = useState<FollowedFriend[]>(INITIAL_FOLLOWING);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, PostComment[]>>(INITIAL_COMMENTS);
  const [currentViewer, setCurrentViewer] = useState<string | null>(null);
  const [feedPosts, setFeedPosts] = useState<TravelRecord[]>([]);

  const hydrated = usePersistence<RecordPersistPayload>(
    STORE_KEYS.records,
    (p) => {
      setRecords(p.records);
      setArchivedIds(p.archivedIds);
      setBlockedUsers(p.blockedUsers);
      setTripGroups(p.tripGroups.map((g) => ({ ...g, createdAt: new Date(g.createdAt) })));
      setDrafts(p.drafts);
      setFollowingUsers(p.followingUsers ?? INITIAL_FOLLOWING);
      setCommentsByPost(p.commentsByPost ?? INITIAL_COMMENTS);
    },
    () => ({ records, archivedIds, blockedUsers, tripGroups, drafts, followingUsers, commentsByPost }),
    [records, archivedIds, blockedUsers, tripGroups, drafts, followingUsers, commentsByPost],
  );

  // ─── 기록 → 여행 카드(트립 그룹) 자동 연결 ───
  // 같은 국가 + 기간이 겹치거나 7일 이내로 가까운 그룹이 있으면 그 그룹에 추가,
  // 없으면 새 그룹(프로필 여행 카드)을 생성한다.
  const GROUP_GAP_MS = 7 * 24 * 60 * 60 * 1000;
  const parseRecDate = (s?: string): number | null => {
    if (!s) return null;
    const t = new Date(s.replace(/\./g, '-')).getTime();
    return Number.isFinite(t) ? t : null;
  };

  const linkRecordToTrip = (rec: TravelRecord) => {
    const country = rec.countryName;
    const recStart = parseRecDate(rec.startDate) ?? parseRecDate(rec.date);
    const recEnd = parseRecDate(rec.endDate) ?? recStart;
    if (!country || recStart == null || recEnd == null) return; // 국가/날짜 없으면 매칭 불가

    setTripGroups((prev) => {
      const match = prev.find((g) => {
        const members = g.records
          .map((id) => records.find((r) => r.id === id))
          .filter(Boolean) as TravelRecord[];
        if (members.length === 0 || members[0].countryName !== country) return false;
        let gStart = Infinity;
        let gEnd = -Infinity;
        for (const m of members) {
          const s = parseRecDate(m.startDate) ?? parseRecDate(m.date);
          const e = parseRecDate(m.endDate) ?? s;
          if (s != null) gStart = Math.min(gStart, s);
          if (e != null) gEnd = Math.max(gEnd, e);
        }
        if (!Number.isFinite(gStart) || !Number.isFinite(gEnd)) return false;
        return recStart <= gEnd + GROUP_GAP_MS && recEnd >= gStart - GROUP_GAP_MS;
      });

      if (match) {
        if (match.records.includes(rec.id)) return prev;
        return prev.map((g) => (g.id === match.id ? { ...g, records: [...g.records, rec.id] } : g));
      }
      const newGroup: TripGroup = {
        id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: `${country} 여행`,
        records: [rec.id],
        coverRecordId: rec.id,
        createdAt: new Date(),
      };
      return [newGroup, ...prev];
    });
  };

  const addRecord = (
    data: Omit<TravelRecord, 'id' | 'likes' | 'comments' | 'liked' | 'timestamp'>
  ) => {
    const newRecord: TravelRecord = {
      ...data,
      user: {
        ...data.user,
        name: nickname,
        handle: handle,
        photo: profilePhoto || undefined,
      },
      id: `rec-${Date.now()}`,
      likes: 0,
      comments: 0,
      liked: false,
      isMyPost: true,
      timestamp: data.scheduledAt || Date.now(),
      isDraft: false,
    };
    setRecords((prev) => [newRecord, ...prev]);
    linkRecordToTrip(newRecord); // 프로필 여행 카드 자동 생성/연결
    publishToBackend(newRecord); // Supabase 발행(설정 시)
  };

  // 백엔드 발행: 사진 업로드 후 posts insert → 받은 remoteId를 로컬 레코드에 연결.
  // 임시저장/미래 예약글은 제외(발행 시점에 처리). 레코드별 1회만 시도(중복 발행 방지).
  const publishAttemptRef = useRef<Set<string>>(new Set());
  const publishToBackend = (rec: TravelRecord) => {
    if (!isSupabaseConfigured || rec.isDraft) return;
    if (rec.scheduledAt && rec.scheduledAt > Date.now()) return;
    if (publishAttemptRef.current.has(rec.id)) return;
    publishAttemptRef.current.add(rec.id);
    publishPost(rec)
      .then((rid) => {
        if (rid) setRecords((prev) => prev.map((r) => (r.id === rec.id ? { ...r, remoteId: rid } : r)));
      })
      .catch(() => {});
  };

  const updateRecord = (id: string, changes: Partial<Omit<TravelRecord, 'id' | 'timestamp'>>) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...changes } : r))
    );
    if (isSupabaseConfigured) {
      const cur = records.find((r) => r.id === id);
      if (cur?.remoteId) updatePost(cur.remoteId, { ...cur, ...changes }).catch(() => {});
    }
  };

  const deleteRecord = (id: string) => {
    const target = records.find((r) => r.id === id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
    setArchivedIds((prev) => prev.filter((i) => i !== id));
    if (isSupabaseConfigured && target?.remoteId) deletePost(target.remoteId).catch(() => {});
  };

  // ─── 임시저장 ───
  const saveDraft = (
    data: Omit<TravelRecord, 'id' | 'likes' | 'comments' | 'liked' | 'timestamp'>
  ): string => {
    const draftId = `draft-${Date.now()}`;
    const draft: TravelRecord = {
      ...data,
      user: {
        ...data.user,
        name: nickname,
        handle: handle,
        photo: profilePhoto || undefined,
      },
      id: draftId,
      likes: 0,
      comments: 0,
      liked: false,
      isMyPost: true,
      timestamp: Date.now(),
      isDraft: true,
    };
    setDrafts((prev) => [draft, ...prev]);
    return draftId;
  };

  const updateDraft = (id: string, changes: Partial<Omit<TravelRecord, 'id' | 'timestamp'>>) => {
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...changes, timestamp: Date.now() } : d))
    );
  };

  const deleteDraft = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  const publishDraft = (id: string) => {
    const draft = drafts.find((d) => d.id === id);
    if (!draft) return;
    const published: TravelRecord = {
      ...draft,
      id: `rec-${Date.now()}`,
      isDraft: false,
      timestamp: draft.scheduledAt || Date.now(),
    };
    setRecords((prev) => [published, ...prev]);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    linkRecordToTrip(published); // 프로필 여행 카드 자동 생성/연결
    publishToBackend(published); // Supabase 발행(설정 시)
  };

  const archiveRecord = (id: string) => {
    setArchivedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const unarchiveRecord = (id: string) => {
    setArchivedIds((prev) => prev.filter((i) => i !== id));
  };

  const toggleLike = (id: string) => {
    const inRecords = records.find((r) => r.id === id);
    const inFeed = inRecords ? undefined : feedPosts.find((r) => r.id === id);
    const target = inRecords ?? inFeed;
    if (!target) return;
    const nowLiked = !target.liked;
    const flip = (r: TravelRecord): TravelRecord =>
      r.id === id ? { ...r, liked: nowLiked, likes: nowLiked ? r.likes + 1 : Math.max(0, r.likes - 1) } : r;
    if (inRecords) setRecords((prev) => prev.map(flip));
    else setFeedPosts((prev) => prev.map(flip));
    // 백엔드 동기화 (feed 글은 id가 곧 remoteId)
    const remoteId = target.remoteId ?? (inFeed ? target.id : undefined);
    if (isSupabaseConfigured && remoteId) {
      (nowLiked ? likePost(remoteId) : unlikePost(remoteId)).catch(() => {});
    }
  };

  const markSnapViewed = (id: string) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.id === id && !r.snapViewed ? { ...r, snapViewed: true } : r
      )
    );
  };

  const blockUser = (user: { name: string; emoji: string }) => {
    setBlockedUsers((prev) => {
      if (prev.some((b) => b.name === user.name)) return prev;
      return [...prev, { ...user, blockedAt: Date.now() }];
    });
  };

  const unblockUser = (name: string) => {
    setBlockedUsers((prev) => prev.filter((b) => b.name !== name));
  };

  const followUser = (user: Omit<FollowedFriend, 'followedAt'>) => {
    setFollowingUsers((prev) => {
      if (prev.some((f) => f.username === user.username)) return prev;
      return [...prev, { ...user, followedAt: Date.now() }];
    });
    if (isSupabaseConfigured && user.id) {
      apiFollow(user.id).then(() => refreshFollowing()).catch(() => {});
    }
  };

  const unfollowUser = (username: string) => {
    const target = followingUsers.find((f) => f.username === username);
    setFollowingUsers((prev) => prev.filter((f) => f.username !== username));
    if (isSupabaseConfigured && target?.id) apiUnfollow(target.id).catch(() => {});
  };

  // 맞팔(서로 팔로우) 여부 설정 — 친구 수 배지(78·81·82·83) 판정용
  const setFollowMutual = (username: string, isMutual: boolean) => {
    setFollowingUsers((prev) => prev.map((f) => (f.username === username ? { ...f, isMutual } : f)));
  };

  const addComment = (postId: string, text: string, replyToId?: string) => {
    const nc: PostComment = {
      id: `c-${Date.now()}`,
      emoji: '🙂',
      name: nickname || '나',
      photo: profilePhoto || undefined,
      text,
      createdAt: Date.now(),
    };
    setCommentsByPost((prev) => {
      const list = prev[postId] ?? [];
      const next = replyToId
        ? list.map((c) => (c.id === replyToId ? { ...c, replies: [...(c.replies ?? []), nc] } : c))
        : [...list, nc];
      return { ...prev, [postId]: next };
    });
    // 백엔드 동기화: 게시물이 백엔드에 있으면 댓글도 저장
    if (isSupabaseConfigured) {
      const own = records.find((r) => r.id === postId);
      const feed = feedPosts.find((r) => r.id === postId);
      const remoteId = own?.remoteId ?? feed?.remoteId ?? feed?.id;
      if (remoteId) {
        // 답글 부모는 백엔드 댓글 uuid일 때만 연결(로컬 즉시 작성분은 top-level로 저장)
        const parent = replyToId && /^[0-9a-f-]{36}$/i.test(replyToId) ? replyToId : undefined;
        apiAddComment(remoteId, text, parent).catch(() => {});
      }
    }
  };

  // 백엔드 댓글 불러오기 (게시물 상세 진입 시). remoteId 없으면 로컬 유지.
  const refreshComments = useCallback(async (postId: string, remoteId?: string) => {
    if (!isSupabaseConfigured || !remoteId) return;
    const list = await fetchComments(remoteId);
    setCommentsByPost((prev) => ({ ...prev, [postId]: list }));
  }, []);

  const addImportedAlbum = (data: {
    countryName: string; countryFlag: string; country: string;
    date: string; startDate: string; endDate: string;
    title: string; medias: string[];
    representativePhoto?: string;
  }): string => {
    const id = `rec-import-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const rec: TravelRecord = {
      id,
      user: { name: '', emoji: '🗺️', handle: '' },
      country: data.country,
      countryName: data.countryName,
      countryFlag: data.countryFlag,
      date: data.date,
      startDate: data.startDate,
      endDate: data.endDate,
      content: data.title,
      likes: 0, comments: 0, liked: false,
      isMyPost: true,
      visibility: 'private',
      timestamp: Date.now(),
      viewType: 'album',
      medias: data.medias,
      representativePhoto: data.representativePhoto,
    };
    setRecords((prev) => [rec, ...prev]);
    publishToBackend(rec); // 가져온 앨범도 백엔드 발행(비공개면 본인만 보임)
    return id;
  };

  const addTripGroup = (data: Omit<TripGroup, 'id' | 'createdAt'>) => {
    const newGroup: TripGroup = {
      ...data,
      id: `grp-${Date.now()}`,
      createdAt: new Date(),
    };
    setTripGroups((prev) => [newGroup, ...prev]);
  };

  const deleteTripGroup = (id: string) => {
    setTripGroups((prev) => prev.filter((g) => g.id !== id));
  };

  const updateTripGroup = (id: string, changes: Partial<Omit<TripGroup, 'id' | 'createdAt'>>) => {
    setTripGroups((prev) =>
      prev.map((g) => (g.id === id ? { ...g, ...changes } : g))
    );
  };

  const resetRecords = () => {
    setRecords(INITIAL_RECORDS);
    setArchivedIds([]);
    setBlockedUsers([]);
    setTripGroups([]);
    setDrafts([]);
    setFollowingUsers(INITIAL_FOLLOWING);
    setCommentsByPost(INITIAL_COMMENTS);
    setCurrentViewer(null);
    setFeedPosts([]);
  };

  // 백엔드 피드 새로고침 (남들의 공개/친구 글 + 내 좋아요 표시)
  const refreshFeed = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const [posts, likedIds] = await Promise.all([fetchFeed(), fetchMyLikedPostIds()]);
    const likedSet = new Set(likedIds);
    setFeedPosts(posts.map((p) => ({ ...p, liked: likedSet.has(p.remoteId ?? p.id) })));
  }, []);

  // 팔로잉 목록을 백엔드 기준으로 동기화 (맞팔 여부 포함)
  const refreshFollowing = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const list = await fetchFollowing();
    if (!list) return; // 오류 시 로컬 유지(덮어쓰지 않음)
    setFollowingUsers(
      list.map((p) => ({
        id: p.id,
        username: p.handle || p.nickname || p.id,
        isAbroad: false,
        currentCountry: null,
        currentCountryFlag: null,
        followedAt: 0,
        isMutual: p.isMutual,
      }))
    );
  }, []);

  // 앱 시작/복원 후 피드·팔로잉 1회 로드
  useEffect(() => {
    if (hydrated) {
      refreshFeed();
      refreshFollowing();
    }
  }, [hydrated, refreshFeed, refreshFollowing]);

  // 예약 발행: 예약 시각이 지났는데 아직 백엔드에 안 올라간 글을 발행
  useEffect(() => {
    if (!hydrated || !isSupabaseConfigured) return;
    const now = Date.now();
    records.forEach((r) => {
      if (!r.isDraft && !r.remoteId && r.scheduledAt && r.scheduledAt <= now) {
        publishToBackend(r);
      }
    });
  }, [hydrated, records]);

  // 복원 전에는 시드 데이터가 잠깐 보이지 않도록 렌더를 막는다
  if (!hydrated) {
    return <View style={{ flex: 1, backgroundColor: '#0A0118' }} />;
  }

  return (
    <RecordContext.Provider value={{ records, addRecord, updateRecord, deleteRecord, toggleLike, markSnapViewed, archivedIds, archiveRecord, unarchiveRecord, blockedUsers, blockUser, unblockUser, followingUsers, followUser, unfollowUser, setFollowMutual, commentsByPost, addComment, tripGroups, addTripGroup, deleteTripGroup, updateTripGroup, drafts, saveDraft, updateDraft, deleteDraft, publishDraft, addImportedAlbum, resetRecords, currentViewer, setCurrentViewer, feedPosts, refreshFeed, refreshComments }}>
      {children}
    </RecordContext.Provider>
  );
}

export function useRecords() {
  const ctx = useContext(RecordContext);
  if (!ctx) throw new Error('useRecords must be used within RecordProvider');
  return ctx;
}
