/**
 * 형식 추천 엔진 — 앨범 저장 직후 백그라운드에서 1회 실행 (설계 §2, §8)
 *
 * fire-and-forget 계약: 어떤 실패도 throw하지 않는다(호출부는 await하지 않음).
 * 실패 시 status:'unavailable' 저장 → UI는 섹션 미노출.
 */
import * as MediaLibrary from 'expo-media-library';
import { isPhotoVisionAvailable } from '../../../modules/photo-vision';
import { FORMAT_RECO_ENABLED } from '../../constants/featureFlags';
import { CUT_FRAMES, cutSlotCount } from '../../constants/cutFrames';
import { ruleConceptClassifier } from './conceptClassifier';
import { blogCandidates, feedCandidates, stripCandidates } from './formatCandidates';
import { buildStylePrior, rankCandidates } from './personalRanker';
import { getRecoState, saveRecoState } from './recoStorage';
import type { ConceptScores, RecoState } from './recoTypes';
import { mediasFingerprint } from './recoTypes';
import { groupPhotosBySpot } from './photoGrouping';
import { assessPhotoQuality } from './qualityAssessment';
import type { PhotoMeta } from './types';

export interface FormatRecoInput {
  albumRecordId: string;
  medias: string[];                          // 앨범 복사본 file:// uri (표시 순서)
  mediaTimes?: Record<string, number>;       // uri → 촬영시각 ms
  mediaAssetIds?: Record<string, string>;    // uri → MediaLibrary assetId (GPS 조회용)
  pastRecords: { viewType?: string }[];      // 개인화 prior 재료 (호출부가 records 전달)
}

const MIN_PHOTOS = 4;      // 이보다 적으면 추천할 게 없다
const GPS_BATCH = 8;       // getAssetInfoAsync 동시 호출 상한 (OOM 방지 — photoGrouping과 동일 규칙)

/** 기본 카테고리 프레임의 슬롯 수 목록 (스트립 후보 생성기 입력) */
function basicSlotCounts(): number[] {
  return CUT_FRAMES.filter((f) => f.category === '기본').map((f) => cutSlotCount(f.layout));
}

