/**
 * 체류 중 주변국 여행 카드 제안 배너 — 홈 헤더 아래 (설계 §5)
 *
 * 제안이 없으면 자리도 차지하지 않는다. 대기 목록은 stayTripSuggestStore가 단일 출처이고
 * 감지기가 갱신하면 구독으로 즉시 반영된다.
 * [카드 만들기] = 과거여행 불러오기와 같은 결과물(useImportTripsIntoCards).
 * [나중에] = 24시간 숨김. [×] = 거절(재스캔에도 안 뜸).
 * 스타일은 MateRecoConsentBanner를 따른다.
 *
 * 참고: `importTrips`(useImportTripsIntoCards의 반환)는 recordStore의 함수들을 의존성으로
 * 삼아 렌더마다 참조가 바뀔 수 있다. 그래서 create()의 useCallback도 매 렌더 새로 만들어지지만,
 * create는 onPress로만 쓰이고 **어떤 useEffect의 의존성에도 들어가지 않는다** — 아래 effect의
 * deps는 []뿐이라 재구독·재실행 루프가 생기지 않는다.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { Text } from '../ui/Text';
import { andFitText } from '../utils/fitText';
import { countryLabel } from '../utils/countryLabel';
import { emitToast } from '../store/toastStore';
import { select, success, warn } from '../utils/haptics';
import type { TravelRecord } from '../store/recordStore';
import { newScanSessionId, type TripTextMaker } from '../utils/pastTripScan';
import { useImportTripsIntoCards } from '../hooks/useImportTripsIntoCards';
import { shortYmd, suggestionToScannedTrip, type TripSuggestion } from '../utils/stayTripSuggest';
import {
  loadPending, savePending, subscribePending, addDismissed,
  visibleSuggestions, snoozeSuggestion, removeSuggestions,
} from '../utils/stayTripSuggestStore';

const C = {
  card: '#2E2E3B',
  neon: '#BF85FC',
  dim: '#A1A1B0',
  divider: '#1A1A26',
  white: '#FFFFFF',
};

interface Props {
  /** 카드 생성 직후 호출 — 호출부(MainScreen)가 한 건이면 그 카드로 이동한다 */
  onCreated?: (records: TravelRecord[]) => void;
}

