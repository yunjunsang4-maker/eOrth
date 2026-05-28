import React, { useRef, useEffect } from 'react';
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

const DETAIL_CONTENT: Record<StatType, { title: string; subtitle: string; hero: string; heroLabel: string; items: Item[] }> = {
  world: {
    title: '세계 여행',
    subtitle: '지금까지의 여행 기록 전체 요약',
    hero: '5개국',
    heroLabel: '총 방문 나라',
    items: [
      { label: '방문 나라', value: '5개국', sub: '일본 · 미국 · 프랑스 · 태국 · 싱가포르' },
      { label: '방문 도시', value: '12개', sub: '도쿄, 오사카, 뉴욕, 파리 외 8개' },
      { label: '총 기록', value: '28개', sub: '사진 · 글 · 영상 포함' },
      { label: '총 여행 일수', value: '49일', sub: '2019년 ~ 2025년' },
      { label: '세계 커버리지', value: '12.3%', sub: '195개국 중 5개국 방문' },
      { label: '첫 해외 여행', value: '2019년', sub: '일본 도쿄' },
      { label: '가장 활발한 해', value: '2024년', sub: '7회 방문' },
    ],
  },
  yearly: {
    title: '연도별 여행',
    subtitle: '연도별 방문 나라 및 횟수',
    hero: '21회',
    heroLabel: '총 여행 횟수',
    items: [
      { label: '2025년', value: '4회', sub: '일본, 태국, 싱가포르, 미국' },
      { label: '2024년', value: '7회', sub: '일본 3회, 유럽 2회, 동남아 2회' },
      { label: '2023년', value: '5회', sub: '프랑스, 일본, 태국, 싱가포르, 미국' },
      { label: '2022년', value: '3회', sub: '일본, 태국, 싱가포르' },
      { label: '2021년', value: '1회', sub: '일본 도쿄' },
      { label: '2020년', value: '0회', sub: '코로나19 영향' },
      { label: '2019년', value: '1회', sub: '일본 오사카' },
    ],
  },
  region: {
    title: '대륙별 방문',
    subtitle: '대륙별 방문 나라 및 현황',
    hero: '3개 대륙',
    heroLabel: '방문한 대륙',
    items: [
      { label: '아시아', value: '8개국', sub: '일본 · 태국 · 싱가포르 · 홍콩 외 4개' },
      { label: '유럽', value: '3개국', sub: '프랑스 · 이탈리아 · 스페인' },
      { label: '아메리카', value: '1개국', sub: '미국 뉴욕 · LA' },
      { label: '오세아니아', value: '0개국', sub: '아직 미방문' },
      { label: '아프리카', value: '0개국', sub: '아직 미방문' },
      { label: '남극', value: '0개국', sub: '아직 미방문' },
    ],
  },
  countries: {
    title: '나라별 방문',
    subtitle: '방문 나라별 도시 및 횟수',
    hero: '5개국',
    heroLabel: '총 방문 나라',
    items: [
      { label: '🇯🇵 일본', value: '3회', sub: '도쿄 · 오사카 · 교토 · 후쿠오카' },
      { label: '🇺🇸 미국', value: '2회', sub: '뉴욕 · 로스앤젤레스' },
      { label: '🇫🇷 프랑스', value: '1회', sub: '파리' },
      { label: '🇹🇭 태국', value: '1회', sub: '방콕 · 치앙마이' },
      { label: '🇸🇬 싱가포르', value: '1회', sub: '싱가포르 시티' },
    ],
  },
  rating: {
    title: '여행 평가',
    subtitle: '별점별 여행 기록 분포',
    hero: '4.2점',
    heroLabel: '평균 별점',
    items: [
      { label: '5점', value: '8개', sub: '29' },
      { label: '4점', value: '12개', sub: '43' },
      { label: '3점', value: '5개', sub: '18' },
      { label: '2점', value: '2개', sub: '7' },
      { label: '1점', value: '1개', sub: '3' },
    ],
  },
};

function parseNum(s: string): number {
  return parseInt(s.replace(/[^0-9]/g, '')) || 0;
}

const REGION_MAX = 8; // 아시아 최대

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
  return (
    <View style={s.section}>
      {items.map((item, i) => {
        const count = parseNum(item.value);
        const pct = count / REGION_MAX;
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
  const content = DETAIL_CONTENT[statType];
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
