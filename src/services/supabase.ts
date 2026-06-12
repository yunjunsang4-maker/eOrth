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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false, // RN에는 브라우저 URL이 없음
      },
    })
  : null;
