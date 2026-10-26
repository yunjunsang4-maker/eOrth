import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Text } from '../ui/Text';
import { SettingsChevronIcon } from '../components/icons/SettingsIcons';
import {
  SETTINGS_COLORS,
  SettingsHeader,
  SettingsCard,
  SettingsDivider,
  settingsText,
} from '../components/settings/SettingsUI';
import { useTranslation } from 'react-i18next';
import type { RootStackScreenProps } from '../navigation/types';

// 설정 > FAQ — 질문/답변 아코디언. 항목은 i18n faq.q1~qN/a1~aN 키로 관리.
// faq.q1~qN / a1~aN 개수. 항목을 추가·삭제하면 ko/en 양쪽 문구와 함께 이 값을 맞출 것.
const FAQ_COUNT = 13;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Q 표시·펼친 질문은 설정 디자인의 보라(#AC6FFF — 그룹 라벨·선택 체크와 같은 색)로 고정한다.
const COLORS = SETTINGS_COLORS;

export default function FAQScreen({ navigation }: RootStackScreenProps<'FAQ'>) {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenIndex((cur) => (cur === i ? null : i));
  };

  return (
    <SafeAreaView style={st.safeArea}>
      <SettingsHeader title={t('faq.title')} onBack={() => navigation.goBack()} />

      <ScrollView style={st.scroll} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        <SettingsCard>
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
                  {/* 설정 행 꺾쇠를 아래(닫힘)·위(펼침)로 돌려 쓴다 */}
                  <View style={open ? st.chevronUp : st.chevronDown}><SettingsChevronIcon /></View>
                </TouchableOpacity>
                {open && (
                  <View style={st.aWrap}>
                    <Text style={st.aText}>{t(`faq.a${i + 1}`)}</Text>
                  </View>
                )}
                {i < FAQ_COUNT - 1 && <SettingsDivider />}
              </React.Fragment>
            );
          })}
        </SettingsCard>

        {/* 추가 문의 안내 */}
        <Text style={[settingsText.groupNote, st.footer]}>{t('faq.footer')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bg },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 21, paddingBottom: 40 },

  // 질문 행 — 설정 행과 같은 최소 높이 60·좌 20 / 우 19·글자 14 흰색
  qRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingLeft: 20,
    paddingRight: 19,
    paddingVertical: 12,
  },
  qMark: { fontSize: 14, fontWeight: '800', color: COLORS.label, width: 14 },
  qText: { flex: 1, fontSize: 14, fontWeight: '500', color: COLORS.white, lineHeight: 20 },
  qTextOn: { fontWeight: '700', color: COLORS.label },
  chevronDown: { transform: [{ rotate: '90deg' }] },
  chevronUp: { transform: [{ rotate: '-90deg' }] },
  // 답변 — 질문 글자 시작(20+14+12=46)에 맞춰 들여쓰고 흰 70%
  aWrap: {
    paddingLeft: 46,
    paddingRight: 19,
    paddingBottom: 18,
  },
  aText: { fontSize: 13, color: COLORS.text70, lineHeight: 20 },

  footer: { textAlign: 'center', marginTop: 18 },
});
