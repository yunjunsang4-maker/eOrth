// 소셜 탭 스냅 링 줄 정렬 — '내 스냅 +' 입구(2026-09-07)를 위해 내 대표 항목을 맨 앞에 둔다.
// 내 항목이 여러 개(나라별 대표)여도 하나만 옮긴다 — 배지는 맨 앞 하나에만 붙는다.
// 어느 하나인가: rank가 있으면 rank 최대(=가장 최신 timestamp), 없으면 배열 순서상 첫 번째.
// rank가 필요한 이유(QA F-1): snapItems는 모두 열람 상태면 오래된 순으로 재정렬되므로
// 배열 첫 번째를 집으면 방금 찍은 스냅이 아니라 가장 오래된 나라의 스냅이 앞에 온다.

import { tripPeriodOf } from './momentMatch';

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

/** 링 1개 = 대표 스냅 + 묶음 집계 + 링 키(뷰어가 같은 묶음을 재생하려고 쓴다) */
export type SnapRing<T> = T & { _hasUnviewed: boolean; _isDaily: boolean; _ringKey: string };

/**
 * 스냅마다 링 키를 매긴다(입력과 같은 길이·순서). groupSnapRings와 스냅 뷰어(PostDetailScreen)가
 * 이 함수 하나를 공유한다 — 뷰어가 옛 `작성자::나라` 키로 따로 묶으면 링 A를 눌러도
 * 다른 여행·일상 스냅이 섞여 재생됐다(2026-09-29 소셜 탭 점검).
 *
 * 키: `snapDaily` → `handle::daily` / `tripGroupId` → `handle::trip:{id}` /
 *     둘 다 없으면 `handle::country::region` 안에서 7일 초과 간격마다 `::b{n}`.
 * 폴백 버킷은 같은 base끼리의 간격으로 정해지므로 **입력 집합**에 따라 달라진다 —
 * 링과 뷰어가 같은 키를 얻으려면 같은 필터를 거친 스냅 집합을 넘겨야 한다.
 */
export function snapRingKeys(snaps: SnapRingItem[]): string[] {
  const handleOf = (s: SnapRingItem) => s.user?.handle ?? '';
  const timeOf = (s: SnapRingItem) => s.timestamp ?? 0;
  // 폴백(일상도 여행 카드도 아닌)만 7일 버킷 계산을 위해 뒤로 미룬다.
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
  return keys;
}

/**
 * 스냅 배열을 링(여행 단위 + 일상) 목록으로 묶는다. 키는 snapRingKeys.
 * 대표는 묶음 안 **최신** 스냅, `_hasUnviewed`는 묶음 안 어느 하나라도 안 봤으면 true.
 * 순서는 여행 링(기존 규칙: 첫 등장 순, 전부 봤으면 오래된 순) → 일상 링(안 본 것 먼저,
 * 그 다음 오래된 순). 입력은 mutate하지 않는다.
 */
