import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Animated,
} from 'react-native';

import QRCode from 'react-native-qrcode-svg';
import { GlobeIcon, SearchIcon } from '../components/icons';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { showPermissionDeniedAlert } from '../utils/permissionAlert';
import { isSupabaseConfigured } from '../services/supabase';
import { searchProfiles, getMyUserId } from '../services/profile';
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
// 연락처 기반 추천 친구 타입
// ─────────────────────────────────────────────
interface ContactFriend {
  id: string;
  name: string;
  phone: string;
  initial: string;
  username: string;
  countries: number;
}

// ─────────────────────────────────────────────
// 가입 유저 조회 (서버 연동 전 목업)
// 실제 서비스에서는 전화번호 해시 목록을 서버에 보내고
// 가입된 유저 정보를 받아오는 API로 교체
// ─────────────────────────────────────────────
function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)]/g, '');
}

// 연락처 해시 매칭은 서버 API 필요 — 데모 목업 제거(빈 상태). 친구 찾기는 닉네임/핸들 검색으로.
const REGISTERED_USERS: Record<string, { username: string; countries: number }> = {};

async function findRegisteredUsers(
  contacts: { id: string; name: string; phone: string }[]
): Promise<ContactFriend[]> {
  // TODO: 서버 API 연동 시 아래를 fetch로 교체
  // const res = await fetch('/api/users/find-by-phone', {
  //   method: 'POST',
  //   body: JSON.stringify({ phones: contacts.map(c => normalizePhone(c.phone)) }),
  // });
  // return await res.json();

  return contacts
    .map(c => {
      const norm = normalizePhone(c.phone);
      const user = REGISTERED_USERS[norm];
      if (!user) return null;
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        initial: c.name[0],
        username: user.username,
        countries: user.countries,
      };
    })
    .filter((x): x is ContactFriend => x !== null);
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
  return (
    <TouchableOpacity style={s.friendItem} onPress={onPress} activeOpacity={0.75}>
      <View style={s.avatar}>
        <Text style={s.avatarText}>{item.initial}</Text>
      </View>
      <View style={s.friendInfo}>
        <Text style={s.friendName}>{item.name}</Text>
        <Text style={s.friendUsername}>@{item.username}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><GlobeIcon size={12} color="#A1A1B0" /><Text style={s.friendCountries}>{item.countries}개국 방문</Text></View>
      </View>
      <TouchableOpacity
        style={[s.followBtn, following && s.followingBtn]}
        onPress={(e) => { e.stopPropagation?.(); onToggle(); }}
        activeOpacity={0.8}
      >
        <Text style={[s.followBtnText, following && s.followingBtnText]}>
          {following ? '팔로잉' : '팔로우'}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────
// 메인 화면
// ─────────────────────────────────────────────
type Props = RootStackScreenProps<'FriendSearch'>;

export default function FriendSearchScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { nickname, handle } = useSettings();
  const [query, setQuery] = useState('');
  const [contactFriends, setContactFriends] = useState<ContactFriend[]>([]);
  // 팔로우 상태는 store 공유 — 친구 프로필·팔로잉 목록·프로필 카운트와 동기화
  const { followingUsers, followUser, unfollowUser } = useRecords();
  const [contactsPermission, setContactsPermission] = useState<'granted' | 'denied' | 'pending'>('pending');
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    const loadContacts = async () => {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status === 'granted') {
        setContactsPermission('granted');
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
          sort: Contacts.SortTypes.LastName,
        });
        const rawContacts = data
          .filter(c => c.name && c.phoneNumbers && c.phoneNumbers.length > 0)
          .map((c, idx) => ({
            id: c.id || `contact-${idx}`,
            name: c.name!,
            phone: c.phoneNumbers![0].number || '',
          }));
        const registered = await findRegisteredUsers(rawContacts);
        setContactFriends(registered);
      } else {
        setContactsPermission('denied');
      }
      setLoading(false);
    };
    loadContacts();
  }, []);

  const toggleFollow = (friend: ContactFriend) => {
    if (followingUsers.some((f) => f.username === friend.username)) {
      unfollowUser(friend.username);
    } else {
      followUser({
        id: friend.id,
        username: friend.username,
        isAbroad: false,
        currentCountry: null,
        currentCountryFlag: null,
      });
    }
  };

  // 백엔드 사용자 검색 (닉네임/핸들) — 실제 테스터 찾기
  const [remoteResults, setRemoteResults] = useState<ContactFriend[]>([]);
  const myIdRef = useRef<string | null>(null);
  useEffect(() => { getMyUserId().then((id) => { myIdRef.current = id; }); }, []);
  useEffect(() => {
    const q = query.trim();
    if (!isSupabaseConfigured || q.length === 0) { setRemoteResults([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      const rows = await searchProfiles(q);
      if (!alive) return;
      setRemoteResults(
        rows
          .filter((p) => p.id !== myIdRef.current)
          .map((p) => ({
            id: p.id,
            name: p.nickname || p.handle || '여행자',
            phone: '',
            initial: (p.nickname || p.handle || '?').slice(0, 1),
            username: p.handle || '',
            countries: 0,
          }))
      );
    }, 300); // 디바운스
    return () => { alive = false; clearTimeout(t); };
  }, [query]);

  const isSearching = query.trim().length > 0;
  const displayList = isSearching
    ? (isSupabaseConfigured
        ? remoteResults
        : contactFriends.filter(f =>
            f.name.toLowerCase().includes(query.toLowerCase()) ||
            f.username.toLowerCase().includes(query.toLowerCase())
          ))
    : contactFriends;

  return (
    <View style={s.container}>
      {/* ── 헤더 ── */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={s.backBtn} onPress={handleGoBack}>
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>친구 찾기</Text>
        <View style={s.backBtn} />
      </View>

      <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

      {/* ── QR 카드 ── */}
      <View style={s.qrCard}>
        {/* 왼쪽: QR 코드 */}
        <View style={s.qrCodeWrap}>
          <QRCode
            value={`eOrth://user/${handle || nickname}`}
            size={160}
            color="#BF85FC"
            backgroundColor="#0A0A0F"
            logo={undefined}
          />
          <View style={s.qrLogoWrap}>
            <Text style={s.qrLogoText}>eOrth</Text>
          </View>
        </View>

        {/* 오른쪽: 프로필 정보 */}
        <View style={s.profileInfo}>
          <Text style={s.profileName}>{nickname ? nickname : handle}</Text>
          <Text style={s.profileUsername}>@{handle}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><GlobeIcon size={12} color="#A1A1B0" /><Text style={s.profileCountries}>3개국 방문</Text></View>
          <TouchableOpacity
            style={s.inlineScanBtn}
            activeOpacity={0.85}
            onPress={() => Alert.alert('📷 카메라', 'QR 스캔 기능은 추후 제공될 예정입니다.')}
          >
            <Text style={s.inlineScanBtnText}>📷 QR 스캔하기</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 검색창 ── */}
      <View style={s.searchWrap}>
        <SearchIcon size={16} color="#A1A1B0" />
        <TextInput
          style={s.searchInput}
          placeholder="이름 또는 아이디 검색"
          placeholderTextColor={C.dim}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Text style={s.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── 친구 리스트 ── */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
        {isSearching ? (
          /* 검색 중에는 연락처 권한과 무관하게 검색 결과(닉네임/핸들)를 보여준다 */
          <>
            <Text style={s.sectionLabel}>검색 결과</Text>
            {displayList.length === 0 ? (
              <Text style={s.emptyText}>검색 결과가 없어요 🔍</Text>
            ) : (
              displayList.map((item, idx) => (
                <React.Fragment key={item.id}>
                  <FriendItem
                    item={item}
                    following={followingUsers.some((f) => f.username === item.username)}
                    onToggle={() => toggleFollow(item)}
                    onPress={() => navigation.navigate('FriendProfile', { userId: item.id, username: item.username })}
                  />
                  {idx < displayList.length - 1 && <View style={s.divider} />}
                </React.Fragment>
              ))
            )}
          </>
        ) : contactsPermission === 'denied' ? (
          <View style={s.permissionCard}>
            <Text style={s.permissionEmoji}>📱</Text>
            <Text style={s.permissionTitle}>연락처 접근 권한이 필요해요</Text>
            <Text style={s.permissionDesc}>
              내 연락처에 있는 친구 중{'\n'}eOrth를 사용하는 사람을 찾아드려요
            </Text>
            <TouchableOpacity
              style={s.permissionBtn}
              activeOpacity={0.85}
              onPress={async () => {
                const { status } = await Contacts.requestPermissionsAsync();
                if (status === 'granted') setContactsPermission('granted');
                else showPermissionDeniedAlert('연락처');
              }}
            >
              <Text style={s.permissionBtnText}>연락처 접근 허용하기</Text>
            </TouchableOpacity>
          </View>
        ) : loading ? (
          <Text style={s.emptyText}>연락처에서 eOrth 사용자를 찾는 중...</Text>
        ) : (
          <>
            <Text style={s.sectionLabel}>내 연락처 중 eOrth 사용자 ({contactFriends.length}명)</Text>
            {displayList.length === 0 ? (
              <Text style={s.emptyText}>연락처에 eOrth를 사용하는 친구가 없어요</Text>
            ) : (
              displayList.map((item, idx) => (
                <React.Fragment key={item.id}>
                  <FriendItem
                    item={item}
                    following={followingUsers.some((f) => f.username === item.username)}
                    onToggle={() => toggleFollow(item)}
                    onPress={() => navigation.navigate('FriendProfile', { userId: item.id, username: item.username })}
                  />
                  {idx < displayList.length - 1 && <View style={s.divider} />}
                </React.Fragment>
              ))
            )}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      </Animated.View>
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.qrCard,
    borderRadius: 20,
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 24,
    gap: 20,
  },
  qrCodeWrap: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginBottom: 8,
  },
  inlineScanBtn: {
    backgroundColor: C.accentDark,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignSelf: 'flex-start',
  },
  inlineScanBtnText: {
    fontSize: 13,
    fontWeight: '600',
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
