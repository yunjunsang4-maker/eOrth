import { Image } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * 기록 사진 압축 유틸 (피드/블로그/스트립 공용).
 * - 장변이 maxEdge보다 큰 사진만 비율 유지로 축소 + JPEG 재인코딩
 * - 이미 작은 사진은 그대로 둠(업스케일 금지)
 * - 크기 측정/변환 실패 시 원본 uri 반환(검은 타일·누락 방지)
 */
export const PHOTO_MAX_EDGE = 1600;
export const PHOTO_QUALITY = 0.75;

function getSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

export async function compressImage(
  uri: string,
  maxEdge: number = PHOTO_MAX_EDGE,
  quality: number = PHOTO_QUALITY,
): Promise<string> {
  try {
    const { width, height } = await getSize(uri);
    const longEdge = Math.max(width, height);
    if (!longEdge || longEdge <= maxEdge) return uri; // 작으면 패스
    // 장변 = maxEdge 가 되도록 width 지정 (height 는 비율 자동)
    const targetWidth = width >= height ? maxEdge : Math.round((width * maxEdge) / height);
    const ctx = ImageManipulator.manipulate(uri);
    ctx.resize({ width: targetWidth });
    const ref = await ctx.renderAsync();
    const result = await ref.saveAsync({ compress: quality, format: SaveFormat.JPEG });
    return result.uri || uri;
  } catch {
    return uri; // 실패 시 원본 폴백
  }
}

export async function compressImages(
  uris: string[],
  maxEdge: number = PHOTO_MAX_EDGE,
  quality: number = PHOTO_QUALITY,
): Promise<string[]> {
  return Promise.all(uris.map((u) => compressImage(u, maxEdge, quality)));
}
