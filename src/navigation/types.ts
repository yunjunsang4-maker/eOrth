/**
 * 네비게이션 라우트 파라미터 타입 정의
 *
 * 모든 navigate/reset 호출과 route.params 접근이 컴파일 타임에 검증된다.
 * 라우트를 추가하면 RootStackParamList(스택) 또는 TabParamList(탭)에 함께 등록할 것.
 *
 * 맨 아래 declare global 덕분에 제네릭 없는 useNavigation()도 자동으로 타입을 갖는다.
 */

import type { NavigatorScreenParams, CompositeScreenProps } from '@react-navigation/native';
import type { StackScreenProps } from '@react-navigation/stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { TravelRecord, RecordViewType } from '../store/recordStore';
import type { CutLayout } from '../constants/cutFrames';
import type { ImportTrip } from '../screens/ImportPhotoSelectScreen';
import type { RecoBlogSeed } from '../services/photoAI/recoTypes';

// ─── 공용 파라미터 페이로드 ───

/** 기록 작성 화면들로 전달되는 사전 선택 국가 */
export interface SelectedCountryParam {
  name: string;
  code?: string;
  flag?: string;
  region?: string;   // 대륙 기록 시 지역명 (예: '도쿄')
  regionEn?: string;
}

/** DM 화면으로 전달되는 메이트 정보 */
export interface DMFriendParam {
  name: string;
  handle: string;
  emoji: string;
  photo?: string; // 프로필 사진 URL — DM 헤더/버블 아바타용
  id?: string;
  online?: boolean;
  lastMessage?: string;
  time?: string;
  unread?: number;
}

/** 네컷 촬영 → 여행 정보 입력으로 전달되는 합성 결과 */
export interface CutPhotoParam {
  layout: CutLayout;
  frameId: string;
  frameColor?: string;
  photos: string[];
  // 슬롯별 사진 조정값(이동/확대) — 피드·상세의 라이브 재합성(CutPhotoCanvas)이 구도를 재현하는 데 필요
  transforms?: ({ scale: number; tx: number; ty: number } | null)[];
  previewUri: string;
  noLogo?: boolean; // 프리미엄(스트립 로고 제거) 작성 — 생성 시점에 박제
  stamp?: { date?: string; text?: string; fontId?: string }; // 하단 여백 날짜·문구 스탬프
  frameImage?: string; // 프레임 배경 사진 uri (프리미엄)
}

/** 프로필 여행 카드 → 여행 상세로 전달되는 썸네일 */
export interface TripThumbnailParam {
  id: string;
  emoji: string;
  title: string;
  country: string;
  countryFlag: string;
  date: string;
  color: string;
  records: { id: string; viewType: string }[];
}

/** 여행 카드에서 새 기록 추가 시 자동 적용할 여행 정보.
 *  기간(YYYY.MM.DD)에 더해 필수(동행자·별점)·상세(경비·날씨·항공편·키워드) 정보까지
 *  기존 기록에서 모아 넘긴다 — 같은 여행의 다른 형식 기록을 다시 입력 없이 잇는 용도. */
export interface TripPrefillParam {
  startDate?: string;
  endDate?: string;
  rating?: number;
  companions?: string[];
  companionFriends?: string[];
  budget?: { amount: number; currency: string };
  weather?: string;
  flightType?: string;
  keywords?: string[];
}

/** AI 형식 추천 카드 수락 시 작성 화면으로 넘기는 프리필.
 *  cardId: 사용 로그 연결용(v2 edit_after_accept 예약 — 현재 미소비).
 *  즉 지금은 어떤 작성 화면도 이 값을 읽지 않는다. 형식별 페이로드가 달라도 항상 함께
 *  넘겨 두는 이유는, 나중에 '수정 후 저장' 로그를 원 카드에 되짚을 때 화면 계약을 바꾸지
 *  않기 위해서다. 미소비라고 지우면 그 확장이 파라미터 변경을 동반하게 된다. */
export interface RecoPrefillFeedParam { cardId: string; medias: string[] }
export interface RecoPrefillBlogParam { cardId: string; seeds: RecoBlogSeed[] }
export interface RecoPrefillCutParam { cardId: string; photos: string[] }

export type StatsDetailType = 'world' | 'yearly' | 'region' | 'countries' | 'rating';

// ─── 탭 ───

export type TabParamList = {
  MainTab: { startTutorial?: boolean | 'replay' } | undefined; // startTutorial: 기록 완성 후 메인 튜토리얼 자동 실행, 'replay'=설정에서 다시 보기(1회 게이트 무시)
  StatsTab: undefined;
  SocialTab: undefined;
  ProfileTab: { openBadgeList?: boolean } | undefined; // openBadgeList: 배지 획득 토스트 탭 시 배지 리스트 모달 자동 열기
};

// ─── 루트 스택 ───

