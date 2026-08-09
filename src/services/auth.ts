/**
 * 인증 서비스 (Supabase Auth 래퍼)
 *
 * Supabase 미설정 시 호출부에서 isSupabaseConfigured로 분기하여
 * 기존 모의 로그인 흐름을 유지한다.
 */

import { Platform } from 'react-native';
import { supabase } from './supabase';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import * as Crypto from 'expo-crypto';
import { withTimeout } from '../utils/withTimeout';
import i18n from '../i18n';
import { unregisterPhotoAITask } from '../services/photoAI/backgroundScheduler';
import { APP_SCHEME, APP_VARIANT } from '../utils/appVariant';

// 인증 네트워크 호출 타임아웃(ms) — 응답이 없을 때 무한 대기를 막는다.
const AUTH_TIMEOUT_MS = 15000;

// 사용자가 직접 조작하는 네이티브 단계(구글 계정 선택 시트·Play 서비스 다이얼로그)의 안전장치 타임아웃(ms).
// 통화 수신·앱 전환 등으로 시트가 사라지면 SDK 프라미스가 영영 풀리지 않아 로딩만 계속 도는데,
// 그 상태를 끝내기 위한 상한이다. 정상 조작(계정 선택·비밀번호 입력) 중에는 걸리지 않도록 넉넉히 준다.
const GOOGLE_SHEET_TIMEOUT_MS = 180000;
const PLAY_SERVICES_TIMEOUT_MS = 60000;

// withTimeout이 던진 타임아웃인지 판별 — 취소·구성 오류와 구분해 안내를 다르게 하기 위함.
const isTimeoutError = (e: unknown) => e instanceof Error && e.message === 'timeout';

// OAuth 콜백으로 인앱 브라우저가 돌아왔을 때 세션을 정상 종료시킨다.
// (일부 기기에서 브라우저가 닫히지 않는 문제 예방 — expo-web-browser 권장 호출)
WebBrowser.maybeCompleteAuthSession();

export interface AuthResult {
  ok: boolean;
  /** 가입 후 이메일 인증 대기 상태 (Supabase "Confirm email" 활성화 시) */
  needsEmailConfirm?: boolean;
  /** 사용자가 인증창을 닫아 취소함 (실패 아님 → 오류 알림 생략) */
  cancelled?: boolean;
  error?: string;
}

// Supabase 영문 에러 → 현재 앱 언어 안내(i18n) — 문구는 locales의 authErr.* 참조
const ERROR_KEYS: { match: string; key: string }[] = [
  { match: 'Invalid login credentials', key: 'authErr.invalidCred' },
  { match: 'User already registered', key: 'authErr.alreadyRegistered' },
  { match: 'already been registered', key: 'authErr.emailInUse' },
  { match: 'Email not confirmed', key: 'authErr.emailNotConfirmed' },
  { match: 'Password should be at least', key: 'authErr.pwTooShort' },
  { match: 'Unable to validate email address', key: 'authErr.invalidEmail' },
  { match: 'For security purposes', key: 'authErr.tooMany' },
  // PKCE: 메일 링크를 요청한 기기가 아닌 곳(재설치 포함)에서 열면 code verifier가 없어 실패한다
  { match: 'code verifier', key: 'authErr.codeVerifier' },
  { match: 'Network request failed', key: 'authErr.network' },
  { match: 'timeout', key: 'authErr.timeout' },
];

function toKoMessage(raw: string): string {
  const found = ERROR_KEYS.find((e) => raw.includes(e.match));
  return found ? i18n.t(found.key) : i18n.t('authErr.generic', { raw });
}

// 자주 쓰는 고정 안내 — 언어 전환을 따라가도록 호출 시점에 조회
const msgNotConfigured = () => i18n.t('authErr.notConfigured');

export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: msgNotConfigured() };
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
  if (!supabase) return { ok: false, error: msgNotConfigured() };
  try {
    const { error } = await withTimeout(supabase.auth.signInWithPassword({ email, password }), AUTH_TIMEOUT_MS);
    if (error) return { ok: false, error: toKoMessage(error.message) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toKoMessage(e instanceof Error ? e.message : String(e)) };
  }
}

