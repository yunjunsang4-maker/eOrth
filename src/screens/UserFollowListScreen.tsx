import React, { useCallback, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { fetchNeighborsOf, type NeighborProfile } from '../services/social';
import { useRecords } from '../store/recordStore';
import { PersonIcon } from '../components/icons';
import type { RootStackScreenProps } from '../navigation/types';

const COLORS = {
  bg:         '#0A0A0F',
  card:       '#2E2E3B',
  divider:    '#1A1A26',
  purpleNeon: '#BF85FC',
  white:      '#FFFFFF',
  textDim:    '#A1A1B0',
  textMuted:  '#4A4A59',
};

// 타인 프로필의 메이트 목록 — 조회 전용(관리 버튼 없음), 행 탭 → 해당 프로필로 이동. mode는 무시(대칭 모델)
export default function UserFollowListScreen({ navigation, route }: RootStackScreenProps<'UserFollowList'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { userId } = route.params;
  const { isBlocked } = useRecords();
  const [list, setList] = useState<NeighborProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        setLoading(true);
        const result = await fetchNeighborsOf(userId);
        if (!alive) return;
        setLoadError(result === null);
        // 서버가 차단 관계를 거르지만, 로컬 전용 차단(서버 미반영)도 함께 가린다
        setList((result ?? []).filter((e) => !isBlocked({ handle: e.handle ?? undefined })));
        setLoading(false);
      })();
      return () => { alive = false; };
    }, [userId, isBlocked])
  );

  return (
    <View style={styles.root}>
      {/* 헤더 */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('friends.back')}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('friends.neighborsTitle')}</Text>
        {/* 좌우 균형용 투명 스페이서 */}
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.purpleNeon} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {list.length === 0 && (
            <Text style={styles.emptyText}>
              {loadError ? t('friends.neighborsLoadError') : t('friends.noNeighbors')}
            </Text>
          )}
          {list.map((entry, index) => {
            const name = entry.handle || '여행자';
            return (
              <React.Fragment key={entry.id}>
                <TouchableOpacity
                  style={styles.friendRow}
                  activeOpacity={0.75}
                  onPress={() => navigation.push('FriendProfile', { userId: entry.id, username: name, handle: entry.handle ?? undefined })}
                >
                  {/* 아바타 — 프로필 사진, 없으면 기본 아이콘(프로필탭과 동일) */}
                  {entry.photo ? (
                    <Image source={{ uri: entry.photo }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatar}>
                      <PersonIcon size={26} color="#A0A0B0" />
                    </View>
                  )}
                  <Text style={styles.username}>@{name}</Text>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
                {index < list.length - 1 && <View style={styles.divider} />}
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
  headerSpacer: { width: 40, height: 40 },
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
    backgroundColor: '#1F1F22', // 프로필탭 기본 아바타와 동일
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  username: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.purpleNeon,
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
