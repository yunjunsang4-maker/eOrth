import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  PanResponder,
  Dimensions,
  Linking,
  Vibration,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Path } from 'react-native-svg';
import { GearIcon, PersonIcon } from '../components/icons';
import GrainOverlay from '../components/GrainOverlay';
import {
  FloatingBlobs,
  LiquidPressable,
  GooeyCircle,
  LiquidCardGlow,
  useEntranceAnimation,
} from '../components/LiquidEffects';
import { useRecords } from '../store/recordStore';
import { useSettings } from '../store/settingsStore';
import { showPermissionDeniedAlert } from '../utils/permissionAlert';
import type { TabScreenProps } from '../navigation/types';

// ─── 컬러 상수 (Figma 디자인 기반) ───
const COLORS = {
  bg:           '#0A0A0F',
  card:         '#2E2E3B',
  divider:      '#1A1A26',
  purpleNeon:   '#BF85FC',
  purpleDeep:   '#6B21A8',
  purpleBg:     'rgba(107,33,168,0.25)',
  purpleBorder: 'rgba(191,133,252,0.3)',
  purpleThumb:  '#1A0A2E',
  white:        '#FFFFFF',
  textDim:      '#A1A1B0',
  textMuted:    '#4A4A59',
  redBg:        'rgba(255,59,48,0.1)',
  redBorder:    'rgba(255,59,48,0.2)',
  red:          '#FF3B30',
};

// ─── 리퀴드 글래스 (실제 BlurView — 디벨롭 빌드 전용) ───
// Expo Go 에선 안드로이드 backdrop blur 가 동작하지 않아 가짜 그라디언트를 썼지만,
// 디벨롭 빌드에선 진짜 프로스티드 글래스를 깔 수 있다.
const GLASS = {
  border:      'rgba(255,255,255,0.30)',
  innerTop:    'rgba(255,255,255,0.16)',
  innerBottom: 'rgba(255,255,255,0.02)',
  specular:    'rgba(255,255,255,0.55)',
};

// 부모(overflow:hidden + 라운드) 안에 깔아 유리 질감을 만드는 absolute-fill 레이어
// 1) 실제 블러  2) 유리 안쪽 그라디언트  3) 상단 스페큘러(반사) 하이라이트
const GlassFill = ({
  intensity = 30,
  tint = 'dark',
  specular = true,
}: {
  intensity?: number;
  tint?: 'dark' | 'light' | 'default';
  specular?: boolean;
}) => (
  <>
    <BlurView
      intensity={intensity}
      tint={tint}
      experimentalBlurMethod="dimezisBlurView"
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
    <LinearGradient
      colors={[GLASS.innerTop, GLASS.innerBottom]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
    {specular ? (
      <LinearGradient
        colors={[GLASS.specular, 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '55%', opacity: 0.4 }}
        pointerEvents="none"
      />
    ) : null}
  </>
);

// ─── 네온 리퀴드 글래스 (다크모드 — Liquid Glass UI Kit 레퍼런스) ───
const NEON = {
  cyan:    '#22D3EE',
  blue:    '#3B82F6',
  purple:  '#A855F7',
  magenta: '#D946EF',
  pink:    '#F472B6',
};

// 통계 칩 — 앱 메인 보라색 (보라 네온 → 보라 딥) 통일
const STAT_GRADS = [
  ['#BF85FC', '#6B21A8'],
  ['#BF85FC', '#6B21A8'],
  ['#BF85FC', '#6B21A8'],
] as const;

// 네온 그라디언트 보더 + 글래스 (칩/버튼/카드)
const NeonGlass = ({
  children,
  style,
  contentStyle,
  colors = [NEON.cyan, NEON.purple],
  radius = 18,
  borderWidth = 1.5,
  intensity = 24,
  glow = true,
  glowColor,
  specular = true,
}: {
  children?: React.ReactNode;
  style?: any;
  contentStyle?: any;
  colors?: readonly [string, string, ...string[]];
  radius?: number;
  borderWidth?: number;
  intensity?: number;
  glow?: boolean;
  glowColor?: string;
  specular?: boolean;
}) => (
  <View
    style={[
      glow
        ? {
            shadowColor: glowColor || colors[0],
            shadowOpacity: 0.9,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 0 },
            elevation: 12,
          }
        : null,
      style,
    ]}
  >
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: radius, padding: borderWidth }}
    >
      <View
        style={[
          { borderRadius: radius - borderWidth, overflow: 'hidden', backgroundColor: 'rgba(10,10,15,0.5)' },
          contentStyle,
        ]}
      >
        <GlassFill intensity={intensity} specular={specular} />
        {children}
      </View>
    </LinearGradient>
  </View>
);

// 원형 네온 링 (배지/아바타)
const NeonRing = ({
  size,
  colors,
  borderWidth = 2,
  intensity = 16,
  children,
}: {
  size: number;
  colors: readonly [string, string, ...string[]];
  borderWidth?: number;
  intensity?: number;
  children?: React.ReactNode;
}) => (
  <LinearGradient
    colors={colors}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
    style={{ width: size, height: size, borderRadius: size / 2, padding: borderWidth, alignItems: 'center', justifyContent: 'center' }}
  >
    <View
      style={{
        width: size - borderWidth * 2,
        height: size - borderWidth * 2,
        borderRadius: (size - borderWidth * 2) / 2,
        overflow: 'hidden',
        backgroundColor: 'rgba(10,10,15,0.45)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <GlassFill intensity={intensity} />
      {children}
    </View>
  </LinearGradient>
);

// ─── 팔로워 카드 (네온 글래스 칩) ───
const StatCard = ({
  value,
  label,
  onPress,
  grad = STAT_GRADS[0],
}: {
  value: string;
  label: string;
  onPress?: () => void;
  grad?: readonly [string, string, ...string[]];
}) => (
  <LiquidPressable onPress={onPress} intensity={0.08}>
    <NeonGlass colors={grad} glowColor={grad[0]} radius={16} borderWidth={1.3} intensity={22} contentStyle={styles.statCardContent}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </NeonGlass>
  </LiquidPressable>
);

// ─── 여행 기록 썸네일 데이터 ───
const SCREEN_WIDTH = Dimensions.get('window').width;
const CELL_SIZE = Math.floor((SCREEN_WIDTH - 4) / 3);
const THUMB_WIDTH = (SCREEN_WIDTH - 32 - 12) / 2; // 2열 그리드

// ─── 기록 형식 아이콘 (FAB과 동일한 View 기반) ───
const BADGE_SZ = 14;
const BADGE_C = '#FFFFFF';

const FeedBadgeIcon = () => (
  <View style={{ width: BADGE_SZ, height: BADGE_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 5, height: 2.5, borderTopLeftRadius: 1, borderTopRightRadius: 1, backgroundColor: BADGE_C }} />
    <View style={{ width: 12, height: 8, borderRadius: 2, backgroundColor: BADGE_C, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 5, height: 5, borderRadius: 2.5, borderWidth: 1.2, borderColor: '#2E2E3B' }} />
    </View>
  </View>
);

const BlogBadgeIcon = () => (
  <View style={{ width: BADGE_SZ, height: BADGE_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 12, height: 12, gap: 1.5 }}>
      <View style={{ width: 8, height: 2, borderRadius: 1, backgroundColor: BADGE_C }} />
      <View style={{ width: 12, height: 1.5, borderRadius: 0.75, backgroundColor: BADGE_C, opacity: 0.6 }} />
      <View style={{ width: 10, height: 1.5, borderRadius: 0.75, backgroundColor: BADGE_C, opacity: 0.6 }} />
      <View style={{ width: 9, height: 1.5, borderRadius: 0.75, backgroundColor: BADGE_C, opacity: 0.6 }} />
    </View>
  </View>
);

const AlbumBadgeIcon = () => (
  <View style={{ width: BADGE_SZ, height: BADGE_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 12, height: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 1.5 }}>
      <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: BADGE_C }} />
      <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: BADGE_C }} />
      <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: BADGE_C }} />
      <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: BADGE_C }} />
    </View>
  </View>
);

const SnapBadgeIcon = () => (
  <Svg width={16} height={18} viewBox="0 0 24 24" fill="none">
    <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill={BADGE_C} />
  </Svg>
);

const CutBadgeIcon = () => (
  <View style={{ width: BADGE_SZ, height: BADGE_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 11, height: 13, borderWidth: 1, borderColor: BADGE_C, borderRadius: 2, padding: 1.5, flexDirection: 'row', flexWrap: 'wrap', gap: 1, alignContent: 'center', justifyContent: 'center' }}>
      <View style={{ width: 3, height: 3, borderRadius: 0.5, backgroundColor: BADGE_C }} />
      <View style={{ width: 3, height: 3, borderRadius: 0.5, backgroundColor: BADGE_C }} />
      <View style={{ width: 3, height: 3, borderRadius: 0.5, backgroundColor: BADGE_C }} />
      <View style={{ width: 3, height: 3, borderRadius: 0.5, backgroundColor: BADGE_C }} />
    </View>
  </View>
);

const VIEW_TYPE_BADGE: Record<string, React.ReactNode> = {
  feed: <FeedBadgeIcon />,
  blog: <BlogBadgeIcon />,
  album: <AlbumBadgeIcon />,
  snap: <SnapBadgeIcon />,
  cut: <CutBadgeIcon />,
};

const VIEW_TYPE_NAMES: Record<string, string> = {
  feed: '피드', blog: '블로그', album: '앨범', snap: '스냅', cut: '스트립',
};

// 하나의 여행 = 하나의 썸네일 (여러 형식 기록 포함)
interface TripThumbnail {
  id: string;
  emoji: string;
  title: string;
  country: string;
  countryFlag: string;
  date: string;
  color: string;
  records: { id: string; viewType: string }[];
  coverUri?: string; // 대표 기록의 첫 사진 — 있으면 카드 썸네일 배경으로 사용
}

