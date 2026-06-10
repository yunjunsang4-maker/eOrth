import React, { useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Colors, Typography, Spacing } from '../constants';
import { useRecords } from '../store/recordStore';
import { COUNTRIES } from '../constants/countries';

// ─── 등장 애니메이션 래퍼 ───
function FadeSlideView({
  delay = 0,
  from = 22,
  children,
  style,
}: {
  delay?: number;
  from?: number;
  children: React.ReactNode;
  style?: any;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 420,
      delay,
      useNativeDriver: true,
      easing: Easing.out(Easing.exp),
    }).start();
  }, []);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [from, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const SW = Dimensions.get('window').width;

type StatType = 'world' | 'yearly' | 'region' | 'countries' | 'rating';
type RouteParams = { StatsDetail: { statType: StatType } };

// 통계 유형별 액센트 색상
const ACCENTS: Record<StatType, [string, string]> = {
  world:     ['#7B61FF', '#C084FC'],
  yearly:    ['#38BDF8', '#6366F1'],
  region:    ['#34D399', '#0EA5E9'],
  countries: ['#FBBF24', '#F97316'],
  rating:    ['#F472B6', '#A855F7'],
};

const ICONS: Record<StatType, string> = {
  world:     '🌍',
  yearly:    '📅',
  region:    '🗺️',
  countries: '🏳️',
  rating:    '⭐',
};

type Item = { label: string; value: string; sub?: string };

function parseNum(s: string): number {
  return parseInt(s.replace(/[^0-9]/g, '')) || 0;
}

// ─── 연도별 바 카드 ───
function YearlySection({ items, accent }: { items: Item[]; accent: [string, string] }) {
  const counts = items.map(it => parseNum(it.value));
  const max = Math.max(...counts, 1);
  return (
    <View style={s.section}>
      {items.map((item, i) => {
        const count = counts[i];
        const pct = count / max;
        const isEmpty = count === 0;
        return (
          <FadeSlideView key={i} delay={i * 65}>
            <View style={s.barCard}>
              <View style={s.barHeader}>
                <Text style={s.barYear}>{item.label}</Text>
                <Text style={[s.barValue, isEmpty && s.dimText]}>{item.value}</Text>
              </View>
              <View style={s.barTrack}>
                {isEmpty ? (
                  <View style={[s.barFill, { width: '3%', backgroundColor: '#2A2845' }]} />
                ) : (
                  <LinearGradient
                    colors={accent}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[s.barFill, { width: `${Math.max(pct * 100, 4)}%` }]}
                  />
                )}
              </View>
              {item.sub && <Text style={s.barSub}>{item.sub}</Text>}
            </View>
          </FadeSlideView>
        );
      })}
    </View>
  );
}

// ─── 대륙별 카드 ───
const REGION_ICONS: Record<string, string> = {
  '아시아': '🌏', '유럽': '🌍', '아메리카': '🌎',
  '오세아니아': '🏝️', '아프리카': '🌍', '남극': '❄️',
};
function RegionSection({ items, accent }: { items: Item[]; accent: [string, string] }) {
  const counts = items.map(it => parseNum(it.value));
  const regionMax = Math.max(...counts, 1);
  return (
    <View style={s.section}>
      {items.map((item, i) => {
        const count = counts[i];
        const pct = count / regionMax;
        const isEmpty = count === 0;
        const icon = REGION_ICONS[item.label] ?? '🌐';
        return (
          <FadeSlideView key={i} delay={i * 65}>
            <View style={[s.regionCard, isEmpty && s.regionCardDim]}>
              <View style={s.regionTop}>
                <Text style={s.regionIcon}>{icon}</Text>
                <View style={s.regionInfo}>
                  <Text style={[s.regionName, isEmpty && s.dimText]}>{item.label}</Text>
                  {item.sub && <Text style={s.regionSub}>{item.sub}</Text>}
                </View>
                <Text style={[s.regionValue, isEmpty && s.dimText]}>{item.value}</Text>
              </View>
              {!isEmpty && (
                <View style={s.barTrack}>
                  <LinearGradient
                    colors={accent}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[s.barFill, { width: `${Math.max(pct * 100, 6)}%` }]}
                  />
                </View>
              )}
            </View>
          </FadeSlideView>
        );
      })}
    </View>
  );
}

