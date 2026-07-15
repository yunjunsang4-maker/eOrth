// 추후 업데이트 예정 - 탐색 탭
// 출시 초반에는 미사용, 나중에 SocialScreen에 연결 예정

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Typography, Spacing, BorderRadius } from '../constants';
import { useRecords, TravelRecord } from '../store/recordStore';
import { TargetIcon, SparkleIcon, GlobeIcon } from '../components/icons';

const { width } = Dimensions.get('window');

// ─────────────────────────────────────────────
// 디자인 토큰
// ─────────────────────────────────────────────
const C = {
  bg: '#0A0A0F',
  card: '#1A0A2E',
  accent: '#BF85FC',
  accentDim: 'rgba(191,133,252,0.15)',
  accentBorder: 'rgba(191,133,252,0.25)',
  dim: '#A1A1B0',
  white: '#FFFFFF',
  overlayBar: 'rgba(10,4,24,0.72)',
};

// ─────────────────────────────────────────────
// 더미 데이터
// ─────────────────────────────────────────────
const CREATORS = [
  { id: '1', initials: 'MJ', name: '민지' },
  { id: '2', initials: 'JS', name: '준서' },
  { id: '3', initials: 'SY', name: '서연' },
  { id: '4', initials: 'HJ', name: '현준' },
  { id: '5', initials: 'YN', name: '유나' },
];

// 국가명 → 대표 이모지 매핑 (탐색 카드용)
const COUNTRY_EMOJI: Record<string, string> = {
  프랑스: '🗼', 일본: '🌸', 이탈리아: '🏛️', 그리스: '🌊',
  몰디브: '🏝️', 발리: '🌅', 미국: '🗽', 영국: '🏰',
  스페인: '🌞', 독일: '🏟️',
};
const getCountryEmoji = (name: string) => COUNTRY_EMOJI[name] ?? '🌍';

