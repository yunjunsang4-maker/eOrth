# 사진 AI 추천 입력 경로 전환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 형식 추천의 입력을 "사진첩 저장분"에서 "여행 카드별 보관 사진 참조(tripPhotoPool)"로 옮겨, 사진첩이 없는 여행에도 추천이 뜨게 하고 분석 결과를 캐시해 재분석을 없앤다.

**Architecture:** 소스 해석기(`recoSource`)와 신호 캐시(`signalCache`)를 새로 두고, 추천 엔진은 입력 소스를 모르게 만든다. pool 저장은 AsyncStorage 단일 키에서 여행별 파일로 옮겨 장수 상한을 없앤다. 추천 상태의 키를 앨범 기록 id에서 여행 그룹 id로 바꾼다.

**Tech Stack:** React Native (Expo SDK 54), TypeScript, `expo-file-system/legacy`(지연 require), `expo-media-library`, `expo-image-manipulator`, 로컬 Expo Module `photo-vision`. 테스트는 jest가 아니라 `*.verify.ts` + `tsx`.

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-09-01-photo-ai-pool-input-design.md`. 충돌 시 설계가 우선한다.
- **지시한 파일만 수정한다.** 각 Task의 `Files` 목록 밖의 파일은 건드리지 않는다.
- 사진·신호·추천은 **전부 로컬**. 서버 전송 코드를 추가하지 않는다.
- **`MediaLibrary.getAssetInfoAsync`는 분석 경로에서 `shouldDownloadFromNetwork: false`**로 호출한다(백그라운드에서 데이터·배터리를 쓰지 않는다). 복사(accept) 경로는 `true`가 맞다 — 기존 `copyTripOriginals`가 이미 그렇게 한다.
- **권한 팝업을 새로 띄우지 않는다.** 권한이 없으면 조용히 미노출한다(App Store 5.1.1 방어 정책).
- `expo-file-system`은 반드시 **`expo-file-system/legacy`**를 함수 안에서 지연 require한다: `const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');` — 이 저장소의 기존 10곳이 모두 이 형태다.
- **verify 파일은 RN 없이 `tsx`로 돌아간다.** 검증 대상 순수 함수가 있는 모듈은 상단에 RN·Expo import를 두면 안 되고, 네이티브 의존은 함수 안에서 지연 require해야 한다(`tripPhotoPool.ts:11-13` 주석 참조).
- 디자인 토큰: 배경 `#0A0A0F`, 카드 `#2E2E3B`, 보라 네온 `#BF85FC`, 텍스트 흐림 `#A1A1B0`, 구분선 `#1A1A26`.
- 각 Task 끝에서 `npx tsc --noEmit`이 0으로 끝나야 한다.
- 커밋은 **파일 단위로 스테이징**한다. 작업 트리에 사용자 WIP(`src/utils/feedWindow.ts`, `src/screens/SocialScreen.tsx`, `src/constants/featureFlags.ts`)가 있으므로 `git add -A`를 쓰지 않는다.

## 선행 조건 (해소됨)

이 계획은 과거 여행 불러오기 작업(`src/utils/tripPhotoPool.ts`) 위에 서 있다. 그 작업은 `e497afe`로 커밋됐다(2026-09-03 확인).

**작업 트리에 사용자 WIP가 있다** — 피드 윈도잉(`src/utils/feedWindow.ts`, `src/utils/feedWindow.verify.ts`, `src/screens/SocialScreen.tsx`, `src/constants/featureFlags.ts`)이 미커밋 상태로 남아 있고 이 계획과 무관하다. **절대 `git add -A`·`git add .`·`git commit -a`를 쓰지 말고**, 각 태스크가 명시한 경로만 스테이징한다.

---

### Task 1: tripPhotoPool 저장을 여행별 파일로 전환

**Files:**
- Modify: `src/utils/tripPhotoPool.ts` (상수 `:37-41`, 영속화 구역 `:199-265`)
- Test: `src/utils/tripPhotoPool.verify.ts` (기존 파일에 추가)

**Interfaces:**
- Consumes: 없음(첫 태스크)
- Produces:
  - `POOL_DIR_NAME = 'photoAI/pools/'`
  - `poolFileName(tripGroupId: string): string` — 순수 함수
  - `parsePoolIndex(raw: string | null): PoolIndex` — 순수 함수
  - `export interface PoolIndex { [tripGroupId: string]: { savedAt: number; photoCount: number } }`
  - 기존 시그니처 유지: `loadTripPools()`, `saveTripPool()`, `getTripPool()`, `syncTripPools()`
  - `MAX_POOL_PHOTOS` **삭제**, `MAX_POOLS = 500`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/utils/tripPhotoPool.verify.ts` 맨 아래 `if (failed)` 줄 **앞에** 추가한다:

```ts
// ── poolFileName ──
eq(poolFileName('abc123'), 'abc123.json', '평범한 id는 그대로 파일명');
eq(poolFileName('a/b'), 'a%2Fb.json', '경로 구분자는 인코딩되어 디렉터리 탈출을 막는다');
eq(poolFileName('a b'), 'a%20b.json', '공백도 인코딩');

// ── parsePoolIndex ──
eqJson(parsePoolIndex(null), {}, 'null이면 빈 인덱스');
eqJson(parsePoolIndex('not json'), {}, '깨진 JSON이면 빈 인덱스');
eqJson(parsePoolIndex('[]'), {}, '배열이면 빈 인덱스');
eqJson(
  parsePoolIndex('{"g1":{"savedAt":5,"photoCount":3}}'),
  { g1: { savedAt: 5, photoCount: 3 } },
  '정상 항목은 그대로',
);
eqJson(
  parsePoolIndex('{"g1":{"savedAt":"x","photoCount":3},"g2":{"savedAt":1,"photoCount":2}}'),
  { g2: { savedAt: 1, photoCount: 2 } },
  '형태가 어긋난 항목은 버리고 나머지는 살린다',
);

// ── MAX_POOLS 백스톱은 남아 있어야 한다 (capPools가 죽은 코드가 되지 않는다) ──
eq(MAX_POOLS, 500, 'MAX_POOLS는 폭주 방지 백스톱으로 500');

// ── capPools는 인덱스에도 그대로 쓰인다 (savedAt만 있으면 되는 시그니처) ──
{
  const index = {
    old: { savedAt: 1, photoCount: 3 },
    mid: { savedAt: 5, photoCount: 3 },
    recent: { savedAt: 9, photoCount: 3 },
  };
  eqJson(Object.keys(capPools(index, 2)).sort(), ['mid', 'recent'], '인덱스도 최근 저장 순으로 자른다');
  eqJson(capPools(index, 5), index, '상한 이하면 그대로');
}
```

import 문도 함께 고친다(파일 최상단):

```ts
import {
  samplePoolPhotos,
  pickCoverCandidates,
  prunePools,
  capPools,
  poolAssetIds,
  parsePools,
  mergePool,
  poolFileName,
  parsePoolIndex,
  MAX_POOLS,
  type TripPhotoPool,
  type TripPhotoPoolMap,
} from './tripPhotoPool';
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node node_modules/tsx/dist/cli.mjs src/utils/tripPhotoPool.verify.ts`
Expected: FAIL — `poolFileName`·`parsePoolIndex`·`MAX_POOLS` import 오류

- [ ] **Step 3: 상수를 바꾼다**

`src/utils/tripPhotoPool.ts:37-41`을 교체한다:

```ts
// 여행당 보관 장수 상한은 없앴다(2026-09-01). 참조 1장이 약 125바이트라 보관은 싸고,
// 비싼 것은 분석이다 — 분석 상한은 recoSource.ts의 RECO_ANALYZE_MAX가 따로 맡는다.
//
// 여행 수 상한만 폭주 방지용으로 남긴다. 파일로 흩어지면 6MB 제약은 사라지지만
// 인덱스 크기와 청소 비용은 여행 수에 비례해 계속 커진다. 실사용에서 도달할 수 없는 값이다.
export const MAX_POOLS = 500;
```

`MAX_POOL_PHOTOS`는 삭제한다.

- [ ] **Step 4: 순수 헬퍼를 추가하고 `capPools`를 일반화한다**

먼저 기존 `capPools`의 시그니처를 넓힌다. 지금은 `TripPhotoPoolMap`만 받는데 인덱스에도
같은 규칙(최근 저장 순으로 자르기)을 써야 한다. 본문은 `savedAt`만 읽으므로 로직은 그대로 두고
타입만 넓힌다 — 그래야 호출부에서 캐스트를 하지 않는다.

```ts
/** 최근 저장 순으로 max개만 남긴다. savedAt만 있으면 어떤 맵에든 쓸 수 있다. */
export function capPools<T extends { savedAt?: number }>(
  pools: Record<string, T>,
  max: number,
): Record<string, T> {
  const entries = Object.entries(pools);
  if (entries.length <= max) return { ...pools };
  entries.sort((a, b) => (b[1].savedAt ?? 0) - (a[1].savedAt ?? 0));
  const out: Record<string, T> = {};
  for (const [id, pool] of entries.slice(0, max)) out[id] = pool;
  return out;
}
```

그다음 `parsePools` 함수 **바로 뒤**(순수 로직 구역 끝)에 추가한다:

```ts
export interface PoolIndexEntry { savedAt: number; photoCount: number }
export type PoolIndex = Record<string, PoolIndexEntry>;

/** 여행 보관 파일이 놓이는 하위 디렉터리 (documentDirectory 기준 상대 경로) */
export const POOL_DIR_NAME = 'photoAI/pools/';

/**
 * tripGroupId → 파일명. id에 '/'가 들어오면 디렉터리를 탈출하므로 반드시 인코딩한다.
 * (여행 id는 앱이 만들지만, 저장 경로를 만드는 곳에서 막아 두는 편이 안전하다)
 */
export function poolFileName(tripGroupId: string): string {
  return `${encodeURIComponent(tripGroupId)}.json`;
}

