import React, { useState, useEffect, useRef, useCallback, useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  PanResponder,
  Platform,
  AccessibilityInfo,
  type ScrollView,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { select, grab } from '../../utils/haptics';
import { Text } from '../../ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSkinAccent } from '../../constants/skinTheme';
import { useSkinSettings } from '../../store/settingsStore';
import { layoutBandRuns, type RecordedRange } from '../../utils/recordedDates';
import { useStageWidth, STAGE_MAX_W } from '../../utils/stage';
import { andFitText } from '../../utils/fitText';
import { BackChevronIcon } from '../icons';
import {
  toDateKey,
  isSameDay,
  isBeforeDay,
  buildMonthGrid,
  shiftMonth,
} from '../../utils/calendarRange';

/**
 * 기간 선택 캘린더 바텀시트 — 기록·스트립·블로그·사진첩 공용.
 * (NewRecordScreen 에서 분리)
 *
 * 날짜 계산은 utils/calendarRange.ts의 순수 함수에 위임한다(검증 파일이 그쪽에 붙어 있다).
 * 트리거 버튼은 DateRangeField가 담당한다 — 이 시트를 여는 모양도 화면마다 같아야 한다.
 */

const WEEK_DAY_KEYS = ['calendar.week0', 'calendar.week1', 'calendar.week2', 'calendar.week3', 'calendar.week4', 'calendar.week5', 'calendar.week6'] as const;

/** 스와이프로 월을 넘길 최소 이동 거리(dp). 이보다 짧으면 탭·세로 스크롤로 본다 */
const SWIPE_THRESHOLD = 44;
/** 시트 좌우 여백(dp) — 셀 폭이 여기서 파생된다 */
const SHEET_PAD_H = 24; // 달력 시안 확정값(CELL_SIZE 파생) — 앱 공통 gutter 16 통일에서 의도적으로 제외
/** 출발·도착 헤더 알약 높이 */
const HEADER_H = 48;
/** 확인 버튼 높이(시안 50) */
const CONFIRM_H = 50;
const CONFIRM_RADIUS = 12; // 시안 2026-10-06 — 알약(25)에서 둥근 사각으로
/** 월 다이얼 — 월 제목을 꾹(350ms) 누르면 좌우 드래그로 월이 휠처럼 돈다(통계 탭 원판과 같은 손맛) */
const DIAL_HOLD_MS = 350;
const DIAL_SLOT = 72;       // 손가락 72dp = 1개월
const DIAL_LABEL_W = 140;   // 휠 라벨 한 칸 폭('2026년 12월'·'12/2026'이 들어간다)
const DIAL_ROT_PER_MONTH = 360; // 제목 옆 캐럿이 1개월당 도는 각도 — 한 바퀴여야 정수 개월에 멈췄을 때 ›가 기울지 않는다
/** 연·월 휠 팝오버(시안 2026-10-06) — 제목 아래 그리드 위에 떠 있는 유리 카드. 7행이 보이고 가운데가 선택 */
const WHEEL_ROW_H = 29;
const POP_W = 134;
const POP_H = WHEEL_ROW_H * 7; // 203 ≈ 시안 205 — 행 높이의 배수여야 가운데 행이 정확히 중앙에 온다
const POP_RADIUS = 12;
const POP_GAP = 4;              // 월 네비 행 아래 끝 → 팝오버 위 끝
// 가운데에서 -3…+3 행의 투명도·크기(시안 측정: 가운데 bold 22, ±1 약 18·흰 45%, ±2 35%, ±3 12%)
const WHEEL_OPACITY = [0.12, 0.35, 0.45, 1, 0.45, 0.35, 0.12];
const WHEEL_SCALE   = [0.76, 0.8, 0.82, 1, 0.82, 0.8, 0.76];
// 아래로 갈수록 살짝 보라기(시안 하단 ≈#54525A~#5F5A6E)
const POP_TINT = ['rgba(146,109,255,0)', 'rgba(146,109,255,0.14)'] as const;
/** 국가 칩 색 — 스킨별 3색 순환(시안 2026-09-14). 오로라만 흰 글씨, 시안·민트는 검정 90% */
const CHIP_PALETTES: Record<string, { bg: string[]; text: string }> = {
  aurora: { bg: ['#7C3AED', '#926DFF', '#AC6FFF'], text: '#FFFFFF' },
  cyan:   { bg: ['#00D8F3', '#C3F8FF', '#86FFF3'], text: 'rgba(0,0,0,0.9)' },
  mint:   { bg: ['#00F37A', '#86FFBC', '#C3FFCD'], text: 'rgba(0,0,0,0.9)' },
};

/**
 * 앱 공용 알약·카드 테두리(기준 링, 2026-09-30 전면 통일) — 좌상단·우하단 모서리만 #FFFFFF, 가운데 투명한
 * 45° 대각 그라데이션. 예전 #CECFCD 위→아래 페이드 링(탭 바·토글·온보딩 버튼·달력 알약)과 #CECFCD 대각 카드 링
 * (통계 반쪽 카드·DetailBox)은 전부 이 링으로 바꿨다 — 사용자 지시 "그라데이션이 다르게 들어간 것 모두 통일".
 * 폭·높이는 **숫자**로 받는다 — 안드로이드는 Rect의
 * width="100%"가 폭 변경 뒤 갱신되지 않아 옛 윤곽이 겹쳐 보인다(탭 바 사고). RNSVG는 pointerEvents를
 * 무시하므로 View(pointerEvents none)로 감싼다.
 */
/** 흰색이 남는 최소 픽셀 거리(작은 알약 기준). 알약 폭과 무관한 절대값이라 국가·날짜 칩처럼
 *  넓은 알약에서도 모서리만 밝다(비율 단위였을 때는 위 변 40%가 희게 깔려 왼쪽 전체가 밝아 보였다 — 사용자 지적). */
const CORNER_PX = 20;

/** 흰색 거리 기본값 = 반지름×4/3(블로그 저장 알약 h30·r15 → 20px 비율), 최소 20px.
 *  고정 20px면 반지름이 큰 알약·카드에선 흰 부분이 모서리 곡선 안에 묻혀 안 보였다(사용자 지적 2026-09-30).
 *  r≤15인 링은 예전과 똑같이 20px이다. */
export const ringCornerPx = (radius: number) => Math.max(CORNER_PX, (radius * 4) / 3);

/** 기준 링의 그라데이션 정의만 — Defs 안에 넣는다. PillRing이 쓰고, 폭이 애니메이션되는 Rect
 *  (탭 바·세그먼트 토글)도 목표 폭을 넘겨 같은 값을 쓴다(단일 출처).
 *  userSpaceOnUse(픽셀 단위) 45° 축: 점 (x,y)의 진행도 t=(x+y)/(w+h)라 (0,0)=0, (w,h)=1이고 등고선이 진짜 45°다.
 *  objectBoundingBox는 가로로 긴 알약에서 축이 눕혀져 흰색이 위 변을 따라 길게 번지므로 쓰지 않는다.
 *  흰색은 모서리에서 x+y<cornerPx 안쪽만 — 알약이 아무리 넓어도 같은 크기로 남는다. */
export function DiagonalRingGradient({ id, width, height, radius, cornerPx, opacity = 1 }: { id: string; width: number; height: number; radius: number; cornerPx?: number; /** 비활성 버튼처럼 링만 흐리게 할 때 */ opacity?: number }) {
  const c = cornerPx ?? ringCornerPx(radius);
  const cornerT = Math.min(0.5, c / Math.max(1, width + height)); // 아주 작은 알약은 양쪽 흰색이 가운데서 만난다
  return (
    <SvgLinearGradient id={id} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={(width + height) / 2} y2={(width + height) / 2}>
      <Stop offset={0} stopColor="#FFFFFF" stopOpacity={opacity} />
      <Stop offset={cornerT} stopColor="#FFFFFF" stopOpacity={0} />
      <Stop offset={1 - cornerT} stopColor="#FFFFFF" stopOpacity={0} />
      <Stop offset={1} stopColor="#FFFFFF" stopOpacity={opacity} />
    </SvgLinearGradient>
  );
}

export function PillRing({ width, height, radius, strokeWidth = 1, cornerPx, opacity }: {
  width: number; height: number; radius: number; strokeWidth?: number;
  /** 옛 호출부 호환용(무시됨) — 이제 모든 링이 대각 링이다. 옛 #CECFCD 위→아래 링 분기는 2026-09-30 삭제 */
  diagonal?: boolean;
  /** 흰색 거리 — 생략하면 ringCornerPx(radius). 지구본 스킨 카드처럼 사용자가 조정한 값만 명시한다 */
  cornerPx?: number;
  opacity?: number;
}) {
  const id = useId();
  if (width <= 0 || height <= 0) return null;
  const half = strokeWidth / 2;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          <DiagonalRingGradient id={id} width={width} height={height} radius={radius} cornerPx={cornerPx} opacity={opacity} />
        </Defs>
        <Rect x={half} y={half} width={width - strokeWidth} height={height - strokeWidth} rx={radius - half} ry={radius - half}
          fill="none" stroke={`url(#${id})`} strokeWidth={strokeWidth} />
      </Svg>
    </View>
  );
}

