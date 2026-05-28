import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from 'react-native';

const COLORS = {
  bg:          '#0A0A0F',
  card:        '#2E2E3B',
  divider:     '#1A1A26',
  purpleNeon:  '#BF85FC',
  purpleDeep:  '#6B21A8',
  white:       '#FFFFFF',
  textDim:     '#A1A1B0',
  textMuted:   '#4A4A59',
};

interface Props {
  navigation: any;
}

const NOTIFICATIONS = [
  {
    id: '1',
    icon: '🗺️',
    title: '지민님이 파리 여행 기록을 시작했어요!',
    time: '방금 전',
    unread: true,
  },
  {
    id: '2',
    icon: '❤️',
    title: '현우님 외 3명이 회원님의 도쿄 여행 기록을 좋아합니다.',
    time: '2시간 전',
    unread: true,
  },
  {
    id: '3',
    icon: '👤',
    title: '수진님이 회원님을 팔로우하기 시작했습니다.',
    time: '어제',
    unread: false,
  },
  {
    id: '4',
    icon: '📅',
    title: '추억 리마인드: 1년 전 오늘 타이베이에 계셨네요. 추억을 꺼내볼까요?',
    time: '2일 전',
    unread: false,
  },
];

export default function NotificationScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safeArea}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>알림</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {NOTIFICATIONS.map((noti) => (
          <TouchableOpacity
            key={noti.id}
            style={[styles.notiCard, noti.unread && styles.notiCardUnread]}
            activeOpacity={0.7}
          >
            <View style={styles.iconWrap}>
              <Text style={styles.iconEmoji}>{noti.icon}</Text>
            </View>
            <View style={styles.notiInfo}>
              <Text style={[styles.notiTitle, noti.unread && styles.notiTitleUnread]}>
                {noti.title}
              </Text>
              <Text style={styles.notiTime}>{noti.time}</Text>
            </View>
            {noti.unread && <View style={styles.unreadDot} />}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: COLORS.card,
    borderRadius: 20,
  },
  backIcon: {
    fontSize: 20,
    color: COLORS.white,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.white,
  },

  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 12,
  },

  notiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  notiCardUnread: {
    backgroundColor: 'rgba(107, 33, 168, 0.15)', // 보라색 배경 살짝
    borderColor: 'rgba(191, 133, 252, 0.2)',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 22,
  },
  notiInfo: {
    flex: 1,
    gap: 4,
  },
  notiTitle: {
    fontSize: 14,
    color: COLORS.textDim,
    lineHeight: 20,
  },
  notiTitleUnread: {
    color: COLORS.white,
    fontWeight: '500',
  },
  notiTime: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.purpleNeon,
    marginLeft: 8,
  },
});