/** 인덱스 JSON을 검증하며 읽는다. 형태가 어긋난 항목은 버린다(parsePools와 같은 방침). */
export function parsePoolIndex(raw: string | null): PoolIndex {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: PoolIndex = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const v = value as Partial<PoolIndexEntry> | null;
      if (!v || typeof v !== 'object') continue;
      if (typeof v.savedAt !== 'number' || typeof v.photoCount !== 'number') continue;
      out[id] = { savedAt: v.savedAt, photoCount: v.photoCount };
    }
    return out;
  } catch {
    return {};
  }
}
```

- [ ] **Step 5: 테스트 통과를 확인한다**

Run: `node node_modules/tsx/dist/cli.mjs src/utils/tripPhotoPool.verify.ts`
Expected: PASS — 기존 56케이스 + 신규 9케이스

- [ ] **Step 6: 영속화 구역을 파일 방식으로 교체한다**

`src/utils/tripPhotoPool.ts:199-265`(영속화 구역 전체)를 아래로 교체한다:

```ts
// ─────────────────────────────────────────────
// 영속화 (expo-file-system/legacy 지연 require — verify는 여기까지 오지 않는다)
//
// 2026-09-01: AsyncStorage 단일 키 → 여행별 파일로 전환.
// 옛 방식은 모든 여행의 pool이 키 하나에 통째로 들어가 저장할 때마다 전체를 읽고 썼다.
// 안드로이드 AsyncStorage는 기본 6MB 상한이고 초과하면 writeTripPools가 조용히
// 실패했다. 파일로 나누면 그 천장이 사라지고 저장 시 해당 여행 파일만 만진다.
// ─────────────────────────────────────────────

function fs() {
   
  return require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
}

function storage() {
   
  return (require('@react-native-async-storage/async-storage') as {
    default: typeof import('@react-native-async-storage/async-storage').default;
  }).default;
}

function poolDir(): string | null {
  const base = fs().documentDirectory;
  return base ? `${base}${POOL_DIR_NAME}` : null;
}

async function ensureDir(): Promise<string | null> {
  const dir = poolDir();
  if (!dir) return null;
  try {
    await fs().makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // 이미 있으면 무시
  }
  return dir;
}

async function readIndex(): Promise<PoolIndex> {
  const dir = poolDir();
  if (!dir) return {};
  try {
    return parsePoolIndex(await fs().readAsStringAsync(`${dir}index.json`));
  } catch {
    return {}; // 파일 없음도 여기로 온다
  }
}

async function writeIndex(index: PoolIndex): Promise<void> {
  const dir = await ensureDir();
  if (!dir) return;
  try {
    await fs().writeAsStringAsync(`${dir}index.json`, JSON.stringify(index));
  } catch {
    // 보관 실패는 조용히 무시 — 카드 생성 자체를 막을 이유가 없다
  }
}

/**
 * 여행 하나의 보관 목록을 읽는다.
 *
 * ⚠️ "읽기 실패"와 "없음"을 구분하지 않고 둘 다 null을 돌려준다. 호출부(recoSource)는
 *    null이면 앨범 medias로 폴백하므로, 일시적 읽기 실패가 추천을 죽이지 않고
 *    앨범이 있으면 그쪽으로 자연히 넘어간다.
 */
export async function getTripPool(tripGroupId: string): Promise<TripPhotoPool | null> {
  if (!tripGroupId) return null;
  await ensureMigrated();
  const dir = poolDir();
  if (!dir) return null;
  try {
    const raw = await fs().readAsStringAsync(`${dir}${poolFileName(tripGroupId)}`);
    const parsed = parsePools(`{"${tripGroupId}":${raw}}`);
    return parsed[tripGroupId] ?? null;
  } catch {
    return null;
  }
}

/** 인덱스에 올라 있는 모든 여행의 보관 목록. 스캔 제외 집합 재구성 등 전수 조회용. */
export async function loadTripPools(): Promise<TripPhotoPoolMap> {
  const index = await readIndex();
  const out: TripPhotoPoolMap = {};
  for (const id of Object.keys(index)) {
    const pool = await getTripPool(id);
    if (pool) out[id] = pool;
  }
  return out;
}

/**
 * 여행 하나의 보관 목록을 저장한다. 같은 카드에 이미 보관분이 있으면 합친다(mergePool).
 * 장수 솎기는 하지 않는다 — 2026-09-01부터 여행당 상한이 없다.
 */
export async function saveTripPool(
  pool: Omit<TripPhotoPool, 'savedAt' | 'totalCount'> & { totalCount?: number },
  now: number = Date.now(),
): Promise<void> {
  await ensureMigrated();
  const dir = await ensureDir();
  if (!dir) return;
  const prev = await getTripPool(pool.tripGroupId);
  const merged = mergePool(prev ?? undefined, {
    ...pool,
    totalCount: pool.totalCount ?? pool.photos.length,
    savedAt: now,
  });
  const entry: TripPhotoPool = { ...merged, savedAt: now };
  try {
    await fs().writeAsStringAsync(`${dir}${poolFileName(entry.tripGroupId)}`, JSON.stringify(entry));
  } catch {
    return; // 본문 저장이 실패하면 인덱스도 올리지 않는다(유령 항목 방지)
  }
  const index = await readIndex();
  index[entry.tripGroupId] = { savedAt: now, photoCount: entry.photos.length };
  await writeIndex(capPools(index, MAX_POOLS));
}

/**
 * 살아 있는 카드 것만 남기고 저장까지 한 뒤, 정리된 목록을 돌려준다.
 * 삭제된 카드의 사진이 재스캔에서 영영 제외되는 것을 막는 청소 지점이다.
 *
 * 스캔 시작 시 이 함수가 도는 것을 전제로, 스캔 제외 id 집합은 여기서 나온 결과로
 * 한 번만 재구성한다(파일이 흩어져 전수 조회가 비싸므로 매번 하지 않는다).
 */
export async function syncTripPools(aliveTripGroupIds: string[]): Promise<TripPhotoPoolMap> {
  await ensureMigrated();
  const dir = poolDir();
  if (!dir) return {};
  const index = await readIndex();
  const alive = new Set(aliveTripGroupIds);
  const nextIndex: PoolIndex = {};
  for (const [id, meta] of Object.entries(index)) {
    if (alive.has(id)) { nextIndex[id] = meta; continue; }
    try {
      await fs().deleteAsync(`${dir}${poolFileName(id)}`, { idempotent: true });
    } catch {
      // 삭제 실패는 무시 — 인덱스에서 빠지므로 더 이상 조회되지 않는다
    }
  }
  if (Object.keys(nextIndex).length !== Object.keys(index).length) await writeIndex(nextIndex);
  const out: TripPhotoPoolMap = {};
  for (const id of Object.keys(nextIndex)) {
    const pool = await getTripPool(id);
    if (pool) out[id] = pool;
  }
  return out;
}

/**
 * 옛 AsyncStorage 단일 키를 파일로 1회 이관한다.
 *
 * 부팅 훅을 따로 두지 않고 이 모듈의 모든 진입점(getTripPool·saveTripPool·syncTripPools)
 * 앞에서 부른다. 앱 부팅 순서에 의존하지 않고 자가 치유되며, 모듈 수준 프로미스 하나로
 * 세션당 정확히 한 번만 돈다(동시 호출이 겹쳐도 이관이 두 번 돌지 않는다).
 *
 * 실패해도 치명적이지 않다 — 앨범 폴백이 있고, 최악의 경우 재스캔에서 여행이 다시 뜬다.
 * 실패 시 옛 키를 남겨 두므로 다음 앱 실행에서 다시 시도된다.
 */
let migrationPromise: Promise<void> | null = null;

async function runMigration(): Promise<void> {
  try {
    const raw = await storage().getItem(TRIP_PHOTO_POOL_KEY);
    if (!raw) return;
    const pools = parsePools(raw);
    const dir = await ensureDir();
    if (!dir) return;
    const index: PoolIndex = {};
    for (const pool of Object.values(pools)) {
      const savedAt = pool.savedAt || Date.now();
      const entry: TripPhotoPool = { ...pool, savedAt };
      // saveTripPool을 부르지 않는다 — 그쪽이 ensureMigrated를 다시 불러 교착이 된다.
      await fs().writeAsStringAsync(`${dir}${poolFileName(entry.tripGroupId)}`, JSON.stringify(entry));
      index[entry.tripGroupId] = { savedAt, photoCount: entry.photos.length };
    }
    await writeIndex(index);
    await storage().removeItem(TRIP_PHOTO_POOL_KEY);
  } catch {
    // 옛 키를 남겨 둔다 — 다음 실행에서 다시 시도된다
  }
}

function ensureMigrated(): Promise<void> {
  if (!migrationPromise) migrationPromise = runMigration();
  return migrationPromise;
}
```

**교착 주의:** `runMigration`은 `saveTripPool`을 부르면 안 된다. `saveTripPool`이 `ensureMigrated()`를 기다리는데 그 프로미스가 아직 해결되지 않아 영원히 멈춘다. 위 코드처럼 파일 쓰기를 직접 한다.

`prunePools`는 순수 함수 구역에 그대로 남는다(verify가 검증한다). 파일 방식에서는 `syncTripPools`가 인덱스로 같은 일을 직접 하므로 호출하지 않는다.

- [ ] **Step 7: 타입 검사와 전체 검증**

Run: `npx tsc --noEmit`
Expected: 오류 0

Run: `npm test`
Expected: 전체 통과

- [ ] **Step 8: 커밋**

```bash
git add src/utils/tripPhotoPool.ts src/utils/tripPhotoPool.verify.ts
git commit -m "refactor(pool): 여행 사진 보관을 단일 키 JSON에서 여행별 파일로

