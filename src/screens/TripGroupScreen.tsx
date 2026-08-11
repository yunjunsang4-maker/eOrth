import React, { useState, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, TextInput } from '../ui/Text';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSkinAccent, type SkinAccent } from '../constants/skinTheme';
import { useRecords, TravelRecord } from '../store/recordStore';
import { TrashIcon } from '../components/icons';
import { countryLabel } from '../utils/countryLabel';
import { STAGE_MAX_W } from '../utils/stage';
import { andFitText } from '../utils/fitText';

type RouteParams = {
  TripGroup: { groupId: string };
};

// ─── 국가 구분선 ───
function CountryDivider({ flag, name }: { flag: string; name: string }) {
  const st = useSt();
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
  const { i18n } = useTranslation();
  const st = useSt();
  return (
    <View style={st.feedCard}>
      <View style={st.feedCardHeader}>
        <Text style={st.feedFlag}>{record.countryFlag}</Text>
        <Text style={st.feedCountry}>{countryLabel(record.countryName, i18n.language)}</Text>
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
  const { t } = useTranslation();
  const st = useSt();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
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
        <View style={[st.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn} accessibilityRole="button" accessibilityLabel={t('trip.back')}>
            <Text style={st.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={st.headerTitle}>{t('trip.groupNotFound')}</Text>
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
      t('trip.ungroupTitle'),
      t('trip.ungroupMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('trip.ungroup'),
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
      t('trip.groupDeleteTitle'),
      t('trip.groupDeleteMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('trip.delete'),
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
      Alert.alert(t('trip.noticeTitle'), t('trip.groupNameRequired'));
      return;
    }
    updateTripGroup(group.id, { title: editTitle.trim() });
    setEditModalVisible(false);
  };

  return (
    <View style={st.container}>
      {/* 헤더 */}
      <View style={[st.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn} accessibilityRole="button" accessibilityLabel={t('trip.back')}>
          <Text style={st.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle} numberOfLines={1}>{group.title}</Text>
        <TouchableOpacity onPress={() => setMenuVisible(true)} style={st.menuBtn}>
          <Text style={st.menuIcon}>⋯</Text>
        </TouchableOpacity>
      </View>

      {/* 기록 목록 */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.scrollContent} keyboardShouldPersistTaps="handled">
        {groupRecords.length === 0 ? (
          <View style={st.emptyState}>
            <Text style={st.emptyIcon}>📦</Text>
            <Text style={st.emptyTitle}>{t('trip.noRecords')}</Text>
            <Text style={st.emptyDesc}>{t('trip.noRecordsDesc')}</Text>
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
        transparent statusBarTranslucent navigationBarTranslucent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={st.menuOverlay}
          accessibilityViewIsModal
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) */}
          <View style={[st.menuSheet, { paddingBottom: Platform.OS === 'ios' ? 32 : insets.bottom + 14 }]}>
            <TouchableOpacity style={st.menuItem} onPress={openEdit}>
              <Text style={st.menuItemText}>✏️  {t('comp2.groupEdit')}</Text>
            </TouchableOpacity>
            <View style={st.menuDivider} />
            <TouchableOpacity style={st.menuItem} onPress={handleUngroup}>
              <Text style={st.menuItemText}>🔓  {t('comp2.groupUngroup')}</Text>
            </TouchableOpacity>
            <View style={st.menuDivider} />
            <TouchableOpacity style={st.menuItem} onPress={handleDelete}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><TrashIcon size={16} color="#FF3B30" /><Text style={[st.menuItemText, st.menuItemDelete]}>{t('trip.groupDelete')}</Text></View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 편집 모달 */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent statusBarTranslucent navigationBarTranslucent
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end' }}
          accessibilityViewIsModal
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setEditModalVisible(false)}
          />
          <View style={st.editSheet}>
            <View style={st.editHandle} />
            <Text style={st.editSheetTitle}>{t('trip.editGroup')}</Text>

            <Text style={st.editLabel}>{t('trip.groupTitle')}</Text>
            <View style={st.editInputWrap}>
              <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                style={st.editInput}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder={t('trip.groupNamePlaceholder')}
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
              <Text style={st.editSaveBtnText} {...andFitText}>{t('trip.saveLarge')}</Text>
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// 스킨 강조색을 받아 스타일을 만든다. useSt()는 리렌더 구독을 겸한다 — 미구독이면
// 스택에 남아 있던 이 화면의 아이콘이 이전 팔레트로 표시된다.
function useSt() {
  const a = useSkinAccent();
  return useMemo(() => makeStyles(a), [a]);
}

const makeStyles = (a: SkinAccent) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },

  // ── 헤더 ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    borderColor: a.tint(0.2),
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
    borderColor: a.tint(0.2),
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
    color: a.accent,
  },

  // ── 피드 카드 ──
  feedCard: {
    backgroundColor: '#13102A',
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: a.tint(0.1),
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
    // Modal은 루트 클램프 밖이라 폭을 여기서 다시 잡는다(딤 배경 menuOverlay는 전체 폭 유지)
    width: '100%',
    maxWidth: STAGE_MAX_W,
    alignSelf: 'center',
    backgroundColor: '#1E1B33',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderColor: a.tint(0.2),
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
    // Modal은 루트 클램프 밖이라 폭을 여기서 다시 잡는다
    width: '100%',
    maxWidth: STAGE_MAX_W,
    alignSelf: 'center',
    backgroundColor: '#1E1E2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: a.tint(0.2),
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
    color: a.accent,
    marginBottom: 10,
  },
  editInputWrap: {
    backgroundColor: '#2A2A3A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: a.tint(0.25),
    paddingHorizontal: 14,
    marginBottom: 24,
  },
  editInput: {
    color: '#FFFFFF',
    fontSize: 15,
    paddingVertical: 13,
  },
  editSaveBtn: {
    backgroundColor: a.accentDeep,
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
