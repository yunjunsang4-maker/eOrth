import React, { useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, TouchableOpacity, Image } from 'react-native';
import type { Friend, SharedRecord } from '../store/dmTypes';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CIRCLE = 56;
const GAP = 14;

export interface CardRect { x: number; y: number; w: number; h: number }

export default function QuickShareOverlay({
  visible,
  record,
  cardRect,
  side,
  pos,
  friends,
  hoveredKey,
  onTargetLayout,
  onCancel,
}: {
  visible: boolean;
  record: SharedRecord | null;
  cardRect: CardRect | null;
  side: 'left' | 'right';
  pos: Animated.ValueXY;
  friends: Friend[];           // 상위 3명
  hoveredKey: string | null;
  onTargetLayout: (key: string, rect: { x: number; y: number; w: number; h: number }) => void;
  onCancel: () => void;
}) {
  const targetRefs = useRef<Record<string, View | null>>({});
  if (!visible || !cardRect) return null;

  // 타깃 키 목록: 친구 handle + 'other'
  const targets = [...friends.map((f) => ({ key: f.handle, emoji: f.emoji, label: f.name })),
                   { key: 'other', emoji: '⊙', label: '기타' }];

  // 카드 옆 세로 배치 시작 좌표
  const colX = side === 'right'
    ? Math.min(cardRect.x + cardRect.w + GAP, SCREEN_W - CIRCLE - 8)
    : Math.max(cardRect.x - CIRCLE - GAP, 8);

  const TOP_SAFE = 64;
  const BOTTOM_SAFE = 130;
  const LABEL_PAD = 22;
  const DY = CIRCLE + GAP;
  const DX = CIRCLE + GAP;
  const horizDir = side === 'right' ? 1 : -1;
  const cardCenterY = cardRect.y + cardRect.h / 2;

  let coords: { x: number; y: number }[] = [];

  if (cardCenterY > SCREEN_H * 0.6) {
    // 하단 게시물: ㄱ자 배치 (위로 올라가며 마지막에 수평 꺾임)
    let startY = cardRect.y + cardRect.h - CIRCLE;
    // 가장 아래 원(Target 0)의 하단이 BOTTOM_SAFE를 넘지 않도록 제한
    const maxY = SCREEN_H - BOTTOM_SAFE - CIRCLE;
    const minY = TOP_SAFE + 2 * DY;
    startY = Math.max(minY, Math.min(startY, maxY));
    coords = [
      { x: colX, y: startY },
      { x: colX, y: startY - DY },
      { x: colX, y: startY - 2 * DY },
      { x: colX + horizDir * DX, y: startY - 2 * DY },
    ];
  } else if (cardCenterY < SCREEN_H * 0.4) {
    // 상단 게시물: ㄴ자 배치 (아래로 내려가며 마지막에 수평 꺾임)
    let startY = cardRect.y;
    // 가장 아래 원(Target 2, 3)의 하단이 BOTTOM_SAFE를 넘지 않도록 제한
    const maxY = SCREEN_H - BOTTOM_SAFE - CIRCLE - 2 * DY;
    const minY = TOP_SAFE;
    startY = Math.max(minY, Math.min(startY, maxY));
    coords = [
      { x: colX, y: startY },
      { x: colX, y: startY + DY },
      { x: colX, y: startY + 2 * DY },
      { x: colX + horizDir * DX, y: startY + 2 * DY },
    ];
  } else {
    // 중간 게시물: 1자형 수직 배치 (기본형)
    const totalH = targets.length * CIRCLE + (targets.length - 1) * GAP;
    let startY = cardRect.y + cardRect.h / 2 - totalH / 2;
    // 가장 아래 원(Target 3)의 하단이 BOTTOM_SAFE를 넘지 않도록 제한
    const maxY = SCREEN_H - BOTTOM_SAFE - CIRCLE - 3 * DY;
    const minY = TOP_SAFE;
    startY = Math.max(minY, Math.min(startY, maxY));
    coords = targets.map((_, i) => ({
      x: colX,
      y: startY + i * DY,
    }));
  }

  // 화면 가로 경계를 벗어나지 않도록 clamp
  const clampX = (x: number) => Math.max(8, Math.min(x, SCREEN_W - CIRCLE - 8));
  coords = coords.map((c) => ({ x: clampX(c.x), y: c.y }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* 어두운 배경 (탭/취소) */}
      <TouchableOpacity style={[StyleSheet.absoluteFill, st.dim]} activeOpacity={1} onPress={onCancel} />

      {/* 원형 타깃 */}
      {targets.map((t, i) => {
        const { x: cx, y: cy } = coords[i];
        const hovered = hoveredKey === t.key;
        return (
          <View
            key={t.key}
            ref={(node) => { targetRefs.current[t.key] = node; }}
            style={[st.target, { left: cx, top: cy, width: CIRCLE, height: CIRCLE }, hovered && st.targetHover]}
            onLayout={() => {
              // window 절대 좌표로 보고 (드롭 판정은 gesture absoluteX/Y를 사용하므로 좌표계 일치)
              targetRefs.current[t.key]?.measureInWindow((x, y, width, height) => {
                onTargetLayout(t.key, { x, y, w: width, h: height });
              });
            }}
            pointerEvents="none"
          >
            <Text style={st.targetEmoji}>{t.emoji}</Text>
            <Text style={st.targetLabel} numberOfLines={1}>{t.label}</Text>
          </View>
        );
      })}

      {/* 드래그 고스트 (카드 미리보기) */}
      <Animated.View
        pointerEvents="none"
        style={[
          st.ghost,
          { transform: [{ translateX: Animated.subtract(pos.x, CIRCLE) }, { translateY: Animated.subtract(pos.y, CIRCLE) }] },
        ]}
      >
        {record?.mediaUri ? (
          <Image source={{ uri: record.mediaUri }} style={st.ghostImg} resizeMode="cover" />
        ) : (
          <View style={[st.ghostImg, st.ghostEmpty]}>
            <Text style={{ fontSize: 24 }}>📝</Text>
          </View>
        )}
        <Text style={st.ghostText} numberOfLines={1}>{record?.blogTitle || record?.content || record?.country || '기록'}</Text>
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  dim: { backgroundColor: 'rgba(0,0,0,0.55)' },
  target: {
    position: 'absolute',
    borderRadius: CIRCLE / 2,
    backgroundColor: '#2E2E3B',
    borderWidth: 2,
    borderColor: 'rgba(191,133,252,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetHover: { borderColor: '#BF85FC', backgroundColor: '#3A2A55', transform: [{ scale: 1.12 }] },
  targetEmoji: { fontSize: 20 },
  targetLabel: { position: 'absolute', bottom: -16, fontSize: 9, color: '#A1A1B0', width: 64, textAlign: 'center' },
  ghost: {
    position: 'absolute',
    width: 112,
    borderRadius: 12,
    backgroundColor: '#1A0A2E',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.5)',
    padding: 6,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  ghostImg: { width: '100%', height: 80, borderRadius: 8, backgroundColor: '#2A2735' },
  ghostEmpty: { alignItems: 'center', justifyContent: 'center' },
  ghostText: { color: '#FFFFFF', fontSize: 11, marginTop: 4 },
});
