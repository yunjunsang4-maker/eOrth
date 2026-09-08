/**
 * 여행 카드(TripGroup)의 기기 간 동기화 — 순수 판정·병합 로직.
 *
 * 왜 필요한가: `user_trip_state`는 사용자당 1행 jsonb라 두 기기가 서로의 카드를 통째로
 * 덮어썼고(last-write-wins), 복원은 "로컬 카드가 비어 있을 때만" 돌았다. 그래서 동기화로
 * 들어온 글이 **소스 기기의 진짜 카드**(제목·커버·체류 정보)가 아니라 이 기기의 날짜 규칙으로
 * 새로 만들어진 카드에 붙었다. 카드를 행 단위 표(`user_trip_cards`)로 올리고, 이 파일이
 * posts와 같은 3분류(missing / tombstoned / stale)와 필드 병합을 담당한다.
 *
 * 이 파일은 **네트워크도 React도 모른다.** 그래서 `*.verify.ts`가 가벼운 픽스처로 돌 수 있다
 * (services/tripState.ts를 import하면 supabase가 딸려 와 검증 스크립트가 죽는다).
 * 그래서 서버 shape를 여기서 한 번 더 선언한다 — 두 벌이 어긋나지 않게 필드 이름은
 * `services/tripState.ts`의 `TripCardPayload`·`ServerTripCardRef`와 문자 그대로 같다.
 */

/** 체류(장기체류) 메타 — recordStore의 `TripGroupStayMeta`가 구조적으로 들어맞는다 */
export interface TripCardStay {
  type: string;
  status: string;
  startedAt: string;
  endedAt?: string;
  lastActiveAt: number;
}

/**
 * 병합에 필요한 최소 shape. `TripGroup`을 직접 받지 않고 제네릭으로 두는 이유는
 * ① 검증 파일이 React 스토어를 끌어오지 않고 가벼운 픽스처로 돌 수 있고
 * ② 이 저장소의 기존 순수 유틸(`mergeMyRecords.ts`·`postCountSync.ts`)이 같은 방식이기 때문이다.
 */
export interface MergeableTripCard {
  /** 카드 id. **서버의 card_id와 같은 값**이다(클라이언트가 만든 id를 그대로 쓴다) */
  id: string;
  title: string;
  /** 멤버 기록의 **로컬** id 배열 */
  records: string[];
  coverRecordId: string;
  createdAt: Date;
  countryName?: string;
  countryFlag?: string;
  coverUri?: string;
  date?: string;
  regionName?: string;
  stay?: TripCardStay;
  /**
   * 이 로컬 사본이 마지막으로 맞춰둔 서버 `user_trip_cards.updated_at`(ms).
   * 서버 값이 이보다 크면 **다른 기기가 고친 것**이다.
   * 없으면 "기준선 없음"이고 **stale로 치지 않는다** — 치면 이 기능을 켜는 첫 동기화에서
   * 전 카드를 통째로 다시 받는다(posts의 classifyServerPosts와 같은 규칙).
   */
  serverUpdatedAt?: number;
}

/** 프로브(`probeTripCards`) 응답 1행 — 본문 없이 판정만 한다 */
export interface ServerTripCardRef {
  cardId: string;
  updatedAt?: number | null;
  deletedAt?: number | null;
}

/** 서버에 저장된 카드 본문. 기록 참조가 **remoteId(posts.id) 우선**이라는 점이 로컬과 다르다 */
export interface ServerTripCardData {
  id?: string;
  title?: string;
  records?: string[];
  coverRecordId?: string;
  createdAt?: string;
  countryName?: string;
  countryFlag?: string;
  coverUri?: string;
  date?: string;
  regionName?: string;
  stay?: TripCardStay;
}

/** 본문까지 받은 카드 1장 (`fetchTripCards` 결과) */
export interface ServerTripCard {
  cardId: string;
  updatedAt?: number;
  data: ServerTripCardData;
}

/** 프로브 한 번의 분류 결과 — 세 갈래 (전부 **card_id**다) */
export interface ServerTripCardClassification {
  /** 서버에 있고 로컬에 없다 → 본문을 받아 새 카드로 넣는다 */
  missing: string[];
  /** 삭제표식이 있고 로컬에 그 카드가 있다 → 로컬에서 카드만 없앤다(기록은 남긴다) */
  tombstoned: string[];
  /** 로컬에 있는데 서버가 더 최신이다 → 본문을 받아 병합한다 */
  stale: string[];
}

