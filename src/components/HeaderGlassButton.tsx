import React from 'react';
import { Platform, Pressable, TouchableOpacity, View, type Insets, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';

/**
 * 화면 좌상단·우상단 버튼(뒤로가기·설정·⋯) — iOS는 시스템 리퀴드 글래스 원형 버튼, 그 밖은 기존 무테 버튼.
 * 유튜브·인스타그램처럼 iOS에서는 상단 버튼만 시스템 것을 쓴다(2026-10-30 사용자 결정, 1단계).
 *  · iOS 26+ : expo-glass-effect GlassView(regular, isInteractive) 44pt 원 — iOS 27 투명도 슬라이더·
 *    투명도 줄이기·새 테두리 모양을 시스템이 그대로 적용한다(직접 그린 글래스는 못 따라간다).
 *    눌림 피드백은 isInteractive의 시스템 반응만 쓴다 — 부모 opacity가 1 미만이면 유리가 안 보인다(GlassSurface 주석).
 *  · 안드로이드·구형 iOS : 호출처가 넘긴 style 그대로의 TouchableOpacity — 화면 모양이 이전과 같다.
 */
/** iOS 시스템 글래스 버튼을 쓰는가 — 호출처가 비글래스 쪽에 자기 고유 버튼(LiquidPressable 등)을 유지할 때 분기용 */
export const IOS_GLASS = Platform.OS === 'ios' && isGlassEffectAPIAvailable();
const SIZE = 44;
const GLASS_BOX: ViewStyle = {
  width: SIZE, height: SIZE, minWidth: SIZE, minHeight: SIZE, padding: 0,
  borderRadius: SIZE / 2, borderWidth: 0, backgroundColor: 'transparent',
  alignItems: 'center', justifyContent: 'center',
};
const GLASS_FILL: ViewStyle = { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center' };
// 뒤로가기 꺾쇠 광학 보정(pt) — 9pt 폭 꺾쇠 기준. 실기기에서 보고 조절하는 손잡이
const BACK_OPTICAL_SHIFT = 1.5;

export default function HeaderGlassButton({ onPress, style, hitSlop, activeOpacity, accessibilityLabel, back, children }: {
  onPress: () => void;
  /** 기존 버튼 스타일. 안드로이드·구형 iOS는 그대로, iOS 글래스는 위치·여백(absolute·top·left·zIndex·margin)만 살리고
   *  크기·정렬·배경·테두리는 44pt 원으로 덮어쓴다 — 화면마다 버튼을 헤더에 absolute로 박아 둔 곳이 있다 */
  style?: StyleProp<ViewStyle>;
  hitSlop?: Insets;
  /** 비글래스 쪽 눌림 투명도 — 화면마다 원래 값을 그대로 넘긴다(안 넘기면 RN 기본값) */
  activeOpacity?: number;
  accessibilityLabel: string;
  /** 뒤로가기 꺾쇠(‹) — 원 안에서 광학 중심 보정. 상자는 정중앙이어도 ‹는 벌어진 오른쪽 끝 때문에 오른쪽으로 치우쳐
   *  보여, 시스템 뒤로가기처럼 뾰족한 쪽(왼쪽)으로 살짝 옮긴다(iOS 글래스에서만) */
  back?: boolean;
  children: React.ReactNode;
}) {
  if (!IOS_GLASS) {
    return (
      <TouchableOpacity onPress={onPress} style={style} hitSlop={hitSlop} activeOpacity={activeOpacity}
        accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
        {children}
      </TouchableOpacity>
    );
  }
  return (
    <Pressable onPress={onPress} hitSlop={hitSlop} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      style={[style, GLASS_BOX]}>
      <GlassView
        glassEffectStyle="regular"
        isInteractive
        colorScheme="dark"
        style={GLASS_FILL}
      >
        {back ? <View style={{ marginLeft: -BACK_OPTICAL_SHIFT }}>{children}</View> : children}
      </GlassView>
    </Pressable>
  );
}
