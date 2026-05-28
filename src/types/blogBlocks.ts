/**
 * 블로그 블록 타입 정의
 * 네이버 SmartEditor 3.0 호환 블록 구조
 */

// ─── 블록 타입 ───
export type BlogBlockType =
  | 'text'
  | 'heading'
  | 'image'
  | 'images'
  | 'video'
  | 'separator'
  | 'quote'
  | 'link'
  | 'sticker'
  | 'file';

// ─── 텍스트 정렬 ───
export type TextAlign = 'left' | 'center' | 'right';

// ─── 구분선 스타일 ───
export type SeparatorStyle = 'line' | 'dots' | 'dashed' | 'thick' | 'space';

// ─── 이미지 레이아웃 ───
export type ImageLayout = 'single' | 'grid2' | 'grid3' | 'slide';

// ─── 소제목 레벨 ───
export type HeadingLevel = 1 | 2 | 3;

// ─── 개별 블록 데이터 ───

export interface TextBlock {
  id: string;
  type: 'text';
  value: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  color?: string;
  bgColor?: string;
  fontSize?: number;
  fontFamily?: string;
  align?: TextAlign;
}

export interface HeadingBlock {
  id: string;
  type: 'heading';
  value: string;
  level: HeadingLevel;
  align?: TextAlign;
}

export interface ImageBlock {
  id: string;
  type: 'image';
  uri: string;
  caption?: string;
}

export interface ImagesBlock {
  id: string;
  type: 'images';
  items: { uri: string; caption?: string }[];
  layout: ImageLayout;
}

export interface SeparatorBlock {
  id: string;
  type: 'separator';
  style: SeparatorStyle;
}

export interface QuoteBlock {
  id: string;
  type: 'quote';
  value: string;
}

export interface LinkBlock {
  id: string;
  type: 'link';
  url: string;
  title?: string;
  description?: string;
  thumbnail?: string;
}

export interface StickerBlock {
  id: string;
  type: 'sticker';
  stickerId: string;
  stickerName: string;
}

export interface VideoBlock {
  id: string;
  type: 'video';
  uri: string;
  caption?: string;
  thumbnail?: string;
}

export interface FileBlock {
  id: string;
  type: 'file';
  uri: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
}

// ─── 통합 블록 타입 ───
export type BlogBlock =
  | TextBlock
  | HeadingBlock
  | ImageBlock
  | ImagesBlock
  | VideoBlock
  | SeparatorBlock
  | QuoteBlock
  | LinkBlock
  | StickerBlock
  | FileBlock;