// ─── 나라별 랭크 카드 ───
const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];
function CountriesSection({ items, accent }: { items: Item[]; accent: [string, string] }) {
  return (
    <View style={s.section}>
      {items.map((item, i) => {
        const rankColor = i < 3 ? RANK_COLORS[i] : null;
        return (
          <FadeSlideView key={i} delay={i * 65}>
            <LinearGradient
              colors={['#1A1730', '#14122A']}
              style={s.rankCard}
            >
              {/* rank badge */}
              <View style={[s.rankBadge, rankColor ? { backgroundColor: rankColor + '22', borderColor: rankColor + '55' } : { backgroundColor: '#2A2845', borderColor: '#3A3860' }]}>
                <Text style={[s.rankNum, rankColor ? { color: rankColor } : { color: Colors.textSecondary }]}>
                  {i + 1}
                </Text>
              </View>
              <View style={s.rankBody}>
                <Text style={s.rankLabel}>{item.label}</Text>
                {item.sub && <Text style={s.rankSub}>{item.sub}</Text>}
              </View>
              <LinearGradient
                colors={accent}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.rankValuePill}
              >
                <Text style={s.rankValueTxt}>{item.value}</Text>
              </LinearGradient>
            </LinearGradient>
          </FadeSlideView>
        );
      })}
    </View>
  );
}

// ─── 별점 분포 ───
const STAR_COLORS = ['#FBBF24', '#FCD34D', '#FDE68A', '#D1D5DB', '#9CA3AF'];
function RatingSection({ items, accent }: { items: Item[]; accent: [string, string] }) {
  return (
    <View style={s.section}>
      {items.map((item, i) => {
        const pct = parseNum(item.sub ?? '0');
        const stars = 5 - i;
        return (
          <FadeSlideView key={i} delay={i * 65}>
            <View style={s.ratingRow}>
              {/* 별 */}
              <View style={s.ratingStars}>
                {Array.from({ length: 5 }).map((_, si) => (
                  <Text key={si} style={[s.ratingStar, si < stars ? { color: '#FBBF24' } : { color: '#2A2845' }]}>★</Text>
                ))}
              </View>
              {/* 바 */}
              <View style={[s.barTrack, { flex: 1, marginHorizontal: 10 }]}>
                <LinearGradient
                  colors={pct > 0 ? accent : ['#2A2845', '#2A2845']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[s.barFill, { width: pct > 0 ? `${pct}%` : '3%' }]}
                />
              </View>
              {/* 비율 + 개수 */}
              <View style={s.ratingMeta}>
                <Text style={[s.ratingPct, { color: accent[0] }]}>{pct}%</Text>
                <Text style={s.ratingCount}>{item.value}</Text>
              </View>
            </View>
          </FadeSlideView>
        );
      })}
    </View>
  );
}

