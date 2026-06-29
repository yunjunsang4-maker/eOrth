import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,  Alert,
  Switch,
  Modal,
  TextInput,
} from 'react-native';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { useDM } from '../store/dmStore';
import { clearPersistedStores } from '../store/persist';
import { signOut } from '../services/auth';
import type { RootStackScreenProps } from '../navigation/types';
import {
  PersonIcon, LockIcon, BellIcon, BlockIcon, ArchiveIcon,
  EyeIcon, GlobeSkinIcon, LanguageIcon, MoonIcon,
  QuestionIcon, ChatIcon, DocumentIcon, InfoIcon, ExitIcon, GalleryIcon,
  TrashIcon,
} from '../components/icons';

const COLORS = {
  bg:           '#0A0A0F',
  card:         '#2E2E3B',
  divider:      '#1A1A26',
  purpleNeon:   '#BF85FC',
  purpleDeep:   '#6B21A8',
  purpleBg:     'rgba(107,33,168,0.25)',
  purpleBorder: 'rgba(191,133,252,0.3)',
  white:        '#FFFFFF',
  textDim:      '#A1A1B0',
  textMuted:    '#4A4A59',
  redBg:        'rgba(255,59,48,0.1)',
  redBorder:    'rgba(255,59,48,0.2)',
  red:          '#FF3B30',
};

// ─── 설정 그룹 ───
const SettingGroup = ({
  items,
}: {
  items: {
    icon: React.ReactNode;
    label: string;
    value?: string;
    badge?: string;
    toggle?: boolean;
    onToggle?: (v: boolean) => void;
    onPress?: () => void;
  }[];
}) => (
  <View style={st.settingGroup}>
    {items.map((item, index) => (
      <React.Fragment key={item.label}>
        <TouchableOpacity
          style={st.settingItem}
          activeOpacity={0.7}
          onPress={item.onPress}
          disabled={item.onToggle != null}
        >
          <View style={st.settingLeft}>
            <View style={st.settingIconWrap}>{item.icon}</View>
            <Text style={st.settingLabel}>{item.label}</Text>
          </View>
          {item.onToggle != null ? (
            <Switch
              value={item.toggle}
              onValueChange={item.onToggle}
              trackColor={{ false: '#3A3A4A', true: 'rgba(191,133,252,0.4)' }}
              thumbColor={COLORS.purpleNeon}
            />
          ) : item.badge ? (
            <View style={st.premiumBadge}>
              <Text style={st.premiumBadgeText}>🔒 프리미엄</Text>
            </View>
          ) : item.value ? (
            <View style={st.settingRight}>
              <Text style={st.settingValue}>{item.value}</Text>
              <Text style={st.chevron}>›</Text>
            </View>
          ) : (
            <Text style={st.chevron}>›</Text>
          )}
        </TouchableOpacity>
        {index < items.length - 1 && <View style={st.itemDivider} />}
      </React.Fragment>
    ))}
  </View>
);

