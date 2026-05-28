import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useRecords, TravelRecord } from '../store/recordStore';
import { TrashIcon } from '../components/icons';

type RouteParams = {
  TripGroup: { groupId: string };
};

// ─── 국가 구분선 ───
function CountryDivider({ flag, name }: { flag: string; name: string }) {
  return (
    <View style={st.countryDivider}>
      <View style={st.dividerLine} />
      <Text style={st.dividerLabel}>
        {flag} {name}
      </Text>
      <View style={st.dividerLine} />
    </View>
  );
}

// ─── 피드 카드 ───
function FeedCard({ record }: { record: TravelRecord }) {
  return (
    <View style={st.feedCard}>
      <View style={st.feedCardHeader}>
        <Text style={st.feedFlag}>{record.countryFlag}</Text>
        <Text style={st.feedCountry}>{record.countryName}</Text>
        <Text style={st.feedDate}>{record.date}</Text>
      </View>
      {/* 이미지 영역 */}
      <View style={st.feedImageArea}>
        {record.medias && record.medias.length > 0 ? (
          <Text style={st.feedImageEmoji}>{record.countryFlag}</Text>
        ) : (
          <Text style={st.feedImageEmoji}>{record.countryFlag}</Text>
        )}
      </View>
      {/* 본문 */}
      <View style={st.feedBody}>
        {record.content ? (
          <Text style={st.feedText} numberOfLines={4}>{record.content}</Text>
        ) : null}
        {record.rating !== undefined && (
          <Text style={st.feedRating}>{'⭐'.repeat(Math.min(record.rating, 5))}</Text>
        )}
        {record.companions && record.companions.length > 0 && (
          <Text style={st.feedCompanions}>
            👥 {record.companions.join(' · ')}
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── 메인 화면 ───
export default function TripGroupScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'TripGroup'>>();
  const { groupId } = route.params;

  const { tripGroups, records, deleteTripGroup, updateTripGroup } = useRecords();
  const group = tripGroups.find((g) => g.id === groupId);

  const [menuVisible, setMenuVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editTitle, setEditTitle] = useState(group?.title ?? '');

  if (!group) {
    return (
      <View style={st.container}>
        <View style={st.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
            <Text style={st.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={st.headerTitle}>묶음을 찾을 수 없어요</Text>
          <View style={{ width: 36 }} />
        </View>
      </View>
    );
  }

  // 그룹에 속한 기록들 (순서 유지)
  const groupRecords = group.records
    .map((id) => records.find((r) => r.id === id))
    .filter((r): r is TravelRecord => r !== undefined);

  const handleUngroup = () => {
    setMenuVisible(false);
    Alert.alert(
      '묶음 해제',
      '묶음을 해제할까요? 각 기록은 그대로 유지돼요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '해제하기',
          style: 'destructive',
          onPress: () => {
            deleteTripGroup(group.id);
            navigation.goBack();
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    setMenuVisible(false);
    Alert.alert(
      '묶음 삭제',
      '묶음을 삭제할까요? 각 기록은 그대로 유지돼요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            deleteTripGroup(group.id);
            navigation.goBack();
          },
        },
      ]
    );
  };

  const openEdit = () => {
    setEditTitle(group.title);
    setMenuVisible(false);
    setEditModalVisible(true);
  };

  const handleSaveEdit = () => {
    if (!editTitle.trim()) {
      Alert.alert('알림', '묶음 이름을 입력해주세요.');
      return;
    }
    updateTripGroup(group.id, { title: editTitle.trim() });
    setEditModalVisible(false);
  };

  return (
    <View style={st.container}>
      {/* 헤더 */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
          <Text style={st.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle} numberOfLines={1}>{group.title}</Text>
        <TouchableOpacity onPress={() => setMenuVisible(true)} style={st.menuBtn}>
          <Text style={st.menuIcon}>⋯</Text>
        </TouchableOpacity>
      </View>

      {/* 기록 목록 */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.scrollContent}>
        {groupRecords.length === 0 ? (
          <View style={st.emptyState}>
            <Text style={st.emptyIcon}>📦</Text>
            <Text style={st.emptyTitle}>기록이 없어요</Text>
            <Text style={st.emptyDesc}>묶음에 포함된 기록을 불러올 수 없어요.</Text>
          </View>
        ) : (
          groupRecords.map((record, index) => {
            const prev = index > 0 ? groupRecords[index - 1] : null;
            const showDivider =
              !prev ||
              prev.countryName !== record.countryName ||
              prev.countryFlag !== record.countryFlag;
            return (
              <View key={record.id}>
                {showDivider && (
                  <CountryDivider
                    flag={record.countryFlag ?? ''}
                    name={record.countryName ?? record.country ?? ''}
                  />
                )}
                <FeedCard record={record} />
              </View>
            );
          })
        )}
        <View style={{ height: 48 }} />
      </ScrollView>

      {/* ⋯ 팝업 메뉴 */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={st.menuOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={st.menuSheet}>
            <TouchableOpacity style={st.menuItem} onPress={openEdit}>
              <Text style={st.menuItemText}>✏️  묶음 편집</Text>
            </TouchableOpacity>
            <View style={st.menuDivider} />
            <TouchableOpacity style={st.menuItem} onPress={handleUngroup}>
              <Text style={st.menuItemText}>🔓  묶음 해제</Text>
            </TouchableOpacity>
            <View style={st.menuDivider} />
            <TouchableOpacity style={st.menuItem} onPress={handleDelete}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><TrashIcon size={16} color="#FF3B30" /><Text style={[st.menuItemText, st.menuItemDelete]}>묶음 삭제</Text></View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 편집 모달 */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setEditModalVisible(false)}
          />
          <View style={st.editSheet}>
            <View style={st.editHandle} />
            <Text style={st.editSheetTitle}>묶음 편집</Text>

            <Text style={st.editLabel}>묶음 제목</Text>
            <View style={st.editInputWrap}>
              <TextInput
                style={st.editInput}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="여행 묶음 이름을 입력해주세요"
                placeholderTextColor="#4A4A59"
                maxLength={30}
                autoFocus
              />
            </View>

            <TouchableOpacity
              style={st.editSaveBtn}
              onPress={handleSaveEdit}
              activeOpacity={0.85}
            >
              <Text style={st.editSaveBtnText}>저장하기</Text>
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },

  // ── 헤더 ──
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
    marginHorizontal: 8,
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

  // ── 스크롤 ──
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },

  // ── 빈 상태 ──
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 10,
  },
  emptyIcon: {
    fontSize: 52,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyDesc: {
    fontSize: 13,
    color: '#A1A1B0',
    textAlign: 'center',
  },

  // ── 국가 구분선 ──
  countryDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#1A1A26',
  },
  dividerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#BF85FC',
  },

  // ── 피드 카드 ──
  feedCard: {
    backgroundColor: '#13102A',
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.1)',
  },
  feedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 6,
  },
  feedFlag: {
    fontSize: 18,
  },
  feedCountry: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
  },
  feedDate: {
    fontSize: 11,
    color: '#A1A1B0',
  },
  feedImageArea: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#1E1B33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedImageEmoji: {
    fontSize: 56,
  },
  feedBody: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  feedText: {
    fontSize: 14,
    color: '#E0E0EF',
    lineHeight: 22,
  },
  feedRating: {
    fontSize: 14,
  },
  feedCompanions: {
    fontSize: 12,
    color: '#A1A1B0',
  },

  // ── ⋯ 팝업 메뉴 ──
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

  // ── 편집 모달 ──
  editSheet: {
    backgroundColor: '#1E1E2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(191,133,252,0.2)',
  },
  editHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3A55',
    alignSelf: 'center',
    marginBottom: 16,
  },
  editSheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 20,
  },
  editLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#BF85FC',
    marginBottom: 10,
  },
  editInputWrap: {
    backgroundColor: '#2A2A3A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.25)',
    paddingHorizontal: 14,
    marginBottom: 24,
  },
  editInput: {
    color: '#FFFFFF',
    fontSize: 15,
    paddingVertical: 13,
  },
  editSaveBtn: {
    backgroundColor: '#6B21A8',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  editSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
