import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from './supabase';
import { getMyUserId } from './profile';
import { APP_VERSION } from '../utils/appVersion';

// 설정 > 피드백 보내기 — feedback 테이블에 저장 (RLS: 본인 명의 insert만, 조회는 대시보드 전용)
// 앱 버전은 SettingsScreen 행·푸터와 같은 단일 출처(utils/appVersion — app.json "version")

/** 피드백 제출 — 성공 여부 반환 (미설정/비로그인/오류 시 false) */
export async function submitFeedback(content: string): Promise<boolean> {
  const text = content.trim();
  if (!text || !supabase || !isSupabaseConfigured) return false;
  const uid = await getMyUserId();
  if (!uid) return false;
  const { error } = await supabase.from('feedback').insert({
    user_id: uid,
    content: text,
    app_version: APP_VERSION,
    platform: Platform.OS,
  });
  return !error;
}
