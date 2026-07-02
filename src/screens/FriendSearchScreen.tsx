import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts';
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
  RefreshControl,
  Platform,
  Linking,
} from 'react-native';

import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';
import { GlobeIcon, SearchIcon } from '../components/icons';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { showPermissionDeniedAlert } from '../utils/permissionAlert';
import { isSupabaseConfigured } from '../services/supabase';
import { searchProfiles, getMyUserId, getCountryCounts, getFollowerCounts, findUsersByPhones, getProfileByHandle, phoneHash } from '../services/profile';
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

// 미가입 연락처 초대 링크 — 플레이스홀더. 스토어 출시(또는 Play 내부테스트/TestFlight 배포) 시
// 실제 URL로 교체하면 초대 메시지에 자동으로 붙는다. 비어 있으면 핸들 안내만 전송.
const INVITE_URL = '';

// ─────────────────────────────────────────────
// 연락처 기반 추천 친구 타입
// ─────────────────────────────────────────────
interface ContactFriend {
  id: string;
  name: string;
  phone: string;
  initial: string;
  username: string;
  countries: number;
  followers?: number;     // 팔로워 수
  photo?: string | null; // 프로필 사진 URL (있으면 아바타로 표시)
  emoji?: string | null;  // 프로필 이모지 (사진 없을 때)
}


// ─────────────────────────────────────────────
// 미가입 연락처(초대 대상) — 기기 로컬에서만 사용, 서버 전송 없음
// ─────────────────────────────────────────────
interface InviteContact {
  key: string;     // 전화번호 해시 (중복 제거용)
  name: string;
  phone: string;
  initial: string;
}

