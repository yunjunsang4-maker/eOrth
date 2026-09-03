/**
 * AI 형식 추천 섹션 — TripDetail 히어로 아래 (설계 §6)
 *
 * 미노출 조건: 플래그 OFF / 네이티브 확장 없음 / 게스트(호출부에서 차단) /
 *              status 'unavailable' / 표시할 카드 0.
 * 즉 "추천할 게 없으면 자리도 차지하지 않는다"가 이 컴포넌트의 계약이다.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Text } from '../../ui/Text';
import { isPhotoVisionAvailable } from '../../../modules/photo-vision';
import { FORMAT_RECO_ENABLED } from '../../constants/featureFlags';
import { runFormatReco } from '../../services/photoAI/recoEngine';
import { appendRecoLog, dismissRecoCard, getRecoState } from '../../services/photoAI/recoStorage';
import type { RecoCard, RecoConcept, RecoState, RecoViewType } from '../../services/photoAI/recoTypes';
import { isPendingStale } from '../../services/photoAI/recoTypes';
import { resolveRecoPhotos, sourceFingerprint } from '../../services/photoAI/recoSource';
import type { TravelRecord } from '../../store/recordStore';

const COLORS = {
  card: '#2E2E3B',
  purpleNeon: '#BF85FC',
  dim: '#A1A1B0',
  divider: '#1A1A26',
};

/** 카드에 실제로 그리는 썸네일 수. 나머지는 "+N" 타일 한 칸으로 접는다.
 *  4로 잡은 이유: 가장 좁은 실사용 화면(360dp)에서도 4+1칸이 축소 없이 한 줄에 들어간다. */
const THUMB_MAX = 4;

/**
 * 후보 생성기가 `reco.reason.${viewType}_${concept}`로 조립하는 동적 i18n 키.
 * t()가 ko.ts 구조로 엄격히 타입되어 있어 RecoCard.reasonKey(string)를 그대로 넘기면
 * 컴파일되지 않는다. 실제 키 집합은 두 union의 곱이므로 여기서 한 번만 좁혀 쓴다.
 * (ko/en 양쪽에 15조합이 모두 있어야 하며, 빠지면 런타임에 키 문자열이 그대로 노출된다.)
 */
type ReasonKey = `reco.reason.${RecoViewType}_${RecoConcept}`;

interface Props {
  tripGroupId: string;
  /** pool이 없을 때 폴백 소스로 쓸 앨범 기록 (있으면 전달) */
  albumRecord?: TravelRecord;
  /** 개인화 prior 재료 — 내 과거 기록의 viewType 목록 */
  pastRecords: { viewType?: string }[];
}

