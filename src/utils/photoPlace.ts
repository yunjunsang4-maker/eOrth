/**
 * 사진첩 하루 보기(AlbumDayScreen)의 '장소' 순수 로직 — 기기 assetId 고르기와 주소 → 표시 이름.
 * 네이티브 호출(사진첩 좌표·역지오코딩)은 화면에 두고, 여기는 RN 의존 없이 photoPlace.verify.ts로 검증한다.
 *
 * 장소는 기록에 저장하지 않는다 — 사진별 좌표가 서버(공개될 수 있는 기록)로 올라가지 않게,
 * 작성 기기에서 화면을 열 때만 기기 사진첩 좌표로 계산해 보여 준다.
 */

const isRemote = (u: string) => /^https?:\/\//i.test(u);

/**
 * 앨범 사진의 '이 기기' 사진첩 assetId. 로컬 경로면 그 키로, 업로드 URL이면 업로드 캐시(로컬→URL)를
 * 거꾸로 따라 로컬 원본 키로 찾는다. 원격 키에 바로 붙은 assetId는 쓰지 않는다 — 안드로이드 assetId는
 * 기기마다 따로 매기는 일련번호라 다른 기기에서 엉뚱한 사진의 위치가 나온다(albumReanalyze와 같은 규칙).
 */
export function localAssetIdOf(
  rec: { mediaAssetIds?: Record<string, string>; uploadedMediaUrls?: Record<string, string> },
  uri: string,
): string | undefined {
  if (!uri) return undefined;
  if (!isRemote(uri)) return rec.mediaAssetIds?.[uri] || undefined;
  for (const [local, remote] of Object.entries(rec.uploadedMediaUrls ?? {})) {
    if (remote === uri && local && !isRemote(local)) {
      const id = rec.mediaAssetIds?.[local];
      if (id) return id;
    }
  }
  return undefined;
}

/** 역지오코딩 결과(expo-location LocationGeocodedAddress의 일부) */
export interface GeoParts {
  city?: string | null;
  district?: string | null;
  subregion?: string | null;
  region?: string | null;
  name?: string | null;
}

/**
 * 주소 → '도시 동네' 한 줄. 도시가 없으면 광역(region)으로, 동네가 없으면 subregion으로 채운다.
 * 같은 이름이 겹치면(도쿄 도쿄) 한 번만. 다 비면 null — 화면은 장소 줄을 그리지 않는다.
 */
export function formatPlace(geo: GeoParts | null | undefined): string | null {
  if (!geo) return null;
  const clean = (v?: string | null) => (typeof v === 'string' ? v.trim() : '') || null;
  const big = clean(geo.city) ?? clean(geo.region);
  const small = clean(geo.district) ?? clean(geo.subregion);
  const parts = [big, small].filter((p): p is string => !!p);
  const uniq = parts.filter((p, i) => parts.indexOf(p) === i);
  return uniq.length ? uniq.join(' ') : clean(geo.name);
}
