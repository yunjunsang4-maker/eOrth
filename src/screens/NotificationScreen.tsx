import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Platform,
} from 'react-native';
import { useRecords } from '../store/recordStore';

const COLORS = {
  bg:          '#0A0A0F',
  card:        '#2E2E3B',
  divider:     '#1A1A26',
  purpleNeon:  '#BF85FC',
  purpleDeep:  '#6B21A8',
  white:       '#FFFFFF',
  textDim:     '#A1A1B0',
  textMuted:   '#6A6A7A',
};

const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

interface Props { navigation: any; }

// 알림 카테고리 (매거진 "서브젝트")
type CatKey = 'comment' | 'like' | 'follow' | 'memory' | 'record';
const CATEGORY_LABEL: Record<CatKey, string> = {
  comment: '댓글',
  like: '좋아요',
  follow: '팔로우',
  memory: '추억 리마인드',
  record: '기록 시작',
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
}

// 게시물로 이동하는 카테고리
const POST_CATEGORIES: CatKey[] = ['comment', 'like', 'memory'];

// 시간 상수 / 알림 보존 기간 (도착 후 1주일 지나면 사라짐)
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOTI_MAX_AGE = 7 * DAY;
const ago = (ms: number) => Date.now() - ms;

// 상대 시간 표시
function fmtAgo(ts: number): string {
  const d = Date.now() - ts;
  if (d < MIN) return '방금 전';
  if (d < HOUR) return `${Math.floor(d / MIN)}분 전`;
  if (d < DAY) return `${Math.floor(d / HOUR)}시간 전`;
  if (d < 2 * DAY) return '어제';
  return `${Math.floor(d / DAY)}일 전`;
}

// 임시 데이터 (createdAt = 도착 시각)
const NOTIS: Noti[] = [
  { id: 'c1', category: 'comment', emoji: '✈️', avbg: '#3A2A5E', text: '서연님: "여기 진짜 가보고 싶다 🥹"', read: false, createdAt: ago(2 * MIN) },
  { id: 'l1', category: 'like', emoji: '🏄', avbg: '#2A1A4E', text: '현우님 외 3명이 도쿄 여행 기록을 좋아합니다', read: false, createdAt: ago(2 * HOUR) },
  { id: 'f1', category: 'follow', emoji: '🌸', avbg: '#4E1A3A', text: '수진님이 회원님을 팔로우하기 시작했습니다', read: false, createdAt: ago(20 * HOUR), userId: 'u-soojin', userName: '수진' },
  { id: 'r1', category: 'record', emoji: '🗺️', avbg: '#1A3D2E', text: '지민님이 파리 여행 기록을 시작했어요', read: false, createdAt: ago(26 * HOUR), userId: 'u-jimin', userName: '지민' },
  { id: 'm1', category: 'memory', emoji: '🗓️', avbg: '#3A2A1A', text: '1년 전 오늘 타이베이에 계셨네요. 추억을 꺼내볼까요?', read: false, createdAt: ago(2 * DAY) },
  { id: 'l2', category: 'like', emoji: '🌅', avbg: '#2A1A4E', text: '민지님이 회원님의 발리 스냅을 좋아합니다', read: true, createdAt: ago(3 * DAY) },
  { id: 'f2', category: 'follow', emoji: '🎒', avbg: '#4E1A3A', text: '도윤님이 회원님을 팔로우하기 시작했습니다', read: true, createdAt: ago(5 * DAY), userId: 'u-doyun', userName: '도윤' },
  { id: 'l3', category: 'like', emoji: '🌊', avbg: '#2A1A4E', text: '준호님이 회원님의 파리 기록을 좋아합니다', read: true, createdAt: ago(6 * DAY) },
  // 1주일 지난 알림 — 자동으로 제외됨 (만료 동작 예시)
  { id: 'l4', category: 'like', emoji: '⛰️', avbg: '#2A1A4E', text: '태호님이 회원님의 교토 기록을 좋아합니다', read: true, createdAt: ago(8 * DAY) },
];

export default function NotificationScreen({ navigation }: Props) {
  const { records } = useRecords();
  const [expanded, setExpanded] = useState<CatKey | null>(null);

  // 알림 탭 시 이동: 댓글·좋아요·추억 → 게시물 / 팔로우·기록 → 프로필
  const openNoti = (n: Noti) => {
    if (POST_CATEGORIES.includes(n.category)) {
      const postId = n.postId ?? records[0]?.id;
      if (postId) navigation.navigate('PostDetail', { postId });
    } else {
      navigation.navigate('FriendProfile', { userId: n.userId ?? null, username: n.userName ?? '' });
    }
  };

  // VOL.월-주차 + 날짜
  const today = new Date();
  const vol = `VOL.${today.getMonth() + 1}-${Math.ceil(today.getDate() / 7)}`;
  const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;

  // 도착 후 1주일 지난 알림은 제외 → 알림 있는 카테고리만, 최신순으로 그룹
  const cats = useMemo(() => {
    const now = Date.now();
    const fresh = NOTIS.filter((n) => now - n.createdAt <= NOTI_MAX_AGE);
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
  }, []);

  const Avatar = ({ emoji, bg, size = 28 }: { emoji: string; bg: string; size?: number }) => (
    <View style={[st.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={{ fontSize: size * 0.52 }}>{emoji}</Text>
    </View>
  );

  // 신규·본 알림 공용 가로 막대 (본 알림은 미읽음 점만 비움)
  const renderBar = (n: Noti) => (
    <TouchableOpacity key={n.id} style={st.bar} activeOpacity={0.75} onPress={() => openNoti(n)}>
      <View style={[st.barDot, n.read && st.barDotRead]} />
      <Avatar emoji={n.emoji} bg={n.avbg} />
      <Text style={st.barText} numberOfLines={1}>{n.text}</Text>
      <Text style={st.barTime}>{fmtAgo(n.createdAt)}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={st.safeArea}>
      {/* 헤더 */}
      <View style={st.header}>
        <TouchableOpacity style={st.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={st.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>알림</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={st.scroll} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        {/* 매거진 표지 */}
        <View style={st.cover}>
          <Text style={st.vol}>{`eOrth Weekly · ${vol}`}</Text>
          <Text style={[st.mast, { fontFamily: SERIF }]}>최근 소식</Text>
          <Text style={st.date}>{dateStr}</Text>
        </View>
        <View style={st.rule} />
        <Text style={st.contentsLabel}>목차 · Contents</Text>

        {cats.length === 0 && (
          <Text style={st.empty}>새로운 소식이 없어요</Text>
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
                <Text style={[st.idxNum, { fontFamily: SERIF }]}>{String(i + 1).padStart(2, '0')}</Text>
                <Text style={[st.idxName, { fontFamily: SERIF }]}>{CATEGORY_LABEL[cat.key]}</Text>
                <View style={st.leader} />
                <Text style={[st.badge, open && st.badgeOpen]}>
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