안드로이드 AsyncStorage 6MB 상한에 걸려 보관이 조용히 멈추던 구조를 파일로
바꾸고 여행당 장수 상한(MAX_POOL_PHOTOS)을 제거했다. 여행 수 상한만 폭주
방지용으로 500에 남긴다. 옛 키는 migrateTripPoolsToFiles가 1회 이관한다."
```

---

### Task 2: signalCache 신설

**Files:**
- Create: `src/services/photoAI/signalCache.ts`
- Test: `src/services/photoAI/signalCache.verify.ts`

**Interfaces:**
- Consumes: `PhotoMeta`, `PhotoQuality`, `PhotoSemantic`, `PhotoSignal` (`./types`)
- Produces:
  - `SIGNAL_CACHE_VERSION = 1`
  - `export interface SignalEntry { quality?: PhotoQuality; semantic?: PhotoSemantic; signal?: PhotoSignal }`
  - `export type SignalMap = Record<string, SignalEntry>`
  - `signalKey(photo: { id?: string; uri: string }): string` — 순수
  - `parseSignalMap(raw: string | null): SignalMap` — 순수
  - `applyCached(photos: PhotoMeta[], cache: SignalMap): { hydrated: PhotoMeta[]; missing: PhotoMeta[] }` — 순수
  - `collectSignals(photos: PhotoMeta[]): SignalMap` — 순수
  - `loadSignalCache(tripGroupId: string): Promise<SignalMap>`
  - `saveSignalCache(tripGroupId: string, map: SignalMap): Promise<void>`
  - `deleteSignalCache(tripGroupId: string): Promise<void>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

Create `src/services/photoAI/signalCache.verify.ts`:

```ts
// src/services/photoAI/signalCache.verify.ts
import {
  signalKey,
  parseSignalMap,
  applyCached,
  collectSignals,
  SIGNAL_CACHE_VERSION,
  type SignalMap,
} from './signalCache';
import type { PhotoMeta } from './types';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  if (actual !== expected) { failed++; console.error(`✗ ${msg}\n   expected ${expected}\n   got      ${actual}`); }
  else console.log(`✓ ${msg}`);
}
function eqJson(actual: unknown, expected: unknown, msg: string) {
  eq(JSON.stringify(actual), JSON.stringify(expected), msg);
}

const mk = (id: string | undefined, uri: string): PhotoMeta => ({
  id: id ?? uri, uri, thumbnailUri: null, creationTime: 0, width: 0, height: 0, location: null,
});

// ── signalKey: 자산 id가 1순위 ──
eq(signalKey({ id: 'asset-1', uri: 'ph://x' }), 'asset-1', '자산 id가 있으면 id가 키');
eq(signalKey({ uri: 'file://a.jpg' }), 'file://a.jpg', 'id가 없으면 uri가 키');
eq(signalKey({ id: '', uri: 'file://a.jpg' }), 'file://a.jpg', '빈 id는 없는 것으로 본다');

// ── parseSignalMap: 버전 불일치는 통째로 버린다 ──
eqJson(parseSignalMap(null), {}, 'null이면 빈 캐시');
eqJson(parseSignalMap('nope'), {}, '깨진 JSON이면 빈 캐시');
eqJson(
  parseSignalMap(JSON.stringify({ v: SIGNAL_CACHE_VERSION + 1, entries: { a: { signal: {} } } })),
  {},
  '캐시 버전이 다르면 전부 폐기',
);
eqJson(
  parseSignalMap(JSON.stringify({ v: SIGNAL_CACHE_VERSION, entries: { a: { signal: { faceCount: 2 } } } })),
  { a: { signal: { faceCount: 2 } } },
  '버전이 같으면 항목을 살린다',
);
eqJson(
  parseSignalMap(JSON.stringify({ v: SIGNAL_CACHE_VERSION, entries: { a: 5, b: { signal: {} } } })),
  { b: { signal: {} } },
  '객체가 아닌 항목은 버리고 나머지는 살린다',
);

// ── applyCached: 적중분은 채우고 미적중분만 분석 대상으로 남긴다 ──
{
  const photos = [mk('a', 'ph://a'), mk('b', 'ph://b'), mk('c', 'ph://c')];
  const cache: SignalMap = {
    a: { quality: { passed: true }, signal: { faceCount: 1 } },
    c: { quality: { passed: false } },
  };
  const { hydrated, missing } = applyCached(photos, cache);
  eq(hydrated.length, 3, '적중 여부와 무관하게 전체 장수는 유지');
  eq(hydrated[0].signal?.faceCount, 1, '적중분에 신호가 채워진다');
  eq(hydrated[1].signal, undefined, '미적중분은 비어 있다');
  eq(hydrated[2].quality?.passed, false, '적중분에 품질이 채워진다');
  eqJson(missing.map((p) => p.id), ['b'], '미적중분만 분석 대상');
}
{
  const photos = [mk('a', 'ph://a')];
  const { missing } = applyCached(photos, {});
  eqJson(missing.map((p) => p.id), ['a'], '빈 캐시면 전부 미적중');
}
// 입력 배열을 변형하면 호출부가 같은 배열을 다시 쓸 때 오염된다
{
  const photos = [mk('a', 'ph://a')];
  applyCached(photos, { a: { signal: { faceCount: 9 } } });
  eq(photos[0].signal, undefined, '입력 배열은 변형하지 않는다');
}

// ── collectSignals: 분석 결과를 캐시 항목으로 ──
{
  const analyzed: PhotoMeta[] = [
    { ...mk('a', 'ph://a'), quality: { passed: true }, signal: { faceCount: 2 } },
    mk('b', 'ph://b'), // 신호 없음 — 캐시에 넣지 않는다
  ];
  const map = collectSignals(analyzed);
  eqJson(Object.keys(map), ['a'], '신호가 있는 사진만 캐시에 담는다');
  eq(map.a.signal?.faceCount, 2, '신호가 그대로 담긴다');
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node node_modules/tsx/dist/cli.mjs src/services/photoAI/signalCache.verify.ts`
Expected: FAIL — `signalCache` 모듈 없음

- [ ] **Step 3: 구현한다**

Create `src/services/photoAI/signalCache.ts`:

```ts
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
```

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `node node_modules/tsx/dist/cli.mjs src/services/photoAI/signalCache.verify.ts`
Expected: PASS — 17케이스

- [ ] **Step 5: 타입 검사와 커밋**

Run: `npx tsc --noEmit`
Expected: 오류 0

```bash
git add src/services/photoAI/signalCache.ts src/services/photoAI/signalCache.verify.ts
git commit -m "feat(reco): 사진 신호 캐시 — 같은 사진을 두 번 분석하지 않는다

캐시 키는 자산 id가 1순위다. iOS ph:// uri는 세션이 지나면 바뀌어
uri를 키로 쓰면 같은 사진이 매번 미적중이 된다."
```

---

### Task 3: recoSource 신설

**Files:**
- Create: `src/services/photoAI/recoSource.ts`
- Test: `src/services/photoAI/recoSource.verify.ts`

**Interfaces:**
- Consumes: `PoolPhoto`, `samplePoolPhotos`, `getTripPool` (`../../utils/tripPhotoPool`)
- Produces:
  - `RECO_ANALYZE_MAX = 250`
  - `export interface RecoSourceRecord { medias?: string[]; mediaAssetIds?: Record<string, string>; mediaTimes?: Record<string, number> }`
  - `adaptAlbumToPool(record: RecoSourceRecord): PoolPhoto[]` — 순수
  - `pickForAnalysis(photos: PoolPhoto[], max?: number): PoolPhoto[]` — 순수
  - `sourceFingerprint(photos: PoolPhoto[]): string` — 순수
  - `resolveRecoPhotos(tripGroupId: string, albumRecord?: RecoSourceRecord): Promise<PoolPhoto[]>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

Create `src/services/photoAI/recoSource.verify.ts`:

```ts
// src/services/photoAI/recoSource.verify.ts
import {
  adaptAlbumToPool,
  pickForAnalysis,
  sourceFingerprint,
  RECO_ANALYZE_MAX,
} from './recoSource';
import type { PoolPhoto } from '../../utils/tripPhotoPool';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  if (actual !== expected) { failed++; console.error(`✗ ${msg}\n   expected ${expected}\n   got      ${actual}`); }
  else console.log(`✓ ${msg}`);
}
function eqJson(actual: unknown, expected: unknown, msg: string) {
  eq(JSON.stringify(actual), JSON.stringify(expected), msg);
}

// ── adaptAlbumToPool ──
eqJson(adaptAlbumToPool({}), [], 'medias가 없으면 빈 목록');
eqJson(adaptAlbumToPool({ medias: [] }), [], '빈 medias는 빈 목록');
eqJson(
  adaptAlbumToPool({
    medias: ['file://1.jpg', 'file://2.jpg'],
    mediaAssetIds: { 'file://1.jpg': 'asset-1' },
    mediaTimes: { 'file://1.jpg': 100, 'file://2.jpg': 200 },
  }),
  [
    { id: 'asset-1', uri: 'file://1.jpg', creationTime: 100 },
    { uri: 'file://2.jpg', creationTime: 200 },
  ],
  '자산 id가 있으면 싣고 없으면 uri만 — 표시 순서 유지',
);
// id 없는 항목에 id 키가 들어가면 poolAssetIds가 undefined를 모아 스캔 제외가 오염된다
{
  const got = adaptAlbumToPool({ medias: ['file://x.jpg'] });
  eq('id' in got[0], false, 'id가 없으면 키 자체를 넣지 않는다');
  eq(got[0].creationTime, undefined, '촬영시각이 없으면 넣지 않는다');
}

