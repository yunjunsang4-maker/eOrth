import React, { useRef, useState, useCallback, useId } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  Image,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useSkinAccent } from '../constants/skinTheme';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { useRecords } from '../store/recordStore';
import { COUNTRIES } from '../constants/countries';
import { getCurrentSession } from '../services/auth';
import MainCoachmark, { CoachStep, CoachRect } from '../components/MainCoachmark';
import StarFieldBackground from '../components/StarFieldBackground';
import Svg, {
  Path as SvgPath,
  Circle as SvgCircle,
  Ellipse as SvgEllipse,
  Rect as SvgRect,
  Defs as SvgDefs,
  RadialGradient as SvgRadialGradient,
  LinearGradient as SvgLinearGradient,
  Stop as SvgStop,
} from 'react-native-svg';
import { useSettings } from '../store/settingsStore';
import { PersonIcon } from '../components/icons';
import { getSkinPalette } from './MainScreen';
import { andFitText } from '../utils/fitText';

// 통계 튜토리얼 1회 노출 플래그 키 (계정별)
const STATS_TUTORIAL_KEY = '@eorth/statsTutorialSeen';

// 헤더 'analysis' 워드마크 (analysis.svg) — 소셜 글자 본체(x-height ≈18.9, 자연 1:1)와 동일 크기로
// analysis x-height(≈27.5/52)를 소셜과 같게: 52 × 18.9/27.5 ≈ 36
const AnalysisWordmark = ({ height = 36, color = Colors.textPrimary }: { height?: number; color?: string }) => (
  <Svg width={(218 / 52) * height} height={height} viewBox="0 0 218 52" fill="none">
    <SvgPath
      d="M20.7349 12.76H29.8649V40.26H20.7349V37.73C18.8649 39.93 16.2616 41.03 12.9249 41.03C9.25827 41.03 6.17827 39.655 3.68493 36.905C1.22827 34.1183 -6.83479e-05 30.6533 -6.83479e-05 26.51C-6.83479e-05 22.3667 1.22827 18.92 3.68493 16.17C6.17827 13.3833 9.25827 11.99 12.9249 11.99C16.2616 11.99 18.8649 13.09 20.7349 15.29V12.76ZM10.7799 30.855C11.8433 31.955 13.2366 32.505 14.9599 32.505C16.6833 32.505 18.0766 31.955 19.1399 30.855C20.2033 29.755 20.7349 28.3067 20.7349 26.51C20.7349 24.7133 20.2033 23.265 19.1399 22.165C18.0766 21.065 16.6833 20.515 14.9599 20.515C13.2366 20.515 11.8433 21.065 10.7799 22.165C9.7166 23.265 9.18493 24.7133 9.18493 26.51C9.18493 28.3067 9.7166 29.755 10.7799 30.855ZM53.5828 11.99C56.5528 11.99 58.9728 13.0167 60.8428 15.07C62.7495 17.0867 63.7028 20.0017 63.7028 23.815V40.26H54.5728V24.97C54.5728 23.54 54.1878 22.4583 53.4178 21.725C52.6845 20.9917 51.6945 20.625 50.4478 20.625C49.0178 20.625 47.8995 21.065 47.0928 21.945C46.3228 22.7883 45.9378 24.0167 45.9378 25.63V40.26H36.8078V12.76H45.9378V15.51C47.5878 13.1633 50.1362 11.99 53.5828 11.99ZM89.6697 12.76H98.7997V40.26H89.6697V37.73C87.7997 39.93 85.1964 41.03 81.8597 41.03C78.193 41.03 75.113 39.655 72.6197 36.905C70.163 34.1183 68.9347 30.6533 68.9347 26.51C68.9347 22.3667 70.163 18.92 72.6197 16.17C75.113 13.3833 78.193 11.99 81.8597 11.99C85.1964 11.99 87.7997 13.09 89.6697 15.29V12.76ZM79.7147 30.855C80.778 31.955 82.1714 32.505 83.8947 32.505C85.618 32.505 87.0114 31.955 88.0747 30.855C89.138 29.755 89.6697 28.3067 89.6697 26.51C89.6697 24.7133 89.138 23.265 88.0747 22.165C87.0114 21.065 85.618 20.515 83.8947 20.515C82.1714 20.515 80.778 21.065 79.7147 22.165C78.6514 23.265 78.1197 24.7133 78.1197 26.51C78.1197 28.3067 78.6514 29.755 79.7147 30.855ZM105.743 40.26V0.110009H114.873V40.26H105.743ZM139.222 12.76H149.342L139.937 39.82C138.47 43.9633 136.399 46.9517 133.722 48.785C131.045 50.6183 127.58 51.4433 123.327 51.26V42.68C125.27 42.68 126.737 42.4417 127.727 41.965C128.717 41.4883 129.524 40.6267 130.147 39.38L119.147 12.76H129.377L134.932 28.71L139.222 12.76ZM160.703 20.79C160.703 21.3033 161.161 21.725 162.078 22.055C163.031 22.385 164.168 22.6967 165.488 22.99C166.844 23.2833 168.183 23.705 169.503 24.255C170.859 24.7683 171.996 25.6667 172.913 26.95C173.866 28.2333 174.343 29.8467 174.343 31.79C174.343 34.9433 173.169 37.2717 170.823 38.775C168.476 40.2783 165.689 41.03 162.463 41.03C156.303 41.03 152.196 38.8483 150.143 34.485L158.118 30.47C158.814 32.4867 160.244 33.495 162.408 33.495C164.058 33.495 164.883 33 164.883 32.01C164.883 31.4967 164.424 31.075 163.508 30.745C162.591 30.415 161.473 30.085 160.153 29.755C158.833 29.425 157.513 28.985 156.193 28.435C154.873 27.885 153.754 27.005 152.838 25.795C151.921 24.5483 151.463 23.0267 151.463 21.23C151.463 18.2967 152.544 16.0233 154.708 14.41C156.871 12.7967 159.474 11.99 162.518 11.99C167.944 11.99 171.721 14.1167 173.848 18.37L166.148 21.835C165.341 20.2583 164.204 19.47 162.738 19.47C161.381 19.47 160.703 19.91 160.703 20.79ZM187.8 8.96501C186.773 9.99168 185.545 10.505 184.115 10.505C182.685 10.505 181.438 9.99168 180.375 8.96501C179.348 7.90167 178.835 6.65501 178.835 5.22501C178.835 3.79501 179.348 2.56667 180.375 1.54001C181.438 0.51334 182.685 6.85453e-06 184.115 6.85453e-06C185.545 6.85453e-06 186.773 0.51334 187.8 1.54001C188.863 2.56667 189.395 3.79501 189.395 5.22501C189.395 6.65501 188.863 7.90167 187.8 8.96501ZM179.55 40.26V12.76H188.68V40.26H179.55ZM204.178 20.79C204.178 21.3033 204.637 21.725 205.553 22.055C206.507 22.385 207.643 22.6967 208.963 22.99C210.32 23.2833 211.658 23.705 212.978 24.255C214.335 24.7683 215.472 25.6667 216.388 26.95C217.342 28.2333 217.818 29.8467 217.818 31.79C217.818 34.9433 216.645 37.2717 214.298 38.775C211.952 40.2783 209.165 41.03 205.938 41.03C199.778 41.03 195.672 38.8483 193.618 34.485L201.593 30.47C202.29 32.4867 203.72 33.495 205.883 33.495C207.533 33.495 208.358 33 208.358 32.01C208.358 31.4967 207.9 31.075 206.983 30.745C206.067 30.415 204.948 30.085 203.628 29.755C202.308 29.425 200.988 28.985 199.668 28.435C198.348 27.885 197.23 27.005 196.313 25.795C195.397 24.5483 194.938 23.0267 194.938 21.23C194.938 18.2967 196.02 16.0233 198.183 14.41C200.347 12.7967 202.95 11.99 205.993 11.99C211.42 11.99 215.197 14.1167 217.323 18.37L209.623 21.835C208.817 20.2583 207.68 19.47 206.213 19.47C204.857 19.47 204.178 19.91 204.178 20.79Z"
      fill={color}
    />
  </Svg>
);

