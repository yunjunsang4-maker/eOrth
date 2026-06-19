/**
 * Step 2 — 기술적 품질 평가 (오케스트레이션)
 *
 * 흐름:
 *  1. 각 사진 원본 uri → expo-image-manipulator 로 축소 썸네일(file://) 생성
 *     (네이티브엔 절대 원본을 넘기지 않음 = OOM 방지)
 *  2. 썸네일 경로 배열을 batch 단위로 photo-vision 네이티브 모듈에 전달
 *  3. 네이티브 원시 지표(흔들림/노출/미학/유틸리티)를 임계값으로 판정 →
 *     PhotoMeta.quality 채우고, isUtility 는 Step 3용 semantic.isDocument 로 미리 기록
 *
 * 네이티브(Vision)가 없는 환경에서는 자동으로 graceful degrade:
 *  - 품질 평가를 건너뛰고 모든 사진을 passed=true 로 통과시킨다(파이프라인 중단 방지).
 */

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import {
  analyzePhotos,
  isPhotoVisionAvailable,
  type NativePhotoAnalysis,
} from '../../../modules/photo-vision';
import type { PhotoAIResult, PhotoMeta, PhotoQuality } from './types';

// ─── 임계값 (튜닝 가능) ───
export interface QualityThresholds {
  /** 라플라시안 분산 이 값 미만이면 흔들림/초점 흐림으로 간주. 기본 60 */
  blurVarianceMin?: number;
  /** 평균 밝기 하한 (이하 = 저노출). 기본 0.12 */
  luminanceMin?: number;
  /** 평균 밝기 상한 (이상 = 과노출). 기본 0.92 */
  luminanceMax?: number;
}

export interface QualityOptions extends QualityThresholds {
  /** 썸네일 한 변(px). 기본 512 */
  thumbnailSize?: number;
  /** 네이티브 분석 배치 크기(OOM 방지). 기본 8 */
  batchSize?: number;
}

const DEFAULTS = {
  blurVarianceMin: 60,
  luminanceMin: 0.12,
  luminanceMax: 0.92,
  thumbnailSize: 512,
  batchSize: 8,
};

// ─── 썸네일 생성 ───
/**
 * 원본 uri → 축소 JPEG 썸네일 생성 후 file:// 경로 반환. 실패 시 null.
 */
export async function makeThumbnail(
  uri: string,
  size: number = DEFAULTS.thumbnailSize
): Promise<string | null> {
  try {
    const ctx = ImageManipulator.manipulate(uri);
    ctx.resize({ width: size }); // 높이는 비율 유지로 자동 계산
    const ref = await ctx.renderAsync();
    const result = await ref.saveAsync({ compress: 0.6, format: SaveFormat.JPEG });
    return result.uri;
  } catch {
    return null;
  }
}

// ─── 원시 지표 → PhotoQuality 판정 ───
function toQuality(
  raw: NativePhotoAnalysis,
  t: Required<QualityThresholds>
): PhotoQuality {
  const notBlurry = raw.blurVariance >= t.blurVarianceMin;
  const exposureOk =
    raw.meanLuminance >= t.luminanceMin && raw.meanLuminance <= t.luminanceMax;

  // 0~1 정규화 점수 (UI 표시/정렬용)
  const blurScore = Math.max(0, Math.min(1, raw.blurVariance / 500));
  // 0.5(중간 밝기)에서 멀어질수록 0에 가깝게
  const exposureScore = Math.max(0, 1 - Math.abs(raw.meanLuminance - 0.5) * 2);

  return {
    blurScore,
    exposureScore,
    aestheticsScore: raw.aestheticsScore >= 0 ? raw.aestheticsScore : undefined,
    passed: notBlurry && exposureOk,
  };
}

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * 사진 배열의 기술적 품질을 평가하여 quality / semantic.isDocument 를 채운 새 배열 반환.
 * (입력 배열은 변경하지 않음)
 */
export async function assessPhotoQuality(
  photos: PhotoMeta[],
  options: QualityOptions = {}
): Promise<PhotoAIResult<PhotoMeta[]>> {
  const t: Required<QualityThresholds> = {
    blurVarianceMin: options.blurVarianceMin ?? DEFAULTS.blurVarianceMin,
    luminanceMin: options.luminanceMin ?? DEFAULTS.luminanceMin,
    luminanceMax: options.luminanceMax ?? DEFAULTS.luminanceMax,
  };
  const thumbnailSize = options.thumbnailSize ?? DEFAULTS.thumbnailSize;
  const batchSize = options.batchSize ?? DEFAULTS.batchSize;

  // 네이티브 없으면 전부 통과 처리(파이프라인 유지)
  if (!isPhotoVisionAvailable) {
    return {
      ok: true,
      data: photos.map((p) => ({ ...p, quality: { passed: true } })),
    };
  }

  try {
    const byId = new Map(photos.map((p) => [p.id, { ...p }]));

    for (const batch of chunk(photos, batchSize)) {
      // 1) 썸네일 생성 (이미 있으면 재사용)
      const withThumb = await Promise.all(
        batch.map(async (p) => ({
          photo: p,
          thumb: p.thumbnailUri ?? (await makeThumbnail(p.uri, thumbnailSize)),
        }))
      );

      const analyzable = withThumb.filter((x) => x.thumb) as {
        photo: PhotoMeta;
        thumb: string;
      }[];

      // 2) 네이티브 분석
      const results = await analyzePhotos(analyzable.map((x) => x.thumb));
      const resultByUri = new Map(results.map((r) => [r.uri, r]));

      // 3) 매핑
      for (const { photo, thumb } of analyzable) {
        const target = byId.get(photo.id);
        if (!target) continue;
        target.thumbnailUri = thumb;

        const raw = resultByUri.get(thumb);
        if (!raw || raw.error) {
          target.quality = { passed: true }; // 분석 실패분은 보수적으로 통과
          continue;
        }
        target.quality = toQuality(raw, t);
        target.semantic = {
          ...(target.semantic ?? {}),
          isDocument: raw.isUtility,
          hasFace: raw.hasFace,
          isSmiling: raw.isSmiling,
          isFood: raw.isFood,
          isLandscape: raw.isLandscape,
          isLandmark: raw.isLandmark,
        };
      }

      // 썸네일 생성 실패분도 통과 처리
      for (const { photo } of withThumb.filter((x) => !x.thumb)) {
        const target = byId.get(photo.id);
        if (target) target.quality = { passed: true };
      }
    }

    return { ok: true, data: Array.from(byId.values()) };
  } catch (e) {
    return {
      ok: false,
      errorCode: 'SCAN_FAILED',
      errorMessage: e instanceof Error ? e.message : '품질 평가 중 오류가 발생했습니다.',
    };
  }
}

/** quality.passed 인 사진만 남긴다 */
export function filterByQuality(photos: PhotoMeta[]): PhotoMeta[] {
  return photos.filter((p) => p.quality?.passed !== false);
}
