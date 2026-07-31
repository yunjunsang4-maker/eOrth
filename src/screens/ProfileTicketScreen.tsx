// 프로필 "마이" 티켓 — 보딩패스 형태의 전용 화면(iPhone 17 - 103/102 시안).
// 상단 보라: 최근 여행지(국가·기간·별점), 하단 흰색: 아이디·통계·QR.
// 티켓 또는 하단 "내 티켓 공유하기" 버튼을 누르면 티켓을 이미지로 캡처해 시스템 공유한다.
// QR은 utils/appLinks의 profileLink로 만든 eorth://profile/<handle> — 파서(parseAppLink)가
// 구형식 eorth://user/<handle>까지 받아주므로 이미 배포된 QR도 그대로 열린다.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Share, Dimensions, Animated, LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Path, G } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { getMyJoinedAt } from '../services/profile';
import { KO_TO_EN } from './MainScreen';
import { SHORT_COUNTRY_EN } from '../constants/countryDisplay';
import { getCapitalByKo } from '../constants/capitals';
import RatingStars from '../components/RatingStars';
import { profileLink } from '../utils/appLinks';
import type { RootStackScreenProps } from '../navigation/types';

// ── 셰브런 화살표 (시안 134:1155~1170) ──
// 시안은 낱개 8.98×16.27 셰브런 3개를 7.5 간격으로 붙여 한 세트로 쓴다.
// path는 Figma에서 내보낸 것 그대로(선이 면으로 변환된 형태 — 둥근 끝·꼭짓점 포함).
const CHEV_D =
  'M1.67775 0.277683C1.28426 -0.102065 0.657432 -0.090929 0.277684 0.302557C-0.102065 0.696043 -0.0909286 1.32287 0.302557 1.70262L0.990153 0.990153L1.67775 0.277683ZM7.99015 7.98162L8.70458 8.66718C9.07071 8.28563 9.07241 7.68373 8.70845 7.30012L7.99015 7.98162ZM0.275722 14.5909C-0.102901 14.9855 -0.0899736 15.6123 0.304596 15.9909C0.699165 16.3695 1.32596 16.3566 1.70458 15.962L0.990153 15.2764L0.275722 14.5909ZM5.33716 5.1854L6.05546 4.50389L6.04045 4.48807L6.02475 4.47293L5.33716 5.1854ZM7.99015 7.98162L7.27572 7.29607L0.275722 14.5909L0.990153 15.2764L1.70458 15.962L8.70458 8.66718L7.99015 7.98162ZM0.990153 0.990153L0.302557 1.70262L4.64956 5.89786L5.33716 5.1854L6.02475 4.47293L1.67775 0.277683L0.990153 0.990153ZM5.33716 5.1854L4.61886 5.8669L7.27186 8.66313L7.99015 7.98162L8.70845 7.30012L6.05546 4.50389L5.33716 5.1854Z';
const CHEV_W = 8.9803;
const CHEV_H = 16.2666;
const CHEV_PITCH = 7.5;  // 시안 좌표 간격(152→159→167)
const CHEV_COUNT = 3;
const CHEV_SET_W = CHEV_PITCH * (CHEV_COUNT - 1) + CHEV_W;

/** 안쪽을 향하는 셰브런 3개 세트. flip이면 좌우 반전(오른쪽 열용) */
function Chevrons({ color, flip }: { color: string; flip?: boolean }) {
  return (
    <Svg
      width={CHEV_SET_W}
      height={CHEV_H}
      viewBox={`0 0 ${CHEV_SET_W} ${CHEV_H}`}
      style={flip ? { transform: [{ scaleX: -1 }] } : undefined}
    >
      {Array.from({ length: CHEV_COUNT }).map((_, i) => (
        <G key={i} x={i * CHEV_PITCH}>
          <Path d={CHEV_D} fill={color} />
        </G>
      ))}
    </Svg>
  );
}

