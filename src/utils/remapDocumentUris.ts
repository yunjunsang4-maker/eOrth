// iOS는 앱을 재설치/업데이트(재빌드 포함)하면 앱 컨테이너 경로의 UUID가 바뀐다.
// documentDirectory에 복사해 둔 사진 파일 자체는 새 컨테이너의 Documents로 이관돼 살아있지만,
// 기록에 '절대경로'로 저장된 URI는 옛 컨테이너를 가리켜 전부 깨진다
// (기록·여행카드는 멀쩡한데 사진만 안 뜨는 증상 — 2026-07-24 iOS 재빌드 실사고).
// hydrate 시 '/Documents/' 이후의 상대 경로만 남기고 현재 documentDirectory로 재조립해 복구한다.
// Android는 경로가 고정(file:///data/user/0/<pkg>/files/)이라 사실상 no-op.
import type { TravelRecord } from '../store/recordStore';

const MARKER = '/Documents/';

// documentDirectory는 네이티브 모듈이라 모듈 로드 시점 접근을 피하고 1회 캐시한다
let cachedBase: string | null | undefined;
function docBase(): string | null {
  if (cachedBase !== undefined) return cachedBase;
  try {
    const FS = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    const b = FS.documentDirectory;
    cachedBase = b ? (b.endsWith('/') ? b : `${b}/`) : null;
  } catch {
    cachedBase = null;
  }
  return cachedBase;
}

/** 옛 컨테이너의 Documents 절대경로 URI를 현재 컨테이너 기준으로 재조립. 그 외 URI는 그대로. */
export function remapDocUri(uri: string): string;
export function remapDocUri(uri?: string): string | undefined;
export function remapDocUri(uri?: string): string | undefined {
  const base = docBase();
  if (!uri || !base) return uri;
  if (!uri.startsWith('file://')) return uri; // http/data/ph:// 등은 그대로
  if (uri.startsWith(base)) return uri; // 이미 현재 컨테이너
  const i = uri.indexOf(MARKER);
  if (i === -1) return uri; // Documents 밖(캐시·tmp)은 파일이 이미 없어 복구 불가 — 그대로 둔다
  return base + uri.slice(i + MARKER.length);
}

function remapArr(arr?: string[]): string[] | undefined {
  if (!arr) return arr;
  let changed = false;
  const out = arr.map((u) => {
    const v = remapDocUri(u);
    if (v !== u) changed = true;
    return v;
  });
  return changed ? out : arr;
}

// 로컬 URI를 '키'로 쓰는 맵(업로드 캐시·촬영시각 등)도 키를 재조립해 대응이 끊기지 않게 한다
function remapKeys<V>(map?: Record<string, V>): Record<string, V> | undefined {
  if (!map) return map;
  let changed = false;
  const out: Record<string, V> = {};
  for (const [k, v] of Object.entries(map)) {
    const nk = remapDocUri(k);
    if (nk !== k) changed = true;
    out[nk] = v;
  }
  return changed ? out : map;
}

/** 기록의 모든 사진 URI 필드를 현재 컨테이너 기준으로 복구한 사본(변경 없으면 원본 그대로). */
export function remapRecordDocUris<T extends TravelRecord>(rec: T): T {
  const medias = remapArr(rec.medias);
  const representativePhoto = remapDocUri(rec.representativePhoto);
  const representativePhotoSource = remapDocUri(rec.representativePhotoSource);
  const snapFrontUri = remapDocUri(rec.snapFrontUri);
  const snapBackUri = remapDocUri(rec.snapBackUri);
  const uploadedMediaUrls = remapKeys(rec.uploadedMediaUrls);
  const mediaAssetIds = remapKeys(rec.mediaAssetIds);
  const mediaTimes = remapKeys(rec.mediaTimes);

  let cutPhoto = rec.cutPhoto;
  if (cutPhoto) {
    const previewUri = remapDocUri(cutPhoto.previewUri);
    const photos = remapArr(cutPhoto.photos);
    const frameImage = remapDocUri(cutPhoto.frameImage);
    if (previewUri !== cutPhoto.previewUri || photos !== cutPhoto.photos || frameImage !== cutPhoto.frameImage) {
      cutPhoto = { ...cutPhoto, previewUri, photos: photos ?? cutPhoto.photos, frameImage };
    }
  }

  let perCountryData = rec.perCountryData;
  if (perCountryData) {
    let pcdChanged = false;
    const next: NonNullable<TravelRecord['perCountryData']> = {};
    for (const [name, d] of Object.entries(perCountryData)) {
      const dm = remapArr(d.medias);
      const dr = remapDocUri(d.representativePhoto);
      if (dm !== d.medias || dr !== d.representativePhoto) {
        pcdChanged = true;
        next[name] = { ...d, medias: dm, representativePhoto: dr };
      } else {
        next[name] = d;
      }
    }
    if (pcdChanged) perCountryData = next;
  }

  const changed =
    medias !== rec.medias ||
    representativePhoto !== rec.representativePhoto ||
    representativePhotoSource !== rec.representativePhotoSource ||
    snapFrontUri !== rec.snapFrontUri ||
    snapBackUri !== rec.snapBackUri ||
    uploadedMediaUrls !== rec.uploadedMediaUrls ||
    mediaAssetIds !== rec.mediaAssetIds ||
    mediaTimes !== rec.mediaTimes ||
    cutPhoto !== rec.cutPhoto ||
    perCountryData !== rec.perCountryData;

  if (!changed) return rec;
  return {
    ...rec,
    medias,
    representativePhoto,
    representativePhotoSource,
    snapFrontUri,
    snapBackUri,
    uploadedMediaUrls,
    mediaAssetIds,
    mediaTimes,
    cutPhoto,
    perCountryData,
  };
}
