/**
 * 형식 추천 — 로컬 저장소 (AsyncStorage)
 * 사진·신호·추천은 전부 로컬에만 저장한다(서버 전송 없음).
 *
 * ⚠️ 순수 함수 구역(키 파싱·죽은 키 선별)은 recoStorage.verify.ts가 RN 없이 tsx로
 *    돌린다. 그래서 AsyncStorage는 최상단 import이 아니라 지연 require다
 *    (tripPhotoPool.ts의 storage()와 같은 방식).
 */
import type { RecoLogEvent, RecoState } from './recoTypes';

function storage() {
  return (require('@react-native-async-storage/async-storage') as {
    default: typeof import('@react-native-async-storage/async-storage').default;
  }).default;
}

/**
 * 스키마 버전 2 (2026-09-01) — 키가 albumRecordId에서 tripGroupId로 바뀌었고
 * mediasFingerprint가 sourceFingerprint로 바뀌었다. v1 항목은 읽히지 않고 버려진다.
 * FORMAT_RECO_ENABLED가 false인 채로만 배포됐으므로 실제 사용자 데이터는 없다.
 */
export const RECO_SCHEMA_VERSION = 2;
export const RECO_STATE_KEY_PREFIX = '@photoAI/reco/';
const stateKey = (tripGroupId: string) => `${RECO_STATE_KEY_PREFIX}${tripGroupId}`;
const LOG_KEY = '@photoAI/recoLog';
const LOG_MAX = 500;

// ─────────────────────────────────────────────
// 순수 로직 (verify 대상)
// ─────────────────────────────────────────────

/**
 * AsyncStorage 키에서 tripGroupId를 뽑는다. 추천 상태 키가 아니면 null.
 *
 * startsWith가 아니라 "접두사 + 나머지" 정확 분해다 — LOG_KEY('@photoAI/recoLog')처럼
 * 접두가 비슷한 다른 키를 상태로 오판해 지우면 안 된다('/' 유무가 경계다).
 * 접두사만 있고 gid가 빈 키도 상태 키로 보지 않는다.
 */
export function recoStateKeyToTripGroupId(key: string): string | null {
  if (!key.startsWith(RECO_STATE_KEY_PREFIX)) return null;
  const gid = key.slice(RECO_STATE_KEY_PREFIX.length);
  return gid.length > 0 ? gid : null;
}

/**
 * 전체 키 목록에서 "죽은 그룹"(살아 있는 여행 카드 목록에 없는 gid)의 상태 키만 고른다.
 *
 * 불변식: 살아 있는 여행의 키는 절대 고르지 않는다. 오삭제는 수 분짜리 재분석과
 * 닫음 기록 유실이고, 누수는 몇 KB 잔존일 뿐이다 — 의심스러우면 남긴다.
 * 같은 이유로 aliveTripGroupIds가 비어 있으면 아무것도 고르지 않는다: 빈 목록은
 * "여행이 정말 0개"보다 hydrate 실패가 빈 상태로 위장한 경우가 더 위험하기 때문이다
 * (recoOrphanSweep이 같은 방어를 한다).
 *
 * gid는 Set 멤버십으로 정확 비교한다 — 'trip-a'가 살아 있다고 'trip-ab'까지
 * 살려두는(또는 그 반대) 접두 오판이 없다.
 */
export function selectDeadRecoKeys(
  allKeys: readonly string[],
  aliveTripGroupIds: readonly string[],
): string[] {
  if (aliveTripGroupIds.length === 0) return [];
  const alive = new Set(aliveTripGroupIds);
  return allKeys.filter((key) => {
    const gid = recoStateKeyToTripGroupId(key);
    return gid !== null && !alive.has(gid);
  });
}

interface Envelope<T> { version: number; updatedAt: number; payload: T }

async function readEnvelope<T>(key: string): Promise<T | null> {
  try {
    const raw = await storage().getItem(key);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    if (env.version !== RECO_SCHEMA_VERSION) return null;
    return env.payload;
  } catch { return null; }
}
async function writeEnvelope<T>(key: string, payload: T): Promise<void> {
  const env: Envelope<T> = { version: RECO_SCHEMA_VERSION, updatedAt: Date.now(), payload };
  await storage().setItem(key, JSON.stringify(env));
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
    await storage().removeItem(stateKey(tripGroupId));
  } catch { /* 무시 */ }
}

/**
 * 죽은 그룹(더 이상 존재하지 않는 여행 카드)의 추천 상태를 일괄 청소한다(설계 §6).
 *
 * 이 모듈이 직접 쓸어내는 이유: 키 스킴(@photoAI/reco/{gid})은 이 파일의 비공개
 * 사정이라, 청소 지점(TravelImportScreen)이 그걸 알게 하면 스킴이 바뀔 때 청소가
 * 조용히 깨진다. "키를 아는 자가 자기 것을 치운다".
 *
 * 판정 기준이 "살아 있는 여행 카드 목록"인 이유: pool 유무로 판정하면 앨범 폴백
 * (pool 없이 앨범 medias로 분석된 기존 여행)의 정당한 상태를 오삭제한다.
 * 죽은 그룹 것만 지우므로 살아 있는 여행의 상태를 지우는 경로가 없다.
 *
 * 열거 실패는 조용히 포기한다 — 청소가 안 되는 건 몇 KB 누수일 뿐, 스캔을 막거나
 * 재시도로 시끄럽게 굴 이유가 없다(다음 스캔에서 다시 본다).
 */
export async function sweepRecoStates(aliveTripGroupIds: string[]): Promise<void> {
  try {
    const keys = await storage().getAllKeys();
    const dead = selectDeadRecoKeys(keys, aliveTripGroupIds); // 빈 alive 방어는 이 안에 있다
    if (dead.length > 0) await storage().multiRemove(dead);
  } catch { /* 무시 */ }
}

/** 카드 닫기 — dismissedIds에 추가 (재노출 방지) */
export async function dismissRecoCard(tripGroupId: string, cardId: string): Promise<void> {
  const state = await getRecoState(tripGroupId);
  if (!state || state.dismissedIds.includes(cardId)) return;
  await saveRecoState({ ...state, dismissedIds: [...state.dismissedIds, cardId] });
}

/** 사용 로그 — v1은 수집만, 소비하지 않음 (설계 §8) */
export async function appendRecoLog(event: RecoLogEvent): Promise<void> {
  const log = (await readEnvelope<RecoLogEvent[]>(LOG_KEY)) ?? [];
  log.push(event);
  await writeEnvelope(LOG_KEY, log.slice(-LOG_MAX));
}
export function getRecoLog(): Promise<RecoLogEvent[] | null> {
  return readEnvelope<RecoLogEvent[]>(LOG_KEY);
}
