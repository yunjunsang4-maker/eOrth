/**
 * 사진 신호 캐시 — 같은 사진을 두 번 분석하지 않는다 (설계 §4)
 *
 * 분석 비용의 대부분은 썸네일 생성(디코드→리사이즈→인코드→디스크)이라, 한 번 뽑은
 * 신호를 여행별 파일에 남겨 재진입·재분석을 0초로 만든다.
 *
 * 썸네일 경로(thumbnailUri)는 캐시하지 않는다 — 캐시 디렉터리라 OS가 지운다.
 *
 * ⚠️ 순수 함수 구역에는 RN·Expo import이 없어야 한다(verify가 tsx로 돌린다).
 */
import type { PhotoMeta, PhotoQuality, PhotoSemantic, PhotoSignal } from './types';

/**
 * 캐시 스키마 버전. 네이티브 신호의 의미가 바뀌면(라벨 체계 교체, 필드 추가 등)
 * 이 값을 올려 옛 캐시를 통째로 폐기한다. 앱 버전이 아니라 신호 스키마 버전이다.
 */
export const SIGNAL_CACHE_VERSION = 1;

export interface SignalEntry {
  quality?: PhotoQuality;
  semantic?: PhotoSemantic;
  signal?: PhotoSignal;
}
export type SignalMap = Record<string, SignalEntry>;

interface Envelope { v: number; entries: SignalMap }

/**
 * 캐시 키. 자산 id가 1순위다 — iOS ph:// uri는 세션이 지나면 바뀔 수 있어
 * uri를 키로 쓰면 같은 사진이 매번 미적중이 된다.
 */
export function signalKey(photo: { id?: string; uri: string }): string {
  return photo.id || photo.uri;
}

/** 저장된 JSON을 검증하며 읽는다. 버전이 다르면 통째로 버린다. */
export function parseSignalMap(raw: string | null): SignalMap {
  if (!raw) return {};
  try {
    const env = JSON.parse(raw) as Partial<Envelope> | null;
    if (!env || typeof env !== 'object') return {};
    if (env.v !== SIGNAL_CACHE_VERSION) return {};
    const entries = env.entries;
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return {};
    const out: SignalMap = {};
    for (const [key, value] of Object.entries(entries)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      out[key] = value as SignalEntry;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * 캐시 적중분은 신호를 채워 돌려주고, 미적중분만 따로 모은다.
 * 입력 배열과 그 원소를 변형하지 않는다(호출부가 같은 배열을 계속 쓴다).
 */
export function applyCached(
  photos: PhotoMeta[],
  cache: SignalMap,
): { hydrated: PhotoMeta[]; missing: PhotoMeta[] } {
  const hydrated: PhotoMeta[] = [];
  const missing: PhotoMeta[] = [];
  for (const p of photos) {
    const hit = cache[signalKey(p)];
    if (hit) {
      hydrated.push({
        ...p,
        quality: hit.quality ?? p.quality,
        semantic: hit.semantic ?? p.semantic,
        signal: hit.signal ?? p.signal,
      });
    } else {
      hydrated.push({ ...p });
      missing.push(p);
    }
  }
  return { hydrated, missing };
}

/** 분석을 마친 사진들에서 캐시에 넣을 항목만 추린다(신호가 하나도 없으면 넣지 않는다). */
export function collectSignals(photos: PhotoMeta[]): SignalMap {
  const out: SignalMap = {};
  for (const p of photos) {
    if (!p.quality && !p.semantic && !p.signal) continue;
    out[signalKey(p)] = { quality: p.quality, semantic: p.semantic, signal: p.signal };
  }
  return out;
}

// ─────────────────────────────────────────────
// 영속화 (expo-file-system/legacy 지연 require)
// ─────────────────────────────────────────────

const CACHE_DIR_NAME = 'photoAI/signals/';

function fs() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
}

function cachePath(tripGroupId: string): string | null {
  const base = fs().documentDirectory;
  if (!base) return null;
  return `${base}${CACHE_DIR_NAME}${encodeURIComponent(tripGroupId)}.json`;
}

export async function loadSignalCache(tripGroupId: string): Promise<SignalMap> {
  const path = cachePath(tripGroupId);
  if (!path) return {};
  try {
    return parseSignalMap(await fs().readAsStringAsync(path));
  } catch {
    return {}; // 파일 없음도 여기로 온다
  }
}

export async function saveSignalCache(tripGroupId: string, map: SignalMap): Promise<void> {
  const base = fs().documentDirectory;
  if (!base) return;
  try {
    await fs().makeDirectoryAsync(`${base}${CACHE_DIR_NAME}`, { intermediates: true });
  } catch {
    // 이미 있으면 무시
  }
  const path = cachePath(tripGroupId);
  if (!path) return;
  const env: Envelope = { v: SIGNAL_CACHE_VERSION, entries: map };
  try {
    await fs().writeAsStringAsync(path, JSON.stringify(env));
  } catch {
    // 캐시 저장 실패는 무시 — 다음 분석에서 다시 뽑으면 된다
  }
}

export async function deleteSignalCache(tripGroupId: string): Promise<void> {
  const path = cachePath(tripGroupId);
  if (!path) return;
  try {
    await fs().deleteAsync(path, { idempotent: true });
  } catch {
    // 무시
  }
}
