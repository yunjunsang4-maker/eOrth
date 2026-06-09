// ── 순수 경로 헬퍼 (테스트 대상) ──
export function tripDir(base: string, tripId: string): string {
  return `${base}trips/${tripId}/`;
}
export function tripPhotoPath(base: string, tripId: string, index: number): string {
  return `${tripDir(base, tripId)}${index}.jpg`;
}

export interface PhotoRef { id?: string; uri: string }

/**
 * 선택 사진 원본을 앱 저장소(documentDirectory)로 복사한다.
 * - id가 있으면 MediaLibrary.getAssetInfoAsync로 localUri(file://)를 얻어 복사(iOS ph:// 대응).
 * - 실패한 장은 건너뛰고 성공한 복사본 URI만 반환.
 */
export async function copyTripOriginals(tripId: string, items: PhotoRef[]): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const MediaLibrary = require('expo-media-library') as typeof import('expo-media-library');

  const base = FileSystem.documentDirectory;
  if (!base) return [];
  const dir = tripDir(base, tripId);
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // 이미 존재하면 무시
  }

  const out: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      let from = it.uri;
      if (it.id) {
        const info = await MediaLibrary.getAssetInfoAsync(it.id, { shouldDownloadFromNetwork: true });
        from = (info.localUri || info.uri || it.uri) as string;
      }
      const to = tripPhotoPath(base, tripId, out.length);
      await FileSystem.copyAsync({ from, to });
      out.push(to);
    } catch (e) {
      // 이 장은 건너뜀
    }
  }
  return out;
}
