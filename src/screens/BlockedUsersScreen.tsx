import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useRecords } from '../store/recordStore';

const COLORS = {
  bg: '#0A0A0F',
  card: '#2E2E3B',
  divider: '#1A1A26',
  purpleNeon: '#BF85FC',
  white: '#FFFFFF',
  textDim: '#A1A1B0',
  textMuted: '#4A4A59',
  red: '#FF6B6B',
  redBg: 'rgba(255,107,107,0.12)',
};

export default function BlockedUsersScreen({ navigation }: { navigation: any }) {
  const { blockedUsers, unblockUser } = useRecords();

  const handleUnblock = (name: string) => {
    Alert.alert('차단 해제', `${name}님의 차단을 해제하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '해제하기',
        onPress: () => {
          unblockUser(name);
        },
      },
    ]);
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={st.safeArea}>
      {/* 헤더 */}
      <View style={st.header}>
        <TouchableOpacity style={st.backBtn} activeOpacity={0.7} onPress={() => navigation.goBack()}>
          <Text style={st.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>차단한 사용자</Text>
        <View style={st.headerPlaceholder} />
      </View>

      <ScrollView style={st.scroll} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        {blockedUsers.length === 0 ? (
          <View style={st.emptyContainer}>
            <Text style={st.emptyIcon}>🚫</Text>
            <Text style={st.emptyTitle}>차단한 사용자가 없어요</Text>
            <Text style={st.emptyDesc}>소셜 피드에서 게시물의 ··· 버튼을 통해{'\n'}사용자를 차단할 수 있어요</Text>
          </View>
        ) : (
          <>
            <Text style={st.countText}>{blockedUsers.length}명 차단됨</Text>
            {blockedUsers.map((user) => (
              <View key={user.name} style={st.userCard}>
                <View style={st.avatarWrap}>
                  <Text style={st.avatarEmoji}>{user.emoji}</Text>
                </View>
                <View style={st.userInfo}>
                  <Text style={st.userName}>{user.name}</Text>
                  <Text style={st.blockedDate}>{formatDate(user.blockedAt)} 차단됨</Text>
                </View>
                <TouchableOpacity
                  style={st.unblockBtn}
                  activeOpacity={0.7}
                  onPress={() => handleUnblock(user.name)}
                >
                  <Text style={st.unblockText}>해제</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 30,
    color: COLORS.white,
    lineHeight: 36,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  headerPlaceholder: {
    width: 40,
  },

  // 스크롤
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  // 빈 상태
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 13,
    color: COLORS.textDim,
    textAlign: 'center',
    lineHeight: 20,
  },

  // 카운트
  countText: {
    fontSize: 12,
    color: COLORS.textDim,
    marginBottom: 12,
    marginLeft: 4,
  },

  // 유저 카드
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(191,133,252,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.25)',
  },
  avatarEmoji: {
    fontSize: 22,
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
  blockedDate: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  unblockBtn: {
    backgroundColor: COLORS.redBg,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.25)',
  },
  unblockText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.red,
  },
});