// 이메일 형식 간이 판별(아이디 로그인 분기용) — 로그인 입력이 이메일인지 아이디인지 구분한다.
const IDENTIFIER_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 이메일 또는 아이디(handle) + 비밀번호로 로그인 (인스타처럼 아이디 로그인 지원).
 *
 * - 이메일이면 기존 경로로 바로 로그인(엣지 함수 불필요).
 * - 아이디면 Edge Function(login-with-identifier)이 서버(서비스 롤)에서만 이메일을 조회해
 *   로그인하고 세션 토큰만 반환한다 → 이메일이 클라이언트에 노출되지 않는다.
 *   (엣지 함수 미배포 시 아이디 로그인은 실패하며 이메일 로그인은 계속 동작한다.)
 */
export async function signInWithIdentifier(identifier: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: msgNotConfigured() };
  const id = identifier.trim();
  if (IDENTIFIER_EMAIL_RE.test(id)) {
    return signInWithEmail(id.toLowerCase(), password);
  }
  try {
    const { data, error } = await withTimeout(
      supabase.functions.invoke('login-with-identifier', { body: { identifier: id, password } }),
      AUTH_TIMEOUT_MS,
    );
    if (error) return { ok: false, error: toKoMessage(error.message || 'Network request failed') };
    // 계정 존재 여부 노출 방지: 아이디 없음/비번 틀림 모두 동일한 일반 메시지로 처리
    if (!data?.ok || !data?.session?.access_token || !data?.session?.refresh_token) {
      return { ok: false, error: i18n.t('authErr.idOrPwWrong') };
    }
    const { error: setErr } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    if (setErr) return { ok: false, error: toKoMessage(setErr.message) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toKoMessage(e instanceof Error ? e.message : String(e)) };
  }
}

/** 가입 인증 메일 재전송 (Confirm email 활성화 시) */
export async function resendEmailConfirmation(email: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: msgNotConfigured() };
  try {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) return { ok: false, error: toKoMessage(error.message) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toKoMessage(e instanceof Error ? e.message : String(e)) };
  }
}

// 비밀번호 재설정 메일 링크가 돌아올 딥링크 (app.json scheme: "eorth" → eorth://reset-password)
const resetPasswordRedirect = AuthSession.makeRedirectUri({ scheme: APP_SCHEME, path: 'reset-password' });

// 이메일 가입 인증 메일 링크가 돌아올 딥링크 (eorth://email-confirm)
const emailConfirmRedirect = AuthSession.makeRedirectUri({ scheme: APP_SCHEME, path: 'email-confirm' });

export async function sendPasswordReset(email: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: msgNotConfigured() };
  try {
    // redirectTo 를 앱 딥링크로 지정 → 메일 링크 클릭 시 앱으로 복귀해 새 비밀번호를 설정할 수 있다.
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: resetPasswordRedirect });
    if (error) return { ok: false, error: toKoMessage(error.message) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toKoMessage(e instanceof Error ? e.message : String(e)) };
  }
}

/**
 * 현재 활성 세션 존재 여부.
 * 딥링크 code 교환이 실패했을 때 "이미 성공한 교환의 중복 시도"인지 판별하는 용도 —
 * 같은 인증 링크가 두 번 전달돼 두 번째 교환이 실패해도, 세션이 있으면 성공으로 취급한다.
 */
export async function hasActiveSession(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  } catch {
    return false;
  }
}

/** 메일 링크의 code 를 세션으로 교환 (비밀번호 재설정·이메일 인증 공용) */
export async function exchangeAuthCode(code: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: msgNotConfigured() };
  try {
    const { error } = await withTimeout(supabase.auth.exchangeCodeForSession(code), AUTH_TIMEOUT_MS);
    if (error) return { ok: false, error: toKoMessage(error.message) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toKoMessage(e instanceof Error ? e.message : String(e)) };
  }
}

/**
 * 이메일 주소 변경 요청 — 즉시 바뀌지 않고 인증 메일 링크를 확인해야 변경이 완료된다.
 * (Supabase 기본 설정은 기존·새 주소 양쪽 확인(Secure email change)일 수 있음 — 안내 문구는 일반형 유지)
 */
export async function requestEmailChange(newEmail: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: msgNotConfigured() };
  try {
    const { error } = await withTimeout(
      supabase.auth.updateUser(
        { email: newEmail.trim().toLowerCase() },
        { emailRedirectTo: emailConfirmRedirect },
      ),
      AUTH_TIMEOUT_MS,
    );
    if (error) return { ok: false, error: toKoMessage(error.message) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toKoMessage(e instanceof Error ? e.message : String(e)) };
  }
}

