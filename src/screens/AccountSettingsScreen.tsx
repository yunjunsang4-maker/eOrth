import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Text, TextInput } from '../ui/Text';
import { useTranslation } from 'react-i18next';
import { useProfileSettings, useSettingsActions } from '../store/settingsStore';
import { requestAccountDeletion, DELETION_GRACE_DAYS } from '../store/pendingDeletion';
import { signOut, signInWithEmail, updatePassword, requestEmailChange, getAuthEmail } from '../services/auth';
import { isSupabaseConfigured } from '../services/supabase';
import type { RootStackScreenProps } from '../navigation/types';
import { EmailIcon, LockClosedIcon, TrashIcon, GoogleIcon, AppleIcon } from '../components/icons';
import RequirementList from '../components/RequirementList';
import {
  SETTINGS_COLORS,
  SettingsHeader,
  SettingGroup,
  SettingsDivider,
  SettingsField,
  SettingsModal,
  SettingsOptionRow,
  SettingsPillButton,
  settingsText,
  type SettingItem,
} from '../components/settings/SettingsUI';

const COLORS = {
  ...SETTINGS_COLORS,
  textMuted:    '#8B8B9E', // 소셜 가입자의 잠긴 비밀번호 아이콘(예전 값 유지)
  redBg:        'rgba(255,59,48,0.1)',
  redBorder:    'rgba(255,59,48,0.2)',
};

// 팝업 카드와 입력칸·알약이 같은 채움(#111116)이라 링 투명 구간에서 윤곽이 사라진다 — 옅은 흰 테두리를 아래에 깐다
const RIM = SETTINGS_COLORS.line;

type Props = RootStackScreenProps<'AccountSettings'>;

// 이메일 형식 간이 검증 (변경 요청 전 오입력 차단)
const EMAIL_INPUT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 탈퇴 사유: value는 비교용 안정 키, 라벨은 i18n에서 가져온다(번역해도 비교가 깨지지 않게)
const DELETE_REASONS = [
  { value: 'hard', labelKey: 'accountSettings.reasonHard' },
  { value: 'fewRecords', labelKey: 'accountSettings.reasonFewRecords' },
  { value: 'privacy', labelKey: 'accountSettings.reasonPrivacy' },
  { value: 'other', labelKey: 'accountSettings.reasonOther' },
] as const;

