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

// ─── 공용 파라미터 페이로드 ───

/** 기록 작성 화면들로 전달되는 사전 선택 국가 */
export interface SelectedCountryParam {
  name: string;
  code?: string;
  flag?: string;
  region?: string;   // 대륙 기록 시 지역명 (예: '도쿄')
  regionEn?: string;
}

/** DM 화면으로 전달되는 친구 정보 */
export interface DMFriendParam {
  name: string;
  handle: string;
  emoji: string;
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

/** 여행 카드에서 새 기록 추가 시 자동 적용할 여행 기간 (YYYY.MM.DD) */
export interface TripPeriodParam {
  startDate?: string;
  endDate?: string;
}

export type StatsDetailType = 'world' | 'yearly' | 'region' | 'countries' | 'rating';

// ─── 탭 ───

export type TabParamList = {
  MainTab: { startTutorial?: boolean } | undefined; // startTutorial: 기록 완성 후 메인 튜토리얼(코치마크) 자동 실행
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
  TravelImport: undefined;
  ImportPhotoSelect: { trips: ImportTrip[] };
  ImportComplete: { tripCount: number; photoCount: number; countries: { flag: string; name: string }[] };
  Main: NavigatorScreenParams<TabParamList> | undefined;
  Country: { name: string; flag: string } | undefined;
  AccountSettings: undefined;
  NotificationSettings: undefined;
  Notifications: undefined;
  NewRecord: {
    editRecord?: TravelRecord;
    record?: TravelRecord;
    selectedCountry?: SelectedCountryParam;
    tripPeriod?: TripPeriodParam;
  } | undefined;
  Settings: undefined;
  Premium: undefined; // 프리미엄 소개(페이월) — 잠금 항목에서 진입
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
  EditProfile: undefined;
  StatsDetail: { statType: StatsDetailType };
  TripRecord: { record: TravelRecord; viewType?: RecordViewType };
  TripGroup: { groupId: string };
  TripDetail: { trip: TripThumbnailParam };
  PostDetail: { postId: string };
  BlogRecord: {
    record?: TravelRecord;
    selectedCountry?: SelectedCountryParam;
    tripPeriod?: TripPeriodParam;
  } | undefined;
  CutRecord: { selectedCountry?: SelectedCountryParam; tripPeriod?: TripPeriodParam } | undefined;
  CutTravelInfo: { cutPhoto: CutPhotoParam; selectedCountry?: SelectedCountryParam; tripPeriod?: TripPeriodParam };
  NaverBlogImport: undefined;
  SnapRecord: {
    notifTimestamp?: number;
    selectedCountry?: SelectedCountryParam;
  } | undefined;
  AlbumCreate: { selectedCountry?: SelectedCountryParam } | undefined;
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
