/**
 * 여행 DNA 설문 — 전체(36문항)와 온보딩 축약판(7문항) 공용.
 *
 * 한 화면에 한 문항. 고르면 바로 다음으로 넘어간다(확인 버튼 없음) —
 * 36문항에서 탭이 두 배가 되면 완주율이 떨어진다.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { DNA_QUESTIONS, ONBOARDING_QUESTION_IDS } from '../constants/travelDna';
import { useTravelDna } from '../store/travelDnaStore';
import type { DnaAnswers } from '../utils/travelDnaScore';
import type { RootStackScreenProps } from '../navigation/types';

const C = { bg: '#0A0A0F', card: '#2E2E3B', neon: '#BF85FC', dim: '#A1A1B0', line: '#1A1A26' };

export default function TravelDnaSurveyScreen({ navigation, route }: RootStackScreenProps<'TravelDnaSurvey'>) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { answers: saved, submit } = useTravelDna();
  const onboarding = route.params?.mode === 'onboarding';

  const questions = useMemo(
    () => (onboarding
      ? DNA_QUESTIONS.filter((q) => ONBOARDING_QUESTION_IDS.includes(q.id))
      : DNA_QUESTIONS),
    [onboarding]
  );

  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<DnaAnswers>(saved);
  const [saving, setSaving] = useState(false);
  const q = questions[idx];
  const text = i18n.language.startsWith('en') ? q.en : q.ko;

  // 스토어의 answers는 마운트 후 로컬 캐시 → 서버 순으로 비동기 채워진다.
  // 이 화면이 그 로드보다 먼저 마운트되면 초기 useState(saved)는 빈 값으로 굳는다.
  // 아직 사용자가 아무것도 고르지 않았을 때(touched 이전)에 한해 saved 도착을 반영한다 —
  // 가드 없이 매번 반영하면 답하는 도중 스토어 갱신이 방금 고른 선택을 되돌린다.
  const touchedRef = useRef(false);
  useEffect(() => {
    if (!touchedRef.current) setAnswers(saved);
  }, [saved]);

  const finish = async (next: DnaAnswers) => {
    setSaving(true);
    const ok = await submit(next);
    setSaving(false);
    if (!ok) { Alert.alert('', t('dna.saveFailed')); return; }
    navigation.replace('TravelDnaResult', onboarding ? { from: 'onboarding' } : undefined);
  };

  const choose = (choice: 'A' | 'B') => {
    if (saving) return;
    touchedRef.current = true;
    Haptics.selectionAsync().catch(() => {});
    const next = { ...answers, [q.id]: choice };
    setAnswers(next);
    if (idx + 1 < questions.length) { setIdx(idx + 1); return; }
    finish(next);
  };

  const quit = () => {
    if (saving) return;
    if (Object.keys(answers).length === 0) { navigation.goBack(); return; }
    Alert.alert(t('dna.quitTitle'), t('dna.quitMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('dna.quitOk'), style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  };

  // 안드로이드 뒤로가기는 '이전 문항'으로 — 화면을 통째로 벗어나면 답이 다 날아간다
  useFocusEffect(
    React.useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (idx > 0) { setIdx(idx - 1); return true; }
        quit();
        return true;
      });
      return () => sub.remove();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idx, answers, saving])
  );

  return (
    <View style={[st.container, { paddingTop: insets.top + 12 }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={quit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={st.skip}>{t('dna.skip')}</Text>
        </TouchableOpacity>
        <Text style={st.progress}>{t('dna.progress', { current: idx + 1, total: questions.length })}</Text>
      </View>

      <View style={st.barTrack}>
        <View style={[st.barFill, { width: `${((idx + 1) / questions.length) * 100}%` }]} />
      </View>

      <View style={st.body}>
        <Text style={st.situation}>{text.s}</Text>
        <TouchableOpacity style={st.choice} activeOpacity={0.85} onPress={() => choose('A')}>
          <Text style={st.choiceText}>{text.a}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.choice} activeOpacity={0.85} onPress={() => choose('B')}>
          <Text style={st.choiceText}>{text.b}</Text>
        </TouchableOpacity>
      </View>

      <View style={[st.footer, { paddingBottom: insets.bottom + 16 }]}>
        {idx > 0 && (
          <TouchableOpacity onPress={() => setIdx(idx - 1)}>
            <Text style={st.prev}>{t('dna.prev')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skip: { color: C.dim, fontSize: 14 },
  progress: { color: C.dim, fontSize: 13, fontWeight: '600' },
  barTrack: { height: 3, borderRadius: 2, backgroundColor: C.line, marginTop: 14, overflow: 'hidden' },
  barFill: { height: 3, borderRadius: 2, backgroundColor: C.neon },
  body: { flex: 1, justifyContent: 'center', gap: 14 },
  situation: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginBottom: 18, lineHeight: 30 },
  choice: {
    backgroundColor: C.card, borderRadius: 18, paddingVertical: 22, paddingHorizontal: 20,
    borderWidth: 1, borderColor: C.line,
  },
  choiceText: { color: '#FFFFFF', fontSize: 16, lineHeight: 24 },
  footer: { minHeight: 44, justifyContent: 'center' },
  prev: { color: C.dim, fontSize: 14 },
});
