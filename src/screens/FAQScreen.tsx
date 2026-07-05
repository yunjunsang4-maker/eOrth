import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { RootStackScreenProps } from '../navigation/types';

// 설정 > FAQ — 질문/답변 아코디언. 항목은 i18n faq.q1~qN/a1~aN 키로 관리.
const FAQ_COUNT = 10;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

export default function FAQScreen({ navigation }: RootStackScreenProps<'FAQ'>) {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenIndex((cur) => (cur === i ? null : i));
  };

  return (
    <SafeAreaView style={st.safeArea}>
      {/* 상단 헤더 — 설정 화면과 동일 패턴 */}
      <View style={st.header}>
        <TouchableOpacity style={st.backBtn} activeOpacity={0.7} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={t('settings.back')}>
          <Text style={st.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>{t('faq.title')}</Text>
        <View style={st.headerPlaceholder} />
      </View>

      <ScrollView style={st.scroll} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        <View style={st.list}>
          {Array.from({ length: FAQ_COUNT }, (_, i) => {
            const open = openIndex === i;
            return (
              <React.Fragment key={i}>
                <TouchableOpacity
                  style={st.qRow}
                  activeOpacity={0.7}
                  onPress={() => toggle(i)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                >
                  <Text style={st.qMark}>Q</Text>
                  <Text style={[st.qText, open && st.qTextOn]}>{t(`faq.q${i + 1}`)}</Text>
                  <Text style={[st.chevron, open && st.chevronOn]}>⌄</Text>
                </TouchableOpacity>
                {open && (
                  <View style={st.aWrap}>
                    <Text style={st.aText}>{t(`faq.a${i + 1}`)}</Text>
                  </View>
                )}
                {i < FAQ_COUNT - 1 && <View style={st.divider} />}
              </React.Fragment>
            );
          })}
        </View>

        {/* 추가 문의 안내 */}
        <Text style={st.footer}>{t('faq.footer')}</Text>
      </ScrollView>
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

  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 },

  list: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    overflow: 'hidden',
  },
  qRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  qMark: { fontSize: 13, fontWeight: '800', color: COLORS.purpleNeon, width: 16 },
  qText: { flex: 1, fontSize: 13, color: COLORS.white, lineHeight: 19 },
  qTextOn: { fontWeight: '700', color: COLORS.purpleNeon },
  chevron: { fontSize: 16, color: COLORS.textMuted },
  chevronOn: { transform: [{ rotate: '180deg' }], color: COLORS.purpleNeon },
  aWrap: {
    paddingHorizontal: 16,
    paddingLeft: 42,
    paddingBottom: 16,
  },
  aText: { fontSize: 12.5, color: COLORS.textDim, lineHeight: 19 },
  divider: { height: 1, backgroundColor: COLORS.divider, marginLeft: 42 },

  footer: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 18,
    lineHeight: 17,
  },
});
