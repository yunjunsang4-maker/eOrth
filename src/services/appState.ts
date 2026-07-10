/**
 * appState.ts — 앱 로컬 상태 통합 백업/복원 (user_app_state, 사용자당 1행 jsonb)
 *
 * 로컬이 원본, 서버는 백업본. 설정(스킨·색·알림·배지·통계 등)과 기록 부가상태
 * (보관·신고숨김·음소거·차단목록·본 스냅·카드순서)를 재설치/기기 변경 후 복원한다.
 * PII(핸들·소개·사진·생일 등)는 profiles가 원본이므로 여기 포함하지 않는다.
 *
 * 게이트 원칙(user_trip_state와 동일): 로그인 확정 후 복원 → 복원 뒤에만 백업 허용.
 * (빈 로컬 상태가 서버 백업을 덮어쓰는 사고 방지 — 여행카드 유실 실사고의 교훈)
 */
import { supabase } from './supabase';
import { getMyUserId } from './profile';

export interface AppStateBackup {
  settings?: Record<string, unknown>; // settingsStore.exportSettingsBackup()
  records?: Record<string, unknown>;  // recordStore.exportLocalStateBackup()
  cardOrder?: string[];               // 프로필 여행카드 순서
}

export async function saveAppState(data: AppStateBackup): Promise<void> {
  if (!supabase) return;
  const uid = await getMyUserId();
  if (!uid) return;
  try {
    await supabase.from('user_app_state').upsert({ user_id: uid, data });
  } catch {
    /* 무시 — 다음 변경 때 재시도 */
  }
}

export async function fetchAppState(): Promise<AppStateBackup | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  try {
    const { data, error } = await supabase
      .from('user_app_state')
      .select('data')
      .eq('user_id', uid)
      .maybeSingle();
    if (error || !data?.data) return null;
    return data.data as AppStateBackup;
  } catch {
    return null;
  }
}
