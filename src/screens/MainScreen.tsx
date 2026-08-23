import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Animated,
  Modal,
  PanResponder,
  Platform,
  Image,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
} from 'react-native';
import { Text, TextInput } from '../ui/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { andFitText } from '../utils/fitText';
import { parseDotDate, tripPeriodOf } from '../utils/momentMatch';
import RatingStars from '../components/RatingStars';
import NotificationBadge from '../components/NotificationBadge';
import { fetchUnreadNotificationCount, subscribeNotifications } from '../services/social';
import { getMyUserId } from '../services/profile';
import { stageWidthNow, useStageWidth, clampStageWidth, STAGE_MAX_W } from '../utils/stage';

// 시트/모달 배경 재질 — iOS는 블러, Android는 매트(고불투명).
// Android BlurView는 experimentalBlurMethod 없이는 no-op이라 지구본이 선명하게 뚫고 비쳤고,
// 대면적 블러는 실험 옵션을 켜도 성능 부담이 있어 매트 폴백을 쓴다 (탭 바 등 소면적만 실제 블러).
const SheetBackdrop = ({ pointerEvents }: { pointerEvents?: 'none' }) =>
  Platform.OS === 'ios' ? (
    <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} pointerEvents={pointerEvents} />
  ) : (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(16,10,30,0.94)' }]}
      pointerEvents={pointerEvents}
    />
  );
import { useTranslation } from 'react-i18next';
import { SHORT_COUNTRY_EN } from '../constants/countryDisplay';
import Svg, { Circle, Path as SvgPath, Line as SvgLine, Rect as SvgRect, Defs as SvgDefs, LinearGradient as SvgLinearGradient, RadialGradient as SvgRadialGradient, Stop as SvgStop, ClipPath as SvgClipPath, Image as SvgImage } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { Image as ExpoImage } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { NotificationBellIcon, SearchLineIcon, GlobeIcon, CameraIcon, LockClosedIcon, GalleryIcon } from '../components/icons';
import GlobeView, { VisitedCountry, GlobeDisplayMode } from '../components/GlobeView';
import { getGlobeSkinTheme, getGlassBgHue, GLOBE_SKINS } from '../constants/globeSkins';
import { getSkinAccent } from '../constants/skinTheme';
import { imageToDataUri } from '../utils/imageCompress';
import { buildCountryShape, buildSilhouettePaths } from '../utils/countryShape';
import { showPermissionDeniedAlert } from '../utils/permissionAlert';
import { requestTrackingPermission } from '../lib/tracking';
import CountryMapView from '../components/CountryMapView';
import PuzzlePhotoAdjustOverlay from '../components/PuzzlePhotoAdjustOverlay';
import PuzzleShareCard from '../components/PuzzleShareCard';
import GrainOverlay from '../components/GrainOverlay';
import MainCoachmark, { CoachStep, CoachRect } from '../components/MainCoachmark';
import { whenReadyToMeasure, measureWithRetry } from '../utils/coachStart';
import { traceStart, traceStep, traceEnd } from '../utils/perfTrace';
import { setCoachActive, setCoachBright } from '../components/coachOverlayState';
import { EorthLogo } from '../components/EorthLogo';
import { SegmentedToggle } from '../components/SegmentedToggle';
import SponsoredPackageCard from '../components/SponsoredPackageCard';
import { getSponsoredMarkerItems, getSponsoredByCountryEn, type SponsoredPackage } from '../constants/sponsoredPackages';
import { useRecords } from '../store/recordStore';
import type { TravelRecord } from '../store/recordStore';
import { COUNTRIES } from '../constants/countries';
import { useSettings, type MapDisplayMode, type SkinColorSet, type TaggedRegion } from '../store/settingsStore';
import { getCountryRegionOptions } from '../constants/homeRegions';
import { REGION_MAP_ENABLED } from '../constants/featureFlags';
import type { RegionGlobalMode } from '../utils/regionModeMigration';
import { regionNameByCode, totalRegionCount, visitedRegionCount } from '../utils/regionGeoLookup';
import { REGION_COUNTRIES } from '../constants/regionCountries';
import type { TabScreenProps } from '../navigation/types';
import { consumePendingInvite } from '../utils/pendingInvite';
import { getProfileByHandle } from '../services/profile';
import { InviteNudgeModal, type InviteNudgeTarget } from '../components/InviteNudgeModal';
import { isSupabaseConfigured } from '../services/supabase';
import { matchesCountry } from '../utils/countryMatch';
import { regionDisplayName } from '../utils/regionLabel';
import { resolveRegionCode } from '../utils/regionKeyMigration';

const width = stageWidthNow();
const height = Dimensions.get('window').height;
// 영토 표시 설정 모달 카드 — Figma 325x569 비율 유지(화면에 맞춰 축소)
const DS_CARD_W = Math.min(325, width - 24);
const DS_CARD_H = Math.min(569, height * 0.86, DS_CARD_W * (569 / 325));
const DS_PAD = DS_CARD_W * (29 / 325); // 좌우 패딩 29 (버튼폭 268)
const DS_CARD_TOP = height * (168.85 / 874); // Figma 목업 기준 카드 상단 위치(가운데 아님, 상단 배치)
// 스킨별 활성화색 팔레트(각 4색). aurora=보라(뒤 2색 노이즈), cyan=시안. 미지정 스킨(mint 등)은 aurora 폴백.
// 채도 -15%(색상·밝기 유지) — 활성화색이 과포화로 튀지 않게 살짝 낮춤. 원본 대비 HSL S만 ×0.85.
const DS_PALETTES: Record<string, string[]> = {
  aurora: ['#DF43E8', '#C88BF6', '#E1CDFB', '#EB19D2'],
  cyan:   ['#15D3EC', '#12CAE1', '#C8F5FB', '#8FF6EC'],
  mint:   ['#8FF6BD', '#12E17A', '#C8FBD0', '#8FF6A0'],
};
// 통계 화면(연도별·대륙별 막대 색)도 이 팔레트를 사용한다 (StatsScreen)
export const getSkinPalette = (skin: string): string[] => DS_PALETTES[skin] || DS_PALETTES.aurora;
// 모노톤 노이즈(0.5px, #00000040 25%) 적용 색(aurora 2색) — GlobeView와 값 일치 필요 (팔레트 채도 감소분 반영)
const NOISE_ACTIVE_COLORS = ['#E1CDFB', '#EB19D2'];
const isNoiseColor = (c: string) => NOISE_ACTIVE_COLORS.indexOf(c) !== -1;
const SHEET_HEIGHT = height * 0.6;
// 국가 시트는 내용만큼만 올라오고 이 값까지만 커진다(예전엔 기록이 하나여도 항상 65%였다)
const COUNTRY_SHEET_MAX_H = height * 0.65;

// 스냅 버튼(탭 바 오버레이 RecordFab)의 절대 제약 — 이 화면은 버튼을 직접 그리지 않지만,
// 튜토리얼 앵커와 하단 오버레이가 같은 값을 알아야 겹치지 않는다.
// 예전엔 각자 상수를 들고 있어, 대륙 모드의 '방문 지역 추가하기' 칩이 스냅 버튼 아래에
// 깔려 닫기(✕) 버튼이 눌리지 않았다(스냅·FAB가 앞 레이어).
const SNAP_BTN = { right: 46, bottom: 129, size: 60 };
/** 스냅 버튼 위에 얹는 오버레이의 bottom (insets.bottom 제외) */
const ABOVE_SNAP = SNAP_BTN.bottom + SNAP_BTN.size + 10;

// ─── 대륙 모드 국가 목록 ─── (src/constants/regionCountries.ts로 이전, 지오 검증 스크립트가 import)

// ─── 영토 표시 설정 버튼 아이콘 (스킨색 배경 + 위경도 격자 지구본) — 지구본/대륙 공용 ───
// tint: 원 배경색(알파 포함) — 스킨 pill과 동일 규격(aurora 기본값 = 기존 #751AAD 30%)
// ─── 퍼즐 조각 아이콘 — 대륙 표시 설정의 퍼즐 모드 옵션용 (이모지 🧩 대체, 앱 라인 아이콘 언어) ───
// 사각 조각에 위·오른쪽 요철(반원 knob) — 이모지는 기기/OS마다 렌더가 달라 제작 SVG로 통일한다.
const PuzzlePieceIcon = ({ size = 24, color = '#A1A1B0' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <SvgPath
      d="M4 9 H9 A3 3 0 0 1 15 9 H20 V12 A3 3 0 0 1 20 18 V20 H4 Z"
      stroke={color}
      strokeWidth={1.8}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </Svg>
);

// ─── 즐겨찾기 별 아이콘 — 전체 국가 시트에서 그리드 7칸에 올릴 나라를 켜고 끈다 ───
// 채움 = 즐겨찾기 ON, 외곽선만 = OFF. 이모지 ★/☆는 기기·OS마다 색과 굵기가 제각각이라
// PuzzlePieceIcon과 같은 이유로 제작 SVG로 통일한다.
// Svg에 pointerEvents를 주지 않는다(안드로이드 새 아키텍처가 리플렉션 실패로 조용히 무시).
// 래퍼 View도 두지 않는다 — 이 별은 '오버레이'가 아니라 자기 TouchableOpacity 안의 장식이고,
// 아래에 가려지는 다른 터치 대상이 없다(같은 파일 SearchLineIcon·GlobeDisplayIcon과 동일 형태).
const FavStarIcon = ({ filled, color }: { filled: boolean; color: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <SvgPath
      d="M12 3.5 14.6 8.77 20.42 9.62 16.21 13.72 17.2 19.51 12 16.78 6.8 19.51 7.79 13.72 3.58 9.62 9.4 8.77 Z"
      fill={filled ? color : 'none'}
      stroke={color}
      strokeOpacity={filled ? 1 : 0.75}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
  </Svg>
);

const GlobeDisplayIcon = ({ tint = 'rgba(117,26,173,0.3)' }: { tint?: string }) => (
  <Svg width={36} height={36} viewBox="-2 -2 33 33" fill="none">
    <SvgDefs>
      {/* 메뉴바 배경 테두리의 중립 베벨 그라데이션 (위 투명 → 아래 흰색).
          gradientUnits="userSpaceOnUse" 필수 — 기본값(objectBoundingBox)이면 함정 2개를 동시에 밟는다.
          ① 원점이 "원의 꼭대기"가 아니라 "bbox 좌상단 모서리"다. 축이 오른쪽으로 기울어 있어서
             (예전 x2=0.15) 링의 12시 지점이 t=0에 닿지 못하고 t≈0.07에서 시작했다. 위가 투명해지지
             않으니 베벨이 아니라 사방이 밝은 링으로 보였다(S21+ 실기기 스크린샷 실측: 12시 링 휘도 42,
             바탕 틴트 32 — 즉 꼭대기에서도 안 사라진다).
          ② RNSVG의 bbox 정의가 플랫폼마다 다르다. iOS는 fill∪stroke 바운즈
             (apple/RNSVGRenderable.mm: pathBounds = CGRectUnion(fillBounds, strokeBounds)),
             안드로이드는 fill 경로 바운즈만(android/.../RenderableView.java: mPath.computeBounds).
             이 원에선 28.9 vs 27.6(4.7% 차)이라 같은 JSX가 두 플랫폼에서 다른 t를 낸다.
          절대좌표로 못 박으면 bbox가 계산에서 아예 빠져 두 함정이 같이 사라지고,
          NeonFab·SnapButton의 중립 베벨(fabRimNeutral·snapRimNeutral)과 프로파일이 정확히 같아진다.
          좌표 유도(링: cx=cy=14.5, r=13.8): 시작 = 링 꼭대기 살짝 위 (cx, cy-r-r/60) = (14.5, 0.47),
          끝 = 링 바닥 살짝 아래에서 오른쪽으로 0.6r = (cx+8.28, cy+r+r/60) = (22.78, 28.53).
          r/60·0.6r 비율은 NeonFab(r=26.8698, 10.3896→65.0249/+16.1219)에서 그대로 가져왔다.
          결과 t: 12시 0.0075(사실상 투명) / 9시 0.327 / 3시 0.593 / 6시 0.912. */}
      <SvgLinearGradient id="globeBtnRim" x1="14.5" y1="0.47" x2="22.78" y2="28.53" gradientUnits="userSpaceOnUse">
        <SvgStop offset="0" stopColor="#666666" stopOpacity="0" />
        <SvgStop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
      </SvgLinearGradient>
    </SvgDefs>
    <Circle cx={14.5} cy={14.5} r={14.5} fill={tint} />
    <Circle cx={14.5} cy={14.5} r={13.8} fill="none" stroke="url(#globeBtnRim)" strokeOpacity={0.6} strokeWidth={1.3} />
    <SvgPath
      d="M23.7851 14.4998C23.7851 11.9165 22.8876 9.74402 21.0926 7.98266C19.37 6.2601 17.2696 5.37175 14.7913 5.31795L14.5504 5.31531C11.9671 5.31531 9.77802 6.20458 7.9831 7.98266L7.81884 8.14913C6.15012 9.88032 5.31578 11.9972 5.31575 14.4998L5.31839 14.7411C5.37226 17.2193 6.26057 19.3195 7.9831 21.042C9.72199 22.7484 11.8307 23.6283 14.3095 23.6816L14.5504 23.6842C17.1338 23.6842 19.3145 22.8034 21.0926 21.042C22.8875 19.2638 23.7851 17.0831 23.7851 14.4998ZM24.0982 14.7486C24.0419 17.3063 23.1133 19.4851 21.315 21.2666C19.4757 23.0886 17.214 24 14.5504 24C11.9701 24 9.75963 23.1448 7.93686 21.4357L7.76203 21.2675L7.75983 21.2653C5.9207 19.4261 5 17.1643 5 14.4998C5.00003 11.8353 5.92064 9.58125 7.76071 7.75851C9.61623 5.92033 11.8859 5 14.5504 5C17.2149 5 19.4768 5.92031 21.3159 7.75939C23.1719 9.58159 24.1008 11.8352 24.1008 14.4998L24.0982 14.7486Z"
      fill="#FFFFFF"
    />
    <SvgPath
      d="M15.0576 4.76074C17.5677 4.87152 19.7221 5.81266 21.4912 7.58105L21.8369 7.93652C23.512 9.74267 24.3506 11.9408 24.3506 14.5V14.502L24.3486 14.751V14.7539L24.0986 14.749L24.3477 14.7539C24.29 17.3755 23.3362 19.6166 21.4912 21.4443C19.7213 23.1976 17.5663 24.1297 15.0566 24.2393L14.5508 24.25C11.9094 24.25 9.63652 23.3724 7.76562 21.6182L7.76367 21.6162L7.58887 21.4473L7.58496 21.4443L7.58301 21.4424C5.69564 19.555 4.75005 17.2287 4.75 14.5L4.76074 13.9932C4.87152 11.483 5.81383 9.3355 7.58496 7.58105C9.48847 5.69535 11.8221 4.75 14.5508 4.75L15.0576 4.76074ZM14.5488 5.56543C12.0305 5.56579 9.90574 6.43004 8.15918 8.16016L7.99707 8.3252L7.99609 8.32422C6.37568 10.0063 5.56546 12.0603 5.56543 14.5L5.56836 14.7354L5.58789 15.1836C5.73195 17.4029 6.58789 19.2922 8.1582 20.8633C9.85069 22.5241 11.8982 23.3796 14.3145 23.4316H14.3135L14.5508 23.4336C17.0704 23.4335 19.1874 22.5776 20.917 20.8643C22.6631 19.1343 23.5351 17.0181 23.5352 14.5C23.5351 11.9819 22.6634 9.87402 20.918 8.16113L20.916 8.15918C19.2399 6.48314 17.2011 5.62085 14.7861 5.56836V5.56738L14.5488 5.56543Z"
      stroke="#FFFFFF"
      strokeOpacity={0.5}
      strokeWidth={0.5}
    />
    <SvgPath d="M14.4696 5.45068C12.8913 8.38182 12.2148 11.7639 12.2148 14.695C12.2148 18.3026 13.267 22.5866 14.4696 23.9394" stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={0.7} />
    <SvgPath d="M14.9211 5.45068C16.6747 8.41801 17.1758 12.9831 17.1758 15.0374C17.1758 17.0917 16.4242 22.5699 14.9211 23.9394" stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={0.7} />
    <SvgPath d="M14.4699 5.45068C11.0943 7.25419 9.05859 10.1877 9.05859 15.3728C9.05859 20.5578 11.7592 23.2631 13.5597 23.9394" stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={0.7} />
    <SvgPath d="M14.9207 5.45068C18.2963 7.25419 20.332 10.7006 20.332 15.0374C20.332 19.3743 17.6314 23.2631 15.831 23.9394" stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={0.7} />
    <SvgLine x1={14.8697} y1={5} x2={14.8697} y2={23.9397} stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={0.8} />
    <SvgLine x1={5} y1={14.5204} x2={23.9397} y2={14.5204} stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={0.8} />
    <SvgLine x1={5.90137} y1={18.1783} x2={23.0373} y2={18.1783} stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={0.7} />
    <SvgLine x1={5.90137} y1={10.9635} x2={23.4882} y2={10.9635} stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={0.7} />
  </Svg>
);

// REGION_COUNTRIES에서 파생 — 국가 추가 시 목록 한 곳만 고치면 됨.
// (하드코딩 8개국이던 시절, 신규 국가에서 국가 칩이 ISO3로 뜨고 지역 활성색이 안 그려지는 버그가 있었음)
const ISO3_TO_KO: Record<string, string> = Object.fromEntries(
  REGION_COUNTRIES.map((c) => [c.code, c.name])
);
// 역방향(한글 국가명 → ISO3) — 기록의 지역명을 설정 키와 같은 어휘(코드)로 해석할 때 쓴다
const KO_TO_ISO3: Record<string, string> = Object.fromEntries(
  REGION_COUNTRIES.map((c) => [c.name, c.code])
);

const VISITED_COUNTRIES = [
  { flag: '🇯🇵', name: '일본', visits: 5 },
  { flag: '🇺🇸', name: '미국', visits: 2 },
  { flag: '🇭🇰', name: '홍콩', visits: 1 },
];

// ─── FAB 아이콘 (View 기반) ───
const FAB_SZ = 24;
const FAB_C = '#FFFFFF';

// 피드 — 카메라 (뷰파인더 + 몸체 + 렌즈)
const FeedIcon = () => (
  <View style={{ width: FAB_SZ, height: FAB_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 8, height: 4, borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: FAB_C }} />
    <View style={{ width: 20, height: 13, borderRadius: 3, backgroundColor: FAB_C, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: '#2E2E3B' }} />
    </View>
  </View>
);

// 블로그 — 글 문서 (헤더 줄 + 본문 줄 3개)
const BlogIcon = () => (
  <View style={{ width: FAB_SZ, height: FAB_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 20, height: 20, gap: 3 }}>
      <View style={{ width: 14, height: 3, borderRadius: 1.5, backgroundColor: FAB_C }} />
      <View style={{ width: 20, height: 2, borderRadius: 1, backgroundColor: FAB_C, opacity: 0.6 }} />
      <View style={{ width: 18, height: 2, borderRadius: 1, backgroundColor: FAB_C, opacity: 0.6 }} />
      <View style={{ width: 16, height: 2, borderRadius: 1, backgroundColor: FAB_C, opacity: 0.6 }} />
    </View>
  </View>
);

// 앨범 — 사진 그리드 (2×2)
const AlbumIcon = () => (
  <View style={{ width: FAB_SZ, height: FAB_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 20, height: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
      <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: FAB_C }} />
      <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: FAB_C }} />
      <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: FAB_C }} />
      <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: FAB_C }} />
    </View>
  </View>
);

// 네컷 — 프레임 안 2×2 (네컷 사진 느낌)
const CutIcon = () => (
  <View style={{ width: FAB_SZ, height: FAB_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 18, height: 22, borderWidth: 1.5, borderColor: FAB_C, borderRadius: 3, padding: 2.5, flexDirection: 'row', flexWrap: 'wrap', gap: 2, alignContent: 'center', justifyContent: 'center' }}>
      <View style={{ width: 5.5, height: 5.5, borderRadius: 1, backgroundColor: FAB_C }} />
      <View style={{ width: 5.5, height: 5.5, borderRadius: 1, backgroundColor: FAB_C }} />
      <View style={{ width: 5.5, height: 5.5, borderRadius: 1, backgroundColor: FAB_C }} />
      <View style={{ width: 5.5, height: 5.5, borderRadius: 1, backgroundColor: FAB_C }} />
    </View>
  </View>
);

// 스냅 — 번개 ⚡
const SnapIcon = () => (
  <View style={{ width: FAB_SZ, height: FAB_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: FAB_C, fontSize: 16, fontWeight: 'bold' }}>⚡</Text>
  </View>
);

const COUNTRY_FLAGS: Record<string, string> = {
  '한국': '🇰🇷',
  '일본': '🇯🇵',
  '프랑스': '🇫🇷',
  '태국': '🇹🇭',
};