export function groupSnapRings<T extends SnapRingItem>(
  snaps: T[],
  isUnviewed: (s: T) => boolean,
): SnapRing<T>[] {
  const timeOf = (s: T) => s.timestamp ?? 0;

  // 1) 키 배정
  const keys = snapRingKeys(snaps);

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
    return { ...g.rep, _hasUnviewed: g.hasUnviewed, _isDaily: g.isDaily, _ringKey: k } as SnapRing<T>;
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

// ─────────────────────────────────────────────────────────────
// 내 여행 링이 '진행 중'인가 — + 배지를 붙일지(2026-09-27)
// ─────────────────────────────────────────────────────────────
// 예전엔 내 여행 링이 하나라도 있으면 최신 것을 맨 앞에 두고 + 배지를 붙였다. 그러면 몇 달 전
// 끝난 미국 여행 링에 +가 붙어 "미국 여행에 추가되는" 것처럼 보였다. 이제 진행 중일 때만 배지.
//
// 끝났다의 기준 = 그 여행의 여행 카드에 기록된 날짜 범위(사용자 지시). recordStore의 tripSession은
// 컨텍스트에 노출돼 있지 않고 30일 방치 만료라 '진행 중'의 근거로 못 쓴다.
// 여유 1일 — 시차·어제 찍고 오늘 여는 경우(momentMatch.TRIP_PAD_MS와 같은 취지).

const DAY_MS = 24 * 60 * 60 * 1000;

/** isSnapTripOngoing이 읽는 카드 모양 (recordStore.TripGroup이 그대로 들어온다) */
export interface OngoingTripCard {
  id: string;
  records: string[];
  stay?: { status?: string } | null;
}
/** 기간 계산에 쓰는 기록 모양 (TravelRecord가 그대로 들어온다) */
export interface OngoingTripRecord {
  id: string;
  startDate?: string;
  endDate?: string;
  date?: string;
  timestamp?: number;
}

/** ms → 그 날의 로컬 자정 */
function localMidnight(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * 링 대표 스냅의 여행이 오늘(now, 로컬 자정 기준) 진행 중인가.
 * 1) tripGroupId로 카드를 찾고, 체류 카드면 `stay.status === 'active'`가 곧 진행 중(paused=귀국 중이라 새 스냅이 이 카드로 안 들어감).
 * 2) 카드 기록들의 [시작, 종료]를 tripPeriodOf로. 카드가 없거나 기간이 null이면 대표 스냅
 *    자신의 날짜 → 그것도 없으면 timestamp. 대표는 링 안 최신 스냅이라 종료 쪽 근거로 충분하다.
 * 3) [시작 − 1일, 종료 + 1일] 안이면 진행 중.
 */
export function isSnapTripOngoing(
  rep: OngoingTripRecord & { tripGroupId?: string | null },
  tripGroups: OngoingTripCard[],
  records: OngoingTripRecord[],
  now: number,
): boolean {
  const card = rep.tripGroupId ? tripGroups.find((g) => g.id === rep.tripGroupId) : undefined;
  if (card?.stay && card.stay.status === 'active') return true;

  let period: { startMs: number; endMs: number } | null = null;
  if (card) {
    const ids = new Set(card.records);
    period = tripPeriodOf(records.filter((r) => ids.has(r.id)));
  }
  if (!period) period = tripPeriodOf([rep]);
  if (!period && rep.timestamp) {
    const day = localMidnight(rep.timestamp);
    period = { startMs: day, endMs: day };
  }
  if (!period) return false; // 날짜 근거가 전혀 없으면 끝난 것으로 — 옛 증상(끝난 여행에 +)보다 안전한 쪽

  const today = localMidnight(now);
  return today >= period.startMs - DAY_MS && today <= period.endMs + DAY_MS;
}

// ─────────────────────────────────────────────────────────────
// 링 줄 최종 순서 — 소셜 탭 링 줄과 스냅 뷰어가 공유(2026-09-29)
// ─────────────────────────────────────────────────────────────
// 진행 중인 내 여행 링은 맨 앞(고정 '내 스냅 +' 칸 바로 뒤)으로 끌어온다 — 내 스냅은 늘 '본 것'이라
// groupSnapRings가 오래된 순으로 두면 방금 찍은 링이 맨 뒤(화면 밖)로 밀린다(QA F-1).
// 끝난 여행은 그대로(isSnapTripOngoing, 카드 날짜 ±1일). 일상 링은 대상에서 빼 '일상은 여행 링 뒤' 유지.
// 예전엔 SocialScreen 안에만 있었는데, 뷰어가 '다음 링'으로 넘길 때 같은 순서를 따라야 해서 옮겼다.
export function orderSnapStrip<T extends SnapRingItem>(
  rings: SnapRing<T>[],
  isMine: (s: SnapRing<T>) => boolean,
  tripGroups: OngoingTripCard[],
  records: OngoingTripRecord[],
  now: number,
): SnapRing<T>[] {
  const trips = rings.filter((s) => !s._isDaily);
  const moved = putMineFirst(trips, isMine, (s) => s.timestamp ?? 0);
  const live = moved.length > 0 && isMine(moved[0]) && isSnapTripOngoing(moved[0], tripGroups, records, now);
  return live ? [...moved, ...rings.filter((s) => s._isDaily)] : rings;
}

