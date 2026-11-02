/**
 * albumReanalyze.ts — 옛 사진첩의 '날짜 다시 찾기'
 *
 * 촬영시각(mediaTimes)이 없는 사진만 골라 시각을 찾는다. 이미 있는 사진은 건드리지 않는다.
 * 사진마다 순서:
 *   1. 로컬 file:// 사진이고 mediaAssetIds[uri]가 있으면 MediaLibrary creationTime — 사진첩 생성
 *      (AlbumCreateScreen)이 mediaTimes에 담는 값과 같은 원천이라 기준이 맞는다. 권한 거부면 건너뛰고,
 *      limited면 범위 밖 자산은 실패해 2단계로 간다.
 *      ⚠️ http(서버에서 받은) 사진엔 하지 않는다 — 안드로이드 assetId는 기기마다 따로 매기는 일련번호라
 *      다른 기기에서 조회하면 엉뚱한 사진의 날짜가 '성공'으로 와 저장·서버 전파된다. 로컬 복사본이 있다는
 *      것이 작성 기기라는 증거다. 풀 수 없는 assetId로 권한 팝업을 띄우지 않는 효과도 있다.
 *   2. 로컬 file://이면 파일 앞부분의 EXIF DateTimeOriginal(utils/exifFromBytes).
 *      앨범 사진은 copyTripOriginals가 원본을 복사한 것이라 EXIF가 살아 있다.
 *   원격 URL(http)은 두 단계 모두 건너뛴다 — assetId는 위 이유로, EXIF는 서버본이 압축본이라 없을 가능성이 커서.
 * 결과는 찾은 것만 담아 돌려준다. 병합·저장은 호출부(TripRecordScreen) 몫이다.
 */
import * as MediaLibrary from 'expo-media-library';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { exifTakenAtFromBytes } from './exifFromBytes';

// ponytail: 앞 256KB만 읽는다. JPEG APP1은 파일 맨 앞(SOI 직후)이지만, iPhone 카메라 HEIC는 Exif TIFF가
//   mdat 안 약 92KB 지점에 있었다(실측 IMG_5518.HEIC 1.4MB: 2490바이트의 'Exif\0\0'는 iinf 항목 이름이라
//   가짜, 진짜 TIFF는 93982바이트). 64KB로 줄이면 이 샘플을 놓쳐 256KB를 유지한다.
//   EXIF 없는 사진의 전체 훑기 비용은 exifFromBytes의 네이티브 indexOf 스캔으로 줄였다.
//   편집·변환 HEIC(libheif 등)는 Exif 항목이 파일 끝 mdat에 있어 못 찾는다(QA 합성본 2.6MB에서 재현).
//   고치려면 meta/iloc을 파싱해 Exif 항목 위치를 구한 뒤 그 범위만 다시 읽어야 한다.
const HEAD_BYTES = 256 * 1024;
const CONCURRENCY = 4;

interface ReanalyzeRecord {
  medias?: string[];
  mediaTimes?: Record<string, number>;
  mediaAssetIds?: Record<string, string>;
}

/** buildAlbumTimeline이 '날짜 미상'으로 보내는 기준과 같다(숫자이고 0보다 큼이 아니면 없음) */
const hasTime = (ts: unknown) => typeof ts === 'number' && ts > 0;

export async function findMissingPhotoTimes(
  record: ReanalyzeRecord,
): Promise<{ times: Record<string, number>; tried: number; found: number }> {
  const targets = [...new Set((record.medias ?? []).filter((u) => !hasTime(record.mediaTimes?.[u])))];
  const times: Record<string, number> = {};
  if (targets.length === 0) return { times, tried: 0, found: 0 };

  const isLocal = (u: string) => u.startsWith('file://');
  let canQueryAssets = false;
  // 권한은 1단계 대상(로컬 + assetId)이 있을 때만 묻는다
  if (targets.some((u) => isLocal(u) && record.mediaAssetIds?.[u])) {
    try {
      // false = 쓰기 권한 불필요(읽기만). limited도 status는 granted로 온다.
      canQueryAssets = (await MediaLibrary.requestPermissionsAsync(false)).status === 'granted';
    } catch { /* 권한 조회 실패 — 2단계만 */ }
  }

  const findOne = async (uri: string): Promise<number | undefined> => {
    if (!isLocal(uri)) return undefined; // 원격: assetId는 다른 기기 것일 수 있고, 서버본엔 EXIF가 없다
    const assetId = record.mediaAssetIds?.[uri];
    if (assetId && canQueryAssets) {
      try {
        // 네트워크 다운로드 없이 — iCloud 오프로드 원본을 받으러 가지 않는다(creationTime은 DB 값이라 필요 없음)
        const info = await MediaLibrary.getAssetInfoAsync(assetId, { shouldDownloadFromNetwork: false });
        if (hasTime(info?.creationTime)) return info.creationTime;
      } catch { /* 기기 사진첩에서 지워졌거나 limited 범위 밖 — 2단계로 */ }
    }
    try {
      const b64 = await readAsStringAsync(uri, { encoding: 'base64', position: 0, length: HEAD_BYTES });
      return exifTakenAtFromBytes(base64ToBytes(b64));
    } catch { /* 파일 없음(컨테이너 경로 깨짐 등) */ }
    return undefined;
  };

  // 작은 동시성 풀 — 사진첩은 최대 100장이라 4개면 충분하다
  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const uri = targets[next++];
      const ts = await findOne(uri);
      if (ts) times[uri] = ts;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
  return { times, tried: targets.length, found: Object.keys(times).length };
}

// Hermes 내장 atob — 저장소에 바이트 디코드 헬퍼가 없다(auth.ts는 JWT 문자열용으로 atob만 쓴다)
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