// 국가 시트 헤더 국기 — 로컬 4개국 외에는 전체 국가 목록(COUNTRIES)에서 찾는다.
// (기존엔 4개국 외 모든 방문국이 🌍 폴백으로 표시됐다)
const flagForCountry = (name: string): string =>
  COUNTRY_FLAGS[name] ??
  COUNTRIES.find((c) => c.name === (name === '한국' ? '대한민국' : name))?.flag ??
  '🌍';


// 국가 시트에 노출할 기록인지 판정.
// 지구본 활성화 판정(handleGlobeMessage)과 시트 목록이 같은 기준을 쓰도록 한 곳에 모은다
// — 예전엔 판정은 스냅을 빼고 목록은 포함해서, 시트가 열리는 조건과 내용이 어긋났다.
//  · 스냅: 지구본을 활성화하지 않으므로 목록에서도 뺀다(여행 카드에도 안 묶여 이동 동선이 달랐다)
//  · 초안 / 미래 예약: 아직 발행 전이라 완성된 기록처럼 보이면 안 된다
const isCountrySheetRecord = (r: TravelRecord, now: number): boolean =>
  r.viewType !== 'snap' && !r.isDraft && !(r.scheduledAt != null && r.scheduledAt > now);

// 목록 정렬 키 — '여행한 날짜'. 저장 순(작성 시각)에 맡기면 과거 여행 회고를
// 오늘 쓴 경우 최근 기록보다 위로 올라온다.
const recordDateMs = (r: TravelRecord): number =>
  parseDotDate(r.startDate) ?? parseDotDate(r.date) ?? r.timestamp ?? 0;

// 기간 표기 — 하루면 날짜 하나, 같은 달이면 끝을 일(DD)만, 같은 해면 MM.DD, 해가 다르면 전체.
// 입력 ms는 parseDotDate/tripPeriodOf가 만든 '로컬 자정'이라 아래 로컬 getter와 어긋나지 않는다
// (예전엔 UTC 자정이라 UTC- 시간대에서 하루 앞 날짜가 찍혔다).
const fmtPeriod = (startMs: number, endMs: number): string => {
  const s = new Date(startMs);
  const e = new Date(endMs);
  const p = (n: number) => String(n).padStart(2, '0');
  const full = (d: Date) => `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  if (startMs === endMs) return full(s);
  if (s.getFullYear() !== e.getFullYear()) return `${full(s)} ~ ${full(e)}`;
  if (s.getMonth() !== e.getMonth()) return `${full(s)} ~ ${p(e.getMonth() + 1)}.${p(e.getDate())}`;
  return `${full(s)} ~ ${p(e.getDate())}`;
};

// 한국어 국가명 → GeoJSON 영문 이름 매핑 (GlobeView의 KO_NAMES 역방향)
// 사진첩 국가(GPS) 필터도 이 표로 세계 GeoJSON 피처를 찾는다 (AlbumCreateScreen)
export const KO_TO_EN: Record<string, string> = {
  '벨리즈': 'Belize', '베냉': 'Benin', '부르키나파소': 'Burkina Faso', '부룬디': 'Burundi', '중앙아프리카공화국': 'Central African Republic', '지부티': 'Djibouti', '동티모르': 'East Timor', '적도기니': 'Equatorial Guinea', '에리트레아': 'Eritrea', '피지': 'Fiji', '가봉': 'Gabon', '감비아': 'Gambia', '레소토': 'Lesotho', '라이베리아': 'Liberia', '말라위': 'Malawi', '모리타니': 'Mauritania', '르완다': 'Rwanda', '시에라리온': 'Sierra Leone', '솔로몬제도': 'Solomon Islands', '수리남': 'Suriname', '바하마': 'The Bahamas', '트리니다드 토바고': 'Trinidad and Tobago', '바누아투': 'Vanuatu', '코트디부아르': 'Ivory Coast', '기니비사우': 'Guinea Bissau',
  // 소국·도서국 30개 — COUNTRIES에는 있는데 이 표에 없어서 영어 모드에서 한글 국가명이
  // 그대로 노출됐다(가져온 여행 제목 '싱가포르 Trip', 국가 배지 '🇸🇬 싱가포르' 등).
  // 세계 GeoJSON에는 이 국가들의 피처가 없어(저해상도라 누락) 지구본 조회에는 영향이 없다.
  // '콩고'는 COUNTRIES 표기가 '콩고'인데 이 표에는 '콩고 공화국'으로만 있어 키가 어긋나 있었다.
  '싱가포르': 'Singapore', '몰디브': 'Maldives', '바레인': 'Bahrain', '모나코': 'Monaco',
  '안도라': 'Andorra', '리히텐슈타인': 'Liechtenstein', '산마리노': 'San Marino',
  '바티칸': 'Vatican City', '몰타': 'Malta', '바베이도스': 'Barbados', '그레나다': 'Grenada',
  '세인트루시아': 'Saint Lucia', '세인트빈센트 그레나딘': 'Saint Vincent and the Grenadines',
  '앤티가 바부다': 'Antigua and Barbuda', '세인트키츠 네비스': 'Saint Kitts and Nevis',
  '도미니카': 'Dominica', '모리셔스': 'Mauritius', '세이셸': 'Seychelles', '코모로': 'Comoros',
  '콩고': 'Congo', '상투메 프린시페': 'Sao Tome and Principe', '카보베르데': 'Cape Verde',
  '사모아': 'Samoa', '통가': 'Tonga', '미크로네시아': 'Micronesia', '팔라우': 'Palau',
  '마셜제도': 'Marshall Islands', '키리바시': 'Kiribati', '투발루': 'Tuvalu', '나우루': 'Nauru',
  '아프가니스탄':'Afghanistan','알바니아':'Albania','알제리':'Algeria',
  '앙골라':'Angola','아르헨티나':'Argentina','아르메니아':'Armenia',
  '호주':'Australia','오스트리아':'Austria','아제르바이잔':'Azerbaijan',
  '방글라데시':'Bangladesh','벨라루스':'Belarus','벨기에':'Belgium',
  '부탄':'Bhutan','볼리비아':'Bolivia','보스니아 헤르체고비나':'Bosnia and Herzegovina',
  '보츠와나':'Botswana','브라질':'Brazil','브루나이':'Brunei',
  '불가리아':'Bulgaria','캄보디아':'Cambodia','카메룬':'Cameroon','캐나다':'Canada',
  '차드':'Chad','칠레':'Chile','중국':'China','콜롬비아':'Colombia',
  '콩고 공화국':'Congo','코스타리카':'Costa Rica','크로아티아':'Croatia','쿠바':'Cuba',
  '체코':'Czech Republic','콩고민주공화국':'Democratic Republic of the Congo',
  '덴마크':'Denmark','도미니카공화국':'Dominican Republic',
  '에콰도르':'Ecuador','이집트':'Egypt','엘살바도르':'El Salvador',
  '에스토니아':'Estonia','에티오피아':'Ethiopia','핀란드':'Finland','프랑스':'France',
  '조지아':'Georgia','독일':'Germany','가나':'Ghana','그리스':'Greece',
  '과테말라':'Guatemala','기니':'Guinea','가이아나':'Guyana','아이티':'Haiti',
  '온두라스':'Honduras','헝가리':'Hungary','아이슬란드':'Iceland','인도':'India',
  '인도네시아':'Indonesia','이란':'Iran','이라크':'Iraq','아일랜드':'Ireland',
  '이스라엘':'Israel','이탈리아':'Italy','자메이카':'Jamaica','일본':'Japan',
  '요르단':'Jordan','카자흐스탄':'Kazakhstan','케냐':'Kenya',
  '쿠웨이트':'Kuwait','키르기스스탄':'Kyrgyzstan','라오스':'Laos',
  '라트비아':'Latvia','레바논':'Lebanon','리비아':'Libya',
  '리투아니아':'Lithuania','룩셈부르크':'Luxembourg',
  '마다가스카르':'Madagascar','말레이시아':'Malaysia','말리':'Mali',
  '멕시코':'Mexico','몰도바':'Moldova','몽골':'Mongolia','몬테네그로':'Montenegro',
  '모로코':'Morocco','모잠비크':'Mozambique','미얀마':'Myanmar',
  '나미비아':'Namibia','네팔':'Nepal','네덜란드':'Netherlands',
  '뉴질랜드':'New Zealand','니카라과':'Nicaragua','니제르':'Niger',
  '나이지리아':'Nigeria','북한':'North Korea','노르웨이':'Norway',
  '오만':'Oman','파키스탄':'Pakistan','파나마':'Panama',
  '파푸아뉴기니':'Papua New Guinea','파라과이':'Paraguay','페루':'Peru',
  '필리핀':'Philippines','폴란드':'Poland','포르투갈':'Portugal',
  '카타르':'Qatar','루마니아':'Romania','러시아':'Russia',
  '사우디아라비아':'Saudi Arabia','세네갈':'Senegal','세르비아':'Serbia',
  '슬로바키아':'Slovakia','슬로베니아':'Slovenia','소말리아':'Somalia',
  '남아프리카공화국':'South Africa','대한민국':'South Korea','남수단':'South Sudan',
  '스페인':'Spain','스리랑카':'Sri Lanka','수단':'Sudan',
  '스웨덴':'Sweden','스위스':'Switzerland','시리아':'Syria',
  '홍콩':'Hong Kong','마카오':'Macau', // 중국에서 분리한 별도 지역
  '대만':'Taiwan','타지키스탄':'Tajikistan','탄자니아':'Tanzania',
  '태국':'Thailand','토고':'Togo','튀니지':'Tunisia',
  '튀르키예':'Turkey','투르크메니스탄':'Turkmenistan',
  '우간다':'Uganda','우크라이나':'Ukraine',
  '아랍에미리트':'United Arab Emirates',
  '영국':'United Kingdom','미국':'United States of America',
  '우루과이':'Uruguay','우즈베키스탄':'Uzbekistan',
  '베네수엘라':'Venezuela','베트남':'Vietnam',
  '예멘':'Yemen','잠비아':'Zambia','짐바브웨':'Zimbabwe',
  '그린란드':'Greenland','서사하라':'Western Sahara',
  '팔레스타인':'Palestine','키프로스':'Cyprus','코소보':'Kosovo',
  '북마케도니아':'North Macedonia','에스와티니':'Eswatini',
  '한국':'South Korea',
};

// '한국'(과거여행 가져오기 구버전 표기) ↔ '대한민국'(COUNTRIES 표준) 별칭.
// 기록에 두 표기가 섞여 있어(badgeRules도 동일 보정) 이름 비교는 반드시 별칭 집합으로 한다 —
// 아니면 국내 기록의 대표 사진이 지구본에 안 뜨고, '한국' 기록만 있는 사용자는 지구본을
// 탭해도 기존 기록 시트 대신 "새 기록 추가"가 뜬다.
// → matchesCountry 는 src/utils/countryMatch.ts 에서 import (recordStore 공유)

type Props = TabScreenProps<'MainTab'>;

// 기록 형식 선택 → 이동할 수 있는 작성 화면들
type RecordFormatScreen = 'NewRecord' | 'BlogRecord' | 'CutRecord' | 'SnapRecord' | 'AlbumCreate';

// 전체화면 우주배경 — 메인탭 모든 콘텐츠 뒤에 깔리는 별·무드글로우(비상호작용).
// 별은 글로브 WebView(75% 영역) 밖(헤더·탭 영역)까지 화면 전체로 확장된다(첨부 SVG처럼).
function SpaceBackdrop({ glow = '#CA82FF', glow2 = '#1E3AFF' }: { glow?: string; glow2?: string }) {
  // 이 배경은 MainScreen 본문(styles.container) 안 StyleSheet.absoluteFill로 깔린다 —
  // 즉 App.tsx의 클램프된 Stage 컬럼 "안"이라 그릴 수 있는 폭은 창 폭이 아니라 Stage 폭이다.
  // 창 폭(763dp)으로 별 320개와 무드 글로우 6개를 배치하면 480dp에서 잘려 오른쪽 약 37%가
  // 사라지고, W*0.82·W*0.94에 놓인 글로우는 아예 화면 밖으로 나간다.
  // 높이는 클램프 대상이 아니므로(Stage는 폭만 가둔다) 실제 창 높이를 그대로 쓴다.
  const W = useStageWidth();
  const { height: H } = Dimensions.get('window');
  const stars = useMemo(() => {
    let s = 20260629;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    return Array.from({ length: 320 }, () => ({
      x: +(rnd() * W).toFixed(1),
      y: +(rnd() * H).toFixed(1),
      r: +(0.5 + rnd() * 0.6).toFixed(2),
      o: +(0.5 + rnd() * 0.4).toFixed(2),
    }));
  }, [W, H]);
  return (
    // 새 아키텍처에서 RNSVG가 pointerEvents="none"을 무시하고 터치를 삼키므로 View로 감싼다
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
    <Svg width={W} height={H}>
      <SvgDefs>
        <SvgRadialGradient id="sbGlowP" cx="50%" cy="50%" r="50%">
          <SvgStop offset="0%" stopColor={glow} stopOpacity={0.18} />
          <SvgStop offset="70%" stopColor={glow} stopOpacity={0} />
        </SvgRadialGradient>
        <SvgRadialGradient id="sbGlowB" cx="50%" cy="50%" r="50%">
          <SvgStop offset="0%" stopColor={glow2} stopOpacity={0.1} />
          <SvgStop offset="65%" stopColor={glow2} stopOpacity={0} />
        </SvgRadialGradient>
      </SvgDefs>
      <SvgRect x={0} y={0} width={W} height={H} fill="#0A0B0F" />
      <Circle cx={W * 0.32} cy={H * 0.22} r={W * 0.55} fill="url(#sbGlowB)" />
      <Circle cx={W * 0.24} cy={H * 0.48} r={W * 0.42} fill="url(#sbGlowP)" />
      <Circle cx={W * 0.82} cy={H * 0.8} r={W * 0.44} fill="url(#sbGlowP)" />
      {/* 우주가스 추가 블롭 — globe #bg와 동일한 가장자리 산포 */}
      <Circle cx={W * 0.06} cy={H * 0.28} r={W * 0.42} fill="url(#sbGlowP)" />
      <Circle cx={W * 0.94} cy={H * 0.62} r={W * 0.4} fill="url(#sbGlowP)" />
      <Circle cx={W * 0.1} cy={H * 0.9} r={W * 0.38} fill="url(#sbGlowP)" />
      {stars.map((st, i) => (
        <Circle key={i} cx={st.x} cy={st.y} r={st.r} fill="#ffffff" fillOpacity={st.o} />
      ))}
    </Svg>
    </View>
  );
}

// 지구본 위 버튼의 유리 채움 — 안드로이드 dimezisBlurView는 WebView(하드웨어 서피스)를
// 스냅샷하지 못해 검은 원판으로 보인다 → 안드로이드는 반투명 매트로 대체 (iOS는 실블러)
function GlobeBtnGlass({ style, children }: { style?: object; children: React.ReactNode }) {
  if (Platform.OS === 'ios') {
    return <BlurView intensity={50} tint="dark" style={style}>{children}</BlurView>;
  }
  return <View style={[style, { backgroundColor: 'rgba(22,18,32,0.6)' }]}>{children}</View>;
}

const PUZZLE_MEDIA_DIR = 'puzzle/';
const REGION_PHOTO_DIR = 'region-photos/';

// 지도용 사진을 documentDirectory로 복사해 OS 캐시 정리 후에도 유지한다
// (EditProfileScreen의 persistProfilePhoto·MomentCaptureScreen의 persistMomentPhoto와 같은 패턴).
// 피커 캐시 URI를 그대로 두면 OS가 캐시를 비울 때 퍼즐 그림이 사라지고,
// Documents 밖이라 재빌드 복구(remapDocUri)도 안 걸린다.
async function persistMapPhoto(srcUri: string, subDir: string): Promise<string> {
  try {
    const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    const base = FileSystem.documentDirectory;
    if (base) {
      const dir = `${base}${subDir}`;
      try { await FileSystem.makeDirectoryAsync(dir, { intermediates: true }); } catch { /* 이미 존재 */ }
      const ext = (srcUri.split('?')[0].match(/\.(jpg|jpeg|png|webp|heic)$/i)?.[1] || 'jpg').toLowerCase();
      // 난수 접미사 — 퍼즐 확정처럼 한 흐름에서 두 장(크롭본+원본)을 같은 ms에 저장해도 안 겹치게
      const to = `${dir}photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
      await FileSystem.copyAsync({ from: srcUri, to });
      return to;
    }
  } catch { /* 복사 실패 → 원본 URI 유지 */ }
  return srcUri;
}

// Documents/puzzle/ 아래 우리가 만든 사본만 지운다 — 기록 사진·앨범 원본(피커 캐시)은 건드리지 않는다
function deletePuzzleFile(uri?: string) {
  if (!uri || !uri.includes(`/${PUZZLE_MEDIA_DIR}`)) return;
  try {
    const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  } catch { /* 파일 정리 실패는 무시 — 참조는 이미 지웠다 */ }
}

