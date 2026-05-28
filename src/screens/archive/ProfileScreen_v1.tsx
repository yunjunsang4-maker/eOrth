import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';

// ─── 컬러 상수 (Figma 디자인 기반) ───
const COLORS = {
  bg:           '#0A0A0F',
  card:         '#2E2E3B',
  divider:      '#1A1A26',
  purpleNeon:   '#BF85FC',
  purpleDeep:   '#6B21A8',
  purpleBg:     'rgba(107,33,168,0.25)',
  purpleBorder: 'rgba(191,133,252,0.3)',
  purpleThumb:  '#1A0A2E',
  white:        '#FFFFFF',
  textDim:      '#A1A1B0',
  textMuted:    '#4A4A59',
  redBg:        'rgba(255,59,48,0.1)',
  redBorder:    'rgba(255,59,48,0.2)',
  red:          '#FF3B30',
};

// ─── 팔로워 카드 ───
const StatCard = ({
  value,
  label,
  highlight,
}: {
  value: string;
  label: string;
  highlight?: boolean;
}) => (
  <View style={styles.statCard}>
    <Text style={[styles.statValue, highlight && { color: COLORS.purpleNeon }]}>
      {value}
    </Text>
    <Text style={[styles.statLabel, highlight && { color: COLORS.purpleNeon }]}>
      {label}
    </Text>
  </View>
);

// ─── 여행 기록 아이템 ───
const TripItem = ({
  emoji,
  country,
  date,
  stars,
}: {
  emoji: string;
  country: string;
  date: string;
  stars: string;
}) => (
  <TouchableOpacity style={styles.tripItem} activeOpacity={0.7}>
    <View style={styles.tripThumb}>
      <Text style={styles.tripEmoji}>{emoji}</Text>
    </View>
    <View style={styles.tripInfo}>
      <Text style={styles.tripCountry}>{country}</Text>
      <Text style={styles.tripDate}>{date}</Text>
      <Text style={styles.tripStars}>{stars}</Text>
    </View>
    <Text style={styles.chevron}>›</Text>
  </TouchableOpacity>
);

// ─── 설정 그룹 ───
const SettingGroup = ({
  items,
}: {
  items: {
    icon: string;
    label: string;
    value?: string;
    badge?: string;
    onPress?: () => void;
  }[];
}) => (
  <View style={styles.settingGroup}>
    {items.map((item, index) => (
      <React.Fragment key={item.label}>
        <TouchableOpacity style={styles.settingItem} activeOpacity={0.7}>
          <View style={styles.settingLeft}>
            <Text style={styles.settingIcon}>{item.icon}</Text>
            <Text style={styles.settingLabel}>{item.label}</Text>
          </View>
          {item.badge ? (
            <View style={styles.premiumBadge}>
              <Text style={styles.premiumBadgeText}>🔒 프리미엄</Text>
            </View>
          ) : item.value ? (
            <View style={styles.settingRight}>
              <Text style={styles.settingValue}>{item.value}</Text>
              <Text style={styles.chevron}>›</Text>
            </View>
          ) : (
            <Text style={styles.chevron}>›</Text>
          )}
        </TouchableOpacity>
        {index < items.length - 1 && <View style={styles.itemDivider} />}
      </React.Fragment>
    ))}
  </View>
);

