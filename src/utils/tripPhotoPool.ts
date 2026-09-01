// 과거 여행 불러오기가 스캔으로 판정한 '그 여행의 사진 후보'를 여행 카드별로 보관한다.
//
// 왜 필요한가: 불러오기는 이제 사진첩을 만들지 않고 카드만 즉시 만든다(썸네일 1장만 복사).
// 그러면 스캔이 힘들여 알아낸 것 — 어떤 갤러리 사진이 어느 여행에 속하는가 — 가 화면을
// 떠나는 순간 사라진다. 나중에 그 카드에서 사진첩이나 다른 기록을 만들 때 다시 스캔하고
// 다시 GPS를 판정해야 한다. 그래서 결과만 남겨 둔다.
//
// 원본을 복사하지 않는다. 저장하는 건 갤러리 자산 참조(id·uri·촬영시각)뿐이라 여행당
// 수십 KB 수준이고, 실제 사진은 사용자가 실제로 담기로 할 때 복사된다.
//
// ⚠️ 이 모듈은 tripPhotoPool.verify.ts가 RN 없이 tsx로 돌린다. 그래서 순수 함수 구역에는
//    import이 없어야 하고, AsyncStorage는 영속화 함수 안에서 지연 require한다
//    (importPhotoStore.ts가 expo-file-system을 다루는 방식과 같다).

export interface PoolPhoto {
  id?: string;          // 갤러리 자산 id — 앱 재시작 후에도 유효한 유일한 키
  uri: string;          // 표시용. iOS ph://는 세션이 지나면 못 쓸 수 있어 id가 1순위다
  creationTime?: number;
}

export interface TripPhotoPool {
  tripGroupId: string;  // 이 사진들이 속한 여행 카드
  recordId: string;     // 카드가 품고 있는 기록(썸네일 1장짜리)
  country: string;      // "🇯🇵 일본"
  countryName: string;  // 한글 원본 — 지구본·통계 비교 키라 번역하지 않는다
  countryFlag: string;
  title: string;
  startDate: string;    // 'YYYY.MM.DD'
  endDate: string;
  photos: PoolPhoto[];  // 후보 목록 — 상한(MAX_POOL_PHOTOS)까지 균등 간격으로 솎은 것
  /**
   * 이 여행에서 분석된 **모든** 사진의 갤러리 자산 id. 솎지 않는다.
   *
   * photos와 따로 두는 이유: photos는 '썸네일을 다시 뽑을 후보'라 몇백 장이면 충분하지만,
   * 재스캔 제외는 한 장이라도 빠지면 안 된다. 솎여 나간 사진은 제외 목록에 없어서
   * 다음 스캔에 다시 잡히고, 그 수가 10장을 넘으면 이미 가져온 여행이 결과 목록에
   * 통째로 다시 올라온다. id만 담으면 장당 40바이트 남짓이라 전량 보관해도 부담이 없다.
   */
  assetIds: string[];
  totalCount: number;   // 분석된 실제 장수(솎기 전) — 안내 문구는 이 값을 쓴다
  savedAt: number;
}

export type TripPhotoPoolMap = Record<string, TripPhotoPool>;

// 여행 하나당 보관할 썸네일 후보 수.
// 재스캔 제외는 assetIds가 전량 담당하므로 이 목록은 '다시 뽑기'에 쓸 만큼만 있으면 된다.
// 400 → 200으로 줄였다: 항목당 uri까지 들어 150바이트쯤이라, assetIds가 늘어난 만큼을
// 여기서 상쇄해야 AsyncStorage 한 키가 지나치게 커지지 않는다(안드로이드 기본 DB 6MB).
export const MAX_POOL_PHOTOS = 200;
// 보관할 여행 수 상한(최근 저장 순). 넘치면 오래된 것부터 버린다.
export const MAX_POOLS = 30;

export const TRIP_PHOTO_POOL_KEY = 'eorth-trip-photo-pool';

