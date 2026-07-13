import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useTranslation } from 'react-i18next';

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

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        {/* 배경 탭으로 닫기 */}
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />

        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.handle} />

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
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    paddingHorizontal: 12,
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
