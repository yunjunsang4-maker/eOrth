import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { CommentIcon } from '../components/icons';
import { useRecords, TravelRecord } from '../store/recordStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COLORS = {
  bg: '#0A0A0F',
  card: '#1C1C28',
  cardBorder: '#2A2A3A',
  purpleNeon: '#BF85FC',
  purpleDeep: '#6B21A8',
  white: '#FFFFFF',
  textDim: '#A1A1B0',
  textMuted: '#5A5A6E',
  // 형식별 컬러
  feedAccent: '#58A6FF',
  feedBg: 'rgba(88,166,255,0.06)',
  blogAccent: '#A78BFA',
  blogBg: 'rgba(167,139,250,0.06)',
  albumAccent: '#FFA657',
  albumBg: 'rgba(255,166,87,0.06)',
};

const VIEW_CONFIG: Record<string, {
  icon: string;
  name: string;
  accent: string;
  gradient: [string, string];
}> = {
  feed: {
    icon: '📸',
    name: '피드',
    accent: COLORS.feedAccent,
    gradient: ['rgba(88,166,255,0.12)', 'rgba(88,166,255,0.02)'],
  },
  blog: {
    icon: '📝',
    name: '블로그',
    accent: COLORS.blogAccent,
    gradient: ['rgba(167,139,250,0.12)', 'rgba(167,139,250,0.02)'],
  },
  album: {
    icon: '📷',
    name: '앨범',
    accent: COLORS.albumAccent,
    gradient: ['rgba(255,166,87,0.12)', 'rgba(255,166,87,0.02)'],
  },
};

interface TripThumbnail {
  id: string;
  emoji: string;
  title: string;
  country: string;
  countryFlag: string;
  date: string;
  color: string;
  records: { id: string; viewType: string }[];
}

type RouteParams = {
  TripDetail: { trip: TripThumbnail };
};

