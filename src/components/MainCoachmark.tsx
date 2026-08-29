import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import { Text, FONT_SCALE_CAP } from '../ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useSkinAccent } from '../constants/skinTheme';
import { setCoachFreezeGlobe } from './coachOverlayState';
import { traceStart, traceStep, traceEnd } from '../utils/perfTrace';
import { TAB_BAR_H, TAB_BAR_GAP } from '../utils/tabBar';

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
  // 제목 앞 아이콘 — 기본 이모지 대신 앱 아이콘 세트를 쓰기 위한 슬롯.
  // 호출부가 <GlobeIcon size={16} color={skinAccent.accent} /> 처럼 만들어 넘긴다.
  icon?: React.ReactNode;
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
const DIM = 'rgba(0,0,0,0.78)';

/**
 * 스포트라이트 이동 연출 스위치.
 *
 * true  = 구멍이 다음 요소로 부드럽게 미끄러진다(디자인 기본).
 *         이 구간에만 딤·링 두 뷰의 레이아웃이 매 프레임 갱신된다.
 * false = 말풍선이 사라져 있는 사이에 즉시 이동한다. 전환 중 프레임마다 하는 일이 0이라
 *         저사양 기기·지구본(WebGL) 위에서도 절대 끊기지 않는다.
 *
 * 실기기(지구본 WebGL 위 + 고해상도)에서 글라이드가 프레임을 못 맞춰 false로 둔다.
 * 다시 켜보려면 true로만 바꾸면 된다.
 */
const SPOTLIGHT_GLIDE = false;

/**
 * 강조 링 맥동(숨쉬기) 스위치.
 *
 * 맥동은 튜토리얼이 떠 있는 내내 60fps로 도는 유일한 애니메이션이다. 네이티브 드라이버라
 * JS 부하는 없지만, 지구본(WebGL) 위에서 큰 글로우 영역을 매 프레임 다시 합성하게 만든다.
 * false면 글로우가 고정 밝기로 은은하게 켜져 있고(정지 화면), 오버레이가 하는 일이 0이 된다.
 */
const RING_PULSE = false;
const TOOLTIP_BG = 'rgba(18,16,26,0.96)'; // 딥다크 글래스 말풍선
// 말풍선 높이의 폴백값(실측 전 첫 프레임에만 쓰인다). 실제 배치는 onLayout으로 잰
// tipH를 쓴다 — 이 상수만으로 판단하면 설명이 두 줄 이상인 단계에서 아래쪽(다음 버튼)이
// 화면 밖·탭 바 밑으로 밀려도 "공간 충분"으로 오판한다.
const TIP_MIN = 160;
const TIP_GAP = 14; // 강조 요소와 말풍선 사이 간격

// 진행 점 — 활성 시 길어지고 강조색으로 물든다(온보딩 PageDot 언어).
// 상태 변경은 말풍선이 완전히 사라진 시점(trans=0)에 일어나 애니메이션 없이도 티가 나지 않는다.
// (width 스프링은 JS 드라이버라 스포트라이트 이동과 겹치면 프레임마다 레이아웃을 다시 잡아 렉의 원인)
function StepDot({ active, color }: { active: boolean; color: string }) {
  return (
    <View
      style={{
        height: 7,
        borderRadius: 3.5,
        width: active ? 18 : 7,
        backgroundColor: active ? color : 'rgba(255,255,255,0.25)',
      }}
    />
  );
}

type Geom = { x: number; y: number; w: number; h: number; r: number };

