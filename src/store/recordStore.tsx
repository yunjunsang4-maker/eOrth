import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, View } from 'react-native';
import { isOnline, onReconnect } from '../utils/connectivity';
import type { BlogBlock, BlogCategory } from '../types/blogBlocks';
import { useSettings } from './settingsStore';
import { usePersistence, STORE_KEYS } from './persist';
import { isSupabaseConfigured } from '../services/supabase';
import { emitToast } from './toastStore';
import { publishPost, updatePost, deletePost, fetchFeed, fetchMyPosts } from '../services/posts';
import { getProfileByHandle, getProfileById, getMyUserId } from '../services/profile';
import { COUNTRIES } from '../constants/countries';
import { normalizeKoreaRegion } from '../constants/koreaRegions';
import { saveTripState, fetchTripState } from '../services/tripState';
import { persistRecordPhotos } from '../utils/persistRecordPhotos';
import {
  followUser as apiFollow,
  unfollowUser as apiUnfollow,
  blockUser as apiBlock,
  unblockUser as apiUnblock,
  requestFollow as apiRequestFollow,
  cancelFollowRequest as apiCancelRequest,
  fetchMyPendingRequestTargets,
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
  user: { name: string; emoji: string; handle: string; photo?: string; font?: string };
  authorId?: string; // 작성자 profile uuid (백엔드 글) — 작성자 프로필 이동용
  country: string;          // 예: "🇯🇵 일본" (대표 국가, 하위 호환)
  countryName: string;      // 예: "일본"
  countryFlag: string;      // 예: "🇯🇵"
  countries?: { flag: string; name: string }[];  // 복수 국가 지원
  // 다국가 기록의 표시 방식 — true면 게시물(레코드)은 하나지만 프로필 여행 카드는
  // perCountryData 기준으로 국가별로 나눠 그린다 (작성 시 "국가별로 나누기" 선택)
  splitByCountry?: boolean;
  perCountryData?: Record<string, {              // 국가별 데이터
    medias?: string[];
    mediaPrivacy?: Record<number, string[]>;     // 국가별 사진 비공개 대상 (인덱스: 해당 국가 medias 기준)
    startDate?: string;
    endDate?: string;
    rating?: number;
    representativePhoto?: string;
  }>;
  representativePhoto?: string; // 대표 사진 (지구본/대륙 활성화용) — 저장 시 원본 기반 고해상도로 재생성됨
  representativePhotoSource?: string; // 대표로 지정된 medias 항목의 URI — 편집 재진입 시 '지도대표' 표시·해제 매칭용
  date: string;             // 예: "2025.04.13"
  content: string;
  subtitle?: string;        // 블로그 부제목(선택) — 카드/상세에서 제목 아래 보라색으로 표시
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
  // 사진첩(앨범) 섹션 — medias의 연속 구간 분할({id,title,count}[]). utils/albumSections 참조
  albumSections?: { id: string; title: string; count: number }[];
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
    transforms?: ({ scale: number; tx: number; ty: number } | null)[]; // 슬롯별 사진 조정값 — 라이브 재합성 구도 재현용
    previewUri: string;               // 합성 미리보기 이미지
    noLogo?: boolean;                 // true면 eOrth 로고 미표시 — 프리미엄 작성 시 생성 시점에 박제
    stamp?: { date?: string; text?: string; fontId?: string }; // 하단 여백 날짜·문구 스탬프 (생성 시점 박제)
    frameImage?: string;              // 프레임 배경 사진 uri (프리미엄) — 영구 저장·업로드 대상
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
  // 다국가 분할 카드용 표시 오버라이드 — 있으면 카드가 기록 값 대신 이 값으로 그린다
  // (같은 기록 하나를 여러 국가 카드로 나눠 보여줄 때 국가·커버·날짜를 구분)
  countryName?: string;
  countryFlag?: string;
  coverUri?: string;
  date?: string;           // YYYY.MM.DD
  // 국내(거주국가) 카드의 지역 구분 — "제주 여행"과 "서울 여행"을 다른 카드로
  regionName?: string;
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
  handle?: string; // 차단 신원 키(표시이름 충돌 방지). 과거 저장본엔 없을 수 있어 optional
  id?: string; // profile uuid — 있으면 서버 blocks 테이블에도 반영(RLS 차단 필터 동작)
  blockedAt: number;
}

