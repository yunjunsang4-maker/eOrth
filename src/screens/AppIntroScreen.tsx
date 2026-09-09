import React, { useState, useRef, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  Animated,
  Easing,
} from 'react-native';
import { Text } from '../ui/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureDetector, Gesture, Directions } from 'react-native-gesture-handler';
import { tap } from '../utils/haptics';
import { useTranslation } from 'react-i18next';
import Svg, { Path as SvgPath } from 'react-native-svg';
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
import { useStageWidth } from '../utils/stage';

// 온보딩 5단계 — 시안(iPhone 17 - 64~68.svg) 순서 그대로. 비주얼은 introVisuals에 페이지별 분리.
// Visual에 active를 내려 영상 비주얼(5페이지)이 활성 시점에 처음부터 재생되게 함
// 이동 수단: 하단 좌우 화살표 탭 + 2초 자동 넘김 + 오른쪽 플링(뒤로). 하단 버튼은 없앴다.
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

// 하단 이동 화살표의 셰브론 — react-native-svg Path로 그린다(이모지·텍스트 화살표 금지).
// Svg는 새 아키텍처에서 pointerEvents="none"을 무시하므로 View로 감싸 터치가
// 바깥 Pressable로 가게 한다(오버레이 SVG 터치 삼킴 함정과 같은 회피책).
function ChevronGlyph({ dir, color }: { dir: 'left' | 'right'; color: string }) {
  return (
    <View pointerEvents="none">
      <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
        <SvgPath
          d={dir === 'left' ? 'M15 5L8 12L15 19' : 'M9 5L16 12L9 19'}
          stroke={color}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
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
  // 슬라이드 폭이 getItemLayout의 length/offset에 그대로 들어간다 — 박제하면
  // 폴드 펼침 시 페이지가 어긋난다.
  const SW = useStageWidth();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [activeIdx, setActiveIdx] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const isLast = activeIdx === SLIDES.length - 1;

  // 자동 넘김을 계속할지 — 사용자가 한 번이라도 "뒤로" 이동하면 false로 꺼진다.
  // 다시 읽으려고 되돌아온 사용자를 2초마다 앞으로 밀지 않기 위해서다.
  // 렌더에 반영할 값이 아니고(화면에 표시되지 않음) 타이머 effect가 읽기만 하므로
  // state가 아니라 useRef로 둔다 — state면 끄는 순간 불필요한 리렌더가 난다.
  const autoAdvanceRef = useRef(true);
  // 대기 중인 자동 넘김 타이머 핸들 — effect cleanup과 별개로 직접 지울 수 있어야 한다(아래 stopAutoAdvance).
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 자동 넘김 정지 — 플래그를 끄는 동시에 이미 예약된 타이머까지 그 자리에서 지운다.
  // effect cleanup에만 맡기면 첫 페이지 플링에서 샌다: Math.max(0, -1) === 0이라
  // 같은 값이 setState되고, React는 Object.is 동일값이면 리렌더를 건너뛴다.
  // → deps([activeIdx, isLast])가 그대로라 effect가 재실행되지도 cleanup이 돌지도 않고,
  //   ref 변경은 애초에 effect를 깨우지 않으므로 옛 타이머가 살아남아 2초 뒤 발화한다.
  //   "뒤로/멈춰"라는 뜻의 제스처가 오히려 전진을 만드는 셈이라, 상태가 바뀌든 말든
  //   여기서 타이머를 직접 죽인다.
  const stopAutoAdvance = () => {
    autoAdvanceRef.current = false;
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  };

  const goNext = () => {
    tap();
    if (!isLast) {
      setActiveIdx(activeIdx + 1);
    } else {
      navigation.replace('Login');
    }
  };

  const goPrev = () => {
    if (activeIdx === 0) return;
    tap();
    stopAutoAdvance(); // 뒤로 갔으면 이후 자동 넘김 중단
    setActiveIdx(activeIdx - 1);
  };

  // activeIdx 변경 시 해당 페이지로 애니메이션 이동(화살표·자동 넘김·플링 공용)
  useEffect(() => {
    flatListRef.current?.scrollToIndex({ index: activeIdx, animated: true });
  }, [activeIdx]);

  // 자동 넘김 — 페이지 도착 2초 뒤 다음 페이지로. 마지막 페이지에서는 걸지 않는다.
  // (자동으로 Login에 진입시키면 사용자가 온보딩을 못 보고 이탈당한다 — 마지막은
  //  반드시 오른쪽 화살표를 눌러야 넘어간다.) 뒤로 이동 후에도 걸지 않는다.
  // 페이지가 바뀌거나 화면이 언마운트되면 cleanup에서 타이머를 지운다.
  const AUTO_ADVANCE_MS = 2000;
  useEffect(() => {
    if (isLast) return;
    if (!autoAdvanceRef.current) return;
    const timer = setTimeout(() => {
      autoTimerRef.current = null;
      setActiveIdx((cur) => (cur === activeIdx ? cur + 1 : cur));
    }, AUTO_ADVANCE_MS);
    autoTimerRef.current = timer;
    return () => {
      clearTimeout(timer);
      if (autoTimerRef.current === timer) autoTimerRef.current = null;
    };
  }, [activeIdx, isLast]);

  // 뒤로 가기 — 오른쪽 플링 제스처. 스크롤 자체는 잠가서(전 슬라이드 상시 마운트로 요소가
  // 즉시 보이고) 전진 방향으로는 어떤 끌림도 생기지 않는다. 전진은 오른쪽 화살표나 자동 넘김으로만.
  const backFling = Gesture.Fling()
    .runOnJS(true)
    .direction(Directions.RIGHT)
    .onStart(() => {
      tap();
      // 플링도 "뒤로"이므로 자동 넘김 중단. 첫 페이지에선 setActiveIdx가 같은 값이라
      // effect cleanup이 안 도니, 플래그만 끄지 말고 타이머까지 지워야 한다.
      stopAutoAdvance();
      setActiveIdx((cur) => Math.max(0, cur - 1));
    });

  const renderSlide = ({ item, index }: { item: (typeof SLIDES)[number]; index: number }) => {
    const V = item.Visual;
    return (
      <View style={[styles.slide, { width: SW }]}>
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

      {/* 슬라이드 — 뒤로는 오른쪽 플링, 앞으로는 화살표·자동 넘김으로만(스크롤 잠금) */}
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

      {/* 하단 페이드 + 좌우 이동 화살표 */}
      <LinearGradient
        colors={['rgba(12,12,12,0)', '#0C0C0C']}
        style={styles.bottomFade}
        pointerEvents="none"
      />
      <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
        {/* 왼쪽 = 이전 페이지. 첫 페이지에선 비활성 + 흐린 색.
            지연 활성화는 없앴다 — 페이지에 도착하는 즉시 누를 수 있다. */}
        <Pressable
          style={styles.arrowBtn}
          onPress={goPrev}
          disabled={activeIdx === 0}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityState={{ disabled: activeIdx === 0 }}
        >
          <ChevronGlyph dir="left" color={activeIdx === 0 ? '#3D3D55' : '#EC34F7'} />
        </Pressable>

        {/* 오른쪽 = 다음 페이지. 마지막 페이지에선 로그인으로 진입하므로
            '시작하기' 라벨을 함께 보여 무엇이 일어나는지 분명히 한다. */}
        <Pressable
          style={styles.arrowBtnRight}
          onPress={goNext}
          hitSlop={10}
          accessibilityRole="button"
          // 스크린리더 문구는 기존 키만 재사용한다(locales는 이번 범위 밖).
          // 왼쪽 '이전'에 해당하는 키가 없어 왼쪽 화살표에는 라벨을 못 붙였다.
          accessibilityLabel={isLast ? t('appIntro.getStarted') : t('common.next')}
        >
          {isLast ? <Text style={styles.startLabel}>{t('appIntro.getStarted')}</Text> : null}
          <ChevronGlyph dir="right" color="#EC34F7" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0F' },
  flatList: { flex: 1 },
  // width는 Stage 폭에서 파생되므로 renderSlide에서 인라인으로 주입한다.
  slide: {
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

  // 하단 페이드 + 좌우 화살표
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // 화살표 터치 영역 — 컨테이너 56×48에 hitSlop 10을 더해 44pt 최소 규격을 넘긴다.
  arrowBtn: {
    width: 56,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowBtnRight: {
    minWidth: 56,
    height: 48,
    paddingLeft: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  startLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#EC34F7',
  },
});