// ── pickForAnalysis ──
const many: PoolPhoto[] = Array.from({ length: 1000 }, (_, i) => ({ uri: `u${i}`, creationTime: i }));
{
  const got = pickForAnalysis(many, 250);
  eq(got.length, 250, '1000장에서 250장으로 솎는다');
  eq(got[0].uri, 'u0', '첫 장을 포함한다');
  eq(got[got.length - 1].uri, 'u999', '마지막 장을 포함한다');
  eq(new Set(got.map((p) => p.uri)).size, 250, '중복이 없다');
}
{
  const few: PoolPhoto[] = [{ uri: 'a' }, { uri: 'b' }];
  eqJson(pickForAnalysis(few, 250), few, '상한 이하면 그대로');
}
eqJson(pickForAnalysis([], 250), [], '빈 입력은 빈 출력');
eq(pickForAnalysis(many).length, RECO_ANALYZE_MAX, 'max를 생략하면 RECO_ANALYZE_MAX');
eq(RECO_ANALYZE_MAX, 250, '기본 분석 상한은 250');

// ── sourceFingerprint ──
{
  const a: PoolPhoto[] = [{ id: 'x', uri: 'ph://x' }, { uri: 'file://y' }];
  const b: PoolPhoto[] = [{ id: 'x', uri: 'ph://DIFFERENT' }, { uri: 'file://y' }];
  eq(sourceFingerprint(a), sourceFingerprint(b), 'id가 같으면 uri가 달라져도 같은 지문');
}
{
  const a: PoolPhoto[] = [{ uri: 'a' }, { uri: 'b' }];
  const b: PoolPhoto[] = [{ uri: 'b' }, { uri: 'a' }];
  eq(sourceFingerprint(a) === sourceFingerprint(b), false, '순서가 다르면 다른 지문');
}
{
  const a: PoolPhoto[] = [{ uri: 'a' }];
  const b: PoolPhoto[] = [{ uri: 'a' }, { uri: 'b' }];
  eq(sourceFingerprint(a) === sourceFingerprint(b), false, '장수가 다르면 다른 지문');
}
{
  const a: PoolPhoto[] = [{ uri: 'a', creationTime: 1 }];
  const b: PoolPhoto[] = [{ uri: 'a', creationTime: 999 }];
  eq(sourceFingerprint(a), sourceFingerprint(b), '촬영시각은 지문에 영향을 주지 않는다');
}
eq(sourceFingerprint([]), sourceFingerprint([]), '빈 목록도 안정적인 지문');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node node_modules/tsx/dist/cli.mjs src/services/photoAI/recoSource.verify.ts`
Expected: FAIL — `recoSource` 모듈 없음

- [ ] **Step 3: 구현한다**

Create `src/services/photoAI/recoSource.ts`:

```ts
/**
 * 추천 입력 소스 해석기 (설계 §4)
 *
 * 추천 엔진은 사진이 어디서 왔는지 몰라야 한다. 이 모듈이 그 판단을 혼자 진다:
 *   여행 보관 목록(tripPhotoPool)이 있으면 그것 → 없으면 앨범 medias를 어댑트
 *   → 분석 상한까지 균등 간격으로 솎기
 *
 * ⚠️ 순수 함수 구역에는 RN·Expo import이 없어야 한다(verify가 tsx로 돌린다).
 *    tripPhotoPool도 순수 구역만 정적 import하고 getTripPool은 지연 import한다.
 */
import { samplePoolPhotos, type PoolPhoto } from '../../utils/tripPhotoPool';

/**
 * 여행 하나당 실제로 분석할 최대 장수.
 *
 * 보관 상한과 다르다 — 보관은 참조라 장당 125바이트로 싸지만, 분석은 썸네일 생성과
 * 네이티브 추론이라 비싸다. 실기기에서 250장 소요 시간을 측정한 뒤 이 값만 조정한다
 * (설계 §7 실기기 체크리스트). 다른 곳에 같은 숫자를 복제하지 말 것.
 */
export const RECO_ANALYZE_MAX = 250;

/** 앨범 기록에서 이 모듈이 쓰는 부분만. TravelRecord 전체를 끌어오지 않는다. */
export interface RecoSourceRecord {
  medias?: string[];
  mediaAssetIds?: Record<string, string>;
  mediaTimes?: Record<string, number>;
}

/**
 * 앨범 기록 → PoolPhoto[]. 표시 순서를 그대로 유지한다.
 *
 * 자산 id가 없는 복사본은 `id` 키 자체를 넣지 않는다 — poolAssetIds가 id 있는 항목만
 * 모으므로, 빈 값이라도 넣으면 재스캔 제외 집합이 오염된다.
 */
export function adaptAlbumToPool(record: RecoSourceRecord): PoolPhoto[] {
  const medias = record.medias ?? [];
  return medias.map((uri) => {
    const id = record.mediaAssetIds?.[uri];
    const creationTime = record.mediaTimes?.[uri];
    const out: PoolPhoto = { uri };
    if (id) out.id = id;
    if (creationTime !== undefined) out.creationTime = creationTime;
    return out;
  });
}

/**
 * 분석 대상 선별. 무작위가 아니라 균등 간격이다 — 처음과 끝을 포함하고 여행 전 구간을
 * 고르게 훑는다. 앞에서 자르면 첫날 사진만 남는다.
 */
export function pickForAnalysis(photos: PoolPhoto[], max: number = RECO_ANALYZE_MAX): PoolPhoto[] {
  return samplePoolPhotos(photos, max);
}

/**
 * 솎기까지 끝난 목록의 지문(djb2). 이 값이 그대로면 재분석하지 않는다.
 *
 * 자산 id를 1순위로 쓰는 이유: iOS ph:// uri는 세션이 지나면 바뀔 수 있는데, uri로
 * 지문을 내면 사진이 하나도 안 바뀌어도 앱을 다시 켤 때마다 전체 재분석이 돈다.
 * 촬영시각은 넣지 않는다 — 신호에 영향을 주지 않으므로 재분석 사유가 아니다.
 */
export function sourceFingerprint(photos: PoolPhoto[]): string {
  let h = 5381;
  const joined = photos.map((p) => p.id || p.uri).join('|');
  for (let i = 0; i < joined.length; i++) {
    h = ((h << 5) + h + joined.charCodeAt(i)) | 0;
  }
  return `${photos.length}:${(h >>> 0).toString(36)}`;
}

/**
 * 이 여행의 분석 대상 사진을 정한다.
 *
 * pool을 우선하고, 없거나 비었으면 앨범 medias로 폴백한다. getTripPool은 "읽기 실패"와
 * "없음"을 모두 null로 돌려주므로, 일시적 파일 오류에도 앨범이 있으면 추천이 살아남는다.
 */
export async function resolveRecoPhotos(
  tripGroupId: string,
  albumRecord?: RecoSourceRecord,
): Promise<PoolPhoto[]> {
  let photos: PoolPhoto[] = [];
  if (tripGroupId) {
    try {
      const { getTripPool } = await import('../../utils/tripPhotoPool');
      const pool = await getTripPool(tripGroupId);
      if (pool && pool.photos.length > 0) photos = pool.photos;
    } catch {
      // 폴백으로 진행
    }
  }
  if (photos.length === 0 && albumRecord) photos = adaptAlbumToPool(albumRecord);
  return pickForAnalysis(photos);
}
```

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `node node_modules/tsx/dist/cli.mjs src/services/photoAI/recoSource.verify.ts`
Expected: PASS — 18케이스

- [ ] **Step 5: 타입 검사와 커밋**

Run: `npx tsc --noEmit`
Expected: 오류 0

```bash
git add src/services/photoAI/recoSource.ts src/services/photoAI/recoSource.verify.ts
git commit -m "feat(reco): 추천 입력 소스 해석기 — pool 우선, 앨범 폴백

지문을 자산 id 기준으로 낸다. uri로 내면 iOS에서 앱을 다시 켤 때마다
사진이 안 바뀌어도 전체 재분석이 돈다."
```

---

### Task 4: RecoState를 여행 기준으로 개정 + 고착 판정 순수 함수

**Files:**
- Modify: `src/services/photoAI/recoTypes.ts` (`RecoState` `:38-45`)
- Modify: `src/services/photoAI/recoStorage.ts` (`:8-41`)
- Test: `src/services/photoAI/recoTypes.verify.ts` (기존 파일에 추가)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `RecoState`가 `{ tripGroupId, sourceFingerprint, status, cards, dismissedIds, progress?, updatedAt }`
  - `RecoCandidate.photoAssetIds?: string[]`
  - `isPendingStale(state: RecoState, now: number): boolean` — 순수
  - `STALE_PENDING_MS = 3 * 60_000` (recoTypes로 이동)
  - `RECO_SCHEMA_VERSION = 2`
  - `getRecoState(tripGroupId)`, `saveRecoState(state)`, `dismissRecoCard(tripGroupId, cardId)`, `deleteRecoState(tripGroupId)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/services/photoAI/recoTypes.verify.ts` 맨 아래 `if (failed)` 줄 **앞에** 추가한다:

```ts
// ── isPendingStale: 하트비트 기준 고착 판정 ──
// 분석 상한이 250장이 되면서 "시작 후 3분"으로 판정하면 살아 있는 분석을 죽이고
// 무한 재분석이 된다. 마지막 '진행'이 언제였는지로 판정해야 한다.
const baseState = (over: Partial<RecoState>): RecoState => ({
  tripGroupId: 'g1',
  sourceFingerprint: '3:abc',
  status: 'pending',
  cards: [],
  dismissedIds: [],
  updatedAt: 0,
  ...over,
});

eq(isPendingStale(baseState({ status: 'ready', updatedAt: 0 }), 999_999), false,
  'ready 상태는 고착이 아니다');
eq(isPendingStale(baseState({ status: 'unavailable', updatedAt: 0 }), 999_999), false,
  'unavailable 상태는 고착이 아니다');
eq(isPendingStale(baseState({ updatedAt: 0 }), STALE_PENDING_MS - 1), false,
  '한계 시간 이내면 고착이 아니다');
eq(isPendingStale(baseState({ updatedAt: 0 }), STALE_PENDING_MS + 1), true,
  '한계 시간을 넘고 진행이 없으면 고착');
