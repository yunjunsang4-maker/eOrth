/**
 * 푸시 토큰 서비스 — Expo Push 토큰 등록·삭제·prefs 동기화
 *
 * - registerPushToken: 알림 권한 획득 후 토큰을 push_tokens 테이블에 upsert
 * - unregisterPushToken: 현재 기기 토큰 행 삭제 (계정 전환 시 이전 계정으로 푸시 가는 것 방지)
 * - syncPushPrefs: 등록된 토큰 행의 prefs만 update
 *
 * expo-device 미설치 → Platform.OS 기반으로만 처리.
 * Expo Go / 시뮬레이터에서 getExpoPushTokenAsync 실패는 try/catch 무해화.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase, isSupabaseConfigured } from './supabase';
import { requestNotificationPermission } from './snapService';
import type { NotifPrefKey } from '../store/settingsStore';

// push_tokens 테이블에 저장할 prefs 구조 (Edge Function이 이 키로 필터)
export type PushPrefs = Partial<Record<NotifPrefKey, boolean>>;

// projectId — app.json extra.eas.projectId 경로
const PROJECT_ID = (Constants.expoConfig?.extra as any)?.eas?.projectId as string | undefined;

/** 현재 기기의 Expo 푸시 토큰 문자열을 반환. 실패 시 null */
async function getToken(): Promise<string | null> {
  try {
    if (!PROJECT_ID) return null;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    return data ?? null;
  } catch {
    // Expo Go / 시뮬레이터에서 실패 가능 — 무해화
    return null;
  }
}

/**
 * 로그인 확정 후 1회 호출.
 * 알림 권한 획득 → 토큰 취득 → push_tokens upsert.
 */
export async function registerPushToken(prefs: PushPrefs): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return; // 거부 시 조용히 종료

    const token = await getToken();
    if (!token) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: user.id,
          token,
          platform: Platform.OS,
          prefs,
        },
        { onConflict: 'user_id,token' },
      );
  } catch {
    // 오프라인 등 실패 — 무해화
  }
}

/**
 * 계정 전환 시 현재 기기 토큰 행을 삭제.
 * RLS 통과를 위해 이전 세션이 살아있는 동안(클리어 전) 호출해야 한다.
 */
export async function unregisterPushToken(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const token = await getToken();
    if (!token) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('push_tokens')
      .delete()
      .match({ user_id: user.id, token });
  } catch {
    // 오프라인 등 실패 — 무해화
  }
}

/**
 * notifPrefs 변경 시 기존 토큰 행의 prefs만 update.
 * 토큰이 등록되지 않은 경우 아무것도 하지 않는다.
 */
export async function syncPushPrefs(prefs: PushPrefs): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const token = await getToken();
    if (!token) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('push_tokens')
      .update({ prefs })
      .match({ user_id: user.id, token });
  } catch {
    // 오프라인 등 실패 — 무해화
  }
}
