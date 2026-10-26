import React, { useState, useMemo, useEffect, useRef } from 'react';
import { warn, select } from '../utils/haptics';
import { countryCodeOf } from '../components/CountryPickerModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  FlatList,
  Platform,
  Keyboard,
  Animated,
} from 'react-native';
import { Text, TextInput } from '../ui/Text';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { useProfileSettings, useHomeSettings, useSkinSettings, usePrefSettings, useSettingsActions } from '../store/settingsStore';
import { LANGUAGE_LABELS } from '../i18n';
import { useRecordData, useActiveStay, useRecordActions } from '../store/recordStore';
import { emitToast } from '../store/toastStore';
import { COUNTRIES, countriesHomeFirst } from '../constants/countries';
import type { StayType } from '../utils/stayMachine';
import { fetchNotices } from '../services/notices';
import { hasUnreadNotice } from '../utils/noticeFeed';
import { signOut } from '../services/auth';
import { fetchMateRecoOptin, saveMateRecoOptin } from '../services/profile';
import type { RootStackScreenProps } from '../navigation/types';
import {
  StarIcon,
  LockClosedIcon as SvgLockClosedIcon,
} from '../components/icons';
// 행 아이콘·꺾쇠·돋보기·로그아웃 — 피그마 시안 원본 SVG를 옮긴 화면 전용 아이콘
import {
  SettingsProfileIcon,
  SettingsAccountIcon,
  SettingsNotifIcon,
  SettingsBlockedIcon,
  SettingsArchivedIcon,
  SettingsMateRecoIcon,
  SettingsHapticsIcon,
  SettingsSimpleViewIcon,
  SettingsGlobeSkinIcon,
  SettingsThemeIcon,
  SettingsLanguageIcon,
  SettingsResidenceIcon,
  SettingsHomeRegionIcon,
  SettingsStayIcon,
  SettingsTutorialIcon,
  SettingsLogoRemoveIcon,
  SettingsFrameCustomIcon,
  SettingsHandleFontIcon,
  SettingsNoticeIcon,
  SettingsFaqIcon,
  SettingsFeedbackIcon,
  SettingsTermsIcon,
  SettingsPrivacyIcon,
  SettingsAppVersionIcon,
  SettingsSearchIcon,
  SettingsLogoutIcon,
} from '../components/icons/SettingsIcons';
import HomeRegionSheet from '../components/HomeRegionSheet';
// 카드·헤더·그룹·알약·팝업 틀 — 설정 디자인 공용 부품
import {
  SETTINGS_COLORS as COLORS,
  SettingsHeader,
  SettingGroup,
  type SettingItem,
  SettingsDivider,
  SettingsOptionRow,
  SettingsPillButton,
  SettingsModal,
  settingsText,
} from '../components/settings/SettingsUI';
import LanguageSheet from '../components/LanguageSheet';
import { HANDLE_FONTS, handleFontStyle } from '../constants/handleFonts';
import { useLateFontsLoaded } from '../constants/lateFonts';
import { LAUNCH_FREE_PREMIUM } from '../constants/featureFlags';
import { GLOBE_SKINS } from '../constants/globeSkins';
import { LinearGradient } from 'expo-linear-gradient';
import { andNoFontScale } from '../utils/fitText';
import { APP_VERSION } from '../utils/appVersion';
import StayGuideSlides from '../components/settings/StayGuideSlides';
import { StayCountryStep, StayTypeStep } from '../components/settings/StayStartFlow';
import { STAGE_MAX_W } from '../utils/stage';
// 도움말 견본 카드 = 피드의 실제 카드. SocialScreen 쪽 의존 그래프에 SettingsScreen·AppNavigator가 없어 순환 import가 아니다.
import { DiaryCardMemo } from './SocialScreen';
import { EXAMPLE_FEED_RECORD } from '../constants/exampleContent';

// 개인정보처리방침·이용약관 게시 URL — 가입 화면과 공유하므로 constants/legalLinks 가 단일 출처
import { privacyPolicyUrl, termsUrl } from '../constants/legalLinks';
// 피드백은 구글 폼으로 접수한다(앱 내 FeedbackScreen 대신) — 베타 기간 응답 수집·정리가 쉬움
const FEEDBACK_FORM_URL = 'https://forms.gle/fUwfkXqsKLtuFQxo8';

// (VALID_COUNTRY_CODES 제거 — 거주국을 코드로 직접 입력받던 시절의 방어였다.
//  이제 CountryPickerModal이 COUNTRIES 목록에서만 고르게 하므로 목록 밖 값이 들어올 수 없다.)

// ─── 검색 — 라벨만 비교한다(값 텍스트는 보지 않는다) ───
// 공백을 전부 지우고 소문자로 맞춘 뒤 부분 일치. 라벨 쪽도 같은 정규화를 거쳐 '프로필편집'이 '프로필 편집'에 걸린다.
// 가운뎃점도 지워 '다크라이트'가 '다크 · 라이트 모드'에 걸리게 한다.
const normalizeSearch = (s: string) => s.replace(/[\s·]+/g, '').toLowerCase();

