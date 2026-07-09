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
  Pressable,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { useDM } from '../store/dmStore';
import { clearPersistedStores } from '../store/persist';
import { signOut } from '../services/auth';
import { deleteAllMyPosts } from '../services/posts';
import { clearTripState } from '../services/tripState';
import type { RootStackScreenProps } from '../navigation/types';
import {
  PersonIcon, LockIcon, BellIcon, BlockIcon, ArchiveIcon,
  EyeIcon, GlobeSkinIcon, LanguageIcon, MoonIcon,
  QuestionIcon, ChatIcon, DocumentIcon, InfoIcon, ExitIcon, GalleryIcon,
  TrashIcon, StarIcon, TargetIcon, StickerIcon, PaletteIcon,
} from '../components/icons';
import { HANDLE_FONTS, handleFontStyle } from '../constants/handleFonts';
import { GLOBE_SKINS } from '../constants/globeSkins';
import { useSkinAccent } from '../constants/skinTheme';
import { LinearGradient } from 'expo-linear-gradient';

// 개인정보처리방침·이용약관 게시 URL (GitHub Pages)
const PRIVACY_POLICY_URL = 'https://yunjunsang4-maker.github.io/eOrth/privacy-policy.html';
const TERMS_URL = 'https://yunjunsang4-maker.github.io/eOrth/terms.html';

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
  textMuted:    '#8B8B9E',
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
}) => {
  const skinAccent = useSkinAccent();
  return (
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
              trackColor={{ false: '#3A3A4A', true: skinAccent.tint(0.4) }}
              thumbColor={COLORS.purpleNeon}
            />
          ) : item.badge ? (
            <View style={st.premiumBadge}>
              <Text style={st.premiumBadgeText}>{item.badge}</Text>
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
};

export default function SettingsScreen({ navigation }: RootStackScreenProps<'Settings'>) {
  const { t } = useTranslation();
  const {
    showCounts, setShowCounts,
    homeCountryCode, setHomeCountryCode,
    diaryCardMode, setDiaryCardMode,
    language, setLanguage,
    isPremium, setIsPremium,
    handleFont, setHandleFont,
    stripLogoRemoval, setStripLogoRemoval,
    handle,
    globeSkin, setGlobeSkin,
    resetSettings,
  } = useSettings();
  const { resetRecords } = useRecords();
  const { resetConversations } = useDM();

  // 아이디 폰트 선택 모달 — 프리미엄 전용, 폰트별 실제 미리보기 렌더
  const [fontModalVisible, setFontModalVisible] = useState(false);
  const openFontPicker = () => {
    if (!isPremium) {
      navigation.navigate('Premium'); // 잠금 → 페이월로 유도
      return;
    }
    setFontModalVisible(true);
  };
  const currentFont = HANDLE_FONTS.find((f) => f.id === (handleFont ?? 'default')) ?? HANDLE_FONTS[0];

  // 지구본 스킨 선택 모달 — 무료 2종 + 기본. 유료 스킨 추가 시 premium 플래그로 게이트
  const [skinModalVisible, setSkinModalVisible] = useState(false);
  const currentSkin = GLOBE_SKINS.find((s) => s.id === globeSkin) ?? GLOBE_SKINS[0];

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
      t('settings.resetTitle'),
      t('settings.resetMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.resetConfirm'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              // 서버 게시물을 먼저 삭제 — 로컬만 지우면 "되돌릴 수 없이 삭제" 안내와 달리
              // 타인 피드에 글이 계속 노출되고, 다음 복원(pull)이 서버 사본을 되살린다.
              const ok = await deleteAllMyPosts();
              if (!ok) {
                Alert.alert(t('settings.resetTitle'), t('settings.resetFailMsg'));
                return;
              }
              await clearTripState(); // 여행 카드 백업도 제거 (실패는 내부에서 무시)
              resetRecords();
              resetSettings();
              resetConversations();
              clearPersistedStores().catch(() => {});
              Alert.alert(t('settings.doneTitle'), t('settings.resetDoneMsg'));
            })();
          },
        },
      ],
    );
  };

  // 개인정보처리방침 — 게시된 웹 페이지를 인앱 브라우저로 열기
  const handleOpenPrivacyPolicy = () => {
    WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL).catch(() => {
      Alert.alert(t('settings.privacyPolicy'), PRIVACY_POLICY_URL);
    });
  };

  // 이용약관 — 방침과 동일하게 게시 페이지를 인앱 브라우저로 열기
  const handleOpenTerms = () => {
    WebBrowser.openBrowserAsync(TERMS_URL).catch(() => {
      Alert.alert(t('settings.terms'), TERMS_URL);
    });
  };

  // 언어 전환 — 한국어/English 선택 (앱 전체 즉시 반영)
  const handleLanguageChange = () => {
    Alert.alert(
      t('settings.languageChange'),
      t('settings.languageSelectMsg'),
      [
        { text: t('settings.langKo'), onPress: () => setLanguage('ko') },
        { text: t('settings.langEn'), onPress: () => setLanguage('en') },
        { text: t('common.cancel'), style: 'cancel' },
      ],
    );
  };

  return (
    <SafeAreaView style={st.safeArea}>
      {/* 상단 헤더 */}
      <View style={st.header}>
        <TouchableOpacity style={st.backBtn} activeOpacity={0.7} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={t('settings.back')}>
          <Text style={st.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>{t('settings.title')}</Text>
        <View style={st.headerPlaceholder} />
      </View>

      <ScrollView
        style={st.scroll}
        contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}
      >
        {/* 계정 */}
        <Text style={st.groupLabel}>{t('settings.groupAccount')}</Text>
        <SettingGroup
          items={[
            { icon: <PersonIcon size={22} />,  label: t('settings.editProfile'),    onPress: () => navigation.navigate('EditProfile') },
            { icon: <LockIcon size={22} />,    label: t('settings.accountSettings'),      onPress: () => navigation.navigate('AccountSettings') },
            { icon: <BellIcon size={22} />,    label: t('settings.notifications'),      onPress: () => navigation.navigate('NotificationSettings') },
            { icon: <BlockIcon size={22} />,   label: t('settings.blockedUsers'),  onPress: () => navigation.navigate('BlockedUsers') },
            { icon: <ArchiveIcon size={22} />, label: t('settings.archivedPosts'),  onPress: () => navigation.navigate('ArchivedPosts') },
          ]}
        />

        {/* 앱 설정 */}
        <Text style={st.groupLabel}>{t('settings.groupApp')}</Text>
        <SettingGroup
          items={[
            { icon: <EyeIcon size={22} />, label: t('settings.showCounts'), toggle: showCounts, onToggle: setShowCounts },
            { icon: <GalleryIcon size={22} />, label: t('settings.diaryInteraction'), toggle: diaryCardMode === 'full', onToggle: (v: boolean) => setDiaryCardMode(v ? 'full' : 'minimal') },
            {
              // 지구본 스킨 — 무료 제공 (유료 스킨 추가 시 모달 내 개별 잠금으로 처리)
              icon: <GlobeSkinIcon size={22} />,
              label: t('settings.globeSkin'),
              value: t(currentSkin.labelKey),
              onPress: () => setSkinModalVisible(true),
            },
            {
              icon: <LanguageIcon size={22} />,
              label: t('settings.languageChange'),
              value: language === 'en' ? t('settings.langEn') : t('settings.langKo'),
              onPress: handleLanguageChange,
            },
            {
              icon: <MoonIcon size={22} />,
              label: t('settings.theme'),
              value: t('settings.themeDark'),
              onPress: () => Alert.alert(t('settings.themeTitle'), t('settings.themeMsg')),
            },
            {
              icon: <InfoIcon size={22} />,
              label: t('settings.residence'),
              value: homeCountryCode,
              onPress: openCountryModal,
            },
          ]}
        />

        {/* 프리미엄 */}
        <Text style={st.groupLabel}>{t('settings.groupPremium')}</Text>
        <SettingGroup
          items={[
            // 베타 체험 토글 — 결제(RevenueCat) 연동 시 구매 화면 진입으로 교체
            { icon: <StarIcon size={22} />, label: t('settings.premiumToggle'), toggle: isPremium, onToggle: setIsPremium },
            {
              icon: <LanguageIcon size={22} />,
              label: t('settings.handleFont'),
              value: t(currentFont.labelKey),
              badge: isPremium ? undefined : t('settings.premiumBadge'),
              onPress: openFontPicker,
            },
            {
              // 개별 QR 디자인 — 구현됨. 친구찾기 QR 카드의 🎨 버튼에서 프리셋 선택(프리미엄)
              icon: <TargetIcon size={22} />,
              label: t('settings.qrDesign'),
              badge: isPremium ? undefined : t('settings.premiumBadge'),
              onPress: () =>
                isPremium
                  ? Alert.alert(t('settings.qrDesign'), t('settings.qrDesignMsg'))
                  : navigation.navigate('Premium'),
            },
            // 스트립(네컷) 로고 제거 — 프리미엄이면 켜고 끌 수 있는 선택 토글, 아니면 잠금 안내
            isPremium
              ? {
                  icon: <StickerIcon size={22} />,
                  label: t('settings.stripLogoRemove'),
                  toggle: stripLogoRemoval,
                  onToggle: setStripLogoRemoval,
                }
              : {
                  icon: <StickerIcon size={22} />,
                  label: t('settings.stripLogoRemove'),
                  badge: t('settings.premiumBadge'),
                  onPress: () => navigation.navigate('Premium'),
                },
            {
              // 스트립 프레임 커스텀 — 구현됨. 네컷 만들기 팔레트의 + 버튼에서 자유 색 선택(프리미엄)
              icon: <PaletteIcon size={22} />,
              label: t('settings.stripFrameCustom'),
              badge: isPremium ? undefined : t('settings.premiumBadge'),
              onPress: () =>
                isPremium
                  ? Alert.alert(t('settings.stripFrameCustom'), t('settings.stripFrameCustomMsg'))
                  : navigation.navigate('Premium'),
            },
          ]}
        />

        {/* 지원 */}
        <Text style={st.groupLabel}>{t('settings.groupSupport')}</Text>
        <SettingGroup
          items={[
            {
              icon: <QuestionIcon size={22} />,
              label: t('settings.faq'),
              onPress: () => navigation.navigate('FAQ'),
            },
            {
              icon: <ChatIcon size={22} />,
              label: t('settings.feedback'),
              onPress: () => navigation.navigate('Feedback'),
            },
            {
              icon: <DocumentIcon size={22} />,
              label: t('settings.terms'),
              onPress: handleOpenTerms,
            },
            {
              icon: <LockIcon size={22} />,
              label: t('settings.privacyPolicy'),
              onPress: handleOpenPrivacyPolicy,
            },
            { icon: <InfoIcon size={22} />,      label: t('settings.appVersion'), value: 'v1.0.0' },
          ]}
        />

        {/* 데이터 */}
        <Text style={st.groupLabel}>{t('settings.groupData')}</Text>
        <SettingGroup
          items={[
            { icon: <TrashIcon size={22} />, label: t('settings.resetData'), onPress: handleResetData },
          ]}
        />

        {/* 로그아웃 */}
        <TouchableOpacity
          style={st.logoutBtn}
          activeOpacity={0.7}
          onPress={() =>
            Alert.alert(t('settings.logout'), t('settings.logoutConfirm'), [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('settings.logout'),
                style: 'destructive',
                onPress: async () => {
                  // 세션 종료를 기다린 뒤 이동한다. 먼저 이동하면 Splash가 남은 세션으로 자동 재로그인할 수 있음.
                  await signOut(); // Supabase 세션 종료 (미설정 시 no-op)
                  navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
                },
              },
            ])
          }
        >
          <View style={st.logoutInner}>
            <ExitIcon size={22} />
            <Text style={st.logoutText}>{t('settings.logout')}</Text>
          </View>
        </TouchableOpacity>

        <Text style={st.versionText}>{t('settings.footer')}</Text>
      </ScrollView>

      {/* 거주 국가 입력 모달 (iOS/Android 공용) */}
      <Modal
        visible={countryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCountryModalVisible(false)}
      >
        <View style={st.modalOverlay} accessibilityViewIsModal>
          <View style={st.modalCard}>
            <Text style={st.modalTitle}>{t('settings.countryModalTitle')}</Text>
            <Text style={st.modalDesc}>{t('settings.countryModalDesc')}</Text>
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
                <Text style={st.modalBtnCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.modalBtn, st.modalBtnSubmit]} activeOpacity={0.7} onPress={submitCountry}>
                <Text style={st.modalBtnSubmitText}>{t('common.confirm')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 아이디 폰트 선택 모달 — 각 폰트로 실제 아이디를 미리보기 */}
      <Modal
        visible={fontModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFontModalVisible(false)}
      >
        {/* 배경 탭으로도 닫힘 — 카드(내부 Pressable)는 탭을 삼켜 오닫힘 방지 */}
        <Pressable style={st.modalOverlay} accessibilityViewIsModal onPress={() => setFontModalVisible(false)}>
          <Pressable style={st.modalCard} onPress={() => {}}>
            <Text style={st.modalTitle}>{t('settings.handleFont')}</Text>
            <Text style={st.modalDesc}>{t('settings.handleFontDesc')}</Text>
            <ScrollView style={st.fontList} showsVerticalScrollIndicator={false}>
            {HANDLE_FONTS.map((f) => {
              const selected = (handleFont ?? 'default') === f.id;
              return (
                <TouchableOpacity
                  key={f.id}
                  style={[st.fontRow, selected && st.fontRowSelected]}
                  activeOpacity={0.7}
                  onPress={() => {
                    // 'default'는 null로 저장 → 서버에서도 폰트 미지정으로 동기화
                    setHandleFont(f.id === 'default' ? null : f.id);
                    setFontModalVisible(false);
                  }}
                >
                  <View style={st.fontRowInfo}>
                    <Text style={st.fontRowLabel}>{t(f.labelKey)}</Text>
                    <Text style={[st.fontRowPreview, handleFontStyle(f.id)]} numberOfLines={1}>
                      {handle ? `@${handle}` : '@eorth'}
                    </Text>
                  </View>
                  {selected && <Text style={st.fontRowCheck}>✓</Text>}
                </TouchableOpacity>
              );
            })}
            </ScrollView>
            <TouchableOpacity style={[st.modalBtn, st.modalBtnCancel, st.fontModalClose]} activeOpacity={0.7} onPress={() => setFontModalVisible(false)}>
              <Text style={st.modalBtnCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 지구본 스킨 선택 모달 — 그라데이션 원 미리보기 (aurora 폼 전용 적용) */}
      <Modal
        visible={skinModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSkinModalVisible(false)}
      >
        {/* 배경 탭으로도 닫힘 */}
        <Pressable style={st.modalOverlay} accessibilityViewIsModal onPress={() => setSkinModalVisible(false)}>
          <Pressable style={st.modalCard} onPress={() => {}}>
            <Text style={st.modalTitle}>{t('settings.globeSkin')}</Text>
            <Text style={st.modalDesc}>{t('settings.globeSkinDesc')}</Text>
            {GLOBE_SKINS.map((s) => {
              const selected = globeSkin === s.id;
              const locked = s.premium && !isPremium;
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[st.fontRow, selected && st.fontRowSelected]}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (locked) {
                      setSkinModalVisible(false);
                      navigation.navigate('Premium');
                      return;
                    }
                    setGlobeSkin(s.id);
                    setSkinModalVisible(false);
                  }}
                >
                  <LinearGradient colors={s.preview} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.skinCircle} />
                  <Text style={st.skinRowLabel}>{t(s.labelKey)}</Text>
                  {locked ? (
                    <Text style={st.skinLock}>🔒</Text>
                  ) : selected ? (
                    <Text style={st.fontRowCheck}>✓</Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={[st.modalBtn, st.modalBtnCancel, st.fontModalClose]} activeOpacity={0.7} onPress={() => setSkinModalVisible(false)}>
              <Text style={st.modalBtnCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
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
    maxHeight: '85%', // 목록이 길어도 하단 취소 버튼이 화면 안에 남도록
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

  // 아이디 폰트 선택 모달
  fontList: { flexGrow: 0, flexShrink: 1 }, // 카드 maxHeight 안에서만 스크롤 — 취소 버튼 밀어내지 않음
  fontRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.divider,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  fontRowSelected: {
    borderColor: COLORS.purpleBorder,
    backgroundColor: COLORS.purpleBg,
  },
  fontRowInfo: { flex: 1 },
  fontRowLabel: { fontSize: 11, color: COLORS.textDim, marginBottom: 2 },
  fontRowPreview: { fontSize: 18, color: COLORS.white },
  fontRowCheck: { fontSize: 16, color: COLORS.purpleNeon, marginLeft: 10 },
  fontModalClose: { marginTop: 8 },

  // 지구본 스킨 선택 모달
  skinCircle: { width: 34, height: 34, borderRadius: 17, marginRight: 12 },
  skinRowLabel: { flex: 1, fontSize: 13, color: COLORS.white },
  skinLock: { fontSize: 14, marginLeft: 10 },
});
