/**
 * 짧은 날짜 창의 사진에 국가 코드를 붙인다 — 체류 중 주변국 여행 제안용 (설계 §2)
 *
 * TravelImportScreen.startScan(380줄, 8/27 실기기 검증 완료)을 건드리지 않고, 그 화면이
 * 쓰는 순수 유틸(scanSampling·countryLocate)을 같은 순서로 조립한 소형판이다.
 * 진행률·취소·발견 칩·프로파일러 같은 화면 관심사는 없다.
 *
 * 비용: 14일이면 12시간 버킷 최대 28개 → 좌표 조회 수십 회. 사진 장수와 무관하다.
 * 권한: 팝업을 띄우지 않는다. 사진 권한이 없거나 '선택한 사진만'이면 빈 배열.
 */
import { Platform, PermissionsAndroid } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as Location from 'expo-location';
import { locateCountry } from './countryLocate';
import { countryInfoFromCode, type ScannedPhoto } from './pastTripScan';
import { isPhotoLocationAvailable, getLocations } from '../../modules/photo-location';
import { normalizeLocations, type LatLon } from './photoLocationBatch';
import {
  bucketRanges, probeOrder, segmentsFromProbes, fillCountries, nextBoundaryProbe,
  geocodeWaitMs, MAX_BOUNDARY_STEPS, type ProbePoint,
} from './scanSampling';

const PAGE_SIZE = 500;
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/** 사진 권한이 '전체 허용'인가. 요청하지 않는다(5.1.1 방어) */
async function hasFullPhotoAccess(): Promise<boolean> {
  try {
    const perm = await MediaLibrary.getPermissionsAsync();
    if (!perm.granted) return false;
    // '선택한 사진만'은 status가 아니라 accessPrivileges로 온다(TravelImportScreen과 동일)
    if (perm.accessPrivileges === 'limited') return false;
  } catch {
    return false;
  }
  if (Platform.OS === 'android') {
    // API 29 미만엔 이 권한 자체가 없다. 있는데 미승인이면 좌표가 한 건도 안 나온다 — 헛스캔 방지
    if (typeof Platform.Version === 'number' && Platform.Version < 29) return true;
    try {
      return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_MEDIA_LOCATION);
    } catch {
      return false;
    }
  }
  return true;
}

