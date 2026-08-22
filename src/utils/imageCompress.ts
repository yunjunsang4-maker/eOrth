import { Image } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { markMetadataStripped, type StripFormat } from './mediaUploadPlan';

/**
 * 기록 사진 압축 유틸 (피드/블로그/스트립 공용).
 * - 장변이 maxEdge보다 큰 사진만 비율 유지로 축소 + JPEG 재인코딩
 * - 이미 작은 사진은 그대로 둠(업스케일 금지)
 * - 크기 측정/변환 실패 시 원본 uri 반환(검은 타일·누락 방지)
 *
 * ImageManipulator 결과물은 비트맵을 새로 인코딩한 파일이라 EXIF(GPS 포함)가 없다.
 * 그 사실을 markMetadataStripped로 장부에 남겨, 업로드 초크포인트(services/media.ts)가
 * 같은 파일을 또 굽지 않게 한다(이중 압축 방지). 자세한 배경은 mediaUploadPlan.ts 참고.
 */
export const PHOTO_MAX_EDGE = 1600;
export const PHOTO_QUALITY = 0.75;

// 목록(피드·스토리·여행카드 커버)용 축소본 규격.
// 피드 카드는 화면 폭 절반짜리 2단 배치라 640px이면 3배 밀도에서도 충분하고,
// 용량은 1600px 원본의 1/6~1/10로 떨어진다(이그레스 절감의 핵심).
// 상세 화면은 계속 원본을 쓴다 — 축소본은 어디까지나 '목록용'이다.
export const THUMB_MAX_EDGE = 640;
export const THUMB_QUALITY = 0.6;

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
    if (result.uri) markMetadataStripped(result.uri); // 재인코딩본 = EXIF 없음(업로드 때 재굽기 방지)
    return result.uri || uri;
  } catch {
    return uri; // 실패 시 원본 폴백 — 이 경우 EXIF가 남아 있으므로 업로드 초크포인트가 다시 굽는다
  }
}

/** 업로드 직전 메타데이터 제거용 재인코딩 품질. 리사이즈가 없어 해상도는 그대로다. */
// 0.92 — 1세대 재인코딩에서 눈에 띄는 손실이 나지 않는 구간. 압축 경로(0.75)·축소본(0.6)을
// 이미 지난 사진은 장부에 올라 있어 여기까지 오지 않으므로 이중 압축이 생기지 않는다.
export const STRIP_QUALITY = 0.92;

const SAVE_FORMAT: Record<StripFormat, SaveFormat> = {
  jpeg: SaveFormat.JPEG,
  png: SaveFormat.PNG,
  webp: SaveFormat.WEBP,
};

/**
 * 위치 메타데이터(EXIF GPS·XMP) 제거 — 크기를 바꾸지 않고 픽셀만 다시 인코딩한다.
 *
 * ImageManipulator는 원본을 디코딩해 네이티브 이미지로 만든 뒤 새로 인코딩한다
 * (iOS `UIImage.jpegData/pngData`, Android `Bitmap.compress`). 둘 다 원본 메타데이터를
 * 옮기지 않으므로 결과 파일에는 GPS가 남지 않는다. 변형(resize/rotate)을 하나도 걸지 않아
 * 해상도·화각은 그대로다. 회전은 로더가 EXIF Orientation을 적용해 픽셀로 구워 준다
 * (compressImage가 이미 같은 경로로 1600px 초과 사진 전부를 통과시켜 온 방식이다).
 *
 * 실패는 null. 호출부는 '원본 업로드'가 아니라 '업로드 포기'를 택해야 한다 —
 * 여기서 원본을 올리는 순간 그게 곧 위치 유출이다.
 */
export async function stripImageMetadata(
  uri: string,
  format: StripFormat = 'jpeg',
  quality: number = STRIP_QUALITY,
): Promise<string | null> {
  try {
    // 변형 없이 렌더 → 저장. 작업 큐가 비어 있으면 로드된 이미지가 그대로 넘어온다.
    const ref = await ImageManipulator.manipulate(uri).renderAsync();
    const out = await ref.saveAsync({ compress: quality, format: SAVE_FORMAT[format] });
    if (!out.uri) return null;
    markMetadataStripped(out.uri);
    return out.uri;
  } catch {
    return null;
  }
}

export async function compressImages(
  uris: string[],
  maxEdge: number = PHOTO_MAX_EDGE,
  quality: number = PHOTO_QUALITY,
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const total = uris.length;
  let done = 0;
  onProgress?.(0, total);
  return Promise.all(
    uris.map((u) =>
      compressImage(u, maxEdge, quality).then((r) => {
        done += 1;
        onProgress?.(done, total);
        return r;
      }),
    ),
  );
}

/**
 * 지구본(WebView)용: 로컬 file:// 사진을 작은 base64 data URI 로 변환.
 * WebView 는 inline HTML 에서 file:// 이미지를 못 그리므로 data URI 로 줘야 텍스처가 뜬다.
 * http/data 는 그대로 통과, 실패 시 null.
 */
export async function imageToDataUri(
  uri: string,
  maxWidth: number = 1024,
  quality: number = 0.85,
): Promise<string | null> {
  if (!uri) return null;
  if (uri.startsWith('http') || uri.startsWith('data:')) return uri;
  try {
    const ctx = ImageManipulator.manipulate(uri);
    // 1024px — 지구본 텍스처가 4096x2048이라 넓은 국가(러시아·미국 등)는 512px론 흐릿함 (비율 자동)
    ctx.resize({ width: maxWidth });
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ compress: quality, format: SaveFormat.JPEG, base64: true });
    return out.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
  } catch {
    return null;
  }
}
