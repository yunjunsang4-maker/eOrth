// ── 순수 경로 헬퍼 (테스트 대상) ──
export function tripDir(base: string, tripId: string): string {
  return `${base}trips/${tripId}/`;
}
export function tripPhotoPath(base: string, tripId: string, index: number): string {
  return `${tripDir(base, tripId)}${index}.jpg`;
}

export interface PhotoRef { id?: string; uri: string }

// 카드 썸네일 위치 조정값 (CutPhotoAdjustModal의 CutTransform과 동일 규약)
// tx/ty는 프레임 가로/세로 대비 비율, scale은 배율(≥1)
export interface CoverTransform { scale: number; tx: number; ty: number }

/**
 * cover-fit + 이동/확대 조정값으로 프레임에 실제 보이는 영역을 이미지 픽셀 사각형으로 계산.
 * (조정 모달과 동일한 기하: cover로 채운 뒤 translate → scale)
 */
export function coverCropRect(
  imgW: number,
  imgH: number,
  aspect: number, // 프레임 가로/세로 비율
  t: CoverTransform
): { originX: number; originY: number; width: number; height: number } {
  const imgAspect = imgW / imgH;
  // 프레임을 (가로 aspect × 세로 1) 단위계로 두고 cover-fit 렌더 크기 계산
  const frameW = aspect;
  const frameH = 1;
  const rW = imgAspect >= aspect ? frameH * imgAspect : frameW;
  const pxPerUnit = imgW / (rW * t.scale); // 렌더 단위 → 이미지 픽셀 (== imgH / (rH * t.scale))
  const cropW = Math.min(imgW, frameW * pxPerUnit);
  const cropH = Math.min(imgH, frameH * pxPerUnit);
  // 이미지 중심이 (tx, ty)만큼 이동했으므로 프레임 중심은 이미지 좌표계에서 반대로 이동
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
  const originX = clamp(imgW / 2 - t.tx * frameW * pxPerUnit - cropW / 2, imgW - cropW);
  const originY = clamp(imgH / 2 - t.ty * frameH * pxPerUnit - cropH / 2, imgH - cropH);
  return {
    originX: Math.round(originX),
    originY: Math.round(originY),
    width: Math.max(1, Math.round(cropW)),
    height: Math.max(1, Math.round(cropH)),
  };
}

/**
 * 조정값대로 커버 사진을 실제 크롭해 앱 저장소(trips/{tripId}/cover.jpg)에 저장.
 * 성공 시 영구 보관되는 file:// URI, 실패 시 null(호출부는 원본 커버를 그대로 사용).
 */
export async function bakeCoverCrop(
  uri: string,
  t: CoverTransform,
  aspect: number,
  tripId: string
): Promise<string | null> {
  try {
     
    const ImageManipulator = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
     
    const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');

    // 변형 없이 한 번 호출해 실제 픽셀 크기 측정
    const meta = await ImageManipulator.manipulateAsync(uri, [], {});
    const rect = coverCropRect(meta.width, meta.height, aspect, t);
    const out = await ImageManipulator.manipulateAsync(
      uri,
      [{ crop: rect }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
    );

    const base = FileSystem.documentDirectory;
    if (!base) return out.uri; // 폴백: 캐시 경로라도 반환
    const dir = tripDir(base, tripId);
    try {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    } catch {
      // 이미 존재하면 무시
    }
    // 파일명을 매번 다르게 — 같은 경로를 덮어쓰면 RN Image 캐시가 예전 크롭을 계속 보여준다
    const to = `${dir}cover-${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: out.uri, to });
    return to;
  } catch {
    return null;
  }
}

/**
 * 선택 사진 원본을 앱 저장소(documentDirectory)로 복사한다.
 * - id가 있으면 MediaLibrary.getAssetInfoAsync로 localUri(file://)를 얻어 복사(iOS ph:// 대응).
 * - 실패한 장은 건너뛰고 성공한 복사본 URI만 반환. firstItemCopied로 커버(0번) 성공 여부를 알린다.
 */
export async function copyTripOriginals(
  tripId: string,
  items: PhotoRef[]
): Promise<{ uris: string[]; firstItemCopied: boolean }> {
   
  const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
   
  const MediaLibrary = require('expo-media-library') as typeof import('expo-media-library');

  const base = FileSystem.documentDirectory;
  if (!base) return { uris: [], firstItemCopied: false };
  const dir = tripDir(base, tripId);
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // 이미 존재하면 무시
  }

  const out: string[] = [];
  // 첫 항목(커버)의 복사 성공 여부 — 실패 장을 건너뛰면 배열이 당겨져서, 호출부가
  // copied[0]을 커버로 간주하고 커버용 크롭을 '다른 사진'에 굽는 사고를 막는 데 쓴다.
  let firstItemCopied = false;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      let from = it.uri;
      if (it.id) {
        const info = await MediaLibrary.getAssetInfoAsync(it.id, { shouldDownloadFromNetwork: true });
        // 복사 가능한 file:// 경로 우선(localUri). 없으면 원본 갤러리 uri로 시도(실패 시 skip)
        from = (info.localUri || it.uri) as string;
      }
      const to = tripPhotoPath(base, tripId, out.length);
      await FileSystem.copyAsync({ from, to });
      out.push(to);
      if (i === 0) firstItemCopied = true;
    } catch {
      // 이 장은 건너뜀
    }
  }
  return { uris: out, firstItemCopied };
}
