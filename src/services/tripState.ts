/**
 * 여행 카드(그룹)·세션 백업 서비스 (user_trip_state 테이블, 사용자당 1행 jsonb)
 *
 * 로컬(recordStore)이 원본이고 서버는 재설치/기기 변경 복원용 백업본이다.
 * 기록 참조는 remoteId(posts.id)로 변환해 저장 — 재설치 후 서버에서 받은
 * 기록(id=posts.id)과 그대로 이어진다. Supabase 미설정 시 무동작.
 */

import { supabase } from './supabase';
import { getMyUserId } from './profile';

export interface TripStateBackup {
  groups: Array<{
    id: string;
    title: string;
    records: string[];       // remoteId(posts.id) 우선, 미발행 기록은 로컬 id
    coverRecordId: string;
    createdAt: string;       // ISO 문자열
    countryName?: string;
    countryFlag?: string;
    coverUri?: string;
    date?: string;
    regionName?: string;
  }>;
  session: { groups: Record<string, string>; lastActiveAt: number } | null;
}

// 백업 저장 — 실패는 조용히 넘어간다(다음 변경 때 자동 재시도되는 best-effort 백업)
export async function saveTripState(data: TripStateBackup): Promise<void> {
  if (!supabase) return;
  const uid = await getMyUserId();
  if (!uid) return;
  try {
    await supabase.from('user_trip_state').upsert({ user_id: uid, data });
  } catch {
    /* 무시 */
  }
}

// 백업 조회 — 없음/실패 시 null
export async function fetchTripState(): Promise<TripStateBackup | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  try {
    const { data, error } = await supabase
      .from('user_trip_state')
      .select('data')
      .eq('user_id', uid)
      .maybeSingle();
    if (error || !data?.data) return null;
    return data.data as TripStateBackup;
  } catch {
    return null;
  }
}