// ─────────────────────────────────────────────────────────────
// 거주 지역 소급 '일상' 표시 — 이미 저장된 내 스냅 고르기(2026-10-04)
// ─────────────────────────────────────────────────────────────
// snapDaily는 저장 시점에 박제되는데, 거주 지역 시트는 그동안 거주국 스냅을 **저장한 뒤에야** 떴다.
// 그래서 첫 스냅은 homeRegion=null로 저장돼 일상 표시 없이 국내 여행 카드(서울+7일)에 들어가
// 링이 `🇰🇷 서울`(여행)과 일상 두 개로 갈렸다. 거주 지역이 정해진 뒤 그런 스냅을 골라낸다.
// 지역 비교는 저장 시점과 같은 규칙 — 그대로 같거나, 정규화(수원시→경기 등)한 값이 같으면 일치.

/** pickRetroDailySnapIds가 읽는 필드만 추린 기록 모양 (recordStore.TravelRecord가 그대로 들어온다) */
export interface RetroDailyItem {
  id: string;
  viewType?: string;
  isMyPost?: boolean;
  snapDaily?: boolean;
  countryName?: string;
  regionName?: string;
}

/**
 * 거주 지역에서 찍었는데 아직 일상 표시가 없는 **내 스냅**의 id 목록.
 * @param homeCountryName 거주국의 기록용 국가명(예: '대한민국'). 없으면 빈 배열.
 * @param homeRegionName  거주 지역 이름(예: '서울'). 없으면 빈 배열.
 * @param normalizeRegion 거주국 지역 프리셋 정규화(recordStore가 normalizeHomeRegion을 감싸 넘긴다).
 *                        이 파일이 지오 데이터를 끌어오지 않게 주입받는다.
 */
export function pickRetroDailySnapIds(
  records: RetroDailyItem[],
  homeCountryName: string | null | undefined,
  homeRegionName: string | null | undefined,
  normalizeRegion?: (raw: string) => string | null | undefined,
): string[] {
  if (!homeCountryName || !homeRegionName) return [];
  return records
    .filter((r) =>
      r.viewType === 'snap' &&
      r.isMyPost !== false &&
      !r.snapDaily &&
      r.countryName === homeCountryName &&
      !!r.regionName &&
      (r.regionName === homeRegionName || normalizeRegion?.(r.regionName) === homeRegionName))
    .map((r) => r.id);
}

/**
 * 소급 표시를 지금 돌릴지 — **거주국마다 1회**(2026-10-04 사용자 결정, QA F1).
 * 거주 지역을 바꿀 때마다 돌면 서울→부산 오탭 한 번에 작년 부산 여행 스냅이 되돌릴 수 없이 일상이 된다.
 * 그래서 "이 거주국으로 이미 돌았는가"(`done` = 돌았던 거주국 코드 **집합**, 영속)를 보고 한 번만 돈다.
 * 거주국이 바뀌면(거주 지역 리셋 → 다시 설정) 새 나라로 한 번 더 돈다. 거주 지역이 없으면 돌지 않는다 —
 * 그때 플래그를 세우면 정작 거주 지역을 처음 정하는 회차가 막힌다.
 *
 * ⚠️ 코드 하나가 아니라 집합인 이유(QA R2): 하나만 담으면 KR→JP→KR 왕복 뒤 `'KR' !== 'JP'`로 KR이
 *    한 번 더 돌아 F1이 재현된다.
 * ⚠️ **내 기록이 0건이면 돌지 않는다**(QA R3). 돌아 봐야 대상이 0건인데 플래그만 서서, 그 뒤 서버에서
 *    내려오는 기록(계정 전환·새 기기의 hydrateMyRecords)이 영영 소급되지 않는다. 계정 전환에서
 *    resetRecords와 resetSettings가 다른 커밋에 들어가 "빈 기록 + 이전 계정 거주 지역" 회차가 생겨도
 *    여기서 막힌다. 기록이 생긴 뒤에 처음 돌므로 빈 목록으로 닫히는 경로가 없다.
 */
