/**
 * 탈퇴 유예 (30일) 플래그 관리
 *
 * 탈퇴 신청 시 데이터를 즉시 파기하지 않고 신청 시각만 기록한다.
 *  - 30일 이내 재로그인 → 복구(플래그 삭제, 데이터 유지)
 *  - 30일 경과 → 앱 시작(Splash) 또는 로그인 시 영구 파기
 *
 * 백엔드 도입 시 이 로직은 서버(계정 비활성화 + 배치 파기)로 이전한다.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const DELETION_GRACE_DAYS = 30;
const KEY = '@eorth/pendingDeletion';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PendingDeletion {
  requestedAt: number; // 탈퇴 신청 시각 (epoch ms)
}

export async function requestAccountDeletion(): Promise<void> {
  const pending: PendingDeletion = { requestedAt: Date.now() };
  await AsyncStorage.setItem(KEY, JSON.stringify(pending));
}

export async function getPendingDeletion(): Promise<PendingDeletion | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw) as PendingDeletion;
    return typeof pending.requestedAt === 'number' ? pending : null;
  } catch {
    return null;
  }
}

export async function cancelAccountDeletion(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

export function isDeletionExpired(pending: PendingDeletion): boolean {
  return Date.now() - pending.requestedAt >= DELETION_GRACE_DAYS * DAY_MS;
}

/** 영구 삭제까지 남은 일수 (최소 0) */
export function daysUntilPurge(pending: PendingDeletion): number {
  const remainMs = pending.requestedAt + DELETION_GRACE_DAYS * DAY_MS - Date.now();
  return Math.max(0, Math.ceil(remainMs / DAY_MS));
}
