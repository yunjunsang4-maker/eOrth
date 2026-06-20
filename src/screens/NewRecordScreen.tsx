import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  PanResponder,
  Modal,
  Animated,
  FlatList,
  ActivityIndicator,
  Linking,
  Alert,
  LayoutAnimation,
  UIManager,
} from 'react-native';

if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import Svg, { Path } from 'react-native-svg';
import { useRecords } from '../store/recordStore';
import type { RootStackScreenProps } from '../navigation/types';
import {
  PlaneIcon as DesignerPlaneIcon,
  CameraIcon as DesignerCameraIcon,
  CompassIcon as DesignerCompassIcon,
  MapIcon as DesignerMapIcon,
  FlagIcon as DesignerFlagIcon,
  SearchIcon as SvgSearchIcon,
  CalendarIcon as SvgCalendarIcon,
  GalleryIcon as SvgGalleryIcon,
  LockClosedIcon as SvgLockClosedIcon,
  LockOpenIcon as SvgLockOpenIcon,
  CoinIcon as SvgCoinIcon,
  TagIcon as SvgTagIcon,
  TakeoffIcon as SvgTakeoffIcon,
  TransferIcon as SvgTransferIcon,
  PartlyCloudyIcon as SvgWeatherIcon,
  SoloIcon as SvgSoloIcon,
  FriendIcon as SvgFriendIcon,
  CoupleIcon as SvgCoupleIcon,
  FamilyIcon as SvgFamilyIcon,
  ParentIcon as SvgParentIcon,
  SiblingIcon as SvgSiblingIcon,
  SunIcon as SvgSunIcon,
  CloudyIcon as SvgCloudyIcon,
  RainIcon as SvgRainIcon,
  SnowIcon as SvgSnowIcon,
  PartlyCloudyIcon as SvgPartlyCloudyIcon,
  WindIcon as SvgWindIcon,
} from '../components/icons';

const { width: SCREEN_W } = Dimensions.get('window');

const COLORS = {
  bg: '#0A0A0F',
  card: '#2E2E3B',
  divider: '#1A1A26',
  purpleNeon: '#BF85FC',
  purpleDeep: '#6B21A8',
  white: '#FFFFFF',
  textDim: '#A1A1B0',
  textMuted: '#4A4A59',
  gold: '#FFD700',
  error: '#FF3B30',
};

// ─── 커스텀 아이콘 (SVG 래퍼) ───
const IC = COLORS.purpleNeon;

const SearchIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => (
  <SvgSearchIcon size={size} color={color} />
);

const CalendarIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => (
  <SvgCalendarIcon size={size} color={color} />
);

const GalleryIcon = ({ size = 20, color = IC }: { size?: number; color?: string }) => (
  <SvgGalleryIcon size={size} color={color} />
);

const CameraIcon = ({ size = 32, color = IC }: { size?: number; color?: string }) => (
  <DesignerCameraIcon size={size} color={color} />
);

const LockClosedIcon = ({ size = 12, color = COLORS.white }: { size?: number; color?: string }) => (
  <SvgLockClosedIcon size={size} color={color} />
);

const LockOpenIcon = ({ size = 12, color = COLORS.white }: { size?: number; color?: string }) => (
  <SvgLockOpenIcon size={size} color={color} />
);

const CoinIcon = ({ size = 18, color = IC }: { size?: number; color?: string }) => (
  <SvgCoinIcon size={size} color={color} />
);

const WeatherIcon = ({ size = 18, color = IC }: { size?: number; color?: string }) => (
  <SvgWeatherIcon size={size} />
);

const PlaneIcon = ({ size = 18, color = IC }: { size?: number; color?: string }) => (
  <DesignerPlaneIcon size={size} color={color} />
);

const TagIcon = ({ size = 18, color = IC }: { size?: number; color?: string }) => (
  <SvgTagIcon size={size} color={color} />
);

const TakeoffIcon = ({ size = 14, color = IC }: { size?: number; color?: string }) => (
  <SvgTakeoffIcon size={size} color={color} />
);

const TransferIcon = ({ size = 14, color = IC }: { size?: number; color?: string }) => (
  <SvgTransferIcon size={size} color={color} />
);

// ─── 동행자 아이콘 ───

const SoloIcon = ({ color = IC }: { color?: string }) => (
  <SvgSoloIcon size={16} color={color} />
);

const FriendIcon = ({ color = IC }: { color?: string }) => (
  <SvgFriendIcon size={16} color={color} />
);

const CoupleIcon = ({ color = IC }: { color?: string }) => (
  <SvgCoupleIcon size={16} color={color} />
);

const FamilyIcon = ({ color = IC }: { color?: string }) => (
  <SvgFamilyIcon size={16} color={color} />
);

const ParentIcon = ({ color = IC }: { color?: string }) => (
  <SvgParentIcon size={16} color={color} />
);

const SiblingIcon = ({ color = IC }: { color?: string }) => (
  <SvgSiblingIcon size={16} color={color} />
);

const COMPANION_ICONS: Record<string, React.ReactNode> = {
  '혼자': <SoloIcon />,
  '친구': <FriendIcon />,
  '연인': <CoupleIcon />,
  '가족': <FamilyIcon />,
  '부모님': <ParentIcon />,
  '형제': <SiblingIcon />,
};

// ─── 날씨 개별 아이콘 ───
const SunIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => (
  <SvgSunIcon size={size} color={color} />
);
const CloudyIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => (
  <SvgCloudyIcon size={size} color={color} />
);
const RainIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => (
  <SvgRainIcon size={size} color={color} />
);
const SnowIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => (
  <SvgSnowIcon size={size} color={color} />
);
const PartlyCloudyIcon = ({ size = 16 }: { size?: number; color?: string }) => (
  <SvgPartlyCloudyIcon size={size} />
);
const WindIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => (
  <SvgWindIcon size={size} color={color} />
);

const WEATHER_ICON_MAP: Record<string, React.ReactNode> = {
  '맑음':     <SunIcon size={16} />,
  '부분흐림': <PartlyCloudyIcon size={16} />,
  '흐림':     <CloudyIcon size={16} />,
  '비':       <RainIcon size={16} />,
  '눈':       <SnowIcon size={16} />,
  '바람':     <WindIcon size={16} />,
};

// ─── 날짜 유틸 ───
const toDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isSameDay = (a: Date, b: Date) => toDateKey(a) === toDateKey(b);
const isBefore  = (a: Date, b: Date) => toDateKey(a) < toDateKey(b);

