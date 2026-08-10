import React, { useState, useRef, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  ActivityIndicator,
  Alert,
  Image,
  BackHandler,
} from 'react-native';
import { Text, TextInput } from '../ui/Text';
import { STAGE_MAX_W } from '../utils/stage';

// 생성 이모티콘(AI 커스텀, 다크 보라 3D 글로시) — 시스템 이모지 대체
const EMOJI_MAIL = require('../../assets/emoji/mail.png');
const EMOJI_LOCK = require('../../assets/emoji/lock.png');
const EMOJI_EYE_OPEN = require('../../assets/emoji/eye-open.png');
const EMOJI_EYE_CLOSED = require('../../assets/emoji/eye-closed.png');
const EMOJI_KEY = require('../../assets/emoji/key.png');
const EMOJI_CHECK = require('../../assets/emoji/check.png');
import { useTranslation } from 'react-i18next';
import Svg, {
  Defs as SvgDefs,
  LinearGradient as SvgLinearGradient,
  Stop as SvgStop,
  Rect as SvgRect,
} from 'react-native-svg';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { PRIVACY_POLICY_URL, TERMS_URL } from '../constants/legalLinks';
import * as WebBrowser from 'expo-web-browser';
import { EorthLogo } from '../components/EorthLogo';
import StarFieldBackground from '../components/StarFieldBackground';
import { IntroAmbient } from './introVisuals';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { useDM } from '../store/dmStore';
import { clearPersistedStores } from '../store/persist';
import {
  getPendingDeletion,
  isDeletionExpired,
  cancelAccountDeletion,
  clearLocalDeletionFlag,
  daysUntilPurge,
} from '../store/pendingDeletion';
import { purgeAccountOnServer } from '../services/accountDeletion';
import { isSupabaseConfigured } from '../services/supabase';
import { signUpWithEmail, signInWithIdentifier, sendPasswordReset, signInWithProvider, resendEmailConfirmation, getAuthProvider, getAuthEmail, signOut } from '../services/auth';
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
// 아이디(handle) 형식: 영문/숫자/_ 4~30자 (로그인 입력이 아이디인지 판별)
const HANDLE_RE = /^[a-zA-Z0-9_]{4,30}$/;
const isValidHandle = (v: string) => HANDLE_RE.test(v.trim());

// 인증 메일 재전송 최소 간격(초)
const RESEND_COOLDOWN_SEC = 30;

