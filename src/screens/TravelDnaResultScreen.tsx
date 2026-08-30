/**
 * 여행 DNA 결과 — 유형 라벨 + 7축 막대.
 *
 * 축 점수는 본인만 본다(서버 public_profiles에는 type_key만 실린다).
 * 온보딩에서 들어온 경우 '시작하기'가 메인으로 보내고, 그 외에는 뒤로 돌아간다.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Animated,
  Easing,
  InteractionManager,
  BackHandler,
} from 'react-native';
import { Text } from '../ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { success } from '../utils/haptics';
import { useTranslation } from 'react-i18next';
import StarFieldBackground from '../components/StarFieldBackground';
import { IntroAmbient } from './introVisuals';
import { useSkinAccent } from '../constants/skinTheme';
import { DNA_AXES, DNA_LABELS, DNA_LABEL_MIN_STRENGTH, DNA_QUESTIONS, type DnaAxisId } from '../constants/travelDna';
import { useTravelDna } from '../store/travelDnaStore';
import { useRecords } from '../store/recordStore';
import { isSupabaseConfigured } from '../services/supabase';
import { fetchMateSuggestions, type MateSuggestionRow } from '../services/social';
import { matchPercent } from '../utils/matchScore';
import { labelFromKey } from '../utils/travelDnaScore';
import type { RootStackScreenProps } from '../navigation/types';

// 강조색은 지구본 스킨을 따른다(useSkinAccent) — 여기 남은 값은 스킨과 무관한 것뿐이다.
const C = { bg: '#0A0A0F', card: '#2E2E3B', dim: '#A1A1B0', line: '#1A1A26' };

const AXIS_LABEL_KEY: Record<DnaAxisId, string> = {
  plan: 'dna.axisPlan', pace: 'dna.axisPace', terrain: 'dna.axisTerrain',
  budget: 'dna.axisBudget', purpose: 'dna.axisPurpose', crowd: 'dna.axisCrowd',
  company: 'dna.axisCompany',
};

const MARKER = 16;

// 막대 채움은 강조색 단일 색의 농도 그라데이션 — 중립(50) 쪽이 옅고 마커 쪽이 진하다.
// 채움은 scaleX로만 늘어나(뒤집히지 않아) 화면상 방향이 늘 좌→우이므로, 점수가 50 미만이라
// 마커가 왼쪽에 오는 축은 색 순서를 뒤집어야 "중립에서 멀어질수록 진해진다"가 유지된다.
const FILL_A = 0.14;
const FILL_B = 0.78;

// 유형 카드 광택 — 흰 대각 띠가 카드를 한 번 훑는다(진입 1회) + 기울일 때 따라 움직이는 글레어.
// 둘은 같은 재질이지만 별개 요소다: 진입 스윕은 RN Animated, 글레어는 Reanimated 공유값이
// 몰아서, 한 prop을 두 애니메이션 시스템이 다투는 상황을 만들지 않는다.
const SHINE_W = 84;
const SHINE_TILT = '18deg';
// 광택은 스킨과 무관하게 흰색이다 — 반사광은 표면 색이 아니라 광원 색이라, 강조색으로
// 물들이면 빛이 아니라 '보라/청록 띠'로 보인다.
const SHINE_COLORS = ['rgba(255,255,255,0)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0)'] as const;

const METER_W = 132;   // 정확도 미터 트랙 폭 — 채움을 scaleX로 늘리므로 실측이 아니라 고정값이어야 한다

/**
 * 정확도 숫자 카운트업 — 미터와 같은 Animated.Value를 읽어 둘이 구조적으로 어긋날 수 없다.
 *
 * ⚠️ 반드시 잎 컴포넌트로 떼어 둘 것. 이 숫자를 화면 본체 state로 두면 카운트업 한 번마다
 *    화면 전체(축 7행·그라데이션·메이트 카드)가 다시 그려지고, 그 리렌더가 축 행 stagger를
 *    밀어버려 행이 뭉쳐 나온다 — RN은 네이티브 구동 애니메이션이어도 delay를 JS setTimeout으로
 *    처리하기 때문이다(TimingAnimation.js의 `if (this._delay) setTimeout(start, this._delay)`).
 *    여기서는 리렌더 범위가 <Text> 하나뿐이라 stagger를 건드리지 않는다.
 *
 * final로 상한을 두는 이유: 미터는 0%여도 눈에 보이도록 최소 길이(0.02)까지 차오르는데,
 * 그 값을 그대로 반올림하면 "정확도 2%"가 되어 실제 응답률과 어긋난다.
 */
