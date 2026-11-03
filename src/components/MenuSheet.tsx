import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, Platform, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../ui/Text';
import { STAGE_MAX_W } from '../utils/stage';
import SystemSheet, { NATIVE_SHEET } from './SystemSheet';

// ─── 앱 공용 ⋯ 메뉴 바텀시트(2026-11-04 통일) ───
// 기준 = 게시물 상세 ⋯ 시트(PostDetailScreen MenuSheet, 2026-11-02): 손잡이·#1A1A28·r24·행 52·아이콘 18·1px 구분선.
// iOS 새 빌드는 시스템 시트(손잡이·배경·딤은 시스템), 옛 빌드·안드로이드는 아래에서 올라오는 Modal 시트.
// 취소 버튼은 두지 않는다 — 배경 탭·내려 닫기·안드로이드 뒤로가기가 닫기다.
// 행 사이 구분선은 <MenuSheetDivider/>로 호출부가 넣는다(조건부 행이 많아 자동 삽입보다 읽기 쉽다).
export default function MenuSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  /** 시트 맨 위 흐린 한 줄(예: 대상 @아이디). 없으면 생략 */
  title?: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  // Modal 시트 애니메이션 — 딤은 제자리 페이드, 시트만 아래에서 슬라이드.
  // animationType="slide"는 전체 화면 딤까지 통째로 올라와 검은 막이 딸려 올라온다(SocialScreen에서 겪고 고친 것).
  // 닫힐 때도 애니메이션이 끝난 뒤에 Modal을 내린다(mounted).
  const anim = useRef(new Animated.Value(0)).current; // 0=닫힘, 1=열림
  const [mounted, setMounted] = useState(false);
  const [sheetH, setSheetH] = useState(400); // 첫 측정 전 화면 밖 시작점 — onLayout이 실측으로 바꾼다
  useEffect(() => {
    if (NATIVE_SHEET) return;
    if (visible) {
      setMounted(true);
      Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(anim, { toValue: 0, duration: 170, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const head = title ? (
    <Text style={s.title} numberOfLines={1}>{title}</Text>
  ) : null;

  if (NATIVE_SHEET) {
    return (
      <SystemSheet visible={visible} onClose={onClose}>
        <View style={s.systemBody}>{head}{children}</View>
      </SystemSheet>
    );
  }
  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={s.overlay} accessibilityViewIsModal>
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] }) }]}
        />
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) */}
        <Animated.View
          onLayout={(e) => { const h = Math.ceil(e.nativeEvent.layout.height); if (h > 0 && h !== sheetH) setSheetH(h); }}
          style={[s.sheet, {
            paddingBottom: Platform.OS === 'ios' ? 28 : insets.bottom + 12,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [sheetH, 0] }) }],
          }]}
        >
          <View style={s.handle} />
          {head}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** 시트 행 — 아이콘(18) + 글자 15 semibold. danger면 글자 빨강(아이콘 색은 호출부가 맞춘다) */
export function MenuSheetItem({
  icon,
  label,
  onPress,
  danger,
  accessibilityLabel,
}: {
  icon?: React.ReactNode;
  label: string;
  onPress: () => void;
  danger?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity style={s.item} onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}>
      {icon}
      <Text style={[s.itemText, danger && s.itemTextDanger]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

export function MenuSheetDivider() {
  return <View style={s.divider} />;
}

/** 위험 행 아이콘·글자 색 */
export const MENU_DANGER = '#FF3B30';

const s = StyleSheet.create({
  systemBody: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    // Modal은 루트 클램프 밖이라 폭을 여기서 다시 잡는다(딤 배경은 전체 폭 유지)
    width: '100%', maxWidth: STAGE_MAX_W, alignSelf: 'center',
    backgroundColor: '#1A1A28', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 8 },
  title: { fontSize: 13, fontWeight: '600', color: '#A1A1B0', textAlign: 'center', paddingVertical: 10 },
  item: { flexDirection: 'row', alignItems: 'center', height: 52, paddingHorizontal: 4, gap: 12 },
  itemText: { flexShrink: 1, fontSize: 15, color: '#FFFFFF', fontWeight: '600' },
  itemTextDanger: { color: MENU_DANGER },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
});
