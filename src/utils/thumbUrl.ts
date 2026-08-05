/**
 * 목록용 축소본(썸네일) 선택 유틸
 *
 * 발행 시 services/posts.ts 가 '원본 URL → 축소본 URL' 맵(record.thumbs)을 만들어 함께 저장한다.
 * 피드·스토리·여행카드처럼 사진을 작게 그리는 목록에서는 원본 대신 축소본을 쓴다(이그레스 절감).
 * 상세 화면·사진 뷰어는 이 함수를 쓰지 않는다 — 거기서는 원본 화질이 그대로 필요하다.
 *
 * 하위 호환: thumbs가 없거나(옛 글·로컬 미발행 기록) 해당 URL의 항목이 없으면 원본을 그대로 돌려준다.
 */

/** 기록의 축소본 맵에서 url에 대응하는 축소본을 고른다. 없으면 원본 그대로. */
export function thumbOf(thumbs: Record<string, string> | undefined, url: string): string;
export function thumbOf(thumbs: Record<string, string> | undefined, url?: string): string | undefined;
export function thumbOf(thumbs: Record<string, string> | undefined, url?: string): string | undefined {
  if (!url) return url;
  return thumbs?.[url] ?? url;
}
