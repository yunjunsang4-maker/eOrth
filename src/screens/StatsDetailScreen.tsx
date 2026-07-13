import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import Svg, {
  Path as SvgPath,
  Circle as SvgCircle,
  G as SvgG,
  Defs as SvgDefs,
  LinearGradient as SvgLinearGradient,
  RadialGradient as SvgRadialGradient,
  Stop as SvgStop,
} from 'react-native-svg';
import { Colors, Typography } from '../constants';
import { useRecords } from '../store/recordStore';
import { COUNTRIES } from '../constants/countries';
import { STATS_GLOBE_PATH } from '../data/statsGlobePath';
import StarFieldBackground from '../components/StarFieldBackground';
import {
  recentTrips,
  revisitedCountryCount,
  mostRecentCountry,
  thisYearVisitCount,
  activeYearAverage,
  mostVisitedContinent,
  unvisitedContinents,
  highestRatedTrip,
  mostRecentRatedTrip,
} from './statsDetailExtras';
import DetailBox from '../components/DetailBox';

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

type Item = { label: string; value: string; sub?: string };

type BoxRow = { label: string; value: string; sub?: string };
type Box =
  | { kind: 'rows'; title: string; rows: BoxRow[]; collapseAt?: number }
  | { kind: 'trips'; title: string; trips: { country: string; city: string; period: string; records: number }[] };
type Hero = { cycle: BoxRow[] }; // 지구본 중앙에 자동 순환(페이드)으로 보여줄 간단 통계들
type DetailContent = { title: string; hero: Hero; boxes: Box[] };

// ── 지구본 히어로 기하 (시안 iPhone 17-86: 화면 중앙 대형 와이어프레임) ──
// STATS_GLOBE_PATH 원본 좌표계: 중심 (168.46, 193), 지름 ≈ 188.
const HERO_CX = SW / 2;
const HERO_R = SW * 0.34;                       // 지구본 반지름
const HERO_GLOBE_H = Math.round(HERO_R * 2 + 92); // 히어로 섹션 높이(글로우·화살표 여유 포함)
const HERO_CY = HERO_R + 30;                    // 지구본 중심 y (섹션 내)
const HERO_SCALE = (HERO_R * 2) / 188;
const HERO_GLOBE_TRANSFORM = `translate(${HERO_CX} ${HERO_CY}) scale(${HERO_SCALE}) translate(${-168.46} ${-193})`;
// 하단을 감싸는 발광 궤도 호 (시안의 빛나는 링)
const HERO_ARC_R = HERO_R + 8;
const HERO_ARC_SPAN = 1.15; // 정상 기준 ±rad
const HERO_ARC_PATH = (() => {
  const x1 = HERO_CX - HERO_ARC_R * Math.sin(HERO_ARC_SPAN);
  const y1 = HERO_CY + HERO_ARC_R * Math.cos(HERO_ARC_SPAN);
  const x2 = HERO_CX + HERO_ARC_R * Math.sin(HERO_ARC_SPAN);
  // 하단을 지나는 호 (좌하 → 우하)
  return `M ${x1} ${y1} A ${HERO_ARC_R} ${HERO_ARC_R} 0 0 0 ${x2} ${y1}`;
})();

