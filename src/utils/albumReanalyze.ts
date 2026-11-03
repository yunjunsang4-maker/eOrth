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
 *   1.5 사진첩 매칭(utils/albumGalleryMatch) — 1단계로 못 찾은 로컬 사진을, 앨범 기간(±1일)의 기기 사진첩 자산과
 *      파일 크기로 맞춰 creationTime을 쓴다(가로·세로는 조회 순서에만, 크기 일치 즉시 확정·전부 찾으면 조기 종료·상한 1500장). 옛 앨범(2026-11 이전) 사진은 copyTripOriginals가 원본 localUri를
 *      바이트 그대로 복사한 것이라 크기가 같다. 이후 앨범은 장변 2048 압축본이라 크기가 달라 이 단계는 옛 앨범 대상이다. 파일 EXIF에 기대지 않는다(실기기에서 EXIF 경로가 한 장도 못 찾던 문제 대응 — 원인 미확정).
 *      찾으면 assetId도 돌려줘 호출부가 mediaAssetIds(로컬 키)에 기록한다. 기간이 없으면 건너뛴다.
 *      권한 거부·limited에서 못 찾은 사진은 permissionLimited 쪽으로 센다(limited면 범위 밖 원본은 목록에 없다).
 *   2. 로컬이면 파일의 EXIF DateTimeOriginal(utils/exifFromBytes). 옛 앨범(2026-11 이전) 사진은 copyTripOriginals가
 *      원본을 복사한 것이라 EXIF가 살아 있다(파일명은 .jpg지만 iPhone은 내용이 HEIC일 수 있다). 이후 앨범은
 *      2048 압축본이라 EXIF가 없어 이 단계는 옛 앨범 대상이다(새 앨범은 생성 때 mediaTimes를 기록한다).
 *      - 앞 64KB를 읽어 HEIF(ftyp heic 등)면 meta/iinf/iloc으로 Exif 항목 위치를 구해 그 범위만 다시 읽는다.
 *        iPhone 24/48MP HEIC는 Exif 항목이 파일 앞 256KB 밖 mdat에 있을 수 있어 앞부분 스캔으론 못 찾는다.
 *        meta가 64KB보다 길면(애플식으로 iloc이 meta 맨 끝) meta 선언 크기만큼(상한 1MB) 다시 읽는다.
 *      - 그 밖(JPEG 등)은 앞 64KB 마커 스캔.
 *      - 못 찾으면 형식과 상관없이 같은 폴백: 파일이 64KB보다 크면 앞 256KB 마커 스캔, 작으면 이미 읽은
 *        파일 전체를 마커 스캔(HEIF iloc 해석이 실패한 작은 파일 대비). 큰 ICC·APP13 뒤에 Exif가 오는 편집 JPEG도 여기서 잡힌다.
 *   원격 URL(http)은 assetId·사진첩 단계를 건너뛴다(assetId는 위 이유로). EXIF는 3번(원격 Range)으로 읽는다.
 *   단 uploadedMediaUrls(로컬 → 업로드 URL) 역매핑으로 그 URL의 **로컬 원본 파일**이 있으면 그 경로로 로컬 단계를
 *   수행한다 — 작성 기기에서도 medias가 서버 URL로 통째 바뀌는 경로가 있다(mergeMyRecords.pickUriList).
 *   로컬 파일·업로드 캐시가 있다는 것이 작성 기기라는 증거라 assetId 오매칭 위험이 없다. 찾은 시각은 medias의
 *   실제 uri(http) 키로 돌려준다.
 *   3. 원격(http)이고 로컬 원본도 없으면 HTTP Range로 앞부분만 받아 2번과 같은 EXIF 파이프라인을 돌린다. 업로드 메타데이터
 *      제거(services/media.ts stripImageMetadata) 도입 전 원본(.heic 등)은 서버 사본에 EXIF가 남아 있다 — 실기기 로그로
 *      옛 앨범이 전부 이 경우(remote@remote)임을 확인. 찾은 시각은 http 키로 돌려줘 호출부 updateRecord → updatePost가
 *      서버 사본 mediaTimes(원격 키 그대로 — posts.ts remapUriKeys)에 실어 다른 기기 타임라인에도 반영된다.
 *      **날짜(DateTimeOriginal 계열)만 읽는다** — GPS 등 다른 태그는 파싱·저장하지 않는다(exifFromBytes가 날짜만 꺼낸다).
 * 대상 선정은 effectiveMediaTimes 기준 — 화면의 '날짜 미상'·버튼 노출(TripRecordRenderer)과 같은 함수다.
 * 결과는 찾은 시각(찾은 것만)·사진첩 매칭으로 새로 안 assetId·못 찾은 이유별 장수. 병합·저장은 호출부(TripRecordScreen) 몫이다.
 */