// ─── 세계 통계 그리드 ───
function WorldSection({ items, accent }: { items: Item[]; accent: [string, string] }) {
  const highlights = items.slice(0, 4);
  const extras = items.slice(4);
  return (
    <View style={s.section}>
      {/* 2열 그리드 */}
      <View style={s.grid}>
        {highlights.map((item, i) => (
          <FadeSlideView key={i} delay={i * 65} style={{ width: (SW - 50) / 2 }}>
            <LinearGradient colors={['#1A1730', '#14122A']} style={s.gridCard}>
              <Text style={[s.gridValue, { color: accent[i % 2 === 0 ? 0 : 1] }]}>{item.value}</Text>
              <Text style={s.gridLabel}>{item.label}</Text>
              {item.sub && <Text style={s.gridSub} numberOfLines={2}>{item.sub}</Text>}
            </LinearGradient>
          </FadeSlideView>
        ))}
      </View>
      {/* 나머지 가로형 카드 */}
      {extras.map((item, i) => (
        <FadeSlideView key={i} delay={(highlights.length + i) * 65}>
          <View style={s.extraCard}>
            <View style={s.extraLeft}>
              <Text style={s.extraLabel}>{item.label}</Text>
              {item.sub && <Text style={s.extraSub}>{item.sub}</Text>}
            </View>
            <Text style={[s.extraValue, { color: accent[0] }]}>{item.value}</Text>
          </View>
        </FadeSlideView>
      ))}
    </View>
  );
}

