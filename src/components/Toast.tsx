import React, { useEffect, useRef } from 'react';
import { Animated, Image, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AuthorAvatar from './AuthorAvatar';
import { CommentIcon, HeartIcon, FriendIcon, PinIcon } from './icons';
import { useSkinAccent } from '../constants/skinTheme';
import type { ToastVisual } from '../store/toastStore';

interface ToastProps {
  visible: boolean;
  message: string;
  position?: 'top' | 'bottom'; // 기본 하단. 'top'이면 상단(상태바 아래)에 표시
  onPress?: () => void;        // 지정 시 토스트를 누를 수 있게 됨(예: 배지 리스트로 이동)
  visual?: ToastVisual;        // 아바타·카테고리 아이콘·썸네일 (알림 화면과 같은 구성)
  onDismiss?: () => void;      // 밀어서 즉시 닫기
}

const VISUAL_ICON = { like: HeartIcon, comment: CommentIcon, follow: FriendIcon, record: PinIcon };
const AVA = 32;

export default function Toast({ visible, message, position = 'bottom', onPress, visual, onDismiss }: ToastProps) {
  const insets = useSafeAreaInsets();
  const skinAccent = useSkinAccent();
  const isTop = position === 'top';
  const hiddenOffset = isTop ? -16 : 16; // 상단이면 위에서, 하단이면 아래에서 슬라이드
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(hiddenOffset)).current;

  // 밀어서 닫기 — PanResponder는 첫 렌더에 박제되므로 콜백은 ref를 거친다
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const drag = useRef(new Animated.Value(0)).current;
  const pan = useRef(
    PanResponder.create({
      // 배너가 나온 방향(위/아래)으로만 반응 — 반대로 끌면 아무 일도 없다
      onMoveShouldSetPanResponder: (_, g) => (isTop ? g.dy < -4 : g.dy > 4),
      onPanResponderMove: (_, g) => drag.setValue(isTop ? Math.min(0, g.dy) : Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        const passed = isTop ? g.dy < -30 || g.vy < -0.5 : g.dy > 30 || g.vy > 0.5;
        if (passed) dismissRef.current?.();
        else Animated.spring(drag, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
      },
    })
  ).current;

  useEffect(() => {
    if (visible) {
      drag.setValue(0); // 이전 배너에서 끌던 위치가 남지 않게
      Animated.parallel([
        Animated.timing(opacity,     { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY,  { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity,     { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY,  { toValue: hiddenOffset, duration: 180, useNativeDriver: true }),
      ]).start();
    }
    // Animated.Value·상수(hiddenOffset)는 렌더 간 고정이라 의존성에 넣을 필요가 없다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const Icon = visual?.icon ? VISUAL_ICON[visual.icon] : null;
  const rich = !!visual; // 알림 배너(아바타 포함) / 일반 토스트(텍스트만) 두 모드

  const body = (
    <>
      {rich && (
        <View style={{ width: AVA, height: AVA }}>
          <View style={[s.avatarRing, { borderColor: skinAccent.tint(0.35) }]}>
            <AuthorAvatar photo={visual?.photo} size={AVA - 2} />
          </View>
          {Icon && (
            <View style={[s.catBadge, { backgroundColor: skinAccent.accent }]}>
              <Icon size={8} color="#FFFFFF" />
            </View>
          )}
        </View>
      )}
      <Text style={[s.text, rich && s.textRich]} numberOfLines={2}>{message}</Text>
      {visual?.thumb ? <Image source={{ uri: visual.thumb }} style={s.thumb} /> : null}
    </>
  );

  return (
    <Animated.View
      style={[
        s.toast,
        rich && s.toastRich,
        // 하단 토스트 — 안드로이드 3버튼 내비바(48dp)와 겹치지 않게 인셋 기반 보정 (iOS는 기존 48 유지)
        isTop ? { top: insets.top + 12 } : { bottom: Platform.OS === 'ios' ? 48 : insets.bottom + 24 },
        { opacity, transform: [{ translateY }, { translateY: drag }] },
      ]}
      pointerEvents={onPress || onDismiss ? 'box-none' : 'none'}
      {...(onDismiss ? pan.panHandlers : {})}
    >
      {onPress ? (
        <Pressable onPress={onPress} style={[s.pressable, rich && s.pressableRich]}>
          {body}
        </Pressable>
      ) : (
        <View style={rich ? s.row : undefined}>{body}</View>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: '#2E2E3B',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    zIndex: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  // 알림 배너 — 알림 화면 카드와 같은 톤(라운드 14 + 얇은 흰 테두리), 좌우로 넓게
  toastRich: {
    left: 14,
    right: 14,
    alignSelf: 'auto',
    backgroundColor: 'rgba(28,28,40,0.97)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pressable: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginHorizontal: -20, // toast 패딩을 Pressable이 흡수해 터치 영역 확보
    marginVertical: -12,
  },
  pressableRich: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: -12,
    marginVertical: -10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  // 아바타(사진 없으면 제작 실루엣) + 카테고리 아이콘 배지 — 알림 화면과 동일 구성
  avatarRing: {
    width: '100%', height: '100%', borderRadius: 999,
    borderWidth: 1, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  catBadge: {
    position: 'absolute', right: -2, bottom: -2,
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 1.5, borderColor: '#1C1C28', // 배너 배경색 링 — 아바타와 분리돼 보이게
    alignItems: 'center', justifyContent: 'center',
  },
  thumb: { width: 32, height: 32, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.06)' },

  text: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  textRich: { flex: 1, fontSize: 13, lineHeight: 18 },
});