// ─── 블로그 카테고리 ───
export const BLOG_CATEGORIES = [
  '여행일기',
  '맛집/카페',
  '숙소 리뷰',
  '여행 팁',
  '관광지',
  '쇼핑',
  '문화/체험',
  '자연/풍경',
  '교통',
  '기타',
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

// ─── 텍스트 색상 팔레트 ───
export const TEXT_COLORS = [
  '#FFFFFF', '#A1A1B0', '#FF3B30', '#FF9500',
  '#FFCC00', '#34C759', '#00C7BE', '#30B0C7',
  '#007AFF', '#5856D6', '#AF52DE', '#FF2D55',
] as const;

// ─── 배경 색상 팔레트 ───
export const BG_COLORS = [
  'transparent', 'rgba(255,59,48,0.15)', 'rgba(255,149,0,0.15)',
  'rgba(255,204,0,0.15)', 'rgba(52,199,89,0.15)', 'rgba(0,199,190,0.15)',
  'rgba(0,122,255,0.15)', 'rgba(88,86,214,0.15)', 'rgba(175,82,222,0.15)',
  'rgba(255,45,85,0.15)',
] as const;

// ─── 글꼴 옵션 ───
export const FONT_OPTIONS = [
  { label: '기본', value: 'System' },
  { label: '나눔고딕', value: 'NanumGothic_400Regular' },
  { label: '나눔명조', value: 'NanumMyeongjo_400Regular' },
  { label: '나눔스퀘어', value: 'NanumSquare' },
  { label: '나눔스퀘어라운드', value: 'NanumSquareRound' },
  { label: '나눔바른고딕', value: 'NanumBarunGothic' },
  { label: '나눔바른펜', value: 'NanumBarunpen' },
  { label: '나눔손글씨 붓', value: 'NanumBrushScript_400Regular' },
  { label: '나눔손글씨 펜', value: 'NanumPenScript_400Regular' },
  { label: '마루부리', value: 'MaruBuri' },
] as const;

// ─── 글꼴 크기 옵션 ───
export const FONT_SIZE_OPTIONS = [
  { label: '작게', size: 13 },
  { label: '보통', size: 15 },
  { label: '크게', size: 18 },
  { label: '아주 크게', size: 22 },
  { label: '제목급', size: 26 },
] as const;

// ─── 헬퍼 ───
let _counter = 0;
export const genBlockId = (): string => `blk-${Date.now()}-${_counter++}`;

export const createTextBlock = (value = '', overrides?: Partial<TextBlock>): TextBlock => ({
  id: genBlockId(),
  type: 'text',
  value,
  ...overrides,
});

export const createHeadingBlock = (value = '', level: HeadingLevel = 2): HeadingBlock => ({
  id: genBlockId(),
  type: 'heading',
  value,
  level,
});

export const createImageBlock = (uri: string, caption?: string): ImageBlock => ({
  id: genBlockId(),
  type: 'image',
  uri,
  caption,
});

export const createImagesBlock = (
  uris: string[],
  layout: ImageLayout = 'grid2'
): ImagesBlock => ({
  id: genBlockId(),
  type: 'images',
  items: uris.map(uri => ({ uri })),
  layout,
});

export const createVideoBlock = (uri: string, caption?: string, thumbnail?: string): VideoBlock => ({
  id: genBlockId(),
  type: 'video',
  uri,
  caption,
  thumbnail,
});

export const createSeparatorBlock = (style: SeparatorStyle = 'dots'): SeparatorBlock => ({
  id: genBlockId(),
  type: 'separator',
  style,
});

export const createQuoteBlock = (value = ''): QuoteBlock => ({
  id: genBlockId(),
  type: 'quote',
  value,
});

export const createLinkBlock = (url: string): LinkBlock => ({
  id: genBlockId(),
  type: 'link',
  url,
});

export const createStickerBlock = (stickerId: string, stickerName: string): StickerBlock => ({
  id: genBlockId(),
  type: 'sticker',
  stickerId,
  stickerName,
});

export const createFileBlock = (uri: string, fileName: string, fileSize?: number, mimeType?: string): FileBlock => ({
  id: genBlockId(),
  type: 'file',
  uri,
  fileName,
  fileSize,
  mimeType,
});

// ─── 블록 → 평문 변환 (저장용) ───
export function blocksToPlainText(blocks: BlogBlock[]): string {
  return blocks
    .filter(b => b.type === 'text' || b.type === 'quote' || b.type === 'heading')
    .map(b => {
      if (b.type === 'quote') return `「${b.value}」`;
      if (b.type === 'heading') return b.value;
      return (b as TextBlock).value;
    })
    .filter(v => v.trim())
    .join('\n\n');
}

// ─── 블록에서 사진 URI 추출 ───
export function blocksToPhotos(blocks: BlogBlock[]): string[] {
  const photos: string[] = [];
  blocks.forEach(b => {
    if (b.type === 'image') photos.push(b.uri);
    if (b.type === 'images') b.items.forEach(item => photos.push(item.uri));
  });
  return photos;
}

// ─── 블록에서 소제목 추출 (목차용) ───
export function extractHeadings(blocks: BlogBlock[]): { id: string; level: HeadingLevel; text: string }[] {
  return blocks
    .filter((b): b is HeadingBlock => b.type === 'heading')
    .map(b => ({ id: b.id, level: b.level, text: b.value }));
}
