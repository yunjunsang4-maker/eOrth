import React, { useState, useRef, useEffect, useMemo } from 'react';
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
import { handleBlock as confirmBlock } from '../utils/reportAndBlock';
import { useRecords } from '../store/recordStore';
import { useSettings } from '../store/settingsStore';
import ReportModal from '../components/ReportModal';
import Toast from '../components/Toast';
import { isSupabaseConfigured } from '../services/supabase';
import { getProfileById, type ProfileRow } from '../services/profile';
import { fetchUserPosts } from '../services/posts';
import { fetchFollowerCount } from '../services/social';
import { computeEarnedBadgeIds } from '../utils/badgeRules';
import { BADGES } from '../constants/badges';
import { ProfileAvatar, StatCard, BadgeHighlightItem, TripCard, pv } from '../components/profile/ProfileVisuals';
import type { TravelRecord } from '../store/recordStore';
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
  muted:        '#8B8B9E',
  white:        '#FFFFFF',
  divider:      '#1A1A26',
  green:        '#34C759',
  red:          '#FF3B30',
  menuBg:       '#2E2E3B',
  menuDivider:  '#3A3A4A',
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const THUMB_WIDTH = (SCREEN_WIDTH - 32 - 12) / 2;

// 라우트 파라미터 누락 시 username 기본값으로만 사용 (실제 데이터는 백엔드에서 로드)
const friendProfile = { username: '' };

