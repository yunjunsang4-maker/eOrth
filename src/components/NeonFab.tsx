import React from 'react';
import {
  Pressable,
  View,
  StyleSheet,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useSkinAccent } from '../constants/skinTheme';

/**
 * 네온 FAB("+") 버튼 — Group 2085664476.svg 100% 재현.
 *
 * 레이어 (뒤→앞):
 *  1) 외부 글로우  : 흰색 네이티브 그림자(iOS) / 흰색 헤일로(Android)
 *  2) 본체 원      : rgba(117,26,173,0.1) 유리 질감 (불투명 베이스 #0A0B0F 위에 틴트)
 *  3) ring #1      : 중립 베벨 (#666 0% → #fff 100%), strokeOpacity 0.6, sw 0.9
 *  4) ring #2      : 네온 (#00D8F3 → #FF14E4), strokeOpacity 0.6, sw 1.45, 중심 +0.4/-0.45 어긋남
 *  5) "+" 아이콘   : #E7E7E7, sw 2.44, round
 */

export const FAB_SIZE = 56; // 터치/시각 크기 (본체 지름 ≈ 54.6)

const VB = 56;                      // viewBox 한 변 (1:1 매핑)
const CX = 37.7073;                 // 원본 본체 중심 X
const CY = 37.7073;                 // 원본 본체 중심 Y
const VIEWBOX = `${CX - VB / 2} ${CY - VB / 2} ${VB} ${VB}`;

interface NeonFabProps {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export const NeonFab: React.FC<NeonFabProps> = ({
  onPress,
  style,
  accessibilityLabel = '추가',
}) => {
  const skinAccent = useSkinAccent(); // 유리 질감 틴트를 스킨 강조색으로
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, style, pressed && styles.pressed]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {/* Android 글로우 폴백 (흰색 헤일로) */}
      {Platform.OS === 'android' && <View style={styles.halo} pointerEvents="none" />}

      {/* 글로우 발광 + 본체 베이스 (불투명 → iOS 흰색 그림자가 글로우로 보임) */}
      <View style={styles.glowBase} pointerEvents="none" />

      {/* 유리 질감 보라 틴트 */}
      <View style={[styles.tint, { backgroundColor: skinAccent.tint(0.1) }]} pointerEvents="none" />

      {/* 링 + 플러스 */}
      <Svg width={FAB_SIZE} height={FAB_SIZE} viewBox={VIEWBOX} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* 중립 베벨 라이트: 위 투명 → 아래 흰색 (위→아래 우측으로 비스듬히) */}
          <LinearGradient
            id="fabRimNeutral"
            x1="37.7073"
            y1="10.3896"
            x2="53.8292"
            y2="65.0249"
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor="#666666" stopOpacity="0" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
          </LinearGradient>
          {/* 네온 엣지: 시안 → 마젠타 */}
          <LinearGradient
            id="fabRimNeon"
            x1="38.1126"
            y1="12.9487"
            x2="52.46"
            y2="61.5704"
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={skinAccent.ringGradient?.[0] ?? '#00D8F3'} />
            <Stop offset="1" stopColor={skinAccent.ringGradient?.[1] ?? '#FF14E4'} />
          </LinearGradient>
        </Defs>

        {/* ring #1 — 중립 베벨 */}
        <Circle
          cx={37.7073}
          cy={37.7073}
          r={26.8698}
          fill="none"
          stroke="url(#fabRimNeutral)"
          strokeOpacity={0.6}
          strokeWidth={0.89566}
        />
        {/* ring #2 — 네온 (중심 +0.4/-0.45 어긋남 → 빗면 입체감) */}
        <Circle
          cx={38.1126}
          cy={37.2596}
          r={23.5858}
          fill="none"
          stroke="url(#fabRimNeon)"
          strokeOpacity={0.6}
          strokeWidth={1.45012}
        />

        {/* "+" 아이콘 */}
        <Line
          x1="37.9798"
          y1="33.1048"
          x2="37.9798"
          y2="43.2059"
          stroke="#E7E7E7"
          strokeWidth={2.43819}
          strokeLinecap="round"
        />
        <Line
          x1="43.2047"
          y1="37.9808"
          x2="33.1037"
          y2="37.9808"
          stroke="#E7E7E7"
          strokeWidth={2.43819}
          strokeLinecap="round"
        />
      </Svg>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  wrap: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  // 불투명 베이스 (#0A0B0F = 화면 배경) — iOS 흰색 그림자가 글로우로 발광
  glowBase: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: '#0A0B0F',
    ...Platform.select({
      ios: {
        shadowColor: '#FFFFFF',
        shadowOpacity: 0.2,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 0 },
      },
      default: {},
    }),
  },
  // 유리 질감 보라 틴트
  tint: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: 'rgba(117,26,173,0.1)',
  },
  // Android 글로우 폴백 헤일로
  halo: {
    position: 'absolute',
    top: -5,
    left: -5,
    right: -5,
    bottom: -5,
    borderRadius: FAB_SIZE / 2 + 5,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
});