export default function RecoSection({ tripGroupId, albumRecord, pastRecords }: Props) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [state, setState] = useState<RecoState | null>(null);
  // 이미 impression을 남긴 cardId 집합.
  // 단순 boolean 플래그로 막으면 최초 1회만 기록되고, 재분석으로 카드 셋이 통째로 바뀌어도
  // 새 카드의 노출이 영영 로그에 남지 않는다. cardId 단위로 세야 "같은 카드 중복 방지"와
  // "새 카드 기록"을 동시에 만족한다. (카드 id는 결정론적이라 같은 카드가 재분석 후
  // 다시 나와도 재로그되지 않는 것이 의도된 동작이다 — formatCandidates 참고)
  const impressionLoggedIds = useRef<Set<string>>(new Set());

  // pastRecords는 호출부에서 매 렌더 새 배열로 만들어질 수 있다. deps에 넣으면
  // load가 매 렌더 재생성 → setState → 재렌더 무한 루프가 된다. ref로 우회한다.
  const pastRecordsRef = useRef(pastRecords);
  pastRecordsRef.current = pastRecords;

  // resolveRecoPhotos·runFormatReco는 비동기다. await 도중 화면이 다른 여행으로 넘어가면
  // (tripGroupId가 바뀌면) 이 load 호출은 낡은 요청이 된다. ref에 항상 최신 값을
  // 담아두고, await 뒤에 "여전히 최신 요청인지" 확인한 뒤에만 setState한다 — 그러지 않으면
  // 늦게 도착한 결과가 새로 들어온 여행의 상태를 덮어쓴다.
  const tripGroupIdRef = useRef(tripGroupId);
  tripGroupIdRef.current = tripGroupId;

  const load = useCallback(async () => {
    if (!FORMAT_RECO_ENABLED || !isPhotoVisionAvailable) return; // 꺼져 있으면 저장소도 읽지 않는다
    const id = tripGroupId;

    const s = await getRecoState(id);
    const photos = await resolveRecoPhotos(id, albumRecord);
    if (tripGroupIdRef.current !== id) return; // 그 사이 다른 여행으로 넘어갔다 — 낡은 결과는 버린다
    const fp = sourceFingerprint(photos);

    // 재분석 트리거는 세 가지다.
    //  (1) 저장된 상태가 아예 없다 = 첫 진입. lazy 분석이라 상태 없음이 정상이고,
    //      여기서 걸지 않으면 추천이 영영 뜨지 않는다.
    //  (2) 소스가 바뀌었다 = 지문 불일치.
    //  (3) 지문은 같은데 마지막 진행 이후 STALE_PENDING_MS가 지났다 = 죽은 분석.
    //      진행 하트비트 덕분에 250장 분석이 오래 걸려도 살아 있으면 죽이지 않는다.
    const fingerprintChanged = !!s && s.sourceFingerprint !== fp;
    const stalePending = !!s && isPendingStale(s, Date.now());
    if (!s || fingerprintChanged || stalePending) {
      setState(s ? { ...s, status: 'pending', cards: [] } : null);
      runFormatReco({ tripGroupId: id, photos, pastRecords: pastRecordsRef.current })
        .then(() => getRecoState(id))
        .then((next) => {
          if (tripGroupIdRef.current !== id) return; // 낡은 요청 — 버린다
          // 엔진에는 "이번 지문에 대해 아무것도 저장하지 않고" 끝나는 경로가 있다
          // (photos.length < MIN_PHOTOS 조기 return, unavailable 재시도 쿨다운 조기 return).
          // 그 경우 다시 읽은 state는 갱신되지 않은 옛 것이라, 그대로 setState하면
          // 이미 지워진 사진의 카드가 되살아나고 수락 시 존재하지 않는 uri가 프리필된다.
          if (!next) { setState(null); return; }
          if (next.sourceFingerprint !== fp) {
            setState({ ...next, sourceFingerprint: fp, status: 'unavailable', cards: [] });
            return;
          }
          setState(next);
        })
        .catch(() => {});
      return;
    }
    setState(s);
  }, [tripGroupId, albumRecord]);

  useEffect(() => { load(); }, [load]);

  // pending이면 5초 간격 폴링 (분석은 수십 초 내 완료)
  useEffect(() => {
    if (state?.status !== 'pending') return;
    const timer = setInterval(() => { getRecoState(tripGroupId).then((s) => s && setState(s)); }, 5000);
    return () => clearInterval(timer);
  }, [state?.status, tripGroupId]);

  const visible = useMemo(
    () => (state ? state.cards.filter((c) => !state.dismissedIds.includes(c.id)) : []),
    [state]
  );

  // 노출 로그는 렌더 본문이 아니라 effect에서 쏜다 — 새 아키텍처의 동시성 렌더는
  // 커밋되지 않는 렌더를 버리므로 렌더 중 부수효과는 중복·유령 로그가 된다.
  useEffect(() => {
    if (visible.length === 0) return;
    for (const c of visible) {
      if (impressionLoggedIds.current.has(c.id)) continue;
      impressionLoggedIds.current.add(c.id);
      appendRecoLog({
        event: 'impression', cardId: c.id, viewType: c.viewType, concept: c.concept,
        photoCountSuggested: c.photoUris.length, ts: Date.now(),
      }).catch(() => {});
    }
  }, [visible]);

  const onDismiss = useCallback((card: RecoCard) => {
    dismissRecoCard(tripGroupId, card.id).catch(() => {});
    setState((s) => (s ? { ...s, dismissedIds: [...s.dismissedIds, card.id] } : s));
    appendRecoLog({
      event: 'dismiss', cardId: card.id, viewType: card.viewType, concept: card.concept,
      photoCountSuggested: card.photoUris.length, ts: Date.now(),
    }).catch(() => {});
  }, [tripGroupId]);

  const onAccept = useCallback((card: RecoCard) => {
    appendRecoLog({
      event: 'accept', cardId: card.id, viewType: card.viewType, concept: card.concept,
      photoCountSuggested: card.photoUris.length, ts: Date.now(),
    }).catch(() => {});
    if (card.viewType === 'feed') {
      navigation.navigate('NewRecord', { recoPrefill: { cardId: card.id, medias: card.photoUris } });
    } else if (card.viewType === 'blog') {
      navigation.navigate('BlogRecord', { recoPrefill: { cardId: card.id, seeds: card.blogSeeds ?? [] } });
    } else {
      navigation.navigate('CutRecord', { recoPrefill: { cardId: card.id, photos: card.photoUris } });
    }
  }, [navigation]);

  // ── 미노출 게이트 (모든 훅 뒤에 둔다 — 훅 순서가 조건에 따라 달라지면 안 된다) ──
  if (!FORMAT_RECO_ENABLED || !isPhotoVisionAvailable) return null;
  if (!state || state.status === 'unavailable') return null;
  if (state.status === 'ready' && visible.length === 0) return null;

  return (
    <View style={st.wrap}>
      <Text style={st.title}>✨ {t('reco.sectionTitle')}</Text>
      {state.status === 'pending' ? (
        <Text style={st.analyzing}>
          {state.progress && state.progress.total > 0
            ? t('reco.analyzingProgress', { done: state.progress.done, total: state.progress.total })
            : t('reco.analyzing')}
        </Text>
      ) : (
        visible.map((card) => (
          <View key={card.id} style={st.card}>
            <TouchableOpacity
              style={st.cardBody}
              onPress={() => onAccept(card)}
              accessibilityRole="button"
              accessibilityLabel={`${t(card.reasonKey as ReasonKey, card.reasonParams)} — ${t(`reco.make_${card.viewType}`)}`}
            >
              {/*
                썸네일 줄은 가로 ScrollView가 아니라 고정 행이다.
                카드 면적의 대부분이 이 줄이라 여기가 안 눌리면 "사진을 눌러 수락"이 안 되는데,
                ScrollView를 끼우면 터치 응답자 다툼이 생겨(안드로이드는 네이티브 스크롤뷰가
                가로채기까지 한다) 위 TouchableOpacity가 발화하지 않는다.
                대신 타일에 flexShrink를 줘서 좁은 화면에서도 THUMB_MAX+1칸이 전부 들어오게 만든다
                (스크롤로 감출 게 없으므로 스크롤 자체가 필요 없다).
              */}
              <View style={st.thumbRow}>
                {card.photoUris.slice(0, THUMB_MAX).map((uri) => (
                  <Image key={uri} source={{ uri }} style={st.thumb} />
                ))}
                {card.photoUris.length > THUMB_MAX && (
                  <View style={[st.thumb, st.more]}>
                    <Text style={st.moreText}>+{card.photoUris.length - THUMB_MAX}</Text>
                  </View>
                )}
              </View>
              <Text style={st.reason}>{t(card.reasonKey as ReasonKey, card.reasonParams)}</Text>
              <Text style={st.cta}>→ {t(`reco.make_${card.viewType}`)}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={st.close}
              onPress={() => onDismiss(card)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Text style={st.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 16 },
  title: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginBottom: 10 },
  analyzing: { color: COLORS.dim, fontSize: 13 },
  card: {
    backgroundColor: COLORS.card, borderRadius: 14, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.divider,
  },
  cardBody: {},
  // paddingRight는 닫기 버튼(absolute top:8 right:10) 자리 확보 — 마지막 타일이 ✕에 깔리면
  // 그 부분을 눌렀을 때 수락이 아니라 닫기가 발화한다.
  thumbRow: { flexDirection: 'row', gap: 6, marginBottom: 8, paddingRight: 22 },
  // flexShrink: 좁은 화면에서 타일 폭만 줄여 THUMB_MAX+1칸이 항상 한 줄에 들어오게 한다.
  // (가로 스크롤을 쓰면 터치를 가로채므로 스크롤 대신 축소로 해결한다)
  thumb: { width: 52, height: 52, flexShrink: 1, borderRadius: 8, backgroundColor: COLORS.divider },
  more: { alignItems: 'center', justifyContent: 'center' },
  moreText: { color: COLORS.dim, fontSize: 12, fontWeight: '600' },
  reason: { color: '#FFFFFF', fontSize: 13, marginBottom: 2 },
  cta: { color: COLORS.purpleNeon, fontSize: 13, fontWeight: '600' },
  close: { position: 'absolute', top: 8, right: 10 },
  closeText: { color: COLORS.dim, fontSize: 14 },
});
