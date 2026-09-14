import i18n from 'i18next';
import type { TravelRecord } from './recordStore';
import type { SharedRecord, Message, Friend } from './dmTypes';

/**
 * 메시지에 저장되는 시각 문자열.
 *
 * ⚠️ 이 값은 생성 당시 언어로 박제된다. 그래서 DMScreen.msgTimeLabel 은 createdAt 이 있으면
 * 렌더 시점에 다시 포맷하고(언어 전환 시 과거 메시지도 함께 바뀜), 저장값은 createdAt 없는
 * 구버전 메시지의 폴백으로만 쓴다. 여기선 그 폴백이 한국어로만 굳던 것만 고친다 —
 * 저장 구조는 그대로 두어 박제 문제를 키우지 않는다.
 *
 * · `src/i18n` 을 import 하지 않는다 — expo-localization 이 딸려와 tsx 검증(순수 노드 실행)이 죽는다.
 *   i18next 싱글턴만 참조하고, 초기화 전이면 language 가 undefined 라 ko 로 떨어진다.
 * · t() 대신 직접 조립한다. 언어별 오전/오후 위치가 다르다는 규칙(time.ampm 키)은 같다.
 */
export function nowTimeString(d: Date = new Date(), lang: string = i18n.language || 'ko'): string {
  const hour = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  const h12 = hour % 12 || 12;
  return lang.startsWith('en')
    ? `${h12}:${min} ${hour < 12 ? 'AM' : 'PM'}`
    : `${hour < 12 ? '오전' : '오후'} ${h12}:${min}`;
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
    // 발신자의 로컬 id(rec-...)는 수신자 기기에 존재하지 않는다 — 서버 id(remoteId)를 우선 담아
    // 수신자가 자기 피드(feedPosts)에서 게시물을 찾아 열 수 있게 한다.
    id: r.remoteId ?? r.id,
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

// margin: 타깃 주변 판정 여유(px) — 손가락이 원을 정확히 덮지 않아도 근처 드롭을 인정해 자연스럽게
export function hitTestTarget(px: number, py: number, targets: TargetRect[], margin = 0): string | null {
  for (const t of targets) {
    if (px >= t.x - margin && px <= t.x + t.w + margin && py >= t.y - margin && py <= t.y + t.h + margin) return t.key;
  }
  return null;
}