// 핵심: 진행이 계속되면 총 경과가 아무리 길어도 고착이 아니다
eq(
  isPendingStale(baseState({ updatedAt: 10 * 60_000, progress: { done: 120, total: 250 } }), 10 * 60_000 + 1_000),
  false,
  '10분이 지나도 마지막 진행이 최근이면 살아 있는 분석',
);
eq(
  isPendingStale(baseState({ updatedAt: 10 * 60_000, progress: { done: 120, total: 250 } }), 10 * 60_000 + STALE_PENDING_MS + 1),
  true,
  '진행이 멈춘 채 한계 시간을 넘기면 고착',
);
eq(isPendingStale(baseState({ updatedAt: 1_000 }), 500), false,
  '미래 시각이 저장돼 있어도 고착으로 보지 않는다(시계 변경 방어)');
```

import 문에 `isPendingStale`, `STALE_PENDING_MS`, `type RecoState`를 추가한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `node node_modules/tsx/dist/cli.mjs src/services/photoAI/recoTypes.verify.ts`
Expected: FAIL — `isPendingStale` 없음

- [ ] **Step 3: recoTypes를 개정한다**

`src/services/photoAI/recoTypes.ts`에서 `RecoCandidate`에 필드를 추가한다:

```ts
export interface RecoCandidate {
  id: string;                 // `${viewType}_${concept}_${순번}` — 결정론적
  viewType: RecoViewType;
  concept: RecoConcept;
  photoUris: string[];        // 프리필 순서
  /**
   * photoUris와 같은 순서·같은 길이의 자산 id. 없는 장은 빈 문자열.
   *
   * 왜 필요한가: pool 사진은 갤러리 참조라 iOS ph:// uri가 세션이 지나면 만료된다.
   * 카드가 저장된 뒤 앱을 다시 켜고 수락하면 uri만으로는 복사가 전부 실패한다.
   */
  photoAssetIds?: string[];
  blogSeeds?: RecoBlogSeed[]; // viewType==='blog' 전용
  score: number;              // 0~1+, 재순위 입력
  reasonKey: string;          // i18n 키: `reco.reason.${viewType}_${concept}`
  reasonParams?: Record<string, string | number>;
}
```

`RecoState`를 교체한다:

```ts
export interface RecoState {
  tripGroupId: string;
  /** recoSource.sourceFingerprint의 결과. 이 값이 그대로면 재분석하지 않는다 */
  sourceFingerprint: string;
  status: 'pending' | 'ready' | 'unavailable';
  cards: RecoCard[];
  dismissedIds: string[];
  /** 분석 진행 하트비트. 엔진이 배치마다 갱신한다(설계 §6) */
  progress?: { done: number; total: number };
  updatedAt: number;
}

/**
 * 마지막 진행 이후 이만큼 지나면 죽은 분석으로 본다.
 *
 * 예전에는 "분석 시작 후 3분"이었다. 분석 상한이 250장이 되면서 정상 분석이 3분을
 * 넘길 수 있게 됐고, 그러면 살아 있는 분석을 죽이고 재시작 → 다시 초과 →
 * 무한 재분석 루프가 된다. 엔진이 배치마다 updatedAt을 갱신하므로 판정 기준을
 * "마지막 진행 이후 무변화 시간"으로 바꿨다.
 */
export const STALE_PENDING_MS = 3 * 60_000;

/**
 * pending이 죽었는지 판정한다.
 * now < updatedAt(기기 시계가 뒤로 갔거나 저장 직후)은 고착이 아니다 — 음수 경과를
 * 고착으로 보면 시계 변경만으로 재분석이 돈다.
 */
export function isPendingStale(state: RecoState, now: number): boolean {
  if (state.status !== 'pending') return false;
  return now - state.updatedAt > STALE_PENDING_MS;
}
```

`mediasFingerprint`는 **삭제하지 않는다** — 다른 곳에서 쓰지 않게 되지만, 지우면 이번 변경 범위 밖의 import가 깨질 수 있고 `recoTypes.verify.ts`의 기존 4케이스도 그것을 검증한다. 마지막 사용처가 사라진 뒤 별도로 판단한다.

- [ ] **Step 4: recoStorage를 개정한다**

`src/services/photoAI/recoStorage.ts`의 `:8-41`을 교체한다:

```ts
/**
 * 스키마 버전 2 (2026-09-01) — 키가 albumRecordId에서 tripGroupId로 바뀌었고
 * mediasFingerprint가 sourceFingerprint로 바뀌었다. v1 항목은 읽히지 않고 버려진다.
 * FORMAT_RECO_ENABLED가 false인 채로만 배포됐으므로 실제 사용자 데이터는 없다.
 */
export const RECO_SCHEMA_VERSION = 2;
const stateKey = (tripGroupId: string) => `@photoAI/reco/${tripGroupId}`;
const LOG_KEY = '@photoAI/recoLog';
const LOG_MAX = 500;

interface Envelope<T> { version: number; updatedAt: number; payload: T }

async function readEnvelope<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    if (env.version !== RECO_SCHEMA_VERSION) return null;
    return env.payload;
  } catch { return null; }
}
async function writeEnvelope<T>(key: string, payload: T): Promise<void> {
  const env: Envelope<T> = { version: RECO_SCHEMA_VERSION, updatedAt: Date.now(), payload };
  await AsyncStorage.setItem(key, JSON.stringify(env));
}

export function getRecoState(tripGroupId: string): Promise<RecoState | null> {
  return readEnvelope<RecoState>(stateKey(tripGroupId));
}
export function saveRecoState(state: RecoState): Promise<void> {
  return writeEnvelope(stateKey(state.tripGroupId), state);
}

/** 여행 카드가 삭제될 때 추천 상태도 지운다(설계 §6 — 청소는 pool과 짝이다) */
export async function deleteRecoState(tripGroupId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(stateKey(tripGroupId));
  } catch { /* 무시 */ }
}

/** 카드 닫기 — dismissedIds에 추가 (재노출 방지) */
export async function dismissRecoCard(tripGroupId: string, cardId: string): Promise<void> {
  const state = await getRecoState(tripGroupId);
  if (!state || state.dismissedIds.includes(cardId)) return;
  await saveRecoState({ ...state, dismissedIds: [...state.dismissedIds, cardId] });
}
```

- [ ] **Step 5: 테스트 통과를 확인한다**

Run: `node node_modules/tsx/dist/cli.mjs src/services/photoAI/recoTypes.verify.ts`
Expected: PASS

`npx tsc --noEmit`은 이 시점에 **아직 실패한다** — `recoEngine`·`RecoSection`이 옛 필드를 쓴다. Task 5·6에서 해소된다.

- [ ] **Step 6: 커밋**

```bash
git add src/services/photoAI/recoTypes.ts src/services/photoAI/recoStorage.ts src/services/photoAI/recoTypes.verify.ts
git commit -m "refactor(reco): 추천 상태를 여행 기준으로 + 하트비트 고착 판정

시작 후 3분으로 고착을 판정하면 250장 분석에서 살아 있는 분석을 죽이고
무한 재분석이 된다. 마지막 진행 이후 무변화 시간으로 바꿨다.
카드에 photoAssetIds를 실어 ph:// 만료 후에도 수락이 동작하게 한다."
```

---

### Task 5: recoEngine을 pool 입력으로 개정

**Files:**
- Modify: `src/services/photoAI/recoEngine.ts` (전체)

**Interfaces:**
- Consumes: `sourceFingerprint` (Task 3), `loadSignalCache`·`saveSignalCache`·`applyCached`·`collectSignals` (Task 2), `RecoState` (Task 4)
- Produces: `runFormatReco(input: FormatRecoInput): Promise<void>` where `FormatRecoInput = { tripGroupId: string; photos: PoolPhoto[]; pastRecords: { viewType?: string }[] }`

- [ ] **Step 1: 썸네일 확보 함수를 추가한다**

`src/services/photoAI/recoEngine.ts` 상단 import 아래에 추가한다:

```ts
/**
 * pool 사진(갤러리 참조) → 네이티브에 넘길 file:// 썸네일.
 *
 * 확보 순서는 copyTripCover와 같다: localUri → 자산 id 재조회 → 원본 uri.
 * 각 경로마다 리사이즈를 먼저 시도한다 — 리사이즈가 content://·HEIC를 통과시키고
 * 결과가 앱 캐시라 항상 읽힌다.
 *
 * ⚠️ iOS의 localUri는 PhotoKit 캐시 경로라 만료된다. "있으니 자산 재조회를 건너뛴다"로
 *    만들면 멀쩡한 사진도 전부 실패한다(2026-09-01 실제 발생).
 *
 * 네트워크 다운로드는 하지 않는다(shouldDownloadFromNetwork: false) — 백그라운드
 * 분석이 로밍 데이터와 배터리를 쓰면 안 된다. iCloud 오프로드 사진은 여기서 실패하고
 * 호출부가 건너뛴다.
 */
async function materializeForAnalysis(photo: PhotoMeta): Promise<string | null> {
  const candidates: string[] = [];
  if (photo.id && photo.id !== photo.uri) {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(photo.id, { shouldDownloadFromNetwork: false });
      if (info.localUri) candidates.push(info.localUri);
      if (info.uri && info.uri !== info.localUri) candidates.push(info.uri);
    } catch { /* 자산 조회 실패 — 원본 uri로 시도한다 */ }
  }
  candidates.push(photo.uri);

  for (const uri of candidates) {
    const thumb = await makeThumbnail(uri);
    if (thumb) return thumb;
  }
  return null;
}
```

필요한 import를 추가한다:

```ts
import { makeThumbnail } from './qualityAssessment';
import { applyCached, collectSignals, loadSignalCache, saveSignalCache } from './signalCache';
import { sourceFingerprint } from './recoSource';
import type { PoolPhoto } from '../../utils/tripPhotoPool';
```

- [ ] **Step 2: 입력 타입과 본문을 교체한다**

`FormatRecoInput`과 `runFormatReco` 전체를 교체한다:

```ts
export interface FormatRecoInput {
  tripGroupId: string;
  /** 이미 pickForAnalysis로 솎인 목록 (recoSource가 만든다) */
  photos: PoolPhoto[];
  pastRecords: { viewType?: string }[];
}

