/**
 * albumReanalyze.ts — 옛 사진첩의 '날짜 다시 찾기'
 *
 * 촬영시각(mediaTimes)이 없는 사진만 골라 시각을 찾는다. 이미 있는 사진은 건드리지 않는다.
 * 사진마다 순서:
 *   1. 로컬(원격 http가 아닌) 사진이고 mediaAssetIds[uri]가 있으면 MediaLibrary creationTime — 사진첩 생성
 *      (AlbumCreateScreen)이 mediaTimes에 담는 값과 같은 원천이라 기준이 맞는다. 권한 거부면 건너뛰고,
 *      limited면 범위 밖 자산은 실패해 2단계로 간다.
 *      ⚠️ http(서버에서 받은) 사진엔 하지 않는다 — 안드로이드 assetId는 기기마다 따로 매기는 일련번호라
 *      다른 기기에서 조회하면 엉뚱한 사진의 날짜가 '성공'으로 와 저장·서버 전파된다. 로컬 복사본이 있다는
 *      것이 작성 기기라는 증거다. 풀 수 없는 assetId로 권한 팝업을 띄우지 않는 효과도 있다.
 *   2. 로컬이면 파일의 EXIF DateTimeOriginal(utils/exifFromBytes). 앨범 사진은 copyTripOriginals가
 *      원본을 복사한 것이라 EXIF가 살아 있다(파일명은 .jpg지만 iPhone은 내용이 HEIC일 수 있다).
 *      - 앞 64KB를 읽어 HEIF(ftyp heic 등)면 meta/iinf/iloc으로 Exif 항목 위치를 구해 그 범위만 다시 읽는다.
 *        iPhone 24/48MP HEIC는 Exif 항목이 파일 앞 256KB 밖 mdat에 있을 수 있어 앞부분 스캔으론 못 찾는다.
 *        meta가 64KB보다 길면(애플식으로 iloc이 meta 맨 끝) meta 선언 크기만큼(상한 1MB) 다시 읽는다.
 *      - 그 밖(JPEG 등)은 앞 64KB 마커 스캔.
 *      - 못 찾으면 형식과 상관없이 같은 폴백: 파일이 64KB보다 크면 앞 256KB 마커 스캔, 작으면 이미 읽은
 *        파일 전체를 마커 스캔(HEIF iloc 해석이 실패한 작은 파일 대비). 큰 ICC·APP13 뒤에 Exif가 오는 편집 JPEG도 여기서 잡힌다.
 *   원격 URL(http)은 두 단계 모두 건너뛴다 — assetId는 위 이유로, EXIF는 서버본이 압축본이라 없을 가능성이 커서.
 *   단 uploadedMediaUrls(로컬 → 업로드 URL) 역매핑으로 그 URL의 **로컬 원본 파일**이 있으면 그 경로로 두 단계를
 *   수행한다 — 작성 기기에서도 medias가 서버 URL로 통째 바뀌는 경로가 있다(mergeMyRecords.pickUriList).
 *   로컬 파일·업로드 캐시가 있다는 것이 작성 기기라는 증거라 assetId 오매칭 위험이 없다. 찾은 시각은 medias의
 *   실제 uri(http) 키로 돌려준다.
 * 대상 선정은 effectiveMediaTimes 기준 — 화면의 '날짜 미상'·버튼 노출(TripRecordRenderer)과 같은 함수다.
 * 결과는 찾은 시각(찾은 것만)과 못 찾은 이유별 장수. 병합·저장은 호출부(TripRecordScreen) 몫이다.
 */
import * as MediaLibrary from 'expo-media-library';
import { readAsStringAsync, getInfoAsync } from 'expo-file-system/legacy';
import { effectiveMediaTimes } from './albumSections';
import { exifTakenAtFromBytes, exifTakenAtFromHeifExif, findHeifExifRange, heifMetaEnd, isHeif, ftypBrand, base64ToBytes } from './exifFromBytes';

// 앞부분 — JPEG APP1(최대 64KB)과 HEIF meta 박스(iinf·iloc, 48MP 타일 수백 개여도 수 KB~수십 KB)가 들어간다
const HEAD_BYTES = 64 * 1024;
// HEIF Exif 항목 읽기 상한 — 날짜 태그는 TIFF 앞쪽이라 64KB면 충분하다(뒤쪽은 썸네일·메이커노트)
const HEIF_EXIF_MAX = 64 * 1024;
// ponytail: 폴백 스캔은 앞 256KB까지 — ftyp를 못 알아본 파일이나 iloc 해석이 실패한 HEIF용.
//   construction_method 1(idat)·2(item)로 담긴 Exif는 지원하지 않는다(iPhone 카메라 HEIC가 0=파일 오프셋을 쓴다는 것은 추정 — 실기기 로그로 확인할 것).
const SCAN_BYTES = 256 * 1024;
// meta가 앞부분(64KB)보다 길면 선언 크기만큼 다시 읽는다 — 그 상한. 넘으면 망가진 크기로 보고 폴백 스캔만
const META_MAX = 1024 * 1024;
const CONCURRENCY = 4;

