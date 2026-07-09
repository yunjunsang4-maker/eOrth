import React from 'react';
import {
  Pressable,
  View,
  Text,
  StyleSheet,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useSkinAccent } from '../constants/skinTheme';

/**
 * 네온 SNAP 버튼 — Group 2085664493.svg 100% 재현.
 * FAB(NeonFab)와 동일한 레시피지만 3가지가 다름:
 *  1) 본체 원이 더 큼 (r29.94, 시각 지름 ≈ 60)
 *  2) "+" 대신 "SNAP" 텍스트 (#00D8F3 시안, Bold)
 *  3) 네온 그라디언트 방향이 반대 (위 마젠타 #FF14E4 → 아래 시안 #00D8F3)
 */

export const SNAP_SIZE = 60; // 시각 지름 ≈ 59.9

const VB = 60;
const CX = 41.3306; // 원본 본체 중심 X
const CY = 41.3311; // 원본 본체 중심 Y
const VIEWBOX = `${CX - VB / 2} ${CY - VB / 2} ${VB} ${VB}`;

interface SnapButtonProps {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export const SnapButton: React.FC<SnapButtonProps> = ({
  onPress,
  style,
  accessibilityLabel = '스냅 기록',
}) => {
  const skinAccent = useSkinAccent(); // 네온 링 그라데이션을 스킨색으로 (aurora=기존 유지)
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
      <View style={styles.tint} pointerEvents="none" />

      {/* 링 (stroke 전용) */}
      <Svg width={SNAP_SIZE} height={SNAP_SIZE} viewBox={VIEWBOX} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* 중립 베벨 라이트: 위 투명 → 아래 흰색 */}
          <LinearGradient
            id="snapRimNeutral"
            x1="41.3306"
            y1="11.3882"
            x2="59.0018"
            y2="71.2739"
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor="#666666" stopOpacity="0" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
          </LinearGradient>
          {/* 네온 엣지: 위 마젠타 → 아래 시안 (FAB와 반대) */}
          <LinearGradient
            id="snapRimNeon"
            x1="41.7741"
            y1="14.1934"
            x2="57.5003"
            y2="67.4876"
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={skinAccent.ringGradient?.[0] ?? '#FF14E4'} />
            <Stop offset="1" stopColor={skinAccent.ringGradient?.[1] ?? '#00D8F3'} />
          </LinearGradient>
        </Defs>

        {/* ring #1 — 중립 베벨 */}
        <Circle
          cx={41.3306}
          cy={41.3311}
          r={29.452}
          fill="none"
          stroke="url(#snapRimNeutral)"
          strokeOpacity={0.6}
          strokeWidth={0.981734}
        />
        {/* ring #2 — 네온 (중심 +0.44/-0.49 어긋남 → 빗면 입체감) */}
        <Circle
          cx={41.7741}
          cy={40.8405}
          r={25.8524}
          fill="none"
          stroke="url(#snapRimNeon)"
          strokeOpacity={0.6}
          strokeWidth={1.58948}
        />
      </Svg>

      {/* SNAP 텍스트 (맨 위, 중앙) */}
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Text style={styles.label}>SNAP</Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  wrap: {
    width: SNAP_SIZE,
    height: SNAP_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 불투명 베이스 (#0A0B0F = 화면 배경) — iOS 흰색 그림자가 글로우로 발광
  glowBase: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: SNAP_SIZE / 2,
    backgroundColor: '#0A0B0F',
    ...Platform.select({
      ios: {
        shadowColor: '#FFFFFF',
        shadowOpacity: 0.2,
        shadowRadius: 11,
        shadowOffset: { width: 0, height: 0 },
      },
      default: {},
    }),
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: SNAP_SIZE / 2,
    backgroundColor: 'rgba(117,26,173,0.1)',
  },
  halo: {
    position: 'absolute',
    top: -5,
    left: -5,
    right: -5,
    bottom: -5,
    borderRadius: SNAP_SIZE / 2 + 5,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: '#00D8F3',
    letterSpacing: 0.5,
  },
});