export function shouldRunRetroDaily(
  homeCountryCode: string | null | undefined,
  homeRegionName: string | null | undefined,
  done: string[] | null | undefined,
  records: RetroDailyItem[],
): boolean {
  const cc = (homeCountryCode || '').toUpperCase();
  return !!cc && !!homeRegionName && !(done ?? []).includes(cc) && records.some((r) => r.isMyPost !== false);
}

/**
 * 영속본의 "소급을 마친 거주국" 값을 코드 집합으로 복원한다(QA R2 마이그레이션).
 * 옛 형식은 코드 하나(문자열)였다 → `[대문자 코드]`. 배열은 문자열만 대문자로 남기고 중복을 뺀다.
 * 그 밖(undefined·null·숫자·객체)은 빈 배열 = 아직 안 돎.
 */
export function restoreRetroDailyDone(raw: unknown): string[] {
  const list = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : [];
  const codes = list.filter((c): c is string => typeof c === 'string' && c.trim() !== '').map((c) => c.trim().toUpperCase());
  return Array.from(new Set(codes));
}

/**
 * 소급·stray 떼어내기를 이번 회차에 어떻게 처리할지.
 * - `'detach'`   : 비는 카드가 없거나(서버에 걸 것 없음) Supabase 미설정 빌드(tombstone이 늘 false) → 바로 뗀다.
 * - `'tombstone'`: 비는 카드에 tombstone을 먼저 걸고, 성공한 뒤에 뗀다(QA F2).
 * - `'defer'`    : 이번 회차는 아무것도 안 뗀다. 표시는 이미 붙어 있어 다음 회차에 stray로 다시 잡힌다.
 *
 * ⚠️ `cardsPulled`(이번 세션의 카드 pull이 성공으로 끝났는가)가 false면 미룬다(QA R1). "비게 될 카드"는
 *    **로컬** 멤버로 판정하는데, pull 전의 로컬은 다른 기기가 그 카드에 더한 멤버를 아직 모른다 —
 *    그대로 tombstone하면 상대 기기에서 멀쩡한 카드가 지워진다.
 * ⚠️ `inFlight`면 미룬다 — 같은 카드에 tombstone이 겹쳐 나가지 않게.
 */
export function planRetroDetach(
  doomedCount: number,
  supabaseConfigured: boolean,
  cardsPulled: boolean,
  inFlight: boolean,
): 'detach' | 'tombstone' | 'defer' {
  if (doomedCount === 0 || !supabaseConfigured) return 'detach';
  if (!cardsPulled || inFlight) return 'defer';
  return 'tombstone';
}

/**
 * 이미 일상인데 아직 어떤 여행 카드에 들어 있는 내 스냅 id. 다른 기기가 표시한 스냅은 snapDaily만
 * 넘어오고 이 기기의 카드 소속은 남는다 — 떼어내야 카드 합집합 병합으로 재감염되지 않는다.
 * 일상 스냅만 고르므로 소급 1회 제한과 무관하게 매번 돌려도 안전하다.
 */
export function pickStrayDailySnapIds(
  records: RetroDailyItem[],
  groups: { records: string[] }[],
): string[] {
  const inCard = new Set(groups.flatMap((g) => g.records));
  return records.filter((r) => r.viewType === 'snap' && !!r.snapDaily && inCard.has(r.id)).map((r) => r.id);
}

/**
 * `ids`를 떼어내면 멤버가 0이 되는 카드 id = detachRecordsFromTripGroups가 로컬에서 폐기할 카드.
 * 이 카드들은 서버에 tombstone을 **먼저** 걸어야 한다(안 그러면 push의 빈 상태 가드에 막혀
 * 서버·다른 기기에 유령 카드로 남는다 — QA F2). KP 정리 effect와 같은 규칙:
 * 원래 비어 있던 카드와 체류 카드는 대상이 아니다.
 */
export function pickCardsEmptiedByDetach(
  groups: { id: string; records: string[]; stay?: unknown }[],
  ids: string[],
): string[] {
  const gone = new Set(ids);
  return groups
    .filter((g) => !g.stay && g.records.length > 0 && g.records.every((rid) => gone.has(rid)))
    .map((g) => g.id);
}