import { Image, Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { readAsStringAsync, getInfoAsync } from 'expo-file-system/legacy';
import { effectiveMediaTimes } from './albumSections';
import { albumDateWindow, orderCandidates, createSizeMatcher, type AlbumPhotoSig, type GalleryCandidate } from './albumGalleryMatch';
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
// 사진첩 조회 페이지 — 메타만 오므로 크게(TravelImportScreen PAGE_SIZE와 같은 값)
const GALLERY_PAGE = 1000;
// 사진첩 자산 파일 크기 조회 상한 — 장당 파일 경로 조회(+stat)라 1500장 × 동시 4 ≈ 수 초. 가로·세로 같은 것·기간 중앙 가까운 것부터 본다
const MAX_PROBES = 1500;
// 원격 Range — 서버가 Range를 무시하고 200으로 통째 주면 이 크기까지만 받아들인다(넘으면 실패). 요청당 시간 상한
// ponytail: RN fetch는 본문을 다 받은 뒤 resolve해서, Range를 무시하는 서버면 큰 파일도 이미 내려받은 뒤에야 거른다.
//   Supabase Storage(S3 계열)는 Range를 지원해 206으로 온다는 전제 — 아니면 스트리밍 읽기가 필요하다.
const REMOTE_FULL_MAX = 8 * 1024 * 1024;
const REMOTE_TIMEOUT_MS = 15000;

/** (position, length) → 바이트. 로컬 파일·원격 Range 둘 다 이 모양이라 EXIF 파이프라인을 공유한다. 실패는 throw, 디코드 실패는 undefined */
type ReadAt = (position: number, length: number) => Promise<Uint8Array | undefined>;

const fileReader = (uri: string): ReadAt => async (position, length) =>
  base64ToBytes(await readAsStringAsync(uri, { encoding: 'base64', position, length }));

/** 원격 Range 읽기. 206이면 받은 조각, 200(Range 무시)이면 전체를 기억해 두고 이후 요청은 잘라서 준다. 그 밖 상태는 throw */
function remoteReader(url: string, stat: { status?: number; bytes: number }): ReadAt {
  let whole: Uint8Array | undefined;
  return async (position, length) => {
    if (whole) return whole.subarray(position, position + length);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), REMOTE_TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers: { Range: `bytes=${position}-${position + length - 1}` }, signal: ac.signal });
      stat.status = res.status;
      if (res.status !== 206 && res.status !== 200) throw new Error(`HTTP ${res.status}`);
      if (res.status === 200 && Number(res.headers.get('content-length')) > REMOTE_FULL_MAX) throw new Error('too large');
      const bytes = new Uint8Array(await res.arrayBuffer());
      stat.bytes += bytes.length;
      if (res.status === 206) return bytes;
      if (bytes.length > REMOTE_FULL_MAX) throw new Error('too large');
      whole = bytes;
      return whole.subarray(position, position + length);
    } finally {
      clearTimeout(timer);
    }
  };
}

// iOS 자산 파일 경로 — expo-media-library/next의 Asset.getUri()(ios/next/objects/asset/Asset.swift: requestContentEditingInput
// → fullSizeImageURL, 기본 옵션이라 네트워크 금지·오프로드면 throw). 구 getAssetInfoAsync는 장마다 CIImage EXIF 파싱에 더해
// Live Photo 짝 영상(.mov 2~4MB)을 tmp에 새로 쓰고 지우지 않아(MediaLibraryModule.swift resolveImage·writePairedVideoAsset)
// 수백 장 조회에 쓰면 느리고 저장 공간을 먹는다. next는 SDK54에서 실험 API — 모듈 로드는 네이티브 모듈이 바이너리에 없으면
// 즉시 throw하므로(requireNativeModule) 최상위 import가 아니라 첫 사용 때 require한다. 실패하면 null → 구 API 폴백.
type NextAssetCtor = new (id: string) => { getUri(): Promise<string> };
let nextAssetCtor: NextAssetCtor | null | undefined;
const loadNextAsset = (): NextAssetCtor | null => {
  if (nextAssetCtor === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- 지연 로드(네이티브 모듈 없으면 throw)
      nextAssetCtor = (require('expo-media-library/next') as { Asset?: NextAssetCtor }).Asset ?? null;
    } catch { nextAssetCtor = null; }
  }
  return nextAssetCtor;
};
// next getUri가 한 번이라도 성공했나 — 성공한 적 있으면 이후 실패는 오프로드로 보고 구 API로 다시 묻지 않는다
let nextUriWorked = false;

