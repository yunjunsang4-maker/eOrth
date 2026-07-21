// 프로필 "마이" 티켓 — 보딩패스 형태의 전용 화면(iPhone 17 - 103 시안).
// 상단 보라: 최애 여행지(별점 최고 기록의 국가·기간·별점), 하단 흰색: 아이디·통계·QR.
// 티켓 카드(ticketRef)를 이미지로 캡처해 갤러리 저장 / 시스템 공유한다.
// QR은 eorth://user/<handle> — 친구찾기 스캐너(USER_LINK_RE)와 호환.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Share, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { getMyJoinedAt } from '../services/profile';
import { KO_TO_EN } from './MainScreen';
import type { RootStackScreenProps } from '../navigation/types';

const userLink = (code: string) => `eorth://user/${code}`;
const two = (n: number) => String(n).padStart(2, '0');
// "2025.04.13" / "2025-04-13" / ISO 모두 수용 — 실패 시 null
const parseD = (s?: string | null): Date | null => {
  if (!s) return null;
  const d = new Date(s.includes('T') ? s : s.replace(/[./]/g, '-'));
  return isNaN(d.getTime()) ? null : d;
};
const fmtYMD = (d: Date) => `${two(d.getFullYear() % 100)}.${two(d.getMonth() + 1)}.${two(d.getDate())}`;
// 시안 표기: 시작 YY.MM.DD + 줄바꿈 + ~종료(같은 달이면 일만, 다르면 MM.DD)
const fmtRange = (start: Date, end: Date | null): string => {
  if (!end || fmtYMD(start) === fmtYMD(end)) return fmtYMD(start);
  const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
  return `${fmtYMD(start)}\n~${sameMonth ? two(end.getDate()) : `${two(end.getMonth() + 1)}.${two(end.getDate())}`}`;
};
// 한글 국가명 → 영문 (KO_TO_EN 세계 맵, 대한민국은 별도 — AlbumCreateScreen과 동일 규칙)
const enName = (ko: string) => (ko === '대한민국' ? 'South Korea' : KO_TO_EN[ko] ?? ko);

const SCREEN_W = Dimensions.get('window').width;
const TICKET_MARGIN = 14;
const BG = '#0A0B0F';
const PURPLE = '#7C3AED';
const LILAC = '#CA82FF';
const STAR_YELLOW = '#FFBC00';

