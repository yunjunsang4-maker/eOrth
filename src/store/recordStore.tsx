import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, View } from 'react-native';
import { isOnline, onReconnect } from '../utils/connectivity';
import { findWronglyImportedKpRecords } from '../utils/kpImportCleanup';
import type { BlogBlock, BlogCategory } from '../types/blogBlocks';
import { useSettings } from './settingsStore';
import { usePersistence, STORE_KEYS, saveEnvelope, loadEnvelope } from './persist';
import { isSupabaseConfigured } from '../services/supabase';
import { emitToast } from './toastStore';
import i18n from '../i18n';
import { publishPost, updatePost, deletePost, fetchFeed, fetchFeedSnaps, fetchMyPosts, fetchMyPostIds, fetchPostsByIds, fetchPostStatsFor, type PublishMediaOptions, type FeedCursor } from '../services/posts';
import { mergeServerPostCounts } from '../utils/postCountSync';
import { mergeMyRecords, classifyServerPosts, mergeServerUpdate } from '../utils/mergeMyRecords';
import { getProfileByHandle, getMyUserId } from '../services/profile';
import { COUNTRIES } from '../constants/countries';
import { normalizeHomeRegion } from '../constants/homeRegions';
import { koAliases, matchesCountry } from '../utils/countryMatch';
import { parseDotDate } from '../utils/momentMatch';
import {
  saveTripState,
  fetchTripState,
  serializeTripCard,
  tripCardJson,
  probeTripCards,
  fetchTripCards,
  upsertTripCards,
  tombstoneTripCards,
  type TripCardPayload,
  type ServerTripCardRef,
} from '../services/tripState';
import { classifyServerCards, mergeServerCard, toLocalTripCard } from '../utils/mergeTripCards';
import {
  probeStateFlags,
  fetchStateFlags,
  upsertStateFlags,
  tombstoneStateFlags,
} from '../services/appState';
import {
  classifyServerFlags,
  diffForPush,
  emptyFlagState,
  flagMapKey,
  blockedFlagKey,
  blockedFlagSig,
  blockedFlagData,
  mergeViewedSnap,
  type LocalFlagState,
  type StateFlagKind,
} from '../utils/mergeStateFlags';
import { subscribeSyncSignals, SYNC_SIGNAL_DEBOUNCE_MS } from '../services/syncRealtime';
import { removeMediaUrls } from '../services/media';
import { persistRecordPhotos } from '../utils/persistRecordPhotos';
import { remapDocUri, remapRecordDocUris } from '../utils/remapDocumentUris';
import type { PhotoFrame } from '../utils/photoFrame';
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
  fetchMyIncomingNeighborRequestIds,
  blockUser as apiBlock,
  unblockUser as apiUnblock,
  reportPostToServer as apiReportPost,
  likePost,
  unlikePost,
  fetchMyLikesFor,
  fetchComments,
  addComment as apiAddComment,
  likeComment as apiLikeComment,
  unlikeComment as apiUnlikeComment,
  deleteComment as apiDeleteComment,
} from '../services/social';
import { REGION_KEY_SCHEMA, migrateRegionNameEn } from '../utils/regionKeyMigration';
import { ISO2_TO_GEO } from '../constants/homeRegions'; // Task 1에서 export로 바꿔둔 것

/** 한글 국가명 → ISO3 (지역 키 마이그레이션용). term 첫 토큰이 ISO2다: 'jp 일본 japan' */
const KO_TO_ISO3: Record<string, string> = Object.fromEntries(
  COUNTRIES.map((c) => {
    const iso2 = String(c.term).split(/\s+/)[0].toUpperCase();
    return [c.name, ISO2_TO_GEO[iso2] ?? ''];
  }).filter(([, iso3]) => iso3),
);

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
  // 이 로컬 사본이 마지막으로 맞춰둔 서버 posts.updated_at(ms) — 기기 간 '수정 전파'의 기준선.
  // 서버 값이 이보다 크면 다른 기기가 고친 것이므로 본문을 다시 받아 병합한다
  // (utils/mergeMyRecords의 classifyServerPosts·mergeServerUpdate).
  // 없으면 "기준선 없음"이고 stale로 치지 않는다 — 치면 첫 동기화에서 전 기록 본문을 다시 받는다.
  // 로컬이 서버에 쓴 직후(발행·수정)에도 서버가 돌려준 값을 여기에 심는다.
  serverUpdatedAt?: number;
  visibility: Visibility;
  timestamp: number;
  // v2 새 필드
  memo?: string;
  rating?: number;
  companions?: string[];
  companionFriends?: string[];
  medias?: string[];
  // 사진별 글 — medias와 index가 짝인 병렬 배열(빈 글은 ''). 피드 한 화면 개편(2026-07-19)부터 사용.
  // 사진 추가·삭제·재정렬 시 반드시 medias와 함께 조작할 것. 옛 기록엔 없음(단일 memo 렌더 유지).
  photoTexts?: string[];
  // 피드 사진 프레임(2026-09-06) — 게시물 단위. 없거나 ratio가 'original'이면 기존 렌더(비율대로).
  // fill은 원본이 아닌 비율일 때만 쓰인다(비율·색 목록은 utils/photoFrame). 사진 추가·삭제·재정렬과 무관.
  photoFrame?: PhotoFrame;
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
  // 목록용 축소본 매핑: 업로드된 원본 URL → 축소본(640px) URL.
  // 발행 시 services/posts.ts 가 채우고, 목록 렌더러는 utils/thumbUrl.thumbOf 로 골라 쓴다.
  // 없으면(옛 글·아직 발행 전 로컬 기록) 원본이 그대로 쓰이므로 하위 호환은 자동이다.
  thumbs?: Record<string, string>;
  budget?: { amount: number; currency: string };
  weather?: string;
  flightType?: string;
  keywords?: string[];
  startDate?: string;
  endDate?: string;
  viewType?: RecordViewType;  // 뷰 형식 (기본값 'feed')
  // 과거 여행 불러오기가 카드만 세우려고 만든 '표지 전용' 기록.
  // viewType은 'album'을 그대로 쓴다 — 피드 타임라인 제외(services/posts TIMELINE_VIEW_TYPES),
  // 중복 가져오기 판정, '지난 불러오기 이후' 기본값 판정이 전부 그 값에 걸려 있어서다.
  // 다만 사용자에게는 사진첩이 아니다(썸네일 1장뿐). 그래서 여행 상세의 형식 목록과
  // 프로필 카드의 형식 배지에서 이 기록만 빼, 만들지도 않은 사진첩이 생긴 것처럼 보이지 않게 한다.
  // 나중에 이 카드로 진짜 사진첩을 만들면 그 기록에 사진이 이어 담기며 이 표시가 해제된다.
  isImportCover?: boolean;
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
  isExample?: boolean;                // eOrth 공식 예시 콘텐츠 — 상호작용 비활성·공식 배지·프로필 이동 차단
}

export interface CountryCover { recordId: string; uri: string }

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
  // 이 로컬 사본이 마지막으로 맞춰둔 서버 `user_trip_cards.updated_at`(ms) — 카드 '수정 전파'의 기준선.
  // 서버 값이 이보다 크면 다른 기기가 고친 것이므로 본문을 받아 병합한다(utils/mergeTripCards).
  // 없으면 "기준선 없음"이고 stale로 치지 않는다 — 치면 첫 동기화에서 전 카드를 다시 받는다.
  // 로컬이 서버에 쓴 직후(upsert)에도 서버가 돌려준 값을 여기에 심는다(에코 방지).
  // ⚠️ 이 값은 **로컬 전용**이다. 서버 payload(serializeTripCard)에는 싣지 않는다.
  serverUpdatedAt?: number;
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
  isMutual?: boolean; // 맞팔(서로 팔로우) 여부 — '메이트 수' 배지(78·81·82·83) 판정용
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

// 게시물 총 댓글 수(최상위 + 답글) — record.comments(표시용 숫자)를 commentsByPost와 동기화할 때 사용.
// export하는 이유: 피드 카드(SocialScreen)도 같은 규칙으로 세야 한다. 화면에서 `list.length`로
// 재현하면 답글이 빠져 상세 화면과 숫자가 어긋난다(실제로 그랬다).
export const countTotalComments = (list?: PostComment[]) =>
  (list ?? []).reduce((n, c) => n + 1 + (c.replies?.length ?? 0), 0);

// 네트워크 요청 타임아웃 래퍼 — 연결이 끊기지 않고 'hang'하면 스피너가 무한 대기하는 것을 방지
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

/**
 * 부가상태 집합 6종 → `user_state_flags`의 **서버 키 공간**으로 옮겨 담는다.
 * (판정·diff는 utils/mergeStateFlags가 하고, 여기서는 키 변환만 한다.)
 *
 * ⚠️ `archived`만 로컬 기록 id → **remoteId**로 바꾼다. 카드(`serializeTripCard`)와 같은 이유다 —
 *    기기마다 로컬 id가 다르므로 로컬 id로 올리면 상대 기기에서 아무 기록과도 안 맞는다.
 *    아직 발행 전이라 remoteId가 없으면 **로컬 id 그대로** 올린다(그 항목은 이 기기 전용이며,
 *    발행되면 다음 diff에서 키가 remoteId로 바뀐다 — 옛 키에는 표식이 찍혀 정리된다).
 *
 * ⚠️ `reportedPost`·`reportedComment`는 **변환하지 않는다.** 신고는 거의 전부 피드 글/서버 댓글에
 *    대해 일어나고 그 id는 이미 remoteId다. 화면(`SocialScreen`·`PostDetailScreen`)이
 *    `reportedPostIds.includes(r.id)`로 **로컬 목록의 id 그대로** 비교하므로, 여기서 변환하면
 *    오히려 숨김이 풀린다.
 */
