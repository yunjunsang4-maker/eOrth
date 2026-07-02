import React, { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { PrimaryButton } from '../components/ui';
import { updatePassword, signOut } from '../services/auth';
import type { RootStackScreenProps } from '../navigation/types';

type Props = RootStackScreenProps<'ResetPassword'>;

// 비밀번호 재설정 메일 링크(딥링크)로 복구 세션이 만들어진 뒤 새 비밀번호를 설정하는 화면.
export default function ResetPasswordScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const canSubmit = !submitting && password.length >= 6 && confirm === password;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const result = await updatePassword(password);
    setSubmitting(false);
    if (!result.ok) {
      Alert.alert(t('login.passwordUpdateFailed'), result.error ?? '');
      return;
    }
    // 변경 완료 → 세션 종료 후 새 비밀번호로 로그인하도록 안내
    Alert.alert(t('login.passwordChangedTitle'), t('login.passwordChangedMsg'), [
      {
        text: t('common.confirm'),
        onPress: async () => {
          await signOut();
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
      },
    ]);
  };

  return (
    <LinearGradient colors={['#0A0118', '#100620']} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 48 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>{t('login.setNewPasswordTitle')}</Text>
          <Text style={styles.subtitle}>{t('login.setNewPasswordDesc')}</Text>

          {/* 새 비밀번호 */}
          <View style={styles.field}>
            <Text style={styles.label}>{t('login.newPassword')}</Text>
            <View style={styles.inputBox}>
              <TextInput
                style={styles.input}
                placeholder={t('login.passwordPlaceholder')}
                placeholderTextColor={Colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
              >
                <Text style={styles.eye}>{showPassword ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>
            {password.length > 0 && password.length < 6 && (
              <Text style={styles.hint}>{t('login.passwordHint')}</Text>
            )}
          </View>

          {/* 새 비밀번호 확인 */}
          <View style={styles.field}>
            <Text style={styles.label}>{t('login.confirmPassword')}</Text>
            <View style={styles.inputBox}>
              <TextInput
                style={styles.input}
                placeholder={t('login.confirmPlaceholder')}
                placeholderTextColor={Colors.textMuted}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>
            {confirm.length > 0 && confirm !== password && (
              <Text style={[styles.hint, { color: '#FF6B6B' }]}>{t('login.passwordMismatch')}</Text>
            )}
          </View>

          <PrimaryButton
            label={t('login.setNewPasswordSubmit')}
            onPress={handleSubmit}
            disabled={!canSubmit}
            loading={submitting}
            style={{ marginTop: Spacing[4] }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing[6], paddingBottom: 48 },
  title: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing[2],
  },
  subtitle: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing[8],
  },
  field: { marginBottom: Spacing[5] },
  label: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textSecondary,
    marginBottom: Spacing[2],
  },
  inputBox: {
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
  eye: { fontSize: 18, paddingLeft: Spacing[1] },
  hint: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
    marginTop: Spacing[1],
    paddingLeft: Spacing[1],
  },
});
