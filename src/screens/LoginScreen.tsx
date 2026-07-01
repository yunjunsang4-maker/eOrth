import React, { useState, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { PrimaryButton } from '../components/ui';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { useDM } from '../store/dmStore';
import { clearPersistedStores } from '../store/persist';
import {
  getPendingDeletion,
  isDeletionExpired,
  cancelAccountDeletion,
  daysUntilPurge,
} from '../store/pendingDeletion';
import { isSupabaseConfigured } from '../services/supabase';
import { signUpWithEmail, signInWithEmail, signInWithIdentifier, sendPasswordReset, signInWithProvider, resendEmailConfirmation, getAuthProvider, getAuthEmail } from '../services/auth';
import { getMyProfileStatus } from '../services/profile';
import { useAccountBoundary } from '../hooks/useAccountBoundary';
import { withTimeout } from '../utils/withTimeout';
import * as Network from 'expo-network';
import { GoogleIcon, AppleIcon } from '../components/icons';
import type { RootStackScreenProps } from '../navigation/types';

// 이메일 형식 검증 (메인 폼·재설정 모달 공통)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (v: string) => EMAIL_RE.test(v.trim());
// 전송 전 정규화: 공백 제거 + 소문자 (대소문자 차이로 인한 별도 계정/로그인 실패 방지)
const normalizeEmail = (v: string) => v.trim().toLowerCase();
// 아이디(handle) 형식: 영문/숫자/_ 3~30자 (로그인 입력이 아이디인지 판별)
const HANDLE_RE = /^[a-zA-Z0-9_]{3,30}$/;
const isValidHandle = (v: string) => HANDLE_RE.test(v.trim());

// 인증 메일 재전송 최소 간격(초)
const RESEND_COOLDOWN_SEC = 30;

type Props = RootStackScreenProps<'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { setSignUpMethod, setSignUpEmail, resetSettings } = useSettings();
  const { resetRecords } = useRecords();
  const { resetConversations } = useDM();
  const runAccountBoundary = useAccountBoundary();
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);
  const [confirmFocused, setConfirmFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // 입력 흐름(키보드 다음/완료) 제어용 refs
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  // 인증 메일 재전송 연타 방지용 마지막 전송 시각(ms)
  const lastResendAt = useRef(0);

  // Forgot password modal state
  const [forgotPasswordVisible, setForgotPasswordVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotEmailFocused, setForgotEmailFocused] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  // Social login modals state
  const [socialModal, setSocialModal] = useState<'google' | 'apple' | null>(null);
  const [socialLoading, setSocialLoading] = useState(false);
  const [authSuccess, setAuthSuccess] = useState(false);

  // 실제 소셜 로그인 (Supabase OAuth). 로딩/성공 오버레이만 모달로 표시하고
  // 실제 인증은 인앱 브라우저에서 진행된다. (가짜 계정 선택 화면 없음)
  const handleSocialLogin = async (provider: 'google' | 'apple') => {
    if (socialLoading) return; // 중복 탭 방지
    // 네트워크 사전 점검 — 끊긴 상태면 명확히 안내(브라우저가 '취소'로 오표기되는 것 방지)
    try {
      const net = await Network.getNetworkStateAsync();
      if (net.isConnected === false) {
        Alert.alert(t('login.loginFailed'), t('login.networkError'));
        return;
      }
    } catch {
      // 점검 실패 시 그냥 진행
    }
    setSocialModal(provider);
    setSocialLoading(true);
    setAuthSuccess(false);
    const result = await signInWithProvider(provider);
    if (!result.ok) {
      setSocialModal(null);
      setSocialLoading(false);
      // 사용자가 인증창을 닫아 취소한 경우엔 오류 알림을 띄우지 않는다.
      if (!result.cancelled) {
        Alert.alert(t('login.loginFailed'), result.error || t('login.tryAgain'));
      }
      return;
    }
    setAuthSuccess(true);
    // 온보딩을 마친 사용자면 로그인(Main), 아니면 온보딩(BasicInfo).
    // ⚠️ DB 트리거가 가입 즉시 빈 프로필 행을 생성하므로 "행 존재"로 판정하면 신규도 기존으로 오판된다.
    //    → 생일이 채워졌는지(온보딩 완료 신호)로 신규/기존을 구분한다.
    // 프로필 조회 실패 시에도 멈추지 않도록 기본값(BasicInfo)으로 안전하게 진행
    let dest: 'BasicInfo' | 'Main' = 'BasicInfo';
    let reached = false; // 프로필 조회가 서버에 도달했는가(신규/기존 판정 신뢰 가능 여부)
    // 계정의 원래 가입 수단을 반영한다. 연동 계정이면 최초 provider가 우선(예: 이메일 계정에 구글 연동 시 email 유지).
    // 조회 실패 시 방금 사용한 provider로 폴백.
    let accountProvider: 'email' | 'google' | 'apple' = provider;
    let accountEmail: string | null = null;
    try {
      // 병렬 조회 + 타임아웃 (느린/끊긴 네트워크에서 무한 대기 방지)
      const [status, original, email] = await withTimeout(
        Promise.all([getMyProfileStatus(), getAuthProvider(), getAuthEmail()]),
        12000,
      );
      reached = status.reached;
      if (status.profile && status.profile.birthday && status.profile.birthday.trim()) dest = 'Main';
      if (original) accountProvider = original;
      accountEmail = email;
    } catch {
      // 타임아웃/조회 실패 → reached=false 로 처리(아래에서 Splash 재평가)
    }
    const applyInfo = () => {
      setSignUpMethod(accountProvider);
      if (accountEmail) setSignUpEmail(accountEmail);
    };
    // 성공 표시를 잠깐 보여준 뒤 진행. 네비게이션 완료까지 로딩 인디케이터를 유지한다.
    await new Promise((r) => setTimeout(r, 600));
    try {
      if (!reached) {
        // 프로필 판정 불가(일시적 오류) → 온보딩/메인으로 잘못 보내지 않고 Splash에서 재평가한다.
        applyInfo();
        navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
        return;
      }
      // OAuth는 이미 Supabase 세션 생성됨 → 가입정보 적용 후 분기
      await proceedAfterAuth(applyInfo, dest);
    } finally {
      setSocialLoading(false);
      setSocialModal(null);
    }
  };

  const handleGooglePress = () => handleSocialLogin('google');
  const handleApplePress = () => handleSocialLogin('apple');

  // ─── 탈퇴 유예 계정 처리 ───
  // 로그인 성공 시 탈퇴 신청 여부를 확인한다.
  //  - 유예 기간(30일) 내 → 복구 여부를 묻고, 복구하면 데이터 그대로 Main 진입
  //  - 만료 → 영구 파기 후 새 계정 온보딩 진행
  // applySignup: 가입 정보(이메일·가입 수단 등) 적용 콜백. 파기 후에도 다시 적용되도록 콜백으로 받는다.
  const purgeAllData = () => {
    resetRecords();
    resetSettings();
    resetConversations();
    clearPersistedStores().catch(() => {});
    cancelAccountDeletion().catch(() => {});
  };

  // 인증 후엔 로그인/온보딩 화면을 스택에서 제거(뒤로가기로 복귀 방지)
  const goTo = (dest: 'BasicInfo' | 'Main') =>
    navigation.reset({ index: 0, routes: [{ name: dest }] });

  // destination: 신규 가입은 온보딩(BasicInfo), 기존 사용자 로그인은 Main
  const proceedAfterAuth = async (applySignup: () => void, destination: 'BasicInfo' | 'Main' = 'BasicInfo') => {
    // 계정 전환이면 로컬을 비우고 새 계정 데이터를 복원한 뒤 진행
    await runAccountBoundary();

    // 탈퇴 신청 조회 실패 시에도 인증 자체는 성공했으므로 정상 진입시킨다
    let pending: Awaited<ReturnType<typeof getPendingDeletion>> = null;
    try {
      pending = await getPendingDeletion();
    } catch {
      applySignup();
      goTo(destination);
      return;
    }

    if (!pending) {
      applySignup();
      goTo(destination);
      return;
    }

    if (isDeletionExpired(pending)) {
      purgeAllData();
      applySignup();
      goTo('BasicInfo');
      return;
    }

    Alert.alert(
      t('login.recoverTitle'),
      t('login.recoverMsg', { days: daysUntilPurge(pending) }),
      [
        {
          text: t('login.recoverFresh'),
          style: 'destructive',
          onPress: () => {
            purgeAllData();
            applySignup();
            goTo('BasicInfo');
          },
        },
        {
          text: t('login.recoverRestore'),
          onPress: () => {
            cancelAccountDeletion().catch(() => {});
            goTo('Main');
          },
        },
      ],
    );
  };

  const handleForgotPassword = () => {
    setForgotEmail(email);
    setResetSuccess(false);
    setIsResetting(false);
    setForgotPasswordVisible(true);
  };

  const handleSendResetLink = async () => {
    if (!forgotEmail.trim()) return;
    setIsResetting(true);
    if (isSupabaseConfigured) {
      const result = await sendPasswordReset(normalizeEmail(forgotEmail));
      setIsResetting(false);
      if (!result.ok) {
        Alert.alert(t('login.mailSendFailed'), result.error ?? t('login.mailSendFailedMsg'));
        return;
      }
      setResetSuccess(true);
    } else {
      // Supabase 미설정: 기존 모의 동작
      setTimeout(() => {
        setIsResetting(false);
        setResetSuccess(true);
      }, 1500);
    }
  };

  const isSignup = mode === 'signup';

  // 모드 전환 시 확인 비밀번호 잔류 방지 (회원가입 전용 필드)
  const switchMode = (next: 'login' | 'signup') => {
    if (next === mode) return;
    setMode(next);
    setConfirmPassword('');
    setConfirmFocused(false);
  };

  // 로그인은 이메일 또는 아이디(handle) 허용, 회원가입은 이메일만
  const identifierValid = isSignup ? isValidEmail(email) : (isValidEmail(email) || isValidHandle(email));
  const canSubmit =
    !submitting &&
    identifierValid &&
    password.length >= 6 &&
    (isSignup ? confirmPassword === password : true);

  // 인증 메일 재전송 (Confirm email 활성화 시 메일 미수신 대비)
  const handleResendConfirmation = async (targetEmail: string) => {
    if (!targetEmail) return;
    // 연타 방지: 마지막 전송 후 RESEND_COOLDOWN_SEC 이내면 막는다
    const remain = Math.ceil((lastResendAt.current + RESEND_COOLDOWN_SEC * 1000 - Date.now()) / 1000);
    if (remain > 0) {
      Alert.alert(t('login.waitTitle'), t('login.waitMsg', { sec: remain }));
      return;
    }
    lastResendAt.current = Date.now();
    const result = await resendEmailConfirmation(targetEmail);
    if (!result.ok) lastResendAt.current = 0; // 실패 시 쿨다운 해제하여 재시도 허용
    Alert.alert(
      result.ok ? t('login.resendDone') : t('login.resendFailed'),
      result.ok ? t('login.resendDoneMsg') : (result.error ?? t('login.resendFailedMsg')),
    );
  };

  const handleSubmit = async () => {
    const identifier = email.trim();
    const normEmail = normalizeEmail(email);
    const usedEmail = isValidEmail(identifier); // 로그인 입력이 이메일인지(아니면 아이디)
    const destination = isSignup ? 'BasicInfo' as const : 'Main' as const;

    // Supabase 미설정: 기존 모의 로그인 유지
    if (!isSupabaseConfigured) {
      const applyMock = () => {
        setSignUpMethod('email');
        setSignUpEmail(normEmail || 'user@eorth.app');
      };
      proceedAfterAuth(applyMock, destination);
      return;
    }

    setSubmitting(true);
    const result = isSignup
      ? await signUpWithEmail(normEmail, password)
      : await signInWithIdentifier(identifier, password); // 이메일 또는 아이디로 로그인
    setSubmitting(false);

    if (!result.ok) {
      Alert.alert(isSignup ? t('login.signupFailed') : t('login.loginFailed'), result.error ?? t('login.genericError'));
      return;
    }
    if (result.needsEmailConfirm) {
      const targetEmail = normEmail;
      Alert.alert(
        t('login.emailVerifyTitle'),
        t('login.emailVerifyMsg'),
        [
          { text: t('login.resendMail'), onPress: () => handleResendConfirmation(targetEmail) },
          { text: t('common.confirm'), onPress: () => switchMode('login') },
        ],
      );
      return;
    }
    // 아이디로 로그인했으면 실제 이메일을 서버에서 조회해 저장(아이디를 이메일로 저장하지 않도록).
    let storedEmail: string | null = usedEmail ? normEmail : null;
    if (!isSignup && !usedEmail) {
      storedEmail = await getAuthEmail();
    }
    const applySignup = () => {
      setSignUpMethod('email');
      if (storedEmail) setSignUpEmail(storedEmail);
      else if (isSignup) setSignUpEmail(normEmail || 'user@eorth.app');
    };
    proceedAfterAuth(applySignup, destination);
  };

  return (
    <LinearGradient colors={['#0A0118', '#100620']} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand */}
          <View style={styles.brandSection}>
            <View style={styles.miniGlobeWrap}>
              <View style={styles.bgGlow} />
              <LinearGradient
                colors={['#4A2FCB', '#7B61FF', '#C084FC']}
                start={{ x: 0.2, y: 0.1 }}
                end={{ x: 0.8, y: 0.9 }}
                style={styles.miniGlobe}
              />
            </View>
            <Image
              source={require('../../assets/logo.png')}
              style={styles.brandLogoImage}
              resizeMode="contain"
            />
            <Text style={styles.tagline}>{t('login.tagline')}</Text>
          </View>

          {/* Mode toggle */}
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'signup' && styles.modeBtnActive]}
              onPress={() => switchMode('signup')}
            >
              <Text style={[styles.modeBtnText, mode === 'signup' && styles.modeBtnTextActive]}>
                {t('login.modeSignup')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'login' && styles.modeBtnActive]}
              onPress={() => switchMode('login')}
            >
              <Text style={[styles.modeBtnText, mode === 'login' && styles.modeBtnTextActive]}>
                {t('login.modeLogin')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Email / Password form */}
          <View style={styles.form}>
            {/* Email (로그인 시엔 이메일 또는 아이디) */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>{isSignup ? t('login.email') : t('login.emailOrId')}</Text>
              <View style={[styles.inputBox, emailFocused && styles.inputBoxFocused]}>
                <Text style={styles.inputIcon}>✉️</Text>
                <TextInput
                  style={styles.input}
                  placeholder={isSignup ? 'example@email.com' : t('login.emailOrIdPlaceholder')}
                  placeholderTextColor={Colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType={isSignup ? 'email-address' : 'default'}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType={isSignup ? 'emailAddress' : 'username'}
                  autoComplete={isSignup ? 'email' : 'username'}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  accessibilityLabel={isSignup ? t('login.emailA11y') : t('login.emailOrIdA11y')}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>{t('login.password')}</Text>
              <View style={[styles.inputBox, pwFocused && styles.inputBoxFocused]}>
                <Text style={styles.inputIcon}>🔒</Text>
                <TextInput
                  ref={passwordRef}
                  style={styles.input}
                  placeholder={t('login.passwordPlaceholder')}
                  placeholderTextColor={Colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  textContentType={isSignup ? 'newPassword' : 'password'}
                  autoComplete={isSignup ? 'password-new' : 'password'}
                  returnKeyType={isSignup ? 'next' : 'done'}
                  blurOnSubmit={!isSignup}
                  onSubmitEditing={() => {
                    if (isSignup) confirmRef.current?.focus();
                    else if (canSubmit) handleSubmit();
                  }}
                  accessibilityLabel={t('login.passwordA11y')}
                  onFocus={() => setPwFocused(true)}
                  onBlur={() => setPwFocused(false)}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? t('login.passwordHide') : t('login.passwordShow')}
                >
                  <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              </View>
              {isSignup && password.length > 0 && password.length < 6 && (
                <Text style={styles.fieldHint}>{t('login.passwordHint')}</Text>
              )}
            </View>

            {/* Confirm password (signup only) */}
            {isSignup && (
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>{t('login.confirmPassword')}</Text>
                <View style={[styles.inputBox, confirmFocused && styles.inputBoxFocused,
                  confirmPassword.length > 0 && confirmPassword !== password && styles.inputBoxError,
                ]}>
                  <Text style={styles.inputIcon}>🔑</Text>
                  <TextInput
                    ref={confirmRef}
                    style={styles.input}
                    placeholder={t('login.confirmPlaceholder')}
                    placeholderTextColor={Colors.textMuted}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirm}
                    textContentType="newPassword"
                    autoComplete="password-new"
                    returnKeyType="done"
                    onSubmitEditing={() => { if (canSubmit) handleSubmit(); }}
                    accessibilityLabel={t('login.confirmA11y')}
                    onFocus={() => setConfirmFocused(true)}
                    onBlur={() => setConfirmFocused(false)}
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirm((v) => !v)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={showConfirm ? t('login.confirmHide') : t('login.confirmShow')}
                  >
                    <Text style={styles.eyeIcon}>{showConfirm ? '🙈' : '👁️'}</Text>
                  </TouchableOpacity>
                </View>
                {confirmPassword.length > 0 && confirmPassword !== password && (
                  <Text style={[styles.fieldHint, { color: '#FF6B6B' }]}>
                    {t('login.passwordMismatch')}
                  </Text>
                )}
              </View>
            )}

            {/* Forgot password (login only) */}
            {!isSignup && (
              <TouchableOpacity style={styles.forgotBtn} onPress={handleForgotPassword}>
                <Text style={styles.forgotText}>{t('login.forgot')}</Text>
              </TouchableOpacity>
            )}

            {/* Submit button */}
            <PrimaryButton
              label={isSignup ? t('login.submitSignup') : t('login.submitLogin')}
              onPress={handleSubmit}
              disabled={!canSubmit}
              loading={submitting}
              style={styles.submitBtn}
            />
          </View>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('login.or')}</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social login options */}
          <View style={styles.socialSection}>
            {/* Google */}
            <TouchableOpacity
              style={styles.socialBtn}
              activeOpacity={0.85}
              onPress={handleGooglePress}
              disabled={socialLoading}
              accessibilityRole="button"
              accessibilityLabel={t('login.googleContinue')}
            >
              <GoogleIcon size={20} />
              <Text style={styles.socialBtnText}>{t('login.googleContinue')}</Text>
            </TouchableOpacity>

            {/* Apple — iOS 전용 노출 (App Store 정책상 iOS에서만 제공) */}
            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={[styles.socialBtn, styles.appleBtn]}
                activeOpacity={0.85}
                onPress={handleApplePress}
                disabled={socialLoading}
                accessibilityRole="button"
                accessibilityLabel={t('login.appleContinue')}
              >
                <AppleIcon size={20} color="#FFFFFF" />
                <Text style={[styles.socialBtnText, { color: Colors.white }]}>
                  {t('login.appleContinue')}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Terms */}
          <Text style={styles.termsText}>
            {isSignup ? t('login.termsSignup') : t('login.termsLogin')}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Forgot Password Modal */}
      <Modal
        visible={forgotPasswordVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setForgotPasswordVisible(false)}
      >
        <View style={styles.modalOverlay} accessibilityViewIsModal>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('login.resetTitle')}</Text>
              <TouchableOpacity
                onPress={() => setForgotPasswordVisible(false)}
                style={styles.modalCloseBtn}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {!resetSuccess ? (
              <View style={styles.modalBody}>
                <Text style={styles.modalDesc}>
                  {t('login.resetDesc')}
                </Text>

                <View style={[styles.fieldWrap, { width: '100%' }]}>
                  <Text style={styles.fieldLabel}>{t('login.resetEmailLabel')}</Text>
                  <View style={[styles.inputBox, forgotEmailFocused && styles.inputBoxFocused]}>
                    <Text style={styles.inputIcon}>✉️</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="example@email.com"
                      placeholderTextColor={Colors.textMuted}
                      value={forgotEmail}
                      onChangeText={setForgotEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      textContentType="emailAddress"
                      autoComplete="email"
                      returnKeyType="send"
                      onSubmitEditing={() => { if (isValidEmail(forgotEmail) && !isResetting) handleSendResetLink(); }}
                      accessibilityLabel={t('login.resetEmailA11y')}
                      onFocus={() => setForgotEmailFocused(true)}
                      onBlur={() => setForgotEmailFocused(false)}
                      editable={!isResetting}
                    />
                  </View>
                </View>

                {isResetting ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                    <Text style={styles.loadingText}>{t('login.resetSending')}</Text>
                  </View>
                ) : (
                  <PrimaryButton
                    label={t('login.resetSend')}
                    onPress={handleSendResetLink}
                    disabled={!isValidEmail(forgotEmail)}
                    style={styles.modalSubmitBtn}
                  />
                )}
              </View>
            ) : (
              <View style={styles.modalBody}>
                <View style={styles.successIconWrap}>
                  <Text style={styles.successIcon}>✉️</Text>
                </View>
                <Text style={styles.successTitle}>{t('login.resetSuccessTitle')}</Text>
                <Text style={styles.successDesc}>
                  {t('login.resetSuccessDesc', { email: forgotEmail })}
                </Text>
                <PrimaryButton
                  label={t('common.confirm')}
                  onPress={() => setForgotPasswordVisible(false)}
                  style={styles.modalSubmitBtn}
                />
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* 소셜 로그인 로딩 오버레이 (실제 인증은 인앱 브라우저에서 진행 — 가짜 인증 UI 없음) */}
      <Modal
        visible={socialModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!socialLoading) setSocialModal(null); }}
      >
        <View style={styles.socialModalOverlay}>
          <View style={styles.loaderCard}>
            {authSuccess ? (
              <>
                <Text style={styles.loaderEmoji}>✅</Text>
                <Text style={styles.loaderText}>{t('login.loginSuccess')}</Text>
              </>
            ) : (
              <>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loaderText}>{t('login.signingIn')}</Text>
              </>
            )}
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingBottom: 48,
    paddingHorizontal: Spacing[6],
  },

  // Brand
  brandSection: {
    alignItems: 'center',
    marginBottom: Spacing[8],
    gap: Spacing[2],
  },
  miniGlobeWrap: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[1],
  },
  bgGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(123, 97, 255, 0.18)',
  },
  miniGlobe: {
    width: 68,
    height: 68,
    borderRadius: 34,
    shadowColor: '#7B61FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 20,
    elevation: 10,
  },
  brandLogoImage: {
    width: 138,
    height: 38,
    marginBottom: 6,
  },
  tagline: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  // Mode toggle
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.full,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing[6],
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: BorderRadius.full,
  },
  modeBtnActive: {
    backgroundColor: Colors.primary,
  },
  modeBtnText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textMuted,
  },
  modeBtnTextActive: {
    color: Colors.white,
    fontFamily: Typography.fontFamily.semiBold,
  },

  // Form
  form: {
    gap: Spacing[4],
    marginBottom: Spacing[6],
  },
  fieldWrap: {
    gap: Spacing[2],
  },
  fieldLabel: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textSecondary,
    letterSpacing: 0.3,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing[4],
    gap: Spacing[2],
  },
  inputBoxFocused: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(123,97,255,0.06)',
  },
  inputBoxError: {
    borderColor: '#FF6B6B',
  },
  inputIcon: {
    fontSize: 16,
  },
  eyeIcon: {
    fontSize: 18,
    paddingLeft: Spacing[1],
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    paddingVertical: 16,
  },
  fieldHint: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    paddingLeft: Spacing[1],
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: -Spacing[2],
  },
  forgotText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.primary,
  },
  submitBtn: {
    marginTop: Spacing[2],
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    marginBottom: Spacing[5],
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
  },

  // Social
  socialSection: {
    gap: Spacing[3],
    marginBottom: Spacing[5],
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    paddingVertical: 15,
    paddingHorizontal: Spacing[5],
    gap: Spacing[2],
  },
  appleBtn: {
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  socialBtnText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.semiBold,
    color: '#333333',
  },

  // Terms
  termsText: {
    color: Colors.textMuted,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Forgot Password Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 1, 15, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[6],
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#160B2C',
    borderRadius: BorderRadius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(191, 133, 252, 0.15)',
    padding: Spacing[6],
    shadowColor: '#7B61FF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[4],
  },
  modalTitle: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.white,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
  },
  modalCloseText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  modalBody: {
    gap: Spacing[4],
    alignItems: 'center',
    width: '100%',
  },
  modalDesc: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing[2],
  },
  modalSubmitBtn: {
    width: '100%',
    marginTop: Spacing[2],
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    paddingVertical: 16,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
  },
  successIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(123, 97, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[2],
  },
  successIcon: {
    fontSize: 28,
  },
  successTitle: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.white,
    marginBottom: Spacing[1],
  },
  successDesc: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing[4],
  },

  // Social Mock Modals
  socialModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 1, 15, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[6],
  },
  loaderCard: {
    minWidth: 200,
    backgroundColor: '#160B2C',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.15)',
    paddingVertical: 32,
    paddingHorizontal: 40,
    alignItems: 'center',
    gap: 16,
  },
  loaderEmoji: {
    fontSize: 40,
  },
  loaderText: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
});