const TRIP_THUMBNAILS: TripThumbnail[] = [
  {
    id: 'trip-japan',
    emoji: '🗼',
    title: '도쿄 감성 여행',
    country: '일본',
    countryFlag: '🇯🇵',
    date: '2025.03',
    color: '#1A0A2E',
    records: [
      { id: '1', viewType: 'feed' },
      { id: '2', viewType: 'blog' },
      { id: 'seed-snap2', viewType: 'snap' },
      { id: 'seed-cut', viewType: 'cut' },
    ],
  },
  {
    id: 'trip-usa',
    emoji: '🗽',
    title: 'NYC 자유여행',
    country: '미국',
    countryFlag: '🇺🇸',
    date: '2025.01',
    color: '#0A1A2E',
    records: [
      { id: '3', viewType: 'blog' },
      { id: '7', viewType: 'feed' },
    ],
  },
  {
    id: 'trip-hongkong',
    emoji: '🌃',
    title: '홍콩 야경 투어',
    country: '홍콩',
    countryFlag: '🇭🇰',
    date: '2024.12',
    color: '#1A1A0A',
    records: [
      { id: '5', viewType: 'feed' },
    ],
  },
  {
    id: 'trip-thailand',
    emoji: '🏯',
    title: '방콕 힐링 여행',
    country: '태국',
    countryFlag: '🇹🇭',
    date: '2025.04',
    color: '#2E1A0A',
    records: [
      { id: 'seed-blog-1', viewType: 'blog' },
      { id: 'seed-snap', viewType: 'snap' },
    ],
  },
  {
    id: 'trip-spain',
    emoji: '💃',
    title: '스페인 건축 탐방',
    country: '스페인',
    countryFlag: '🇪🇸',
    date: '2025.05',
    color: '#2E0A0A',
    records: [
      { id: 'seed-blog-2', viewType: 'blog' },
      { id: 'seed-cut3', viewType: 'cut' },
    ],
  },
];

let CURRENT_TRIP_THUMBNAILS = [...TRIP_THUMBNAILS];