export default function StayTripSuggestBanner({ onCreated }: Props) {
  const { t, i18n } = useTranslation();
  const importTrips = useImportTripsIntoCards();
  const [pending, setPending] = useState<TripSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  // 스누즈 만료를 렌더 시점에 다시 판정하기 위한 now — 앱이 열려 있는 동안 정확할 필요는 없다
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    loadPending().then((p) => { if (alive) { setPending(p); setNow(Date.now()); } }).catch(() => {});
    const off = subscribePending((p) => { if (alive) { setPending(p); setNow(Date.now()); } });
    // 스누즈 만료는 시간이 지나야 풀리는데 now는 로드·구독 때만 갱신된다. 홈은 탭 화면이라
    // 탭 전환으로 언마운트되지 않으므로, 이 리스너가 없으면 24시간이 지나도 감지기의 다음
    // 스캔(최대 12시간 뒤)이나 앱 재시작 전까지 배너가 돌아오지 않는다.
    // 타이머 대신 포그라운드 복귀에 now만 갱신한다 — 렌더 재판정에는 이것으로 충분하다.
    const sub = AppState.addEventListener('change', (s) => { if (alive && s === 'active') setNow(Date.now()); });
    return () => { alive = false; off(); sub.remove(); };
  }, []);

  const visible = useMemo(() => visibleSuggestions(pending, now), [pending, now]);

  // 카드 제목·본문을 현재 언어로 (TravelImportScreen.tripText와 같은 규칙)
  const tripText = useMemo<TripTextMaker>(() => {
    const loc = (ko: string) => countryLabel(ko, i18n.language);
    return {
      title: (c) => t('imports.tripTitle', { country: loc(c) }),
      content: (c, n) => t('imports.tripContent', { country: loc(c), count: n }),
    };
  }, [t, i18n.language]);

  const create = useCallback(async () => {
    if (busy || visible.length === 0) return;
    setBusy(true);
    select();
    try {
      const sessionId = newScanSessionId();
      const trips = visible.map((s) => suggestionToScannedTrip(s, tripText, sessionId));
      const result = await importTrips(trips);
      // ⚠️ 쓰기 직전에 최신 목록을 다시 읽는다. importTrips는 표지 복사·풀 저장까지 하는 긴
      //    작업이라 그 사이 포그라운드 복귀 → 감지기 savePending이 끼어들 수 있는데, 버튼을
      //    누른 시점의 스냅샷(pending state)으로 덮어쓰면 그때 발견된 제안이 조용히 사라진다
      //    (알림은 왔는데 배너에는 없는 상태 — 다음 스캔은 12시간 뒤다).
      const latest = await loadPending();
      await savePending(removeSuggestions(latest, visible.map((s) => s.key)));
      success();
      const records = result.created.map((c) => c.record);
      if (records.length !== 1) emitToast(t('stayTripSuggest.createdToast', { count: records.length }));
      onCreated?.(records);
    } catch (e) {
      if (__DEV__) console.warn('[StayTripSuggestBanner] 카드 생성 실패:', e);
      warn();
      emitToast(t('stayTripSuggest.createFail'));
    } finally {
      setBusy(false);
    }
  }, [busy, visible, tripText, importTrips, onCreated, t]);

  const later = useCallback(async () => {
    select();
    const at = Date.now();
    // create와 같은 이유로 스냅샷이 아니라 최신 목록 위에 스누즈를 얹는다
    let next = await loadPending();
    for (const s of visible) next = snoozeSuggestion(next, s.key, at);
    await savePending(next);
  }, [visible]);

  const dismiss = useCallback(async () => {
    select();
    for (const s of visible) await addDismissed(s.key);
    // addDismissed도 await가 있어(키 수만큼) 그 사이 감지기가 저장할 수 있다 — 최신을 다시 읽는다
    const latest = await loadPending();
    await savePending(removeSuggestions(latest, visible.map((s) => s.key)));
  }, [visible]);

  if (visible.length === 0) return null;

  return (
    <View style={st.wrap}>
      <View style={st.headRow}>
        <Text style={st.title}>{t('stayTripSuggest.bannerTitle')}</Text>
        <TouchableOpacity onPress={dismiss} disabled={busy} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel={t('stayTripSuggest.dismissA11y')}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <SvgPath d="M18 6L6 18M6 6l12 12" stroke={C.dim} strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </TouchableOpacity>
      </View>
      {visible.map((s) => (
        <Text key={s.key} style={st.row} numberOfLines={1}>
          {s.countryFlag} {t('stayTripSuggest.row', {
            country: countryLabel(s.countryName, i18n.language),
            start: shortYmd(s.startDate), end: shortYmd(s.endDate), count: s.photoCount,
          })}
        </Text>
      ))}
      <View style={st.btnRow}>
        <TouchableOpacity style={[st.btn, st.laterBtn]} onPress={later} disabled={busy} activeOpacity={0.85}>
          <Text style={st.laterTxt} {...andFitText}>{t('stayTripSuggest.later')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.btn, st.createBtn]} onPress={create} disabled={busy} activeOpacity={0.85}>
          {busy ? (
            <ActivityIndicator color="#1A1A26" />
          ) : (
            <Text style={st.createTxt} {...andFitText}>
              {visible.length === 1 ? t('stayTripSuggest.create') : t('stayTripSuggest.createMany', { count: visible.length })}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {
    marginHorizontal: 12, marginTop: 4, padding: 14,
    backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.divider,
    zIndex: 6, // 지구본 토글(zIndex 5)보다 위
  },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: 14, fontWeight: '700', color: C.white, lineHeight: 20 },
  row: { fontSize: 12, color: C.dim, lineHeight: 18, marginTop: 6 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  laterBtn: { borderWidth: 1, borderColor: C.divider },
  laterTxt: { fontSize: 13, color: C.dim, fontWeight: '600' },
  createBtn: { backgroundColor: C.neon },
  createTxt: { fontSize: 13, color: '#1A1A26', fontWeight: '700' },
});