/** 폭이 문구마다 달라지는 알약용 — 부모 크기를 실측해 diagonal PillRing을 그린다(Cut 화면 로컬 AutoPillRing과 동일).
 *  부모에 borderWidth·overflow hidden 금지(링이 1px 밀리거나 잘린다). */
export function AutoPillRing() {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width), h = Math.round(e.nativeEvent.layout.height);
        setSize((p) => (p.w === w && p.h === h ? p : { w, h })); // 같은 값 setState 루프 방지
      }}
    >
      <PillRing width={size.w} height={size.h} radius={size.h / 2} />
    </View>
  );
}

/** iOS "투명도 줄이기" — 켜져 있으면 팝오버를 블러 없는 매트로(GlassSurface.useReduceTransparency와 같은 패턴,
 *  그쪽은 export가 아니라 여기 작게 둔다). 안드로이드는 어차피 매트라 구독하지 않는다 */
function useReduceTransparency() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled().then((r) => mounted && setReduce(!!r)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduce);
    return () => { mounted = false; sub.remove(); };
  }, []);
  return reduce;
}

/**
 * 연·월 팝오버의 한 열 — 세로 스냅 휠. 행의 크기·투명도는 네이티브 스크롤 값(scrollY)으로만 보간해
 * 스크롤 중 JS 재렌더가 없다. 멈추면 직전 확정 행과의 차이(행 수)를 onStep으로 알린다 —
 * 값이 아니라 차이를 넘겨야 부모가 아직 재렌더 전(옛 view)이어도 이동량이 틀리지 않는다.
 */
