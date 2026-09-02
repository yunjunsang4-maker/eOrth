import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { AppState, View } from 'react-native';
import type { TravelRecord } from './recordStore';
import type { Friend, Message, MsgType, SharedRecord, ReplyInfo } from './dmTypes';
import { buildSharedRecord, nowTimeString, pickTopFriends } from './dmShareLogic';
import { useSettings } from './settingsStore';
import { usePersistence, STORE_KEYS } from './persist';
import { isSupabaseConfigured, supabase } from '../services/supabase';
import { onReconnect } from '../utils/connectivity';
import { remapDocUri } from '../utils/remapDocumentUris';
import { getMyUserId, getProfileById, getProfileByHandle } from '../services/profile';
import { uploadImage } from '../services/media';
import { getOrCreateThread, fetchMessages, sendMessage, subscribeInbox, mapRowToMessage, fetchThreadPeers, fetchInboxSince } from '../services/dm';
import { inboxCatchUpSince, advanceServerSeen } from '../utils/dmCatchUp';

// 업로드 실패 감지 — uploadImage는 실패 시 '원본 로컬 URI'를 그대로 돌려주므로 falsy 검사로는
// 잡히지 않는다. file:// 경로가 서버에 저장되면 상대 기기에서 그 사진이 영구히 깨져 보이므로,
// 원격 URL이 아니면 throw해 전송 실패(재시도 가능)로 처리한다.
const isRemoteUrl = (u?: string) => !!u && /^https?:\/\//.test(u);
const mustUpload = async (u: string): Promise<string> => {
  const r = await uploadImage(u);
  if (!isRemoteUrl(r)) throw new Error('이미지 업로드 실패');
  return r;
};
const mustUploadMaybe = async (u?: string): Promise<string | undefined> => (u ? mustUpload(u) : u);

// iOS는 재설치/재빌드로 앱 컨테이너 경로(UUID)가 바뀌어 저장된 절대경로 URI가 전부 깨진다.
// DM에는 이미지 메시지(imageUri)와 공유 기록 카드(record.*)에 로컬 경로가 들어가므로
// hydrate 시 recordStore·momentStore와 동일하게 현재 컨테이너 기준으로 복구한다.
const remapMessageDocUris = (m: Message): Message => {
  const imageUri = remapDocUri(m.imageUri);
  let record = m.record;
  if (record) {
    const mediaUri = remapDocUri(record.mediaUri);
    const snapFrontUri = remapDocUri(record.snapFrontUri);
    const snapBackUri = remapDocUri(record.snapBackUri);
    let albumUris = record.albumUris;
    if (albumUris?.length) {
      const next = albumUris.map((u) => remapDocUri(u));
      if (next.some((u, i) => u !== albumUris![i])) albumUris = next;
    }
    if (
      mediaUri !== record.mediaUri ||
      snapFrontUri !== record.snapFrontUri ||
      snapBackUri !== record.snapBackUri ||
      albumUris !== record.albumUris
    ) {
      record = { ...record, mediaUri, snapFrontUri, snapBackUri, albumUris };
    }
  }
  if (imageUri === m.imageUri && record === m.record) return m; // 변경 없으면 원본 유지
  return { ...m, imageUri, record };
};

const remapConversationsDocUris = (
  conv: Record<string, Message[]>,
): Record<string, Message[]> => {
  const out: Record<string, Message[]> = {};
  for (const [h, list] of Object.entries(conv)) {
    out[h] = Array.isArray(list) ? list.map(remapMessageDocUris) : list;
  }
  return out;
};

