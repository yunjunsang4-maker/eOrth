/**
 * 여행 DNA 결과 — 유형 라벨 + 7축 막대.
 *
 * 축 점수는 본인만 본다(서버 public_profiles에는 type_key만 실린다).
 * 온보딩에서 들어온 경우 '시작하기'가 메인으로 보내고, 그 외에는 뒤로 돌아간다.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Easing, InteractionManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import StarFieldBackground from '../components/StarFieldBackground';
import { IntroAmbient } from './introVisuals';
import { DNA_AXES, DNA_LABELS, DNA_LABEL_MIN_STRENGTH, DNA_QUESTIONS, type DnaAxisId } from '../constants/travelDna';
import { useTravelDna } from '../store/travelDnaStore';
import type { RootStackScreenProps } from '../navigation/types';

const C = { bg: '#0A0A0F', card: '#2E2E3B', neon: '#BF85FC', dim: '#A1A1B0', line: '#1A1A26' };

const AXIS_LABEL_KEY: Record<DnaAxisId, string> = {
  plan: 'dna.axisPlan', pace: 'dna.axisPace', terrain: 'dna.axisTerrain',
  budget: 'dna.axisBudget', purpose: 'dna.axisPurpose', crowd: 'dna.axisCrowd',
  company: 'dna.axisCompany',
};

const MARKER = 16;

// 막대 채움은 보라 네온 단일 색의 농도 그라데이션 — 중립(50) 쪽이 옅고 마커 쪽이 진하다.
// 채움은 scaleX로만 늘어나(뒤집히지 않아) 화면상 방향이 늘 좌→우이므로, 점수가 50 미만이라
// 마커가 왼쪽에 오는 축은 색 순서를 뒤집어야 "중립에서 멀어질수록 진해진다"가 유지된다.
const FILL_FADE = 'rgba(191,133,252,0.14)';
const FILL_DEEP = 'rgba(191,133,252,0.78)';
const FILL_GRAD_RIGHT = [FILL_FADE, FILL_DEEP] as const;
const FILL_GRAD_LEFT = [FILL_DEEP, FILL_FADE] as const;

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
  // refresh()는 포커스마다 다시 불리지만 이 연출은 최초 진입 1회만 — startedRef로 잠근다.
  const cardScale = useRef(new Animated.Value(0.92)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const burstScale = useRef(new Animated.Value(0.6)).current;
  const burstOpacity = useRef(new Animated.Value(0)).current;
  const axisAnims = useRef(DNA_AXES.map(() => new Animated.Value(50))).current;

  // 막대는 left(%) 대신 translateX·scaleX로 움직인다 — 레이아웃 속성은 네이티브 드라이버를
  // 못 써서 7축이 동시에 도는 동안 매 프레임 JS 브리지를 타고 레이아웃을 다시 계산했다
  // (진입 연출이 눈에 띄게 끊기던 주원인). 변환으로 바꾸려면 트랙 실측 폭이 필요하므로
  // 첫 축의 onLayout으로 한 번만 재고(모든 축이 같은 폭), 그 값이 들어온 뒤 연출을 시작한다.
  const [trackW, setTrackW] = useState(0);
  const startedRef = useRef(false);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  // 연출이 전환 종료까지 미뤄지는 동안 refresh()가 점수를 갱신할 수 있다 — 실행 시점의
  // 최신 값으로 목표를 잡는다(막대는 여전히 1회만 재생).
  const scoresRef = useRef(scores);
  useEffect(() => { scoresRef.current = scores; }, [scores]);

  useEffect(() => {
    if (startedRef.current || trackW <= 0) return;
    startedRef.current = true;
    // 화면 진입 직후에는 별 배경 SVG(수백 개 원)와 스택 전환이 같은 프레임을 다투므로
    // 여기서 애니메이션을 시작하면 첫 수백 ms가 통째로 드롭된다. 전환이 끝난 뒤 시작한다.
    InteractionManager.runAfterInteractions(() => {
      if (!aliveRef.current) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const target = scoresRef.current;
      Animated.parallel([
        Animated.spring(cardScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(burstOpacity, { toValue: 0.45, duration: 110, useNativeDriver: true }),
          Animated.parallel([
            Animated.timing(burstScale, { toValue: 2.4, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(burstOpacity, { toValue: 0, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]),
        ]),
        // 카드와 '겹쳐서' 시작한다(기존엔 sequence라 버스트 820ms가 끝나야 막대가 움직여
        // 중간이 비었다). 180ms만 뒤에 붙여 카드가 자리잡는 것만 보이게 한다.
        Animated.sequence([
          Animated.delay(180),
          Animated.stagger(
            60,
            axisAnims.map((av, i) =>
              Animated.timing(av, {
                toValue: target[DNA_AXES[i]],
                duration: 460,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              })
            )
          ),
        ]),
      ]).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackW]);

  const half = trackW / 2;

  return (
    <View style={[st.container, { paddingTop: insets.top + 12 }]}>
      <StarFieldBackground opacity={0.5} />
      <IntroAmbient />

      <Text style={st.title}>{t('dna.resultTitle')}</Text>

      <ScrollView style={st.scroll} contentContainerStyle={st.scrollBody} showsVerticalScrollIndicator={false}>
        <View style={st.typeCardWrap}>
          <Animated.View
            pointerEvents="none"
            style={[st.burstRing, { opacity: burstOpacity, transform: [{ scale: burstScale }] }]}
          />
          <Animated.View style={{ width: '100%', opacity: cardOpacity, transform: [{ scale: cardScale }] }}>
            <LinearGradient
              colors={['rgba(191,133,252,0.24)', 'rgba(107,33,168,0.16)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={st.typeCard}
            >
              <Text style={st.typeMark}>✦</Text>
              <Text style={st.typeText}>{en ? label.en : label.ko}</Text>
              {/* 정확도 미터 — 온보딩 축약판(7문항)은 19%라 숫자만으론 의미가 안 읽힌다.
                  남은 칸이 보여야 '이어서 답하기'가 무엇을 채우는지 이해된다. */}
              <View style={st.meterTrack}>
                <View style={[st.meterFill, { width: `${Math.max(percent, 2)}%` }]} />
              </View>
              <Text style={st.accuracy}>{t('dna.accuracy', { percent })}</Text>
            </LinearGradient>
          </Animated.View>
        </View>

        <View style={st.axisCard}>
          {DNA_AXES.map((axis, i) => {
            const L = DNA_LABELS[axis];
            const s = scores[axis];
            // 유형 라벨이 축을 채택하는 기준과 같은 임계값 — 카드의 유형명과 여기 강조가 어긋나지 않는다.
            const leanA = s <= 50 - DNA_LABEL_MIN_STRENGTH;
            const leanB = s >= 50 + DNA_LABEL_MIN_STRENGTH;
            const av = axisAnims[i];
            // fill: 트랙 중앙(half)에 폭 half로 두고, 중앙을 축으로 scaleX(0=중립)와
            // translateX를 함께 걸어 50에서 점수 쪽으로 자라는 구간을 그린다.
            // 두 보간 모두 0~100에 선형이라 변환 하나로 좌·우 방향이 동시에 처리된다.
            const fillTransform = [
              { translateX: av.interpolate({ inputRange: [0, 100], outputRange: [-half, 0], extrapolate: 'clamp' as const }) },
              { scaleX: av.interpolate({ inputRange: [0, 50, 100], outputRange: [1, 0, 1], extrapolate: 'clamp' as const }) },
            ];
            const markerTransform = [
              { translateX: av.interpolate({ inputRange: [0, 100], outputRange: [-half, half], extrapolate: 'clamp' as const }) },
            ];
            return (
              <View key={axis} style={st.axisRow}>
                <Text style={st.axisName}>{t(AXIS_LABEL_KEY[axis])}</Text>
                <View style={st.track} onLayout={i === 0 ? (e) => setTrackW(e.nativeEvent.layout.width) : undefined}>
                  <View style={st.centerTick} />
                  {/* 실측 폭이 오기 전 한 프레임 동안 마커가 왼쪽 끝에 찍히는 것을 막는다 */}
                  <View style={[StyleSheet.absoluteFill, { opacity: trackW > 0 ? 1 : 0 }]}>
                    <Animated.View style={[st.fill, { width: half, left: half, transform: fillTransform }]}>
                      <LinearGradient
                        colors={s >= 50 ? FILL_GRAD_RIGHT : FILL_GRAD_LEFT}
                        start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
                        style={StyleSheet.absoluteFill}
                      />
                    </Animated.View>
                    <Animated.View style={[st.marker, { left: half - MARKER / 2, transform: markerTransform }]} />
                  </View>
                </View>
                <View style={st.poleRow}>
                  <Text style={[st.pole, leanA && st.poleOn]} numberOfLines={1}>{en ? L.enAdjA : L.adjA}</Text>
                  <Text style={[st.pole, leanB && st.poleOn, st.poleRight]} numberOfLines={1}>{en ? L.enAdjB : L.adjB}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* 스크롤 끝이 푸터 밑으로 잘려 보이던 경계를 배경색 페이드로 잇는다 */}
      <LinearGradient
        colors={['rgba(10,10,15,0)', C.bg]}
        style={[st.footerFade, { bottom: insets.bottom + 72 }]}
        pointerEvents="none"
      />

      <View style={[st.footer, { paddingBottom: insets.bottom + 16 }]}>
        {!isFull ? (
          <TouchableOpacity
            style={st.primary}
            activeOpacity={0.85}
            onPress={() => navigation.replace('TravelDnaSurvey', { mode: 'full' })}
          >
            <Text style={st.primaryText}>{t('dna.continueSurvey')}</Text>
          </TouchableOpacity>
        ) : (
          // 36문항을 다 answered 상태에선 이 자리가 비어 푸터가 '닫기' 하나로 텅 비었다.
          // 다시 검사하기는 이미 만들어둔 문구(dna.retake)를 쓰고, 처음부터 다시 묻는 것은
          // 설문 화면의 firstUnanswered가 '전부 답함 → 0번'으로 되돌려 주는 동작에 기댄다.
          <TouchableOpacity
            style={st.outline}
            activeOpacity={0.85}
            onPress={() => navigation.replace('TravelDnaSurvey', { mode: 'full' })}
          >
            <Text style={st.outlineText}>{t('dna.retake')}</Text>
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
  // 타이틀은 스크롤과 함께 사라지지 않게 고정 — 축 카드가 길어 스크롤하면 화면 상단이 비어 보였다
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 18 },
  // 타이틀·푸터가 ScrollView 밖 형제라, 스크롤 영역이 남은 높이를 차지해야 푸터가 하단에 붙는다
  scroll: { flex: 1 },
  scrollBody: { paddingBottom: 96 },
  typeCardWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  // 카드 뒤에서 퍼지는 축하 링 — ImportCompleteScreen의 burstRing과 같은 크기 비율 아이디어를
  // 사각 카드 뒤에 원형으로 재사용(카드 자체는 사각이라 링을 카드 모양에 맞추지 않고 중심만 공유).
  burstRing: {
    position: 'absolute', top: '50%', left: '50%',
    width: 220, height: 220, borderRadius: 110, marginTop: -110, marginLeft: -110,
    borderWidth: 2, borderColor: 'rgba(191,133,252,0.9)',
  },
  typeCard: { borderRadius: 22, paddingVertical: 26, paddingHorizontal: 24, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(191,133,252,0.35)' },
  // 프로필 헤더의 DNA 칩과 같은 마크 — 두 화면이 같은 것을 가리킨다는 신호
  typeMark: { color: C.neon, fontSize: 13, marginBottom: 8 },
  typeText: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', textAlign: 'center', lineHeight: 34 },
  meterTrack: { width: 132, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)', marginTop: 16, overflow: 'hidden' },
  meterFill: { height: 4, borderRadius: 2, backgroundColor: C.neon },
  accuracy: { color: C.dim, fontSize: 12, marginTop: 8 },
  // 7축을 한 장의 카드로 묶는다 — 배경에 그대로 얹혀 있어 설문 화면(유리 카드)과 톤이 어긋났다.
  // 대면적이라 GlassSurface는 쓰지 않는다(안드로이드 매트 폴백이 불투명이라 별 배경을 덮는다).
  axisCard: {
    borderRadius: 20, borderWidth: 1, borderColor: C.line,
    backgroundColor: 'rgba(255,255,255,0.035)',
    paddingVertical: 20, paddingHorizontal: 18, gap: 18,
  },
  axisRow: {},
  axisName: { color: C.dim, fontSize: 12, marginBottom: 9 },
  track: { height: 8, borderRadius: 4, backgroundColor: C.line, justifyContent: 'center' },
  // 중립(50) 눈금 — 막대가 '중앙에서 얼마나 벌어졌나'를 읽는 기준선
  centerTick: { position: 'absolute', left: '50%', width: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.2)' },
  // 그라데이션을 자식으로 깔므로 배경색 대신 overflow로 둥근 끝을 잘라낸다
  fill: { position: 'absolute', top: 0, height: 8, borderRadius: 4, overflow: 'hidden' },
  marker: {
    position: 'absolute', top: -4, width: MARKER, height: MARKER, borderRadius: MARKER / 2,
    backgroundColor: C.neon, borderWidth: 2, borderColor: 'rgba(255,255,255,0.92)',
  },
  poleRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9, gap: 12 },
  pole: { color: 'rgba(255,255,255,0.4)', fontSize: 11, flexShrink: 1 },
  // 유형명에 채택될 만큼 기운 쪽만 밝힌다 — 점 위치만으론 어느 쪽인지 한눈에 안 읽혔다
  poleOn: { color: '#FFFFFF', fontWeight: '700' },
  poleRight: { textAlign: 'right' },
  footerFade: { position: 'absolute', left: 0, right: 0, height: 40 },
  footer: { gap: 10, alignItems: 'center' },
  primary: { backgroundColor: C.neon, borderRadius: 999, paddingVertical: 15, paddingHorizontal: 40, alignSelf: 'stretch', alignItems: 'center' },
  primaryText: { color: '#0A0A0F', fontSize: 16, fontWeight: '800' },
  outline: { borderRadius: 999, borderWidth: 1, borderColor: 'rgba(191,133,252,0.5)', paddingVertical: 14, paddingHorizontal: 40, alignSelf: 'stretch', alignItems: 'center' },
  outlineText: { color: C.neon, fontSize: 15, fontWeight: '700' },
  secondaryText: { color: C.dim, fontSize: 14, paddingVertical: 8 },
});
