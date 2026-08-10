import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { REPORT_REASON_KEYS } from '../utils/reportAndBlock';
import { STAGE_MAX_W } from '../utils/stage';

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}

export default function ReportModal({ visible, onClose, onSubmit }: ReportModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      transparent statusBarTranslucent navigationBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.overlay} accessibilityViewIsModal>
        <View style={s.card}>
          {/* 헤더 */}
          <View style={s.header}>
            <Text style={s.title}>{t('social.reportReasonTitle')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Text style={s.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 사유 목록 */}
          {REPORT_REASON_KEYS.map((key, idx) => (
            <View key={key}>
              <TouchableOpacity
                style={s.item}
                onPress={() => onSubmit(t(key))}
                activeOpacity={0.7}
              >
                <Text style={s.itemText}>{t(key)}</Text>
              </TouchableOpacity>
              {idx < REPORT_REASON_KEYS.length - 1 && <View style={s.divider} />}
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    backgroundColor: '#1E1E2E',
    borderRadius: 20,
    // 고정 폭 카드가 아니라 width:'100%'라 창 폭을 그대로 먹는다 — Modal은 루트
    // 클램프 밖이므로 폴드·태블릿에서 카드가 800dp까지 늘어난다
    width: '100%',
    maxWidth: STAGE_MAX_W,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#2E2E3B',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeBtn: {
    fontSize: 16,
    color: '#A1A1B0',
  },
  item: {
    height: 52,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  itemText: {
    fontSize: 15,
    color: '#FFFFFF',
  },
  divider: {
    height: 1,
    backgroundColor: '#2E2E3B',
    marginHorizontal: 20,
  },
});
