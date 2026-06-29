/**
 * Step 4 — 전체 파이프라인 오케스트레이터
 *
 * 1) 증분 스캔: 마지막 처리 시각 이후 촬영분만 새로 가져옴 (배터리/발열 절약)
 * 2) 신규 사진만 품질 평가(네이티브) — 과거 사진 재분석 안 함
 * 3) 신규 + 캐시 메타를 합쳐 전체 재그룹화 (그룹 경계가 신규 사진으로 바뀔 수 있으므로)
 * 4) 그룹별 베스트컷 선정
 * 5) 결과/캐시/스캔상태를 로컬 DB(AsyncStorage)에 저장
 */

import { fetchRecentPhotoMeta , groupPhotosBySpot } from './photoGrouping';

import { assessPhotoQuality, type QualityOptions } from './qualityAssessment';
import { attachBestCuts, type SelectionOptions } from './bestCutSelector';
import {
  getPhotoMetaCache,
  getScanState,
  savePhotoMetaCache,
  saveScanState,
  saveSpotGroups,
} from './photoAIStorage';
import type {
  GroupingOptions,
  PhotoAIResult,
  PhotoMeta,
  SpotGroup,
} from './types';

export interface PipelineOptions {
  /** 1회 실행 시 새로 가져올 최대 사진 수. 기본 200 */
  limit?: number;
  /** 전체 재스캔(증분 무시). 기본 false */
  fullRescan?: boolean;
  grouping?: GroupingOptions;
  quality?: QualityOptions;
  selection?: SelectionOptions;
}

export interface PipelineResult {
  groups: SpotGroup[];
  totalPhotos: number;
  newPhotos: number;
}

/**
 * 파이프라인 1회 실행. 백그라운드 태스크와 수동 트리거 양쪽에서 사용.
 */
export async function runPhotoAIPipeline(
  options: PipelineOptions = {}
): Promise<PhotoAIResult<PipelineResult>> {
  const { limit = 200, fullRescan = false } = options;

  // ─── 1) 증분 스캔 ───
  const prevState = fullRescan ? null : await getScanState();
  const createdAfter = prevState?.lastPhotoCreationTime ?? undefined;

  const scan = await fetchRecentPhotoMeta({
    limit,
    createdAfter,
    batchSize: options.quality?.batchSize,
  });

  // 신규 사진이 없으면 기존 캐시로 재구성만 하고 종료
  if (!scan.ok) {
    if (scan.errorCode === 'NO_ASSETS') {
      const rebuilt = await rebuildFromCache(options);
      return rebuilt;
    }
    return { ok: false, errorCode: scan.errorCode, errorMessage: scan.errorMessage };
  }

  const newPhotos = scan.data ?? [];

  // ─── 2) 신규 사진 품질 평가 ───
  const quality = await assessPhotoQuality(newPhotos, options.quality);
  if (!quality.ok || !quality.data) {
    return { ok: false, errorCode: quality.errorCode, errorMessage: quality.errorMessage };
  }

  // ─── 3) 캐시 병합 ───
  const cache = (fullRescan ? null : await getPhotoMetaCache()) ?? {};
  for (const p of quality.data) cache[p.id] = p;
  const allPhotos = Object.values(cache);

  // ─── 4) 재그룹화 + 베스트컷 ───
  const groups = groupPhotosBySpot(allPhotos, options.grouping);
  const withBest = attachBestCuts(groups, allPhotos, options.selection);

  // ─── 5) 저장 ───
  await savePhotoMetaCache(cache);
  await saveSpotGroups(withBest);
  await saveScanState({
    lastScanAt: Date.now(),
    lastPhotoCreationTime: latestCreationTime(allPhotos),
    processedCount: allPhotos.length,
  });

  return {
    ok: true,
    data: {
      groups: withBest,
      totalPhotos: allPhotos.length,
      newPhotos: newPhotos.length,
    },
  };
}

/** 신규 사진 없이 캐시만으로 그룹/베스트컷 재구성 */
async function rebuildFromCache(
  options: PipelineOptions
): Promise<PhotoAIResult<PipelineResult>> {
  const cache = (await getPhotoMetaCache()) ?? {};
  const allPhotos = Object.values(cache);
  if (allPhotos.length === 0) {
    return { ok: false, errorCode: 'NO_ASSETS', errorMessage: '분석된 사진이 없습니다.' };
  }
  const groups = groupPhotosBySpot(allPhotos, options.grouping);
  const withBest = attachBestCuts(groups, allPhotos, options.selection);
  await saveSpotGroups(withBest);
  return {
    ok: true,
    data: { groups: withBest, totalPhotos: allPhotos.length, newPhotos: 0 },
  };
}

function latestCreationTime(photos: PhotoMeta[]): number | null {
  if (photos.length === 0) return null;
  return photos.reduce((max, p) => Math.max(max, p.creationTime), 0);
}
