import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { submitFeedback } from '../services/feedback';
import type { RootStackScreenProps } from '../navigation/types';

// 설정 > 피드백 보내기 — 인앱 폼(Supabase feedback 테이블 저장, 이메일 불필요)
const MAX_LEN = 1000;

const COLORS = {
  bg: '#0A0A0F',
  card: 'rgba(46,46,59,0.45)',
  cardBorder: 'rgba(255,255,255,0.08)',
  divider: '#1A1A26',
  purpleNeon: '#BF85FC',
  white: '#FFFFFF',
  textDim: '#A1A1B0',
  textMuted: '#8B8B9E',
};

export default function FeedbackScreen({ navigation }: RootStackScreenProps<'Feedback'>) {
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const canSend = content.trim().length > 0 && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    const ok = await submitFeedback(content);
    setSending(false);
    if (ok) {
      Alert.alert(t('feedback.doneTitle'), t('feedback.doneMsg'), [
        { text: t('common.confirm'), onPress: () => navigation.goBack() },
      ]);
    } else {
      // 미설정/비로그인/네트워크 오류 공통 — 입력 내용은 유지해 재시도 가능하게
      Alert.alert(t('feedback.failTitle'), t('feedback.failMsg'));
    }
  };

  return (
    <SafeAreaView style={st.safeArea}>
      {/* 상단 헤더 — 설정 화면과 동일 패턴 */}
      <View style={st.header}>
        <TouchableOpacity style={st.backBtn} activeOpacity={0.7} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={t('settings.back')}>
          <Text style={st.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>{t('feedback.title')}</Text>
        <View style={st.headerPlaceholder} />
      </View>

      <KeyboardAvoidingView
        style={st.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={st.desc}>{t('feedback.desc')}</Text>

        <View style={st.inputCard}>
          <TextInput
            style={st.input}
            value={content}
            onChangeText={(v) => setContent(v.slice(0, MAX_LEN))}
            placeholder={t('feedback.placeholder')}
            placeholderTextColor={COLORS.textMuted}
            multiline
            textAlignVertical="top"
            maxLength={MAX_LEN}
            editable={!sending}
          />
          <Text style={st.counter}>{content.length}/{MAX_LEN}</Text>
        </View>

        <TouchableOpacity
          style={[st.sendBtn, !canSend && st.sendBtnDisabled]}
          activeOpacity={0.85}
          onPress={handleSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel={t('feedback.sendA11y')}
        >
          {sending ? (
            <ActivityIndicator color={COLORS.bg} />
          ) : (
            <Text style={st.sendBtnTxt}>{t('feedback.send')}</Text>
          )}
        </TouchableOpacity>

        <Text style={st.note}>{t('feedback.note')}</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bg },

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
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 30, color: COLORS.white, lineHeight: 36 },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.white },
  headerPlaceholder: { width: 40 },

  body: { flex: 1, paddingHorizontal: 16, paddingTop: 20 },
  desc: { fontSize: 13, color: COLORS.textDim, lineHeight: 19, marginBottom: 16 },

  inputCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 14,
  },
  input: {
    minHeight: 160,
    maxHeight: 280,
    fontSize: 14,
    color: COLORS.white,
    lineHeight: 21,
  },
  counter: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right', marginTop: 6 },

  sendBtn: {
    height: 50,
    borderRadius: 12,
    backgroundColor: COLORS.purpleNeon,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnTxt: { fontSize: 15, fontWeight: '700', color: COLORS.bg },

  note: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center', marginTop: 14, lineHeight: 16 },
});
