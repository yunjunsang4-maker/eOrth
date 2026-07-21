import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import AppRefreshControl from '../components/AppRefreshControl';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useRecords } from '../store/recordStore';
import { useSettings } from '../store/settingsStore';
import { isSupabaseConfigured } from '../services/supabase';
import { fetchNeighborNotifications, markNotificationsRead } from '../services/social';
import type { RootStackScreenProps } from '../navigation/types';
import { useSkinAccent } from '../constants/skinTheme';
import { countryLabel } from '../utils/countryLabel';

const COLORS = {
  bg:          '#0A0A0F',
  card:        '#2E2E3B',
  divider:     '#1A1A26',
  purpleNeon:  '#BF85FC',
  purpleDeep:  '#6B21A8',
  white:       '#FFFFFF',
  textDim:     '#A1A1B0',
  textMuted:   '#8B8B9E',
};

const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

type Props = RootStackScreenProps<'Notifications'>;

// 알림 카테고리 (매거진 "서브젝트")
type CatKey = 'comment' | 'like' | 'follow' | 'memory' | 'record';
const CATEGORY_LABEL_KEY: Record<CatKey, string> = {
  comment: 'misc.catComment',
  like: 'misc.catLike',
  follow: 'misc.catFollow',
  memory: 'misc.catMemory',
  record: 'misc.catRecord',
};

interface Noti {
  id: string;
  category: CatKey;
  emoji: string;       // 행위자 프로필 아바타 (이모지)
  avbg: string;        // 아바타 배경색
  text: string;
  read: boolean;
  createdAt: number;   // 알림 도착 시각(ms) — 정렬·시간표시·만료 기준
  postId?: string;     // 댓글·좋아요·추억 리마인드 → 게시물 이동용
  userId?: string;     // 팔로우·기록 시작 → 프로필 이동용
  userName?: string;
  goRequests?: boolean; // 이웃신청 알림 → 수락/거절 가능한 이웃 목록 화면으로 이동
}

// 게시물로 이동하는 카테고리
const POST_CATEGORIES: CatKey[] = ['comment', 'like', 'memory'];

// 시간 상수 / 알림 보존 기간 (도착 후 1주일 지나면 사라짐)
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOTI_MAX_AGE = 7 * DAY;

// 상대 시간 표시
function fmtAgo(ts: number, tr: TFunction): string {
  const d = Date.now() - ts;
  if (d < MIN) return tr('time.justNow');
  if (d < HOUR) return tr('time.minAgo', { n: Math.floor(d / MIN) });
  if (d < DAY) return tr('time.hourAgo', { n: Math.floor(d / HOUR) });
  if (d < 2 * DAY) return tr('time.yesterday');
  return tr('time.dayAgo', { n: Math.floor(d / DAY) });
}

// 알림은 실제 활동으로 채워진다 — 신규 사용자는 빈 상태로 시작 (데모 시드 제거).
// 좋아요·댓글·팔로우는 상대 사용자(백엔드)가 있어야 발생하므로 더미를 넣지 않는다.
// 단, '추억 리마인드(N년 전 오늘)'는 내 기록만으로 만들 수 있어 컴포넌트에서 계산한다(memoryNotis).

