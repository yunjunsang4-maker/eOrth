import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import AppRefreshControl from '../components/AppRefreshControl';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert, ActivityIndicator,
  Image, Animated,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useRecords } from '../store/recordStore';
import { useSettings } from '../store/settingsStore';
import { isSupabaseConfigured } from '../services/supabase';
import { fetchAppNotifications, markNotificationsRead, markAllNotificationsRead, type AppNotificationType } from '../services/social';
import type { RootStackScreenProps } from '../navigation/types';
import { useSkinAccent } from '../constants/skinTheme';
import { countryLabel } from '../utils/countryLabel';
import { saveEnvelope, loadEnvelope, STORE_KEYS } from '../store/persist';
import AuthorAvatar from '../components/AuthorAvatar';
import { CommentIcon, HeartIcon, FriendIcon, CameraIcon, PinIcon } from '../components/icons';
import { useEntranceAnimation } from '../components/LiquidEffects';
import { EXAMPLE_NOTIS } from '../constants/exampleContent';
import type { TravelRecord } from '../store/recordStore';

// 알림이 가리키는 게시물의 대표 사진 — 어느 기록에 대한 알림인지 한눈에 읽히게.
// 형식마다 사진이 담기는 자리가 달라 순서대로 훑는다(TripDetail의 pickPhoto와 동일 규칙).
const pickThumb = (r?: TravelRecord): string | undefined =>
  r?.representativePhoto || r?.medias?.[0] || r?.cutPhoto?.previewUri || r?.snapBackUri || r?.snapFrontUri;

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
  postId?: string;     // 댓글·좋아요·추억 리마인드 → 게시물 이동용 (썸네일도 이걸로 조회)
  userId?: string;     // 팔로우·기록 시작 → 프로필 이동용
  userName?: string;
  goRequests?: boolean; // 메이트신청 알림 → 수락/거절 가능한 메이트 목록 화면으로 이동
  groupIds?: string[];  // 묶인 알림들의 id — 대표를 탭하면 전부 읽음 처리
  isExample?: boolean;  // eOrth 안내용 예시 알림 — 탭 이동·읽음 처리 없음
}

// 시간 구간 — 매거진 목차 안에서 '언제'를 읽히게 하는 소제목
type TimeBucket = 'today' | 'week' | 'earlier';
const TIME_BUCKET_KEY: Record<TimeBucket, string> = {
  today: 'misc.bucketToday',
  week: 'misc.bucketWeek',
  earlier: 'misc.bucketEarlier',
};
function bucketOf(ts: number): TimeBucket {
  const d = Date.now() - ts;
  if (d < 24 * 60 * 60 * 1000) return 'today';
  if (d < 7 * 24 * 60 * 60 * 1000) return 'week';
  return 'earlier';
}

