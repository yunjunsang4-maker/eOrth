import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { handleBlock as confirmBlock } from '../utils/reportAndBlock';
import { useRecords } from '../store/recordStore';
import { useSettings } from '../store/settingsStore';
import ReportModal from '../components/ReportModal';
import Toast from '../components/Toast';
import { isSupabaseConfigured } from '../services/supabase';
import { getProfileById, type ProfileRow } from '../services/profile';
import { fetchUserPosts } from '../services/posts';
import { fetchFollowerCount, fetchFollowingCount } from '../services/social';
import { computeEarnedBadgeIds } from '../utils/badgeRules';
import { BADGES } from '../constants/badges';
import { ProfileAvatar, StatCard, BadgeHighlightItem, TripCard, pv } from '../components/profile/ProfileVisuals';
import StarFieldBackground from '../components/StarFieldBackground';
import ProfileScreen from './ProfileScreen';
import { useSkinAccent } from '../constants/skinTheme';
import { handleFontStyle } from '../constants/handleFonts';
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


// 라우트 파라미터 누락 시 username 기본값으로만 사용 (실제 데이터는 백엔드에서 로드)
const friendProfile = { username: '' };

// ─── 메인 화면 ───
export default function FriendProfileScreen({
  navigation,
  route,
}: RootStackScreenProps<'FriendProfile'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { userId, username } = route.params ?? { userId: null, username: friendProfile.username };
  const displayUsername = username ?? friendProfile.username;
  // 본인 프로필로 들어온 경우(상세화면에서 내 글 작성자 탭) — 팔로우 버튼 숨김, 내 정보 폴백
  const { handle: myHandle, profilePhoto: myPhoto, bio: myBio } = useSettings();
  const skinAccent = useSkinAccent(); // 팔로우·맞팔·핸들 강조를 스킨색으로
  const isSelf = !!myHandle && route.params?.handle === myHandle;
  const { records: myRecords } = useRecords();

  // 실제 사용자 프로필 + 공개 글을 백엔드에서 로드 (미설정/없음이면 빈 상태)
  const [profileRow, setProfileRow] = useState<ProfileRow | null>(null);
  const [userPosts, setUserPosts] = useState<TravelRecord[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;
    let alive = true;
    (async () => {
      const [p, posts, fc, fgc] = await Promise.all([
        getProfileById(userId),
        fetchUserPosts(userId),
        fetchFollowerCount(userId),
        fetchFollowingCount(userId),
      ]);
      if (!alive) return;
      setProfileRow(p);
      setUserPosts(posts);
      setFollowerCount(fc);
      setFollowingCount(fgc);
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

  // 이름 아래 위치 — 내 프로필과 동일한 위치 줄. 타인은 거주국(country)이 public_profiles 뷰에서
  // 제외되므로, 최근 공개 글(created_at desc)의 국가를 현재 위치로 표시한다.
  const friendLocation = useMemo(() => {
    const recent = sourcePosts.find((p) => p.countryName);
    return recent?.countryName ? `${recent.countryFlag || '📍'} ${recent.countryName}` : '';
  }, [sourcePosts]);

  // 화면 표시값 (본인=로컬/설정, 타인=백엔드)
  const display = {
    name: isSelf ? (myHandle || displayUsername) : (profileRow?.handle || displayUsername),
    emoji: profileRow?.emoji || '🧳',
    photo: isSelf ? (myPhoto || null) : (profileRow?.profile_photo || null),
    bio: isSelf ? (myBio || '') : (profileRow?.bio || ''),
    recordCount: sourcePosts.length,
    followers: followerCount,
    visitedCountries: new Set(sourcePosts.map((p) => p.countryName).filter(Boolean)).size,
    trips: sourcePosts.flatMap((p) => {
      // 다국가 분할 기록: 게시물은 하나지만 카드는 국가별로 나눠 그린다
      // (id는 카드 key용 합성값 — 게시물 이동은 records[0].id 사용)
      // perCountryData는 피드 기록에만 있음(블로그·컷은 없음) — 없으면 기록 공통 값으로 폴백
      if (p.splitByCountry && p.countries && p.countries.length > 1) {
        return p.countries.map((c) => {
          const d = p.perCountryData?.[c.name];
          return {
            id: `${p.id}::${c.name}`,
            emoji: c.flag || '🌍',
            countryFlag: c.flag || '',
            title: c.name,
            date: d?.startDate || p.date || '',
            coverUri: d?.representativePhoto || d?.medias?.[0] || p.representativePhoto,
            records: [{ id: p.id, viewType: p.viewType || 'feed' }],
          };
        });
      }
      return [{
        id: p.id,
        emoji: p.countryFlag || '🌍',
        countryFlag: p.countryFlag || '',
        title: p.countryName || (p.content ? p.content.slice(0, 16) : t('friends.travelDefault')),
        date: p.date || '',
        coverUri: p.representativePhoto || p.medias?.[0],
        records: [{ id: p.id, viewType: p.viewType || 'feed' }],
      }];
    }),
  };

  // 아이디 표시 폰트(프리미엄) — 본인이면 내 설정값(구독 중일 때만), 타인이면 프로필의 handle_font
  const { handleFont: myHandleFont, isPremium: myPremium } = useSettings();
  const nameFontStyle = handleFontStyle(isSelf ? (myPremium ? myHandleFont : null) : profileRow?.handle_font);

  // 팔로우·차단은 store 공유 상태 — 팔로잉 목록/프로필 카운트와 동기화된다
  const { followingUsers, followUser, unfollowUser, setFollowMutual, blockUser, toggleMute, isMuted, requestFollow, cancelFollowRequest, isFollowRequested } = useRecords();
  // 신원은 id 우선 — 핸들이 빈 유저끼리 충돌 방지
  // realId는 profile uuid일 때만 — 핸들을 id로 넘기면 서버 follows insert(uuid 컬럼)가 실패한다
  const realId = userId ?? profileRow?.id ?? null;
  const followId = realId ?? displayUsername;
  const followEntry = followingUsers.find((f) => f.id === followId || (!!f.username && f.username === displayUsername));
  const following = !!followEntry;
  const isMutual = !!followEntry?.isMutual;
  // 비공개 계정 — 팔로우 대신 요청 흐름, 팔로워가 아니면 기록·배지 잠금
  const isPrivate = !!profileRow?.is_private;
  const requested = !!realId && isFollowRequested(realId);
  const privateLocked = isPrivate && !following && !isSelf;
  const toggleFollow = () => {
    if (following) {
      // 빈 id('')로 찾으면 id가 빈 다른 항목과 오매칭될 수 있어 || 로 username 폴백
      unfollowUser(followEntry?.id || followId);
    } else if (isPrivate && realId) {
      // 비공개 계정: 요청 보내기 ↔ 요청 취소 토글
      if (requested) cancelFollowRequest(realId);
      else requestFollow(realId);
    } else {
      followUser({
        id: realId ?? '', // uuid 없으면 빈 값 → 로컬 전용(서버 동기화 생략), 매칭은 username으로
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
    showToast(t('social.linkCopiedToast'));
  };

  const handleShare = () => {
    setMenuVisible(false);
    Share.share({
      message: t('comp2.shareProfileMsg', { username: displayUsername }),
      title: t('comp2.shareProfileTitle'),
    });
  };

  const handleToggleNotif = () => {
    setMenuVisible(false);
    if (notifMuted) {
      toggleMute(muteKey);
      showToast(t('friends.notifOnToast'));
    } else {
      Alert.alert(
        t('friends.muteTitle'),
        t('friends.muteMsg'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('friends.mute'),
            onPress: () => {
              toggleMute(muteKey);
              showToast(t('friends.notifOffToast'));
            },
          },
        ]
      );
    }
  };

  const MENU_NORMAL = [
    { icon: '🔗', label: t('friends.copyProfileLink'), onPress: handleCopyLink },
    { icon: '📤', label: t('friends.share'),          onPress: handleShare },
    {
      icon:    notifMuted ? '🔔' : '🔕',
      label:   notifMuted ? t('friends.notifOn') : t('friends.notifOff'),
      onPress: handleToggleNotif,
    },
  ];

  const MENU_DANGER = [
    {
      icon: '⛔',
      label: t('friends.blockAction'),
      onPress: () => {
        setMenuVisible(false);
        confirmBlock(displayUsername, () => {
          // 언팔로우는 store의 blockUser가 함께 처리한다 (화면별 불일치 방지)
          blockUser({ name: display.name, emoji: '👤', handle: profileRow?.handle ?? route.params?.handle, id: realId ?? undefined });
          showToast(t('social.blockedToast'));
          setTimeout(() => navigation.goBack(), 600);
        }, t);
      },
    },
    { icon: '🚨', label: t('friends.reportLong'), onPress: () => { setMenuVisible(false); setReportVisible(true); } },
  ];

  // 내 프로필(내 게시물의 아이디 탭)이면 실제 프로필 탭 컴포넌트를 그대로 렌더한다 —
  // 룩앤필을 흉내 내지 않고 같은 컴포넌트를 써서 화면·기능이 프로필 탭과 100% 동일하다.
  // 스택 라우트로 푸시되므로 뒤로가기로 원래 화면(소셜)으로 돌아온다.
  if (isSelf) return <ProfileScreen navigation={navigation as any} route={route as any} pushed onBack={() => navigation.goBack()} />;

  return (
    <View style={s.container}>
      {/* 별 배경 (Stars.svg) — 프로필 탭과 동일하게 콘텐츠 뒤에 깔린다 */}
      <StarFieldBackground />

      {/* ── 헤더 ── */}
      <View style={[s.header, { marginTop: insets.top + 12 }]}>
        <TouchableOpacity style={s.headerBtn} onPress={() => navigation.goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('friends.back')}>
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>@{displayUsername}</Text>
        <TouchableOpacity style={s.headerBtn} onPress={() => setMenuVisible((v) => !v)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('friends.more')}>
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
            {/* 닉네임 폐지 — 아이디(handle)만 표시. 프로필 탭과 동일하게 이름 한 줄 */}
            <Text style={[pv.userName, nameFontStyle]}>{display.name}</Text>
            {/* 이름 아래 위치 줄 — 내 프로필과 동일 */}
            {!!friendLocation && <Text style={pv.userLocation}>{friendLocation}</Text>}
            {/* 소개(bio) — 위치와 통계 사이. 한 줄로 제한하고 넘치면 …처리. 없으면 여백 0 */}
            {!!display.bio && <Text style={pv.userBio} numberOfLines={1} ellipsizeMode="tail">{display.bio}</Text>}
            {/* 통계 — 프로필 탭과 동일한 3개(여행수·팔로잉·팔로워). 비공개 계정도 수치는 공개(콘텐츠만 잠금) */}
            <View style={pv.statsRow}>
              <StatCard value={String(display.trips.length)} label={t('profile.tripCount')} />
              <StatCard value={String(isSelf ? followingUsers.length : followingCount)} label={t('profile.following')} />
              <StatCard value={String(display.followers)} label={t('friends.followers')} />
            </View>
          </View>
        </View>

        {/* ── 팔로우 버튼 (본인 프로필이면 숨김) ── */}
        {!isSelf && (
          <>
            <TouchableOpacity
              style={[s.followBtn, !(following || requested) && { backgroundColor: skinAccent.accentDeep }, (following || requested) && s.followingBtn]}
              onPress={toggleFollow}
              activeOpacity={0.85}
            >
              <Text style={[s.followBtnText, (following || requested) && [s.followingBtnText, { color: skinAccent.accent }]]}>
                {following
                  ? t('friends.followingCheck')
                  : requested
                    ? t('friends.requested')
                    : t('friends.follow')}
              </Text>
            </TouchableOpacity>

            {/* ── 맞팔 표시 — 친구 수 배지(78·81·82·83) 판정용 ──
                백엔드 사용 시 서버(follows 양방향)가 판정하므로 읽기 전용 배지,
                미설정(로컬 데모) 모드에서만 수동 토글 허용 (refreshFollowing이 서버 값으로 덮어쓰므로 토글이 유지되지 않음) */}
            {following && isSupabaseConfigured && isMutual && (
              <View style={[s.mutualBtn, { borderColor: skinAccent.accent }, s.mutualBtnOn, { backgroundColor: skinAccent.accent }]}>
                <Text style={[s.mutualBtnText, s.mutualBtnTextOn]}>{t('friends.mutualYes')}</Text>
              </View>
            )}
            {following && !isSupabaseConfigured && (
              <TouchableOpacity
                style={[s.mutualBtn, { borderColor: skinAccent.accent }, isMutual && [s.mutualBtnOn, { backgroundColor: skinAccent.accent }]]}
                onPress={() => setFollowMutual(followEntry?.id || followId, !isMutual)}
                activeOpacity={0.85}
              >
                <Text style={[s.mutualBtnText, { color: skinAccent.accent }, isMutual && s.mutualBtnTextOn]}>
                  {isMutual ? t('friends.mutualYes') : t('friends.mutualMark')}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {privateLocked ? (
          /* ── 비공개 계정 잠금 — 팔로워가 아니면 배지·기록을 숨기고 안내만 표시 ── */
          <>
            <View style={pv.divider} />
            <View style={s.privateBox}>
              <Text style={s.privateEmoji}>🔒</Text>
              <Text style={s.privateTitle}>{t('friends.privateTitle')}</Text>
              <Text style={s.privateDesc}>{t('friends.privateDesc')}</Text>
            </View>
          </>
        ) : (
          <>
            {/* ── Travel badge — 프로필 탭과 동일한 섹션 헤더 + 구이 서클 배지 ── */}
            {friendBadges.length > 0 && (
              <>
                <View style={s.divider} />
                <View style={s.sectionHeaderRow}>
                  <Text style={s.sectionTitle}>Travel badge</Text>
                </View>
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
              </>
            )}

            <View style={s.divider} />

            {/* ── Travel archive — 프로필 탭과 동일한 헤더·부제 + 여행 카드 ── */}
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitle}>Travel archive</Text>
            </View>
            <Text style={s.archiveSubtitle}>{t('friends.tripCountN', { count: display.trips.length })}</Text>

            {display.trips.length === 0 ? (
              <Text style={{ color: '#A1A1B0', fontSize: 13, textAlign: 'center', paddingVertical: 28 }}>
                {t('friends.noPublicTrips')}
              </Text>
            ) : (
              <>
                {/* 메인 카드 (첫 여행) — 분할 카드는 id가 합성값이라 게시물 이동은 records[0].id */}
                <TripCard
                  trip={display.trips[0]}
                  main
                  onPress={() => navigation.navigate('PostDetail', { postId: display.trips[0].records[0].id })}
                />
                {/* 나머지 2열 그리드 */}
                <View style={pv.tripGrid}>
                  {display.trips.slice(1).map((trip) => (
                    <TripCard
                      key={trip.id}
                      trip={trip}
                      onPress={() => navigation.navigate('PostDetail', { postId: trip.records[0].id })}
                    />
                  ))}
                </View>
              </>
            )}
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
          showToast(t('social.reportReceivedToast'));
        }}
      />

      <Toast visible={toastVisible} message={toastMsg} />
    </View>
  );
}

// ─── 배지 하이라이트 스타일 ───
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

  // ── 여행 중 배너 ──

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

  // ── 비공개 계정 잠금 안내 ──
  privateBox: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
  },
  privateEmoji: { fontSize: 36, marginBottom: 12 },
  privateTitle: { fontSize: 16, fontWeight: '700', color: COLORS.white, marginBottom: 6 },
  privateDesc: { fontSize: 13, color: '#A1A1B0', textAlign: 'center', lineHeight: 19 },

  // ── 구분선 ──
  divider: {
    height: 1, backgroundColor: COLORS.divider,
    marginHorizontal: -16, marginTop: 16, marginBottom: 16,
  },

  // ── 여행 기록 헤더 ──

  // ── 섹션 헤더 (프로필 탭 Travel badge / Travel archive와 동일) ──
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 23, fontFamily: 'Inter_800ExtraBold', color: COLORS.white },
  archiveSubtitle: { fontSize: 12, fontWeight: '600', color: '#AA54C1', marginTop: -4, marginBottom: 16 },

  // ── 여행 썸네일 2열 그리드 ──

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
