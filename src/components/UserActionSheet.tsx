import React, { useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { Text } from '../ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { STAGE_MAX_W } from '../utils/stage';
import SystemSheet, { NATIVE_SHEET } from './SystemSheet';

// 팔로워/팔로잉 목록 ⋯ 메뉴 — 기본 플랫폼 Alert 대신 앱 공통 톤의 박스 시트.
// (ProfileScreen AvatarActionSheet와 동일한 카드 스타일: #1E1E2E, radius 20, 하단 스프링 등장)
export default function UserActionSheet({
  visible,
  name,
  showUnfollow,
  onClose,
  onUnfollow,
  onBlock,
}: {
  visible: boolean;
  name: string; // 표시용 핸들 (@ 없이)
  showUnfollow: boolean; // 내가 팔로우 중일 때만 언팔로우 노출
  onClose: () => void;
  onUnfollow: () => void;
  onBlock: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets(); // 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨)
  const translateY = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 12,
      }).start();
    } else {
      translateY.setValue(500);
    }
  }, [visible, translateY]);

  // 시트 내용 — iOS 시스템 시트(SystemSheet)와 기존 Modal 시트가 함께 쓴다
  const content = (
    <>
          <View style={styles.optionsCard}>
            {/* 대상 표시 */}
            <View style={styles.titleRow}>
              <Text style={styles.titleText} numberOfLines={1}>@{name}</Text>
            </View>
            <View style={styles.divider} />

            {showUnfollow && (
              <>
                <TouchableOpacity style={styles.option} activeOpacity={0.7} onPress={onUnfollow}>
                  <Text style={styles.optionText}>{t('friends.unfollow')}</Text>
                </TouchableOpacity>
                <View style={styles.divider} />
              </>
            )}

            <TouchableOpacity style={styles.option} activeOpacity={0.7} onPress={onBlock}>
              <Text style={[styles.optionText, styles.destructiveText]}>{t('friends.block')}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.cancelCard} activeOpacity={0.8} onPress={onClose}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
    </>
  );

  // iOS 새 빌드: 시스템 바텀시트(손잡이·배경·딤은 시스템). 옛 빌드·안드로이드는 아래 기존 시트
  if (NATIVE_SHEET) {
    return (
      <SystemSheet visible={visible} onClose={onClose}>
        <View style={styles.systemSheetBody}>{content}</View>
      </SystemSheet>
    );
  }

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.overlay}>
        {/* 배경 탭으로 닫기 */}
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />

        {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) */}
        <Animated.View style={[styles.sheet, { paddingBottom: Platform.OS === 'ios' ? 36 : insets.bottom + 16 }, { transform: [{ translateY }] }]}>
          <View style={styles.handle} />

          {content}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // iOS 시스템 시트 안쪽 여백 — 기존 시트의 좌우 여백을 맞추고, 위는 시스템 손잡이 자리
  systemSheetBody: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 16 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    // Modal은 루트 클램프 밖이라 폭을 여기서 다시 잡는다(딤 배경 overlay는 전체 폭 유지)
    width: '100%',
    maxWidth: STAGE_MAX_W,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  optionsCard: {
    backgroundColor: '#1E1E2E',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 10,
  },
  titleRow: {
    paddingVertical: 13,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  titleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#A1A1B0',
  },
  option: {
    paddingVertical: 17,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  optionText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  destructiveText: {
    color: '#FF3B30',
  },
  divider: {
    height: 1,
    backgroundColor: '#2E2E3B',
  },
  cancelCard: {
    backgroundColor: '#1E1E2E',
    borderRadius: 20,
    paddingVertical: 17,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    color: '#A1A1B0',
    fontWeight: '500',
  },
});
