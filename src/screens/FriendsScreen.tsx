import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Image,
  TextInput,
  Alert,
  Pressable,
  Animated,
} from 'react-native';
import { SearchIcon } from '../components/icons';
import { useRecords } from '../store/recordStore';
import Toast from '../components/Toast';
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
  muted: '#4A4A59',
  online: '#34C759',
};

interface Friend {
  id: string;
  name: string;
  handle: string;
  emoji: string;
  lastMessage: string;
  time: string;
  unread: number;
  online: boolean;
  isMuted?: boolean;
}

const DUMMY_FRIENDS: Friend[] = [
  { id: '1', name: '김민지', handle: 'minji_travel', emoji: '🌸', lastMessage: '파리 사진 너무 예쁘다!', time: '2분 전', unread: 2, online: true },
  { id: '2', name: '이준호', handle: 'junho_world', emoji: '🏄', lastMessage: '다음 여행 어디로 갈 거야?', time: '15분 전', unread: 0, online: true },
  { id: '3', name: '박서연', handle: 'seoyeon_log', emoji: '✈️', lastMessage: '태국 맛집 리스트 보내줄게', time: '1시간 전', unread: 1, online: false },
  { id: '4', name: '최우진', handle: 'woojin_trip', emoji: '🗺️', lastMessage: '같이 일본 갈래?', time: '3시간 전', unread: 0, online: false },
  { id: '5', name: '정하늘', handle: 'haneul_sky', emoji: '🌅', lastMessage: '발리 스냅 봤어! 대박', time: '어제', unread: 0, online: false },
  { id: '6', name: '강도윤', handle: 'doyun_go', emoji: '🎒', lastMessage: '베트남 숙소 추천해줘', time: '어제', unread: 0, online: true },
];

type Props = RootStackScreenProps<'Friends'>;

export default function FriendsScreen({ navigation }: Props) {
  const [search, setSearch] = useState('');
  const [friends, setFriends] = useState<Friend[]>(DUMMY_FRIENDS);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { blockedUsers, blockUser } = useRecords();

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
    setFriends(prev => prev.map(f => {
      if (f.id === selectedFriendId) {
        const newMute = !f.isMuted;
        showToast(newMute ? `${f.name}님의 알림을 껐습니다.` : `${f.name}님의 알림을 켰습니다.`);
        return { ...f, isMuted: newMute };
      }
      return f;
    }));
    setSelectedFriendId(null);
  };

  const handleMarkAsRead = () => {
    if (!selectedFriendId) return;
    setFriends(prev => prev.map(f => {
      if (f.id === selectedFriendId) {
        if (f.unread > 0) {
          showToast(`${f.name}님의 메시지를 읽음 처리했습니다.`);
        } else {
          showToast('이미 읽은 대화입니다.');
        }
        return { ...f, unread: 0 };
      }
      return f;
    }));
    setSelectedFriendId(null);
  };

  const handleBlockSelected = () => {
    if (!selectedFriendId) return;
    const friend = friends.find(f => f.id === selectedFriendId);
    if (!friend) return;
    Alert.alert(
      '차단 확인',
      `${friend.name}님을 차단하시겠습니까? 차단하면 이 친구와의 대화 및 게시물이 숨겨집니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '차단하기',
          style: 'destructive',
          onPress: () => {
            blockUser({ name: friend.name, emoji: friend.emoji });
            showToast(`${friend.name}님을 차단했습니다.`);
            setSelectedFriendId(null);
          }
        }
      ]
    );
  };

  const selectedFriend = friends.find(f => f.id === selectedFriendId);
  const isCurrentlyMuted = selectedFriend?.isMuted ?? false;

  const blockedNames = blockedUsers.map(b => b.name);
  const visibleFriends = friends.filter(f => !blockedNames.includes(f.name));

  const filtered = search.trim()
    ? visibleFriends.filter(
        f =>
          f.name.includes(search) ||
          f.handle.toLowerCase().includes(search.toLowerCase())
      )
    : visibleFriends;

  return (
    <SafeAreaView style={st.safe}>
      {/* 헤더 */}
      <Pressable
        onPress={() => { if (selectedFriendId) setSelectedFriendId(null); }}
        style={st.header}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
          <Text style={st.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>친구</Text>
        <TouchableOpacity
          style={st.addBtn}
          onPress={() => navigation.navigate('FriendSearch')}
        >
          <Text style={st.addBtnText}>+ 추가</Text>
        </TouchableOpacity>
      </Pressable>

      {/* 검색 */}
      <Pressable
        onPress={() => { if (selectedFriendId) setSelectedFriendId(null); }}
        style={st.searchWrap}
      >
        <TextInput
          style={st.searchInput}
          placeholder="친구 검색..."
          placeholderTextColor={C.muted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          editable={selectedFriendId === null}
        />
      </Pressable>

      <ScrollView style={st.scroll} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => { if (selectedFriendId) setSelectedFriendId(null); }}>
          <Text style={st.sectionLabel}>친구 · {filtered.length}</Text>
          {filtered.map(f => {
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
                      navigation.navigate('DM', { friend: f });
                    }
                  }}
                  onLongPress={() => {
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
              <Text style={st.emptyText}>검색 결과가 없어요</Text>
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
  onPress: () => void;
  onLongPress: () => void;
  onToggleMute: () => void;
  onMarkAsRead: () => void;
  onBlock: () => void;
  isCurrentlyMuted: boolean;
}) {
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
        <Animated.View style={[st.popupMenu, { opacity: popupOpacity, transform: [{ scale: popupScale }] }]}>
          <TouchableOpacity style={st.popupBtn} onPress={onToggleMute}>
            <Text style={st.popupIcon}>{isCurrentlyMuted ? '🔔' : '🔕'}</Text>
            <Text style={st.popupText}>{isCurrentlyMuted ? '켜기' : '끄기'}</Text>
          </TouchableOpacity>
          <View style={st.popupDivider} />
          <TouchableOpacity style={st.popupBtn} onPress={onMarkAsRead}>
            <Text style={st.popupIcon}>📖</Text>
            <Text style={st.popupText}>읽음</Text>
          </TouchableOpacity>
          <View style={st.popupDivider} />
          <TouchableOpacity style={st.popupBtn} onPress={onBlock}>
            <Text style={st.popupIcon}>🚫</Text>
            <Text style={[st.popupText, { color: '#FF6B6B' }]}>차단</Text>
          </TouchableOpacity>
          {/* 말풍선 꼬리 */}
          <View style={st.popupArrow} />
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
            <Text style={st.rowTime}>{friend.time}</Text>
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
    bottom: '100%',
    left: 20,
    right: 20,
    marginBottom: 10,
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
