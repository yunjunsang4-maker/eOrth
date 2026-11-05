/**
 * 사진첩 사진의 '장소' 네이티브 조회 — 기기 사진첩 좌표 → 역지오코딩. AlbumDayScreen(순간별 장소)과
 * TripRecordScreen(날짜 줄의 그날 장소)이 같이 쓴다. 순수 판정(assetId 고르기·주소 → 이름)은 utils/photoPlace.
 *
 * 장소는 저장하지 않는다(utils/photoPlace 주석) — 사진별 좌표가 서버(공개될 수 있는 기록)로 올라가지 않게,
 * 화면을 열 때만 계산해 메모리(아래 캐시·화면 state)에만 둔다. 기록·스토어·서버에 쓰지 말 것.
 * 두 화면이 캐시를 나눠 쓰므로 사진첩 → 하루 보기로 들어가도 같은 사진의 역지오코딩을 다시 부르지 않는다.
 */
import * as MediaLibrary from 'expo-media-library';
import * as Location from 'expo-location';
import { localAssetIdOf, formatPlace, pickAssetByTime, TIME_TOL_MS } from './photoPlace';
import { isUsableLatLon } from './photoLocationBatch';

// 장소 이름 + 그곳 시간대(iOS만, 순간 시각을 현지 시간으로 — formatClock). 둘 다 없으면 null.
// lat/lon은 하루 보기 장소 줄 → 지도 시트용.
export type AssetPlace = { name: string | null; tz: string | null; lat: number; lon: number };

// assetId → 장소(없으면 null). 같은 사진을 다시 열 때 역지오코딩을 또 부르지 않게 앱 실행 동안만 기억한다.
// ponytail: 메모리 캐시만 — 앱을 다시 켜면 다시 찾는다. 느리다는 말이 나오면 AsyncStorage로.
const placeCache = new Map<string, Promise<AssetPlace | null>>();
export function placeOfAsset(assetId: string): Promise<AssetPlace | null> {
  let p = placeCache.get(assetId);
  if (!p) {
    p = (async () => {
      // 네트워크 다운로드 없이 — 좌표는 사진첩 DB 값이라 iCloud 원본을 받으러 갈 필요가 없다
      const info = await MediaLibrary.getAssetInfoAsync(assetId, { shouldDownloadFromNetwork: false });
      // iOS는 좌표를 문자열로 줄 때가 있다 — 숫자로 바꿔야 isUsableLatLon(typeof number)을 통과한다(TravelImportScreen과 같은 처리)
      const lat = Number(info?.location?.latitude), lon = Number(info?.location?.longitude);
      if (!info?.location || !isUsableLatLon(lat, lon)) return null;
      const [geo] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      const fp = formatPlace(geo);
      const tz = geo?.timezone ?? null; // 이름이 없어도 시간대는 살린다
      return fp || tz ? { name: fp, tz, lat, lon } : null;
    })().catch(() => null);
    placeCache.set(assetId, p);
  }
  return p;
}

// 촬영시각 → 기기 사진첩 assetId(없으면 null). placeCache와 같은 메모리 캐시 — 찾은 id는 기록에 쓰지 않는다.
// iOS 술어는 creationDate > / <(배타)라 경계는 빠지지만 허용오차 안쪽이라 상관없다.
const timeAssetCache = new Map<number, Promise<string | null>>();
export function assetIdAtTime(ts: number): Promise<string | null> {
  let p = timeAssetCache.get(ts);
  if (!p) {
    p = MediaLibrary.getAssetsAsync({
      mediaType: 'photo',
      createdAfter: ts - TIME_TOL_MS,
      createdBefore: ts + TIME_TOL_MS,
      first: 10,
    }).then((page) => pickAssetByTime(page.assets, ts, TIME_TOL_MS) ?? null).catch(() => null);
    timeAssetCache.set(ts, p);
  }
  return p;
}

const DAY_PLACE_TRIES = 3; // 날마다 좌표를 찾아볼 사진 수 상한 — 역지오코딩 호출 수를 묶는다(하루 보기 PLACE_TRIES와 같은 값)
type PlaceTry = { assetId: string } | { ts: number };

/**
 * 사진첩 날짜 줄의 '그날 장소'(TripRecordScreen → AlbumTimeline dayPlaces). 찾은 날마다 onPlace(키, 이름).
 * 규칙은 하루 보기(AlbumDayScreen)의 순간별 장소와 같다:
 *  - 그날 앞쪽 사진부터, 이 기기 assetId가 있는 사진 먼저(안정 정렬) 최대 DAY_PLACE_TRIES장. 없으면 촬영시각으로 기기 사진첩 매칭.
 *  - 권한: 하루 보기와 달리 항상 확인만(getPermissionsAsync) — 날짜 줄은 사진첩을 열기만 해도 도는 경로라 팝업을 띄우지 않는다.
 *    권한이 없으면 장소 줄 없이 끝난다. 날짜 사진 격자에서 허용된 뒤엔 호출부가 다시 부른다(TripRecordScreen effect 의존값).
 *  - 역지오코딩은 순차 — iOS는 연타하면 제한에 걸린다.
 * 이름 없이 시간대만 나온 사진은 건너뛰고 다음 후보로 이름을 찾는다(날짜 줄엔 이름만 쓴다).
 */
export async function lookupDayPlaces(
  days: { key: string; uris: string[] }[],
  rec: { mediaAssetIds?: Record<string, string>; uploadedMediaUrls?: Record<string, string> },
  mediaTimes: Record<string, number> | undefined,
  onPlace: (dayKey: string, name: string) => void,
  alive: () => boolean,
): Promise<void> {
  const tries = days.map((d) =>
    d.uris.map((uri): PlaceTry | null => {
      const assetId = localAssetIdOf(rec, uri);
      if (assetId) return { assetId };
      const ts = mediaTimes?.[uri];
      return ts ? { ts } : null;
    }).filter((c): c is PlaceTry => !!c)
      .sort((a, b) => Number('ts' in a) - Number('ts' in b))
      .slice(0, DAY_PLACE_TRIES));
  if (!tries.some((l) => l.length)) return;
  try {
    // 확인만, 요청하지 않는다 — 사진첩을 열기만 했는데 맥락 없이 팝업이 뜨면 안 되고, 안드로이드는 '거부' 뒤
    // effect가 돌 때마다 다시 묻게 된다. 권한 요청은 사용자가 직접 누른 곳(하루 보기·날짜 사진 격자)에서만.
    const perm = await MediaLibrary.getPermissionsAsync(false);
    if (perm.status !== 'granted') return;
  } catch { return; }
  for (let di = 0; di < tries.length && alive(); di++) {
    for (const c of tries[di]) {
      const id = 'assetId' in c ? c.assetId : await assetIdAtTime(c.ts);
      if (!alive()) return;
      const place = id ? await placeOfAsset(id) : null;
      if (!alive()) return;
      if (place?.name) { onPlace(days[di].key, place.name); break; }
    }
  }
}
