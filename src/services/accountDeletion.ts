/**
 * 계정 파기 서비스 — Edge Function(delete-account) 호출 래퍼
 *
 * scope:
 *  - 'content' : 유예 중 "새로 시작" — 게시물·팔로우·DM·Storage 파일 등 콘텐츠만 파기,
 *                계정(auth)과 빈 프로필은 유지 (같은 로그인 수단으로 재온보딩)
 *  - 'full'    : 유예(30일) 만료 — Storage 파일 + auth 계정까지 영구 파기.
 *                만료 여부는 서버가 profiles.deletion_requested_at 기준으로 재검증한다.
 *
 * 탈퇴 신청(request_account_deletion RPC)이 기록된 계정만 파기된다.
 */

import { supabase } from './supabase';
import { withTimeout } from '../utils/withTimeout';

// Storage 파일 정리가 포함되어 일반 RPC보다 오래 걸릴 수 있다
const PURGE_TIMEOUT_MS = 30000;

export type PurgeScope = 'content' | 'full';

/** 서버 계정 파기. 성공 여부 반환 — 실패 시 호출부는 로컬 데이터를 지우면 안 된다. */
export async function purgeAccountOnServer(scope: PurgeScope): Promise<boolean> {
  if (!supabase) return true; // 서버 미설정(로컬 모드): 지울 서버 데이터 없음
  try {
    const { data, error } = await withTimeout(
      supabase.functions.invoke('delete-account', { body: { scope } }),
      PURGE_TIMEOUT_MS,
    );
    if (error) return false;
    return !!(data as { ok?: boolean } | null)?.ok;
  } catch {
    return false;
  }
}
