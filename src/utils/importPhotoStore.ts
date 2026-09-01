// ── 순수 경로 헬퍼 (테스트 대상) ──
export function tripDir(base: string, tripId: string): string {
  return `${base}trips/${tripId}/`;
}
export function tripPhotoPath(base: string, tripId: string, index: number): string {
  return `${tripDir(base, tripId)}${index}.jpg`;
}
/**
 * 카드 썸네일 후보의 저장 경로. 시도마다 파일명을 달리한다 —
 * 같은 경로를 재사용하면 앞선 시도가 반쯤 쓰고 실패한 파일이 남아 다음 시도의
 * copyAsync가 '대상이 이미 있음'으로 또 실패한다(연쇄 실패).
 */
export function tripCoverPath(base: string, tripId: string, attempt: number): string {
  return `${tripDir(base, tripId)}cover-src-${attempt}.jpg`;
}

/**
 * 제한 병렬 실행기 — items를 최대 limit개씩 동시에 처리한다.
 * 각 작업의 실패는 호출부(worker)가 삼키는 것을 전제로 하며, 모든 항목이 정확히 1회 처리된다.
 * (사진 복사처럼 '순서는 나중에 복원하되 대기 시간은 겹치고 싶은' 작업용)
 */
export async function runWithConcurrency(
  count: number,
  limit: number,
  work: (index: number) => Promise<void>,
): Promise<void> {
  if (count <= 0) return;
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, count)) }, async () => {
    while (true) {
      const i = next++;
      if (i >= count) return;
      await work(i);
    }
  });
  await Promise.all(workers);
}

/**
 * 병렬 복사 결과(인덱스별 성공 경로 또는 null) → 원본 순서를 지킨 목록.
 * - uris: 성공한 복사본 경로(원본 순서)
 * - srcIndexes: 각 uris 항목의 원본 인덱스 (호출부가 촬영일 등 원본 메타를 대응시킨다)
 * - firstItemCopied: 0번(커버) 성공 여부. 실패 시 uris[0]은 '다른 사진'이므로
 *   호출부가 커버 크롭을 굽지 않도록 알린다.
 */
export function compactCopyResults(copiedByIndex: (string | null)[]): {
  uris: string[];
  srcIndexes: number[];
  firstItemCopied: boolean;
} {
  const uris: string[] = [];
  const srcIndexes: number[] = [];
  for (let i = 0; i < copiedByIndex.length; i++) {
    const uri = copiedByIndex[i];
    if (!uri) continue;
    uris.push(uri);
    srcIndexes.push(i);
  }
  return { uris, srcIndexes, firstItemCopied: copiedByIndex.length > 0 && copiedByIndex[0] != null };
}

export interface PhotoRef {
  id?: string;
  uri: string;
  // 스캔 단계에서 이미 회수한 원본 file:// 경로. 있으면 getAssetInfoAsync를 건너뛴다
  // (iOS에서 이 호출은 매번 원본 파일을 열어 EXIF까지 파싱하므로 장당 비용이 크다).
  localUri?: string;
}

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

    // 픽셀 크기 측정은 Image.getSize로 — 예전의 무변형 manipulateAsync([], {})는 크기만
    // 필요한데 원본 전체를 디코드+재인코딩해서 고화소 사진 기준 0.5~2초를 그냥 버렸다.
    // getSize는 헤더만 읽고, 조정값 t를 만든 CutPhotoAdjustModal도 getSize 기준이라
    // 좌표계도 이쪽이 원래 정합이다(둘 다 EXIF 회전 적용된 표시 크기).
    const { Image } = require('react-native') as typeof import('react-native');
    const { width: imgW, height: imgH } = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject),
    );
    const rect = coverCropRect(imgW, imgH, aspect, t);
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

/** 카드 썸네일 확보 결과. 실패하면 uri가 null이고 error에 마지막 실패 사유가 담긴다. */
export interface TripCoverResult {
  uri: string | null;
  source: PhotoRef | null;
  /** 마지막 실패 사유(사람이 읽는 문자열). 성공이면 null. 화면이 진단에 쓴다. */
  error: string | null;
  attempts: number;
}

const errText = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);

