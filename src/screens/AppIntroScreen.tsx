import React, { useState, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  FlatList,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { PrimaryButton, PaginationDots } from '../components/ui';
import type { RootStackScreenProps } from '../navigation/types';

const { width, height } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    emoji: '🌏',
    title: '지구본을 돌리며\n나만의 세계를\n만들어보세요.',
    subtitle: '방문한 나라들이 지구본 위에서 특별하게 빛나요',
    highlightLines: [1], // "나만의 세계를" is highlighted
  },
  {
    id: '2',
    emoji: '📖',
    title: '소중한 여행의\n기억을 기록하고\n간직하세요.',
    subtitle: '사진, 날짜, 별점으로 여행의 순간을 담아보세요',
    highlightLines: [1],
  },
  {
    id: '3',
    emoji: '🤝',
    title: '친구들과 함께\n여행 이야기를 나눠보세요.',
    subtitle: '소셜 피드에서 서로의 여행을 구경하고 공유해요',
    highlightLines: [0],
  },
];

type Props = RootStackScreenProps<'AppIntro'>;

export default function AppIntroScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [activeIdx, setActiveIdx] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const goNext = () => {
    if (activeIdx < SLIDES.length - 1) {
      const nextIdx = activeIdx + 1;
      setActiveIdx(nextIdx);
      flatListRef.current?.scrollToIndex({ index: nextIdx, animated: true });
    } else {
      navigation.replace('Login');
    }
  };

  const renderSlide = ({ item, index }: { item: typeof SLIDES[0]; index: number }) => {
    const lines = item.title.split('\n');
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
                {item.highlightLines.includes(li) ? (
                  <Text style={styles.titleHighlight}>{line}</Text>
                ) : (
                  line
                )}
                {li < lines.length - 1 ? '\n' : ''}
              </Text>
            ))}
          </Text>
          <Text style={styles.subtitle}>{item.subtitle}</Text>
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
          label={activeIdx === SLIDES.length - 1 ? '시작하기' : '다음'}
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
  skipBtn: {
    position: 'absolute',
    top: 56,
    right: Spacing[6],
    zIndex: 10,
    padding: Spacing[2],
  },
  skipText: {
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
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
