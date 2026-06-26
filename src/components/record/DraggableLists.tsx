import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Animated,
  PanResponder,
  LayoutAnimation,
  StyleSheet,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  LockClosedIcon as SvgLockClosedIcon,
  LockOpenIcon as SvgLockOpenIcon,
} from '../icons';

/**
 * NewRecordScreen(피드 기록)에서 분리한 드래그 앤 드롭 리스트 컴포넌트.
 *  - DraggableCountryList: 국가 순서 변경 (세로 리스트)
 *  - DraggablePhotoGrid:   사진 순서 변경 + 삭제 · 비공개 · 대표 설정 (3열 그리드)
 * 화면 토큰(#BF85FC 계열)을 그대로 쓰기 위해 필요한 색만 로컬로 둔다.
 */
const COLORS = {
  white: '#FFFFFF',
  purpleNeon: '#BF85FC',
  purpleDeep: '#6B21A8',
  textDim: '#A1A1B0',
};

// ─── 드래그 핸들 아이콘 ───
const DragHandleIcon = ({ size = 20, color = '#A1A1B0' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 8h16M4 16h16" stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

// ─── 드래그 앤 드롭 국가 리스트 ───
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
        ds.draggableRow,
        {
          position: 'absolute',
          left: 0,
          right: 0,
          top: top,
          height: ITEM_HEIGHT - 8,
          zIndex: zIndex,
        },
        isDragging && ds.draggableRowActive,
      ]}
    >
      {/* Drag Handle */}
      <View {...panResponder.panHandlers} style={ds.dragHandle}>
        <DragHandleIcon size={20} color={isDragging ? COLORS.purpleNeon : COLORS.textDim} />
      </View>

      {/* Flag and Name with Order Index Number */}
      <View style={ds.draggableRowContent}>
        <View style={ds.numberBadge}>
          <Text style={ds.numberBadgeText}>{i + 1}</Text>
        </View>
        <Text style={ds.draggableRowFlag}>{c.flag}</Text>
        <Text style={ds.draggableRowName}>{c.name}</Text>
        {i === 0 && (
          <View style={ds.representativeTag}>
            <Text style={ds.representativeTagText}>대표</Text>
          </View>
        )}
      </View>

      {/* Delete Button */}
      <TouchableOpacity
        onPress={() => onRemove(c.name)}
        style={ds.draggableRemoveBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={ds.draggableRemoveText}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function DraggableCountryList({ countries, onReorder, onRemove, onDragStateChange }: DraggableCountryListProps) {
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

// ─── 드래그 앤 드롭 사진 그리드 ───
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
        ds.mediaThumbWrap,
        {
          position: 'absolute',
          left: left,
          top: top,
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          zIndex: zIndex,
        },
        isDragging && ds.mediaThumbActive,
      ]}
      {...panResponder.panHandlers}
    >
      <Image source={{ uri }} style={ds.mediaThumb} />

      {isLocked && <View style={ds.mediaLockedOverlay} />}

      {!isDragging && (
        <TouchableOpacity
          style={ds.mediaRemoveBtn}
          onPress={() => onRemove(idx)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={ds.mediaRemoveTxt}>×</Text>
        </TouchableOpacity>
      )}

      {!isDragging && (
        <TouchableOpacity
          style={[ds.mediaLockBtn, isLocked && ds.mediaLockBtnActive]}
          onPress={() => onOpenPrivacyModal(idx)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {isLocked ? <SvgLockClosedIcon size={12} color={COLORS.white} /> : <SvgLockOpenIcon size={12} color={COLORS.white} />}
        </TouchableOpacity>
      )}

      {!isDragging && (
        <TouchableOpacity
          style={[ds.mediaRepBtn, uri === representativePhoto && ds.mediaRepBtnActive]}
          onPress={() => onSetRepresentative(uri)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.8}
        >
          <Text style={[ds.mediaRepTxt, uri === representativePhoto && ds.mediaRepTxtActive]}>
            {uri === representativePhoto ? '★ 지도대표' : '대표 설정'}
          </Text>
        </TouchableOpacity>
      )}

      {!isDragging && isLocked && (
        <View style={ds.privacyCountBadge}>
          <Text style={ds.privacyCountTxt}>{mediaPrivacy[idx].length}명</Text>
        </View>
      )}
    </Animated.View>
  );
}

export function DraggablePhotoGrid({
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

// ─── 전용 스타일 (NewRecordScreen 의 s 에서 분리) ───
const ds = StyleSheet.create({
  // 국가 리스트
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

  // 사진 그리드
  mediaThumbWrap: {
    position: 'relative',
    borderRadius: 10,
    overflow: 'visible',
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
});
