import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  Platform,
  type LayoutChangeEvent,
} from 'react-native';
import { Text } from '../ui/Text';
import { useStageWidth } from '../utils/stage';
import { TAB_BAR_H, TAB_BAR_GAP } from '../utils/tabBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RecordFab } from './RecordFab';
import { GlassSurface } from './GlassSurface';
import { useCoachActive } from './coachOverlayState';
import { useTabBarHidden } from './tabBarVisibility';
import { useSkinAccent } from '../constants/skinTheme';
import { andFitText } from '../utils/fitText';
import Svg, {
  Path as SvgPath,
  Line as SvgLine,
  Mask as SvgMask,
  Rect as SvgRect,
  Defs as SvgDefs,
  LinearGradient as SvgLinearGradient,
  Stop as SvgStop,
} from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  interpolate,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';

// 테두리 Rect 의 폭만 컨테이너 폭에 맞춰 애니메이션
const AnimatedRect = Animated.createAnimatedComponent(SvgRect);

// ─── 색상 (디자인 토큰, SVG 그대로) ───
const ACTIVE_COLOR = '#FFFFFF';     // 활성 아이콘·텍스트
const INACTIVE_COLOR = '#9DB2CE';   // 비활성 아이콘 (탁한 청회색)
const PILL_FILL = 'rgba(117, 26, 173, 0.3)'; // 활성 알약 본체 채움 (30% 불투명)

// ─── 치수 (SVG 시안 그대로) ───
// ⚠️ 높이와 띄움(TAB_BAR_GAP)은 utils/tabBar.ts가 단일 출처다. 탭 화면들의 하단 여백
// (useTabBarClearance)이 같은 값에서 나오므로, 여기에 리터럴을 되돌리면 화면 여백만
// 옛 값에 남아 다시 갈라진다 — 실제로 그렇게 갈라져 하단 콘텐츠가 바에 먹혔다.
const BAR_H = TAB_BAR_H;   // 컨테이너 높이
const BAR_R = 31.5;        // 높이의 절반 = 완전 둥근형
const BAR_W_GLOBE = 323;   // Globe 활성 시 컨테이너 폭
const BAR_W_OTHER = 348;   // 나머지 활성 시 컨테이너 폭
// 좁은 화면에서 남길 최소 좌우 여백. 위 폭은 시안 기준 고정값이라 화면이 이보다 좁으면
// 그대로 쓸 수 없다 — 예전엔 left 만 Math.max(16) 로 막아서 폭은 348 그대로였고,
// 그 결과 320pt('확대 표시' 설정)에서 오른쪽 44pt 가 화면 밖으로 나가 마지막 탭이
// 잘리고 눌리지도 않았다(360pt mini 에서도 4pt 넘침). 이제 폭 자체를 줄인다.
const BAR_SIDE_MIN = 16;

const PILL_H = 36;         // 가로 알약 높이
const H_COLLAPSED_W = 48;  // 비활성(아이콘만) 폭
const H_ACTIVE_W = 90;     // 가로 활성 알약 폭

const G_PILL_H = 46;       // Globe 활성 알약 높이 (세로 배치)
const G_COLLAPSED_W = 48;  // Globe 비활성 폭
const G_ACTIVE_W = 88;     // Globe 활성 알약 폭

const ICON_LEFT = 13;      // 가로 알약 안쪽 아이콘 좌측 여백
const ICON_BOX = 22;       // 아이콘 박스 폭
const LABEL_LEFT = ICON_LEFT + ICON_BOX + 6; // 아이콘 + 8px 간격 후 라벨

const ANIM = { duration: 260, easing: Easing.out(Easing.cubic) };

// 드래그 추종에 쓰는 임계값 (기존 스와이프 판정과 동일한 값 — UX 퇴행 방지)
const SWIPE_DX = 36;   // 이만큼 끌면 확실한 이동 의사
const SWIPE_VX = 0.3;  // 짧아도 이만큼 빠르면 플릭

// 손가락 x(tabRow 로컬 좌표) → 연속 탭 인덱스(float).
// 탭 간격이 균일하지 않다(space-between + 좌18/우28 비대칭 패딩 + 탭마다 폭이 다름).
// 그래서 "폭 ÷ 개수" 로는 못 구하고 실측 중심들 사이를 구간별로 역보간해야 한다.
const xToFloatIndex = (x: number, centers: number[]): number => {
  const n = centers.length;
  if (n < 2) return 0;
  if (x <= centers[0]) return 0;
  if (x >= centers[n - 1]) return n - 1;
  for (let i = 0; i < n - 1; i++) {
    const a = centers[i];
    const b = centers[i + 1];
    if (x >= a && x <= b) {
      const span = b - a;
      return span <= 0 ? i : i + (x - a) / span;
    }
  }
  return n - 1;
};

interface TabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

// SVG 시안의 라벨 (Globe / Analysis / Social / Profile)
const TAB_LABELS: Record<string, string> = {
  MainTab: 'Globe',
  StatsTab: 'Analysis',
  SocialTab: 'Social',
  ProfileTab: 'Profile',
};

// ─── 아이콘 (≈24px, SVG 패스 그대로) ───

