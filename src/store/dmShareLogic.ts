import type { TravelRecord } from './recordStore';
import type { SharedRecord, Message, Friend } from './dmTypes';

export function nowTimeString(d: Date = new Date()): string {
  const hour = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  const ampm = hour < 12 ? '오전' : '오후';
  return `${ampm} ${hour % 12 || 12}:${min}`;
}

export function buildSharedRecord(r: TravelRecord): SharedRecord {
  const vt = (r.viewType || 'feed') as SharedRecord['viewType'];
  let blogTitle = '';
  let blogPreview = '';
  if (vt === 'blog' && r.blogBlocks?.length) {
    const heading = r.blogBlocks.find((b) => b.type === 'heading');
    blogTitle = (heading && 'value' in heading ? (heading as any).value : '') || r.content;
    const textBlock = r.blogBlocks.find((b) => b.type === 'text');
    blogPreview = textBlock && 'value' in textBlock ? (textBlock as any).value : '';
  }
  return {
    id: r.id,
    country: r.country,
    content: r.content,
    viewType: vt,
    date: r.date,
    mediaUri: r.medias?.[0] || r.snapBackUri,
    albumUris: vt === 'album' ? (r.medias || []).slice(0, 4) : undefined,
    snapFrontUri: r.snapFrontUri,
    snapBackUri: r.snapBackUri,
    snapCaption: r.snapCaption,
    blogTitle: blogTitle || undefined,
    blogPreview: blogPreview || undefined,
  };
}

export function pickTopFriends(
  friends: Friend[],
  conversations: Record<string, Message[]>,
  n: number
): Friend[] {
  return [...friends]
    .sort((a, b) => (conversations[b.handle]?.length ?? 0) - (conversations[a.handle]?.length ?? 0))
    .slice(0, n);
}

export interface TargetRect { key: string; x: number; y: number; w: number; h: number }

export function hitTestTarget(px: number, py: number, targets: TargetRect[]): string | null {
  for (const t of targets) {
    if (px >= t.x && px <= t.x + t.w && py >= t.y && py <= t.y + t.h) return t.key;
  }
  return null;
}
