// 기록 사진 영속화.
// ImagePicker / ImageManipulator / 카메라가 만든 URI는 iOS의 Caches·tmp(비영속) 영역을 가리켜,
// OS가 캐시를 정리하면 파일이 사라진다(기록 메타데이터는 남고 사진만 깨짐). 저장 시점에
// documentDirectory(영속)로 복사하고 그 경로로 교체해, 캐시 정리 후에도 사진이 유지되게 한다.
// (가져오기 사진을 이미 영속화하는 importPhotoStore.ts와 동일한 방식)
//
// - http/data/ph:// 등 비-로컬 URI는 건드리지 않는다.
// - documentDirectory 안의 URI(trip-originals, record-media, 모먼트 등)는 이미 영속이므로
//   건드리지 않는다 — record-media만 스킵하던 시절엔 사진첩 편집 한 번에 앨범 전체(최대 100장)가
//   record-media로 재복사돼 저장 공간이 2배가 되고 URI 키 맵이 전부 끊겼다.
// - 같은 URI는 한 번만 복사(맵 캐시)해 representativePhoto===medias[0] 같은 공유 참조도 같은 파일을 가리킨다.
// - 복사 실패한 장은 원본 URI를 유지(최소 기존 동작 보존).
// - 실제로 한 장이라도 복사됐을 때만 변경 필드를 돌려준다(불필요한 갱신 방지).
// - URI가 바뀌면 그 URI를 '키'로 쓰는 맵(mediaTimes·mediaAssetIds·uploadedMediaUrls)의 키도
//   함께 재작성한다 — 안 하면 '일자별로 다시 구성'·중복 추가 방지·업로드 캐시가 전부 무력화된다.
import type { TravelRecord } from '../store/recordStore';
import type { BlogBlock } from '../types/blogBlocks';

const REC_MEDIA_DIR = 'record-media/';

function isLocalFileUri(uri?: string): uri is string {
  return !!uri && (uri.startsWith('file://') || uri.startsWith('/'));
}

export async function persistRecordPhotos(rec: TravelRecord): Promise<Partial<TravelRecord>> {

  const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
  const base = FileSystem.documentDirectory;
  if (!base) return {};
  const dir = `${base}${REC_MEDIA_DIR}`;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // 이미 존재하면 무시
  }

  const copied = new Map<string, string>(); // 원본 URI → 영속 URI (중복 복사 방지)
  let seq = 0;

  const persist = async (uri?: string): Promise<string | undefined> => {
    if (!uri) return uri;
    if (uri.startsWith(base)) return uri;        // 이미 영속 영역(documentDirectory) — 재복사 금지
    if (!isLocalFileUri(uri)) return uri;        // http/data/ph:// 등은 그대로
    const hit = copied.get(uri);
    if (hit) return hit;
    try {
      // 블로그 블록의 영상(mp4·mov)도 이 경로를 타므로 영상 확장자까지 보존한다
      const ext = (uri.split('?')[0].match(/\.(jpg|jpeg|png|webp|heic|gif|mp4|mov|m4v)$/i)?.[1] || 'jpg').toLowerCase();
      const to = `${dir}${rec.id}-${Date.now()}-${seq++}.${ext}`;
      await FileSystem.copyAsync({ from: uri, to });
      copied.set(uri, to);
      return to;
    } catch {
      return uri; // 복사 실패 → 원본 유지
    }
  };

  const persistArr = async (arr?: string[]): Promise<string[] | undefined> => {
    if (!arr) return arr;
    const out: string[] = [];
    for (const u of arr) out.push((await persist(u)) ?? u);
    return out;
  };

  const changes: Partial<TravelRecord> = {};

  changes.representativePhoto = await persist(rec.representativePhoto);
  changes.snapFrontUri = await persist(rec.snapFrontUri);
  changes.snapBackUri = await persist(rec.snapBackUri);
  changes.medias = await persistArr(rec.medias);

  if (rec.cutPhoto) {
    changes.cutPhoto = {
      ...rec.cutPhoto,
      previewUri: (await persist(rec.cutPhoto.previewUri)) ?? rec.cutPhoto.previewUri,
      photos: (await persistArr(rec.cutPhoto.photos)) ?? rec.cutPhoto.photos,
      frameImage: (await persist(rec.cutPhoto.frameImage)) ?? rec.cutPhoto.frameImage,
    };
  }

  if (rec.perCountryData) {
    const pcd: NonNullable<TravelRecord['perCountryData']> = {};
    for (const [name, d] of Object.entries(rec.perCountryData)) {
      pcd[name] = {
        ...d,
        medias: (await persistArr(d.medias)) ?? d.medias,
        representativePhoto: (await persist(d.representativePhoto)) ?? d.representativePhoto,
      };
    }
    changes.perCountryData = pcd;
  }

  // 블로그 블록(사진·사진묶음·영상+썸네일) — 캐시 URI로 남아 있으면 OS 캐시 정리 때
  // 블로그 본문 사진이 통째로 깨진다(2026-07-25 감사 H1). medias와 동일하게 영속화한다.
  if (rec.blogBlocks?.length) {
    const blocks: BlogBlock[] = [];
    for (const b of rec.blogBlocks) {
      if (b.type === 'image' && b.uri) {
        blocks.push({ ...b, uri: (await persist(b.uri)) ?? b.uri });
      } else if (b.type === 'images' && b.items?.length) {
        const items = [];
        for (const it of b.items) items.push({ ...it, uri: (await persist(it.uri)) ?? it.uri });
        blocks.push({ ...b, items });
      } else if (b.type === 'video' && b.uri) {
        blocks.push({
          ...b,
          uri: (await persist(b.uri)) ?? b.uri,
          thumbnail: b.thumbnail ? ((await persist(b.thumbnail)) ?? b.thumbnail) : b.thumbnail,
        });
      } else {
        blocks.push(b);
      }
    }
    changes.blogBlocks = blocks;
  }

  // URI를 키로 쓰는 부가 맵 — 위에서 바뀐 키를 새 URI로 옮긴다(값 보존)
  const remapKeys = <V,>(map?: Record<string, V>): Record<string, V> | undefined => {
    if (!map) return map;
    let changed = false;
    const out: Record<string, V> = {};
    for (const [k, v] of Object.entries(map)) {
      const nk = copied.get(k) ?? k;
      if (nk !== k) changed = true;
      out[nk] = v;
    }
    return changed ? out : map;
  };
  const assetIds = remapKeys(rec.mediaAssetIds);
  if (assetIds !== rec.mediaAssetIds) changes.mediaAssetIds = assetIds;
  const times = remapKeys(rec.mediaTimes);
  if (times !== rec.mediaTimes) changes.mediaTimes = times;
  const uploaded = remapKeys(rec.uploadedMediaUrls);
  if (uploaded !== rec.uploadedMediaUrls) changes.uploadedMediaUrls = uploaded;

  // 실제로 복사된 게 없으면 갱신 불필요
  return copied.size > 0 ? changes : {};
}
