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
} from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { select, grab } from '../../utils/haptics';
import { Text } from '../../ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSkinAccent } from '../../constants/skinTheme';
import { useSettings } from '../../store/settingsStore';
import { layoutBandRuns, type RecordedRange } from '../../utils/recordedDates';
import { useStageWidth, STAGE_MAX_W } from '../../utils/stage';
import { andFitText } from '../../utils/fitText';
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
// 연·월 점프 패널의 월 라벨. 템플릿 문자열로 키를 만들면 t()의 키 타입 검사를 빠져나가므로 나열한다
const MONTH_KEYS = ['calendar.m1', 'calendar.m2', 'calendar.m3', 'calendar.m4', 'calendar.m5', 'calendar.m6',
  'calendar.m7', 'calendar.m8', 'calendar.m9', 'calendar.m10', 'calendar.m11', 'calendar.m12'] as const;

/** 스와이프로 월을 넘길 최소 이동 거리(dp). 이보다 짧으면 탭·세로 스크롤로 본다 */
const SWIPE_THRESHOLD = 44;
/** 시트 좌우 여백(dp) — 셀 폭이 여기서 파생된다 */
const SHEET_PAD_H = 24; // 달력 시안 확정값(CELL_SIZE 파생) — 앱 공통 gutter 16 통일에서 의도적으로 제외
/** 출발·도착 헤더 알약 높이 */
const HEADER_H = 48;
/** 확인 버튼 높이(시안 50) */
const CONFIRM_H = 50;
/** 월 다이얼 — 월 제목을 꾹(350ms) 누르면 좌우 드래그로 월이 휠처럼 돈다(통계 탭 원판과 같은 손맛) */
const DIAL_HOLD_MS = 350;
const DIAL_SLOT = 72;       // 손가락 72dp = 1개월
const DIAL_LABEL_W = 140;   // 휠 라벨 한 칸 폭('2026년 12월'·'12/2026'이 들어간다)
const DIAL_ROT_PER_MONTH = 60; // 역삼각형이 1개월당 도는 각도
/** 국가 칩 색 — 스킨별 3색 순환(시안 2026-09-14). 오로라만 흰 글씨, 시안·민트는 검정 90% */
const CHIP_PALETTES: Record<string, { bg: string[]; text: string }> = {
  aurora: { bg: ['#7C3AED', '#926DFF', '#AC6FFF'], text: '#FFFFFF' },
  cyan:   { bg: ['#00D8F3', '#C3F8FF', '#86FFF3'], text: 'rgba(0,0,0,0.9)' },
  mint:   { bg: ['#00F37A', '#86FFBC', '#C3FFCD'], text: 'rgba(0,0,0,0.9)' },
};

/**
 * 알약 테두리 그라데이션 — 기존 앱의 유리 알약(BasicInfo 버튼·탭 바)과 같은 값:
 * #CECFCD → 투명(60% 지점), 위에서 아래로. `diagonal`이면 대신 좌상~우하 대각 대칭(양 끝 흰색,
 * 가운데 투명)으로 그린다 — 블로그 기록 화면 알약 전용이고 달력 알약은 기존 값 그대로다.
 * 폭·높이는 **숫자**로 받는다 — 안드로이드는 Rect의
 * width="100%"가 폭 변경 뒤 갱신되지 않아 옛 윤곽이 겹쳐 보인다(탭 바 사고). RNSVG는 pointerEvents를
 * 무시하므로 View(pointerEvents none)로 감싼다.
 */
/** diagonal 링에서 좌상단·우하단 모서리로부터 흰색이 남는 픽셀 거리. 알약 폭과 무관한 절대값이라 국가·날짜 칩처럼
 *  넓은 알약에서도 모서리만 밝다(비율 단위였을 때는 위 변 40%가 희게 깔려 왼쪽 전체가 밝아 보였다 — 사용자 지적). */
const CORNER_PX = 20;

