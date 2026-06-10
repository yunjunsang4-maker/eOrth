import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
import { GoogleIcon, AppleIcon } from '../components/icons';
import type { RootStackScreenProps } from '../navigation/types';

const { width } = Dimensions.get('window');

type Props = RootStackScreenProps<'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { setSignUpMethod, setSignUpEmail, setNickname, resetSettings } = useSettings();
  const { resetRecords } = useRecords();
  const { resetConversations } = useDM();
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);
  const [confirmFocused, setConfirmFocused] = useState(false);

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

  const handleGooglePress = () => {
    setSocialModal('google');
    setSocialLoading(false);
    setAuthSuccess(false);
  };

  const handleApplePress = () => {
    setSocialModal('apple');
    setSocialLoading(false);
    setAuthSuccess(false);
  };

  // ─── 탈퇴 유예 계정 처리 ───
  // 로그인 성공 시 탈퇴 신청 여부를 확인한다.
  //  - 유예 기간(30일) 내 → 복구 여부를 묻고, 복구하면 데이터 그대로 Main 진입
  //  - 만료 → 영구 파기 후 새 계정 온보딩 진행
  // applySignup: 가입 정보(이메일·닉네임 등) 적용 콜백. 파기 후에도 다시 적용되도록 콜백으로 받는다.
  const purgeAllData = () => {
    resetRecords();
    resetSettings();
    resetConversations();
    clearPersistedStores().catch(() => {});
    cancelAccountDeletion().catch(() => {});
  };

  const proceedAfterAuth = async (applySignup: () => void) => {
    const pending = await getPendingDeletion();

    if (!pending) {
      applySignup();
      navigation.navigate('BasicInfo');
      return;
    }

    if (isDeletionExpired(pending)) {
      purgeAllData();
      applySignup();
      navigation.navigate('BasicInfo');
      return;
    }

    Alert.alert(
      '계정 복구',
      `탈퇴 신청된 계정입니다.\n지금 복구하면 여행 기록과 설정이 그대로 유지됩니다.\n(영구 삭제까지 ${daysUntilPurge(pending)}일 남음)`,
      [
        {
          text: '새로 시작',
          style: 'destructive',
          onPress: () => {
            purgeAllData();
            applySignup();
            navigation.navigate('BasicInfo');
          },
        },
        {
          text: '복구하기',
          onPress: () => {
            cancelAccountDeletion().catch(() => {});
            navigation.navigate('Main');
          },
        },
      ],
    );
  };

  const confirmSocialLogin = (emailStr: string, nameStr: string) => {
    setSocialLoading(true);
    setTimeout(() => {
      setAuthSuccess(true);
      setTimeout(() => {
        setSocialLoading(false);
        const provider = socialModal || 'google';
        setSocialModal(null);
        proceedAfterAuth(() => {
          setSignUpMethod(provider);
          setSignUpEmail(emailStr);
          setNickname(nameStr);
        });
      }, 800);
    }, 1200);
  };

  const handleForgotPassword = () => {
    setForgotEmail(email);
    setResetSuccess(false);
    setIsResetting(false);
    setForgotPasswordVisible(true);
  };

  const handleSendResetLink = () => {
    if (!forgotEmail.trim()) return;
    setIsResetting(true);
    setTimeout(() => {
      setIsResetting(false);
      setResetSuccess(true);
    }, 1500);
  };

  const isSignup = mode === 'signup';
  const canSubmit =
    email.trim().length > 0 &&
    password.length >= 6 &&
    (isSignup ? confirmPassword === password : true);

  const handleSubmit = () => {
    proceedAfterAuth(() => {
      setSignUpMethod('email');
      setSignUpEmail(email.trim() || 'user@eorth.app');
    });
  };

  return (
    <LinearGradient colors={['#0A0118', '#100620']} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
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
            <Text style={styles.tagline}>여행을 기록하고 나만의 지구본을 만들어요</Text>
          </View>

          {/* Mode toggle */}
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'signup' && styles.modeBtnActive]}
              onPress={() => setMode('signup')}
            >
              <Text style={[styles.modeBtnText, mode === 'signup' && styles.modeBtnTextActive]}>
                회원가입
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'login' && styles.modeBtnActive]}
              onPress={() => setMode('login')}
            >
              <Text style={[styles.modeBtnText, mode === 'login' && styles.modeBtnTextActive]}>
                로그인
              </Text>
            </TouchableOpacity>
          </View>

          {/* Email / Password form */}
          <View style={styles.form}>
            {/* Email */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>이메일</Text>
              <View style={[styles.inputBox, emailFocused && styles.inputBoxFocused]}>
                <Text style={styles.inputIcon}>✉️</Text>
                <TextInput
                  style={styles.input}
                  placeholder="example@email.com"
                  placeholderTextColor={Colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>비밀번호</Text>
              <View style={[styles.inputBox, pwFocused && styles.inputBoxFocused]}>
                <Text style={styles.inputIcon}>🔒</Text>
                <TextInput
                  style={styles.input}
                  placeholder="6자 이상 입력하세요"
                  placeholderTextColor={Colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  onFocus={() => setPwFocused(true)}
                  onBlur={() => setPwFocused(false)}
                />
              </View>
              {isSignup && password.length > 0 && password.length < 6 && (
                <Text style={styles.fieldHint}>비밀번호는 6자 이상이어야 해요</Text>
              )}
            </View>

            {/* Confirm password (signup only) */}
            {isSignup && (
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>비밀번호 확인</Text>
                <View style={[styles.inputBox, confirmFocused && styles.inputBoxFocused,
                  confirmPassword.length > 0 && confirmPassword !== password && styles.inputBoxError,
                ]}>
                  <Text style={styles.inputIcon}>🔑</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="비밀번호를 다시 입력하세요"
                    placeholderTextColor={Colors.textMuted}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    onFocus={() => setConfirmFocused(true)}
                    onBlur={() => setConfirmFocused(false)}
                  />
                </View>
                {confirmPassword.length > 0 && confirmPassword !== password && (
                  <Text style={[styles.fieldHint, { color: '#FF6B6B' }]}>
                    비밀번호가 일치하지 않아요
                  </Text>
                )}
              </View>
            )}

            {/* Forgot password (login only) */}
            {!isSignup && (
              <TouchableOpacity style={styles.forgotBtn} onPress={handleForgotPassword}>
                <Text style={styles.forgotText}>비밀번호를 잊으셨나요?</Text>
              </TouchableOpacity>
            )}

            {/* Submit button */}
            <PrimaryButton
              label={isSignup ? '이메일로 시작하기' : '로그인'}
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={styles.submitBtn}
            />
          </View>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>또는</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social login options */}
          <View style={styles.socialSection}>
            {/* Google */}
            <TouchableOpacity
              style={styles.socialBtn}
              activeOpacity={0.85}
              onPress={handleGooglePress}
            >
              <GoogleIcon size={20} />
              <Text style={styles.socialBtnText}>Google로 계속하기</Text>
            </TouchableOpacity>

            {/* Apple */}
            <TouchableOpacity
              style={[styles.socialBtn, styles.appleBtn]}
              activeOpacity={0.85}
              onPress={handleApplePress}
            >
              <AppleIcon size={20} color="#FFFFFF" />
              <Text style={[styles.socialBtnText, { color: Colors.white }]}>
                Apple로 계속하기
              </Text>
            </TouchableOpacity>
          </View>

          {/* Terms */}
          <Text style={styles.termsText}>
            {isSignup
              ? '가입 시 이용약관 및 개인정보 처리방침에 동의하시게 됩니다'
              : '계속 진행하면 이용약관에 동의하는 것으로 간주됩니다'}
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>비밀번호 재설정</Text>
              <TouchableOpacity
                onPress={() => setForgotPasswordVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {!resetSuccess ? (
              <View style={styles.modalBody}>
                <Text style={styles.modalDesc}>
                  가입하신 이메일 주소를 입력하시면{'\n'}비밀번호 재설정 링크를 보내드립니다.
                </Text>

                <View style={[styles.fieldWrap, { width: '100%' }]}>
                  <Text style={styles.fieldLabel}>이메일 주소</Text>
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
                      onFocus={() => setForgotEmailFocused(true)}
                      onBlur={() => setForgotEmailFocused(false)}
                      editable={!isResetting}
                    />
                  </View>
                </View>

                {isResetting ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                    <Text style={styles.loadingText}>재설정 링크 전송 중...</Text>
                  </View>
                ) : (
                  <PrimaryButton
                    label="재설정 링크 보내기"
                    onPress={handleSendResetLink}
                    disabled={!forgotEmail.trim() || !forgotEmail.includes('@')}
                    style={styles.modalSubmitBtn}
                  />
                )}
              </View>
            ) : (
              <View style={styles.modalBody}>
                <View style={styles.successIconWrap}>
                  <Text style={styles.successIcon}>✉️</Text>
                </View>
                <Text style={styles.successTitle}>재설정 메일 발송 완료</Text>
                <Text style={styles.successDesc}>
                  {forgotEmail} 주소로{'\n'}비밀번호 재설정 링크가 발송되었습니다.{'\n'}받은 편지함을 확인해 주세요.
                </Text>
                <PrimaryButton
                  label="확인"
                  onPress={() => setForgotPasswordVisible(false)}
                  style={styles.modalSubmitBtn}
                />
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Google Sign-In Mock Modal */}
      <Modal
        visible={socialModal === 'google'}
        transparent
        animationType="fade"
        onRequestClose={() => setSocialModal(null)}
      >
        <View style={styles.socialModalOverlay}>
          <View style={styles.googleContainer}>
            {/* Logo */}
            <View style={styles.googleLogoRow}>
              <GoogleIcon size={20} />
              <Text style={styles.googleBrandText}>Google</Text>
            </View>

            <Text style={styles.googleTitle}>계정 선택</Text>
            <Text style={styles.googleSubtitle}>eOrth(으)로 이동</Text>

            {socialLoading ? (
              <View style={styles.socialLoadingWrap}>
                {authSuccess ? (
                  <View style={styles.socialSuccessBadge}>
                    <Text style={{ fontSize: 24, marginBottom: 8 }}>✅</Text>
                    <Text style={styles.socialSuccessText}>로그인 성공</Text>
                  </View>
                ) : (
                  <>
                    <ActivityIndicator size="large" color="#4285F4" />
                    <Text style={styles.socialLoadingText}>Google 계정 연동 중...</Text>
                  </>
                )}
              </View>
            ) : (
              <View style={styles.googleBody}>
                {/* Account row */}
                <TouchableOpacity
                  style={styles.googleAccountRow}
                  onPress={() => confirmSocialLogin('yunjunsung@gmail.com', '윤준상')}
                >
                  <View style={styles.googleAvatar}>
                    <Text style={styles.googleAvatarText}>윤</Text>
                  </View>
                  <View style={styles.googleAccountInfo}>
                    <Text style={styles.googleAccountName}>윤준상</Text>
                    <Text style={styles.googleAccountEmail}>yunjunsung@gmail.com</Text>
                  </View>
                </TouchableOpacity>

                {/* Use another account */}
                <TouchableOpacity
                  style={[styles.googleAccountRow, { borderBottomWidth: 0 }]}
                  onPress={() => confirmSocialLogin('newuser@gmail.com', '새 사용자')}
                >
                  <View style={[styles.googleAvatar, styles.googleAvatarOther]}>
                    <Text style={styles.googleAvatarTextOther}>👤</Text>
                  </View>
                  <View style={styles.googleAccountInfo}>
                    <Text style={styles.googleAccountNameOther}>다른 계정 사용</Text>
                  </View>
                </TouchableOpacity>

                <Text style={styles.googleDisclaimer}>
                  eOrth 서비스 제공을 위해 Google에서 귀하의 이름, 이메일 주소, 프로필 사진을 eOrth 서비스와 공유합니다.
                </Text>
              </View>
            )}

            {!socialLoading && (
              <TouchableOpacity
                onPress={() => setSocialModal(null)}
                style={styles.googleCancelBtn}
              >
                <Text style={styles.googleCancelText}>취소</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Apple Sign-In Mock Modal */}
      <Modal
        visible={socialModal === 'apple'}
        transparent
        animationType="slide"
        onRequestClose={() => setSocialModal(null)}
      >
        <View style={styles.appleModalOverlay}>
          <View style={styles.appleSheet}>
            {/* Handle bar */}
            <View style={styles.appleHandle} />

            <View style={styles.appleHeader}>
              <AppleIcon size={32} color="#FFFFFF" />
              <Text style={styles.appleTitle}>Apple ID</Text>
              <Text style={styles.appleSubtitle}>eOrth에 로그인</Text>
            </View>

            {socialLoading ? (
              <View style={styles.appleLoadingWrap}>
                {authSuccess ? (
                  <View style={styles.appleSuccessGlow}>
                    <Text style={{ fontSize: 40, color: '#FFFFFF' }}></Text>
                    <Text style={styles.appleSuccessText}>인증 완료</Text>
                  </View>
                ) : (
                  <View style={styles.appleFaceIdScan}>
                    <View style={styles.faceIdRing}>
                      <Text style={{ fontSize: 32, color: '#00D2FF' }}>👤</Text>
                    </View>
                    <Text style={styles.appleFaceIdText}>Face ID를 통한 인증 중...</Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.appleBody}>
                {/* Account Details card */}
                <View style={styles.appleCard}>
                  <View style={styles.appleRow}>
                    <Text style={styles.appleLabel}>계정</Text>
                    <Text style={styles.appleValue}>윤준상 (yunjunsung@icloud.com)</Text>
                  </View>
                  <View style={styles.appleRowDivider} />
                  <View style={styles.appleRow}>
                    <Text style={styles.appleLabel}>이메일</Text>
                    <Text style={styles.appleValue}>나의 이메일 공유</Text>
                  </View>
                </View>

                <Text style={styles.appleDisclaimer}>
                  "사용자 ID로 계속"을 클릭하면 Face ID 또는 비밀번호를 통해 eOrth 서비스에 가입하고 이용약관 및 개인정보 처리방침에 동의하게 됩니다.
                </Text>

                <TouchableOpacity
                  style={styles.appleSubmitBtn}
                  onPress={() => confirmSocialLogin('yunjunsung@icloud.com', '윤준상')}
                >
                  <LinearGradient
                    colors={['#007AFF', '#0055D0']}
                    style={styles.appleSubmitGrad}
                  >
                    <Text style={styles.appleSubmitText}>사용자 ID로 계속</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setSocialModal(null)}
                  style={styles.appleCancelBtn}
                >
                  <Text style={styles.appleCancelText}>취소</Text>
                </TouchableOpacity>
              </View>
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
    paddingTop: 64,
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
  googleIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleG: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: '#4285F4',
  },
  appleIcon: {
    fontSize: 18,
    color: Colors.white,
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
  googleContainer: {
    width: '100%',
    backgroundColor: '#1E222D',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 24,
    alignItems: 'center',
  },
  googleLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  googleBrandText: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.white,
  },
  googleTitle: {
    fontSize: 22,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.white,
    marginBottom: 4,
  },
  googleSubtitle: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginBottom: 24,
  },
  googleBody: {
    width: '100%',
    marginBottom: 20,
  },
  googleAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  googleAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3F51B5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleAvatarText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  googleAccountInfo: {
    flex: 1,
  },
  googleAccountName: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.white,
  },
  googleAccountEmail: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
  },
  googleAvatarOther: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  googleAvatarTextOther: {
    fontSize: 16,
  },
  googleAccountNameOther: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  googleDisclaimer: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    lineHeight: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  googleCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  googleCancelText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  socialLoadingWrap: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  socialLoadingText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  socialSuccessBadge: {
    alignItems: 'center',
    gap: 8,
  },
  socialSuccessText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: '#00E676',
  },

  // Apple Sheet
  appleModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 1, 15, 0.75)',
    justifyContent: 'flex-end',
  },
  appleSheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    alignItems: 'center',
    width: '100%',
  },
  appleHandle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 20,
  },
  appleHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  appleTitle: {
    fontSize: 20,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.white,
    marginTop: 8,
  },
  appleSubtitle: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  appleBody: {
    width: '100%',
    alignItems: 'center',
  },
  appleCard: {
    width: '100%',
    backgroundColor: '#2C2C2E',
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  appleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    alignItems: 'center',
  },
  appleRowDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  appleLabel: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    width: 60,
  },
  appleValue: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.white,
    flex: 1,
    textAlign: 'right',
  },
  appleDisclaimer: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    lineHeight: 16,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  appleSubmitBtn: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  appleSubmitGrad: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  appleSubmitText: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
  },
  appleCancelBtn: {
    paddingVertical: 12,
  },
  appleCancelText: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.regular,
    color: '#007AFF', // iOS blue
  },
  appleLoadingWrap: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleFaceIdScan: {
    alignItems: 'center',
    gap: 16,
  },
  faceIdRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: '#00D2FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00D2FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 5,
  },
  appleFaceIdText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  appleSuccessGlow: {
    alignItems: 'center',
    gap: 12,
  },
  appleSuccessText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.white,
  },
});
