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
  try {
    if (!FORMAT_RECO_ENABLED || !isPhotoVisionAvailable) return;
    if (input.medias.length < MIN_PHOTOS) return;

    const fingerprint = mediasFingerprint(input.medias);
    const prev = await getRecoState(input.albumRecordId);
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
        dismissedIds: [],
        updatedAt: Date.now(),
      });
    } catch { /* 저장까지 실패하면 포기 */ }
  }
}
