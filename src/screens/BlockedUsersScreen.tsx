import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRecords } from '../store/recordStore';
import { PersonIcon } from '../components/icons';
import type { RootStackScreenProps } from '../navigation/types';

const COLORS = {
  bg: '#0A0A0F',
  card: '#2E2E3B',
  divider: '#1A1A26',
  purpleNeon: '#BF85FC',
  white: '#FFFFFF',
  textDim: '#A1A1B0',
  textMuted: '#8B8B9E',
  red: '#FF6B6B',
  redBg: 'rgba(255,107,107,0.12)',
};

export default function BlockedUsersScreen({ navigation }: RootStackScreenProps<'BlockedUsers'>) {
  const { t } = useTranslation();
  const { blockedUsers, unblockUser } = useRecords();

  // handle 우선 — 동명(name) 계정이 있어도 어떤 계정을 해제하는지 식별·매칭이 정확하다
  const handleUnblock = (name: string, handle?: string) => {
    const label = handle ? `@${handle}` : name;
    Alert.alert(t('friends.unblockTitle'), t('friends.unblockMsg', { name: label }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('friends.unblock'),
        onPress: () => {
          unblockUser(handle || name);
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
        <TouchableOpacity style={st.backBtn} activeOpacity={0.7} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={t('friends.back')}>
          <Text style={st.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>{t('friends.blockedTitle')}</Text>
        <View style={st.headerPlaceholder} />
      </View>

      <ScrollView style={st.scroll} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        {blockedUsers.length === 0 ? (
          <View style={st.emptyContainer}>
            <Text style={st.emptyIcon}>🚫</Text>
            <Text style={st.emptyTitle}>{t('friends.noBlocked')}</Text>
            <Text style={st.emptyDesc}>{t('friends.noBlockedDesc')}</Text>
          </View>
        ) : (
          <>
            <Text style={st.countText}>{t('friends.blockedCount', { count: blockedUsers.length })}</Text>
            {blockedUsers.map((user) => (
              <View key={user.id ?? user.handle ?? `${user.name}-${user.blockedAt}`} style={st.userCard}>
                {/* 차단된 사용자는 기본 프사로만 표시(신원 시각 정보 미노출 — 사용자 결정) */}
                <View style={st.avatarWrap}>
                  <PersonIcon size={24} color="#A0A0B0" />
                </View>
                {/* 프사 옆에는 차단한 날짜만 표시 */}
                <View style={st.userInfo}>
                  <Text style={st.blockedDate}>{t('friends.blockedOn', { date: formatDate(user.blockedAt) })}</Text>
                </View>
                <TouchableOpacity
                  style={st.unblockBtn}
                  activeOpacity={0.7}
                  onPress={() => handleUnblock(user.name, user.handle)}
                >
                  <Text style={st.unblockText}>{t('friends.unblockShort')}</Text>
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
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  // 행의 유일한 텍스트(차단 날짜) — 이름 제거 후 가독성 위해 크기 상향
  blockedDate: {
    fontSize: 13,
    color: COLORS.textDim,
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
