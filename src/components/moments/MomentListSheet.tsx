// 여행 기억 목록 시트 — 여행 카드 ✨ 아이콘 탭으로 열림. 시간순 목록.
// 삭제: 왼쪽 스와이프(버튼 탭 또는 끝까지 밀면 즉시) 또는 길게 눌러 확인 후.
import React from 'react';
import { View, Text, Modal, FlatList, Alert, StyleSheet, TouchableOpacity } from 'react-native';
// RN Modal은 별도 네이티브 뷰 계층이라 앱 루트의 GestureHandlerRootView가 닿지 않는다 — 시트 내부에 자체 루트 필요
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
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
    Alert.alert(t('moments.deleteTitle'), m.text || m.mood || '', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('moments.deleteConfirm'), style: 'destructive', onPress: () => removeMoment(m.id) },
    ]);
  };

  // 시간순(오래된 순) 정렬
  const sorted = [...moments].sort((a, b) => a.createdAt - b.createdAt);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <GestureHandlerRootView style={st.root} accessibilityViewIsModal>
        <View style={st.handle} />
        <View style={st.titleRow}>
          <Text style={st.title}>✨ {t('moments.sheetTitle')}</Text>
          <TouchableOpacity style={st.closeBtnWrapper} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={st.closeBtn}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={st.subtitle}>{tripTitle}</Text>
        <FlatList
          data={sorted}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          renderItem={({ item }) => (
            // 왼쪽 스와이프 → 오른쪽에 삭제 버튼(고정 폭)이 드러나고, 끝까지 밀면 즉시 삭제
            <ReanimatedSwipeable
              renderRightActions={() => (
                <TouchableOpacity style={st.deleteAction} onPress={() => removeMoment(item.id)}>
                  <Text style={st.deleteActionText}>🗑️</Text>
                  <Text style={st.deleteActionText}>{t('moments.deleteConfirm')}</Text>
                </TouchableOpacity>
              )}
              onSwipeableOpen={(direction) => { if (direction === 'right') removeMoment(item.id); }}
              rightThreshold={64}
              overshootRight={false}
            >
              <MomentCard moment={item} onLongPress={() => confirmDelete(item)} />
            </ReanimatedSwipeable>
          )}
          ListEmptyComponent={
            <View style={st.emptyWrap}>
              <Text style={st.emptyEmoji}>✨</Text>
              <Text style={st.emptyText}>{t('moments.empty')}</Text>
            </View>
          }
        />
      </GestureHandlerRootView>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0F' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#2E2E3B', alignSelf: 'center', marginTop: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14, position: 'relative' },
  title: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', textAlign: 'center', flex: 1 },
  closeBtnWrapper: { position: 'absolute', right: 16 },
  closeBtn: { color: '#A1A1B0', fontSize: 14 },
  subtitle: { color: '#A1A1B0', fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: 8 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyEmoji: { fontSize: 34, opacity: 0.6 },
  emptyText: { color: '#A1A1B0', fontSize: 13, textAlign: 'center' },
  // 스와이프 삭제 버튼 — 전체 폭이 아니라 고정 폭 박스로 카드 오른쪽에서 드러난다
  deleteAction: {
    width: 76, backgroundColor: '#FF3B30', borderRadius: 14,
    marginBottom: 10, marginLeft: 8,
    justifyContent: 'center', alignItems: 'center', gap: 2,
  },
  deleteActionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
