import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Animated,
  ActivityIndicator,
  Modal,
  Share,
} from 'react-native';

import QRCode from 'react-native-qrcode-svg';
import { GlobeIcon, SearchIcon } from '../components/icons';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { showPermissionDeniedAlert } from '../utils/permissionAlert';
import { isSupabaseConfigured } from '../services/supabase';
import { searchProfiles, getMyUserId, getCountryCounts, findUsersByPhones } from '../services/profile';
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
        {item.countries > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><GlobeIcon size={12} color="#A1A1B0" /><Text style={s.friendCountries}>{item.countries}개국 방문</Text></View>
        )}
      </View>
      <TouchableOpacity
        style={[s.followBtn, following && s.followingBtn]}
        onPress={(e) => { e.stopPropagation?.(); onToggle(); }}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={following ? `${item.name} 팔로우 취소` : `${item.name} 팔로우`}
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

export default function FriendSearchScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { nickname, handle, phoneMatchConsent } = useSettings();
  const [query, setQuery] = useState(route.params?.initialQuery ?? '');

  // 딥링크(eorth://user/<handle>)로 진입/재진입 시 검색어 자동 채움
  useEffect(() => {
    const q = route.params?.initialQuery;
    if (q) setQuery(q);
  }, [route.params?.initialQuery]);
  const [contactFriends, setContactFriends] = useState<ContactFriend[]>([]);
  // 팔로우 상태는 store 공유 — 친구 프로필·팔로잉 목록·프로필 카운트와 동기화
  const { records, followingUsers, followUser, unfollowUser } = useRecords();
  // 내 방문 국가 수 (ProfileScreen과 동일한 통계 계산 사용)
  const myCountryCount = useMemo(() => computeTravelStats(records).countryCount, [records]);
  const [contactsPermission, setContactsPermission] = useState<'granted' | 'denied' | 'pending'>('pending');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false); // 원격 검색 진행 중

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
      const matches = await findUsersByPhones(rawContacts);
      const counts = await getCountryCounts(matches.map((m) => m.id));
      setContactFriends(
        matches.map((m) => ({
          id: m.id,
          name: m.contactName,
          phone: '',
          initial: (m.contactName || '?').slice(0, 1),
          username: m.handle || '',
          countries: counts[m.id] ?? 0,
        }))
      );
    } catch {
      setContactFriends([]);
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

  // 사용자가 직접 버튼을 눌렀을 때만 권한 요청
  const requestContacts = useCallback(async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status === 'granted') {
      setContactsPermission('granted');
      await fetchContactsData();
    } else {
      setContactsPermission('denied');
      showPermissionDeniedAlert('연락처');
    }
  }, [fetchContactsData]);

  const toggleFollow = (friend: ContactFriend) => {
    buzz('light');
    if (followingUsers.some((f) => f.username === friend.username)) {
      unfollowUser(friend.username);
      showToast(`${friend.name}님 팔로우를 취소했어요`);
    } else {
      followUser({
        id: friend.id,
        username: friend.username,
        isAbroad: false,
        currentCountry: null,
        currentCountryFlag: null,
      });
      showToast(`${friend.name}님을 팔로우했어요`);
    }
  };

  // ── QR 스캔 ──
  const [scannerVisible, setScannerVisible] = useState(false);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const scannedRef = useRef(false);
  const lastInvalidToast = useRef(0);

  // 내 코드(공유/QR용) — 핸들 우선, 없으면 닉네임
  const myCode = handle || nickname;

  const openScanner = async () => {
    if (!camPermission?.granted) {
      const res = await requestCamPermission();
      if (!res.granted) { showPermissionDeniedAlert('카메라'); return; }
    }
    scannedRef.current = false;
    setScannerVisible(true);
  };

  const handleBarcode = ({ data }: { data: string }) => {
    if (scannedRef.current) return;
    const m = /eOrth:\/\/user\/(.+)$/i.exec((data || '').trim());
    if (!m) {
      // eOrth 코드가 아니면 계속 스캔하되, 안내는 2초에 한 번만 (연속 스캔 스팸 방지)
      const now = Date.now();
      if (now - lastInvalidToast.current > 2000) {
        lastInvalidToast.current = now;
        showToast('eOrth QR 코드가 아니에요');
      }
      return;
    }
    scannedRef.current = true;
    const scanned = decodeURIComponent(m[1]).replace(/^@/, '');
    setScannerVisible(false);
    setQuery(scanned);          // 스캔한 핸들로 검색 실행 → 실제 유저(실 id) 결과 표시
    showToast(`@${scanned} 검색 중...`);
  };

  // ── 내 코드 공유 ──
  const handleShareMe = () => {
    if (!myCode) { showToast('프로필(아이디)을 먼저 설정해주세요'); return; }
    Share.share({
      message: `eOrth에서 저를 친구로 추가해보세요!\neorth://user/${myCode}`,
    }).catch(() => {});
  };

  // 백엔드 사용자 검색 (닉네임/핸들) — 실제 테스터 찾기
  const [remoteResults, setRemoteResults] = useState<ContactFriend[]>([]);
  const myIdRef = useRef<string | null>(null);
  useEffect(() => { getMyUserId().then((id) => { myIdRef.current = id; }); }, []);
  useEffect(() => {
    const q = query.trim();
    if (!isSupabaseConfigured || q.length === 0) { setRemoteResults([]); setSearching(false); return; }
    let alive = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const rows = await searchProfiles(q);
        if (!alive) return;
        const others = rows.filter((p) => p.id !== myIdRef.current);
        // 방문 국가 수 일괄 조회 후 병합 (실패해도 0으로 처리 → 줄 숨김)
        const counts = await getCountryCounts(others.map((p) => p.id));
        if (!alive) return;
        setRemoteResults(
          others.map((p) => ({
            id: p.id,
            name: p.nickname || p.handle || '여행자',
            phone: '',
            initial: (p.nickname || p.handle || '?').slice(0, 1),
            username: p.handle || '',
            countries: counts[p.id] ?? 0,
          }))
        );
      } catch {
        if (alive) setRemoteResults([]); // 검색 실패 시 이전 결과 잔류 방지
      } finally {
        if (alive) setSearching(false);
      }
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
        <TouchableOpacity style={s.backBtn} onPress={handleGoBack} accessibilityRole="button" accessibilityLabel="뒤로 가기">
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
            value={`eorth://user/${myCode || 'unknown'}`}
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><GlobeIcon size={12} color="#A1A1B0" /><Text style={s.profileCountries}>{myCountryCount}개국 방문</Text></View>
          <View style={s.qrBtnRow}>
            <TouchableOpacity
              style={s.inlineScanBtn}
              activeOpacity={0.85}
              onPress={openScanner}
              accessibilityRole="button"
              accessibilityLabel="QR 스캔하기"
            >
              <Text style={s.inlineScanBtnText}>📷 QR 스캔</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.inlineShareBtn, !myCode && s.inlineBtnDisabled]}
              activeOpacity={0.85}
              onPress={handleShareMe}
              disabled={!myCode}
              accessibilityRole="button"
              accessibilityLabel="내 코드 공유하기"
            >
              <Text style={s.inlineShareBtnText}>↗ 공유</Text>
            </TouchableOpacity>
          </View>
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
          accessibilityLabel="친구 이름 또는 아이디 검색"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="검색어 지우기">
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
            {searching ? (
              <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
            ) : displayList.length === 0 ? (
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
        ) : loading ? (
          <Text style={s.emptyText}>연락처에서 eOrth 사용자를 찾는 중...</Text>
        ) : !phoneMatchConsent ? (
          /* 전화번호 수집 동의 전 — 동의 화면으로 유도 */
          <View style={s.permissionCard}>
            <Text style={s.permissionEmoji}>📇</Text>
            <Text style={s.permissionTitle}>연락처로 친구 찾기</Text>
            <Text style={s.permissionDesc}>
              내 전화번호를 등록하면 번호를 저장한 친구가 나를 찾을 수 있고,{'\n'}내 연락처 속 eOrth 사용자도 찾아드려요.{'\n'}번호는 복원 불가능한 해시로만 저장돼요.
            </Text>
            <TouchableOpacity
              style={s.permissionBtn}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('PhoneConsent')}
              accessibilityRole="button"
              accessibilityLabel="전화번호로 친구 찾기 설정"
            >
              <Text style={s.permissionBtnText}>전화번호로 친구 찾기</Text>
            </TouchableOpacity>
          </View>
        ) : contactsPermission !== 'granted' ? (
          <View style={s.permissionCard}>
            <Text style={s.permissionEmoji}>📱</Text>
            <Text style={s.permissionTitle}>연락처 접근 허용</Text>
            <Text style={s.permissionDesc}>
              내 연락처에 있는 친구 중{'\n'}eOrth를 사용하는 사람을 찾아드려요.
            </Text>
            <TouchableOpacity
              style={s.permissionBtn}
              activeOpacity={0.85}
              onPress={requestContacts}
              accessibilityRole="button"
              accessibilityLabel="연락처 접근 허용하기"
            >
              <Text style={s.permissionBtnText}>연락처 접근 허용하기</Text>
            </TouchableOpacity>
          </View>
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

      {/* QR 스캔 모달 */}
      <Modal visible={scannerVisible} animationType="slide" onRequestClose={() => setScannerVisible(false)}>
        <View style={s.scanRoot}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleBarcode}
          />
          {/* 가이드 프레임 */}
          <View style={s.scanOverlay} pointerEvents="none">
            <View style={s.scanFrame} />
            <Text style={s.scanHint}>친구의 eOrth QR 코드를 비춰주세요</Text>
          </View>
          <TouchableOpacity
            style={[s.scanClose, { top: insets.top + 12 }]}
            onPress={() => setScannerVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="QR 스캔 닫기"
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
  qrBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  inlineScanBtn: {
    backgroundColor: C.accentDark,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  inlineScanBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.white,
  },
  inlineShareBtn: {
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.3)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
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
