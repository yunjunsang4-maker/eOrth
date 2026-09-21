import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  useWindowDimensions,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Modal,
  Alert,
  Share,
  Image,
  Linking,
  Animated,
  Easing,
  PanResponder,
  ActivityIndicator,
  LayoutAnimation,
} from 'react-native';
import { Text, TextInput } from '../ui/Text';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { PillRing } from '../components/record/CalendarBottomSheet';
import { useTranslation } from 'react-i18next';
import { countryLabel } from '../utils/countryLabel';
import { WebView } from 'react-native-webview';
import { useVideoPlayer, VideoView } from 'expo-video';
import Reanimated, {
  useSharedValue, useAnimatedStyle, useAnimatedScrollHandler,
  interpolate, Extrapolation, withTiming, withSpring, runOnJS,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path as SvgPath, Ellipse as SvgEllipse, Circle as SvgCircle, Defs as SvgDefs, ClipPath as SvgClipPath, G as SvgG } from 'react-native-svg';
import { CommentIcon, PersonIcon, PaperclipIcon, TrashIcon, CameraIcon, LandscapeIcon, CalendarIcon, PlaneIcon, TransferIcon, PencilIcon, LinkIcon, WarningIcon, BlockIcon, ShareIcon, ArchiveIcon, PinIcon, LockClosedIcon, GlobeIcon, ChevronIcon, BackChevronIcon, SoloIcon, FriendIcon, CoupleIcon, FamilyIcon, ParentIcon, SiblingIcon } from '../components/icons';
import { useRecords, TravelRecord, RecordViewType } from '../store/recordStore';
import { useDM } from '../store/dmStore';
import { handleFontStyle } from '../constants/handleFonts';
import { useSkinAccent } from '../constants/skinTheme';
import WeatherIcon, { normalizeWeather } from '../components/WeatherIcon';
import ReportModal from '../components/ReportModal';
import PhotoViewerModal from '../components/PhotoViewerModal';
// RatingStars는 2026-09-20 시안 적용으로 이 화면에서 링 배지(RatingRingBadge)로 대체되어 제거.
import { LiquidCardGlow, useEntranceAnimation } from '../components/LiquidEffects';
import { sectionSlices } from '../utils/albumSections';
import AuthorAvatar from '../components/AuthorAvatar';
import MentionText from '../components/MentionText';
import MentionSuggestBar, { type MentionCandidate } from '../components/MentionSuggestBar';
import { applyMention, ensureReplyPrefix, findActiveMention } from '../utils/mentions';
import { useStageWidth, useStageGutter, STAGE_MAX_W } from '../utils/stage';
import { tap, warn } from '../utils/haptics';

const APP_LOGO = require('../../assets/example-avatar.png'); // 예시 기록 '이어스' 프로필 사진(지구본) — 소셜과 통일
import { useSettings } from '../store/settingsStore';
import { timeAgo } from '../utils/timeAgo';
import { andFitText } from '../utils/fitText';
import { isFramed, frameHeight, frameFillColor, normalizePhotoFrame, type PhotoFrame } from '../utils/photoFrame';
import type { BlogBlock } from '../types/blogBlocks';
import { extractHeadings, blocksToPlainText, blocksToPhotos } from '../types/blogBlocks';
import { toNaverHtml, BlogData } from '../utils/naverBlogConverter';
import { applyViewer, isPostHiddenForViewer } from '../utils/mediaPrivacy';
import { fetchPostLikers, PostLiker, likePost, unlikePost } from '../services/social';
import { postLink } from '../utils/appLinks';
import { CUT_LAYOUTS } from '../constants/cutFrames';
import { handleBlock as confirmBlock } from '../utils/reportAndBlock';
import { regionDisplayName } from '../utils/regionLabel';

/**
 * 폭·높이는 더 이상 모듈 최상위에 박제하지 않는다 — 폴드를 펼치면 스토리 페이저의
 * 스크롤 오프셋(`x = index * SCREEN_W`)이 실제 페이지 폭과 어긋나 엉뚱한 스냅을 가리켰다.
 * 폭은 useStageWidth()(클램프된 Stage 폭), 높이는 실제 창 높이를 컴포넌트 본문에서 받고,
 * 모듈 최상위 헬퍼·스타일시트 팩토리에는 인자로 넘긴다.
 */

// 네컷(스트립) 미리보기를 프레임 규격(가로/세로 비율)에 딱 맞게 — 레터박스(여백) 제거
const cutFitStyle = (layout: import('../constants/cutFrames').CutLayout | undefined, SCREEN_W: number, SCREEN_H: number) => {
  const aspect = (layout && CUT_LAYOUTS[layout]?.aspect) || 3 / 4; // width / height
  // 40이 아니라 32 — 본문 좌우 패딩이 20+20에서 16+16으로 좁아졌다(2026-09-20 시안).
  // 이 숫자는 "좌우 패딩 합"이라는 한 가지 뜻이므로 scrollContent.paddingHorizontal과 항상 같이 움직인다.
  const maxW = SCREEN_W - 32;
  const maxH = SCREEN_H * 0.7;
  let w = maxW;
  let h = maxW / aspect;
  if (h > maxH) { h = maxH; w = maxH * aspect; }
  return { width: w, height: h };
};

const C = {
  bg: '#0A0A0F',
  card: '#1C1C28',
  cardBorder: '#2A2A3A',
  // 강조색(구 accent/accentDim/accentBorder)은 제거했다 —
  // 스킨 연동을 위해 makeS/makeBlogS/… 팩토리의 (a, tint) 인자로 넘어간다.
  white: '#FFFFFF',
  dim: '#A1A1B0',
  muted: '#5A5A6E',
  red: '#FF6B9D',
};

// 댓글은 recordStore의 commentsByPost에 게시물별로 저장된다 (화면을 나가도 유지)
const commentTime = (c: { time?: string; createdAt: number }) => c.time ?? timeAgo(c.createdAt);

const currencySymbol = (code: string): string => {
  const map: Record<string, string> = {
    KRW: '₩', JPY: '¥', USD: '$',
    EUR: '€', CNY: '¥', GBP: '£',
    AUD: 'A$', CAD: 'C$', CHF: 'CHF',
    HKD: 'HK$', SGD: 'S$', THB: '฿',
    VND: '₫', MYR: 'RM', PHP: '₱',
    IDR: 'Rp', INR: '₹', TRY: '₺',
    MXN: 'MX$', BRL: 'R$', AED: 'AED',
    NZD: 'NZ$', SEK: 'kr', NOK: 'kr',
    DKK: 'kr', CZK: 'Kč', HUF: 'Ft',
    PLN: 'zł',
  };
  return map[code] || code;
};



// ─── 동행자 아이콘 — 기록하기 화면(NewRecordScreen)과 같은 공용 SVG 세트(size 16). 옛 View 조립 아이콘은 모양이 달라 폐기(2026-09-20) ───
const companionIcon = (name: string, color = '#FFFFFF'): React.ReactNode => {
  const map: Record<string, React.ReactNode> = {
    '혼자': <SoloIcon size={16} color={color} />,
    '친구': <FriendIcon size={16} color={color} />,
    '연인': <CoupleIcon size={16} color={color} />,
    '가족': <FamilyIcon size={16} color={color} />,
    '부모님': <ParentIcon size={16} color={color} />,
    '형제': <SiblingIcon size={16} color={color} />,
  };
  return map[name] || <FriendIcon size={16} color={color} />;
};

// ─── 좋아요 하트 (SVG) ───
// 텍스트 글리프(♥/♡)는 폰트에 따라 모양·크기가 흔들려 SVG로 그린다.
// 2026-09-20 시안 적용: 피그마 heart.svg 원본 path로 교체.
// ⚠️ viewBox가 정사각이 아니다(24×21, 2026-09-21 시안 heart.svg). size는 **가로**이고 높이는 비율로 따라온다 —
//    size를 높이로 착각해 정사각으로 그리면 하트가 세로로 눌린다.
// 채움색은 color를 안 주면 **스킨 강조색**(useSkinAccent)을 따른다 — 시안 원색 #A47DE9는 aurora 스킨값.
const HEART_W = 24;
const HEART_H = 21;
const HeartSvg = ({ filled, size = HEART_W, color, strokeWidth = 2 }: { filled: boolean; size?: number; color?: string; strokeWidth?: number }) => {
  const skin = useSkinAccent();
  const fillColor = color ?? skin.accent;
  return (
  <Svg width={size} height={size * (HEART_H / HEART_W)} viewBox={`0 0 ${HEART_W} ${HEART_H}`}>
    <SvgPath
      d="M21.3036 2.60712C20.766 2.09762 20.1278 1.69344 19.4253 1.41769C18.7228 1.14193 17.9699 1 17.2095 1C16.4491 1 15.6961 1.14193 14.9936 1.41769C14.2912 1.69344 13.6529 2.09762 13.1153 2.60712L11.9997 3.66403L10.8841 2.60712C9.79827 1.57844 8.32556 1.00053 6.78997 1.00053C5.25437 1.00053 3.78167 1.57844 2.69584 2.60712C1.61001 3.6358 1 5.03099 1 6.48577C1 7.94054 1.61001 9.33573 2.69584 10.3644L3.81147 11.4213L11.9997 19.1786L20.188 11.4213L21.3036 10.3644C21.8414 9.85515 22.268 9.25049 22.5591 8.58498C22.8502 7.91947 23 7.20615 23 6.48577C23 5.76539 22.8502 5.05207 22.5591 4.38656C22.268 3.72105 21.8414 3.11639 21.3036 2.60712Z"
      fill={filled ? fillColor : 'none'}
      stroke={filled ? fillColor : (color ?? C.white)}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
  );
};

// ─── 달력 (선형, 시안 calendar.svg) ───
// 공용 CalendarIcon은 '채움형'이라 시안의 선형 달력과 다르다 — 이 화면 날짜 알약 전용.
const CalendarLineIcon = ({ size = 13.3667, color = C.white }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 13.3667 13.3667">
    <SvgPath
      d="M10.1833 2.01667H3.18333C1.89467 2.01667 0.85 3.06134 0.85 4.35V10.1833C0.85 11.472 1.89467 12.5167 3.18333 12.5167H10.1833C11.472 12.5167 12.5167 11.472 12.5167 10.1833V4.35C12.5167 3.06134 11.472 2.01667 10.1833 2.01667Z"
      stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <SvgPath
      d="M4.35 0.85V3.18333M9.01667 0.85V3.18333M0.85 5.51667H12.5167"
      stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
  </Svg>
);

// ─── 알약 유리 테두리 — 블로그 기록 화면 알약과 같은 좌상단·우하단 흰색 대각 그라데이션 링(PillRing diagonal) ───
// 부모 알약의 첫 자식으로 넣으면 absoluteFill 층이 제 크기를 실측해 링을 얹는다(폭이 글자마다 달라도 됨).
// ⚠️ 부모에 borderWidth·overflow:'hidden'을 주지 말 것 — 링이 잘리거나 이중 테두리가 된다(블로그 알약 규칙).
const AutoPillRing = ({ radius }: { radius?: number } = {}) => {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width), h = Math.round(e.nativeEvent.layout.height);
        setSize((p) => (p.w === w && p.h === h ? p : { w, h }));
      }}
    >
      <PillRing width={size.w} height={size.h} radius={radius ?? size.h / 2} diagonal />
    </View>
  );
};

// ─── 별점 링 배지 (시안 ring.svg + star.svg) ───
// ring.svg의 C자는 **오른쪽**이 열려 있다. 90° 돌려 열린 쪽을 아래로 보내고 그 틈에 별을 놓는다.
// ⚠️ 회전은 래퍼 View가 맡는다 — Svg에 transform/pointerEvents 같은 RN prop을 직접 주면
//    안드로이드 새 아키텍처에서 리플렉션으로 처리되어 조용히 무시된다(layout-parity 규칙 11·13).
// 링 색 #A47DE9는 시안 고정값이라 스킨색을 따르지 않는다.
// 2026-09-21 게이지화: 링을 흰색으로 깔고, 같은 경로로 클립한 보라 원호를 점수/5만큼만 그린다(빈 부분 = 흰색).
// 경로 실측: 중심 (21,21), 바깥 r 21, 안쪽 r 17.2, C자 양 끝 캡 중심은 열린 쪽 기준 ±36°.
// 원호는 3시에서 시계방향으로 시작하므로 dashoffset으로 시작점을 +36°(열린 쪽 아래 끝)로 민다 — 래퍼가 90° 돌리면 좌하단에서 시작해 시계방향으로 찬다.
// 양 끝 둥근 캡까지 덮이도록 6°씩 여유를 두고 클립이 넘친 부분을 잘라낸다.
const RING_D = "M37.0322 10.6244C37.9147 10.0533 38.1736 8.86852 37.5249 8.04133C35.1169 4.97045 31.8916 2.6207 28.2023 1.2737C23.9149 -0.291657 19.2343 -0.417609 14.869 0.914905C10.5037 2.24742 6.69135 4.96585 4.00907 8.65868C1.32679 12.3515 -0.0793663 16.8177 0.00346007 21.3811C0.0862864 25.9445 1.65359 30.3567 4.4681 33.9498C7.28262 37.5428 11.1911 40.1211 15.6019 41.2943C20.0127 42.4676 24.6857 42.1719 28.9134 40.452C32.5514 38.972 35.6892 36.5067 37.9843 33.3505C38.6025 32.5003 38.3008 31.3257 37.3981 30.787C36.4955 30.2482 35.335 30.5511 34.6999 31.3887C32.8409 33.8401 30.3502 35.7578 27.4789 36.9259C24.0176 38.334 20.1917 38.5761 16.5804 37.6156C12.9692 36.655 9.76919 34.5441 7.46486 31.6023C5.16053 28.6606 3.87734 25.0482 3.80953 21.312C3.74171 17.5758 4.89298 13.9192 7.08903 10.8958C9.28509 7.87238 12.4064 5.64672 15.9804 4.55575C19.5544 3.46478 23.3866 3.5679 26.8967 4.8495C29.8085 5.91262 32.3672 7.73864 34.3138 10.121C34.979 10.935 36.1497 11.1956 37.0322 10.6244Z";
const RING_CX = 21, RING_CY = 21, RING_R = 19.1, RING_END_DEG = 36, RING_CAP_DEG = 6;
const RING_CIRC = 2 * Math.PI * RING_R;
const RatingRingBadge = ({ score }: { score: number }) => {
  const frac = Math.max(0, Math.min(1, score / 5));
  const RING_ARC_DEG = 360 - RING_END_DEG * 2; // 보이는 C자 원호 = 288°
  // 시작 캡 6° + 점수 비율 × 288° (+ 만점이면 끝 캡 6°). 클립이 캡 밖 넘침을 잘라낸다
  const fillLen = frac === 0 ? 0 : RING_CIRC * (RING_CAP_DEG + frac * RING_ARC_DEG + (frac === 1 ? RING_CAP_DEG : 0)) / 360;
  const startLen = RING_CIRC * (RING_END_DEG - RING_CAP_DEG) / 360;
  return (
  <View style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ transform: [{ rotate: '90deg' }] }}>
      <Svg width={38.3092} height={42} viewBox="0 0 38.3092 42">
        <SvgDefs><SvgClipPath id="ratingRingClip"><SvgPath d={RING_D} /></SvgClipPath></SvgDefs>
        <SvgPath d={RING_D} fill={C.white} />
        {fillLen > 0 && (
          <SvgG clipPath="url(#ratingRingClip)">
            <SvgCircle cx={RING_CX} cy={RING_CY} r={RING_R} fill="none" stroke="#A47DE9" strokeWidth={8}
              strokeDasharray={[fillLen, RING_CIRC]} strokeDashoffset={-startLen} />
          </SvgG>
        )}
      </Svg>
    </View>
    <Text style={{ position: 'absolute', top: 0, height: 42, left: 0, right: 0, textAlign: 'center', textAlignVertical: 'center', lineHeight: 42, includeFontPadding: false, fontSize: 14, fontWeight: '700', letterSpacing: 0.42, color: C.white }}>
      {score.toFixed(1)}
    </Text>
    <View style={{ position: 'absolute', top: 31, left: 0, right: 0, alignItems: 'center' }}>
      <Svg width={10.6954} height={10.2149} viewBox="0 0 10.6954 10.2149">
        <SvgPath
          d="M5.34746 8.55755L2.7552 10.1191C2.64069 10.192 2.52096 10.2233 2.39604 10.2128C2.27111 10.2024 2.1618 10.1608 2.0681 10.0879C1.97441 10.015 1.90153 9.92405 1.84948 9.81495C1.79742 9.70585 1.78701 9.58342 1.81825 9.44766L2.50535 6.49624L0.209801 4.51302C0.105695 4.41932 0.0407322 4.31251 0.0149137 4.19258C-0.0109047 4.07264 -0.00320081 3.95563 0.0380253 3.84153C0.0792515 3.72743 0.141715 3.63373 0.225417 3.56044C0.309119 3.48715 0.423636 3.4403 0.568968 3.4199L3.59847 3.15443L4.76966 0.374783C4.82172 0.249856 4.9025 0.15616 5.01202 0.0936957C5.12154 0.0312318 5.23335 0 5.34746 0C5.46156 0 5.57337 0.0312318 5.68289 0.0936957C5.79241 0.15616 5.87319 0.249856 5.92525 0.374783L7.09644 3.15443L10.1259 3.4199C10.2717 3.44072 10.3862 3.48757 10.4695 3.56044C10.5528 3.63332 10.6152 3.72701 10.6569 3.84153C10.6985 3.95605 10.7064 4.07327 10.6806 4.1932C10.6548 4.31313 10.5896 4.41974 10.4851 4.51302L8.18956 6.49624L8.87666 9.44766C8.9079 9.583 8.89749 9.70543 8.84543 9.81495C8.79338 9.92447 8.7205 10.0155 8.62681 10.0879C8.53311 10.1604 8.4238 10.202 8.29887 10.2128C8.17395 10.2237 8.05422 10.1924 7.93971 10.1191L5.34746 8.55755Z"
          fill={C.white}
        />
      </Svg>
    </View>
  </View>
  );
};