// 신규 사용자는 빈 상태로 시작 — 실제 메이트를 추가/대화하면서 채워진다 (데모 시드 제거)
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
  // 대화별 읽음 워터마크(마지막으로 읽은 시점의 createdAt ms). 이 시각 이후의 '받은' 메시지가
  // 안읽음이 된다. 과거엔 '읽은 메시지 개수'였는데, loadHistory 병합·재정렬로 목록 길이/순서가
  // 바뀌면 개수 기준 지점이 어긋나 배지 수가 틀렸다 — 시각 기준은 병합·삭제에 불변.
  const [readMarks, setReadMarks] = useState<Record<string, number>>({});
  // 내가 삭제/비운 서버 메시지(remoteId)를 영구 숨김 — loadHistory/실시간이 덮어써도 되살아나지 않게('나에게만 삭제')
  const [hiddenIds, setHiddenIds] = useState<Record<string, true>>({});
  const hiddenIdsRef = useRef<Record<string, true>>({});
  const hideRemoteIds = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setHiddenIds((prev) => {
      let next: Record<string, true> = { ...prev };
      ids.forEach((id) => { next[id] = true; });
      // 무한 누적 방지 — 서버 히스토리 조회 범위를 훌쩍 넘는 오래된 항목은 잘라낸다
      // (객체 삽입 순서 유지 특성상 앞쪽이 가장 오래된 항목)
      const keys = Object.keys(next);
      const MAX_HIDDEN = 2000;
      if (keys.length > MAX_HIDDEN) {
        const trimmed: Record<string, true> = {};
        for (const k of keys.slice(keys.length - MAX_HIDDEN)) trimmed[k] = true;
        next = trimmed;
      }
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
      // payload 필드 가드 — 손상/구버전 payload로 throw하면 부분 복원 상태가 저장으로 덮어써진다.
      // 사진 URI는 현재 컨테이너 기준으로 복구해서 넣는다(iOS 재빌드 시 썸네일 깨짐 방지).
      const conv =
        p.conversations && typeof p.conversations === 'object'
          ? remapConversationsDocUris(p.conversations)
          : null;
      if (conv) setConversations(conv);
      if (p.readMarks) {
        // 구버전(읽은 개수) → 워터마크(ms) 이관: 개수 시절 값은 항상 작아(1e10 미만) 구분된다.
        // 개수 n → 당시 목록의 n번째 메시지 createdAt. 목록·시각이 없으면 0(전부 안읽음 아님,
        // 아래 unreadCount의 '내 마지막 발신' 폴백이 동작).
        const marks: Record<string, number> = {};
        for (const [h, v] of Object.entries(p.readMarks)) {
          if (typeof v !== 'number') continue;
          if (v >= 1e10) { marks[h] = v; continue; } // 이미 워터마크
          const list = (conv ?? {})[h];
          marks[h] = (v > 0 ? list?.[Math.min(v, list?.length ?? 0) - 1]?.createdAt : 0) ?? 0;
        }
        setReadMarks(marks);
      }
      if (p.hiddenIds) { setHiddenIds(p.hiddenIds); hiddenIdsRef.current = p.hiddenIds; }
    },
    () => ({ conversations, readMarks, hiddenIds }),
    [conversations, readMarks, hiddenIds],
  );

  // 전송이 진행 중인 로컬 메시지 id — 같은 메시지의 중복 전송(서버 2행) 방지.
  // 재시도 버튼 연타, 재시도 도중의 재연결 스윕, 사진 업로드로 오래 걸리는 첫 전송 등이 겹칠 수 있다.
  const inFlightRef = useRef<Set<string>>(new Set());

  // 로컬 메시지 1건을 백엔드로 전송 (성공=remoteId 부착, 실패=failed 표시). 상대 uuid를 알 때만.
  const pushToBackend = useCallback(async (
    handle: string,
    localId: string,
    payload: { type: MsgType; text: string; imageUri?: string; record?: SharedRecord },
  ) => {
    if (!isSupabaseConfigured) return;
    if (inFlightRef.current.has(localId)) return; // 이미 전송 중 — 중복 서버 행 방지
    inFlightRef.current.add(localId);
    try {
      // 상대 uuid 미등록(앱 재시작 직후 피드에서 바로 빠른공유 등)이면 handle로 조회해 등록한다.
      // 그래도 못 찾으면 throw → 실패 표시(재시도 가능). 조용히 성공한 척하면 상대는 영영 못 받는다.
      let peer = peerByHandle.current[handle];
      if (!peer) {
        const prof = await getProfileByHandle(handle);
        if (prof?.id) {
          registerPeer(handle, prof.id);
          peer = prof.id;
        }
      }
      if (!peer) throw new Error('상대 정보를 찾을 수 없음');
      let imageUrl: string | undefined;
      if (payload.type === 'image' && payload.imageUri) {
        imageUrl = await mustUpload(payload.imageUri);
      }
      // 공유 기록 안의 사진도 업로드해야 상대가 볼 수 있다 (실패 시 throw → 재시도 표시)
      let record = payload.record;
      if (payload.type === 'record' && record) {
        record = {
          ...record,
          mediaUri: await mustUploadMaybe(record.mediaUri),
          albumUris: record.albumUris ? await Promise.all(record.albumUris.map((u) => mustUpload(u))) : record.albumUris,
          snapFrontUri: await mustUploadMaybe(record.snapFrontUri),
          snapBackUri: await mustUploadMaybe(record.snapBackUri),
        };
      }
      const threadId = await getOrCreateThread(peer);
      if (!threadId) throw new Error('대화 생성 실패');
      const rid = await sendMessage(threadId, { type: payload.type, text: payload.text, imageUrl, record });
      if (!rid) throw new Error('메시지 전송 실패');
      setConversations((prev) => {
        // remoteId 부착. loadHistory 병합이 전송 완료보다 먼저 서버 사본을 넣었을 수 있으므로
        // 같은 remoteId 중복은 첫 항목만 남긴다.
        const seen = new Set<string>();
        const next = (prev[handle] ?? [])
          .map((x) => (x.id === localId ? { ...x, remoteId: rid, imageUri: imageUrl ?? x.imageUri, failed: undefined } : x))
          .filter((x) => {
            if (!x.remoteId) return true;
            if (seen.has(x.remoteId)) return false;
            seen.add(x.remoteId);
            return true;
          });
        return { ...prev, [handle]: next };
      });
    } catch {
      // 전송 실패 → 메시지에 실패 표시(사용자가 재시도 가능)
      setConversations((prev) => ({
        ...prev,
        [handle]: (prev[handle] ?? []).map((x) => (x.id === localId ? { ...x, failed: true } : x)),
      }));
    } finally {
      inFlightRef.current.delete(localId); // 성공·실패 모두 해제 — 실패분은 다시 재시도 가능
    }
  }, [registerPeer]);

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
    // 아직 실패 표시가 없거나(=최초 전송 진행 중) 이미 재시도가 돌고 있으면 무시 —
    // 두 번 밀어넣으면 서버에 같은 메시지가 2행 생긴다.
    if (!m.failed || inFlightRef.current.has(messageId)) return;
    setConversations((prev) => ({
      ...prev,
      [handle]: (prev[handle] ?? []).map((x) => (x.id === messageId ? { ...x, failed: undefined } : x)),
    }));
    pushToBackend(handle, messageId, { type: m.type, text: m.text, imageUri: m.imageUri, record: m.record });
  }, [conversations, pushToBackend]);

  // 오프라인 → 온라인 복귀 시 전송 실패 메시지 자동 재시도 (오지/기내 대응 —
  // 수동 '재시도' 버튼을 몰라도 연결이 돌아오면 밀린 메시지가 알아서 나간다)
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    return onReconnect(() => {
      const conv = conversationsRef.current;
      for (const handle of Object.keys(conv)) {
        for (const m of conv[handle]) {
          if (!m.isMine || !m.failed || m.remoteId) continue;
          setConversations((prev) => ({
            ...prev,
            [handle]: (prev[handle] ?? []).map((x) => (x.id === m.id ? { ...x, failed: undefined } : x)),
          }));
          pushToBackend(handle, m.id, { type: m.type, text: m.text, imageUri: m.imageUri, record: m.record });
        }
      }
    });
  }, [pushToBackend]);

  // 실시간/히스토리로 받은 메시지를 대화에 합침 (remoteId 중복 제거)
  const ingestRemoteMessage = useCallback((handle: string, m: Message) => {
    if (m.remoteId && hiddenIdsRef.current[m.remoteId]) return; // 내가 숨긴 메시지는 다시 안 받음
    setConversations((prev) => {
      const list = prev[handle] ?? [];
      if (m.remoteId && list.some((x) => x.remoteId === m.remoteId)) return prev;
      return { ...prev, [handle]: [...list, m] };
    });
  }, []);

  // ─── 인박스 따라잡기 ───
  // 앱이 꺼져 있던(또는 백그라운드에서 소켓이 끊긴) 사이 온 DM은 지금까지 어떤 경로로도
  // 목록에 오지 않았다 — 실시간은 앱이 켜져 있을 때만, 스레드 시드는 로컬 대화가 빈 경우만,
  // loadHistory는 그 대화방에 직접 들어갔을 때만 돈다. 그래서 푸시를 무시하고 앱을 열면
  // 메이트 목록에 안읽음 배지도 새 마지막 메시지도 뜨지 않았다.
  // (알림 배지는 MainScreen이 '화면 포커스 재조회 + 실시간' 이중화로 이미 이렇게 처리한다.)
  const lastCatchUpAtRef = useRef(0);
  // 서버가 실제로 돌려준 행의 최대 createdAt — '이미 본 구간'의 바닥값.
  // conversations에서 유도한 워터마크만 쓰면, 받은 대화를 전부 비운(clearConversation) 인박스는
  // 워터마크가 0에 고착돼 포그라운드마다 같은 200건을 다시 끌어온다(전부 hiddenIds에 막혀
  // 합류하지 못하니 다음 회차도 동일). 바닥값이 그 반복을 끊는다.
  // ⚠️ 계정이 바뀌면 반드시 0으로 되돌린다 — 아래 applyUid·resetConversations 참조.
  const lastServerSeenRef = useRef(0);
  // 계정 경계 세대 카운터 — 바닥값을 리셋할 때 함께 올린다. 계정이 바뀌는 순간 이미 날아가 있던
  // 따라잡기 응답이 뒤늦게 도착해 옛 계정의 메시지를 합류시키거나 옛 시각으로 바닥값을 되살리는
  // 것을 막는다(await 뒤에 세대가 달라졌으면 결과를 통째로 버린다).
  const catchUpEpochRef = useRef(0);
  const catchUpInbox = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    // 앱 전환을 빠르게 반복하면 요청이 쌓이므로 10초 throttle
    const now = Date.now();
    if (now - lastCatchUpAtRef.current < 10000) return;
    lastCatchUpAtRef.current = now;
    const epoch = catchUpEpochRef.current;
    const since = Math.max(inboxCatchUpSince(conversationsRef.current, now), lastServerSeenRef.current);
    const items = await fetchInboxSince(since);
    if (!items) return; // 조회 실패 — 로컬 유지(빈 배열과 구분된다). 바닥값도 전진시키지 않는다
    if (catchUpEpochRef.current !== epoch) return; // 응답 도착 전에 계정이 바뀜 — 결과 폐기
    // 합류 여부와 무관하게 전진 — 돌려받은 행은 이미 '본' 것이고, 합류하지 않은 것은 내가
    // 숨겼거나(hiddenIds) 중복이라 다시 받을 이유가 없다(advanceServerSeen 주석 참조).
    lastServerSeenRef.current = advanceServerSeen(
      lastServerSeenRef.current,
      items.map((it) => it.message),
    );
    for (const { senderId, message } of items) {
      let handle = handleByPeer.current[senderId];
      if (!handle) {
        const prof = await getProfileById(senderId).catch(() => null);
        // 이 await도 계정 경계다 — 조회 중 계정이 바뀌면 남은 항목은 옛 계정 것이므로 버린다.
        // (상태는 await 지점에서만 바뀔 수 있으니 이 검사 하나면 루프 전체가 덮인다.)
        if (catchUpEpochRef.current !== epoch) return;
        // 프로필 조회 실패 시 senderId를 handle로 폴백 — 실시간 핸들러와 같은 규칙이다.
        // 여기서 메시지를 버리면 안 된다: 같은 배치의 다른 메시지가 합류하는 순간 워터마크가
        // 전진해 버려진 메시지는 다시 조회되지 않는다(탈퇴와 네트워크 일시 실패를 구분할 수
        // 없으므로, 이름이 uuid로 보이는 쪽이 영구 유실보다 낫다).
        handle = prof?.handle || senderId;
        registerPeer(handle, senderId);
      }
      // 합류는 반드시 ingestRemoteMessage 경유 — 내가 숨긴 메시지 재유입 차단(hiddenIds)과
      // remoteId 중복 방지를 그 함수가 담당한다. 실시간 수신과 같은 문을 써야 두 벌이 안 생긴다.
      ingestRemoteMessage(handle, message);
    }
  }, [ingestRemoteMessage, registerPeer]);

  // 서버 히스토리 로드 (대화 열 때). 비어있으면 로컬 유지.
  // ⚠️ 서버 목록으로 '통째 교체'하면 아직 서버에 없는 로컬 메시지 — 전송 실패(재시도 대기),
  //    전송 진행 중(remoteId 미부착), 상대 uuid 미등록으로 로컬에만 남은 메시지 — 가 증발한다.
  //    서버본을 기준으로 하되 로컬 전용 메시지는 보존해 시간순으로 병합한다.
  const loadHistory = useCallback(async (handle: string, userId?: string) => {
    if (!isSupabaseConfigured || !handle) return;
    // userId가 없거나(팔로우하지 않은 상대의 대화 등) uuid가 아니면 handle로 해석한다 —
    // 이 폴백이 없으면 목록·토스트에서 진입한 대화의 서버 히스토리를 영영 못 불러온다.
    const UUID_RE = /^[0-9a-f-]{36}$/i;
    let peer: string | undefined =
      userId && UUID_RE.test(userId) ? userId : peerByHandle.current[handle];
    if (!peer) {
      const prof = await getProfileByHandle(handle).catch(() => null);
      peer = prof?.id ?? undefined;
    }
    if (!peer) return;
    registerPeer(handle, peer);
    const threadId = await getOrCreateThread(peer);
    if (!threadId) return;
    const msgs = await fetchMessages(threadId);
    const visible = msgs.filter((m) => !m.remoteId || !hiddenIdsRef.current[m.remoteId]); // 숨긴 메시지 제외
    if (visible.length === 0) return;
    setConversations((prev) => {
      const local = prev[handle] ?? [];
      const serverIds = new Set(visible.map((m) => m.remoteId).filter(Boolean) as string[]);
      // remoteId가 서버 목록에 있는 로컬 사본은 서버본으로 대체, 나머지(미전송·실패·조회 범위 밖)는 보존
      const keepLocal = local.filter((m) => !m.remoteId || !serverIds.has(m.remoteId));
      const merged = [...visible, ...keepLocal].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
      return { ...prev, [handle]: merged };
    });
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
    // 읽음 워터마크는 시각 기준이라 삭제로 어긋나지 않는다 — 보정 불필요
  }, [conversations, hideRemoteIds]);

  const clearConversation = useCallback((handle: string) => {
    const rids = (conversations[handle] ?? []).map((m) => m.remoteId).filter(Boolean) as string[];
    hideRemoteIds(rids); // 비운 서버 메시지가 재로딩 시 되살아나지 않게
    setConversations((prev) => ({ ...prev, [handle]: [] }));
    setReadMarks((prev) => ({ ...prev, [handle]: 0 }));
  }, [conversations, hideRemoteIds]);

  const topFriends = useCallback((n: number) => pickTopFriends(friends, conversations, n), [friends, conversations]);

  // 대화별 안읽음 수: 읽음 워터마크(ms) 이후의 '받은' 메시지 수.
  // 한 번도 열지 않았으면 내가 마지막으로 보낸 메시지 시각을 워터마크로 삼는다.
  const unreadCount = useCallback((handle: string) => {
    const msgs = conversations[handle] ?? [];
    if (msgs.length === 0) return 0;
    let mark = readMarks[handle];
    if (mark === undefined) {
      mark = -1; // 내 발신이 없으면 받은 메시지 전부 안읽음
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].isMine) { mark = msgs[i].createdAt ?? 0; break; }
      }
    }
    let count = 0;
    for (const m of msgs) {
      if (!m.isMine && (m.createdAt ?? 0) > mark) count++;
    }
    return count;
  }, [conversations, readMarks]);

  const markRead = useCallback((handle: string) => {
    setReadMarks((prev) => {
      // 목록의 최대 createdAt까지 읽음 — 시각 없는(구버전) 메시지뿐이면 현재 시각으로 마감
      const msgs = conversations[handle] ?? [];
      const top = msgs.reduce((mx, m) => Math.max(mx, m.createdAt ?? 0), 0);
      return { ...prev, [handle]: top || Date.now() };
    });
  }, [conversations]);

  const resetConversations = useCallback(() => {
    setConversations(INITIAL_CONVERSATIONS);
    setReadMarks({});
    setHiddenIds({});
    hiddenIdsRef.current = {};
    // 따라잡기 바닥값도 리셋 — 남겨두면 초기화 직후의 따라잡기가 '이미 본 구간'으로 착각해
    // 그 이전 메시지를 통째로 건너뛴다(데이터 초기화·계정 전환 경로).
    lastServerSeenRef.current = 0;
    catchUpEpochRef.current += 1; // 이미 날아간 따라잡기 응답이 초기화를 되돌리지 못하게
  }, []);

  // 실시간 수신: 내 스레드의 새 메시지를 받아 대화에 합친다 (내 메시지 echo는 무시)
  // ⚠️ 마운트 1회만 시도하면 안 된다 — DMProvider는 로그인 화면보다 먼저 마운트되므로 그 시점의
  //    getMyUserId()는 null이고, 그러면 로그인해도 그 세션 내내 실시간 수신이 없다. 계정 전환 시엔
  //    반대로 이전 uid로 만든 구독이 그대로 남는다. → 인증 상태 변화에 맞춰 (재)구독한다.
  //    (AppNavigator의 onAuthStateChange 구독과 같은 방식. 콜백 안에서 await하지 않는다 —
  //     supabase-js는 auth 콜백 내 await를 데드락 위험으로 경고한다.)
  // 실시간 구독·스레드 시드가 따라갈 현재 로그인 uid (applyUid가 갱신)
  const [authUid, setAuthUid] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;
    let currentUid: string | null = null;

    const applyUid = (uid: string | null) => {
      if (disposed) return;
      if (uid === currentUid) return; // 변화 없음(TOKEN_REFRESHED 등) — 기존 구독 유지
      cleanup?.();                    // 이전 계정 구독 해제 (계정 전환·로그아웃)
      cleanup = null;
      currentUid = uid;
      // 따라잡기 바닥값은 계정 경계에서 반드시 0으로 — 이전 계정의 바닥값이 남으면 새 계정의
      // 첫 따라잡기가 그 시각 이전을 '이미 본 구간'으로 착각해 초기 메시지를 통째로 건너뛴다.
      // ⚠️ setAuthUid 앞에서 지운다: 트리거 1 effect는 authUid 반영 '이후의 렌더 뒤'에 돌므로
      //    여기서 동기적으로 0을 넣으면 새 계정의 첫 catchUpInbox는 옛 바닥값을 볼 수 없다.
      lastServerSeenRef.current = 0;
      catchUpEpochRef.current += 1;   // 이전 계정으로 날아간 따라잡기 응답은 도착해도 폐기된다
      setAuthUid(uid);                // 스레드 시드 effect가 로그인·계정 전환을 따라가게
      if (!uid) return;               // 로그아웃 상태 — 구독 없음
      cleanup = subscribeInbox(async (row) => {
        if (row.sender_id === uid) return;
        let handle = handleByPeer.current[row.sender_id];
        if (!handle) {
          const prof = await getProfileById(row.sender_id);
          handle = prof?.handle || row.sender_id;
          handleByPeer.current[row.sender_id] = handle;
          peerByHandle.current[handle] = row.sender_id;
        }
        ingestRemoteMessage(handle, mapRowToMessage(row, uid));
      });
      if (disposed) { cleanup(); cleanup = null; } // 구독 생성 직전에 언마운트된 경우 즉시 해제
    };

    // 이미 로그인된 상태로 앱이 뜬 경우 — 저장된 세션으로 즉시 1차 구독
    // (onAuthStateChange의 INITIAL_SESSION과 겹쳐도 uid가 같으면 applyUid가 무시한다)
    getMyUserId().then(applyUid).catch(() => {});

    const sub = supabase?.auth.onAuthStateChange((event, session) => {
      applyUid(event === 'SIGNED_OUT' ? null : (session?.user?.id ?? null));
    });

    return () => {
      disposed = true;
      cleanup?.();
      cleanup = null;
      sub?.data.subscription.unsubscribe();
    };
  }, [ingestRemoteMessage]);

  // 서버 스레드 시드 — 재설치/기기 변경으로 로컬 대화가 빈 스레드를 복원한다.
  // 이게 없으면 서버엔 대화가 있는데 목록(메이트 목록·대화 행)에 뜨지 않아, 특히 비메이트
  // 상대의 과거 대화는 상대가 새 메시지를 보내기 전까지 열람 경로가 아예 없었다.
  // hydrate 이후에만 실행 — 복원 전에 돌면 로컬 대화가 전부 비어 보여 전 스레드를 다시 받고,
  // 그 결과를 hydrate가 통째로 덮어쓰는 경합이 생긴다. 계정(uid)당 세션 1회.
  const seededForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured || !hydrated || !authUid) return;
    if (seededForRef.current === authUid) return;
    seededForRef.current = authUid;
    let cancelled = false;
    (async () => {
      const peers = await fetchThreadPeers();
      for (const peerId of peers) {
        if (cancelled) return;
        let handle = handleByPeer.current[peerId];
        if (!handle) {
          const prof = await getProfileById(peerId).catch(() => null);
          if (!prof?.handle) continue; // 탈퇴 등으로 프로필 없음 — 목록에 세울 이름이 없다
          handle = prof.handle;
          registerPeer(handle, peerId);
        }
        // 로컬에 이미 대화가 있으면 스킵 — 열려 있는 대화는 DMScreen 진입 시 loadHistory가 갱신
        if ((conversationsRef.current[handle]?.length ?? 0) > 0) continue;
        await loadHistory(handle, peerId); // 히스토리 병합 → 목록 행도 이 대화로 생긴다
      }
    })();
    return () => { cancelled = true; };
  }, [hydrated, authUid, loadHistory, registerPeer]);

  // 따라잡기 트리거 1: 로그인·콜드 스타트 (복원 이후에만 — 복원 전 conversations는 비어 있어
  // 워터마크가 폴백으로 떨어진다). 위 스레드 시드 effect와 일부러 분리했다 — 시드는
  // seededForRef로 uid당 1회 잠기지만 따라잡기는 그 잠금과 수명이 달라야 하기 때문이다.
  // 시드와 동시에 돌아도 ingestRemoteMessage의 remoteId 중복 가드가 처리한다.
  useEffect(() => {
    if (!isSupabaseConfigured || !hydrated || !authUid) return;
    catchUpInbox();
  }, [hydrated, authUid, catchUpInbox]);

  // 따라잡기 트리거 2·3: 백그라운드 → 포그라운드 복귀(실시간 소켓이 끊겨 있던 구간을 메움) ·
  // 오프라인 → 온라인 복귀(오프라인 콜드 스타트라 트리거 1이 헛돈 경우의 재시도).
  // hydrated 가드 필수 — 복원 전에 합류하면 hydrate가 통째로 덮어써 합류분이 사라지고
  // 10초 throttle만 소모한다(시드 effect 주석이 경계하는 그 경합과 같은 것이다).
  useEffect(() => {
    if (!isSupabaseConfigured || !hydrated) return;
    const offReconnect = onReconnect(() => { catchUpInbox(); });
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') catchUpInbox();
    });
    return () => { offReconnect(); sub.remove(); };
  }, [hydrated, catchUpInbox]);

  // 복원 전에는 시드 대화가 잠깐 보이지 않도록 렌더를 막는다
  if (!hydrated) {
    return <View style={{ flex: 1, backgroundColor: '#0A0A0F' }} />;
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
