import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { GlassSurface } from './GlassSurface';

/**
 * 세그먼트 토글 (Group 2085664516.svg 재현) — 옵션 2개.
 *
 * 강조 원리: "반투명 보라 두 겹". 트랙(rgba(117,26,173,0.3)) 위에 같은 색 thumb 를
 * 한 겹 더 올려서, 선택된 칸만 더 진한 보라로 보이게 한다. (단색으로 바꾸지 말 것)
 * thumb 는 선택된 칸의 실제 폭/위치에 맞춰 슬라이드한다(라벨 길이에 따라 폭이 달라짐).
 */

const PURPLE = 'rgba(117, 26, 173, 0.3)';
const TRACK_H = 30;
const ANIM = { duration: 280, easing: Easing.inOut(Easing.ease) };

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedToggleProps<T extends string> {
  options: [SegmentOption<T>, SegmentOption<T>];
  value: T;
  onChange: (value: T) => void;
}

function SegLabel({ text, active }: { text: string; active: boolean }) {
  const op = useSharedValue(active ? 1 : 0.5);
  useEffect(() => {
    op.value = withTiming(active ? 1 : 0.5, ANIM);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({ opacity: op.value }));
  return <Animated.Text style={[styles.label, style]}>{text}</Animated.Text>;
}

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: SegmentedToggleProps<T>) {
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const [layouts, setLayouts] = useState<({ x: number; w: number } | undefined)[]>([]);
  const inited = useRef(false);

  const tx = useSharedValue(0);
  const tw = useSharedValue(0);

  const ready = !!layouts[0] && !!layouts[1];

  useEffect(() => {
    const l = layouts[selectedIndex];
    if (!l) return;
    if (!inited.current) {
      tx.value = l.x;
      tw.value = l.w;
      inited.current = true;
    } else {
      tx.value = withTiming(l.x, ANIM);
      tw.value = withTiming(l.w, ANIM);
    }
  }, [selectedIndex, ready, layouts]); // eslint-disable-line react-hooks/exhaustive-deps

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
    width: tw.value,
  }));

  const onSegLayout = (i: number) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setLayouts((prev) => {
      const next = [...prev];
      next[i] = { x, w: width };
      return next;
    });
  };

  return (
    <View style={styles.track}>
      {/* 트랙 배경 = 리퀴드 글래스(보라 틴트). 뒤 배경이 비치는 유리 재질 */}
      <GlassSurface
        style={StyleSheet.absoluteFill}
        borderRadius={TRACK_H / 2}
        tintColor="#751AAD4D"
        edgeHighlight
      />
      {/* 선택 표시 thumb (보라 틴트 한 겹 더 → 선택 칸이 더 진해짐) */}
      {ready && <Animated.View style={[styles.thumb, thumbStyle]} pointerEvents="none" />}
      {options.map((opt, i) => (
        <Pressable
          key={opt.value}
          onPress={() => onChange(opt.value)}
          onLayout={onSegLayout(i)}
          style={styles.seg}
          accessibilityRole="button"
          accessibilityState={{ selected: i === selectedIndex }}
        >
          <SegLabel text={opt.label} active={i === selectedIndex} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  thumb: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: TRACK_H / 2,
    backgroundColor: PURPLE,
  },
  seg: {
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    height: TRACK_H,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
