/**
 * 프로필 서비스 (Supabase profiles 테이블)
 *
 * Supabase 미설정 시 모든 함수는 무력화(null/[]) → 앱은 기존 로컬 동작 유지.
 * 사진(profile_photo)은 공개 URL일 때만 저장한다(로컬 file:// 경로는 타인이 못 봄 → Storage 업로드는 2단계).
 */

import { supabase } from './supabase';
import { sortByHandleRelevance, dedupeById } from '../utils/handleSearch';
import { withTimeout } from '../utils/withTimeout';

const READ_TIMEOUT_MS = 12000;

export interface ProfileRow {
  id: string;
  handle: string | null;
  emoji: string | null;
  bio: string | null;
  onboarded_at: string | null; // 온보딩 완료 시각(ISO). null=미완료 — 예전 birthday 역할을 대신한다
  country?: string | null; // 거주 국가 코드(예: KR). 소유자 전용(public_profiles 뷰엔 없음)
  profile_photo: string | null;
  handle_font?: string | null; // 아이디 표시 폰트 id (프리미엄) — HANDLE_FONTS 참조
  stay_country?: string | null; // 장기체류 국가 ISO 코드 — 메이트에게만 공개(public_profiles 조건부 노출)
  stay_status?: string | null;  // 'active' | null
  dna_type_key?: string | null; // 여행 DNA 유형 키 — public_profiles가 공개하는 유일한 설문 필드(축 점수는 비공개)
  mate_reco_optin?: boolean | null; // 메이트 추천 활용 동의 — null=미결정(유예). fetchMateRecoOptin 주석 참조
}

/**
 * 현재 로그인 사용자 id (없으면 null) — 로컬 세션에서 읽는다.
 * auth.getUser()는 서버 왕복이라 오프라인/오지에서는 이 함수를 쓰는 '모든 서비스 호출'이
 * 타임아웃(12초)까지 지연됐다. uid는 저장된 세션의 클레임으로 충분하다(만료돼도 id는 동일,
 * 이후 실제 API 호출이 인증을 최종 검증한다).
 */
export async function getMyUserId(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
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

/** 내 계정 생성일(profiles.created_at) — 마이 티켓 'eOrth 가입 날' 표시용. 실패 시 null */
export async function getMyJoinedAt(): Promise<string | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  try {
    const { data } = await withTimeout(
      supabase.from('profiles').select('created_at').eq('id', uid).maybeSingle(),
      READ_TIMEOUT_MS,
    );
    return (data as { created_at?: string } | null)?.created_at ?? null;
  } catch {
    return null;
  }
}

/**
 * 메이트 추천에 내 여행 기록을 쓰는 것에 대한 선택 동의 값.
 *
 * 3-상태다(schema.sql의 mate_reco_optin 주석과 같은 규칙):
 *   null  — 아직 물어보지 않음(기존 이용자). 종전대로 추천에 포함되는 상태다.
 *   true  — 동의
 *   false — 거부. 내 방문 국가가 '다른 사람의' 추천·겹침·나라별 방문자 목록에 쓰이지 않는다.
 *
 * 서버에 못 닿았을 때도 null이라 '미결정'과 구분되지 않는다 — 화면은 이 값을
 * `!== false`(=포함됨)로만 읽으므로, 통신 실패 시 토글이 켜진 상태로 보이고
 * 실제 서버 상태도 그대로다(임의로 꺼진 것처럼 보이지 않는다).
 */
export async function fetchMateRecoOptin(): Promise<boolean | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  try {
    const { data, error } = await withTimeout(
      supabase.from('profiles').select('mate_reco_optin').eq('id', uid).maybeSingle(),
      READ_TIMEOUT_MS,
    );
    if (error) return null;
    return (data as { mate_reco_optin?: boolean | null } | null)?.mate_reco_optin ?? null;
  } catch {
    return null;
  }
}

/** 위 동의 값 저장. 성공 여부를 돌려주고, 실패하면 화면이 토글을 되돌린다. */
export async function saveMateRecoOptin(optin: boolean): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await withTimeout(
      supabase.rpc('set_mate_reco_optin', { p_optin: optin }),
      READ_TIMEOUT_MS,
    );
    return !error;
  } catch {
    return false;
  }
}

/**
 * 온보딩 완료를 서버에 기록한다. 이 값이 있으면 다음 실행부터 Main으로 바로 간다.
 *
 * 예전에는 birthday 유무로 판정했으나 App Store 5.1.1(v) 지적으로 생년월일 수집을
 * 폐지하면서 전용 컬럼으로 옮겼다.
 *
 * ⚠️ update 가 아니라 upsertMyProfile 을 쓴다. handle_new_user 트리거가 지연되면
 *    profiles 행이 아직 없을 수 있는데(schema.sql:879 주석이 그 사례를 적고 있다),
 *    update 는 그때 0행을 갱신하고도 error 없이 성공을 반환한다. 그러면 서버에 값이
 *    남지 않아 다음 실행에 사용자가 온보딩으로 되돌아간다. upsert 는 행을 만들어 준다.
 */
