/**
 * 네이티브 좌표 배치 조회의 순수 로직 — 쪼개기와 응답 정규화.
 *
 * 네이티브 호출 자체는 modules/photo-location에 있고, 여기에는 RN 의존이 없는 부분만 둔다
 * (photoLocationBatch.verify.ts가 node로 검증한다).
 *
 * 정규화가 필요한 이유: 네이티브 경계를 넘어온 값은 형태를 신뢰할 수 없다. 좌표가
 * (0,0)으로 박힌 사진, EXIF가 깨진 사진, 배열 길이가 다른 응답이 실제로 들어온다.
 * 걸러내지 않으면 (0,0)이 기니 만 앞바다로 판정되어 "가나 여행"이 만들어진다.
 */

export interface LatLon {
  latitude: number;
  longitude: number;
}

/**
 * 한 번의 네이티브 호출에 넘길 자산 수. 20만 장이면 100회로 쪼개진다.
 * 너무 크면 응답 직렬화가 한 번에 몰리고, 너무 작으면 왕복 횟수가 늘어난다.
 */
export const LOCATION_BATCH_SIZE = 2000;

/** 배열을 size 단위로 쪼갠다. size가 0 이하면 통째로 한 덩이. */
export function chunkIds(ids: string[], size: number = LOCATION_BATCH_SIZE): string[][] {
  if (ids.length === 0) return [];
  if (size <= 0) return [ids.slice()];
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** 위도·경도가 실제 좌표로 쓸 수 있는 값인지. (0,0)은 GPS 태그 빈 값으로 보고 버린다. */
export function isUsableLatLon(lat: unknown, lon: unknown): boolean {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  if (lat === 0 && lon === 0) return false;
  return true;
}

/**
 * 네이티브 응답({ id: [위도, 경도] })을 Map으로 바꾸며 쓸 수 없는 값은 버린다.
 * 응답이 아예 객체가 아니어도 빈 Map을 돌려준다(스캔이 죽지 않게).
 */
export function normalizeLocations(raw: unknown): Map<string, LatLon> {
  const out = new Map<string, LatLon>();
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value) || value.length < 2) continue;
    const [lat, lon] = value;
    if (!isUsableLatLon(lat, lon)) continue;
    out.set(id, { latitude: lat as number, longitude: lon as number });
  }
  return out;
}

/**
 * 자산 id를 배치로 쪼개 좌표를 모은다. fetcher를 주입받아 네이티브 없이도 검증 가능하다.
 * 배치 하나가 실패해도 나머지는 계속한다 — 한 덩이의 예외로 스캔 전체를 버릴 이유가 없다.
 *
 * shouldCancel: 매 배치 전후로 물어 true면 즉시 멈춘다(그때까지 모은 좌표는 반환).
 * 없으면 취소해도 네이티브 배치가 끝까지 돌면서 onBatch로 '이전 스캔의 진행률'을
 * 계속 흘려보내, 사용자가 다시 시작한 새 스캔의 진행바를 오염시켰다.
 * 취소 이후에는 onBatch도 부르지 않는다(진행률 역주행 방지).
 */
export async function fetchLocationsInBatches(
  ids: string[],
  fetcher: (batch: string[]) => Promise<unknown>,
  options: {
    size?: number;
    onBatch?: (done: number, total: number) => void;
    shouldCancel?: () => boolean;
  } = {}
): Promise<Map<string, LatLon>> {
  const size = options.size ?? LOCATION_BATCH_SIZE;
  const batches = chunkIds(ids, size);
  const out = new Map<string, LatLon>();
  for (let i = 0; i < batches.length; i++) {
    if (options.shouldCancel?.()) break;
    try {
      const raw = await fetcher(batches[i]);
      for (const [id, loc] of normalizeLocations(raw)) out.set(id, loc);
    } catch {
      // 이 배치만 좌표 없음으로 둔다(해당 사진들은 미상 처리되고 스캔은 계속된다)
    }
    // 배치를 기다리는 동안 취소됐을 수 있다 — 그 경우 진행 콜백도 건너뛴다
    if (options.shouldCancel?.()) break;
    options.onBatch?.(i + 1, batches.length);
  }
  return out;
}
