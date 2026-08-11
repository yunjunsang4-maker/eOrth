// 여행 기억 목록 시트 — 여행 카드 ✨ 아이콘 탭으로 열림. 시간순 목록.
// 삭제: 왼쪽 스와이프로 드러난 삭제 버튼 탭 또는 길게 누르기 — 둘 다 확인 Alert를 거친다.
import React from 'react';
import { View, Modal, FlatList, Alert, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Text } from '../../ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// RN Modal은 별도 네이티브 뷰 계층이라 앱 루트의 GestureHandlerRootView가 닿지 않는다 — 시트 내부에 자체 루트 필요
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useTranslation } from 'react-i18next';
import { useMoments } from '../../store/momentStore';
import type { TravelMoment } from '../../store/momentStore';
import MomentCard from './MomentCard';
import { STAGE_MAX_W } from '../../utils/stage';
import { andFitText } from '../../utils/fitText';

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
  const insets = useSafeAreaInsets();

  // 삭제 확인 — 스와이프 버튼·롱프레스가 같은 경로를 쓴다.
  // swipeable을 받으면 취소 시 열려 있던 행을 닫아 준다(확정 시엔 행 자체가 사라진다).
  const confirmDelete = (m: TravelMoment, swipeable?: SwipeableMethods) => {
    Alert.alert(t('moments.deleteTitle'), m.text || m.mood || '', [
      { text: t('common.cancel'), style: 'cancel', onPress: () => swipeable?.close() },
      { text: t('moments.deleteConfirm'), style: 'destructive', onPress: () => removeMoment(m.id) },
    ]);
  };

  // 시간순(오래된 순) 정렬
  const sorted = [...moments].sort((a, b) => a.createdAt - b.createdAt);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {/* pageSheet는 안드로이드에서 무시되어 전체화면이 되므로 상단 인셋을 직접 보정 */}
      <GestureHandlerRootView style={[st.root, Platform.OS === 'android' && { paddingTop: insets.top }]} accessibilityViewIsModal>
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
          contentContainerStyle={st.listContent}
          renderItem={({ item }) => (
            // 왼쪽 스와이프 → 오른쪽에 삭제 버튼(고정 폭)이 드러난다.
            // 스와이프만으로는 지우지 않는다 — 확인 없는 영구 삭제를 막고, 드러난 버튼을
            // 실제로 누를 수 있게(예전엔 열리자마자 삭제돼 버튼이 죽은 UI였다) 한다.
            <ReanimatedSwipeable
              renderRightActions={(_progress, _translation, swipeable) => (
                <TouchableOpacity
                  style={st.deleteAction}
                  onPress={() => confirmDelete(item, swipeable)}
                  accessibilityRole="button"
                  accessibilityLabel={t('moments.deleteConfirm')}
                >
                  <Text style={st.deleteActionText}>🗑️</Text>
                  <Text style={st.deleteActionText} {...andFitText}>{t('moments.deleteConfirm')}</Text>
                </TouchableOpacity>
              )}
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

// 이 시트는 RN Modal(presentationStyle="pageSheet")이라 App.tsx 루트 클램프 바깥에서
// 렌더된다 — 안드로이드에서는 pageSheet가 무시돼 전체화면이 된다. 그래서 폴드·태블릿에서
// 목록 카드가 창 폭 전체로 늘어나 앱의 나머지 화면(≤480dp)과 폭이 달라진다.
// MediaPickerModal과 같은 방식으로 root(불투명 페이지 배경)는 전면 유지하고
// 콘텐츠(제목줄·부제·목록)만 Stage 폭으로 가둔다. root에 클램프를 넣으면 양옆에
// 모달 기본 배경이 드러나 오히려 깨져 보인다.
const CLAMP = { width: '100%' as const, maxWidth: STAGE_MAX_W, alignSelf: 'center' as const };

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0F' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#2E2E3B', alignSelf: 'center', marginTop: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14, position: 'relative', ...CLAMP },
  title: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', textAlign: 'center', flex: 1 },
  closeBtnWrapper: { position: 'absolute', right: 16 },
  closeBtn: { color: '#A1A1B0', fontSize: 14 },
  subtitle: { color: '#A1A1B0', fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: 8, ...CLAMP },
  // flexGrow(빈 상태 중앙정렬용)는 유지 — flex:1이 아니라 딤 배경 오판(규칙 6) 대상이 아니다.
  listContent: { padding: 16, flexGrow: 1, ...CLAMP },
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
