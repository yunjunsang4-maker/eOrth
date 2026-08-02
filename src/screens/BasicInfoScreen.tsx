import React, { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  TextInput,
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
import Svg, {
  Defs as SvgDefs,
  LinearGradient as SvgLinearGradient,
  Stop as SvgStop,
  Rect as SvgRect,
  Circle as SvgCircle,
} from 'react-native-svg';
import StarFieldBackground from '../components/StarFieldBackground';
import { IntroAmbient } from './introVisuals';
import { useRecords } from '../store/recordStore';
import type { StayType } from '../utils/stayMachine';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { useSettings, type Gender, type AppLanguage } from '../store/settingsStore';
import { isHandleAvailable } from '../services/profile';
import { signOut } from '../services/auth';
import { showPermissionDeniedAlert } from '../utils/permissionAlert';
import { formatBirthday, isValidBirthday, isOldEnough } from '../utils/birthday';
import type { RootStackScreenProps } from '../navigation/types';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { PersonIcon, CameraIcon } from '../components/icons';
import { COUNTRIES, type Country } from '../constants/countries';

const codeOf = (c: Country) => c.term.split(' ')[0].toUpperCase();

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

// 생일 입력 유틸(형식 정렬·유효성·만 14세 확인)은 utils/birthday 에서 가져온다.

const DEFAULT_COUNTRY: Country =
  COUNTRIES.find((c) => codeOf(c) === 'KR') ?? COUNTRIES[0];

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
    birthday: storeBirthday,
    setBirthday: setStoreBirthday,
    gender: storeGender,
    setGender: setStoreGender,
    language: storeLanguage,
    setLanguage: setStoreLanguage,
    handle: storeHandle,
    setHandle: setStoreHandle,
    setHandleChosen,
  } = useSettings();
  const { startStay } = useRecords();
  const [photo, setPhoto] = useState<string | null>(profilePhoto || null);
  // 아이디(handle): 기본값은 자동 생성된 아이디로 채워두고 사용자가 수정 가능
  const [handle, setHandle] = useState(storeHandle || '');
  const [checkingHandle, setCheckingHandle] = useState(false);
  const [birthday, setBirthday] = useState(storeBirthday || '');
  const [gender, setGender] = useState<Gender>(storeGender || '');
  const [language, setLanguage] = useState<AppLanguage>(storeLanguage || 'ko');
  const [selectedCountry, setSelectedCountry] = useState<Country>(
    COUNTRIES.find((c) => codeOf(c) === homeCountryCode) ?? DEFAULT_COUNTRY
  );
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [stayOn, setStayOn] = useState(false);
  const [stayCountry, setStayCountry] = useState<Country | null>(null);
  const [stayType, setStayType] = useState<StayType>('exchange');
  const [stayCountryModalVisible, setStayCountryModalVisible] = useState(false);

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

  // 로그인 화면으로 복귀 — 세션을 정리하지 않고 이동하면 Splash가 남은 세션으로
  // 자동 재로그인하므로, 확인 후 signOut을 기다렸다가 Login으로 리셋한다.
  // (로그아웃은 local-first 원칙대로 로컬 데이터를 지우지 않는다)
  const handleBackToLogin = () => {
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
    // 만 14세 미만 가입 차단(이용약관 제4조 2항) — 서버 조회 전에 먼저 막는다.
    if (!isOldEnough(birthday)) {
      Alert.alert(t('basicInfo.noticeTitle'), t('basicInfo.birthdayUnderage'));
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
    setHomeCountryCode(codeOf(selectedCountry));
    setStoreBirthday(birthday);
    setStoreGender(gender);
    setStoreLanguage(language);
    if (stayOn && stayCountry) startStay(stayCountry.name, stayType);
    navigation.navigate('TravelImport');
  };

  const canContinue = HANDLE_RE.test(handle.trim()) && isOldEnough(birthday) && gender !== '' && (!stayOn || !!stayCountry);

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
            <Text style={styles.backTxt}>‹</Text>
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
              <TextInput
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
            <Text style={[styles.birthdayHint, { marginTop: Spacing[2] }]}>{t('basicInfo.handleHint')}</Text>
          </View>

          {/* 생일 */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>{t('basicInfo.birthday')}</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.textMuted}
                value={birthday}
                onChangeText={(t) => setBirthday(formatBirthday(t))}
                keyboardType="number-pad"
                maxLength={10}
              />
              {birthday.length > 0 && !isValidBirthday(birthday) && (
                <Text style={styles.birthdayHint}>{t('basicInfo.birthdayHint')}</Text>
              )}
              {isValidBirthday(birthday) && !isOldEnough(birthday) && (
                <Text style={styles.birthdayHint}>{t('basicInfo.birthdayUnderage')}</Text>
              )}
            </View>
          </View>

          {/* 성별 */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>{t('basicInfo.gender')}</Text>
            <View style={styles.genderRow}>
              {([
                { value: 'male', label: t('basicInfo.genderMale') },
                { value: 'female', label: t('basicInfo.genderFemale') },
              ] as { value: Gender; label: string }[]).map((opt) => {
                const active = gender === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.genderBtn, active && styles.genderBtnActive]}
                    activeOpacity={0.8}
                    onPress={() => setGender(opt.value)}
                  >
                    <Text style={[styles.genderText, active && styles.genderTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 언어 */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>{t('basicInfo.language')}</Text>
            <View style={styles.genderRow}>
              {([
                { value: 'ko', label: '한국어' },
                { value: 'en', label: 'English' },
              ] as { value: AppLanguage; label: string }[]).map((opt) => {
                const active = language === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.genderBtn, active && styles.genderBtnActive]}
                    activeOpacity={0.8}
                    onPress={() => setLanguage(opt.value)}
                  >
                    <Text style={[styles.genderText, active && styles.genderTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 거주국가 */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>{t('basicInfo.residence')}</Text>
            <TouchableOpacity
              style={styles.inputWrapper}
              activeOpacity={0.8}
              onPress={() => { setCountrySearch(''); setCountryModalVisible(true); }}
            >
              <Text style={[styles.input, { paddingVertical: 16 }]}>
                {selectedCountry.flag} {selectedCountry.name}
              </Text>
              <Text style={styles.charCount}>{t('common.change')}</Text>
            </TouchableOpacity>
          </View>

          {/* 장기체류 */}
          <View style={styles.inputSection}>
            <View style={styles.stayToggleRow}>
              <Text style={styles.inputLabel}>{t('basicInfo.stayToggle')}</Text>
              <Switch value={stayOn} onValueChange={setStayOn}
                trackColor={{ false: '#3A3A46', true: '#EC34F7' }} thumbColor="#FFFFFF" />
            </View>
            {stayOn && (
              <>
                <TouchableOpacity style={styles.inputWrapper} activeOpacity={0.8}
                  onPress={() => { setCountrySearch(''); setStayCountryModalVisible(true); }}>
                  <Text style={[styles.input, { paddingVertical: 16 }]}>
                    {stayCountry ? `${stayCountry.flag} ${stayCountry.name}` : t('basicInfo.stayCountryPlaceholder')}
                  </Text>
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

      <Modal visible={countryModalVisible} animationType="slide" onRequestClose={() => setCountryModalVisible(false)}>
        <View style={styles.modalRoot} accessibilityViewIsModal>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('basicInfo.residenceSelect')}</Text>
            <TouchableOpacity onPress={() => setCountryModalVisible(false)}>
              <Text style={styles.modalClose}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.modalSearch}
            placeholder={t('basicInfo.residenceSearchPlaceholder')}
            placeholderTextColor={Colors.textMuted}
            value={countrySearch}
            onChangeText={setCountrySearch}
            autoFocus
          />
          <FlatList
            data={countrySearch.trim()
              ? COUNTRIES.filter((c) => c.name.includes(countrySearch) || c.term.toLowerCase().includes(countrySearch.toLowerCase()))
              : COUNTRIES}
            keyExtractor={(c) => c.term}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.modalItem}
                onPress={() => { setSelectedCountry(item); setCountryModalVisible(false); setCountrySearch(''); }}
              >
                <Text style={styles.modalItemText}>{item.flag} {item.name}</Text>
                {codeOf(item) === codeOf(selectedCountry) && <Text style={styles.modalItemCheck}>✓</Text>}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      <Modal visible={stayCountryModalVisible} animationType="slide" onRequestClose={() => setStayCountryModalVisible(false)}>
        <View style={styles.modalRoot} accessibilityViewIsModal>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('basicInfo.stayCountryLabel')}</Text>
            <TouchableOpacity onPress={() => setStayCountryModalVisible(false)}>
              <Text style={styles.modalClose}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
          <TextInput
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
                <Text style={styles.modalItemText}>{item.flag} {item.name}</Text>
                {stayCountry && codeOf(item) === codeOf(stayCountry) && <Text style={styles.modalItemCheck}>✓</Text>}
              </TouchableOpacity>
            )}
          />
        </View>
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
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[4],
  },
  backTxt: {
    color: Colors.textPrimary,
    fontSize: 22,
    lineHeight: 24,
    marginTop: -2,
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
  birthdayHint: {
    color: '#FF3B30',
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
  },
  privacyHint: {
    color: Colors.textMuted,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    marginTop: Spacing[2],
  },

  // Gender
  genderRow: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  genderBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  genderBtnActive: {
    borderColor: 'rgba(236,52,247,0.6)',
    backgroundColor: 'rgba(236,52,247,0.08)',
  },
  genderText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  genderTextActive: {
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
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing[6], paddingBottom: Spacing[4] },
  modalTitle: { fontSize: Typography.fontSize.lg, fontFamily: Typography.fontFamily.bold, color: Colors.textPrimary },
  modalClose: { fontSize: Typography.fontSize.base, color: '#EC34F7', fontFamily: Typography.fontFamily.medium },
  modalSearch: { marginHorizontal: Spacing[6], marginBottom: Spacing[3], backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', color: Colors.textPrimary, paddingHorizontal: Spacing[4], paddingVertical: 12, fontSize: Typography.fontSize.base },
  modalItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing[6], paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  modalItemText: { fontSize: Typography.fontSize.base, color: Colors.textPrimary, fontFamily: Typography.fontFamily.regular },
  modalItemCheck: { fontSize: Typography.fontSize.base, color: '#EC34F7', fontWeight: 'bold' },
});
