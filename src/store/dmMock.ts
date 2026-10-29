// ponytail: DM 화면 디테일 확인용 가상 대화방 — 개발 빌드(__DEV__)에서만, 화면에만 붙는다.
// dmStore(영속·서버)에는 절대 들어가지 않는다: 목록(FriendsScreen)은 행 하나를 덧붙이고,
// 대화방(DMScreen)은 메시지를 로컬 state로 들고 보내기·삭제·비우기도 그 state만 바꾼다.
// 확인이 끝나면 SHOW_MOCK_DM을 false로 두거나 이 파일과 두 화면의 연결부를 지울 것.
import { Image } from 'react-native';
import type React from 'react';
import type { Message } from './dmTypes';
import type { useDMActions } from './dmStore';
import { nowTimeString, buildSharedRecord } from './dmShareLogic';

export const SHOW_MOCK_DM = __DEV__;
export const MOCK_DM_HANDLE = 'mock_dm_preview';

const asUri = (m: number) => Image.resolveAssetSource(m).uri;

export function mockDMMessages(): Message[] {
  const feed = asUri(require('../../assets/example/feed1.webp'));
  const snap = asUri(require('../../assets/example/snap1.webp'));
  const day = 86400000;
  const base = Date.now() - day - 3 * 3600000; // 어제 → 오늘로 넘어가 날짜 구분선이 보이게
  let n = 0;
  const m = (offsetMin: number, isMine: boolean, rest: Partial<Message>): Message => {
    const createdAt = base + offsetMin * 60000;
    return { id: `mock-dm-${n++}`, type: 'text', text: '', isMine, time: nowTimeString(new Date(createdAt)), createdAt, ...rest };
  };
  return [
    m(0, false, { text: '안녕하세요! 도쿄 여행 기록 보고 연락드려요 😊' }),
    m(1, true, { text: '앗 안녕하세요! 봐주셔서 감사해요' }),
    m(2, false, { text: '시부야 그 카페 어디예요? 다음 달에 가는데 꼭 가보고 싶어서요. 혹시 웨이팅 길었나요? 주말에 가면 사람 많을까요?' }),
    m(4, true, { type: 'image', text: '', imageUri: feed }),
    m(4, true, { text: '여기예요! 평일 오전엔 바로 들어갔어요' }),
    m(60 * 24 + 10, false, {
      text: '오 감사합니다!! 저장해둘게요',
      replyTo: { id: 'mock-dm-4', isMine: true, type: 'text', text: '여기예요! 평일 오전엔 바로 들어갔어요' },
    }),
    m(60 * 24 + 12, false, {
      type: 'record', text: '',
      record: { id: 'mock-rec-1', country: '🇯🇵 일본', content: '교토 3박 4일 정리', viewType: 'blog', date: '2026.10.01', blogTitle: '교토 3박 4일 정리', blogPreview: '첫날은 기요미즈데라부터 걸어서 기온까지.' },
    }),
    m(60 * 24 + 13, false, {
      type: 'record', text: '',
      record: { id: 'mock-rec-2', country: '🇯🇵 일본', content: '지금 여기', viewType: 'feed', date: '2026.10.02', mediaUri: snap },
    }),
    m(60 * 24 + 15, true, { text: 'ㅋㅋㅋ 좋아요' }),
    m(60 * 24 + 16, true, { text: '전송 실패 상태 확인용 메시지', failed: true }),
  ];
}

/** 메이트 목록(FriendsScreen) 행 — 마지막 메시지 미리보기·시각을 가상 대화에 맞춘다 */
export function mockDMListRow() {
  const msgs = mockDMMessages();
  const last = msgs[msgs.length - 1];
  return {
    id: `dm-${MOCK_DM_HANDLE}`, name: MOCK_DM_HANDLE, handle: MOCK_DM_HANDLE, emoji: '💬', photo: undefined as string | undefined,
    lastMessage: last.text, lastMessageAt: last.createdAt ?? 0, unread: 0, online: true,
  };
}

type DMActions = ReturnType<typeof useDMActions>;

/** 가상 대화방 전용 액션 — 전부 로컬 state만 바꾸고 서버·저장소는 건드리지 않는다 */
export function mockDMActions(real: DMActions, setMsgs: React.Dispatch<React.SetStateAction<Message[]>>): DMActions {
  const push: DMActions['addMessage'] = (_h, msg) => {
    const createdAt = Date.now();
    setMsgs((p) => [...p, {
      id: `mock-dm-${createdAt}`, type: msg.type, text: msg.text, isMine: msg.isMine ?? true,
      time: nowTimeString(new Date(createdAt)), createdAt,
      imageUri: msg.imageUri, record: msg.record, replyTo: msg.replyTo,
    }]);
  };
  return {
    ...real,
    addMessage: push,
    sendRecord: (h, r) => push(h, { type: 'record', text: '', record: buildSharedRecord(r) }),
    deleteMessage: (_h, id) => setMsgs((p) => p.filter((x) => x.id !== id)),
    clearConversation: () => setMsgs([]),
    retrySend: (_h, id) => setMsgs((p) => p.map((x) => (x.id === id ? { ...x, failed: undefined } : x))),
    markRead: () => {},
    loadHistory: async () => {},
    checkBlockedWith: async () => false,
  };
}
