/**
 * 인증 서비스 (Supabase Auth 래퍼)
 *
 * Supabase 미설정 시 호출부에서 isSupabaseConfigured로 분기하여
 * 기존 모의 로그인 흐름을 유지한다.
 */

import { supabase } from './supabase';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { withTimeout } from '../utils/withTimeout';

// 인증 네트워크 호출 타임아웃(ms) — 응답이 없을 때 무한 대기를 막는다.
const AUTH_TIMEOUT_MS = 15000;

// OAuth 콜백으로 인앱 브라우저가 돌아왔을 때 세션을 정상 종료시킨다.
// (일부 기기에서 브라우저가 닫히지 않는 문제 예방 — expo-web-browser 권장 호출)
WebBrowser.maybeCompleteAuthSession();

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
  { match: 'timeout', message: '응답이 지연되고 있어요.\n네트워크를 확인한 뒤 다시 시도해주세요.' },
];

function toKoMessage(raw: string): string {
  const found = ERROR_KO.find((e) => raw.includes(e.match));
  return found ? found.message : `로그인 처리 중 문제가 발생했어요.\n(${raw})`;
}

export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: 'Supabase가 설정되지 않았어요.' };
  try {
    // emailRedirectTo: 인증 메일 링크 클릭 시 앱으로 복귀(eorth://email-confirm)해 자동 로그인/온보딩으로 이어진다.
    const { data, error } = await withTimeout(supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: emailConfirmRedirect },
    }), AUTH_TIMEOUT_MS);
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
    const { error } = await withTimeout(supabase.auth.signInWithPassword({ email, password }), AUTH_TIMEOUT_MS);
    if (error) return { ok: false, error: toKoMessage(error.message) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toKoMessage(e instanceof Error ? e.message : String(e)) };
  }
}

/** 가입 인증 메일 재전송 (Confirm email 활성화 시) */
export async function resendEmailConfirmation(email: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: 'Supabase가 설정되지 않았어요.' };
  try {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) return { ok: false, error: toKoMessage(error.message) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toKoMessage(e instanceof Error ? e.message : String(e)) };
  }
}

// 비밀번호 재설정 메일 링크가 돌아올 딥링크 (app.json scheme: "eorth" → eorth://reset-password)
const resetPasswordRedirect = AuthSession.makeRedirectUri({ scheme: 'eorth', path: 'reset-password' });

// 이메일 가입 인증 메일 링크가 돌아올 딥링크 (eorth://email-confirm)
const emailConfirmRedirect = AuthSession.makeRedirectUri({ scheme: 'eorth', path: 'email-confirm' });

export async function sendPasswordReset(email: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: 'Supabase가 설정되지 않았어요.' };
  try {
    // redirectTo 를 앱 딥링크로 지정 → 메일 링크 클릭 시 앱으로 복귀해 새 비밀번호를 설정할 수 있다.
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: resetPasswordRedirect });
    if (error) return { ok: false, error: toKoMessage(error.message) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toKoMessage(e instanceof Error ? e.message : String(e)) };
  }
}

/** 메일 링크의 code 를 세션으로 교환 (비밀번호 재설정·이메일 인증 공용) */
export async function exchangeAuthCode(code: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: 'Supabase가 설정되지 않았어요.' };
  try {
    const { error } = await withTimeout(supabase.auth.exchangeCodeForSession(code), AUTH_TIMEOUT_MS);
    if (error) return { ok: false, error: toKoMessage(error.message) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toKoMessage(e instanceof Error ? e.message : String(e)) };
  }
}

/** 새 비밀번호로 변경 (복구 세션 또는 로그인 상태에서 호출) */
export async function updatePassword(newPassword: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: 'Supabase가 설정되지 않았어요.' };
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: toKoMessage(error.message) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toKoMessage(e instanceof Error ? e.message : String(e)) };
  }
}

// OAuth 콜백이 돌아올 딥링크 (app.json scheme: "eorth" → eorth://auth-callback)
const oauthRedirect = AuthSession.makeRedirectUri({ scheme: 'eorth', path: 'auth-callback' });

/**
 * 소셜 로그인 (Google / Apple) — Supabase OAuth(PKCE) + 인앱 브라우저.
 * 동작하려면 Supabase 대시보드 > Authentication > Providers 에서 해당 공급자를 켜고
 * Redirect URL에 위 딥링크를 등록해야 한다.
 */
export async function signInWithProvider(provider: 'google' | 'apple'): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: 'Supabase가 설정되지 않았어요.' };
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: oauthRedirect,
        skipBrowserRedirect: true,
        // 브라우저에 캐시된 계정으로 자동 로그인되어 항상 같은 계정으로 들어가는 것을 방지.
        // 구글은 매번 계정 선택창을 강제한다(애플은 해당 파라미터 미지원).
        queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
      },
    });
    if (error || !data?.url) return { ok: false, error: toKoMessage(error?.message || '로그인 URL 생성 실패') };

    // CSRF 방어 심화: 인증 시작 URL의 state 를 보관해 콜백 state 와 대조(PKCE code_verifier와 별개 이중 방어)
    const expectedState = new URL(data.url).searchParams.get('state');

    const result = await WebBrowser.openAuthSessionAsync(data.url, oauthRedirect);
    if (result.type !== 'success' || !result.url) {
      return { ok: false, error: '로그인이 취소되었어요.' };
    }
    const cbUrl = new URL(result.url);
    // state 불일치(콜백 가로채기 의심)면 코드 교환을 중단한다
    if (expectedState && cbUrl.searchParams.get('state') !== expectedState) {
      return { ok: false, error: '인증 상태 검증에 실패했어요. 다시 시도해주세요.' };
    }
    // PKCE: 콜백 URL의 code 를 세션으로 교환
    const code = cbUrl.searchParams.get('code');
    if (!code) return { ok: false, error: '인증 코드를 받지 못했어요.' };
    const { error: exErr } = await withTimeout(supabase.auth.exchangeCodeForSession(code), AUTH_TIMEOUT_MS);
    if (exErr) return { ok: false, error: toKoMessage(exErr.message) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toKoMessage(e instanceof Error ? e.message : String(e)) };
  }
}

/**
 * 현재 인증된 사용자의 원래 가입 수단(provider) 반환.
 * 연동(linked) 계정이면 최초 가입 provider가 나온다(app_metadata.provider).
 * → 소셜 로그인이 기존 이메일 계정의 signUpMethod를 잘못 덮어쓰지 않도록 판별용.
 */
export async function getAuthProvider(): Promise<'email' | 'google' | 'apple' | null> {
  if (!supabase) return null;
  try {
    const { data } = await withTimeout(supabase.auth.getUser(), AUTH_TIMEOUT_MS);
    const p = data.user?.app_metadata?.provider;
    if (p === 'email' || p === 'google' || p === 'apple') return p;
    return null;
  } catch {
    return null;
  }
}

/** 현재 인증된 사용자의 이메일 (소셜 로그인 시 표시·문의용). 없으면 null. */
export async function getAuthEmail(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await withTimeout(supabase.auth.getUser(), AUTH_TIMEOUT_MS);
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.auth.signOut();
    // 서버 revoke 실패(네트워크 등)에도 로컬 세션(토큰)은 확실히 제거한다.
    if (error) await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  } catch {
    // 예외 시에도 최소한 로컬 세션은 지워 토큰 잔류를 막는다.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
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
