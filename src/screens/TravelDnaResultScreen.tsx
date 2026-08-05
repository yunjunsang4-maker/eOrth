/**
 * 여행 DNA 결과 — 유형 라벨 + 7축 막대.
 *
 * 축 점수는 본인만 본다(서버 public_profiles에는 type_key만 실린다).
 * 온보딩에서 들어온 경우 '시작하기'가 메인으로 보내고, 그 외에는 뒤로 돌아간다.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import StarFieldBackground from '../components/StarFieldBackground';
import { IntroAmbient } from './introVisuals';
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

  // 유형 카드 등장(스케일+페이드) + 뒤에서 퍼지는 링 버스트(ImportCompleteScreen 축하 리플 재사용)
  // + 7축 막대가 중립(50)에서 실제 위치로 순차 채워지는 진입 연출.
  // 중립에서 시작하는 이유: 점수 자체가 "50 + (raw-50)×확신도"로 설계돼 50이 곧 무답/중립
  // 기준이라, 막대가 중앙에서 벌어지는 움직임이 그대로 "얼마나 한쪽으로 쏠렸는지"를 보여준다.
  // refresh()는 포커스마다 다시 불리지만 이 연출은 최초 진입 1회만 — hasArrivedRef로 잠근다.
  const cardScale = useRef(new Animated.Value(0.92)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const burstScale = useRef(new Animated.Value(0.6)).current;
  const burstOpacity = useRef(new Animated.Value(0)).current;
  const axisAnims = useRef(DNA_AXES.map(() => new Animated.Value(50))).current;
  const hasArrivedRef = useRef(false);

  useEffect(() => {
    if (hasArrivedRef.current) return;
    hasArrivedRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.sequence([
      Animated.parallel([
        Animated.spring(cardScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(burstOpacity, { toValue: 0.5, duration: 120, useNativeDriver: true }),
          Animated.parallel([
            Animated.timing(burstScale, { toValue: 2.2, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(burstOpacity, { toValue: 0, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]),
        ]),
      ]),
      // 축 막대는 카드가 다 나온 뒤 인덱스 순으로 70ms씩 지연 — 한꺼번에 안 움직이고 순차로 번진다.
      // left(%)는 레이아웃 속성이라 진행 바와 같은 이유로 네이티브 드라이버 불가.
      Animated.stagger(
        70,
        axisAnims.map((av, i) =>
          Animated.timing(av, {
            toValue: scores[DNA_AXES[i]],
            duration: 500,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          })
        )
      ),
    ]).start();
    // 최초 1회만 재생하는 진입 연출이라 실행 시점의 scores/label을 그대로 쓴다 —
    // 이후 refresh()가 값을 갱신해도 재생하지 않는다(위 hasArrivedRef 가드).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[st.container, { paddingTop: insets.top + 12 }]}>
      <StarFieldBackground opacity={0.5} />
      <IntroAmbient />

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Text style={st.title}>{t('dna.resultTitle')}</Text>

        <View style={st.typeCardWrap}>
          <Animated.View
            pointerEvents="none"
            style={[st.burstRing, { opacity: burstOpacity, transform: [{ scale: burstScale }] }]}
          />
          <Animated.View style={{ width: '100%', opacity: cardOpacity, transform: [{ scale: cardScale }] }}>
            <LinearGradient
              colors={['rgba(191,133,252,0.22)', 'rgba(107,33,168,0.18)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={st.typeCard}
            >
              <Text style={st.typeText}>{en ? label.en : label.ko}</Text>
              <Text style={st.accuracy}>{t('dna.accuracy', { percent })}</Text>
            </LinearGradient>
          </Animated.View>
        </View>

        {DNA_AXES.map((axis, i) => {
          const L = DNA_LABELS[axis];
          const left = axisAnims[i].interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'], extrapolate: 'clamp' });
          return (
            <View key={axis} style={st.axisRow}>
              <Text style={st.axisName}>{t(AXIS_LABEL_KEY[axis])}</Text>
              <View style={st.track}>
                <Animated.View style={[st.marker, { left }]} />
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
          onPress={() => {
            if (!fromOnboarding) { navigation.goBack(); return; }
            // 온보딩 종점 — replace가 아니라 reset을 쓴다: replace는 이 화면만 바꿔서
            // 아래 온보딩 스택(Splash·AppIntro·Login·BasicInfo·TravelImport·ImportComplete)이
            // 그대로 남고, 안드로이드 뒤로가기로 온보딩에 다시 들어갈 수 있게 된다.
            // startTutorial: true는 MainScreen이 읽어 첫 진입 코치마크 튜토리얼을 띄우는
            // 살아있는 플래그다 — ImportCompleteScreen의 기존 온보딩 종료 처리와 동일하게 맞춘다.
            navigation.reset({
              index: 0,
              routes: [{ name: 'Main', params: { screen: 'MainTab', params: { startTutorial: true } } }],
            });
          }}
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
  typeCardWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 26 },
  // 카드 뒤에서 퍼지는 축하 링 — ImportCompleteScreen의 burstRing과 같은 크기 비율 아이디어를
  // 사각 카드 뒤에 원형으로 재사용(카드 자체는 사각이라 링을 카드 모양에 맞추지 않고 중심만 공유).
  burstRing: {
    position: 'absolute', top: '50%', left: '50%',
    width: 220, height: 220, borderRadius: 110, marginTop: -110, marginLeft: -110,
    borderWidth: 2, borderColor: 'rgba(191,133,252,0.9)',
  },
  typeCard: { borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(191,133,252,0.35)' },
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
