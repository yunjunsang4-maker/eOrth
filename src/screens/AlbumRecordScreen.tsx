import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Modal,
  Animated,
  PanResponder,
  Alert,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useRecords } from '../store/recordStore';
import { COUNTRIES } from '../constants/countries';
import { StickerPicker } from '../components/StickerPicker';
import { Sticker } from '../components/stickers';
import {
  PencilIcon, TrashIcon, GalleryIcon, CameraIcon, CalendarIcon, PaletteIcon, StickerIcon,
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
  PlaneIcon as SvgPlaneIcon,
} from '../components/icons';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const CELL = Math.floor((screenWidth - 48 - 12) / 7);
const WEEK_DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTH_NAMES = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

const CANVAS_PAD = 16;
const CANVAS_W = screenWidth - CANVAS_PAD * 2;
const CANVAS_H = CANVAS_W * 1.3;

// ─── 타입 ───
type ElemType = 'photo' | 'sticker' | 'text';
type FrameShape = 'rect' | 'rounded' | 'circle';

interface CanvasElement {
  id: string;
  type: ElemType;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  rotation: number;
  zIndex: number;
  opacity: number;
  uri?: string;
  frameShape?: FrameShape;
  borderColor?: string;
  borderWidth?: number;
  sticker?: string;
  stickerSize?: number;
  svgStickerId?: string;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textAlign?: 'left' | 'center' | 'right';
  textBgColor?: string;
}

interface AlbumPage {
  id: string;
  bgColor: string;
  elements: CanvasElement[];
}

// ─── 상수 ───
const COLORS = {
  bg: '#0A0A0F',
  panel: '#16161F',
  panel2: '#1C1C26',
  card: '#2E2E3B',
  border: 'rgba(255,255,255,0.06)',
  purpleNeon: '#BF85FC',
  neonBright: '#C084FC',
  purpleDeep: '#6B21A8',
  white: '#FFFFFF',
  text: '#F5F3FF',
  textDim: '#8B8794',
  textFaint: '#5C5868',
  divider: '#1A1A26',
  red: '#FF3B30',
  success: '#6BFFA0',
  danger: '#FF8C8C',
  polaroidBg: '#F5EBD9',
};

// ─── SVG 아이콘 래퍼 ───
const IC = COLORS.purpleNeon;

const SoloIcon = ({ color = IC }: { color?: string }) => <SvgSoloIcon size={16} color={color} />;
const FriendIcon = ({ color = IC }: { color?: string }) => <SvgFriendIcon size={16} color={color} />;
const CoupleIcon = ({ color = IC }: { color?: string }) => <SvgCoupleIcon size={16} color={color} />;
const FamilyIcon = ({ color = IC }: { color?: string }) => <SvgFamilyIcon size={16} color={color} />;
const ParentIcon = ({ color = IC }: { color?: string }) => <SvgParentIcon size={16} color={color} />;
const SiblingIcon = ({ color = IC }: { color?: string }) => <SvgSiblingIcon size={16} color={color} />;
const CoinIcon = ({ size = 18, color = IC }: { size?: number; color?: string }) => <SvgCoinIcon size={size} color={color} />;
const TagIcon = ({ size = 18, color = IC }: { size?: number; color?: string }) => <SvgTagIcon size={size} color={color} />;
const TakeoffIcon = ({ size = 14, color = IC }: { size?: number; color?: string }) => <SvgTakeoffIcon size={size} color={color} />;
const TransferIcon = ({ size = 14, color = IC }: { size?: number; color?: string }) => <SvgTransferIcon size={size} color={color} />;
const WeatherIcon = ({ size = 18, color = IC }: { size?: number; color?: string }) => <SvgWeatherIcon size={size} />;
const PlaneIcon = ({ size = 18, color = IC }: { size?: number; color?: string }) => <SvgPlaneIcon size={size} color={color} />;
const SunIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => <SvgSunIcon size={size} color={color} />;
const CloudyIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => <SvgCloudyIcon size={size} color={color} />;
const RainIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => <SvgRainIcon size={size} color={color} />;
const SnowIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => <SvgSnowIcon size={size} color={color} />;
const PartlyCloudyIcon = ({ size = 16 }: { size?: number; color?: string }) => <SvgPartlyCloudyIcon size={size} />;
const WindIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => <SvgWindIcon size={size} color={color} />;

const COMPANION_ICONS: Record<string, (color: string) => React.ReactNode> = {
  '혼자': (c) => <SoloIcon color={c} />,
  '친구': (c) => <FriendIcon color={c} />,
  '연인': (c) => <CoupleIcon color={c} />,
  '가족': (c) => <FamilyIcon color={c} />,
  '부모님': (c) => <ParentIcon color={c} />,
  '형제': (c) => <SiblingIcon color={c} />,
};

const WEATHER_ICON_MAP: Record<string, React.ReactNode> = {
  '맑음':     <SunIcon size={16} />,
  '부분흐림': <PartlyCloudyIcon size={16} />,
  '흐림':     <CloudyIcon size={16} />,
  '비':       <RainIcon size={16} />,
  '눈':       <SnowIcon size={16} />,
  '바람':     <WindIcon size={16} />,
};

const DEFAULT_COMPANIONS = ['혼자', '친구', '연인', '가족', '부모님', '형제'];

const WEATHER_OPTIONS = [
  { label: '☀️ 맑음',     value: '맑음' },
  { label: '🌤️ 부분흐림', value: '부분흐림' },
  { label: '⛅ 흐림',     value: '흐림' },
  { label: '🌧️ 비',       value: '비' },
  { label: '❄️ 눈',       value: '눈' },
  { label: '💨 바람',     value: '바람' },
];

const FLIGHT_OPTIONS = ['직항', '경유'];
const CURRENCIES = ['KRW', 'JPY', 'USD'];
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
];

const DUMMY_FRIENDS = ['김민수', '이서연', '박준호', '최유진', '정하늘'];

