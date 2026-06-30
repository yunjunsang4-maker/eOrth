import React, { useState, useRef, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../store/settingsStore';
import { saveMyPhoneHash, deleteMyPhoneHash } from '../services/profile';
import { isSupabaseConfigured } from '../services/supabase';
import { buzz } from '../utils/haptics';
import Toast from '../components/Toast';
import type { RootStackScreenProps } from '../navigation/types';

const C = {
  bg: '#0A0A0F',
  card: '#1E1E2E',
  accent: '#BF85FC',
  accentDark: '#6B21A8',
  dim: '#A1A1B0',
  white: '#FFFFFF',
  gray: '#3A3A4A',
};

/** 한국 휴대폰 번호 자동 하이픈 (010-1234-5678) */
function formatKoreanPhone(raw: string): string {
  let n = raw.replace(/\D/g, '');
  // +82 10... → 010... 먼저 보정한 뒤 자릿수 제한 (마지막 숫자 손실 방지)
  if (n.startsWith('82')) n = '0' + n.slice(2);
  const d = n.slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

type Props = RootStackScreenProps<'PhoneConsent'>;

export default function PhoneConsentScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { phoneMatchConsent, setPhoneMatchConsent } = useSettings();
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(msg);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2000);
  };

  // 언마운트 시 타이머 정리 — 사라진 화면에서 setState 경고 방지
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (navTimer.current) clearTimeout(navTimer.current);
  }, []);

  const digits = phone.replace(/\D/g, '');
  const valid = digits.length === 10 || digits.length === 11; // 한국 휴대폰(10~11자리)

  const handleAgree = async () => {
    if (!valid || busy) return;
    buzz('light');
    setBusy(true);
    try {
      // 백엔드 연결 시 해시 저장(나를 연락처로 찾을 수 있게). 미연결이어도 동의는 로컬 저장.
      if (isSupabaseConfigured) {
        const ok = await saveMyPhoneHash(phone);
        if (!ok) {
          showToast(t('friends.saveFailToast'));
          setBusy(false);
          return;
        }
      }
      setPhoneMatchConsent(true);
      navigation.goBack();
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    buzz('light');
    setBusy(true);
    try {
      await deleteMyPhoneHash();
      setPhoneMatchConsent(false);
      showToast(t('friends.phoneOffToast'));
      navTimer.current = setTimeout(() => navigation.goBack(), 600);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.container}>
      {/* 헤더 */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={t('comp2.backA11y')}>
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('friends.phoneTitle')}</Text>
        <View style={s.backBtn} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.emoji}>📇</Text>
          <Text style={s.title}>{t('friends.phoneHeading')}</Text>
          <Text style={s.desc}>
            {t('friends.phoneDesc')}
          </Text>

          {/* 개인정보 안내 */}
          <View style={s.privacyBox}>
            <Text style={s.privacyLine}>{t('friends.privacyPrefix')}<Text style={s.bold}>{t('friends.privacyBold')}</Text>{t('friends.privacySuffix')}</Text>
            <Text style={s.privacyLine}>{t('friends.privacyLine2')}</Text>
            <Text style={s.privacyLine}>{t('friends.privacyLine3')}</Text>
          </View>

          {/* 입력 */}
          <Text style={s.inputLabel}>{t('friends.myPhone')}</Text>
          <TextInput
            style={s.input}
            value={phone}
            onChangeText={(v) => setPhone(formatKoreanPhone(v))}
            placeholder="010-1234-5678"
            placeholderTextColor={C.dim}
            keyboardType="phone-pad"
            maxLength={13}
            accessibilityLabel={t('friends.myPhoneA11y')}
          />

          <TouchableOpacity
            style={[s.agreeBtn, (!valid || busy) && s.agreeBtnDisabled]}
            onPress={handleAgree}
            disabled={!valid || busy}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('friends.agreeConnect')}
          >
            {busy ? (
              <ActivityIndicator color={C.white} />
            ) : (
              <Text style={s.agreeBtnText}>{t('friends.agreeConnect')}</Text>
            )}
          </TouchableOpacity>

          {phoneMatchConsent && (
            <TouchableOpacity style={s.disableBtn} onPress={handleDisable} disabled={busy} activeOpacity={0.8}>
              <Text style={s.disableBtnText}>{t('friends.disablePhone')}</Text>
            </TouchableOpacity>
          )}

          <Text style={s.footnote}>
            {t('friends.consentFootnote')}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <Toast visible={toastVisible} message={toastMessage} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: { width: 40, alignItems: 'center' },
  backIcon: { fontSize: 32, color: C.white, lineHeight: 36 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.white },

  scroll: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40, alignItems: 'center' },
  emoji: { fontSize: 52, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: C.white, textAlign: 'center', lineHeight: 30, marginBottom: 12 },
  desc: { fontSize: 14, color: C.dim, textAlign: 'center', lineHeight: 21, marginBottom: 20 },

  privacyBox: {
    width: '100%',
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    gap: 8,
    marginBottom: 24,
  },
  privacyLine: { fontSize: 13, color: '#D4D4DE', lineHeight: 19 },
  bold: { fontWeight: '700', color: C.white },

  inputLabel: { alignSelf: 'flex-start', fontSize: 13, fontWeight: '600', color: C.dim, marginBottom: 8 },
  input: {
    width: '100%',
    backgroundColor: C.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: C.white,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 20,
  },
  agreeBtn: {
    width: '100%',
    backgroundColor: C.accentDark,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agreeBtnDisabled: { backgroundColor: C.gray, opacity: 0.7 },
  agreeBtnText: { fontSize: 15, fontWeight: '700', color: C.white },
  disableBtn: { marginTop: 16, paddingVertical: 10 },
  disableBtnText: { fontSize: 13, color: '#FF6B6B', fontWeight: '600' },
  footnote: { fontSize: 11, color: C.dim, textAlign: 'center', marginTop: 20, lineHeight: 16 },
});
