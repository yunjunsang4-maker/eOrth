import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,  Alert,
  Switch,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../store/settingsStore';
import { requestAccountDeletion, DELETION_GRACE_DAYS } from '../store/pendingDeletion';
import { signOut, signInWithEmail, updatePassword, requestEmailChange, getAuthEmail } from '../services/auth';
import { isSupabaseConfigured } from '../services/supabase';
import type { RootStackScreenProps } from '../navigation/types';
import { EmailIcon, LockClosedIcon, GlobeIcon, TrashIcon, GoogleIcon, AppleIcon, CalendarIcon, PersonIcon } from '../components/icons';
import { useSkinAccent } from '../constants/skinTheme';
import type { Gender } from '../store/settingsStore';

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
  red:          '#FF3B30',
  redBg:        'rgba(255,59,48,0.1)',
  redBorder:    'rgba(255,59,48,0.2)',
  green:        '#34C759',
};

type Props = RootStackScreenProps<'AccountSettings'>;

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
// 이메일 형식 간이 검증 (변경 요청 전 오입력 차단)
const EMAIL_INPUT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

// 탈퇴 사유: value는 비교용 안정 키, 라벨은 i18n에서 가져온다(번역해도 비교가 깨지지 않게)
const DELETE_REASONS = [
  { value: 'hard', labelKey: 'accountSettings.reasonHard' },
  { value: 'fewRecords', labelKey: 'accountSettings.reasonFewRecords' },
  { value: 'privacy', labelKey: 'accountSettings.reasonPrivacy' },
  { value: 'other', labelKey: 'accountSettings.reasonOther' },
] as const;

// ─── 섹션 타이틀 ───
const SectionTitle = ({ label }: { label: string }) => (
  <Text style={styles.sectionLabel}>{label}</Text>
);

// ─── 카드 아이템 ───
const CardRow = ({
  icon,
  label,
  value,
  onPress,
  danger,
  rightElement,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  rightElement?: React.ReactNode;
}) => (
  <TouchableOpacity
    style={styles.cardRow}
    onPress={onPress}
    activeOpacity={onPress ? 0.7 : 1}
    disabled={!onPress}
  >
    <View style={styles.cardLeft}>
      <View style={styles.cardIcon}>{icon}</View>
      <View>
        <Text style={[styles.cardLabel, danger && { color: COLORS.red }]}>{label}</Text>
        {value ? <Text style={styles.cardValue}>{value}</Text> : null}
      </View>
    </View>
    {rightElement ?? (onPress ? <Text style={styles.chevron}>›</Text> : null)}
  </TouchableOpacity>
);