const STICKER_CATEGORIES = [
  { name: '여행', items: ['✈️','🧳','🗺️','🏖️','🏔️','🚗','🚂','⛵','🎒','🧭','🌍','🗼','🗽','🏰','⛩️','🕌','🛫','🛬','🚀','🪂'] },
  { name: '자연', items: ['🌸','🌺','🌻','🌴','🍀','🌈','⭐','🌙','☀️','❄️','🦋','🌊','🍃','🌿','🏵️','🌾','🍁','🌲','🔥','💧'] },
  { name: '음식', items: ['🍕','🍔','🍣','🍜','🍦','🍰','🍷','🍸','☕','🧁','🍩','🥐','🍱','🥗','🍫','🧋','🍇','🍓','🥂','🫖'] },
  { name: '하트', items: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💖','💝','💕','💞','💓','💗','💘','🥰','😍','💌','💐','🫶'] },
  { name: '축하', items: ['🎉','🎊','🎈','🎀','🎁','🥳','🎆','🎇','✨','🎵','🎶','🎭','🎪','🪅','🎄','🧨','🏆','🥇','🎯','🪩'] },
  { name: '동물', items: ['🐶','🐱','🦊','🐻','🐼','🦄','🐬','🦜','🦋','🐢','🐙','🦀','🐠','🦩','🐘','🦒','🐧','🦔','🦥','🐾'] },
  { name: '기호', items: ['💎','👑','🔮','🌟','💫','🎨','📸','📷','🎥','🎬','📍','🏷️','💌','🪄','🎠','🎡','🗝️','🪞','🧿','🫧'] },
  { name: '데코', items: ['🎗️','🏳️‍🌈','🔶','🔷','🟡','🟢','🟣','⬛','⬜','🔲','🔳','▪️','▫️','◾','◽','♦️','♣️','♠️','♥️','🃏'] },
];

const TEXT_COLORS = [
  '#FFFFFF','#000000','#FF3B30','#FF9500','#FFCC00','#34C759',
  '#5AC8FA','#007AFF','#5856D6','#AF52DE','#FF2D55','#BF85FC',
  '#E8E8E8','#8E8E93','#FF6B6B','#FFA07A','#FFD700','#90EE90',
  '#87CEEB','#6495ED','#9370DB','#DDA0DD','#FFB6C1','#F0E68C',
];

const FONT_OPTIONS = [
  { label: '기본', value: Platform.OS === 'ios' ? 'System' : 'sans-serif' },
  { label: '세리프', value: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  { label: '모노', value: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  { label: '둥근', value: Platform.OS === 'ios' ? 'Avenir-Light' : 'sans-serif-light' },
  { label: '굵은', value: Platform.OS === 'ios' ? 'Avenir-Black' : 'sans-serif-condensed' },
];

const PAGE_BACKGROUNDS = [
  '#1A1A2E','#0A0A0F','#FFFFFF','#F5F5DC','#2C2C54','#1B1464',
  '#3B3B98','#E74C3C','#E8DAEF','#D5F5E3','#FDEBD0','#F9EBEA',
  '#1C1C1C','#2D132C','#192A56','#0C7B93','#00B894','#6C5CE7',
  '#FD79A8','#FDCB6E','#55E6C1','#CAD3C8','#303952','#574B90',
];

const PHOTO_BORDERS = [
  { label: '없음', color: 'transparent', width: 0 },
  { label: '흰색', color: '#FFFFFF', width: 4 },
  { label: '검정', color: '#000000', width: 4 },
  { label: '보라', color: '#BF85FC', width: 3 },
  { label: '금색', color: '#FFD700', width: 3 },
  { label: '빨강', color: '#FF3B30', width: 3 },
  { label: '파랑', color: '#007AFF', width: 3 },
  { label: '폴라로이드', color: '#FFFFFF', width: 12 },
];

let _elemIdCounter = 0;
function genId() { return `el_${++_elemIdCounter}_${Date.now()}`; }
function genPageId() { return `pg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }

// ─── 헬퍼 ───
function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function sameDay(a: Date, b: Date) { return toKey(a) === toKey(b); }
function isBefore(a: Date, b: Date) { return toKey(a) < toKey(b); }
function parseDS(s: string): Date {
  const [y, m, d] = s.split('.').map(Number);
  const dt = new Date(y, m - 1, d); dt.setHours(0, 0, 0, 0); return dt;
}
function formatDate(d: Date) {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
function getTodayString(): string {
  const now = new Date();
  return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
}

// ══════════════════════════════════════════════
// 기간 선택 캘린더 모달
// ══════════════════════════════════════════════
function RangePickerModal({ visible, initialStart, initialEnd, onConfirm, onClose }: {
  visible: boolean; initialStart: Date; initialEnd: Date;
  onConfirm: (s: Date, e: Date) => void; onClose: () => void;
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [viewYear, setViewYear] = useState(initialStart.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialStart.getMonth());
  const [tempStart, setTempStart] = useState<Date | null>(initialStart);
  const [tempEnd, setTempEnd] = useState<Date | null>(initialEnd);
  const [selectingEnd, setSelectingEnd] = useState(false);
  const translateY = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    if (visible) {
      setTempStart(initialStart); setTempEnd(initialEnd); setSelectingEnd(false);
      setViewYear(initialStart.getFullYear()); setViewMonth(initialStart.getMonth());
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }).start();
    } else { translateY.setValue(600); }
  }, [visible]);

  const grid = useCallback(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const days = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= days; d++) { const dt = new Date(viewYear, viewMonth, d); dt.setHours(0, 0, 0, 0); cells.push(dt); }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  const handleDay = (date: Date) => {
    if (!selectingEnd) { setTempStart(date); setTempEnd(null); setSelectingEnd(true); }
    else {
      if (isBefore(date, tempStart!)) { setTempStart(date); setTempEnd(null); }
      else { setTempEnd(date); setSelectingEnd(false); }
    }
  };

  const isInRange = (d: Date) => tempStart && tempEnd ? !isBefore(d, tempStart) && !isBefore(tempEnd, d) : false;
  const fmtSel = (d: Date | null) => d ? formatDate(d) : '—';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ ...StyleSheet.absoluteFillObject }} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[rpSt.sheet, { transform: [{ translateY }] }]}>
          <View style={rpSt.handle} />
          <View style={rpSt.selectedRow}>
            <View style={rpSt.selectedItem}>
              <Text style={rpSt.selectedLabel}>시작일</Text>
              <Text style={[rpSt.selectedDate, !selectingEnd && rpSt.selectedDateActive]}>{fmtSel(tempStart)}</Text>
            </View>
            <Text style={rpSt.arrow}>→</Text>
            <View style={rpSt.selectedItem}>
              <Text style={rpSt.selectedLabel}>종료일</Text>
              <Text style={[rpSt.selectedDate, selectingEnd && rpSt.selectedDateActive]}>{fmtSel(tempEnd)}</Text>
            </View>
          </View>
          <View style={rpSt.monthNav}>
            <TouchableOpacity onPress={() => viewMonth === 0 ? (setViewMonth(11), setViewYear(y => y - 1)) : setViewMonth(m => m - 1)} style={rpSt.navBtn}><Text style={rpSt.navArrow}>‹</Text></TouchableOpacity>
            <Text style={rpSt.monthTitle}>{viewYear}년 {MONTH_NAMES[viewMonth]}</Text>
            <TouchableOpacity onPress={() => viewMonth === 11 ? (setViewMonth(0), setViewYear(y => y + 1)) : setViewMonth(m => m + 1)} style={rpSt.navBtn}><Text style={rpSt.navArrow}>›</Text></TouchableOpacity>
          </View>
          <View style={rpSt.weekRow}>
            {WEEK_DAYS.map((d, i) => (
              <Text key={d} style={[rpSt.weekDay, { width: CELL }, i === 0 && { color: '#FF6B6B' }, i === 6 && { color: '#5B9BD5' }]}>{d}</Text>
            ))}
          </View>
          <View style={rpSt.grid}>
            {grid().map((date, idx) => {
              if (!date) return <View key={`e-${idx}`} style={{ width: CELL, height: CELL }} />;
              const isStart = !!tempStart && sameDay(date, tempStart);
              const isEnd = !!tempEnd && sameDay(date, tempEnd);
              const isEdge = isStart || isEnd;
              const inRange = isInRange(date);
              const dow = date.getDay();
              return (
                <TouchableOpacity key={toKey(date)} onPress={() => handleDay(date)} activeOpacity={0.7}
                  style={[rpSt.dayCell, { width: CELL, height: CELL }, inRange && !isEdge && rpSt.inRange, isEdge && rpSt.edgeCell]}>
                  <Text style={[rpSt.dayText,
                    dow === 0 && !isEdge && { color: '#FF6B6B' },
                    dow === 6 && !isEdge && { color: '#5B9BD5' },
                    isEdge && { color: '#fff', fontWeight: '700' },
                  ]}>{date.getDate()}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity style={rpSt.confirmBtn} onPress={() => { onConfirm(tempStart ?? today, tempEnd ?? tempStart ?? today); onClose(); }} activeOpacity={0.85}>
            <Text style={rpSt.confirmText}>확인</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const rpSt = StyleSheet.create({
  sheet: { backgroundColor: '#13102A', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingBottom: 32, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(191,133,252,0.2)' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A3A55', alignSelf: 'center', marginBottom: 16 },
  selectedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 12 },
  selectedItem: { alignItems: 'center', gap: 4 },
  selectedLabel: { fontSize: 11, color: '#A1A1B0', fontWeight: '600' },
  selectedDate: { fontSize: 14, color: '#A1A1B0', fontWeight: '600' },
  selectedDateActive: { color: '#BF85FC', fontSize: 15 },
  arrow: { fontSize: 16, color: '#A1A1B0' },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  navBtn: { padding: 8 },
  navArrow: { fontSize: 22, color: '#fff' },
  monthTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekDay: { textAlign: 'center', fontSize: 12, color: '#A1A1B0', paddingVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { alignItems: 'center', justifyContent: 'center' },
  inRange: { backgroundColor: 'rgba(107,33,168,0.25)' },
  edgeCell: { backgroundColor: '#6B21A8', borderRadius: CELL / 2 },
  dayText: { fontSize: 14, color: '#E0E0EF' },
  confirmBtn: { backgroundColor: '#6B21A8', borderRadius: 14, height: 50, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

// ══════════════════════════════════════════════
// 드래그 가능한 캔버스 요소
// ══════════════════════════════════════════════
function DraggableItem({
  element, isSelected, onSelect, onMove, onRotate, onScale,
}: {
  element: CanvasElement;
  isSelected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onRotate: (rotation: number) => void;
  onScale: (scale: number) => void;
}) {
  const posRef = useRef({ x: element.x, y: element.y });
  const rotRef = useRef(element.rotation);
  const scaleRef = useRef(element.scale);
  const onSelectRef = useRef(onSelect);
  const onMoveRef = useRef(onMove);
  const onRotateRef = useRef(onRotate);
  const onScaleRef = useRef(onScale);
  const isTwoFinger = useRef(false);
  const startAngle = useRef(0);
  const startDist = useRef(0);

  useEffect(() => { posRef.current = { x: element.x, y: element.y }; }, [element.x, element.y]);
  useEffect(() => { rotRef.current = element.rotation; }, [element.rotation]);
  useEffect(() => { scaleRef.current = element.scale; }, [element.scale]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onMoveRef.current = onMove; }, [onMove]);
  useEffect(() => { onRotateRef.current = onRotate; }, [onRotate]);
  useEffect(() => { onScaleRef.current = onScale; }, [onScale]);

  const getAngle = (touches: any[]) => {
    const dx = touches[1].pageX - touches[0].pageX;
    const dy = touches[1].pageY - touches[0].pageY;
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  };

  const getDist = (touches: any[]) => {
    const dx = touches[1].pageX - touches[0].pageX;
    const dy = touches[1].pageY - touches[0].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 3 || Math.abs(gs.dy) > 3,
      onMoveShouldSetPanResponderCapture: (_, gs) => Math.abs(gs.dx) > 3 || Math.abs(gs.dy) > 3,
      onPanResponderGrant: (evt) => {
        onSelectRef.current();
        isTwoFinger.current = false;
        if (evt.nativeEvent.touches.length >= 2) {
          isTwoFinger.current = true;
          startAngle.current = getAngle(evt.nativeEvent.touches);
          startDist.current = getDist(evt.nativeEvent.touches);
        }
      },
      onPanResponderMove: (evt, gs) => {
        if (evt.nativeEvent.touches.length >= 2) {
          if (!isTwoFinger.current) {
            isTwoFinger.current = true;
            startAngle.current = getAngle(evt.nativeEvent.touches);
            startDist.current = getDist(evt.nativeEvent.touches);
            return;
          }
          // 회전
          const currentAngle = getAngle(evt.nativeEvent.touches);
          const angleDelta = currentAngle - startAngle.current;
          const newRot = (rotRef.current + angleDelta + 360) % 360;
          startAngle.current = currentAngle;
          rotRef.current = newRot;
          onRotateRef.current(newRot);
          // 핀치 확대/축소
          const currentDist = getDist(evt.nativeEvent.touches);
          if (startDist.current > 0) {
            const ratio = currentDist / startDist.current;
            const newScale = Math.min(4, Math.max(0.2, scaleRef.current * ratio));
            startDist.current = currentDist;
            scaleRef.current = newScale;
            onScaleRef.current(newScale);
          }
        } else if (!isTwoFinger.current) {
          const p = posRef.current;
          onMoveRef.current(p.x + gs.dx, p.y + gs.dy);
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (isTwoFinger.current) {
          isTwoFinger.current = false;
          return;
        }
        const p = posRef.current;
        onMoveRef.current(p.x + gs.dx, p.y + gs.dy);
      },
    })
  ).current;

  const renderContent = () => {
    if (element.type === 'photo') {
      const br = element.frameShape === 'circle'
        ? element.width * element.scale / 2
        : element.frameShape === 'rounded' ? 16 : 4;
      return (
        <Image
          source={{ uri: element.uri }}
          style={[
            { width: element.width, height: element.height, borderRadius: br },
            element.borderWidth
              ? { borderWidth: element.borderWidth, borderColor: element.borderColor || '#fff' }
              : {},
          ]}
          resizeMode="cover"
        />
      );
    }
    if (element.type === 'sticker') {
      if (element.svgStickerId) {
        const stickerData = require('../components/stickers').stickers.find(
          (s: Sticker) => s.id === element.svgStickerId
        );
        if (stickerData) {
          const SvgComp = stickerData.component;
          return <SvgComp size={element.stickerSize || 48} />;
        }
      }
      return <Text style={{ fontSize: element.stickerSize || 48 }}>{element.sticker}</Text>;
    }
    // text
    return (
      <View style={element.textBgColor ? { backgroundColor: element.textBgColor, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 } : {}}>
        <Text style={{
          fontFamily: element.fontFamily,
          fontSize: element.fontSize || 20,
          color: element.fontColor || '#FFFFFF',
          fontWeight: element.fontWeight || 'normal',
          fontStyle: element.fontStyle || 'normal',
          textAlign: element.textAlign || 'left',
        }}>
          {element.text}
        </Text>
      </View>
    );
  };

  return (
    <View
      {...panResponder.panHandlers}
      style={{
        position: 'absolute',
        left: element.x,
        top: element.y,
        zIndex: element.zIndex + (isSelected ? 9000 : 0),
        opacity: element.opacity ?? 1,
        transform: [
          { scale: element.scale },
          { rotate: `${element.rotation}deg` },
        ],
      }}
    >
      {isSelected && (
        <View style={{
          position: 'absolute', top: -3, left: -3, right: -3, bottom: -3,
          borderWidth: 2, borderColor: COLORS.purpleNeon, borderRadius: 6,
          borderStyle: 'dashed',
        }} pointerEvents="none" />
      )}
      {renderContent()}
    </View>
  );
}

// ══════════════════════════════════════════════
// 메인 앨범 레코드 스크린
// ══════════════════════════════════════════════
export default function AlbumRecordScreen({ navigation, route }: { navigation: any; route: any }) {
  const { addRecord } = useRecords();

  // ── 공통 상태 ──
  const [step, setStep] = useState(1);
  const [countrySearch, setCountrySearch] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<{ flag: string; name: string } | null>(null);
  const [startDate, setStartDate] = useState(getTodayString());
  const [endDate, setEndDate] = useState(getTodayString());
  const [rangePickerVisible, setRangePickerVisible] = useState(false);
  const [albumTitle, setAlbumTitle] = useState('');
  const [rating, setRating] = useState(0);
  const [memo, setMemo] = useState('');

  // ── 별점 (반별점 + 드래그) ──
  const STAR_SIZE = 32;
  const STAR_GAP  = 6;
  const ratingRowRef   = useRef<View>(null);
  const ratingRowPageX = useRef(0);

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
        <View key={i} style={st.starWrap}>
          <Text style={[st.starChar, st.starAbsolute]}>☆</Text>
          {(isFull || isHalf) && (
            <View style={[st.starFillClip, { width: isHalf ? STAR_SIZE / 2 : STAR_SIZE }]}>
              <Text style={[st.starChar, st.starCharActive, st.starAbsolute]}>★</Text>
            </View>
          )}
        </View>
      );
    }
    return (
      <View ref={ratingRowRef} style={st.ratingRow} {...ratingPanResponder.panHandlers}>
        {stars}
      </View>
    );
  };

  // ── Step 1 추가 상태 ──
  const [companions, setCompanions] = useState<string[]>([]);
  const [companionFriends, setCompanionFriends] = useState<string[]>([]);
  const [friendPickerVisible, setFriendPickerVisible] = useState(false);
  const [budget, setBudget] = useState('');
  const [currency, setCurrency] = useState('KRW');
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [weather, setWeather] = useState('');
  const [flight, setFlight] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordQuery, setKeywordQuery] = useState('');

  // ── Step 2 사진 선택 상태 ──
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [aiRecommending, setAiRecommending] = useState(false);
  const [aiRecommended, setAiRecommended] = useState(false);

  useEffect(() => {
    const params = route?.params;
    if (params?.selectedCountry) {
      const name = params.selectedCountry.name?.toLowerCase() || '';
      const found = COUNTRIES.find(c => c.term.includes(name) || c.name === params.selectedCountry.name);
      if (found) {
        setSelectedCountry({ flag: found.flag, name: found.name });
      }
    }
  }, [route?.params]);

  // ── 앨범 에디터 상태 ──
  const [pages, setPages] = useState<AlbumPage[]>([
    { id: genPageId(), bgColor: '#1A1A2E', elements: [] },
  ]);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [selectedElemId, setSelectedElemId] = useState<string | null>(null);

  // ── 모달 상태 ──
  const [stickerModalVisible, setStickerModalVisible] = useState(false);
  const [stickerCategory, setStickerCategory] = useState(0);
  const [stickerTabMode, setStickerTabMode] = useState<'emoji' | 'svg'>('emoji');
  const [textModalVisible, setTextModalVisible] = useState(false);
  const [bgModalVisible, setBgModalVisible] = useState(false);
  const [frameModalVisible, setFrameModalVisible] = useState(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  // ── 텍스트 에디터 상태 ──
  const [txtValue, setTxtValue] = useState('');
  const [txtFont, setTxtFont] = useState(FONT_OPTIONS[0].value);
  const [txtSize, setTxtSize] = useState(22);
  const [txtColor, setTxtColor] = useState('#FFFFFF');
  const [txtBold, setTxtBold] = useState(false);
  const [txtItalic, setTxtItalic] = useState(false);
  const [txtAlign, setTxtAlign] = useState<'left' | 'center' | 'right'>('left');
  const [txtBgColor, setTxtBgColor] = useState('');

  const currentPage = pages[currentPageIdx];
  const selectedElem = currentPage?.elements.find(e => e.id === selectedElemId) ?? null;

  const filtered = useMemo(
    () => COUNTRIES.filter(c => c.term.toLowerCase().includes(countrySearch.toLowerCase())).slice(0, 20),
    [countrySearch],
  );

  // ── 요소 헬퍼 ──
  const maxZ = () => Math.max(0, ...currentPage.elements.map(e => e.zIndex));

  const updateElement = useCallback((id: string, changes: Partial<CanvasElement>) => {
    setPages(prev => prev.map((p, i) =>
      i === currentPageIdx
        ? { ...p, elements: p.elements.map(e => e.id === id ? { ...e, ...changes } : e) }
        : p
    ));
  }, [currentPageIdx]);

  const deleteElement = useCallback((id: string) => {
    setPages(prev => prev.map((p, i) =>
      i === currentPageIdx
        ? { ...p, elements: p.elements.filter(e => e.id !== id) }
        : p
    ));
    setSelectedElemId(null);
  }, [currentPageIdx]);

  const addElement = useCallback((elem: CanvasElement) => {
    setPages(prev => prev.map((p, i) =>
      i === currentPageIdx
        ? { ...p, elements: [...p.elements, elem] }
        : p
    ));
    setSelectedElemId(elem.id);
  }, [currentPageIdx]);

  // ── 사진 추가 ──
  const pickPhotosForCanvas = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 20,
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) {
      const z = maxZ();
      result.assets.forEach((asset, idx) => {
        const ratio = (asset.width && asset.height) ? asset.width / asset.height : 1;
        const w = 140;
        const h = w / ratio;
        const elem: CanvasElement = {
          id: genId(),
          type: 'photo',
          x: 20 + (idx % 3) * 30 + Math.random() * 20,
          y: 20 + Math.floor(idx / 3) * 30 + Math.random() * 20,
          width: w, height: h,
          scale: 1, rotation: 0,
          zIndex: z + idx + 1,
          opacity: 1,
          uri: asset.uri,
          frameShape: 'rect',
          borderColor: 'transparent',
          borderWidth: 0,
        };
        addElement(elem);
      });
    }
  };

  // ── 기간 자동 불러오기 ──
  const autoLoadByPeriod = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '갤러리 접근 권한이 필요합니다.');
      return;
    }
    const start = parseDS(startDate);
    const end = parseDS(endDate);
    end.setHours(23, 59, 59, 999);
    const assets = await MediaLibrary.getAssetsAsync({
      mediaType: 'photo',
      createdAfter: start.getTime(),
      createdBefore: end.getTime(),
      first: 50,
      sortBy: [MediaLibrary.SortBy.creationTime],
    });
    if (assets.assets.length === 0) {
      Alert.alert('사진 없음', '해당 기간에 촬영된 사진이 없습니다.');
      return;
    }
    const z = maxZ();
    assets.assets.forEach((asset, idx) => {
      const elem: CanvasElement = {
        id: genId(),
        type: 'photo',
        x: 15 + (idx % 3) * 110,
        y: 15 + Math.floor(idx / 3) * 110,
        width: 100, height: 100,
        scale: 1, rotation: 0,
        zIndex: z + idx + 1,
        opacity: 1,
        uri: asset.uri,
        frameShape: 'rect',
        borderColor: 'transparent',
        borderWidth: 0,
      };
      addElement(elem);
    });
    Alert.alert('완료', `${assets.assets.length}장의 사진을 불러왔습니다.`);
  };

  // ── 스티커 추가 ──
  const addSticker = (emoji: string) => {
    const elem: CanvasElement = {
      id: genId(), type: 'sticker',
      x: CANVAS_W / 2 - 24 + (Math.random() - 0.5) * 60,
      y: CANVAS_H / 2 - 24 + (Math.random() - 0.5) * 60,
      width: 48, height: 48,
      scale: 1, rotation: 0,
      zIndex: maxZ() + 1,
      opacity: 1,
      sticker: emoji, stickerSize: 48,
    };
    addElement(elem);
    setStickerModalVisible(false);
  };

  // ── SVG 스티커 추가 ──
  const addSvgSticker = (sticker: Sticker) => {
    const elem: CanvasElement = {
      id: genId(), type: 'sticker',
      x: CANVAS_W / 2 - 24 + (Math.random() - 0.5) * 60,
      y: CANVAS_H / 2 - 24 + (Math.random() - 0.5) * 60,
      width: 48, height: 48,
      scale: 1, rotation: 0,
      zIndex: maxZ() + 1,
      opacity: 1,
      sticker: sticker.name, stickerSize: 48,
      svgStickerId: sticker.id,
    };
    addElement(elem);
    setStickerModalVisible(false);
  };

  // ── 텍스트 추가/수정 ──
  const openTextEditor = (existingId?: string) => {
    if (existingId) {
      const el = currentPage.elements.find(e => e.id === existingId);
      if (el && el.type === 'text') {
        setEditingTextId(existingId);
        setTxtValue(el.text || '');
        setTxtFont(el.fontFamily || FONT_OPTIONS[0].value);
        setTxtSize(el.fontSize || 22);
        setTxtColor(el.fontColor || '#FFFFFF');
        setTxtBold(el.fontWeight === 'bold');
        setTxtItalic(el.fontStyle === 'italic');
        setTxtAlign((el.textAlign as any) || 'left');
        setTxtBgColor(el.textBgColor || '');
      }
    } else {
      setEditingTextId(null);
      setTxtValue('');
      setTxtFont(FONT_OPTIONS[0].value);
      setTxtSize(22);
      setTxtColor('#FFFFFF');
      setTxtBold(false);
      setTxtItalic(false);
      setTxtAlign('left');
      setTxtBgColor('');
    }
    setTextModalVisible(true);
  };

  const confirmText = () => {
    if (!txtValue.trim()) { setTextModalVisible(false); return; }
    if (editingTextId) {
      updateElement(editingTextId, {
        text: txtValue,
        fontFamily: txtFont,
        fontSize: txtSize,
        fontColor: txtColor,
        fontWeight: txtBold ? 'bold' : 'normal',
        fontStyle: txtItalic ? 'italic' : 'normal',
        textAlign: txtAlign,
        textBgColor: txtBgColor || undefined,
      });
    } else {
      const elem: CanvasElement = {
        id: genId(), type: 'text',
        x: CANVAS_W / 2 - 60 + (Math.random() - 0.5) * 40,
        y: CANVAS_H / 2 - 12 + (Math.random() - 0.5) * 40,
        width: 0, height: 0,
        scale: 1, rotation: 0,
        zIndex: maxZ() + 1,
        opacity: 1,
        text: txtValue,
        fontFamily: txtFont,
        fontSize: txtSize,
        fontColor: txtColor,
        fontWeight: txtBold ? 'bold' : 'normal',
        fontStyle: txtItalic ? 'italic' : 'normal',
        textAlign: txtAlign,
        textBgColor: txtBgColor || undefined,
      };
      addElement(elem);
    }
    setTextModalVisible(false);
  };

  // ── 페이지 관리 ──
  const addPage = () => {
    const newPage: AlbumPage = { id: genPageId(), bgColor: '#1A1A2E', elements: [] };
    setPages(prev => [...prev, newPage]);
    setCurrentPageIdx(pages.length);
    setSelectedElemId(null);
  };

  const deletePage = () => {
    if (pages.length <= 1) { Alert.alert('알림', '최소 1페이지는 필요합니다.'); return; }
    Alert.alert('페이지 삭제', '이 페이지를 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive', onPress: () => {
          setPages(prev => prev.filter((_, i) => i !== currentPageIdx));
          setCurrentPageIdx(prev => Math.max(0, prev - 1));
          setSelectedElemId(null);
        },
      },
    ]);
  };

  // ── 복제 ──
  const duplicateElement = () => {
    if (!selectedElem) return;
    const dup: CanvasElement = {
      ...selectedElem,
      id: genId(),
      x: selectedElem.x + 20,
      y: selectedElem.y + 20,
      zIndex: maxZ() + 1,
    };
    addElement(dup);
  };

  // ── 저장 ──
  const handleSave = () => {
    if (!selectedCountry) return;
    const allMedias = pages.flatMap(p => p.elements.filter(e => e.type === 'photo').map(e => e.uri!));
    addRecord({
      viewType: 'album',
      country: selectedCountry.flag,
      countryName: selectedCountry.name,
      countryFlag: selectedCountry.flag,
      countries: [selectedCountry],
      content: albumTitle || '앨범 기록',
      medias: allMedias,
      rating,
      memo,
      companions,
      companionFriends,
      budget: budget ? { amount: Number(budget), currency } : undefined,
      weather: weather || undefined,
      flightType: flight || undefined,
      keywords: keywords.length > 0 ? keywords : undefined,
      date: `${startDate} ~ ${endDate}`,
      visibility: 'friends',
      user: { name: '나', emoji: '✈️', handle: 'yunjunsung' },
      timestamp: Date.now(),
    } as any);
    navigation.goBack();
  };

  const canNext = () => {
    if (step === 1) return !!selectedCountry && !!startDate && !!endDate && companions.length > 0 && rating > 0;
    if (step === 2) return selectedPhotos.length > 0;
    return true;
  };

  // ══════════════════════════════════════════
  // 렌더: 헤더
  // ══════════════════════════════════════════
  const renderHeader = () => (
    <View style={st.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={st.cancelBtn}>
        <Text style={st.cancelTxt}>취소</Text>
      </TouchableOpacity>
      <Text style={st.headerTitle}>
        {step === 1 ? '여행 정보 입력' : step === 2 ? '사진 선택' : '앨범 꾸미기'}
      </Text>
      <View style={{ width: 44 }} />
    </View>
  );

  // ── 하단 NavBar ──
  const renderNavBar = () => (
    <View style={st.navBar}>
      {step > 1 ? (
        <TouchableOpacity style={st.prevBtn} onPress={() => { setStep(s => s - 1); setSelectedElemId(null); }} activeOpacity={0.8}>
          <Text style={st.prevTxt}>← 이전</Text>
        </TouchableOpacity>
      ) : (
        <View style={st.prevPlaceholder} />
      )}
      {step < 3 ? (
        <TouchableOpacity
          style={[st.nextBtn, !canNext() && st.nextBtnDisabled]}
          onPress={() => {
            if (canNext()) {
              if (step === 2) {
                // Step 2에서 Step 3 이동 시 선택한 사진들을 캔버스에 자동 배치
                const z = maxZ();
                selectedPhotos.forEach((uri, idx) => {
                  const elem: CanvasElement = {
                    id: genId(),
                    type: 'photo',
                    x: 15 + (idx % 3) * 110,
                    y: 15 + Math.floor(idx / 3) * 110,
                    width: 100, height: 100,
                    scale: 1, rotation: 0,
                    zIndex: z + idx + 1,
                    opacity: 1,
                    uri,
                    frameShape: 'rect',
                    borderColor: 'transparent',
                    borderWidth: 0,
                  };
                  addElement(elem);
                });
              }
              setStep(s => s + 1); setSelectedElemId(null);
            }
          }}
          disabled={!canNext()}
          activeOpacity={0.85}
        >
          <Text style={st.nextBtnText}>다음 →</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={st.saveBtn} onPress={handleSave} activeOpacity={0.85}>
          <Text style={st.saveBtnText}>완료</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // ── 도트 (3단계) ──
  const renderDots = () => (
    <View style={st.dotsRow}>
      {[1, 2, 3].map(n => (
        <View key={n} style={[st.dot, n === step ? st.dotActive : n < step ? st.dotDone : st.dotInactive]} />
      ))}
    </View>
  );

  // ══════════════════════════════════════════
  // Step 1: 여행 정보 입력
  // ══════════════════════════════════════════
  const toggleCompanion = (comp: string) => {
    setCompanions(prev => prev.includes(comp) ? prev.filter(c => c !== comp) : [...prev, comp]);
  };
  const toggleCompanionFriend = (friend: string) => {
    setCompanionFriends(prev =>
      prev.includes(friend) ? prev.filter(f => f !== friend) : [...prev, friend]
    );
  };
  const removeCompanionFriend = (friend: string) => {
    setCompanionFriends(prev => prev.filter(f => f !== friend));
  };

  const renderStep1 = () => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={st.scrollContent} keyboardShouldPersistTaps="handled">

        {/* ── 필수 정보 섹션 헤더 ── */}
        <View style={st.sectionHeader}>
          <View style={st.sectionBar} />
          <Text style={st.sectionHeaderText}>필수 정보 · 4개 항목</Text>
        </View>

        {/* 국가 */}
        <Text style={st.sectionLabel}>어느 나라에서였나요?</Text>
        {selectedCountry ? (
          <TouchableOpacity style={st.selectedCountryRow} onPress={() => { setSelectedCountry(null); setCountrySearch(''); }}>
            <Text style={st.selectedCountryFlag}>{selectedCountry.flag}</Text>
            <Text style={st.selectedCountryName}>{selectedCountry.name}</Text>
            <Text style={[st.textDim, { marginLeft: 'auto' }]}>변경</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TextInput style={st.searchInput} placeholder="국가 검색..." placeholderTextColor={COLORS.textDim}
              value={countrySearch} onChangeText={setCountrySearch} />
            {countrySearch.length > 0 && (
              <View style={st.searchResults}>
                {filtered.map(c => (
                  <TouchableOpacity key={c.term} style={st.searchResultItem}
                    onPress={() => { setSelectedCountry({ flag: c.flag, name: c.name }); setCountrySearch(''); }}>
                    <Text style={st.searchResultFlag}>{c.flag}</Text>
                    <Text style={st.searchResultName}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        {/* 여행 기간 */}
        <Text style={[st.sectionLabel, { marginTop: 24 }]}>여행 기간</Text>
        <TouchableOpacity style={st.dateRangeRow} onPress={() => setRangePickerVisible(true)} activeOpacity={0.75}>
          <View style={[st.dateBox, { flex: 1 }]}>
            <Text style={st.dateLabelSmall}>시작일</Text>
            <Text style={st.dateText}>{startDate}</Text>
          </View>
          <Text style={[st.textDim, { paddingHorizontal: 8 }]}>~</Text>
          <View style={[st.dateBox, { flex: 1 }]}>
            <Text style={st.dateLabelSmall}>종료일</Text>
            <Text style={st.dateText}>{endDate}</Text>
          </View>
          <View style={{ paddingLeft: 4 }}><PencilIcon size={14} color={COLORS.textDim} /></View>
        </TouchableOpacity>

        {/* ── 동행자 선택 ── */}
        <View style={st.companionSection}>
          <Text style={st.companionSectionLabel}>동행자 선택 <Text style={{ color: COLORS.purpleNeon }}>✱</Text></Text>
          <View style={st.companionChipWrap}>
            {DEFAULT_COMPANIONS.map(comp => {
              const isActive = companions.includes(comp);
              const iconColor = isActive ? COLORS.purpleNeon : COLORS.textDim;
              return (
                <TouchableOpacity
                  key={comp}
                  style={[st.companionChip, isActive && st.companionChipActive]}
                  onPress={() => toggleCompanion(comp)}
                  activeOpacity={0.75}
                >
                  <View style={st.companionChipIconWrap}>{COMPANION_ICONS[comp](iconColor)}</View>
                  <Text style={[st.companionChipTxt, isActive && st.companionChipTxtActive]}>{comp}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {companionFriends.length > 0 && (
            <View style={st.customChipRow}>
              {companionFriends.map(friend => (
                <View key={friend} style={st.friendChip}>
                  <View style={st.friendChipAvatar}>
                    <Text style={st.friendChipAvatarTxt}>{friend[0]}</Text>
                  </View>
                  <Text style={st.friendChipName}>{friend}</Text>
                  <TouchableOpacity onPress={() => removeCompanionFriend(friend)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Text style={st.customChipX}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          <TouchableOpacity style={st.addFriendBtn} onPress={() => setFriendPickerVisible(true)} activeOpacity={0.75}>
            <FriendIcon color={COLORS.purpleNeon} />
            <Text style={st.addFriendTxt}>앱 친구 추가</Text>
            {companionFriends.length > 0 && (
              <View style={st.addFriendBadge}>
                <Text style={st.addFriendBadgeTxt}>{companionFriends.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* 별점 */}
        <View style={{ marginTop: 24 }}>
          <View style={st.ratingLabelRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={st.sectionLabel}>별점</Text>
              <Text style={{ color: COLORS.purpleNeon, fontSize: 13 }}>✱</Text>
            </View>
            {rating > 0
              ? <Text style={st.ratingScore}>{rating.toFixed(1)} / 5.0</Text>
              : <Text style={st.ratingScoreEmpty}>탭하거나 드래그해 선택</Text>}
          </View>
          <View style={st.ratingCard}>
            {renderStars()}
          </View>
        </View>

        {/* ── 선택 항목 구분선 ── */}
        <View style={st.companionDivider} />
        <Text style={st.optNoticeText}>선택 항목이에요 (건너뛰어도 돼요 😊)</Text>

        {/* 예산 */}
        <View style={st.optRow}>
          <View style={st.optRowHeader}>
            <CoinIcon size={18} color={IC} />
            <Text style={st.optRowTitle}>예산</Text>
            {budget ? <Text style={st.optCardValue}>{Number(budget).toLocaleString()} {currency}</Text> : null}
          </View>
          <View style={st.optBudgetRow}>
            {CURRENCIES.map(c => (
              <TouchableOpacity key={c} style={[st.optCurrencyChip, currency === c && st.optCurrencyChipActive]}
                onPress={() => setCurrency(c)} activeOpacity={0.75}>
                <Text style={[st.optCurrencyTxt, currency === c && st.optCurrencyTxtActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[st.optCurrencyChip, !CURRENCIES.includes(currency) && st.optCurrencyChipActive]}
              onPress={() => { setCurrencySearch(''); setCurrencyModalVisible(true); }}
              activeOpacity={0.75}
            >
              <Text style={[st.optCurrencyTxt, !CURRENCIES.includes(currency) && st.optCurrencyTxtActive]}>
                {CURRENCIES.includes(currency) ? '기타 ›' : currency}
              </Text>
            </TouchableOpacity>
            <TextInput
              style={st.optBudgetInput}
              placeholder="금액"
              placeholderTextColor={COLORS.textFaint}
              value={budget}
              onChangeText={v => setBudget(v.replace(/[^0-9]/g, ''))}
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* 날씨 */}
        <View style={st.optRow}>
          <View style={st.optRowHeader}>
            <WeatherIcon size={18} color={IC} />
            <Text style={st.optRowTitle}>날씨</Text>
            {weather ? <Text style={st.optCardValue}>{WEATHER_OPTIONS.find(w => w.value === weather)?.label}</Text> : null}
          </View>
          <View style={st.optChipRow}>
            {WEATHER_OPTIONS.map(w => (
              <TouchableOpacity key={w.value}
                style={[st.optSmallBtn, weather === w.value && st.optSmallBtnActive]}
                onPress={() => setWeather(weather === w.value ? '' : w.value)}
                activeOpacity={0.75}>
                {WEATHER_ICON_MAP[w.value]}
                <Text style={[st.optSmallTxt, weather === w.value && st.optSmallTxtActive]}>{w.value}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 직항/경유 */}
        <View style={st.optRow}>
          <View style={st.optRowHeader}>
            <PlaneIcon size={18} color={IC} />
            <Text style={st.optRowTitle}>직항 / 경유</Text>
            {flight ? <Text style={st.optCardValue}>{flight}</Text> : null}
          </View>
          <View style={st.optChipRow}>
            {FLIGHT_OPTIONS.map(f => (
              <TouchableOpacity key={f}
                style={[st.optFlightBtn, flight === f && st.optFlightBtnActive]}
                onPress={() => setFlight(flight === f ? '' : f)}
                activeOpacity={0.75}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {f === '직항' ? <TakeoffIcon size={14} color={flight === f ? COLORS.purpleNeon : COLORS.textDim} /> : <TransferIcon size={14} color={flight === f ? COLORS.purpleNeon : COLORS.textDim} />}
                  <Text style={[st.optFlightTxt, flight === f && st.optFlightTxtActive]}>{f}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 여행 키워드 */}
        <View style={st.optRow}>
          <View style={st.optRowHeader}>
            <TagIcon size={18} color={IC} />
            <Text style={st.optRowTitle}>키워드</Text>
            {keywords.length > 0 && <Text style={st.optCardValue}>{keywords.length}개</Text>}
          </View>
          <View style={st.kwInputBox}>
            {keywords.map(kw => (
              <TouchableOpacity key={kw} style={st.kwTag}
                onPress={() => setKeywords(prev => prev.filter(k => k !== kw))} activeOpacity={0.75}>
                <Text style={st.kwTagTxt}>{kw}</Text>
                <Text style={st.kwTagDel}> ✕</Text>
              </TouchableOpacity>
            ))}
            <TextInput
              style={st.kwInlineInput}
              value={keywordQuery}
              onChangeText={v => {
                if (v.endsWith(' ')) {
                  const tag = v.trim();
                  if (tag.length > 0 && !keywords.includes(tag)) {
                    setKeywords(prev => [...prev, tag.startsWith('#') ? tag : `#${tag}`]);
                  }
                  setKeywordQuery('');
                } else {
                  setKeywordQuery(v);
                }
              }}
              placeholder={keywords.length === 0 ? '#키워드 추가' : '#'}
              placeholderTextColor={COLORS.textFaint}
              returnKeyType="done"
              onSubmitEditing={() => {
                const tag = keywordQuery.trim();
                if (tag.length > 0 && !keywords.includes(tag)) {
                  setKeywords(prev => [...prev, tag.startsWith('#') ? tag : `#${tag}`]);
                }
                setKeywordQuery('');
              }}
            />
          </View>
          <Text style={st.kwHint}>스페이스 또는 엔터로 태그 추가 · 탭해서 삭제</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );

  // ══════════════════════════════════════════
  // ══════════════════════════════════════════
  // Step 2: 사진·영상 선택 (갤러리 피커 방식)
  // ══════════════════════════════════════════
  const THUMB_SIZE = Math.floor((screenWidth - 40 - 16) / 3);

  // ── AI 스마트 추천 ──
  const smartRecommend = async () => {
    setAiRecommending(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '사진 라이브러리 접근 권한이 필요합니다.');
        setAiRecommending(false);
        return;
      }

      // Step 1에서 설정한 여행 날짜 파싱
      const start = parseDS(startDate);
      const end = parseDS(endDate);
      // 하루 전후 여유를 두고 검색
      const from = new Date(start.getTime() - 24 * 60 * 60 * 1000);
      const to = new Date(end.getTime() + 2 * 24 * 60 * 60 * 1000);

      // 해당 기간의 모든 사진/영상 가져오기
      let allAssets: MediaLibrary.Asset[] = [];
      let hasMore = true;
      let after: string | undefined;

      while (hasMore) {
        const page = await MediaLibrary.getAssetsAsync({
          mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
          createdAfter: from.getTime(),
          createdBefore: to.getTime(),
          first: 100,
          after,
          sortBy: [MediaLibrary.SortBy.creationTime],
        });
        allAssets = [...allAssets, ...page.assets];
        hasMore = page.hasNextPage;
        after = page.endCursor;
      }

      if (allAssets.length === 0) {
        Alert.alert('사진 없음', `${startDate} ~ ${endDate} 기간에 촬영된 사진이 없습니다.`);
        setAiRecommending(false);
        return;
      }

      // ── 스마트 선택 알고리즘 ──
      const maxSelect = Math.min(20 - selectedPhotos.length, 15);
      let selected: MediaLibrary.Asset[] = [];

      if (allAssets.length <= maxSelect) {
        selected = allAssets;
      } else {
        // 1. 연속 촬영(버스트) 제거 — 10초 이내 연속 사진은 하나만 선택
        const filtered: MediaLibrary.Asset[] = [];
        for (let i = 0; i < allAssets.length; i++) {
          if (i === 0) { filtered.push(allAssets[i]); continue; }
          const prev = allAssets[i - 1].creationTime;
          const curr = allAssets[i].creationTime;
          if (Math.abs(curr - prev) > 10000) {
            filtered.push(allAssets[i]);
          }
        }

        // 2. 영상은 최대 3개까지 포함
        const videos = filtered.filter(a => a.mediaType === 'video');
        const photos = filtered.filter(a => a.mediaType === 'photo');
        const selectedVideos = videos.slice(0, Math.min(3, videos.length));
        const photoSlots = maxSelect - selectedVideos.length;

        // 3. 시간대별 균등 분배
        if (photos.length <= photoSlots) {
          selected = [...photos, ...selectedVideos];
        } else {
          const totalDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
          const perDay = Math.max(1, Math.floor(photoSlots / totalDays));
          const dayBuckets: Map<string, MediaLibrary.Asset[]> = new Map();

          for (const p of photos) {
            const d = new Date(p.creationTime);
            const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            if (!dayBuckets.has(key)) dayBuckets.set(key, []);
            dayBuckets.get(key)!.push(p);
          }

          const picked: MediaLibrary.Asset[] = [];
          for (const [, bucket] of dayBuckets) {
            // 각 일자에서 균등 간격으로 선택
            const count = Math.min(perDay, bucket.length);
            const step = bucket.length / count;
            for (let i = 0; i < count; i++) {
              picked.push(bucket[Math.floor(i * step)]);
            }
          }

          // 남은 슬롯이 있으면 추가 (가장 늦게 추가된 것 우선)
          if (picked.length < photoSlots) {
            const pickedIds = new Set(picked.map(p => p.id));
            const remaining = photos.filter(p => !pickedIds.has(p.id));
            const extra = remaining.slice(0, photoSlots - picked.length);
            picked.push(...extra);
          }

          selected = [...picked.slice(0, photoSlots), ...selectedVideos];
        }
      }

      // 4. ph:// → file:// URI 변환
      const resolvedUris: string[] = [];
      for (const asset of selected) {
        try {
          const info = await MediaLibrary.getAssetInfoAsync(asset.id);
          resolvedUris.push(info.localUri || asset.uri);
        } catch {
          // localUri 실패 시 건너뜀
        }
      }

      setSelectedPhotos(prev => [...prev, ...resolvedUris]);
      setAiRecommended(true);
    } catch (e: any) {
      Alert.alert('오류', '스마트 추천 중 오류가 발생했습니다.');
    } finally {
      setAiRecommending(false);
    }
  };

  const selectMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      selectionLimit: 20 - selectedPhotos.length,
      quality: 0.8,
    });
    if (!result.canceled && result.assets) {
      setSelectedPhotos(prev => [...prev, ...result.assets.map(a => a.uri)]);
    }
  };

  const removeMedia = (index: number) => {
    setSelectedPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const renderStep2 = () => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={st.scrollContent} keyboardShouldPersistTaps="handled">

        {/* 갤러리 선택 버튼 */}
        <TouchableOpacity
          style={[st.addMediaBtn, selectedPhotos.length >= 20 && st.addMediaBtnDisabled]}
          onPress={selectMedia}
          activeOpacity={0.8}
          disabled={selectedPhotos.length >= 20}
        >
          <View style={st.addMediaLeft}>
            <CameraIcon size={20} color={COLORS.purpleNeon} />
            <View>
              <Text style={st.addMediaText}>갤러리에서 선택</Text>
              <Text style={st.addMediaSub}>사진 · 영상 최대 20개</Text>
            </View>
          </View>
          <View style={st.addMediaCountBadge}>
            <Text style={st.addMediaCountTxt}>{selectedPhotos.length}/20</Text>
          </View>
        </TouchableOpacity>

        {/* AI 스마트 추천 카드 */}
        <TouchableOpacity
          style={[st.aiRecommendCard, (aiRecommending || selectedPhotos.length >= 20) && { opacity: 0.5 }]}
          onPress={smartRecommend}
          activeOpacity={0.8}
          disabled={aiRecommending || selectedPhotos.length >= 20}
        >
          <View style={st.aiRecommendHeader}>
            <View style={st.aiRecommendIconWrap}>
              <Text style={st.aiRecommendIcon}>✨</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.aiRecommendTitle}>AI 스마트 추천</Text>
              <Text style={st.aiRecommendDesc}>
                {startDate} ~ {endDate} 기간의 사진을 분석하여{'\n'}
                최적의 사진을 자동으로 추천합니다
              </Text>
            </View>
          </View>
          {aiRecommending ? (
            <View style={st.aiRecommendLoading}>
              <ActivityIndicator size="small" color={COLORS.purpleNeon} />
              <Text style={st.aiRecommendLoadingTxt}>사진을 분석하고 있어요...</Text>
            </View>
          ) : aiRecommended ? (
            <View style={st.aiRecommendDone}>
              <Text style={st.aiRecommendDoneTxt}>✓ 추천 완료 — 다시 추천받기</Text>
            </View>
          ) : (
            <View style={st.aiRecommendAction}>
              <Text style={st.aiRecommendActionTxt}>추천 받기 →</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* 썸네일 그리드 */}
        {selectedPhotos.length > 0 && (
          <View style={st.mediaGrid}>
            {selectedPhotos.map((uri, index) => (
              <View key={index} style={[st.mediaThumbWrap, { width: THUMB_SIZE, height: THUMB_SIZE }]}>
                <Image source={{ uri }} style={st.mediaThumb} />
                <TouchableOpacity
                  style={st.mediaRemoveBtn}
                  onPress={() => removeMedia(index)}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Text style={st.mediaRemoveTxt}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* 빈 상태 */}
        {selectedPhotos.length === 0 && (
          <View style={st.mediaEmptyBox}>
            <CameraIcon size={32} color={COLORS.textFaint} />
            <Text style={st.mediaEmptyTitle}>아직 선택된 사진이 없어요</Text>
            <Text style={st.mediaEmptyDesc}>갤러리에서 사진과 영상을 선택해주세요</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );

  // ══════════════════════════════════════════
  // Step 3: 앨범 꾸미기 (크리에이티브 에디터)
  // ══════════════════════════════════════════
  const renderStep3Editor = () => {
    const sortedElems = [...currentPage.elements].sort((a, b) => a.zIndex - b.zIndex);

    return (
      <View style={{ flex: 1 }}>
        {/* 페이지 네비게이션 */}
        <View style={st.pageNav}>
          <TouchableOpacity onPress={() => { if (currentPageIdx > 0) { setCurrentPageIdx(i => i - 1); setSelectedElemId(null); } }}
            style={st.pageArrow} disabled={currentPageIdx === 0}>
            <Text style={[st.pageArrowTxt, currentPageIdx === 0 && { opacity: 0.3 }]}>‹</Text>
          </TouchableOpacity>
          <View style={st.pageDots}>
            {pages.map((p, i) => (
              <TouchableOpacity key={p.id} onPress={() => { setCurrentPageIdx(i); setSelectedElemId(null); }}>
                <View style={[st.pageDot, i === currentPageIdx && st.pageDotActive]} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={addPage} style={st.pageAddBtn}>
              <Text style={st.pageAddTxt}>+</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => { if (currentPageIdx < pages.length - 1) { setCurrentPageIdx(i => i + 1); setSelectedElemId(null); } }}
            style={st.pageArrow} disabled={currentPageIdx === pages.length - 1}>
            <Text style={[st.pageArrowTxt, currentPageIdx === pages.length - 1 && { opacity: 0.3 }]}>›</Text>
          </TouchableOpacity>
          <Text style={st.pageLabel}>{currentPageIdx + 1}/{pages.length}</Text>
        </View>

        {/* 캔버스 */}
        <View style={[st.canvasWrapper, { height: CANVAS_H }]}>
          <View style={[st.canvas, { backgroundColor: currentPage.bgColor }]}>
            {/* 빈 공간 터치 → 선택 해제 */}
            <TouchableOpacity
              style={{ ...StyleSheet.absoluteFillObject }}
              activeOpacity={1}
              onPress={() => setSelectedElemId(null)}
            />
            {sortedElems.map(elem => (
              <DraggableItem
                key={elem.id}
                element={elem}
                isSelected={elem.id === selectedElemId}
                onSelect={() => setSelectedElemId(elem.id)}
                onMove={(x, y) => updateElement(elem.id, { x, y })}
                onRotate={(rotation) => updateElement(elem.id, { rotation })}
                onScale={(scale) => updateElement(elem.id, { scale })}
              />
            ))}

            {/* 선택된 요소 컨트롤바 — 요소 상단에 표시 */}
            {selectedElem && (
              <View style={[st.floatingControlWrap, { top: Math.max(0, selectedElem.y - 46), left: 0, right: 0 }]} pointerEvents="box-none">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, paddingHorizontal: 6 }} style={st.floatingControlBar}>
                  <TouchableOpacity style={st.ctrlBtn} onPress={() => deleteElement(selectedElem.id)}>
                    <TrashIcon size={16} color="#A1A1B0" /><Text style={st.ctrlLabel}>삭제</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={st.ctrlBtn} onPress={duplicateElement}>
                    <Text style={st.ctrlIcon}>📋</Text><Text style={st.ctrlLabel}>복제</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={st.ctrlBtn} onPress={() => updateElement(selectedElem.id, { zIndex: maxZ() + 1 })}>
                    <Text style={st.ctrlIcon}>⬆</Text><Text style={st.ctrlLabel}>앞으로</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={st.ctrlBtn} onPress={() => updateElement(selectedElem.id, { zIndex: Math.max(0, selectedElem.zIndex - 1) })}>
                    <Text style={st.ctrlIcon}>⬇</Text><Text style={st.ctrlLabel}>뒤로</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={st.ctrlBtn} onPress={() => updateElement(selectedElem.id, { opacity: Math.max(0.1, (selectedElem.opacity ?? 1) - 0.15) })}>
                    <Text style={st.ctrlIcon}>◐</Text><Text style={st.ctrlLabel}>투명</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={st.ctrlBtn} onPress={() => updateElement(selectedElem.id, { opacity: Math.min(1, (selectedElem.opacity ?? 1) + 0.15) })}>
                    <Text style={st.ctrlIcon}>●</Text><Text style={st.ctrlLabel}>불투명</Text>
                  </TouchableOpacity>
                  {selectedElem.type === 'photo' && (
                    <TouchableOpacity style={st.ctrlBtn} onPress={() => setFrameModalVisible(true)}>
                      <GalleryIcon size={16} color="#A1A1B0" /><Text style={st.ctrlLabel}>프레임</Text>
                    </TouchableOpacity>
                  )}
                  {selectedElem.type === 'text' && (
                    <TouchableOpacity style={st.ctrlBtn} onPress={() => openTextEditor(selectedElem.id)}>
                      <PencilIcon size={16} color="#A1A1B0" /><Text style={st.ctrlLabel}>편집</Text>
                    </TouchableOpacity>
                  )}
                  {selectedElem.type === 'sticker' && (
                    <>
                      <TouchableOpacity style={st.ctrlBtn} onPress={() => updateElement(selectedElem.id, { stickerSize: Math.min(120, (selectedElem.stickerSize || 48) + 8) })}>
                        <Text style={st.ctrlIcon}>A+</Text><Text style={st.ctrlLabel}>크게</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={st.ctrlBtn} onPress={() => updateElement(selectedElem.id, { stickerSize: Math.max(16, (selectedElem.stickerSize || 48) - 8) })}>
                        <Text style={st.ctrlIcon}>A-</Text><Text style={st.ctrlLabel}>작게</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </ScrollView>
              </View>
            )}
          </View>
        </View>

        {/* 하단 도구 바 */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.toolbar} contentContainerStyle={st.toolbarContent}>
          <TouchableOpacity style={st.toolBtn} onPress={pickPhotosForCanvas}>
            <CameraIcon size={22} color="#A1A1B0" />
            <Text style={st.toolLabel}>사진</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.toolBtn} onPress={autoLoadByPeriod}>
            <CalendarIcon size={22} color="#A1A1B0" />
            <Text style={st.toolLabel}>자동불러오기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.toolBtn} onPress={() => setStickerModalVisible(true)}>
            <StickerIcon size={22} color="#A1A1B0" />
            <Text style={st.toolLabel}>스티커</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.toolBtn} onPress={() => openTextEditor()}>
            <PencilIcon size={22} color="#A1A1B0" />
            <Text style={st.toolLabel}>텍스트</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.toolBtn} onPress={() => setBgModalVisible(true)}>
            <PaletteIcon size={22} color="#A1A1B0" />
            <Text style={st.toolLabel}>배경</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.toolBtn} onPress={deletePage}>
            <TrashIcon size={22} color="#A1A1B0" />
            <Text style={st.toolLabel}>페이지삭제</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  };


  // ══════════════════════════════════════════
  // 모달: 스티커 선택
  // ══════════════════════════════════════════
  const renderStickerModal = () => (
    <Modal visible={stickerModalVisible} transparent animationType="slide" onRequestClose={() => setStickerModalVisible(false)} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ ...StyleSheet.absoluteFillObject }} activeOpacity={1} onPress={() => setStickerModalVisible(false)} />
        <View style={st.modalSheet}>
          <View style={st.modalHandle} />
          <Text style={st.modalTitle}>스티커 선택</Text>

          {/* 이모지 / SVG 탭 전환 */}
          <View style={{ flexDirection: 'row', marginBottom: 12, gap: 8, justifyContent: 'center' }}>
            <TouchableOpacity
              onPress={() => setStickerTabMode('emoji')}
              style={[st.catTab, stickerTabMode === 'emoji' && st.catTabActive]}
            >
              <Text style={[st.catTabText, stickerTabMode === 'emoji' && st.catTabTextActive]}>이모지</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setStickerTabMode('svg')}
              style={[st.catTab, stickerTabMode === 'svg' && st.catTabActive]}
            >
              <Text style={[st.catTabText, stickerTabMode === 'svg' && st.catTabTextActive]}>일러스트</Text>
            </TouchableOpacity>
          </View>

          {stickerTabMode === 'emoji' ? (
            <>
              {/* 카테고리 탭 */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 4 }}>
                  {STICKER_CATEGORIES.map((cat, i) => (
                    <TouchableOpacity key={cat.name} onPress={() => setStickerCategory(i)}
                      style={[st.catTab, i === stickerCategory && st.catTabActive]}>
                      <Text style={[st.catTabText, i === stickerCategory && st.catTabTextActive]}>{cat.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {/* 스티커 그리드 */}
              <View style={st.stickerGrid}>
                {STICKER_CATEGORIES[stickerCategory].items.map((emoji, i) => (
                  <TouchableOpacity key={`${emoji}-${i}`} style={st.stickerItem} onPress={() => addSticker(emoji)}>
                    <Text style={st.stickerEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <StickerPicker onSelect={addSvgSticker} />
          )}
        </View>
      </View>
    </Modal>
  );

  // ══════════════════════════════════════════
  // 모달: 텍스트 에디터
  // ══════════════════════════════════════════
  const renderTextModal = () => (
    <Modal visible={textModalVisible} transparent animationType="slide" onRequestClose={() => setTextModalVisible(false)} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ ...StyleSheet.absoluteFillObject }} activeOpacity={1} onPress={() => setTextModalVisible(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[st.modalSheet, { maxHeight: screenHeight * 0.8 }]}>
            <View style={st.modalHandle} />
            <Text style={st.modalTitle}>{editingTextId ? '텍스트 수정' : '텍스트 추가'}</Text>

            {/* 미리보기 */}
            <View style={[st.txtPreviewBox, txtBgColor ? { backgroundColor: txtBgColor } : {}]}>
              <Text style={{
                fontFamily: txtFont, fontSize: txtSize, color: txtColor,
                fontWeight: txtBold ? 'bold' : 'normal', fontStyle: txtItalic ? 'italic' : 'normal',
                textAlign: txtAlign,
              }}>
                {txtValue || '미리보기'}
              </Text>
            </View>

            {/* 텍스트 입력 */}
            <TextInput style={st.txtInput} placeholder="텍스트를 입력하세요..."
              placeholderTextColor={COLORS.textDim} value={txtValue} onChangeText={setTxtValue}
              multiline autoFocus />

            {/* 폰트 선택 */}
            <Text style={st.txtSectionLabel}>폰트</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {FONT_OPTIONS.map(f => (
                  <TouchableOpacity key={f.label} onPress={() => setTxtFont(f.value)}
                    style={[st.fontChip, txtFont === f.value && st.fontChipActive]}>
                    <Text style={[st.fontChipText, { fontFamily: f.value }, txtFont === f.value && { color: COLORS.purpleNeon }]}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* 크기 조절 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <Text style={st.txtSectionLabel}>크기: {txtSize}</Text>
              <TouchableOpacity style={st.sizeBtn} onPress={() => setTxtSize(s => Math.max(10, s - 2))}>
                <Text style={st.sizeBtnTxt}>A-</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.sizeBtn} onPress={() => setTxtSize(s => Math.min(72, s + 2))}>
                <Text style={st.sizeBtnTxt}>A+</Text>
              </TouchableOpacity>

              {/* Bold / Italic / Align */}
              <TouchableOpacity style={[st.sizeBtn, txtBold && st.sizeBtnActive]} onPress={() => setTxtBold(b => !b)}>
                <Text style={[st.sizeBtnTxt, { fontWeight: 'bold' }]}>B</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.sizeBtn, txtItalic && st.sizeBtnActive]} onPress={() => setTxtItalic(b => !b)}>
                <Text style={[st.sizeBtnTxt, { fontStyle: 'italic' }]}>I</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.sizeBtn} onPress={() => setTxtAlign(a => a === 'left' ? 'center' : a === 'center' ? 'right' : 'left')}>
                <Text style={st.sizeBtnTxt}>{txtAlign === 'left' ? '◧' : txtAlign === 'center' ? '◫' : '◨'}</Text>
              </TouchableOpacity>
            </View>

            {/* 글자 색상 */}
            <Text style={st.txtSectionLabel}>글자 색상</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {TEXT_COLORS.map(c => (
                  <TouchableOpacity key={c} onPress={() => setTxtColor(c)}
                    style={[st.colorDot, { backgroundColor: c }, txtColor === c && st.colorDotSel]} />
                ))}
              </View>
            </ScrollView>

            {/* 배경색 */}
            <Text style={st.txtSectionLabel}>배경색 (선택)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity onPress={() => setTxtBgColor('')}
                  style={[st.colorDot, { backgroundColor: '#333', borderStyle: 'dashed' }, !txtBgColor && st.colorDotSel]}>
                  <Text style={{ color: '#fff', fontSize: 10 }}>없음</Text>
                </TouchableOpacity>
                {TEXT_COLORS.map(c => (
                  <TouchableOpacity key={`bg-${c}`} onPress={() => setTxtBgColor(c)}
                    style={[st.colorDot, { backgroundColor: c }, txtBgColor === c && st.colorDotSel]} />
                ))}
              </View>
            </ScrollView>

            <TouchableOpacity style={st.confirmBtn} onPress={confirmText} activeOpacity={0.85}>
              <Text style={st.confirmBtnTxt}>완료</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );

  // ══════════════════════════════════════════
  // 모달: 배경색 선택
  // ══════════════════════════════════════════
  const renderBgModal = () => (
    <Modal visible={bgModalVisible} transparent animationType="slide" onRequestClose={() => setBgModalVisible(false)} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ ...StyleSheet.absoluteFillObject }} activeOpacity={1} onPress={() => setBgModalVisible(false)} />
        <View style={st.modalSheet}>
          <View style={st.modalHandle} />
          <Text style={st.modalTitle}>페이지 배경색</Text>
          <View style={st.bgGrid}>
            {PAGE_BACKGROUNDS.map(c => (
              <TouchableOpacity key={c} style={[st.bgItem, { backgroundColor: c }, currentPage.bgColor === c && st.bgItemSel]}
                onPress={() => {
                  setPages(prev => prev.map((p, i) => i === currentPageIdx ? { ...p, bgColor: c } : p));
                }} />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );

  // ══════════════════════════════════════════
  // 모달: 프레임/테두리 선택 (사진 전용)
  // ══════════════════════════════════════════
  const renderFrameModal = () => (
    <Modal visible={frameModalVisible} transparent animationType="slide" onRequestClose={() => setFrameModalVisible(false)} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ ...StyleSheet.absoluteFillObject }} activeOpacity={1} onPress={() => setFrameModalVisible(false)} />
        <View style={st.modalSheet}>
          <View style={st.modalHandle} />
          <Text style={st.modalTitle}>사진 프레임</Text>

          <Text style={[st.txtSectionLabel, { marginTop: 8 }]}>모양</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            {([
              { label: '사각', value: 'rect' as FrameShape },
              { label: '둥근', value: 'rounded' as FrameShape },
              { label: '원형', value: 'circle' as FrameShape },
            ]).map(s => (
              <TouchableOpacity key={s.value} onPress={() => { if (selectedElem) updateElement(selectedElem.id, { frameShape: s.value }); }}
                style={[st.frameShapeBtn, selectedElem?.frameShape === s.value && st.frameShapeBtnActive]}>
                <Text style={[st.frameShapeTxt, selectedElem?.frameShape === s.value && { color: COLORS.purpleNeon }]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={st.txtSectionLabel}>테두리</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            {PHOTO_BORDERS.map((b, i) => (
              <TouchableOpacity key={i} onPress={() => {
                if (selectedElem) updateElement(selectedElem.id, { borderWidth: b.width, borderColor: b.color });
              }} style={[
                st.borderOption,
                selectedElem?.borderColor === b.color && selectedElem?.borderWidth === b.width && st.borderOptionSel,
              ]}>
                <View style={[st.borderPreview, b.width > 0 ? { borderWidth: Math.min(b.width, 4), borderColor: b.color } : {}]} />
                <Text style={st.borderLabel}>{b.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={st.confirmBtn} onPress={() => setFrameModalVisible(false)} activeOpacity={0.85}>
            <Text style={st.confirmBtnTxt}>완료</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // ══════════════════════════════════════════
  // 메인 렌더
  // ══════════════════════════════════════════
  return (
    <SafeAreaView style={st.container}>
      {renderHeader()}
      {renderDots()}
      <View style={{ flex: 1 }}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3Editor()}
      </View>
      {renderNavBar()}
      <RangePickerModal
        visible={rangePickerVisible}
        initialStart={parseDS(startDate)}
        initialEnd={parseDS(endDate)}
        onConfirm={(s, e) => { setStartDate(formatDate(s)); setEndDate(formatDate(e)); }}
        onClose={() => setRangePickerVisible(false)}
      />
      {renderStickerModal()}
      {renderTextModal()}
      {renderBgModal()}
      {renderFrameModal()}

      {/* 앱 친구 선택 모달 */}
      <Modal visible={friendPickerVisible} transparent animationType="slide"
        onRequestClose={() => setFriendPickerVisible(false)} statusBarTranslucent>
        <View style={fpSt.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setFriendPickerVisible(false)} />
          <View style={fpSt.sheet}>
            <View style={fpSt.handle} />
            <View style={fpSt.header}>
              <FriendIcon color={COLORS.purpleNeon} />
              <Text style={fpSt.headerTitle}>함께한 친구 선택</Text>
            </View>
            <ScrollView style={fpSt.list} showsVerticalScrollIndicator={false}>
              {DUMMY_FRIENDS.map(friend => {
                const isSelected = companionFriends.includes(friend);
                return (
                  <TouchableOpacity key={friend} style={[fpSt.row, isSelected && fpSt.rowActive]}
                    onPress={() => toggleCompanionFriend(friend)} activeOpacity={0.7}>
                    <View style={[fpSt.avatar, isSelected && fpSt.avatarActive]}>
                      <Text style={fpSt.avatarTxt}>{friend[0]}</Text>
                    </View>
                    <Text style={[fpSt.name, isSelected && fpSt.nameActive]}>{friend}</Text>
                    <View style={[fpSt.check, isSelected && fpSt.checkActive]}>
                      {isSelected && <Text style={fpSt.checkMark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={fpSt.doneBtn} onPress={() => setFriendPickerVisible(false)} activeOpacity={0.85}>
              <Text style={fpSt.doneTxt}>
                {companionFriends.length > 0 ? `${companionFriends.length}명 선택 완료` : '선택 없이 닫기'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 기타 통화 선택 모달 */}
      <Modal visible={currencyModalVisible} transparent animationType="slide"
        onRequestClose={() => setCurrencyModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setCurrencyModalVisible(false)} />
          <View style={st.currModalSheet}>
            <View style={st.currModalHandle} />
            <Text style={st.currModalTitle}>통화 선택</Text>
            <View style={st.currModalSearchWrap}>
              <TextInput style={st.currModalSearchInput} placeholder="통화 검색..." placeholderTextColor={COLORS.textFaint}
                value={currencySearch} onChangeText={setCurrencySearch} />
            </View>
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {OTHER_CURRENCIES
                .filter(c => !currencySearch || c.code.includes(currencySearch.toUpperCase()) || c.name.includes(currencySearch))
                .map((c, idx) => (
                  <TouchableOpacity key={c.code}
                    style={[st.currModalItem, idx < OTHER_CURRENCIES.length - 1 && st.currModalItemBorder]}
                    onPress={() => { setCurrency(c.code); setCurrencyModalVisible(false); }} activeOpacity={0.7}>
                    <Text style={st.currModalCode}>{c.code}</Text>
                    <Text style={st.currModalName}>{c.name}</Text>
                    {currency === c.code && <Text style={st.currModalCheck}>✓</Text>}
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ══════════════════════════════════════════════
// 스타일
// ══════════════════════════════════════════════
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  cancelBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  cancelTxt: { color: COLORS.textDim, fontSize: 15, fontWeight: '500' },
  headerTitle: { color: COLORS.white, fontSize: 17, fontWeight: '700' },

  navBar: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingVertical: 10, paddingBottom: 20, backgroundColor: COLORS.bg, borderTopWidth: 1, borderTopColor: COLORS.divider },
  prevPlaceholder: { flex: 0 },
  prevBtn: { flex: 1, backgroundColor: COLORS.card, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  prevTxt: { fontSize: 15, fontWeight: '600', color: COLORS.textDim },
  nextBtn: { flex: 2, backgroundColor: COLORS.purpleDeep, borderRadius: 16, paddingVertical: 14, justifyContent: 'center', alignItems: 'center', shadowColor: COLORS.purpleNeon, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 5 },
  nextBtnDisabled: { opacity: 0.4, shadowOpacity: 0 },
  nextBtnText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  saveBtn: { flex: 2, backgroundColor: COLORS.purpleDeep, borderRadius: 16, paddingVertical: 14, justifyContent: 'center', alignItems: 'center', shadowColor: COLORS.purpleNeon, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 5 },
  saveBtnText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },

  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginVertical: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotActive: { backgroundColor: COLORS.purpleNeon, width: 28, borderRadius: 4, shadowColor: COLORS.purpleNeon, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 6, elevation: 4 },
  dotDone: { backgroundColor: COLORS.purpleDeep },
  dotInactive: { backgroundColor: 'rgba(255,255,255,0.14)' },

  scrollContent: { padding: 16, paddingBottom: 40 },
  sectionLabel: { color: COLORS.text, fontSize: 15, fontWeight: '600', marginBottom: 8 },
  textDim: { color: COLORS.textDim, fontSize: 14 },

  // Step 1 스타일
  selectedCountryRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 10, padding: 14, marginBottom: 8, gap: 10 },
  selectedCountryFlag: { fontSize: 22 },
  selectedCountryName: { color: COLORS.white, fontSize: 16, fontWeight: '600' },
  searchInput: { backgroundColor: COLORS.card, borderRadius: 10, padding: 14, color: COLORS.white, fontSize: 15, marginBottom: 4 },
  searchResults: { backgroundColor: COLORS.card, borderRadius: 10, marginBottom: 8, overflow: 'hidden' },
  searchResultItem: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  searchResultFlag: { fontSize: 20 },
  searchResultName: { color: COLORS.white, fontSize: 15 },
  dateRangeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 4 },
  dateBox: { backgroundColor: COLORS.card, borderRadius: 10, padding: 14 },
  dateLabelSmall: { color: COLORS.textDim, fontSize: 11, marginBottom: 2 },
  dateText: { color: COLORS.white, fontSize: 14, fontWeight: '600' },

  // Step 2: 페이지 네비게이션
  pageNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingBottom: 6, gap: 8 },
  pageArrow: { padding: 6 },
  pageArrowTxt: { fontSize: 22, color: COLORS.white, fontWeight: '600' },
  pageDots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pageDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.card },
  pageDotActive: { backgroundColor: COLORS.purpleNeon, width: 16, borderRadius: 4 },
  pageAddBtn: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center' },
  pageAddTxt: { color: COLORS.purpleNeon, fontSize: 16, fontWeight: '700', marginTop: -1 },
  pageLabel: { color: COLORS.textDim, fontSize: 12, marginLeft: 4 },

  // Step 2: 컨트롤바
  controlBar: { maxHeight: 52, backgroundColor: 'rgba(46,46,59,0.95)', borderRadius: 12, marginHorizontal: 12, marginBottom: 6 },
  floatingControlWrap: { position: 'absolute', zIndex: 9999, alignItems: 'center' },
  floatingControlBar: { maxHeight: 44, backgroundColor: 'rgba(30,30,45,0.92)', borderRadius: 10, paddingVertical: 2, alignSelf: 'center', maxWidth: CANVAS_W - 8 },
  ctrlBtn: { alignItems: 'center', paddingVertical: 4, paddingHorizontal: 7, minWidth: 42 },
  ctrlIcon: { fontSize: 16 },
  ctrlLabel: { color: COLORS.textDim, fontSize: 9, marginTop: 1 },

  // Step 2: 캔버스
  canvasWrapper: { marginHorizontal: CANVAS_PAD, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(191,133,252,0.15)' },
  canvas: { flex: 1, position: 'relative' },

  // Step 2: 도구 바
  toolbar: { maxHeight: 64, borderTopWidth: 1, borderTopColor: COLORS.divider },
  toolbarContent: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6 },
  toolBtn: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4 },
  toolIcon: { fontSize: 22 },
  toolLabel: { color: COLORS.textDim, fontSize: 10, marginTop: 2 },

  // Step 1 확장
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  sectionBar: { width: 4, height: 18, borderRadius: 2, backgroundColor: COLORS.purpleNeon },
  sectionHeaderText: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  ratingLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  ratingScore: { fontSize: 13, color: COLORS.purpleNeon, fontWeight: '700' },
  ratingScoreEmpty: { fontSize: 12, color: COLORS.textFaint },
  ratingCard: { backgroundColor: COLORS.card, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  starWrap: { width: 32, height: 32 },
  starAbsolute: { position: 'absolute', left: 0, top: 0, width: 32 },
  starFillClip: { position: 'absolute', left: 0, top: 0, height: 32, overflow: 'hidden' },
  starChar: { fontSize: 28, color: '#3A3A4A', textAlign: 'center', lineHeight: 32, width: 32 },
  starCharActive: { color: '#FFD700' },

  // 동행자 섹션 (피드 형식)
  companionSection: { gap: 12, marginTop: 24 },
  companionSectionLabel: { fontSize: 15, fontWeight: '600', color: COLORS.white },
  companionChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  companionChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1.5, borderColor: COLORS.divider, gap: 5 },
  companionChipActive: { backgroundColor: 'rgba(107,33,168,0.3)', borderColor: COLORS.purpleNeon },
  companionChipIconWrap: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  companionChipTxt: { fontSize: 13, fontWeight: '600', color: COLORS.textDim },
  companionChipTxtActive: { color: COLORS.white },
  customChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  customChipX: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  friendChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.purpleDeep, borderRadius: 20, paddingRight: 12, paddingLeft: 4, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.purpleNeon },
  friendChipAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(191,133,252,0.3)', alignItems: 'center', justifyContent: 'center' },
  friendChipAvatarTxt: { fontSize: 11, color: COLORS.purpleNeon, fontWeight: '700' },
  friendChipName: { fontSize: 13, color: COLORS.white, fontWeight: '600' },
  addFriendBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: COLORS.divider, borderStyle: 'dashed' as any },
  addFriendTxt: { fontSize: 14, color: COLORS.textDim, fontWeight: '500' },
  addFriendBadge: { backgroundColor: 'rgba(191,133,252,0.15)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 'auto' as any },
  addFriendBadgeTxt: { fontSize: 11, color: COLORS.purpleNeon, fontWeight: '700' },
  companionDivider: { height: 1, backgroundColor: COLORS.divider, marginVertical: 20 },

  // 선택 항목 안내
  optNoticeText: { fontSize: 12, color: COLORS.textDim, textAlign: 'center', marginBottom: 16 },

  // 옵션 카드 행
  optRow: { backgroundColor: COLORS.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', marginBottom: 10 },
  optRowHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  optRowTitle: { fontSize: 13, fontWeight: '600', color: COLORS.white },
  optCardValue: { fontSize: 11, color: COLORS.purpleNeon, fontWeight: '600', backgroundColor: 'rgba(191,133,252,0.12)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },

  // 예산 (compact)
  optBudgetRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  optCurrencyChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.divider },
  optCurrencyChipActive: { backgroundColor: COLORS.purpleDeep, borderColor: COLORS.purpleNeon },
  optCurrencyTxt: { fontSize: 12, fontWeight: '700', color: COLORS.textDim },
  optCurrencyTxtActive: { color: COLORS.white },
  optBudgetInput: { flex: 1, minWidth: 80, fontSize: 14, fontWeight: '600', color: COLORS.white, backgroundColor: COLORS.bg, borderRadius: 8, borderWidth: 1, borderColor: COLORS.divider, paddingHorizontal: 10, paddingVertical: 6 },

  // 날씨/직항 공통 칩
  optChipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  optSmallBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.divider, gap: 4 },
  optSmallBtnActive: { backgroundColor: COLORS.purpleDeep, borderColor: COLORS.purpleNeon },
  optSmallTxt: { fontSize: 12, color: COLORS.textDim, fontWeight: '500' },
  optSmallTxtActive: { color: COLORS.white, fontWeight: '600' },

  // 직항/경유
  optFlightBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.divider },
  optFlightBtnActive: { backgroundColor: COLORS.purpleDeep, borderColor: COLORS.purpleNeon },
  optFlightTxt: { fontSize: 13, fontWeight: '600', color: COLORS.textDim },
  optFlightTxtActive: { color: COLORS.white },

  // 키워드 인라인 입력
  kwInputBox: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', backgroundColor: COLORS.bg, borderRadius: 10, borderWidth: 1, borderColor: COLORS.divider, paddingHorizontal: 10, paddingVertical: 8, gap: 6, minHeight: 42 },
  kwHint: { fontSize: 11, color: COLORS.textFaint },
  kwTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(191,133,252,0.15)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(191,133,252,0.35)' },
  kwTagTxt: { fontSize: 13, color: COLORS.purpleNeon, fontWeight: '600' },
  kwTagDel: { fontSize: 11, color: 'rgba(191,133,252,0.6)' },
  kwInlineInput: { fontSize: 13, color: COLORS.white, padding: 0, minWidth: 80, flex: 1 },

  // 통화 모달
  currModalSheet: { backgroundColor: '#1E1E2E', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingHorizontal: 20, paddingBottom: 32, borderTopWidth: 1, borderTopColor: 'rgba(191,133,252,0.2)' },
  currModalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A3A55', alignSelf: 'center', marginBottom: 16 },
  currModalTitle: { fontSize: 16, fontWeight: '700', color: COLORS.white, textAlign: 'center', marginBottom: 14 },
  currModalSearchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg, borderRadius: 10, borderWidth: 1, borderColor: COLORS.divider, paddingHorizontal: 12, paddingVertical: 8, gap: 8, marginBottom: 10 },
  currModalSearchInput: { flex: 1, fontSize: 13, color: COLORS.white, padding: 0 },
  currModalItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 12 },
  currModalItemBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  currModalCode: { fontSize: 14, fontWeight: '700', color: COLORS.white, width: 44 },
  currModalName: { flex: 1, fontSize: 13, color: COLORS.textDim },
  currModalCheck: { fontSize: 15, color: COLORS.purpleNeon, fontWeight: '700' },

  // Step 2: 갤러리 선택
  addMediaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.card, borderRadius: 14, paddingVertical: 18, paddingHorizontal: 20, borderWidth: 1.5, borderColor: 'rgba(191,133,252,0.35)', borderStyle: 'dashed' as any },
  addMediaBtnDisabled: { opacity: 0.4 },
  addMediaLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  addMediaText: { fontSize: 15, color: COLORS.white, fontWeight: '600' },
  addMediaSub: { fontSize: 12, color: COLORS.textFaint, marginTop: 2 },
  addMediaCountBadge: { backgroundColor: 'rgba(191,133,252,0.15)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  addMediaCountTxt: { fontSize: 13, color: COLORS.purpleNeon, fontWeight: '700' },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  mediaThumbWrap: { position: 'relative', borderRadius: 10, overflow: 'visible' },
  mediaThumb: { width: '100%', height: '100%', borderRadius: 10 },
  mediaRemoveBtn: { position: 'absolute', top: -7, left: -7, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.82)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', zIndex: 10 },
  mediaRemoveTxt: { color: COLORS.white, fontSize: 14, fontWeight: 'bold', lineHeight: 16 },
  mediaEmptyBox: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  mediaEmptyTitle: { fontSize: 15, fontWeight: '600', color: COLORS.white },
  mediaEmptyDesc: { fontSize: 13, color: COLORS.textFaint },

  // AI 스마트 추천
  aiRecommendCard: { backgroundColor: COLORS.card, borderRadius: 14, padding: 18, marginTop: 14, borderWidth: 1, borderColor: 'rgba(191,133,252,0.25)' },
  aiRecommendHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  aiRecommendIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(191,133,252,0.15)', alignItems: 'center', justifyContent: 'center' },
  aiRecommendIcon: { fontSize: 18 },
  aiRecommendTitle: { fontSize: 15, fontWeight: '700', color: COLORS.white, marginBottom: 4 },
  aiRecommendDesc: { fontSize: 12, color: COLORS.textDim, lineHeight: 18 },
  aiRecommendLoading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  aiRecommendLoadingTxt: { fontSize: 13, color: COLORS.purpleNeon },
  aiRecommendDone: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  aiRecommendDoneTxt: { fontSize: 13, color: COLORS.success, fontWeight: '600' },
  aiRecommendAction: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  aiRecommendActionTxt: { fontSize: 14, color: COLORS.purpleNeon, fontWeight: '700' },

  // Step 3 (앨범 꾸미기 - 원래 step 2 스타일 유지)
  titleInput: { backgroundColor: COLORS.card, borderRadius: 10, padding: 14, color: COLORS.white, fontSize: 15 },

  // 모달 공통
  modalSheet: { backgroundColor: '#13102A', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingBottom: 32, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(191,133,252,0.2)' },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A3A55', alignSelf: 'center', marginBottom: 12 },
  modalTitle: { color: COLORS.white, fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 16 },

  // 스티커 모달
  catTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: COLORS.card },
  catTabActive: { backgroundColor: COLORS.purpleDeep },
  catTabText: { color: COLORS.textDim, fontSize: 13, fontWeight: '600' },
  catTabTextActive: { color: COLORS.white },
  stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
  stickerItem: { width: (screenWidth - 64) / 5, height: (screenWidth - 64) / 5, justifyContent: 'center', alignItems: 'center', borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)' },
  stickerEmoji: { fontSize: 32 },

  // 텍스트 에디터 모달
  txtPreviewBox: { borderRadius: 10, padding: 16, marginBottom: 12, minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: COLORS.divider },
  txtInput: { backgroundColor: COLORS.card, borderRadius: 10, padding: 14, color: COLORS.white, fontSize: 15, marginBottom: 12, minHeight: 48 },
  txtSectionLabel: { color: COLORS.textDim, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  fontChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.card },
  fontChipActive: { borderWidth: 1, borderColor: COLORS.purpleNeon },
  fontChipText: { color: COLORS.white, fontSize: 14 },
  sizeBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center' },
  sizeBtnActive: { borderWidth: 1, borderColor: COLORS.purpleNeon },
  sizeBtnTxt: { color: COLORS.white, fontSize: 14, fontWeight: '600' },
  colorDot: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  colorDotSel: { borderWidth: 2, borderColor: COLORS.purpleNeon },

  confirmBtn: { backgroundColor: COLORS.purpleDeep, borderRadius: 14, height: 50, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  confirmBtnTxt: { color: COLORS.white, fontSize: 16, fontWeight: '700' },

  // 배경 모달
  bgGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  bgItem: { width: 52, height: 52, borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  bgItemSel: { borderColor: COLORS.purpleNeon },

  // 프레임 모달
  frameShapeBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.card },
  frameShapeBtnActive: { borderWidth: 1, borderColor: COLORS.purpleNeon },
  frameShapeTxt: { color: COLORS.white, fontSize: 14, fontWeight: '600' },
  borderOption: { alignItems: 'center', gap: 4 },
  borderOptionSel: { opacity: 1 },
  borderPreview: { width: 44, height: 44, borderRadius: 6, backgroundColor: COLORS.card },
  borderLabel: { color: COLORS.textDim, fontSize: 11 },
});

// ─── 친구 선택 모달 스타일 ───
const fpSt = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#1A1A28', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 36, maxHeight: '65%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#4A4A59', alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: COLORS.white },
  list: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderRadius: 12, marginBottom: 4 },
  rowActive: { backgroundColor: 'rgba(107,33,168,0.15)' },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarActive: { backgroundColor: COLORS.purpleDeep },
  avatarTxt: { fontSize: 14, fontWeight: '700', color: COLORS.textDim },
  name: { flex: 1, fontSize: 15, color: COLORS.white, fontWeight: '500' },
  nameActive: { color: COLORS.purpleNeon, fontWeight: '600' },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.divider, alignItems: 'center', justifyContent: 'center' },
  checkActive: { backgroundColor: COLORS.purpleNeon, borderColor: COLORS.purpleNeon },
  checkMark: { fontSize: 12, color: COLORS.white, fontWeight: '800' },
  doneBtn: { backgroundColor: COLORS.purpleDeep, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 12 },
  doneTxt: { fontSize: 15, fontWeight: '700', color: COLORS.white },
});