// ─── 메인 프로필 화면 ───
export default function ProfileScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* 상단 타이틀 */}
        <Text style={styles.title}>프로필</Text>

        {/* 아바타 */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>윤</Text>
          </View>
          <Text style={styles.userName}>윤준상</Text>
          <Text style={styles.userLocation}>🇰🇷 대한민국</Text>
        </View>

        {/* 팔로워 통계 */}
        <View style={styles.statsRow}>
          <StatCard value="128" label="팔로워" />
          <StatCard value="64" label="팔로잉" />
          <StatCard value="23" label="방문국가" highlight />
        </View>

        <View style={styles.divider} />

        {/* 나의 여행 기록 */}
        <Text style={styles.sectionLabel}>나의 여행 기록</Text>

        <TripItem
          emoji="🗼"
          country="🇯🇵 일본 · 도쿄"
          date="2025.03.01 ~ 03.07"
          stars="★★★★★"
        />
        <View style={styles.itemDividerFull} />
        <TripItem
          emoji="🗼"
          country="🇫🇷 프랑스 · 파리"
          date="2024.11.10 ~ 11.15"
          stars="★★★★☆"
        />
        <View style={styles.itemDividerFull} />
        <TripItem
          emoji="🌴"
          country="🇹🇭 태국 · 방콕"
          date="2024.08.01 ~ 08.05"
          stars="★★★★★"
        />

        {/* 프리미엄 배너 */}
        <TouchableOpacity style={styles.premiumBanner} activeOpacity={0.8}>
          <Text style={styles.premiumIcon}>💎</Text>
          <View style={styles.premiumInfo}>
            <Text style={styles.premiumTitle}>프리미엄 업그레이드</Text>
            <Text style={styles.premiumSub}>
              상세통계 · AI영상 · 프리미엄 스킨 등
            </Text>
          </View>
          <Text style={[styles.chevron, { color: COLORS.purpleNeon }]}>›</Text>
        </TouchableOpacity>

        {/* 계정 설정 */}
        <Text style={styles.groupLabel}>계정</Text>
        <SettingGroup
          items={[
            { icon: '👤', label: '프로필 편집' },
            { icon: '🔒', label: '계정 설정' },
            { icon: '🔔', label: '알림 설정' },
          ]}
        />

        {/* 앱 설정 */}
        <Text style={styles.groupLabel}>앱 설정</Text>
        <SettingGroup
          items={[
            { icon: '🌍', label: '지구본 스킨', badge: '프리미엄' },
            { icon: '🌐', label: '언어 변경', value: '한국어' },
            { icon: '🌙', label: '다크·라이트 모드', value: '다크' },
          ]}
        />

        {/* 지원 */}
        <Text style={styles.groupLabel}>지원</Text>
        <SettingGroup
          items={[
            { icon: '❓', label: 'FAQ' },
            { icon: '💬', label: '피드백 보내기' },
            { icon: '📋', label: '이용약관 · 정책' },
            { icon: 'ℹ️', label: '앱 버전', value: 'v1.0.0' },
          ]}
        />

        {/* 로그아웃 */}
        <TouchableOpacity style={styles.logoutBtn} activeOpacity={0.7}>
          <Text style={styles.logoutText}>🚪 로그아웃</Text>
        </TouchableOpacity>

        {/* 버전 */}
        <Text style={styles.versionText}>eOrth · v1.0.0 · © 2025</Text>
      </ScrollView>

      {/* 하단 메뉴바 */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem}>
          <Text style={styles.tabIcon}>🌍</Text>
          <Text style={styles.tabLabel}>Globe</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem}>
          <Text style={styles.tabIcon}>📊</Text>
          <Text style={styles.tabLabel}>통계</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem}>
          <Text style={styles.tabIcon}>👥</Text>
          <Text style={styles.tabLabel}>소셜</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem}>
          <Text style={[styles.tabIcon, { color: COLORS.purpleNeon }]}>👤</Text>
          <Text style={[styles.tabLabel, { color: COLORS.purpleNeon }]}>프로필</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    paddingHorizontal: 32,
    paddingBottom: 32,
  },

  // 타이틀
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.white,
    marginTop: 62,
    marginBottom: 24,
  },

  // 아바타 섹션
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.purpleDeep,
    borderWidth: 2,
    borderColor: 'rgba(191,133,252,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 4,
  },
  userLocation: {
    fontSize: 13,
    color: COLORS.textDim,
  },

  // 통계 행
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.white,
  },

  // 구분선
  divider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginHorizontal: -32,
    marginBottom: 16,
  },
  itemDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginLeft: 48,
  },
  itemDividerFull: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginLeft: 80,
  },

  // 섹션 라벨
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.purpleNeon,
    marginBottom: 10,
  },
  groupLabel: {
    fontSize: 10,
    color: COLORS.textDim,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },

  // 여행 아이템
  tripItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  tripThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: COLORS.purpleThumb,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripEmoji: {
    fontSize: 20,
  },
  tripInfo: {
    flex: 1,
    gap: 2,
  },
  tripCountry: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
  },
  tripDate: {
    fontSize: 10,
    color: COLORS.textDim,
  },
  tripStars: {
    fontSize: 10,
    color: COLORS.purpleNeon,
  },

  // 프리미엄 배너
  premiumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.purpleBg,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
    borderRadius: 14,
    padding: 16,
    marginTop: 20,
    gap: 12,
  },
  premiumIcon: {
    fontSize: 24,
  },
  premiumInfo: {
    flex: 1,
  },
  premiumTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.purpleNeon,
    marginBottom: 2,
  },
  premiumSub: {
    fontSize: 11,
    color: COLORS.textDim,
  },

  // 설정 그룹
  settingGroup: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingIcon: {
    fontSize: 16,
    width: 24,
  },
  settingLabel: {
    fontSize: 13,
    color: COLORS.white,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  settingValue: {
    fontSize: 11,
    color: COLORS.textDim,
  },
  chevron: {
    fontSize: 18,
    color: COLORS.textMuted,
  },
  premiumBadge: {
    backgroundColor: 'rgba(107,33,168,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.3)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  premiumBadgeText: {
    fontSize: 9,
    color: COLORS.purpleNeon,
  },

  // 로그아웃
  logoutBtn: {
    backgroundColor: COLORS.redBg,
    borderWidth: 1,
    borderColor: COLORS.redBorder,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  logoutText: {
    fontSize: 14,
    color: COLORS.red,
  },

  // 버전
  versionText: {
    fontSize: 10,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 20,
  },

  // 하단 탭바
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(15,15,23,0.97)',
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    paddingBottom: 20,
    paddingTop: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  tabIcon: {
    fontSize: 20,
    color: COLORS.textDim,
  },
  tabLabel: {
    fontSize: 10,
    color: COLORS.textDim,
  },
});