// ─── 진행 바 ───
function StepProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <View style={pb.wrap}>
      {Array.from({ length: total }, (_, i) => {
        const stepNum = i + 1;
        const active  = stepNum <= current;
        return (
          <React.Fragment key={stepNum}>
            <View style={[pb.circle, active ? pb.circleActive : pb.circleInactive]}>
              {active
                ? <View style={pb.dot} />
                : <View style={pb.dotEmpty} />}
            </View>
            {i < total - 1 && (
              <View style={[pb.line, stepNum < current ? pb.lineActive : pb.lineInactive]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const pb = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  circle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleActive: {
    backgroundColor: COLORS.purpleNeon,
  },
  circleInactive: {
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: COLORS.divider,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.white,
  },
  dotEmpty: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.textMuted,
  },
  line: {
    flex: 1,
    height: 2,
    marginHorizontal: 4,
  },
  lineActive: {
    backgroundColor: COLORS.purpleNeon,
  },
  lineInactive: {
    backgroundColor: COLORS.card,
  },
});

// ─── 하단 내비게이션 버튼 ───
function StepNavBar({
  step,
  totalSteps,
  canNext,
  onPrev,
  onNext,
  onSave,
}: {
  step: number;
  totalSteps: number;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSave: () => void;
}) {
  return (
    <View style={nav.wrap}>
      {step > 1 ? (
        <TouchableOpacity style={nav.prevBtn} onPress={onPrev} activeOpacity={0.8}>
          <Text style={nav.prevTxt}>← 이전</Text>
        </TouchableOpacity>
      ) : (
        <View style={nav.prevPlaceholder} />
      )}
      {step < totalSteps ? (
        <TouchableOpacity
          style={[nav.nextBtn, !canNext && nav.nextBtnDisabled]}
          onPress={onNext}
          activeOpacity={0.85}
        >
          <Text style={nav.nextTxt}>다음 →</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[nav.saveBtn, !canNext && nav.nextBtnDisabled]}
          onPress={onSave}
          activeOpacity={0.85}
        >
          <Text style={nav.saveTxt}>저장하기</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const nav = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingBottom: 24,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  prevPlaceholder: { flex: 1 },
  prevBtn: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  prevTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDim,
  },
  nextBtn: {
    flex: 2,
    backgroundColor: COLORS.purpleDeep,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  nextBtnDisabled: {
    opacity: 0.4,
  },
  nextTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },
  saveBtn: {
    flex: 2,
    backgroundColor: COLORS.purpleDeep,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },
});

// ─── 커스텀 캘린더 바텀시트 ───
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

// ─── 비공개 친구 선택 모달 ───
function PrivacyModal({
  visible,
  selectedFriends,
  allFriends,
  onToggle,
  onSetAll,
  onClose,
}: {
  visible: boolean;
  selectedFriends: string[];
  allFriends: string[];
  onToggle: (friend: string) => void;
  onSetAll: (friends: string[]) => void;
  onClose: () => void;
}) {
  const translateY = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 13,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: 500,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={pm.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[pm.sheet, { transform: [{ translateY }] }]}>
          {/* 핸들 */}
          <View style={pm.handle} />

          {/* 헤더 */}
          <View style={pm.header}>
            <View style={pm.headerLeft}>
              <SvgLockClosedIcon size={24} color="#A1A1B0" />
              <View>
                <Text style={pm.headerTitle}>비공개 대상 선택</Text>
                <Text style={pm.headerDesc}>선택한 친구에게 이 미디어가 비공개됩니다</Text>
              </View>
            </View>
          </View>

          {/* 전체 비공개 — 모든 친구에게 비공개 (맨 위 옵션) */}
          {allFriends.length > 0 && (() => {
            const allPrivate = selectedFriends.length === allFriends.length;
            return (
              <TouchableOpacity
                style={[pm.allPrivateRow, allPrivate && pm.friendRowActive]}
                onPress={() => {
                  // 한 번에 전체 설정/해제 → 개별 친구 체크 상태도 즉시 동기화
                  onSetAll(allPrivate ? [] : [...allFriends]);
                }}
                activeOpacity={0.7}
              >
                <View style={[pm.avatar, allPrivate && pm.avatarActive]}>
                  <SvgLockClosedIcon size={18} color={allPrivate ? '#FFFFFF' : '#A1A1B0'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[pm.allPrivateLabel, allPrivate && pm.friendNameActive]}>전체 비공개</Text>
                  <Text style={pm.allPrivateDesc}>모든 친구에게 이 사진을 숨겨요</Text>
                </View>
                <View style={[pm.checkbox, allPrivate && pm.checkboxActive]}>
                  {allPrivate && <Text style={pm.checkMark}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          })()}

          {/* 전체 해제 버튼 */}
          {selectedFriends.length > 0 && (
            <TouchableOpacity
              style={pm.clearAllBtn}
              onPress={() => selectedFriends.forEach(f => onToggle(f))}
              activeOpacity={0.7}
            >
              <Text style={pm.clearAllTxt}>전체 해제</Text>
            </TouchableOpacity>
          )}

          {/* 친구 목록 */}
          <ScrollView style={pm.listScroll} showsVerticalScrollIndicator={false}>
            {allFriends.map(friend => {
              const isSelected = selectedFriends.includes(friend);
              return (
                <TouchableOpacity
                  key={friend}
                  style={[pm.friendRow, isSelected && pm.friendRowActive]}
                  onPress={() => onToggle(friend)}
                  activeOpacity={0.7}
                >
                  {/* 아바타 */}
                  <View style={[pm.avatar, isSelected && pm.avatarActive]}>
                    <Text style={pm.avatarTxt}>{friend[0]}</Text>
                  </View>
                  <Text style={[pm.friendName, isSelected && pm.friendNameActive]}>{friend}</Text>
                  {/* 체크박스 */}
                  <View style={[pm.checkbox, isSelected && pm.checkboxActive]}>
                    {isSelected && <Text style={pm.checkMark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* 완료 버튼 */}
          <TouchableOpacity style={pm.doneBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={pm.doneTxt}>
              {selectedFriends.length > 0
                ? `${selectedFriends.length}명 비공개 설정 완료`
                : '공개로 설정 (비공개 없음)'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const pm = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1A1A28',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 36,
    maxHeight: '80%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: { fontSize: 24 },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerDesc: {
    fontSize: 12,
    color: '#A1A1B0',
    marginTop: 2,
  },
  clearAllBtn: {
    alignSelf: 'flex-end',
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(191,133,252,0.12)',
  },
  clearAllTxt: {
    fontSize: 12,
    color: '#BF85FC',
    fontWeight: '600',
  },
  listScroll: {
    maxHeight: 320,
  },
  allPrivateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 12,
    gap: 14,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  allPrivateLabel: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  allPrivateDesc: {
    fontSize: 12,
    color: '#8A8A99',
    marginTop: 2,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 12,
    gap: 14,
    marginBottom: 2,
  },
  friendRowActive: {
    backgroundColor: 'rgba(107,33,168,0.15)',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2E2E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarActive: {
    backgroundColor: 'rgba(107,33,168,0.4)',
  },
  avatarTxt: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  friendName: {
    flex: 1,
    fontSize: 15,
    color: '#A1A1B0',
    fontWeight: '500',
  },
  friendNameActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#4A4A59',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#BF85FC',
    borderColor: '#BF85FC',
  },
  checkMark: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  doneBtn: {
    backgroundColor: '#6B21A8',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  doneTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

// ─── 국가 데이터 ───
type Country = { term: string; flag: string; name: string; continent: string };
const CONTINENT_ORDER = ['아시아', '유럽', '북아메리카', '남아메리카', '아프리카', '오세아니아'];
const COUNTRIES: Country[] = [
  { term: 'kr 대한민국 korea', flag: '🇰🇷', name: '대한민국', continent: '아시아' },
  { term: 'jp 일본 japan', flag: '🇯🇵', name: '일본', continent: '아시아' },
  { term: 'cn 중국 china', flag: '🇨🇳', name: '중국', continent: '아시아' },
  { term: 'tw 대만 taiwan', flag: '🇹🇼', name: '대만', continent: '아시아' },
  { term: 'hk 홍콩 hong kong', flag: '🇭🇰', name: '홍콩', continent: '아시아' },
  { term: 'mo 마카오 macau', flag: '🇲🇴', name: '마카오', continent: '아시아' },
  { term: 'th 태국 thailand', flag: '🇹🇭', name: '태국', continent: '아시아' },
  { term: 'vn 베트남 vietnam', flag: '🇻🇳', name: '베트남', continent: '아시아' },
  { term: 'ph 필리핀 philippines', flag: '🇵🇭', name: '필리핀', continent: '아시아' },
  { term: 'id 인도네시아 indonesia', flag: '🇮🇩', name: '인도네시아', continent: '아시아' },
  { term: 'my 말레이시아 malaysia', flag: '🇲🇾', name: '말레이시아', continent: '아시아' },
  { term: 'sg 싱가포르 singapore', flag: '🇸🇬', name: '싱가포르', continent: '아시아' },
  { term: 'kh 캄보디아 cambodia', flag: '🇰🇭', name: '캄보디아', continent: '아시아' },
  { term: 'la 라오스 laos', flag: '🇱🇦', name: '라오스', continent: '아시아' },
  { term: 'mm 미얀마 myanmar burma', flag: '🇲🇲', name: '미얀마', continent: '아시아' },
  { term: 'bn 브루나이 brunei', flag: '🇧🇳', name: '브루나이', continent: '아시아' },
  { term: 'tl 동티모르 east timor timor-leste', flag: '🇹🇱', name: '동티모르', continent: '아시아' },
  { term: 'in 인도 india', flag: '🇮🇳', name: '인도', continent: '아시아' },
  { term: 'lk 스리랑카 sri lanka', flag: '🇱🇰', name: '스리랑카', continent: '아시아' },
  { term: 'np 네팔 nepal', flag: '🇳🇵', name: '네팔', continent: '아시아' },
  { term: 'bt 부탄 bhutan', flag: '🇧🇹', name: '부탄', continent: '아시아' },
  { term: 'pk 파키스탄 pakistan', flag: '🇵🇰', name: '파키스탄', continent: '아시아' },
  { term: 'bd 방글라데시 bangladesh', flag: '🇧🇩', name: '방글라데시', continent: '아시아' },
  { term: 'mv 몰디브 maldives', flag: '🇲🇻', name: '몰디브', continent: '아시아' },
  { term: 'mn 몽골 mongolia', flag: '🇲🇳', name: '몽골', continent: '아시아' },
  { term: 'kz 카자흐스탄 kazakhstan', flag: '🇰🇿', name: '카자흐스탄', continent: '아시아' },
  { term: 'uz 우즈베키스탄 uzbekistan', flag: '🇺🇿', name: '우즈베키스탄', continent: '아시아' },
  { term: 'tm 투르크메니스탄 turkmenistan', flag: '🇹🇲', name: '투르크메니스탄', continent: '아시아' },
  { term: 'tj 타지키스탄 tajikistan', flag: '🇹🇯', name: '타지키스탄', continent: '아시아' },
  { term: 'kg 키르기스스탄 kyrgyzstan', flag: '🇰🇬', name: '키르기스스탄', continent: '아시아' },
  { term: 'af 아프가니스탄 afghanistan', flag: '🇦🇫', name: '아프가니스탄', continent: '아시아' },
  { term: 'ir 이란 iran', flag: '🇮🇷', name: '이란', continent: '아시아' },
  { term: 'iq 이라크 iraq', flag: '🇮🇶', name: '이라크', continent: '아시아' },
  { term: 'sa 사우디아라비아 saudi arabia', flag: '🇸🇦', name: '사우디아라비아', continent: '아시아' },
  { term: 'ae 아랍에미리트 uae united arab emirates', flag: '🇦🇪', name: '아랍에미리트', continent: '아시아' },
  { term: 'kw 쿠웨이트 kuwait', flag: '🇰🇼', name: '쿠웨이트', continent: '아시아' },
  { term: 'bh 바레인 bahrain', flag: '🇧🇭', name: '바레인', continent: '아시아' },
  { term: 'qa 카타르 qatar', flag: '🇶🇦', name: '카타르', continent: '아시아' },
  { term: 'om 오만 oman', flag: '🇴🇲', name: '오만', continent: '아시아' },
  { term: 'ye 예멘 yemen', flag: '🇾🇪', name: '예멘', continent: '아시아' },
  { term: 'jo 요르단 jordan', flag: '🇯🇴', name: '요르단', continent: '아시아' },
  { term: 'il 이스라엘 israel', flag: '🇮🇱', name: '이스라엘', continent: '아시아' },
  { term: 'ps 팔레스타인 palestine', flag: '🇵🇸', name: '팔레스타인', continent: '아시아' },
  { term: 'lb 레바논 lebanon', flag: '🇱🇧', name: '레바논', continent: '아시아' },
  { term: 'sy 시리아 syria', flag: '🇸🇾', name: '시리아', continent: '아시아' },
  { term: 'tr 튀르키예 turkey turkiye', flag: '🇹🇷', name: '튀르키예', continent: '아시아' },
  { term: 'cy 키프로스 cyprus', flag: '🇨🇾', name: '키프로스', continent: '아시아' },
  { term: 'am 아르메니아 armenia', flag: '🇦🇲', name: '아르메니아', continent: '아시아' },
  { term: 'az 아제르바이잔 azerbaijan', flag: '🇦🇿', name: '아제르바이잔', continent: '아시아' },
  { term: 'ge 조지아 georgia', flag: '🇬🇪', name: '조지아', continent: '아시아' },
  { term: 'gb 영국 uk united kingdom', flag: '🇬🇧', name: '영국', continent: '유럽' },
  { term: 'fr 프랑스 france', flag: '🇫🇷', name: '프랑스', continent: '유럽' },
  { term: 'de 독일 germany', flag: '🇩🇪', name: '독일', continent: '유럽' },
  { term: 'it 이탈리아 italy', flag: '🇮🇹', name: '이탈리아', continent: '유럽' },
  { term: 'es 스페인 spain', flag: '🇪🇸', name: '스페인', continent: '유럽' },
  { term: 'pt 포르투갈 portugal', flag: '🇵🇹', name: '포르투갈', continent: '유럽' },
  { term: 'nl 네덜란드 netherlands', flag: '🇳🇱', name: '네덜란드', continent: '유럽' },
  { term: 'be 벨기에 belgium', flag: '🇧🇪', name: '벨기에', continent: '유럽' },
  { term: 'ch 스위스 switzerland', flag: '🇨🇭', name: '스위스', continent: '유럽' },
  { term: 'at 오스트리아 austria', flag: '🇦🇹', name: '오스트리아', continent: '유럽' },
  { term: 'se 스웨덴 sweden', flag: '🇸🇪', name: '스웨덴', continent: '유럽' },
  { term: 'no 노르웨이 norway', flag: '🇳🇴', name: '노르웨이', continent: '유럽' },
  { term: 'dk 덴마크 denmark', flag: '🇩🇰', name: '덴마크', continent: '유럽' },
  { term: 'fi 핀란드 finland', flag: '🇫🇮', name: '핀란드', continent: '유럽' },
  { term: 'is 아이슬란드 iceland', flag: '🇮🇸', name: '아이슬란드', continent: '유럽' },
  { term: 'ie 아일랜드 ireland', flag: '🇮🇪', name: '아일랜드', continent: '유럽' },
  { term: 'pl 폴란드 poland', flag: '🇵🇱', name: '폴란드', continent: '유럽' },
  { term: 'cz 체코 czech republic czechia', flag: '🇨🇿', name: '체코', continent: '유럽' },
  { term: 'sk 슬로바키아 slovakia', flag: '🇸🇰', name: '슬로바키아', continent: '유럽' },
  { term: 'hu 헝가리 hungary', flag: '🇭🇺', name: '헝가리', continent: '유럽' },
  { term: 'ro 루마니아 romania', flag: '🇷🇴', name: '루마니아', continent: '유럽' },
  { term: 'bg 불가리아 bulgaria', flag: '🇧🇬', name: '불가리아', continent: '유럽' },
  { term: 'gr 그리스 greece', flag: '🇬🇷', name: '그리스', continent: '유럽' },
  { term: 'hr 크로아티아 croatia', flag: '🇭🇷', name: '크로아티아', continent: '유럽' },
  { term: 'si 슬로베니아 slovenia', flag: '🇸🇮', name: '슬로베니아', continent: '유럽' },
  { term: 'rs 세르비아 serbia', flag: '🇷🇸', name: '세르비아', continent: '유럽' },
  { term: 'ba 보스니아 헤르체고비나 bosnia herzegovina', flag: '🇧🇦', name: '보스니아 헤르체고비나', continent: '유럽' },
  { term: 'me 몬테네그로 montenegro', flag: '🇲🇪', name: '몬테네그로', continent: '유럽' },
  { term: 'mk 북마케도니아 north macedonia', flag: '🇲🇰', name: '북마케도니아', continent: '유럽' },
  { term: 'al 알바니아 albania', flag: '🇦🇱', name: '알바니아', continent: '유럽' },
  { term: 'xk 코소보 kosovo', flag: '🇽🇰', name: '코소보', continent: '유럽' },
  { term: 'ru 러시아 russia', flag: '🇷🇺', name: '러시아', continent: '유럽' },
  { term: 'ua 우크라이나 ukraine', flag: '🇺🇦', name: '우크라이나', continent: '유럽' },
  { term: 'by 벨라루스 belarus', flag: '🇧🇾', name: '벨라루스', continent: '유럽' },
  { term: 'md 몰도바 moldova', flag: '🇲🇩', name: '몰도바', continent: '유럽' },
  { term: 'ee 에스토니아 estonia', flag: '🇪🇪', name: '에스토니아', continent: '유럽' },
  { term: 'lv 라트비아 latvia', flag: '🇱🇻', name: '라트비아', continent: '유럽' },
  { term: 'lt 리투아니아 lithuania', flag: '🇱🇹', name: '리투아니아', continent: '유럽' },
  { term: 'lu 룩셈부르크 luxembourg', flag: '🇱🇺', name: '룩셈부르크', continent: '유럽' },
  { term: 'mc 모나코 monaco', flag: '🇲🇨', name: '모나코', continent: '유럽' },
  { term: 'ad 안도라 andorra', flag: '🇦🇩', name: '안도라', continent: '유럽' },
  { term: 'li 리히텐슈타인 liechtenstein', flag: '🇱🇮', name: '리히텐슈타인', continent: '유럽' },
  { term: 'sm 산마리노 san marino', flag: '🇸🇲', name: '산마리노', continent: '유럽' },
  { term: 'va 바티칸 vatican', flag: '🇻🇦', name: '바티칸', continent: '유럽' },
  { term: 'mt 몰타 malta', flag: '🇲🇹', name: '몰타', continent: '유럽' },
  { term: 'us 미국 usa united states', flag: '🇺🇸', name: '미국', continent: '북아메리카' },
  { term: 'ca 캐나다 canada', flag: '🇨🇦', name: '캐나다', continent: '북아메리카' },
  { term: 'mx 멕시코 mexico', flag: '🇲🇽', name: '멕시코', continent: '북아메리카' },
  { term: 'gt 과테말라 guatemala', flag: '🇬🇹', name: '과테말라', continent: '북아메리카' },
  { term: 'bz 벨리즈 belize', flag: '🇧🇿', name: '벨리즈', continent: '북아메리카' },
  { term: 'hn 온두라스 honduras', flag: '🇭🇳', name: '온두라스', continent: '북아메리카' },
  { term: 'sv 엘살바도르 el salvador', flag: '🇸🇻', name: '엘살바도르', continent: '북아메리카' },
  { term: 'ni 니카라과 nicaragua', flag: '🇳🇮', name: '니카라과', continent: '북아메리카' },
  { term: 'cr 코스타리카 costa rica', flag: '🇨🇷', name: '코스타리카', continent: '북아메리카' },
  { term: 'pa 파나마 panama', flag: '🇵🇦', name: '파나마', continent: '북아메리카' },
  { term: 'cu 쿠바 cuba', flag: '🇨🇺', name: '쿠바', continent: '북아메리카' },
  { term: 'jm 자메이카 jamaica', flag: '🇯🇲', name: '자메이카', continent: '북아메리카' },
  { term: 'ht 아이티 haiti', flag: '🇭🇹', name: '아이티', continent: '북아메리카' },
  { term: 'do 도미니카공화국 dominican republic', flag: '🇩🇴', name: '도미니카공화국', continent: '북아메리카' },
  { term: 'tt 트리니다드 토바고 trinidad tobago', flag: '🇹🇹', name: '트리니다드 토바고', continent: '북아메리카' },
  { term: 'bs 바하마 bahamas', flag: '🇧🇸', name: '바하마', continent: '북아메리카' },
  { term: 'bb 바베이도스 barbados', flag: '🇧🇧', name: '바베이도스', continent: '북아메리카' },
  { term: 'gd 그레나다 grenada', flag: '🇬🇩', name: '그레나다', continent: '북아메리카' },
  { term: 'lc 세인트루시아 saint lucia', flag: '🇱🇨', name: '세인트루시아', continent: '북아메리카' },
  { term: 'vc 세인트빈센트 그레나딘 saint vincent grenadines', flag: '🇻🇨', name: '세인트빈센트 그레나딘', continent: '북아메리카' },
  { term: 'ag 앤티가 바부다 antigua barbuda', flag: '🇦🇬', name: '앤티가 바부다', continent: '북아메리카' },
  { term: 'kn 세인트키츠 네비스 saint kitts nevis', flag: '🇰🇳', name: '세인트키츠 네비스', continent: '북아메리카' },
  { term: 'dm 도미니카 dominica', flag: '🇩🇲', name: '도미니카', continent: '북아메리카' },
  { term: 'br 브라질 brazil', flag: '🇧🇷', name: '브라질', continent: '남아메리카' },
  { term: 'ar 아르헨티나 argentina', flag: '🇦🇷', name: '아르헨티나', continent: '남아메리카' },
  { term: 'cl 칠레 chile', flag: '🇨🇱', name: '칠레', continent: '남아메리카' },
  { term: 'co 콜롬비아 colombia', flag: '🇨🇴', name: '콜롬비아', continent: '남아메리카' },
  { term: 'pe 페루 peru', flag: '🇵🇪', name: '페루', continent: '남아메리카' },
  { term: 'ec 에콰도르 ecuador', flag: '🇪🇨', name: '에콰도르', continent: '남아메리카' },
  { term: 'bo 볼리비아 bolivia', flag: '🇧🇴', name: '볼리비아', continent: '남아메리카' },
  { term: 'py 파라과이 paraguay', flag: '🇵🇾', name: '파라과이', continent: '남아메리카' },
  { term: 'uy 우루과이 uruguay', flag: '🇺🇾', name: '우루과이', continent: '남아메리카' },
  { term: 've 베네수엘라 venezuela', flag: '🇻🇪', name: '베네수엘라', continent: '남아메리카' },
  { term: 'gy 가이아나 guyana', flag: '🇬🇾', name: '가이아나', continent: '남아메리카' },
  { term: 'sr 수리남 suriname', flag: '🇸🇷', name: '수리남', continent: '남아메리카' },
  { term: 'eg 이집트 egypt', flag: '🇪🇬', name: '이집트', continent: '아프리카' },
  { term: 'ma 모로코 morocco', flag: '🇲🇦', name: '모로코', continent: '아프리카' },
  { term: 'tn 튀니지 tunisia', flag: '🇹🇳', name: '튀니지', continent: '아프리카' },
  { term: 'dz 알제리 algeria', flag: '🇩🇿', name: '알제리', continent: '아프리카' },
  { term: 'ly 리비아 libya', flag: '🇱🇾', name: '리비아', continent: '아프리카' },
  { term: 'sd 수단 sudan', flag: '🇸🇩', name: '수단', continent: '아프리카' },
  { term: 'ss 남수단 south sudan', flag: '🇸🇸', name: '남수단', continent: '아프리카' },
  { term: 'et 에티오피아 ethiopia', flag: '🇪🇹', name: '에티오피아', continent: '아프리카' },
  { term: 'er 에리트레아 eritrea', flag: '🇪🇷', name: '에리트레아', continent: '아프리카' },
  { term: 'dj 지부티 djibouti', flag: '🇩🇯', name: '지부티', continent: '아프리카' },
  { term: 'so 소말리아 somalia', flag: '🇸🇴', name: '소말리아', continent: '아프리카' },
  { term: 'ke 케냐 kenya', flag: '🇰🇪', name: '케냐', continent: '아프리카' },
  { term: 'tz 탄자니아 tanzania', flag: '🇹🇿', name: '탄자니아', continent: '아프리카' },
  { term: 'ug 우간다 uganda', flag: '🇺🇬', name: '우간다', continent: '아프리카' },
  { term: 'rw 르완다 rwanda', flag: '🇷🇼', name: '르완다', continent: '아프리카' },
  { term: 'bi 부룬디 burundi', flag: '🇧🇮', name: '부룬디', continent: '아프리카' },
  { term: 'za 남아프리카공화국 south africa', flag: '🇿🇦', name: '남아프리카공화국', continent: '아프리카' },
  { term: 'ng 나이지리아 nigeria', flag: '🇳🇬', name: '나이지리아', continent: '아프리카' },
  { term: 'gh 가나 ghana', flag: '🇬🇭', name: '가나', continent: '아프리카' },
  { term: 'sn 세네갈 senegal', flag: '🇸🇳', name: '세네갈', continent: '아프리카' },
  { term: 'ci 코트디부아르 ivory coast cote divoire', flag: '🇨🇮', name: '코트디부아르', continent: '아프리카' },
  { term: 'cm 카메룬 cameroon', flag: '🇨🇲', name: '카메룬', continent: '아프리카' },
  { term: 'ao 앙골라 angola', flag: '🇦🇴', name: '앙골라', continent: '아프리카' },
  { term: 'mz 모잠비크 mozambique', flag: '🇲🇿', name: '모잠비크', continent: '아프리카' },
  { term: 'zw 짐바브웨 zimbabwe', flag: '🇿🇼', name: '짐바브웨', continent: '아프리카' },
  { term: 'zm 잠비아 zambia', flag: '🇿🇲', name: '잠비아', continent: '아프리카' },
  { term: 'mw 말라위 malawi', flag: '🇲🇼', name: '말라위', continent: '아프리카' },
  { term: 'mg 마다가스카르 madagascar', flag: '🇲🇬', name: '마다가스카르', continent: '아프리카' },
  { term: 'mu 모리셔스 mauritius', flag: '🇲🇺', name: '모리셔스', continent: '아프리카' },
  { term: 'sc 세이셸 seychelles', flag: '🇸🇨', name: '세이셸', continent: '아프리카' },
  { term: 'km 코모로 comoros', flag: '🇰🇲', name: '코모로', continent: '아프리카' },
  { term: 'cf 중앙아프리카공화국 central african republic', flag: '🇨🇫', name: '중앙아프리카공화국', continent: '아프리카' },
  { term: 'cg 콩고 congo', flag: '🇨🇬', name: '콩고', continent: '아프리카' },
  { term: 'cd 콩고민주공화국 democratic republic of the congo drc', flag: '🇨🇩', name: '콩고민주공화국', continent: '아프리카' },
  { term: 'ga 가봉 gabon', flag: '🇬🇦', name: '가봉', continent: '아프리카' },
  { term: 'gq 적도기니 equatorial guinea', flag: '🇬🇶', name: '적도기니', continent: '아프리카' },
  { term: 'st 상투메 프린시페 sao tome principe', flag: '🇸🇹', name: '상투메 프린시페', continent: '아프리카' },
  { term: 'cv 카보베르데 cape verde', flag: '🇨🇻', name: '카보베르데', continent: '아프리카' },
  { term: 'gw 기니비사우 guinea-bissau', flag: '🇬🇼', name: '기니비사우', continent: '아프리카' },
  { term: 'gn 기니 guinea', flag: '🇬🇳', name: '기니', continent: '아프리카' },
  { term: 'sl 시에라리온 sierra leone', flag: '🇸🇱', name: '시에라리온', continent: '아프리카' },
  { term: 'lr 라이베리아 liberia', flag: '🇱🇷', name: '라이베리아', continent: '아프리카' },
  { term: 'tg 토고 togo', flag: '🇹🇬', name: '토고', continent: '아프리카' },
  { term: 'bj 베냉 benin', flag: '🇧🇯', name: '베냉', continent: '아프리카' },
  { term: 'bf 부르키나파소 burkina faso', flag: '🇧🇫', name: '부르키나파소', continent: '아프리카' },
  { term: 'ml 말리 mali', flag: '🇲🇱', name: '말리', continent: '아프리카' },
  { term: 'ne 니제르 niger', flag: '🇳🇪', name: '니제르', continent: '아프리카' },
  { term: 'td 차드 chad', flag: '🇹🇩', name: '차드', continent: '아프리카' },
  { term: 'mr 모리타니 mauritania', flag: '🇲🇷', name: '모리타니', continent: '아프리카' },
  { term: 'gm 감비아 gambia', flag: '🇬🇲', name: '감비아', continent: '아프리카' },
  { term: 'na 나미비아 namibia', flag: '🇳🇦', name: '나미비아', continent: '아프리카' },
  { term: 'bw 보츠와나 botswana', flag: '🇧🇼', name: '보츠와나', continent: '아프리카' },
  { term: 'ls 레소토 lesotho', flag: '🇱🇸', name: '레소토', continent: '아프리카' },
  { term: 'sz 에스와티니 eswatini swaziland', flag: '🇸🇿', name: '에스와티니', continent: '아프리카' },
  { term: 'au 호주 australia', flag: '🇦🇺', name: '호주', continent: '오세아니아' },
  { term: 'nz 뉴질랜드 new zealand', flag: '🇳🇿', name: '뉴질랜드', continent: '오세아니아' },
  { term: 'pg 파푸아뉴기니 papua new guinea', flag: '🇵🇬', name: '파푸아뉴기니', continent: '오세아니아' },
  { term: 'fj 피지 fiji', flag: '🇫🇯', name: '피지', continent: '오세아니아' },
  { term: 'sb 솔로몬제도 solomon islands', flag: '🇸🇧', name: '솔로몬제도', continent: '오세아니아' },
  { term: 'vu 바누아투 vanuatu', flag: '🇻🇺', name: '바누아투', continent: '오세아니아' },
  { term: 'ws 사모아 samoa', flag: '🇼🇸', name: '사모아', continent: '오세아니아' },
  { term: 'to 통가 tonga', flag: '🇹🇴', name: '통가', continent: '오세아니아' },
  { term: 'fm 미크로네시아 micronesia', flag: '🇫🇲', name: '미크로네시아', continent: '오세아니아' },
  { term: 'pw 팔라우 palau', flag: '🇵🇼', name: '팔라우', continent: '오세아니아' },
  { term: 'mh 마셜제도 marshall islands', flag: '🇲🇭', name: '마셜제도', continent: '오세아니아' },
  { term: 'ki 키리바시 kiribati', flag: '🇰🇮', name: '키리바시', continent: '오세아니아' },
  { term: 'tv 투발루 tuvalu', flag: '🇹🇻', name: '투발루', continent: '오세아니아' },
  { term: 'nr 나우루 nauru', flag: '🇳🇷', name: '나우루', continent: '오세아니아' },
];

const ISO_TO_COUNTRY = COUNTRIES.reduce<Record<string, { flag: string; name: string }>>((acc, c) => {
  const code = c.term.split(' ')[0].toUpperCase();
  acc[code] = { flag: c.flag, name: c.name };
  return acc;
}, {});

function geoJsonToCountry(name: string, code?: string) {
  const cleanName = name.split(' - ')[0].toLowerCase();
  if (code) {
    const codeUpper = code.toUpperCase();
    // Try code matching (either direct 2-letter match, or convert 3-letter match)
    const byCode = ISO_TO_COUNTRY[codeUpper];
    if (byCode) return byCode;
    
    // Convert common 3-letter codes to 2-letter codes
    const iso3ToIso2: Record<string, string> = {
      JPN: 'JP', CHN: 'CN', USA: 'US', DEU: 'DE', ESP: 'ES',
      GBR: 'GB', FRA: 'FR', ITA: 'IT', KOR: 'KR'
    };
    const converted = iso3ToIso2[codeUpper];
    if (converted && ISO_TO_COUNTRY[converted]) {
      return ISO_TO_COUNTRY[converted];
    }
  }
  const found = COUNTRIES.find(c => c.name === cleanName || c.term.includes(cleanName));
  return found ? { flag: found.flag, name: found.name } : null;
}

const DEFAULT_COMPANIONS = ['혼자', '친구', '연인', '가족', '부모님', '형제'];
const THUMB_SIZE = Math.floor((SCREEN_W - 40 - 16) / 3); // 3열 그리드

// ─── 메인 컴포넌트 ───
export default function NewRecordScreen({ navigation, route }: RootStackScreenProps<'NewRecord'>) {
  const { addRecord, updateRecord, followingUsers } = useRecords();
  // 함께한 친구·비공개 대상 목록은 실제 팔로우한 친구에서 가져온다 (데모 친구 제거)
  const friendNames = followingUsers.map((f) => f.username);
  const TOTAL_STEPS = 3;

  // ─── 편집 모드 ───
  // 소셜 피드 '편집'(editRecord) 또는 게시물 상세 '수정'(record)에서 기존 기록을 받아 미리 채운다
  const editRecord = route.params?.editRecord ?? route.params?.record;
  const isEdit = !!editRecord;
  const parseDotDate = (s?: string): Date => {
    if (s) {
      const t = new Date(s.replace(/\./g, '-'));
      if (!isNaN(t.getTime())) { t.setHours(0, 0, 0, 0); return t; }
    }
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  };
  // 다국가 기록이면 대표 국가의 데이터로 활성 상태를 채운다 (top-level medias는 전체 합본이므로)
  const editFirstCountryData = editRecord?.perCountryData?.[editRecord.countryName];

  const [step, setStep] = useState(1);
  const [hintMsg, setHintMsg] = useState(''); // 필수 미충족 안내 토스트
  const savedRef = useRef(false);             // 저장 후 이탈은 확인 다이얼로그 건너뜀
  const scrollRef = useRef<ScrollView>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  // Step 1 - 국가 (복수 선택)
  const MAX_COUNTRIES = 10;
  const [countrySearch,     setCountrySearch]     = useState('');
  const [selectedCountries, setSelectedCountries] = useState<{ flag: string; name: string }[]>(
    editRecord
      ? editRecord.countries ?? [{ flag: editRecord.countryFlag, name: editRecord.countryName }]
      : []
  );
  const [selectedRegion, setSelectedRegion] = useState<{ name: string; nameEn: string } | null>(
    editRecord?.regionName ? { name: editRecord.regionName, nameEn: editRecord.regionNameEn ?? '' } : null
  );

  useEffect(() => {
    const params = route?.params;
    if (params?.selectedCountry) {
      const rawName = params.selectedCountry.name;
      const countryNameOnly = rawName.split(' - ')[0];
      const mapped = geoJsonToCountry(countryNameOnly, params.selectedCountry.code);
      if (mapped && !selectedCountries.some(c => c.name === mapped.name)) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setSelectedCountries(prev => [...prev, mapped]);
      }
      if (params.selectedCountry.region) {
        setSelectedRegion({
          name: params.selectedCountry.region,
          nameEn: params.selectedCountry.regionEn || '',
        });
      }
    }
  }, [route?.params]);

  const groupedCountries = useMemo(() => {
    const filtered = COUNTRIES.filter(c => c.term.toLowerCase().includes(countrySearch.toLowerCase()));
    const sorted   = [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    return CONTINENT_ORDER.map(continent => ({
      continent,
      countries: sorted.filter(c => c.continent === continent),
    })).filter(g => g.countries.length > 0);
  }, [countrySearch]);

  // Step 2 - 미디어
  const [medias,            setMedias]           = useState<string[]>(
    editFirstCountryData?.medias ?? editRecord?.medias ?? []
  );
  const [mediaPrivacy,      setMediaPrivacy]      = useState<Record<number, string[]>>(
    editRecord?.mediaPrivacy ?? {}
  );
  const [privacyModalIndex, setPrivacyModalIndex] = useState<number | null>(null);
  const [representativePhoto, setRepresentativePhoto] = useState<string | null>(
    editFirstCountryData?.representativePhoto ?? editRecord?.representativePhoto ?? null
  );
  const selectMedia = async () => {
    const slots = 30 - medias.length;
    if (slots <= 0) {
      Alert.alert('알림', '사진은 최대 30장까지 추가할 수 있어요.');
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: slots, // slots>=1 보장 (0이면 무제한이 되어 30장 초과 위험)
        quality: 0.8,
      });
      if (!result.canceled && result.assets) {
        const picked = result.assets.map(a => a.uri);
        setMedias(prev => {
          const existing = new Set(prev);
          const add = picked.filter(u => !existing.has(u)).slice(0, 30 - prev.length);
          return [...prev, ...add];
        });
      }
    } catch (e: any) {
      Alert.alert('불러오기 실패', e?.message ?? '사진을 불러오는 중 오류가 발생했어요.');
    }
  };

  const removeMedia = (index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const removedUri = medias[index];
    if (removedUri && removedUri === representativePhoto) {
      setRepresentativePhoto(null);
    }
    setMedias(prev => prev.filter((_, i) => i !== index));
    // Realign mediaPrivacy indices after deletion
    setMediaPrivacy(prev => {
      const updatedPrivacy: Record<number, string[]> = {};
      Object.keys(prev).forEach(keyStr => {
        const key = Number(keyStr);
        const val = prev[key];
        if (key > index) {
          updatedPrivacy[key - 1] = val;
        } else if (key < index) {
          updatedPrivacy[key] = val;
        }
      });
      return updatedPrivacy;
    });
  };

  const handleReorderMedias = (fromIdx: number, toIdx: number) => {
    // 1. Reorder medias array
    let updatedMedias = [...medias];
    const [movedMedia] = updatedMedias.splice(fromIdx, 1);
    updatedMedias.splice(toIdx, 0, movedMedia);
    setMedias(updatedMedias);

    // 2. Reorder mediaPrivacy object to align with new indices
    setMediaPrivacy(prev => {
      const updatedPrivacy: Record<number, string[]> = {};
      Object.keys(prev).forEach(keyStr => {
        const key = Number(keyStr);
        const val = prev[key];
        if (key === fromIdx) {
          updatedPrivacy[toIdx] = val;
        } else if (fromIdx < toIdx && key > fromIdx && key <= toIdx) {
          updatedPrivacy[key - 1] = val;
        } else if (fromIdx > toIdx && key < fromIdx && key >= toIdx) {
          updatedPrivacy[key + 1] = val;
        } else {
          updatedPrivacy[key] = val;
        }
      });
      return updatedPrivacy;
    });
  };

  const toggleMediaPrivacyFriend = (mediaIdx: number, friend: string) => {
    setMediaPrivacy(prev => {
      const current = prev[mediaIdx] || [];
      const updated = current.includes(friend)
        ? current.filter(f => f !== friend)
        : [...current, friend];
      return { ...prev, [mediaIdx]: updated };
    });
  };

  // 비공개 대상 전체 설정(전체 비공개) / 전체 해제 — 한 번에 목록을 통째로 교체해
  // 개별 친구 체크 상태까지 즉시 동기화한다.
  const setMediaPrivacyAll = (mediaIdx: number, friends: string[]) => {
    setMediaPrivacy(prev => ({ ...prev, [mediaIdx]: friends }));
  };

  // Step 3 - 제목 · 날짜 · 글 · 별점
  const todayInit = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
  const [title,           setTitle]           = useState(editRecord?.content ?? '');
  const [startDate,       setStartDate]       = useState(
    editRecord ? parseDotDate(editFirstCountryData?.startDate ?? editRecord.startDate ?? editRecord.date) : todayInit
  );
  const [endDate,         setEndDate]         = useState(
    editRecord ? parseDotDate(editFirstCountryData?.endDate ?? editRecord.endDate ?? editRecord.date) : todayInit
  );
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [memo,            setMemo]            = useState(editRecord?.memo ?? '');
  const [rating,          setRating]          = useState(editFirstCountryData?.rating ?? editRecord?.rating ?? 0);

  // ── 국가별 데이터 관리 (2개국 이상 선택 시) ──
  const isMultiCountry = selectedCountries.length > 1;
  const [activeCountryIdx, setActiveCountryIdx] = useState(0);

  const handleReorder = (newCountries: { flag: string; name: string }[]) => {
    const activeCountryName = selectedCountries[activeCountryIdx]?.name;
    setSelectedCountries(newCountries);
    if (activeCountryName) {
      const newIdx = newCountries.findIndex(c => c.name === activeCountryName);
      if (newIdx !== -1) {
        setActiveCountryIdx(newIdx);
      } else {
        setActiveCountryIdx(0);
      }
    } else {
      setActiveCountryIdx(0);
    }
  };

  const handleRemoveCountry = (name: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedCountries(prev => {
      const filtered = prev.filter(p => p.name !== name);
      const activeCountryName = selectedCountries[activeCountryIdx]?.name;
      if (activeCountryName === name) {
        setActiveCountryIdx(0);
      } else if (activeCountryName) {
        const newIdx = filtered.findIndex(c => c.name === activeCountryName);
        setActiveCountryIdx(newIdx !== -1 ? newIdx : 0);
      } else {
        setActiveCountryIdx(0);
      }
      return filtered;
    });
  };

  const perCountryStore = useRef<Record<string, {
    medias: string[];
    mediaPrivacy: Record<number, string[]>;
    startDate: Date;
    endDate: Date;
    rating: number;
    representativePhoto?: string;
  }>>(
    // 편집 모드: 기존 국가별 데이터를 시딩해서 국가 전환 시 그대로 표시
    (() => {
      const store: Record<string, {
        medias: string[]; mediaPrivacy: Record<number, string[]>;
        startDate: Date; endDate: Date; rating: number; representativePhoto?: string;
      }> = {};
      if (editRecord?.perCountryData) {
        for (const [name, d] of Object.entries(editRecord.perCountryData)) {
          store[name] = {
            medias: d.medias ?? [],
            mediaPrivacy: {},
            startDate: parseDotDate(d.startDate),
            endDate: parseDotDate(d.endDate),
            rating: d.rating ?? 0,
            representativePhoto: d.representativePhoto,
          };
        }
      }
      return store;
    })()
  );

  // 현재 국가 데이터 저장
  const saveCurrentCountryData = () => {
    const name = selectedCountries[activeCountryIdx]?.name;
    if (name) {
      perCountryStore.current[name] = {
        medias: [...medias],
        mediaPrivacy: { ...mediaPrivacy },
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        rating,
        representativePhoto: representativePhoto || undefined,
      };
    }
  };

  // 국가 전환
  const switchCountry = (newIdx: number) => {
    if (newIdx === activeCountryIdx) return;
    saveCurrentCountryData();
    const newName = selectedCountries[newIdx]?.name;
    const data = newName ? perCountryStore.current[newName] : null;
    if (data) {
      setMedias(data.medias);
      setMediaPrivacy(data.mediaPrivacy);
      setStartDate(data.startDate);
      setEndDate(data.endDate);
      setRating(data.rating);
      setRepresentativePhoto(data.representativePhoto || null);
    } else {
      setMedias([]);
      setMediaPrivacy({});
      setStartDate(todayInit);
      setEndDate(todayInit);
      setRating(0);
      setRepresentativePhoto(null);
    }
    setActiveCountryIdx(newIdx);
  };

  const STAR_SIZE = 32;
  const STAR_GAP  = 6;
  const ratingRowRef    = useRef<View>(null);
  const ratingRowPageX  = useRef(0);

  const getRatingFromX = (x: number) => {
    let r = 0;
    for (let i = 0; i < 5; i++) {
      const starStart = i * (STAR_SIZE + STAR_GAP);
      if (x < starStart) break;
      r = x <= starStart + STAR_SIZE / 2 ? i + 0.5 : i + 1;
    }
    return Math.max(0, Math.min(5, r));
  };

  const ratingPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (evt) => {
        ratingRowRef.current?.measure((_fx, _fy, _w, _h, px) => {
          ratingRowPageX.current = px;
          setRating(getRatingFromX(evt.nativeEvent.pageX - px));
        });
      },
      onPanResponderMove: (evt) => {
        setRating(getRatingFromX(evt.nativeEvent.pageX - ratingRowPageX.current));
      },
    })
  ).current;

  const renderStars = () => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      const isFull = rating >= i;
      const isHalf = rating >= i - 0.5 && rating < i;
      stars.push(
        <View key={i} style={s.starWrap}>
          <Text style={[s.starChar, s.starAbsolute]}>☆</Text>
          {(isFull || isHalf) && (
            <View style={[s.starFillClip, { width: isHalf ? STAR_SIZE / 2 : STAR_SIZE }]}>
              <Text style={[s.starChar, s.starCharActive, s.starAbsolute]}>★</Text>
            </View>
          )}
        </View>
      );
    }
    return (
      <View ref={ratingRowRef} style={s.ratingRow} {...ratingPanResponder.panHandlers}>
        {stars}
      </View>
    );
  };

  const formatDate = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;

  // Step 4 - 동행자
  const [selectedCompanions, setSelectedCompanions] = useState<string[]>(editRecord?.companions ?? []);
  const [companionFriends,   setCompanionFriends]   = useState<string[]>(editRecord?.companionFriends ?? []);
  const [friendPickerVisible, setFriendPickerVisible] = useState(false);

  const toggleCompanion = (comp: string) => {
    setSelectedCompanions(prev => prev.includes(comp) ? prev.filter(c => c !== comp) : [...prev, comp]);
  };
  const toggleCompanionFriend = (friend: string) => {
    setCompanionFriends(prev =>
      prev.includes(friend) ? prev.filter(f => f !== friend) : [...prev, friend]
    );
  };
  const removeCompanionFriend = (friend: string) => {
    setCompanionFriends(prev => prev.filter(f => f !== friend));
  };

  // Step 5 - 선택 항목
  const [budget,     setBudget]     = useState(editRecord?.budget ? String(editRecord.budget.amount) : '');
  const [currency,   setCurrency]   = useState(editRecord?.budget?.currency ?? 'KRW');
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [weather,    setWeather]    = useState(editRecord?.weather ?? '');
  const [flightType, setFlightType] = useState(editRecord?.flightType ?? '');
  const [keywords,   setKeywords]   = useState<string[]>(editRecord?.keywords ?? []);
  const [keywordQuery, setKeywordQuery] = useState('');

  const CURRENCIES     = ['KRW', 'JPY', 'USD'];
  const OTHER_CURRENCIES = [
    { code: 'EUR', name: '유로 (EU)' },
    { code: 'CNY', name: '위안 (중국)' },
    { code: 'GBP', name: '파운드 (영국)' },
    { code: 'AUD', name: '호주 달러' },
    { code: 'CAD', name: '캐나다 달러' },
    { code: 'CHF', name: '스위스 프랑' },
    { code: 'HKD', name: '홍콩 달러' },
    { code: 'SGD', name: '싱가포르 달러' },
    { code: 'THB', name: '바트 (태국)' },
    { code: 'VND', name: '동 (베트남)' },
    { code: 'MYR', name: '링깃 (말레이시아)' },
    { code: 'PHP', name: '페소 (필리핀)' },
    { code: 'IDR', name: '루피아 (인도네시아)' },
    { code: 'INR', name: '루피 (인도)' },
    { code: 'TRY', name: '리라 (튀르키예)' },
    { code: 'MXN', name: '페소 (멕시코)' },
    { code: 'BRL', name: '헤알 (브라질)' },
    { code: 'AED', name: '디르함 (UAE)' },
    { code: 'NZD', name: '뉴질랜드 달러' },
    { code: 'SEK', name: '크로나 (스웨덴)' },
    { code: 'NOK', name: '크로네 (노르웨이)' },
    { code: 'DKK', name: '크로네 (덴마크)' },
    { code: 'CZK', name: '코루나 (체코)' },
    { code: 'HUF', name: '포린트 (헝가리)' },
    { code: 'PLN', name: '즐로티 (폴란드)' },
  ];
  const WEATHER_OPTIONS = [
    { label: '☀️ 맑음',     value: '맑음' },
    { label: '🌤️ 부분흐림', value: '부분흐림' },
    { label: '⛅ 흐림',     value: '흐림' },
    { label: '🌧️ 비',       value: '비' },
    { label: '❄️ 눈',       value: '눈' },
    { label: '💨 바람',     value: '바람' },
  ];
  const FLIGHT_OPTIONS  = ['직항', '경유'];
  const KEYWORD_OPTIONS = ['#맛집','#쇼핑','#자연','#역사','#휴양','#액티비티','#도시','#힐링','#백패킹','#럭셔리'];

  const toggleKeyword = (kw: string) =>
    setKeywords(prev => prev.includes(kw) ? prev.filter(k => k !== kw) : [...prev, kw]);

  // ── 기간 자동 불러오기 ──
  const [autoLoadStart,           setAutoLoadStart]           = useState(todayInit);
  const [autoLoadEnd,             setAutoLoadEnd]             = useState(todayInit);
  const [loadingMedia,            setLoadingMedia]            = useState(false);
  const [autoLoadCalendarVisible, setAutoLoadCalendarVisible] = useState(false);

  // ── 미디어 선택 모달 (30개 초과 시) ──
  const [mediaPickerVisible,  setMediaPickerVisible]  = useState(false);
  const [mediaPickerAssets,   setMediaPickerAssets]   = useState<MediaLibrary.Asset[]>([]);
  const [mediaPickerSelected, setMediaPickerSelected] = useState<Set<string>>(new Set());
  const [mediaPickerMax,      setMediaPickerMax]      = useState(30);
  // 모달 열기 전 iCloud 사유로 제외된 장수 — 완료 메시지 안내에 사용
  const cloudSkippedRef = useRef(0);

  const toggleMediaPickerItem = (id: string) => {
    setMediaPickerSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= mediaPickerMax) return prev;
        next.add(id);
      }
      return next;
    });
  };

  // ph:// 에셋을 표시·복사 가능한 로컬 file:// 로 변환해 {asset, uri} 쌍을 돌려준다.
  // iCloud로 오프로드된(원본이 기기에 없는) 사진은 Expo 관리형 API로 materialize가
  // 불가능하다 — getAssetInfoAsync/ImageManipulator/FileSystem.copyAsync 모두 실패하며
  // ph:// 그대로 두면 새 아키텍처에서 검은 타일로 뜬다. 따라서 가져올 수 없는 것으로
  // 보고 제외한다(검은 타일/조용한 실패 방지). 변환은 Promise.all로 병렬 처리.
  const resolveImportable = async (
    assets: MediaLibrary.Asset[]
  ): Promise<{ asset: MediaLibrary.Asset; uri: string }[]> => {
    const probed = await Promise.all(
      assets.map(async (asset) => {
        try {
          if (Platform.OS === 'ios' && asset.uri.startsWith('ph://')) {
            const info = await MediaLibrary.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: false });
            return info.localUri ? { asset, uri: info.localUri } : null; // localUri 없으면 iCloud → 제외
          }
          return { asset, uri: asset.uri };
        } catch {
          return null;
        }
      })
    );
    return probed.filter((p): p is { asset: MediaLibrary.Asset; uri: string } => p !== null);
  };

  // iCloud 제외분 안내 문구 (없으면 빈 문자열)
  const cloudNote = (skipped: number) =>
    skipped > 0 ? `\n\niCloud에 보관된 ${skipped}장은 자동 불러오기로 가져올 수 없어, 아래 ‘갤러리에서 선택’으로 받아주세요.` : '';

  const confirmMediaPickerSelection = async () => {
    const selectedAssets = mediaPickerAssets.filter(a => mediaPickerSelected.has(a.id));
    setMediaPickerVisible(false);
    setLoadingMedia(true);

    try {
      const ok = await resolveImportable(selectedAssets);
      const resolvedUris = ok.map((p) => p.uri);

      setMedias((prev) => {
        const existingSet = new Set(prev);
        const newUris = resolvedUris.filter((uri) => !existingSet.has(uri));
        return [...prev, ...newUris];
      });

      // 모달에는 이미 가져올 수 있는 사진만 담겼으므로, 제외 안내는 모달 열기 전 집계분을 쓴다
      Alert.alert('불러오기 완료', `${resolvedUris.length}장의 사진을 불러왔어요!${cloudNote(cloudSkippedRef.current)}`);
    } catch (e: any) {
      Alert.alert('불러오기 실패', e?.message ?? '갤러리를 불러오는 중 오류가 발생했어요.');
    } finally {
      setLoadingMedia(false);
    }
  };

  const loadMediaByDate = async (overrideStart?: Date, overrideEnd?: Date) => {
    const rangeStart = overrideStart ?? autoLoadStart;
    const rangeEnd   = overrideEnd   ?? autoLoadEnd;

    if (!rangeStart || !rangeEnd || isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
      Alert.alert('날짜 오류', '날짜를 다시 선택해주세요.');
      return;
    }

    setLoadingMedia(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          '갤러리 접근 권한이 필요해요',
          '설정에서 갤러리 접근을 허용해주세요.',
          [
            { text: '취소', style: 'cancel' },
            { text: '설정에서 허용하기', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }

      const startOfDay = new Date(rangeStart);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(rangeEnd);
      endOfDay.setHours(23, 59, 59, 999);

      const result = await MediaLibrary.getAssetsAsync({
        mediaType: [MediaLibrary.MediaType.photo],
        createdAfter:  startOfDay.getTime(),
        createdBefore: endOfDay.getTime(),
        sortBy: MediaLibrary.SortBy.creationTime,
        first: 500,
      });

      const allAssets = result?.assets ?? [];
      if (allAssets.length === 0) {
        Alert.alert('사진이 없어요', '해당 기간에 사진이 없어요.');
        return;
      }

      // 가져올 수 있는(로컬) 사진만 추린다. iCloud 오프로드 사진은 materialize가 불가능하므로
      // 여기서 미리 걸러내 검은 타일/조용한 실패를 막고, 몇 장이 iCloud인지 안내한다.
      const ok = await resolveImportable(allAssets);
      const cloudCount = allAssets.length - ok.length;
      cloudSkippedRef.current = cloudCount;

      if (ok.length === 0) {
        Alert.alert(
          'iCloud에 있는 사진이에요',
          `이 기간 사진 ${cloudCount}장은 모두 iCloud에 보관돼 있어 자동 불러오기로는 가져올 수 없어요.\n\n‘갤러리에서 선택’으로 받아주세요. (iCloud 사진은 이 방식에서만 받아집니다)`
        );
        return;
      }

      const total = ok.length;
      const slotsAvailable = 30 - medias.length;
      if (slotsAvailable <= 0) {
        Alert.alert('알림', '사진은 최대 30장까지 추가할 수 있어요.');
        return;
      }

      // 30개 초과 시 → 선택 모달 표시 (가져올 수 있는 사진만 전달 → 검은 타일 없음)
      if (total > slotsAvailable) {
        setMediaPickerAssets(ok.map((p) => p.asset));
        setMediaPickerMax(slotsAvailable);
        setMediaPickerSelected(new Set());
        setMediaPickerVisible(true);
        return;
      }

      // 30개 이하 → 전체 추가 (이미 변환된 localUri 사용)
      const resolvedUris = ok.map((p) => p.uri);

      setMedias((prev) => {
        const existingSet = new Set(prev);
        const newUris = resolvedUris.filter((uri) => !existingSet.has(uri));
        return [...prev, ...newUris];
      });

      Alert.alert('불러오기 완료', `${resolvedUris.length}장의 사진을 불러왔어요!${cloudNote(cloudCount)}`);
    } catch (e: any) {
      Alert.alert('불러오기 실패', e?.message ?? '갤러리를 불러오는 중 오류가 발생했어요.');
    } finally {
      setLoadingMedia(false);
    }
  };

  // ── 내비 ──
  const canGoNext = () => {
    if (step === 1) return selectedCountries.length > 0;
    if (step === 2) return medias.length > 0; // 사진 최소 1장 필수
    if (step === TOTAL_STEPS) {
      if (!(memo.trim().length > 0 && selectedCompanions.length > 0)) return false;
      // 모든 선택 국가에 평점 필요 (활성 국가는 전역 rating, 나머지는 국가별 저장값)
      return selectedCountries.every((c, idx) =>
        idx === activeCountryIdx ? rating > 0 : (perCountryStore.current[c.name]?.rating ?? 0) > 0
      );
    }
    return true;
  };

  const goNext = () => {
    if (step < TOTAL_STEPS) {
      if (isMultiCountry && step === 2) saveCurrentCountryData();
      setStep(s => s + 1);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  };
  const goPrev = () => {
    if (step > 1) {
      if (isMultiCountry && step === 2) saveCurrentCountryData();
      setStep(s => s - 1);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  };

  const handleSave = () => {
    if (selectedCountries.length === 0) {
      Alert.alert('국가를 선택해주세요', '여행한 국가를 1개 이상 선택해야 저장할 수 있어요.');
      return;
    }
    {
      // 현재 활성 국가 데이터 저장
      saveCurrentCountryData();

      const first = selectedCountries[0];

      // 국가별 데이터 수집
      const pcd: Record<string, { medias?: string[]; startDate?: string; endDate?: string; rating?: number; representativePhoto?: string }> = {};
      let allMedias: string[] = [];
      let firstRating = 0;
      let firstStart = formatDate(todayInit);
      let firstEnd = formatDate(todayInit);

      selectedCountries.forEach((c, i) => {
        const d = perCountryStore.current[c.name];
        if (d) {
          pcd[c.name] = {
            medias: d.medias,
            startDate: formatDate(d.startDate),
            endDate: formatDate(d.endDate),
            rating: d.rating,
            representativePhoto: d.representativePhoto,
          };
          allMedias = [...allMedias, ...d.medias];
          if (i === 0) {
            firstRating = d.rating;
            firstStart = formatDate(d.startDate);
            firstEnd = formatDate(d.endDate);
          }
        }
      });

      const firstRepPhoto = perCountryStore.current[first.name]?.representativePhoto || representativePhoto || undefined;

      const payload = {
        country: `${first.flag} ${first.name}`,
        countryName: first.name,
        countryFlag: first.flag,
        countries: selectedCountries,
        regionName: selectedRegion?.name || undefined,
        regionNameEn: selectedRegion?.nameEn || undefined,
        perCountryData: Object.keys(pcd).length > 0 ? pcd : undefined,
        representativePhoto: firstRepPhoto,
        date: firstStart,
        content: title || (selectedCountries.length === 1
          ? `${first.name} 여행 기록`
          : `${first.name} 외 ${selectedCountries.length - 1}개국 여행 기록`),
        memo,
        rating: firstRating,
        companions: selectedCompanions,
        companionFriends,
        medias: allMedias,
        mediaPrivacy,
        startDate: firstStart,
        endDate: firstEnd,
        budget:     budget ? { amount: Number(budget), currency } : undefined,
        weather:    weather    || undefined,
        flightType: flightType || undefined,
        keywords:   keywords.length > 0 ? keywords : undefined,
      };

      if (isEdit && editRecord) {
        // 작성자·공개범위·형식은 유지하고 내용만 갱신
        updateRecord(editRecord.id, payload);
      } else {
        addRecord({
          user: { name: '', emoji: '✈️', handle: '' }, // addRecord가 로그인 사용자로 채움
          visibility: 'friends',
          viewType: 'feed',
          ...payload,
        });
      }
    }
    savedRef.current = true;
    navigation.goBack();
  };

  // 입력 중 이탈 방지 (취소/뒤로가기/제스처) — 저장 시엔 건너뜀
  useEffect(() => {
    const hasInput =
      selectedCountries.length > 0 || medias.length > 0 || memo.trim().length > 0 ||
      rating > 0 || selectedCompanions.length > 0 || keywords.length > 0 ||
      !!budget || !!weather || !!flightType;
    const sub = navigation.addListener('beforeRemove', (e) => {
      if (savedRef.current || !hasInput) return;
      e.preventDefault();
      Alert.alert('작성을 취소할까요?', '입력한 내용이 저장되지 않아요.', [
        { text: '계속 작성', style: 'cancel' },
        { text: '나가기', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return sub;
  }, [navigation, selectedCountries, medias, memo, rating, selectedCompanions, keywords, budget, weather, flightType]);

  // 필수 미충족 시 빠진 항목 안내
  const showHint = (msg: string) => { setHintMsg(msg); setTimeout(() => setHintMsg(''), 2200); };
  const missingHint = (): string[] => {
    const m: string[] = [];
    if (step === 1) { if (selectedCountries.length === 0) m.push('국가'); }
    else if (step === 2) { if (medias.length === 0) m.push('사진'); }
    else if (step === TOTAL_STEPS) {
      if (memo.trim().length === 0) m.push('글');
      const noRating = selectedCountries.some((c, idx) =>
        idx === activeCountryIdx ? rating <= 0 : (perCountryStore.current[c.name]?.rating ?? 0) <= 0);
      if (noRating) m.push(isMultiCountry ? '모든 국가 평점' : '평점');
      if (selectedCompanions.length === 0) m.push('동행자');
    }
    return m;
  };
  const handleNextPress = () => {
    if (canGoNext()) { goNext(); return; }
    const miss = missingHint();
    showHint(miss.length ? `${miss.join(', ')} 입력이 필요해요` : '필수 항목을 입력해주세요');
  };
  const handleSavePress = () => {
    if (canGoNext()) { handleSave(); return; }
    const miss = missingHint();
    showHint(miss.length ? `${miss.join(', ')} 입력이 필요해요` : '필수 항목을 입력해주세요');
  };

  // 키워드 추가 (선행 # 정규화 + 중복 방지 + 빈값 무시 + 개수/길이 제한)
  const KEYWORD_MAX = 10;
  const KEYWORD_MAXLEN = 20;
  const addKeyword = (raw: string) => {
    const base = raw.trim().replace(/^#+/, '').trim().slice(0, KEYWORD_MAXLEN);
    if (!base) { setKeywordQuery(''); return; }
    const tag = `#${base}`;
    setKeywords(prev => {
      if (prev.includes(tag)) return prev;
      if (prev.length >= KEYWORD_MAX) { showHint(`키워드는 최대 ${KEYWORD_MAX}개예요`); return prev; }
      return [...prev, tag];
    });
    setKeywordQuery('');
  };

  // ── 단계별 제목 ──
  const STEP_TITLES = ['국가 선택', '사진', '기록 정보'];

  // ─── 렌더 ───
  return (
    <SafeAreaView style={s.safeArea}>
      {/* 헤더 */}
      <View style={s.header}>
        <TouchableOpacity style={s.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={s.cancelTxt}>취소</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{isEdit ? '기록 수정' : '새 기록하기'}</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* 진행 바 */}
      <StepProgressBar current={step} total={TOTAL_STEPS} />

      {/* 단계 타이틀 */}
      <View style={s.stepTitleWrap}>
        <Text style={s.stepTitleText}>{STEP_TITLES[step - 1]}</Text>
        <Text style={s.stepCountText}>{step} / {TOTAL_STEPS}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEnabled={scrollEnabled}
        >

          {/* ══════════════════ STEP 1 ══════════════════ */}
          {step === 1 && (
            <View style={s.step1Wrap}>
              {/* 선택된 국가 목록 */}
              {selectedCountries.length === 1 && (
                <View style={s.selectedChipsWrap}>
                  {selectedCountries.map((c) => (
                    <View key={c.name} style={s.countryChip}>
                      <Text style={s.countryChipText}>{c.flag} {c.name}</Text>
                      <TouchableOpacity
                        onPress={() => handleRemoveCountry(c.name)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={s.countryChipRemove}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {selectedCountries.length >= 2 && (
                <View style={{ marginBottom: 12 }}>
                  <DraggableCountryList
                    countries={selectedCountries}
                    onReorder={handleReorder}
                    onRemove={handleRemoveCountry}
                    onDragStateChange={(isDragging) => setScrollEnabled(!isDragging)}
                  />
                  <Text style={s.draggableHelperText}>
                    드래그하여 국가 순서를 변경할 수 있습니다. (첫 번째 국가가 대표 국가가 됩니다)
                  </Text>
                </View>
              )}

              {/* 검색창 — 항상 표시 */}
              <View style={[s.searchCard, selectedCountries.length > 0 ? s.searchCardSelected : null]}>
                <View style={s.searchRow}>
                  <SearchIcon size={16} color={COLORS.textDim} />
                  <TextInput
                    style={s.searchInput}
                    placeholder={selectedCountries.length > 0
                      ? "추가 국가를 검색해보세요"
                      : "국가명을 검색해보세요"}
                    placeholderTextColor={COLORS.textMuted}
                    value={countrySearch}
                    onChangeText={setCountrySearch}
                  />
                  {countrySearch.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setCountrySearch('')}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={s.clearBtnTxt}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* 검색 결과 — 1글자 이상 */}
              {countrySearch.length >= 1 && (
                <View style={s.countryResultBox}>
                  <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {groupedCountries.length === 0 ? (
                      <Text style={s.noResultText}>검색 결과가 없어요 🔍</Text>
                    ) : (
                      groupedCountries.map(({ continent, countries }) => (
                        <View key={continent}>
                          <Text style={s.continentHeader}>{continent}</Text>
                          {countries.map(c => {
                            const isSelected = selectedCountries.some(sc => sc.name === c.name);
                            return (
                              <TouchableOpacity
                                key={c.name}
                                style={[s.countryItem, isSelected && s.countryItemSelected]}
                                onPress={() => {
                                  if (isSelected) {
                                    handleRemoveCountry(c.name);
                                  } else if (selectedCountries.length < MAX_COUNTRIES) {
                                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                    setSelectedCountries(prev => [...prev, { flag: c.flag, name: c.name }]);
                                  }
                                }}
                              >
                                <Text style={s.countryIcon}>{c.flag}</Text>
                                <Text style={[s.countryName, isSelected && s.countryNameSelected]}>{c.name}</Text>
                                {isSelected && <Text style={s.countryCheckMark}>✓</Text>}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ))
                    )}
                  </ScrollView>
                </View>
              )}

              {/* 안내 문구 */}
              {selectedCountries.length === 0 && countrySearch.length === 0 && (
                <Text style={s.stepHint}>{'어느 나라를 다녀오셨나요?\n여러 나라를 선택할 수 있어요 (최대 10개)'}</Text>
              )}

              {/* 선택 완료 확인 */}
              {selectedCountries.length > 0 && countrySearch.length === 0 && (
                <View style={s.selectedBadge}>
                  <Text style={s.selectedBadgeTxt}>✓ {selectedCountries.length}개 국가 선택 완료{selectedCountries.length < MAX_COUNTRIES ? ' · 추가 가능' : ' · 최대'}</Text>
                </View>
              )}
            </View>
          )}

          {/* ══════════════════ STEP 2 ══════════════════ */}
          {step === 2 && (
            <View>
              {/* 국가별 탭 (2개국 이상) */}
              {isMultiCountry && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.countryTabScroll} contentContainerStyle={s.countryTabContent}>
                  {selectedCountries.map((c, idx) => (
                    <TouchableOpacity
                      key={c.name}
                      style={[s.countryTab, idx === activeCountryIdx && s.countryTabActive]}
                      onPress={() => switchCountry(idx)}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.countryTabText, idx === activeCountryIdx && s.countryTabTextActive]}>{c.flag} {c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              {/* 기간으로 자동 불러오기 버튼 */}
              <TouchableOpacity
                style={s.autoLoadBtn}
                onPress={() => {
                  setAutoLoadStart(startDate);
                  setAutoLoadEnd(endDate);
                  setAutoLoadCalendarVisible(true);
                }}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <CalendarIcon size={16} color={COLORS.purpleNeon} />
                  <Text style={s.autoLoadBtnText}>기간으로 자동 불러오기</Text>
                </View>
              </TouchableOpacity>
              {loadingMedia && <ActivityIndicator color="#BF85FC" size="large" style={{ marginVertical: 12 }} />}

              {/* 갤러리 선택 버튼 */}
              <TouchableOpacity
                style={[s.addMediaBtn, medias.length >= 30 && s.addMediaBtnDisabled]}
                onPress={selectMedia}
                activeOpacity={0.8}
                disabled={medias.length >= 30}
              >
                <View style={s.addMediaLeft}>
                  <DesignerCameraIcon size={20} color={COLORS.purpleNeon} />
                  <View>
                    <Text style={s.addMediaText}>갤러리에서 선택</Text>
                    <Text style={s.addMediaSub}>사진 최대 30장</Text>
                  </View>
                </View>
                <View style={s.addMediaCountBadge}>
                  <Text style={s.addMediaCountTxt}>{medias.length}/30</Text>
                </View>
              </TouchableOpacity>

              {/* 썸네일 그리드 (드래그 앤 드롭 정렬 가능) */}
              {medias.length > 0 && (
                <DraggablePhotoGrid
                  medias={medias}
                  mediaPrivacy={mediaPrivacy}
                  onReorder={handleReorderMedias}
                  onRemove={removeMedia}
                  onOpenPrivacyModal={setPrivacyModalIndex}
                  onDragStateChange={(isDragging) => setScrollEnabled(!isDragging)}
                  THUMB_SIZE={THUMB_SIZE}
                  representativePhoto={representativePhoto}
                  onSetRepresentative={(uri) => {
                    setRepresentativePhoto(prev => prev === uri ? null : uri);
                  }}
                />
              )}

              {/* 빈 상태 */}
              {medias.length === 0 && (
                <View style={s.mediaEmptyBox}>
                  <DesignerCameraIcon size={32} color={COLORS.textMuted} />
                  <Text style={s.mediaEmptyTitle}>아직 선택된 사진이 없어요</Text>
                  <Text style={s.mediaEmptyDesc}>사진 없이도 다음 단계로 넘어갈 수 있어요</Text>
                </View>
              )}

            </View>
          )}

          {step === 3 && (
            <View style={s.step3Wrap}>
              {/* 국가별 탭 (2개국 이상) */}
              {isMultiCountry && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.countryTabScroll} contentContainerStyle={s.countryTabContent}>
                  {selectedCountries.map((c, idx) => (
                    <TouchableOpacity
                      key={c.name}
                      style={[s.countryTab, idx === activeCountryIdx && s.countryTabActive]}
                      onPress={() => switchCountry(idx)}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.countryTabText, idx === activeCountryIdx && s.countryTabTextActive]}>{c.flag} {c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* 날짜 (국가별) */}
              <View style={s.fieldBlock}>
                <View style={s.perCountryLabelRow}>
                  <Text style={s.fieldLabelReq}>날짜</Text>
                  <Text style={s.reqTag}>✱</Text>
                  {isMultiCountry && (
                    <Text style={s.perCountryHint}>{selectedCountries[activeCountryIdx]?.flag} {selectedCountries[activeCountryIdx]?.name}</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={s.dateBtn}
                  onPress={() => setCalendarVisible(true)}
                  activeOpacity={0.85}
                >
                  <View style={s.dateBtnCol}>
                    <Text style={s.dateBtnLabel}>출발일</Text>
                    <Text style={s.dateBtnVal}>{formatDate(startDate)}</Text>
                  </View>
                  <Text style={s.dateBtnArrow}>→</Text>
                  <View style={s.dateBtnCol}>
                    <Text style={s.dateBtnLabel}>도착일</Text>
                    <Text style={s.dateBtnVal}>{formatDate(endDate)}</Text>
                  </View>
                  <View style={{ marginLeft: 10 }}><CalendarIcon size={18} color={COLORS.purpleNeon} /></View>
                </TouchableOpacity>
              </View>

              {/* 글 (공통) */}
              <View style={s.fieldBlock}>
                <View style={s.fieldLabelRow}>
                  <Text style={s.fieldLabelReq}>글</Text>
                  <Text style={s.reqTag}>✱</Text>
                </View>
                <TextInput
                  style={[s.fieldInput, s.memoInput]}
                  placeholder="여행의 순간을 기록해보세요"
                  placeholderTextColor={COLORS.textMuted}
                  value={memo}
                  onChangeText={setMemo}
                  multiline
                  textAlignVertical="top"
                  maxLength={1000}
                />
                <Text style={s.charCount}>{memo.length}/1000</Text>
              </View>

              {/* ── 동행자 선택 ── */}
              <View style={s.companionSection}>
                <View style={s.fieldLabelRow}>
                  <Text style={s.companionSectionLabel}>동행자 선택</Text>
                  <Text style={s.reqTag}>✱</Text>
                </View>
                {/* 컴팩트 칩 */}
                <View style={s.companionChipWrap}>
                  {DEFAULT_COMPANIONS.map(comp => {
                    const isActive = selectedCompanions.includes(comp);
                    const iconColor = isActive ? COLORS.purpleNeon : COLORS.textDim;
                    const COMP_ICONS: Record<string, React.ReactNode> = {
                      '혼자': <SoloIcon color={iconColor} />,
                      '친구': <FriendIcon color={iconColor} />,
                      '연인': <CoupleIcon color={iconColor} />,
                      '가족': <FamilyIcon color={iconColor} />,
                      '부모님': <ParentIcon color={iconColor} />,
                      '형제': <SiblingIcon color={iconColor} />,
                    };
                    return (
                      <TouchableOpacity
                        key={comp}
                        style={[s.companionChip, isActive && s.companionChipActive]}
                        onPress={() => toggleCompanion(comp)}
                        activeOpacity={0.75}
                      >
                        <View style={s.companionChipIconWrap}>{COMP_ICONS[comp]}</View>
                        <Text style={[s.companionChipTxt, isActive && s.companionChipTxtActive]}>{comp}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {/* 선택된 앱 친구 칩 */}
                {companionFriends.length > 0 && (
                  <View style={s.customChipRow}>
                    {companionFriends.map(friend => (
                      <View key={friend} style={s.friendChip}>
                        <View style={s.friendChipAvatar}>
                          <Text style={s.friendChipAvatarTxt}>{friend[0]}</Text>
                        </View>
                        <Text style={s.friendChipName}>{friend}</Text>
                        <TouchableOpacity
                          onPress={() => removeCompanionFriend(friend)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={s.customChipX}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                {/* 앱 친구 추가 버튼 */}
                <TouchableOpacity
                  style={s.addFriendBtn}
                  onPress={() => setFriendPickerVisible(true)}
                  activeOpacity={0.75}
                >
                  <FriendIcon color={COLORS.purpleNeon} />
                  <Text style={s.addFriendTxt}>앱 친구 추가</Text>
                  {companionFriends.length > 0 && (
                    <View style={s.addFriendBadge}>
                      <Text style={s.addFriendBadgeTxt}>{companionFriends.length}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* 별점 (국가별) */}
              <View style={s.fieldBlock}>
                <View style={s.ratingLabelRow}>
                  <View style={s.perCountryLabelRow}>
                    <Text style={s.fieldLabelReq}>별점</Text>
                    <Text style={s.reqTag}>✱</Text>
                    {isMultiCountry && (
                      <Text style={s.perCountryHint}>{selectedCountries[activeCountryIdx]?.flag} {selectedCountries[activeCountryIdx]?.name}</Text>
                    )}
                  </View>
                  {rating > 0
                    ? <Text style={s.ratingScore}>{rating.toFixed(1)} / 5.0</Text>
                    : <Text style={s.ratingScoreEmpty}>탭하거나 드래그해 선택</Text>}
                </View>
                <View style={s.ratingCard}>
                  {renderStars()}
                </View>
              </View>

              {/* ── 선택 항목 구분선 ── */}
              <View style={s.companionDivider} />

              {/* 안내 */}
              <Text style={s.optNoticeText}>선택 항목이에요 (건너뛰어도 돼요 😊)</Text>

              {/* 예산 */}
              <View style={s.optRow}>
                <View style={s.optRowHeader}>
                  <CoinIcon size={18} color={IC} />
                  <Text style={s.optRowTitle}>예산</Text>
                  {budget ? <Text style={s.optCardValue}>{Number(budget).toLocaleString()} {currency}</Text> : null}
                </View>
                <View style={s.optBudgetRow}>
                  {CURRENCIES.map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[s.optCurrencyChip, currency === c && s.optCurrencyChipActive]}
                      onPress={() => setCurrency(c)}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.optCurrencyTxt, currency === c && s.optCurrencyTxtActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                  {/* 기타 통화 버튼 */}
                  <TouchableOpacity
                    style={[s.optCurrencyChip, !CURRENCIES.includes(currency) && s.optCurrencyChipActive]}
                    onPress={() => { setCurrencySearch(''); setCurrencyModalVisible(true); }}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.optCurrencyTxt, !CURRENCIES.includes(currency) && s.optCurrencyTxtActive]}>
                      {CURRENCIES.includes(currency) ? '기타 ›' : currency}
                    </Text>
                  </TouchableOpacity>
                  <TextInput
                    style={s.optBudgetInput}
                    placeholder="금액"
                    placeholderTextColor={COLORS.textMuted}
                    value={budget}
                    onChangeText={v => setBudget(v.replace(/[^0-9]/g, ''))}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* 날씨 */}
              <View style={s.optRow}>
                <View style={s.optRowHeader}>
                  <WeatherIcon size={18} color={IC} />
                  <Text style={s.optRowTitle}>날씨</Text>
                  {weather ? <Text style={s.optCardValue}>{WEATHER_OPTIONS.find(w => w.value === weather)?.label}</Text> : null}
                </View>
                <View style={s.optChipRow}>
                  {WEATHER_OPTIONS.map(w => (
                    <TouchableOpacity
                      key={w.value}
                      style={[s.optSmallBtn, weather === w.value && s.optSmallBtnActive]}
                      onPress={() => setWeather(weather === w.value ? '' : w.value)}
                      activeOpacity={0.75}
                    >
                      {WEATHER_ICON_MAP[w.value]}
                      <Text style={[s.optSmallTxt, weather === w.value && s.optSmallTxtActive]}>
                        {w.value}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 직항/경유 */}
              <View style={s.optRow}>
                <View style={s.optRowHeader}>
                  <DesignerPlaneIcon size={18} color={IC} />
                  <Text style={s.optRowTitle}>직항 / 경유</Text>
                  {flightType ? <Text style={s.optCardValue}>{flightType}</Text> : null}
                </View>
                <View style={s.optChipRow}>
                  {FLIGHT_OPTIONS.map(f => (
                    <TouchableOpacity
                      key={f}
                      style={[s.optFlightBtn, flightType === f && s.optFlightBtnActive]}
                      onPress={() => setFlightType(flightType === f ? '' : f)}
                      activeOpacity={0.75}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        {f === '직항' ? <TakeoffIcon size={14} color={flightType === f ? COLORS.purpleNeon : COLORS.textDim} /> : <TransferIcon size={14} color={flightType === f ? COLORS.purpleNeon : COLORS.textDim} />}
                        <Text style={[s.optFlightTxt, flightType === f && s.optFlightTxtActive]}>
                          {f}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 여행 키워드 */}
              <View style={s.optRow}>
                <View style={s.optRowHeader}>
                  <TagIcon size={18} color={IC} />
                  <Text style={s.optRowTitle}>키워드</Text>
                  {keywords.length > 0 && <Text style={s.optCardValue}>{keywords.length}개</Text>}
                </View>
                {/* 태그 + 입력창 인라인 */}
                <View style={s.kwInputBox}>
                  {keywords.map(kw => (
                    <TouchableOpacity
                      key={kw}
                      style={s.kwTag}
                      onPress={() => setKeywords(prev => prev.filter(k => k !== kw))}
                      activeOpacity={0.75}
                    >
                      <Text style={s.kwTagTxt}>{kw}</Text>
                      <Text style={s.kwTagDel}> ✕</Text>
                    </TouchableOpacity>
                  ))}
                  <TextInput
                    style={s.kwInlineInput}
                    value={keywordQuery}
                    onChangeText={v => {
                      // 스페이스 입력 시 태그 추가
                      if (v.endsWith(' ')) addKeyword(v);
                      else setKeywordQuery(v);
                    }}
                    placeholder={keywords.length === 0 ? '#키워드 추가' : '#'}
                    placeholderTextColor={COLORS.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={() => addKeyword(keywordQuery)}
                  />
                </View>
                <Text style={s.kwHint}>스페이스 또는 엔터로 태그 추가 · 탭해서 삭제</Text>
              </View>

            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 필수 미충족 안내 토스트 */}
      {hintMsg !== '' && (
        <View style={s.hintToast} pointerEvents="none">
          <Text style={s.hintToastText}>{hintMsg}</Text>
        </View>
      )}

      {/* 이전 / 다음 / 저장 버튼 */}
      <StepNavBar
        step={step}
        totalSteps={TOTAL_STEPS}
        canNext={canGoNext()}
        onPrev={goPrev}
        onNext={handleNextPress}
        onSave={handleSavePress}
      />

      {/* 캘린더 바텀시트 */}
      <CalendarBottomSheet
        visible={calendarVisible}
        initialStart={startDate}
        initialEnd={endDate}
        onConfirm={(s, e) => { setStartDate(s); setEndDate(e); }}
        onClose={() => setCalendarVisible(false)}
      />

      {/* 🔒 비공개 친구 선택 모달 */}
      <PrivacyModal
        visible={privacyModalIndex !== null}
        selectedFriends={privacyModalIndex !== null ? (mediaPrivacy[privacyModalIndex] || []) : []}
        allFriends={friendNames}
        onToggle={friend => privacyModalIndex !== null && toggleMediaPrivacyFriend(privacyModalIndex, friend)}
        onSetAll={friends => privacyModalIndex !== null && setMediaPrivacyAll(privacyModalIndex, friends)}
        onClose={() => setPrivacyModalIndex(null)}
      />

      {/* 앱 친구 선택 모달 */}
      <Modal
        visible={friendPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFriendPickerVisible(false)}
        statusBarTranslucent
      >
        <View style={fp.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setFriendPickerVisible(false)} />
          <View style={fp.sheet}>
            <View style={fp.handle} />
            <View style={fp.header}>
              <FriendIcon color={COLORS.purpleNeon} />
              <Text style={fp.headerTitle}>함께한 친구 선택</Text>
            </View>

            <ScrollView style={fp.list} showsVerticalScrollIndicator={false}>
              {friendNames.length === 0 ? (
                <Text style={{ color: COLORS.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 32 }}>
                  아직 팔로우한 친구가 없어요
                </Text>
              ) : friendNames.map(friend => {
                const isSelected = companionFriends.includes(friend);
                return (
                  <TouchableOpacity
                    key={friend}
                    style={[fp.row, isSelected && fp.rowActive]}
                    onPress={() => toggleCompanionFriend(friend)}
                    activeOpacity={0.7}
                  >
                    <View style={[fp.avatar, isSelected && fp.avatarActive]}>
                      <Text style={fp.avatarTxt}>{friend[0]}</Text>
                    </View>
                    <Text style={[fp.name, isSelected && fp.nameActive]}>{friend}</Text>
                    <View style={[fp.check, isSelected && fp.checkActive]}>
                      {isSelected && <Text style={fp.checkMark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={fp.doneBtn} onPress={() => setFriendPickerVisible(false)} activeOpacity={0.85}>
              <Text style={fp.doneTxt}>
                {companionFriends.length > 0 ? `${companionFriends.length}명 선택 완료` : '선택 없이 닫기'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 기타 통화 선택 모달 */}
      <Modal
        visible={currencyModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCurrencyModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setCurrencyModalVisible(false)}
          />
          <View style={s.currModalSheet}>
            <View style={s.currModalHandle} />
            <Text style={s.currModalTitle}>통화 선택</Text>
            <View style={s.currModalSearchWrap}>
              <SearchIcon size={14} color={COLORS.textDim} />
              <TextInput
                style={s.currModalSearchInput}
                value={currencySearch}
                onChangeText={setCurrencySearch}
                placeholder="통화 검색 (예: EUR, 유로)"
                placeholderTextColor={COLORS.textMuted}
                autoFocus
              />
            </View>
            <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
              {OTHER_CURRENCIES
                .filter(c => {
                  const q = currencySearch.trim().toLowerCase();
                  return !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
                })
                .map((c, idx, arr) => (
                  <TouchableOpacity
                    key={c.code}
                    style={[s.currModalItem, idx < arr.length - 1 && s.currModalItemBorder]}
                    onPress={() => { setCurrency(c.code); setCurrencyModalVisible(false); }}
                    activeOpacity={0.75}
                  >
                    <Text style={s.currModalCode}>{c.code}</Text>
                    <Text style={s.currModalName}>{c.name}</Text>
                    {currency === c.code && <Text style={s.currModalCheck}>✓</Text>}
                  </TouchableOpacity>
                ))}
            </ScrollView>
            <View style={{ height: 24 }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 자동 불러오기용 캘린더 */}
      <CalendarBottomSheet
        visible={autoLoadCalendarVisible}
        initialStart={autoLoadStart}
        initialEnd={autoLoadEnd}
        startLabel="시작일"
        endLabel="종료일"
        onConfirm={(s, e) => {
          setAutoLoadStart(s);
          setAutoLoadEnd(e);
          setAutoLoadCalendarVisible(false);
          loadMediaByDate(s, e);
        }}
        onClose={() => setAutoLoadCalendarVisible(false)}
      />

      {/* ── 미디어 선택 모달 (30개 초과 시) ── */}
      <Modal
        visible={mediaPickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setMediaPickerVisible(false)}
      >
        <View style={mpStyles.root}>
          {/* 헤더 */}
          <View style={mpStyles.header}>
            <TouchableOpacity onPress={() => setMediaPickerVisible(false)} style={{ padding: 4 }}>
              <Text style={mpStyles.cancelText}>취소</Text>
            </TouchableOpacity>
            <Text style={mpStyles.title}>사진 선택</Text>
            <TouchableOpacity
              onPress={confirmMediaPickerSelection}
              style={{ padding: 4 }}
              disabled={mediaPickerSelected.size === 0}
            >
              <Text style={[mpStyles.confirmText, mediaPickerSelected.size === 0 && { opacity: 0.4 }]}>
                완료
              </Text>
            </TouchableOpacity>
          </View>

          {/* 안내 */}
          <View style={mpStyles.infoBar}>
            <Text style={mpStyles.infoText}>
              {mediaPickerAssets.length}장 중 최대 {mediaPickerMax}장 선택 가능
            </Text>
            <Text style={mpStyles.countText}>
              {mediaPickerSelected.size}/{mediaPickerMax}
            </Text>
          </View>

          {/* 그리드 */}
          <FlatList
            data={mediaPickerAssets}
            keyExtractor={(item) => item.id}
            numColumns={3}
            contentContainerStyle={mpStyles.gridContent}
            // 최대 500장 그리드 — 가상화 튜닝으로 모달 오픈/스크롤 끊김 완화
            initialNumToRender={15}
            maxToRenderPerBatch={15}
            windowSize={5}
            removeClippedSubviews
            getItemLayout={(_, index) => ({
              length: PICKER_CELL + 2,
              offset: (PICKER_CELL + 2) * Math.floor(index / 3),
              index,
            })}
            renderItem={({ item }) => {
              const selected = mediaPickerSelected.has(item.id);
              return (
                <TouchableOpacity
                  style={mpStyles.cell}
                  activeOpacity={0.8}
                  onPress={() => toggleMediaPickerItem(item.id)}
                >
                  <Image source={{ uri: item.uri }} style={mpStyles.cellImage} />
                  {/* 선택 오버레이 */}
                  {selected && <View style={mpStyles.selectedOverlay} />}
                  {/* 체크박스 */}
                  <View style={[mpStyles.checkbox, selected && mpStyles.checkboxActive]}>
                    {selected && <Text style={mpStyles.checkmark}>✓</Text>}
                  </View>
                  {/* 영상 표시 */}
                  {item.mediaType === 'video' && (
                    <View style={mpStyles.videoBadge}>
                      <Text style={mpStyles.videoBadgeText}>
                        {Math.floor(item.duration / 60)}:{String(Math.floor(item.duration % 60)).padStart(2, '0')}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ─── 스타일 ───
const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  cancelBtn: { padding: 4 },
  cancelTxt: { fontSize: 16, color: COLORS.textMuted },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: COLORS.white },

  stepTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  stepTitleText: { fontSize: 18, fontWeight: '700', color: COLORS.white },
  stepCountText: { fontSize: 13, color: COLORS.textMuted },

  scroll:   { flex: 1 },
  content:  { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },

  stepHint: {
    marginTop: 20,
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
  },

  // ── Step 1 ──
  step1Wrap: {
    flex: 1,
  },
  searchCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  searchCardSelected: {
    borderColor: COLORS.purpleNeon,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  searchIcon: { fontSize: 16 },
  searchInput: {
    flex: 1,
    color: COLORS.white,
    fontSize: 16,
    padding: 0,
  },
  clearBtnTxt: { fontSize: 14, color: COLORS.textDim, fontWeight: '600' },

  countryResultBox: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    marginTop: 8,
    maxHeight: 320,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  continentHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.purpleNeon,
    letterSpacing: 0.8,
    paddingTop: 12,
    paddingBottom: 4,
    paddingHorizontal: 2,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  countryIcon: { fontSize: 22, marginRight: 14 },
  countryName: { fontSize: 15, color: COLORS.white },
  countryNameSelected: { color: COLORS.purpleNeon, fontWeight: '600' },
  countryItemSelected: {
    backgroundColor: 'rgba(191,133,252,0.08)',
  },
  countryCheckMark: {
    marginLeft: 'auto',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.purpleNeon,
  },
  noResultText: { color: COLORS.textDim, fontSize: 14, textAlign: 'center', marginVertical: 24 },

  selectedChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  countryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.3)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 6,
  },
  countryChipText: {
    fontSize: 13,
    color: COLORS.purpleNeon,
    fontWeight: '600',
  },
  countryChipRemove: {
    fontSize: 11,
    color: COLORS.textDim,
    fontWeight: '700',
  },

  selectedBadge: {
    marginTop: 14,
    alignSelf: 'center',
    backgroundColor: 'rgba(191,133,252,0.12)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  selectedBadgeTxt: {
    fontSize: 13,
    color: COLORS.purpleNeon,
    fontWeight: '600',
  },

  // ── 국가별 탭 (Step 2, 3 공용) ──
  countryTabScroll: {
    marginBottom: 14,
  },
  countryTabContent: {
    gap: 8,
  },
  countryTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  countryTabActive: {
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderColor: COLORS.purpleNeon,
  },
  countryTabText: {
    fontSize: 13,
    color: COLORS.textDim,
    fontWeight: '500',
  },
  countryTabTextActive: {
    color: COLORS.purpleNeon,
    fontWeight: '700',
  },
  perCountryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  perCountryHint: {
    fontSize: 11,
    color: COLORS.purpleNeon,
    backgroundColor: 'rgba(191,133,252,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },

  // ── Step 2 ──
  addMediaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(191,133,252,0.35)',
    borderStyle: 'dashed',
  },
  addMediaBtnDisabled: {
    opacity: 0.4,
  },
  addMediaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  addMediaIcon: { fontSize: 26 },
  addMediaText: { fontSize: 15, color: COLORS.white, fontWeight: '600' },
  addMediaSub:  { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  addMediaCountBadge: {
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  addMediaCountTxt: { fontSize: 13, color: COLORS.purpleNeon, fontWeight: '700' },

  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 14,
  },
  mediaThumbWrap: {
    position: 'relative',
    borderRadius: 10,
    overflow: 'visible',
  },
  mediaThumb: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  mediaLockedOverlay: {
    position: 'absolute',
    inset: 0,
    borderRadius: 10,
    backgroundColor: 'rgba(107,33,168,0.35)',
    zIndex: 1,
  },
  // 삭제 버튼 — 좌측 상단
  mediaRemoveBtn: {
    position: 'absolute',
    top: -7,
    left: -7,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    zIndex: 10,
  },
  mediaRemoveTxt: { color: COLORS.white, fontSize: 14, fontWeight: 'bold', lineHeight: 16 },
  // 🔒 버튼 — 우측 상단
  mediaLockBtn: {
    position: 'absolute',
    top: -7,
    right: -7,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    zIndex: 10,
  },
  mediaLockBtnActive: {
    backgroundColor: COLORS.purpleDeep,
    borderColor: COLORS.purpleNeon,
  },
  mediaLockIcon: { fontSize: 13 },
  // 비공개 인원 배지 — 하단 중앙
  privacyCountBadge: {
    position: 'absolute',
    bottom: 4,
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
  privacyCountTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.white,
    backgroundColor: 'rgba(107,33,168,0.85)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  // ⭐️ 지도대표 버튼 — 좌측 하단
  mediaRepBtn: {
    position: 'absolute',
    bottom: -7,
    left: -7,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 6,
    zIndex: 10,
  },
  mediaRepBtnActive: {
    backgroundColor: COLORS.purpleDeep,
    borderColor: COLORS.purpleNeon,
  },
  mediaRepTxt: {
    fontSize: 9,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.5)',
  },
  mediaRepTxtActive: {
    color: '#BF85FC',
  },

  // 빈 상태
  mediaEmptyBox: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 10,
  },
  mediaEmptyIcon:  { fontSize: 44 },
  mediaEmptyTitle: { fontSize: 15, fontWeight: '600', color: COLORS.white },
  mediaEmptyDesc:  { fontSize: 13, color: COLORS.textMuted },

  // ── Step 3 ──
  step3Wrap: {
    gap: 16,
  },
  fieldBlock: {
    gap: 8,
  },
  // 필수 항목 라벨 — 흰색
  fieldLabelReq: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
  },
  // 라벨 + 필수 태그 행
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // 필수 표시 태그
  reqTag: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.purpleNeon,
    lineHeight: 14,
  },
  // 선택 항목 라벨 — 회색 (Step 4·5용)
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDim,
  },
  fieldInput: {
    backgroundColor: COLORS.card,   // #2E2E3B
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: COLORS.white,
    fontSize: 15,
  },
  memoInput: {
    height: 120,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  charCount: {
    alignSelf: 'flex-end',
    marginTop: 4,
    fontSize: 11,
    color: COLORS.textMuted,
  },
  hintToast: {
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.35)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  hintToastText: { color: COLORS.purpleNeon, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dateBtnCol: { flex: 1 },
  dateBtnLabel: { fontSize: 11, color: COLORS.textMuted, marginBottom: 4 },
  dateBtnVal:   { fontSize: 15, fontWeight: '600', color: COLORS.white },
  dateBtnArrow: { fontSize: 18, color: COLORS.textMuted, marginHorizontal: 12 },
  dateBtnIcon:  { fontSize: 18, marginLeft: 10 },

  ratingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ratingScore: {
    fontSize: 13,
    color: COLORS.purpleNeon,
    fontWeight: '700',
  },
  ratingScoreEmpty: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  ratingCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  starWrap: { width: 32, height: 32 },
  starAbsolute: { position: 'absolute', left: 0, top: 0, width: 32 },
  starFillClip: { position: 'absolute', left: 0, top: 0, height: 32, overflow: 'hidden' },
  starChar: { fontSize: 28, color: '#3A3A4A', textAlign: 'center', lineHeight: 32, width: 32 },
  starCharActive: { color: COLORS.gold },
  ratingNum: { fontSize: 15, color: COLORS.purpleNeon, fontWeight: '700' },

  // ── Step 4 ──
  step4Wrap: {
    gap: 0,
  },
  companionSection: {
    gap: 12,
  },
  companionSectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
  },
  // 컴팩트 칩 래퍼
  companionChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  // 컴팩트 칩 (작은 pill 형태)
  companionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: COLORS.divider,
    gap: 5,
  },
  companionChipActive: {
    backgroundColor: 'rgba(107,33,168,0.3)',
    borderColor: COLORS.purpleNeon,
  },
  companionChipIcon: { fontSize: 15 },
  companionChipIconWrap: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  companionChipTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDim,
  },
  companionChipTxtActive: { color: COLORS.white },

  // 직접입력으로 추가된 칩
  customChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  customChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.purpleDeep,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.purpleNeon,
  },
  customChipTxt: { fontSize: 14, color: COLORS.white, fontWeight: '600' },
  customChipX:   { fontSize: 12, color: 'rgba(255,255,255,0.6)' },

  // 앱 친구 칩
  friendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.purpleDeep,
    borderRadius: 20,
    paddingRight: 12,
    paddingLeft: 4,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.purpleNeon,
  },
  friendChipAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(191,133,252,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendChipAvatarTxt: { fontSize: 11, color: COLORS.purpleNeon, fontWeight: '700' },
  friendChipName: { fontSize: 13, color: COLORS.white, fontWeight: '600' },

  // 앱 친구 추가 버튼
  addFriendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderStyle: 'dashed' as any,
  },
  addFriendTxt: { fontSize: 14, color: COLORS.textDim, fontWeight: '500' },
  addFriendBadge: {
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 'auto' as any,
  },
  addFriendBadgeTxt: { fontSize: 11, color: COLORS.purpleNeon, fontWeight: '700' },

  companionDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginVertical: 20,
  },

  customCompRow: {
    flexDirection: 'row',
    gap: 8,
  },
  customCompInput: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: COLORS.white,
    fontSize: 15,
  },
  addCustomBtn: {
    backgroundColor: COLORS.purpleDeep,
    borderRadius: 12,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  addCustomBtnDisabled: { opacity: 0.4 },
  addCustomTxt: { color: COLORS.white, fontWeight: '600', fontSize: 14 },

  friendListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.divider,
    gap: 12,
  },
  friendListIcon: { fontSize: 22 },
  friendListTxt:  { fontSize: 15, color: COLORS.white, fontWeight: '600' },
  friendListSub:  { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  friendListArrow:{ fontSize: 20, color: COLORS.textMuted },

  companionSummary: {
    marginTop: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(191,133,252,0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  companionSummaryTxt: {
    fontSize: 13,
    color: COLORS.purpleNeon,
    fontWeight: '600',
  },

  // Step 5에서도 쓰는 칩 (날씨·비행·키워드)
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  chipActive: {
    backgroundColor: COLORS.purpleDeep,
    borderColor: COLORS.purpleNeon,
  },
  chipTxt:       { fontSize: 14, color: COLORS.textDim },
  chipTxtActive: { fontSize: 14, color: COLORS.white, fontWeight: '600' },

  // ── Step 5 ──
  step5Wrap: {
    gap: 12,
  },

  // 안내 텍스트
  optNoticeText: {
    fontSize: 12,
    color: COLORS.textDim,
    textAlign: 'center',
  },

  // 공통 옵션 행
  optRow: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  optRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  optRowIcon: { fontSize: 15 },
  optRowTitle: { fontSize: 13, fontWeight: '600', color: COLORS.white },
  optCardValue: {
    fontSize: 11,
    color: COLORS.purpleNeon,
    fontWeight: '600',
    backgroundColor: 'rgba(191,133,252,0.12)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },

  // 예산 (compact)
  optBudgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  optCurrencyChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  optCurrencyChipActive: {
    backgroundColor: COLORS.purpleDeep,
    borderColor: COLORS.purpleNeon,
  },
  optCurrencyTxt:       { fontSize: 12, fontWeight: '700', color: COLORS.textDim },
  optCurrencyTxtActive: { color: COLORS.white },
  optBudgetInput: {
    flex: 1,
    minWidth: 80,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.divider,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  // 날씨 / 직항 공통 칩 행
  optChipRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  optSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.divider,
    gap: 4,
  },
  optSmallBtnActive: {
    backgroundColor: COLORS.purpleDeep,
    borderColor: COLORS.purpleNeon,
  },
  optSmallEmoji: { fontSize: 14 },
  optSmallTxt:       { fontSize: 12, color: COLORS.textDim, fontWeight: '500' },
  optSmallTxtActive: { color: COLORS.white, fontWeight: '600' },

  // 직항/경유 버튼
  optFlightBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  optFlightBtnActive: {
    backgroundColor: COLORS.purpleDeep,
    borderColor: COLORS.purpleNeon,
  },
  optFlightTxt:       { fontSize: 13, fontWeight: '600', color: COLORS.textDim },
  optFlightTxtActive: { color: COLORS.white },

  // 여행 키워드
  // 키워드 인풋 박스 (태그 + 입력 인라인)
  kwInputBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.divider,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
    minHeight: 42,
  },
  kwHint: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  kwTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.35)',
  },
  kwTagTxt: { fontSize: 13, color: COLORS.purpleNeon, fontWeight: '600' },
  kwTagDel: { fontSize: 11, color: 'rgba(191,133,252,0.6)' },
  kwInlineInput: {
    fontSize: 13,
    color: COLORS.white,
    padding: 0,
    minWidth: 80,
    flex: 1,
  },

  keywordWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  keywordChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  keywordChipActive: {
    backgroundColor: COLORS.purpleDeep,
    borderColor: COLORS.purpleNeon,
  },
  keywordTxt:       { fontSize: 12, color: COLORS.textDim, fontWeight: '500' },
  keywordTxtActive: { color: COLORS.white, fontWeight: '600' },

  // (비공개 모달 스타일은 pm 객체로 분리됨)

  // ── 기타 통화 모달 ──
  currModalSheet: {
    backgroundColor: '#1E1E2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(191,133,252,0.2)',
  },
  currModalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#3A3A55',
    alignSelf: 'center',
    marginBottom: 16,
  },
  currModalTitle: {
    fontSize: 16, fontWeight: '700', color: COLORS.white,
    textAlign: 'center', marginBottom: 14,
  },
  currModalSearchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.bg,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.divider,
    paddingHorizontal: 12, paddingVertical: 8, gap: 8, marginBottom: 10,
  },
  currModalSearchInput: {
    flex: 1, fontSize: 13, color: COLORS.white, padding: 0,
  },
  currModalItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, gap: 12,
  },
  currModalItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  currModalCode: {
    fontSize: 14, fontWeight: '700', color: COLORS.white, width: 44,
  },
  currModalName: {
    flex: 1, fontSize: 13, color: COLORS.textDim,
  },
  currModalCheck: {
    fontSize: 15, color: COLORS.purpleNeon, fontWeight: '700',
  },

  // ── 기간 자동 불러오기 ──
  autoLoadBtn: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  autoLoadBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.purpleNeon,
  },

  // 모달 전체 배경
  alOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  alSheet: {
    backgroundColor: '#1E1E2E',
    borderRadius: 20,
    padding: 24,
  },

  // 로딩
  alLoadingBox: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  alLoadingText: {
    fontSize: 14,
    color: COLORS.textDim,
    textAlign: 'center',
  },

  // 제목
  alTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 20,
  },

  // 날짜 범위
  alDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 14,
  },
  alDateBox: {
    alignItems: 'center',
    gap: 4,
  },
  alDateLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  alDateValue: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
  alDateArrow: {
    fontSize: 16,
    color: COLORS.textMuted,
  },

  // 날짜 수정 버튼
  alEditDateBtn: {
    alignSelf: 'center',
    backgroundColor: 'rgba(191,133,252,0.12)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 12,
  },
  alEditDateText: {
    fontSize: 13,
    color: COLORS.purpleNeon,
    fontWeight: '600',
  },

  // 안내 문구
  alHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 20,
  },

  // 버튼 행
  alBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  alCancelBtn: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  alCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDim,
  },
  alConfirmBtn: {
    flex: 2,
    backgroundColor: COLORS.purpleDeep,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  alConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },

  // 토스트
  alToast: {
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    backgroundColor: 'rgba(30,30,46,0.96)',
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.3)',
  },
  alToastText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '500',
  },
  draggableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: '#1A1A26',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  draggableRowActive: {
    backgroundColor: 'rgba(191,133,252,0.12)',
    borderColor: '#BF85FC',
    shadowColor: '#BF85FC',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    transform: [{ scale: 1.02 }],
  },
  dragHandle: {
    paddingRight: 12,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  draggableRowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  draggableRowFlag: {
    fontSize: 20,
  },
  draggableRowName: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  representativeTag: {
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
  },
  representativeTagText: {
    fontSize: 10,
    color: '#BF85FC',
    fontWeight: '700',
  },
  draggableRemoveBtn: {
    paddingHorizontal: 8,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  draggableRemoveText: {
    fontSize: 14,
    color: '#A1A1B0',
  },
  draggableHelperText: {
    fontSize: 12,
    color: '#A1A1B0',
    marginTop: 4,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  numberBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(191,133,252,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberBadgeText: {
    fontSize: 11,
    color: '#BF85FC',
    fontWeight: '700',
  },
  mediaThumbActive: {
    borderColor: '#BF85FC',
    borderWidth: 1.5,
    borderRadius: 12,
    shadowColor: '#BF85FC',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    transform: [{ scale: 1.05 }],
  },
});

// ─── 드래그 앤 드롭 국가 리스트 컴포넌트 ───
const DragHandleIcon = ({ size = 20, color = '#A1A1B0' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 8h16M4 16h16" stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

interface DraggableCountryListProps {
  countries: { flag: string; name: string }[];
  onReorder: (newCountries: { flag: string; name: string }[]) => void;
  onRemove: (name: string) => void;
  onDragStateChange?: (isDragging: boolean) => void;
}

function DraggableRow({
  c,
  i,
  dragIndex,
  hoverIndex,
  dragY,
  ITEM_HEIGHT,
  onDragStart,
  onDragMove,
  onDragEnd,
  onRemove,
}: {
  c: { flag: string; name: string };
  i: number;
  dragIndex: number | null;
  hoverIndex: number | null;
  dragY: number;
  ITEM_HEIGHT: number;
  onDragStart: (idx: number) => void;
  onDragMove: (dy: number) => void;
  onDragEnd: (idx: number) => void;
  onRemove: (name: string) => void;
}) {
  const latestProps = useRef({ i, onDragStart, onDragMove, onDragEnd });
  useEffect(() => {
    latestProps.current = { i, onDragStart, onDragMove, onDragEnd };
  }, [i, onDragStart, onDragMove, onDragEnd]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        latestProps.current.onDragStart(latestProps.current.i);
      },
      onPanResponderMove: (evt, gestureState) => {
        latestProps.current.onDragMove(gestureState.dy);
      },
      onPanResponderRelease: () => {
        latestProps.current.onDragEnd(latestProps.current.i);
      },
      onPanResponderTerminate: () => {
        latestProps.current.onDragEnd(latestProps.current.i);
      },
    })
  ).current;

  let top = i * ITEM_HEIGHT;
  let zIndex = 1;
  const isDragging = i === dragIndex;

  if (dragIndex !== null) {
    if (isDragging) {
      top = i * ITEM_HEIGHT + dragY;
      zIndex = 10;
    } else {
      const activeHover = hoverIndex !== null ? hoverIndex : dragIndex;
      if (dragIndex < activeHover) {
        if (i > dragIndex && i <= activeHover) {
          top = (i - 1) * ITEM_HEIGHT;
        }
      } else if (dragIndex > activeHover) {
        if (i < dragIndex && i >= activeHover) {
          top = (i + 1) * ITEM_HEIGHT;
        }
      }
    }
  }

  return (
    <Animated.View
      style={[
        s.draggableRow,
        {
          position: 'absolute',
          left: 0,
          right: 0,
          top: top,
          height: ITEM_HEIGHT - 8,
          zIndex: zIndex,
        },
        isDragging && s.draggableRowActive,
      ]}
    >
      {/* Drag Handle */}
      <View {...panResponder.panHandlers} style={s.dragHandle}>
        <DragHandleIcon size={20} color={isDragging ? COLORS.purpleNeon : COLORS.textDim} />
      </View>

      {/* Flag and Name with Order Index Number */}
      <View style={s.draggableRowContent}>
        <View style={s.numberBadge}>
          <Text style={s.numberBadgeText}>{i + 1}</Text>
        </View>
        <Text style={s.draggableRowFlag}>{c.flag}</Text>
        <Text style={s.draggableRowName}>{c.name}</Text>
        {i === 0 && (
          <View style={s.representativeTag}>
            <Text style={s.representativeTagText}>대표</Text>
          </View>
        )}
      </View>

      {/* Delete Button */}
      <TouchableOpacity
        onPress={() => onRemove(c.name)}
        style={s.draggableRemoveBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={s.draggableRemoveText}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function DraggableCountryList({ countries, onReorder, onRemove, onDragStateChange }: DraggableCountryListProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const prevHoverIndex = useRef<number | null>(null);

  const ITEM_HEIGHT = 56;

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
    setDragY(0);
    setHoverIndex(index);
    prevHoverIndex.current = index;
    onDragStateChange?.(true);
  }, [onDragStateChange]);

  const handleDragMove = useCallback((dy: number) => {
    if (dragIndex === null) return;
    setDragY(dy);
    const calculatedHover = Math.max(
      0,
      Math.min(countries.length - 1, dragIndex + Math.round(dy / ITEM_HEIGHT))
    );
    if (calculatedHover !== prevHoverIndex.current) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setHoverIndex(calculatedHover);
      prevHoverIndex.current = calculatedHover;
    }
  }, [dragIndex, countries.length]);

  const handleDragEnd = useCallback((index: number) => {
    const finalHover = prevHoverIndex.current !== null ? prevHoverIndex.current : index;
    if (finalHover !== index) {
      const updated = [...countries];
      const [moved] = updated.splice(index, 1);
      updated.splice(finalHover, 0, moved);
      onReorder(updated);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDragIndex(null);
    setDragY(0);
    setHoverIndex(null);
    prevHoverIndex.current = null;
    onDragStateChange?.(false);
  }, [countries, onReorder, onDragStateChange]);

  return (
    <View style={{ height: countries.length * ITEM_HEIGHT, position: 'relative', marginVertical: 8 }}>
      {countries.map((c, idx) => (
        <DraggableRow
          key={c.name}
          c={c}
          i={idx}
          dragIndex={dragIndex}
          hoverIndex={hoverIndex}
          dragY={dragY}
          ITEM_HEIGHT={ITEM_HEIGHT}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onRemove={onRemove}
        />
      ))}
    </View>
  );
}

// ─── 드래그 앤 드롭 사진 그리드 컴포넌트 ───
interface DraggablePhotoGridProps {
  medias: string[];
  mediaPrivacy: Record<number, string[]>;
  onReorder: (fromIdx: number, toIdx: number) => void;
  onRemove: (index: number) => void;
  onOpenPrivacyModal: (index: number) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  THUMB_SIZE: number;
  representativePhoto: string | null;
  onSetRepresentative: (uri: string) => void;
}

function DraggablePhotoThumb({
  uri,
  idx,
  mediaPrivacy,
  dragIndex,
  hoverIndex,
  dragX,
  dragY,
  CELL_SIZE,
  THUMB_SIZE,
  onDragStart,
  onDragMove,
  onDragEnd,
  onRemove,
  onOpenPrivacyModal,
  representativePhoto,
  onSetRepresentative,
}: {
  uri: string;
  idx: number;
  mediaPrivacy: Record<number, string[]>;
  dragIndex: number | null;
  hoverIndex: number | null;
  dragX: number;
  dragY: number;
  CELL_SIZE: number;
  THUMB_SIZE: number;
  onDragStart: (index: number) => void;
  onDragMove: (dx: number, dy: number) => void;
  onDragEnd: (index: number) => void;
  onRemove: (index: number) => void;
  onOpenPrivacyModal: (index: number) => void;
  representativePhoto: string | null;
  onSetRepresentative: (uri: string) => void;
}) {
  const isDragging = idx === dragIndex;
  const isLocked = (mediaPrivacy[idx]?.length ?? 0) > 0;

  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const startCoords = useRef({ x: 0, y: 0 });
  const hasStartedDrag = useRef(false);

  const latestProps = useRef({ idx, onDragStart, onDragMove, onDragEnd });
  useEffect(() => {
    latestProps.current = { idx, onDragStart, onDragMove, onDragEnd };
  }, [idx, onDragStart, onDragMove, onDragEnd]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        startCoords.current = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY };
        hasStartedDrag.current = false;
        
        longPressTimer.current = setTimeout(() => {
          hasStartedDrag.current = true;
          latestProps.current.onDragStart(latestProps.current.idx);
        }, 250);
      },
      onPanResponderMove: (evt, gestureState) => {
        if (!hasStartedDrag.current) {
          const dx = evt.nativeEvent.pageX - startCoords.current.x;
          const dy = evt.nativeEvent.pageY - startCoords.current.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > 10) {
            if (longPressTimer.current) {
              clearTimeout(longPressTimer.current);
              longPressTimer.current = null;
            }
          }
        } else {
          latestProps.current.onDragMove(gestureState.dx, gestureState.dy);
        }
      },
      onPanResponderRelease: () => {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
        if (hasStartedDrag.current) {
          latestProps.current.onDragEnd(latestProps.current.idx);
        }
      },
      onPanResponderTerminate: () => {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
        if (hasStartedDrag.current) {
          latestProps.current.onDragEnd(latestProps.current.idx);
        }
      },
    })
  ).current;

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  let left = (idx % 3) * CELL_SIZE;
  let top = Math.floor(idx / 3) * CELL_SIZE;
  let zIndex = 1;

  if (dragIndex !== null) {
    if (isDragging) {
      left = (idx % 3) * CELL_SIZE + dragX;
      top = Math.floor(idx / 3) * CELL_SIZE + dragY;
      zIndex = 10;
    } else {
      const activeHover = hoverIndex !== null ? hoverIndex : dragIndex;
      if (dragIndex < activeHover) {
        if (idx > dragIndex && idx <= activeHover) {
          const shiftedIdx = idx - 1;
          left = (shiftedIdx % 3) * CELL_SIZE;
          top = Math.floor(shiftedIdx / 3) * CELL_SIZE;
        }
      } else if (dragIndex > activeHover) {
        if (idx < dragIndex && idx >= activeHover) {
          const shiftedIdx = idx + 1;
          left = (shiftedIdx % 3) * CELL_SIZE;
          top = Math.floor(shiftedIdx / 3) * CELL_SIZE;
        }
      }
    }
  }

  return (
    <Animated.View
      style={[
        s.mediaThumbWrap,
        {
          position: 'absolute',
          left: left,
          top: top,
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          zIndex: zIndex,
        },
        isDragging && s.mediaThumbActive,
      ]}
      {...panResponder.panHandlers}
    >
      <Image source={{ uri }} style={s.mediaThumb} />

      {isLocked && <View style={s.mediaLockedOverlay} />}

      {!isDragging && (
        <TouchableOpacity
          style={s.mediaRemoveBtn}
          onPress={() => onRemove(idx)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={s.mediaRemoveTxt}>×</Text>
        </TouchableOpacity>
      )}

      {!isDragging && (
        <TouchableOpacity
          style={[s.mediaLockBtn, isLocked && s.mediaLockBtnActive]}
          onPress={() => onOpenPrivacyModal(idx)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {isLocked ? <LockClosedIcon size={12} color={COLORS.white} /> : <LockOpenIcon size={12} color={COLORS.white} />}
        </TouchableOpacity>
      )}

      {!isDragging && (
        <TouchableOpacity
          style={[s.mediaRepBtn, uri === representativePhoto && s.mediaRepBtnActive]}
          onPress={() => onSetRepresentative(uri)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.8}
        >
          <Text style={[s.mediaRepTxt, uri === representativePhoto && s.mediaRepTxtActive]}>
            {uri === representativePhoto ? '★ 지도대표' : '대표 설정'}
          </Text>
        </TouchableOpacity>
      )}

      {!isDragging && isLocked && (
        <View style={s.privacyCountBadge}>
          <Text style={s.privacyCountTxt}>{mediaPrivacy[idx].length}명</Text>
        </View>
      )}
    </Animated.View>
  );
}

function DraggablePhotoGrid({
  medias,
  mediaPrivacy,
  onReorder,
  onRemove,
  onOpenPrivacyModal,
  onDragStateChange,
  THUMB_SIZE,
  representativePhoto,
  onSetRepresentative,
}: DraggablePhotoGridProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const prevHoverIndex = useRef<number | null>(null);

  const GAP = 8;
  const CELL_SIZE = THUMB_SIZE + GAP;

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
    setDragX(0);
    setDragY(0);
    setHoverIndex(index);
    prevHoverIndex.current = index;
    onDragStateChange?.(true);
  }, [onDragStateChange]);

  const handleDragMove = useCallback((dx: number, dy: number) => {
    if (dragIndex === null) return;
    setDragX(dx);
    setDragY(dy);

    const startX = (dragIndex % 3) * CELL_SIZE;
    const startY = Math.floor(dragIndex / 3) * CELL_SIZE;

    const currentX = startX + dx;
    const currentY = startY + dy;

    const col = Math.max(0, Math.min(2, Math.round(currentX / CELL_SIZE)));
    const row = Math.max(0, Math.min(Math.ceil(medias.length / 3) - 1, Math.round(currentY / CELL_SIZE)));

    const calculatedHover = Math.max(0, Math.min(medias.length - 1, row * 3 + col));

    if (calculatedHover !== prevHoverIndex.current) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setHoverIndex(calculatedHover);
      prevHoverIndex.current = calculatedHover;
    }
  }, [dragIndex, medias.length, CELL_SIZE]);

  const handleDragEnd = useCallback((index: number) => {
    const finalHover = prevHoverIndex.current !== null ? prevHoverIndex.current : index;
    if (finalHover !== index) {
      onReorder(index, finalHover);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDragIndex(null);
    setDragX(0);
    setDragY(0);
    setHoverIndex(null);
    prevHoverIndex.current = null;
    onDragStateChange?.(false);
  }, [onReorder, onDragStateChange]);

  const numRows = Math.ceil(medias.length / 3);

  return (
    <View style={{ height: numRows * CELL_SIZE, position: 'relative', marginTop: 12 }}>
      {medias.map((uri, idx) => (
        <DraggablePhotoThumb
          key={uri + '_' + idx}
          uri={uri}
          idx={idx}
          mediaPrivacy={mediaPrivacy}
          dragIndex={dragIndex}
          hoverIndex={hoverIndex}
          dragX={dragX}
          dragY={dragY}
          CELL_SIZE={CELL_SIZE}
          THUMB_SIZE={THUMB_SIZE}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onRemove={onRemove}
          onOpenPrivacyModal={onOpenPrivacyModal}
          representativePhoto={representativePhoto}
          onSetRepresentative={onSetRepresentative}
        />
      ))}
    </View>
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

// ─── 앱 친구 선택 모달 스타일 ───
const fp = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1A1A28',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 36,
    maxHeight: '65%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4A4A59',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
  list: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
    marginBottom: 4,
  },
  rowActive: {
    backgroundColor: 'rgba(107,33,168,0.15)',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarActive: {
    backgroundColor: COLORS.purpleDeep,
  },
  avatarTxt: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDim,
  },
  name: {
    flex: 1,
    fontSize: 15,
    color: COLORS.white,
    fontWeight: '500',
  },
  nameActive: {
    color: COLORS.purpleNeon,
    fontWeight: '600',
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkActive: {
    backgroundColor: COLORS.purpleNeon,
    borderColor: COLORS.purpleNeon,
  },
  checkMark: {
    fontSize: 12,
    color: COLORS.white,
    fontWeight: '800',
  },
  doneBtn: {
    backgroundColor: COLORS.purpleDeep,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  doneTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },
});

// ─── 미디어 선택 모달 스타일 ───
const PICKER_CELL = Math.floor((Dimensions.get('window').width - 6) / 3);
const mpStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  cancelText: {
    fontSize: 15,
    color: COLORS.textDim,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.purpleNeon,
  },
  infoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(107,33,168,0.15)',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  infoText: {
    fontSize: 13,
    color: COLORS.textDim,
  },
  countText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.purpleNeon,
  },
  gridContent: {
    paddingTop: 2,
  },
  cell: {
    width: PICKER_CELL,
    height: PICKER_CELL,
    margin: 1,
    position: 'relative',
  },
  cellImage: {
    width: '100%',
    height: '100%',
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(191,133,252,0.3)',
  },
  checkbox: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: COLORS.purpleNeon,
    borderColor: COLORS.purpleNeon,
  },
  checkmark: {
    fontSize: 13,
    color: COLORS.white,
    fontWeight: 'bold',
  },
  videoBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  videoBadgeText: {
    fontSize: 10,
    color: COLORS.white,
  },
});
