import React, { useState, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Alert,
  Share,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { handleBlock as confirmBlock } from '../utils/reportAndBlock';
import { useRecords } from '../store/recordStore';
import ReportModal from '../components/ReportModal';
import Toast from '../components/Toast';
import type { RootStackScreenProps } from '../navigation/types';

// ─── 디자인 토큰 ───
const COLORS = {
  bg:           '#0A0A0F',
  card:         '#2E2E3B',
  accent:       '#BF85FC',
  accentDark:   '#6B21A8',
  accentBg:     'rgba(107,33,168,0.25)',
  accentBorder: 'rgba(191,133,252,0.3)',
  dim:          '#A1A1B0',
  muted:        '#4A4A59',
  white:        '#FFFFFF',
  divider:      '#1A1A26',
  green:        '#34C759',
  red:          '#FF3B30',
  menuBg:       '#2E2E3B',
  menuDivider:  '#3A3A4A',
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const THUMB_WIDTH = (SCREEN_WIDTH - 32 - 12) / 2;

// ─── 기록 형식 아이콘 (FAB과 동일한 View 기반) ───
const BADGE_SZ = 14;
const BADGE_C = '#FFFFFF';

const FeedBadgeIcon = () => (
  <View style={{ width: BADGE_SZ, height: BADGE_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 5, height: 2.5, borderTopLeftRadius: 1, borderTopRightRadius: 1, backgroundColor: BADGE_C }} />
    <View style={{ width: 12, height: 8, borderRadius: 2, backgroundColor: BADGE_C, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 5, height: 5, borderRadius: 2.5, borderWidth: 1.2, borderColor: '#2E2E3B' }} />
    </View>
  </View>
);

const BlogBadgeIcon = () => (
  <View style={{ width: BADGE_SZ, height: BADGE_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 12, height: 12, gap: 1.5 }}>
      <View style={{ width: 8, height: 2, borderRadius: 1, backgroundColor: BADGE_C }} />
      <View style={{ width: 12, height: 1.5, borderRadius: 0.75, backgroundColor: BADGE_C, opacity: 0.6 }} />
      <View style={{ width: 10, height: 1.5, borderRadius: 0.75, backgroundColor: BADGE_C, opacity: 0.6 }} />
      <View style={{ width: 9, height: 1.5, borderRadius: 0.75, backgroundColor: BADGE_C, opacity: 0.6 }} />
    </View>
  </View>
);

const AlbumBadgeIcon = () => (
  <View style={{ width: BADGE_SZ, height: BADGE_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 12, height: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 1.5 }}>
      <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: BADGE_C }} />
      <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: BADGE_C }} />
      <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: BADGE_C }} />
      <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: BADGE_C }} />
    </View>
  </View>
);

const SnapBadgeIcon = () => (
  <Svg width={16} height={18} viewBox="0 0 24 24" fill="none">
    <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill={BADGE_C} />
  </Svg>
);

const CutBadgeIcon = () => (
  <View style={{ width: BADGE_SZ, height: BADGE_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 11, height: 13, borderWidth: 1, borderColor: BADGE_C, borderRadius: 2, padding: 1.5, flexDirection: 'row', flexWrap: 'wrap', gap: 1, alignContent: 'center', justifyContent: 'center' }}>
      <View style={{ width: 3, height: 3, borderRadius: 0.5, backgroundColor: BADGE_C }} />
      <View style={{ width: 3, height: 3, borderRadius: 0.5, backgroundColor: BADGE_C }} />
      <View style={{ width: 3, height: 3, borderRadius: 0.5, backgroundColor: BADGE_C }} />
      <View style={{ width: 3, height: 3, borderRadius: 0.5, backgroundColor: BADGE_C }} />
    </View>
  </View>
);

const VIEW_TYPE_BADGE: Record<string, React.ReactNode> = {
  feed: <FeedBadgeIcon />,
  blog: <BlogBadgeIcon />,
  album: <AlbumBadgeIcon />,
  snap: <SnapBadgeIcon />,
  cut: <CutBadgeIcon />,
};

