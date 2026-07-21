// 프로필 "마이" 티켓 — 보딩패스 형태의 전용 화면(iPhone 17 - 103/102 시안).
// 상단 보라: 최근 여행지(국가·기간·별점), 하단 흰색: 아이디·통계·QR.
// 티켓 또는 하단 "내 티켓 공유하기" 버튼을 누르면 티켓을 이미지로 캡처해 시스템 공유한다.
// QR은 eorth://user/<handle> — 친구찾기 스캐너(USER_LINK_RE)와 호환.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Share, Dimensions, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { getMyJoinedAt } from '../services/profile';
import { KO_TO_EN } from './MainScreen';
import { getCapitalByKo } from '../constants/capitals';
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
// 시안 표기: 시작 YY.MM.DD + 줄바꿈 + ~종료(항상 두 줄로 '기간' 표시).
// 종료가 없으면 시작과 동일하게 취급. 같은 달이면 종료는 일(DD)만, 같은 해면 MM.DD, 아니면 YY.MM.DD.
const fmtRange = (start: Date, end: Date | null): string => {
  const e = end ?? start;
  const sameYear = start.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && start.getMonth() === e.getMonth();
  const endStr = sameMonth ? two(e.getDate()) : sameYear ? `${two(e.getMonth() + 1)}.${two(e.getDate())}` : fmtYMD(e);
  return `${fmtYMD(start)}\n~${endStr}`;
};
// 한글 국가명 → 영문 (KO_TO_EN 세계 맵, 대한민국은 별도 — AlbumCreateScreen과 동일 규칙)
const enName = (ko: string) => (ko === '대한민국' ? 'South Korea' : KO_TO_EN[ko] ?? ko);

const SCREEN_W = Dimensions.get('window').width;
const TICKET_MARGIN = 14;
const BG = '#0A0B0F';
const PURPLE = '#7C3AED';
const LILAC = '#CA82FF';
const STAR_YELLOW = '#FFBC00';

// 하단 노치 — 시안(iPhone 17-103) 외곽 path 기준: 폭≈123·깊이≈32(티켓 폭의 약 33%)의 얕은 반타원.
// 정원 diameter=64를 가로로 늘려(scaleX) 타원을 만들고, 그 윗절반(깊이 32)만 노출한다.
const TICKET_W = SCREEN_W - TICKET_MARGIN * 2;
const NOTCH_DEPTH = 32;
const NOTCH_W = TICKET_W * 0.33;
const NOTCH_D = NOTCH_DEPTH * 2; // 정원 지름(윗절반이 깊이가 됨)

