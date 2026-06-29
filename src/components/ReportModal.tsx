import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { REPORT_REASONS } from '../utils/reportAndBlock';

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}

export default function ReportModal({ visible, onClose, onSubmit }: ReportModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.overlay} accessibilityViewIsModal>
        <View style={s.card}>
          {/* 헤더 */}
          <View style={s.header}>
            <Text style={s.title}>신고 사유를 선택해주세요</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="닫기">
              <Text style={s.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 사유 목록 */}
          {REPORT_REASONS.map((reason, idx) => (
            <View key={reason}>
              <TouchableOpacity
                style={s.item}
                onPress={() => onSubmit(reason)}
                activeOpacity={0.7}
              >
                <Text style={s.itemText}>{reason}</Text>
              </TouchableOpacity>
              {idx < REPORT_REASONS.length - 1 && <View style={s.divider} />}
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
    width: '100%',
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
