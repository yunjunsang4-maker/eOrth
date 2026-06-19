/**
 * 온디바이스 AI — 가벼운 로컬 DB (AsyncStorage 기반 스키마)
 *
 * ⚠️ 사전 설치 필요 (아직 package.json에 없음):
 *     npx expo install @react-native-async-storage/async-storage
 *   설치 전까지는 이 파일의 import에서 TS 모듈 오류가 발생한다.
 *
 * 저장 목적:
 *  - 마지막 스캔 시각/위치를 기억하여 '증분 스캔'(createdAfter)으로 발열·배터리 절약
 *  - 그룹화 결과와 베스트컷 캐시를 보관하여 재분석 없이 UI에서 즉시 사용
 *
 * 스키마(버전 관리): 각 키는 { version, updatedAt, payload } 봉투로 감싼다.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PhotoMeta, SpotGroup } from './types';

// ─── 키 네임스페이스 ───
export const STORAGE_KEYS = {
  scanState: '@photoAI/scanState',
  spotGroups: '@photoAI/spotGroups',
  photoMetaCache: '@photoAI/photoMetaCache',
} as const;

// 스키마가 바뀌면 이 값을 올려 과거 캐시를 무시(마이그레이션)한다.
export const SCHEMA_VERSION = 1;

interface Envelope<T> {
  version: number;
  updatedAt: number;
  payload: T;
}

// ─── 스캔 상태 (증분 스캔용) ───
export interface ScanState {
  lastScanAt: number;          // 마지막 스캔 완료 시각 (epoch ms)
  lastPhotoCreationTime: number | null; // 마지막으로 처리한 사진의 촬영시각
  processedCount: number;
}

// ─── 공통 read/write ───
async function readEnvelope<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    if (env.version !== SCHEMA_VERSION) return null; // 스키마 불일치 → 폐기
    return env.payload;
  } catch {
    return null;
  }
}

async function writeEnvelope<T>(key: string, payload: T): Promise<void> {
  const env: Envelope<T> = {
    version: SCHEMA_VERSION,
    updatedAt: Date.now(),
    payload,
  };
  await AsyncStorage.setItem(key, JSON.stringify(env));
}

// ─── 스캔 상태 ───
export function getScanState(): Promise<ScanState | null> {
  return readEnvelope<ScanState>(STORAGE_KEYS.scanState);
}
export function saveScanState(state: ScanState): Promise<void> {
  return writeEnvelope(STORAGE_KEYS.scanState, state);
}

// ─── 스팟 그룹 ───
export function getSpotGroups(): Promise<SpotGroup[] | null> {
  return readEnvelope<SpotGroup[]>(STORAGE_KEYS.spotGroups);
}
export function saveSpotGroups(groups: SpotGroup[]): Promise<void> {
  return writeEnvelope(STORAGE_KEYS.spotGroups, groups);
}

// ─── 사진 메타 캐시 (id → PhotoMeta) ───
export function getPhotoMetaCache(): Promise<Record<string, PhotoMeta> | null> {
  return readEnvelope<Record<string, PhotoMeta>>(STORAGE_KEYS.photoMetaCache);
}
export function savePhotoMetaCache(map: Record<string, PhotoMeta>): Promise<void> {
  return writeEnvelope(STORAGE_KEYS.photoMetaCache, map);
}

// ─── 전체 초기화 (설정 → 캐시 비우기 등에서 사용) ───
export async function clearPhotoAIStorage(): Promise<void> {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.scanState,
    STORAGE_KEYS.spotGroups,
    STORAGE_KEYS.photoMetaCache,
  ]);
}
