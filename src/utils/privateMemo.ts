/**
 * 블로그 '메모 (비공개) — 나만 볼 수 있는 메모'를 서버·타인에게서 떼어내는 규칙 (보안 감사 2026-11-07).
 *
 * 왜: BlogRecordScreen이 그 메모를 TravelRecord.memo에 넣는데, 발행 사본(posts.ts withUploadedMedia)이
 *     그대로 posts.data에 올렸다. posts_select는 이웃에게 data 전체를 주므로, '나만 볼 수 있다'고
 *     안내한 메모가 이웃의 게시물 상세에 그대로 떴다.
 *
 * ⚠️ 블로그(viewType === 'blog')만 대상이다. 피드·네컷 등 다른 형식의 memo는 **공개 본문**
 *    (피드 캡션·네컷 '글')이라 지우면 남의 피드에서 글이 사라진다.
 *
 * 쓰는 곳:
 *   · posts.ts withUploadedMedia — 발행·수정 사본에서 뺀다(서버에 안 올린다)
 *   · posts.ts mapRowToRecord   — 받은 행에서도 뺀다(옛 행·업데이트 안 한 작성자 앱 방어)
 *   · mergeMyRecords.ts mergeServerUpdate — 서버본엔 없으므로 작성 기기의 로컬 메모를 지킨다
 */

/** 이 기록의 memo가 작성자 전용(비공개)인가 — 블로그만 */
export function isPrivateMemoRecord(rec: { viewType?: unknown }): boolean {
  return rec.viewType === 'blog';
}

/**
 * 블로그 기록이면 memo를 뺀 사본을, 아니면 입력을 그대로(같은 참조) 돌려준다.
 * 입력은 변형하지 않는다. 키 자체를 지운다(`memo: undefined`로 두면 JSON 직렬화에선 빠지지만
 * 스프레드 병합에서 남의 값을 undefined로 덮는 부작용이 생긴다).
 */
export function stripPrivateMemo<T extends { viewType?: unknown; memo?: unknown }>(rec: T): T {
  if (!isPrivateMemoRecord(rec) || !('memo' in rec)) return rec;
  const out = { ...rec };
  delete out.memo;
  return out;
}