// ─── 슬라이드 이미지 뷰어 (상세보기용) ───
// frame: 피드 프레임(게시물 단위). 있으면 높이를 비율로 고정하고 사진을 contain + 채움색으로 넣는다.
// 없으면(블로그 블록·옛 글) 사진마다 원본 비율을 읽어 그리는 기존 동작.
const DOT_ACTIVE = '#8741FF'; // 시안 dots.svg 고정값 — 스킨색을 따르지 않는다(사용자 지정)
const SlideImageViewerDetail = ({ items, onImagePress, captions, fullBleed, frame }: { items: { uri: string; caption?: string }[]; onImagePress?: (uris: string[], index: number) => void; captions?: string[]; fullBleed?: boolean; frame?: PhotoFrame }) => {
  const SCREEN_W = useStageWidth(); // 슬라이드 폭 = 페이징 오프셋. 실시간이어야 한다.
  const [activeIdx, setActiveIdx] = useState(0);
  const [ratios, setRatios] = useState<Record<number, number>>({}); // index → 세로/가로 비율
  // fullBleed: 화면 폭 가득(엣지-투-엣지, 모서리 각지게) / 기본: 본문 좌우 패딩(16+16)과 일치
  const slideW = fullBleed ? SCREEN_W : SCREEN_W - 32;
  const imgRadius = fullBleed ? 0 : 8;
  // 각 사진의 원본 비율을 읽어 박스를 맞춤 (크롭 방지).
  // 전부 읽은 뒤 한 번에 반영한다 — 장마다 도착 순서대로 반영하면 컨테이너 높이가
  // 여러 번 바뀌며 본문이 계단식으로 밀렸다(레이아웃 점프). 한 번의 변화도 부드럽게.
  const framed = isFramed(frame);
  useEffect(() => {
    let alive = true;
    // 프레임 모드는 높이가 비율로 고정이라 원본 비율을 읽을 필요가 없다
    if (!items.length || framed) return;
    const acc: Record<number, number> = {};
    let left = items.length;
    const done = () => {
      if (!alive) return;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setRatios(acc);
    };
    items.forEach((it, i) => {
      Image.getSize(
        it.uri,
        (w, h) => { if (w > 0) acc[i] = h / w; if (--left === 0) done(); },
        () => { if (--left === 0) done(); },
      );
    });
    return () => { alive = false; };
  }, [items, framed]);
  // 너무 길거나 넓은 사진은 적당히 제한(0.6~1.4)
  const fixedH = frameHeight(frame, slideW); // 프레임 모드면 모든 슬라이드 동일 높이
  const heightFor = (i: number) => fixedH ?? slideW * Math.min(Math.max(ratios[i] ?? 0.75, 0.6), 1.4);
  const containerH = fixedH ?? Math.max(slideW * 0.75, ...items.map((_, i) => heightFor(i)));
  const fillColor = framed && frame ? frameFillColor(frame.fill) : undefined;
  return (
    <View style={{ marginBottom: 17 }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        // 스크롤 중에 바로 갱신한다 — onMomentumScrollEnd는 감속이 끝나야 불려 활성 점이 한 박자 늦었다.
        // 오버스크롤/빠른 스와이프로 범위 밖 인덱스가 되면 인디케이터·사진별 글이 꺼진다 — 클램프
        onScroll={(e) => {
          const idx = Math.min(items.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / slideW)));
          setActiveIdx((prev) => (prev === idx ? prev : idx));
        }}
        scrollEventThrottle={16}
        style={{ width: slideW, height: containerH }}
      >
        {items.map((item, i) => (
          <TouchableOpacity
            key={i}
            activeOpacity={0.85}
            onPress={() => onImagePress?.(items.map(it => it.uri), i)}
            style={{ width: slideW, height: containerH, alignItems: 'center', justifyContent: 'center' }}
          >
            <View style={{ width: slideW, height: heightFor(i), borderRadius: imgRadius, overflow: 'hidden', backgroundColor: fillColor }}>
              <Image source={{ uri: item.uri }} style={{ width: '100%', height: '100%' }} resizeMode={framed ? 'contain' : 'cover'} />
              {/* 사진별 글 — 사진 밖 별도 텍스트였던 걸 사진 하단 그라데이션 위로 올려
                  사진과 글이 한 덩어리로 읽히게 한다 */}
              {captions && captions[i] ? (
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.74)']}
                  style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingTop: 28, paddingBottom: 10 }}
                >
                  <Text style={{ color: '#F4F4FA', fontSize: 13, lineHeight: 19 }} numberOfLines={4}>
                    {captions[i]}
                  </Text>
                </LinearGradient>
              ) : null}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {items.length > 1 && (
        <>
          {/* 몇 번째 사진인지 — 점만으로는 5장 이상에서 위치가 안 읽힌다 */}
          <View style={{ position: 'absolute', top: 12, right: 14, width: 41, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>{activeIdx + 1}/{items.length}</Text>
          </View>
          {/* 시안 dots.svg: 점은 항상 최대 5개(활성 점을 가운데 두는 창), 활성에서 멀수록 작아진다
              (거리 0~2 = r3, 3 = r2.5, 4 = r2). 중심 간격 14는 고정이라 작은 점도 자리를 그대로 차지한다. */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 13 }}>
            {(() => {
              const shown = Math.min(5, items.length);
              const start = Math.max(0, Math.min(activeIdx - 2, items.length - shown));
              return Array.from({ length: shown }, (_, k) => start + k).map((i) => {
                const r = 3 - Math.max(0, Math.abs(i - activeIdx) - 2) * 0.5;
                return (
                  <View key={i} style={{ width: 14, height: 6, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{
                      width: r * 2, height: r * 2, borderRadius: r,
                      backgroundColor: i === activeIdx ? DOT_ACTIVE : 'rgba(195,195,195,0.6)',
                    }} />
                  </View>
                );
              });
            })()}
          </View>
        </>
      )}
    </View>
  );
};

// ─── 블로그 블록 렌더러 ───
// ─── 블로그 영상 플레이어 (로컬: expo-video, 임베드: WebView) ───
const BlogLocalVideo = ({ uri }: { uri: string }) => {
  const { blogS } = useSheets();
  const player = useVideoPlayer(uri, (p) => { p.loop = false; p.muted = false; });
  return (
    <VideoView style={blogS.video} player={player} contentFit="contain" nativeControls allowsFullscreen />
  );
};

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const getPlayableVideoUrl = (uri: string) => {
  const naverEmbedMatch = uri.match(/tv\.naver\.com\/embed\/([A-Za-z0-9]+)/);
  if (naverEmbedMatch) return `https://m.tv.naver.com/v/${naverEmbedMatch[1]}`;
  const playerMatch = uri.match(/player\.naver\.com[^"]*vid=([A-Za-z0-9]+)/);
  if (playerMatch) return `https://m.tv.naver.com/v/${playerMatch[1]}`;
  return uri;
};

/**
 * 블로그 본문의 단일 이미지 블록.
 *
 * 4:3 고정 + cover였던 탓에 세로로 찍은 사진은 위아래가 잘려 나갔다. 같은 사진이
 * 소셜 피드에서는 원본 비율로 보여서 화면마다 다르게 보이기도 했다. 원본 비율을 재서
 * 그대로 그리되, 지나치게 길거나 넓은 사진이 화면을 독점하지 않게 제한한다 —
 * 범위(0.6~1.4)는 같은 파일의 SlideImageViewerDetail과 맞췄다.
 */
const BlogImageBlock = ({ uri, caption, onImagePress }: {
  uri: string;
  caption?: string;
  onImagePress?: (uris: string[], index: number) => void;
}) => {
  const { blogS } = useSheets();
  const [ratio, setRatio] = useState<number | null>(null); // 높이/너비
  useEffect(() => {
    let alive = true;
    setRatio(null); // uri가 바뀌면 이전 사진의 비율을 그대로 쓰지 않는다
    Image.getSize(
      uri,
      (w, h) => {
        if (!alive || w <= 0) return;
        // 측정 전 4:3 자리에서 실제 비율로 바뀌는 순간이 튀지 않게
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setRatio(Math.min(Math.max(h / w, 0.6), 1.4));
      },
      () => {}, // 실패하면 기본 4:3 유지
    );
    return () => { alive = false; };
  }, [uri]);
  return (
    <View style={blogS.imageWrap}>
      <TouchableOpacity activeOpacity={0.85} onPress={() => onImagePress?.([uri], 0)}>
        {/* RN의 aspectRatio는 너비/높이라 h/w의 역수를 넣는다 */}
        <Image
          source={{ uri }}
          style={[blogS.image, ratio != null && { aspectRatio: 1 / ratio }]}
          resizeMode="cover"
        />
      </TouchableOpacity>
      {caption ? <Text style={blogS.caption}>{caption}</Text> : null}
    </View>
  );
};

const BlogVideoBlock = ({ uri, caption }: { uri: string; caption?: string }) => {
  const { blogS } = useSheets();
  const { t } = useTranslation();
  const isLocal = uri.startsWith('file://') || uri.startsWith('content://') || uri.startsWith('/');
  const isEmbed = uri.startsWith('http');
  return (
    <View style={blogS.imageWrap}>
      {isLocal ? (
        <BlogLocalVideo uri={uri} />
      ) : isEmbed ? (
        <View style={blogS.video}>
          <WebView
            source={{ uri: getPlayableVideoUrl(uri) }}
            style={{ flex: 1, backgroundColor: '#000' }}
            userAgent={MOBILE_UA}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsFullscreenVideo
            javaScriptEnabled
            domStorageEnabled
          />
        </View>
      ) : (
        <TouchableOpacity style={[blogS.video, { justifyContent: 'center', alignItems: 'center' }]} activeOpacity={0.7} onPress={() => Linking.openURL(uri).catch(() => {})}>
          <Text style={{ color: '#fff', fontSize: 40 }}>▶</Text>
          <Text style={{ color: '#A1A1B0', fontSize: 12, marginTop: 8 }} {...andFitText}>{t('blog.externalVideo')}</Text>
        </TouchableOpacity>
      )}
      {caption ? <Text style={blogS.caption}>{caption}</Text> : null}
    </View>
  );
};

const BlogBlockRenderer = ({
  block,
  fontScale,
  onImagePress,
}: {
  block: BlogBlock;
  fontScale: number;
  onImagePress?: (uris: string[], index: number) => void;
}) => {
  const { blogS } = useSheets();
  const skinAccent = useSkinAccent(); // 인용구 등 강조를 스킨색으로
  switch (block.type) {
    case 'text': {
      const fs = (block.fontSize || 15) * fontScale;
      // 커스텀 한글 서체(단일 굵기)에 fontWeight를 얹으면 안드로이드는 시스템 폰트로
      // 통째로 폴백한다 → 안드로이드는 서체 유지를 우선한다 (작성 화면과 동일 규칙)
      const customFam = block.fontFamily && block.fontFamily !== 'System' ? block.fontFamily : undefined;
      return (
        <Text
          style={[
            blogS.text,
            { fontSize: fs, lineHeight: fs * 1.7 },
            block.bold && { fontWeight: customFam && Platform.OS === 'android' ? 'normal' : '700' },
            block.italic && { fontStyle: 'italic' },
            (block.underline || block.strikethrough) && {
              textDecorationLine: block.underline
                ? (block.strikethrough ? 'underline line-through' : 'underline')
                : 'line-through',
            },
            block.color && { color: block.color },
            block.bgColor && block.bgColor !== 'transparent' && { backgroundColor: block.bgColor },
            block.align && { textAlign: block.align },
            customFam && { fontFamily: customFam },
          ]}
        >
          {block.value}
        </Text>
      );
    }
    case 'heading': {
      const sizes = { 1: 24, 2: 20, 3: 17 };
      const fs = sizes[block.level] * fontScale;
      return (
        <Text
          style={[
            blogS.heading,
            { fontSize: fs, lineHeight: fs * 1.4 },
            block.align && { textAlign: block.align },
          ]}
        >
          {block.value}
        </Text>
      );
    }
    case 'image':
      return <BlogImageBlock uri={block.uri} caption={block.caption} onImagePress={onImagePress} />;
    case 'images': {
      if (block.layout === 'slide') {
        return <SlideImageViewerDetail items={block.items} onImagePress={onImagePress} />;
      }
      const cols = block.layout === 'grid3' ? 3 : 2;
      return (
        <View style={blogS.imagesGrid}>
          {block.items.map((item, i) => (
            <View key={i} style={{ width: `${100 / cols - 1}%` as any }}>
              <TouchableOpacity activeOpacity={0.85} onPress={() => onImagePress?.(block.items.map(it => it.uri), i)}>
                <Image source={{ uri: item.uri }} style={blogS.gridImage} resizeMode="cover" />
              </TouchableOpacity>
              {item.caption ? <Text style={blogS.caption}>{item.caption}</Text> : null}
            </View>
          ))}
        </View>
      );
    }
    case 'separator': {
      const sepStyles: Record<string, any> = {
        line: { borderBottomWidth: 1, borderBottomColor: '#2A2A3A' },
        dots: { borderBottomWidth: 1, borderStyle: 'dotted', borderBottomColor: '#2A2A3A' },
        dashed: { borderBottomWidth: 1, borderStyle: 'dashed', borderBottomColor: '#2A2A3A' },
        thick: { borderBottomWidth: 3, borderBottomColor: '#2A2A3A' },
        space: { height: 32 },
      };
      return <View style={[blogS.separator, sepStyles[block.style] || sepStyles.line]} />;
    }
    case 'quote':
      return (
        <View style={[blogS.quote, { borderLeftColor: skinAccent.accent, backgroundColor: skinAccent.tint(0.06) }]}>
          <Text style={[blogS.quoteText, { fontSize: 15 * fontScale }]}>{block.value}</Text>
        </View>
      );
    case 'link':
      return (
        <TouchableOpacity
          style={blogS.linkCard}
          activeOpacity={0.7}
          onPress={() => Linking.openURL(block.url).catch(() => {})}
        >
          {block.thumbnail ? (
            <Image source={{ uri: block.thumbnail }} style={blogS.linkThumb} />
          ) : null}
          <View style={blogS.linkInfo}>
            <Text style={blogS.linkTitle} numberOfLines={1}>
              {block.title || block.url}
            </Text>
            {block.description ? (
              <Text style={blogS.linkDesc} numberOfLines={2}>{block.description}</Text>
            ) : null}
            <Text style={blogS.linkUrl} numberOfLines={1}>{block.url}</Text>
          </View>
        </TouchableOpacity>
      );
    case 'video':
      // 가져오기 자리 표시(채워지지 않은 placeholder)는 읽기 화면에서 숨긴다
      if ((block as any).placeholder || !block.uri) return null;
      return <BlogVideoBlock uri={block.uri} caption={block.caption} />;
    case 'file': {
      const sizeStr = block.fileSize ? (block.fileSize < 1024 * 1024 ? `${(block.fileSize / 1024).toFixed(0)}KB` : `${(block.fileSize / (1024 * 1024)).toFixed(1)}MB`) : '';
      return (
        <View style={blogS.fileBlock}>
          <PaperclipIcon size={20} color="#A1A1B0" />
          <View style={{ flex: 1 }}>
            <Text style={blogS.fileName} numberOfLines={1}>{block.fileName}</Text>
            {sizeStr ? <Text style={blogS.fileSize}>{sizeStr}</Text> : null}
          </View>
        </View>
      );
    }
    default:
      return null;
  }
};

// ─── 목차(TOC) 컴포넌트 ───
const TableOfContents = ({
  headings,
  onPress,
}: {
  headings: { id: string; level: number; text: string }[];
  onPress: (id: string) => void;
}) => {
  const { blogS } = useSheets();
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  const [open, setOpen] = useState(false);
  if (headings.length === 0) return null;
  return (
    <View style={[blogS.tocWrap, { backgroundColor: skinAccent.tint(0.06), borderColor: skinAccent.tint(0.12) }]}>
      <TouchableOpacity style={blogS.tocToggle} onPress={() => setOpen(!open)} activeOpacity={0.7}>
        <Text style={[blogS.tocToggleText, { color: skinAccent.accent }]}>📋 {t('comp2.toc')}</Text>
        <Text style={blogS.tocArrow}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open &&
        headings.map((h) => (
          <TouchableOpacity
            key={h.id}
            style={[blogS.tocItem, { paddingLeft: 16 + (h.level - 1) * 16 }]}
            onPress={() => onPress(h.id)}
            activeOpacity={0.7}
          >
            <Text style={blogS.tocItemText}>{h.text}</Text>
          </TouchableOpacity>
        ))}
    </View>
  );
};

// ── 스냅 스토리 뷰어 (자립형 — 내부에서 스냅 인덱스 관리) ──
// 같은 스토리 안에서 스냅 사진이 바뀔 때 부드럽게 크로스페이드
function CrossfadePhoto({ uri }: { uri?: string }) {
  const { storyS } = useSheets();
  const op = useRef(new Animated.Value(1)).current;
  const prev = useRef(uri);
  useEffect(() => {
    if (prev.current !== uri) {
      prev.current = uri;
      op.setValue(0.4);
      Animated.timing(op, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [uri]);
  if (!uri) {
    return <View style={storyS.bgPlaceholder}><Text style={{ fontSize: 64, opacity: 0.2 }}>📸</Text></View>;
  }
  return <Animated.Image source={{ uri }} style={[storyS.bgPhoto, { opacity: op }]} resizeMode="cover" />;
}

// ── 큐브 페이지: scrollX 기반으로 100% UI 스레드에서 3D rotateY 회전 ──
function SnapCubePage({ index, scrollX, width, leftCube, rightCube, children }: {
  index: number; scrollX: any; width: number; leftCube: boolean; rightCube: boolean; children: React.ReactNode;
}) {
  // 같은 유저/여행 경계는 평범한 슬라이드(회전 0), 다른 유저 경계만 큐브 회전
  const cubeStyle = useAnimatedStyle(() => {
    const input = [(index - 1) * width, index * width, (index + 1) * width];
    const lA = leftCube ? 88 : 0;
    const rA = rightCube ? -88 : 0;
    const rotateY = interpolate(scrollX.value, input, [lA, 0, rA], Extrapolation.CLAMP);
    const pivot = interpolate(scrollX.value, input, [leftCube ? -width / 2 : 0, 0, rightCube ? width / 2 : 0], Extrapolation.CLAMP);
    const scale = interpolate(scrollX.value, input, [leftCube ? 0.93 : 1, 1, rightCube ? 0.93 : 1], Extrapolation.CLAMP);
    return {
      transform: [
        { perspective: width * 1.6 },
        { translateX: pivot },
        { rotateY: `${rotateY}deg` },
        { translateX: -pivot },
        { scale },
      ],
    };
  });
  const shadeStyle = useAnimatedStyle(() => {
    const input = [(index - 1) * width, index * width, (index + 1) * width];
    const opacity = interpolate(scrollX.value, input, [leftCube ? 0.5 : 0, 0, rightCube ? 0.5 : 0], Extrapolation.CLAMP);
    return { opacity };
  });
  return (
    <Reanimated.View style={[{ width, height: '100%', backfaceVisibility: 'hidden' }, cubeStyle]}>
      {children}
      <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, shadeStyle]} />
    </Reanimated.View>
  );
}

function SnapViewerModal({
  visible,
  onClose,
  viewers = [],
}: {
  visible: boolean;
  onClose: () => void;
  viewers?: { handle: string; name: string; time: number; photo?: string }[];
}) {
  const { viewerS } = useSheets();
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  const viewerInsets = useSafeAreaInsets(); // pageSheet가 안드로이드에선 전체화면이라 상단 인셋 보정
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {/* pageSheet는 안드로이드에서 무시되어 전체화면이 되므로 상단 인셋을 직접 보정 */}
      <View style={[viewerS.root, Platform.OS === 'android' && { paddingTop: viewerInsets.top }]} accessibilityViewIsModal>
        {/* 드래그바 */}
        <View style={viewerS.handle} />
        <Text style={viewerS.title}>{t('postDetail.snapViewersTitle')}</Text>
        <Text style={[viewerS.subtitle, { color: skinAccent.accent }]}>{t('postDetail.totalReadN', { count: viewers.length })}</Text>

        <ScrollView contentContainerStyle={viewerS.list} showsVerticalScrollIndicator={false}>
          {viewers.length === 0 && (
            <Text style={[viewerS.subtitle, { color: skinAccent.accent }]}>{t('postDetail.noSnapViewers')}</Text>
          )}
          {viewers.map((v, i) => (
            <View key={i} style={viewerS.row}>
              {/* 공통 아바타 — 사진 없으면 사람 실루엣(이모지 폴백 금지, AuthorAvatar 주석 참조) */}
              <View style={viewerS.avatar}>
                <AuthorAvatar photo={v.photo} size={44} />
              </View>
              <View style={viewerS.info}>
                <Text style={viewerS.name}>{v.name}</Text>
                <Text style={viewerS.handleText}>@{v.handle}</Text>
              </View>
              <Text style={viewerS.time}>{v.time}</Text>
            </View>
          ))}
        </ScrollView>
        
        {/* 닫기 버튼은 margin:20을 유지해야 해서 폭 클램프를 래퍼가 맡는다
            (버튼에 직접 width:'100%'+margin을 주면 40dp 넘친다). */}
        <View style={viewerS.footer}>
          <TouchableOpacity style={viewerS.closeBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={viewerS.closeBtnText} {...andFitText}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function SnapStoryViewer({
  initialPostId, records, navigation, toggleLike, deleteRecord, archiveRecord, markSnapViewed,
}: {
  initialPostId: string;
  records: TravelRecord[];
  navigation: any;
  toggleLike: (id: string) => void;
  deleteRecord: (id: string) => void;
  archiveRecord: (id: string) => void;
  markSnapViewed: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { s, shareS, storyS } = useSheets();
  // 스토리 페이지 폭·높이 — 폭은 Stage(클램프), 높이는 실제 창. 스크롤 오프셋 계산에 들어간다.
  const SCREEN_W = useStageWidth();
  // ⋯ 메뉴는 Modal(루트 클램프 밖) 안에서 오른쪽 끝에 붙는다 — 레터박스만큼 안쪽으로
  const stageGutter = useStageGutter();
  const { height: SCREEN_H } = useWindowDimensions();
  const insets = useSafeAreaInsets(); // 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨)
  const skinAccent = useSkinAccent(); // 댓글 배지·전송 버튼 등 강조를 스킨색으로
  // 내 프로필(사진·아이디)은 실시간 설정에서 읽어, 프로필 변경이 내 스냅 헤더에 즉시 반영되게 한다
  const { handle: myHandle, profilePhoto: myPhoto, handleFont: myHandleFont, isPremium: myPremium } = useSettings();
  // 작성자별로 그룹화된 전체 스냅 목록 (같은 작성자끼리 연속 배치)
  const allSnaps = useMemo(() => records.filter((r: any) => r.viewType === 'snap'), [records]);
  // 작성자 + 국가별로 그룹화 (같은 사용자라도 다른 나라면 별도 스토리)
  const getStoryKey = (s: any) =>
    `${s.user.handle}::${s.countryName || s.snapDetectedCountry || ''}`;

  // 스토리(유저+국가) 단위 그룹 — 선택한 스토리를 맨 앞으로
  const stories = useMemo(() => {
    const byKey: Record<string, any[]> = {};
    const order: string[] = [];
    const initialSnap = allSnaps.find((r: any) => r.id === initialPostId);
    const startKey = initialSnap ? getStoryKey(initialSnap) : '';
    allSnaps.forEach((s: any) => {
      const k = getStoryKey(s);
      if (!byKey[k]) { byKey[k] = []; order.push(k); }
      byKey[k].push(s);
    });
    const keys = [startKey, ...order.filter(k => k !== startKey)].filter(k => byKey[k]);
    // 스토리 안 스냅은 제일 먼저 올린 것부터(오름차순) 재생
    return keys.map(k => ({
      key: k,
      snaps: [...byKey[k]].sort((a: any, b: any) => (a.timestamp ?? 0) - (b.timestamp ?? 0)),
    }));
  }, [allSnaps, initialPostId]);

  // 초기 위치는 한 번만 확정 (이후 store 변경으로 뷰어가 점프하지 않게).
  // stories가 처음 채워진 렌더에서 계산해, 데이터가 늦게 와도 올바른 위치를 잡는다.
  const initPosRef = useRef<{ si: number; li: number } | null>(null);
  if (initPosRef.current === null && stories.length > 0) {
    let pos = { si: 0, li: 0 };
    for (let si = 0; si < stories.length; si++) {
      // 해당 스토리를 열면 제일 먼저 올린 스냅(li=0)부터 재생
      if (stories[si].snaps.some((s: any) => s.id === initialPostId)) { pos = { si, li: 0 }; break; }
    }
    initPosRef.current = pos;
  }
  const initPos = initPosRef.current ?? { si: 0, li: 0 };

  const [storyIdx, setStoryIdx] = useState(initPos.si);
  const [localIdx, setLocalIdx] = useState(initPos.li);
  const currentStory = stories[storyIdx];
  const currentSnap = currentStory?.snaps[Math.min(localIdx, (currentStory?.snaps.length || 1) - 1)];
  // 스냅 열람 시 viewed 처리 — 스냅 id가 바뀔 때만 실행(snapViewed 변경으로 인한 재실행 방지)
  useEffect(() => {
    if (currentSnap && !currentSnap.isExample && !currentSnap.isMyPost && !currentSnap.snapViewed) markSnapViewed(currentSnap.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSnap?.id]);

  const [commentSheetOpen, setCommentSheetOpen] = useState(false);
  const [viewerListOpen, setViewerListOpen] = useState(false);
  const [replyBarOpen, setReplyBarOpen] = useState(false);
  const { commentsByPost, addComment: addCommentToStore, reportPost, neighbors, isBlocked, refreshComments, blockUser } = useRecords();
  // ── 공유 시트 (인스타식: 메이트 DM으로 보내기 + 외부 공유) ──
  const { sendRecord, conversations } = useDM();
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  // 대화량 많은 메이트 순 — 소셜 피드 빠른공유와 동일 기준
  const shareFriends = useMemo(
    () => neighbors
      // photo를 같이 넘겨야 시트 아바타에 프로필 사진이 뜬다 (소셜 탭 공유 시트와 같은 규칙)
      .map((f) => ({ id: f.id, name: f.username, handle: f.username, emoji: '🧳', photo: f.photo }))
      .sort((a, b) => (conversations[b.handle]?.length ?? 0) - (conversations[a.handle]?.length ?? 0)),
    [neighbors, conversations]
  );
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  // @자동완성이 "지금 어느 토큰을 쓰는 중인가"를 알려면 커서 위치가 필요하다(onSelectionChange로 추적)
  const [commentCursor, setCommentCursor] = useState(0);
  // 칩 줄은 "입력 중"에만 뜬다 — activeMention 은 텍스트+커서만 보므로, `@ab` 까지 치고
  // 안드로이드 뒤로가기로 키보드만 내리면 칩 줄이 그대로 남는다(포커스 조건이 그걸 막는다).
  const [commentFocused, setCommentFocused] = useState(false);
  // ⚠️ blur 로 칩 줄을 **즉시** 끄면 안 된다 — 칩을 누르는 순간 blur 가 press 보다 먼저 오는
  //    경우가 있어(안드로이드) 칩이 사라지고 그 탭이 빈 곳에 떨어진다. 한 박자 늦춰 끄고,
  //    다시 포커스가 잡히면 예약을 취소한다(SocialScreen 댓글 시트와 같은 방식).
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (blurTimerRef.current) clearTimeout(blurTimerRef.current); }, []);
  const onCommentFocus = () => {
    if (blurTimerRef.current) { clearTimeout(blurTimerRef.current); blurTimerRef.current = null; }
    setCommentFocused(true);
  };
  const onCommentBlur = () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => { blurTimerRef.current = null; setCommentFocused(false); }, 200);
  };
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const replyInputRef = useRef<TextInput>(null);
  const commentInputRef = useRef<TextInput>(null);
  const sendingCommentRef = useRef(false);

  const commentSheetAnim = useRef(new Animated.Value(SCREEN_H * 0.6)).current;
  const commentOverlayAnim = useRef(new Animated.Value(0)).current;
  // 댓글 시트는 화면 하단 고정(absolute)이라 내부 KeyboardAvoidingView만으로는 입력창이 키보드에
  // 가린다. 키보드 높이만큼 시트 전체를 위로 들어올려 입력창이 항상 키보드 위에 보이게 한다.
  const keyboardLift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: any) => {
      Animated.timing(keyboardLift, {
        toValue: e.endCoordinates?.height ?? 0,
        duration: e.duration || 220,
        useNativeDriver: true,
      }).start();
    };
    const onHide = (e: any) => {
      Animated.timing(keyboardLift, {
        toValue: 0,
        duration: e?.duration || 200,
        useNativeDriver: true,
      }).start();
    };
    const s1 = Keyboard.addListener(showEvt, onShow);
    const s2 = Keyboard.addListener(hideEvt, onHide);
    return () => { s1.remove(); s2.remove(); };
  }, [keyboardLift]);

  // ── Reanimated 큐브 캐러셀 (스토리 단위 페이지) ──
  const scrollRef = useRef<any>(null);
  const scrollX = useSharedValue(initPos.si * SCREEN_W);
  const ty = useSharedValue(0); // 아래로 끌어 닫기
  const onStoryChange = (i: number) => {
    const t = Math.max(0, Math.min(stories.length - 1, i));
    setStoryIdx(t); setLocalIdx(0);
  };
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => { scrollX.value = e.contentOffset.x; },
    onMomentumEnd: (e) => { runOnJS(onStoryChange)(Math.round(e.contentOffset.x / SCREEN_W)); },
  });
  const dismissStyle = useAnimatedStyle(() => {
    const scale = interpolate(ty.value, [0, SCREEN_H], [1, 0.86], Extrapolation.CLAMP);
    const radius = interpolate(ty.value, [0, 120], [0, 22], Extrapolation.CLAMP);
    return { transform: [{ translateY: ty.value }, { scale }], borderRadius: radius };
  });
  useEffect(() => {
    if (initPos.si > 0) {
      const t = setTimeout(() => scrollRef.current?.scrollTo({ x: initPos.si * SCREEN_W, animated: false }), 0);
      return () => clearTimeout(t);
    }
  }, []);

  // 댓글 시트 드래그 닫기 PanResponder — Hook이므로 early return 위에서 생성한다.
  // (콜백은 렌더 시점이 아닌 제스처 시점에 실행되므로 아래의 closeCommentSheet 전방 참조는 안전)
  const commentSheetPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4,
      onPanResponderMove: (_, g) => { if (g.dy > 0) commentSheetAnim.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) closeCommentSheet();
        else Animated.spring(commentSheetAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }).start();
      },
    })
  ).current;

  // 표시할 스냅이 없으면 닫기 — 렌더 중 부수효과 금지, useEffect에서 처리
  useEffect(() => {
    if (!currentSnap || stories.length === 0) navigation.goBack();
  }, [currentSnap, stories.length, navigation]);

  // ── 스토리 자동 넘김 + 진행 바 + 길게 눌러 일시정지 ──
  const STORY_DURATION = 5000; // 스냅 1장 노출 시간(ms)
  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const [paused, setPaused] = useState(false);
  const [dragPaused, setDragPaused] = useState(false); // 아래로 끌어 닫기 드래그 중 일시정지
  // 꾹 누르는 동안 UI 전체 페이드 아웃 — 사진만 보기 (인스타 스토리 패턴)
  const uiOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(uiOpacity, { toValue: paused ? 0 : 1, duration: 150, useNativeDriver: true }).start();
  }, [paused, uiOpacity]);
  const advanceRef = useRef<(dir: 'next' | 'prev') => void>(() => {});

  // 어떤 오버레이도 안 떠 있고 일시정지/드래그 아니면 재생
  const storyPlaying =
    !paused && !dragPaused && !commentSheetOpen && !replyBarOpen && !menuVisible && !reportVisible && !viewerListOpen && !shareSheetOpen;

  // 스냅이 바뀌면 진행도 리셋
  useEffect(() => { progressAnim.setValue(0); }, [storyIdx, localIdx]);

  // 다음 스냅 이미지 미리 받기 — 자동 넘김 전환 시 깜빡임/로딩 감소
  useEffect(() => {
    if (!currentStory) return;
    const next = localIdx < currentStory.snaps.length - 1
      ? currentStory.snaps[localIdx + 1]
      : stories[storyIdx + 1]?.snaps?.[0];
    const uri = next && (next.snapBackUri || next.snapFrontUri || next.medias?.[0]);
    if (uri) Image.prefetch(uri).catch(() => {});
  }, [storyIdx, localIdx, currentStory, stories]);

  // 재생 중일 때 현재 값에서 이어서 진행, 완료되면 다음으로
  useEffect(() => {
    if (!storyPlaying) { progressAnim.stopAnimation(); return; }
    progressAnim.stopAnimation((v: number) => {
      const remaining = STORY_DURATION * (1 - v);
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: Math.max(0, remaining),
        easing: Easing.linear,
        useNativeDriver: false,
      }).start(({ finished }) => { if (finished) advanceRef.current('next'); });
    });
    return () => { progressAnim.stopAnimation(); };
  }, [storyPlaying, storyIdx, localIdx]);

  // 표시 중인 스냅이 바뀌면 그 스냅의 서버 댓글을 불러온다.
  // PostDetail 본문 이펙트는 '진입한' 스냅 하나만 조회해서, 스토리를 넘기면 다른 스냅의
  // 서버 댓글이 붙지 않아 댓글 수가 0으로 보였다.
  // 한 번 불러온 스냅은 다시 부르지 않는다 — 넘겼다 돌아올 때의 중복 조회와,
  // refreshComments가 commentsByPost를 갱신해 재렌더될 때의 재호출 루프를 함께 막는다.
  // 진입 스냅(initialPostId)은 본문 이펙트가 이미 조회하므로 미리 넣어 둔다.
  const fetchedCommentsRef = useRef<Set<string>>(new Set([initialPostId]));
  useEffect(() => {
    const id = currentSnap?.id;
    const remoteId = currentSnap?.remoteId;
    if (!id || !remoteId || currentSnap?.isExample) return;
    if (fetchedCommentsRef.current.has(id)) return;
    // await 전에 넣어 동시 중복 호출을 막고, 실패하면 되돌려 다음 진입 때 재시도되게 한다
    fetchedCommentsRef.current.add(id);
    refreshComments(id, remoteId).catch(() => { fetchedCommentsRef.current.delete(id); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSnap?.id, currentSnap?.remoteId, refreshComments]);

  // 복귀 포커스 — 지금 보고 있는 스냅의 서버 댓글을 다시 받는다.
  // 스냅당 1회 조회라, 뷰어를 띄워 둔 채 프로필 등을 다녀오면 그 사이 달린 댓글이 영영 안 왔다.
  // ⚠️ 위 이펙트를 다시 태우는 방식은 쓸 수 없다 — deps(currentSnap.id/remoteId)가 그대로라
  //    표식을 지워도 다시 돌지 않는다. 그래서 여기서 **직접** 조회하고, 표식은 그대로 둔다
  //    (그래야 이 콜백이 조회한 스냅을 위 이펙트가 한 번 더 받지 않는다).
  //    조회된 적 없는 스냅이면 표식을 새로 넣는데, 그 조회도 여기서 하므로 결과는 같다.
  // ⚠️ 진입 스냅(initialPostId)은 건너뛴다 — 그 글은 PostDetail 본문의 포커스 이펙트가
  //    이미 refreshComments를 부른다(둘 다 도는 화면이라 안 걸러 주면 같은 조회가 2회 나간다).
  // ⚠️ 최신 스냅은 ref로 읽는다 — deps에 넣으면 재조회 → 재렌더 → 포커스 콜백 재실행 루프.
  const snapSyncRef = useRef({ id: currentSnap?.id, remoteId: currentSnap?.remoteId, isExample: currentSnap?.isExample });
  snapSyncRef.current = { id: currentSnap?.id, remoteId: currentSnap?.remoteId, isExample: currentSnap?.isExample };
  const firstSnapFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstSnapFocusRef.current) { firstSnapFocusRef.current = false; return; }
      const { id, remoteId, isExample } = snapSyncRef.current;
      if (!id || !remoteId || isExample) return;
      if (id === initialPostId) return; // 본문 포커스 이펙트가 담당하는 글 — 중복 조회 방지
      fetchedCommentsRef.current.add(id); // 조회 가드 유지(위 이펙트가 다시 받지 않게)
      refreshComments(id, remoteId).catch(() => { fetchedCommentsRef.current.delete(id); });
    }, [refreshComments, initialPostId])
  );

  if (!currentSnap || stories.length === 0) return null;

  // 수정 3: 차단된 사용자의 댓글·답글 필터 (PostComment에 handle 없으므로 name으로 매칭)
  const rawSnapComments = commentsByPost[currentSnap.id] ?? [];
  const comments = rawSnapComments
    .filter((c: any) => !isBlocked({ name: c.name }))
    .map((c: any) => ({
      ...c,
      replies: c.replies ? c.replies.filter((r: any) => !isBlocked({ name: r.name })) : c.replies,
    }));
  const totalComments = comments.reduce((sum: number, c) => sum + 1 + (c.replies?.length || 0), 0);
  const isMyPost = currentSnap.isMyPost === true;

  const addComment = () => {
    // 연타 가드 — 입력 비우기에만 의존하면 두 번 눌린 사이에 같은 댓글이 두 번 저장된다
    // (서버 addComment 에 멱등키가 없어 중복 행이 그대로 남는다).
    if (sendingCommentRef.current || !commentText.trim()) return;
    sendingCommentRef.current = true;
    setTimeout(() => { sendingCommentRef.current = false; }, 800);
    addCommentToStore(currentSnap.id, commentText.trim(), replyTo?.id);
    setReplyTo(null);
    setCommentText('');
  };
  const handleReply = (id: string, name: string) => {
    setReplyTo({ id, name });
    // 답글 대상 아이디를 본문 앞에 미리 채운다 — 이미 그 사람으로 시작하면 중복 삽입하지 않는다
    const next = ensureReplyPrefix(commentText, name);
    setCommentText(next);
    // ⚠️ 커서도 **같은 만큼 밀어야 한다.** 접두사를 앞에 끼우면 기존 글자가 전부 오른쪽으로
    //    밀리는데 커서 상태를 그대로 두면 findActiveMention 이 방금 넣은 접두사의 앞부분을
    //    "입력 중인 토큰"으로 잡는다(본문 `좋아요`·커서 3 + 대상 `jusang` → `{start:0,end:3,
    //    query:'ju'}`). 그 상태에서 칩을 누르면 본문이 `@justin sang 좋아요` 로 깨지고
    //    replyTo 는 여전히 jusang 이라 보이는 태그와 실제 답글 부모가 달라진다.
    //    onSelectionChange 에 기대면 안 된다 — 안드로이드 ReactEditText.maybeSetText 는 텍스트를
    //    바꾼 뒤 직전 selection 인덱스를 복원해, 값이 같으면 이벤트가 아예 발화하지 않는다.
    //    접두사를 안 붙인 경우(이미 그 사람으로 시작)엔 delta 0 이라 그대로다.
    const delta = next.length - commentText.length;
    setCommentCursor((c) => Math.min(c + delta, next.length));
    commentInputRef.current?.focus();
  };
  // 답글을 취소해도 본문은 건드리지 않는다(설계 2026-09-09: 접두사 강제 삭제 안 함)
  const cancelReply = () => setReplyTo(null);

  // ── @자동완성 (스냅 댓글 시트) ──
  // 후보는 전부 로컬 데이터다 — 메이트 + 스냅 작성자 + 이 스냅의 댓글·답글 작성자.
  // 중복 제거·접두 일치·상한(8)은 filterMentionCandidates 가 하므로 여기선 순서만 정한다.
  // useMemo 를 쓰지 않는다: 이 블록은 early return(944행) 뒤라 훅을 새로 추가할 수 없고,
  // comments 도 매 렌더 새 배열이라 메모해도 매번 다시 계산된다.
  const mentionCandidates: MentionCandidate[] = [];
  for (const n of neighbors) mentionCandidates.push({ handle: n.username, photo: n.photo, emoji: n.emoji });
  if (currentSnap.user?.handle) mentionCandidates.push({ handle: currentSnap.user.handle, photo: currentSnap.user.photo });
  for (const c of comments) {
    mentionCandidates.push({ handle: c.name, photo: c.photo });
    for (const r of ((c.replies ?? []) as any[])) mentionCandidates.push({ handle: r.name, photo: r.photo });
  }
  const activeMention = findActiveMention(commentText, commentCursor);
  const pickMention = (handle: string) => {
    if (!activeMention) return;
    const next = applyMention(commentText, activeMention, handle);
    setCommentText(next.text);
    // ⚠️ TextInput 의 `selection` 을 prop 으로 제어하지 않는다 — 안드로이드에서 제어된 selection 은
    //    조합 중인 한글을 끊고 커서가 튄다. 커서 상태는 뒤따라오는 onSelectionChange 가 덮어쓴다.
    setCommentCursor(next.cursor);
  };

  const goToStory = (target: number) => {
    if (target < 0 || target >= stories.length) { navigation.goBack(); return; }
    scrollRef.current?.scrollTo({ x: target * SCREEN_W, animated: true });
  };
  // 같은 스토리 안에선 사진만 교체(localIdx), 끝이면 다음 스토리로(큐브)
  const advance = (dir: 'next' | 'prev') => {
    if (replyBarOpen || commentSheetOpen) return;
    const len = currentStory.snaps.length;
    if (dir === 'next') {
      if (localIdx < len - 1) setLocalIdx(localIdx + 1);
      else goToStory(storyIdx + 1);
    } else {
      if (localIdx > 0) setLocalIdx(localIdx - 1);
      else goToStory(storyIdx - 1);
    }
  };
  const onTapPage = (evt: any) => {
    if (replyBarOpen || commentSheetOpen) return;
    advance(evt.nativeEvent.locationX < SCREEN_W / 3 ? 'prev' : 'next');
  };
  // 자동 넘김 타이머가 최신 advance를 참조하도록 (stale 클로저 방지)
  advanceRef.current = advance;

  // 아래로 끌어 닫기 (gesture-handler + reanimated, 가로 스크롤과 공존)
  const closeViewer = () => navigation.goBack();
  const dismissGesture = Gesture.Pan()
    .activeOffsetY([14, 9999])
    .failOffsetX([-18, 18])
    .onStart(() => { 'worklet'; runOnJS(setDragPaused)(true); }) // 드래그 동안 자동 넘김 정지
    .onUpdate((e) => { 'worklet'; if (e.translationY > 0) ty.value = e.translationY; })
    .onEnd((e) => {
      'worklet';
      if (e.translationY > 100 || e.velocityY > 700) {
        ty.value = withTiming(SCREEN_H, { duration: 180 }, () => { runOnJS(closeViewer)(); });
        // 닫히는 중이므로 재개 불필요
      } else {
        ty.value = withSpring(0, { damping: 18, stiffness: 180 });
        runOnJS(setDragPaused)(false); // 취소(원위치)면 자동 넘김 재개
      }
    });

  // 한 스토리(유저) 페이지 렌더 — 같은 스토리는 사진만 교체
  const renderStoryPage = (story: any, si: number) => {
    const li = si === storyIdx ? Math.min(localIdx, story.snaps.length - 1) : 0;
    const s = story.snaps[li];
    // 이 페이지(스냅) 기준 댓글 수 — currentSnap 기준(totalComments)으로 그리면 다른 페이지에 오표시됨
    const sComments = commentsByPost[s.id] ?? [];
    const sTotalComments = sComments.reduce((sum: number, c: any) => sum + 1 + (c.replies?.length || 0), 0);
    const late = (s.snapLateSeconds && s.snapLateSeconds > 0)
      ? (s.snapLateSeconds < 60 ? t('postDetail.snapLateSec', { sec: s.snapLateSeconds }) : t('postDetail.snapLateMinSec', { min: Math.floor(s.snapLateSeconds / 60), sec: s.snapLateSeconds % 60 }))
      : '';
    return (
      <>
        <CrossfadePhoto uri={s.snapBackUri || s.snapFrontUri || s.medias?.[0]} />
        {/* 탭으로 넘기기 — 하단(캡션·지역 배지·액션)·상단 헤더 영역은 제외해 오탭 방지 */}
        <Pressable
          style={{ position: 'absolute', left: 0, right: 0, top: 64, bottom: 140 }}
          onPress={onTapPage}
          onLongPress={() => setPaused(true)}
          delayLongPress={200}
          onPressOut={() => setPaused(false)}
        />
        {/* PiP(다른 방향 사진)는 꾹 눌러도 사진과 함께 계속 보인다 — 페이드 래퍼 밖 */}
        {s.snapBackUri && s.snapFrontUri && (
          <LinearGradient colors={['#00D8F3', '#7B61FF', '#FF14E4']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={storyS.pipWrap}>
            <Image source={{ uri: s.snapFrontUri }} style={storyS.pipImg} resizeMode="cover" />
          </LinearGradient>
        )}
        {/* 꾹 누르는 동안(paused) 오버레이 UI 전체가 페이드 아웃되고 사진만 남는다 (인스타 스토리 패턴) */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: uiOpacity }]} pointerEvents={paused ? 'none' : 'box-none'}>
        {/* 안드로이드 상태바 인셋 보정 — 스토리 뷰어 루트에 SafeAreaView가 없어 전체가 edge-to-edge다.
            스타일의 리터럴 50은 iPhone 노치 기준값이라 안드로이드에선 기기별 상태바 높이와 어긋난다.
            직계 형제 bottomGradient(insets.bottom + 16)와 같은 방식으로 맞춘다 */}
        <LinearGradient colors={['rgba(0,0,0,0.6)', 'transparent']} style={[storyS.topGradient, { paddingTop: Platform.OS === 'ios' ? 50 : insets.top + 16 }]} pointerEvents="box-none">
          <View style={storyS.progressRow}>
            {story.snaps.map((_: any, k: number) => {
              const isCurrentPage = si === storyIdx;
              const isPast = isCurrentPage && k < li;
              const isActive = isCurrentPage && k === li;
              return (
                <View key={k} style={storyS.progressSeg}>
                  {isActive ? (
                    <Animated.View style={[storyS.progressFill, { width: progressWidth }]} />
                  ) : (
                    <View style={[storyS.progressFill, { width: isPast ? '100%' : '0%' }]} />
                  )}
                </View>
              );
            })}
          </View>
          <View style={storyS.topRow}>
            {/* 프로필 사진·아이디 탭 → 프로필 화면 (내 스냅이면 내 프로필로, 예시는 이동 금지) */}
            <TouchableOpacity
              style={storyS.authorTap}
              activeOpacity={s.isExample ? 1 : 0.7}
              accessibilityRole="button"
              accessibilityLabel={s.isMyPost === true ? t('postDetail.myProfileA11y') : t('postDetail.authorProfileA11y')}
              onPress={() => {
                if (s.isExample) return;
                navigation.navigate('FriendProfile', s.isMyPost === true
                  ? { userId: s.authorId ?? s.id, username: myHandle || s.user.name, handle: myHandle }
                  : { userId: s.authorId ?? s.id, username: s.user.name, handle: s.user.handle });
              }}
            >
              <View style={storyS.avatarRing}><View style={[storyS.avatar, s.isExample && { overflow: 'hidden' }]}>
                {s.isExample ? (
                  <Image source={APP_LOGO} style={{ width: 40, height: 40 }} resizeMode="cover" />
                ) : (
                  // 내 스냅은 실시간 설정 사진, 타인 스냅은 작성자 프로필 사진.
                  // 타인 분기(s.user.photo)가 없어 남의 스냅은 항상 실루엣으로 보였다.
                  // AuthorAvatar가 사진 없음·로드 실패를 모두 사람 실루엣으로 폴백한다.
                  <AuthorAvatar photo={s.isMyPost === true ? myPhoto : s.user?.photo} size={40} emojiSize={22} />
                )}
              </View></View>
              <View style={storyS.userInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {/* 예시 콘텐츠는 @핸들 대신 'eOrth 공식' 필 배지만 표시 (기능 소개 카드와 동일 룩) */}
                  {s.isExample ? (
                    <Text style={storyS.officialBadge}>{t('socialEmpty.official')}</Text>
                  ) : (
                    <Text style={[storyS.handle, handleFontStyle(s.isMyPost === true ? (myPremium ? myHandleFont : null) : s.user.font)]}>@{s.isMyPost === true ? (myHandle || s.user.handle) : s.user.handle}</Text>
                  )}
                </View>
                {!s.isExample && <Text style={storyS.timeText}>{timeAgo(s.timestamp)}</Text>}
              </View>
            </TouchableOpacity>
            {!s.isExample && (
              <TouchableOpacity onPress={() => setMenuVisible(true)} style={storyS.moreBtn} accessibilityRole="button" accessibilityLabel={t('postDetail.more')}><Text style={storyS.moreBtnText}>···</Text></TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => navigation.goBack()} style={storyS.closeBtn} accessibilityRole="button" accessibilityLabel={t('common.close')}><Text style={storyS.closeBtnText}>✕</Text></TouchableOpacity>
          </View>
        </LinearGradient>
        {/* 스냅 및 촬영지연 뱃지 비활성화 */}
        {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) */}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={[storyS.bottomGradient, { paddingBottom: Platform.OS === 'ios' ? 36 : insets.bottom + 16 }]} pointerEvents="box-none">
          {s.snapDetectedCountry && (
            <View style={storyS.locationBadge}>
              <PinIcon size={13} color="#FFFFFF" />
              <Text style={storyS.locationText}>{countryLabel(s.snapDetectedCountry, i18n.language)}{s.regionName ? ` · ${regionDisplayName(s.regionName, s.regionNameEn, i18n.language)}` : ''}</Text>
            </View>
          )}
          {s.snapCaption ? <Text style={storyS.caption}>{s.snapCaption}</Text> : null}
          <View style={storyS.actionRow}>
            {s.isMyPost === true ? (
              /* 내가 올린 스냅 */
              <>
                <TouchableOpacity style={storyS.actionBtnWithLabel} onPress={() => setViewerListOpen(true)} accessibilityRole="button" accessibilityLabel={t('postDetail.viewersA11y')}>
                  <EyesSvg size={20} />
                  <Text style={storyS.actionLabel}>{s.snapViewers?.length ?? 0}</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                {!s.isExample && (
                  <TouchableOpacity style={storyS.actionBtn} onPress={openCommentSheet} accessibilityRole="button" accessibilityLabel={t('postDetail.commentA11y')}>
                    <CommentIcon size={22} color="#fff" />
                    {sTotalComments > 0 && (<View style={[storyS.commentCountBadge, { backgroundColor: skinAccent.accent }]}><Text style={storyS.commentCountText}>{sTotalComments}</Text></View>)}
                  </TouchableOpacity>
                )}
                {!s.isExample && (
                  <TouchableOpacity style={storyS.actionBtn} onPress={() => { tap(); toggleLike(s.id); }} accessibilityRole="button" accessibilityLabel={s.liked ? t('postDetail.unlike') : t('postDetail.like')}>
                    <Text style={[storyS.actionIcon, s.liked && { color: '#FF6B9D' }]}>{s.liked ? '♥' : '♡'}</Text>
                  </TouchableOpacity>
                )}
                {!s.isExample && (
                  <TouchableOpacity style={storyS.actionBtn} onPress={handleSharePost} accessibilityRole="button" accessibilityLabel={t('postDetail.shareA11y')}>
                    <ShareIcon size={22} color="#FFFFFF" />
                  </TouchableOpacity>
                )}
              </>
            ) : (
              /* 타인이 올린 스냅 */
              <>
                {!s.isExample && (
                  <TouchableOpacity style={storyS.replyWrap} activeOpacity={0.8} onPress={() => { setReplyBarOpen(true); setTimeout(() => replyInputRef.current?.focus(), 100); }} accessibilityRole="button" accessibilityLabel={t('postDetail.sendMessageA11y')}>
                    <View style={storyS.replyInput} pointerEvents="none"><Text style={storyS.replyPlaceholder}>{t('postDetail.sendMessagePlaceholder')}</Text></View>
                  </TouchableOpacity>
                )}
                {!s.isExample && (
                  <TouchableOpacity style={storyS.actionBtn} onPress={openCommentSheet} accessibilityRole="button" accessibilityLabel={t('postDetail.commentA11y')}>
                    <CommentIcon size={22} color="#fff" />
                    {sTotalComments > 0 && (<View style={[storyS.commentCountBadge, { backgroundColor: skinAccent.accent }]}><Text style={storyS.commentCountText}>{sTotalComments}</Text></View>)}
                  </TouchableOpacity>
                )}
                {/* 예시 스냅은 좋아요·공유 아이콘 모두 숨김 (댓글·답장도 위에서 숨김) */}
                {!s.isExample && (
                  <TouchableOpacity style={storyS.actionBtn} onPress={() => { tap(); toggleLike(s.id); }} accessibilityRole="button" accessibilityLabel={s.liked ? t('postDetail.unlike') : t('postDetail.like')}>
                    <Text style={[storyS.actionIcon, s.liked && { color: '#FF6B9D' }]}>{s.liked ? '♥' : '♡'}</Text>
                  </TouchableOpacity>
                )}
                {!s.isExample && (
                  <TouchableOpacity style={storyS.actionBtn} onPress={handleSharePost} accessibilityRole="button" accessibilityLabel={t('postDetail.shareA11y')}><ShareIcon size={22} color="#FFFFFF" /></TouchableOpacity>
                )}
              </>
            )}
          </View>
        </LinearGradient>
        </Animated.View>
      </>
    );
  };

  // 댓글 시트
  const openCommentSheet = () => {
    setCommentSheetOpen(true);
    Animated.parallel([
      Animated.spring(commentSheetAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }),
      Animated.timing(commentOverlayAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  };
  const closeCommentSheet = () => {
    Animated.parallel([
      Animated.timing(commentSheetAnim, { toValue: SCREEN_H * 0.6, duration: 280, useNativeDriver: true }),
      Animated.timing(commentOverlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setCommentSheetOpen(false));
  };

  // 링크에는 서버 id(remoteId)를 우선 사용 — 로컬 id는 받은 쪽 기기에서 조회 불가
  const handleCopyLink = async () => { setMenuVisible(false); await Clipboard.setStringAsync(postLink(currentSnap.remoteId ?? currentSnap.id)); setToastMsg(t('social.linkCopiedToast')); setTimeout(() => setToastMsg(''), 2000); };
  // 공유 아이콘 → 인스타처럼 시트에서 메이트 DM 전송 또는 외부 공유를 고른다
  const handleSharePost = () => { setMenuVisible(false); setShareSheetOpen(true); };
  const handleShareExternal = () => {
    setShareSheetOpen(false);
    // 공유 시트 모달이 닫히는 중에 시스템 공유 시트를 띄우면 iOS가 무시한다 — 닫힘 완료 후 호출
    const id = currentSnap.remoteId ?? currentSnap.id;
    setTimeout(() => { Share.share({ message: t('comp2.sharePostMsg', { link: postLink(id) }) }); }, 400);
  };
  const handleSendToFriend = (f: { name: string; handle: string }) => {
    setShareSheetOpen(false);
    const rec = records.find((r) => r.id === currentSnap.id);
    if (!rec) return;
    sendRecord(f.handle, rec);
    setToastMsg(t('comp2.toastSentTo', { name: f.name }));
    setTimeout(() => setToastMsg(''), 2000);
  };
  const handleDelete = () => { setMenuVisible(false); Alert.alert(t('postDetail.deletePostTitle'), t('postDetail.deletePostMsg'), [{ text: t('common.cancel'), style: 'cancel' }, { text: t('postDetail.delete'), style: 'destructive', onPress: () => { deleteRecord(currentSnap.id); navigation.goBack(); } }]); };
  // 보관하기 — 일반 게시물 메뉴(handleArchive)와 동일 UX: 확인 후 토스트·닫기
  const handleArchive = () => {
    setMenuVisible(false);
    Alert.alert(t('social.archiveConfirmTitle'), t('social.archiveConfirmMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('postDetail.archiveAction'), onPress: () => { archiveRecord(currentSnap.id); setToastMsg(t('social.archivedToast')); setTimeout(() => { setToastMsg(''); navigation.goBack(); }, 1000); } },
    ]);
  };
  const handleReport = () => { setMenuVisible(false); setReportVisible(true); };
  // 타인 스냅 차단 — 본문 화면 handleBlockAuthor와 동일 UX(confirmBlock Alert + 토스트 + goBack)
  const handleBlockAuthor = () => {
    setMenuVisible(false);
    const authorUser = { name: currentSnap.user.name, emoji: currentSnap.user.emoji ?? '🧳', handle: currentSnap.user.handle, id: typeof currentSnap.authorId === 'string' ? currentSnap.authorId : undefined };
    confirmBlock(authorUser.handle ?? authorUser.name, () => {
      blockUser(authorUser);
      setToastMsg(t('social.blockedToast'));
      setTimeout(() => { setToastMsg(''); navigation.goBack(); }, 1200);
    }, t);
  };

  // 디자인 시안(iPhone 17 - 63) 화이트 아웃라인 아이콘 — 조회(👀)·공유(종이비행기)
  const EyesSvg = ({ size = 20, color = '#FFFFFF' }: { size?: number; color?: string }) => (
    <Svg width={size * 1.5} height={size} viewBox="0 0 36 24" fill="none">
      <SvgEllipse cx={10} cy={12} rx={7.5} ry={9.5} stroke={color} strokeWidth={2.4} />
      <SvgEllipse cx={26} cy={12} rx={7.5} ry={9.5} stroke={color} strokeWidth={2.4} />
      <SvgCircle cx={11.5} cy={14.5} r={3} fill={color} />
      <SvgCircle cx={27.5} cy={14.5} r={3} fill={color} />
    </Svg>
  );
  return (
    <View style={storyS.container}>
      <GestureDetector gesture={dismissGesture}>
        <Reanimated.View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, dismissStyle]}>
          <Reanimated.ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            contentOffset={{ x: initPos.si * SCREEN_W, y: 0 }}
            style={StyleSheet.absoluteFill}
          >
            {stories.map((story: any, si: number) => (
              <SnapCubePage key={story.key} index={si} scrollX={scrollX} width={SCREEN_W} leftCube={si > 0} rightCube={si < stories.length - 1}>
                {renderStoryPage(story, si)}
              </SnapCubePage>
            ))}
          </Reanimated.ScrollView>
        </Reanimated.View>
      </GestureDetector>

      {/* 인라인 메시지 입력 */}
      {replyBarOpen && (
        <>
          <Pressable style={storyS.inlineOverlay} onPress={() => { setReplyBarOpen(false); setCommentText(''); }} />
          <KeyboardAvoidingView style={storyS.inlineInputWrap} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
            {/* 이 입력줄은 autoFocus로 항상 키보드와 함께 떠서(닫히면 blur로 사라짐)
                키보드가 내비바를 덮음 — 안드로이드 인셋 가산 불필요, 고정 여백만 */}
            <View style={[storyS.inlineInputRow, { paddingBottom: Platform.OS === 'ios' ? 34 : 14 }]}>
              <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                ref={replyInputRef}
                style={storyS.inlineInput}
                placeholder={t('postDetail.sendMessagePlaceholder')}
                placeholderTextColor="rgba(255,255,255,0.45)"
                value={commentText}
                onChangeText={setCommentText}
                onSubmitEditing={() => { addComment(); setReplyBarOpen(false); }}
                returnKeyType="send"
                autoFocus
                onBlur={() => { if (!commentText.trim()) setReplyBarOpen(false); }}
              />
              <TouchableOpacity
                style={[storyS.inlineSendBtn, { backgroundColor: skinAccent.accent }, !commentText.trim() && { opacity: 0.35 }]}
                onPress={() => { addComment(); setReplyBarOpen(false); }}
                disabled={!commentText.trim()}
              >
                <Text style={storyS.inlineSendText}>{t('postDetail.send')}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </>
      )}

      {/* 댓글 바텀시트 오버레이 */}
      {commentSheetOpen && (
        <Animated.View style={[storyS.sheetOverlay, { opacity: commentOverlayAnim }]} pointerEvents="auto">
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeCommentSheet} activeOpacity={1} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        </Animated.View>
      )}

      {/* 댓글 바텀시트 — 키보드 높이만큼 시트 전체를 위로 들어올린다(입력창이 키보드에 안 가리게) */}
      <Animated.View style={[storyS.commentSheet, { transform: [{ translateY: Animated.subtract(commentSheetAnim, keyboardLift) }] }]} pointerEvents={commentSheetOpen ? 'auto' : 'none'}>
        <View style={storyS.csHandleArea} {...commentSheetPan.panHandlers}>
          <View style={storyS.csHandle} />
        </View>
        <View style={storyS.csTitleRow}>
          <Text style={storyS.csTitle}>{t('social.comments')}</Text>
          <Text style={storyS.csCount}>{totalComments}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            {comments.map((c: any) => (
              <View key={c.id}>
                <View style={storyS.csCommentItem}>
                  <View style={storyS.csAvatar}><AuthorAvatar photo={c.photo} emoji={c.emoji} size={32} emojiSize={15} /></View>
                  <View style={{ flex: 1 }}>
                    <View style={storyS.csTopRow}><Text style={storyS.csName}>{c.name}</Text><Text style={storyS.csTime}>{commentTime(c)}</Text></View>
                    {/* @언급은 보라 네온 + 탭하면 그 사람 프로필로 (MentionText가 처리) */}
                    <MentionText text={c.text} style={storyS.csText} />
                    <TouchableOpacity onPress={() => handleReply(c.id, c.name)}><Text style={storyS.csReplyBtn}>{t('postDetail.reply')}</Text></TouchableOpacity>
                  </View>
                </View>
                {c.replies && c.replies.map((r: any) => (
                  <View key={r.id} style={[storyS.csCommentItem, { marginLeft: 42 }]}>
                    <View style={storyS.csAvatar}><AuthorAvatar photo={r.photo} emoji={r.emoji} size={32} emojiSize={13} /></View>
                    <View style={{ flex: 1 }}>
                      <View style={storyS.csTopRow}><Text style={storyS.csName}>{r.name}</Text><Text style={storyS.csTime}>{commentTime(r)}</Text></View>
                      <MentionText text={r.text} style={storyS.csText} />
                    </View>
                  </View>
                ))}
              </View>
            ))}
            {comments.length === 0 && <Text style={{ color: '#5A5A6E', fontSize: 14, textAlign: 'center', marginTop: 32 }}>{t('postDetail.noComments')}</Text>}
          </ScrollView>
          {replyTo && (
            <View style={storyS.csReplyBar}>
              <Text style={[storyS.csReplyBarText, { color: skinAccent.accent }]}>{t('postDetail.replyingTo', { name: replyTo.name })}</Text>
              <TouchableOpacity onPress={cancelReply}><Text style={storyS.csReplyBarCancel}>✕</Text></TouchableOpacity>
            </View>
          )}
          {/* @자동완성 — 후보가 0이면 MentionSuggestBar 가 null 을 돌려주므로 여기선 '편집 중인가'만 본다.
              목록 ScrollView 밖·입력 바 바로 위에 둔다(칩 줄은 keyboardShouldPersistTaps="always"). */}
          {commentFocused && activeMention && (
            <MentionSuggestBar
              candidates={mentionCandidates}
              query={activeMention.query}
              exclude={myHandle}
              onPick={pickMention}
            />
          )}
          <View style={storyS.csInputBar}>
            <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC" ref={commentInputRef} style={storyS.csInput} placeholder={replyTo ? t('postDetail.replyToPlaceholder', { name: replyTo.name }) : t('postDetail.commentPlaceholder')} placeholderTextColor="#5A5A6E" value={commentText} onChangeText={setCommentText} onSelectionChange={(e) => setCommentCursor(e.nativeEvent.selection.end)} onFocus={onCommentFocus} onBlur={onCommentBlur} onSubmitEditing={addComment} returnKeyType="send" maxLength={500} />
            <TouchableOpacity style={[storyS.csSendBtn, { backgroundColor: skinAccent.accent }, !commentText.trim() && { backgroundColor: "#2A2A3A" }]} onPress={addComment} disabled={!commentText.trim()}>
              <Text style={[storyS.csSendText, !commentText.trim() && { color: '#5A5A6E' }]}>{t('postDetail.send')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {/* 메뉴 모달 */}
      <Modal visible={menuVisible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={[s.menuOverlay, { paddingRight: 20 + stageGutter }]} activeOpacity={1} onPress={() => setMenuVisible(false)} accessibilityViewIsModal>
          <View style={s.menuCard}>
            <AutoPillRing radius={10} />
            <TouchableOpacity style={s.menuItem} onPress={handleCopyLink} activeOpacity={0.7}>
              <LinkIcon size={13} color="#fff" /><Text style={s.menuItemText}>{t('social.copyLink')}</Text>
            </TouchableOpacity>
            {isMyPost ? (
              <><View style={s.menuDivider} />
              <TouchableOpacity style={s.menuItem} onPress={handleArchive} activeOpacity={0.7}>
                <ArchiveIcon size={16} color="#fff" /><Text style={s.menuItemText}>{t('postDetail.archiveAction')}</Text>
              </TouchableOpacity>
              <View style={s.menuSectionDivider} />
              <TouchableOpacity style={s.menuItem} onPress={handleDelete} activeOpacity={0.7}>
                <TrashIcon size={16} color="#FF3B30" /><Text style={[s.menuItemText, { color: '#FF3B30' }]}>{t('postDetail.deleteAction')}</Text>
              </TouchableOpacity></>
            ) : (
              <><View style={s.menuSectionDivider} />
              <TouchableOpacity style={s.menuItem} onPress={() => { setMenuVisible(false); setReportVisible(true); }} activeOpacity={0.7}>
                {/* 스냅 변형 — 아이콘·크기는 본문 메뉴와 동일(링크 13·신고 14·차단 14) */}
                <WarningIcon size={14} color="#FF3B30" /><Text style={[s.menuItemText, { color: '#FF3B30' }]}>{t('social.reportLong')}</Text>
              </TouchableOpacity>
              <View style={s.menuDivider} />
              <TouchableOpacity style={s.menuItem} onPress={handleBlockAuthor} activeOpacity={0.7}>
                <BlockIcon size={14} color="#FF3B30" /><Text style={[s.menuItemText, { color: '#FF3B30' }]}>{t('social.blockTitle')}</Text>
              </TouchableOpacity></>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 공유 시트 — 메이트 DM으로 보내기(대화량 많은 순) + 외부 공유 */}
      <Modal visible={shareSheetOpen} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setShareSheetOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} accessibilityViewIsModal>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShareSheetOpen(false)} />
          <View style={shareS.sheet}>
            <View style={shareS.handle} />
            <Text style={shareS.title}>{t('social.friendPickerTitle')}</Text>
            <ScrollView style={{ maxHeight: 320, flexShrink: 1 }}>
              {shareFriends.map((f) => (
                <TouchableOpacity key={f.handle} style={shareS.friendRow} activeOpacity={0.7} onPress={() => handleSendToFriend(f)}>
                  <View style={shareS.friendAvatar}><AuthorAvatar photo={f.photo} size={40} /></View>
                  <Text style={shareS.friendName}>{f.name}</Text>
                  <Text style={[shareS.friendSend, { color: skinAccent.accent }]}>{t('postDetail.send')}</Text>
                </TouchableOpacity>
              ))}
              {shareFriends.length === 0 && (
                <Text style={shareS.empty}>{t('postDetail.shareNoFriends')}</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={shareS.externalBtn} activeOpacity={0.8} onPress={handleShareExternal}>
              <ShareIcon size={16} color="#FFFFFF" />
              <Text style={shareS.externalTxt}>{t('postDetail.shareExternal')}</Text>
            </TouchableOpacity>
            <View style={{ height: 24 }} />
          </View>
        </View>
      </Modal>

      <ReportModal visible={reportVisible} onClose={() => setReportVisible(false)} onSubmit={(reason) => { setReportVisible(false); reportPost(currentSnap.id, reason); setToastMsg(t('social.reportReceivedToast')); setTimeout(() => setToastMsg(''), 2000); }} />
      {toastMsg !== '' && <View style={s.toast} pointerEvents="none"><Text style={s.toastText}>{toastMsg}</Text></View>}
      <SnapViewerModal
        visible={viewerListOpen}
        onClose={() => setViewerListOpen(false)}
        viewers={(currentSnap.snapViewers ?? []).map((v: { handle: string; name: string; time: number }) => ({
          name: v.name,
          handle: v.handle,
          time: timeAgo(v.time),
          // 조회자 기록에는 사진이 없다 — 메이트 스토어에서 핸들로 찾는다(메이트가 아니면 실루엣)
          photo: neighbors.find((n) => n.username === v.handle)?.photo,
        }))}
      />
    </View>
  );
}

type RouteParams = {
  PostDetail: { postId: string; record?: TravelRecord };
};

export default function PostDetailScreen() {
  const { blogS, s } = useSheets();
  const { t, i18n } = useTranslation();
  // 네컷 미리보기 크기 계산용 — 폭은 Stage(클램프), 높이는 실제 창.
  const SCREEN_W = useStageWidth();
  // ⋯ 메뉴는 Modal(루트 클램프 밖) 안에서 오른쪽 끝에 붙는다 — 레터박스만큼 안쪽으로
  const stageGutter = useStageGutter();
  const { height: SCREEN_H, width: winW } = useWindowDimensions(); // winW: Modal(창 좌표) 안 팝오버 배치용
  const skinAccent = useSkinAccent(); // 카테고리 배지·메모 박스 등 강조를 스킨색으로
  const insets = useSafeAreaInsets();
  // 키보드가 떠 있는 동안엔 내비바 인셋 하단 패딩이 무의미(키보드가 내비바를 덮음) — 잔여 여백 방지
  const [kbVisible, setKbVisible] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s1 = Keyboard.addListener(showEvt, () => setKbVisible(true));
    const s2 = Keyboard.addListener(hideEvt, () => setKbVisible(false));
    return () => { s1.remove(); s2.remove(); };
  }, []);
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'PostDetail'>>();
  const { postId } = route.params;
  const { records, feedPosts, toggleLike, deleteRecord, archiveRecord, unarchiveRecord, updateRecord, markSnapViewed, commentsByPost, addComment: addCommentToStore, toggleCommentLike, deleteComment, neighbors, currentViewer, refreshComments, refreshPostCounts, reportPost, isBlocked, archivedIds, reportedPostIds, blockUser, reportedCommentIds, reportComment } = useRecords();
  // 스냅 스토리 뷰어 소스 — 소셜 탭 스토리 링과 동일한 필터(공개범위·차단·보관·신고·뷰어 숨김) 적용.
  // 무필터로 넘기면 차단/신고한 사용자의 스냅이 스와이프로 그대로 재생된다.
  const { handle: globalHandle, profilePhoto: globalProfilePhoto, handleFont: myHandleFont, isPremium: myPremium } = useSettings();
  // 내 글은 미리보기 뷰어(currentViewer), 타인 글은 '나'(내 핸들)를 뷰어로 —
  // 서버 data에 전체 사진이 내려오므로 안 거르면 작성자가 나에게 숨긴 사진이 보인다.
  const viewerFor = (r: TravelRecord) =>
    r.isMyPost || r.user?.handle === globalHandle ? currentViewer : (globalHandle || null);
  const snapViewerRecords = useMemo(
    () =>
      [...records, ...feedPosts]
        .filter(
          (r) =>
            r.visibility === 'neighbors' &&
            !isBlocked(r.user) &&
            !archivedIds.includes(r.id) &&
            !reportedPostIds.includes(r.id)
        )
        .filter((r) => !isPostHiddenForViewer(r, viewerFor(r)))
        .map((r) => applyViewer(r, viewerFor(r))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [records, feedPosts, archivedIds, reportedPostIds, currentViewer, isBlocked, globalHandle]
  );

  // 수정 3: 차단된 사용자의 댓글·답글 필터 (PostComment에 handle 없으므로 name으로 매칭)
  const rawComments = commentsByPost[postId] ?? [];
  // 차단한 사용자 + 신고한 댓글은 즉시 사라져야 한다(App Store 1.2 UGC 요건).
  const comments = rawComments
    .filter((c) => !isBlocked({ name: c.name }) && !reportedCommentIds.includes(c.id))
    .map((c) => ({
      ...c,
      replies: c.replies
        ? c.replies.filter((r) => !isBlocked({ name: r.name }) && !reportedCommentIds.includes(r.id))
        : c.replies,
    }));
  // 신고할 댓글 id (모달 대상) — 게시물 신고와 모달은 같고 대상만 다르다
  const [commentReportId, setCommentReportId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  // 날짜 알약을 누르면 선택정보(항공·날씨·예산·동행자)가 **다른 요소 위에** 떠오른다(2026-09-20):
  // 나머지는 흐리고(댓글 팝오버와 같은 연출) 날짜 알약 + 선택정보 줄만 제자리에 다시 그린다. 다시 누르면 닫힌다.
  // 알약 위치는 measureInWindow — Modal은 Stage 클램프 밖(창 좌표)이라 창 기준 좌표가 맞다.
  const [datePillRect, setDatePillRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const datePillRef = useRef<any>(null);
  const dpAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!datePillRect) return;
    dpAnim.setValue(0);
    Animated.spring(dpAnim, { toValue: 1, useNativeDriver: true, tension: 140, friction: 11 }).start();
  }, [datePillRect, dpAnim]);
  const openDatePill = () => {
    tap();
    const fallback = { x: 16, y: SCREEN_H * 0.5, w: 229, h: 30 };
    const node = datePillRef.current;
    if (node && typeof node.measureInWindow === 'function') {
      node.measureInWindow((x: number, y: number, w: number, h: number) => {
        setDatePillRect([x, y, w, h].every((v) => typeof v === 'number') ? { x, y, w, h } : fallback);
      });
    } else setDatePillRect(fallback);
  };
  const closeDatePill = () => {
    Animated.timing(dpAnim, { toValue: 0, duration: 170, easing: Easing.out(Easing.quad), useNativeDriver: true })
      .start(() => setDatePillRect(null));
  };
  // null = 자동: 채워진 항목이 2개 이하면 접을 이유가 없어 펼쳐서 시작, 3개 이상이면 접힘
  const [travelInfoPref, setTravelInfoPref] = useState<boolean | null>(null);
  const [heartBurst, setHeartBurst] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  // @자동완성이 "지금 어느 토큰을 쓰는 중인가"를 알려면 커서 위치가 필요하다(onSelectionChange로 추적)
  const [commentCursor, setCommentCursor] = useState(0);
  // 칩 줄은 "입력 중"에만 뜬다 — activeMention 은 텍스트+커서만 보므로, `@ab` 까지 치고
  // 안드로이드 뒤로가기로 키보드만 내리면 칩 줄이 그대로 남는다(포커스 조건이 그걸 막는다).
  const [commentFocused, setCommentFocused] = useState(false);
  // ⚠️ blur 로 칩 줄을 **즉시** 끄면 안 된다 — 칩을 누르는 순간 blur 가 press 보다 먼저 오는
  //    경우가 있어(안드로이드) 칩이 사라지고 그 탭이 빈 곳에 떨어진다. 한 박자 늦춰 끄고,
  //    다시 포커스가 잡히면 예약을 취소한다(SocialScreen 댓글 시트와 같은 방식).
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (blurTimerRef.current) clearTimeout(blurTimerRef.current); }, []);
  const onCommentFocus = () => {
    if (blurTimerRef.current) { clearTimeout(blurTimerRef.current); blurTimerRef.current = null; }
    setCommentFocused(true);
  };
  const onCommentBlur = () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => { blurTimerRef.current = null; setCommentFocused(false); }, 200);
  };
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [fontScale, setFontScale] = useState(1);
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [likersVisible, setLikersVisible] = useState(false);
  const [likers, setLikers] = useState<PostLiker[]>([]);
  const [likersLoading, setLikersLoading] = useState(false);
  const [fullImgVisible, setFullImgVisible] = useState(false);
  const [fullImgList, setFullImgList] = useState<string[]>([]);
  const [fullImgIndex, setFullImgIndex] = useState(0);
  const openFullImage = (uris: string[], index: number) => {
    setFullImgList(uris);
    setFullImgIndex(index);
    setFullImgVisible(true);
  };
  const commentInputRef = useRef<TextInput>(null);
  const sendingCommentRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const blockYPositions = useRef<Record<string, number>>({});
  // 더블탭 좋아요
  const heartScale = useRef(new Animated.Value(0)).current;
  const lastTapRef = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 언마운트 시 더블탭 단일탭 타이머 정리 (unmounted setState 방지)
  useEffect(() => () => { if (singleTapTimer.current) clearTimeout(singleTapTimer.current); }, []);

  // 스토어에 없는 글(타인 프로필에서 조회한 공개 글)은 라우트로 넘어온 record 폴백 사용.
  // 폴백은 로컬 상태로 들고 좋아요를 직접 반영/서버 동기화한다 (store toggleLike는 스토어 글만 처리).
  const [fallbackRecord, setFallbackRecord] = useState<TravelRecord | null>(route.params.record ?? null);
  const storeRecord = records.find((r) => r.id === postId) ?? feedPosts.find((r) => r.id === postId);
  const rawRecord = storeRecord ?? fallbackRecord ?? undefined;
  const handleToggleLike = () => {
    // 예시 콘텐츠는 서버 호출 금지
    if (rawRecord?.isExample) return;
    if (storeRecord) {
      toggleLike(postId);
      return;
    }
    if (!fallbackRecord) return;
    const nowLiked = !fallbackRecord.liked;
    setFallbackRecord({
      ...fallbackRecord,
      liked: nowLiked,
      likes: nowLiked ? fallbackRecord.likes + 1 : Math.max(0, fallbackRecord.likes - 1),
    });
    const remoteId = fallbackRecord.remoteId ?? fallbackRecord.id;
    if (remoteId) {
      (nowLiked ? likePost(remoteId) : unlikePost(remoteId)).catch(() => {
        // 서버 실패 → 낙관 반영 롤백
        setFallbackRecord((p) =>
          p ? { ...p, liked: !nowLiked, likes: nowLiked ? Math.max(0, p.likes - 1) : p.likes + 1 } : p
        );
      });
    }
  };
  // 백엔드 게시물이면 댓글을 서버에서 불러온다 (로컬 글은 remoteId 없음 → 무동작)
  // 예시 콘텐츠(isExample)는 서버 글이 아니므로 조회 생략
  useEffect(() => {
    if (!rawRecord?.remoteId || rawRecord?.isExample) return;
    setCommentsLoading(true);
    refreshComments(postId, rawRecord.remoteId).finally(() => setCommentsLoading(false));
    // 좋아요 수도 함께 서버 기준으로 — 남이 누른 좋아요가 작성자 화면에서 0으로 남고
    // '좋아요한 사람' 시트도 (canShowLikers가 likes>0 조건이라) 열리지 않았다.
    // 댓글 수는 위 refreshComments가 목록으로 맞추므로 이쪽 가드가 건너뛴다(단일 출처 유지).
    // 스토어에 없는 폴백 글은 대상 아님(그 글은 fetchPostById가 이미 서버 카운트를 실어 왔다).
    if (storeRecord) refreshPostCounts(postId).catch(() => {});
    // postId/remoteId가 바뀔 때만 재조회 (refreshComments·refreshPostCounts는 안정 스토어 액션)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, rawRecord?.remoteId]);
  // 복귀 포커스마다 재조회 — 위 이펙트는 마운트(+id 변경) 1회뿐이라, 이 화면을 띄워 둔 채
  // 프로필·사진 뷰어 등을 다녀오면 그 사이 달린 남의 댓글·좋아요가 반영되지 않았다.
  //
  // ⚠️ 최신 값은 **반드시 ref로** 읽는다. storeRecord/rawRecord를 useCallback deps에 넣으면
  //    재조회 → 스토어 갱신 → 객체 신원 변경 → 포커스 콜백 재실행 → 재조회의 무한 루프가 된다.
  //    (deps를 비워 두면 useFocusEffect가 '포커스 진입'마다 정확히 한 번 돈다)
  const detailSyncRef = useRef({ postId, remoteId: rawRecord?.remoteId, isExample: rawRecord?.isExample, hasStore: !!storeRecord });
  detailSyncRef.current = { postId, remoteId: rawRecord?.remoteId, isExample: rawRecord?.isExample, hasStore: !!storeRecord };
  const firstDetailFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      // 첫 포커스는 위 마운트 이펙트와 중복이라 건너뛴다
      if (firstDetailFocusRef.current) { firstDetailFocusRef.current = false; return; }
      const { postId: pid, remoteId, isExample, hasStore } = detailSyncRef.current;
      if (!remoteId || isExample) return;
      // 스피너(commentsLoading)는 켜지 않는다 — 이미 목록이 있으므로 조용히 갱신한다
      refreshComments(pid, remoteId).catch(() => { /* 실패 시 로컬 댓글 유지 */ });
      if (hasStore) refreshPostCounts(pid).catch(() => {});
    }, [refreshComments, refreshPostCounts])
  );
  // 뷰어 시점에서 비공개 사진을 제거한 사본 — 내 글은 미리보기 뷰어, 타인 글은 나
  const record = rawRecord ? applyViewer(rawRecord, viewerFor(rawRecord)) : rawRecord;

  // ⚠️ 훅은 아래 if (!record) early return보다 먼저 선언해야 한다 (rules-of-hooks)

  // 스냅 뷰어에 '전체 목록'을 넘길지 '이 글 하나'만 넘길지 — 진입 시 한 번만 확정한다.
  // (initPosRef의 "위치는 한 번만 확정" 철학과 동일)
  // 매 렌더 재평가하면, 뷰어 안에서 신고(reportPost)한 순간 그 글이 snapViewerRecords에서
  // 빠지면서 판정이 '전체 목록'→'단독'으로 뒤집혀 방금 신고한 글만 남은 스토리에 갇힌다.
  // 고정해 두면 신고 후에도 전체 목록을 유지해, 신고한 글만 목록에서 빠지고 인접 스토리로 넘어간다.
  // rawRecord가 잡히기 전(피드 로딩 중)에는 판정하지 않는다 — 성급히 '단독'으로 굳지 않게.
  const snapFallbackRef = useRef<boolean | null>(null);
  if (snapFallbackRef.current === null && rawRecord) {
    snapFallbackRef.current = !snapViewerRecords.some((r) => r.id === postId);
  }

  // 스트립 풀스크린 목록 — 내 글이면 합성본 뒤에 슬롯 원본(낱장)을 붙여 확대해 볼 수 있게.
  // 타인 글의 슬롯 원본 URI는 작성자 기기의 로컬 경로라 열리지 않으므로 합성본만 보여준다.
  const cutViewerUris = useMemo(() => {
    const p = record?.cutPhoto;
    if (!p?.previewUri) return [] as string[];
    const mine = record?.isMyPost === true || record?.user.handle === globalHandle;
    return mine && p.photos && p.photos.length > 0 ? [p.previewUri, ...p.photos] : [p.previewUri];
  }, [record, globalHandle]);

  // 좋아요 버튼 스프링 — 탭 반응이 없으면 눌렸는지 애매하다
  const likeScale = useRef(new Animated.Value(1)).current;
  const springLike = () => {
    likeScale.setValue(0.75);
    Animated.spring(likeScale, { toValue: 1, friction: 3.5, tension: 220, useNativeDriver: true }).start();
  };

  // 진입 스태거 — 유저행→미디어→정보 순서로 살짝 튀며 등장(프리미엄 화면과 동일 재료)
  const entUser = useEntranceAnimation(0);
  const entMedia = useEntranceAnimation(70);
  const entInfo = useEntranceAnimation(140);
  // 헤더 구분선은 **항상** 표시한다(2026-09-20 시안) — 스크롤 여부로 켜고 끄던 로직 제거.
  //
  // ⋯ 메뉴 카드 위치. blog는 헤더의 ⋯를 쓰므로 앵커 없음(=110 고정),
  // feed·cut은 날짜 알약 행으로 내려간 ⋯ 버튼의 아래쪽 y를 눌린 시점에 실측해 넣는다
  // (스타일에 110을 박아 두면 카드가 화면 위쪽 엉뚱한 곳에 뜬다).
  const [menuAnchorY, setMenuAnchorY] = useState<number | null>(null);
  const [menuCardH, setMenuCardH] = useState(0); // 카드 실측 높이 (0 = 아직 못 쟀음 → 추정치 사용)
  const moreBtnRef = useRef<View>(null);

  if (!record) {
    return (
      <View style={s.container}>
        <View style={[s.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} accessibilityRole="button" accessibilityLabel={t('postDetail.back')}>
            <BackChevronIcon />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{t('postDetail.postTitle')}</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={s.emptyWrap}>
          <Text style={s.emptyText}>{t('postDetail.postNotFound')}</Text>
        </View>
      </View>
    );
  }

  const viewType: RecordViewType = record.viewType || 'feed';
  // 헤더 타이틀: 국가명 우선, 없으면 형식 라벨
  const typeLabel =
    viewType === 'blog' ? t('postDetail.typeBlog') :
    viewType === 'album' ? t('postDetail.typeAlbum') :
    viewType === 'cut' ? t('postDetail.typeCut') :
    viewType === 'snap' ? t('postDetail.typeSnap') : t('postDetail.typeFeed');
  // 헤더 제목도 국기 없이 나라 이름만(2026-09-20 사용자 지시 — 시안 "대한민국")
  const headerTitleText = record.countryName
    ? countryLabel(record.countryName, i18n.language)
    : typeLabel;
  // 여행정보 펼침 여부 — 사용자가 토글했으면 그 값, 아니면 항목 수 기준 자동
  const travelInfoCount = [record.startDate, record.weather, record.flightType, record.budget].filter(Boolean).length;
  const travelInfoOpen = travelInfoPref ?? travelInfoCount <= 2;
  // 본문 텍스트(피드·앨범) — 일정 길이 이상이면 "더보기"로 접기
  // 피드에서 photoTexts가 있으면 memo는 대표 글 복사본이라 캐러셀에서 표시됨 → bodyText 숨김
  const bodyText = (viewType === 'feed' && record.photoTexts && record.photoTexts.length > 0)
    ? ''
    : (record.memo || record.content || '');
  const bodyLong = bodyText.trim().length > 150;
  // 블로그는 본문 블록·목차·A 버튼·여행정보 토글을 그대로 쓴다(시안은 feed·cut 공통부만 바꾼다).
  const isBlogLayout = viewType === 'blog' && !!record.blogBlocks && record.blogBlocks.length > 0;
  // 2026-09-20 시안이 실제로 다시 그리는 경로 = feed·cut. 여기서만
  //   · 날짜 알약 행(+ ⋯ 이동)이 '여행정보' 토글을 대체하고
  //   · 본문 글이 미디어 아래가 아니라 액션 행 아래 '캡션'으로 내려간다.
  // blog·album은 시안 범위 밖이라 ⋯도 본문도 기존 자리를 지킨다.
  const isFeedLayout = viewType === 'feed' || viewType === 'cut';
  // 작성자 표시 이름 — 유저 행과 캡션 두 곳이 같은 값을 써야 해서 여기서 한 번만 만든다.
  const authorIsMe = record.isMyPost === true || record.user.handle === globalHandle;
  // 아이디는 @ 없이 표시한다(2026-09-20 사용자 지시). 캡션·작성자 행 공용.
  const postDisplayName = authorIsMe
    ? globalHandle
    : (record.user.name ? record.user.name : record.user.handle);
  const authorFontStyle = handleFontStyle(authorIsMe ? (myPremium ? myHandleFont : null) : record.user.font);
  // 게시 시간의 **오른쪽 끝** = 아이디의 오른쪽 끝(2026-09-20 사용자 지시). 아이디·국가·시간 폭을 실측해
  // 시간의 marginLeft로 밀어 넣는다: 시간 x = 아이디 끝 − 시간 폭. 국가 뒤 6보다 왼쪽이면(아이디가 짧으면) 국가 뒤 6에서 시작.
  const [handleW, setHandleW] = useState(0);
  const [countryW, setCountryW] = useState(0);
  const [timeW, setTimeW] = useState(0);
  const hasCountryLine = !!(record.countries?.length || record.country);
  const timeMarginLeft = Math.max(0, handleW - timeW - (hasCountryLine ? countryW + 6 : 0)); // 국가가 없으면 시간이 첫 항목이라 gap 6이 없다

  const addComment = () => {
    // 연타 가드 — 위 스토리 댓글과 같은 이유(서버 멱등키 없음)
    if (sendingCommentRef.current || !commentText.trim()) return;
    sendingCommentRef.current = true;
    setTimeout(() => { sendingCommentRef.current = false; }, 800);
    // remoteId 오버라이드 — 스토어에 없는 폴백 글(타인 프로필)도 댓글이 서버에 저장되게
    addCommentToStore(postId, commentText.trim(), replyTo?.id, record.remoteId ?? undefined);
    setReplyTo(null);
    setCommentText('');
    // 새 댓글이 렌더된 뒤 맨 아래로 스크롤
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
  };

  const handleReply = (id: string, name: string) => {
    setReplyTo({ id, name });
    // 답글 대상 아이디를 본문 앞에 미리 채운다 — 이미 그 사람으로 시작하면 중복 삽입하지 않는다
    const next = ensureReplyPrefix(commentText, name);
    setCommentText(next);
    // ⚠️ 커서도 **같은 만큼 밀어야 한다.** 접두사를 앞에 끼우면 기존 글자가 전부 오른쪽으로
    //    밀리는데 커서 상태를 그대로 두면 findActiveMention 이 방금 넣은 접두사의 앞부분을
    //    "입력 중인 토큰"으로 잡는다(본문 `좋아요`·커서 3 + 대상 `jusang` → `{start:0,end:3,
    //    query:'ju'}`). 그 상태에서 칩을 누르면 본문이 `@justin sang 좋아요` 로 깨지고
    //    replyTo 는 여전히 jusang 이라 보이는 태그와 실제 답글 부모가 달라진다.
    //    onSelectionChange 에 기대면 안 된다 — 안드로이드 ReactEditText.maybeSetText 는 텍스트를
    //    바꾼 뒤 직전 selection 인덱스를 복원해, 값이 같으면 이벤트가 아예 발화하지 않는다.
    //    접두사를 안 붙인 경우(이미 그 사람으로 시작)엔 delta 0 이라 그대로다.
    const delta = next.length - commentText.length;
    setCommentCursor((c) => Math.min(c + delta, next.length));
    commentInputRef.current?.focus();
  };

  const cancelReply = () => {
    // 본문은 건드리지 않는다(설계 2026-09-09: 접두사 강제 삭제 안 함 — 이미 고쳐 썼을 수 있다)
    setReplyTo(null);
  };

  // ── @자동완성 ──
  // 후보는 전부 로컬 데이터다 — 메이트 + 글 작성자 + 이 글의 댓글·답글 작성자.
  // 중복 제거·접두 일치·상한(8)은 filterMentionCandidates 가 하므로 여기선 순서만 정한다.
  // useMemo 를 쓰지 않는다: 이 블록은 early return(!record) 뒤라 훅을 새로 추가할 수 없고,
  // comments 도 매 렌더 새 배열이라 메모해도 매번 다시 계산된다.
  const mentionCandidates: MentionCandidate[] = [];
  for (const n of neighbors) mentionCandidates.push({ handle: n.username, photo: n.photo, emoji: n.emoji });
  if (record.user?.handle) mentionCandidates.push({ handle: record.user.handle, photo: record.user.photo });
  for (const c of comments) {
    mentionCandidates.push({ handle: c.name, photo: c.photo });
    for (const r of (c.replies ?? [])) mentionCandidates.push({ handle: r.name, photo: r.photo });
  }
  const activeMention = findActiveMention(commentText, commentCursor);
  const pickMention = (handle: string) => {
    if (!activeMention) return;
    const next = applyMention(commentText, activeMention, handle);
    setCommentText(next.text);
    // ⚠️ TextInput 의 `selection` 을 prop 으로 제어하지 않는다 — 안드로이드에서 제어된 selection 은
    //    조합 중인 한글을 끊고 커서가 튄다. 커서 상태는 뒤따라오는 onSelectionChange 가 덮어쓴다.
    setCommentCursor(next.cursor);
  };

  const canShowLikers = !!rawRecord?.remoteId && record.likes > 0;
  const openLikers = async () => {
    if (!canShowLikers) return;
    setLikersVisible(true);
    setLikersLoading(true);
    const list = await fetchPostLikers(rawRecord!.remoteId!);
    setLikers(list);
    setLikersLoading(false);
  };

  const confirmDeleteComment = (commentId: string) => {
    warn(); // 되돌릴 수 없는 동작을 묻는 중
    Alert.alert(t('postDetail.deleteCommentTitle'), t('postDetail.deleteCommentMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('postDetail.delete'), style: 'destructive', onPress: () => deleteComment(postId, commentId) },
    ]);
  };

  // ── 답글 숨기기(2026-09-20): 댓글 행의 두 번째 액션 '숨기기'는 **그 댓글 아래 답글들**을 접는다(댓글 자체는 남는다).
  //    접힌 상태는 이 기기에서만 기억한다(서버 전파 없음). 접히면 라벨이 "답글 N개 보기"로 바뀐다.
  //    답글 행에는 접을 것이 없어 액션이 없다. 삭제·신고는 댓글을 꾹 눌러 나오는 메뉴로 옮겼다.
  const [hiddenCommentIds, setHiddenCommentIds] = useState<Set<string>>(() => new Set());
  const hiddenKey = `postDetail.hiddenComments:${postId}`;
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(hiddenKey)
      .then((raw) => { if (alive && raw) setHiddenCommentIds(new Set(JSON.parse(raw) as string[])); })
      .catch(() => { /* 읽기 실패는 숨김 없음으로 — 부가 기능이라 조용히 빠진다 */ });
    return () => { alive = false; };
  }, [hiddenKey]);
  const setCommentHidden = (id: string, hidden: boolean) => {
    tap();
    setHiddenCommentIds((prev) => {
      const next = new Set(prev);
      if (hidden) next.add(id); else next.delete(id);
      AsyncStorage.setItem(hiddenKey, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  };
  // 꾹 누르면(인스타식): 배경을 흐리고 누른 댓글만 카드로 떠오르며 그 아래 팝오버가 뜬다.
  // 내 댓글 → 삭제(확인 알림은 confirmDeleteComment가 띄운다), 남 댓글 → 신고.
  // 행 위치는 measureInWindow — Modal은 Stage 클램프 밖(창 좌표)이라 창 기준 좌표가 맞다.
  type CommentLike = { id: string; name: string; text: string; photo?: string; emoji?: string; isMine?: boolean; createdAt: number; time?: string };
  const commentRowRefs = useRef<Record<string, any>>({});
  const [commentMenu, setCommentMenu] = useState<{ c: CommentLike; rect: { x: number; y: number; w: number; h: number } } | null>(null);
  // 열고 닫기 연출 — Modal 자체 fade 대신 값 하나(0→1)로 배경 흐림·카드 떠오름·메뉴 스프링을 함께 몬다.
  // 닫을 때는 역재생이 끝난 뒤에 언마운트해야 카드가 툭 사라지지 않는다.
  const cmAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!commentMenu) return;
    cmAnim.setValue(0);
    Animated.spring(cmAnim, { toValue: 1, useNativeDriver: true, tension: 140, friction: 11 }).start();
  }, [commentMenu, cmAnim]);
  const closeCommentMenu = (after?: () => void) => {
    Animated.timing(cmAnim, { toValue: 0, duration: 170, easing: Easing.out(Easing.quad), useNativeDriver: true })
      .start(() => { setCommentMenu(null); after?.(); });
  };
  const openCommentMenu = (c: CommentLike) => {
    const show = (rect: { x: number; y: number; w: number; h: number }) => { warn(); setCommentMenu({ c, rect }); };
    const fallback = { x: 16, y: SCREEN_H * 0.4, w: winW - 32, h: 60 };
    const node = commentRowRefs.current[c.id];
    if (node && typeof node.measureInWindow === 'function') {
      node.measureInWindow((x: number, y: number, w: number, h: number) => {
        show([x, y, w, h].every((v) => typeof v === 'number') ? { x, y, w, h } : fallback);
      });
    } else show(fallback);
  };

  const totalComments = comments.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0);
  const isMyPost = record?.isMyPost === true;
  // 보관된 게시물이면 상세 ⋯ 메뉴를 '보관 해제 / 삭제'만 노출한다
  const isArchived = !!record?.id && archivedIds.includes(record.id);

  // 날짜 알약 행의 ⋯ — 버튼이 실제로 어디 있는지 재서 메뉴 카드를 그 아래에 붙인다.
  // measureInWindow는 비동기라 콜백 안에서 열어야 한다(먼저 열면 첫 프레임이 옛 위치로 그려진다).
  // ⚠️ 저장하는 건 '최종 paddingTop'이 아니라 **앵커 y**다 — 카드 높이는 onLayout으로 나중에
  //    도착하므로, 최종값을 굳혀 두면 실측이 와도 위치가 안 고쳐진다(렌더에서 매번 다시 계산).
  const openMenuFromPill = () => {
    const node = moreBtnRef.current;
    // 레포 선례(MainCoachmark.tsx:158, BlogRecordScreen.tsx:1527)와 같은 가드 —
    // ref가 있어도 measureInWindow가 없는 노드(플래튼된 뷰)가 있다.
    if (!node || typeof node.measureInWindow !== 'function') { setMenuAnchorY(null); setMenuVisible(true); return; }
    node.measureInWindow((_x, y, _w, h) => {
      if (typeof y !== 'number' || typeof h !== 'number') { setMenuAnchorY(null); setMenuVisible(true); return; }
      setMenuAnchorY(y + h);
      setMenuVisible(true);
    });
  };

  // 메뉴 카드 높이 — 실측(onLayout)이 오기 전 첫 프레임은 **렌더 조건과 같은 술어로** 센 항목 수로 추정한다.
  // 예전엔 320을 박아 뒀는데, 항목이 4개뿐인 타인 글에서도 320을 빼는 바람에 클램프가 거의 항상
  // 발동해 카드가 버튼보다 위에 떴다. 카드가 버튼 위로 올라가는 건 버튼이 화면 하단일 때만이어야 한다.
  // 공통 행은 '링크 복사' 1개뿐이다 — 공유 행은 2026-09-20 시안에서 빠졌다(액션 행과 중복).
  const menuItemCount = isArchived ? 2 : isMyPost ? 5 + (viewType === 'blog' ? 1 : 0) : 3; // 타인 글은 링크·신고·차단 3개 고정(네이버 내보내기는 내 글만)
  const menuCardEstH = menuItemCount * 28 + (menuItemCount - 1) * 1; // 행 28 × n + 구분선 1 × (n-1). 시안 SVG 130×88 = 3행(28×3+2)
  const menuPaddingTop = menuAnchorY == null
    ? 110 // blog 헤더 ⋯ (앵커 없음) — 기존 값 유지
    : Math.max(0, Math.min(menuAnchorY + 6, SCREEN_H - (menuCardH || menuCardEstH) - insets.bottom - 8));

  // 입력바 높이 = paddingTop 8 + 아바타 42 + paddingBottom. 그라데이션 136에서 이걸 뺀 만큼이
  // 래퍼 밖으로 넘칠 양이고, 그 값을 래퍼가 paddingTop으로 품는다(아래 렌더 주석 참조).
  // 키보드가 떠 있으면 홈 인디케이터 여백(23·insets.bottom)은 키보드 뒤로 사라지므로 8만 남긴다 —
  // iOS도 그대로 두면 입력 알약과 키보드 사이가 그만큼 벌어졌다(2026-09-20 지적).
  const inputBarPadBottom = kbVisible ? 8 : Platform.OS === 'ios' ? Math.max(insets.bottom, 23) : insets.bottom + 12;
  // 답글 바·@칩 줄이 떠 있으면 겹침을 끈다 — 음수 marginTop이 그 줄들 위로 올라가 가려 버린다.
  const suppressOverlap = !!replyTo || (commentFocused && !!activeMention);
  const gradientOverlap = suppressOverlap ? 0 : Math.max(0, 136 - (8 + 42 + inputBarPadBottom));

  // 링크에는 서버 id(remoteId)를 우선 사용 — 로컬 id는 받은 쪽 기기에서 조회 불가
  const shareId = record?.remoteId ?? postId;
  const handleCopyLink = async () => {
    setMenuVisible(false);
    await Clipboard.setStringAsync(postLink(shareId));
    setToastMsg(t('social.linkCopiedToast'));
    setTimeout(() => setToastMsg(''), 2000);
  };

  const handleSharePost = () => {
    setMenuVisible(false);
    // 메뉴 모달이 닫히는 동안 공유 시트를 띄우면 표시할 화면이 없어 무동작 → 모달 닫힘 후 호출
    setTimeout(() => {
      Share.share({ message: t('comp2.sharePostMsg', { link: postLink(shareId) }) }).catch(() => {});
    }, 350);
  };

  const handleExportToNaver = () => {
    setMenuVisible(false);
    const bodyText = record.blogBlocks ? blocksToPlainText(record.blogBlocks) : record.content;
    const photos = record.blogBlocks ? blocksToPhotos(record.blogBlocks) : (record.medias || []);
    const blogData: BlogData = {
      title: record.content.trim() || `${record.countryFlag ?? ''} ${record.countryName ?? ''}`.trim() || t('postDetail.travelRecord'),
      body: bodyText,
      photos,
      memo: record.memo,
      startDate: record.startDate,
      endDate: record.endDate,
      rating: record.rating,
      companions: record.companions,
      weather: record.weather,
      keywords: record.keywords,
      countryName: record.countryName,
      countryFlag: record.countryFlag,
    };
    const html = toNaverHtml(blogData);
    Alert.alert(t('postDetail.naverExportTitle'), t('postDetail.naverExportMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('postDetail.htmlCopy'),
        onPress: async () => {
          await Clipboard.setStringAsync(html);
          setToastMsg(t('postDetail.htmlCopied'));
          setTimeout(() => setToastMsg(''), 2000);
        },
      },
      {
        text: t('postDetail.textShare'),
        onPress: () => {
          const lines: string[] = [];
          if (record.countryFlag && record.countryName) lines.push(`📍 ${record.countryFlag} ${record.countryName}`);
          if (record.startDate && record.endDate) lines.push(`📅 ${record.startDate} ~ ${record.endDate}`);
          if (bodyText) lines.push('', bodyText);
          if (record.keywords?.length) lines.push('', record.keywords.map((k) => `#${k}`).join(' '));
          lines.push('', t('postDetail.shareFooter'));
          Share.share({ message: lines.join('\n') });
        },
      },
    ]);
  };

  const handleArchive = () => {
    setMenuVisible(false);
    Alert.alert(
      t('social.archiveConfirmTitle'),
      t('social.archiveConfirmMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('postDetail.archiveAction'),
          onPress: () => {
            archiveRecord(record.id);
            setToastMsg(t('social.archivedToast'));
            setTimeout(() => { setToastMsg(''); navigation.goBack(); }, 1000);
          },
        },
      ]
    );
  };

  // 보관 해제 — 보관된 게시물 상세 메뉴에서. 해제 후 목록(보관함)으로 돌아간다.
  const handleUnarchive = () => {
    setMenuVisible(false);
    unarchiveRecord(record.id);
    setToastMsg(t('misc.unarchivedToast'));
    setTimeout(() => { setToastMsg(''); navigation.goBack(); }, 1000);
  };

  // 내 게시물 공개범위 토글 (이웃 공개 ↔ 비공개). updateRecord가 로컬·영속·백엔드 동기화까지 처리.
  const handleToggleVisibility = () => {
    setMenuVisible(false);
    const next = record.visibility === 'private' ? 'neighbors' : 'private';
    updateRecord(record.id, { visibility: next });
    setToastMsg(t(next === 'private' ? 'social.madePrivateToast' : 'social.madePublicToast'));
    setTimeout(() => setToastMsg(''), 2000);
  };

  const handleDelete = () => {
    setMenuVisible(false);
    warn(); // 되돌릴 수 없는 동작을 묻는 중
    Alert.alert(t('postDetail.deletePostTitle'), t('postDetail.deletePostMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('postDetail.delete'), style: 'destructive',
        onPress: () => {
          deleteRecord(record.id);
          navigation.goBack();
        },
      },
    ]);
  };

  const handleReport = () => {
    setMenuVisible(false);
    setReportVisible(true);
  };

  // 수정 6: 타인 게시물 차단 — SocialScreen과 동일한 UX (confirmBlock Alert + blockedToast + goBack)
  const handleBlockAuthor = () => {
    setMenuVisible(false);
    const authorUser = {
      name: record.user.name,
      emoji: record.user.emoji ?? '🧳',
      handle: record.user.handle,
      id: typeof record.authorId === 'string' ? record.authorId : undefined,
    };
    confirmBlock(authorUser.handle ?? authorUser.name, () => {
      blockUser(authorUser);
      setToastMsg(t('social.blockedToast'));
      setTimeout(() => { setToastMsg(''); navigation.goBack(); }, 1200);
    }, t);
  };

  // 더블탭: 좋아요(이미 좋아요면 유지) + 하트 버스트 애니메이션
  // 예시 콘텐츠는 좋아요 비활성
  const triggerLikeBurst = () => {
    if (record.isExample) return;
    if (!record.liked) handleToggleLike();
    tap();
    setHeartBurst(true);
    heartScale.setValue(0);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 80 }),
      Animated.timing(heartScale, { toValue: 0, duration: 250, delay: 450, useNativeDriver: true }),
    ]).start(() => setHeartBurst(false));
  };
  // 단일 탭(풀스크린)과 더블 탭(좋아요) 구분
  const handleMediaTap = (onSingle: () => void) => {
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      if (singleTapTimer.current) { clearTimeout(singleTapTimer.current); singleTapTimer.current = null; }
      lastTapRef.current = 0;
      triggerLikeBurst();
    } else {
      lastTapRef.current = now;
      singleTapTimer.current = setTimeout(() => { onSingle(); singleTapTimer.current = null; }, 280);
    }
  };

  // 작성자 행 2번째 줄의 국가 — 2026-09-20 시안에서 스킨 틴트 칩을 버리고 **평문 한 줄**로 바꿨다.
  // (칩 스타일 countryTag/countryTagText는 지우지 않는다 — 스냅 상세 등 다른 경로가 쓴다.)
  // 국기 없이 나라 이름만(2026-09-20 사용자 지시). record.country는 "🇰🇷 대한민국" 꼴의 태그라 앞 토큰을 뗀다.
  const stripFlag = (tag: string) => { const sp = tag.indexOf(' '); return sp > 0 ? tag.slice(sp + 1).trim() : tag; };
  const renderCountries = () => {
    if (!record.countries || record.countries.length === 0) {
      return record.country ? (
        <Text style={s.userCountryText} onLayout={(e) => setCountryW(e.nativeEvent.layout.width)} {...andFitText}>{countryLabel(stripFlag(record.country), i18n.language)}</Text>
      ) : null;
    }
    // 3개까지는 " · "로 이어 한 줄. 4개 이상이면 첫 나라 + 나머지 개수.
    const label = record.countries.length <= 3
      ? record.countries.map((c) => countryLabel(c.name, i18n.language)).join(' · ')
      : `${countryLabel(record.countries[0].name, i18n.language)} +${record.countries.length - 1}`;
    return <Text style={s.userCountryText} onLayout={(e) => setCountryW(e.nativeEvent.layout.width)} {...andFitText}>{label}</Text>;
  };

  // ── 스냅: 인스타 스토리 스타일 전체화면 ──
  if (viewType === 'snap') {
    // 스냅 뷰어는 소셜 탭 스토리 링과 같은 필터 목록(snapViewerRecords)에서 스토리를 만든다.
    // 다만 열려는 스냅이 그 목록에 '없는' 경우가 있다 —
    //   · 예시 스냅(isExample): 스토어에 저장되지 않는 로컬 상수
    //   · 보관한 스냅(보관함 탭): archivedIds로 목록에서 걸러진다
    //   · 메이트 프로필→여행 상세(게스트)에서 route.params.record로 넘어온 스냅: 스토어에 없다
    // 이때 목록만 넘기면 뷰어가 대상을 못 찾아 엉뚱한 스토리(첫 번째)가 재생되거나,
    // 목록이 비면 열리자마자 닫혔다. 그런 경우 이 글 하나만 단독 스토리로 재생한다.
    // (rawRecord가 아니라 뷰어 필터를 거친 record — 작성자가 나에게 숨긴 사진이 새지 않게)
    // 판정은 snapFallbackRef가 진입 시 한 번만 내린다 — 뷰어 안에서 신고/보관해도
    // 목록이 갑자기 '단독 스토리'로 붕괴하지 않게(위 snapFallbackRef 주석 참조).
    const snapRecords = snapFallbackRef.current ? [record] : snapViewerRecords;
    return (
      <SnapStoryViewer
        initialPostId={postId}
        // 메이트 스냅은 feedPosts에 있다 — records만 넘기면 메이트 스냅을 열 때 내 스토리가
        // 재생되거나(내 스냅 존재 시) 뷰어가 열리자마자 닫힌다. 소셜 탭 스토리 링과 동일 소스+동일 필터.
        records={snapRecords}
        navigation={navigation}
        toggleLike={toggleLike}
        deleteRecord={deleteRecord}
        archiveRecord={archiveRecord}
        markSnapViewed={markSnapViewed}
      />
    );
  }

  // 사진/네컷/placeholder 위에 공통으로 올리는 동행자 오버레이

  // 더블탭 좋아요 하트 버스트 (사진/네컷 위 오버레이)
  const heartOverlay = heartBurst ? (
    <Animated.View pointerEvents="none" style={[s.heartBurst, { transform: [{ scale: heartScale }] }]}>
      <Text style={s.heartBurstIcon}>♥</Text>
    </Animated.View>
  ) : null;

  return (
    <View style={s.container}>
      {/* 헤더 — 구분선은 항상 표시(2026-09-20 시안). 오른쪽 버튼은 blog만, feed·cut은 빈 스페이서. */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
          <View style={s.headerSide}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} accessibilityRole="button" accessibilityLabel={t('postDetail.back')}>
              <BackChevronIcon />
            </TouchableOpacity>
          </View>
          <Text style={s.headerTitle} numberOfLines={1}>{headerTitleText}</Text>
          <View style={[s.headerSide, { justifyContent: 'flex-end', gap: 8 }]}>
            {isBlogLayout && (
              <TouchableOpacity
                onPress={() => setFontScale((p) => (p >= 1.4 ? 0.85 : p + 0.15))}
                style={s.menuBtn}
                accessibilityRole="button"
                accessibilityLabel={t('postDetail.fontSizeA11y')}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: fontScale !== 1 ? skinAccent.accent : C.dim }} {...andFitText}>{t('blog.fontSizeBtn')}</Text>
              </TouchableOpacity>
            )}
            {/* feed·cut의 ⋯는 아래 날짜 알약 행으로 내려갔다 — 헤더 ⋯는 blog·album만 */}
            {!isFeedLayout && !record.isExample && (
              <TouchableOpacity onPress={() => { setMenuAnchorY(null); setMenuVisible(true); }} style={s.menuBtn} accessibilityRole="button" accessibilityLabel={t('postDetail.menuA11y')}>
                <Text style={s.menuDots}>···</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
              {/* ── 유저 정보 + 이미지 + 본문 ── */}
              {(() => {
                // 표시 이름·폰트는 캡션과 공유한다(위 authorIsMe/postDisplayName/authorFontStyle).
                const isMyPost = authorIsMe;
                // 메이트 버튼은 제거했다(2026-09-15) — '메이트' 표시를 한 번 누르면 확인 없이 바로
                // 끊겨 오터치 사고가 잦았다. 메이트 신청·해제는 프로필 화면에서만 한다.
                return (
                  <Animated.View style={[s.userRow, entUser]}>
                    <TouchableOpacity
                      style={s.authorTouch}
                      activeOpacity={record.isExample ? 1 : 0.7}
                      accessibilityRole="button"
                      accessibilityLabel={isMyPost ? t('postDetail.myProfileA11y') : t('postDetail.authorProfileA11y')}
                      onPress={() => {
                        if (record.isExample) return;
                        navigation.navigate('FriendProfile', isMyPost
                          ? { userId: record.authorId ?? record.id, username: globalHandle || record.user.name, handle: globalHandle }
                          : { userId: record.authorId ?? record.id, username: record.user.name, handle: record.user.handle });
                      }}
                    >
                      <View style={s.avatar}>
                        {record.isExample ? (
                          <Image source={APP_LOGO} style={{ width: 42, height: 42, borderRadius: 21 }} resizeMode="cover" />
                        ) : isMyPost && globalProfilePhoto ? (
                          <Image source={{ uri: globalProfilePhoto }} style={{ width: 42, height: 42, borderRadius: 21 }} />
                        ) : record.user.photo ? (
                          <Image source={{ uri: record.user.photo }} style={{ width: 42, height: 42, borderRadius: 21 }} />
                        ) : (
                          <PersonIcon size={24} color="#A0A0B0" />
                        )}
                        {/* 프로필 사진 유무와 무관하게 알약과 같은 유리 링(사진 위에 얹힘) */}
                        <AutoPillRing />
                      </View>
                      <View style={s.userInfo}>
                        {/* 아이디 폰트(프리미엄) — 내 글은 내 설정값, 타인 글은 서버 handle_font */}
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          {/* 예시 콘텐츠는 @핸들 대신 'eOrth 공식' 필 배지만 표시 (기능 소개 카드와 동일 룩) */}
                          {record.isExample ? (
                            <Text style={s.officialBadge}>{t('socialEmpty.official')}</Text>
                          ) : (
                            <Text style={[s.userName, authorFontStyle]} onLayout={(e) => setHandleW(e.nativeEvent.layout.width)}>{postDisplayName}</Text>
                          )}
                        </View>
                        <View style={s.userMeta}>
                          {renderCountries()}
                          {!record.isExample && <Text style={[s.userTimeText, { marginLeft: timeMarginLeft }]} onLayout={(e) => setTimeW(e.nativeEvent.layout.width)}>{timeAgo(record.timestamp)}</Text>}
                        </View>
                      </View>
                    </TouchableOpacity>
                    {record.rating != null && record.rating > 0 && (
                      // 별 나열(RatingStars) → 시안의 링 배지. 0.5 단위 표현은 숫자(4.5)가 대신한다.
                      <RatingRingBadge score={record.rating} />
                    )}
                  </Animated.View>
                );
              })()}

              {/* ── 블로그 콘텐츠 ── (스냅은 viewType==='snap'에서 early return 처리) */}
              {viewType === 'blog' && record.blogBlocks && record.blogBlocks.length > 0 ? (
                <>
                  {/* 카테고리 뱃지 */}
                  {record.blogCategory && (
                    <View style={[blogS.categoryBadge, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.tint(0.25) }]}>
                      <Text style={[blogS.categoryBadgeText, { color: skinAccent.accent }]}>{record.blogCategory}</Text>
                    </View>
                  )}

                  {/* 목차 */}
                  <TableOfContents
                    headings={extractHeadings(record.blogBlocks)}
                    onPress={(id) => {
                      const y = blockYPositions.current[id];
                      if (y != null) {
                        scrollRef.current?.scrollTo({ y, animated: true });
                      }
                    }}
                  />

                  {/* 블록 렌더링 */}
                  {record.blogBlocks.map((block) =>
                    block.type === 'heading' ? (
                      <View
                        key={block.id}
                        onLayout={(e) => {
                          blockYPositions.current[block.id] = e.nativeEvent.layout.y;
                        }}
                      >
                        <BlogBlockRenderer block={block} fontScale={fontScale} onImagePress={openFullImage} />
                      </View>
                    ) : (
                      <BlogBlockRenderer key={block.id} block={block} fontScale={fontScale} />
                    )
                  )}
                </>
              ) : (
                <>
                  {viewType === 'cut' && record.cutPhoto?.previewUri ? (
                    /* 네컷: 합성 미리보기 — '책상 위 인화지' 실물 연출(글로우+기울임+그림자) */
                    <Animated.View style={[s.mediaWrap, entMedia]}>
                      {/* 뒤 은은한 글로우 — 프레임색을 따라감(프레임 사진이면 스킨색) */}
                      <LiquidCardGlow
                        width={SCREEN_W - 32}
                        height={cutFitStyle(record.cutPhoto!.layout, SCREEN_W, SCREEN_H).height}
                        color={record.cutPhoto!.frameColor || skinAccent.accent}
                        opacity={0.12}
                      />
                      {/* 기울임 계단현상은 래스터화+블리드 링 3종 세트로 방지 (SocialScreen 폴라로이드와 동일 기법) */}
                      <View style={s.cutTiltWrap}>
                        <View collapsable={false} style={{ margin: -1, padding: 1 }} shouldRasterizeIOS renderToHardwareTextureAndroid>
                          <TouchableOpacity activeOpacity={0.9} onPress={() => handleMediaTap(() => openFullImage(cutViewerUris, 0))}>
                            <Image source={{ uri: record.cutPhoto!.previewUri }} style={[s.cutImage, cutFitStyle(record.cutPhoto!.layout, SCREEN_W, SCREEN_H)]} resizeMode="cover" />
                          </TouchableOpacity>
                        </View>
                      </View>
                      {heartOverlay}
                    </Animated.View>
                  ) : viewType === 'album' && record.medias && record.medias.length > 0 ? (
                    /* 사진첩: 게시물이 아닌 앨범 — 전체 사진 그리드 + 장수 표기 (좋아요·댓글·여행정보 없음)
                       섹션(albumSections)이 있으면 섹션 제목별로 나눠 그린다 (보기 전용) */
                    <>
                      {(record.albumSections && record.albumSections.length > 0
                        ? sectionSlices(record.albumSections, record.medias.length)
                        : [null]
                      ).map((sec) => (
                        <View key={sec?.id ?? 'flat'}>
                          {sec && (
                            <View style={s.albumSectionHeader}>
                              <Text style={s.albumSectionTitle}>{sec.title}</Text>
                              <Text style={s.albumSectionCount}>{sec.count}</Text>
                            </View>
                          )}
                          <View style={s.albumGrid}>
                            {(sec ? record.medias!.slice(sec.start, sec.end) : record.medias!).map((uri, i) => {
                              const globalIdx = sec ? sec.start + i : i;
                              return (
                                <TouchableOpacity
                                  key={`${uri}-${globalIdx}`}
                                  activeOpacity={0.85}
                                  onPress={() => handleMediaTap(() => openFullImage(record.medias!, globalIdx))}
                                >
                                  <Image source={{ uri }} style={s.albumGridImg} />
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      ))}
                      <Text style={s.albumCount}>{t('postDetail.albumPhotoCount', { count: record.medias.length })}</Text>
                    </>
                  ) : record.medias && record.medias.length > 0 ? (
                    /* 피드: 실제 첨부 사진 캐러셀 — 좌우 여백 없이 화면 폭 가득(엣지-투-엣지) */
                    <Animated.View style={[s.mediaWrap, s.mediaFullBleed, entMedia]}>
                      <SlideImageViewerDetail
                        items={record.medias.map((uri) => ({ uri }))}
                        onImagePress={(uris, i) => handleMediaTap(() => openFullImage(uris, i))}
                        captions={record.photoTexts}
                        fullBleed
                        frame={normalizePhotoFrame(record.photoFrame)}
                      />
                      {heartOverlay}
                    </Animated.View>
                  ) : (
                    /* 사진 없음: 그라데이션 placeholder */
                    <LinearGradient
                      colors={
                        viewType === 'album' ? ['#2E1A0A', '#1A0A2E'] :
                        ['#1A0A2E', '#3B1E8E']
                      }
                      style={s.imageArea}
                    >
                      <View style={{ opacity: 0.4 }}>
                        {viewType === 'album' ? <CameraIcon size={48} color="#fff" /> : <LandscapeIcon size={48} color="#fff" />}
                      </View>
                      <View style={[s.viewTypeBadge, { backgroundColor: skinAccent.tint(0.12) }]}>
                        <Text style={[s.viewTypeText, { color: skinAccent.accent }]}>
                          {viewType === 'feed' ? t('postDetail.typeFeed') : viewType === 'cut' ? t('postDetail.typeCut') : t('postDetail.typeAlbum')}
                        </Text>
                      </View>
                    </LinearGradient>
                  )}

                  {/* feed·cut의 본문은 액션 행 아래 '캡션'으로 내려갔다(아래 captionBlock).
                      앨범은 시안 범위 밖이라 그리드 바로 아래 기존 자리를 지킨다. */}
                  {!isFeedLayout && bodyText ? (
                    <Text
                      style={[
                        s.content,
                        { marginBottom: bodyLong && !bodyExpanded ? 2 : (bodyText.trim().length > 50 ? 4 : 0) },
                      ]}
                      numberOfLines={bodyLong && !bodyExpanded ? 6 : undefined}
                      // 펼친 뒤 본문(끝 포함)을 누르면 다시 접힌다
                      onPress={bodyLong && bodyExpanded ? () => setBodyExpanded(false) : undefined}
                      suppressHighlighting
                      accessibilityRole={bodyLong && bodyExpanded ? 'button' : undefined}
                      accessibilityHint={bodyLong && bodyExpanded ? t('postDetail.bodyLessA11y') : undefined}
                    >
                      {bodyText}
                    </Text>
                  ) : null}
                  {!isFeedLayout && bodyLong && !bodyExpanded && (
                    <TouchableOpacity onPress={() => setBodyExpanded(true)} accessibilityRole="button" accessibilityLabel={t('postDetail.bodyMoreA11y')}>
                      <Text style={[s.moreBtn, { color: skinAccent.accent }]}>{t('postDetail.more')}</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

          {/* ── 이하 공통: 정보 칩, 메모, 키워드, 좋아요, 댓글 ── */}
          <View>

          {/* ── 날짜 알약 행 (feed·cut) — 기존 '여행정보' 토글 + 정보 칩을 대체한다 ──
              왼쪽에 날짜/날씨/항공/예산 알약을 접어 흘리고, 오른쪽 끝에 ⋯(헤더에서 내려옴). */}
          {isFeedLayout && (record.startDate || record.weather || record.budget || record.flightType || record.companions?.length || !record.isExample) && (() => {
            const hasDate = !!(record.startDate && record.endDate);
            const hasOptional = !!(normalizeWeather(record.weather) || record.flightType || record.budget || record.companions?.length);
            // 선택정보 줄 — 항공 → 날씨 → 예산 → 동행자
            const optionalPills = hasOptional ? (
              <View style={s.optionalRow}>
                {record.flightType && (
                  /* 시안(2026-09-20 '캘린더 누르면 여행정보 펼쳐짐'): 글자만, 아이콘 없음. 실측 66×30 */
                  <View style={s.infoPill}>
                    <AutoPillRing />
                    <Text style={s.infoPillText}>{record.flightType}</Text>
                  </View>
                )}
                {normalizeWeather(record.weather) && (
                  <View style={[s.infoPill, s.infoPillRound]}>
                    <AutoPillRing />
                    {/* 기록 화면과 같은 제작 SVG 세트 — 이모지는 기기 폰트마다 모양이 달랐다 */}
                    <WeatherIcon value={record.weather} size={16} color="#FFFFFF" />
                  </View>
                )}
                {record.budget && (
                  <View style={s.infoPill}>
                    <AutoPillRing />
                    <Text style={s.infoPillText}>
                      {currencySymbol(record.budget.currency)}{' '}{record.budget.amount.toLocaleString()}
                    </Text>
                  </View>
                )}
                {record.companions?.map((comp, i) => (
                  <View key={`${comp}-${i}`} style={s.infoPill}>
                    <AutoPillRing />
                    <View style={s.companionIconWrap}>{companionIcon(comp)}</View>
                    <Text style={s.infoPillText}>{comp}</Text>
                  </View>
                ))}
              </View>
            ) : null;
            return (<>
            <View style={s.pillRow}>
              <View style={s.pillGroup}>
                {hasDate && (
                  <TouchableOpacity
                    ref={datePillRef}
                    // 오버레이가 떠 있는 동안 원본을 숨긴다 — 흐린 원본 위에 사본이 겹치면 알약 두 장이 포개져
                    // 다른 정보 알약보다 밝게(빛나듯) 보였다. 사본만 남기면 선택정보 알약과 같은 밝기가 된다.
                    style={[s.datePill, !!datePillRect && { opacity: 0 }]}
                    activeOpacity={0.8}
                    disabled={!hasOptional}
                    onPress={openDatePill}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: !!datePillRect }}
                    accessibilityLabel={t('postDetail.travelInfo')}
                  >
                    <AutoPillRing />
                    <CalendarLineIcon />
                    <Text style={s.datePillText}>{record.startDate} ~ {record.endDate}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {!record.isExample && (
                <TouchableOpacity
                  ref={moreBtnRef}
                  onPress={openMenuFromPill}
                  style={s.morePill}
                  accessibilityRole="button"
                  accessibilityLabel={t('postDetail.menuA11y')}
                >
                  <AutoPillRing />
                  <View style={s.moreDot} />
                  <View style={s.moreDot} />
                  <View style={s.moreDot} />
                </TouchableOpacity>
              )}
            </View>
            {/* 날짜가 없으면 접을 손잡이가 없으므로 선택정보를 바로 보여준다 */}
            {!hasDate && optionalPills}
            {/* 날짜 알약을 누르면: 나머지는 흐리고, 날짜 알약과 선택정보만 제자리에 떠오른다. 어디를 눌러도 닫힌다 */}
            <Modal visible={!!datePillRect} transparent animationType="none" statusBarTranslucent onRequestClose={closeDatePill}>
              {datePillRect && (
                <View style={StyleSheet.absoluteFill}>
                  {/* 시안(캘린더 누르면 여행정보 펼쳐짐)은 배경을 거의 그대로 두고 살짝만 가라앉힌다 — 댓글 팝오버(30/0.62)보다 훨씬 약하게 */}
                  <Pressable style={StyleSheet.absoluteFill} onPress={closeDatePill} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
                    <Animated.View style={[StyleSheet.absoluteFill, { opacity: dpAnim }]}>
                      {Platform.OS === 'ios' && <BlurView intensity={8} tint="dark" style={StyleSheet.absoluteFill} />}
                      <View style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === 'ios' ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.28)' }]} />
                    </Animated.View>
                  </Pressable>
                  <Animated.View style={{ position: 'absolute', left: datePillRect.x, top: datePillRect.y, opacity: dpAnim }}>
                    <TouchableOpacity
                      style={s.datePill}
                      activeOpacity={0.8}
                      onPress={closeDatePill}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: true }}
                      accessibilityLabel={t('postDetail.travelInfo')}
                    >
                      <AutoPillRing />
                      <CalendarLineIcon />
                      <Text style={s.datePillText}>{record.startDate} ~ {record.endDate}</Text>
                    </TouchableOpacity>
                  </Animated.View>
                  {/* optionalRow의 marginTop 8이 알약과의 간격 */}
                  <Animated.View
                    style={{
                      position: 'absolute', left: datePillRect.x, top: datePillRect.y + datePillRect.h, width: winW - datePillRect.x - 16,
                      opacity: dpAnim,
                      transform: [{ translateY: dpAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
                    }}
                  >
                    {optionalPills}
                  </Animated.View>
                </View>
              )}
            </Modal>
            </>);
          })()}

          {/* ── 키워드 칩 (blog 전용 — feed·cut은 캡션 끝에 #태그 글자로 흘린다, 2026-09-20 시안) ── */}
          {viewType !== 'album' && !isFeedLayout && record.keywords && record.keywords.length > 0 && (
            <View style={s.keywords}>
              {record.keywords.map((k) => (
                <View key={k} style={[s.keyword, { backgroundColor: skinAccent.tint(0.12) }]}>
                  <Text style={[s.keywordText, { color: skinAccent.accent }]}>#{k}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── 여행정보 토글 버튼 (blog 전용 — feed·cut은 위 알약 행이 대신한다) ── */}
          {!isFeedLayout && viewType !== 'album' && (record.startDate || record.weather || record.budget || record.flightType) && (
            <TouchableOpacity
              style={[s.travelInfoBtn, { backgroundColor: skinAccent.tint(0.12), borderColor: skinAccent.tint(0.2) }]}
              activeOpacity={0.8}
              onPress={() => setTravelInfoPref(!travelInfoOpen)}
            >
              <CalendarIcon size={14} color={skinAccent.accent} />
              <Text style={[s.travelInfoBtnText, { color: skinAccent.accent }]} {...andFitText}>{t('postDetail.travelInfo')}</Text>
              <ChevronIcon size={16} color={skinAccent.accent} up={travelInfoOpen} />
            </TouchableOpacity>
          )}

          {/* ── 정보 칩들 (blog 전용) ── */}
          {!isFeedLayout && viewType !== 'album' && travelInfoOpen && (record.startDate || record.weather || record.budget || record.flightType) && (
            <View style={s.infoRow}>
              {record.startDate && record.endDate && (
                <View style={s.infoChip}>
                  <CalendarIcon size={13} color="#A1A1B0" />
                  <Text style={s.infoChipText}>{record.startDate} ~ {record.endDate}</Text>
                </View>
              )}
              {normalizeWeather(record.weather) && (
                <View style={s.weatherChip}>
                  {/* 기록 화면과 같은 제작 SVG 세트 — 이모지는 기기 폰트마다 모양이 달랐다 */}
                  <WeatherIcon value={record.weather} size={18} color="#A1A1B0" />
                </View>
              )}
              {record.flightType && (
                <View style={s.infoChip}>
                  {record.flightType === '직항' ? <PlaneIcon size={13} color="#A1A1B0" /> : <TransferIcon size={13} color="#A1A1B0" />}
                  <Text style={s.infoChipText}>{record.flightType}</Text>
                </View>
              )}
              {record.budget && (
                <View style={s.infoChip}>
                  <Text style={s.infoChipText}>
                    {currencySymbol(record.budget.currency)}{' '}{record.budget.amount.toLocaleString()}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── 메모 (본문에 글이 나오는 피드·앨범·스트립은 중복 방지, 블로그만 표시) ── */}
          {record.memo && viewType === 'blog' && (
            <View style={[s.memoBox, { backgroundColor: skinAccent.tint(0.06), borderLeftColor: skinAccent.accent }]}>
              <Text style={s.memoText}>{record.memo}</Text>
            </View>
          )}

          {/* ── 좋아요 · 댓글 수 + 댓글 목록 (앨범은 사진 모음이라 소셜 요소 없음) ── */}
          {viewType !== 'album' && (<>
          {/* ── 구분선 (본문 덩어리 ↔ 반응 영역) ── */}
          <View style={s.sectionDivider} />

          {/* ── 액션 행 — 유리 알약을 걷어내고 아이콘+숫자만 나열(2026-09-20 시안) ── */}
          <Animated.View style={[s.actionRow, entInfo]}>
            <TouchableOpacity onPress={() => { if (record.isExample) return; tap(); springLike(); handleToggleLike(); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={record.liked ? t('postDetail.unlike') : t('postDetail.like')}>
              <Animated.View style={{ transform: [{ scale: likeScale }] }}>
                <HeartSvg filled={!!record.liked} />
              </Animated.View>
            </TouchableOpacity>
            <TouchableOpacity style={{ marginLeft: 6 }} onPress={openLikers} disabled={!canShowLikers || !!record.isExample} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('postDetail.likersA11y')}>
              <Text style={[s.actionCount, record.liked && { color: C.red }]}>{record.likes}</Text>
            </TouchableOpacity>
            {!record.isExample && (
              <>
                <TouchableOpacity style={{ marginLeft: 20 }} onPress={() => commentInputRef.current?.focus()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={t('postDetail.commentInputA11y')}>
                  <CommentIcon size={20} color={C.white} />
                </TouchableOpacity>
                <TouchableOpacity style={{ marginLeft: 7 }} onPress={() => commentInputRef.current?.focus()} hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }} accessibilityRole="button" accessibilityLabel={t('postDetail.commentInputA11y')}>
                  <Text style={s.actionCount}>{totalComments}</Text>
                </TouchableOpacity>
                {/* 메뉴 모달의 '공유' 항목과 같은 핸들러 — 동작·문구가 갈라지지 않게 재사용한다 */}
                <TouchableOpacity style={{ marginLeft: 18 }} onPress={handleSharePost} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={t('postDetail.shareAction')}>
                  <ShareIcon size={22} color={C.white} />
                </TouchableOpacity>
              </>
            )}
          </Animated.View>

          {/* ── 캡션 (feed·cut) — 아이디 + 본문을 한 문단으로 흘린다 ── */}
          {isFeedLayout && (bodyText || record.keywords?.length) ? (
            <>
              <Text
                style={[s.captionBody, { marginTop: 20 }]}
                numberOfLines={bodyLong && !bodyExpanded ? 6 : undefined}
                // 펼친 뒤 캡션(끝 포함)을 누르면 다시 접힌다
                onPress={bodyLong && bodyExpanded ? () => setBodyExpanded(false) : undefined}
                suppressHighlighting
                accessibilityRole={bodyLong && bodyExpanded ? 'button' : undefined}
                accessibilityHint={bodyLong && bodyExpanded ? t('postDetail.bodyLessA11y') : undefined}
              >
                {!record.isExample && (
                  <Text style={[s.captionHandle, authorFontStyle]}>{postDisplayName}{'  '}</Text>
                )}
                {bodyText}
                {/* #태그는 본문 뒤에 보라 글자로 이어 붙는다(칩 아님) */}
                {!!record.keywords?.length && (
                  <Text style={s.captionTags}>{bodyText ? ' ' : ''}{record.keywords.map((k) => `#${k}`).join(' ')}</Text>
                )}
              </Text>
              {bodyLong && !bodyExpanded && (
                <TouchableOpacity onPress={() => setBodyExpanded(true)} accessibilityRole="button" accessibilityLabel={t('postDetail.bodyMoreA11y')}>
                  <Text style={[s.moreBtn, { color: skinAccent.accent }]}>{t('postDetail.more')}</Text>
                </TouchableOpacity>
              )}
            </>
          ) : null}

          {/* ── 댓글 목록 ── */}
          <View style={s.commentList}>
          {comments.map((c) => (
            <View key={c.id}>
              <Pressable ref={(n) => { commentRowRefs.current[c.id] = n; }} style={s.commentItem} onLongPress={() => openCommentMenu(c)} delayLongPress={350}>
                {/* 아바타/이름 탭 → 작성자 프로필 (서버 댓글만 authorId 보유) */}
                <TouchableOpacity
                  style={s.commentAvatar}
                  disabled={!c.authorId}
                  onPress={() => c.authorId && navigation.navigate('FriendProfile', { userId: c.authorId, username: c.name })}
                >
                  <AuthorAvatar photo={c.photo} emoji={c.emoji} size={36} emojiSize={15} />
                  <AutoPillRing />
                </TouchableOpacity>
                <View style={s.commentBody}>
                  <View style={s.commentTopRow}>
                    <Text
                      style={s.commentName}
                      onPress={c.authorId ? () => navigation.navigate('FriendProfile', { userId: c.authorId!, username: c.name }) : undefined}
                    >
                      {c.name}
                    </Text>
                    <Text style={s.commentTime}>{commentTime(c)}</Text>
                  </View>
                  {/* @언급은 보라 네온 + 탭하면 그 사람 프로필로 (MentionText가 처리) */}
                  <MentionText text={c.text} style={s.commentText} mentionStyle={s.commentMention} />
                  <View style={s.commentActions}>
                    <TouchableOpacity onPress={() => handleReply(c.id, c.name)}>
                      <Text style={s.commentActionText} {...andFitText}>{t('postDetail.reply')}</Text>
                    </TouchableOpacity>
                    {!!c.replies?.length && (
                      <TouchableOpacity onPress={() => setCommentHidden(c.id, !hiddenCommentIds.has(c.id))}>
                        <Text style={[s.commentActionText, s.commentActionMuted]} {...andFitText}>
                          {hiddenCommentIds.has(c.id) ? t('postDetail.showReplies', { count: c.replies!.length }) : t('postDetail.hideComment')}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                {/* 좋아요는 행 오른쪽 끝 세로선 — 글리프(♥/♡) 대신 본문과 같은 SVG 하트 */}
                <TouchableOpacity style={s.commentLikeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => { tap(); toggleCommentLike(postId, c.id); }}>
                  {!!c.likes && <Text style={s.commentLikeCount}>{c.likes}</Text>}
                  <HeartSvg filled={!!c.liked} size={14.2} strokeWidth={1.2} />
                </TouchableOpacity>
              </Pressable>
              {/* 답글 목록 — 부모의 '숨기기'로 접힌다 */}
              {c.replies && c.replies.length > 0 && !hiddenCommentIds.has(c.id) && c.replies.map((r) => (
                <Pressable key={r.id} ref={(n) => { commentRowRefs.current[r.id] = n; }} style={s.replyItem} onLongPress={() => openCommentMenu(r)} delayLongPress={350}>
                  <TouchableOpacity
                    style={s.commentAvatar}
                    disabled={!r.authorId}
                    onPress={() => r.authorId && navigation.navigate('FriendProfile', { userId: r.authorId, username: r.name })}
                  >
                    <AuthorAvatar photo={r.photo} emoji={r.emoji} size={36} emojiSize={15} />
                    <AutoPillRing />
                  </TouchableOpacity>
                  <View style={s.commentBody}>
                    <View style={s.commentTopRow}>
                      <Text
                        style={s.commentName}
                        onPress={r.authorId ? () => navigation.navigate('FriendProfile', { userId: r.authorId!, username: r.name }) : undefined}
                      >
                        {r.name}
                      </Text>
                      <Text style={s.commentTime}>{commentTime(r)}</Text>
                    </View>
                    <MentionText text={r.text} style={s.commentText} mentionStyle={s.commentMention} />
                    <View style={s.commentActions}>
                      <TouchableOpacity onPress={() => handleReply(r.id, r.name)}>
                        <Text style={s.commentActionText} {...andFitText}>{t('postDetail.reply')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <TouchableOpacity style={s.commentLikeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => { tap(); toggleCommentLike(postId, r.id); }}>
                    {!!r.likes && <Text style={s.commentLikeCount}>{r.likes}</Text>}
                    <HeartSvg filled={!!r.liked} size={14.2} strokeWidth={1.2} />
                  </TouchableOpacity>
                </Pressable>
              ))}
            </View>
          ))}
          {commentsLoading && comments.length === 0 ? (
            <ActivityIndicator color={skinAccent.accent} style={{ marginTop: 20 }} />
          ) : comments.length === 0 ? (
            <Text style={s.commentEmpty}>{t('trip.noComments')}</Text>
          ) : null}
          </View>
          </>)}
          <View style={{ height: 16 }} />
          </View>
        </ScrollView>

        {/* ── 답글 표시 바 ── */}
        {replyTo && (
          <View style={s.replyBar}>
            <Text style={[s.replyBarText, { color: skinAccent.accent }]}>{t('postDetail.replyingTo', { name: replyTo.name })}</Text>
            <TouchableOpacity onPress={cancelReply}>
              <Text style={s.replyBarCancel}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* ── 댓글 입력 (앨범 및 예시 콘텐츠 제외) ── */}
        {viewType !== 'album' && !record.isExample && (
        <>
        {/* @자동완성 — 후보가 0이면 MentionSuggestBar 가 null 을 돌려주므로 여기선 '편집 중인가'만 본다.
            입력 바 바로 위·KeyboardAvoidingView 안이라 키보드 위에 붙어 뜬다. */}
        {commentFocused && activeMention && (
          <MentionSuggestBar
            candidates={mentionCandidates}
            query={activeMention.query}
            exclude={globalHandle}
            onPick={pickMention}
          />
        )}
        {/* 입력바 래퍼 — 그라데이션(136)이 입력바보다 커서 위 댓글 목록 위로 흘러 올라간다.
            ⚠️ 넘치는 만큼(gradientOverlap)을 **래퍼의 paddingTop으로 품고 같은 값의 음수 marginTop으로
               되돌린다.** `overflow:'visible'`에 기대면 안드로이드가 부모 경계 밖 자식을 안 그려
               그라데이션이 입력바 높이만큼만 칠해진다(QA F-1).
            ⚠️ pointerEvents는 **prop**으로만 준다(layout-parity 규칙 13 — 스타일 키는 무시된다).
               box-none이라 투명한 위 63px는 아래 댓글의 탭을 그대로 통과시킨다. */}
        <View pointerEvents="box-none" style={[s.inputWrap, { paddingTop: gradientOverlap, marginTop: -gradientOverlap }]}>
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(12,12,12,0.7)']}
            locations={[0.02, 0.55]}
            pointerEvents="none"
            style={s.inputGradient}
          />
          {/* 안드로이드 내비바 인셋 보정 (키보드가 떠 있으면 인셋 불필요 — 키보드가 내비바를 덮음) */}
          <View style={[s.inputBar, { paddingBottom: inputBarPadBottom }]}>
            <View style={s.inputAvatar}>
              <AuthorAvatar photo={globalProfilePhoto ?? undefined} size={42} />
              <AutoPillRing />
            </View>
            <View style={s.inputPill}>
              <AutoPillRing />
              <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                ref={commentInputRef}
                style={[s.input, !!commentText.trim() && { paddingRight: 56 }]}
                placeholder={replyTo ? t('postDetail.replyToPlaceholder', { name: replyTo.name }) : t('postDetail.commentPlaceholder')}
                placeholderTextColor="rgba(255,255,255,0.7)"
                value={commentText}
                onChangeText={setCommentText}
                // 커서 추적 — @자동완성이 "지금 어느 토큰을 쓰는 중인가"를 알아야 한다
                onSelectionChange={(e) => setCommentCursor(e.nativeEvent.selection.end)}
                // 포커스 추적 — 키보드만 내렸을 때 칩 줄이 남지 않게 한다(위 onCommentBlur 주석)
                onFocus={onCommentFocus}
                onBlur={onCommentBlur}
                onSubmitEditing={addComment}
                returnKeyType="send"
                maxLength={500}
              />
              {/* 전송은 쓸 내용이 있을 때만 나타난다 — 비활성 회색 버튼을 늘 띄워 두지 않는다(시안).
                  시안(Group 2085664666): 60×30 보라(#8741FF) 알약 + 흰 위 화살표. 입력 알약 오른쪽 안쪽에 5 여백으로 얹는다 */}
              {!!commentText.trim() && (
                <TouchableOpacity style={s.sendPill} onPress={addComment} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} accessibilityRole="button" accessibilityLabel={t('postDetail.send')}>
                  <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
                    <SvgPath d="M7 12.5V1.8M2.2 6.6L7 1.8l4.8 4.8" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
        </>
        )}
      </KeyboardAvoidingView>


      {/* ── 메뉴 모달 ── */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        statusBarTranslucent navigationBarTranslucent
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={[s.menuOverlay, { paddingRight: 20 + stageGutter, paddingTop: menuPaddingTop }]}
          accessibilityViewIsModal
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View
            style={s.menuCard}
            onLayout={(e) => {
              // 실측 높이가 오면 추정치를 대체한다 — 같은 값으로 setState 하면 무한 루프라 1px 여유를 둔다
              const h = e.nativeEvent.layout.height;
              if (h > 0 && Math.abs(h - menuCardH) > 1) setMenuCardH(h);
            }}
          >
            <AutoPillRing radius={10} />
            {isArchived ? (
              /* 보관된 게시물 — 보관 해제 / 삭제만 노출 */
              <>
                <TouchableOpacity style={s.menuItem} onPress={handleUnarchive} activeOpacity={0.7}>
                  <ArchiveIcon size={14} color="#fff" />
                  <Text style={s.menuItemText}>{t('misc.unarchive')}</Text>
                </TouchableOpacity>
                <View style={s.menuSectionDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleDelete} activeOpacity={0.7}>
                  <TrashIcon size={14} color="#FF3B30" />
                  <Text style={[s.menuItemText, { color: '#FF3B30' }]}>{t('postDetail.deleteAction')}</Text>
                </TouchableOpacity>
              </>
            ) : (
            <>
            {/* 공통 메뉴 — 공유 행은 뺐다. 액션 행에 종이비행기 공유가 이미 있어 중복이었다(2026-09-20 시안) */}
            <TouchableOpacity style={s.menuItem} onPress={handleCopyLink} activeOpacity={0.7}>
              <LinkIcon size={13} color="#fff" />
              <Text style={s.menuItemText}>{t('social.copyLink')}</Text>
            </TouchableOpacity>

            {isMyPost && viewType === 'blog' && (
              <>
                <View style={s.menuDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleExportToNaver} activeOpacity={0.7}>
                  <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: '#03C75A', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900' }}>N</Text>
                  </View>
                  <Text style={s.menuItemText}>{t('postDetail.naverExportTitle')}</Text>
                </TouchableOpacity>
              </>
            )}

            {isMyPost ? (
              <>
                <View style={s.menuDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleToggleVisibility} activeOpacity={0.7}>
                  {record.visibility === 'private'
                    ? <GlobeIcon size={14} color="#fff" />
                    : <LockClosedIcon size={14} color="#fff" />}
                  <Text style={s.menuItemText}>{t(record.visibility === 'private' ? 'social.makePublic' : 'social.makePrivate')}</Text>
                </TouchableOpacity>
                <View style={s.menuDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleArchive} activeOpacity={0.7}>
                  <ArchiveIcon size={14} color="#fff" />
                  <Text style={s.menuItemText}>{t('postDetail.archiveAction')}</Text>
                </TouchableOpacity>
                <View style={s.menuDivider} />
                <TouchableOpacity style={s.menuItem} onPress={() => {
                  setMenuVisible(false);
                  if (viewType === 'blog') {
                    navigation.navigate('BlogRecord', { record: rawRecord });
                  } else if (viewType === 'album') {
                    // 사진첩 편집(추가·삭제·섹션 정리)은 전용 화면(TripRecord)에서 — 차단 알림 대체
                    if (rawRecord) navigation.navigate('TripRecord', { record: rawRecord, viewType: 'album' });
                  } else {
                    navigation.navigate('NewRecord', { record: rawRecord });
                  }
                }} activeOpacity={0.7}>
                  <PencilIcon size={14} color="#fff" />
                  <Text style={s.menuItemText}>{t('postDetail.editAction')}</Text>
                </TouchableOpacity>
                <View style={s.menuSectionDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleDelete} activeOpacity={0.7}>
                  <TrashIcon size={14} color="#FF3B30" />
                  <Text style={[s.menuItemText, { color: '#FF3B30' }]}>{t('postDetail.deleteAction')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* 타인 글 — 시안 3행: 링크 복사 / 신고하기 / 차단하기 */}
                <View style={s.menuSectionDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleReport} activeOpacity={0.7}>
                  <WarningIcon size={14} color="#FF3B30" />
                  <Text style={[s.menuItemText, { color: '#FF3B30' }]}>{t('social.reportLong')}</Text>
                </TouchableOpacity>
                {/* 수정 6: 타인 게시물 차단 — SocialScreen과 동일 패턴. 아이콘은 사람이 아니라 금지 표식(BlockIcon) */}
                <View style={s.menuDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleBlockAuthor} activeOpacity={0.7}>
                  <BlockIcon size={14} color="#FF3B30" />
                  <Text style={[s.menuItemText, { color: '#FF3B30' }]}>{t('social.blockTitle')}</Text>
                </TouchableOpacity>
              </>
            )}
            </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── 신고 모달 ── */}
      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSubmit={(reason) => {
          setReportVisible(false);
          reportPost(record.id, reason);
          setToastMsg(t('social.reportReceivedToast'));
          setTimeout(() => setToastMsg(''), 2000);
        }}
      />

      {/* 댓글 꾹 누르기 팝오버 — 인스타 댓글 시트 참고(2026-09-20): 흐린 배경 + 누른 댓글 카드 + 아래 둥근 메뉴 */}
      <Modal visible={!!commentMenu} transparent animationType="none" statusBarTranslucent onRequestClose={() => closeCommentMenu()}>
        {commentMenu && (() => {
          const { c, rect } = commentMenu;
          const MENU_W = 240;
          const ROW_H = 52;
          const rows = c.isMine
            ? [{ key: 'delete', label: t('postDetail.delete'), icon: <TrashIcon size={22} color="#FF3B30" />, onPress: () => confirmDeleteComment(c.id) }]
            : [{ key: 'report', label: t('social.report'), icon: <WarningIcon size={22} color="#FF3B30" />, onPress: () => setCommentReportId(c.id) }];
          const menuH = rows.length * ROW_H + 8;
          const below = rect.y + rect.h + 8;
          // 아래에 자리가 없으면 댓글 위로
          const top = below + menuH <= SCREEN_H - insets.bottom - 8 ? below : Math.max(insets.top + 8, rect.y - menuH - 8);
          const left = Math.max(16, Math.min(rect.x + 24, winW - 16 - MENU_W));
          return (
            <View style={StyleSheet.absoluteFill}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => closeCommentMenu()} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: cmAnim }]}>
                  {Platform.OS === 'ios'
                    ? <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                    : <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.62)' }]} />}
                </Animated.View>
              </Pressable>
              {/* 누른 댓글 — 원래 자리에 카드로 다시 그린다(원본은 흐림 아래). 제자리에서 살짝 커지며 떠오르고, 닫힐 땐 되돌아간다 */}
              <Animated.View
                pointerEvents="none"
                style={[
                  s.cmCard,
                  { left: rect.x, top: rect.y, width: rect.w, minHeight: rect.h },
                  { opacity: cmAnim, transform: [{ scale: cmAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) }] },
                ]}
              >
                <View style={s.commentAvatar}><AuthorAvatar photo={c.photo} emoji={c.emoji} size={36} emojiSize={15} /><AutoPillRing /></View>
                <View style={s.commentBody}>
                  <View style={s.commentTopRow}>
                    <Text style={s.commentName}>{c.name}</Text>
                    <Text style={s.commentTime}>{commentTime(c)}</Text>
                  </View>
                  <MentionText text={c.text} style={s.commentText} mentionStyle={s.commentMention} />
                </View>
              </Animated.View>
              {/* 메뉴 — 카드 쪽에서 스프링으로 펼쳐진다(작게·살짝 위에서 → 제자리) */}
              <Animated.View
                style={[
                  s.cmMenu,
                  { left, top, width: MENU_W },
                  {
                    opacity: cmAnim,
                    transform: [
                      { translateY: cmAnim.interpolate({ inputRange: [0, 1], outputRange: [top > rect.y ? -10 : 10, 0] }) },
                      { scale: cmAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) },
                    ],
                  },
                ]}
              >
                {Platform.OS === 'ios' && <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />}
                {rows.map((r) => (
                  <TouchableOpacity key={r.key} style={s.cmRow} activeOpacity={0.7} onPress={() => closeCommentMenu(r.onPress)}>
                    {r.icon}
                    <Text style={[s.cmRowText, { color: '#FF3B30' }]}>{r.label}</Text>
                  </TouchableOpacity>
                ))}
              </Animated.View>
            </View>
          );
        })()}
      </Modal>

      {/* 댓글 신고 — 접수 즉시 해당 댓글이 목록에서 사라진다(App Store 1.2) */}
      <ReportModal
        visible={commentReportId !== null}
        onClose={() => setCommentReportId(null)}
        onSubmit={(reason) => {
          const id = commentReportId;
          setCommentReportId(null);
          if (id) reportComment(postId, id, reason);
          setToastMsg(t('social.reportReceivedToast'));
          setTimeout(() => setToastMsg(''), 2000);
        }}
      />

      {/* ── 좋아요한 사람 목록 ── */}
      <Modal visible={likersVisible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setLikersVisible(false)}>
        <TouchableOpacity style={s.likersOverlay} activeOpacity={1} onPress={() => setLikersVisible(false)} accessibilityViewIsModal>
          {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) */}
          <View style={[s.likersSheet, { paddingBottom: Platform.OS === 'ios' ? 28 : insets.bottom + 12 }]}>
            <View style={s.likersHandle} />
            <Text style={s.likersTitle}>{t('postDetail.likersCountN', { count: likers.length })}</Text>
            {likersLoading ? (
              <ActivityIndicator color={skinAccent.accent} style={{ marginTop: 24 }} />
            ) : likers.length === 0 ? (
              <Text style={s.commentEmpty}>{t('postDetail.noLikers')}</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
                {likers.map((u) => (
                  <TouchableOpacity
                    key={u.id}
                    style={s.likerRow}
                    activeOpacity={0.7}
                    onPress={() => { setLikersVisible(false); navigation.navigate('FriendProfile', { userId: u.id, username: u.name, handle: u.handle }); }}
                  >
                    <AuthorAvatar photo={u.photo} emoji={u.emoji} size={38} emojiSize={17} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={s.likerName}>{u.name}</Text>
                      {!!u.handle && <Text style={s.likerHandle}>@{u.handle}</Text>}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── 토스트 ── */}
      {toastMsg !== '' && (
        <View style={s.toast} pointerEvents="none">
          <Text style={s.toastText}>{toastMsg}</Text>
        </View>
      )}

      {/* ── 풀스크린 이미지 뷰어 ── */}
      {/* 전체화면 사진 뷰어 — 스와이프 + 핀치 줌 + n/m (공용) */}
      <PhotoViewerModal
        visible={fullImgVisible}
        uris={fullImgList}
        initialIndex={fullImgIndex}
        onClose={() => setFullImgVisible(false)}
      />
    </View>
  );
}

// SCREEN_W/SCREEN_H는 useSheets()가 매 렌더의 실측값으로 넘긴다(모듈 최상위 박제 금지).
const makeS = (a: string, tint: (alpha: number) => string, SCREEN_W: number, SCREEN_H: number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  // 예시 콘텐츠 공식 배지 — 기능 소개 카드(FeatureShowcaseCard.badge)와 동일 룩
  officialBadge: { alignSelf: 'center', fontSize: 9, fontWeight: '800', color: '#0A0A0F', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },

  // ── 헤더 ──
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10,
    // 항상 보이는 얇은 구분선 (2026-09-20 시안 line.svg — 0.8 / 흰색 15%)
    borderBottomWidth: 0.8, borderBottomColor: 'rgba(255,255,255,0.15)',
  },
  // 좌(뒤로가기)·우(메뉴) 동일 폭 → 가운데 제목이 버튼 개수와 무관하게 항상 화면 중앙
  headerSide: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  // 뒤로가기 — 카드 박스 없이 chevron만(사용자 지시). 38 치수는 터치 영역으로 유지.
  // flex-start: chevron을 패딩 끝(x≈16~17)에 붙인다 — 가운데 정렬이면 시안보다 안쪽으로 들어간다.
  backBtn: {
    width: 38, height: 38,
    alignItems: 'flex-start', justifyContent: 'center',
  },
  headerTitle: { flexShrink: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', letterSpacing: 0.72, color: C.white, marginHorizontal: 8 },
  menuBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center',
  },
  menuDots: { fontSize: 16, color: C.dim, letterSpacing: 2, marginTop: -2 },

  scroll: { flex: 1 },
  // 좌우 16 — 이 값이 바뀌면 mediaFullBleed의 음수 마진과 'SCREEN_W - 32' 계산도 함께 바뀐다
  scrollContent: { paddingHorizontal: 16, paddingTop: 19, paddingBottom: 8 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: C.muted, fontSize: 14 },

  // ── 미디어 전체 영역 (여백 없이, 위까지) ──
  // 인스타 스토리식 상단 오버레이

  // ── 유저 정보 ──
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 15,
  },
  authorTouch: { flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 },
  // 42 원 + 테두리 없음 — 스킨 틴트 링은 시안에서 빠졌다
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center',
  },
  userInfo: { flex: 1, marginTop: 2 },
  userName: { fontSize: 15, fontWeight: '800', letterSpacing: 0.45, color: C.white },
  // 국가·게시 시간은 한 줄(같은 열)에 나열 — 국가 왼쪽 끝이 아이디 왼쪽 끝과 같은 선.
  userMeta: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4,
  },
  // 이 화면의 국가·시간은 칩이 아니라 평문 한 줄(2026-09-20 시안).
  // 아래 countryTag/countryTagText는 지우지 않는다 — 다른 경로가 쓰는 칩 스타일이다.
  userCountryText: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3, color: C.white },
  userTimeText: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3, color: 'rgba(255,255,255,0.5)' },
  // 꾹 누른 댓글 카드 — 행과 같은 내부 배치(paddingLeft 11·gap 14·아바타 marginTop 2)를 유지해 제자리에 겹친다
  cmCard: {
    position: 'absolute', flexDirection: 'row', alignItems: 'flex-start', gap: 16,
    paddingLeft: 11, paddingRight: 12, paddingVertical: 8, marginTop: -8,
    borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cmMenu: {
    position: 'absolute', borderRadius: 22, overflow: 'hidden', paddingVertical: 4,
    backgroundColor: Platform.OS === 'ios' ? 'rgba(36,36,42,0.72)' : 'rgba(36,36,42,0.98)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 18 },
      default: { elevation: 12 },
    }),
  },
  cmRow: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 52, paddingHorizontal: 18 },
  cmRowText: { fontSize: 17, fontWeight: '600', color: '#FFFFFF' },
  countryTag: {
    backgroundColor: tint(0.12),
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4,
  },
  countryTagText: { fontSize: 11, fontWeight: '600', color: a },
  dateMeta: { fontSize: 11, color: C.muted },
  ratingStars: { fontSize: 13, color: a, letterSpacing: 1.5 },

  // ── 이미지 ──
  imageArea: {
    width: '100%', aspectRatio: 4 / 3, borderRadius: 16, marginBottom: 18,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    zIndex: 10,
  },

  // ── 실제 사진/네컷 영역 ──
  mediaWrap: { position: 'relative', marginBottom: 4 },
  // 피드 캐러셀 — 스크롤 본문 패딩(16)을 상쇄해 화면 폭 가득 채운다
  mediaFullBleed: { marginHorizontal: -16 },
  // 스트립 기울임 — '책상 위 인화지'. 그림자는 iOS만(Android elevation은 투명 래퍼에서
  // 사각 그림자가 그대로 드러난다 — 깊이감은 뒤 글로우가 대신한다)
  cutTiltWrap: {
    alignSelf: 'center',
    transform: [{ rotate: '-1.5deg' }],
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.45,
        shadowRadius: 16,
      },
      default: {},
    }),
  },
  // 사진첩(앨범) 그리드 — 본문 패딩(16+16) 안 3열
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginBottom: 10 },
  albumGridImg: {
    width: Math.floor((SCREEN_W - 32 - 4) / 3),
    height: Math.floor((SCREEN_W - 32 - 4) / 3),
    borderRadius: 4,
    backgroundColor: '#1F1F22',
  },
  albumCount: { color: '#A1A1B0', fontSize: 12, marginBottom: 10 },
  albumSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, paddingBottom: 8 },
  albumSectionTitle: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  albumSectionCount: { fontSize: 12, color: '#A1A1B0' },
  cutImage: {
    width: SCREEN_W - 32, height: SCREEN_H * 0.6, borderRadius: 12,
    marginBottom: 14, backgroundColor: '#000', alignSelf: 'center',
  },
  heartBurst: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', zIndex: 20,
  },
  heartBurstIcon: {
    fontSize: 96, color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 16,
  },
  commentEmpty: {
    color: C.muted, fontSize: 14, textAlign: 'center',
    marginTop: 20, marginBottom: 8,
  },
  viewTypeBadge: {
    position: 'absolute', top: 12, right: 12,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  viewTypeText: { fontSize: 11, fontWeight: '600', color: a },
  tagBtn: {
    position: 'absolute', bottom: 12, left: 12,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  companionPopup: {
    position: 'absolute', bottom: 12, left: 50,
    backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, gap: 6,
  },
  companionPopupItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  companionPopupText: { fontSize: 12, color: '#fff', fontWeight: '500' },

  // ── 본문 ──
  content: {
    // 아래 키워드와 한 덩어리로 읽히도록 좁게 — 섹션 경계는 statsRow에서 벌린다
    fontSize: 15, color: C.white, lineHeight: 24, marginBottom: 12,
  },

  // ── 정보 칩들 ──
  infoRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12,
    alignItems: 'center',
  },
  infoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    // 매트 단색 대신 반투명 유리 톤 — 배경(우주 검정)이 살짝 비쳐 가볍게 보인다
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  companionIconWrap: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  infoChipText: { fontSize: 12, color: C.dim },
  weatherChip: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── 여행정보 토글 버튼 ──
  // 위 본문(글·사진·키워드)과 시각적으로 분리되도록 위 여백을 더 준다 —
  // 다른 블록은 marginBottom 18로 균일한데 이 버튼만 위 여백이 없어 붙어 보였다.
  travelInfoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    marginTop: 10, marginBottom: 14,
    backgroundColor: tint(0.12), borderWidth: 1, borderColor: tint(0.2),
  },
  travelInfoBtnText: { fontSize: 13, color: a, fontWeight: '600' },

  // ── 메모 ──
  memoBox: {
    backgroundColor: tint(0.06), borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14,
    borderLeftWidth: 3, borderLeftColor: a,
  },
  memoText: { fontSize: 13, color: C.dim, lineHeight: 20, fontStyle: 'italic' },

  // ── 날짜 알약 행 (feed·cut) ──
  // 왼쪽 그룹은 줄바꿈되지만 ⋯는 항상 오른쪽 끝 첫 줄에 붙어야 해서 alignItems: 'flex-start'.
  pillRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  pillGroup: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  datePill: {
    height: 30, borderRadius: 31.5, backgroundColor: 'rgba(255,255,255,0.1)',
    paddingLeft: 22, paddingRight: 20,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  datePillText: { fontSize: 14, fontWeight: '800', letterSpacing: -0.14, color: C.white },
  // 항공·날씨·예산·동행자 — 날짜 알약과 같은 규격(높이 30·r31.5·bg 0.1)·같은 글자(14/800). 시안 실측: '직항' 66×30 → 좌우 16
  infoPill: {
    height: 30, borderRadius: 31.5, backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  infoPillText: { fontSize: 14, fontWeight: '800', letterSpacing: -0.14, color: C.white },
  // 아이콘만 든 알약(날씨)은 지름 30 원
  infoPillRound: { width: 30, paddingHorizontal: 0, justifyContent: 'center' },
  // 날짜 알약 아래 펼쳐지는 선택정보 줄 — 시안 실측: 날짜 아래 10, 알약 사이 10
  optionalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  // ⋯ — 헤더에서 내려온 메뉴 버튼. 점 3개(지름 3, 중심 간격 7 → gap 4)
  morePill: {
    width: 30, height: 30, borderRadius: 15, marginLeft: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  moreDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.white },

  // ── 키워드 ──
  keywords: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  keyword: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
    backgroundColor: tint(0.12),
  },
  keywordText: { fontSize: 12, color: a, fontWeight: '500' },

  // ── 좋아요 · 댓글 ──
  // 본문 영역과 소셜(반응) 영역의 경계 — 여기서 크게 벌려 두 덩어리를 나눈다
  // 이전에는 아이콘+숫자가 배경 위에 그대로 떠 있어 본문 텍스트와 시각적 무게가 같았다.
  // 누를 수 있는 것으로 읽히지도 않았다. 유리 알약으로 감싸 '반응 영역'임을 형태로 말한다.
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 14 },
  statBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  // 좋아요를 누른 상태 — 하트 색만 바뀌던 것을 알약 전체가 받도록. 스킨색이 아니라
  // 붉은 계열을 쓰는 건 하트의 기존 규약(C.red)을 따르는 것이다.
  statBtnLiked: {
    backgroundColor: 'rgba(255,107,157,0.12)',
    borderColor: 'rgba(255,107,157,0.38)',
  },
  statIcon: { fontSize: 22, color: C.dim },
  statCount: { fontSize: 14, fontWeight: '700', color: C.white },

  // ── 액션 행 (2026-09-20 시안) — 알약 없이 아이콘+숫자만. 간격은 각 요소의 marginLeft로.
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 1, marginTop: 19 },
  actionCount: { fontSize: 14, fontWeight: '700', letterSpacing: 0.42, color: C.white },

  // 본문 ↔ 반응 영역 경계. 본문 패딩(16)을 상쇄해 화면 폭 가득.
  sectionDivider: { height: 0.8, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: -16, marginTop: 20 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.cardBorder, marginBottom: 16 },

  // ── 캡션 (액션 행 아래) ──
  // 아이디와 본문을 **한 Text 안에 중첩**으로 흘린다 — 별도 Text를 늘어놓으면 줄바꿈과
  // numberOfLines(더보기 판정)가 어긋난다(MentionText와 같은 이유).
  captionHandle: { fontSize: 15, fontWeight: '700', letterSpacing: 0.45, color: C.white },
  captionBody: { fontSize: 14, fontWeight: '500', letterSpacing: 0.42, color: C.white, lineHeight: 18 },
  captionTags: { color: '#B286FF', fontWeight: '600' },

  // ── 댓글 목록 ──
  commentList: { marginTop: 25 },
  // 아바타↔이름 간격 16(작성자 행·댓글·답글 공통, 2026-09-20 사용자 지시)
  commentItem: { flexDirection: 'row', alignItems: 'flex-start', paddingLeft: 11, gap: 16, marginBottom: 14 },
  commentAvatar: {
    width: 36, height: 36, borderRadius: 18, marginTop: 2,
    backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center',
  },
  commentBody: { flex: 1 },
  commentTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentName: { fontSize: 12, fontWeight: '700', letterSpacing: 0.36, color: C.white },
  commentTime: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  commentText: { fontSize: 12, fontWeight: '400', color: C.white, lineHeight: 15.6, marginTop: 4 },
  commentMention: { color: '#B286FF', fontWeight: '600' },
  moreBtn: { color: a, fontSize: 13, fontWeight: '600', marginTop: 2, marginBottom: 6 },
  // ── 좋아요한 사람 목록 ──
  likersOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  likersSheet: {
    // Modal은 루트 클램프 밖이라 폭을 여기서 다시 잡는다(딤 배경 likersOverlay는 전체 폭 유지)
    width: '100%', maxWidth: STAGE_MAX_W, alignSelf: 'center',
    backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, maxHeight: '70%',
  },
  likersHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.cardBorder, marginBottom: 12 },
  likersTitle: { fontSize: 16, fontWeight: '700', color: C.white, marginBottom: 12 },
  likerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  likerName: { fontSize: 14, fontWeight: '600', color: C.white },
  likerHandle: { fontSize: 12, color: C.dim, marginTop: 1 },
  commentActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 7 },
  // 하트는 행 오른쪽 끝, 아바타(36) 중심에 맞춰 내린다: 2(아바타 marginTop) + (36-12.2)/2 ≈ 14
  commentLikeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 14 },
  commentLikeIcon: { fontSize: 14, color: C.dim },
  commentLikeCount: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  commentActionText: { fontSize: 12, color: C.white, fontWeight: '600' },
  commentActionMuted: { color: 'rgba(255,255,255,0.5)' },
  // 61 = commentItem paddingLeft 11 + 아바타 36 + gap 14 → 답글 아바타가 부모 본문과 같은 선에 선다
  // marginLeft 63 = 부모 paddingLeft 11 + 아바타 36 + 간격 16 → 답글 아바타가 부모 본문 x에 맞춰진다
  replyItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginBottom: 14, marginLeft: 63 },
  replyBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.cardBorder,
  },
  replyBarText: { fontSize: 12, color: a, fontWeight: '600' },
  replyBarCancel: { fontSize: 16, color: C.muted, paddingHorizontal: 4 },

  // ── 댓글 입력 ──
  // 래퍼는 배경을 깔지 않는다 — 그라데이션(136)이 입력바 위로 흘러 올라가 댓글을 덮는 연출.
  // paddingTop/marginTop(= gradientOverlap)은 호출부에서 준다. overflow는 지정하지 않는다 —
  // 안드로이드에서 'visible'은 부모 밖 렌더를 보장하지 않아 기대면 안 된다(QA F-1).
  inputWrap: { position: 'relative' },
  inputGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 136 },
  inputBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 23,
    backgroundColor: 'transparent',
  },
  inputAvatar: {
    width: 42, height: 42, borderRadius: 21, // overflow hidden 없음 — AuthorAvatar가 스스로 둥글게 자르고, 링이 잘리면 안 된다
    backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center',
  },
  // 댓글 입력 알약 — 날짜·정보 알약과 같은 유리 룩(흰 10% 바탕 + AutoPillRing 대각 그라데이션 링, 2026-09-20).
  // borderWidth를 두면 링과 이중 테두리가 되므로 두지 않는다.
  inputPill: {
    flex: 1, marginLeft: 16, height: 40, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center',
  },
  input: {
    flex: 1, height: 40,
    color: C.white, fontSize: 12, fontWeight: '600',
  },
  // 배경 없는 글자 버튼 — 입력이 있을 때만 렌더된다(비활성 상태 자체가 없다)
  // 전송 알약 — 시안 고정색(#8741FF, 캐러셀 활성 점과 같은 값). 입력 알약(높이 40) 안 오른쪽 끝, 상하 5 여백
  sendPill: {
    position: 'absolute', right: 5, top: 5, width: 60, height: 30, borderRadius: 15,
    backgroundColor: DOT_ACTIVE, alignItems: 'center', justifyContent: 'center',
  },

  // ── 동행자 팝업 닫기 오버레이 ──
  dismissOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 5,
  },

  // ── 메뉴 모달 ──
  menuOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start', alignItems: 'flex-end',
    paddingTop: 110, paddingRight: 20,
  },
  // ⋯ 메뉴 카드 — 2026-09-20 시안 SVG "Rectangle 240652657"(130×88, rx 10, 흰 10%, 테두리 없음). 그림자는 반투명이라 뺐다
  menuCard: {
    minWidth: 130, backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10, // overflow:'hidden' 금지 — AutoPillRing(대각 그라데이션 링)이 잘린다. 행 배경이 없어 클립이 필요 없다
  },
  // 행 높이 28 — 시안 88 ÷ 3행. 터치 최소치(44)보다 작지만 시안 우선(menuCardEstH도 같은 28을 쓴다)
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    height: 28, paddingLeft: 12, paddingRight: 12, gap: 8,
  },
  menuItemText: { fontSize: 13, color: C.white, fontWeight: '600' },
  menuDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  // 예전엔 6px 두꺼운 띠였는데 시안이 모든 행 사이를 같은 1px로 쓴다 → menuDivider와 같은 값.
  // 마크업의 '섹션 경계' 의미만 남기려고 이름은 유지한다.
  menuSectionDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)' },

  // ── 토스트 ──
  toast: {
    position: 'absolute', bottom: 100, alignSelf: 'center',
    backgroundColor: 'rgba(30,30,50,0.95)',
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12,
  },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});

