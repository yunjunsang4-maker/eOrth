/**
 * 인증 서비스 (Supabase Auth 래퍼)
 *
 * Supabase 미설정 시 호출부에서 isSupabaseConfigured로 분기하여
 * 기존 모의 로그인 흐름을 유지한다.
 */

import { supabase } from './supabase';

export interface AuthResult {
  ok: boolean;
  /** 가입 후 이메일 인증 대기 상태 (Supabase "Confirm email" 활성화 시) */
  needsEmailConfirm?: boolean;
  error?: string;
}

// Supabase 영문 에러 → 한글 안내
const ERROR_KO: { match: string; message: string }[] = [
  { match: 'Invalid login credentials', message: '이메일 또는 비밀번호가 올바르지 않아요.' },
  { match: 'User already registered', message: '이미 가입된 이메일이에요. 로그인해주세요.' },
  { match: 'Email not confirmed', message: '이메일 인증이 완료되지 않았어요.\n받은 편지함을 확인해주세요.' },
  { match: 'Password should be at least', message: '비밀번호는 6자 이상이어야 해요.' },
  { match: 'Unable to validate email address', message: '올바른 이메일 형식이 아니에요.' },
  { match: 'For security purposes', message: '잠시 후 다시 시도해주세요.' },
  { match: 'Network request failed', message: '네트워크 연결을 확인해주세요.' },
];

function toKoMessage(raw: string): string {
  const found = ERROR_KO.find((e) => raw.includes(e.match));
  return found ? found.message : `로그인 처리 중 문제가 발생했어요.\n(${raw})`;
}

export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: 'Supabase가 설정되지 않았어요.' };
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { ok: false, error: toKoMessage(error.message) };
    // 이메일 인증이 켜져 있으면 session 없이 user만 반환된다
    if (data.user && !data.session) return { ok: true, needsEmailConfirm: true };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toKoMessage(e instanceof Error ? e.message : String(e)) };
  }
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: 'Supabase가 설정되지 않았어요.' };
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: toKoMessage(error.message) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toKoMessage(e instanceof Error ? e.message : String(e)) };
  }
}

export async function sendPasswordReset(email: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: 'Supabase가 설정되지 않았어요.' };
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) return { ok: false, error: toKoMessage(error.message) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toKoMessage(e instanceof Error ? e.message : String(e)) };
  }
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch {
    // 로그아웃 실패는 무시 (로컬 세션은 supabase-js가 정리)
  }
}

/** 저장된 세션 반환 (없으면 null) — 자동 로그인 판단용 */
export async function getCurrentSession() {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session;
  } catch {
    return null;
  }
}