const two = (n: number) => String(n).padStart(2, '0');
// "2025.04.13" / "2025-04-13" / ISO 모두 수용 — 실패 시 null.
// 날짜만 있는 문자열을 new Date()에 넘기면 'UTC 자정'으로 해석돼 아래 로컬 getter(fmtYMD)와
// 어긋난다(UTC- 시간대에서 하루 밀림) → 수동 파서로 로컬 자정 Date를 만든다.
const parseD = (s?: string | null): Date | null => {
  if (!s) return null;
  const m = s.trim().match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
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
const enName = (ko: string) => (SHORT_COUNTRY_EN[ko] ?? (ko === '대한민국' ? 'South Korea' : KO_TO_EN[ko] ?? ko));

const SCREEN_W = Dimensions.get('window').width;
const TICKET_MARGIN = 14;
const BACKDROP = '#0A0B0F'; // 탭(공유 버튼 노출) 시 채우는 검은 배경 — 공유하기 가시성 확보
const PURPLE = '#7C3AED';
const LILAC = '#CA82FF';
const STAR_YELLOW = '#FFBC00';

// 티켓 흰 카드 실루엣(react-native-svg Path)으로 노치를 '진짜 구멍'으로 판다 —
// 화면이 프로필 탭 위 투명 오버레이라, 파인 노치·카드 바깥으로 프로필 탭이 그대로 비친다.
const TICKET_W = SCREEN_W - TICKET_MARGIN * 2;
const CARD_R = 15;              // 카드 하단 라운드(st.ticket borderBottomRadius와 동일)
const SIDE_NOTCH_R = 17;        // 절취선 좌우 반원 노치 반지름(지름 34)
const NOTCH_DEPTH = 32;         // 하단 중앙 노치 깊이
const NOTCH_W = TICKET_W * 0.33; // 하단 중앙 노치 폭(시안: 티켓 폭의 약 33%)

export default function ProfileTicketScreen({ navigation, route }: RootStackScreenProps<'ProfileTicket'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { handle, installedAt } = useSettings();
  const { records, tripGroups } = useRecords();
  const { tripCount, neighborCount } = route.params;
  const ticketRef = useRef<View>(null);
  const hasHandle = !!handle;

  // SVG 흰 카드 실루엣 좌표 측정 — 카드 높이·보라 높이·절취선 Y는 flex 레이아웃에 따라 달라지므로 onLayout으로 잰다.
  const [ticketH, setTicketH] = useState(0);   // 티켓 전체 높이
  const [purpleH, setPurpleH] = useState(0);   // 상단 보라 높이(절취선 Y 기준점)
  const [perfMidY, setPerfMidY] = useState(0); // 절취선 중심 Y — st.white 기준(카드 기준은 purpleH + perfMidY)

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

  // 동행자 — 기록들에 태그된 메이트의 누적 고유 수
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

  // 흰 카드 실루엣 Path(시계방향 외곽선, y-down): 상단 각짐(보라가 덮음) → 우측 노치 → 우하 라운드
  //  → 하단 중앙 노치 → 좌하 라운드 → 좌측 노치. 오목 노치는 sweep=0, 볼록 코너는 sweep=1.
  // 파인 노치·카드 바깥으로 투명 화면(=프로필 탭)이 비친다.
  const cardCenterX = TICKET_W / 2;
  const perfY = purpleH + perfMidY; // 카드 기준 절취선 중심 Y
  const cardPath =
    ticketH > 0 && perfY > SIDE_NOTCH_R
      ? [
          'M0,0',
          `H${TICKET_W}`,
          `V${perfY - SIDE_NOTCH_R}`,
          `A${SIDE_NOTCH_R},${SIDE_NOTCH_R} 0 0 0 ${TICKET_W},${perfY + SIDE_NOTCH_R}`, // 우측 노치(오목)
          `V${ticketH - CARD_R}`,
          `A${CARD_R},${CARD_R} 0 0 1 ${TICKET_W - CARD_R},${ticketH}`,                 // 우하 라운드
          `H${cardCenterX + NOTCH_W / 2}`,
          `A${NOTCH_W / 2},${NOTCH_DEPTH} 0 0 0 ${cardCenterX - NOTCH_W / 2},${ticketH}`, // 하단 중앙 노치(오목)
          `H${CARD_R}`,
          `A${CARD_R},${CARD_R} 0 0 1 0,${ticketH - CARD_R}`,                            // 좌하 라운드
          `V${perfY + SIDE_NOTCH_R}`,
          `A${SIDE_NOTCH_R},${SIDE_NOTCH_R} 0 0 0 0,${perfY - SIDE_NOTCH_R}`,            // 좌측 노치(오목)
          'Z',
        ].join(' ')
      : null;

  return (
    <View style={st.root}>
      {/* 평소엔 투명(프로필 탭 비침). 탭해서 공유 버튼이 뜨면 검은 배경을 페이드인해 가시성 확보 */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: BACKDROP, opacity: revealAnim }]}
      />

      {/* 티켓 카드 — 캡처 대상. 탭하면 위로 올라가며 하단 공유 버튼이 나타남 */}
      <Animated.View style={[st.ticketTap, { transform: [{ translateY: ticketTranslate }] }]}>
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.98} disabled={!hasHandle} onPress={toggleReveal}>
      <View
        ref={ticketRef}
        collapsable={false}
        style={[st.ticket, { marginTop: 0 }]}
        onLayout={(e: LayoutChangeEvent) => setTicketH(e.nativeEvent.layout.height)}
      >
        {/* 흰 카드 실루엣 — 노치가 파인 SVG. 콘텐츠 View들은 이 위에 투명 배경으로 올라간다 */}
        {cardPath && (
          <Svg
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            width={TICKET_W}
            height={ticketH}
          >
            <Path d={cardPath} fill="#FFFFFF" />
          </Svg>
        )}

        {/* 상단 보라 — 최근 여행지. 상태바 뒤까지 채우도록 paddingTop에 safe-area 반영 */}
        <View
          style={[st.purple, { paddingTop: insets.top + 28 }]}
          onLayout={(e: LayoutChangeEvent) => setPurpleH(e.nativeEvent.layout.height)}
        >
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
              <RatingStars
                score={best.rating}
                size={17}
                gap={7}
                fullColor={STAR_YELLOW}
                emptyColor={LILAC}
                style={st.starRow}
              />
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
            <View style={st.subCol}>
              <Text style={st.statLabel}>{t('profileTicket.recentCountry')}</Text>
              <Text style={st.subValue} numberOfLines={1}>{recentCountry}</Text>
            </View>

            {/* 마주 보는 화살표 — 값 텍스트에서 빼내 가운데 배치.
                양옆 열이 같은 flex라 카드 중앙을 기준으로 정확히 대칭이 되고,
                국가명·가입일 글자 길이가 달라져도 위치가 흔들리지 않는다 */}
            <View style={st.chevPair}>
              <Chevrons color="#0A0A0F" />
              <Chevrons color="#0A0A0F" flip />
            </View>

            <View style={[st.subCol, st.subColRight]}>
              <Text style={st.statLabel}>{t('profileTicket.joinedAt')}</Text>
              <Text style={st.subValue} numberOfLines={1}>{joinedLabel}</Text>
            </View>
          </View>

          <View style={{ flex: 1 }} />

          {/* 절취선 — 양옆 반원 노치는 흰 카드 SVG 실루엣이 판다(여기선 Y만 측정) */}
          <View
            style={st.perforationWrap}
            onLayout={(e: LayoutChangeEvent) => setPerfMidY(e.nativeEvent.layout.y + e.nativeEvent.layout.height / 2)}
          >
            <View style={st.dashRow}>
              {Array.from({ length: 40 }).map((_, i) => <View key={i} style={st.dash} />)}
            </View>
          </View>

          {/* QR — 모서리 브래킷 프레임 */}
          <View style={st.qrArea}>
            <View style={st.qrFrame}>
              <View style={[st.bracket, st.brTL]} />
              <View style={[st.bracket, st.brTR]} />
              <View style={[st.bracket, st.brBL]} />
              <View style={[st.bracket, st.brBR]} />
              {hasHandle
                ? <QRCode value={profileLink(handle)} size={112} color="#000000" backgroundColor="#FFFFFF" quietZone={6} />
                : <Text style={st.qrHint}>{t('friends.qrHint')}</Text>}
            </View>
          </View>
        </View>
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
  root: { flex: 1, backgroundColor: 'transparent' }, // 배경 = 프로필 탭(투명 오버레이)
  ticketTap: { flex: 1 }, // 티켓 탭 영역(내부 View가 캡처 대상)
  ticket: {
    flex: 1,
    marginHorizontal: TICKET_MARGIN,
    marginBottom: 10, // 카드 하단과 공유 버튼 사이 간격
    // 흰 카드 채움·라운드·노치는 SVG 실루엣(cardPath)이 그린다. 컨테이너는 투명.
    backgroundColor: 'transparent',
  },
  // ── 상단 보라 ──
  purple: {
    backgroundColor: PURPLE,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    alignItems: 'center',
    // paddingTop은 인라인으로 insets.top + 28 지정(상태바 아래 여백).
    // 위에 겹치는 버튼이 없는 탑시트라(스와이프로만 닫힘) 여백을 줄여 내용을 위로 올렸다.
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
  favCountry: { color: '#FFFFFF', fontSize: 60, fontWeight: '900', letterSpacing: 1, marginTop: 8 },
  // 기간·막대·수도는 한 덩어리로 읽히되, 기준은 막대다.
  // 행을 카드 폭만큼 늘리고 좌우를 같은 flex로 나눠야 막대가 정확히 가로 중앙에 온다.
  // (예전처럼 행이 자기 폭만 잡으면 기간·수도의 글자 폭 차이만큼 막대가 중앙에서 밀린다)
  favMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14, alignSelf: 'stretch' },
  favDate: { flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '800', textAlign: 'right', lineHeight: 20 },
  favBar: { width: 5, height: 40, backgroundColor: '#FFFFFF', borderRadius: 0, alignSelf: 'center' }, // 각진 막대, 세로 중앙 고정
  favFlag: { flex: 1, fontSize: 26 },
  // 국기 대신 수도(시안 BERN) — flex로 폭이 잡히므로 maxWidth 없이 긴 이름은 adjustsFontSizeToFit이 줄인다
  favCapital: { flex: 1, color: '#FFFFFF', fontSize: 20, fontWeight: '800', letterSpacing: 0.5, textAlign: 'left' },
  // 평점 숫자가 이 영역의 주인공 — 별은 보조라 한 단계 낮춘다
  favRating: { color: '#FFFFFF', fontSize: 54, fontWeight: '900', marginTop: 16, lineHeight: 58 },
  starRow: { flexDirection: 'row', gap: 7, marginTop: 4 },
  noFav: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 26, marginBottom: 30 },
  // ── 하단 흰색 ──
  white: { flex: 1, paddingHorizontal: 28, paddingTop: 24 },
  name: { color: '#0A0A0F', fontSize: 26, fontWeight: '900' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 48 }, // 아이디와 통계 블록 사이 간격(전체 통계를 아래로)
  statCol: { minWidth: 64, alignItems: 'center' }, // 라벨 아래 숫자를 가운데 정렬
  statLabel: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  // 시안(134:1141): Montserrat-Black 28.415 / line-height 1.44(=41).
  // Montserrat-Black은 자체가 최굵기라 fontWeight를 같이 주면 안드로이드에서
  // 없는 변형을 찾다가 시스템 폰트로 폴백한다 — 무게 지정 없이 패밀리만 쓴다.
  statValue: {
    color: '#0A0A0F',
    fontFamily: 'Montserrat-Black',
    fontSize: 28.4,
    lineHeight: 41,
    includeFontPadding: false,
    marginTop: 6,
  },
  subRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 24 },
  subCol: { flex: 1 }, // 좌우 같은 폭이어야 가운데 화살표가 카드 중앙에 온다
  subColRight: { alignItems: 'flex-end' },
  subValue: { color: '#0A0A0F', fontSize: 20, fontWeight: '900', marginTop: 6 },
  // 두 셰브런 세트의 안쪽 간격 — 시안 실측은 52였으나 중앙에서 조금 더 벌림.
  // gap만 키우면 양쪽이 중앙에서 같은 거리씩 멀어져 대칭은 그대로 유지된다.
  chevPair: { flexDirection: 'row', gap: 64, alignItems: 'center', paddingBottom: 4 },
  // ── 절취선 ──
  perforationWrap: { height: 28, justifyContent: 'center', marginHorizontal: -28 },
  dashRow: { flexDirection: 'row', overflow: 'hidden', marginHorizontal: 28 },
  dash: { width: 5, height: 1.6, backgroundColor: '#0A0A0F', marginRight: 4 },
  // ── QR ──
  qrArea: { alignItems: 'center', paddingTop: 14, paddingBottom: 56 },
  qrFrame: { padding: 12, alignItems: 'center', justifyContent: 'center', minWidth: 148, minHeight: 148 },
  bracket: { position: 'absolute', width: 20, height: 20, borderColor: '#0A0A0F' },
  brTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  brTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  brBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  brBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  qrHint: { fontSize: 13, color: '#888888', textAlign: 'center', paddingHorizontal: 8 },
  // ── 하단 공유 버튼(티켓 탭 시 노출) ──
  shareBarWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingTop: 18 },
  shareText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  actionDisabled: { opacity: 0.4 },
});
