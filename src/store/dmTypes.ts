export type MsgType = 'text' | 'image' | 'record';

export interface SharedRecord {
  id: string;
  country: string;
  content: string;
  viewType: 'feed' | 'blog' | 'album' | 'snap';
  date: string;
  mediaUri?: string;
  albumUris?: string[];
  snapFrontUri?: string;
  snapBackUri?: string;
  snapCaption?: string;
  blogTitle?: string;
  blogPreview?: string;
}

export interface Message {
  id: string;
  type: MsgType;
  text: string;
  isMine: boolean;
  time: string;
  imageUri?: string;
  record?: SharedRecord;
}

export interface Friend {
  id?: string;
  name: string;
  handle: string;
  emoji: string;
  online?: boolean;
}
