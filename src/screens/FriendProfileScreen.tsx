import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import AppRefreshControl from '../components/AppRefreshControl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { handleBlock as confirmBlock } from '../utils/reportAndBlock';
import { countryLabel } from '../utils/countryLabel';
import { LinkIcon, ShareIcon, BellIcon, BellOffIcon, BlockIcon, MegaphoneIcon, GlobeIcon } from '../components/icons';
import { useRecords } from '../store/recordStore';
import { useSettings } from '../store/settingsStore';
import ReportModal from '../components/ReportModal';
import Toast from '../components/Toast';
import { isSupabaseConfigured } from '../services/supabase';
import { getProfileById, type ProfileRow } from '../services/profile';
import { labelFromKey } from '../utils/travelDnaScore';
import { fetchUserPosts } from '../services/posts';
import { fetchNeighborCount, fetchPostCount, fetchOverlapWith, reportPostToServer } from '../services/social';
import GlobeLockIcon from '../components/GlobeLockIcon';
import { applyViewer, isPostHiddenForViewer } from '../utils/mediaPrivacy';
import { computeEarnedBadgeIds } from '../utils/badgeRules';
import { BADGES } from '../constants/badges';
import { badgeName } from '../utils/badgeText';
import { ProfileAvatar, StatCard, BadgeHighlightItem, TripCard, pv } from '../components/profile/ProfileVisuals';
import StarFieldBackground from '../components/StarFieldBackground';
import ProfileScreen from './ProfileScreen';
import { useSkinAccent } from '../constants/skinTheme';
import { handleFontStyle } from '../constants/handleFonts';
import { countryInfoFromCode } from '../utils/pastTripScan';
import { COUNTRIES } from '../constants/countries';
import { profileLink } from '../utils/appLinks';
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
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { userId, username } = route.params ?? { userId: null, username: friendProfile.username };
  const displayUsername = username ?? friendProfile.username;
  // 본인 프로필로 들어온 경우(상세화면에서 내 글 작성자 탭) — 팔로우 버튼 숨김, 내 정보 폴백
  const { handle: myHandle, profilePhoto: myPhoto, bio: myBio, homeCountryCode: myHomeCountryCode } = useSettings();
  const skinAccent = useSkinAccent(); // 팔로우·맞팔·핸들 강조를 스킨색으로
  const { records: myRecords, tripGroups } = useRecords();

  // 실제 사용자 프로필 + 공개 글을 백엔드에서 로드 (미설정/없음이면 빈 상태)
  const [profileRow, setProfileRow] = useState<ProfileRow | null>(null);
  // handle 파라미터 없이 진입해도(댓글·알림 등 userId만 전달) 프로필 로드 후 본인 판정이 되도록
  // profileRow.handle을 병행 확인 — 안 하면 내 프로필에 메이트신청 버튼·차단 메뉴가 뜬다
  const isSelf = !!myHandle && (route.params?.handle === myHandle || profileRow?.handle === myHandle);
  const [userPosts, setUserPosts] = useState<TravelRecord[]>([]);
  const [neighborCount, setNeighborCount] = useState(0);
  // 여행수(기록 수) — 서버 동기화값. 비메이트은 RLS로 글이 안 와도 이 값으로 실제 개수를 보여준다.
  const [postCount, setPostCount] = useState<number | null>(null);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);
  // 프로필 로딩 완료 여부 — 완료 전엔 콘텐츠를 그리지 않는다(로딩 깜빡임 방지)
  const [profileLoaded, setProfileLoaded] = useState(!isSupabaseConfigured || !userId);
  const loadProfile = useCallback(async () => {
    if (!isSupabaseConfigured || !userId) return;
    const [p, posts, nc, pc] = await Promise.all([
      getProfileById(userId),
      fetchUserPosts(userId),
      fetchNeighborCount(userId),
      fetchPostCount(userId),
    ]);
    if (!aliveRef.current) return;
    setProfileRow(p);
    setUserPosts(posts);
    if (nc !== null) setNeighborCount(nc); // 오류(null)면 이전 값 유지 — 0 깜빡임 방지
    if (pc !== null) setPostCount(pc);     // 여행수 서버 동기화값(오류면 로컬 폴백)
    setProfileLoaded(true);
  }, [userId]);
  useEffect(() => { loadProfile(); }, [loadProfile]);
  // 진입 시 메이트·대기 신청을 서버 기준으로 동기화 — 상대가 내 신청을 수락했는데
  // '신청됨' 버튼이 잔존하거나, 알림에서 넘어왔을 때 메이트 상태가 낡아 있는 문제 방지
  const { refreshNeighbors } = useRecords();
  useEffect(() => { refreshNeighbors(); }, [refreshNeighbors]);

  // 당겨서 새로고침 — 프로필·글·메이트 수 재조회
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await loadProfile(); } finally { if (aliveRef.current) setRefreshing(false); }
  }, [loadProfile]);

  // 본인이면 로컬 기록, 타인이면 백엔드 공개 글을 사용.
  // 타인 글은 '나'를 뷰어로 사진 비공개(mediaPrivacy)를 적용해야 한다 — 서버 data에는
  // 전체 사진이 그대로 내려오므로 여기서 안 거르면 작성자가 나에게 숨긴 사진이 보인다.
  const sourcePosts = useMemo(() => {
    if (isSelf) return myRecords;
    const viewer = myHandle || null;
    return userPosts
      .filter((p) => !isPostHiddenForViewer(p, viewer))
      .map((p) => applyViewer(p, viewer));
  }, [isSelf, myRecords, userPosts, myHandle]);
  // 공개 글로 배지 계산 (내 프로필과 동일한 배지 하이라이트 표시).
  // fetchUserPosts는 타인 글을 isMyPost=false로 매핑하는데, computeTravelStats가
  // isMyPost !== false만 집계해(내 통계에 남 글 섞임 방지) 그대로 넘기면 전부 걸러져
  // 배지가 0개가 된다 — 이 화면에선 그분의 글이 곧 본인 기록이므로 되살려서 넘긴다.
  const friendBadges = useMemo(() => {
    const asOwn = isSelf ? sourcePosts : sourcePosts.map((p) => ({ ...p, isMyPost: true }));
    // 거주국 제외 옵션 — 본인은 내 거주국 코드, 타인은 profileRow.country(맞팔 시 서버 제공)
    const homeCode = isSelf ? myHomeCountryCode : (profileRow?.country ?? undefined);
    const homeCountryName = homeCode
      ? countryInfoFromCode(homeCode.toUpperCase()).countryName
      : undefined;
    const earned = computeEarnedBadgeIds(asOwn, BADGES, { homeCountryName });
    return BADGES.filter((b) => earned.has(b.id)).slice(0, 8);
  }, [sourcePosts, isSelf, myHomeCountryCode, profileRow?.country]);

  // 이름 아래 위치 — 내 프로필과 동일한 위치 줄.
  // 거주국(country)은 맞팔일 때만 public_profiles 뷰가 내려준다(그 외 null) — 오면 우선 표시,
  // 없으면 최근 공개 글(created_at desc)의 국가로 폴백.
  const friendLocation = useMemo(() => {
    // 체류 중(메이트 조건부 노출) — 거주국 표시보다 우선
    if (profileRow?.stay_status === 'active' && profileRow?.stay_country) {
      const info = countryInfoFromCode(profileRow.stay_country.toUpperCase());
      return t('stay.stayingIn', { flag: info.countryFlag, name: info.countryName });
    }
    if (profileRow?.country) {
      const info = countryInfoFromCode(profileRow.country.toUpperCase());
      return `${info.countryFlag} ${info.countryName}`;
    }
    const recent = sourcePosts.find((p) => p.countryName);
    return recent?.countryName ? `${recent.countryFlag || '📍'} ${countryLabel(recent.countryName ?? '', i18n.language)}` : '';
  }, [sourcePosts, profileRow?.stay_status, profileRow?.stay_country, profileRow?.country, t, i18n.language]);

  // 화면 표시값 (본인=로컬/설정, 타인=백엔드)
  const display = {
    name: isSelf ? (myHandle || displayUsername) : (profileRow?.handle || displayUsername),
    emoji: profileRow?.emoji || '🧳',
    photo: isSelf ? (myPhoto || null) : (profileRow?.profile_photo || null),
    bio: isSelf ? (myBio || '') : (profileRow?.bio || ''),
    recordCount: sourcePosts.length,
    neighbors: neighborCount,
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

  // 여행 카드 탭 → 내 프로필과 동일한 여행 상세(TripDetail)로 이동.
  // 타인 기록은 로컬 스토어에 없으므로 이 여행에 속한 게시물(서버 조회본)을 guestRecords로
  // 함께 넘긴다 → TripDetail이 읽기 전용 게스트 모드로 렌더 (기록 탭 시 PostDetail).
  const openGuestTripDetail = (trip: (typeof display.trips)[number]) => {
    const ids = new Set(trip.records.map((r) => r.id));
    navigation.navigate('TripDetail', {
      trip: {
        id: trip.id,
        emoji: trip.emoji,
        title: trip.title,
        country: trip.title, // 게스트 모드에선 표시용으로만 쓰임 (기록 매칭은 guestRecords가 대신)
        countryFlag: trip.countryFlag,
        date: trip.date,
        // 내 프로필·메인과 동일한 기본 그라데이션 키 — 실제 색이 아니라 키 문자열이라
        // 히어로 상단에 별도 색 밴드가 생기지 않는다 (ProfileScreen mappedThumbnails와 동일)
        color: 'trip-japan',
        records: trip.records.map((r) => ({ id: r.id, viewType: r.viewType })),
      },
      guestRecords: sourcePosts.filter((p) => ids.has(p.id)),
    });
  };

  // 아이디 표시 폰트(프리미엄) — 본인이면 내 설정값(구독 중일 때만), 타인이면 프로필의 handle_font
  const { handleFont: myHandleFont, isPremium: myPremium } = useSettings();
  const nameFontStyle = handleFontStyle(isSelf ? (myPremium ? myHandleFont : null) : profileRow?.handle_font);

  // 상대의 여행 DNA 유형 — public_profiles 뷰의 dna_type_key만 공개(축 점수는 비공개, 설계 §9).
  // 미완료·해석 불가면 labelFromKey가 null을 주고, 그때는 칩 자체를 렌더하지 않는다(빈 상태는 본인 전용).
  const friendDnaLabel = labelFromKey(profileRow?.dna_type_key);

  // 메이트·차단은 store 공유 상태 — 메이트 목록/프로필 카운트와 동기화된다
  const { neighbors, requestNeighbor, cancelNeighborRequest, removeNeighbor, isNeighbor, isNeighborRequested, blockUser, toggleMute, isMuted } = useRecords();
  // 신원은 id 우선 — 핸들이 빈 유저끼리 충돌 방지
  // realId는 profile uuid일 때만 — 핸들을 id로 넘기면 서버 neighbors insert(uuid 컬럼)가 실패한다
  const realId = userId ?? profileRow?.id ?? null;
  const neighborNow = !!realId && isNeighbor(realId);
  const requested = !!realId && isNeighborRequested(realId);
  const neighborState: 'none' | 'requested' | 'neighbor' =
    neighborNow ? 'neighbor' : requested ? 'requested' : 'none';
  // 비메이트 잠금 — 여행기록은 메이트 전용. 카운트만 노출하고 아카이브는 잠금 안내로 대체.
  const locked = !isSelf && !neighborNow;
  // 여행수 스탯 — 타인은 서버 동기화값 우선(비메이트도 실제 개수), 본인은 로컬 전체(나만보기 포함) 유지
  const tripStatValue = isSelf ? display.trips.length : (postCount ?? display.trips.length);
  // 나와 겹치는 나라(여행 DNA 맥락 진입점) — 로컬 여행기록카드·미발행·나만보기 나라도 반영
  const [overlap, setOverlap] = useState<{ sharedCount: number; sampleCountries: string[] } | null>(null);
  useEffect(() => {
    if (isSelf || !realId || !isSupabaseConfigured) return;
    let alive = true;
    (async () => {
      const localCountries = Array.from(new Set([
        ...myRecords.filter((r) => r.isMyPost !== false && r.countryName).map((r) => r.countryName as string),
        ...tripGroups.map((g) => g.countryName).filter((c): c is string => !!c),
      ]));
      const res = await fetchOverlapWith(realId, localCountries);
      if (alive && res) setOverlap(res);
    })();
    return () => { alive = false; };
    // myRecords/tripGroups는 진입 시점 스냅샷이면 충분 — 의존성에 넣으면 로컬 기록 갱신마다 RPC 재호출
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelf, realId]);
  const onNeighborPress = () => {
    if (!realId) return;
    if (neighborState === 'none') requestNeighbor(realId);
    else if (neighborState === 'requested') cancelNeighborRequest(realId);
    else Alert.alert(t('friends.removeNeighborTitle'), t('friends.removeNeighborMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('friends.removeNeighbor'), style: 'destructive', onPress: () => removeNeighbor(realId) },
    ]);
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
  // 링크에는 표시 이름이 아니라 실제 핸들을 넣어야 받은 쪽에서 조회가 된다
  // (username 파라미터는 화면에 따라 표시 이름이 넘어올 수 있음 → profileRow 우선)
  const linkHandle = isSelf ? myHandle : (profileRow?.handle || route.params?.handle || displayUsername);
  const handleCopyLink = async () => {
    setMenuVisible(false);
    await Clipboard.setStringAsync(profileLink(linkHandle));
    showToast(t('social.linkCopiedToast'));
  };

  const handleShare = () => {
    setMenuVisible(false);
    Share.share({
      // 링크는 로케일이 아니라 appLinks.profileLink가 만든다(인코딩·스킴 규칙 단일화)
      message: t('comp2.shareProfileMsg', { username: linkHandle, link: profileLink(linkHandle) }),
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

  // 메뉴 아이콘 — 기본 이모지 대신 앱 아이콘 세트를 쓴다(게시물 메뉴 PostDetailScreen과 동일 규약:
  // size 16, 일반 항목은 흰색 / 위험 항목은 빨강)
  const MENU_ICON = 16;
  const MENU_NORMAL = [
    { key: 'link',  icon: <LinkIcon size={MENU_ICON} color={COLORS.white} />,  label: t('friends.copyProfileLink'), onPress: handleCopyLink },
    { key: 'share', icon: <ShareIcon size={MENU_ICON} color={COLORS.white} />, label: t('friends.share'),           onPress: handleShare },
    {
      key:   'notif',
      // 음소거 상태면 '알림 켜기'(종) / 아니면 '알림 끄기'(사선 종) — 누르면 될 결과를 보여준다
      icon:  notifMuted
        ? <BellIcon size={MENU_ICON} color={COLORS.white} />
        : <BellOffIcon size={MENU_ICON} color={COLORS.white} slashBg={COLORS.menuBg} />,
      label:   notifMuted ? t('friends.notifOn') : t('friends.notifOff'),
      onPress: handleToggleNotif,
    },
  ];

  const MENU_DANGER = [
    {
      key: 'block',
      icon: <BlockIcon size={MENU_ICON} color={COLORS.red} />,
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
    { key: 'report', icon: <MegaphoneIcon size={MENU_ICON} color={COLORS.red} />, label: t('friends.reportLong'), onPress: () => { setMenuVisible(false); setReportVisible(true); } },
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
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* ── 프로필 헤더 (아바타 + 정보) — 내 프로필과 동일 ── */}
        <View style={pv.profileRow}>
          <ProfileAvatar photo={display.photo} />
          <View style={pv.profileInfo}>
            {/* 닉네임 폐지 — 아이디(handle)만 표시. 프로필 탭과 동일하게 이름 한 줄 */}
            <Text style={[pv.userName, nameFontStyle]}>{display.name}</Text>
            {/* 이름 아래 위치 줄 + 여행 DNA 칩 — 내 프로필과 동일한 배치(거주국 오른쪽에 칩).
                여행 DNA는 상대가 유형을 갖고 있을 때만 그린다(탭 불가 — 본인 결과가 아니다).
                없으면 아무것도 렌더하지 않는다 — 빈 상태 유도는 본인 프로필에서만 의미가 있다. */}
            {(!!friendLocation || !!friendDnaLabel) && (
              <View style={s.identityRow}>
                {!!friendLocation && (
                  // 국가명이 길면 이쪽이 먼저 줄어들어 오른쪽 칩이 밀려나지 않게 한다
                  <Text style={[pv.userLocation, s.locationShrink]} numberOfLines={1}>{friendLocation}</Text>
                )}
                {!!friendDnaLabel && (
                  <View
                    style={[
                      s.dnaChip,
                      // 본인 프로필 칩과 같은 배합 — 채움은 진한 강조색 25%(#RRGGBBAA), 테두리는 밝은 강조색 30%
                      { backgroundColor: `${skinAccent.accentDeep}40`, borderColor: skinAccent.tint(0.3) },
                    ]}
                  >
                    <Text style={[s.dnaChipMark, { color: skinAccent.accent }]}>✦</Text>
                    <Text style={[s.dnaChipText, { color: skinAccent.accent }]} numberOfLines={1}>
                      {i18n.language.startsWith('en') ? friendDnaLabel.en : friendDnaLabel.ko}
                    </Text>
                  </View>
                )}
              </View>
            )}
            {/* 소개(bio) — 위치와 통계 사이. 한 줄로 제한하고 넘치면 …처리. 없으면 여백 0 */}
            {!!display.bio && <Text style={pv.userBio} numberOfLines={1} ellipsizeMode="tail">{display.bio}</Text>}
            {/* 나와 겹치는 나라 — 겹침 있을 때만 (여행 DNA 맥락 진입점) */}
            {!isSelf && !!overlap && overlap.sharedCount > 0 && (
              // 앞 아이콘은 기본 이모지(🌍) 대신 앱 아이콘 — 메이트찾기의 같은 줄과 표현을 맞춘다
              <View style={s.overlapRow}>
                <GlobeIcon size={12} color={skinAccent.accent} />
                <Text style={[s.overlapLine, { color: skinAccent.accent }]} numberOfLines={1}>
                  {t('friends.overlapReason', { count: overlap.sharedCount })} · {overlap.sampleCountries.map((c) => countryLabel(c, i18n.language)).join(' · ')}
                </Text>
              </View>
            )}
            {/* 통계 — 여행수·메이트 2개. 메이트 탭 → 메이트 목록(조회 전용) */}
            <View style={pv.statsRow}>
              <StatCard value={String(tripStatValue)} label={t('profile.tripCount')} />
              <StatCard
                value={String(neighborCount)}
                label={t('profile.neighbors')}
                onPress={realId ? () => navigation.navigate('UserFollowList', { userId: realId, mode: 'followers' }) : undefined}
              />
            </View>
          </View>
        </View>

        {/* ── 메이트신청 + DM 버튼 (본인 프로필이면 숨김) ── */}
        {!isSelf && (
          <>
            <View style={s.actionRow}>
              {/* 메이트 상태에 따라 위계가 바뀐다 —
                  아직 아님: 그라데이션(주요 CTA) / 신청중·메이트: 고스트(더 유도하지 않음) */}
              <ProfileActionButton
                variant={neighborState === 'none' ? 'primary' : 'ghost'}
                label={neighborState === 'neighbor'
                  ? t('friends.neighborActive')
                  : neighborState === 'requested'
                    ? t('friends.neighborRequested')
                    : t('friends.neighborRequest')}
                onPress={onNeighborPress}
                accent={skinAccent.accent}
                gradient={skinAccent.btnGradient}
                tint={skinAccent.tint}
                style={{ flex: 1 }}
              />
              {/* DM — 메이트일 때만 노출. 비메이트은 DM 불가(메이트 버튼이 폭을 채움).
                  메이트가 된 뒤에는 대화가 다음 행동이므로 메시지 쪽을 그라데이션으로 올린다 */}
              {neighborNow && (
                <ProfileActionButton
                  variant="primary"
                  label={t('friends.dmBtn')}
                  onPress={() => navigation.navigate('DM', {
                    friend: {
                      name: display.name,
                      handle: profileRow?.handle || route.params?.handle || displayUsername,
                      emoji: display.emoji,
                      photo: display.photo ?? undefined,
                      id: realId ?? undefined,
                    },
                  })}
                  accent={skinAccent.accent}
                  gradient={skinAccent.btnGradient}
                  tint={skinAccent.tint}
                  style={{ minWidth: 110 }}
                  accessibilityLabel={t('friends.dmNameA11y', { name: display.name })}
                />
              )}
            </View>
          </>
        )}

        {!isSelf && !profileLoaded ? (
          /* ── 프로필 로딩 중 — 콘텐츠를 아직 그리지 않는다 ── */
          <ActivityIndicator color={skinAccent.accent} style={{ marginTop: 48 }} />
        ) : locked ? (
          /* ── 비메이트 잠금 안내 — 카운트만 노출, 아카이브는 지구본+자물쇠 + 문구로 대체 ── */
          <>
            <View style={s.divider} />
            <View style={s.lockedBox}>
              <GlobeLockIcon size={72} color={skinAccent.accent} />
              <Text style={s.lockedTitle}>{t('friends.lockedTitle')}</Text>
              <Text style={s.lockedDesc}>{t('friends.lockedDesc')}</Text>
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
                    <BadgeHighlightItem key={badge.id} emoji={badge.emoji} image={badge.image} name={badgeName(badge, t)} glow={badge.glow} earned />
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
                {/* 메인 카드 (첫 여행) — 내 프로필과 동일하게 여행 상세(TripDetail)로 이동.
                    타인 글은 로컬 스토어에 없으므로 그 여행의 기록(서버 조회본)을 guestRecords로 넘긴다 */}
                <TripCard
                  trip={display.trips[0]}
                  main
                  onPress={() => openGuestTripDetail(display.trips[0])}
                />
                {/* 나머지 2열 그리드 */}
                <View style={pv.tripGrid}>
                  {display.trips.slice(1).map((trip) => (
                    <TripCard key={trip.id} trip={trip} onPress={() => openGuestTripDetail(trip)} />
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

      {/* ── 팝업 메뉴 — 안드로이드는 상태바 높이가 달라 헤더(인셋 기반) 아래로 정렬 보정(iOS 120 = 인셋(~56)+64) ── */}
      {menuVisible && (
        <View style={[s.popupMenu, Platform.OS === 'android' && { top: insets.top + 64 }]}>
          {MENU_NORMAL.map((item, idx) => (
            <View key={item.key}>
              <TouchableOpacity style={s.menuItem} onPress={item.onPress} activeOpacity={0.7}>
                <View style={s.menuItemIcon}>{item.icon}</View>
                <Text style={s.menuItemText}>{item.label}</Text>
              </TouchableOpacity>
              {idx < MENU_NORMAL.length - 1 && <View style={s.menuItemDivider} />}
            </View>
          ))}
          <View style={s.menuSectionDivider} />
          {MENU_DANGER.map((item, idx) => (
            <View key={item.key}>
              <TouchableOpacity style={s.menuItem} onPress={item.onPress} activeOpacity={0.7}>
                <View style={s.menuItemIcon}>{item.icon}</View>
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
          // 사용자 신고 — reports 테이블에 접수(post_id 없음). 대상 식별자를 reason에 담아
          // 운영자가 누구에 대한 신고인지 알 수 있게 한다. (토스트만 띄우고 실제 접수를
          // 안 하던 버그 수정)
          reportPostToServer(null, `[user @${linkHandle}${realId ? ` ${realId}` : ''}] ${reason}`).catch(() => {});
          showToast(t('social.reportReceivedToast'));
        }}
      />

      <Toast visible={toastVisible} message={toastMsg} />
    </View>
  );
}

// ─── 프로필 액션 버튼 ───
// 메이트찾기(FriendSearchScreen.MateButton)와 같은 언어: 완전한 필 + 스킨 그라데이션 + 네온 글로우.
// 상태로 위계를 준다 — primary(지금 누를 것) / ghost(대기·완료) / soft(보조 액션).
// 누를 때 0.96 스프링으로 촉감을 준다(리스트 버튼보다 크므로 축소폭은 작게).
function ProfileActionButton({
  variant,
  label,
  onPress,
  accent,
  gradient,
  tint,
  style,
  accessibilityLabel,
}: {
  variant: 'primary' | 'ghost' | 'soft';
  label: string;
  onPress: () => void;
  accent: string;
  gradient: [string, string];
  tint: (a: number) => string;
  style?: object;
  accessibilityLabel?: string;
}) {
  const press = useRef(new Animated.Value(0)).current;
  const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] });
  const to = (v: number) =>
    Animated.spring(press, { toValue: v, friction: 7, tension: 220, useNativeDriver: true }).start();

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={() => to(1)}
        onPressOut={() => to(0)}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        style={[
          s.actionBtn,
          // 컬러 글로우는 iOS 전용 — 안드로이드 elevation은 색 지정 불가(회색 사각 그림자)
          variant === 'primary' && Platform.select({
            ios: { shadowColor: accent, shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
            default: {},
          }),
          variant === 'ghost' && { borderWidth: 1, borderColor: tint(0.45), backgroundColor: tint(0.12) },
          variant === 'soft' && { borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.06)' },
        ]}
      >
        {variant === 'primary' && (
          <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        )}
        <Text style={[s.actionBtnTxt, variant === 'ghost' && { color: accent }]} numberOfLines={1}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
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
  // 나와 겹치는 나라 줄 — 색은 skinAccent.accent 인라인으로 덮음(스킨 관례)
  overlapRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  overlapLine: { fontSize: 12, color: COLORS.accent, flexShrink: 1 },
  // 여행 DNA 칩 — 프로필 탭과 동일한 톤. pv.userBio엔 프로필 탭 같은 음수 marginBottom 보정이
  // 없어(수정 범위 밖) marginTop을 직접 8로 둬 같은 시각적 간격을 낸다. 탭 불가(정보 전용).
  // 위치 줄 + DNA 칩을 한 행에 — 내 프로필의 statusRow와 같은 배치.
  // gap으로 간격을 주므로 칩 자체에는 좌측 마진을 두지 않는다(위치가 없을 때 칩만 밀리는 것 방지)
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationShrink: {
    flexShrink: 1,
  },
  dnaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    // backgroundColor·borderColor는 스킨 강조색 — 인라인
  },
  dnaChipMark: {
    fontSize: 11,
    marginRight: 4,
  },
  dnaChipText: {
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
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

  // ── 팔로우 + DM 버튼 ──
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  // 액션 버튼 — 완전한 필. 그라데이션이 모서리를 넘지 않게 overflow hidden.
  actionBtn: {
    height: 46,
    borderRadius: 999,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  actionBtnTxt: { fontSize: 15, fontWeight: '800', color: COLORS.white, letterSpacing: 0.2 },

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
  // 비메이트 잠금 안내 — 인스타 비공개 계정 스타일(아이콘 1개 + 문구)
  lockedBox: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 32 },
  lockedTitle: { fontSize: 15, fontWeight: '700', color: COLORS.white, textAlign: 'center', marginTop: 16 },
  lockedDesc: { fontSize: 13, color: '#A1A1B0', textAlign: 'center', marginTop: 6, lineHeight: 18 },

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
  menuItemIcon: { width: 18, alignItems: 'center', justifyContent: 'center' }, // 아이콘 폭 고정 → 라벨 시작점 정렬
  menuItemText: { fontSize: 14, color: COLORS.white, fontWeight: '500' },
  menuItemDanger: { color: COLORS.red },
  menuItemDivider: { height: 1, backgroundColor: COLORS.menuDivider },
  menuSectionDivider: { height: 1, backgroundColor: COLORS.menuDivider },
});
