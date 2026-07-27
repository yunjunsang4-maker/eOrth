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
import AuthorAvatar from '../components/AuthorAvatar';
import { CommentIcon, HeartIcon, FriendIcon, CameraIcon, PinIcon } from '../components/icons';

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

// 카테고리 배지 아이콘 — 시스템 이모지 대신 앱 제작 SVG 아이콘.
// 댓글은 CLAUDE.md 규칙대로 SVG 말풍선(CommentIcon)만 쓴다.
const CATEGORY_ICON: Record<CatKey, React.FC<{ size?: number; color?: string }>> = {
  comment: CommentIcon,
  like: HeartIcon,
  follow: FriendIcon,
  memory: CameraIcon,
  record: PinIcon,
};

interface Noti {
  id: string;
  category: CatKey;
  photo?: string;      // 행위자 프로필 사진 — 없으면 AuthorAvatar가 제작 실루엣으로 대체
  text: string;
  read: boolean;
  createdAt: number;   // 알림 도착 시각(ms) — 정렬·시간표시·만료 기준
  postId?: string;     // 댓글·좋아요·추억 리마인드 → 게시물 이동용
  userId?: string;     // 팔로우·기록 시작 → 프로필 이동용
  userName?: string;
  goRequests?: boolean; // 메이트신청 알림 → 수락/거절 가능한 메이트 목록 화면으로 이동
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

  // 메이트 알림 — 서버 notifications 테이블(메이트신청/수락 트리거로 쌓임)에서 로드
  const [followNotis, setFollowNotis] = useState<Noti[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);
  const loadFollowNotis = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const rows = await fetchNeighborNotifications();
    if (!aliveRef.current) return;
    // 메이트신청/수락별 문구 키 — 모두 '메이트' 카테고리로 묶어 표시
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
        photo: n.actorPhoto || undefined, // 사진 없으면 제작 실루엣(AuthorAvatar 규칙)
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

  // 알림 탭 시 이동: 댓글·좋아요·추억 → 게시물 / 메이트·기록 → 프로필
  // 게시물이 삭제된 경우 엉뚱한 게시물 대신 안내를 띄운다
  const openNoti = (n: Noti) => {
    // '1년 전 오늘'(추억 리마인드) 알림을 누르면 배지 55 획득(행동 기반, 영구 저장)
    if (n.category === 'memory') markBadgesEarned([55]);
    // 메이트 알림은 탭 시 읽음 처리 (서버 + 로컬 즉시 반영)
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
      // 메이트신청 → 수락/거절할 수 있는 메이트 목록 화면으로
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
  // 상대방이 필요한 좋아요·댓글·메이트과 달리 내 데이터만으로 생성 가능.
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
          // 추억 알림은 행위자가 없다 — 아바타 자리를 카테고리 아이콘(카메라)이 채운다
          text: t('misc.memoryText', { years: yearsAgo, place }),
          read: false,
          createdAt: todayStart,
          postId: r.id,
        });
      });
    return out;
    // t·언어도 의존 — 빠지면 언어를 바꿔도 추억 알림 문구가 이전 언어로 남는다
  }, [records, t, i18n.language]);

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

  // 아바타 — 행위자 사진(없으면 제작 실루엣) + 우하단에 카테고리 아이콘 배지.
  // 시스템 이모지를 쓰지 않는다(AuthorAvatar 규칙: profiles.emoji는 스키마 기본값이 박혀 있어
  // 폴백으로 쓰면 사진 없는 사용자가 전부 같은 이모지로 보인다).
  const AVA = 34;
  const NotiAvatar = ({ n }: { n: Noti }) => {
    const Icon = CATEGORY_ICON[n.category];
    const hasActor = n.category === 'follow' || n.category === 'record';
    return (
      <View style={{ width: AVA, height: AVA }}>
        {hasActor ? (
          <View style={[st.avatarRing, { borderColor: skinAccent.tint(0.35) }]}>
            <AuthorAvatar photo={n.photo} size={AVA - 2} />
          </View>
        ) : (
          // 행위자가 없는 알림(추억 등) — 카테고리 아이콘이 아바타 자리를 채운다
          <View style={[st.avatarIcon, { backgroundColor: skinAccent.tint(0.18), borderColor: skinAccent.tint(0.35) }]}>
            <Icon size={17} color={skinAccent.accent} />
          </View>
        )}
        {hasActor && (
          <View style={[st.catBadge, { backgroundColor: skinAccent.accent, borderColor: COLORS.bg }]}>
            <Icon size={9} color="#FFFFFF" />
          </View>
        )}
      </View>
    );
  };

  // 신규·본 알림 공용 가로 막대 (읽은 알림은 톤을 낮춰 구분)
  const renderBar = (n: Noti) => (
    <TouchableOpacity
      key={n.id}
      style={[
        st.bar,
        { borderColor: skinAccent.tint(0.20) },
        n.read && st.barRead,
      ]}
      activeOpacity={0.75}
      onPress={() => openNoti(n)}
      accessibilityRole="button"
      accessibilityLabel={n.text}
    >
      <NotiAvatar n={n} />
      <View style={st.barBody}>
        <Text style={[st.barText, n.read && st.barTextRead]} numberOfLines={2}>{n.text}</Text>
        <Text style={st.barTime}>{fmtAgo(n.createdAt, t)}</Text>
      </View>
      {/* 미읽음 표시 — 오른쪽 끝 점(읽으면 사라진다) */}
      {!n.read && <View style={[st.barDot, { backgroundColor: skinAccent.accent }]} />}
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

  // 알림 카드
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    marginLeft: 22, marginBottom: 8, paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: 'rgba(107,33,168,0.12)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(191,133,252,0.20)',
  },
  // 읽은 알림 — 지우지 않고 톤만 낮춰 새 알림과 구분
  barRead: { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)' },

  // 아바타(행위자 사진/실루엣) + 카테고리 배지
  avatarRing: {
    width: '100%', height: '100%', borderRadius: 999,
    borderWidth: 1, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  avatarIcon: {
    width: '100%', height: '100%', borderRadius: 999,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  catBadge: {
    position: 'absolute', right: -3, bottom: -3,
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 1.5, // 카드 배경색 링 — 아바타와 배지가 분리돼 보이게
    alignItems: 'center', justifyContent: 'center',
  },

  barBody: { flex: 1, gap: 3 },
  barText: { color: COLORS.white, fontSize: 12.5, lineHeight: 17 },
  barTextRead: { color: COLORS.textDim },
  barTime: { color: COLORS.textMuted, fontSize: 10 },
  barDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: COLORS.purpleNeon },
});
