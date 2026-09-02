/**
 * DM의 handle ↔ peer(profile uuid) 매핑을 영속화하기 위한 순수 로직 —
 * 저장 payload 정규화 · 역방향 맵 생성 · 저장 직전 가지치기.
 *
 * 왜 매핑을 영속화하는가:
 * dmStore의 peerByHandle/handleByPeer는 ref라 앱을 껐다 켜면 비어 있다. 반면 conversations는
 * 영속돼 handle('alice') 키로 그대로 남는다. 그래서 콜드 스타트 직후 따라잡기(catch-up)가
 * 도는데 프로필 조회가 일시 실패하면, 이미 'alice' 키로 존재하는 대화의 새 메시지가
 * '<uuid>' 키로 들어가 메이트 목록에 **같은 사람 행이 2개** 뜬다.
 * uuid 폴백 자체는 의도된 것이라 되돌리면 안 된다 — 거기서 메시지를 버리면 같은 배치의 다른
 * 메시지가 합류하는 순간 워터마크가 전진해 버려진 메시지가 영구 유실된다. 그래서 폴백을 없애는
 * 대신 "매핑이 재시작을 못 넘긴다"는 근본 원인을 닫는다.
 *
 * 왜 dmStore.tsx가 아니라 여기인가:
 * dmStore.tsx는 react-native를 import하므로 검증 러너(tsx)가 import조차 못 한다.
 * 순수한 부분만 떼어내 검증을 붙이는 것이 이 저장소의 패턴이다(dmShareLogic.ts와 같은 구조).
 */

/** handle → peer uuid (역방향 맵도 같은 형태라 타입을 공유한다) */
export type PeerMap = Record<string, string>;

/**
 * 폴백 항목인가 — 프로필 조회 실패로 handle 자리에 uuid를 그대로 넣은 임시 항목(`handle === peerId`).
 *
 * ⚠️ **이 항목은 절대 영속하지 않는다.** 세션 안에서만 살아야 한다.
 *    영속되면 다음 콜드 스타트에 `handleByPeer[U1] = 'U1'`이 복원되고, 따라잡기·실시간 수신의
 *    `if (!handle)` 가드가 그 값을 truthy로 통과해 **프로필 재조회가 영영 일어나지 않는다.**
 *    그러면 임시 uuid 행이 진짜 'alice' 대화를 영구 대체하고 alice 행은 조용히 죽는다
 *    (FriendsScreen의 `getProfileByHandle('<uuid>')`는 null이라 치유하지 못하고, 새 메시지가
 *     전부 uuid 행에 뜨므로 사용자가 죽은 방을 열 이유도 없다).
 *    영속을 안 막았을 때의 증상은 "행이 2개(일시적)"가 아니라 "진짜 대화가 영구 대체"로 더 나쁘다.
 *
 * 세션 내 인메모리 등록(registerPeer의 폴백 호출)은 **그대로 둔다.** 그건 같은 배치의 메시지들이
 * 한 키로 일관되게 들어가게 하는 장치라 필요하다. 막을 것은 '영속'뿐이다.
 */
const isFallbackEntry = (handle: string, peerId: string) => handle === peerId;

/**
 * 저장된 payload의 peers를 신뢰하지 않고 정규화한다.
 *
 * ⚠️ 절대 throw하지 않는다 — dmStore hydrate의 'payload 필드 가드' 관례를 그대로 따른다.
 *    여기서 던지면 부분 복원 상태가 곧이어 디바운스 저장으로 원본을 덮어써 대화 전체가 날아간다.
 *    타입이 맞지 않는 항목은 조용히 버린다(구버전 payload에는 이 필드가 아예 없다 = 정상).
 *
 * ⚠️ 폴백 항목은 복원 단계에서도 거른다. 저장만 막으면 **이미 폴백이 저장된 기기가 영원히
 *    빠져나오지 못한다** — 복원 → `if (!handle)` 통과 → 재조회 없음 → 그대로 재저장의 고리다.
 *    여기서 거르면 그 기기는 다음 실행에 재조회 경로로 돌아가 스스로 치유된다.
 */
export function normalizePeerMap(raw: unknown): PeerMap {
  const out: PeerMap = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [handle, peerId] of Object.entries(raw as Record<string, unknown>)) {
    if (!handle) continue; // 빈 handle은 대화 키가 될 수 없다
    if (typeof peerId !== 'string' || !peerId) continue; // 숫자·null·객체 등 손상 값 제거
    if (isFallbackEntry(handle, peerId)) continue; // 잘못 저장된 폴백 치유(위 주석)
    out[handle] = peerId;
  }
  return out;
}

