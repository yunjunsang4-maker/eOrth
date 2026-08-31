/**
 * 형식 추천 — 로컬 저장소 (AsyncStorage)
 * 사진·신호·추천은 전부 로컬에만 저장한다(서버 전송 없음).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RecoLogEvent, RecoState } from './recoTypes';

export const RECO_SCHEMA_VERSION = 1;
const stateKey = (albumRecordId: string) => `@photoAI/reco/${albumRecordId}`;
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

export function getRecoState(albumRecordId: string): Promise<RecoState | null> {
  return readEnvelope<RecoState>(stateKey(albumRecordId));
}
export function saveRecoState(state: RecoState): Promise<void> {
  return writeEnvelope(stateKey(state.albumRecordId), state);
}

/** 카드 닫기 — dismissedIds에 추가 (재노출 방지) */
export async function dismissRecoCard(albumRecordId: string, cardId: string): Promise<void> {
  const state = await getRecoState(albumRecordId);
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
