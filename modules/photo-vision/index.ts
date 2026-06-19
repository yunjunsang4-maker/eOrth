/**
 * photo-vision — 로컬 Expo Module 의 JS 바인딩
 *
 * 네이티브(iOS Vision)가 없는 환경(Expo Go / 안드로이드 빌드 전 / 웹)에서는
 * requireNativeModule 이 throw 하므로, 안전하게 null 로 폴백하고
 * isPhotoVisionAvailable 로 가용성을 노출한다.
 */

import { requireNativeModule } from 'expo-modules-core';

/** 네이티브가 돌려주는 사진 1장 분석 원시 지표 */
export interface NativePhotoAnalysis {
  uri: string;
  blurVariance: number;     // 라플라시안 분산 (클수록 선명)
  meanLuminance: number;    // 0~1 평균 밝기
  aestheticsScore: number;  // 0~1 미학 점수, 미지원 시 -1
  isUtility: boolean;       // 영수증/문서/스크린샷류
  // ─ 의미 분석 (Step 5) ─
  hasFace: boolean;         // 인물 포함
  isSmiling: boolean;       // 웃는 얼굴 (Android만 판정, iOS는 항상 false)
  isFood: boolean;          // 음식
  isLandscape: boolean;     // 풍경/자연
  isLandmark: boolean;      // 건축물/랜드마크
  error?: string | null;
}

interface PhotoVisionNativeModule {
  aestheticsAvailable: boolean;
  analyzePhotos(uris: string[]): Promise<NativePhotoAnalysis[]>;
}

let nativeModule: PhotoVisionNativeModule | null = null;
try {
  nativeModule = requireNativeModule<PhotoVisionNativeModule>('PhotoVision');
} catch {
  nativeModule = null;
}

/** 네이티브 Vision 모듈을 실제로 사용할 수 있는지 */
export const isPhotoVisionAvailable = nativeModule !== null;

/** iOS 18+ 미학 점수까지 사용 가능한지 */
export const isAestheticsAvailable =
  nativeModule?.aestheticsAvailable ?? false;

/**
 * 썸네일 file:// 경로 배열을 분석한다.
 * 네이티브가 없으면 빈 배열을 반환(호출부에서 graceful degrade).
 */
export async function analyzePhotos(
  uris: string[]
): Promise<NativePhotoAnalysis[]> {
  if (!nativeModule) return [];
  return nativeModule.analyzePhotos(uris);
}
