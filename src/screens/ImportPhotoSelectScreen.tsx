import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
  Animated,
  Platform,
} from 'react-native';
import { Text } from '../ui/Text';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useRecords } from '../store/recordStore';
import { copyTripOriginals, bakeCoverCrop, type PhotoRef } from '../utils/importPhotoStore';
import { groupUrisByDay, newSectionId } from '../utils/albumSections';
import type { RootStackScreenProps } from '../navigation/types';
import CutPhotoAdjustModal, { AdjustedCoverImage, type CutTransform } from '../components/CutPhotoAdjustModal';
import { getMaxAlbumPhotos } from '../constants/limits';
import { useSettings } from '../store/settingsStore';
import { classifyImportTarget } from '../utils/importRouting';
import { COUNTRIES } from '../constants/countries';
import { useBlockHardwareBack } from '../hooks/useBlockHardwareBack';
import { indexAtPoint, rangeBetween } from '../utils/gridHitTest';
import StarFieldBackground from '../components/StarFieldBackground';
import { IntroAmbient } from './introVisuals';
import ImportCtaButton from '../components/ImportCtaButton';
import AssetImage from '../components/AssetImage';
import { useStageWidth, STAGE_MAX_W } from '../utils/stage';

export type TripPhoto = PhotoRef & { creationTime?: number };

export interface ImportTrip {
  id: string;
  country: string; countryName: string; countryFlag: string;
  title: string; date: string; startDate: string; endDate: string;
  photos: TripPhoto[];
}

// 일별 필터용 날짜 키/라벨 (creationTime 없는 사진은 '전체'에서만 노출)
const dayKey = (ts?: number): string | null => {
  if (!ts) return null;
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};
const dayLabel = (key: string): string => {
  const [, m, d] = key.split('.');
  return `${Number(m)}월 ${Number(d)}일`;
};

// 빈 trips 방어용 자리표시자 — 훅 순서를 지키기 위해서만 쓰이고 화면에 그려지지는 않는다
// (모든 훅을 부른 뒤 렌더 직전에 null을 반환한다).
const EMPTY_TRIP: ImportTrip = {
  id: '', country: '', countryName: '', countryFlag: '',
  title: '', date: '', startDate: '', endDate: '', photos: [],
};

const COL = 3;
const GRID_PAD = 16; // FlatList contentContainer 안쪽 여백
const GRID_GAP = 8;  // 셀 사이 간격 (columnWrapperStyle.gap · ItemSeparator 높이와 같아야 한다)
// CELL은 폭에서 파생되므로 훅으로 계산한다(useCellSize). 모듈 최상위 stageWidthNow()로
// 박제하면 접힌 채(360dp) 시작해 펼쳤을 때(화면은 480dp로 클램프) 3열 그리드가 360dp 폭에
// 머물러 약 100dp가 비고, 무엇보다 이 값이 드래그 다중선택의 셀 히트테스트(indexAtPoint)에
// 그대로 들어가서 손가락 아래가 아닌 셀이 선택된다.
const useCellSize = () => Math.floor((useStageWidth() - GRID_PAD * 2 - GRID_GAP * (COL - 1)) / COL);

// ─── 드래그 다중선택 튜닝 값 ───
// 실기기에서 손맛을 보고 조정할 값들이라 한곳에 모아 둔다.
const DRAG_ACTIVATE_X = 8;  // 가로로 이만큼 움직이면 '선택' 제스처로 확정
const DRAG_FAIL_Y = 12;     // 세로로 이만큼 먼저 움직이면 제스처 포기 → FlatList 스크롤에 넘긴다
const AUTOSCROLL_EDGE = 80; // 리스트 위/아래 이 거리 안에 손가락이 오면 자동 스크롤
const AUTOSCROLL_TICK = 32; // 자동 스크롤 타이머 간격(ms)
const AUTOSCROLL_MAX = 24;  // 한 틱에 움직일 최대 거리(px) — 가장자리에 가까울수록 이 값에 근접
// 가장자리 영역에 '막 들어섰을 때'의 최소 속도 비율.
// 0이면 경계 근처에서 사실상 멈춰 있어 스크롤이 시작되지 않은 것처럼 느껴진다.
const AUTOSCROLL_MIN_RATIO = 0.3;

// 미리보기 카드 크기 — 위치 조정과 실제 크롭이 같은 비율을 쓰도록 공유
const CARD_H = 180;

