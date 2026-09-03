/**
 * AI 형식 추천 섹션 — TripDetail 히어로 아래 (설계 §6)
 *
 * 미노출 조건: 플래그 OFF / 네이티브 확장 없음 / 게스트(호출부에서 차단) /
 *              status 'unavailable' / 표시할 카드 0.
 * 즉 "추천할 게 없으면 자리도 차지하지 않는다"가 이 컴포넌트의 계약이다.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, StyleSheet, TouchableOpacity, View } from 'react-native';
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
import { copyTripOriginals } from '../../utils/importPhotoStore';
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
  // 수락 시 원본 복사 진행 상태. null이면 오버레이 미표시.
  const [copying, setCopying] = useState<{ done: number; total: number } | null>(null);
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

  // 수락 복사도 같은 종류의 경합에 노출된다: 복사가 도는 동안 뒤로 가면(언마운트)
  // 늦게 도착한 결과가 사용자가 이미 떠난 맥락 위에 작성 화면을 불쑥 연다. 그걸 막는다.
  // StrictMode의 mount→cleanup→mount에서 false로 박제되지 않도록 effect 본문에서 되살린다.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

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

  const onAccept = useCallback(async (card: RecoCard) => {
    if (copying) return; // 중복 탭 방지 — 복사가 겹치면 같은 폴더에 이중으로 쓴다
    appendRecoLog({
      event: 'accept', cardId: card.id, viewType: card.viewType, concept: card.concept,
      photoCountSuggested: card.photoUris.length, ts: Date.now(),
    }).catch(() => {});

    // pool 사진은 갤러리 참조(ph://·content://)라 작성 화면에 그대로 넘길 수 없다.
    // 여기서 앱 저장소로 복사해 로컬 file:// 배열로 만들어 넘긴다 — 덕분에 작성 화면
    // 3종(피드·블로그·스트립)은 기존 계약(로컬 uri 배열) 그대로다.
    const gid = tripGroupIdRef.current; // 복사 도중 다른 여행으로 넘어갔는지 판별용
    setCopying({ done: 0, total: card.photoUris.length });
    let uris: string[] = [];
    let srcIndexes: number[] = [];
    try {
      // 자산 id 우선: iOS ph:// uri는 카드가 저장된 뒤 세션이 지나면 만료된다.
      // photoAssetIds의 빈 문자열은 "id 없음"이므로 undefined로 바꿔 넘긴다.
      const items = card.photoUris.map((uri, i) => ({
        id: card.photoAssetIds?.[i] || undefined,
        uri,
      }));
      // 폴더명에 수락 시각을 붙여 수락 한 번마다 고유 폴더를 쓴다. 카드 id는
      // 결정론적이라(formatCandidates가 `${viewType}_${concept}` 형태로 짓는다)
      // 재분석 후에도 같은 id가 다시 나오는데, 폴더를 재사용하면 예전 수락으로
      // 이미 저장된 글이 가리키는 복사본을 새 사진으로 덮어써 글 내용이 바뀐다.
      // "지저분한 폴더명"이 아니라 덮어쓰기 방어다 — Date.now()를 떼지 말 것.
      // (card.id는 영문·숫자·언더스코어, 시각은 숫자뿐이라 경로에 안전하다.
      //  동시 수락은 위 copying 가드가 막으므로 같은 ms 충돌은 실제로 없다.
      //  대가로 작성 중단 시 고아 폴더가 남는데, 그 청소는 Task 9가 다룬다.)
      const res = await copyTripOriginals(
        `reco-${card.id}-${Date.now()}`,
        items,
        (done, total) => setCopying({ done, total }),
      );
      uris = res.uris;
      srcIndexes = res.srcIndexes;
    } catch {
      // uris가 빈 채로 남아 아래 전량 실패 처리로 떨어진다
    }
    setCopying(null);

    // 늦게 도착한 결과: 뒤로 갔거나(언마운트) 다른 여행으로 넘어갔으면 아무것도 하지
    // 않는다 — 떠난 맥락 위에 작성 화면이 불쑥 열리거나, 다른 여행 상세에서 옛 여행의
    // 프리필이 열리는 사고를 막는다. (복사본 파일은 남지만 무해한 잔존물이다)
    if (!mountedRef.current || tripGroupIdRef.current !== gid) return;

    if (uris.length === 0) {
      // 전량 실패 — 빈 프리필로 화면을 열어봐야 혼란만 준다
      Alert.alert(t('trip.noticeTitle'), t('reco.partialCopy', { count: card.photoUris.length }));
      return;
    }
    const skipped = card.photoUris.length - uris.length;
    if (skipped > 0) Alert.alert(t('trip.noticeTitle'), t('reco.partialCopy', { count: skipped }));

    if (card.viewType === 'feed') {
      navigation.navigate('NewRecord', { recoPrefill: { cardId: card.id, medias: uris } });
    } else if (card.viewType === 'blog') {
      // 블로그 씨앗의 images.uris는 원본 uri 기준이라 복사본 uri로 갈아끼운다.
      // srcIndexes[i] = uris[i]가 card.photoUris에서 원래 몇 번째였는지(원본 인덱스).
      // 실패 장이 빠지면 위치가 어긋나므로 배열 위치가 아니라 원본 uri로 매핑한다.
      const byOriginal = new Map<string, string>();
      srcIndexes.forEach((srcIdx, i) => byOriginal.set(card.photoUris[srcIdx], uris[i]));
      const remapped = (card.blogSeeds ?? [])
        .map((seed) =>
          seed.kind === 'images'
            ? { ...seed, uris: seed.uris.map((u) => byOriginal.get(u)).filter((u): u is string => !!u) }
            : seed,
        )
        // 전 장이 실패한 images 블록은 떨군다(빈 블록을 화면에 깔 이유가 없다)
        .filter((seed) => seed.kind !== 'images' || seed.uris.length > 0)
        // 실패로 장수가 줄면 레이아웃도 장수에 맞춘다 — 1장짜리 grid3 같은 어색한 배치 방지.
        // (네이버 가져오기의 장수→레이아웃 규칙과 동일: 1장=single, 2장=grid2, 그 외 유지)
        .map((seed) =>
          seed.kind === 'images' && seed.uris.length <= 2
            ? { ...seed, layout: seed.uris.length === 1 ? ('single' as const) : ('grid2' as const) }
            : seed,
        );
      // 어느 날의 사진이 전부 실패하면 빈 DAY 헤딩만 남는다 — 다음 헤딩 전까지 images가
      // 하나도 없는 헤딩은 떨군다(엔진의 '빈 DAY 헤딩 제거'와 같은 규칙을 여기서도 지킨다).
      const seeds = remapped.filter((seed, idx) => {
        if (seed.kind !== 'heading') return true;
        for (let j = idx + 1; j < remapped.length && remapped[j].kind !== 'heading'; j++) {
          if (remapped[j].kind === 'images') return true;
        }
        return false;
      });
      navigation.navigate('BlogRecord', { recoPrefill: { cardId: card.id, seeds } });
    } else {
      navigation.navigate('CutRecord', { recoPrefill: { cardId: card.id, photos: uris } });
    }
  }, [navigation, copying, t]);

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
      {/* 복사 진행 오버레이.
          ⚠️ Modal을 쓰지 않는다 — 짧은 수명 로딩 오버레이를 Modal로 만들면 껍데기가
             남아 화면 전체 터치가 먹통이 되고 앱 재시작으로만 복구된다(이 저장소 실사고).
          절대위치 View라 섹션 영역만 덮는다: 카드·✕는 막히고(중복 탭 방지의 이중 방어),
          섹션 밖(뒤로 가기 등)은 자유 — 그래서 onAccept에 언마운트 가드가 있다. */}
      {copying && (
        <View style={st.copyOverlay} pointerEvents="auto">
          <Text style={st.copyText}>
            {t('reco.preparing')} {copying.total > 0 ? `${copying.done}/${copying.total}` : ''}
          </Text>
        </View>
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
  copyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,15,0.82)', // 배경 #0A0A0F의 반투명 베일
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  copyText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
});
