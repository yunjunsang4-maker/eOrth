import React, { useState, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Colors, Typography, Spacing } from '../constants';
import { PrimaryButton, PaginationDots } from '../components/ui';
import type { RootStackScreenProps } from '../navigation/types';

const { width } = Dimensions.get('window');

// 문구는 i18n(appIntro.slides.*)에서 가져오고, 여기엔 구조 정보(이모지·강조 줄)만 둔다.
const SLIDES = [
  {
    id: '1',
    emoji: '🌏',
    titleKey: 'appIntro.slides.1.title',
    subtitleKey: 'appIntro.slides.1.subtitle',
    highlightLines: [1], // 강조할 줄 인덱스
  },
  {
    id: '2',
    emoji: '📖',
    titleKey: 'appIntro.slides.2.title',
    subtitleKey: 'appIntro.slides.2.subtitle',
    highlightLines: [1],
  },
  {
    id: '3',
    emoji: '🤝',
    titleKey: 'appIntro.slides.3.title',
    subtitleKey: 'appIntro.slides.3.subtitle',
    highlightLines: [0],
  },
] as const;

type Props = RootStackScreenProps<'AppIntro'>;

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

  const renderSlide = ({ item, index }: { item: typeof SLIDES[number]; index: number }) => {
    const lines = t(item.titleKey).split('\n');
    return (
      <View style={[styles.slide, { paddingTop: insets.top + 52 }]}>
        {/* Globe / Illustration area */}
        <View style={styles.illustrationWrap}>
          <View style={styles.bgGlow} />
          {/* Concentric circles */}
          <View style={[styles.ring, { width: 280, height: 280, borderRadius: 140, borderColor: 'rgba(123,97,255,0.08)' }]} />
          <View style={[styles.ring, { width: 220, height: 220, borderRadius: 110, borderColor: 'rgba(123,97,255,0.15)' }]} />
          <View style={[styles.ring, { width: 160, height: 160, borderRadius: 80, borderColor: 'rgba(123,97,255,0.25)' }]} />
          <LinearGradient
            colors={['#4A2FCB', '#7B61FF', '#C084FC']}
            start={{ x: 0.2, y: 0.1 }}
            end={{ x: 0.8, y: 0.9 }}
            style={styles.globe}
          >
            <View style={styles.latLine} />
            <View style={[styles.latLine, { top: '55%' }]} />
            <View style={styles.lonLine} />
          </LinearGradient>
          {/* Country dots */}
          {[
            { top: '25%' as any, left: '30%' as any }, { top: '40%' as any, right: '25%' as any },
            { bottom: '30%' as any, left: '45%' as any }, { top: '20%' as any, right: '35%' as any },
          ].map((pos, i) => (
            <View key={i} style={[styles.countryDot, pos]} />
          ))}
        </View>

        {/* Text content */}
        <View style={styles.textBlock}>
          <Text style={styles.title}>
            {lines.map((line, li) => (
              <Text key={li}>
                {(item.highlightLines as readonly number[]).includes(li) ? (
                  <Text style={styles.titleHighlight}>{line}</Text>
                ) : (
                  line
                )}
                {li < lines.length - 1 ? '\n' : ''}
              </Text>
            ))}
          </Text>
          <Text style={styles.subtitle}>{t(item.subtitleKey)}</Text>
        </View>
      </View>
    );
  };

  return (
    <LinearGradient colors={['#0A0118', '#100620']} style={styles.container}>
      {/* Slides (Disabled manual scrolling, only next button is allowed) */}
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

      {/* Bottom controls */}
      <View style={styles.bottomArea}>
        <PaginationDots count={SLIDES.length} activeIndex={activeIdx} />
        <PrimaryButton
          label={activeIdx === SLIDES.length - 1 ? t('appIntro.getStarted') : t('common.next')}
          onPress={goNext}
          style={styles.nextBtn}
        />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flatList: { flex: 1 },
  slide: {
    width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 20,
    paddingHorizontal: Spacing[6],
  },
  illustrationWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  bgGlow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(123, 97, 255, 0.08)',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
  },
  globe: {
    width: 150,
    height: 150,
    borderRadius: 75,
    overflow: 'hidden',
    shadowColor: '#7B61FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 25,
    elevation: 15,
  },
  latLine: {
    position: 'absolute',
    top: '35%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  lonLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  countryDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 5,
  },
  textBlock: {
    width: '100%',
    paddingBottom: Spacing[4],
  },
  title: {
    fontSize: 28,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    lineHeight: 38,
    letterSpacing: -0.5,
    marginBottom: Spacing[3],
  },
  titleHighlight: {
    color: Colors.primary,
  },
  subtitle: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  bottomArea: {
    paddingHorizontal: Spacing[6],
    paddingBottom: 48,
    gap: Spacing[5],
    width: '100%',
  },
  nextBtn: {
    width: '100%',
  },
});