/**
 * 서버가 준 본문이 카드로 쓸 만한가 — tombstone 행의 `data = {}`나 깨진 값 방어.
 *
 * 이걸 안 보면 표식만 남은 행을 받았을 때 제목 없는 빈 카드가 생기거나,
 * 병합이 로컬 제목을 `undefined`로 덮어쓴다.
 */
export function isUsableTripCardData(d: ServerTripCardData | null | undefined): boolean {
  return !!d && typeof d.title === 'string' && Array.isArray(d.records);
}

/**
 * 프로브 결과 한 번을 순회해 **missing / tombstoned / stale** 세 갈래로 나눈다.
 *
 * ⚠️ **"서버 목록에 없다"는 절대 삭제 근거가 아니다**(이 저장소의 확립된 불변식).
 *    프로브는 실패 시 null이고 부분 응답도 가능하다. 로컬 카드를 없애는 근거는 오직
 *    서버가 준 명시적 `deletedAt` 표식뿐이다. 그래서 이 함수는 **서버 행만 순회한다** —
 *    로컬을 훑으며 '서버에 없는 것'을 찾는 코드 자체가 없어야 사고가 구조적으로 불가능하다.
 *
 * ⚠️ `serverUpdatedAt`이 없는 로컬 카드는 stale로 치지 않는다. 첫 동기화에서 전 카드를
 *    다시 받는 것을 막는다. 기준선은 push가 심는다(upsert가 돌려준 서버 시각) — 그래서
 *    posts처럼 별도 baseline 목록을 둘 필요가 없다.
 *
 * 매칭 키는 카드 id 하나뿐이다. posts의 `client_id` 대조 같은 2중 매칭이 없는 이유:
 * 카드 id는 애초에 클라이언트가 만들어 그대로 서버 PK가 되므로 '발행 orphan'(서버엔 있는데
 * 로컬이 그 id를 모르는 상태)이 생길 수 없다.
 */
export function classifyServerCards<T extends MergeableTripCard>(
  local: T[],
  server: ServerTripCardRef[],
): ServerTripCardClassification {
  const empty: ServerTripCardClassification = { missing: [], tombstoned: [], stale: [] };
  if (server.length === 0) return empty;

  const byId = new Map<string, T>();
  for (const g of local) if (g?.id) byId.set(g.id, g);

  const missing: string[] = [];
  const tombstoned: string[] = [];
  const stale: string[] = [];
  const seen = new Set<string>(); // 같은 card_id가 두 번 오는 경우(중복 행) 방어

  for (const s of server) {
    if (!s?.cardId || seen.has(s.cardId)) continue;
    seen.add(s.cardId);
    const hit = byId.get(s.cardId);

    // ── 갈래 1) 삭제표식 ──
    if (typeof s.deletedAt === 'number' && s.deletedAt > 0) {
      // 로컬에 없으면 아무것도 하지 않는다. **missing으로도 넣지 않는다** —
      // 지운 카드를 받아오면 다른 기기에서 지운 카드가 되살아난다.
      if (hit) tombstoned.push(s.cardId);
      continue;
    }

    // ── 갈래 2) 로컬에 없다 → 새로 받는다 ──
    if (!hit) {
      missing.push(s.cardId);
      continue;
    }

    // ── 갈래 3) 로컬에 있다 → 서버가 더 최신인가 ──
    const su = typeof s.updatedAt === 'number' && s.updatedAt > 0 ? s.updatedAt : null;
    if (su == null) continue; // 비교 기준이 없으면 아무것도 하지 않는다
    const base = typeof hit.serverUpdatedAt === 'number' ? hit.serverUpdatedAt : null;
    if (base == null) continue; // 기준선 없음 → stale 아님(위 ⚠️ 참조)
    if (su > base) stale.push(s.cardId);
  }

  return { missing, tombstoned, stale };
}

/** 로컬 파일인가 — `file://`·`content://`·상대경로 등 http(s)가 아닌 모든 값 */
const isLocalUri = (u: unknown): u is string =>
  typeof u === 'string' && u.length > 0 && !/^https?:\/\//i.test(u);