// ─── 눌림 애니메이션 카드 ───
// Pressable 에도 레이아웃 스타일(flex, margin 등)을 동시 적용해 flex 배치가 깨지지 않게 함
const LAYOUT_KEYS = new Set([
  'flex', 'flexGrow', 'flexShrink', 'flexBasis',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical',
  'alignSelf', 'position', 'top', 'bottom', 'left', 'right',
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
]);

function PressCard({
  style,
  onPress,
  children,
  glowColor = 'rgba(123,97,255,0.15)',
}: {
  style?: any;
  onPress: () => void;
  children: React.ReactNode;
  glowColor?: string;
}) {
  const scale       = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  const handlePressIn = () => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 0.955,
        useNativeDriver: true,
        tension: 400,
        friction: 10,
      }),
      Animated.timing(glowOpacity, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 280,
        friction: 9,
      }),
      Animated.timing(glowOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // 배열 스타일을 평탄화한 뒤 레이아웃 관련 키만 추출해 Pressable 에도 적용
  const flat: Record<string, any> = StyleSheet.flatten(style as any) ?? {};
  const layoutStyle: Record<string, any> = {};
  for (const key of Object.keys(flat)) {
    if (LAYOUT_KEYS.has(key)) layoutStyle[key] = flat[key];
  }

  const borderRadius = flat.borderRadius ?? 24;

  return (
    <Pressable style={layoutStyle} onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View style={[style, { transform: [{ scale }], overflow: 'hidden' }]}>
        {/* 리퀴드 글래스 블러 효과 */}
        <BlurView
          intensity={30}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* 미세 그라데이션 반사 하이라이트 (Specular) */}
        <LinearGradient
          colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', opacity: 0.3 }}
          pointerEvents="none"
        />

        {children}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius,
              backgroundColor: glowColor,
              opacity: glowOpacity,
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

// 네온 그라데이션 링 — 시안의 카드/노드 테두리. LinearGradient 래퍼 + 패딩으로 구현
function NeonRing({
  colors,
  locations,
  start = { x: 0, y: 0 },
  end = { x: 1, y: 1 },
  radius,
  padding = 1.2,
  style,
  children,
}: {
  colors: readonly [string, string, ...string[]];
  locations?: readonly [number, number, ...number[]];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  radius: number;
  padding?: number;
  style?: any;
  children: React.ReactNode;
}) {
  return (
    <LinearGradient
      colors={colors as [string, string, ...string[]]}
      locations={locations}
      start={start}
      end={end}
      style={[{ borderRadius: radius, padding }, style]}
    >
      {children}
    </LinearGradient>
  );
}

// 메인 통계박스(히어로) 테두리 — 시안 SVG(Rectangle 240652865) 그라데이션 그대로.
// 내부가 반투명(흰 3%)이라 래퍼 방식이면 배경까지 물든다 → 스트로크 전용 SVG 오버레이로 그린다.
// 축(359×192 기준 (54,0)→(191.05,182.97))은 비율(%)로 환산해 카드 크기와 무관하게 유지.
const HERO_RING_X1 = `${(54 / 359) * 100}%`;
const HERO_RING_Y1 = '0%';
const HERO_RING_X2 = `${(191.053 / 359) * 100}%`;
const HERO_RING_Y2 = `${(182.972 / 192) * 100}%`;

// 반쪽 카드 셸 — 시안(Group 2085664567): 흰 3% 패널 + 1px 그라데이션 스트로크(rx≈29).
// 내부가 반투명이라 래퍼 방식이면 배경까지 물든다 → 측정 후 스트로크 전용 SVG 오버레이.
const HALF_CARD_RADIUS = 29;
function GradientHalfCard({
  colors,
  onPress,
  children,
  style,
}: {
  colors: [string, string];
  onPress: () => void;
  children: React.ReactNode;
  style?: any;
}) {
  const gradId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      style={[{ flex: 1 }, style]}
      onLayout={(e) => setSize({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) })}
    >
      <PressCard style={[styles.card, { flex: 1 }]} onPress={onPress}>
        {children}
      </PressCard>
      {size.w > 0 && size.h > 0 && (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill} pointerEvents="none">
          <SvgDefs>
            {/* 시안 축: 173×128 기준 (26,0)→(121.2,91.8) — 비율로 환산.
                히어로와 같은 유리 림 — 시작색이 중간에서 투명해졌다 끝색이 반투명으로 올라온다 */}
            <SvgLinearGradient id={gradId} x1="15.04%" y1="0%" x2="70.04%" y2="71.74%">
              <SvgStop offset="0" stopColor={colors[0]} />
              <SvgStop offset="0.6" stopColor={colors[1]} stopOpacity={0} />
              <SvgStop offset="1" stopColor={colors[1]} stopOpacity={0.5} />
            </SvgLinearGradient>
          </SvgDefs>
          <SvgRect
            x={0.5}
            y={0.5}
            width={size.w - 1}
            height={size.h - 1}
            rx={HALF_CARD_RADIUS}
            stroke={`url(#${gradId})`}
            strokeWidth={1}
            fill="none"
          />
        </Svg>
      )}
    </View>
  );
}