// ─── 메인 화면 ───
export default function StatsDetailScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  // 대륙 키(한글, COUNTRIES 데이터)를 표시용 라벨로 변환
  const continentName = useCallback((cont: string) => {
    switch (cont) {
      case '아시아': return t('stats.continentAsia');
      case '유럽': return t('stats.continentEurope');
      case '아메리카': return t('stats.continentAmerica');
      case '오세아니아': return t('stats.continentOceania');
      case '아프리카': return t('stats.continentAfrica');
      default: return cont;
    }
  }, [t]);
  const route = useRoute<RouteProp<RouteParams, 'StatsDetail'>>();
  const { statType } = route.params;
  const { records } = useRecords();

  // Filter to "my posts" (including seed data for demo consistency)
  const myRecords = records.filter((r) => r.isMyPost !== false);

  // Compute stats dynamically based on statType and myRecords
  const content = useMemo<DetailContent>(() => {
    // 1. Common aggregations
    void t; // i18n: 재계산이 언어 변경에도 반영되도록 의존성 포함
    const visitedCountriesSet = new Set<string>();
    const visitedCitiesSet = new Set<string>();

    myRecords.forEach((r) => {
      if (r.countries && r.countries.length > 0) {
        r.countries.forEach((c) => {
          if (!visitedCountriesSet.has(c.name)) {
            visitedCountriesSet.add(c.name);
          }
        });
      } else if (r.countryName) {
        if (!visitedCountriesSet.has(r.countryName)) {
          visitedCountriesSet.add(r.countryName);
        }
      }
      if (r.regionName) {
        visitedCitiesSet.add(r.regionName);
      }
    });

    const countryCount = visitedCountriesSet.size;
    const cityCount = visitedCitiesSet.size; // 도시(regionName) 기록이 있는 것만 — 없으면 0(항목 미노출)
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

    // First Travel year — '기록 작성 순서(timestamp)'가 아니라 '여행 날짜'가 가장 이른 기록 기준.
    // (최근 여행을 먼저 기록하고 과거 여행을 나중에 가져와도 첫 여행 연도가 틀리지 않게)
    let firstTravelYear = '-';
    let firstTravelLoc = '';
    if (myRecords.length > 0) {
      const travelTime = (r: (typeof myRecords)[number]): number => {
        const s = r.startDate || r.date;
        if (s) {
          const [y, m, d] = s.split(/[.\-/]/).map((p) => parseInt(p, 10));
          if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
            return new Date(y, m - 1, d).getTime();
          }
        }
        return r.timestamp; // 날짜 없는 기록은 작성 시각으로 폴백
      };
      const firstRecord = [...myRecords].sort((a, b) => travelTime(a) - travelTime(b))[0];
      const yearStr = firstRecord.date ? firstRecord.date.split('.')[0] : (firstRecord.startDate ? firstRecord.startDate.split('.')[0] : '');
      if (yearStr && yearStr.length === 4) {
        firstTravelYear = t('statsDetail.yearN', { n: yearStr });
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
        mostActiveYear = t('statsDetail.yearN', { n: year });
      }
    });

    // Yearly breakdown items
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

    // 기록이 있는 연도만 최근→옛날 순으로(빈 연도 제외). yearlyCounts 키 = 기록 존재 연도.
    const yearlyItems: Item[] = Object.keys(yearlyCounts)
      .sort((a, b) => Number(b) - Number(a))
      .map((year) => {
        const visits = yearlyCounts[year];
        const countriesSet = yearlyVisitedCountries[year] || new Set<string>();
        const countriesStr = countriesSet.size > 0 ? Array.from(countriesSet).join(', ') : '';
        return {
          label: t('statsDetail.yearN', { n: year }),
          value: t('statsDetail.visitsN', { n: visits }),
          sub: countriesStr,
        };
      });

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
        // '한국' 별칭(가져오기 구버전 표기)은 표준 표기로 보정해 조회
        const lookupName = name === '한국' ? '대한민국' : name;
        const cMeta = COUNTRIES.find((c) => c.name === lookupName);
        if (cMeta) {
          let cont = cMeta.continent;
          if (cont === '북아메리카' || cont === '남아메리카') {
            cont = '아메리카';
          }
          if (cont in continentCounts) {
            continentCounts[cont]++;
            continentCountries[cont].add(lookupName);
          }
        }
        // 미등록 국가명(지오코딩 폴백 등)은 대륙 통계에서 제외 — 무조건 아시아로 오집계하지 않는다
      });
    });

    const regionItems: Item[] = ['아시아', '유럽', '아메리카', '오세아니아', '아프리카'].map((cont) => {
      const count = continentCountries[cont].size;
      const countriesListStr = Array.from(continentCountries[cont]).slice(0, 5).join(' · ') + (continentCountries[cont].size > 5 ? t('statsDetail.moreN', { n: continentCountries[cont].size - 5 }) : '');
      return {
        label: continentName(cont),
        value: t('statsDetail.countriesN', { n: count }),
        sub: count > 0 ? countriesListStr : t('statsDetail.notVisited'),
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
          value: t('statsDetail.visitsN', { n: cInfo.count }),
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
        label: t('statsDetail.starN', { n: star }),
        value: t('statsDetail.countN', { n: count }),
        sub: String(pct),
      };
    });

    const totalYearlyVisits = Object.values(yearlyCounts).reduce((a, b) => a + b, 0);
    const totalRegionCount = Object.keys(continentCounts).filter((k) => continentCounts[k] > 0).length;

    switch (statType) {
      case 'world': {
        const cycle: BoxRow[] = [
          { label: t('statsDetail.heroTotalCountries'), value: t('statsDetail.countriesN', { n: countryCount }) },
          // 도시 기록이 하나도 없으면 방문 도시 항목 자체를 순환에서 제외(빈 통계 미노출)
          ...(cityCount > 0 ? [{ label: t('statsDetail.labelVisitedCities'), value: t('statsDetail.countN', { n: cityCount }) }] : []),
          { label: t('statsDetail.labelTotalRecords'), value: t('statsDetail.countN', { n: recordsCount }) },
          { label: t('statsDetail.labelTotalDays'), value: t('statsDetail.daysN', { n: totalDays }) },
          { label: t('statsDetail.labelWorldCoverage'), value: worldCoveragePct },
        ];
        return {
          title: t('statsDetail.worldTitle'),
          hero: { cycle },
          boxes: [
            { kind: 'trips', title: t('statsDetail.recentTrips'), trips: recentTrips(myRecords, 5) },
            { kind: 'rows', title: t('statsDetail.boxMostActiveYear'), rows: [
              { label: mostActiveYear, value: mostActiveCount > 0 ? t('statsDetail.visitedNTimes', { n: mostActiveCount }) : t('statsDetail.noRecord') },
              { label: t('statsDetail.labelFirstTravel'), value: firstTravelYear, sub: firstTravelLoc },
            ] },
          ],
        };
      }
      case 'yearly':
        return {
          title: t('statsDetail.yearlyTitle'),
          hero: { cycle: [
            { label: t('statsDetail.heroTotalVisitsLbl'), value: t('statsDetail.visitsN', { n: totalYearlyVisits }) },
            { label: t('statsDetail.boxMostActiveYear'), value: mostActiveYear },
            { label: t('statsDetail.hlThisYear'), value: t('statsDetail.visitsN', { n: thisYearVisitCount(myRecords) }) },
            { label: t('statsDetail.hlYearAvg'), value: activeYearAverage(myRecords) },
          ] },
          boxes: [
            { kind: 'rows', title: t('statsDetail.boxYearlyStatus'), rows: yearlyItems.map((i) => ({ label: i.label, value: i.value, sub: i.sub })), collapseAt: 7 },
            { kind: 'rows', title: t('statsDetail.boxHighlights'), rows: [
              { label: t('statsDetail.boxMostActiveYear'), value: mostActiveYear, sub: mostActiveCount > 0 ? t('statsDetail.visitedNTimes', { n: mostActiveCount }) : '' },
              { label: t('statsDetail.hlThisYear'), value: t('statsDetail.visitsN', { n: thisYearVisitCount(myRecords) }) },
              { label: t('statsDetail.hlYearAvg'), value: activeYearAverage(myRecords) },
            ] },
          ],
        };
      case 'region': {
        const mvc = mostVisitedContinent(myRecords);
        const unv = unvisitedContinents(myRecords);
        return {
          title: t('statsDetail.regionTitle'),
          hero: { cycle: [
            { label: t('statsDetail.heroVisitedContinents'), value: t('statsDetail.continentsN', { n: totalRegionCount }) },
            { label: t('statsDetail.hlMostContinent'), value: mvc ? continentName(mvc) : t('statsDetail.noRecord') },
            { label: t('statsDetail.hlUnvisited'), value: t('statsDetail.countN', { n: unv.length }) },
          ] },
          boxes: [
            { kind: 'rows', title: t('statsDetail.boxContinentStatus'), rows: regionItems.map((i) => ({ label: i.label, value: i.value, sub: i.sub })) },
            { kind: 'rows', title: t('statsDetail.boxHighlights'), rows: [
              { label: t('statsDetail.hlMostContinent'), value: mvc ? continentName(mvc) : t('statsDetail.noRecord') },
              { label: t('statsDetail.hlUnvisited'), value: t('statsDetail.countN', { n: unv.length }), sub: unv.map(continentName).join(' · ') },
            ] },
          ],
        };
      }
      case 'countries': {
        const top = countriesItems[0];
        return {
          title: t('statsDetail.countryTitle'),
          hero: { cycle: [
            { label: t('statsDetail.heroTopCountryLbl'), value: top ? top.label : '-', sub: top ? top.value : '' },
            { label: t('statsDetail.hlRecentCountry'), value: mostRecentCountry(myRecords) ?? '-' },
            { label: t('statsDetail.hlRevisited'), value: t('statsDetail.countN', { n: revisitedCountryCount(myRecords) }) },
          ] },
          boxes: [
            { kind: 'rows', title: t('statsDetail.boxCountryVisits'), rows: countriesItems.slice(0, 8).map((i) => ({ label: i.label, value: i.value, sub: i.sub })) },
            { kind: 'rows', title: t('statsDetail.boxHighlights'), rows: [
              { label: t('statsDetail.hlRecentCountry'), value: mostRecentCountry(myRecords) ?? '-' },
              { label: t('statsDetail.hlRevisited'), value: t('statsDetail.countN', { n: revisitedCountryCount(myRecords) }) },
            ] },
          ],
        };
      }
      case 'rating': {
        const topRated = highestRatedTrip(myRecords);
        const recentRated = mostRecentRatedTrip(myRecords);
        return {
          title: t('statsDetail.ratingTitle'),
          hero: { cycle: [
            { label: t('statsDetail.heroAvgRating'), value: t('statsDetail.starN', { n: avgRating }) },
            { label: t('statsDetail.hlTopRated'), value: topRated ? topRated.country : '-', sub: topRated ? `★ ${topRated.rating}` : '' },
            { label: t('statsDetail.hlRatedCount'), value: t('statsDetail.countN', { n: ratedRecordsCount }) },
          ] },
          boxes: [
            { kind: 'rows', title: t('statsDetail.boxRatingDist'), rows: ratingItems.map((i) => ({ label: i.label, value: i.value, sub: t('statsDetail.percentN', { n: i.sub }) })) },
            { kind: 'rows', title: t('statsDetail.boxHighlights'), rows: [
              { label: t('statsDetail.hlTopRated'), value: topRated ? topRated.country : '-', sub: topRated ? `★ ${topRated.rating}` : '' },
              { label: t('statsDetail.hlRecentRated'), value: recentRated ? recentRated.country : '-', sub: recentRated ? `★ ${recentRated.rating}` : '' },
              { label: t('statsDetail.hlRatedCount'), value: t('statsDetail.countN', { n: ratedRecordsCount }) },
            ] },
          ],
        };
      }
    }
  }, [statType, myRecords, t, continentName]);

  // 지구본 히어로에 스포트라이트되는 항목 — 자동 순환(페이드 아웃→교체→페이드 인)
  const cycleItems = content.hero.cycle;
  const [heroIdx, setHeroIdx] = useState(0);
  // 접이식 rows 박스(연도별) 펼침 상태 — 화면당 접이 박스는 하나라 단일 상태로 충분
  const [rowsExpanded, setRowsExpanded] = useState(false);
  const safeIdx = cycleItems.length > 0 ? heroIdx % cycleItems.length : 0;
  const featured = cycleItems[safeIdx];
  const spotFade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (cycleItems.length <= 1) return;
    const iv = setInterval(() => {
      Animated.timing(spotFade, { toValue: 0, duration: 450, useNativeDriver: true }).start(({ finished }) => {
        if (!finished) return;
        setHeroIdx((p) => p + 1);
        Animated.timing(spotFade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      });
    }, 3200);
    return () => clearInterval(iv);
  }, [cycleItems.length, spotFade]);

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
      {/* 별 배경 — 메인 통계 화면과 동일한 다크 스타필드 (시안) */}
      <StarFieldBackground />

      {/* 헤더 — ‹ + 흰색 굵은 제목 (시안: world travel) */}
      <Animated.View
        style={[
          s.header,
          { paddingTop: insets.top + 10 },
          {
            opacity: headerAnim,
            transform: [
              { translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) },
            ],
          },
        ]}
      >
        <TouchableOpacity onPress={handleBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{content.title}</Text>
      </Animated.View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* 히어로 — 모든 카테고리 지구본 문양 동일 (world만 대표 수치 ‹ ›순환) */}
        <Animated.View style={{ opacity: heroOpacity, transform: [{ scale: heroScale }], marginHorizontal: -20 }}>
            <View style={{ height: HERO_GLOBE_H }}>
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <Svg width={SW} height={HERO_GLOBE_H}>
                  <SvgDefs>
                    <SvgRadialGradient id="detailGlobeGlow" cx="50%" cy="50%" r="50%">
                      <SvgStop offset="0%" stopColor="#7C3AED" stopOpacity={0.28} />
                      <SvgStop offset="100%" stopColor="#7C3AED" stopOpacity={0} />
                    </SvgRadialGradient>
                    <SvgLinearGradient id="detailGlobeGrid" x1="168.46" y1="98.65" x2="168.46" y2="287.4" gradientUnits="userSpaceOnUse">
                      <SvgStop offset="0" stopColor="#E0C9FF" />
                      <SvgStop offset="1" stopColor="#7C3AED" stopOpacity={0.3} />
                    </SvgLinearGradient>
                    <SvgLinearGradient id="detailArc" x1="0" y1="0" x2="1" y2="0">
                      <SvgStop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
                      <SvgStop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.7} />
                      <SvgStop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
                    </SvgLinearGradient>
                  </SvgDefs>
                  {/* 뒤 보라 글로우 */}
                  <SvgCircle cx={HERO_CX} cy={HERO_CY} r={HERO_R * 1.15} fill="url(#detailGlobeGlow)" />
                  {/* 지구본 격자 (시안 원본 패스) */}
                  <SvgG transform={HERO_GLOBE_TRANSFORM}>
                    <SvgPath d={STATS_GLOBE_PATH} fill="url(#detailGlobeGrid)" fillOpacity={0.55} />
                  </SvgG>
                  {/* 하단 발광 궤도 호 */}
                  <SvgPath d={HERO_ARC_PATH} stroke="url(#detailArc)" strokeWidth={2} fill="none" />
                </Svg>
              </View>

              {/* 스포트라이트 통계 — 지구본 중앙, 자동 순환(깜빡이는 페이드로 교체) */}
              <Animated.View style={[s.heroOverlay, { top: HERO_CY - 46, opacity: spotFade }]} pointerEvents="none">
                {!!featured?.label && <Text style={s.heroLabel}>{featured.label}</Text>}
                <Text style={s.heroValue} numberOfLines={1}>{featured?.value ?? '-'}</Text>
                {!!featured?.sub && <Text style={s.heroSub} numberOfLines={1}>{featured.sub}</Text>}
              </Animated.View>
            </View>
          </Animated.View>

        {/* 카테고리별 상세 박스 */}
        {content.boxes.map((box, bi) => (
          <FadeSlideView key={bi} delay={200 + bi * 80} from={12}>
            <DetailBox title={box.title}>
              {box.kind === 'trips' ? (
                box.trips.length === 0 ? (
                  <Text style={s.tableEmpty}>{t('statsDetail.noRecord')}</Text>
                ) : (
                  <>
                    <View style={s.tripHead}>
                      <Text style={[s.tripCell, s.tripColCountry, s.tripHeadTxt]}>{t('statsDetail.colCountry')}</Text>
                      <Text style={[s.tripCell, s.tripColCity, s.tripHeadTxt]}>{t('statsDetail.colCity')}</Text>
                      <Text style={[s.tripCell, s.tripColPeriod, s.tripHeadTxt]}>{t('statsDetail.colPeriod')}</Text>
                      <Text style={[s.tripCell, s.tripColRecords, s.tripHeadTxt]}>{t('statsDetail.colRecords')}</Text>
                    </View>
                    {box.trips.map((tp, i) => (
                      <View key={i} style={s.tripRow}>
                        <Text style={[s.tripCell, s.tripColCountry, s.tableLabel]} numberOfLines={1}>{tp.country}</Text>
                        <Text style={[s.tripCell, s.tripColCity, s.tableSub]} numberOfLines={1}>{tp.city}</Text>
                        <Text style={[s.tripCell, s.tripColPeriod, s.tableValue]} numberOfLines={1}>{tp.period}</Text>
                        <Text style={[s.tripCell, s.tripColRecords, s.tableValue]} numberOfLines={1}>{t('statsDetail.countN', { n: tp.records })}</Text>
                      </View>
                    ))}
                  </>
                )
              ) : (
                box.rows.length === 0 ? (
                  <Text style={s.tableEmpty}>{t('statsDetail.noRecord')}</Text>
                ) : (() => {
                  // collapseAt이 있고 행이 그보다 많으면 기본 collapseAt개만, '더보기'로 펼침
                  const hasMore = box.collapseAt != null && box.rows.length > box.collapseAt;
                  const shown = hasMore && !rowsExpanded ? box.rows.slice(0, box.collapseAt) : box.rows;
                  return (
                    <>
                      {shown.map((row, i) => (
                        <View key={i} style={[s.tableRow, i === shown.length - 1 && !hasMore && s.tableRowLast]}>
                          <View style={s.tableRowLeft}>
                            <Text style={s.tableLabel} numberOfLines={1}>{row.label}</Text>
                            {!!row.sub && <Text style={s.tableSub} numberOfLines={1}>{row.sub}</Text>}
                          </View>
                          <Text style={s.tableValue} numberOfLines={1}>{row.value}</Text>
                        </View>
                      ))}
                      {hasMore && (
                        <Pressable
                          style={s.moreBtn}
                          onPress={() => setRowsExpanded((v) => !v)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={s.moreBtnTxt}>{rowsExpanded ? t('statsDetail.collapse') : t('statsDetail.showMore')}</Text>
                        </Pressable>
                      )}
                    </>
                  );
                })()
              )}
            </DetailBox>
          </FadeSlideView>
        ))}

        <View style={{ height: 48 }} />
      </ScrollView>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },

  // 헤더 — ‹ + 흰색 굵은 제목 (시안: world travel)
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 6,
  },
  backBtn: { width: 30, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 30, color: Colors.textPrimary, lineHeight: 34, fontWeight: '400' },
  headerTitle: {
    fontSize: 26,
    fontFamily: Typography.fontFamily.extraBold,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },

  scroll: { paddingHorizontal: 20, paddingBottom: 20 },

  // ── 지구본 히어로 ──
  heroOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  heroLabel: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.extraBold,
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  heroValue: {
    fontSize: 38,
    fontFamily: Typography.fontFamily.extraBold,
    color: '#FFFFFF',
    letterSpacing: -1,
    marginTop: 4,
  },
  heroSub: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 6,
  },
  // ── 최근 여행 표 (trips 박스) ──
  tripHead: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  tripHeadTxt: { color: Colors.textMuted, fontSize: 11 },
  tripCell: { fontSize: 13 },
  tripRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 6 },
  tripColCountry: { width: '22%' },
  tripColCity: { width: '26%' },
  tripColPeriod: { width: '34%' },
  tripColRecords: { width: '18%', textAlign: 'right' },

  tableEmpty: {
    color: Colors.textMuted,
    fontSize: Typography.fontSize.xs,
    textAlign: 'center',
    paddingVertical: 32,
    fontFamily: Typography.fontFamily.regular,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 8, // 둥근 테두리(rx28)에 글자가 붙지 않게 행 안쪽 여백
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  tableRowLast: { borderBottomWidth: 0 },
  tableRowLeft: { flex: 1 },
  moreBtn: { paddingVertical: 13, alignItems: 'center' },
  moreBtnTxt: { color: '#E0C9FF', fontSize: 13, fontWeight: '600' },
  tableLabel: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  tableSub: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 3,
  },
  tableValue: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.bold,
    color: '#E0C9FF',
  },
});
