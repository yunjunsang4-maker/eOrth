import React, { useState, useRef, useEffect } from 'react';
import AppRefreshControl from '../components/AppRefreshControl';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
  Animated,
  Image,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { Text, TextInput } from '../ui/Text';
import { SearchIcon, BackChevronIcon, EyeIcon, PinIcon, BellIcon, BellOffIcon, TrashIcon } from '../components/icons';
import { SettingsCard } from '../components/settings/SettingsUI';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DefaultAvatar from '../components/DefaultAvatar';
import { useTranslation } from 'react-i18next';
import { useSkinAccent } from '../constants/skinTheme';
import type { TFunction } from 'i18next';
import { useSocialGraph, useRecordActions } from '../store/recordStore';
import { useDMData, useDMActions } from '../store/dmStore';
import type { Message } from '../store/dmTypes';
import { getProfileByHandle } from '../services/profile';
import { tap, warn } from '../utils/haptics';
import Toast from '../components/Toast';
import { andFitText } from '../utils/fitText';
import type { RootStackScreenProps } from '../navigation/types';
import HeaderGlassButton from '../components/HeaderGlassButton';

const C = {
  bg: '#0A0A0F',
  card: '#2E2E3B',
  divider: '#1A1A26',
  accent: '#BF85FC',
  accentDim: 'rgba(107,33,168,0.25)',
  accentBorder: 'rgba(191,133,252,0.3)',
  white: '#FFFFFF',
  dim: '#A1A1B0',
  muted: '#8B8B9E',
  online: '#34C759',
  red: '#FF3B30', // 디자인 토큰 빨강(삭제)
};

// 고정한 대화(아이디 배열 JSON) — 이 기기 전용
const PINNED_KEY = '@eorth/dm/pinnedHandles';

interface Friend {
  id: string;
  name: string;
  handle: string;
  emoji: string;
  photo?: string; // 프로필 사진 URL — 있으면 이모지 대신 사진 아바타 (프로필탭과 통일)
  lastMessage: string;
  lastMessageAt: number; // 마지막 메시지 시각(ms)
  unread: number;
  online: boolean;
  isMuted?: boolean;
  isPinned?: boolean;
}

