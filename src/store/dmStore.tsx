import React, { createContext, useContext, useState, useCallback } from 'react';
import type { TravelRecord } from './recordStore';
import type { Friend, Message, MsgType, SharedRecord } from './dmTypes';
import { buildSharedRecord, nowTimeString, pickTopFriends } from './dmShareLogic';

// ── 시드 (기존 DMScreen DUMMY_CHATS / SocialScreen SHARE_FRIENDS 이전) ──
const INITIAL_FRIENDS: Friend[] = [
  { id: '1', name: '김민지', handle: 'minji_travel', emoji: '🌸', online: true },
  { id: '2', name: '이준호', handle: 'junho_world', emoji: '🏄', online: true },
  { id: '3', name: '박서연', handle: 'seoyeon_log', emoji: '✈️', online: false },
  { id: '4', name: '최우진', handle: 'woojin_trip', emoji: '🗺️', online: false },
  { id: '5', name: '정하늘', handle: 'haneul_sky', emoji: '🌅', online: false },
  { id: '6', name: '강도윤', handle: 'doyun_go', emoji: '🎒', online: true },
];

const INITIAL_CONVERSATIONS: Record<string, Message[]> = {
  minji_travel: [
    { id: '1', type: 'text', text: '파리 어때? 날씨 좋아?', isMine: false, time: '오후 2:10' },
    { id: '2', type: 'text', text: '완전 좋아! 에펠탑 앞이야 지금', isMine: true, time: '오후 2:11' },
    { id: '3', type: 'text', text: '파리 사진 너무 예쁘다!', isMine: false, time: '오후 2:12' },
  ],
  junho_world: [
    { id: '1', type: 'text', text: '이번 여름에 어디 갈 거야?', isMine: true, time: '오후 1:30' },
    { id: '2', type: 'text', text: '일본이랑 태국 고민 중', isMine: false, time: '오후 1:32' },
    { id: '3', type: 'text', text: '다음 여행 어디로 갈 거야?', isMine: false, time: '오후 1:45' },
  ],
  seoyeon_log: [
    { id: '1', type: 'text', text: '태국 맛집 알아?', isMine: true, time: '오전 11:20' },
    { id: '2', type: 'text', text: '태국 맛집 리스트 보내줄게', isMine: false, time: '오전 11:25' },
  ],
  woojin_trip: [
    { id: '1', type: 'text', text: '오사카 가고 싶다', isMine: true, time: '어제' },
    { id: '2', type: 'text', text: '같이 일본 갈래?', isMine: false, time: '어제' },
  ],
  haneul_sky: [
    { id: '1', type: 'text', text: '발리 스냅 봤어! 대박', isMine: false, time: '어제' },
  ],
  doyun_go: [
    { id: '1', type: 'text', text: '베트남 숙소 추천해줘', isMine: false, time: '어제' },
  ],
};

export interface NewMessage {
  type: MsgType;
  text: string;
  isMine?: boolean;
  imageUri?: string;
  record?: SharedRecord;
}

interface DMContextType {
  conversations: Record<string, Message[]>;
  friends: Friend[];
  addMessage: (handle: string, msg: NewMessage) => void;
  sendRecord: (handle: string, record: TravelRecord) => void;
  topFriends: (n: number) => Friend[];
}

const DMContext = createContext<DMContextType | null>(null);

export function DMProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Record<string, Message[]>>(INITIAL_CONVERSATIONS);
  const [friends] = useState<Friend[]>(INITIAL_FRIENDS);

  const addMessage = useCallback((handle: string, msg: NewMessage) => {
    setConversations((prev) => {
      const m: Message = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: msg.type,
        text: msg.text,
        isMine: msg.isMine ?? true,
        time: nowTimeString(),
        imageUri: msg.imageUri,
        record: msg.record,
      };
      return { ...prev, [handle]: [...(prev[handle] ?? []), m] };
    });
  }, []);

  const sendRecord = useCallback((handle: string, record: TravelRecord) => {
    addMessage(handle, { type: 'record', text: '', record: buildSharedRecord(record) });
  }, [addMessage]);

  const topFriends = useCallback((n: number) => pickTopFriends(friends, conversations, n), [friends, conversations]);

  return (
    <DMContext.Provider value={{ conversations, friends, addMessage, sendRecord, topFriends }}>
      {children}
    </DMContext.Provider>
  );
}

export function useDM() {
  const ctx = useContext(DMContext);
  if (!ctx) throw new Error('useDM must be used within DMProvider');
  return ctx;
}
