/**
 * PushTokenSync — 로그인 확정 시 푸시 토큰 등록, notifPrefs 변경 시 prefs 동기화.
 *
 * - useIsAppEntered: 인증 후 Main 진입 시 1회 registerPushToken
 * - 계정 전환: uid가 변경되면 새 계정의 토큰을 재등록 (registeredForUidRef로 추적)
 * - notifPrefs 변화: 2초 디바운스 후 syncPushPrefs (settingsStore에서 직접 서비스 호출 시 순환 위험 회피)
 * - AppState 'active' 복귀: 아직 미등록(권한 미부여 등)이면 조용히 재시도
 *   → 사용자가 시스템 설정에서 알림 권한을 나중에 허용하면 다음 포그라운드에 자동 등록
 *
 * App.tsx에서 SnapDetector 옆에 마운트.
 */
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
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
  // entered를 ref로 추적 (AppState 핸들러에서 stale 클로저 방지)
  const enteredRef = useRef(entered);
  enteredRef.current = entered;

  // 로그인 확정(Main 진입) 후 현재 uid로 1회 토큰 등록. 계정 전환 시 새 uid로 재등록.
  useEffect(() => {
    if (!isSupabaseConfigured || !entered || !supabase) return;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const uid = user?.id ?? null;
        if (!uid || registeredForUidRef.current === uid) return;
        // registerPushToken 반환값(true=성공)이 false면 uid 추적을 하지 않아
        // 다음 포그라운드 복귀 시 AppState 핸들러가 재시도하게 둔다
        const ok = await registerPushToken(notifPrefsRef.current);
        if (ok) registeredForUidRef.current = uid;
      } catch {
        // 비동기 uid 조회 실패 — 무해화
      }
    })();
  }, [entered]);

  // AppState 'active' 복귀 시 미등록 상태면 조용히 재시도
  // — 사용자가 시스템 설정에서 권한을 나중에 부여한 경우 다음 포그라운드에 자동 등록
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      if (!enteredRef.current) return;        // 아직 로그인 미완료
      if (registeredForUidRef.current) return; // 이미 등록됨 — 재시도 불필요

      try {
        const { data: { user } } = await supabase!.auth.getUser();
        const uid = user?.id ?? null;
        if (!uid) return;
        const ok = await registerPushToken(notifPrefsRef.current);
        if (ok) registeredForUidRef.current = uid;
      } catch {
        // 포그라운드 재시도 실패 — 무해화
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []); // 마운트 1회 등록 — ref로 최신값 참조

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