export default function MainScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { records, tripGroups, requestNeighbor, isNeighbor, isNeighborRequested, getCountryPhoto } = useRecords();
  // 기록의 지역/국가명 현지화 — 영어 모드면 지역은 regionNameEn, 국가는 KO_TO_EN(로컬)
  // 한글 국가명 → 영어(영어 모드). MainScreen은 countryLabel util을 import하면 순환이라 로컬 KO_TO_EN 사용
  const countryEn = (ko: string): string => {
    if (i18n.language !== 'en' || !ko) return ko;
    if (SHORT_COUNTRY_EN[ko]) return SHORT_COUNTRY_EN[ko]; // 미국→U.S, 영국→U.K
    return ko === '대한민국' ? 'South Korea' : (KO_TO_EN[ko] ?? ko);
  };
  const recPlace = (rec: { regionName?: string; regionNameEn?: string; countryName?: string }): string => {
    // regionNameEn이 마이그레이션된 ISO 코드면 표시용으로는 한글명으로 폴백한다
    if (rec.regionName) return regionDisplayName(rec.regionName, rec.regionNameEn, i18n.language);
    return countryEn(rec.countryName || '');
  };

  // ── 튜토리얼(코치마크) ──
  // 측정 대상: 지구본(WebView) / 모드 토글 / 지구본 설정 버튼 / 스냅 버튼 / FAB. measureInWindow를 쓰므로 any로 둔다.
  const globeRef = useRef<any>(null);
  const toggleRef = useRef<any>(null);
  const settingsRef = useRef<any>(null);
  // 스냅 버튼은 탭 바 오버레이(RecordFab) 안이라 직접 측정이 불가하다.
  // 같은 절대 제약(right:46, bottom:insets.bottom+129, 60×60)으로 숨김 앵커를 깔고 이를 측정해
  // Dimensions 높이 오차(내비바 등) 없이 실제 위치를 얻는다.
  const snapAnchorRef = useRef<any>(null);
  const [coachVisible, setCoachVisible] = useState(false);
  const [coachSteps, setCoachSteps] = useState<CoachStep[]>([]);

  // 튜토리얼 중에는 탭 바도 함께 어둡게 처리되도록 전역 신호 동기화.
  useEffect(() => {
    setCoachActive(coachVisible);
    return () => setCoachActive(false);
  }, [coachVisible]);

  // 메인 튜토리얼 시작 — 강조할 요소들을 측정해 단계를 만들고 코치마크를 띄운다.
  // 반환값은 취소 함수(효과의 cleanup으로 그대로 사용).
  const coachRunRef = useRef(false); // 같은 화면 인스턴스에서 중복 실행 방지
  const startCoach = (force = false) => {
    if (coachRunRef.current && !force) return () => {};
    coachRunRef.current = true;
    let cancelled = false;
    let shown = false;
    (async () => {
      traceStart('coach:main');
      // 고정 지연(구 450ms) 대신 화면 전환이 실제로 끝나는 신호를 기다린다.
      await whenReadyToMeasure();
      if (cancelled) return;
      traceStep('coach:main', 'waited');
      const [globe, toggle, settings, snapMeasured] = await Promise.all([
        measureWithRetry(globeRef),
        measureWithRetry(toggleRef),
        measureWithRetry(settingsRef),
        measureWithRetry(snapAnchorRef), // 숨김 앵커 → 스냅 버튼 실제 위치
      ]);
      if (cancelled) return;
      traceStep('coach:main', 'measured');
      const WIN_W = Dimensions.get('window').width;
      // 코치마크 rect는 창 절대 좌표(measureInWindow 계약)다. 폴백도 같은 좌표계여야 한다.
      const STAGE_W = clampStageWidth(WIN_W);
      const GUTTER = Math.max(0, (WIN_W - STAGE_W) / 2);
      const FAB_BTN = 56;
      const SNAP_BTN = 60;
      // 측정 성공 시 실제 위치, 실패 시 상수 폴백
      const snap: CoachRect = snapMeasured ?? {
        // 스냅 버튼(RecordFab styles.snap)은 right:46 — 창이 아니라 "컬럼" 오른쪽
        // 가장자리 기준이다. 창 좌표로 옮기려면 컬럼 시작점(GUTTER)을 더해야 한다.
        // 창 폭 그대로 쓰면 폴드·태블릿에서 강조 구멍이 gutter만큼 오른쪽으로 빗나간다.
        x: GUTTER + STAGE_W - 46 - SNAP_BTN, // 컬럼 우측 (오른쪽 모서리 46px 안쪽)
        y: height - ((insets.bottom || 0) + 129) - SNAP_BTN, // 탭 바 위 우측
        width: SNAP_BTN,
        height: SNAP_BTN,
      };
      // FAB(+) 는 CustomTabBar 레이어(탭 바 위)로 이동해 ref 측정이 불가하다.
      // 스냅 앵커가 실측됐으면 거기서 유도한다 — 둘 다 bottom 고정 상수라
      // fabY = snapY + (129-73) + (60-56) = snapY + 60. 이렇게 하면 window 높이 오차
      // (안드로이드 내비바 등)가 스냅과 똑같이 상쇄된다. 실측 실패 시에만 상수 폴백.
      const fab: CoachRect = {
        // 여기만 창 폭(WIN_W)을 그대로 쓰는 게 맞다 — 바로 위 snap.x와 의도적으로 다르다.
        // FAB는 컬럼 중앙 정렬(RecordFab fabWrap: left0/right0 + alignItems:'center')이고
        // 컬럼 자체가 창 중앙에 있어 GUTTER + STAGE_W/2 === WIN_W/2 (항등식)다.
        // 즉 gutter 보정을 더해도 값이 같다. 오른쪽 정렬인 snap.x만 보정이 필요하다.
        x: WIN_W / 2 - FAB_BTN / 2,
        y: snapMeasured
          ? snapMeasured.y + 60
          : height - ((insets.bottom || 0) + 73) - FAB_BTN, // 하단 중앙, 탭 바 위 겹침
        width: FAB_BTN,
        height: FAB_BTN,
      };
      // 하단 버튼(스냅·FAB)을 강조하는 단계의 말풍선은 가장 높은 하단 버튼(스냅) 위로 올린다.
      // 스냅·FAB는 탭 바 위 오버레이(말풍선보다 앞 레이어)라, 겹치면 버튼이 말풍선을 가리기 때문.
      // 박스 하단을 스냅 버튼 위 24px 지점에 고정 → 위로 펼쳐짐. (측정된 실제 y 기준)
      const bottomTipBottom = height - snap.y + 24;
      // 스냅 버튼은 원형이라 사각형 대신 원형 스포트라이트로 강조(사각 테두리 제거).
      // 반지름은 기존 사각 강조(버튼 + PAD 8)와 동일하게 유지.
      const snapCircle = {
        cx: snap.x + snap.width / 2,
        cy: snap.y + snap.height / 2,
        r: snap.width / 2 + 8,
      };
      // 지구본(WebView)의 실제 프레임에서 three.js 투영 상수로 원을 계산.
      // GlobeView는 두 형태(aurora·classic) 모두 카메라를 화면 정중앙(camera.position.y=0)에 두고
      // 디스크를 화면 폭의 85%로 그린다 → 중심=세로 정중앙, 반지름≈폭×0.44(지름 0.85의 반 + 여유).
      const globeCircle = globe
        ? { cx: globe.x + globe.width / 2, cy: globe.y + globe.height / 2, r: globe.width * 0.44 }
        : undefined;
      setCoachSteps([
        {
          rect: globe,
          shape: 'circle', // 지구본은 원형으로 강조
          circleWin: globeCircle,
          // 제목 앞 아이콘 — 기본 이모지 대신 앱 아이콘(스킨 강조색)
          icon: <GlobeIcon size={16} color={skinAccent.accent} />,
          title: t('main.coachGlobeTitle'),
          desc: t('main.coachGlobeDesc'),
        },
        // 대륙 모드가 꺼져 있으면 토글이 렌더되지 않아 측정값이 null이다 — 단계를 건너뛴다.
        ...(REGION_MAP_ENABLED
          ? [{ rect: toggle, title: t('main.coachToggleTitle'), desc: t('main.coachToggleDesc') }]
          : []),
        { rect: settings, title: t('main.coachFormTitle'), desc: t('main.coachFormDesc') },
        { rect: snap, shape: 'circle', circleWin: snapCircle, tipBottom: bottomTipBottom, keepBright: 'snap', icon: <CameraIcon size={16} color={skinAccent.accent} />, title: t('main.coachSnapTitle'), desc: t('main.coachSnapDesc') },
        { rect: fab, tipBottom: bottomTipBottom, keepBright: 'fab', title: t('main.coachFabTitle'), desc: t('main.coachFabDesc') },
      ]);
      setCoachVisible(true);
      // 커밋·페인트가 끝난 다음 프레임에 찍어야 '등장까지 걸린 시간'이 된다
      requestAnimationFrame(() => traceEnd('coach:main', 'visible'));
      shown = true;
      // 계정당 1회 기록 — 설정 컨텍스트를 구독하는 모든 탭 화면이 리렌더되므로,
      // 오버레이 등장 애니메이션이 끝난 뒤로 미뤄 등장 프레임에 커밋이 겹치지 않게 한다.
      setTimeout(() => markTutorialSeen('main'), 900);
      // 재진입(탭 전환 후 복귀) 시 다시 뜨지 않도록 플래그 제거
      if (route.params?.startTutorial) navigation.setParams({ startTutorial: undefined });
    })();
    return () => {
      // 타이머가 사라졌으므로 취소는 이 플래그로만 한다. 각 await 뒤에서 확인한다.
      cancelled = true;
      // 띄우기 전에 취소됐다면(탭 전환 등) 다음 진입에서 다시 시도할 수 있게 되돌린다
      if (!shown) coachRunRef.current = false;
    };
  };

  // 트리거 1 — 기록 완성 화면의 "튜토리얼 진행하기" 또는 설정의 '튜토리얼 보기'(replay).
  // replay는 1회 게이트를 무시하고 강제 재생한다.
  useEffect(() => {
    const p = route.params?.startTutorial;
    if (!p) return;
    if (tutorialsSeen.main && p !== 'replay') {
      navigation.setParams({ startTutorial: undefined });
      return;
    }
    return startCoach(p === 'replay');
  }, [route.params?.startTutorial]);

  // 헤더 벨의 미읽음 알림 개수 — 서버 notifications 테이블 기준(count만 조회).
  // 예전엔 false로 고정돼 배지가 뜬 적이 없었다.
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  // 화면에 들어올 때마다 갱신 — 알림 화면에서 읽고 돌아오면 배지가 내려간다
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      fetchUnreadNotificationCount().then((n) => { if (alive) setUnreadAlerts(n); });
      return () => { alive = false; };
    }, [])
  );
  // 실시간 구독 — 앱을 켜둔 채로도 새 알림이 도착하면 배지가 바로 오른다
  // (포커스 갱신만으로는 화면을 나갔다 와야 반영됐다)
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let alive = true;
    getMyUserId().then((uid) => {
      if (!alive || !uid) return;
      unsub = subscribeNotifications(uid, () => {
        fetchUnreadNotificationCount().then((n) => { if (alive) setUnreadAlerts(n); });
      });
    });
    return () => { alive = false; unsub?.(); };
  }, []);
  const [sheetOpen, setSheetOpen] = useState(false);

  // 광고(스폰서) 패키지 — 지구본 마커 탭 시 뜨는 카드
  const [selectedAd, setSelectedAd] = useState<SponsoredPackage | null>(null);
  // 지구본 팝업광고(스폰서 마커) 노출 여부 — 현재 숨김(추후 활성화 시 true)
  const SHOW_GLOBE_ADS = false;
  const sponsoredMarkerItems = useMemo(() => (SHOW_GLOBE_ADS ? getSponsoredMarkerItems() : []), []);
  // 방문한 나라 바텀시트 활성화 여부 (첫 출시 시 제외, 추후 보완하여 활성화 예정)
  const SHOW_VISITED_SHEET = false;
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [countrySheetOpen, setCountrySheetOpen] = useState(false);
  // 국가 시트 하단 버튼 바의 실측 높이(스크롤 여백용). 측정 전에는 기존 고정값을 쓴다
  const [countryBottomH, setCountryBottomH] = useState(84);

  // 기록형식 선택 모달
  const [formatModalVisible, setFormatModalVisible] = useState(false);
  const [pendingCountry, setPendingCountry] = useState<{ name: string; code: string; region?: string; regionEn?: string } | null>(null);

  // 지역(주) 기존 기록 보기 모달
  const [regionRecordsVisible, setRegionRecordsVisible] = useState(false);
  const [regionRecords, setRegionRecords] = useState<TravelRecord[]>([]);
  const [regionRecordsTitle, setRegionRecordsTitle] = useState('');

  // 지구본/대륙 표시 설정 — settingsStore에서 영속 관리
  const {
    globeVariant, setGlobeVariant,
    globeSkin, setGlobeSkin,
    isPremium,
    globeDisplayMode, setGlobeDisplayMode,
    regionGlobalMode, setRegionGlobalMode,
    globeColor, setGlobeColor,
    countryColors, setCountryColors,
    countryDisplayModes, setCountryDisplayModes,
    regionDisplayModes, setRegionDisplayModes,
    regionColors, setRegionColors,
    puzzleImages, setPuzzleImages,
    puzzleSources, setPuzzleSources,
    regionPhotos, setRegionPhotos,
    taggedRegions, setTaggedRegions,
    dismissedRegionTagChips, setDismissedRegionTagChips,
    regionFavoriteCodes, toggleRegionFavorite,
    skinColorStore, setSkinColorStore,
    tutorialsSeen, markTutorialSeen,
    handle,
  } = useSettings();

  // 트리거 2 — 계정당 1회: 메인 탭에 처음 들어왔을 때 자동 시작.
  // (기록 완성 화면에서 파라미터로 들어온 경우는 트리거 1이 처리하므로 여기선 비켜준다)
  useFocusEffect(
    useCallback(() => {
      if (tutorialsSeen.main || route.params?.startTutorial) return;
      return startCoach();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tutorialsSeen.main, route.params?.startTutorial])
  );

  // ATT(앱 추적 투명성) — 메인 진입에서 확실히 1회 요청한다.
  // 원래는 첫 광고 요청(useFeedAdSource)에만 걸려 있었는데, 소셜 피드는 게시물이
  // 2개 미만이면 광고 슬롯 자체를 만들지 않아(SocialScreen) 새 계정에선 ATT가 영영
  // 뜨지 않았고, 심사에서 "ATT 요청을 찾을 수 없다"(2.1)로 거절됐다(2026-08-18).
  // - 온보딩 직후엔 코치마크와 겹치지 않게 닫힌 뒤에 요청한다. 신규 계정은
  //   tutorialsSeen.main이 false로 시작하고 코치마크 등장 900ms 뒤 true가 되므로,
  //   "seen && !visible"은 정확히 코치마크 종료(또는 기존 계정의 즉시) 시점이다.
  // - requestTrackingPermission은 promise 캐시 + 결정된 상태 즉시 반환이라
  //   재실행돼도 시스템 팝업은 1회뿐이고, useFeedAdSource도 같은 promise를 기다린다.
  // - 8/2 심사 대응(로그인 전 스플래시 위 선요구 금지)과 어긋나지 않는다 —
  //   여기는 로그인·온보딩이 끝난 첫 화면이다.
  useEffect(() => {
    if (!tutorialsSeen.main || coachVisible) return;
    requestTrackingPermission();
  }, [tutorialsSeen.main, coachVisible]);

  // 초대 귀속 소비 — 미인증 상태에서 받은 초대 딥링크(pendingInvite)를 온보딩 완료 후
  // 첫 메인 진입에서 메이트 연결 넛지(커스텀 모달)로 소비한다(원샷 — consume이 삭제하므로 재등장 없음)
  const [inviteNudge, setInviteNudge] = useState<InviteNudgeTarget | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    (async () => {
      const invHandle = await consumePendingInvite();
      if (!alive || !invHandle) return;
      // 본인 초대(내 링크)면 무시
      if (handle && invHandle.toLowerCase() === handle.toLowerCase()) return;
      const p = await getProfileByHandle(invHandle);
      if (!alive || !p) return; // 미가입·조회 실패 — 조용히 폐기
      // 이미 메이트/신청중이면 넛지 불필요
      if (isNeighbor(p.id) || isNeighborRequested(p.id)) return;
      if (alive) setInviteNudge({ userId: p.id, handle: p.handle || invHandle, photo: p.profile_photo });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [displaySettingsVisible, setDisplaySettingsVisible] = useState(false);
  const [editingCountryColor, setEditingCountryColor] = useState<string | null>(null);

  // 표시 설정 모달은 라이브로 적용되므로, 열 때 스냅샷을 떠두고 "취소(바깥 탭)" 시 원복한다.
  // ⚠️ puzzleImages와 regionGlobalMode(사진/퍼즐 토글)는 스냅샷에 넣지 않는다 — 색상 팔레트처럼
  //    '훑어보는 미리보기'가 아니라 명시적 확정이라, 바깥 탭으로 닫을 때 원복하면 방금 고른
  //    사진·모드가 조용히 버려져 "바꿔도 적용이 안 된다"로 보인다(실기기 보고 2건: 퍼즐 사진,
  //    그리고 퍼즐로 바꿔도 지도가 기존 사진 모드로 남던 문제). 고르는 즉시 확정으로 취급한다.
  const dsSnapshot = useRef<{
    globeDisplayMode: MapDisplayMode;
    globeColor: string;
    globeSkin: string;
    countryColors: Record<string, string>;
    countryDisplayModes: Record<string, MapDisplayMode>;
    regionDisplayModes: Record<string, 'color' | 'photo'>;
    regionColors: Record<string, string>;
    skinColorStore: Record<string, SkinColorSet>;
  } | null>(null);
  const openDisplaySettings = () => {
    dsSnapshot.current = { globeDisplayMode, globeColor, globeSkin, countryColors, countryDisplayModes, regionDisplayModes, regionColors, skinColorStore };
    setDisplaySettingsVisible(true);
  };
  const cancelDisplaySettings = () => {
    const s = dsSnapshot.current;
    if (s) {
      // 스킨 먼저 복원 — setGlobeSkin(테마드 세터)이 색 스왑+아이콘 팔레트를 수행하므로, 그 뒤에 스냅샷 색으로 덮어써야 한다
      if (s.globeSkin !== globeSkin) setGlobeSkin(s.globeSkin);
      setGlobeDisplayMode(s.globeDisplayMode);
      setGlobeColor(s.globeColor);
      setCountryColors(s.countryColors);
      setCountryDisplayModes(s.countryDisplayModes);
      setRegionDisplayModes(s.regionDisplayModes);
      setRegionColors(s.regionColors);
      setSkinColorStore(s.skinColorStore); // 미리보기 중 스킨 스왑이 저장소에 남긴 값까지 원복
    }
    dsSnapshot.current = null;
    setEditingCountryColor(null);
    setDisplaySettingsVisible(false);
  };
  const confirmDisplaySettings = () => {
    dsSnapshot.current = null;
    setEditingCountryColor(null);
    setDisplaySettingsVisible(false);
  };

  // 갤러리에서 사진 가져오기 → 표시 모드를 사진으로 전환
  const handlePickGlobePhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { showPermissionDeniedAlert(t('permission.gallery')); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!res.canceled) {
      setGlobeDisplayMode('photo');
      setEditingCountryColor(null);
    }
  };

  // (국가/지역별 개별 표시 설정도 settingsStore에서 영속 관리 — 위 useSettings 참조)

  // 지구본/대륙 전환
  const [viewMode, setViewMode] = useState<'globe' | 'region'>('globe');
  const [regionCountry, setRegionCountry] = useState<string | null>(null); // ISO3 코드
  // 국가 선택 그리드는 7개+돋보기만 노출 — 전체 목록(26개국)은 검색 시트에서 (사용자 확정 디자인)
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [countryPickerSearch, setCountryPickerSearch] = useState('');
  // 대륙(국가 지역) 화면 검색/필터
  const [regionSearch, setRegionSearch] = useState('');
  // "인기명소 모아보기" — 누르면 명소 도시가 속한 주들을 강조 (도시 폴리곤은 NE에 없어 주 단위)
  const [popularActive, setPopularActive] = useState(false);

  // 영→한 역매핑 — 별칭이 있는 영문명은 '먼저 정의된 표준 표기'가 이긴다.
  // (마지막 항목이 덮어쓰면 'South Korea'→'한국'이 되어, '대한민국'으로 저장된
  //  국내 기록의 대표 사진 조회가 전부 빗나갔다)
  const EN_TO_KO: Record<string, string> = useMemo(() => {
    const m: Record<string, string> = {};
    Object.entries(KO_TO_EN).forEach(([ko, en]) => { if (!m[en]) m[en] = ko; });
    return m;
  }, []);

  // 기록된 국가 → GlobeView에 전달할 방문국가 목록
  const visitedNameSet = useMemo(() => {
    const nameSet = new Set<string>();
    records.forEach(r => {
      if (r.viewType === 'snap') return; // 스냅만 기록된 국가는 지구본 활성화 제외 (실제 기록이 있어야 활성화)
      if (r.countryName) {
        const en = KO_TO_EN[r.countryName];
        if (en) nameSet.add(en);
      }
      r.countries?.forEach(c => {
        const en = KO_TO_EN[c.name];
        if (en) nameSet.add(en);
      });
    });
    return nameSet;
  }, [records]);

  // 지구본(WebView)은 file:// 이미지를 직접 못 그려서, 대표 사진을 작은 data URI(base64)로 변환해 캐시
  const globePhotoCacheRef = useRef<Record<string, string>>({});
  const [globePhotoVersion, setGlobePhotoVersion] = useState(0);

  const visitedCountries: VisitedCountry[] = useMemo(() => {
    return Array.from(visitedNameSet).map(nameEn => {
      const koName = EN_TO_KO[nameEn] || nameEn;
      return {
        nameEn,
        color: countryColors[nameEn] || undefined,
        photo: getCountryPhoto(koName) || undefined,
        mode: countryDisplayModes[nameEn] || undefined,
      };
    });
  }, [visitedNameSet, countryColors, countryDisplayModes, EN_TO_KO, getCountryPhoto]);

  // 대표 사진(file://)을 지구본용 data URI 로 변환 (아직 변환 안 된 것만)
  useEffect(() => {
    let cancelled = false;
    const uris = Array.from(new Set(visitedCountries.map(c => c.photo).filter(Boolean) as string[]));

    // 더 이상 쓰이지 않는 항목은 버린다. 이걸 안 하면 대표 사진을 바꾸거나 기록을 지울 때마다
    // 옛 URI의 base64가 캐시에 남고, MainScreen 은 탭 화면이라 언마운트되지 않아 세션 내내
    // 쌓이기만 했다. 1024px JPEG 의 base64 는 JS 문자열(UTF-16)로 장당 수백 KB다.
    // (현재 방문국 수만큼은 지구본이 동시에 그리므로 남는 게 맞다 — 상한을 더 낮출 수는 없다)
    const live = new Set(uris);
    for (const key of Object.keys(globePhotoCacheRef.current)) {
      if (!live.has(key)) delete globePhotoCacheRef.current[key];
    }

    const todo = uris.filter(u => globePhotoCacheRef.current[u] === undefined);
    if (todo.length === 0) return;
    (async () => {
      let wrote = false;
      for (const u of todo) {
        const d = await imageToDataUri(u);
        if (cancelled) return;
        globePhotoCacheRef.current[u] = d ?? ''; // '' = 변환 실패(재시도 안 함)
        wrote = true;
      }
      // 실패('')도 반드시 반영한다 — photoPending(=변환 대기)이 풀리는 신호이기 때문.
      // 성공분만 반영하던 때는, 전부 실패하는 사진(iCloud 오프로드 등)만 있는 나라가
      // 영영 '대기'로 남아 유리 채움에서 색 폴백으로 못 넘어간다.
      if (wrote && !cancelled) setGlobePhotoVersion(v => v + 1);
    })();
    return () => { cancelled = true; };
  }, [visitedCountries]);

  // 지구본 형태별 강제 표시 모드: aurora = 색상(color), classic = 사진(photo)
  const globeForcedMode: GlobeDisplayMode = globeVariant === 'aurora' ? 'color' : 'photo';
  // 지구본 스킨 — 색 활성화(aurora) 폼에만 적용, classic은 기본 테마 유지
  const globeSkinTheme = globeVariant === 'aurora' ? getGlobeSkinTheme(globeSkin) : undefined;
  // 유리 구슬(classic) 배경은 래스터라 팔레트 교체가 안 된다 — 색상 회전값만 넘겨 CSS로 돌린다.
  // 네온 팔레트(themeOverride)와 달리 classic 폼에서만 의미가 있다.
  const glassBgHue = globeVariant === 'aurora' ? 0 : getGlassBgHue(globeSkin);
  // 앱 강조색 — 지구본 스킨에 맞춘 통일 색(단계적 마이그레이션). aurora는 기존값과 동일.
  const skinAccent = getSkinAccent(globeSkin);
  // 대륙 칩(국가표시·인기명소) 내부 배경 — 스킨 강조색을 어둡게 깐 불투명색(기존 #2A0F3E 대체)
  const skinChipBg = `rgb(${Math.round(skinAccent.rgb[0] * 0.22)},${Math.round(skinAccent.rgb[1] * 0.22)},${Math.round(skinAccent.rgb[2] * 0.22)})`;
  // ── 국가 선택 그리드 7칸 (2026-08-23 즐겨찾기 도입) ──
  // 즐겨찾기(사용자가 별을 켠 '순서')가 앞을 채우고, 모자란 만큼 REGION_COUNTRIES 기본
  // 순서로 보충한다(이미 즐겨찾기에 든 나라는 중복 제외). 즐겨찾기가 하나도 없으면 결과가
  // 도입 전 `REGION_COUNTRIES.slice(0, 7)`과 정확히 같다 — 기본 동작을 바꾸지 않기 위한 설계다.
  // 8개 이상 켜는 것 자체는 막지 않고(사용자 확정), 앞 7개만 여기 나온 뒤 시트가 그 사실을 알린다.
  // 거주국(KOR) 특별 취급 없음.
  const gridCountries = useMemo(() => {
    const byCode = new Map(REGION_COUNTRIES.map((c) => [c.code, c]));
    // 저장본에 낯선 코드가 섞여 있어도(구·신 버전 백업 교차) 조용히 건너뛴다
    const favs = regionFavoriteCodes
      .map((code) => byCode.get(code))
      .filter((c): c is (typeof REGION_COUNTRIES)[number] => c != null);
    const picked = new Set(favs.map((c) => c.code));
    return [...favs, ...REGION_COUNTRIES.filter((c) => !picked.has(c.code))].slice(0, 7);
  }, [regionFavoriteCodes]);
  // 폼이 모드를 강제하므로 개별 mode를 덮어쓰고, 사진은 변환된 data URI 로 교체
  const globeVisitedCountries = useMemo(
    () => visitedCountries.map(c => {
      const conv = c.photo ? globePhotoCacheRef.current[c.photo] : undefined;
      return {
        ...c,
        mode: globeForcedMode,
        photo: conv || undefined,
        // 변환 대기 중(캐시에 아직 항목 없음)이면 '사진 있음'을 지구본에 알린다.
        // 안 알리면 유리 지구본이 사진 없는 방문국으로 보고 활성색을 구워, 첫 시작 때
        // 색 → 사진 깜빡임이 난다(globePhotoCacheRef는 메모리라 콜드 스타트마다 비어 있다).
        // 변환 실패('')는 대기가 아니라 최종 상태 → 색 채움이 맞다.
        photoPending: !!c.photo && conv === undefined,
      };
    }),
    [visitedCountries, globeForcedMode, globePhotoVersion],
  );

  // 현재 선택된 대륙 국가의 기록된 지역 목록
  // 2026-08-06 퍼즐 도입 — 지역별 색/모드 읽기 중단(저장 데이터는 보존, regionModeMigration 참고)
  const recordedRegions = useMemo(() => {
    if (!regionCountry) return [];
    const countryKo = ISO3_TO_KO[regionCountry];
    if (!countryKo) return [];

    const regionsMap = new Map<string, { name: string; nameEn: string; key: string; photo?: string }>();

    // 실제 기록(store)에서 이 국가의 기록된 지역 수집
    records.forEach(r => {
      if (r.viewType === 'snap') return; // 스냅만 기록된 지역은 대륙(지역) 활성화 제외
      const matchCountry = r.countryName === countryKo || r.countries?.some(c => c.name === countryKo);
      if (matchCountry && r.regionNameEn) {
        let photo: string | undefined;
        if (r.perCountryData?.[countryKo]?.representativePhoto) {
          photo = r.perCountryData[countryKo].representativePhoto;
        } else if (r.countryName === countryKo && r.representativePhoto) {
          photo = r.representativePhoto;
        } else if (r.viewType === 'cut' && r.cutPhoto?.previewUri) {
          photo = r.cutPhoto.previewUri;
        } else if (r.medias && r.medias.length > 0) {
          photo = r.medias[0];
        }

        // 지도 매칭 키는 코드(CODE) — 26개국 기록은 마이그레이션돼 이미 코드이고(멱등 통과),
        // 한국 국내 기록은 시/도 프리셋 어휘('Seoul' 등)로 저장되므로 여기서 코드(KR-11)로 해석한다.
        const nameEnCode = resolveRegionCode(regionCountry, r.regionNameEn) ?? r.regionNameEn;
        const key = `${regionCountry}|${nameEnCode}`; // 국가별 복합 키 (동명 지역 충돌 방지)
        regionsMap.set(nameEnCode, {
          // 한글 지역명이 없으면 지오의 이름으로 폴백한다. regionNameEn을 그대로 쓰면
          // 키 마이그레이션 이후 그 값이 ISO 코드라 목록에 'JP-13'이 노출됐다.
          name: r.regionName || regionNameByCode(regionCountry, nameEnCode, i18n.language) || r.regionNameEn,
          nameEn: nameEnCode,
          key,
          // 사용자가 직접 지정한 사진이 기록 대표사진보다 우선
          photo: regionPhotos[key] || photo,
        });
      }
    });

    // 소급 태깅 지역 병합 — 기록 유래 지역이 우선, 태그는 nameEn 미중복분만 추가.
    // 태그 지역의 사진은 이 국가 기록의 대표사진 폴백(없으면 undefined → 색 모드).
    const tagged = taggedRegions[regionCountry] || [];
    if (tagged.length > 0) {
      let countryPhoto: string | undefined;
      for (const r of records) {
        if (r.viewType === 'snap') continue;
        const matchCountry = r.countryName === countryKo || r.countries?.some(c => c.name === countryKo);
        if (!matchCountry) continue;
        countryPhoto = r.perCountryData?.[countryKo]?.representativePhoto
          || (r.countryName === countryKo ? r.representativePhoto : undefined)
          || (r.viewType === 'cut' ? r.cutPhoto?.previewUri : undefined)
          || (r.medias && r.medias.length > 0 ? r.medias[0] : undefined);
        if (countryPhoto) break;
      }
      tagged.forEach(tr => {
        if (regionsMap.has(tr.nameEn)) return;
        const key = `${regionCountry}|${tr.nameEn}`;
        regionsMap.set(tr.nameEn, {
          name: tr.name,
          nameEn: tr.nameEn,
          key,
          photo: regionPhotos[key] || countryPhoto,
        });
      });
    }

    return Array.from(regionsMap.values());
  }, [records, regionCountry, taggedRegions, regionPhotos, i18n.language]);

  // 대륙 모드 진행도 — "47곳 중 5곳". 방문 지역만 있고 전체 수가 없으면 수집의 감각이 안 생긴다.
  // 분자는 지오에 실제로 있는 코드만 센다(오래된 코드가 섞여 분모를 넘는 것을 막는다).
  const regionProgress = useMemo(() => {
    if (!regionCountry) return null;
    const total = totalRegionCount(regionCountry);
    if (total === 0) return null; // 지역 데이터 미수록 국가 — 진행도를 숨긴다
    return { visited: visitedRegionCount(regionCountry, recordedRegions.map(r => r.nameEn)), total };
  }, [regionCountry, recordedRegions]);

  // 진행도 바 — 값이 바뀌면 방문 비율까지 부드럽게 차오른다 (width 보간은 레이아웃 속성이라 JS 드라이버)
  const regionBarAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!regionProgress) { regionBarAnim.setValue(0); return; }
    Animated.timing(regionBarAnim, {
      toValue: regionProgress.total > 0 ? regionProgress.visited / regionProgress.total : 0,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [regionProgress, regionBarAnim]);

  // 현재 나라의 퍼즐 그림 — 사용자 사진 전용(기본 아트 폐지). 없으면 undefined →
  // CountryMapView가 퍼즐 레이어를 그리지 않고, 시트에 사진 선택 안내가 뜬다.
  const puzzleImage = regionCountry ? puzzleImages[regionCountry] : undefined;
  // 퍼즐 그림 후보 — 이 나라 기록의 대표사진들 + 앨범에서 골라둔 현재 그림(후보 목록에
  // 없으면 맨 앞에 붙여 선택 상태가 보이게 한다)
  const puzzleCandidates = useMemo(() => {
    const fromRecords = Array.from(new Set(recordedRegions.map(r => r.photo).filter((u): u is string => !!u)));
    if (puzzleImage && !fromRecords.includes(puzzleImage)) return [puzzleImage, ...fromRecords];
    return fromRecords;
  }, [recordedRegions, puzzleImage]);
  // 시트 실루엣 미리보기 — 선택한 퍼즐 그림이 나라 모양으로 어떻게 잘리는지 확정 상태로
  // 보여준다(56px 정사각 썸네일만으론 결과를 예측할 수 없었다). 크롭본 비율 == 나라 bbox
  // 비율이라 slice로 깔면 지도와 같은 부분이 보인다.
  const puzzlePreview = useMemo(() => {
    if (!regionCountry || !puzzleImage) return null;
    const shape = buildCountryShape(regionCountry);
    if (!shape) return null;
    const maxW = width - 88;
    const maxH = 150;
    let w = maxW, h = w * (shape.dy / shape.dx);
    if (h > maxH) { h = maxH; w = h * (shape.dx / shape.dy); }
    return { w, h, ...buildSilhouettePaths(shape, w, h, 3000) };
  }, [regionCountry, puzzleImage]);

  // 퍼즐 범위 조정 오버레이 — 후보/앨범에서 사진을 고르면 열리고, 여기서 나라 실루엣을
  // 대고 범위를 정한 크롭본이 최종 퍼즐 그림이 된다(바로 저장하지 않는다).
  // source는 크롭 전 원본 — 재조정을 항상 원본에서 시작해 '크롭의 크롭'(재조정마다
  // 1280px JPG를 다시 잘라 화질 저하·범위 축소 불가)을 막는다.
  // fromAlbum이면 확정 시 원본도 영속화한다(피커 캐시는 OS가 지운다 — 기록 사진은 이미 영속).
  const [puzzleAdjust, setPuzzleAdjust] = useState<{ source: string; fromAlbum: boolean } | null>(null);
  const puzzleSource = regionCountry ? puzzleSources[regionCountry] : undefined;
  const confirmPuzzleAdjust = useCallback(async (croppedUri: string) => {
    const adj = puzzleAdjust;
    if (!regionCountry || !adj) { setPuzzleAdjust(null); return; }
    // 크롭 결과는 캐시 경로다 — 피커 캐시와 같은 이유로 documentDirectory에 영속화한다
    // (OS 캐시 정리로 소실·재빌드 복구(remapDocUri) 불가 방지)
    const crop = await persistMapPhoto(croppedUri, PUZZLE_MEDIA_DIR);
    const source = adj.fromAlbum ? await persistMapPhoto(adj.source, PUZZLE_MEDIA_DIR) : adj.source;
    const oldCrop = puzzleImages[regionCountry];
    const oldSource = puzzleSources[regionCountry];
    setPuzzleImages(prev => ({ ...prev, [regionCountry]: crop }));
    setPuzzleSources(prev => ({ ...prev, [regionCountry]: source }));
    // 교체로 참조가 끊긴 이전 사본 정리 — 안 지우면 재조정할 때마다 Documents/puzzle/에
    // 고아 파일이 쌓인다. 같은 원본 재조정이면 oldSource === source라 원본은 남는다.
    [oldCrop, oldSource].forEach(u => { if (u && u !== crop && u !== source) deletePuzzleFile(u); });
    setPuzzleAdjust(null);
  }, [regionCountry, puzzleAdjust, puzzleImages, puzzleSources, setPuzzleImages, setPuzzleSources]);
  // 현재 퍼즐 그림 제거 — 그림이 없으면 지도에 퍼즐이 안 그려지고 시트에 사진 선택 안내가 뜬다.
  // 우리가 만든 사본(크롭본·앨범 원본, Documents/puzzle/)만 파일 정리한다(기록 사진은 건드리지 않는다).
  const removePuzzleImage = useCallback(() => {
    if (!regionCountry) return;
    const curCrop = puzzleImages[regionCountry];
    const curSource = puzzleSources[regionCountry];
    setPuzzleImages(prev => {
      const next = { ...prev };
      delete next[regionCountry];
      return next;
    });
    setPuzzleSources(prev => {
      const next = { ...prev };
      delete next[regionCountry];
      return next;
    });
    deletePuzzleFile(curCrop);
    if (curSource !== curCrop) deletePuzzleFile(curSource);
  }, [regionCountry, puzzleImages, puzzleSources, setPuzzleImages, setPuzzleSources]);
  // 앨범에서 퍼즐 그림 선택 → 범위 조정으로
  const pickPuzzleImage = useCallback(async () => {
    if (!regionCountry) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { showPermissionDeniedAlert(t('permission.gallery')); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      // 영속화는 조정 확정 시 — 여기서 저장하면 취소해도 파일이 쌓인다
      setPuzzleAdjust({ source: result.assets[0].uri, fromAlbum: true });
    }
  }, [regionCountry, t]);

  // 퍼즐 완성 공유 카드 — 완성 연출(펄스+경계선 페이드+광택 스윕)이 끝난 뒤에 띄운다.
  // 나라를 옮기면 예약을 취소하고 카드도 닫는다(다른 나라 지도 위에 뜨면 안 된다).
  const [puzzleShareVisible, setPuzzleShareVisible] = useState(false);
  const puzzleShareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setPuzzleShareVisible(false);
    if (puzzleShareTimer.current) { clearTimeout(puzzleShareTimer.current); puzzleShareTimer.current = null; }
    return () => { if (puzzleShareTimer.current) clearTimeout(puzzleShareTimer.current); };
  }, [regionCountry]);

  // 지역별 사진 수동 지정 — 개별 설정 목록의 갤러리 버튼. 키는 regionColors와 같은 복합키.
  const pickRegionPhoto = useCallback(async (regionKey: string) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { showPermissionDeniedAlert(t('permission.gallery')); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      // 퍼즐 그림과 같은 이유로 documentDirectory에 영속화(피커 캐시는 OS가 지운다)
      const uri = await persistMapPhoto(result.assets[0].uri, REGION_PHOTO_DIR);
      setRegionPhotos(prev => ({ ...prev, [regionKey]: uri }));
    }
  }, [setRegionPhotos, t]);

  // ── 방문 지역 소급 태깅 (지구본 기록만 있는 국가의 대륙 지역 활성화) ──
  const [regionTagSheetVisible, setRegionTagSheetVisible] = useState(false);
  const [regionTagSearch, setRegionTagSearch] = useState('');
  const [regionTagSelection, setRegionTagSelection] = useState<Set<string>>(new Set());
  // 선택 가능한 지역 목록 (평탄 배열)
  const regionTagOptions = useMemo(
    () => (regionCountry ? getCountryRegionOptions(regionCountry) : []),
    [regionCountry],
  );
  // 이 국가의 지구본 기록 수 (스냅 제외 — 대륙 활성화 규칙과 동일 기준)
  const regionCountryRecordCount = useMemo(() => {
    if (!regionCountry) return 0;
    const countryKo = ISO3_TO_KO[regionCountry];
    if (!countryKo) return 0;
    return records.filter(r =>
      r.viewType !== 'snap' && (r.countryName === countryKo || r.countries?.some(c => c.name === countryKo)),
    ).length;
  }, [records, regionCountry]);
  // 칩 닫기는 '이번 방문'에만 유효하다 — 나갔다 다시 들어오면 또 안내한다.
  // 예전엔 dismissedRegionTagChips가 영속이라 한 번 닫으면 그 나라에서는 영영 안 떴고,
  // 나중에 지역을 채우고 싶어져도 진입점이 사라졌다(설정에도 노출되지 않는다).
  // 진입(regionCountry가 그 나라로 바뀌는 시점)에 해제 기록을 지운다.
  useEffect(() => {
    if (!regionCountry) return;
    setDismissedRegionTagChips(prev =>
      prev.includes(regionCountry) ? prev.filter(c => c !== regionCountry) : prev, // 같으면 그대로 — 불필요한 저장 방지
    );
  }, [regionCountry, setDismissedRegionTagChips]);

  const showRegionTagChip =
    !!regionCountry && regionCountryRecordCount > 0 && recordedRegions.length === 0
    && !dismissedRegionTagChips.includes(regionCountry);
  const openRegionTagSheet = useCallback(() => {
    if (!regionCountry) return;
    setRegionTagSelection(new Set((taggedRegions[regionCountry] || []).map(t => t.nameEn)));
    setRegionTagSearch('');
    setRegionTagSheetVisible(true);
  }, [regionCountry, taggedRegions]);
  const saveRegionTags = useCallback(() => {
    if (!regionCountry) return;
    const all = regionTagOptions;
    const list: TaggedRegion[] = all
      .filter(o => regionTagSelection.has(o.nameEn))
      .map(o => ({ name: o.name, nameEn: o.nameEn }));
    setTaggedRegions(prev => {
      const next = { ...prev };
      if (list.length === 0) delete next[regionCountry];
      else next[regionCountry] = list;
      return next;
    });
    setRegionTagSheetVisible(false);
  }, [regionCountry, regionTagOptions, regionTagSelection, setTaggedRegions]);
  // 시트 내 검색 필터 (한글명·영문명·코드 모두 매칭)
  // nameEn은 이제 저장 키인 코드('JP-14')라 영문 검색에 쓸 수 없다 — 영문명은 latin(NAME_1)이다.
  // latin을 빼면 "kanagawa"로 아무것도 안 나온다.
  const regionTagFilter = useCallback((list: { name: string; nameEn: string; latin?: string }[]) => {
    const q = regionTagSearch.trim();
    if (!q) return list;
    const ql = q.toLowerCase();
    return list.filter(o =>
      o.name.includes(q)
      || o.nameEn.toLowerCase().includes(ql)
      || (o.latin || '').toLowerCase().includes(ql));
  }, [regionTagSearch]);

  // 고아(orphan) 표시 설정 정리 — 기록이 사라진 국가/지역의 설정을 영속 저장소에서 제거
  // (영속화 이후 누적 방지. 변경 없으면 같은 참조 반환 → 불필요한 저장/렌더 없음)
  useEffect(() => {
    // 설정 키(`${ISO3}|${코드}`)와 같은 어휘로 비교해야 한다 —
    // 기록의 원시 regionNameEn('Seoul')만 넣으면 코드 키('KR-11')가 전부 고아로 판정돼
    // 사용자의 지역 색/표시 모드 설정이 조용히 삭제됐다. 원시 표기와 해석된 코드를 함께 넣는다.
    const validRegions = new Set<string>();
    const addRegionVocab = (iso3: string | undefined, nameEn: string) => {
      validRegions.add(nameEn); // 미마이그레이션(구 표기) 설정 키도 살린다
      if (!iso3) return;
      const code = resolveRegionCode(iso3, nameEn);
      if (code) validRegions.add(code);
    };
    records.forEach(r => {
      if (!r.regionNameEn) return;
      // 기록의 국가(한글) → ISO3. 여러 국가가 묶인 기록은 후보 전부에 대해 해석한다.
      const isos = new Set<string>();
      if (r.countryName && KO_TO_ISO3[r.countryName]) isos.add(KO_TO_ISO3[r.countryName]);
      r.countries?.forEach(c => { const i = KO_TO_ISO3[c.name]; if (i) isos.add(i); });
      if (isos.size === 0) validRegions.add(r.regionNameEn);
      else isos.forEach(iso3 => addRegionVocab(iso3, r.regionNameEn!));
    });
    // 소급 태깅 지역의 색/모드 설정도 유효 — 태그가 살아있는 동안 지역별 설정이 지워지지 않게 포함
    // (taggedRegions의 키가 곧 ISO3 — nameEn은 이미 코드지만 멱등 해석으로 구 표기도 함께 받는다)
    Object.entries(taggedRegions).forEach(([iso3, list]) => list.forEach(tr => addRegionVocab(iso3, tr.nameEn)));
    const prune = <T,>(obj: Record<string, T>, valid: Set<string>): Record<string, T> => {
      const remove = Object.keys(obj).filter(k => !valid.has(k));
      if (remove.length === 0) return obj;
      const next = { ...obj };
      remove.forEach(k => delete next[k]);
      return next;
    };
    // 지역 키는 `${ISO3}|${regionEn}` 복합 → region 부분만 떼서 유효성 검사
    const pruneRegion = <T,>(obj: Record<string, T>): Record<string, T> => {
      const remove = Object.keys(obj).filter(k => {
        const regionPart = k.includes('|') ? k.split('|')[1] : k;
        return !validRegions.has(regionPart);
      });
      if (remove.length === 0) return obj;
      const next = { ...obj };
      remove.forEach(k => delete next[k]);
      return next;
    };
    setCountryColors(prev => prune(prev, visitedNameSet));
    setCountryDisplayModes(prev => prune(prev, visitedNameSet));
    setRegionDisplayModes(prev => pruneRegion(prev));
    setRegionColors(prev => pruneRegion(prev));
    setRegionPhotos(prev => pruneRegion(prev));
    // 소급 태깅·칩 닫음 목록 정리 — 그 국가 기록(스냅 제외)이 전부 사라지면 함께 제거
    const recordedCountryKos = new Set<string>();
    records.forEach(r => {
      if (r.viewType === 'snap') return;
      if (r.countryName) recordedCountryKos.add(r.countryName);
      r.countries?.forEach(c => recordedCountryKos.add(c.name));
    });
    const hasCountryRecord = (iso3: string) => recordedCountryKos.has(ISO3_TO_KO[iso3] || '');
    setTaggedRegions(prev => {
      const remove = Object.keys(prev).filter(k => !hasCountryRecord(k));
      if (remove.length === 0) return prev;
      const next = { ...prev };
      remove.forEach(k => delete next[k]);
      return next;
    });
    setDismissedRegionTagChips(prev => {
      const next = prev.filter(hasCountryRecord);
      return next.length === prev.length ? prev : next;
    });
    // puzzleImages도 taggedRegions와 같은 ISO3 키 체계 — 계정 전환 시 이전 계정 사진이 남거나,
    // 기록을 다 지운 뒤에도 죽은 URI가 남는 것을 막는다. 원본(puzzleSources)도 같은 규칙.
    setPuzzleImages(prev => {
      const remove = Object.keys(prev).filter(k => !hasCountryRecord(k));
      if (remove.length === 0) return prev;
      const next = { ...prev };
      remove.forEach(k => delete next[k]);
      return next;
    });
    setPuzzleSources(prev => {
      const remove = Object.keys(prev).filter(k => !hasCountryRecord(k));
      if (remove.length === 0) return prev;
      const next = { ...prev };
      remove.forEach(k => delete next[k]);
      return next;
    });
  }, [records, visitedNameSet, taggedRegions, setCountryColors, setCountryDisplayModes, setRegionDisplayModes, setRegionColors, setTaggedRegions, setDismissedRegionTagChips, setPuzzleImages, setPuzzleSources, setRegionPhotos]);

  const sheetAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const countrySheetAnim = useRef(new Animated.Value(COUNTRY_SHEET_MAX_H)).current;
  // 시트 실측 높이 — 콘텐츠 양에 따라 달라지므로 닫기 애니메이션 거리로 쓴다
  const countrySheetHRef = useRef(COUNTRY_SHEET_MAX_H);
  // 시트가 완전히 닫힌 뒤 실행할 작업 — 다음 Modal을 여는 작업은 반드시 이 경로로
  const afterCountrySheetCloseRef = useRef<(() => void) | null>(null);
  const countryOverlayAnim = useRef(new Animated.Value(0)).current;

  // FAB(기록 추가)는 CustomTabBar 레이어의 RecordFab 로 이동 (탭 바 위 겹침). 여기선 렌더하지 않음.

  const openSheet = () => {
    setSheetOpen(true);
    Animated.parallel([
      Animated.spring(sheetAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 12,
      }),
      Animated.timing(overlayAnim, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeSheet = () => {
    Animated.parallel([
      Animated.timing(sheetAnim, {
        toValue: SHEET_HEIGHT,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(overlayAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSheetOpen(false);
    });
  };

  const sheetPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) sheetAnim.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) {
          closeSheet();
        } else {
          Animated.spring(sheetAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 60,
            friction: 12,
          }).start();
        }
      },
    })
  ).current;

  const openCountrySheet = (countryName: string) => {
    setSelectedCountry(countryName);
    setCountrySheetOpen(true);
    // 시트 높이가 나라마다 달라, 직전에 닫힌 높이에서 시작하면 새 시트가 살짝 보인 채로 뜬다.
    // 항상 상한만큼 내린 지점(= 화면 밖)에서 출발시킨다.
    countrySheetAnim.setValue(COUNTRY_SHEET_MAX_H);
    Animated.parallel([
      Animated.spring(countrySheetAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 12,
      }),
      Animated.timing(countryOverlayAnim, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeCountrySheet = () => {
    Animated.parallel([
      Animated.timing(countrySheetAnim, {
        // 내용에 따라 시트 높이가 달라지므로 실측값만큼 내려야 화면 밖으로 완전히 사라진다
        toValue: countrySheetHRef.current,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(countryOverlayAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCountrySheetOpen(false);
      setSelectedCountry(null);
      // 시트 Modal이 완전히 내려간 뒤 예약된 후속 작업(기록형식 모달 열기 등)을 실행.
      // iOS는 Modal을 동시에 두 개 present할 수 없어, 닫히는 중에 다음 모달을 올리면
      // present가 실패한다 — visible=false 반영과 네이티브 dismiss가 끝난 다음 틱까지 늦춘다.
      const after = afterCountrySheetCloseRef.current;
      afterCountrySheetCloseRef.current = null;
      if (after) setTimeout(after, 80);
    });
  };

  // 드래그로 닫기 — 여행 시트(sheetPan)와 같은 제스처를 국가 시트에도 준다.
  // PanResponder는 useRef로 첫 렌더에 박제되므로, 매 렌더 새로 만들어지는 닫기 함수는
  // 콜백 ref를 거쳐 호출한다(직접 캡처하면 옛 클로저에 묶인다).
  const countryPanCb = useRef<{ close: () => void }>({ close: () => {} });
  countryPanCb.current.close = closeCountrySheet;

  const countrySheetPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) countrySheetAnim.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) {
          countryPanCb.current.close();
        } else {
          Animated.spring(countrySheetAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 60,
            friction: 12,
          }).start();
        }
      },
    })
  ).current;

  // 국가 시트 목록 — 발행된 내 기록만, 여행 날짜 내림차순, 여행 카드 단위로 한 줄.
  // 시트가 떠 있는 동안 매 렌더마다 전체 기록을 다시 훑지 않도록 메모한다.
  const countrySheetItems = useMemo(() => {
    if (!selectedCountry) return [];
    const now = Date.now();
    const visible = records
      .filter((r) => isCountrySheetRecord(r, now) && matchesCountry(r, selectedCountry))
      .sort((a, b) => recordDateMs(b) - recordDateMs(a));

    // 기록 id → 여행 카드 id
    const groupIdOf = new Map<string, string>();
    tripGroups.forEach((g) => g.records.forEach((id) => groupIdOf.set(id, g.id)));

    // 같은 여행 카드에 속한 기록끼리 묶는다. 탭하면 어느 기록이든 같은 카드로 가므로
    // 예전처럼 기록 수만큼 같은 카드가 중복으로 뜨면 안 된다.
    const byGroup = new Map<string, TravelRecord[]>();
    for (const r of visible) {
      const gid = groupIdOf.get(r.id);
      if (!gid) continue;
      const arr = byGroup.get(gid);
      if (arr) arr.push(r);
      else byGroup.set(gid, [r]);
    }

    // visible 순서대로 훑으며 카드는 첫 등장에서 한 번만 내보낸다(= 그 카드의 최신 기록 위치).
    const emitted = new Set<string>();
    const rows: { key: string; rec: TravelRecord; members: TravelRecord[] }[] = [];
    for (const r of visible) {
      const gid = groupIdOf.get(r.id);
      if (!gid) {
        rows.push({ key: r.id, rec: r, members: [r] }); // 카드에 안 묶인 낱개 기록
        continue;
      }
      if (emitted.has(gid)) continue;
      emitted.add(gid);
      rows.push({ key: gid, rec: r, members: byGroup.get(gid) ?? [r] });
    }

    return rows.map(({ key, rec, members }) => {
      // 기간·평점은 '이 나라에 속한' 같은 카드의 기록들에서만 뽑는다.
      // 다국가 여행이면 다른 나라 구간 날짜까지 섞이면 안 되기 때문이다.
      const period = tripPeriodOf(members);
      const rated = members
        .map((m) => m.rating)
        .filter((v): v is number => typeof v === 'number' && v > 0);
      // 묶인 기록들이 들른 지역 — 한 카드가 오사카·교토를 함께 담을 수 있다
      const places = Array.from(
        new Set(members.map((m) => m.regionName).filter((v): v is string => !!v))
      );
      return {
        key,
        rec,
        members,
        count: members.length,
        places,
        periodLabel: period ? fmtPeriod(period.startMs, period.endMs) : rec.date,
        // 여행 일수 — 시작·종료 양끝을 포함해서 센다(당일치기 = 1일)
        days: period ? Math.round((period.endMs - period.startMs) / 86400000) + 1 : 0,
        rating: rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : undefined,
      };
    });
  }, [records, tripGroups, selectedCountry]);

  // 국가 요약 — 여행 횟수 · 총 일수 · 평균 별점 (헤더에 한 줄로)
  const countrySummary = useMemo(() => {
    const trips = countrySheetItems.length;
    const days = countrySheetItems.reduce((sum, it) => sum + it.days, 0);
    const rated = countrySheetItems
      .map((it) => it.rating)
      .filter((v): v is number => typeof v === 'number');
    return {
      trips,
      days,
      avg: rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null,
    };
  }, [countrySheetItems]);

  // 국가 시트에서 여행 기록 탭 → 그 기록이 속한 '여행 기록 카드'(TripDetail)로 이동.
  // ProfileScreen의 여행 카드(mappedThumbnails)와 동일한 파라미터를 만들어, 어디서 열든 같은 카드가 뜨게 한다.
  // TripDetail은 trip.id로 라이브 그룹을 다시 찾으므로 id(group.id)만 맞으면 기록·제목·기간이 실측된다.
  // 그룹이 없는 예외 기록(국가/날짜 없음)만 기존처럼 기록 상세(PostDetail)로 폴백.
  const openTripCardForRecord = (rec: TravelRecord) => {
    closeCountrySheet();
    const group = tripGroups.find((g) => g.records.includes(rec.id));
    if (!group) {
      navigation.navigate('PostDetail', { postId: rec.id });
      return;
    }
    const groupRecords = group.records
      .map((id) => records.find((r) => r.id === id))
      .filter(Boolean) as TravelRecord[];
    const firstRec = groupRecords[0] ?? rec;
    const flag = firstRec.countryFlag || '';
    const title = flag && group.title.startsWith(flag) ? group.title.slice(flag.length).trim() : group.title;
    navigation.navigate('TripDetail', {
      trip: {
        id: group.id,
        emoji: firstRec.user?.emoji || '🗼',
        title,
        country: firstRec.countryName || rec.countryName || '',
        countryFlag: firstRec.countryFlag || '',
        date: firstRec.date ? firstRec.date.slice(0, 7) : (rec.date ? rec.date.slice(0, 7) : ''),
        // ProfileScreen mappedThumbnails와 동일: 자동 그룹 id는 그라데이션 키가 아니므로 기본값
        color: 'trip-japan',
        records: groupRecords.map((r) => ({ id: r.id, viewType: r.viewType || 'feed' })),
      },
    });
  };

  const handleGlobeMessage = (e: any) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data.type === 'sponsoredTapped') {
        const pkg = getSponsoredByCountryEn(data.countryEn);
        if (pkg) setSelectedAd(pkg);
        return;
      }
      if (data.type === 'countryTapped') {
        const koreanName = data.country;
        // 시트 목록과 같은 기준으로 판정한다 — 스냅·초안·미래 예약만 있는 국가는
        // '기록 없음'으로 취급해 빈 시트가 아니라 새 기록 추가로 보낸다
        const now = Date.now();
        const hasRecord = records.some(r => isCountrySheetRecord(r, now) && matchesCountry(r, koreanName));

        if (hasRecord && koreanName) {
          openCountrySheet(koreanName);
        } else {
          setPendingCountry({ name: koreanName || data.countryEn, code: '' });
          setFormatModalVisible(true);
        }
      }
    } catch (err) {
      if (__DEV__) console.warn('지구본 메시지 파싱 실패:', err, e?.nativeEvent?.data);
    }
  };

  // 국가 지도 지역 탭 핸들러
  const handleRegionMessage = (e: any) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data.type === 'puzzleCompleted') {
        // 퍼즐 완성 — WebView 연출과 동시에 성공 햅틱, 연출이 끝난 뒤 공유 카드
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        if (puzzleShareTimer.current) clearTimeout(puzzleShareTimer.current);
        puzzleShareTimer.current = setTimeout(() => setPuzzleShareVisible(true), 2600);
        return;
      }
      if (data.type === 'piecePlaced') {
        // 조각 채움(중간 진행) — WebView 페이드와 동시에 가벼운 임팩트 햅틱
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        return;
      }
      if (data.type === 'regionTapped') {
        const countryKo = ISO3_TO_KO[data.countryCode] || data.countryCode;
        const regionName = data.region || data.regionEn;
        setPendingCountry({
          name: `${countryKo} - ${regionName}`,
          code: data.countryCode,
          region: data.region,
          regionEn: data.regionEn,
        });
        // 이 지역(주)의 기존 기록 찾기 (스냅은 활성화 대상이 아니므로 제외)
        const matched = records.filter(r => {
          if (r.viewType === 'snap') return false;
          const inCountry = r.countryName === countryKo || r.countries?.some(c => c.name === countryKo);
          // 기록의 regionNameEn을 코드로 해석해 비교 — 한국 국내 기록('Seoul')도
          // 지도가 보내는 코드(KR-11)와 맞는다. 26개국 기록은 이미 코드라 멱등 통과.
          const recCode = r.regionNameEn ? (resolveRegionCode(data.countryCode, r.regionNameEn) ?? r.regionNameEn) : '';
          const regionMatch =
            (data.regionEn && recCode === data.regionEn) ||
            (data.region && r.regionName === data.region);
          return inCountry && regionMatch;
        });
        if (matched.length > 0) {
          setRegionRecords(matched);
          setRegionRecordsTitle(`${countryKo} · ${regionName}`);
          setRegionRecordsVisible(true);
        } else {
          setFormatModalVisible(true);
        }
      }
    } catch (err) {
      if (__DEV__) console.warn('지역 지도 메시지 파싱 실패:', err, e?.nativeEvent?.data);
    }
  };

  const handleFormatSelect = (type: string) => {
    setFormatModalVisible(false);
    if (!pendingCountry) return;
    const SCREEN_MAP: Record<string, RecordFormatScreen> = {
      feed: 'NewRecord',
      blog: 'BlogRecord',
      cut: 'CutRecord',
      snap: 'SnapRecord',
      album: 'AlbumCreate',
    };
    navigation.navigate(SCREEN_MAP[type] ?? 'NewRecord', {
      selectedCountry: pendingCountry,
    });
    setPendingCountry(null);
  };

  return (
    // 배경을 지구본 배경(#0A0A0F)과 동일하게 — 하단에 보라색이 남지 않고 끝까지 이어짐
    <LinearGradient colors={['#0A0A0F', '#0A0A0F']} style={styles.container}>

      {/* ── 전체화면 우주배경 (별·글로우) — 모든 콘텐츠 뒤, 터치 통과 ── */}
      {/* 우주가스 색을 스킨에 맞춤 — 주 블롭=스킨 강조색, 보조(파랑) 블롭=스킨 그라데이션 보조색(aurora는 기존 파랑 유지) */}
      <SpaceBackdrop glow={skinAccent.accent} glow2={getGlobeSkinTheme(globeSkin)?.gradTo ?? '#1E3AFF'} />

      {/* 튜토리얼용 숨김 앵커 — 탭 바 오버레이의 스냅 버튼(RecordFab)과 동일한 절대 제약.
          코치마크가 이 위치를 측정해 스냅 버튼을 정확히 강조한다(보이지 않음·터치 통과). */}
      <View
        ref={snapAnchorRef}
        collapsable={false}
        pointerEvents="none"
        style={{ position: 'absolute', right: SNAP_BTN.right, bottom: (insets.bottom || 0) + SNAP_BTN.bottom, width: SNAP_BTN.size, height: SNAP_BTN.size, opacity: 0 }}
      />

      {/* ── 전체화면 지구본 — 헤더/토글 뒤(화면 맨 위~맨 아래). 헤더·토글이 위로 오버레이됨 ── */}
      {viewMode === 'globe' && (
        <View ref={globeRef} collapsable={false} style={StyleSheet.absoluteFill}>
          <GlobeView size={undefined} fullscreen onMessage={handleGlobeMessage} visitedCountries={globeVisitedCountries} displayMode={globeForcedMode} defaultColor={globeColor} variant={globeVariant} themeOverride={globeSkinTheme} glassBgHue={glassBgHue} sponsoredItems={sponsoredMarkerItems} />
        </View>
      )}

      {/* ── 헤더 ── */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
        {/* 로고를 살짝 위로 (레이아웃 영향 없이 시각적으로만 이동) */}
        <View style={{ transform: [{ translateY: -8 }] }}>
          <EorthLogo width={125} height={56} />
        </View>
        <TouchableOpacity
          style={styles.headerIcon}
          onPress={() => {
            setUnreadAlerts(0); // 낙관 반영 — 화면 복귀 시 서버 값으로 재확인된다
            navigation.navigate('Notifications');
          }}
          accessibilityRole="button"
          accessibilityLabel={
            unreadAlerts > 0
              ? `${t('main.notifA11y')}, ${t('misc.unreadCountA11y', { count: unreadAlerts })}`
              : t('main.notifA11y')
          }
        >
          {/* 벨 자체 dot은 끄고(작은 점) 개수 배지를 얹는다 */}
          <NotificationBellIcon size={24} />
          <NotificationBadge count={unreadAlerts} />
        </TouchableOpacity>
      </View>

      {/* ── 지구본 / 국가 지도 영역 ── */}
      {/* box-none: 빈 영역 터치는 뒤의 전체화면 글로브로 통과(토글·설정 등 자식만 터치 수신) */}
      <View style={styles.globeArea} pointerEvents="box-none">
        {/* 지구본/대륙 전환 토글 (Liquid Glass)
            대륙 모드가 꺼져 있으면(REGION_MAP_ENABLED=false) 선택지가 하나뿐이라
            토글 자체를 렌더하지 않는다 — 지구본만 보이는 것이 자연스럽다. */}
        {REGION_MAP_ENABLED && (
          <View style={styles.modeToggleWrap}>
            {/* 알약 토글 자체만 측정/강조하도록 ref를 내부 래퍼에 부착 (wrap은 가로 전체라 제외) */}
            <View ref={toggleRef} collapsable={false}>
              <SegmentedToggle
                options={[
                  { value: 'globe', label: t('main.toggleGlobe') },
                  { value: 'region', label: t('main.toggleRegion') },
                ]}
                value={viewMode}
                onChange={(v) => { setViewMode(v); setRegionCountry(null); setRegionSearch(''); setPopularActive(false); }}
              />
            </View>
          </View>
        )}

        {/* 뷰 렌더링 */}
        {viewMode === 'globe' ? (
          <>
            {/* 영역별 표시설정 버튼 — 누르면 지구본 형태 교체
                (aurora=단색 활성화 ↔ classic=사진 활성화) */}
            <TouchableOpacity
              ref={settingsRef}
              style={styles.globeSettingsBtn}
              activeOpacity={0.7}
              onPress={() => setGlobeVariant(v => (v === 'aurora' ? 'classic' : 'aurora'))}
              accessibilityRole="button"
              accessibilityLabel={t('main.globeFormA11y')}
            >
              <GlobeBtnGlass style={styles.globeSettingsBtnBlur}>
                <GlobeDisplayIcon tint={skinAccent.pill} />
              </GlobeBtnGlass>
            </TouchableOpacity>
            {/* 활성화 색 변경 — 형태 전환 버튼 왼쪽. 현재 색을 원으로 보여주고 탭하면 표시설정(팔레트) 열림.
                유리(사진) 지구본에선 숨긴다 — 활성화가 사진이라 색 팔레트가 의미 없다 */}
            {globeVariant === 'aurora' && (
              <TouchableOpacity
                style={styles.globeColorBtn}
                activeOpacity={0.7}
                onPress={openDisplaySettings}
                accessibilityRole="button"
                accessibilityLabel={t('main.activeColorA11y')}
              >
                <GlobeBtnGlass style={styles.globeSettingsBtnBlur}>
                  <View style={[styles.globeColorDot, { backgroundColor: globeColor }, isNoiseColor(globeColor) && { overflow: 'hidden' }]}>
                    {isNoiseColor(globeColor) && <GrainOverlay color="#000000" opacity={0.5} dotCount={40} />}
                  </View>
                </GlobeBtnGlass>
              </TouchableOpacity>
            )}
          </>
        ) : regionCountry ? (
          <>
            {/* 검색바 (Figma 8:385) */}
            <View style={styles.regionSearchWrap}>
              <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                style={styles.regionSearchInput}
                value={regionSearch}
                onChangeText={setRegionSearch}
                placeholder={t('main.regionSearchPlaceholder')}
                placeholderTextColor="#A9A9A9"
                returnKeyType="search"
              />
              {regionSearch.length > 0 && (
                <TouchableOpacity
                  style={styles.regionClearBtn}
                  activeOpacity={0.7}
                  onPress={() => setRegionSearch('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('main.clearSearchA11y')}
                >
                  <Text style={styles.regionClearText}>✕</Text>
                </TouchableOpacity>
              )}
              <SearchLineIcon size={24} color="#A9A9A9" />
            </View>

            {/* 필터 칩 행 (Figma 8:392 + 8:395), 우측 정렬 + 가로 스크롤 */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.regionChipsRow}
              contentContainerStyle={styles.regionChipsContent}
            >
              {/* 국가 표시 칩 — 메뉴탭바 배경 테두리(흰색/검은색 베벨) 그라데이션 + 스킨 어두운 배경 */}
              <LinearGradient
                colors={['rgba(102,102,102,0)', 'rgba(255,255,255,0.6)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.15, y: 1 }}
                style={styles.regionChipBorder}
              >
                <TouchableOpacity
                  style={[styles.regionChipInner, { backgroundColor: skinChipBg }]}
                  activeOpacity={0.8}
                  onPress={() => setRegionSearch('')}
                >
                  <Text style={styles.regionChipText}>{countryEn(ISO3_TO_KO[regionCountry] || regionCountry)}</Text>
                </TouchableOpacity>
              </LinearGradient>
              {/* 인기명소 모아보기 — 활성: 스킨 버튼 그라데이션 / 비활성: 흰색/검은색 베벨 */}
              <LinearGradient
                colors={popularActive ? skinAccent.btnGradient : ['rgba(102,102,102,0)', 'rgba(255,255,255,0.6)']}
                start={{ x: 0, y: 0 }}
                end={popularActive ? { x: 1, y: 1 } : { x: 0.15, y: 1 }}
                style={styles.popularChipBorder}
              >
                <TouchableOpacity
                  style={[styles.popularChipInner, { backgroundColor: skinChipBg }]}
                  activeOpacity={0.8}
                  onPress={() => setPopularActive((v) => !v)}
                >
                  <Text style={styles.regionChipText}>{t('main.popularSpots')}</Text>
                </TouchableOpacity>
              </LinearGradient>
            </ScrollView>

            {/* 국가 지역 지도 — globeArea 전체(로고 아래까지)를 채우는 배경. 검색바·칩은 위에 떠 있음 */}
            <View style={styles.regionMapFill}>
              <CountryMapView
                countryCode={regionCountry}
                countryName={ISO3_TO_KO[regionCountry] || ''}
                fill
                chipBottom={insets.bottom + 96}
                onMessage={handleRegionMessage}
                recordedRegions={recordedRegions}
                displayMode={regionGlobalMode}
                defaultColor={countryColors[KO_TO_EN[ISO3_TO_KO[regionCountry]]] || globeColor}
                searchQuery={regionSearch}
                showPopular={popularActive}
                accentColor={skinAccent.accent}
                puzzleImage={puzzleImage}
                puzzleComplete={!!regionProgress && regionProgress.total > 0 && regionProgress.visited === regionProgress.total}
              />
            </View>
            {/* ── 하단 오버레이 스택 ──
                진행도와 태그 칩을 각자 absolute로 띄우면 서로를, 그리고 앞 레이어인 스냅 버튼을
                모른다. 실제로 칩이 스냅 버튼에 덮여 닫기(✕)가 눌리지 않았다.
                하나의 스택에 넣고 스냅 버튼 위(ABOVE_SNAP)에 앵커해 겹침을 구조적으로 막는다.
                아래(스냅 버튼 쪽)부터 진행도 → 칩 순으로 쌓이도록 column-reverse를 쓴다. */}
            <View pointerEvents="box-none" style={[styles.regionBottomStack, { bottom: (insets.bottom || 0) + ABOVE_SNAP }]}>
              {regionProgress && (
                // 진행도 유리 칩 — 국가·인기명소 칩과 같은 재질(베벨 그라데이션 테두리 + 스킨
                // 어두운 배경). 맨 텍스트만 떠 있던 것을 지도 위 오버레이 재질로 통일하고,
                // 얇은 스킨 그라데이션 바가 방문 비율만큼 차오른다(값 변경 시 애니메이션).
                <View pointerEvents="none" style={{ alignSelf: 'flex-end', marginRight: SNAP_BTN.right }}>
                  <LinearGradient
                    colors={['rgba(102,102,102,0)', 'rgba(255,255,255,0.6)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.15, y: 1 }}
                    style={styles.regionChipBorder}
                  >
                    <View style={[styles.regionProgressInner, { backgroundColor: skinChipBg }]}>
                      <Text style={styles.regionProgressText}>
                        <Text style={{ color: skinAccent.accent, fontWeight: '700' }}>{regionProgress.visited}</Text>
                        {t('main.regionProgressOf', { total: regionProgress.total })}
                      </Text>
                      <View style={styles.regionProgressTrack}>
                        <Animated.View
                          style={{
                            height: '100%',
                            width: regionBarAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                          }}
                        >
                          <LinearGradient
                            colors={skinAccent.btnGradient}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={{ flex: 1 }}
                          />
                        </Animated.View>
                      </View>
                    </View>
                  </LinearGradient>
                </View>
              )}

              {/* 퍼즐 사진 선택 유도 칩 — 퍼즐 모드인데 사진이 없으면 지도가 사진 모드처럼
                  보이고, 안내는 표시 설정 시트 안에만 있어 발견이 안 됐다. 지도 위에서 바로
                  시트로 보낸다(지역 데이터 미수록 국가는 퍼즐 대상이 아니라 숨김). */}
              {regionGlobalMode === 'puzzle' && !puzzleImage && !!regionProgress && (
                <View style={{ alignSelf: 'center', maxWidth: '92%' }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={openDisplaySettings}
                    accessibilityRole="button"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: skinChipBg, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 16, paddingVertical: 10 }}
                  >
                    <PuzzlePieceIcon size={15} color="#FFFFFF" />
                    <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }} {...andFitText}>{t('main.puzzlePickChip')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* 방문 지역 소급 태깅 안내 칩 — 기록은 있는데 활성 지역이 없는 국가에서만 */}
              {showRegionTagChip && (
                <View style={{ alignSelf: 'center', maxWidth: '92%' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: skinChipBg, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', paddingLeft: 16, paddingRight: 8, paddingVertical: 10 }}>
                  <TouchableOpacity activeOpacity={0.8} onPress={openRegionTagSheet} accessibilityRole="button">
                    <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>
                      {t('main.regionTagChip', { count: regionCountryRecordCount })}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                    onPress={() => setDismissedRegionTagChips(prev => (regionCountry && !prev.includes(regionCountry) ? [...prev, regionCountry] : prev))}
                    accessibilityRole="button"
                    accessibilityLabel={t('main.regionTagDismissA11y')}
                  >
                    <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginLeft: 10, padding: 4 }}>✕</Text>
                  </TouchableOpacity>
                </View>
                </View>
              )}
            </View>
            {/* 퍼즐 완성 공유 카드 — 완성 연출 뒤 지도 위 오버레이 */}
            {puzzleShareVisible && puzzleImage && regionProgress ? (
              <PuzzleShareCard
                countryCode={regionCountry}
                countryName={countryEn(ISO3_TO_KO[regionCountry] || regionCountry)}
                image={puzzleImage}
                total={regionProgress.total}
                onClose={() => setPuzzleShareVisible(false)}
              />
            ) : null}
            {/* 방문 지역 선택 시트 (소급 태깅) */}
            <Modal visible={regionTagSheetVisible} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => setRegionTagSheetVisible(false)}>
              {/* statusBarTranslucent 모달은 안드로이드 adjustResize가 꺼져 KAV로 키보드를 직접 회피 */}
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
                <TouchableOpacity
                  style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' }}
                  activeOpacity={1}
                  onPress={() => setRegionTagSheetVisible(false)}
                />
                {/* width/maxWidth/alignSelf — Modal은 루트 클램프 밖이라 폭을 여기서 다시 잡는다 */}
                <View style={{ backgroundColor: '#15151F', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 14, paddingHorizontal: 20, paddingBottom: insets.bottom + 16, maxHeight: '78%', width: '100%', maxWidth: STAGE_MAX_W, alignSelf: 'center' }}>
                  <View style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 14 }} />
                  <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '700', textAlign: 'center' }}>{t('main.regionTagTitle')}</Text>
                  <Text style={{ color: '#A1A1B0', fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 12 }}>
                    {t('main.regionTagSub', { country: ISO3_TO_KO[regionCountry] || '' })}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#22222E', borderRadius: 12, paddingHorizontal: 12, marginBottom: 6 }}>
                    <SearchLineIcon size={18} color="#A9A9A9" />
                    <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                      style={{ flex: 1, color: '#FFFFFF', fontSize: 14, paddingVertical: 10, marginLeft: 8 }}
                      value={regionTagSearch}
                      onChangeText={setRegionTagSearch}
                      placeholder={t('main.regionTagSearchPh')}
                      placeholderTextColor="#7A7A88"
                    />
                  </View>
                  <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    {([
                      ['main.regionTagProvinces', regionTagFilter(regionTagOptions)],
                    ] as const).map(([labelKey, list]) => (
                      list.length === 0 ? null : (
                        <View key={labelKey}>
                          <Text style={{ color: '#A1A1B0', fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 2 }}>{t(labelKey)}</Text>
                          {list.map(o => {
                            const sel = regionTagSelection.has(o.nameEn);
                            return (
                              <TouchableOpacity
                                key={o.nameEn}
                                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.07)' }}
                                activeOpacity={0.7}
                                onPress={() => setRegionTagSelection(prev => {
                                  const next = new Set(prev);
                                  if (next.has(o.nameEn)) next.delete(o.nameEn); else next.add(o.nameEn);
                                  return next;
                                })}
                              >
                                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: sel ? skinAccent.accent : 'rgba(255,255,255,0.3)', backgroundColor: sel ? skinAccent.accent : 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                  {sel && <Text style={{ color: '#0A0A0F', fontSize: 13, fontWeight: '800' }}>✓</Text>}
                                </View>
                                <Text style={{ color: '#FFFFFF', fontSize: 15 }}>{o.name}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )
                    ))}
                  </ScrollView>
                  <TouchableOpacity style={{ marginTop: 14, borderRadius: 14, overflow: 'hidden' }} activeOpacity={0.85} onPress={saveRegionTags}>
                    <LinearGradient colors={skinAccent.btnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingVertical: 14, alignItems: 'center' }}>
                      <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>{t('main.regionTagSave', { count: regionTagSelection.size })}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            </Modal>
            {/* 뒤로가기 버튼 (Figma — 좌측 셰브론 아이콘) */}
            <TouchableOpacity
              style={styles.regionBackBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={() => { setRegionCountry(null); setRegionSearch(''); }}
              accessibilityRole="button"
              accessibilityLabel={t('main.backToCountryA11y')}
            >
              <Svg width={16} height={28} viewBox="33 156 12 22">
                <SvgPath
                  d="M42.0981 159.422C42.6142 158.924 43.4364 158.939 43.9345 159.455C44.4326 159.971 44.418 160.793 43.9019 161.291L43 160.357L42.0981 159.422ZM36 167.348L35.0629 168.248C34.5827 167.747 34.5804 166.958 35.0578 166.454L36 167.348ZM43.9371 173.744C44.4337 174.262 44.4168 175.084 43.8992 175.58C43.3817 176.077 42.5595 176.06 42.0629 175.542L43 174.643L43.9371 173.744ZM38.653 164.552L37.7108 163.658L37.7305 163.638L37.7511 163.618L38.653 164.552ZM36 167.348L36.9371 166.449L43.9371 173.744L43 174.643L42.0629 175.542L35.0629 168.248L36 167.348ZM43 160.357L43.9019 161.291L39.5549 165.487L38.653 164.552L37.7511 163.618L42.0981 159.422L43 160.357ZM38.653 164.552L39.5952 165.446L36.9422 168.242L36 167.348L35.0578 166.454L37.7108 163.658L38.653 164.552Z"
                  fill="#FFFFFF"
                  fillOpacity={0.6}
                />
              </Svg>
            </TouchableOpacity>
            {/* 영토 표시 설정 (대륙 모드에서도 진입) */}
            <TouchableOpacity
              style={styles.globeSettingsBtn}
              activeOpacity={0.7}
              onPress={openDisplaySettings}
              accessibilityRole="button"
              accessibilityLabel={t('main.territoryDisplayA11y')}
            >
              <GlobeBtnGlass style={styles.globeSettingsBtnBlur}>
                <GlobeDisplayIcon tint={skinAccent.pill} />
              </GlobeBtnGlass>
            </TouchableOpacity>
          </>
        ) : (
          /* 국가 선택 그리드 */
          <View style={[styles.countryGrid, { paddingBottom: insets.bottom + 73 }]}>
            <Text style={styles.countryGridTitle}>{t('main.selectCountry')}</Text>
            <Text style={styles.countryGridSub}>{t('main.selectCountrySub')}</Text>
            <View style={styles.countryGridList}>
              {/* 7개 국가 + 8번째 칸은 돋보기(전체 목록 시트) — 사용자 확정 디자인.
                  7개의 정체는 gridCountries(즐겨찾기 우선 + 기본 순서 보충) 참고 */}
              {gridCountries.map(c => (
                <TouchableOpacity
                  key={c.code}
                  style={styles.countryGridItem}
                  activeOpacity={0.7}
                  onPress={() => { setRegionCountry(c.code); setRegionSearch(''); }}
                >
                  <Text style={styles.countryGridFlag}>{c.flag}</Text>
                  <Text style={styles.countryGridName} numberOfLines={1} {...andFitText}>{countryEn(c.name)}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.countryGridItem, styles.countryGridSearchItem]}
                activeOpacity={0.7}
                onPress={() => { setCountryPickerSearch(''); setCountryPickerVisible(true); }}
                accessibilityRole="button"
                accessibilityLabel={t('main.selectCountry')}
              >
                <SearchLineIcon size={30} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── 전체 국가 목록 시트 (돋보기) ── */}
        <Modal
          visible={countryPickerVisible}
          transparent statusBarTranslucent navigationBarTranslucent
          animationType="slide"
          onRequestClose={() => setCountryPickerVisible(false)}
        >
          {/* statusBarTranslucent 모달은 안드로이드 adjustResize가 꺼져 KAV로 키보드를 직접 회피 */}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.countryPickerOverlay} accessibilityViewIsModal>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setCountryPickerVisible(false)} />
            <View style={styles.countryPickerSheet}>
              <View style={styles.countryPickerHandle} />
              <Text style={styles.countryPickerTitle}>{t('main.selectCountry')}</Text>
              {/* 별 사용법 안내. 7개를 넘기면 같은 자리에서 "앞 7개만 나온다"로 바뀐다 —
                  토스트를 띄우지 않는 이유: 시트가 떠 있는 동안 계속 보여야 이해가 되고,
                  MainScreen에는 토스트 채널이 없어 그것부터 들여야 한다(과한 도입) */}
              <Text style={styles.countryPickerHint}>
                {regionFavoriteCodes.length > 7 ? t('main.favoriteGridLimit') : t('main.favoriteHint')}
              </Text>
              <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                style={styles.countryPickerInput}
                placeholder={t('main.countrySearchPh')}
                placeholderTextColor="#5a5a68"
                value={countryPickerSearch}
                onChangeText={setCountryPickerSearch}
              />
              <ScrollView style={{ maxHeight: height * 0.45 }} keyboardShouldPersistTaps="handled">
                {REGION_COUNTRIES
                  .filter(c => { const q = countryPickerSearch.trim(); return !q || c.name.includes(q) || countryEn(c.name).toLowerCase().includes(q.toLowerCase()); })
                  .map(c => {
                    const fav = regionFavoriteCodes.includes(c.code);
                    return (
                      // 행 = 형제 터치 영역 둘. 별을 행 Touchable '안'에 중첩하면 안드로이드에서
                      // 어느 쪽이 먹는지가 히트테스트 순서에 좌우돼 지도 진입과 뒤섞인다.
                      <View key={c.code} style={styles.countryPickerRow}>
                        <TouchableOpacity
                          style={styles.countryPickerRowMain}
                          activeOpacity={0.7}
                          onPress={() => {
                            setCountryPickerVisible(false);
                            setRegionCountry(c.code); setRegionSearch('');
                          }}
                        >
                          <Text style={styles.countryPickerFlag}>{c.flag}</Text>
                          <Text style={styles.countryPickerName}>{countryEn(c.name)}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.countryPickerStarBtn}
                          activeOpacity={0.7}
                          // hitSlop 없음 — 44x54 실제 레이아웃으로 충족한다. 왼쪽으로 넓히면
                          // 행 탭(지도 진입)을 잠식하고, 오른쪽은 부모 밖이라 안드로이드에서 무효다
                          onPress={() => toggleRegionFavorite(c.code)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: fav }}
                          accessibilityLabel={t(fav ? 'main.favoriteRemoveA11y' : 'main.favoriteAddA11y', { country: countryEn(c.name) })}
                        >
                          <FavStarIcon filled={fav} color={fav ? skinAccent.accent : 'rgba(255,255,255,0.45)'} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
              </ScrollView>
              <View style={{ height: insets.bottom + 16 }} />
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>

      {/* 스냅 버튼(SNAP)은 CustomTabBar 레이어의 RecordFab 로 이동 (탭 바 위 우측에 떠 있음) */}

      {/* ── 하단 핸들 바 (시트 닫혔을 때 노출) ── */}
      {SHOW_VISITED_SHEET && !sheetOpen && (
        <TouchableOpacity style={styles.handleTrigger} onPress={openSheet} activeOpacity={0.8}>
          <LinearGradient
            colors={['rgba(10,1,24,0)', 'rgba(10,1,24,0.85)']}
            style={styles.handleTriggerGradient}
            pointerEvents="none"
          />
          <View style={styles.handleBar} />
          <Text style={styles.handleLabel}>{t('main.viewVisitedCountries')}</Text>
        </TouchableOpacity>
      )}

      {/* ── 반투명 오버레이 ── */}
      {SHOW_VISITED_SHEET && sheetOpen && (
        <Animated.View
          style={[styles.overlay, { opacity: overlayAnim }]}
          pointerEvents={sheetOpen ? 'auto' : 'none'}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeSheet} activeOpacity={1} />
        </Animated.View>
      )}

      {/* ── 바텀시트 (Liquid Glass) ── */}
      {SHOW_VISITED_SHEET && (
        <Animated.View
          style={[
            styles.bottomSheet,
            { transform: [{ translateY: sheetAnim }] },
          ]}
          pointerEvents={sheetOpen ? 'auto' : 'none'}
        >
          <SheetBackdrop />
          {/* 시트 핸들 */}
          <View style={styles.sheetHandleArea} {...sheetPan.panHandlers}>
            <View style={styles.sheetHandle} />
          </View>

          {/* 타이틀 */}
          <View style={styles.sheetTitleRow}>
            <Text style={styles.sheetTitle}>{t('main.visitedCountries')}</Text>
            <Text style={styles.sheetCount}>{t('main.countriesCount', { count: VISITED_COUNTRIES.length })}</Text>
          </View>

          {/* 나라 리스트 */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetList}
          >
            {VISITED_COUNTRIES.map((c, i) => (
              <TouchableOpacity
                key={i}
                style={styles.countryRow}
                activeOpacity={0.7}
                onPress={() => {
                  closeSheet();
                  navigation.navigate('Country', { name: c.name, flag: c.flag });
                }}
              >
                <Text style={styles.countryFlag}>{c.flag}</Text>
                <View style={styles.countryInfo}>
                  <Text style={styles.countryName}>{countryEn(c.name)}</Text>
                  <Text style={styles.countryVisits} {...andFitText}>{t('main.visitsCountSuffix', { count: c.visits })}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            ))}
            <View style={{ height: 24 }} />
          </ScrollView>
        </Animated.View>
      )}

      {/* ── 국가 기록 오버레이 + 바텀시트 (탭바·FAB 위에 표시되도록 Modal로 렌더) ── */}
      <Modal
        visible={countrySheetOpen}
        transparent
        animationType="none"
        statusBarTranslucent navigationBarTranslucent
        onRequestClose={closeCountrySheet}
      >
        {/* 오버레이 */}
        <Animated.View
          style={[styles.overlay, { opacity: countryOverlayAnim }]}
          pointerEvents="auto"
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeCountrySheet} activeOpacity={1} />
        </Animated.View>

        {/* 바텀시트 (Liquid Glass) */}
        <Animated.View
          style={[
            styles.countrySheet,
            { transform: [{ translateY: countrySheetAnim }] },
          ]}
          pointerEvents="auto"
          accessibilityViewIsModal
          onLayout={(e: LayoutChangeEvent) => {
            // 닫기 애니메이션이 이만큼 내려가야 화면 밖으로 완전히 사라진다
            countrySheetHRef.current = e.nativeEvent.layout.height;
          }}
        >
          <SheetBackdrop />
        {/* 핸들 — 아래로 끌어서 닫기(여행 시트와 동일 제스처) */}
        <View style={styles.sheetHandleArea} {...countrySheetPan.panHandlers}>
          <View style={styles.sheetHandle} />
        </View>

        {/* 헤더 */}
        <View style={styles.countrySheetHeader}>
          <Text style={styles.countrySheetFlag}>
            {selectedCountry ? flagForCountry(selectedCountry) : ''}
          </Text>
          <View style={{ flex: 1 }}>
            {/* 지구본이 보내는 국가명은 한국어라 그대로 쓰면 영어 모드에서 헤더만 한국어로 남는다
                (목록 행은 recPlace가 이미 영문으로 바꾼다) */}
            <Text style={styles.countrySheetName}>
              {selectedCountry ? countryEn(selectedCountry) : ''}
            </Text>
            <View style={styles.countrySummaryRow}>
              <Text style={styles.countrySummaryText}>
                {t('main.countrySheetTrips', { count: countrySummary.trips })}
                {countrySummary.days > 0 && ` · ${t('main.countrySheetDays', { count: countrySummary.days })}`}
              </Text>
              {countrySummary.avg != null && (
                <>
                  <Text style={styles.countrySummaryDot}>·</Text>
                  <RatingStars
                    score={countrySummary.avg}
                    size={11}
                    gap={1}
                    fullColor={Colors.gold}
                    emptyColor="rgba(255,255,255,0.18)"
                  />
                  <Text style={styles.countrySummaryText}>{countrySummary.avg.toFixed(1)}</Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* 여행 기록 리스트 (실제 기록).
            flex:1이면 시트가 항상 최대 높이로 늘어난다 — flexShrink로 내용만큼만 차지하고
            상한(maxHeight)에 닿을 때만 줄어들며 스크롤된다 */}
        <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
          <View style={styles.countryRecordList}>
            {countrySheetItems.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={styles.countryRecordCard}
                activeOpacity={0.7}
                onPress={() => openTripCardForRecord(item.rec)}
                accessibilityRole="button"
                accessibilityLabel={`${recPlace(item.rec)} ${item.periodLabel}`}
              >
                <View style={styles.countryRecordRow}>
                  <Text style={styles.countryRecordDate}>{item.periodLabel}</Text>
                  {/* 예전엔 '★'.repeat(rating)이라 4.5점이 별 4개로 잘렸다 — 앱 공용 0.5 단위 별점으로 통일 */}
                  {!!item.rating && (
                    <RatingStars
                      score={item.rating}
                      size={13}
                      gap={2}
                      fullColor={Colors.gold}
                      emptyColor="rgba(255,255,255,0.18)"
                    />
                  )}
                </View>
                <View style={styles.countryRecordBottomRow}>
                  {/* 한 카드가 여러 도시를 담을 수 있어 대표 하나만 쓰면 나머지가 사라진다 */}
                  <Text style={styles.countryRecordCity} numberOfLines={1}>
                    {item.places.length > 1
                      ? t('main.countrySheetMorePlaces', { place: item.places[0], count: item.places.length - 1 })
                      : recPlace(item.rec)}
                  </Text>
                  {/* 여행 카드 단위로 접었으니 안에 기록이 몇 개인지 보여준다 */}
                  {item.count > 1 && (
                    <View style={styles.countryRecordCountBadge}>
                      <Text style={styles.countryRecordCountText}>
                        {t('main.countrySheetRecords', { count: item.count })}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
          {/* 하단 버튼 바가 absolute라 그만큼 비워둔다 — 실제 높이를 재서 쓴다.
              고정값이면 시스템 글꼴을 키웠을 때 마지막 카드가 버튼에 가린다 */}
          <View style={{ height: countryBottomH + 16 }} />
        </ScrollView>

        {/* 새 기록 추가 버튼 */}
        <View
          style={[styles.countrySheetBottom, { paddingBottom: insets.bottom + 20 }]}
          onLayout={(e: LayoutChangeEvent) => setCountryBottomH(e.nativeEvent.layout.height)}
        >
          <TouchableOpacity
            style={[styles.countryAddBtn, { backgroundColor: skinAccent.accent }]}
            activeOpacity={0.85}
            onPress={() => {
              // 기록형식 모달은 시트 Modal이 완전히 닫힌 뒤에 연다 —
              // 겹쳐 올리면 iOS에서 present 실패(동시 Modal 불가)
              setPendingCountry({ name: selectedCountry || '', code: '' });
              afterCountrySheetCloseRef.current = () => setFormatModalVisible(true);
              closeCountrySheet();
            }}
          >
            <Text style={styles.countryAddBtnText}>+ {t('comp2.addNewRecord')}</Text>
          </TouchableOpacity>
        </View>
        </Animated.View>
      </Modal>

      {/* ── 기록형식 선택 모달 ── */}
      <Modal
        visible={formatModalVisible}
        transparent statusBarTranslucent navigationBarTranslucent
        animationType="fade"
        onRequestClose={() => setFormatModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.fmOverlay}
          accessibilityViewIsModal
          activeOpacity={1}
          onPress={() => setFormatModalVisible(false)}
        >
          <View style={styles.fmCard} onStartShouldSetResponder={() => true}>
            <SheetBackdrop />
            <Text style={styles.fmTitle}>{t('main.recordFormatTitle')}</Text>
            <Text style={styles.fmSub}>
              {pendingCountry?.name ? t('main.recordFormatPromptCountry', { country: pendingCountry.name }) : t('main.recordFormatPrompt')}
            </Text>
            <View style={styles.fmGrid}>
              {[
                { type: 'feed',  icon: <FeedIcon />,  name: t('main.formatFeed') },
                { type: 'blog',  icon: <BlogIcon />,  name: t('main.formatBlog') },
                { type: 'cut',   icon: <CutIcon />,   name: t('main.formatCut') },
                { type: 'album', icon: <AlbumIcon />, name: t('main.formatAlbum') },
              ].map(fmt => (
                <TouchableOpacity
                  key={fmt.type}
                  style={styles.fmItem}
                  activeOpacity={0.7}
                  onPress={() => handleFormatSelect(fmt.type)}
                >
                  <View style={styles.fmIconWrap}>{fmt.icon}</View>
                  <Text style={styles.fmItemText}>{fmt.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── 지역(주) 기존 기록 보기 모달 ── */}
      <Modal
        visible={regionRecordsVisible}
        transparent statusBarTranslucent navigationBarTranslucent
        animationType="fade"
        onRequestClose={() => setRegionRecordsVisible(false)}
      >
        <TouchableOpacity
          style={styles.fmOverlay}
          accessibilityViewIsModal
          activeOpacity={1}
          onPress={() => setRegionRecordsVisible(false)}
        >
          <View style={styles.rrCard} onStartShouldSetResponder={() => true}>
            <SheetBackdrop />
            <Text style={styles.fmTitle}>{regionRecordsTitle}</Text>
            <Text style={styles.fmSub}>{t('main.regionRecordsCount', { count: regionRecords.length })}</Text>

            <ScrollView style={{ width: '100%', maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {regionRecords.map(rec => {
                const photo =
                  rec.representativePhoto ||
                  (rec.regionName && rec.perCountryData?.[rec.countryName]?.representativePhoto) ||
                  rec.cutPhoto?.previewUri ||
                  rec.snapBackUri ||
                  rec.medias?.[0];
                return (
                  <TouchableOpacity
                    key={rec.id}
                    style={styles.rrItem}
                    activeOpacity={0.7}
                    onPress={() => {
                      setRegionRecordsVisible(false);
                      navigation.navigate('PostDetail', { postId: rec.id });
                    }}
                  >
                    {photo ? (
                      <Image source={{ uri: photo }} style={styles.rrThumb} />
                    ) : (
                      <View style={[styles.rrThumb, styles.rrThumbEmpty]} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rrItemTitle} numberOfLines={1}>
                        {recPlace(rec)}
                      </Text>
                      <Text style={styles.rrItemDate}>{rec.date}</Text>
                    </View>
                    {/* 0.5 단위 별점 — '★'.repeat(rating)은 4.5를 별 4개로 잘라냈다(국가 시트와 동일 컴포넌트로 통일) */}
                    {!!rec.rating && (
                      <RatingStars
                        score={rec.rating}
                        size={13}
                        gap={2}
                        fullColor={Colors.gold}
                        emptyColor="rgba(255,255,255,0.18)"
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={[styles.countryAddBtn, { width: '100%', marginTop: 16, backgroundColor: skinAccent.accent }]}
              activeOpacity={0.85}
              onPress={() => {
                // 기록형식 모달은 이 모달이 완전히 닫힌 뒤에 연다 —
                // 같은 틱에 열면 iOS에서 present가 실패한다(동시 Modal 불가).
                // 국가 시트의 afterCountrySheetCloseRef와 같은 취지이며, 여기는 닫힘 콜백이 없는
                // fade Modal이라 표시 설정→태깅 시트 전환(300ms)과 같은 지연을 쓴다.
                setRegionRecordsVisible(false);
                setTimeout(() => setFormatModalVisible(true), 300);
              }}
            >
              <Text style={styles.countryAddBtnText}>+ {t('comp2.addNewRecord')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── 영토 표시 설정 모달 ── */}
      <Modal
        visible={displaySettingsVisible}
        transparent statusBarTranslucent navigationBarTranslucent
        animationType="fade"
        onRequestClose={cancelDisplaySettings}
      >
        <TouchableOpacity
          style={[styles.fmOverlay, { justifyContent: 'flex-start', paddingTop: DS_CARD_TOP }]}
          accessibilityViewIsModal
          activeOpacity={1}
          onPress={cancelDisplaySettings}
        >
          <View style={styles.dsCard} onStartShouldSetResponder={() => true}>
            <SheetBackdrop pointerEvents="none" />
            {/* 그라데이션 유리 테두리 (Figma) — 카드와 정확히 같은 px 크기로 그려 정렬
                (새 아키텍처에서 RNSVG가 pointerEvents="none"을 무시하고 터치를 삼키므로 View로 감싼다.
                 이 Svg는 카드 전면(DS_CARD_W×DS_CARD_H)을 덮으므로 안 감싸면 카드 안 터치가 전부 먹힌다) */}
            <View
              style={{ position: 'absolute', top: 0, left: 0, width: DS_CARD_W, height: DS_CARD_H }}
              pointerEvents="none"
            >
            <Svg
              width={DS_CARD_W}
              height={DS_CARD_H}
              viewBox="0 0 325 569"
              preserveAspectRatio="none"
            >
              <SvgDefs>
                <SvgLinearGradient id="dsBorder0" x1="32" y1="18.9326" x2="284.107" y2="511.12" gradientUnits="userSpaceOnUse">
                  <SvgStop stopColor="#666666" />
                  <SvgStop offset="1" stopColor="#666666" stopOpacity="0" />
                </SvgLinearGradient>
                <SvgLinearGradient id="dsBorder1" x1="316.5" y1="553.5" x2="173.5" y2="380.5" gradientUnits="userSpaceOnUse">
                  <SvgStop stopColor="#FFFFFF" />
                  <SvgStop offset="1" stopColor="#999999" stopOpacity="0" />
                </SvgLinearGradient>
              </SvgDefs>
              <SvgRect x={0.85} y={0.85} width={323.3} height={567.3} rx={29.15} fill="none" stroke="url(#dsBorder0)" strokeWidth={1.7} />
              <SvgRect x={0.85} y={0.85} width={323.3} height={567.3} rx={29.15} fill="none" stroke="url(#dsBorder1)" strokeOpacity={0.5} strokeWidth={1.7} />
            </Svg>
            </View>

            {viewMode === 'globe' ? (
              <>
                <Text style={styles.dsTitle}>{t('main.territoryDisplayTitle')}</Text>
                <Text style={styles.dsSub}>{t('main.territoryDisplaySub')}</Text>

                {/* 지구본 스킨 (본체 색) — aurora(색 활성화) 폼에만 적용되므로 그때만 노출 */}
                {globeVariant === 'aurora' && (<>
                <Text style={[dsm.sectionLabel, { marginTop: 6 }]}>{t('settings.globeSkin')}</Text>
                <View style={dsm.skinRow}>
                  {GLOBE_SKINS.map(s => {
                    const selected = globeSkin === s.id;
                    const locked = s.premium && !isPremium;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={dsm.skinItem}
                        activeOpacity={0.8}
                        onPress={() => {
                          if (locked) { setDisplaySettingsVisible(false); navigation.navigate('Premium'); return; }
                          setGlobeSkin(s.id); // 테마드 세터가 스킨별 저장 색 복원까지 수행
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={t(s.labelKey)}
                      >
                        <LinearGradient colors={s.preview} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[dsm.skinCircle, selected && dsm.skinCircleActive]}>
                          {locked && <LockClosedIcon size={16} color="#FFFFFF" />}
                        </LinearGradient>
                        <Text style={[dsm.skinLabel, selected && dsm.skinLabelActive]} numberOfLines={1}>{t(s.labelKey)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                </>)}

                {/* 활성화 색상 팔레트 (국기/갤러리 옵션 제거 — 색상만) */}
                <Text style={[dsm.sectionLabel, { marginTop: 16 }]}>{t('main.defaultColor')}</Text>
                <View style={dsm.paletteRow}>
                  {getSkinPalette(globeSkin).map(c => (
                    <TouchableOpacity key={c} activeOpacity={0.8} onPress={() => { setGlobeColor(c); setGlobeDisplayMode('color'); }}>
                      <View style={[dsm.swatch, { backgroundColor: c }, isNoiseColor(c) && { overflow: 'hidden' }, globeColor === c && dsm.swatchActive]}>
                        {isNoiseColor(c) && <GrainOverlay color="#000000" opacity={0.5} dotCount={100} />}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 국가별 색상 리스트 (하단 페이드) */}
                <Text style={[dsm.sectionLabel, { marginTop: 18 }]}>{t('main.countryColors')}</Text>
                <View style={dsm.listWrap}>
                  {visitedNameSet.size === 0 ? (
                    <Text style={dsm.emptyHint}>{t('main.noRecordedCountries')}</Text>
                  ) : (
                  <>
                  <ScrollView style={{ flex: 1 }} nestedScrollEnabled showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }}>
                    {Array.from(visitedNameSet).map(nameEn => {
                      const ko = EN_TO_KO[nameEn] || nameEn;
                      const dotColor = countryColors[nameEn] || globeColor;
                      const isEditing = editingCountryColor === nameEn;
                      return (
                        <View key={nameEn}>
                          <TouchableOpacity
                            style={dsm.countryRow}
                            activeOpacity={0.7}
                            onPress={() => setEditingCountryColor(isEditing ? null : nameEn)}
                          >
                            <View style={[dsm.countryDot, { backgroundColor: dotColor }]} />
                            <Text style={dsm.countryName} numberOfLines={1}>{countryEn(ko)}</Text>
                            <Svg width={12} height={8} viewBox="0 0 12 8">
                              <SvgPath d="M1 1.5 6 6.5 11 1.5" stroke="#8B8B91" strokeWidth={1.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            </Svg>
                          </TouchableOpacity>
                          {isEditing && (
                            <View style={dsm.countryPalette}>
                              {getSkinPalette(globeSkin).map(c => (
                                <TouchableOpacity key={c} activeOpacity={0.8} onPress={() => setCountryColors(prev => ({ ...prev, [nameEn]: c }))}>
                                  <View style={[dsm.swatchSm, { backgroundColor: c }, isNoiseColor(c) && { overflow: 'hidden' }, (countryColors[nameEn] || globeColor) === c && dsm.swatchSmActive]}>
                                    {isNoiseColor(c) && <GrainOverlay color="#000000" opacity={0.5} dotCount={80} />}
                                  </View>
                                </TouchableOpacity>
                              ))}
                              {countryColors[nameEn] && (
                                <TouchableOpacity
                                  style={dsm.countryReset}
                                  onPress={() => setCountryColors(prev => { const next = { ...prev }; delete next[nameEn]; return next; })}
                                >
                                  <Text style={dsm.countryResetText}>{t('main.reset')}</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </ScrollView>
                  <LinearGradient
                    colors={['rgba(10,11,15,0)', 'rgba(10,11,15,0.9)']}
                    style={dsm.listFade}
                    pointerEvents="none"
                  />
                  </>
                  )}
                </View>
              </>
            ) : (
              <>
                <Text style={styles.dsTitle}>{t('main.regionDisplayTitle')}</Text>
                <Text style={styles.dsSub}>{t('main.regionDisplaySub')}</Text>

                {/* 대륙 글로벌 모드 — 지역별 사진 / 퍼즐 (색 단독 모드는 2026-08-06 폐지) */}
                <View style={styles.dsColorSection}>
                  <Text style={styles.dsColorLabel}>{t('main.globalDefault')}</Text>
                  <View style={styles.dsSection}>
                    <TouchableOpacity
                      style={[styles.dsOption, regionGlobalMode !== 'puzzle' && [styles.dsOptionActive, { borderColor: skinAccent.accent, backgroundColor: skinAccent.tint(0.1) }]]}
                      activeOpacity={0.7}
                      onPress={() => setRegionGlobalMode('photo')}
                    >
                      <GalleryIcon size={24} color={regionGlobalMode !== 'puzzle' ? '#FFFFFF' : '#A1A1B0'} />
                      <Text style={[styles.dsOptionText, regionGlobalMode !== 'puzzle' && styles.dsOptionTextActive]}>{t('main.regionPhotoMode')}</Text>
                      {regionGlobalMode !== 'puzzle' && <View style={[styles.dsCheck, { backgroundColor: skinAccent.accent }]} />}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dsOption, regionGlobalMode === 'puzzle' && [styles.dsOptionActive, { borderColor: skinAccent.accent, backgroundColor: skinAccent.tint(0.1) }]]}
                      activeOpacity={0.7}
                      onPress={() => setRegionGlobalMode('puzzle')}
                    >
                      <PuzzlePieceIcon size={24} color={regionGlobalMode === 'puzzle' ? '#FFFFFF' : '#A1A1B0'} />
                      <Text style={[styles.dsOptionText, regionGlobalMode === 'puzzle' && styles.dsOptionTextActive]}>{t('main.puzzle')}</Text>
                      {regionGlobalMode === 'puzzle' && <View style={[styles.dsCheck, { backgroundColor: skinAccent.accent }]} />}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 퍼즐 그림 선택 — 사용자 사진 전용(기본 아트 폐지): 이 나라 기록 사진 / 앨범 */}
                {regionGlobalMode === 'puzzle' && (
                  <View style={styles.dsColorSection}>
                    <Text style={styles.dsColorLabel}>{t('main.puzzleImageLabel')}</Text>
                    {/* 그림을 아직 안 골랐으면 지도에 퍼즐이 그려지지 않는다 — 그 이유를 밝힌다 */}
                    {!puzzleImage && (
                      <Text style={{ color: '#A1A1B0', fontSize: 12, marginBottom: 6 }} {...andFitText}>{t('main.puzzleNeedPhoto')}</Text>
                    )}
                    {/* 실루엣 미리보기 — 현재 그림이 나라 모양으로 잘린 모습 */}
                    {puzzleImage && puzzlePreview ? (
                      <View style={{ alignItems: 'center', marginBottom: 8, marginTop: 2 }}>
                        <Svg width={puzzlePreview.w} height={puzzlePreview.h}>
                          <SvgDefs>
                            <SvgClipPath id="pz-preview-clip">
                              <SvgPath d={puzzlePreview.linePath} clipRule="evenodd" />
                            </SvgClipPath>
                          </SvgDefs>
                          <SvgImage
                            href={{ uri: puzzleImage }}
                            width={puzzlePreview.w}
                            height={puzzlePreview.h}
                            preserveAspectRatio="xMidYMid slice"
                            clipPath="url(#pz-preview-clip)"
                          />
                          <SvgPath d={puzzlePreview.linePath} fill="none" stroke={skinAccent.accent} strokeWidth={0.8} strokeOpacity={0.5} />
                        </Svg>
                      </View>
                    ) : null}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                      {puzzleCandidates.map((uri, i) => {
                        const selected = puzzleImage === uri;
                        return (
                          <TouchableOpacity
                            key={`${i}-${uri.slice(-24)}`}
                            activeOpacity={0.8}
                            // 즉시 확정하지 않고 범위 조정(나라 실루엣 대보기)을 거친다.
                            // 현재 그림(크롭본)을 다시 누르면 저장해 둔 원본에서 재조정 —
                            // 크롭본을 다시 자르면 화질이 계단식으로 떨어지고 범위도 못 넓힌다.
                            // (원본이 없는 구 저장본만 크롭본에서 재조정)
                            onPress={() => setPuzzleAdjust({ source: selected ? (puzzleSource || uri) : uri, fromAlbum: false })}
                          >
                            {/* RN Image는 원본 해상도를 통째로 디코드한다 — 기록 사진(수 MB)을
                                56px 썸네일에 쓰면 퍼즐 선택 순간 디코드 폭주로 시트가 멈칫한다.
                                expo-image는 뷰 크기로 다운샘플 + 메모리·디스크 캐시. */}
                            <ExpoImage
                              source={{ uri }}
                              cachePolicy="memory-disk"
                              transition={0}
                              style={{ width: 56, height: 56, borderRadius: 8, borderWidth: 2, borderColor: selected ? skinAccent.accent : 'transparent' }}
                            />
                            {/* 현재 그림 제거 — 해제하면 퍼즐이 안 그려지는 '사진 선택 안내' 상태로 복귀 */}
                            {selected && (
                              <TouchableOpacity
                                onPress={removePuzzleImage}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                accessibilityRole="button"
                                accessibilityLabel={t('comp.delete')}
                                style={{
                                  position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: 9,
                                  backgroundColor: 'rgba(10,11,15,0.85)', alignItems: 'center', justifyContent: 'center',
                                }}
                              >
                                {/* includeFontPadding: 안드로이드 기본 상하 여백이 18px 원 안 글리프를 아래로 밀어 iOS와 어긋남 */}
                                <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700', lineHeight: 12, includeFontPadding: false }}>✕</Text>
                              </TouchableOpacity>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={pickPuzzleImage}
                        style={{ width: 56, height: 56, borderRadius: 8, borderWidth: 1, borderColor: '#3E3155', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ color: '#A1A1B0', fontSize: 20 }}>＋</Text>
                        <Text style={{ color: '#A1A1B0', fontSize: 9 }} {...andFitText}>{t('main.puzzleFromAlbum')}</Text>
                      </TouchableOpacity>
                    </ScrollView>
                  </View>
                )}

                {/* 지역별 개별 설정 — 지역별 사진 모드 전용. 퍼즐 모드의 지도는 나라당
                    그림 한 장이라 지역별 사진이 쓰이지 않는다(목록이 있으면 "지정했는데
                    적용이 안 된다"는 오해를 부른다) */}
                {regionGlobalMode !== 'puzzle' && (
                <View style={[styles.dsColorSection, { flex: 1, maxHeight: 300 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.dsColorLabel}>{t('main.perRegion')}</Text>
                    {/* 방문 지역 소급 태깅 편집 — 표시 설정을 유지·닫고 태깅 시트를 연다 */}
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => { confirmDisplaySettings(); setTimeout(openRegionTagSheet, 300); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={{ color: skinAccent.accent, fontSize: 13, fontWeight: '600' }}>{t('main.regionTagEdit')} ›</Text>
                    </TouchableOpacity>
                  </View>
                  {recordedRegions.length === 0 ? (
                    <Text style={{ color: '#A1A1B0', fontSize: 13, textAlign: 'center', marginVertical: 20 }} {...andFitText}>
                      {t('main.noRecordedRegions')}
                    </Text>
                  ) : (
                    <ScrollView style={{ flex: 1 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                      {recordedRegions.map(r => (
                        <View key={r.key} style={{ marginBottom: 8 }}>
                          <View style={styles.dsCountryRow}>
                            {/* 현재 이 지역에 실제로 쓰이는 사진(수동 지정 > 기록 대표사진) 미리보기 */}
                            {r.photo ? (
                              <ExpoImage
                                source={{ uri: r.photo }}
                                cachePolicy="memory-disk"
                                transition={0}
                                style={{ width: 28, height: 28, borderRadius: 6 }}
                              />
                            ) : (
                              <View style={[styles.dsCountryDot, { width: 28, height: 28, borderRadius: 6, backgroundColor: '#2E2E3B' }]} />
                            )}
                            <Text style={styles.dsCountryName} numberOfLines={1}>{r.name}</Text>
                            {/* 수동 지정이 있을 때만 — 지우면 기록 대표사진 자동 선정으로 복귀 */}
                            {!!regionPhotos[r.key] && (
                              <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => setRegionPhotos(prev => { const next = { ...prev }; delete next[r.key]; return next; })}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <Text style={{ color: '#A1A1B0', fontSize: 12, marginRight: 10 }} {...andFitText}>{t('main.reset')}</Text>
                              </TouchableOpacity>
                            )}
                            <TouchableOpacity
                              activeOpacity={0.7}
                              onPress={() => pickRegionPhoto(r.key)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              accessibilityRole="button"
                              accessibilityLabel={t('main.photo')}
                            >
                              <GalleryIcon size={18} color={skinAccent.accent} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </View>
                )}
              </>
            )}

            <TouchableOpacity
              style={[dsm.confirmBtn, { backgroundColor: skinAccent.accentDeep }]}
              activeOpacity={0.85}
              onPress={confirmDisplaySettings}
            >
              <Text style={dsm.confirmText} {...andFitText}>{t('common.confirm')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
        {/* 퍼즐 범위 조정 — 이 Modal 안의 절대위치 오버레이(중첩 Modal 금지 — 껍데기 잔존 전례) */}
        {puzzleAdjust && regionCountry ? (
          <PuzzlePhotoAdjustOverlay
            countryCode={regionCountry}
            uri={puzzleAdjust.source}
            onConfirm={confirmPuzzleAdjust}
            onCancel={() => setPuzzleAdjust(null)}
          />
        ) : null}
      </Modal>

      {/* FAB(기록 추가)는 CustomTabBar 레이어의 RecordFab 로 렌더 (탭 바 위 겹침) */}

      {/* ── 튜토리얼 코치마크 ── */}
      <MainCoachmark
        visible={coachVisible}
        steps={coachSteps}
        onClose={() => setCoachVisible(false)}
        onStepChange={(step) => setCoachBright(step?.keepBright ?? null)}
      />

      {/* ── 광고(스폰서) 패키지 카드 ── */}
      <SponsoredPackageCard pkg={selectedAd} onClose={() => setSelectedAd(null)} />

      {/* ── 초대 귀속 넛지 — 초대 딥링크로 온 신규 유저에게 메이트 연결 제안 ── */}
      <InviteNudgeModal
        target={inviteNudge}
        onClose={() => setInviteNudge(null)}
        onSend={() => {
          const inv = inviteNudge;
          setInviteNudge(null);
          if (!inv) return;
          requestNeighbor(inv.userId);
          navigation.navigate('FriendProfile', { userId: inv.userId, username: inv.handle });
        }}
      />

    </LinearGradient>
  );
}

// ── 영토 표시 설정 모달 (Figma Frame_2147230197 100% 구현) ──
const dsm = StyleSheet.create({
  galleryBtn: { height: 49, borderRadius: 15, backgroundColor: '#2E2E3B', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  galleryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sectionLabel: { color: '#9A9A9A', fontSize: 13, fontWeight: '600', marginBottom: 14 },
  // 지구본 스킨 선택 행
  skinRow: { flexDirection: 'row', gap: 18, marginBottom: 4 },
  skinItem: { alignItems: 'center', gap: 6, width: 60 },
  skinCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  skinCircleActive: { borderColor: '#FFFFFF' },
  skinLabel: { color: '#9A9A9A', fontSize: 11 },
  skinLabelActive: { color: '#FFFFFF', fontWeight: '600' },
  paletteRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  swatch: { width: 34, height: 34, borderRadius: 17 },
  swatchActive: { borderWidth: 2, borderColor: '#fff' },
  listWrap: { flex: 1, marginTop: 4, position: 'relative' },
  emptyHint: { color: '#6F6F7A', fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 24 },
  listFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 48 },
  countryRow: { flexDirection: 'row', alignItems: 'center', height: 31, marginBottom: 6 },
  countryDot: { width: 19, height: 19, borderRadius: 9.5, borderWidth: 1, borderColor: '#fff', marginRight: 12 },
  countryName: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700' },
  countryPalette: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8, paddingLeft: 31, alignItems: 'center' },
  swatchSm: { width: 24, height: 24, borderRadius: 12 },
  swatchSmActive: { borderWidth: 2, borderColor: '#fff' },
  countryReset: { paddingHorizontal: 10, height: 24, borderRadius: 12, backgroundColor: '#2E2E3B', alignItems: 'center', justifyContent: 'center' },
  countryResetText: { color: '#A1A1B0', fontSize: 11, fontWeight: '600' },
  confirmBtn: { height: 49, borderRadius: 15, backgroundColor: '#6B21A8', alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ── 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[6],
    paddingBottom: Spacing[3],
  },
  headerIcon: {
    padding: Spacing[1],
    position: 'relative',
    // 로고가 translateY -8 로 올라가 있어, 종 아이콘도 로고 시각 중심에 맞춰 올림
    transform: [{ translateY: -11 }],
  },

  // ── 지구본 영역
  globeArea: {
    flex: 1,
  },

  // ── 대륙 지도를 globeArea 전체로 채우는 배경 (검색바·칩 뒤)
  regionMapFill: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },

  // ── 대륙(국가 지역) 검색바 (Figma 8:385: 353×36, radius 23, 흰색 10%)
  regionSearchWrap: {
    zIndex: 2,
    height: 36,
    marginTop: 16,
    // 우상단 표시 설정 버튼(right:16 + 폭 36 = 52)과 겹치지 않는 64를 양쪽에 — 비대칭(24/64)로
    // 두면 바가 왼쪽으로 쏠려 보인다. 화면 중앙 정렬이 우선이라 폭을 조금 내준다.
    marginHorizontal: 64,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  regionSearchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    letterSpacing: -0.4,
    padding: 0,
    marginRight: 8,
  },
  // ── 검색 초기화(X) 버튼 — 검색 아이콘 옆
  regionClearBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  regionClearText: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '700',
  },
  // ── 필터 칩 행 (Figma 8:392 + 8:395), 우측 정렬
  regionChipsRow: {
    zIndex: 2,
    marginTop: 14,
    flexGrow: 0,
  },
  regionChipsContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 24,
  },
  regionChipBorder: {
    borderRadius: 15.5,
    padding: 1,
  },
  regionChipInner: {
    height: 28,
    borderRadius: 14.5,
    // 불투명이어야 테두리 그라데이션이 배경(가운데)으로 비치지 않음
    // (#751AAD 30%가 다크 배경 위에 깔린 색과 동일)
    backgroundColor: '#2A0F3E',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── 인기명소 칩 그라데이션 테두리. LinearGradient 래퍼 + 1px 패딩으로 구현
  popularChipBorder: {
    borderRadius: 15.5,
    padding: 1,
  },
  popularChipInner: {
    height: 28,
    borderRadius: 14.5,
    // 불투명이어야 그라데이션이 가운데로 비치지 않음 (#751AAD 30%가 다크 배경 위에 깔린 색)
    backgroundColor: '#2A0F3E',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 하단 오버레이 스택 — 스냅 버튼 위에 앵커(bottom은 인라인). column-reverse라 JSX에서 먼저
  // 쓴 항목이 아래(스냅 버튼 쪽)에 온다: 진행도가 버튼 바로 위, 태그 칩이 그 위.
  regionBottomStack: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 2,
    flexDirection: 'column-reverse',
    gap: 10,
  },
  regionProgressText: {
    fontSize: 12,
    color: '#A1A1B0',
    fontFamily: Typography.fontFamily.medium,
  },
  // 진행도 유리 칩 내부 — 국가 칩(regionChipInner)과 같은 규격, 세로로 텍스트+바 2줄
  regionProgressInner: {
    borderRadius: 14.5,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  // 진행도 바 트랙 — 얇은 흰색 트랙 위에 스킨 그라데이션이 방문 비율만큼 차오른다
  regionProgressTrack: {
    width: 84,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  regionChipText: {
    color: '#FFFFFF',
    fontSize: 12.6,
    letterSpacing: 0.5,
    lineHeight: 16,
  },

  // ── 핸들 트리거 (시트 닫혔을 때)
  handleTrigger: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 20,
    zIndex: 5,
  },
  handleTriggerGradient: {
    position: 'absolute',
    top: -40,
    left: 0,
    right: 0,
    height: 40,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4A4A59',
    marginBottom: 8,
  },
  handleLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
    letterSpacing: 0.3,
  },

  // ── 오버레이
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 10,
  },

  // ── 바텀시트
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: 'rgba(20,20,35,0.55)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    // elevation 제거 — 안드로이드는 반투명 배경+overflow hidden에서 elevation 그림자가
    // 시트 뒤로 각지게 비쳐 유리감을 해침 (그림자는 iOS shadow*만, z순서는 zIndex가 담당)
    overflow: 'hidden',
  },
  sheetHandleArea: {
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 10,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4A4A59',
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[6],
    paddingTop: Spacing[4],
    paddingBottom: Spacing[3],
  },
  sheetTitle: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.white,
  },
  sheetCount: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  sheetList: {
    paddingHorizontal: Spacing[6],
  },

  // ── 나라 행
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[2],
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  countryFlag: { fontSize: 28, marginRight: Spacing[3] },
  countryInfo: { flex: 1 },
  countryName: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.white,
  },
  countryVisits: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    color: Colors.textMuted,
  },

  // ── 국가 기록 바텀시트
  countrySheet: {
    position: 'absolute',
    bottom: 0,
    // left/right:0 대신 width+maxWidth+alignSelf — 이 시트는 Modal 안(루트 클램프 밖)이라
    // left/right로 붙이면 폴드·태블릿에서 창 폭 전체로 늘어난다
    width: '100%',
    maxWidth: STAGE_MAX_W,
    alignSelf: 'center',
    // 고정 높이가 아니라 상한 — 기록이 적으면 시트도 작게 올라온다
    maxHeight: COUNTRY_SHEET_MAX_H,
    backgroundColor: 'rgba(20,20,35,0.55)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    zIndex: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    // elevation 제거 — 사유는 bottomSheet와 동일
    overflow: 'hidden',
  },
  countrySheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[6],
    paddingTop: Spacing[2],
    paddingBottom: Spacing[4],
    gap: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  countrySheetFlag: {
    fontSize: 32,
  },
  countrySheetName: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.white,
  },
  countrySummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  countrySummaryText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  countrySummaryDot: {
    fontSize: Typography.fontSize.xs,
    color: 'rgba(255,255,255,0.3)',
  },
  countryRecordList: {
    paddingHorizontal: Spacing[6],
    paddingTop: Spacing[4],
    gap: Spacing[3],
  },
  countryRecordCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    // 카드 간격은 목록의 gap이 담당한다 — marginBottom을 같이 주면 간격이 두 번 더해진다
  },
  countryRecordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  countryRecordDate: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  countryRecordBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  countryRecordCity: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.white,
  },
  countryRecordCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  countryRecordCountText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  countrySheetBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing[6],
    // paddingBottom은 인라인으로 insets.bottom + 20 — 제스처 바 높이가 기기마다 다르다
    paddingTop: Spacing[3],
    backgroundColor: 'rgba(30,30,46,0.95)',
  },
  countryAddBtn: {
    // 배경색은 호출부에서 skinAccent.accent로 지정한다(지구본 스킨 연동)
    borderRadius: BorderRadius.full,
    paddingVertical: 16,
    alignItems: 'center',
  },
  countryAddBtnText: {
    color: Colors.white,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.semiBold,
  },

  // ── 기록형식 선택 모달
  fmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fmCard: {
    // 82%는 창 폭 기준이라 Modal(루트 클램프 밖)에서는 폴드에 700dp까지 커진다
    width: '82%',
    maxWidth: STAGE_MAX_W,
    backgroundColor: 'rgba(20,20,32,0.5)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  fmTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },

  // ── 지역(주) 기존 기록 모달
  rrCard: {
    // 86%는 창 폭 기준이라 Modal(루트 클램프 밖)에서는 폴드에 700dp까지 커진다
    width: '86%',
    maxWidth: STAGE_MAX_W,
    backgroundColor: 'rgba(20,20,32,0.5)',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  rrItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  rrThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#2E2E3B',
  },
  rrThumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rrItemTitle: {
    color: '#fff',
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
  },
  rrItemDate: {
    color: '#A1A1B0',
    fontSize: 12,
    marginTop: 2,
  },
  fmSub: {
    color: '#A1A1B0',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 22,
    lineHeight: 18,
  },
  fmGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 10,
  },
  fmItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: '#2E2E3B',
    borderRadius: 14,
  },
  fmIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3A3A4A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  fmItemText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  // ── 지구본/대륙 모드 토글
  modeToggleWrap: {
    alignItems: 'center',
    paddingVertical: 6,
    zIndex: 5,
  },
  // ── 대륙 모드 - 뒤로가기
  regionBackBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: 12,
    left: 16,
    zIndex: 10,
    padding: 8,
  },

  // ── 대륙 모드 - 국가 선택 그리드
  countryGrid: {
    // 상단 토글 바의 흐름 오프셋을 무시하고 지도 영역 전체 기준 수직 정중앙에 배치
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  countryGridTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  countryGridSub: {
    color: '#A1A1B0',
    fontSize: 13,
    marginBottom: 24,
  },
  countryGridList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
  },
  countryGridItem: {
    width: '22%',
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: 'rgba(46,46,59,0.6)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.15)',
  },
  countryGridFlag: {
    fontSize: 28,
    marginBottom: 6,
  },
  countryGridName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  // 8번째 칸(돋보기) — 아이콘만 중앙 배치, 타일 높이는 국기+이름 타일과 맞춤
  countryGridSearchItem: {
    justifyContent: 'center',
    minHeight: 76,
  },
  // 전체 국가 목록 시트
  countryPickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  countryPickerSheet: {
    // Modal은 루트 클램프 밖이라 폭을 여기서 다시 잡는다(딤 배경 countryPickerOverlay는 전체 폭 유지)
    width: '100%', maxWidth: STAGE_MAX_W, alignSelf: 'center',
    backgroundColor: '#17131f', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: '#2E2E3B', paddingHorizontal: 16, paddingTop: 10,
  },
  countryPickerHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#2E2E3B', alignSelf: 'center', marginBottom: 12 },
  countryPickerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  countryPickerInput: {
    backgroundColor: '#211b2e', borderWidth: 1, borderColor: '#2E2E3B', borderRadius: 12,
    color: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 8,
  },
  countryPickerHint: { color: '#A1A1B0', fontSize: 12, textAlign: 'center', marginTop: -4, marginBottom: 10 },
  // 래퍼는 테두리만 그리고 터치는 받지 않는다. 세로 패딩·gap을 여기 두면 안 된다 —
  // 그 자리는 어느 Touchable에도 속하지 않는 죽은 공간이 되고, alignItems:'center'는
  // flex:1 자식을 교차축(세로)으로 늘리지 않아 행 위아래 12px 띠가 통째로 먹통이 된다.
  // (2026-08-23 QA F-1: 54px 전체 탭 → 가운데 30px만. 'stretch' + 자식이 패딩을 갖는 형태로 복원)
  countryPickerRow: {
    flexDirection: 'row', alignItems: 'stretch',
    borderBottomWidth: 1, borderBottomColor: '#1A1A26',
  },
  // 행 좌측(국기+이름) — 지도 진입 터치. 세로 패딩을 '터치를 받는 쪽'인 여기가 들고 있어야
  // 예전(TouchableOpacity가 countryPickerRow를 직접 달던 시절)과 같은 54px가 전부 탭된다
  countryPickerRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  // 즐겨찾기 별 — 행 탭과 맞붙는 우측 전용 터치 영역. gap 없이 붙여 사각지대를 없앤다.
  // 실폭 44dp를 '레이아웃'으로 확보한다 — hitSlop은 부모 경계를 넘는 쪽이 안드로이드에서
  // 무효라 믿을 수 없고, 안쪽으로 늘리면 행 탭 영역을 도로 잠식한다(QA F-4).
  // 세로는 stretch로 행 높이(54px) 전체를 받는다.
  countryPickerStarBtn: { width: 44, alignItems: 'center', justifyContent: 'center' },
  countryPickerFlag: { fontSize: 24 },
  countryPickerName: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },

  globeSettingsBtn: {
    position: 'absolute',
    top: 12,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    overflow: 'hidden',
  },
  globeSettingsBtnBlur: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  // 활성화 색 변경 버튼 — 형태 전환 버튼(right:16) 왼쪽에 나란히 (36 + 10 gap)
  globeColorBtn: {
    position: 'absolute',
    top: 12,
    right: 62,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    overflow: 'hidden',
  },
  globeColorDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },

  // ── 표시 설정 모달
  dsCard: {
    width: DS_CARD_W,
    height: DS_CARD_H,
    paddingTop: 36,
    paddingHorizontal: DS_PAD,
    paddingBottom: 22,
    borderRadius: 29,
    backgroundColor: 'rgba(10,11,15,0.8)',
    overflow: 'hidden',
  },
  dsTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'left',
    marginBottom: 8,
  },
  dsSub: {
    color: '#9A9A9A',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 18,
    lineHeight: 18,
  },
  dsSection: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  dsOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#2E2E3B',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
    minWidth: 80,
  },
  dsOptionActive: {
    borderColor: '#BF85FC',
    backgroundColor: 'rgba(191,133,252,0.1)',
  },
  dsOptionText: {
    color: '#A1A1B0',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  dsOptionTextActive: {
    color: '#fff',
  },
  dsCheck: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#BF85FC',
  },
  dsColorSection: {
    marginBottom: 16,
  },
  dsColorLabel: {
    color: '#A1A1B0',
    fontSize: 13,
    marginBottom: 10,
  },
  dsCountryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 10,
  },
  dsCountryDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  dsCountryName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
});