// 게시물로 이동하는 카테고리 (record=이웃의 새 기록도 게시물로 간다)
const POST_CATEGORIES: CatKey[] = ['comment', 'like', 'memory', 'record'];

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
  const { records, feedPosts, isMuted, isBlocked } = useRecords();
  const { markBadgesEarned } = useSettings();
  const [expanded, setExpanded] = useState<CatKey | null>(null);

  // 읽은 추억 알림 id — 로컬 계산 알림이라 서버 read가 없어 기기에 저장한다
  const [memoryRead, setMemoryRead] = useState<Set<string>>(new Set());
  useEffect(() => {
    loadEnvelope<string[]>(STORE_KEYS.memoryNotiRead).then((ids) => {
      if (ids?.length) setMemoryRead(new Set(ids));
    });
  }, []);
  const markMemoryRead = useCallback((id: string) => {
    setMemoryRead((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      // 기록이 지워지면 그 id는 다시 안 나오므로 무한정 쌓이지 않는다(상한만 안전장치로)
      saveEnvelope(STORE_KEYS.memoryNotiRead, Array.from(next).slice(-500));
      return next;
    });
  }, []);

  // 서버 알림 — 메이트 신청/수락 + 좋아요·댓글·답글·이웃 새 기록(schema.sql 10-c/d/e 트리거)
  const [serverNotis, setServerNotis] = useState<Noti[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);
  const loadServerNotis = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    const rows = await fetchAppNotifications();
    if (!aliveRef.current) return;
    // 타입 → 카테고리·문구 키. 서버 트리거 타입이 늘면 여기만 추가하면 된다.
    const TYPE_MAP: Record<AppNotificationType, { cat: CatKey; key: string }> = {
      neighbor_request: { cat: 'follow',  key: 'misc.neighborRequestText' },
      neighbor_accept:  { cat: 'follow',  key: 'misc.neighborAcceptText' },
      like:             { cat: 'like',    key: 'misc.likeText' },
      comment:          { cat: 'comment', key: 'misc.commentText' },
      reply:            { cat: 'comment', key: 'misc.replyText' },
      friend_post:      { cat: 'record',  key: 'misc.friendPostText' },
    };
    setServerNotis(
      rows
        // 뮤트/차단한 사용자의 알림은 표시하지 않는다 (뮤트 = 알림 끔의 실제 적용 지점)
        .filter((n) => !n.actorHandle || (!isMuted(n.actorHandle) && !isBlocked({ handle: n.actorHandle })))
        .map((n) => {
          const m = TYPE_MAP[n.type] ?? TYPE_MAP.neighbor_request;
          return {
            id: `srv-${n.id}`, // 접두사로 로컬 알림과 id 충돌 방지 (읽음 처리 시 제거)
            category: m.cat,
            photo: n.actorPhoto || undefined, // 사진 없으면 제작 실루엣(AuthorAvatar 규칙)
            text: t(m.key, { name: n.actorHandle || t('friends.travelerDefault') }),
            read: n.read,
            createdAt: n.createdAt,
            postId: n.postId || undefined,
            userId: n.actorId,
            userName: n.actorHandle || '',
            goRequests: n.type === 'neighbor_request',
          };
        })
    );
    setLoading(false);
  }, [t, isMuted, isBlocked]);
  useEffect(() => { loadServerNotis(); }, [loadServerNotis]);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await loadServerNotis(); } finally { if (aliveRef.current) setRefreshing(false); }
  }, [loadServerNotis]);

  // 알림 탭 시 이동: 댓글·좋아요·추억 → 게시물 / 메이트·기록 → 프로필
  // 게시물이 삭제된 경우 엉뚱한 게시물 대신 안내를 띄운다
  const openNoti = (n: Noti) => {
    // 예시 알림은 가리킬 게시물·사용자가 없다 — 안내용이라 탭해도 아무 일도 하지 않는다
    if (n.isExample) return;
    // '1년 전 오늘'(추억 리마인드) 알림을 누르면 배지 55 획득(행동 기반, 영구 저장)
    if (n.category === 'memory') markBadgesEarned([55]);
    // 서버 알림은 탭 시 읽음 처리 (서버 + 로컬 즉시 반영).
    // 묶음이면 묶인 알림 전부 — 대표만 처리하면 배지가 안 내려간다.
    if (!n.read && n.id.startsWith('srv-')) {
      const ids = n.groupIds ?? [n.id];
      markNotificationsRead(ids.map((i) => i.slice(4)));
      const idSet = new Set(ids);
      setServerNotis((prev) => prev.map((x) => (idSet.has(x.id) ? { ...x, read: true } : x)));
    }
    // 추억 알림은 로컬 계산이라 서버 읽음 상태가 없다 — 기기에 읽음 id를 저장한다
    if (n.category === 'memory' && !n.read) markMemoryRead(n.id);
    if (POST_CATEGORIES.includes(n.category)) {
      // 서버 알림의 post_id는 '서버' posts.id다. 내 기록은 로컬 id로 저장되고 서버 id는
      // remoteId에 들어 있어, 그대로 넘기면 PostDetail이 못 찾아 '게시물 없음'이 떴다.
      // 로컬 기록이면 로컬 id로 바꿔 넘기고, 이웃 글이면 피드 캐시(feedPosts)에서 찾는다.
      const mine = n.postId ? records.find((r) => r.remoteId === n.postId || r.id === n.postId) : null;
      const resolved = mine ? mine.id : (n.postId && feedPosts.some((r) => r.id === n.postId) ? n.postId : null);
      if (resolved) {
        navigation.navigate('PostDetail', { postId: resolved });
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
          read: memoryRead.has(`mem-${r.id}`),
          createdAt: todayStart,
          postId: r.id, // 렌더 시 이 id로 대표 사진(썸네일)까지 함께 찾는다
        });
      });
    return out;
    // t·언어도 의존 — 빠지면 언어를 바꿔도 추억 알림 문구가 이전 언어로 남는다
  }, [records, t, i18n.language, memoryRead]);

  // 알림의 대상 게시물 조회 — 내 기록은 remoteId(서버 id)로, 이웃 글은 피드 캐시에서.
  // 알림을 만들 때가 아니라 렌더 시점에 찾는다 — 기록·피드가 나중에 로드돼도 썸네일이 채워진다.
  const postOf = useCallback(
    (postId?: string) =>
      postId
        ? records.find((r) => r.remoteId === postId || r.id === postId) ?? feedPosts.find((r) => r.id === postId)
        : undefined,
    [records, feedPosts]
  );

  // 모두 읽음 — 서버 일괄 처리 + 화면 즉시 반영(로컬 추억 알림도 함께).
  // 하나씩 탭해야 배지가 내려가던 불편을 없앤다.
  const unreadCount = useMemo(
    () => [...serverNotis, ...memoryNotis].filter((n) => !n.read).length,
    [serverNotis, memoryNotis]
  );
  const onMarkAllRead = useCallback(() => {
    markAllNotificationsRead();
    setServerNotis((prev) => prev.map((n) => ({ ...n, read: true })));
    memoryNotis.forEach((n) => { if (!n.read) markMemoryRead(n.id); });
  }, [memoryNotis, markMemoryRead]);

  // 같은 대상(게시물+카테고리)에 대한 알림 묶기 — "○○님 외 3명이 좋아해요".
  // 인기 게시물 하나 때문에 목록이 같은 문구로 도배되는 걸 막는다.
  // 대표는 가장 최근 알림, 하나라도 안 읽었으면 묶음도 안 읽음으로 둔다.
  const groupNotis = useCallback((items: Noti[]): Noti[] => {
    const out: Noti[] = [];
    const byKey = new Map<string, Noti[]>();
    items.forEach((n) => {
      // 게시물이 없는 알림(메이트 신청 등)은 묶지 않는다 — 각각이 개별 행동이다
      if (!n.postId || n.category === 'memory') { out.push(n); return; }
      const k = `${n.category}|${n.postId}`;
      const arr = byKey.get(k);
      if (arr) arr.push(n); else byKey.set(k, [n]);
    });
    byKey.forEach((arr) => {
      const sorted = [...arr].sort((a, b) => b.createdAt - a.createdAt);
      const head = sorted[0];
      if (sorted.length === 1) { out.push(head); return; }
      out.push({
        ...head,
        text: t('misc.groupedText', { text: head.text, count: sorted.length - 1 }),
        read: sorted.every((x) => x.read),
        // 묶인 알림 전부를 읽음 처리해야 배지가 정확히 내려간다
        groupIds: sorted.map((x) => x.id),
      });
    });
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }, [t]);

  // 예시 알림 — 실제 알림이 하나도 없을 때만. 신규 사용자에게 "여기에 무엇이 쌓이는지" 보여준다.
  // 상대 시각으로 만들어 며칠 뒤에도 '방금/시간 전'으로 자연스럽게 표시된다.
  const exampleNotis = useMemo<Noti[]>(() => {
    const now = Date.now();
    return EXAMPLE_NOTIS.map((e) => ({
      id: e.id,
      category: e.category,
      text: t(e.textKey),
      read: false,
      createdAt: now - e.minutesAgo * MIN,
      isExample: true,
    }));
  }, [t]);

  // 도착 후 1주일 지난 알림은 제외 → 알림 있는 카테고리만, 최신순으로 그룹
  const cats = useMemo(() => {
    const now = Date.now();
    const real = [...memoryNotis, ...serverNotis].filter((n) => now - n.createdAt <= NOTI_MAX_AGE);
    // 로딩 중엔 예시를 넣지 않는다 — 실제 알림이 도착하며 예시가 사라지는 깜빡임 방지
    const fresh = real.length === 0 && !loading ? exampleNotis : real;
    const map = new Map<CatKey, Noti[]>();
    groupNotis(fresh).forEach((n) => {
      if (!map.has(n.category)) map.set(n.category, []);
      map.get(n.category)!.push(n);
    });
    return Array.from(map.entries())
      .map(([key, items]) => {
        const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);
        return { key, items: sorted, newest: sorted[0].createdAt };
      })
      .sort((a, b) => b.newest - a.newest);
  }, [memoryNotis, serverNotis, groupNotis, exampleNotis, loading]);

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

  // 신규·본 알림 공용 가로 막대 (읽은 알림은 톤을 낮춰 구분).
  // idx는 등장 스태거용 — 진입 시 위에서부터 순차로 뜬다.
  const NotiBar = ({ n, idx }: { n: Noti; idx: number }) => {
    const entrance = useEntranceAnimation(Math.min(idx, 6) * 45); // 길어도 6번째까지만 지연
    const thumb = pickThumb(postOf(n.postId));
    return (
      <Animated.View style={entrance}>
        <TouchableOpacity
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
            <View style={st.barMeta}>
              <Text style={st.barTime}>{fmtAgo(n.createdAt, t)}</Text>
              {/* 예시 알림임을 분명히 — 실제 알림으로 오해하지 않게 */}
              {n.isExample && (
                <Text style={[st.exampleTag, { color: skinAccent.accent, borderColor: skinAccent.tint(0.35) }]}>
                  {t('socialEmpty.official')}
                </Text>
              )}
            </View>
          </View>
          {/* 대상 게시물 미리보기 — 어느 기록에 대한 알림인지 즉시 읽힌다 */}
          {thumb ? <Image source={{ uri: thumb }} style={st.thumb} /> : null}
          {/* 미읽음 표시 — 오른쪽 끝 점(읽으면 사라진다) */}
          {!n.read && <View style={[st.barDot, { backgroundColor: skinAccent.accent }]} />}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // 시간 구간 소제목을 끼워 알림 목록을 렌더 — 매거진 목차 안의 '언제' 축
  const renderItems = (items: Noti[], startIdx = 0) => {
    let prev: TimeBucket | null = null;
    return items.map((n, i) => {
      const b = bucketOf(n.createdAt);
      const head = b !== prev ? b : null;
      prev = b;
      return (
        <View key={n.id}>
          {head && <Text style={st.bucket}>{t(TIME_BUCKET_KEY[head])}</Text>}
          <NotiBar n={n} idx={startIdx + i} />
        </View>
      );
    });
  };

  return (
    <SafeAreaView style={st.safeArea}>
      {/* 헤더 */}
      <View style={st.header}>
        <TouchableOpacity style={st.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('friends.back')}>
          <Text style={st.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>{t('misc.notifTitle')}</Text>
        {/* 모두 읽음 — 안 읽은 게 있을 때만 노출(자리는 항상 차지해 제목이 안 흔들리게) */}
        <View style={st.headerRight}>
          {unreadCount > 0 && (
            <TouchableOpacity
              onPress={onMarkAllRead}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('misc.markAllRead')}
            >
              <Text style={[st.markAll, { color: skinAccent.accent }]}>{t('misc.markAllRead')}</Text>
            </TouchableOpacity>
          )}
        </View>
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

        {/* 조회 중엔 '없음' 대신 로딩 — 빈 화면을 '알림 없음'으로 오인하지 않게 */}
        {loading && cats.length === 0 && (
          <ActivityIndicator style={{ paddingVertical: 40 }} color={skinAccent.accent} />
        )}
        {/* 빈 상태 — 한 줄 텍스트 대신 '왜 비었고 무엇이 채우는지' 안내 */}
        {!loading && cats.length === 0 && (
          <View style={st.emptyWrap}>
            <View style={[st.emptyIcon, { backgroundColor: skinAccent.tint(0.14), borderColor: skinAccent.tint(0.3) }]}>
              <HeartIcon size={22} color={skinAccent.accent} />
            </View>
            <Text style={st.empty}>{t('misc.noNews')}</Text>
            <Text style={st.emptyHint}>{t('misc.noNewsHint')}</Text>
          </View>
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

              {/* 새 알림 (항상 표시) — 시간 구간 소제목과 함께 */}
              {renderItems(newItems)}

              {/* 본 알림 (펼치면 같은 막대 형식으로 표시) */}
              {open && renderItems(readItems, newItems.length)}
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
  headerRight: { minWidth: 40, alignItems: 'flex-end' },
  markAll: { fontSize: 12, fontWeight: '700' },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 16 },

  // 표지
  cover: { alignItems: 'center' },
  vol: { color: COLORS.purpleNeon, fontSize: 10, letterSpacing: 2.5, textTransform: 'uppercase' },
  mast: { color: COLORS.white, fontSize: 26, marginTop: 6, marginBottom: 3 },
  date: { color: COLORS.textMuted, fontSize: 10 },
  rule: { height: 1, backgroundColor: COLORS.divider, marginVertical: 14 },
  contentsLabel: { color: COLORS.textMuted, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 },
  emptyWrap: { alignItems: 'center', paddingVertical: 44, gap: 10 },
  emptyIcon: {
    width: 52, height: 52, borderRadius: 26, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  empty: { color: COLORS.white, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  emptyHint: { color: COLORS.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18, paddingHorizontal: 30 },

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

  // 시간 구간 소제목 — 매거진 목차 톤(작은 대문자 자간)
  bucket: {
    color: COLORS.textMuted, fontSize: 9, letterSpacing: 1.6,
    textTransform: 'uppercase', marginLeft: 22, marginTop: 4, marginBottom: 6,
  },
  // 대상 게시물 미리보기
  thumb: {
    width: 38, height: 38, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  barBody: { flex: 1, gap: 3 },
  barMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  exampleTag: {
    fontSize: 9, fontWeight: '700', letterSpacing: 0.3,
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1,
  },
  barText: { color: COLORS.white, fontSize: 12.5, lineHeight: 17 },
  barTextRead: { color: COLORS.textDim },
  barTime: { color: COLORS.textMuted, fontSize: 10 },
  barDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: COLORS.purpleNeon },
});
