/**
 * 여행 DNA 설문 — 전체(36문항)와 온보딩 축약판(7문항) 공용.
 *
 * 한 화면에 한 문항. 고르면 바로 다음으로 넘어간다(확인 버튼 없음) —
 * 36문항에서 탭이 두 배가 되면 완주율이 떨어진다.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, BackHandler, Animated, Easing } from 'react-native';
import { Text } from '../ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import StarFieldBackground from '../components/StarFieldBackground';
import { IntroAmbient } from './introVisuals';
import { GlassSurface } from '../components/GlassSurface';
import { useSkinAccent } from '../constants/skinTheme';
import { DNA_QUESTIONS, ONBOARDING_QUESTION_IDS, type DnaQuestion } from '../constants/travelDna';
import { useTravelDna } from '../store/travelDnaStore';
import type { DnaAnswers } from '../utils/travelDnaScore';
import type { RootStackScreenProps } from '../navigation/types';

// 강조색은 지구본 스킨을 따른다(useSkinAccent) — 결과 화면과 같은 규칙.
const C = { bg: '#0A0A0F', card: '#2E2E3B', dim: '#A1A1B0', line: '#1A1A26' };

// 선택 카드 — GlassSurface는 배경 재질이라 absoluteFill로 깔고 텍스트는 형제로 위에 얹는다
// (컴포넌트 헤더 주석의 "중첩 금지" 규칙). 카드가 크므로 androidBlur는 쓰지 않고
// 기본 Android 매트 폴백을 그대로 쓴다(블러는 탭 바 같은 소면적 전용).
function DnaChoiceCard({ text, onPress }: { text: string; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () => {
    Animated.timing(scale, { toValue: 0.97, duration: 80, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    // 뗄 때 살짝 튕기며 정착 — onPress보다 먼저 불려, 다음 문항이 페이드인하는 동안 자연스럽게 겹친다.
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
  };
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[st.choiceOuter, { transform: [{ scale }] }]}>
        <GlassSurface style={StyleSheet.absoluteFill} borderRadius={18} edgeHighlight />
        <View style={st.choiceContent}>
          <Text style={st.choiceText}>{text}</Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

// 아직 답하지 않은 첫 문항. 축약판(7문항) 뒤에 전체 설문에 들어오면 앞쪽 문항엔 이미 답이
// 있어, 0에서 시작하면 아는 문항을 다시 탭하게 된다(답은 보존되니 손실은 아니고 성가실 뿐).
// 전부 답한 상태(재검사)면 0으로 되돌아간다.
const firstUnanswered = (list: DnaQuestion[], src: DnaAnswers) => {
  const i = list.findIndex((q) => !src[q.id]);
  return i < 0 ? 0 : i;
};

export default function TravelDnaSurveyScreen({ navigation, route }: RootStackScreenProps<'TravelDnaSurvey'>) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const skin = useSkinAccent(); // 지구본 스킨 → 앱 강조색
  const { answers: saved, submit } = useTravelDna();
  const onboarding = route.params?.mode === 'onboarding';

  const questions = useMemo(
    () => (onboarding
      ? DNA_QUESTIONS.filter((q) => ONBOARDING_QUESTION_IDS.includes(q.id))
      : DNA_QUESTIONS),
    [onboarding]
  );

  const [idx, setIdx] = useState(() => firstUnanswered(questions, saved));
  const [answers, setAnswers] = useState<DnaAnswers>(saved);
  const [saving, setSaving] = useState(false);
  const q = questions[idx];
  const text = i18n.language.startsWith('en') ? q.en : q.ko;

  // 진행 바 — 인덱스가 바뀔 때마다 목표 비율로 슬라이드. width는 레이아웃 속성이라
  // 네이티브 드라이버로 못 돌린다(scaleX 변환으로 우회할 수도 있지만, 이 애니메이션은
  // 문항마다 한 번(≈220ms)만 짧게 뛰고 제스처처럼 연속 구동되지 않으므로 JS 드라이버
  // 비용이 무시할 만하다 — transformOrigin 이슈 없는 useNativeDriver:false를 택함).
  const barAnim = useRef(new Animated.Value((idx + 1) / questions.length)).current;
  useEffect(() => {
    Animated.timing(barAnim, {
      toValue: (idx + 1) / questions.length,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [idx, questions.length, barAnim]);
  const barWidth = barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'], extrapolate: 'clamp' });

  // 문항 전환 페이드+슬라이드 — idx만 보고 반응하므로 '다음'이든 '이전'(뒤로가기·이전 버튼)이든
  // 동일하게 적용된다. choose()의 저장/가드 로직은 전혀 건드리지 않고 시각 효과만 얹는다.
  // .start()는 논블로킹이라 연타해도 choose()는 매번 즉시 실행되어 답이 밀리거나 씹히지 않는다.
  const qAnim = useRef(new Animated.Value(1)).current;
  const prevIdxRef = useRef(idx);
  useEffect(() => {
    if (prevIdxRef.current === idx) return;
    prevIdxRef.current = idx;
    qAnim.setValue(0);
    Animated.timing(qAnim, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [idx, qAnim]);
  const qStyle = {
    opacity: qAnim,
    transform: [{ translateY: qAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  };

  // 스토어의 answers는 마운트 후 로컬 캐시 → 서버 순으로 비동기 채워진다.
  // 이 화면이 그 로드보다 먼저 마운트되면 초기 useState(saved)는 빈 값으로 굳는다.
  // 아직 사용자가 아무것도 고르지 않았을 때(touched 이전)에 한해 saved 도착을 반영한다 —
  // 가드 없이 매번 반영하면 답하는 도중 스토어 갱신이 방금 고른 선택을 되돌린다.
  // 시작 위치도 반드시 이 효과가 정착시키는 saved에서 뽑아야 한다. useState 초기값(빈 saved)만
  // 믿으면 로드가 늦게 끝났을 때 0번에 머물러, 이어서 답하기가 다시 1번부터 시작한다.
  // 이동 여부는 touchedRef와 따로 센다 — 아직 아무 답도 안 골랐지만(=answers 재시딩은 필요)
  // '이전'으로 옮겨둔 사용자를 뒤늦은 로드가 도로 끌고 가면 안 되기 때문이다.
  const touchedRef = useRef(false);
  const movedRef = useRef(false);
  useEffect(() => {
    if (!touchedRef.current) setAnswers(saved);
    if (!movedRef.current) setIdx(firstUnanswered(questions, saved));
  }, [saved, questions]);

  const finish = async (next: DnaAnswers) => {
    setSaving(true);
    const ok = await submit(next);
    setSaving(false);
    if (!ok) { Alert.alert('', t('dna.saveFailed')); return; }
    navigation.replace('TravelDnaResult', onboarding ? { from: 'onboarding' } : undefined);
  };

  const goTo = (n: number) => { movedRef.current = true; setIdx(n); };

  const choose = (choice: 'A' | 'B') => {
    if (saving) return;
    touchedRef.current = true;
    Haptics.selectionAsync().catch(() => {});
    const next = { ...answers, [q.id]: choice };
    setAnswers(next);
    if (idx + 1 < questions.length) { goTo(idx + 1); return; }
    finish(next);
  };

  // 설문을 건너뛰어도 온보딩은 여기서 끝난다. 온보딩 진입이면 결과 화면과 똑같이 reset한다 —
  // goBack으로 나가면 startTutorial 없는 Main에 도달해 첫 진입 코치마크가 영영 안 뜨고,
  // 온보딩 스택도 그대로 남아 뒤로가기로 되돌아갈 수 있다.
  // (알림 권한 요청은 ImportCompleteScreen이 이 화면으로 넘겨주기 전에 이미 부른다)
  const leave = () => {
    if (!onboarding) { navigation.goBack(); return; }
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main', params: { screen: 'MainTab', params: { startTutorial: true } } }],
    });
  };

  const quit = () => {
    if (saving) return;
    if (Object.keys(answers).length === 0) { leave(); return; }
    Alert.alert(t('dna.quitTitle'), t('dna.quitMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('dna.quitOk'), style: 'destructive', onPress: leave },
    ]);
  };

  // 안드로이드 뒤로가기는 '이전 문항'으로 — 화면을 통째로 벗어나면 답이 다 날아간다
  useFocusEffect(
    React.useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (idx > 0) { goTo(idx - 1); return true; }
        quit();
        return true;
      });
      return () => sub.remove();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idx, answers, saving])
  );

  return (
    <View style={[st.container, { paddingTop: insets.top + 12 }]}>
      <StarFieldBackground opacity={0.5} />
      <IntroAmbient />

      <View style={st.header}>
        <TouchableOpacity onPress={quit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={st.skip}>{t('dna.skip')}</Text>
        </TouchableOpacity>
        <Text style={st.progress}>{t('dna.progress', { current: idx + 1, total: questions.length })}</Text>
      </View>

      <View style={st.barTrack}>
        <Animated.View style={[st.barFill, { backgroundColor: skin.accent, width: barWidth }]} />
      </View>

      <Animated.View style={[st.body, qStyle]}>
        <Text style={st.situation}>{text.s}</Text>
        <DnaChoiceCard text={text.a} onPress={() => choose('A')} />
        <DnaChoiceCard text={text.b} onPress={() => choose('B')} />
      </Animated.View>

      <View style={[st.footer, { paddingBottom: insets.bottom + 16 }]}>
        {idx > 0 && (
          <TouchableOpacity onPress={() => goTo(idx - 1)}>
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
  barFill: { height: 3, borderRadius: 2 }, // backgroundColor는 스킨 강조색 — 인라인
  body: { flex: 1, justifyContent: 'center', gap: 14 },
  situation: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginBottom: 18, lineHeight: 30 },
  choiceOuter: {
    borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
  },
  choiceContent: { paddingVertical: 22, paddingHorizontal: 20 },
  choiceText: { color: '#FFFFFF', fontSize: 16, lineHeight: 24 },
  footer: { minHeight: 44, justifyContent: 'center' },
  prev: { color: C.dim, fontSize: 14 },
});
