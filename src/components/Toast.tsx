import React, { useEffect, useMemo } from 'react';
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS, Easing as REasing } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Text } from '../ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AuthorAvatar from './AuthorAvatar';
import { CommentIcon, HeartIcon, FriendIcon, PinIcon, StarIcon } from './icons';
import { useSkinAccent } from '../constants/skinTheme';
import { success } from '../utils/haptics';
import type { ToastVisual } from '../store/toastStore';

interface ToastProps {
  visible: boolean;
  message: string;
  position?: 'top' | 'bottom'; // 기본 하단. 'top'이면 상단(상태바 아래)에 표시
  onPress?: () => void;        // 지정 시 토스트를 누를 수 있게 됨(예: 배지 리스트로 이동)
  visual?: ToastVisual;        // 아바타·카테고리 아이콘·썸네일 (알림 화면과 같은 구성)
  onDismiss?: () => void;      // 밀어서 즉시 닫기
}

const VISUAL_ICON = { like: HeartIcon, comment: CommentIcon, follow: FriendIcon, record: PinIcon, badge: StarIcon };
const AVA = 32;
// 옛 RN Animated 값의 환산 — timing은 RN 기본 easing(inOut(ease))을 명시해야 같다(Reanimated 기본은 inOut(quad)).
// 스프링은 speed 20·bounciness 6을 RN SpringConfig.fromBouncinessAndSpeed로 바꾼 값(질량 1).
const SHOW_TIMING = { duration: 180, easing: REasing.inOut(REasing.ease) };
const DRAG_BACK_SPRING = { stiffness: 512.0276470588235, damping: 33.46844780073433, mass: 1 };

export default function Toast({ visible, message, position = 'bottom', onPress, visual, onDismiss }: ToastProps) {
  const insets = useSafeAreaInsets();
  const skinAccent = useSkinAccent();
  const isTop = position === 'top';
  const hiddenOffset = isTop ? -16 : 16; // 상단이면 위에서, 하단이면 아래에서 슬라이드
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(hiddenOffset);

  // 밀어서 닫기 — 끌림 추종을 UI 스레드에서(RNGH + Reanimated). 옛 PanResponder와 같은 규칙:
  // - 배너가 나온 방향(위/아래)으로 4px 넘게 움직여야 잡는다. 반대로 끌면 아무 일도 없다.
  //   가로 조건은 원래 없었다(activeOffsetY만, failOffsetX 없음).
  // - 잡힌 순간부터 잰 거리로 추종한다. PanResponder도 grant에서 dy를 0으로 리셋했고,
  //   RNGH도 활성화 순간 translation을 0으로 리셋한다(Android resetProgress, iOS setTranslation 0).
  // - 놓을 때 거리 30 또는 속도 500px/s(옛 vy 0.5px/ms와 같은 값). 단 RNGH 속도는 VelocityTracker /
  //   velocityInView의 평활값이라 옛 "마지막 두 이벤트 사이 순간속도"와 판정이 갈릴 수 있다(사용자 승인 2026-10-03).
  // - 잡힌 뒤 시스템이 제스처를 뺏으면(ok=false) 닫지 않고 제자리로 돌린다.
  // 옛 코드는 PanResponder가 첫 렌더에 박제돼 onDismiss를 ref로 우회했다. 이제 onDismiss가 바뀌면
  // 제스처를 다시 만들므로 우회가 필요 없다.
  const drag = useSharedValue(0);
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!!onDismiss)
        .activeOffsetY(isTop ? -4 : 4)
        .onUpdate((e) => {
          'worklet';
          drag.value = isTop ? Math.min(0, e.translationY) : Math.max(0, e.translationY);
        })
        .onEnd((e, ok) => {
          'worklet';
          const passed = isTop
            ? e.translationY < -30 || e.velocityY < -500
            : e.translationY > 30 || e.velocityY > 500;
          if (ok && passed && onDismiss) runOnJS(onDismiss)();
          else drag.value = withSpring(0, DRAG_BACK_SPRING);
        }),
    [isTop, onDismiss, drag],
  );

  useEffect(() => {
    if (visible) {
      // 배지 획득만 촉각으로 축하한다. 배지는 표시 시점이 큐에 밀려 늦춰질 수 있어
      // 발생 지점(BadgeToastHost)이 아니라 실제로 배너가 뜨는 여기서 울려야 맞다.
      // 좋아요·댓글 같은 알림 배너는 제외 — 자주 떠서 진동이 소음이 된다.
      if (visual?.icon === 'badge') success();
      drag.value = 0; // 이전 배너에서 끌던 위치가 남지 않게
      opacity.value = withTiming(1, SHOW_TIMING);
      translateY.value = withTiming(0, SHOW_TIMING);
    } else {
      opacity.value = withTiming(0, SHOW_TIMING);
      translateY.value = withTiming(hiddenOffset, SHOW_TIMING);
    }
    // 공유값·상수(hiddenOffset)는 렌더 간 고정이라 의존성에 넣을 필요가 없다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const toastStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { translateY: drag.value }],
  }));

  const Icon = visual?.icon ? VISUAL_ICON[visual.icon] : null;
  const rich = !!visual; // 알림 배너(아바타 포함) / 일반 토스트(텍스트만) 두 모드
  // 배지 획득처럼 행위자가 없는 알림 — 실루엣 아바타 대신 카테고리 아이콘을 링 안에 크게
  const iconOnly = !visual?.photo && visual?.icon === 'badge';

  const body = (
    <>
      {rich && (
        <View style={{ width: AVA, height: AVA }}>
          <View style={[s.avatarRing, { borderColor: skinAccent.tint(0.35) }, iconOnly && { backgroundColor: skinAccent.tint(0.16) }]}>
            {iconOnly && Icon
              ? <Icon size={15} color={skinAccent.accent} />
              : <AuthorAvatar photo={visual?.photo} size={AVA - 2} />}
          </View>
          {Icon && !iconOnly && (
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
    <Reanimated.View
      style={[
        s.toast,
        rich && s.toastRich,
        // 하단 토스트 — 안드로이드 3버튼 내비바(48dp)와 겹치지 않게 인셋 기반 보정 (iOS는 기존 48 유지)
        isTop ? { top: insets.top + 12 } : { bottom: Platform.OS === 'ios' ? 48 : insets.bottom + 24 },
        toastStyle,
      ]}
      pointerEvents={onPress || onDismiss ? 'box-none' : 'none'}
    >
      {/* 제스처는 box-none 루트가 아니라 내용(Pressable/View)에 직접 붙인다 — 안드로이드 RNGH는 box-none 뷰의
          핸들러를 "자식이 터치 대상일 때"만 기록하는데 배경 없는 Pressable은 대상이 못 돼, 패딩·간격에서 밀면
          스와이프가 안 잡혔다(옛 PanResponder는 Pressable 전 영역에서 됐다). 시작 영역이 옛것과 같아지고 루트는 box-none 그대로다 */}
      <GestureDetector gesture={pan}>
        {onPress ? (
          <Pressable onPress={onPress} style={[s.pressable, rich && s.pressableRich]}>
            {body}
          </Pressable>
        ) : (
          <View style={rich ? s.row : undefined}>{body}</View>
        )}
      </GestureDetector>
    </Reanimated.View>
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
