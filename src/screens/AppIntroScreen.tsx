import React, { useState, useRef, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  Pressable,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureDetector, Gesture, Directions } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import Svg, {
  Defs as SvgDefs,
  LinearGradient as SvgLinearGradient,
  Stop as SvgStop,
  Rect as SvgRect,
} from 'react-native-svg';
import { Colors, Typography, Spacing } from '../constants';
import StarFieldBackground from '../components/StarFieldBackground';
import {
  IntroAmbient,
  IntroVisual1,
  IntroVisual2,
  IntroVisual3,
  IntroVisual4,
  IntroVisual5,
} from './introVisuals';
import type { RootStackScreenProps } from '../navigation/types';

const { width: SW } = Dimensions.get('window');
const BTN_W = SW - 68; // 다음 버튼 폭 = 화면 - 좌우 패딩(40) - 버튼 마진(28)

// 온보딩 5단계 — 시안(iPhone 17 - 64~68.svg) 순서 그대로. 비주얼은 introVisuals에 페이지별 분리.
// Visual에 active를 내려 영상 비주얼(5페이지)이 활성 시점에 처음부터 재생되게 함
const SLIDES: {
  id: string;
  Visual: React.ComponentType<{ active?: boolean }>;
  titleKey: string;
  subtitleKey: string;
}[] = [
  { id: '1', Visual: IntroVisual1, titleKey: 'appIntro.slides.1.title', subtitleKey: 'appIntro.slides.1.subtitle' },
  { id: '2', Visual: IntroVisual2, titleKey: 'appIntro.slides.2.title', subtitleKey: 'appIntro.slides.2.subtitle' },
  { id: '3', Visual: IntroVisual3, titleKey: 'appIntro.slides.3.title', subtitleKey: 'appIntro.slides.3.subtitle' },
  { id: '4', Visual: IntroVisual4, titleKey: 'appIntro.slides.4.title', subtitleKey: 'appIntro.slides.4.subtitle' },
  { id: '5', Visual: IntroVisual5, titleKey: 'appIntro.slides.5.title', subtitleKey: 'appIntro.slides.5.subtitle' },
];

type Props = RootStackScreenProps<'AppIntro'>;

// '**강조**' 마커 구간만 마젠타로 렌더 (i18n 문자열 인라인 강조)
function MarkedTitle({ raw }: { raw: string }) {
  const parts = raw.split('**');
  return (
    <Text style={styles.title}>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={styles.titleMark}>{p}</Text>
        ) : (
          <Text key={i}>{p}</Text>
        )
      )}
    </Text>
  );
}

// 페이지 닷 — 활성 시 스프링으로 7→16pt 늘어나며 마젠타로 차오름 (레이아웃 속성이라 JS 드라이버)
function PageDot({ active }: { active: boolean }) {
  const a = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(a, { toValue: active ? 1 : 0, useNativeDriver: false, speed: 16, bounciness: 7 }).start();
  }, [active, a]);
  return (
    <Animated.View
      style={[
        styles.dot,
        {
          width: a.interpolate({ inputRange: [0, 1], outputRange: [7, 16] }),
          backgroundColor: a.interpolate({ inputRange: [0, 1], outputRange: ['#3D3D55', '#EC34F7'] }),
        },
      ]}
    />
  );
}

// 텍스트 블록 — 페이지 활성화 시 step 라벨→타이틀→서브타이틀이 순서대로 올라오며 페이드인.
// 비활성화되면 리셋해 뒤로 갔다 재진입해도 다시 연출된다.
function SlideTextBlock({ active, stepNo, titleKey, subtitleKey }: { active: boolean; stepNo: number; titleKey: string; subtitleKey: string }) {
  const { t } = useTranslation();
  const vals = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  useEffect(() => {
    if (active) {
      vals.forEach((v) => v.setValue(0));
      Animated.stagger(
        120,
        vals.map((v) => Animated.timing(v, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }))
      ).start();
    } else {
      vals.forEach((v) => v.setValue(0));
    }
  }, [active, vals]);
  const rise = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  });
  return (
    <View style={styles.textBlock}>
      <Animated.View style={rise(vals[0])}>
        <Text style={styles.stepLabel}>{`step 0${stepNo}`}</Text>
      </Animated.View>
      <Animated.View style={rise(vals[1])}>
        <MarkedTitle raw={t(titleKey)} />
      </Animated.View>
      <Animated.View style={rise(vals[2])}>
        <Text style={styles.subtitle}>{t(subtitleKey)}</Text>
      </Animated.View>
    </View>
  );
}

