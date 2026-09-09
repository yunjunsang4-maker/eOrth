// 앱내 알림 배너(NotiToastHost)의 '이미 띄웠나' 판정 — 순수 로직.
//
// 왜 id만으로는 안 되는가: `notifications`에는 `uq_notifications_actor_type(user_id, actor_id, type)`
// 유일 인덱스가 있어, **같은 사람의 두 번째 반응은 새 행이 아니라 기존 행의 UPDATE로 collapse된다**
// (`on conflict do update set created_at = now(), read = false`). 행 id가 그대로라
// 본 알림 id를 Set에 담아 거르면 그 사람의 재반응은 **영영 배너가 안 떴다.**
// (같은 이유로 푸시 트리거 notify_send_push도 INSERT 전용이면 안 됐다 — schema.sql 10-f 참조)
//
// 그래서 키를 `id:created_at`으로 잡는다:
//   · 재알림(collapse) → created_at이 갱신 → 새 키 → 배너 뜸
//   · 읽음 처리 update(read=true) → created_at 그대로 → 이미 본 키 → 배너 없음
//
// read 값은 키에 넣지 않는다. 넣으면 읽음 처리가 새 키를 만들어 방금 읽은 알림이 배너로 되돌아온다.

/** 배너 판정에 필요한 최소 필드 (services/social의 AppNotification 부분집합) */
export interface FreshnessInput {
  id: string;
  createdAt: number;
}

/** 배너 중복 판정 키 — `${id}:${createdAt}` */
export function notificationKey(n: FreshnessInput): string {
  return `${n.id}:${n.createdAt}`;
}

/**
 * 아직 배너로 안 띄운 알림만 골라 **오래된 순**으로 돌려준다(도착 순서 유지).
 * 입력은 서버 정렬 그대로(최신순)를 기대한다.
 * ⚠️ 이 함수는 `seen`을 건드리지 않는다 — 호출부가 실제로 큐에 넣으면서 표시하도록
 *    분리해 두어야, 뮤트·차단으로 배너를 건너뛴 알림도 '본 것'으로 확실히 기록된다.
 */
export function pickFreshNotifications<T extends FreshnessInput>(rows: T[], seen: Set<string>): T[] {
  return rows.filter((r) => !seen.has(notificationKey(r))).reverse();
}