/**
 * 서버가 더 최신인 카드(stale)를 로컬 카드에 병합한다.
 *
 * **필드별 규칙 (왜 이렇게 갈렸는가)**
 *
 * · `records` — **합집합.** 서버 배열은 remoteId 기준이라 `mapRemoteToLocal`로 변환한 뒤
 *   로컬 멤버와 합친다. 서버가 이겨 로컬 멤버를 버리면, 이 기기에서만 쓴(아직 발행 전) 기록이
 *   카드에서 조용히 빠진다. 반대로 **매핑되지 않는 서버 id도 버리지 않고 그대로 넣는다** —
 *   그 글이 아직 이 기기로 동기화되기 전일 수 있고, 다음 records 동기화가 채운다.
 *   순서는 로컬 먼저 + 서버 추가분 뒤. 중복은 제거한다.
 *
 * · ⚠️ **죽은 id 청소(합집합의 단 하나의 예외).** 로컬 멤버 중
 *   **①이 기기에 실존하지 않고 ②서버 목록에서도 이미 사라진** id는 버린다.
 *   왜 필요한가: 상대 기기의 **미발행** 기록은 그쪽 로컬 id로 카드에 실려 온다. 그 글이
 *   발행되면 소스 기기는 다음 직렬화에서 remoteId로 갈아끼워 **스스로 청소**하는데,
 *   순수 합집합이면 이쪽이 죽은 id를 계속 안고 push해 **소스 기기까지 재감염**시킨다
 *   (양쪽에 영구히 남고, `records.length`가 부풀어 빈 카드 폐기가 영영 발동하지 않는다).
 *   "서버 목록에서 사라졌다"는 소스 기기가 청소했다는 **명시적 신호**이므로 그때만 버린다.
 *   ②만으로 버리면 이 기기의 로컬 전용 미발행 기록이 날아가고, ①만으로 버리면 아직
 *   동기화 전인 상대 글이 날아간다 — **두 조건이 모두 참일 때만** 버려야 한다.
 *
 * · 스칼라(`title`·`countryName`·`countryFlag`·`date`·`regionName`·`stay`) — **서버본 채택.**
 *   stale로 판정된 시점에서 서버가 더 최신이라는 뜻이므로, 제목을 바꾸거나 체류를 종료한
 *   그쪽 결과가 이겨야 한다. 서버 값이 없으면(`undefined`) 그것도 채택한다 —
 *   "그쪽에서 지웠다"가 전파되어야 하기 때문이다.
 *
 * · `coverRecordId` — 매핑 후 **합집합 멤버 안에 있을 때만** 채택. 없으면 로컬 값을 지킨다.
 *   없는 기록을 대표로 두면 카드 표지가 통째로 빈다.
 *
 * · `coverUri` — **로컬 파일이면 로컬 유지**, 아니면 서버본. 로컬 파일을 가진 기기는 그 카드를
 *   만든 기기다. 서버본(다른 기기의 파일 경로)으로 갈아끼우면 그리던 표지가 깨진다.
 *   ⚠️ 파일이 실제로 존재하는지는 순수 함수가 알 수 없다. 없으면 카드가 이모지 그라데이션
 *      폴백으로 그려지는데, 그건 이 기능 이전부터의 동작이다.
 *
 * · `createdAt` — **로컬 유지.** 프로필 카드 정렬 기준이라 동기화 때마다 흔들리면 안 된다.
 *
 * · `serverUpdatedAt` — 서버 값으로 갱신(없으면 로컬 값 유지 — 퇴행 방지).
 *
 * 입력을 변형하지 않고 새 객체를 만든다. 실패 개념은 없다(순수 함수).
 * 서버 본문이 쓸 만하지 않으면(`isUsableTripCardData`) **로컬을 그대로 돌려준다.**
 *
 * @param mapRemoteToLocal remoteId(posts.id) → 이 기기의 로컬 기록 id. 못 찾으면 입력을 그대로
 *                         돌려주는 함수를 넘길 것(호출부 계약).
 * @param isKnownRecord    그 id의 기록이 **이 기기에 실존하는가**. 죽은 id 청소의 조건 ①이다.
 *                         ⚠️ 선택 인자가 아니다 — 빼먹으면 청소가 조용히 꺼져 M1이 재발한다.
 *                         호출부는 반드시 "지금 커밋된 records 목록"으로 판정할 것(목록이 비어
 *                         있는 시점에 부르면 멀쩡한 멤버를 청소로 오인해 버린다).
 */
