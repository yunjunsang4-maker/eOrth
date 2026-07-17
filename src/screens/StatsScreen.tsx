import React, { useRef, useState, useCallback, useEffect, useId, useMemo } from 'react';
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
  PanResponder,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
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
  Image as SvgImage,
  Path as SvgPath,
  Circle as SvgCircle,
  Rect as SvgRect,
  G as SvgG,
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
}: {
  style?: any;
  onPress: () => void;
  children: React.ReactNode;
  glowColor?: string; // 프레스 보라 글로우 제거됨 — 호환용으로 타입만 유지
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.955,
      useNativeDriver: true,
      tension: 400,
      friction: 10,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 280,
      friction: 9,
    }).start();
  };

  // 배열 스타일을 평탄화한 뒤 레이아웃 관련 키만 추출해 Pressable 에도 적용
  const flat: Record<string, any> = StyleSheet.flatten(style as any) ?? {};
  const layoutStyle: Record<string, any> = {};
  for (const key of Object.keys(flat)) {
    if (LAYOUT_KEYS.has(key)) layoutStyle[key] = flat[key];
  }

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
      </Animated.View>
    </Pressable>
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
  onPress,
  children,
  style,
}: {
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
        // Svg가 아니라 View로 터치 차단 해제 — RNSVG는 새 아키텍처에서 pointerEvents="none"을
        // 무시하고 터치를 삼켜 카드 탭(상세 이동)이 막힌다
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={size.w} height={size.h}>
            <SvgDefs>
              {/* 원판 테두리와 동일 그라데이션 — 좌상단 흰색 진하게, 가운데 투명, 우하단 흰색 약하게 */}
              <SvgLinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                <SvgStop offset="0" stopColor="#CECFCD" stopOpacity={1} />
                <SvgStop offset="0.4" stopColor="#CECFCD" stopOpacity={0} />
                <SvgStop offset="0.6" stopColor="#CECFCD" stopOpacity={0} />
                <SvgStop offset="1" stopColor="#CECFCD" stopOpacity={0.45} />
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
        </View>
      )}
    </View>
  );
}

type StatType = 'world' | 'yearly' | 'region' | 'countries' | 'rating';