// Globe: 위도·경도 선이 있는 라인형 지구본
const GlobeIcon = ({ active }: { active: boolean }) => {
  const stroke = active ? ACTIVE_COLOR : INACTIVE_COLOR;
  return (
    <Svg width={22.7} height={22.7} viewBox="19 19 23 23" fill="none">
      <SvgPath d="M30.1367 20.4941C32.8204 20.4942 35.1082 21.4237 36.9648 23.2793C38.8395 25.1198 39.7793 27.4013 39.7793 30.0869V30.0898L39.7764 30.334V30.3369C39.7196 32.9162 38.7801 35.1207 36.9648 36.9189C35.1075 38.7588 32.8198 39.6797 30.1367 39.6797C27.538 39.6797 25.3026 38.8157 23.4619 37.0898L23.459 37.0879L23.2871 36.9229L23.2842 36.9189L23.2812 36.917C21.4245 35.0601 20.4942 32.7715 20.4941 30.0869C20.4942 27.4021 21.4245 25.1205 23.2832 23.2793C25.156 21.424 27.452 20.4941 30.1367 20.4941ZM30.1357 21.2969C27.6578 21.2971 25.5672 22.1472 23.8486 23.8496L23.6885 24.0117L23.6875 24.0107C22.0934 25.6657 21.2969 27.6866 21.2969 30.0869L21.2998 30.3193L21.3184 30.7598C21.4601 32.9433 22.3027 34.8019 23.8477 36.3477L24.1641 36.6455C25.7662 38.0844 27.6765 38.8271 29.9053 38.875H29.9043L30.1367 38.876C32.6159 38.876 34.6986 38.0344 36.4004 36.3486C38.1184 34.6466 38.9765 32.5645 38.9766 30.0869C38.9765 27.6094 38.1186 25.5358 36.4014 23.8506L36.3994 23.8486C34.7503 22.1996 32.7443 21.3504 30.3682 21.2988V21.2979L30.1357 21.2969Z" fill={stroke} stroke={stroke} strokeWidth={0.491935} />
      <SvgPath d="M30.0572 21.1836C28.5044 24.0675 27.8389 27.395 27.8389 30.2789C27.8389 33.8282 28.8741 38.0431 30.0572 39.3741" stroke={stroke} />
      <SvgPath d="M30.5014 21.1836C32.2268 24.1031 32.7197 28.5945 32.7197 30.6157C32.7197 32.6369 31.9803 38.0267 30.5014 39.3741" stroke={stroke} />
      <SvgPath d="M30.0575 21.1836C26.7363 22.958 24.7334 25.8442 24.7334 30.9456C24.7334 36.0471 27.3905 38.7087 29.1619 39.3741" stroke={stroke} />
      <SvgPath d="M30.5011 21.1836C33.8223 22.958 35.8252 26.3488 35.8252 30.6157C35.8252 34.8826 33.1681 38.7087 31.3967 39.3741" stroke={stroke} />
      <SvgLine x1="30.2998" y1="20.7402" x2="30.2998" y2="39.3744" stroke={stroke} />
      <SvgLine x1="20.7402" y1="30.001" x2="39.3744" y2="30.001" stroke={stroke} />
      <SvgLine x1="21.6279" y1="33.5503" x2="38.4874" y2="33.5503" stroke={stroke} />
      <SvgLine x1="21.6279" y1="26.4521" x2="38.9311" y2="26.4521" stroke={stroke} />
    </Svg>
  );
};

// Analysis(통계): 막대그래프
const StatsIcon = ({ active }: { active: boolean }) => {
  const color = active ? ACTIVE_COLOR : INACTIVE_COLOR;
  return (
    <Svg width={18.19} height={14} viewBox="21.09 21.09 18.19 14" fill="none">
      <SvgPath d="M21.8281 29.5913H22.8115C22.9344 29.5915 23.0488 29.6953 23.0488 29.8413V34.3413C23.0488 34.4873 22.9344 34.5911 22.8115 34.5913H21.8281C21.7051 34.5913 21.5909 34.4874 21.5908 34.3413V29.8413C21.5908 29.6952 21.7051 29.5913 21.8281 29.5913Z" stroke={color} />
      <SvgPath d="M25.7598 25.5913H26.7432C26.8661 25.5915 26.9805 25.6953 26.9805 25.8413V34.3413C26.9804 34.4872 26.866 34.5911 26.7432 34.5913H25.7598C25.6368 34.5913 25.5225 34.4874 25.5225 34.3413V25.8413C25.5225 25.6952 25.6367 25.5913 25.7598 25.5913Z" stroke={color} />
      <SvgPath d="M29.6924 27.5913H30.6758C30.7987 27.5915 30.9131 27.6953 30.9131 27.8413V34.3413C30.913 34.4873 30.7986 34.5911 30.6758 34.5913H29.6924C29.5694 34.5913 29.4551 34.4874 29.4551 34.3413V27.8413C29.4551 27.6952 29.5693 27.5913 29.6924 27.5913Z" stroke={color} />
      <SvgPath d="M33.625 21.5913H34.6084C34.7313 21.5915 34.8457 21.6953 34.8457 21.8413V34.3413C34.8456 34.4872 34.7312 34.5911 34.6084 34.5913H33.625C33.502 34.5913 33.3878 34.4873 33.3877 34.3413V21.8413C33.3877 21.6952 33.502 21.5913 33.625 21.5913Z" stroke={color} />
      <SvgPath d="M37.5566 25.5913H38.54C38.6629 25.5915 38.7773 25.6953 38.7773 25.8413V34.3413C38.7773 34.4872 38.6629 34.5911 38.54 34.5913H37.5566C37.4336 34.5913 37.3194 34.4874 37.3193 34.3413V25.8413C37.3193 25.6952 37.4336 25.5913 37.5566 25.5913Z" stroke={color} />
    </Svg>
  );
};