/** 새 비밀번호로 변경 (복구 세션 또는 로그인 상태에서 호출) */
export async function updatePassword(newPassword: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: msgNotConfigured() };
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: toKoMessage(error.message) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toKoMessage(e instanceof Error ? e.message : String(e)) };
  }
}

// OAuth 콜백이 돌아올 딥링크 (app.json scheme: "eorth" → eorth://auth-callback)
const oauthRedirect = AuthSession.makeRedirectUri({ scheme: APP_SCHEME, path: 'auth-callback' });

/**
 * 네이티브 Apple 로그인 (iOS 전용) — OS 시트(Face ID)로 인증 후 identityToken을 Supabase에 전달.
 * 웹 OAuth와 달리 Services ID·클라이언트 시크릿(6개월 만료 JWT)이 필요 없어 만료로 깨지지 않는다.
 * 필요 설정: ① Apple App ID에 Sign In with Apple capability
 *           ② Supabase > Providers > Apple 활성 + Client IDs에 번들 ID(com.yunjunsang.eorth) 등록
 */
async function signInWithAppleNative(): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: msgNotConfigured() };
  try {
    // 리플레이 방지 nonce — Apple 요청에는 SHA256 해시를 싣고, Supabase 검증에는 원문을 넘긴다
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) return { ok: false, error: i18n.t('authErr.appleTokenMissing') };
    const { error } = await withTimeout(
      supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: rawNonce }),
      AUTH_TIMEOUT_MS,
    );
    if (error) return { ok: false, error: toKoMessage(error.message) };
    return { ok: true };
  } catch (e) {
    // 사용자가 Apple 시트를 닫음 — 실패가 아니라 취소로 구분한다
    if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return { ok: false, cancelled: true };
    return { ok: false, error: toKoMessage(e instanceof Error ? e.message : String(e)) };
  }
}

// ─── Google 네이티브 로그인 클라이언트 ID (Google Cloud 콘솔 > API 및 서비스 > 사용자 인증 정보) ───
// webClientId: Supabase Google provider에 등록된 "웹 애플리케이션" 클라이언트 — idToken의 audience로 쓰인다.
// iosClientId: iOS용 클라이언트 — 발급 후 여기와 app.json의 iosUrlScheme(역방향 표기) 두 곳을 채운다.
//              비어 있으면 iOS는 자동으로 기존 웹 OAuth로 폴백한다.
// Android는 별도 값이 코드에 들어가지 않는 대신, 같은 Google Cloud 프로젝트에
// Android 클라이언트(패키지명 + EAS 키스토어 SHA-1)가 등록돼 있어야 한다(없으면 웹 폴백).
// 정식은 기존 값 고정(G2). 변형은 EAS env로 주입 — 발급 전(빈 값)엔 네이티브를 건너뛰고
// 웹 OAuth 폴백을 타므로 콘솔 작업이 끝나지 않아도 로그인이 막히지 않는다.
const GOOGLE_WEB_CLIENT_ID = APP_VARIANT === 'production'
  ? '589120466593-6uh5al0l88vkg72i78bdjhdcdurbseln.apps.googleusercontent.com'
  : process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const GOOGLE_IOS_CLIENT_ID = APP_VARIANT === 'production'
  ? '589120466593-ak8p39reoek66ksrrqrg2790kohju0a4.apps.googleusercontent.com'
  : process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

// iOS Google SDK는 id_token에 nonce를 자동 포함시키는데 라이브러리(무료판)가 그 값을 지정할 수 없다.
// Supabase는 토큰에 nonce가 있으면 호출 시 같은 값을 요구하므로, 토큰에서 꺼내 그대로 되돌려준다.
function extractNonceFromIdToken(idToken: string): string | undefined {
  try {
    const base64 = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded)).nonce;
  } catch {
    return undefined;
  }
}

let googleConfigured = false;
function ensureGoogleConfigured() {
  if (googleConfigured) return;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    ...(GOOGLE_IOS_CLIENT_ID ? { iosClientId: GOOGLE_IOS_CLIENT_ID } : {}),
  });
  googleConfigured = true;
}