export default function SettingsScreen({ navigation }: RootStackScreenProps<'Settings'>) {
  const {
    showCounts, setShowCounts,
    homeCountryCode, setHomeCountryCode,
    diaryCardMode, setDiaryCardMode,
    resetSettings,
  } = useSettings();
  const { resetRecords } = useRecords();
  const { resetConversations } = useDM();

  // 거주 국가 코드 입력 모달 — Alert.prompt는 iOS 전용이라 양 플랫폼 공용 모달로 처리
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [countryDraft, setCountryDraft] = useState('');
  const openCountryModal = () => { setCountryDraft(homeCountryCode); setCountryModalVisible(true); };
  const submitCountry = () => {
    const v = countryDraft.trim().toUpperCase();
    if (v) setHomeCountryCode(v);
    setCountryModalVisible(false);
  };

  const handleResetData = () => {
    Alert.alert(
      '데이터 초기화',
      '모든 여행 기록·설정·대화 내역이 삭제되고 첫 실행 상태로 돌아갑니다.\n이 작업은 되돌릴 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '초기화',
          style: 'destructive',
          onPress: () => {
            resetRecords();
            resetSettings();
            resetConversations();
            clearPersistedStores().catch(() => {});
            Alert.alert('완료', '데이터가 초기화되었습니다.');
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={st.safeArea}>
      {/* 상단 헤더 */}
      <View style={st.header}>
        <TouchableOpacity style={st.backBtn} activeOpacity={0.7} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="뒤로 가기">
          <Text style={st.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>설정</Text>
        <View style={st.headerPlaceholder} />
      </View>

      <ScrollView
        style={st.scroll}
        contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}
      >
        {/* 계정 */}
        <Text style={st.groupLabel}>계정</Text>
        <SettingGroup
          items={[
            { icon: <PersonIcon size={22} />,  label: '프로필 편집',    onPress: () => navigation.navigate('EditProfile') },
            { icon: <LockIcon size={22} />,    label: '계정 설정',      onPress: () => navigation.navigate('AccountSettings') },
            { icon: <BellIcon size={22} />,    label: '알림 설정',      onPress: () => navigation.navigate('NotificationSettings') },
            { icon: <BlockIcon size={22} />,   label: '차단한 사용자',  onPress: () => navigation.navigate('BlockedUsers') },
            { icon: <ArchiveIcon size={22} />, label: '보관된 게시물',  onPress: () => navigation.navigate('ArchivedPosts') },
          ]}
        />

        {/* 앱 설정 */}
        <Text style={st.groupLabel}>앱 설정</Text>
        <SettingGroup
          items={[
            { icon: <EyeIcon size={22} />, label: '좋아요·댓글 수 표시', toggle: showCounts, onToggle: setShowCounts },
            { icon: <GalleryIcon size={22} />, label: '소셜 카드 상호작용 표시', toggle: diaryCardMode === 'full', onToggle: (v: boolean) => setDiaryCardMode(v ? 'full' : 'minimal') },
            {
              icon: <GlobeSkinIcon size={22} />,
              label: '지구본 스킨',
              badge: '프리미엄',
              onPress: () => Alert.alert('프리미엄 기능', '프리미엄 기능 준비 중입니다.'),
            },
            {
              icon: <LanguageIcon size={22} />,
              label: '언어 변경',
              value: '한국어',
              onPress: () => Alert.alert('언어', '현재 한국어만 지원합니다.'),
            },
            {
              icon: <MoonIcon size={22} />,
              label: '다크·라이트 모드',
              value: '다크',
              onPress: () => Alert.alert('테마', '현재 다크 모드만 지원합니다.'),
            },
            {
              icon: <InfoIcon size={22} />,
              label: '거주 국가',
              value: homeCountryCode,
              onPress: openCountryModal,
            },
          ]}
        />

        {/* 지원 */}
        <Text style={st.groupLabel}>지원</Text>
        <SettingGroup
          items={[
            {
              icon: <QuestionIcon size={22} />,
              label: 'FAQ',
              onPress: () => Alert.alert('FAQ', 'FAQ 페이지 준비 중입니다.'),
            },
            {
              icon: <ChatIcon size={22} />,
              label: '피드백 보내기',
              onPress: () => Alert.alert('피드백', '피드백 기능 준비 중입니다.'),
            },
            {
              icon: <DocumentIcon size={22} />,
              label: '이용약관 · 정책',
              onPress: () => Alert.alert('이용약관', '이용약관 페이지 준비 중입니다.'),
            },
            { icon: <InfoIcon size={22} />,      label: '앱 버전', value: 'v1.0.0' },
          ]}
        />

        {/* 데이터 */}
        <Text style={st.groupLabel}>데이터</Text>
        <SettingGroup
          items={[
            { icon: <TrashIcon size={22} />, label: '데이터 초기화', onPress: handleResetData },
          ]}
        />

        {/* 로그아웃 */}
        <TouchableOpacity
          style={st.logoutBtn}
          activeOpacity={0.7}
          onPress={() =>
            Alert.alert('로그아웃', '정말 로그아웃할까요?', [
              { text: '취소', style: 'cancel' },
              {
                text: '로그아웃',
                style: 'destructive',
                onPress: () => {
                  signOut(); // Supabase 세션 종료 (미설정 시 no-op)
                  navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
                },
              },
            ])
          }
        >
          <View style={st.logoutInner}>
            <ExitIcon size={22} />
            <Text style={st.logoutText}>로그아웃</Text>
          </View>
        </TouchableOpacity>

        <Text style={st.versionText}>eOrth · v1.0.0 · © 2025</Text>
      </ScrollView>

      {/* 거주 국가 입력 모달 (iOS/Android 공용) */}
      <Modal
        visible={countryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCountryModalVisible(false)}
      >
        <View style={st.modalOverlay}>
          <View style={st.modalCard}>
            <Text style={st.modalTitle}>거주 국가</Text>
            <Text style={st.modalDesc}>국가 코드를 입력하세요 (예: KR, US, JP)</Text>
            <TextInput
              style={st.modalInput}
              value={countryDraft}
              onChangeText={setCountryDraft}
              placeholder="KR"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={3}
            />
            <View style={st.modalBtnRow}>
              <TouchableOpacity style={[st.modalBtn, st.modalBtnCancel]} activeOpacity={0.7} onPress={() => setCountryModalVisible(false)}>
                <Text style={st.modalBtnCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.modalBtn, st.modalBtnSubmit]} activeOpacity={0.7} onPress={submitCountry}>
                <Text style={st.modalBtnSubmitText}>확인</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 30,
    color: COLORS.white,
    lineHeight: 36,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  headerPlaceholder: {
    width: 40,
  },

  // 스크롤
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  // 그룹 라벨
  groupLabel: {
    fontSize: 10,
    color: COLORS.textDim,
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 0.8,
  },

  // 설정 그룹
  settingGroup: {
    backgroundColor: 'rgba(46,46,59,0.45)',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingIconWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: {
    fontSize: 13,
    color: COLORS.white,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  settingValue: {
    fontSize: 11,
    color: COLORS.textDim,
  },
  chevron: {
    fontSize: 18,
    color: COLORS.textMuted,
  },
  itemDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginLeft: 52,
  },
  premiumBadge: {
    backgroundColor: 'rgba(107,33,168,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.3)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  premiumBadgeText: {
    fontSize: 9,
    color: COLORS.purpleNeon,
  },

  // 로그아웃
  logoutBtn: {
    backgroundColor: COLORS.redBg,
    borderWidth: 1,
    borderColor: COLORS.redBorder,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  logoutInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoutText: {
    fontSize: 14,
    color: COLORS.red,
  },

  // 버전
  versionText: {
    fontSize: 10,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 20,
  },

  // 거주 국가 입력 모달
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10,10,15,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.white, marginBottom: 6 },
  modalDesc: { fontSize: 12, color: COLORS.textDim, marginBottom: 16 },
  modalInput: {
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.divider,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: COLORS.white,
    fontSize: 16,
    marginBottom: 20,
  },
  modalBtnRow: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, height: 46, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancel: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.divider },
  modalBtnSubmit: { backgroundColor: COLORS.purpleNeon },
  modalBtnCancelText: { color: COLORS.textDim, fontSize: 14, fontWeight: '600' },
  modalBtnSubmitText: { color: COLORS.bg, fontSize: 14, fontWeight: '600' },
});