const AccuracyText = React.memo(function AccuracyText({ anim, final }: { anim: Animated.Value; final: number }) {
  const { t } = useTranslation();
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const id = anim.addListener(({ value }) => setPct(Math.round(value * 100)));
    return () => anim.removeListener(id);
  }, [anim]);
  return <Text style={st.accuracy}>{t('dna.accuracy', { percent: Math.min(pct, final) })}</Text>;
});

const TILT_DEG = 10;   // 최대 기울기. 더 키우면 카드가 3D 오브젝트처럼 보여 정보 카드의 격을 잃는다
const TILT_TRAVEL = 90; // 이 거리(px)를 끌면 최대 기울기

export default function TravelDnaResultScreen({ navigation, route }: RootStackScreenProps<'TravelDnaResult'>) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const skin = useSkinAccent(); // 지구본 스킨 → 앱 강조색. 스킨을 바꾸면 이 화면도 따라간다
  const { scores, label, answered, isFull, isComplete, refresh } = useTravelDna();
  const { records, tripGroups } = useRecords();
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

  // 온보딩 경로에서는 뒤로가기로 동의 화면을 건너뛸 수 있다(스택 바닥에 빈 Main이 남아 있다).
  // gestureEnabled: false 는 iOS 스와이프만 막으므로 안드로이드 하드웨어 백은 여기서 막는다.
  // 온보딩이 아니면 기존대로 뒤로가기가 동작해야 한다(이 화면은 앱 안에서도 열린다).
  useFocusEffect(
    React.useCallback(() => {
      if (!fromOnboarding) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, [fromOnboarding])
  );

  // 성향이 맞는 메이트 — 설문의 보상이 도착하는 자리다. 36문항을 답한 이유가 매칭인데
  // (설문이 매칭 100점 중 35점을 차지한다) 결과가 유형명에서 끝나면 보상이 오지 않는다.
  // travel_dna 트리거가 저장 시 mate_suggestions_cache를 비우므로 여기 도착한 시점의 추천은
  // 방금 낸 답이 이미 반영된 것이다.
  // null = 아직 조회 전. 빈 배열과 구분해야 조회 중에 "없어요"가 먼저 떴다가 사라지지 않는다.
  const [mates, setMates] = useState<MateSuggestionRow[] | null>(null);
  // 나라 목록은 조회 인자로만 쓴다 — 의존성에 넣으면 스토어가 갱신될 때마다 다시 조회한다
  const localRef = useRef({ records, tripGroups });
  useEffect(() => { localRef.current = { records, tripGroups }; }, [records, tripGroups]);
  useEffect(() => {
    if (!isSupabaseConfigured || !isComplete) return;
    let alive = true;
    (async () => {
      const { records: recs, tripGroups: groups } = localRef.current;
      const localCountries = Array.from(new Set([
        // isMyPost !== false: undefined는 내 기록(레거시 포함) — FriendSearchScreen과 같은 판정
        ...recs.filter((r) => r.isMyPost !== false && r.countryName).map((r) => r.countryName as string),
        ...groups.map((g) => g.countryName).filter((c): c is string => !!c),
      ]));
      // FriendSearchScreen과 반드시 같은 인자(10, localCountries)로 부른다 — 서버 캐시 키가
      // match_limit + 정렬된 나라 목록 해시라, 다르게 부르면 같은 결과를 두 번 계산한다.
      // 미리보기 3명은 클라이언트에서 자른다.
      const rows = await fetchMateSuggestions(10, localCountries);
      if (!alive) return;
      // 설문 유사도가 실제로 잡힌 사람만 — 섹션의 약속이 '성향이 맞는'이라 나라만 겹친
      // 사람을 넣으면 문구와 근거가 어긋난다. 상대도 설문을 마쳐야 하므로 초기에는
      // 대부분 비어 있다(정상 — 그때는 아래 '메이트 찾아보기'만 남는다).
      setMates(rows.filter((r) => r.surveyScore > 0).slice(0, 3));
    })();
    return () => { alive = false; };
  }, [isComplete]);

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
  // 축 행 자체의 등장 — 막대만 움직이고 행은 처음부터 다 떠 있으면 연출이 겉돈다
  const rowAnims = useRef(DNA_AXES.map(() => new Animated.Value(0))).current;
  const shineX = useRef(new Animated.Value(0)).current;
  const meterAnim = useRef(new Animated.Value(0)).current;
  const [cardW, setCardW] = useState(0);

  // 카드 기울임 — 드래그 방향으로 3D 회전하고 놓으면 스프링으로 돌아온다.
  // activeOffsetX로 '가로로 끌 때만' 활성화한다: 세로 팬까지 잡으면 카드 위에서
  // 시작한 스크롤이 먹혀 화면을 못 내린다(카드가 최상단이라 실제로 자주 일어난다).
  // 일단 활성화된 뒤에는 세로 이동도 함께 읽어 두 축으로 기울인다.
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);
  // 래스터화는 기울이는 동안만 켠다. 상시로 켜두면 진입 광택 스윕이 도는 900ms 내내
  // 내용이 매 프레임 바뀌어 캐시가 계속 무효화된다(오프스크린 재렌더 = 방금 없앤 종류의 끊김).
  const [tilting, setTilting] = useState(false);
  // 렌더마다 새 제스처를 만들면 카운트업 리렌더(≈19회)마다 네이티브 핸들러가 다시 붙는다.
  const tilt = useMemo(
    () => Gesture.Pan()
      .activeOffsetX([-10, 10])
      .onStart(() => { runOnJS(setTilting)(true); })
      .onUpdate((e) => {
        tiltX.value = Math.max(-1, Math.min(1, e.translationX / TILT_TRAVEL));
        tiltY.value = Math.max(-1, Math.min(1, e.translationY / TILT_TRAVEL));
      })
      .onFinalize(() => {
        tiltX.value = withSpring(0, { damping: 12, stiffness: 140 });
        tiltY.value = withSpring(0, { damping: 12, stiffness: 140 });
        runOnJS(setTilting)(false);
      }),
    [tiltX, tiltY]
  );
  const tiltStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 700 },
      { rotateY: `${tiltX.value * TILT_DEG}deg` },
      { rotateX: `${-tiltY.value * TILT_DEG}deg` },
    ],
  }));
  // 기울인 쪽으로 흐르는 광택 — 기울기가 0이면 완전히 사라져 평소엔 존재하지 않는다
  const glareStyle = useAnimatedStyle(() => ({
    opacity: Math.min(0.4, Math.abs(tiltX.value) * 0.5),
    transform: [{ translateX: tiltX.value * 70 }, { rotate: SHINE_TILT }],
  }));

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
      success();
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
        // 광택 스윕은 카드가 자리잡은 뒤에 훑어야 '완성된 카드'가 빛나는 것으로 읽힌다
        Animated.sequence([
          Animated.delay(420),
          Animated.timing(shineX, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
        // 미터 채움 + 숫자 카운트업(리스너가 같은 값을 읽는다)
        Animated.sequence([
          Animated.delay(240),
          Animated.timing(meterAnim, {
            toValue: Math.max(percent / 100, 0.02), // 0%도 눈에 보이는 최소 길이는 남긴다
            duration: 700,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        // 카드와 '겹쳐서' 시작한다(기존엔 sequence라 버스트 820ms가 끝나야 막대가 움직여
        // 중간이 비었다). 180ms만 뒤에 붙여 카드가 자리잡는 것만 보이게 한다.
        Animated.sequence([
          Animated.delay(180),
          // 간격(90)이 행 페이드(160)의 절반보다 커야 '하나씩' 으로 읽힌다 — 겹침이 절반을
          // 넘으면 여러 행이 동시에 떠오른다. 짧은 페이드로 뭉개지 않으면서 빠르게 훑는다.
          // 막대(380)만 행보다 길게 남아 행이 뜬 뒤 안에서 뒤따라 채워진다.
          Animated.stagger(
            90,
            axisAnims.map((av, i) =>
              Animated.parallel([
                Animated.timing(rowAnims[i], {
                  toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true,
                }),
                Animated.timing(av, {
                  toValue: target[DNA_AXES[i]],
                  duration: 380,
                  easing: Easing.out(Easing.cubic),
                  useNativeDriver: true,
                }),
              ])
            )
          ),
        ]),
      ]).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackW]);

  const half = trackW / 2;

  // 스킨 파생 그라데이션 — 렌더마다 새 배열을 만들면 LinearGradient가 매번 prop 변경으로 본다
  const fillRight = useMemo(() => [skin.tint(FILL_A), skin.tint(FILL_B)] as [string, string], [skin]);
  const fillLeft = useMemo(() => [skin.tint(FILL_B), skin.tint(FILL_A)] as [string, string], [skin]);
  // 카드 바탕은 강조색 → 진한 강조색. accentDeep은 6자리 hex라 알파를 8자리(#RRGGBBAA)로 붙인다
  // (0x29 ≈ 0.16) — aurora의 기존 두 톤(밝은 보라 → 딥 보라)이 그대로 유지된다.
  const cardGrad = useMemo(() => [skin.tint(0.24), `${skin.accentDeep}29`] as [string, string], [skin]);

  return (
    <View style={[st.container, { paddingTop: insets.top + 12 }]}>
      <StarFieldBackground opacity={0.5} />
      <IntroAmbient />

      <Text style={st.title}>{t('dna.resultTitle')}</Text>

      <ScrollView style={st.scroll} contentContainerStyle={st.scrollBody} showsVerticalScrollIndicator={false}>
        <View style={st.typeCardWrap}>
          <Animated.View
            pointerEvents="none"
            style={[st.burstRing, { borderColor: skin.tint(0.9), opacity: burstOpacity, transform: [{ scale: burstScale }] }]}
          />
          <Animated.View style={{ width: '100%', opacity: cardOpacity, transform: [{ scale: cardScale }] }}>
            <GestureDetector gesture={tilt}>
              {/* 회전하는 뷰는 래스터화 + 1px 투명 블리드 링(margin -1 / padding 1)이 필요하다.
                  래스터 비트맵의 '가장자리 자체'는 하드엣지로 회전하므로, 블리드가 없으면 카드
                  테두리(고대비 보라 선)에 계단현상이 남는다. collapsable={false}는 Fabric이
                  레이아웃만 가진 뷰를 평탄화하며 raster prop을 조용히 삼키는 것을 막는다. */}
              <Reanimated.View
                style={[st.tiltWrap, tiltStyle]}
                collapsable={false}
                shouldRasterizeIOS={tilting}
                renderToHardwareTextureAndroid={tilting}
              >
                <LinearGradient
                  colors={cardGrad}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={[st.typeCard, { borderColor: skin.tint(0.35) }]}
                  onLayout={(e) => setCardW(e.nativeEvent.layout.width)}
                >
                  <Text style={[st.typeMark, { color: skin.accent }]}>✦</Text>
                  <Text style={st.typeText}>{en ? label.en : label.ko}</Text>
                  {/* 정확도 미터 — 온보딩 축약판(7문항)은 19%라 숫자만으론 의미가 안 읽힌다.
                      남은 칸이 보여야 '이어서 답하기'가 무엇을 채우는지 이해된다.
                      채움은 width(레이아웃) 대신 translateX+scaleX로 왼쪽 끝에 고정한 채 늘린다. */}
                  <View style={st.meterTrack}>
                    <Animated.View
                      style={[st.meterFill, {
                        width: METER_W,
                        backgroundColor: skin.accent,
                        transform: [
                          { translateX: meterAnim.interpolate({ inputRange: [0, 1], outputRange: [-METER_W / 2, 0] }) },
                          { scaleX: meterAnim },
                        ],
                      }]}
                    />
                  </View>
                  <AccuracyText anim={meterAnim} final={percent} />

                  {/* 진입 1회 광택 스윕 */}
                  <Animated.View
                    pointerEvents="none"
                    style={[st.shine, {
                      transform: [
                        { translateX: shineX.interpolate({ inputRange: [0, 1], outputRange: [-SHINE_W, cardW + SHINE_W] }) },
                        { rotate: SHINE_TILT },
                      ],
                    }]}
                  >
                    <LinearGradient
                      colors={SHINE_COLORS} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
                      style={StyleSheet.absoluteFill}
                    />
                  </Animated.View>

                  {/* 기울일 때만 나타나는 글레어 */}
                  <Reanimated.View pointerEvents="none" style={[st.glare, glareStyle]}>
                    <LinearGradient
                      colors={SHINE_COLORS} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
                      style={StyleSheet.absoluteFill}
                    />
                  </Reanimated.View>
                </LinearGradient>
              </Reanimated.View>
            </GestureDetector>
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
              <Animated.View
                key={axis}
                style={[st.axisRow, {
                  opacity: rowAnims[i],
                  transform: [{ translateY: rowAnims[i].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
                }]}
              >
                <Text style={st.axisName}>{t(AXIS_LABEL_KEY[axis])}</Text>
                <View style={st.track} onLayout={i === 0 ? (e) => setTrackW(e.nativeEvent.layout.width) : undefined}>
                  <View style={st.centerTick} />
                  {/* 실측 폭이 오기 전 한 프레임 동안 마커가 왼쪽 끝에 찍히는 것을 막는다 */}
                  <View style={[StyleSheet.absoluteFill, { opacity: trackW > 0 ? 1 : 0 }]}>
                    <Animated.View style={[st.fill, { width: half, left: half, transform: fillTransform }]}>
                      <LinearGradient
                        colors={s >= 50 ? fillRight : fillLeft}
                        start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
                        style={StyleSheet.absoluteFill}
                      />
                    </Animated.View>
                    <Animated.View style={[st.marker, { backgroundColor: skin.accent, left: half - MARKER / 2, transform: markerTransform }]} />
                  </View>
                </View>
                <View style={st.poleRow}>
                  <Text style={[st.pole, leanA && st.poleOn]} numberOfLines={1}>{en ? L.enAdjA : L.adjA}</Text>
                  <Text style={[st.pole, leanB && st.poleOn, st.poleRight]} numberOfLines={1}>{en ? L.enAdjB : L.adjB}</Text>
                </View>
              </Animated.View>
            );
          })}
        </View>

        {/* 축 카드 아래 = "그래서 누구" 자리. 유형(무엇) → 축(왜) → 메이트(그래서) 순으로 읽힌다.
            설문이 유효할 때만 — 축이 하나라도 비면 매칭에 반영되지 않아 약속을 지킬 수 없다. */}
        {isComplete && (
          <View style={st.mateCard}>
            <Text style={st.mateTitle}>{t('dna.mateTitle')}</Text>
            {mates?.map((m) => {
              const lab = labelFromKey(m.dnaTypeKey);
              const pct = matchPercent(m.totalScore); // 임계 미만이면 null — 배지를 그리지 않는 기존 규칙
              return (
                <TouchableOpacity
                  key={m.authorId}
                  style={st.mateRow}
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('FriendProfile', { userId: m.authorId, username: m.handle })}
                >
                  <View style={st.avatar}>
                    {m.profilePhoto
                      ? <Image source={{ uri: m.profilePhoto }} style={st.avatarImg} />
                      : <Text style={st.avatarText}>{m.emoji || (m.handle || '?').slice(0, 1)}</Text>}
                  </View>
                  <View style={st.mateInfo}>
                    <Text style={st.mateHandle} numberOfLines={1}>@{m.handle}</Text>
                    {!!lab && <Text style={st.mateType} numberOfLines={1}>{en ? lab.en : lab.ko}</Text>}
                  </View>
                  {pct != null && <Text style={[st.matePct, { color: skin.accent }]}>{pct}%</Text>}
                </TouchableOpacity>
              );
            })}
            {/* 조회가 끝났는데 아무도 없을 때만. 실패로 읽히지 않게 이유(상대도 설문을
                마쳐야 한다)를 밝힌다 — 출시 초기에는 이쪽이 기본 상태다. */}
            {mates?.length === 0 && <Text style={st.mateEmpty}>{t('dna.mateEmpty')}</Text>}
            <TouchableOpacity
              style={st.mateFind}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('FriendSearch')}
            >
              <Text style={[st.mateFindText, { color: skin.accent }]}>{t('dna.mateFind')}</Text>
              <Text style={[st.mateFindArrow, { color: skin.accent }]}>›</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* 스크롤 끝이 푸터 밑으로 잘려 보이던 경계를 배경색 페이드로 잇는다 */}
      <LinearGradient
        colors={['rgba(10,10,15,0)', C.bg]}
        style={[st.footerFade, { bottom: insets.bottom + 72 }]}
        pointerEvents="none"
      />

      <View style={[st.footer, { paddingBottom: insets.bottom + 16 }]}>
        {!isFull ? (
          // 단색 채움 + 어두운 글씨였는데, 스킨을 따르면 cyan(#2F83FF) 위 검정 글씨의 대비가
          // 무너진다. 앱의 CTA 언어(둥근 필 + btnGradient + 흰 글씨)로 맞춘다 — 세 스킨 모두
          // 그라데이션이 진한 쪽으로 끝나 흰 글씨가 안전하다.
          <TouchableOpacity
            style={st.primaryWrap}
            activeOpacity={0.85}
            onPress={() => navigation.replace('TravelDnaSurvey', fromOnboarding ? { mode: 'full', from: 'onboarding' } : { mode: 'full' })}
          >
            <LinearGradient
              colors={skin.btnGradient}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={st.primary}
            >
              <Text style={st.primaryText}>{t('dna.continueSurvey')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          // 36문항을 다 answered 상태에선 이 자리가 비어 푸터가 '닫기' 하나로 텅 비었다.
          // 다시 검사하기는 이미 만들어둔 문구(dna.retake)를 쓰고, 처음부터 다시 묻는 것은
          // 설문 화면의 firstUnanswered가 '전부 답함 → 0번'으로 되돌려 주는 동작에 기댄다.
          <TouchableOpacity
            style={[st.outline, { borderColor: skin.tint(0.5) }]}
            activeOpacity={0.85}
            onPress={() => navigation.replace('TravelDnaSurvey', fromOnboarding ? { mode: 'full', from: 'onboarding' } : { mode: 'full' })}
          >
            <Text style={[st.outlineText, { color: skin.accent }]}>{t('dna.retake')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => {
            if (!fromOnboarding) { navigation.goBack(); return; }
            // 온보딩 종점은 동의 화면이다 — 스택 정리(reset)와 startTutorial 전달은
            // MateRecoConsentScreen 이 대신 수행한다.
            navigation.replace('MateRecoConsent');
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
    borderWidth: 2, // borderColor는 스킨 강조색 — 인라인
  },
  // 블리드 링 — 레이아웃 풋프린트는 그대로 두고 시각적 가장자리를 래스터 비트맵 안쪽으로 넣는다
  tiltWrap: { margin: -1, padding: 1 },
  // overflow hidden: 광택 띠가 둥근 모서리 밖으로 삐져나오지 않게 자른다
  typeCard: {
    borderRadius: 22, paddingVertical: 26, paddingHorizontal: 24, alignItems: 'center',
    borderWidth: 1, overflow: 'hidden', // borderColor는 스킨 강조색 — 인라인
  },
  // 회전(18°)해도 카드 위아래를 덮도록 상하로 넉넉히 넘긴다
  shine: { position: 'absolute', top: -50, bottom: -50, left: 0, width: SHINE_W },
  glare: { position: 'absolute', top: -50, bottom: -50, left: '50%', marginLeft: -SHINE_W / 2, width: SHINE_W },
  // 프로필 헤더의 DNA 칩과 같은 마크 — 두 화면이 같은 것을 가리킨다는 신호
  typeMark: { fontSize: 13, marginBottom: 8 }, // color는 스킨 강조색 — 인라인
  typeText: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', textAlign: 'center', lineHeight: 34 },
  meterTrack: { width: METER_W, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)', marginTop: 16, overflow: 'hidden' },
  meterFill: { height: 4, borderRadius: 2 }, // backgroundColor는 스킨 강조색 — 인라인
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
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.92)', // backgroundColor는 스킨 강조색 — 인라인
  },
  poleRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9, gap: 12 },
  pole: { color: 'rgba(255,255,255,0.4)', fontSize: 11, flexShrink: 1 },
  // 유형명에 채택될 만큼 기운 쪽만 밝힌다 — 점 위치만으론 어느 쪽인지 한눈에 안 읽혔다
  poleOn: { color: '#FFFFFF', fontWeight: '700' },
  poleRight: { textAlign: 'right' },
  // 축 카드와 같은 재질 — 결과의 연장이지 별도 광고 블록이 아니다
  mateCard: {
    marginTop: 18, borderRadius: 20, borderWidth: 1, borderColor: C.line,
    backgroundColor: 'rgba(255,255,255,0.035)', paddingVertical: 16, paddingHorizontal: 16,
  },
  mateTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginBottom: 12 },
  mateRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: 40, height: 40 },
  avatarText: { fontSize: 18, color: '#FFFFFF' },
  mateInfo: { flex: 1 },
  mateHandle: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  mateType: { color: C.dim, fontSize: 12, marginTop: 2 },
  matePct: { fontSize: 13, fontWeight: '800' }, // color는 스킨 강조색 — 인라인
  mateEmpty: { color: C.dim, fontSize: 12, lineHeight: 18, paddingVertical: 2 },
  // 추천이 비어도(상대가 아직 설문을 안 마쳤을 때) 이 줄은 남아 매칭으로 가는 길이 끊기지 않는다
  mateFind: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 12, paddingBottom: 4 },
  mateFindText: { fontSize: 14, fontWeight: '700' },
  mateFindArrow: { fontSize: 16, fontWeight: '700' },
  footerFade: { position: 'absolute', left: 0, right: 0, height: 40 },
  footer: { gap: 10, alignItems: 'center' },
  // 필 모양은 바깥 Touchable이, 채움(btnGradient)은 안쪽 LinearGradient가 맡는다
  primaryWrap: { borderRadius: 999, overflow: 'hidden', alignSelf: 'stretch' },
  primary: { borderRadius: 999, paddingVertical: 15, paddingHorizontal: 40, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  outline: { borderRadius: 999, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 40, alignSelf: 'stretch', alignItems: 'center' },
  outlineText: { fontSize: 15, fontWeight: '700' },
  secondaryText: { color: C.dim, fontSize: 14, paddingVertical: 8 },
});
