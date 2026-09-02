import React, { useState, useMemo, useEffect } from 'react';
import { select, warn } from '../utils/haptics';
import CountryPickerModal, { countryCodeOf } from '../components/CountryPickerModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Switch,
  Modal,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, TextInput } from '../ui/Text';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { useDM } from '../store/dmStore';
import { emitToast } from '../store/toastStore';
import { COUNTRIES } from '../constants/countries';
import type { StayType } from '../utils/stayMachine';
import { clearPersistedStores } from '../store/persist';
import { fetchNotices } from '../services/notices';
import { hasUnreadNotice } from '../utils/noticeFeed';
import { signOut } from '../services/auth';
import { deleteAllMyPosts } from '../services/posts';
import { fetchMateRecoOptin, saveMateRecoOptin } from '../services/profile';
import { clearTripState } from '../services/tripState';
import type { RootStackScreenProps } from '../navigation/types';
import {
  PersonIcon,
  LockIcon,
  BellIcon,
  BlockIcon,
  ArchiveIcon,
  EyeIcon,
  SparkleIcon,
  GlobeSkinIcon,
  LanguageIcon,
  MoonIcon,
  CompassIcon,
  QuestionIcon,
  ChatIcon,
  DocumentIcon,
  InfoIcon,
  ExitIcon,
  GalleryIcon,
  TrashIcon,
  StarIcon,
  StickerIcon,
  PaletteIcon,
  LockClosedIcon as SvgLockClosedIcon,
} from '../components/icons';
import { HANDLE_FONTS, handleFontStyle } from '../constants/handleFonts';
import { LAUNCH_FREE_PREMIUM } from '../constants/featureFlags';
import { GLOBE_SKINS } from '../constants/globeSkins';
import { useSkinAccent } from '../constants/skinTheme';
import { LinearGradient } from 'expo-linear-gradient';

// 개인정보처리방침·이용약관 게시 URL — 가입 화면과 공유하므로 constants/legalLinks 가 단일 출처
import { PRIVACY_POLICY_URL, TERMS_URL } from '../constants/legalLinks';
// 피드백은 구글 폼으로 접수한다(앱 내 FeedbackScreen 대신) — 베타 기간 응답 수집·정리가 쉬움
const FEEDBACK_FORM_URL = 'https://forms.gle/fUwfkXqsKLtuFQxo8';

