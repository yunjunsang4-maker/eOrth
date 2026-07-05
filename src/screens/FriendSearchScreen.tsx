import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Animated,
  ActivityIndicator,
  Modal,
  Share,
  Pressable,
} from 'react-native';

import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';
import { GlobeIcon, SearchIcon } from '../components/icons';
import { useSettings } from '../store/settingsStore';
import { QR_DESIGNS, getQrDesign } from '../constants/qrDesigns';
import { useRecords } from '../store/recordStore';
import { showPermissionDeniedAlert } from '../utils/permissionAlert';
import { isSupabaseConfigured } from '../services/supabase';
import { searchProfiles, getMyUserId, getCountryCounts, getFollowerCounts, getProfileByHandle } from '../services/profile';
import { fetchFriendSuggestions } from '../services/social';
import { computeTravelStats } from '../utils/badgeRules';
import { buzz } from '../utils/haptics';
import Toast from '../components/Toast';
import type { RootStackScreenProps } from '../navigation/types';

// ─────────────────────────────────────────────
// 디자인 토큰
// ─────────────────────────────────────────────
const C = {
  bg: '#0A0A0F',
  card: '#2E2E3B',
  qrCard: '#1E1E2E',
  accent: '#BF85FC',
  accentDark: '#6B21A8',
  dim: '#A1A1B0',
  white: '#FFFFFF',
  divider: '#1A1A26',
  gray: '#3A3A4A',
};

// ─────────────────────────────────────────────
// 딥링크 (app.json scheme: "eorth" 와 일치) — 생성/공유/파싱을 한 곳에서 관리
// ─────────────────────────────────────────────
const userLink = (code: string) => `eorth://user/${code}`;
const USER_LINK_RE = /eorth:\/\/user\/(.+)$/i; // 대소문자 무관(이전 eOrth 링크 호환)

// ─────────────────────────────────────────────
// 검색/추천 결과 친구 타입
// ─────────────────────────────────────────────
interface ContactFriend {
  id: string;
  name: string;
  initial: string;
  username: string;
  countries: number;
  followers?: number;     // 팔로워 수
  photo?: string | null; // 프로필 사진 URL (있으면 아바타로 표시)
  emoji?: string | null;  // 프로필 이모지 (사진 없을 때)
  isPrivate?: boolean;    // 비공개 계정 — 팔로우 대신 요청 흐름
}

