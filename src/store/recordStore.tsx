import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { View } from 'react-native';
import type { BlogBlock, BlogCategory } from '../types/blogBlocks';
import { useSettings } from './settingsStore';
import { usePersistence, STORE_KEYS } from './persist';
import { isSupabaseConfigured } from '../services/supabase';
import { emitToast } from './toastStore';
import { publishPost, updatePost, deletePost, fetchFeed } from '../services/posts';
import { persistRecordPhotos } from '../utils/persistRecordPhotos';
import {
  followUser as apiFollow,
  unfollowUser as apiUnfollow,
  fetchFollowing,
  likePost,
  unlikePost,
  fetchMyLikedPostIds,
  fetchComments,
  addComment as apiAddComment,
  likeComment as apiLikeComment,
  unlikeComment as apiUnlikeComment,
  deleteComment as apiDeleteComment,
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
    mediaPrivacy?: Record<number, string[]>;     // 국가별 사진 비공개 대상 (인덱스: 해당 국가 medias 기준)
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
  snapViewed?: boolean;               // (현재 사용자가) 스냅 열람 여부
  snapViewers?: { handle: string; name: string; time: number }[]; // 이 스냅을 본 사람들 (조회자)
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
  liked?: boolean;   // 내가 이 댓글에 좋아요했는지
  likes?: number;    // 댓글 좋아요 수
  isMine?: boolean;  // 내가 작성한 댓글(로컬 작성분) — 삭제 가능 여부
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
  unfollowUser: (idOrUsername: string) => void;
  setFollowMutual: (idOrUsername: string, isMutual: boolean) => void;
  commentsByPost: Record<string, PostComment[]>;
  addComment: (postId: string, text: string, replyToId?: string) => void;
  toggleCommentLike: (postId: string, commentId: string) => void;
  deleteComment: (postId: string, commentId: string) => void;
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
    // 사진을 영속 저장소(documentDirectory)로 복사 → 캐시 정리 후에도 사진 유지.
    // 로컬 URI만 교체하며 백엔드 동기화는 건드리지 않는다(백엔드엔 publishToBackend가 이미 업로드).
    persistRecordPhotos(newRecord)
      .then((changes) => {
        if (Object.keys(changes).length === 0) return;
        setRecords((prev) => prev.map((r) => (r.id === newRecord.id ? { ...r, ...changes } : r)));
      })
      .catch(() => {});
  };

  // 백엔드 동기화 실패 알림 — 로컬은 이미 반영됐고 서버 반영만 실패한 경우.
  // 좋아요 연타 등으로 토스트가 도배되지 않도록 일정 시간 내 중복은 억제한다.
  const lastSyncErrorRef = useRef(0);
  const notifySyncError = useCallback((e?: unknown) => {
    if (__DEV__ && e) console.warn('[sync] 백엔드 동기화 실패:', e);
    const now = Date.now();
    if (now - lastSyncErrorRef.current < 4000) return; // 4초 내 중복 억제
    lastSyncErrorRef.current = now;
    emitToast('서버 동기화에 실패했어요. 네트워크를 확인해 주세요.');
  }, []);

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
      .catch(notifySyncError);
  };

  const updateRecord = (id: string, changes: Partial<Omit<TravelRecord, 'id' | 'timestamp'>>) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...changes } : r))
    );
    if (isSupabaseConfigured) {
      const cur = records.find((r) => r.id === id);
      if (cur?.remoteId) updatePost(cur.remoteId, { ...cur, ...changes }).catch(notifySyncError);
    }
  };

  const deleteRecord = (id: string) => {
    const target = records.find((r) => r.id === id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
    setArchivedIds((prev) => prev.filter((i) => i !== id));
    if (isSupabaseConfigured && target?.remoteId) deletePost(target.remoteId).catch(notifySyncError);
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
      (nowLiked ? likePost(remoteId) : unlikePost(remoteId)).catch(notifySyncError);
    }
  };

  const markSnapViewed = (id: string) => {
    // 호출 시점 = 현재 사용자가 (자기 것이 아닌) 스냅을 열람 → 열람 표시 + 조회자 기록(중복 방지)
    const me = { handle, name: nickname || handle, time: Date.now() };
    setRecords((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const viewers = r.snapViewers ?? [];
        const already = viewers.some((v) => v.handle === me.handle);
        return {
          ...r,
          snapViewed: true,
          snapViewers: already ? viewers : [...viewers, me],
        };
      })
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

  // 신원은 id 기준 — 핸들(username)이 빈 유저끼리 같은 사람으로 오판되지 않도록 한다.
  // (빈 username은 매칭 키로 쓰지 않음)
  const sameFollowed = (f: FollowedFriend, key: string) =>
    f.id === key || (!!f.username && f.username === key);

  const followUser = (user: Omit<FollowedFriend, 'followedAt'>) => {
    setFollowingUsers((prev) => {
      // id가 양쪽에 있으면 id로, 아니면 빈 값이 아닌 username으로만 중복 판정
      const dup = prev.some((f) =>
        (f.id && user.id) ? f.id === user.id : (!!f.username && f.username === user.username)
      );
      if (dup) return prev;
      return [...prev, { ...user, followedAt: Date.now() }];
    });
    if (isSupabaseConfigured && user.id) {
      apiFollow(user.id).then(() => refreshFollowing()).catch(notifySyncError);
    }
  };

  const unfollowUser = (idOrUsername: string) => {
    // 정확히 한 항목만 제거(참조 비교) — 빈 username으로 인한 일괄 오삭제 방지
    const target = followingUsers.find((f) => sameFollowed(f, idOrUsername));
    if (!target) return;
    setFollowingUsers((prev) => prev.filter((f) => f !== target));
    if (isSupabaseConfigured && target.id) apiUnfollow(target.id).catch(notifySyncError);
  };

  // 맞팔(서로 팔로우) 여부 설정 — 친구 수 배지(78·81·82·83) 판정용
  const setFollowMutual = (idOrUsername: string, isMutual: boolean) => {
    setFollowingUsers((prev) => prev.map((f) => (sameFollowed(f, idOrUsername) ? { ...f, isMutual } : f)));
  };

  const addComment = (postId: string, text: string, replyToId?: string) => {
    const nc: PostComment = {
      id: `c-${Date.now()}`,
      emoji: '🙂',
      name: nickname || '나',
      photo: profilePhoto || undefined,
      text,
      createdAt: Date.now(),
      liked: false,
      likes: 0,
      isMine: true,
    };
    setCommentsByPost((prev) => {
      const list = prev[postId] ?? [];
      if (!replyToId) return { ...prev, [postId]: [...list, nc] };
      // 답글은 항상 top-level 댓글 아래에 단다(단일 단계). 부모가 답글이면 그 답글이 속한 댓글에 붙임.
      let attached = false;
      const next = list.map((c) => {
        if (c.id === replyToId || c.replies?.some((r) => r.id === replyToId)) {
          attached = true;
          return { ...c, replies: [...(c.replies ?? []), nc] };
        }
        return c;
      });
      // 부모를 못 찾으면 유실 방지를 위해 top-level로 추가
      return { ...prev, [postId]: attached ? next : [...list, nc] };
    });
    // 백엔드 동기화: 게시물이 백엔드에 있으면 댓글도 저장
    if (isSupabaseConfigured) {
      const own = records.find((r) => r.id === postId);
      const feed = feedPosts.find((r) => r.id === postId);
      const remoteId = own?.remoteId ?? feed?.remoteId ?? feed?.id;
      if (remoteId) {
        // 답글 부모는 백엔드 댓글 uuid일 때만 연결. 답글의 답글이면 top-level 부모로 승격(단일 단계 유지).
        let parent: string | undefined;
        if (replyToId && /^[0-9a-f-]{36}$/i.test(replyToId)) {
          const list = commentsByPost[postId] ?? [];
          const top = list.find((c) => c.id === replyToId || c.replies?.some((r) => r.id === replyToId));
          parent = top && /^[0-9a-f-]{36}$/i.test(top.id) ? top.id : replyToId;
        }
        apiAddComment(remoteId, text, parent).catch(notifySyncError);
      }
    }
  };

  // top-level·답글에서 댓글 찾기 (현재 좋아요 상태 확인용)
  const findCommentById = (list: PostComment[] | undefined, id: string): PostComment | undefined => {
    if (!list) return undefined;
    for (const c of list) {
      if (c.id === id) return c;
      const r = c.replies?.find((x) => x.id === id);
      if (r) return r;
    }
    return undefined;
  };
  const isRemoteId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

  // 댓글/답글 좋아요 토글 (로컬 즉시 반영 + 백엔드 동기화)
  const toggleCommentLike = (postId: string, commentId: string) => {
    const willLike = !findCommentById(commentsByPost[postId], commentId)?.liked;
    setCommentsByPost((prev) => {
      const list = prev[postId];
      if (!list) return prev;
      const flip = (c: PostComment): PostComment => {
        if (c.id === commentId) {
          const nowLiked = !c.liked;
          return { ...c, liked: nowLiked, likes: Math.max(0, (c.likes ?? 0) + (nowLiked ? 1 : -1)) };
        }
        if (c.replies?.length) return { ...c, replies: c.replies.map(flip) };
        return c;
      };
      return { ...prev, [postId]: list.map(flip) };
    });
    if (isSupabaseConfigured && isRemoteId(commentId)) {
      (willLike ? apiLikeComment(commentId) : apiUnlikeComment(commentId)).catch(notifySyncError);
    }
  };

  // 댓글/답글 삭제 (top-level 또는 답글) — 로컬 즉시 반영 + 백엔드 동기화
  const deleteComment = (postId: string, commentId: string) => {
    setCommentsByPost((prev) => {
      const list = prev[postId];
      if (!list) return prev;
      const next = list
        .filter((c) => c.id !== commentId)
        .map((c) => (c.replies?.length ? { ...c, replies: c.replies.filter((r) => r.id !== commentId) } : c));
      return { ...prev, [postId]: next };
    });
    if (isSupabaseConfigured && isRemoteId(commentId)) {
      apiDeleteComment(commentId).catch(notifySyncError);
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
    <RecordContext.Provider value={{ records, addRecord, updateRecord, deleteRecord, toggleLike, markSnapViewed, archivedIds, archiveRecord, unarchiveRecord, blockedUsers, blockUser, unblockUser, followingUsers, followUser, unfollowUser, setFollowMutual, commentsByPost, addComment, toggleCommentLike, deleteComment, tripGroups, addTripGroup, deleteTripGroup, updateTripGroup, drafts, saveDraft, updateDraft, deleteDraft, publishDraft, addImportedAlbum, resetRecords, currentViewer, setCurrentViewer, feedPosts, refreshFeed, refreshComments }}>
      {children}
    </RecordContext.Provider>
  );
}

export function useRecords() {
  const ctx = useContext(RecordContext);
  if (!ctx) throw new Error('useRecords must be used within RecordProvider');
  return ctx;
}