// ─── '간단히 보기' 도움말 — 기본/간단히 소셜 카드를 나란히 비교 ───
// 견본은 목업이 아니라 피드의 실제 카드(SocialScreen DiaryCardMemo)다 — 테이프·뒷장·기울기·폰트·♡·⋯까지 피드 폴라로이드와 같다.
// 글은 공식 예시(EXAMPLE_FEED_RECORD)를 펼치되 isExample: false로 둔다. 예시 글은 간단히 보기에서 제외돼(DiaryCard의
// full 판정) 그대로 두면 오른쪽 카드도 기본 모양으로 그려진다.
//
// 견본은 눌려도 아무 일도 없어야 한다(상세·프로필·좋아요·더블탭·⋯·롱프레스 DM 끌기). 감싼 View의 pointerEvents="none" 하나로 막는다:
//  - iOS(Fabric): RCTViewComponentView hitTest가 None이면 nil을 돌려 하위 뷰가 히트 대상이 못 된다 → RN Pressable도,
//    하위 뷰에 addGestureRecognizer로 붙은 RNGH Pan(UIGestureRecognizer)도 터치를 받지 못한다.
//  - Android: RNGH GestureHandlerOrchestrator.traverseWithPointerEvents가 NONE이면 그 뷰와 자식 전체를 건너뛴다.
//    (RN Modal은 별도 창이라 앱 루트 GestureHandlerRootView의 오케스트레이터가 애초에 보지 못하는 영역이기도 하다.)
//  - pointerEvents=none인 View는 Fabric에서 평탄화되지 않는다(ViewShadowNode formsStackingContext).
//  - 스크린리더 활성화는 히트 테스트를 거치지 않으므로 접근성 트리에서도 숨긴다(accessibilityElementsHidden·no-hide-descendants).
// 견본 줄은 ScrollView 밖에 둔다 — ScrollView는 내용을 잘라 기울어진 뒷장 모서리·테이프가 잘린다.
const noop = () => {};
const NOOP_NAV = { navigate: noop };
const HOUR_MS = 3600 * 1000;

// Modal은 닫히면 자식을 언마운트하므로, 여는 순간 마운트되며 useState 초기값으로 '몇 시간 전' 시각을 잡는다
const SimpleViewSamples = () => {
  const { t } = useTranslation();
  const dragPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [openedAt] = useState(() => Date.now());
  const caption = t('settings.simpleCardViewHelpSampleCaption');
  const sample = useMemo(
    () => ({ ...EXAMPLE_FEED_RECORD, id: 'simple-view-demo', isExample: false, likes: 12, memo: caption, timestamp: openedAt - 3 * HOUR_MS }),
    [caption, openedAt],
  );
  const card = (mode: 'full' | 'minimal', columnIndex: number) => (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <DiaryCardMemo
        item={sample}
        mode={mode}
        navigation={NOOP_NAV}
        toggleLike={noop}
        onArchive={noop}
        onDelete={noop}
        onBlock={noop}
        onReport={noop}
        onToggleVisibility={noop}
        onQuickStart={noop}
        onQuickMove={noop}
        onQuickEnd={noop}
        onQuickCancel={noop}
        dragPos={dragPos}
        columnIndex={columnIndex}
      />
    </View>
  );
  return (
    <View style={st.sampleRow}>
      <View style={st.sampleCol}>
        <Text style={st.sampleLabel} numberOfLines={1} {...andNoFontScale}>{t('settings.simpleCardViewHelpFull')}</Text>
        {card('full', 0)}
      </View>
      <View style={st.sampleCol}>
        <Text style={[st.sampleLabel, st.sampleLabelOn]} numberOfLines={1} {...andNoFontScale}>{t('settings.simpleCardView')}</Text>
        {card('minimal', 1)}
      </View>
    </View>
  );
};

const SimpleViewHelpModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const lines = [
    t('settings.simpleCardViewHelpLine1'),
    t('settings.simpleCardViewHelpLine2'),
    t('settings.simpleCardViewHelpLine3'),
    t('settings.simpleCardViewHelpLine4'),
  ];
  // 틀은 스킨·폰트·장기 체류 팝업과 같은 SettingsModal(설정 카드 재질·헤더 제목·로그아웃과 같은 알약).
  // 견본 두 장이 나란히 들어가야 해서 카드 최대 폭만 스테이지 폭으로 넓힌다.
  return (
    <SettingsModal
      visible={visible}
      title={t('settings.simpleCardView')}
      closeLabel={t('common.close')}
      onClose={onClose}
      cardStyle={st.helpCard}
    >
      <SimpleViewSamples />
      <ScrollView style={st.modalList} showsVerticalScrollIndicator={false}>
        {lines.map((line) => (
          <View key={line} style={st.helpLineRow}>
            <Text style={st.helpLineDot}>•</Text>
            <Text style={st.helpLineText}>{line}</Text>
          </View>
        ))}
      </ScrollView>
    </SettingsModal>
  );
};

// 설정 행 물음표 → '이걸 바꾸면/켜면 어떻게 되는지' 글머리 설명 팝업(거주 국가·장기 체류가 쓴다).
// 문구는 코드와 대조해 쓴다(2026-10-26):
//  · 거주 국가 — 해외 판정 isAbroad(Arrival·Snap·Return 감지), 통계·배지 거주국 제외(도시 붙은 기록 예외),
//    거주 지역 초기화(setHomeCountryCodeWithRegionReset), 프로필 국가 동기화(ProfileSync → 이웃의 FriendProfile),
//    과거 여행 불러오기 거주국 사진 제외(pastTripScan)
//  · 장기 체류 — 거주국 불변 가산 레이어(TripGroup.stay), 체류국 기록 → 체류 카드 합류(recordStore),
//    체류국 isAbroad=false(도착·스냅 알림 없음), 귀국 일시정지·복귀 재개·제3국 별도 카드(stayMachine),
//    체류국은 방문국·프로필 '체류 중' 이웃 노출(FriendProfile stay.stayingIn), 동시 1개·60일 무복귀 종료 넛지(shouldNudgeEnd)
const HelpLinesModal = ({ visible, onClose, title, lines }: { visible: boolean; onClose: () => void; title: string; lines: string[] }) => {
  const { t } = useTranslation();
  return (
    <SettingsModal visible={visible} title={title} closeLabel={t('common.close')} onClose={onClose}>
      <ScrollView style={[st.modalList, st.residenceHelpList]} showsVerticalScrollIndicator={false}>
        {lines.map((line) => (
          <View key={line} style={st.helpLineRow}>
            <Text style={st.helpLineDot}>•</Text>
            <Text style={st.helpLineText}>{line}</Text>
          </View>
        ))}
      </ScrollView>
    </SettingsModal>
  );
};

