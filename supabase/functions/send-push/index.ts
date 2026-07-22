// Supabase Edge Function: send-push
// -----------------------------------------------------------------------------
// notifications insert DB 트리거 → 이 함수 호출 → Expo Push API로 푸시 발송.
// 트리거는 schema.sql의 notifications_push (net.http_post 패턴) 참고.
//
// 배포: supabase functions deploy send-push
// 시크릿: 별도 설정 불필요 — SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 자동 주입됨.
// -----------------------------------------------------------------------------
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── 알림 수신 설정 키 매핑 ──────────────────────────────────────────────────
// notifPrefs 저장 키 → push_tokens.prefs 조회 키
const PREF_KEY: Record<string, string> = {
  like: 'likes',
  comment: 'likes', // 좋아요·댓글은 같은 'likes' 토글
  neighbor_request: 'newFollower',
  neighbor_accept: 'newFollower',
  friend_post: 'friendTrip',
};

// master=false 면 모든 푸시 스킵.
// marketing은 명시적 true가 없으면 기본 거부.
// 나머지는 키 없으면(=미설정) 기본 허용.
function isPushAllowed(prefs: Record<string, unknown>, notifType: string): boolean {
  if (prefs.master === false) return false;

  const prefKey = PREF_KEY[notifType];
  if (!prefKey) return false; // 알 수 없는 타입 — 스킵

  if (prefKey === 'marketing') return prefs.marketing === true; // 기본 거부

  const val = prefs[prefKey];
  return val === undefined || val === true; // 미설정 = 허용
}

// ── Expo 푸시 메시지 빌더 ───────────────────────────────────────────────────
interface NotifRecord {
  id: string;
  user_id: string;
  type: string;
  actor_id: string;
  post_id: string | null;
  read: boolean;
  created_at: string;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
  badge?: number;
}

function buildMessage(
  token: string,
  notif: NotifRecord,
  actorHandle: string,
): ExpoPushMessage {
  const name = actorHandle ? `@${actorHandle}` : '누군가';
  let title = 'eOrth';
  let body = '';

  switch (notif.type) {
    case 'like':
      body = `${name}님이 회원님의 여행을 좋아해요`;
      break;
    case 'comment':
      body = `${name}님이 댓글을 남겼어요`;
      break;
    case 'neighbor_request':
      body = `${name}님이 메이트 신청을 보냈어요`;
      break;
    case 'neighbor_accept':
      body = `${name}님이 메이트 신청을 수락했어요`;
      break;
    case 'friend_post':
      body = `${name}님이 새 여행 기록을 올렸어요`;
      break;
    default:
      body = '새 알림이 있어요';
  }

  return {
    to: token,
    title,
    body,
    sound: 'default',
    data: {
      type: notif.type,
      notifId: notif.id,
      actorId: notif.actor_id,
      postId: notif.post_id ?? undefined,
    },
  };
}

// ── Expo Push API 청크 발송 (100개 단위) ────────────────────────────────────
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;

interface ExpoPushReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

async function sendChunk(
  messages: ExpoPushMessage[],
): Promise<{ [ticketId: string]: ExpoPushReceipt }> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`expo_push_failed: ${res.status} ${text}`);
  }
  const json = await res.json();
  // Expo API는 { data: [...] } 배열 반환
  return json?.data ?? {};
}

