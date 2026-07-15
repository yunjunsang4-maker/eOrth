import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, View } from 'react-native';
import { isOnline, onReconnect } from '../utils/connectivity';
import type { BlogBlock, BlogCategory } from '../types/blogBlocks';
import { useSettings } from './settingsStore';
import { usePersistence, STORE_KEYS } from './persist';
import { isSupabaseConfigured } from '../services/supabase';
import { emitToast } from './toastStore';
import i18n from '../i18n';
import { publishPost, updatePost, deletePost, fetchFeed, fetchMyPosts, type PublishMediaOptions } from '../services/posts';
import { getProfileByHandle, getMyUserId } from '../services/profile';
import { COUNTRIES } from '../constants/countries';
import { normalizeHomeRegion } from '../constants/homeRegions';
import { saveTripState, fetchTripState } from '../services/tripState';
import { removeMediaUrls } from '../services/media';
import { persistRecordPhotos } from '../utils/persistRecordPhotos';
import type { StayType, StayStatus } from '../utils/stayMachine';
import { decideOnVisitedChange, type StaySnapshot } from '../utils/stayMachine';
import {
  requestNeighbor as apiRequestNeighbor,
  cancelNeighborRequest as apiCancelNeighborRequest,
  acceptNeighbor as apiAcceptNeighbor,
  declineNeighbor as apiDeclineNeighbor,
  removeNeighbor as apiRemoveNeighbor,
  fetchNeighbors,
  fetchMyOutgoingNeighborRequests,
  blockUser as apiBlock,
  unblockUser as apiUnblock,
  reportPostToServer as apiReportPost,
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
export type Visibility = 'private' | 'neighbors';

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
  // 사진첩 부가 메타 — uri 키라 순서변경/삭제에 안전 (삭제 시 고아 항목은 무해)
  mediaAssetIds?: Record<string, string>; // media uri → 기기 사진 assetId (중복 추가 방지)
  mediaTimes?: Record<string, number>;    // media uri → 촬영시각 ms ('일자별로 다시 구성'용)
  // 사진첩 서버 백업 상태 — uploadedMediaUrls는 로컬 uri→업로드 URL 캐시(수정 때 전 장
  // 재업로드 방지, 서버 data엔 미포함). albumUploadQuality는 서버본 화질(미설정=압축 도입
  // 이전 발행분, 원본으로 취급). 원본 백업은 프리미엄 혜택 — services/posts.ts 참조.
  uploadedMediaUrls?: Record<string, string>;
  albumUploadQuality?: 'compressed' | 'original';
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

// 체류(장기체류) 메타 — 있으면 이 TripGroup은 여행 카드가 아니라 체류 카드다.
export interface TripGroupStayMeta {
  type: StayType;
  status: StayStatus;
  startedAt: string;    // YYYY.MM.DD (체류 시작일)
  endedAt?: string;     // 종료일 (미종료면 없음)
  lastActiveAt: number; // 마지막으로 체류국에 있던 시각(ms) — 60일 넛지 판정용
}

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
  stay?: TripGroupStayMeta; // 있으면 체류 카드
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
  photo?: string; // 프로필 사진 URL (목록 아바타 표시용)
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
  authorId?: string; // 작성자 profile uuid — 댓글에서 프로필 이동용(서버 댓글만)
}

