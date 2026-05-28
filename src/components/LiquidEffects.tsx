/**
 * LiquidEffects.tsx
 * 리퀴드(Liquid) 디자인 컴포넌트 모음 (RN 내장 Animated API 전용 — 네이티브 리빌드 불필요)
 * - AnimatedBlob: 비정형 곡선이 실시간으로 출렁이는 유기적 도형
 * - LiquidPressable: 누르면 찌그러졌다가 탄성 있게 복원되는 터치 래퍼
 * - FloatingBlobs: 배경 장식용 떠다니는 물방울들
 * - GooeyCircle: 구이 이펙트가 적용된 원형 (배지, 아바타용)
 */
import React, { useEffect, useRef, useCallback } from 'react';
import {
  Animated,
  StyleSheet,
  Pressable,
  ViewStyle,
  StyleProp,
  Easing,
  View,
} from 'react-native';
import Svg, { Path, Defs, RadialGradient, Stop, Ellipse } from 'react-native-svg';

// ─── 블롭 패스 생성 유틸 ───
function blobPath(cx: number, cy: number, r: number, offsets: number[]): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8;
    const offset = offsets[i] || 0;
    const rr = r + offset;
    pts.push([cx + rr * Math.cos(angle), cy + rr * Math.sin(angle)]);
  }
  let d = `M ${pts[0][0]} ${pts[0][1]} `;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const p3 = pts[(i + 2) % pts.length];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]} `;
  }
  d += 'Z';
  return d;
}

// ─── AnimatedBlob ───
interface AnimatedBlobProps {
  size: number;
  color: string;
  opacity?: number;
  duration?: number;
  intensity?: number;
  style?: StyleProp<ViewStyle>;
  blur?: boolean;
}

export function AnimatedBlob({
  size,
  color,
  opacity = 0.3,
  duration = 4000,
  intensity = 0.3,
  style,
  blur = false,
}: AnimatedBlobProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const r = size / 2;
  const maxOffset = r * intensity;

  const offsets1 = [0.3, -0.2, 0.4, -0.1, 0.2, -0.3, 0.1, -0.4].map(v => v * maxOffset);
  const path1 = blobPath(r, r, r * 0.8, offsets1);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const scaleX = progress.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [1, 1.05, 0.97, 1.03, 1],
  });
  const scaleY = progress.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [1, 0.97, 1.04, 0.98, 1],
  });
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '15deg'],
  });

  return (
    <Animated.View
      style={[
        { width: size, height: size },
        blur && { opacity: 0.6 },
        style,
        { transform: [{ scaleX }, { scaleY }, { rotate }] },
      ]}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id={`blob_${size}_${color.replace(/[^a-z0-9]/gi, '')}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={String(opacity)} />
            <Stop offset="100%" stopColor={color} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Path d={path1} fill={`url(#blob_${size}_${color.replace(/[^a-z0-9]/gi, '')})`} />
      </Svg>
    </Animated.View>
  );
}

// ─── FloatingBlobs ───
interface FloatingBlobsProps {
  style?: StyleProp<ViewStyle>;
}

export function FloatingBlobs({ style }: FloatingBlobsProps) {
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]} pointerEvents="none">
      <AnimatedBlob
        size={280}
        color="#A855F7"
        opacity={0.12}
        duration={6000}
        intensity={0.35}
        blur
        style={{ position: 'absolute', top: -60, left: -80 }}
      />
      <AnimatedBlob
        size={200}
        color="#2FD9F4"
        opacity={0.08}
        duration={8000}
        intensity={0.4}
        blur
        style={{ position: 'absolute', top: 300, right: -60 }}
      />
      <AnimatedBlob
        size={160}
        color="#B76DFF"
        opacity={0.06}
        duration={7000}
        intensity={0.3}
        blur
        style={{ position: 'absolute', bottom: 200, left: -40 }}
      />
    </View>
  );
}

// ─── LiquidPressable ───
interface LiquidPressableProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  disabled?: boolean;
}

export function LiquidPressable({
  children,
  onPress,
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

  useEffect(() => {
    const wobbleAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(wobble, {
          toValue: 1,
          duration: 5000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(wobble, {
          toValue: 0,
          duration: 5000,
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
            toValue: 1.03,
            duration: 2500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 2500,
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
  }, []);

  const glowScaleX = wobble.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.03, 1],
  });
  const glowScaleY = wobble.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.97, 1],
  });
  const glowRotate = wobble.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '8deg'],
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

  useEffect(() => {
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
  }, []);

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
