import React from 'react';
import {
  Pressable,
  View,
  StyleSheet,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Line, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import { useSkinAccent } from '../constants/skinTheme';

/**
 * 네온 FAB("+") 버튼 — Group 2085664476.svg 100% 재현.
 *
 * 레이어 (뒤→앞):
 *  1) 외부 글로우  : 흰색 네이티브 그림자(iOS) / 흰색 RadialGradient 원(Android)
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

/**
 * 안드로이드 글로우 — 왜 단색 원이 아니라 RadialGradient인가.
 *
 * 안드로이드는 iOS의 shadowColor/shadowRadius(임의 색 그림자)를 지원하지 않는다
 * (elevation은 색을 못 정하고 회색 사각 그림자만 나온다). 그래서 예전 폴백은 버튼보다
 * 사방 5px 큰 `rgba(255,255,255,0.12)` **단색** 원이었는데, 감쇠가 없어 원판 경계가
 * 딱딱한 흰/회색 테두리로 그대로 보였다(S21+ 실기기 확인).
 *
 * iOS 그림자는 버튼 실루엣 가장자리에서 shadowRadius(=10)에 걸쳐 부드럽게 사라진다.
 * 그 감쇠를 RadialGradient 스톱으로 흉내 낸다: 버튼 반경까지 알파 최대 → 중간 지점에서
 * 약 38%로 → 바깥 가장자리 0. (스톱 2개로 선형 감쇠를 주면 가장자리가 다시 각져 보인다.)
 * SNAP 버튼(SnapButton.tsx)도 같은 공식이며 상수만 shadowRadius=11로 다르다.
 */
const GLOW_SPREAD = 10;                                     // = iOS shadowRadius
const GLOW_SIZE = FAB_SIZE + GLOW_SPREAD * 2;               // 글로우 캔버스 한 변
const GLOW_PEAK = 0.115;                                    // 버튼 가장자리 알파 (기존 헤일로 0.12·iOS 체감치)
const GLOW_EDGE = FAB_SIZE / 2 / (GLOW_SIZE / 2);           // 캔버스 반경 중 버튼 반경이 차지하는 비율
const GLOW_MID = GLOW_EDGE + (1 - GLOW_EDGE) * 0.45;        // 가우시안 비슷한 중간 감쇠점

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
      {/* Android 글로우 폴백 (흰색 방사형 감쇠 — 위 GLOW_* 주석 참고).
          RNSVG 함정: 새 아키텍처에서 Svg는 자신에게 직접 준 pointerEvents="none"을 무시하고
          터치를 삼킨다. 반드시 View로 감싸 여기서 차단할 것(버튼보다 큰 캔버스라 더 위험하다). */}
      {Platform.OS === 'android' && (
        <View style={styles.glowAndroid} pointerEvents="none">
          <Svg width={GLOW_SIZE} height={GLOW_SIZE}>
            <Defs>
              <RadialGradient id="fabGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={GLOW_PEAK} />
                <Stop offset={GLOW_EDGE} stopColor="#FFFFFF" stopOpacity={GLOW_PEAK} />
                <Stop offset={GLOW_MID} stopColor="#FFFFFF" stopOpacity={GLOW_PEAK * 0.38} />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={GLOW_SIZE / 2} cy={GLOW_SIZE / 2} r={GLOW_SIZE / 2} fill="url(#fabGlow)" />
          </Svg>
        </View>
      )}

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
  // Android 글로우 폴백 캔버스 (버튼보다 사방 GLOW_SPREAD 만큼 크게)
  glowAndroid: {
    position: 'absolute',
    top: -GLOW_SPREAD,
    left: -GLOW_SPREAD,
    width: GLOW_SIZE,
    height: GLOW_SIZE,
  },
});
