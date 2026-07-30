/**
 * 운영자 공지 — 파싱·표시 판정의 순수 로직 (noticeFeed.verify.ts로 검증).
 *
 * 왜 서버 테이블이 아니라 정적 JSON인가: 이용약관 제3조가 개정 7일 전부터 앱 내 공지를
 * 요구하는데, 앱에 그 수단이 없었다. notifications 테이블은 사용자별 행 + 7일 보존 필터라
 * 맞지 않는다 — 7일 전에 띄운 공지가 정작 시행일에 사라진다. 약관·방침을 이미 GitHub
 * Pages로 게시하고 있으므로, 공지도 같은 곳에 JSON으로 올려 커밋만으로 게시한다.
 * 서버 스키마 변경도, 사용자별 행 생성도 필요 없다.
 *
 * 읽음 여부는 서버가 아니라 기기에 남긴다(마지막으로 본 공지의 게시 시각). 공지는
 * 개인화된 정보가 아니라 전체 고지라, 누가 읽었는지 서버가 알 필요가 없다.
 */

export interface Notice {
  id: string;
  /** 'terms' | 'privacy' | 'service' 등 — 화면에서 라벨을 붙이는 데 쓴다 */
  kind: string;
  title: string;
  body: string;
  /** 게시 시각(ms). 이 시각이 지나야 앱에 보인다 — 미래 날짜로 예약 게시가 된다 */
  publishedAt: number;
  /** 약관·방침 개정 공지의 시행일 표기(원문 그대로). 없으면 빈 문자열 */
  effectiveDate: string;
}

/** 'YYYY-MM-DD' 또는 ISO 문자열 → ms. 해석 불가면 null */
function toMs(v: unknown): number | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const t = Date.parse(v.length === 10 ? `${v}T00:00:00Z` : v);
  return Number.isFinite(t) ? t : null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * 원본 JSON을 Notice 배열로. 형태가 어긋난 항목은 통째로 버린다 —
 * 공지 하나가 깨졌다고 나머지 공지가 안 보이면 안 된다.
 * lang이 'en'이면 titleEn/bodyEn을 우선 쓰고, 없으면 한국어로 떨어진다.
 */
export function parseNotices(raw: unknown, lang: string): Notice[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as any).notices)
    ? (raw as any).notices
    : [];
  const out: Notice[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const id = str(r.id);
    const publishedAt = toMs(r.publishedAt);
    if (!id || publishedAt == null || seen.has(id)) continue;
    const en = lang === 'en';
    const title = (en && str(r.titleEn)) || str(r.title);
    const body = (en && str(r.bodyEn)) || str(r.body);
    if (!title) continue; // 제목 없는 공지는 목록에서 의미가 없다
    seen.add(id);
    out.push({ id, kind: str(r.kind) || 'service', title, body, publishedAt, effectiveDate: str(r.effectiveDate) });
  }
  return out;
}

/** 지금 보여야 할 공지 — 게시 시각이 지난 것만, 최신순 */
export function visibleNotices(list: Notice[], nowMs: number): Notice[] {
  return list.filter((n) => n.publishedAt <= nowMs).sort((a, b) => b.publishedAt - a.publishedAt);
}

/**
 * 안 읽은 공지가 있는지 — 설정 화면의 점 배지용.
 * lastSeenAt은 '마지막으로 공지 목록을 연 시점'이 아니라 '그때 가장 최신이던 공지의
 * 게시 시각'이다. 기기 시계가 틀어져도 게시 시각끼리 비교하므로 어긋나지 않는다.
 */
export function hasUnreadNotice(list: Notice[], lastSeenAt: number, nowMs: number): boolean {
  return visibleNotices(list, nowMs).some((n) => n.publishedAt > lastSeenAt);
}

/** 목록을 다 봤을 때 저장할 값 — 보이는 공지 중 가장 최신 게시 시각(없으면 기존 값 유지) */
export function latestPublishedAt(list: Notice[], nowMs: number, fallback = 0): number {
  const vis = visibleNotices(list, nowMs);
  return vis.length ? vis[0].publishedAt : fallback;
}