export function mergeServerCard<T extends MergeableTripCard>(
  local: T,
  server: ServerTripCard,
  mapRemoteToLocal: (remoteId: string) => string,
  isKnownRecord: (localRecordId: string) => boolean,
): T {
  const d = server?.data;
  if (!isUsableTripCardData(d)) return local;

  // 서버가 지금 들고 있는 멤버(로컬 id로 환산) — 죽은 id 청소의 조건 ② 판정용
  const serverMembers = new Set<string>();
  for (const remote of d.records ?? []) {
    if (!remote) continue;
    const localId = mapRemoteToLocal(remote);
    if (localId) serverMembers.add(localId);
  }

  // ── records 합집합 (죽은 id만 예외적으로 버린다) ──
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const rid of local.records ?? []) {
    if (!rid || seen.has(rid)) continue;
    // ①이 기기에 없고 ②서버도 더 이상 안 들고 있다 → 소스 기기가 청소한 죽은 id다
    if (!serverMembers.has(rid) && !isKnownRecord(rid)) continue;
    seen.add(rid);
    merged.push(rid);
  }
  for (const remote of d.records ?? []) {
    if (!remote) continue;
    const localId = mapRemoteToLocal(remote);
    if (!localId || seen.has(localId)) continue;
    seen.add(localId);
    merged.push(localId);
  }

  // ── 대표 기록 ──
  const srvCover = d.coverRecordId ? mapRemoteToLocal(d.coverRecordId) : '';
  const coverRecordId = srvCover && seen.has(srvCover) ? srvCover : local.coverRecordId;

  const next = {
    ...local,
    title: typeof d.title === 'string' ? d.title : local.title,
    records: merged,
    coverRecordId,
    countryName: d.countryName,
    countryFlag: d.countryFlag,
    date: d.date,
    regionName: d.regionName,
    stay: d.stay,
    coverUri: isLocalUri(local.coverUri) ? local.coverUri : d.coverUri,
    createdAt: local.createdAt,
    serverUpdatedAt:
      typeof server.updatedAt === 'number' ? server.updatedAt : local.serverUpdatedAt,
  };
  return next as T;
}

/**
 * 서버 카드 본문을 이 기기의 새 카드로 만든다 (missing 갈래).
 *
 * 병합이 아니라 신규 생성이므로 규칙이 단순하다 — 전부 서버본을 쓰고, 기록 참조만
 * `mapRemoteToLocal`로 변환한다. 변환되지 않는 id는 `mergeServerCard`와 같은 이유로 유지한다.
 *
 * @returns 쓸 수 없는 본문이면 `null`(호출부가 건너뛴다)
 */
export function toLocalTripCard(
  server: ServerTripCard,
  mapRemoteToLocal: (remoteId: string) => string,
): MergeableTripCard | null {
  const d = server?.data;
  if (!isUsableTripCardData(d) || !server.cardId) return null;

  const records: string[] = [];
  const seen = new Set<string>();
  for (const remote of d.records ?? []) {
    if (!remote) continue;
    const localId = mapRemoteToLocal(remote);
    if (!localId || seen.has(localId)) continue;
    seen.add(localId);
    records.push(localId);
  }
  const made = new Date(d.createdAt ?? '');
  const srvCover = d.coverRecordId ? mapRemoteToLocal(d.coverRecordId) : '';

  return {
    // ⚠️ 카드 id는 **서버의 card_id**를 그대로 쓴다. 새 id를 만들면 두 기기가 같은 카드를
    //    다른 행으로 보게 되어 동기화가 처음부터 성립하지 않는다.
    id: server.cardId,
    title: d.title as string,
    records,
    // 대표가 멤버에 없으면 남은 첫 기록으로 승계(카드 표지가 비지 않게). 멤버가 없으면 ''.
    coverRecordId: srvCover && seen.has(srvCover) ? srvCover : (records[0] ?? ''),
    // createdAt이 깨져 있으면 지금 시각으로 — 정렬만 흔들릴 뿐 카드가 사라지지는 않게
    createdAt: Number.isFinite(made.getTime()) ? made : new Date(),
    countryName: d.countryName,
    countryFlag: d.countryFlag,
    coverUri: d.coverUri,
    date: d.date,
    regionName: d.regionName,
    stay: d.stay,
    serverUpdatedAt: typeof server.updatedAt === 'number' ? server.updatedAt : undefined,
  };
}