/**
 * 카드 썸네일 1장을 앱 저장소로 확보한다. 후보를 순서대로 시도해 처음 성공한 것을 돌려준다.
 *
 * copyTripOriginals와 따로 두는 이유:
 * - 저 함수는 '여러 장 중 몇 장 실패해도 된다'는 전제라 실패를 통째로 삼킨다. 썸네일은
 *   한 장이 전부라, 실패하면 카드가 기본 이모지(🗼) 목업으로 떨어진다 — 사유가 필요하다.
 * - 단순 파일 복사로는 못 읽는 원본이 있다. 안드로이드 스코프 저장소의 content:// 자산,
 *   iOS HEIC·iCloud 오프로드가 대표적이다.
 *
 * 시도 순서(장당):
 *   1) ImageManipulator로 카드 크기(장변 1080)로 리사이즈 → JPEG.
 *      원시 파일 경로가 아니라 플랫폼 이미지 디코더를 거치므로 위 경우들을 통과하고,
 *      결과가 앱 캐시 파일이라 그 다음 복사는 항상 허용된다. 썸네일에 원본 화질도 불필요하다.
 *   2) 그래도 안 되면 원본 파일 그대로 복사(디코더가 못 여는 포맷 대비).
 *   ⚠️ 두 경로 모두 '경로를 다시 구해서' 한 번 더 시도한다 — 스캔이 회수해 둔 localUri는
 *      iOS에서 PhotoKit 캐시 경로라 시간이 지나면 만료된다. 만료된 경로로만 시도하고
 *      끝내면(자산 조회를 건너뛰면) 멀쩡한 사진도 전부 실패한다.
 */
