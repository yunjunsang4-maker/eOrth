import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import AppRefreshControl from '../components/AppRefreshControl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Text } from '../ui/Text';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { handleBlock as confirmBlock } from '../utils/reportAndBlock';
import { countryLabel } from '../utils/countryLabel';
import { isKoreanLang } from '../utils/langKind';
import { LinkIcon, ShareIcon, BellIcon, BellOffIcon, BlockIcon, WarningIcon, LockClosedIcon, BackChevronIcon } from '../components/icons';
import DefaultAvatar from '../components/DefaultAvatar';
import { useRecordData, useSocialGraph, useRecordActions } from '../store/recordStore';
import { useProfileSettings, useHomeSettings } from '../store/settingsStore';
import ReportModal from '../components/ReportModal';
import { PillRing } from '../components/record/CalendarBottomSheet';
import Toast from '../components/Toast';
import { isSupabaseConfigured } from '../services/supabase';
import { getProfileById, getCountryCounts, type ProfileRow } from '../services/profile';
import { labelFromKey } from '../utils/travelDnaScore';
import { fetchUserPosts } from '../services/posts';
import { fetchNeighborCount, fetchPostCount, fetchOverlapWith, reportPostToServer } from '../services/social';
import { applyViewer, isPostHiddenForViewer } from '../utils/mediaPrivacy';
import { computeEarnedBadgeIds } from '../utils/badgeRules';
import { BADGES } from '../constants/badges';
import { badgeName } from '../utils/badgeText';
import { BadgeHighlightItem, TripCard, pv } from '../components/profile/ProfileVisuals';
import ProfileScreen from './ProfileScreen';
import { useSkinAccent } from '../constants/skinTheme';
import { handleFontStyle } from '../constants/handleFonts';
import { useLateFontsLoaded } from '../constants/lateFonts';
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
  // 2026-10 남의 프로필 시안 고정색
  primaryBtn:   '#7C3AED', // 메이트 신청·DM 주요 버튼(단색)
  textSoft:     '#E5E5EA', // 겹치는 나라·위치 줄
};

