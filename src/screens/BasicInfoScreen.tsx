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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { useSettings, type Gender, type AppLanguage } from '../store/settingsStore';
import { isHandleAvailable } from '../services/profile';
import { showPermissionDeniedAlert } from '../utils/permissionAlert';
import type { RootStackScreenProps } from '../navigation/types';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { PrimaryButton } from '../components/ui';
import { PersonIcon, PencilIcon } from '../components/icons';
import { COUNTRIES, type Country } from '../constants/countries';

const codeOf = (c: Country) => c.term.split(' ')[0].toUpperCase();

// 아이디(handle) 형식: 영문/숫자/_ 3~30자
const HANDLE_RE = /^[a-zA-Z0-9_]{3,30}$/;

// 입력 숫자를 YYYY-MM-DD 형태로 자동 정렬 (최대 8자리)
const formatBirthday = (raw: string) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  let out = y;
  if (digits.length > 4) out += '-' + m;
  if (digits.length > 6) out += '-' + d;
  return out;
};

// YYYY-MM-DD 유효성 검사 (실제 존재하는 날짜 + 합리적 연도 범위)
const isValidBirthday = (v: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const now = new Date().getFullYear();
  if (year < 1900 || year > now) return false;
  if (month < 1 || month > 12) return false;
  const maxDay = new Date(year, month, 0).getDate();
  return day >= 1 && day <= maxDay;
};
const DEFAULT_COUNTRY: Country =
  COUNTRIES.find((c) => codeOf(c) === 'KR') ?? COUNTRIES[0];

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
    accountPublic: storeAccountPublic,
    setAccountPublic: setStoreAccountPublic,
    handle: storeHandle,
    setHandle: setStoreHandle,
    setHandleChosen,
  } = useSettings();
  const [photo, setPhoto] = useState<string | null>(profilePhoto || null);
  // 아이디(handle): 기본값은 자동 생성된 아이디로 채워두고 사용자가 수정 가능
  const [handle, setHandle] = useState(storeHandle || '');
  const [checkingHandle, setCheckingHandle] = useState(false);
  const [birthday, setBirthday] = useState(storeBirthday || '');
  const [gender, setGender] = useState<Gender>(storeGender || '');
  const [language, setLanguage] = useState<AppLanguage>(storeLanguage || 'ko');
  const [accountPublic, setAccountPublic] = useState<boolean>(storeAccountPublic);
  const [selectedCountry, setSelectedCountry] = useState<Country>(
    COUNTRIES.find((c) => codeOf(c) === homeCountryCode) ?? DEFAULT_COUNTRY
  );
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

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

  const handleFinish = async () => {
    if (checkingHandle) return;
    const h = handle.trim();
    if (!HANDLE_RE.test(h)) {
      Alert.alert(t('basicInfo.noticeTitle'), t('basicInfo.handleInvalid'));
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
    setStoreAccountPublic(accountPublic);
    navigation.navigate('TravelImport');
  };

  const canContinue = HANDLE_RE.test(handle.trim()) && isValidBirthday(birthday) && gender !== '';

  return (
    <LinearGradient colors={['#0A0118', '#100620']} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.stepText}>{t('basicInfo.step')}</Text>
            <Text style={styles.title}>{t('basicInfo.title')}</Text>
            <Text style={styles.subtitle}>{t('basicInfo.subtitle')}</Text>
          </View>

          {/* Avatar Placeholder */}
          <TouchableOpacity style={styles.avatarWrap} activeOpacity={0.8} onPress={pickImage}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.avatarImage} />
            ) : (
              <LinearGradient
                colors={['#3B1E8E', '#7B61FF']}
                style={styles.avatar}
              >
                <PersonIcon size={28} color="#FFFFFF" />
              </LinearGradient>
            )}
            <View style={styles.avatarEditBadge}>
              <PencilIcon size={12} color="#A1A1B0" />
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
            <Text style={styles.birthdayHint}>{t('basicInfo.handleHint')}</Text>
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

          {/* 계정 공개 범위 */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>{t('basicInfo.accountVisibility')}</Text>
            <View style={styles.genderRow}>
              {([
                { value: true, label: t('basicInfo.visibilityPublic') },
                { value: false, label: t('basicInfo.visibilityPrivate') },
              ] as { value: boolean; label: string }[]).map((opt) => {
                const active = accountPublic === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.label}
                    style={[styles.genderBtn, active && styles.genderBtnActive]}
                    activeOpacity={0.8}
                    onPress={() => setAccountPublic(opt.value)}
                  >
                    <Text style={[styles.genderText, active && styles.genderTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.privacyHint}>
              {accountPublic
                ? t('basicInfo.visibilityPublicHint')
                : t('basicInfo.visibilityPrivateHint')}
            </Text>
          </View>

        </ScrollView>

        {/* Bottom CTA */}
        <View style={styles.bottomCTA}>
          <PrimaryButton
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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  scroll: {
    paddingHorizontal: Spacing[6],
    paddingBottom: 120,
  },
  header: {
    marginBottom: Spacing[8],
  },
  stepText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.primary,
    letterSpacing: 2,
    marginBottom: Spacing[2],
  },
  title: {
    fontSize: Typography.fontSize['3xl'],
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing[2],
  },
  subtitle: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    lineHeight: 22,
  },

  // Avatar
  avatarWrap: {
    alignSelf: 'center',
    marginBottom: Spacing[8],
    position: 'relative',
  },
  avatarImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarIcon: { fontSize: 36 },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.bgCard,
    borderWidth: 2,
    borderColor: Colors.bgDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Input
  inputSection: { marginBottom: Spacing[6] },
  inputLabel: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textSecondary,
    marginBottom: Spacing[2],
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
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
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  genderBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(191,133,252,0.12)',
  },
  genderText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  genderTextActive: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.semiBold,
  },

  // Tags style removed

  // Bottom
  bottomCTA: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing[6],
    paddingBottom: 48,
    paddingTop: Spacing[4],
    backgroundColor: 'rgba(10,1,24,0.95)',
  },
  doneBtn: { width: '100%' },

  // Modal
  modalRoot: { flex: 1, backgroundColor: '#0A0118', paddingTop: 60 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing[6], paddingBottom: Spacing[4] },
  modalTitle: { fontSize: Typography.fontSize.lg, fontFamily: Typography.fontFamily.bold, color: Colors.textPrimary },
  modalClose: { fontSize: Typography.fontSize.base, color: Colors.primary, fontFamily: Typography.fontFamily.medium },
  modalSearch: { marginHorizontal: Spacing[6], marginBottom: Spacing[3], backgroundColor: Colors.bgCard, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary, paddingHorizontal: Spacing[4], paddingVertical: 12, fontSize: Typography.fontSize.base },
  modalItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing[6], paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalItemText: { fontSize: Typography.fontSize.base, color: Colors.textPrimary, fontFamily: Typography.fontFamily.regular },
  modalItemCheck: { fontSize: Typography.fontSize.base, color: Colors.primary, fontWeight: 'bold' },
});