// 미가입 연락처 초대 행 — 이름·번호 + 초대 버튼(시스템 공유 시트)
function InviteItem({ item, onInvite }: { item: InviteContact; onInvite: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={s.friendItem}>
      <View style={[s.avatar, s.inviteAvatar]}>
        <Text style={s.avatarText}>{item.initial}</Text>
      </View>
      <View style={s.friendInfo}>
        <Text style={s.friendName}>{item.name}</Text>
        <Text style={s.invitePhone}>{item.phone}</Text>
      </View>
      <TouchableOpacity
        style={s.inviteBtn}
        onPress={onInvite}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t('friends.inviteNameA11y', { name: item.name })}
      >
        <Text style={s.inviteBtnText}>{t('friends.inviteBtn')}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────────
// 가입된 연락처 친구 아이템
// ─────────────────────────────────────────────
function FriendItem({
  item,
  following,
  onToggle,
  onPress,
}: {
  item: ContactFriend;
  following: boolean;
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
        style={[s.followBtn, following && s.followingBtn]}
        onPress={(e) => { e.stopPropagation?.(); onToggle(); }}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={following ? t('friends.unfollowNameA11y', { name: item.name }) : t('friends.followNameA11y', { name: item.name })}
      >
        <Text style={[s.followBtnText, following && s.followingBtnText]}>
          {following ? t('friends.followingTitle') : t('friends.follow')}
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
  const { handle, phoneMatchConsent } = useSettings();
  const [query, setQuery] = useState(route.params?.initialQuery ?? '');

  // 딥링크(eorth://user/<handle>)로 진입/재진입 시 검색어 자동 채움
  // ts를 의존성에 포함해 같은 핸들로 다시 들어와도(파라미터 값 동일) 재채움되게 함
  useEffect(() => {
    const q = route.params?.initialQuery;
    if (q) setQuery(q);
  }, [route.params?.initialQuery, route.params?.ts]);
  const [contactFriends, setContactFriends] = useState<ContactFriend[]>([]);
  // 미가입 연락처(초대 대상) — 로컬 표시 전용. 처음 10명 + 더보기로 렌더 부담 제한
  const [inviteContacts, setInviteContacts] = useState<InviteContact[]>([]);
  const [inviteShown, setInviteShown] = useState(10);
  // 팔로우 상태는 store 공유 — 친구 프로필·팔로잉 목록·프로필 카운트와 동기화
  const { records, followingUsers, followUser, unfollowUser, isBlocked } = useRecords();
  // 내 방문 국가 수 (ProfileScreen과 동일한 통계 계산 사용)
  const myCountryCount = useMemo(() => computeTravelStats(records).countryCount, [records]);
  const [contactsPermission, setContactsPermission] = useState<'granted' | 'denied' | 'pending'>('pending');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false); // 원격 검색 진행 중
  // 본인 제외용 (원격 검색 결과) — state로 두어 id 로드 완료 시 필터가 재실행되게 함
  // (연락처 매칭은 fetchContactsData 안에서 getMyUserId를 직접 조회)
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

  // 실제 연락처를 읽어 전화번호 해시로 가입자 매칭 (권한 granted + 동의 상태에서만 호출)
  const fetchContactsData = useCallback(async () => {
    try {
      // myId state를 기다리지 않고 직접 조회 — state 로드 전 실행돼 본인이 결과에 섞이거나
      // myId 도착 후 연락처 읽기+RPC가 통째로 재실행되던 문제 방지
      const uid = await getMyUserId();
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
        sort: Contacts.SortTypes.LastName,
      });
      // 한 연락처의 여러 번호도 모두 매칭 대상으로 펼침
      const rawContacts: { name: string; phone: string }[] = [];
      data.forEach((c) => {
        if (!c.name || !c.phoneNumbers) return;
        c.phoneNumbers.forEach((p) => {
          if (p.number) rawContacts.push({ name: c.name!, phone: p.number });
        });
      });
      const all = await findUsersByPhones(rawContacts);
      const matches = all.filter((m) => m.id !== uid); // 내 번호가 연락처에 있어도 나 자신은 제외

      // 미가입 연락처 분리 — 가입자로 매칭되지 않은 번호(해시 기준 중복 제거, 유효 번호만)
      const matchedHashes = new Set(all.map((m) => m.phoneHash));
      const seen = new Set<string>();
      const invites: InviteContact[] = [];
      rawContacts.forEach((c) => {
        const h = phoneHash(c.phone);
        if (!h || matchedHashes.has(h) || seen.has(h)) return;
        seen.add(h);
        invites.push({ key: h, name: c.name, phone: c.phone, initial: (c.name || '?').slice(0, 1) });
      });
      setInviteContacts(invites);

      const ids = matches.map((m) => m.id);
      const [counts, fcounts] = await Promise.all([getCountryCounts(ids), getFollowerCounts(ids)]);
      setContactFriends(
        matches.map((m) => ({
          id: m.id,
          name: m.contactName,
          phone: '',
          initial: (m.contactName || '?').slice(0, 1),
          username: m.handle || '',
          countries: counts[m.id] ?? 0,
          followers: fcounts[m.id] ?? 0,
          photo: m.profile_photo,
          emoji: m.emoji,
        }))
      );
    } catch {
      setContactFriends([]);
      setInviteContacts([]);
    }
  }, []);

  // 진입 시: 동의했을 때만 연락처 권한 상태 확인(설명 없는 자동 팝업 방지)
  useEffect(() => {
    (async () => {
      try {
        if (!phoneMatchConsent) { setContactFriends([]); return; }
        const { status } = await Contacts.getPermissionsAsync();
        if (status === 'granted') {
          setContactsPermission('granted');
          await fetchContactsData();
        } else {
          setContactsPermission(status === 'denied' ? 'denied' : 'pending');
        }
      } catch {
        setContactsPermission('denied');
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchContactsData, phoneMatchConsent]);

  // 당겨서 새로고침 — 연락처 매칭 결과 다시 불러오기 (권한 granted + 동의 시에만 의미)
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    if (!phoneMatchConsent || contactsPermission !== 'granted') return;
    setRefreshing(true);
    try { await fetchContactsData(); } finally { setRefreshing(false); }
  }, [phoneMatchConsent, contactsPermission, fetchContactsData]);

  // 사용자가 직접 버튼을 눌렀을 때만 권한 요청
  const requestContacts = useCallback(async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status === 'granted') {
      setContactsPermission('granted');
      await fetchContactsData();
    } else {
      setContactsPermission('denied');
      showPermissionDeniedAlert(t('permission.contacts'));
    }
  }, [fetchContactsData, t]);

  // 팔로우/언팔 시 목록에 표시된 팔로워 수 낙관적 반영 (서버 재조회 없이 ±1)
  const bumpFollowerCount = (id: string, delta: number) => {
    const adjust = (list: ContactFriend[]) =>
      list.map((f) => (f.id === id ? { ...f, followers: Math.max(0, (f.followers ?? 0) + delta) } : f));
    setContactFriends(adjust);
    setRemoteResults(adjust);
  };

  const toggleFollow = (friend: ContactFriend) => {
    buzz('light');
    // id 우선 매칭 — 핸들(username)이 빈 유저끼리 서로 같다고 오판되는 문제 방지
    const followed = followingUsers.find((f) => (f.id ? f.id === friend.id : f.username === friend.username));
    if (followed) {
      unfollowUser(followed.id || followed.username);
      bumpFollowerCount(friend.id, -1);
      showToast(t('comp2.toastUnfollowed', { name: friend.name }));
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

  // ── 미가입 연락처 초대 — 해당 번호가 수신인으로 채워진 SMS 작성 화면을 연다.
  //    전송은 사용자가 직접(번호를 서버·외부로 보내지 않음). 실패 시 공유 시트 폴백.
  const handleInvite = (c: InviteContact) => {
    if (!myCode) { showToast(t('friends.setProfileFirst')); return; }
    const link = INVITE_URL ? `\n${INVITE_URL}` : '';
    const message = t('friends.inviteMessage', { handle: myCode, link });
    const sep = Platform.OS === 'ios' ? '&' : '?'; // iOS는 &body=, Android는 ?body=
    Linking.openURL(`sms:${c.phone}${sep}body=${encodeURIComponent(message)}`).catch(() => {
      Share.share({ message }).catch(() => {});
    });
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
            phone: '',
            initial: (r.handle || '?').slice(0, 1),
            username: r.handle || '',
            countries: counts[r.id] ?? 0,
            followers: fcounts[r.id] ?? 0,
            photo: r.profilePhoto,
            emoji: r.emoji,
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
            phone: '',
            initial: (p.handle || '?').slice(0, 1),
            username: p.handle || '',
            countries: counts[p.id] ?? 0,
            followers: fcounts[p.id] ?? 0,
            photo: p.profile_photo,
            emoji: p.emoji,
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
  // 연락처 목록을 보는 상태에서만 당겨서 새로고침 활성화(검색·권한/동의 화면에선 비활성)
  const canPullRefresh = !isSearching && phoneMatchConsent && contactsPermission === 'granted';
  // 차단한 사용자는 검색·연락처 결과에서 제외 (노출·재팔로우 방지)
  const notBlocked = (f: ContactFriend) => !isBlocked({ name: f.name, handle: f.username });
  const displayList = (isSearching
    ? (isSupabaseConfigured
        ? remoteResults
        : contactFriends.filter(f =>
            f.name.toLowerCase().includes(query.toLowerCase()) ||
            f.username.toLowerCase().includes(query.toLowerCase())
          ))
    : contactFriends
  ).filter(notBlocked);

  // 추천 친구 — 차단·연락처 매칭과 중복 제외 (팔로우한 뒤에도 '팔로잉' 상태로 남겨 되돌리기 가능)
  const contactIds = new Set(contactFriends.map((c) => c.id));
  const visibleSuggestions = suggestions.filter((f) => notBlocked(f) && !contactIds.has(f.id));

  // 검색 중에도 내 연락처 매칭을 함께 노출 (Supabase 모드에서만 — 미설정 모드는 검색결과 자체가 연락처라 중복)
  const remoteIds = new Set(remoteResults.map((r) => r.id));
  const contactMatches = isSearching && isSupabaseConfigured
    ? contactFriends.filter(f =>
        notBlocked(f) &&
        !remoteIds.has(f.id) &&
        (f.name.toLowerCase().includes(query.toLowerCase()) ||
         f.username.toLowerCase().includes(query.toLowerCase())))
    : [];

  // 검색 중에는 미가입 연락처도 이름으로 필터해 초대 섹션으로 노출 (최대 5명)
  const inviteMatches = isSearching
    ? inviteContacts.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5)
    : [];

  // 초대 행 렌더 (기본 목록·검색 필터 공통)
  const renderInviteRows = (list: InviteContact[]) =>
    list.map((c, idx) => (
      <React.Fragment key={c.key}>
        <InviteItem item={c} onInvite={() => handleInvite(c)} />
        {idx < list.length - 1 && <View style={s.divider} />}
      </React.Fragment>
    ));

  // 친구 행 렌더(검색결과·내 연락처·검색 중 연락처 공통) — 중복 제거
  const renderRows = (list: ContactFriend[]) =>
    list.map((item, idx) => (
      <React.Fragment key={item.id}>
        <FriendItem
          item={item}
          following={followingUsers.some((f) => (f.id ? f.id === item.id : f.username === item.username))}
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
                  color="#BF85FC"
                  backgroundColor="#0A0A0F"
                  logo={undefined}
                />
                <View style={s.qrLogoWrap}>
                  <Text style={s.qrLogoText}>eOrth</Text>
                </View>
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
        refreshControl={
          canPullRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.accent}
              colors={[C.accent]}
            />
          ) : undefined
        }
      >
        {isSearching ? (
          /* 검색 중에는 연락처 권한과 무관하게 검색 결과(아이디/핸들)를 보여준다 */
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

            {/* 검색 중에도 내 연락처에서 매칭되는 친구를 함께 노출 */}
            {contactMatches.length > 0 && (
              <>
                <Text style={[s.sectionLabel, { marginTop: 24 }]}>{t('friends.myContacts')}</Text>
                {renderRows(contactMatches)}
              </>
            )}

            {/* 검색어와 이름이 맞는 미가입 연락처 → 초대 */}
            {inviteMatches.length > 0 && (
              <>
                <Text style={[s.sectionLabel, { marginTop: 24 }]}>{t('friends.inviteSectionTitle')}</Text>
                {renderInviteRows(inviteMatches)}
              </>
            )}
          </>
        ) : loading ? (
          <Text style={s.emptyText}>{t('friends.findingContacts')}</Text>
        ) : !phoneMatchConsent ? (
          /* 전화번호 수집 동의 전 — 동의 화면으로 유도 */
          <View style={s.permissionCard}>
            <Text style={s.permissionEmoji}>📇</Text>
            <Text style={s.permissionTitle}>{t('friends.contactFindTitle')}</Text>
            <Text style={s.permissionDesc}>
              {t('friends.contactFindDesc')}
            </Text>
            <TouchableOpacity
              style={s.permissionBtn}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('PhoneConsent')}
              accessibilityRole="button"
              accessibilityLabel={t('friends.phoneFindSettingA11y')}
            >
              <Text style={s.permissionBtnText}>{t('friends.phoneFindBtn')}</Text>
            </TouchableOpacity>
          </View>
        ) : contactsPermission !== 'granted' ? (
          <View style={s.permissionCard}>
            <Text style={s.permissionEmoji}>📱</Text>
            <Text style={s.permissionTitle}>{t('friends.contactPermTitle')}</Text>
            <Text style={s.permissionDesc}>
              {t('friends.contactPermDesc')}
            </Text>
            <TouchableOpacity
              style={s.permissionBtn}
              activeOpacity={0.85}
              onPress={requestContacts}
              accessibilityRole="button"
              accessibilityLabel={t('friends.contactPermBtn')}
            >
              <Text style={s.permissionBtnText}>{t('friends.contactPermBtn')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={s.sectionLabel}>{t('friends.eorthUsersN', { count: displayList.length })}</Text>
            {displayList.length === 0 ? (
              <Text style={s.emptyText}>{t('friends.noContactFriends')}</Text>
            ) : (
              renderRows(displayList)
            )}

            {/* 미가입 연락처 초대 — 처음 10명 + 더보기 */}
            {inviteContacts.length > 0 && (
              <>
                <Text style={[s.sectionLabel, { marginTop: 24 }]}>{t('friends.inviteSectionTitle')}</Text>
                {renderInviteRows(inviteContacts.slice(0, inviteShown))}
                {inviteContacts.length > inviteShown && (
                  <TouchableOpacity
                    style={s.inviteMoreBtn}
                    onPress={() => setInviteShown((n) => n + 20)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t('friends.inviteMore', { count: inviteContacts.length - inviteShown })}
                  >
                    <Text style={s.inviteMoreText}>{t('friends.inviteMore', { count: inviteContacts.length - inviteShown })}</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </>
        )}

        {/* 추천 친구 — 검색 중이 아닐 때, 연락처 권한/동의 상태와 무관하게 표시 */}
        {!isSearching && !loading && visibleSuggestions.length > 0 && (
          <>
            <Text style={[s.sectionLabel, { marginTop: 24 }]}>{t('friends.suggestedFriends')}</Text>
            {renderRows(visibleSuggestions)}
          </>
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

  // 권한 요청 카드
  permissionCard: {
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 28,
    marginTop: 20,
  },
  permissionEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  permissionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.white,
    marginBottom: 8,
  },
  permissionDesc: {
    fontSize: 14,
    color: C.dim,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  permissionBtn: {
    backgroundColor: C.accentDark,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 28,
    width: '100%',
    alignItems: 'center',
  },
  permissionBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: C.white,
  },

  // 미가입 연락처 초대
  inviteAvatar: {
    backgroundColor: C.gray,
  },
  invitePhone: {
    fontSize: 12,
    color: C.dim,
    marginTop: 2,
  },
  inviteBtn: {
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.3)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  inviteBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.accent,
  },
  inviteMoreBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  inviteMoreText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.accent,
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
