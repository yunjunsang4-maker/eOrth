import React, { useCallback, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { fetchFollowers, type FollowedProfile } from '../services/social';
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

export default function FollowerListScreen({ navigation }: RootStackScreenProps<'FollowerList'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [followers, setFollowers] = useState<FollowedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false); // 오류 ↔ "팔로워 없음" 구분

  // 팔로워는 로컬 스토어에 없으므로 진입 시 백엔드에서 조회한다.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        setLoading(true);
        const list = await fetchFollowers(); // 오류 시 null
        if (!alive) return;
        setLoadError(list === null);
        setFollowers(list ?? []);
        setLoading(false);
      })();
      return () => { alive = false; };
    }, [])
  );

  return (
    <View style={styles.root}>
      {/* 헤더 */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('friends.back')}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('friends.followersTitle')}</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.purpleNeon} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {followers.length === 0 && (
            <Text style={styles.emptyText}>
              {loadError ? t('friends.followersLoadError') : t('friends.noFollowers')}
            </Text>
          )}
          {followers.map((follower, index) => {
            const name = follower.handle || '여행자';
            return (
              <React.Fragment key={follower.id}>
                <TouchableOpacity
                  style={styles.friendRow}
                  activeOpacity={0.75}
                  onPress={() => navigation.navigate('FriendProfile', { userId: follower.id, username: name, handle: follower.handle ?? undefined })}
                >
                  {/* 아바타 — 프로필 이모지 우선, 없으면 이니셜 */}
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{follower.emoji || name[0].toUpperCase()}</Text>
                  </View>

                  {/* 정보 */}
                  <View style={styles.infoWrap}>
                    <Text style={styles.username}>@{name}</Text>
                    {follower.isMutual && (
                      <Text style={styles.mutualText}>{t('friends.mutualYes')}</Text>
                    )}
                  </View>

                  {/* 화살표 */}
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>

                {index < followers.length - 1 && (
                  <View style={styles.divider} />
                )}
              </React.Fragment>
            );
          })}
        </ScrollView>
      )}
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
