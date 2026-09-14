/**
 * 푸시 토큰 서비스 — Expo Push 토큰 등록·삭제·prefs 동기화
 *
 * - registerPushToken: 알림 권한 획득 후 토큰을 push_tokens 테이블에 upsert
 * - unregisterPushToken: 현재 기기 토큰 행 삭제 (계정 전환 시 이전 계정으로 푸시 가는 것 방지)
 * - syncPushPrefs: 등록된 토큰 행의 prefs·lang만 update
 *
 * (2026-09-13) lang — 푸시 문구 언어. 서버(send-push)는 수신자 언어를 알 방법이 없어
 * 문구 8종을 전부 한국어로 보내고 있었다. 언어는 계정이 아니라 기기 설정이라 profiles가
 * 아니라 push_tokens 행에 싣는다(발송 경로 두 곳이 이미 이 표를 읽으므로 조인도 안 는다).
 *
 * expo-device 미설치 → Platform.OS 기반으로만 처리.
 * Expo Go / 시뮬레이터에서 getExpoPushTokenAsync 실패는 try/catch 무해화.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase';
import { withTimeout } from '../utils/withTimeout';
import type { NotifPrefKey } from '../store/settingsStore';

// 로그인/계정 전환을 막지 않도록 푸시 토큰 해제에 거는 상한(ms).
const UNREGISTER_TIMEOUT_MS = 5000;

// push_tokens 테이블에 저장할 prefs 구조 (Edge Function이 이 키로 필터)
export type PushPrefs = Partial<Record<NotifPrefKey, boolean>>;

// push_tokens.lang 에 들어갈 수 있는 값. 서버는 이 두 값만 해석한다.
export type PushLang = 'ko' | 'en';

/**
 * 푸시 문구 언어 정규화 — 서버에 넣기 직전 단 한 곳.
 *
 * ⚠️ i18n.language 는 'en-US'·'ko-KR' 처럼 지역 태그가 붙을 수 있어 그대로 넣으면
 *    Edge Function 의 비교(=== 'en')가 빗나가 영어 기기에 한국어가 간다.
 *    'ko' 로 시작하면 한국어, 그 외는 전부 영어로 접는다.
 *
 * ⚠️ 서버(send-push 의 toLang)는 반대로 **모르는 값을 한국어**로 떨어뜨린다. 어긋난 게 아니라
 *    입력이 다르다 — 이쪽 입력은 사용자가 고른 앱 언어(settingsStore.language, 'ko'|'en')라
 *    "ko 가 아니면 영어를 고른 것"이 맞고, 저쪽 입력은 DB 값이라 null(구 번들 행)이 대다수다.
 *    한쪽을 다른 쪽에 맞추지 마라 — 서버를 영어 폴백으로 바꾸면 구 번들 사용자 전원에게
 *    영어가 간다.
 */
export function normalizePushLang(raw: string | null | undefined): PushLang {
  return typeof raw === 'string' && raw.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

// 마지막으로 서버에 등록한 토큰 캐시 — 계정 전환 시 getExpoPushTokenAsync가 실패해도
// (오프라인 등) 이 값으로 이전 계정 토큰 행을 지울 수 있게 한다(감사 H2).
const LAST_TOKEN_KEY = '@eorth/lastPushToken';

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
 * lang 은 호출부(PushTokenSync)가 settingsStore.language 를 넘긴다.
 * ⚠️ 여기서 i18n 인스턴스를 직접 import 하지 않는 이유: 이 모듈은 계정 전환 경로
 *    (useAccountBoundary)가 부르는 서비스인데, '../i18n' 은 import 시점에 i18next 와
 *    expo-localization 을 초기화한다. 서비스가 store·i18n 을 런타임 import 하지 않는
 *    현재 구조(여기서 settingsStore 는 type import 뿐이다)를 깨지 않도록 인자로 받는다.
 *
 * @returns true: 등록 성공 / false: 권한 미부여 또는 토큰 미발급
 */
export async function registerPushToken(prefs: PushPrefs, lang: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  try {
    // 권한을 요청(팝업)하지 않고 현재 상태만 확인
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return false; // 미부여 — 조용히 종료

    const token = await getToken();
    if (!token) return false;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // 이전 계정이 이 기기 토큰을 소유 중이면 회수 — 계정 전환 시 unregister가 실패했어도
    // 이전 계정으로 푸시가 가는 것을 여기서 끊는다. (RPC 미배포 등 실패는 무해화 — upsert는 진행)
    await supabase.rpc('claim_push_token', { p_token: token }).then(
      () => {},
      () => {},
    );

    await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: user.id,
          token,
          platform: Platform.OS,
          prefs,
          lang: normalizePushLang(lang),
        },
        { onConflict: 'user_id,token' },
      );
    // 등록 성공한 토큰을 로컬에 캐시 — 이후 unregister의 getToken 실패 폴백용
    await AsyncStorage.setItem(LAST_TOKEN_KEY, token).catch(() => {});
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
    // getToken 실패 시 마지막 등록 토큰 캐시로 폴백 — 실패하면 이전 계정 행이 남아
    // 이 기기로 이전 계정 푸시가 계속 오는 문제(감사 H2)의 1차 방어선
    // ⚠️ 이 함수는 계정 전환 로그인 경로(useAccountBoundary)에서 await 된다 —
    // 호출부의 .catch()는 거부만 막을 뿐 무응답(hang)은 못 막으므로, 여기서 상한을 건다.
    // 실패해도 무해하다(다음 계정 로그인 시 claim_push_token RPC가 회수).
    const token =
      (await withTimeout(getToken(), UNREGISTER_TIMEOUT_MS).catch(() => null)) ??
      (await AsyncStorage.getItem(LAST_TOKEN_KEY).catch(() => null));
    if (!token) return;

    const { data: { user } } = await withTimeout(supabase.auth.getUser(), UNREGISTER_TIMEOUT_MS);
    if (!user) return;

    const { error } = await supabase
      .from('push_tokens')
      .delete()
      .match({ user_id: user.id, token });
    if (!error) await AsyncStorage.removeItem(LAST_TOKEN_KEY).catch(() => {});
  } catch {
    // 오프라인 등 실패 — 무해화 (다음 계정 로그인 시 claim_push_token RPC가 회수)
  }
}

/**
 * notifPrefs 또는 앱 언어 변경 시 기존 토큰 행의 prefs·lang을 update.
 * 토큰이 등록되지 않은 경우 아무것도 하지 않는다.
 */
export async function syncPushPrefs(prefs: PushPrefs, lang: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const token = await getToken();
    if (!token) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('push_tokens')
      .update({ prefs, lang: normalizePushLang(lang) })
      .match({ user_id: user.id, token });
  } catch {
    // 오프라인 등 실패 — 무해화
  }
}
