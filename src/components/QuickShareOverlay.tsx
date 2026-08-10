import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, useWindowDimensions, TouchableOpacity, Image } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Friend, SharedRecord } from '../store/dmTypes';
import { useSkinAccent } from '../constants/skinTheme';
import { FriendIcon } from './icons';
import { useStageWidth } from '../utils/stage';

const CIRCLE = 56;
const GAP = 14;
const MAX_TARGETS = 4; // 메이트 3 + 기타

export interface CardRect { x: number; y: number; w: number; h: number }

// 타깃 원 하나 — 바깥 래퍼(무변형, measure용)와 안쪽 Animated(등장·호버)를 분리해
// 애니메이션 중에도 드롭 판정 좌표가 흔들리지 않게 한다.
function TargetCircle({
  tg, x, y, hovered, appear, fromDir, onReport,
}: {
  tg: { key: string; emoji: string; label: string; photo?: string; icon?: boolean };
  x: number; y: number;
  hovered: boolean;
  appear: Animated.Value;
  fromDir: 1 | -1;
  onReport: (key: string, rect: { x: number; y: number; w: number; h: number }) => void;
}) {
  const wrapRef = useRef<View>(null);
  const skinAccent = useSkinAccent();
  const hoverScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(hoverScale, { toValue: hovered ? 1.15 : 1, useNativeDriver: true, speed: 40, bounciness: 7 }).start();
  }, [hovered]);

  return (
    <View
      ref={wrapRef}
      style={{ position: 'absolute', left: x, top: y, width: CIRCLE, height: CIRCLE }}
      onLayout={() => {
        // window 절대 좌표로 보고 (드롭 판정은 gesture absoluteX/Y 좌표계와 일치)
        wrapRef.current?.measureInWindow((mx, my, mw, mh) => {
          onReport(tg.key, { x: mx, y: my, w: mw, h: mh });
        });
      }}
      pointerEvents="none"
    >
      <Animated.View
        style={[
          st.target,
          { borderColor: skinAccent.tint(0.4) },
          hovered && [st.targetHover, { borderColor: skinAccent.accent }],
          {
            opacity: appear,
            transform: [
              { translateX: appear.interpolate({ inputRange: [0, 1], outputRange: [fromDir * -20, 0] }) },
              { scale: Animated.multiply(appear, hoverScale) },
            ],
          },
        ]}
      >
        {/* 사진 > 제작 아이콘 > 이모지 순. '기타'는 이모지 대신 자체 제작 SVG를 쓴다 */}
        {tg.photo ? (
          <Image source={{ uri: tg.photo }} style={st.targetPhoto} />
        ) : tg.icon ? (
          <FriendIcon size={28} color={skinAccent.accent} />
        ) : (
          <Text style={st.targetEmoji}>{tg.emoji}</Text>
        )}
        <Text style={[st.targetLabel, hovered && st.targetLabelHover]} numberOfLines={1}>{tg.label}</Text>
      </Animated.View>
    </View>
  );
}

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
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  // 창 크기는 실시간으로 받는다 — 박제하면 폴드 펼침 시 타깃 원 위치가 어긋난다.
  // 훅이므로 아래 조기 return(!visible)보다 반드시 위에 있어야 한다.
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  // 이 오버레이는 RN Modal이 아니라 App.tsx의 클램프된 Stage 컬럼 안에서 렌더된다
  // (SocialScreen이 일반 탭 화면 트리 안에서 그린다). cardRect는 measureInWindow로
  // 이미 그 클램프된 컬럼 안의 절대 좌표만 갖는데, 아래 가로 clamp를 실제 창 폭(SCREEN_W)
  // 기준으로 하면 폴드·태블릿에서 컬럼 밖(레터박스 여백)까지 타깃 원이 밀릴 수 있다.
  // stageOffsetX는 창 좌표계에서 클램프된 컬럼의 좌측 시작점(중앙 정렬 오프셋)이다.
  const stageW = useStageWidth();
  const stageOffsetX = (SCREEN_W - stageW) / 2;

  // 등장 애니메이션 — 딤 페이드 + 타깃 스태거 스프링 + 고스트 팝
  const dimAnim = useRef(new Animated.Value(0)).current;
  const ghostAnim = useRef(new Animated.Value(0)).current;
  const appearAnims = useRef(Array.from({ length: MAX_TARGETS }, () => new Animated.Value(0))).current;

  useEffect(() => {
    if (!visible) return;
    dimAnim.setValue(0);
    ghostAnim.setValue(0);
    appearAnims.forEach((a) => a.setValue(0));
    Animated.parallel([
      Animated.timing(dimAnim, { toValue: 1, duration: 140, useNativeDriver: true }),
      Animated.spring(ghostAnim, { toValue: 1, useNativeDriver: true, speed: 26, bounciness: 9 }),
      Animated.stagger(
        45,
        appearAnims.map((a) => Animated.spring(a, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 8 })),
      ),
    ]).start();
  }, [visible]);

  if (!visible || !cardRect) return null;

  // 타깃 키 목록: 메이트 handle + 'other'
  const targets = [...friends.map((f) => ({ key: f.handle, emoji: f.emoji, label: f.name, photo: f.photo })),
                   { key: 'other', emoji: '', label: t('comp.other'), icon: true }];

  // 카드 옆 세로 배치 시작 좌표
  const colX = side === 'right'
    ? Math.min(cardRect.x + cardRect.w + GAP, stageOffsetX + stageW - CIRCLE - 8)
    : Math.max(cardRect.x - CIRCLE - GAP, stageOffsetX + 8);

  const TOP_SAFE = 64;
  const BOTTOM_SAFE = 130;
  const DY = CIRCLE + GAP;
  const DX = CIRCLE + GAP;
  const horizDir: 1 | -1 = side === 'right' ? 1 : -1;
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

  // 화면 가로 경계가 아니라 클램프된 Stage 컬럼 경계를 벗어나지 않도록 clamp
  const clampX = (x: number) => Math.max(stageOffsetX + 8, Math.min(x, stageOffsetX + stageW - CIRCLE - 8));
  coords = coords.map((c) => ({ x: clampX(c.x), y: c.y }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* 어두운 배경 (탭/취소) — 페이드 인 */}
      <Animated.View style={[StyleSheet.absoluteFill, st.dim, { opacity: dimAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onCancel} />
      </Animated.View>

      {/* 원형 타깃 — 카드 쪽에서 스태거로 튀어나옴 */}
      {targets.map((tg, i) => (
        <TargetCircle
          key={tg.key}
          tg={tg}
          x={coords[i].x}
          y={coords[i].y}
          hovered={hoveredKey === tg.key}
          appear={appearAnims[i]}
          fromDir={horizDir}
          onReport={onTargetLayout}
        />
      ))}

      {/* 드래그 고스트 (카드 미리보기) — 살짝 기울어진 채 팝 등장 */}
      <Animated.View
        pointerEvents="none"
        style={[
          st.ghost,
          { borderColor: skinAccent.tint(0.5) },
          {
            opacity: ghostAnim,
            transform: [
              { translateX: Animated.subtract(pos.x, CIRCLE) },
              { translateY: Animated.subtract(pos.y, CIRCLE) },
              { scale: ghostAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
              { rotate: '-3deg' },
            ],
          },
        ]}
      >
        {record?.mediaUri ? (
          <Image source={{ uri: record.mediaUri }} style={st.ghostImg} resizeMode="cover" />
        ) : (
          <View style={[st.ghostImg, st.ghostEmpty]}>
            <Text style={{ fontSize: 24 }}>📝</Text>
          </View>
        )}
        <Text style={st.ghostText} numberOfLines={1}>{record?.blogTitle || record?.content || record?.country || t('comp.recordDefault')}</Text>
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  dim: { backgroundColor: 'rgba(0,0,0,0.55)' },
  target: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: '#2E2E3B',
    borderWidth: 2,
    borderColor: 'rgba(191,133,252,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  targetHover: { borderColor: '#BF85FC', backgroundColor: '#3A2A55' },
  targetEmoji: { fontSize: 20 },
  // 원 안을 꽉 채운다 — target 의 borderWidth 2 를 뺀 안쪽 크기
  targetPhoto: { width: CIRCLE - 4, height: CIRCLE - 4, borderRadius: (CIRCLE - 4) / 2, backgroundColor: '#1A1A26' },
  targetLabel: { position: 'absolute', bottom: -17, fontSize: 10, color: '#A1A1B0', width: 68, textAlign: 'center' },
  targetLabelHover: { color: '#E9DDFF', fontWeight: '700' },
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