// ─── 배지 데이터 ───
const BADGES = [
  // 대륙 & 첫 방문 배지 (1 ~ 8)
  { id: 1, emoji: '🛫', name: '역사적인 당신의 첫 발자취!', desc: '첫 기록', earned: true, glow: 'rgba(47,217,244,0.6)' },
  { id: 2, emoji: '🌏', name: '아시아에서의 첫발!', desc: '아시아 첫방문', earned: true, glow: 'rgba(47,217,244,0.6)' },
  { id: 3, emoji: '🇪🇺', name: '유럽에서의 첫발!', desc: '유럽 첫방문', earned: false, glow: 'rgba(47,217,244,0.6)' },
  { id: 4, emoji: '🍁', name: '북미에서의 첫발!', desc: '북아메리카 첫방문', earned: false, glow: 'rgba(47,217,244,0.6)' },
  { id: 5, emoji: '🌴', name: '남미에서의 첫발!', desc: '남아메리카 첫방문', earned: false, glow: 'rgba(47,217,244,0.6)' },
  { id: 6, emoji: '🦘', name: '오세아니아에서의 첫발!', desc: '오세아니아 첫방문', earned: false, glow: 'rgba(47,217,244,0.6)' },
  { id: 7, emoji: '🦁', name: '아프리카에서의 첫발', desc: '아프리카 첫방문', earned: false, glow: 'rgba(47,217,244,0.6)' },
  { id: 8, emoji: '🕌', name: '중동에서의 첫발!', desc: '중동 첫방문', earned: false, glow: 'rgba(47,217,244,0.6)' },

  // 여행 동행 & 스타일 배지 (9 ~ 15)
  { id: 9, emoji: '🎒', name: '혼자만의 감성을 즐기는 유형인가요?', desc: '홀로 여행', earned: true, glow: 'rgba(255,100,100,0.5)' },
  { id: 10, emoji: '💑', name: '여행에서 안 싸웠길 바래요^^', desc: '커플 여행', earned: false, glow: 'rgba(255,100,100,0.5)' },
  { id: 11, emoji: '👵', name: '당신의 첫 효도인가요?', desc: '부모님 여행', earned: false, glow: 'rgba(255,100,100,0.5)' },
  { id: 12, emoji: '🤝', name: '여행을 계획한 친구에게 불평하지 마세요.', desc: '친구 여행', earned: false, glow: 'rgba(255,100,100,0.5)' },
  { id: 13, emoji: '🎂', name: '생일 축하드립니다', desc: '생일 여행', earned: false, glow: 'rgba(255,100,100,0.5)' },
  { id: 14, emoji: '⚡', name: '스피드 트래블러', desc: '당일치기 여행', earned: false, glow: 'rgba(255,100,100,0.5)' },
  { id: 15, emoji: '🚗', name: '가스는 잠궜죠?', desc: '30일 이상 여행', earned: false, glow: 'rgba(255,100,100,0.5)' },

  // 국가 & 지역 탐방 배지 (16 ~ 34)
  { id: 16, emoji: '🇯🇵', name: '히사시부리!', desc: '일본 재방문', earned: true, glow: 'rgba(47,244,150,0.5)' },
  { id: 17, emoji: '🍣', name: '열도에 새긴 발걸음', desc: '일본 여러지역 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 18, emoji: '🥢', name: '젓가락만 챙기세요!', desc: '중국과 일본 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 19, emoji: '🇺🇸', name: '미주투어', desc: '미국 여러지역 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 20, emoji: '🇨🇳', name: '중국투어', desc: '중국 여러지역 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 21, emoji: '⛪', name: '당신은 종교대통합을 이뤘어요', desc: '각기 다른 종교국가 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 22, emoji: '🏝️', name: '섬 입문자', desc: '섬 3번 방문 (Lv.1)', earned: true, glow: 'rgba(47,244,150,0.5)' },
  { id: 23, emoji: '🛥️', name: '섬 탐험가', desc: '섬 5번 방문 (Lv.2)', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 24, emoji: '👑', name: '섬 정복자', desc: '섬 10번 방문 (Lv.3)', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 25, emoji: '🗽', name: '당신도 이제 뉴욕커', desc: '뉴욕 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 26, emoji: '🎲', name: '당신은 타짜인가요?', desc: '카지노 지역 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 27, emoji: '☯️', name: '동방의 수호자', desc: '한자 문화권 모두 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 28, emoji: '🇬🇧', name: 'You can speak english, right?', desc: '영어권(미국,영국,호주,캐나다,뉴질랜드) 모두 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 29, emoji: '🐪', name: '오아시스는 찾으셨나요?', desc: '사막지역 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 30, emoji: '🥵', name: '데오드란트를 추천해 드릴까요?', desc: '열대지역 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 31, emoji: '🛂', name: '한국여권의 힘!', desc: '무비자 입국 가능 국가 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 32, emoji: '✈️', name: '월드투어는 성공적이었나요?', desc: '한번에 여러나라 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 33, emoji: '🌀', name: '이건 데자뷰?!', desc: '정확히 1년만에 같은 곳 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 34, emoji: '💖', name: '이 나라와 사랑에 빠지셨군요!', desc: '같은 나라 재방문 5회', earned: false, glow: 'rgba(47,244,150,0.5)' },

  // 여행 마일스톤 배지 (35 ~ 61)
  { id: 35, emoji: '🚶', name: '초보 여행자', desc: '3개국 방문 (Lv.1)', earned: true, glow: 'rgba(168,85,247,0.6)' },
  { id: 36, emoji: '🏃', name: '신흥 탐험가', desc: '5개국 방문 (Lv.2)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 37, emoji: '🗺️', name: '네이션 컬렉터', desc: '10개국 방문 (Lv.3)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 38, emoji: '🌎', name: '글로벌 트래블러', desc: '20개국 방문 (Lv.4)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 39, emoji: '🪐', name: '월드 마스터', desc: '30개국 방문 (Lv.5)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 40, emoji: '👾', name: '세계 정복자', desc: '50개국 방문 (Lv.6)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 41, emoji: '🛡️', name: '전설의 탐험가', desc: '100개국 방문 (Lv.7)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 42, emoji: '🧭', name: '국경없는 이방인', desc: '모든 대륙 1개국 이상 방문', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 43, emoji: '🏆', name: '지구정복자', desc: '모든 국가 방문', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 44, emoji: '🗺️', name: '대륙 정복자', desc: '대륙 하나의 모든 국가 방문', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 45, emoji: '✍️', name: '여행 기록가', desc: '여행기록 5개 달성 (Lv.1)', earned: true, glow: 'rgba(168,85,247,0.6)' },
  { id: 46, emoji: '📖', name: '여행 일지 마스터', desc: '여행기록 10개 달성 (Lv.2)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 47, emoji: '📸', name: '남는건 사진뿐', desc: '사진 50장이상 업로드', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 48, emoji: '⭐', name: '별점 입문자', desc: '별점 1점 기록 (Lv.1)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 49, emoji: '🌟', name: '별점 탐색자', desc: '별점 2점 기록 (Lv.2)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 50, emoji: '⚖️', name: '별점 중립파', desc: '별점 3점 기록 (Lv.3)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 51, emoji: '💯', name: '별점 후한 편', desc: '별점 4점 기록 (Lv.4)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 52, emoji: '🥇', name: '별점 마스터', desc: '별점 5점 기록 (Lv.5)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 53, emoji: '📅', name: '당신의 사계절은 여행으로 채워졌네요', desc: '매분기 여행', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 54, emoji: '💎', name: '저희의 워너비이십니다.', desc: '매달 여행', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 55, emoji: '🕰️', name: '잊지말아줘요..', desc: '1년전 오늘 기록 조회', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 56, emoji: '🌱', name: '배지 입문', desc: '배지 5개 달성 (Lv.1)', earned: true, glow: 'rgba(168,85,247,0.6)' },
  { id: 57, emoji: '📂', name: '배지 수집가', desc: '배지 10개 달성 (Lv.2)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 58, emoji: '🔥', name: '배지 매니아', desc: '배지 30개 달성 (Lv.3)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 59, emoji: '🎓', name: '배지 마스터', desc: '배지 50개 달성 (Lv.4)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 60, emoji: '🏆', name: '배지 챔피언', desc: '배지 100개 달성 (Lv.5)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 61, emoji: '👑', name: '배지 레전드', desc: '배지 200개 달성 (Lv.6)', earned: false, glow: 'rgba(168,85,247,0.6)' },

  // 시즌 & 기념일 배지 (62 ~ 65)
  { id: 62, emoji: '🙇', name: '부모님께 인사는 드렸죠?!', desc: '연휴 중 여행', earned: false, glow: 'rgba(255,100,100,0.5)' },
  { id: 63, emoji: '🎍', name: '새해복 많이 받으세요!', desc: '해가 바뀌는 기간 중 여행', earned: false, glow: 'rgba(255,100,100,0.5)' },
  { id: 64, emoji: '🥗', name: '다이어트는 성공하셨나요?', desc: '여름휴가 여행(7~8월)', earned: false, glow: 'rgba(255,100,100,0.5)' },
  { id: 65, emoji: '🧣', name: '당신은 겨울잠이 없군요', desc: '겨울휴가 여행(1~2월)', earned: false, glow: 'rgba(255,100,100,0.5)' },

  // 기록 형식 배지 (66 ~ 72)
  { id: 66, emoji: '📝', name: '블로그의 달인', desc: '블로그 형식 기록 10개 작성', earned: false, glow: 'rgba(47,217,244,0.6)' },
  { id: 67, emoji: '🖼️', name: '앨범 큐레이터', desc: '앨범 형식 기록 5개 작성', earned: false, glow: 'rgba(47,217,244,0.6)' },
  { id: 68, emoji: '⚡', name: '스냅 마스터', desc: '스냅 기록 30개 달성', earned: false, glow: 'rgba(47,217,244,0.6)' },
  { id: 69, emoji: '🎨', name: '만능 기록자', desc: '피드+블로그+앨범+스냅 각각 1개 이상 작성', earned: false, glow: 'rgba(47,217,244,0.6)' },
  { id: 70, emoji: '🏷️', name: '앨범 아티스트', desc: '앨범 꾸미기에서 스티커 50개 이상 사용', earned: false, glow: 'rgba(47,217,244,0.6)' },
  { id: 71, emoji: '📷', name: '포토그래퍼', desc: '앨범 한 페이지에 사진 5장 이상 배치', earned: false, glow: 'rgba(47,217,244,0.6)' },
  { id: 72, emoji: '📚', name: '다중 페이지 마스터', desc: '앨범 5페이지 이상 작성', earned: false, glow: 'rgba(47,217,244,0.6)' },

  // 소셜 배지 (73 ~ 85)
  { id: 73, emoji: '💬', name: '첫 DM', desc: '친구에게 첫 DM 전송', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 74, emoji: '🔗', name: '공유왕', desc: '게시물 공유 10회', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 75, emoji: '🧚', name: '댓글 요정', desc: '댓글 50개 작성', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 76, emoji: '🔥', name: '인싸 여행러', desc: '게시물에 좋아요 100개 받기', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 77, emoji: '👥', name: '여행 메이트', desc: '같은 친구와 동행기록 5회', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 78, emoji: '🦋', name: '소셜 나비', desc: '친구 50명 달성', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 79, emoji: '🌟', name: '인기스타', desc: '팔로워 100명 달성', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 80, emoji: '📥', name: '첫 공유받기', desc: '다른 사람이 내 게시물을 DM으로 공유', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 81, emoji: '👋', name: '첫 친구', desc: '친구 1명 달성 (Lv.1)', earned: true, glow: 'rgba(168,85,247,0.6)' },
  { id: 82, emoji: '🎉', name: '인싸의 시작', desc: '친구 10명 달성 (Lv.2)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 83, emoji: '👑', name: '인맥왕', desc: '친구 100명 달성 (Lv.3)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 84, emoji: '🤝', name: '첫 동행', desc: '앱 친구와 동행기록 1회 (Lv.1)', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 85, emoji: '👫', name: '동행 메이트', desc: '앱 친구와 동행기록 3회 (Lv.2)', earned: false, glow: 'rgba(168,85,247,0.6)' },

  // 스냅 특별 배지 (86 ~ 90)
  { id: 86, emoji: '⚡', name: '번개 촬영', desc: '스냅 알림 후 10초 이내 촬영', earned: false, glow: 'rgba(47,217,244,0.6)' },
  { id: 87, emoji: '🐌', name: '느긋한 여행자', desc: '스냅 알림 후 5분 이상 후 촬영', earned: false, glow: 'rgba(47,217,244,0.6)' },
  { id: 88, emoji: '🔥', name: '스냅 스트릭', desc: '7일 연속 스냅 기록', earned: false, glow: 'rgba(47,217,244,0.6)' },
  { id: 89, emoji: '🦉', name: '야행성 스냅', desc: '새벽 2~5시 사이 스냅 기록', earned: false, glow: 'rgba(47,217,244,0.6)' },
  { id: 90, emoji: '🌅', name: '일출 스냅', desc: '오전 5~7시 사이 스냅 기록', earned: false, glow: 'rgba(47,217,244,0.6)' },

  // 지구본 & 탐험 배지 (91 ~ 96)
  { id: 91, emoji: '🌐', name: '지구본 탐험가', desc: '지구본에서 5개국 이상 활성화', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 92, emoji: '↔️', name: '적도 횡단', desc: '북반구+남반구 국가 모두 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 93, emoji: '↕️', name: '경도 마스터', desc: '동반구+서반구 국가 모두 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 94, emoji: '⏰', name: '시차 정복', desc: '시차 12시간 이상 차이나는 두 나라 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 95, emoji: '🏝️', name: '섬나라 컬렉터', desc: '섬나라 5개국 이상 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 96, emoji: '⛰️', name: '내륙국 탐험가', desc: '바다 없는 나라 3개국 이상 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },

  // 기록 습관 배지 (97 ~ 104)
  { id: 97, emoji: '💪', name: '꾸준함의 힘', desc: '30일 연속 기록', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 98, emoji: '📅', name: '새해 첫 기록', desc: '1월 1일에 기록 작성', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 99, emoji: '🎄', name: '크리스마스 트래블러', desc: '12월 25일에 여행 기록', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 100, emoji: '🌃', name: '밤샘 여행기', desc: '자정~새벽 3시 사이 기록 작성 5회', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 101, emoji: '☔', name: '비 오는 날의 기록', desc: '날씨 \'비\'로 기록 10회', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 102, emoji: '❄️', name: '눈의 나라', desc: '날씨 \'눈\'으로 기록 5회', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 103, emoji: '🥰', name: '별점 후한 사람', desc: '별점 5점 기록 10개', earned: false, glow: 'rgba(168,85,247,0.6)' },
  { id: 104, emoji: '🧐', name: '까다로운 평론가', desc: '별점 1점 기록 3개', earned: false, glow: 'rgba(168,85,247,0.6)' },

  // 앱 활용 배지 (105 ~ 114)
  { id: 105, emoji: '🏷️', name: '스티커 수집가', desc: '스티커 전체 카테고리 사용', earned: false, glow: 'rgba(255,100,100,0.5)' },
  { id: 106, emoji: '🖼️', name: '프레임 마스터', desc: '앨범에서 3가지 프레임 모두 사용', earned: false, glow: 'rgba(255,100,100,0.5)' },
  { id: 107, emoji: '🎨', name: '지구본 커스텀', desc: '지구본 색상 변경 3회', earned: false, glow: 'rgba(255,100,100,0.5)' },
  { id: 108, emoji: '👤', name: '프로필 완성', desc: '프로필 사진+이름+소개 모두 설정', earned: false, glow: 'rgba(255,100,100,0.5)' },
  { id: 109, emoji: '🔔', name: '알림 수호자', desc: '알림 설정 커스텀 완료', earned: false, glow: 'rgba(255,100,100,0.5)' },
  { id: 110, emoji: '🚨', name: '첫 신고', desc: '부적절한 게시물 신고 1회', earned: false, glow: 'rgba(255,100,100,0.5)' },
  { id: 111, emoji: '📁', name: '정리의 달인', desc: '게시물 보관 10개', earned: false, glow: 'rgba(255,100,100,0.5)' },
  { id: 112, emoji: '🏃', name: '꾸준한 여행자', desc: '앱 연속 접속 30일 (Lv.1)', earned: false, glow: 'rgba(255,100,100,0.5)' },
  { id: 113, emoji: '💝', name: '충성 유저', desc: '앱 연속 접속 50일 (Lv.2)', earned: false, glow: 'rgba(255,100,100,0.5)' },
  { id: 114, emoji: '🔥', name: 'eOrth 마니아', desc: '앱 연속 접속 100일 (Lv.3)', earned: false, glow: 'rgba(255,100,100,0.5)' },

  // 특별 & 시즌 배지 (115 ~ 121)
  { id: 115, emoji: '🎂', name: 'eOrth 1주년', desc: '앱 설치 후 1년 경과', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 116, emoji: '🚀', name: '얼리어답터', desc: '앱 출시 첫 달 가입', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 117, emoji: '🎑', name: '명절 여행러', desc: '설날 또는 추석 연휴 중 해외 기록', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 118, emoji: '🌸', name: '벚꽃 시즌', desc: '3~4월 일본 방문 기록', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 119, emoji: '🍺', name: '옥토버페스트', desc: '10월 독일 방문 기록', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 120, emoji: '🎭', name: '카니발 참가자', desc: '2~3월 브라질 방문 기록', earned: false, glow: 'rgba(47,244,150,0.5)' },
  { id: 121, emoji: '🌌', name: '오로라 헌터', desc: '노르웨이/아이슬란드/핀란드 겨울 방문', earned: false, glow: 'rgba(47,244,150,0.5)' },

  // 122
  { id: 122, emoji: '🍔', name: '미식가', desc: '같은 나라 다른 도시 음식점 5곳 기록', earned: false, glow: 'rgba(255,100,100,0.5)' }
];

// ─── 여행 카드 그라디언트 색상 매핑 ───
const TRIP_GRADIENT_COLORS: Record<string, [string, string]> = {
  'trip-japan': ['rgba(221,183,255,0.2)', 'rgba(221,183,255,0)'],
  'trip-usa': ['rgba(137,206,255,0.2)', 'rgba(137,206,255,0)'],
  'trip-hongkong': ['rgba(47,217,244,0.2)', 'rgba(47,217,244,0)'],
  'trip-thailand': ['rgba(255,200,100,0.2)', 'rgba(255,200,100,0)'],
  'trip-spain': ['rgba(255,100,100,0.2)', 'rgba(255,100,100,0)'],
};

// ─── 배지 하이라이트 아이템 (리퀴드 구이 서클) ───
const BadgeHighlightItem = ({ emoji, name, glow, earned = true }: { emoji: string; name: string; glow?: string; earned?: boolean }) => (
  <LiquidPressable style={[badgeHL.item, !earned && { opacity: 0.6 }]} intensity={0.1}>
    <GooeyCircle size={64} color={glow || NEON.purple} glowOpacity={earned ? 0.5 : 0.12}>
      <NeonRing
        size={58}
        borderWidth={1.6}
        intensity={20}
        colors={earned ? [NEON.cyan, NEON.purple, NEON.magenta] : ['rgba(255,255,255,0.25)', 'rgba(255,255,255,0.1)']}
      >
        {earned ? (
          <Text style={badgeHL.emoji}>{emoji}</Text>
        ) : (
          <Text style={badgeHL.lockIcon}>🔒</Text>
        )}
      </NeonRing>
    </GooeyCircle>
  </LiquidPressable>
);

// ─── 배지 전체 목록 모달 ───
const getMetallicColors = (glow: string | undefined): [string, string, string, string] => {
  if (!glow) return ['#FFE072', '#CBA32E', '#FCE9A6', '#A67C1E']; // 골드 기본
  const g = glow.toLowerCase();
  if (g.includes('47,217,244') || g.includes('cyan')) {
    return ['#A5F3FC', '#06B6D4', '#CFFAFE', '#0891B2']; // 사이언
  }
  if (g.includes('168,85,247') || g.includes('purple')) {
    return ['#E9D5FF', '#A855F7', '#F3E8FF', '#7E22CE']; // 퍼플
  }
  if (g.includes('255,100,100') || g.includes('255,70,85') || g.includes('red')) {
    return ['#FECDD3', '#F43F5E', '#FFE4E6', '#BE123C']; // 레드/핑크
  }
  if (g.includes('47,244,150') || g.includes('green')) {
    return ['#A7F3D0', '#10B981', '#D1FAE5', '#047857']; // 그린
  }
  return ['#E2E8F0', '#94A3B8', '#F1F5F9', '#475569']; // 실버
};

const BADGE_CATEGORIES = [
  { name: '대륙 & 첫 방문 배지', range: [1, 8] },
  { name: '여행 동행 & 스타일 배지', range: [9, 15] },
  { name: '국가 & 지역 탐방 배지', range: [16, 34] },
  { name: '여행 마일스톤 배지', range: [35, 61] },
  { name: '시즌 & 기념일 배지', range: [62, 65] },
  { name: '기록 형식 배지', range: [66, 72] },
  { name: '소셜 배지', range: [73, 85] },
  { name: '스냅 특별 배지', range: [86, 90] },
  { name: '지구본 & 탐험 배지', range: [91, 96] },
  { name: '기록 습관 배지', range: [97, 104] },
  { name: '앱 활용 배지', range: [105, 114] },
  { name: '특별 & 시즌 배지', range: [115, 122] },
];

function BadgeListModal({
  visible,
  onClose,
  selectedBadgeIds,
  setSelectedBadgeIds,
}: {
  visible: boolean;
  onClose: () => void;
  selectedBadgeIds: number[];
  setSelectedBadgeIds: React.Dispatch<React.SetStateAction<number[]>>;
}) {
  const earnedCount = BADGES.filter((b) => b.earned).length;

  const handleToggleSelect = (badgeId: number, isEarned: boolean) => {
    if (!isEarned) return; // 미획득 배지는 선택 불가
    setSelectedBadgeIds((prev) => {
      if (prev.includes(badgeId)) {
        return prev.filter((id) => id !== badgeId);
      } else {
        if (prev.length >= 5) {
          Alert.alert('알림', '대표 배지는 최대 5개까지 선택할 수 있어요.');
          return prev;
        }
        return [...prev, badgeId];
      }
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={blStyles.root}>
        {/* 핸들 바 */}
        <View style={blStyles.handle} />
        
        <View style={blStyles.header}>
          <Text style={blStyles.title}>나의 배지 컬렉션</Text>
          <Text style={blStyles.subtitle}>
            {earnedCount} / {BADGES.length} 획득 (프로필에 표시할 배지 선택)
          </Text>
        </View>

        <View style={blStyles.binderWrapper}>
          <ScrollView
            showsVerticalScrollIndicator={false}
          >
            {BADGE_CATEGORIES.map((cat) => {
              const catBadges = BADGES.filter(
                (b) => b.id >= cat.range[0] && b.id <= cat.range[1]
              );
              // Group into rows of 3
              const rows = [];
              for (let i = 0; i < catBadges.length; i += 3) {
                rows.push(catBadges.slice(i, i + 3));
              }

              return (
                <View key={cat.name} style={blStyles.categorySection}>
                  <Text style={blStyles.categoryTitle}>{cat.name}</Text>
                  {rows.map((row, rowIndex) => (
                    <View key={rowIndex} style={blStyles.row}>
                      {row.map((badge, index) => {
                        const isEarned = badge.earned;
                        const isSelected = selectedBadgeIds.includes(badge.id);
                        const metallicColors = getMetallicColors(badge.glow);

                        return (
                          <TouchableOpacity
                            key={badge.id}
                            style={[blStyles.cell, { marginRight: index === 2 ? 0 : 12 }]}
                            activeOpacity={isEarned ? 0.75 : 1}
                            onPress={() => handleToggleSelect(badge.id, isEarned)}
                          >
                            {isEarned ? (
                              /* 획득한 메탈릭 코인 */
                              <View style={blStyles.coinWrapper}>
                                <LinearGradient
                                  colors={metallicColors}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 1, y: 1 }}
                                  style={blStyles.coinBorder}
                                >
                                  <LinearGradient
                                    colors={['#1E1B13', '#3A3525']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={blStyles.coinInner}
                                  >
                                    <Text style={blStyles.coinEmoji}>{badge.emoji}</Text>
                                  </LinearGradient>
                                </LinearGradient>
                                {/* 메탈릭 광택 */}
                                <LinearGradient
                                  colors={['rgba(255,255,255,0.4)', 'transparent', 'rgba(0,0,0,0.35)']}
                                  start={{ x: 0.1, y: 0.1 }}
                                  end={{ x: 0.9, y: 0.9 }}
                                  style={blStyles.coinShine}
                                  pointerEvents="none"
                                />
                                {/* 선택 체크 뱃지 */}
                                {isSelected && (
                                  <View style={blStyles.checkBadge}>
                                    <Text style={blStyles.checkText}>✓</Text>
                                  </View>
                                )}
                              </View>
                            ) : (
                              /* 미획득 구멍 */
                              <View style={blStyles.emptyHole}>
                                <LinearGradient
                                  colors={['#07070B', '#111116']}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 0, y: 1 }}
                                  style={blStyles.emptyHoleInner}
                                >
                                  <Text style={blStyles.lockIcon}>🔒</Text>
                                </LinearGradient>
                              </View>
                            )}
                            
                            <Text style={[blStyles.cellName, !isEarned && blStyles.lockedText]} numberOfLines={1}>
                              {badge.name}
                            </Text>
                            <Text style={[blStyles.cellDesc, !isEarned && blStyles.lockedText]} numberOfLines={2}>
                              {isEarned ? badge.desc : '미획득 배지'}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </View>
              );
            })}
          </ScrollView>
        </View>

        <TouchableOpacity style={blStyles.closeBtn} onPress={onClose} activeOpacity={0.8}>
          <Text style={blStyles.closeBtnText}>닫기</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── 프로필 편집 모달 ───
function EditProfileModal({
  visible,
  currentName,
  currentPhoto,
  onSave,
  onClose,
}: {
  visible: boolean;
  currentName: string;
  currentPhoto: string | null;
  onSave: (name: string, photo: string | null) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(currentName);
  const [photo, setPhoto] = useState<string | null>(currentPhoto);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showPermissionDeniedAlert('갤러리');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0].uri);
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('알림', '닉네임을 입력해주세요.');
      return;
    }
    onSave(name.trim(), photo);
    onClose();
  };

  // 모달이 열릴 때마다 현재 값으로 초기화
  React.useEffect(() => {
    if (visible) {
      setName(currentName);
      setPhoto(currentPhoto);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalRoot}
      >
        {/* 헤더 */}
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.modalCancelBtn}>
            <Text style={styles.modalCancelText}>취소</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>프로필 편집</Text>
          <TouchableOpacity onPress={handleSave} style={styles.modalSaveBtn}>
            <Text style={styles.modalSaveText}>저장</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.modalContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 프로필 사진 */}
          <View style={styles.modalAvatarSection}>
            <TouchableOpacity onPress={pickImage} activeOpacity={0.8} style={styles.modalAvatarWrap}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.modalAvatarImg} />
              ) : (
                <View style={styles.modalAvatarPlaceholder}>
                  <PersonIcon size={50} color="#A0A0B0" />
                </View>
              )}
              {/* 편집 뱃지 */}
              <View style={styles.editBadge}>
                <Text style={styles.editBadgeText}>📷</Text>
              </View>
            </TouchableOpacity>
            <Text style={styles.modalAvatarHint}>탭하여 사진 변경</Text>
          </View>

          {/* 닉네임 입력 */}
          <View style={styles.modalField}>
            <Text style={styles.modalFieldLabel}>닉네임</Text>
            <View style={styles.modalInputWrap}>
              <TextInput
                style={styles.modalInput}
                value={name}
                onChangeText={setName}
                placeholder="닉네임을 입력하세요"
                placeholderTextColor={COLORS.textMuted}
                maxLength={20}
                autoCorrect={false}
              />
              <Text style={styles.modalCharCount}>{name.length}/20</Text>
            </View>
          </View>

          {/* 저장 버튼 (하단 대형) */}
          <TouchableOpacity style={styles.modalSaveLargeBtn} onPress={handleSave} activeOpacity={0.85}>
            <Text style={styles.modalSaveLargeText}>저장하기</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── 사진 전체화면 뷰어 ───
function PhotoViewerModal({
  visible,
  photoUri,
  onClose,
}: {
  visible: boolean;
  photoUri: string;
  onClose: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const currentScale = useRef(1);
  const lastDistance = useRef(0);

  useEffect(() => {
    if (!visible) {
      currentScale.current = 1;
      scale.setValue(1);
    }
  }, [visible]);

  const getDistance = (touches: any[]) => {
    const [t1, t2] = touches;
    return Math.sqrt(
      Math.pow(t2.pageX - t1.pageX, 2) + Math.pow(t2.pageY - t1.pageY, 2)
    );
  };

  const pinchResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        if (evt.nativeEvent.touches.length === 2) {
          lastDistance.current = getDistance([...evt.nativeEvent.touches]);
        }
      },
      onPanResponderMove: (evt) => {
        if (evt.nativeEvent.touches.length === 2) {
          const dist = getDistance([...evt.nativeEvent.touches]);
          if (lastDistance.current > 0) {
            const ratio = dist / lastDistance.current;
            const next = Math.max(1, Math.min(4, currentScale.current * ratio));
            currentScale.current = next;
            scale.setValue(next);
          }
          lastDistance.current = dist;
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        lastDistance.current = 0;
        if (currentScale.current < 1) {
          currentScale.current = 1;
          Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={pvStyles.container}>
        {/* 배경 탭으로 닫기 */}
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        {/* 이미지 (핀치 줌) */}
        <View
          style={[pvStyles.imageWrap, { width: SCREEN_W, height: SCREEN_H }]}
          {...pinchResponder.panHandlers}
        >
          <Animated.Image
            source={{ uri: photoUri }}
            style={[pvStyles.image, { width: SCREEN_W, height: SCREEN_H, transform: [{ scale }] }]}
            resizeMode="contain"
          />
        </View>
        {/* X 버튼 */}
        <TouchableOpacity style={pvStyles.closeBtn} onPress={onClose}>
          <Text style={pvStyles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── 아바타 액션 시트 ───
function AvatarActionSheet({
  visible,
  hasPhoto,
  onClose,
  onViewPhoto,
  onChangePhoto,
  onDeletePhoto,
}: {
  visible: boolean;
  hasPhoto: boolean;
  onClose: () => void;
  onViewPhoto: () => void;
  onChangePhoto: () => void;
  onDeletePhoto: () => void;
}) {
  const translateY = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 12,
      }).start();
    } else {
      translateY.setValue(500);
    }
  }, [visible]);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={asStyles.overlay}>
        {/* 배경 탭으로 닫기 */}
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        {/* 바텀시트 */}
        <Animated.View style={[asStyles.sheet, { transform: [{ translateY }] }]}>
          {/* 핸들 바 */}
          <View style={asStyles.handle} />

          {/* 옵션 카드 */}
          <View style={asStyles.optionsCard}>
            {hasPhoto && (
              <>
                <TouchableOpacity
                  style={asStyles.option}
                  activeOpacity={0.7}
                  onPress={onViewPhoto}
                >
                  <Text style={asStyles.optionIcon}>📷</Text>
                  <Text style={asStyles.optionText}>사진 크게 보기</Text>
                </TouchableOpacity>
                <View style={asStyles.divider} />
              </>
            )}
            <TouchableOpacity
              style={asStyles.option}
              activeOpacity={0.7}
              onPress={onChangePhoto}
            >
              <Text style={asStyles.optionIcon}>✏️</Text>
              <Text style={asStyles.optionText}>프로필 사진 변경</Text>
            </TouchableOpacity>
            {hasPhoto && (
              <>
                <View style={asStyles.divider} />
                <TouchableOpacity
                  style={asStyles.option}
                  activeOpacity={0.7}
                  onPress={onDeletePhoto}
                >
                  <Text style={asStyles.optionIcon}>🗑️</Text>
                  <Text style={[asStyles.optionText, asStyles.deleteText]}>프로필 사진 삭제</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* 취소 카드 */}
          <TouchableOpacity style={asStyles.cancelCard} activeOpacity={0.7} onPress={onClose}>
            <Text style={asStyles.cancelText}>취소</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── 드래그 핸들 ───
function DragHandle({
  onStart,
  onMove,
  onEnd,
}: {
  onStart: () => void;
  onMove: (dy: number) => void;
  onEnd: (dy: number) => void;
}) {
  const cbRef = useRef({ onStart, onMove, onEnd });
  cbRef.current = { onStart, onMove, onEnd };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => cbRef.current.onStart(),
      onPanResponderMove: (_, { dy }) => cbRef.current.onMove(dy),
      onPanResponderRelease: (_, { dy }) => cbRef.current.onEnd(dy),
      onPanResponderTerminate: (_, { dy }) => cbRef.current.onEnd(dy),
    })
  ).current;
  return (
    <View {...pan.panHandlers} style={orderSt.handle}>
      <Text style={orderSt.handleIcon}>⠿</Text>
    </View>
  );
}

// ─── 순서 조정 리스트 ───
const ITEM_H = 64;
type TripItem = { id: string; emoji: string; country: string; color: string; viewType: string };

function OrderableList({
  records,
  onReorder,
}: {
  records: TripItem[];
  onReorder: (newRecords: TripItem[]) => void;
}) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const dragOffset = useRef(new Animated.Value(0)).current;
  const activeIdxRef = useRef<number | null>(null);
  const recordsRef = useRef(records);
  recordsRef.current = records;

  const handleDragStart = (idx: number) => {
    activeIdxRef.current = idx;
    setActiveIdx(idx);
    dragOffset.setValue(0);
  };

  const handleDragMove = (idx: number, dy: number) => {
    if (activeIdxRef.current !== idx) return;
    dragOffset.setValue(dy);
  };

  const handleDragEnd = (idx: number, dy: number) => {
    if (activeIdxRef.current !== idx) return;
    const recs = recordsRef.current;
    const newIdx = Math.max(0, Math.min(recs.length - 1, idx + Math.round(dy / ITEM_H)));
    if (newIdx !== idx) {
      const newOrder = [...recs];
      const [removed] = newOrder.splice(idx, 1);
      newOrder.splice(newIdx, 0, removed);
      onReorder(newOrder);
    }
    activeIdxRef.current = null;
    setActiveIdx(null);
    dragOffset.setValue(0);
  };

  return (
    <View>
      {records.map((record, idx) => {
        const isActive = activeIdx === idx;
        return (
          <Animated.View
            key={record.id}
            style={[
              orderSt.item,
              isActive && {
                opacity: 0.85,
                transform: [{ translateY: dragOffset }, { scale: 1.02 }],
                zIndex: 10,
                elevation: 6,
              },
            ]}
          >
            <Text style={orderSt.emoji}>{record.emoji}</Text>
            <View style={orderSt.info}>
              <Text style={orderSt.name}>{record.country}</Text>
            </View>
            <DragHandle
              onStart={() => handleDragStart(idx)}
              onMove={(dy) => handleDragMove(idx, dy)}
              onEnd={(dy) => handleDragEnd(idx, dy)}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}



// ─── 여행 기록 그리드 레이아웃 좌표 계산 유틸 ───
function getCardLayout(idx: number): { x: number; y: number; w: number; h: number } {
  if (idx === 0) {
    return { x: 0, y: 0, w: SCREEN_WIDTH - 32, h: 260 };
  }
  const gridIdx = idx - 1;
  const row = Math.floor(gridIdx / 2);
  const col = gridIdx % 2;
  const cardW = THUMB_WIDTH;
  const cardH = 210;
  const gap = 12;
  const x = col * (cardW + gap);
  const y = 260 + 12 + row * (cardH + gap);
  return { x, y, w: cardW, h: cardH };
}

// ─── 인라인 카드 드래그 제스처 래핑 컴포넌트 ───
interface DraggableCardWrapperProps {
  idx: number;
  activeIdx: number | null;
  dragOffset: Animated.ValueXY;
  onDragStart: (idx: number) => void;
  onDragMove: (idx: number, dx: number, dy: number) => void;
  onDragEnd: (idx: number, dx: number, dy: number) => void;
  onPress: () => void;
  children: React.ReactNode;
  style: any;
}

function DraggableCardWrapper({
  idx,
  activeIdx,
  dragOffset,
  onDragStart,
  onDragMove,
  onDragEnd,
  onPress,
  children,
  style,
}: DraggableCardWrapperProps) {
  const isDraggingRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => isDraggingRef.current,
      onPanResponderGrant: (evt, gestureState) => {
        isDraggingRef.current = false;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          isDraggingRef.current = true;
          onDragStart(idx);
        }, 400);
      },
      onPanResponderMove: (evt, gestureState) => {
        if (isDraggingRef.current) {
          onDragMove(idx, gestureState.dx, gestureState.dy);
        } else {
          if (Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10) {
            if (timerRef.current) {
              clearTimeout(timerRef.current);
              timerRef.current = null;
            }
          }
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          onDragEnd(idx, gestureState.dx, gestureState.dy);
        } else {
          onPress();
        }
      },
      onPanResponderTerminate: (evt, gestureState) => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          onDragEnd(idx, gestureState.dx, gestureState.dy);
        }
      },
      onPanResponderTerminationRequest: () => !isDraggingRef.current,
    })
  ).current;

  const isActive = activeIdx === idx;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        style,
        isActive && {
          transform: [
            { translateX: dragOffset.x },
            { translateY: dragOffset.y },
            { scale: 1.05 }
          ],
          zIndex: 1000,
          elevation: 12,
          shadowColor: '#BF85FC',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.5,
          shadowRadius: 20,
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// ─── 묶음 설정 모달 ───
function GroupMergeModal({
  visible,
  selectedRecords,
  onClose,
  onSave,
}: {
  visible: boolean;
  selectedRecords: TripItem[];
  onClose: () => void;
  onSave: (title: string, coverRecordId: string, ordered: TripItem[]) => void;
}) {
  const [title, setTitle] = useState('');
  const [cover, setCover] = useState(selectedRecords[0]?.id ?? '');
  const [ordered, setOrdered] = useState<TripItem[]>([...selectedRecords]);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setCover(selectedRecords[0]?.id ?? '');
      setOrdered([...selectedRecords]);
    }
  }, [visible]);

  const handleSave = () => {
    if (!title.trim()) {
      Alert.alert('알림', '묶음 이름을 입력해주세요.');
      return;
    }
    onSave(title.trim(), cover, ordered);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={gmSt.sheet}>
          <View style={gmSt.handle} />
          <Text style={gmSt.sheetTitle}>묶음 설정</Text>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* 묶음 제목 */}
            <Text style={gmSt.sectionLabel}>묶음 제목</Text>
            <View style={gmSt.inputWrap}>
              <TextInput
                style={gmSt.input}
                value={title}
                onChangeText={setTitle}
                placeholder="여행 묶음 이름을 입력해주세요"
                placeholderTextColor={COLORS.textMuted}
                maxLength={30}
              />
            </View>
            <Text style={gmSt.inputHint}>예시: "유럽 3개국 여행", "일본 두 번째 방문"</Text>

            {/* 대표 기록 선택 */}
            <Text style={gmSt.sectionLabel}>대표 기록</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={gmSt.coverScroll}
              contentContainerStyle={gmSt.coverContent}
              nestedScrollEnabled
            >
              {ordered.map((record) => (
                <TouchableOpacity
                  key={record.id}
                  style={gmSt.coverThumb}
                  onPress={() => setCover(record.id)}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      gmSt.thumbBg,
                      { backgroundColor: record.color },
                      cover === record.id && { borderColor: '#BF85FC' },
                    ]}
                  >
                    <Text style={gmSt.thumbEmoji}>{record.emoji}</Text>
                    {cover === record.id && (
                      <View style={gmSt.coverCheckBadge}>
                        <Text style={gmSt.coverCheckText}>✓</Text>
                      </View>
                    )}
                  </View>
                  <Text style={gmSt.thumbLabel} numberOfLines={1}>
                    {record.country.split(' ').slice(1).join(' ')}
                  </Text>
                  {cover !== record.id && (
                    <Text style={gmSt.setAsLabel}>대표로 설정</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* 기록 순서 조정 */}
            <Text style={gmSt.sectionLabel}>기록 순서</Text>
            <OrderableList records={ordered} onReorder={setOrdered} />

            {/* 저장 */}
            <TouchableOpacity style={gmSt.saveBtn} onPress={handleSave} activeOpacity={0.85}>
              <Text style={gmSt.saveBtnText}>저장하기</Text>
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const COUNTRY_DATA: Record<string, { name: string; flag: string }> = {
  KR: { name: '대한민국', flag: '🇰🇷' },
  JP: { name: '일본', flag: '🇯🇵' },
  US: { name: '미국', flag: '🇺🇸' },
  HK: { name: '홍콩', flag: '🇭🇰' },
  TH: { name: '태국', flag: '🇹🇭' },
  ES: { name: '스페인', flag: '🇪🇸' },
};

// ─── 메인 프로필 화면 ───
export default function ProfileScreen({ navigation }: TabScreenProps<'ProfileTab'>) {
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [badgeListVisible, setBadgeListVisible] = useState(false);
  const [selectedBadgeIds, setSelectedBadgeIds] = useState<number[]>(() => {
    return BADGES.filter((b) => b.earned).slice(0, 5).map((b) => b.id);
  });

  // ─── 여행 기록 순서 편집 상태 ───
  const [trips, setTrips] = useState<TripThumbnail[]>(() => {
    return [...CURRENT_TRIP_THUMBNAILS];
  });
  const [isDragging, setIsDragging] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const dragOffset = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const handleReorder = (newTrips: TripThumbnail[]) => {
    CURRENT_TRIP_THUMBNAILS = newTrips;
    setTrips(newTrips);
  };

  const handleDragStart = (idx: number) => {
    setActiveIdx(idx);
    dragOffset.setValue({ x: 0, y: 0 });
    setIsDragging(true);
  };

  const handleDragMove = (idx: number, dx: number, dy: number) => {
    dragOffset.setValue({ x: dx, y: dy });
  };

  const handleDragEnd = (idx: number, dx: number, dy: number) => {
    setIsDragging(false);
    setActiveIdx(null);
    dragOffset.setValue({ x: 0, y: 0 });

    const layout = getCardLayout(idx);
    const dropCenterX = layout.x + layout.w / 2 + dx;
    const dropCenterY = layout.y + layout.h / 2 + dy;

    let targetIdx = -1;
    for (let i = 0; i < trips.length; i++) {
      const targetLayout = getCardLayout(i);
      const left = targetLayout.x;
      const right = targetLayout.x + targetLayout.w;
      const top = targetLayout.y;
      const bottom = targetLayout.y + targetLayout.h;

      if (
        dropCenterX >= left &&
        dropCenterX <= right &&
        dropCenterY >= top &&
        dropCenterY <= bottom
      ) {
        targetIdx = i;
        break;
      }
    }

    if (targetIdx !== -1 && targetIdx !== idx) {
      const newTrips = [...trips];
      const [removed] = newTrips.splice(idx, 1);
      newTrips.splice(targetIdx, 0, removed);
      handleReorder(newTrips);
    }
  };

  const { 
    nickname, 
    handle, 
    bio, 
    profilePhoto, 
    setProfilePhoto,
    homeCountryCode,
    arrivalDetect,
    currentVisitedCountryCode,
  } = useSettings();
  const profileName = nickname ? nickname : handle;

  const { records, tripGroups, archivedIds, followingUsers } = useRecords();

  const mappedThumbnails = useMemo(() => {
    return tripGroups.map(group => {
      const groupRecords = group.records
        .map(id => records.find(r => r.id === id))
        .filter(Boolean)
        // 보관된 기록은 카드에서 제외 → 전부 보관되면 카드 자체가 숨겨진다
        .filter(r => !archivedIds.includes((r as NonNullable<typeof r>).id)) as typeof records;

      const firstRec = groupRecords[0];
      const coverRec = groupRecords.find(r => r.id === group.coverRecordId) ?? firstRec;
      const uniqueViewTypes = Array.from(new Set(groupRecords.map(r => r.viewType || 'feed')));

      // 카드가 `${countryFlag} ${title}`로 그리므로, 제목에 이미 국기가 박혀 있으면 떼어낸다
      // (과거에 "🇺🇸 미국 여행" 형식으로 저장된 그룹 대비 방어)
      const flag = firstRec?.countryFlag || '';
      const title = flag && group.title.startsWith(flag)
        ? group.title.slice(flag.length).trim()
        : group.title;

      return {
        id: group.id,
        emoji: firstRec?.user.emoji || '🗼',
        title,
        country: firstRec?.countryName || '',
        countryFlag: firstRec?.countryFlag || '',
        date: firstRec?.date ? firstRec.date.slice(0, 7) : '',
        color: TRIP_GRADIENT_COLORS[group.id] ? group.id : 'trip-japan',
        records: groupRecords.map(r => ({ id: r.id, viewType: r.viewType || 'feed' })),
        uniqueViewTypes,
        coverUri: coverRec?.representativePhoto ?? coverRec?.medias?.[0], // 위치 조정 크롭본 우선, 없으면 선택 썸네일(medias[0])
      };
    }).filter(t => t.records.length > 0);
  }, [tripGroups, records, archivedIds]);

  // import/기록 기반 여행 카드(mappedThumbnails)를 맨 앞에 병합
  // → 새로 만든 카드가 기본으로 큰 메인 카드 자리를 차지하고, 기존 카드는 그리드로 밀린다
  const displayTrips = useMemo(
    () => [...mappedThumbnails, ...trips],
    [mappedThumbnails, trips]
  );

  const handleChangePhoto = async () => {
    setActionSheetVisible(false);

    // 권한 확인
    const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      if (!canAskAgain) {
        // 권한이 영구적으로 거부된 경우 → 설정 화면으로 유도
        Alert.alert(
          '갤러리 접근 권한 필요',
          '갤러리 접근 권한이 필요해요. 설정에서 권한을 허용해주세요.',
          [
            { text: '취소', style: 'cancel' },
            {
              text: '설정으로 이동',
              onPress: () => Linking.openSettings(),
            },
          ]
        );
      } else {
        Alert.alert('권한 필요', '갤러리 접근 권한이 필요해요.');
      }
      return;
    }

    // 갤러리 열기 (사진 유무와 관계없이 동일 흐름)
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setProfilePhoto(result.assets[0].uri);
    }
  };

  const handleDeletePhoto = () => {
    setActionSheetVisible(false);
    Alert.alert(
      '프로필 사진 삭제',
      '프로필 사진을 삭제할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => setProfilePhoto(null),
        },
      ]
    );
  };

  const handleViewPhoto = () => {
    setActionSheetVisible(false);
    setTimeout(() => setPhotoViewerVisible(true), 150);
  };

  const openTripDetail = (trip: TripThumbnail) => {
    navigation.navigate('TripDetail', { trip });
  };


  return (
    <View style={styles.safeArea}>
      {/* 배경 떠다니는 블롭들 */}
      <FloatingBlobs />

      {/* 상단 오로라 글로우 — 유리에 색이 비치도록(리퀴드 글래스 굴절감 강화) */}
      <LinearGradient
        colors={['rgba(168,85,247,0.24)', 'rgba(34,211,238,0.10)', 'transparent']}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={styles.auroraTop}
        pointerEvents="none"
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!isDragging}
      >
        {/* 상단 헤더 */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>프로필</Text>
          <LiquidPressable
            style={styles.settingBtn}
            onPress={() => navigation.navigate('Settings')}
            intensity={0.12}
          >
            <GlassFill intensity={28} />
            <GearIcon size={22} color="#A0A0B0" />
          </LiquidPressable>
        </View>

        {/* 프로필 헤더 (아바타 + 정보) */}
        <View style={styles.profileRow}>
          <GrainOverlay opacity={0.03} dotCount={60} />
          {/* 아바타 — 구이 이펙트 서클 */}
          <LiquidPressable onPress={() => setActionSheetVisible(true)} intensity={0.08}>
            <GooeyCircle size={104} color={NEON.purple} glowOpacity={0.6}>
              <LinearGradient
                colors={[NEON.cyan, NEON.purple, NEON.magenta]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarRing}
              >
                {profilePhoto ? (
                  <Image source={{ uri: profilePhoto }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatar}>
                    <PersonIcon size={44} color="#A0A0B0" />
                  </View>
                )}
              </LinearGradient>
            </GooeyCircle>
          </LiquidPressable>

          {/* 이름 · 위치 · 소개 · 통계 */}
          <View style={styles.profileInfo}>
            <Text style={styles.userName}>{profileName}</Text>
            {nickname ? <Text style={styles.userHandle}>@{handle}</Text> : null}
            <Text style={styles.userLocation}>
              {(() => {
                const home = COUNTRY_DATA[homeCountryCode] || { name: '대한민국', flag: '🇰🇷' };
                if (arrivalDetect && currentVisitedCountryCode && currentVisitedCountryCode !== homeCountryCode) {
                  const visit = COUNTRY_DATA[currentVisitedCountryCode] || { name: '일본', flag: '🇯🇵' };
                  return `${visit.flag} ${visit.name} 여행 중`;
                }
                return `${home.flag} ${home.name}`;
              })()}
            </Text>
            {bio ? <Text style={styles.userBio}>{bio}</Text> : null}
            <View style={styles.statsRow}>
              <StatCard value="8" label="기록 수" grad={STAT_GRADS[0]} />
              <StatCard value={String(followingUsers.length)} label="팔로잉" onPress={() => navigation.navigate('FollowingList')} grad={STAT_GRADS[1]} />
              <StatCard value="3" label="방문국가" grad={STAT_GRADS[2]} />
            </View>
          </View>
        </View>

        {/* 배지 하이라이트 (구이 서클) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={badgeHL.scroll}
          contentContainerStyle={badgeHL.scrollContent}
        >
          {selectedBadgeIds.map((id) => {
            const badge = BADGES.find(b => b.id === id);
            if (!badge) return null;
            return (
              <BadgeHighlightItem key={badge.id} emoji={badge.emoji} name={badge.name} glow={badge.glow} earned={badge.earned} />
            );
          })}
          <LiquidPressable
            style={badgeHL.item}
            onPress={() => setBadgeListVisible(true)}
            intensity={0.1}
          >
            <View style={badgeHL.moreCircle}>
              <Text style={badgeHL.moreText}>{'전체\n보기'}</Text>
            </View>
          </LiquidPressable>
        </ScrollView>

        <View style={styles.divider} />

        {/* 여행 기록 헤더 */}
        <View style={gridSt.gridHeaderRow}>
          <Text style={gridSt.gridHeaderTitle}>여행 기록</Text>
          <Text style={gridSt.tripCount}>{displayTrips.length}개의 여행</Text>
        </View>

        {displayTrips.length > 0 && (
          <DraggableCardWrapper
            idx={0}
            activeIdx={activeIdx}
            dragOffset={dragOffset}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onPress={() => openTripDetail(displayTrips[0])}
            style={thumbSt.mainCard}
          >
            {/* 출렁이는 글로우 배경 */}
            <LiquidCardGlow
              width={SCREEN_WIDTH}
              height={320}
              color={displayTrips[0].id === 'trip-japan' ? '#DDB7FF' : '#A855F7'}
              opacity={0.34}
            />
            <LinearGradient
              colors={TRIP_GRADIENT_COLORS[displayTrips[0].id] || ['rgba(221,183,255,0.2)', 'rgba(221,183,255,0)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {/* 썸네일 사진(import 시 선택) — 있으면 사진 배경, 없으면 기존 이모지 */}
            {displayTrips[0].coverUri ? (
              <>
                <Image source={{ uri: displayTrips[0].coverUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <LinearGradient
                  colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']}
                  style={StyleSheet.absoluteFill}
                />
                {/* flex:1 스페이서 — 정보 바(블러)를 하단으로 밀어준다 */}
                <View style={thumbSt.mainEmojiWrap} />
              </>
            ) : (
              <View style={thumbSt.mainEmojiWrap}>
                <Text style={thumbSt.mainEmoji}>{displayTrips[0].emoji}</Text>
              </View>
            )}
            <BlurView
              intensity={48}
              tint="dark"
              experimentalBlurMethod="dimezisBlurView"
              style={thumbSt.mainInfoBar}
            >
              <View style={{ flex: 1 }}>
                <Text style={thumbSt.mainTitle}>{displayTrips[0].countryFlag} {displayTrips[0].title}</Text>
                <Text style={thumbSt.mainDate}>{displayTrips[0].date}</Text>
              </View>
              <View style={thumbSt.mainBadges}>
                {displayTrips[0].records.map((rec) => (
                  <LiquidPressable key={rec.id} style={thumbSt.mainBadge} intensity={0.15}>
                    {VIEW_TYPE_BADGE[rec.viewType] || null}
                  </LiquidPressable>
                ))}
              </View>
            </BlurView>
          </DraggableCardWrapper>
        )}

        {/* 여행 썸네일 - 그리드 카드 (2열 + 리퀴드 프레스 + 글로우) */}
        <View style={thumbSt.grid}>
          {displayTrips.slice(1).map((trip, sliceIdx) => {
            const idx = sliceIdx + 1;
            return (
              <DraggableCardWrapper
                key={trip.id}
                idx={idx}
                activeIdx={activeIdx}
                dragOffset={dragOffset}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onPress={() => openTripDetail(trip)}
                style={thumbSt.gridCard}
              >
                {/* 출렁이는 글로우 */}
                <LiquidCardGlow
                  width={THUMB_WIDTH}
                  height={260}
                  color={TRIP_GRADIENT_COLORS[trip.id]?.[0]?.replace(/[,\s]0\.\d+\)/, ',1)') || '#A855F7'}
                  opacity={0.3}
                />
                <LinearGradient
                  colors={TRIP_GRADIENT_COLORS[trip.id] || ['rgba(221,183,255,0.2)', 'rgba(221,183,255,0)']}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                {/* 썸네일 사진(import 시 선택) — 있으면 사진 배경, 없으면 기존 이모지 */}
                {trip.coverUri ? (
                  <>
                    <Image source={{ uri: trip.coverUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    <LinearGradient
                      colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']}
                      style={StyleSheet.absoluteFill}
                    />
                    {/* flex:1 스페이서 — 정보 바(블러)를 하단으로 밀어준다 */}
                    <View style={thumbSt.gridEmojiWrap} />
                  </>
                ) : (
                  <View style={thumbSt.gridEmojiWrap}>
                    <Text style={thumbSt.gridEmoji}>{trip.emoji}</Text>
                  </View>
                )}
                <BlurView
                  intensity={44}
                  tint="dark"
                  experimentalBlurMethod="dimezisBlurView"
                  style={thumbSt.gridInfoBar}
                >
                  <Text style={thumbSt.gridTitle}>{trip.countryFlag} {trip.title}</Text>
                  <Text style={thumbSt.gridDate}>{trip.date}</Text>
                  <View style={thumbSt.gridBadges}>
                    {trip.records.map((rec) => (
                      <LiquidPressable key={rec.id} style={thumbSt.gridBadge} intensity={0.15}>
                        {VIEW_TYPE_BADGE[rec.viewType] || null}
                      </LiquidPressable>
                    ))}
                  </View>
                </BlurView>
              </DraggableCardWrapper>
            );
          })}
        </View>

      </ScrollView>


      {/* 아바타 액션 시트 */}
      <AvatarActionSheet
        visible={actionSheetVisible}
        hasPhoto={!!profilePhoto}
        onClose={() => setActionSheetVisible(false)}
        onViewPhoto={handleViewPhoto}
        onChangePhoto={handleChangePhoto}
        onDeletePhoto={handleDeletePhoto}
      />

      {/* 사진 전체화면 뷰어 */}
      {profilePhoto && (
        <PhotoViewerModal
          visible={photoViewerVisible}
          photoUri={profilePhoto}
          onClose={() => setPhotoViewerVisible(false)}
        />
      )}

      {/* 배지 전체 목록 모달 */}
      <BadgeListModal
        visible={badgeListVisible}
        onClose={() => setBadgeListVisible(false)}
        selectedBadgeIds={selectedBadgeIds}
        setSelectedBadgeIds={setSelectedBadgeIds}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  auroraTop: {
    position: 'absolute',
    top: -60,
    left: -40,
    right: -40,
    height: 380,
  },

  // 헤더
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 56,
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  settingBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(46,46,59,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
  },

  // 프로필 헤더 행 (아바타 + 정보)
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 14,
    paddingVertical: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#1F1F22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(168,85,247,0.6)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 10,
  },
  avatarImg: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: 'rgba(168,85,247,0.6)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 10,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  profileInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  userName: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 2,
    textShadowColor: 'rgba(191,133,252,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  userHandle: {
    fontSize: 13,
    color: COLORS.purpleNeon,
    marginBottom: 2,
  },
  userLocation: {
    fontSize: 12,
    color: '#CFC2D6',
    letterSpacing: 0.6,
  },
  userBio: {
    fontSize: 12,
    color: '#A1A1B0',
    marginTop: 6,
    lineHeight: 16,
  },

  // 통계 행
  statsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  statCard: {
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    overflow: 'hidden',
  },
  statCardContent: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  avatarRing: {
    width: 102,
    height: 102,
    borderRadius: 51,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 1,
  },
  statLabel: {
    fontSize: 10,
    color: '#CFC2D6',
    letterSpacing: 0.4,
  },
  followingExpandedWrap: {
    marginTop: 8,
    backgroundColor: '#1A1A26',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },

  // 구분선
  divider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginHorizontal: -16,
    marginBottom: 7,
  },
  friendsSectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.purpleNeon,
    marginBottom: 8,
    marginTop: 8,
  },
  friendBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  friendBarAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.purpleDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendBarInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
  friendBarUsername: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.purpleNeon,
  },
  friendBarAbroad: {
    fontSize: 12,
    color: COLORS.purpleNeon,
    marginTop: 2,
  },
  friendBarHome: {
    fontSize: 12,
    color: COLORS.textDim,
    marginTop: 2,
  },
  itemDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginLeft: 48,
  },
  itemDividerFull: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginLeft: 80,
  },

  // 섹션 라벨
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.purpleNeon,
    marginBottom: 10,
  },
  groupLabel: {
    fontSize: 10,
    color: COLORS.textDim,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },

  // 여행 아이템
  tripItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  tripThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: COLORS.purpleThumb,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripEmoji: {
    fontSize: 20,
  },
  tripInfo: {
    flex: 1,
    gap: 2,
  },
  tripCountry: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
  },
  tripDate: {
    fontSize: 10,
    color: COLORS.textDim,
  },
  tripStars: {
    fontSize: 10,
    color: COLORS.purpleNeon,
  },

  // 획득 배지
  badgesScroll: {
    marginBottom: 4,
  },
  badgesContent: {
    gap: 10,
    paddingVertical: 4,
  },
  badgeCard: {
    width: 72,
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.2)',
  },
  badgeCardLocked: {
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: '#1A1A24',
  },
  badgeEmoji: {
    fontSize: 26,
  },
  badgeName: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textDim,
    textAlign: 'center',
  },
  badgeLock: {
    fontSize: 10,
  },

  // 프리미엄 배너
  premiumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.purpleBg,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
    borderRadius: 14,
    padding: 16,
    marginTop: 20,
    gap: 12,
  },
  premiumIcon: {
    fontSize: 24,
  },
  premiumInfo: {
    flex: 1,
  },
  premiumTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.purpleNeon,
    marginBottom: 2,
  },
  premiumSub: {
    fontSize: 11,
    color: COLORS.textDim,
  },

  // 설정 그룹
  settingGroup: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingIcon: {
    fontSize: 16,
    width: 24,
  },
  settingLabel: {
    fontSize: 13,
    color: COLORS.white,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  settingValue: {
    fontSize: 11,
    color: COLORS.textDim,
  },
  chevron: {
    fontSize: 18,
    color: COLORS.textMuted,
  },
  premiumBadge: {
    backgroundColor: 'rgba(107,33,168,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.3)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  premiumBadgeText: {
    fontSize: 9,
    color: COLORS.purpleNeon,
  },

  // 로그아웃
  logoutBtn: {
    backgroundColor: COLORS.redBg,
    borderWidth: 1,
    borderColor: COLORS.redBorder,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  logoutText: {
    fontSize: 14,
    color: COLORS.red,
  },

  // 버전
  versionText: {
    fontSize: 10,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 20,
  },

  // ─── 편집 모달 스타일 ───
  modalRoot: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  modalCancelBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  modalCancelText: {
    fontSize: 14,
    color: COLORS.textDim,
  },
  modalSaveBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  modalSaveText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.purpleNeon,
  },
  modalContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 48,
  },

  // 모달 아바타
  modalAvatarSection: {
    alignItems: 'center',
    marginBottom: 36,
  },
  modalAvatarWrap: {
    position: 'relative',
    marginBottom: 10,
  },
  modalAvatarPlaceholder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: COLORS.purpleDeep,
    borderWidth: 2,
    borderColor: 'rgba(191,133,252,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAvatarImg: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: 'rgba(191,133,252,0.5)',
  },
  modalAvatarText: {
    fontSize: 38,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  editBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.purpleDeep,
    borderWidth: 2,
    borderColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadgeText: {
    fontSize: 14,
  },
  modalAvatarHint: {
    fontSize: 12,
    color: COLORS.purpleNeon,
  },

  // 모달 입력 필드
  modalField: {
    marginBottom: 28,
  },
  modalFieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.purpleNeon,
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  modalInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.3)',
    paddingHorizontal: 16,
  },
  modalInput: {
    flex: 1,
    color: COLORS.white,
    fontSize: 15,
    paddingVertical: 15,
  },
  modalCharCount: {
    fontSize: 11,
    color: COLORS.textMuted,
  },

  // 모달 저장 버튼
  modalSaveLargeBtn: {
    backgroundColor: COLORS.purpleDeep,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  modalSaveLargeText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.purpleNeon,
  },
});

