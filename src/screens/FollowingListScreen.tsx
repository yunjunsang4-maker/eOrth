import React, { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { useRecords } from '../store/recordStore';
import { PersonIcon } from '../components/icons';
import UserActionSheet from '../components/UserActionSheet';
import { handleBlock as confirmBlock } from '../utils/reportAndBlock';
import { buzz } from '../utils/haptics';
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

export default function FollowingListScreen({ navigation }: RootStackScreenProps<'FollowingList'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { neighbors, removeNeighbor, blockUser } = useRecords();

  // DM으로 이동 — username은 handle과 동일 값이라 name/handle 겸용
  const openDM = (friend: (typeof neighbors)[number]) => {
    buzz('light');
    navigation.navigate('DM', {
      friend: { name: friend.username, handle: friend.username, emoji: friend.emoji || '👤', photo: friend.photo, id: friend.id },
    });
  };

  // ⋯ 메뉴 — 커스텀 박스 시트(UserActionSheet)로 이웃 끊기/차단. 차단은 확인 후
  // store가 이웃 제거·서버 blocks까지 처리
  const [menuTarget, setMenuTarget] = useState<(typeof neighbors)[number] | null>(null);
  const openMenu = (friend: (typeof neighbors)[number]) => {
    buzz('light');
    setMenuTarget(friend);
  };
  const handleMenuUnfollow = () => {
    if (!menuTarget) return;
    removeNeighbor(menuTarget.id || menuTarget.username);
    setMenuTarget(null);
  };
  const handleMenuBlock = () => {
    if (!menuTarget) return;
    const target = menuTarget;
    setMenuTarget(null);
    // iOS: Modal이 닫히는 중 Alert를 즉시 띄우면 표시가 누락될 수 있어 닫힘 후로 지연
    setTimeout(() => {
      confirmBlock(target.username, () => {
        blockUser({ name: target.username, emoji: target.emoji || '👤', handle: target.username, id: target.id });
      }, t);
    }, 250);
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

      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {neighbors.length === 0 && (
          <Text style={styles.emptyText}>{t('friends.noNeighbors')}</Text>
        )}
        {neighbors.map((friend, index) => (
          <React.Fragment key={friend.id}>
            <TouchableOpacity
              style={styles.friendRow}
              activeOpacity={0.75}
              onPress={() => navigation.navigate('FriendProfile', { userId: friend.id, username: friend.username })}
            >
              {/* 아바타 — 프로필 사진, 없으면 기본 아이콘(프로필탭과 동일) */}
              {friend.photo ? (
                <Image source={{ uri: friend.photo }} style={styles.avatar} />
              ) : (
                <View style={styles.avatar}>
                  <PersonIcon size={26} color="#A0A0B0" />
                </View>
              )}

              {/* 정보 — 모든 이웃은 서로이웃이라 별도 표시 없음 */}
              <View style={styles.infoWrap}>
                <Text style={styles.username}>@{friend.username}</Text>
              </View>

              {/* DM + 더보기(언팔로우·차단) */}
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={(e) => { e.stopPropagation?.(); openDM(friend); }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('friends.dmNameA11y', { name: friend.username })}
              >
                <DmBubbleIcon />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={(e) => { e.stopPropagation?.(); openMenu(friend); }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('friends.moreNameA11y', { name: friend.username })}
              >
                <Text style={styles.dotsText}>⋯</Text>
              </TouchableOpacity>
            </TouchableOpacity>

            {index < neighbors.length - 1 && (
              <View style={styles.divider} />
            )}
          </React.Fragment>
        ))}
      </ScrollView>

      {/* ⋯ 메뉴 — 커스텀 박스 시트 */}
      <UserActionSheet
        visible={!!menuTarget}
        name={menuTarget?.username ?? ''}
        showUnfollow
        onClose={() => setMenuTarget(null)}
        onUnfollow={handleMenuUnfollow}
        onBlock={handleMenuBlock}
      />
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
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textDim,
    lineHeight: 18,
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