export default function AccountSettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { signUpMethod, signUpEmail } = useProfileSettings();
  const { setSignUpEmail } = useSettingsActions();
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
  // 확인 칸의 빨간 테두리를 blur 후에만 띄우기 위한 포커스 추적 (회원가입 화면과 동일한 규칙)
  const [confirmPwFocused, setConfirmPwFocused] = useState(false);
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

  // 본인 확인(현재 비밀번호 재인증) 공용 — 성공하면 null, 실패하면 보여줄 안내 문구를 반환한다.
  // Supabase updateUser는 기존 비밀번호를 확인하지 않으므로 현재 이메일+비밀번호로 재로그인해
  // 본인 확인을 대신한다(같은 계정이라 세션 영향 없음).
  const verifyCurrentPassword = async (password: string): Promise<string | null> => {
    // 계정 이메일은 서버가 원본이다. 조회에 실패했는데(오프라인·세션 만료) 로컬 signUpEmail로
    // 폴백하면 기본값('user@eorth.app')으로 로그인 시도가 가서, 네트워크 문제가 전부
    // '비밀번호가 틀렸다'로 표시된다 → 검증을 아예 시도하지 않고 네트워크 안내로 구분한다.
    const email = await getAuthEmail();
    if (!email) return t('login.networkError');
    const verify = await signInWithEmail(email.toLowerCase(), password);
    if (verify.ok) return null;
    // 자격 증명 오류만 '현재 비밀번호가 다름'으로, 네트워크·타임아웃 등은 원인 안내를 그대로 보여준다.
    return !verify.error || verify.error === t('authErr.invalidCred')
      ? t('accountSettings.currentPasswordWrongMsg')
      : verify.error;
  };

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
      const verifyError = await verifyCurrentPassword(trimmedPassword);
      if (verifyError) {
        Alert.alert(t('accountSettings.errorTitle'), verifyError);
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
      const verifyError = await verifyCurrentPassword(trimmedCurrent);
      if (verifyError) {
        Alert.alert(t('accountSettings.errorTitle'), verifyError);
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
    setConfirmPwFocused(false);
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
        const verifyError = await verifyCurrentPassword(deletePassword.trim());
        if (verifyError) {
          Alert.alert(t('accountSettings.errorTitle'), verifyError);
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

  // ── 설정 행 목록 — SettingGroup(설정 화면과 같은 행 60·카드·전폭 구분선) ──
  // 이메일 행: 이메일 가입자만 눌리고 제출 중엔 잠긴다(예전 onPress 조건 그대로). 소셜 가입자는 눌림·꺾쇠 없음.
  const emailPressable = signUpMethod === 'email' && !emailSubmitting;
  const emailItems: SettingItem[] = [
    {
      icon: <EmailIcon size={20} />,
      label: signUpMethod === 'email' ? t('accountSettings.emailAddress') : (signUpMethod === 'google' ? t('accountSettings.googleAccount') : t('accountSettings.appleAccount')),
      description: signUpEmail,
      onPress: emailPressable ? handleEmailChange : undefined,
      chevron: emailPressable,
    },
  ];
  const passwordItems: SettingItem[] = [
    {
      icon: <LockClosedIcon size={20} color={signUpMethod !== 'email' ? COLORS.textMuted : undefined} />,
      label: t('accountSettings.passwordChange'),
      description: signUpMethod === 'email' ? t('accountSettings.passwordLastChanged') : t('accountSettings.socialNoPassword'),
      onPress: handlePasswordChange,
    },
  ];
  const socialItems: SettingItem[] = [
    ...(googleLinked ? [{ icon: <GoogleIcon size={18} />, label: 'Google', value: t('accountSettings.linked'), chevron: false }] : []),
    ...(appleLinked ? [{ icon: <AppleIcon size={18} color="#FFFFFF" />, label: 'Apple', value: t('accountSettings.linked'), chevron: false }] : []),
    ...(!googleLinked && !appleLinked
      // '이메일로 가입했어요'는 길어 오른쪽 값 자리(폭 50%·한 줄)에선 좁은 화면에서 말줄임된다 → 라벨 아래 설명 줄(예전 표시 위치)
      ? [{ icon: <EmailIcon size={18} color="#FFFFFF" />, label: t('accountSettings.socialNoneLabel'), description: t('accountSettings.socialNoneValue'), chevron: false }]
      : []),
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <SettingsHeader title={t('accountSettings.title')} onBack={() => navigation.goBack()} backA11yLabel={t('accountSettings.back')} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── 이메일 ── 주소는 길어 오른쪽 값 자리(말줄임) 대신 라벨 아래 설명 줄에 둔다(예전처럼 전체 표시) */}
        <SettingGroup label={t('accountSettings.sectionEmail')} labelStyle={styles.firstGroupLabel} items={emailItems} baseRim={RIM} />

        {/* ── 비밀번호 ── */}
        <SettingGroup label={t('accountSettings.sectionPassword')} items={passwordItems} baseRim={RIM} />

        {/* ── 연결된 소셜 계정 (읽기 전용) ──
            ⚠️ 예전엔 켜고 끄는 스위치였지만 identity linking API 가 아직 없어 누르면
            "준비 중" 안내만 떴다. 동작하지 않는 컨트롤은 App Store 2.1(완성도) 지적
            대상이라, 실제로 연동된 가입 수단만 보여주는 정보 행으로 바꾼다.
            연동/해제 기능이 붙으면 그때 스위치를 되살릴 것.
            눌러도 아무 일 없는 행이라 꺾쇠를 숨긴다(chevron: false). */}
        <SettingGroup label={t('accountSettings.sectionSocial')} items={socialItems} baseRim={RIM} />

        {/* ── 위험 구역 ── 계정 삭제는 위험 동작 → 로그아웃과 같은 danger 알약 */}
        <Text style={settingsText.groupLabel}>{t('accountSettings.sectionDanger')}</Text>
        <SettingsPillButton
          tone="danger"
          icon={<TrashIcon size={20} color={SETTINGS_COLORS.logout} />}
          label={t('accountSettings.deleteAccount')}
          onPress={handleDeleteAccount}
          baseRim={RIM}
        />

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── 이메일 변경 모달 (iOS·Android 공용) ──
          SettingsModal: 배경 탭으로는 닫지 않는다(예전처럼 — 입력 중 실수 탭 방지), 안드로이드 뒤로·하단 취소 = closeEmailModal.
          statusBarTranslucent 모달은 안드로이드 adjustResize가 꺼져 avoidKeyboard(KAV)로 키보드를 직접 회피 */}
      <SettingsModal
        visible={isEmailModalVisible}
        title={t('accountSettings.emailChangeTitle')}
        description={t('accountSettings.emailModalDesc')}
        closeLabel={t('common.cancel')}
        onClose={closeEmailModal}
        avoidKeyboard
        backdropDismiss={false}
      >
        <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* 새 이메일 주소 */}
          <View style={styles.inputGroup}>
            <Text style={settingsText.fieldLabel}>{t('accountSettings.newEmailLabel')}</Text>
            <SettingsField baseRim={RIM} error={emailDraft.length > 0 && !EMAIL_INPUT_RE.test(emailDraft.trim())}>
              <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                style={settingsText.input}
                placeholder={t('accountSettings.newEmailPlaceholder')}
                placeholderTextColor={COLORS.text50}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={emailDraft}
                onChangeText={setEmailDraft}
              />
            </SettingsField>
            {emailDraft.length > 0 && !EMAIL_INPUT_RE.test(emailDraft.trim()) && (
              <Text style={styles.inputErrorText}>{t('accountSettings.emailInvalidMsg')}</Text>
            )}
          </View>

          {/* 본인 확인: 현재 비밀번호 (재인증) */}
          <View style={styles.inputGroup}>
            <Text style={settingsText.fieldLabel}>{t('accountSettings.currentPasswordLabel')}</Text>
            <SettingsField baseRim={RIM}>
              <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                style={settingsText.input}
                placeholder={t('accountSettings.currentPasswordPlaceholder')}
                placeholderTextColor={COLORS.text50}
                secureTextEntry
                maxLength={72}
                value={emailCurrentPassword}
                onChangeText={setEmailCurrentPassword}
              />
            </SettingsField>
          </View>

          {/* 제출 — 하단 알약(취소) 위. 제출 중에는 라벨 앞에 스피너 */}
          <SettingsPillButton
            label={t('accountSettings.changeBtn')}
            icon={emailSubmitting ? <ActivityIndicator size="small" color={COLORS.white} /> : undefined}
            onPress={submitEmailChange}
            disabled={emailSubmitting || !EMAIL_INPUT_RE.test(emailDraft.trim()) || !emailCurrentPassword}
            baseRim={RIM}
            style={styles.submitPill}
          />
        </ScrollView>
      </SettingsModal>

      {/* ── 비밀번호 변경 모달 ── 배경 탭 닫힘 없음·안드로이드 뒤로·취소 = closePasswordModal (예전과 같다) */}
      <SettingsModal
        visible={isPasswordModalVisible}
        title={t('accountSettings.passwordModalTitle')}
        description={t('accountSettings.passwordModalDesc')}
        closeLabel={t('common.cancel')}
        onClose={closePasswordModal}
        avoidKeyboard
        backdropDismiss={false}
      >
        <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* 현재 비밀번호 */}
          <View style={styles.inputGroup}>
            <Text style={settingsText.fieldLabel}>{t('accountSettings.currentPasswordLabel')}</Text>
            <SettingsField baseRim={RIM}>
              <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                style={settingsText.input}
                placeholder={t('accountSettings.currentPasswordPlaceholder')}
                placeholderTextColor={COLORS.text50}
                secureTextEntry
                maxLength={72}
                value={currentPassword}
                onChangeText={setCurrentPassword}
              />
            </SettingsField>
          </View>

          {/* 새 비밀번호 */}
          <View style={styles.inputGroup}>
            <Text style={settingsText.fieldLabel}>{t('accountSettings.newPasswordLabel')}</Text>
            <SettingsField baseRim={RIM}>
              <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                style={settingsText.input}
                placeholder={t('accountSettings.newPasswordPlaceholder')}
                placeholderTextColor={COLORS.text50}
                secureTextEntry
                maxLength={72}
                value={newPassword}
                onChangeText={setNewPassword}
              />
            </SettingsField>
            {/* 조건은 미리 전부 보여주고 충족되면 밝아진다 (components/RequirementList) */}
            <RequirementList
              style={styles.reqList}
              items={[
                { key: 'length', label: t('login.passwordReqLength'), met: newPassword.length >= 6 },
              ]}
            />
          </View>

          {/* 새 비밀번호 확인 */}
          <View style={styles.inputGroup}>
            <Text style={settingsText.fieldLabel}>{t('accountSettings.confirmPasswordLabel')}</Text>
            <SettingsField
              baseRim={RIM}
              // 빨간 테두리는 입력을 끝낸 뒤(blur)에만 — 확인 비밀번호를 치는 도중에는
              // 거의 매 글자가 '불일치'라 타이핑 내내 빨갛다. 입력 중 안내는 아래 조건 줄이 맡는다.
              error={!confirmPwFocused && confirmPassword.length > 0 && newPassword !== confirmPassword}
            >
              <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                style={settingsText.input}
                placeholder={t('accountSettings.confirmPasswordPlaceholder')}
                placeholderTextColor={COLORS.text50}
                secureTextEntry
                maxLength={72}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                onFocus={() => setConfirmPwFocused(true)}
                onBlur={() => setConfirmPwFocused(false)}
              />
            </SettingsField>
            <RequirementList
              style={styles.reqList}
              items={[
                {
                  key: 'match',
                  label: t('login.passwordReqMatch'),
                  met: newPassword.length > 0 && newPassword === confirmPassword,
                },
              ]}
            />
          </View>

          <SettingsPillButton
            label={t('accountSettings.changeBtn')}
            onPress={submitPasswordChange}
            disabled={passwordSubmitting || !currentPassword || newPassword.length < 6 || newPassword !== confirmPassword}
            baseRim={RIM}
            style={styles.submitPill}
          />
        </ScrollView>
      </SettingsModal>

      {/* ── 계정 삭제 모달 (디테일 3단계) ──
          하단 알약 = 단계별 '취소'(1단계: 닫기) / '이전'(2·3단계: 한 단계 뒤로) — 예전 왼쪽 버튼과 같은 동작.
          안드로이드 뒤로 = closeDeleteAccountModal(예전 onRequestClose), 배경 탭 닫힘 없음.
          KAV(avoidKeyboard)는 2단계 사유 입력·3단계 비밀번호 입력용 */}
      <SettingsModal
        visible={isDeleteAccountModalVisible}
        title={t('accountSettings.deleteModalTitle')}
        titleStyle={styles.deleteTitle}
        description={
          deleteStep === 1 ? t('accountSettings.deleteStep1Desc', { days: DELETION_GRACE_DAYS })
            : deleteStep === 2 ? t('accountSettings.deleteStep2Desc')
            : `${t('accountSettings.deleteStep3Desc1')}\n${t('accountSettings.deleteStep3Desc2', { days: DELETION_GRACE_DAYS })}`
        }
        closeLabel={deleteStep === 1 ? t('common.cancel') : t('accountSettings.prev')}
        onClose={deleteStep === 1 ? closeDeleteAccountModal : () => setDeleteStep(deleteStep === 3 ? 2 : 1)}
        onDismiss={closeDeleteAccountModal}
        avoidKeyboard
        backdropDismiss={false}
      >
        <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Step 1: 안내 및 동의 */}
          {deleteStep === 1 && (
            <View>
              {/* 경고 상자는 빨강 의미색 유지 — 되돌릴 수 없는 삭제 항목 안내 */}
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

              <SettingsPillButton
                tone="danger"
                label={t('accountSettings.next')}
                onPress={() => setDeleteStep(2)}
                disabled={!deleteConsent}
                baseRim={RIM}
                style={styles.submitPill}
              />
            </View>
          )}

          {/* Step 2: 탈퇴 사유 수집 — 설정 팝업 선택 행(선택 시 ✓)을 카드 끝에서 끝까지 펼친다 */}
          {deleteStep === 2 && (
            <View>
              <View style={styles.reasonList}>
                {DELETE_REASONS.map((reason, i) => (
                  <React.Fragment key={reason.value}>
                    <SettingsOptionRow
                      label={t(reason.labelKey)}
                      selected={deleteReason === reason.value}
                      onPress={() => setDeleteReason(reason.value)}
                    />
                    {i < DELETE_REASONS.length - 1 && <SettingsDivider />}
                  </React.Fragment>
                ))}
              </View>

              {deleteReason === 'other' && (
                <SettingsField baseRim={RIM} style={styles.reasonOther}>
                  <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                    style={settingsText.input}
                    placeholder={t('accountSettings.reasonOtherPlaceholder')}
                    placeholderTextColor={COLORS.text50}
                    value={deleteReasonDetail}
                    onChangeText={setDeleteReasonDetail}
                  />
                </SettingsField>
              )}

              <SettingsPillButton
                tone="danger"
                label={t('accountSettings.next')}
                onPress={() => setDeleteStep(3)}
                disabled={!deleteReason}
                baseRim={RIM}
                style={styles.submitPill}
              />
            </View>
          )}

          {/* Step 3: 보안 비밀번호 확인 */}
          {deleteStep === 3 && (
            <View>
              {signUpMethod === 'email' ? (
                <View style={styles.inputGroup}>
                  <Text style={settingsText.fieldLabel}>{t('accountSettings.deletePasswordLabel')}</Text>
                  <SettingsField baseRim={RIM}>
                    <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                      style={settingsText.input}
                      placeholder={t('accountSettings.deletePasswordPlaceholder')}
                      placeholderTextColor={COLORS.text50}
                      secureTextEntry
                      maxLength={72}
                      value={deletePassword}
                      onChangeText={setDeletePassword}
                    />
                  </SettingsField>
                </View>
              ) : (
                <View style={styles.inputGroup}>
                  <Text style={settingsText.fieldLabel}>{t('accountSettings.deleteSocialLabel')}</Text>
                  <SettingsField baseRim={RIM}>
                    <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                      style={settingsText.input}
                      placeholder={t('accountSettings.deleteConfirmPhrase')}
                      placeholderTextColor={COLORS.text50}
                      value={deleteSocialConfirm}
                      onChangeText={setDeleteSocialConfirm}
                    />
                  </SettingsField>
                </View>
              )}

              <SettingsPillButton
                tone="danger"
                label={t('accountSettings.permanentDelete')}
                onPress={submitDeleteAccount}
                disabled={deleteSubmitting || (signUpMethod === 'email' && !deletePassword) || (signUpMethod !== 'email' && deleteSocialConfirm !== t('accountSettings.deleteConfirmPhrase'))}
                baseRim={RIM}
                style={styles.submitPill}
              />
            </View>
          )}
        </ScrollView>
      </SettingsModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  // 좌우 16 = 설정 화면 카드 폭
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  // 헤더선 아래 첫 그룹 라벨 — 예전 첫 섹션 위 간격(24+20)보다 설정 화면 리듬(21)에 맞춘다
  firstGroupLabel: { marginTop: 21 },

  // ── 팝업 ── 틀·제목·설명·하단 취소 알약은 SettingsModal. 본문은 설명 아래 20, 높이 상한 안에서 스크롤.
  // 스크롤뷰 자신을 팝업 카드 좌우 패딩(16)만큼 펼치고 안쪽에서 16을 되돌린다 — ScrollView는 자기 영역 밖을 잘라서,
  // 안쪽 View에만 음수 여백을 주면 사유 목록 구분선이 좌우 16씩 잘린다(SettingsScreen modalListBleed와 같은 방식).
  modalBody: { flexGrow: 0, flexShrink: 1, marginTop: 20, marginHorizontal: -16 },
  modalBodyContent: { paddingHorizontal: 16 },
  deleteTitle: { color: COLORS.red },
  inputGroup: {
    marginBottom: 16,
  },
  inputErrorText: {
    fontSize: 11,
    color: COLORS.red,
    marginTop: 6,
    marginLeft: 17,
  },
  reqList: {
    marginTop: 8,
    marginLeft: 17,
  },
  // 제출 알약 — 하단 취소 알약(위 14)과 같은 간격
  submitPill: { marginTop: 4 },

  // 계정 삭제 디테일 스타일
  warningBox: {
    backgroundColor: COLORS.redBg,
    borderColor: COLORS.redBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
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
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: COLORS.text50,
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
    fontSize: 12,
    color: COLORS.text50,
    flex: 1,
    lineHeight: 17,
  },

  // 탈퇴 사유 목록 — 본문 안쪽 패딩(16)을 다시 펼쳐 행·구분선이 펼쳐진 스크롤뷰(= 팝업 카드) 끝에서 끝까지
  reasonList: {
    marginHorizontal: -16,
    marginBottom: 16,
  },
  reasonOther: { marginBottom: 16 },
});
