// Supabase Edge Function: login-with-identifier
// -----------------------------------------------------------------------------
// 이메일 또는 아이디(handle) + 비밀번호로 로그인한다(인스타처럼 아이디 로그인 지원).
//
// 보안 핵심: 아이디로 로그인할 때 "아이디 → 이메일" 조회는 서버(서비스 롤)에서만 수행하고,
// 이메일 주소 자체는 클라이언트에 절대 반환하지 않는다. (공개된 아이디로 타인 이메일을
// 수집하는 것을 막기 위함 — public_profiles 뷰로 PII를 숨기는 이 앱의 설계와 일치)
//
// 배포: supabase functions deploy login-with-identifier
//   (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 는 런타임에 자동 주입됨)
//
// ⚠️ 알려진 한계 — 레이트리밋 왜곡 (감사 2026-08-01, 조치 보류)
//   비밀번호 검증(signInWithPassword)이 사용자의 기기가 아니라 이 Edge Function에서 일어난다.
//   따라서 GoTrue가 보는 클라이언트 IP는 전 사용자가 공유하는 Edge 런타임 IP다. 결과적으로
//     · IP 기준 로그인 레이트리밋이 '전 사용자 합산'으로 걸려, 한 명의 무차별 대입 시도가
//       다른 정상 사용자의 로그인까지 429로 막을 수 있다.
//     · 반대로 공격자 입장에선 IP 단위 차단이 사실상 무의미해진다.
//   실질적인 완화(식별자별 시도 횟수 제한 테이블, Turnstile/캡차, WAF 규칙 등)는 인프라·정책
//   결정이 필요해 이번 감사에서는 문서화만 한다. 도입 시 후보:
//     ① 식별자+시도시각을 기록하는 서버 테이블로 N회/분 제한(개인정보 보존기간 검토 필요)
//     ② 이메일 로그인은 클라이언트에서 직접 signInWithPassword 하고(이미 그럴 수 있다)
//        이 함수는 '아이디 → 이메일 해석'만 담당하도록 축소 — 단 이메일 비노출 원칙과 충돌.
// -----------------------------------------------------------------------------
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'server_misconfigured' }, 500);

  let identifier = '';
  let password = '';
  try {
    const body = await req.json();
    identifier = String(body?.identifier ?? '').trim();
    password = String(body?.password ?? '');
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!identifier || !password) return json({ error: 'bad_request' }, 400);

  // 이메일이면 그대로 사용, 아니면 아이디(handle) → 이메일을 서버에서만 조회
  let email: string | null = null;
  if (identifier.includes('@')) {
    email = identifier.toLowerCase();
  } else {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data, error } = await admin.rpc('email_for_handle', { h: identifier });
    if (error) return json({ error: 'server_error' }, 500);
    email = (data as string | null) ?? null;
  }

  // 존재하지 않는 아이디여도 "잘못된 자격증명"과 동일하게 응답(계정 존재 여부 노출 방지)
  if (!email) return json({ ok: false }, 200);

  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: signIn, error: signErr } = await anon.auth.signInWithPassword({ email, password });
  if (signErr || !signIn?.session) return json({ ok: false }, 200);

  // 세션 토큰만 반환 → 클라이언트가 supabase.auth.setSession 으로 로그인 완료
  return json(
    {
      ok: true,
      session: {
        access_token: signIn.session.access_token,
        refresh_token: signIn.session.refresh_token,
      },
    },
    200,
  );
});
