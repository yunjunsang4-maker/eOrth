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
