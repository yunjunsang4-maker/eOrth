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
 * 권한 팝업 없이 현재 상태만 확인 — granted인 경우에만 토큰 등록.
 * 권한 요청은 스냅 감지·알림 설정 화면 등 사용자 인지 시점에서 별도로 처리한다.
 * granted가 아니면 조용히 return하고, AppState 'active' 복귀 시 PushTokenSync가 재시도한다.
 *
 * @returns true: 등록 성공 / false: 권한 미부여 또는 토큰 미발급
 */
export async function registerPushToken(prefs: PushPrefs): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  try {
    // 권한을 요청(팝업)하지 않고 현재 상태만 확인
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return false; // 미부여 — 조용히 종료

    const token = await getToken();
    if (!token) return false;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

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
    return true;
  } catch {
    // 오프라인 등 실패 — 무해화
    return false;
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