// 온보딩 '다음' 버튼과 동일한 유리 필 버튼 — 흰 10% + #CECFCD 그라데이션 테두리
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
              <SvgLinearGradient id="loginBtnRing" x1="0.216" y1="-0.08" x2="0.283" y2="1.10">
                <SvgStop offset="0" stopColor="#CECFCD" stopOpacity={1} />
                <SvgStop offset="0.607" stopColor="#CECFCD" stopOpacity={0} />
              </SvgLinearGradient>
            </SvgDefs>
            <SvgRect x={0.5} y={0.5} width={btnW - 1} height={55} rx={28} stroke="url(#loginBtnRing)" strokeWidth={1} fill="none" />
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
  // 시도 세대 — 45초 안전장치가 오버레이를 닫은 뒤 매달렸던 SDK 프라미스가 3분 시점에
  // 풀리면(시트 타임아웃) 두 번째 알림이 또 떴다. 안전장치가 세대를 올리면 늦은 결과는 폐기한다.
  const socialAttemptRef = useRef(0);

  // 오버레이 최후 안전장치 — 이 오버레이는 취소 버튼이 없고 뒤로가기도 막혀 있어(아래 BackHandler),
  // 로딩이 안 풀리면 앱 강제종료 외에 탈출구가 없다. 내부 호출마다 타임아웃을 걸었지만
  // 예상 못 한 경로가 매달릴 경우를 대비해 여기서 한 번 더 끊는다.
  // 정상 흐름의 최악(토큰 15s + 프로필 12s + 표시 0.6s ≈ 28s)보다 넉넉히 잡아 오탐을 막는다.
  useEffect(() => {
    if (!socialLoading) return;
    const timer = setTimeout(() => {
      socialAttemptRef.current += 1; // 진행 중이던 시도 무효화 — 늦게 풀린 프라미스가 알림·이동을 못 하게
      setSocialLoading(false);
      setSocialModal(null);
      setAuthSuccess(false);
      Alert.alert(t('login.loginFailed'), t('authErr.timeout'));
    }, 45000);
    return () => clearTimeout(timer);
  }, [socialLoading, t]);

  // 로딩 중 안드로이드 뒤로가기 차단 — Modal이던 시절 onRequestClose가 하던 역할.
  // (절대위치 View로 바꾸며 백 버튼 처리가 사라져, 로딩 중 화면 이탈이 가능해지는 것을 막는다)
  useEffect(() => {
    if (socialModal === null) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [socialModal]);

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
    const myAttempt = ++socialAttemptRef.current;
    setSocialModal(provider);
    setSocialLoading(true);
    setAuthSuccess(false);
    const result = await signInWithProvider(provider);
    // 45초 안전장치가 이미 이 시도를 끝냈으면(알림도 띄웠음) 늦은 결과는 조용히 폐기
    if (myAttempt !== socialAttemptRef.current) return;
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

  // 약관·방침 열기 — 설정 화면과 동일하게 인앱 브라우저, 실패 시 주소를 직접 안내한다.
  const openLegal = (url: string) => {
    WebBrowser.openBrowserAsync(url).catch(() => {
      Alert.alert(t('settings.terms'), url);
    });
  };

  const handleGooglePress = () => handleSocialLogin('google');
  const handleApplePress = () => handleSocialLogin('apple');

  // ─── 탈퇴 유예 계정 처리 ───
  // 로그인 성공 시 탈퇴 신청 여부(서버 플래그)를 확인한다.
  //  - 유예 기간(30일) 내 → 복구 여부를 묻고, 복구하면 서버 플래그 해제 후 Main 진입
  //  - 만료 → 서버(게시물·Storage·auth 계정)까지 영구 파기 후 새 가입 안내
  // applySignup: 가입 정보(이메일·가입 수단 등) 적용 콜백. 파기 후에도 다시 적용되도록 콜백으로 받는다.
  const purgeLocalData = () => {
    resetRecords();
    resetSettings();
    resetConversations();
    clearPersistedStores().catch(() => {});
  };

  // 인증 후엔 로그인/온보딩 화면을 스택에서 제거(뒤로가기로 복귀 방지)
  const goTo = (dest: 'BasicInfo' | 'Main') =>
    navigation.reset({ index: 0, routes: [{ name: dest }] });

  // destination: 신규 가입은 온보딩(BasicInfo), 기존 사용자 로그인은 Main
  const proceedAfterAuth = async (applySignup: () => void, destination: 'BasicInfo' | 'Main' = 'BasicInfo') => {
    // 계정 전환이면 로컬을 비우고 새 계정 데이터를 복원한 뒤 진행
    await runAccountBoundary();

    // 서버 플래그 우선 조회(도달 실패 시 로컬 캐시 폴백) — 조회 자체는 throw하지 않는다
    const pending = await getPendingDeletion();

    if (!pending) {
      applySignup();
      goTo(destination);
      return;
    }

    if (isDeletionExpired(pending)) {
      // 유예 만료 — 서버까지 영구 파기. 실패 시 로컬도 지우지 않고 다음 로그인에서 재시도한다.
      const purged = await purgeAccountOnServer('full');
      await signOut(); // 파기 성공 여부와 무관하게 만료 계정으로는 진입시키지 않는다
      if (!purged) {
        Alert.alert(t('login.purgeFailTitle'), t('login.purgeFailMsg'));
        return;
      }
      purgeLocalData();
      await clearLocalDeletionFlag().catch(() => {});
      Alert.alert(t('login.purgedTitle'), t('login.purgedMsg'));
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
            void (async () => {
              // 콘텐츠만 서버 파기(계정·로그인 수단은 유지) 후 재온보딩
              const purged = await purgeAccountOnServer('content');
              if (!purged) {
                Alert.alert(t('login.purgeFailTitle'), t('login.purgeFailMsg'));
                return;
              }
              purgeLocalData();
              await clearLocalDeletionFlag().catch(() => {});
              applySignup();
              goTo('BasicInfo');
            })();
          },
        },
        {
          text: t('login.recoverRestore'),
          onPress: () => {
            void (async () => {
              // 서버 플래그 해제가 확인돼야 복구 완료 — 실패 시 진입시키면
              // 30일 후 안전망 파기가 복구된 줄 아는 계정을 지워버린다.
              try {
                await cancelAccountDeletion();
              } catch {
                Alert.alert(t('login.recoverFailTitle'), t('login.recoverFailMsg'));
                return;
              }
              // recoverFresh와 동일하게 가입 정보를 적용한다 — 빠뜨리면 가입 수단이 기본값('email')로
              // 남아 소셜 계정이 이메일 계정으로 오인되고(비밀번호 변경·탈퇴 흐름이 어긋남) 이메일도 기본값이 된다.
              applySignup();
              goTo('Main');
            })();
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
    if (submitting) return; // 연타 방지(버튼 disabled의 이중 안전망)
    const identifier = email.trim();
    const normEmail = normalizeEmail(email);
    const usedEmail = isValidEmail(identifier); // 로그인 입력이 이메일인지(아니면 아이디)

    // 인증 성공 뒤에도 프로필 조회·계정 경계 처리·네비게이션이 수십 초 걸릴 수 있다.
    // 그 사이 버튼을 되살리면 무반응처럼 보이고 재탭으로 로그인이 중복 실행된다 →
    // '이동(또는 실패 확정)이 끝날 때'까지 submitting을 유지한다(finally에서 한 번만 해제).
    setSubmitting(true);
    try {
      // Supabase 미설정: 기존 모의 로그인 유지
      if (!isSupabaseConfigured) {
        const applyMock = () => {
          setSignUpMethod('email');
          setSignUpEmail(normEmail || 'user@eorth.app');
        };
        await proceedAfterAuth(applyMock, isSignup ? 'BasicInfo' : 'Main');
        return;
      }

      const result = isSignup
        ? await signUpWithEmail(normEmail, password)
        : await signInWithIdentifier(identifier, password); // 이메일 또는 아이디로 로그인

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

      // 로그인도 소셜·Splash와 동일하게 온보딩 완료(생일 채움) 여부로 목적지를 판정한다.
      // 무조건 Main으로 보내면 온보딩 중 이탈한 사용자가 프로필(아이디·생일) 없이 메인에 진입한다.
      let destination: 'BasicInfo' | 'Main' = 'BasicInfo';
      if (!isSignup) {
        const status = await getMyProfileStatus();
        if (!status.reached) {
          // 신규/기존 판정 불가(일시적 네트워크 오류) → 오라우팅 대신 Splash에서 재평가
          applySignup();
          navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
          return;
        }
        destination = status.profile?.birthday && status.profile.birthday.trim() ? 'Main' : 'BasicInfo';
      }
      await proceedAfterAuth(applySignup, destination);
    } finally {
      // 성공 시엔 이미 화면이 교체된 뒤라 무의미하고(언마운트 후 setState는 no-op),
      // 실패·복구 안내로 로그인 화면에 남는 경로에서는 버튼이 반드시 되살아난다.
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StarFieldBackground opacity={0.5} />
      <IntroAmbient />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand — 온보딩과 동일한 eorth 워드마크 */}
          <View style={styles.brandSection}>
            <EorthLogo width={150} />
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
                <Image source={EMOJI_MAIL} style={styles.inputIcon} />
                <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
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
                <Image source={EMOJI_LOCK} style={styles.inputIcon} />
                <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
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
                  <Image source={showPassword ? EMOJI_EYE_CLOSED : EMOJI_EYE_OPEN} style={styles.eyeIcon} />
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
                  <Image source={EMOJI_KEY} style={styles.inputIcon} />
                  <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                    ref={confirmRef}
                    style={styles.input}
                    placeholder={t('login.confirmPlaceholder')}
                    placeholderTextColor={Colors.textMuted}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirm}
                    // newPassword를 주면 iOS '자동 강력 암호'가 이 필드를 시스템 관리 모드로
                    // 가져가면서 글자색을 검정으로 덮는다(다크 배경이라 첫 칸과 색이 달라 보임).
                    // oneTimeCode는 그 개입을 막는 표준 회피책 — 키체인 저장 제안은 위의
                    // newPassword 필드(비밀번호 칸)가 계속 담당한다.
                    textContentType="oneTimeCode"
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
                    <Image source={showConfirm ? EMOJI_EYE_CLOSED : EMOJI_EYE_OPEN} style={styles.eyeIcon} />
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

            {/* Submit button — 온보딩과 동일한 유리 필 */}
            <GlassButton
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

          {/* 약관 안내 — 가입 시점에 전문을 볼 수단이 없으면 심사에서 지적되고, 문서 이름만
              걸어두면 무엇에 동의하는지도 알 수 없다. 그래서 ① 무엇에 동의하는지 한 문장,
              ② 문서별로 어떤 내용을 담는지 한 줄 요약, ③ 탭하면 전문(인앱 브라우저) 세 가지를 함께 둔다.
              문장 안의 단어를 쪼개 링크로 만들지 않는 이유는 언어별 어순 때문에 깨지기 때문이다. */}
          <Text style={styles.termsText}>
            {isSignup ? t('login.termsSignup') : t('login.termsLogin')}
          </Text>
          <View style={styles.legalBox}>
            <TouchableOpacity
              style={styles.legalRow}
              onPress={() => openLegal(TERMS_URL)}
              accessibilityRole="link"
              accessibilityLabel={`${t('settings.termsTitle')} ${t('login.legalView')}`}
            >
              <View style={styles.legalTextCol}>
                <Text style={styles.legalTitle}>{t('settings.termsTitle')}</Text>
                <Text style={styles.legalDesc}>{t('login.legalTermsDesc')}</Text>
              </View>
              <Text style={styles.legalView}>{t('login.legalView')}</Text>
            </TouchableOpacity>
            <View style={styles.legalDivider} />
            <TouchableOpacity
              style={styles.legalRow}
              onPress={() => openLegal(PRIVACY_POLICY_URL)}
              accessibilityRole="link"
              accessibilityLabel={`${t('settings.privacyPolicy')} ${t('login.legalView')}`}
            >
              <View style={styles.legalTextCol}>
                <Text style={styles.legalTitle}>{t('settings.privacyPolicy')}</Text>
                <Text style={styles.legalDesc}>{t('login.legalPrivacyDesc')}</Text>
              </View>
              <Text style={styles.legalView}>{t('login.legalView')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Forgot Password Modal */}
      <Modal
        visible={forgotPasswordVisible}
        transparent statusBarTranslucent navigationBarTranslucent
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
                    <Image source={EMOJI_MAIL} style={styles.inputIcon} />
                    <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
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
                    <ActivityIndicator size="small" color="#EC34F7" />
                    <Text style={styles.loadingText}>{t('login.resetSending')}</Text>
                  </View>
                ) : (
                  <GlassButton
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
                  <Image source={EMOJI_MAIL} style={styles.successIcon} />
                </View>
                <Text style={styles.successTitle}>{t('login.resetSuccessTitle')}</Text>
                <Text style={styles.successDesc}>
                  {t('login.resetSuccessDesc', { email: forgotEmail })}
                </Text>
                <GlassButton
                  label={t('common.confirm')}
                  onPress={() => setForgotPasswordVisible(false)}
                  style={styles.modalSubmitBtn}
                />
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* 소셜 로그인 로딩 오버레이 — Modal 금지, 절대위치 View로 그린다.
          iOS에서 Modal이 fade로 뜨는 도중에 구글 네이티브 시트를 present하면 UIKit이
          전환 충돌로 시트 표시를 조용히 거부해 SDK 프라미스가 영영 안 풀린다(간헐 '씹힘').
          라이브러리 공식 문서도 로딩 인디케이터 모달과의 동시 표시를 금지한다.
          (사진 피커 뒤 터치 먹통 때 세운 '짧은 수명 로딩 오버레이는 Modal 금지' 규칙과 동일) */}
      {socialModal !== null && (
        <View style={styles.socialModalOverlay}>
          <View style={styles.loaderCard}>
            {authSuccess ? (
              <>
                <Image source={EMOJI_CHECK} style={styles.loaderEmoji} />
                <Text style={styles.loaderText}>{t('login.loginSuccess')}</Text>
              </>
            ) : (
              <>
                <ActivityIndicator size="large" color="#EC34F7" />
                <Text style={styles.loaderText}>{t('login.signingIn')}</Text>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0F' }, // 온보딩과 동일 배경
  keyboardView: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingBottom: 48,
    paddingHorizontal: Spacing[6],
  },

  // Brand — eorth 워드마크 (온보딩과 동일)
  brandSection: {
    alignItems: 'center',
    marginTop: Spacing[6],
    marginBottom: Spacing[8],
    gap: Spacing[3],
  },
  tagline: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: '#9E9CA1',
    textAlign: 'center',
  },

  // Mode toggle — 유리 필 + 마젠타 활성 (온보딩 액센트)
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: BorderRadius.full,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: Spacing[6],
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: BorderRadius.full,
  },
  modeBtnActive: {
    backgroundColor: '#EC34F7',
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
    color: '#9E9CA1',
    letterSpacing: 0.3,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: Spacing[4],
    gap: Spacing[2],
  },
  inputBoxFocused: {
    borderColor: 'rgba(236,52,247,0.6)', // 온보딩 마젠타 액센트
    backgroundColor: 'rgba(236,52,247,0.05)',
  },
  inputBoxError: {
    borderColor: '#FF6B6B',
  },
  inputIcon: {
    width: 19,
    height: 19,
  },
  eyeIcon: {
    width: 21,
    height: 21,
    marginLeft: Spacing[1],
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
    color: '#EC34F7',
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
  legalBox: {
    marginTop: 10,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  legalTextCol: { flex: 1 },
  legalTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
  },
  legalDesc: {
    color: Colors.textMuted,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    lineHeight: 17,
    marginTop: 3,
  },
  legalView: {
    color: Colors.primaryLight,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
  },
  legalDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 14,
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
    // 고정 폭이 아니라 width:'100%'라 창 폭을 그대로 먹는다 — Modal은 루트 클램프 밖
    width: '100%',
    maxWidth: STAGE_MAX_W,
    backgroundColor: '#131018',
    borderRadius: BorderRadius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: Spacing[6],
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
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
    backgroundColor: 'rgba(236,52,247,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[2],
  },
  successIcon: {
    width: 34,
    height: 34,
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

  // 소셜 로그인 로딩 오버레이 — Modal이 아닌 절대위치 View(위 JSX 주석 참조).
  // zIndex/elevation으로 화면 내 최상단 보장(형제 요소들 위).
  socialModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 1, 15, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[6],
    zIndex: 100,
    elevation: 100,
  },
  loaderCard: {
    minWidth: 200,
    backgroundColor: '#131018',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 32,
    paddingHorizontal: 40,
    alignItems: 'center',
    gap: 16,
  },
  loaderEmoji: {
    width: 46,
    height: 46,
  },
  loaderText: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
});