export default function SettingsScreen({ navigation }: RootStackScreenProps<'Settings'>) {
  const { t, i18n } = useTranslation();
  const { isPremium, handleFont, stripLogoRemoval, handle } = useProfileSettings();
  const { homeCountryCode, homeRegion } = useHomeSettings();
  const { globeSkin } = useSkinSettings();
  const { hapticsEnabled, diaryCardMode, language, lastSeenNoticeAt } = usePrefSettings();
  const { setHapticsEnabled, setHomeCountryCode, setDiaryCardMode, setLanguage, setIsPremium, setHandleFont, setStripLogoRemoval, setGlobeSkin, resetTutorialsSeen } = useSettingsActions();
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

  const { records } = useRecordData();
  const { activeStayGroup } = useActiveStay();
  const { startStay, endStay } = useRecordActions();

  // 아이디 폰트 선택 모달 — 프리미엄 전용, 폰트별 실제 미리보기 렌더
  const [fontModalVisible, setFontModalVisible] = useState(false);
  const lateFonts = useLateFontsLoaded(); // 미리보기 서체 등록 전엔 기본 폰트로 — constants/lateFonts.ts
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
  // '간단히 보기' 물음표 → 기본/간단히 카드 비교 도움말
  const [simpleHelpVisible, setSimpleHelpVisible] = useState(false);

  // 거주 국가 선택 모달 — 목록에서 고르므로 유효성 검사가 필요 없다.
  // (예전 코드 직접 입력 방식에는 VALID_COUNTRY_CODES 방어가 있었다. 지원 목록 밖 코드가
  //  저장되면 거주국 제외·통계·프로필 매칭이 전부 실패하기 때문인데, 이제 목록에 있는
  //  국가만 고를 수 있어 그 경로 자체가 사라졌다.)
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [regionSheetVisible, setRegionSheetVisible] = useState(false); // 거주 지역 설정 시트
  const [languageSheetVisible, setLanguageSheetVisible] = useState(false); // 언어 선택 시트
  const [countrySearch, setCountrySearch] = useState('');
  // 거주 국가는 해외 판정·통계·프로필의 기준이라 행을 누르자마자 저장하지 않는다 — 고른 값을 보류했다가
  // 하단 알약이 '확인'으로 바뀌면 그때 저장한다. 배경 탭·안드로이드 뒤로·같은 국가 재선택은 보류를 버린다.
  const [pendingCountryCode, setPendingCountryCode] = useState<string | null>(null);
  const [residenceHelpVisible, setResidenceHelpVisible] = useState(false);
  const [stayHelpVisible, setStayHelpVisible] = useState(false);
  // 2단계 확인 — 목록에서 '확인'을 누르면 같은 팝업이 주의 단계('confirm')로 바뀌고, 거기서 '확인'을 한 번 더 눌러야 저장된다.
  // Modal을 갈아끼우지 않고 한 Modal 안에서 단계만 바꾼다(장기 체류 팝업과 같은 이유 — 닫힌 직후 새 Modal present가 iOS에서 씹힌다).
  const [countryStep, setCountryStep] = useState<'pick' | 'confirm'>('pick');
  const openCountryModal = () => setCountryModalVisible(true);
  const closeCountryModal = () => {
    setCountrySearch(''); setPendingCountryCode(null); setCountryStep('pick'); setCountryModalVisible(false);
  };
  const confirmCountryChange = () => {
    if (pendingCountryCode) setHomeCountryCode(pendingCountryCode);
    closeCountryModal();
  };

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
  // 주의 단계에 보여 줄 '바꿀 국가'
  const pendingCountry = useMemo(
    () => (pendingCountryCode ? COUNTRIES.find((c) => countryCodeOf(c) === pendingCountryCode) ?? null : null),
    [pendingCountryCode],
  );

  // 거주 국가 팝업 목록 — 거주국을 맨 앞으로(COUNTRIES는 '한국인의 여행 빈도순'이라 해외 사용자는 자기 나라가
  // 한참 아래였다), 한글 이름과 term(코드+영문명) 양쪽으로 검색 — 'kr'·'korea'·'대한'이 모두 걸린다(CountryPickerModal과 같은 규칙)
  const residenceCountries = useMemo(() => {
    const base = countriesHomeFirst(COUNTRIES, homeCountryCode);
    const q = countrySearch.trim();
    if (!q) return base;
    return base.filter((c) => c.name.includes(q) || c.term.toLowerCase().includes(q.toLowerCase()));
  }, [countrySearch, homeCountryCode]);

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

  // 개인정보처리방침 — 게시된 웹 페이지를 인앱 브라우저로 열기 (앱 언어에 맞는 번역본)
  const handleOpenPrivacyPolicy = () => {
    const url = privacyPolicyUrl(i18n.language);
    WebBrowser.openBrowserAsync(url).catch(() => {
      Alert.alert(t('settings.privacyPolicy'), url);
    });
  };

  // 이용약관 — 방침과 동일하게 게시 페이지를 인앱 브라우저로 열기
  const handleOpenTerms = () => {
    const url = termsUrl(i18n.language);
    WebBrowser.openBrowserAsync(url).catch(() => {
      Alert.alert(t('settings.terms'), url);
    });
  };

  // 피드백 — 구글 폼을 인앱 브라우저로 열기 (약관·방침과 동일한 패턴, 실패 시 주소 안내)
  const handleOpenFeedback = () => {
    WebBrowser.openBrowserAsync(FEEDBACK_FORM_URL).catch(() => {
      Alert.alert(t('settings.feedback'), FEEDBACK_FORM_URL);
    });
  };

  // 언어 전환 — 목록·표기는 i18n/index.ts 가 단일 출처이고, 화면은 LanguageSheet 가 그린다.
  // ⚠️ Alert 로 되돌리지 말 것: 안드로이드 Alert 는 버튼을 3개까지만 그려서
  //    (RN Alert.js 의 `buttons.slice(0, 3)`) 언어 4개 + 취소가 담기지 않는다.
  const handleLanguageChange = () => setLanguageSheetVisible(true);

  const handleLogout = () => {
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
  };

  // 상단 검색 — 입력하면 라벨이 부분 일치하는 항목만 남긴다(normalizeSearch 주석 참고).
  // 각 그룹 배열을 그대로 거르고, 빈 그룹은 SettingGroup이 라벨째 그리지 않는다.
  const [searchQuery, setSearchQuery] = useState('');
  const searchKey = normalizeSearch(searchQuery);
  const visible = (items: SettingItem[]) =>
    searchKey ? items.filter((i) => normalizeSearch(i.label).includes(searchKey)) : items;

  const accountItems = visible([
    { icon: <SettingsProfileIcon />,  label: t('settings.editProfile'),     onPress: () => navigation.navigate('EditProfile') },
    { icon: <SettingsAccountIcon />,  label: t('settings.accountSettings'), onPress: () => navigation.navigate('AccountSettings') },
    { icon: <SettingsNotifIcon />,    label: t('settings.notifications'),   onPress: () => navigation.navigate('NotificationSettings') },
    { icon: <SettingsBlockedIcon />,  label: t('settings.blockedUsers'),    onPress: () => navigation.navigate('BlockedUsers') },
    { icon: <SettingsArchivedIcon />, label: t('settings.archivedPosts'),   onPress: () => navigation.navigate('ArchivedPosts') },
  ]);
  // 메이트 추천 — 시안은 계정 카드에서 떼어 낸 단독 알약 카드(모서리 30)다
  const mateItems = visible([
    { icon: <SettingsMateRecoIcon />, label: t('settings.mateReco'), toggle: mateRecoOn, onToggle: toggleMateReco },
  ]);
  const appItems = visible([
    // 촉각 피드백 — 끄면 utils/haptics를 경유하는 전 호출부가 조용해진다(HapticsBridge)
    { icon: <SettingsHapticsIcon />, label: t('settings.haptics'), toggle: hapticsEnabled, onToggle: setHapticsEnabled },
    // 간단히 보기 — 켜면 minimal. 저장값('full'|'minimal')은 그대로라 기존 full 사용자는 꺼진 상태로 보인다
    // (시안의 '소셜 카드 상호작용 표시' 자리)
    {
      icon: <SettingsSimpleViewIcon />,
      label: t('settings.simpleCardView'),
      toggle: diaryCardMode === 'minimal',
      onToggle: (v: boolean) => setDiaryCardMode(v ? 'minimal' : 'full'),
      onHelp: () => setSimpleHelpVisible(true),
      helpA11yLabel: t('settings.simpleCardViewHelpA11y'),
    },
    {
      // 지구본 스킨 — 무료 제공 (유료 스킨 추가 시 모달 내 개별 잠금으로 처리)
      icon: <SettingsGlobeSkinIcon />,
      label: t('settings.globeSkin'),
      value: t(currentSkin.labelKey),
      onPress: () => setSkinModalVisible(true),
    },
    {
      icon: <SettingsThemeIcon />,
      label: t('settings.theme'),
      value: t('settings.themeDark'),
      onPress: () => Alert.alert(t('settings.themeTitle'), t('settings.themeMsg')),
    },
    {
      icon: <SettingsLanguageIcon />,
      label: t('settings.languageChange'),
      value: LANGUAGE_LABELS[language],
      onPress: handleLanguageChange,
    },
    {
      icon: <SettingsResidenceIcon />,
      label: t('settings.residence'),
      // 시안대로 국가 이름만(국기 없음). 코드('KR')는 목록에 없는 값일 때의 마지막 표시다
      value: homeCountry?.name ?? homeCountryCode,
      onPress: openCountryModal,
      // 바꾸면 무엇이 달라지는지 — 중요한 변경이라 행 옆에서 바로 볼 수 있게
      onHelp: () => setResidenceHelpVisible(true),
      helpA11yLabel: t('settings.residenceHelpA11y'),
    },
    {
      // 거주 지역(시·도) — 소셜 탭 '일상' 링의 기준. 미설정이면 '미설정'
      icon: <SettingsHomeRegionIcon />,
      label: t('settings.homeRegion'),
      value: homeRegion?.name ?? t('settings.homeRegionUnset'),
      onPress: () => setRegionSheetVisible(true),
    },
    {
      // 체류 중이 아니면 값을 비운다(꺾쇠만) — 예전 '—' 표시는 시안에서 뺐다
      icon: <SettingsStayIcon />,
      label: t('stay.settingsStart'),
      value: activeStayGroup
        ? `${activeStayGroup.countryFlag ?? ''} ${activeStayGroup.countryName ?? ''}`.trim()
        : undefined,
      onPress: handleStayPress,
      // 켜면 무엇이 달라지는지 — 거주 국가와 헷갈리기 쉬운 기능이라 행 옆에서 바로 설명
      onHelp: () => setStayHelpVisible(true),
      helpA11yLabel: t('stay.helpA11y'),
    },
    {
      // 튜토리얼 다시 보기 — 세 탭(메인·통계·프로필)의 1회 게이트를 모두 풀어준다.
      // 메인은 'replay'로 지금 바로 재생하고, 통계·프로필은 그 탭에 다시 들어갈 때 뜬다.
      icon: <SettingsTutorialIcon />,
      label: t('settings.viewTutorial'),
      onPress: () => {
        resetTutorialsSeen();
        navigation.navigate('Main', { screen: 'MainTab', params: { startTutorial: 'replay' } });
      },
    },
  ]);
  // 프리미엄 — 시안 순서: 스트립 로고 제거 → 스트립 프레임 커스텀 → 아이디 폰트 변경
  const premiumItems = visible([
    // 베타 체험 토글 — 무료 개방 중에는 의미가 없어 숨긴다.
    // (플래그를 내리면 다시 나타난다. 결제 연동 시 구매 화면 진입으로 교체. 시안에 없는 행이라 기존 아이콘 유지)
    ...(LAUNCH_FREE_PREMIUM
      ? []
      : [{ icon: <StarIcon size={22} />, label: t('settings.premiumToggle'), toggle: isPremium, onToggle: setIsPremium }]),
    // 스트립(네컷) 로고 제거 — 프리미엄이면 켜고 끌 수 있는 선택 토글, 아니면 잠금 안내
    isPremium
      ? {
          icon: <SettingsLogoRemoveIcon />,
          label: t('settings.stripLogoRemove'),
          toggle: stripLogoRemoval,
          onToggle: setStripLogoRemoval,
        }
      : {
          icon: <SettingsLogoRemoveIcon />,
          label: t('settings.stripLogoRemove'),
          badge: t('settings.premiumBadge'),
          onPress: () => navigation.navigate('Premium'),
        },
    {
      // 스트립 프레임 커스텀 — 구현됨. 네컷 만들기 팔레트의 + 버튼에서 자유 색 선택(프리미엄)
      icon: <SettingsFrameCustomIcon />,
      label: t('settings.stripFrameCustom'),
      badge: isPremium ? undefined : t('settings.premiumBadge'),
      onPress: () =>
        isPremium
          ? Alert.alert(t('settings.stripFrameCustom'), t('settings.stripFrameCustomMsg'))
          : navigation.navigate('Premium'),
    },
    {
      icon: <SettingsHandleFontIcon />,
      label: t('settings.handleFont'),
      value: t(currentFont.labelKey),
      badge: isPremium ? undefined : t('settings.premiumBadge'),
      onPress: openFontPicker,
    },
  ]);
  const supportItems = visible([
    {
      icon: <SettingsNoticeIcon />,
      label: t('settings.notice'),
      badge: noticeUnread ? t('notice.badgeNew') : undefined,
      onPress: () => navigation.navigate('Notice'),
    },
    { icon: <SettingsFaqIcon />,        label: t('settings.faq'),           onPress: () => navigation.navigate('FAQ') },
    { icon: <SettingsFeedbackIcon />,   label: t('settings.feedback'),      onPress: handleOpenFeedback },
    { icon: <SettingsTermsIcon />,      label: t('settings.terms'),         onPress: handleOpenTerms },
    { icon: <SettingsPrivacyIcon />,    label: t('settings.privacyPolicy'), onPress: handleOpenPrivacyPolicy },
    { icon: <SettingsAppVersionIcon />, label: t('settings.appVersion'),    value: APP_VERSION, chevron: false },
  ]);
  const noSearchResult =
    accountItems.length + mateItems.length + appItems.length + premiumItems.length + supportItems.length === 0;

  return (
    <SafeAreaView style={st.safeArea}>
      {/* 상단 헤더 — 아래 전폭 0.8pt 구분선(흰 15%) */}
      <SettingsHeader title={t('settings.title')} onBack={() => navigation.goBack()} />

      <ScrollView
        style={st.scroll}
        contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}
        // 검색 중 결과 행을 누르면 키보드를 내리는 탭에 먹히지 않고 바로 눌리게, 스크롤하면 키보드를 내린다
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* 검색 */}
        <View style={st.searchBox}>
          <SettingsSearchIcon />
          <TextInput
            style={st.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('settings.searchPlaceholder')}
            placeholderTextColor={COLORS.text50}
            accessibilityLabel={t('settings.searchPlaceholder')}
            cursorColor="#BF85FC"
            selectionHandleColor="#BF85FC"
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>

        {/* 계정 */}
        <SettingGroup label={t('settings.groupAccount')} items={accountItems} />

        {/* 메이트 추천 — 단독 알약 카드 */}
        <SettingGroup items={mateItems} radius={30} style={st.mateCard} />
        {/* 토글 라벨만으로는 무엇이 오가는지 알 수 없다 — 끄면 무엇이 사라지고 무엇을
            잃는지까지 적는다(개인정보처리방침·기록 작성 화면 안내와 같은 내용). */}
        {mateItems.length > 0 && <Text style={settingsText.groupNote}>{t('settings.mateRecoNote')}</Text>}

        {/* 앱 설정 */}
        <SettingGroup
          label={t('settings.groupApp')}
          items={appItems}
          labelStyle={mateItems.length > 0 ? st.groupLabelAfterNote : undefined}
        />

        {/* 프리미엄 */}
        <SettingGroup label={t('settings.groupPremium')} items={premiumItems} />

        {/* 기타 · 지원 */}
        <SettingGroup label={t('settings.groupSupport')} items={supportItems} />

        {searchKey && noSearchResult ? <Text style={st.searchEmpty}>{t('settings.searchNoResult')}</Text> : null}

        {/* 로그아웃 — 검색 중에도 그대로 둔다. 배경은 터치러블 밖 형제로 깔아 눌림 중에도 배경색이 흐려지지 않는다 */}
        <SettingsPillButton
          label={t('settings.logout')}
          onPress={handleLogout}
          tone="danger"
          icon={<SettingsLogoutIcon />}
          style={st.logoutBtn}
        />

        <Text style={st.versionText}>{t('settings.footer', { version: APP_VERSION })}</Text>
        {/* 유리 지구본 배경 크레딧은 2026-07-31에 제거했다 — 허블(ESA/Hubble, CC BY 4.0)
            이미지를 사용자가 직접 만든 이미지로 교체해 표기 의무가 없어졌다.
            외부 저작물을 다시 쓰게 되면 여기에 출처를 되살릴 것. */}
      </ScrollView>

      {/* 거주 국가 선택 — 설정 팝업(SettingsModal) 형식. 장기 체류 국가 단계와 같은 검색칸 + 설정 행 목록이다.
          (예전엔 온보딩과 같은 전체 화면 CountryPickerModal이었다 — 온보딩은 그대로 그 모달을 쓴다.)
          국기·국가명은 한 Text에 합치지 않는다(left 슬롯) — 삼성 기기에서 한글이 사라진다(6ae35f9). */}
      <SettingsModal
        visible={countryModalVisible}
        title={countryStep === 'confirm' ? t('settings.residenceConfirmTitle') : t('settings.countryModalTitle')}
        // 중요한 변경이라 무엇이 바뀌는지 먼저 알린다(자세한 내용은 설정 행 물음표)
        description={countryStep === 'confirm' ? t('settings.residenceConfirmWarn') : t('settings.residenceNotice')}
        // 목록 단계: 다른 국가를 고르면 하단 알약이 '취소' → '확인'으로 바뀌고, 누르면 주의 단계로 넘어간다.
        // 주의 단계: 본문의 '확인'이 최종 저장, 하단 '취소'는 저장 없이 닫기.
        closeLabel={countryStep === 'pick' && pendingCountryCode ? t('common.confirm') : t('common.cancel')}
        onClose={countryStep === 'pick' && pendingCountryCode ? () => { Keyboard.dismiss(); setCountryStep('confirm'); } : closeCountryModal}
        // 배경 탭·안드로이드 뒤로: 주의 단계면 목록으로 한 단계 돌아가고, 목록 단계면 저장 없이 닫는다
        onDismiss={countryStep === 'confirm' ? () => setCountryStep('pick') : closeCountryModal}
        avoidKeyboard
      >
        {countryStep === 'confirm' && pendingCountryCode ? (
          <>
            {/* 무엇에서 무엇으로 — 국기·국가명은 한 Text에 합치지 않는다(삼성 한글 소실, 6ae35f9) */}
            <View style={st.residenceChange}>
              <Text style={st.residenceChangeText}>{homeCountry?.flag ?? ''}</Text>
              <Text style={st.residenceChangeText}>{homeCountry?.name ?? homeCountryCode}</Text>
              <Text style={st.residenceChangeArrow}>→</Text>
              <Text style={st.residenceChangeText}>{pendingCountry?.flag ?? ''}</Text>
              <Text style={[st.residenceChangeText, st.residenceChangeTo]}>{pendingCountry?.name ?? pendingCountryCode}</Text>
            </View>
            <SettingsPillButton label={t('common.confirm')} onPress={confirmCountryChange} style={st.residenceConfirmBtn} />
          </>
        ) : (
        <>
        <View style={[st.searchBox, st.modalSearch]}>
          <SettingsSearchIcon />
          <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
            style={st.searchInput}
            value={countrySearch}
            onChangeText={setCountrySearch}
            placeholder={t('settings.countrySearchPlaceholder')}
            placeholderTextColor={COLORS.text50}
            autoCorrect={false}
          />
        </View>
        <FlatList
          data={residenceCountries}
          keyExtractor={(c) => c.term}
          style={[st.modalList, st.modalListBleed, st.modalListAfterSearch]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={SettingsDivider}
          renderItem={({ item }) => (
            <SettingsOptionRow
              left={<Text style={st.optionFlag}>{item.flag}</Text>}
              label={item.name}
              selected={countryCodeOf(item) === (pendingCountryCode ?? (homeCountryCode || '').toUpperCase())}
              onPress={() => {
                select();
                const code = countryCodeOf(item);
                // 지금 거주국을 다시 고르면 보류를 버린다(바뀌는 게 없으니 '확인'도 필요 없다)
                setPendingCountryCode(code === (homeCountryCode || '').toUpperCase() ? null : code);
              }}
            />
          )}
        />
        </>
        )}
      </SettingsModal>

      <HelpLinesModal
        visible={residenceHelpVisible}
        onClose={() => setResidenceHelpVisible(false)}
        title={t('settings.residence')}
        lines={[1, 2, 3, 4, 5].map((n) => t(`settings.residenceHelpLine${n}` as const))}
      />
      {/* 장기 체류 안내 — 글 대신 그림 슬라이드 6장(StayGuideSlides). 예시 국가는 내 거주국 + (체류 중이면 그 나라, 아니면 일본·미국) */}
      <SettingsModal visible={stayHelpVisible} title={t('stay.settingsStart')} closeLabel={t('common.close')} onClose={() => setStayHelpVisible(false)}>
        <StayGuideSlides
          home={{ flag: homeCountry?.flag ?? '🏠', name: homeCountry?.name ?? homeCountryCode }}
          stay={
            activeStayGroup?.countryName
              ? { flag: activeStayGroup.countryFlag ?? '', name: activeStayGroup.countryName }
              : homeCountry?.name === '일본' ? { flag: '🇺🇸', name: '미국' } : { flag: '🇯🇵', name: '일본' }
          }
        />
      </SettingsModal>

      {/* 거주 지역(시·도) 설정 — '현재 위치로 설정'(주) / '직접 선택'(보조) */}
      {/* allowClear: 설정에서만 저장된 거주 지역을 지울 수 있다(온보딩·스냅 저장 시트는 고르는 맥락) */}
      <HomeRegionSheet visible={regionSheetVisible} onClose={() => setRegionSheetVisible(false)} allowClear />

      {/* 언어 선택 — 안드로이드 Alert 3버튼 제한 때문에 바텀시트다(LanguageSheet 주석 참고) */}
      <LanguageSheet
        visible={languageSheetVisible}
        current={language}
        onSelect={setLanguage}
        onClose={() => setLanguageSheetVisible(false)}
      />

      {/* 아이디 폰트 선택 모달 — 각 폰트로 실제 아이디를 미리보기.
          팝업 3종(폰트·장기 체류·스킨)의 목록은 바깥 팝업 카드를 그대로 설정 카드로 쓴다 — 행을 카드 좌우 끝까지 펴고
          (modalListBleed) 전폭 구분선으로 나눈다. 카드 안에 CardSurface 카드를 한 겹 더 넣으면 같은 채움(#111116) 위에
          링만 16pt 간격으로 두 겹 겹쳐 보여 산만하다(도움말 닫기 알약이 baseRim을 따로 깔아야 했던 것과 같은 이유). */}
      <SettingsModal
        visible={fontModalVisible}
        title={t('settings.handleFont')}
        description={t('settings.handleFontDesc')}
        closeLabel={t('common.cancel')}
        onClose={() => setFontModalVisible(false)}
      >
        <ScrollView style={[st.modalList, st.modalListBleed]} showsVerticalScrollIndicator={false}>
          {HANDLE_FONTS.map((f, i) => (
            <React.Fragment key={f.id}>
              {i > 0 && <SettingsDivider />}
              <SettingsOptionRow
                label={t(f.labelKey)}
                selected={(handleFont ?? 'default') === f.id}
                right={
                  <Text style={[st.fontPreview, handleFontStyle(f.id, lateFonts)]} numberOfLines={1}>
                    {handle ? `@${handle}` : '@eorth'}
                  </Text>
                }
                onPress={() => {
                  // 'default'는 null로 저장 → 서버에서도 폰트 미지정으로 동기화
                  setHandleFont(f.id === 'default' ? null : f.id);
                  setFontModalVisible(false);
                }}
              />
            </React.Fragment>
          ))}
        </ScrollView>
      </SettingsModal>

      {/* 장기체류 수동 시작 모달 — 국가 선택 → 유형 선택을 '한 Modal 안에서' 단계 전환한다.
          이전엔 단계마다 Modal을 갈아끼웠는데, 이 저장소는 "Modal이 닫힌 직후 다른 Modal/
          네이티브 시트를 present하면 씹힌다"는 iOS 함정 이력이 있어(로딩 오버레이·구글 로그인)
          교체 구조 자체를 없앴다. 덤으로 단계 전환 시 페이드 깜빡임도 사라진다.
          배경 탭·안드로이드 뒤로는 한 단계 뒤로(stayModalBack), 하단 취소는 닫기.
          avoidKeyboard: 유형 단계엔 입력이 없어 KAV는 no-op이므로 모달 전체에 걸어도 무해하다. */}
      <SettingsModal
        visible={stayModalStep !== null}
        title={stayModalStep === 'type' ? t('stay.typeTitle') : t('stay.countryTitle')}
        closeLabel={t('common.cancel')}
        onClose={closeStayModal}
        onDismiss={stayModalBack}
        avoidKeyboard
      >
        {/* 본문은 StayStartFlow — 진행 막대·국기 버블·국가 행(국기 배지·대륙)·유형 아이콘 카드. 단계 전환·시작은 여기 핸들러 그대로 */}
        {stayModalStep === 'type' ? (
          <StayTypeStep
            country={staySelectedCountry}
            types={STAY_TYPES}
            onChangeCountry={stayBackToCountry}
            onPick={handleStayTypeSelect}
          />
        ) : (
          <StayCountryStep
            search={stayCountrySearch}
            onSearch={setStayCountrySearch}
            recent={stayRecentCountries}
            countries={stayFilteredCountries}
            homeCountryName={homeCountryName}
            onPick={handleStayCountrySelect}
          />
        )}
      </SettingsModal>

      {/* 지구본 스킨 선택 모달 — 그라데이션 원 미리보기 (aurora 폼 전용 적용) */}
      <SettingsModal
        visible={skinModalVisible}
        title={t('settings.globeSkin')}
        description={t('settings.globeSkinDesc')}
        closeLabel={t('common.cancel')}
        onClose={() => setSkinModalVisible(false)}
      >
        <ScrollView style={[st.modalList, st.modalListBleed]} showsVerticalScrollIndicator={false}>
          {GLOBE_SKINS.map((s, i) => {
            const locked = s.premium && !isPremium;
            return (
              <React.Fragment key={s.id}>
                {i > 0 && <SettingsDivider />}
                <SettingsOptionRow
                  label={t(s.labelKey)}
                  // 잠긴 스킨은 체크 대신 자물쇠만(예전과 같이 둘 중 하나)
                  selected={!locked && globeSkin === s.id}
                  left={<LinearGradient colors={s.preview} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.skinCircle} />}
                  right={locked ? <SvgLockClosedIcon size={14} color="#A1A1B0" /> : undefined}
                  onPress={() => {
                    if (locked) {
                      setSkinModalVisible(false);
                      navigation.navigate('Premium');
                      return;
                    }
                    setGlobeSkin(s.id);
                    setSkinModalVisible(false);
                  }}
                />
              </React.Fragment>
            );
          })}
        </ScrollView>
      </SettingsModal>

      {/* '간단히 보기' 물음표 도움말 */}
      <SimpleViewHelpModal visible={simpleHelpVisible} onClose={() => setSimpleHelpVisible(false)} />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  // 스크롤 — 좌우 16 = 카드·검색창 폭 371(402 기준)
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  // 검색창 — 헤더선 아래 21, 높이 40·모서리 22·흰 6%, 좌우 12·간격 8
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40, // 고정 높이면 iOS 큰 글자(배율 상한 없음)에서 입력 글자가 잘린다
    borderRadius: 22,
    backgroundColor: COLORS.searchBg,
    paddingHorizontal: 12,
    gap: 8,
    marginTop: 21,
    // 시안 그림자(0/4/4, 검정 3%) — 안드로이드 elevation은 반투명 배경에서 테두리 얼룩을 만들어 생략한다
    ...Platform.select({
      ios: { shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowRadius: 2, shadowOpacity: 0.03 },
      default: {},
    }),
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.white,
    padding: 0, // 안드로이드 TextInput 기본 세로 패딩 제거 — 높이 40 안에 가운데 정렬
  },
  searchEmpty: {
    fontSize: 14,
    color: COLORS.text50,
    textAlign: 'center',
    marginTop: 40,
  },

  // 메이트 안내문 아래 → '앱 설정' 라벨 간격 25(다른 그룹 라벨은 23)
  groupLabelAfterNote: { marginTop: 25 },

  // 메이트 추천 단독 카드 — 계정 카드와 간격 20
  mateCard: { marginTop: 20 },

  // 로그아웃 — 지원 카드 아래 25 (알약 치수·채움은 SettingsPillButton danger)
  logoutBtn: { marginTop: 25 },

  // 푸터 — 12pt 흰 50%, 로그아웃 아래 21
  versionText: {
    fontSize: 12,
    color: COLORS.text50,
    textAlign: 'center',
    marginTop: 21,
  },

  // 팝업 본문 목록 — 카드 maxHeight 안에서만 스크롤(flexShrink) — 하단 알약을 밀어내지 않음
  modalList: { flexGrow: 0, flexShrink: 1 },
  // 선택 목록은 팝업 카드 좌우 패딩(16)을 상쇄해 카드 끝까지 편다 — 행·구분선이 설정 카드처럼 전폭
  modalListBleed: { marginHorizontal: -16, marginTop: 12 },
  // 장기 체류 국가 단계 — 검색칸 바로 아래
  modalListAfterSearch: { marginTop: 8 },
  // 팝업 안 검색칸 — 하단 취소 알약과 같은 옅은 흰 테두리로 카드와 구분
  modalSearch: { marginTop: 16, borderWidth: 1, borderColor: COLORS.line },
  // 국가 행의 국기 — 국가명과 다른 Text(삼성 한글 소실 회피, 6ae35f9)
  optionFlag: { fontSize: 14 },

  // 아이디 폰트 미리보기 — 행 값 자리에 실제 폰트로. 길면 말줄임(라벨 자리를 다 먹지 않게)
  fontPreview: { flexShrink: 1, maxWidth: '50%', fontSize: 18, color: COLORS.white },

  // 지구본 스킨 색 원(라벨과 간격은 행 gap 12)
  skinCircle: { width: 34, height: 34, borderRadius: 17 },

  // '간단히 보기' 도움말 — 실제 피드 카드 두 장. 카드 폭은 열 폭을 따른다(피드 (stageW-42)/2보다 약간 좁다).
  // 좌우 패딩 16·열 간격 24: 카드 기울기 + 뒷장 -5°로 모서리가 양옆 ~13 삐져나와도 모달 밖으로 나가거나 서로 겹치지 않게.
  // maxWidth는 스테이지 폭(STAGE_MAX_W) — 기본 팝업 360보다 넓혀 카드를 피드 폭에 가깝게 한다.
  helpCard: { maxWidth: STAGE_MAX_W },
  sampleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 24, marginTop: 16, marginBottom: 22 },
  sampleCol: { flex: 1, minWidth: 0 },
  // 그룹 라벨과 같은 12 Bold. '기본'은 흰 50%, '간단히 보기'만 그룹 라벨 보라로 강조.
  // marginBottom 18: 카드 위로 걸친 테이프(top -8~-13)와 기울기 여유
  sampleLabel: { fontSize: 12, fontWeight: 'bold', color: COLORS.text50, marginBottom: 18, textAlign: 'center' },
  sampleLabelOn: { color: COLORS.label },
  // 설명 — 설정 값 텍스트와 같은 흰 50%
  helpLineRow: { flexDirection: 'row', gap: 6, marginBottom: 6, paddingHorizontal: 4 },
  // 거주 국가 도움말 — 제목 아래 첫 줄 간격
  residenceHelpList: { marginTop: 16 },
  // 거주 국가 변경 확인 단계 — '현재 → 바꿀 국가' 한 줄, 바꿀 국가는 그룹 라벨 보라로 강조
  residenceChange: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20 },
  residenceChangeText: { fontSize: 16, fontWeight: '600', color: COLORS.white },
  residenceChangeArrow: { fontSize: 16, color: COLORS.text50, marginHorizontal: 4 },
  residenceChangeTo: { color: COLORS.label },
  residenceConfirmBtn: { marginTop: 20 },
  helpLineDot: { fontSize: 13, lineHeight: 19, color: COLORS.text50 },
  helpLineText: { flex: 1, fontSize: 13, lineHeight: 19, color: COLORS.text50 },
});
