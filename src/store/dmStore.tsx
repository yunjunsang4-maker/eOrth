import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { View } from 'react-native';
import type { TravelRecord } from './recordStore';
import type { Friend, Message, MsgType, SharedRecord, ReplyInfo } from './dmTypes';
import { buildSharedRecord, nowTimeString, pickTopFriends } from './dmShareLogic';
import { useSettings } from './settingsStore';
import { usePersistence, STORE_KEYS } from './persist';
import { isSupabaseConfigured } from '../services/supabase';
import { getMyUserId, getProfileById } from '../services/profile';
import { uploadImage, uploadMaybe } from '../services/media';
import { getOrCreateThread, fetchMessages, sendMessage, subscribeInbox, mapRowToMessage } from '../services/dm';

// 신규 사용자는 빈 상태로 시작 — 실제 친구를 추가/대화하면서 채워진다 (데모 시드 제거)
const INITIAL_FRIENDS: Friend[] = [];
const INITIAL_CONVERSATIONS: Record<string, Message[]> = {};

export interface NewMessage {
  type: MsgType;
  text: string;
  isMine?: boolean;
  imageUri?: string;
  record?: SharedRecord;
  replyTo?: ReplyInfo;
}

interface DMContextType {
  conversations: Record<string, Message[]>;
  friends: Friend[];
  addMessage: (handle: string, msg: NewMessage) => void;
  retrySend: (handle: string, messageId: string) => void; // 전송 실패 메시지 재시도
  sendRecord: (handle: string, record: TravelRecord) => void;
  deleteMessage: (handle: string, messageId: string) => void; // 메시지 1건 삭제
  clearConversation: (handle: string) => void;                // 대화 메시지 전부 삭제
  topFriends: (n: number) => Friend[];
  unreadCount: (handle: string) => number; // 대화별 안읽음 메시지 수
  markRead: (handle: string) => void;       // 대화를 읽음 처리
  resetConversations: () => void; // 대화 내역을 첫 실행 상태(시드)로 되돌림
  // 백엔드 DM: 대화 상대(profile uuid) 등록 + 서버 히스토리 로드. 미설정 시 무동작.
  registerPeer: (handle: string, userId?: string) => void;
  loadHistory: (handle: string, userId?: string) => Promise<void>;
}

const DMContext = createContext<DMContextType | null>(null);

