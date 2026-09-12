// 소셜 탭 스냅 링 줄 정렬 — '내 스냅 +' 입구(2026-09-07)를 위해 내 대표 항목을 맨 앞에 둔다.
// 내 항목이 여러 개(나라별 대표)여도 하나만 옮긴다 — 배지는 맨 앞 하나에만 붙는다.
// 어느 하나인가: rank가 있으면 rank 최대(=가장 최신 timestamp), 없으면 배열 순서상 첫 번째.
// rank가 필요한 이유(QA F-1): snapItems는 모두 열람 상태면 오래된 순으로 재정렬되므로
// 배열 첫 번째를 집으면 방금 찍은 스냅이 아니라 가장 오래된 나라의 스냅이 앞에 온다.

/** 내 대표 항목 하나를 맨 앞으로(나머지 순서 유지). 없으면 같은 순서의 새 배열. 입력은 mutate하지 않는다. */
export function putMineFirst<T>(items: T[], isMine: (item: T) => boolean, rank?: (item: T) => number): T[] {
  let idx = -1;
  let best = -Infinity;
  items.forEach((it, i) => {
    if (!isMine(it)) return;
    const r = rank ? rank(it) : 0;
    // 동점이면 먼저 나온 것 유지(> 비교)
    if (idx < 0 || r > best) { idx = i; best = r; }
  });
  if (idx <= 0) return items.slice();
  return [items[idx], ...items.slice(0, idx), ...items.slice(idx + 1)];
}

// ─────────────────────────────────────────────────────────────
// 스냅 링 묶음 — 여행 단위(2026-09-12)
// ─────────────────────────────────────────────────────────────
// 예전 규칙은 `작성자+나라` 하나였다. 같은 나라를 두 번 다녀오면 한 원에 합쳐지고,
// 국내 스냅은 지역 구분이 없어 서울 출근길과 제주 여행이 같은 링이 됐다.
// 이제 링 = 여행 카드 1장(`tripGroupId`)이고, 거주지에서 찍은 스냅은 여행이 아니라
// 고정 '일상' 링 하나로 모아 여행 링들 **뒤**에 둔다.
//
// tripGroupId가 없는 스냅(예: 이 기능 이전에 발행된 남의 스냅, 카드 편입 실패)은
// 버리지 않고 옛 규칙(작성자+나라+지역)으로 묶되, 그 안에서 7일 초과 간격마다 쪼갠다 —
// 재방문이 한 원에 합쳐지던 원래 증상만이라도 폴백에서 막는다.

/** 폴백 묶음의 분리 간격 — recordStore.GROUP_GAP_MS(국내 카드 7일 규칙)와 같은 값 */
const RING_GAP_MS = 7 * 24 * 60 * 60 * 1000;

/** groupSnapRings가 읽는 필드만 추린 스냅 모양 (화면의 TravelRecord가 그대로 들어온다) */
export interface SnapRingItem {
  id: string;
  user?: { handle?: string } | null;
  timestamp?: number;
  countryName?: string;
  snapDetectedCountry?: string;
  regionName?: string;
  tripGroupId?: string | null;
  snapDaily?: boolean;
}

/** 링 1개 = 대표 스냅 + 묶음 집계 두 개 */
export type SnapRing<T> = T & { _hasUnviewed: boolean; _isDaily: boolean };

/**
 * 스냅 배열을 링(여행 단위 + 일상) 목록으로 묶는다.
 *
 * 키: `snapDaily` → `handle::daily` / `tripGroupId` → `handle::trip:{id}` /
 *     둘 다 없으면 `handle::country::region` 안에서 7일 초과 간격마다 `::b{n}`.
 * 대표는 묶음 안 **최신** 스냅, `_hasUnviewed`는 묶음 안 어느 하나라도 안 봤으면 true.
 * 순서는 여행 링(기존 규칙: 첫 등장 순, 전부 봤으면 오래된 순) → 일상 링(안 본 것 먼저,
 * 그 다음 오래된 순). 입력은 mutate하지 않는다.
 */
export function groupSnapRings<T extends SnapRingItem>(
  snaps: T[],
  isUnviewed: (s: T) => boolean,
): SnapRing<T>[] {
  const handleOf = (s: T) => s.user?.handle ?? '';
  const timeOf = (s: T) => s.timestamp ?? 0;

  // 1) 키 배정. 폴백(일상도 여행 카드도 아닌)만 7일 버킷 계산을 위해 뒤로 미룬다.
  const keys: string[] = new Array(snaps.length);
  const byBase = new Map<string, number[]>();
  snaps.forEach((s, i) => {
    const h = handleOf(s);
    if (s.snapDaily) { keys[i] = `${h}::daily`; return; }
    if (s.tripGroupId) { keys[i] = `${h}::trip:${s.tripGroupId}`; return; }
    const base = `${h}::${s.countryName || s.snapDetectedCountry || ''}::${s.regionName || ''}`;
    const list = byBase.get(base);
    if (list) list.push(i); else byBase.set(base, [i]);
  });
  byBase.forEach((idxs, base) => {
    // 간격은 '직전 스냅과의 차'로 잰다 — 묶음 시작점 기준이면 8일짜리 여행이 통째로 쪼개진다
    const sorted = [...idxs].sort((a, b) => timeOf(snaps[a]) - timeOf(snaps[b]));
    let bucket = 0;
    let prev: number | null = null;
    for (const i of sorted) {
      const ts = timeOf(snaps[i]);
      if (prev !== null && ts - prev > RING_GAP_MS) bucket += 1; // 정확히 7일은 같은 묶음
      keys[i] = `${base}::b${bucket}`;
      prev = ts;
    }
  });

  // 2) 키별 집계. 등장 순서(order)를 따로 들고 다니는 이유는 여행 링의 기본 정렬이
  //    '첫 등장 순'이기 때문 — Map의 삽입 순서에 기대지 않고 명시한다.
  const order: string[] = [];
  const groups = new Map<string, { rep: T; hasUnviewed: boolean; isDaily: boolean }>();
  snaps.forEach((s, i) => {
    const k = keys[i];
    const g = groups.get(k);
    if (!g) {
      groups.set(k, { rep: s, hasUnviewed: isUnviewed(s), isDaily: !!s.snapDaily });
      order.push(k);
      return;
    }
    if (timeOf(s) > timeOf(g.rep)) g.rep = s; // 대표 = 묶음 안 최신
    if (isUnviewed(s)) g.hasUnviewed = true;
  });

  const rings = order.map((k) => {
    const g = groups.get(k)!;
    return { ...g.rep, _hasUnviewed: g.hasUnviewed, _isDaily: g.isDaily } as SnapRing<T>;
  });

  // 3) 여행 링과 일상 링을 나눠 정렬. 일상은 항상 뒤 — 여행 이야기가 앞줄을 차지해야 한다.
  const trips = rings.filter((r) => !r._isDaily);
  const dailies = rings.filter((r) => r._isDaily);
  // 여행 링: 하나라도 안 본 게 있으면 등장 순 그대로(기존 동작), 전부 봤으면 오래된 순
  if (trips.every((r) => !r._hasUnviewed)) trips.sort((a, b) => timeOf(a) - timeOf(b));
  // 일상 링: 안 본 것 먼저, 그 안에서는 오래된 순
  dailies.sort(
    (a, b) => (a._hasUnviewed === b._hasUnviewed ? timeOf(a) - timeOf(b) : a._hasUnviewed ? -1 : 1),
  );
  return [...trips, ...dailies];
}
