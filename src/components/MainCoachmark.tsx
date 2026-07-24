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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Svg, { Path as SvgPath, Rect as SvgRect, Mask as SvgMask, Defs as SvgDefs } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useSkinAccent } from '../constants/skinTheme';

const AnimatedRect = Animated.createAnimatedComponent(SvgRect);

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
  onStepChange?: (step: CoachStep) => void;
}

const PAD = 8; // 강조 구멍 여백
const DIM = '#000000';
const DIM_OP = 0.78;
const TOOLTIP_BG = 'rgba(18,16,26,0.96)'; // 딥다크 글래스 말풍선
const TIP_MIN = 160; // 말풍선이 들어갈 최소 세로 공간

// 진행 점 — 활성 시 스프링으로 늘어나며 강조색으로 물든다(온보딩 PageDot 언어)
function StepDot({ active, color }: { active: boolean; color: string }) {
  const a = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(a, { toValue: active ? 1 : 0, friction: 7, tension: 120, useNativeDriver: false }).start();
  }, [active, a]);
  return (
    <Animated.View
      style={{
        height: 7,
        borderRadius: 3.5,
        width: a.interpolate({ inputRange: [0, 1], outputRange: [7, 18] }),
        backgroundColor: a.interpolate({ inputRange: [0, 1], outputRange: ['rgba(255,255,255,0.25)', color] }),
      }}
    />
  );
}

type Geom = { x: number; y: number; w: number; h: number; r: number };

/**
 * 메인 화면 단계별 튜토리얼(코치마크) 오버레이.
 *
 * SVG 마스크로 어둡게 처리한 오버레이에 둥근 구멍(스포트라이트)을 뚫고, 그 구멍을 단계 간
 * 부드럽게 이동·리사이즈(item 9)한다. 스킨색 네온 링 + 딥다크 글래스 말풍선(그라데이션 테두리·
 * 강조 요소를 가리키는 꼬리·내용 스태거 등장). 진입/종료 페이드, 이전/다음/우상단 X, 햅틱 지원.
 */
