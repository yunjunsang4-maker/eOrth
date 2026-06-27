/**
 * 프로필 서비스 (Supabase profiles 테이블)
 *
 * Supabase 미설정 시 모든 함수는 무력화(null/[]) → 앱은 기존 로컬 동작 유지.
 * 사진(profile_photo)은 공개 URL일 때만 저장한다(로컬 file:// 경로는 타인이 못 봄 → Storage 업로드는 2단계).
 */

import { sha256 } from 'js-sha256';
import { supabase } from './supabase';

export interface ProfileRow {
  id: string;
  handle: string | null;
  nickname: string | null;
  emoji: string | null;
  bio: string | null;
  birthday: string | null; // YYYY-MM-DD
  gender: string | null;
  profile_photo: string | null;
}

/** 현재 로그인 사용자 id (없으면 null) */
export async function getMyUserId(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/** 내 프로필 생성/갱신 (빈 문자열은 null로 저장) */
export async function upsertMyProfile(p: Partial<Omit<ProfileRow, 'id'>>): Promise<void> {
  if (!supabase) return;
  const uid = await getMyUserId();
  if (!uid) return;
  const row: Record<string, unknown> = { id: uid };
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined) continue;
    row[k] = v === '' ? null : v;
  }
  try {
    await supabase.from('profiles').upsert(row);
  } catch {
    // 네트워크 실패는 무시 (다음 변경 시 재시도)
  }
}

/** 내 프로필 조회 */
export async function getMyProfile(): Promise<ProfileRow | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  try {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
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
    const { data } = await supabase
      .from('profiles')
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

/** id로 프로필 조회 */
export async function getProfileById(id: string): Promise<ProfileRow | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
    return (data as ProfileRow) ?? null;
  } catch {
    return null;
  }
}