// 사진 셀 — 선택 시 살짝 줌아웃되며 마젠타 프레임이 드러나고, 순번 배지가 스프링으로 팝인.
//
// React.memo 필수 — 드래그 다중선택은 셀 하나를 지날 때마다 setSelected를 부른다.
// 메모가 없으면 그때마다 화면의 모든 셀이 다시 그려지고(각 셀에 스프링 애니메이션이 있다)
// 드래그가 눈에 띄게 끊긴다. onToggle을 uri 인자로 받는 것도 같은 이유다 —
// 호출부에서 `() => toggle(uri)` 를 만들면 매 렌더 새 함수라 메모가 무력화된다.
const PhotoCell = React.memo(function PhotoCell({ uri, assetId, order, onToggle }: {
  uri: string; assetId?: string; order: number; onToggle: (uri: string) => void;
}) {
  const on = order > 0;
  const CELL = useCellSize(); // 창 크기가 바뀌면 셀도 따라간다(메모돼 있어도 훅이라 갱신된다)
  const scale = useRef(new Animated.Value(on ? 1 : 0)).current; // 0=미선택(꽉참), 1=선택(줌아웃)
  useEffect(() => {
    Animated.spring(scale, { toValue: on ? 1 : 0, friction: 7, tension: 140, useNativeDriver: true }).start();
  }, [on, scale]);
  const imgScale = scale.interpolate({ inputRange: [0, 1], outputRange: [1, 0.955] });
  const badgeScale = scale.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => onToggle(uri)} style={[st.cellWrap, { width: CELL, height: CELL }]}>
      {/* ph:// 자가 복구를 위해 AssetImage 사용 — 스케일은 바깥 Animated.View가 담당.
          ⚠️ 이 래퍼에 크기를 반드시 줘야 한다. 크기가 없으면 Yoga 가 자식 크기에 맞추려 하는데
          자식(st.cell)은 width/height 가 '100%' 라 부모를 참조 → 순환이 되어 둘 다 0으로 접힌다.
          그러면 이미지가 0×0 으로 그려져 cellWrap 의 흰 배경만 보인다(= 흰 타일 증상). */}
      <Animated.View style={{ width: '100%', height: '100%', transform: [{ scale: imgScale }] }}>
        <AssetImage uri={uri} assetId={assetId} style={st.cell} />
      </Animated.View>
      {on ? (
        <Animated.View style={[st.badgeOn, { transform: [{ scale: badgeScale }] }]}>
          <LinearGradient
            colors={['#FF14E4', '#00D8F3']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={st.badgeNum}>{order}</Text>
        </Animated.View>
      ) : (
        <View style={st.badgeOff} />
      )}
    </TouchableOpacity>
  );
});

