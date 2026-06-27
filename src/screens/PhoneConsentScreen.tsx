import React, { useState } from 'react';
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

type Props = RootStackScreenProps<'PhoneConsent'>;

export default function PhoneConsentScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { phoneMatchConsent, setPhoneMatchConsent } = useSettings();
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  };

  const digits = phone.replace(/\D/g, '');
  const valid = digits.length >= 9;

  const handleAgree = async () => {
    if (!valid || busy) return;
    buzz('light');
    setBusy(true);
    try {
      // 백엔드 연결 시 해시 저장(나를 연락처로 찾을 수 있게). 미연결이어도 동의는 로컬 저장.
      if (isSupabaseConfigured) {
        const ok = await saveMyPhoneHash(phone);
        if (!ok) {
          showToast('저장에 실패했어요. 로그인 상태를 확인해주세요.');
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
      showToast('연락처 친구 찾기를 껐어요');
      setTimeout(() => navigation.goBack(), 600);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.container}>
      {/* 헤더 */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="뒤로 가기">
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>연락처로 친구 찾기</Text>
        <View style={s.backBtn} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.emoji}>📇</Text>
          <Text style={s.title}>전화번호로 친구를 찾고{'\n'}연결돼요</Text>
          <Text style={s.desc}>
            내 전화번호를 등록하면, 내 번호를 저장한 친구가 나를 쉽게 찾을 수 있어요.
            반대로 내 연락처에 있는 eOrth 사용자도 찾아드려요.
          </Text>

          {/* 개인정보 안내 */}
          <View style={s.privacyBox}>
            <Text style={s.privacyLine}>🔒 전화번호는 <Text style={s.bold}>복원 불가능한 해시(SHA-256)</Text>로만 저장돼요.</Text>
            <Text style={s.privacyLine}>🙈 원본 번호는 서버에 저장되지 않아요.</Text>
            <Text style={s.privacyLine}>⚙️ 언제든 이 화면에서 끌 수 있어요.</Text>
          </View>

          {/* 입력 */}
          <Text style={s.inputLabel}>내 전화번호</Text>
          <TextInput
            style={s.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="010-1234-5678"
            placeholderTextColor={C.dim}
            keyboardType="phone-pad"
            maxLength={20}
            accessibilityLabel="내 전화번호 입력"
          />

          <TouchableOpacity
            style={[s.agreeBtn, (!valid || busy) && s.agreeBtnDisabled]}
            onPress={handleAgree}
            disabled={!valid || busy}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="동의하고 연결하기"
          >
            {busy ? (
              <ActivityIndicator color={C.white} />
            ) : (
              <Text style={s.agreeBtnText}>동의하고 연결하기</Text>
            )}
          </TouchableOpacity>

          {phoneMatchConsent && (
            <TouchableOpacity style={s.disableBtn} onPress={handleDisable} disabled={busy} activeOpacity={0.8}>
              <Text style={s.disableBtnText}>연락처 친구 찾기 끄기</Text>
            </TouchableOpacity>
          )}

          <Text style={s.footnote}>
            계속하면 위 안내에 동의하는 것으로 간주됩니다.
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
