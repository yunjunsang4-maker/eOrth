import React from 'react';
import {
  Pressable,
  View,
  StyleSheet,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Text } from '../ui/Text';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg';
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

/**
 * 안드로이드 글로우 — 왜 단색 원이 아니라 RadialGradient인가.
 *
 * 안드로이드는 iOS의 shadowColor/shadowRadius(임의 색 그림자)를 지원하지 않는다
 * (elevation은 색을 못 정하고 회색 사각 그림자만 나온다). 그래서 예전 폴백은 버튼보다
 * 사방 5px 큰 `rgba(255,255,255,0.12)` **단색** 원이었는데, 감쇠가 없어 원판 경계가
 * 딱딱한 흰/회색 테두리로 그대로 보였다(S21+ 실기기 확인).
 *
 * iOS 그림자는 버튼 실루엣 가장자리에서 shadowRadius(=11, FAB보다 1 큼)에 걸쳐 부드럽게
 * 사라진다. 그 감쇠를 RadialGradient 스톱으로 흉내 낸다: 버튼 반경까지 알파 최대 →
 * 중간 지점에서 약 38%로 → 바깥 가장자리 0. NeonFab.tsx와 **같은 공식**이고 상수만 다르다
 * (SPREAD 11 vs 10) — 두 버튼의 글로우 강도·범위 비례를 그대로 유지하기 위함.
 */
const GLOW_SPREAD = 11;                                     // = iOS shadowRadius
const GLOW_SIZE = SNAP_SIZE + GLOW_SPREAD * 2;              // 글로우 캔버스 한 변
const GLOW_PEAK = 0.115;                                    // 버튼 가장자리 알파 (기존 헤일로 0.12·iOS 체감치)
const GLOW_EDGE = SNAP_SIZE / 2 / (GLOW_SIZE / 2);          // 캔버스 반경 중 버튼 반경이 차지하는 비율
const GLOW_MID = GLOW_EDGE + (1 - GLOW_EDGE) * 0.45;        // 가우시안 비슷한 중간 감쇠점

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
      {/* Android 글로우 폴백 (흰색 방사형 감쇠 — 위 GLOW_* 주석 참고).
          RNSVG 함정: 새 아키텍처에서 Svg는 자신에게 직접 준 pointerEvents="none"을 무시하고
          터치를 삼킨다. 반드시 View로 감싸 여기서 차단할 것(버튼보다 큰 캔버스라 더 위험하다). */}
      {Platform.OS === 'android' && (
        <View style={styles.glowAndroid} pointerEvents="none">
          <Svg width={GLOW_SIZE} height={GLOW_SIZE}>
            <Defs>
              <RadialGradient id="snapGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={GLOW_PEAK} />
                <Stop offset={GLOW_EDGE} stopColor="#FFFFFF" stopOpacity={GLOW_PEAK} />
                <Stop offset={GLOW_MID} stopColor="#FFFFFF" stopOpacity={GLOW_PEAK * 0.38} />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={GLOW_SIZE / 2} cy={GLOW_SIZE / 2} r={GLOW_SIZE / 2} fill="url(#snapGlow)" />
          </Svg>
        </View>
      )}

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
  // Android 글로우 폴백 캔버스 (버튼보다 사방 GLOW_SPREAD 만큼 크게)
  glowAndroid: {
    position: 'absolute',
    top: -GLOW_SPREAD,
    left: -GLOW_SPREAD,
    width: GLOW_SIZE,
    height: GLOW_SIZE,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: '#00D8F3',
    letterSpacing: 0.5,
  },
});