// ── 스냅 상세 스타일 ──
// ── 블로그 블록 스타일 ──
const makeBlogS = (a: string, tint: (alpha: number) => string) => StyleSheet.create({
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: tint(0.15),
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: tint(0.25),
  },
  categoryBadgeText: { fontSize: 12, fontWeight: '600', color: a },
  text: {
    fontSize: 15, color: '#FFFFFF', lineHeight: 26, marginBottom: 6,
  },
  heading: {
    fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginTop: 20, marginBottom: 10,
  },
  imageWrap: { marginBottom: 14, borderRadius: 12, overflow: 'hidden' },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12 },
  video: { width: '100%', height: 220, backgroundColor: '#000', borderRadius: 12 },
  caption: {
    fontSize: 12, color: '#A1A1B0', textAlign: 'center', marginTop: 6,
    fontStyle: 'italic',
  },
  imagesGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14,
  },
  gridImage: { width: '100%', aspectRatio: 1, borderRadius: 8 },
  separator: { marginVertical: 16 },
  quote: {
    borderLeftWidth: 3, borderLeftColor: a,
    backgroundColor: tint(0.06),
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 8,
    marginBottom: 12,
  },
  quoteText: { color: '#A1A1B0', fontStyle: 'italic', lineHeight: 24 },
  linkCard: {
    flexDirection: 'row', backgroundColor: '#1C1C28',
    borderRadius: 12, overflow: 'hidden', marginBottom: 14,
    borderWidth: 1, borderColor: '#2A2A3A',
  },
  linkThumb: { width: 80, height: 80 },
  linkInfo: { flex: 1, padding: 10, gap: 4 },
  linkTitle: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  linkDesc: { fontSize: 11, color: '#A1A1B0', lineHeight: 16 },
  linkUrl: { fontSize: 10, color: '#5A5A6E' },
  fileBlock: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1C28', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#2A2A3A', gap: 10, marginBottom: 12 },
  fileName: { color: '#FFFFFF', fontSize: 13, fontWeight: '500' },
  fileSize: { color: '#5A5A6E', fontSize: 11, marginTop: 2 },
  tocWrap: {
    backgroundColor: tint(0.06),
    borderRadius: 12, marginBottom: 18, overflow: 'hidden',
    borderWidth: 1, borderColor: tint(0.12),
  },
  tocToggle: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  tocToggleText: { fontSize: 14, fontWeight: '600', color: a },
  tocArrow: { fontSize: 12, color: '#A1A1B0' },
  tocItem: { paddingVertical: 8, paddingRight: 16 },
  tocItemText: { fontSize: 13, color: '#A1A1B0' },
});