const MIN_PHOTOS = 4;      // 이보다 적으면 추천할 게 없다
const GPS_BATCH = 8;       // getAssetInfoAsync 동시 호출 상한 (OOM 방지)
const ANALYZE_BATCH = 8;   // 썸네일+네이티브 분석 배치. 하트비트 갱신 주기이기도 하다

export async function runFormatReco(input: FormatRecoInput): Promise<void> {
  // prev는 실패 경로(catch)에서도 읽어야 한다 — 닫음 기록은 재분석 실패에도 유지가 계약이다.
  let prev: RecoState | null = null;
  const fingerprint = sourceFingerprint(input.photos);
  try {
    if (!FORMAT_RECO_ENABLED || !isPhotoVisionAvailable) return;
    if (input.photos.length < MIN_PHOTOS) return;

    prev = await getRecoState(input.tripGroupId);
    if (prev && prev.sourceFingerprint === fingerprint && prev.status === 'ready') return; // 이미 최신

    const pending: RecoState = {
      tripGroupId: input.tripGroupId,
      sourceFingerprint: fingerprint,
      status: 'pending',
      cards: [],
      dismissedIds: prev?.dismissedIds ?? [], // 닫음 기록은 재분석에도 유지
      progress: { done: 0, total: input.photos.length },
      updatedAt: Date.now(),
    };
    await saveRecoState(pending);

    // 1) PoolPhoto → PhotoMeta. id가 없으면 uri를 id로 쓴다(후보 생성기가 id로 되짚는다)
    let photos: PhotoMeta[] = input.photos.map((p) => ({
      id: p.id || p.uri,
      uri: p.uri,
      thumbnailUri: null,
      creationTime: p.creationTime ?? 0,
      width: 0,
      height: 0,
      location: null,
    }));

    // 2) GPS best-effort (자산 id가 있는 것만)
    for (let i = 0; i < photos.length; i += GPS_BATCH) {
      const batch = photos.slice(i, i + GPS_BATCH);
      await Promise.all(batch.map(async (p) => {
        if (p.id === p.uri) return; // 자산 id가 없는 앨범 복사본
        try {
          const info = await MediaLibrary.getAssetInfoAsync(p.id, { shouldDownloadFromNetwork: false });
          if (info.location) p.location = { latitude: info.location.latitude, longitude: info.location.longitude };
          if (!p.creationTime && info.creationTime) p.creationTime = info.creationTime;
        } catch { /* GPS 없음 — 시간 그룹핑으로 진행 */ }
      }));
    }

    // 3) 촬영시각 결손 처리 — 섞인 앨범만 결손분을 뺀다.
    //    전부 0이면 빼지 않는다(dayIndex가 전부 1이 되어 결함이 생기지 않고,
    //    여기서 전부 빼면 멀쩡히 되던 추천까지 사라진다).
    const timedCount = photos.filter((p) => p.creationTime > 0).length;
    if (timedCount > 0 && timedCount < photos.length) {
      photos = photos.filter((p) => p.creationTime > 0);
      if (photos.length < MIN_PHOTOS) {
        await saveRecoState({ ...pending, status: 'unavailable', progress: undefined, updatedAt: Date.now() });
        return;
      }
    }

    // 4) 신호 캐시 적용 → 미적중분만 분석
    const cache = await loadSignalCache(input.tripGroupId);
    const { hydrated, missing } = applyCached(photos, cache);
    photos = hydrated;

    const byId = new Map(photos.map((p) => [p.id, p]));
    let done = photos.length - missing.length;
    await saveRecoState({ ...pending, progress: { done, total: photos.length }, updatedAt: Date.now() });

    for (let i = 0; i < missing.length; i += ANALYZE_BATCH) {
      const batch = missing.slice(i, i + ANALYZE_BATCH);
      // 썸네일 확보 — 실패한 장은 분석에서 빠지고 quality.passed=true로 통과시킨다
      const withThumb = await Promise.all(
        batch.map(async (p) => ({ photo: p, thumb: await materializeForAnalysis(p) })),
      );
      for (const { photo, thumb } of withThumb) {
        const target = byId.get(photo.id);
        if (!target) continue;
        if (thumb) target.thumbnailUri = thumb;
        else target.quality = { passed: true };
      }
      const analyzable = withThumb.filter((x) => x.thumb) as { photo: PhotoMeta; thumb: string }[];
      if (analyzable.length > 0) {
        const assessed = await assessPhotoQuality(analyzable.map((x) => byId.get(x.photo.id)!));
        if (assessed.ok && assessed.data) {
          for (const p of assessed.data) byId.set(p.id, p);
        }
      }
      done += batch.length;
      // 하트비트 — 이 갱신이 없으면 250장 분석이 고착으로 오판된다
      await saveRecoState({ ...pending, progress: { done, total: photos.length }, updatedAt: Date.now() });
    }

    photos = Array.from(byId.values());

    // 갤러리 권한이 철회됐거나 전량 iCloud 오프로드면 신호가 하나도 안 잡힌다.
    // 그 상태로 후보를 만들면 라벨·색감 없이 규칙이 돌아 근거 없는 카드가 나온다.
    // 캐시 적중분까지 세어 하나도 없으면 추천하지 않는다(섹션 미노출).
    // 권한 팝업은 띄우지 않는다 — 조용히 물러나는 것이 이 앱의 정책이다.
    if (photos.every((p) => !p.signal && !p.semantic)) {
      await saveRecoState({ ...pending, status: 'unavailable', progress: undefined, updatedAt: Date.now() });
      return;
    }

    await saveSignalCache(input.tripGroupId, { ...cache, ...collectSignals(photos) });

    // 5) 스팟 그룹핑 + 컨셉 판정
    const groups = groupPhotosBySpot(photos);
    const concepts = new Map<string, ConceptScores>(
      photos.map((p) => [p.id, ruleConceptClassifier(p)]),
    );

    // 6) 후보 생성 + 개인화 재순위
    const cands = [
      ...stripCandidates(photos, groups, concepts, basicSlotCounts()),
      ...feedCandidates(photos, concepts),
      ...blogCandidates(photos, groups, concepts),
    ];
    const ranked = rankCandidates(cands, buildStylePrior(input.pastRecords));

    // 7) 카드에 자산 id를 실어 둔다 — ph:// 만료 후에도 수락이 동작해야 한다
    const assetIdByUri = new Map(photos.map((p) => [p.uri, p.id === p.uri ? '' : p.id]));

    await saveRecoState({
      ...pending,
      status: ranked.length > 0 ? 'ready' : 'unavailable',
      cards: ranked.map((c) => ({
        ...c,
        photoAssetIds: c.photoUris.map((u) => assetIdByUri.get(u) ?? ''),
        createdAt: Date.now(),
      })),
      progress: undefined,
      updatedAt: Date.now(),
    });
  } catch {
    try {
      await saveRecoState({
        tripGroupId: input.tripGroupId,
        sourceFingerprint: fingerprint,
        status: 'unavailable',
        cards: [],
        dismissedIds: prev?.dismissedIds ?? [],
        updatedAt: Date.now(),
      });
    } catch { /* 저장까지 실패하면 포기 */ }
  }
}
```

`assessPhotoQuality` 호출은 이미 썸네일이 채워진 `PhotoMeta`를 받으므로 내부에서 썸네일을 다시 만들지 않는다(`qualityAssessment.ts:127`이 `p.thumbnailUri ?? makeThumbnail(...)`이다).

- [ ] **Step 3: 타입 검사**

Run: `npx tsc --noEmit`
Expected: `RecoSection.tsx`·`AlbumCreateScreen.tsx`의 옛 호출부 오류만 남는다(Task 6·7에서 해소)

- [ ] **Step 4: 커밋**

```bash
git add src/services/photoAI/recoEngine.ts
git commit -m "refactor(reco): 엔진 입력을 pool 사진으로 — 소스를 모르게 만든다

신호 캐시를 붙여 미적중분만 분석하고, 배치마다 하트비트를 갱신한다.
썸네일 확보는 localUri→자산 재조회→원본 순서로 시도하고 각 단계마다
리사이즈를 먼저 한다. iOS localUri는 만료되므로 있다고 건너뛰면 안 된다."
```

---

### Task 6: RecoSection을 여행 기준으로 개정

**Files:**
- Modify: `src/components/trip/RecoSection.tsx`
- Modify: `src/i18n/locales/ko.ts` (`reco` 블록에 키 추가)
- Modify: `src/i18n/locales/en.ts` (같은 키)

**Interfaces:**
- Consumes: `resolveRecoPhotos`·`sourceFingerprint` (Task 3), `isPendingStale` (Task 4), `runFormatReco` (Task 5)
- Produces: `RecoSection` props가 `{ tripGroupId: string; albumRecord?: TravelRecord; pastRecords: { viewType?: string }[] }`

- [ ] **Step 1: i18n 키를 추가한다**

`src/i18n/locales/ko.ts`의 `reco` 블록에 추가한다:

```ts
    analyzingProgress: 'AI가 사진을 보고 있어요… {{done}}/{{total}}',
    preparing: '사진을 준비하고 있어요…',
    partialCopy: '{{count}}장은 iCloud에 있어 제외했어요.',
```

`src/i18n/locales/en.ts`의 같은 블록에 추가한다:

```ts
    analyzingProgress: 'Looking through your photos… {{done}}/{{total}}',
    preparing: 'Getting your photos ready…',
    partialCopy: '{{count}} photo(s) skipped — still in iCloud.',
```

- [ ] **Step 2: props와 load를 교체한다**

`Props`와 `load`, 폴링, `onDismiss`를 교체한다:

```ts
interface Props {
  tripGroupId: string;
  /** pool이 없을 때 폴백 소스로 쓸 앨범 기록 (있으면 전달) */
  albumRecord?: TravelRecord;
  /** 개인화 prior 재료 — 내 과거 기록의 viewType 목록 */
  pastRecords: { viewType?: string }[];
}

