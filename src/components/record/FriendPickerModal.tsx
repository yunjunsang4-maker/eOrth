import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { FriendIcon as SvgFriendIcon } from '../icons';
import { useSkinAccent } from '../../constants/skinTheme';

/**
 * 함께한 앱 친구 선택 모달 — NewRecordScreen 에서 분리.
 * 화면 state/핸들러는 props 로 받는다.
 */
const COLORS = {
  white: '#FFFFFF',
  card: '#2E2E3B',
  purpleNeon: '#BF85FC',
  purpleDeep: '#6B21A8',
  textDim: '#A1A1B0',
  textMuted: '#4A4A59',
  divider: '#1A1A26',
};

export function FriendPickerModal({
  visible,
  friends,
  selected,
  onToggle,
  onClose,
}: {
  visible: boolean;
  friends: string[];
  selected: string[];
  onToggle: (friend: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={fp.overlay} accessibilityViewIsModal>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={fp.sheet}>
          <View style={fp.handle} />
          <View style={fp.header}>
            <SvgFriendIcon size={16} color={skinAccent.accent} />
            <Text style={fp.headerTitle}>{t('cutInfo.friendPickerTitle')}</Text>
          </View>

          <ScrollView style={fp.list} showsVerticalScrollIndicator={false}>
            {friends.length === 0 ? (
              <Text style={{ color: COLORS.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 32 }}>
                {t('social.noFollowedFriends')}
              </Text>
            ) : friends.map(friend => {
              const isSelected = selected.includes(friend);
              return (
                <TouchableOpacity
                  key={friend}
                  style={[fp.row, isSelected && [fp.rowActive, { backgroundColor: skinAccent.tint(0.12) }]]}
                  onPress={() => onToggle(friend)}
                  activeOpacity={0.7}
                >
                  <View style={[fp.avatar, isSelected && [fp.avatarActive, { backgroundColor: skinAccent.accentDeep }]]}>
                    <Text style={fp.avatarTxt}>{friend[0]}</Text>
                  </View>
                  <Text style={[fp.name, isSelected && [fp.nameActive, { color: skinAccent.accent }]]}>{friend}</Text>
                  <View style={[fp.check, isSelected && [fp.checkActive, { backgroundColor: skinAccent.accent, borderColor: skinAccent.accent }]]}>
                    {isSelected && <Text style={fp.checkMark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity style={[fp.doneBtn, { backgroundColor: skinAccent.accentDeep }]} onPress={onClose} activeOpacity={0.85}>
            <Text style={fp.doneTxt}>
              {selected.length > 0 ? t('cutInfo.friendDoneN', { count: selected.length }) : t('cutInfo.closeWithoutSelect')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const fp = StyleSheet.create({
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
    maxHeight: '65%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4A4A59',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
  list: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
    marginBottom: 4,
  },
  rowActive: {
    backgroundColor: 'rgba(107,33,168,0.15)',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarActive: {
    backgroundColor: COLORS.purpleDeep,
  },
  avatarTxt: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDim,
  },
  name: {
    flex: 1,
    fontSize: 15,
    color: COLORS.white,
    fontWeight: '500',
  },
  nameActive: {
    color: COLORS.purpleNeon,
    fontWeight: '600',
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkActive: {
    backgroundColor: COLORS.purpleNeon,
    borderColor: COLORS.purpleNeon,
  },
  checkMark: {
    fontSize: 12,
    color: COLORS.white,
    fontWeight: '800',
  },
  doneBtn: {
    backgroundColor: COLORS.purpleDeep,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  doneTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },
});
