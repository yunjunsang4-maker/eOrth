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
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import Svg, { Path as SvgPath } from 'react-native-svg';
import {
  fetchFollowers,
  fetchIncomingFollowRequests,
  acceptFollowRequest,
  declineFollowRequest,
  removeFollower,
  type FollowedProfile,
  type IncomingFollowRequest,
} from '../services/social';
import { useRecords } from '../store/recordStore';
import { buzz } from '../utils/haptics';
import { PersonIcon } from '../components/icons';
import type { RootStackScreenProps } from '../navigation/types';

// DM 말풍선 아이콘 — CLAUDE.md 아이콘 규칙(SVG 말풍선, scaleX -1)
function DmBubbleIcon({ size = 17, color = '#A1A1B0' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={{ transform: [{ scaleX: -1 }] }}>
      <SvgPath
        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

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
  const { followingUsers, followUser, isBlocked } = useRecords();
  const isFollowing = (id: string) => followingUsers.some((f) => f.id === id);
  const followBack = (follower: FollowedProfile) => {
    buzz('light');
    followUser({
      id: follower.id,
      username: follower.handle || follower.id,
      emoji: follower.emoji ?? undefined,
      photo: follower.photo ?? undefined,
      isAbroad: false,
      currentCountry: null,
      currentCountryFlag: null,
    });
    // 낙관 반영 — 서버 refreshFollowing 완료 전까지 버튼이 남는 깜빡임/연타 방지
    setFollowers((prev) => prev.map((f) => (f.id === follower.id ? { ...f, isMutual: true } : f)));
  };
  const [followers, setFollowers] = useState<FollowedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false); // 오류 ↔ "팔로워 없음" 구분
  // 받은 팔로우 요청 (비공개 계정일 때 쌓임) — 수락/거절
  const [requests, setRequests] = useState<IncomingFollowRequest[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null); // 중복 탭 방지

  // DM으로 이동
  const openDM = (follower: FollowedProfile) => {
    buzz('light');
    const name = follower.handle || '여행자';
    navigation.navigate('DM', {
      friend: { name, handle: follower.handle || name, emoji: follower.emoji || '👤', photo: follower.photo ?? undefined, id: follower.id },
    });
  };

  // X 버튼 — 팔로워에서 빠르게 제거 (확인 1번 → 서버 follows 삭제 → 목록 반영)
  const [removingId, setRemovingId] = useState<string | null>(null);
  const handleRemoveFollower = (follower: FollowedProfile) => {
    if (removingId) return;
    buzz('light');
    const name = follower.handle || '여행자';
    Alert.alert(t('friends.removeFollowerTitle'), t('friends.removeFollowerMsg', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('friends.remove'),
        style: 'destructive',
        onPress: async () => {
          setRemovingId(follower.id);
          try {
            await removeFollower(follower.id);
            setFollowers((prev) => prev.filter((f) => f.id !== follower.id));
          } catch {
            // 실패 시 목록 유지 — 다시 시도 가능
          } finally {
            setRemovingId(null);
          }
        },
      },
    ]);
  };

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
        // 로컬 전용 차단(서버 미반영) 항목도 목록에서 가리기 — 서버 트리거가 못 지운 행 대비
        setFollowers((list ?? []).filter((f) => !isBlocked({ handle: f.handle ?? undefined })));
        setRequests(reqs.filter((r) => !isBlocked({ handle: r.handle ?? undefined })));
        setLoading(false);
      })();
      return () => { alive = false; };
    }, [isBlocked])
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
          : [{ id: req.requesterId, handle: req.handle, emoji: req.emoji, photo: req.photo, isMutual: false }, ...prev]
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
        {/* 좌우 균형용 투명 스페이서 — backBtn 스타일을 쓰면 빈 원이 보인다 */}
        <View style={styles.headerSpacer} />
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
                      {req.photo ? (
                        <Image source={{ uri: req.photo }} style={styles.avatar} />
                      ) : (
                        <View style={styles.avatar}>
                          <PersonIcon size={26} color="#A0A0B0" />
                        </View>
                      )}
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
                  {/* 아바타 — 프로필 사진, 없으면 기본 아이콘(프로필탭과 동일) */}
                  {follower.photo ? (
                    <Image source={{ uri: follower.photo }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatar}>
                      <PersonIcon size={26} color="#A0A0B0" />
                    </View>
                  )}

                  {/* 정보 */}
                  <View style={styles.infoWrap}>
                    <Text style={styles.username}>@{name}</Text>
                    {(follower.isMutual || isFollowing(follower.id)) && (
                      <Text style={styles.mutualText}>{t('friends.mutualYes')}</Text>
                    )}
                  </View>

                  {/* 맞팔로우 버튼 (아직 안 팔로우한 팔로워만) */}
                  {!follower.isMutual && !isFollowing(follower.id) && (
                    <TouchableOpacity
                      style={styles.followBackBtn}
                      onPress={(e) => { e.stopPropagation?.(); followBack(follower); }}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={t('friends.followNameA11y', { name })}
                    >
                      <Text style={styles.followBackBtnText}>{t('friends.followBack')}</Text>
                    </TouchableOpacity>
                  )}

                  {/* DM + X(팔로워에서 제거) */}
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={(e) => { e.stopPropagation?.(); openDM(follower); }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={t('friends.dmNameA11y', { name })}
                  >
                    <DmBubbleIcon />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, removingId === follower.id && styles.btnBusy]}
                    onPress={(e) => { e.stopPropagation?.(); handleRemoveFollower(follower); }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={t('friends.removeFollowerA11y', { name })}
                  >
                    <Text style={styles.removeText}>✕</Text>
                  </TouchableOpacity>
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
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDim,
    lineHeight: 17,
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