// Social: 사람 둘
const SocialIcon = ({ active }: { active: boolean }) => {
  const color = active ? ACTIVE_COLOR : INACTIVE_COLOR;
  return (
    <Svg width={22.04} height={16.62} viewBox="21.18 20.7 22.04 16.62" fill="none">
      <SvgPath d="M27.7402 36.9435C27.7402 33.5193 31.1148 30.7402 35.2586 30.7402C39.4024 30.7402 42.777 33.5193 42.777 36.9435" stroke={color} strokeWidth={1.22} strokeLinecap="round" />
      <SvgPath d="M34.876 21.3506C36.823 21.3507 38.4014 22.929 38.4014 24.876C38.4012 26.8229 36.8229 28.4012 34.876 28.4014C32.929 28.4014 31.3507 26.823 31.3506 24.876C31.3506 22.9289 32.9289 21.3506 34.876 21.3506Z" stroke={color} strokeWidth={1.22} />
      <SvgMask id="socialMask" maskUnits="userSpaceOnUse" x={20} y={17} width={24} height={24}>
        <SvgPath d="M28.2588 20.7402C28.7291 20.7403 29.181 20.8189 29.6021 20.9636C30.2276 21.1785 30.2284 21.9843 29.8528 22.5287C29.3925 23.1956 29.123 24.0044 29.123 24.876C29.1231 25.7473 29.3928 26.5554 29.853 27.2219C30.2288 27.7659 30.2282 28.5716 29.6032 28.7872C29.1818 28.9326 28.7296 29.0117 28.2588 29.0117C25.9749 29.0117 24.1232 27.1599 24.123 24.876C24.123 22.592 25.9748 20.7402 28.2588 20.7402Z" fill="#fff" />
      </SvgMask>
      <SvgPath d="M28.2588 20.7402L28.2588 19.7402H28.2588V20.7402ZM29.123 24.876H28.123V24.876L29.123 24.876ZM28.2588 29.0117V30.0117H28.2588L28.2588 29.0117ZM24.123 24.876H23.123V24.876L24.123 24.876ZM29.6032 28.7872L29.2771 27.8419L29.6032 28.7872ZM29.6021 20.9636L29.2772 21.9093L29.6021 20.9636ZM29.8528 22.5287L29.0297 21.9607L29.8528 22.5287ZM28.2588 20.7402L28.2587 21.7402C28.617 21.7403 28.9591 21.8 29.2772 21.9093L29.6021 20.9636L29.9271 20.0178C29.4028 19.8377 28.8412 19.7403 28.2588 19.7402L28.2588 20.7402ZM29.8528 22.5287L29.0297 21.9607C28.4579 22.7893 28.123 23.7952 28.123 24.876H29.123H30.123C30.123 24.2137 30.3271 23.6019 30.6758 23.0966L29.8528 22.5287ZM29.123 24.876L28.123 24.876C28.1231 25.9568 28.4583 26.9621 29.0302 27.7901L29.853 27.2219L30.6759 26.6536C30.3272 26.1487 30.1231 25.5377 30.123 24.8759L29.123 24.876ZM29.6032 28.7872L29.2771 27.8419C28.9589 27.9516 28.6168 28.0117 28.2587 28.0117L28.2588 29.0117L28.2588 30.0117C28.8424 30.0117 29.4047 29.9135 29.9293 29.7325L29.6032 28.7872ZM28.2588 29.0117V28.0117C26.5272 28.0117 25.1231 26.6076 25.123 24.8759L24.123 24.876L23.123 24.876C23.1232 27.7121 25.4225 30.0117 28.2588 30.0117V29.0117ZM24.123 24.876H25.123C25.123 23.1443 26.5271 21.7402 28.2588 21.7402V20.7402V19.7402C25.4225 19.7402 23.123 22.0397 23.123 24.876H24.123ZM29.853 27.2219L29.0302 27.7901C29.0597 27.8329 29.083 27.8832 29.0966 27.9324C29.1106 27.9828 29.1098 28.0147 29.1089 28.0227C29.1082 28.0299 29.1103 27.9952 29.1464 27.945C29.1644 27.9199 29.1875 27.8961 29.214 27.8765C29.2405 27.8569 29.2634 27.8466 29.2771 27.8419L29.6032 28.7872L29.9293 29.7325C30.6797 29.4736 31.0343 28.8346 31.0979 28.2327C31.1572 27.6705 30.9826 27.0977 30.6759 26.6536L29.853 27.2219ZM29.6021 20.9636L29.2772 21.9093C29.2636 21.9046 29.2405 21.8943 29.214 21.8747C29.1874 21.8551 29.1642 21.8313 29.1461 21.806C29.1099 21.7557 29.1077 21.7209 29.1084 21.728C29.1093 21.736 29.1101 21.7678 29.0962 21.8182C29.0826 21.8675 29.0593 21.9178 29.0297 21.9607L29.8528 22.5287L30.6758 23.0966C30.9824 22.6524 31.1569 22.0795 31.0973 21.5171C31.0335 20.915 30.6782 20.2759 29.9271 20.0178L29.6021 20.9636Z" fill={color} mask="url(#socialMask)" />
      <SvgPath d="M21.1533 37.3574C20.922 37.3572 20.7402 37.1748 20.7402 36.9434C20.7403 33.5192 24.1151 30.7402 28.2588 30.7402C28.9972 30.7402 29.0833 31.7457 28.4737 32.1621L28.168 32.3828C26.6766 33.5163 25.7403 35.1401 25.7403 36.9434C25.7403 37.1748 25.9038 37.3574 26.4038 37.3574H21.1533ZM27.3008 31.7959C24.2859 32.1459 22.113 34.1225 21.7852 36.3574H24.7715C24.9436 34.5437 25.9023 32.9534 27.3008 31.7959Z" fill={color} />
    </Svg>
  );
};

