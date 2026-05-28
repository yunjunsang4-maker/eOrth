import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  Pressable,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';

// ─── 눌림 애니메이션 카드 ───
// Pressable 에도 레이아웃 스타일(flex, margin 등)을 동시 적용해 flex 배치가 깨지지 않게 함
const LAYOUT_KEYS = new Set([
  'flex', 'flexGrow', 'flexShrink', 'flexBasis',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical',
  'alignSelf', 'position', 'top', 'bottom', 'left', 'right',
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
]);

function PressCard({
  style,
  onPress,
  children,
  glowColor = 'rgba(123,97,255,0.15)',
}: {
  style?: any;
  onPress: () => void;
  children: React.ReactNode;
  glowColor?: string;
}) {
  const scale       = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  const handlePressIn = () => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 0.955,
        useNativeDriver: true,
        tension: 400,
        friction: 10,
      }),
      Animated.timing(glowOpacity, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 280,
        friction: 9,
      }),
      Animated.timing(glowOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // 배열 스타일을 평탄화한 뒤 레이아웃 관련 키만 추출해 Pressable 에도 적용
  const flat: Record<string, any> = StyleSheet.flatten(style as any) ?? {};
  const layoutStyle: Record<string, any> = {};
  for (const key of Object.keys(flat)) {
    if (LAYOUT_KEYS.has(key)) layoutStyle[key] = flat[key];
  }

  const borderRadius = flat.borderRadius ?? 24;

  return (
    <Pressable style={layoutStyle} onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius,
              backgroundColor: glowColor,
              opacity: glowOpacity,
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

const { width } = Dimensions.get('window');

const REGION_STATS = [
  { label: '아시아', count: 8, color: '#7B61FF', pct: 0.72 },
  { label: '유럽', count: 3, color: '#C084FC', pct: 0.27 },
  { label: '아메리카', count: 1, color: '#4A9EFF', pct: 0.09 },
  { label: '오세아니아', count: 0, color: '#4ADE80', pct: 0 },
];

const VISIT_HISTORY = [
  { year: '2019', visits: 1 },
  { year: '2020', visits: 0 },
  { year: '2021', visits: 1 },
  { year: '2022', visits: 3 },
  { year: '2023', visits: 5 },
  { year: '2024', visits: 7 },
  { year: '2025', visits: 4 },
];
const MAX_VISITS = Math.max(...VISIT_HISTORY.map((v) => v.visits));

const TOP_COUNTRIES = [
  { rank: 1, flag: '🇯🇵', name: '일본', visits: 3, gold: true },
  { rank: 2, flag: '🇺🇸', name: '미국', visits: 2, gold: false },
  { rank: 3, flag: '🇫🇷', name: '프랑스', visits: 1, gold: false },
  { rank: 4, flag: '🇹🇭', name: '태국', visits: 1, gold: false },
  { rank: 5, flag: '🇸🇬', name: '싱가포르', visits: 1, gold: false },
];

const RATING_STATS = [
  { star: 5, count: 8, pct: 0.29 },
  { star: 4, count: 12, pct: 0.43 },
  { star: 3, count: 5, pct: 0.18 },
  { star: 2, count: 2, pct: 0.07 },
  { star: 1, count: 1, pct: 0.03 },
];

type StatType = 'world' | 'yearly' | 'region' | 'countries' | 'rating';

export default function StatsScreen() {
  const navigation = useNavigation<any>();

  const goToDetail = (statType: StatType) => {
    navigation.navigate('StatsDetail', { statType });
  };

  return (
    <LinearGradient colors={['#0A0118', '#100620']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>통계</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* World coverage hero */}
        <PressCard style={styles.heroCard} onPress={() => goToDetail('world')} glowColor="rgba(123,97,255,0.18)">
          <LinearGradient
            colors={['#1A1A2E', '#16142A']}
            style={styles.heroCardGrad}
          >
              <View style={styles.heroTop}>
                <View>
                  <Text style={styles.heroPercentage}>12.3%</Text>
                  <Text style={styles.heroLabel}>🌏 세계를 여행했어요</Text>
                </View>
                <View style={styles.globeMini}>
                  <LinearGradient colors={['#3B1E8E', '#7B61FF']} style={styles.globeMiniGrad} />
                </View>
              </View>
              {/* Progress bar */}
              <View style={styles.progressBarBg}>
                <LinearGradient
                  colors={['#7B61FF', '#C084FC']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.progressBarFill, { width: '12.3%' }]}
                />
              </View>
              <View style={styles.heroStats}>
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatVal}>5</Text>
                  <Text style={styles.miniStatLbl}>나라</Text>
                </View>
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatVal}>12</Text>
                  <Text style={styles.miniStatLbl}>도시</Text>
                </View>
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatVal}>28</Text>
                  <Text style={styles.miniStatLbl}>기록</Text>
                </View>
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatVal}>49</Text>
                  <Text style={styles.miniStatLbl}>일수</Text>
                </View>
              </View>
            </LinearGradient>
        </PressCard>

        {/* Row 2: 연도별 여행 횟수 + 대륙별 방문 현황 */}
        <View style={styles.statsRow}>
          {/* 1번 - Yearly bar chart */}
          <PressCard style={[styles.card, styles.halfCard]} onPress={() => goToDetail('yearly')}>
            <Text style={styles.cardTitle}>연도별 여행 횟수</Text>
            <View style={styles.barChart}>
              {VISIT_HISTORY.map((v, i) => (
                <View key={i} style={styles.barGroup}>
                  <View style={styles.barBg}>
                    {v.visits > 0 && (
                      <LinearGradient
                        colors={['#7B61FF', '#C084FC']}
                        style={[
                          styles.bar,
                          { height: `${(v.visits / MAX_VISITS) * 100}%` },
                        ]}
                      />
                    )}
                  </View>
                  <Text style={styles.barLabel}>{v.year.slice(2)}</Text>
                </View>
              ))}
            </View>
          </PressCard>

          {/* 2번 - Region breakdown */}
          <PressCard style={[styles.card, styles.halfCard]} onPress={() => goToDetail('region')}>
            <Text style={styles.cardTitle}>대륙별 방문 현황</Text>
            {REGION_STATS.map((r, i) => (
              <View key={i} style={styles.regionRow}>
                <View style={styles.regionLeft}>
                  <View style={[styles.regionDot, { backgroundColor: r.color }]} />
                  <Text style={styles.regionLabel}>{r.label}</Text>
                </View>
                <View style={styles.regionBarBg}>
                  <LinearGradient
                    colors={[r.color, r.color + '88']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.regionBar, { width: `${r.pct * 100}%` }]}
                  />
                </View>
                <Text style={styles.regionCount}>{r.count}개</Text>
              </View>
            ))}
          </PressCard>
        </View>

        {/* Row 3: TOP 5 + 여행 평가 */}
        <View style={styles.statsRow}>
          {/* 3번 - Top countries */}
          <PressCard style={[styles.card, styles.halfCard]} onPress={() => goToDetail('countries')}>
            <Text style={styles.cardTitle}>가장 많이 간 나라</Text>
            {TOP_COUNTRIES.map((c) => (
              <View key={c.rank} style={styles.topRow}>
                <Text style={[styles.rankNum, c.gold && { color: Colors.gold }]}>
                  #{c.rank}
                </Text>
                <Text style={styles.topFlag}>{c.flag}</Text>
                <Text style={styles.topName}>{c.name}</Text>
                <Text style={styles.topVisits}>{c.visits}회</Text>
              </View>
            ))}
          </PressCard>

          {/* 4번 - Travel rating stats */}
          <PressCard style={[styles.card, styles.halfCard]} onPress={() => goToDetail('rating')}>
            <Text style={styles.cardTitle}>여행 평가 통계</Text>
            <View style={styles.ratingOverview}>
              <Text style={styles.ratingBig}>4.2</Text>
              <View style={styles.ratingStars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Text key={star} style={styles.ratingStar}>
                    {star <= 4 ? '★' : '☆'}
                  </Text>
                ))}
              </View>
              <Text style={styles.ratingCount}>총 28개 기록 기준</Text>
            </View>
            <View style={styles.ratingBars}>
              {RATING_STATS.map((r) => (
                <View key={r.star} style={styles.ratingBarRow}>
                  <Text style={styles.ratingBarLabel}>{r.star}★</Text>
                  <View style={styles.ratingBarBg}>
                    <LinearGradient
                      colors={['#7B61FF', '#C084FC']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.ratingBarFill, { width: `${r.pct * 100}%` }]}
                    />
                  </View>
                  <Text style={styles.ratingBarCount}>{r.count}</Text>
                </View>
              ))}
            </View>
          </PressCard>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 56,
    paddingHorizontal: Spacing[6],
    paddingBottom: Spacing[4],
  },
  headerTitle: {
    fontSize: Typography.fontSize['2xl'],
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  scroll: { paddingHorizontal: Spacing[6], paddingBottom: 20 },

  statsRow: {
    flexDirection: 'row',
    gap: Spacing[3],
    marginBottom: Spacing[4],
  },
  halfCard: {
    flex: 1,
    marginBottom: 0,
  },

  heroCard: {
    marginBottom: Spacing[4],
    borderRadius: BorderRadius['2xl'],
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  heroCardGrad: { padding: Spacing[5] },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[4],
  },
  heroPercentage: {
    fontSize: Typography.fontSize['4xl'],
    fontFamily: Typography.fontFamily.extraBold,
    color: Colors.primary,
    letterSpacing: -1,
  },
  heroLabel: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  globeMini: {
    width: 70,
    height: 70,
    borderRadius: 35,
    overflow: 'hidden',
    shadowColor: '#7B61FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
    elevation: 8,
  },
  globeMiniGrad: { flex: 1 },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.bgCardAlt,
    marginBottom: Spacing[4],
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
  },
  heroStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  miniStat: { alignItems: 'center' },
  miniStatVal: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  miniStatLbl: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.regular,
    marginTop: 2,
  },

  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius['2xl'],
    padding: Spacing[4],
    marginBottom: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitle: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
    marginBottom: Spacing[3],
  },

  // Bar chart
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 70,
    gap: 2,
  },
  barGroup: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
  },
  barBg: {
    flex: 1,
    width: '100%',
    backgroundColor: Colors.bgCardAlt,
    borderRadius: 3,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  bar: {
    width: '100%',
    borderRadius: 3,
  },
  barLabel: {
    fontSize: 8,
    color: Colors.textMuted,
    marginTop: 3,
    fontFamily: Typography.fontFamily.regular,
  },

  // Region
  regionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing[2],
    gap: 4,
  },
  regionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 50,
    gap: 4,
  },
  regionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  regionLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.regular,
  },
  regionBarBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.bgCardAlt,
    overflow: 'hidden',
  },
  regionBar: {
    height: 8,
    borderRadius: 4,
    minWidth: 4,
  },
  regionCount: {
    fontSize: 10,
    color: Colors.textMuted,
    width: 22,
    textAlign: 'right',
    fontFamily: Typography.fontFamily.regular,
  },

  // Top
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing[2],
  },
  rankNum: {
    width: 22,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textSecondary,
  },
  topFlag: { fontSize: 18 },
  topName: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
  },
  topVisits: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.primary,
  },

  // Rating
  ratingOverview: {
    alignItems: 'center',
    marginBottom: Spacing[3],
  },
  ratingBig: {
    fontSize: Typography.fontSize['2xl'],
    fontFamily: Typography.fontFamily.extraBold,
    color: Colors.textPrimary,
    letterSpacing: -1,
  },
  ratingStars: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 3,
  },
  ratingStar: {
    fontSize: 14,
    color: '#FBBF24',
  },
  ratingCount: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.regular,
    marginTop: 4,
  },
  ratingBars: {
    gap: Spacing[2],
  },
  ratingBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  ratingBarLabel: {
    width: 22,
    fontSize: 10,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.regular,
    textAlign: 'right',
  },
  ratingBarBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.bgCardAlt,
    overflow: 'hidden',
  },
  ratingBarFill: {
    height: 8,
    borderRadius: 4,
    minWidth: 4,
  },
  ratingBarCount: {
    width: 16,
    fontSize: 10,
    color: Colors.textMuted,
    fontFamily: Typography.fontFamily.regular,
    textAlign: 'right',
  },

});