export async function copyTripCover(
  tripId: string,
  candidates: PhotoRef[],
): Promise<TripCoverResult> {

  const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');

  const MediaLibrary = require('expo-media-library') as typeof import('expo-media-library');

  const ImageManipulator = require('expo-image-manipulator') as typeof import('expo-image-manipulator');

  const fail = (msg: string, attempts: number): TripCoverResult => {
    if (__DEV__) console.warn(`[cover] ${msg}`);
    return { uri: null, source: null, error: msg, attempts };
  };

  const base = FileSystem.documentDirectory;
  if (!base) return fail('documentDirectory 없음 — 썸네일을 저장할 곳이 없다', 0);

  const dir = tripDir(base, tripId);
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch (e) {
    // 이미 존재하면 정상. 진짜로 못 만든 경우는 아래 저장에서 드러난다.
    if (__DEV__) console.warn('[cover] 폴더 생성 경고:', errText(e));
  }

  let lastError = '후보 없음';

  // 한 경로(from)로 저장을 시도한다. 성공하면 저장된 경로, 실패하면 null.
  const tryFrom = async (from: string, to: string): Promise<string | null> => {
    try {
      const out = await ImageManipulator.manipulateAsync(
        from,
        [{ resize: { width: 1080 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
      );
      await FileSystem.copyAsync({ from: out.uri, to });
      return to;
    } catch (e) {
      lastError = `리사이즈 실패(${from}): ${errText(e)}`;
      if (__DEV__) console.warn(`[cover] ${lastError}`);
    }
    try {
      await FileSystem.copyAsync({ from, to });
      return to;
    } catch (e) {
      lastError = `복사 실패(${from}): ${errText(e)}`;
      if (__DEV__) console.warn(`[cover] ${lastError}`);
    }
    return null;
  };

  for (let k = 0; k < candidates.length; k++) {
    const it = candidates[k];
    // 시도마다 파일명을 달리한다 — 반쯤 쓰고 실패한 파일이 남아 다음 시도를 연쇄 실패시키지 않게
    const to = tripCoverPath(base, tripId, k);

    // 1) 스캔이 회수해 둔 경로가 있으면 먼저(추가 조회 없음)
    if (it.localUri) {
      const ok = await tryFrom(it.localUri, to);
      if (ok) return { uri: ok, source: it, error: null, attempts: k + 1 };
    }
    // 2) 자산 id로 경로를 다시 구한다. iCloud 오프로드 원본은 여기서 내려받는다.
    //    localUri가 있었더라도 만료됐을 수 있으므로 반드시 여기까지 온다.
    if (it.id) {
      try {
        const info = await MediaLibrary.getAssetInfoAsync(it.id, { shouldDownloadFromNetwork: true });
        const resolved = (info.localUri || it.uri) as string;
        if (resolved && resolved !== it.localUri) {
          const ok = await tryFrom(resolved, to);
          if (ok) return { uri: ok, source: it, error: null, attempts: k + 1 };
        }
      } catch (e) {
        lastError = `자산 조회 실패(${it.id}): ${errText(e)}`;
        if (__DEV__) console.warn(`[cover] ${lastError}`);
      }
    }
    // 3) 마지막으로 스캔이 준 uri 그대로
    if (it.uri && it.uri !== it.localUri) {
      const ok = await tryFrom(it.uri, to);
      if (ok) return { uri: ok, source: it, error: null, attempts: k + 1 };
    }
  }

  return fail(`후보 ${candidates.length}장 전부 실패 — 마지막 사유: ${lastError}`, candidates.length);
}

/**
 * 선택 사진 원본을 앱 저장소(documentDirectory)로 복사한다.
 * - id가 있으면 MediaLibrary.getAssetInfoAsync로 localUri(file://)를 얻어 복사(iOS ph:// 대응).
 * - 실패한 장은 건너뛰고 성공한 복사본 URI만 반환. firstItemCopied로 커버(0번) 성공 여부를 알린다.
 */
export async function copyTripOriginals(
  tripId: string,
  items: PhotoRef[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ uris: string[]; firstItemCopied: boolean; srcIndexes: number[] }> {
   
  const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
   
  const MediaLibrary = require('expo-media-library') as typeof import('expo-media-library');

  const base = FileSystem.documentDirectory;
  if (!base) return { uris: [], firstItemCopied: false, srcIndexes: [] };
  const dir = tripDir(base, tripId);
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // 이미 존재하면 무시
  }

  // 파일명은 '원본 인덱스'로 짓는다 — 병렬 복사라 완료 순서가 뒤섞여도 경로가 겹치지 않는다.
  const copiedByIndex = new Array<string | null>(items.length).fill(null);
  let done = 0;
  onProgress?.(0, items.length);

  const copyOne = async (i: number) => {
    const it = items[i];
    const to = tripPhotoPath(base, tripId, i);
    // 1순위: 스캔 때 받아 둔 localUri (추가 조회 없음)
    if (it.localUri) {
      try {
        await FileSystem.copyAsync({ from: it.localUri, to });
        copiedByIndex[i] = to;
        return;
      } catch {
        // 세션이 지나 경로가 만료됐을 수 있다 → 아래 정식 경로로 재시도
      }
    }
    try {
      let from = it.uri;
      if (it.id) {
        // iCloud 원본은 여기서 내려받는다(shouldDownloadFromNetwork: true)
        const info = await MediaLibrary.getAssetInfoAsync(it.id, { shouldDownloadFromNetwork: true });
        from = (info.localUri || it.uri) as string;
      }
      await FileSystem.copyAsync({ from, to });
      copiedByIndex[i] = to;
    } catch {
      // 이 장은 건너뜀 (iCloud 오프로드 실패 등)
    }
  };

  // 제한 병렬 — 순차 복사는 장당 (메타데이터 조회 + 원본 복사)를 직렬로 기다려 200장이면
  // 수십 초가 걸렸다. 지배 비용은 iCloud 오프로드 원본 다운로드(네트워크 대기)라 겹칠수록
  // 이득이 커서 동시 8장으로 올렸다(4 → 8, '저장 공간 최적화' 기기에서 체감 절반).
  // 메모리는 안전하다 — getAssetInfoAsync는 파일 URL만 주고 copyAsync는 스트리밍 복사라
  // 원본을 메모리에 통째로 올리는 단계가 없다(디코드 없음). jetsam 위험은 동시 수와 무관.
  await runWithConcurrency(items.length, 8, async (i) => {
    await copyOne(i);
    done++;
    onProgress?.(done, items.length);
  });

  // 원본 순서를 유지한 채 실패 장만 걸러낸다 (호출부가 srcIndexes로 원본 메타를 대응)
  const { uris, srcIndexes, firstItemCopied } = compactCopyResults(copiedByIndex);
  return { uris, firstItemCopied, srcIndexes };
}
