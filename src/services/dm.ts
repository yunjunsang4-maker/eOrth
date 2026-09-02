/**
 * DM 백엔드 서비스 (dm_threads / dm_messages) + 실시간 수신
 *
 * 스레드는 두 사용자(profile uuid) 사이 1개. user_a < user_b 로 정렬해 유일성 보장.
 * Supabase 미설정 시 모두 무동작 → dmStore는 기존 로컬 동작 유지.
 *
 * ⚠️ 실시간을 쓰려면 publication에 테이블 추가 필요:
 *    alter publication supabase_realtime add table public.dm_messages;
 */

import { supabase } from './supabase';
import { getMyUserId } from './profile';
import { nowTimeString } from '../store/dmShareLogic';
import type { Message, MsgType, SharedRecord } from '../store/dmTypes';

const toMsgType = (t: string): MsgType => (t === 'image' || t === 'record' ? t : 'text');

// dm_messages 행 → Message
export function mapRowToMessage(row: any, uid: string): Message {
  return {
    id: row.id,
    remoteId: row.id,
    type: toMsgType(row.type),
    text: row.text ?? '',
    isMine: row.sender_id === uid,
    time: nowTimeString(new Date(row.created_at)),
    createdAt: new Date(row.created_at).getTime(),
    imageUri: row.image_url ?? undefined,
    record: (row.record ?? undefined) as SharedRecord | undefined,
  };
}

// 내가 참여한 모든 스레드의 상대 uuid 목록 — 재설치/기기 변경 후 대화 목록 복원용.
// RLS(threads_select_participant)가 내 스레드만 주고 차단 관계는 걸러진다. 실패 시 빈 배열.
export async function fetchThreadPeers(): Promise<string[]> {
  if (!supabase) return [];
  const uid = await getMyUserId();
  if (!uid) return [];
  try {
    const { data } = await supabase.from('dm_threads').select('user_a, user_b');
    return (data ?? [])
      .map((r: any) => (r.user_a === uid ? r.user_b : r.user_a) as string)
      .filter((p) => !!p && p !== uid);
  } catch {
    return [];
  }
}

// 두 사용자 사이 스레드 찾거나 생성 → thread_id (실패 시 null)
export async function getOrCreateThread(otherUserId: string): Promise<string | null> {
  if (!supabase || !otherUserId) return null;
  const uid = await getMyUserId();
  if (!uid || uid === otherUserId) return null;
  const [a, b] = uid < otherUserId ? [uid, otherUserId] : [otherUserId, uid];
  try {
    const { data: existing } = await supabase
      .from('dm_threads').select('id').eq('user_a', a).eq('user_b', b).maybeSingle();
    if (existing?.id) return existing.id as string;
    const { data: created, error } = await supabase
      .from('dm_threads').insert({ user_a: a, user_b: b }).select('id').single();
    if (!error && created) return created.id as string;
    // 경쟁 삽입 등으로 실패 시 재조회
    const { data: again } = await supabase
      .from('dm_threads').select('id').eq('user_a', a).eq('user_b', b).maybeSingle();
    return again?.id ?? null;
  } catch {
    return null;
  }
}

// 스레드의 메시지 전체 (시간순)
export async function fetchMessages(threadId: string): Promise<Message[]> {
  if (!supabase || !threadId) return [];
  const uid = await getMyUserId();
  if (!uid) return [];
  try {
    const { data } = await supabase
      .from('dm_messages').select('*').eq('thread_id', threadId).order('created_at', { ascending: true });
    return (data ?? []).map((r: any) => mapRowToMessage(r, uid));
  } catch {
    return [];
  }
}

// 메시지 전송 → 생성된 message id (실패 시 null)
export async function sendMessage(
  threadId: string,
  msg: { type: MsgType; text?: string; imageUrl?: string; record?: SharedRecord }
): Promise<string | null> {
  if (!supabase || !threadId) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  try {
    const { data, error } = await supabase
      .from('dm_messages')
      .insert({
        thread_id: threadId,
        sender_id: uid,
        type: msg.type,
        text: msg.text ?? '',
        image_url: msg.imageUrl ?? null,
        record: msg.record ?? null,
      })
      .select('id')
      .single();
    if (error || !data) return null;
    return data.id as string;
  } catch {
    return null;
  }
}

/**
 * 따라잡기: since 이후에 도착한 '받은' 메시지 전부 — 앱이 꺼져 있던 사이의 공백을 메운다.
 *
 * 실시간 구독은 앱이 켜져 돌아가는 동안에만 살아 있어서, 백그라운드에서 소켓이 끊긴 사이 온
 * 메시지는 그 대화방에 직접 들어가기 전까지 목록에 뜨지 않았다(안읽음 배지·마지막 메시지 없음).
 *
 * ⚠️ 스레드를 지정하지 않고 dm_messages 전체를 조회하는 것이 맞다 — RLS
 *    messages_select_participant가 "내가 참여한 스레드"만 통과시키고 차단 관계도 걸러낸다.
 *    앱에서 스레드 목록을 먼저 받아 스레드별로 조회하면 요청이 대화 수만큼 늘어날 뿐이다.
 * ⚠️ sender_id != 내 uid — 실시간 핸들러의 `if (row.sender_id === uid) return;`과 같은 규칙.
 *    내 발신 echo를 받아 합치면 이미 로컬에 있는 메시지가 두 벌이 된다.
 * ⚠️ 실패는 반드시 null 로 구분한다(빈 배열 아님). 빈 배열은 "새 메시지 없음"이라는 다른
 *    뜻이고, 호출부는 null일 때 로컬 상태를 그대로 둔다(fetchPostStatsFor와 같은 규칙).
 */
export async function fetchInboxSince(
  sinceMs: number
): Promise<{ senderId: string; message: Message }[] | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  try {
    const { data, error } = await supabase
      .from('dm_messages')
      .select('*')
      .gt('created_at', new Date(sinceMs).toISOString())
      .neq('sender_id', uid)
      .order('created_at', { ascending: true })
      .limit(200); // 한 번에 200건 — 공백이 더 크면 대화 진입 시 loadHistory가 나머지를 채운다
    if (error) return null;
    return (data ?? []).map((r: any) => ({
      senderId: r.sender_id as string,
      message: mapRowToMessage(r, uid),
    }));
  } catch {
    return null;
  }
}

// 실시간 수신: 내가 참여한 스레드의 새 메시지 INSERT 구독 (RLS가 내 것만 전달)
// onInsert에는 dm_messages 행이 그대로 전달된다. 해제 함수 반환.
export function subscribeInbox(onInsert: (row: any) => void): () => void {
  if (!supabase) return () => {};
  const channel = supabase
    .channel('dm-inbox')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages' }, (payload) => {
      onInsert(payload.new);
    })
    .subscribe();
  return () => {
    try { supabase!.removeChannel(channel); } catch { /* 무시 */ }
  };
}
