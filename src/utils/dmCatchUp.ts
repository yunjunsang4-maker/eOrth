/**
 * DM 따라잡기(catch-up) 워터마크 계산 — 앱이 꺼져 있던 사이에 온 메시지를 다시 받기 위한 since 값.
 *
 * 서버(dm_messages)에서 앱으로 메시지가 돌아오는 경로는 지금까지 셋뿐이었다:
 * 실시간 구독(앱이 켜져 있는 동안만) · 서버 스레드 시드(로컬에 대화가 없을 때만) ·
 * loadHistory(그 대화방에 직접 들어갔을 때만). 그래서 앱을 끈 사이 온 DM은 푸시를 무시하고
 * 앱을 열면 메이트 목록에 안읽음 배지도 마지막 메시지도 뜨지 않았다.
 * 이 함수가 "어디서부터 다시 받아야 하는가"를 로컬 대화만 보고 결정한다.
 */

/** 따라잡기 기본 되돌아보기 — 로컬에 '받은 서버 메시지'가 하나도 없을 때만 쓴다 */
export const DM_CATCHUP_FALLBACK_MS = 7 * 24 * 60 * 60 * 1000;

/** 워터마크 계산에 필요한 최소 필드만 요구한다 — Message 전체를 받으면 검증이 무거워진다 */
type CatchUpMessage = { createdAt?: number; remoteId?: string; isMine?: boolean };

/**
 * 로컬 대화 전체에서 '마지막으로 받은 서버 메시지 시각'을 찾아 조회 시작점(ms)을 돌려준다.
 *
 * ⚠️ 판정은 `!isMine && remoteId` 다. `remoteId` 유무만으로 "서버 시각인가"를 가르면 틀린다 —
 *    내가 보낸 메시지는 서버 전송에 성공해 remoteId가 붙어도 createdAt이 기기 시계로 남기 때문이다:
 *    addMessage가 `createdAt: Date.now()`(기기 시계)로 만들고, 전송 성공 시 pushToBackend는
 *    remoteId만 부착할 뿐 createdAt을 갱신하지 않으며, services/dm.ts의 sendMessage는
 *    `select('id')`만 해서 서버 created_at을 받아오지도 않는다.
 *    → `{ remoteId 있음, createdAt = 기기 시계 }` 조합이 실재한다. 기기 시계가 Δ만큼 앞선 단말에서
 *    이 값을 워터마크로 쓰면 그 사이(실제 시각 ~ +Δ)에 도착한 메시지를 `.gt(created_at, ...)`가
 *    전부 걸러내고, 워터마크는 다시 내려가지 않으므로 그 메시지들은 영영 오지 않는다.
 *
 *    받은 메시지(isMine=false)는 ingestRemoteMessage ← mapRowToMessage 경로로만 들어오고
 *    그 createdAt은 row.created_at(서버 시각)이라 기기 시계가 섞이지 않는다. 이 기준은
 *    fetchInboxSince가 `.neq('sender_id', uid)`로 '받은 것만' 조회하는 것과도 정확히 맞물린다.
 *    (앱 코드 전수 확인: addMessage 호출부 중 `isMine: false`를 넘기는 곳은 없다 —
 *     isMine=false는 오직 서버본에서만 생긴다.)
 *
 * ⚠️ 상한 클램프를 걸지 않는다. 마지막으로 받은 메시지가 30일 전이면 30일 전부터 조회해야
 *    그 사이 온 것을 받는다. 여기서 최근 N일로 잘라내면 오래 안 쓴 계정이 영영 못 따라잡는다.
 *
 * 내가 보낸 것만 있는 대화(상대가 아직 답하지 않은 대화)는 기준점이 없어 워터마크에 기여하지
 * 않는다 → 인박스 전체가 그렇다면 7일 폴백. 의도된 동작이다(넓게 조회해도 중복은
 * ingestRemoteMessage의 remoteId 가드가 막는다).
 */
export function inboxCatchUpSince(
  conversations: Record<string, CatchUpMessage[]>,
  now: number,
): number {
  let watermark = 0;
  for (const list of Object.values(conversations ?? {})) {
    if (!Array.isArray(list)) continue;
    for (const m of list) {
      if (!m || m.isMine || !m.remoteId) continue; // '받은 서버 메시지'만 서버 시각을 보장한다
      const t = m.createdAt;
      if (typeof t !== 'number' || !Number.isFinite(t)) continue; // 시각 없는 구버전·NaN 무시
      if (t > watermark) watermark = t;
    }
  }
  // 받은 서버 메시지가 하나도 없으면(신규 설치·내 발신뿐) 기본 되돌아보기로 시작한다
  return watermark > 0 ? watermark : now - DM_CATCHUP_FALLBACK_MS;
}

/**
 * '서버에서 이미 본 구간'의 바닥값을 전진시킨다 — 조회 결과의 최대 createdAt.
 *
 * conversations에서 유도한 워터마크만으로는 "서버에서 봤지만 로컬에 남기지 않은 구간"을
 * 표현할 수 없다. 받은 대화를 전부 비운(clearConversation) 인박스가 그렇다: 워터마크가 0으로
 * 고착돼 매 회차 7일 폴백으로 같은 200건을 다시 끌어오고, 그 전부가 hiddenIds에 막혀 합류하지
 * 못하니 다음 회차도 똑같다 — 포그라운드마다 반복되는 순수 이그레스 낭비다.
 *
 * ⚠️ 이 바닥값이 건너뛰는 구간에 못 본 메시지는 존재하지 않는다. 돌려받은 행은 이미 '본' 것이고,
 *    합류하지 않은 것은 내가 숨겼거나(hiddenIds) 이미 있는 중복이라 다시 받을 이유가 없다.
 *    그래서 합류 여부와 무관하게 전진시켜도 안전하다.
 * ⚠️ 절대 내려가지 않는다(Math.max 계열). 조회 실패(fetchInboxSince가 null) 시에는 호출 자체를
 *    하지 않아야 한다 — 실패를 '본 것'으로 세면 그 구간이 통째로 날아간다.
 * ⚠️ NaN·Infinity는 반드시 걸러야 한다. 바닥값이 NaN이 되면 since가 NaN이 되고
 *    services/dm.ts의 `new Date(sinceMs).toISOString()`이 RangeError를 던져 catch로 빠지며,
 *    그 뒤로 따라잡기가 영구히 죽는다(항상 null 반환).
 */
export function advanceServerSeen(prev: number, items: { createdAt?: number }[]): number {
  let next = typeof prev === 'number' && Number.isFinite(prev) ? prev : 0;
  for (const it of items ?? []) {
    const t = it?.createdAt;
    if (typeof t !== 'number' || !Number.isFinite(t)) continue;
    if (t > next) next = t;
  }
  return next;
}