export default function ImportPhotoSelectScreen({ navigation, route }: RootStackScreenProps<'ImportPhotoSelect'>) {
  const CELL = useCellSize();
  const stageW = useStageWidth();
  const CARD_W = stageW - 40; // 시트 좌우 패딩 20×2
  const CARD_ASPECT = CARD_W / CARD_H;
  // 스와이프와 함께 하드웨어 뒤로가기도 막는다 — 그냥 두면 고른 사진이 확인창 없이 통째로 날아간다.
  // 나가는 길은 화면 안 '이전' 버튼이며, 첫 단계에서는 확인 후 결과 목록으로 돌아간다(goPrev).
  useBlockHardwareBack();
  const { t } = useTranslation();
  const { trips } = route.params as { trips: ImportTrip[] };
  const { addImportedAlbum, addTripGroup, activeStayGroup, absorbIntoStay } = useRecords();
  const insets = useSafeAreaInsets();
  const { isPremium, homeCountryCode, setLastImportAt } = useSettings();
  // 사진첩(앨범) 상한을 쓴다 — 이 화면이 만드는 건 피드 기록이 아니라 앨범이기 때문이다
  // (save()가 addImportedAlbum을 부르고, 그 레코드는 viewType: 'album'이다).
  // 예전엔 getMaxRecordPhotos(20장)를 써서 AlbumCreateScreen·TripRecordScreen(100장)과 어긋났다.
  // 용량 근거도 같다: 앨범 발행은 albumPublishOpts가 'compressed'(장변 2048)로 올린다.
  const maxPhotosPerTrip = getMaxAlbumPhotos(isPremium);

  const [index, setIndex] = useState(0);
  // 여행별 선택된 사진 uri 집합
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [dayFilter, setDayFilter] = useState<string | null>(null); // null = 전체
  // 여행별 썸네일(대표 사진) uri. 미지정/선택 해제 시 첫 번째 선택 사진으로 대체
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [previewVisible, setPreviewVisible] = useState(false); // 기록 카드 미리보기
  // 여행별 썸네일 위치 조정값 — 어떤 사진에 대한 값인지 uri로 묶어 커버가 바뀌면 무시
  const [coverAdjusts, setCoverAdjusts] = useState<Record<string, { uri: string; t: CutTransform }>>({});
  const [adjustVisible, setAdjustVisible] = useState(false);

  // ⚠️ 빈 trips 방어(return null)는 여기서 하면 안 된다 — 아래에 훅(useRef/useMemo/useEffect)이
  //    있어서, 훅보다 앞에서 return하면 렌더마다 훅 개수가 달라져 React 훅 규칙을 어긴다
  //    (다음 렌더에서 훅 순서가 밀려 엉뚱한 상태를 읽는다). 자리표시자로 훅 순서를 지키고
  //    실제 방어는 모든 훅 뒤(렌더 직전)에서 한다.
  const trip = trips[index] ?? EMPTY_TRIP;
  const sel = selected[trip.id] ?? [];
  const isLast = index === trips.length - 1;
  const cover = covers[trip.id] && sel.includes(covers[trip.id]) ? covers[trip.id] : sel[0];
  const adjustEntry = coverAdjusts[trip.id];
  const activeAdjust = adjustEntry && adjustEntry.uri === cover ? adjustEntry.t : null;

  // 이 여행에서 사진이 있는 날짜 목록(시간순). 선택(sel)은 uri 기준이라 필터와 무관하게 유지된다.
  const days = Array.from(
    new Set(trip.photos.map((p) => dayKey(p.creationTime)).filter((k): k is string => k !== null))
  ).sort();
  const visiblePhotos = dayFilter
    ? trip.photos.filter((p) => dayKey(p.creationTime) === dayFilter)
    : trip.photos;

  // ─────────────────────────────────────────────
  // 드래그 다중선택
  //
  // 규칙: 드래그를 시작한 사진이 미선택이면 지나가는 구간을 전부 '선택', 이미 선택돼 있으면
  //       전부 '해제'한다(칠하기). 손가락을 되돌리면 그만큼 원래대로 돌아간다.
  //
  // 되돌리기가 되는 이유: 매 이동마다 누적 토글을 하는 게 아니라, '드래그 시작 시점의
  // 선택 스냅샷'에서 구간만 다시 칠한다. 범위가 줄면 빠진 셀은 스냅샷 상태로 복귀한다.
  // (누적 토글 방식은 손떨림으로 같은 셀을 두 번 지나가면 값이 뒤집혀 못 쓴다)
  // ─────────────────────────────────────────────
  const listRef = useRef<FlatList<TripPhoto>>(null);
  const scrollYRef = useRef(0);
  const listHeightRef = useRef(0);
  const dragAnchorRef = useRef<number | null>(null);      // 드래그 시작 셀 인덱스
  const dragModeRef = useRef<'select' | 'deselect'>('select');
  const dragBaseRef = useRef<string[]>([]);               // 시작 시점 선택 스냅샷
  const dragLastIdxRef = useRef<number | null>(null);     // 마지막으로 지난 셀(햅틱·gap 통과용)
  const dragCappedRef = useRef(false);                    // 상한에 걸린 적 있음 → 손 뗄 때 1회 안내
  const dragPointRef = useRef({ x: 0, y: 0 });            // 자동 스크롤 틱에서 재계산할 손가락 좌표
  const autoScrollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 제스처 콜백은 생성 시점의 클로저를 잡는다(PanResponder stale 클로저와 같은 함정).
  // 드래그 도중 최신값이어야 하는 둘만 ref로 흘려보낸다: 보이는 사진 목록과 현재 선택.
  const visibleRef = useRef<TripPhoto[]>(visiblePhotos);
  visibleRef.current = visiblePhotos;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const stopAutoScroll = () => {
    if (autoScrollRef.current) { clearInterval(autoScrollRef.current); autoScrollRef.current = null; }
  };

  // 드래그 구간을 스냅샷 위에 다시 칠한다. 상한을 넘으면 앞쪽부터 담을 수 있는 만큼만.
  const paintRange = (fromIdx: number, toIdx: number) => {
    const photos = visibleRef.current;
    const [start, end] = rangeBetween(fromIdx, toIdx);
    const base = dragBaseRef.current;
    const inRange = photos.slice(start, end + 1).map((p) => p.uri);
    if (dragModeRef.current === 'deselect') {
      const drop = new Set(inRange);
      setSelected((prev) => ({ ...prev, [trip.id]: base.filter((u) => !drop.has(u)) }));
      return;
    }
    // 선택: 스냅샷에 없던 것만, 그리드 순서대로 이어붙인다(뱃지 번호 = 그리드 순서)
    const add = inRange.filter((u) => !base.includes(u));
    const room = Math.max(0, maxPhotosPerTrip - base.length);
    if (add.length > room) dragCappedRef.current = true;
    setSelected((prev) => ({ ...prev, [trip.id]: [...base, ...add.slice(0, room)] }));
  };

  // 현재 손가락 좌표로 셀을 다시 찾아 구간을 갱신. 자동 스크롤 틱에서도 같은 함수를 쓴다.
  const applyDragAt = (x: number, y: number) => {
    if (dragAnchorRef.current === null) return;
    const idx = indexAtPoint(x, y, scrollYRef.current, {
      cell: CELL, gap: GRID_GAP, padding: GRID_PAD, columns: COL, count: visibleRef.current.length,
    });
    // gap 위나 격자 밖이면 직전 셀을 유지한다 — 가장 가까운 셀로 끌어붙이면
    // 손가락이 닿지도 않은 옆 사진이 선택된다
    if (idx === null || idx === dragLastIdxRef.current) return;
    dragLastIdxRef.current = idx;
    Haptics.selectionAsync().catch(() => {}); // 새 셀에 들어갈 때만 (매 프레임 아님)
    paintRange(dragAnchorRef.current, idx);
  };

  // 리스트 위/아래 가장자리에 손가락이 오면 스크롤을 흘려보내며 선택을 계속 확장한다.
  // 손가락이 멈춰 있어도 콘텐츠가 움직이므로 틱마다 좌표를 '다시' 인덱스로 바꿔야 한다.
  const tickAutoScroll = () => {
    const { y } = dragPointRef.current;
    const h = listHeightRef.current;
    if (h <= 0) return;
    // 가장자리에 얼마나 깊이 들어왔는지(0=경계, 1=끝)에 비례해 빨라진다.
    // 다만 경계에서 0으로 시작하면 "스크롤이 안 되는데?" 처럼 느껴져 최소 속도를 깔아 준다.
    const ramp = (depth: number) => AUTOSCROLL_MIN_RATIO + (1 - AUTOSCROLL_MIN_RATIO) * depth;
    let dy = 0;
    if (y < AUTOSCROLL_EDGE) {
      dy = -AUTOSCROLL_MAX * ramp(1 - Math.max(0, y) / AUTOSCROLL_EDGE);
    } else if (y > h - AUTOSCROLL_EDGE) {
      dy = AUTOSCROLL_MAX * ramp(1 - Math.max(0, h - y) / AUTOSCROLL_EDGE);
    }
    if (dy === 0) return;
    const next = Math.max(0, scrollYRef.current + dy);
    listRef.current?.scrollToOffset({ offset: next, animated: false });
    // onScroll이 오기 전에 계산이 어긋나지 않게 예상 위치를 먼저 반영한다
    scrollYRef.current = next;
    applyDragAt(dragPointRef.current.x, dragPointRef.current.y);
  };

  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        // 저장소 관례(SocialScreen·CutPhotoAdjustModal)와 동일 — 콜백을 JS 스레드에서 돌린다.
        // 선택 상태가 React state라 어차피 JS로 넘어와야 한다.
        .runOnJS(true)
        // 가로로 먼저 움직이면 선택, 세로로 먼저 움직이면 실패시켜 FlatList 스크롤에 넘긴다
        .activeOffsetX([-DRAG_ACTIVATE_X, DRAG_ACTIVATE_X])
        .failOffsetY([-DRAG_FAIL_Y, DRAG_FAIL_Y])
        .onStart((e) => {
          const photos = visibleRef.current;
          const idx = indexAtPoint(e.x, e.y, scrollYRef.current, {
            cell: CELL, gap: GRID_GAP, padding: GRID_PAD, columns: COL, count: photos.length,
          });
          if (idx === null) return;
          const cur = selectedRef.current[trip.id] ?? [];
          dragAnchorRef.current = idx;
          dragBaseRef.current = cur;
          dragLastIdxRef.current = idx;
          dragCappedRef.current = false;
          // 시작 사진의 상태가 이 드래그의 성격을 정한다(선택돼 있었으면 '해제 칠하기')
          dragModeRef.current = cur.includes(photos[idx].uri) ? 'deselect' : 'select';
          Haptics.selectionAsync().catch(() => {});
          paintRange(idx, idx);
        })
        .onUpdate((e) => {
          if (dragAnchorRef.current === null) return;
          dragPointRef.current = { x: e.x, y: e.y };
          applyDragAt(e.x, e.y);
          // 가장자리 진입/이탈에 따라 자동 스크롤 타이머를 켜고 끈다
          const h = listHeightRef.current;
          const nearEdge = h > 0 && (e.y < AUTOSCROLL_EDGE || e.y > h - AUTOSCROLL_EDGE);
          if (nearEdge && !autoScrollRef.current) {
            autoScrollRef.current = setInterval(tickAutoScroll, AUTOSCROLL_TICK);
          } else if (!nearEdge) {
            stopAutoScroll();
          }
        })
        .onFinalize(() => {
          stopAutoScroll();
          const capped = dragCappedRef.current;
          dragAnchorRef.current = null;
          dragLastIdxRef.current = null;
          dragCappedRef.current = false;
          // 상한 안내는 손을 뗀 뒤 한 번만 — 드래그 중에 장마다 띄우면 기능을 쓸 수 없다
          if (capped) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            Alert.alert(t('imports.noticeTitle'), t('imports.maxPhotosAlert', { max: maxPhotosPerTrip }));
          }
        }),
    // 여행이 바뀔 때만 다시 만든다 — 그 시점엔 진행 중인 드래그가 없어 안전하고,
    // 매 렌더 재생성처럼 드래그 도중 제스처가 갈아끼워지는 일도 없다.
    // 안에서 읽는 가변값 중 '드래그 시작 시점의 최신값'이 필요한 선택 목록만 ref로 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trip.id, maxPhotosPerTrip, t]
  );

  // 언마운트·여행 전환 시 자동 스크롤 타이머 정리 (남으면 다음 여행에서 혼자 스크롤된다)
  useEffect(() => () => stopAutoScroll(), []);

  // 여행이 바뀌거나 일별 필터가 바뀌면 인덱스 기준(visiblePhotos)이 통째로 달라진다 —
  // 남아 있던 드래그 상태를 그대로 쓰면 엉뚱한 사진 구간이 칠해진다.
  useEffect(() => {
    stopAutoScroll();
    dragAnchorRef.current = null;
    dragLastIdxRef.current = null;
    dragCappedRef.current = false;
    // 목록을 맨 위로 되감는다. scrollYRef만 0으로 두고 실제 리스트는 그대로면 좌표 계산이
    // 통째로 어긋나 엉뚱한 사진이 칠해진다 — 둘을 반드시 같이 맞춘다.
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    scrollYRef.current = 0;
  }, [index, dayFilter]);

  // PhotoCell(React.memo)에 넘길 안정적인 콜백 — 매 렌더 새 함수를 만들면 메모가 무력화된다.
  // 최신 toggle은 ref로 흘려보낸다.
  const toggleRef = useRef<(uri: string) => void>(() => {});
  const onToggle = useCallback((uri: string) => toggleRef.current(uri), []);

  const toggle = (uri: string) => {
    const cur = selected[trip.id] ?? [];
    if (cur.includes(uri)) {
      Haptics.selectionAsync().catch(() => {});
      setSelected((prev) => ({ ...prev, [trip.id]: (prev[trip.id] ?? []).filter((u) => u !== uri) }));
      return;
    }
    if (cur.length >= maxPhotosPerTrip) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      Alert.alert(t('imports.noticeTitle'), t('imports.maxPhotosAlert', { max: maxPhotosPerTrip }));
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    setSelected((prev) => ({ ...prev, [trip.id]: [...(prev[trip.id] ?? []), uri] }));
  };
  toggleRef.current = toggle; // 위 onToggle이 항상 최신 toggle을 부르도록

  // 전체(또는 이 날짜) 선택/해제 — 현재 보이는 사진 대상, 상한 내에서 기존 순서 보존하며 추가.
  // 더 담을 게 없으면(모두 선택됐거나 상한에 걸려 방이 없음) '전체 해제' 모드로 전환.
  const visibleUris = visiblePhotos.map((p) => p.uri);
  const canAddMore = visibleUris.some((u) => !sel.includes(u)) && sel.length < maxPhotosPerTrip;
  const showDeselect = !canAddMore && sel.length > 0;
  const toggleSelectAll = () => {
    Haptics.selectionAsync().catch(() => {});
    setSelected((prev) => {
      const cur = prev[trip.id] ?? [];
      if (showDeselect) {
        return { ...prev, [trip.id]: cur.filter((u) => !visibleUris.includes(u)) };
      }
      const toAdd = visibleUris.filter((u) => !cur.includes(u));
      const room = Math.max(0, maxPhotosPerTrip - cur.length);
      if (toAdd.length > room) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
      return { ...prev, [trip.id]: [...cur, ...toAdd.slice(0, room)] };
    });
  };

  // 다음/완료 → 바로 진행하지 않고 기록 카드 미리보기에서 썸네일을 확정하게 한다
  const next = () => {
    if (sel.length === 0) return;
    setPreviewVisible(true);
  };

  const confirmPreview = () => {
    setPreviewVisible(false);
    if (!isLast) {
      setDayFilter(null); // 다음 여행으로 넘어가면 일별 필터 초기화
      setIndex((i) => i + 1);
      return;
    }
    save();
  };

  const prev = () => {
    if (index === 0) return;
    setDayFilter(null); // 여행이 바뀌므로 일별 필터 초기화 (선택 내역은 여행별로 유지됨)
    setIndex((i) => i - 1);
  };

  // '이전' 버튼의 실제 동작. 첫 여행(STEP 1)에서는 앞 화면(스캔 결과 목록)으로 나간다 —
  // 예전엔 index>0 일 때만 버튼을 그려서, 여행이 하나뿐이거나 첫 단계에 들어온 순간
  // 화면상 되돌아갈 길이 사라졌다(제스처·하드웨어 뒤로만 가능했다).
  //
  // 나갈 때 고른 사진은 사라진다(선택은 이 화면의 로컬 상태). 그래서 고른 게 있을 때만 한 번 확인한다.
  // 여행 사이 이동(index>0)은 선택이 그대로 남으므로 확인 없이 즉시 넘어간다.
  const goPrev = () => {
    if (index > 0) { prev(); return; }
    const hasPicked = Object.values(selected).some((a) => a.length > 0);
    if (!hasPicked) { navigation.goBack(); return; }
    Alert.alert(t('imports.leaveSelectTitle'), t('imports.leaveSelectMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('imports.leaveSelectOk'), style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  };

  const save = async () => {
    setSaving(true);
    try {
      // 완료 화면 요약용 — 실제로 만들어진 여행 수/사진 수/국가 누적
      let tripCount = 0;
      let photoCount = 0;
      const countries: { flag: string; name: string }[] = [];
      const trFn = t; // 아래 루프의 t(여행)가 번역 함수 t를 가리므로 별칭 사용
      const homeCountryName = COUNTRIES.find((c) => c.term.split(' ')[0].toUpperCase() === (homeCountryCode || '').toUpperCase())?.name ?? null;
      const stayCountryName = activeStayGroup?.stay?.status !== 'ended' ? (activeStayGroup?.countryName ?? null) : null;
      for (const t of trips) {
        const uris = selected[t.id] ?? [];
        if (uris.length === 0) continue; // 선택 0장 → 카드 생성 안 함
        const coverUri = covers[t.id] && uris.includes(covers[t.id]) ? covers[t.id] : uris[0];
        // 저장 순서 = 사용자가 고른 순서(셀에 1,2,3…으로 보여 준 순번).
        // photos 배열을 filter하면 촬영순으로 되돌아가 화면의 순번과 결과가 어긋났다.
        const byUri = new Map(t.photos.map((p) => [p.uri, p]));
        const picked = uris
          .map((u) => byUri.get(u))
          .filter((p): p is TripPhoto => !!p);
        // 썸네일(대표 사진)을 맨 앞에 복사 → medias[0]이 여행 기록 카드의 썸네일이 된다
        const items: PhotoRef[] = [
          ...picked.filter((p) => p.uri === coverUri),
          ...picked.filter((p) => p.uri !== coverUri),
        ];
        const { uris: copied, firstItemCopied, srcIndexes } = await copyTripOriginals(t.id, items);
        if (copied.length === 0) continue;
        // 위치 조정값이 있으면 보이는 영역만 실제 크롭해 카드 썸네일 전용본으로 저장.
        // 커버(0번) 복사가 실패했으면 copied[0]은 '다른 사진'이므로 크롭을 굽지 않는다.
        const adj = coverAdjusts[t.id];
        let repUri: string | undefined;
        if (adj && adj.uri === coverUri && firstItemCopied) {
          repUri = (await bakeCoverCrop(copied[0], adj.t, CARD_ASPECT, t.id)) ?? undefined;
        }
        // 날짜별 자동 섹션 — 촬영일이 2일 이상이면 'n일차' 섹션으로 자동 정리 (미상은 '기타')
        const pairs = copied.map((uri, k) => ({ uri, time: (items[srcIndexes[k]] as TripPhoto | undefined)?.creationTime }));
        const groups = groupUrisByDay(pairs);
        let mediasOrdered = copied;
        let autoSections: { id: string; title: string; count: number }[] | undefined;
        if (groups.filter((g) => g.key !== null).length >= 2) {
          mediasOrdered = groups.flatMap((g) => g.uris);
          let dayN = 0;
          autoSections = groups.map((g) => ({
            id: newSectionId(),
            title: g.key ? trFn('comp.sectionDayN', { n: ++dayN }) : trFn('comp.sectionEtc'),
            count: g.uris.length,
          }));
        }
        // 복사본 uri → 원본 갤러리 자산 id / 촬영시각.
        // assetId는 "이 사진은 이미 가져왔다"는 근거가 되어, 앱 내에서 다시 스캔할 때
        // 같은 여행이 중복 카드로 또 만들어지는 것을 막는다(사진첩 생성 화면과 동일 규약).
        const mediaAssetIds: Record<string, string> = {};
        const mediaTimes: Record<string, number> = {};
        copied.forEach((uri, k) => {
          const src = items[srcIndexes[k]] as TripPhoto | undefined;
          if (src?.id) mediaAssetIds[uri] = src.id;
          if (src?.creationTime) mediaTimes[uri] = src.creationTime;
        });
        const recId = addImportedAlbum({
          country: t.country, countryName: t.countryName, countryFlag: t.countryFlag,
          date: t.date, startDate: t.startDate, endDate: t.endDate,
          title: t.title, medias: mediasOrdered,
          // 날짜 정렬로 medias[0]이 커버가 아닐 수 있으므로 카드 썸네일용 대표를 명시
          representativePhoto: repUri ?? (firstItemCopied ? copied[0] : undefined),
          albumSections: autoSections,
          mediaAssetIds,
          mediaTimes,
        }).id;
        // 진행 중 체류국 사진이면 체류 카드로 흡수(백데이팅), 제3국이면 별도 여행 카드
        const target = classifyImportTarget(t.countryName, homeCountryName, stayCountryName);
        if (target === 'stay') {
          absorbIntoStay(recId, t.startDate);
          photoCount += copied.length;
        } else if (target === 'trip') {
          // 제목에 국기를 넣지 않는다 — 프로필 카드가 `${countryFlag} ${title}`로 렌더링해 중복됨
          addTripGroup({ title: t.title, records: [recId], coverRecordId: recId });
          tripCount += 1;
          photoCount += copied.length;
          countries.push({ flag: t.countryFlag, name: t.countryName });
        }
        // 'skip'(거주국)은 clusterForeignTrips가 이미 제외 — 방어적으로 무시
      }
      // 다음 재스캔의 기본 기간 기준점 — 실제로 사진이 들어온 경우에만 갱신한다.
      // (0장이면 기준을 옮기면 안 된다. 사용자가 이번에 안 담은 사진들을 다음 스캔에서
      //  기간 밖으로 밀어내 영영 못 찾게 되기 때문)
      if (photoCount > 0) setLastImportAt(Date.now());
      navigation.reset({
        index: 1,
        routes: [
          { name: 'Main' },
          { name: 'ImportComplete', params: { tripCount, photoCount, countries, from: route.params?.from } },
        ],
      });
    } catch {
      setSaving(false);
      Alert.alert(t('imports.saveFailTitle'), t('imports.saveFailMsg'));
    }
  };

  // 빈 trips 방어 — 위 EMPTY_TRIP 주석 참조. 훅을 전부 부른 뒤라 안전하다.
  if (!trips[index]) return null;

  if (saving) {
    return (
      <View style={st.center}>
        <StarFieldBackground opacity={0.5} />
        <IntroAmbient />
        <ActivityIndicator color="#EC34F7" size="large" />
        <Text style={st.savingText}>{t('imports.savingAlbum')}</Text>
      </View>
    );
  }

  return (
    <View style={st.container}>
      <StarFieldBackground opacity={0.5} />
      <IntroAmbient />
      <View style={[st.header, { paddingTop: insets.top + 24 }]}>
        <Text style={st.step}>STEP {index + 1} / {trips.length}</Text>
        <Text style={st.title}>{trip.countryFlag} {trip.title}</Text>
        <Text style={st.sub}>{t('imports.selectPhotosMax', { max: maxPhotosPerTrip })}</Text>
        {/* 드래그 선택은 눈에 보이지 않는 기능이라 한 줄로 알린다 */}
        <Text style={st.dragHint}>{t('imports.dragSelectHint')}</Text>
      </View>

      {/* 일별 보기 필터 */}
      {days.length > 0 && (
        <View style={st.dayBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.dayRow}>
            <TouchableOpacity
              style={[st.dayChip, dayFilter === null && st.dayChipOn]}
              onPress={() => setDayFilter(null)}
              activeOpacity={0.8}
            >
              <Text style={[st.dayTxt, dayFilter === null && st.dayTxtOn]}>{t('imports.all')}</Text>
            </TouchableOpacity>
            {days.map((d) => {
              const on = dayFilter === d;
              return (
                <TouchableOpacity
                  key={d}
                  style={[st.dayChip, on && st.dayChipOn]}
                  onPress={() => setDayFilter(d)}
                  activeOpacity={0.8}
                >
                  <Text style={[st.dayTxt, on && st.dayTxtOn]}>{dayLabel(d)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* 선택 카운터 + 전체(이 날짜) 선택 토글 */}
      <View style={st.selectBar}>
        <Text style={st.counter}>{sel.length} <Text style={st.counterMax}>/ {maxPhotosPerTrip}</Text></Text>
        {visibleUris.length > 0 && (
          <TouchableOpacity onPress={toggleSelectAll} activeOpacity={0.8} style={st.selAllBtn}>
            <Text style={st.selAllTxt}>
              {showDeselect
                ? t('album.deselectAll')
                : dayFilter ? t('album.selectAllDay') : t('album.selectAll')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* GestureDetector는 뷰를 추가하지 않고 자식(FlatList)에 붙는다 — 그래서 제스처 이벤트의
          x/y가 곧 리스트 로컬 좌표라 별도 측정 없이 indexAtPoint에 넘길 수 있다. */}
      <GestureDetector gesture={dragGesture}>
        <FlatList
          ref={listRef}
          data={visiblePhotos}
          keyExtractor={(p, i) => p.uri + i}
          numColumns={COL}
          contentContainerStyle={{ padding: GRID_PAD, paddingBottom: 130 }}
          columnWrapperStyle={{ gap: GRID_GAP }}
          ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
          // 드래그 좌표 → 인덱스 변환에 쓰는 두 값. scrollEventThrottle 16이면 자동 스크롤과도 어긋나지 않는다.
          onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
          onLayout={(e) => { listHeightRef.current = e.nativeEvent.layout.height; }}
          renderItem={({ item }) => (
            <PhotoCell uri={item.uri} assetId={item.id} order={sel.indexOf(item.uri) + 1} onToggle={onToggle} />
          )}
        />
      </GestureDetector>

      <View style={[st.bottom, { paddingBottom: insets.bottom + 16 }]}>
        <View style={st.bottomRow}>
          {/* 첫 단계에서도 항상 노출 — 단계마다 버튼이 생겼다 사라지며 CTA 폭이 튀던 것도 함께 사라진다 */}
          <TouchableOpacity style={st.prevBtn} onPress={goPrev} activeOpacity={0.85}>
            <Text style={st.prevTxt}>{t('imports.prev')}</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <ImportCtaButton
              gid="photoNextCta"
              disabled={sel.length === 0}
              onPress={next}
              label={sel.length === 0 ? t('imports.selectAtLeastOne') : isLast ? t('imports.done') : t('imports.next')}
            />
          </View>
        </View>
      </View>

      {/* 기록 카드 미리보기 + 썸네일 선택 */}
      <Modal visible={previewVisible} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => setPreviewVisible(false)}>
        <View style={st.pvOverlay} accessibilityViewIsModal>
          {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) */}
          <View style={[st.pvSheet, { paddingBottom: Platform.OS === 'ios' ? 40 : insets.bottom + 16 }]}>
            <Text style={st.pvTitle}>{t('imports.previewTitle')}</Text>
            <Text style={st.pvSub}>{t('imports.previewSub')}</Text>

            {/* 카드 예시 — 탭하면 노출 영역 조정 */}
            <TouchableOpacity style={st.pvCard} activeOpacity={0.9} onPress={() => cover && setAdjustVisible(true)}>
              {cover && (
                <AdjustedCoverImage uri={cover} transform={activeAdjust} frameW={CARD_W} frameH={CARD_H} />
              )}
              <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.7)']} style={st.pvCardShade} />
              <View style={st.pvCardInfo}>
                <Text style={st.pvCardTitle}>{trip.countryFlag} {trip.title}</Text>
                <Text style={st.pvCardDate}>
                  {trip.startDate} ~ {trip.endDate.substring(5)}
                </Text>
              </View>
            </TouchableOpacity>

            {/* 썸네일 선택 — 선택된 썸네일을 한 번 더 누르면 노출 영역 조정 */}
            <Text style={st.pvPickLabel}>{t('imports.pickThumb')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.pvStrip}>
              {sel.map((uri) => {
                const on = uri === cover;
                return (
                  <TouchableOpacity
                    key={uri}
                    onPress={() => {
                      if (on) {
                        setAdjustVisible(true);
                      } else {
                        setCovers((prev) => ({ ...prev, [trip.id]: uri }));
                        setCoverAdjusts((prev) => {
                          const next = { ...prev };
                          delete next[trip.id];
                          return next;
                        });
                      }
                    }}
                    activeOpacity={0.85}
                  >
                    <AssetImage uri={uri} assetId={trip.photos.find((p) => p.uri === uri)?.id} style={[st.pvThumb, on && st.pvThumbOn] as any} />
                    {on && (
                      <View style={st.pvThumbAdjustBadge}>
                        <Text style={st.pvThumbAdjustTxt}>{t('imports.adjust')}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={st.pvBtnRow}>
              <TouchableOpacity style={st.pvBackBtn} onPress={() => setPreviewVisible(false)} activeOpacity={0.85}>
                <Text style={st.pvBackTxt}>{t('imports.reselect')}</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <ImportCtaButton
                  gid="pvOkCta"
                  onPress={confirmPreview}
                  label={isLast ? t('imports.createNow') : t('imports.confirmNext')}
                />
              </View>
            </View>
          </View>

          {/* 썸네일 노출 영역 조정 (드래그/핀치) */}
          <CutPhotoAdjustModal
            visible={adjustVisible}
            uri={cover ?? null}
            aspect={CARD_ASPECT}
            initial={activeAdjust}
            onConfirm={(t) => {
              if (cover) setCoverAdjusts((prev) => ({ ...prev, [trip.id]: { uri: cover, t } }));
              setAdjustVisible(false);
            }}
            onCancel={() => setAdjustVisible(false)}
          />
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0F' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#0A0B0F' },
  savingText: { color: '#FFFFFF', fontSize: 14 },
  header: { paddingHorizontal: 16, paddingBottom: 8 },
  step: { color: '#EC34F7', fontSize: 12, fontWeight: '800', letterSpacing: 2, marginBottom: 6 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  sub: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  // 드래그 선택 안내 — 부제보다 한 단계 약하게(기능 힌트지 지시문이 아니다)
  dragHint: { color: 'rgba(255,255,255,0.38)', fontSize: 12, marginTop: 4 },
  dayBar: { marginTop: 10 },
  dayRow: { paddingHorizontal: 16, gap: 8 },
  dayChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.05)',
  },
  dayChipOn: { borderColor: '#EC34F7', backgroundColor: 'rgba(236, 52, 247, 0.18)' },
  dayTxt: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '500' },
  dayTxtOn: { color: '#FFFFFF', fontWeight: '700' },

  /* 선택 카운터 + 전체 선택 */
  selectBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginTop: 12, marginBottom: 2,
  },
  counter: { color: '#EC34F7', fontSize: 15, fontWeight: '800' },
  counterMax: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '600' },
  selAllBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(236, 52, 247, 0.4)', backgroundColor: 'rgba(236, 52, 247, 0.08)',
  },
  selAllTxt: { color: '#EC34F7', fontSize: 12, fontWeight: '700' },

  /* 사진 셀 */
  // 선택 시 이미지가 줌아웃되며 이 얇은 흰색 프레임이 드러난다(선택 신호는 순번 배지가 담당)
  cellWrap: {
    // width/height는 CELL(폭 파생)이라 호출부에서 인라인으로 준다.
    borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  cell: { width: '100%', height: '100%', borderRadius: 10, backgroundColor: '#2A2735' },
  badgeOff: {
    position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)', backgroundColor: 'rgba(0,0,0,0.25)',
  },
  badgeOn: {
    position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#FFFFFF',
  },
  badgeNum: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },

  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: 'rgba(10,11,15,0.95)' },
  bottomRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  prevBtn: {
    paddingHorizontal: 24, height: 64, borderRadius: 999, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center',
  },
  prevTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },

  /* 기록 카드 미리보기 모달 */
  pvOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  // 이 모달은 RN Modal이라 App.tsx 루트 클램프 바깥에서 렌더된다. CARD_W(→ AdjustedCoverImage
  // frameW)는 Stage 폭(≤480) 기준으로 계산되므로, 시트 자체도 같은 폭으로 가두고 중앙에
  // 둬야 폴드·태블릿에서 미리보기 카드가 왼쪽으로 쏠리지 않는다. pvOverlay(딤 배경)는
  // 전면 유지 — 시트만 좁힌다.
  pvSheet: {
    backgroundColor: '#141019', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40,
    width: '100%',
    maxWidth: STAGE_MAX_W,
    alignSelf: 'center',
  },
  pvTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  pvSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 16 },
  pvCard: {
    width: '100%', height: 180, borderRadius: 20, overflow: 'hidden',
    backgroundColor: '#2A2735', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  pvCardShade: { ...StyleSheet.absoluteFillObject },
  pvCardInfo: { position: 'absolute', left: 14, right: 14, bottom: 12 },
  pvCardTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', marginBottom: 2 },
  pvCardDate: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '500' },
  pvPickLabel: { color: '#EC34F7', fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  pvStrip: { gap: 8 },
  pvThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#2A2735' },
  pvThumbOn: { borderWidth: 2.5, borderColor: '#EC34F7' },
  pvThumbAdjustBadge: {
    position: 'absolute', bottom: 4, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2,
  },
  pvThumbAdjustTxt: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  pvBtnRow: { flexDirection: 'row', gap: 10, marginTop: 20, alignItems: 'center' },
  pvBackBtn: {
    paddingHorizontal: 20, height: 64, borderRadius: 999, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center',
  },
  pvBackTxt: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