export function PillRing({ width, height, radius, strokeWidth = 1, diagonal = false }: { width: number; height: number; radius: number; strokeWidth?: number; diagonal?: boolean }) {
  const id = useId();
  if (width <= 0 || height <= 0) return null;
  const half = strokeWidth / 2;
  const cornerT = Math.min(0.5, CORNER_PX / (width + height)); // 아주 작은 알약(w+h<40)은 양쪽 흰색이 가운데서 만난다
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          {/* userSpaceOnUse(픽셀 단위) 45° 축: 점 (x,y)의 진행도 t=(x+y)/(w+h)라 (0,0)=0, (w,h)=1이고 등고선이 진짜 45°다.
              objectBoundingBox는 가로로 긴 알약에서 축이 눕혀져 흰색이 위 변을 따라 길게 번지므로 쓰지 않는다.
              흰색은 모서리에서 x+y<CORNER_PX 안쪽만 — 알약이 아무리 넓어도 같은 크기로 남는다. */}
          {diagonal ? (
            <SvgLinearGradient id={id} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={(width + height) / 2} y2={(width + height) / 2}>
              <Stop offset={0} stopColor="#FFFFFF" stopOpacity={1} />
              <Stop offset={cornerT} stopColor="#FFFFFF" stopOpacity={0} />
              <Stop offset={1 - cornerT} stopColor="#FFFFFF" stopOpacity={0} />
              <Stop offset={1} stopColor="#FFFFFF" stopOpacity={1} />
            </SvgLinearGradient>
          ) : (
            <SvgLinearGradient id={id} x1="0.216" y1="-0.08" x2="0.283" y2="1.10">
              <Stop offset="0" stopColor="#CECFCD" stopOpacity={1} />
              <Stop offset="0.607" stopColor="#CECFCD" stopOpacity={0} />
            </SvgLinearGradient>
          )}
        </Defs>
        <Rect x={half} y={half} width={width - strokeWidth} height={height - strokeWidth} rx={radius - half} ry={radius - half}
          fill="none" stroke={`url(#${id})`} strokeWidth={strokeWidth} />
      </Svg>
    </View>
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
  const { globeSkin } = useSettings();
  const chipPalette = CHIP_PALETTES[globeSkin] ?? CHIP_PALETTES.aurora;
  const insets = useSafeAreaInsets(); // 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨)
  // 셀 폭은 훅으로 실시간 — 모듈 최상위 stageWidthNow()로 박제하면 접힌 채(360dp) 시작해
  // 펼쳤을 때(시트는 480dp로 클램프) 7열 그리드가 그대로 360dp 폭에 머물러 시트 안에서
  // 왼쪽으로 쏠린 채 약 100dp가 빈다.
  const CELL_SIZE = Math.floor((useStageWidth() - SHEET_PAD_H * 2) / 7);
  // 시안 색: 확인 버튼·역삼각형은 진보라. aurora가 아닌 스킨은 스킨 강조색으로 대체(칩 색은 CHIP_PALETTES)
  const ui = skinAccent.ringGradient
    ? { btn: skinAccent.accentDeep, caret: skinAccent.accent }
    : { btn: '#7C3AED', caret: '#926DFF' };
  const startLbl = startLabel ?? t('newRecord.departDate');
  const endLbl = endLabel ?? t('newRecord.arriveDate');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 보이는 달은 {year, month} 한 덩어리로 둔다. 스와이프 핸들러가 setView(v => …) 형태로만
  // 갱신하면 PanResponder가 첫 렌더 값을 박제해도(stale closure) 엉뚱한 달로 튀지 않는다.
  const [view, setView] = useState({ year: initialStart.getFullYear(), month: initialStart.getMonth() });
  const [pickerOpen, setPickerOpen]     = useState(false); // 연·월 점프 패널
  const [pickerYear, setPickerYear]     = useState(initialStart.getFullYear());
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
      setPickerYear(initialStart.getFullYear());
      setPickerOpen(false);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }).start();
    } else {
      translateY.setValue(600);
      // 시트가 닫히면 다이얼 관성·타이머도 끊는다 — 닫힌 뒤 setView가 계속 돌면 다음에 열릴 때 엉뚱한 달
      const d = dial.current;
      if (d.timer) { clearTimeout(d.timer); d.timer = null; }
      if (d.raf != null) { cancelAnimationFrame(d.raf); d.raf = null; }
      d.active = false; setDialActive(false); dialX.setValue(0);
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

  const openPicker = () => {
    setPickerYear(view.year);
    setPickerOpen(o => !o);
    select();
  };
  const pickMonth = (m: number) => {
    const delta = (pickerYear * 12 + m) - (view.year * 12 + view.month);
    setPickerOpen(false);
    if (delta === 0) { select(); return; }
    changeMonth(delta);
  };

  // ── 월 다이얼 ── 제목을 꾹 누르면 드래그 모드. 슬롯이 바뀔 때만 월을 갱신하고(격자·알약 재계산은
  // 그때만), 그 사이엔 제목 휠만 움직인다. 놓으면 속도만큼 관성으로 더 돌다 스냅. 짧은 탭은 기존대로 패널.
  // PanResponder는 첫 렌더에 박제되므로 최신값은 전부 ref 경유.
  const [dialActive, setDialActive] = useState(false);
  const dialX   = useRef(new Animated.Value(0)).current; // 휠 스트립 translateX (= -(소수부) × 칸 폭)
  const dialRot = useRef(new Animated.Value(0)).current; // 누적 개월(소수) — 역삼각형 회전용
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
  const PILL_INSET = 3;   // 알약 위·아래 여백(시안: 50 행에 44 알약)
  const CHIP_H = 18;
  const CHIP_BOX_W = CELL_SIZE * 2; // 칩 배치 상자(투명) — 칩 자체는 글자 길이대로, 이 상자 안에서 가운데 정렬
  const isInRange    = (d: Date) => !tempStart || !tempEnd ? false : !isBeforeDay(d, tempStart) && !isBeforeDay(tempEnd, d);
  const isRangeStart = (d: Date) => !!tempStart && isSameDay(d, tempStart);
  const isRangeEnd   = (d: Date) => !!tempEnd   && isSameDay(d, tempEnd);
  const fmtSel = (d: Date | null) =>
    d ? `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}` : '—';

  // 연·월 패널은 그리드 자리를 그대로 차지한다 — 높이를 맞춰야 열고 닫을 때 시트가 출렁이지 않는다
  const GRID_H = CELL_SIZE * 6 + 32;
  const PICKER_CELL_H = Math.floor((GRID_H - 48) / 4);

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

          <View style={calS.monthNav}>
            <TouchableOpacity
              onPress={handlePrevMonth}
              style={calS.navBtn}
              accessibilityRole="button"
              accessibilityLabel={t('calendar.a11yPrevMonth')}
            >
              <Text style={[calS.navArrow, { color: skinAccent.accent }]}>‹</Text>
            </TouchableOpacity>
            {/* 월 타이틀: 탭 → 연·월 점프, 꾹(350ms) → 다이얼 모드(좌우 드래그로 월 휠 회전). 바깥 View가 캡처 */}
            <View {...dialPan.panHandlers}>
              <TouchableOpacity
                onPress={openPicker}
                style={calS.monthTitleBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('calendar.a11yPickMonth')}
                accessibilityState={{ expanded: pickerOpen }}
              >
                <View style={calS.monthWheel}>
                  <Animated.View style={[calS.monthWheelStrip, { transform: [{ translateX: dialX }] }]}>
                    {dialActive && <Text style={[calS.monthTitle, calS.monthWheelSide, { left: -DIAL_LABEL_W }]}>{monthLabel(-1)}</Text>}
                    <Text style={[calS.monthTitle, calS.monthWheelCur]}>{monthLabel(0)}</Text>
                    {dialActive && <Text style={[calS.monthTitle, calS.monthWheelSide, { left: DIAL_LABEL_W }]}>{monthLabel(1)}</Text>}
                  </Animated.View>
                </View>
                {/* 역삼각형(시안 8×7). RNSVG 터치 삼킴 방지로 View(pointerEvents none)에 감싼다. 다이얼 중엔 드래그만큼 회전 */}
                <Animated.View pointerEvents="none" style={[calS.monthCaret, { transform: [{ rotate: pickerOpen ? '180deg' : dialCaretRotate }] }]}>
                  <Svg width={8} height={7} viewBox="0 0 8 7" fill="none">
                    <Path d="M4.46368 6C4.07878 6.66667 3.11653 6.66667 2.73163 6L0.133555 1.5C-0.251345 0.833333 0.22978 0 0.99958 0L6.19573 0C6.96553 0 7.44666 0.833333 7.06176 1.5L4.46368 6Z" fill={ui.caret} />
                  </Svg>
                </Animated.View>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={handleNextMonth}
              style={calS.navBtn}
              accessibilityRole="button"
              accessibilityLabel={t('calendar.a11yNextMonth')}
            >
              <Text style={[calS.navArrow, { color: skinAccent.accent }]}>›</Text>
            </TouchableOpacity>
          </View>

          {pickerOpen ? (
            // ── 연·월 점프 패널 ── 그리드와 같은 높이를 차지한다
            <View style={{ height: GRID_H }}>
              <View style={calS.yearNav}>
                <TouchableOpacity
                  onPress={() => { setPickerYear(y => y - 1); select(); }}
                  style={calS.navBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('calendar.a11yPrevYear')}
                >
                  <Text style={[calS.navArrow, { color: skinAccent.accent }]}>‹</Text>
                </TouchableOpacity>
                <Text style={calS.yearTitle}>{t('calendar.yearLabel', { y: pickerYear })}</Text>
                <TouchableOpacity
                  onPress={() => { setPickerYear(y => y + 1); select(); }}
                  style={calS.navBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('calendar.a11yNextYear')}
                >
                  <Text style={[calS.navArrow, { color: skinAccent.accent }]}>›</Text>
                </TouchableOpacity>
              </View>
              <View style={calS.monthGrid}>
                {MONTH_KEYS.map((mk, m) => {
                  const on = pickerYear === view.year && m === view.month;
                  const isCurrent = pickerYear === today.getFullYear() && m === today.getMonth();
                  return (
                    <TouchableOpacity
                      key={mk}
                      onPress={() => pickMonth(m)}
                      activeOpacity={0.8}
                      style={[calS.monthCell, { height: PICKER_CELL_H },
                        on && [calS.monthCellOn, { backgroundColor: skinAccent.accent }],
                        !on && isCurrent && { borderColor: skinAccent.tint(0.5), borderWidth: 1 },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[calS.monthCellTxt, on && calS.monthCellTxtOn]} {...andFitText}>{t(mk)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : (
            // ── 날짜 그리드 ── 가로 스와이프로 월 전환
            <Animated.View {...pan.panHandlers} style={{ opacity: fadeIn, transform: [{ translateX: slideX }] }}>
              <View style={calS.weekRow}>
                {WEEK_DAY_KEYS.map((dk, i) => (
                  <Text key={dk} style={[calS.weekDay, { width: CELL_SIZE }, i===0 && calS.sundayText, i===6 && calS.saturdayText]}>{t(dk)}</Text>
                ))}
              </View>
              <View style={calS.grid}>
                {bandRuns.length > 0 && (
                  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
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
                  const dow = date.getDay();
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
                      style={[calS.dayCell, { width: CELL_SIZE, height: CELL_SIZE },
                        inRange && !isEdge && [calS.inRange, { backgroundColor: skinAccent.tint(0.18) }],
                        isStart && [calS.rangeStartCell, { backgroundColor: skinAccent.tint(0.18) }],
                        isEnd   && [calS.rangeEndCell, { backgroundColor: skinAccent.tint(0.18) }],
                      ]}
                    >
                      <View style={[calS.dayInner, isEdge && [calS.edgeCircle, { backgroundColor: skinAccent.accent }]]}>
                        <Text style={[calS.dayText,
                          isToday && !isEdge && [calS.todayText, { color: skinAccent.accent }],
                          dow===0 && !isEdge && calS.sundayText,
                          dow===6 && !isEdge && calS.saturdayText,
                          isEdge && calS.edgeText,
                        ]}>{date.getDate()}</Text>
                        {hasDot && <View style={[calS.recordDot, { backgroundColor: skinAccent.accent }]} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Animated.View>
          )}

          {/* 범례는 연·월 패널이 열려도 계속 그린다 — 숨기면 그 높이만큼 시트가 줄었다 늘어난다
              (패널 자체는 GRID_H로 그리드와 높이를 맞춰 놨는데 여기서 다시 깨진다) */}
          {!!recordedDates && recordedDates.size > 0 && (
            <View style={calS.legendRow}>
              <View style={[calS.recordDot, { position: 'relative', bottom: 0, backgroundColor: skinAccent.accent }]} />
              <Text style={calS.legendTxt}>{t('newRecord.calRecordedLegend')}</Text>
            </View>
          )}
          <TouchableOpacity
            onPress={handleConfirm}
            activeOpacity={0.85}
            style={[calS.confirmBtn, { backgroundColor: ui.btn }]}
            accessibilityRole="button"
          >
            {/* 헤더 알약과 같은 폭(시트 콘텐츠 폭)이라 실측값을 함께 쓴다 */}
            <PillRing width={headerW} height={CONFIRM_H} radius={CONFIRM_H / 2} />
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
    paddingHorizontal: 4,
  },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 26, color: '#BF85FC', lineHeight: 30 },
  monthTitleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 4 },
  monthTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  // 월 휠 — 고정 폭 창(overflow hidden) 안에서 스트립이 좌우로 흐른다. 이웃 달은 다이얼 중에만 옅게
  monthWheel: { width: DIAL_LABEL_W, overflow: 'hidden', alignItems: 'center' },
  monthWheelStrip: { width: DIAL_LABEL_W, alignItems: 'center' },
  monthWheelCur: { width: DIAL_LABEL_W, textAlign: 'center' },
  monthWheelSide: { position: 'absolute', top: 0, width: DIAL_LABEL_W, textAlign: 'center', opacity: 0.35 },
  monthCaret: { width: 8, height: 7, marginTop: 2, alignItems: 'center', justifyContent: 'center' },

  // 연·월 점프 패널
  yearNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    height: 40,
  },
  yearTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', minWidth: 90, textAlign: 'center' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: {
    width: '33.33%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  monthCellOn: { backgroundColor: '#BF85FC' },
  monthCellTxt: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  monthCellTxtOn: { color: '#0A0A0F', fontWeight: '700' },

  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekDay: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    paddingVertical: 6,
  },
  sundayText:  { color: '#FF0138' },
  saturdayText:{ color: '#00D8F3' },

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

  inRange: { backgroundColor: 'rgba(191,133,252,0.18)' },
  rangeStartCell: {
    backgroundColor: 'rgba(191,133,252,0.18)',
    borderTopLeftRadius: 17,
    borderBottomLeftRadius: 17,
  },
  rangeEndCell: {
    backgroundColor: 'rgba(191,133,252,0.18)',
    borderTopRightRadius: 17,
    borderBottomRightRadius: 17,
  },
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
    borderRadius: CONFIRM_H / 2,
    height: CONFIRM_H,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  confirmText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