// ─── 메인 화면 ───
export default function FriendProfileScreen({
  navigation,
  route,
}: RootStackScreenProps<'FriendProfile'>) {
  const insets = useSafeAreaInsets();
  const { userId, username } = route.params ?? { userId: null, username: friendProfile.username };
  const displayUsername = username ?? friendProfile.username;
  // 본인 프로필로 들어온 경우(상세화면에서 내 글 작성자 탭) — 팔로우 버튼 숨김, 내 정보 폴백
  const { nickname: myNick, handle: myHandle, profilePhoto: myPhoto, bio: myBio } = useSettings();
  const isSelf = !!myHandle && route.params?.handle === myHandle;
  const { records: myRecords } = useRecords();

  // 실제 사용자 프로필 + 공개 글을 백엔드에서 로드 (미설정/없음이면 빈 상태)
  const [profileRow, setProfileRow] = useState<ProfileRow | null>(null);
  const [userPosts, setUserPosts] = useState<TravelRecord[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;
    let alive = true;
    (async () => {
      const [p, posts, fc] = await Promise.all([
        getProfileById(userId),
        fetchUserPosts(userId),
        fetchFollowerCount(userId),
      ]);
      if (!alive) return;
      setProfileRow(p);
      setUserPosts(posts);
      setFollowerCount(fc);
    })();
    return () => { alive = false; };
  }, [userId]);

  // 본인이면 로컬 기록, 타인이면 백엔드 공개 글을 사용
  const sourcePosts = isSelf ? myRecords : userPosts;
  // 공개 글로 배지 계산 (내 프로필과 동일한 배지 하이라이트 표시)
  const friendBadges = useMemo(() => {
    const earned = computeEarnedBadgeIds(sourcePosts, BADGES);
    return BADGES.filter((b) => earned.has(b.id)).slice(0, 8);
  }, [sourcePosts]);

  // 화면 표시값 (본인=로컬/설정, 타인=백엔드)
  const display = {
    name: isSelf ? (myNick || displayUsername) : (profileRow?.nickname || profileRow?.handle || displayUsername),
    emoji: profileRow?.emoji || '🧳',
    photo: isSelf ? (myPhoto || null) : (profileRow?.profile_photo || null),
    bio: isSelf ? (myBio || '') : (profileRow?.bio || ''),
    recordCount: sourcePosts.length,
    followers: followerCount,
    visitedCountries: new Set(sourcePosts.map((p) => p.countryName).filter(Boolean)).size,
    trips: sourcePosts.map((p) => ({
      id: p.id,
      emoji: p.countryFlag || '🌍',
      countryFlag: p.countryFlag || '',
      title: p.countryName || (p.content ? p.content.slice(0, 16) : '여행'),
      date: p.date || '',
      coverUri: p.representativePhoto || p.medias?.[0],
      records: [{ id: p.id, viewType: p.viewType || 'feed' }],
    })),
  };

  // 팔로우·차단은 store 공유 상태 — 팔로잉 목록/프로필 카운트와 동기화된다
  const { followingUsers, followUser, unfollowUser, setFollowMutual, blockUser, toggleMute, isMuted } = useRecords();
  // 신원은 id 우선 — 핸들이 빈 유저끼리 충돌 방지
  const followId = userId ?? profileRow?.id ?? displayUsername;
  const followEntry = followingUsers.find((f) => f.id === followId || (!!f.username && f.username === displayUsername));
  const following = !!followEntry;
  const isMutual = !!followEntry?.isMutual;
  const toggleFollow = () => {
    if (following) {
      unfollowUser(followEntry?.id ?? followId);
    } else {
      followUser({
        id: followId,
        username: displayUsername,
        isAbroad: false,
        currentCountry: null,
        currentCountryFlag: null,
      });
    }
  };
  const [menuVisible, setMenuVisible] = useState(false);
  // 음소거는 store(mutedHandles)에 영속 — handle 기준(차단과 동일 신원 키)
  const muteKey = profileRow?.handle ?? route.params?.handle ?? displayUsername;
  const notifMuted = isMuted(muteKey);
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
      toggleMute(muteKey);
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
              toggleMute(muteKey);
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
          blockUser({ name: display.name, emoji: '👤', handle: profileRow?.handle ?? route.params?.handle });
          unfollowUser(followEntry?.id ?? followId); // 차단하면 팔로잉에서도 제거
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
        <TouchableOpacity style={s.headerBtn} onPress={() => navigation.goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="뒤로 가기">
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
        {/* ── 프로필 헤더 (아바타 + 정보) — 내 프로필과 동일 ── */}
        <View style={pv.profileRow}>
          <ProfileAvatar photo={display.photo} initial={displayUsername[0] ?? '?'} />
          <View style={pv.profileInfo}>
            <Text style={pv.userName}>{display.name}</Text>
            <Text style={pv.userHandle}>@{displayUsername}</Text>
            {!!display.bio && <Text style={pv.userBio}>{display.bio}</Text>}
            <View style={pv.statsRow}>
              <StatCard value={String(display.recordCount)} label="기록 수" />
              <StatCard value={String(display.followers)} label="팔로워" />
              <StatCard value={String(display.visitedCountries)} label="방문국가" />
            </View>
          </View>
        </View>

        {/* ── 팔로우 버튼 (본인 프로필이면 숨김) ── */}
        {!isSelf && (
          <>
            <TouchableOpacity
              style={[s.followBtn, following && s.followingBtn]}
              onPress={toggleFollow}
              activeOpacity={0.85}
            >
              <Text style={[s.followBtnText, following && s.followingBtnText]}>
                {following ? '팔로잉 ✓' : '팔로우'}
              </Text>
            </TouchableOpacity>

            {/* ── 맞팔 토글 (팔로잉 중일 때만) — 친구 수 배지(78·81·82·83) 판정용 ── */}
            {following && (
              <TouchableOpacity
                style={[s.mutualBtn, isMutual && s.mutualBtnOn]}
                onPress={() => setFollowMutual(followEntry?.id ?? followId, !isMutual)}
                activeOpacity={0.85}
              >
                <Text style={[s.mutualBtnText, isMutual && s.mutualBtnTextOn]}>
                  {isMutual ? '🤝 맞팔 중' : '맞팔로 표시'}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ── 배지 하이라이트 (친구 공개 글로 계산) — 내 프로필과 동일 ── */}
        {friendBadges.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={pv.badgeScroll}
            contentContainerStyle={pv.badgeScrollContent}
          >
            {friendBadges.map((badge) => (
              <BadgeHighlightItem key={badge.id} emoji={badge.emoji} name={badge.name} glow={badge.glow} earned />
            ))}
          </ScrollView>
        )}

        <View style={pv.divider} />

        {/* ── 여행 기록 — 내 프로필과 동일한 카드 ── */}
        <View style={pv.gridHeaderRow}>
          <Text style={pv.gridHeaderTitle}>여행 기록</Text>
          <Text style={pv.tripCount}>{display.trips.length}개의 여행</Text>
        </View>

        {display.trips.length === 0 ? (
          <Text style={{ color: '#A1A1B0', fontSize: 13, textAlign: 'center', paddingVertical: 28 }}>
            아직 공개된 여행 기록이 없어요
          </Text>
        ) : (
          <>
            {/* 메인 카드 (첫 여행) */}
            <TripCard
              trip={display.trips[0]}
              main
              onPress={() => navigation.navigate('PostDetail', { postId: display.trips[0].id })}
            />
            {/* 나머지 2열 그리드 */}
            <View style={pv.tripGrid}>
              {display.trips.slice(1).map((trip) => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  onPress={() => navigation.navigate('PostDetail', { postId: trip.id })}
                />
              ))}
            </View>
          </>
        )}

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
  avatarImg: { width: 80, height: 80, borderRadius: 40 },
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
  mutualBtn: {
    height: 38, borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  mutualBtnOn: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  mutualBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.accent },
  mutualBtnTextOn: { color: COLORS.white },

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
