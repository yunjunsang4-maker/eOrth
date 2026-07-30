import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSkinAccent, type SkinAccent } from '../constants/skinTheme';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../store/settingsStore';
import { fetchNotices } from '../services/notices';
import { visibleNotices, latestPublishedAt, type Notice } from '../utils/noticeFeed';
import type { RootStackScreenProps } from '../navigation/types';

// 설정 > 공지사항 — 운영자 공지 목록.
// 이용약관 제3조가 개정 7일 전부터 '앱 내 공지'를 요구하는데 그 수단이 없었다.
// 공지는 GitHub Pages의 notices.json에서 읽는다(docs/notices.json — 커밋하면 게시).
// 화면을 연 시점에 '가장 최신 공지의 게시 시각'을 저장해 설정의 점 배지를 끈다.

const COLORS = {
  bg: '#0A0A0F',
  card: 'rgba(46,46,59,0.45)',
  cardBorder: 'rgba(255,255,255,0.08)',
  white: '#FFFFFF',
  textDim: '#A1A1B0',
  textMuted: '#8B8B9E',
};

export default function NoticeScreen({ navigation }: RootStackScreenProps<'Notice'>) {
  const a = useSkinAccent();
  const st = useMemo(() => makeStyles(a), [a]);
  const { t, i18n } = useTranslation();
  const { lastSeenNoticeAt, setLastSeenNoticeAt } = useSettings();
  const [list, setList] = useState<Notice[] | null>(null); // null = 불러오는 중

  useEffect(() => {
    let alive = true;
    (async () => {
      const all = await fetchNotices(i18n.language);
      if (!alive) return;
      const vis = visibleNotices(all, Date.now());
      setList(vis);
      // 목록을 연 것으로 보고 미읽음 해제. 못 불러왔으면(빈 목록) 기존 값을 유지해
      // 다음에 성공했을 때 배지가 다시 뜨게 한다.
      const seen = latestPublishedAt(all, Date.now(), lastSeenNoticeAt);
      if (seen > lastSeenNoticeAt) setLastSeenNoticeAt(seen);
    })();
    return () => { alive = false; };
    // lastSeenNoticeAt은 이 안에서 갱신하므로 의존성에 넣으면 재실행이 반복된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language]);

  return (
    <SafeAreaView style={st.safeArea}>
      <View style={st.header}>
        <TouchableOpacity style={st.backBtn} activeOpacity={0.7} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={t('settings.back')}>
          <Text style={st.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>{t('notice.title')}</Text>
        <View style={st.headerPlaceholder} />
      </View>

      <ScrollView style={st.scroll} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        {list === null ? (
          <ActivityIndicator color={a.accent} style={st.loading} />
        ) : list.length === 0 ? (
          <Text style={st.empty}>{t('notice.empty')}</Text>
        ) : (
          list.map((n) => (
            <View key={n.id} style={st.card}>
              <View style={st.cardHead}>
                <Text style={st.kind}>{t(`notice.kind_${n.kind}`, { defaultValue: t('notice.kind_service') })}</Text>
                <Text style={st.date}>{formatDate(n.publishedAt, i18n.language)}</Text>
              </View>
              <Text style={st.cardTitle}>{n.title}</Text>
              {!!n.effectiveDate && (
                <Text style={st.effective}>{t('notice.effectiveOn', { date: n.effectiveDate })}</Text>
              )}
              {!!n.body && <Text style={st.body}>{n.body}</Text>}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// 게시일 표기 — 로케일 차이로 깨지지 않게 직접 조립한다
function formatDate(ms: number, lang: string): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return lang === 'en' ? `${y}.${String(m).padStart(2, '0')}.${String(day).padStart(2, '0')}` : `${y}년 ${m}월 ${day}일`;
}

const makeStyles = (a: SkinAccent) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 6,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: COLORS.white, fontSize: 28, marginTop: -2 },
  headerTitle: { color: COLORS.white, fontSize: 17, fontWeight: '700' },
  headerPlaceholder: { width: 44 },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  loading: { marginTop: 40 },
  empty: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center', marginTop: 60 },

  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    borderRadius: 16, padding: 16, marginBottom: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  // 공지 종류 알약 — 스킨 강조색
  kind: {
    fontSize: 11, fontWeight: '700', color: a.accent,
    backgroundColor: a.tint(0.12), borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden',
  },
  date: { fontSize: 12, color: COLORS.textMuted },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.white, lineHeight: 21 },
  effective: { fontSize: 12, color: a.accent, marginTop: 6 },
  body: { fontSize: 13, color: COLORS.textDim, lineHeight: 21, marginTop: 10 },
});