interface ReanalyzeRecord {
  startDate?: string;
  endDate?: string;
  medias?: string[];
  mediaTimes?: Record<string, number>;
  mediaAssetIds?: Record<string, string>;
  uploadedMediaUrls?: Record<string, string>;
}

/** 못 찾은 사진의 이유별 장수 — 사진 하나는 한 이유에만 센다(우선순위: remote > permissionLimited > fileMissing > noExif) */
export interface ReanalyzeReasons {
  remote: number;            // 로컬 원본 없는 서버(http) 사진 — 서버 사본에 날짜가 없거나(메타데이터 제거 업로드본) 받지 못함(네트워크)
  permissionLimited: number; // 사진 권한이 제한·거부돼 기기 사진첩 조회(assetId·사진첩 매칭)를 못 했거나 범위 밖이라 못 찾음(파일 EXIF도 실패)
  fileMissing: number;       // 파일을 읽지 못함(없음·경로 깨짐·디코드 실패)
  noExif: number;            // 파일은 읽었는데 날짜 정보가 없음
}

/** buildAlbumTimeline이 '날짜 미상'으로 보내는 기준과 같다(숫자이고 0보다 큼이 아니면 없음) */
const hasTime = (ts: unknown) => typeof ts === 'number' && ts > 0;

type Outcome = { ts: number; stage: string } | { reason: keyof ReanalyzeReasons; stage: string };

// 작은 동시성 풀 — 사진첩은 최대 100장, 사진첩 자산 크기 조회는 상한 1500장·조기 종료라 4개면 충분하다
async function pool<T>(items: T[], fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => { while (next < items.length) await fn(items[next++]); };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
}

// 가로·세로 — 후보 축소용(선택). HEIC(.jpg 이름) 등에서 실패하면 없음으로 두고 크기만으로 진행
const imageSize = (uri: string) =>
  new Promise<{ w?: number; h?: number }>((resolve) => {
    try {
      Image.getSize(uri, (w, h) => resolve({ w, h }), () => resolve({}));
    } catch { resolve({}); }
  });

// 사진첩 자산의 원본 파일 경로(없으면 undefined = 오프로드 등). copyTripOriginals가 복사한 원천과 같은 파일이어야 크기가 맞는다
async function assetFileUri(c: GalleryCandidate): Promise<string | undefined> {
  if (Platform.OS !== 'ios') {
    // 안드로이드 getAssetsAsync uri는 MediaStore DATA 경로의 file://(AssetUtils.kt) — getAssetInfoAsync의 localUri와 같은 값이라 조회 생략
    if (c.uri?.startsWith('file://')) return c.uri;
    const info = await MediaLibrary.getAssetInfoAsync(c.id, { shouldDownloadFromNetwork: false });
    return info?.localUri ?? undefined;
  }
  const Next = loadNextAsset();
  if (Next) {
    try {
      const u = await new Next(c.id).getUri();
      nextUriWorked = true;
      return u;
    } catch {
      if (nextUriWorked) return undefined; // next는 동작한다 — 이 자산은 오프로드(경로 없음)
    }
  }
  // 구 API 폴백 — next가 없거나 아직 한 번도 성공 못 함. 구 API는 되는데 next만 실패했다면 이후엔 구 API만 쓴다
  const info = await MediaLibrary.getAssetInfoAsync(c.id, { shouldDownloadFromNetwork: false });
  if (info?.localUri && Next) nextAssetCtor = null;
  return info?.localUri ?? undefined;
}

