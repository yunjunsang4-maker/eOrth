/**
 * Step 1 — 갤러리 사진 메타데이터 추출 + 시간/장소별 그룹화
 *
 * 흐름:
 *  1. 갤러리 권한 요청/확인 (거부 시 명시적 에러 반환)
 *  2. expo-media-library로 최근 사진 asset 목록 조회 (촬영시각 정렬)
 *  3. asset을 batchSize 단위로 쪼개 getAssetInfoAsync 호출 → GPS/EXIF 추출
 *     (배치 처리로 고해상도 정보를 동시에 메모리에 올리지 않음 = OOM 방지)
 *  4. 추출한 PhotoMeta 배열을 시간(30분 이내) 또는 GPS(인접) 기준으로 그룹화
 *
 * ⚠️ 제약 준수:
 *  - 원본 이미지를 메모리로 로드하지 않고 '메타데이터'만 다룬다.
 *  - 실제 픽셀 분석(흔들림/미학 점수)은 Step 2 네이티브 브릿지의 몫이며,
 *    이 단계에서는 썸네일 경로 자리(thumbnailUri)만 비워 둔다.
 */

import * as MediaLibrary from 'expo-media-library';
import type {
  GeoPoint,
  GroupingOptions,
  PhotoAIResult,
  PhotoMeta,
  ScanOptions,
  SpotGroup,
} from './types';
import { averageGeoPoint, haversineDistanceM } from './geoUtils';

// ─── 기본값 ───
const DEFAULT_TIME_GAP_MS = 30 * 60 * 1000; // 30분
const DEFAULT_DISTANCE_M = 200;             // 200m
const DEFAULT_LIMIT = 200;
const DEFAULT_BATCH_SIZE = 8;               // 5~10장 단위 처리

// ─────────────────────────────────────────────
// 1. 권한
// ─────────────────────────────────────────────

/**
 * 갤러리 읽기 권한 요청. 이미 허용돼 있으면 재요청하지 않는다.
 */
export async function ensureGalleryPermission(): Promise<boolean> {
  try {
    const current = await MediaLibrary.getPermissionsAsync();
    if (current.granted) return true;
    // 거부했지만 다시 물어볼 수 있는 경우에만 재요청
    if (!current.canAskAgain) return false;

    const requested = await MediaLibrary.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// 2~3. 메타데이터 추출
// ─────────────────────────────────────────────

/** asset 1건을 PhotoMeta로 변환 (GPS 없으면 location=null) */
async function toPhotoMeta(asset: MediaLibrary.Asset): Promise<PhotoMeta> {
  let location: GeoPoint | null = null;

  try {
    // getAssetInfoAsync 만이 GPS/EXIF를 신뢰성 있게 돌려준다.
    const info = await MediaLibrary.getAssetInfoAsync(asset, {
      shouldDownloadFromNetwork: false, // iCloud 원본 네트워크 다운로드 금지 (배터리/데이터 절약)
    });
    if (info.location) {
      location = {
        latitude: info.location.latitude,
        longitude: info.location.longitude,
      };
    }
  } catch {
    // GPS 정보가 없거나 조회 실패 → location=null 로 진행 (그룹화는 시간으로 처리)
    location = null;
  }

  return {
    id: asset.id,
    uri: asset.uri,
    thumbnailUri: null, // Step 2에서 expo-image-manipulator로 생성 예정
    creationTime: asset.creationTime,
    width: asset.width,
    height: asset.height,
    location,
  };
}

/** 배열을 size 단위로 자른다 */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * 최근 사진의 메타데이터를 배치 단위로 추출한다.
 * - createdAfter 를 주면 그 이후 촬영분만(증분 스캔).
 */
export async function fetchRecentPhotoMeta(
  options: ScanOptions = {}
): Promise<PhotoAIResult<PhotoMeta[]>> {
  const {
    limit = DEFAULT_LIMIT,
    createdAfter,
    batchSize = DEFAULT_BATCH_SIZE,
  } = options;

  const hasPermission = await ensureGalleryPermission();
  if (!hasPermission) {
    return {
      ok: false,
      errorCode: 'PERMISSION_DENIED',
      errorMessage: '갤러리 접근 권한이 거부되었습니다.',
    };
  }

  try {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.photo,
      // 증분 스캔(createdAfter 있음)은 '과거→최신(오름차순)'으로 읽는다 — 상한(limit)에 걸려도
      // 오래된 것부터 처리되므로 스캔 경계(lastPhotoCreationTime)가 실제 처리한 최신 시각이 되고,
      // 초과분은 다음 회차가 이어서 가져간다. (최신순으로 자르면 잘린 사진의 촬영 시각이
      // 저장된 경계보다 과거가 되어 영구 누락됐다 — 여행 중 사진 폭증 시 재현되던 버그)
      // 첫 스캔(createdAfter 없음)은 최신 사진이 우선이므로 기존대로 최신순.
      sortBy: [[MediaLibrary.SortBy.creationTime, !!createdAfter]],
      first: limit,
      ...(createdAfter ? { createdAfter } : {}),
    });

    const assets = page.assets ?? [];
    if (assets.length === 0) {
      return { ok: false, errorCode: 'NO_ASSETS', errorMessage: '분석할 사진이 없습니다.' };
    }

    // 배치 단위로 getAssetInfoAsync 호출 → 작은 PhotoMeta만 누적하고 큰 객체는 즉시 폐기
    const result: PhotoMeta[] = [];
    for (const group of chunk(assets, batchSize)) {
      const metas = await Promise.all(group.map(toPhotoMeta));
      result.push(...metas);
      // group / metas 의 참조가 사라지면서 JS 엔진이 배치별로 GC 할 수 있다.
    }

    return { ok: true, data: result };
  } catch (e) {
    return {
      ok: false,
      errorCode: 'SCAN_FAILED',
      errorMessage: e instanceof Error ? e.message : '사진 스캔 중 오류가 발생했습니다.',
    };
  }
}