// ─────────────────────────────────────────────
// 순수 로직 (verify 대상)
// ─────────────────────────────────────────────

/**
 * 목록을 max개로 균등 간격 솎기. 앞에서 자르면 여행 첫날 사진만 남아 카드가 편중되므로,
 * 처음과 끝을 반드시 포함하면서 전 구간을 고르게 뽑는다.
 */
export function samplePoolPhotos<T>(photos: T[], max: number): T[] {
  if (max <= 0) return [];
  if (photos.length <= max) return [...photos];
  if (max === 1) return [photos[0]];
  const out: T[] = [];
  // photos.length > max 이므로 step > 1 — 반올림해도 인덱스가 겹치지 않는다
  const step = (photos.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(photos[Math.round(i * step)]);
  return out;
}

/**
 * 썸네일 후보를 중복 없이 count개 무작위로 뽑는다(첫 번째가 실제 썸네일).
 *
 * 왜 1장이 아니라 여러 장인가: 뽑힌 사진이 iCloud 오프로드 등으로 복사에 실패할 수 있다.
 * 그때 다음 후보로 넘어가지 못하면 카드가 썸네일 없이 만들어진다.
 * 이어지는 후보도 무작위여야 한다 — 옆 인덱스를 쓰면 실패한 사진과 거의 같은 장면이 나온다.
 */
export function pickCoverCandidates<T>(
  photos: T[],
  count: number,
  rand: () => number = Math.random,
): T[] {
  const n = photos.length;
  if (n === 0 || count <= 0) return [];
  const k = Math.min(count, n);
  // 부분 Fisher-Yates — 앞 k개만 섞으면 되므로 전체를 섞지 않는다
  const idx = photos.map((_, i) => i);
  for (let i = 0; i < k; i++) {
    const r = Math.floor(rand() * (n - i));
    // rand()가 1을 돌려주는 구현(또는 부동소수 오차)에 대비한 클램프
    const j = i + Math.max(0, Math.min(n - i - 1, r));
    const tmp = idx[i];
    idx[i] = idx[j];
    idx[j] = tmp;
  }
  return idx.slice(0, k).map((i) => photos[i]);
}

/** 살아 있는 여행 카드의 것만 남긴다 — 카드를 지우면 그 여행의 보관 사진도 의미가 없다. */
export function prunePools(pools: TripPhotoPoolMap, aliveTripGroupIds: string[]): TripPhotoPoolMap {
  const alive = new Set(aliveTripGroupIds);
  const out: TripPhotoPoolMap = {};
  for (const [id, pool] of Object.entries(pools)) {
    if (alive.has(id)) out[id] = pool;
  }
  return out;
}

/** 최근 저장 순으로 max개만 남긴다. */
export function capPools(pools: TripPhotoPoolMap, max: number): TripPhotoPoolMap {
  const entries = Object.entries(pools);
  if (entries.length <= max) return { ...pools };
  entries.sort((a, b) => (b[1].savedAt ?? 0) - (a[1].savedAt ?? 0));
  const out: TripPhotoPoolMap = {};
  for (const [id, pool] of entries.slice(0, max)) out[id] = pool;
  return out;
}

/** 사진 목록에서 자산 id만 중복 없이 뽑는다(순서 유지). id 없는 사진은 버린다. */
export function collectAssetIds(photos: PoolPhoto[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of photos) {
    if (p.id && !seen.has(p.id)) { seen.add(p.id); out.push(p.id); }
  }
  return out;
}

/**
 * 보관 중인 모든 사진의 갤러리 자산 id 집합.
 * 재스캔에서 "이미 가져온 사진"으로 함께 제외하는 데 쓴다 — 썸네일 1장만 복사하는 지금은
 * 기록의 mediaAssetIds만으로는 여행당 1장밖에 못 걸러 같은 여행이 매번 다시 뜬다.
 *
 * assetIds(전량)를 쓴다. photos(솎인 후보)도 함께 훑는 건 assetIds가 없던 시절에 저장된
 * 항목 때문이다 — 그 경우에도 최소한 후보만큼은 제외된다.
 */
export function poolAssetIds(pools: TripPhotoPoolMap): Set<string> {
  const out = new Set<string>();
  for (const pool of Object.values(pools)) {
    for (const id of pool.assetIds ?? []) out.add(id);
    for (const p of pool.photos) {
      if (p.id) out.add(p.id);
    }
  }
  return out;
}

/**
 * 같은 카드에 두 번째 여행이 들어올 때 기존 보관분과 합친다.
 *
 * 왜 필요한가: 진행 중인 장기체류 카드는 여러 여행을 흡수한다(absorbIntoStay). 그때
 * tripGroupId가 같아 덮어쓰기를 하면 먼저 들어온 여행의 사진이 통째로 사라진다.
 * 카드 하나를 같은 국가로 두 번 불러오는 경우도 마찬가지다.
 *
 * 기간은 합집합으로 넓히고('YYYY.MM.DD'는 사전순 비교가 곧 날짜순), 사진은
 * 자산 id(없으면 uri) 기준으로 중복을 없앤 뒤 촬영순으로 정렬한다.
 */
export function mergePool(prev: TripPhotoPool | undefined, next: TripPhotoPool): TripPhotoPool {
  if (!prev) return next;
  const seen = new Set<string>();
  const photos: PoolPhoto[] = [];
  for (const p of [...prev.photos, ...next.photos]) {
    const key = p.id || p.uri;
    if (seen.has(key)) continue;
    seen.add(key);
    photos.push(p);
  }
  photos.sort((a, b) => (a.creationTime ?? 0) - (b.creationTime ?? 0));
  const minDate = (a: string, b: string) => (!a ? b : !b ? a : a < b ? a : b);
  const maxDate = (a: string, b: string) => (!a ? b : !b ? a : a > b ? a : b);
  // 자산 id는 솎지 않으므로 합집합이 곧 '이 카드에 속한 전체 사진'이다
  const assetIds = Array.from(new Set([...(prev.assetIds ?? []), ...(next.assetIds ?? [])]));
  return {
    ...next,
    startDate: minDate(prev.startDate, next.startDate),
    endDate: maxDate(prev.endDate, next.endDate),
    photos,
    assetIds,
    // 단순 합이 아니라 '합친 뒤 서로 다른 장수'다 — 두 여행이 겹치는 사진을 갖고 있으면
    // 합계는 실제보다 부풀려진다. photos는 솎인 목록이라 assetIds가 있으면 그쪽이 정확하다.
    totalCount: assetIds.length || photos.length,
  };
}

/**
 * 저장된 JSON을 검증하며 읽는다. 형태가 어긋난 항목은 통째로 버린다 —
 * 부가 기능이라 되살리려 애쓰기보다 없는 셈 치는 편이 안전하다.
 */
export function parsePools(raw: string | null): TripPhotoPoolMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: TripPhotoPoolMap = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const v = value as Partial<TripPhotoPool> | null;
      if (!v || typeof v !== 'object') continue;
      if (typeof v.tripGroupId !== 'string' || !v.tripGroupId) continue;
      if (!Array.isArray(v.photos)) continue;
      const photos = v.photos.filter(
        (p): p is PoolPhoto => !!p && typeof p === 'object' && typeof (p as PoolPhoto).uri === 'string'
      );
      out[id] = {
        tripGroupId: v.tripGroupId,
        recordId: typeof v.recordId === 'string' ? v.recordId : '',
        country: typeof v.country === 'string' ? v.country : '',
        countryName: typeof v.countryName === 'string' ? v.countryName : '',
        countryFlag: typeof v.countryFlag === 'string' ? v.countryFlag : '',
        title: typeof v.title === 'string' ? v.title : '',
        startDate: typeof v.startDate === 'string' ? v.startDate : '',
        endDate: typeof v.endDate === 'string' ? v.endDate : '',
        photos,
        // assetIds가 없는 옛 항목은 후보의 id로 채워 둔다(그만큼이라도 제외되게)
        assetIds: Array.isArray(v.assetIds)
          ? v.assetIds.filter((a): a is string => typeof a === 'string' && !!a)
          : collectAssetIds(photos),
        totalCount: typeof v.totalCount === 'number' ? v.totalCount : photos.length,
        savedAt: typeof v.savedAt === 'number' ? v.savedAt : 0,
      };
    }
    return out;
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────
// 영속화 (AsyncStorage 지연 require — verify는 여기까지 오지 않는다)
// ─────────────────────────────────────────────