// ── 모먼트 스토리 스타일 ──
// ── 스냅 스토리 전체화면 스타일 ──
const makeStoryS = (a: string, tint: (alpha: number) => string, SCREEN_W: number, SCREEN_H: number) => StyleSheet.create({
  // 예시 콘텐츠 공식 배지 — 기능 소개 카드와 동일 룩, 스토리 헤더에선 살짝 크게
  officialBadge: { alignSelf: 'center', fontSize: 12, fontWeight: '800', color: '#0A0A0F', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  bgPhoto: {
    ...StyleSheet.absoluteFillObject,
    width: SCREEN_W,
    height: SCREEN_H,
  },
  bgPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1A0A2E',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 상단 그라데이션
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 32,
    zIndex: 10,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 10, // 진행 바를 상단에서 조금 내림
    marginBottom: 12,
  },
  progressSeg: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8, // 아이디·올린 시간 줄을 진행 바에서 조금 내림
  },
  // 아바타+아이디를 감싸는 탭 영역 — flex:1로 더보기·닫기 버튼을 우측에 유지
  authorTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  // 시안(iPhone 17 - 63): 링 없는 40pt 아바타 + 아이디·시간 한 줄 배치
  avatarRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tint(0.4),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  handle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  timeText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // 시안: 배경 원 없이 글리프만
  moreBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  moreBtnText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: -4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  closeBtnText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '400',
  },

  // PIP (전면 사진) — 시안: 좌상단, 시안→보라→마젠타 네온 그라데이션 테두리
  pipWrap: {
    position: 'absolute',
    top: 150,
    left: 24, // 사이드에서 조금 더 안쪽으로 (기존 16)
    width: SCREEN_W * 0.32,
    height: SCREEN_W * 0.48, // 세로를 늘려 1:1.5 비율 (기존 0.416 ≈ 1:1.3)
    borderRadius: 22,
    padding: 3,
    zIndex: 8,
  },
  pipImg: {
    width: '100%',
    height: '100%',
    borderRadius: 19,
  },

  // SNAP 뱃지
  snapBadge: {
    position: 'absolute',
    top: 110,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    zIndex: 8,
  },
  snapBadgeText: {
    color: '#FFD60A',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // 촬영 지연 뱃지
  lateBadge: {
    position: 'absolute',
    top: 145,
    right: 16,
    backgroundColor: 'rgba(255,214,10,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    zIndex: 8,
  },
  lateBadgeText: {
    color: '#FFD60A',
    fontSize: 11,
    fontWeight: '700',
  },

  // 하단 그라데이션
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 36,
    paddingTop: 100,
    zIndex: 10,
  },
  // 시안(Group 2085664529): 하단 중앙 알약형 위치 배지 — #1C1C1C 20% 투명 유리 느낌, 높이 28
  locationBadge: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(28,28,28,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 18,
  },
  locationText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  caption: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 24,
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  timeLeft: {
    color: '#FFD60A',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 14,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // 하단 액션 바
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8, // 조회·댓글·공유 아이콘을 사이드에서 조금 떨어뜨림 (기본 여백 16 + 8)
  },
  replyWrap: {
    flex: 1,
  },
  replyInput: {
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  replyPlaceholder: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnWithLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    marginLeft: 8, // 조회 아이콘을 사이드에서 조금 더 떨어뜨림 (액션 줄 여백 24 + 8)
    paddingRight: 12,
    gap: 6,
  },
  actionLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  actionIcon: {
    fontSize: 24,
    color: '#FFFFFF',
  },
  commentCountBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: a,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  commentCountText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── 인라인 메시지 입력 ──
  inlineOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 25,
  },
  inlineInputWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 26,
  },
  inlineInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 34,
    gap: 10,
    backgroundColor: 'rgba(20,20,30,0.92)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  inlineInput: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  inlineSendBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 21,
    backgroundColor: a,
  },
  inlineSendText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── 댓글 바텀시트 ──
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 30,
  },
  commentSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_H * 0.6,
    backgroundColor: '#1C1C28',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 40,
    overflow: 'hidden',
  },
  csHandleArea: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  csHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4A4A59',
  },
  csTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A3A',
    gap: 8,
  },
  csTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  csCount: {
    fontSize: 13,
    fontWeight: '500',
    color: '#A1A1B0',
  },
  csCommentItem: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  csAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2E2E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  csTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  csName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  csTime: {
    fontSize: 11,
    color: '#5A5A6E',
  },
  csText: {
    fontSize: 13,
    color: '#A1A1B0',
    lineHeight: 19,
  },
  csReplyBtn: {
    fontSize: 11,
    color: '#5A5A6E',
    fontWeight: '600',
    marginTop: 4,
  },
  csReplyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#2A2A3A',
  },
  csReplyBarText: {
    fontSize: 12,
    color: a,
    fontWeight: '600',
  },
  csReplyBarCancel: {
    fontSize: 16,
    color: '#5A5A6E',
    paddingHorizontal: 4,
  },
  csInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: '#2A2A3A',
  },
  csInput: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2E2E3B',
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 14,
  },
  csSendBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: a,
  },
  csSendText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0A0A0F',
  },
});