export async function markOnboarded(): Promise<boolean> {
  const { ok } = await upsertMyProfile({ onboarded_at: new Date().toISOString() });
  return ok;
}

/**
 * 내 프로필 조회 + 서버 도달 여부.
 * reached=false 면 네트워크/타임아웃으로 "신규인지 기존인지" 판정 불가 → 호출부가 오라우팅을 피할 수 있다.
 */
export async function getMyProfileStatus(): Promise<{ reached: boolean; profile: ProfileRow | null }> {
  if (!supabase) return { reached: false, profile: null };
  const uid = await getMyUserId();
  if (!uid) return { reached: false, profile: null };
  try {
    const { data, error } = await withTimeout(
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      READ_TIMEOUT_MS,
    );
    if (error) return { reached: false, profile: null };
    return { reached: true, profile: (data as ProfileRow) ?? null };
  } catch {
    return { reached: false, profile: null };
  }
}

/** 핸들(아이디)로 사용자 검색 (메이트 찾기용). 실패는 throw — 화면이 "검색 실패"와 "결과 없음"을 구분한다 */
export async function searchProfiles(query: string): Promise<ProfileRow[]> {
  if (!supabase) return [];
  // '@아이디' 형태 입력 허용 (QR 스캔과 동일하게 앞의 @ 제거)
  const q = query.trim().replace(/^@/, '');
  if (!q) return [];
  // ilike 와일드카드(%·_)·이스케이프 문자를 리터럴로 취급 (검색어 오작동 방지)
  const escaped = q.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  // 타인 검색은 PII(birthday/gender) 제외한 public_profiles 뷰로 조회 (프로필 PII 노출 방지)
  //
  // 정확 일치를 따로 조회해 합치는 이유: 부분 검색은 서버에서 limit으로 잘리므로, 흔한
  // 문자열을 검색하면 정확히 그 아이디인 사람이 20건 밖으로 밀려 아예 안 보일 수 있다.
  // (handle은 UNIQUE라 정확 일치는 최대 1건 — 비용이 사실상 없다)
  const [exactRes, partialRes] = await Promise.all([
    supabase.from('public_profiles').select('*').ilike('handle', escaped).limit(1),
    supabase.from('public_profiles').select('*').ilike('handle', `%${escaped}%`).limit(20),
  ]);
  // 부분 검색 실패만 오류로 취급(기존 동작 유지). 정확 조회 실패는 부분 결과로 진행한다.
  if (partialRes.error) throw partialRes.error;
  const merged = dedupeById([
    ...((exactRes.data as ProfileRow[]) ?? []),
    ...((partialRes.data as ProfileRow[]) ?? []),
  ]);
  // 서버는 관련도 순서를 주지 않는다 — 정확 → 접두 → 부분 순으로 다시 세운다
  return sortByHandleRelevance(merged, q);
}

/**
 * 여러 사용자의 방문 국가 수 일괄 조회 (메이트 찾기 결과 표시용)
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
 * 여러 사용자의 메이트 수 일괄 조회 (메이트 찾기 결과 표시용)
 * neighbor_counts RPC로 메이트(서로메이트) 수 집계 (N명을 1쿼리로).
 * 반환: { [userId]: 메이트수 }. 미설정/실패/데이터 없음이면 빈 객체.
 */
export async function getFollowerCounts(ids: string[]): Promise<Record<string, number>> {
  if (!supabase || ids.length === 0) return {};
  try {
    const { data } = await supabase.rpc('neighbor_counts', { ids });
    const map: Record<string, number> = {};
    (data as { user_id: string; neighbor_count: number }[] | null)?.forEach((r) => {
      map[r.user_id] = r.neighbor_count;
    });
    return map;
  } catch {
    return {};
  }
}

/**
 * 아이디(handle) 사용 가능 여부 검사 (온보딩·프로필 편집 중복 방지용).
 * 반환: true=사용 가능, false=이미 사용 중, null=검사 불가(미설정/오류) → 호출부는 null이면 통과 처리.
 * (최종 방어는 profiles.handle UNIQUE 제약)
 */
export async function isHandleAvailable(handle: string): Promise<boolean | null> {
  if (!supabase) return null;
  const h = handle.trim();
  if (!h) return false;
  try {
    const { data, error } = await withTimeout(supabase.rpc('is_handle_available', { h }), READ_TIMEOUT_MS);
    if (error) return null;
    return !!data;
  } catch {
    return null;
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

/** 핸들 정확 일치로 프로필 조회 (차단 항목 uuid 백필 등) — 없음/실패 시 null */
export async function getProfileByHandle(handle: string): Promise<ProfileRow | null> {
  if (!supabase) return null;
  const h = handle.trim();
  if (!h) return null;
  try {
    const { data } = await supabase.from('public_profiles').select('*').eq('handle', h).maybeSingle();
    return (data as ProfileRow) ?? null;
  } catch {
    return null;
  }
}