function WheelColumn({ values, index, onStep, width, a11yLabel }: {
  values: number[]; index: number; onStep: (delta: number) => void; width: number; a11yLabel: string;
}) {
  // 열린 순간의 목록·위치로 고정 — 확정 때마다 부모가 다시 렌더돼도 목록이 밀리거나 contentOffset이 다시 걸리지 않는다
  const vals = useRef(values).current;
  const init = useRef(index).current;
  const scrollY = useRef(new Animated.Value(init * WHEEL_ROW_H)).current;
  const hapticIdx = useRef(init);
  const committed = useRef(init);
  const idxAt = (y: number) => Math.max(0, Math.min(vals.length - 1, Math.round(y / WHEEL_ROW_H)));
  const scrollRef = useRef<ScrollView>(null);
  // 보간 노드·이벤트는 마운트 때 한 번만(useState 지연 초기화) — useRef(식)은 식을 렌더마다 다시 평가해
  // 확정 때마다 행 수×2개 노드를 새로 만들었다 버린다
  const [rowStyles] = useState(() => vals.map((_, i) => {
    const inputRange = [-3, -2, -1, 0, 1, 2, 3].map((k) => (i + k) * WHEEL_ROW_H);
    return {
      opacity: scrollY.interpolate({ inputRange, outputRange: WHEEL_OPACITY, extrapolate: 'clamp' }),
      transform: [{ scale: scrollY.interpolate({ inputRange, outputRange: WHEEL_SCALE, extrapolate: 'clamp' }) }],
    };
  }));
  const [onScroll] = useState(() => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
    useNativeDriver: true,
    listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = idxAt(e.nativeEvent.contentOffset.y);
      if (i !== hapticIdx.current) { hapticIdx.current = i; select(); } // 가운데 행이 바뀔 때만 틱
    },
  }));
  const settle = (y: number) => {
    const i = idxAt(y);
    if (i === committed.current) return; // 드래그 끝·관성 끝이 둘 다 와도 한 번만 이동
    const d = i - committed.current;
    committed.current = i;
    onStep(d);
  };
  // 스크린리더: 조절 가능한 컨트롤로 — 위·아래 스와이프로 한 칸씩(예전 패널의 ‹ › 연도 버튼 대체)
  const stepBy = (k: number) => {
    const i = Math.max(0, Math.min(vals.length - 1, committed.current + k));
    scrollRef.current?.scrollTo({ y: i * WHEEL_ROW_H, animated: true });
    settle(i * WHEEL_ROW_H);
  };
  return (
    <Animated.ScrollView
      ref={scrollRef}
      style={{ width, height: POP_H }}
      contentContainerStyle={{ paddingVertical: WHEEL_ROW_H * 3 }}
      contentOffset={{ x: 0, y: init * WHEEL_ROW_H }}
      snapToInterval={WHEEL_ROW_H}
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={onScroll}
      onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
      // iOS는 관성 없이 놓으면 onMomentumScrollEnd가 안 올 수 있어 손 뗄 때 확정한다 — 단 놓은 위치가 아니라
      // 스냅 목표(targetContentOffset)로. 놓은 위치를 반올림하면 속도 방향 올림·내림과 어긋나 한 칸 잘못 갔다 돌아온다.
      // Android는 snapToInterval이면 관성 끝이 항상 온다.
      onScrollEndDrag={(e) => { const tgt = e.nativeEvent.targetContentOffset; if (Platform.OS === 'ios' && tgt) settle(tgt.y); }}
      accessibilityLabel={a11yLabel}
      accessibilityRole="adjustable"
      accessibilityValue={{ text: String(vals[committed.current]) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => stepBy(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
    >
      {vals.map((v, i) => (
        <Animated.View key={v} style={[calS.wheelRow, rowStyles[i]]}>
          <Text style={calS.wheelTxt}>{v}</Text>
        </Animated.View>
      ))}
    </Animated.ScrollView>
  );
}

export function CalendarBottomSheet({
  visible,
  initialStart,
  initialEnd,
  onConfirm,
  onClose,
  startLabel,
  endLabel,
  recordedDates,
  recordedRanges,
  onSelectRecordedTrip,
  asOverlay,
  singleDate,
}: {
  visible: boolean;
  initialStart: Date;
  initialEnd: Date;
  onConfirm: (start: Date, end: Date) => void;
  onClose: () => void;
  startLabel?: string;
  endLabel?: string;
  /** 'YYYY-MM-DD' 키 집합 — 이미 기록이 있는 날짜(점 표시, 밴드 미제공 시 폴백). utils/recordedDates 참조 */
  recordedDates?: Set<string>;
  /** 'YYYY-MM-DD' → 그 기록의 기간·recordId·국가라벨. 있으면 밴드로 렌더링된다 */
  recordedRanges?: Map<string, RecordedRange>;
  /** 밴드(기존 여행)를 탭했을 때 호출 — 신규 작성 시에만 전달. 있으면 탭 즉시 이 콜백으로 동기화한다 */
  onSelectRecordedTrip?: (recordId: string, start: Date, end: Date) => void;
  /** true면 Modal 대신 절대배치 오버레이로 렌더 — 이미 Modal 안인 화면(블로그 여행정보 패널)에서 iOS Modal-in-Modal 문제 회피 */
  asOverlay?: boolean;
  /**
   * true면 기간이 아니라 '하루'만 고른다 — 헤더가 한 칸이 되고 탭 한 번으로 선택이 끝난다.
   * (스트립 하단 날짜 스탬프처럼 단일 날짜만 필요한 곳용. 기본값은 기존 기간 선택 동작)
   * onConfirm은 start === end로 호출된다.
   */
  singleDate?: boolean;
}) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  const { globeSkin } = useSkinSettings();
  const chipPalette = CHIP_PALETTES[globeSkin] ?? CHIP_PALETTES.aurora;
  const insets = useSafeAreaInsets(); // 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨)
  // 셀 폭은 훅으로 실시간 — 모듈 최상위 stageWidthNow()로 박제하면 접힌 채(360dp) 시작해
  // 펼쳤을 때(시트는 480dp로 클램프) 7열 그리드가 그대로 360dp 폭에 머물러 시트 안에서
  // 왼쪽으로 쏠린 채 약 100dp가 빈다.
  const CELL_SIZE = Math.floor((useStageWidth() - SHEET_PAD_H * 2) / 7);
  // 시안 색: 확인 버튼은 진보라. aurora가 아닌 스킨은 스킨 강조색으로 대체(칩 색은 CHIP_PALETTES).
  // 월 네비 화살표·캐럿은 2026-10-06 시안부터 흰색 — 스킨과 무관
  const ui = skinAccent.ringGradient ? { btn: skinAccent.accentDeep } : { btn: '#7C3AED' };
  const startLbl = startLabel ?? t('newRecord.departDate');
  const endLbl = endLabel ?? t('newRecord.arriveDate');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 보이는 달은 {year, month} 한 덩어리로 둔다. 스와이프 핸들러가 setView(v => …) 형태로만
  // 갱신하면 PanResponder가 첫 렌더 값을 박제해도(stale closure) 엉뚱한 달로 튀지 않는다.
  const [view, setView] = useState({ year: initialStart.getFullYear(), month: initialStart.getMonth() });
  const [pickerOpen, setPickerOpen]     = useState(false); // 연·월 휠 팝오버
  const [navBottom, setNavBottom]       = useState(0);     // 월 네비 행 아래 끝(시트 기준) — 팝오버 top 실측
  const reduceTransparency = useReduceTransparency();
  const [tempStart, setTempStart]       = useState<Date | null>(initialStart);
  const [tempEnd, setTempEnd]           = useState<Date | null>(initialEnd);
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [headerW, setHeaderW] = useState(0); // 헤더 알약 테두리 SVG용 실측 폭
  const translateY = useRef(new Animated.Value(600)).current;
  // 월 전환 연출 — 넘어온 방향에서 미끄러져 들어온다
  const slideX  = useRef(new Animated.Value(0)).current;
  const fadeIn  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      setTempStart(initialStart);
      setTempEnd(initialEnd);
      setSelectingEnd(false);
      setView({ year: initialStart.getFullYear(), month: initialStart.getMonth() });
      setPickerOpen(false);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }).start();
    } else {
      translateY.setValue(600);
      // 시트가 닫히면 다이얼 관성·타이머도 끊는다 — 닫힌 뒤 setView가 계속 돌면 다음에 열릴 때 엉뚱한 달
      const d = dial.current;
      if (d.timer) { clearTimeout(d.timer); d.timer = null; }
      if (d.raf != null) { cancelAnimationFrame(d.raf); d.raf = null; }
      d.active = false; setDialActive(false); dialX.setValue(0); dialRot.setValue(0);
    }
  }, [visible]);

  /** delta 개월 이동 + 연출. 값 갱신이 함수형이라 어디서 불려도 안전하다 */
  const changeMonth = useCallback((delta: number) => {
    if (delta === 0) return;
    setView(v => shiftMonth(v.year, v.month, delta));
    slideX.setValue(delta > 0 ? 26 : -26);
    fadeIn.setValue(0.35);
    Animated.parallel([
      Animated.timing(slideX, { toValue: 0, duration: 190, useNativeDriver: true }),
      Animated.timing(fadeIn, { toValue: 1, duration: 190, useNativeDriver: true }),
    ]).start();
    select();
  }, [slideX, fadeIn]); // 둘 다 useRef로 고정된 Animated.Value — 재생성되지 않는다

  // PanResponder는 useRef로 한 번만 만들어져 첫 렌더의 클로저를 박제한다.
  // 최신 콜백을 ref 경유로 부른다 (utils 없이 컴포넌트 안에서 지키는 규칙).
  const changeMonthRef = useRef(changeMonth);
  changeMonthRef.current = changeMonth;
  const pan = useRef(
    PanResponder.create({
      // ⚠️ 반드시 **캡처** 단계여야 한다. 날짜 칸이 TouchableOpacity라 터치 시작 시점에
      // 자식이 이미 responder를 가져가고, 그 뒤 버블 단계의 onMoveShouldSetPanResponder는
      // 아예 호출되지 않는다(ScrollView가 터치어블 위에서 스크롤되는 것과 같은 이유).
      // 탭은 dx가 0에 가까워 조건에 걸리지 않으므로 날짜 선택은 그대로 동작한다.
      onMoveShouldSetPanResponderCapture: (_e, g) =>
        Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      // 한 번 잡은 가로 제스처는 끝까지 유지 — 중간에 뺏기면 월이 넘어가지 않는다
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_e, g) => {
        if (g.dx <= -SWIPE_THRESHOLD) changeMonthRef.current(1);       // 왼쪽으로 밀면 다음 달
        else if (g.dx >= SWIPE_THRESHOLD) changeMonthRef.current(-1);  // 오른쪽으로 밀면 이전 달
      },
    }),
  ).current;

  const handlePrevMonth = () => changeMonth(-1);
  const handleNextMonth = () => changeMonth(1);

  /** 팝오버 토글 — 제목 탭과 팝오버 바깥 탭이 같이 쓴다 */
  const openPicker = () => {
    setPickerOpen(o => !o);
    select();
  };

  // ── 월 다이얼 ── 제목을 꾹 누르면 드래그 모드. 슬롯이 바뀔 때만 월을 갱신하고(격자·알약 재계산은
  // 그때만), 그 사이엔 제목 휠만 움직인다. 놓으면 속도만큼 관성으로 더 돌다 스냅. 짧은 탭은 기존대로 패널.
  // PanResponder는 첫 렌더에 박제되므로 최신값은 전부 ref 경유.
  const [dialActive, setDialActive] = useState(false);
  const dialX   = useRef(new Animated.Value(0)).current; // 휠 스트립 translateX (= -(소수부) × 칸 폭)
  const dialRot = useRef(new Animated.Value(0)).current; // 누적 개월(소수) — 캐럿 회전용
  const dial = useRef({
    active: false, offset: 0, committed: 0, start: 0,
    base: { year: initialStart.getFullYear(), month: initialStart.getMonth() },
    timer: null as ReturnType<typeof setTimeout> | null,
    raf: null as number | null,
    lastUpd: 0,
  });
  const viewRef = useRef(view); viewRef.current = view;
  const pickerOpenRef = useRef(pickerOpen); pickerOpenRef.current = pickerOpen;
  const openPickerRef = useRef(openPicker); openPickerRef.current = openPicker;
  const applyDial = (offset: number) => {
    const d = dial.current;
    d.offset = offset;
    const committed = Math.round(offset);
    if (committed !== d.committed) {
      d.committed = committed;
      setView(shiftMonth(d.base.year, d.base.month, committed));
      select();
    }
    dialX.setValue(-(offset - committed) * DIAL_LABEL_W);
    dialRot.setValue(offset);
  };
  const stopDialMomentum = () => {
    if (dial.current.raf != null) { cancelAnimationFrame(dial.current.raf); dial.current.raf = null; }
  };
  const snapDial = () => {
    const d = dial.current;
    d.offset = d.committed;
    Animated.parallel([
      Animated.timing(dialX, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(dialRot, { toValue: d.committed, duration: 160, useNativeDriver: true }),
    ]).start(() => { d.active = false; setDialActive(false); });
  };
  const startDialMomentum = (v0: number) => {
    stopDialMomentum();
    let v = v0; // 개월/ms
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      const dt = Math.min(now - last, 50);
      last = now;
      v *= Math.pow(0.994, dt); // 감쇠(통계 탭과 동일)
      applyDial(dial.current.offset + v * dt);
      if (Math.abs(v) < 0.0004) { dial.current.raf = null; snapDial(); return; }
      dial.current.raf = requestAnimationFrame(tick);
    };
    dial.current.raf = requestAnimationFrame(tick);
  };
  const dialFns = useRef({ applyDial, stopDialMomentum, snapDial, startDialMomentum });
  dialFns.current = { applyDial, stopDialMomentum, snapDial, startDialMomentum };
  useEffect(() => () => { // 언마운트 시 타이머·관성 정리
    const d = dial.current;
    if (d.timer) clearTimeout(d.timer);
    if (d.raf != null) cancelAnimationFrame(d.raf);
  }, []);
  const dialPan = useRef(
    PanResponder.create({
      // 캡처 단계로 잡아 안쪽 TouchableOpacity가 터치를 못 가져가게 한다(탭은 release에서 직접 처리,
      // TouchableOpacity의 onPress는 VoiceOver/TalkBack 활성화 경로로만 남는다)
      onStartShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const d = dial.current;
        const wasSpinning = d.raf != null;
        dialFns.current.stopDialMomentum();
        if (wasSpinning) { d.start = d.offset; return; } // 관성 중 재터치 — 바로 이어서 드래그(연속 플릭)
        if (pickerOpenRef.current) return;
        d.timer = setTimeout(() => {
          d.timer = null;
          d.active = true; d.offset = 0; d.committed = 0; d.start = 0;
          d.base = { ...viewRef.current };
          dialRot.setValue(0);
          setDialActive(true);
          grab();
        }, DIAL_HOLD_MS);
      },
      onPanResponderMove: (_e, g) => {
        const d = dial.current;
        if (!d.active) {
          // 꾹 누르기 전에 손가락이 움직이면 길게 누르기 취소(스크롤·오탭 방지)
          if (d.timer && (Math.abs(g.dx) > 10 || Math.abs(g.dy) > 10)) { clearTimeout(d.timer); d.timer = null; }
          return;
        }
        const now = Date.now();
        if (now - d.lastUpd < 16) return; // 프레임 단위 스로틀
        d.lastUpd = now;
        dialFns.current.applyDial(d.start - g.dx / DIAL_SLOT); // 왼쪽으로 끌면 다음 달
      },
      onPanResponderRelease: (_e, g) => {
        const d = dial.current;
        if (d.timer) { clearTimeout(d.timer); d.timer = null; }
        if (d.active) {
          const v = Math.max(-0.015, Math.min(0.015, -g.vx / DIAL_SLOT)); // px/ms → 개월/ms
          if (Math.abs(v) > 0.0015) dialFns.current.startDialMomentum(v);
          else { dialFns.current.snapDial(); select(); }
        } else if (Math.abs(g.dx) < 10 && Math.abs(g.dy) < 10) {
          openPickerRef.current(); // 짧은 탭 = 연·월 패널(기존 동작)
        }
      },
      onPanResponderTerminate: () => {
        const d = dial.current;
        if (d.timer) { clearTimeout(d.timer); d.timer = null; }
        if (d.active) dialFns.current.snapDial();
      },
    }),
  ).current;
  const dialCaretRotate = dialRot.interpolate({
    inputRange: [-1000, 1000],
    outputRange: [`${-1000 * DIAL_ROT_PER_MONTH}deg`, `${1000 * DIAL_ROT_PER_MONTH}deg`],
  });
  const monthLabel = (delta: number) => {
    const v = shiftMonth(view.year, view.month, delta);
    return t('calendar.yearMonth', { y: v.year, m: v.month + 1 });
  };

  const handleDayPress = (date: Date) => {
    select();
    // 단일 날짜 모드 — 시작=종료로 한 번에 확정. 기간 선택 단계(selectingEnd)로 넘어가지 않는다
    if (singleDate) {
      setTempStart(date); setTempEnd(date); setSelectingEnd(false);
      return;
    }
    const range = recordedRanges?.get(toDateKey(date));
    // 신규 작성: 밴드(기존 여행) 탭 → 여행 정보 동기화 후 상위에서 시트 닫음
    if (range && onSelectRecordedTrip) {
      onSelectRecordedTrip(range.recordId, range.start, range.end);
      return;
    }
    if (!selectingEnd) {
      // 편집/앨범 모드: 밴드 탭 시 기간만 통째 선택 (기존 동작 유지)
      if (range) {
        setTempStart(range.start); setTempEnd(range.end); setSelectingEnd(false);
        return;
      }
      setTempStart(date); setTempEnd(null); setSelectingEnd(true);
    } else {
      if (isBeforeDay(date, tempStart!)) { setTempStart(date); setTempEnd(null); }
      else { setTempEnd(date); setSelectingEnd(false); }
    }
  };

  const handleConfirm = () => {
    const s = tempStart ?? today;
    const e = tempEnd ?? s;
    onConfirm(s, e);
    onClose();
  };

  const grid = buildMonthGrid(view.year, view.month);
  // 기존 여행 알약은 칸마다 조각내지 않고 행 단위로 한 번에 그린다(utils/recordedDates.layoutBandRuns).
  // 칸마다 그리면 이음새가 깨지고 칩이 옆 칸에 가려진다 — 9/13~14 다섯 번 재발한 원인.
  const bandRuns = recordedRanges ? layoutBandRuns(grid, recordedRanges) : [];
  // 선택 구간(출발~도착)도 같은 행 단위 둥근 띠로 그린다 — 칸마다 사각으로 칠하면 여행 알약 밑에
  // 모서리 각진 보라 블록이 깔려 시안과 어긋난다(9/21). 양 끝 원은 칸 쪽(edgeCircle)이 그대로 그린다.
  const selRuns = tempStart && tempEnd
    ? layoutBandRuns(grid, new Map([['sel', { start: tempStart, end: tempEnd, recordId: 'sel', countryLabel: '' }]]))
    : [];
  const PILL_INSET = 3;   // 알약 위·아래 여백(시안: 50 행에 44 알약)
  const CHIP_H = 18;
  const CHIP_BOX_W = CELL_SIZE * 2; // 칩 배치 상자(투명) — 칩 자체는 글자 길이대로, 이 상자 안에서 가운데 정렬
  const isInRange    = (d: Date) => !tempStart || !tempEnd ? false : !isBeforeDay(d, tempStart) && !isBeforeDay(tempEnd, d);
  const isRangeStart = (d: Date) => !!tempStart && isSameDay(d, tempStart);
  const isRangeEnd   = (d: Date) => !!tempEnd   && isSameDay(d, tempEnd);
  const fmtSel = (d: Date | null) =>
    d ? `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}` : '—';

  // 휠 연도 범위 — 오늘 기준 -60…+10년, 보던 해가 밖이면 포함되게 늘린다(열의 목록은 열린 순간 고정)
  const yearFrom = Math.min(today.getFullYear() - 60, view.year);
  const yearTo   = Math.max(today.getFullYear() + 10, view.year);
  const wheelYears = Array.from({ length: yearTo - yearFrom + 1 }, (_, i) => yearFrom + i);

  // 시트 본체 — Modal 래핑과 오버레이 모드가 공유
  const body = (
      <View style={[calS.overlay, asOverlay && StyleSheet.absoluteFillObject]} accessibilityViewIsModal>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) */}
        <Animated.View style={[calS.sheet, { paddingBottom: Platform.OS === 'ios' ? 36 : insets.bottom + 16 }, { transform: [{ translateY }] }]}>
          <View style={calS.handle} />
          <View style={calS.selectedRow} onLayout={(e) => setHeaderW(Math.round(e.nativeEvent.layout.width))}>
            <PillRing width={headerW} height={HEADER_H} radius={HEADER_H / 2} />
            {singleDate ? (
              // 단일 날짜 — 시작→종료 두 칸 대신 한 칸만
              <View style={calS.selectedItem}>
                <Text style={calS.selectedLabel} {...andFitText}>{startLbl}</Text>
                <Text style={[calS.selectedDate, calS.selectedDateActive, { color: skinAccent.accent }]} {...andFitText}>{fmtSel(tempStart)}</Text>
              </View>
            ) : (
              <>
                <View style={calS.selectedItem}>
                  <Text style={calS.selectedLabel} {...andFitText}>{startLbl}</Text>
                  <Text style={[calS.selectedDate, !selectingEnd && [calS.selectedDateActive, { color: skinAccent.accent }]]} {...andFitText}>{fmtSel(tempStart)}</Text>
                </View>
                <Text style={calS.selectedArrow}>›</Text>
                <View style={calS.selectedItem}>
                  <Text style={calS.selectedLabel} {...andFitText}>{endLbl}</Text>
                  <Text style={[calS.selectedDate, selectingEnd && [calS.selectedDateActive, { color: skinAccent.accent }]]} {...andFitText}>{fmtSel(tempEnd)}</Text>
                </View>
              </>
            )}
          </View>

          {/* 월 네비(시안 2026-10-06) — 왼쪽 제목+원형 캐럿, 오른쪽 ‹ › 두 칸. 폭을 그리드(7칸)에 맞춰야
              화살표 중심이 금·토 열 중심에 온다(시트 콘텐츠 폭은 floor 나머지만큼 그리드보다 넓다) */}
          <View
            style={[calS.monthNav, { width: CELL_SIZE * 7 }]}
            onLayout={(e) => { const { y, height } = e.nativeEvent.layout; setNavBottom(Math.round(y + height)); }}
          >
            {/* 월 타이틀: 탭 → 연·월 휠 팝오버, 꾹(350ms) → 다이얼 모드(좌우 드래그로 월 휠 회전). 바깥 View가 캡처 */}
            <View {...dialPan.panHandlers}>
              <TouchableOpacity
                onPress={openPicker}
                style={calS.monthTitleBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('calendar.a11yPickMonth')}
                accessibilityState={{ expanded: pickerOpen }}
              >
                {/* 평상시엔 글자 폭대로(캐럿이 제목에 붙는다), 다이얼 중에만 DIAL_LABEL_W 창. 전부 왼쪽 정렬이라
                    다이얼이 시작돼 창이 넓어져도 현재 제목 글자는 제자리다 */}
                <View style={[calS.monthWheel, dialActive && calS.monthWheelActive]}>
                  <Animated.View style={[dialActive && calS.monthWheelActive, { transform: [{ translateX: dialX }] }]}>
                    {dialActive && <Text style={[calS.monthTitle, calS.monthWheelSide, { left: -DIAL_LABEL_W }]}>{monthLabel(-1)}</Text>}
                    <Text style={[calS.monthTitle, calS.monthWheelCur, dialActive && calS.monthWheelActive]}>{monthLabel(0)}</Text>
                    {dialActive && <Text style={[calS.monthTitle, calS.monthWheelSide, { left: DIAL_LABEL_W }]}>{monthLabel(1)}</Text>}
                  </Animated.View>
                </View>
                {/* 원(14) 안의 작은 ›. 팝오버 열림이면 아래로(90°), 다이얼 중엔 드래그만큼 회전. RNSVG 터치 삼킴 방지로 none */}
                <Animated.View pointerEvents="none" style={[calS.monthCaret, { transform: [{ rotate: pickerOpen ? '90deg' : dialCaretRotate }] }]}>
                  <Svg width={6} height={8} viewBox="0 0 6 8" fill="none">
                    <Path d="M2 1.5L4.5 4L2 6.5" stroke="#FFFFFF" strokeOpacity={0.85} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </Animated.View>
              </TouchableOpacity>
            </View>
            <View style={calS.navArrows}>
              <TouchableOpacity
                onPress={handlePrevMonth}
                style={[calS.navBtn, { width: CELL_SIZE }]}
                accessibilityRole="button"
                accessibilityLabel={t('calendar.a11yPrevMonth')}
              >
                <BackChevronIcon size={12} color="#FFFFFF" opacity={1} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleNextMonth}
                style={[calS.navBtn, { width: CELL_SIZE }]}
                accessibilityRole="button"
                accessibilityLabel={t('calendar.a11yNextMonth')}
              >
                {/* 공용 chevron은 ‹ 하나뿐 — 뒤집어 ›로 쓴다. RNSVG 터치 삼킴 방지로 감싸는 View는 none */}
                <View pointerEvents="none" style={calS.flipX}>
                  <BackChevronIcon size={12} color="#FFFFFF" opacity={1} />
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── 날짜 그리드 ── 가로 스와이프로 월 전환 */}
            <Animated.View {...pan.panHandlers} style={{ opacity: fadeIn, transform: [{ translateX: slideX }] }}>
              <View style={calS.weekRow}>
                {WEEK_DAY_KEYS.map((dk) => (
                  <Text key={dk} style={[calS.weekDay, { width: CELL_SIZE }]}>{t(dk)}</Text>
                ))}
              </View>
              <View style={calS.grid}>
                {(bandRuns.length > 0 || selRuns.length > 0) && (
                  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                    {selRuns.map((run) => {
                      const w = (run.endCol - run.startCol + 1) * CELL_SIZE;
                      const h = CELL_SIZE - PILL_INSET * 2;
                      return (
                        <View
                          key={`sel-${run.row}`}
                          style={[calS.pill, { backgroundColor: skinAccent.tint(0.18), left: run.startCol * CELL_SIZE, width: w, top: run.row * CELL_SIZE + PILL_INSET, height: h, borderRadius: h / 2 }]}
                        />
                      );
                    })}
                    {/* 알약은 시작일 순으로 그려 늦게 시작한 여행이 위에 겹친다(시안: 스페인 위에 포르투갈) */}
                    {bandRuns.map((run) => {
                      const w = (run.endCol - run.startCol + 1) * CELL_SIZE;
                      const h = CELL_SIZE - PILL_INSET * 2;
                      return (
                        <View
                          key={`pill-${run.recordId}-${run.row}`}
                          style={[calS.pill, { left: run.startCol * CELL_SIZE, width: w, top: run.row * CELL_SIZE + PILL_INSET, height: h, borderRadius: h / 2 }]}
                        >
                          <PillRing width={w} height={h} radius={h / 2} />
                        </View>
                      );
                    })}
                    {/* 칩은 알약을 전부 그린 뒤에 — 어느 알약에도 가려지지 않는다. 조각마다(행마다) 가운데 위 */}
                    {bandRuns.filter((run) => !!run.countryLabel).map((run) => {
                      const center = (run.startCol + run.endCol + 1) / 2 * CELL_SIZE;
                      // 투명 상자를 알약 가운데에 두고 그 안에서 칩을 가운데 정렬 — 글자 길이대로 칩이 커진다('베트남 외 1')
                      const left = Math.min(Math.max(center - CHIP_BOX_W / 2, 0), 7 * CELL_SIZE - CHIP_BOX_W);
                      return (
                        <View
                          key={`chip-${run.recordId}-${run.row}`}
                          pointerEvents="none"
                          style={[calS.countryChipBox, { left, width: CHIP_BOX_W, top: run.row * CELL_SIZE + PILL_INSET - CHIP_H / 2 + 2 }]}
                        >
                          <View style={[calS.countryChip, { height: CHIP_H, maxWidth: CHIP_BOX_W, backgroundColor: chipPalette.bg[run.tripIndex % chipPalette.bg.length] }]}>
                            <Text style={[calS.countryChipText, { color: chipPalette.text }]} numberOfLines={1}>{run.countryLabel}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
                {grid.map((date, idx) => {
                  if (!date) return <View key={`e-${idx}`} style={{ width: CELL_SIZE, height: CELL_SIZE }} />;
                  const isToday = isSameDay(date, today);
                  const isStart = isRangeStart(date);
                  const isEnd   = isRangeEnd(date);
                  const inRange = isInRange(date);
                  const isEdge  = isStart || isEnd;
                  const key = toDateKey(date);
                  const band = recordedRanges?.get(key); // 접근성 라벨·점 폴백 판정용(그리기는 위 오버레이)
                  const hasDot = !band && !!recordedDates?.has(key); // 밴드 없을 때만 점 폴백
                  const a11yDate = t('calendar.a11yDay', { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() });
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => handleDayPress(date)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={band || hasDot ? `${a11yDate}, ${t('calendar.a11yRecorded')}` : a11yDate}
                      accessibilityState={{ selected: isEdge || inRange }}
                      style={[calS.dayCell, { width: CELL_SIZE, height: CELL_SIZE }]}
                    >
                      <View style={[calS.dayInner, isEdge && [calS.edgeCircle, { backgroundColor: skinAccent.accent }]]}>
                        <Text style={[calS.dayText,
                          isToday && !isEdge && [calS.todayText, { color: skinAccent.accent }],
                          isEdge && calS.edgeText,
                        ]}>{date.getDate()}</Text>
                        {hasDot && <View style={[calS.recordDot, { backgroundColor: skinAccent.accent }]} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Animated.View>

          {/* 범례 — 연·월 팝오버는 그리드 위에 떠 있어 시트 높이를 바꾸지 않는다 */}
          {!!recordedDates && recordedDates.size > 0 && (
            <View style={calS.legendRow}>
              <View style={[calS.recordDot, { position: 'relative', bottom: 0, backgroundColor: skinAccent.accent }]} />
              <Text style={calS.legendTxt}>{t('newRecord.calRecordedLegend')}</Text>
            </View>
          )}
          {/* ── 연·월 휠 팝오버(시안 2026-10-06) ── 그리드를 대체하지 않고 제목 아래에 겹쳐 뜬다.
              그리드의 스와이프 PanResponder·slideX 바깥(시트 기준 절대배치)이라 월 전환 연출에 같이 밀리지 않고,
              가로 스와이프 캡처가 휠의 세로 스크롤을 뺏지 않는다. 뒤의 투명 판이 시트 전체를 덮어
              바깥 탭은 닫기만 하고 날짜 선택으로 새지 않는다(제목 다시 탭도 이 판이 받아 닫힌다) */}
          {pickerOpen && (
            <>
              <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={openPicker} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
              <View style={[calS.pop, { top: navBottom + POP_GAP }, (Platform.OS !== 'ios' || reduceTransparency) && calS.popMatte]}>
                {/* iOS만 실제 블러. 안드로이드 BlurView는 experimentalBlurMethod 없이는 no-op이고, dimezis는 형제를
                    못 거르고 children으로 감싼 것만 흐린다 — RN Modal 안에서 그 구조는 위험해 매트로 둔다 */}
                {Platform.OS === 'ios' && !reduceTransparency && (
                  <>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={[StyleSheet.absoluteFill, calS.popSheen]} />
                  </>
                )}
                <LinearGradient colors={POP_TINT} style={StyleSheet.absoluteFill} pointerEvents="none" />
                <WheelColumn
                  values={wheelYears}
                  index={view.year - yearFrom}
                  onStep={(d) => changeMonth(d * 12)}
                  width={72}
                  a11yLabel={`${t('calendar.a11yPickMonth')}, ${t('calendar.yearLabel', { y: view.year })}`}
                />
                <WheelColumn
                  values={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]}
                  index={view.month}
                  onStep={changeMonth}
                  width={32}
                  a11yLabel={`${t('calendar.a11yPickMonth')}, ${t('calendar.yearMonth', { y: view.year, m: view.month + 1 })}`}
                />
                <PillRing width={POP_W} height={POP_H} radius={POP_RADIUS} />
              </View>
            </>
          )}
          {/* 확인 버튼은 팝오버 블록 뒤에 둔다 — 바깥 탭 투명 판보다 위라 휠이 열려 있어도 한 번에 눌린다 */}
          <TouchableOpacity
            onPress={handleConfirm}
            activeOpacity={0.85}
            style={[calS.confirmBtn, { backgroundColor: ui.btn }]}
            accessibilityRole="button"
          >
            {/* 헤더 알약과 같은 폭(시트 콘텐츠 폭)이라 실측값을 함께 쓴다 */}
            <PillRing width={headerW} height={CONFIRM_H} radius={CONFIRM_RADIUS} />
            <Text style={calS.confirmText} {...andFitText}>{t('common.confirm')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
  );

  // 오버레이 모드: 이미 Modal 안인 호출처(블로그 패널)용 — visible일 때만 절대배치로 덮는다
  if (asOverlay) return visible ? body : null;
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      {body}
    </Modal>
  );
}

// ─── 캘린더 바텀시트 전용 스타일 ───
const calS = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  // 이 컴포넌트는 RN Modal이라 App.tsx 루트 클램프 바깥에서 렌더된다. CELL_SIZE는
  // Stage 폭(≤480) 기준으로 계산되므로, 시트 자체도 같은 폭으로 가두고 중앙에 둬야
  // 폴드·태블릿에서 그리드가 왼쪽으로 쏠리지 않는다. overlay(딤 배경)는 전면 유지 —
  // 시트만 좁힌다.
  sheet: {
    backgroundColor: '#333338', // 시안: #0A0B0F 위 #D9D9D9 20%
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: SHEET_PAD_H,
    paddingBottom: 36,
    width: '100%',
    maxWidth: STAGE_MAX_W,
    alignSelf: 'center',
  },
  handle: {
    width: 47,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#484848',
    alignSelf: 'center',
    marginTop: 11,
    marginBottom: 14,
  },
  // 출발·도착 알약 헤더 — 유리 질감(흰 10% + 옅은 테두리)
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: HEADER_H,
    borderRadius: HEADER_H / 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  selectedItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  selectedLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  selectedDate:  { fontSize: 14, fontWeight: '700', color: '#DADADA' },
  selectedDateActive: { color: '#BF85FC' },
  selectedArrow: { fontSize: 18, color: '#DADADA', marginHorizontal: 4 },


  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  navArrows: { flexDirection: 'row' },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  flipX: { transform: [{ scaleX: -1 }] },
  // paddingLeft 18 = 시안의 그리드 왼쪽 끝 → 제목 글자 거리
  monthTitleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 18, paddingRight: 12, paddingVertical: 4 },
  monthTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  // 월 휠 — 다이얼 중에만 고정 폭 창(overflow hidden) 안에서 스트립이 좌우로 흐른다. 이웃 달은 다이얼 중에만 옅게
  monthWheel: { overflow: 'hidden' },
  monthWheelActive: { width: DIAL_LABEL_W },
  monthWheelCur: { textAlign: 'left' },
  monthWheelSide: { position: 'absolute', top: 0, width: DIAL_LABEL_W, textAlign: 'left', opacity: 0.35 },
  // 시안: 지름 14 원(흰 10%) 안에 작은 ›
  monthCaret: { width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },

  // 연·월 휠 팝오버 — 왼쪽 끝 = 그리드 왼쪽 끝(시트 padding 안쪽 x=0). 열 중심 x≈50(연)·≈102(월)이 되게 paddingLeft 14
  pop: {
    position: 'absolute',
    left: SHEET_PAD_H,
    width: POP_W,
    height: POP_H,
    borderRadius: POP_RADIUS,
    overflow: 'hidden',
    flexDirection: 'row',
    paddingLeft: 14,
  },
  popMatte: { backgroundColor: 'rgba(58,56,66,0.97)' }, // 안드로이드·투명도 줄이기 — 블러 없이 시안 평균색
  popSheen: { backgroundColor: 'rgba(255,255,255,0.07)' }, // 시트 #333 위 상단 ≈#414245
  wheelRow: { height: WHEEL_ROW_H, alignItems: 'center', justifyContent: 'center' },
  wheelTxt: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: '#FFFFFF' },

  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekDay: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)', // 시안 2026-10-06: 일·토 포함 전부 흰 50%(일 빨강·토 시안색 폐지)
    paddingVertical: 6,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { alignItems: 'center', justifyContent: 'center' },
  dayInner: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
  },
  dayText:     { fontSize: 14, color: '#FFFFFF' },
  todayText:   { color: '#BF85FC', fontWeight: '700' },

  edgeCircle: { backgroundColor: '#BF85FC' },
  edgeText: { color: '#FFFFFF', fontWeight: '700' },
  // 기록 있음 점 — 날짜 숫자 아래 4px 점
  recordDot: { position: 'absolute', bottom: 2, width: 4, height: 4, borderRadius: 2 },
  // 기존 여행 알약 — 행 안에서 이어지는 구간 하나가 View 하나(좌표는 호출부가 CELL_SIZE로 계산).
  // 유리 질감(흰 10% + PillRing 그라데이션 테두리). 겹치는 날은 두 알약이 그대로 겹친다(시안).
  pill: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  // 국가명 칩 — 알약 조각마다 가운데 위에 얹음(행이 바뀌면 다시). 상자는 투명·절대배치, 칩은 글자 길이대로
  countryChipBox: { position: 'absolute', alignItems: 'center' },
  countryChip: {
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countryChipText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingHorizontal: 4 },
  legendTxt: { fontSize: 11, color: 'rgba(255,255,255,0.45)' },

  confirmBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: CONFIRM_RADIUS,
    height: CONFIRM_H,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  confirmText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