/**
 * 메인 화면 단계별 튜토리얼(코치마크) 오버레이.
 *
 * 어둡게 처리한 오버레이에 둥근 구멍(스포트라이트)을 뚫고, 그 구멍을 단계 간 부드럽게
 * 이동·리사이즈한다. 스킨색 네온 링 + 딥다크 글래스 말풍선(그라데이션 테두리·강조 요소를
 * 가리키는 꼬리·내용 스태거 등장). 진입/종료 페이드, 이전/다음/우상단 X, 햅틱 지원.
 *
 * 성능 주의(렉 방지):
 * - 딤은 "거대한 둥근 테두리 뷰" 한 장으로 구멍을 만든다. 전체화면 SVG 마스크는 프레임마다
 *   오프스크린 합성이 일어나 지구본 WebView 위에서 심하게 끊긴다(사용 금지).
 * - 맥동(pulse)은 반드시 useNativeDriver: true. 지오메트리(JS 드라이버)와는 뷰를 분리해
 *   같은 뷰에서 두 드라이버가 섞이지 않게 한다.
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
  const glow = useRef(new Animated.Value(1)).current;    // 이동 중 글로우 숨김(네이티브)

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

  // 말풍선 실제 높이 — 배치(위/아래 판정과 클램프)에 쓴다.
  // 단계마다 설명 줄 수가 달라 높이가 바뀌고, 안드로이드 한글 폰트(Noto Sans KR)는 같은
  // 문장도 한 줄 더 늘어난다. 상수 하나로 잡으면 그만큼이 통째로 화면 밖으로 밀린다.
  // 위치는 높이에 영향을 주지 않으므로(좌우 고정) 이 갱신은 한 번에 수렴한다.
  const [tipH, setTipH] = useState(0);
  const onTipLayout = (e: { nativeEvent: { layout: { height: number } } }) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && Math.abs(h - tipH) > 1) setTipH(h);
  };

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
      glow.setValue(1);
      geomInit.current = false;
      // 튜토리얼이 떠 있는 동안은 지구본(WebGL) 렌더 루프를 통째로 재운다.
      // 오버레이 위/아래에서 60fps 두 개가 부딪히는 게 전환 버벅임의 가장 큰 원인이고,
      // 자동회전은 45초/바퀴라 이 사이 멈춰 있어도 눈에 띄지 않는다.
      setCoachFreezeGlobe(true);
      // 등장 260→200ms. 튜토리얼이 뜨기까지의 체감 대기에 그대로 더해지는 구간이라 줄인다.
      Animated.timing(mount, { toValue: 1, duration: 200, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
    } else if (rendered) {
      setCoachFreezeGlobe(false);
      Animated.timing(mount, { toValue: 0, duration: 220, easing: Easing.in(Easing.ease), useNativeDriver: true }).start(
        ({ finished }) => { if (finished) setRendered(false); }
      );
    }
    return () => setCoachFreezeGlobe(false); // 어떤 경로로 사라져도 지구본이 멈춘 채 남지 않게
  }, [visible]);

  useEffect(() => {
    if (visible) onStepChange?.(steps[Math.min(idx, steps.length - 1)]);
  }, [idx, visible, steps]);

  // 단계 전환 계측 — 이펙트는 커밋 완료 후 실행되므로 커밋 종료 시점의 근사치가 된다.
  // animateTo가 traceStart를 부르지 않은 경우(첫 렌더 등)에는 traceStep이 조용히 무시된다.
  useEffect(() => {
    traceStep('coach:step', 'committed');
  }, [idx]);

  // 맥동 루프 — 켤 경우 반드시 네이티브 드라이버(JS 드라이버면 튜토리얼 내내 JS 스레드가 60fps로 점유된다)
  useEffect(() => {
    if (!rendered || !RING_PULSE) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
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
    // 이 이펙트는 위의 'committed' 마크보다 뒤에 선언돼 있어, 여기서 쓰는 시간은 전부
    // settled 구간에 잡힌다. geom-* 두 마크로 그 안에서 다시 갈라 본다.
    traceStep('coach:step', 'geom-start');
    const g = computeGeom(step);
    if (!g) {
      // 구멍 없는 단계(안내 카드만) — 글라이드 off면 즉시 닫는다
      if (SPOTLIGHT_GLIDE) {
        Animated.timing(gw, { toValue: 0, duration: 250, useNativeDriver: false }).start();
        Animated.timing(gh, { toValue: 0, duration: 250, useNativeDriver: false }).start();
      } else {
        gw.setValue(0); gh.setValue(0);
      }
      traceStep('coach:step', 'geom-done(empty)');
      return;
    }
    if (!geomInit.current || !SPOTLIGHT_GLIDE) {
      // 첫 표시 또는 글라이드 off — 즉시 이동(말풍선이 사라져 있는 사이라 점프가 티나지 않는다).
      // 프레임마다 갱신되는 게 하나도 없어 전환 구간에 렉이 생길 여지가 없다.
      gx.setValue(g.x); gy.setValue(g.y); gw.setValue(g.w); gh.setValue(g.h); gr.setValue(g.r);
      // 글로우는 애니메이션하지 않는다(항상 켜짐) — 헤일로는 위치·크기만 새 값으로 바뀌고,
      // 그림자는 그 한 번만 다시 그려진다. 페이드시키면 iOS에서 프레임마다 블러를 다시 계산한다.
      geomInit.current = true;
      traceStep('coach:step', 'geom-done');
    } else {
      const d = 280; // 이 구간만 JS 드라이버로 레이아웃이 움직인다 — 짧게 유지
      const ez = Easing.inOut(Easing.cubic);
      // 이동 중에는 글로우(헤일로)를 접는다. 크기가 매 프레임 바뀌는 뷰의 그림자는 프레임마다
      // 다시 그려져(iOS 오프스크린 / 안드로이드 elevation) 이동 구간 렉의 큰 원인이다.
      // 접혀 있는 동안 헤일로는 그릴 필요가 없으므로 지오메트리도 애니메이션하지 않는다.
      glow.setValue(0); // 보통은 animateTo에서 이미 접혀 있다(도착지 글로우가 먼저 번쩍이는 것 방지)
      Animated.parallel([
        Animated.timing(gx, { toValue: g.x, duration: d, easing: ez, useNativeDriver: false }),
        Animated.timing(gy, { toValue: g.y, duration: d, easing: ez, useNativeDriver: false }),
        Animated.timing(gw, { toValue: g.w, duration: d, easing: ez, useNativeDriver: false }),
        Animated.timing(gh, { toValue: g.h, duration: d, easing: ez, useNativeDriver: false }),
        Animated.timing(gr, { toValue: g.r, duration: d, easing: ez, useNativeDriver: false }),
      ]).start(({ finished }) => {
        if (!finished) return;
        Animated.timing(glow, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      });
    }
  }, [idx, rendered, measured, origin.x, origin.y, rootSize.w, rootSize.h]);

  // 말풍선 내용 스태거 — 렌더마다 재생성되지 않도록 고정
  const tip = useMemo(
    () => ({
      titleY: trans.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
      descY: trans.interpolate({ inputRange: [0, 0.18, 1], outputRange: [14, 14, 0] }),
      footerY: trans.interpolate({ inputRange: [0, 0.34, 1], outputRange: [18, 18, 0] }),
    }),
    [trans]
  );

  if (!rendered || steps.length === 0) return null;

  const isLast = idx >= steps.length - 1;

  // 단계 전환 — 말풍선 크로스페이드(스포트라이트는 그 사이 즉시 이동), 햅틱
  const animateTo = (target: number) => {
    // 전환 계측 — 한 그룹에 4개 지점을 찍는다. 각 지점의 '+Nms'가 곧 그 구간의 비용이다.
    //   faded-out : 페이드아웃 실측(설계값 130ms). 크게 벗어나면 JS 스레드가 막혀 있다는 뜻
    //   committed : 리액트 커밋 비용  ← 전환 렉의 원인을 가르는 핵심 숫자
    //   settled   : 페이드인 실측(설계값 220ms)
    traceStart('coach:step');
    Haptics.selectionAsync().catch(() => {});
    // 글라이드 모드에서만 글로우를 미리 접는다(이동 중 헤일로는 애니메이션 대상이 아니라서).
    // 글라이드 off면 글로우는 아예 애니메이션하지 않는다 — iOS에서 그림자(shadowRadius) 달린
    // 뷰의 투명도 페이드는 프레임마다 오프스크린 렌더+블러라, 지구본만 한 헤일로에선 그 자체가 렉이다.
    if (SPOTLIGHT_GLIDE) Animated.timing(glow, { toValue: 0, duration: 120, useNativeDriver: true }).start();
    Animated.timing(trans, { toValue: 0, duration: 130, easing: Easing.in(Easing.ease), useNativeDriver: true }).start(() => {
      traceStep('coach:step', 'faded-out');
      setIdx(target);
      Animated.timing(trans, { toValue: 1, duration: 220, easing: Easing.out(Easing.ease), useNativeDriver: true }).start(
        ({ finished }) => { if (finished) traceEnd('coach:step', 'settled'); }
      );
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
  // 딤 배치용 정수 좌표 — 맞물리는 사각형 사이에 헤어라인 틈이 생기지 않게 경계를 정수로 맞춘다.
  const hole = geom
    ? {
        x: Math.round(geom.x),
        y: Math.round(geom.y),
        w: Math.round(geom.w),
        h: Math.round(geom.h),
        r: Math.max(0, Math.round(geom.r)),
      }
    : null;
  const isCircle = step.shape === 'circle';
  const box = geom ? { y: geom.y, h: geom.h } : null;

  // 하단 탭 바가 잡아먹는 높이. 코치마크는 화면 안에 그려지는데 탭 바(CustomTabBar)는
  // 네비게이터 오버레이라 이 오버레이보다 앞 레이어다. 게다가 튜토리얼 중에는 탭 전환을
  // 막으려고 pointerEvents="auto" 딤을 덮는다 — 즉 이 구간에 들어간 말풍선은 보이지도,
  // 눌리지도 않는다. 프로필 마지막 단계(여행 기록)에서 '다음' 버튼이 여기 잠겨
  // 튜토리얼을 넘길 수 없던 것이 이 계산을 빠뜨린 결과다.
  const bottomReserve = insets.bottom + TAB_BAR_GAP + TAB_BAR_H;
  const tipNeed = tipH > 0 ? tipH : TIP_MIN;
  const topLimit = insets.top + 52;                    // 우상단 종료 X 아래
  const bottomLimit = rootSize.h - bottomReserve - 8;  // 탭 바 윗면 위
  // 위아래 모두 모자라면 위쪽이 잘리더라도 '다음' 버튼이 보이는 쪽을 택한다
  // (제목이 조금 가려지는 것보다 진행 불가가 훨씬 나쁘다).
  const clampTop = (v: number) =>
    Math.min(Math.max(v, topLimit), Math.max(8, bottomLimit - tipNeed));

  let tipStyle: { top?: number; bottom?: number };
  let arrowDir: 'up' | 'down' | null = null;
  if (step.tipBottom != null) {
    tipStyle = { bottom: step.tipBottom };
    arrowDir = 'down';
  } else if (step.tipBelow && box) {
    // 클램프로 자리가 밀리면 꼬리가 가리키는 곳이 없어지므로 꼬리를 뗀다
    const want = box.y + box.h + 16;
    const top = clampTop(want);
    tipStyle = { top };
    arrowDir = Math.abs(top - want) < 2 ? 'up' : null;
  } else if (isCircle && box) {
    tipStyle = { top: clampTop(Math.max(box.y, 24)) };
    arrowDir = null;
  } else if (box) {
    const spaceAbove = box.y - TIP_GAP - topLimit;
    const spaceBelow = bottomLimit - (box.y + box.h) - TIP_GAP;
    if (spaceBelow >= tipNeed) {
      tipStyle = { top: box.y + box.h + TIP_GAP };
      arrowDir = 'up';
    } else if (spaceAbove >= tipNeed) {
      tipStyle = { bottom: rootSize.h - box.y + TIP_GAP };
      arrowDir = 'down';
    } else {
      tipStyle = { top: clampTop(box.y + box.h / 2 - tipNeed / 2) };
      arrowDir = null;
    }
  } else {
    tipStyle = { top: clampTop(rootSize.h * 0.42) };
    arrowDir = null;
  }

  const elemCx = geom ? geom.x + geom.w / 2 : rootSize.w / 2;
  const tipW = rootSize.w - 48;
  const arrowX = Math.max(18, Math.min(tipW - 36, elemCx - 24 - 9));

  // 그라데이션 테두리 색 — 스킨의 네온 링 그라데이션(없으면 버튼 그라데이션)
  const borderGrad = skinAccent.ringGradient ?? skinAccent.btnGradient;

  return (
    <View ref={rootRef} onLayout={onRootLayout} style={styles.root} pointerEvents="box-none">
      {/* overflow hidden 필수 — 딤이 화면의 몇 배 크기(거대 테두리 뷰)라, 클리핑 없이는
          진입 페이드·전환 때 화면 밖 영역까지 통째로 합성돼 GPU 픽셀 비용이 수십 배가 된다. */}
      {/* pointerEvents는 opacity가 아니라 visible로 판단한다 — 닫힘 페이드의 완료 콜백은
          finished가 보장되지 않아(visible 재토글 등으로 중단되면 setRendered(false)가 영영
          안 불린다) 투명해진 전면 쉘이 남아 아래 화면의 터치를 통째로 삼켰다. */}
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={[StyleSheet.absoluteFill, { opacity: mount, overflow: 'hidden' }]}
      >
        {/* 배경 탭은 아래 UI 터치만 차단(진행 X) */}
        <Pressable style={StyleSheet.absoluteFill} onPress={() => {}} />

        {/* 딤 + 둥근 구멍 — 구멍을 기준으로 화면을 네 개의 '민 사각형'으로 덮고,
            구멍 둘레의 둥근 모서리만 작은 테두리 뷰 한 장으로 마감한다.
            DIM이 반투명이라 겹치면 이음새가 진해지므로, 어떤 두 장도 겹치지 않게 배치한다.

            (구) 화면 넓이의 약 30배(한 변 3,000dp 초과)에 테두리 반지름이 1,500dp대인
            라운드 테두리 뷰 한 장으로 그렸다. 단계가 바뀔 때마다 그 거대한 경로를 다시
            테셀레이션하느라 UI 스레드가 수백 ms 멈췄다 — 계측상 220ms짜리 네이티브
            페이드인이 1,100ms 걸렸다(JS 스레드는 그 사이 자유로웠다). 이제 가장 큰 뷰가
            화면 크기다.

            ⚠️ 이 딤은 geom(단계별 실측값)으로 정적 배치된다. SPOTLIGHT_GLIDE를 다시 켜려면
               네 사각형과 마감 테두리도 gx·gy·gw·gh·gr 애니메이션 노드로 구동해야 한다. */}
        {hole ? (
          <>
            {/* 구멍의 '실제 사각 경계'에 정확히 맞물리는 네 장 — 겹침도 틈도 없다 */}
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: rootSize.w, height: Math.max(0, hole.y), backgroundColor: DIM }} />
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: hole.y + hole.h, width: rootSize.w, height: Math.max(0, rootSize.h - (hole.y + hole.h)), backgroundColor: DIM }} />
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: hole.y, width: Math.max(0, hole.x), height: hole.h, backgroundColor: DIM }} />
            <View pointerEvents="none" style={{ position: 'absolute', left: hole.x + hole.w, top: hole.y, width: Math.max(0, rootSize.w - (hole.x + hole.w)), height: hole.h, backgroundColor: DIM }} />
            {/* 네 귀퉁이 마감 — 사각 경계 안쪽이면서 둥근 구멍 바깥인 영역.
                뷰의 테두리는 바깥쪽도 라운드라 한 장으로는 이 부분을 채울 수 없다.
                그래서 귀퉁이마다 r×r 클리핑 창을 두고, 그 안에 '안쪽 반지름 = r'인
                링을 넣어 필요한 부분만 보이게 한다. 링 바깥 반지름은 1.6r —
                귀퉁이 꼭짓점까지 거리가 r√2≈1.414r이므로 여유 있게 덮는다. */}
            {hole.r > 0 && ([
              { k: 'tl', wx: hole.x,                   wy: hole.y,                   ox: -0.6, oy: -0.6 },
              { k: 'tr', wx: hole.x + hole.w - hole.r, wy: hole.y,                   ox: -1.6, oy: -0.6 },
              { k: 'bl', wx: hole.x,                   wy: hole.y + hole.h - hole.r, ox: -0.6, oy: -1.6 },
              { k: 'br', wx: hole.x + hole.w - hole.r, wy: hole.y + hole.h - hole.r, ox: -1.6, oy: -1.6 },
            ] as const).map(({ k, wx, wy, ox, oy }) => (
              <View
                key={k}
                pointerEvents="none"
                style={{ position: 'absolute', left: wx, top: wy, width: hole.r, height: hole.r, overflow: 'hidden' }}
              >
                <View
                  style={{
                    position: 'absolute',
                    left: ox * hole.r,
                    top: oy * hole.r,
                    width: hole.r * 3.2,
                    height: hole.r * 3.2,
                    borderRadius: hole.r * 1.6,
                    borderWidth: hole.r * 0.6,
                    borderColor: DIM,
                  }}
                />
              </View>
            ))}
          </>
        ) : (
          // 구멍 없는 단계(안내 카드만) — 화면 전체를 덮는다
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: DIM }]} />
        )}

        {/* 강조 글로우 헤일로 — 그림자(shadowRadius) 금지: iOS는 shadowPath 없는 그림자를
            단계마다(지구본 단계는 화면 크기로) 오프스크린 블러로 다시 굽는다 → 그 자체가 히치.
            대신 알파가 낮아지는 테두리 링을 겹쳐 네온 글로우를 흉내낸다(순수 합성, 블러 없음). */}
        {geom && (
          <>
            {([
              { o: 0, bw: 4, a: 0.45 },
              { o: 5, bw: 6, a: 0.2 },
              { o: 12, bw: 8, a: 0.09 },
            ] as const).map(({ o, bw, a }) => (
              <View
                key={o}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: geom.x - o,
                  top: geom.y - o,
                  width: geom.w + o * 2,
                  height: geom.h + o * 2,
                  borderRadius: geom.r + o,
                  borderWidth: bw,
                  borderColor: skinAccent.tint(a),
                }}
              />
            ))}
          </>
        )}
        {/* 강조 링 — 구멍과 함께 글라이드. 글로우(그림자)는 위 헤일로가 전담하고 여기는 선만 그린다.
            크기가 매 프레임 바뀌는 뷰에 그림자를 걸면 프레임마다 그림자를 다시 렌더한다. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            { borderColor: skinAccent.accent, left: gx, top: gy, width: gw, height: gh, borderRadius: gr },
          ]}
        />

        {/* 설명 말풍선 — 크로스페이드 + 그라데이션 테두리 + 꼬리 + 내용 스태거 */}
        <Animated.View onLayout={onTipLayout} style={[styles.tooltipPos, tipStyle, { opacity: trans }]}>
          {arrowDir === 'up' && <View style={[styles.arrowUp, { left: arrowX }]} />}
          {arrowDir === 'down' && <View style={[styles.arrowDown, { left: arrowX }]} />}
          <LinearGradient colors={borderGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tipBorder}>
            <View style={styles.tipInner}>
              <Animated.View style={[styles.titleRow, { transform: [{ translateY: tip.titleY }] }]}>
                {step.icon ? <View style={styles.titleIcon}>{step.icon}</View> : null}
                <Text style={styles.title}>{step.title}</Text>
              </Animated.View>
              {/* Animated.Text는 래퍼(ui/Text)를 거치지 않으므로 상한을 직접 넘긴다.
                  FONT_SCALE_CAP은 android에서만 값이 있고 iOS에선 undefined(상한 없음)다. */}
              <Animated.Text maxFontSizeMultiplier={FONT_SCALE_CAP} style={[styles.desc, { transform: [{ translateY: tip.descY }] }]}>{step.desc}</Animated.Text>

              <Animated.View style={[styles.footer, { transform: [{ translateY: tip.footerY }] }]}>
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
  ring: {
    position: 'absolute',
    borderWidth: 2.5,
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
  // 그림자 없음 — 딤(78% 검정) 위라 검은 그림자는 어차피 보이지 않는데,
  // 큰 블러 그림자를 단 채 투명도(크로스페이드)를 돌리면 페이드 프레임마다
  // 오프스크린으로 그림자를 다시 그려 "글박스 뜰 때" 렉의 주범이 된다.
  tooltipPos: {
    position: 'absolute',
    left: 24,
    right: 24,
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
  // 제목 행 — 아이콘(선택) + 제목. 여백은 행이 갖고 제목은 줄바꿈만 담당한다.
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  titleIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    flexShrink: 1, // 아이콘을 밀어내지 않고 제목만 줄어들게
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
