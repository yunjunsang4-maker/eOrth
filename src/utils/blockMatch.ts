// 차단 판정 순수 로직 — recordStore.isBlocked가 쓴다(검증: blockMatch.verify.ts).
//
// 두 갈래 OR:
//   1) 계정 uuid 일치 — 상대가 아이디(handle)를 바꾸면 로컬에 캐시된 글·댓글·알림·DM 행은 새 handle을
//      달고 와서 handle 비교만으로는 다시 보였다(서버 차단은 uuid라 정상). 차단 항목의 id(백필로 채워짐)와
//      화면 데이터의 계정 uuid가 같으면 차단이다.
//   2) 기존 규칙 그대로 — handle 있는 항목은 handle끼리만, handle 없는 구버전 항목만 이름 폴백
//      (handle 있는 항목까지 이름을 보면 동명이인이 통째로 차단돼 보였다).
// 차단 신원 키는 여전히 handle이다(blockedFlagKey·unblock·state_flags 동기화) — id는 판정 보조일 뿐.

export interface BlockEntryLike {
  name: string;
  handle?: string;
  id?: string;
}

export interface BlockQuery {
  name?: string;
  handle?: string;
  id?: string;
}

// uuid 모양일 때만 id로 비교한다 — 화면이 합성한 id('dm-<handle>' 등)나 핸들을 id 자리에 넣은 값이
// 우연히 같아 엉뚱한 사람이 차단돼 보이는 일을 막는다(blockUser의 isUuid와 같은 정규식).
const UUID_RE = /^[0-9a-f-]{36}$/i;

/** 차단 항목 id가 실제 profile uuid인지 — 아니면(없음·'dm-핸들') recordStore 백필이 uuid로 채운다 */
export function isProfileUuid(v: string | undefined | null): v is string {
  return !!v && UUID_RE.test(v);
}

export function matchesBlockEntry(b: BlockEntryLike, user: BlockQuery): boolean {
  if (isProfileUuid(b.id) && b.id === user.id) return true;
  return b.handle
    ? (!!user.handle && b.handle === user.handle)
    : (!!user.name && b.name === user.name);
}

export function isBlockedIn(blocked: readonly BlockEntryLike[], user: BlockQuery): boolean {
  return blocked.some((b) => matchesBlockEntry(b, user));
}
