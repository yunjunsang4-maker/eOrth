/**
 * 프로필 서비스 (Supabase profiles 테이블)
 *
 * Supabase 미설정 시 모든 함수는 무력화(null/[]) → 앱은 기존 로컬 동작 유지.
 * 사진(profile_photo)은 공개 URL일 때만 저장한다(로컬 file:// 경로는 타인이 못 봄 → Storage 업로드는 2단계).
 */

import { sha256 } from 'js-sha256';
import { supabase } from './supabase';
import { withTimeout } from '../utils/withTimeout';

const READ_TIMEOUT_MS = 12000;

export interface ProfileRow {
  id: string;
  handle: string | null;
  nickname: string | null;
  emoji: string | null;
  bio: string | null;
  birthday: string | null; // YYYY-MM-DD
  gender: string | null;
  country?: string | null; // 거주 국가 코드(예: KR). 소유자 전용(public_profiles 뷰엔 없음)
  profile_photo: string | null;
}

/** 현재 로그인 사용자 id (없으면 null) */
export async function getMyUserId(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await withTimeout(supabase.auth.getUser(), READ_TIMEOUT_MS);
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * 내 프로필 생성/갱신 (빈 문자열은 null로 저장).
 * 반환: { ok, handleConflict } — handle UNIQUE 충돌 시 handleConflict=true (호출부가 재생성·재시도).
 */
export async function upsertMyProfile(
  p: Partial<Omit<ProfileRow, 'id'>>
): Promise<{ ok: boolean; handleConflict: boolean }> {
  if (!supabase) return { ok: false, handleConflict: false };
  const uid = await getMyUserId();
  if (!uid) return { ok: false, handleConflict: false };
  const row: Record<string, unknown> = { id: uid };
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined) continue;
    row[k] = v === '' ? null : v;
  }
  try {
    const { error } = await supabase.from('profiles').upsert(row);
    if (error) {
      // 23505 = unique_violation. handle UNIQUE 충돌이면 호출부가 새 handle로 재시도할 수 있게 알린다.
      const handleConflict =
        error.code === '23505' && /handle/i.test(`${error.message} ${error.details ?? ''}`);
      return { ok: false, handleConflict };
    }
    return { ok: true, handleConflict: false };
  } catch {
    // 네트워크 실패 등은 다음 변경 시 재시도
    return { ok: false, handleConflict: false };
  }
}

/** 내 프로필 조회 */
export async function getMyProfile(): Promise<ProfileRow | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  try {
    const { data } = await withTimeout(
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      READ_TIMEOUT_MS,
    );
    return (data as ProfileRow) ?? null;
  } catch {
    return null;
  }
}

/** 핸들/닉네임으로 사용자 검색 (친구 찾기용) */
export async function searchProfiles(query: string): Promise<ProfileRow[]> {
  if (!supabase) return [];
  const q = query.trim();
  if (!q) return [];
  try {
    // 타인 검색은 PII(birthday/gender) 제외한 public_profiles 뷰로 조회 (프로필 PII 노출 방지)
    const { data } = await supabase
      .from('public_profiles')
      .select('*')
      .or(`handle.ilike.%${q}%,nickname.ilike.%${q}%`)
      .limit(20);
    return (data as ProfileRow[]) ?? [];
  } catch {
    return [];
  }
}

/**
 * 여러 사용자의 방문 국가 수 일괄 조회 (친구 찾기 결과 표시용)
 * profile_country_counts RPC(SECURITY DEFINER)로 비공개 제외 게시물의 distinct country_name 집계.
 * 반환: { [userId]: 방문국수 }. 미설정/실패/데이터 없음이면 빈 객체.
 */
export async function getCountryCounts(ids: string[]): Promise<Record<string, number>> {
  if (!supabase || ids.length === 0) return {};
  try {
    const { data } = await supabase.rpc('profile_country_counts', { ids });
    const map: Record<string, number> = {};
    (data as { author_id: string; country_count: number }[] | null)?.forEach((r) => {
      map[r.author_id] = r.country_count;
    });
    return map;
  } catch {
    return {};
  }
}

