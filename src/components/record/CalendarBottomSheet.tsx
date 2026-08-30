import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { select } from '../../utils/haptics';
import { Text } from '../../ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSkinAccent } from '../../constants/skinTheme';
import type { RecordedRange } from '../../utils/recordedDates';
import { useStageWidth, STAGE_MAX_W } from '../../utils/stage';
import { andFitText } from '../../utils/fitText';
import {
  toDateKey,
  isSameDay,
  isBeforeDay,
  buildMonthGrid,
  daysInMonth as daysInMonthOf,
  shiftMonth,
  tripLength,
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
  const insets = useSafeAreaInsets(); // 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨)
  // 셀 폭은 훅으로 실시간 — 모듈 최상위 stageWidthNow()로 박제하면 접힌 채(360dp) 시작해
  // 펼쳤을 때(시트는 480dp로 클램프) 7열 그리드가 그대로 360dp 폭에 머물러 시트 안에서
  // 왼쪽으로 쏠린 채 약 100dp가 빈다.
  const CELL_SIZE = Math.floor((useStageWidth() - 32 - 12) / 7);
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

  const isThisMonth = view.year === today.getFullYear() && view.month === today.getMonth();
  const goToday = () => {
    if (isThisMonth) return;
    const delta = (today.getFullYear() * 12 + today.getMonth()) - (view.year * 12 + view.month);
    changeMonth(delta);
  };

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
  const daysInViewMonth = daysInMonthOf(view.year, view.month);
  const isInRange    = (d: Date) => !tempStart || !tempEnd ? false : !isBeforeDay(d, tempStart) && !isBeforeDay(tempEnd, d);
  const isRangeStart = (d: Date) => !!tempStart && isSameDay(d, tempStart);
  const isRangeEnd   = (d: Date) => !!tempEnd   && isSameDay(d, tempEnd);
  const fmtSel = (d: Date | null) =>
    d ? `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}` : '—';

  // 선택 기간 요약 — 기간 모드에서 양끝이 정해졌을 때만
  const lengthText = (() => {
    if (singleDate || !tempStart || !tempEnd) return null;
    const { nights, days } = tripLength(tempStart, tempEnd);
    return nights === 0 ? t('calendar.sameDay') : t('calendar.nights', { n: nights, d: days });
  })();

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
          <View style={[calS.selectedRow, { backgroundColor: skinAccent.tint(0.08) }]}>
            {singleDate ? (
              // 단일 날짜 — 시작→종료 두 칸 대신 한 칸만
              <View style={calS.selectedItem}>
                <Text style={calS.selectedLabel}>{startLbl}</Text>
                <Text style={[calS.selectedDate, calS.selectedDateActive, { color: skinAccent.accent }]}>{fmtSel(tempStart)}</Text>
              </View>
            ) : (
              <>
                <View style={calS.selectedItem}>
                  <Text style={calS.selectedLabel}>{startLbl}</Text>
                  <Text style={[calS.selectedDate, !selectingEnd && [calS.selectedDateActive, { color: skinAccent.accent }]]}>{fmtSel(tempStart)}</Text>
                </View>
                <Text style={calS.selectedArrow}>→</Text>
                <View style={calS.selectedItem}>
                  <Text style={calS.selectedLabel}>{endLbl}</Text>
                  <Text style={[calS.selectedDate, selectingEnd && [calS.selectedDateActive, { color: skinAccent.accent }]]}>{fmtSel(tempEnd)}</Text>
                </View>
              </>
            )}
          </View>

          {/* 기간 요약 · 오늘로 이동 — 월 내비게이션의 좌우 대칭을 깨지 않도록 별도 줄에 둔다 */}
          <View style={calS.toolRow}>
            {lengthText ? (
              <View style={[calS.lengthChip, { backgroundColor: skinAccent.tint(0.14) }]}>
                <Text style={[calS.lengthTxt, { color: skinAccent.accent }]} {...andFitText}>{lengthText}</Text>
              </View>
            ) : <View />}
            <TouchableOpacity
              onPress={goToday}
              disabled={isThisMonth}
              activeOpacity={0.8}
              style={[calS.todayChip, { borderColor: skinAccent.tint(isThisMonth ? 0.15 : 0.45) }]}
              accessibilityRole="button"
              accessibilityLabel={t('calendar.a11yToday')}
              accessibilityState={{ disabled: isThisMonth }}
            >
              <Text style={[calS.todayTxt, { color: isThisMonth ? 'rgba(255,255,255,0.3)' : skinAccent.accent }]} {...andFitText}>
                {t('calendar.today')}
              </Text>
            </TouchableOpacity>
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
            {/* 월 타이틀 탭 → 연·월 점프. 2년 전 여행을 넣으려고 ‹ 를 24번 누르던 것을 두 번으로 줄인다 */}
            <TouchableOpacity
              onPress={openPicker}
              style={calS.monthTitleBtn}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('calendar.a11yPickMonth')}
              accessibilityState={{ expanded: pickerOpen }}
            >
              <Text style={calS.monthTitle}>{t('calendar.yearMonth', { y: view.year, m: view.month + 1 })}</Text>
              <Text style={[calS.monthCaret, { color: skinAccent.accent }, pickerOpen && calS.monthCaretOpen]}>▾</Text>
            </TouchableOpacity>
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
                {grid.map((date, idx) => {
                  if (!date) return <View key={`e-${idx}`} style={{ width: CELL_SIZE, height: CELL_SIZE }} />;
                  const dow = date.getDay();
                  const isToday = isSameDay(date, today);
                  const isStart = isRangeStart(date);
                  const isEnd   = isRangeEnd(date);
                  const inRange = isInRange(date);
                  const isEdge  = isStart || isEnd;
                  const key = toDateKey(date);
                  const band = recordedRanges?.get(key);
                  const isTripStart = !!band && isSameDay(date, band.start);
                  // 인접일이 같은 여행인지 — Date 생성자가 월 경계를 자동 롤오버하므로 전/다음달 날짜도 정확히 조회된다
                  const prevSame = !!band && recordedRanges?.get(toDateKey(new Date(view.year, view.month, date.getDate() - 1)))?.recordId === band.recordId;
                  const nextSame = !!band && recordedRanges?.get(toDateKey(new Date(view.year, view.month, date.getDate() + 1)))?.recordId === band.recordId;
                  const isMonthFirst = date.getDate() === 1;
                  const isMonthLast  = date.getDate() === daysInViewMonth;
                  // 캡(반원)으로 닫는 지점: 옆날이 같은 여행이 아닐 때(시작/끝·다른 여행과 인접)·주 경계·월 경계
                  const bandLeftRound  = !!band && (!prevSame || dow === 0 || isMonthFirst);
                  const bandRightRound = !!band && (!nextSame || dow === 6 || isMonthLast);
                  // 국가 칩: 여행 시작일, 또는 지난달부터 이어진 여행의 이번 달 첫 칸
                  const showChip = !!band && !!band.countryLabel && (isTripStart || (isMonthFirst && prevSame));
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
                      {band && (
                        <View
                          pointerEvents="none"
                          style={[calS.bandSeg, { backgroundColor: skinAccent.tint(0.12), borderColor: skinAccent.tint(0.55) },
                            bandLeftRound && calS.bandSegLeft,
                            bandRightRound && calS.bandSegRight,
                          ]}
                        />
                      )}
                      {band && showChip && (
                        <View style={[calS.countryChip, { backgroundColor: skinAccent.accent, maxWidth: CELL_SIZE + 20 }]} pointerEvents="none">
                          <Text style={calS.countryChipText} numberOfLines={1}>{band.countryLabel}</Text>
                        </View>
                      )}
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
            style={[calS.confirmBtn, { backgroundColor: skinAccent.accentDeep }]}
            onPress={handleConfirm}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
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
    backgroundColor: '#1E1E2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 36,
    width: '100%',
    maxWidth: STAGE_MAX_W,
    alignSelf: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(191,133,252,0.08)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  selectedItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  selectedLabel: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  selectedDate:  { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
  selectedDateActive: { color: '#BF85FC' },
  selectedArrow: { fontSize: 18, color: 'rgba(255,255,255,0.25)', marginHorizontal: 8 },

  // 기간 요약(좌) · 오늘(우)
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    minHeight: 26,
  },
  lengthChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  lengthTxt: { fontSize: 12, fontWeight: '700' },
  todayChip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  todayTxt: { fontSize: 12, fontWeight: '700' },

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
  monthTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  monthCaret: { fontSize: 12, color: '#BF85FC' },
  monthCaretOpen: { transform: [{ rotate: '180deg' }] },

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
    color: 'rgba(255,255,255,0.45)',
    paddingVertical: 6,
  },
  sundayText:  { color: '#FF3B30' },
  saturdayText:{ color: '#5AC8FA' },

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
  // 기존 여행 캡슐 밴드 — 기간을 타원(스타디움)형 테두리로 감싼다.
  // 중간 셀은 위·아래 선만 이어지고, 시작/끝(또는 주 경계)에서 반원 캡으로 닫힌다.
  bandSeg: {
    position: 'absolute', left: 0, right: 0, top: 5, bottom: 5,
    borderTopWidth: 1.5, borderBottomWidth: 1.5,
  },
  bandSegLeft: {
    borderLeftWidth: 1.5,
    borderTopLeftRadius: 999, borderBottomLeftRadius: 999,
    marginLeft: 3, // 인접한 다른 여행 캡슐과 시각적으로 분리(양쪽 합 6px 간격)
  },
  bandSegRight: {
    borderRightWidth: 1.5,
    borderTopRightRadius: 999, borderBottomRightRadius: 999,
    marginRight: 3,
  },
  // 국가명 칩 — 밴드 시작일 셀 상단에 얹음
  countryChip: {
    position: 'absolute', top: -7, left: 2, zIndex: 5,
    // maxWidth는 CELL_SIZE에서 파생되므로 호출부에서 인라인으로 준다(스타일시트는 모듈 최상위).
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8,
  },
  countryChipText: { fontSize: 9, fontWeight: '700', color: '#0A0A0F' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingHorizontal: 4 },
  legendTxt: { fontSize: 11, color: 'rgba(255,255,255,0.45)' },

  confirmBtn: {
    backgroundColor: '#6B21A8',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  confirmText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