// Profile: 사람 하나
const ProfileIcon = ({ active }: { active: boolean }) => {
  const color = active ? ACTIVE_COLOR : INACTIVE_COLOR;
  return (
    <Svg width={19.52} height={19.52} viewBox="20.74 20.74 19.52 19.52" fill="none">
      <SvgPath d="M30.5003 30.5C32.7462 30.5 34.5669 28.6793 34.5669 26.4334C34.5669 24.1874 32.7462 22.3667 30.5003 22.3667C28.2543 22.3667 26.4336 24.1874 26.4336 26.4334C26.4336 28.6793 28.2543 30.5 30.5003 30.5Z" stroke={color} strokeWidth={1.22} strokeLinecap="round" strokeLinejoin="round" />
      <SvgPath d="M37.4867 38.6338C37.4867 35.4862 34.3554 32.9404 30.5002 32.9404C26.645 32.9404 23.5137 35.4862 23.5137 38.6338" stroke={color} strokeWidth={1.22} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};

const TAB_ICON_COMPONENTS: Record<string, React.FC<{ active: boolean }>> = {
  MainTab: GlobeIcon,
  StatsTab: StatsIcon,
  SocialTab: SocialIcon,
  ProfileTab: ProfileIcon,
};

// ─── 개별 탭 (아이콘만 ↔ 보라 알약 width morph) ───
const TabItem: React.FC<{
  progress: SharedValue<number>;
  isGlobe: boolean;
  uid: string;
  label: string;
  IconComponent: React.FC<{ active: boolean }>;
  isFocused: boolean;
  onPress: () => void;
  pillColor: string; // 활성 알약 채움색 (스킨 강조색)
  // 드래그 추종(iOS)용 탭 중심 실측. 부모(tabRow) 기준 로컬 좌표가 그대로 필요해서
  // measure 가 아니라 onLayout 을 쓴다. 안드로이드에서는 undefined 로 넘어와 무동작.
  onLayoutTab?: (e: LayoutChangeEvent) => void;
}> = ({ progress, isGlobe, uid, label, IconComponent, isFocused, onPress, pillColor, onLayoutTab }) => {
  const H = isGlobe ? G_PILL_H : PILL_H; // 알약 높이
  const R = H / 2;                       // 알약 모서리 반경

  // 알약 폭 모핑 (아이콘만 → 활성)
  const pillStyle = useAnimatedStyle(() => ({
    width: isGlobe
      ? interpolate(progress.value, [0, 1], [G_COLLAPSED_W, G_ACTIVE_W])
      : interpolate(progress.value, [0, 1], [H_COLLAPSED_W, H_ACTIVE_W]),
  }));

  // 본체(평면 보라 알약)는 활성일 때만 페이드 인
  const depthStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  // 알약 테두리(stroke) 폭을 알약 폭에 맞춰 애니메이션 (1px stroke 안 잘리게 -1 인셋)
  const pillBorderProps = useAnimatedProps(() => {
    const w = isGlobe
      ? interpolate(progress.value, [0, 1], [G_COLLAPSED_W, G_ACTIVE_W])
      : interpolate(progress.value, [0, 1], [H_COLLAPSED_W, H_ACTIVE_W]);
    return { width: Math.max(0, w - 1) };
  });

  // 라벨: 펼쳐질 때 페이드 인 (Globe는 아이콘 아래, 나머지는 우측)
  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.4, 1], [0, 1], 'clamp'),
  }));

  // 아이콘 색 전환: 활성/비활성 두 아이콘 크로스페이드
  const activeIconStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const inactiveIconStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));

  // Globe 활성 시 아이콘을 살짝 위로 올려 아래 라벨 공간 확보
  const iconShiftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: isGlobe ? interpolate(progress.value, [0, 1], [0, -6]) : 0 }],
  }));

  return (
    <TouchableOpacity
      style={styles.tab}
      onPress={onPress}
      onLayout={onLayoutTab}
      activeOpacity={0.85}
      accessibilityRole="button"
      // 라벨 Text는 비활성 탭에서 투명도 0으로 사라진다(labelStyle) — 화면에서 안 보이는
      // 텍스트에 낭독을 맡기지 않고 여기서 명시한다.
      accessibilityLabel={label}
      accessibilityState={isFocused ? { selected: true } : {}}
    >
      <Animated.View style={[isGlobe ? styles.pillGlobe : styles.pillH, pillStyle]}>
        {/* 활성 알약: 보라 면 + #CECFCD 그라데이션 '테두리만'(stroke) + 검정 드롭섀도 */}
        <Animated.View style={[StyleSheet.absoluteFill, depthStyle]} pointerEvents="none">
          <View style={[styles.bodyFill, { borderRadius: R, backgroundColor: pillColor }]} />
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <SvgDefs>
              {/* 배경 테두리와 동일한 #CECFCD → 투명 그라데이션 */}
              <SvgLinearGradient id={`pillBorder-${uid}`} x1="0.216" y1="-0.08" x2="0.283" y2="1.10">
                <SvgStop offset="0" stopColor="#CECFCD" stopOpacity="1" />
                <SvgStop offset="0.607" stopColor="#CECFCD" stopOpacity="0" />
              </SvgLinearGradient>
            </SvgDefs>
            <AnimatedRect
              animatedProps={pillBorderProps}
              x={0.5}
              y={0.5}
              height={H - 1}
              rx={R - 0.5}
              ry={R - 0.5}
              fill="none"
              stroke={`url(#pillBorder-${uid})`}
              strokeWidth={1}
            />
          </Svg>
        </Animated.View>

        {/* 콘텐츠 (아이콘 + 라벨) — 맨 위, 알약 모양으로 클립 */}
        <View style={[styles.contentClip, { borderRadius: R }]}>
          {/* 아이콘 (활성/비활성 크로스페이드) */}
          <Animated.View
            style={[isGlobe ? styles.iconBoxGlobe : styles.iconBox, iconShiftStyle]}
            pointerEvents="none"
          >
            <Animated.View style={[StyleSheet.absoluteFill, styles.center, inactiveIconStyle]}>
              <IconComponent active={false} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, styles.center, activeIconStyle]}>
              <IconComponent active />
            </Animated.View>
          </Animated.View>

          {/* 라벨 */}
          <Animated.View
            style={[isGlobe ? styles.labelBoxGlobe : styles.labelBoxH, labelStyle]}
            pointerEvents="none"
          >
            <Text style={styles.label} numberOfLines={1} {...andFitText}>{label}</Text>
          </Animated.View>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
};

