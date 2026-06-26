import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';

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

const WEEK_DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const CELL_SIZE = Math.floor((SCREEN_W - 32 - 12) / 7);

export function CalendarBottomSheet({
  visible,
  initialStart,
  initialEnd,
  onConfirm,
  onClose,
  startLabel = '출발일',
  endLabel = '도착일',
}: {
  visible: boolean;
  initialStart: Date;
  initialEnd: Date;
  onConfirm: (start: Date, end: Date) => void;
  onClose: () => void;
  startLabel?: string;
  endLabel?: string;
}) {
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
    if (!selectingEnd) {
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
  const MONTH_NAMES  = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  const fmtSel = (d: Date | null) =>
    d ? `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}` : '—';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={calS.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[calS.sheet, { transform: [{ translateY }] }]}>
          <View style={calS.handle} />
          <View style={calS.selectedRow}>
            <View style={calS.selectedItem}>
              <Text style={calS.selectedLabel}>{startLabel}</Text>
              <Text style={[calS.selectedDate, !selectingEnd && calS.selectedDateActive]}>{fmtSel(tempStart)}</Text>
            </View>
            <Text style={calS.selectedArrow}>→</Text>
            <View style={calS.selectedItem}>
              <Text style={calS.selectedLabel}>{endLabel}</Text>
              <Text style={[calS.selectedDate, selectingEnd && calS.selectedDateActive]}>{fmtSel(tempEnd)}</Text>
            </View>
          </View>
          <View style={calS.monthNav}>
            <TouchableOpacity onPress={handlePrevMonth} style={calS.navBtn}><Text style={calS.navArrow}>‹</Text></TouchableOpacity>
            <Text style={calS.monthTitle}>{viewYear}년 {MONTH_NAMES[viewMonth]}</Text>
            <TouchableOpacity onPress={handleNextMonth} style={calS.navBtn}><Text style={calS.navArrow}>›</Text></TouchableOpacity>
          </View>
          <View style={calS.weekRow}>
            {WEEK_DAYS.map((d, i) => (
              <Text key={d} style={[calS.weekDay, { width: CELL_SIZE }, i===0 && calS.sundayText, i===6 && calS.saturdayText]}>{d}</Text>
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
              return (
                <TouchableOpacity
                  key={toDateKey(date)}
                  onPress={() => handleDayPress(date)}
                  activeOpacity={0.7}
                  style={[calS.dayCell, { width: CELL_SIZE, height: CELL_SIZE },
                    inRange && !isEdge && calS.inRange,
                    isStart && calS.rangeStartCell,
                    isEnd   && calS.rangeEndCell,
                  ]}
                >
                  <View style={[calS.dayInner, isEdge && calS.edgeCircle]}>
                    <Text style={[calS.dayText,
                      isToday && !isEdge && calS.todayText,
                      dow===0 && !isEdge && calS.sundayText,
                      dow===6 && !isEdge && calS.saturdayText,
                      isEdge && calS.edgeText,
                    ]}>{date.getDate()}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity style={calS.confirmBtn} onPress={handleConfirm} activeOpacity={0.85}>
            <Text style={calS.confirmText}>확인</Text>
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

  confirmBtn: {
    backgroundColor: '#6B21A8',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  confirmText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