// ─── 사진 뷰어 스타일 ───
const pvStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    flex: 1,
  },
  closeBtn: {
    position: 'absolute',
    top: 56,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

// ─── 여행 기록 3열 그리드 스타일 ───
const gridSt = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    marginHorizontal: -16,
    marginBottom: 20,
  },
  cell: {
    width: CELL_SIZE,
    height: Math.floor(CELL_SIZE * 1.4),
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    position: 'relative',
  },
  cellEmoji: {
    fontSize: 36,
  },
  cellCountry: {
    fontSize: 11,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  typeBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  typeBadgeIcon: {
    fontSize: 12,
  },
  gridHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  gridHeaderTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  editBtnText: {
    fontSize: 14,
    color: '#BF85FC',
    fontWeight: '500',
  },
  tripCount: {
    fontSize: 12,
    color: '#A1A1B0',
  },
  checkbox: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2E2E3B',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#BF85FC',
    borderColor: '#BF85FC',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    lineHeight: 16,
  },
  selectedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(191,133,252,0.18)',
  },

  // ── 행 기반 그리드 ──
  rowContainer: {
    marginHorizontal: -16,
    marginBottom: 20,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    gap: 2,
  },

  // ── 묶음 셀 ──
  groupCell: {
    width: CELL_SIZE * 2 + 2,
    height: Math.floor(CELL_SIZE * 1.4),
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  groupCoverEmoji: {
    fontSize: 44,
  },
  groupOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    paddingRight: 34,
    gap: 2,
  },
  groupFlags: {
    fontSize: 13,
    color: '#FFFFFF',
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  groupBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  groupBadgeIcon: {
    fontSize: 13,
  },
});