// ─── 샘플 데이터 ───
const friendProfile = {
  username: 'minjun_k',
  name: '김민준',
  flag: '🇰🇷',
  country: '대한민국',
  recordCount: 15,
  visitedCountries: 8,
  followers: 42,
  isAbroad: true,
  currentCountry: '일본',
  currentCountryFlag: '🇯🇵',
  isFollowing: false,
  badges: [
    { id: 1, emoji: '🛫', name: '첫 도장' },
    { id: 2, emoji: '🌏', name: '첫 아시아' },
    { id: 3, emoji: '🎒', name: '혼행러' },
    { id: 4, emoji: '🌟', name: '보이저 스타' },
  ],
  trips: [
    {
      id: 'trip-1',
      emoji: '🗼',
      title: '🇯🇵 2025.03.05',
      country: '일본',
      countryFlag: '🇯🇵',
      date: '2025.03',
      color: '#1A0A2E',
      records: [
        { id: '1', viewType: 'feed' },
        { id: '2', viewType: 'blog' },
        { id: 'seed-snap2', viewType: 'snap' },
        { id: 'seed-cut', viewType: 'cut' },
      ],
    },
    {
      id: 'trip-2',
      emoji: '🌴',
      title: '🇹🇭 2025.01.15',
      country: '태국',
      countryFlag: '🇹🇭',
      date: '2025.01',
      color: '#2E1A0A',
      records: [
        { id: '4', viewType: 'blog' },
        { id: '5', viewType: 'feed' },
        { id: 'seed-snap', viewType: 'snap' },
      ],
    },
    {
      id: 'trip-3',
      emoji: '🗽',
      title: '🇺🇸 2024.12.01',
      country: '미국',
      countryFlag: '🇺🇸',
      date: '2024.12',
      color: '#0A1A2E',
      records: [
        { id: '6', viewType: 'feed' },
      ],
    },
    {
      id: 'trip-4',
      emoji: '🏛️',
      title: '🇮🇹 2024.10.10',
      country: '이탈리아',
      countryFlag: '🇮🇹',
      date: '2024.10',
      color: '#1A1A0A',
      records: [
        { id: '7', viewType: 'blog' },
      ],
    },
  ],
};

// ─── 배지 하이라이트 ───
const BadgeHighlightItem = ({ emoji, name }: { emoji: string; name: string }) => (
  <View style={badgeHL.item}>
    <LinearGradient
      colors={['#6B21A8', '#BF85FC']}
      start={{ x: 0, y: 1 }}
      end={{ x: 1, y: 0 }}
      style={badgeHL.gradientRing}
    >
      <View style={badgeHL.circle}>
        <Text style={badgeHL.emoji}>{emoji}</Text>
      </View>
    </LinearGradient>
    <Text style={badgeHL.name} numberOfLines={1}>
      {name.length > 6 ? name.slice(0, 5) + '…' : name}
    </Text>
  </View>
);