type StatType = 'world' | 'yearly' | 'region' | 'countries' | 'rating';

// ── TOP 국가 아크(궤도) 기하 — 시안: 반원 궤도 위 1~5위 노드, 배경에 지구본 와이어프레임 ──
const WIN_W = Dimensions.get('window').width;
const ARC_W = WIN_W - Spacing[6] * 2;             // scroll 좌우 패딩과 동일
const ARC_R = ARC_W * 0.42;                        // 궤도 반지름
const NODE_SIZES = [78, 60, 60, 46, 46];           // 1위가 가장 크고 바깥으로 갈수록 작게
const NODE_ANGLES = [0, -0.62, 0.62, -1.13, 1.13]; // 정상(0)에서 좌우로 벌어지는 각도(rad)
const ARC_CY = ARC_R + NODE_SIZES[0] / 2 + 6;      // 궤도 원 중심 y (1위 노드가 상단에 오도록)
const ARC_H = Math.ceil(ARC_CY - ARC_R * Math.cos(1.13) + NODE_SIZES[3] / 2 + 14);
const arcNodePos = (i: number) => ({
  x: ARC_W / 2 + ARC_R * Math.sin(NODE_ANGLES[i]),
  y: ARC_CY - ARC_R * Math.cos(NODE_ANGLES[i]),
});
// 궤도 곡선 — 노드보다 살짝 바깥 각도까지 그린다
const ARC_SPAN = 1.32;
const ARC_PATH = (() => {
  const x1 = ARC_W / 2 - ARC_R * Math.sin(ARC_SPAN);
  const y1 = ARC_CY - ARC_R * Math.cos(ARC_SPAN);
  const x2 = ARC_W / 2 + ARC_R * Math.sin(ARC_SPAN);
  return `M ${x1} ${y1} A ${ARC_R} ${ARC_R} 0 0 1 ${x2} ${y1}`;
})();

// ── Travel Rating 배경의 지구본 와이어프레임 — 아래로 잘려나가는 큰 구 (시안) ──
const GLOBE_H = 230;
const GLOBE_R = ARC_W * 0.5;
const GLOBE_CY = GLOBE_R + 12; // 원 상단만 화면에 보이고 아래는 잘린다
const GLOBE_LINE = 'rgba(255,255,255,0.09)';