// ─────────────────────────────────────────────
// 친구 아이템 (검색 결과·추천 친구 공통)
// ─────────────────────────────────────────────
function FriendItem({
  item,
  following,
  requested,
  onToggle,
  onPress,
}: {
  item: ContactFriend;
  following: boolean;
  requested: boolean; // 비공개 계정에 팔로우 요청을 보낸 상태
  onToggle: () => void;
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  // 사진 로드 실패 시 이니셜/이모지로 회귀 (깨진 이미지 방지)
  const [imgError, setImgError] = useState(false);
  return (
    <TouchableOpacity style={s.friendItem} onPress={onPress} activeOpacity={0.75}>
      <View style={s.avatar}>
        {item.photo && !imgError ? (
          <Image source={{ uri: item.photo }} style={s.avatarImg} onError={() => setImgError(true)} />
        ) : (
          <Text style={s.avatarText}>{item.emoji || item.initial}</Text>
        )}
      </View>
      <View style={s.friendInfo}>
        <Text style={s.friendName}>{item.name}</Text>
        <Text style={s.friendUsername}>@{item.username}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <GlobeIcon size={12} color="#A1A1B0" />
          <Text style={s.friendCountries}>
            {item.countries > 0 ? t('friends.countriesVisitedN', { count: item.countries }) : t('friends.noVisitRecord')}
            {item.followers ? ` · ${t('friends.followers')} ${item.followers}` : ''}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={[s.followBtn, (following || requested) && s.followingBtn]}
        onPress={(e) => { e.stopPropagation?.(); onToggle(); }}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={following ? t('friends.unfollowNameA11y', { name: item.name }) : t('friends.followNameA11y', { name: item.name })}
      >
        <Text style={[s.followBtnText, (following || requested) && s.followingBtnText]}>
          {following
            ? t('friends.followingTitle')
            : requested
              ? t('friends.requested')
              : t('friends.follow')}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────
// 메인 화면
// ─────────────────────────────────────────────
type Props = RootStackScreenProps<'FriendSearch'>;

export default function FriendSearchScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { handle, isPremium, qrDesign, setQrDesign } = useSettings();
  const [query, setQuery] = useState(route.params?.initialQuery ?? '');

  // 개별 QR 디자인(프리미엄) — 프리셋 선택 모달
  const [qrDesignVisible, setQrDesignVisible] = useState(false);
  const myQrDesign = getQrDesign(qrDesign);
  const openQrDesign = () => {
    if (!isPremium) {
      navigation.navigate('Premium'); // 잠금 → 페이월로 유도
      return;
    }
    setQrDesignVisible(true);
  };

  // 딥링크(eorth://user/<handle>)로 진입/재진입 시 검색어 자동 채움
  // ts를 의존성에 포함해 같은 핸들로 다시 들어와도(파라미터 값 동일) 재채움되게 함
  useEffect(() => {
    const q = route.params?.initialQuery;
    if (q) setQuery(q);
  }, [route.params?.initialQuery, route.params?.ts]);
  // 팔로우 상태는 store 공유 — 친구 프로필·팔로잉 목록·프로필 카운트와 동기화
  const { records, followingUsers, followUser, unfollowUser, isBlocked, requestFollow, cancelFollowRequest, isFollowRequested } = useRecords();
  // 내 방문 국가 수 (ProfileScreen과 동일한 통계 계산 사용)
  const myCountryCount = useMemo(() => computeTravelStats(records).countryCount, [records]);
  const [searching, setSearching] = useState(false); // 원격 검색 진행 중
  // 본인 제외용 (원격 검색 결과) — state로 두어 id 로드 완료 시 필터가 재실행되게 함
  const [myId, setMyId] = useState<string | null>(null);

  // 팔로우/검색 피드백 토스트
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(msg);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2000);
  };
  // 언마운트 시 토스트 타이머 정리 (사라진 화면에서 setState 방지)
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // ── 진입/퇴장 애니메이션 ──
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleGoBack = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 40, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      navigation.goBack();
    });
  }, [navigation]);

  // 팔로우/언팔 시 목록에 표시된 팔로워 수 낙관적 반영 (서버 재조회 없이 ±1)
  const bumpFollowerCount = (id: string, delta: number) => {
    const adjust = (list: ContactFriend[]) =>
      list.map((f) => (f.id === id ? { ...f, followers: Math.max(0, (f.followers ?? 0) + delta) } : f));
    setRemoteResults(adjust);
    setSuggestions(adjust);
  };

  const toggleFollow = (friend: ContactFriend) => {
    buzz('light');
    // id 우선 매칭 — 핸들(username)이 빈 유저끼리 서로 같다고 오판되는 문제 방지
    const followed = followingUsers.find((f) => (f.id ? f.id === friend.id : f.username === friend.username));
    if (followed) {
      unfollowUser(followed.id || followed.username);
      bumpFollowerCount(friend.id, -1);
      showToast(t('comp2.toastUnfollowed', { name: friend.name }));
    } else if (friend.isPrivate) {
      // 비공개 계정: 팔로우 요청 보내기 ↔ 요청 취소
      if (isFollowRequested(friend.id)) {
        cancelFollowRequest(friend.id);
        showToast(t('friends.requestCanceledToast'));
      } else {
        requestFollow(friend.id);
        showToast(t('friends.requestSentToast', { name: friend.name }));
      }
    } else {
      followUser({
        id: friend.id,
        username: friend.username,
        isAbroad: false,
        currentCountry: null,
        currentCountryFlag: null,
      });
      bumpFollowerCount(friend.id, +1);
      showToast(t('comp2.toastFollowed', { name: friend.name }));
    }
  };

  // ── QR 스캔 ──
  const [scannerVisible, setScannerVisible] = useState(false);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const scannedRef = useRef(false);
  const lastInvalidToast = useRef(0);

  // 내 코드(공유/QR용) — 반드시 고유 식별자인 핸들만 사용(닉네임은 고유성이 없어 스캔 시 오검색)
  const myCode = handle;

  const openScanner = async () => {
    if (!camPermission?.granted) {
      const res = await requestCamPermission();
      if (!res.granted) { showPermissionDeniedAlert(t('permission.camera')); return; }
    }
    scannedRef.current = false;
    setScannerVisible(true);
  };

  const handleBarcode = ({ data }: { data: string }) => {
    if (scannedRef.current) return;
    const m = USER_LINK_RE.exec((data || '').trim());
    if (!m) {
      // eOrth 코드가 아니면 계속 스캔하되, 안내는 2초에 한 번만 (연속 스캔 스팸 방지)
      const now = Date.now();
      if (now - lastInvalidToast.current > 2000) {
        lastInvalidToast.current = now;
        showToast(t('comp2.toastNotEorthQR'));
      }
      return;
    }
    const scanned = decodeURIComponent(m[1]).replace(/^@/, '');
    // 본인 QR이면 검색하지 않고 계속 스캔(스캔하면 본인이 결과에서 빠져 "결과 없음"만 뜨던 문제 방지)
    if (handle && scanned.toLowerCase() === handle.toLowerCase()) {
      const now = Date.now();
      if (now - lastInvalidToast.current > 2000) {
        lastInvalidToast.current = now;
        showToast(t('friends.ownCode'));
      }
      return;
    }
    scannedRef.current = true;
    setScannerVisible(false);
    // 정확 일치 프로필이 있으면 프로필로 직행, 없으면(미설정 포함) 검색으로 폴백
    if (isSupabaseConfigured) {
      showToast(t('comp2.toastSearching', { handle: scanned }));
      getProfileByHandle(scanned)
        .then((p) => {
          if (p) {
            navigation.navigate('FriendProfile', { userId: p.id, username: p.handle || scanned, handle: p.handle ?? undefined });
          } else {
            setQuery(scanned); // 정확 일치 없음 → 부분 일치 검색 결과 표시
          }
        })
        .catch(() => setQuery(scanned));
    } else {
      setQuery(scanned);
      showToast(t('comp2.toastSearching', { handle: scanned }));
    }
  };

  // ── 내 코드 공유 ──
  const handleShareMe = () => {
    if (!myCode) { showToast(t('friends.setProfileFirst')); return; }
    Share.share({
      message: t('comp2.shareMeMessage', { link: userLink(myCode) }),
    }).catch(() => {});
  };

  // 추천 친구 (내가 팔로우한 사람들이 팔로우하는 사용자) — 진입 시 1회 로드
  const [suggestions, setSuggestions] = useState<ContactFriend[]>([]);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    (async () => {
      try {
        const rows = await fetchFriendSuggestions(10);
        if (!alive || rows.length === 0) return;
        const ids = rows.map((r) => r.id);
        const [counts, fcounts] = await Promise.all([getCountryCounts(ids), getFollowerCounts(ids)]);
        if (!alive) return;
        setSuggestions(
          rows.map((r) => ({
            id: r.id,
            name: r.handle || t('friends.travelerDefault'),
            initial: (r.handle || '?').slice(0, 1),
            username: r.handle || '',
            countries: counts[r.id] ?? 0,
            followers: fcounts[r.id] ?? 0,
            photo: r.profilePhoto,
            emoji: r.emoji,
            isPrivate: r.isPrivate,
          }))
        );
      } catch {
        /* 추천은 부가 기능 — 실패 시 섹션 미표시 */
      }
    })();
    return () => { alive = false; };
  }, []);

  // 백엔드 사용자 검색 (아이디/핸들) — 실제 테스터 찾기
  const [remoteResults, setRemoteResults] = useState<ContactFriend[]>([]);
  const [searchError, setSearchError] = useState(false); // 검색 실패 ↔ 결과 없음 구분
  useEffect(() => { getMyUserId().then(setMyId); }, []);
  useEffect(() => {
    const q = query.trim();
    if (!isSupabaseConfigured || q.length === 0) { setRemoteResults([]); setSearching(false); setSearchError(false); return; }
    let alive = true;
    setSearching(true);
    setSearchError(false);
    const timer = setTimeout(async () => {
      try {
        const rows = await searchProfiles(q);
        if (!alive) return;
        const others = rows.filter((p) => p.id !== myId);
        // 방문 국가 수·팔로워 수 일괄 조회 후 병합 (실패해도 0으로 처리)
        const ids = others.map((p) => p.id);
        const [counts, fcounts] = await Promise.all([getCountryCounts(ids), getFollowerCounts(ids)]);
        if (!alive) return;
        setRemoteResults(
          others.map((p) => ({
            id: p.id,
            name: p.handle || t('friends.travelerDefault'),
            initial: (p.handle || '?').slice(0, 1),
            username: p.handle || '',
            countries: counts[p.id] ?? 0,
            followers: fcounts[p.id] ?? 0,
            photo: p.profile_photo,
            emoji: p.emoji,
            isPrivate: !!p.is_private,
          }))
        );
      } catch {
        if (alive) { setRemoteResults([]); setSearchError(true); } // 검색 실패 시 이전 결과 잔류 방지 + 에러 표시
      } finally {
        if (alive) setSearching(false);
      }
    }, 300); // 디바운스
    return () => { alive = false; clearTimeout(timer); };
  }, [query, myId]);

  const isSearching = query.trim().length > 0;
  // 차단한 사용자는 검색·추천 결과에서 제외 (노출·재팔로우 방지)
  const notBlocked = (f: ContactFriend) => !isBlocked({ name: f.name, handle: f.username });
  const displayList = remoteResults.filter(notBlocked);
  // 추천 친구 (팔로우한 뒤에도 '팔로잉' 상태로 남겨 되돌리기 가능)
  const visibleSuggestions = suggestions.filter(notBlocked);

  // 친구 행 렌더(검색결과·추천 친구 공통) — 중복 제거
  const renderRows = (list: ContactFriend[]) =>
    list.map((item, idx) => (
      <React.Fragment key={item.id}>
        <FriendItem
          item={item}
          following={followingUsers.some((f) => (f.id ? f.id === item.id : f.username === item.username))}
          requested={isFollowRequested(item.id)}
          onToggle={() => toggleFollow(item)}
          onPress={() => navigation.navigate('FriendProfile', { userId: item.id, username: item.username })}
        />
        {idx < list.length - 1 && <View style={s.divider} />}
      </React.Fragment>
    ));

  return (
    <View style={s.container}>
      {/* ── 헤더 ── */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={s.backBtn} onPress={handleGoBack} accessibilityRole="button" accessibilityLabel={t('friends.back')}>
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('friends.searchTitle')}</Text>
        <View style={s.backBtn} />
      </View>

      <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

      {/* ── QR 카드 ── */}
      <View style={s.qrCard}>
        <View style={s.qrCardTop}>
          {/* 왼쪽: QR 코드 — 핸들(아이디) 있을 때만 실제 코드 표시 */}
          <View style={s.qrCodeWrap}>
            {myCode ? (
              <>
                <QRCode
                  value={userLink(myCode)}
                  size={120}
                  color={myQrDesign.fg}
                  backgroundColor={myQrDesign.bg}
                  enableLinearGradient={!!myQrDesign.gradient}
                  linearGradient={myQrDesign.gradient}
                  logo={undefined}
                />
                <View style={[s.qrLogoWrap, { backgroundColor: myQrDesign.bg }]}>
                  <Text style={[s.qrLogoText, myQrDesign.light && s.qrLogoTextDark]}>eOrth</Text>
                </View>
                {/* 개별 QR 디자인(프리미엄) — 프리셋 선택 */}
                <TouchableOpacity
                  style={s.qrDesignBtn}
                  activeOpacity={0.8}
                  onPress={openQrDesign}
                  accessibilityRole="button"
                  accessibilityLabel={t('friends.qrDesignA11y')}
                >
                  <Text style={s.qrDesignBtnTxt}>{isPremium ? '🎨' : '🔒'}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={s.qrPlaceholder}>
                <Text style={s.qrPlaceholderText}>{t('friends.qrHint')}</Text>
              </View>
            )}
          </View>

          {/* 오른쪽: 프로필 정보 */}
          <View style={s.profileInfo}>
            <Text style={s.profileName} numberOfLines={1}>{handle}</Text>
            <Text style={s.profileUsername} numberOfLines={1}>@{handle}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><GlobeIcon size={12} color="#A1A1B0" /><Text style={s.profileCountries}>{t('friends.countriesVisitedN', { count: myCountryCount })}</Text></View>
          </View>
        </View>

        {/* 액션 버튼 — 카드 하단 전체 폭 */}
        <View style={s.qrBtnRow}>
          <TouchableOpacity
            style={s.inlineScanBtn}
            activeOpacity={0.85}
            onPress={openScanner}
            accessibilityRole="button"
            accessibilityLabel={t('comp2.qrScanA11y')}
          >
            <Text style={s.inlineScanBtnText}>📷 {t('comp2.qrScan')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.inlineShareBtn, !myCode && s.inlineBtnDisabled]}
            activeOpacity={0.85}
            onPress={handleShareMe}
            disabled={!myCode}
            accessibilityRole="button"
            accessibilityLabel={t('friends.shareCodeA11y')}
          >
            <Text style={s.inlineShareBtnText}>↗ {t('comp2.shareShort')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 검색창 ── */}
      <View style={s.searchWrap}>
        <SearchIcon size={16} color="#A1A1B0" />
        <TextInput
          style={s.searchInput}
          placeholder={t('friends.nameOrIdPlaceholder')}
          placeholderTextColor={C.dim}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel={t('friends.nameOrIdA11y')}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t('friends.clearSearchA11y')}>
            <Text style={s.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── 친구 리스트 ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {isSearching ? (
          /* 검색 결과 (아이디/핸들) */
          <>
            <Text style={s.sectionLabel}>{t('friends.searchResults')}</Text>
            {searching ? (
              <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
            ) : searchError ? (
              <Text style={s.emptyText}>{t('friends.searchError')}</Text>
            ) : displayList.length === 0 ? (
              <Text style={s.emptyText}>{t('friends.noResultSearch')}</Text>
            ) : (
              renderRows(displayList)
            )}
          </>
        ) : visibleSuggestions.length > 0 ? (
          /* 추천 친구 — 내가 팔로우한 사람들이 팔로우하는 사용자 */
          <>
            <Text style={s.sectionLabel}>{t('friends.suggestedFriends')}</Text>
            {renderRows(visibleSuggestions)}
          </>
        ) : (
          /* 추천이 없을 때 — 검색/QR 안내 */
          <Text style={s.emptyText}>{t('friends.findByIdHint')}</Text>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      </Animated.View>

      {/* QR 스캔 모달 */}
      <Modal visible={scannerVisible} animationType="slide" onRequestClose={() => setScannerVisible(false)}>
        <View style={s.scanRoot} accessibilityViewIsModal>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleBarcode}
          />
          {/* 가이드 프레임 */}
          <View style={s.scanOverlay} pointerEvents="none">
            <View style={s.scanFrame} />
            <Text style={s.scanHint}>{t('friends.scanHint')}</Text>
          </View>
          <TouchableOpacity
            style={[s.scanClose, { top: insets.top + 12 }]}
            onPress={() => setScannerVisible(false)}
            accessibilityRole="button"
            accessibilityLabel={t('comp2.qrScanCloseA11y')}
          >
            <Text style={s.scanCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* 개별 QR 디자인 선택 모달 (프리미엄) — 프리셋별 실제 QR 미리보기 */}
      <Modal
        visible={qrDesignVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setQrDesignVisible(false)}
      >
        <Pressable style={s.qdOverlay} onPress={() => setQrDesignVisible(false)}>
          <Pressable style={s.qdCard} onPress={() => {}}>
            <Text style={s.qdTitle}>{t('friends.qrDesignTitle')}</Text>
            <View style={s.qdGrid}>
              {QR_DESIGNS.map((d) => {
                const selected = qrDesign === d.id;
                return (
                  <TouchableOpacity
                    key={d.id}
                    style={[s.qdItem, selected && s.qdItemOn]}
                    activeOpacity={0.8}
                    onPress={() => { setQrDesign(d.id); setQrDesignVisible(false); }}
                  >
                    <View style={[s.qdPreview, { backgroundColor: d.bg }]}>
                      <QRCode
                        value={myCode ? userLink(myCode) : 'eorth'}
                        size={52}
                        color={d.fg}
                        backgroundColor={d.bg}
                        enableLinearGradient={!!d.gradient}
                        linearGradient={d.gradient}
                      />
                    </View>
                    <Text style={[s.qdLabel, selected && s.qdLabelOn]} numberOfLines={1}>{t(d.labelKey)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={s.qdClose} activeOpacity={0.7} onPress={() => setQrDesignVisible(false)}>
              <Text style={s.qdCloseTxt}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 팔로우/검색 피드백 토스트 */}
      <Toast visible={toastVisible} message={toastMessage} />
    </View>
  );
}

// ─────────────────────────────────────────────
// 스타일
// ─────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // 헤더
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 40,
    alignItems: 'center',
  },
  backIcon: {
    fontSize: 32,
    color: C.white,
    lineHeight: 36,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.white,
  },

  // QR 카드
  qrCard: {
    backgroundColor: C.qrCard,
    borderRadius: 20,
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 20,
    gap: 16,
  },
  qrCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  qrCodeWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.25)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  qrPlaceholderText: {
    fontSize: 13,
    color: C.dim,
    textAlign: 'center',
    lineHeight: 18,
  },
  qrLogoWrap: {
    position: 'absolute',
    backgroundColor: '#0A0A0F',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  qrLogoText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.white,
  },
  qrLogoTextDark: { color: '#0A0A0F' }, // 밝은 배경(클래식) 디자인용
  qrDesignBtn: {
    position: 'absolute',
    right: -10,
    bottom: -10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrDesignBtnTxt: { fontSize: 14 },

  // 개별 QR 디자인 선택 모달
  qdOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10,10,15,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  qdCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#2E2E3B',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.3)',
  },
  qdTitle: { fontSize: 16, fontWeight: '700', color: C.white, marginBottom: 14 },
  qdGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  qdItem: {
    width: 90,
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  qdItemOn: { borderColor: C.accent, backgroundColor: 'rgba(191,133,252,0.12)' },
  qdPreview: {
    width: 64,
    height: 64,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  qdLabel: { fontSize: 10, color: C.dim },
  qdLabelOn: { color: C.accent, fontWeight: '700' },
  qdClose: {
    marginTop: 14,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  qdCloseTxt: { fontSize: 14, fontWeight: '600', color: C.dim },
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: C.white,
  },
  profileUsername: {
    fontSize: 14,
    color: C.accent,
  },
  profileCountries: {
    fontSize: 12,
    color: C.dim,
  },
  qrBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inlineScanBtn: {
    flex: 1,
    backgroundColor: C.accentDark,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  inlineScanBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.white,
  },
  inlineShareBtn: {
    flex: 1,
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.3)',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  inlineShareBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.accent,
  },
  inlineBtnDisabled: {
    opacity: 0.4,
  },

  // QR 스캔 모달
  scanRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 240,
    height: 240,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: C.accent,
    backgroundColor: 'transparent',
  },
  scanHint: {
    marginTop: 20,
    fontSize: 14,
    color: C.white,
    fontWeight: '600',
    textAlign: 'center',
  },
  scanClose: {
    position: 'absolute',
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanCloseText: {
    fontSize: 20,
    color: C.white,
  },

  // 검색창
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: C.white,
    padding: 0,
  },
  clearBtn: {
    fontSize: 14,
    color: C.dim,
    paddingHorizontal: 4,
  },

  // 스크롤
  scrollContent: {
    paddingHorizontal: 20,
  },

  // 섹션 라벨
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.accent,
    marginBottom: 12,
  },

  // 친구 아이템
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: C.white,
  },
  avatarImg: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  friendInfo: {
    flex: 1,
    gap: 2,
  },
  friendUsername: {
    fontSize: 14,
    fontWeight: '700',
    color: C.accent,
  },
  friendName: {
    fontSize: 15,
    fontWeight: '600',
    color: C.white,
  },
  friendCountries: {
    fontSize: 12,
    color: '#A1A1B0',
    marginTop: 2,
  },

  // 팔로우 버튼
  followBtn: {
    backgroundColor: C.accentDark,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  followingBtn: {
    backgroundColor: C.gray,
  },
  followBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.white,
  },
  followingBtnText: {
    color: C.dim,
  },

  // 구분선
  divider: {
    height: 1,
    backgroundColor: C.divider,
    marginLeft: 58,
  },

  // 빈 상태
  emptyText: {
    fontSize: 14,
    color: C.dim,
    textAlign: 'center',
    marginTop: 40,
  },
});
