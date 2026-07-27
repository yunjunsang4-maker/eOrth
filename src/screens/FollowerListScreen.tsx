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
  fetchNeighbors,
  fetchIncomingNeighborRequests,
  type NeighborProfile,
  type IncomingNeighborRequest,
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
  // 메이트 관계 액션은 store 경유 — store의 메이트 목록·배지와 동기화
  const { removeNeighbor, acceptNeighbor, declineNeighbor, isBlocked } = useRecords();
  const [followers, setFollowers] = useState<NeighborProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false); // 오류 ↔ "메이트 없음" 구분
  // 받은 메이트신청 (비공개 계정일 때 쌓임) — 수락/거절
  const [requests, setRequests] = useState<IncomingNeighborRequest[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null); // 중복 탭 방지

  // DM으로 이동
  const openDM = (follower: NeighborProfile) => {
    buzz('light');
    const name = follower.handle || '여행자';
    navigation.navigate('DM', {
      friend: { name, handle: follower.handle || name, emoji: follower.emoji || '👤', photo: follower.photo ?? undefined, id: follower.id },
    });
  };

  // ✕ 버튼 — 메이트 끊기 (확인 1번 → store가 서버 neighbors 삭제 → 목록 반영)
  const [removingId, setRemovingId] = useState<string | null>(null);
  const handleRemoveNeighbor = (neighbor: NeighborProfile) => {
    if (removingId) return;
    buzz('light');
    const name = neighbor.handle || '여행자';
    Alert.alert(t('friends.removeNeighborTitle'), t('friends.removeNeighborMsg', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('friends.removeNeighbor'),
        style: 'destructive',
        onPress: () => {
          setRemovingId(neighbor.id);
          try {
            removeNeighbor(neighbor.id);
            setFollowers((prev) => prev.filter((f) => f.id !== neighbor.id));
          } finally {
            setRemovingId(null);
          }
        },
      },
    ]);
  };

  // 메이트은 store에도 있지만 신청 섹션 병합·최신 서버값을 위해 진입 시 백엔드에서 조회한다.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        setLoading(true);
        const [list, reqs] = await Promise.all([
          fetchNeighbors(), // 오류 시 null
          fetchIncomingNeighborRequests(),
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

  // 신청 수락 → 요청자가 메이트이 되므로 메이트 목록에 즉시 반영
  const handleAccept = (req: IncomingNeighborRequest) => {
    if (processingId) return;
    buzz('light');
    setProcessingId(req.requesterId);
    try {
      acceptNeighbor(req.requesterId);
      setRequests((prev) => prev.filter((r) => r.requesterId !== req.requesterId));
      setFollowers((prev) =>
        prev.some((f) => f.id === req.requesterId)
          ? prev
          : [{ id: req.requesterId, handle: req.handle, emoji: req.emoji, photo: req.photo }, ...prev]
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = (req: IncomingNeighborRequest) => {
    if (processingId) return;
    buzz('light');
    setProcessingId(req.requesterId);
    try {
      declineNeighbor(req.requesterId);
      setRequests((prev) => prev.filter((r) => r.requesterId !== req.requesterId));
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
        <Text style={styles.headerTitle}>{t('friends.neighborsTitle')}</Text>
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
          {/* ── 받은 메이트신청 (비공개 계정) — 수락/거절 ── */}
          {requests.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>{t('friends.neighborRequestsN', { count: requests.length })}</Text>
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
              <Text style={styles.sectionLabel}>{t('friends.neighborsTitle')}</Text>
            </>
          )}

          {followers.length === 0 && (
            <Text style={styles.emptyText}>
              {loadError ? t('friends.neighborsLoadError') : t('friends.noNeighbors')}
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

                  {/* 정보 — 모든 메이트은 서로메이트이라 별도 표시 없음 */}
                  <View style={styles.infoWrap}>
                    <Text style={styles.username}>@{name}</Text>
                  </View>

                  {/* DM + ✕(메이트 끊기) */}
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
                    onPress={(e) => { e.stopPropagation?.(); handleRemoveNeighbor(follower); }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={t('friends.removeNeighbor')}
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
  // ── 받은 메이트신청 ──
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