// (VALID_COUNTRY_CODES 제거 — 거주국을 코드로 직접 입력받던 시절의 방어였다.
//  이제 CountryPickerModal이 COUNTRIES 목록에서만 고르게 하므로 목록 밖 값이 들어올 수 없다.)

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
    /** value 대신 직접 그릴 노드 — 국기+이름처럼 Text를 나눠야 하는 값에 쓴다 */
    valueNode?: React.ReactNode;
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
              // 스위치가 켜지고 꺼지는 순간 — SettingGroup이 공용이라 이 그룹의 모든 토글에 적용된다.
              // '햅틱' 스위치 자신도 여기를 지난다: 끌 때는 게이트가 아직 열려 있어 마지막 한 번이
              // 울리고, 켤 때는 반영 전이라 울리지 않는다. 어느 쪽이든 오작동이 아니다.
              onValueChange={(v) => { select(); item.onToggle?.(v); }}
              trackColor={{ false: '#3A3A4A', true: skinAccent.accent }}
              thumbColor="#FFFFFF"
            />
          ) : item.badge ? (
            <View style={[st.premiumBadge, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.tint(0.3) }]}>
              <SvgLockClosedIcon size={9} color={skinAccent.accent} />
              <Text style={[st.premiumBadgeText, { color: skinAccent.accent }]}>{item.badge}</Text>
            </View>
          ) : item.valueNode ? (
            // 국기+이름처럼 한 Text에 합치면 안 되는 값 — 삼성 기기에서 한글이 사라진다(6ae35f9)
            <View style={st.settingRight}>
              {item.valueNode}
              <Text style={st.chevron}>›</Text>
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
  const { t, i18n } = useTranslation();
  const {
    showCounts, setShowCounts,
    hapticsEnabled, setHapticsEnabled,
    homeCountryCode, setHomeCountryCode,
    diaryCardMode, setDiaryCardMode,
    language, setLanguage,
    isPremium, setIsPremium,
    handleFont, setHandleFont,
    stripLogoRemoval, setStripLogoRemoval,
    handle,
    globeSkin, setGlobeSkin,
    resetSettings,
    resetTutorialsSeen,
    lastSeenNoticeAt,
  } = useSettings();
  // 미읽음 공지 배지. 실패하면 배지를 띄우지 않을 뿐 화면은 그대로다.
  // lastSeenNoticeAt이 의존성이라, 공지 화면에서 읽고 돌아오면 다시 계산돼 배지가 꺼진다.
  const [noticeUnread, setNoticeUnread] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const all = await fetchNotices(i18n.language);
      if (alive) setNoticeUnread(hasUnreadNotice(all, lastSeenNoticeAt, Date.now()));
    })();
    return () => { alive = false; };
  }, [i18n.language, lastSeenNoticeAt]);

  // 메이트 추천에 내 여행 기록을 쓰는 것에 대한 선택 동의(서버 값 profiles.mate_reco_optin).
  // null(아직 안 물어본 기존 이용자)은 '추천에 포함된 상태'라 토글을 켜서 보여준다 —
  // 사실과 다른 화면을 만들지 않기 위해서다(fetchMateRecoOptin 주석 참조).
  const [mateRecoOn, setMateRecoOn] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      const v = await fetchMateRecoOptin();
      if (alive) setMateRecoOn(v !== false);
    })();
    return () => { alive = false; };
  }, []);
  // 낙관적으로 먼저 반영하고, 저장이 실패하면 되돌린다 — 껐다고 믿었는데 서버는 켜져 있는
  // 상태가 남지 않게 한다(동의 값이라 화면과 실제가 어긋나면 안 된다).
  const toggleMateReco = async (v: boolean) => {
    setMateRecoOn(v);
    const ok = await saveMateRecoOptin(v);
    if (!ok) {
      setMateRecoOn(!v);
      emitToast(t('settings.mateRecoSaveFail'));
    }
  };

  const { records, resetRecords, activeStayGroup, startStay, endStay } = useRecords();
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

  // 거주 국가 선택 모달 — 목록에서 고르므로 유효성 검사가 필요 없다.
  // (예전 코드 직접 입력 방식에는 VALID_COUNTRY_CODES 방어가 있었다. 지원 목록 밖 코드가
  //  저장되면 거주국 제외·통계·프로필 매칭이 전부 실패하기 때문인데, 이제 목록에 있는
  //  국가만 고를 수 있어 그 경로 자체가 사라졌다.)
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const openCountryModal = () => setCountryModalVisible(true);

  // 장기체류 수동 시작 모달 — 2단계: 국가 선택 → 유형 선택
  // step: null=닫힘, 'country'=국가 선택, 'type'=유형 선택
  const [stayModalStep, setStayModalStep] = useState<null | 'country' | 'type'>(null);
  const [stayCountrySearch, setStayCountrySearch] = useState('');
  const [staySelectedCountry, setStaySelectedCountry] = useState<{ name: string; flag: string } | null>(null);

  // 거주국가(homeCountryCode → Country) — 설정 행의 국기·국가명 표시와 체류국 목록 제외에 함께 쓴다
  const homeCountry = useMemo(
    () => COUNTRIES.find((c) => countryCodeOf(c) === (homeCountryCode || '').toUpperCase()) ?? null,
    [homeCountryCode],
  );
  const homeCountryName = homeCountry?.name ?? null;

  // 검색어 필터링 (거주국 제외)
  const stayFilteredCountries = useMemo(() => {
    const q = stayCountrySearch.trim().toLowerCase();
    return COUNTRIES.filter((c) => {
      if (c.name === homeCountryName) return false;
      if (!q) return true;
      return c.term.toLowerCase().includes(q) || c.name.includes(q);
    });
  }, [stayCountrySearch, homeCountryName]);

  // 빠른 선택 — 내 기록에서 최근 남긴 국가 최대 5개(중복 제거·거주국 제외·최신순).
  // 체류 국가는 대개 이미 기록을 남긴 나라라, 200여 개 목록을 훑기 전에 먼저 보여준다.
  // COUNTRIES에 없는 이름은 flag를 못 얻고 startStay의 국가 메타 매칭도 실패하므로 제외한다.
  const stayRecentCountries = useMemo(() => {
    // 예약 글은 timestamp가 '발행 예정 시각'이라(recordStore addRecord: timestamp: data.scheduledAt || Date.now())
    // 아직 가보지도 않은 나라가 최신순 첫 칸을 차지한다. recordStore의 resyncUnpublished가 쓰는
    // 배제 조건(!r.isDraft && !(r.scheduledAt && r.scheduledAt > now))을 그대로 따른다.
    // 같은 필터의 !r.remoteId는 '백엔드 미발행' 판정이라 여기와 무관하므로 가져오지 않는다.
    const now = Date.now();
    // isMyPost !== false: undefined는 내 기록(레거시 포함) — StatsScreen 등과 같은 판정
    const mine = records
      .filter(
        (r) =>
          !r.isExample &&
          r.isMyPost !== false &&
          !!r.countryName &&
          !r.isDraft &&
          !(r.scheduledAt && r.scheduledAt > now),
      )
      .sort((a, b) => b.timestamp - a.timestamp); // filter가 새 배열을 주므로 스토어 배열을 건드리지 않는다
    const seen = new Set<string>();
    const out: { name: string; flag: string }[] = [];
    for (const r of mine) {
      if (out.length >= 5) break;
      const name = r.countryName;
      if (seen.has(name) || name === homeCountryName) continue;
      const meta = COUNTRIES.find((c) => c.name === name);
      if (!meta) continue;
      seen.add(name);
      out.push({ name: meta.name, flag: meta.flag });
    }
    return out;
  }, [records, homeCountryName]);

  const STAY_TYPES: { type: StayType; labelKey: string }[] = [
    { type: 'exchange',        labelKey: 'stay.typeExchange' },
    { type: 'language',        labelKey: 'stay.typeLanguage' },
    { type: 'intern',          labelKey: 'stay.typeIntern' },
    { type: 'workingHoliday', labelKey: 'stay.typeWorkingHoliday' },
    { type: 'other',           labelKey: 'stay.typeOther' },
  ];

  const openStayModal = () => {
    setStayCountrySearch('');
    setStaySelectedCountry(null);
    setStayModalStep('country');
  };
  const closeStayModal = () => setStayModalStep(null);

  const handleStayCountrySelect = (country: { name: string; flag: string }) => {
    setStaySelectedCountry(country);
    setStayModalStep('type');
  };

  // 유형 단계 → 국가 선택으로 되돌리기. 검색어도 함께 비운다 — 국가를 바꾸러 돌아온
  // 시점에 '이전 국가를 찾던 검색어'는 더 이상 유효하지 않고, 남아 있으면 빠른 선택
  // 섹션이 숨어(검색 중엔 헤더 비표시) 정작 가장 쓸모 있는 경로에서 사라진다.
  const stayBackToCountry = () => {
    setStayCountrySearch('');
    setStayModalStep('country');
  };

  // 배경 탭·안드로이드 뒤로가기가 공유하는 되돌리기 — 유형 단계면 국가로,
  // 국가 단계에서는 그대로 닫기(기존 동선 유지).
  const stayModalBack = () => {
    if (stayModalStep === 'type') stayBackToCountry();
    else closeStayModal();
  };

  const handleStayTypeSelect = (type: StayType) => {
    if (!staySelectedCountry) return;
    startStay(staySelectedCountry.name, type);
    emitToast(t('stay.settingsStarted', { country: staySelectedCountry.name }));
    closeStayModal();
  };

  const handleStayPress = () => {
    if (activeStayGroup) {
      warn(); // 되돌릴 수 없는 동작을 묻는 중
      Alert.alert(
        t('stay.alreadyActiveTitle'),
        t('stay.alreadyActiveMsg', { country: activeStayGroup.countryName ?? '' }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('stay.endStay'), style: 'destructive', onPress: () => endStay(activeStayGroup.id) },
        ],
      );
    } else {
      openStayModal();
    }
  };

  const handleResetData = () => {
    warn(); // 되돌릴 수 없는 동작을 묻는 중
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
              // 영속 스토어를 '먼저' 비운다. 리셋 뒤에 비우면 삭제와 리셋 상태의 디바운스
              // 저장(400ms)이 경합해, 삭제가 늦게 끝나면 보존한 아이디까지 디스크에서 사라진다.
              await clearPersistedStores().catch(() => {});
              resetRecords();
              // 계정은 그대로 쓰는 '데이터' 초기화 — 아이디·가입수단·언어는 유지한다.
              // (지우면 ProfileSync가 랜덤 아이디로 서버를 덮고 소셜 가입자가 탈퇴 불가가 된다)
              resetSettings({ keepIdentity: true });
              // 같은 이유로 DM도 '나에게만 삭제' 기록(hiddenIds)과 읽음 워터마크(readMarks)는
              // 남긴다 — 계정이 그대로라 서버 메시지는 살아 있는데, 삭제 기록을 비우면 다음
              // 따라잡기·loadHistory가 내가 지운 메시지를 되살리고 옛 대화가 전부 안읽음으로 켜진다.
              // (위에서 clearPersistedStores로 디스크를 먼저 비웠지만, 이 리셋이 만드는 상태 변경이
              //  usePersistence의 디바운스 저장을 다시 유발해 보존한 두 값이 디스크에 다시 실린다.)
              resetConversations({ keepHidden: true });
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

  // 피드백 — 구글 폼을 인앱 브라우저로 열기 (약관·방침과 동일한 패턴, 실패 시 주소 안내)
  const handleOpenFeedback = () => {
    WebBrowser.openBrowserAsync(FEEDBACK_FORM_URL).catch(() => {
      Alert.alert(t('settings.feedback'), FEEDBACK_FORM_URL);
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
            { icon: <CompassIcon size={22} />, label: t('settings.mateReco'), toggle: mateRecoOn, onToggle: toggleMateReco },
          ]}
        />
        {/* 토글 라벨만으로는 무엇이 오가는지 알 수 없다 — 끄면 무엇이 사라지고 무엇을
            잃는지까지 적는다(개인정보처리방침·기록 작성 화면 안내와 같은 내용). */}
        <Text style={st.groupNote}>{t('settings.mateRecoNote')}</Text>

        {/* 앱 설정 */}
        <Text style={st.groupLabel}>{t('settings.groupApp')}</Text>
        <SettingGroup
          items={[
            { icon: <EyeIcon size={22} />, label: t('settings.showCounts'), toggle: showCounts, onToggle: setShowCounts },
            // 촉각 피드백 — 끄면 utils/haptics를 경유하는 전 호출부가 조용해진다(HapticsBridge)
            { icon: <SparkleIcon size={22} />, label: t('settings.haptics'), toggle: hapticsEnabled, onToggle: setHapticsEnabled },
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
              // 코드('KR') 대신 국기+국가명. 국기와 이름은 각각 Text여야 한다(6ae35f9)
              valueNode: (
                <View style={st.settingValueRow}>
                  <Text style={st.settingValue}>{homeCountry?.flag ?? ''}</Text>
                  <Text style={st.settingValue}>{homeCountry?.name ?? homeCountryCode}</Text>
                </View>
              ),
              onPress: openCountryModal,
            },
            {
              icon: <GlobeSkinIcon size={22} />,
              label: t('stay.settingsStart'),
              value: activeStayGroup
                ? `${activeStayGroup.countryFlag ?? ''} ${activeStayGroup.countryName ?? ''}`.trim()
                : '—',
              onPress: handleStayPress,
            },
            {
              // 튜토리얼 다시 보기 — 세 탭(메인·통계·프로필)의 1회 게이트를 모두 풀어준다.
              // 메인은 'replay'로 지금 바로 재생하고, 통계·프로필은 그 탭에 다시 들어갈 때 뜬다.
              icon: <CompassIcon size={22} />,
              label: t('settings.viewTutorial'),
              onPress: () => {
                resetTutorialsSeen();
                navigation.navigate('Main', { screen: 'MainTab', params: { startTutorial: 'replay' } });
              },
            },
          ]}
        />

        {/* 프리미엄 */}
        <Text style={st.groupLabel}>{t('settings.groupPremium')}</Text>
        <SettingGroup
          items={[
            // 베타 체험 토글 — 무료 개방 중에는 의미가 없어 숨긴다.
            // (플래그를 내리면 다시 나타난다. 결제 연동 시 구매 화면 진입으로 교체)
            ...(LAUNCH_FREE_PREMIUM
              ? []
              : [{ icon: <StarIcon size={22} />, label: t('settings.premiumToggle'), toggle: isPremium, onToggle: setIsPremium }]),
            {
              icon: <LanguageIcon size={22} />,
              label: t('settings.handleFont'),
              value: t(currentFont.labelKey),
              badge: isPremium ? undefined : t('settings.premiumBadge'),
              onPress: openFontPicker,
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
              icon: <BellIcon size={22} />,
              label: t('settings.notice'),
              badge: noticeUnread ? t('notice.badgeNew') : undefined,
              onPress: () => navigation.navigate('Notice'),
            },
            {
              icon: <QuestionIcon size={22} />,
              label: t('settings.faq'),
              onPress: () => navigation.navigate('FAQ'),
            },
            {
              icon: <ChatIcon size={22} />,
              label: t('settings.feedback'),
              onPress: handleOpenFeedback,
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
          onPress={() => {
            warn(); // 되돌릴 수 없는 동작을 묻는 중
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
            ]);
          }}
        >
          <View style={st.logoutInner}>
            <ExitIcon size={22} />
            <Text style={st.logoutText}>{t('settings.logout')}</Text>
          </View>
        </TouchableOpacity>

        <Text style={st.versionText}>{t('settings.footer')}</Text>
        {/* 유리 지구본 배경 크레딧은 2026-07-31에 제거했다 — 허블(ESA/Hubble, CC BY 4.0)
            이미지를 사용자가 직접 만든 이미지로 교체해 표기 의무가 없어졌다.
            외부 저작물을 다시 쓰게 되면 여기에 출처를 되살릴 것. */}
      </ScrollView>

      {/* 거주 국가 선택 — 온보딩과 같은 공용 목록 모달.
          예전에는 국가 코드 두 자리를 직접 타이핑하게 했다(“예: KR, US, JP”). 같은 값을
          정하는데 온보딩은 목록이고 여기만 사용자가 자기 나라의 ISO 코드를 알아야 했다. */}
      <CountryPickerModal
        visible={countryModalVisible}
        onClose={() => setCountryModalVisible(false)}
        onSelect={(c) => { setHomeCountryCode(countryCodeOf(c)); setCountryModalVisible(false); }}
        title={t('settings.countryModalTitle')}
        searchPlaceholder={t('settings.countrySearchPlaceholder')}
        selectedCode={homeCountryCode}
      />

      {/* 아이디 폰트 선택 모달 — 각 폰트로 실제 아이디를 미리보기 */}
      <Modal
        visible={fontModalVisible}
        transparent statusBarTranslucent navigationBarTranslucent
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

      {/* 장기체류 수동 시작 모달 — 국가 선택 → 유형 선택을 '한 Modal 안에서' 단계 전환한다.
          이전엔 단계마다 Modal을 갈아끼웠는데, 이 저장소는 "Modal이 닫힌 직후 다른 Modal/
          네이티브 시트를 present하면 씹힌다"는 iOS 함정 이력이 있어(로딩 오버레이·구글 로그인)
          교체 구조 자체를 없앴다. 덤으로 단계 전환 시 페이드 깜빡임도 사라진다. */}
      <Modal
        visible={stayModalStep !== null}
        transparent statusBarTranslucent navigationBarTranslucent
        animationType="fade"
        onRequestClose={stayModalBack}
      >
        {/* statusBarTranslucent 모달은 안드로이드 adjustResize가 꺼져 KAV로 키보드를 직접 회피.
            유형 단계엔 입력이 없어 KAV는 no-op이므로 모달 전체에 걸어도 무해하다. */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={st.modalOverlay} accessibilityViewIsModal onPress={stayModalBack}>
          <Pressable style={st.modalCard} onPress={() => {}}>
            {stayModalStep === 'type' ? (
              <>
                <Text style={st.modalTitle}>{t('stay.typeTitle')}</Text>
                {/* 선택한 국가는 '읽기 전용 안내'가 아니라 탭하면 국가 선택으로 돌아가는 행이다.
                    배경 탭·뒤로가기도 되돌아가지만 화면에 아무 안내가 없어 발견되지 않았다. */}
                <TouchableOpacity
                  style={[st.fontRow, st.stayPickedRow]}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  onPress={stayBackToCountry}
                >
                  {/* flex:1 — 국가명이 길어도 우측 '변경' 라벨을 밀어내지 않게 한다 */}
                  <Text style={[st.fontRowPreview, { fontSize: 14, flex: 1 }]} numberOfLines={1}>
                    {staySelectedCountry ? `${staySelectedCountry.flag} ${staySelectedCountry.name}` : ''}
                  </Text>
                  <Text style={st.stayPickedChange}>{t('stay.changeCountry')}</Text>
                </TouchableOpacity>
                {STAY_TYPES.map((item) => (
                  <TouchableOpacity
                    key={item.type}
                    style={[st.fontRow, { marginBottom: 8 }]}
                    activeOpacity={0.7}
                    onPress={() => handleStayTypeSelect(item.type)}
                  >
                    <Text style={[st.fontRowPreview, { fontSize: 14 }]}>{t(item.labelKey)}</Text>
                  </TouchableOpacity>
                ))}
              </>
            ) : (
              <>
                <Text style={st.modalTitle}>{t('stay.countryTitle')}</Text>
                <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                  style={[st.modalInput, { marginBottom: 8 }]}
                  value={stayCountrySearch}
                  onChangeText={setStayCountrySearch}
                  placeholder={t('basicInfo.residenceSearchPlaceholder')}
                  placeholderTextColor={COLORS.textMuted}
                  autoCorrect={false}
                />
                <FlatList
                  data={stayFilteredCountries}
                  keyExtractor={(item) => item.name}
                  style={st.fontList}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  // 빠른 선택 섹션은 검색 중엔 숨긴다 — 검색 결과 위에 무관한 나라가 뜨면 방해다
                  ListHeaderComponent={
                    stayCountrySearch.trim() === '' && stayRecentCountries.length > 0 ? (
                      <View>
                        <Text style={st.stayQuickTitle}>{t('stay.recentCountries')}</Text>
                        {stayRecentCountries.map((c) => (
                          <TouchableOpacity
                            key={`recent-${c.name}`}
                            style={[st.fontRow, st.stayQuickRow]}
                            activeOpacity={0.7}
                            onPress={() => handleStayCountrySelect(c)}
                          >
                            <Text style={[st.fontRowPreview, { fontSize: 14 }]}>{c.flag} {c.name}</Text>
                          </TouchableOpacity>
                        ))}
                        <Text style={st.stayQuickTitle}>{t('stay.allCountries')}</Text>
                      </View>
                    ) : null
                  }
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={st.fontRow}
                      activeOpacity={0.7}
                      onPress={() => handleStayCountrySelect(item)}
                    >
                      <Text style={[st.fontRowPreview, { fontSize: 14 }]}>{item.flag} {item.name}</Text>
                    </TouchableOpacity>
                  )}
                />
              </>
            )}
            <TouchableOpacity style={[st.modalBtn, st.modalBtnCancel, st.fontModalClose]} activeOpacity={0.7} onPress={closeStayModal}>
              <Text style={st.modalBtnCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* 지구본 스킨 선택 모달 — 그라데이션 원 미리보기 (aurora 폼 전용 적용) */}
      <Modal
        visible={skinModalVisible}
        transparent statusBarTranslucent navigationBarTranslucent
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
                    <View style={st.skinLock}><SvgLockClosedIcon size={14} color="#A1A1B0" /></View>
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

  // 그룹 아래 보충 설명 — 토글 하나로는 뜻이 안 통하는 항목에 붙인다
  groupNote: {
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.textMuted,
    marginTop: 8,
    marginLeft: 4,
    marginRight: 4,
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
  // 국기와 이름을 각각 Text로 두되 한 줄로 붙여 보이게 하는 래퍼(6ae35f9)
  settingValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
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

  // 장기체류 시작 모달 — 유형 단계의 '선택한 국가(탭하면 다시 고르기)' 행
  stayPickedRow: { borderColor: COLORS.purpleBorder, backgroundColor: COLORS.purpleBg, marginBottom: 14 },
  stayPickedChange: { fontSize: 12, color: COLORS.purpleNeon, marginLeft: 10 },
  // 국가 단계 — 빠른 선택 섹션 헤더/행
  stayQuickTitle: { fontSize: 11, color: COLORS.textDim, marginTop: 4, marginBottom: 6 },
  stayQuickRow: { borderColor: COLORS.purpleBorder, backgroundColor: COLORS.purpleBg },

  // 지구본 스킨 선택 모달
  skinCircle: { width: 34, height: 34, borderRadius: 17, marginRight: 12 },
  skinRowLabel: { flex: 1, fontSize: 13, color: COLORS.white },
  skinLock: { marginLeft: 10 },
});
