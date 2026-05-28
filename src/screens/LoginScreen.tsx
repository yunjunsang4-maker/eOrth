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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { PrimaryButton } from '../components/ui';

const { width } = Dimensions.get('window');

interface Props {
  navigation: any;
}

export default function LoginScreen({ navigation }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);
  const [confirmFocused, setConfirmFocused] = useState(false);

  const isSignup = mode === 'signup';
  const canSubmit =
    email.trim().length > 0 &&
    password.length >= 6 &&
    (isSignup ? confirmPassword === password : true);

  const handleSubmit = () => {
    navigation.navigate('BasicInfo');
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
            <Text style={styles.brandName}>eOrth</Text>
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
              <TouchableOpacity style={styles.forgotBtn}>
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
              onPress={() => navigation.navigate('BasicInfo')}
            >
              <View style={styles.googleIconWrap}>
                <Text style={styles.googleG}>G</Text>
              </View>
              <Text style={styles.socialBtnText}>Google로 계속하기</Text>
            </TouchableOpacity>

            {/* Apple */}
            <TouchableOpacity
              style={[styles.socialBtn, styles.appleBtn]}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('BasicInfo')}
            >
              <Text style={styles.appleIcon}></Text>
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
  brandName: {
    fontSize: 32,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.white,
    letterSpacing: 2,
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
});
