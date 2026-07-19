/**
 * PushTokenSync — 로그인 확정 시 푸시 토큰 등록, notifPrefs 변경 시 prefs 동기화.
 *
 * - useIsAppEntered: 인증 후 Main 진입 시 1회 registerPushToken
 * - notifPrefs 변화: 2초 디바운스 후 syncPushPrefs (settingsStore에서 직접 서비스 호출 시 순환 위험 회피)
 *
 * App.tsx에서 SnapDetector 옆에 마운트.
 */
import { useEffect, useRef } from 'react';
import { useSettings } from '../store/settingsStore';
import { useIsAppEntered } from '../hooks/useIsAppEntered';
import { registerPushToken, syncPushPrefs } from '../services/pushToken';
import { isSupabaseConfigured } from '../services/supabase';

const PREFS_DEBOUNCE_MS = 2000;

export default function PushTokenSync() {
  const { notifPrefs } = useSettings();
  const entered = useIsAppEntered();
  const registeredRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 최신 notifPrefs를 ref로 추적 (디바운스 콜백에서 stale 클로저 방지)
  const notifPrefsRef = useRef(notifPrefs);
  notifPrefsRef.current = notifPrefs;

  // 로그인 확정(Main 진입) 후 1회 토큰 등록
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!entered || registeredRef.current) return;
    registeredRef.current = true;
    registerPushToken(notifPrefsRef.current);
  }, [entered]);

  // notifPrefs 변경 시 2초 디바운스 후 서버 동기화 (최초 진입 전에도 변경 가능하므로 entered 무관)
  useEffect(() => {
    if (!isSupabaseConfigured || !registeredRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      syncPushPrefs(notifPrefsRef.current);
    }, PREFS_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [notifPrefs]);

  return null; // UI 없음
}
