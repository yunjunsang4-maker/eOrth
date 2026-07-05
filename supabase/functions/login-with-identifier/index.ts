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