// ─── 메인 화면 ───
export default function StatsDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'StatsDetail'>>();
  const { statType } = route.params;
  const { records } = useRecords();

  // Filter to "my posts" (including seed data for demo consistency)
  const myRecords = records.filter((r) => r.isMyPost !== false);

  // Compute stats dynamically based on statType and myRecords
  const content = useMemo(() => {
    // 1. Common aggregations
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

    const worldCoveragePct = ((countryCount / 195) * 100).toFixed(1) + '%';

    // First Travel year
    let firstTravelYear = '-';
    let firstTravelLoc = '';
    if (myRecords.length > 0) {
      const sortedByTime = [...myRecords].sort((a, b) => a.timestamp - b.timestamp);
      const firstRecord = sortedByTime[0];
      const yearStr = firstRecord.date ? firstRecord.date.split('.')[0] : (firstRecord.startDate ? firstRecord.startDate.split('.')[0] : '');
      if (yearStr && yearStr.length === 4) {
        firstTravelYear = yearStr + '년';
        firstTravelLoc = firstRecord.countryName || (firstRecord.countries?.[0]?.name) || '';
      }
    }

    // Most active year
    const yearlyCounts: Record<string, number> = {};
    myRecords.forEach((r) => {
      const yearStr = r.date ? r.date.split('.')[0] : (r.startDate ? r.startDate.split('.')[0] : '');
      if (yearStr && yearStr.length === 4) {
        yearlyCounts[yearStr] = (yearlyCounts[yearStr] || 0) + 1;
      }
    });
    let mostActiveYear = '-';
    let mostActiveCount = 0;
    Object.keys(yearlyCounts).forEach((year) => {
      if (yearlyCounts[year] > mostActiveCount) {
        mostActiveCount = yearlyCounts[year];
        mostActiveYear = year + '년';
      }
    });

    // Yearly breakdown items
    const currentYear = new Date().getFullYear();
    const yearlyItems: Item[] = [];
    const yearlyVisitedCountries: Record<string, Set<string>> = {};
    myRecords.forEach((r) => {
      const yearStr = r.date ? r.date.split('.')[0] : (r.startDate ? r.startDate.split('.')[0] : '');
      if (yearStr && yearStr.length === 4) {
        if (!yearlyVisitedCountries[yearStr]) {
          yearlyVisitedCountries[yearStr] = new Set<string>();
        }
        if (r.countries && r.countries.length > 0) {
          r.countries.forEach((c) => yearlyVisitedCountries[yearStr].add(c.name));
        } else if (r.countryName) {
          yearlyVisitedCountries[yearStr].add(r.countryName);
        }
      }
    });

    for (let i = 6; i >= 0; i--) {
      const year = String(currentYear - i);
      const visits = yearlyCounts[year] || 0;
      const countriesSet = yearlyVisitedCountries[year] || new Set<string>();
      const countriesStr = countriesSet.size > 0 ? Array.from(countriesSet).join(', ') : (visits === 0 ? '기록 없음' : '');
      yearlyItems.push({
        label: year + '년',
        value: visits + '회',
        sub: countriesStr,
      });
    }

    // Region breakdown items
    const continentCounts: Record<string, number> = {
      '아시아': 0,
      '유럽': 0,
      '아메리카': 0,
      '오세아니아': 0,
      '아프리카': 0,
    };
    const continentCountries: Record<string, Set<string>> = {
      '아시아': new Set(),
      '유럽': new Set(),
      '아메리카': new Set(),
      '오세아니아': new Set(),
      '아프리카': new Set(),
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
            continentCountries[cont].add(name);
          }
        } else {
          continentCounts['아시아']++;
          continentCountries['아시아'].add(name);
        }
      });
    });

    const regionItems: Item[] = ['아시아', '유럽', '아메리카', '오세아니아', '아프리카'].map((cont) => {
      const count = continentCountries[cont].size;
      const countriesListStr = Array.from(continentCountries[cont]).slice(0, 5).join(' · ') + (continentCountries[cont].size > 5 ? ` 외 ${continentCountries[cont].size - 5}개` : '');
      return {
        label: cont,
        value: count + '개국',
        sub: count > 0 ? countriesListStr : '아직 미방문',
      };
    });

    // Countries breakdown items
    const countryVisits: Record<string, { count: number; flag: string; cities: Set<string> }> = {};
    myRecords.forEach((r) => {
      const countriesList: { name: string; flag: string }[] = [];
      if (r.countries && r.countries.length > 0) {
        r.countries.forEach((c) => countriesList.push(c));
      } else if (r.countryName) {
        countriesList.push({ name: r.countryName, flag: r.countryFlag || '' });
      }

      countriesList.forEach((c) => {
        if (!countryVisits[c.name]) {
          countryVisits[c.name] = { count: 0, flag: c.flag, cities: new Set<string>() };
        }
        countryVisits[c.name].count++;
        if (r.regionName) {
          countryVisits[c.name].cities.add(r.regionName);
        }
      });
    });

    const countriesItems: Item[] = Object.keys(countryVisits)
      .map((name) => {
        const cInfo = countryVisits[name];
        const citiesStr = cInfo.cities.size > 0 ? Array.from(cInfo.cities).join(' · ') : name;
        return {
          label: `${cInfo.flag} ${name}`,
          value: cInfo.count + '회',
          sub: citiesStr,
          visits: cInfo.count, // for sorting
        };
      })
      .sort((a, b) => b.visits - a.visits);

    // Rating breakdown items
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

    const ratingItems: Item[] = [5, 4, 3, 2, 1].map((star) => {
      const count = ratingCounts[star as 5 | 4 | 3 | 2 | 1];
      const pct = ratedRecordsCount > 0 ? Math.round((count / ratedRecordsCount) * 100) : 0;
      return {
        label: star + '점',
        value: count + '개',
        sub: String(pct),
      };
    });

    const totalYearlyVisits = Object.values(yearlyCounts).reduce((a, b) => a + b, 0);
    const totalRegionCount = Object.keys(continentCounts).filter((k) => continentCounts[k] > 0).length;

    switch (statType) {
      case 'world':
        return {
          title: '세계 여행',
          subtitle: '지금까지의 여행 기록 전체 요약',
          hero: countryCount + '개국',
          heroLabel: '총 방문 나라',
          items: [
            { label: '방문 나라', value: countryCount + '개국', sub: visitedCountriesList.map((c) => c.name).slice(0, 6).join(' · ') + (visitedCountriesList.length > 6 ? ` 외 ${visitedCountriesList.length - 6}개` : '') },
            { label: '방문 도시', value: cityCount + '개', sub: visitedCitiesSet.size > 0 ? Array.from(visitedCitiesSet).slice(0, 6).join(', ') : '기록에 기반한 도시 계산' },
            { label: '총 기록', value: recordsCount + '개', sub: '사진 · 글 · 영상 포함' },
            { label: '총 여행 일수', value: totalDays + '일', sub: firstTravelYear !== '-' ? `${firstTravelYear.slice(0, 4)}년 ~ ${new Date().getFullYear()}년` : '' },
            { label: '세계 커버리지', value: worldCoveragePct, sub: `195개국 중 ${countryCount}개국 방문` },
            { label: '첫 해외 여행', value: firstTravelYear, sub: firstTravelLoc },
            { label: '가장 활발한 해', value: mostActiveYear, sub: mostActiveCount > 0 ? `${mostActiveCount}회 방문` : '기록 없음' },
          ],
        };
      case 'yearly':
        return {
          title: '연도별 여행',
          subtitle: '연도별 방문 나라 및 횟수',
          hero: totalYearlyVisits + '회',
          heroLabel: '총 여행 횟수',
          items: yearlyItems,
        };
      case 'region':
        return {
          title: '대륙별 방문',
          subtitle: '대륙별 방문 나라 및 현황',
          hero: totalRegionCount + '개 대륙',
          heroLabel: '방문한 대륙',
          items: regionItems,
        };
      case 'countries':
        return {
          title: '나라별 방문',
          subtitle: '방문 나라별 도시 및 횟수',
          hero: countryCount + '개국',
          heroLabel: '총 방문 나라',
          items: countriesItems,
        };
      case 'rating':
        return {
          title: '여행 평가',
          subtitle: '별점별 여행 기록 분포',
          hero: avgRating + '점',
          heroLabel: '평균 별점',
          items: ratingItems,
        };
    }
  }, [statType, myRecords]);

  const accent = ACCENTS[statType];

  // 입장 애니메이션
  const headerAnim  = useRef(new Animated.Value(0)).current;
  const heroScale   = useRef(new Animated.Value(0.86)).current;
  const heroOpacity = useRef(new Animated.Value(0)).current;

  // 퇴장 애니메이션 — 전체 화면 단위로 처리
  const screenOpacity   = useRef(new Animated.Value(1)).current;
  const screenTranslate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
        easing: Easing.out(Easing.exp),
      }),
      Animated.parallel([
        Animated.spring(heroScale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 130,
          friction: 8,
        }),
        Animated.timing(heroOpacity, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  const handleBack = () => {
    Animated.parallel([
      // 오른쪽으로 밀리며
      Animated.timing(screenTranslate, {
        toValue: 40,
        duration: 240,
        useNativeDriver: true,
        easing: Easing.in(Easing.exp),
      }),
      // 페이드 아웃
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
        easing: Easing.in(Easing.quad),
      }),
    ]).start(() => navigation.goBack());
  };

  return (
    <Animated.View
      style={[
        s.container,
        {
          opacity: screenOpacity,
          transform: [{ translateX: screenTranslate }],
        },
      ]}
    >
      <LinearGradient colors={['#0A0118', '#0E0520']} style={StyleSheet.absoluteFill} />

      {/* 헤더 */}
      <Animated.View
        style={[
          s.header,
          {
            opacity: headerAnim,
            transform: [
              {
                translateY: headerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-20, 0],
                }),
              },
            ],
          },
        ]}
      >
        <TouchableOpacity onPress={handleBack} style={s.backBtn}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>{content.title}</Text>
          <Text style={s.headerSub}>{content.subtitle}</Text>
        </View>
      </Animated.View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* 히어로 카드 */}
        <Animated.View
          style={{
            opacity: heroOpacity,
            transform: [{ scale: heroScale }],
            marginBottom: 28,
          }}
        >
          <LinearGradient
            colors={accent}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[s.heroCard, { marginBottom: 0 }]}
          >
            <Text style={s.heroIcon}>{ICONS[statType]}</Text>
            <Text style={s.heroValue}>{content.hero}</Text>
            <Text style={s.heroLabel}>{content.heroLabel}</Text>
            <View style={s.heroDeco1} />
            <View style={s.heroDeco2} />
          </LinearGradient>
        </Animated.View>

        {/* 구분선 */}
        <FadeSlideView delay={300} from={10}>
          <View style={s.divider}>
            <View style={s.dividerLine} />
            <Text style={s.dividerTxt}>상세 통계</Text>
            <View style={s.dividerLine} />
          </View>
        </FadeSlideView>

        {/* 유형별 렌더 */}
        {statType === 'world'     && <WorldSection     items={content.items} accent={accent} />}
        {statType === 'yearly'    && <YearlySection    items={content.items} accent={accent} />}
        {statType === 'region'    && <RegionSection    items={content.items} accent={accent} />}
        {statType === 'countries' && <CountriesSection items={content.items} accent={accent} />}
        {statType === 'rating'    && <RatingSection    items={content.items} accent={accent} />}

        <View style={{ height: 48 }} />
      </ScrollView>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0118' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 14,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E1B33',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(123,97,255,0.25)',
  },
  backIcon: { fontSize: 18, color: Colors.textPrimary, lineHeight: 22 },
  headerTitle: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  scroll: { paddingHorizontal: 20, paddingBottom: 20 },

  // 히어로 카드
  heroCard: {
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    marginBottom: 28,
    overflow: 'hidden',
    minHeight: 160,
    justifyContent: 'center',
  },
  heroIcon: { fontSize: 36, marginBottom: 8 },
  heroValue: {
    fontSize: 48,
    fontFamily: Typography.fontFamily.extraBold,
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  heroLabel: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 4,
  },
  heroDeco1: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.07)',
    top: -30,
    right: -20,
  },
  heroDeco2: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: -20,
    left: 10,
  },

  // 구분선
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 10,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(123,97,255,0.15)' },
  dividerTxt: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  section: { gap: 10 },

  // ── 바 공통 ──
  barTrack: {
    height: 6,
    backgroundColor: '#1E1B33',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 8,
  },
  barFill: { height: '100%', borderRadius: 3 },

  // ── 연도별 ──
  barCard: {
    backgroundColor: '#131128',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(123,97,255,0.1)',
  },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barYear: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
  },
  barValue: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  barSub: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginTop: 6,
  },

  // ── 대륙별 ──
  regionCard: {
    backgroundColor: '#131128',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(123,97,255,0.12)',
  },
  regionCardDim: { opacity: 0.45 },
  regionTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  regionIcon: { fontSize: 24 },
  regionInfo: { flex: 1 },
  regionName: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
  },
  regionSub: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  regionValue: {
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },

  // ── 나라별 랭크 ──
  rankCard: {
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(123,97,255,0.1)',
    overflow: 'hidden',
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNum: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.bold,
  },
  rankBody: { flex: 1 },
  rankLabel: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
  },
  rankSub: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  rankValuePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  rankValueTxt: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.bold,
    color: '#FFFFFF',
  },

  // ── 별점 ──
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  ratingStars: { flexDirection: 'row', gap: 1, width: 72 },
  ratingStar: { fontSize: 12 },
  ratingMeta: { alignItems: 'flex-end', width: 52 },
  ratingPct: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.bold,
  },
  ratingCount: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginTop: 1,
  },

  // ── 세계 그리드 ──
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  gridCard: {
    width: (SW - 50) / 2,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(123,97,255,0.1)',
    overflow: 'hidden',
  },
  gridValue: {
    fontSize: Typography.fontSize['2xl'],
    fontFamily: Typography.fontFamily.extraBold,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  gridLabel: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
  },
  gridSub: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
  extraCard: {
    backgroundColor: '#131128',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(123,97,255,0.1)',
  },
  extraLeft: { flex: 1 },
  extraLabel: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
  },
  extraSub: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  extraValue: {
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.bold,
    marginLeft: 12,
  },

  // 공통
  dimText: { color: Colors.textMuted },
});