/**
 * 네이티브 Google 로그인 — OS 계정 선택 시트로 인증 후 idToken을 Supabase에 전달.
 * 인앱 브라우저("supabase.co를 사용하려고 합니다" 시스템 창)가 뜨지 않는다.
 * 콘솔 구성이 아직 없거나(iOS 클라이언트 미발급, Android SHA-1 미등록=DEVELOPER_ERROR)
 * Play 서비스가 없는 기기면 기존 웹 OAuth로 자동 폴백해 로그인이 막히지 않게 한다.
 *
 * ⚠️ 폴백은 "구성/환경 문제"일 때만 쓴다. 네트워크 오류·타임아웃까지 폴백으로 넘기면
 *    브라우저가 뜨지 않거나 조용히 닫히면서 아무 안내 없이 로그인 화면으로 돌아가
 *    (사용자에겐 "로딩만 돌다 끊김"으로 보인다) 원인을 알 수 없게 된다.
 */
async function signInWithGoogleNative(): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: msgNotConfigured() };
  // 변형에서 웹 클라이언트 미발급(빈 값) — 네이티브 SDK 구성 자체가 불가능하므로 웹 OAuth로.
  if (!GOOGLE_WEB_CLIENT_ID) {
    return signInWithProviderWeb('google', i18n.t('authErr.googleFallbackFailed'));
  }
  if (Platform.OS === 'ios' && !GOOGLE_IOS_CLIENT_ID) {
    return signInWithProviderWeb('google', i18n.t('authErr.googleFallbackFailed'));
  }
  // 타임아웃이 어느 단계에서 났는지 구분해 안내한다(시트 멈춤 vs 서버 지연).
  let step: 'sheet' | 'token' = 'sheet';
  try {
    ensureGoogleConfigured();
    if (Platform.OS === 'android') {
      await withTimeout(
        GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true }),
        PLAY_SERVICES_TIMEOUT_MS,
      );
    }
    // 웹 방식의 prompt=select_account와 같은 의도 — 항상 계정 선택창을 띄운다
    await GoogleSignin.signOut().catch(() => {});
    const response = await withTimeout(GoogleSignin.signIn(), GOOGLE_SHEET_TIMEOUT_MS);
    if (!isSuccessResponse(response)) return { ok: false, cancelled: true };
    const idToken = response.data.idToken;
    if (!idToken) return { ok: false, error: i18n.t('authErr.googleTokenMissing') };
    const nonce = extractNonceFromIdToken(idToken);
    step = 'token';
    const { error } = await withTimeout(
      supabase.auth.signInWithIdToken({ provider: 'google', token: idToken, ...(nonce ? { nonce } : {}) }),
      AUTH_TIMEOUT_MS,
    );
    if (error) return { ok: false, error: toKoMessage(error.message) };
    return { ok: true };
  } catch (e) {
    // 시트가 응답 없이 멈췄거나 서버가 지연됨 — 폴백하지 않고 사유를 알려 로딩을 끝낸다.
    if (isTimeoutError(e)) {
      return { ok: false, error: i18n.t(step === 'sheet' ? 'authErr.googleSheetTimeout' : 'authErr.timeout') };
    }
    const raw = e instanceof Error ? e.message : String(e);
    if (isErrorWithCode(e)) {
      // 사용자가 시트를 닫음 — 실패가 아니라 취소(안내 없음)
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return { ok: false, cancelled: true };
      // 직전 시도가 아직 매달려 있음 — 조용히 닫지 말고 상태를 알린다
      if (e.code === statusCodes.IN_PROGRESS) return { ok: false, error: i18n.t('authErr.googleInProgress') };
      // 구성/환경 문제일 때만 웹 OAuth로 폴백.
      // 라이브러리 statusCodes에 DEVELOPER_ERROR가 없어 문자열 코드도 함께 본다
      // (Android SHA-1 미등록·클라이언트 ID 불일치는 'DEVELOPER_ERROR' 또는 '10'으로 온다).
      const configCodes = new Set<string>([
        statusCodes.PLAY_SERVICES_NOT_AVAILABLE,
        statusCodes.NULL_PRESENTER,
        'DEVELOPER_ERROR',
        '10',
      ]);
      if (configCodes.has(String(e.code))) {
        return signInWithProviderWeb('google', i18n.t('authErr.googleFallbackFailed'));
      }
      return { ok: false, error: toKoMessage(raw) };
    }
    // 네이티브 모듈이 아예 없는 환경(Expo Go 등)은 웹 OAuth가 유일한 경로라 폴백을 유지한다.
    if (/native module|RNGoogleSign|TurboModuleRegistry|is not available|doesn't exist/i.test(raw)) {
      return signInWithProviderWeb('google', i18n.t('authErr.googleFallbackFailed'));
    }
    // 그 외(네트워크 등)는 폴백으로 삼키지 않고 사유를 그대로 보여준다.
    return { ok: false, error: toKoMessage(raw) };
  }
}

