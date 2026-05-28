import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Image,
  TextInput,
} from 'react-native';
import { SearchIcon } from '../components/icons';

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
}

const DUMMY_FRIENDS: Friend[] = [
  { id: '1', name: '김민지', handle: 'minji_travel', emoji: '🌸', lastMessage: '파리 사진 너무 예쁘다!', time: '2분 전', unread: 2, online: true },
  { id: '2', name: '이준호', handle: 'junho_world', emoji: '🏄', lastMessage: '다음 여행 어디로 갈 거야?', time: '15분 전', unread: 0, online: true },
  { id: '3', name: '박서연', handle: 'seoyeon_log', emoji: '✈️', lastMessage: '태국 맛집 리스트 보내줄게', time: '1시간 전', unread: 1, online: false },
  { id: '4', name: '최우진', handle: 'woojin_trip', emoji: '🗺️', lastMessage: '같이 일본 갈래?', time: '3시간 전', unread: 0, online: false },
  { id: '5', name: '정하늘', handle: 'haneul_sky', emoji: '🌅', lastMessage: '발리 스냅 봤어! 대박', time: '어제', unread: 0, online: false },
  { id: '6', name: '강도윤', handle: 'doyun_go', emoji: '🎒', lastMessage: '베트남 숙소 추천해줘', time: '어제', unread: 0, online: true },
];

interface Props {
  navigation: any;
}

export default function FriendsScreen({ navigation }: Props) {
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? DUMMY_FRIENDS.filter(
        f =>
          f.name.includes(search) ||
          f.handle.toLowerCase().includes(search.toLowerCase())
      )
    : DUMMY_FRIENDS;

  return (
    <SafeAreaView style={st.safe}>
      {/* 헤더 */}
      <View style={st.header}>
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
      </View>

      {/* 검색 */}
      <View style={st.searchWrap}>
        <TextInput
          style={st.searchInput}
          placeholder="친구 검색..."
          placeholderTextColor={C.muted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
      </View>

      <ScrollView style={st.scroll} showsVerticalScrollIndicator={false}>
        <Text style={st.sectionLabel}>친구 · {filtered.length}</Text>
        {filtered.map(f => (
          <FriendRow
            key={f.id}
            friend={f}
            onPress={() => navigation.navigate('DM', { friend: f })}
          />
        ))}

        {filtered.length === 0 && (
          <View style={st.emptyWrap}>
            <SearchIcon size={40} color="#A1A1B0" />
            <Text style={st.emptyText}>검색 결과가 없어요</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── 친구 행 ───
function FriendRow({ friend, onPress }: { friend: Friend; onPress: () => void }) {
  return (
    <TouchableOpacity style={st.row} activeOpacity={0.7} onPress={onPress}>
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
          <Text style={st.rowName}>{friend.name}</Text>
          <Text style={st.rowTime}>{friend.time}</Text>
        </View>
        <View style={st.rowBottom}>
          <Text style={st.rowMsg} numberOfLines={1}>{friend.lastMessage}</Text>
          {friend.unread > 0 && (
            <View style={st.unreadBadge}>
              <Text style={st.unreadText}>{friend.unread}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
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