export default function ProfileTicketScreen({ navigation, route }: RootStackScreenProps<'ProfileTicket'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { handle, installedAt } = useSettings();
  const { records, tripGroups } = useRecords();
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

  // 최근 여행지 — 여행 카드(TripGroup) 기준. 가장 최신 여행 카드를 선정(ts 최대).
  // 카드의 별점 = 소속 기록들의 해당 국가 별점 최댓값(없으면 0점), 기간 = 기록들의 시작~종료 합집합.
  // 여행 카드가 하나도 없으면 개별 기록 폴백. 체류 카드는 제외.
  const best = useMemo(() => {
    type Cand = { countryKo: string; flag: string; rating: number; startD?: Date; endD?: Date; ts: number };
    const byId = new Map(myRecords.map(r => [r.id, r]));
    const cands: Cand[] = [];

    for (const g of tripGroups) {
      if (g.stay) continue; // 장기체류 카드는 여행이 아님
      const recs = g.records.map(id => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
      const cover = byId.get(g.coverRecordId);
      const countryKo = g.countryName || cover?.countryName || recs[0]?.countryName || '';
      if (!countryKo) continue;
      const flag = g.countryFlag || cover?.countryFlag || recs[0]?.countryFlag || '🌍';

      let rating = 0;
      let startD: Date | undefined;
      let endD: Date | undefined;
      let ts = g.createdAt instanceof Date ? g.createdAt.getTime() : 0;
      for (const r of recs) {
        const d = r.perCountryData?.[countryKo];
        rating = Math.max(rating, d?.rating ?? (r.countryName === countryKo ? r.rating ?? 0 : 0));
        // 실제 여행 기간: perCountryData(다국가) → 기록 top-level startDate/endDate → date → 최후에 생성시각
        const s = parseD(d?.startDate ?? r.startDate ?? r.date) ?? new Date(r.timestamp);
        const e = parseD(d?.endDate ?? r.endDate ?? r.date) ?? s;
        if (!startD || s < startD) startD = s;
        if (!endD || e > endD) endD = e;
        if (r.timestamp > ts) ts = r.timestamp;
      }
      // 기록에서 기간을 못 얻으면 카드 표시 날짜(YYYY.MM.DD) 폴백
      if (!startD) startD = parseD(g.date) ?? undefined;
      cands.push({ countryKo, flag, rating, startD, endD, ts });
    }

    // 여행 카드가 없으면 개별 기록 폴백 (별점 없으면 0점)
    if (cands.length === 0) {
      for (const r of myRecords) {
        const pcd = r.perCountryData;
        if (pcd && Object.keys(pcd).length > 0) {
          for (const [cn, d] of Object.entries(pcd)) {
            const flag = r.countries?.find(c => c.name === cn)?.flag ?? r.countryFlag;
            const s = parseD(d.startDate ?? r.startDate ?? r.date) ?? new Date(r.timestamp);
            cands.push({ countryKo: cn, flag, rating: d.rating ?? r.rating ?? 0, startD: s, endD: parseD(d.endDate ?? r.endDate ?? r.date) ?? s, ts: r.timestamp });
          }
        } else if (r.countryName) {
          const s = parseD(r.startDate ?? r.date) ?? new Date(r.timestamp);
          cands.push({ countryKo: r.countryName, flag: r.countryFlag, rating: r.rating ?? 0, startD: s, endD: parseD(r.endDate ?? r.date) ?? s, ts: r.timestamp });
        }
      }
    }

    // 가장 최신 여행 = ts(가장 나중 기록/생성 시각)가 가장 큰 후보
    return cands.reduce<Cand | null>(
      (acc, c) => (!acc || c.ts > acc.ts ? c : acc),
      null,
    );
  }, [myRecords, tripGroups]);

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

  const dateLabel = best ? fmtRange(best.startD ?? new Date(best.ts), best.endD ?? null) : '';
  const capital = best ? getCapitalByKo(best.countryKo) : null; // 국기 대신 표시할 수도(없으면 국기 폴백)

  const capture = async (): Promise<string | null> => {
    try {
      return await captureRef(ticketRef, { format: 'png', quality: 1 });
    } catch {
      return null;
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

  // 티켓 탭 → 위로 올라가며 하단 공유 버튼 노출(시안 iPhone 17-102). 다시 탭하면 내려감.
  const [revealed, setRevealed] = useState(false);
  const revealAnim = useRef(new Animated.Value(0)).current;
  const RISE = 64 + insets.bottom; // 버튼이 들어갈 만큼 티켓이 올라가는 거리
  const toggleReveal = () => {
    const to = revealed ? 0 : 1;
    setRevealed(!revealed);
    Animated.timing(revealAnim, { toValue: to, duration: 260, useNativeDriver: true }).start();
  };
  const ticketTranslate = revealAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -RISE] });
  const btnTranslate = revealAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

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

      {/* 티켓 카드 — 캡처 대상. 탭하면 위로 올라가며 하단 공유 버튼이 나타남 */}
      <Animated.View style={[st.ticketTap, { transform: [{ translateY: ticketTranslate }] }]}>
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.98} disabled={!hasHandle} onPress={toggleReveal}>
      <View
        ref={ticketRef}
        collapsable={false}
        style={[st.ticket, { marginTop: 0 }]}
      >
        {/* 상단 보라 — 최근 여행지. 상태바 뒤까지 채우도록 paddingTop에 safe-area 반영 */}
        <View style={[st.purple, { paddingTop: insets.top + 52 }]}>
          <Text style={st.favTitle}>{t('profileTicket.favTitle', { handle: handle || 'eorth' })}</Text>
          {best ? (
            <>
              <Text style={st.favCountry} numberOfLines={1} adjustsFontSizeToFit>
                {enName(best.countryKo).toUpperCase()}
              </Text>
              <View style={st.favMetaRow}>
                <Text style={st.favDate}>{dateLabel}</Text>
                <View style={st.favBar} />
                {capital
                  ? <Text style={st.favCapital} numberOfLines={1} adjustsFontSizeToFit>{capital.toUpperCase()}</Text>
                  : <Text style={st.favFlag}>{best.flag}</Text>}
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
            <View style={st.statCol}>
              <Text style={st.statLabel}>{t('profileTicket.mate')}</Text>
              <Text style={st.statValue}>{neighborCount}</Text>
            </View>
            <View style={st.statCol}>
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

        {/* 하단 중앙 노치(보딩패스 반타원 컷) */}
        <View style={st.bottomNotch} />
      </View>
      </TouchableOpacity>
      </Animated.View>

      {/* 하단 공유 버튼(캡처 대상 밖) — 티켓 탭 시 나타남(시안 iPhone 17-102) */}
      <Animated.View
        pointerEvents={revealed ? 'auto' : 'none'}
        style={[st.shareBarWrap, { paddingBottom: insets.bottom + 14, opacity: revealAnim, transform: [{ translateY: btnTranslate }] }]}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          disabled={!hasHandle}
          onPress={handleShare}
          hitSlop={{ top: 10, bottom: 10, left: 40, right: 40 }}
          accessibilityRole="button"
          accessibilityLabel={t('profileTicket.shareCta')}
        >
          <Text style={[st.shareText, !hasHandle && st.actionDisabled]}>{t('profileTicket.shareCta')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  ticketTap: { flex: 1 }, // 티켓 탭 영역(내부 View가 캡처 대상)
  ticket: {
    flex: 1,
    marginHorizontal: TICKET_MARGIN,
    marginBottom: 10, // 노치 아래 다크 여백(공유 버튼과의 간격)
    // 상단 보라가 화면 맨 위(상태바 뒤)까지 채워지도록 top은 각지게 flush, 하단만 라운드(시안: 보라 rect y=-22)
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden', // 양옆·하단 노치 원을 반원으로 클립
  },
  // ── 상단 보라 ──
  purple: {
    backgroundColor: PURPLE,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    alignItems: 'center',
    // paddingTop은 인라인으로 insets.top + 52 지정(상태바 + 저장·공유 오버레이 자리)
    paddingBottom: 26,
    paddingHorizontal: 24,
    // 시안(filter4_d): 보라 경계에 아래로 지는 그림자로 흰색과의 입체 경계.
    // zIndex로 흰색 섹션 위에 올려 그림자가 흰색에 덮이지 않게 한다.
    zIndex: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 8,
  },
  favTitle: { color: LILAC, fontSize: 13, fontWeight: '600' },
  favCountry: { color: '#FFFFFF', fontSize: 52, fontWeight: '900', letterSpacing: 1, marginTop: 8 },
  favMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14 },
  favDate: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', textAlign: 'center', lineHeight: 20 },
  favBar: { width: 4, height: 44, backgroundColor: '#FFFFFF', borderRadius: 2 },
  favFlag: { fontSize: 26 },
  favCapital: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', letterSpacing: 0.5, maxWidth: 150 }, // 국기 대신 수도(시안 BERN)
  favRating: { color: '#FFFFFF', fontSize: 44, fontWeight: '900', marginTop: 16, lineHeight: 48 },
  starRow: { flexDirection: 'row', gap: 7, marginTop: 4 },
  star: { fontSize: 19 },
  noFav: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 26, marginBottom: 30 },
  // ── 하단 흰색 ──
  white: { flex: 1, paddingHorizontal: 28, paddingTop: 24 },
  name: { color: '#0A0A0F', fontSize: 26, fontWeight: '900' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 48 }, // 아이디와 통계 블록 사이 간격(전체 통계를 아래로)
  statCol: { minWidth: 64, alignItems: 'center' }, // 라벨 아래 숫자를 가운데 정렬
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
  // ── 하단 노치 ── (시안 비율: 폭 NOTCH_W·깊이 NOTCH_DEPTH의 얕은 반타원)
  bottomNotch: {
    position: 'absolute', bottom: -NOTCH_DEPTH, alignSelf: 'center',
    width: NOTCH_D, height: NOTCH_D, borderRadius: NOTCH_D / 2, backgroundColor: BG,
    transform: [{ scaleX: NOTCH_W / NOTCH_D }],
  },
  // ── 하단 공유 버튼(티켓 탭 시 노출) ──
  shareBarWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingTop: 18 },
  shareText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  actionDisabled: { opacity: 0.4 },
});