// ── TOP 국가 궤도 + Travel Rating 통합 섹션 — 시안(Group 2085664582, 335×312) ──
// 궤도와 지구본이 동심원: 중심 (167.5, 196.2), 궤도 R=160.2, 지구본 R≈108.
// 모든 좌표는 시안(335px 폭) 기준 → 실제 폭으로 배율 환산.
const WIN_W = Dimensions.get('window').width;
const ARC_W = WIN_W - Spacing[6] * 2; // scroll 좌우 패딩과 동일
const OS = ARC_W / 335;               // 시안 배율(orbit scale)
const ORBIT_H = Math.ceil(312 * OS);
const ORBIT_CX = ARC_W / 2;
const ORBIT_CY = 196.2 * OS;
const ORBIT_R = 160.2 * OS;
// 노드 — [cx, cy, r] (시안 좌표), 순위 낮을수록 링이 옅어진다
const NODE_GEO: [number, number, number][] = [
  [168, 36, 35.5],
  [73, 58, 30],
  [271, 58, 30],
  [23, 127, 23],
  [312, 127, 23],
];
const NODE_RING_OPACITY = [1, 0.5, 0.5, 0.2, 0.2];
// ── 궤도 캐러셀(이스터에그) — 별점 원판을 꾹 누른 채 좌우 드래그로 랭킹 노드 회전 ──
// 슬롯을 좌→우 순서로 정렬하고 각 슬롯의 (궤도 중심 기준) 각도·반지름을 구해 원호를 따라 보간.
// 맨 오른쪽→맨 왼쪽 랩 구간은 아래쪽 큰 호를 한 바퀴 돌아 넘어간다(행성 궤도 느낌).
const ORBIT_DCX = 167.5; // 궤도 중심(시안 좌표)
const ORBIT_DCY = 196.2;
const SLOT_BY_ORDER = [3, 1, 0, 2, 4];  // 좌→우 슬롯 인덱스
const NODE_ORDER_POS = [2, 1, 3, 0, 4]; // 슬롯 i → 좌→우 순번
const SLOT_ANGLE = SLOT_BY_ORDER.map((s) => Math.atan2(NODE_GEO[s][1] - ORBIT_DCY, NODE_GEO[s][0] - ORBIT_DCX));
const SLOT_RADIUS = SLOT_BY_ORDER.map((s) => Math.hypot(NODE_GEO[s][0] - ORBIT_DCX, NODE_GEO[s][1] - ORBIT_DCY));
const SLOT_GR = SLOT_BY_ORDER.map((s) => NODE_GEO[s][2]);
// 좌→우 순번(실수)의 시안 좌표·반지름 — 정수 순번은 원래 슬롯과 정확히 일치
function orbitNodeAt(orderPos: number): { x: number; y: number; gr: number } {
  const q = ((orderPos % 5) + 5) % 5;
  const k = Math.floor(q);
  const f = q - k;
  const k2 = (k + 1) % 5;
  const a1 = SLOT_ANGLE[k];
  const a2 = k === 4 ? SLOT_ANGLE[0] + Math.PI * 2 : SLOT_ANGLE[k2]; // 랩: 아래로 크게 돌기
  const ang = a1 + (a2 - a1) * f;
  const r = SLOT_RADIUS[k] + (SLOT_RADIUS[k2] - SLOT_RADIUS[k]) * f;
  const gr = SLOT_GR[k] + (SLOT_GR[k2] - SLOT_GR[k]) * f;
  return { x: ORBIT_DCX + r * Math.cos(ang), y: ORBIT_DCY + r * Math.sin(ang), gr };
}
// 6개 이상일 때의 선형 캐러셀 — q∈[0,n): 0~4는 보이는 슬롯, (4,5]는 우하단으로 페이드 퇴장,
// [n-1,n)은 좌하단에서 페이드 등장, 그 사이는 숨김(가장자리 밖 대기). 드래그로 전체 순위 순환.
const EXIT_SWEEP = 0.55; // rad — 가장자리 밖으로 사라지는 꼬리 구간
function orbitCarouselAt(q: number, n: number): { x: number; y: number; gr: number; opacity: number } | null {
  let ang: number; let r: number; let gr: number; let opacity: number;
  if (q <= 4) {
    const k = Math.floor(q);
    const f = q - k;
    const k2 = Math.min(k + 1, 4);
    ang = SLOT_ANGLE[k] + (SLOT_ANGLE[k2] - SLOT_ANGLE[k]) * f;
    r = SLOT_RADIUS[k] + (SLOT_RADIUS[k2] - SLOT_RADIUS[k]) * f;
    gr = SLOT_GR[k] + (SLOT_GR[k2] - SLOT_GR[k]) * f;
    opacity = 1;
  } else if (q <= 5) {
    const f = q - 4; // 퇴장 (우하단)
    ang = SLOT_ANGLE[4] + EXIT_SWEEP * f;
    r = SLOT_RADIUS[4];
    gr = SLOT_GR[4];
    opacity = 1 - f;
  } else if (q >= n - 1) {
    const f = q - (n - 1); // 등장 (좌하단)
    ang = SLOT_ANGLE[0] - EXIT_SWEEP * (1 - f);
    r = SLOT_RADIUS[0];
    gr = SLOT_GR[0];
    opacity = f;
  } else {
    return null; // 숨김 — 가장자리 밖 대기
  }
  return { x: ORBIT_DCX + r * Math.cos(ang), y: ORBIT_DCY + r * Math.sin(ang), gr, opacity };
}
// 궤도 곡선 — 끝원(노드 4·5) 중심(23,127)·(312,127)에서 끝나는 원호 (±64.4°). 끝점이 끝원 안에 들어가 벗어나지 않음
const ORBIT_SPAN = 1.124;
const ORBIT_PATH = (() => {
  const x1 = ORBIT_CX - ORBIT_R * Math.sin(ORBIT_SPAN);
  const y1 = ORBIT_CY - ORBIT_R * Math.cos(ORBIT_SPAN);
  const x2 = ORBIT_CX + ORBIT_R * Math.sin(ORBIT_SPAN);
  return `M ${x1} ${y1} A ${ORBIT_R} ${ORBIT_R} 0 0 1 ${x2} ${y1}`;
})();
// 궤도 곡선 PNG — Figma 시안(Ellipse 3073 (1)) 소프트 아치. ORBIT_PATH 아치 바운딩 박스에 정렬(노드와 동일 위치 통과).
const ORBIT_LINE_IMG = require('../../assets/statsOrbitLine.png');
const ORBIT_IMG_HALF_W = ORBIT_R * Math.sin(ORBIT_SPAN);       // 아치 반폭(끝점 x)
const ORBIT_IMG_X = ORBIT_CX - ORBIT_IMG_HALF_W;               // 좌측 끝
const ORBIT_IMG_Y = ORBIT_CY - ORBIT_R;                        // 아치 정점(top)
const ORBIT_IMG_W = ORBIT_IMG_HALF_W * 2;                      // 전체 폭
const ORBIT_IMG_H = ORBIT_R * (1 - Math.cos(ORBIT_SPAN));      // 정점→끝점 높이
// 별점 지구본 emblem(디스크+격자) — Figma 시안(Group 2085664602) PNG. 맨뒤 원판/격자 문양 공용.
const RATING_GLOBE_IMG = require('../../assets/statsRatingGlobe.png');
const RATING_GLOBE_D = 217 * OS;                               // emblem 지름(맨뒤 원판과 동일)
const RATING_GLOBE_X = (168.46 - 108.5) * OS;                  // 좌측(중심 168.46,193)
const RATING_GLOBE_Y = (193 - 108.5) * OS;                     // 상단
// 지구본 문양(2겹)은 시안 원본 격자 패스(data/statsGlobePath)를 라벤더→보라 그라데이션으로 그린다