/**
 * 소셜 로그인 (Google / Apple) — 네이티브 우선: Apple은 iOS 네이티브 시트, Google은 네이티브 계정 선택.
 * 그 외/폴백은 Supabase OAuth(PKCE) + 인앱 브라우저.
 */
export async function signInWithProvider(provider: 'google' | 'apple'): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: msgNotConfigured() };
  if (provider === 'apple' && Platform.OS === 'ios') return signInWithAppleNative();
  if (provider === 'google') return signInWithGoogleNative();
  return signInWithProviderWeb(provider);
}

/**
 * 웹 OAuth 폴백 — 동작하려면 Supabase 대시보드 > Authentication > Providers 에서 해당 공급자를 켜고
 * Redirect URL에 위 딥링크를 등록해야 한다.
 */
async function signInWithProviderWeb(
  provider: 'google' | 'apple',
  // 네이티브 실패로 넘어온 폴백이면 그 사유를 받는다. 폴백 흐름에서 브라우저가
  // 성공 없이 끝나면 "취소"로 조용히 닫지 않고 이 사유를 보여준다(원인 없는 끊김 방지).
  fallbackReason?: string,
): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: msgNotConfigured() };
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
    if (error || !data?.url) return { ok: false, error: toKoMessage(error?.message || i18n.t('authErr.oauthUrlFailed')) };

    // CSRF 방어 심화: 인증 시작 URL의 state 를 보관해 콜백 state 와 대조(PKCE code_verifier와 별개 이중 방어)
    const expectedState = new URL(data.url).searchParams.get('state');

    const result = await WebBrowser.openAuthSessionAsync(data.url, oauthRedirect);
    if (result.type !== 'success' || !result.url) {
      // 사용자가 직접 시작한 웹 로그인이면 브라우저를 닫은 것 = 취소(안내 없음).
      // 네이티브 실패로 넘어온 폴백이면 브라우저가 아예 안 뜨거나 콜백이 안 돌아온 경우가 많아,
      // 조용히 닫으면 "로딩만 돌다 끊김"이 된다 — 원래 사유를 알린다.
      if (fallbackReason) return { ok: false, error: fallbackReason };
      return { ok: false, cancelled: true };
    }
    const cbUrl = new URL(result.url);
    // state 불일치(콜백 가로채기 의심)면 코드 교환을 중단한다
    if (expectedState && cbUrl.searchParams.get('state') !== expectedState) {
      return { ok: false, error: i18n.t('authErr.stateMismatch') };
    }
    // 공급자/Supabase 구간에서 실패하면 code 대신 error 파라미터가 담겨 돌아온다 — 실제 원인을 그대로 보여준다
    const cbErr = cbUrl.searchParams.get('error_description') || cbUrl.searchParams.get('error');
    if (cbErr) return { ok: false, error: toKoMessage(cbErr) };
    // PKCE: 콜백 URL의 code 를 세션으로 교환
    const code = cbUrl.searchParams.get('code');
    if (!code) return { ok: false, error: i18n.t('authErr.noAuthCode') };
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

// 의도적 로그아웃(사용자 액션: 로그아웃·탈퇴·비밀번호 재설정) 표시 —
// 전역 SIGNED_OUT 핸들러(AppNavigator)가 "세션 만료" 오탐 안내·강제 이동을 하지 않도록 한다.
let intentionalSignOutAt = 0;
export function wasIntentionalSignOut(withinMs = 5000): boolean {
  return Date.now() - intentionalSignOutAt < withinMs;
}

export async function signOut(): Promise<void> {
  intentionalSignOutAt = Date.now();
  // photoAI 백그라운드 배치 해제 — 해제하지 않으면 로그아웃 후에도 계정과 무관하게
  // 12시간 주기 사진 분석(발열/배터리)이 계속 돈다. (내부에서 예외를 삼키므로 안전)
  unregisterPhotoAITask();
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