// ── 메인 핸들러 ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });

  // DB 웹훅 표준 payload 파싱 — payload의 record는 신뢰하지 않고 notifId 추출용으로만 사용
  let notifId: string | null = null;
  let payloadUserId: string | null = null;
  let payloadType: string | null = null;
  try {
    const body = await req.json();
    if (body?.type !== 'INSERT' || body?.table !== 'notifications') {
      return new Response('ignored', { status: 200 });
    }
    notifId = body.record?.id ?? null;
    payloadUserId = body.record?.user_id ?? null;
    payloadType = body.record?.type ?? null;
  } catch {
    return new Response('bad_request', { status: 400 });
  }
  if (!notifId || !payloadUserId || !payloadType) {
    return new Response('ignored', { status: 200 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return new Response('server_misconfigured', { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // ① DB 재조회로 알림 실존·일치·최신성 검증
  // — 행이 없으면: 위조 또는 이미 삭제된 알림 → 무시
  // — user_id/type 불일치: payload 위조 시도 → 403
  // — created_at이 5분 초과: 재전송 공격 완화 → 무시
  const { data: notif, error: notifError } = await admin
    .from('notifications')
    .select('id, user_id, type, actor_id, post_id, read, created_at')
    .eq('id', notifId)
    .maybeSingle();

  if (notifError) {
    console.error('notif_fetch_error', notifError.message);
    return new Response('db_error', { status: 500 });
  }
  if (!notif) {
    console.warn('notif_not_found', notifId);
    return new Response('ignored', { status: 200 });
  }
  if (notif.user_id !== payloadUserId || notif.type !== payloadType) {
    console.warn('notif_payload_mismatch', { notifId, payloadUserId, payloadType });
    return new Response('forbidden', { status: 403 });
  }
  // 재전송 공격 완화: 5분 이내 생성된 알림만 발송 (created_at 컬럼 확인됨)
  const ageMs = Date.now() - new Date(notif.created_at).getTime();
  if (ageMs > 5 * 60 * 1000) {
    console.warn('notif_too_old', { notifId, ageMs });
    return new Response('ignored', { status: 200 });
  }

  // ② 행위자 핸들 조회 (payload 대신 DB 조회 행 기준)
  let actorHandle = '';
  try {
    const { data: actor } = await admin
      .from('profiles')
      .select('handle')
      .eq('id', notif.actor_id)
      .maybeSingle();
    actorHandle = actor?.handle ?? '';
  } catch {
    // 조회 실패 시 빈 핸들로 진행
  }

  // ③ 수신자 push_tokens 조회 (prefs 포함)
  const { data: tokens, error: tokensError } = await admin
    .from('push_tokens')
    .select('token, prefs')
    .eq('user_id', notif.user_id);

  if (tokensError) {
    console.error('push_tokens_fetch_error', tokensError.message);
    return new Response('db_error', { status: 500 });
  }
  if (!tokens || tokens.length === 0) {
    return new Response('no_tokens', { status: 200 });
  }

  // ④ prefs 게이트 + 메시지 빌드
  const messages: ExpoPushMessage[] = [];
  const validTokens: string[] = [];

  for (const row of tokens) {
    const prefs = (row.prefs as Record<string, unknown>) ?? {};
    if (!isPushAllowed(prefs, notif.type)) continue;
    if (!row.token || !row.token.startsWith('ExponentPushToken[')) continue;

    messages.push(buildMessage(row.token, notif, actorHandle));
    validTokens.push(row.token);
  }

  if (messages.length === 0) {
    return new Response('all_filtered', { status: 200 });
  }

  // ⑤ 100개 단위 청크 발송 + DeviceNotRegistered 토큰 수집
  const staleTokens: string[] = [];

  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);
    const chunkTokens = validTokens.slice(i, i + CHUNK_SIZE);

    let receipts: Record<string, ExpoPushReceipt> = {};
    try {
      receipts = await sendChunk(chunk);
    } catch (e) {
      console.error('send_chunk_error', e instanceof Error ? e.message : e);
      continue; // 청크 실패 — 다음 청크 계속
    }

    // Expo receipts는 배열 인덱스 기반 (0, 1, 2 ...)
    const receiptArr = Object.values(receipts);
    for (let j = 0; j < receiptArr.length; j++) {
      const receipt = receiptArr[j];
      if (
        receipt?.status === 'error' &&
        receipt?.details?.error === 'DeviceNotRegistered'
      ) {
        staleTokens.push(chunkTokens[j]);
      }
    }
  }

  // ⑥ 만료 토큰 삭제
  if (staleTokens.length > 0) {
    const { error: delError } = await admin
      .from('push_tokens')
      .delete()
      .eq('user_id', notif.user_id)
      .in('token', staleTokens);
    if (delError) {
      console.error('stale_token_delete_error', delError.message);
    }
  }

  return new Response('ok', { status: 200 });
});
