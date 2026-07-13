import React, { useState, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
const SLIDES = [
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

export default function AppIntroScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [activeIdx, setActiveIdx] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const goNext = () => {
    if (activeIdx < SLIDES.length - 1) {
      const nextIdx = activeIdx + 1;
      setActiveIdx(nextIdx);
      flatListRef.current?.scrollToIndex({ index: nextIdx, animated: true });
    } else {
      navigation.replace('Login');
    }
  };

  const renderSlide = ({ item, index }: { item: (typeof SLIDES)[number]; index: number }) => {
    const V = item.Visual;
    return (
      <View style={styles.slide}>
        <V />
        {/* 텍스트 블록 — 하단 정렬 (시안: step 라벨 + 제목 + 설명) */}
        <View style={styles.textBlock}>
          <Text style={styles.stepLabel}>{`step 0${index + 1}`}</Text>
          <MarkedTitle raw={t(item.titleKey)} />
          <Text style={styles.subtitle}>{t(item.subtitleKey)}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StarFieldBackground opacity={0.5} />
      <IntroAmbient />

      {/* 슬라이드 (수동 스크롤 비활성 — 다음 버튼으로만 진행) */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        renderItem={renderSlide}
        style={styles.flatList}
      />

      {/* 상단 페이지 닷 — 시안: 활성 16×7 마젠타 필, 비활성 7×7 #3D3D55 */}
      <View style={[styles.dotsRow, { top: insets.top + 16 }]} pointerEvents="none">
        {SLIDES.map((s, i) => (
          <View key={s.id} style={[styles.dot, i === activeIdx && styles.dotActive]} />
        ))}
      </View>

      {/* 하단 페이드 + 다음/시작하기 버튼 (시안: 흰 10% 유리 필 + #CECFCD 그라데이션 테두리) */}
      <LinearGradient
        colors={['rgba(12,12,12,0)', '#0C0C0C']}
        style={styles.bottomFade}
        pointerEvents="none"
      />
      <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable style={styles.nextBtn} onPress={goNext}>
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