export default function StatsScreen() {
  const skinAccent = useSkinAccent(); // 진행/스탯 바 그라데이션을 스킨색으로
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { records } = useRecords();
  const { profilePhoto, globeSkin, homeCountryCode } = useSettings(); // 히어로 사진 + 지구본 스킨(활성화색 팔레트)

  // 네온 링 색 — 스킨 연동. aurora는 시안의 시안→마젠타 그라데이션 그대로
  const neonRing = (skinAccent.ringGradient ?? ['#00D7F3', '#FD07E0']) as [string, string];
  const neonPoint = neonRing[1]; // 회수 텍스트 등 포인트 색
  // 반쪽 카드 테두리 — 시안: 마젠타→시안 불투명 2-스톱 (커스텀 스킨은 스킨 링)
  const halfRing: [string, string] = skinAccent.ringGradient ? neonRing : ['#FF14E4', '#00D8F3'];
  // 연도별·대륙별 막대 색 — 지구본 '색 활성화' 팔레트 4색을 순환 사용 (사용자 확정)
  const globePalette = getSkinPalette(globeSkin);

  // 히어로 카드 실제 높이 — 테두리 스트로크(SVG)를 카드 크기에 맞춰 그리기 위한 측정값
  const [heroH, setHeroH] = useState(0);

  const goToDetail = (statType: StatType) => {
    navigation.navigate('StatsDetail', { statType });
  };

  // ── 궤도 캐러셀 드래그 — 별점 원판 꾹(350ms) → 좌우 드래그로 노드 회전, 놓으면 슬롯 스냅 ──
  // 짧은 탭은 기존대로 평가 상세 이동. PanResponder는 첫 렌더에 박제되므로 ref 경유로 최신값 사용.
  const [orbitShift, setOrbitShift] = useState(0);
  // 드래그 모드 동안 ScrollView 스크롤 잠금 — 노드 회전 중 화면이 따라 움직이는 불편 방지
  const [orbitDragging, setOrbitDragging] = useState(false);
  const orbitShiftRef = useRef(0);
  const orbitDragRef = useRef({ dragging: false, start: 0, timer: null as ReturnType<typeof setTimeout> | null, lastUpd: 0 });
  const goToDetailRef = useRef(goToDetail);
  goToDetailRef.current = goToDetail;
  const snapOrbit = () => {
    const snapped = Math.round(orbitShiftRef.current);
    orbitShiftRef.current = snapped;
    setOrbitShift(snapped);
  };
  const snapOrbitRef = useRef(snapOrbit);
  snapOrbitRef.current = snapOrbit;
  // 플릭 관성 — 손을 놓을 때 속도로 계속 회전하다 감속 후 스냅. 손가락이 화면을 벗어나지
  // 않아도 휙휙 던져서 끝 순위까지 넘길 수 있다. 회전 중 재터치는 즉시 이어서 드래그.
  const momentumRef = useRef<{ raf: number | null }>({ raf: null });
  const stopMomentum = () => {
    if (momentumRef.current.raf != null) {
      cancelAnimationFrame(momentumRef.current.raf);
      momentumRef.current.raf = null;
    }
  };
  const startMomentum = (v0: number) => {
    stopMomentum();
    let v = v0; // 슬롯/ms
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      const dt = Math.min(now - last, 50);
      last = now;
      v *= Math.pow(0.994, dt); // 감쇠
      const next = orbitShiftRef.current + v * dt;
      orbitShiftRef.current = next;
      setOrbitShift(next);
      if (Math.abs(v) < 0.0004) {
        momentumRef.current.raf = null;
        snapOrbitRef.current();
        Haptics.selectionAsync().catch(() => {});
        return;
      }
      momentumRef.current.raf = requestAnimationFrame(tick);
    };
    momentumRef.current.raf = requestAnimationFrame(tick);
  };
  const startMomentumRef = useRef(startMomentum);
  startMomentumRef.current = startMomentum;
  const stopMomentumRef = useRef(stopMomentum);
  stopMomentumRef.current = stopMomentum;
  useEffect(() => () => stopMomentumRef.current(), []); // 언마운트 시 관성 루프 정리
  const ratingPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      // 드래그 모드 전이면 ScrollView가 스크롤을 가져갈 수 있게 양보
      onPanResponderTerminationRequest: () => !orbitDragRef.current.dragging,
      onPanResponderGrant: () => {
        const d = orbitDragRef.current;
        const wasSpinning = momentumRef.current.raf != null;
        stopMomentumRef.current();
        d.start = orbitShiftRef.current;
        if (wasSpinning) {
          // 관성 회전 중 재터치 — 길게 누를 필요 없이 바로 이어서 드래그(연속 플릭)
          d.dragging = true;
          setOrbitDragging(true);
          return;
        }
        d.timer = setTimeout(() => {
          d.dragging = true;
          d.timer = null;
          setOrbitDragging(true); // 스크롤 잠금
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        }, 350);
      },
      onPanResponderMove: (_e, g) => {
        const d = orbitDragRef.current;
        if (!d.dragging) return;
        const now = Date.now();
        if (now - d.lastUpd < 16) return; // 프레임 단위 스로틀
        d.lastUpd = now;
        const next = d.start + g.dx / (60 * OS); // ≈슬롯 간격만큼 끌면 한 칸
        orbitShiftRef.current = next;
        setOrbitShift(next);
      },
      onPanResponderRelease: (_e, g) => {
        const d = orbitDragRef.current;
        if (d.timer) { clearTimeout(d.timer); d.timer = null; }
        if (d.dragging) {
          d.dragging = false;
          setOrbitDragging(false); // 스크롤 잠금 해제
          // 놓는 순간 속도(px/ms)를 슬롯/ms로 변환 — 빠르면 관성 회전, 느리면 즉시 스냅
          const v = Math.max(-0.015, Math.min(0.015, g.vx / (60 * OS)));
          if (Math.abs(v) > 0.0015) {
            startMomentumRef.current(v);
          } else {
            snapOrbitRef.current();
            Haptics.selectionAsync().catch(() => {});
          }
        } else if (Math.abs(g.dx) < 10 && Math.abs(g.dy) < 10) {
          goToDetailRef.current('rating'); // 짧은 탭 = 평가 상세(기존 동작)
        }
      },
      onPanResponderTerminate: () => {
        const d = orbitDragRef.current;
        if (d.timer) { clearTimeout(d.timer); d.timer = null; }
        if (d.dragging) {
          d.dragging = false;
          setOrbitDragging(false); // 스크롤 잠금 해제
          snapOrbitRef.current();
        }
      },
    })
  ).current;

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

  // 거주국은 방문국이 아니다 — 현재 거주국 기준 동적 제외('대한민국'↔'한국' 별칭 포함)
  const homeNames = useMemo(() => {
    const s = new Set<string>();
    const name = COUNTRIES.find((c) => c.term.split(' ')[0].toUpperCase() === (homeCountryCode || '').toUpperCase())?.name;
    if (name) {
      s.add(name);
      if (name === '대한민국') s.add('한국');
      if (name === '한국') s.add('대한민국');
    }
    return s;
  }, [homeCountryCode]);

  // 1. World Explorations Hero Stats
  const visitedCountriesSet = new Set<string>();
  const visitedCountriesList: { name: string; flag: string }[] = [];
  const visitedCitiesSet = new Set<string>();

  myRecords.forEach((r) => {
    if (r.countries && r.countries.length > 0) {
      r.countries.forEach((c) => {
        if (homeNames.has(c.name)) return; // 거주국 제외
        if (!visitedCountriesSet.has(c.name)) {
          visitedCountriesSet.add(c.name);
          visitedCountriesList.push({ name: c.name, flag: c.flag });
        }
      });
    } else if (r.countryName) {
      if (homeNames.has(r.countryName)) return; // 거주국 제외
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
  const cityCount = visitedCitiesSet.size; // 도시(regionName) 기록이 있는 것만 — 없으면 빈칸 표시
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

  // 전체 순위 캐러셀 — 페이지 없음. 6위 밖 나라는 궤도 드래그(별점 원판 꾹+좌우)로 순환해 본다
  const ARC_COUNTRIES = sortedCountries.map((c, index) => ({
    rank: index + 1,
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

      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        scrollEnabled={!orbitDragging}
        contentContainerStyle={[styles.scroll, { paddingBottom: 70 }]}
      >
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
              <View style={styles.heroGlow} pointerEvents="none">
              <Svg width={86} height={86}>
                <SvgDefs>
                  <SvgRadialGradient id="statsHeroGlow" cx="50%" cy="50%" r="50%">
                    <SvgStop offset="0%" stopColor="#FFFFFF" stopOpacity={0.12} />
                    <SvgStop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
                  </SvgRadialGradient>
                </SvgDefs>
                <SvgCircle cx={43} cy={43} r={43} fill="url(#statsHeroGlow)" />
              </Svg>
              </View>
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
                  <Text style={styles.miniStatVal}>{cityCount > 0 ? cityCount : ''}</Text>
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
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={ARC_W} height={heroH}>
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
          </View>
        )}
        </View>

        {/* Row 2: 연도별 방문 현황 + 대륙별 방문 현황 — 흰 3% 패널 + 1px 그라데이션 스트로크 (시안) */}
        <View style={styles.statsRow}>
          {/* 1번 - Yearly bar chart — 시안: 트랙 없는 막대, 올해만 그라데이션·과거는 단색 */}
          <GradientHalfCard onPress={() => goToDetail('yearly')} style={styles.halfCard}>
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
          <GradientHalfCard onPress={() => goToDetail('region')} style={styles.halfCard}>
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

        {/* TOP 국가 궤도 + Travel Rating — 시안(Group 2085664582): 궤도·지구본 동심원 통합 섹션 */}
        <View style={styles.orbitSection}>
          {/* 장식 레이어 — 별점 스택(1겹 유리→2겹 지구본→3겹 유리) + 배경 구 + 궤도 곡선 */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {/* 맨뒤 유리 원판(배경 구) — Figma 시안(Group 2085664602) 지구본 emblem PNG. 블러 컨테이너 위 옅게(0.2) 깔려 배경 구 역할 */}
            <View style={styles.ratingDiskBack}>
              <BlurView intensity={16} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
              <View style={styles.ratingDiskBackTint} />
              <Svg width={217 * OS} height={217 * OS} style={StyleSheet.absoluteFill}>
                <SvgImage href={RATING_GLOBE_IMG} x={0} y={0} width={217 * OS} height={217 * OS} preserveAspectRatio="xMidYMid meet" />
              </Svg>
            </View>
            {/* 궤도 곡선 — 스펙: border 4px + border-image(180deg 흰0.3 0%→회0 57.93%) + backdrop-filter blur(4px).
                translateY -6로 살짝 위. backdrop-filter는 SVG 스트로크에 못 걸어 같은 그라데이션의 옅은 소프트 1겹으로 근사 */}
            <Svg width={ARC_W} height={ORBIT_H} style={StyleSheet.absoluteFill}>
              {/* 궤도 곡선 — Figma 시안(Ellipse 3073 (1)) PNG. 아치 바운딩 박스에 정렬해 노드와 동일 위치를 통과 */}
              <SvgG translateY={-6}>
                <SvgImage href={ORBIT_LINE_IMG} x={ORBIT_IMG_X} y={ORBIT_IMG_Y} width={ORBIT_IMG_W} height={ORBIT_IMG_H} preserveAspectRatio="none" />
              </SvgG>
            </Svg>
            {/* 1겹 — 지구본 뒤 유리 원판 (스펙: #FFFFFF08(3%) + backdrop blur 4.17px) */}
            <View style={styles.ratingDisk}>
              <BlurView intensity={15} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
              <View style={styles.ratingDiskTint} />
            </View>
            {/* 3겹 — 유리 원판 (스펙: #D9D9D908(3%) + blur). 지구본 '뒤'에 둬서 문양이 판 위로 또렷이 보이게 함 */}
            <View style={styles.ratingDisk3}>
              <BlurView intensity={15} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
              <View style={styles.ratingDisk3Tint} />
            </View>
            {/* 지구본 문양 — Figma 시안(Group 2085664602) PNG. 유리판 위, 맨뒤 원판과 동심·동일 크기(217*OS)로 또렷한 emblem */}
            <Svg width={ARC_W} height={ORBIT_H} style={StyleSheet.absoluteFill}>
              <SvgImage href={RATING_GLOBE_IMG} x={RATING_GLOBE_X} y={RATING_GLOBE_Y} width={RATING_GLOBE_D} height={RATING_GLOBE_D} preserveAspectRatio="xMidYMid meet" />
            </Svg>
            {/* 맨앞 원판(3겹) 테두리 — 문양·문양블러 위에 올려야 안 덮이고 보인다(반경 85가 문양블러 반경 95 안쪽) */}
            <Svg width={170 * OS} height={170 * OS} style={styles.ratingDisk3BorderBox} pointerEvents="none">
              <SvgDefs>
                {/* 맨뒤 원판 테두리와 동일 — 좌상단 흰색 진하게, 가운데 투명, 우하단 흰색 약하게 */}
                <SvgLinearGradient id="ratingDisk3Border" x1="0" y1="0" x2="1" y2="1">
                  <SvgStop offset="0" stopColor="#CECFCD" stopOpacity={1} />
                  <SvgStop offset="0.4" stopColor="#CECFCD" stopOpacity={0} />
                  <SvgStop offset="0.6" stopColor="#CECFCD" stopOpacity={0} />
                  <SvgStop offset="1" stopColor="#CECFCD" stopOpacity={0.45} />
                </SvgLinearGradient>
              </SvgDefs>
              <SvgCircle
                cx={(170 * OS) / 2}
                cy={(170 * OS) / 2}
                r={(170 * OS) / 2 - 1}
                fill="none"
                stroke="url(#ratingDisk3Border)"
                strokeWidth={1.5}
              />
            </Svg>
          </View>

          {/* Travel Rating — 지구본 중앙 (탭: 평가 상세 · 꾹 누른 채 좌우 드래그: 랭킹 노드 궤도 회전) */}
          <View style={styles.ratingOverlay} {...ratingPan.panHandlers}>
            <Text style={styles.ratingTitle}>Travel Rating</Text>
            {/* 평균의 모수 = 별점이 있는 기록 수 — 전체 기록 수로 표기하면 라벨과 실제 계산이 어긋난다 */}
            <Text style={styles.ratingBasis}>{t('stats.ratingBasis', { count: ratedRecordsCount })}</Text>
            <Text style={styles.ratingAvg}>{avgRating}</Text>
            <View style={styles.ratingStarRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Text
                  key={star}
                  style={[
                    styles.ratingStarBig,
                    { color: star <= Math.round(Number(avgRating)) ? '#FFBC00' : 'rgba(255,255,255,0.6)' },
                  ]}
                >
                  ★
                </Text>
              ))}
            </View>
          </View>

          {/* 랭킹 노드 — 유리(흰 3%) 배경 + 그라데이션 링(순위 낮을수록 옅게) */}
          {ARC_COUNTRIES.map((c, i) => {
            // 궤도 캐러셀 — 6개 이상: 전체 순위 선형 순환(숨은 나라는 가장자리 밖 대기),
            // 5개 이하: 기존 5슬롯 회전. 정지 상태(오프셋 0)에선 1위가 중앙 상단.
            const n = ARC_COUNTRIES.length;
            let pos: { x: number; y: number; gr: number; opacity: number } | null;
            if (n > 5) {
              const q = (((i + 2 + orbitShift) % n) + n) % n; // +2: 1위를 중앙 슬롯에
              pos = orbitCarouselAt(q, n);
            } else {
              pos = { ...orbitNodeAt(NODE_ORDER_POS[i] + orbitShift), opacity: 1 };
            }
            if (!pos) return null;
            const { x: gx, y: gy, gr, opacity } = pos;
            const size = gr * 2 * OS;
            const left = gx * OS - size / 2;
            const top = gy * OS - size / 2;
            const big = gr >= 33;   // 상단 대형 슬롯 부근
            const small = gr <= 26; // 가장자리 소형 슬롯 부근
            return (
              <Pressable
                key={`${c.name}-${c.rank}`}
                style={{ position: 'absolute', left, top, opacity }}
                onPress={() => goToDetail('countries')}
              >
                <View style={[styles.arcNode, { width: size, height: size, borderRadius: size / 2 }]}>
                  {/* 프로스트 유리 — 뒤로 지나는 궤도선이 원 안에서 번져 보이게(글라스 굴절). 어두움 낮춰 선이 비치게 */}
                  <BlurView intensity={14} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
                  <Text style={[styles.arcRank, small && styles.arcRankSmall]}>{String(c.rank).padStart(2, '0')}</Text>
                  <Text
                    style={[styles.arcName, big && styles.arcNameTop, small && styles.arcNameSmall]}
                    numberOfLines={1}
                    {...andFitText}
                  >
                    {c.name}
                  </Text>
                  <Text style={[styles.arcVisits, { color: globePalette[0] }, small && styles.arcVisitsSmall]} {...andFitText}>
                    {t('stats.visitsUnit', { count: c.visits })}
                  </Text>
                </View>
                {/* 노드 링 — 개별 마젠타→시안 그라데이션 스트로크, 순위별 불투명도 1/0.5/0.2 */}
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  <Svg width={size} height={size}>
                    <SvgDefs>
                      <SvgLinearGradient id={`arcNodeRing${i}`} x1="26%" y1="0%" x2="76%" y2="60%">
                        <SvgStop offset="0" stopColor={halfRing[0]} />
                        <SvgStop offset="1" stopColor={halfRing[1]} />
                      </SvgLinearGradient>
                    </SvgDefs>
                    <SvgCircle
                      cx={size / 2}
                      cy={size / 2}
                      r={size / 2 - 0.5}
                      stroke={`url(#arcNodeRing${i})`}
                      strokeOpacity={NODE_RING_OPACITY[Math.min(i, 4)]}
                      strokeWidth={1}
                      fill="none"
                    />
                  </Svg>
                </View>
              </Pressable>
            );
          })}
          {sortedCountries.length === 0 && (
            <Text style={styles.arcEmpty}>{t('stats.noRecords')}</Text>
          )}

        </View>
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
    fontSize: 37, // 시안: 캡 높이 ~28의 큰 흰색 숫자
    fontFamily: Typography.fontFamily.extraBold,
    color: Colors.textPrimary,
    letterSpacing: -1,
  },
  heroLabel: {
    // 시안: AppleSDGothicNeoEB00 15px / 행간 130% / 자간 -0.1
    // Inter(앱 폰트)는 한글 글리프가 없어 family 지정 시 굵기가 유실됨 —
    // 한글은 시스템 폰트(iOS=Apple SD Gothic Neo)가 렌더하므로 weight 800으로 EB를 재현한다
    fontSize: 16.5,
    fontWeight: '800',
    lineHeight: 21.5, // 130%
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
    fontSize: 20,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  miniStatLbl: {
    // 시안: 흰색 50% 라벨
    fontSize: 12,
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

  // ── TOP 국가 궤도 + Travel Rating 통합 섹션 (시안: Group 2085664582) ──
  orbitSection: {
    width: ARC_W,
    height: ORBIT_H,
    marginTop: Spacing[3],
  },
  arcEmpty: {
    position: 'absolute',
    top: 40 * OS,
    left: 0,
    right: 0,
    color: Colors.textMuted,
    fontSize: Typography.fontSize.xs,
    textAlign: 'center',
    fontFamily: Typography.fontFamily.regular,
  },
  arcNode: {
    // 시안: 유리(흰 3%) 원 — 링은 노드별 SVG 스트로크가 담당
    backgroundColor: 'rgba(217,217,217,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    overflow: 'hidden', // 프로스트 블러를 원형으로 클리핑
  },
  arcRank: {
    fontSize: 9,
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamily.semiBold,
    letterSpacing: 1,
  },
  arcRankSmall: { fontSize: 7 },
  arcName: {
    fontSize: 11,
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamily.bold,
    marginTop: 1,
    maxWidth: '92%',
    textAlign: 'center',
  },
  arcNameTop: { fontSize: 15 },
  arcNameSmall: { fontSize: 8 },
  arcVisits: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    marginTop: 1,
  },
  arcVisitsSmall: { fontSize: 8 },

  // 별점 뒤 유리 원판 — 시안 Ellipse 3062 크기 그대로 (중심 (168.5, 200.5), r 77.5)
  // 블러(유리) + 틴트 + 상단 반사 하이라이트 조합
  // 맨뒤 유리 원판(배경 구) — 중심 (167.5, 194.5), r 108.5 → 지름 217*OS
  ratingDiskBack: {
    position: 'absolute',
    left: (168.46 - 108.5) * OS, // 문양과 동심 (중심 168.46,193)
    top: (193 - 108.5) * OS,
    width: 217 * OS,
    height: 217 * OS,
    borderRadius: (217 * OS) / 2,
    overflow: 'hidden', // 블러·테두리를 원형으로 클리핑
    opacity: 0.2,
  },
  ratingDiskBackTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.03)', // #FFFFFF08 (3%)
  },

  ratingDisk: {
    position: 'absolute',
    left: (168.5 - 77.5) * OS,
    top: (200.5 - 77.5) * OS,
    width: 155 * OS,
    height: 155 * OS,
    borderRadius: (155 * OS) / 2,
    overflow: 'hidden', // 블러를 원형으로 클리핑
  },
  ratingDiskTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.03)', // #FFFFFF08 (3%)
  },

  // 3겹 유리 원판 — #D9D9D908(3%) + blur. 지구본 문양(≈185*OS)보다 작고 Travel Rating을 감싸는 크기.
  // 중심 168.46,201 (문양보다 8 아래로 내림), r 85 → 지름 170*OS
  ratingDisk3: {
    position: 'absolute',
    left: (168.46 - 85) * OS,
    top: (201 - 85) * OS,
    width: 170 * OS,
    height: 170 * OS,
    borderRadius: (170 * OS) / 2,
    overflow: 'hidden',
  },
  ratingDisk3Tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(217,217,217,0.03)', // #D9D9D908 (3%)
  },
  // 맨앞 원판 테두리 오버레이 — ratingDisk3와 동일 위치(중심 168.46,201), 문양블러 위에 그림
  ratingDisk3BorderBox: {
    position: 'absolute',
    left: (168.46 - 85) * OS,
    top: (201 - 85) * OS,
  },

  // 지구본 문양 위에 얹는 얇은 원형 블러 — 격자 패스(그라데이션 y 98.65~287.4, 중심≈193 r≈95)에 맞춤
  globeGridBlur: {
    position: 'absolute',
    left: (168.46 - 95) * OS, // 문양과 동심 (중심 168.46,193)
    top: (193 - 95) * OS,
    width: 190 * OS,
    height: 190 * OS,
    borderRadius: (190 * OS) / 2,
    overflow: 'hidden', // 사각 경계 없이 원형으로 클리핑
  },

  // Travel Rating — 지구본 중앙 오버레이 (시안: 제목 y≈145, 별 y≈235)
  ratingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 140 * OS, // 맨앞 원판(중심 201)에 맞춰 +8 내림
    alignItems: 'center',
  },
  ratingTitle: {
    fontSize: 15,
    fontWeight: '800', // 한글 EB — heroLabel과 동일한 이유로 시스템 폰트 800
    color: Colors.textPrimary,
  },
  ratingBasis: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: Typography.fontFamily.regular,
    marginTop: 7,
  },
  ratingAvg: {
    fontSize: 32,
    fontFamily: Typography.fontFamily.extraBold,
    color: Colors.textPrimary,
    letterSpacing: -1,
    marginTop: 9,
  },
  ratingStarRow: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 6,
  },
  ratingStarBig: {
    fontSize: 19,
  },
});
