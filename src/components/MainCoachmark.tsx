import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import { useTranslation } from 'react-i18next';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// 강조할 요소의 화면 좌표(measureInWindow 결과). null이면 가운데 안내 카드만 노출.
export interface CoachRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CoachStep {
  rect: CoachRect | null;
  title: string;
  desc: string;
  shape?: 'rect' | 'circle'; // 기본 rect. circle이면 원형 스포트라이트(지구본 강조용).
  // 원형일 때 정확한 원(윈도우 좌표). 지정 시 rect 중심 추정 대신 이 값을 사용한다.
  circleWin?: { cx: number; cy: number; r: number };
  // 말풍선을 강조 요소 기준 자동 배치 대신 화면 하단에서 이만큼 띄워 고정(윈도우 px).
  // 하단(스냅·FAB)처럼 박스를 강조 위쪽으로 올려야 할 때 사용.
  tipBottom?: number;
  // 말풍선을 강조 요소 "아래쪽"에 배치(화면 상단 요소가 가려지지 않게). 예: 프로필 아바타.
  tipBelow?: boolean;
  // 이 단계에서 밝게 유지할 하단 버튼(나머지는 어둡게). RecordFab가 참조.
  keepBright?: 'snap' | 'fab';
}

interface Props {
  visible: boolean;
  steps: CoachStep[];
  onClose: () => void;
  // 현재 단계가 바뀔 때 호출(밝게 둘 하단 버튼 동기화 등에 사용).
  onStepChange?: (step: CoachStep) => void;
}

const PAD = 8; // 강조 구멍 여백
const DIM = 'rgba(0,0,0,0.78)';

/**
 * 메인 화면 단계별 튜토리얼(코치마크) 오버레이.
 *
 * 각 step의 rect 둘레로 4개의 어둡게 처리한 사각형을 깔아 "구멍(스포트라이트)"을 만들고,
 * 보라 네온 링과 설명 말풍선을 그린다. rect가 null인 step은 화면 중앙에 안내 카드만 표시한다.
 * 배경 탭 또는 "다음" 버튼으로 진행, "건너뛰기"로 종료.
 */
const TIP_MIN = 160; // 말풍선이 들어갈 최소 세로 공간