export async function findMissingPhotoTimes(
  record: ReanalyzeRecord,
): Promise<{ times: Record<string, number>; assetIds: Record<string, string>; tried: number; found: number; reasons: ReanalyzeReasons }> {
  const known = effectiveMediaTimes(record);
  const targets = [...new Set((record.medias ?? []).filter((u) => !hasTime(known?.[u])))];
  const times: Record<string, number> = {};
  // 사진첩 매칭으로 새로 안 assetId — 키는 앨범 사진의 로컬 경로(mediaAssetIds 키 체계). 이미 있는 키는 넣지 않는다
  const assetIds: Record<string, string> = {};
  const reasons: ReanalyzeReasons = { remote: 0, permissionLimited: 0, fileMissing: 0, noExif: 0 };
  if (targets.length === 0) return { times, assetIds, tried: 0, found: 0, reasons };

  const isRemote = (u: string) => /^https?:\/\//i.test(u);
  // 업로드 URL → 이 기기의 로컬 원본 경로. 로컬 키가 원격인 쌍(다른 기기 기록 재발행)은 쓰지 않는다
  const localOf = new Map<string, string>();
  for (const [lo, re] of Object.entries(record.uploadedMediaUrls ?? {})) if (re && !isRemote(lo)) localOf.set(re, lo);
  // 사진을 실제로 읽을 경로 — 로컬이면 그대로, 원격이면 역매핑한 로컬 원본, 없으면 undefined(remote)
  const sourceOf = (u: string) => (isRemote(u) ? localOf.get(u) : u);
  // 사진첩 조회 구간 — 기록 기간 ±1일. 없거나 못 읽으면 사진첩 매칭을 건너뛴다
  const window = albumDateWindow(record.startDate, record.endDate);
  let canQueryAssets = false;
  let limited = false;
  // 권한은 기기 사진첩을 볼 일이 있을 때만 묻는다 — 로컬 사진 중 assetId가 있거나, 기간이 있어 사진첩 매칭을 할 때
  if (targets.some((u) => { const src = sourceOf(u); return !!src && (!!window || !!record.mediaAssetIds?.[src]); })) {
    try {
      // false = 쓰기 권한 불필요(읽기만). iOS limited도 status는 granted로 오고 accessPrivileges로 구분된다.
      const perm = await MediaLibrary.requestPermissionsAsync(false);
      canQueryAssets = perm.status === 'granted';
      limited = perm.accessPrivileges === 'limited';
    } catch { /* 권한 조회 실패 — 파일 EXIF만 */ }
  }

  // 1단계 — assetId로 creationTime. blocked = 권한 탓에 못 봤을 수 있음(파일 EXIF까지 실패하면 permissionLimited로 센다)
  const fromAsset = async (uri: string): Promise<{ ts?: number; blocked: boolean }> => {
    const assetId = record.mediaAssetIds?.[uri];
    if (!assetId) return { blocked: false };
    if (!canQueryAssets) return { blocked: true };
    try {
      // 네트워크 다운로드 없이 — iCloud 오프로드 원본을 받으러 가지 않는다(creationTime은 DB 값이라 필요 없음)
      const info = await MediaLibrary.getAssetInfoAsync(assetId, { shouldDownloadFromNetwork: false });
      if (hasTime(info?.creationTime)) return { ts: info.creationTime, blocked: false };
      // iOS(expo-media-library 18)는 limited 범위 밖·지워진 자산이면 throw가 아니라 null로 resolve한다
      // (ios/MediaLibraryModule.swift getAssetInfoAsync의 resolve(nil)). limited면 범위 밖일 가능성으로 본다
    } catch {
      // reject로 오는 경우(Android 등, 미확인) — 같은 규칙. 어느 쪽이든 다음 단계로 간다
    }
    return { blocked: limited };
  };

  // 2·3단계 — EXIF 날짜. read는 로컬 파일(fileReader) 또는 원격 Range(remoteReader)
  const fromExif = async (read: ReadAt): Promise<Outcome> => {
    let head: Uint8Array | undefined;
    try {
      head = await read(0, HEAD_BYTES);
    } catch {
      return { reason: 'fileMissing', stage: 'read-head' };
    }
    if (!head) return { reason: 'fileMissing', stage: 'decode-head' };

    let headScanned = false;
    if (isHeif(head)) {
      // meta가 앞부분보다 길면 선언 크기만큼 다시 읽어야 iloc이 보인다
      let metaBytes = head;
      const metaEnd = heifMetaEnd(head);
      if (metaEnd && metaEnd > head.length && metaEnd <= META_MAX) {
        try {
          metaBytes = (await read(0, metaEnd)) ?? head;
        } catch { /* 다시 읽기 실패 — 앞부분으로 시도 후 폴백 */ }
      }
      const range = findHeifExifRange(metaBytes);
      if (range) {
        try {
          const p = await read(range.offset, Math.min(range.length || HEIF_EXIF_MAX, HEIF_EXIF_MAX));
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
        const big = await read(0, SCAN_BYTES);
        const ts = big && exifTakenAtFromBytes(big);
        if (ts) return { ts, stage: 'scan-256k' };
      } catch { /* 앞부분은 읽혔으니 날짜 없음으로 센다 */ }
    }
    return { reason: 'noExif', stage: isHeif(head) ? 'heif-no-exif' : 'no-exif' };
  };

  // 개발 빌드 진단 — 사진별 경로 접두·크기·ftyp·결과 단계 한 줄(원격은 HTTP 상태·받은 바이트). 운영 빌드엔 안 나간다
  const devLog = async (uri: string, o: Outcome, http?: { status?: number; bytes: number }) => {
    let size: number | string = '?';
    let brand: string | undefined;
    if (!http) {
      try {
        const info = await getInfoAsync(uri);
        size = info.exists ? (info.size ?? '?') : 'missing';
        if (info.exists) brand = ftypBrand((await fileReader(uri)(0, 16)) ?? new Uint8Array(0)) ?? 'not-ftyp';
      } catch { /* 진단 실패는 무시 */ }
    }
    const meta = http ? `http=${http.status ?? 'fail'} bytes=${http.bytes}` : `size=${size} ftyp=${brand ?? '-'}`;
    console.log(`[albumReanalyze] ${uri.slice(0, 48)}…${uri.slice(-24)} ${meta} ${'reason' in o ? o.reason : 'found'}@${o.stage}`);
  };

  // 사진마다 진행 상태 — src는 읽을 로컬 경로, pre는 사진첩 단계 결과(진단 stage 접두), blocked는 권한 탓 표시
  type Item = { uri: string; src?: string; blocked: boolean; pre?: string; outcome?: Outcome };
  const items: Item[] = targets.map((uri) => ({ uri, src: sourceOf(uri), blocked: false }));

  // ── 1단계: assetId ──
  await pool(items, async (it) => {
    // 원격이고 로컬 원본도 없음: assetId는 다른 기기 것일 수 있다 — 3단계(원격 Range)로만 본다
    if (!it.src) return;
    try {
      const a = await fromAsset(it.src);
      if (a.ts) it.outcome = { ts: a.ts, stage: 'asset' };
      else it.blocked = a.blocked;
    } catch { /* 예상 밖 — 다음 단계로 */ }
  });

  // ── 1.5단계: 사진첩 매칭(파일 크기. 가로·세로는 조회 순서에만) ──
  const pending = items.filter((it) => !it.outcome && it.src);
  if (!window) {
    for (const it of pending) it.pre = 'gallery-nodate';
  } else if (pending.length > 0) {
    try {
      // 앨범 사진 서명 — 같은 로컬 파일을 가리키는 사진이 둘이면 한 번만
      const sigs: AlbumPhotoSig[] = [];
      await pool([...new Set(pending.map((it) => it.src!))], async (src) => {
        try {
          const f = await getInfoAsync(src);
          if (!f.exists || !f.size) return; // 파일이 없으면 크기로 맞출 수 없다 — EXIF 단계가 fileMissing으로 센다
          sigs.push({ key: src, size: f.size, ...(await imageSize(src)) });
        } catch { /* 크기 못 읽음 — 이 사진은 매칭 대상 아님 */ }
      });
      const inSigs = new Set(sigs.map((s) => s.key));
      const participants = pending.filter((it) => inSigs.has(it.src!));
      if (sigs.length > 0 && !canQueryAssets) {
        // 권한 거부 — 사진첩을 못 봄. EXIF까지 실패하면 permissionLimited
        for (const it of participants) { it.pre = 'gallery-denied'; it.blocked = true; }
      } else if (sigs.length > 0) {
        // 기간 내 사진첩 자산 — 메타만(가로·세로·creationTime)이라 수천 장이어도 빠르다
        const cands: GalleryCandidate[] = [];
        let after: string | undefined;
        let hasNext = true;
        while (hasNext) {
          const page = await MediaLibrary.getAssetsAsync({
            first: GALLERY_PAGE,
            after,
            mediaType: 'photo',
            createdAfter: window.after,
            createdBefore: window.before,
          });
          // 스프레드 대신 루프 — 큰 페이지를 인자로 펼치면 Hermes 인자 한계에 걸린다(TravelImportScreen 참고)
          for (const a of page.assets) cands.push({ id: a.id, w: a.width, h: a.height, creationTime: a.creationTime, uri: a.uri });
          if (page.assets.length === 0) break;
          after = page.endCursor;
          hasNext = page.hasNextPage;
        }
        // 파일 크기 조회 — 순서·상한은 orderCandidates, 크기 일치 즉시 확정·전부 찾으면 조기 종료는 createSizeMatcher.
        // 오프로드(iCloud에만 원본)는 경로가 없어 건너뛴다 — 다운로드하지 않는다.
        const { list, truncated } = orderCandidates(sigs, cands, (window.after + window.before) / 2, MAX_PROBES);
        const matcher = createSizeMatcher(sigs);
        let probed = 0;
        let offloaded = 0;
        await pool(list, async (c) => {
          if (matcher.done) return; // 조기 종료 — 남은 후보는 보지 않는다
          probed++;
          try {
            const uri = await assetFileUri(c);
            if (!uri) { offloaded++; return; }
            const f = await getInfoAsync(uri);
            if (f.exists && f.size) matcher.offer({ id: c.id, size: f.size, creationTime: c.creationTime });
            else offloaded++;
          } catch { offloaded++; /* 이 자산은 크기 미상 */ }
        });
        const res = matcher.finish();
        if (__DEV__) {
          const n = Object.values(res).filter((r) => r.status === 'match').length;
          console.log(`[albumReanalyze] gallery ${new Date(window.after).toISOString()}~${new Date(window.before).toISOString()} photos=${sigs.length} dims=${sigs.filter((s) => s.w).length} assets=${cands.length} probed=${probed}/${list.length}${truncated ? '(capped)' : ''} offloaded=${offloaded} match=${n} limited=${limited} uriApi=${Platform.OS === 'ios' ? (loadNextAsset() ? 'next' : 'legacy') : 'asset.uri'}`);
        }
        for (const it of participants) {
          const r = res[it.src!];
          if (r?.status === 'match') {
            it.outcome = { ts: r.ts, stage: 'gallery-match' };
            if (!record.mediaAssetIds?.[it.src!]) assetIds[it.src!] = r.assetId;
          } else {
            it.pre = r?.status === 'ambiguous' ? 'gallery-ambiguous' : truncated ? 'gallery-capped' : 'gallery-nomatch';
            // limited면 범위 밖 원본은 목록에 없다 — 권한을 넓히면 찾을 수 있다. 단 오프로드로 건너뛴 후보가 있었거나
            // 상한에 잘렸으면 원인을 권한으로 단정할 수 없어 권한 탓으로 세지 않는다
            if (r?.status === 'nomatch' && limited && offloaded === 0 && !truncated) it.blocked = true;
          }
        }
      }
    } catch {
      // 사진첩 조회 실패 — 이 단계 없이 EXIF로
      for (const it of pending) if (!it.outcome && !it.pre) it.pre = 'gallery-error';
    }
  }

  // ── 2단계: 파일 EXIF / 3단계: 원격 Range EXIF ──
  await pool(items, async (it) => {
    let o: Outcome;
    let http: { status?: number; bytes: number } | undefined;
    if (it.outcome) {
      o = it.outcome;
    } else if (!it.src) {
      // 원격 사진 — 받았는데 날짜 없음(메타데이터 제거된 업로드본)·네트워크 실패 모두 remote 이유로 센다
      http = { bytes: 0 };
      try {
        const r = await fromExif(remoteReader(it.uri, http));
        o = 'reason' in r ? { reason: 'remote', stage: `remote-${r.stage}` } : { ts: r.ts, stage: r.stage === 'head-scan' ? 'remote-range' : `remote-${r.stage}` };
      } catch {
        o = { reason: 'remote', stage: 'remote-unexpected' };
      }
    } else {
      try {
        o = await fromExif(fileReader(it.src));
      } catch {
        o = { reason: 'fileMissing', stage: 'unexpected' };
      }
      // 기기 사진첩을 못 본 이유가 권한이면 그 이유로 센다(사용자가 행동할 수 있는 이유가 우선)
      if ('reason' in o && it.blocked) o = { reason: 'permissionLimited', stage: o.stage };
      if (it.pre) o = { ...o, stage: `${it.pre}>${o.stage}` };
    }
    if (it.src && it.src !== it.uri) o = { ...o, stage: `${o.stage}(via-local)` };
    if ('reason' in o) reasons[o.reason]++;
    else times[it.uri] = o.ts; // medias의 실제 uri(http일 수 있음) 키로
    if (__DEV__) await devLog(it.src ?? it.uri, o, http);
  });
  return { times, assetIds, tried: targets.length, found: Object.keys(times).length, reasons };
}
