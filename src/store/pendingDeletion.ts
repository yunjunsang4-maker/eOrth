/**
 * 탈퇴 유예 (30일) 플래그 관리 — 서버 권위(profiles.deletion_requested_at) + 로컬 캐시
 *
 * 탈퇴 신청 시 데이터를 즉시 파기하지 않고 신청 시각만 기록한다.
 *  - 30일 이내 재로그인 → 복구(플래그 해제, 데이터 유지)
 *  - 30일 경과 → 앱 시작(Splash) 또는 로그인 시 서버 파기(Edge Function delete-account)
 *
 * 원본은 서버 플래그다 — 앱 재설치·다른 기기에서도 유예 상태가 유지되고,
 * 로컬 AsyncStorage 는 오프라인 폴백 캐시로만 쓴다(userId 귀속으로 타 계정 오염 방지).
 * 서버 미설정(로컬 모드)에서는 기존처럼 로컬 플래그만 사용한다.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import { withTimeout } from '../utils/withTimeout';

export const DELETION_GRACE_DAYS = 30;
const KEY = '@eorth/pendingDeletion';
const DAY_MS = 24 * 60 * 60 * 1000;
const SERVER_TIMEOUT_MS = 12000;

export interface PendingDeletion {
  requestedAt: number; // 탈퇴 신청 시각 (epoch ms)
  userId?: string; // 신청한 계정 uid — 다른 계정 로그인에 플래그가 오염되지 않도록 귀속
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

async function readLocal(): Promise<PendingDeletion | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw) as PendingDeletion;
    return typeof pending.requestedAt === 'number' ? pending : null;
  } catch {
    return null;
  }
}

async function writeLocal(pending: PendingDeletion | null): Promise<void> {
  try {
    if (pending) await AsyncStorage.setItem(KEY, JSON.stringify(pending));
    else await AsyncStorage.removeItem(KEY);
  } catch {
    // 캐시 기록 실패는 무시 — 원본은 서버 플래그
  }
}

/**
 * 탈퇴 신청 — 서버 플래그(request_account_deletion RPC)에 기록한다.
 * 서버 기록 실패 시 throw — 호출부가 신청을 중단하고 안내해야 한다
 * (로컬만 기록되면 "영구 삭제" 약속이 서버에서 이행되지 않는다).
 */
export async function requestAccountDeletion(): Promise<void> {
  const uid = await currentUserId();
  if (supabase) {
    if (!uid) throw new Error('no_session');
    const { data, error } = await withTimeout(
      supabase.rpc('request_account_deletion'),
      SERVER_TIMEOUT_MS,
    );
    if (error) throw error;
    const ts = data ? Date.parse(String(data)) : NaN;
    await writeLocal({ requestedAt: Number.isFinite(ts) ? ts : Date.now(), userId: uid });
    return;
  }
  // 서버 미설정(로컬 모드) 폴백
  await writeLocal({ requestedAt: Date.now() });
}

/**
 * 유예 상태 조회 — 서버 플래그 우선, 실패 시 로컬 캐시 폴백.
 * 서버 응답이 오면(플래그 없음 포함) 로컬 캐시를 서버 값으로 동기화한다.
 */
export async function getPendingDeletion(): Promise<PendingDeletion | null> {
  const uid = await currentUserId();
  if (supabase && uid) {
    try {
      const { data, error } = await withTimeout(
        supabase.from('profiles').select('deletion_requested_at').eq('id', uid).maybeSingle(),
        SERVER_TIMEOUT_MS,
      );
      if (!error) {
        const raw = (data as { deletion_requested_at?: string | null } | null)
          ?.deletion_requested_at;
        if (!raw) {
          await writeLocal(null);
          return null;
        }
        const ts = Date.parse(raw);
        const pending: PendingDeletion = {
          requestedAt: Number.isFinite(ts) ? ts : Date.now(),
          userId: uid,
        };
        await writeLocal(pending);
        return pending;
      }
    } catch {
      // 서버 도달 실패 → 로컬 캐시 폴백
    }
  }
  const local = await readLocal();
  if (!local) return null;
  // 다른 계정에 귀속된 플래그면 무시 (계정 전환 시 오염 방지)
  if (local.userId && uid && local.userId !== uid) return null;
  return local;
}

/**
 * 탈퇴 신청 취소(계정 복구) — 서버 플래그 해제 실패 시 throw.
 * (해제가 서버에 반영되지 않으면 30일 후 안전망 파기가 복구된 계정을 지워버린다 —
 *  호출부는 실패 시 복구 완료로 처리하면 안 된다.)
 */
export async function cancelAccountDeletion(): Promise<void> {
  const uid = await currentUserId();
  if (supabase && uid) {
    const { error } = await withTimeout(
      supabase.rpc('cancel_account_deletion'),
      SERVER_TIMEOUT_MS,
    );
    if (error) throw error;
  }
  await writeLocal(null);
}

/** 로컬 캐시만 제거 — 서버 파기(계정 삭제) 완료 후 뒷정리용 (세션이 이미 무효라 RPC 불가) */
export async function clearLocalDeletionFlag(): Promise<void> {
  await writeLocal(null);
}

export function isDeletionExpired(pending: PendingDeletion): boolean {
  return Date.now() - pending.requestedAt >= DELETION_GRACE_DAYS * DAY_MS;
}

/** 영구 삭제까지 남은 일수 (최소 0) */
export function daysUntilPurge(pending: PendingDeletion): number {
  const remainMs = pending.requestedAt + DELETION_GRACE_DAYS * DAY_MS - Date.now();
  return Math.max(0, Math.ceil(remainMs / DAY_MS));
}