export type RootStackParamList = {
  Splash: undefined;
  AppIntro: undefined;
  Login: undefined;
  ResetPassword: undefined;
  BasicInfo: undefined;
  // from: 'profile' = 앱 내(프로필) 진입 — 완료 후 온보딩처럼 메인+튜토리얼로 리셋하지 않고 되돌아간다
  TravelImport: { from?: 'profile' } | undefined;
  MateRecoConsent: undefined;
  ImportPhotoSelect: { trips: ImportTrip[]; from?: 'profile' };
  // mode: 'quick' = 사진첩 없이 카드만 즉시 만든 경로. 이때 photoCount는 '복사한 장수'가
  // 아니라 '카드에 연결해 둔(바로 꺼내 쓸 수 있는) 분석 사진 장수'라 완료 문구가 다르다.
  ImportComplete: { tripCount: number; photoCount: number; countries: { flag: string; name: string }[]; from?: 'profile'; mode?: 'quick' };
  Main: NavigatorScreenParams<TabParamList> | undefined;
  Country: { name: string; flag: string } | undefined;
  AccountSettings: undefined;
  NotificationSettings: undefined;
  Notifications: undefined;
  NewRecord: {
    editRecord?: TravelRecord;
    record?: TravelRecord;
    selectedCountry?: SelectedCountryParam;
    tripPrefill?: TripPrefillParam;
    recoPrefill?: RecoPrefillFeedParam;   // AI 추천 프리필 (편집 모드보다 우선순위 낮음)
  } | undefined;
  Settings: undefined;
  Premium: undefined; // 프리미엄 소개(페이월) — 잠금 항목에서 진입
  Notice: undefined; // 설정 > 공지사항 (약관 개정 등 운영자 공지)
  FAQ: undefined; // 설정 > FAQ
  Feedback: undefined; // 설정 > 피드백 보내기 (인앱 폼)
  Friends: undefined;
  DM: { friend: DMFriendParam; sharePostId?: string };
  BestCut: undefined;
  FriendSearch: { initialQuery?: string; ts?: number } | undefined;
  BlockedUsers: undefined;
  ArchivedPosts: undefined;
  FriendProfile: {
    userId?: string | null;
    username?: string;
    handle?: string;
  } | undefined;
  FollowingList: undefined;
  FollowerList: undefined;
  // 마이 티켓 — 프로필 QR 공유 보딩패스 (통계는 프로필 화면 계산값을 그대로 전달)
  ProfileTicket: { tripCount: number; neighborCount: number };
  // 타인 프로필의 팔로워/팔로잉 목록 (조회 전용)
  UserFollowList: { userId: string; mode: 'followers' | 'following' };
  EditProfile: undefined;
  StatsDetail: { statType: StatsDetailType };
  TripRecord: { record: TravelRecord; viewType?: RecordViewType };
  TripGroup: { groupId: string };
  // guestRecords: 타인 프로필 진입용 — 그 여행의 기록(서버 조회본). 있으면 읽기 전용 게스트 모드
  TripDetail: { trip: TripThumbnailParam; guestRecords?: TravelRecord[] };
  // record: 스토어에 없는 글(타인 프로필에서 조회한 공개 글)의 폴백 — 있으면 그대로 렌더
  PostDetail: { postId: string; record?: TravelRecord };
  BlogRecord: {
    record?: TravelRecord;
    selectedCountry?: SelectedCountryParam;
    tripPrefill?: TripPrefillParam;
    recoPrefill?: RecoPrefillBlogParam;   // AI 추천 프리필 (편집 모드보다 우선순위 낮음)
  } | undefined;
  CutRecord: {
    selectedCountry?: SelectedCountryParam;
    tripPrefill?: TripPrefillParam;
    recoPrefill?: RecoPrefillCutParam;    // AI 추천 프리필
  } | undefined;
  CutTravelInfo: { cutPhoto: CutPhotoParam; selectedCountry?: SelectedCountryParam; tripPrefill?: TripPrefillParam };
  NaverBlogImport: undefined;
  SnapRecord: {
    notifTimestamp?: number;
    selectedCountry?: SelectedCountryParam;
  } | undefined;
  AlbumCreate: { selectedCountry?: SelectedCountryParam; tripGroupId?: string } | undefined; // tripGroupId: 여행 상세에서 진입 시 그 카드에 연결(카드당 앨범 1개)
  MomentCapture: undefined;
  // from: 'onboarding' = 온보딩 출신 표시. mode(문항 세트)와 독립적으로 넘긴다 — 결과 화면에서
  // '설문 이어하기'로 mode:'full'을 골라도(전체 문항으로 전환) 온보딩 출신 정보는 유지돼야
  // 뒤로가기/완료 후 이탈이 동의 화면을 우회하지 않는다.
  TravelDnaSurvey: { mode: 'full' | 'onboarding'; from?: 'onboarding' };
  TravelDnaResult: { from?: 'onboarding' } | undefined;
};

// ─── 화면 Props 헬퍼 ───

/** 스택 화면용: type Props = RootStackScreenProps<'Settings'> */
export type RootStackScreenProps<T extends keyof RootStackParamList> = StackScreenProps<
  RootStackParamList,
  T
>;

/** 탭 화면용 (탭 화면에서 스택 라우트로 navigate 가능): type Props = TabScreenProps<'MainTab'> */
export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  StackScreenProps<RootStackParamList>
>;

// 제네릭 없는 useNavigation() / navigationRef에도 루트 파라미터 타입을 적용
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
