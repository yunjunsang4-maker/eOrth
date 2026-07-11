import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  Animated,
  PanResponder,
  LayoutAnimation,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import PhotoViewerModal from './PhotoViewerModal';
import { sectionSlices } from '../utils/albumSections';
import { TravelRecord, RecordViewType } from '../store/recordStore';
import { CameraIcon } from '../components/icons';
import CutPhotoCanvas from './CutPhotoCanvas';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface Props {
  record: TravelRecord;
  viewType: RecordViewType;
  onClose?: () => void;
  // 사진첩(앨범) 편집 — 내 기록 화면(TripRecordScreen)에서만 전달
  albumEditable?: boolean;
  onAlbumAddPhotos?: (sectionIndex?: number) => void;
  onAlbumStartSelect?: () => void; // 다중 선택 모드 진입 (이동/삭제는 선택 액션 바에서)
  onAlbumSetCover?: (index: number) => void; // 뷰어에서 커버(여행카드 썸네일)로 지정
  onAlbumAddSection?: () => void;
  onAlbumSectionMenu?: (sectionIndex: number) => void; // 헤더 ⋯: 이름변경/삭제
  // 다중 선택 모드 — 탭이 선택 토글로 바뀌고 체크 오버레이 표시
  albumSelecting?: boolean;
  albumSelected?: number[];
  onAlbumToggleSelect?: (globalIndex: number) => void;
  // 순서 변경 — 사진 꾹 누르기 제자리 드래그(프로필 카드와 동일 UX)의 결과 콜백
  onAlbumReorder?: (section: number | 'flat', fromIdx: number, toIdx: number) => void;
  // 드래그로 다른 섹션 그리드에 놓았을 때 (섹션 모드 전용)
  onAlbumMoveAcross?: (fromSection: number, fromLocal: number, toSection: number, toLocal: number) => void;
  onAlbumRemoveAt?: (globalIndex: number) => void;
  onAlbumDragStateChange?: (dragging: boolean) => void;
  // 드래그 중 손가락의 화면 Y좌표 (가장자리 자동 스크롤용, 드래그 끝나면 null)
  onAlbumDragPosition?: (pageY: number | null) => void;
  // 자동 스크롤 보정 — 화면이 스크롤한 만큼 타일 위치·목적지 계산에 더한다 (화면이 소유·증가, 렌더러가 드래그 종료 시 리셋)
  albumDragScroll?: { anim: Animated.Value; value: number };
}

