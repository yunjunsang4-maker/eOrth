import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  Share,
} from 'react-native';

import { useTranslation } from 'react-i18next';
import { GlobeIcon, SearchIcon, PersonIcon } from '../components/icons';
import { useSkinAccent } from '../constants/skinTheme';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { andFitText } from '../utils/fitText';
import { countryLabel } from '../utils/countryLabel';
import { isSupabaseConfigured } from '../services/supabase';
import { searchProfiles, getMyUserId, getCountryCounts, getFollowerCounts } from '../services/profile';
import { fetchFriendSuggestions } from '../services/social';
import { buzz } from '../utils/haptics';
import Toast from '../components/Toast';
import type { RootStackScreenProps } from '../navigation/types';

// ─────────────────────────────────────────────
// 디자인 토큰
// ─────────────────────────────────────────────
const C = {
  bg: '#0A0A0F',
  card: '#2E2E3B',
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

// ─────────────────────────────────────────────
// 검색/추천 결과 메이트 타입
// ─────────────────────────────────────────────
interface ContactFriend {
  id: string;
  name: string;
  initial: string;
  username: string;
  countries: number;
  followers?: number;     // 메이트 수
  photo?: string | null; // 프로필 사진 URL (있으면 아바타로 표시)
  emoji?: string | null;  // 프로필 이모지 (사진 없을 때)
  sharedCount?: number;       // 여행겹침 행일 때만
  sharedCountries?: string[]; // 겹친 나라 샘플(한글 country_name)
}

// ─────────────────────────────────────────────
// 메이트 아이템 (검색 결과·추천 메이트 공통)
// ─────────────────────────────────────────────
function FriendItem({
  item,
  following,
  requested,
  onToggle,
  onPress,
}: {
  item: ContactFriend;
  following: boolean; // 이미 메이트(서로메이트) 상태
  requested: boolean; // 메이트 신청을 보내고 수락 대기 중인 상태
  onToggle: () => void;
  onPress?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const skinAccent = useSkinAccent(); // 아이디·팔로우 버튼을 스킨 강조색으로
  // 사진 로드 실패 시 이니셜/이모지로 회귀 (깨진 이미지 방지)
  const [imgError, setImgError] = useState(false);
  return (
    <TouchableOpacity style={s.friendItem} onPress={onPress} activeOpacity={0.75}>
      <View style={s.avatar}>
        {item.photo && !imgError ? (
          <Image source={{ uri: item.photo }} style={s.avatarImg} onError={() => setImgError(true)} />
        ) : (
          <PersonIcon size={24} color="#A0A0B0" />
        )}
      </View>
      <View style={s.friendInfo}>
        {/* 닉네임 폐지 — 아이디 한 줄만 표시(@ 접두 없음) */}
        <Text style={[s.friendUsername, { color: skinAccent.accent }]}>{item.username}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <GlobeIcon size={12} color="#A1A1B0" />
          <Text style={s.friendCountries} {...andFitText}>
            {item.sharedCountries && item.sharedCountries.length > 0
              ? `${t('friends.overlapReason', { count: item.sharedCount ?? item.sharedCountries.length })} · ${item.sharedCountries.map((c) => countryLabel(c, i18n.language)).join(' · ')}`
              : (
                  <>
                    {item.countries > 0 ? t('friends.countriesVisitedN', { count: item.countries }) : t('friends.noVisitRecord')}
                    {item.followers ? ` · ${t('friends.followers')} ${item.followers}` : ''}
                  </>
                )}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={[s.followBtn, !(following || requested) && { backgroundColor: skinAccent.accentDeep }, (following || requested) && s.followingBtn]}
        onPress={(e) => { e.stopPropagation?.(); onToggle(); }}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={following ? t('friends.neighborActive') : t('friends.neighborRequest')}
      >
        <Text style={[s.followBtnText, (following || requested) && s.followingBtnText]}>
          {following
            ? t('friends.neighborActive')
            : requested
              ? t('friends.neighborRequested')
              : t('friends.neighborRequest')}
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
  const skinAccent = useSkinAccent(); // 검색 결과·버튼을 스킨 강조색으로
  const insets = useSafeAreaInsets();
  const { handle } = useSettings();
  const [query, setQuery] = useState(route.params?.initialQuery ?? '');

  // 딥링크(eorth://user/<handle>)로 진입/재진입 시 검색어 자동 채움
  // ts를 의존성에 포함해 같은 핸들로 다시 들어와도(파라미터 값 동일) 재채움되게 함
  useEffect(() => {
    const q = route.params?.initialQuery;
    if (q) setQuery(q);
  }, [route.params?.initialQuery, route.params?.ts]);
  // 메이트 상태는 store 공유 — 메이트 프로필·메이트 목록·프로필 카운트와 동기화
  const { requestNeighbor, cancelNeighborRequest, removeNeighbor, isNeighbor, isNeighborRequested, isBlocked } = useRecords();
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

  // 메이트 해제 시 목록에 표시된 메이트 수 낙관적 반영 (서버 재조회 없이 ±1)
  // 신청은 수락 전까지 pending이라 카운트는 건드리지 않고, 해제(-1)만 반영한다.
  const bumpFollowerCount = (id: string, delta: number) => {
    const adjust = (list: ContactFriend[]) =>
      list.map((f) => (f.id === id ? { ...f, followers: Math.max(0, (f.followers ?? 0) + delta) } : f));
    setRemoteResults(adjust);
    setSuggestions(adjust);
  };

  const onNeighborToggle = (friend: ContactFriend) => {
    buzz('light');
    if (isNeighbor(friend.id)) {
      removeNeighbor(friend.id);
      bumpFollowerCount(friend.id, -1);
      showToast(t('comp2.toastNeighborRemoved', { name: friend.name }));
    } else if (isNeighborRequested(friend.id)) {
      cancelNeighborRequest(friend.id);
      showToast(t('comp2.toastNeighborRequestCanceled', { name: friend.name }));
    } else {
      requestNeighbor(friend.id);
      showToast(t('comp2.toastNeighborRequested', { name: friend.name }));
    }
  };

  // 내 코드(공유용) — 반드시 고유 식별자인 핸들만 사용
  const myCode = handle;

  // ── 내 코드 공유 ──
  // 현재 미사용(QR 카드 제거로 호출부 사라짐) — 발견 허브 초대 카드가 곧 호출 예정, lint 정리 금지
  const handleShareMe = () => {
    if (!myCode) { showToast(t('friends.setProfileFirst')); return; }
    Share.share({
      message: t('comp2.shareMeMessage', { link: userLink(myCode) }),
    }).catch(() => {});
  };

  // 추천 메이트 (내가 팔로우한 사람들이 팔로우하는 사용자) — 진입 시 1회 로드
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
  // 추천 메이트 (팔로우한 뒤에도 '팔로잉' 상태로 남겨 되돌리기 가능)
  const visibleSuggestions = suggestions.filter(notBlocked);

  // 메이트 행 렌더(검색결과·추천 메이트 공통) — 중복 제거
  const renderRows = (list: ContactFriend[]) =>
    list.map((item, idx) => (
      <React.Fragment key={item.id}>
        <FriendItem
          item={item}
          following={isNeighbor(item.id)}
          requested={isNeighborRequested(item.id)}
          onToggle={() => onNeighborToggle(item)}
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

      {/* ── 메이트 리스트 ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {isSearching ? (
          /* 검색 결과 (아이디/핸들) */
          <>
            <Text style={[s.sectionLabel, { color: skinAccent.accent }]}>{t('friends.searchResults')}</Text>
            {searching ? (
              <ActivityIndicator color={skinAccent.accent} style={{ marginTop: 40 }} />
            ) : searchError ? (
              <Text style={s.emptyText}>{t('friends.searchError')}</Text>
            ) : displayList.length === 0 ? (
              <Text style={s.emptyText}>{t('friends.noResultSearch')}</Text>
            ) : (
              renderRows(displayList)
            )}
          </>
        ) : visibleSuggestions.length > 0 ? (
          /* 추천 메이트 — 내가 팔로우한 사람들이 팔로우하는 사용자 */
          <>
            <Text style={[s.sectionLabel, { color: skinAccent.accent }]}>{t('friends.suggestedFriends')}</Text>
            {renderRows(visibleSuggestions)}
          </>
        ) : (
          /* 추천이 없을 때 — 아이디 검색 안내 */
          <Text style={s.emptyText}>{t('friends.findByIdHint')}</Text>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      </Animated.View>

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

  // 메이트 아이템
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
    backgroundColor: '#1F1F22',
    alignItems: 'center',
    justifyContent: 'center',
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
