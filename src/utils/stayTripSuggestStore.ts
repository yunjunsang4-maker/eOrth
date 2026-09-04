/**
 * 주변국 여행 제안의 대기 목록·거절 키 영속 (설계 §4·§5)
 *
 * 감지기(StayTripSuggester)가 쓰고 배너(StayTripSuggestBanner)가 읽는다. 두 컴포넌트가
 * AsyncStorage를 각자 만지면 갱신 시점이 어긋나므로 여기 한 곳에 두고 구독으로 알린다.
 *
 * ⚠️ 순수 구역(verify 대상)에는 import이 없어야 한다. AsyncStorage와 persist 키는
 *    영속 함수 안에서 지연 require한다(tripPhotoPool.ts와 같은 방식).
 */
import type { TripSuggestion } from './stayTripSuggest';

const H = 3600_000;
/** 감지 후 이만큼 지나면 제안은 조용히 사라진다 — 영구 배너는 소음이 된다 */
export const SUGGESTION_TTL_MS = 7 * 24 * H;
/** '나중에'로 숨기는 시간 */
export const SNOOZE_MS = 24 * H;

// ─────────────────────────────────────────────
// 순수 로직 (verify 대상)
// ─────────────────────────────────────────────

/** 만료·미래 시각 항목 제거. 경계(정확히 7일)는 유지 */
export function prunePending(list: TripSuggestion[], now: number): TripSuggestion[] {
  return list.filter((s) => s.detectedAt <= now && now - s.detectedAt <= SUGGESTION_TTL_MS);
}

/**
 * 기존 대기 목록 + 새 스캔 결과 병합.
 * 같은 키는 기존 항목의 detectedAt(소멸 시계)·snoozeUntil을 보존하되 사진 목록·장수는 최신으로.
 * 새 키는 뒤에 붙인다. 만료 항목은 여기서도 걸러 재검사 때 되살아나지 않게 한다.
 */
export function mergePending(prev: TripSuggestion[], fresh: TripSuggestion[], now: number): TripSuggestion[] {
  const alive = prunePending(prev, now);
  const byKey = new Map(fresh.map((s) => [s.key, s]));
  const out: TripSuggestion[] = alive.map((s) => {
    const f = byKey.get(s.key);
    return f ? { ...f, detectedAt: s.detectedAt, snoozeUntil: s.snoozeUntil } : s;
  });
  const seen = new Set(out.map((s) => s.key));
  for (const f of fresh) {
    if (!seen.has(f.key)) { seen.add(f.key); out.push(f); }
  }
  return out;
}

/** 배너에 실제로 보여줄 것 — 스누즈 중이 아닌 항목 */
export function visibleSuggestions(list: TripSuggestion[], now: number): TripSuggestion[] {
  return list.filter((s) => !s.snoozeUntil || s.snoozeUntil <= now);
}

export function snoozeSuggestion(list: TripSuggestion[], key: string, now: number): TripSuggestion[] {
  return list.map((s) => (s.key === key ? { ...s, snoozeUntil: now + SNOOZE_MS } : s));
}

export function removeSuggestions(list: TripSuggestion[], keys: string[]): TripSuggestion[] {
  if (keys.length === 0) return list;
  const drop = new Set(keys);
  return list.filter((s) => !drop.has(s.key));
}

/** 저장 JSON → 목록. 필수 필드가 빠진 항목은 버린다(부가 기능은 되살리지 않는다) */
export function parsePending(raw: string | null): TripSuggestion[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is TripSuggestion => {
      if (!v || typeof v !== 'object') return false;
      const s = v as Partial<TripSuggestion>;
      // countryCode도 필수다 — 여행 id(파일 경로)와 키가 이 값으로 만들어지므로, 빠진 항목을
      // 통과시키면 'suggest-…-undefined-…' 폴더가 생긴다. 아직 배포 전이라 옛 저장분은 버려도 된다.
      return typeof s.key === 'string' && !!s.key
        && typeof s.countryCode === 'string' && !!s.countryCode
        && typeof s.countryName === 'string'
        && typeof s.startDate === 'string' && typeof s.endDate === 'string'
        && typeof s.detectedAt === 'number'
        && Array.isArray(s.photos);
    });
  } catch {
    return [];
  }
}

export function parseDismissed(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string' && !!v);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────
// 영속화 + 구독 (지연 require — verify는 여기까지 오지 않는다)
// ─────────────────────────────────────────────

function storage() {
  return (require('@react-native-async-storage/async-storage') as {
    default: typeof import('@react-native-async-storage/async-storage').default;
  }).default;
}
function keys() {
  return (require('../store/persist') as typeof import('../store/persist')).DETECTOR_KEYS;
}

type Listener = (list: TripSuggestion[]) => void;
const listeners = new Set<Listener>();

/** 대기 목록이 바뀔 때 알림을 받는다. 반환값은 해제 함수 */
export function subscribePending(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export async function loadPending(): Promise<TripSuggestion[]> {
  try {
    return parsePending(await storage().getItem(keys().stayTripSuggestPending));
  } catch {
    return [];
  }
}

export async function savePending(list: TripSuggestion[]): Promise<void> {
  try {
    await storage().setItem(keys().stayTripSuggestPending, JSON.stringify(list));
  } catch {
    // 저장 실패는 조용히 — 다음 검사에서 다시 만들어진다
  }
  for (const fn of listeners) fn(list);
}

export async function loadDismissed(): Promise<string[]> {
  try {
    return parseDismissed(await storage().getItem(keys().stayTripSuggestDismissed));
  } catch {
    return [];
  }
}

export async function addDismissed(key: string): Promise<void> {
  const cur = await loadDismissed();
  if (cur.includes(key)) return;
  try {
    await storage().setItem(keys().stayTripSuggestDismissed, JSON.stringify([...cur, key]));
  } catch {
    // 실패하면 다음 스캔에 한 번 더 뜬다 — 침묵보다 낫다
  }
}

export async function loadCheckedAt(): Promise<number> {
  try {
    const raw = await storage().getItem(keys().stayTripSuggestCheckedAt);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export async function saveCheckedAt(ms: number): Promise<void> {
  try {
    await storage().setItem(keys().stayTripSuggestCheckedAt, String(ms));
  } catch {
    // 실패하면 다음 포그라운드에 한 번 더 검사한다 — 비용은 좌표 조회 수십 회뿐
  }
}
