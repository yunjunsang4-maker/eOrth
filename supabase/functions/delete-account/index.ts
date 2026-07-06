// Supabase Edge Function: delete-account
// -----------------------------------------------------------------------------
// 계정 파기 — 탈퇴 유예(30일) 흐름의 서버측 실행부.
//
// 요청: POST { scope: 'content' | 'full' | 'sweep' }
//   - scope='content' : (본인 JWT) 유예 중 "새로 시작" — 게시물·팔로우·DM·알림·Storage 파일 등
//                       모든 콘텐츠를 지우고 계정(auth)과 빈 프로필은 유지한다.
//                       (profiles 행 삭제 → on delete cascade 로 전 테이블 정리 → 빈 행 재생성)
//   - scope='full'    : (본인 JWT) 유예 만료 — Storage 파일 정리 후 auth.users 삭제(→ cascade 전체 파기).
//                       서버가 만료 여부를 직접 검증하므로 클라이언트 시계 조작으로
//                       유예를 건너뛸 수 없다.
//   - scope='sweep'   : (service_role 전용) 유예가 만료됐는데 재로그인하지 않은 계정을
//                       일괄 파기하는 안전망 — pg_cron + pg_net 이 매일 호출한다.
//                       ⚠️ storage.objects 는 SQL 직접 삭제가 트리거로 금지되어 있어
//                       (protect_delete) SQL 함수로는 파일 정리가 불가 → 반드시 이 경로 사용.
//
// 안전장치:
//   - content/full 은 profiles.deletion_requested_at 이 기록된 계정만 파기 가능
//     (탈퇴 신청 없이 토큰만으로 계정을 파기하는 것을 방지)
//   - 'full'/'sweep' 은 신청 후 30일이 지나야 실행된다.
//   - 'sweep' 은 Authorization 토큰이 service_role 키와 일치할 때만 동작.
//
// 배포: supabase functions deploy delete-account --project-ref <ref>
//   (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 는 런타임 자동 주입)
// -----------------------------------------------------------------------------
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GRACE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const MEDIA_BUCKET = 'media';

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

// media/<uid>/ 이하 모든 파일 경로를 재귀 수집 (list는 폴더 단위·비재귀라 직접 순회)
async function listAllFiles(
  admin: ReturnType<typeof createClient>,
  rootDir: string,
): Promise<string[]> {
  const files: string[] = [];
  const dirs = [rootDir];
  while (dirs.length > 0) {
    const dir = dirs.pop()!;
    let offset = 0;
    for (;;) {
      const { data, error } = await admin.storage
        .from(MEDIA_BUCKET)
        .list(dir, { limit: 1000, offset });
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const item of data) {
        const path = `${dir}/${item.name}`;
        // id 가 있으면 파일, 없으면 하위 폴더
        if ((item as { id?: string | null }).id) files.push(path);
        else dirs.push(path);
      }
      if (data.length < 1000) break;
      offset += data.length;
    }
  }
  return files;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'server_misconfigured' }, 500);

  let scope = '';
  try {
    const body = await req.json();
    scope = String(body?.scope ?? '');
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (scope !== 'content' && scope !== 'full' && scope !== 'sweep') {
    return json({ error: 'bad_request' }, 400);
  }

  const authHeader = req.headers.get('Authorization') ?? '';

  // ── sweep: 유예 만료 미복귀 계정 일괄 파기 (pg_cron 안전망, service_role 전용) ──
  if (scope === 'sweep') {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token || token !== serviceKey) return json({ error: 'unauthorized' }, 401);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const cutoff = new Date(Date.now() - GRACE_DAYS * DAY_MS).toISOString();
    const { data: expired, error: listErr } = await admin
      .from('profiles')
      .select('id')
      .not('deletion_requested_at', 'is', null)
      .lt('deletion_requested_at', cutoff)
      .limit(200); // 1회 호출당 상한 — 초과분은 다음 날 실행이 이어서 처리
    if (listErr) return json({ error: 'server_error' }, 500);
    let purged = 0;
    let failed = 0;
    for (const row of (expired ?? []) as { id: string }[]) {
      try {
        const files = await listAllFiles(admin, row.id);
        for (let i = 0; i < files.length; i += 200) {
          const { error: rmErr } = await admin.storage
            .from(MEDIA_BUCKET)
            .remove(files.slice(i, i + 200));
          if (rmErr) throw rmErr;
        }
        const { error: delErr } = await admin.auth.admin.deleteUser(row.id);
        if (delErr) throw delErr;
        purged++;
      } catch {
        failed++; // 한 계정 실패가 나머지 파기를 막지 않게 계속 진행
      }
    }
    return json({ ok: true, purged, failed }, 200);
  }

  // 호출자 JWT 검증 → 파기 대상은 항상 '본인' 계정
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await asCaller.auth.getUser();
  const uid = userData?.user?.id;
  if (userErr || !uid) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 탈퇴 신청된 계정만 파기 가능 (+ 'full'은 서버 기준 유예 만료 검증)
  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('deletion_requested_at')
    .eq('id', uid)
    .maybeSingle();
  if (profErr) return json({ error: 'server_error' }, 500);
  const requestedAtRaw = (profile as { deletion_requested_at?: string | null } | null)
    ?.deletion_requested_at;
  if (!requestedAtRaw) return json({ error: 'no_deletion_request' }, 409);
  if (scope === 'full') {
    const requestedAt = Date.parse(requestedAtRaw);
    if (!Number.isFinite(requestedAt) || Date.now() - requestedAt < GRACE_DAYS * DAY_MS) {
      return json({ error: 'grace_not_expired' }, 403);
    }
  }

  try {
    // 1) Storage 파일 파기 (media/<uid>/ 전체)
    const files = await listAllFiles(admin, uid);
    for (let i = 0; i < files.length; i += 200) {
      const { error: rmErr } = await admin.storage
        .from(MEDIA_BUCKET)
        .remove(files.slice(i, i + 200));
      if (rmErr) throw rmErr;
    }

    if (scope === 'full') {
      // 2) auth 계정 삭제 → profiles 이하 전 테이블 on delete cascade
      const { error: delErr } = await admin.auth.admin.deleteUser(uid);
      if (delErr) throw delErr;
    } else {
      // 2) 콘텐츠만 파기: profiles 행 삭제(cascade) 후 빈 프로필 재생성
      //    (feedback.user_id 는 on delete set null 로 익명화되어 보존됨)
      const { error: delErr } = await admin.from('profiles').delete().eq('id', uid);
      if (delErr) throw delErr;
      const { error: insErr } = await admin
        .from('profiles')
        .upsert({ id: uid }, { onConflict: 'id' });
      if (insErr) throw insErr;
    }
  } catch {
    return json({ error: 'purge_failed' }, 500);
  }

  return json({ ok: true }, 200);
});
