import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  ScrollView,
} from 'react-native';
import { LockClosedIcon as SvgLockClosedIcon } from '../icons';

/**
 * 사진별 비공개 대상(친구) 선택 모달 — NewRecordScreen 전용.
 * (NewRecordScreen 에서 분리)
 */
export function PrivacyModal({
  visible,
  selectedFriends,
  allFriends,
  onToggle,
  onSetAll,
  onClose,
}: {
  visible: boolean;
  selectedFriends: string[];
  allFriends: string[];
  onToggle: (friend: string) => void;
  onSetAll: (friends: string[]) => void;
  onClose: () => void;
}) {
  const translateY = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 13,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: 500,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={pm.overlay} accessibilityViewIsModal>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[pm.sheet, { transform: [{ translateY }] }]}>
          {/* 핸들 */}
          <View style={pm.handle} />

          {/* 헤더 */}
          <View style={pm.header}>
            <View style={pm.headerLeft}>
              <SvgLockClosedIcon size={24} color="#A1A1B0" />
              <View>
                <Text style={pm.headerTitle}>비공개 대상 선택</Text>
                <Text style={pm.headerDesc}>선택한 친구에게 이 미디어가 비공개됩니다</Text>
              </View>
            </View>
          </View>

          {/* 전체 비공개 — 모든 친구에게 비공개 (맨 위 옵션) */}
          {allFriends.length > 0 && (() => {
            const allPrivate = selectedFriends.length === allFriends.length;
            return (
              <TouchableOpacity
                style={[pm.allPrivateRow, allPrivate && pm.friendRowActive]}
                onPress={() => {
                  // 한 번에 전체 설정/해제 → 개별 친구 체크 상태도 즉시 동기화
                  onSetAll(allPrivate ? [] : [...allFriends]);
                }}
                activeOpacity={0.7}
              >
                <View style={[pm.avatar, allPrivate && pm.avatarActive]}>
                  <SvgLockClosedIcon size={18} color={allPrivate ? '#FFFFFF' : '#A1A1B0'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[pm.allPrivateLabel, allPrivate && pm.friendNameActive]}>전체 비공개</Text>
                  <Text style={pm.allPrivateDesc}>모든 친구에게 이 사진을 숨겨요</Text>
                </View>
                <View style={[pm.checkbox, allPrivate && pm.checkboxActive]}>
                  {allPrivate && <Text style={pm.checkMark}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          })()}

          {/* 전체 해제 버튼 */}
          {selectedFriends.length > 0 && (
            <TouchableOpacity
              style={pm.clearAllBtn}
              onPress={() => selectedFriends.forEach(f => onToggle(f))}
              activeOpacity={0.7}
            >
              <Text style={pm.clearAllTxt}>전체 해제</Text>
            </TouchableOpacity>
          )}

          {/* 친구 목록 */}
          <ScrollView style={pm.listScroll} showsVerticalScrollIndicator={false}>
            {allFriends.map(friend => {
              const isSelected = selectedFriends.includes(friend);
              return (
                <TouchableOpacity
                  key={friend}
                  style={[pm.friendRow, isSelected && pm.friendRowActive]}
                  onPress={() => onToggle(friend)}
                  activeOpacity={0.7}
                >
                  {/* 아바타 */}
                  <View style={[pm.avatar, isSelected && pm.avatarActive]}>
                    <Text style={pm.avatarTxt}>{friend[0]}</Text>
                  </View>
                  <Text style={[pm.friendName, isSelected && pm.friendNameActive]}>{friend}</Text>
                  {/* 체크박스 */}
                  <View style={[pm.checkbox, isSelected && pm.checkboxActive]}>
                    {isSelected && <Text style={pm.checkMark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* 완료 버튼 */}
          <TouchableOpacity style={pm.doneBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={pm.doneTxt}>
              {selectedFriends.length > 0
                ? `${selectedFriends.length}명 비공개 설정 완료`
                : '공개로 설정 (비공개 없음)'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const pm = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1A1A28',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 36,
    maxHeight: '80%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: { fontSize: 24 },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerDesc: {
    fontSize: 12,
    color: '#A1A1B0',
    marginTop: 2,
  },
  clearAllBtn: {
    alignSelf: 'flex-end',
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(191,133,252,0.12)',
  },
  clearAllTxt: {
    fontSize: 12,
    color: '#BF85FC',
    fontWeight: '600',
  },
  listScroll: {
    maxHeight: 320,
  },
  allPrivateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 12,
    gap: 14,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  allPrivateLabel: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  allPrivateDesc: {
    fontSize: 12,
    color: '#8A8A99',
    marginTop: 2,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 12,
    gap: 14,
    marginBottom: 2,
  },
  friendRowActive: {
    backgroundColor: 'rgba(107,33,168,0.15)',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2E2E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarActive: {
    backgroundColor: 'rgba(107,33,168,0.4)',
  },
  avatarTxt: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  friendName: {
    flex: 1,
    fontSize: 15,
    color: '#A1A1B0',
    fontWeight: '500',
  },
  friendNameActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#4A4A59',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#BF85FC',
    borderColor: '#BF85FC',
  },
  checkMark: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  doneBtn: {
    backgroundColor: '#6B21A8',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  doneTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
