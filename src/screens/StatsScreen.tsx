import React, { useRef, useState, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { useRecords } from '../store/recordStore';
import { COUNTRIES } from '../constants/countries';
import { getCurrentSession } from '../services/auth';
import MainCoachmark, { CoachStep, CoachRect } from '../components/MainCoachmark';
import Svg, { Path as SvgPath } from 'react-native-svg';

// 통계 튜토리얼 1회 노출 플래그 키 (계정별)
const STATS_TUTORIAL_KEY = '@eorth/statsTutorialSeen';

// 헤더 'analysis' 워드마크 (analysis.svg) — 소셜 글자 본체(x-height ≈18.9, 자연 1:1)와 동일 크기로
// analysis x-height(≈27.5/52)를 소셜과 같게: 52 × 18.9/27.5 ≈ 36
const AnalysisWordmark = ({ height = 36, color = Colors.textPrimary }: { height?: number; color?: string }) => (
  <Svg width={(218 / 52) * height} height={height} viewBox="0 0 218 52" fill="none">
    <SvgPath
      d="M20.7349 12.76H29.8649V40.26H20.7349V37.73C18.8649 39.93 16.2616 41.03 12.9249 41.03C9.25827 41.03 6.17827 39.655 3.68493 36.905C1.22827 34.1183 -6.83479e-05 30.6533 -6.83479e-05 26.51C-6.83479e-05 22.3667 1.22827 18.92 3.68493 16.17C6.17827 13.3833 9.25827 11.99 12.9249 11.99C16.2616 11.99 18.8649 13.09 20.7349 15.29V12.76ZM10.7799 30.855C11.8433 31.955 13.2366 32.505 14.9599 32.505C16.6833 32.505 18.0766 31.955 19.1399 30.855C20.2033 29.755 20.7349 28.3067 20.7349 26.51C20.7349 24.7133 20.2033 23.265 19.1399 22.165C18.0766 21.065 16.6833 20.515 14.9599 20.515C13.2366 20.515 11.8433 21.065 10.7799 22.165C9.7166 23.265 9.18493 24.7133 9.18493 26.51C9.18493 28.3067 9.7166 29.755 10.7799 30.855ZM53.5828 11.99C56.5528 11.99 58.9728 13.0167 60.8428 15.07C62.7495 17.0867 63.7028 20.0017 63.7028 23.815V40.26H54.5728V24.97C54.5728 23.54 54.1878 22.4583 53.4178 21.725C52.6845 20.9917 51.6945 20.625 50.4478 20.625C49.0178 20.625 47.8995 21.065 47.0928 21.945C46.3228 22.7883 45.9378 24.0167 45.9378 25.63V40.26H36.8078V12.76H45.9378V15.51C47.5878 13.1633 50.1362 11.99 53.5828 11.99ZM89.6697 12.76H98.7997V40.26H89.6697V37.73C87.7997 39.93 85.1964 41.03 81.8597 41.03C78.193 41.03 75.113 39.655 72.6197 36.905C70.163 34.1183 68.9347 30.6533 68.9347 26.51C68.9347 22.3667 70.163 18.92 72.6197 16.17C75.113 13.3833 78.193 11.99 81.8597 11.99C85.1964 11.99 87.7997 13.09 89.6697 15.29V12.76ZM79.7147 30.855C80.778 31.955 82.1714 32.505 83.8947 32.505C85.618 32.505 87.0114 31.955 88.0747 30.855C89.138 29.755 89.6697 28.3067 89.6697 26.51C89.6697 24.7133 89.138 23.265 88.0747 22.165C87.0114 21.065 85.618 20.515 83.8947 20.515C82.1714 20.515 80.778 21.065 79.7147 22.165C78.6514 23.265 78.1197 24.7133 78.1197 26.51C78.1197 28.3067 78.6514 29.755 79.7147 30.855ZM105.743 40.26V0.110009H114.873V40.26H105.743ZM139.222 12.76H149.342L139.937 39.82C138.47 43.9633 136.399 46.9517 133.722 48.785C131.045 50.6183 127.58 51.4433 123.327 51.26V42.68C125.27 42.68 126.737 42.4417 127.727 41.965C128.717 41.4883 129.524 40.6267 130.147 39.38L119.147 12.76H129.377L134.932 28.71L139.222 12.76ZM160.703 20.79C160.703 21.3033 161.161 21.725 162.078 22.055C163.031 22.385 164.168 22.6967 165.488 22.99C166.844 23.2833 168.183 23.705 169.503 24.255C170.859 24.7683 171.996 25.6667 172.913 26.95C173.866 28.2333 174.343 29.8467 174.343 31.79C174.343 34.9433 173.169 37.2717 170.823 38.775C168.476 40.2783 165.689 41.03 162.463 41.03C156.303 41.03 152.196 38.8483 150.143 34.485L158.118 30.47C158.814 32.4867 160.244 33.495 162.408 33.495C164.058 33.495 164.883 33 164.883 32.01C164.883 31.4967 164.424 31.075 163.508 30.745C162.591 30.415 161.473 30.085 160.153 29.755C158.833 29.425 157.513 28.985 156.193 28.435C154.873 27.885 153.754 27.005 152.838 25.795C151.921 24.5483 151.463 23.0267 151.463 21.23C151.463 18.2967 152.544 16.0233 154.708 14.41C156.871 12.7967 159.474 11.99 162.518 11.99C167.944 11.99 171.721 14.1167 173.848 18.37L166.148 21.835C165.341 20.2583 164.204 19.47 162.738 19.47C161.381 19.47 160.703 19.91 160.703 20.79ZM187.8 8.96501C186.773 9.99168 185.545 10.505 184.115 10.505C182.685 10.505 181.438 9.99168 180.375 8.96501C179.348 7.90167 178.835 6.65501 178.835 5.22501C178.835 3.79501 179.348 2.56667 180.375 1.54001C181.438 0.51334 182.685 6.85453e-06 184.115 6.85453e-06C185.545 6.85453e-06 186.773 0.51334 187.8 1.54001C188.863 2.56667 189.395 3.79501 189.395 5.22501C189.395 6.65501 188.863 7.90167 187.8 8.96501ZM179.55 40.26V12.76H188.68V40.26H179.55ZM204.178 20.79C204.178 21.3033 204.637 21.725 205.553 22.055C206.507 22.385 207.643 22.6967 208.963 22.99C210.32 23.2833 211.658 23.705 212.978 24.255C214.335 24.7683 215.472 25.6667 216.388 26.95C217.342 28.2333 217.818 29.8467 217.818 31.79C217.818 34.9433 216.645 37.2717 214.298 38.775C211.952 40.2783 209.165 41.03 205.938 41.03C199.778 41.03 195.672 38.8483 193.618 34.485L201.593 30.47C202.29 32.4867 203.72 33.495 205.883 33.495C207.533 33.495 208.358 33 208.358 32.01C208.358 31.4967 207.9 31.075 206.983 30.745C206.067 30.415 204.948 30.085 203.628 29.755C202.308 29.425 200.988 28.985 199.668 28.435C198.348 27.885 197.23 27.005 196.313 25.795C195.397 24.5483 194.938 23.0267 194.938 21.23C194.938 18.2967 196.02 16.0233 198.183 14.41C200.347 12.7967 202.95 11.99 205.993 11.99C211.42 11.99 215.197 14.1167 217.323 18.37L209.623 21.835C208.817 20.2583 207.68 19.47 206.213 19.47C204.857 19.47 204.178 19.91 204.178 20.79Z"
      fill={color}
    />
  </Svg>
);

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

type StatType = 'world' | 'yearly' | 'region' | 'countries' | 'rating';

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { records } = useRecords();

  const goToDetail = (statType: StatType) => {
    navigation.navigate('StatsDetail', { statType });
  };

  // 대륙 키(한글, COUNTRIES 데이터 기준)를 표시용 라벨로 변환
  const continentName = (cont: string) => {
    switch (cont) {
      case '아시아': return t('stats.continentAsia');
      case '유럽': return t('stats.continentEurope');
      case '아메리카': return t('stats.continentAmerica');
      case '오세아니아': return t('stats.continentOceania');
      case '아프리카': return t('stats.continentAfrica');
      default: return cont;
    }
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
              title: t('stats.coachTitle'),
              desc: t('stats.coachDesc'),
            },
            {
              rect: hero,
              title: t('stats.coach2Title'),
              desc: t('stats.coach2Desc'),
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
      <View style={[styles.header, { paddingTop: insets.top + 17 }]}>
        <AnalysisWordmark height={36} />
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
                  <Text style={styles.heroLabel}>🌏 {t('comp2.worldTraveled')}</Text>
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
                  <Text style={styles.miniStatLbl}>{t('stats.miniCountries')}</Text>
                </View>
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatVal}>{cityCount}</Text>
                  <Text style={styles.miniStatLbl}>{t('stats.miniCities')}</Text>
                </View>
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatVal}>{recordsCount}</Text>
                  <Text style={styles.miniStatLbl}>{t('stats.miniRecords')}</Text>
                </View>
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatVal}>{totalDays}</Text>
                  <Text style={styles.miniStatLbl}>{t('stats.miniDays')}</Text>
                </View>
              </View>
            </LinearGradient>
        </PressCard>
        </View>

        {/* Row 2: 연도별 여행 횟수 + 대륙별 방문 현황 */}
        <View style={styles.statsRow}>
          {/* 1번 - Yearly bar chart */}
          <PressCard style={[styles.card, styles.halfCard]} onPress={() => goToDetail('yearly')}>
            <Text style={styles.cardTitle}>{t('stats.cardYearlyTrips')}</Text>
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
            <Text style={styles.cardTitle}>{t('stats.cardContinents')}</Text>
            {REGION_STATS.map((r, i) => (
              <View key={i} style={styles.regionRow}>
                <View style={styles.regionLeft}>
                  <View style={[styles.regionDot, { backgroundColor: r.color }]} />
                  <Text style={styles.regionLabel}>{continentName(r.label)}</Text>
                </View>
                <View style={styles.regionBarBg}>
                  <LinearGradient
                    colors={[r.color, r.color + '88']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.regionBar, { width: `${r.pct * 100}%` }]}
                  />
                </View>
                <Text style={styles.regionCount}>{t('stats.countUnit', { count: r.count })}</Text>
              </View>
            ))}
          </PressCard>
        </View>

        {/* Row 3: TOP 5 + 여행 평가 */}
        <View style={styles.statsRow}>
          {/* 3번 - Top countries */}
          <PressCard style={[styles.card, styles.halfCard]} onPress={() => goToDetail('countries')}>
            <Text style={styles.cardTitle}>{t('stats.cardTopCountries')}</Text>
            {TOP_COUNTRIES.length > 0 ? (
              TOP_COUNTRIES.map((c) => (
                <View key={c.rank} style={styles.topRow}>
                  <Text style={[styles.rankNum, c.gold && { color: Colors.gold }]}>
                    #{c.rank}
                  </Text>
                  <Text style={styles.topFlag}>{c.flag}</Text>
                  <Text style={styles.topName}>{c.name}</Text>
                  <Text style={styles.topVisits}>{t('stats.visitsUnit', { count: c.visits })}</Text>
                </View>
              ))
            ) : (
              <Text style={{ color: Colors.textMuted, fontSize: Typography.fontSize.xs, textAlign: 'center', marginTop: 24 }}>{t('stats.noRecords')}</Text>
            )}
          </PressCard>

          {/* 4번 - Travel rating stats */}
          <PressCard style={[styles.card, styles.halfCard]} onPress={() => goToDetail('rating')}>
            <Text style={styles.cardTitle}>{t('stats.cardRating')}</Text>
            <View style={styles.ratingOverview}>
              <Text style={styles.ratingBig}>{avgRating}</Text>
              <View style={styles.ratingStars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Text key={star} style={styles.ratingStar}>
                    {star <= Math.round(Number(avgRating)) ? '★' : '☆'}
                  </Text>
                ))}
              </View>
              <Text style={styles.ratingCount}>{t('stats.ratingBasis', { count: myRecords.length })}</Text>
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
    // 소셜탭 헤더와 동일 배치: 좌측 36, 상단 정렬
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingLeft: 36,
    paddingRight: Spacing[6],
    paddingBottom: Spacing[3],
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