// 상대시간 표기 (방금 전 / N분 전 / N시간 전 / 어제 / N일 전 / M월 D일)
function timeAgo(ts: number, tr: TFunction): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return tr('time.justNow');
  if (min < 60) return tr('time.minAgo', { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return tr('time.hourAgo', { n: hr });
  const day = Math.floor(hr / 24);
  if (day === 1) return tr('time.yesterday');
  if (day < 7) return tr('time.dayAgo', { n: day });
  const d = new Date(ts);
  return tr('time.monthDay', { m: d.getMonth() + 1, d: d.getDate() });
}

// 목록에 보여줄 마지막 메시지 미리보기
function lastMessagePreview(m: Message, tr: TFunction): string {
  if (m.type === 'image') return tr('friends.sentImage');
  if (m.type === 'record') return tr('friends.sharedRecord');
  return m.text;
}

type Props = RootStackScreenProps<'Friends'>;

export default function FriendsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent(); // 스킨(아이콘 팔레트) 변경 구독 — 미구독이면 스택에 남아 있던 이 화면의 아이콘이 이전 팔레트로 표시됨
  const { neighbors, isBlocked, isMuted } = useSocialGraph();
  const { toggleMute, refreshNeighbors } = useRecordActions();
  const { conversations, unreadCount } = useDMData();
  const { markRead, registerPeer, clearConversation } = useDMActions();

  // 당겨서 새로고침 — 메이트 목록(메이트)을 서버 기준으로 재동기화
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try { await refreshNeighbors(); } finally { setRefreshing(false); }
  };

  const [search, setSearch] = useState('');
  // 메이트 목록은 실제 메이트으로 구성 (대화 미리보기는 아래에서 conversations로 오버레이) — 데모 시드 제거
  const [friends, setFriends] = useState<Friend[]>(() =>
    neighbors.map((f) => ({
      id: f.id, name: f.username, handle: f.username, emoji: f.emoji || '🧳', photo: f.photo,
      lastMessage: '', lastMessageAt: 0, unread: 0, online: false,
    }))
  );
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  // 팝업 메뉴 앵커(행의 화면 좌표) — 안드로이드는 부모 경계 밖 자식에 터치를 전달하지 않아
  // 행 내부 absolute 배치로는 메뉴 버튼이 눌리지 않는다. 화면 루트에서 측정 좌표로 렌더한다.
  const [popupAnchor, setPopupAnchor] = useState<{ y: number; height: number; placeBelow: boolean } | null>(null);

  // 메이트 목록 변경을 메이트 목록에 반영(새 메이트 추가/해제 제거). 로컬 상태(음소거 등)는 유지.
  // 메이트이 아니어도 '대화가 있는' 행(아래 낯선 상대 effect가 추가)은 지우지 않는다 —
  // 서버 정책상 메이트이 아닌 사용자도 내게 DM을 보낼 수 있는데, 메이트 기준으로만
  // 목록을 만들면 그 메시지를 열람할 경로가 전혀 없다.
  useEffect(() => {
    setFriends((prev) => {
      const byId = new Map(prev.map((f) => [f.id, f]));
      const base = neighbors.map((u) => {
        const ex = byId.get(u.id);
        return ex
          ? { ...ex, name: u.username, handle: u.username, emoji: u.emoji || ex.emoji, photo: u.photo ?? ex.photo }
          : { id: u.id, name: u.username, handle: u.username, emoji: u.emoji || '🧳', photo: u.photo, lastMessage: '', lastMessageAt: 0, unread: 0, online: false };
      });
      const baseHandles = new Set(base.map((f) => f.handle));
      const extras = prev.filter(
        (f) => !baseHandles.has(f.handle) && (conversations[f.handle]?.length ?? 0) > 0
      );
      return [...base, ...extras];
    });
  }, [neighbors, conversations]);

  // 메이트이 아닌 상대가 보낸 대화 → 목록 행 생성 (프로필 조회로 이모지·uuid 확보)
  useEffect(() => {
    const known = new Set([
      ...neighbors.map((u) => u.username),
      ...friends.map((f) => f.handle),
    ]);
    const strangers = Object.keys(conversations).filter(
      (h) => !known.has(h) && (conversations[h]?.length ?? 0) > 0
    );
    if (strangers.length === 0) return;
    let cancelled = false;
    (async () => {
      const rows: Friend[] = [];
      for (const h of strangers) {
        const prof = await getProfileByHandle(h).catch(() => null);
        if (prof?.id) registerPeer(h, prof.id);
        rows.push({
          id: prof?.id ?? `dm-${h}`, name: h, handle: h, emoji: prof?.emoji || '💬',
          photo: prof?.profile_photo ?? undefined,
          lastMessage: '', lastMessageAt: 0, unread: 0, online: false,
        });
      }
      if (cancelled) return;
      setFriends((prev) => {
        const have = new Set(prev.map((f) => f.handle));
        const fresh = rows.filter((r) => !have.has(r.handle));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
    })();
    return () => { cancelled = true; };
    // friends는 이 effect가 스스로 갱신하므로 deps에 넣지 않는다(무한 루프 방지) — known 집합은 conversations 변경 시 재평가
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, neighbors, registerPeer]);

  // 실시간 DM 수신이 목록과 같은 키(username)로 묶이도록 상대 uuid 매핑을 미리 등록
  useEffect(() => {
    neighbors.forEach((u) => { if (u.id) registerPeer(u.username, u.id); });
  }, [neighbors, registerPeer]);

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(msg);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => {
      setToastVisible(false);
    }, 2000);
  };

  const handleToggleMute = () => {
    if (!selectedFriendId) return;
    const friend = findSelected();
    if (!friend) return;
    const willMute = !isMuted(friend.handle);
    toggleMute(friend.handle); // store에 영속 저장
    showToast(willMute ? t('comp2.toastMuteOn', { name: friend.name }) : t('comp2.toastMuteOff', { name: friend.name }));
    setSelectedFriendId(null);
  };

  const handleMarkAsRead = () => {
    const friend = findSelected();
    if (!friend) return;
    if (unreadCount(friend.handle) > 0) {
      markRead(friend.handle);
      showToast(t('comp2.toastMarkRead', { name: friend.name }));
    } else {
      showToast(t('friends.alreadyRead'));
    }
    setSelectedFriendId(null);
  };

  // 고정 — 고정한 대화는 목록 맨 위. ponytail: 이 기기에만 저장(음소거처럼 서버 user_state_flags로 기기 간
  // 동기화하려면 서버 flag 종류 추가가 필요하다 — 요청이 오면 그때).
  const [pinnedHandles, setPinnedHandles] = useState<string[]>([]);
  useEffect(() => {
    AsyncStorage.getItem(PINNED_KEY)
      .then((v) => { try { const a = v ? JSON.parse(v) : []; if (Array.isArray(a)) setPinnedHandles(a); } catch { /* 깨진 값은 무시 */ } })
      .catch(() => {});
  }, []);

  // 목록 행 조회 — 화면에 그린 목록(mergedFriends) 기준
  const findSelected = () => mergedFriends.find(f => f.id === selectedFriendId);

  const handleTogglePin = () => {
    const friend = findSelected();
    if (!friend) return;
    const willPin = !pinnedHandles.includes(friend.handle);
    const next = willPin ? [...pinnedHandles, friend.handle] : pinnedHandles.filter((h) => h !== friend.handle);
    setPinnedHandles(next);
    AsyncStorage.setItem(PINNED_KEY, JSON.stringify(next)).catch(() => {});
    showToast(willPin ? t('friends.toastPinOn', { name: friend.name }) : t('friends.toastPinOff', { name: friend.name }));
    setSelectedFriendId(null);
  };

  // 삭제 — 대화방 '나가기'와 같은 동작(clearConversation). 메이트 행은 목록에 남고 대화 내용만 지워진다
  const handleDeleteSelected = () => {
    const friend = findSelected();
    if (!friend) return;
    setSelectedFriendId(null);
    warn(); // 되돌릴 수 없는 동작을 묻는 중
    Alert.alert(t('friends.deleteChatTitle'), t('dm.leaveChatMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('friends.deleteShort'), style: 'destructive', onPress: () => clearConversation(friend.handle) },
    ]);
  };

  // 실제 대화(dmStore)의 마지막 메시지/시각을 합쳐 목록을 구성
  const mergedFriends = friends.map(f => {
    const msgs = conversations[f.handle];
    // f.id는 메이트·조회된 낯선 상대면 uuid, 조회 실패면 'dm-핸들' 합성값 — 후자는 isBlocked가 id 비교를 건너뛴다
    const blocked = isBlocked({ name: f.name, handle: f.handle, id: f.id });
    const last = msgs && msgs.length ? msgs[msgs.length - 1] : null;
    const hasConvo = msgs !== undefined; // 대화 키가 있으면(=비웠어도) 더미로 되돌리지 않음
    return {
      ...f,
      lastMessage: last ? lastMessagePreview(last, t) : (hasConvo ? t('friends.noMessage') : f.lastMessage),
      lastMessageAt: last?.createdAt ?? (hasConvo ? 0 : f.lastMessageAt),
      unread: unreadCount(f.handle),
      isMuted: isMuted(f.handle), // 음소거는 store(mutedHandles)에서 — 재진입·재시작에도 유지
      isPinned: pinnedHandles.includes(f.handle),
      blocked,
      photo: blocked ? undefined : f.photo, // 차단한 상대는 기본 프사만
    };
  });

  // 차단한 상대 — 인스타그램처럼 대화 기록이 있으면 목록에 남긴다('대화 나가기'로 지울 때까지).
  // 들어가면 입력창 대신 차단 안내가 뜬다(DMScreen). 대화가 없으면 숨긴다.
  const visibleFriends = mergedFriends.filter(f => !f.blocked || (conversations[f.handle]?.length ?? 0) > 0);

  const filtered = (search.trim()
    ? visibleFriends.filter(
        f =>
          f.name.includes(search) ||
          f.handle.toLowerCase().includes(search.toLowerCase())
      )
    : visibleFriends
  ).sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.lastMessageAt - a.lastMessageAt); // 고정한 대화가 맨 위

  return (
    <SafeAreaView style={st.safe}>
      {/* 헤더 */}
      <Pressable
        onPress={() => { if (selectedFriendId) setSelectedFriendId(null); }}
        style={st.header}
      >
        {/* 좌우를 같은 비율(flex:1)로 잡아야 제목이 화면 중앙에 온다 —
            뒤로가기(40px 고정)와 추가 버튼(텍스트 길이에 따라 가변)은 폭이 달라서,
            space-between만으로는 제목이 남는 공간의 중간에 놓여 중앙에서 밀린다. */}
        <View style={st.headerSideLeft}>
          <HeaderGlassButton back onPress={() => navigation.goBack()} style={st.backBtn} accessibilityLabel={t('friends.back')}>
            {/* 텍스트 글리프 '←' 는 Inter에 없어 안드로이드가 시스템 폰트로 폴백하는데,
                획이 가늘고 기준선이 달라 좌·하로 치우쳤다 → SVG 아이콘으로 교체.
                시안 통일(블로그 기록 화면)로 화살표 대신 chevron(9×16, 흰 60%)을 쓴다 */}
            <BackChevronIcon />
          </HeaderGlassButton>
        </View>
        <Text style={st.headerTitle}>{t('friends.title')}</Text>
        <View style={st.headerSideRight}>
          <TouchableOpacity
            style={[st.addBtn, { backgroundColor: skinAccent.tint(0.12), borderColor: skinAccent.tint(0.25) }]}
            onPress={() => navigation.navigate('FriendSearch')}
          >
            <Text style={[st.addBtnText, { color: skinAccent.accent }]}>+ {t('comp2.addShort')}</Text>
          </TouchableOpacity>
        </View>
      </Pressable>

      {/* 검색 */}
      <Pressable
        onPress={() => { if (selectedFriendId) setSelectedFriendId(null); }}
        style={st.searchWrap}
      >
        <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
          style={st.searchInput}
          placeholder={t('friends.searchPlaceholder')}
          placeholderTextColor={C.muted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          editable={selectedFriendId === null}
        />
      </Pressable>

      <ScrollView
        style={st.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onScrollBeginDrag={() => { if (selectedFriendId) setSelectedFriendId(null); }}
      >
        <Pressable onPress={() => { if (selectedFriendId) setSelectedFriendId(null); }}>
          <Text style={st.sectionLabel}>{t('friends.friendsCountN', { count: filtered.length })}</Text>
          {filtered.map((f, idx) => {
            const isSelected = selectedFriendId === f.id;
            return (
              <View key={f.id} style={{ zIndex: isSelected ? 999 : 1 }}>
                <FriendRow
                  friend={f}
                  isSelected={isSelected}
                  anySelected={selectedFriendId !== null}
                  onPress={() => {
                    if (selectedFriendId) {
                      setSelectedFriendId(null);
                    } else {
                      markRead(f.handle);
                      navigation.navigate('DM', { friend: f });
                    }
                  }}
                  onLongPress={(anchor) => {
                    // 좌표 측정 실패 시 진입하지 않음 — 메뉴 없이 행만 어두워지는 상태 방지
                    if (!anchor) return;
                    tap();
                    setSelectedFriendId(f.id);
                    setPopupAnchor({ ...anchor, placeBelow: idx === 0 });
                  }}
                />
              </View>
            );
          })}

          {filtered.length === 0 && (
            <View style={st.emptyWrap}>
              <SearchIcon size={40} color="#A1A1B0" />
              <Text style={st.emptyText}>{search.trim() ? t('friends.noResult') : t('friends.noFriends')}</Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </Pressable>
      </ScrollView>

      {/* 메뉴가 떠 있는 동안 화면 전체를 덮는 투명 닫기 층 — 행·머리글마다 붙인 닫기 처리로는 목록 아래 빈 공간 등
          빈틈이 남아 '그 행을 다시 눌러야만' 풀렸다. 팝업은 이 층 위(뒤에 렌더 + zIndex)라 계속 눌린다 */}
      {selectedFriendId !== null && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedFriendId(null)} accessible={false} />
      )}

      {/* 팝업 메뉴 — 행 내부가 아니라 화면 루트에서 측정 좌표로 렌더 (안드로이드 터치 호환) */}
      {selectedFriendId !== null && popupAnchor && (() => {
        const friend = filtered.find((f) => f.id === selectedFriendId);
        if (!friend) return null;
        return (
          <FriendPopupMenu
            anchor={popupAnchor}
            isCurrentlyMuted={friend.isMuted ?? false}
            isCurrentlyPinned={friend.isPinned}
            onToggleMute={handleToggleMute}
            onMarkAsRead={handleMarkAsRead}
            onTogglePin={handleTogglePin}
            onDelete={handleDeleteSelected}
          />
        );
      })()}

      {/* 토스트 피드백 */}
      <Toast visible={toastVisible} message={toastMessage} />
    </SafeAreaView>
  );
}

// ─── 팝업 메뉴 (화면 루트 오버레이) ───
// 옵션: 읽음 · 고정 · 끄기 · 삭제(차단은 대화방 ⋯ 시트에 있다). 재질은 설정 계열 카드(SettingsCard — #111116 + 공용 링)와
// 통일, 아이콘은 이모지 대신 공용 SVG.
function FriendPopupMenu({
  anchor,
  isCurrentlyMuted,
  isCurrentlyPinned,
  onToggleMute,
  onMarkAsRead,
  onTogglePin,
  onDelete,
}: {
  anchor: { y: number; height: number; placeBelow: boolean };
  isCurrentlyMuted: boolean;
  isCurrentlyPinned: boolean;
  onToggleMute: () => void;
  onMarkAsRead: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { height: winH } = useWindowDimensions();
  const popupScale = useRef(new Animated.Value(0.85)).current;
  const popupOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(popupScale, { toValue: 1, tension: 60, friction: 6, useNativeDriver: true }),
      Animated.timing(popupOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
  }, [popupScale, popupOpacity]);

  // 행 위(기본) 또는 행 아래(첫 행) — 화면(window) 좌표 기준
  const placement = anchor.placeBelow
    ? { top: anchor.y + anchor.height + 10 }
    : { bottom: winH - anchor.y + 10 };

  return (
    <Animated.View
      style={[st.popupMenu, placement, { opacity: popupOpacity, transform: [{ scale: popupScale }] }]}
    >
      <SettingsCard style={st.popupCard}>
        <TouchableOpacity style={st.popupBtn} onPress={onMarkAsRead}>
          <EyeIcon size={16} color={C.white} />
          <Text style={st.popupText}>{t('friends.read')}</Text>
        </TouchableOpacity>
        <View style={st.popupDivider} />
        <TouchableOpacity style={st.popupBtn} onPress={onTogglePin}>
          <PinIcon size={16} color={C.white} />
          <Text style={st.popupText}>{isCurrentlyPinned ? t('friends.unpinShort') : t('friends.pinShort')}</Text>
        </TouchableOpacity>
        <View style={st.popupDivider} />
        <TouchableOpacity style={st.popupBtn} onPress={onToggleMute}>
          {isCurrentlyMuted ? <BellIcon size={16} color={C.white} /> : <BellOffIcon size={16} color={C.white} />}
          <Text style={st.popupText}>{isCurrentlyMuted ? t('friends.muteOnShort') : t('friends.muteOffShort')}</Text>
        </TouchableOpacity>
        <View style={st.popupDivider} />
        <TouchableOpacity style={st.popupBtn} onPress={onDelete}>
          <TrashIcon size={16} color={C.red} />
          <Text style={[st.popupText, { color: C.red }]}>{t('friends.deleteShort')}</Text>
        </TouchableOpacity>
      </SettingsCard>
    </Animated.View>
  );
}

// ─── 메이트 행 ───
function FriendRow({
  friend,
  isSelected,
  anySelected,
  onPress,
  onLongPress,
}: {
  friend: Friend;
  isSelected: boolean;
  anySelected: boolean;
  onPress: () => void;
  onLongPress: (anchor: { y: number; height: number } | null) => void;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<View>(null);
  const selectedOverlayOpacity = useRef(new Animated.Value(0)).current;
  const rowOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 1. Selected border & background overlay fade transition
    Animated.timing(selectedOverlayOpacity, {
      toValue: isSelected ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();

    // 2. Other row dimming opacity transition
    Animated.timing(rowOpacity, {
      toValue: isSelected ? 1 : (anySelected ? 0.45 : 1),
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isSelected, anySelected]);

  return (
    <Animated.View ref={containerRef} style={[st.rowContainer, { opacity: rowOpacity }]}>
      <TouchableOpacity
        style={st.row}
        activeOpacity={0.7}
        onPress={onPress}
        onLongPress={() => {
          // 팝업 메뉴를 화면 루트에서 띄우도록 행의 화면 좌표를 측정해 넘긴다
          const node = containerRef.current;
          if (node?.measureInWindow) {
            node.measureInWindow((_x, y, _w, h) => onLongPress({ y, height: h }));
          } else {
            onLongPress(null);
          }
        }}
        delayLongPress={400}
      >
        {/* 선택 강조 오버레이 */}
        <Animated.View style={[st.selectedOverlay, { opacity: selectedOverlayOpacity }]} pointerEvents="none" />

        {/* 아바타 — 프로필 사진 우선, 없으면 기본 아이콘(프로필탭과 통일) */}
        <View style={st.avatarWrap}>
          {friend.photo ? (
            <Image source={{ uri: friend.photo }} style={st.avatar} />
          ) : (
            <View style={st.avatar}>
              <DefaultAvatar size={48} />
            </View>
          )}
          {friend.online && <View style={st.onlineDot} />}
        </View>

        {/* 정보 */}
        <View style={st.rowInfo}>
          <View style={st.rowTop}>
            <View style={st.rowNameWrap}>
              <Text style={[st.rowName, { flexShrink: 1 }]} {...andFitText}>{friend.name}</Text>
              {friend.isPinned && <PinIcon size={12} color={C.dim} />}
              {friend.isMuted && <BellOffIcon size={12} color={C.dim} />}
            </View>
            <Text style={st.rowTime}>{friend.lastMessageAt ? timeAgo(friend.lastMessageAt, t) : ''}</Text>
          </View>
          <View style={st.rowBottom}>
            <Text style={st.rowMsg} numberOfLines={1}>{friend.lastMessage}</Text>
            {friend.unread > 0 && !isSelected && (
              <View style={st.unreadBadge}>
                <Text style={st.unreadText}>{friend.unread}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  // 뒤로가기 — 카드 박스 없이 chevron만(사용자 지시). 40 치수는 터치 영역으로 유지
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // (backIcon 텍스트 스타일 제거 — 뒤로가기는 BackChevronIcon SVG로 그린다)
  // 양쪽 사이드는 같은 비율로 — 제목이 좌우 요소 폭과 무관하게 화면 중앙에 놓인다
  headerSideLeft: { flex: 1, alignItems: 'flex-start' },
  headerSideRight: { flex: 1, alignItems: 'flex-end' },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: C.white,
    textAlign: 'center',
  },
  addBtn: {
    backgroundColor: 'rgba(107,33,168,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.accent,
  },

  // 검색
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInput: {
    backgroundColor: 'rgba(46,46,59,0.45)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: C.white,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  scroll: { flex: 1 },

  // 섹션
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.dim,
    letterSpacing: 0.5,
    marginLeft: 20,
    marginTop: 16,
    marginBottom: 8,
  },

  // 메이트 행
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  selectedOverlay: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(191,133,252,0.12)',
    borderColor: '#BF85FC',
    borderWidth: 1.5,
    borderRadius: 16,
  },
  rowContainer: {
    position: 'relative',
  },
  // 위치·그림자만 바깥, 재질(#111116 + 공용 링, 모서리 22)은 SettingsCard(popupCard)
  popupMenu: {
    position: 'absolute',
    left: 20,
    right: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 12,
    zIndex: 9999,
  },
  popupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    minHeight: 52,
    paddingHorizontal: 6,
  },
  popupBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  popupText: {
    fontSize: 13,
    color: C.white,
    fontWeight: '600',
  },
  popupDivider: {
    width: 0.8,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.15)', // 설정 행 구분선과 같은 흰 15%
  },
  rowNameWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  avatarWrap: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1F1F22', // 프로필탭 기본 아바타와 동일
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden', // 사진 원형 클리핑
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: C.online,
    borderWidth: 2,
    borderColor: C.bg,
  },
  rowInfo: { flex: 1 },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
    color: C.white,
  },
  rowTime: {
    fontSize: 11,
    color: C.muted,
  },
  rowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowMsg: {
    fontSize: 13,
    color: C.dim,
    flex: 1,
    marginRight: 8,
  },
  unreadBadge: {
    backgroundColor: C.accent,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.white,
  },

  // 빈 상태
  emptyWrap: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    fontSize: 14,
    color: C.dim,
  },
});
