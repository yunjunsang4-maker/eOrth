import React, { useState, useRef, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Pressable,
  Animated,
} from 'react-native';
import { SearchIcon } from '../components/icons';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useRecords } from '../store/recordStore';
import { useDM } from '../store/dmStore';
import type { Message } from '../store/dmTypes';
import { buzz } from '../utils/haptics';
import Toast from '../components/Toast';
import { handleBlock as confirmBlock } from '../utils/reportAndBlock';
import type { RootStackScreenProps } from '../navigation/types';

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
};

interface Friend {
  id: string;
  name: string;
  handle: string;
  emoji: string;
  lastMessage: string;
  lastMessageAt: number; // 마지막 메시지 시각(ms)
  unread: number;
  online: boolean;
  isMuted?: boolean;
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
  const { blockUser, followingUsers, isBlocked, toggleMute, isMuted } = useRecords();
  const { conversations, unreadCount, markRead, registerPeer } = useDM();

  const [search, setSearch] = useState('');
  // 친구 목록은 실제 팔로우한 친구로 구성 (대화 미리보기는 아래에서 conversations로 오버레이) — 데모 시드 제거
  const [friends, setFriends] = useState<Friend[]>(() =>
    followingUsers.map((f) => ({
      id: f.id, name: f.username, handle: f.username, emoji: f.emoji || '🧳',
      lastMessage: '', lastMessageAt: 0, unread: 0, online: false,
    }))
  );
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);

  // 팔로우 목록 변경을 친구 목록에 반영(새 팔로우 추가/언팔 제거). 로컬 상태(음소거 등)는 유지.
  useEffect(() => {
    setFriends((prev) => {
      const byId = new Map(prev.map((f) => [f.id, f]));
      return followingUsers.map((u) => {
        const ex = byId.get(u.id);
        return ex
          ? { ...ex, name: u.username, handle: u.username, emoji: u.emoji || ex.emoji }
          : { id: u.id, name: u.username, handle: u.username, emoji: u.emoji || '🧳', lastMessage: '', lastMessageAt: 0, unread: 0, online: false };
      });
    });
  }, [followingUsers]);

  // 실시간 DM 수신이 목록과 같은 키(username)로 묶이도록 상대 uuid 매핑을 미리 등록
  useEffect(() => {
    followingUsers.forEach((u) => { if (u.id) registerPeer(u.username, u.id); });
  }, [followingUsers, registerPeer]);

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
    const friend = friends.find(f => f.id === selectedFriendId);
    if (!friend) return;
    const willMute = !isMuted(friend.handle);
    toggleMute(friend.handle); // store에 영속 저장
    showToast(willMute ? t('comp2.toastMuteOn', { name: friend.name }) : t('comp2.toastMuteOff', { name: friend.name }));
    setSelectedFriendId(null);
  };

  const handleMarkAsRead = () => {
    const friend = friends.find(f => f.id === selectedFriendId);
    if (!friend) return;
    if (unreadCount(friend.handle) > 0) {
      markRead(friend.handle);
      showToast(t('comp2.toastMarkRead', { name: friend.name }));
    } else {
      showToast(t('friends.alreadyRead'));
    }
    setSelectedFriendId(null);
  };

  const handleBlockSelected = () => {
    if (!selectedFriendId) return;
    const friend = friends.find(f => f.id === selectedFriendId);
    if (!friend) return;
    confirmBlock(friend.name, () => {
      blockUser({ name: friend.name, emoji: friend.emoji, handle: friend.handle, id: friend.id });
      showToast(t('friends.blockedNameToast', { name: friend.name }));
      setSelectedFriendId(null);
    }, t);
  };

  const selectedFriend = friends.find(f => f.id === selectedFriendId);

  // 실제 대화(dmStore)의 마지막 메시지/시각을 합쳐 목록을 구성
  const mergedFriends = friends.map(f => {
    const msgs = conversations[f.handle];
    const last = msgs && msgs.length ? msgs[msgs.length - 1] : null;
    const hasConvo = msgs !== undefined; // 대화 키가 있으면(=비웠어도) 더미로 되돌리지 않음
    return {
      ...f,
      lastMessage: last ? lastMessagePreview(last, t) : (hasConvo ? t('friends.noMessage') : f.lastMessage),
      lastMessageAt: last?.createdAt ?? (hasConvo ? 0 : f.lastMessageAt),
      unread: unreadCount(f.handle),
      isMuted: isMuted(f.handle), // 음소거는 store(mutedHandles)에서 — 재진입·재시작에도 유지
    };
  });

  const visibleFriends = mergedFriends.filter(f => !isBlocked({ name: f.name, handle: f.handle }));

  const filtered = (search.trim()
    ? visibleFriends.filter(
        f =>
          f.name.includes(search) ||
          f.handle.toLowerCase().includes(search.toLowerCase())
      )
    : visibleFriends
  ).sort((a, b) => b.lastMessageAt - a.lastMessageAt);

  return (
    <SafeAreaView style={st.safe}>
      {/* 헤더 */}
      <Pressable
        onPress={() => { if (selectedFriendId) setSelectedFriendId(null); }}
        style={st.header}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn} accessibilityRole="button" accessibilityLabel={t('friends.back')}>
          <Text style={st.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>{t('friends.title')}</Text>
        <TouchableOpacity
          style={st.addBtn}
          onPress={() => navigation.navigate('FriendSearch')}
        >
          <Text style={st.addBtnText}>+ {t('comp2.addShort')}</Text>
        </TouchableOpacity>
      </Pressable>

      {/* 검색 */}
      <Pressable
        onPress={() => { if (selectedFriendId) setSelectedFriendId(null); }}
        style={st.searchWrap}
      >
        <TextInput
          style={st.searchInput}
          placeholder={t('friends.searchPlaceholder')}
          placeholderTextColor={C.muted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          editable={selectedFriendId === null}
        />
      </Pressable>

      <ScrollView style={st.scroll} showsVerticalScrollIndicator={false}>
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
                  placeBelow={idx === 0}
                  onPress={() => {
                    if (selectedFriendId) {
                      setSelectedFriendId(null);
                    } else {
                      markRead(f.handle);
                      navigation.navigate('DM', { friend: f });
                    }
                  }}
                  onLongPress={() => {
                    buzz('light');
                    setSelectedFriendId(f.id);
                  }}
                  onToggleMute={handleToggleMute}
                  onMarkAsRead={handleMarkAsRead}
                  onBlock={handleBlockSelected}
                  isCurrentlyMuted={f.isMuted ?? false}
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

      {/* 토스트 피드백 */}
      <Toast visible={toastVisible} message={toastMessage} />
    </SafeAreaView>
  );
}