/**
 * 역방향 맵(peer uuid → handle)을 만든다.
 *
 * 복원 시 **반드시 함께 채워야 한다.** 따라잡기와 실시간 수신이 조회하는 쪽은 정방향이 아니라
 * 이 역방향(`handleByPeer[senderId]`)이라, 이걸 비워 두면 매핑을 영속화해도 증상이 그대로다.
 *
 * 같은 uuid에 handle이 둘 이상 걸릴 수 있다 — 프로필 조회 실패로 uuid를 handle 대신 쓴 폴백
 * 항목('<uuid>' → uuid)이 남은 뒤 진짜 handle이 등록되는 경우다. 이 규칙은 **영속 맵이 아니라
 * 인메모리 맵을 위해 남겨 둔다** — normalizePeerMap이 폴백을 걸러 복원 경로에는 폴백이 없지만,
 * dmStore가 세션 중 registerPeer로 만든 맵에는 여전히 폴백이 섞이고 그 맵도 이 함수로 뒤집는다.
 * 규칙은 두 가지다:
 *  · 진짜 handle은 폴백(handle === uuid)을 항상 이긴다 — 폴백 이름은 목록에 uuid가 그대로
 *    노출되는 임시값이라 남겨 둘 이유가 없다.
 *  · 진짜 handle끼리 겹치면 나중 항목이 이긴다 — 객체 키는 삽입 순서를 유지하므로 뒤쪽이
 *    더 최근에 등록된(=아이디 변경 후의) 이름이다.
 */
export function invertPeerMap(peers: PeerMap): PeerMap {
  const out: PeerMap = {};
  for (const [handle, peerId] of Object.entries(peers ?? {})) {
    if (out[peerId] === undefined) { out[peerId] = handle; continue; }
    if (handle !== peerId) out[peerId] = handle; // 폴백은 덮어쓰지 못하고, 진짜 이름은 최신이 이긴다
  }
  return out;
}

/**
 * 저장 직전 가지치기 — 복원된 대화에 **키가 존재하는** handle의 항목만, 그리고 **폴백이 아닌**
 * 항목만 남긴다.
 * (hideRemoteIds의 MAX_HIDDEN과 같은 위생. 그냥 두면 이 맵은 상한 없이 자란다 —
 *  프로필을 스쳐 보거나 빠른공유 대상으로 조회만 된 상대까지 전부 쌓인다.)
 *
 * ⚠️ 폴백 항목(handle === peerId)을 **반드시 여기서 막아야 한다.** 폴백으로 합류한 메시지는
 *    conversations에 '<uuid>' 키를 만들기 때문에 '키 존재' 조건만으로는 통과해 버린다.
 *    저장되면 다음 콜드 스타트에 재조회가 영영 막혀 임시 uuid 행이 진짜 대화를 영구 대체한다
 *    (isFallbackEntry 주석 참조). 저장하지 않아도 잃는 것은 없다 — 다음 실행에 프로필을 다시
 *    조회해 진짜 handle로 붙이는 것이 원래 의도한 동작이다.
 *
 * '대화가 아직 없는데 registerPeer만 된 항목'을 즉시 버려도 되는 근거:
 *  · 막아야 할 증상(같은 사람 행 2개)은 **이미 handle 키 대화가 있을 때만** 생긴다. 대화가
 *    없으면 uuid 키로 들어가도 행이 하나뿐이라 중복이 아니다.
 *  · 잃어도 복구된다 — pushToBackend·loadHistory는 매핑이 없으면 getProfileByHandle로 다시
 *    조회해 registerPeer한다. 대가는 네트워크 호출 1회뿐이고, 그 경로는 원래부터 있었다.
 *  · 판정 기준을 '메시지 1건 이상'이 아니라 '키 존재'로 잡은 것이 중요하다. clearConversation은
 *    빈 배열을 남기므로 키는 유지되는데, **비운 대화야말로 이 증상이 실제로 터지던 자리다**
 *    (로컬은 비었고 서버엔 남아 있어 따라잡기가 계속 그 상대의 메시지를 물어온다).
 */
export function prunePeerMap(peers: PeerMap, conversations: Record<string, unknown>): PeerMap {
  const out: PeerMap = {};
  const conv = conversations ?? {};
  for (const [handle, peerId] of Object.entries(peers ?? {})) {
    if (isFallbackEntry(handle, peerId)) continue; // 폴백은 영속 금지(위 주석)
    if (!Object.prototype.hasOwnProperty.call(conv, handle)) continue;
    out[handle] = peerId;
  }
  return out;
}