export default function StatsScreen() {
  const skinAccent = useSkinAccent(); // 진행/스탯 바 그라데이션을 스킨색으로
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { records } = useRecords();
  const { profilePhoto, globeSkin } = useSettings(); // 히어로 사진 + 지구본 스킨(활성화색 팔레트)

  // 네온 링 색 — 스킨 연동. aurora는 시안의 시안→마젠타 그라데이션 그대로
  const neonRing = (skinAccent.ringGradient ?? ['#00D7F3', '#FD07E0']) as [string, string];
  const neonPoint = neonRing[1]; // 회수 텍스트 등 포인트 색
  // 반쪽 카드 테두리 — 시안: 마젠타→시안 불투명 2-스톱 (커스텀 스킨은 스킨 링)
  const halfRing: [string, string] = skinAccent.ringGradient ? neonRing : ['#FF14E4', '#00D8F3'];
  // 연도별·대륙별 막대 색 — 지구본 '색 활성화' 팔레트 4색을 순환 사용 (사용자 확정)
  const globePalette = getSkinPalette(globeSkin);

  // TOP 국가 아크 페이지(5개씩) — ‹ ›로 6위 이하 탐색
  const [rankPage, setRankPage] = useState(0);

  // 히어로 카드 실제 높이 — 테두리 스트로크(SVG)를 카드 크기에 맞춰 그리기 위한 측정값
  const [heroH, setHeroH] = useState(0);

  const goToDetail = (statType: StatType) => {
    navigation.navigate('StatsDetail', { statType });
  };

  // 대륙 키(한글, COUNTRIES 데이터 기준)를 표시용 라벨로 변환
  const continentName = (cont: string) => {
    switch (cont) {
      case '아시아': return t('stats.continentAsia');
      case '유럽': return t('stats.continentEurope');
      case '아메리카': return t('stats.continentAmerica');
      case '오세아니아': return t('stats.continentOceania');
      case '아프리카': return t('stats.continentAfrica');
      default: return cont;
    }
  };

  // ── 통계 튜토리얼(코치마크) — 계정당 통계 탭 첫 진입 시 1회 ──
  const heroRef = useRef<any>(null);
  const [coachVisible, setCoachVisible] = useState(false);
  const [coachSteps, setCoachSteps] = useState<CoachStep[]>([]);
  const tutorialStarted = useRef(false); // 같은 세션에서 포커스마다 재실행 방지

  const measure = (ref: React.MutableRefObject<any>) =>
    new Promise<CoachRect | null>((resolve) => {
      const node = ref.current;
      if (!node || typeof node.measureInWindow !== 'function') return resolve(null);
      node.measureInWindow((x: number, y: number, width: number, height: number) => {
        if ([x, y, width, height].some((v) => typeof v !== 'number' || Number.isNaN(v))) resolve(null);
        else resolve({ x, y, width, height });
      });
    });

  useFocusEffect(
    useCallback(() => {
      if (tutorialStarted.current) return;
      tutorialStarted.current = true;
      let cancelled = false;
      (async () => {
        // 계정별 키 (로그인 세션 없으면 guest)
        const session = await getCurrentSession();
        const uid = session?.user?.id || 'guest';
        const key = `${STATS_TUTORIAL_KEY}:${uid}`;
        const seen = await AsyncStorage.getItem(key).catch(() => null);
        if (seen || cancelled) return;
        setTimeout(async () => {
          if (cancelled) return;
          const hero = await measure(heroRef);
          setCoachSteps([
            {
              rect: null,
              title: t('stats.coachTitle'),
              desc: t('stats.coachDesc'),
            },
            {
              rect: hero,
              title: t('stats.coach2Title'),
              desc: t('stats.coach2Desc'),
            },
          ]);
          setCoachVisible(true);
          AsyncStorage.setItem(key, '1').catch(() => {});
        }, 450);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  // Filter to "my posts" (including seed data for demo consistency)
  const myRecords = records.filter((r) => r.isMyPost !== false);

  // 1. World Explorations Hero Stats
  const visitedCountriesSet = new Set<string>();
  const visitedCountriesList: { name: string; flag: string }[] = [];
  const visitedCitiesSet = new Set<string>();

  myRecords.forEach((r) => {
    if (r.countries && r.countries.length > 0) {
      r.countries.forEach((c) => {
        if (!visitedCountriesSet.has(c.name)) {
          visitedCountriesSet.add(c.name);
          visitedCountriesList.push({ name: c.name, flag: c.flag });
        }
      });
    } else if (r.countryName) {
      if (!visitedCountriesSet.has(r.countryName)) {
        visitedCountriesSet.add(r.countryName);
        visitedCountriesList.push({ name: r.countryName, flag: r.countryFlag || '' });
      }
    }

    if (r.regionName) {
      visitedCitiesSet.add(r.regionName);
    }
  });

  const countryCount = visitedCountriesSet.size;
  const cityCount = visitedCitiesSet.size || countryCount;
  const recordsCount = myRecords.length;

  let totalDays = 0;
  myRecords.forEach((r) => {
    if (r.startDate && r.endDate) {
      const start = new Date(r.startDate.replace(/\./g, '-'));
      const end = new Date(r.endDate.replace(/\./g, '-'));
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        totalDays += diffDays;
      } else {
        totalDays += 1;
      }
    } else {
      totalDays += 1;
    }
  });

  const worldCoveragePct = (((countryCount / 195) * 100).toFixed(1) + '%') as any;

  // 2. Yearly Travel History
  const yearlyCounts: Record<string, number> = {};
  myRecords.forEach((r) => {
    const yearStr = r.date ? r.date.split('.')[0] : (r.startDate ? r.startDate.split('.')[0] : '');
    if (yearStr && yearStr.length === 4) {
      yearlyCounts[yearStr] = (yearlyCounts[yearStr] || 0) + 1;
    }
  });

  const currentYear = new Date().getFullYear();
  const VISIT_HISTORY = [];
  for (let i = 6; i >= 0; i--) {
    const year = String(currentYear - i);
    VISIT_HISTORY.push({
      year,
      visits: yearlyCounts[year] || 0,
    });
  }
  const MAX_VISITS = Math.max(...VISIT_HISTORY.map((v) => v.visits), 1);

  // 3. Continent Breakdown
  const continentColors: Record<string, string> = {
    '아시아': '#7B61FF',
    '유럽': '#C084FC',
    '아메리카': '#4A9EFF',
    '오세아니아': '#4ADE80',
    '아프리카': '#F87171',
  };

  const continentCounts: Record<string, number> = {
    '아시아': 0,
    '유럽': 0,
    '아메리카': 0,
    '오세아니아': 0,
  };

  myRecords.forEach((r) => {
    const countryNames: string[] = [];
    if (r.countries && r.countries.length > 0) {
      r.countries.forEach((c) => countryNames.push(c.name));
    } else if (r.countryName) {
      countryNames.push(r.countryName);
    }

    countryNames.forEach((name) => {
      // '한국' 별칭(가져오기 구버전 표기)은 표준 표기로 보정해 조회
      const lookupName = name === '한국' ? '대한민국' : name;
      const cMeta = COUNTRIES.find((c) => c.name === lookupName);
      if (cMeta) {
        let cont = cMeta.continent;
        if (cont === '북아메리카' || cont === '남아메리카') {
          cont = '아메리카';
        }
        if (cont in continentCounts) {
          continentCounts[cont]++;
        } else {
          continentCounts[cont] = (continentCounts[cont] || 0) + 1;
        }
      }
      // 미등록 국가명(지오코딩 폴백 등)은 대륙 통계에서 제외 — 무조건 아시아로 오집계하지 않는다
    });
  });

  const totalContinentVisits = Object.values(continentCounts).reduce((a, b) => a + b, 0);
  const regionOrder = ['아시아', '유럽', '아메리카', '오세아니아', '아프리카'];
  const REGION_STATS = Object.keys(continentCounts).map((cont) => {
    const count = continentCounts[cont];
    const pct = totalContinentVisits > 0 ? count / totalContinentVisits : 0;
    return {
      label: cont,
      count,
      color: continentColors[cont] || '#7B61FF',
      pct,
    };
  })
  .filter((r) => r.count > 0 || regionOrder.slice(0, 4).includes(r.label))
  .sort((a, b) => regionOrder.indexOf(a.label) - regionOrder.indexOf(b.label));

  // 4. Top Countries
  const countryVisits: Record<string, { count: number; flag: string }> = {};
  myRecords.forEach((r) => {
    const countriesList: { name: string; flag: string }[] = [];
    if (r.countries && r.countries.length > 0) {
      r.countries.forEach((c) => countriesList.push(c));
    } else if (r.countryName) {
      countriesList.push({ name: r.countryName, flag: r.countryFlag || '' });
    }

    countriesList.forEach((c) => {
      if (!countryVisits[c.name]) {
        countryVisits[c.name] = { count: 0, flag: c.flag };
      }
      countryVisits[c.name].count++;
    });
  });

  const sortedCountries = Object.keys(countryVisits)
    .map((name) => ({
      name,
      flag: countryVisits[name].flag,
      visits: countryVisits[name].count,
    }))
    .sort((a, b) => b.visits - a.visits);

  // 아크 페이지네이션 — 5개씩, ‹ ›로 6위 이하 탐색 (기록 변화로 페이지 수가 줄면 클램프)
  const rankTotalPages = Math.max(1, Math.ceil(sortedCountries.length / 5));
  const rankPageClamped = Math.min(rankPage, rankTotalPages - 1);
  const ARC_COUNTRIES = sortedCountries
    .slice(rankPageClamped * 5, rankPageClamped * 5 + 5)
    .map((c, index) => ({
      rank: rankPageClamped * 5 + index + 1,
      flag: c.flag,
      name: c.name,
      visits: c.visits,
    }));

  // 5. Travel Rating Stats
  const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let ratingSum = 0;
  let ratedRecordsCount = 0;

  myRecords.forEach((r) => {
    let rating = r.rating;
    if (rating === undefined && r.perCountryData) {
      const ratings = Object.values(r.perCountryData)
        .map((d) => d.rating)
        .filter(Boolean) as number[];
      if (ratings.length > 0) {
        rating = Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length);
      }
    }

    if (rating !== undefined && rating >= 1 && rating <= 5) {
      ratingCounts[rating as 5 | 4 | 3 | 2 | 1]++;
      ratingSum += rating;
      ratedRecordsCount++;
    }
  });

  const avgRating = ratedRecordsCount > 0 ? (ratingSum / ratedRecordsCount).toFixed(1) : '0.0';

  return (
    <LinearGradient colors={['#0A0A0F', '#0A0A0F']} style={styles.container}>
      {/* 소셜·프로필탭과 동일한 검정 배경(#0A0A0F) — 보라끼 나던 그라데이션 제거 */}
      {/* 별 배경 (Stars.svg) — 콘텐츠 뒤에 깔린다 */}
      <StarFieldBackground />
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 17 }]}>
        <AnalysisWordmark height={36} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: 110 }]}>
        {/* World coverage hero — 흰색 % + 프로필 사진 (시안) */}
        {/* 테두리: 시안 SVG의 스트로크 그라데이션만 오버레이 — 내부(흰 3% 패널)는 물들지 않는다 */}
        <View
          ref={heroRef}
          collapsable={false}
          style={{ marginBottom: Spacing[4] }}
          onLayout={(e) => setHeroH(Math.round(e.nativeEvent.layout.height))}
        >
        <PressCard style={styles.heroCard} onPress={() => goToDetail('world')} glowColor="rgba(123,97,255,0.18)">
          <View style={styles.heroCardGrad}>
              {/* 우측 중앙 은은한 흰색 글로우 (시안의 블러 타원) */}
              <Svg width={86} height={86} style={styles.heroGlow} pointerEvents="none">
                <SvgDefs>
                  <SvgRadialGradient id="statsHeroGlow" cx="50%" cy="50%" r="50%">
                    <SvgStop offset="0%" stopColor="#FFFFFF" stopOpacity={0.12} />
                    <SvgStop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
                  </SvgRadialGradient>
                </SvgDefs>
                <SvgCircle cx={43} cy={43} r={43} fill="url(#statsHeroGlow)" />
              </Svg>
              <View style={styles.heroTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroPercentage}>{worldCoveragePct}</Text>
                  <Text style={styles.heroLabel}>{t('comp2.worldTraveled')}</Text>
                </View>
                <View style={styles.globeMini}>
                  {profilePhoto ? (
                    <Image source={{ uri: profilePhoto }} style={styles.globeMiniGrad} resizeMode="cover" />
                  ) : (
                    // 사진 없음 — 프로필 탭과 동일한 기본 아바타(사람 아이콘)
                    <View style={styles.heroAvatarFallback}>
                      <PersonIcon size={30} color="#A0A0B0" />
                    </View>
                  )}
                </View>
              </View>
              {/* Progress bar — 시안: 흰색 20% 트랙 + 단색 마젠타 채움 (커스텀 스킨은 포인트 색) */}
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: worldCoveragePct, backgroundColor: skinAccent.ringGradient ? neonPoint : '#EC34F7' },
                  ]}
                />
              </View>
              <View style={styles.heroStats}>
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatVal}>{countryCount}</Text>
                  <Text style={styles.miniStatLbl}>{t('stats.miniCountries')}</Text>
                </View>
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatVal}>{cityCount}</Text>
                  <Text style={styles.miniStatLbl}>{t('stats.miniCities')}</Text>
                </View>
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatVal}>{recordsCount}</Text>
                  <Text style={styles.miniStatLbl}>{t('stats.miniRecords')}</Text>
                </View>
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatVal}>{totalDays}</Text>
                  <Text style={styles.miniStatLbl}>{t('stats.miniDays')}</Text>
                </View>
              </View>
            </View>
        </PressCard>
        {/* 테두리 전용 그라데이션 스트로크 (시안 Rectangle 240652865) — 커스텀 스킨은 스킨 링 색 2-스톱 */}
        {heroH > 0 && (
          <Svg width={ARC_W} height={heroH} style={StyleSheet.absoluteFill} pointerEvents="none">
            <SvgDefs>
              <SvgLinearGradient id="statsHeroRing" x1={HERO_RING_X1} y1={HERO_RING_Y1} x2={HERO_RING_X2} y2={HERO_RING_Y2}>
                {skinAccent.ringGradient
                  ? [
                      <SvgStop key="s0" offset="0" stopColor={neonRing[0]} />,
                      <SvgStop key="s1" offset="1" stopColor={neonRing[1]} />,
                    ]
                  : [
                      <SvgStop key="s0" offset="0" stopColor="#FF14E4" />,
                      <SvgStop key="s1" offset="0.596154" stopColor="#00D8F3" stopOpacity={0} />,
                      <SvgStop key="s2" offset="1" stopColor="#00D8F3" stopOpacity={0.5} />,
                    ]}
              </SvgLinearGradient>
            </SvgDefs>
            <SvgRect
              x={1}
              y={1}
              width={ARC_W - 2}
              height={heroH - 2}
              rx={BorderRadius['2xl']}
              stroke="url(#statsHeroRing)"
              strokeWidth={2}
              fill="none"
            />
          </Svg>
        )}
        </View>

        {/* Row 2: 연도별 방문 현황 + 대륙별 방문 현황 — 흰 3% 패널 + 1px 그라데이션 스트로크 (시안) */}
        <View style={styles.statsRow}>
          {/* 1번 - Yearly bar chart — 시안: 트랙 없는 막대, 올해만 그라데이션·과거는 단색 */}
          <GradientHalfCard colors={halfRing} onPress={() => goToDetail('yearly')} style={styles.halfCard}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle} {...andFitText}>{t('stats.cardYearlyTrips')}</Text>
              <Text style={styles.cardChevron}>›</Text>
            </View>
            <View style={styles.barChart}>
              {VISIT_HISTORY.map((v, i) => {
                const heightPct = `${(v.visits / MAX_VISITS) * 100}%` as const;
                return (
                  <View key={i} style={styles.barGroup}>
                    <View style={styles.barSlot}>
                      {v.visits > 0 && (
                        // 활성색 역순 — 최신 연도(맨 오른쪽)가 팔레트 1번색부터 시작
                        <View style={[styles.bar, { height: heightPct, backgroundColor: globePalette[(VISIT_HISTORY.length - 1 - i) % globePalette.length] }]} />
                      )}
                    </View>
                    <Text style={styles.barLabel} {...andFitText}>{v.year.slice(2)}</Text>
                  </View>
                );
              })}
            </View>
          </GradientHalfCard>

          {/* 2번 - Region breakdown — 시안: 단색 네온 막대, 점 없음 */}
          <GradientHalfCard colors={halfRing} onPress={() => goToDetail('region')} style={styles.halfCard}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle} {...andFitText}>{t('stats.cardContinents')}</Text>
              <Text style={styles.cardChevron}>›</Text>
            </View>
            {REGION_STATS.map((r, i) => (
              <View key={i} style={styles.regionRow}>
                <View style={styles.regionLeft}>
                  <Text style={styles.regionLabel} {...andFitText}>{continentName(r.label)}</Text>
                </View>
                <View style={styles.regionBarBg}>
                  {r.count > 0 && (
                    <View style={[styles.regionBar, { width: `${r.pct * 100}%`, backgroundColor: globePalette[i % globePalette.length] }]} />
                  )}
                </View>
                <Text style={styles.regionCount} {...andFitText}>{t('stats.countUnit', { count: r.count })}</Text>
              </View>
            ))}
          </GradientHalfCard>
        </View>

        {/* TOP 국가 아크 — 반원 궤도 위 랭킹 노드, ‹ ›로 5개씩 페이지 (시안) */}
        <View style={styles.arcSection}>
          {sortedCountries.length === 0 ? (
            <Text style={styles.arcEmpty}>{t('stats.noRecords')}</Text>
          ) : (
            <>
              <Svg width={ARC_W} height={ARC_H} style={StyleSheet.absoluteFill} pointerEvents="none">
                <SvgPath d={ARC_PATH} stroke="rgba(255,255,255,0.14)" strokeWidth={1} fill="none" />
              </Svg>
              {ARC_COUNTRIES.map((c, i) => {
                const size = NODE_SIZES[i];
                const pos = arcNodePos(i);
                const inner = (
                  <>
                    <Text style={styles.arcRank}>{String(c.rank).padStart(2, '0')}</Text>
                    <Text style={[styles.arcName, i === 0 && styles.arcNameTop, i >= 3 && styles.arcNameSmall]} numberOfLines={1} {...andFitText}>
                      {c.name}
                    </Text>
                    <Text style={[styles.arcVisits, { color: neonPoint }, i >= 3 && styles.arcVisitsSmall]} {...andFitText}>
                      {t('stats.visitsUnit', { count: c.visits })}
                    </Text>
                  </>
                );
                return (
                  <Pressable
                    key={`${c.name}-${c.rank}`}
                    style={{ position: 'absolute', left: pos.x - size / 2, top: pos.y - size / 2 }}
                    onPress={() => goToDetail('countries')}
                  >
                    {i === 0 ? (
                      // 1위 — 네온 그라데이션 링
                      <NeonRing colors={neonRing} radius={size / 2} padding={1.5}>
                        <View style={[styles.arcNodeInner, { width: size - 3, height: size - 3, borderRadius: (size - 3) / 2 }]}>
                          {inner}
                        </View>
                      </NeonRing>
                    ) : (
                      <View
                        style={[
                          styles.arcNode,
                          {
                            width: size,
                            height: size,
                            borderRadius: size / 2,
                            borderColor: i < 3 ? '#7B61FF' : 'rgba(255,255,255,0.28)',
                          },
                        ]}
                      >
                        {inner}
                      </View>
                    )}
                  </Pressable>
                );
              })}
              {rankTotalPages > 1 && (
                <>
                  <Pressable
                    style={[styles.arcArrow, { left: 0 }]}
                    disabled={rankPageClamped === 0}
                    onPress={() => setRankPage((p) => Math.max(0, p - 1))}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Text style={[styles.arcArrowTxt, rankPageClamped === 0 && { opacity: 0.25 }]}>‹</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.arcArrow, { right: 0 }]}
                    disabled={rankPageClamped >= rankTotalPages - 1}
                    onPress={() => setRankPage((p) => Math.min(rankTotalPages - 1, p + 1))}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Text style={[styles.arcArrowTxt, rankPageClamped >= rankTotalPages - 1 && { opacity: 0.25 }]}>›</Text>
                  </Pressable>
                </>
              )}
            </>
          )}
        </View>

        {/* Travel Rating — 지구본 와이어프레임 글로우 위에 평균 별점 (시안) */}
        <Pressable style={styles.globeSection} onPress={() => goToDetail('rating')}>
          <Svg width={ARC_W} height={GLOBE_H} pointerEvents="none">
            <SvgDefs>
              <SvgRadialGradient id="statsGlobeGlow" cx="50%" cy="45%" r="55%">
                <SvgStop offset="0%" stopColor="#7B61FF" stopOpacity={0.2} />
                <SvgStop offset="100%" stopColor="#7B61FF" stopOpacity={0} />
              </SvgRadialGradient>
            </SvgDefs>
            <SvgCircle cx={ARC_W / 2} cy={GLOBE_CY} r={GLOBE_R} fill="url(#statsGlobeGlow)" />
            <SvgCircle cx={ARC_W / 2} cy={GLOBE_CY} r={GLOBE_R} stroke={GLOBE_LINE} strokeWidth={1} fill="none" />
            {/* 경선 */}
            <SvgEllipse cx={ARC_W / 2} cy={GLOBE_CY} rx={GLOBE_R * 0.62} ry={GLOBE_R} stroke={GLOBE_LINE} strokeWidth={1} fill="none" />
            <SvgEllipse cx={ARC_W / 2} cy={GLOBE_CY} rx={GLOBE_R * 0.24} ry={GLOBE_R} stroke={GLOBE_LINE} strokeWidth={1} fill="none" />
            {/* 위선 */}
            <SvgEllipse cx={ARC_W / 2} cy={GLOBE_CY} rx={GLOBE_R} ry={GLOBE_R * 0.3} stroke={GLOBE_LINE} strokeWidth={1} fill="none" />
            <SvgEllipse cx={ARC_W / 2} cy={GLOBE_CY - GLOBE_R * 0.45} rx={GLOBE_R * 0.88} ry={GLOBE_R * 0.16} stroke={GLOBE_LINE} strokeWidth={1} fill="none" />
          </Svg>
          <View style={styles.ratingOverlay} pointerEvents="none">
            <Text style={styles.ratingTitle}>Travel Rating</Text>
            {/* 평균의 모수 = 별점이 있는 기록 수 — 전체 기록 수로 표기하면 라벨과 실제 계산이 어긋난다 */}
            <Text style={styles.ratingBasis}>{t('stats.ratingBasis', { count: ratedRecordsCount })}</Text>
            <Text style={styles.ratingAvg}>{avgRating}</Text>
            <View style={styles.ratingStarRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Text
                  key={star}
                  style={[styles.ratingStarBig, { color: star <= Math.round(Number(avgRating)) ? '#FBBF24' : '#4A4A59' }]}
                >
                  ★
                </Text>
              ))}
            </View>
          </View>
        </Pressable>
      </ScrollView>

      {/* 통계 튜토리얼 코치마크 */}
      <MainCoachmark
        visible={coachVisible}
        steps={coachSteps}
        onClose={() => setCoachVisible(false)}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    // 소셜탭 헤더와 동일 배치: 좌측 36, 상단 정렬
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingLeft: 36,
    paddingRight: Spacing[6],
    paddingBottom: Spacing[3],
  },
  scroll: { paddingHorizontal: Spacing[6], paddingBottom: 20 },

  statsRow: {
    flexDirection: 'row',
    gap: Spacing[3],
    marginBottom: Spacing[4],
  },
  halfCard: {
    flex: 1,
    marginBottom: 0,
  },

  heroCard: {
    // 테두리는 NeonRing(그라데이션 래퍼)이 담당 — 내부 면은 시안의 흰색 3% 패널
    borderRadius: BorderRadius['2xl'],
    overflow: 'hidden',
    backgroundColor: 'rgba(217,217,217,0.03)',
  },
  // 시안(359×192 기준): 콘텐츠 좌우 30, 상단 24, 하단 22
  heroCardGrad: { paddingTop: 24, paddingBottom: 22, paddingHorizontal: 30 },
  heroGlow: {
    // 시안: 우측 중앙(카드 오른쪽 17, 위 74)의 블러 타원
    position: 'absolute',
    right: 17,
    top: 74,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  heroPercentage: {
    fontSize: 30, // 시안: 캡 높이 ~28의 큰 흰색 숫자
    fontFamily: Typography.fontFamily.extraBold,
    color: Colors.textPrimary,
    letterSpacing: -1,
  },
  heroLabel: {
    // 시안: AppleSDGothicNeoEB00 15px / 행간 130% / 자간 -0.1
    // Inter(앱 폰트)는 한글 글리프가 없어 family 지정 시 굵기가 유실됨 —
    // 한글은 시스템 폰트(iOS=Apple SD Gothic Neo)가 렌더하므로 weight 800으로 EB를 재현한다
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 19.5, // 130%
    letterSpacing: -0.1,
    color: Colors.textPrimary,
    marginTop: 4,
  },
  globeMini: {
    // 시안: 지름 57.3 원형, 우측 상단
    width: 57,
    height: 57,
    borderRadius: 28.5,
    overflow: 'hidden',
    shadowColor: '#7B61FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
    elevation: 8,
  },
  globeMiniGrad: { flex: 1 },
  // 프로필 사진 없을 때 — 프로필 탭 기본 아바타와 동일한 톤(어두운 원 + 사람 아이콘)
  heroAvatarFallback: {
    flex: 1,
    backgroundColor: '#1F1F22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBarBg: {
    // 시안: 높이 8, 흰색 20% 트랙, 라운드 캡
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 22,
  },
  progressBarFill: {
    height: 8,
    borderRadius: 4,
    minWidth: 8,
  },
  heroStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  miniStat: { alignItems: 'center' },
  miniStatVal: {
    // 시안: 흰색 굵은 숫자 ~16
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  miniStatLbl: {
    // 시안: 흰색 50% 라벨
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
    marginTop: 4,
  },

  card: {
    // 시안: 흰 3% 패널, rx≈29 — 테두리는 GradientHalfCard의 SVG 스트로크가 담당
    backgroundColor: 'rgba(217,217,217,0.03)',
    borderRadius: HALF_CARD_RADIUS,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[3],
  },
  cardTitle: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
  },
  cardChevron: {
    fontSize: 18,
    lineHeight: 18,
    color: Colors.textMuted,
    marginLeft: 4,
  },

  // Bar chart — 시안: 배경 트랙 없이 값 있는 해만 막대 (폭 13, 라운드 4)
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 70,
    gap: 3,
  },
  barGroup: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
  },
  barSlot: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    width: 13,
    borderRadius: 4,
    minHeight: 6,
  },
  barLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 8,
    fontFamily: Typography.fontFamily.regular,
  },

  // Region
  regionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing[2],
    gap: 4,
  },
  regionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 50,
    gap: 4,
  },
  regionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  regionLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.regular,
  },
  regionBarBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.bgCardAlt,
    overflow: 'hidden',
  },
  regionBar: {
    height: 8,
    borderRadius: 4,
    minWidth: 4,
  },
  regionCount: {
    fontSize: 10,
    color: Colors.textMuted,
    width: 22,
    textAlign: 'right',
    fontFamily: Typography.fontFamily.regular,
  },

  // ── TOP 국가 아크 (시안: 반원 궤도 + 랭킹 노드) ──
  arcSection: {
    width: ARC_W,
    height: ARC_H,
    marginTop: Spacing[3],
  },
  arcEmpty: {
    color: Colors.textMuted,
    fontSize: Typography.fontSize.xs,
    textAlign: 'center',
    marginTop: 40,
    fontFamily: Typography.fontFamily.regular,
  },
  arcNodeInner: {
    backgroundColor: '#0C0C14',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  arcNode: {
    backgroundColor: 'rgba(12,12,20,0.92)',
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  arcRank: {
    fontSize: 9,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.semiBold,
    letterSpacing: 1,
  },
  arcName: {
    fontSize: 11,
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamily.bold,
    marginTop: 1,
    maxWidth: '92%',
    textAlign: 'center',
  },
  arcNameTop: { fontSize: 15 },
  arcNameSmall: { fontSize: 9 },
  arcVisits: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    marginTop: 1,
  },
  arcVisitsSmall: { fontSize: 8 },
  arcArrow: {
    position: 'absolute',
    top: ARC_H / 2 - 4,
    width: 28,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arcArrowTxt: {
    fontSize: 26,
    lineHeight: 30,
    color: Colors.textSecondary,
  },

  // ── Travel Rating + 지구본 와이어프레임 (시안) ──
  globeSection: {
    width: ARC_W,
    height: GLOBE_H,
    marginTop: Spacing[2],
  },
  ratingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    paddingTop: 26,
  },
  ratingTitle: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.extraBold,
    color: Colors.textPrimary,
  },
  ratingBasis: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.regular,
    marginTop: 3,
  },
  ratingAvg: {
    fontSize: 40,
    fontFamily: Typography.fontFamily.extraBold,
    color: Colors.textPrimary,
    letterSpacing: -1,
    marginTop: 8,
  },
  ratingStarRow: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 4,
  },
  ratingStarBig: {
    fontSize: 24,
  },
});
