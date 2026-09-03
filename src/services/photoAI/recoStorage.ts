/**
 * 형식 추천 — 로컬 저장소 (AsyncStorage)
 * 사진·신호·추천은 전부 로컬에만 저장한다(서버 전송 없음).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RecoLogEvent, RecoState } from './recoTypes';

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

/** 사용 로그 — v1은 수집만, 소비하지 않음 (설계 §8) */
export async function appendRecoLog(event: RecoLogEvent): Promise<void> {
  const log = (await readEnvelope<RecoLogEvent[]>(LOG_KEY)) ?? [];
  log.push(event);
  await writeEnvelope(LOG_KEY, log.slice(-LOG_MAX));
}
export function getRecoLog(): Promise<RecoLogEvent[] | null> {
  return readEnvelope<RecoLogEvent[]>(LOG_KEY);
}
