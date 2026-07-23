import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';
import { useSkinAccent } from '../../constants/skinTheme';
import type { RecordedRange } from '../../utils/recordedDates';

/**
 * 기간 선택 캘린더 바텀시트 — NewRecordScreen / AlbumCreateScreen 공용.
 * (NewRecordScreen 에서 분리)
 */
const { width: SCREEN_W } = Dimensions.get('window');

// ─── 날짜 유틸 ───
const toDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isSameDay = (a: Date, b: Date) => toDateKey(a) === toDateKey(b);
const isBefore  = (a: Date, b: Date) => toDateKey(a) < toDateKey(b);

const WEEK_DAY_KEYS = ['blog.week0', 'blog.week1', 'blog.week2', 'blog.week3', 'blog.week4', 'blog.week5', 'blog.week6'] as const;
const CELL_SIZE = Math.floor((SCREEN_W - 32 - 12) / 7);

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
}) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  const startLbl = startLabel ?? t('newRecord.departDate');
  const endLbl = endLabel ?? t('newRecord.arriveDate');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewYear, setViewYear]         = useState(initialStart.getFullYear());
  const [viewMonth, setViewMonth]       = useState(initialStart.getMonth());
  const [tempStart, setTempStart]       = useState<Date | null>(initialStart);
  const [tempEnd, setTempEnd]           = useState<Date | null>(initialEnd);
  const [selectingEnd, setSelectingEnd] = useState(false);
  const translateY = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    if (visible) {
      setTempStart(initialStart);
      setTempEnd(initialEnd);
      setSelectingEnd(false);
      setViewYear(initialStart.getFullYear());
      setViewMonth(initialStart.getMonth());
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }).start();
    } else {
      translateY.setValue(600);
    }
  }, [visible]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const handleNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const handleDayPress = (date: Date) => {
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
      if (isBefore(date, tempStart!)) { setTempStart(date); setTempEnd(null); }
      else { setTempEnd(date); setSelectingEnd(false); }
    }
  };

  const handleConfirm = () => {
    const s = tempStart ?? today;
    const e = tempEnd ?? s;
    onConfirm(s, e);
    onClose();
  };

  const buildGrid = useCallback(() => {
    const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewYear, viewMonth, d);
      date.setHours(0, 0, 0, 0);
      cells.push(date);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  const grid = buildGrid();
  const isInRange    = (d: Date) => !tempStart || !tempEnd ? false : !isBefore(d, tempStart) && !isBefore(tempEnd, d);
  const isRangeStart = (d: Date) => !!tempStart && isSameDay(d, tempStart);
  const isRangeEnd   = (d: Date) => !!tempEnd   && isSameDay(d, tempEnd);
  const fmtSel = (d: Date | null) =>
    d ? `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}` : '—';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={calS.overlay} accessibilityViewIsModal>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[calS.sheet, { transform: [{ translateY }] }]}>
          <View style={calS.handle} />
          <View style={[calS.selectedRow, { backgroundColor: skinAccent.tint(0.08) }]}>
            <View style={calS.selectedItem}>
              <Text style={calS.selectedLabel}>{startLbl}</Text>
              <Text style={[calS.selectedDate, !selectingEnd && [calS.selectedDateActive, { color: skinAccent.accent }]]}>{fmtSel(tempStart)}</Text>
            </View>
            <Text style={calS.selectedArrow}>→</Text>
            <View style={calS.selectedItem}>
              <Text style={calS.selectedLabel}>{endLbl}</Text>
              <Text style={[calS.selectedDate, selectingEnd && [calS.selectedDateActive, { color: skinAccent.accent }]]}>{fmtSel(tempEnd)}</Text>
            </View>
          </View>
          <View style={calS.monthNav}>
            <TouchableOpacity onPress={handlePrevMonth} style={calS.navBtn}><Text style={[calS.navArrow, { color: skinAccent.accent }]}>‹</Text></TouchableOpacity>
            <Text style={calS.monthTitle}>{t('cutInfo.yearMonth', { y: viewYear, m: viewMonth + 1 })}</Text>
            <TouchableOpacity onPress={handleNextMonth} style={calS.navBtn}><Text style={[calS.navArrow, { color: skinAccent.accent }]}>›</Text></TouchableOpacity>
          </View>
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
              const isTripEnd   = !!band && isSameDay(date, band.end);
              const bandLeftRound  = !!band && (isTripStart || dow === 0);
              const bandRightRound = !!band && (isTripEnd   || dow === 6);
              const hasDot = !band && !!recordedDates?.has(key); // 밴드 없을 때만 점 폴백
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => handleDayPress(date)}
                  activeOpacity={0.7}
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
                  {band && isTripStart && !!band.countryLabel && (
                    <View style={[calS.countryChip, { backgroundColor: skinAccent.accent }]} pointerEvents="none">
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
          {!!recordedDates && recordedDates.size > 0 && (
            <View style={calS.legendRow}>
              <View style={[calS.recordDot, { position: 'relative', bottom: 0, backgroundColor: skinAccent.accent }]} />
              <Text style={calS.legendTxt}>{t('newRecord.calRecordedLegend')}</Text>
            </View>
          )}
          <TouchableOpacity style={[calS.confirmBtn, { backgroundColor: skinAccent.accentDeep }]} onPress={handleConfirm} activeOpacity={0.85}>
            <Text style={calS.confirmText}>{t('common.confirm')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
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
  sheet: {
    backgroundColor: '#1E1E2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 36,
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
    marginBottom: 16,
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

  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 26, color: '#BF85FC', lineHeight: 30 },
  monthTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

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
    marginLeft: 1,
  },
  bandSegRight: {
    borderRightWidth: 1.5,
    borderTopRightRadius: 999, borderBottomRightRadius: 999,
    marginRight: 1,
  },
  // 국가명 칩 — 밴드 시작일 셀 상단에 얹음
  countryChip: {
    position: 'absolute', top: -7, left: 2, zIndex: 5,
    maxWidth: CELL_SIZE + 20, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8,
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
