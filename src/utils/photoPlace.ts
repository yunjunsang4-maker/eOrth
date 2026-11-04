/**
 * 사진첩 하루 보기(AlbumDayScreen)의 '장소' 순수 로직 — 기기 assetId 고르기와 주소 → 표시 이름.
 * 네이티브 호출(사진첩 좌표·역지오코딩)은 화면에 두고, 여기는 RN 의존 없이 photoPlace.verify.ts로 검증한다.
 *
 * 장소는 기록에 저장하지 않는다 — 사진별 좌표가 서버(공개될 수 있는 기록)로 올라가지 않게,
 * 화면을 열 때만 기기 사진첩 좌표로 계산해 보여 준다. 이 기기 assetId가 없으면(iOS 원격 URL 사진)
 * 촬영시각으로 기기 사진첩을 찾아(pickAssetByTime) 그 자산의 좌표를 쓴다 — 찾은 assetId도 저장하지 않는다.
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

/** 촬영시각 ↔ 사진첩 creationTime 허용오차 — EXIF는 초 단위(초 아래 버림)라 최대 999ms 차이 + 여유 */
export const TIME_TOL_MS = 1500;

/**
 * 촬영시각 ts에 가장 가까운 creationTime의 자산 id. 허용오차(포함) 밖·creationTime이 0/NaN인 자산은 뺀다.
 * 동률이면 앞의 것. ts가 잘못된 값이면 undefined.
 * ponytail: 같은 초의 연사와 겹치면 가장 가까운 것을 쓴다 — 장소는 거의 같다.
 *   EXIF에 시간대 오프셋이 없어 시각이 몇 시간 어긋난 사진은 매칭되지 않아 장소가 없다.
 */
export function pickAssetByTime(
  assets: { id: string; creationTime: number }[],
  ts: number,
  tolMs: number,
): string | undefined {
  if (!Number.isFinite(ts) || ts <= 0) return undefined;
  let best: string | undefined;
  let bestD = Infinity;
  for (const a of assets) {
    if (!a?.id || !Number.isFinite(a.creationTime) || a.creationTime <= 0) continue;
    const d = Math.abs(a.creationTime - ts);
    if (d <= tolMs && d < bestD) { best = a.id; bestD = d; }
  }
  return best;
}

/** 역지오코딩 결과(expo-location LocationGeocodedAddress의 일부) */
export interface GeoParts {
  city?: string | null;
  district?: string | null;
  subregion?: string | null;
  region?: string | null;
  /** 도로명(iOS thoroughfare) */
  street?: string | null;
  /** 번지(iOS subThoroughfare) — 명소 판정에만 쓰고 화면에는 내지 않는다 */
  streetNumber?: string | null;
  /** iOS: 명소면 'Apple Park'·'서울숲', 주소면 '1 Infinite Loop'. 안드로이드는 대체로 주소 한 줄 */
  name?: string | null;
  /** IANA 시간대 id(예 'America/New_York'). expo-location은 iOS에서만 채운다 — 안드로이드는 null */
  timezone?: string | null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * 절대시각(ms) → 'HH:MM'. timeZone이 있으면 그 시간대(사진 찍은 곳)의 현지 시각, 없거나 Intl이 못 다루면
 * (잘못된 id·Hermes 미지원) 기기 시간대로 폴백한다. 일부 엔진은 h23에서도 자정을 '24:05'로 내서 '00'으로 고친다.
 * ponytail: 안드로이드는 역지오코딩에 timezone이 없어 기기 시간대로 나온다 —
 *   필요하면 EXIF OffsetTimeOriginal이나 좌표→시간대 표로 확장.
 */
export function formatClock(ms: number, timeZone?: string | null): string {
  if (timeZone) {
    try {
      const s = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .format(ms).replace(/^24:/, '00:');
      if (/^\d{2}:\d{2}$/.test(s)) return s; // 엔진이 다른 모양을 내면 폴백
    } catch { /* 폴백 */ }
  }
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * 주소 → '도시 동네 · 명소/도로' 한 줄. 도시가 없으면 광역(region).
 * 동네가 없을 때 subregion은 도시도 없을 때만 — 미국 subregion은 county(시보다 넓음)라 'Morristown Morris County'처럼 거꾸로 된다.
 * 뒤 조각은 name이 명소(번지·도로명·행정명과 무관)면 name, 아니면 도로명. 번지는 집 앞까지 짚는 너무 정확한 위치라 뺀다.
 * 같은 이름이 겹치면(도쿄 도쿄) 한 번만. 다 비면 name, 그것도 없으면 null — 화면은 장소 줄을 그리지 않는다.
 */
export function formatPlace(geo: GeoParts | null | undefined): string | null {
  if (!geo) return null;
  const clean = (v?: string | null) => (typeof v === 'string' ? v.trim() : '') || null;
  const city = clean(geo.city), district = clean(geo.district), region = clean(geo.region), subregion = clean(geo.subregion);
  const name = clean(geo.name), street = clean(geo.street), streetNumber = clean(geo.streetNumber);
  const big = city ?? region;
  const small = district ?? (city ? null : subregion);
  const parts = [big, small].filter((p): p is string => !!p);
  const base = parts.filter((p, i) => parts.indexOf(p) === i).join(' ');
  const landmark = !!name
    && !(streetNumber && name.includes(streetNumber))
    && !(street && name.includes(street))
    && ![city, district, region, subregion].includes(name);
  let detail = landmark ? name : street;
  if (detail && (detail === big || detail === small)) detail = null;
  if (detail) return base ? `${base} · ${detail}` : detail;
  return base || name;
}
