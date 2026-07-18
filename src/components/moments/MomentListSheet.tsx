// 여행 기억 목록 시트 — 여행 카드 ✨ 아이콘 탭으로 열림. 시간순 목록 + 길게 눌러 삭제.
import React from 'react';
import { View, Text, Modal, FlatList, Alert, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useMoments } from '../../store/momentStore';
import type { TravelMoment } from '../../store/momentStore';
import MomentCard from './MomentCard';

export default function MomentListSheet({
  visible, onClose, moments, tripTitle,
}: {
  visible: boolean;
  onClose: () => void;
  moments: TravelMoment[]; // 이미 해당 여행으로 매칭된 목록
  tripTitle: string;
}) {
  const { t } = useTranslation();
  const { removeMoment } = useMoments();

  const confirmDelete = (m: TravelMoment) => {
    Alert.alert(t('moments.deleteTitle'), m.text, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('moments.deleteConfirm'), style: 'destructive', onPress: () => removeMoment(m.id) },
    ]);
  };

  // 시간순(오래된 순) 정렬
  const sorted = [...moments].sort((a, b) => a.createdAt - b.createdAt);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={st.root}>
        <View style={st.handle} />
        <Text style={st.title}>✨ {t('moments.sheetTitle')}</Text>
        <Text style={st.subtitle}>{tripTitle}</Text>
        <FlatList
          data={sorted}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <MomentCard moment={item} onLongPress={() => confirmDelete(item)} />
          )}
        />
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0F' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#2E2E3B', alignSelf: 'center', marginTop: 10 },
  title: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', textAlign: 'center', marginTop: 14 },
  subtitle: { color: '#A1A1B0', fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: 8 },
});