export async function runFormatReco(input: FormatRecoInput): Promise<void> {
  // prev는 실패 경로(catch)에서도 읽어야 한다 — 닫음 기록은 재분석 실패에도 유지가 계약이다(설계 §8).
  // try 블록 스코프에 두면 catch가 참조할 수 없어 dismissedIds를 빈 배열로 덮어쓰는 사고가 난다.
  // 초기값 null + 아래 catch의 옵셔널 체이닝이 "getRecoState 자체가 실패한 경우"의 방어도 겸한다.
  let prev: RecoState | null = null;
  try {
    if (!FORMAT_RECO_ENABLED || !isPhotoVisionAvailable) return;
    if (input.medias.length < MIN_PHOTOS) return;

    const fingerprint = mediasFingerprint(input.medias);
    prev = await getRecoState(input.albumRecordId);
    if (prev && prev.mediasFingerprint === fingerprint && prev.status === 'ready') return; // 이미 최신

    const pending: RecoState = {
      albumRecordId: input.albumRecordId,
      mediasFingerprint: fingerprint,
      status: 'pending',
      cards: [],
      dismissedIds: prev?.dismissedIds ?? [], // 닫음 기록은 재분석에도 유지 (설계 §8)
      updatedAt: Date.now(),
    };
    await saveRecoState(pending);

    // 1) 앨범 medias → PhotoMeta (id=uri, 시각은 mediaTimes, GPS는 assetId로 best-effort)
    //    id를 uri로 두는 이유: 이 경로의 사진은 갤러리 asset이 아니라 앨범 복사본이라
    //    MediaLibrary id가 없을 수 있고, 후보 생성기가 photoUris로 앨범 medias를 되짚어야 한다.
    let photos: PhotoMeta[] = input.medias.map((uri) => ({
      id: uri,
      uri,
      thumbnailUri: null,
      creationTime: input.mediaTimes?.[uri] ?? 0,
      width: 0,
      height: 0,
      location: null,
    }));

    if (input.mediaAssetIds) {
      for (let i = 0; i < photos.length; i += GPS_BATCH) {
        const batch = photos.slice(i, i + GPS_BATCH);
        await Promise.all(batch.map(async (p) => {
          const assetId = input.mediaAssetIds?.[p.uri];
          if (!assetId) return;
          try {
            // iCloud 원본 네트워크 다운로드는 금지 — 저장 직후 백그라운드라 배터리·데이터를 쓰면 안 된다
            const info = await MediaLibrary.getAssetInfoAsync(assetId, { shouldDownloadFromNetwork: false });
            if (info.location) p.location = { latitude: info.location.latitude, longitude: info.location.longitude };
            if (!p.creationTime && info.creationTime) p.creationTime = info.creationTime;
          } catch { /* GPS 없음 — 시간 그룹핑으로 진행 */ }
        }));
      }
    }

    // 1-b) 시각을 끝내 못 구한 사진 처리 — 후보안 (b) "제외"를 택했다.
    //   (a) 다른 사진의 평균/중앙값으로 채우기: 그룹핑 자체가 촬영시각 기준이라(photoGrouping.ts)
    //       없는 시각을 지어내면 엉뚱한 스팟에 섞여 들어간다. 거짓 데이터를 만드는 쪽이라 기각.
    //   (c) 하나라도 결손이면 앨범 전체 skip: 레거시 앨범에 사진 한 장만 시각이 없어도
    //       추천이 통째로 죽는다. 과잉 차단이라 기각.
    //   (b) 결손 사진만 빼고 나머지로 분석: 남은 사진 기준으로 일차가 정상 계산되고,
    //       formatCandidates를 건드리지 않아도 되며 침습이 가장 적다. → 채택.
    //
    //   단, "전부 0"인 앨범(mediaTimes가 통째로 없는 옛 앨범)은 빼지 않는다.
    //   기준일이 다 같아 dayIndex가 전부 1이 되므로 "20701일차" 결함이 아예 생기지 않고,
    //   여기서 전부 빼면 멀쩡히 되던 스트립·피드 추천까지 사라진다.
    //   깨지는 건 시각이 있는 사진과 없는 사진이 '섞인' 앨범뿐이다.
    const timedCount = photos.filter((p) => p.creationTime > 0).length;
    if (timedCount > 0 && timedCount < photos.length) {
      photos = photos.filter((p) => p.creationTime > 0);
      if (photos.length < MIN_PHOTOS) {
        // 남은 사진이 너무 적으면 억지로 추천하지 않는다 (섹션 미노출)
        await saveRecoState({ ...pending, status: 'unavailable', updatedAt: Date.now() });
        return;
      }
    }

    // 2) 썸네일 + 네이티브 분석 (quality/semantic/signal 채움)
    const assessed = await assessPhotoQuality(photos);
    if (!assessed.ok || !assessed.data) throw new Error(assessed.errorMessage ?? 'ASSESS_FAILED');
    photos = assessed.data;

    // 3) 스팟 그룹핑 + 컨셉 판정
    const groups = groupPhotosBySpot(photos);
    const concepts = new Map<string, ConceptScores>(
      photos.map((p) => [p.id, ruleConceptClassifier(p)])
    );

    // 4) 후보 생성 + 개인화 재순위
    const cands = [
      ...stripCandidates(photos, groups, concepts, basicSlotCounts()),
      ...feedCandidates(photos, concepts),
      ...blogCandidates(photos, groups, concepts),
    ];
    const ranked = rankCandidates(cands, buildStylePrior(input.pastRecords));

    await saveRecoState({
      ...pending,
      status: ranked.length > 0 ? 'ready' : 'unavailable',
      cards: ranked.map((c) => ({ ...c, createdAt: Date.now() })),
      updatedAt: Date.now(),
    });
  } catch {
    // fire-and-forget 계약: 조용히 unavailable 기록 시도
    try {
      await saveRecoState({
        albumRecordId: input.albumRecordId,
        mediasFingerprint: mediasFingerprint(input.medias),
        status: 'unavailable',
        cards: [],
        dismissedIds: prev?.dismissedIds ?? [], // 실패해도 닫음 기록은 보존 (성공 경로와 같은 계약)
        updatedAt: Date.now(),
      });
    } catch { /* 저장까지 실패하면 포기 */ }
  }
}