function buildLocalFlagState(
  s: {
    archivedIds: string[]; blockedUsers: BlockedUser[]; mutedHandles: string[];
    viewedSnapIds: string[]; reportedPostIds: string[]; reportedCommentIds: string[];
  },
  toRemote: (localId: string) => string,
): LocalFlagState {
  const st = emptyFlagState();
  st.archived = s.archivedIds.map((id) => ({ key: toRemote(id) }));
  st.muted = s.mutedHandles.map((h) => ({ key: h }));
  // blocked만 지문(sig)을 갖는다 — 표시용 메타(name·emoji·id)가 바뀌면 다시 올려야 한다.
  // 신원 키가 비는 항목(이름도 handle도 없는 손상 데이터)은 아예 올리지 않는다.
  st.blocked = s.blockedUsers
    .map((b) => ({ key: blockedFlagKey(b), sig: blockedFlagSig(b) }))
    .filter((x) => !!x.key);
  st.viewedSnap = s.viewedSnapIds.map((k) => ({ key: k }));
  st.reportedPost = s.reportedPostIds.map((k) => ({ key: k }));
  st.reportedComment = s.reportedCommentIds.map((k) => ({ key: k }));
  return st;
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
  reportedCommentIds: string[];
  reportComment: (postId: string, commentId: string, reason?: string) => void;
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
  // 내가 보낸 대기 중 메이트신청의 대상 id (서버 상태, 비영속)
  outgoingNeighborRequests: string[];
  // 나에게 온 대기 중 메이트신청의 신청자 id (서버 상태, 비영속)
  incomingNeighborRequests: string[];
  isNeighbor: (id: string) => boolean;
  isNeighborRequested: (targetId: string) => boolean;
  isNeighborRequestReceived: (requesterId: string) => boolean;
  refreshNeighbors: () => Promise<void>;
  commentsByPost: Record<string, PostComment[]>;
  // remoteIdOverride: 스토어에 없는 글(타인 프로필 폴백)도 댓글이 서버에 저장되게 하는 보조 키
  addComment: (postId: string, text: string, replyToId?: string, remoteIdOverride?: string) => void;
  toggleCommentLike: (postId: string, commentId: string) => void;
  deleteComment: (postId: string, commentId: string) => void;
  tripGroups: TripGroup[];
  // session: 다국가 분할 저장 카드용 — 기록 기간(실시간 여부 판단)을 넘기면 해외 카드를
  // 여행 세션에 등록해, 이후 그 국가의 실시간 기록(스냅 등)이 이 카드에 합류한다
  // 반환: 생성된 카드 — 만든 직후 그 카드에 무언가를 매달아야 하는 호출부(과거 여행
  // 불러오기가 여행별 사진 후보를 카드 id로 보관한다)를 위해 돌려준다. 무시해도 무방.
  addTripGroup: (group: Omit<TripGroup, 'id' | 'createdAt'>, opts?: { session?: { startDate?: string; endDate?: string; date?: string } }) => TripGroup;
  deleteTripGroup: (id: string) => void;
  updateTripGroup: (id: string, changes: Partial<Omit<TripGroup, 'id' | 'createdAt'>>) => void;
  mergeTripGroups: (targetId: string, sourceIds: string[]) => void;
  // 장기체류
  activeStayGroup: TripGroup | null;
  startStay: (countryName: string, type: StayType) => void;
  endStay: (groupId: string) => void;
  absorbIntoStay: (recordId: string, recDate?: string) => void;
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
    isImportCover?: boolean; // 표지 전용(사진첩으로 보이지 않게) — TravelRecord 주석 참조
  }) => TravelRecord; // 생성된 record 반환 (저장 직후 상세 이동용)
  countryCovers: Record<string, CountryCover>;
  getCountryPhoto: (countryName: string) => string | null;
  getCountryPhotoRecord: (countryName: string) => CountryCover | null;
  setCountryCover: (countryName: string, recordId: string, uri: string) => void;
  resetRecords: () => void; // 모든 데이터를 첫 실행 상태(시드)로 되돌림
  // 소셜 미리보기 뷰어 — null=작성자/전체공개 시점. 비영구(저장 안 함).
  currentViewer: string | null;
  setCurrentViewer: (name: string | null) => void;
  // 백엔드 피드(남들의 공개/메이트 글). Supabase 미설정 시 항상 빈 배열.
  feedPosts: TravelRecord[];
  refreshFeed: () => Promise<void>;
  // 다음 페이지 이어받기 (무한 스크롤). 더 없거나 이미 로딩 중이면 무동작.
  loadMoreFeed: () => Promise<void>;
  feedHasMore: boolean;
  feedLoadingMore: boolean;
  /** 첫 피드가 아직 안 왔다 — 이때 '피드가 비었어요' 화면을 그리면 거짓말이 된다 */
  feedInitialLoading: boolean;
  refreshComments: (postId: string, remoteId?: string) => Promise<void>;
  // 내 글의 좋아요·댓글 수를 서버 기준으로 갱신(남이 남긴 반응 반영). 실패 시 로컬 값 유지.
  refreshMyPostCounts: () => Promise<void>;
  // 게시물 1건만 갱신 — 상세 진입용(내 글·피드 글 모두).
  refreshPostCounts: (postId: string) => Promise<void>;
  // 내 기록을 서버에서 로컬로 복원(계정 전환 후 pull). remoteId 기준 병합이라 로컬 초안은 보존된다.
  hydrateMyRecords: () => Promise<void>;
  // 기기 간 내 글 동기화 — 다른 기기(아이폰↔안드로이드)에서 쓴 내 글을 끌어와 병합하고
  // 날짜 규칙으로 여행 카드에 편입한다. 조용한 동기화(토스트·문구 없음), 실패는 무시.
  // 서버 id 프로브 1회 → 빠진 글만 본문 조회. 반환값은 호출부의 재시도 창 판단용.
  syncMyRecords: () => Promise<'ok' | 'skipped' | 'failed'>;
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
  reportedCommentIds?: string[];
  mutedHandles?: string[];
  viewedSnapIds?: string[];
  // 해외 여행 세션 — 출국~귀국 사이 유지. 과거 저장본엔 없거나(미도입)
  // 구형(국가명→카드 id 맵만)일 수 있어 복원 시 정규화한다
  tripSessionGroups?: TripSession | Record<string, string> | null;
  // 국가별 대표사진 핀 — 나중에 추가됨, 과거 저장본엔 없을 수 있음
  countryCovers?: Record<string, CountryCover>;
  // 지역 저장 키 스키마 (GADM 표기 → NE 코드). settingsStore와 독립적으로 관리한다.
  regionKeySchema?: number;
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
  const [regionKeySchema, setRegionKeySchema] = useState(0);
  const [archivedIds, setArchivedIds] = useState<string[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [tripGroups, setTripGroups] = useState<TripGroup[]>([]);
  const [countryCovers, setCountryCovers] = useState<Record<string, CountryCover>>({});
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
  // 내가 보낸 대기 중 메이트신청 대상 id — 서버가 원본, 세션 내 공유용(비영속)
  const [outgoingNeighborRequests, setOutgoingNeighborRequests] = useState<string[]>([]);
  // 나에게 온 대기 중 메이트신청 신청자 id — 서버가 원본, 세션 내 공유용(비영속)
  const [incomingNeighborRequests, setIncomingNeighborRequests] = useState<string[]>([]);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, PostComment[]>>(INITIAL_COMMENTS);
  const [reportedPostIds, setReportedPostIds] = useState<string[]>([]);
  const [reportedCommentIds, setReportedCommentIds] = useState<string[]>([]);
  // 내가 본 타인 스냅(remoteId) — feedPosts는 재조회 시 초기화되므로 '안 본 링' 상태를 영속 유지
  const [viewedSnapIds, setViewedSnapIds] = useState<string[]>([]);
  const [mutedHandles, setMutedHandles] = useState<string[]>([]);
  const [currentViewer, setCurrentViewer] = useState<string | null>(null);
  const [feedPosts, setFeedPosts] = useState<TravelRecord[]>([]);
  // 피드 캐시 복원 race 가드 — 서버 refreshFeed가 먼저 성공했으면 캐시(구본)로 덮어쓰지 않는다
  const feedFreshRef = useRef(false);
  // 커서 페이지네이션 상태 — 커서는 렌더에 쓰이지 않으므로 ref로 둔다(리렌더 불필요).
  const feedCursorRef = useRef<FeedCursor | null>(null);
  const feedLoadingMoreRef = useRef(false); // 스크롤 연타가 같은 페이지를 두 번 받지 않게
  const [feedHasMore, setFeedHasMore] = useState(false);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  // 피드 '첫 로딩' — 캐시 복원이나 첫 refreshFeed 중 먼저 끝나는 쪽에서 내려간다.
  // 이 플래그가 없던 동안에는 앱을 열 때마다 feedPosts가 빈 배열인 순간이 있어,
  // 이웃 글이 많은 사용자에게도 "피드가 비었어요" 예시 화면이 번쩍인 뒤 진짜 피드로 바뀌었다.
  const [feedInitialLoading, setFeedInitialLoading] = useState(true);
  // 새 해외국 감지 → "여행/장기체류" 프롬프트 요청 (UI가 소비). null이면 없음
  const [stayPromptCountry, setStayPromptCountry] = useState<string | null>(null);

  // 피드 캐시 복원 (마운트 1회) — 오프라인 재시작 시 마지막 피드를 즉시 표시.
  // 온라인이면 곧이어 refreshFeed가 최신으로 교체한다(캐시 선표시 → 체감 로딩 개선).
  useEffect(() => {
    (async () => {
      const cached = await loadEnvelope<TravelRecord[]>(STORE_KEYS.feedCache);
      if (!cached || !Array.isArray(cached) || cached.length === 0) return;
      if (feedFreshRef.current) return; // 서버 피드가 이미 도착 — 구본으로 덮지 않음
      setFeedPosts((prev) => (prev.length > 0 ? prev : cached));
      // 보여줄 게 생겼으므로 '첫 로딩'을 내린다. 캐시가 비었을 때는 내리지 않는다 —
      // 그래야 서버 응답 전까지 '피드가 비었어요' 예시 화면이 뜨지 않는다(refreshFeed가 내린다).
      setFeedInitialLoading(false);
    })();
  }, []);

  const hydrated = usePersistence<RecordPersistPayload>(
    STORE_KEYS.records,
    (p) => {
      // 모든 필드에 배열/폴백 가드 — 한 필드라도 throw하면 부분 복원 상태가
      // hydrated=true 이후 디바운스 저장으로 원본을 덮어써 영구 데이터 파괴가 된다.
      // 공개범위 2값(private | neighbors) 전환 보정: 과거 저장본의 'public'/'friends'는
      // 더 이상 유효하지 않으므로 모두 'neighbors'로 승격한다. ('private'은 그대로 유지)
      const baseRecords = (Array.isArray(p.records) ? p.records : []).map((r) => {
        // 과거 저장본의 legacy 값('public'/'friends')은 현재 Visibility 타입에 없어
        // 비교가 안 되므로 문자열로 확인한다(런타임엔 존재).
        const legacy = r.visibility as string;
        const vis = legacy === 'public' || legacy === 'friends'
          ? { ...r, visibility: 'neighbors' as const }
          : r;
        // iOS 재설치/재빌드로 컨테이너 경로(UUID)가 바뀐 사진 URI 복구 —
        // 파일은 새 컨테이너의 Documents로 이관돼 있으므로 경로만 재조립하면 다시 뜬다
        return remapRecordDocUris(vis);
      });

      // 지역 키 마이그레이션 — regionName(한글)은 건드리지 않는다.
      // 이 값은 서버로 동기화되지 않는 로컬 전용 필드다.
      // 26개국 밖이거나 미매칭이면 원본이 그대로 유지된다(보존 정책).
      // settingsStore와 같은 방어: 변환이 throw하면 원본을 그대로 두고 스키마도 올리지 않는다
      // (다음 실행에서 재시도). 부분 적용 상태가 디바운스 저장으로 원본을 덮는 것을 막는다.
      const needRegionMigrate = (p.regionKeySchema ?? 0) < REGION_KEY_SCHEMA;
      let nextRecords = baseRecords;
      let nextRegionSchema = p.regionKeySchema ?? 0;
      if (needRegionMigrate) {
        try {
          nextRecords = baseRecords.map((r) => {
            const iso3 = KO_TO_ISO3[r.countryName];
            // 영속 JSON에는 타입 보장이 없다 — 문자열이 아니면 손대지 않는다
            // (숫자 등이 들어오면 normRegion의 normalize에서 throw해 hydrate 전체가 죽는다)
            if (!iso3 || typeof r.regionNameEn !== 'string' || !r.regionNameEn) return r;
            // 한국 국내 기록은 저장 어휘가 GADM이 아니라 koreaRegions 프리셋('Seoul' 등)이고,
            // 그 어휘가 지역 칩·그룹핑의 규약이다 — 코드로 바꾸지 않는다.
            // (지도 매칭은 MainScreen이 렌더 시 resolveRegionCode로 해석한다)
            if (iso3 === 'KOR') return r;
            return { ...r, regionNameEn: migrateRegionNameEn(iso3, r.regionNameEn) };
          });
          nextRegionSchema = REGION_KEY_SCHEMA;
        } catch (e) {
          console.warn('[regionKey] 기록 마이그레이션 실패 — 원본 유지', e);
          nextRecords = baseRecords;
          nextRegionSchema = p.regionKeySchema ?? 0;
        }
      }
      setRecords(nextRecords);
      setRegionKeySchema(nextRegionSchema);
      setArchivedIds(Array.isArray(p.archivedIds) ? p.archivedIds : []);
      setBlockedUsers(Array.isArray(p.blockedUsers) ? p.blockedUsers : []);
      setTripGroups(
        Array.isArray(p.tripGroups)
          ? p.tripGroups.map((g) => ({ ...g, createdAt: new Date(g.createdAt), coverUri: remapDocUri(g.coverUri) }))
          : []
      );
      setDrafts(Array.isArray(p.drafts) ? p.drafts.map((d) => remapRecordDocUris(d)) : []);
      setNeighbors(
        Array.isArray(p.neighbors)
          ? p.neighbors
          : (Array.isArray((p as any).followingUsers) ? (p as any).followingUsers : INITIAL_NEIGHBORS)
      );
      setCommentsByPost(p.commentsByPost ?? INITIAL_COMMENTS);
      setReportedPostIds(p.reportedPostIds ?? []);
      setReportedCommentIds(p.reportedCommentIds ?? []);
      setMutedHandles(p.mutedHandles ?? []);
      setViewedSnapIds(Array.isArray(p.viewedSnapIds) ? p.viewedSnapIds : []);
      if (p.countryCovers && typeof p.countryCovers === 'object' && !Array.isArray(p.countryCovers)) {
        // 지구본 대표사진도 documentDirectory 절대경로 — 컨테이너 변경분 복구
        const covers = p.countryCovers as Record<string, CountryCover>;
        setCountryCovers(
          Object.fromEntries(Object.entries(covers).map(([k, v]) => [k, { ...v, uri: remapDocUri(v.uri) }]))
        );
      }
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
    () => ({ records, archivedIds, blockedUsers, tripGroups, drafts, neighbors, commentsByPost, reportedPostIds, reportedCommentIds, mutedHandles, viewedSnapIds, tripSessionGroups: tripSession, countryCovers, regionKeySchema }),
    [records, archivedIds, blockedUsers, tripGroups, drafts, neighbors, commentsByPost, reportedPostIds, reportedCommentIds, mutedHandles, viewedSnapIds, tripSession, countryCovers, regionKeySchema],
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
  // 'YYYY.MM.DD' / 'YYYY-MM-DD' → epoch(ms).
  // new Date('YYYY-MM-DD')는 ISO 규칙상 'UTC 자정'이라 미주(UTC-)에서는 Date.now()(로컬)와
  // 비교할 때 하루가 밀려 세션·7일 근접 그룹핑이 어긋난다 → 로컬 자정 수동 파서를 쓴다.
  const parseRecDate = (s?: string): number | null => parseDotDate(s);
  // 거주국가 코드(예: KR) → 기록에 저장되는 국가명(예: 대한민국)
  const homeCountryName =
    COUNTRIES.find((c) => c.term.split(' ')[0].toUpperCase() === (homeCountryCode || '').toUpperCase())?.name ?? null;

  const makeTripGroup = (country: string, rec: TravelRecord, regionName?: string): TripGroup => ({
    id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    // 국내 지역 카드는 "제주 여행"처럼 지역명으로 (국가 단위와 구분)
    title: i18n.t('store.tripTitle', { name: regionName ?? country }),
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

  // linkByDate는 useCallback이 아니라 매 렌더 재생성되는 함수이고, 내부에서 클로저의
  // `records`와 `homeCountryName`을 읽는다. 안정 콜백(useCallback([]))인 syncMyRecords가
  // 직접 부르면 첫 렌더의 stale 버전이 박제되므로 ref를 경유한다
  // (같은 파일의 publishToBackendRef와 같은 패턴).
  const linkByDateRef = useRef(linkByDate);
  linkByDateRef.current = linkByDate;

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
            ? { ...g, records: [...g.records, rec.id], coverRecordId: g.coverRecordId || rec.id,
                stay: { ...g.stay!, lastActiveAt: Date.now(),
                  startedAt: (() => { const d = rec.startDate || rec.date; return d && d < g.stay!.startedAt ? d : g.stay!.startedAt; })() } }
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
      title: i18n.t('store.stayTitle', { name: countryName }),
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

  // import 흡수 등 — 체류 카드에 기록을 붙이고 시작일을 그 기록 날짜로 당긴다(백데이팅).
  // lastActiveAt은 건드리지 않는다(현재 체류 중이라 넛지는 now 기준 유지).
  const absorbIntoStay = (recordId: string, recDate?: string) => {
    const apply = (list: TripGroup[]) => list.map((g) => {
      if (!g.stay || g.stay.status === 'ended') return g;
      const records2 = g.records.includes(recordId) ? g.records : [...g.records, recordId];
      const started = (recDate && recDate < g.stay.startedAt) ? recDate : g.stay.startedAt;
      return { ...g, records: records2, coverRecordId: g.coverRecordId || recordId, stay: { ...g.stay, startedAt: started } };
    });
    setTripGroups(apply);
    tripGroupsRef.current = apply(tripGroupsRef.current);
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
    emitToast(i18n.t('store.syncFailed'));
  }, []);

  // 백엔드 발행: 사진 업로드 후 posts insert → 받은 remoteId를 로컬 레코드에 연결.
  // 임시저장/미래 예약글은 제외(발행 시점에 처리). 레코드별 1회만 시도(중복 발행 방지).
  const publishAttemptRef = useRef<Set<string>>(new Set());
  // 발행(업로드) 진행 중 삭제/수정 경합 대응 — remoteId 부착 전 삭제는 여기 기록해 완료 시점에 서버에서도 지운다.
  const pendingDeleteRef = useRef<Set<string>>(new Set());
  // 발행 진행 중 '사용자 수정'이 있었던 기록 — 완료 시점에 최신 내용으로 서버를 한 번 더 갱신한다.
  // (live !== rec 같은 객체 identity 비교는 persistRecordPhotos의 로컬 URI 교체까지 수정으로
  // 오탐해, 사진 있는 글 대부분이 발행 직후 전 장을 재업로드하고 첫 업로드본을 고아로 남겼다)
  const pendingEditRef = useRef<Set<string>>(new Set());
  // 발행(publishPost)이 날아가고 있는 건수 — 기기 간 동기화(syncMyRecords)의 경합 가드.
  // insert는 서버에 들어갔는데 로컬 레코드에 remoteId가 아직 안 붙은 순간, 동기화 프로브가
  // 그 id를 '빠진 글'로 오인해 같은 글을 한 벌 더 추가한다. 그 창을 이 카운터로 닫는다.
  const publishInFlightRef = useRef(0);
  const recordsLiveRef = useRef(records);
  recordsLiveRef.current = records;
  /**
   * 로컬이 서버에 쓴 직후, 서버가 돌려준 `updated_at`(ms)을 그 레코드의 기준선으로 심는다.
   * 이게 없으면 **내가 방금 고친 글**이 다음 프로브에서 "서버가 더 최신"으로 잡혀
   * 본문(data JSONB)을 매번 다시 받는다(이그레스 낭비 + 방금 쓴 내용이 서버본으로 되돌아 보임).
   * 값이 같으면 prev를 그대로 돌려 헛 리렌더를 만들지 않는다.
   */
  const stampServerUpdatedAt = (recordId: string, updatedAt: number) => {
    if (!(updatedAt > 0)) return;
    setRecords((prev) => {
      const hit = prev.find((r) => r.id === recordId);
      if (!hit || hit.serverUpdatedAt === updatedAt) return prev;
      return prev.map((r) => (r.id === recordId ? { ...r, serverUpdatedAt: updatedAt } : r));
    });
  };
  // 사진첩 발행/수정 공통 옵션 — 화질(비프리미엄=압축) + 업로드 캐시 + 캐시 병합 콜백
  const albumPublishOpts = (rec: TravelRecord): PublishMediaOptions | undefined => {
    if (rec.viewType !== 'album') return undefined;
    return {
      // (2026-07 수익구조 변경) 원본 백업은 프리미엄 혜택에서 빠졌다 — 전원 압축본.
      // rec.albumUploadQuality가 명시된 기존 기록은 그대로 존중한다.
      // 추후 앱내 재화로 해제할 때 이 자리에 조건을 다시 넣는다.
      albumQuality: rec.albumUploadQuality ?? 'compressed',
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
    publishInFlightRef.current += 1; // syncMyRecords 경합 가드 — 아래 두 갈래에서 반드시 내린다
    publishPost(rec, opts)
      .then((res) => {
        if (!res) return;
        const rid = res.id;
        // 업로드 중 삭제된 글 → 서버에 유령 게시물로 남지 않게 즉시 삭제
        const live = recordsLiveRef.current.find((r) => r.id === rec.id);
        if (pendingDeleteRef.current.has(rec.id) || !live) {
          pendingDeleteRef.current.delete(rec.id);
          pendingEditRef.current.delete(rec.id);
          deletePost(rid).catch(() => {});
          return;
        }
        // 사진첩은 이번 발행에 쓴 화질을 기록 — 프리미엄 원본 재백업 스윕의 대상 판정 기준
        const quality = opts?.albumQuality;
        setRecords((prev) =>
          prev.map((r) =>
            r.id === rec.id
              ? {
                  ...r,
                  remoteId: rid,
                  // 서버가 돌려준 updated_at을 기준선으로 심는다 — 없으면 방금 내가 올린 글이
                  // 다음 동기화마다 '서버가 더 최신'으로 오판돼 본문을 통째로 다시 받는다.
                  ...(res.updatedAt ? { serverUpdatedAt: res.updatedAt } : {}),
                  ...(quality ? { albumUploadQuality: quality } : {}),
                }
              : r
          )
        );
        // 업로드 중 '사용자 수정'된 글 → 캡처본(구버전)이 insert됐으므로 최신 내용으로 서버 갱신.
        // persistRecordPhotos의 로컬 URI 교체는 수정이 아니다(서버엔 이미 업로드본이 실림).
        if (pendingEditRef.current.has(rec.id)) {
          pendingEditRef.current.delete(rec.id);
          updatePost(rid, { ...live, remoteId: rid }, albumPublishOpts(live))
            .then((ms) => { if (ms && ms > 0) stampServerUpdatedAt(rec.id, ms); })
            .catch(notifySyncError);
        }
      })
      .catch(notifySyncError)
      // 성공·실패 어느 쪽이든 카운터를 내린다 — 여기서 새면 기기 간 동기화가 영영 막힌다.
      // (남은 잔여 창: setRecords는 다음 렌더에 커밋되므로 remoteId가 recordsLiveRef에
      //  반영되기 전 몇 ms가 있다. 그래서 syncMyRecords는 setRecords를 함수형으로 쓴다 —
      //  커밋 시점의 최신 prev와 다시 대조돼 중복이 걸러진다.)
      .finally(() => { publishInFlightRef.current = Math.max(0, publishInFlightRef.current - 1); });
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
      // 반환: 서버 updated_at(ms) | -1(성공·타임스탬프 불명) | null(실패)
      const ok = await updatePost(rec.remoteId!, rec, {
        albumQuality: 'original',
        uploadCache: {}, // 압축본 캐시 무시 — 원본으로 전부 새로 업로드
        onUploaded: (m) => { newMap = m; },
      }).catch(() => null);
      if (ok) {
        upgraded += 1;
        setRecords((prev) =>
          prev.map((r) =>
            r.id === rec.id
              ? {
                  ...r,
                  albumUploadQuality: 'original',
                  uploadedMediaUrls: newMap,
                  // 내가 방금 올린 갱신이므로 기준선도 함께 옮긴다(재수신 방지)
                  ...(ok > 0 ? { serverUpdatedAt: ok } : {}),
                }
              : r
          )
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

  /**
   * 여행 카드에서 레코드 id들을 떼어낸다 — '기록이 사라졌다/이 카드 소속이 아니게 됐다'를
   * 정리하는 공통 단계. `removeRecordsLocally`(삭제 전파)와 `updateRecord`(국가가 바뀐 수정),
   * 그리고 동기화의 수정 전파 재연결이 **같은 규칙을 공유**한다.
   *
   * ⚠️ **빈 카드 폐기는 이번에 손댄 카드에만 적용한다.** `.filter((g) => g.records.length > 0)`를
   *    배열 전체에 걸면 원래부터 멤버가 0인 카드까지 함께 사라진다 — 특히 `startStay`가
   *    `records: []`로 만드는 **진행 중 체류 카드**가 통째로 날아가 체류 상태 메타
   *    (거주국 통계·60일 넛지의 근거)가 유실된다. 삭제 전파는 다른 기기가 원격으로,
   *    알림도 없이 트리거하므로 사용자가 인지할 수도 없다.
   *    (같은 형태가 `deleteRecord`에도 남아 있지만 그쪽은 사용자가 방금 누른 행동이라 파급이
   *     다르고 이번 범위 밖이라 손대지 않았다.)
   *
   * 대표(coverRecordId) 승계 규칙은 `deleteRecord`와 문자 그대로 같다(`remaining[0] ?? ''`).
   * `updateRecord`의 옛 인라인 코드는 `?? g.coverRecordId` 폴백이었지만, 그 분기는 남은 멤버가
   * 0일 때만 갈리고 그 카드는 어차피 폐기되므로 동작이 같다.
   */
  const detachRecordsFromTripGroups = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const gone = new Set(ids);
    setTripGroups((prev) => {
      const touched = new Set<string>();
      for (const g of prev) if (g.records.some((rid) => gone.has(rid))) touched.add(g.id);
      if (touched.size === 0) return prev;
      return prev
        .map((g) => {
          if (!touched.has(g.id)) return g;
          const remaining = g.records.filter((rid) => !gone.has(rid));
          const coverRecordId = gone.has(g.coverRecordId) ? (remaining[0] ?? '') : g.coverRecordId;
          return { ...g, records: remaining, coverRecordId };
        })
        // 손댄 카드만 폐기 대상 — 무관한 빈 카드(진행 중 체류 등)는 그대로 둔다
        .filter((g) => !(touched.has(g.id) && g.records.length === 0));
    });
  }, []);

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
      // 떼어내기는 공용 헬퍼로 — 동기화의 수정 전파도 같은 규칙을 쓴다(규칙이 두 벌로 갈리면
      // 한쪽만 고쳐지는 사고가 난다). 다시 붙이는 쪽은 경로마다 달라 공유하지 않는다:
      // 여기는 사용자가 지금 앱에서 편집한 것이라 실시간 경로(linkRecordToTrip)가 맞고,
      // 동기화로 들어온 변경은 다른 기기의 과거 행위라 날짜 규칙(linkByDate)이어야 한다.
      detachRecordsFromTripGroups([id]);
      linkRecordToTrip(updated);
    }
    setCountryCovers((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [k, v] of Object.entries(prev)) {
        if (v.recordId === id) {
          const newUri = changes.representativePhoto;
          if (typeof newUri === 'string' && newUri && newUri !== v.uri) { next[k] = { recordId: id, uri: newUri }; changed = true; }
        }
      }
      return changed ? next : prev;
    });
    if (isSupabaseConfigured) {
      // 수정으로 더 이상 참조되지 않는 업로드 파일 (Storage 고아 정리 대상)
      let orphans: string[] = [];
      if (cur && updated) {
        const keep = new Set(collectRemoteMediaUrls(updated));
        orphans = collectRemoteMediaUrls(cur).filter((u) => !keep.has(u));
      }
      if (cur?.remoteId) {
        // ⚠️ 삭제는 반드시 서버 갱신 '성공 후'에만 — 오프라인/실패인데 파일을 먼저 지우면
        //    서버 게시물이 죽은 URL을 계속 참조하고 사진은 영구 유실된다(복구 불가).
        //    실패 시 남는 파일은 고아로 두고(탈퇴 sweep 대상) 데이터 쪽을 지킨다.
        updatePost(cur.remoteId, { ...cur, ...changes }, albumPublishOpts({ ...cur, ...changes }))
          .then((ok) => {
            // ok: 서버 updated_at(ms) | -1(성공·타임스탬프 불명) | null(실패)
            if (!ok) return;
            // 내가 올린 수정이므로 기준선을 옮긴다 — 안 옮기면 다음 프로브가 이 글을
            // '다른 기기가 고친 글'로 오인해 본문을 도로 받아온다.
            if (ok > 0) stampServerUpdatedAt(id, ok);
            if (orphans.length > 0) removeMediaUrls(orphans).catch(() => {});
          })
          .catch(notifySyncError);
      } else if (cur && publishAttemptRef.current.has(id)) {
        // 발행(업로드) 진행 중 수정 — 완료 시점에 최신 내용으로 서버를 갱신하도록 예약.
        // 업로드가 진행 중인 파일을 여기서 지우면 방금 올라간 사진이 사라지므로 정리하지 않는다.
        pendingEditRef.current.add(id);
      } else if (orphans.length > 0) {
        // 서버 사본이 없는(로컬 전용) 기록 — 참조하는 게시물이 없으니 즉시 정리
        removeMediaUrls(orphans).catch(() => {});
      }
    }
  };

  const deleteRecord = (id: string) => {
    const target = records.find((r) => r.id === id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
    setArchivedIds((prev) => prev.filter((i) => i !== id));
    // 여행 묶음 정합성: 삭제된 기록 id를 그룹에서 제거하고, 멤버가 없어진 그룹은 폐기.
    // 대표(coverRecordId)가 삭제됐으면 남은 첫 기록으로 승계.
    // ⚠️ 옛 인라인 코드는 `.filter(g => g.records.length > 0)`를 **목록 전체**에 걸어, 기록 1건만
    //    지워도 `startStay`가 만든 멤버 0인 '진행 중 체류 카드'가 함께 사라졌다. 공용 헬퍼는
    //    이번에 손댄 카드만 폐기 대상으로 삼는다 — 세 경로(삭제·수정·동기화)를 같은 규칙으로 통일한다.
    detachRecordsFromTripGroups([id]);
    setCountryCovers((prev) => {
      if (!Object.values(prev).some((v) => v.recordId === id)) return prev;
      const next: Record<string, CountryCover> = {};
      for (const [k, v] of Object.entries(prev)) if (v.recordId !== id) next[k] = v;
      return next;
    });
    if (isSupabaseConfigured && target) {
      // 게시물이 참조하던 업로드 파일 (Storage 고아 정리 대상)
      const urls = collectRemoteMediaUrls(target);
      if (target.remoteId) {
        // ⚠️ 사진 삭제는 서버 게시물 삭제 '성공 후'에만 — 오프라인에서 먼저 지우면 서버에 남은
        //    게시물이 죽은 URL을 참조하고(타인 피드에 깨진 사진) 원본은 복구할 수 없다.
        deletePost(target.remoteId)
          .then((ok) => {
            if (ok && urls.length > 0) removeMediaUrls(urls).catch(() => {});
          })
          .catch(notifySyncError);
      } else if (publishAttemptRef.current.has(id)) {
        // remoteId 부착 전(발행 업로드 중) 삭제 — 완료 시점에 서버에서도 지우도록 예약.
        // 업로드 중인 파일을 지금 지우면 발행 완료본이 깨지므로 정리는 하지 않는다.
        pendingDeleteRef.current.add(id);
      } else if (urls.length > 0) {
        // 서버 사본이 없는(로컬 전용) 기록 — 참조하는 게시물이 없으니 즉시 정리
        removeMediaUrls(urls).catch(() => {});
      }
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
    // ⚠️ **사용자가 명시적으로 켠 항목**이라고 표시한다(아래 `noteExplicitFlagAdd` 주석).
    //    이게 없으면 "보관 → 해제 → 다시 보관"의 마지막 단계가 서버 표식을 못 이겨
    //    다음 pull에서 조용히 풀린다(2026-09-10 QA M1).
    //    push 키는 remoteId 우선이라 두 표기를 모두 남긴다 — 이 시점에 발행 전이면 로컬 id로,
    //    발행 뒤면 remoteId로 나가기 때문이다.
    noteExplicitFlagAdd('archived', id);
    const remoteId = recordsLiveRef.current.find((r) => r.id === id)?.remoteId;
    if (remoteId) noteExplicitFlagAdd('archived', remoteId);
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
  // 좋아요 서버 반영이 '진행 중'인 글의 로컬 id → 미착신 요청 수.
  // likeStateRef(최종 의도 상태)와 달리 요청이 끝나면 0으로 돌아온다 — 서버 카운트 병합
  // (refreshMyPostCounts)이 아직 서버에 닿지 않은 내 탭을 되돌려 하트가 깜빡이는 것을 막는 용도라
  // '지금 날아가는 중'만 표시해야 한다.
  const likePendingRef = useRef<Record<string, number>>({});
  // 그 글을 마지막으로 탭한 시각. pending만으로는 '조회가 나간 뒤 → 좋아요 요청이 끝난' 창을
  // 막지 못한다(그 순간 pending은 0이지만 서버 조회 결과는 탭 이전 값이라 카운트가 되돌아간다).
  const likeTapAtRef = useRef<Record<string, number>>({});
  const toggleLike = (id: string) => {
    const inRecords = records.find((r) => r.id === id);
    const inFeed = inRecords ? undefined : feedPosts.find((r) => r.id === id);
    const target = inRecords ?? inFeed;
    if (!target) return;
    const nowLiked = !(likeStateRef.current[id] ?? target.liked);
    likeStateRef.current[id] = nowLiked;
    likeTapAtRef.current[id] = Date.now(); // 진행 중인 서버 카운트 조회가 이 탭을 되돌리지 않게
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
      likePendingRef.current[id] = (likePendingRef.current[id] ?? 0) + 1;
      (nowLiked ? likePost(remoteId) : unlikePost(remoteId))
        .catch((e) => {
          // 서버 반영 실패 → 낙관 반영을 되돌린다 (안 되돌리면 다음 새로고침까지 서버와 어긋남)
          notifySyncError(e);
          likeStateRef.current[id] = !nowLiked;
          const revert = (r: TravelRecord): TravelRecord =>
            r.id !== id || r.liked !== nowLiked
              ? r
              : { ...r, liked: !nowLiked, likes: !nowLiked ? r.likes + 1 : Math.max(0, r.likes - 1) };
          if (inRecords) setRecords((prev) => prev.map(revert));
          else setFeedPosts((prev) => prev.map(revert));
        })
        .finally(() => {
          const n = (likePendingRef.current[id] ?? 1) - 1;
          if (n > 0) likePendingRef.current[id] = n;
          else delete likePendingRef.current[id];
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
    // add-only kind라 우리가 표식을 만들지는 않지만, **데이터 초기화(clearStateFlags)는 이 행에도
    // 표식을 찍는다.** 초기화 뒤 같은 스냅을 다시 보면 그건 명시적 재추가이므로 되살려야 한다.
    noteExplicitFlagAdd('viewedSnap', rid);
    setViewedSnapIds((ids) => (ids.includes(rid) ? ids : [...ids, rid].slice(-500)));
  };

  const blockUser = (user: { name: string; emoji: string; handle?: string; id?: string }) => {
    // ⚠️ **이 한 줄이 QA H1의 수정 지점이다.** 없으면 "차단 → 해제 → 재차단"에서 마지막 단계가
    //    서버 표식을 못 이겨, 다음 pull이 목록에서 그 사람을 빼 버린다. 그러면 서버 `blocks`는
    //    차단 중인데 앱 목록은 비어 **UI로 해제할 방법조차 사라지고**(unblockUser가 목록에서
    //    대상을 찾는다) 댓글·알림·DM의 클라이언트 필터가 전부 풀린다.
    noteExplicitFlagAdd('blocked', blockedFlagKey(user));
    setBlockedUsers((prev) => {
      // 신원은 handle(양쪽에 있으면) 우선, 없으면 표시이름으로 중복 판정
      const dup = prev.some((b) =>
        (b.handle && user.handle) ? b.handle === user.handle : b.name === user.name
      );
      if (dup) return prev;
      return [...prev, { ...user, blockedAt: Date.now() }];
    });
    // 차단하면 메이트에서도 제거 — 화면별 처리 불일치 방지 (메이트 아니면 no-op)
    // id 우선, 없으면 handle → 표시이름 순으로 매칭 (메이트 항목의 username은 handle과 동일 값)
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
    // 수정 5: 정확히 하나의 대상만 제거 — handle 일치 우선, 없으면 name 일치 첫 항목
    const target =
      blockedUsers.find((b) => b.handle && b.handle === nameOrHandle) ??
      blockedUsers.find((b) => b.name === nameOrHandle);
    if (!target) return;
    setBlockedUsers((prev) => {
      let removed = false;
      return prev.filter((b) => {
        if (!removed && b === target) { removed = true; return false; }
        return true;
      });
    });
    // 수정 1: id 없고 handle 있으면 getProfileByHandle로 uuid 조회 후 서버 해제
    if (isSupabaseConfigured) {
      if (target.id) {
        apiUnblock(target.id).catch(notifySyncError);
      } else if (target.handle) {
        getProfileByHandle(target.handle)
          .then((p) => {
            if (!p?.id) return;
            apiUnblock(p.id).catch(notifySyncError);
          })
          .catch(notifySyncError);
      }
    }
  };

  // 게시물/사용자가 차단 대상인지 — handle 기준. 이름 폴백은 '핸들이 없는 구버전 차단 항목'에만
  // 허용한다(핸들 있는 항목까지 이름을 보면 동명이인 사용자가 통째로 차단돼 보였다).
  const isBlocked = useCallback((user: { name?: string; handle?: string }) =>
    blockedUsers.some((b) =>
      b.handle
        ? (!!user.handle && b.handle === user.handle)
        : (!!user.name && b.name === user.name)
    ), [blockedUsers]);

  // 게시물 신고 → 신고 목록에 추가(피드에서 숨김) + 서버 reports에 접수(운영자 확인용).
  // 이미 신고했으면 무시.
  const reportPost = (id: string, reason?: string) => {
    if (reportedPostIds.includes(id)) return;
    noteExplicitFlagAdd('reportedPost', id); // add-only지만 초기화 표식은 넘어야 한다(markSnapViewed 주석 참조)
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

  // 댓글 신고 → 즉시 숨김(영속) + 서버 reports 접수.
  // App Store 1.2(UGC)는 불쾌한 콘텐츠를 신고하고 '즉시 사라지게' 하는 수단을 요구하는데,
  // 게시물에만 있고 댓글에는 없었다. 신고 대상 식별은 게시물 신고와 같은 reports 테이블에
  // post_id + reason(댓글 본문 일부 포함)으로 남긴다 — 운영자가 어느 댓글인지 찾을 수 있다.
  const reportComment = (postId: string, commentId: string, reason?: string) => {
    if (reportedCommentIds.includes(commentId)) return;
    noteExplicitFlagAdd('reportedComment', commentId);
    setReportedCommentIds((prev) => (prev.includes(commentId) ? prev : [...prev, commentId]));
    if (isSupabaseConfigured) {
      const target = records.find((r) => r.id === postId) ?? feedPosts.find((r) => r.id === postId);
      const remoteId = target?.remoteId ?? (feedPosts.some((r) => r.id === postId) ? postId : null);
      const body = (commentsByPost[postId] ?? []).find((c) => c.id === commentId)?.text ?? '';
      apiReportPost(remoteId, `[comment:${commentId}] ${reason ?? ''} ${body.slice(0, 200)}`.trim()).catch(() => {
        // 접수 실패는 조용히 무시 — 로컬 숨김은 이미 적용됨
      });
    }
  };

  // 사용자 알림 음소거 토글/조회 (handle 기준, 영속)
  const toggleMute = (handle: string) => {
    if (!handle) return;
    // 켜는 방향일 때만 '명시적 재추가'로 표시한다. 방향 판정은 **렌더 미러**로 한다 —
    // setState 업데이터 안에서 ref를 건드리면 StrictMode의 이중 호출에 두 번 기록된다
    // (여기서는 무해하지만 관습을 깨지 않는다). 미러가 한 틱 낡아도 결과는 "revive를 한 번
    // 더/덜 쓰는" 정도이며, 이미 살아 있는 행에 대한 revive는 no-op이다.
    if (!flagsLiveRef.current.mutedHandles.includes(handle)) noteExplicitFlagAdd('muted', handle);
    setMutedHandles((prev) => (prev.includes(handle) ? prev.filter((h) => h !== handle) : [...prev, handle]));
  };
  const isMuted = useCallback((handle: string) => mutedHandles.includes(handle), [mutedHandles]);

  // 신원은 id 기준 — 핸들(username)이 빈 유저끼리 오판 방지
  const sameNeighbor = (f: FollowedFriend, key: string) =>
    f.id === key || (!!f.username && f.username === key);

  // 메이트신청 — 낙관적으로 '신청됨'(대기) 목록에 추가. 수락 전까지 메이트 목록엔 넣지 않는다.
  // (상대도 나에게 신청해 둔 상태면 service가 자동 수락 → refreshNeighbors가 메이트으로 반영)
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

  // 받은 신청 수락 → 메이트이 됨(refreshNeighbors로 목록 반영)
  // '받은 신청' 목록에서도 낙관적으로 지운다 — 안 지우면 수락 후에도 프로필 버튼이
  // 잠시 '메이트 수락'으로 남는다(refreshNeighbors 왕복 동안).
  const acceptNeighbor = (requesterId: string) => {
    if (!requesterId) return;
    setIncomingNeighborRequests((prev) => prev.filter((id) => id !== requesterId));
    if (isSupabaseConfigured) {
      apiAcceptNeighbor(requesterId)
        .then(() => refreshNeighbors())
        .catch((e) => {
          setIncomingNeighborRequests((prev) => (prev.includes(requesterId) ? prev : [...prev, requesterId]));
          notifySyncError(e);
        });
    }
  };

  const declineNeighbor = (requesterId: string) => {
    if (!requesterId) return;
    setIncomingNeighborRequests((prev) => prev.filter((id) => id !== requesterId));
    if (isSupabaseConfigured) {
      apiDeclineNeighbor(requesterId).catch((e) => {
        setIncomingNeighborRequests((prev) => (prev.includes(requesterId) ? prev : [...prev, requesterId]));
        notifySyncError(e);
      });
    }
  };

  // 메이트 끊기 — 로컬 목록에서 제거 + 서버 accepted 관계 삭제
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

  // '신청됨' 판정 — 이미 메이트이면(수락됨) 신청 상태로 보지 않는다
  const isNeighborRequested = useCallback(
    (targetId: string) =>
      outgoingNeighborRequests.includes(targetId) && !neighbors.some((f) => f.id === targetId),
    [outgoingNeighborRequests, neighbors]
  );

  // '받은 신청' 판정 — 이미 메이트이면(수락됨) 대기 상태로 보지 않는다
  const isNeighborRequestReceived = useCallback(
    (requesterId: string) =>
      incomingNeighborRequests.includes(requesterId) && !neighbors.some((f) => f.id === requesterId),
    [incomingNeighborRequests, neighbors]
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
    commentLikeStateRef.current = {}; // 서버 진실 도착 — 이전 낙관 상태 기준 연타 가드 리셋
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
    isImportCover?: boolean;
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
      // 다른 기록 작성 경로와 동일한 기본 공개범위 — private이면 메이트 프로필·피드에서
      // 과거 여행이 전혀 안 보여 "기록이 있는데 안 보인다"는 혼란을 낳았다.
      visibility: 'neighbors',
      timestamp: Date.now(),
      viewType: 'album',
      medias: data.medias,
      representativePhoto: data.representativePhoto,
      albumSections: data.albumSections,
      mediaAssetIds: data.mediaAssetIds,
      mediaTimes: data.mediaTimes,
      isImportCover: data.isImportCover,
    };
    setRecords((prev) => [rec, ...prev]);
    publishToBackend(rec); // 가져온 앨범도 백엔드 발행 (기본 friends — 팔로워에게 보임)
    return rec; // 저장 직후 상세로 이동할 수 있게 생성된 기록을 그대로 반환
  };

  const addTripGroup = (
    data: Omit<TripGroup, 'id' | 'createdAt'>,
    opts?: { session?: { startDate?: string; endDate?: string; date?: string } }
  ): TripGroup => {
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
    return newGroup;
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
    setCountryCovers({});
    setDrafts([]);
    setNeighbors(INITIAL_NEIGHBORS);
    setCommentsByPost(INITIAL_COMMENTS);
    setReportedPostIds([]);
    setReportedCommentIds([]);
    setMutedHandles([]);
    setCurrentViewer(null);
    setFeedPosts([]);
    // 페이지네이션 상태도 함께 되감는다 — 이전 계정의 커서로 다음 페이지를 받으면
    // 새 계정 피드 중간부터 이어붙는다.
    feedCursorRef.current = null;
    feedLoadingMoreRef.current = false;
    setFeedHasMore(false);
    setFeedLoadingMore(false);
    // 계정 경계 잔존물 정리 — 이전 계정의 세션·열람 이력·요청이 새 계정 저장본/서버 행으로 이월되지 않게
    setTripSession(null);
    setViewedSnapIds([]);
    setOutgoingNeighborRequests([]);
    // 세션 한정 ref들도 초기화 — 이전 계정의 좋아요/발행 상태가 새 계정으로 이월되지 않게
    likeStateRef.current = {};
    commentLikeStateRef.current = {};
    publishAttemptRef.current.clear();
    pendingDeleteRef.current.clear();
    pendingEditRef.current.clear();
    // 카드 편입 대기 큐 — 남겨두면 이전 계정 기록 id가 새 계정에서 카드로 편입될 수 있다.
    // (지금은 tripBackupReadyRef 게이트와 records 조회 실패가 막지만, 그 방어는 이 큐를
    //  비우는 것과 달리 우회 가능한 간접 방어다 — 경계에서 직접 비운다.)
    pendingLinkRef.current.clear();
    pendingRelinkRef.current.clear(); // 재연결 대기분도 같은 이유로 비운다(이전 계정 id가 남으면 안 된다)
    // ⚠️ **이번 구현에서 가장 위험한 한 줄.** 카드 push의 tombstone 대상은
    //    "마지막으로 올린 목록에는 있는데 지금 tripGroups에는 없는 카드"다. 계정 전환은
    //    tripGroups를 통째로 비우므로, 이 맵을 안 비우면 **이전 계정의 카드 전체에
    //    tombstone을 쏜다(대량 오삭제, 조용하고 되돌릴 수 없다).**
    lastPushedRef.current.clear();
    lastLegacySavedRef.current = ''; // legacy 백업 중복 방지 서명도 계정 경계에서 비운다
    // ⚠️ 부가상태 집합(user_state_flags) 지문도 **같은 이유로 반드시** 비운다. 위 카드와 판박이다:
    //    계정 전환은 6개 집합을 통째로 비우므로(위 setArchivedIds([]) 등), 이 맵을 남겨두면
    //    다음 push diff가 "올린 적 있는데 지금 없다"로 읽어 **이전 계정의 보관·차단·음소거
    //    전체에 삭제 표식을 쏜다.** (add-only kind는 표식이 안 나가지만 removable 3종은 나간다.)
    lastFlagsPushedRef.current.clear();
    // 명시적 재추가 표시도 함께 비운다 — 이전 계정에서 켠 항목이 새 계정의 서버 행을
    // **되살리는(revive)** 데 쓰이면 안 된다. 데이터 초기화 경로에서도 같은 이유로 필요하다:
    // `clearStateFlags()`가 방금 찍은 표식을 대기 중이던 push가 되살리지 못하게 한다.
    explicitFlagAddsRef.current.clear();
    // 여행카드 서버 백업/복원 재무장: 새 계정의 백업을 빈 값으로 덮어쓰기 전에 복원부터 다시 시도한다
    tripBackupReadyRef.current = false;
    tripRestoreTriedRef.current = false;
    tripRestoreEpochRef.current += 1; // in-flight 복원 async 무효화 (감사 M1)
    setTripRestoreNonce((n) => n + 1);
  };

  // id 기준 중복 제거 — 커서가 lte라 페이지 경계에서 같은 글이 한 번 겹칠 수 있다(fetchFeed 주석).
  const dedupeById = (list: TravelRecord[]): TravelRecord[] => {
    const seen = new Set<string>();
    return list.filter((r) => {
      const k = r.remoteId ?? r.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  // 백엔드 피드 새로고침 — 첫 페이지 + 스토리 라인용 스냅. 커서를 처음으로 되감는다.
  //
  // 스냅을 따로 받는 이유: 스토리 라인은 '최근 스냅 전부'가 필요한데, 타임라인 페이지에
  // 섞어 받으면 20건 페이지 경계 밖의 스냅이 스토리에서 사라진다. 스냅은 사진 2장짜리라
  // 별도 조회 비용이 작다.
  const refreshFeed = useCallback(async () => {
    // 서버가 없으면 기다릴 것도 없다 — 로컬 기록만 보여주면 되므로 첫 로딩을 즉시 내린다
    if (!isSupabaseConfigured) { setFeedInitialLoading(false); return; }
    try {
      // 12초 타임아웃 — 응답이 끊기지 않고 지연되는 경우에도 로딩이 무한 대기하지 않게 한다.
      const [page, snaps] = await withTimeout(Promise.all([fetchFeed(null), fetchFeedSnaps()]), 12000);
      // 조회 실패(null)면 현재 피드도 캐시도 건드리지 않는다 — 빈 배열로 덮으면
      // 사용자에겐 '기록 없음'으로 보이고 오프라인용 캐시까지 지워진다.
      if (!page) {
        emitToast(i18n.t('store.feedLoadFailed'));
        return;
      }
      // 스냅 조회만 실패하면(null) 타임라인은 살리고 스토리만 이번 회차에 비운다 — 전체 실패로 취급하지 않는다.
      const merged = dedupeById([...page.posts, ...(snaps ?? [])]);
      // 좋아요는 '이번에 받은 글'에 대해서만 조회한다(내 전체 좋아요 목록을 받지 않는다)
      const likedSet = await withTimeout(fetchMyLikesFor(merged.map((p) => p.remoteId ?? p.id)), 12000);
      const fresh = merged.map((p) => ({ ...p, liked: likedSet.has(p.remoteId ?? p.id) }));
      feedFreshRef.current = true; // 이후 도착하는 캐시 복원이 구본으로 덮지 않게
      feedCursorRef.current = page.nextCursor;
      setFeedHasMore(page.hasMore);
      setFeedPosts(fresh);
      // 연타 가드 ref 리셋 — 서버 진실이 도착했으므로 이전 낙관 상태를 기준으로 쓰면
      // 다른 기기에서 바뀐 좋아요가 첫 탭에 반대로 동작한다
      likeStateRef.current = {};
      // 피드 캐시 영속화 — 오프라인 재시작 시 마지막 피드 표시용(최대 100개, 실패 무시)
      saveEnvelope(STORE_KEYS.feedCache, fresh.slice(0, 100));
    } catch {
      // 타임아웃 등 진짜 'hang'일 때만 도달(서비스는 일반 실패 시 빈 배열을 반환). 현재 피드는 유지.
      emitToast(i18n.t('store.feedLoadFailed'));
    } finally {
      // 성공이든 실패든 첫 시도가 끝나면 내린다 — 실패했다고 스켈레톤에 갇히면 안 된다
      setFeedInitialLoading(false);
    }
  }, []);

  // 다음 페이지 이어받기 — 실패하면 조용히 유지한다(사용자가 더 스크롤하면 다시 시도).
  // hasMore는 끄지 않는다: 일시적 네트워크 실패로 피드 끝을 영구히 닫아버리지 않기 위함.
  const loadMoreFeed = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    if (feedLoadingMoreRef.current) return;
    const cursor = feedCursorRef.current;
    if (!cursor) return; // 첫 페이지 미도착이거나 끝까지 받음
    feedLoadingMoreRef.current = true;
    setFeedLoadingMore(true);
    try {
      const page = await withTimeout(fetchFeed(cursor), 12000);
      if (!page) return;
      const likedSet = await withTimeout(fetchMyLikesFor(page.posts.map((p) => p.remoteId ?? p.id)), 12000);
      const next = page.posts.map((p) => ({ ...p, liked: likedSet.has(p.remoteId ?? p.id) }));
      feedCursorRef.current = page.nextCursor;
      setFeedHasMore(page.hasMore);
      // 이어붙인 뒤 중복 제거 — 앞 페이지와 겹친 1건이 카드 중복으로 보이지 않게
      setFeedPosts((prev) => dedupeById([...prev, ...next]));
    } catch {
      /* 무시 — 다음 스크롤에서 재시도 */
    } finally {
      feedLoadingMoreRef.current = false;
      setFeedLoadingMore(false);
    }
  }, []);

  // 내 기록 서버→로컬 복원 (계정 전환 후 pull).
  //
  // 예전엔 setRecords(mine)으로 로컬을 통째 교체했다 — 로컬-우선 초안까지 대체하므로
  // "계정 전환 직후(로컬을 이미 비운 상태)에만 호출할 것"이라는 제약이 붙어 있었고,
  // 그래서 상시 pull이 불가능해 아이폰/안드로이드를 같이 쓰면 서로의 기록이 안 보였다.
  // 이제 remoteId 기준 병합(mergeMyRecords)이다:
  //   · 계정 전환 경로는 resetRecords() 직후라 prev가 비어 있어 결과가 교체와 동일하다(회귀 없음).
  //   · hydrate 타이밍 때문에 로컬이 잠깐 비어 보일 때 초안이 날아가던 위험이 사라진다.
  // 삭제 전파는 하지 않는다 — 서버 목록에 없는 로컬 기록도 남는다(mergeMyRecords 규칙 4).
  //
  // ⚠️ 계정 격리의 전제 — 병합으로 바뀌면서 **"useAccountBoundary의 resetRecords() setState가
  //    이 함수의 updater보다 먼저 커밋된다"가 정확성의 전제**가 되었다. 교체 방식일 때는
  //    순서와 무관하게 안전했다. 현재는 resetRecords()와 hydrateMyRecords() 사이에 실제
  //    네트워크 await가 여러 번 있어(unregisterPushToken·clearPersistedStores·getMyProfile·
  //    restoreAppState) prev=[]가 보장된다. **그 사이의 await를 제거·재배치하면 이전 계정의
  //    기록이 새 계정 화면에 병합되는 개인정보 사고가 된다.** 계정 전환 경로를 손대는 사람은
  //    reset이 먼저 커밋되는지부터 확인할 것.
  //
  // 여기서는 여행 카드 편입(linkByDate)을 하지 않는다 — 계정 전환·새 기기 경로의 카드는
  // 서버 백업 복원(fetchTripState)이 담당한다. 여기서 카드를 만들면 복원분과 이중이 된다.
  //
  // 수정 전파 기준선: `fetchMyPosts`가 돌려주는 레코드에는 `serverUpdatedAt`이 이미 실려 있다
  // (services/posts.ts의 mapRowToRecord가 행의 updated_at으로 채운다). 그래서 새 기기에서 받은
  // 기록이 곧바로 'stale'로 오판돼 본문을 한 번 더 받는 일이 없다.
  const hydrateMyRecords = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      const mine = await withTimeout(fetchMyPosts(), 12000);
      setRecords((prev) => mergeMyRecords(prev, mine));
    } catch {
      // 타임아웃/실패 시 현재 상태 유지 — 서버 데이터는 안전
    }
  }, []);

  // ─── 기기 간 내 글 동기화 (조용한 pull) ───
  //
  // 같은 계정으로 아이폰과 안드로이드를 쓰면 한쪽에서 쓴 글이 다른 쪽에 영영 안 보였다.
  // hydrateMyRecords는 useAccountBoundary에서 계정 전환/이 설치 최초 로그인 때만 돌고,
  // 피드는 fetchFeed가 내 글을 제외하며(.neq author_id), posts Realtime 구독도 없다.
  // 이 함수가 그 빈 경로다 — 프로필 당겨서 새로고침 + 앱 포그라운드 복귀에서 호출한다.
  //
  // 전파하는 것 세 가지 — 프로브 응답 한 번으로 셋을 동시에 판정한다(classifyServerPosts):
  //   · 새 글(missing)   : 서버에 있고 로컬에 없다        → 본문을 받아 넣고 여행 카드에 편입
  //   · 삭제(tombstoned) : deleted_at 표식이 있다          → 로컬에서만 제거(removeRecordsLocally)
  //   · 수정(stale)      : 서버 updated_at > 로컬 기준선   → 본문을 다시 받아 미디어 보존 병합
  //
  // 비용 설계: 정상 상태(변화 없음)에서는 id 프로브 1회로 끝난다. 본문(data JSONB)은
  // 새 글·수정된 글에 대해서만, 그것도 **한 번의 fetchPostsByIds로 합쳐** 받는다.
  // 사용자에게 보이는 문구는 없다(조용한 동기화 — 삭제도 조용히 사라진다).
  const syncMyRecordsInFlightRef = useRef(false);

  // 동기화로 들어왔지만 아직 여행 카드에 편입하지 못한 레코드 id.
  // 왜 큐가 필요한가: 편입은 `tripBackupReadyRef`가 서는 뒤에만 할 수 있는데(아래 참조),
  // 그때까지 병합 자체는 미루면 안 된다(기록은 즉시 들어와야 한다). 그래서 "레코드는 지금
  // 넣고, 편입은 가능해질 때까지 들고 간다".
  const pendingLinkRef = useRef<Set<string>>(new Set());

  /**
   * 카드 **재연결**이 필요한 레코드 — 다른 기기에서 국가를 바꾼 글(수정 전파).
   * 값은 '바뀐 뒤의 국가명'이며, 드레인 시점에 그 값이 실제로 커밋됐는지 확인하는 용도다.
   *
   * 왜 `pendingLinkRef`와 따로 두는가: 그쪽 드레인은 "이미 어떤 카드에도 안 붙은 것만" 붙인다.
   * 재연결 대상은 **아직 옛 카드에 붙어 있는 상태**라 그 검사에 걸려 아무 일도 안 일어난다.
   * 여기 들어온 id는 드레인이 떼어낸 뒤(detach) 다시 붙인다.
   */
  const pendingRelinkRef = useRef<Map<string, string>>(new Map());

  /**
   * **로컬 전용 제거** — 다른 기기에서 지워진 글(삭제표식)을 이 기기의 상태에서만 걷어낸다.
   *
   * ⚠️ `deleteRecord`를 쓰면 안 된다. 그쪽은 서버에도 삭제를 보내고(이미 지워진 글에 또 보낸다)
   *    Storage 사진까지 지운다 — 지운 주체는 다른 기기이고 그쪽이 이미 정리했다.
   *    여기서 서버·Storage를 건드리면 실패 응답이 사용자에게 새거나, 최악의 경우
   *    다른 글이 참조하는 파일까지 건드릴 여지가 생긴다.
   *
   * ⚠️ **불변식: "서버 목록에 없음"은 절대 삭제 근거가 아니다.** 프로브는 중간 페이지 실패 시
   *    부분 목록을 돌려주고 MAX_POSTS 상한도 있어 부분 응답과 삭제를 구분할 수 없다.
   *    로컬 제거는 오직 서버가 준 명시적 `deleted_at` 표식이 있을 때만이다
   *    (그 판정은 utils/mergeMyRecords의 classifyServerPosts가 한다).
   *
   * 정리 범위는 `deleteRecord`의 로컬 부분과 같다 — records / archivedIds /
   * tripGroups(멤버 제거·대표 승계·빈 카드 폐기) / countryCovers, 그리고 세션 ref들.
   */
  const removeRecordsLocally = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const gone = new Set(ids);
    setRecords((prev) => (prev.some((r) => gone.has(r.id)) ? prev.filter((r) => !gone.has(r.id)) : prev));
    setArchivedIds((prev) => (prev.some((i) => gone.has(i)) ? prev.filter((i) => !gone.has(i)) : prev));
    // 여행 묶음 정합성 — 공용 헬퍼(대표 승계 + **손댄 카드만** 빈 카드 폐기).
    // 여기서 배열 전체에 빈 카드 필터를 걸면 진행 중 체류 카드가 조용히 사라진다(헬퍼 주석 참조).
    detachRecordsFromTripGroups(ids);
    setCountryCovers((prev) => {
      if (!Object.values(prev).some((v) => gone.has(v.recordId))) return prev;
      const next: Record<string, CountryCover> = {};
      for (const [k, v] of Object.entries(prev)) if (!gone.has(v.recordId)) next[k] = v;
      return next;
    });
    // 세션 ref 잔존물 — 지운 기록 id가 큐·집합에 남으면 다음 회차가 없는 기록을 계속 훑는다.
    for (const id of ids) {
      pendingLinkRef.current.delete(id);
      pendingRelinkRef.current.delete(id);
      publishAttemptRef.current.delete(id);
      pendingDeleteRef.current.delete(id);
      pendingEditRef.current.delete(id);
    }
  }, [detachRecordsFromTripGroups]);

  /**
   * 큐에 쌓인 레코드를 이 저장소의 기존 그룹핑 규칙으로 여행 카드에 편입한다.
   *
   * ⚠️ `linkRecordToTrip`이 아니라 `linkByDate`를 쓴다. linkRecordToTrip은 `coversNow(rec)`가
   *    참이면 실시간 경로로 빠져 `tripSession`을 건드린다 — 다른 기기에서 쓴 글을 이 기기의
   *    '현재 위치 이벤트'로 취급하면 여행 세션이 잘못 끊기거나 열린다. 동기화로 들어온 글은
   *    회고 기록과 같은 날짜 규칙으로 붙이는 것이 맞다.
   *
   * ⚠️ `tripBackupReadyRef`가 서기 전에는 절대 편입하지 않는다. 새 기기에서는 서버 카드
   *    복원(fetchTripState)이 "로컬 tripGroups가 비어 있을 때만" 돈다 — 복원 시도가 끝나기 전에
   *    동기화가 로컬 카드를 만들어 버리면 그 게이트가 닫혀 **다른 기기의 카드 제목·커버가
   *    영영 안 넘어온다.** 아직이면 큐에 그대로 두고 다음 트리거에서 처리한다.
   */
  /**
   * @param dropMissing `records`에 없는 큐 항목을 버릴지.
   *
   * ⚠️ "records에 없다"는 두 가지 뜻이라 호출 지점마다 판정이 달라야 한다.
   *    ① 정말 삭제됐다 → 버려야 한다(안 버리면 큐가 영원히 자란다)
   *    ② setRecords가 아직 커밋되지 않았다 → 버리면 안 된다
   *   `recordsLiveRef`도 `linkByDateRef`도 렌더 단계에서 대입되므로, 병합 직후 드레인은
   *   렌더가 아직 안 돌았을 수 있다. 거기서 ②를 ①로 오판해 버리면 그 글은 다음 프로브에서
   *   이미 remoteId가 로컬에 있어 '빠진 글'로도 안 잡혀 **영영 어느 카드에도 안 붙는다**
   *   (= 프로필에 안 보이는 원래 증상 재발, 조용하고 영구적).
   *   그래서 병합 직후에는 dropMissing=false로 큐에 남기고, 회차 시작 드레인(그 사이 렌더가
   *   여러 번 지났다)에서만 dropMissing=true로 정리한다.
   */
  const drainPendingLinks = useCallback((dropMissing: boolean) => {
    if (pendingLinkRef.current.size === 0) return;
    if (!tripBackupReadyRef.current) return; // 카드 복원 미완 — 이번 회차는 건너뛴다(큐 유지)
    const ids = Array.from(pendingLinkRef.current);
    for (const id of ids) {
      const rec = recordsLiveRef.current.find((r) => r.id === id);
      if (!rec) {
        if (dropMissing) {
          pendingLinkRef.current.delete(id); // 삭제된 기록 정리
          pendingRelinkRef.current.delete(id);
        }
        continue;                            // 아니면 커밋 대기로 보고 큐에 남긴다
      }
      const wantCountry = pendingRelinkRef.current.get(id);
      if (wantCountry !== undefined) {
        // ── 재연결 경로(다른 기기에서 국가가 바뀐 글) ──
        // ⚠️ 병합이 아직 커밋되지 않았으면 rec.countryName이 옛 국가다. 그 상태로 붙이면
        //    옛 카드에 도로 들어가고 큐에서도 빠져 **영영 잘못된 카드에 남는다**(A안 G1과 같은 함정).
        //    커밋을 확인할 때까지 두 큐 모두에 남긴다 — 다음 회차 시작 드레인이 처리한다.
        if (rec.countryName !== wantCountry) {
          // 회차 시작 드레인이라면 병합은 이미 오래전에 커밋됐다 — 그런데도 값이 다르면
          // 그 사이 로컬에서 또 바뀐 것이고 재연결 의도는 낡았다. 버리지 않으면 두 큐에
          // 영원히 남아 계속 자란다(H2).
          if (dropMissing) {
            pendingRelinkRef.current.delete(id);
            pendingLinkRef.current.delete(id);
          }
          continue;
        }
        // 떼어내기 → 다시 붙이기. 둘 다 setTripGroups 함수형 업데이트라 순서대로 적용된다
        // (linkByDate가 보는 prev는 detach가 끝난 목록이므로 옛 카드에 재매칭되지 않는다).
        detachRecordsFromTripGroups([id]);
        pendingRelinkRef.current.delete(id);
        linkByDateRef.current(rec);
      } else {
        // 이미 어떤 카드에도 속하지 않은 것만 편입한다(중복 편입·엉뚱한 카드 생성 방지)
        const grouped = tripGroupsRef.current.some((g) => g.records.includes(id));
        if (!grouped) linkByDateRef.current(rec);
      }
      // 시도했으면 큐에서 뺀다 — linkByDate가 붙이지 못하는 경우는 국가/날짜가 없는
      // 기록뿐이고(그 함수의 조기 return), 그건 재시도해도 결과가 같다.
      pendingLinkRef.current.delete(id);
    }
  }, [detachRecordsFromTripGroups]);

  const syncTripCardsInFlightRef = useRef(false);

  /**
   * ─── 여행 카드 pull (기기 간 동기화) ───
   *
   * `user_trip_cards`(카드 1장 = 1행)를 프로브해 **새 카드 / 지워진 카드 / 수정된 카드**를
   * 로컬에 반영한다. push는 아래쪽 백업 effect가 diff로 담당한다(여기서 올리지 않는다).
   *
   * ⚠️ **호출 순서가 기능의 핵심이다.** `syncMyRecords`에서 반드시
   *      ① records 병합  →  ② 여기(syncTripCards)  →  ③ drainPendingLinks
   *    순서로 불러야 한다. 카드가 서버에서 먼저 들어오면, 동기화로 들어온 글은 이미
   *    **소스 기기의 진짜 카드**에 소속된 상태가 된다 → drain의 `grouped` 검사가 그걸 보고
   *    `linkByDate` 편입을 건너뛴다. 순서가 뒤집히면 이 기기의 날짜 규칙으로 만든 카드가
   *    먼저 생겨, 같은 여행이 두 카드로 갈리고 제목·커버도 기본값이 된다
   *    (A안의 날짜 편입은 카드 동기화가 없던 시절의 폴백이다 — 이제 카드가 먼저다).
   *
   * ⚠️ `tripBackupReadyRef` 게이트는 **걸지 않는다.** 그 게이트는 "빈 로컬이 서버 백업을
   *    덮어쓰는 것"을 막는 push 쪽 방어이고, pull-병합은 로컬을 지우지 않으므로 안전하다.
   *    오히려 여기서 카드를 먼저 채우면 legacy 복원이 "로컬이 원본" 갈래로 빠져 낡은
   *    통째 백업을 심지 않게 되므로, 게이트를 안 거는 편이 정확하다.
   *
   * ⚠️ **앱 시작 경로에서도 반드시 한 번 돌아야 한다.** `syncMyRecords`의 트리거는 AppState
   *    `'active'` 리스너와 프로필 당겨서 새로고침뿐인데, **AppState 리스너는 앱 시작 시
   *    발화하지 않는다.** 그래서 복원 effect(로그인 확정 후 1회)에서도 직접 부른다 —
   *    안 그러면 재설치·기기 변경·계정 전환 첫 실행에서 카드가 0장이다(legacy 복원은
   *    게이트에 막혀 있으므로 아무도 안 심는다).
   *
   * @param preProbe 이미 받아둔 프로브 결과(복원 effect가 게이트 판정에 쓴 것)를 재사용한다.
   *                 넘기지 않거나 `null`이면 직접 조회한다.
   * @returns 'ok' 프로브 성공 / 'skipped' 가드 / 'failed' 프로브 실패
   */
  const syncTripCards = useCallback(async (
    preProbe?: ServerTripCardRef[] | null,
  ): Promise<'ok' | 'skipped' | 'failed'> => {
    if (!isSupabaseConfigured || !hydratedRef.current) return 'skipped';
    if (syncTripCardsInFlightRef.current) return 'skipped';
    syncTripCardsInFlightRef.current = true;
    // 계정 세대 — 응답이 오는 사이 계정이 바뀌면 이전 계정 카드를 새 계정에 심으면 안 된다
    // (복원 effect의 M1 방어와 같은 장치).
    const epoch = tripRestoreEpochRef.current;
    try {
      const probe = preProbe ?? (await withTimeout(probeTripCards(), 12000));
      if (!probe) return 'failed'; // 표 없음·네트워크 실패 — 조용히 포기(다음 트리거에서 재시도)
      if (epoch !== tripRestoreEpochRef.current) return 'skipped';

      const { missing, tombstoned, stale } = classifyServerCards(tripGroupsRef.current, probe);

      // ① 삭제 전파 — **카드만** 없앤다. 멤버 기록은 그대로 둔다.
      //    기록의 삭제는 posts의 tombstone이 따로 전파한다(removeRecordsLocally). 여기서 기록까지
      //    지우면 "카드만 정리했는데 사진이 사라졌다"가 된다.
      if (tombstoned.length > 0) {
        const gone = new Set(tombstoned);
        setTripGroups((prev) => (prev.some((g) => gone.has(g.id)) ? prev.filter((g) => !gone.has(g.id)) : prev));
        // 지문에서도 뺀다 — 안 빼면 다음 push diff가 "사라진 카드"로 보고 **이미 지워진 카드에
        // tombstone을 다시 쏜다**(재-tombstone 루프).
        for (const id of tombstoned) lastPushedRef.current.delete(id);
        // ⚠️ tripSession은 건드리지 않는다. 세션이 지워진 카드를 가리켜도 조회가 빗나가 새 카드가
        //    만들어질 뿐이고, 세션은 이 기기의 현재 위치 개념이라 원격 삭제로 끊으면 안 된다.
      }

      const need = [...stale, ...missing.filter((id) => !stale.includes(id))];
      if (need.length === 0) {
        // 서버가 모르는 로컬 카드가 있으면 push를 깨운다(시드 · 지난 회차 실패분 재시도).
        // 여기서 직접 올리지 않는 이유: 올리는 규칙(직렬화·지문·기준선 심기)이 백업 effect에
        // 한 벌만 있어야 두 곳이 어긋나지 않는다.
        const known = new Set(probe.map((p) => p.cardId));
        if (tripGroupsRef.current.some((g) => !known.has(g.id))) setTripPushNudge((n) => n + 1);
        return 'ok';
      }

      const rows = await withTimeout(fetchTripCards(need), 20000);
      if (epoch !== tripRestoreEpochRef.current) return 'skipped';
      if (rows.length === 0) return 'ok';

      // 서버 배열은 remoteId(posts.id) 기준이다 — 이 기기의 로컬 기록 id로 바꾼다.
      // 못 찾으면 **그대로 둔다**(버리지 않는다): 그 글이 아직 동기화 전일 수 있고, 다음
      // records 동기화가 채운다. 서버에서 받은 글은 id === remoteId라 그대로도 맞는다.
      const byRemote = new Map<string, string>();
      for (const r of recordsLiveRef.current) if (r.remoteId) byRemote.set(r.remoteId, r.id);
      const mapRemoteToLocal = (remote: string) => byRemote.get(remote) ?? remote;
      // 죽은 id 청소(mergeTripCards 주석 참조)의 조건 ① — "이 기기에 그 기록이 실존하는가".
      // ⚠️ `hydratedRef` 가드를 이미 지났으므로 이 목록은 '영속에서 복원이 끝난 진짜 목록'이다.
      //    비어 있는 시점에 이걸 넘기면 멀쩡한 멤버를 죽은 id로 오인해 버린다.
      const localRecordIds = new Set(recordsLiveRef.current.map((r) => r.id));
      const isKnownRecord = (rid: string) => localRecordIds.has(rid);

      const staleSet = new Set(stale);
      const staleRows = rows.filter((r) => staleSet.has(r.cardId));
      // 새 카드는 **미리** 로컬 형태로 만들어 둔다(지문을 그 목록에만 심으려고).
      // 실제로 안 들어간 카드에 지문을 심으면, 그 카드의 로컬 변경이 '서버와 같음'으로 보여
      // 영영 안 올라간다.
      const existing = new Set(tripGroupsRef.current.map((g) => g.id));
      const addCards: TripGroup[] = [];
      const addSeeds: { cardId: string; json: string }[] = [];
      for (const r of rows) {
        if (staleSet.has(r.cardId) || existing.has(r.cardId)) continue;
        const c = toLocalTripCard(r, mapRemoteToLocal);
        if (!c) continue; // 쓸 수 없는 본문(tombstone 잔재 등) — 건너뛴다
        addCards.push(c as TripGroup);
        addSeeds.push({ cardId: r.cardId, json: tripCardJson(r.data) });
      }

      setTripGroups((prev) => {
        let next = prev;
        if (staleRows.length > 0) {
          const byId = new Map(staleRows.map((r) => [r.cardId, r]));
          let dirty = false;
          const merged = next.map((g) => {
            const srv = byId.get(g.id);
            if (!srv) return g;
            const m = mergeServerCard(g, srv, mapRemoteToLocal, isKnownRecord);
            if (m === g) return g; // 쓸 수 없는 본문 — 로컬 그대로
            dirty = true;
            return m;
          });
          if (dirty) next = merged;
        }
        if (addCards.length > 0) {
          // 커밋 시점 기준으로 한 번 더 중복을 거른다(그 사이 같은 id가 생겼을 수 있다)
          const have = new Set(next.map((g) => g.id));
          const add = addCards.filter((c) => !have.has(c.id));
          // 새 카드를 앞에 둔다 — 이 저장소의 카드 생성 경로(makeTripGroup·addTripGroup)와 같은 규칙
          if (add.length > 0) next = [...add, ...next];
        }
        return next;
      });

      // ⚠️ 받은 카드는 **받자마자 지문을 심는다.** 안 심으면 다음 push diff가 이 카드를
      //    '이 기기가 새로 만든 카드'로 오인해 그대로 되올린다(무의미한 왕복 + updated_at이
      //    튀어 상대 기기가 다시 내려받는 에코).
      //    stale(병합)은 심지 않는다 — 병합 결과는 서버 사본과 다를 수 있고(로컬 전용 멤버·
      //    로컬 coverUri), 그 차이는 **서버로 올라가야 한다.**
      for (const s of addSeeds) lastPushedRef.current.set(s.cardId, s.json);
      return 'ok';
    } catch {
      return 'failed'; // 조용히 무시 — 다음 트리거에서 재시도(토스트 없음)
    } finally {
      syncTripCardsInFlightRef.current = false;
    }
  }, []);

  const syncStateFlagsInFlightRef = useRef(false);

  /**
   * ─── 기록 부가상태 집합 6종의 기기 간 pull (user_state_flags) ───
   *
   * 보관·차단·음소거·본 스냅·신고 숨김은 그동안 `user_app_state` 1행 jsonb에 통째로 실려
   * 4초 디바운스로 올라갔다. 두 기기가 같이 쓰면 나중에 쓴 쪽이 상대를 통째로 덮어써
   * (보관을 풀었는데 되살아나고, 차단이 한쪽에만 남는) 증상이 났다. 여기서는 카드와 같은
   * 방식으로 **행 단위**로 받아 병합한다: 프로브 → 표식 적용 → 서버에만 있는 것 추가.
   *
   * ⚠️ **호출 순서.** `syncMyRecords`의 `finish()`에서 **카드 다음**에 부른다
   *    (records → cards → flags → drain). 이유는 `archived`의 키가 remoteId여서
   *    remoteId → 로컬 기록 id 역매핑에 **records 병합이 끝난 목록**이 필요하기 때문이다.
   *    카드보다 먼저 돌 이유는 없고, 카드 뒤가 매핑이 가장 정확하다.
   *
   * ⚠️ `tripBackupReadyRef` 게이트는 걸지 않는다 — pull은 로컬을 되살리지 않고 서버 표식만
   *    적용하므로(제거는 명시적 표식이 있을 때만) 카드 pull과 같은 이유로 안전하다.
   *
   * @returns 'ok' 프로브 성공 / 'skipped' 가드 / 'failed' 프로브 실패
   */
  const syncStateFlags = useCallback(async (): Promise<'ok' | 'skipped' | 'failed'> => {
    if (!isSupabaseConfigured || !hydratedRef.current) return 'skipped';
    if (syncStateFlagsInFlightRef.current) return 'skipped';
    syncStateFlagsInFlightRef.current = true;
    // 계정 세대 — 응답이 오는 사이 계정이 바뀌면 이전 계정 상태를 새 계정에 심으면 안 된다
    // (카드·복원 effect와 같은 장치를 공유한다).
    const epoch = tripRestoreEpochRef.current;
    try {
      const probe = await withTimeout(probeStateFlags(), 12000);
      if (!probe) return 'failed'; // 표 없음·네트워크 실패 — 조용히 포기(다음 트리거에서 재시도)
      if (epoch !== tripRestoreEpochRef.current) return 'skipped';

      const live = flagsLiveRef.current;
      // 서버 키 ↔ 로컬 키 변환기 (archived 전용 — 나머지는 항등)
      const toRemote = (rid: string) => recordsLiveRef.current.find((r) => r.id === rid)?.remoteId ?? rid;
      const byRemote = new Map<string, string>();
      for (const r of recordsLiveRef.current) if (r.remoteId) byRemote.set(r.remoteId, r.id);
      // 못 찾으면 **그대로 둔다**(버리지 않는다): 그 글이 아직 이 기기에 없을 수 있고, 동기화로
      // 받은 글은 id === remoteId라 그 값이 곧 로컬 id다(자기 치유). 카드의 mapRemoteToLocal과 동일.
      const mapServerKey = (kind: StateFlagKind, key: string) =>
        kind === 'archived' ? (byRemote.get(key) ?? key) : key;

      const localState = buildLocalFlagState(live, toRemote);
      const { missingLocally, tombstonedLocally } = classifyServerFlags(localState, probe, mapServerKey);

      // ── ① 삭제 표식 적용 (classify가 removable kind만 넣어 준다) ──
      // 로컬 집합이 서버 표기(remoteId)로 들고 있을 수도, 매핑된 표기로 들고 있을 수도 있어
      // **두 키를 모두** 제거 대상에 넣는다.
      const removed = new Map<StateFlagKind, Set<string>>();
      for (const t of tombstonedLocally) {
        const set = removed.get(t.kind) ?? new Set<string>();
        set.add(t.localKey);
        set.add(t.itemKey);
        removed.set(t.kind, set);
        // 지문에서도 뺀다 — 안 빼면 다음 push diff가 "사라진 항목"으로 보고 **이미 꺼진 항목에
        // 표식을 다시 쏜다**(재-tombstone 루프).
        lastFlagsPushedRef.current.delete(flagMapKey(t.kind, t.itemKey));
      }
      const rmArchived = removed.get('archived');
      const rmMuted = removed.get('muted');
      const rmBlocked = removed.get('blocked');
      if (rmArchived?.size) {
        setArchivedIds((prev) => (prev.some((i) => rmArchived.has(i)) ? prev.filter((i) => !rmArchived.has(i)) : prev));
      }
      if (rmMuted?.size) {
        setMutedHandles((prev) => (prev.some((h) => rmMuted.has(h)) ? prev.filter((h) => !rmMuted.has(h)) : prev));
      }
      if (rmBlocked?.size) {
        // ⚠️ 여기서 서버 `blocks`(RLS 집행)는 건드리지 않는다 — QA가 이 판단을 재검토하라고
        //    지적한 자리라 근거를 다시 적는다.
        //    ① 표식을 만든 기기가 `unblockUser`에서 **이미 `apiUnblock`을 보냈다.** `blocks`는
        //       계정 단위 공유 상태라 그 한 번으로 두 기기 모두에 적용된다. 여기서 또 쏘면
        //       같은 일을 두 번 하는 것이다.
        //    ② QA가 지적한 "재차단이 풀려 blocks와 목록이 어긋난다"는 경로는 이제
        //       **revive(`explicitFlagAddsRef`)가 닫았다** — 재차단한 행은 부활하므로 pull이
        //       그 사람을 목록에서 빼지 않는다.
        //    ③ 남는 어긋남은 `apiUnblock` 자체가 실패한 경우뿐인데, 그때는 "서버는 차단 중,
        //       목록은 비어 있음" = **과차단**(안전한 방향)이다. 여기서 unblock을 쏴 맞추면
        //       실패한 해제를 이 기기가 대신 완성하는 셈이라, 조용한 pull이 차단을 **푸는**
        //       방향으로 움직인다 — 안전 기능에서 택할 방향이 아니다.
        setBlockedUsers((prev) => {
          const next = prev.filter((b) => !rmBlocked.has(blockedFlagKey(b)));
          return next.length === prev.length ? prev : next;
        });
      }

      // ── ② 서버에만 있는 항목 받기 ──
      // blocked만 표시용 메타(data)가 필요하다. 나머지는 '있다'가 전부라 본문을 안 받는다.
      const missBlocked = missingLocally.filter((m) => m.kind === 'blocked');
      const blockedRows = missBlocked.length > 0
        ? await withTimeout(fetchStateFlags(missBlocked.map((m) => ({ kind: m.kind, itemKey: m.itemKey }))), 20000)
        : [];
      if (epoch !== tripRestoreEpochRef.current) return 'skipped';

      const addArchived = missingLocally.filter((m) => m.kind === 'archived').map((m) => m.localKey);
      const addMuted = missingLocally.filter((m) => m.kind === 'muted').map((m) => m.itemKey);
      const addReportedPost = missingLocally.filter((m) => m.kind === 'reportedPost').map((m) => m.itemKey);
      const addReportedComment = missingLocally.filter((m) => m.kind === 'reportedComment').map((m) => m.itemKey);
      // viewedSnap은 로컬 상한(500)이 **끝쪽을 최신으로** 보는 목록이다(markSnapViewed의 slice(-500)).
      // 그래서 서버분을 뒤에 붙이되 서버 updated_at 오름차순으로 정렬해 넣는다 — 정렬을 안 하면
      // 상한에 걸렸을 때 어떤 것이 밀려날지가 응답 순서에 좌우된다.
      // (이 시각은 **로컬에 저장하지 않는다** — 정렬에만 쓰는 인메모리 값이다.)
      const probeAtByKey = new Map<string, number>();
      for (const p of probe) probeAtByKey.set(flagMapKey(p.kind, p.itemKey), typeof p.updatedAt === 'number' ? p.updatedAt : 0);
      const addViewed = missingLocally
        .filter((m) => m.kind === 'viewedSnap')
        .sort((a, b) => (probeAtByKey.get(flagMapKey('viewedSnap', a.itemKey)) ?? 0)
                      - (probeAtByKey.get(flagMapKey('viewedSnap', b.itemKey)) ?? 0))
        .map((m) => m.itemKey);

      // 문자열 집합 공통 병합 — 이미 있으면 그대로(참조 동일 반환)
      const addTo = (prev: string[], add: string[]): string[] => {
        const have = new Set(prev);
        const fresh = add.filter((k) => k && !have.has(k));
        return fresh.length === 0 ? prev : [...prev, ...fresh];
      };
      if (addArchived.length > 0) setArchivedIds((prev) => addTo(prev, addArchived));
      if (addMuted.length > 0) setMutedHandles((prev) => addTo(prev, addMuted));
      if (addReportedPost.length > 0) setReportedPostIds((prev) => addTo(prev, addReportedPost));
      if (addReportedComment.length > 0) setReportedCommentIds((prev) => addTo(prev, addReportedComment));
      if (addViewed.length > 0) {
        // ⚠️ **받은 뒤 자르지 않는다. 넘칠 만큼은 받지 않는다**(2026-09-10 QA M2).
        //    add-only라 밀려난 항목에는 표식이 안 나가 서버에서는 계속 살아 있고, 다음 pull에서
        //    다시 `missingLocally`로 잡힌다 → 자르는 방식은 **500칸 창이 매 pull마다 영원히
        //    회전**한다(안정 상태 없음, 본 스냅의 링이 계속 다시 켜진다).
        //    `mergeViewedSnap`은 빈 칸만큼만 채워 로컬이 가득 차는 순간 수렴한다.
        setViewedSnapIds((prev) => mergeViewedSnap(prev, addViewed));
      }

      // blocked — 본문을 받은 것만 넣는다. 못 받은 키는 다음 회차에 다시 잡힌다
      // (표시용 메타가 없으면 목록에 이름 없는 항목이 생겨 더 나쁘다).
      if (blockedRows.length > 0) {
        const newcomers: BlockedUser[] = [];
        for (const row of blockedRows) {
          const d = row.data;
          if (!d) continue;
          const norm = blockedFlagData(d);
          const name = String(norm.name ?? '');
          const handle = String(norm.handle ?? '');
          if (!name && !handle) continue; // 신원을 못 세우는 행은 버린다
          newcomers.push({
            name: name || handle,
            emoji: String(norm.emoji ?? ''),
            handle: handle || undefined,
            id: String(norm.id ?? '') || undefined,
            // ⚠️ 기기 시계로 새로 찍지 않는다 — 원래 차단한 기기의 값을 그대로 쓴다.
            //    여기서 Date.now()를 쓰면 목록 정렬이 기기마다 달라지고, 지문에 넣지 않기로 한
            //    필드가 매 기기에서 새 값이 되어 의미가 흐려진다. 값이 없으면 0.
            blockedAt: typeof norm.blockedAt === 'number' ? norm.blockedAt : 0,
          });
        }
        if (newcomers.length > 0) {
          setBlockedUsers((prev) => {
            const have = new Set(prev.map((b) => blockedFlagKey(b)));
            const fresh = newcomers.filter((b) => !have.has(blockedFlagKey(b)));
            return fresh.length === 0 ? prev : [...prev, ...fresh];
          });
        }
      }

      // ── ③ 지문 시드 ──
      // "서버가 이미 갖고 있고 로컬에도 있는" 항목은 다시 올릴 필요가 없다. 안 심으면
      // **앱을 켤 때마다 집합 전량(viewedSnap 500개 포함)이 한 번씩 upsert된다.**
      //
      // ⚠️ 심는 조건이 이 블록의 전부다: **이번 회차 시작 시점에 이미 로컬에 있던 키만.**
      //    로컬에 없는 키를 심으면 다음 push diff가 그것을 "사라진 항목"으로 보고
      //    **표식을 쏜다(오삭제).**
      //    - 방금 받은 항목(`missingLocally`)은 **일부러 안 심는다.** setState는 아직 커밋 전이라
      //      `flagsLiveRef`에 없고, 그 찰나에 push 타이머가 발화하면 방금 받은 항목이
      //      "사라졌다"로 잡힌다. 안 심으면 최악이라도 **한 번 더 upsert**될 뿐이다(멱등).
      //    - blocked는 지문이 본문에서 나오는데 이미 로컬에 있는 항목의 서버 본문은 받지
      //      않으므로(불필요한 조회) 시드 대상이 아니다. 차단 목록은 규모가 작아 비용이 없다.
      //    - 삭제 표식 행은 건너뛴다 — 위 ①에서 지문에서 뺀 것을 여기서 되살리면 안 된다.
      const localKeySets = new Map<StateFlagKind, Set<string>>();
      for (const kind of Object.keys(localState) as StateFlagKind[]) {
        localKeySets.set(kind, new Set(localState[kind].map((it) => it.key)));
      }
      for (const p of probe) {
        if (typeof p.deletedAt === 'number' && p.deletedAt > 0) continue;
        if (p.kind === 'blocked') continue;
        if (!localKeySets.get(p.kind)?.has(p.itemKey)) continue;
        lastFlagsPushedRef.current.set(flagMapKey(p.kind, p.itemKey), '');
      }

      // ── ④ 서버가 모르는 로컬 항목이 있으면 push를 깨운다 ──
      // (시드 · 지난 회차 실패분 재시도. 여기서 직접 올리지 않는 이유는 카드와 같다 —
      //  올리는 규칙이 push effect에 한 벌만 있어야 두 곳이 어긋나지 않는다.)
      const serverKnown = new Set(probe.map((p) => flagMapKey(p.kind, p.itemKey)));
      const hasUnknownLocal = (Object.keys(localState) as StateFlagKind[]).some((kind) =>
        localState[kind].some((it) => it.key && !serverKnown.has(flagMapKey(kind, it.key))),
      );
      if (hasUnknownLocal) setFlagsPushNudge((n) => n + 1);
      return 'ok';
    } catch {
      return 'failed'; // 조용히 무시 — 다음 트리거에서 재시도(토스트 없음)
    } finally {
      syncStateFlagsInFlightRef.current = false;
    }
  }, []);

  /**
   * @returns 'ok'      프로브가 성공했다(빠진 글이 없었어도 성공이다)
   *          'skipped' 가드에 걸려 아무것도 하지 않았다(발행 중·재진입·미설정·hydrate 전)
   *          'failed'  프로브가 실패했다(네트워크·타임아웃)
   * 호출부(포그라운드 effect)가 이 결과로 재시도 창을 정한다 — 실패 회차가 60초를 통째로
   * 소모하면 안 된다.
   */
  const syncMyRecords = useCallback(async (): Promise<'ok' | 'skipped' | 'failed'> => {
    if (!isSupabaseConfigured || !hydratedRef.current) return 'skipped';
    // ⚠️ 발행 in-flight 가드. 발행 insert는 서버에 들어갔는데 로컬 레코드에 remoteId가
    //    아직 안 붙은 순간이 있다 — 그때 프로브가 그 id를 '빠진 글'로 오인해 같은 글을
    //    한 벌 더 추가한다. (재시작 후까지 남은 orphan은 이 카운터가 0이라 못 막으므로
    //    classifyServerPosts의 client_id 대조가 따로 막는다.)
    if (publishInFlightRef.current > 0) return 'skipped';
    if (syncMyRecordsInFlightRef.current) return 'skipped';
    syncMyRecordsInFlightRef.current = true;
    /**
     * 회차 마무리 — **모든 성공 경로가 여기를 지나야 한다.**
     *
     * 순서: (호출부에서 이미 끝낸) records 병합 → **카드 동기화** → 편입 드레인.
     * 카드가 먼저 들어와야 동기화로 받은 글이 소스 기기의 진짜 카드에 소속된 상태가 되고,
     * 드레인의 `grouped` 검사가 그걸 보고 날짜 규칙 편입을 건너뛴다(syncTripCards 주석 참조).
     * 글에 변화가 없는 회차에도 카드는 바뀌었을 수 있으므로 반드시 돈다.
     *
     * **카드 단계 실패는 회차 실패로 올린다.** 호출부(포그라운드 effect)가 `'ok'`가 아니면
     * throttle 창을 60초 → 10초로 줄이는데, 카드만 실패한 회차를 `'ok'`로 삼키면 그 실패가
     * 60초를 통째로 먹는다(records 프로브 실패를 짧게 재시도하는 설계와 어긋난다).
     * ⚠️ 이미 커밋된 records 병합은 그대로 남는다 — 반환값은 **재시도 창 계산에만** 쓰이고
     *    상태를 되돌리지 않는다(`setRecords`는 이 지점 이전에 끝났다).
     *    재진입 가드로 인한 `'skipped'`는 실패가 아니므로 승격하지 않는다.
     */
    const finish = async (): Promise<'ok' | 'failed'> => {
      const cardRes = await syncTripCards();
      // 부가상태 집합(보관·차단·음소거·본 스냅·신고 숨김)은 **카드 다음**이다.
      // `archived`의 서버 키가 remoteId라 역매핑에 병합이 끝난 records 목록이 필요하고,
      // 카드처럼 편입 순서에 얽히지 않으므로 드레인보다는 앞이면 충분하다.
      // 실패해도 회차 판정에 섞지 않는다 — 카드와 달리 이 단계 실패는 화면에 보이는 결과가
      // 없고(다음 트리거에 조용히 재시도된다), throttle 창을 10초로 줄일 만한 사유가 아니다.
      const flagRes = await syncStateFlags();
      if (__DEV__ && flagRes === 'failed') console.log('[stateFlags] pull 실패 — 다음 트리거에서 재시도');
      // ⚠️ setRecords/setTripGroups가 커밋될 때까지 한 틱 기다린 뒤 편입한다. linkByDate는
      //    카드의 날짜 범위를 구할 때 클로저의 `records`로 멤버를 조회하는데, 커밋 전에 부르면
      //    방금 만든 카드의 멤버가 조회되지 않아 같은 여행의 2건이 각각 다른 카드를 만든다.
      //    이 기다림은 보장이 아니라 최선 노력이다 — 부족했을 때 안전한 이유는 dropMissing=false다
      //    (커밋 전이라 못 찾은 항목을 큐에 남겨 다음 회차 시작 드레인이 처리한다).
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      drainPendingLinks(false);
      return cardRes === 'failed' ? 'failed' : 'ok';
    };
    try {
      // 지난 회차에 미뤄둔 편입부터 처리한다(카드 복원 대기분 + 커밋을 못 기다린 분).
      // 여기서는 그 사이 렌더가 여러 번 지났으므로 records에 없는 항목은 정말 삭제된 것이다.
      drainPendingLinks(true);
      const server = await withTimeout(fetchMyPostIds(), 12000);
      // 조회 실패는 null — 조용히 포기(다음 트리거에서 재시도).
      // ⚠️ **여기서는 finish()를 지나지 않는다 = 이 회차의 카드 동기화도 통째로 건너뛴다.**
      //    의도된 순서 의존이다: 카드 병합은 remoteId → 로컬 기록 id 매핑에 기대는데, records
      //    프로브가 실패한 회차는 그 매핑이 낡았을 수 있다. 그 상태로 카드를 병합하면 멀쩡한
      //    멤버가 '매핑 안 되는 id'로 남거나(무해) **죽은 id 청소가 오판**할 수 있다.
      //    실패는 'failed'로 나가 10초 창만 쓰므로 곧 다시 시도된다(비용도 작다).
      //    글 조회만 실패하고 카드 표는 멀쩡한 드문 경우에 카드 동기화가 한 회차 밀리는 것이
      //    이 선택의 대가이며, 그쪽이 오판보다 싸다.
      if (!server) return 'failed';
      // 커밋 시점의 최신 목록으로 대조해야 한다. 미러 ref로 읽고(안정 콜백 유지),
      // 실제 반영도 setRecords 함수형으로 해서 그 사이 늘어난 로컬 글과 다시 대조한다.
      const { missing, tombstoned, stale, baseline } = classifyServerPosts(recordsLiveRef.current, server);

      // ① 삭제 전파를 먼저 — 지워진 글을 stale·missing 처리에 끌고 들어가지 않는다.
      //    (classifyServerPosts가 이미 배타적으로 나누지만, 순서를 명시해 의도를 남긴다)
      if (tombstoned.length > 0) removeRecordsLocally(tombstoned);

      // ② 기준선 심기 — serverUpdatedAt이 없던 옛 기록에 **본문 재조회 없이** 서버 값만 기록한다.
      //    이 기능을 켜는 첫 회차에만 한 번 돌고, 그 뒤로는 항상 비어 있다(= 정상 상태 요청 0회 유지).
      if (baseline.length > 0) {
        setRecords((prev) => {
          const map = new Map(baseline.map((b) => [b.postId, b.updatedAt]));
          let changed = false;
          const next = prev.map((r) => {
            const at = r.remoteId ? map.get(r.remoteId) : undefined;
            if (at === undefined || r.serverUpdatedAt === at) return r;
            changed = true;
            return { ...r, serverUpdatedAt: at };
          });
          return changed ? next : prev;
        });
      }

      // ③ 본문이 필요한 것은 '새 글(missing)'과 '수정된 글(stale)' 둘뿐이고,
      //    둘 다 같은 조회(fetchPostsByIds)로 받는다 — 한 회차에 요청은 최대 1번 더다.
      const staleSet = new Set(stale);
      const need = [...stale, ...missing.filter((id) => !staleSet.has(id))];
      if (need.length === 0) return finish(); // 글은 정상 상태 — 그래도 카드는 확인한다
      const rows = await withTimeout(fetchPostsByIds(need), 20000);
      if (rows.length === 0) return finish(); // 본문을 못 받았어도 카드는 확인한다
      // 받은 뒤 분기: 이미 로컬에 있는 글이면 '수정 병합', 없으면 '새 글 추가'.
      const staleRows = rows.filter((r) => r.remoteId && staleSet.has(r.remoteId));
      const newRows = rows.filter((r) => !r.remoteId || !staleSet.has(r.remoteId));
      setRecords((prev) => {
        let next = prev;
        if (staleRows.length > 0) {
          const byRemote = new Map(staleRows.map((r) => [r.remoteId as string, r]));
          let changed = false;
          const merged = next.map((r) => {
            const srv = r.remoteId ? byRemote.get(r.remoteId) : undefined;
            if (!srv) return r;
            changed = true;
            // 미디어·로컬 전용 필드는 지키고 본문만 서버본으로 (utils/mergeMyRecords)
            return mergeServerUpdate(r, srv);
          });
          if (changed) next = merged;
        }
        // 새 글만 병합한다 — mergeMyRecords는 이미 있는 remoteId를 건너뛰므로 staleRows를
        // 같이 넣어도 무해하지만, 의도를 코드로 남긴다.
        if (newRows.length > 0) next = mergeMyRecords(next, newRows);
        return next;
      });
      // 카드 편입은 '새로 들어온 글'만 대상이다.
      for (const r of newRows) pendingLinkRef.current.add(r.id);

      // ④ 수정 전파의 카드 재연결 — **"수정된 글은 이미 카드에 붙어 있다"는 틀렸다.**
      //    붙어는 있지만 '맞는 카드'라는 보장이 없다. 다른 기기에서 국가를 바꾸면 이 기기에서는
      //    일본 카드 안에 대만 기록이 남고, 그 기록이 커버였다면 카드 표지·국기까지 어긋난다.
      //    로컬 수정 경로(updateRecord)가 정확히 이 상황을 막는 재연결 코드를 갖고 있다.
      //    ⚠️ 여기서 직접 붙이지 않고 큐로 넘긴다 — 재연결은 `tripBackupReadyRef` 게이트와
      //       'linkRecordToTrip이 아니라 linkByDate'라는 A안 규칙을 지켜야 하고, 그 둘을
      //       이미 지키는 곳이 drainPendingLinks다.
      //    분할 카드(splitByCountry) 기록은 호출부가 국가별 카드를 직접 관리하므로 제외한다
      //    (updateRecord의 예외와 같다).
      for (const srv of staleRows) {
        const loc = recordsLiveRef.current.find((r) => r.remoteId === srv.remoteId);
        if (!loc || srv.splitByCountry) continue;
        if (!srv.countryName || srv.countryName === loc.countryName) continue;
        pendingRelinkRef.current.set(loc.id, srv.countryName);
        pendingLinkRef.current.add(loc.id);
      }

      // ⑤ 지구본 국가 대표사진 핀 — updateRecord(:1140 부근)는 대표사진이 바뀌면 countryCovers를
      //    함께 옮긴다. 여기서 안 하면 핀이 옛 URL을 계속 가리키고, 다른 기기가 그 파일을
      //    Storage에서 지웠으면 깨진 이미지가 된다. 병합 결과를 미리 계산해 같은 규칙을 적용한다
      //    (setRecords의 prev와 다를 수 있지만, 키가 recordId라 어긋나면 그냥 갱신이 안 될 뿐이다).
      if (staleRows.length > 0) {
        const previewByRecordId = new Map<string, TravelRecord>();
        for (const srv of staleRows) {
          const loc = recordsLiveRef.current.find((r) => r.remoteId === srv.remoteId);
          if (loc) previewByRecordId.set(loc.id, mergeServerUpdate(loc, srv));
        }
        setCountryCovers((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const [k, v] of Object.entries(prev)) {
            const uri = previewByRecordId.get(v.recordId)?.representativePhoto;
            if (typeof uri === 'string' && uri && uri !== v.uri) {
              next[k] = { recordId: v.recordId, uri };
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }
      // 카드 동기화 + 한 틱 대기 + 편입 드레인은 finish()가 한다(위 정의 참조).
      return finish();
    } catch {
      // 조용히 무시 — 다음 트리거에서 재시도. 토스트를 띄우지 않는다(사용자가 요청한 동작이 아니다).
      return 'failed';
    } finally {
      syncMyRecordsInFlightRef.current = false;
    }
  }, [drainPendingLinks, removeRecordsLocally, syncTripCards, syncStateFlags]);

  // ─── 게시물 카운터(좋아요·댓글 수) 서버 동기화 ───
  // 내 글의 likes/comments는 '내가' 움직일 때만 바뀌고, 남이 누른 좋아요·남이 단 댓글은 서버
  // likes_count/comments_count 에만 쌓였다(fetchFeed는 내 글을 제외하고, hydrateMyRecords는
  // 계정 전환 때만 돈다) → 작성자 화면에서 좋아요가 영원히 0이었다.
  // 아래 두 콜백이 서버 값을 다시 끌어오는 경로다.
  // 안정 콜백(deps [])을 유지해야 화면의 onRefresh/useEffect가 매 렌더 재생성되지 않으므로
  // 목록은 state가 아니라 미러 ref로 읽는다.
  const countSyncRecordsRef = useRef(records);
  countSyncRecordsRef.current = records;
  const countSyncFeedRef = useRef(feedPosts);
  countSyncFeedRef.current = feedPosts;
  const countSyncCommentsRef = useRef(commentsByPost);
  countSyncCommentsRef.current = commentsByPost;
  // 조회를 시작한 시각(since) 기준의 '건드리면 안 되는 글' 판정.
  //   · 좋아요: 서버 반영이 날아가는 중(pending)이거나 조회가 나간 뒤 탭한 글(tapAt >= since)
  //            — 서버 값이 사용자의 최신 의도보다 옛것이다.
  //   · 댓글:  이미 목록이 로드된 글 — 그 글의 comments는 commentsByPost가 단일 출처이고
  //            아래 동기화 effect가 계속 덮으므로, 서버 카운트가 끼어들면 숫자가 깜빡인다.
  const makeCountGuards = useCallback(
    (since: number) => ({
      isLikePending: (localId: string) =>
        (likePendingRef.current[localId] ?? 0) > 0 || (likeTapAtRef.current[localId] ?? 0) >= since,
      isCommentsLoaded: (localId: string) => countSyncCommentsRef.current[localId] !== undefined,
    }),
    []
  );

  /**
   * 내 글의 좋아요·댓글 수를 서버 기준으로 맞춘다 — 소셜·프로필 당겨서 새로고침용.
   *
   * 최신 COUNT_SYNC_MAX개만 본다. 글이 수백 건 쌓인 사용자에게 새로고침마다 전량을 조회시키면
   * 200개 청크가 여러 번 나가 이그레스를 태운다. 그 밖의 오래된 글은 상세 진입 시
   * refreshPostCounts가 단건으로 맞추므로 카운트가 틀린 채 남지 않는다.
   */
  const refreshMyPostCounts = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const COUNT_SYNC_MAX = 200; // = fetchPostStatsFor 청크 1개 = 요청 1회
    const ids = countSyncRecordsRef.current
      .filter((r) => !!r.remoteId && !r.isExample)
      // records 배열 순서는 보장되지 않으므로 최신순으로 직접 정렬한 뒤 자른다
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
      .slice(0, COUNT_SYNC_MAX)
      .map((r) => r.remoteId as string);
    if (ids.length === 0) return;
    const since = Date.now();
    const counts = await fetchPostStatsFor(ids);
    if (!counts) return; // 조회 실패 — 로컬 값 유지(0으로 덮지 않는다)
    setRecords((prev) => mergeServerPostCounts(prev, counts, makeCountGuards(since)));
  }, [makeCountGuards]);

  /** 게시물 1건의 카운터만 맞춘다 — 상세 진입용. 내 글(records)·피드 글(feedPosts) 모두 대상 */
  const refreshPostCounts = useCallback(async (postId: string) => {
    if (!isSupabaseConfigured || !postId) return;
    const inRecords = countSyncRecordsRef.current.find((r) => r.id === postId);
    const inFeed = inRecords ? undefined : countSyncFeedRef.current.find((r) => r.id === postId);
    const target = inRecords ?? inFeed;
    if (!target || target.isExample) return;
    // 피드 글은 id가 곧 remoteId (toggleLike와 같은 규칙)
    const remoteId = target.remoteId ?? (inFeed ? target.id : undefined);
    if (!remoteId) return;
    const since = Date.now();
    const counts = await fetchPostStatsFor([remoteId]);
    if (!counts) return;
    const guards = makeCountGuards(since);
    if (inRecords) setRecords((prev) => mergeServerPostCounts(prev, counts, guards));
    else setFeedPosts((prev) => mergeServerPostCounts(prev, counts, guards));
  }, [makeCountGuards]);

  // 메이트 목록을 백엔드 기준으로 동기화
  // 서버가 연속으로 빈 메이트 목록을 준 횟수 — refreshNeighbors의 일시 빈 응답 필터용
  const emptyNeighborStreakRef = useRef(0);
  const refreshNeighbors = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    // 내가 보낸/받은 대기 신청도 함께 갱신 (오류 시 null → 로컬 유지)
    fetchMyOutgoingNeighborRequests().then((pending) => {
      if (pending) setOutgoingNeighborRequests(pending);
    });
    fetchMyIncomingNeighborRequestIds().then((pending) => {
      if (pending) setIncomingNeighborRequests(pending);
    });
    const list = await fetchNeighbors();
    if (!list) return; // 오류 시 로컬 유지
    setNeighbors((prev) => {
      // 토큰 갱신 직후 RLS가 순간적으로 빈 목록을 줄 수 있다 — 첫 빈 응답은 유지,
      // 연속 2회 빈 응답이면 실제 전체 메이트 해제로 보고 수용(유령 메이트 잔존 방지).
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
          // ⚠️ 이모지·사진은 디스크 캐시(ex)로 폴백하지 않는다.
          //    fetchNeighbors는 값이 없으면 **명시적으로 null**을 준다(social.ts: `?? null`).
          //    `p.photo ?? ex?.photo`로 두면 상대가 프로필 사진을 지워도 내 기기에 남아 있던
          //    옛 사진이 되살아나, 메이트 목록에서만 지운 사진이 영영 사라지지 않았다.
          //    (서버 조회 자체가 실패한 경우는 위에서 `if (!list) return`으로 이미 걸렀다 —
          //     여기 도달했다면 null은 "서버가 없다고 말한 것"이다.)
          emoji: p.emoji ?? undefined,
          photo: p.photo ?? undefined,
          isAbroad: ex?.isAbroad ?? false,
          currentCountry: ex?.currentCountry ?? null,
          currentCountryFlag: ex?.currentCountryFlag ?? null,
          followedAt: ex?.followedAt ?? 0,
          isMutual: true, // 서로메이트은 모두 대칭
        };
      });
    });
  }, []);

  // 앱 시작/복원 후 피드·메이트 1회 로드
  // 내 글 카운터도 여기서 함께 맞춘다 — 지금까지 refreshMyPostCounts 호출부는 소셜·프로필의
  // '당겨서 새로고침' 둘뿐이라, 남이 내 글에 누른 좋아요는 사용자가 당겨야만 보였다.
  // 남의 글(피드)은 시작 시 자동 갱신되는데 내 글만 빠져 있던 비대칭을 없앤다.
  // (안정 useCallback이라 deps에 넣어도 재실행을 유발하지 않는다.)
  useEffect(() => {
    if (hydrated) {
      refreshFeed();
      refreshNeighbors();
      refreshMyPostCounts();
    }
  }, [hydrated, refreshFeed, refreshNeighbors, refreshMyPostCounts]);

  // 과거(id 없이 저장된) 차단 항목 uuid 백필 — handle로 프로필을 찾아 id를 채우고
  // 서버 blocks에도 반영한다(RLS 차단 필터 동작).
  // 수정 2(백필): ref를 boolean 대신 '성공한 handle Set'으로 — 실패 항목은 다음 기회에 재시도.
  const blockBackfillDoneRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!hydrated || !isSupabaseConfigured) return;
    const targets = blockedUsers.filter((b) => !b.id && b.handle && !blockBackfillDoneRef.current.has(b.handle!));
    if (targets.length === 0) return;
    (async () => {
      for (const b of targets) {
        try {
          const p = await getProfileByHandle(b.handle!);
          if (!p?.id) {
            // 탈퇴/핸들 변경 등 — 로컬 차단만 유지, 재시도 방지를 위해 done에 추가
            blockBackfillDoneRef.current.add(b.handle!);
            continue;
          }
          setBlockedUsers((prev) =>
            prev.map((x) => (x.handle === b.handle && !x.id ? { ...x, id: p.id } : x))
          );
          await apiBlock(p.id); // 백필은 조용히(사용자 액션이 아니므로 실패 토스트 없음)
          blockBackfillDoneRef.current.add(b.handle!); // 성공한 항목만 제외
        } catch {
          // 네트워크 실패도 이번 세션에서는 재시도하지 않음 — blockedUsers 변경마다
          // 실패 항목이 API를 반복 호출하는 폭주 방지. 앱 재시작 시 ref가 리셋돼 재도전.
          blockBackfillDoneRef.current.add(b.handle!);
        }
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

  // ─── 포그라운드 복귀 시 내 글 카운터 동기화 ───
  // 모바일 앱은 대개 메모리에 남아 콜드 스타트가 드물다 — 위 '앱 시작' effect만으로는 실제로
  // 거의 발동하지 않으므로 복귀 시점에도 맞춘다. 위 resyncUnpublished의 AppState effect에
  // 얹지 않고 분리한 이유: 미발행 재전송과 카운트 조회는 실패 조건도 비용도 다르다
  // (재전송은 오프라인 판정·발행 시도 상태에 얽히고, 이쪽은 단순 조회 1회다).
  const lastCountSyncAtRef = useRef(0);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      // 60초 throttle — 앱 전환을 반복할 때마다 200건 조회가 나가면 이그레스를 태운다.
      const now = Date.now();
      if (now - lastCountSyncAtRef.current < 60000) return;
      lastCountSyncAtRef.current = now;
      refreshMyPostCounts();
    });
    return () => { sub.remove(); };
  }, [refreshMyPostCounts]);

  // ─── 포그라운드 복귀 시 기기 간 내 글 동기화 ───
  // 위 카운터 동기화 effect에 얹지 않고 분리한다(같은 파일의 분리 원칙) — 실패 조건도 비용도
  // 다르다. 카운터는 숫자 컬럼 조회 1회고, 이쪽은 id 프로브 후 '빠진 글이 있을 때만' 본문 조회다.
  const lastMyRecordSyncAtRef = useRef(0);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      // ⚠️ 발행 진행 중이면 throttle 스탬프를 갱신하지 않고 빠진다 — 갱신해 버리면
      //    경합 때문에 건너뛴 이번 회차 탓에 60초 동안 동기화가 막힌다.
      if (publishInFlightRef.current > 0) return;
      // 60초 throttle — 앱 전환을 반복할 때마다 프로브가 나가면 이그레스를 태운다.
      // (프로필 당겨서 새로고침은 사용자 의도라 이 throttle을 거치지 않는다)
      const now = Date.now();
      if (now - lastMyRecordSyncAtRef.current < 60000) return;
      lastMyRecordSyncAtRef.current = now; // 먼저 창을 잡아 동시 진입을 막고
      syncMyRecords().then((res) => {
        // 성공 회차만 60초를 소모한다. 프로브 실패(네트워크)·가드 건너뜀은 짧은 창(10초)만
        // 쓴다 — 지하철에서 한 번 실패했다고 다음 1분을 통째로 버리면 안 된다.
        if (res !== 'ok') lastMyRecordSyncAtRef.current = Date.now() - 50000;
      });
    });
    return () => { sub.remove(); };
  }, [syncMyRecords]);

  // ─── 기존 기록 사진 소급 영속화 (앱 시작 후 1회) ───
  // persistRecordPhotos가 blogBlocks를 처리하지 않던 시절 발행된 블로그 글은 사진·영상이
  // 아직 OS 캐시 URI다 — 파일이 살아있는 동안 영속 폴더로 구조한다(캐시 정리 전이 골든타임).
  // 이미 영속화된 기록은 persist가 전부 스킵해 변경 없이 끝난다(비용 무시 가능).
  const photoRescueRanRef = useRef(false);
  useEffect(() => {
    if (!hydrated || photoRescueRanRef.current) return;
    photoRescueRanRef.current = true;
    const rescue = async (list: TravelRecord[], apply: (id: string, ch: Partial<TravelRecord>) => void) => {
      for (const r of list) {
        if (r.isMyPost === false || !r.blogBlocks?.length) continue;
        const ch = await persistRecordPhotos(r).catch(() => ({} as Partial<TravelRecord>));
        if (Object.keys(ch).length > 0) apply(r.id, ch);
      }
    };
    rescue(recordsLiveRef.current, (id, ch) =>
      setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, ...ch } : r)))
    );
    rescue(drafts, (id, ch) =>
      setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...ch } : d)))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // ─── 잘못 불러와진 '북한 여행 카드' 소급 정리 ───
  // 국가 판정이 110m 폴리곤을 쓰던 시절, 파주 임진각·도라산역 등 남측 접경지 사진이
  // North Korea로 판정돼 가본 적 없는 북한 여행 카드가 만들어졌다. 폴리곤은
  // utils/countryLocate에서 10m(data/koreaBorder10m)로 고쳤지만 이미 만들어진 카드는 남는다.
  //
  // 삭제는 **기존 `deleteRecord`를 그대로 호출**한다. 새 삭제 경로를 짜면 안 된다 —
  // deleteRecord가 여행 그룹 분리(detachRecordsFromTripGroups), 지구본 대표사진 정리,
  // 서버 게시물 tombstone(deletePost), Storage 정리를 이미 전부 한다.
  //
  // ⚠️ 카드(트립 그룹)는 **직접 tombstone한다.** 아래 push effect의 행 diff에 기대면 안 된다 —
  //    그 diff의 `gone`은 `lastPushedRef`(useRef, **앱 실행마다 빈 맵**)의 키에서만 뽑는데,
  //    이 정리는 `hydrated` 직후, 즉 이 기기가 이번 세션에 카드를 한 번도 push하기 전에 돈다.
  //    그래서 `gone`은 항상 빈 배열이고 서버 행은 영구 생존한다. 그 상태로 두면 같은 마운트의
  //    복원 effect가 `syncTripCards`로 그 행을 `missing`으로 되받아 **멤버 기록이 없는 유령
  //    카드**로 되살린다(`toLocalTripCard`는 멤버 실존을 검사하지 않는다). (2026-09-09 QA F2)
  //
  // ⚠️ **tombstone이 먼저, 삭제가 나중이다.** 반대 순서로 하면 재시도가 영구 불가능해진다:
  //    `deleteRecord`는 성공했는데 `tombstoneTripCards`만 실패하면(권한·네트워크) 기록이
  //    로컬에서도 서버에서도 사라져 다음 실행의 `targets`가 빈 배열이 되고, 서버 카드 행만
  //    영원히 남는다. 이 저장소는 정확히 그 계열의 사고 전력이 있다 — grant update 목록에
  //    `deleted_at`이 없어 조용한 permission denied가 났다(그 경우 실패율은 드문 게 아니라 100%다).
  //    tombstone을 먼저 걸고 성공했을 때만 지우면, 실패한 회차는 로컬 기록이 그대로 남아
  //    다음 실행에 같은 대상이 다시 잡힌다.
  //
  // ⚠️ 영속 플래그(스키마 번호)를 두지 않는다 — 매 실행마다 도는 **멱등** 정리다.
  //    ① 다른 기기에서 동기화로 뒤늦게 넘어온 북한 카드도 잡아야 하고
  //    ② 1회 스캔이 O(n) 필드 3개 비교뿐이라 `records`가 바뀔 때마다 돌아도 무시할 수준이다.
  //    무기한 삭제가 되지 않도록 막는 것은 플래그가 아니라 `KP_CLEANUP_CUTOFF_MS`다 —
  //    커트오프 뒤에 생기는 KP 기록은 지오코딩이 확인한 **진짜 방북**이라 건드리면 안 된다
  //    (외국인 사용자는 실제로 북한에 갈 수 있다). 근거는 utils/kpImportCleanup 주석 참조.
  //    대상이 0건이면 setState를 한 번도 부르지 않으므로 리렌더 루프도 없다.
  useEffect(() => {
    if (!hydrated) return;
    const targets = findWronglyImportedKpRecords(records);
    if (targets.length === 0) return; // 정상 상태 — 아무 것도 하지 않는다(setState 0회)
    const targetSet = new Set(targets);
    // 이번 삭제로 멤버가 0이 되는 카드 = deleteRecord가 로컬에서 폐기할 카드. 미리 뽑아둔다.
    // `!g.stay`는 방어로 남긴다. 멤버 0인 진행 중 체류 카드를 거르는 일은 옆의
    // `g.records.length > 0`이 이미 하지만, 이 조건이 막는 것은 다른 경우다 —
    // **멤버가 전부 정리 대상인 체류 카드**(체류국 이름이 'KP'여야 성립하므로 도달 가능성은
    // 사실상 0). 그런 카드를 tombstone하면 체류 상태 메타가 유실되고, 반대로
    // `detachRecordsFromTripGroups`(:1130)에는 stay 예외가 없어 로컬에서는 폐기되므로
    // 좁은 유령 카드 구멍이 남는다. 그 구멍을 넓히지 않으려고 여기서는 대상에서 뺀다.
    const doomedCards = tripGroups
      .filter((g) => !g.stay && g.records.length > 0 && g.records.every((rid) => targetSet.has(rid)))
      .map((g) => g.id);
    if (__DEV__) {
      console.log(`[kpCleanup] 북한 표지 기록 ${targets.length}건 · 카드 ${doomedCards.length}장 삭제`);
    }
    const purge = () => {
      for (const id of targets) deleteRecord(id);
      if (doomedCards.length === 0) return;
      for (const id of doomedCards) lastPushedRef.current.delete(id);
      // ⚠️ 한 번 더 지운다. tombstone과 삭제 사이에 같은 마운트의 `syncTripCards`가
      //    이 카드를 `missing`으로 되받아 로컬에 되살렸을 수 있다.
      setTripGroups((prev) => {
        const next = prev.filter((g) => !doomedCards.includes(g.id));
        return next.length === prev.length ? prev : next; // 헛 리렌더 방지
      });
    };
    // 지울 카드가 없으면(기록만 있는 경우) 서버에 걸 것도 없다. Supabase 미설정 빌드도 마찬가지 —
    // `tombstoneTripCards`는 `!supabase`면 무조건 false를 돌려주므로(services/tripState.ts),
    // 성공을 기다리면 로컬 전용 빌드에서 정리가 영영 안 돈다.
    if (doomedCards.length === 0 || !isSupabaseConfigured) { purge(); return; }
    tombstoneTripCards(doomedCards)
      .then((ok) => { if (ok) purge(); }) // 실패하면 아무것도 지우지 않는다 → 다음 실행에 재시도
      .catch(() => {});
    // 잔여 위험 두 가지:
    //  ① 상대 기기가 우리 tombstone이 서버에 쓰이기 **전에** 프로브를 마쳤으면 그쪽에 유령
    //     카드가 잠시 남는다. 그 기기의 다음 pull이 `deleted_at`을 보고 지우므로 자연 수렴한다.
    //  ② 비로그인 상태에서는 `tombstoneTripCards`가 uid를 못 얻어 false다 → 정리가 로그인
    //     이후로 미뤄진다. 지우지 않고 미루는 쪽이 서버 행을 남긴 채 지우는 것보다 안전하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, records, tripGroups]);

  // ─── 여행 카드 서버 백업 + 행 단위 push (기기 간 동기화) ───
  // 로컬이 원본. 변경이 잦으므로 4초 디바운스로 마지막 상태만 올린다(실패는 조용히 — 다음 변경 때 재시도).
  //
  // 여기서 두 곳에 쓴다(dual-write):
  //   ① legacy `user_trip_state` — 사용자당 1행 통째 백업. **옛 번들 기기가 이 경로로만
  //      복원하므로 계속 쓴다.** 은퇴 조건은 services/tripState.ts의 saveTripState 주석 참조.
  //   ② 신규 `user_trip_cards` — 카드 1장 = 1행. 아래 diff로 **바뀐 카드만** 올리고
  //      **사라진 카드는 tombstone**을 찍는다.
  //
  // ⚠️ 왜 15곳의 setTripGroups 호출부를 건드리지 않고 diff로 하는가: 카드는 삭제·병합·흡수·
  //    빈 카드 폐기 등 여러 경로에서 사라진다. 각 호출부에 push/tombstone을 심으면 반드시
  //    한 군데를 빠뜨리고, 빠뜨린 경로는 **다른 기기에 유령 카드로 영구히 남는다.**
  //    "현재 상태 vs 마지막으로 서버에 올린 상태"를 비교하면 경로를 몰라도 전부 잡힌다.
  const backupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 복원 시도가 끝나기 전에는 백업하지 않는다 — 재설치 직후/계정 전환 직후의 빈 상태가
  // 서버 백업을 덮어써 파괴하는 경합 방지. 복원 effect가 끝나면 true.
  const tripBackupReadyRef = useRef(false);
  /**
   * cardId → **서버가 가지고 있다고 아는 사본의 지문**(tripCardJson).
   *
   * ⚠️ **이 맵이 이번 구현의 단일 최대 위험 지점이다.** tombstone 대상은 "이 맵에는 있는데
   *    지금 tripGroups에는 없는 카드"로 뽑는데, 계정을 전환하면 tripGroups가 통째로 비므로
   *    맵을 안 비우면 **이전 계정의 카드 전체에 tombstone을 쏜다(대량 오삭제).**
   *    그래서 `resetRecords`가 이 맵을 반드시 비운다. 그리고 세션 시작 시점에는 비어 있으므로
   *    (`hydrated` 전에는 effect 자체가 돌지 않는다) 앱 시작 직후의 빈 tripGroups로
   *    tombstone이 나가는 경로도 없다 — 뺄 게 있어야 뺀다.
   */
  const lastPushedRef = useRef<Map<string, string>>(new Map());
  /**
   * 마지막으로 **성공적으로 올린** legacy(user_trip_state) 페이로드의 서명.
   * 같은 내용을 두 번 올리지 않기 위한 것이며, 실패한 회차는 기록하지 않아 다음에 재시도된다.
   * 계정 경계(`resetRecords`)에서 비운다 — 서명이 계정별로 다르므로 남겨도 실무상 안전하지만,
   * "이전 계정의 상태를 근거로 새 계정의 백업을 건너뛴다"는 모양 자체를 남기지 않는다.
   */
  const lastLegacySavedRef = useRef<string>('');
  /**
   * push effect를 한 번 더 깨우는 신호. push는 이 effect 안에서만 나가는데, effect의 deps는
   * 상태(tripGroups·records·tripSession)뿐이라 **상태 변화 없이 '지금 밀어야 하는' 상황**
   * — 복원 시도가 끝나 게이트가 열린 직후, pull이 "서버에 없는 로컬 카드"를 발견한 직후 —
   * 에는 effect가 다시 돌지 않는다. 그 두 곳에서 이 카운터를 올린다.
   * (헛돌아도 안전하다: diff에 변화가 없으면 아무 요청도 안 나간다.)
   */
  const [tripPushNudge, setTripPushNudge] = useState(0);
  useEffect(() => {
    if (!hydrated || !isSupabaseConfigured) return;
    if (!tripBackupReadyRef.current) return;
    // 완전 빈 상태는 백업하지 않는다 — 재설치/로그인 직후의 빈 로컬이 서버 백업을 파괴하는
    // 최후 방어선(베타 실사고: 카드 전체 유실, 2026-07-10). 마지막 카드를 지운 경우 서버에
    // 직전 백업이 남는 트레이드오프는 전체 유실보다 안전하다.
    // ⚠️ 이 가드는 신규 경로에도 그대로 걸린다 — 빈 상태에서는 tombstone도 나가지 않는다.
    //    "마지막 카드 1장을 지웠다"가 전파되지 않는 대가가 있지만, 빈 로컬이 상대 기기의
    //    카드를 전부 지우는 사고보다 훨씬 싸다(카드가 1장이라도 남아 있으면 정상 전파된다).
    if (tripGroups.length === 0 && !tripSession) return;
    if (backupTimerRef.current) clearTimeout(backupTimerRef.current);
    backupTimerRef.current = setTimeout(() => {
      if (!tripBackupReadyRef.current) return; // 타이머 대기 중 재무장(rearm)된 경우 취소
      const toRemote = (rid: string) => records.find((r) => r.id === rid)?.remoteId ?? rid;
      // 카드 1장 직렬화는 legacy·신규가 **같은 함수**를 쓴다(규칙이 두 벌로 갈리지 않게)
      const payloads = tripGroups.map((g) => serializeTripCard(g, toRemote));

      // ① legacy 통째 백업 (세션도 여기에만 실린다 — 세션은 기기 로컬 개념이라 행 동기화 대상이 아니다)
      //
      // ⚠️ **내용이 바뀐 경우에만 보낸다.** 안 그러면 카드 1건 수정마다 요청이 2번 나간다:
      //    upsert 성공 → serverUpdatedAt 심기(setTripGroups) → deps 변경 → 4초 뒤 타이머
      //    재발화 → 같은 legacy payload를 또 올린다(카드 diff는 비어 있어 신규 경로는 조용하다).
      //    `serverUpdatedAt`은 payload에 안 실리므로 그 2회차의 서명은 1회차와 정확히 같다.
      //    성공했을 때만 서명을 기록한다 — 실패한 회차를 기록하면 다음 변경까지 재시도가 없다.
      const legacySig = JSON.stringify({ groups: payloads, session: tripSession });
      if (legacySig !== lastLegacySavedRef.current) {
        saveTripState({ groups: payloads, session: tripSession })
          .then((ok) => { if (ok) lastLegacySavedRef.current = legacySig; })
          .catch(() => {});
      }

      // ② 행 단위 diff
      const nextSnap = new Map<string, string>();
      const changed: { cardId: string; data: TripCardPayload }[] = [];
      for (const p of payloads) {
        const json = tripCardJson(p);
        nextSnap.set(p.id, json);
        if (lastPushedRef.current.get(p.id) !== json) changed.push({ cardId: p.id, data: p });
      }
      // 사라진 카드 = 마지막으로 올린 목록에는 있는데 지금은 없는 것.
      // ⚠️ 로컬에 없다고 무조건 지우는 게 아니다 — **이 기기가 직접 올린 적 있는 카드**만 대상이다.
      const gone = Array.from(lastPushedRef.current.keys()).filter((id) => !nextSnap.has(id));

      if (changed.length > 0) {
        upsertTripCards(changed)
          .then((stamps) => {
            if (!stamps) return; // 실패 — 지문을 갱신하지 않는다(다음 변경 때 통째로 재시도)
            for (const c of changed) {
              const json = nextSnap.get(c.cardId);
              if (json !== undefined) lastPushedRef.current.set(c.cardId, json);
            }
            // 서버가 돌려준 시각을 기준선으로 심는다 — 안 심으면 **자기가 방금 올린 카드가**
            // 다음 pull에서 stale로 잡혀 계속 다시 내려온다(에코).
            // ⚠️ 기기 시계(Date.now())는 절대 쓰지 않는다. 서버가 준 값만 심는다.
            if (stamps.size > 0) {
              setTripGroups((prev) => {
                let dirty = false;
                const next = prev.map((g) => {
                  const at = stamps.get(g.id);
                  if (at === undefined || g.serverUpdatedAt === at) return g;
                  dirty = true;
                  return { ...g, serverUpdatedAt: at };
                });
                return dirty ? next : prev; // 헛 리렌더·무한 루프 방지
              });
            }
          })
          .catch(() => {});
      }
      if (gone.length > 0) {
        tombstoneTripCards(gone)
          .then((ok) => {
            // 성공했을 때만 지문에서 뺀다 — 실패하면 다음 회차에 다시 시도해야 한다.
            // (성공 후 남겨두면 매 회차 같은 카드에 tombstone을 다시 쏜다 = 재-tombstone 루프)
            if (ok) for (const id of gone) lastPushedRef.current.delete(id);
          })
          .catch(() => {});
      }
    }, 4000);
    return () => { if (backupTimerRef.current) clearTimeout(backupTimerRef.current); };
  }, [hydrated, tripGroups, tripSession, records, tripPushNudge]);

  // 재설치/새 기기 복원 — 로컬에 카드가 전혀 없고 서버 백업이 있으면 1회 복원.
  // 로컬 카드가 있으면 로컬이 원본이므로 절대 덮어쓰지 않는다.
  // 계정 전환(resetRecords) 시 nonce 증가로 새 계정에 대해 재시도한다.
  //
  // ⚠️ 카드 행 동기화(user_trip_cards)가 생긴 뒤 이 복원은 **legacy 1회성 시드**로 격하된다.
  //    "신규 표에 살아 있는 카드가 하나라도 있으면 여기서 만들지 않고 syncTripCards에 맡긴다."
  //    왜 그래야 하는가: legacy 백업은 옛 번들이 남긴 낡은 사본일 수 있는데, 그걸 먼저 심으면
  //    그 카드들에는 `serverUpdatedAt`(기준선)이 없어 **stale로도 안 잡힌다.** 그러면 서버의
  //    최신 카드가 영영 안 내려오고, 반대로 첫 push가 낡은 사본을 서버에 덮어써 다른 기기의
  //    최신 카드까지 되돌린다. 신규 표가 비어 있을 때(=아직 아무도 push한 적 없음)만 시드한다.
  const tripRestoreTriedRef = useRef(false);
  // 계정 세대(epoch) — resetRecords/rearm마다 증가. in-flight 복원 async가 계정 전환을
  // 가로질러 이전 계정의 백업을 새 계정 상태에 적용하거나(카드 혼입), tried를 선점해
  // 새 계정 복원을 스킵시키는 경합 방지(2026-07-20 감사 M1).
  const tripRestoreEpochRef = useRef(0);
  const [tripRestoreNonce, setTripRestoreNonce] = useState(0);
  useEffect(() => {
    if (!hydrated || !isSupabaseConfigured || tripRestoreTriedRef.current) return;
    const epoch = tripRestoreEpochRef.current; // 이 시도가 속한 계정 세대
    (async () => {
      // 로그인 전(세션 없음)에는 '시도'로 치지 않는다 — 스토어는 로그인 전에 마운트되므로
      // 여기서 tried 처리하면 로그인 후 복원이 영영 안 돌고, 백업이 열리면서 빈 tripGroups가
      // 서버 백업을 덮어써 카드가 전부 사라진다(베타 실사고, 2026-07-10).
      // 로그인 완료 후에는 useAccountBoundary가 rearmTripRestore()로 재시도시킨다.
      const uid = await getMyUserId().catch(() => null);
      if (epoch !== tripRestoreEpochRef.current) return; // 계정 전환됨 — 이 시도 폐기
      if (!uid || tripRestoreTriedRef.current) return;
      tripRestoreTriedRef.current = true;
      if (tripGroupsRef.current.length > 0) {
        tripBackupReadyRef.current = true; // 로컬이 원본 — 백업 즉시 허용
        // 기존 사용자(카드를 이미 가진 기기)가 이 갈래로 온다. 시드 push를 여기서 깨운다
        // (아래 finally의 nudge와 같은 이유 — ref 변경만으로는 effect가 다시 돌지 않는다).
        setTripPushNudge((n) => n + 1);
        // ⚠️ 이 기기에 카드가 있어도 **서버에는 다른 기기가 만든/고친 카드가 있을 수 있다.**
        //    앱 시작 경로에는 카드 pull 트리거가 여기 말고 없다(AppState 'active'는 시작 시
        //    발화하지 않는다) — 안 부르면 앱을 껐다 켠 사용자는 백그라운드 왕복이나
        //    프로필 당겨서 새로고침 전까지 상대 기기의 카드를 못 본다.
        //    실패해도 조용하다(syncTripCards는 throw하지 않는다).
        await syncTripCards();
        return;
      }
      try {
        // 신규 표를 먼저 본다(위 ⚠️ 참조). 프로브 실패(null)면 legacy 시드로 진행한다 —
        // "확인할 수 없다"를 "비어 있다"로 읽으면 안 되지만, 여기서는 카드가 아예 없는
        // 상태이므로 legacy 시드가 최악이어도 옛 사본을 되살리는 정도이고, 반대로 아무것도
        // 안 하면 오프라인 재설치 사용자가 카드를 통째로 잃는다.
        // ⚠️ withTimeout + catch 필수 — 이 await가 hang하면 finally에 못 가
        //    `tripBackupReadyRef`가 그 세션 내내 false로 남아 백업·push는 물론
        //    drainPendingLinks까지 통째로 잠긴다(카드 편입이 영영 안 된다).
        const cardRefs = await withTimeout(probeTripCards(), 12000).catch(() => null);
        if (epoch !== tripRestoreEpochRef.current) return; // 전환됨 — 이전 계정 데이터 미적용
        if (cardRefs && cardRefs.some((c) => !c.deletedAt)) {
          // ★ 신규 표가 원본이다. legacy를 심지 않는 대신 **여기서 바로 받아온다.**
          //   이 호출이 없으면 재설치·기기 변경·계정 전환 첫 실행에서 카드가 0장이다
          //   (legacy는 게이트에 막히고, syncTripCards의 다른 트리거는 앱 시작에 안 걸린다).
          //   이미 받아둔 프로브를 넘겨 같은 조회를 두 번 하지 않는다.
          await syncTripCards(cardRefs);
          return;
        }

        const backup = await fetchTripState();
        if (epoch !== tripRestoreEpochRef.current) return; // 전환됨 — 이전 계정 백업 미적용
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
        // 전환된 세대의 잔존 async가 새 계정의 백업 잠금을 조기 해제하지 않게 세대 일치 시에만
        if (epoch === tripRestoreEpochRef.current) {
          tripBackupReadyRef.current = true; // 복원 시도 완료(성공/실패 무관) 후에만 백업 허용
          // 게이트가 열린 것은 ref 변경이라 push effect의 deps를 건드리지 않는다 — 여기서
          // 한 번 깨워야 기존 사용자의 카드가 신규 표로 **처음 올라간다**(시드). 이 신호가
          // 없으면 다음 상태 변화(기록 추가·카운트 동기화 등)까지 시드가 미뤄진다.
          setTripPushNudge((n) => n + 1);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, tripRestoreNonce]);

  // 로그인 완료 직후 여행카드 복원 재무장 — 앱 마운트 시점(로그인 전)에 복원이 스킵된 경우 회수.
  // 재시도 전까지 백업도 잠가 빈 상태가 서버 백업을 덮어쓰지 못하게 한다.
  const rearmTripRestore = useCallback(() => {
    tripRestoreTriedRef.current = false;
    tripBackupReadyRef.current = false;
    tripRestoreEpochRef.current += 1; // in-flight 복원 async 무효화 (감사 M1)
    setTripRestoreNonce((n) => n + 1);
  }, []);

  // ─── 기록 부가상태 집합 6종의 행 단위 push (user_state_flags, 기기 간 동기화) ───
  //
  // 로컬이 원본. 변경이 잦으므로 4초 디바운스로 마지막 상태만 올린다(실패는 조용히 — 다음
  // 변경 때 재시도). **legacy `user_app_state` 통째 백업은 그대로 둔다**(AppStateSync가 계속
  // 올린다) — 옛 번들 기기가 그 경로로만 복원하고, 설정 스칼라·cardOrder·moments·countryCovers는
  // 여전히 그쪽이 유일한 경로다(이번 범위 밖, 알려진 한계).
  //
  // ⚠️ 왜 6개 집합의 갱신 지점(archiveRecord·toggleMute·blockUser·markSnapViewed·reportPost…)을
  //    직접 고치지 않고 diff로 하는가: 항목은 사용자 조작 말고도 여러 경로로 사라진다
  //    (기록 삭제 시 archivedIds 정리, viewedSnap 500개 트림, 계정 경계 초기화…).
  //    각 호출부에 push/tombstone을 심으면 반드시 한 군데를 빠뜨리고, 빠뜨린 경로는
  //    **다른 기기에 유령 상태로 영구히 남는다.** 카드에서 쓴 것과 같은 판단이다.
  //
  // 카드 push effect와 **일부러 분리**했다(같은 스타일, 다른 상태). 두 기능의 게이트·nudge·
  // 지문이 얽히면 한쪽 변경이 다른 쪽을 조용히 깨운다.
  const flagsBackupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * 6개 집합의 렌더 시점 미러. `syncStateFlags`(async)가 클로저에 박제된 옛 값을 보지 않게 한다
   * — `recordsLiveRef`·`tripGroupsRef`와 같은 관습이다.
   */
  const flagsLiveRef = useRef({
    archivedIds, blockedUsers, mutedHandles, viewedSnapIds, reportedPostIds, reportedCommentIds,
  });
  flagsLiveRef.current = {
    archivedIds, blockedUsers, mutedHandles, viewedSnapIds, reportedPostIds, reportedCommentIds,
  };
  /**
   * `flagMapKey(kind,itemKey)` → **서버가 가지고 있다고 아는 사본의 지문**
   * (blocked만 실제 지문, 나머지는 존재 표시 `''`).
   *
   * ⚠️ **부팅 직후에는 표식이 나갈 수 없다.** tombstone 대상은 `diffForPush`가
   *    "이 맵에는 있는데 지금 로컬에는 없는 키"로만 뽑는데, 이 맵은 **useRef라 세션 시작 시
   *    비어 있고**(영속되지 않는다) effect 자체가 `hydrated` 전에는 돌지 않는다.
   *    즉 뺄 게 없으므로 `gone`이 항상 빈 배열이다. 맵에 키가 들어가는 시점은 오직
   *    ①upsert 성공 ②pull이 "서버가 이미 갖고 있다"고 확인한 뒤이며, 둘 다 hydrate 이후다.
   *    (계정 전환은 `resetRecords`가 이 맵을 비워 같은 상태로 되돌린다.)
   */
  const lastFlagsPushedRef = useRef<Map<string, string>>(new Map());
  /**
   * **사용자가 방금 명시적으로 켠** 항목의 키(`flagMapKey` 형식). push가 성공하면 뺀다.
   *
   * ⚠️ 이 집합만이 `deleted_at: null`(revive)을 실을 자격을 갖는다 — 2026-09-10 QA H1의 수정.
   *    서버 upsert가 `deleted_at`을 건드리지 않는 것이 원칙인 이유는 **앱을 켤 때마다 나가는
   *    전량 시드 upsert가 다른 기기의 끄기를 되살리는 사고**를 구조적으로 막기 위해서인데,
   *    그 원칙만으로는 "차단 → 해제 → 재차단"의 마지막 단계가 영영 서버에 반영되지 않았다.
   *    **시드는 이 집합에 없고 사용자 행동만 여기 들어오므로**, 두 요구를 동시에 만족한다.
   *
   * ⚠️ **세션 한정 ref다(영속하지 않는다).** push 전에 앱이 죽으면 그 재추가는 다음 pull에서
   *    다시 풀린다. 좁은 창이고 **같은 동작을 한 번 더 하면 복구된다** — 고치기 전의
   *    "몇 번을 다시 차단해도 영원히 풀리는" 상태와는 다르다. 영속화하지 않은 이유는 카드
   *    지문과 같다(4초 디바운스 전에 죽은 편집이 영영 안 올라가는 대가가 더 비싸다).
   */
  const explicitFlagAddsRef = useRef<Set<string>>(new Set());
  /**
   * 위 집합에 키를 남긴다. **사용자 행동으로 항목을 켜는 지점에서만** 부른다
   * (`archiveRecord`·`blockUser`·`toggleMute`의 켜는 방향·`reportPost`·`reportComment`·
   * `markSnapViewed`). 동기화·복원·시드 경로에서는 **절대 부르지 마라** — 그 순간
   * "남이 끈 것을 되살리지 않는다"는 이 기능의 안전선이 무너진다.
   *
   * `function` 선언인 이유: 위 setter들이 소스 순서상 **먼저** 정의돼 있어 호이스팅이 필요하다.
   */
  function noteExplicitFlagAdd(kind: StateFlagKind, key: string) {
    if (!key) return;
    explicitFlagAddsRef.current.add(flagMapKey(kind, key));
  }
  /**
   * push effect를 한 번 더 깨우는 신호. **카드의 `tripPushNudge`를 재사용하지 않는다** —
   * 두 기능이 같은 신호를 공유하면 한쪽의 시드가 다른 쪽 타이머를 계속 되감는다(관심사 분리).
   * 지금 올리는 곳은 `syncStateFlags`가 "서버가 모르는 로컬 항목"을 발견했을 때 한 곳뿐이다.
   */
  const [flagsPushNudge, setFlagsPushNudge] = useState(0);
  useEffect(() => {
    if (!hydrated || !isSupabaseConfigured) return;
    // 계정 세대를 **예약 시점에** 잡는다. 4초 사이에 계정이 바뀌면(resetRecords/rearm이 세대를
    // 올린다) 아래에서 즉시 빠져나간다 — 이전 계정의 보관·차단이 새 계정 행으로 올라가는 것을
    // 막는 유일한 방어선이다(로그인 여부 자체는 서비스 함수의 `getMyUserId()`가 본다).
    const epoch = tripRestoreEpochRef.current;
    if (flagsBackupTimerRef.current) clearTimeout(flagsBackupTimerRef.current);
    flagsBackupTimerRef.current = setTimeout(() => {
      if (epoch !== tripRestoreEpochRef.current) return;
      const toRemote = (rid: string) => records.find((r) => r.id === rid)?.remoteId ?? rid;
      const localState = buildLocalFlagState(flagsLiveRef.current, toRemote);
      // 세 번째 인자가 revive 자격을 정한다 — **사용자가 방금 켠 키만** `deleted_at: null`을
      // 실어 부활시킨다(시드·에코는 자격이 없다). `explicitFlagAddsRef` 주석 참조.
      const { upserts, tombstones } = diffForPush(
        localState, lastFlagsPushedRef.current, explicitFlagAddsRef.current,
      );
      if (upserts.length === 0 && tombstones.length === 0) return; // 바뀐 게 없으면 요청 0회

      if (upserts.length > 0) {
        // blocked만 본문을 싣는다. 지문(sig)과 본문이 **같은 빌더**에서 나와야 서버가 돌려준
        // jsonb(키 순서가 재정렬된다)로 지문을 다시 만들어도 값이 맞는다.
        const byBlockedKey = new Map(
          flagsLiveRef.current.blockedUsers.map((b) => [blockedFlagKey(b), b] as const),
        );
        const rows = upserts.map((u) => ({
          kind: u.kind,
          itemKey: u.itemKey,
          data: u.kind === 'blocked'
            ? (byBlockedKey.has(u.itemKey) ? blockedFlagData(byBlockedKey.get(u.itemKey)!) : null)
            : null,
          revive: u.revive,
        }));
        upsertStateFlags(rows)
          .then((ok) => {
            if (!ok) {
              // 지문을 갱신하지 않는다(다음 변경 때 통째로 재시도) — 명시적 재추가 표시도
              // 남겨 둬야 그 회차의 revive가 유실되지 않는다.
              if (__DEV__) console.log(`[stateFlags] upsert 실패 ${rows.length}건 — 다음 변경 때 재시도`);
              return;
            }
            if (epoch !== tripRestoreEpochRef.current) return; // 전환됨 — 새 계정 맵에 심지 않는다
            for (const u of upserts) {
              lastFlagsPushedRef.current.set(flagMapKey(u.kind, u.itemKey), u.sig ?? '');
              // 부활까지 끝났으니 표시를 뗀다. 남겨 두면 이후 아무 upsert에나 계속
              // `deleted_at: null`이 실려, 나중에 **다른 기기가 끈 것을 되살릴** 수 있다.
              if (u.revive) explicitFlagAddsRef.current.delete(flagMapKey(u.kind, u.itemKey));
            }
          })
          .catch(() => {});
      }
      if (tombstones.length > 0) {
        tombstoneStateFlags(tombstones)
          .then((ok) => {
            // 성공했을 때만 지문에서 뺀다 — 실패하면 다음 회차에 다시 시도해야 한다.
            // (성공 후 남겨두면 매 회차 같은 키에 표식을 다시 쏜다 = 재-tombstone 루프)
            if (!ok) {
              if (__DEV__) console.log(`[stateFlags] tombstone 실패 ${tombstones.length}건 — 다음 회차 재시도`);
              return;
            }
            if (epoch !== tripRestoreEpochRef.current) return;
            for (const t of tombstones) lastFlagsPushedRef.current.delete(flagMapKey(t.kind, t.itemKey));
          })
          .catch(() => {});
      }
    }, 4000);
    return () => { if (flagsBackupTimerRef.current) clearTimeout(flagsBackupTimerRef.current); };
    // `records`가 deps에 있는 이유: archived의 push 키가 remoteId라, 글이 발행돼 remoteId가
    // 붙는 순간 그 항목의 키가 바뀐다(옛 로컬 id 키에는 표식이 찍혀 정리된다).
  }, [hydrated, archivedIds, blockedUsers, mutedHandles, viewedSnapIds, reportedPostIds, reportedCommentIds, records, flagsPushNudge]);

  // ─── 실시간 동기화 트리거 (user_sync_signals 구독 — 완전 동기화 5단계, 2026-09-11) ───
  //
  // 1~4단계로 글·여행 카드·부가상태가 기기 간에 전파되게 됐지만, 반영을 **당기는 트리거**는
  // ①AppState 'active' 복귀(위 :2995 effect, 60초 throttle) ②프로필 당겨서 새로고침 둘뿐이었다.
  // 그래서 두 기기를 **동시에 켜 둔 채** 쓰면 상대 기기의 변경이 화면에 영영 안 나타났다.
  // 서버 트리거가 찍어 주는 신호 행을 구독해, 새로고침 없이 그 둘과 **같은 경로**를 깨운다.
  //
  // ⚠️ **Realtime은 트리거일 뿐 데이터 경로가 아니다.** 페이로드에서 아무것도 읽지 않고
  //    (`domain`조차) 디바운스 뒤 기존 `syncMyRecords()`를 부를 뿐이다. 여기서 페이로드를
  //    병합에 쓰기 시작하면 병합 로직이 한 벌 더 생겨 1~4단계 QA 보증이 통째로 무효가 된다.
  //
  // ⚠️ **이 구독은 보강이지 대체가 아니다.** 소켓이 끊긴 사이의 이벤트는 재전송되지 않는다
  //    (`services/syncRealtime.ts` 한계 주석). 따라잡기는 여전히 위 ①②가 담당하므로 그 둘을
  //    지우면 안 된다.
  const syncBumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * "신호를 받았는데 아직 sync를 못 돌렸다" — 백그라운드에서 신호가 온 경우다.
   * 포그라운드 복귀 때 소진한다(아래 AppState 리스너).
   */
  const syncBumpPendingRef = useRef(false);
  /**
   * `syncMyRecords`를 **ref로 경유한다.** 아래 effect의 deps에 직접 넣으면 그 콜백이 재생성될
   * 때마다 구독이 끊겼다 다시 붙는데, 웹소켓 재연결 사이의 이벤트는 재전송되지 않아
   * **신호가 통째로 유실된다.** 구독은 계정 세대가 바뀔 때만 다시 걸어야 한다.
   */
  const syncMyRecordsRef = useRef(syncMyRecords);
  syncMyRecordsRef.current = syncMyRecords;
  useEffect(() => {
    if (!hydrated || !isSupabaseConfigured) return;
    let alive = true;
    let unsub: (() => void) | null = null;
    // 계정 세대를 **구독 시점에** 잡는다(카드·부가상태 push effect와 같은 관습).
    // 5초 디바운스 사이에 계정이 바뀌면 이전 계정의 신호로 새 계정 동기화를 돌리지 않는다.
    const epoch = tripRestoreEpochRef.current;

    const runSync = () => {
      if (!alive || epoch !== tripRestoreEpochRef.current) return;
      // 대기 중인 디바운스 타이머가 있으면 취소한다 — 없으면 "백그라운드 직전에 신호가 와
      // 타이머가 살아 있는 채로 복귀"한 경우에 이 리스너와 타이머가 sync를 두 번 부른다
      // (재진입 가드가 있어 무해하지만, 첫 회차가 이미 끝난 뒤라면 진짜 왕복 2회가 된다).
      if (syncBumpTimerRef.current) { clearTimeout(syncBumpTimerRef.current); syncBumpTimerRef.current = null; }
      syncBumpPendingRef.current = false;
      // ⚠️ 포그라운드 60초 throttle을 **일부러 우회한다.** 그 throttle은 AppState effect
      //    안의 지역 변수(`lastMyRecordSyncAtRef`)로만 구현돼 있고 `syncMyRecords` 자체에는
      //    없다(:2995~:3014 확인). 신호는 "상대 기기가 방금 뭔가 바꿨다"는 확정 정보라
      //    앱 전환을 반복할 때의 헛 프로브와 성격이 다르다 — 아낄 이유가 없다.
      //    폭주 방어는 ①5초 트레일링 디바운스 ②`syncMyRecordsInFlightRef` 재진입 가드
      //    ③`publishInFlightRef` 발행 경합 가드 셋이 이미 한다.
      // 실기기 에코 루프 관측용 — 이 줄이 5초 간격으로 끝없이 찍히면 write→signal→sync→write
      // 루프다(지문 가드가 서버가 돌려주는 값과 영원히 다른 필드를 물었다는 뜻).
      if (__DEV__) console.log('[syncSignal] runSync — syncMyRecords 호출');
      syncMyRecordsRef.current();
    };

    const onBump = () => {
      if (!alive) return;
      if (__DEV__) console.log('[syncSignal] bump 수신 — 디바운스 예약');
      syncBumpPendingRef.current = true;
      // 트레일링 디바운스 — 사용자의 한 동작이 서버에서 여러 신호를 만든다(글 저장 하나가
      // posts + user_trip_cards + user_state_flags 갱신으로 이어질 수 있다). 마지막 신호에서
      // 5초를 세어 한 번만 돈다. 자기 기기 발행의 **에코**도 여기서 대부분 접히고, 남는 것은
      // 위 두 가드가 흡수한다(그 회차의 sync는 서버와 로컬이 이미 같아 no-op으로 끝난다).
      if (syncBumpTimerRef.current) clearTimeout(syncBumpTimerRef.current);
      syncBumpTimerRef.current = setTimeout(() => {
        syncBumpTimerRef.current = null;
        if (!alive) return;
        // 백그라운드에서 신호가 와도(소켓이 아직 살아 있을 때) 지금 도는 건 낭비다 —
        // 화면이 없으니 반영해도 보이지 않고, OS가 곧 네트워크를 끊는다.
        // pending을 **남긴 채** 미루고, 아래 리스너가 복귀 시점에 소진한다.
        if (AppState.currentState !== 'active') return;
        runSync();
      }, SYNC_SIGNAL_DEBOUNCE_MS);
    };

    // 복귀 시 미뤄둔 신호 소진.
    // ⚠️ **중복 호출이 되지 않는 이유** — 위 :2995 effect도 'active'에서 `syncMyRecords()`를
    //    부른다. 그런데 `syncMyRecords`는 첫 줄에서 `syncMyRecordsInFlightRef`를 **동기적으로**
    //    세우고 재진입을 `'skipped'`로 되돌린다(:2595~2596). 두 리스너가 같은 틱에 불려도
    //    실제 왕복은 한 번뿐이고, 나중 것은 요청 0회로 끝난다.
    //    그럼에도 이 리스너를 둔 이유: 그쪽은 **60초 throttle**이라 직전 회차로부터 60초가
    //    안 지났으면 조용히 건너뛴다 — 그러면 미뤄둔 신호가 통째로 유실된다. 여기서만
    //    `pending`이 참일 때 한정으로 그 창을 메운다(신호가 없었으면 아무 일도 하지 않는다).
    const appSub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' || !alive) return;
      if (!syncBumpPendingRef.current) return;
      runSync();
    });

    // 로그인 전(세션 없음)에는 uid가 null이라 구독하지 않는다. 로그인이 확정되면
    // `useAccountBoundary`가 `rearmTripRestore()`를 부르고, 그것이 `tripRestoreNonce`를
    // 올려 이 effect를 다시 돌린다(아래 deps 주석 참조).
    getMyUserId()
      .then((uid) => {
        if (!alive || !uid) return;
        if (epoch !== tripRestoreEpochRef.current) return; // 계정 전환됨 — 이 구독 폐기
        unsub = subscribeSyncSignals(uid, onBump);
      })
      .catch(() => {});

    return () => {
      alive = false;
      appSub.remove();
      if (syncBumpTimerRef.current) { clearTimeout(syncBumpTimerRef.current); syncBumpTimerRef.current = null; }
      syncBumpPendingRef.current = false; // 이전 계정의 미뤄둔 신호를 새 계정으로 넘기지 않는다
      unsub?.(); // await 중이라 아직 null일 수 있다 — 그때는 위 alive 플래그가 구독 자체를 막는다
    };
    // 재구독 신호로 `tripRestoreNonce`를 쓴다 — 새 state를 만들지 않은 이유:
    //   · `resetRecords()`(계정 전환)와 `rearmTripRestore()`(로그인 확정) **둘 다** 이 값을
    //     올린다(:1981, :3333). 구독을 다시 걸어야 하는 시점이 정확히 그 둘이다.
    //   · `tripRestoreEpochRef`는 ref라 effect를 다시 돌리지 못한다(그래서 세대 검사 전용).
    //   · 카드 복원 effect(:3255)가 이미 같은 쌍(epoch ref + nonce state)을 쓰고 있어
    //     관습이 하나로 유지된다.
    // (`tripRestoreNonce`는 본문에서 읽지 않는 '신호 전용' deps다. eslint는 이 조합에
    //  경고하지 않으므로 disable 주석을 달지 않는다 — 달면 unused directive 경고가 난다.)
  }, [hydrated, tripRestoreNonce]);

  // ── 국가 대표사진 ──
  // 국가의 대표사진 '기록'을 찾는다: 핀 우선(핀 기록이 살아있을 때만), 없으면 기존 최신순 폴백.
  const getCountryPhotoRecord = useCallback((countryName: string): CountryCover | null => {
    const aliases = koAliases(countryName);
    for (const a of aliases) {
      const pin = countryCovers[a];
      if (pin && records.some((r) => r.id === pin.recordId)) return pin; // 핀 유효
    }
    const matchingRecords = records.filter((r) => matchesCountry(r, countryName));
    for (const r of matchingRecords) {
      for (const a of aliases) {
        if (r.perCountryData?.[a]?.representativePhoto) return { recordId: r.id, uri: r.perCountryData[a]!.representativePhoto! };
      }
      if (aliases.includes(r.countryName ?? '') && r.representativePhoto) return { recordId: r.id, uri: r.representativePhoto };
      if (r.viewType === 'cut' && r.cutPhoto?.previewUri) return { recordId: r.id, uri: r.cutPhoto.previewUri };
      if (r.viewType === 'snap' && r.snapBackUri) return { recordId: r.id, uri: r.snapBackUri };
      if (r.medias && r.medias.length > 0) return { recordId: r.id, uri: r.medias[0] };
    }
    return null;
  }, [countryCovers, records]);

  const getCountryPhoto = useCallback(
    (countryName: string): string | null => getCountryPhotoRecord(countryName)?.uri ?? null,
    [getCountryPhotoRecord],
  );

  // 국가 대표사진 핀 설정. 키는 대표 별칭 하나로 저장.
  const setCountryCover = useCallback((countryName: string, recordId: string, uri: string) => {
    const key = koAliases(countryName)[0] ?? countryName;
    if (!key || !recordId || !uri) return;
    setCountryCovers((prev) => ({ ...prev, [key]: { recordId, uri } }));
  }, []);

  // ── 앱 상태 통합 백업(user_app_state) — 기록 부가상태 스냅샷 ──
  // 기록 본문은 posts, 여행카드는 user_trip_state가 담당하므로 여기선 부가상태만.
  const exportLocalStateBackup = (): Record<string, unknown> => ({
    archivedIds, blockedUsers, reportedPostIds, reportedCommentIds, mutedHandles, viewedSnapIds, countryCovers,
  });
  const applyLocalStateBackup = (b: Record<string, unknown>) => {
    const v = b as any;
    if (Array.isArray(v.archivedIds)) setArchivedIds(v.archivedIds);
    if (Array.isArray(v.blockedUsers)) setBlockedUsers(v.blockedUsers);
    if (Array.isArray(v.reportedPostIds)) setReportedPostIds(v.reportedPostIds);
    if (Array.isArray(v.reportedCommentIds)) setReportedCommentIds(v.reportedCommentIds);
    if (Array.isArray(v.mutedHandles)) setMutedHandles(v.mutedHandles);
    if (Array.isArray(v.viewedSnapIds)) setViewedSnapIds(v.viewedSnapIds);
    if (v.countryCovers && typeof v.countryCovers === 'object' && !Array.isArray(v.countryCovers)) setCountryCovers(v.countryCovers as Record<string, CountryCover>);
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
    return <View style={{ flex: 1, backgroundColor: '#0A0A0F' }} />;
  }

  return (
    <RecordContext.Provider value={{ records, addRecord, updateRecord, deleteRecord, toggleLike, markSnapViewed, viewedSnapIds, archivedIds, archiveRecord, unarchiveRecord, blockedUsers, blockUser, unblockUser, isBlocked, reportedPostIds, reportPost, reportedCommentIds, reportComment, mutedHandles, toggleMute, isMuted, neighbors, requestNeighbor, cancelNeighborRequest, acceptNeighbor, declineNeighbor, removeNeighbor, outgoingNeighborRequests, incomingNeighborRequests, isNeighbor, isNeighborRequested, isNeighborRequestReceived, refreshNeighbors, commentsByPost, addComment, toggleCommentLike, deleteComment, tripGroups, addTripGroup, deleteTripGroup, updateTripGroup, mergeTripGroups, activeStayGroup, startStay, endStay, absorbIntoStay, stayPromptCountry, setStayPromptCountry, drafts, saveDraft, updateDraft, deleteDraft, publishDraft, addImportedAlbum, resetRecords, currentViewer, setCurrentViewer, feedPosts, refreshFeed, loadMoreFeed, feedHasMore, feedLoadingMore, feedInitialLoading, refreshComments, refreshMyPostCounts, refreshPostCounts, hydrateMyRecords, syncMyRecords, rearmTripRestore, exportLocalStateBackup, applyLocalStateBackup, rebackupAlbumOriginals, countryCovers, getCountryPhoto, getCountryPhotoRecord, setCountryCover }}>
      {children}
    </RecordContext.Provider>
  );
}

export function useRecords() {
  const ctx = useContext(RecordContext);
  if (!ctx) throw new Error('useRecords must be used within RecordProvider');
  return ctx;
}