export default function RecoSection({ tripGroupId, albumRecord, pastRecords }: Props) {
```

`load`를 교체한다:

```ts
  const load = useCallback(async () => {
    if (!FORMAT_RECO_ENABLED || !isPhotoVisionAvailable) return; // 꺼져 있으면 저장소도 읽지 않는다
    const s = await getRecoState(tripGroupId);
    const photos = await resolveRecoPhotos(tripGroupId, albumRecord);
    const fp = sourceFingerprint(photos);

    // 재분석 트리거는 두 가지다.
    //  (1) 소스가 바뀌었다 = 지문 불일치.
    //  (2) 지문은 같은데 마지막 진행 이후 STALE_PENDING_MS가 지났다 = 죽은 분석.
    //      진행 하트비트 덕분에 250장 분석이 오래 걸려도 살아 있으면 죽이지 않는다.
    const fingerprintChanged = !!s && s.sourceFingerprint !== fp;
    const stalePending = !!s && isPendingStale(s, Date.now());
    if (!s || fingerprintChanged || stalePending) {
      setState(s ? { ...s, status: 'pending', cards: [] } : null);
      runFormatReco({ tripGroupId, photos, pastRecords: pastRecordsRef.current })
        .then(() => getRecoState(tripGroupId))
        .then((next) => {
          // 엔진에는 "이번 지문에 대해 아무것도 저장하지 않고" 끝나는 경로가 있다
          // (photos.length < MIN_PHOTOS 조기 return). 그 경우 다시 읽은 state는
          // 갱신되지 않은 옛 것이라, 그대로 setState하면 이미 지워진 사진의 카드가
          // 되살아나고 수락 시 존재하지 않는 uri가 프리필된다.
          if (!next) { setState(null); return; }
          if (next.sourceFingerprint !== fp) {
            setState({ ...next, sourceFingerprint: fp, status: 'unavailable', cards: [] });
            return;
          }
          setState(next);
        })
        .catch(() => {});
      return;
    }
    setState(s);
  }, [tripGroupId, albumRecord]);
```

폴링과 `onDismiss`의 `albumRecord.id`를 `tripGroupId`로 바꾼다:

```ts
  useEffect(() => {
    if (state?.status !== 'pending') return;
    const timer = setInterval(() => { getRecoState(tripGroupId).then((s) => s && setState(s)); }, 5000);
    return () => clearInterval(timer);
  }, [state?.status, tripGroupId]);
```

```ts
  const onDismiss = useCallback((card: RecoCard) => {
    dismissRecoCard(tripGroupId, card.id).catch(() => {});
    setState((s) => (s ? { ...s, dismissedIds: [...s.dismissedIds, card.id] } : s));
    appendRecoLog({
      event: 'dismiss', cardId: card.id, viewType: card.viewType, concept: card.concept,
      photoCountSuggested: card.photoUris.length, ts: Date.now(),
    }).catch(() => {});
  }, [tripGroupId]);
```

- [ ] **Step 3: 진행률 표시로 바꾼다**

`state.status === 'pending'` 분기를 교체한다:

```ts
      {state.status === 'pending' ? (
        <Text style={st.analyzing}>
          {state.progress && state.progress.total > 0
            ? t('reco.analyzingProgress', { done: state.progress.done, total: state.progress.total })
            : t('reco.analyzing')}
        </Text>
      ) : (
```

- [ ] **Step 4: import를 갱신한다**

```ts
import { resolveRecoPhotos, sourceFingerprint } from '../../services/photoAI/recoSource';
import { isPendingStale } from '../../services/photoAI/recoTypes';
```

`mediasFingerprint` import와 파일 상단의 `STALE_PENDING_MS` 상수 정의(`:32-44`)를 삭제한다 — `recoTypes`로 옮겼다.

- [ ] **Step 5: 타입 검사**

Run: `npx tsc --noEmit`
Expected: `TripDetailScreen.tsx`·`AlbumCreateScreen.tsx` 오류만 남는다

- [ ] **Step 6: 커밋**

```bash
git add src/components/trip/RecoSection.tsx src/i18n/locales/ko.ts src/i18n/locales/en.ts
git commit -m "refactor(reco): 섹션이 여행 id를 받고 소스 판단은 recoSource에 맡긴다

고착 판정을 하트비트 기준으로 바꾸고 진행률을 표시한다. 250장 분석이
길어질 때 사용자가 멈춘 것으로 오해하지 않는다."
```

---

### Task 7: 화면 배선 — TripDetail 게이트와 AlbumCreate write-through

**Files:**
- Modify: `src/screens/TripDetailScreen.tsx` (`:441-445`, `:783-785`)
- Modify: `src/screens/AlbumCreateScreen.tsx` (`:479-487`, `:526-533`)

**Interfaces:**
- Consumes: `RecoSection` 새 props (Task 6), `saveTripPool` (Task 1), `adaptAlbumToPool` (Task 3)
- Produces: 없음

- [ ] **Step 1: TripDetail의 게이트를 바꾼다**

`:783-785`를 교체한다:

```tsx
        {/* AI 형식 추천 — 게스트 모드(타인 여행)면 미노출.
            앨범이 없어도 뜬다(2026-09-01) — 불러오기로 만든 카드는 사진첩이 없기 때문이다.
            앨범이 있으면 pool이 비었을 때의 폴백 소스로 넘긴다. */}
        {!isGuest && currentGroup && (
          <RecoSection
            tripGroupId={currentGroup.id}
            albumRecord={albumRecordForReco}
            pastRecords={recoPastRecords}
          />
        )}
```

`albumRecordForReco`의 `useMemo`(`:441-445`)는 그대로 둔다 — 이제 폴백 소스로 쓰인다. 주석 한 줄만 고친다:

```ts
  // 이 여행의 앨범 기록. 여러 개면 최신 것. pool이 비었을 때 추천의 폴백 소스로 쓴다.
```

- [ ] **Step 2: AlbumCreate의 추천 호출을 pool 기록으로 바꾼다**

`:479-487`(이어 담기)을 교체한다:

```ts
        // 앨범 사진을 pool에 기록한다 — 추천 입력이 pool로 단일화됐다(2026-09-01).
        // 분석은 여행 상세 진입 시 lazy로 돈다. 여기서 돌리지 않는다.
        if (tripGroupId) {
          saveTripPool({
            tripGroupId,
            recordId: appendTarget.id,
            country: appendTarget.country ?? '',
            countryName: appendTarget.countryName ?? '',
            countryFlag: appendTarget.countryFlag ?? '',
            title: albumTitle,
            startDate: merged.startDate ?? '',
            endDate: merged.endDate ?? '',
            photos: adaptAlbumToPool(merged),
          }).catch(() => {});
        }
```

`:526-533`(신규 생성)을 교체한다:

```ts
      // 앨범 사진을 pool에 기록한다 (위와 같은 이유). 분석은 여행 상세 진입 시.
      {
        const gid = tripGroupId ?? tripGroups.find((g) => g.records.includes(newRec.id))?.id;
        if (gid) {
          saveTripPool({
            tripGroupId: gid,
            recordId: newRec.id,
            country: newRec.country ?? '',
            countryName: newRec.countryName ?? '',
            countryFlag: newRec.countryFlag ?? '',
            title: albumTitle,
            startDate: newRec.startDate ?? '',
            endDate: newRec.endDate ?? '',
            photos: adaptAlbumToPool(newRec),
          }).catch(() => {});
        }
      }
```

import를 교체한다 — `runFormatReco`를 지우고 추가한다:

```ts
import { saveTripPool } from '../utils/tripPhotoPool';
import { adaptAlbumToPool } from '../services/photoAI/recoSource';
```

**주의:** 위 코드의 `tripGroups.find(...)`는 상태 갱신이 아직 반영되지 않아 방금 만든 그룹을 못 찾을 수 있다. `addTripGroup`은 과거여행 작업에서 **생성된 `TripGroup`을 반환하도록 바뀌었으므로 반환값을 쓴다.** `:514-521`의 분기를 아래로 고쳐 `gid`를 확실히 얻는다:

```ts
      let recoGroupId: string | undefined = tripGroupId;
      if (tripGroupId) {
        const g = tripGroups.find((x) => x.id === tripGroupId);
        if (g && !g.records.includes(newRec.id)) updateTripGroup(tripGroupId, { records: [...g.records, newRec.id] });
        else if (!g) recoGroupId = addTripGroup({ title: albumTitle, records: [newRec.id], coverRecordId: newRec.id }).id;
      } else {
        recoGroupId = addTripGroup({ title: albumTitle, records: [newRec.id], coverRecordId: newRec.id }).id;
      }
```

그리고 위 pool 기록 블록의 `const gid = ...` 줄을 `const gid = recoGroupId;`로 바꾼다.

- [ ] **Step 3: 타입 검사와 전체 검증**

Run: `npx tsc --noEmit`
Expected: 오류 0 (여기서 전부 해소돼야 한다)

Run: `npm test`
Expected: 전체 통과

- [ ] **Step 4: 커밋**

```bash
git add src/screens/TripDetailScreen.tsx src/screens/AlbumCreateScreen.tsx
git commit -m "feat(reco): 앨범 없는 여행에도 추천이 뜬다

TripDetail 게이트를 앨범 존재에서 여행 그룹 존재로 바꿨다. 불러오기로
만든 카드는 사진첩이 없어 추천이 영영 안 뜨던 구멍이 막힌다.
AlbumCreate는 추천을 직접 돌리지 않고 pool에 기록만 한다."
```

---

### Task 8: 수락 시 원본 복사 + 진행 오버레이

**Files:**
- Modify: `src/components/trip/RecoSection.tsx` (`onAccept`, 오버레이 렌더)

**Interfaces:**
- Consumes: `copyTripOriginals(tripId, items, onProgress)` (`../../utils/importPhotoStore`)
- Produces: 없음

- [ ] **Step 1: 복사 상태를 추가한다**

컴포넌트 상단 훅 구역에 추가한다:

```ts
  // 수락 시 원본 복사 진행 상태. null이면 오버레이 미표시.
  const [copying, setCopying] = useState<{ done: number; total: number } | null>(null);
```

- [ ] **Step 2: onAccept를 교체한다**

```ts
  const onAccept = useCallback(async (card: RecoCard) => {
    if (copying) return; // 중복 탭 방지
    appendRecoLog({
      event: 'accept', cardId: card.id, viewType: card.viewType, concept: card.concept,
      photoCountSuggested: card.photoUris.length, ts: Date.now(),
    }).catch(() => {});

    // pool 사진은 갤러리 참조라 작성 화면에 그대로 넘길 수 없다. 여기서 복사해
    // 로컬 file:// 배열로 만들어 넘긴다 — 작성 화면 3종의 기존 계약을 건드리지 않는다.
    // 자산 id를 우선 쓴다: iOS ph:// uri는 카드가 저장된 뒤 만료될 수 있다.
    setCopying({ done: 0, total: card.photoUris.length });
    let uris: string[] = [];
    let srcIndexes: number[] = [];
    try {
      const items = card.photoUris.map((uri, i) => ({
        id: card.photoAssetIds?.[i] || undefined,
        uri,
      }));
      const res = await copyTripOriginals(
        `reco-${card.id}`,
        items,
        (done, total) => setCopying({ done, total }),
      );
      uris = res.uris;
      srcIndexes = res.srcIndexes;
    } catch {
      // 아래 실패 처리로 떨어진다
    }
    setCopying(null);

    if (uris.length === 0) {
      Alert.alert(t('trip.noticeTitle'), t('reco.partialCopy', { count: card.photoUris.length }));
      return;
    }
    const skipped = card.photoUris.length - uris.length;
    if (skipped > 0) Alert.alert(t('trip.noticeTitle'), t('reco.partialCopy', { count: skipped }));

    if (card.viewType === 'feed') {
      navigation.navigate('NewRecord', { recoPrefill: { cardId: card.id, medias: uris } });
    } else if (card.viewType === 'blog') {
      // 블로그 씨앗의 uris는 원본 uri 기준이라 복사본으로 갈아끼운다.
      // srcIndexes[i] = uris[i]가 원래 몇 번째 사진이었는지 — 실패분이 빠져 있어 필요하다.
      const byOriginal = new Map<string, string>();
      srcIndexes.forEach((srcIdx, i) => byOriginal.set(card.photoUris[srcIdx], uris[i]));
      const seeds = (card.blogSeeds ?? []).map((seed) =>
        seed.kind === 'images'
          ? { ...seed, uris: seed.uris.map((u) => byOriginal.get(u)).filter((u): u is string => !!u) }
          : seed,
      ).filter((seed) => seed.kind !== 'images' || seed.uris.length > 0);
      navigation.navigate('BlogRecord', { recoPrefill: { cardId: card.id, seeds } });
    } else {
      navigation.navigate('CutRecord', { recoPrefill: { cardId: card.id, photos: uris } });
    }
  }, [navigation, copying, t]);
```

import를 추가한다:

```ts
import { Alert } from 'react-native';
import { copyTripOriginals } from '../../utils/importPhotoStore';
```

- [ ] **Step 3: 오버레이를 렌더한다**

`return` 안, 최상위 `<View style={st.wrap}>`의 마지막 자식으로 추가한다:

```tsx
      {/* 복사 진행 오버레이.
          ⚠️ Modal을 쓰지 않는다 — 짧은 수명 로딩 오버레이를 Modal로 만들면 껍데기가
             남아 화면 전체 터치가 먹통이 되고 앱 재시작으로만 복구된다(이 저장소 실사고). */}
      {copying && (
        <View style={st.copyOverlay} pointerEvents="auto">
          <Text style={st.copyText}>
            {t('reco.preparing')} {copying.total > 0 ? `${copying.done}/${copying.total}` : ''}
          </Text>
        </View>
      )}
```

스타일을 추가한다:

```ts
  copyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,15,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  copyText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
```

- [ ] **Step 4: 타입 검사와 전체 검증**

Run: `npx tsc --noEmit`
Expected: 오류 0

Run: `npm test`
Expected: 전체 통과

- [ ] **Step 5: 커밋**

```bash
git add src/components/trip/RecoSection.tsx
git commit -m "feat(reco): 수락 시 원본 복사 + 진행 오버레이

pool 사진은 갤러리 참조라 작성 화면에 그대로 못 넘긴다. 탭 직후 복사해
로컬 배열로 만들어 넘기므로 작성 화면 3종은 무변경이다. 오버레이는
Modal이 아니라 절대위치 View다 — Modal 껍데기가 남으면 터치가 먹통이 된다."
```

---

### Task 9: 카드 삭제 시 청소 배선 + 체크리스트 갱신

**Files:**
- Modify: `src/screens/TravelImportScreen.tsx` (`syncTripPools` 호출 지점)
- Modify: `docs/superpowers/specs/2026-08-31-photo-ai-format-reco-device-checklist.md`

**Interfaces:**
- Consumes: `deleteRecoState` (Task 4), `deleteSignalCache` (Task 2), `syncTripPools` (Task 1)
- Produces: 없음

- [ ] **Step 1: 청소 지점을 확인한다**

Run: `grep -n "syncTripPools" src/screens/TravelImportScreen.tsx`
Expected: `:676` 한 줄 — `const pools = await syncTripPools(tripGroupsRef.current.map((g) => g.id));`
바로 다음 줄(`:677`)이 `for (const id of poolAssetIds(pools)) importedIds.add(id);`다.
이 두 줄이 "제외 집합 재구성" 지점이며, 파일 분산 후에도 `syncTripPools`가 같은 맵을 돌려주므로 그대로 동작한다.

- [ ] **Step 2: 추천 상태·신호 캐시도 함께 지운다**

`:677`의 `for (const id of poolAssetIds(pools)) ...` **바로 뒤에** 추가한다.
변수명은 위 실측대로 `pools`와 `tripGroupsRef.current`를 쓴다:

```ts
      // pool이 사라진 여행은 추천 상태와 신호 캐시도 의미가 없다 — 같은 자리에서 청소한다.
      // (이 저장소의 불변식 "예약을 취소하는 곳에서 발송 기록도 지운다"와 같은 형태다)
      for (const g of tripGroupsRef.current) {
        if (pools[g.id]) continue;
        deleteRecoState(g.id).catch(() => {});
        deleteSignalCache(g.id).catch(() => {});
      }
```

`syncTripPools`가 살아 있는 카드만 남긴 맵을 돌려주므로, `pools`에 없는 여행이 곧 청소 대상이다. 앨범만 있고 pool이 없는 여행도 여기 걸리지만, 그런 여행의 추천은 어차피 앨범 폴백으로 다시 만들어지므로 손해가 없다.

import를 추가한다:

```ts
import { deleteRecoState } from '../services/photoAI/recoStorage';
import { deleteSignalCache } from '../services/photoAI/signalCache';
```

- [ ] **Step 3: 실기기 체크리스트를 갱신한다**

`docs/superpowers/specs/2026-08-31-photo-ai-format-reco-device-checklist.md` 맨 아래에 추가한다:

```markdown
## 입력 경로 전환 (2026-09-01 변경분)

- [ ] **250장 분석 실제 소요 시간 측정** — `recoSource.RECO_ANALYZE_MAX` 확정 근거
- [ ] 같은 여행 재진입 시 즉시 렌더(신호 캐시 적중, 재분석 없음)
- [ ] **앨범 없는 불러온 여행에서 추천 노출** — 이번 변경의 핵심 이득
- [ ] 분석 중 진행률(`n/N`)이 실제로 증가하는지
- [ ] 분석 중 화면 이탈 후 재진입 — 살아 있는 분석이 죽지 않는지(하트비트)
- [ ] 앱 하드 킬 후 재진입 — 고착이 3분 안에 복구되는지
- [ ] iOS 앱 재시작 후 카드 탭 → 복사 성공(`ph://` 만료 방어, photoAssetIds)
- [ ] iCloud 오프로드가 섞인 여행 — 분석은 부분 성공, 수락 시 제외 안내
- [ ] 갤러리 권한 철회 후 섹션 미노출·크래시 없음
- [ ] 장기체류 카드(여러 여행 흡수)에서 pool이 합쳐진 채 분석
- [ ] 여행 카드 삭제 후 재스캔 — 그 여행 사진이 다시 뜨는지(청소 확인)
- [ ] 옛 버전에서 올라온 기기 — pool 이관 후 카드 썸네일 리롤이 여전히 동작
```

- [ ] **Step 4: 전체 검증**

Run: `npx tsc --noEmit`
Expected: 오류 0

Run: `npm test`
Expected: 전체 통과

- [ ] **Step 5: 커밋**

```bash
git add src/screens/TravelImportScreen.tsx docs/superpowers/specs/2026-08-31-photo-ai-format-reco-device-checklist.md
git commit -m "chore(reco): 카드 삭제 시 추천 상태·신호 캐시 청소 + 체크리스트 갱신"
```

---

## 완료 후 상태

- `FORMAT_RECO_ENABLED`는 **`false` 그대로 둔다.** 실기기 체크리스트를 통과하고 네이티브 확장이 들어간 스토어 빌드가 배포된 뒤에 올린다(`featureFlags.ts:98-102`의 기존 판단 유지).
- 골든셋(`formatReco.verify.ts`)은 **점수가 하나도 움직이지 않아야 정상**이다. 이번 작업은 입력 경로만 바꾼다. 움직였다면 엔진 로직을 의도치 않게 건드린 것이다.
- 안드로이드 dev 빌드가 아직 없다. `PhotoVisionAnalyzer.kt` 컴파일은 여전히 미검증이다.