export default function ProfileTicketScreen({ navigation, route }: RootStackScreenProps<'ProfileTicket'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { handle, installedAt } = useSettings();
  const { records } = useRecords();
  const { tripCount, neighborCount } = route.params;
  const ticketRef = useRef<View>(null);
  const hasHandle = !!handle;

  // 별 배경 점 — 마운트 시 1회 생성
  const stars = useMemo(
    () => Array.from({ length: 46 }, () => ({
      x: Math.random(), y: Math.random(), r: 0.5 + Math.random() * 0.6, o: 0.25 + Math.random() * 0.35,
    })),
    [],
  );

  // 내 기록(예시 제외)
  const myRecords = useMemo(
    () => records.filter(r => !r.isExample && r.isMyPost !== false),
    [records],
  );

  // 최애 여행지 — 별점 최고(동점 시 최신). 다국가 기록은 국가별 별점을 각각 후보로.
  const best = useMemo(() => {
    type Cand = { countryKo: string; flag: string; rating: number; start?: string; end?: string; ts: number };
    const cands: Cand[] = [];
    for (const r of myRecords) {
      const push = (countryKo: string, flag: string, rating?: number, start?: string, end?: string) => {
        if (!countryKo || !rating || rating <= 0) return;
        cands.push({ countryKo, flag, rating, start, end, ts: r.timestamp });
      };
      const pcd = r.perCountryData;
      if (pcd && Object.keys(pcd).length > 0) {
        for (const [cn, d] of Object.entries(pcd)) {
          const flag = r.countries?.find(c => c.name === cn)?.flag ?? r.countryFlag;
          push(cn, flag, d.rating ?? r.rating, d.startDate, d.endDate);
        }
      } else {
        push(r.countryName, r.countryFlag, r.rating);
      }
    }
    return cands.reduce<Cand | null>(
      (acc, c) => (!acc || c.rating > acc.rating || (c.rating === acc.rating && c.ts > acc.ts) ? c : acc),
      null,
    );
  }, [myRecords]);

  // 최근 방문 나라 — 최신 기록의 국가(다국가면 마지막 국가)
  const recentCountry = useMemo(() => {
    let latest: { ko: string; ts: number } | null = null;
    for (const r of myRecords) {
      const ko = r.countries?.length ? r.countries[r.countries.length - 1].name : r.countryName;
      if (!ko) continue;
      if (!latest || r.timestamp > latest.ts) latest = { ko, ts: r.timestamp };
    }
    return latest ? enName(latest.ko) : '—';
  }, [myRecords]);

  // 동행자 — 기록들에 태그된 친구의 누적 고유 수
  const companionCount = useMemo(() => {
    const set = new Set<string>();
    myRecords.forEach(r => r.companionFriends?.forEach(f => set.add(f)));
    return set.size;
  }, [myRecords]);

  // eOrth 가입 날 — 서버 created_at, 오프라인이면 설치일 폴백
  const [joinedLabel, setJoinedLabel] = useState('—');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const iso = await getMyJoinedAt();
      const d = parseD(iso) ?? (installedAt != null ? new Date(installedAt) : null);
      if (!cancelled && d) setJoinedLabel(fmtYMD(d));
    })();
    return () => { cancelled = true; };
  }, [installedAt]);

  const dateLabel = best ? fmtRange(parseD(best.start) ?? new Date(best.ts), parseD(best.end)) : '';

  const capture = async (): Promise<string | null> => {
    try {
      return await captureRef(ticketRef, { format: 'png', quality: 1 });
    } catch {
      return null;
    }
  };

  const handleSave = async () => {
    const uri = await capture();
    if (!uri) { Alert.alert(t('comp.viewerSaveFail')); return; }
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) { Alert.alert(t('comp.viewerSaveFail')); return; }
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert(t('comp.viewerSaved'));
    } catch {
      Alert.alert(t('comp.viewerSaveFail'));
    }
  };

  const handleShare = async () => {
    const uri = await capture();
    if (!uri) { Alert.alert(t('comp.viewerSaveFail')); return; }
    try {
      await Share.share({ url: uri }); // iOS 이미지 전송 / Android는 RN Share 한계(의도됨)
    } catch {
      // 취소 등 — 무해화
    }
  };

  const starCount = best ? Math.round(best.rating) : 0;

  return (
    <View style={st.root}>
      {/* 별 배경 */}
      {stars.map((s, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute', left: s.x * SCREEN_W, top: s.y * Dimensions.get('window').height,
            width: s.r * 2, height: s.r * 2, borderRadius: s.r, backgroundColor: '#FFFFFF', opacity: s.o,
          }}
        />
      ))}

      {/* 티켓 카드 — 캡처 대상 */}
      <View
        ref={ticketRef}
        collapsable={false}
        style={[st.ticket, { marginTop: insets.top + 8, marginBottom: Math.max(insets.bottom, 12) + 8 }]}
      >
        {/* 상단 보라 — 최애 여행지 */}
        <View style={st.purple}>
          <Text style={st.favTitle}>{t('profileTicket.favTitle', { handle: handle || 'eorth' })}</Text>
          {best ? (
            <>
              <Text style={st.favCountry} numberOfLines={1} adjustsFontSizeToFit>
                {enName(best.countryKo).toUpperCase()}
              </Text>
              <View style={st.favMetaRow}>
                <Text style={st.favDate}>{dateLabel}</Text>
                <View style={st.favBar} />
                <Text style={st.favFlag}>{best.flag}</Text>
              </View>
              <Text style={st.favRating}>{best.rating.toFixed(1)}</Text>
              <View style={st.starRow}>
                {[0, 1, 2, 3, 4].map(i => (
                  <Text key={i} style={[st.star, { color: i < starCount ? STAR_YELLOW : LILAC }]}>★</Text>
                ))}
              </View>
            </>
          ) : (
            <Text style={st.noFav}>{t('profileTicket.noFav')}</Text>
          )}
        </View>

        {/* 하단 흰색 — 아이디·통계 */}
        <View style={st.white}>
          <Text style={st.name} numberOfLines={1}>{handle || t('friends.setProfileFirst')}</Text>

          <View style={st.statsRow}>
            <View style={st.statCol}>
              <Text style={st.statLabel}>{t('profile.tripCount')}</Text>
              <Text style={st.statValue}>{tripCount}</Text>
            </View>
            <View style={[st.statCol, { alignItems: 'center' }]}>
              <Text style={st.statLabel}>{t('profileTicket.mate')}</Text>
              <Text style={st.statValue}>{neighborCount}</Text>
            </View>
            <View style={[st.statCol, { alignItems: 'flex-end' }]}>
              <Text style={st.statLabel}>{t('profileTicket.companion')}</Text>
              <Text style={st.statValue}>{companionCount}</Text>
            </View>
          </View>

          <View style={st.subRow}>
            <View>
              <Text style={st.statLabel}>{t('profileTicket.recentCountry')}</Text>
              <Text style={st.subValue} numberOfLines={1}>{recentCountry}  <Text style={st.chev}>»</Text></Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={st.statLabel}>{t('profileTicket.joinedAt')}</Text>
              <Text style={st.subValue}><Text style={st.chev}>«</Text>  {joinedLabel}</Text>
            </View>
          </View>

          <View style={{ flex: 1 }} />

          {/* 절취선 + 양옆 반원 노치 */}
          <View style={st.perforationWrap}>
            <View style={[st.notch, { left: -TICKET_MARGIN }]} />
            <View style={st.dashRow}>
              {Array.from({ length: 40 }).map((_, i) => <View key={i} style={st.dash} />)}
            </View>
            <View style={[st.notch, { right: -TICKET_MARGIN }]} />
          </View>

          {/* QR — 모서리 브래킷 프레임 */}
          <View style={st.qrArea}>
            <View style={st.qrFrame}>
              <View style={[st.bracket, st.brTL]} />
              <View style={[st.bracket, st.brTR]} />
              <View style={[st.bracket, st.brBL]} />
              <View style={[st.bracket, st.brBR]} />
              {hasHandle
                ? <QRCode value={userLink(handle)} size={112} color="#000000" backgroundColor="#FFFFFF" quietZone={6} />
                : <Text style={st.qrHint}>{t('friends.qrHint')}</Text>}
            </View>
          </View>
        </View>

        {/* 하단 중앙 노치(보딩패스 반원 컷) */}
        <View style={st.bottomNotch} />
      </View>

      {/* 상단 오버레이 — 저장·공유 (캡처 대상 밖). 닫기는 아래로 스와이프 제스처 전용 */}
      <View style={[st.topBar, { top: insets.top + 20 }]} pointerEvents="box-none">
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            style={[st.actionBtn, !hasHandle && st.actionDisabled]}
            disabled={!hasHandle}
            onPress={handleSave}
            accessibilityRole="button"
            accessibilityLabel={t('profileTicket.save')}
          >
            <Text style={st.actionGlyph}>↓</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.actionBtn, !hasHandle && st.actionDisabled]}
            disabled={!hasHandle}
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel={t('profileTicket.share')}
          >
            <Text style={st.actionGlyph}>↗</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  ticket: {
    flex: 1,
    marginHorizontal: TICKET_MARGIN,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden', // 양옆·하단 노치 원을 반원으로 클립
  },
  // ── 상단 보라 ──
  purple: {
    backgroundColor: PURPLE,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    alignItems: 'center',
    paddingTop: 64, // 상단 오버레이(뒤로가기·저장·공유) 자리
    paddingBottom: 26,
    paddingHorizontal: 24,
  },
  favTitle: { color: LILAC, fontSize: 13, fontWeight: '600' },
  favCountry: { color: '#FFFFFF', fontSize: 52, fontWeight: '900', letterSpacing: 1, marginTop: 8 },
  favMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14 },
  favDate: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', textAlign: 'center', lineHeight: 20 },
  favBar: { width: 4, height: 44, backgroundColor: '#FFFFFF', borderRadius: 2 },
  favFlag: { fontSize: 26 },
  favRating: { color: '#FFFFFF', fontSize: 44, fontWeight: '900', marginTop: 16, lineHeight: 48 },
  starRow: { flexDirection: 'row', gap: 7, marginTop: 4 },
  star: { fontSize: 19 },
  noFav: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 26, marginBottom: 30 },
  // ── 하단 흰색 ──
  white: { flex: 1, paddingHorizontal: 28, paddingTop: 24 },
  name: { color: '#0A0A0F', fontSize: 26, fontWeight: '900' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 26 },
  statCol: { minWidth: 64 },
  statLabel: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  statValue: { color: '#0A0A0F', fontSize: 24, fontWeight: '900', marginTop: 6 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 24 },
  subValue: { color: '#0A0A0F', fontSize: 20, fontWeight: '900', marginTop: 6 },
  chev: { color: '#0A0A0F', fontSize: 18, fontWeight: '900' },
  // ── 절취선 ──
  perforationWrap: { height: 28, justifyContent: 'center', marginHorizontal: -28 },
  dashRow: { flexDirection: 'row', overflow: 'hidden', marginHorizontal: 28 },
  dash: { width: 5, height: 1.6, backgroundColor: '#0A0A0F', marginRight: 4 },
  notch: { position: 'absolute', width: 28, height: 28, borderRadius: 14, backgroundColor: BG },
  // ── QR ──
  qrArea: { alignItems: 'center', paddingTop: 14, paddingBottom: 56 },
  qrFrame: { padding: 12, alignItems: 'center', justifyContent: 'center', minWidth: 148, minHeight: 148 },
  bracket: { position: 'absolute', width: 20, height: 20, borderColor: '#0A0A0F' },
  brTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  brTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  brBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  brBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  qrHint: { fontSize: 13, color: '#888888', textAlign: 'center', paddingHorizontal: 8 },
  // ── 하단 노치 ──
  bottomNotch: {
    position: 'absolute', bottom: -34, alignSelf: 'center',
    width: 68, height: 68, borderRadius: 34, backgroundColor: BG,
  },
  // ── 상단 오버레이 ──
  topBar: {
    position: 'absolute', left: TICKET_MARGIN + 16, right: TICKET_MARGIN + 16,
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
  },
  actionBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  actionDisabled: { opacity: 0.4 },
  actionGlyph: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
});
