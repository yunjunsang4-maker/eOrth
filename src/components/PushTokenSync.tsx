/**
 * PushTokenSync — 로그인 확정 시 푸시 토큰 등록, notifPrefs 변경 시 prefs 동기화.
 *
 * - useIsAppEntered: 인증 후 Main 진입 시 1회 registerPushToken
 * - 계정 전환: uid가 변경되면 새 계정의 토큰을 재등록 (registeredForUidRef로 추적)
 * - notifPrefs 변화: 2초 디바운스 후 syncPushPrefs (settingsStore에서 직접 서비스 호출 시 순환 위험 회피)
 *
 * App.tsx에서 SnapDetector 옆에 마운트.
 */
import { useEffect, useRef } from 'react';
import { useSettings } from '../store/settingsStore';
import { useIsAppEntered } from '../hooks/useIsAppEntered';
import { registerPushToken, syncPushPrefs } from '../services/pushToken';
import { supabase, isSupabaseConfigured } from '../services/supabase';

const PREFS_DEBOUNCE_MS = 2000;

export default function PushTokenSync() {
  const { notifPrefs } = useSettings();
  const entered = useIsAppEntered();
  // 등록한 사용자 uid를 기억 (계정 전환 감지용 — uid 변경 시 재등록)
  const registeredForUidRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 최신 notifPrefs를 ref로 추적 (디바운스 콜백에서 stale 클로저 방지)
  const notifPrefsRef = useRef(notifPrefs);
  notifPrefsRef.current = notifPrefs;

  // 로그인 확정(Main 진입) 후 현재 uid로 1회 토큰 등록. 계정 전환 시 새 uid로 재등록.
  useEffect(() => {
    if (!isSupabaseConfigured || !entered || !supabase) return;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const uid = user?.id ?? null;
        if (!uid || registeredForUidRef.current === uid) return;
        registeredForUidRef.current = uid;
        await registerPushToken(notifPrefsRef.current);
      } catch {
        // 비동기 uid 조회 실패 — 무해화
      }
    })();
  }, [entered]);

  // notifPrefs 변경 시 2초 디바운스 후 서버 동기화 (최초 진입 전에도 변경 가능하므로 entered 무관)
  useEffect(() => {
    if (!isSupabaseConfigured || !registeredForUidRef.current) return;
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
