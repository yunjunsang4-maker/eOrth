import React, { useEffect, useId, useRef, useState } from 'react';
import { View, Pressable, StyleSheet, Platform, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Defs, Rect } from 'react-native-svg';
// 앱 공용 대각 흰색 링 — 트랙은 PillRing 그대로, 폭이 애니메이션되는 thumb은 그라데이션만 가져다 쓴다
import { PillRing, DiagonalRingGradient } from './record/CalendarBottomSheet';
import { useSkinAccent } from '../constants/skinTheme';
import { andFitText } from '../utils/fitText';
import { FONT_SCALE_CAP } from '../ui/Text';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

/**
 * 지구본/대륙 2단 세그먼트 토글 (Figma Rectangle240652653 재현) — 옵션 2개.
 *
 * 색감: "반투명 보라 두 겹". 트랙·thumb 둘 다 rgba(117,26,173,0.3) (불투명 단색 금지).
 * 테두리: 앱 공용 대각 흰색 링(PillRing — 옛 #CECFCD 위→아래 페이드에서 2026-09-30 통일). thumb 폭/위치는 선택된 라벨 실제 폭에 맞춰 슬라이드.
 */

const PURPLE = 'rgba(117, 26, 173, 0.3)';
const TRACK_H = 30.49; // Figma Rectangle240652653
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
  // 안드로이드 한글 폰트(Noto)가 넓어 고정 트랙 안에서 라벨이 줄바꿈/썸 폭 어긋남 — 한 줄 고정+자동 축소
  // Animated.Text는 래퍼(ui/Text)를 거치지 않으므로 상한을 직접 넘긴다.
  // FONT_SCALE_CAP도 andFitText도 android 전용이라 iOS는 상한 없이 그대로 간다(의도된 동작).
  return <Animated.Text maxFontSizeMultiplier={FONT_SCALE_CAP} style={[styles.label, style]} {...andFitText}>{text}</Animated.Text>;
}

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: SegmentedToggleProps<T>) {
  const skinAccent = useSkinAccent(); // 트랙·thumb 색을 스킨 강조색(pill)으로
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const [layouts, setLayouts] = useState<({ x: number; w: number } | undefined)[]>([]);
  const [trackW, setTrackW] = useState(0);
  const inited = useRef(false);

  // thumb 테두리 그라디언트 id (인스턴스별 고유 — url(#id) 용이므로 영숫자만)
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const thumbBorderId = `segThumbBorder${gid}`;

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
  // 선택 반쪽(thumb) 테두리 stroke 폭을 thumb 폭에 맞춰 애니메이션
  const thumbBorderProps = useAnimatedProps(() => ({ width: Math.max(0, tw.value - 1) }));

  const onSegLayout = (i: number) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setLayouts((prev) => {
      const next = [...prev];
      next[i] = { x, w: width };
      return next;
    });
  };

  return (
    // 트랙(전체 배경 알약) = 반투명 보라 한 겹 + 공용 대각 흰색 링
    <View
      style={[styles.track, { backgroundColor: skinAccent.pill }]}
      onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
    >
      {/* 선택 인디케이터 thumb = 같은 반투명 보라 한 겹 더 + 동일한 공용 대각 링.
          그라데이션 축은 선택 칸의 목표 폭 기준 — 슬라이드(280ms) 중엔 우하단 흰색이 목표 위치에 먼저 가 있을 뿐이다 */}
      {ready && (
        <Animated.View style={[styles.thumb, { backgroundColor: skinAccent.pill }, thumbStyle]} pointerEvents="none">
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs>
              <DiagonalRingGradient id={thumbBorderId} width={layouts[selectedIndex]?.w ?? 0} height={TRACK_H} radius={R} />
            </Defs>
            <AnimatedRect
              animatedProps={thumbBorderProps}
              x={0.5}
              y={0.5}
              height={TRACK_H - 1}
              rx={R - 0.5}
              ry={R - 0.5}
              fill="none"
              stroke={`url(#${thumbBorderId})`}
              strokeWidth={1}
            />
          </Svg>
        </Animated.View>
      )}

      {/* 테두리만 — 공용 대각 흰색 링(PillRing이 스스로 pointerEvents none View로 감싸고 0 폭이면 그리지 않는다) */}
      <PillRing width={trackW} height={TRACK_H} radius={R} />

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
