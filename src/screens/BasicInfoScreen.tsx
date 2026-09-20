import { select, warn } from '../utils/haptics';
import CountryPickerModal from '../components/CountryPickerModal';
import HomeRegionSheet from '../components/HomeRegionSheet';
import React, { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  FlatList,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Text, TextInput } from '../ui/Text';
import Svg, {
  Defs as SvgDefs,
  LinearGradient as SvgLinearGradient,
  Stop as SvgStop,
  Rect as SvgRect,
  Circle as SvgCircle,
  Path as SvgPath,
} from 'react-native-svg';
import StarFieldBackground from '../components/StarFieldBackground';
import { STAGE_MAX_W } from '../utils/stage';
import { andFitText } from '../utils/fitText';
import { IntroAmbient } from './introVisuals';
import { useRecords } from '../store/recordStore';
import type { StayType } from '../utils/stayMachine';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { useSettings, type AppLanguage } from '../store/settingsStore';
import { isHandleAvailable, markOnboarded, saveMateRecoOptin } from '../services/profile';
import { signOut } from '../services/auth';
import { showPermissionDeniedAlert } from '../utils/permissionAlert';
import { detectCurrentCountry } from '../services/snapService';
import type { RootStackScreenProps } from '../navigation/types';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { PersonIcon, CameraIcon, BackChevronIcon } from '../components/icons';
import RequirementList from '../components/RequirementList';
import { COUNTRIES, type Country } from '../constants/countries';
import { minimumSignupAge } from '../constants/minimumAge';

// 국가 코드 추출은 공용 것을 쓴다 — 같은 함수를 화면마다 다시 정의하면
// 이번에 고친 것과 똑같은 방식으로 조용히 갈라진다.
import { countryCodeOf as codeOf } from '../components/CountryPickerModal';
import { DEVICE_DEFAULT_HOME_COUNTRY, LANGUAGE_LABELS, SELECTABLE_LANGUAGES } from '../i18n';