export default function MainCoachmark({ visible, steps, onClose, onStepChange }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const skinAccent = useSkinAccent();
  const [idx, setIdx] = useState(0);

  const [rendered, setRendered] = useState(visible);
  const mount = useRef(new Animated.Value(0)).current;   // 진입/종료 페이드
  const trans = useRef(new Animated.Value(1)).current;   // 말풍선 크로스페이드 + 내용 스태거
  const pulse = useRef(new Animated.Value(0)).current;   // 링 맥동

  // 스포트라이트 지오메트리(둥근 사각형으로 통일 — 원은 rx=반지름) — 단계 간 애니메이션
  const gx = useRef(new Animated.Value(0)).current;
  const gy = useRef(new Animated.Value(0)).current;
  const gw = useRef(new Animated.Value(0)).current;
  const gh = useRef(new Animated.Value(0)).current;
  const gr = useRef(new Animated.Value(0)).current;
  const geomInit = useRef(false);

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

  // 진입/종료 페이드 + 열릴 때 첫 단계로(지오메트리 스냅 리셋)
  useEffect(() => {
    if (visible) {
      setRendered(true);
      setIdx(0);
      trans.setValue(1);
      geomInit.current = false;
      Animated.timing(mount, { toValue: 1, duration: 260, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
    } else if (rendered) {
      Animated.timing(mount, { toValue: 0, duration: 220, easing: Easing.in(Easing.ease), useNativeDriver: true }).start(
        ({ finished }) => { if (finished) setRendered(false); }
      );
    }
  }, [visible]);

  useEffect(() => {
    if (visible) onStepChange?.(steps[Math.min(idx, steps.length - 1)]);
  }, [idx, visible, steps]);

  // 맥동 루프(지오메트리와 같은 뷰에 얹히므로 JS 드라이버)
  useEffect(() => {
    if (!rendered) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [rendered]);

  const step = steps[Math.min(idx, steps.length - 1)];

  // 스텝 → 통일 지오메트리(둥근 사각형). rect 없거나 미측정이면 null(구멍 없음).
  const computeGeom = (s?: CoachStep): Geom | null => {
    if (!s || !s.rect || !measured) return null;
    if (s.shape === 'circle') {
      const c = s.circleWin
        ? { cx: s.circleWin.cx - origin.x, cy: s.circleWin.cy - origin.y, r: s.circleWin.r }
        : {
            cx: s.rect.x - origin.x + s.rect.width / 2,
            cy: s.rect.y - origin.y + s.rect.height / 2,
            r: Math.min(s.rect.width, s.rect.height) * 0.46,
          };
      return { x: c.cx - c.r, y: c.cy - c.r, w: c.r * 2, h: c.r * 2, r: c.r };
    }
    const x = s.rect.x - origin.x - PAD;
    const y = s.rect.y - origin.y - PAD;
    const w = s.rect.width + PAD * 2;
    const h = s.rect.height + PAD * 2;
    return { x, y, w, h, r: Math.min(Math.min(w, h) / 2, 40) };
  };

  // 지오메트리 애니메이션 — 단계가 바뀌면 구멍이 다음 요소로 부드럽게 이동·리사이즈
  useEffect(() => {
    if (!rendered) return;
    const g = computeGeom(step);
    if (!g) {
      Animated.timing(gw, { toValue: 0, duration: 250, useNativeDriver: false }).start();
      Animated.timing(gh, { toValue: 0, duration: 250, useNativeDriver: false }).start();
      return;
    }
    if (!geomInit.current) {
      gx.setValue(g.x); gy.setValue(g.y); gw.setValue(g.w); gh.setValue(g.h); gr.setValue(g.r);
      geomInit.current = true;
    } else {
      const d = 380;
      const ez = Easing.inOut(Easing.cubic);
      Animated.parallel([
        Animated.timing(gx, { toValue: g.x, duration: d, easing: ez, useNativeDriver: false }),
        Animated.timing(gy, { toValue: g.y, duration: d, easing: ez, useNativeDriver: false }),
        Animated.timing(gw, { toValue: g.w, duration: d, easing: ez, useNativeDriver: false }),
        Animated.timing(gh, { toValue: g.h, duration: d, easing: ez, useNativeDriver: false }),
        Animated.timing(gr, { toValue: g.r, duration: d, easing: ez, useNativeDriver: false }),
      ]).start();
    }
  }, [idx, rendered, measured, origin.x, origin.y, rootSize.w, rootSize.h]);

  if (!rendered || steps.length === 0) return null;

  const isLast = idx >= steps.length - 1;

  // 단계 전환 — 말풍선 크로스페이드(구멍/링은 지오메트리로 글라이드), 햅틱
  const animateTo = (target: number) => {
    Haptics.selectionAsync().catch(() => {});
    Animated.timing(trans, { toValue: 0, duration: 130, easing: Easing.in(Easing.ease), useNativeDriver: true }).start(() => {
      setIdx(target);
      Animated.timing(trans, { toValue: 1, duration: 220, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
    });
  };
  const next = () => {
    if (isLast) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onClose();
    } else {
      animateTo(idx + 1);
    }
  };
  const prev = () => { if (idx > 0) animateTo(idx - 1); };

  // 말풍선 위치·꼬리 기준 지오메트리(현재 단계 실측값)
  const geom = computeGeom(step);
  const isCircle = step.shape === 'circle';
  const box = geom ? { y: geom.y, h: geom.h } : null;

  let tipStyle: { top?: number; bottom?: number };
  let arrowDir: 'up' | 'down' | null = null;
  if (step.tipBottom != null) {
    tipStyle = { bottom: step.tipBottom };
    arrowDir = 'down';
  } else if (step.tipBelow && box) {
    tipStyle = { top: Math.min(box.y + box.h + 16, rootSize.h - TIP_MIN) };
    arrowDir = 'up';
  } else if (isCircle && box) {
    tipStyle = { top: Math.min(Math.max(box.y, 24), rootSize.h - TIP_MIN) };
    arrowDir = null;
  } else if (box) {
    const spaceAbove = box.y;
    const spaceBelow = rootSize.h - (box.y + box.h);
    if (spaceBelow >= TIP_MIN) {
      tipStyle = { top: box.y + box.h + 14 };
      arrowDir = 'up';
    } else if (spaceAbove >= TIP_MIN) {
      tipStyle = { bottom: rootSize.h - box.y + 14 };
      arrowDir = 'down';
    } else {
      tipStyle = { top: Math.min(Math.max(box.y + box.h / 2 - 90, 24), rootSize.h - TIP_MIN) };
      arrowDir = null;
    }
  } else {
    tipStyle = { top: rootSize.h * 0.42 };
    arrowDir = null;
  }

  const elemCx = geom ? geom.x + geom.w / 2 : rootSize.w / 2;
  const tipW = rootSize.w - 48;
  const arrowX = Math.max(18, Math.min(tipW - 36, elemCx - 24 - 9));

  // 그라데이션 테두리 색 — 스킨의 네온 링 그라데이션(없으면 버튼 그라데이션)
  const borderGrad = skinAccent.ringGradient ?? skinAccent.btnGradient;

  // 내용 스태거 — trans(0→1)에 서로 다른 시작점을 줘 제목→설명→푸터 순으로 슬라이드 인
  const titleY = trans.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  const descY = trans.interpolate({ inputRange: [0, 0.18, 1], outputRange: [14, 14, 0] });
  const footerY = trans.interpolate({ inputRange: [0, 0.34, 1], outputRange: [18, 18, 0] });

  return (
    <View ref={rootRef} onLayout={onRootLayout} style={styles.root} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: mount }]}>
        {/* 배경 탭은 아래 UI 터치만 차단(진행 X) */}
        <Pressable style={StyleSheet.absoluteFill} onPress={() => {}} />

        {/* 딤 + 둥근 구멍 (SVG 마스크로 원/사각 통일, 지오메트리 애니메이션) */}
        <Svg width={rootSize.w} height={rootSize.h} style={StyleSheet.absoluteFill} pointerEvents="none">
          <SvgDefs>
            <SvgMask id="coachHole">
              <SvgRect x={0} y={0} width={rootSize.w} height={rootSize.h} fill="#FFFFFF" />
              <AnimatedRect x={gx} y={gy} width={gw} height={gh} rx={gr} ry={gr} fill="#000000" />
            </SvgMask>
          </SvgDefs>
          <SvgRect
            x={0} y={0} width={rootSize.w} height={rootSize.h}
            fill={DIM} fillOpacity={DIM_OP} mask="url(#coachHole)"
          />
        </Svg>

        {/* 강조 글로우 헤일로 (맥동) — 구멍과 함께 글라이드 */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            {
              borderColor: skinAccent.tint(0.45),
              shadowColor: skinAccent.accent,
              left: gx, top: gy, width: gw, height: gh, borderRadius: gr,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] }),
            },
          ]}
        />
        {/* 강조 링 */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            { borderColor: skinAccent.accent, shadowColor: skinAccent.accent, left: gx, top: gy, width: gw, height: gh, borderRadius: gr },
          ]}
        />

        {/* 설명 말풍선 — 크로스페이드 + 그라데이션 테두리 + 꼬리 + 내용 스태거 */}
        <Animated.View style={[styles.tooltipPos, tipStyle, { opacity: trans }]}>
          {arrowDir === 'up' && <View style={[styles.arrowUp, { left: arrowX }]} />}
          {arrowDir === 'down' && <View style={[styles.arrowDown, { left: arrowX }]} />}
          <LinearGradient colors={borderGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tipBorder}>
            <View style={styles.tipInner}>
              <Animated.Text style={[styles.title, { transform: [{ translateY: titleY }] }]}>{step.title}</Animated.Text>
              <Animated.Text style={[styles.desc, { transform: [{ translateY: descY }] }]}>{step.desc}</Animated.Text>

              <Animated.View style={[styles.footer, { transform: [{ translateY: footerY }] }]}>
                <View style={styles.dots}>
                  {steps.map((_, i) => (
                    <StepDot key={i} active={i === idx} color={skinAccent.accent} />
                  ))}
                </View>

                <View style={styles.actions}>
                  {idx > 0 && (
                    <TouchableOpacity onPress={prev} activeOpacity={0.8} style={styles.prevBtn}>
                      <Text style={styles.prevTxt}>{t('comp.coachPrev')}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={next} activeOpacity={0.85} style={styles.nextBtn}>
                    <LinearGradient
                      colors={skinAccent.btnGradient}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={styles.nextGrad}
                    >
                      <Text style={styles.nextTxt}>{isLast ? t('comp.coachStart') : t('comp.coachNext')}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* 상시 종료 X */}
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.8}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[styles.closeBtn, { top: insets.top + 10 }]}
        >
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <SvgPath d="M6 6l12 12M18 6L6 18" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  halo: {
    position: 'absolute',
    borderWidth: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 10,
  },
  ring: {
    position: 'absolute',
    borderWidth: 2.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 12,
    elevation: 8,
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltipPos: {
    position: 'absolute',
    left: 24,
    right: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 14,
  },
  tipBorder: {
    borderRadius: 20,
    padding: 1.4, // 그라데이션 테두리 두께
  },
  tipInner: {
    borderRadius: 18.6,
    backgroundColor: TOOLTIP_BG,
    padding: 20,
  },
  arrowUp: {
    position: 'absolute',
    top: -9,
    zIndex: 1,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: TOOLTIP_BG,
  },
  arrowDown: {
    position: 'absolute',
    bottom: -9,
    zIndex: 1,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: TOOLTIP_BG,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  desc: {
    color: '#B4B4C2',
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
    alignItems: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  prevBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  prevTxt: {
    color: '#B4B4C2',
    fontSize: 14,
    fontWeight: '600',
  },
  nextBtn: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  nextGrad: {
    paddingHorizontal: 24,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextTxt: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