export function DMProvider({ children }: { children: React.ReactNode }) {
  const { incrementShareSent } = useSettings();
  const [conversations, setConversations] = useState<Record<string, Message[]>>(INITIAL_CONVERSATIONS);
  const [friends] = useState<Friend[]>(INITIAL_FRIENDS);
  // 대화별 읽음 지점(읽은 메시지 개수). 이 개수 이후의 '받은' 메시지가 안읽음이 된다
  const [readMarks, setReadMarks] = useState<Record<string, number>>({});
  // 내가 삭제/비운 서버 메시지(remoteId)를 영구 숨김 — loadHistory/실시간이 덮어써도 되살아나지 않게('나에게만 삭제')
  const [hiddenIds, setHiddenIds] = useState<Record<string, true>>({});
  const hiddenIdsRef = useRef<Record<string, true>>({});
  const hideRemoteIds = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setHiddenIds((prev) => {
      const next = { ...prev };
      ids.forEach((id) => { next[id] = true; });
      hiddenIdsRef.current = next;
      return next;
    });
  }, []);
  // handle ↔ 상대 profile uuid 매핑(백엔드 전송용) / profile uuid → handle 캐시(실시간 수신용)
  const peerByHandle = useRef<Record<string, string>>({});
  const handleByPeer = useRef<Record<string, string>>({});

  // 대화 상대의 profile uuid 등록 (대화 열 때 호출)
  const registerPeer = useCallback((handle: string, userId?: string) => {
    if (!handle || !userId) return;
    peerByHandle.current[handle] = userId;
    handleByPeer.current[userId] = handle;
  }, []);

  // friends는 시드 고정이므로 대화 내역과 읽음 상태만 영속화한다
  const hydrated = usePersistence<{ conversations: Record<string, Message[]>; readMarks?: Record<string, number>; hiddenIds?: Record<string, true> }>(
    STORE_KEYS.dm,
    (p) => {
      setConversations(p.conversations);
      if (p.readMarks) setReadMarks(p.readMarks);
      if (p.hiddenIds) { setHiddenIds(p.hiddenIds); hiddenIdsRef.current = p.hiddenIds; }
    },
    () => ({ conversations, readMarks, hiddenIds }),
    [conversations, readMarks, hiddenIds],
  );

  // 로컬 메시지 1건을 백엔드로 전송 (성공=remoteId 부착, 실패=failed 표시). 상대 uuid를 알 때만.
  const pushToBackend = useCallback(async (
    handle: string,
    localId: string,
    payload: { type: MsgType; text: string; imageUri?: string; record?: SharedRecord },
  ) => {
    if (!isSupabaseConfigured) return;
    const peer = peerByHandle.current[handle];
    if (!peer) return; // 상대 uuid 모르면 로컬만 유지(실패 아님)
    try {
      let imageUrl: string | undefined;
      if (payload.type === 'image' && payload.imageUri) {
        imageUrl = await uploadImage(payload.imageUri);
        if (!imageUrl) throw new Error('이미지 업로드 실패');
      }
      // 공유 기록 안의 사진도 업로드해야 상대가 볼 수 있다
      let record = payload.record;
      if (payload.type === 'record' && record) {
        record = {
          ...record,
          mediaUri: await uploadMaybe(record.mediaUri),
          albumUris: record.albumUris ? await Promise.all(record.albumUris.map((u) => uploadImage(u))) : record.albumUris,
          snapFrontUri: await uploadMaybe(record.snapFrontUri),
          snapBackUri: await uploadMaybe(record.snapBackUri),
        };
      }
      const threadId = await getOrCreateThread(peer);
      if (!threadId) throw new Error('대화 생성 실패');
      const rid = await sendMessage(threadId, { type: payload.type, text: payload.text, imageUrl, record });
      if (!rid) throw new Error('메시지 전송 실패');
      setConversations((prev) => ({
        ...prev,
        [handle]: (prev[handle] ?? []).map((x) =>
          x.id === localId ? { ...x, remoteId: rid, imageUri: imageUrl ?? x.imageUri, failed: undefined } : x
        ),
      }));
    } catch {
      // 전송 실패 → 메시지에 실패 표시(사용자가 재시도 가능)
      setConversations((prev) => ({
        ...prev,
        [handle]: (prev[handle] ?? []).map((x) => (x.id === localId ? { ...x, failed: true } : x)),
      }));
    }
  }, []);

  const addMessage = useCallback((handle: string, msg: NewMessage) => {
    const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const m: Message = {
      id: localId,
      type: msg.type,
      text: msg.text,
      isMine: msg.isMine ?? true,
      time: nowTimeString(),
      createdAt: Date.now(),
      imageUri: msg.imageUri,
      record: msg.record,
      replyTo: msg.replyTo,
    };
    setConversations((prev) => ({ ...prev, [handle]: [...(prev[handle] ?? []), m] }));

    if (msg.isMine ?? true) {
      pushToBackend(handle, localId, { type: msg.type, text: msg.text, imageUri: msg.imageUri, record: msg.record });
    }
  }, [pushToBackend]);

  // 전송 실패한 메시지 재시도
  const retrySend = useCallback((handle: string, messageId: string) => {
    const m = (conversations[handle] ?? []).find((x) => x.id === messageId);
    if (!m || m.remoteId) return;
    setConversations((prev) => ({
      ...prev,
      [handle]: (prev[handle] ?? []).map((x) => (x.id === messageId ? { ...x, failed: undefined } : x)),
    }));
    pushToBackend(handle, messageId, { type: m.type, text: m.text, imageUri: m.imageUri, record: m.record });
  }, [conversations, pushToBackend]);

  // 실시간/히스토리로 받은 메시지를 대화에 합침 (remoteId 중복 제거)
  const ingestRemoteMessage = useCallback((handle: string, m: Message) => {
    if (m.remoteId && hiddenIdsRef.current[m.remoteId]) return; // 내가 숨긴 메시지는 다시 안 받음
    setConversations((prev) => {
      const list = prev[handle] ?? [];
      if (m.remoteId && list.some((x) => x.remoteId === m.remoteId)) return prev;
      return { ...prev, [handle]: [...list, m] };
    });
  }, []);

  // 서버 히스토리 로드 (대화 열 때). 비어있으면 로컬 유지.
  const loadHistory = useCallback(async (handle: string, userId?: string) => {
    if (!isSupabaseConfigured || !userId) return;
    registerPeer(handle, userId);
    const threadId = await getOrCreateThread(userId);
    if (!threadId) return;
    const msgs = await fetchMessages(threadId);
    const visible = msgs.filter((m) => !m.remoteId || !hiddenIdsRef.current[m.remoteId]); // 숨긴 메시지 제외
    if (visible.length === 0) return;
    setConversations((prev) => ({ ...prev, [handle]: visible }));
  }, [registerPeer]);

  const sendRecord = useCallback((handle: string, record: TravelRecord) => {
    addMessage(handle, { type: 'record', text: '', record: buildSharedRecord(record) });
    incrementShareSent(); // 게시물 공유 횟수 +1 (배지 74)
  }, [addMessage, incrementShareSent]);

  const deleteMessage = useCallback((handle: string, messageId: string) => {
    const list = conversations[handle] ?? [];
    const idx = list.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    const rid = list[idx].remoteId;
    if (rid) hideRemoteIds([rid]); // 서버 히스토리 재로딩 시 되살아나지 않게
    setConversations((prev) => ({
      ...prev,
      [handle]: (prev[handle] ?? []).filter((m) => m.id !== messageId),
    }));
    // 읽음 지점보다 앞(이미 읽은 구간)의 메시지를 지우면 지점도 한 칸 당긴다
    setReadMarks((rm) => {
      const mark = rm[handle];
      if (mark === undefined || idx >= mark) return rm;
      return { ...rm, [handle]: Math.max(0, mark - 1) };
    });
  }, [conversations, hideRemoteIds]);

  const clearConversation = useCallback((handle: string) => {
    const rids = (conversations[handle] ?? []).map((m) => m.remoteId).filter(Boolean) as string[];
    hideRemoteIds(rids); // 비운 서버 메시지가 재로딩 시 되살아나지 않게
    setConversations((prev) => ({ ...prev, [handle]: [] }));
    setReadMarks((prev) => ({ ...prev, [handle]: 0 }));
  }, [conversations, hideRemoteIds]);

  const topFriends = useCallback((n: number) => pickTopFriends(friends, conversations, n), [friends, conversations]);

  // 대화별 안읽음 수: 명시적 읽음 지점이 있으면 그 이후의 '받은' 메시지 수,
  // 한 번도 열지 않았으면 내가 마지막으로 보낸 메시지 이후의 '받은' 메시지 수
  const unreadCount = useCallback((handle: string) => {
    const msgs = conversations[handle] ?? [];
    if (msgs.length === 0) return 0;
    let readLen = readMarks[handle];
    if (readLen === undefined) {
      let lastMine = -1;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].isMine) { lastMine = i; break; }
      }
      readLen = lastMine + 1;
    }
    let count = 0;
    for (let i = readLen; i < msgs.length; i++) {
      if (!msgs[i].isMine) count++;
    }
    return count;
  }, [conversations, readMarks]);

  const markRead = useCallback((handle: string) => {
    setReadMarks((prev) => ({ ...prev, [handle]: conversations[handle]?.length ?? 0 }));
  }, [conversations]);

  const resetConversations = useCallback(() => {
    setConversations(INITIAL_CONVERSATIONS);
    setReadMarks({});
    setHiddenIds({});
    hiddenIdsRef.current = {};
  }, []);

  // 실시간 수신: 내 스레드의 새 메시지를 받아 대화에 합친다 (내 메시지 echo는 무시)
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cleanup = () => {};
    (async () => {
      const myUid = await getMyUserId();
      if (!myUid) return;
      cleanup = subscribeInbox(async (row) => {
        if (row.sender_id === myUid) return;
        let handle = handleByPeer.current[row.sender_id];
        if (!handle) {
          const prof = await getProfileById(row.sender_id);
          handle = prof?.handle || row.sender_id;
          handleByPeer.current[row.sender_id] = handle;
          peerByHandle.current[handle] = row.sender_id;
        }
        ingestRemoteMessage(handle, mapRowToMessage(row, myUid));
      });
    })();
    return () => cleanup();
  }, [ingestRemoteMessage]);

  // 복원 전에는 시드 대화가 잠깐 보이지 않도록 렌더를 막는다
  if (!hydrated) {
    return <View style={{ flex: 1, backgroundColor: '#0A0118' }} />;
  }

  return (
    <DMContext.Provider value={{ conversations, friends, addMessage, retrySend, sendRecord, deleteMessage, clearConversation, topFriends, unreadCount, markRead, resetConversations, registerPeer, loadHistory }}>
      {children}
    </DMContext.Provider>
  );
}

export function useDM() {
  const ctx = useContext(DMContext);
  if (!ctx) throw new Error('useDM must be used within DMProvider');
  return ctx;
}
