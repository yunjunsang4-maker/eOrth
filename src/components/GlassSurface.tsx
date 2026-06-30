import React, { useEffect, useId, useState } from 'react';
import {
  Platform,
  View,
  AccessibilityInfo,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';

/**
 * 리퀴드 글래스 표면 (iOS 26) — 3단 폴백.
 *  1) iOS 26 + API 가용  → expo-glass-effect <GlassView> (네이티브 backdrop blur + tintColor)
 *  2) 구형 iOS           → <BlurView> + 보라 틴트 오버레이 + 상단 엣지 하이라이트
 *  3) Android            → 반투명 보라 View(Material 톤) + 상단 엣지 하이라이트
 *  + "투명도 줄이기"(Reduce Transparency) 켜지면 반투명 단색으로 폴백.
 *
 * ⚠️ opacity<1 을 주지 말 것(유리가 안 보임). 보라색은 tintColor 로만 표현.
 * 배경 재질 전용이라 보통 자식 없이 absoluteFill 로 깔고, 그 위에 콘텐츠를 형제로 올린다.
 */

interface GlassSurfaceProps {
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
  /** 네이티브 GlassView tintColor (8자리 hex 권장, 예: #751AAD4D) */
  tintColor?: string;
  /** 구형 iOS BlurView 위 보라 틴트 */
  fallbackTint?: string;
  /** Android 반투명 보라 */
  androidTint?: string;
  /** 폴백 경로 상단 엣지 하이라이트(specular) */
  edgeHighlight?: boolean;
  children?: React.ReactNode;
}

function useReduceTransparency() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled?.()
      .then((r) => mounted && setReduce(!!r))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', setReduce);
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

function EdgeHighlight({ radius, gradId }: { radius: number; gradId: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <SvgLinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.4" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </SvgLinearGradient>
      </Defs>
      <Rect
        x={0}
        y={0}
        width="100%"
        height="100%"
        rx={radius}
        ry={radius}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth={1}
      />
    </Svg>
  );
}

export const GlassSurface: React.FC<GlassSurfaceProps> = ({
  style,
  borderRadius = 0,
  tintColor = '#751AAD4D',
  fallbackTint = 'rgba(117,26,173,0.18)',
  androidTint = 'rgba(117,26,173,0.3)',
  edgeHighlight = false,
  children,
}) => {
  const reduce = useReduceTransparency();
  const gradId = useId();

  // 접근성: 투명도 줄이기 → 반투명 단색(블러/유리 없음)
  if (reduce) {
    return (
      <View style={[style, { borderRadius, overflow: 'hidden', backgroundColor: 'rgba(117,26,173,0.6)' }]}>
        {children}
      </View>
    );
  }

  // 1) iOS 26 네이티브 리퀴드 글래스
  if (Platform.OS === 'ios' && isGlassEffectAPIAvailable()) {
    return (
      <GlassView
        glassEffectStyle="regular"
        tintColor={tintColor}
        style={[style, { borderRadius }]}
      >
        {children}
      </GlassView>
    );
  }

  // 2) 구형 iOS: 블러 + 보라 틴트 / 3) Android: 반투명 보라
  return (
    <View style={[style, { borderRadius, overflow: 'hidden' }]}>
      {Platform.OS === 'ios' && (
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      )}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: Platform.OS === 'ios' ? fallbackTint : androidTint },
        ]}
      />
      {edgeHighlight && <EdgeHighlight radius={borderRadius} gradId={gradId} />}
      {children}
    </View>
  );
};
