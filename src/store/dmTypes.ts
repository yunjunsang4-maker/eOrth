export type MsgType = 'text' | 'image' | 'record';

export interface SharedRecord {
  id: string;
  country: string;
  content: string;
  viewType: 'feed' | 'blog' | 'album' | 'snap' | 'cut';
  date: string;
  mediaUri?: string;
  albumUris?: string[];
  snapFrontUri?: string;
  snapBackUri?: string;
  snapCaption?: string;
  blogTitle?: string;
  blogPreview?: string;
}

// 답글이 가리키는 원본 메시지의 요약 정보
export interface ReplyInfo {
  id: string;       // 원본 메시지 id
  isMine: boolean;  // 원본이 내 메시지였는지
  type: MsgType;    // 미리보기 렌더용
  text: string;     // 미리보기 텍스트
}

export interface Message {
  id: string;
  type: MsgType;
  text: string;
  isMine: boolean;
  time: string;
  createdAt?: number; // 전송 시각(ms). 날짜 구분 헤더용. 시드/구버전 메시지는 없을 수 있음
  imageUri?: string;
  record?: SharedRecord;
  replyTo?: ReplyInfo;
  remoteId?: string; // Supabase dm_messages.id (백엔드 동기화/중복제거용)
  failed?: boolean;  // 백엔드 전송 실패(이미지 업로드/전송 오류) — 재시도 표시용
}

export interface Friend {
  id?: string;
  name: string;
  handle: string;
  emoji: string;
  online?: boolean;
}
