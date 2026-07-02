import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRecords } from '../store/recordStore';
import type { RootStackScreenProps } from '../navigation/types';

const COLORS = {
  bg:           '#0A0A0F',
  card:         '#2E2E3B',
  divider:      '#1A1A26',
  purpleNeon:   '#BF85FC',
  purpleDeep:   '#6B21A8',
  white:        '#FFFFFF',
  textDim:      '#A1A1B0',
  textMuted:    '#4A4A59',
};

export default function FollowingListScreen({ navigation }: RootStackScreenProps<'FollowingList'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { followingUsers } = useRecords();
  return (
    <View style={styles.root}>
      {/* 헤더 */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('friends.back')}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('friends.followingTitle')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {followingUsers.length === 0 && (
          <Text style={styles.emptyText}>{t('friends.noFollowing')}</Text>
        )}
        {followingUsers.map((friend, index) => (
          <React.Fragment key={friend.id}>
            <TouchableOpacity
              style={styles.friendRow}
              activeOpacity={0.75}
              onPress={() => navigation.navigate('FriendProfile', { userId: friend.id, username: friend.username })}
            >
              {/* 아바타 — 프로필 이모지 우선, 없으면 이니셜 */}
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{friend.emoji || friend.username[0]?.toUpperCase() || '?'}</Text>
              </View>

              {/* 정보 — isAbroad는 항상 false인 더미 필드였어서 맞팔 여부 표시로 교체 (팔로워 목록과 동일) */}
              <View style={styles.infoWrap}>
                <Text style={styles.username}>@{friend.username}</Text>
                {friend.isMutual && (
                  <Text style={styles.mutualText}>{t('friends.mutualYes')}</Text>
                )}
              </View>

              {/* 화살표 */}
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>

            {index < followingUsers.length - 1 && (
              <View style={styles.divider} />
            )}
          </React.Fragment>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: 20,
    color: COLORS.white,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.purpleDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
  },
  infoWrap: {
    flex: 1,
  },
  username: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.purpleNeon,
  },
  mutualText: {
    fontSize: 13,
    color: COLORS.textDim,
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    color: COLORS.textMuted,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textDim,
    textAlign: 'center',
    marginTop: 48,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginLeft: 60,
  },
});