// ─────────────────────────────────────────────
// 별점 표시
// ─────────────────────────────────────────────
function StarRow({ rating, size = 14 }: { rating?: number; size?: number }) {
  if (!rating) return null;
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Text key={s} style={[styles.star, { fontSize: size, color: s <= rating ? '#FBBF24' : '#3A3A55' }]}>
          ★
        </Text>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────
// 1. Feed
// ─────────────────────────────────────────────
function FeedView({ record }: { record: TravelRecord }) {
  const { t } = useTranslation();
  const firstMedia = record.medias?.[0];

  return (
    <View style={styles.feedCard}>
      {/* 사진 영역 (16:9) */}
      {firstMedia ? (
        <Image source={{ uri: firstMedia }} style={styles.feedImage} resizeMode="cover" />
      ) : (
        <View style={styles.feedImagePlaceholder}>
          <Text style={styles.placeholderIcon}>🏔️</Text>
        </View>
      )}

      {/* 본문 */}
      <View style={styles.feedBody}>
        {/* 국가 + 날짜 */}
        <View style={styles.feedMeta}>
          <Text style={styles.feedCountry}>{record.countryFlag} {record.countryName}</Text>
          <Text style={styles.feedDate}>{record.date}</Text>
        </View>

        {/* 제목 */}
        <Text style={styles.feedTitle} numberOfLines={2}>{record.content}</Text>

        {/* 메모 */}
        {record.memo ? (
          <Text style={styles.feedMemo} numberOfLines={3}>{record.memo}</Text>
        ) : null}

        {/* 하단: 별점 + 동행자 */}
        <View style={styles.feedFooter}>
          <StarRow rating={record.rating} size={14} />
          {record.companions && record.companions.length > 0 && (
            <Text style={styles.feedCompanions}>
              👥 {record.companions.slice(0, 2).join(', ')}
              {record.companions.length > 2 ? t('comp.andMore', { count: record.companions.length - 2 }) : ''}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// 2. Blog
// ─────────────────────────────────────────────
function BlogView({ record }: { record: TravelRecord }) {
  const { t } = useTranslation();
  return (
    <View style={styles.blogWrap}>
      {/* 국가 + 날짜 헤더 */}
      <View style={styles.blogHeader}>
        <Text style={styles.blogCountry}>{record.countryFlag} {record.countryName}</Text>
        <Text style={styles.blogDate}>{record.date}</Text>
      </View>

      {/* 별점 */}
      <StarRow rating={record.rating} size={16} />

      {/* 본문 */}
      <Text style={styles.blogContent}>{record.content}</Text>

      {/* 메모 */}
      {record.memo ? (
        <View style={styles.blogMemoCard}>
          <Text style={styles.blogMemoLabel}>{t('comp.memo')}</Text>
          <Text style={styles.blogMemoText}>{record.memo}</Text>
        </View>
      ) : null}

      {/* 키워드 */}
      {record.keywords && record.keywords.length > 0 && (
        <View style={styles.blogKeywords}>
          {record.keywords.map((kw, i) => (
            <View key={i} style={styles.blogKeywordTag}>
              <Text style={styles.blogKeywordText}>#{kw}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 동행자 */}
      {record.companions && record.companions.length > 0 && (
        <Text style={styles.blogCompanions}>
          👥 {record.companions.join(', ')}
        </Text>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────
// 3. Album
// ─────────────────────────────────────────────
const ALBUM_CELL = (SCREEN_W - 4) / 3;
// 그리드 셀 피치 — albumGrid gap(2) 포함. 드래그 목적지 슬롯 계산용
const ALBUM_PITCH = ALBUM_CELL + 2;

// 사진 타일 드래그 래퍼 — 프로필 여행카드(DraggableCardWrapper)와 동일한 제스처:
// 꾹(400ms) 누르면 그 자리에서 들어올려 손가락을 따라가고, 놓으면 대상 슬롯에 끼워진다.
// 짧은 탭은 onPress(뷰어/선택 토글), 10px 이상 움직이면 스크롤로 판단해 드래그를 취소한다.
function DraggableAlbumTile({
  localIdx, globalIdx, section, active, hovered, dragOffset, dragScale, dragScrollAnim, draggable,
  onDragStart, onDragMove, onDragEnd, onPress, children,
}: {
  localIdx: number;
  globalIdx: number;
  section: number | 'flat';
  active: boolean;
  hovered: boolean;
  dragOffset: Animated.ValueXY;
  dragScale: Animated.Value;
  dragScrollAnim?: Animated.Value; // 자동 스크롤 보정 — 손가락이 그대로여도 콘텐츠가 밀린 만큼 따라간다
  draggable: boolean;
  onDragStart: (section: number | 'flat', local: number) => void;
  onDragMove: (local: number, dx: number, dy: number, pageX: number, pageY: number) => void;
  onDragEnd: (local: number, dx: number, dy: number, pageX: number, pageY: number) => void;
  onPress: (globalIdx: number) => void;
  children: React.ReactNode;
}) {
  const isDraggingRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  // 최신 idx·콜백 참조 — PanResponder는 첫 렌더에 한 번만 생성되므로 직접 캡처하면 옛 값이 박제된다
  const cbRef = useRef({ localIdx, globalIdx, section, draggable, onDragStart, onDragMove, onDragEnd, onPress });
  cbRef.current = { localIdx, globalIdx, section, draggable, onDragStart, onDragMove, onDragEnd, onPress };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => isDraggingRef.current,
      onPanResponderGrant: () => {
        isDraggingRef.current = false;
        if (timerRef.current) clearTimeout(timerRef.current);
        if (!cbRef.current.draggable) return;
        timerRef.current = setTimeout(() => {
          isDraggingRef.current = true;
          cbRef.current.onDragStart(cbRef.current.section, cbRef.current.localIdx);
        }, 400);
      },
      onPanResponderMove: (_evt, g) => {
        if (isDraggingRef.current) {
          cbRef.current.onDragMove(cbRef.current.localIdx, g.dx, g.dy, g.moveX, g.moveY);
        } else if (Math.abs(g.dx) > 10 || Math.abs(g.dy) > 10) {
          if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        }
      },
      onPanResponderRelease: (_evt, g) => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          cbRef.current.onDragEnd(cbRef.current.localIdx, g.dx, g.dy, g.moveX, g.moveY);
        } else {
          cbRef.current.onPress(cbRef.current.globalIdx);
        }
      },
      onPanResponderTerminate: (_evt, g) => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          cbRef.current.onDragEnd(cbRef.current.localIdx, g.dx, g.dy, g.moveX, g.moveY);
        }
      },
      onPanResponderTerminationRequest: () => !isDraggingRef.current,
    })
  ).current;

  // 드래그 중인 사진이 이 타일 위에 올라오면 살짝 움츠러들며 "여기로 들어간다" 신호
  const hoverAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(hoverAnim, { toValue: hovered ? 1 : 0, useNativeDriver: false, friction: 7, tension: 130 }).start();
  }, [hovered]);
  const hoverScale = hoverAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] });

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        !active && { transform: [{ scale: hoverScale }] },
        active && {
          transform: [
            { translateX: dragOffset.x },
            { translateY: dragScrollAnim ? Animated.add(dragOffset.y, dragScrollAnim) : dragOffset.y },
            { scale: dragScale },
          ],
          zIndex: 10,
          elevation: 8,
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

function AlbumView({ record, editable, onAddPhotos, onStartSelect, onSetCover, onAddSection, onSectionMenu, selecting, selected, onToggleSelect, onReorder, onMoveAcross, onRemoveAt, onDragStateChange, onDragPosition, dragScroll }: {
  record: TravelRecord;
  editable?: boolean;
  onAddPhotos?: (sectionIndex?: number) => void;
  onStartSelect?: () => void;
  onSetCover?: (index: number) => void;
  onAddSection?: () => void;
  onSectionMenu?: (sectionIndex: number) => void;
  selecting?: boolean;
  selected?: number[];
  onToggleSelect?: (globalIndex: number) => void;
  onReorder?: (section: number | 'flat', fromIdx: number, toIdx: number) => void;
  onMoveAcross?: (fromSection: number, fromLocal: number, toSection: number, toLocal: number) => void;
  onRemoveAt?: (globalIndex: number) => void;
  onDragStateChange?: (dragging: boolean) => void;
  onDragPosition?: (pageY: number | null) => void;
  dragScroll?: { anim: Animated.Value; value: number };
}) {
  const { t } = useTranslation();
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const medias = record.medias ?? [];
  // 섹션(세분화) — medias의 연속 구간 분할. 없으면 평면 그리드.
  const slices = record.albumSections && record.albumSections.length > 0
    ? sectionSlices(record.albumSections, medias.length)
    : null;

  // ── 제자리 드래그 순서 변경 (프로필 여행카드와 동일 UX) ──
  // 같은 구역 안에선 순서 변경, 섹션 모드에선 다른 섹션 그리드 위에 놓으면 그 섹션으로 이동
  const [dragCtx, setDragCtx] = useState<{ section: number | 'flat'; local: number; len: number } | null>(null);
  const [hoverSlot, setHoverSlot] = useState<{ section: number | 'flat'; local: number } | null>(null);
  const hoverSlotRef = useRef<string | null>(null);
  const dragOffset = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const dragScale = useRef(new Animated.Value(1)).current;
  // 섹션 그리드의 화면 좌표 — 드래그 시작 시점에 측정(윈도우 기준). 자동 스크롤 이동분은
  // dragScroll.value를 손가락 y에 더해 시작 시점 좌표계로 환산해 비교한다.
  const gridRefs = useRef<Record<string, View | null>>({});
  const gridRectsRef = useRef<Record<string, { x: number; y: number; len: number }>>({});

  const slotPos = (local: number) => ({ x: (local % 3) * ALBUM_PITCH, y: Math.floor(local / 3) * ALBUM_PITCH });
  // 드래그 중인 타일 중심이 올라가 있는 슬롯 (같은 구역 안으로 클램프) — 그리드 측정 실패 시 폴백
  const findTargetLocal = (local: number, dx: number, dy: number, len: number) => {
    const start = slotPos(local);
    const cx = start.x + ALBUM_CELL / 2 + dx;
    const cy = start.y + ALBUM_CELL / 2 + dy;
    const col = Math.max(0, Math.min(2, Math.floor(cx / ALBUM_PITCH)));
    const row = Math.max(0, Math.min(Math.ceil(len / 3) - 1, Math.floor(cy / ALBUM_PITCH)));
    return Math.min(row * 3 + col, len - 1);
  };

  // 손가락 위치(드래그 시작 시점 윈도우 좌표계)가 올라가 있는 섹션 그리드와 슬롯.
  // local === len(마지막 뒤)은 "끝에 추가" 의미로 허용한다. 어떤 그리드에도 없으면 null.
  const findSlotAt = (pageX: number, pageYAdj: number): { section: number | 'flat'; local: number } | null => {
    for (const key of Object.keys(gridRectsRef.current)) {
      const r = gridRectsRef.current[key];
      const rows = Math.max(1, Math.ceil(Math.max(r.len, 1) / 3));
      if (pageX < r.x || pageX > r.x + 3 * ALBUM_PITCH) continue;
      if (pageYAdj < r.y || pageYAdj > r.y + rows * ALBUM_PITCH) continue;
      const col = Math.max(0, Math.min(2, Math.floor((pageX - r.x) / ALBUM_PITCH)));
      const row = Math.max(0, Math.floor((pageYAdj - r.y) / ALBUM_PITCH));
      return { section: key === 'flat' ? 'flat' : Number(key), local: Math.min(row * 3 + col, r.len) };
    }
    return null;
  };

  const settle = (onDone?: () => void) => {
    Animated.parallel([
      Animated.spring(dragOffset, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 7, tension: 65 }),
      Animated.spring(dragScale, { toValue: 1, useNativeDriver: false, friction: 7, tension: 65 }),
    ]).start(({ finished }) => { if (finished) onDone?.(); });
  };

  const handleTileDragStart = (section: number | 'flat', local: number) => {
    const len = section === 'flat' ? medias.length : (slices?.[section]?.count ?? 0);
    dragOffset.stopAnimation();
    dragScale.stopAnimation();
    hoverSlotRef.current = null;
    setHoverSlot(null);
    dragOffset.setValue({ x: 0, y: 0 });
    if (dragScroll) { dragScroll.value = 0; dragScroll.anim.setValue(0); } // 이전 드래그의 보정치 잔존 방지
    // 모든 섹션 그리드의 시작 시점 화면 좌표 측정 — 섹션 간 이동 목적지 판정용
    gridRectsRef.current = {};
    const measure = (key: string, len2: number) => {
      gridRefs.current[key]?.measureInWindow((x, y) => { gridRectsRef.current[key] = { x, y, len: len2 }; });
    };
    if (slices) slices.forEach((sec, si) => measure(String(si), sec.count));
    else measure('flat', medias.length);
    setDragCtx({ section, local, len });
    // 톡 튀지 않고 부드럽게 떠오르도록 스케일 스프링
    Animated.spring(dragScale, { toValue: 1.08, useNativeDriver: false, friction: 6, tension: 140 }).start();
    onDragStateChange?.(true); // 드래그 동안 화면 스크롤 잠금
  };

  // 현재 손가락 위치의 목적지 슬롯 — 섹션 간 이동 허용(onMoveAcross 있을 때), 실패 시 같은 구역 클램프
  const resolveTarget = (local: number, dx: number, dy: number, pageX: number, pageY: number) => {
    const delta = dragScroll?.value ?? 0;
    if (!dragCtx) return null;
    const hit = findSlotAt(pageX, pageY + delta);
    if (hit && (hit.section === dragCtx.section || (onMoveAcross && hit.section !== 'flat' && dragCtx.section !== 'flat'))) {
      // 같은 섹션에선 '끝에 추가'(local===len)를 마지막 슬롯으로 취급
      if (hit.section === dragCtx.section) hit.local = Math.min(hit.local, dragCtx.len - 1);
      return hit;
    }
    return { section: dragCtx.section, local: findTargetLocal(local, dx, dy + delta, dragCtx.len) };
  };

  const handleTileDragMove = (local: number, dx: number, dy: number, pageX: number, pageY: number) => {
    if (!dragCtx) return;
    dragOffset.setValue({ x: dx, y: dy });
    onDragPosition?.(pageY); // 가장자리 자동 스크롤 판단은 화면(스크롤 소유자)이 한다
    const target = resolveTarget(local, dx, dy, pageX, pageY);
    const isSame = !target || (target.section === dragCtx.section && target.local === local);
    const hv = isSame ? null : target;
    const hvKey = hv ? `${hv.section}|${hv.local}` : null;
    if (hoverSlotRef.current !== hvKey) { hoverSlotRef.current = hvKey; setHoverSlot(hv); }
  };

  const handleTileDragEnd = (local: number, dx: number, dy: number, pageX: number, pageY: number) => {
    onDragStateChange?.(false);
    onDragPosition?.(null);
    hoverSlotRef.current = null;
    setHoverSlot(null);
    if (!dragCtx) return;
    const target = resolveTarget(local, dx, dy, pageX, pageY);
    // 스크롤 보정을 오프셋에 합치고 보정치는 리셋 — 이후 정착 스프링은 순수 오프셋만 다룬다
    const dyTotal = dy + (dragScroll?.value ?? 0);
    if (dragScroll) { dragScroll.value = 0; dragScroll.anim.setValue(0); }
    if (target && target.section !== dragCtx.section && typeof target.section === 'number' && typeof dragCtx.section === 'number' && onMoveAcross) {
      // 섹션 간 이동 — 시작 시점 그리드 좌표로 손가락 위치 → 새 슬롯 정착 오프셋 계산
      const rFrom = gridRectsRef.current[String(dragCtx.section)];
      const rTo = gridRectsRef.current[String(target.section)];
      const from = slotPos(local);
      const to = slotPos(target.local);
      if (rFrom && rTo) {
        dragOffset.setValue({ x: rFrom.x + from.x + dx - (rTo.x + to.x), y: rFrom.y + from.y + dyTotal - (rTo.y + to.y) });
      }
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      onMoveAcross(dragCtx.section, local, target.section, target.local);
      setDragCtx({ section: target.section, local: target.local, len: 0 });
      settle(() => setDragCtx(null));
    } else if (target && target.section === dragCtx.section && target.local !== local) {
      // 이웃은 LayoutAnimation으로 새 자리까지 이동, 끌던 사진은 손가락 위치 → 새 슬롯으로 스프링 정착
      const from = slotPos(local);
      const to = slotPos(target.local);
      dragOffset.setValue({ x: from.x + dx - to.x, y: from.y + dyTotal - to.y });
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      onReorder?.(dragCtx.section, local, target.local);
      setDragCtx({ ...dragCtx, local: target.local });
      settle(() => setDragCtx(null));
    } else {
      dragOffset.setValue({ x: dx, y: dyTotal });
      settle(() => setDragCtx(null));
    }
  };

  // 사진 타일 — 탭: 뷰어/선택 토글, 꾹: 그 자리에서 들어올려 드래그로 순서 변경
  const photoTile = (uri: string, globalIdx: number, section: number | 'flat', localIdx: number, sectionLen: number) => {
    const isSel = selecting && (selected ?? []).includes(globalIdx);
    const active = !!dragCtx && dragCtx.section === section && dragCtx.local === localIdx;
    const hovered = !!dragCtx && !active && hoverSlot?.section === section && hoverSlot.local === localIdx;
    // 섹션 모드에선 1장짜리 섹션도 다른 섹션으로 끌어낼 수 있어야 한다
    const canDrag = !!editable && !selecting && !!onReorder && (section === 'flat' ? sectionLen > 1 : sectionLen > 1 || !!onMoveAcross);
    return (
      <DraggableAlbumTile
        // key는 순서와 무관한 uri — 재정렬 시 리마운트 대신 LayoutAnimation으로 이웃이 밀려나게 한다
        // (uri는 가져오기 시 파일 복사로 고유해 중복 위험이 낮다)
        key={uri}
        localIdx={localIdx}
        globalIdx={globalIdx}
        section={section}
        active={active}
        hovered={hovered}
        dragOffset={dragOffset}
        dragScale={dragScale}
        dragScrollAnim={dragScroll?.anim}
        draggable={canDrag}
        onDragStart={handleTileDragStart}
        onDragMove={handleTileDragMove}
        onDragEnd={handleTileDragEnd}
        onPress={(gi) => (selecting ? onToggleSelect?.(gi) : setLightboxIdx(gi))}
      >
        <Image
          source={{ uri }}
          style={{ width: ALBUM_CELL, height: ALBUM_CELL, backgroundColor: '#1A0A2E' }}
          resizeMode="cover"
        />
        {selecting && (
          <View style={[styles.albumSelOverlay, isSel && styles.albumSelOverlayOn]}>
            <View style={[styles.albumSelCheck, isSel && styles.albumSelCheckOn]}>
              {isSel && <Text style={styles.albumSelCheckTxt}>✓</Text>}
            </View>
          </View>
        )}
      </DraggableAlbumTile>
    );
  };

  return (
    <View style={styles.albumWrap}>
      {/* 헤더 카드 */}
      <View style={styles.albumHeader}>
        <View style={styles.albumHeaderLeft}>
          <Text style={styles.albumFlag}>{record.countryFlag}</Text>
          <View>
            <Text style={styles.albumCountry}>{record.countryName}</Text>
            <Text style={styles.albumDate}>{record.date}</Text>
          </View>
        </View>
        <StarRow rating={record.rating} size={14} />
      </View>

      {slices ? (
        /* ── 섹션 모드 — 섹션별 헤더 + 그리드 ── */
        <>
          {slices.map((sec, si) => (
            <View key={sec.id}>
              <View style={styles.albumSectionHeader}>
                <Text style={styles.albumSectionTitle}>{sec.title}</Text>
                <Text style={styles.albumSectionCount}>{sec.count}</Text>
                <View style={{ flex: 1 }} />
                {editable && onAddPhotos && !selecting && (
                  <TouchableOpacity style={styles.albumSectionBtn} onPress={() => onAddPhotos(si)} accessibilityRole="button" accessibilityLabel={t('comp.albumAddPhotos')}>
                    <Text style={styles.albumSectionBtnTxt}>＋</Text>
                  </TouchableOpacity>
                )}
                {editable && onSectionMenu && !selecting && (
                  <TouchableOpacity style={styles.albumSectionBtn} onPress={() => onSectionMenu(si)} accessibilityRole="button">
                    <Text style={styles.albumSectionBtnTxt}>⋯</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View
                style={styles.albumGrid}
                ref={(r) => { gridRefs.current[String(si)] = r; }}
                collapsable={false}
              >
                {medias.slice(sec.start, sec.end).map((uri, i) => photoTile(uri, sec.start + i, si, i, sec.count))}
                {sec.count === 0 && (
                  <Text style={styles.albumSectionEmpty}>{t('comp.albumSectionEmpty')}</Text>
                )}
              </View>
            </View>
          ))}
          {editable && onAddSection && !selecting && (
            <TouchableOpacity style={styles.albumSectionAdd} onPress={onAddSection} activeOpacity={0.8}>
              <Text style={styles.albumSectionAddTxt}>＋ {t('comp.albumAddSection')}</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        /* ── 평면 그리드 ── */
        <>
          <View
            style={styles.albumGrid}
            ref={(r) => { gridRefs.current.flat = r; }}
            collapsable={false}
          >
            {medias.map((uri, i) => photoTile(uri, i, 'flat', i, medias.length))}
            {editable && onAddPhotos && !selecting && (
              <TouchableOpacity style={styles.albumAddTile} onPress={() => onAddPhotos()} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('comp.albumAddPhotos')}>
                <Text style={styles.albumAddPlus}>＋</Text>
                <Text style={styles.albumAddLabel}>{t('comp.albumAddPhotos')}</Text>
              </TouchableOpacity>
            )}
            {medias.length === 0 && !editable && (
              <View style={styles.albumEmpty}>
                <CameraIcon size={48} color="#A1A1B0" />
                <Text style={styles.albumEmptyText}>{t('comp.noPhotos')}</Text>
              </View>
            )}
          </View>
          {editable && medias.length > 0 && !selecting && (
            <View style={styles.albumFooterRow}>
              {onAddSection && (
                <TouchableOpacity style={[styles.albumSectionAdd, { flex: 1, marginHorizontal: 0 }]} onPress={onAddSection} activeOpacity={0.8}>
                  <Text style={styles.albumSectionAddTxt}>🗂 {t('comp.albumMakeSections')}</Text>
                </TouchableOpacity>
              )}
              {/* 순서 변경은 사진을 꾹 눌러 드래그 — 버튼 자리는 다중 선택(이동/삭제) 진입으로 대체 */}
              {onStartSelect && (
                <TouchableOpacity style={[styles.albumSectionAdd, { flex: 1, marginHorizontal: 0 }]} onPress={onStartSelect} activeOpacity={0.8}>
                  <Text style={styles.albumSectionAddTxt}>✓ {t('trip.albumSelect')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </>
      )}

      {/* 전체화면 뷰어 — 스와이프 + 핀치 줌 + n/m. 내 사진첩이면 공유/저장/커버/삭제 액션 바 */}
      <PhotoViewerModal
        visible={lightboxIdx !== null}
        uris={medias}
        initialIndex={lightboxIdx ?? 0}
        onClose={() => setLightboxIdx(null)}
        showActions={editable}
        onSetCover={editable ? onSetCover : undefined}
        onDelete={editable && onRemoveAt ? (i) => onRemoveAt(i) : undefined}
      />
    </View>
  );
}

// ─────────────────────────────────────────────
// 4. Snap (BeReal 스타일)
// ─────────────────────────────────────────────
function SnapView({ record }: { record: TravelRecord }) {
  const { t } = useTranslation();
  const lateText = (() => {
    if (!record.snapLateSeconds || record.snapLateSeconds <= 0) return null;
    const s = record.snapLateSeconds;
    if (s < 60) return t('comp.snapLateSec', { s });
    return t('comp.snapLateMin', { m: Math.floor(s / 60), s: s % 60 });
  })();

  return (
    <View style={styles.snapWrap}>
      {/* 헤더 */}
      <View style={styles.snapHeader}>
        <Text style={styles.snapCountry}>{record.countryFlag} {record.countryName}</Text>
        <Text style={styles.snapDate}>{record.date}</Text>
      </View>

      {/* 사진 영역 */}
      <View style={styles.snapPhotoArea}>
        {/* 후면 사진 (메인) */}
        <View style={styles.snapBackPhoto}>
          {record.snapBackUri ? (
            <Image source={{ uri: record.snapBackUri }} style={styles.snapBackImg} resizeMode="cover" />
          ) : (
            <View style={styles.snapPlaceholderBg}>
              <Text style={styles.snapPlaceholderEmoji}>📸</Text>
            </View>
          )}
        </View>

        {/* 전면 사진 (PIP) */}
        {record.snapFrontUri ? (
          <View style={styles.snapPipWrap}>
            <Image source={{ uri: record.snapFrontUri }} style={styles.snapPipImg} resizeMode="cover" />
          </View>
        ) : (
          <View style={styles.snapPipWrap}>
            <View style={styles.snapPipPlaceholder}>
              <Text style={{ fontSize: 16 }}>🤳</Text>
            </View>
          </View>
        )}

        {/* 촬영 지연 뱃지 */}
        {lateText && (
          <View style={styles.snapLateBadge}>
            <Text style={styles.snapLateBadgeText}>⏱ {lateText}</Text>
          </View>
        )}
      </View>

      {/* 캡션 */}
      {record.snapCaption ? (
        <Text style={styles.snapCaption}>{record.snapCaption}</Text>
      ) : null}

      {/* 별점 */}
      {record.rating ? (
        <View style={{ marginTop: 8 }}>
          <StarRow rating={record.rating} size={14} />
        </View>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────
// 5. Cut (스트립)
// ─────────────────────────────────────────────
function CutView({ record }: { record: TravelRecord }) {
  const { t } = useTranslation();
  const photos = record.cutPhoto?.photos ?? [];
  return (
    <View style={styles.cutWrap}>
      {/* 헤더 */}
      <View style={styles.cutHeader}>
        <Text style={styles.cutCountry}>{record.countryFlag} {record.countryName}</Text>
        <Text style={styles.cutDate}>{record.date}</Text>
      </View>

      {/* 스트립 캔버스 */}
      {record.cutPhoto ? (
        <View style={styles.cutCanvasWrap}>
          <CutPhotoCanvas
            frameId={record.cutPhoto.frameId}
            photos={photos}
            transforms={record.cutPhoto.transforms}
            width={SCREEN_W - 32}
            bgOverride={record.cutPhoto.frameColor}
            bgImageOverride={record.cutPhoto.frameImage}
            capture
            showLogo={!record.cutPhoto.noLogo}
            stamp={record.cutPhoto.stamp}
          />
        </View>
      ) : (
        <View style={styles.cutEmpty}>
          <Text style={{ fontSize: 48 }}>🎞️</Text>
          <Text style={styles.cutEmptyText}>{t('comp.noCut')}</Text>
        </View>
      )}

      {/* 설명 */}
      {record.content ? (
        <Text style={styles.cutContent}>{record.content}</Text>
      ) : null}

      {/* 별점 */}
      {record.rating ? (
        <View style={{ marginTop: 8 }}>
          <StarRow rating={record.rating} size={14} />
        </View>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────
export default function TripRecordRenderer({ record, viewType, onClose, albumEditable, onAlbumAddPhotos, onAlbumStartSelect, onAlbumSetCover, onAlbumAddSection, onAlbumSectionMenu, albumSelecting, albumSelected, onAlbumToggleSelect, onAlbumReorder, onAlbumMoveAcross, onAlbumRemoveAt, onAlbumDragStateChange, onAlbumDragPosition, albumDragScroll }: Props) {
  switch (viewType) {
    case 'blog':
      return <BlogView record={record} />;
    case 'album':
      return (
        <AlbumView
          record={record}
          editable={albumEditable}
          onAddPhotos={onAlbumAddPhotos}
          onStartSelect={onAlbumStartSelect}
          onSetCover={onAlbumSetCover}
          onAddSection={onAlbumAddSection}
          onSectionMenu={onAlbumSectionMenu}
          selecting={albumSelecting}
          selected={albumSelected}
          onToggleSelect={onAlbumToggleSelect}
          onReorder={onAlbumReorder}
          onMoveAcross={onAlbumMoveAcross}
          onRemoveAt={onAlbumRemoveAt}
          onDragStateChange={onAlbumDragStateChange}
          onDragPosition={onAlbumDragPosition}
          dragScroll={albumDragScroll}
        />
      );
    case 'snap':
      return <SnapView record={record} />;
    case 'cut':
      return <CutView record={record} />;
    case 'feed':
    default:
      return <FeedView record={record} />;
  }
}

// ─────────────────────────────────────────────
// 스타일
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  starRow: { flexDirection: 'row', gap: 2 },
  star: { lineHeight: 18 },

  placeholderIcon: { fontSize: 48 },

  // ── Feed ──
  feedCard: {
    backgroundColor: '#0A0A0F',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.15)',
  },
  feedImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#1A0A2E',
  },
  feedImagePlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#1A0A2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedBody: {
    padding: 16,
    gap: 8,
  },
  feedMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  feedCountry: {
    fontSize: 13,
    fontWeight: '600',
    color: '#BF85FC',
  },
  feedDate: {
    fontSize: 11,
    color: '#A1A1B0',
  },
  feedTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 22,
  },
  feedMemo: {
    fontSize: 13,
    color: '#A1A1B0',
    lineHeight: 20,
  },
  feedFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  feedCompanions: {
    fontSize: 12,
    color: '#A1A1B0',
  },

  // ── Blog ──
  blogWrap: {
    backgroundColor: '#0A0A0F',
    padding: 16,
    gap: 12,
  },
  blogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  blogCountry: {
    fontSize: 16,
    fontWeight: '700',
    color: '#BF85FC',
  },
  blogDate: {
    fontSize: 12,
    color: '#A1A1B0',
  },
  blogContent: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 24,
  },
  blogMemoCard: {
    backgroundColor: 'rgba(191,133,252,0.08)',
    borderLeftWidth: 3,
    borderLeftColor: '#BF85FC',
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  blogMemoLabel: {
    fontSize: 11,
    color: '#BF85FC',
    fontWeight: '600',
  },
  blogMemoText: {
    fontSize: 13,
    color: '#A1A1B0',
    lineHeight: 20,
  },
  blogKeywords: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  blogKeywordTag: {
    backgroundColor: 'rgba(107,33,168,0.2)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  blogKeywordText: {
    fontSize: 11,
    color: '#A78BFA',
  },
  blogCompanions: {
    fontSize: 12,
    color: '#A1A1B0',
  },

  // ── Album ──
  albumWrap: {
    backgroundColor: '#0A0A0F',
    gap: 2,
  },
  albumHeader: {
    backgroundColor: '#1E1E2E',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 0,
    marginBottom: 2,
  },
  albumHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  albumFlag: { fontSize: 32 },
  albumCountry: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  albumDate: {
    fontSize: 12,
    color: '#A1A1B0',
    marginTop: 2,
  },
  albumGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  albumSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  albumSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  albumSectionCount: {
    fontSize: 12,
    color: '#A1A1B0',
  },
  albumSectionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  albumSectionBtnTxt: {
    fontSize: 15,
    color: '#A1A1B0',
    lineHeight: 18,
  },
  albumSectionEmpty: {
    fontSize: 12,
    color: '#5A5A6E',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  albumSelOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'flex-end',
  },
  albumSelOverlayOn: {
    backgroundColor: 'rgba(107,33,168,0.35)',
  },
  albumSelCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    margin: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumSelCheckOn: {
    backgroundColor: '#BF85FC',
    borderColor: '#BF85FC',
  },
  albumSelCheckTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 15,
  },
  albumReorderWrap: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  albumReorderDoneBtn: {
    width: undefined,
    paddingHorizontal: 12,
    backgroundColor: '#6B21A8',
  },
  albumReorderDoneWide: {
    borderColor: 'transparent',
    backgroundColor: '#6B21A8',
  },
  albumReorderDoneTxt: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  albumFooterRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
  },
  albumSectionAdd: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 11,
    alignItems: 'center',
  },
  albumSectionAddTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: '#A1A1B0',
  },
  albumAddTile: {
    width: ALBUM_CELL,
    height: ALBUM_CELL,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  albumAddPlus: {
    fontSize: 26,
    color: '#A1A1B0',
    lineHeight: 30,
  },
  albumAddLabel: {
    fontSize: 11,
    color: '#A1A1B0',
  },
  albumEmpty: {
    width: '100%',
    paddingVertical: 60,
    alignItems: 'center',
    gap: 10,
  },
  albumEmptyText: {
    fontSize: 14,
    color: '#A1A1B0',
  },

  // ── Lightbox ──

  // ── Snap ──
  snapWrap: {
    backgroundColor: '#0A0A0F',
    padding: 16,
    gap: 12,
  },
  snapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  snapCountry: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFD60A',
  },
  snapDate: {
    fontSize: 12,
    color: '#A1A1B0',
  },
  snapPhotoArea: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#1C1C28',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  snapBackPhoto: {
    width: '100%',
    height: '100%',
  },
  snapBackImg: {
    width: '100%',
    height: '100%',
  },
  snapPlaceholderBg: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snapPlaceholderEmoji: {
    fontSize: 48,
  },
  snapPipWrap: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: '28%',
    aspectRatio: 3 / 4,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#0A0A0F',
    overflow: 'hidden',
    backgroundColor: '#1E1E2E',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  snapPipImg: {
    width: '100%',
    height: '100%',
  },
  snapPipPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snapLateBadge: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: 'rgba(255,214,10,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  snapLateBadgeText: {
    color: '#0A0A0F',
    fontSize: 11,
    fontWeight: '700',
  },
  snapCaption: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 22,
    fontStyle: 'italic',
  },

  // ── Cut ──
  cutWrap: {
    backgroundColor: '#0A0A0F',
    padding: 16,
    gap: 12,
  },
  cutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cutCountry: {
    fontSize: 16,
    fontWeight: '700',
    color: '#BF85FC',
  },
  cutDate: {
    fontSize: 12,
    color: '#A1A1B0',
  },
  cutCanvasWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cutEmpty: {
    width: '100%',
    paddingVertical: 60,
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1C1C28',
    borderRadius: 16,
  },
  cutEmptyText: {
    fontSize: 14,
    color: '#A1A1B0',
  },
  cutContent: {
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 20,
  },
});
