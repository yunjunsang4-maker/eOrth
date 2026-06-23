import React, { useEffect, useId, useRef, useState } from 'react';
import { View, Pressable, StyleSheet, Platform, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';

/**
 * 지구본/대륙 2단 세그먼트 토글 (Group_2085664516.svg 재현) — 옵션 2개.
 *
 * 색감: "반투명 보라 두 겹". 트랙·thumb 둘 다 rgba(117,26,173,0.3) (불투명 단색 금지).
 * 테두리: 메인탭(CustomTabBar)과 동일한 '이중 그라디언트 rim'으로 입체감.
 *   - rim1 중립 베벨(위 투명 → 아래 흰색), rim2 네온(시안→마젠타) 살짝 inset/offset.
 * thumb 폭/위치는 선택된 라벨 실제 폭에 맞춰 슬라이드.
 */

const PURPLE = 'rgba(117, 26, 173, 0.3)';
const TRACK_H = 30;
const R = TRACK_H / 2;
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
  // 활성=흰색 100%, 비활성=흰색 50% (색을 함께 애니메이트)
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
  const [trackW, setTrackW] = useState(0);
  const inited = useRef(false);

  // 그라디언트 id (인스턴스별 고유 — url(#id) 용이므로 영숫자만)
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const neutralId = `segRimN${gid}`;
  const neonId = `segRimNeon${gid}`;

  const tx = useSharedValue(0);
  const tw = useSharedValue(0);

  const ready = !!layouts[0] && !!layouts[1];

  // 선택 칸의 실제 x/폭으로 thumb 슬라이드
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
    // 트랙(전체 배경 알약) = 반투명 보라 한 겹
    <View
      style={styles.track}
      onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
    >
      {/* 선택 인디케이터 thumb = 같은 반투명 보라 한 겹 더 → 선택 칸만 진해짐 */}
      {ready && <Animated.View style={[styles.thumb, thumbStyle]} pointerEvents="none" />}

      {/* 이중 그라디언트 rim 테두리 (메인탭과 동일한 입체감) — 라벨 아래에 깔아 터치를 막지 않음 */}
      {trackW > 0 && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={trackW} height={TRACK_H}>
            <Defs>
              {/* 중립 베벨 라이트: 위 투명 → 아래 흰색 */}
              <SvgLinearGradient id={neutralId} x1="0" y1="0" x2="0.15" y2="1">
                <Stop offset="0" stopColor="#666666" stopOpacity="0" />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
              </SvgLinearGradient>
              {/* 네온 엣지: 시안 → 마젠타 */}
              <SvgLinearGradient id={neonId} x1="0" y1="0" x2="0.15" y2="1">
                <Stop offset="0" stopColor="#00D8F3" />
                <Stop offset="1" stopColor="#FF14E4" />
              </SvgLinearGradient>
            </Defs>
            {/* rim #1 — 중립 베벨 */}
            <Rect
              x={0.5}
              y={0.5}
              width={trackW - 1}
              height={TRACK_H - 1}
              rx={R - 0.5}
              ry={R - 0.5}
              fill="none"
              stroke={`url(#${neutralId})`}
              strokeOpacity={0.6}
              strokeWidth={1}
            />
            {/* rim #2 — 네온 (안쪽 inset + 아래로 offset → 빗면 입체감) */}
            <Rect
              x={1.5}
              y={1.9}
              width={trackW - 3}
              height={TRACK_H - 3}
              rx={R - 1.5}
              ry={R - 1.5}
              fill="none"
              stroke={`url(#${neonId})`}
              strokeOpacity={0.6}
              strokeWidth={1.5}
            />
          </Svg>
        </View>
      )}

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
    borderRadius: R, // 완전 둥근형
    overflow: 'hidden',
    alignSelf: 'center',
    backgroundColor: PURPLE, // SVG rect1 (#751AAD @ 0.3)
  },
  thumb: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: R,
    backgroundColor: PURPLE, // SVG rect2 — 트랙과 같은 색 한 겹 더
  },
  seg: {
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    height: TRACK_H,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 15,
    // iOS 기본 한글 폰트 = Apple SD Gothic Neo. Android 는 기본 한글 폰트로 폴백.
    fontFamily: Platform.select({ ios: 'Apple SD Gothic Neo', default: undefined }),
    fontWeight: '700',
  },
});