// ─────────────────────────────────────────────
// 4. 그룹화
// ─────────────────────────────────────────────

/**
 * 사진이 현재 그룹에 속하는지 판정.
 * 규칙: "직전 사진과 30분 이내" 또는 "GPS가 인접" 이면 같은 그룹.
 */
function belongsToGroup(
  prev: PhotoMeta,
  curr: PhotoMeta,
  timeGapMs: number,
  distanceThresholdM: number
): boolean {
  const timeClose =
    Math.abs(curr.creationTime - prev.creationTime) <= timeGapMs;
  if (timeClose) return true;

  // 두 사진 모두 GPS가 있을 때만 거리 판정
  if (prev.location && curr.location) {
    return haversineDistanceM(prev.location, curr.location) <= distanceThresholdM;
  }
  return false;
}

/**
 * PhotoMeta 배열을 '여행 스팟 그룹'으로 묶는다.
 * - 입력 순서와 무관하게 내부에서 촬영시각 오름차순 정렬 후 처리.
 */
export function groupPhotosBySpot(
  photos: PhotoMeta[],
  options: GroupingOptions = {}
): SpotGroup[] {
  const {
    timeGapMs = DEFAULT_TIME_GAP_MS,
    distanceThresholdM = DEFAULT_DISTANCE_M,
    minGroupSize = 1,
  } = options;

  if (photos.length === 0) return [];

  // 시간 오름차순 (원본 배열 불변)
  const sorted = [...photos].sort((a, b) => a.creationTime - b.creationTime);

  const groups: SpotGroup[] = [];
  let bucket: PhotoMeta[] = [sorted[0]];

  const flush = () => {
    if (bucket.length < minGroupSize) {
      bucket = [];
      return;
    }
    const coords = bucket
      .map((p) => p.location)
      .filter((l): l is GeoPoint => l !== null);

    groups.push({
      id: `spot_${bucket[0].creationTime}_${bucket[0].id}`,
      photoIds: bucket.map((p) => p.id),
      startTime: bucket[0].creationTime,
      endTime: bucket[bucket.length - 1].creationTime,
      center: averageGeoPoint(coords),
    });
    bucket = [];
  };

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (belongsToGroup(prev, curr, timeGapMs, distanceThresholdM)) {
      bucket.push(curr);
    } else {
      flush();
      bucket = [curr];
    }
  }
  flush();

  return groups;
}

// ─────────────────────────────────────────────
// 통합 진입점
// ─────────────────────────────────────────────

/**
 * 스캔 + 그룹화를 한 번에 수행하는 편의 함수.
 * 반환: { groups, photos } — photos는 후속 단계(품질/의미 분석)에서 재사용.
 */
export async function scanAndGroupPhotos(
  scanOptions: ScanOptions = {},
  groupingOptions: GroupingOptions = {}
): Promise<PhotoAIResult<{ groups: SpotGroup[]; photos: PhotoMeta[] }>> {
  const scan = await fetchRecentPhotoMeta(scanOptions);
  if (!scan.ok || !scan.data) {
    return { ok: false, errorCode: scan.errorCode, errorMessage: scan.errorMessage };
  }

  const groups = groupPhotosBySpot(scan.data, groupingOptions);
  return { ok: true, data: { groups, photos: scan.data } };
}
