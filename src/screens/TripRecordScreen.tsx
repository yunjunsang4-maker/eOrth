import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import TripRecordRenderer from '../components/TripRecordRenderer';
import { useRecords, RecordViewType } from '../store/recordStore';
import { PencilIcon, TrashIcon } from '../components/icons';
import type { RootStackScreenProps } from '../navigation/types';

const VIEW_TYPES: { type: RecordViewType; icon: string; name: string }[] = [
  { type: 'feed',  icon: '📸', name: '피드' },
  { type: 'blog',  icon: '📝', name: '블로그' },
  { type: 'album', icon: '📷', name: '앨범' },
];

export default function TripRecordScreen({ navigation, route }: RootStackScreenProps<'TripRecord'>) {
  const { record: paramRecord, viewType: initialViewType } = route.params;
  const { records, deleteRecord } = useRecords();
  // 편집 후 복귀 시 최신 내용이 보이도록 store의 기록을 우선 사용 (파라미터는 스냅샷)
  const record = records.find((r) => r.id === paramRecord.id) ?? paramRecord;

  const [viewType, setViewType] = useState<RecordViewType>(initialViewType ?? record.viewType ?? 'feed');
  const [menuVisible, setMenuVisible] = useState(false);
  const [formatModalVisible, setFormatModalVisible] = useState(false);

  const handleDelete = () => {
    setMenuVisible(false);
    Alert.alert('기록 삭제', '이 기록을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          deleteRecord(record.id);
          navigation.goBack();
        },
      },
    ]);
  };

  // 기록의 실제 형식(record.viewType)에 따라 편집 화면 분기 — PostDetailScreen과 동일한 규칙
  const handleEdit = () => {
    setMenuVisible(false);
    const recordType = record.viewType ?? 'feed';
    if (recordType === 'snap') {
      Alert.alert('수정 불가', '스냅은 수정할 수 없어요');
    } else if (recordType === 'blog') {
      navigation.navigate('BlogRecord', { record });
    } else if (recordType === 'album') {
      Alert.alert('수정 불가', '앨범 형식은 현재 보관 중이라 수정할 수 없어요.');
    } else {
      navigation.navigate('NewRecord', { record });
    }
  };

  const handleFormatChange = (type: RecordViewType) => {
    setViewType(type);
    setFormatModalVisible(false);
  };

  return (
    <View style={styles.container}>
      {/* 상단 헤더 */}
      <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{record.countryFlag ?? ''} {record.countryName ?? record.country ?? ''}</Text>
          <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.menuBtn}>
            <Text style={styles.menuIcon}>⋯</Text>
          </TouchableOpacity>
        </View>

      {/* 본문 */}
      <ScrollView showsVerticalScrollIndicator={false}>
        <TripRecordRenderer record={record} viewType={viewType} />
      </ScrollView>

      {/* ⋯ 팝업 메뉴 */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuSheet}>
            <TouchableOpacity style={styles.menuItem} onPress={handleEdit}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><PencilIcon size={16} color="#FFFFFF" /><Text style={styles.menuItemText}>수정하기</Text></View>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setMenuVisible(false); setFormatModalVisible(true); }}
            >
              <Text style={styles.menuItemText}>🔄  형식 변경</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><TrashIcon size={16} color="#FF3B30" /><Text style={[styles.menuItemText, styles.menuItemDelete]}>삭제하기</Text></View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 형식 선택 모달 */}
      <Modal visible={formatModalVisible} transparent animationType="slide" onRequestClose={() => setFormatModalVisible(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setFormatModalVisible(false)}>
          <View style={styles.formatSheet}>
            <View style={styles.formatHandle} />
            <Text style={styles.formatTitle}>기록 형식 선택</Text>
            <View style={styles.formatGrid}>
              {VIEW_TYPES.map((item) => (
                <TouchableOpacity
                  key={item.type}
                  style={[styles.formatCard, viewType === item.type && styles.formatCardActive]}
                  onPress={() => handleFormatChange(item.type)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.formatIcon}>{item.icon}</Text>
                  <Text style={[styles.formatName, viewType === item.type && styles.formatNameActive]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ height: 24 }} />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#0A0A0F',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E1B33',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.2)',
  },
  backIcon: {
    fontSize: 18,
    color: '#FFFFFF',
    lineHeight: 22,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'center',
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E1B33',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.2)',
  },
  menuIcon: {
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: 2,
  },

  // ── 팝업 메뉴 ──
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: '#1E1B33',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderColor: 'rgba(191,133,252,0.2)',
  },
  menuItem: {
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  menuItemText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  menuItemDelete: {
    color: '#FF3B30',
  },
  menuDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 16,
  },

  // ── 형식 선택 모달 ──
  formatSheet: {
    backgroundColor: '#13102A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: 'rgba(191,133,252,0.2)',
  },
  formatHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3A55',
    alignSelf: 'center',
    marginBottom: 16,
  },
  formatTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 20,
  },
  formatGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  formatCard: {
    flex: 1,
    height: 80,
    backgroundColor: '#2E2E3B',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  formatCardActive: {
    backgroundColor: '#6B21A8',
    borderColor: '#BF85FC',
  },
  formatIcon: {
    fontSize: 24,
  },
  formatName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A1A1B0',
  },
  formatNameActive: {
    color: '#FFFFFF',
  },
});