// 온보딩·로그인과 동일한 유리 필 버튼 — 흰 10% + #CECFCD 그라데이션 테두리
function GlassButton({ label, onPress, disabled, loading, style }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: any;
}) {
  const [btnW, setBtnW] = useState(0);
  return (
    <TouchableOpacity
      style={[glassBtn.btn, disabled && { opacity: 0.4 }, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      onLayout={(e) => setBtnW(Math.round(e.nativeEvent.layout.width))}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <Text style={glassBtn.label}>{label}</Text>
      )}
      {btnW > 0 && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={btnW} height={56}>
            <SvgDefs>
              <SvgLinearGradient id="basicBtnRing" x1="0.216" y1="-0.08" x2="0.283" y2="1.10">
                <SvgStop offset="0" stopColor="#CECFCD" stopOpacity={1} />
                <SvgStop offset="0.607" stopColor="#CECFCD" stopOpacity={0} />
              </SvgLinearGradient>
            </SvgDefs>
            <SvgRect x={0.5} y={0.5} width={btnW - 1} height={55} rx={28} stroke="url(#basicBtnRing)" strokeWidth={1} fill="none" />
          </Svg>
        </View>
      )}
    </TouchableOpacity>
  );
}
const glassBtn = StyleSheet.create({
  btn: {
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  label: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});

// 아이디(handle) 형식: 영문/숫자/_ 4~30자
const HANDLE_RE = /^[a-zA-Z0-9_]{4,30}$/;

// 아이디 중복 검사 디바운스 — 타이핑이 멎고 이만큼 지나야 서버를 부른다.
// 짧으면 글자마다 요청이 나가고, 길면 결과가 늦어 "확인 중"만 오래 보인다.
const HANDLE_CHECK_DEBOUNCE_MS = 500;

// 기기 지역 기반 기본 거주국 — 'KR' 고정이면 해외 사용자는 온보딩 첫 화면부터 남의 나라를 본다
const DEFAULT_COUNTRY: Country =
  COUNTRIES.find((c) => codeOf(c) === DEVICE_DEFAULT_HOME_COUNTRY) ?? COUNTRIES[0];

const STAY_TYPES: { value: StayType; key: string }[] = [
  { value: 'exchange', key: 'stay.typeExchange' },
  { value: 'language', key: 'stay.typeLanguage' },
  { value: 'intern', key: 'stay.typeIntern' },
  { value: 'workingHoliday', key: 'stay.typeWorkingHoliday' },
  { value: 'other', key: 'stay.typeOther' },
];

type Props = RootStackScreenProps<'BasicInfo'>;

export default function BasicInfoScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const {
    setProfilePhoto,
    profilePhoto,
    homeCountryCode,
    setHomeCountryCode,
    homeRegion,
    language: storeLanguage,
    setLanguage: setStoreLanguage,
    handle: storeHandle,
    setHandle: setStoreHandle,
    setHandleChosen,
    setOnboardedAt,
  } = useSettings();
  const { startStay } = useRecords();
  const [photo, setPhoto] = useState<string | null>(profilePhoto || null);
  // 아이디(handle): 기본값은 자동 생성된 아이디로 채워두고 사용자가 수정 가능
  const [handle, setHandle] = useState(storeHandle || '');
  const [checkingHandle, setCheckingHandle] = useState(false);
  // 연령 확인은 불리언이 아니라 **사용자가 동의한 나이 자체**를 들고 있는다.
  // 이 체크박스는 "만 N세 이상입니다"라는 특정 숫자에 대한 자기신고라, 불리언으로 두면
  // 거주국이 바뀌는 경로마다 체크를 풀어 주는 코드를 달아야 하고 하나라도 빠지면 사용자가
  // 한 적 없는 진술이 켜진 채 남는다(실제로 GPS 자동 감지가 늦게 해소되는 경로에서 그랬다).
  // 동의한 나이를 저장하고 현재 기준과 같은지 파생시키면 경로를 셀 필요가 없다.
  const [confirmedAge, setConfirmedAge] = useState<number | null>(null);
  // 메이트 추천 선택 동의 — 온보딩 단계를 줄이려고 독립 동의 화면을 이 화면으로 흡수했다(그 화면은 삭제됨).
  // 기본값은 반드시 '꺼짐'. 선택 동의는 사전 동의가 원칙이라 미리 체크해 두면 다크패턴이 된다.
  const [mateRecoAgreed, setMateRecoAgreed] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>(storeLanguage || 'ko');
  const [selectedCountry, setSelectedCountry] = useState<Country>(
    COUNTRIES.find((c) => codeOf(c) === homeCountryCode) ?? DEFAULT_COUNTRY
  );
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [regionSheetVisible, setRegionSheetVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [locating, setLocating] = useState(false);
  const [stayOn, setStayOn] = useState(false);
  const [stayCountry, setStayCountry] = useState<Country | null>(null);
  const [stayType, setStayType] = useState<StayType>('exchange');
  const [stayCountryModalVisible, setStayCountryModalVisible] = useState(false);

  // 가입 최소 연령은 거주국마다 다르다(한국 14 · COPPA 13 · GDPR 제8조 13~16).
  // 이 화면에서 고른 거주국이 곧 기준이므로 스토어가 아니라 selectedCountry 를 본다 —
  // 스토어 값은 changeCountry 가 같이 써 두지만, 렌더 시점에 확실히 최신인 쪽은 이쪽이다.
  const minAge = minimumSignupAge(codeOf(selectedCountry));

  // 동의한 나이가 현재 기준과 같을 때만 '확인됨'이다. 거주국이 14세 나라에서 16세 나라로
  // 바뀌면 이 값이 저절로 false 가 되어 체크가 풀린다 — 되돌리는 코드가 따로 필요 없다.
  // 같은 나이로 옮기면(KR 14 → ES 14) 진술이 글자 그대로 같으므로 체크가 유지된다.
  const ageConfirmed = confirmedAge === minAge;

  // 아이디 입력 조건 — 빨간 오류 문구로 뒤늦게 지적하는 대신 조건을 미리 전부 보여주고,
  // 충족되면 밝아진다. 앞 두 줄을 모두 만족하면 곧 HANDLE_RE를 통과한다(정의를 나눠 적은 것).
  // charset 줄은 입력 단계에서 이미 걸러지지만(onChangeText), 한글을 쳤을 때 아무것도
  // 입력되지 않는 이유를 알려주는 역할을 하므로 그대로 노출한다.
  const trimmedHandle = handle.trim();
  const handleFormatOk = HANDLE_RE.test(trimmedHandle);

  // 중복 검사 상태 — 'idle'은 형식이 아직 안 맞아 서버를 부르지 않은 상태,
  // 'unknown'은 검사 불가(Supabase 미설정·오프라인·타임아웃). 둘 다 조건 줄을 감춘다.
  // 확인해 주지도 못하면서 "사용할 수 있어요"라고 단정할 수는 없기 때문이다.
  // (최종 방어는 그대로 handleFinish의 제출 시점 검사 + profiles.handle UNIQUE 제약)
  const [handleAvail, setHandleAvail] =
    useState<'idle' | 'checking' | 'available' | 'taken' | 'unknown'>('idle');

  useEffect(() => {
    // 형식부터 틀렸으면 서버를 부르지 않는다 — 위의 두 조건 줄이 먼저 안내한다.
    if (!handleFormatOk) {
      setHandleAvail('idle');
      return;
    }
    let cancelled = false;
    setHandleAvail('checking');
    // 글자마다 서버를 때리지 않도록 디바운스. 입력이 바뀌면 이전 타이머와 응답을 모두 버려서
    // 늦게 도착한 옛 응답이 최신 입력의 결과를 덮어쓰지 못하게 한다(순서 뒤바뀜 방지).
    const timer = setTimeout(() => {
      void isHandleAvailable(trimmedHandle).then((avail) => {
        if (cancelled) return;
        setHandleAvail(avail === null ? 'unknown' : avail ? 'available' : 'taken');
      });
    }, HANDLE_CHECK_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmedHandle, handleFormatOk]);

  const handleRequirements = [
    {
      key: 'length',
      label: t('basicInfo.handleReqLength'),
      met: trimmedHandle.length >= 4 && trimmedHandle.length <= 30,
    },
    {
      key: 'charset',
      label: t('basicInfo.handleReqCharset'),
      met: trimmedHandle.length > 0 && /^[a-zA-Z0-9_]+$/.test(trimmedHandle),
    },
    // 중복 검사 줄은 실제로 검사했을 때만 붙인다(idle·unknown이면 줄 자체를 감춘다).
    ...(handleAvail === 'idle' || handleAvail === 'unknown'
      ? []
      : [
          {
            key: 'available',
            label:
              handleAvail === 'checking'
                ? t('basicInfo.handleReqChecking')
                : handleAvail === 'taken'
                  ? t('basicInfo.handleReqTaken')
                  : t('basicInfo.handleReqAvailable'),
            met: handleAvail === 'available',
            pending: handleAvail === 'checking',
            failed: handleAvail === 'taken',
          },
        ]),
  ];

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showPermissionDeniedAlert(t('permission.gallery'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0].uri);
    }
  };

  // 현재 위치로 거주국 자동 입력.
  //
  // 거주국 변경 단일 통로. 나라가 실제로 달라졌을 때만 이미 고른 거주 지역(시·도)을 비운다 —
  // KR의 '경기'는 JP에 없는 지역이라, 안 비우면 나라와 지역이 어긋난 채 저장되고 소셜 탭
  // '일상' 링이 엉뚱한 지역을 기준으로 잡는다(settingsStore가 거주국을 바꿀 때 하는 리셋과 같은 규칙).
  // 거주국을 바꾸는 경로가 둘(목록에서 선택 · 현재 위치로 자동 입력)이라 한 곳으로 모았다.
  const changeCountry = (c: Country) => {
    // 거주국은 고르는 즉시 스토어에도 쓴다. 이 화면만 로컬 state 에 담아 두고 [다음]에서야
    // 쓰면, 그 사이 거주 지역 시트가 스토어에 지역을 먼저 써서 '나라는 KR인데 지역은 JP' 같은
    // 어긋난 쌍이 만들어진다(온보딩을 중간에 그만두면 그대로 굳고, 다음 진입 때 되살아난다).
    // setHomeCountryCode 는 나라가 실제로 달라졌을 때만 homeRegion 을 비우는 래퍼라,
    // 나라를 바꾸면 이전 지역이 함께 정리된다 — 이 화면이 따로 비울 필요가 없다.
    setHomeCountryCode(codeOf(c));
    setSelectedCountry(c);

    // 연령 확인 체크는 여기서 건드리지 않는다 — ageConfirmed 가 confirmedAge === minAge
    // 파생값이라 기준 나이가 달라지면 저절로 풀린다(위 선언부 주석 참고).
  };

  // 앱을 통틀어 위치 권한을 얻을 수 있는 경로가 사실상 기록 작성 화면뿐이었다. 감지기 4종은
  // 절대 팝업을 띄우지 않고(snapService.detectCurrentCountry의 기본 무팝업 정책 — 로그인 전
  // 스플래시 위에 위치 팝업이 뜨는 App Store 5.1.1 거부 사유를 막는 설계라 유지한다),
  // 기록을 한 번도 안 써본 사용자는 해외에 도착해도 감지기가 전부 조용히 죽어 있었다.
  // 여기가 온보딩에서 위치를 물을 수 있는 유일하게 정당한 지점이다 — "어디 사세요?" 옆에서
  // 사용자가 직접 버튼을 눌렀을 때만 요청하므로 왜 필요한지가 화면에 드러나 있다.
  const handleUseCurrentLocation = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const { countryCode } = await detectCurrentCountry({ allowPrompt: true });
      // 권한 거부·오프라인·역지오코딩 실패는 전부 countryCode=null로 돌아온다(스로우하지 않는다).
      // 버튼을 눌렀는데 아무 일도 안 일어나면 고장으로 보이므로 반드시 알린다.
      //
      // 여기서 emitToast를 쓸 수 없다: ToastHost는 useIsAppEntered()가 false면 큐를 비우는데,
      // 온보딩(BasicInfo)은 루트 스택에 'Main'이 없어 항상 false다 → 토스트가 조용히 버려진다.
      // 이 화면의 다른 안내들(handleInvalid·handleTaken)과 같이 Alert로 알린다.
      if (!countryCode) {
        Alert.alert(t('basicInfo.noticeTitle'), t('basicInfo.locateFailed'));
        return;
      }
      // 지원 목록(COUNTRIES)에 없는 국가는 저장하지 않는다 — 저장되면 거주국 제외·통계·
      // 프로필 매칭이 전부 실패한다(SettingsScreen의 VALID_COUNTRY_CODES 방어와 같은 이유).
      // 실패해도 기존 선택은 그대로 두고 목록에서 직접 고르도록 안내한다.
      const matched = COUNTRIES.find((c) => codeOf(c) === countryCode.toUpperCase());
      if (!matched) {
        Alert.alert(t('basicInfo.noticeTitle'), t('basicInfo.locateUnsupported'));
        return;
      }
      changeCountry(matched);
    } finally {
      setLocating(false);
    }
  };

  // 로그인 화면으로 복귀 — 세션을 정리하지 않고 이동하면 Splash가 남은 세션으로
  // 자동 재로그인하므로, 확인 후 signOut을 기다렸다가 Login으로 리셋한다.
  // (로그아웃은 local-first 원칙대로 로컬 데이터를 지우지 않는다)
  const handleBackToLogin = () => {
    warn(); // 되돌릴 수 없는 동작을 묻는 중
    Alert.alert(t('basicInfo.backToLoginTitle'), t('basicInfo.backToLoginMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('basicInfo.backToLoginConfirm'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await signOut();
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          })();
        },
      },
    ]);
  };

  const handleFinish = async () => {
    if (checkingHandle) return;
    const h = handle.trim();
    if (!HANDLE_RE.test(h)) {
      Alert.alert(t('basicInfo.noticeTitle'), t('basicInfo.handleInvalid'));
      return;
    }
    // 최소 연령 미만 가입 차단(이용약관 제4조 2항·방침 제11조). 서버 조회 전에 먼저 막는다.
    // 기준 나이는 거주국마다 다르므로 체크박스 문구와 같은 minAge 를 쓴다 — 문구는 16인데
    // 차단 안내만 14라고 말하면 어느 쪽이 진짜인지 알 수 없다.
    if (!ageConfirmed) {
      Alert.alert(t('basicInfo.noticeTitle'), t('basicInfo.ageConfirmHint', { age: minAge }));
      return;
    }
    // 중복 검사(서버). null=검사 불가(미설정/오류)면 UNIQUE 제약을 최종 방어로 두고 통과.
    setCheckingHandle(true);
    const avail = await isHandleAvailable(h);
    setCheckingHandle(false);
    if (avail === false) {
      Alert.alert(t('basicInfo.noticeTitle'), t('basicInfo.handleTaken'));
      return;
    }
    setStoreHandle(h);
    setHandleChosen(true); // 사용자가 온보딩에서 아이디를 확정 → 충돌 시 임의 재생성 금지
    setProfilePhoto(photo);
    // 거주국은 changeCountry 가 고르는 즉시 이미 써 두었다. 같은 값이면 래퍼의 리셋 조건
    // (v !== homeCountryCode)이 안 걸리므로 방금 고른 거주 지역이 지워지지 않는다.
    setHomeCountryCode(codeOf(selectedCountry));
    setStoreLanguage(language);
    if (stayOn && stayCountry) startStay(stayCountry.name, stayType);
    // 온보딩 완료 기록 — 다음 실행부터 Main으로 바로 간다. 서버 실패해도 진행을 막지 않는다
    // (로컬 사본이 오프라인 판정을 맡고, 다음 성공한 동기화가 서버를 따라잡는다).
    setOnboardedAt(Date.now());
    // 메이트 추천 동의 — 체크하지 않았어도(false=명시적 거부) 반드시 저장한다. 저장을 건너뛰면
    // 서버 값이 null(유예)로 남아 소셜 탭 배너가 나중에 또 묻는다(원래 동의 화면과 같은 의미).
    // ⚠️ 반드시 markOnboarded 뒤에 이어 붙인다 — set_mate_reco_optin 은 맨 UPDATE라 profiles 행이
    // 아직 없으면 0행을 갱신하고도 성공으로 돌아온다(가입 직후엔 행 생성이 늦을 수 있다).
    // 행을 만드는 쪽은 upsert 를 쓰는 markOnboarded 다. 같은 틱에 병렬로 쏘면 경주가 된다.
    // 체인 전체를 await 하지는 않는다 — 온보딩 진행을 네트워크에 묶지 않기 위해서다.
    // 실패하면 null 유예로 남고 MateRecoConsentBanner 가 회수하므로 알림·토스트도 띄우지 않는다.
    markOnboarded()
      .then(() => saveMateRecoOptin(mateRecoAgreed))
      .catch(() => {});
    navigation.navigate('TravelImport');
  };

  const canContinue = HANDLE_RE.test(handle.trim()) && ageConfirmed && (!stayOn || !!stayCountry);

  return (
    <View style={styles.container}>
      <StarFieldBackground opacity={0.5} />
      <IntroAmbient />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* 로그인 화면으로 돌아가기 */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={handleBackToLogin}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('basicInfo.backToLogin')}
          >
            <BackChevronIcon />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.stepText}>{t('basicInfo.step')}</Text>
            <Text style={styles.title}>{t('basicInfo.title')}</Text>
            <Text style={styles.subtitle}>{t('basicInfo.subtitle')}</Text>
          </View>

          {/* 프로필 사진 — 앱 내(프로필 탭·프로필 편집)와 동일한 아바타 디자인
              (글래스 틴트 오버레이 + 기본 프사 그라데이션 링 + 카메라 배지) */}
          <TouchableOpacity style={styles.avatarWrap} activeOpacity={0.8} onPress={pickImage}>
            <View style={styles.avatarRing}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarDefault}>
                  <PersonIcon size={50} color="#A0A0B0" />
                </View>
              )}
              {/* 새 아키텍처에서 RNSVG가 pointerEvents="none"을 무시하고 터치를 삼키므로 View로 감싼다 */}
              <View style={styles.avatarInner} pointerEvents="none">
                <Svg width={110} height={110} viewBox="0 0 111 111" fill="none">
                  <SvgDefs>
                    <SvgLinearGradient id="basicAvatarInnerGrad" x1="74" y1="48.5" x2="99.5" y2="95.5" gradientUnits="userSpaceOnUse">
                      <SvgStop stopColor="#000000" stopOpacity="0" />
                      <SvgStop offset="1" stopColor="#FFFFFF" />
                    </SvgLinearGradient>
                  </SvgDefs>
                  <SvgCircle cx="55.5" cy="55.5" r="55" fill="#751AAD" fillOpacity="0.1" stroke="url(#basicAvatarInnerGrad)" strokeWidth="0.5" />
                </Svg>
              </View>
              {!photo && (
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  <Svg width={128} height={128} viewBox="0 0 128 128" fill="none">
                    <SvgDefs>
                      <SvgLinearGradient id="basicAvatarRingGrad" x1="64" y1="0" x2="96" y2="64" gradientUnits="userSpaceOnUse">
                        <SvgStop stopColor="#00D8F3" />
                        <SvgStop offset="1" stopColor="#EC34F7" />
                      </SvgLinearGradient>
                    </SvgDefs>
                    <SvgCircle cx="64" cy="64" r="61" stroke="url(#basicAvatarRingGrad)" strokeWidth="6" fill="none" />
                  </Svg>
                </View>
              )}
            </View>
            <View style={styles.avatarEditBadge}>
              <CameraIcon size={14} color="#A1A1B0" />
            </View>
          </TouchableOpacity>

          {/* 아이디 (필수·고유) */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>{t('basicInfo.handle')}</Text>
            <View style={styles.inputWrapper}>
              <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                style={styles.input}
                placeholder={t('basicInfo.handlePlaceholder')}
                placeholderTextColor={Colors.textMuted}
                value={handle}
                onChangeText={(v) => setHandle(v.replace(/[^a-zA-Z0-9_]/g, ''))}
                maxLength={30}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.charCount}>{handle.length}/30</Text>
            </View>
            <RequirementList items={handleRequirements} style={{ marginTop: Spacing[2] }} />
            <Text style={[styles.fieldHint, { marginTop: Spacing[2] }]}>{t('basicInfo.handleHint')}</Text>
          </View>

          {/* 최소 연령 확인 — 생년월일을 받지 않는 대신 자기 확인으로 연령 방어선을 유지한다
              (개인정보처리방침 제11조). App Store 5.1.1(v)로 DOB 수집을 폐지했다.
              나이는 위에서 고른 거주국 기준(minAge)이며, 기준이 달라지면 ageConfirmed
              (= confirmedAge === minAge)가 저절로 false 가 되어 체크가 풀린다. */}
          <View style={styles.inputSection}>
            <TouchableOpacity
              style={styles.ageRow}
              onPress={() => setConfirmedAge(ageConfirmed ? null : minAge)}
              activeOpacity={0.8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: ageConfirmed }}
              hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }}
            >
              <View style={[styles.ageBox, ageConfirmed && styles.ageBoxOn]}>
                {ageConfirmed && (
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                    <SvgPath d="M20 6L9 17l-5-5" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                )}
              </View>
              <Text style={styles.ageLabel}>{t('basicInfo.ageConfirm', { age: minAge })}</Text>
            </TouchableOpacity>
            <Text style={styles.privacyHint}>{t('basicInfo.ageConfirmHint', { age: minAge })}</Text>
          </View>

          {/* 메이트 추천 동의(선택) — 온보딩 단계 축소로 독립 동의 화면을 여기로 흡수했다.
              선택 동의라 canContinue 에는 넣지 않는다: 체크하지 않아도 [다음]이 눌려야 한다.
              스타일은 위 최소 연령 확인 블록의 것을 그대로 재사용한다(같은 생김새 = 같은 스타일). */}
          <View style={styles.inputSection}>
            <TouchableOpacity
              style={styles.ageRow}
              onPress={() => setMateRecoAgreed((v) => !v)}
              activeOpacity={0.8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: mateRecoAgreed }}
              hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }}
            >
              <View style={[styles.ageBox, mateRecoAgreed && styles.ageBoxOn]}>
                {mateRecoAgreed && (
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                    <SvgPath d="M20 6L9 17l-5-5" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                )}
              </View>
              <Text style={styles.ageLabel}>{t('mateConsent.checkbox')}</Text>
            </TouchableOpacity>
            <Text style={styles.privacyHint}>{t('mateConsent.bannerBody')}</Text>
          </View>

          {/* 언어 */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>{t('basicInfo.language')}</Text>
            {/* 목록·표기는 i18n/index.ts 단일 출처. 여기에 손으로 적어 두면 언어를 더할 때
                설정 화면과 어긋난다(정식 빌드에서 부분 번역 언어를 감추는 게이트도 그쪽에 있다).
                ⚠️ 한 줄 n등분(flex:1)은 4개부터 깨진다 — 최장 라벨이 '繁體中文'(CJK 4자 ≈ 60px)인데
                   4등분 내부 폭은 320dp 기기에서 57px, 280dp에서 47px 밖에 안 된다.
                   그래서 languageBtn 을 flexBasis 47% + wrap 으로 흘려 2개씩 줄바꿈시킨다
                   (언어 2개인 정식 빌드에서는 지금처럼 한 줄 2등분 그대로다 — 폭 수식이 같다).
                ⚠️ 언어 6개(스페인어 2변형)가 되면서 최장 라벨이 'Español (Latinoamérica)'로 바뀌었다.
                   15px Inter Medium 실측 173.2px 인데 2등분 내부 폭은 393dp 기기에서 164.5px,
                   360dp 148px, 320dp 128px 라 **어디서도 안 들어간다.** 그래서 라벨에
                   저장소 관례인 andFitText(안드로이드 전용 자동 축소·1줄 고정)를 붙인다.
                   iOS 는 andFitText 가 no-op 이라(utils/fitText.ts: iOS 렌더링 불변 원칙)
                   numberOfLines={1} 의 말줄임이 남는다 — 게이트 밖 언어는 정식 빌드에서 자기 버튼 하나만
                   추가로 보이므로(아래) 최악이 3개 행이다.
                저장된 언어가 게이트 밖(정식 빌드의 ja·zh-Hant·es 등)이어도 자기 버튼은 보여야 활성 표시가
                붙는다 — LanguageSheet 와 같은 규칙으로 목록에 합쳐 그린다. */}
            <View style={styles.languageRow}>
              {(SELECTABLE_LANGUAGES.includes(language) ? SELECTABLE_LANGUAGES : [...SELECTABLE_LANGUAGES, language]).map((value) => {
                const active = language === value;
                return (
                  <TouchableOpacity
                    key={value}
                    style={[styles.languageBtn, active && styles.languageBtnActive]}
                    activeOpacity={0.8}
                    onPress={() => setLanguage(value)}
                  >
                    <Text
                      style={[styles.languageText, active && styles.languageTextActive]}
                      numberOfLines={1}
                      {...andFitText}
                    >
                      {LANGUAGE_LABELS[value]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 거주국가 */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>{t('basicInfo.residence')}</Text>
            {/* 나라와 지역을 한 줄에 같이 보여준다 — 따로 두면 같은 '거주지'를 묻는 칸이 둘로 보인다.
                왼쪽부터 [국기·나라][시·도 칩] … [변경] 순.
                시·도를 나라와 같은 크기의 맨 글자로 두면 '대한민국 경기도'가 한 덩어리로 붙어 읽힌다.
                이 화면이 이미 쓰는 칩(장기체류 유형)과 같은 재질로 감싸 값의 층위를 나눈다 —
                고른 값은 마젠타 톤(언어 선택의 '한국어'와 같은 강조), 미설정은 흐린 기본 칩이다.
                누르는 곳은 셋이다: 나라·'변경'은 국가 모달, 시·도 칩은 거주 지역 시트.
                그래서 바깥은 TouchableOpacity 가 아니라 View 다(겹치면 칩 탭이 국가 모달까지 연다). */}
            <View style={styles.inputWrapper}>
              {/* 국기와 국가명을 한 Text에 넣지 말 것 — 삼성 갤럭시 S21+(Android 15)에서
                  [국기 이모지 + 한글]이 한 텍스트 런에 있으면 특정 국가(🇻🇳 베트남·🇵🇹 포르투갈)의
                  한글 글리프가 통째로 안 그려진다(폭은 확보되는데 글자만 사라짐). 6ae35f9와 같은 분리다.
                  Text는 flex 컨테이너가 아니라 gap이 안 먹으므로 공백 한 칸을 별도 Text로 둔다. */}
              <TouchableOpacity
                style={styles.residenceCountryTap}
                activeOpacity={0.8}
                onPress={() => { setCountrySearch(''); setCountryModalVisible(true); }}
                accessibilityRole="button"
                accessibilityLabel={`${t('basicInfo.residence')} ${selectedCountry.name}`}
              >
                <Text style={styles.countryFlagText}>{selectedCountry.flag}</Text>
                <Text style={styles.residenceValueTxt} numberOfLines={1}>{selectedCountry.name}</Text>
              </TouchableOpacity>
              {/* 거주 지역(시·도) — 소셜 탭 '일상' 링의 기준값. 설정 화면과 같은 공용 시트를 연다.
                  선택 항목이라 canContinue 에는 넣지 않는다: 고르지 않아도 [다음]이 눌려야 한다.
                  거주국과 달리 이 값은 시트가 setHomeRegion 으로 스토어에 즉시 쓴다(기존 시트 동작 그대로).
                  미설정일 때도 칩을 비우지 않는다 — 빈자리면 고를 수 있는 값인 줄 모른다. */}
              <TouchableOpacity
                style={[styles.residenceRegionChip, !!homeRegion && styles.stayTypeChipOn]}
                activeOpacity={0.8}
                onPress={() => setRegionSheetVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={`${t('settings.homeRegion')} ${homeRegion?.name ?? t('settings.homeRegionUnset')}`}
              >
                <Text
                  style={[styles.stayTypeChipTxt, !!homeRegion && styles.stayTypeChipTxtOn]}
                  numberOfLines={1}
                >
                  {homeRegion?.name ?? t('settings.homeRegionUnset')}
                </Text>
              </TouchableOpacity>
              {/* 남는 폭은 빈 공간이 먹어 '변경'을 오른쪽 끝에 고정한다 — 다른 입력 칸과 같은 자리다 */}
              <View style={styles.residenceSpacer} />
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => { setCountrySearch(''); setCountryModalVisible(true); }}
                accessibilityRole="button"
                accessibilityLabel={`${t('basicInfo.residenceSelect')}`}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.charCount}>{t('common.change')}</Text>
              </TouchableOpacity>
            </View>

            {/* 현재 위치로 자동 입력 — 기존 '변경'(국가 모달)은 그대로 두고 보조 수단으로 추가.
                로딩 표시는 버튼 안 인라인 스피너다. 짧은 수명 로딩 오버레이에 Modal을 쓰면
                껍데기가 남아 터치가 먹통이 되는 사고가 이 저장소에서 났다 — 오버레이 자체를
                만들지 않는 편이 그 함정을 아예 비껴간다. */}
            <TouchableOpacity
              style={[styles.locateBtn, locating && { opacity: 0.6 }]}
              activeOpacity={0.8}
              onPress={handleUseCurrentLocation}
              disabled={locating}
              accessibilityRole="button"
              accessibilityState={{ disabled: locating, busy: locating }}
              accessibilityLabel={t('basicInfo.useCurrentLocation')}
            >
              {locating ? (
                <>
                  <ActivityIndicator size="small" color="#EC34F7" />
                  <Text style={styles.locateBtnTxt}>{t('basicInfo.locating')}</Text>
                </>
              ) : (
                // 이모지와 한글을 한 Text에 넣지 않는다 — 삼성 갤럭시(Android 15)에서 한 텍스트 런에
                // [이모지 + 한글]이 섞이면 한글 글리프가 통째로 안 그려진 전례가 있다(6ae35f9).
                // row + gap 8이 원래의 공백 한 칸을 대신한다.
                <>
                  <Text style={styles.locateBtnTxt}>📍</Text>
                  <Text style={styles.locateBtnTxt}>{t('basicInfo.useCurrentLocation')}</Text>
                </>
              )}
            </TouchableOpacity>
            <Text style={styles.privacyHint}>{t('basicInfo.useCurrentLocationHint')}</Text>
          </View>

          {/* 장기체류 */}
          <View style={styles.inputSection}>
            <View style={styles.stayToggleRow}>
              <Text style={styles.inputLabel}>{t('basicInfo.stayToggle')}</Text>
              <Switch value={stayOn} onValueChange={(v) => { select(); setStayOn(v); }}
                trackColor={{ false: '#3A3A46', true: '#EC34F7' }} thumbColor="#FFFFFF" />
            </View>
            {stayOn && (
              <>
                <TouchableOpacity style={styles.inputWrapper} activeOpacity={0.8}
                  onPress={() => { setCountrySearch(''); setStayCountryModalVisible(true); }}>
                  {/* 위 거주국가와 같은 이유로 국기·국가명을 분리한다(6ae35f9).
                      미선택 플레이스홀더는 이모지가 없어 한 Text 그대로 둔다. */}
                  {stayCountry ? (
                    <View style={styles.countryValueRow}>
                      <Text style={styles.countryFlagText}>{stayCountry.flag}</Text>
                      <Text style={[styles.input, { paddingVertical: 16 }]}>{stayCountry.name}</Text>
                    </View>
                  ) : (
                    <Text style={[styles.input, { paddingVertical: 16 }]}>
                      {t('basicInfo.stayCountryPlaceholder')}
                    </Text>
                  )}
                  <Text style={styles.charCount}>{t('common.change')}</Text>
                </TouchableOpacity>
                <View style={styles.stayTypeRow}>
                  {STAY_TYPES.map((ty) => (
                    <TouchableOpacity key={ty.value} onPress={() => setStayType(ty.value)}
                      style={[styles.stayTypeChip, stayType === ty.value && styles.stayTypeChipOn]} activeOpacity={0.8}>
                      <Text style={[styles.stayTypeChipTxt, stayType === ty.value && styles.stayTypeChipTxtOn]}>{t(ty.key)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </View>

        </ScrollView>

        {/* Bottom CTA — 온보딩·로그인과 동일한 유리 필 버튼 */}
        <View style={styles.bottomCTA}>
          <GlassButton
            label={t('common.next')}
            onPress={handleFinish}
            disabled={!canContinue}
            loading={checkingHandle}
            style={styles.doneBtn}
          />
        </View>
      </KeyboardAvoidingView>

      {/* 거주 국가 선택 — 설정 화면과 같은 공용 모달(components/CountryPickerModal).
          이 화면에 있던 마크업을 그대로 옮긴 것이라 동작·모양은 이전과 같다. */}
      <CountryPickerModal
        visible={countryModalVisible}
        onClose={() => setCountryModalVisible(false)}
        onSelect={(c) => { changeCountry(c); setCountryModalVisible(false); }}
        title={t('basicInfo.residenceSelect')}
        searchPlaceholder={t('basicInfo.residenceSearchPlaceholder')}
        selectedCode={codeOf(selectedCountry)}
      />

      {/* 거주 지역(시·도) 시트 — 설정 화면과 같은 공용 시트.
          countryCode 는 이 화면이 고른 나라를 명시적으로 넘긴다(스토어를 읽게 두면 나라를
          바꾼 직후 한 틱 동안 옛 나라의 시·도가 뜰 수 있다).
          ⚠️ 위치 권한은 시트 안의 '현재 위치로 설정'을 눌렀을 때만 요청된다 — 시트를 여는
          것만으로 요청하게 만들지 말 것(App Store 5.1.1 방어).
          ⚠️ 열 때만 마운트한다 — 닫혀 있어도 본문이 돌아, 나라를 고를 때마다 그 나라 지오
          모듈(캐나다 334KB·미국 242KB)을 렌더 중에 동기 require 해 프레임이 끊긴다. */}
      {regionSheetVisible && (
        <HomeRegionSheet
          visible={regionSheetVisible}
          onClose={() => setRegionSheetVisible(false)}
          countryCode={codeOf(selectedCountry)}
        />
      )}

      <Modal visible={stayCountryModalVisible} animationType="slide" onRequestClose={() => setStayCountryModalVisible(false)}>
        {/* 위 거주국 모달과 동일 — autoFocus 검색창 때문에 KAV가 필요하고, Modal은 루트
            클램프 밖이라 콘텐츠를 Stage 폭으로 다시 가둔다. */}
        {/* 안드로이드는 상태바 높이가 기기별로 달라 인셋 기반으로 상단 여백 보정 (iOS 60은 노치 기준) */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.modalRoot, Platform.OS === 'android' && { paddingTop: insets.top + 12 }]}
          accessibilityViewIsModal
        >
        <View style={styles.modalClamp}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('basicInfo.stayCountryLabel')}</Text>
            <TouchableOpacity onPress={() => setStayCountryModalVisible(false)}>
              <Text style={styles.modalClose}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
          <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
            style={styles.modalSearch}
            placeholder={t('basicInfo.residenceSearchPlaceholder')}
            placeholderTextColor={Colors.textMuted}
            value={countrySearch}
            onChangeText={setCountrySearch}
            autoFocus
          />
          <FlatList
            data={(countrySearch.trim()
              ? COUNTRIES.filter((c) => c.name.includes(countrySearch) || c.term.toLowerCase().includes(countrySearch.toLowerCase()))
              : COUNTRIES).filter((c) => codeOf(c) !== codeOf(selectedCountry))}
            keyExtractor={(c) => c.term}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.modalItem}
                onPress={() => { setStayCountry(item); setStayCountryModalVisible(false); setCountrySearch(''); }}
              >
                {/* 국기·국가명 분리 — 위 거주국가 행과 같은 이유(6ae35f9) */}
                <View style={styles.countryValueRow}>
                  <Text style={styles.modalItemText}>{item.flag}</Text>
                  <Text style={styles.modalItemText}>{item.name}</Text>
                </View>
                {stayCountry && codeOf(item) === codeOf(stayCountry) && <Text style={styles.modalItemCheck}>✓</Text>}
              </TouchableOpacity>
            )}
          />
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0F' }, // 온보딩·로그인과 동일 배경
  keyboardView: { flex: 1 },
  scroll: {
    paddingHorizontal: Spacing[6],
    paddingBottom: 120,
  },
  header: {
    marginBottom: Spacing[8],
  },
  // 뒤로가기 — 카드 박스 없이 chevron만(사용자 지시). 38 치수는 터치 영역으로 유지
  backBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[4],
  },
  // 온보딩 step 라벨과 동일한 톤 — 마젠타 액센트
  stepText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#EC34F7',
    letterSpacing: 2,
    marginBottom: Spacing[2],
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: Spacing[2],
  },
  subtitle: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.regular,
    color: '#9E9CA1',
    lineHeight: 22,
  },

  // Avatar — 앱 내(프로필 편집)와 동일 치수 (링 128 / 아바타 120 / 글래스 오버레이 110)
  avatarWrap: {
    alignSelf: 'center',
    marginBottom: Spacing[8],
    position: 'relative',
  },
  avatarRing: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarDefault: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#1F1F22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarInner: {
    position: 'absolute',
    top: 9,
    left: 9,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2E2E3B',
    borderWidth: 2,
    borderColor: '#0A0B0F',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Input — 로그인 화면과 동일한 유리 입력
  inputSection: { marginBottom: Spacing[6] },
  inputLabel: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.semiBold,
    color: '#9E9CA1',
    marginBottom: Spacing[2],
    letterSpacing: 0.3,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: Spacing[4],
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    paddingVertical: 16,
  },
  charCount: {
    color: Colors.textMuted,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
  },
  fieldHint: {
    // 오류가 아니라 설명문이다. 빨강(#FF3B30)은 이 앱에서 오류·삭제 전용이라
    // 평상시부터 빨강을 쓰면 진짜 오류(아이디 중복 등)와 구분되지 않는다.
    color: Colors.textMuted,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
  },
  // 국기·국가명을 별도 Text로 나눠 그리므로 가로 배치 + gap으로 원래의 공백 한 칸을 대신한다
  // (6ae35f9의 countryBadge와 같은 구조·같은 gap — 삼성 텍스트 셰이핑 결함 회피).
  // flex: 1은 긴 국가명이 오른쪽 '변경' 라벨을 밀어내지 않게 한다.
  // 거주지 한 줄 — 나라(왼쪽)와 지역(오른쪽)이 같은 칸 안에 나란히 선다.
  residenceCountryTap: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  // styles.input 을 그대로 쓰면 안 된다 — flex:1 이라 나라 이름이 남는 폭을 전부 먹고
  // 시·도가 오른쪽 끝으로 밀려나 '경··' 처럼 잘린다. 두 값은 내용만큼만 차지해야 나란히 선다.
  residenceValueTxt: {
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    paddingVertical: 16,
    flexShrink: 1,
  },
  // 장기체류 유형 칩과 같은 재질(같은 화면 안에서 칩 모양이 두 벌 생기지 않게 stayTypeChip 을 편다)
  residenceRegionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginLeft: 10,
    flexShrink: 1,
  },
  residenceSpacer: { flex: 1, minWidth: 8 },
  // 미설정은 값이 아니라 안내다 — 고른 지역과 같은 강조색으로 두면 이미 고른 줄로 읽힌다
  residenceRegionUnset: { color: Colors.textMuted },
  countryValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  // ⚠️ 국기 쪽에는 flex를 주지 말 것. 이 화면의 styles.input에는 flex: 1이 들어 있어서,
  //    국기와 이름 두 Text에 그것을 그대로 붙이면 형제가 폭을 50:50으로 나눠
  //    국기와 이름 사이가 화면 절반만큼 벌어지고 긴 국가명이 잘린다(11차 QA 발견 34).
  //    국기는 고유 폭, 이름이 남은 폭을 갖는 것이 분리 전과 같은 배치다.
  countryFlagText: {
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    paddingVertical: 16,
  },
  // 현재 위치로 자동 입력 — 거주국 입력칸 아래 보조 버튼(주 경로는 위의 '변경' 모달)
  locateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: Spacing[2],
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(236,52,247,0.4)',
    backgroundColor: 'rgba(236,52,247,0.08)',
  },
  locateBtnTxt: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.semiBold,
    color: '#EC34F7',
  },
  privacyHint: {
    color: Colors.textMuted,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    marginTop: Spacing[2],
  },

  // 최소 연령 확인 체크박스
  ageRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ageBox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#A1A1B0',
    alignItems: 'center', justifyContent: 'center',
  },
  ageBoxOn: { backgroundColor: '#BF85FC', borderColor: '#BF85FC' },
  ageLabel: { flex: 1, fontSize: 14, color: '#FFFFFF' },

  // 언어 선택
  languageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap', // 언어 4개부터 두 줄로 흐른다(위 주석의 폭 계산)
    gap: Spacing[3], // RN의 gap은 행·열 간격 모두에 걸려 줄바꿈 간격도 같이 잡힌다
  },
  languageBtn: {
    // flex:1 이 아니라 basis 47% — 47%×3 > 100% 이라 한 줄에 최대 2개만 들어가고,
    // grow:1 이 남는 폭을 채워 두 개가 정확히 반반이 된다.
    flexGrow: 1,
    flexBasis: '47%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  languageBtnActive: {
    borderColor: 'rgba(236,52,247,0.6)',
    backgroundColor: 'rgba(236,52,247,0.08)',
  },
  languageText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  languageTextActive: {
    color: '#EC34F7',
    fontFamily: Typography.fontFamily.semiBold,
  },

  // Tags style removed

  // Stay
  stayToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stayTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  stayTypeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.04)' },
  stayTypeChipOn: { borderColor: 'rgba(236,52,247,0.7)', backgroundColor: 'rgba(236,52,247,0.14)' },
  stayTypeChipTxt: { color: '#A1A1B0', fontSize: 13, fontWeight: '600' },
  stayTypeChipTxtOn: { color: '#FFFFFF' },

  // Bottom
  bottomCTA: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing[6],
    paddingBottom: 48,
    paddingTop: Spacing[4],
    backgroundColor: 'rgba(10,11,15,0.95)',
  },
  doneBtn: { width: '100%' },

  // Modal — 유리 검색창 + 온보딩 배경
  modalRoot: { flex: 1, backgroundColor: '#0A0B0F', paddingTop: 60 },
  // 국가 선택 모달 콘텐츠 폭 클램프. 배경이 없는 순수 폭 제한 래퍼라 딤 배경이 아니다.
  modalClamp: { flex: 1, width: '100%', maxWidth: STAGE_MAX_W, alignSelf: 'center' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing[6], paddingBottom: Spacing[4] },
  modalTitle: { fontSize: Typography.fontSize.lg, fontFamily: Typography.fontFamily.bold, color: Colors.textPrimary },
  modalClose: { fontSize: Typography.fontSize.base, color: '#EC34F7', fontFamily: Typography.fontFamily.medium },
  modalSearch: { marginHorizontal: Spacing[6], marginBottom: Spacing[3], backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', color: Colors.textPrimary, paddingHorizontal: Spacing[4], paddingVertical: 12, fontSize: Typography.fontSize.base },
  modalItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing[6], paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  modalItemText: { fontSize: Typography.fontSize.base, color: Colors.textPrimary, fontFamily: Typography.fontFamily.regular },
  modalItemCheck: { fontSize: Typography.fontSize.base, color: '#EC34F7', fontWeight: 'bold' },
});
