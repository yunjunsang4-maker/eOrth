import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import type { TocSuggestion } from '../utils/autoToc';

interface AutoTocModalProps {
  visible: boolean;
  suggestions: TocSuggestion[];
  onConfirm: (accepted: TocSuggestion[]) => void; // 추가하고 저장
  onSkip: () => void;                              // 목차 없이 저장
  onClose: () => void;                             // 뒤로(발행 보류)
}

export default function AutoTocModal({
  visible,
  suggestions,
  onConfirm,
  onSkip,
  onClose,
}: AutoTocModalProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (visible) {
      const init: Record<string, boolean> = {};
      suggestions.forEach(s => { init[s.beforeBlockId] = true; });
      setChecked(init);
    }
  }, [visible, suggestions]);

  const toggle = (id: string) =>
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  const accepted = suggestions.filter(s => checked[s.beforeBlockId]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop} accessibilityViewIsModal>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>📋 AI가 목차를 만들었어요</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>
            추가할 소제목을 선택하세요. 본문에 소제목으로 삽입돼요.
          </Text>

          <ScrollView style={styles.list} contentContainerStyle={{ paddingVertical: 4 }}>
            {suggestions.map(s => {
              const on = !!checked[s.beforeBlockId];
              return (
                <TouchableOpacity
                  key={s.beforeBlockId}
                  style={styles.item}
                  onPress={() => toggle(s.beforeBlockId)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, on && styles.checkboxOn]}>
                    {on && <Text style={styles.check}>✓</Text>}
                  </View>
                  <Text
                    style={[styles.itemText, { paddingLeft: (s.level - 1) * 12 }]}
                    numberOfLines={1}
                  >
                    {s.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onSkip}>
              <Text style={styles.btnGhostText}>목차 없이 저장</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, accepted.length === 0 && styles.btnDisabled]}
              onPress={() => onConfirm(accepted)}
              disabled={accepted.length === 0}
            >
              <Text style={styles.btnPrimaryText}>추가하고 저장</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#2E2E3B',
    borderRadius: 16,
    padding: 20,
    maxHeight: '70%',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', flex: 1 },
  close: { fontSize: 16, color: '#A1A1B0', fontWeight: '600', paddingLeft: 12 },
  subtitle: { fontSize: 13, color: '#A1A1B0', marginTop: 6, marginBottom: 12 },
  list: { flexGrow: 0, marginBottom: 4 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1A1A26',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#A1A1B0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxOn: { backgroundColor: '#BF85FC', borderColor: '#BF85FC' },
  check: { color: '#0A0A0F', fontSize: 13, fontWeight: '800' },
  itemText: { flex: 1, fontSize: 14, color: '#FFFFFF' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: { borderWidth: 1, borderColor: '#1A1A26' },
  btnGhostText: { color: '#A1A1B0', fontSize: 14, fontWeight: '600' },
  btnPrimary: { backgroundColor: '#BF85FC' },
  btnPrimaryText: { color: '#0A0A0F', fontSize: 14, fontWeight: '700' },
  btnDisabled: { opacity: 0.4 },
});