// ─────────────────────────────────────────────
// 서브 컴포넌트: 보이저 아이템
// ─────────────────────────────────────────────
function CreatorItem({ initials, name }: { initials: string; name: string }) {
  return (
    <View style={s.creatorItem}>
      <View style={s.creatorAvatarWrap}>
        <View style={s.creatorAvatar}>
          <Text style={s.creatorInitials}>{initials}</Text>
        </View>
        {/* 인증 배지 */}
        <View style={s.verifiedBadge}>
          <Text style={s.verifiedCheck}>✓</Text>
        </View>
      </View>
      <Text style={s.creatorName}>{name}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// 서브 컴포넌트: 큰 기록 카드 (탐색 탭)
// ─────────────────────────────────────────────
function LargeRecordCard({ item }: { item: TravelRecord }) {
  const { t } = useTranslation();
  const elapsed = Math.round((Date.now() - item.timestamp) / 3600000);
  const timeStr = elapsed < 1 ? t('time.justNow') : elapsed < 24 ? t('time.hourAgo', { n: elapsed }) : item.date;
  return (
    <View style={s.largeCard}>
      <View style={s.largeCardInner}>
        <Text style={s.largeCardEmoji}>{getCountryEmoji(item.countryName)}</Text>
      </View>
      <View style={s.largeCardBar}>
        <Text style={s.largeCardCountry}>{item.countryName}</Text>
        <View style={s.largeCardMeta}>
          <Text style={s.largeCardUser}>{item.user.name}</Text>
          <Text style={s.largeCardDot}>·</Text>
          <Text style={s.largeCardTime}>{timeStr}</Text>
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// 서브 컴포넌트: 작은 기록 카드 (탐색 탭)
// ─────────────────────────────────────────────
function SmallRecordCard({ item }: { item: TravelRecord }) {
  return (
    <View style={s.smallCard}>
      <View style={s.smallCardInner}>
        <Text style={s.smallCardEmoji}>{getCountryEmoji(item.countryName)}</Text>
      </View>
      <View style={s.smallCardBar}>
        <Text style={s.smallCardCountry}>{item.countryName}</Text>
        <Text style={s.smallCardUser}>{item.user.name}</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// 서브 컴포넌트: 광고 배너 (실제 광고로 교체 가능)
// ─────────────────────────────────────────────
function AdBanner() {
  const { t } = useTranslation();
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => {}}>
      <LinearGradient
        colors={['#1A0A2E', '#2D1B4E']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={s.adBanner}
      >
        {/* 왼쪽 아이콘 */}
        <TargetIcon size={24} color="#A1A1B0" />

        {/* 중앙 텍스트 */}
        <View style={s.adTextWrap}>
          <Text style={s.adTitle}>eOrth Premium</Text>
          <Text style={s.adSubtitle}>{t('misc.adSubtitle')}</Text>
        </View>

        {/* 오른쪽 버튼 */}
        <View style={s.adBtn}>
          <Text style={s.adBtnText}>{t('misc.adView')}</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────
// 탐색 화면
// ─────────────────────────────────────────────
export default function SocialExploreScreen() {
  const { t } = useTranslation();
  const { records } = useRecords();
  const publicRecords = records.filter((r) => r.visibility === 'neighbors');
  const largeCard = publicRecords[0];
  const smallCards = publicRecords.slice(1);

  // 2열 그리드를 위해 짝으로 묶기
  const pairs: TravelRecord[][] = [];
  for (let i = 0; i < smallCards.length; i += 2) {
    pairs.push(smallCards.slice(i, i + 2));
  }

  return (
    <View style={s.container}>
      {/* 보이저 라벨 - 고정 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><SparkleIcon size={16} color="#A1A1B0" /><Text style={[s.sectionTitle, s.explorePadding]}>{t('misc.voyager')}</Text></View>

      {/* 보이저 가로 스크롤 - 고정 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.creatorList}
        style={s.creatorScroll}
      >
        {CREATORS.map((c) => (
          <CreatorItem key={c.id} initials={c.initials} name={c.name} />
        ))}
      </ScrollView>

      {/* 광고 배너 - 고정 */}
      <AdBanner />

      {/* 최근 공개 기록만 스크롤 */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.exploreScroll}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><GlobeIcon size={16} color="#A1A1B0" /><Text style={[s.sectionTitle, { marginTop: Spacing[2] }]}>{t('misc.recentPublic')}</Text></View>

        {publicRecords.length === 0 ? (
          <Text style={s.emptyText}>{t('misc.noPublic')}</Text>
        ) : (
          <>
            {largeCard && <LargeRecordCard item={largeCard} />}
            {pairs.map((pair, idx) => (
              <View key={idx} style={s.gridRow}>
                {pair.map((item) => (
                  <SmallRecordCard key={item.id} item={item} />
                ))}
              </View>
            ))}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────
// 스타일
// ─────────────────────────────────────────────
const CARD_GAP = 10;
const SMALL_CARD_WIDTH = (width - Spacing[6] * 2 - CARD_GAP) / 2;

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // 탐색
  explorePadding: {
    paddingHorizontal: Spacing[6],
  },
  exploreScroll: {
    paddingHorizontal: Spacing[6],
    paddingTop: Spacing[2],
  },
  sectionTitle: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.white,
    marginBottom: Spacing[3],
    marginTop: Spacing[5],
  },

  // 광고 배너
  adBanner: {
    marginTop: Spacing[4],
    marginBottom: Spacing[1],
    marginHorizontal: 32,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 12,
  },
  adIcon: {
    fontSize: 24,
  },
  adTextWrap: {
    flex: 1,
    gap: 2,
  },
  adTitle: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.bold,
    color: C.white,
  },
  adSubtitle: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.regular,
    color: C.dim,
  },
  adBtn: {
    backgroundColor: '#6B21A8',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  adBtnText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.white,
  },

  // 보이저 목록
  creatorScroll: {
    flexShrink: 0,
  },
  creatorList: {
    paddingLeft: 32,
    paddingRight: 16,
    gap: 16,
  },
  creatorItem: {
    width: 64,
    alignItems: 'center',
    gap: 6,
  },
  creatorAvatarWrap: {
    position: 'relative',
    width: 56,
    height: 56,
  },
  creatorAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.card,
    borderWidth: 2,
    borderColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorInitials: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: C.accent,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.bg,
  },
  verifiedCheck: {
    fontSize: 10,
    color: C.white,
    fontFamily: Typography.fontFamily.bold,
    lineHeight: 14,
  },
  creatorName: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.medium,
    color: C.dim,
    textAlign: 'center',
  },

  // 큰 카드
  largeCard: {
    width: '100%',
    height: 140,
    borderRadius: BorderRadius.xl,
    backgroundColor: C.card,
    overflow: 'hidden',
    marginBottom: CARD_GAP,
  },
  largeCardInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  largeCardEmoji: {
    fontSize: 52,
  },
  largeCardBar: {
    backgroundColor: C.overlayBar,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  largeCardCountry: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.white,
  },
  largeCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  largeCardUser: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
    color: C.accent,
  },
  largeCardDot: {
    color: C.dim,
    fontSize: Typography.fontSize.xs,
  },
  largeCardTime: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: C.dim,
  },

  // 2열 그리드
  gridRow: {
    flexDirection: 'row',
    gap: CARD_GAP,
    marginBottom: CARD_GAP,
  },
  smallCard: {
    width: SMALL_CARD_WIDTH,
    height: 150,
    borderRadius: BorderRadius.xl,
    backgroundColor: C.card,
    overflow: 'hidden',
  },
  smallCardInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallCardEmoji: {
    fontSize: 42,
  },
  smallCardBar: {
    backgroundColor: C.overlayBar,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  smallCardCountry: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.semiBold,
    color: C.white,
  },
  smallCardUser: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: C.accent,
    marginTop: 1,
  },

  // 빈 상태
  emptyText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: C.dim,
    textAlign: 'center',
    marginTop: Spacing[8],
  },
});
