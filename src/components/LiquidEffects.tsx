/**
 * LiquidEffects.tsx
 * 리퀴드(Liquid) 디자인 컴포넌트 모음 (RN 내장 Animated API 전용 — 네이티브 리빌드 불필요)
 * - LiquidPressable: 누르면 찌그러졌다가 탄성 있게 복원되는 터치 래퍼
 * - GooeyCircle: 구이 이펙트가 적용된 원형 (배지, 아바타용)
 */
import React, { useEffect, useRef, useCallback } from 'react';
import { useAnimationsActive } from '../hooks/useAnimationsActive';
import {
  Animated,
  StyleSheet,
  Pressable,
  ViewStyle,
  StyleProp,
  Easing,
  View,
} from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Ellipse } from 'react-native-svg';

// ─── LiquidPressable ───
interface LiquidPressableProps {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  disabled?: boolean;
}

export function LiquidPressable({
  children,
  onPress,
  onLongPress,
  delayLongPress,
  style,
  intensity = 0.06,
  disabled = false,
}: LiquidPressableProps) {
  const scaleX = useRef(new Animated.Value(1)).current;
  const scaleY = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.parallel([
      Animated.spring(scaleX, {
        toValue: 1 + intensity,
        tension: 300,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.spring(scaleY, {
        toValue: 1 - intensity,
        tension: 300,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, [intensity]);

  const handlePressOut = useCallback(() => {
    // 반대 방향 오버슈트 → 원래로 복귀 (쫀득한 탄성)
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scaleX, {
          toValue: 1 - intensity * 0.5,
          tension: 400,
          friction: 6,
          useNativeDriver: true,
        }),
        Animated.spring(scaleY, {
          toValue: 1 + intensity * 0.5,
          tension: 400,
          friction: 6,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.spring(scaleX, {
          toValue: 1,
          tension: 200,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.spring(scaleY, {
          toValue: 1,
          tension: 200,
          friction: 10,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [intensity]);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
    >
      <Animated.View style={[style, { transform: [{ scaleX }, { scaleY }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// ─── GooeyCircle ───
interface GooeyCircleProps {
  size: number;
  color: string;
  glowOpacity?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  pulseEnabled?: boolean;
}

export function GooeyCircle({
  size,
  color,
  glowOpacity = 0.25,
  children,
  style,
  pulseEnabled = true,
}: GooeyCircleProps) {
  const wobble = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  // 화면 밖/백그라운드에서는 무한 루프를 멈춰 발열을 줄인다 (보이는 화면은 동일)
  const active = useAnimationsActive();

  useEffect(() => {
    if (!active) return;
    const wobbleAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(wobble, {
          toValue: 1,
          duration: 8000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(wobble, {
          toValue: 0,
          duration: 8000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    wobbleAnim.start();

    let pulseAnim: Animated.CompositeAnimation | undefined;
    if (pulseEnabled) {
      pulseAnim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1.015,
            duration: 4000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 4000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );
      pulseAnim.start();
    }

    return () => {
      wobbleAnim.stop();
      pulseAnim?.stop();
    };
  }, [active, pulseEnabled]);

  const glowScaleX = wobble.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [1, 1.012, 1.018, 1.008, 1],
  });
  const glowScaleY = wobble.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [1, 0.99, 0.985, 0.993, 1],
  });
  const glowRotate = wobble.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['0deg', '3deg', '0deg'],
  });

  const glowSize = size + 20;
  const gradId = `goo_${size}_${color.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      {/* 출렁이는 글로우 배경 */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { alignItems: 'center', justifyContent: 'center' },
          { transform: [{ scale: pulse }, { scaleX: glowScaleX }, { scaleY: glowScaleY }, { rotate: glowRotate }] },
        ]}
      >
        <Svg
          width={glowSize}
          height={glowSize}
          viewBox={`0 0 ${glowSize} ${glowSize}`}
          style={{ position: 'absolute', left: -10, top: -10 }}
        >
          <Defs>
            <RadialGradient id={gradId} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={color} stopOpacity={String(glowOpacity)} />
              <Stop offset="70%" stopColor={color} stopOpacity={String(glowOpacity * 0.3)} />
              <Stop offset="100%" stopColor={color} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Ellipse cx={glowSize / 2} cy={glowSize / 2} rx={glowSize / 2} ry={glowSize / 2} fill={`url(#${gradId})`} />
        </Svg>
      </Animated.View>
      {/* 콘텐츠 */}
      {children}
    </View>
  );
}

// ─── LiquidCardGlow ───
interface LiquidCardGlowProps {
  width: number;
  height: number;
  color: string;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}

export function LiquidCardGlow({ width, height, color, opacity = 0.15, style }: LiquidCardGlowProps) {
  const progress = useRef(new Animated.Value(0)).current;
  // 화면 밖/백그라운드에서는 무한 루프를 멈춰 발열을 줄인다 (보이는 화면은 동일)
  const active = useAnimationsActive();

  useEffect(() => {
    if (!active) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 6000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 6000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [active]);

  const sx = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.08, 1],
  });
  const sy = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.94, 1],
  });
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['-3deg', '3deg'],
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: width * 0.8,
          height: height * 0.6,
          borderRadius: width * 0.4,
          backgroundColor: color,
          opacity,
          top: '10%',
          left: '10%',
        },
        style,
        { transform: [{ scaleX: sx }, { scaleY: sy }, { rotate }] },
      ]}
      pointerEvents="none"
    />
  );
}

// ─── 마운트 시 탄성 등장 애니메이션 훅 ───
export function useEntranceAnimation(delay: number = 0) {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacityVal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          tension: 180,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.timing(opacityVal, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  return { transform: [{ scale }], opacity: opacityVal };
}