// ─── 배지 하이라이트 스타일 ───
const badgeHL = StyleSheet.create({
  scroll: {
    marginBottom: 7,
    height: 88,
  },
  scrollContent: {
    paddingLeft: 16,
    paddingRight: 8,
    gap: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  item: {
    alignItems: 'center',
    width: 60,
  },
  glassCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 8,
    elevation: 10,
  },
  glassCircleGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  emoji: {
    fontSize: 24,
  },
  lockIcon: {
    fontSize: 22,
  },
  name: {
    fontSize: 12,
    color: '#CFC2D6',
    textAlign: 'center',
  },
  moreCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    fontSize: 11,
    color: '#BF85FC',
    textAlign: 'center',
    lineHeight: 15,
  },
});

// ─── 배지 전체 목록 모달 스타일 ───
const blStyles = StyleSheet.create({
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
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#BF85FC',
    fontWeight: '600',
  },
  binderWrapper: {
    flex: 1,
    marginHorizontal: 16,
    backgroundColor: '#151522', // 앨범 내지 보드 색상 (동전 케이스 느낌의 플라스틱/가죽 질감 톤)
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 16,
    // 보드 판 입체감을 위한 그림자
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 16,
  },
  cell: {
    width: Math.floor((SCREEN_WIDTH - 32 - 32 - 24) / 3) - 1, // 3열 정렬 (소수점 올림 wrap 방지)
    alignItems: 'center',
  },
  categorySection: {
    marginBottom: 24,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#BF85FC',
    marginBottom: 12,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  coinWrapper: {
    width: 66,
    height: 66,
    borderRadius: 33,
    position: 'relative',
    marginBottom: 8,
    // 메탈릭 입체감 그림자 (양각)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 5,
  },
  coinBorder: {
    width: '100%',
    height: '100%',
    borderRadius: 33,
    padding: 3, // 테두리 링 두께
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinInner: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinEmoji: {
    fontSize: 26,
  },
  coinShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 33,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  checkBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#BF85FC',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  checkText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyHole: {
    width: 66,
    height: 66,
    borderRadius: 33,
    padding: 2.5,
    backgroundColor: '#0D0D14', // 음각 어두운 테두리
    marginBottom: 8,
    // 구멍 입체감 그림자 (음각)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 3,
    elevation: 2,
  },
  emptyHoleInner: {
    width: '100%',
    height: '100%',
    borderRadius: 30.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIcon: {
    fontSize: 16,
    opacity: 0.35,
  },
  cellName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 2,
  },
  cellDesc: {
    fontSize: 10,
    color: '#A1A1B0',
    textAlign: 'center',
    lineHeight: 13,
    paddingHorizontal: 4,
  },
  lockedText: {
    color: 'rgba(255,255,255,0.25)',
  },
  closeBtn: {
    margin: 16,
    marginTop: 8,
    backgroundColor: '#2E2E3B',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});

// ─── 썸네일 그리드 스타일 ───
const thumbSt = StyleSheet.create({
  // 메인 카드 (첫 번째 여행)
  mainCard: {
    width: '100%',
    height: 260,
    borderRadius: 32,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 12,
  },
  mainEmojiWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainEmoji: {
    fontSize: 72,
  },
  mainInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(14,14,17,0.16)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 20,
    paddingVertical: 16,
    overflow: 'hidden',
  },
  mainTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  mainDate: {
    fontSize: 12,
    color: '#CFC2D6',
    marginTop: 2,
  },
  mainBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  mainBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.42)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  // 그리드 카드 (나머지 여행들)
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  gridCard: {
    width: THUMB_WIDTH,
    height: 210,
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  gridEmojiWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridEmoji: {
    fontSize: 48,
  },
  gridInfoBar: {
    backgroundColor: 'rgba(14,14,17,0.16)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
    overflow: 'hidden',
  },
  gridTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  gridDate: {
    fontSize: 12,
    color: '#CFC2D6',
  },
  gridBadges: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  gridBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.42)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});