const makeViewerS = (a: string, tint: (alpha: number) => string) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: a,
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '600',
  },
  // pageSheet Modal은 루트 클램프 밖(안드로이드에선 아예 전체화면)이라, 콘텐츠를
  // 여기서 다시 Stage 폭으로 가둔다. root(불투명 페이지 배경)는 전면 유지 —
  // root까지 좁히면 양옆에 모달 기본 배경이 드러난다.
  list: {
    paddingHorizontal: 20,
    gap: 16,
    width: '100%',
    maxWidth: STAGE_MAX_W,
    alignSelf: 'center',
  },
  footer: {
    width: '100%',
    maxWidth: STAGE_MAX_W,
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A26',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2E2E3B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  handleText: {
    fontSize: 12,
    color: '#A1A1B0',
  },
  time: {
    fontSize: 12,
    color: '#4A4A59',
  },
  closeBtn: {
    margin: 20,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#2E2E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});

// ─── 스냅 공유 시트 (메이트 DM 전송 + 외부 공유) 스타일 ───
const makeShareS = (a: string, tint: (alpha: number) => string) => StyleSheet.create({
  sheet: {
    // Modal은 루트 클램프 밖이라 폭을 여기서 다시 잡는다(딤 배경은 전체 폭 유지)
    width: '100%',
    maxWidth: STAGE_MAX_W,
    alignSelf: 'center',
    backgroundColor: '#1A1A28',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '75%',
    flexShrink: 1,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 },
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  friendAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2E2E3B', alignItems: 'center', justifyContent: 'center' },
  friendName: { flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  friendSend: { color: a, fontSize: 13, fontWeight: '700' },
  empty: { color: '#8B8B9E', fontSize: 13, textAlign: 'center', paddingVertical: 28 },
  externalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    borderRadius: 22,
    paddingVertical: 13,
    backgroundColor: '#2E2E3B',
  },
  externalTxt: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});

/**
 * 스타일시트를 지구본 스킨색의 함수로 — 강조색이 시트 5개에 흩어져 하드코딩돼 있어
 * 스킨을 바꿔도 이 화면 일부만 보라로 남았다. 호출부를 하나씩 덮는 대신 시트 자체를
 * 스킨의 함수로 두면 색을 쓰는 지점이 자동으로 따라오고 새 스타일에서도 빠뜨리지 않는다.
 * a=accent(밝은 강조), tint=그 알파 틴트. 스킨이 바뀔 때만 다시 만든다.
 */
function useSheets() {
  const { accent, tint } = useSkinAccent();
  // 폭·높이 의존 스타일이 있어 창 크기도 의존성에 넣는다 — 폴드를 펼치면 시트를 다시 만든다.
  const SCREEN_W = useStageWidth();
  const { height: SCREEN_H } = useWindowDimensions();
  return useMemo(() => ({
    s: makeS(accent, tint, SCREEN_W, SCREEN_H),
    blogS: makeBlogS(accent, tint),
    storyS: makeStoryS(accent, tint, SCREEN_W, SCREEN_H),
    viewerS: makeViewerS(accent, tint),
    shareS: makeShareS(accent, tint),
  }), [accent, tint, SCREEN_W, SCREEN_H]);
}