// 신규 사용자는 빈 상태로 시작 (데모 시드 제거)
const INITIAL_NEIGHBORS: FollowedFriend[] = [];
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
  reportPost: (id: string, reason?: string) => void;
  // 음소거한 사용자 handle — 영속(알림 백엔드 도입 시 알림 억제에 사용)
  mutedHandles: string[];
  toggleMute: (handle: string) => void;
  isMuted: (handle: string) => boolean;
  neighbors: FollowedFriend[];
  requestNeighbor: (targetId: string) => void;
  cancelNeighborRequest: (targetId: string) => void;
  acceptNeighbor: (requesterId: string) => void;
  declineNeighbor: (requesterId: string) => void;
  removeNeighbor: (idOrUsername: string) => void;
  // 내가 보낸 대기 중 이웃신청의 대상 id (서버 상태, 비영속)
  outgoingNeighborRequests: string[];
  isNeighbor: (id: string) => boolean;
  isNeighborRequested: (targetId: string) => boolean;
  refreshNeighbors: () => Promise<void>;
  commentsByPost: Record<string, PostComment[]>;
  // remoteIdOverride: 스토어에 없는 글(타인 프로필 폴백)도 댓글이 서버에 저장되게 하는 보조 키
  addComment: (postId: string, text: string, replyToId?: string, remoteIdOverride?: string) => void;
  toggleCommentLike: (postId: string, commentId: string) => void;
  deleteComment: (postId: string, commentId: string) => void;
  tripGroups: TripGroup[];
  // session: 다국가 분할 저장 카드용 — 기록 기간(실시간 여부 판단)을 넘기면 해외 카드를
  // 여행 세션에 등록해, 이후 그 국가의 실시간 기록(스냅 등)이 이 카드에 합류한다
  addTripGroup: (group: Omit<TripGroup, 'id' | 'createdAt'>, opts?: { session?: { startDate?: string; endDate?: string; date?: string } }) => void;
  deleteTripGroup: (id: string) => void;
  updateTripGroup: (id: string, changes: Partial<Omit<TripGroup, 'id' | 'createdAt'>>) => void;
  mergeTripGroups: (targetId: string, sourceIds: string[]) => void;
  // 장기체류
  activeStayGroup: TripGroup | null;
  startStay: (countryName: string, type: StayType) => void;
  endStay: (groupId: string) => void;
  // 새 해외국 감지 → "여행/장기체류" 프롬프트 요청 (UI가 소비). null이면 없음
  stayPromptCountry: string | null;
  setStayPromptCountry: React.Dispatch<React.SetStateAction<string | null>>;
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
    albumSections?: { id: string; title: string; count: number }[]; // 날짜별 자동 섹션 등
    mediaAssetIds?: Record<string, string>;
    mediaTimes?: Record<string, number>;
  }) => TravelRecord; // 생성된 record 반환 (저장 직후 상세 이동용)
  resetRecords: () => void; // 모든 데이터를 첫 실행 상태(시드)로 되돌림
  // 소셜 미리보기 뷰어 — null=작성자/전체공개 시점. 비영구(저장 안 함).
  currentViewer: string | null;
  setCurrentViewer: (name: string | null) => void;
  // 백엔드 피드(남들의 공개/친구 글). Supabase 미설정 시 항상 빈 배열.
  feedPosts: TravelRecord[];
  refreshFeed: () => Promise<void>;
  refreshComments: (postId: string, remoteId?: string) => Promise<void>;
  // 내 기록을 서버에서 로컬로 복원(계정 전환 후 pull). 로컬 records를 서버 기준으로 교체한다.
  hydrateMyRecords: () => Promise<void>;
  // 로그인 완료 직후 여행카드 복원 재무장 — 로그인 전 마운트 때 스킵된 복원을 재시도시킨다.
  rearmTripRestore: () => void;
  // 앱 상태 통합 백업(user_app_state) — 기록 부가상태(보관·신고숨김·음소거·차단·본스냅) 내보내기/적용
  exportLocalStateBackup: () => Record<string, unknown>;
  applyLocalStateBackup: (b: Record<string, unknown>) => void;
  // 프리미엄: 압축본으로 백업된 사진첩을 원본 화질로 재업로드 (성공/실패 앨범 수 반환)
  rebackupAlbumOriginals: () => Promise<{ upgraded: number; failed: number }>;
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
  neighbors?: FollowedFriend[];
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
  const [neighbors, setNeighbors] = useState<FollowedFriend[]>(INITIAL_NEIGHBORS);
  // 내가 보낸 대기 중 이웃신청 대상 id — 서버가 원본, 세션 내 공유용(비영속)
  const [outgoingNeighborRequests, setOutgoingNeighborRequests] = useState<string[]>([]);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, PostComment[]>>(INITIAL_COMMENTS);
  const [reportedPostIds, setReportedPostIds] = useState<string[]>([]);
  // 내가 본 타인 스냅(remoteId) — feedPosts는 재조회 시 초기화되므로 '안 본 링' 상태를 영속 유지
  const [viewedSnapIds, setViewedSnapIds] = useState<string[]>([]);
  const [mutedHandles, setMutedHandles] = useState<string[]>([]);
  const [currentViewer, setCurrentViewer] = useState<string | null>(null);
  const [feedPosts, setFeedPosts] = useState<TravelRecord[]>([]);
  // 새 해외국 감지 → "여행/장기체류" 프롬프트 요청 (UI가 소비). null이면 없음
  const [stayPromptCountry, setStayPromptCountry] = useState<string | null>(null);

  const hydrated = usePersistence<RecordPersistPayload>(
    STORE_KEYS.records,
    (p) => {
      // 모든 필드에 배열/폴백 가드 — 한 필드라도 throw하면 부분 복원 상태가
      // hydrated=true 이후 디바운스 저장으로 원본을 덮어써 영구 데이터 파괴가 된다.
      // 공개범위 2값(private | neighbors) 전환 보정: 과거 저장본의 'public'/'friends'는
      // 더 이상 유효하지 않으므로 모두 'neighbors'로 승격한다. ('private'은 그대로 유지)
      setRecords(
        (Array.isArray(p.records) ? p.records : []).map((r) => {
          // 과거 저장본의 legacy 값('public'/'friends')은 현재 Visibility 타입에 없어
          // 비교가 안 되므로 문자열로 확인한다(런타임엔 존재).
          const legacy = r.visibility as string;
          return legacy === 'public' || legacy === 'friends'
            ? { ...r, visibility: 'neighbors' as const }
            : r;
        })
      );
      setArchivedIds(Array.isArray(p.archivedIds) ? p.archivedIds : []);
      setBlockedUsers(Array.isArray(p.blockedUsers) ? p.blockedUsers : []);
      setTripGroups(
        Array.isArray(p.tripGroups)
          ? p.tripGroups.map((g) => ({ ...g, createdAt: new Date(g.createdAt) }))
          : []
      );
      setDrafts(Array.isArray(p.drafts) ? p.drafts : []);
      setNeighbors(
        Array.isArray(p.neighbors)
          ? p.neighbors
          : (Array.isArray((p as any).followingUsers) ? (p as any).followingUsers : INITIAL_NEIGHBORS)
      );
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
    () => ({ records, archivedIds, blockedUsers, tripGroups, drafts, neighbors, commentsByPost, reportedPostIds, mutedHandles, viewedSnapIds, tripSessionGroups: tripSession }),
    [records, archivedIds, blockedUsers, tripGroups, drafts, neighbors, commentsByPost, reportedPostIds, mutedHandles, viewedSnapIds, tripSession],
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
    // 지역은 거주국가 프리셋으로 정규화(수원시→경기, Kyoto→교토부 등). 정규화 실패 시 원본 유지, 미입력은 null
    const recRegion = isDomestic
      ? (normalizeHomeRegion(homeCountryCode, rec.regionName)?.name ?? rec.regionName ?? null)
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
            normalizeHomeRegion(homeCountryCode, members[0].regionName)?.name ??
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

    // 진행 중(active) 체류국의 실시간 기록 → 체류 카드에 직접 합류 + 활동 시각 갱신
    const stayG = tripGroupsRef.current.find(
      (g) => g.stay && g.stay.status === 'active' && g.countryName === country
    );
    if (stayG && country !== homeCountryName) {
      if (!stayG.records.includes(rec.id)) {
        const grow = (list: TripGroup[]) => list.map((g) =>
          g.id === stayG.id
            ? { ...g, records: [...g.records, rec.id], coverRecordId: g.coverRecordId || rec.id, stay: { ...g.stay!, lastActiveAt: Date.now() } }
            : g);
        setTripGroups((prev) => grow(prev));
        tripGroupsRef.current = grow(tripGroupsRef.current);
      }
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

  // ─── 장기체류(Stay) ───
  // 진행 중(active/paused) 체류 카드 — 동시에 최대 1개 (ended는 제외)
  const activeStayGroup = tripGroups.find((g) => g.stay && g.stay.status !== 'ended') ?? null;

  // 체류 시작 — 체류 카드 생성(active) + 세션을 이 카드로 등록해 체류국 기록이 합류하게 한다
  const startStay = (countryName: string, type: StayType) => {
    // 진행 중 체류가 이미 있으면 무시 — 동시 체류는 1개(프롬프트/감지 이벤트 중복 발화 방어)
    if (tripGroupsRef.current.some((g) => g.stay && g.stay.status !== 'ended')) return;
    const today = new Date();
    const ymd = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
    const meta = COUNTRIES.find((c) => c.name === countryName);
    const ng: TripGroup = {
      id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `${countryName} 체류`,
      records: [],
      coverRecordId: '',
      createdAt: new Date(),
      countryName,
      countryFlag: meta?.flag,
      date: ymd,
      stay: { type, status: 'active', startedAt: ymd, lastActiveAt: Date.now() },
    };
    setTripGroups((prev) => [ng, ...prev]);
    tripGroupsRef.current = [ng, ...tripGroupsRef.current];
    const opened: TripSession = { groups: { ...(tripSessionRef.current?.groups ?? {}), [countryName]: ng.id }, lastActiveAt: Date.now() };
    setTripSession(opened);
    tripSessionRef.current = opened;
  };

  // 체류 종료 — status='ended', endedAt=마지막 체류국 기록일(기록 없으면 시작일)
  const endStay = (groupId: string) => {
    const apply = (list: TripGroup[]) => list.map((g) => {
      if (g.id !== groupId || !g.stay) return g;
      const dates = g.records
        .map((id) => records.find((r) => r.id === id))
        .map((r) => r && (r.endDate || r.startDate || r.date))
        .filter(Boolean) as string[];
      const endedAt = dates.sort().slice(-1)[0] || g.stay.startedAt;
      return { ...g, stay: { ...g.stay, status: 'ended' as StayStatus, endedAt } };
    });
    setTripGroups(apply);
    tripGroupsRef.current = apply(tripGroupsRef.current);
    // 종료된 체류 카드로 새 기록이 합류하지 않게 세션 매핑 제거
    const cur = tripSessionRef.current;
    if (cur) {
      const entries = Object.entries(cur.groups).filter(([, gid]) => gid !== groupId);
      const next = entries.length > 0 ? { groups: Object.fromEntries(entries), lastActiveAt: cur.lastActiveAt } : null;
      setTripSession(next);
      tripSessionRef.current = next;
    }
  };

  // 국가명 → ISO 코드 (COUNTRIES term의 첫 토큰이 소문자 iso2)
  const codeOfCountryName = (name: string | undefined | null): string | null => {
    if (!name) return null;
    const c = COUNTRIES.find((x) => x.name === name);
    return c ? c.term.split(' ')[0].toUpperCase() : null;
  };

  // 도착 감지 — 위치 전환 시 여행 세션 종료(귀국) + 체류 일시정지/재개 + 새 해외국 프롬프트.
  // 값 '전환'만 신호로 쓴다(감지 미사용 시 기본값이 거주국가라 상시 비교는 오탐).
  const prevVisitedRef = useRef(currentVisitedCountryCode);
  useEffect(() => {
    const prev = prevVisitedRef.current;
    prevVisitedRef.current = currentVisitedCountryCode;
    if (prev === currentVisitedCountryCode) return;

    // 귀국(해외→거주국 전환) → 여행 세션 종료 (기존 동작 유지)
    if (currentVisitedCountryCode === homeCountryCode && prev !== homeCountryCode) {
      setTripSession(null);
      tripSessionRef.current = null;
    }

    // 체류 일시정지/재개/새 해외국 판정 (ended 체류는 snapshot으로 만들지 않는다)
    const stayGroup = tripGroupsRef.current.find((g) => g.stay && g.stay.status !== 'ended');
    const snap: StaySnapshot | null = stayGroup
      ? { countryCode: codeOfCountryName(stayGroup.countryName) ?? '', status: stayGroup.stay!.status, lastActiveAt: stayGroup.stay!.lastActiveAt }
      : null;
    const d = decideOnVisitedChange({ visitedCountryCode: currentVisitedCountryCode, homeCountryCode, stay: snap });

    if ((d.pauseStay || d.resumeStay) && stayGroup) {
      const apply = (list: TripGroup[]) => list.map((g) =>
        g.id === stayGroup.id
          ? { ...g, stay: { ...g.stay!, status: (d.resumeStay ? 'active' : 'paused') as StayStatus, lastActiveAt: d.resumeStay ? Date.now() : g.stay!.lastActiveAt } }
          : g);
      setTripGroups((prev2) => apply(prev2));
      tripGroupsRef.current = apply(tripGroupsRef.current);
      // 재개: 귀국 때 지워진 세션에 체류 카드를 다시 등록 — 재전환 시 프롬프트 재노출 방지·세션 일관성 유지
      if (d.resumeStay && stayGroup.countryName) {
        const restored: TripSession = {
          groups: { ...(tripSessionRef.current?.groups ?? {}), [stayGroup.countryName]: stayGroup.id },
          lastActiveAt: Date.now(),
        };
        setTripSession(restored);
        tripSessionRef.current = restored;
        emitToast(i18n.t('stay.resumeToast', { country: stayGroup.countryName }));
      }
    }

    // 새 해외국(거주국·체류국 아님) → 여행/장기체류 프롬프트 요청 (이미 그 나라 여행 세션이 있으면 생략)
    if (d.isNewAbroadCountry) {
      const visitName = COUNTRIES.find((c) => c.term.split(' ')[0].toUpperCase() === currentVisitedCountryCode.toUpperCase())?.name ?? null;
      const alreadyTravel = !!(tripSessionRef.current && visitName && tripSessionRef.current.groups[visitName]);
      if (visitName && !alreadyTravel) setStayPromptCountry(visitName);
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
  // 사진첩 발행/수정 공통 옵션 — 화질(비프리미엄=압축) + 업로드 캐시 + 캐시 병합 콜백
  const albumPublishOpts = (rec: TravelRecord): PublishMediaOptions | undefined => {
    if (rec.viewType !== 'album') return undefined;
    return {
      albumQuality: rec.albumUploadQuality ?? (isPremium ? 'original' : 'compressed'),
      uploadCache: rec.uploadedMediaUrls,
      onUploaded: (map) =>
        setRecords((prev) =>
          prev.map((r) =>
            r.id === rec.id ? { ...r, uploadedMediaUrls: { ...(r.uploadedMediaUrls ?? {}), ...map } } : r
          )
        ),
    };
  };

  const publishToBackend = (rec: TravelRecord) => {
    if (!isSupabaseConfigured || rec.isDraft) return;
    if (rec.scheduledAt && rec.scheduledAt > Date.now()) return;
    if (publishAttemptRef.current.has(rec.id)) return;
    publishAttemptRef.current.add(rec.id);
    const opts = albumPublishOpts(rec);
    publishPost(rec, opts)
      .then((rid) => {
        if (!rid) return;
        // 업로드 중 삭제된 글 → 서버에 유령 게시물로 남지 않게 즉시 삭제
        const live = recordsLiveRef.current.find((r) => r.id === rec.id);
        if (pendingDeleteRef.current.has(rec.id) || !live) {
          pendingDeleteRef.current.delete(rec.id);
          deletePost(rid).catch(() => {});
          return;
        }
        // 사진첩은 이번 발행에 쓴 화질을 기록 — 프리미엄 원본 재백업 스윕의 대상 판정 기준
        const quality = opts?.albumQuality;
        setRecords((prev) =>
          prev.map((r) =>
            r.id === rec.id ? { ...r, remoteId: rid, ...(quality ? { albumUploadQuality: quality } : {}) } : r
          )
        );
        // 업로드 중 수정된 글 → 캡처본(구버전)이 insert됐으므로 최신 내용으로 서버 갱신
        if (live !== rec) updatePost(rid, { ...live, remoteId: rid }, albumPublishOpts(live)).catch(notifySyncError);
      })
      .catch(notifySyncError);
  };

  // 프리미엄: 압축본으로 백업된 사진첩을 원본 화질로 재업로드.
  // 기기 로컬 원본(medias)이 진실의 원천이라 같은 기기에서는 언제든 소급 승격이 가능하다.
  const rebackupAlbumOriginals = useCallback(async (): Promise<{ upgraded: number; failed: number }> => {
    let upgraded = 0;
    let failed = 0;
    const targets = recordsLiveRef.current.filter(
      (r) =>
        r.isMyPost !== false &&
        r.viewType === 'album' &&
        !!r.remoteId &&
        r.albumUploadQuality === 'compressed' && // 미설정(압축 도입 전 발행)은 이미 원본
        (r.medias?.length ?? 0) > 0
    );
    for (const rec of targets) {
      const oldUrls = Object.values(rec.uploadedMediaUrls ?? {});
      let newMap: Record<string, string> = {};
      const ok = await updatePost(rec.remoteId!, rec, {
        albumQuality: 'original',
        uploadCache: {}, // 압축본 캐시 무시 — 원본으로 전부 새로 업로드
        onUploaded: (m) => { newMap = m; },
      }).catch(() => false);
      if (ok) {
        upgraded += 1;
        setRecords((prev) =>
          prev.map((r) => (r.id === rec.id ? { ...r, albumUploadQuality: 'original', uploadedMediaUrls: newMap } : r))
        );
        // 교체된 압축본 파일 정리 (새 업로드에 포함되지 않은 것만)
        const keep = new Set(Object.values(newMap));
        const stale = oldUrls.filter((u) => !keep.has(u));
        if (stale.length > 0) removeMediaUrls(stale).catch(() => {});
      } else {
        failed += 1;
        // 중간까지 올라간 원본은 아직 게시물이 참조하지 않는 고아 — 재시도 전에 정리
        const partial = Object.values(newMap);
        if (partial.length > 0) removeMediaUrls(partial).catch(() => {});
      }
    }
    return { upgraded, failed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 기록이 참조하는 업로드(원격) 미디어 URL 전부 수집 — 삭제/교체 시 Storage 고아 파일 정리용
  const collectRemoteMediaUrls = (r: TravelRecord): string[] => {
    const out: string[] = [];
    const push = (u?: string | null) => { if (u && u.startsWith('http')) out.push(u); };
    (r.medias ?? []).forEach(push);
    push(r.representativePhoto);
    push(r.cutPhoto?.previewUri);
    (r.blogBlocks ?? []).forEach((b: any) => { push(b?.uri); push(b?.thumbnail); });
    Object.values(r.perCountryData ?? {}).forEach((d) => {
      (d.medias ?? []).forEach(push);
      push(d.representativePhoto);
    });
    return out;
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
      if (cur?.remoteId) updatePost(cur.remoteId, { ...cur, ...changes }, albumPublishOpts({ ...cur, ...changes })).catch(notifySyncError);
      // 수정으로 더 이상 참조되지 않는 업로드 파일은 Storage에서 정리 (고아 파일 누수 방지)
      if (cur && updated) {
        const keep = new Set(collectRemoteMediaUrls(updated));
        const removed = collectRemoteMediaUrls(cur).filter((u) => !keep.has(u));
        if (removed.length > 0) removeMediaUrls(removed).catch(() => {});
      }
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
      // 게시물이 참조하던 업로드 파일도 Storage에서 정리 (고아 파일 누수 방지)
      const urls = collectRemoteMediaUrls(target);
      if (urls.length > 0) removeMediaUrls(urls).catch(() => {});
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
  // 댓글 좋아요 진행 중 상태 — toggleCommentLike 연타 드리프트 방지용
  const commentLikeStateRef = useRef<Record<string, boolean>>({});
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
    // 차단하면 이웃에서도 제거 — 화면별 처리 불일치 방지 (이웃 아니면 no-op)
    // id 우선, 없으면 handle → 표시이름 순으로 매칭 (이웃 항목의 username은 handle과 동일 값)
    const nb = neighbors.find((f) =>
      (!!user.id && f.id === user.id) ||
      (!!f.username && (f.username === user.handle || f.username === user.name))
    );
    if (nb) removeNeighbor(nb.id || nb.username);
    // 서버 blocks 반영 — 서버 RLS(게시물·댓글·DM 차단)가 실제로 동작하게 함.
    // id가 uuid가 아니면(로컬 합성 id: 'dm-핸들' 등) 그대로 보내면 uuid 컬럼에서 실패하므로
    // handle로 profile uuid를 조회(백필)해서 반영한다.
    if (isSupabaseConfigured) {
      const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);
      if (isUuid(user.id)) {
        apiBlock(user.id!).catch(notifySyncError);
      } else if (user.handle) {
        getProfileByHandle(user.handle)
          .then((p) => {
            if (!p?.id) return;
            apiBlock(p.id).catch(notifySyncError);
            // 백필된 uuid를 차단 항목에도 채워 이후 해제(unblock)가 서버까지 반영되게 함
            setBlockedUsers((prev) => prev.map((b) => (b.handle === user.handle ? { ...b, id: p.id } : b)));
          })
          .catch(() => {});
      }
    }
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

  // 게시물 신고 → 신고 목록에 추가(피드에서 숨김) + 서버 reports에 접수(운영자 확인용).
  // 이미 신고했으면 무시.
  const reportPost = (id: string, reason?: string) => {
    if (reportedPostIds.includes(id)) return;
    setReportedPostIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    if (isSupabaseConfigured) {
      // remoteId 우선(백엔드 글), 피드 글은 id가 곧 remoteId. 로컬 전용 글이면 post_id 없이 접수
      const target = records.find((r) => r.id === id) ?? feedPosts.find((r) => r.id === id);
      const remoteId = target?.remoteId ?? (feedPosts.some((r) => r.id === id) ? id : null);
      apiReportPost(remoteId, reason ?? null).catch(() => {
        // 접수 실패는 조용히 무시 — 로컬 숨김은 이미 적용됨(재신고 시 재시도)
      });
    }
  };

  // 사용자 알림 음소거 토글/조회 (handle 기준, 영속)
  const toggleMute = (handle: string) => {
    if (!handle) return;
    setMutedHandles((prev) => (prev.includes(handle) ? prev.filter((h) => h !== handle) : [...prev, handle]));
  };
  const isMuted = useCallback((handle: string) => mutedHandles.includes(handle), [mutedHandles]);

  // 신원은 id 기준 — 핸들(username)이 빈 유저끼리 오판 방지
  const sameNeighbor = (f: FollowedFriend, key: string) =>
    f.id === key || (!!f.username && f.username === key);

  // 이웃신청 — 낙관적으로 '신청됨'(대기) 목록에 추가. 수락 전까지 이웃 목록엔 넣지 않는다.
  // (상대도 나에게 신청해 둔 상태면 service가 자동 수락 → refreshNeighbors가 이웃으로 반영)
  const requestNeighbor = (targetId: string) => {
    if (!targetId) return;
    setOutgoingNeighborRequests((prev) => (prev.includes(targetId) ? prev : [...prev, targetId]));
    if (isSupabaseConfigured) {
      apiRequestNeighbor(targetId)
        .then(() => refreshNeighbors())
        .catch((e) => {
          setOutgoingNeighborRequests((prev) => prev.filter((id) => id !== targetId));
          notifySyncError(e);
        });
    }
  };

  const cancelNeighborRequest = (targetId: string) => {
    if (!targetId) return;
    setOutgoingNeighborRequests((prev) => prev.filter((id) => id !== targetId));
    if (isSupabaseConfigured) {
      apiCancelNeighborRequest(targetId).catch((e) => {
        setOutgoingNeighborRequests((prev) => (prev.includes(targetId) ? prev : [...prev, targetId]));
        notifySyncError(e);
      });
    }
  };

  // 받은 신청 수락 → 이웃이 됨(refreshNeighbors로 목록 반영)
  const acceptNeighbor = (requesterId: string) => {
    if (!requesterId) return;
    if (isSupabaseConfigured) {
      apiAcceptNeighbor(requesterId)
        .then(() => refreshNeighbors())
        .catch(notifySyncError);
    }
  };

  const declineNeighbor = (requesterId: string) => {
    if (!requesterId) return;
    if (isSupabaseConfigured) apiDeclineNeighbor(requesterId).catch(notifySyncError);
  };

  // 이웃 끊기 — 로컬 목록에서 제거 + 서버 accepted 관계 삭제
  const removeNeighbor = (idOrUsername: string) => {
    const target = neighbors.find((f) => sameNeighbor(f, idOrUsername));
    setNeighbors((prev) => prev.filter((f) => (target ? f !== target : !sameNeighbor(f, idOrUsername))));
    const targetId = target?.id || (/* id로 직접 넘어온 경우 */ idOrUsername);
    if (isSupabaseConfigured && targetId) apiRemoveNeighbor(targetId).catch(notifySyncError);
  };

  const isNeighbor = useCallback(
    (id: string) => neighbors.some((f) => f.id === id),
    [neighbors]
  );

  // '신청됨' 판정 — 이미 이웃이면(수락됨) 신청 상태로 보지 않는다
  const isNeighborRequested = useCallback(
    (targetId: string) =>
      outgoingNeighborRequests.includes(targetId) && !neighbors.some((f) => f.id === targetId),
    [outgoingNeighborRequests, neighbors]
  );

  const addComment = (postId: string, text: string, replyToId?: string, remoteIdOverride?: string) => {
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
      const remoteId = own?.remoteId ?? feed?.remoteId ?? feed?.id ?? remoteIdOverride;
      if (remoteId) {
        // 답글 부모는 백엔드 댓글 uuid일 때만 연결. 답글의 답글이면 top-level 부모로 승격(단일 단계 유지).
        let parent: string | undefined;
        if (replyToId && /^[0-9a-f-]{36}$/i.test(replyToId)) {
          const list = commentsByPost[postId] ?? [];
          const top = list.find((c) => c.id === replyToId || c.replies?.some((r) => r.id === replyToId));
          parent = top && /^[0-9a-f-]{36}$/i.test(top.id) ? top.id : replyToId;
        }
        apiAddComment(remoteId, text, parent)
          .then(async (sid) => {
            if (!sid) return;
            // 내 profile uuid도 함께 부착 — 없으면 내가 단 댓글에서 작성자 프로필 이동이
            // 비활성(disabled={!c.authorId})으로 남는다.
            const myUid = await getMyUserId().catch(() => null);
            // 서버 uuid를 로컬 댓글 id로 교체 — 방금 단 댓글의 삭제·좋아요가 서버에 반영되고
            // (isRemoteId 게이트 통과), 상세 재진입 refreshComments 때 지운 댓글이 '부활'하지
            // 않으며, 이 댓글에 다는 답글도 올바른 부모로 저장된다.
            setCommentsByPost((prev) => {
              const list = prev[postId];
              if (!list) return prev;
              const swap = (c: PostComment): PostComment => {
                if (c.id === nc.id) return { ...c, id: sid, authorId: myUid ?? c.authorId };
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
    // 연타 시 stale 상태로 같은 방향이 두 번 적용되는 드리프트 방지 — 진행 중 상태를 ref로 추적
    const cur = commentLikeStateRef.current[commentId] ?? findCommentById(commentsByPost[postId], commentId)?.liked ?? false;
    const willLike = !cur;
    commentLikeStateRef.current[commentId] = willLike;
    setCommentsByPost((prev) => {
      const list = prev[postId];
      if (!list) return prev;
      const flip = (c: PostComment): PostComment => {
        if (c.id === commentId) {
          if (c.liked === willLike) return c; // 이미 원하는 상태면 no-op (이중 적용 방지)
          return { ...c, liked: willLike, likes: Math.max(0, (c.likes ?? 0) + (willLike ? 1 : -1)) };
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
    const snapshot = commentsByPost[postId]; // 서버 삭제 실패 시 복원용
    setCommentsByPost((prev) => {
      const list = prev[postId];
      if (!list) return prev;
      const next = list
        .filter((c) => c.id !== commentId)
        .map((c) => (c.replies?.length ? { ...c, replies: c.replies.filter((r) => r.id !== commentId) } : c));
      return { ...prev, [postId]: next };
    });
    if (isSupabaseConfigured && isRemoteId(commentId)) {
      apiDeleteComment(commentId).catch((e) => {
        // 서버 삭제 실패 → 로컬 복원. 안 하면 다음 refreshComments 때 서버 사본으로
        // '부활'해 사용자는 삭제가 됐다 안 됐다 하는 것처럼 보인다.
        if (snapshot) setCommentsByPost((prev) => ({ ...prev, [postId]: snapshot }));
        notifySyncError(e);
      });
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
      const pendingRoots = local.filter((c) => isTemp(c.id)); // 임시 루트는 replies째로 보존
      // 서버 댓글(uuid 부모) 밑에 단 '임시 답글'도 보존 — 루트만 남기면 방금 단 답글이 증발한다
      const pendingRepliesByParent: Record<string, PostComment[]> = {};
      for (const c of local) {
        if (isTemp(c.id)) continue;
        const temps = (c.replies ?? []).filter((r) => isTemp(r.id));
        if (temps.length) pendingRepliesByParent[c.id] = temps;
      }
      const merged = Object.keys(pendingRepliesByParent).length
        ? list.map((c) => {
            const temps = pendingRepliesByParent[c.id];
            if (!temps) return c;
            const have = new Set((c.replies ?? []).map((r) => r.id));
            const add = temps.filter((r) => !have.has(r.id));
            return add.length ? { ...c, replies: [...(c.replies ?? []), ...add] } : c;
          })
        : list;
      return { ...prev, [postId]: pendingRoots.length > 0 ? [...merged, ...pendingRoots] : merged };
    });
  }, []);

  const addImportedAlbum = (data: {
    countryName: string; countryFlag: string; country: string;
    date: string; startDate: string; endDate: string;
    title: string; medias: string[];
    representativePhoto?: string;
    albumSections?: { id: string; title: string; count: number }[]; // 날짜별 자동 섹션 등
    mediaAssetIds?: Record<string, string>;
    mediaTimes?: Record<string, number>;
  }): TravelRecord => {
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
      // 다른 기록 작성 경로와 동일한 기본 공개범위 — private이면 이웃 프로필·피드에서
      // 과거 여행이 전혀 안 보여 "기록이 있는데 안 보인다"는 혼란을 낳았다.
      visibility: 'neighbors',
      timestamp: Date.now(),
      viewType: 'album',
      medias: data.medias,
      representativePhoto: data.representativePhoto,
      albumSections: data.albumSections,
      mediaAssetIds: data.mediaAssetIds,
      mediaTimes: data.mediaTimes,
    };
    setRecords((prev) => [rec, ...prev]);
    publishToBackend(rec); // 가져온 앨범도 백엔드 발행 (기본 friends — 팔로워에게 보임)
    return rec; // 저장 직후 상세로 이동할 수 있게 생성된 기록을 그대로 반환
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
      // 대표(target) 카드 기준으로 합친다 — 대표 기록 뒤에 소스 기록을 이어붙인다.
      // 다국가 분할 카드는 같은 기록을 공유할 수 있어 중복 제거하며 이어붙인다.
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
    setNeighbors(INITIAL_NEIGHBORS);
    setCommentsByPost(INITIAL_COMMENTS);
    setReportedPostIds([]);
    setMutedHandles([]);
    setCurrentViewer(null);
    setFeedPosts([]);
    // 계정 경계 잔존물 정리 — 이전 계정의 세션·열람 이력·요청이 새 계정 저장본/서버 행으로 이월되지 않게
    setTripSession(null);
    setViewedSnapIds([]);
    setOutgoingNeighborRequests([]);
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

  // 이웃 목록을 백엔드 기준으로 동기화
  // 서버가 연속으로 빈 이웃 목록을 준 횟수 — refreshNeighbors의 일시 빈 응답 필터용
  const emptyNeighborStreakRef = useRef(0);
  const refreshNeighbors = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    // 내가 보낸 대기 신청도 함께 갱신 (오류 시 null → 로컬 유지)
    fetchMyOutgoingNeighborRequests().then((pending) => {
      if (pending) setOutgoingNeighborRequests(pending);
    });
    const list = await fetchNeighbors();
    if (!list) return; // 오류 시 로컬 유지
    setNeighbors((prev) => {
      // 토큰 갱신 직후 RLS가 순간적으로 빈 목록을 줄 수 있다 — 첫 빈 응답은 유지,
      // 연속 2회 빈 응답이면 실제 전체 이웃 해제로 보고 수용(유령 이웃 잔존 방지).
      if (list.length === 0 && prev.length > 0) {
        emptyNeighborStreakRef.current += 1;
        if (emptyNeighborStreakRef.current < 2) return prev;
      } else {
        emptyNeighborStreakRef.current = 0;
      }
      const byId = new Map(prev.map((f) => [f.id, f]));
      return list.map((p) => {
        const ex = byId.get(p.id);
        return {
          id: p.id,
          username: p.handle || p.id,
          emoji: p.emoji ?? ex?.emoji ?? undefined,
          photo: p.photo ?? ex?.photo ?? undefined,
          isAbroad: ex?.isAbroad ?? false,
          currentCountry: ex?.currentCountry ?? null,
          currentCountryFlag: ex?.currentCountryFlag ?? null,
          followedAt: ex?.followedAt ?? 0,
          isMutual: true, // 서로이웃은 모두 대칭
        };
      });
    });
  }, []);

  // 앱 시작/복원 후 피드·이웃 1회 로드
  useEffect(() => {
    if (hydrated) {
      refreshFeed();
      refreshNeighbors();
    }
  }, [hydrated, refreshFeed, refreshNeighbors]);

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
          stay: g.stay,
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
              : backup.groups.map((g) => ({ ...g, createdAt: new Date(g.createdAt) } as TripGroup))
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
    <RecordContext.Provider value={{ records, addRecord, updateRecord, deleteRecord, toggleLike, markSnapViewed, viewedSnapIds, archivedIds, archiveRecord, unarchiveRecord, blockedUsers, blockUser, unblockUser, isBlocked, reportedPostIds, reportPost, mutedHandles, toggleMute, isMuted, neighbors, requestNeighbor, cancelNeighborRequest, acceptNeighbor, declineNeighbor, removeNeighbor, outgoingNeighborRequests, isNeighbor, isNeighborRequested, refreshNeighbors, commentsByPost, addComment, toggleCommentLike, deleteComment, tripGroups, addTripGroup, deleteTripGroup, updateTripGroup, mergeTripGroups, activeStayGroup, startStay, endStay, stayPromptCountry, setStayPromptCountry, drafts, saveDraft, updateDraft, deleteDraft, publishDraft, addImportedAlbum, resetRecords, currentViewer, setCurrentViewer, feedPosts, refreshFeed, refreshComments, hydrateMyRecords, rearmTripRestore, exportLocalStateBackup, applyLocalStateBackup, rebackupAlbumOriginals }}>
      {children}
    </RecordContext.Provider>
  );
}

export function useRecords() {
  const ctx = useContext(RecordContext);
  if (!ctx) throw new Error('useRecords must be used within RecordProvider');
  return ctx;
}
