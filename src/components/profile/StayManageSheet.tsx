// 프로필 위치 표시("○○ 체류 중")를 탭하면 뜨는 체류 관리 시트 — 카드 보기 / 체류 종료
import React from 'react';
import { Modal, View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Text } from '../../ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { STAGE_MAX_W } from '../../utils/stage';
import SystemSheet, { NATIVE_SHEET } from '../SystemSheet';

export function StayManageSheet({ visible, onEnd, onOpenCard, onClose }: {
  visible: boolean; onEnd: () => void; onOpenCard: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets(); // 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨)
  // 시트 내용 — iOS 시스템 시트(SystemSheet)와 기존 Modal 시트가 함께 쓴다
  const content = (
    <>          <TouchableOpacity style={s.row} onPress={onOpenCard} activeOpacity={0.8}>
            <Text style={s.txt}>{t('stay.openCard')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.row} onPress={onEnd} activeOpacity={0.8}>
            <Text style={[s.txt, { color: '#FF3B30' }]}>{t('stay.endStay')}</Text>
          </TouchableOpacity>
    </>
  );

  // iOS 새 빌드: 시스템 바텀시트(손잡이·배경·딤은 시스템). 옛 빌드·안드로이드는 아래 기존 시트
  if (NATIVE_SHEET) {
    return (
      <SystemSheet visible={visible} onClose={onClose}>
        <View style={s.systemSheetBody}>{content}</View>
      </SystemSheet>
    );
  }

  return (
    <Modal visible={visible} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={[s.sheet, { paddingBottom: Platform.OS === 'ios' ? 34 : insets.bottom + 14 }]}>

          {content}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
const s = StyleSheet.create({
  // iOS 시스템 시트 안쪽 여백 — 기존 시트의 좌우 여백을 맞추고, 위는 시스템 손잡이 자리
  systemSheetBody: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 16 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  // Modal은 루트 클램프 밖이라 폭을 여기서 다시 잡는다(배경 backdrop은 전체 폭 유지)
  sheet: { backgroundColor: '#161421', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34, paddingTop: 8, width: '100%', maxWidth: STAGE_MAX_W, alignSelf: 'center' },
  row: { paddingVertical: 17, alignItems: 'center' },
  txt: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
