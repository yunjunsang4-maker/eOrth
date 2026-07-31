// Supabase Edge Function: report-alert
// -----------------------------------------------------------------------------
// 신고 접수(reports insert) DB 트리거 → 이 함수 호출 → 운영자 이메일 알림(Resend).
// 트리거는 schema.sql의 reports_email_alert (supabase_functions.http_request) 참고.
//
// 보안: 요청 body는 신고 id를 얻는 용도로만 쓰고, 내용은 service role로 reports 테이블을
// 재조회해 확인한 뒤에만 발송한다(공개 anon key로 위조 신고 메일을 보내는 것 방지).
//
// 배포: supabase functions deploy report-alert
// 시크릿(최초 1회):
//   supabase secrets set RESEND_API_KEY=re_xxxx REPORT_ALERT_EMAIL=운영자이메일
//   (선택) REPORT_ALERT_FROM=알림발신주소 — Resend에 도메인 인증 후 변경.
//   미설정 시 onboarding@resend.dev 사용: 이 발신자는 Resend 가입 계정의
//   이메일로만 발송 가능하므로 REPORT_ALERT_EMAIL은 Resend 가입 이메일이어야 한다.
// -----------------------------------------------------------------------------
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const alertTo = Deno.env.get('REPORT_ALERT_EMAIL');
  if (!resendKey || !alertTo) return new Response('server_misconfigured', { status: 500 });

  // DB 웹훅 표준 payload: { type:'INSERT', table:'reports', record:{...} }
  // ⚠️ payload의 record는 신뢰하지 않는다 — 이 함수는 공개 anon key만으로 호출 가능하므로
  //    body를 그대로 믿으면 누구나 위조 신고 메일을 무한 발송할 수 있었다(감사 2026-08-01).
  //    send-push와 동일하게 record.id 만 뽑아 service role로 reports 를 재조회하고,
  //    메일 본문은 DB에서 읽은 행 기준으로만 만든다.
  let reportId: string | null = null;
  try {
    const body = await req.json();
    if (body?.type !== 'INSERT' || body?.table !== 'reports') {
      return new Response('ignored', { status: 200 });
    }
    reportId = body.record?.id ? String(body.record.id) : null;
  } catch {
    return new Response('bad_request', { status: 400 });
  }
  if (!reportId) return new Response('ignored', { status: 200 });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  // 검증할 수 없으면 발송하지 않는다(위조 방어가 목적이므로 '검증 생략 폴백'을 두지 않는다)
  if (!url || !serviceKey) return new Response('server_misconfigured', { status: 500 });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // ① 신고 행 재조회 — 없으면 위조/이미 삭제됨. 5분 초과면 재전송 공격 완화 차원에서 무시.
  const { data: record, error: recordError } = await admin
    .from('reports')
    .select('id, reporter_id, post_id, reason, created_at')
    .eq('id', reportId)
    .maybeSingle();
  if (recordError) {
    console.error('report_fetch_error', recordError.message);
    return new Response('db_error', { status: 500 });
  }
  if (!record) {
    console.warn('report_not_found', reportId);
    return new Response('ignored', { status: 200 });
  }
  if (Date.now() - new Date(record.created_at as string).getTime() > 5 * 60 * 1000) {
    console.warn('report_too_old', reportId);
    return new Response('ignored', { status: 200 });
  }

  const reporterId = String(record.reporter_id ?? '');
  const postId = record.post_id ? String(record.post_id) : null;

  // ② 신고자·게시물 작성자 핸들 조회 — 실패해도 알림 발송은 계속한다
  let reporter = reporterId || '(알 수 없음)';
  let target = '';
  try {
    if (reporterId) {
      const { data: rep } = await admin.from('profiles').select('handle').eq('id', reporterId).maybeSingle();
      if (rep?.handle) reporter = `@${rep.handle} (${reporterId})`;
    }
    if (postId) {
      const { data: post } = await admin.from('posts').select('author_id').eq('id', postId).maybeSingle();
      if (post?.author_id) {
        const { data: author } = await admin.from('profiles').select('handle').eq('id', post.author_id).maybeSingle();
        target = `게시물 ${postId}${author?.handle ? ` (작성자 @${author.handle})` : ''}`;
      } else {
        target = `게시물 ${postId} (삭제됨/조회 불가)`;
      }
    }
  } catch {
    // 조회 실패 무시 — 원본 id만으로 발송
  }

  // 사용자 신고는 post_id 없이 reason에 "[user @핸들 uuid] 사유" 형식으로 들어온다 (FriendProfileScreen)
  const isUserReport = !postId;
  const subject = isUserReport ? '[eOrth] 사용자 신고 접수' : '[eOrth] 게시물 신고 접수';
  const lines = [
    `종류: ${isUserReport ? '사용자 신고' : '게시물 신고'}`,
    `신고자: ${reporter}`,
    target ? `대상: ${target}` : null,
    `사유: ${record.reason ?? '(없음)'}`,
    `시각: ${record.created_at ?? ''}`,
    '',
    '전체 내역: Supabase 대시보드 > Table Editor > reports',
  ].filter(Boolean);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('REPORT_ALERT_FROM') ?? 'eOrth 신고 알림 <onboarding@resend.dev>',
      to: [alertTo],
      subject,
      text: lines.join('\n'),
    }),
  });
  if (!res.ok) {
    // Resend 오류 원문을 로그·응답에 남긴다 — "email_failed"만으로는 원인(수신자 제한,
    // 키 오류 등) 진단이 불가능했다. 시크릿은 포함되지 않는 안전한 메시지다.
    const detail = await res.text().catch(() => '');
    console.error('resend_failed', res.status, detail);
    return new Response(`email_failed: ${res.status} ${detail}`, { status: 500 });
  }
  return new Response('ok', { status: 200 });
});