// ─── 친구 행 ───
function FriendRow({
  friend,
  isSelected,
  anySelected,
  placeBelow,
  onPress,
  onLongPress,
  onToggleMute,
  onMarkAsRead,
  onBlock,
  isCurrentlyMuted,
}: {
  friend: Friend;
  isSelected: boolean;
  anySelected: boolean;
  placeBelow: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onToggleMute: () => void;
  onMarkAsRead: () => void;
  onBlock: () => void;
  isCurrentlyMuted: boolean;
}) {
  const { t } = useTranslation();
  const popupScale = useRef(new Animated.Value(0.85)).current;
  const popupOpacity = useRef(new Animated.Value(0)).current;
  const selectedOverlayOpacity = useRef(new Animated.Value(0)).current;
  const rowOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 1. Popup spring and fade entry animations
    if (isSelected) {
      Animated.parallel([
        Animated.spring(popupScale, {
          toValue: 1,
          tension: 60,
          friction: 6,
          useNativeDriver: true,
        }),
        Animated.timing(popupOpacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(popupScale, {
          toValue: 0.85,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(popupOpacity, {
          toValue: 0,
          duration: 120,
          useNativeDriver: true,
        }),
      ]).start();
    }

    // 2. Selected border & background overlay fade transition
    Animated.timing(selectedOverlayOpacity, {
      toValue: isSelected ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();

    // 3. Other row dimming opacity transition
    Animated.timing(rowOpacity, {
      toValue: isSelected ? 1 : (anySelected ? 0.45 : 1),
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isSelected, anySelected]);

  return (
    <Animated.View style={[st.rowContainer, { opacity: rowOpacity }]}>
      {/* 팝업 메뉴 */}
      {isSelected && (
        <Animated.View style={[st.popupMenu, placeBelow ? st.popupMenuBelow : st.popupMenuAbove, { opacity: popupOpacity, transform: [{ scale: popupScale }] }]}>
          <TouchableOpacity style={st.popupBtn} onPress={onToggleMute}>
            <Text style={st.popupIcon}>{isCurrentlyMuted ? '🔔' : '🔕'}</Text>
            <Text style={st.popupText}>{isCurrentlyMuted ? t('friends.muteOnShort') : t('friends.muteOffShort')}</Text>
          </TouchableOpacity>
          <View style={st.popupDivider} />
          <TouchableOpacity style={st.popupBtn} onPress={onMarkAsRead}>
            <Text style={st.popupIcon}>📖</Text>
            <Text style={st.popupText}>{t('friends.read')}</Text>
          </TouchableOpacity>
          <View style={st.popupDivider} />
          <TouchableOpacity style={st.popupBtn} onPress={onBlock}>
            <Text style={st.popupIcon}>🚫</Text>
            <Text style={[st.popupText, { color: '#FF6B6B' }]}>{t('friends.block')}</Text>
          </TouchableOpacity>
          {/* 말풍선 꼬리 */}
          <View style={placeBelow ? st.popupArrowBelow : st.popupArrow} />
        </Animated.View>
      )}

      <TouchableOpacity
        style={st.row}
        activeOpacity={0.7}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={400}
      >
        {/* 선택 강조 오버레이 */}
        <Animated.View style={[st.selectedOverlay, { opacity: selectedOverlayOpacity }]} pointerEvents="none" />

        {/* 아바타 */}
        <View style={st.avatarWrap}>
          <View style={st.avatar}>
            <Text style={st.avatarEmoji}>{friend.emoji}</Text>
          </View>
          {friend.online && <View style={st.onlineDot} />}
        </View>

        {/* 정보 */}
        <View style={st.rowInfo}>
          <View style={st.rowTop}>
            <Text style={st.rowName}>
              {friend.name}
              {friend.isMuted && <Text style={st.rowMuteIcon}> 🔕</Text>}
            </Text>
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
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(46,46,59,0.45)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  backIcon: { fontSize: 20, color: C.white },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: C.white,
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

  // 친구 행
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
  popupMenu: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: '#1E1E28',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#BF85FC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 12,
    zIndex: 9999,
  },
  popupMenuAbove: {
    bottom: '100%',
    marginBottom: 10,
  },
  popupMenuBelow: {
    top: '100%',
    marginTop: 10,
  },
  popupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  popupIcon: {
    fontSize: 14,
  },
  popupText: {
    fontSize: 12,
    color: C.white,
    fontWeight: '600',
  },
  popupDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  popupArrow: {
    position: 'absolute',
    bottom: -6,
    alignSelf: 'center',
    width: 10,
    height: 10,
    backgroundColor: '#1E1E28',
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: '#BF85FC',
    transform: [{ rotate: '45deg' }],
  },
  popupArrowBelow: {
    position: 'absolute',
    top: -6,
    alignSelf: 'center',
    width: 10,
    height: 10,
    backgroundColor: '#1E1E28',
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderColor: '#BF85FC',
    transform: [{ rotate: '45deg' }],
  },
  rowMuteIcon: {
    fontSize: 11,
    color: C.dim,
  },
  avatarWrap: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 22 },
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
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyText: {
    fontSize: 14,
    color: C.dim,
  },
});