export default function TripDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'TripDetail'>>();
  const { trip } = route.params;
  const { records } = useRecords();

  // 이 여행의 국가와 매칭되는 실제 기록 가져오기
  const matchedRecords = records.filter(
    (r) => r.countryName === trip.country || r.country?.includes(trip.country)
  );

  // viewType별 그룹
  const getRecordsByType = (viewType: string): TravelRecord[] => {
    return matchedRecords.filter((r) => (r.viewType || 'feed') === viewType);
  };

  // 애니메이션
  const headerAnim = useRef(new Animated.Value(0)).current;
  const cardAnims = useRef(trip.records.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.timing(headerAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    trip.records.forEach((_, i) => {
      Animated.spring(cardAnims[i], {
        toValue: 1,
        delay: 150 + i * 100,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }).start();
    });
  }, []);

  const handleRecordPress = (rec: TravelRecord) => {
    navigation.navigate('TripRecord', {
      record: {
        id: rec.id,
        country: `${trip.countryFlag} ${trip.country}`,
        countryName: trip.country,
        countryFlag: trip.countryFlag,
        emoji: trip.emoji,
        viewType: rec.viewType || 'feed',
      },
      viewType: rec.viewType || 'feed',
    });
  };

  return (
    <View style={s.container}>
      {/* 헤더 */}
      <Animated.View style={[s.header, { opacity: headerAnim }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerFlag}>{trip.countryFlag}</Text>
          <Text style={s.headerTitle}>{trip.title}</Text>
        </View>
        <View style={s.backBtn} />
      </Animated.View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 히어로 배너 */}
        <Animated.View style={[s.hero, {
          opacity: headerAnim,
          transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) }],
        }]}>
          <LinearGradient
            colors={[trip.color, 'rgba(10,10,15,0.8)', COLORS.bg]}
            style={s.heroBg}
          />
          <Text style={s.heroEmoji}>{trip.emoji}</Text>
          <Text style={s.heroDate}>{trip.date}</Text>
          <View style={s.heroPill}>
            <Text style={s.heroPillText}>{trip.records.length}개의 기록</Text>
          </View>
        </Animated.View>

        {/* 형식별 기록 카드 */}
        {trip.records.map((rec, idx) => {
          const config = VIEW_CONFIG[rec.viewType];
          if (!config) return null;
          const typeRecords = getRecordsByType(rec.viewType);

          const animStyle = {
            opacity: cardAnims[idx],
            transform: [{
              translateY: cardAnims[idx].interpolate({
                inputRange: [0, 1],
                outputRange: [30, 0],
              }),
            }],
          };

          return (
            <Animated.View key={rec.id} style={[s.section, animStyle]}>
              {/* 섹션 헤더 */}
              <View style={s.sectionHeader}>
                <View style={[s.sectionDot, { backgroundColor: config.accent }]} />
                <Text style={[s.sectionName, { color: config.accent }]}>
                  {config.icon} {config.name}
                </Text>
                <View style={[s.sectionLine, { backgroundColor: config.accent + '20' }]} />
              </View>

              {/* 기록 콘텐츠 */}
              {typeRecords.length > 0 ? (
                typeRecords.map((record) => (
                  <TouchableOpacity
                    key={record.id}
                    activeOpacity={0.75}
                    onPress={() => handleRecordPress(record)}
                  >
                    {rec.viewType === 'feed' && <FeedCard record={record} accent={config.accent} />}
                    {rec.viewType === 'moment' && <MomentCard record={record} accent={config.accent} />}
                    {rec.viewType === 'storyboard' && <StoryboardCard record={record} accent={config.accent} />}
                    {rec.viewType === 'album' && <AlbumCard record={record} accent={config.accent} />}
                  </TouchableOpacity>
                ))
              ) : (
                <View style={s.emptyCard}>
                  <Text style={s.emptyIcon}>{config.icon}</Text>
                  <Text style={s.emptyText}>아직 {config.name} 기록이 없어요</Text>
                </View>
              )}
            </Animated.View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── 피드 카드 ───
function FeedCard({ record, accent }: { record: TravelRecord; accent: string }) {
  return (
    <View style={[card.feed, { borderColor: accent + '18' }]}>
      <LinearGradient
        colors={['rgba(88,166,255,0.08)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {/* 상단 유저 */}
      <View style={card.feedHeader}>
        <View style={card.feedAvatar}>
          <Text style={card.feedAvatarEmoji}>{record.user.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={card.feedUserName}>{record.user.name}</Text>
          <Text style={card.feedDate}>{record.date}</Text>
        </View>
        <View style={[card.feedTypeBadge, { backgroundColor: accent + '15' }]}>
          <Text style={[card.feedTypeText, { color: accent }]}>피드</Text>
        </View>
      </View>
      {/* 본문 */}
      <Text style={card.feedContent} numberOfLines={3}>{record.content}</Text>
      {/* 하단 인터랙션 */}
      <View style={card.feedFooter}>
        <Text style={card.feedStat}>♥ {record.likes}</Text>
        <View style={card.feedStatRow}>
          <CommentIcon size={14} color="#A1A1B0" />
          <Text style={card.feedStat}>{record.comments}</Text>
        </View>
        {record.keywords && record.keywords.length > 0 && (
          <View style={card.feedTags}>
            {record.keywords.slice(0, 2).map((k) => (
              <Text key={k} style={[card.feedTag, { color: accent }]}>#{k}</Text>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── 모먼트 카드 ───
function MomentCard({ record, accent }: { record: TravelRecord; accent: string }) {
  return (
    <View style={[card.moment, { borderColor: accent + '18' }]}>
      <LinearGradient
        colors={['rgba(255,107,205,0.1)', 'rgba(255,107,205,0.02)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {/* 감성 큰 따옴표 */}
      <Text style={[card.momentQuote, { color: accent + '30' }]}>"</Text>
      {/* 본문 (감성 강조) */}
      <Text style={card.momentContent}>{record.content}</Text>
      {/* 메모 */}
      {record.memo && (
        <View style={[card.momentMemoBox, { borderLeftColor: accent + '50' }]}>
          <Text style={card.momentMemo}>{record.memo}</Text>
        </View>
      )}
      {/* 하단 정보 */}
      <View style={card.momentFooter}>
        <Text style={card.momentDate}>{record.date}</Text>
        {record.weather && <Text style={card.momentWeather}>{record.weather}</Text>}
        {record.rating && (
          <Text style={[card.momentRating, { color: accent }]}>
            {'★'.repeat(record.rating)}
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── 스토리보드 카드 ───
function StoryboardCard({ record, accent }: { record: TravelRecord; accent: string }) {
  // DAY 파싱
  const days = record.content.split('→').map((d) => d.trim());

  return (
    <View style={[card.story, { borderColor: accent + '18' }]}>
      <LinearGradient
        colors={['rgba(126,231,135,0.08)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {/* 타임라인 */}
      <View style={card.storyTimeline}>
        {days.map((day, i) => (
          <View key={i} style={card.storyDay}>
            <View style={card.storyNodeCol}>
              <View style={[card.storyNode, { backgroundColor: accent }]} />
              {i < days.length - 1 && (
                <View style={[card.storyConnector, { backgroundColor: accent + '30' }]} />
              )}
            </View>
            <View style={card.storyDayContent}>
              <Text style={card.storyDayText}>{day}</Text>
            </View>
          </View>
        ))}
      </View>
      {/* 하단 메타 */}
      <View style={card.storyMeta}>
        {record.startDate && record.endDate && (
          <View style={[card.storyMetaPill, { backgroundColor: accent + '12' }]}>
            <Text style={[card.storyMetaText, { color: accent }]}>
              {record.startDate} ~ {record.endDate}
            </Text>
          </View>
        )}
        {record.companions && record.companions.length > 0 && (
          <View style={[card.storyMetaPill, { backgroundColor: accent + '12' }]}>
            <Text style={[card.storyMetaText, { color: accent }]}>
              👥 {record.companions.join(', ')}
            </Text>
          </View>
        )}
        {record.budget && (
          <View style={[card.storyMetaPill, { backgroundColor: accent + '12' }]}>
            <Text style={[card.storyMetaText, { color: accent }]}>
              💰 {record.budget.amount.toLocaleString()}{record.budget.currency === 'KRW' ? '원' : record.budget.currency}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── 앨범 카드 ───
function AlbumCard({ record, accent }: { record: TravelRecord; accent: string }) {
  return (
    <View style={[card.album, { borderColor: accent + '18' }]}>
      <LinearGradient
        colors={['rgba(255,166,87,0.1)', 'rgba(255,166,87,0.02)', 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {/* 앨범 그리드 플레이스홀더 */}
      <View style={card.albumGrid}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={[card.albumCell, { backgroundColor: accent + (i < 2 ? '20' : '10') }]}>
            {i === 0 && <Text style={card.albumCellIcon}>🏔️</Text>}
            {i === 1 && <Text style={card.albumCellIcon}>🌅</Text>}
            {i === 2 && <Text style={card.albumCellIcon}>☁️</Text>}
            {i === 3 && <Text style={card.albumCellIcon}>🚠</Text>}
            {i === 4 && <Text style={card.albumCellIcon}>❄️</Text>}
            {i === 5 && <Text style={{ fontSize: 11, color: accent }}>+</Text>}
          </View>
        ))}
      </View>
      {/* 설명 */}
      <Text style={card.albumContent} numberOfLines={2}>{record.content}</Text>
      {/* 하단 */}
      <View style={card.albumFooter}>
        <Text style={card.albumDate}>{record.date}</Text>
        {record.memo && (
          <Text style={[card.albumMemo, { color: accent }]} numberOfLines={1}>
            💡 {record.memo}
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── 메인 스타일 ───
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { fontSize: 17, color: COLORS.white },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerFlag: { fontSize: 18 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.white, letterSpacing: -0.3 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 60 },
  // 히어로
  hero: {
    alignItems: 'center', paddingTop: 8, paddingBottom: 28,
    position: 'relative', overflow: 'hidden',
  },
  heroBg: { ...StyleSheet.absoluteFillObject, opacity: 0.7 },
  heroEmoji: { fontSize: 64, marginBottom: 10 },
  heroDate: { fontSize: 14, color: COLORS.textDim, fontWeight: '500', letterSpacing: 0.5 },
  heroPill: {
    marginTop: 8, paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 20, backgroundColor: 'rgba(191,133,252,0.12)',
    borderWidth: 1, borderColor: 'rgba(191,133,252,0.2)',
  },
  heroPillText: { fontSize: 12, color: COLORS.purpleNeon, fontWeight: '600' },
  // 섹션
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8,
  },
  sectionDot: { width: 6, height: 6, borderRadius: 3 },
  sectionName: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  sectionLine: { flex: 1, height: 1, borderRadius: 1 },
  // 빈 상태
  emptyCard: {
    alignItems: 'center', paddingVertical: 28,
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  emptyIcon: { fontSize: 28, marginBottom: 8 },
  emptyText: { fontSize: 13, color: COLORS.textMuted },
});

// ─── 카드 스타일 ───
const card = StyleSheet.create({
  // Feed
  feed: {
    backgroundColor: COLORS.card, borderRadius: 18,
    borderWidth: 1, padding: 16, marginBottom: 10, overflow: 'hidden',
  },
  feedHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12,
  },
  feedAvatar: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: 'rgba(88,166,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  feedAvatarEmoji: { fontSize: 18 },
  feedUserName: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  feedDate: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  feedTypeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  feedTypeText: { fontSize: 10, fontWeight: '700' },
  feedContent: { fontSize: 14, color: COLORS.white, lineHeight: 21, marginBottom: 12 },
  feedFooter: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  feedStatRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  feedStat: { fontSize: 12, color: COLORS.textDim },
  feedTags: { flexDirection: 'row', gap: 6, marginLeft: 'auto' },
  feedTag: { fontSize: 11, fontWeight: '600' },

  // Moment
  moment: {
    backgroundColor: COLORS.card, borderRadius: 18,
    borderWidth: 1, padding: 20, marginBottom: 10, overflow: 'hidden',
    position: 'relative',
  },
  momentQuote: { fontSize: 48, fontWeight: '800', position: 'absolute', top: 8, left: 16 },
  momentContent: {
    fontSize: 15, color: COLORS.white, lineHeight: 24,
    fontStyle: 'italic', marginTop: 10, marginBottom: 12,
  },
  momentMemoBox: {
    borderLeftWidth: 2, paddingLeft: 10, marginBottom: 12,
  },
  momentMemo: { fontSize: 12, color: COLORS.textDim, lineHeight: 18 },
  momentFooter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  momentDate: { fontSize: 11, color: COLORS.textMuted },
  momentWeather: { fontSize: 12 },
  momentRating: { fontSize: 11, marginLeft: 'auto' },

  // Storyboard
  story: {
    backgroundColor: COLORS.card, borderRadius: 18,
    borderWidth: 1, padding: 16, marginBottom: 10, overflow: 'hidden',
  },
  storyTimeline: { marginBottom: 12 },
  storyDay: { flexDirection: 'row', minHeight: 36 },
  storyNodeCol: { width: 20, alignItems: 'center' },
  storyNode: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  storyConnector: { width: 2, flex: 1, marginTop: 2, marginBottom: 2, borderRadius: 1 },
  storyDayContent: { flex: 1, paddingLeft: 8, paddingBottom: 8 },
  storyDayText: { fontSize: 13, color: COLORS.white, lineHeight: 20 },
  storyMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  storyMetaPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  storyMetaText: { fontSize: 11, fontWeight: '600' },

  // Album
  album: {
    backgroundColor: COLORS.card, borderRadius: 18,
    borderWidth: 1, padding: 16, marginBottom: 10, overflow: 'hidden',
  },
  albumGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12,
  },
  albumCell: {
    width: (SCREEN_WIDTH - 40 - 32 - 30) / 3, height: 56,
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  albumCellIcon: { fontSize: 20 },
  albumContent: { fontSize: 13, color: COLORS.white, lineHeight: 20, marginBottom: 10 },
  albumFooter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  albumDate: { fontSize: 11, color: COLORS.textMuted },
  albumMemo: { fontSize: 11, fontWeight: '500', flex: 1 },
});