function storage() {

  return (require('@react-native-async-storage/async-storage') as {
    default: typeof import('@react-native-async-storage/async-storage').default;
  }).default;
}

export async function loadTripPools(): Promise<TripPhotoPoolMap> {
  try {
    return parsePools(await storage().getItem(TRIP_PHOTO_POOL_KEY));
  } catch {
    return {};
  }
}

async function writeTripPools(pools: TripPhotoPoolMap): Promise<void> {
  try {
    await storage().setItem(TRIP_PHOTO_POOL_KEY, JSON.stringify(pools));
  } catch {
    // 보관 실패는 조용히 무시 — 카드 생성 자체를 막을 이유가 없다
  }
}

/**
 * 여행 하나의 보관 목록을 저장한다. 같은 카드에 이미 보관분이 있으면 합친다(mergePool).
 *
 * 솎기는 반드시 합친 뒤에 한다 — 먼저 솎으면 합집합이 상한을 넘어 버린다.
 */
export async function saveTripPool(
  pool: Omit<TripPhotoPool, 'savedAt' | 'totalCount' | 'assetIds'> & { totalCount?: number },
  now: number = Date.now(),
): Promise<void> {
  const current = await loadTripPools();
  // 자산 id는 넘겨받은 '전체' 목록에서 뽑는다 — 아래 솎기보다 반드시 먼저다.
  // 솎인 뒤에 뽑으면 빠진 사진이 재스캔 제외에서 새어 나가 같은 여행이 다시 뜬다.
  const assetIds = collectAssetIds(pool.photos);
  const merged = mergePool(current[pool.tripGroupId], {
    ...pool,
    assetIds,
    // id가 하나도 없는(자산 id를 못 얻은) 여행이면 장수라도 남긴다 — 0으로 떨어지지 않게
    totalCount: pool.totalCount ?? (assetIds.length || pool.photos.length),
    savedAt: now,
  });
  const entry: TripPhotoPool = {
    ...merged,
    photos: samplePoolPhotos(merged.photos, MAX_POOL_PHOTOS),
    savedAt: now,
  };
  await writeTripPools(capPools({ ...current, [entry.tripGroupId]: entry }, MAX_POOLS));
}

/** 여행 카드 하나의 보관 목록. 없으면 null. */
export async function getTripPool(tripGroupId: string): Promise<TripPhotoPool | null> {
  if (!tripGroupId) return null;
  const pools = await loadTripPools();
  return pools[tripGroupId] ?? null;
}

/**
 * 살아 있는 카드 것만 남기고 저장까지 한 뒤, 정리된 목록을 돌려준다.
 * 삭제된 카드의 사진이 재스캔에서 영영 제외되는 것을 막는 청소 지점이다.
 */
export async function syncTripPools(aliveTripGroupIds: string[]): Promise<TripPhotoPoolMap> {
  const current = await loadTripPools();
  const pruned = prunePools(current, aliveTripGroupIds);
  if (Object.keys(pruned).length !== Object.keys(current).length) await writeTripPools(pruned);
  return pruned;
}