export async function scanRecentPhotoCountries(opts: {
  createdAfter: number;
  createdBefore: number;
  excludeIds?: Set<string>;
}): Promise<ScannedPhoto[]> {
  if (!(await hasFullPhotoAccess())) return [];

  // ── 1) 날짜 창 페이지네이션 ──
  const assets: MediaLibrary.Asset[] = [];
  let after: string | undefined;
  let hasNext = true;
  while (hasNext) {
    const page = await MediaLibrary.getAssetsAsync({
      first: PAGE_SIZE, after, mediaType: 'photo', sortBy: 'creationTime',
      createdAfter: opts.createdAfter, createdBefore: opts.createdBefore,
    });
    if (page.assets.length === 0) break;
    // 스프레드 금지 — Hermes 인자 한계(TravelImportScreen과 같은 이유)
    for (const a of page.assets) {
      if (!a.creationTime) continue; // 시각 없는 사진은 기간에 놓을 수 없다
      if (opts.excludeIds?.has(a.id)) continue;
      assets.push(a);
    }
    after = page.endCursor;
    hasNext = page.hasNextPage;
  }
  if (assets.length === 0) return [];
  assets.sort((x, y) => (x.creationTime || 0) - (y.creationTime || 0));
  const total = assets.length;

  // ── 2) 좌표 → 국가 (오프라인 폴리곤 1순위, 실패분만 지오코딩, 0.5도 캐시) ──
  const geocodeCache: Record<string, { code: string; name: string } | null> = {};
  let lastGeocodeAt = 0;
  const reverseOnce = async (lat: number, lon: number) => {
    const res = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
    const addr = res && res[0];
    return addr?.isoCountryCode ? { code: addr.isoCountryCode, name: addr.country || addr.isoCountryCode } : null;
  };
  const countryAt = async (lat: number, lon: number) => {
    const key = `${Math.round(lat * 2) / 2}_${Math.round(lon * 2) / 2}`;
    let geo = geocodeCache[key];
    if (geo !== undefined) return geo;
    geo = locateCountry(lat, lon);
    if (!geo) {
      const wait = geocodeWaitMs(lastGeocodeAt, Date.now());
      if (wait > 0) await sleep(wait);
      lastGeocodeAt = Date.now();
      try {
        geo = await reverseOnce(lat, lon);
      } catch {
        // 실패한 결과도 아래에서 캐시에 박힌다 — 일시적 네트워크 실패 한 번이 그 0.5도
        // 구역 사진 전부를 미상으로 만들어 버린다. 화면(TravelImportScreen)과 같이 1회 재시도한다.
        // 14일 창은 표본이 적어 한 번의 실패가 차지하는 비중이 상대적으로 더 크다.
        await sleep(500);
        lastGeocodeAt = Date.now();
        try { geo = await reverseOnce(lat, lon); } catch { geo = null; }
      }
    }
    geocodeCache[key] = geo;
    return geo;
  };

  // ── 3) 버킷 샘플링 — 탐침 후보를 네이티브 배치로 먼저(있으면) ──
  const buckets = bucketRanges(assets);
  let prefetched: Map<string, LatLon> | null = null;
  // 배치에 넣은 id. 결과에 없으면 '좌표 없는 사진'이 확정이라 단건 재조회를 하지 않는다
  // (TravelImportScreen과 같은 판정 — 빠뜨리면 GPS 없는 사진마다 네이티브 왕복이 한 번씩 더 난다)
  const prefetchedIds = new Set<string>();
  if (isPhotoLocationAvailable) {
    for (const b of buckets) for (const idx of probeOrder(b.start, b.end)) prefetchedIds.add(assets[idx].id);
    const ids = [...prefetchedIds];
    try {
      prefetched = normalizeLocations(await getLocations(ids));
      // 후보가 있는데 좌표가 0건이면 네이티브가 제 역할을 못한 것 → getAssetInfoAsync로 폴백
      if (ids.length > 0 && prefetched.size === 0) {
        // 이 분기는 실기기에서만 도는데 로그가 없으면 진입 여부를 확인할 방법이 없다
        // (화면 코드도 같은 자리에 로그를 둔다)
        if (__DEV__) console.log('[recentScan] 네이티브 좌표 0건 → getAssetInfoAsync 폴백');
        prefetched = null;
        prefetchedIds.clear();
      }
    } catch {
      if (__DEV__) console.log('[recentScan] 네이티브 좌표 배치 실패 → getAssetInfoAsync 폴백');
      prefetched = null;
      prefetchedIds.clear();
    }
  }
  const localUriById = new Map<string, string>();
  const probeCountry = async (index: number): Promise<string | null> => {
    const asset = assets[index];
    try {
      let lat: number; let lon: number;
      const pre = prefetched?.get(asset.id);
      if (pre) {
        lat = pre.latitude; lon = pre.longitude;
      } else if (prefetched && prefetchedIds.has(asset.id)) {
        return null; // 배치에 넣었는데 결과에 없다 = GPS 없는 사진
      } else if (prefetched) {
        // 경계 이분탐색은 후보 밖 인덱스를 고르므로 배치에 없다. 그 몇 장만 따로 조회한다.
        const one = normalizeLocations(await getLocations([asset.id]));
        const loc = one.get(asset.id);
        if (!loc) return null;
        prefetched.set(asset.id, loc);
        lat = loc.latitude; lon = loc.longitude;
      } else {
        const info = await MediaLibrary.getAssetInfoAsync(asset.id, { shouldDownloadFromNetwork: false });
        if (info.localUri) localUriById.set(asset.id, info.localUri);
        lat = Number(info.location?.latitude);
        lon = Number(info.location?.longitude);
        if (!info.location || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      }
      const geo = await countryAt(lat, lon);
      return geo ? geo.code : null;
    } catch {
      return null;
    }
  };

  const probes: ProbePoint[] = [];
  for (const b of buckets) {
    for (const idx of probeOrder(b.start, b.end)) {
      const code = await probeCountry(idx);
      probes.push({ index: idx, code });
      if (code) break;
    }
  }
  // ── 4) 국가 전환 경계 이분 탐색 ──
  const known = probes.filter((p) => p.code != null).sort((a, b) => a.index - b.index);
  for (let k = 1; k < known.length; k++) {
    if (known[k].code === known[k - 1].code) continue;
    let lo = known[k - 1].index;
    let hi = known[k].index;
    for (let step = 0; step < MAX_BOUNDARY_STEPS; step++) {
      const mid = nextBoundaryProbe(lo, hi);
      if (mid == null) break;
      const code = await probeCountry(mid);
      probes.push({ index: mid, code });
      if (code == null) break;
      if (code === known[k - 1].code) lo = mid;
      else if (code === known[k].code) hi = mid;
      else break;
    }
  }

  // ── 5) 구간 확정 → 전체 사진에 국가 채우기 ──
  const codes = fillCountries(total, segmentsFromProbes(probes, total));
  const out: ScannedPhoto[] = [];
  for (let i = 0; i < total; i++) {
    const code = codes[i];
    if (!code) continue;
    const a = assets[i];
    const info = countryInfoFromCode(code);
    out.push({
      id: a.id,
      uri: localUriById.get(a.id) || a.uri,
      localUri: localUriById.get(a.id),
      creationTime: a.creationTime,
      countryCode: code,
      countryName: info.countryName,
      countryFlag: info.countryFlag,
    });
  }
  return out;
}