export const CustomTabBar: React.FC<TabBarProps> = ({ state, navigation }) => {
  const insets = useSafeAreaInsets();
  // 탭 바는 TabNavigator의 tabBar로 그려져 App.tsx의 클램프된 Stage 컬럼 "안"에 있다.
  // styles.container가 position:'absolute'라 아래 left는 창이 아니라 그 컬럼 기준(로컬 좌표)이다.
  // 여기에 창 폭(useWindowDimensions)을 쓰면 폴드·태블릿에서 바가 gutter만큼 통째로
  // 오른쪽으로 밀려 컬럼 밖으로 삐져나가고, 같은 레이어의 RecordFab(fabWrap: left0/right0
  // + alignItems:'center' → 컬럼 중앙)과 눈에 띄게 어긋난다. 반드시 Stage 폭을 쓴다.
  // 훅이라 useAnimatedStyle 내부에서 읽어도 창 크기 변화에 그대로 반응한다.
  const STAGE_W = useStageWidth();
  // 튜토리얼(코치마크) 중에는 탭 바도 다른 구역처럼 어둡게.
  const coachActive = useCoachActive();
  // 지구본 스킨 강조색 — 활성 알약 채움색에 적용 (스킨 바뀌면 자동 갱신)
  const skinAccent = useSkinAccent();
  // 빠른공유(카드 꾹 눌러 드래그) 동안 잠시 숨김 — 페이드 + 아래로 슬라이드
  const tabBarHidden = useTabBarHidden();
  const hideProgress = useSharedValue(0);
  useEffect(() => {
    hideProgress.value = withTiming(tabBarHidden ? 1 : 0, { duration: 180, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabBarHidden]);

  const isGlobeActive = state.routes[state.index]?.name === 'MainTab';

  // 탭별 진행도 (0 = 아이콘만, 1 = 활성 알약) — 탭은 항상 4개
  const p0 = useSharedValue(state.index === 0 ? 1 : 0);
  const p1 = useSharedValue(state.index === 1 ? 1 : 0);
  const p2 = useSharedValue(state.index === 2 ? 1 : 0);
  const p3 = useSharedValue(state.index === 3 ? 1 : 0);
  const progresses = [p0, p1, p2, p3];

  // 컨테이너 폭 (Globe 323 ↔ 나머지 348)
  const barW = useSharedValue(isGlobeActive ? BAR_W_GLOBE : BAR_W_OTHER);

  useEffect(() => {
    progresses.forEach((sv, i) => {
      sv.value = withTiming(i === state.index ? 1 : 0, ANIM);
    });
    barW.value = withTiming(isGlobeActive ? BAR_W_GLOBE : BAR_W_OTHER, ANIM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.index]);

  // ⚠️ 안드로이드: 폭을 reanimated로 애니메이션하면 컨테이너 프레임만 바뀌고 그 안의
  // absoluteFill 자식들(유리 매트·테두리 SVG·탭 행)은 이전 폭 그대로 레이아웃된다.
  // 실측(2026-08-18): 비-Globe 탭에서 onLayout은 348dp를 보고하는데 실제로 그려진 바는
  // 323dp(=Globe 폭)에서 끝나, 컨테이너는 가운데인데 내용물만 왼쪽으로 쏠려 좌우가 어긋났다.
  // → 안드로이드는 폭·좌표를 React 상태로 커밋해 섀도 트리가 실제로 다시 레이아웃되게 한다.
  //   (iOS는 기존 reanimated 경로 그대로 — 부드러운 폭 모프가 유지된다)
  const [barWCommitted, setBarWCommitted] = useState(isGlobeActive ? BAR_W_GLOBE : BAR_W_OTHER);
  useEffect(() => {
    setBarWCommitted(isGlobeActive ? BAR_W_GLOBE : BAR_W_OTHER);
  }, [isGlobeActive]);
  const androidSize = useMemo(() => {
    if (Platform.OS === 'ios') return null;
    const w = Math.min(barWCommitted, STAGE_W - BAR_SIDE_MIN * 2);
    return { width: w, left: (STAGE_W - w) / 2 };
  }, [barWCommitted, STAGE_W]);

  // 컨테이너 폭/좌표 (폭 변화에 따라 가운데 정렬 유지) + 숨김 페이드·슬라이드
  const containerStyle = useAnimatedStyle(() => {
    // 화면에 안 들어가면 폭을 줄여 맞춘다(BAR_SIDE_MIN 주석 참고). 안 줄이면 잘린다.
    const w = Math.min(barW.value, STAGE_W - BAR_SIDE_MIN * 2);
    const fade = {
      opacity: 1 - hideProgress.value,
      transform: [{ translateY: hideProgress.value * 24 }],
    };
    // 안드로이드는 위 androidSize가 폭·좌표를 맡는다(여기서 주면 자식 레이아웃이 어긋난다)
    if (Platform.OS !== 'ios') return fade;
    return { width: w, left: (STAGE_W - w) / 2, ...fade };
  });
  // 테두리 stroke Rect 의 폭만 컨테이너 폭에 맞춰 갱신 (1.5px stroke 안 잘리게 0.75 인셋).
  // 컨테이너와 같은 클램프를 써야 좁은 화면에서 테두리만 삐져나오지 않는다.
  const borderRectProps = useAnimatedProps(() => ({
    width: Math.max(0, Math.min(barW.value, STAGE_W - BAR_SIDE_MIN * 2) - 1.5),
  }));
  // ⚠️ 안드로이드에서는 위 animatedProps 가 Rect 에 전혀 반영되지 않는다(실험으로 확인:
  // 상수 폭을 넣어도 그림이 안 바뀐다). 그래서 Rect 폭이 첫 렌더 값(Globe 323dp)에 박혀
  // 컨테이너·유리 매트만 348dp로 늘어나고 테두리는 323dp에서 끊겨 오른쪽에 테두리 곡선이
  // 두 겹으로 보였다. 상태로 커밋된 폭(barWCommitted)을 정적 prop 으로 직접 준다.
  // iOS 는 animatedProps 가 정상 동작하므로 undefined 를 넘겨 기존 경로를 그대로 쓴다.
  const borderStaticW = Platform.OS === 'ios'
    ? undefined
    : Math.max(0, Math.min(barWCommitted, STAGE_W - BAR_SIDE_MIN * 2) - 1.5);

  // 탭바 위에서 가로 슬라이드 → 바로 옆 탭으로 이동 (PanResponder는 첫 렌더 박제 → ref로 최신 상태 참조)
  const navRef = useRef({ index: state.index, routes: state.routes, navigation });
  navRef.current = { index: state.index, routes: state.routes, navigation };

  // 탭으로 이동하고 "실제로 이동한 인덱스"를 돌려준다.
  // 범위 밖이거나 tabPress 가 preventDefault 되면 현재 인덱스 그대로 — 이걸 알아야
  // 드래그 종료 애니메이션이 엉뚱한 탭으로 안착하지 않는다.
  const goToTab = (target: number): number => {
    const { index, routes, navigation: nav } = navRef.current;
    if (target < 0 || target >= routes.length || target === index) return index;
    const route = routes[target];
    const event = nav.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (event.defaultPrevented) return index;
    nav.navigate(route.name);
    return target;
  };

  const goAdjacentTab = (dir: 1 | -1) => {
    goToTab(navRef.current.index + dir);
  };

  // ─── 드래그 추종 (iOS 전용) ───
  // 별도 인디케이터 뷰를 만들지 않고, 손가락 위치로 구한 연속 인덱스(float)를 각 탭의
  // progress 에 직접 꽂는다: p_i = max(0, 1 - |float - i|).
  // 손가락이 두 탭 사이면 한쪽 알약이 줄고 옆 알약이 자라는 교차 모핑이 되어,
  // 보라 알약이 손가락을 따라 흐르는 것처럼 보인다. 기존 알약 모핑 자산을 그대로 쓰므로
  // Globe(세로형 46) ↔ 가로형(36) 사이 핸드오프도 각자 자기 형태로 자라며 자동 처리된다.
  //
  // ⚠️ 부호 규약 — iOS 는 '직접 조작', 안드로이드는 '캐러셀'이라 방향이 서로 반대다.
  //   iOS   : 왼쪽으로 끌면 알약도 왼쪽으로 간다 → 이전 탭(index - 1). 알약을 직접 끄는 모델이라
  //           추종 연출과 착지가 일치해야만 의미가 있다. iOS 경로의 모든 분기(추종 반올림 /
  //           플릭 폴백 / 실측 실패 폴백)가 예외 없이 이 방향이다.
  //   안드로이드: 왼쪽으로 밀면 다음 탭(index + 1). 콘텐츠를 미는 캐러셀 규약이고 이미 출시된
  //           동작이라 건드리지 않는다. 방향이 갈리는 것은 인지하고 수용한 결정이다
  //           (이번 기능 자체가 iOS 전용 지시였고, 추종 연출이 직접 조작 방향을 내포한다).
  //   👉 나중에 안드로이드에도 추종을 이식한다면, 그때 안드로이드 부호를 iOS 쪽(직접 조작)으로
  //      맞춰 통일할 것. 규약 두 벌을 그대로 둔 채 이식하면 지금 iOS 에서 고친 결함이 그대로
  //      재발한다(끄는 방향과 착지 탭이 반대).

  // 각 탭 중심 x (tabRow 로컬 좌표). onLayout 실측 — 계산으로는 못 구한다(위 xToFloatIndex 주석).
  const tabCentersRef = useRef<number[]>([]);
  const handleTabLayout = (index: number) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    tabCentersRef.current[index] = x + width / 2;
  };

  // 드래그 1회 동안 고정되는 상태
  const dragRef = useRef({ active: false, centers: [] as number[], anchorX: 0, dx0: 0 });

  // 손가락 추종은 즉시값 — withTiming 을 태우면 손가락보다 260ms 늦게 따라온다.
  const applyFloatIndex = (f: number) => {
    progresses.forEach((sv, i) => {
      sv.value = Math.max(0, 1 - Math.abs(f - i));
    });
  };
  // 드래그 종료 후 최종 안착. state.index 가 바뀌면 위 useEffect 가 같은 목적지로 한 번 더
  // withTiming 을 걸지만 값이 같아 눈에 띄는 겹침은 없다. 반대로 인덱스가 안 바뀌는 경우
  // (같은 탭·preventDefault·terminate)엔 useEffect 가 아예 안 돌아서 이게 유일한 복원 경로다.
  const settleTo = (index: number) => {
    progresses.forEach((sv, i) => {
      sv.value = withTiming(i === index ? 1 : 0, ANIM);
    });
  };

  // PanResponder 는 첫 렌더 클로저가 박제된다 → 최신 클로저를 ref 로 갈아끼워 경유한다.
  const dragCbRef = useRef({
    onGrant: (_dx: number) => {},
    onMove: (_dx: number) => {},
    onRelease: (_dx: number, _vx: number) => {},
    onTerminate: () => {},
  });
  dragCbRef.current = {
    onGrant: (dx: number) => {
      const n = navRef.current.routes.length;
      // ⚠️ slice + every 로 검사하면 안 된다. onLayout 은 인덱스에 직접 대입하므로 일부만
      // 먼저 도착하면 [<3 empty>, 296] 같은 '성긴 배열'이 되는데, slice 는 hole 을 보존하고
      // every 는 hole 을 건너뛰어 그대로 통과시킨다 → anchorX 가 undefined → x 가 NaN →
      // xToFloatIndex 의 비교가 전부 false 라 n-1 로 떨어져 알약이 마지막 탭으로 순간이동한다.
      // 인덱스를 명시한 루프로 hole 까지 전수 확인한다.
      const centers: number[] = [];
      let ok = n >= 2;
      for (let i = 0; i < n; i++) {
        const c = tabCentersRef.current[i];
        if (!Number.isFinite(c) || c <= 0) { ok = false; break; }
        centers.push(c);
      }
      dragRef.current = {
        active: ok,
        // ⚠️ 중심 좌표는 드래그 내내 '스냅샷'을 쓴다. 알약이 자라면 space-between 이 폭을
        // 재분배해 탭 중심이 실시간으로 밀리는데, 그 값을 되먹이면 진동한다
        // (알약 성장 → 중심 이동 → float 변화 → 더 성장).
        centers: ok ? centers : [],
        // 시작점은 '현재 활성 탭의 중심'. 여기서 gestureState.dx 를 더해 나간다.
        // anchorX 가 centers[cur] 과 같은 값이라 dx=0 일 때 float 이 정확히 cur 이 된다
        // → 실측이 한 프레임 낡아도 드래그 시작 순간 알약이 튀지 않는다(간격만 미세하게 달라짐).
        anchorX: ok ? centers[Math.min(navRef.current.index, centers.length - 1)] : 0,
        // responder 를 뺏은 시점의 dx 를 기준점으로 빼둔다.
        // 현 RN 구현에서는 PanResponder 가 onPanResponderGrant 를 부르기 직전에
        // gestureState.dx 를 0 으로 리셋하므로(Libraries/Interaction/PanResponder.js) dx0 은
        // 항상 0 이고 (dx - dx0) 은 항등식이다. 즉 "알약이 임계 14px 만큼 튀지 않는" 이유는
        // 이 보정이 아니라 RN 의 리셋이다. 그럼에도 남겨 두는 것은 그 리셋이 RN 내부
        // 구현 세부라, 바뀌더라도 출발점이 anchorX 로 유지되게 하는 방어다.
        dx0: dx,
      };
    },
    onMove: (dx: number) => {
      const d = dragRef.current;
      if (!d.active) return;
      applyFloatIndex(xToFloatIndex(d.anchorX + (dx - d.dx0), d.centers));
    },
    onRelease: (dx: number, vx: number) => {
      const d = dragRef.current;
      const cur = navRef.current.index;
      d.active = false;
      if (!d.centers.length) {
        // 실측 실패 폴백. ⚠️ 여기도 '직접 조작' 방향이어야 한다(위 '부호 규약' 주석 참고).
        // 안드로이드와 같은 판정으로 두면 같은 iOS 빌드 안에서 실측 성공/실패에 따라
        // 스와이프 방향이 반대로 갈려 "가끔 반대로 간다"가 된다.
        if (dx <= -SWIPE_DX || vx <= -SWIPE_VX) settleTo(goToTab(cur - 1));      // 왼쪽 → 이전 탭
        else if (dx >= SWIPE_DX || vx >= SWIPE_VX) settleTo(goToTab(cur + 1));  // 오른쪽 → 다음 탭
        else settleTo(cur);
        return;
      }
      const f = xToFloatIndex(d.anchorX + (dx - d.dx0), d.centers);
      let target = Math.round(f);
      // 짧고 빠른 플릭: 반올림으로는 제자리인데 손가락은 확실히 튕긴 경우 옆 탭으로.
      // (이 경로를 없애면 "톡 튕기면 넘어가던" 조작감이 퇴행한다)
      // ⚠️ 부호는 추종 방향과 반드시 같아야 한다. 왼쪽으로 튕기면 알약도 왼쪽으로 자라던
      // 중이므로 왼쪽 탭(cur - 1)이다. 처음엔 안드로이드 규약(왼쪽 → 다음 탭)을 그대로
      // 복사해서, 드래그 중엔 왼쪽으로 자라다가 릴리스 순간 오른쪽 탭으로 두 칸 점프하는
      // 결함이 있었다(Social에서 왼쪽 20px 플릭 → Profile 착지).
      if (target === cur && Math.abs(dx) < SWIPE_DX) {
        if (vx <= -SWIPE_VX) target = cur - 1;
        else if (vx >= SWIPE_VX) target = cur + 1;
      }
      settleTo(goToTab(target));
    },
    // 다른 responder 에 뺏기면 반드시 되돌린다 — 빠뜨리면 알약이 두 탭 사이에 낀 채 방치된다.
    onTerminate: () => {
      dragRef.current.active = false;
      settleTo(navRef.current.index);
    },
  };

  const swipeResponder = useRef(
    Platform.OS === 'ios'
      ? PanResponder.create({
          // 가로 이동이 충분히 클 때만 가로채 탭 터치(onPress)와 충돌 방지 — 기존과 동일한 임계
          onMoveShouldSetPanResponder: (_, g) =>
            Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
          onPanResponderGrant: (_, g) => dragCbRef.current.onGrant(g.dx),
          onPanResponderMove: (_, g) => dragCbRef.current.onMove(g.dx),
          onPanResponderRelease: (_, g) => dragCbRef.current.onRelease(g.dx, g.vx),
          onPanResponderTerminate: () => dragCbRef.current.onTerminate(),
        })
      : // ⚠️ 안드로이드는 기존 동작 그대로(문자 그대로 무변경 — 상수화만). 이 파일 곳곳의
        // 주석대로 안드로이드에서는 reanimated 폭 애니메이션/animatedProps 가 제대로 반영되지
        // 않아, 알약을 실시간으로 모핑시키면 추종이 아니라 깨진 그림이 된다. 릴리스 시 인접 탭
        // 이동만 유지한다. 아래 부호(왼쪽 → 다음 탭)는 iOS 와 반대인데, 이는 출시된 캐러셀
        // 규약을 지키려는 의도된 선택이다 — 위 '부호 규약' 주석 참고.
        PanResponder.create({
          onMoveShouldSetPanResponder: (_, g) =>
            Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
          onPanResponderRelease: (_, g) => {
            if (g.dx <= -SWIPE_DX || g.vx <= -SWIPE_VX) goAdjacentTab(1);     // 왼쪽 → 다음 탭
            else if (g.dx >= SWIPE_DX || g.vx >= SWIPE_VX) goAdjacentTab(-1); // 오른쪽 → 이전 탭
          },
        })
  ).current;

  const tabs = state.routes.map((route: any, index: number) => {
    const isFocused = state.index === index;
    const label = TAB_LABELS[route.name] ?? route.name;
    const IconComponent = TAB_ICON_COMPONENTS[route.name] ?? GlobeIcon;

    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    return (
      <TabItem
        key={route.key}
        progress={progresses[Math.min(index, 3)]}
        isGlobe={route.name === 'MainTab'}
        uid={route.name}
        label={label}
        IconComponent={IconComponent}
        isFocused={isFocused}
        onPress={onPress}
        pillColor={skinAccent.pill}
        // 안드로이드는 드래그 추종을 안 하므로 실측도 붙이지 않는다(기존 동작 그대로)
        onLayoutTab={Platform.OS === 'ios' ? handleTabLayout(index) : undefined}
      />
    );
  });

  return (
    <>
    <Animated.View
      style={[styles.container, androidSize, containerStyle, { bottom: insets.bottom + TAB_BAR_GAP }]}
      pointerEvents={tabBarHidden ? 'none' : 'box-none'}
    >
      {/* 배경 유리 재질 — iOS26 네이티브 리퀴드 글래스 / 구형 iOS 블러 / Android 매트 폴백.
          ⚠️ androidBlur(dimezisBlurView)를 켰다가 되돌렸다(2026-08-18).
          dimezis 블러는 뒤 화면을 비트맵으로 떠서 흐린 뒤 다시 그리는 방식이라, 그 스냅샷에
          바 자신의 콘텐츠(활성 알약·아이콘)가 섞여 들어가 알약 바깥으로 빛이 번져 나갔다.
          (실측: 알약 왼쪽 바깥 50px 구간에서 파랑 채널이 18→25로 완만히 상승)
          원래 androidBlur를 켠 이유는 "블러 없는 반투명 틴트는 뒤 콘텐츠가 뚫고 비친다"였는데,
          그건 옛 기본 폴백이 불투명도 0.3이었을 때 얘기다. 바 고유 톤(#0A0A0F)의 고불투명
          매트를 직접 주면 비침도 없고 번짐도 없다 — StatsScreen 과 같은 처리.
          탭 바는 스크롤 위에 항상 떠 있어 dimezis 리페인트 부담도 가장 큰 자리다. */}
      <GlassSurface
        style={StyleSheet.absoluteFill}
        borderRadius={BAR_R}
        tintColor="#0A0A0F80"
        fallbackTint="rgba(10,10,15,0.38)"
        androidTint="rgba(10,10,15,0.92)"
        // ⚠️ edgeHighlight 는 iOS 전용. GlassSurface 의 EdgeHighlight 는 Rect 를 width="100%"
        // 로 그리는데, 안드로이드에서는 이 % 가 폭 변경 후에도 갱신되지 않아 옛 폭(Globe 323dp)
        // 그대로 남는다. 그래서 바가 348dp 로 늘어나도 323dp 짜리 윤곽이 하나 더 겹쳐 보였고,
        // 그게 "바가 짧고 좌우가 안 맞는다"의 정체였다(실측: 오른쪽에 스트로크 2개 — x≈900/960).
        // 탭 바는 자체 테두리 SVG 가 이미 같은 자리를 그리므로 안드로이드에서 빠져도 형태는 같다.
        edgeHighlight={Platform.OS === 'ios'}
      />

      {/* 탭 콘텐츠 — 유리 위에 형제로 올림.
          iOS: 가로 드래그하면 활성 알약이 손가락을 따라 흐르고 놓은 자리 탭으로 확정.
          Android: 릴리스 임계 판정으로 옆 탭 이동(기존 동작). */}
      <View style={styles.tabRow} {...swipeResponder.panHandlers}>
        {tabs}
      </View>

      {/* 테두리만 — stroke 전용(fill="none"), 선형 그라데이션 #CECFCD → #CECFCD(투명) */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          <SvgDefs>
            {/* Figma 원본 그라데이션 (expo-linear-gradient 값 → SVG objectBoundingBox 매핑)
                colors ['#CECFCD','rgba(206,207,205,0)'] / locations [0,0.607]
                start (0.216,-0.08) → end (0.283,1.10) */}
            <SvgLinearGradient id="tabBorderGrad" x1="0.216" y1="-0.08" x2="0.283" y2="1.10">
              <SvgStop offset="0" stopColor="#CECFCD" stopOpacity="1" />
              <SvgStop offset="0.607" stopColor="#CECFCD" stopOpacity="0" />
            </SvgLinearGradient>
          </SvgDefs>
          <AnimatedRect
            // 안드로이드엔 animatedProps 를 아예 넘기지 않는다 — 넘기면 정적 width 까지 덮어써
            // 첫 렌더 폭에 그대로 박힌다(실험으로 확인).
            {...(Platform.OS === 'ios'
              ? { animatedProps: borderRectProps }
              : { width: borderStaticW })}
            x={0.75}
            y={0.75}
            height={BAR_H - 1.5}
            rx={BAR_R - 0.75}
            ry={BAR_R - 0.75}
            fill="none"
            stroke="url(#tabBorderGrad)"
            strokeWidth={1.5}
          />
        </Svg>
      </View>

      {/* 튜토리얼 딤 — 다른 구역(코치마크 딤 rgba0.78)과 동일한 어둠. 바만 덮고 FAB·스냅은 형제라 유지.
          pointerEvents auto — 딤만 하고 차단을 안 하면 튜토리얼 도중 탭 전환이 그대로 됐다
          (코치마크 차단막은 화면 안이라 내비게이터 오버레이인 탭 바를 못 막는다). */}
      {coachActive && (
        <View
          pointerEvents="auto"
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.78)', borderRadius: BAR_R }]}
        />
      )}
    </Animated.View>

      {/* 기록 추가 FAB — MainTab 에서만, 탭 바 위에 떠서 겹침 */}
      {isGlobeActive && <RecordFab navigation={navigation} />}
    </>
  );
};

const styles = StyleSheet.create({
  // 떠 있는 배경 컨테이너 (Figma: 그림자 4/4/4 · 검정 3%)
  container: {
    position: 'absolute',
    height: BAR_H,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 4 },
    shadowRadius: 4,
    shadowOpacity: 0.03,
    elevation: 2,
  },
  // 탭 행 — 유리 재질(GlassSurface) 위에 형제로 올라가는 콘텐츠 레이아웃
  // 좌우 비대칭 패딩(좌 18 / 우 28)은 SVG 시안의 여백을 그대로 반영한다.
  // Globe 활성(폭 323)에서 비활성 아이콘 간 간격이 ~15px로 좁혀져 시안과 ~2px 내로 일치.
  tabRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 18,
    paddingRight: 28,
  },
  // 개별 탭 (콘텐츠 크기)
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 가로 알약 (아이콘 + 라벨) — 글로우 노출 위해 overflow 미적용
  pillH: {
    height: PILL_H,
    justifyContent: 'center',
  },
  // Globe 알약 (아이콘 위 · 라벨 아래)
  pillGlobe: {
    height: G_PILL_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 활성 알약 본체 (평면 보라 30%) + 검정 드롭섀도 (Figma: 0/4/4 · 검정 25%)
  bodyFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: PILL_FILL,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  // 콘텐츠(아이콘/라벨) 클립 레이어
  contentClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  // 가로 알약 아이콘 박스 (좌측 고정)
  iconBox: {
    position: 'absolute',
    left: ICON_LEFT,
    top: 0,
    bottom: 0,
    width: ICON_BOX,
  },
  // Globe 아이콘 박스 (가로 중앙)
  iconBoxGlobe: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 가로 라벨 (아이콘 우측, 8px 간격)
  labelBoxH: {
    position: 'absolute',
    left: LABEL_LEFT,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  // Globe 라벨 (아이콘 아래)
  labelBoxGlobe: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 6,
    alignItems: 'center',
  },
  label: {
    color: ACTIVE_COLOR,
    // fontWeight를 함께 주면 안드로이드가 Montserrat-Black의 '600' 변형을 찾다 실패해
    // 시스템 폰트로 폴백한다(단일 굵기 파일) — 패밀리만 지정한다
    fontFamily: 'Montserrat-Black', // 미등록 시 시스템 폰트로 폴백
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
    includeFontPadding: false, // 안드로이드 기본 상하 여백 제거 — 아이콘과의 간격을 iOS와 맞춤
  },
});
