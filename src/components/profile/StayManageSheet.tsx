// 프로필 위치 표시("○○ 체류 중")를 탭하면 뜨는 체류 관리 시트 — 카드 보기 / 체류 종료
import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

export function StayManageSheet({ visible, onEnd, onOpenCard, onClose }: {
  visible: boolean; onEnd: () => void; onOpenCard: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={s.sheet}>
          <TouchableOpacity style={s.row} onPress={onOpenCard} activeOpacity={0.8}>
            <Text style={s.txt}>{t('stay.openCard')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.row} onPress={onEnd} activeOpacity={0.8}>
            <Text style={[s.txt, { color: '#FF3B30' }]}>{t('stay.endStay')}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#161421', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34, paddingTop: 8 },
  row: { paddingVertical: 17, alignItems: 'center' },
  txt: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