// ─── 메인 화면 ───
export default function FriendProfileScreen({
  navigation,
  route,
}: RootStackScreenProps<'FriendProfile'>) {
  const insets = useSafeAreaInsets();
  const { userId, username } = route.params ?? { userId: null, username: friendProfile.username };
  const profile = friendProfile;
  const displayUsername = username ?? profile.username;

  // 팔로우·차단은 store 공유 상태 — 팔로잉 목록/프로필 카운트와 동기화된다
  const { followingUsers, followUser, unfollowUser, blockUser } = useRecords();
  const following = followingUsers.some((f) => f.username === displayUsername);
  const toggleFollow = () => {
    if (following) {
      unfollowUser(displayUsername);
    } else {
      followUser({
        id: userId ?? displayUsername,
        username: displayUsername,
        isAbroad: profile.isAbroad,
        currentCountry: profile.currentCountry,
        currentCountryFlag: profile.currentCountryFlag,
      });
    }
  };
  const [menuVisible, setMenuVisible] = useState(false);
  const [notifMuted, setNotifMuted] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2000);
  };

  // ── 핸들러 ──
  const handleCopyLink = async () => {
    setMenuVisible(false);
    await Clipboard.setStringAsync(`eOrth://profile/${displayUsername}`);
    showToast('링크가 복사되었어요!');
  };

  const handleShare = () => {
    setMenuVisible(false);
    Share.share({
      message: `@${displayUsername}의 eOrth 프로필을 확인해보세요!\neOrth://profile/${displayUsername}`,
      title: 'eOrth 프로필 공유',
    });
  };

  const handleToggleNotif = () => {
    setMenuVisible(false);
    if (notifMuted) {
      setNotifMuted(false);
      showToast('알림을 켰어요');
    } else {
      Alert.alert(
        '알림 끄기',
        '이 친구의 새 기록 알림을 끌까요?',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '끄기',
            onPress: () => {
              setNotifMuted(true);
              showToast('알림을 껐어요');
            },
          },
        ]
      );
    }
  };

  const MENU_NORMAL = [
    { icon: '🔗', label: '프로필 링크 복사', onPress: handleCopyLink },
    { icon: '📤', label: '공유하기',          onPress: handleShare },
    {
      icon:    notifMuted ? '🔔' : '🔕',
      label:   notifMuted ? '알림 켜기' : '알림 끄기',
      onPress: handleToggleNotif,
    },
  ];

  const MENU_DANGER = [
    {
      icon: '⛔',
      label: '차단하기',
      onPress: () => {
        setMenuVisible(false);
        confirmBlock(displayUsername, () => {
          blockUser({ name: displayUsername, emoji: '👤' });
          unfollowUser(displayUsername); // 차단하면 팔로잉에서도 제거
          showToast('차단되었어요');
          setTimeout(() => navigation.goBack(), 600);
        });
      },
    },
    { icon: '🚨', label: '신고하기', onPress: () => { setMenuVisible(false); setReportVisible(true); } },
  ];

  return (
    <View style={s.container}>
      {/* ── 헤더 ── */}
      <View style={[s.header, { marginTop: insets.top + 12 }]}>
        <TouchableOpacity style={s.headerBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>@{displayUsername}</Text>
        <TouchableOpacity style={s.headerBtn} onPress={() => setMenuVisible((v) => !v)} activeOpacity={0.7}>
          <Text style={s.moreIcon}>···</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 프로필 헤더 (아바타 + 정보) ── */}
        <View style={s.profileRow}>
          <View style={s.avatarWrap}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{displayUsername[0].toUpperCase()}</Text>
            </View>
            {profile.isAbroad && <View style={s.onlineDot} />}
          </View>
          <View style={s.profileInfo}>
            <Text style={s.userName}>{profile.name}</Text>
            <Text style={s.userHandle}>@{displayUsername}</Text>
            <Text style={s.userLocation}>{profile.flag} {profile.country}</Text>
            <View style={s.statsRow}>
              <View style={s.statCard}>
                <Text style={s.statValue}>{profile.recordCount}</Text>
                <Text style={s.statLabel}>기록 수</Text>
              </View>
              <View style={s.statCard}>
                <Text style={[s.statValue, { color: COLORS.accent }]}>{profile.followers}</Text>
                <Text style={[s.statLabel, { color: COLORS.accent }]}>팔로워</Text>
              </View>
              <View style={s.statCard}>
                <Text style={[s.statValue, { color: COLORS.accent }]}>{profile.visitedCountries}</Text>
                <Text style={[s.statLabel, { color: COLORS.accent }]}>방문국가</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 여행 중 배너 ── */}
        {profile.isAbroad && (
          <View style={s.abroadBanner}>
            <Text style={s.abroadText}>
              ✈️ {profile.currentCountryFlag} {profile.currentCountry} 여행 중이에요!
            </Text>
          </View>
        )}

        {/* ── 팔로우 버튼 ── */}
        <TouchableOpacity
          style={[s.followBtn, following && s.followingBtn]}
          onPress={toggleFollow}
          activeOpacity={0.85}
        >
          <Text style={[s.followBtnText, following && s.followingBtnText]}>
            {following ? '팔로잉 ✓' : '팔로우'}
          </Text>
        </TouchableOpacity>

        {/* ── 배지 하이라이트 ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={badgeHL.scroll}
          contentContainerStyle={badgeHL.scrollContent}
        >
          {profile.badges.map((badge) => (
            <BadgeHighlightItem key={badge.id} emoji={badge.emoji} name={badge.name} />
          ))}
        </ScrollView>

        <View style={s.divider} />

        {/* ── 여행 기록 ── */}
        <View style={s.gridHeaderRow}>
          <Text style={s.gridHeaderTitle}>여행 기록</Text>
          <Text style={s.tripCount}>{profile.trips.length}개의 여행</Text>
        </View>

        <View style={s.thumbGrid}>
          {profile.trips.map((trip) => (
            <TouchableOpacity
              key={trip.id}
              style={[s.thumbCard, { backgroundColor: trip.color }]}
              activeOpacity={0.85}
            >
              <View style={s.thumbEmojiWrap}>
                <Text style={s.thumbEmoji}>{trip.emoji}</Text>
              </View>
              <View style={s.thumbInfo}>
                <Text style={s.thumbCountry}>{trip.title}</Text>
                <Text style={s.thumbDate}>{trip.date}</Text>
                <View style={s.thumbBadges}>
                  {Array.from(new Set(trip.records.map((rec) => rec.viewType || 'feed'))).map((vt, idx) => (
                    <View key={`${vt}-${idx}`} style={s.thumbBadge}>
                      {VIEW_TYPE_BADGE[vt] || null}
                    </View>
                  ))}
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>

      {/* ── 팝업 오버레이 ── */}
      {menuVisible && (
        <TouchableOpacity
          style={s.menuOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        />
      )}

      {/* ── 팝업 메뉴 ── */}
      {menuVisible && (
        <View style={s.popupMenu}>
          {MENU_NORMAL.map((item, idx) => (
            <View key={item.label}>
              <TouchableOpacity style={s.menuItem} onPress={item.onPress} activeOpacity={0.7}>
                <Text style={s.menuItemIcon}>{item.icon}</Text>
                <Text style={s.menuItemText}>{item.label}</Text>
              </TouchableOpacity>
              {idx < MENU_NORMAL.length - 1 && <View style={s.menuItemDivider} />}
            </View>
          ))}
          <View style={s.menuSectionDivider} />
          {MENU_DANGER.map((item, idx) => (
            <View key={item.label}>
              <TouchableOpacity style={s.menuItem} onPress={item.onPress} activeOpacity={0.7}>
                <Text style={s.menuItemIcon}>{item.icon}</Text>
                <Text style={[s.menuItemText, s.menuItemDanger]}>{item.label}</Text>
              </TouchableOpacity>
              {idx < MENU_DANGER.length - 1 && <View style={s.menuItemDivider} />}
            </View>
          ))}
        </View>
      )}

      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSubmit={(reason) => {
          setReportVisible(false);
          showToast('신고가 접수되었어요');
        }}
      />

      <Toast visible={toastVisible} message={toastMsg} />
    </View>
  );
}

// ─── 배지 하이라이트 스타일 ───
const badgeHL = StyleSheet.create({
  scroll: { marginTop: 20 },
  scrollContent: { paddingHorizontal: 16, gap: 16 },
  item: { alignItems: 'center', gap: 6 },
  gradientRing: {
    width: 68, height: 68, borderRadius: 34,
    alignItems: 'center', justifyContent: 'center',
  },
  circle: {
    width: 62, height: 62, borderRadius: 31,
    backgroundColor: COLORS.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  emoji: { fontSize: 26 },
  name: { fontSize: 10, color: COLORS.dim, fontWeight: '600' },
});

// ─── 스타일 ───
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },

  // ── 헤더 ──
  header: {
    height: 56,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  headerBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { fontSize: 28, color: COLORS.white },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.white },
  moreIcon: { fontSize: 18, color: COLORS.dim, letterSpacing: 2 },

  // ── 프로필 ──
  profileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginTop: 24,
    marginBottom: 16,
  },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.accentDark,
    borderWidth: 2, borderColor: 'rgba(191,133,252,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 28, fontWeight: 'bold', color: COLORS.white },
  onlineDot: {
    position: 'absolute', bottom: 2, right: 2,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: COLORS.green, borderWidth: 2, borderColor: COLORS.bg,
  },
  profileInfo: { flex: 1 },
  userName: { fontSize: 20, fontWeight: 'bold', color: COLORS.white, marginBottom: 2 },
  userHandle: { fontSize: 13, color: COLORS.accent, marginBottom: 2 },
  userLocation: { fontSize: 13, color: COLORS.dim, marginBottom: 8 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: {
    backgroundColor: COLORS.card, borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center',
  },
  statValue: { fontSize: 14, fontWeight: 'bold', color: COLORS.white, marginBottom: 2 },
  statLabel: { fontSize: 11, color: COLORS.dim },

  // ── 여행 중 배너 ──
  abroadBanner: {
    backgroundColor: 'rgba(191,133,252,0.08)',
    borderWidth: 1, borderColor: COLORS.accent,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    marginBottom: 12,
  },
  abroadText: { fontSize: 14, color: COLORS.accent, fontWeight: '500' },

  // ── 팔로우 버튼 ──
  followBtn: {
    height: 44, borderRadius: 12,
    backgroundColor: COLORS.accentDark,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  followingBtn: { backgroundColor: COLORS.card },
  followBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.white },
  followingBtnText: { color: COLORS.accent },

  // ── 구분선 ──
  divider: {
    height: 1, backgroundColor: COLORS.divider,
    marginHorizontal: -16, marginTop: 16, marginBottom: 16,
  },

  // ── 여행 기록 헤더 ──
  gridHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12,
  },
  gridHeaderTitle: { fontSize: 16, fontWeight: '700', color: COLORS.white },
  tripCount: { fontSize: 12, color: COLORS.dim },

  // ── 여행 썸네일 2열 그리드 ──
  thumbGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
  },
  thumbCard: {
    width: THUMB_WIDTH, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(191,133,252,0.15)',
  },
  thumbEmojiWrap: {
    height: THUMB_WIDTH * 0.7,
    alignItems: 'center', justifyContent: 'center',
  },
  thumbEmoji: { fontSize: 40 },
  thumbInfo: { paddingHorizontal: 10, paddingBottom: 10, gap: 2 },
  thumbCountry: { fontSize: 12, fontWeight: '600', color: COLORS.white },
  thumbDate: { fontSize: 10, color: COLORS.dim },
  thumbBadges: { flexDirection: 'row', gap: 4, marginTop: 4 },
  thumbBadge: {
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: 'rgba(191,133,252,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── 팝업 오버레이 ──
  menuOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 50,
  },

  // ── 팝업 메뉴 ──
  popupMenu: {
    position: 'absolute', top: 56 + 56 + 8, right: 16, width: 180,
    backgroundColor: COLORS.menuBg, borderRadius: 12, zIndex: 51,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 12, overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    height: 48, paddingHorizontal: 16, gap: 10,
  },
  menuItemIcon: { fontSize: 16 },
  menuItemText: { fontSize: 14, color: COLORS.white, fontWeight: '500' },
  menuItemDanger: { color: COLORS.red },
  menuItemDivider: { height: 1, backgroundColor: COLORS.menuDivider },
  menuSectionDivider: { height: 1, backgroundColor: COLORS.menuDivider },
});
