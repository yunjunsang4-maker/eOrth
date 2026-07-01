/**
 * Supabase 클라이언트
 *
 * 환경변수(EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY)가 설정된 경우에만
 * 실제 클라이언트가 생성된다. 미설정 시 null → 앱은 기존 모의(mock) 흐름으로 동작한다.
 *
 * 설정 방법: 프로젝트 루트 .env 파일에 키를 넣는다 (.env.example 참고).
 * 키 변경 후에는 `npx expo start -c`로 캐시를 비우고 재시작해야 반영된다.
 */

import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SupabaseSecureStorage, getStorageBackend } from './secureStorage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        // 세션(토큰)을 OS 보안 저장소(Keychain/Keystore)에 암호화 저장.
        // 네이티브 모듈 재빌드 전에는 내부적으로 AsyncStorage로 폴백한다.
        storage: SupabaseSecureStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false, // RN에는 브라우저 URL이 없음
        flowType: 'pkce', // OAuth(구글/애플) 딥링크 콜백에서 code 교환
      },
    })
  : null;

// 세션 저장 백엔드 진단 — 토큰 값은 출력하지 않고 백엔드 종류만 확인.
// 'secure'면 Keychain/Keystore, 'fallback'이면 평문(AsyncStorage) 저장 중.
// 폴백은 모든 빌드에서 경고(프로덕션 빌드가 실수로 평문 저장 시 로그로 감지 가능).
if (isSupabaseConfigured) {
  const backend = getStorageBackend();
  if (backend === 'fallback') {
    console.warn(
      '[auth] SecureStore를 사용할 수 없어 세션이 AsyncStorage(평문)에 저장됩니다. ' +
        'expo-secure-store 네이티브 링크/빌드를 확인하세요.',
    );
  } else if (__DEV__) {
    console.log('[auth] 세션 저장 백엔드:', backend);
  }
}

// 토큰 자동갱신을 앱 활성 상태에 묶는다 (Supabase React Native 권장 패턴).
// 포그라운드일 때만 갱신 타이머를 돌려 장시간 백그라운드 후 복귀 시 세션 만료를 방지한다.
if (supabase) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
