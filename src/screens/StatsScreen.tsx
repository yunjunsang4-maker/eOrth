import React, { useRef, useState, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { BlurView } from 'expo-blur';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { useRecords } from '../store/recordStore';
import { COUNTRIES } from '../constants/countries';
import { getCurrentSession } from '../services/auth';
import MainCoachmark, { CoachStep, CoachRect } from '../components/MainCoachmark';

// 통계 튜토리얼 1회 노출 플래그 키 (계정별)
const STATS_TUTORIAL_KEY = '@eorth/statsTutorialSeen';

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
      <Animated.View style={[style, { transform: [{ scale }], overflow: 'hidden' }]}>
        {/* 리퀴드 글래스 블러 효과 */}
        <BlurView
          intensity={30}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* 미세 그라데이션 반사 하이라이트 (Specular) */}
        <LinearGradient
          colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', opacity: 0.3 }}
          pointerEvents="none"
        />

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

type StatType = 'world' | 'yearly' | 'region' | 'countries' | 'rating';

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { records } = useRecords();

  const goToDetail = (statType: StatType) => {
    navigation.navigate('StatsDetail', { statType });
  };

  // ── 통계 튜토리얼(코치마크) — 계정당 통계 탭 첫 진입 시 1회 ──
  const heroRef = useRef<any>(null);
  const [coachVisible, setCoachVisible] = useState(false);
  const [coachSteps, setCoachSteps] = useState<CoachStep[]>([]);
  const tutorialStarted = useRef(false); // 같은 세션에서 포커스마다 재실행 방지

  const measure = (ref: React.MutableRefObject<any>) =>
    new Promise<CoachRect | null>((resolve) => {
      const node = ref.current;
      if (!node || typeof node.measureInWindow !== 'function') return resolve(null);
      node.measureInWindow((x: number, y: number, width: number, height: number) => {
        if ([x, y, width, height].some((v) => typeof v !== 'number' || Number.isNaN(v))) resolve(null);
        else resolve({ x, y, width, height });
      });
    });

  useFocusEffect(
    useCallback(() => {
      if (tutorialStarted.current) return;
      tutorialStarted.current = true;
      let cancelled = false;
      (async () => {
        // 계정별 키 (로그인 세션 없으면 guest)
        const session = await getCurrentSession();
        const uid = session?.user?.id || 'guest';
        const key = `${STATS_TUTORIAL_KEY}:${uid}`;
        const seen = await AsyncStorage.getItem(key).catch(() => null);
        if (seen || cancelled) return;
        setTimeout(async () => {
          if (cancelled) return;
          const hero = await measure(heroRef);
          setCoachSteps([
            {
              rect: null,
              title: '여행 통계 📊',
              desc: '그동안의 여행을 한눈에 모았어요. 방문한 나라·도시·기록 수와 평가까지 통계로 확인할 수 있어요.',
            },
            {
              rect: hero,
              title: '상세 통계 보기',
              desc: '각 통계 카드를 탭하면 더 자세한 상세 통계를 볼 수 있어요.',
            },
          ]);
          setCoachVisible(true);
          AsyncStorage.setItem(key, '1').catch(() => {});
        }, 450);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  // Filter to "my posts" (including seed data for demo consistency)
  const myRecords = records.filter((r) => r.isMyPost !== false);

  // 1. World Explorations Hero Stats
  const visitedCountriesSet = new Set<string>();
  const visitedCountriesList: { name: string; flag: string }[] = [];
  const visitedCitiesSet = new Set<string>();

  myRecords.forEach((r) => {
    if (r.countries && r.countries.length > 0) {
      r.countries.forEach((c) => {
        if (!visitedCountriesSet.has(c.name)) {
          visitedCountriesSet.add(c.name);
          visitedCountriesList.push({ name: c.name, flag: c.flag });
        }
      });
    } else if (r.countryName) {
      if (!visitedCountriesSet.has(r.countryName)) {
        visitedCountriesSet.add(r.countryName);
        visitedCountriesList.push({ name: r.countryName, flag: r.countryFlag || '' });
      }
    }

    if (r.regionName) {
      visitedCitiesSet.add(r.regionName);
    }
  });

  const countryCount = visitedCountriesSet.size;
  const cityCount = visitedCitiesSet.size || countryCount;
  const recordsCount = myRecords.length;

  let totalDays = 0;
  myRecords.forEach((r) => {
    if (r.startDate && r.endDate) {
      const start = new Date(r.startDate.replace(/\./g, '-'));
      const end = new Date(r.endDate.replace(/\./g, '-'));
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        totalDays += diffDays;
      } else {
        totalDays += 1;
      }
    } else {
      totalDays += 1;
    }
  });

  const worldCoveragePct = (((countryCount / 195) * 100).toFixed(1) + '%') as any;

  // 2. Yearly Travel History
  const yearlyCounts: Record<string, number> = {};
  myRecords.forEach((r) => {
    const yearStr = r.date ? r.date.split('.')[0] : (r.startDate ? r.startDate.split('.')[0] : '');
    if (yearStr && yearStr.length === 4) {
      yearlyCounts[yearStr] = (yearlyCounts[yearStr] || 0) + 1;
    }
  });

  const currentYear = new Date().getFullYear();
  const VISIT_HISTORY = [];
  for (let i = 6; i >= 0; i--) {
    const year = String(currentYear - i);
    VISIT_HISTORY.push({
      year,
      visits: yearlyCounts[year] || 0,
    });
  }
  const MAX_VISITS = Math.max(...VISIT_HISTORY.map((v) => v.visits), 1);

  // 3. Continent Breakdown
  const continentColors: Record<string, string> = {
    '아시아': '#7B61FF',
    '유럽': '#C084FC',
    '아메리카': '#4A9EFF',
    '오세아니아': '#4ADE80',
    '아프리카': '#F87171',
  };

  const continentCounts: Record<string, number> = {
    '아시아': 0,
    '유럽': 0,
    '아메리카': 0,
    '오세아니아': 0,
  };

  myRecords.forEach((r) => {
    const countryNames: string[] = [];
    if (r.countries && r.countries.length > 0) {
      r.countries.forEach((c) => countryNames.push(c.name));
    } else if (r.countryName) {
      countryNames.push(r.countryName);
    }

    countryNames.forEach((name) => {
      const cMeta = COUNTRIES.find((c) => c.name === name);
      if (cMeta) {
        let cont = cMeta.continent;
        if (cont === '북아메리카' || cont === '남아메리카') {
          cont = '아메리카';
        }
        if (cont in continentCounts) {
          continentCounts[cont]++;
        } else {
          continentCounts[cont] = (continentCounts[cont] || 0) + 1;
        }
      } else {
        continentCounts['아시아']++;
      }
    });
  });

  const totalContinentVisits = Object.values(continentCounts).reduce((a, b) => a + b, 0);
  const regionOrder = ['아시아', '유럽', '아메리카', '오세아니아', '아프리카'];
  const REGION_STATS = Object.keys(continentCounts).map((cont) => {
    const count = continentCounts[cont];
    const pct = totalContinentVisits > 0 ? count / totalContinentVisits : 0;
    return {
      label: cont,
      count,
      color: continentColors[cont] || '#7B61FF',
      pct,
    };
  })
  .filter((r) => r.count > 0 || regionOrder.slice(0, 4).includes(r.label))
  .sort((a, b) => regionOrder.indexOf(a.label) - regionOrder.indexOf(b.label));

  // 4. Top Countries
  const countryVisits: Record<string, { count: number; flag: string }> = {};
  myRecords.forEach((r) => {
    const countriesList: { name: string; flag: string }[] = [];
    if (r.countries && r.countries.length > 0) {
      r.countries.forEach((c) => countriesList.push(c));
    } else if (r.countryName) {
      countriesList.push({ name: r.countryName, flag: r.countryFlag || '' });
    }

    countriesList.forEach((c) => {
      if (!countryVisits[c.name]) {
        countryVisits[c.name] = { count: 0, flag: c.flag };
      }
      countryVisits[c.name].count++;
    });
  });

  const sortedCountries = Object.keys(countryVisits)
    .map((name) => ({
      name,
      flag: countryVisits[name].flag,
      visits: countryVisits[name].count,
    }))
    .sort((a, b) => b.visits - a.visits);

  const TOP_COUNTRIES = sortedCountries.slice(0, 5).map((c, index) => ({
    rank: index + 1,
    flag: c.flag,
    name: c.name,
    visits: c.visits,
    gold: index === 0,
  }));

  // 5. Travel Rating Stats
  const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let ratingSum = 0;
  let ratedRecordsCount = 0;

  myRecords.forEach((r) => {
    let rating = r.rating;
    if (rating === undefined && r.perCountryData) {
      const ratings = Object.values(r.perCountryData)
        .map((d) => d.rating)
        .filter(Boolean) as number[];
      if (ratings.length > 0) {
        rating = Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length);
      }
    }

    if (rating !== undefined && rating >= 1 && rating <= 5) {
      ratingCounts[rating as 5 | 4 | 3 | 2 | 1]++;
      ratingSum += rating;
      ratedRecordsCount++;
    }
  });

  const avgRating = ratedRecordsCount > 0 ? (ratingSum / ratedRecordsCount).toFixed(1) : '0.0';

  const RATING_STATS = [5, 4, 3, 2, 1].map((star) => {
    const count = ratingCounts[star as 5 | 4 | 3 | 2 | 1];
    const pct = ratedRecordsCount > 0 ? count / ratedRecordsCount : 0;
    return {
      star,
      count,
      pct,
    };
  });

  return (
    <LinearGradient colors={['#0A0118', '#100620']} style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.headerTitle}>통계</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: 110 }]}>
        {/* World coverage hero */}
        <View ref={heroRef} collapsable={false}>
        <PressCard style={styles.heroCard} onPress={() => goToDetail('world')} glowColor="rgba(123,97,255,0.18)">
          <LinearGradient
            colors={['rgba(26,26,46,0.3)', 'rgba(22,20,42,0.3)']}
            style={styles.heroCardGrad}
          >
              <View style={styles.heroTop}>
                <View>
                  <Text style={styles.heroPercentage}>{worldCoveragePct}</Text>
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
                  style={[styles.progressBarFill, { width: worldCoveragePct }]}
                />
              </View>
              <View style={styles.heroStats}>
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatVal}>{countryCount}</Text>
                  <Text style={styles.miniStatLbl}>나라</Text>
                </View>
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatVal}>{cityCount}</Text>
                  <Text style={styles.miniStatLbl}>도시</Text>
                </View>
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatVal}>{recordsCount}</Text>
                  <Text style={styles.miniStatLbl}>기록</Text>
                </View>
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatVal}>{totalDays}</Text>
                  <Text style={styles.miniStatLbl}>일수</Text>
                </View>
              </View>
            </LinearGradient>
        </PressCard>
        </View>

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
            {TOP_COUNTRIES.length > 0 ? (
              TOP_COUNTRIES.map((c) => (
                <View key={c.rank} style={styles.topRow}>
                  <Text style={[styles.rankNum, c.gold && { color: Colors.gold }]}>
                    #{c.rank}
                  </Text>
                  <Text style={styles.topFlag}>{c.flag}</Text>
                  <Text style={styles.topName}>{c.name}</Text>
                  <Text style={styles.topVisits}>{c.visits}회</Text>
                </View>
              ))
            ) : (
              <Text style={{ color: Colors.textMuted, fontSize: Typography.fontSize.xs, textAlign: 'center', marginTop: 24 }}>기록이 없습니다</Text>
            )}
          </PressCard>

          {/* 4번 - Travel rating stats */}
          <PressCard style={[styles.card, styles.halfCard]} onPress={() => goToDetail('rating')}>
            <Text style={styles.cardTitle}>여행 평가 통계</Text>
            <View style={styles.ratingOverview}>
              <Text style={styles.ratingBig}>{avgRating}</Text>
              <View style={styles.ratingStars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Text key={star} style={styles.ratingStar}>
                    {star <= Math.round(Number(avgRating)) ? '★' : '☆'}
                  </Text>
                ))}
              </View>
              <Text style={styles.ratingCount}>총 {myRecords.length}개 기록 기준</Text>
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

      {/* 통계 튜토리얼 코치마크 */}
      <MainCoachmark
        visible={coachVisible}
        steps={coachSteps}
        onClose={() => setCoachVisible(false)}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
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
    borderColor: 'rgba(255, 255, 255, 0.12)',
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
    backgroundColor: 'rgba(26, 26, 38, 0.45)',
    borderRadius: BorderRadius['2xl'],
    padding: Spacing[4],
    marginBottom: Spacing[4],
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
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