export interface FollowedFriend {
  id: string;
  username: string;
  emoji?: string; // 프로필 이모지 (목록 아바타 표시용, 서버 프로필에서 채움)
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

// 게시물 총 댓글 수(최상위 + 답글) — record.comments(표시용 숫자)를 commentsByPost와 동기화할 때 사용
const countTotalComments = (list?: PostComment[]) =>
  (list ?? []).reduce((n, c) => n + 1 + (c.replies?.length ?? 0), 0);

// 네트워크 요청 타임아웃 래퍼 — 연결이 끊기지 않고 'hang'하면 스피너가 무한 대기하는 것을 방지
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

interface RecordContextType {
  records: TravelRecord[];
  // 반환: 생성된 레코드 id.
  // linkTrip=false: 국가별 자동 여행 묶음 생성을 건너뜀 (다국가 분할 저장처럼 호출부가 직접 묶음을 만들 때)
  // countryGuessed=true: 위치 감지 실패로 국가가 추정값(거주국가 폴백)임 — 여행 세션 종료 신호로 쓰지 않음
  addRecord: (record: Omit<TravelRecord, 'id' | 'likes' | 'comments' | 'liked' | 'timestamp'>, opts?: { linkTrip?: boolean; countryGuessed?: boolean }) => string;
  updateRecord: (id: string, changes: Partial<Omit<TravelRecord, 'id' | 'timestamp'>>) => void;
  deleteRecord: (id: string) => void;
  toggleLike: (id: string) => void;
  archivedIds: string[];
  archiveRecord: (id: string) => void;
  unarchiveRecord: (id: string) => void;
  blockedUsers: BlockedUser[];
  blockUser: (user: { name: string; emoji: string; handle?: string; id?: string }) => void;
  unblockUser: (nameOrHandle: string) => void;
  isBlocked: (user: { name?: string; handle?: string }) => boolean;
  // 신고한 게시물 id — 신고 시 피드에서 숨김(영속). 백엔드 도입 시 서버 신고도 함께 처리.
  reportedPostIds: string[];
  reportPost: (id: string) => void;
  // 음소거한 사용자 handle — 영속(알림 백엔드 도입 시 알림 억제에 사용)
  mutedHandles: string[];
  toggleMute: (handle: string) => void;
  isMuted: (handle: string) => boolean;
  followingUsers: FollowedFriend[];
  followUser: (user: Omit<FollowedFriend, 'followedAt'>) => void;
  unfollowUser: (idOrUsername: string) => void;
  setFollowMutual: (idOrUsername: string, isMutual: boolean) => void;
  // 비공개 계정 팔로우 요청 — 내가 보낸 대기 중 요청의 대상 id (서버 상태, 비영속)
  pendingFollowRequests: string[];
  requestFollow: (targetId: string) => void;
  cancelFollowRequest: (targetId: string) => void;
  isFollowRequested: (targetId: string) => boolean;
  commentsByPost: Record<string, PostComment[]>;
  addComment: (postId: string, text: string, replyToId?: string) => void;
  toggleCommentLike: (postId: string, commentId: string) => void;
  deleteComment: (postId: string, commentId: string) => void;
  tripGroups: TripGroup[];
  // session: 다국가 분할 저장 카드용 — 기록 기간(실시간 여부 판단)을 넘기면 해외 카드를
  // 여행 세션에 등록해, 이후 그 국가의 실시간 기록(스냅 등)이 이 카드에 합류한다
  addTripGroup: (group: Omit<TripGroup, 'id' | 'createdAt'>, opts?: { session?: { startDate?: string; endDate?: string; date?: string } }) => void;
  deleteTripGroup: (id: string) => void;
  updateTripGroup: (id: string, changes: Partial<Omit<TripGroup, 'id' | 'createdAt'>>) => void;
  mergeTripGroups: (targetId: string, sourceIds: string[]) => void;
  markSnapViewed: (id: string) => void;
  viewedSnapIds: string[]; // 내가 본 타인 스냅(remoteId) — 안 본 링 판정용(영속)
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
  // 팔로잉 목록을 서버 기준으로 재동기화 (당겨서 새로고침 등)
  refreshFollowing: () => Promise<void>;
  refreshComments: (postId: string, remoteId?: string) => Promise<void>;
  // 내 기록을 서버에서 로컬로 복원(계정 전환 후 pull). 로컬 records를 서버 기준으로 교체한다.
  hydrateMyRecords: () => Promise<void>;
  // 로그인 완료 직후 여행카드 복원 재무장 — 로그인 전 마운트 때 스킵된 복원을 재시도시킨다.
  rearmTripRestore: () => void;
  // 앱 상태 통합 백업(user_app_state) — 기록 부가상태(보관·신고숨김·음소거·차단·본스냅) 내보내기/적용
  exportLocalStateBackup: () => Record<string, unknown>;
  applyLocalStateBackup: (b: Record<string, unknown>) => void;
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
  reportedPostIds?: string[];
  mutedHandles?: string[];
  viewedSnapIds?: string[];
  // 해외 여행 세션 — 출국~귀국 사이 유지. 과거 저장본엔 없거나(미도입)
  // 구형(국가명→카드 id 맵만)일 수 있어 복원 시 정규화한다
  tripSessionGroups?: TripSession | Record<string, string> | null;
}

// 해외 여행 세션: 국가명→여행카드 id 매핑 + 마지막 활동 시각.
// lastActiveAt은 30일 안전판(장기 무활동 시 자동 만료) 판정용.
export interface TripSession {
  groups: Record<string, string>;
  lastActiveAt: number;
}

export function RecordProvider({ children }: { children: React.ReactNode }) {
  const { handle, profilePhoto, handleFont, isPremium, homeCountryCode, currentVisitedCountryCode } = useSettings();
  const [records, setRecords] = useState<TravelRecord[]>(INITIAL_RECORDS);
  const [archivedIds, setArchivedIds] = useState<string[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [tripGroups, setTripGroups] = useState<TripGroup[]>([]);
  // 해외 여행 세션 — 위치(기록 국가)가 거주국가와 달라지는 순간 열리고 귀국까지 유지.
  // groups: { [국가명]: 여행카드 id }. 같은 세션·같은 국가는 같은 카드, 새 국가는 새 카드. 영속.
  // 안전판: 마지막 활동(lastActiveAt) 후 30일 지나면 만료 — 귀국 신호를 못 받은 채
  // 방치된 세션에 다음 여행이 합쳐지는 것을 막는다.
  const TRIP_SESSION_MAX_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
  const [tripSession, setTripSession] = useState<TripSession | null>(null);
  const sessionAlive = (s: TripSession | null): s is TripSession =>
    !!s && Date.now() - s.lastActiveAt <= TRIP_SESSION_MAX_IDLE_MS;
  const [drafts, setDrafts] = useState<TravelRecord[]>([]);
  const [followingUsers, setFollowingUsers] = useState<FollowedFriend[]>(INITIAL_FOLLOWING);
  // 비공개 계정에 보낸 대기 중 팔로우 요청 대상 id — 서버가 원본, 세션 내 공유용(비영속)
  const [pendingFollowRequests, setPendingFollowRequests] = useState<string[]>([]);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, PostComment[]>>(INITIAL_COMMENTS);
  const [reportedPostIds, setReportedPostIds] = useState<string[]>([]);
  // 내가 본 타인 스냅(remoteId) — feedPosts는 재조회 시 초기화되므로 '안 본 링' 상태를 영속 유지
  const [viewedSnapIds, setViewedSnapIds] = useState<string[]>([]);
  const [mutedHandles, setMutedHandles] = useState<string[]>([]);
  const [currentViewer, setCurrentViewer] = useState<string | null>(null);
  const [feedPosts, setFeedPosts] = useState<TravelRecord[]>([]);

  const hydrated = usePersistence<RecordPersistPayload>(
    STORE_KEYS.records,
    (p) => {
      // 모든 필드에 배열/폴백 가드 — 한 필드라도 throw하면 부분 복원 상태가
      // hydrated=true 이후 디바운스 저장으로 원본을 덮어써 영구 데이터 파괴가 된다.
      setRecords(Array.isArray(p.records) ? p.records : []);
      setArchivedIds(Array.isArray(p.archivedIds) ? p.archivedIds : []);
      setBlockedUsers(Array.isArray(p.blockedUsers) ? p.blockedUsers : []);
      setTripGroups(
        Array.isArray(p.tripGroups)
          ? p.tripGroups.map((g) => ({ ...g, createdAt: new Date(g.createdAt) }))
          : []
      );
      setDrafts(Array.isArray(p.drafts) ? p.drafts : []);
      setFollowingUsers(p.followingUsers ?? INITIAL_FOLLOWING);
      setCommentsByPost(p.commentsByPost ?? INITIAL_COMMENTS);
      setReportedPostIds(p.reportedPostIds ?? []);
      setMutedHandles(p.mutedHandles ?? []);
      setViewedSnapIds(Array.isArray(p.viewedSnapIds) ? p.viewedSnapIds : []);
      // 세션 복원 — 구형(맵만 저장)은 새 형태로 감싸고, 30일 무활동이면 만료 처리
      const rawSession = p.tripSessionGroups ?? null;
      const normalized: TripSession | null = !rawSession
        ? null
        : typeof (rawSession as TripSession).lastActiveAt === 'number'
          ? (rawSession as TripSession)
          : { groups: rawSession as Record<string, string>, lastActiveAt: Date.now() };
      setTripSession(
        normalized && Date.now() - normalized.lastActiveAt <= 30 * 24 * 60 * 60 * 1000 ? normalized : null
      );
    },
    () => ({ records, archivedIds, blockedUsers, tripGroups, drafts, followingUsers, commentsByPost, reportedPostIds, mutedHandles, viewedSnapIds, tripSessionGroups: tripSession }),
    [records, archivedIds, blockedUsers, tripGroups, drafts, followingUsers, commentsByPost, reportedPostIds, mutedHandles, viewedSnapIds, tripSession],
  );

  // ─── 기록 → 여행 카드(트립 그룹) 자동 연결 ───
  // 해외 기록은 날짜가 아니라 '여행 세션'으로 판단한다:
  //  - 위치(기록 국가)가 거주국가와 달라지는 순간 세션이 열리고, 귀국(거주국가 기록
  //    또는 도착 감지가 거주국가로 복귀)까지 유지된다.
  //  - 같은 세션 + 같은 국가 → 기존 카드에 추가 (며칠이 지나도 같은 여행)
  //  - 같은 세션 + 새 국가(예: 스페인→포르투갈) → 새 카드
  //  - 귀국 후 다시 출국 → 새 세션 → 같은 국가라도 새 카드
  // 거주국가(국내) 기록은 '귀국' 신호가 없어 세션 판단이 불가하므로 기존
  // 날짜 근접(7일) 규칙을 유지한다.
  const GROUP_GAP_MS = 7 * 24 * 60 * 60 * 1000;
  const parseRecDate = (s?: string): number | null => {
    if (!s) return null;
    const t = new Date(s.replace(/\./g, '-')).getTime();
    return Number.isFinite(t) ? t : null;
  };
  // 거주국가 코드(예: KR) → 기록에 저장되는 국가명(예: 대한민국)
  const homeCountryName =
    COUNTRIES.find((c) => c.term.split(' ')[0].toUpperCase() === (homeCountryCode || '').toUpperCase())?.name ?? null;

  const makeTripGroup = (country: string, rec: TravelRecord, regionName?: string): TripGroup => ({
    id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    // 국내 지역 카드는 "제주 여행"처럼 지역명으로 (국가 단위와 구분)
    title: `${regionName ?? country} 여행`,
    records: [rec.id],
    coverRecordId: rec.id,
    createdAt: new Date(),
    regionName,
  });

  // 기록 기간이 '지금'을 포함하는가 — 실시간(여행 중) 기록과 회고(과거 여행 작성) 기록 구분.
  // 세션은 실시간 기록에만 적용한다: 집에서 지난 여행을 작성해도 세션이 열리거나(오합류),
  // 여행 중 과거 국내 기록을 작성해도 세션이 닫히지(오종료) 않게 한다. 여유 ±2일.
  const REALTIME_MARGIN_MS = 2 * 24 * 60 * 60 * 1000;
  const coversNow = (rec: Pick<TravelRecord, 'startDate' | 'endDate'> & { date?: string }): boolean => {
    const start = parseRecDate(rec.startDate) ?? parseRecDate(rec.date);
    const end = parseRecDate(rec.endDate) ?? start;
    if (start == null || end == null) return true; // 날짜 없으면 방금 생성(스냅 등)으로 간주
    const now = Date.now();
    return start - REALTIME_MARGIN_MS <= now && now <= end + REALTIME_MARGIN_MS;
  };

  // 날짜 근접(7일) 규칙 — 국내 기록·회고 기록용 (세션 판단이 불가한 경우).
  // 국내(거주국가) 기록은 지역(시/도)까지 같아야 같은 카드 — "제주 여행"과
  // 서울 일상 기록이 시기가 가깝다고 한 카드로 묶이는 것 방지.
  const linkByDate = (rec: TravelRecord) => {
    const country = rec.countryName;
    const recStart = parseRecDate(rec.startDate) ?? parseRecDate(rec.date);
    const recEnd = parseRecDate(rec.endDate) ?? recStart;
    if (!country || recStart == null || recEnd == null) return; // 국가/날짜 없으면 매칭 불가
    const isDomestic = !!homeCountryName && country === homeCountryName;
    // 지역은 프리셋으로 정규화(수원시→경기 등). 정규화 실패 시 원본 유지, 미입력은 null
    const recRegion = isDomestic
      ? (normalizeKoreaRegion(rec.regionName)?.name ?? rec.regionName ?? null)
      : null;

    setTripGroups((prev) => {
      const match = prev.find((g) => {
        const members = g.records
          .map((id) => records.find((r) => r.id === id))
          .filter(Boolean) as TravelRecord[];
        if (members.length === 0) return false;
        // 카드의 실제 국가는 오버라이드(다국가 분할 카드) 우선 — 포르투갈 카드에
        // 스페인(대표국가) 기록이 붙는 오매칭 방지
        const groupCountry = g.countryName ?? members[0].countryName;
        if (groupCountry !== country) return false;
        if (isDomestic) {
          const gRegion =
            g.regionName ??
            normalizeKoreaRegion(members[0].regionName)?.name ??
            members[0].regionName ??
            null;
          if (gRegion !== recRegion) return false; // 지역이 다르면(미입력 포함) 다른 카드
        }
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
      return [makeTripGroup(country, rec, recRegion ?? undefined), ...prev];
    });
  };

  // linkRecordToTrip은 예약 발행처럼 '한 pass에서 연속 호출'될 수 있다. 렌더 클로저의
  // tripSession/tripGroups는 그 사이 갱신되지 않아(스테일) 같은 국가 2건이 카드를 중복 생성하거나
  // 두 번째 setTripSession이 첫 번째 국가의 세션 매핑을 지워버린다 — ref 미러로 읽고,
  // 상태를 바꿀 때 ref도 동기 갱신해 다음 호출이 즉시 최신 값을 보게 한다.
  const tripSessionRef = useRef(tripSession);
  tripSessionRef.current = tripSession;
  const tripGroupsRef = useRef(tripGroups);
  tripGroupsRef.current = tripGroups;

  const linkRecordToTrip = (rec: TravelRecord, opts?: { countryGuessed?: boolean }) => {
    const country = rec.countryName;
    if (!country) return;

    // 회고(과거 여행 작성) 기록 — 현재 위치와 무관하므로 세션을 건드리지 않고 날짜 규칙으로
    if (!coversNow(rec)) {
      linkByDate(rec);
      return;
    }

    // 국내(거주국가) 실시간 기록 — 진행 중이던 해외 세션이 있으면 귀국으로 보고 종료.
    // 단, 위치 감지 실패로 거주국가로 '폴백'된 기록(스냅 등)은 실제 귀국이 아닐 수 있어
    // 세션을 끊지 않는다 (여행 중 지하철 스냅 한 장이 여행 카드를 갈라놓는 것 방지).
    if (!homeCountryName || country === homeCountryName) {
      if (tripSessionRef.current && !opts?.countryGuessed) {
        setTripSession(null);
        tripSessionRef.current = null;
      }
      linkByDate(rec);
      return;
    }

    // 해외 실시간 기록 — 살아 있는(30일 무활동 만료 전) 세션에 이 국가의 카드가 있으면 추가
    const session = sessionAlive(tripSessionRef.current) ? tripSessionRef.current : null;
    const sessionGid = session?.groups[country];
    const target = sessionGid ? tripGroupsRef.current.find((g) => g.id === sessionGid) : undefined;
    if (target) {
      if (!target.records.includes(rec.id)) {
        const grow = (list: TripGroup[]) =>
          list.map((g) => (g.id === target.id ? { ...g, records: [...g.records, rec.id] } : g));
        setTripGroups((prev) => grow(prev));
        tripGroupsRef.current = grow(tripGroupsRef.current);
      }
      const refreshed: TripSession = { groups: session!.groups, lastActiveAt: Date.now() }; // 활동 갱신
      setTripSession(refreshed);
      tripSessionRef.current = refreshed;
      return;
    }
    // 세션에 이 국가 카드가 없음(첫 출국·국가 이동·카드 삭제·세션 만료) → 새 카드 + 세션 등록
    const ng = makeTripGroup(country, rec);
    setTripGroups((prev) => [ng, ...prev]);
    tripGroupsRef.current = [ng, ...tripGroupsRef.current];
    const opened: TripSession = { groups: { ...(session?.groups ?? {}), [country]: ng.id }, lastActiveAt: Date.now() };
    setTripSession(opened);
    tripSessionRef.current = opened;
  };

  // 도착 감지로 위치가 거주국가로 돌아오면(해외→국내 전환) 여행 세션 종료.
  // 값 '전환'만 신호로 쓴다 — 감지 미사용 시 기본값이 거주국가라 상시 비교는 오탐.
  const prevVisitedRef = useRef(currentVisitedCountryCode);
  useEffect(() => {
    const prev = prevVisitedRef.current;
    prevVisitedRef.current = currentVisitedCountryCode;
    if (prev === currentVisitedCountryCode) return;
    if (currentVisitedCountryCode === homeCountryCode && prev !== homeCountryCode) {
      setTripSession(null);
    }
  }, [currentVisitedCountryCode, homeCountryCode]);

  const addRecord = (
    data: Omit<TravelRecord, 'id' | 'likes' | 'comments' | 'liked' | 'timestamp'>,
    opts?: { linkTrip?: boolean; countryGuessed?: boolean }
  ): string => {
    const newRecord: TravelRecord = {
      ...data,
      user: {
        ...data.user,
        name: handle,
        handle: handle,
        photo: profilePhoto || undefined,
      },
      // 같은 ms에 연속 생성(다국가 분할 저장 등)돼도 충돌하지 않도록 난수 접미사
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      likes: 0,
      comments: 0,
      liked: false,
      isMyPost: true,
      timestamp: data.scheduledAt || Date.now(),
      isDraft: false,
    };
    setRecords((prev) => [newRecord, ...prev]);
    // 프로필 여행 카드 자동 생성/연결 — 예약 글은 발행 시점(아래 예약 발행 effect)에 연결한다
    const isFutureScheduled = !!newRecord.scheduledAt && newRecord.scheduledAt > Date.now();
    if (opts?.linkTrip !== false && !isFutureScheduled) {
      linkRecordToTrip(newRecord, { countryGuessed: opts?.countryGuessed });
    }
    publishToBackend(newRecord); // Supabase 발행(설정 시)
    // 사진을 영속 저장소(documentDirectory)로 복사 → 캐시 정리 후에도 사진 유지.
    // 로컬 URI만 교체하며 백엔드 동기화는 건드리지 않는다(백엔드엔 publishToBackend가 이미 업로드).
    persistRecordPhotos(newRecord)
      .then((changes) => {
        if (Object.keys(changes).length === 0) return;
        setRecords((prev) => prev.map((r) => (r.id === newRecord.id ? { ...r, ...changes } : r)));
      })
      .catch(() => {});
    return newRecord.id;
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
  // 발행(업로드) 진행 중 삭제/수정 경합 대응 — remoteId 부착 전 삭제는 여기 기록해 완료 시점에 서버에서도 지운다.
  const pendingDeleteRef = useRef<Set<string>>(new Set());
  const recordsLiveRef = useRef(records);
  recordsLiveRef.current = records;
  const publishToBackend = (rec: TravelRecord) => {
    if (!isSupabaseConfigured || rec.isDraft) return;
    if (rec.scheduledAt && rec.scheduledAt > Date.now()) return;
    if (publishAttemptRef.current.has(rec.id)) return;
    publishAttemptRef.current.add(rec.id);
    publishPost(rec)
      .then((rid) => {
        if (!rid) return;
        // 업로드 중 삭제된 글 → 서버에 유령 게시물로 남지 않게 즉시 삭제
        const live = recordsLiveRef.current.find((r) => r.id === rec.id);
        if (pendingDeleteRef.current.has(rec.id) || !live) {
          pendingDeleteRef.current.delete(rec.id);
          deletePost(rid).catch(() => {});
          return;
        }
        setRecords((prev) => prev.map((r) => (r.id === rec.id ? { ...r, remoteId: rid } : r)));
        // 업로드 중 수정된 글 → 캡처본(구버전)이 insert됐으므로 최신 내용으로 서버 갱신
        if (live !== rec) updatePost(rid, { ...live, remoteId: rid }).catch(notifySyncError);
      })
      .catch(notifySyncError);
  };

  const updateRecord = (id: string, changes: Partial<Omit<TravelRecord, 'id' | 'timestamp'>>) => {
    const cur = records.find((r) => r.id === id);
    const updated = cur ? { ...cur, ...changes } : undefined;
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...changes } : r))
    );
    // 수정으로 새로 추가된 사진도 캐시(tmp) URI다 — addRecord와 동일하게 영속 저장소로 복사
    if (updated) {
      persistRecordPhotos(updated)
        .then((pc) => {
          if (Object.keys(pc).length === 0) return;
          setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, ...pc } : r)));
        })
        .catch(() => {});
    }
    // 국가가 바뀐 수정 → 기존 여행 카드에서 빼고 새 국가 기준으로 재연결
    // (카드 표지와 내용 불일치 방지). 분할 카드 기록은 수동 관리 카드라 제외.
    if (cur && updated && changes.countryName && changes.countryName !== cur.countryName && !updated.splitByCountry) {
      setTripGroups((prev) =>
        prev
          .map((g) => {
            if (!g.records.includes(id)) return g;
            const rest = g.records.filter((rid) => rid !== id);
            return {
              ...g,
              records: rest,
              coverRecordId: g.coverRecordId === id ? (rest[0] ?? g.coverRecordId) : g.coverRecordId,
            };
          })
          .filter((g) => g.records.length > 0)
      );
      linkRecordToTrip(updated);
    }
    if (isSupabaseConfigured) {
      if (cur?.remoteId) updatePost(cur.remoteId, { ...cur, ...changes }).catch(notifySyncError);
    }
  };

  const deleteRecord = (id: string) => {
    const target = records.find((r) => r.id === id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
    setArchivedIds((prev) => prev.filter((i) => i !== id));
    // 여행 묶음 정합성: 삭제된 기록 id를 그룹에서 제거하고, 멤버가 없어진 그룹은 폐기.
    // 대표(coverRecordId)가 삭제됐으면 남은 첫 기록으로 승계.
    setTripGroups((prev) =>
      prev
        .map((g) => {
          if (!g.records.includes(id)) return g;
          const remaining = g.records.filter((rid) => rid !== id);
          const coverRecordId = g.coverRecordId === id ? (remaining[0] ?? '') : g.coverRecordId;
          return { ...g, records: remaining, coverRecordId };
        })
        .filter((g) => g.records.length > 0)
    );
    if (isSupabaseConfigured && target) {
      if (target.remoteId) deletePost(target.remoteId).catch(notifySyncError);
      // remoteId 부착 전(발행 업로드 중) 삭제 — 완료 시점에 서버에서도 지우도록 예약
      else if (publishAttemptRef.current.has(id)) pendingDeleteRef.current.add(id);
    }
  };

  // ─── 임시저장 ───
  const saveDraft = (
    data: Omit<TravelRecord, 'id' | 'likes' | 'comments' | 'liked' | 'timestamp'>
  ): string => {
    const draftId = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; // 같은 ms 충돌 방지
    const draft: TravelRecord = {
      ...data,
      user: {
        ...data.user,
        name: handle,
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
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, // addRecord와 동일한 충돌 방지 규칙
      isDraft: false,
      timestamp: draft.scheduledAt || Date.now(),
    };
    setRecords((prev) => [published, ...prev]);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    // 프로필 여행 카드 자동 생성/연결 — 예약 글은 발행 시점(예약 발행 effect)에 연결
    if (!(published.scheduledAt && published.scheduledAt > Date.now())) {
      linkRecordToTrip(published);
    }
    publishToBackend(published); // Supabase 발행(설정 시)
    // 임시저장 사진은 ImagePicker 캐시(tmp) URI 그대로다 — 발행 시 영속 저장소로 복사.
    // (임시저장은 '나중에 발행'이라 OS 캐시 정리와 만날 확률이 가장 높은 경로)
    persistRecordPhotos(published)
      .then((changes) => {
        if (Object.keys(changes).length === 0) return;
        setRecords((prev) => prev.map((r) => (r.id === published.id ? { ...r, ...changes } : r)));
      })
      .catch(() => {});
  };

  const archiveRecord = (id: string) => {
    setArchivedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const unarchiveRecord = (id: string) => {
    setArchivedIds((prev) => prev.filter((i) => i !== id));
  };

  // 좋아요 최신 상태의 ref 미러 — 리렌더 전에 연타하면 렌더 클로저의 target.liked가 스테일이라
  // 두 탭 모두 '좋아요'로 계산돼 카운트가 이중 증가하던 문제를 막는다.
  const likeStateRef = useRef<Record<string, boolean>>({});
  const toggleLike = (id: string) => {
    const inRecords = records.find((r) => r.id === id);
    const inFeed = inRecords ? undefined : feedPosts.find((r) => r.id === id);
    const target = inRecords ?? inFeed;
    if (!target) return;
    const nowLiked = !(likeStateRef.current[id] ?? target.liked);
    likeStateRef.current[id] = nowLiked;
    // 이미 원하는 상태면 no-op — 같은 방향으로 두 번 적용돼 카운트가 어긋나는 것 방지
    const flip = (r: TravelRecord): TravelRecord =>
      r.id !== id || r.liked === nowLiked
        ? r
        : { ...r, liked: nowLiked, likes: nowLiked ? r.likes + 1 : Math.max(0, r.likes - 1) };
    if (inRecords) setRecords((prev) => prev.map(flip));
    else setFeedPosts((prev) => prev.map(flip));
    // 백엔드 동기화 (feed 글은 id가 곧 remoteId)
    const remoteId = target.remoteId ?? (inFeed ? target.id : undefined);
    if (isSupabaseConfigured && remoteId) {
      (nowLiked ? likePost(remoteId) : unlikePost(remoteId)).catch((e) => {
        // 서버 반영 실패 → 낙관 반영을 되돌린다 (안 되돌리면 다음 새로고침까지 서버와 어긋남)
        notifySyncError(e);
        likeStateRef.current[id] = !nowLiked;
        const revert = (r: TravelRecord): TravelRecord =>
          r.id !== id || r.liked !== nowLiked
            ? r
            : { ...r, liked: !nowLiked, likes: !nowLiked ? r.likes + 1 : Math.max(0, r.likes - 1) };
        if (inRecords) setRecords((prev) => prev.map(revert));
        else setFeedPosts((prev) => prev.map(revert));
      });
    }
  };

  const markSnapViewed = (id: string) => {
    // 호출 시점 = 현재 사용자가 (자기 것이 아닌) 스냅을 열람 → 열람 표시 + 조회자 기록(중복 방지)
    const me = { handle, name: handle, time: Date.now() };
    const apply = (r: TravelRecord): TravelRecord => {
      if (r.id !== id) return r;
      const viewers = r.snapViewers ?? [];
      const already = viewers.some((v) => v.handle === me.handle);
      return {
        ...r,
        snapViewed: true,
        snapViewers: already ? viewers : [...viewers, me],
      };
    };
    // 타인 스냅은 records가 아니라 feedPosts에 있다 — 양쪽 모두 갱신해야 '안 본 링'이 꺼진다
    setRecords((prev) => prev.map(apply));
    setFeedPosts((prev) => prev.map(apply));
    // feedPosts는 세션 한정(재조회 시 초기화)이라, 본 스냅 id를 영속 목록에도 기록해
    // 앱 재시작·피드 새로고침 후에도 링이 다시 켜지지 않게 한다 (remoteId 기준, 최근 500개 유지)
    const target = feedPosts.find((r) => r.id === id) ?? records.find((r) => r.id === id);
    const rid = target?.remoteId ?? id;
    setViewedSnapIds((ids) => (ids.includes(rid) ? ids : [...ids, rid].slice(-500)));
  };

  const blockUser = (user: { name: string; emoji: string; handle?: string; id?: string }) => {
    setBlockedUsers((prev) => {
      // 신원은 handle(양쪽에 있으면) 우선, 없으면 표시이름으로 중복 판정
      const dup = prev.some((b) =>
        (b.handle && user.handle) ? b.handle === user.handle : b.name === user.name
      );
      if (dup) return prev;
      return [...prev, { ...user, blockedAt: Date.now() }];
    });
    // 차단하면 팔로잉에서도 제거 — 화면별 처리 불일치 방지 (팔로우 안 했으면 no-op)
    // id 우선, 없으면 handle → 표시이름 순으로 매칭 (팔로잉 항목의 username은 handle과 동일 값)
    const followed = followingUsers.find((f) =>
      (!!user.id && f.id === user.id) ||
      (!!f.username && (f.username === user.handle || f.username === user.name))
    );
    if (followed) unfollowUser(followed.id || followed.username);
    // uuid를 알 때만 서버 blocks에 반영 — 서버 RLS(게시물·댓글·DM 차단)가 실제로 동작하게 함
    if (isSupabaseConfigured && user.id) apiBlock(user.id).catch(notifySyncError);
  };

  const unblockUser = (nameOrHandle: string) => {
    const target = blockedUsers.find((b) => b.name === nameOrHandle || b.handle === nameOrHandle);
    setBlockedUsers((prev) => prev.filter((b) => b.name !== nameOrHandle && b.handle !== nameOrHandle));
    if (isSupabaseConfigured && target?.id) apiUnblock(target.id).catch(notifySyncError);
  };

  // 게시물/사용자가 차단 대상인지 — handle 우선, 표시이름 폴백(이름기반·과거 차단 호환)
  const isBlocked = useCallback((user: { name?: string; handle?: string }) =>
    blockedUsers.some((b) =>
      (b.handle && user.handle && b.handle === user.handle) || (!!user.name && b.name === user.name)
    ), [blockedUsers]);

  // 게시물 신고 → 신고 목록에 추가(피드에서 숨김). 이미 신고했으면 무시.
  const reportPost = (id: string) => {
    setReportedPostIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  // 사용자 알림 음소거 토글/조회 (handle 기준, 영속)
  const toggleMute = (handle: string) => {
    if (!handle) return;
    setMutedHandles((prev) => (prev.includes(handle) ? prev.filter((h) => h !== handle) : [...prev, handle]));
  };
  const isMuted = useCallback((handle: string) => mutedHandles.includes(handle), [mutedHandles]);

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
      apiFollow(user.id)
        .then(() => refreshFollowing())
        .catch(async (e) => {
          // 서버 거부 시 낙관 반영 롤백 — 버튼이 '팔로잉'으로 남는데 서버엔 팔로우가 없어
          // 다음 새로고침 때 말없이 원복되던 불일치를 막는다.
          setFollowingUsers((prev) => prev.filter((f) => f.id !== user.id));
          // 비공개 계정은 RLS(follows_insert_own)가 직접 팔로우를 거부한다 —
          // is_private 분기가 없는 화면(팔로워 목록 맞팔로우·게시물 상세)에서도
          // 요청 흐름으로 자동 전환해 준다.
          const prof = await getProfileById(user.id!).catch(() => null);
          if (prof?.is_private) {
            requestFollow(user.id!);
            emitToast('비공개 계정이에요. 팔로우 요청을 보냈어요.');
          } else {
            notifySyncError(e);
          }
        });
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

  // ─── 비공개 계정 팔로우 요청 (낙관적 반영 + 서버 동기화, 실패 시 되돌림) ───
  const requestFollow = (targetId: string) => {
    if (!targetId) return;
    setPendingFollowRequests((prev) => (prev.includes(targetId) ? prev : [...prev, targetId]));
    if (isSupabaseConfigured) {
      apiRequestFollow(targetId).catch((e) => {
        setPendingFollowRequests((prev) => prev.filter((id) => id !== targetId));
        notifySyncError(e);
      });
    }
  };

  const cancelFollowRequest = (targetId: string) => {
    if (!targetId) return;
    setPendingFollowRequests((prev) => prev.filter((id) => id !== targetId));
    if (isSupabaseConfigured) {
      apiCancelRequest(targetId).catch((e) => {
        setPendingFollowRequests((prev) => (prev.includes(targetId) ? prev : [...prev, targetId]));
        notifySyncError(e);
      });
    }
  };

  // '요청됨' 판정 — 이미 팔로우 중이면(수락됨) 요청 상태로 보지 않는다
  const isFollowRequested = useCallback(
    (targetId: string) =>
      pendingFollowRequests.includes(targetId) && !followingUsers.some((f) => f.id === targetId),
    [pendingFollowRequests, followingUsers]
  );

  const addComment = (postId: string, text: string, replyToId?: string) => {
    const nc: PostComment = {
      id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, // 같은 ms 충돌 방지 (addRecord와 동일 규칙)
      emoji: '🙂',
      name: handle || '나',
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
        apiAddComment(remoteId, text, parent)
          .then((sid) => {
            if (!sid) return;
            // 서버 uuid를 로컬 댓글 id로 교체 — 방금 단 댓글의 삭제·좋아요가 서버에 반영되고
            // (isRemoteId 게이트 통과), 상세 재진입 refreshComments 때 지운 댓글이 '부활'하지
            // 않으며, 이 댓글에 다는 답글도 올바른 부모로 저장된다.
            setCommentsByPost((prev) => {
              const list = prev[postId];
              if (!list) return prev;
              const swap = (c: PostComment): PostComment => {
                if (c.id === nc.id) return { ...c, id: sid };
                if (c.replies?.length) return { ...c, replies: c.replies.map(swap) };
                return c;
              };
              return { ...prev, [postId]: list.map(swap) };
            });
          })
          .catch(notifySyncError);
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
    if (list === null) return; // 네트워크/서버 오류 — 로컬 댓글을 지우지 않고 유지
    setCommentsByPost((prev) => {
      const local = prev[postId] ?? [];
      // 아직 서버 반영 전인 로컬 댓글(임시 id, uuid 아님)은 서버 목록 뒤에 보존 — 방금 단 댓글이 사라지지 않게
      const isTemp = (id: string) => !/^[0-9a-f-]{36}$/i.test(id);
      const pendingRoots = local.filter((c) => isTemp(c.id));
      return { ...prev, [postId]: pendingRoots.length > 0 ? [...list, ...pendingRoots] : list };
    });
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

  const addTripGroup = (
    data: Omit<TripGroup, 'id' | 'createdAt'>,
    opts?: { session?: { startDate?: string; endDate?: string; date?: string } }
  ) => {
    const newGroup: TripGroup = {
      ...data,
      // 다국가 분할처럼 같은 ms에 연속 생성돼도 충돌하지 않도록 난수 접미사
      id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date(),
    };
    setTripGroups((prev) => [newGroup, ...prev]);
    // 해외 카드 + 실시간 기록(기간이 오늘 포함)이면 여행 세션에 등록 —
    // 이후 같은 국가의 스냅/기록이 별도 카드로 갈라지지 않고 이 카드에 합류
    if (
      opts?.session &&
      data.countryName &&
      homeCountryName &&
      data.countryName !== homeCountryName &&
      coversNow(opts.session)
    ) {
      const cn = data.countryName;
      setTripSession((prev) => ({
        groups: { ...(sessionAlive(prev) ? prev.groups : {}), [cn]: newGroup.id },
        lastActiveAt: Date.now(),
      }));
    }
  };

  const deleteTripGroup = (id: string) => {
    setTripGroups((prev) => prev.filter((g) => g.id !== id));
    // 여행 세션이 가리키던 카드면 매핑도 정리 (다음 기록 때 새 카드가 자연스럽게 생성됨)
    setTripSession((prev) => {
      if (!prev) return prev;
      const rest = Object.entries(prev.groups).filter(([, gid]) => gid !== id);
      return rest.length > 0 ? { groups: Object.fromEntries(rest), lastActiveAt: prev.lastActiveAt } : null;
    });
  };

  const updateTripGroup = (id: string, changes: Partial<Omit<TripGroup, 'id' | 'createdAt'>>) => {
    setTripGroups((prev) =>
      prev.map((g) => (g.id === id ? { ...g, ...changes } : g))
    );
  };

  // 여행 카드 병합 — 대표(target) 그룹이 나머지(source) 그룹들의 기록을 흡수하고 source는 삭제한다.
  // 제목·커버·국기 등 표시 값은 target 것을 유지한다 (프로필 카드 합치기).
  const mergeTripGroups = (targetId: string, sourceIds: string[]) => {
    const ids = sourceIds.filter((id) => id !== targetId);
    if (ids.length === 0) return;
    setTripGroups((prev) => {
      const target = prev.find((g) => g.id === targetId);
      if (!target) return prev;
      // 다국가 분할 카드는 같은 기록을 공유할 수 있어 중복 제거하며 이어붙인다
      const seen = new Set(target.records);
      const added: string[] = [];
      for (const sid of ids) {
        const source = prev.find((g) => g.id === sid);
        if (!source) continue;
        for (const rid of source.records) {
          if (!seen.has(rid)) { seen.add(rid); added.push(rid); }
        }
      }
      return prev
        .filter((g) => !ids.includes(g.id))
        .map((g) => (g.id === targetId ? { ...g, records: [...g.records, ...added] } : g));
    });
    // 여행 세션이 source 카드를 가리키고 있었으면 병합된 카드로 넘겨 다음 기록이 합류하게 한다
    setTripSession((prev) => {
      if (!prev) return prev;
      const groups = Object.fromEntries(
        Object.entries(prev.groups).map(([cn, gid]) => [cn, ids.includes(gid) ? targetId : gid])
      );
      return { groups, lastActiveAt: prev.lastActiveAt };
    });
  };

  const resetRecords = () => {
    setRecords(INITIAL_RECORDS);
    setArchivedIds([]);
    setBlockedUsers([]);
    setTripGroups([]);
    setDrafts([]);
    setFollowingUsers(INITIAL_FOLLOWING);
    setCommentsByPost(INITIAL_COMMENTS);
    setReportedPostIds([]);
    setMutedHandles([]);
    setCurrentViewer(null);
    setFeedPosts([]);
    // 계정 경계 잔존물 정리 — 이전 계정의 세션·열람 이력·요청이 새 계정 저장본/서버 행으로 이월되지 않게
    setTripSession(null);
    setViewedSnapIds([]);
    setPendingFollowRequests([]);
    // 여행카드 서버 백업/복원 재무장: 새 계정의 백업을 빈 값으로 덮어쓰기 전에 복원부터 다시 시도한다
    tripBackupReadyRef.current = false;
    tripRestoreTriedRef.current = false;
    setTripRestoreNonce((n) => n + 1);
  };

  // 백엔드 피드 새로고침 (남들의 공개/친구 글 + 내 좋아요 표시)
  const refreshFeed = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      // 12초 타임아웃 — 응답이 끊기지 않고 지연되는 경우에도 로딩이 무한 대기하지 않게 한다.
      const [posts, likedIds] = await withTimeout(Promise.all([fetchFeed(), fetchMyLikedPostIds()]), 12000);
      const likedSet = new Set(likedIds);
      setFeedPosts(posts.map((p) => ({ ...p, liked: likedSet.has(p.remoteId ?? p.id) })));
    } catch {
      // 타임아웃 등 진짜 'hang'일 때만 도달(서비스는 일반 실패 시 빈 배열을 반환). 현재 피드는 유지.
      emitToast('피드를 불러오지 못했어요. 네트워크를 확인해 주세요.');
    }
  }, []);

  // 내 기록 서버→로컬 복원 (계정 전환 후 pull). 로컬 records를 서버의 내 글로 교체한다.
  // ⚠️ 로컬-우선 초안까지 대체하므로 계정 전환 직후(로컬을 이미 비운 상태)에만 호출할 것.
  const hydrateMyRecords = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      const mine = await withTimeout(fetchMyPosts(), 12000);
      setRecords(mine);
    } catch {
      // 타임아웃/실패 시 현재(비운) 상태 유지 — 서버 데이터는 안전
    }
  }, []);

  // 팔로잉 목록을 백엔드 기준으로 동기화 (맞팔 여부 포함)
  const refreshFollowing = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    // 대기 중 팔로우 요청도 함께 갱신 (오류 시 null → 로컬 유지)
    fetchMyPendingRequestTargets().then((pending) => {
      if (pending) setPendingFollowRequests(pending);
    });
    const list = await fetchFollowing();
    if (!list) return; // 오류 시 로컬 유지(덮어쓰지 않음)
    // 서버 목록으로 갱신하되 로컬 항목의 followedAt 등은 보존(서버는 팔로우 시각을 안 내려줌).
    // isMutual은 서버(양방향 follows)가 정확하므로 항상 서버 값을 쓴다.
    setFollowingUsers((prev) => {
      const byId = new Map(prev.map((f) => [f.id, f]));
      return list.map((p) => {
        const ex = byId.get(p.id);
        return {
          id: p.id,
          username: p.handle || p.id,
          emoji: p.emoji ?? ex?.emoji ?? undefined,
          isAbroad: ex?.isAbroad ?? false,
          currentCountry: ex?.currentCountry ?? null,
          currentCountryFlag: ex?.currentCountryFlag ?? null,
          followedAt: ex?.followedAt ?? 0,
          isMutual: p.isMutual,
        };
      });
    });
  }, []);

  // 앱 시작/복원 후 피드·팔로잉 1회 로드
  useEffect(() => {
    if (hydrated) {
      refreshFeed();
      refreshFollowing();
    }
  }, [hydrated, refreshFeed, refreshFollowing]);

  // 과거(id 없이 저장된) 차단 항목 uuid 백필 — handle로 프로필을 찾아 id를 채우고
  // 서버 blocks에도 반영한다(RLS 차단 필터 동작). 앱 세션당 1회만 시도.
  const blockBackfillRef = useRef(false);
  useEffect(() => {
    if (!hydrated || !isSupabaseConfigured || blockBackfillRef.current) return;
    blockBackfillRef.current = true;
    const targets = blockedUsers.filter((b) => !b.id && b.handle);
    if (targets.length === 0) return;
    (async () => {
      for (const b of targets) {
        const p = await getProfileByHandle(b.handle!);
        if (!p?.id) continue; // 탈퇴/핸들 변경 등 — 로컬 차단만 유지
        setBlockedUsers((prev) =>
          prev.map((x) => (x.handle === b.handle && !x.id ? { ...x, id: p.id } : x))
        );
        apiBlock(p.id).catch(() => {}); // 백필은 조용히(사용자 액션이 아니므로 실패 토스트 없음)
      }
    })();
  }, [hydrated, blockedUsers]);

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

  // ─── 오프라인 재동기화: 미발행 기록 자동 재시도 ───
  // 오지/기내 등 오프라인에서 작성한 기록은 발행이 실패한 채 로컬에만 남는다(remoteId 없음).
  // 발행 시도는 세션당 1회(publishAttemptRef)로 막혀 있으므로, 네트워크 복귀·앱 포그라운드·
  // 앱 시작 시점에 시도 기록을 지우고 다시 발행한다. 성공하면 remoteId가 붙어 다음 대상에서 빠진다.
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const hydratedRef = useRef(hydrated);
  hydratedRef.current = hydrated;
  const resyncInFlightRef = useRef(false);
  const lastResyncAtRef = useRef(0);
  // publishToBackend는 렌더마다 재생성되므로 안정 콜백에서 ref로 참조
  const publishToBackendRef = useRef(publishToBackend);
  publishToBackendRef.current = publishToBackend;
  const resyncUnpublished = useCallback(async () => {
    if (!isSupabaseConfigured || !hydratedRef.current) return;
    const now = Date.now();
    if (resyncInFlightRef.current || now - lastResyncAtRef.current < 30000) return; // 과호출 방지
    const targets = recordsRef.current.filter(
      (r) =>
        r.isMyPost !== false &&
        !r.remoteId &&
        !r.isDraft &&
        !(r.scheduledAt && r.scheduledAt > now)
    );
    if (targets.length === 0) return;
    // 확실히 오프라인이면 시도하지 않는다 (실패 토스트 도배 방지). 판정 불가(null)면 시도.
    if ((await isOnline()) === false) return;
    resyncInFlightRef.current = true;
    lastResyncAtRef.current = now;
    try {
      for (const r of targets) {
        publishAttemptRef.current.delete(r.id); // 세션 내 재시도 허용
        publishToBackendRef.current(r);
      }
    } finally {
      resyncInFlightRef.current = false;
    }
  }, []);

  // 트리거: 앱 시작(복원 직후) · 오프라인→온라인 전환 · 백그라운드→포그라운드 복귀
  useEffect(() => {
    if (hydrated) resyncUnpublished();
  }, [hydrated, resyncUnpublished]);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const offReconnect = onReconnect(() => { resyncUnpublished(); });
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') resyncUnpublished();
    });
    return () => { offReconnect(); sub.remove(); };
  }, [resyncUnpublished]);

  // ─── 여행 카드·세션 서버 백업 (재설치/기기 변경 복원용) ───
  // 로컬이 원본, 서버는 백업본. 기록 참조는 remoteId(posts.id)로 변환해 저장한다.
  // 변경이 잦으므로 4초 디바운스로 마지막 상태만 올린다 (실패는 조용히 — 다음 변경 때 재시도).
  const backupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 복원 시도가 끝나기 전에는 백업하지 않는다 — 재설치 직후/계정 전환 직후의 빈 상태가
  // 서버 백업을 덮어써 파괴하는 경합 방지. 복원 effect가 끝나면 true.
  const tripBackupReadyRef = useRef(false);
  useEffect(() => {
    if (!hydrated || !isSupabaseConfigured) return;
    if (!tripBackupReadyRef.current) return;
    // 완전 빈 상태는 백업하지 않는다 — 재설치/로그인 직후의 빈 로컬이 서버 백업을 파괴하는
    // 최후 방어선(베타 실사고: 카드 전체 유실, 2026-07-10). 마지막 카드를 지운 경우 서버에
    // 직전 백업이 남는 트레이드오프는 전체 유실보다 안전하다.
    if (tripGroups.length === 0 && !tripSession) return;
    if (backupTimerRef.current) clearTimeout(backupTimerRef.current);
    backupTimerRef.current = setTimeout(() => {
      if (!tripBackupReadyRef.current) return; // 타이머 대기 중 재무장(rearm)된 경우 취소
      const toRemote = (rid: string) => records.find((r) => r.id === rid)?.remoteId ?? rid;
      saveTripState({
        groups: tripGroups.map((g) => ({
          id: g.id,
          title: g.title,
          records: g.records.map(toRemote),
          coverRecordId: toRemote(g.coverRecordId),
          createdAt: g.createdAt.toISOString(),
          countryName: g.countryName,
          countryFlag: g.countryFlag,
          coverUri: g.coverUri,
          date: g.date,
          regionName: g.regionName,
        })),
        session: tripSession,
      });
    }, 4000);
    return () => { if (backupTimerRef.current) clearTimeout(backupTimerRef.current); };
  }, [hydrated, tripGroups, tripSession, records]);

  // 재설치/새 기기 복원 — 로컬에 카드가 전혀 없고 서버 백업이 있으면 1회 복원.
  // 로컬 카드가 있으면 로컬이 원본이므로 절대 덮어쓰지 않는다.
  // 계정 전환(resetRecords) 시 nonce 증가로 새 계정에 대해 재시도한다.
  const tripRestoreTriedRef = useRef(false);
  const [tripRestoreNonce, setTripRestoreNonce] = useState(0);
  useEffect(() => {
    if (!hydrated || !isSupabaseConfigured || tripRestoreTriedRef.current) return;
    (async () => {
      // 로그인 전(세션 없음)에는 '시도'로 치지 않는다 — 스토어는 로그인 전에 마운트되므로
      // 여기서 tried 처리하면 로그인 후 복원이 영영 안 돌고, 백업이 열리면서 빈 tripGroups가
      // 서버 백업을 덮어써 카드가 전부 사라진다(베타 실사고, 2026-07-10).
      // 로그인 완료 후에는 useAccountBoundary가 rearmTripRestore()로 재시도시킨다.
      const uid = await getMyUserId().catch(() => null);
      if (!uid || tripRestoreTriedRef.current) return;
      tripRestoreTriedRef.current = true;
      if (tripGroupsRef.current.length > 0) {
        tripBackupReadyRef.current = true; // 로컬이 원본 — 백업 즉시 허용
        return;
      }
      try {
        const backup = await fetchTripState();
        if (backup && backup.groups.length > 0) {
          setTripGroups((prev) =>
            prev.length > 0
              ? prev
              : backup.groups.map((g) => ({ ...g, createdAt: new Date(g.createdAt) }))
          );
          setTripSession((prev) => {
            if (prev) return prev;
            const s = backup.session;
            return s && Date.now() - s.lastActiveAt <= TRIP_SESSION_MAX_IDLE_MS ? s : null;
          });
        }
      } finally {
        tripBackupReadyRef.current = true; // 복원 시도 완료(성공/실패 무관) 후에만 백업 허용
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, tripRestoreNonce]);

  // 로그인 완료 직후 여행카드 복원 재무장 — 앱 마운트 시점(로그인 전)에 복원이 스킵된 경우 회수.
  // 재시도 전까지 백업도 잠가 빈 상태가 서버 백업을 덮어쓰지 못하게 한다.
  const rearmTripRestore = useCallback(() => {
    tripRestoreTriedRef.current = false;
    tripBackupReadyRef.current = false;
    setTripRestoreNonce((n) => n + 1);
  }, []);

  // ── 앱 상태 통합 백업(user_app_state) — 기록 부가상태 스냅샷 ──
  // 기록 본문은 posts, 여행카드는 user_trip_state가 담당하므로 여기선 부가상태만.
  const exportLocalStateBackup = (): Record<string, unknown> => ({
    archivedIds, blockedUsers, reportedPostIds, mutedHandles, viewedSnapIds,
  });
  const applyLocalStateBackup = (b: Record<string, unknown>) => {
    const v = b as any;
    if (Array.isArray(v.archivedIds)) setArchivedIds(v.archivedIds);
    if (Array.isArray(v.blockedUsers)) setBlockedUsers(v.blockedUsers);
    if (Array.isArray(v.reportedPostIds)) setReportedPostIds(v.reportedPostIds);
    if (Array.isArray(v.mutedHandles)) setMutedHandles(v.mutedHandles);
    if (Array.isArray(v.viewedSnapIds)) setViewedSnapIds(v.viewedSnapIds);
  };

  // 예약 글의 여행 카드 연결 — 작성 시가 아니라 발행 시점(예약 시각 도달)에 연결한다.
  // 백엔드 설정과 무관(카드는 로컬 기능). 이미 카드에 속한 글(과거 빌드 작성분)은 건너뜀.
  const linkedScheduledRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!hydrated) return;
    const now = Date.now();
    records.forEach((r) => {
      if (r.isDraft || !r.scheduledAt || r.scheduledAt > now) return;
      if (linkedScheduledRef.current.has(r.id)) return;
      linkedScheduledRef.current.add(r.id);
      if (tripGroups.some((g) => g.records.includes(r.id))) return;
      linkRecordToTrip(r);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, records, tripGroups]);

  // record.comments(표시용 숫자)를 commentsByPost(실제 댓글)와 동기화 — 단일 출처 유지.
  // 로드되지 않은 글(백엔드 카운트만 있는 경우)은 건드리지 않는다.
  useEffect(() => {
    const sync = (list: TravelRecord[]) => {
      let changed = false;
      const next = list.map((r) => {
        if (commentsByPost[r.id] === undefined) return r;
        const cnt = countTotalComments(commentsByPost[r.id]);
        if (r.comments === cnt) return r;
        changed = true;
        return { ...r, comments: cnt };
      });
      return changed ? next : list;
    };
    setRecords((prev) => sync(prev));
    setFeedPosts((prev) => sync(prev));
  }, [commentsByPost]);

  // 내 글의 작성자 표시정보(이름/핸들/사진)를 현재 설정과 동기화 — 아이디/사진 변경 시 과거 글도 최신값으로.
  useEffect(() => {
    if (!hydrated) return;
    const photo = profilePhoto || undefined;
    // 아이디 폰트 — 해지 시 내 글에서도 기본 폰트(잠금+값 보존 정책)
    const font = (isPremium && handleFont) || undefined;
    setRecords((prev) => {
      let changed = false;
      const next = prev.map((r) => {
        if (!r.isMyPost) return r;
        if (r.user.name === handle && r.user.handle === handle && r.user.photo === photo && r.user.font === font) return r;
        changed = true;
        return { ...r, user: { ...r.user, name: handle, handle, photo, font } };
      });
      return changed ? next : prev;
    });
  }, [hydrated, handle, profilePhoto, handleFont, isPremium]);

  // 복원 전에는 시드 데이터가 잠깐 보이지 않도록 렌더를 막는다
  if (!hydrated) {
    return <View style={{ flex: 1, backgroundColor: '#0A0118' }} />;
  }

  return (
    <RecordContext.Provider value={{ records, addRecord, updateRecord, deleteRecord, toggleLike, markSnapViewed, viewedSnapIds, archivedIds, archiveRecord, unarchiveRecord, blockedUsers, blockUser, unblockUser, isBlocked, reportedPostIds, reportPost, mutedHandles, toggleMute, isMuted, followingUsers, followUser, unfollowUser, setFollowMutual, pendingFollowRequests, requestFollow, cancelFollowRequest, isFollowRequested, commentsByPost, addComment, toggleCommentLike, deleteComment, tripGroups, addTripGroup, deleteTripGroup, updateTripGroup, mergeTripGroups, drafts, saveDraft, updateDraft, deleteDraft, publishDraft, addImportedAlbum, resetRecords, currentViewer, setCurrentViewer, feedPosts, refreshFeed, refreshFollowing, refreshComments, hydrateMyRecords, rearmTripRestore, exportLocalStateBackup, applyLocalStateBackup }}>
      {children}
    </RecordContext.Provider>
  );
}

export function useRecords() {
  const ctx = useContext(RecordContext);
  if (!ctx) throw new Error('useRecords must be used within RecordProvider');
  return ctx;
}