/**
 * 여러 사용자의 팔로워 수 일괄 조회 (친구 찾기 결과 표시용)
 * follower_counts RPC로 follows.following_id 기준 집계 (N명을 1쿼리로).
 * 반환: { [userId]: 팔로워수 }. 미설정/실패/데이터 없음이면 빈 객체.
 */
export async function getFollowerCounts(ids: string[]): Promise<Record<string, number>> {
  if (!supabase || ids.length === 0) return {};
  try {
    const { data } = await supabase.rpc('follower_counts', { ids });
    const map: Record<string, number> = {};
    (data as { user_id: string; follower_count: number }[] | null)?.forEach((r) => {
      map[r.user_id] = r.follower_count;
    });
    return map;
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────
// 연락처 기반 친구 찾기 (전화번호 해시 매칭)
// ─────────────────────────────────────────────

/** 전화번호 정규화 — 숫자만, 한국 +82 → 0 보정 */
function normalizePhone(raw: string): string {
  let d = (raw || '').replace(/\D/g, '');
  if (d.startsWith('82') && d.length >= 11) d = '0' + d.slice(2); // +82 10... → 010...
  return d;
}

/** 정규화 후 sha256 해시 (너무 짧으면 빈 문자열) */
export function phoneHash(raw: string): string {
  const n = normalizePhone(raw);
  if (n.length < 9) return '';
  return sha256(n);
}

/** 내 전화 해시 저장(연락처로 나를 찾을 수 있게). 성공 여부 반환 */
export async function saveMyPhoneHash(phone: string): Promise<boolean> {
  if (!supabase) return false;
  const h = phoneHash(phone);
  if (!h) return false;
  const uid = await getMyUserId();
  if (!uid) return false;
  try {
    const { error } = await supabase.from('user_phones').upsert({ user_id: uid, phone_hash: h });
    return !error;
  } catch {
    return false;
  }
}

/** 내 전화 해시 삭제(연락처 매칭 해제) */
export async function deleteMyPhoneHash(): Promise<void> {
  if (!supabase) return;
  const uid = await getMyUserId();
  if (!uid) return;
  try {
    await supabase.from('user_phones').delete().eq('user_id', uid);
  } catch {
    // 무시
  }
}

export interface PhoneMatch {
  id: string;
  handle: string | null;
  nickname: string | null;
  emoji: string | null;
  profile_photo: string | null;
  contactName: string; // 매칭된 연락처의 표시 이름
}

/** 연락처(이름+전화) 목록을 해시해 가입자 매칭 (본인 제외) */
export async function findUsersByPhones(
  contacts: { name: string; phone: string }[]
): Promise<PhoneMatch[]> {
  if (!supabase || contacts.length === 0) return [];
  const hashToName = new Map<string, string>();
  const hashes: string[] = [];
  for (const c of contacts) {
    const h = phoneHash(c.phone);
    if (!h) continue;
    if (!hashToName.has(h)) { hashToName.set(h, c.name); hashes.push(h); }
  }
  if (hashes.length === 0) return [];
  try {
    const { data } = await supabase.rpc('find_users_by_phone_hashes', { hashes });
    return (data as { id: string; handle: string | null; nickname: string | null; emoji: string | null; profile_photo: string | null; phone_hash: string }[] | null ?? []).map((r) => ({
      id: r.id,
      handle: r.handle,
      nickname: r.nickname,
      emoji: r.emoji,
      profile_photo: r.profile_photo,
      contactName: hashToName.get(r.phone_hash) || r.nickname || r.handle || '여행자',
    }));
  } catch {
    return [];
  }
}

/** id로 프로필 조회 (타인 조회용 — PII 제외한 public_profiles 뷰) */
export async function getProfileById(id: string): Promise<ProfileRow | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.from('public_profiles').select('*').eq('id', id).maybeSingle();
    return (data as ProfileRow) ?? null;
  } catch {
    return null;
  }
}