// ─── 여행 상세 모달 스타일 ───
const detailSt = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1E1E2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: 'rgba(191,133,252,0.2)',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3A55',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#A1A1B0',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  list: {
    gap: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A3A',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(191,133,252,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemEmoji: {
    fontSize: 22,
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemType: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  itemDesc: {
    fontSize: 12,
    color: '#A1A1B0',
  },
  itemArrow: {
    fontSize: 22,
    color: '#BF85FC',
    fontWeight: '300',
  },
});

// ─── 묶음 설정 모달 스타일 ───
const gmSt = StyleSheet.create({
  sheet: {
    backgroundColor: '#1E1E2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderTopColor: 'rgba(191,133,252,0.2)',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3A55',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#BF85FC',
    marginBottom: 10,
    marginTop: 20,
    letterSpacing: 0.3,
  },
  inputWrap: {
    backgroundColor: '#2A2A3A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.25)',
    paddingHorizontal: 14,
  },
  input: {
    color: '#FFFFFF',
    fontSize: 15,
    paddingVertical: 13,
  },
  inputHint: {
    fontSize: 11,
    color: '#A1A1B0',
    marginTop: 6,
  },
  coverScroll: {
    marginBottom: 4,
  },
  coverContent: {
    gap: 12,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  coverThumb: {
    width: 72,
    alignItems: 'center',
    gap: 5,
  },
  thumbBg: {
    width: 72,
    height: 72,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  thumbEmoji: {
    fontSize: 28,
  },
  coverCheckBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#BF85FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverCheckText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
    lineHeight: 14,
  },
  thumbLabel: {
    fontSize: 10,
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '600',
  },
  setAsLabel: {
    fontSize: 9,
    color: '#BF85FC',
    textAlign: 'center',
  },
  saveBtn: {
    backgroundColor: '#6B21A8',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});

// ─── 순서 조정 리스트 스타일 ───
const orderSt = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A3A',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    gap: 12,
  },
  emoji: {
    fontSize: 22,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  handle: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleIcon: {
    fontSize: 20,
    color: '#A1A1B0',
  },
});

// ─── 액션 시트 스타일 ───
const asStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    paddingHorizontal: 12,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  optionsCard: {
    backgroundColor: '#1E1E2E',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 17,
    paddingHorizontal: 20,
    gap: 12,
  },
  optionIcon: {
    fontSize: 18,
    width: 26,
    textAlign: 'center',
  },
  optionText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  deleteText: {
    color: '#FF3B30',
  },
  divider: {
    height: 1,
    backgroundColor: '#2E2E3B',
    marginLeft: 58,
  },
  cancelCard: {
    backgroundColor: '#1E1E2E',
    borderRadius: 20,
    paddingVertical: 17,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    color: '#A1A1B0',
    fontWeight: '500',
  },
});