export default function NotificationScreen({ navigation }: Props) {
  const { t, i18n } = useTranslation();
  const skinAccent = useSkinAccent(); // 알림 강조(볼륨·인덱스·미읽음 닷·테두리)를 스킨색으로
  const { records, isMuted, isBlocked } = useRecords();
  const { markBadgesEarned } = useSettings();
  const [expanded, setExpanded] = useState<CatKey | null>(null);

  // 이웃 알림 — 서버 notifications 테이블(이웃신청/수락 트리거로 쌓임)에서 로드
  const [followNotis, setFollowNotis] = useState<Noti[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);
  const loadFollowNotis = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const rows = await fetchNeighborNotifications();
    if (!aliveRef.current) return;
    // 이웃신청/수락별 문구 키 — 모두 '이웃' 카테고리로 묶어 표시
    const textKey: Record<string, string> = {
      neighbor_request: 'misc.neighborRequestText',
      neighbor_accept: 'misc.neighborAcceptText',
    };
    setFollowNotis(
      rows
        // 뮤트/차단한 사용자의 알림은 표시하지 않는다 (뮤트 = 알림 끔의 실제 적용 지점)
        .filter((n) => !n.actorHandle || (!isMuted(n.actorHandle) && !isBlocked({ handle: n.actorHandle })))
        .map((n) => ({
        id: `fol-${n.id}`, // 접두사로 로컬 알림과 id 충돌 방지 (읽음 처리 시 제거)
        category: 'follow' as CatKey,
        emoji: n.actorEmoji || '👤',
        avbg: 'rgba(107,33,168,0.35)',
        text: t(textKey[n.type] ?? 'misc.neighborRequestText', { name: n.actorHandle || t('friends.travelerDefault') }),
        read: n.read,
        createdAt: n.createdAt,
        userId: n.actorId,
        userName: n.actorHandle || '',
        goRequests: n.type === 'neighbor_request',
      }))
    );
  }, [t, isMuted, isBlocked]);
  useEffect(() => { loadFollowNotis(); }, [loadFollowNotis]);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await loadFollowNotis(); } finally { if (aliveRef.current) setRefreshing(false); }
  }, [loadFollowNotis]);

  // 알림 탭 시 이동: 댓글·좋아요·추억 → 게시물 / 이웃·기록 → 프로필
  // 게시물이 삭제된 경우 엉뚱한 게시물 대신 안내를 띄운다
  const openNoti = (n: Noti) => {
    // '1년 전 오늘'(추억 리마인드) 알림을 누르면 배지 55 획득(행동 기반, 영구 저장)
    if (n.category === 'memory') markBadgesEarned([55]);
    // 이웃 알림은 탭 시 읽음 처리 (서버 + 로컬 즉시 반영)
    if (n.category === 'follow' && !n.read && n.id.startsWith('fol-')) {
      markNotificationsRead([n.id.slice(4)]);
      setFollowNotis((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    if (POST_CATEGORIES.includes(n.category)) {
      if (n.postId && records.some((r) => r.id === n.postId)) {
        navigation.navigate('PostDetail', { postId: n.postId });
      } else {
        Alert.alert(t('misc.noPostTitle'), t('misc.noPostMsg'));
      }
    } else if (n.goRequests) {
      // 이웃신청 → 수락/거절할 수 있는 이웃 목록 화면으로
      navigation.navigate('FollowerList');
    } else {
      navigation.navigate('FriendProfile', { userId: n.userId ?? null, username: n.userName ?? '', handle: n.userName || undefined });
    }
  };

  // VOL.월-주차 + 날짜
  const today = new Date();
  const vol = `VOL.${today.getMonth() + 1}-${Math.ceil(today.getDate() / 7)}`;
  const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;

  // '추억 리마인드' — 내 기록 중 오늘과 같은 월·일(과거 연도)인 여행을 'N년 전 오늘' 알림으로 만든다.
  // 상대방이 필요한 좋아요·댓글·이웃과 달리 내 데이터만으로 생성 가능.
  const memoryNotis = useMemo<Noti[]>(() => {
    const today = new Date();
    const mm = today.getMonth();
    const dd = today.getDate();
    const todayStart = new Date(today.getFullYear(), mm, dd).getTime();
    const out: Noti[] = [];
    records
      .filter((r) => r.isMyPost !== false)
      .forEach((r) => {
        const ds = r.date || r.startDate;
        if (!ds) return;
        const [y, m, d] = ds.split('.').map((s) => parseInt(s, 10));
        if (!y || !m || !d) return;
        if (m - 1 !== mm || d !== dd) return; // 오늘과 같은 월·일만
        const yearsAgo = today.getFullYear() - y;
        if (yearsAgo <= 0) return; // 과거 연도만
        const placeRaw = r.countryName || r.countries?.[0]?.name;
        const place = placeRaw ? countryLabel(placeRaw, i18n.language) : t('misc.tripDefault');
        out.push({
          id: `mem-${r.id}`,
          category: 'memory',
          emoji: r.countryFlag || '📸',
          avbg: 'rgba(107,33,168,0.35)',
          text: t('misc.memoryText', { years: yearsAgo, place }),
          read: false,
          createdAt: todayStart,
          postId: r.id,
        });
      });
    return out;
  }, [records]);

  // 도착 후 1주일 지난 알림은 제외 → 알림 있는 카테고리만, 최신순으로 그룹
  const cats = useMemo(() => {
    const now = Date.now();
    const fresh = [...memoryNotis, ...followNotis].filter((n) => now - n.createdAt <= NOTI_MAX_AGE);
    const map = new Map<CatKey, Noti[]>();
    fresh.forEach((n) => {
      if (!map.has(n.category)) map.set(n.category, []);
      map.get(n.category)!.push(n);
    });
    return Array.from(map.entries())
      .map(([key, items]) => {
        const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);
        return { key, items: sorted, newest: sorted[0].createdAt };
      })
      .sort((a, b) => b.newest - a.newest);
  }, [memoryNotis, followNotis]);

  const Avatar = ({ emoji, bg, size = 28 }: { emoji: string; bg: string; size?: number }) => (
    <View style={[st.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={{ fontSize: size * 0.52 }}>{emoji}</Text>
    </View>
  );

  // 신규·본 알림 공용 가로 막대 (본 알림은 미읽음 점만 비움)
  const renderBar = (n: Noti) => (
    <TouchableOpacity key={n.id} style={[st.bar, { borderColor: skinAccent.tint(0.20) }]} activeOpacity={0.75} onPress={() => openNoti(n)}>
      <View style={[st.barDot, { backgroundColor: skinAccent.accent }, n.read && st.barDotRead]} />
      <Avatar emoji={n.emoji} bg={n.avbg} />
      <Text style={st.barText} numberOfLines={1}>{n.text}</Text>
      <Text style={st.barTime}>{fmtAgo(n.createdAt, t)}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={st.safeArea}>
      {/* 헤더 */}
      <View style={st.header}>
        <TouchableOpacity style={st.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('friends.back')}>
          <Text style={st.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>{t('misc.notifTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={st.scroll}
        contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* 매거진 표지 */}
        <View style={st.cover}>
          <Text style={[st.vol, { color: skinAccent.accent }]}>{`eOrth Weekly · ${vol}`}</Text>
          <Text style={[st.mast, { fontFamily: SERIF }]}>{t('misc.recentNews')}</Text>
          <Text style={st.date}>{dateStr}</Text>
        </View>
        <View style={st.rule} />
        <Text style={st.contentsLabel}>{t('misc.contents')}</Text>

        {cats.length === 0 && (
          <Text style={st.empty}>{t('misc.noNews')}</Text>
        )}

        {cats.map((cat, i) => {
          const newItems = cat.items.filter((n) => !n.read);
          const readItems = cat.items.filter((n) => n.read);
          const open = expanded === cat.key;
          const hasRead = readItems.length > 0;

          return (
            <View key={cat.key} style={st.catBlock}>
              {/* 목차 행 — 우측 배지(전체 개수) 누르면 본 알림 펼침 */}
              <TouchableOpacity
                style={st.idxRow}
                activeOpacity={hasRead ? 0.6 : 1}
                onPress={() => { if (hasRead) setExpanded(open ? null : cat.key); }}
              >
                <Text style={[st.idxNum, { fontFamily: SERIF, color: skinAccent.accent }]}>{String(i + 1).padStart(2, '0')}</Text>
                <Text style={[st.idxName, { fontFamily: SERIF }]}>{t(CATEGORY_LABEL_KEY[cat.key])}</Text>
                <View style={st.leader} />
                <Text style={[st.badge, open && [st.badgeOpen, { color: skinAccent.accent }]]}>
                  {cat.items.length}{hasRead ? (open ? ' ▾' : ' ›') : ''}
                </Text>
              </TouchableOpacity>

              {/* 새 알림 (항상 표시) */}
              {newItems.map(renderBar)}

              {/* 본 알림 (펼치면 같은 막대 형식으로 표시) */}
              {open && readItems.map(renderBar)}
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.divider,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card, borderRadius: 20 },
  backIcon: { fontSize: 20, color: COLORS.white },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: COLORS.white },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 16 },

  // 표지
  cover: { alignItems: 'center' },
  vol: { color: COLORS.purpleNeon, fontSize: 10, letterSpacing: 2.5, textTransform: 'uppercase' },
  mast: { color: COLORS.white, fontSize: 26, marginTop: 6, marginBottom: 3 },
  date: { color: COLORS.textMuted, fontSize: 10 },
  rule: { height: 1, backgroundColor: COLORS.divider, marginVertical: 14 },
  contentsLabel: { color: COLORS.textMuted, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 },
  empty: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 40 },

  // 목차 행
  catBlock: { marginBottom: 6 },
  idxRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  idxNum: { color: COLORS.purpleNeon, fontSize: 11, width: 22 },
  idxName: { color: COLORS.white, fontSize: 15 },
  leader: { flex: 1, height: 1, borderBottomWidth: 1, borderColor: '#2A2A38', borderStyle: 'dotted', marginHorizontal: 8 },
  badge: { color: COLORS.textDim, fontSize: 13 },
  badgeOpen: { color: COLORS.purpleNeon },

  // 새 알림 가로 막대
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    marginLeft: 22, marginBottom: 7, paddingVertical: 8, paddingHorizontal: 10,
    backgroundColor: 'rgba(107,33,168,0.12)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(191,133,252,0.20)',
  },
  barDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.purpleNeon },
  barDotRead: { backgroundColor: 'transparent' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  barText: { flex: 1, color: COLORS.white, fontSize: 12 },
  barTime: { color: COLORS.textMuted, fontSize: 10 },
});
