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
import {
  fetchFollowers,
  fetchIncomingFollowRequests,
  acceptFollowRequest,
  declineFollowRequest,
  type FollowedProfile,
  type IncomingFollowRequest,
} from '../services/social';
import { useRecords } from '../store/recordStore';
import { buzz } from '../utils/haptics';
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
  // 맞팔로우 버튼 — 팔로우 상태는 store 공유(팔로잉 목록·프로필 카운트와 동기화)
  const { followingUsers, followUser } = useRecords();
  const isFollowing = (id: string) => followingUsers.some((f) => f.id === id);
  const followBack = (follower: FollowedProfile) => {
    buzz('light');
    followUser({
      id: follower.id,
      username: follower.handle || follower.id,
      emoji: follower.emoji ?? undefined,
      isAbroad: false,
      currentCountry: null,
      currentCountryFlag: null,
    });
  };
  const [followers, setFollowers] = useState<FollowedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false); // 오류 ↔ "팔로워 없음" 구분
  // 받은 팔로우 요청 (비공개 계정일 때 쌓임) — 수락/거절
  const [requests, setRequests] = useState<IncomingFollowRequest[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null); // 중복 탭 방지

  // 팔로워는 로컬 스토어에 없으므로 진입 시 백엔드에서 조회한다.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        setLoading(true);
        const [list, reqs] = await Promise.all([
          fetchFollowers(), // 오류 시 null
          fetchIncomingFollowRequests(),
        ]);
        if (!alive) return;
        setLoadError(list === null);
        setFollowers(list ?? []);
        setRequests(reqs);
        setLoading(false);
      })();
      return () => { alive = false; };
    }, [])
  );

  // 요청 수락 → 요청자가 팔로워가 되므로 팔로워 목록에 즉시 반영
  const handleAccept = async (req: IncomingFollowRequest) => {
    if (processingId) return;
    buzz('light');
    setProcessingId(req.requesterId);
    try {
      await acceptFollowRequest(req.requesterId);
      setRequests((prev) => prev.filter((r) => r.requesterId !== req.requesterId));
      setFollowers((prev) =>
        prev.some((f) => f.id === req.requesterId)
          ? prev
          : [{ id: req.requesterId, handle: req.handle, emoji: req.emoji, isMutual: false }, ...prev]
      );
    } catch {
      // 실패 시 목록 유지 — 다시 시도 가능
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (req: IncomingFollowRequest) => {
    if (processingId) return;
    buzz('light');
    setProcessingId(req.requesterId);
    try {
      await declineFollowRequest(req.requesterId);
      setRequests((prev) => prev.filter((r) => r.requesterId !== req.requesterId));
    } catch {
      // 실패 시 목록 유지
    } finally {
      setProcessingId(null);
    }
  };

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
          {/* ── 받은 팔로우 요청 (비공개 계정) — 수락/거절 ── */}
          {requests.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>{t('friends.followRequestsN', { count: requests.length })}</Text>
              {requests.map((req) => {
                const reqName = req.handle || '여행자';
                return (
                  <View key={req.requesterId} style={styles.friendRow}>
                    <TouchableOpacity
                      style={styles.requestInfoTap}
                      activeOpacity={0.75}
                      onPress={() => navigation.navigate('FriendProfile', { userId: req.requesterId, username: reqName, handle: req.handle ?? undefined })}
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{req.emoji || reqName[0].toUpperCase()}</Text>
                      </View>
                      <Text style={styles.username}>@{reqName}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.acceptBtn, processingId === req.requesterId && styles.btnBusy]}
                      onPress={() => handleAccept(req)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={t('friends.acceptRequestA11y', { name: reqName })}
                    >
                      <Text style={styles.acceptBtnText}>{t('friends.accept')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.declineBtn, processingId === req.requesterId && styles.btnBusy]}
                      onPress={() => handleDecline(req)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={t('friends.declineRequestA11y', { name: reqName })}
                    >
                      <Text style={styles.declineBtnText}>{t('friends.decline')}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              <Text style={styles.sectionLabel}>{t('friends.followersTitle')}</Text>
            </>
          )}

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
                    {(follower.isMutual || isFollowing(follower.id)) && (
                      <Text style={styles.mutualText}>{t('friends.mutualYes')}</Text>
                    )}
                  </View>

                  {/* 맞팔로우 버튼 (아직 안 팔로우한 팔로워만) / 이미 팔로우 중이면 화살표 */}
                  {!follower.isMutual && !isFollowing(follower.id) ? (
                    <TouchableOpacity
                      style={styles.followBackBtn}
                      onPress={(e) => { e.stopPropagation?.(); followBack(follower); }}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={t('friends.followNameA11y', { name })}
                    >
                      <Text style={styles.followBackBtnText}>{t('friends.followBack')}</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.chevron}>›</Text>
                  )}
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
  followBackBtn: {
    backgroundColor: COLORS.purpleDeep,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  followBackBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
  },

  // ── 받은 팔로우 요청 ──
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.purpleNeon,
    marginTop: 8,
    marginBottom: 4,
  },
  requestInfoTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  acceptBtn: {
    backgroundColor: COLORS.purpleDeep,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginLeft: 8,
  },
  acceptBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
  },
  declineBtn: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginLeft: 6,
  },
  declineBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDim,
  },
  btnBusy: {
    opacity: 0.5,
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