export default function AppIntroScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [activeIdx, setActiveIdx] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const goNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (activeIdx < SLIDES.length - 1) {
      setActiveIdx(activeIdx + 1);
    } else {
      navigation.replace('Login');
    }
  };

  // activeIdx 변경 시 해당 페이지로 애니메이션 이동(버튼 전진·플링 후진 공용)
  useEffect(() => {
    flatListRef.current?.scrollToIndex({ index: activeIdx, animated: true });
  }, [activeIdx]);

  // 다음 버튼 지연 활성화 — 페이지 도착 후 1.5초간 비활성(흐림)으로 두어
  // 사용자가 콘텐츠를 그냥 넘기지 않고 보게 한다. 활성화 시 페이드인.
  const NEXT_DELAY_MS = 1500;
  const [nextReady, setNextReady] = useState(false);
  const readyAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    setNextReady(false);
    readyAnim.setValue(0);
    const timer = setTimeout(() => {
      setNextReady(true);
      Haptics.selectionAsync().catch(() => {});
      Animated.timing(readyAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    }, NEXT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [activeIdx, readyAnim]);

  // 마지막 페이지 CTA 강조 — 버튼 활성화 시 유리 스타일 → 마젠타 필로 차오르며 스케일 팝.
  // 색 애니메이션이라 JS 드라이버(별도 노드) 사용 — 네이티브 opacity 노드와 분리.
  const isLast = activeIdx === SLIDES.length - 1;
  const cta = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isLast && nextReady) {
      Animated.timing(cta, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    } else if (!isLast) {
      cta.setValue(0);
    }
  }, [isLast, nextReady, cta]);
  const ctaScale = cta.interpolate({ inputRange: [0, 0.55, 1], outputRange: [1, 1.05, 1] });
  const ctaBg = cta.interpolate({ inputRange: [0, 1], outputRange: ['rgba(236,52,247,0)', 'rgba(236,52,247,1)'] });

  // 뒤로 가기 — 오른쪽 플링 제스처. 스크롤 자체는 잠가서(전 슬라이드 상시 마운트로 요소가
  // 즉시 보이고) 전진 방향으로는 어떤 끌림도 생기지 않는다. 전진은 다음 버튼으로만.
  const backFling = Gesture.Fling()
    .runOnJS(true)
    .direction(Directions.RIGHT)
    .onStart(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setActiveIdx((cur) => Math.max(0, cur - 1));
    });

  const renderSlide = ({ item, index }: { item: (typeof SLIDES)[number]; index: number }) => {
    const V = item.Visual;
    return (
      <View style={styles.slide}>
        <V active={index === activeIdx} />
        {/* 텍스트 블록 — 하단 정렬, 활성화 시 스태거 등장 */}
        <SlideTextBlock active={index === activeIdx} stepNo={index + 1} titleKey={item.titleKey} subtitleKey={item.subtitleKey} />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StarFieldBackground opacity={0.5} />
      <IntroAmbient />

      {/* 슬라이드 — 뒤로는 오른쪽 플링으로 이동, 앞으로는 다음 버튼으로만(스크롤 잠금) */}
      <GestureDetector gesture={backFling}>
        <FlatList
          ref={flatListRef}
          data={SLIDES}
          horizontal
          pagingEnabled
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          renderItem={renderSlide}
          extraData={activeIdx}
          style={styles.flatList}
          getItemLayout={(_, index) => ({ length: SW, offset: SW * index, index })}
        />
      </GestureDetector>

      {/* 상단 페이지 닷 — 시안: 활성 16×7 마젠타 필, 비활성 7×7 #3D3D55 */}
      <View style={[styles.dotsRow, { top: insets.top + 16 }]} pointerEvents="none">
        {SLIDES.map((s, i) => (
          <PageDot key={s.id} active={i === activeIdx} />
        ))}
      </View>

      {/* 하단 페이드 + 다음/시작하기 버튼 (시안: 흰 10% 유리 필 + #CECFCD 그라데이션 테두리) */}
      <LinearGradient
        colors={['rgba(12,12,12,0)', '#0C0C0C']}
        style={styles.bottomFade}
        pointerEvents="none"
      />
      <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
        {/* 지연 활성화 — 준비 전엔 흐리게 + 터치 무시, 준비되면 페이드인.
            마지막 페이지에선 활성화와 함께 마젠타 필 + 스케일 팝(CTA 강조) */}
        <Animated.View style={{ opacity: readyAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }}>
        <Animated.View style={{ transform: [{ scale: ctaScale }] }}>
        <Pressable style={styles.nextBtn} onPress={goNext} disabled={!nextReady}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 29, backgroundColor: ctaBg }]} />
          <Text style={styles.nextBtnLabel}>
            {activeIdx === SLIDES.length - 1 ? t('appIntro.getStarted') : t('common.next')}
          </Text>
          {/* 테두리 — 탭바와 동일한 #CECFCD 대각선 그라데이션 스트로크 */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg width={BTN_W} height={58}>
              <SvgDefs>
                <SvgLinearGradient id="introBtnRing" x1="0.216" y1="-0.08" x2="0.283" y2="1.10">
                  <SvgStop offset="0" stopColor="#CECFCD" stopOpacity={1} />
                  <SvgStop offset="0.607" stopColor="#CECFCD" stopOpacity={0} />
                </SvgLinearGradient>
              </SvgDefs>
              <SvgRect x={0.5} y={0.5} width={BTN_W - 1} height={57} rx={29} stroke="url(#introBtnRing)" strokeWidth={1} fill="none" />
            </Svg>
          </View>
        </Pressable>
        </Animated.View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0F' },
  flatList: { flex: 1 },
  slide: {
    width: SW,
    flex: 1,
    justifyContent: 'flex-end',
  },

  // 상단 페이지 닷
  dotsRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#3D3D55',
  },
  dotActive: {
    width: 16,
    backgroundColor: '#EC34F7',
  },

  // 텍스트 블록 (시안 규격)
  textBlock: {
    width: '100%',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  stepLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#EC34F7',
    marginBottom: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: '800', // 한글은 시스템 폰트가 렌더 — weight로 EB 재현
    color: Colors.textPrimary,
    lineHeight: 40,
    letterSpacing: -0.5,
    marginBottom: Spacing[3],
  },
  titleMark: {
    color: '#EC34F7',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.regular,
    color: '#9E9CA1',
    lineHeight: 24,
  },

  // 하단 페이드 + 다음 버튼
  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 170,
  },
  bottomArea: {
    paddingHorizontal: 20,
    paddingTop: 10,
    width: '100%',
  },
  nextBtn: {
    marginHorizontal: 14,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  nextBtnLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
});