export default function AccountSettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent(); // 토글 트랙 색 — 설정 전역 토글 디자인 통일(스킨색 트랙 + 흰 썸)
  const { signUpMethod, signUpEmail, setSignUpEmail, birthday, setBirthday, gender, setGender } = useSettings();
  const genderLabel = (g: Gender) =>
    g === 'male' ? t('basicInfo.genderMale') : g === 'female' ? t('basicInfo.genderFemale') : t('accountSettings.genderUnset');
  // 실제 identity 연동 API 미연동 — 연동 상태는 가입 수단에서 파생(가짜 토글 상태 금지, H2)
  const googleLinked = signUpMethod === 'google';

  // 화면의 이메일 표시를 auth 실제 값과 동기화 (이메일 변경 인증 완료 후 재진입 시 최신화)
  useEffect(() => {
    if (signUpMethod !== 'email') return; // 수정4: 소셜 가입자는 이메일 덮어쓰기 불필요
    if (!isSupabaseConfigured) return;
    getAuthEmail()
      .then((e) => {
        if (e && e !== signUpEmail) setSignUpEmail(e);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 생일 편집 모달 상태
  const [isBirthdayModalVisible, setIsBirthdayModalVisible] = useState(false);
  const [birthdayDraft, setBirthdayDraft] = useState(birthday);
  // 성별 편집 모달 상태
  const [isGenderModalVisible, setIsGenderModalVisible] = useState(false);
  const [genderDraft, setGenderDraft] = useState<Gender>(gender);

  const openBirthdayModal = () => {
    setBirthdayDraft(birthday);
    setIsBirthdayModalVisible(true);
  };
  const submitBirthday = () => {
    if (!isValidBirthday(birthdayDraft)) {
      Alert.alert(t('accountSettings.errorTitle'), t('accountSettings.birthdayInvalid'));
      return;
    }
    setBirthday(birthdayDraft);
    setIsBirthdayModalVisible(false);
  };

  const openGenderModal = () => {
    setGenderDraft(gender);
    setIsGenderModalVisible(true);
  };
  const submitGender = () => {
    if (genderDraft === '') {
      Alert.alert(t('accountSettings.errorTitle'), t('accountSettings.genderSelectError'));
      return;
    }
    setGender(genderDraft);
    setIsGenderModalVisible(false);
  };
  const appleLinked = signUpMethod === 'apple';

  // 이메일 변경 모달 상태 (iOS·Android 공용) + 본인 확인용 현재 비밀번호(재인증)
  const [isEmailModalVisible, setIsEmailModalVisible] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailCurrentPassword, setEmailCurrentPassword] = useState('');
  // 이메일 변경 제출 중 중복 방지
  const [emailSubmitting, setEmailSubmitting] = useState(false);

  // 비밀번호 변경 모달 상태
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false); // 서버 처리 중 중복 제출 방지

  // 계정 삭제 모달 상태
  const [isDeleteAccountModalVisible, setIsDeleteAccountModalVisible] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2 | 3>(1);
  const [deleteConsent, setDeleteConsent] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteReasonDetail, setDeleteReasonDetail] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteSocialConfirm, setDeleteSocialConfirm] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false); // 서버 신청 중 중복 제출 방지

  // 실제 이메일 변경: 본인 확인(현재 비밀번호 재인증) 후 auth에 변경을 요청하면
  // 새 주소로 인증 메일이 가고, 링크 확인 후 변경이 완료된다.
  // (즉시 로컬 표시만 바꾸면 로그인 이메일과 어긋난다 — 인증 완료 후 위 useEffect가 표시를 동기화)
  const submitEmailChange = async () => {
    if (emailSubmitting) return; // 중복 제출 방지
    const newEmail = emailDraft.trim().toLowerCase();
    const trimmedPassword = emailCurrentPassword.trim();

    if (!EMAIL_INPUT_RE.test(newEmail)) {
      Alert.alert(t('accountSettings.errorTitle'), t('accountSettings.emailInvalidMsg'));
      return;
    }
    if (!trimmedPassword) {
      Alert.alert(t('accountSettings.errorTitle'), t('accountSettings.currentPasswordEmpty'));
      return;
    }

    if (!isSupabaseConfigured) {
      // 서버 미설정(로컬 모드): 실제 계정이 없으므로 로컬 표시만 변경
      setSignUpEmail(newEmail);
      Alert.alert(t('accountSettings.emailChangedTitle'), t('accountSettings.emailChangedMsg', { email: newEmail }), [
        { text: t('common.confirm'), onPress: () => closeEmailModal() },
      ]);
      return;
    }

    setEmailSubmitting(true);
    try {
      // 본인 확인 — Supabase updateUser는 기존 비밀번호를 확인하지 않으므로
      // 현재 이메일+현재 비밀번호로 재로그인해 본인 확인을 대신한다(같은 계정이라 세션 영향 없음).
      const email = (await getAuthEmail()) ?? signUpEmail;
      if (!email) {
        Alert.alert(t('accountSettings.errorTitle'), t('login.genericError'));
        return;
      }
      const verify = await signInWithEmail(email.toLowerCase(), trimmedPassword);
      if (!verify.ok) {
        Alert.alert(t('accountSettings.errorTitle'), t('accountSettings.currentPasswordWrongMsg'));
        return;
      }
      const result = await requestEmailChange(newEmail);
      if (!result.ok) {
        Alert.alert(t('accountSettings.errorTitle'), result.error ?? t('login.genericError'));
        return;
      }
      Alert.alert(
        t('accountSettings.emailChangeSentTitle'),
        t('accountSettings.emailChangeSentMsg', { email: newEmail }),
        [{ text: t('common.confirm'), onPress: () => closeEmailModal() }]
      );
    } finally {
      setEmailSubmitting(false);
    }
  };

  const handleEmailChange = () => {
    if (signUpMethod !== 'email') {
      Alert.alert(t('accountSettings.noticeTitle'), t('accountSettings.socialEmailNoChange'));
      return;
    }
    // iOS·Android 공용 모달로 통일 (기존 iOS 전용 Alert.prompt 대체)
    setEmailDraft('');
    setEmailCurrentPassword('');
    setIsEmailModalVisible(true);
  };

  const closeEmailModal = () => {
    setIsEmailModalVisible(false);
    setEmailDraft('');
    setEmailCurrentPassword('');
  };

  const handlePasswordChange = () => {
    if (signUpMethod !== 'email') {
      Alert.alert(t('accountSettings.noticeTitle'), t('accountSettings.socialNoPasswordChange'));
      return;
    }
    setIsPasswordModalVisible(true);
  };

  const submitPasswordChange = async () => {
    if (passwordSubmitting) return;
    const trimmedCurrent = currentPassword.trim();
    const trimmedNew = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (!trimmedCurrent) {
      Alert.alert(t('accountSettings.errorTitle'), t('accountSettings.currentPasswordEmpty'));
      return;
    }
    if (trimmedNew.length < 6) {
      Alert.alert(t('accountSettings.errorTitle'), t('accountSettings.newPasswordTooShort'));
      return;
    }
    if (trimmedNew !== trimmedConfirm) {
      Alert.alert(t('accountSettings.errorTitle'), t('accountSettings.passwordMismatchMsg'));
      return;
    }

    if (!isSupabaseConfigured) {
      // 서버 미설정(로컬 모드): 실제 계정이 없으므로 기존 동작 유지
      Alert.alert(t('accountSettings.successTitle'), t('accountSettings.passwordChangedMsg'), [
        { text: t('common.confirm'), onPress: () => closePasswordModal() },
      ]);
      return;
    }

    setPasswordSubmitting(true);
    try {
      // 현재 비밀번호 검증 — Supabase updateUser는 기존 비밀번호를 확인하지 않으므로
      // 현재 이메일+현재 비밀번호로 재로그인해 본인 확인을 대신한다(같은 계정이라 세션 영향 없음).
      const email = (await getAuthEmail()) ?? signUpEmail;
      if (!email) {
        Alert.alert(t('accountSettings.errorTitle'), t('login.genericError'));
        return;
      }
      const verify = await signInWithEmail(email.toLowerCase(), trimmedCurrent);
      if (!verify.ok) {
        Alert.alert(t('accountSettings.errorTitle'), t('accountSettings.currentPasswordWrongMsg'));
        return;
      }
      const result = await updatePassword(trimmedNew);
      if (!result.ok) {
        Alert.alert(t('accountSettings.errorTitle'), result.error ?? t('login.genericError'));
        return;
      }
      Alert.alert(t('accountSettings.successTitle'), t('accountSettings.passwordChangedMsg'), [
        { text: t('common.confirm'), onPress: () => closePasswordModal() },
      ]);
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const closePasswordModal = () => {
    setIsPasswordModalVisible(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleDeleteAccount = () => {
    setIsDeleteAccountModalVisible(true);
    setDeleteStep(1);
  };

  const submitDeleteAccount = async () => {
    if (deleteSubmitting) return;
    // 보안 검증
    if (signUpMethod === 'email') {
      if (!deletePassword.trim()) {
        Alert.alert(t('accountSettings.errorTitle'), t('accountSettings.deletePasswordEmpty'));
        return;
      }
    } else {
      if (deleteSocialConfirm.trim() !== t('accountSettings.deleteConfirmPhrase')) {
        Alert.alert(t('accountSettings.errorTitle'), t('accountSettings.deletePhraseError'));
        return;
      }
    }

    // 탈퇴 사유 문자열 조립 (수정2)
    const reasonStr = deleteReason
      ? deleteReason === 'other' && deleteReasonDetail.trim()
        ? `${deleteReason}: ${deleteReasonDetail.trim()}`
        : deleteReason
      : undefined;

    // 즉시 파기하지 않고 서버 유예 플래그만 기록 (30일 내 재로그인 시 복구).
    // 서버 기록에 실패하면 신청을 중단한다 — 로컬만 기록되면 영구 삭제가 이행되지 않는다.
    setDeleteSubmitting(true);
    try {
      // 수정1: email 가입자 — 비밀번호 재인증으로 본인 확인
      if (signUpMethod === 'email') {
        const email = (await getAuthEmail()) ?? signUpEmail;
        if (!email) {
          Alert.alert(t('accountSettings.errorTitle'), t('login.genericError'));
          return;
        }
        const verify = await signInWithEmail(email.toLowerCase(), deletePassword.trim());
        if (!verify.ok) {
          Alert.alert(t('accountSettings.errorTitle'), t('accountSettings.currentPasswordWrongMsg'));
          return;
        }
      }
      // 수정2: 탈퇴 사유와 함께 서버 신청
      await requestAccountDeletion(reasonStr);
    } catch {
      Alert.alert(t('accountSettings.errorTitle'), t('accountSettings.deleteRequestFailMsg'));
      return;
    } finally {
      setDeleteSubmitting(false);
    }

    Alert.alert(
      t('accountSettings.deleteRequestedTitle'),
      t('accountSettings.deleteRequestedMsg', { days: DELETION_GRACE_DAYS }),
      [
        {
          text: t('common.confirm'),
          onPress: () => {
            void (async () => {
              closeDeleteAccountModal();
              // 세션 종료를 기다린 뒤 이동 — 먼저 이동하면 Splash가 남은 세션으로 자동 재로그인한다
              await signOut();
              navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
            })();
          },
        },
      ]
    );
  };

  const closeDeleteAccountModal = () => {
    setIsDeleteAccountModalVisible(false);
    setDeleteStep(1);
    setDeleteConsent(false);
    setDeleteReason('');
    setDeleteReasonDetail('');
    setDeletePassword('');
    setDeleteSocialConfirm('');
  };

  // 소셜 계정 연동/해제 — 실제 identity linking API(콘솔 설정 포함)가 아직 연동되지 않았다.
  // 로컬 상태만 바꾸고 성공한 척하던 목업을 제거하고, 준비 중임을 정직하게 안내한다.
  const toggleSocial = (provider: string) => {
    const isSignupProvider = (provider === 'Google' && signUpMethod === 'google') ||
                             (provider === 'Apple' && signUpMethod === 'apple');
    if (isSignupProvider) {
      Alert.alert(t('accountSettings.noticeTitle'), t('accountSettings.socialUnlinkSignupError', { provider }));
      return;
    }
    Alert.alert(t('accountSettings.noticeTitle'), t('accountSettings.socialLinkComingSoon'));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* 상단 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('accountSettings.back')}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('accountSettings.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 이메일 ── */}
        <SectionTitle label={t('accountSettings.sectionEmail')} />
        <View style={styles.card}>
          <CardRow
            icon={<EmailIcon size={20} />}
            label={signUpMethod === 'email' ? t('accountSettings.emailAddress') : (signUpMethod === 'google' ? t('accountSettings.googleAccount') : t('accountSettings.appleAccount'))}
            value={signUpEmail}
            onPress={signUpMethod === 'email' && !emailSubmitting ? handleEmailChange : undefined}
            rightElement={emailSubmitting ? <ActivityIndicator size="small" color={COLORS.purpleNeon} /> : undefined}
          />
        </View>

        {/* ── 기본 정보 ── */}
        <SectionTitle label={t('accountSettings.sectionBasic')} />
        <View style={styles.card}>
          <CardRow
            icon={<CalendarIcon size={20} />}
            label={t('accountSettings.birthday')}
            value={birthday ? birthday : t('accountSettings.birthdayUnset')}
            onPress={openBirthdayModal}
          />
          <View style={styles.rowDivider} />
          <CardRow
            icon={<PersonIcon size={20} />}
            label={t('accountSettings.gender')}
            value={genderLabel(gender)}
            onPress={openGenderModal}
          />
        </View>

        {/* ── 비밀번호 ── */}
        <SectionTitle label={t('accountSettings.sectionPassword')} />
        <View style={styles.card}>
          <CardRow
            icon={<LockClosedIcon size={20} color={signUpMethod !== 'email' ? COLORS.textMuted : undefined} />}
            label={t('accountSettings.passwordChange')}
            value={signUpMethod === 'email' ? t('accountSettings.passwordLastChanged') : t('accountSettings.socialNoPassword')}
            onPress={handlePasswordChange}
          />
        </View>

        {/* ── 연결된 소셜 계정 ── */}
        <SectionTitle label={t('accountSettings.sectionSocial')} />
        <View style={styles.card}>
          {/* 구글 */}
          <CardRow
            icon={<GoogleIcon size={18} />}
            label="Google"
            value={googleLinked ? t('accountSettings.linked') : t('accountSettings.notLinked')}
            rightElement={
              <Switch
                value={googleLinked}
                onValueChange={() => toggleSocial('Google')}
                trackColor={{ false: COLORS.divider, true: skinAccent.accent }}
                thumbColor={COLORS.white}
              />
            }
          />
          <View style={styles.rowDivider} />
          {/* 애플 */}
          <CardRow
            icon={<AppleIcon size={18} color="#FFFFFF" />}
            label="Apple"
            value={appleLinked ? t('accountSettings.linked') : t('accountSettings.notLinked')}
            rightElement={
              <Switch
                value={appleLinked}
                onValueChange={() => toggleSocial('Apple')}
                trackColor={{ false: COLORS.divider, true: skinAccent.accent }}
                thumbColor={COLORS.white}
              />
            }
          />
        </View>

        {/* ── 위험 구역 ── */}
        <SectionTitle label={t('accountSettings.sectionDanger')} />
        <View style={styles.card}>
          <CardRow
            icon={<TrashIcon size={20} />}
            label={t('accountSettings.deleteAccount')}
            danger
            onPress={handleDeleteAccount}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── 생일 편집 모달 ── */}
      <Modal
        visible={isBirthdayModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsBirthdayModalVisible(false)}
      >
        <View style={styles.modalOverlay} accessibilityViewIsModal>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('accountSettings.birthdayModalTitle')}</Text>
            <Text style={styles.modalDesc}>{t('accountSettings.birthdayModalDesc')}</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('accountSettings.birthday')}</Text>
              <TextInput
                style={[
                  styles.modalInput,
                  birthdayDraft.length > 0 && !isValidBirthday(birthdayDraft) && styles.modalInputError,
                ]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="number-pad"
                maxLength={10}
                value={birthdayDraft}
                onChangeText={(t) => setBirthdayDraft(formatBirthday(t))}
              />
              {birthdayDraft.length > 0 && !isValidBirthday(birthdayDraft) && (
                <Text style={styles.inputErrorText}>{t('accountSettings.formatHint')}</Text>
              )}
            </View>

            <View style={styles.modalBtnGroup}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                activeOpacity={0.7}
                onPress={() => setIsBirthdayModalVisible(false)}
              >
                <Text style={styles.modalBtnTextCancel}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnSubmit, !isValidBirthday(birthdayDraft) && styles.modalBtnDisabled]}
                activeOpacity={0.7}
                disabled={!isValidBirthday(birthdayDraft)}
                onPress={submitBirthday}
              >
                <Text style={styles.modalBtnTextSubmit}>{t('accountSettings.changeBtn')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 성별 편집 모달 ── */}
      <Modal
        visible={isGenderModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsGenderModalVisible(false)}
      >
        <View style={styles.modalOverlay} accessibilityViewIsModal>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('accountSettings.genderModalTitle')}</Text>
            <Text style={styles.modalDesc}>{t('accountSettings.genderModalDesc')}</Text>

            <View style={styles.genderRow}>
              {([
                { value: 'male', label: t('basicInfo.genderMale') },
                { value: 'female', label: t('basicInfo.genderFemale') },
              ] as { value: Gender; label: string }[]).map((opt) => {
                const active = genderDraft === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.genderBtn, active && styles.genderBtnActive]}
                    activeOpacity={0.8}
                    onPress={() => setGenderDraft(opt.value)}
                  >
                    <Text style={[styles.genderText, active && styles.genderTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalBtnGroup}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                activeOpacity={0.7}
                onPress={() => setIsGenderModalVisible(false)}
              >
                <Text style={styles.modalBtnTextCancel}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnSubmit, genderDraft === '' && styles.modalBtnDisabled]}
                activeOpacity={0.7}
                disabled={genderDraft === ''}
                onPress={submitGender}
              >
                <Text style={styles.modalBtnTextSubmit}>{t('accountSettings.changeBtn')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 이메일 변경 모달 (iOS·Android 공용) ── */}
      <Modal
        visible={isEmailModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={closeEmailModal}
      >
        <View style={styles.modalOverlay} accessibilityViewIsModal>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('accountSettings.emailChangeTitle')}</Text>
            <Text style={styles.modalDesc}>{t('accountSettings.emailModalDesc')}</Text>

            {/* 새 이메일 주소 */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('accountSettings.newEmailLabel')}</Text>
              <TextInput
                style={[
                  styles.modalInput,
                  emailDraft.length > 0 && !EMAIL_INPUT_RE.test(emailDraft.trim()) && styles.modalInputError,
                ]}
                placeholder={t('accountSettings.newEmailPlaceholder')}
                placeholderTextColor={COLORS.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={emailDraft}
                onChangeText={setEmailDraft}
              />
              {emailDraft.length > 0 && !EMAIL_INPUT_RE.test(emailDraft.trim()) && (
                <Text style={styles.inputErrorText}>{t('accountSettings.emailInvalidMsg')}</Text>
              )}
            </View>

            {/* 본인 확인: 현재 비밀번호 (재인증) */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('accountSettings.currentPasswordLabel')}</Text>
              <TextInput
                style={styles.modalInput}
                placeholder={t('accountSettings.currentPasswordPlaceholder')}
                placeholderTextColor={COLORS.textMuted}
                secureTextEntry
                value={emailCurrentPassword}
                onChangeText={setEmailCurrentPassword}
              />
            </View>

            {/* 버튼 그룹 */}
            <View style={styles.modalBtnGroup}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                activeOpacity={0.7}
                onPress={closeEmailModal}
              >
                <Text style={styles.modalBtnTextCancel}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalBtnSubmit,
                  (emailSubmitting || !EMAIL_INPUT_RE.test(emailDraft.trim()) || !emailCurrentPassword) && styles.modalBtnDisabled,
                ]}
                activeOpacity={0.7}
                disabled={emailSubmitting || !EMAIL_INPUT_RE.test(emailDraft.trim()) || !emailCurrentPassword}
                onPress={submitEmailChange}
              >
                {emailSubmitting ? (
                  <ActivityIndicator size="small" color={COLORS.bg} />
                ) : (
                  <Text style={styles.modalBtnTextSubmit}>{t('accountSettings.changeBtn')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 비밀번호 변경 모달 ── */}
      <Modal
        visible={isPasswordModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={closePasswordModal}
      >
        <View style={styles.modalOverlay} accessibilityViewIsModal>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('accountSettings.passwordModalTitle')}</Text>
            <Text style={styles.modalDesc}>
              {t('accountSettings.passwordModalDesc')}
            </Text>

            {/* 현재 비밀번호 */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('accountSettings.currentPasswordLabel')}</Text>
              <TextInput
                style={styles.modalInput}
                placeholder={t('accountSettings.currentPasswordPlaceholder')}
                placeholderTextColor={COLORS.textMuted}
                secureTextEntry
                value={currentPassword}
                onChangeText={setCurrentPassword}
              />
            </View>

            {/* 새 비밀번호 */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('accountSettings.newPasswordLabel')}</Text>
              <TextInput
                style={styles.modalInput}
                placeholder={t('accountSettings.newPasswordPlaceholder')}
                placeholderTextColor={COLORS.textMuted}
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
              />
            </View>

            {/* 새 비밀번호 확인 */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('accountSettings.confirmPasswordLabel')}</Text>
              <TextInput
                style={[
                  styles.modalInput,
                  confirmPassword.length > 0 && newPassword !== confirmPassword && styles.modalInputError
                ]}
                 placeholder={t('accountSettings.confirmPasswordPlaceholder')}
                placeholderTextColor={COLORS.textMuted}
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                <Text style={styles.inputErrorText}>{t('accountSettings.passwordMismatchHint')}</Text>
              )}
            </View>

            {/* 버튼 그룹 */}
            <View style={styles.modalBtnGroup}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                activeOpacity={0.7}
                onPress={closePasswordModal}
              >
                <Text style={styles.modalBtnTextCancel}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalBtnSubmit,
                  (passwordSubmitting || !currentPassword || newPassword.length < 6 || newPassword !== confirmPassword) && styles.modalBtnDisabled
                ]}
                activeOpacity={0.7}
                disabled={passwordSubmitting || !currentPassword || newPassword.length < 6 || newPassword !== confirmPassword}
                onPress={submitPasswordChange}
              >
                <Text style={styles.modalBtnTextSubmit}>{t('accountSettings.changeBtn')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 계정 삭제 모달 (디테일 3단계) ── */}
      <Modal
        visible={isDeleteAccountModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={closeDeleteAccountModal}
      >
        <View style={styles.modalOverlay} accessibilityViewIsModal>
          <View style={[styles.modalContent, { borderColor: COLORS.redBorder }]}>
            <Text style={[styles.modalTitle, { color: COLORS.red }]}>{t('accountSettings.deleteModalTitle')}</Text>

            {/* Step 1: 안내 및 동의 */}
            {deleteStep === 1 && (
              <View>
                <Text style={styles.modalDesc}>{t('accountSettings.deleteStep1Desc')}</Text>
                <View style={styles.warningBox}>
                  <Text style={styles.warningText}>{t('accountSettings.deleteWarning1')}</Text>
                  <Text style={styles.warningText}>{t('accountSettings.deleteWarning2')}</Text>
                  <Text style={styles.warningText}>{t('accountSettings.deleteWarning3')}</Text>
                  <Text style={styles.warningText}>{t('accountSettings.deleteWarning4')}</Text>
                </View>

                <TouchableOpacity
                  style={styles.checkboxRow}
                  activeOpacity={0.7}
                  onPress={() => setDeleteConsent(!deleteConsent)}
                >
                  <View style={[styles.checkbox, deleteConsent && styles.checkboxActive]}>
                    {deleteConsent && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>{t('accountSettings.deleteConsent')}</Text>
                </TouchableOpacity>

                <View style={styles.modalBtnGroup}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                    onPress={closeDeleteAccountModal}
                  >
                    <Text style={styles.modalBtnTextCancel}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnSubmit, { backgroundColor: COLORS.red }, !deleteConsent && styles.modalBtnDisabled]}
                    disabled={!deleteConsent}
                    onPress={() => setDeleteStep(2)}
                  >
                    <Text style={[styles.modalBtnTextSubmit, { color: COLORS.white }]}>{t('accountSettings.next')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Step 2: 탈퇴 사유 수집 */}
            {deleteStep === 2 && (
              <View>
                <Text style={styles.modalDesc}>{t('accountSettings.deleteStep2Desc')}</Text>

                <View style={styles.radioGroup}>
                  {DELETE_REASONS.map((reason) => (
                    <TouchableOpacity
                      key={reason.value}
                      style={styles.radioOption}
                      activeOpacity={0.7}
                      onPress={() => setDeleteReason(reason.value)}
                    >
                      <View style={[styles.radioCircle, deleteReason === reason.value && styles.radioCircleActive]}>
                        {deleteReason === reason.value && <View style={styles.radioDot} />}
                      </View>
                      <Text style={styles.radioLabel}>{t(reason.labelKey)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {deleteReason === 'other' && (
                  <TextInput
                    style={[styles.modalInput, { marginTop: 10 }]}
                    placeholder={t('accountSettings.reasonOtherPlaceholder')}
                    placeholderTextColor={COLORS.textMuted}
                    value={deleteReasonDetail}
                    onChangeText={setDeleteReasonDetail}
                  />
                )}

                <View style={styles.modalBtnGroup}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                    onPress={() => setDeleteStep(1)}
                  >
                    <Text style={styles.modalBtnTextCancel}>{t('accountSettings.prev')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnSubmit, { backgroundColor: COLORS.red }, !deleteReason && styles.modalBtnDisabled]}
                    disabled={!deleteReason}
                    onPress={() => setDeleteStep(3)}
                  >
                    <Text style={[styles.modalBtnTextSubmit, { color: COLORS.white }]}>{t('accountSettings.next')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Step 3: 보안 비밀번호 확인 */}
            {deleteStep === 3 && (
              <View>
                <Text style={styles.modalDesc}>{t('accountSettings.deleteStep3Desc1')}</Text>
                <Text style={styles.modalDesc}>{t('accountSettings.deleteStep3Desc2', { days: DELETION_GRACE_DAYS })}</Text>

                {signUpMethod === 'email' ? (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>{t('accountSettings.deletePasswordLabel')}</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder={t('accountSettings.deletePasswordPlaceholder')}
                      placeholderTextColor={COLORS.textMuted}
                      secureTextEntry
                      value={deletePassword}
                      onChangeText={setDeletePassword}
                    />
                  </View>
                ) : (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>{t('accountSettings.deleteSocialLabel')}</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder={t('accountSettings.deleteConfirmPhrase')}
                      placeholderTextColor={COLORS.textMuted}
                      value={deleteSocialConfirm}
                      onChangeText={setDeleteSocialConfirm}
                    />
                  </View>
                )}

                <View style={styles.modalBtnGroup}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                    onPress={() => setDeleteStep(2)}
                  >
                    <Text style={styles.modalBtnTextCancel}>{t('accountSettings.prev')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalBtn,
                      styles.modalBtnSubmit,
                      { backgroundColor: COLORS.red },
                      (deleteSubmitting || (signUpMethod === 'email' && !deletePassword) || (signUpMethod !== 'email' && deleteSocialConfirm !== t('accountSettings.deleteConfirmPhrase'))) && styles.modalBtnDisabled
                    ]}
                    disabled={deleteSubmitting || (signUpMethod === 'email' && !deletePassword) || (signUpMethod !== 'email' && deleteSocialConfirm !== t('accountSettings.deleteConfirmPhrase'))}
                    onPress={submitDeleteAccount}
                  >
                    <Text style={[styles.modalBtnTextSubmit, { color: COLORS.white }]}>{t('accountSettings.permanentDelete')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: COLORS.card,
    borderRadius: 20,
  },
  backIcon: {
    fontSize: 20,
    color: COLORS.white,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.white,
  },

  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 32,
  },

  // 섹션 라벨
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textDim,
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
    marginTop: 20,
  },

  // 카드
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  cardIcon: {
    width: 26,
    height: 26,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: 2,
  },
  cardLabel: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '500',
  },
  cardValue: {
    fontSize: 11,
    color: COLORS.textDim,
    marginTop: 2,
  },
  chevron: {
    fontSize: 20,
    color: COLORS.textMuted,
  },
  rowDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginLeft: 54,
  },
  
  // 비밀번호 변경 모달 스타일
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 10, 15, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 6,
  },
  modalDesc: {
    fontSize: 12,
    color: COLORS.textDim,
    lineHeight: 18,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textDim,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.divider,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: COLORS.white,
    fontSize: 14,
  },
  modalInputError: {
    borderColor: COLORS.red,
  },
  inputErrorText: {
    fontSize: 11,
    color: COLORS.red,
    marginTop: 4,
    marginLeft: 2,
  },
  modalBtnGroup: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalBtn: {
    flex: 1,
    height: 46,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnCancel: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  modalBtnSubmit: {
    backgroundColor: COLORS.purpleNeon,
  },
  modalBtnDisabled: {
    backgroundColor: COLORS.textMuted,
    opacity: 0.5,
  },
  modalBtnTextCancel: {
    color: COLORS.textDim,
    fontSize: 14,
    fontWeight: '600',
  },
  modalBtnTextSubmit: {
    color: COLORS.bg,
    fontSize: 14,
    fontWeight: '600',
  },
  
  // 계정 삭제 디테일 스타일
  warningBox: {
    backgroundColor: COLORS.redBg,
    borderColor: COLORS.redBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 6,
  },
  warningText: {
    fontSize: 11,
    color: COLORS.red,
    lineHeight: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
    paddingHorizontal: 2,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: COLORS.textDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    borderColor: COLORS.red,
    backgroundColor: COLORS.red,
  },
  checkmark: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 11,
    color: COLORS.textDim,
    flex: 1,
    lineHeight: 16,
  },
  
  // 라디오 그룹
  radioGroup: {
    gap: 12,
    marginBottom: 16,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: COLORS.textDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: COLORS.red,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.red,
  },
  radioLabel: {
    fontSize: 13,
    color: COLORS.white,
  },

  // 성별 선택 버튼
  genderRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  genderBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  genderBtnActive: {
    borderColor: COLORS.purpleNeon,
    backgroundColor: COLORS.purpleBg,
  },
  genderText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.textDim,
  },
  genderTextActive: {
    color: COLORS.purpleNeon,
    fontWeight: '700',
  },
});