interface ReanalyzeRecord {
  medias?: string[];
  mediaTimes?: Record<string, number>;
  mediaAssetIds?: Record<string, string>;
  uploadedMediaUrls?: Record<string, string>;
}

/** 못 찾은 사진의 이유별 장수 — 사진 하나는 한 이유에만 센다(우선순위: remote > permissionLimited > fileMissing > noExif) */
export interface ReanalyzeReasons {
  remote: number;            // 서버에서 받은(http) 사진이고 로컬 원본(업로드 캐시 역매핑)도 없음 — 건너뜀
  permissionLimited: number; // assetId는 있는데 사진 권한이 제한·거부돼 기기 사진첩 조회를 못 함(파일 EXIF도 실패)
  fileMissing: number;       // 파일을 읽지 못함(없음·경로 깨짐·디코드 실패)
  noExif: number;            // 파일은 읽었는데 날짜 정보가 없음
}

/** buildAlbumTimeline이 '날짜 미상'으로 보내는 기준과 같다(숫자이고 0보다 큼이 아니면 없음) */
const hasTime = (ts: unknown) => typeof ts === 'number' && ts > 0;

type Outcome = { ts: number; stage: string } | { reason: keyof ReanalyzeReasons; stage: string };

export async function findMissingPhotoTimes(
  record: ReanalyzeRecord,
): Promise<{ times: Record<string, number>; tried: number; found: number; reasons: ReanalyzeReasons }> {
  const known = effectiveMediaTimes(record);
  const targets = [...new Set((record.medias ?? []).filter((u) => !hasTime(known?.[u])))];
  const times: Record<string, number> = {};
  const reasons: ReanalyzeReasons = { remote: 0, permissionLimited: 0, fileMissing: 0, noExif: 0 };
  if (targets.length === 0) return { times, tried: 0, found: 0, reasons };

  const isRemote = (u: string) => /^https?:\/\//i.test(u);
  // 업로드 URL → 이 기기의 로컬 원본 경로. 로컬 키가 원격인 쌍(다른 기기 기록 재발행)은 쓰지 않는다
  const localOf = new Map<string, string>();
  for (const [lo, re] of Object.entries(record.uploadedMediaUrls ?? {})) if (re && !isRemote(lo)) localOf.set(re, lo);
  // 사진을 실제로 읽을 경로 — 로컬이면 그대로, 원격이면 역매핑한 로컬 원본, 없으면 undefined(remote)
  const sourceOf = (u: string) => (isRemote(u) ? localOf.get(u) : u);
  let canQueryAssets = false;
  let limited = false;
  // 권한은 1단계 대상(로컬 + assetId)이 있을 때만 묻는다
  if (targets.some((u) => { const src = sourceOf(u); return !!src && !!record.mediaAssetIds?.[src]; })) {
    try {
      // false = 쓰기 권한 불필요(읽기만). iOS limited도 status는 granted로 오고 accessPrivileges로 구분된다.
      const perm = await MediaLibrary.requestPermissionsAsync(false);
      canQueryAssets = perm.status === 'granted';
      limited = perm.accessPrivileges === 'limited';
    } catch { /* 권한 조회 실패 — 2단계만 */ }
  }

  // position·length로 일부만 읽어 바이트로. 읽기 실패는 throw, 디코드 실패는 undefined
  const readPart = async (uri: string, position: number, length: number) =>
    base64ToBytes(await readAsStringAsync(uri, { encoding: 'base64', position, length }));

  // uri는 사진을 읽을 경로(로컬). 결과 키는 호출부가 medias의 원래 uri로 붙인다
  const findOne = async (uri: string): Promise<Outcome> => {
    const assetId = record.mediaAssetIds?.[uri];
    // 기기 사진첩을 못 본 이유가 권한이면 표시 — 파일 EXIF까지 실패했을 때 이 이유로 센다
    let assetBlocked = !!assetId && !canQueryAssets;
    if (assetId && canQueryAssets) {
      try {
        // 네트워크 다운로드 없이 — iCloud 오프로드 원본을 받으러 가지 않는다(creationTime은 DB 값이라 필요 없음)
        const info = await MediaLibrary.getAssetInfoAsync(assetId, { shouldDownloadFromNetwork: false });
        if (hasTime(info?.creationTime)) return { ts: info.creationTime, stage: 'asset' };
        // iOS(expo-media-library 18)는 limited 범위 밖·지워진 자산이면 throw가 아니라 null로 resolve한다
        // (ios/MediaLibraryModule.swift getAssetInfoAsync의 resolve(nil)). limited면 범위 밖일 가능성으로 본다
        assetBlocked = limited;
      } catch {
        // reject로 오는 경우(Android 등, 미확인) — 같은 규칙. 어느 쪽이든 2단계(파일 EXIF)로 간다
        assetBlocked = limited;
      }
    }
    const miss = (reason: 'fileMissing' | 'noExif', stage: string): Outcome =>
      ({ reason: assetBlocked ? 'permissionLimited' : reason, stage });

    let head: Uint8Array | undefined;
    try {
      head = await readPart(uri, 0, HEAD_BYTES);
    } catch {
      return miss('fileMissing', 'read-head');
    }
    if (!head) return miss('fileMissing', 'decode-head');

    let headScanned = false;
    if (isHeif(head)) {
      // meta가 앞부분보다 길면 선언 크기만큼 다시 읽어야 iloc이 보인다
      let metaBytes = head;
      const metaEnd = heifMetaEnd(head);
      if (metaEnd && metaEnd > head.length && metaEnd <= META_MAX) {
        try {
          metaBytes = (await readPart(uri, 0, metaEnd)) ?? head;
        } catch { /* 다시 읽기 실패 — 앞부분으로 시도 후 폴백 */ }
      }
      const range = findHeifExifRange(metaBytes);
      if (range) {
        try {
          const p = await readPart(uri, range.offset, Math.min(range.length || HEIF_EXIF_MAX, HEIF_EXIF_MAX));
          const ts = p && exifTakenAtFromHeifExif(p);
          if (ts) return { ts, stage: 'heif-iloc' };
        } catch { /* 범위 읽기 실패 — 아래 폴백 */ }
      }
    } else {
      const ts = exifTakenAtFromBytes(head);
      if (ts) return { ts, stage: 'head-scan' };
      headScanned = true;
    }
    // 폴백(형식 무관): 파일이 앞부분보다 길면 앞 256KB 마커 스캔, 아니면 이미 읽은 파일 전체를 스캔
    if (!headScanned && head.length < HEAD_BYTES) {
      const ts = exifTakenAtFromBytes(head);
      if (ts) return { ts, stage: 'head-scan' };
    }
    if (head.length >= HEAD_BYTES) {
      try {
        const big = await readPart(uri, 0, SCAN_BYTES);
        const ts = big && exifTakenAtFromBytes(big);
        if (ts) return { ts, stage: 'scan-256k' };
      } catch { /* 앞부분은 읽혔으니 날짜 없음으로 센다 */ }
    }
    return miss('noExif', isHeif(head) ? 'heif-no-exif' : 'no-exif');
  };

  // 개발 빌드 진단 — 사진별 경로 접두·크기·ftyp·결과 단계 한 줄. 운영 빌드엔 안 나간다
  const devLog = async (uri: string, o: Outcome) => {
    let size: number | string = '?';
    let brand: string | undefined;
    try {
      const info = await getInfoAsync(uri);
      size = info.exists ? (info.size ?? '?') : 'missing';
      if (info.exists) brand = ftypBrand((await readPart(uri, 0, 16)) ?? new Uint8Array(0)) ?? 'not-ftyp';
    } catch { /* 진단 실패는 무시 */ }
    console.log(`[albumReanalyze] ${uri.slice(0, 48)}…${uri.slice(-24)} size=${size} ftyp=${brand ?? '-'} ${'reason' in o ? o.reason : 'found'}@${o.stage}`);
  };

  // 작은 동시성 풀 — 사진첩은 최대 100장이라 4개면 충분하다
  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const uri = targets[next++];
      const src = sourceOf(uri);
      let o: Outcome;
      if (!src) {
        // 원격이고 로컬 원본도 없음: assetId는 다른 기기 것일 수 있고, 서버본엔 EXIF가 없다
        o = { reason: 'remote', stage: 'remote' };
      } else {
        try {
          o = await findOne(src);
          if (src !== uri) o = { ...o, stage: `${o.stage}(via-local)` };
        } catch {
          o = { reason: 'fileMissing', stage: 'unexpected' };
        }
      }
      if ('reason' in o) reasons[o.reason]++;
      else times[uri] = o.ts; // medias의 실제 uri(http일 수 있음) 키로
      if (__DEV__) await devLog(src ?? uri, o);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
  return { times, tried: targets.length, found: Object.keys(times).length, reasons };
}