export default function MainCoachmark({ visible, steps, onClose, onStepChange }: Props) {
  const { t } = useTranslation();
  const [idx, setIdx] = useState(0);

  // 강조 링 맥동(pulse) 애니메이션 — 설명 중인 UI를 시선이 가도록 강조
  const pulse = useRef(new Animated.Value(0)).current;

  // 오버레이 루트의 윈도우 위치/크기. step.rect(measureInWindow 결과)에서 이 값을 빼야
  // 화면 트리 내 절대 좌표와 정확히 일치한다(상태바 등 상수 오프셋 상쇄).
  const rootRef = useRef<View>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [rootSize, setRootSize] = useState({ w: SCREEN_W, h: SCREEN_H });
  const [measured, setMeasured] = useState(false);

  const onRootLayout = (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = e.nativeEvent.layout;
    setRootSize({ w: width, h: height });
    const node = rootRef.current as any;
    if (node && typeof node.measureInWindow === 'function') {
      node.measureInWindow((x: number, y: number) => {
        if (typeof x === 'number' && typeof y === 'number') {
          setOrigin({ x, y });
          setMeasured(true);
        }
      });
    }
  };

  // 다시 열릴 때마다 첫 단계부터
  useEffect(() => {
    if (visible) setIdx(0);
  }, [visible]);

  // 현재 단계 변경을 상위로 알림(밝게 둘 하단 버튼 동기화)
  useEffect(() => {
    if (visible) onStepChange?.(steps[Math.min(idx, steps.length - 1)]);
  }, [idx, visible, steps]);

  // 표시되는 동안 맥동 루프 실행
  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible]);

  if (!visible || steps.length === 0) return null;

  const step = steps[Math.min(idx, steps.length - 1)];
  const isLast = idx >= steps.length - 1;

  const next = () => {
    if (isLast) onClose();
    else setIdx((i) => i + 1);
  };

  // 윈도우 좌표 → 오버레이 로컬 좌표로 변환. 측정 전(measured=false)이거나 rect 없으면 전체 딤만.
  const rect = step.rect && measured ? step.rect : null;
  const isCircle = step.shape === 'circle';

  // 사각형 스포트라이트
  const hole =
    rect && !isCircle
      ? {
          x: rect.x - origin.x - PAD,
          y: rect.y - origin.y - PAD,
          w: rect.width + PAD * 2,
          h: rect.height + PAD * 2,
        }
      : null;

  // 강조 도형이 실제 UI 모양(알약·원형 버튼)에 꼭 맞게 감싸도록 모서리 반경을 요소 크기에 맞춘다.
  // (작은/정사각 요소는 완전 둥글게 → 박스 같은 "선" 느낌 제거). 큰 카드는 40으로 상한.
  const holeRadius = hole ? Math.min(Math.min(hole.w, hole.h) / 2, 40) : 0;

  // 원형 스포트라이트 (지구본 등). circleWin이 있으면 그 값을, 없으면 rect 중심을 사용.
  const circle =
    rect && isCircle
      ? step.circleWin
        ? {
            cx: step.circleWin.cx - origin.x,
            cy: step.circleWin.cy - origin.y,
            r: step.circleWin.r,
          }
        : {
            cx: rect.x - origin.x + rect.width / 2,
            cy: rect.y - origin.y + rect.height / 2,
            r: Math.min(rect.width, rect.height) * 0.46,
          }
      : null;

  // 말풍선 배치 기준 박스 (사각이면 hole, 원이면 원의 바운딩 박스)
  const box = hole
    ? { y: hole.y, h: hole.h }
    : circle
    ? { y: circle.cy - circle.r, h: circle.r * 2 }
    : null;

  // 말풍선 세로 위치
  let tipStyle: { top?: number; bottom?: number };
  if (step.tipBottom != null) {
    // 스텝이 명시한 하단 오프셋으로 고정 (강조 요소 위쪽으로 박스를 올릴 때)
    tipStyle = { bottom: step.tipBottom };
  } else if (step.tipBelow && (circle || box)) {
    // 강조 요소 바로 아래에 배치 (상단 요소가 말풍선에 가려지지 않게)
    const anchorBottom = circle ? circle.cy + circle.r : box!.y + box!.h;
    const top = Math.min(anchorBottom + 16, rootSize.h - TIP_MIN);
    tipStyle = { top };
  } else if (circle) {
    // 지구본: 말풍선을 지구본 상단에 겹쳐 배치 — 하단(스냅·FAB)과 겹치지 않도록 위쪽 고정
    const top = Math.min(Math.max(circle.cy - circle.r, 24), rootSize.h - TIP_MIN);
    tipStyle = { top };
  } else if (box) {
    // 박스 위/아래 중 공간이 충분한 쪽, 둘 다 좁으면 중앙쯤에 겹쳐 배치
    const spaceAbove = box.y;
    const spaceBelow = rootSize.h - (box.y + box.h);
    if (spaceBelow >= TIP_MIN) {
      tipStyle = { top: box.y + box.h + 14 };
    } else if (spaceAbove >= TIP_MIN) {
      tipStyle = { bottom: rootSize.h - box.y + 14 };
    } else {
      const top = Math.min(Math.max(box.y + box.h / 2 - 90, 24), rootSize.h - TIP_MIN);
      tipStyle = { top };
    }
  } else {
    tipStyle = { top: rootSize.h * 0.42 };
  }

  // Modal을 쓰지 않고 같은 화면 트리 안에 절대 위치로 렌더한다.
  return (
    <View ref={rootRef} onLayout={onRootLayout} style={styles.root} pointerEvents="box-none">
      <View style={StyleSheet.absoluteFill}>
        {/* 배경 탭은 아래 UI 터치만 차단(진행 X). 다음 단계는 "다음" 버튼으로만 */}
        <Pressable style={StyleSheet.absoluteFill} onPress={() => {}} />

        {hole ? (
          <>
            {/* 구멍 둘레 4분할 딤 처리 (탭은 뒤 Pressable로 통과) */}
            <View pointerEvents="none" style={[styles.dim, { top: 0, left: 0, right: 0, height: Math.max(0, hole.y) }]} />
            <View pointerEvents="none" style={[styles.dim, { top: hole.y + hole.h, left: 0, right: 0, bottom: 0 }]} />
            <View pointerEvents="none" style={[styles.dim, { top: hole.y, left: 0, width: Math.max(0, hole.x), height: hole.h }]} />
            <View pointerEvents="none" style={[styles.dim, { top: hole.y, left: hole.x + hole.w, right: 0, height: hole.h }]} />
            {/* 강조 글로우 헤일로 (맥동) — 요소 모양에 맞춘 반경 */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.halo,
                {
                  top: hole.y,
                  left: hole.x,
                  width: hole.w,
                  height: hole.h,
                  borderRadius: holeRadius,
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] }),
                  transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }],
                },
              ]}
            />
            {/* 강조 링 — 요소 모양에 맞춘 반경 */}
            <View
              pointerEvents="none"
              style={[
                styles.ring,
                { top: hole.y, left: hole.x, width: hole.w, height: hole.h, borderRadius: holeRadius },
              ]}
            />
          </>
        ) : circle ? (
          <>
            {/* 원형 딤(도넛): 큰 원형 테두리로 원 바깥 전체를 어둡게, 안쪽 원만 투명 */}
            {(() => {
              const D = Math.ceil(Math.hypot(rootSize.w, rootSize.h)) * 2 + 40; // 화면 어디서든 모서리까지 덮을 큰 지름
              const bw = D / 2 - circle.r; // 도넛 두께(= 바깥반지름 - 구멍반지름)
              return (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: circle.cx - D / 2,
                    top: circle.cy - D / 2,
                    width: D,
                    height: D,
                    borderRadius: D / 2,
                    borderWidth: bw,
                    borderColor: DIM,
                    backgroundColor: 'transparent',
                  }}
                />
              );
            })()}
            {/* 원형 글로우 헤일로 (맥동) */}
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: circle.cx - circle.r,
                top: circle.cy - circle.r,
                width: circle.r * 2,
                height: circle.r * 2,
                borderRadius: circle.r,
                borderWidth: 4,
                borderColor: 'rgba(191,133,252,0.45)',
                shadowColor: '#BF85FC',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 1,
                shadowRadius: 18,
                elevation: 10,
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }],
              }}
            />
            {/* 원형 강조 링 */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: circle.cx - circle.r,
                top: circle.cy - circle.r,
                width: circle.r * 2,
                height: circle.r * 2,
                borderRadius: circle.r,
                borderWidth: 2.5,
                borderColor: '#BF85FC',
                shadowColor: '#BF85FC',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.95,
                shadowRadius: 12,
                elevation: 8,
              }}
            />
          </>
        ) : (
          // rect 없는 안내 단계: 화면 전체 딤
          <View pointerEvents="none" style={[styles.dim, StyleSheet.absoluteFillObject]} />
        )}

        {/* 설명 말풍선 */}
        <View style={[styles.tooltip, tipStyle]}>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.desc}>{step.desc}</Text>

          <View style={styles.footer}>
            {/* 단계 표시 점 */}
            <View style={styles.dots}>
              {steps.map((_, i) => (
                <View key={i} style={[styles.dot, i === idx && styles.dotActive]} />
              ))}
            </View>

            <View style={styles.actions}>
              {!isLast && (
                <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.skipBtn}>
                  <Text style={styles.skipTxt}>{t('comp.coachSkip')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={next} activeOpacity={0.85} style={styles.nextBtn}>
                <Text style={styles.nextTxt}>{isLast ? t('comp.coachStart') : t('comp.coachNext')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  dim: {
    position: 'absolute',
    backgroundColor: DIM,
  },
  halo: {
    position: 'absolute',
    borderRadius: 18,
    borderWidth: 4,
    borderColor: 'rgba(191,133,252,0.45)',
    shadowColor: '#BF85FC',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 10,
  },
  ring: {
    position: 'absolute',
    borderRadius: 14,
    borderWidth: 2.5,
    borderColor: '#BF85FC',
    shadowColor: '#BF85FC',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 12,
    elevation: 8,
  },
  tooltip: {
    position: 'absolute',
    left: 24,
    right: 24,
    backgroundColor: '#2E2E3B',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  desc: {
    color: '#A1A1B0',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotActive: {
    backgroundColor: '#BF85FC',
    width: 18,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  skipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  skipTxt: {
    color: '#A1A1B0',
    fontSize: 14,
    fontWeight: '600',
  },
  nextBtn: {
    backgroundColor: '#7B61FF',
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  nextTxt: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
