/**
 * 여행 DNA 결과 — 유형 라벨 + 7축 막대.
 *
 * 축 점수는 본인만 본다(서버 public_profiles에는 type_key만 실린다).
 * 온보딩에서 들어온 경우 '시작하기'가 메인으로 보내고, 그 외에는 뒤로 돌아간다.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { DNA_AXES, DNA_LABELS, DNA_QUESTIONS, type DnaAxisId } from '../constants/travelDna';
import { useTravelDna } from '../store/travelDnaStore';
import type { RootStackScreenProps } from '../navigation/types';

const C = { bg: '#0A0A0F', card: '#2E2E3B', neon: '#BF85FC', dim: '#A1A1B0', line: '#1A1A26' };

const AXIS_LABEL_KEY: Record<DnaAxisId, string> = {
  plan: 'dna.axisPlan', pace: 'dna.axisPace', terrain: 'dna.axisTerrain',
  budget: 'dna.axisBudget', purpose: 'dna.axisPurpose', crowd: 'dna.axisCrowd',
  company: 'dna.axisCompany',
};

export default function TravelDnaResultScreen({ navigation, route }: RootStackScreenProps<'TravelDnaResult'>) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { scores, label, answered, isFull, refresh } = useTravelDna();
  const fromOnboarding = route.params?.from === 'onboarding';
  const en = i18n.language.startsWith('en');
  const percent = Math.round((answered / DNA_QUESTIONS.length) * 100);

  // 계정 전환 시 스토어는 인메모리 clear()만 되고 재조회는 안 된다(다음 계정 데이터를
  // 어떤 화면이 요청해야 채워짐) — 결과 화면은 포커스마다 서버에서 다시 받아 그 갭을 메운다.
  useFocusEffect(
    React.useCallback(() => {
      refresh();
    }, [refresh])
  );

  return (
    <View style={[st.container, { paddingTop: insets.top + 12 }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Text style={st.title}>{t('dna.resultTitle')}</Text>

        <LinearGradient
          colors={['rgba(191,133,252,0.22)', 'rgba(107,33,168,0.18)']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={st.typeCard}
        >
          <Text style={st.typeText}>{en ? label.en : label.ko}</Text>
          <Text style={st.accuracy}>{t('dna.accuracy', { percent })}</Text>
        </LinearGradient>

        {DNA_AXES.map((axis) => {
          const v = scores[axis];
          const L = DNA_LABELS[axis];
          return (
            <View key={axis} style={st.axisRow}>
              <Text style={st.axisName}>{t(AXIS_LABEL_KEY[axis])}</Text>
              <View style={st.track}>
                <View style={[st.marker, { left: `${v}%` }]} />
              </View>
              <View style={st.poleRow}>
                <Text style={st.pole}>{en ? L.enAdjA : L.adjA}</Text>
                <Text style={st.pole}>{en ? L.enAdjB : L.adjB}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={[st.footer, { paddingBottom: insets.bottom + 16 }]}>
        {!isFull && (
          <TouchableOpacity
            style={st.primary}
            activeOpacity={0.85}
            onPress={() => navigation.replace('TravelDnaSurvey', { mode: 'full' })}
          >
            <Text style={st.primaryText}>{t('dna.continueSurvey')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => (fromOnboarding ? navigation.replace('Main') : navigation.goBack())}
        >
          <Text style={st.secondaryText}>{fromOnboarding ? t('common.done') : t('common.close')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 16 },
  typeCard: { borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 26, borderWidth: 1, borderColor: 'rgba(191,133,252,0.35)' },
  typeText: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  accuracy: { color: C.dim, fontSize: 12, marginTop: 8 },
  axisRow: { marginBottom: 20 },
  axisName: { color: C.dim, fontSize: 12, marginBottom: 8 },
  track: { height: 6, borderRadius: 3, backgroundColor: C.line, justifyContent: 'center' },
  marker: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: C.neon, marginLeft: -7 },
  poleRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  pole: { color: 'rgba(255,255,255,0.45)', fontSize: 11 },
  footer: { gap: 12, alignItems: 'center' },
  primary: { backgroundColor: C.neon, borderRadius: 999, paddingVertical: 15, paddingHorizontal: 40, alignSelf: 'stretch', alignItems: 'center' },
  primaryText: { color: '#0A0A0F', fontSize: 16, fontWeight: '800' },
  secondaryText: { color: C.dim, fontSize: 14, paddingVertical: 8 },
});