// 프로필 아바타 지름 (시안 110 — 프로필 탭의 128 링 대신)
const AVATAR = 110;


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
  const { handle: myHandle, profilePhoto: myPhoto, bio: myBio } = useProfileSettings();
  const { homeCountryCode: myHomeCountryCode } = useHomeSettings();
  const skinAccent = useSkinAccent(); // 팔로우·맞팔·핸들 강조를 스킨색으로
  const { records: myRecords, tripGroups } = useRecordData();

  // 실제 사용자 프로필 + 공개 글을 백엔드에서 로드 (미설정/없음이면 빈 상태)
  const [profileRow, setProfileRow] = useState<ProfileRow | null>(null);
  // handle 파라미터 없이 진입해도(댓글·알림 등 userId만 전달) 프로필 로드 후 본인 판정이 되도록
  // profileRow.handle을 병행 확인 — 안 하면 내 프로필에 메이트신청 버튼·차단 메뉴가 뜬다
  // 내 기록 id로 들어온 경우도 본인이다 — 서버 authorId가 없는 내 글 카드는 `userId: item.id`(기록 id)를 넘기는데,
  // 그 글에 박힌 handle은 작성 당시 값이라 아이디를 바꾼 뒤엔 myHandle과 달라 남의 프로필로 열렸다
  // (메이트 신청·차단 버튼 노출 → 자기 자신 차단 가능, 2026-09-29 소셜 탭 점검 12번).
  const isMyRecordId = !!userId && myRecords.some((r) => r.id === userId || r.remoteId === userId);
  const isSelf = isMyRecordId || (!!myHandle && (route.params?.handle === myHandle || profileRow?.handle === myHandle));
  const [userPosts, setUserPosts] = useState<TravelRecord[]>([]);
  const [neighborCount, setNeighborCount] = useState(0);
  // 여행수(기록 수) — 서버 동기화값. 비메이트은 RLS로 글이 안 와도 이 값으로 실제 개수를 보여준다.
  const [postCount, setPostCount] = useState<number | null>(null);
  // 여행 국가 수 — 서버 집계(profile_country_counts: 비공개·삭제·차단 제외). 비메이트는 RLS로 글이
  // 안 와 로컬 계산이 불가능하므로 이 값이 있어야 잠금 화면에도 실제 숫자가 나온다.
  const [countryCount, setCountryCount] = useState<number | null>(null);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);
  // 프로필 로딩 완료 여부 — 완료 전엔 콘텐츠를 그리지 않는다(로딩 깜빡임 방지)
  const [profileLoaded, setProfileLoaded] = useState(!isSupabaseConfigured || !userId);
  const loadProfile = useCallback(async () => {
    if (!isSupabaseConfigured || !userId) return;
    const [p, posts, nc, pc, cc] = await Promise.all([
      getProfileById(userId),
      fetchUserPosts(userId),
      fetchNeighborCount(userId),
      fetchPostCount(userId),
      getCountryCounts([userId]),
    ]);
    if (!aliveRef.current) return;
    setProfileRow(p);
    setUserPosts(posts);
    if (nc !== null) setNeighborCount(nc); // 오류(null)면 이전 값 유지 — 0 깜빡임 방지
    if (pc !== null) setPostCount(pc);     // 여행수 서버 동기화값(오류면 로컬 폴백)
    // 국가 수 — getCountryCounts는 실패와 '집계 행 없음(공개 글 0)'을 둘 다 {}로 준다.
    // 구분이 안 되므로 숫자가 왔을 때만 갱신(나머지는 이전 값 유지 → 아래 표시부의 로컬 폴백)
    const ccv = cc[userId];
    if (typeof ccv === 'number') setCountryCount(ccv);
    setProfileLoaded(true);
  }, [userId]);
  useEffect(() => { loadProfile(); }, [loadProfile]);
  // 진입 시 메이트·대기 신청을 서버 기준으로 동기화 — 상대가 내 신청을 수락했는데
  // '신청됨' 버튼이 잔존하거나, 알림에서 넘어왔을 때 메이트 상태가 낡아 있는 문제 방지
  const { refreshNeighbors } = useRecordActions();
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
  const { handleFont: myHandleFont, isPremium: myPremium } = useProfileSettings();
  const lateFonts = useLateFontsLoaded(); // 서체 등록 전엔 기본 폰트로 — constants/lateFonts.ts
  const nameFontStyle = handleFontStyle(isSelf ? (myPremium ? myHandleFont : null) : profileRow?.handle_font, lateFonts);

  // 상대의 여행 DNA 유형 — public_profiles 뷰의 dna_type_key만 공개(축 점수는 비공개, 설계 §9).
  // 미완료·해석 불가면 labelFromKey가 null을 주고, 그때는 칩 자체를 렌더하지 않는다(빈 상태는 본인 전용).
  const friendDnaLabel = labelFromKey(profileRow?.dna_type_key);

  // 메이트·차단은 store 공유 상태 — 메이트 목록/프로필 카운트와 동기화된다
  const { neighbors, isNeighbor, isNeighborRequested, isNeighborRequestReceived, isMuted } = useSocialGraph();
  const { requestNeighbor, cancelNeighborRequest, acceptNeighbor, removeNeighbor, blockUser, toggleMute } = useRecordActions();
  // 신원은 id 우선 — 핸들이 빈 유저끼리 충돌 방지
  // realId는 profile uuid일 때만 — 핸들을 id로 넘기면 서버 neighbors insert(uuid 컬럼)가 실패한다
  const realId = userId ?? profileRow?.id ?? null;
  const neighborNow = !!realId && isNeighbor(realId);
  const requested = !!realId && isNeighborRequested(realId);
  // 상대가 나에게 신청해 둔 상태 — 이땐 '신청'이 아니라 '수락'이 맞는 행동이다.
  // (내 신청도 있으면 서버가 이미 서로메이트으로 수렴시키므로 requested보다 먼저 본다)
  const incoming = !!realId && isNeighborRequestReceived(realId);
  const neighborState: 'none' | 'requested' | 'incoming' | 'neighbor' =
    neighborNow ? 'neighbor' : incoming ? 'incoming' : requested ? 'requested' : 'none';
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

  // ── 겹치는 나라 팝오버 (2026-10-05 시안) ──
  // 행 탭 → chevron 원 바로 아래에 나라 이름 알약. 한 페이지 최대 4개, 더 있으면 끝에 '•••'(탭 = 다음/이전 페이지).
  // ⚠️ 알약은 ScrollView 안(정보 열)이 아니라 화면 루트(s.container)의 절대 자식으로 그린다 —
  //    안드로이드는 부모 경계 밖으로 나간 absolute 자식에 터치가 전달되지 않는다(정보 열 폭을 넘고
  //    통계 줄을 덮어야 하므로 정보 열 안에 두면 '•••'가 안 눌린다). 위치는 열 때 measureInWindow로 잰다.
  const OVERLAP_PAGE = 4;
  const [overlapOpen, setOverlapOpen] = useState(false);
  const [overlapPage, setOverlapPage] = useState(0);
  const [overlapAnchor, setOverlapAnchor] = useState<{ cx: number; top: number; screenW: number } | null>(null);
  const [overlapPillW, setOverlapPillW] = useState(0); // 0 = 아직 안 잼(그동안 투명)
  const containerRef = useRef<View>(null);
  const overlapChevronRef = useRef<View>(null);
  const overlapFade = useRef(new Animated.Value(0)).current;
  const fadeInOverlap = () => {
    overlapFade.setValue(0);
    Animated.timing(overlapFade, { toValue: 1, duration: 140, useNativeDriver: true }).start();
  };
  const openOverlap = () => {
    const root = containerRef.current;
    const chev = overlapChevronRef.current;
    if (!root || !chev) return;
    setMenuVisible(false); // ⋯ 메뉴와 동시에 열리지 않게
    root.measureInWindow((rx, ry, rw) => {
      chev.measureInWindow((x, y, w, h) => {
        if (!aliveRef.current) return;
        // 가로 중심 = chevron 원 중심, 세로 = 원 하단 + 5(시안: 원 하단 ~201 → 알약 상단 ~207)
        setOverlapAnchor({ cx: x - rx + w / 2, top: y - ry + h + 5, screenW: rw });
        setOverlapPage(0);
        setOverlapPillW(0);
        overlapFade.setValue(0);
        setOverlapOpen(true);
      });
    });
  };
  const goOverlapPage = (p: number) => {
    setOverlapPage(p);
    fadeInOverlap();
  };
  const onNeighborPress = () => {
    if (!realId) return;
    if (neighborState === 'none') requestNeighbor(realId);
    else if (neighborState === 'incoming') acceptNeighbor(realId);
    else if (neighborState === 'requested') cancelNeighborRequest(realId);
    else Alert.alert(t('friends.removeNeighborTitle'), t('friends.removeNeighborMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('friends.removeNeighbor'), style: 'destructive', onPress: () => removeNeighbor(realId) },
    ]);
  };
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuSize, setMenuSize] = useState({ w: 0, h: 0 }); // 메뉴 카드 유리 테두리(PillRing) 크기
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

  // 메뉴 아이콘 — 앱 아이콘 세트(게시물 메뉴 PostDetailScreen과 같은 규약: size 16, 일반 흰색 / 위험 빨강)
  const MENU_ICON = 16;
  const MENU_DANGER_RED = '#FF0138'; // 시안 원색 — 위험 라벨(s.menuItemDanger)과 같은 값
  const MENU_NORMAL = [
    { key: 'link',  icon: <LinkIcon size={MENU_ICON} color={COLORS.white} />,  label: t('friends.copyProfileLink'), onPress: handleCopyLink },
    { key: 'share', icon: <ShareIcon size={MENU_ICON} color={COLORS.white} />, label: t('friends.share'),           onPress: handleShare },
    {
      key:   'notif',
      // 음소거 상태면 '알림 켜기'(종) / 아니면 '알림 끄기'(사선 종) — 누르면 될 결과를 보여준다
      // 사선 틈 색 = 메뉴 카드 그라데이션 중간값
      icon:  notifMuted
        ? <BellIcon size={MENU_ICON} color={COLORS.white} />
        : <BellOffIcon size={MENU_ICON} color={COLORS.white} slashBg="#222223" />,
      label:   notifMuted ? t('friends.notifOn') : t('friends.notifOff'),
      onPress: handleToggleNotif,
    },
  ];

  const MENU_DANGER = [
    {
      key: 'block',
      icon: <BlockIcon size={MENU_ICON} color={MENU_DANGER_RED} />,
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
    { key: 'report', icon: <WarningIcon size={MENU_ICON} color={MENU_DANGER_RED} />, label: t('friends.reportLong'), onPress: () => { setMenuVisible(false); setReportVisible(true); } },
  ];

  // 내 프로필(내 게시물의 아이디 탭)이면 실제 프로필 탭 컴포넌트를 그대로 렌더한다 —
  // 룩앤필을 흉내 내지 않고 같은 컴포넌트를 써서 화면·기능이 프로필 탭과 100% 동일하다.
  // 스택 라우트로 푸시되므로 뒤로가기로 원래 화면(소셜)으로 돌아온다.
  if (isSelf) return <ProfileScreen navigation={navigation as any} route={route as any} pushed onBack={() => navigation.goBack()} />;

  // ⋯ — 지름 32 원 + 흰 점 3개(시안). 메뉴가 열리면 어두운 막 위에 같은 원을 한 번 더 그려 밝게 남긴다
  const moreCircle = (
    <View style={s.moreCircle}>
      {/* 앱 공용 유리 테두리(좌상·우하 흰색 대각 그라데이션) — PostDetail ⋯ 알약과 같은 링 */}
      <PillRing width={32} height={32} radius={16} />
      <View style={s.moreDot} />
      <View style={s.moreDot} />
      <View style={s.moreDot} />
    </View>
  );

  return (
    <View style={s.container} ref={containerRef}>

      {/* ── 헤더 ── */}
      <View style={[s.header, { marginTop: insets.top + 12 }]}>
        <TouchableOpacity style={s.headerBtn} onPress={() => navigation.goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('friends.back')}>
          <BackChevronIcon />
        </TouchableOpacity>
        {/* 제목은 좌우 버튼 폭과 무관하게 화면 정중앙 — 절대 배치(버튼 폭만큼 좌우 패딩으로 겹침 방지) */}
        <View style={s.headerTitleWrap} pointerEvents="none">
          <Text style={s.headerTitle} numberOfLines={1}>@{displayUsername}</Text>
        </View>
        <TouchableOpacity style={[s.headerBtn, s.moreBtnHit]} onPress={() => { setOverlapOpen(false); setMenuVisible((v) => !v); }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('friends.more')}>
          {moreCircle}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* ── 프로필 행 (110 아바타 + 정보 열) — 2026-10 시안. 정보 열은 아바타 세로 중앙에 맞춘다 ── */}
        <View style={s.profileRow}>
          {display.photo ? (
            <View style={s.avatar}>
              <Image source={{ uri: display.photo }} style={s.avatarImg} cachePolicy="memory-disk" transition={120} />
              {/* 사진 위에도 DefaultAvatar와 같은 회색 그라데이션 림
                  (새 아키텍처에서 RNSVG가 pointerEvents="none"을 무시하고 터치를 삼키므로 View로 감싼다) */}
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <Svg width={AVATAR} height={AVATAR} viewBox={`0 0 ${AVATAR} ${AVATAR}`} fill="none">
                  <Defs>
                    <SvgLinearGradient id="friendAvatarRim" x1="0" y1="0" x2={AVATAR} y2={AVATAR} gradientUnits="userSpaceOnUse">
                      <Stop offset="0" stopColor="#323337" />
                      <Stop offset="0.5" stopColor="#323337" stopOpacity="0" />
                      <Stop offset="0.85" stopColor="#6F6F72" />
                    </SvgLinearGradient>
                  </Defs>
                  <Circle cx={AVATAR / 2} cy={AVATAR / 2} r={AVATAR / 2 - 0.5} stroke="url(#friendAvatarRim)" strokeWidth={1} />
                </Svg>
              </View>
            </View>
          ) : (
            <DefaultAvatar size={AVATAR} />
          )}
          <View style={s.profileInfo}>
            {/* 닉네임 폐지 — 아이디(handle)만 표시. 한 줄(넘치면 …) */}
            <Text style={[s.userName, nameFontStyle]} numberOfLines={1}>{display.name}</Text>
            {/* 이름 아래 위치 줄 + 여행 DNA 칩 — 내 프로필과 동일한 배치(거주국 오른쪽에 칩).
                여행 DNA는 상대가 유형을 갖고 있을 때만 그린다(탭 불가 — 본인 결과가 아니다).
                없으면 아무것도 렌더하지 않는다 — 빈 상태 유도는 본인 프로필에서만 의미가 있다. */}
            {(!!friendLocation || !!friendDnaLabel) && (
              <View style={s.identityRow}>
                {!!friendLocation && (
                  // 국가명이 길면 이쪽이 먼저 줄어들어 오른쪽 칩이 밀려나지 않게 한다
                  <Text style={[s.userLocation, s.locationShrink]} numberOfLines={1}>{friendLocation}</Text>
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
                      {isKoreanLang(i18n.language) ? friendDnaLabel.ko : friendDnaLabel.en}
                    </Text>
                  </View>
                )}
              </View>
            )}
            {/* 소개(bio) — 위치와 통계 사이. 한 줄로 제한하고 넘치면 …처리. 없으면 여백 0 */}
            {!!display.bio && <Text style={pv.userBio} numberOfLines={1} ellipsizeMode="tail">{display.bio}</Text>}
            {/* 나와 겹치는 나라 — 겹침 있을 때만 (여행 DNA 맥락 진입점).
                시안: 문구 + 원형 chevron만. 탭하면 나라 이름 팝오버(화면 루트에 그림 — 아래 '겹치는 나라 팝오버').
                열려 있는 동안은 전체 화면 오버레이가 이 행을 덮으므로 '다시 탭'은 오버레이가 받아 닫는다 */}
            {!isSelf && !!overlap && overlap.sharedCount > 0 && (
              <TouchableOpacity
                style={s.overlapRow}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ expanded: overlapOpen }}
                // 서버가 이름을 k-익명 필터로 거르므로 비어 있을 수 있다 → 탭을 막는다(빈 팝오버 방지)
                disabled={overlap.sampleCountries.length === 0}
                onPress={() => (overlapOpen ? setOverlapOpen(false) : openOverlap())}
                // 위치는 열 때 한 번만 잰다 — 뒤늦게 온 위치줄·소개가 행을 밀면 알약이 떨어져 보이므로 닫는다
                onLayout={() => setOverlapOpen(false)}
              >
                <Text style={s.overlapLine} numberOfLines={1}>
                  {t('friends.overlapReason', { count: overlap.sharedCount })}
                </Text>
                {/* ref로 위치를 잰다 — 측정 대상이 Fabric 평탄화로 사라지지 않게 collapsable={false} */}
                <View style={s.overlapChevron} ref={overlapChevronRef} collapsable={false}>
                  {/* ⋯ 버튼과 같은 앱 공용 유리 테두리 */}
                  <PillRing width={14} height={14} radius={7} />
                  {/* 공용 뒤로가기 chevron — 닫힘 '>'(좌우 반전) / 열림 '˅'(-90° 회전).
                      RNSVG 터치 삼킴 방지로 View(pointerEvents none)로 감쌈 */}
                  <View pointerEvents="none" style={{ transform: [overlapOpen ? { rotate: '-90deg' } : { scaleX: -1 }] }}>
                    <BackChevronIcon size={7} opacity={1} />
                  </View>
                </View>
              </TouchableOpacity>
            )}
            {/* 통계 — 게시물·여행 국가·메이트 3칸(좌측 정렬). 메이트 탭 → 메이트 목록(조회 전용) */}
            <View style={s.statsRow}>
              <FriendStat value={String(tripStatValue)} label={t('friends.statPosts')} />
              {/* 서버 집계 우선 → 없으면 로컬(받은 글) 계산. 잠금(비메이트)이고 글도 0건이면 실제 국가 수를 모른다 → 0 대신 '–' */}
              <FriendStat
                value={countryCount !== null
                  ? String(countryCount)
                  : locked && sourcePosts.length === 0 ? '–' : String(display.visitedCountries)}
                label={t('friends.statCountries')}
              />
              <FriendStat
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
                  아직 아님·수락 대기: 단색 보라(주요 CTA, 시안 고정색) / 신청중·메이트: 고스트(더 유도하지 않음) */}
              <ProfileActionButton
                variant={neighborState === 'none' || neighborState === 'incoming' ? 'primary' : 'ghost'}
                label={neighborState === 'neighbor'
                  ? t('friends.neighborActive')
                  : neighborState === 'incoming'
                    ? t('friends.neighborAccept')
                    : neighborState === 'requested'
                      ? t('friends.neighborRequested')
                      : t('friends.neighborRequest')}
                onPress={onNeighborPress}
                accent={skinAccent.accent}
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
          /* ── 비메이트 잠금 안내 — 카운트만 노출, 아카이브는 자물쇠 + 문구로 대체(시안: 구분선 없음) ── */
          <View style={s.lockedBox}>
            {/* 글리프가 뷰박스(96)의 8~89만 차지 — size 72면 자물쇠 실높이 ≈ 61로 시안(≈62)과 맞는다 */}
            <LockClosedIcon size={72} color="#D9D9D9" />
            <Text style={s.lockedTitle}>{t('friends.lockedTitle')}</Text>
            <Text style={s.lockedDesc}>{t('friends.lockedDesc')}</Text>
          </View>
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

      {/* ── 팝업 오버레이 — ⋯ 메뉴·겹치는 나라 팝오버 공용(밖을 탭하면 닫힘) ── */}
      {(menuVisible || overlapOpen) && (
        <TouchableOpacity
          // ⋯ 메뉴일 때만 화면을 50% 어둡게(시안) — 겹치는 나라 팝오버는 투명 막
          style={[s.menuOverlay, menuVisible && s.menuDim]}
          activeOpacity={1}
          onPress={() => { setMenuVisible(false); setOverlapOpen(false); }}
        />
      )}

      {/* ── 겹치는 나라 팝오버 — 화면 루트 기준 절대 배치(안드로이드 터치 함정, 위 openOverlap 주석) ── */}
      {overlapOpen && overlapAnchor && !!overlap && overlap.sampleCountries.length > 0 && (() => {
        const list = overlap.sampleCountries;
        const pages = Math.ceil(list.length / OVERLAP_PAGE);
        const page = Math.min(overlapPage, pages - 1);
        const items = list.slice(page * OVERLAP_PAGE, page * OVERLAP_PAGE + OVERLAP_PAGE);
        const maxW = overlapAnchor.screenW - 32;
        // chevron 중심에 맞추되 화면 좌우 16 여백 안으로 클램프(폭은 onLayout으로 잰 값)
        const left = Math.max(16, Math.min(overlapAnchor.cx - overlapPillW / 2, overlapAnchor.screenW - 16 - overlapPillW));
        return (
          <Animated.View
            style={[s.overlapPill, { top: overlapAnchor.top, left, maxWidth: maxW, opacity: overlapFade }]}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (overlapPillW === 0) fadeInOverlap(); // 첫 측정 전엔 투명 — 엉뚱한 위치가 한 프레임 보이지 않게
              setOverlapPillW(w);
            }}
          >
            {/* 채움: 세로 그라데이션(시안 #27272B → #36373A) */}
            <LinearGradient colors={['#27272B', '#36373A']} style={StyleSheet.absoluteFill} pointerEvents="none" />
            {/* 유리 림 — 테두리를 알약 자체가 아니라 위에 얹은 View로 그린다. 알약에 border를 주면
                absoluteFill 그라데이션(테두리 안쪽 사각형)이 둥근 모서리에서 테두리를 덮는다 */}
            <View style={s.overlapRim} pointerEvents="none" />
            {page > 0 && (
              <OverlapDots side="left" onPress={() => goOverlapPage(page - 1)} label={t('accountSettings.prev')} />
            )}
            {items.map((c, i) => (
              <React.Fragment key={c}>
                {i > 0 && <View style={s.overlapDivider} />}
                <Text style={s.overlapName} numberOfLines={1}>{countryLabel(c, i18n.language)}</Text>
              </React.Fragment>
            ))}
            {page < pages - 1 && (
              <OverlapDots side="right" onPress={() => goOverlapPage(page + 1)} label={t('accountSettings.next')} />
            )}
          </Animated.View>
        );
      })()}

      {/* ── ⋯ 메뉴가 열린 동안 어두운 막 위로 올린 ⋯ 원 — 헤더의 원과 같은 자리(헤더 marginTop + (56 − 테두리1 − 32)/2) ── */}
      {menuVisible && (
        <TouchableOpacity
          style={[s.moreRaised, { top: insets.top + 12 + 11.5 }]}
          onPress={() => setMenuVisible(false)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('friends.more')}
        >
          {moreCircle}
        </TouchableOpacity>
      )}

      {/* ── 팝업 메뉴 — 헤더 하단 구분선에 걸치게(시안: 헤더 하단 −2). 인셋 기반이라 iOS·안드로이드 공통 ── */}
      {menuVisible && (
        <View
          style={[s.popupMenu, { top: insets.top + 12 + 56 - 2 }]}
          onLayout={(e) => {
            const { width: w, height: h } = e.nativeEvent.layout;
            setMenuSize((p) => (p.w === Math.round(w) && p.h === Math.round(h) ? p : { w: Math.round(w), h: Math.round(h) }));
          }}
        >
          {/* 채움: 세로 그라데이션(시안 #19191A → #2A2A2C) + 앱 공용 유리 테두리 */}
          <LinearGradient colors={['#19191A', '#2A2A2C']} style={[StyleSheet.absoluteFill, { borderRadius: 10 }]} pointerEvents="none" />
          <PillRing width={menuSize.w} height={menuSize.h} radius={10} />
          {MENU_NORMAL.map((item, idx) => (
            <View key={item.key}>
              <TouchableOpacity style={s.menuItem} onPress={item.onPress} activeOpacity={0.7}>
                <View style={s.menuItemIcon}>{item.icon}</View>
                <Text style={s.menuItemText}>{item.label}</Text>
              </TouchableOpacity>
              {idx < MENU_NORMAL.length - 1 && <View style={s.menuItemDivider} />}
            </View>
          ))}
          <View style={s.menuItemDivider} />
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
// 2026-10 시안: 높이 40 · radius 12 사각 버튼, primary는 단색 #7C3AED(스킨 그라데이션·글로우 폐지).
// 상태로 위계를 준다 — primary(지금 누를 것) / ghost(대기·완료) / soft(보조 액션).
// 누를 때 0.96 스프링으로 촉감을 준다(리스트 버튼보다 크므로 축소폭은 작게).
function ProfileActionButton({
  variant,
  label,
  onPress,
  accent,
  tint,
  style,
  accessibilityLabel,
}: {
  variant: 'primary' | 'ghost' | 'soft';
  label: string;
  onPress: () => void;
  accent: string;
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
          variant === 'primary' && { backgroundColor: COLORS.primaryBtn },
          variant === 'ghost' && { borderWidth: 1, borderColor: tint(0.45), backgroundColor: tint(0.12) },
          variant === 'soft' && { borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.06)' },
        ]}
      >
        <Text style={[s.actionBtnTxt, variant === 'ghost' && { color: accent }]} numberOfLines={1}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── 통계 한 칸 — 시안: 숫자 18 bold 흰색 / 라벨 11 #B2B3B4, 가운데 정렬 ───
// (공용 StatCard는 22/13 프로필 탭 치수라 이 화면 시안과 달라 쓰지 않는다)
function FriendStat({ value, label, onPress }: { value: string; label: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={s.statCol} onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── 겹치는 나라 팝오버의 '•••' — 탭하면 이전/다음 페이지 ───
// 시안: #A78BFA 점 3개(지름 3·간격 3), 이름에 가까운 점이 가장 밝고 바깥으로 흐려진다(1 → 0.5 → 0.3).
// 터치 영역은 알약 높이 전체(alignSelf stretch) — 안드로이드는 부모(알약) 밖 hitSlop이 안 먹으므로
// 세로는 hitSlop이 아니라 자기 높이로 확보한다. 바깥쪽 여백은 음수 마진으로 알약 패딩에 겹쳐 시안 간격을 맞춘다.
function OverlapDots({ side, onPress, label }: { side: 'left' | 'right'; onPress: () => void; label: string }) {
  const ops = side === 'right' ? [1, 0.5, 0.3] : [0.3, 0.5, 1];
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      hitSlop={{ top: 8, bottom: 8 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[s.overlapDots, side === 'right' ? { marginRight: -6 } : { marginLeft: -6 }]}
    >
      {ops.map((o, i) => <View key={i} style={[s.overlapDot, { opacity: o }]} />)}
    </TouchableOpacity>
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
  // ── 프로필 행 (2026-10 시안: 헤더 아래 33 · 아바타 110 · 정보 열 간격 26) ──
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 26, marginTop: 33 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, overflow: 'hidden' },
  avatarImg: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  profileInfo: { flex: 1 },
  userName: { fontSize: 22, fontWeight: '700', color: COLORS.white, lineHeight: 28 },
  userLocation: { fontSize: 12, fontWeight: '600', color: COLORS.textSoft },
  // 나와 겹치는 나라 줄 — 문구 + 원형 chevron(시안 고정색)
  overlapRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 15, alignSelf: 'flex-start' },
  overlapLine: { fontSize: 12, color: COLORS.textSoft, flexShrink: 1 },
  overlapChevron: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#28292D', // 테두리는 PillRing — borderWidth 주면 이중 테두리
    alignItems: 'center', justifyContent: 'center',
  },
  // 겹치는 나라 팝오버 알약 — 시안 실측: 높이 25 · 좌우 13(림 1 + 패딩 12) · 이름 11 bold #A78BFA ·
  // 구분선 1×9 #6B6C6E 좌우 5. top/left/maxWidth는 측정값으로 인라인. 메뉴 오버레이(50) 위.
  overlapPill: {
    position: 'absolute', zIndex: 51,
    height: 25, borderRadius: 999, overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13,
  },
  overlapRim: { ...StyleSheet.absoluteFillObject, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  overlapName: { fontSize: 11, fontWeight: '700', color: '#A78BFA', lineHeight: 14, flexShrink: 1 },
  overlapDivider: { width: 1, height: 9, backgroundColor: '#6B6C6E', marginHorizontal: 5 },
  overlapDots: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: 3, paddingHorizontal: 6 },
  overlapDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#A78BFA' },
  // 통계 3칸 — 좌측 정렬, 칸 간격 24
  statsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 26, marginTop: 27 },
  statCol: { alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '800', fontFamily: 'Inter_800ExtraBold', color: COLORS.white, lineHeight: 22 },
  statLabel: { fontSize: 12, color: '#B2B3B4', marginTop: 3, lineHeight: 15 },
  // 여행 DNA 칩 — 프로필 탭과 동일한 톤. pv.userBio엔 프로필 탭 같은 음수 marginBottom 보정이
  // 없어(수정 범위 밖) marginTop을 직접 8로 둬 같은 시각적 간격을 낸다. 탭 불가(정보 전용).
  // 위치 줄 + DNA 칩을 한 행에 — 내 프로필의 statusRow와 같은 배치.
  // gap으로 간격을 주므로 칩 자체에는 좌측 마진을 두지 않는다(위치가 없을 때 칩만 밀리는 것 방지)
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
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
    paddingHorizontal: 16,
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
  headerTitleWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16 + 40 + 8, // 좌우 버튼(패딩 16 + 폭 40) + 여유 — 긴 아이디가 버튼 밑으로 파고들지 않게
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.white },
  // ⋯ 버튼 — 터치 영역 40은 유지하고 원은 오른쪽 끝에 붙인다
  moreBtnHit: { alignItems: 'flex-end' },
  moreCircle: {
    width: 32, height: 32, borderRadius: 16,
    // 테두리는 PillRing이 그린다 — borderWidth를 주면 링이 1px 밀리고 이중 테두리가 된다
    backgroundColor: '#222327',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  moreDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: COLORS.white },

  // ── 프로필 ──

  // ── 여행 중 배너 ──

  // ── 팔로우 + DM 버튼 ──
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 41, // 시안: 프로필 행 아래 ~41
    marginBottom: 4,
  },
  // 액션 버튼 — 시안: 높이 40 · radius 12 (primary 단색은 ProfileActionButton에서 인라인)
  actionBtn: {
    height: 40,
    borderRadius: 12,
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
  // 비메이트 잠금 안내 — 시안: 버튼 하단 → 자물쇠 상단 ≈120(아이콘 박스 위 여백 6 포함해 117)
  lockedBox: { alignItems: 'center', marginTop: 117, paddingHorizontal: 32 },
  lockedTitle: { fontSize: 18, fontWeight: '700', color: COLORS.white, textAlign: 'center', marginTop: 17, lineHeight: 24 },
  lockedDesc: { fontSize: 12, color: '#8E8E93', textAlign: 'center', marginTop: 12, lineHeight: 16 },

  // ── 여행 썸네일 2열 그리드 ──

  // ── 팝업 오버레이 ──
  menuOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 50,
  },
  menuDim: { backgroundColor: 'rgba(0,0,0,0.5)' },
  // 어두운 막 위의 ⋯ 원 — 헤더 원과 같은 x(오른쪽 16)
  moreRaised: { position: 'absolute', right: 16, zIndex: 51 },

  // ── 팝업 메뉴 ──
  // 시안: 폭 148 · radius 10 · 행 33 + 구분선 1. 테두리는 PillRing이 그리므로 overflow hidden·borderWidth 금지(링이 잘림)
  popupMenu: {
    position: 'absolute', right: 16, width: 148,
    borderRadius: 10, zIndex: 51,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    height: 33, paddingLeft: 13, paddingRight: 12, gap: 9, // 라벨 시작 = 13 + 아이콘 칸 18 + 9 = 40(시안)
  },
  menuItemIcon: { width: 18, alignItems: 'center', justifyContent: 'center' }, // 아이콘 폭 고정 → 라벨 시작점 정렬
  menuItemText: { fontSize: 13, color: COLORS.white, fontWeight: '500' },
  menuItemDanger: { color: '#FF0138' }, // 시안 원색(디자인 토큰 빨강 #FF3B30 아님)
  menuItemDivider: { height: 1, backgroundColor: '#4D4D4F' },
});
