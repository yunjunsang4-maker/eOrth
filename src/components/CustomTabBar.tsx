import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RecordFab } from './RecordFab';
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
const BAR_H = 63;          // 컨테이너 높이
const BAR_R = 31.5;        // 높이의 절반 = 완전 둥근형
const BAR_W_GLOBE = 323;   // Globe 활성 시 컨테이너 폭
const BAR_W_OTHER = 348;   // 나머지 활성 시 컨테이너 폭

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
}> = ({ progress, isGlobe, uid, label, IconComponent, isFocused, onPress }) => {
  const H = isGlobe ? G_PILL_H : PILL_H; // 알약 높이
  const R = H / 2;                       // 알약 모서리 반경

  // 알약 폭 모핑 (아이콘만 → 활성)
  const pillStyle = useAnimatedStyle(() => ({
    width: isGlobe
      ? interpolate(progress.value, [0, 1], [G_COLLAPSED_W, G_ACTIVE_W])
      : interpolate(progress.value, [0, 1], [H_COLLAPSED_W, H_ACTIVE_W]),
  }));

  // 입체 레이어(글로우 + 채움 + rim)는 활성일 때만 페이드 인
  const depthStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  // rim Rect 폭: 알약 폭에 맞춰 갱신 (네온은 안쪽으로 한 겹 더 inset)
  const rimNeutralProps = useAnimatedProps(() => {
    const w = isGlobe
      ? interpolate(progress.value, [0, 1], [G_COLLAPSED_W, G_ACTIVE_W])
      : interpolate(progress.value, [0, 1], [H_COLLAPSED_W, H_ACTIVE_W]);
    return { width: Math.max(0, w - 1) };
  });
  const rimNeonProps = useAnimatedProps(() => {
    const w = isGlobe
      ? interpolate(progress.value, [0, 1], [G_COLLAPSED_W, G_ACTIVE_W])
      : interpolate(progress.value, [0, 1], [H_COLLAPSED_W, H_ACTIVE_W]);
    return { width: Math.max(0, w - 3) };
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

  const rimNeutralId = `rimNeutral-${uid}`;
  const rimNeonId = `rimNeon-${uid}`;

  return (
    <TouchableOpacity
      style={styles.tab}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
    >
      <Animated.View style={[isGlobe ? styles.pillGlobe : styles.pillH, pillStyle]}>
        {/* 입체 레이어 (뒤→앞: 글로우 → 본체 채움 → 이중 그라디언트 rim) */}
        <Animated.View style={[StyleSheet.absoluteFill, depthStyle]} pointerEvents="none">
          {/* Android 글로우 폴백 (네이티브 컬러 글로우 미지원 → 흰색 헤일로) */}
          {Platform.OS === 'android' && (
            <View style={[styles.glowHalo, { borderRadius: R + 4 }]} />
          )}
          {/* 본체 채움 + iOS 흰색 글로우 그림자 */}
          <View
            style={[
              styles.bodyFill,
              { borderRadius: R },
              Platform.OS === 'ios' && styles.glowIOS,
            ]}
          />
          {/* 이중 그라디언트 테두리 (stroke 전용) */}
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <SvgDefs>
              {/* 중립 베벨 라이트: 위 투명 → 아래 흰색 */}
              <SvgLinearGradient id={rimNeutralId} x1="0" y1="0" x2="0.15" y2="1">
                <SvgStop offset="0" stopColor="#666666" stopOpacity="0" />
                <SvgStop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
              </SvgLinearGradient>
              {/* 네온 엣지: 시안 → 마젠타 */}
              <SvgLinearGradient id={rimNeonId} x1="0" y1="0" x2="0.15" y2="1">
                <SvgStop offset="0" stopColor="#00D8F3" />
                <SvgStop offset="1" stopColor="#FF14E4" />
              </SvgLinearGradient>
            </SvgDefs>
            {/* rim #1 — 중립 베벨 */}
            <AnimatedRect
              animatedProps={rimNeutralProps}
              x={0.5}
              y={0.5}
              height={H - 1}
              rx={R - 0.5}
              ry={R - 0.5}
              fill="none"
              stroke={`url(#${rimNeutralId})`}
              strokeOpacity={0.6}
              strokeWidth={1}
            />
            {/* rim #2 — 네온 (안쪽 inset + 아래로 offset → 빗면 입체감) */}
            <AnimatedRect
              animatedProps={rimNeonProps}
              x={1.5}
              y={1.9}
              height={H - 3}
              rx={R - 1.5}
              ry={R - 1.5}
              fill="none"
              stroke={`url(#${rimNeonId})`}
              strokeOpacity={0.6}
              strokeWidth={1.5}
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
            <Text style={styles.label} numberOfLines={1}>{label}</Text>
          </Animated.View>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
};

export const CustomTabBar: React.FC<TabBarProps> = ({ state, navigation }) => {
  const insets = useSafeAreaInsets();
  const { width: SCREEN_W } = useWindowDimensions();

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

  // 컨테이너 폭/좌표 (폭 변화에 따라 가운데 정렬 유지)
  const containerStyle = useAnimatedStyle(() => ({
    width: barW.value,
    left: Math.max(16, (SCREEN_W - barW.value) / 2),
  }));
  // 테두리 Rect: 폭만 컨테이너 폭에 맞춰 갱신 (x/y 0.5 인셋, 1px stroke 안 잘리게)
  const borderRectProps = useAnimatedProps(() => ({
    width: Math.max(0, barW.value - 1),
  }));

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
      />
    );
  });

  // 배경 살짝 어둡게 (글래스 위 은은한 다크 스크림)
  const darkScrim = (
    <View style={styles.darkScrim} pointerEvents="none" />
  );

  // 유리 표면 하이라이트 (상단 밝고 하단 옅은 세로 그라디언트)
  const glassOverlay = (
    <LinearGradient
      colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.04)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );

  return (
    <>
    <Animated.View
      style={[styles.container, containerStyle, { bottom: insets.bottom + 24 }]}
      pointerEvents="box-none"
    >
      {/* 글래스 알약 본체 (배경은 단색 반투명 — 그라디언트 아님) */}
      {Platform.OS === 'android' ? (
        <View style={[styles.pillBar, styles.pillBarAndroid]}>
          {darkScrim}
          {glassOverlay}
          {tabs}
        </View>
      ) : (
        <BlurView intensity={70} tint="dark" style={styles.pillBar}>
          {darkScrim}
          {glassOverlay}
          {tabs}
        </BlurView>
      )}

      {/* 그라데이션 테두리 — stroke 전용(fill="none"), 모든 탭 공통 */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          <SvgDefs>
            <SvgLinearGradient id="borderGrad" x1="0" y1="0" x2="0.15" y2="1">
              <SvgStop offset="0" stopColor="#CECFCD" stopOpacity="1" />
              <SvgStop offset="0.61" stopColor="#CECFCD" stopOpacity="0" />
            </SvgLinearGradient>
          </SvgDefs>
          <AnimatedRect
            animatedProps={borderRectProps}
            x={0.5}
            y={0.5}
            height={BAR_H - 1}
            rx={BAR_R - 0.5}
            ry={BAR_R - 0.5}
            fill="none"
            stroke="url(#borderGrad)"
            strokeWidth={1}
          />
        </Svg>
      </View>
    </Animated.View>

      {/* 기록 추가 FAB — MainTab 에서만, 탭 바 위에 떠서 겹침 */}
      {isGlobeActive && <RecordFab navigation={navigation} />}
    </>
  );
};

const styles = StyleSheet.create({
  // 떠 있는 컨테이너 (SVG: box-shadow 4 4 4 / 검정 25%)
  container: {
    position: 'absolute',
    height: BAR_H,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 4,
    shadowOpacity: 0.25,
    elevation: 8,
  },
  // 글래스 알약 본체 (단색 반투명 글래스 배경 — 그라디언트 테두리와 완전히 별개 레이어)
  pillBar: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BAR_R,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  // 배경 살짝 어둡게 (글래스 위 다크 스크림)
  darkScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,11,15,0.16)',
  },
  // Android: 블러 약함 → 불투명 폴백
  pillBarAndroid: {
    backgroundColor: 'rgba(15,15,23,0.78)',
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
  // 본체 채움 (유리 질감 보라 30%)
  bodyFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: PILL_FILL,
  },
  // iOS 외부 글로우 (떠 있는 느낌) — 흰색, blur 10, 사방 균일
  glowIOS: {
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  // Android 글로우 폴백 (흰색 헤일로 한 겹)
  glowHalo: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    backgroundColor: 'rgba(255,255,255,0.12)',
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
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
