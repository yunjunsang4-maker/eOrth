import React, { useRef, useEffect } from 'react';
import FeedPhoto from './FeedPhoto';
import { View, StyleSheet, Animated, useWindowDimensions, TouchableOpacity, Image, Platform } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { Text } from '../ui/Text';
import { useTranslation } from 'react-i18next';
import type { Friend, SharedRecord } from '../store/dmTypes';
import { useSkinAccent } from '../constants/skinTheme';
import { FriendIcon, PersonIcon } from './icons';
import { useStageWidth, useStageGutter } from '../utils/stage';

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
        {/* 사진 > 제작 아이콘('기타') > 사람 실루엣 순. 이모지 폴백은 쓰지 않는다 —
            profiles.emoji 기본값 '🧳'이 전 계정에 박혀 있어 사진 없는 메이트가 전부 여행가방으로 보였다. */}
        {tg.photo ? (
          <FeedPhoto uri={tg.photo} style={st.targetPhoto} />
        ) : tg.icon ? (
          <FriendIcon size={28} color={skinAccent.accent} />
        ) : (
          <PersonIcon size={30} color="#A0A0B0" />
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
  // 창 높이는 실시간으로 받는다 — 박제하면 폴드 펼침 시 타깃 원 위치가 어긋난다.
  // 세로는 Stage 클램프 대상이 아니라(폭만 가둔다) 창 높이가 정답이고, cardRect.y도
  // 창 절대 좌표라 아래 비교(SCREEN_H * 0.6 등)와 좌표계가 맞는다.
  // 훅이므로 아래 조기 return(!visible)보다 반드시 위에 있어야 한다.
  const { height: SCREEN_H, width: WINDOW_W } = useWindowDimensions();
  // 이 오버레이는 RN Modal이 아니라 App.tsx의 클램프된 Stage 컬럼 안에서 렌더된다
  // (SocialScreen이 일반 탭 화면 트리 안에서 그린다). 이 컴포넌트의 루트(absoluteFill,
  // 194행)는 그 컬럼의 자식이라, 안에서 쓰는 left/translateX는 전부 "컬럼 로컬 좌표"
  // (0~stageW)다. 반면 cardRect(measureInWindow)와 pos(gesture absoluteX/Y)는 "창
  // 절대 좌표"라 두 좌표계가 다르다 — 폰(창폭 ≤ 480)에서는 stageOffsetX=0이라 두
  // 좌표계가 우연히 같지만, 폴드·태블릿에서 창 좌표를 로컬 좌표인 것처럼 그대로 쓰면
  // 실제 카드 위치보다 stageOffsetX만큼 오른쪽으로 밀려 그려진다.
  // stageOffsetX는 창 좌표계에서 클램프된 컬럼의 좌측 시작점(중앙 정렬 오프셋) —
  // 창 좌표를 로컬 좌표로 바꾸려면 이 값을 "빼야" 한다(windowX - stageOffsetX).
  // gutter 공식은 stage.ts 한 곳에만 둔다 — 예전엔 여기와 SocialScreen에 각각 사본이
  // 있었고, 그중 하나가 박제된 폭을 써서 60dp 어긋났다.
  const stageWCol = useStageWidth();
  const stageGutter = useStageGutter();
  // iOS(2026-09-20~)는 하단 바가 네이티브 UITabBar라 RN 화면 안에 그린 오버레이가 그 **아래**에
  // 깔려, 카드를 끌면 딤·타깃 원이 탭바와 겹쳐 보였다. 그래서 iOS는 창 최상위 레이어
  // (react-native-screens FullWindowOverlay = 별도 UIWindow 레벨 뷰)에 올린다 — 네이티브
  // 탭바·헤더보다 항상 위다. 그 레이어는 Stage 컬럼이 아니라 **창 전체**라 로컬 좌표계가
  // 곧 창 좌표계다: 오프셋 0, 폭은 창 폭(layout-parity 규칙 9 예외 등록). 폰에서는 어차피
  // 같지만 폴드·태블릿에서 갈린다. 진행 중인 카드 드래그(RNGH Pan)는 UIKit이 첫 터치 뷰로
  // 계속 전달하므로 위에 새 뷰가 생겨도 끊기지 않고, 드롭 판정은 좌표(measureInWindow)로
  // 하니 터치를 가로챌 일도 없다.
  const windowLevel = Platform.OS === 'ios';
  const stageW = windowLevel ? WINDOW_W : stageWCol;
  const stageOffsetX = windowLevel ? 0 : stageGutter;

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

  // cardRect는 창 절대 좌표라, 이 컴포넌트가 그리는 로컬 좌표계로 옮긴다(창 좌표 - stageOffsetX).
  // 이후 colX/clampX는 전부 로컬 좌표([0, stageW] 범위)로만 계산한다.
  const cardLocalX = cardRect.x - stageOffsetX;

  // 카드 옆 세로 배치 시작 좌표
  const colX = side === 'right'
    ? Math.min(cardLocalX + cardRect.w + GAP, stageW - CIRCLE - 8)
    : Math.max(cardLocalX - CIRCLE - GAP, 8);

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

  // 로컬 좌표([0, stageW]) 기준 clamp — 이 컴포넌트가 그리는 좌표계와 일치시킨다.
  const clampX = (x: number) => Math.max(8, Math.min(x, stageW - CIRCLE - 8));
  coords = coords.map((c) => ({ x: clampX(c.x), y: c.y }));

  const body = (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* 어두운 배경 (탭/취소) — 페이드 인 */}
      <Animated.View style={[StyleSheet.absoluteFill, st.dim, { opacity: dimAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onCancel} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
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
            // pos는 gesture absoluteX/Y(창 절대 좌표) — 로컬 좌표로 옮기려면 stageOffsetX도
            // 함께 빼야 한다(세로는 오프셋이 없어 CIRCLE만 뺀다).
            transform: [
              { translateX: Animated.subtract(pos.x, stageOffsetX + CIRCLE) },
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
  // visible이 아닐 때는 위에서 null을 돌려보내므로 FullWindowOverlay는 드래그 중에만 마운트된다.
  return windowLevel ? <FullWindowOverlay>{body}</FullWindowOverlay> : body;
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
