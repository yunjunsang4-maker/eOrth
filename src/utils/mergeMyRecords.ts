/**
 * 서버에서 받아온 '내 글'을 로컬 기록 목록에 **병합**한다 (교체가 아니다).
 *
 * 왜 필요한가 — 같은 계정으로 아이폰과 안드로이드를 함께 쓰면 서로의 기록이 보이지 않았다.
 * 내 글의 서버→로컬 pull(`hydrateMyRecords`)이 계정 전환·이 설치 최초 로그인 때만 돌았고,
 * 그 pull조차 `setRecords(mine)`으로 로컬을 통째 교체하는 방식이라 상시 호출이 불가능했다
 * (로컬 초안이 날아간다). 피드로도 안 메워진다 — `fetchFeed`는 `.neq('author_id', uid)`로
 * 내 글을 아예 제외한다. 그 막힌 길을 여는 것이 이 함수다.
 *
 * 화면(React)에서 쓰기 때문에 **추가된 것이 없으면 원본 배열 참조를 그대로 돌려준다** —
 * 매번 새 배열을 만들면 setRecords가 항상 리렌더를 일으킨다(postCountSync와 같은 규약).
 *
 * ⚠️ 이 함수는 삭제를 전파하지 않는다. 서버 목록에 없는 로컬 기록도 반드시 남긴다(아래 규칙 4).
 *    삭제·수정 전파는 이 파일 아래쪽의 `classifyServerPosts`(삭제표식·수정 판정)와
 *    `mergeServerUpdate`(수정된 서버본을 미디어 보존하며 덮기)가 담당한다.
 */

/**
 * 병합에 필요한 최소 shape. `TravelRecord`를 직접 받지 않고 제네릭으로 두는 이유는
 * ① 검증 파일(*.verify.ts)이 React 스토어를 끌어오지 않고 가벼운 픽스처로 돌 수 있고
 * ② 이 저장소의 기존 순수 유틸(`postCountSync.ts`)이 같은 방식이기 때문이다.
 */
export interface MergeableRecord {
  /** 로컬 id. 로컬에서 쓴 글은 로컬 id, 서버에서 받은 글은 서버 uuid와 같다 */
  id: string;
  /** 서버 posts.id. 미발행 로컬 글(초안·오프라인 작성)에는 없다 */
  remoteId?: string;
  /**
   * 이 로컬 사본이 마지막으로 맞춰둔 서버 `posts.updated_at`(ms).
   * 서버 값이 이보다 크면 **서버가 더 최신**이다(= 다른 기기에서 수정됨 → 본문을 다시 받는다).
   * 없으면 "아직 기준선이 없다"는 뜻이고, 그때는 stale로 치지 않는다(첫 동기화에서 전 기록의
   * 본문을 통째로 다시 받는 사고를 막는다 — classifyServerPosts의 baseline 참조).
   */
  serverUpdatedAt?: number;
}

/**
 * @param local    현재 로컬 기록 목록 (원본 = 진실의 원천)
 * @param incoming 서버에서 받은 내 글 목록 (`fetchMyPosts` / `fetchPostsByIds` 결과)
 * @returns        병합 결과. **길이는 항상 `local.length` 이상**이다.
 */
export function mergeMyRecords<T extends MergeableRecord>(local: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return local;

  // 키는 반드시 `remoteId`다. `id`가 아니다 —
  // 로컬에서 쓴 글은 (로컬 id + remoteId=서버 uuid) 조합이지만, 같은 글을 서버에서 받으면
  // `mapRowToRecord`가 id === remoteId === row.id 로 만든다(services/posts.ts).
  // id로 맞추면 같은 글이 로컬본·서버본 두 벌로 늘어난다.
  const known = new Set<string>();
  for (const r of local) {
    if (r.remoteId) known.add(r.remoteId);
  }

  const added: T[] = [];
  for (const r of incoming) {
    const rid = r.remoteId;
    // 규칙 0. remoteId 없는 서버본은 버린다 — 대조할 키가 없어 동기화할 때마다 같은 글이
    //         한 벌씩 늘어난다. (mapRowToRecord는 항상 remoteId를 채우므로 방어용이다)
    if (!rid) continue;
    // 규칙 1. 로컬에 이미 있는 remoteId → 로컬을 그대로 둔다. 서버본으로 덮지 않는다.
    //         덮으면 persistRecordPhotos가 만든 로컬 영속 사진 URI가 원격 URL로 밀려
    //         오프라인에서 사진이 깨진다. 좋아요·댓글 수는 refreshMyPostCounts가 따로 맞춘다.
    // 규칙 2. incoming 자체의 중복도 같은 집합으로 걸러진다(서버 페이지 경계 중복 등).
    if (known.has(rid)) continue;
    known.add(rid);
    // 규칙 3. 서버에만 있는 글 → 추가. 이것이 다른 기기에서 쓴 내 글이 넘어오는 경로다.
    added.push(r);
  }

  // 규칙 4. 여기서 local을 걸러내지 않는다 —
  //   · remoteId 없는 로컬 기록(미발행/초안)은 무조건 보존한다. 교체 방식이 망가뜨리던 지점.
  //   · 로컬에만 있고 서버 목록에 없는 remoteId도 보존한다. `fetchMyPosts`는 중간 페이지가
  //     실패하면 부분 목록을 돌려주고 MAX_POSTS 상한도 있어, "목록에 없다"가 "서버에서
  //     삭제됐다"를 뜻하지 않는다. 삭제 전파(tombstone)는 이 함수의 범위가 아니다.
  if (added.length === 0) return local;

  // 순서: 기존 local 순서를 유지하고 새 것을 뒤에 붙인다. 이 저장소는 `records` 배열 순서를
  // 신뢰하지 않고 화면이 timestamp로 정렬한다(recordStore의 refreshMyPostCounts 주석 참조).
  return [...local, ...added];
}

/** 서버 프로브(`fetchMyPostIds`)가 돌려주는 최소 정보 — 본문(data JSONB)은 받지 않는다 */
export interface ServerPostRef {
  /** posts.id (서버 uuid) */
  id: string;
  /**
   * posts.client_id — 작성자 기기의 **원래 로컬 레코드 id**. 발행 멱등성 키다(services/posts.ts).
   * 옛 행이나 client_id 컬럼 도입 전 발행분에는 없을 수 있다.
   */
  clientId?: string | null;
  /**
   * posts.updated_at(ms). 수정 전파 판정의 기준값이다.
   * 구 서버 폴백(컬럼 없음)이면 undefined — 그 경우 **수정 전파가 꺼진다**(services/posts.ts 참조).
   */
  updatedAt?: number | null;
  /**
   * posts.deleted_at(ms). 값이 있으면 **작성자가 명시적으로 지운 글**이다.
   * null/undefined는 '살아 있음'. 구 서버 폴백이면 항상 undefined = 삭제 전파가 꺼진다.
   */
  deletedAt?: number | null;
}

/**
 * 서버에 있는데 로컬에 없는 글의 서버 id를 고른다 — 동기화가 본문을 받아야 할 대상.
 *
 * **왜 remoteId만으로는 부족한가 (실제로 열려 있던 중복 경로):**
 * 발행 insert는 서버에 들어갔는데 `.then`의 `setRecords(remoteId 부착)`가 커밋·영속되기 전에
 * 앱이 죽으면(강제 종료·크래시·OS 회수) 로컬 기록 R은 remoteId가 없는 채 남고 서버엔 행 S가 있다.
 * 재시작 후에는 발행 in-flight 카운터도 0이라 그 가드가 듣지 않는다. remoteId로만 대조하면
 * R이 집합에 없어 S가 '빠진 글'로 잡히고, 같은 글이 두 벌이 된다(로컬은 절대 안 지우므로 영구).
 *
 * 서버에 이미 매칭 키가 있다 — `posts.client_id`가 작성자의 원래 로컬 id이고
 * `(author_id, client_id)` 유니크 인덱스도 있다. 그래서 **두 조건을 모두** 만족할 때만 '빠진 글'로 본다:
 *   ① 서버 id가 로컬 remoteId 집합에 없다  그리고
 *   ② 서버 client_id가 로컬 레코드 id 집합에도 없다
 * (②는 같은 기기의 orphan만 걸러낸다. 다른 기기에서 쓴 글의 client_id는 이 기기의 어떤 로컬
 *  id와도 겹치지 않는다 — 로컬 id가 `rec-{ms}-{random4}`라 기기 간 충돌이 사실상 없다.)
 *
 * @returns 본문을 받아야 할 서버 id 목록. 입력 순서 유지, 중복 제거.
 */
export function findMissingPostIds<T extends MergeableRecord>(
  local: T[],
  server: ServerPostRef[]
): string[] {
  // classifyServerPosts의 얇은 래퍼 — 판정 규칙이 두 벌로 갈리지 않게 한 곳에서만 계산한다.
  return classifyServerPosts(local, server).missing;
}

/** 프로브 한 번의 분류 결과 — 세 갈래 + 기준선 심기 목록 */
export interface ServerPostClassification {
  /** **서버 post id**. 서버에 있고 로컬에 없다 → 본문을 받아 새로 넣는다 */
  missing: string[];
  /** **로컬 레코드 id**. 삭제표식이 있고 로컬에 그 글이 있다 → 로컬에서 지운다 */
  tombstoned: string[];
  /** **서버 post id**. 로컬에 있는데 서버가 더 최신이다 → 본문을 다시 받아 병합한다 */
  stale: string[];
  /**
   * 기준선 심기 대상 — `serverUpdatedAt`이 없던 로컬 기록에 **본문 재조회 없이** 서버의
   * updated_at만 기록해 다음 회차부터 비교가 되게 한다. `postId`는 서버 post id이며,
   * 호출부는 `remoteId === postId`인 로컬 레코드에 값을 심는다.
   */
  baseline: { postId: string; updatedAt: number }[];
}

/**
 * 프로브 결과 한 번을 순회해 **missing / tombstoned / stale** 세 갈래로 나눈다.
 *
 * 매칭 규칙은 `findMissingPostIds`가 쓰던 것과 같다 — 서버 `id` ↔ 로컬 `remoteId`,
 * 그리고 서버 `client_id` ↔ 로컬 `id`(발행 orphan). 두 번째 대조가 없으면 발행됐는데
 * remoteId가 안 붙은 로컬 기록 때문에 같은 글이 두 벌이 된다(위 주석 참조).
 *
 * ⚠️ **"서버 목록에 없다"는 절대 삭제 근거가 아니다.** 프로브는 중간 페이지 실패 시 부분
 *    목록을 돌려주고 MAX_POSTS 상한도 있다. 로컬 제거는 오직 `deletedAt` 표식이 있을 때만이다.
 *    (그래서 이 함수는 local을 순회하며 '서버에 없는 것'을 찾지 않는다 — 서버 행만 훑는다.)
 *
 * ⚠️ `serverUpdatedAt`이 없는 로컬 기록은 stale로 치지 않는다. 치면 이 기능을 켜는 첫
 *    동기화에서 **전 기록의 본문(data JSONB)을 통째로 다시 받는다.** 대신 baseline에 담아
 *    기준선만 심는다.
 */
export function classifyServerPosts<T extends MergeableRecord>(
  local: T[],
  server: ServerPostRef[]
): ServerPostClassification {
  const empty: ServerPostClassification = { missing: [], tombstoned: [], stale: [], baseline: [] };
  if (server.length === 0) return empty;

  const byRemote = new Map<string, T>();
  const byLocalId = new Map<string, T>();
  for (const r of local) {
    if (r.remoteId) byRemote.set(r.remoteId, r);
    if (r.id) byLocalId.set(r.id, r);
  }

  const missing: string[] = [];
  const tombstoned: string[] = [];
  const stale: string[] = [];
  const baseline: { postId: string; updatedAt: number }[] = [];
  const seenPost = new Set<string>();   // 프로브 페이지 경계 중복
  const seenLocal = new Set<string>();  // 같은 로컬 기록이 두 번 잡히는 것 방지

  for (const s of server) {
    if (!s?.id || seenPost.has(s.id)) continue; // 키 없는 행·중복
    seenPost.add(s.id);
    const hit =
      byRemote.get(s.id) ?? (s.clientId ? byLocalId.get(s.clientId) : undefined);

    // ── 갈래 1) 삭제표식 ──
    if (typeof s.deletedAt === 'number' && s.deletedAt > 0) {
      // 로컬에 없으면 아무것도 하지 않는다. **missing으로도 넣지 않는다** —
      // 지운 글을 새로 받아오면 다른 기기에서 삭제한 글이 되살아난다.
      if (hit && !seenLocal.has(hit.id)) {
        seenLocal.add(hit.id);
        tombstoned.push(hit.id);
      }
      continue;
    }

    // ── 갈래 2) 로컬에 없다 → 새로 받는다 ──
    if (!hit) {
      missing.push(s.id);
      continue;
    }

    // ── 갈래 3) 로컬에 있다 → 수정됐는지 본다 ──
    const su = typeof s.updatedAt === 'number' && s.updatedAt > 0 ? s.updatedAt : null;
    if (su == null) continue; // 구 서버 폴백 등 — 비교 기준이 없으면 아무것도 하지 않는다
    const base = typeof hit.serverUpdatedAt === 'number' ? hit.serverUpdatedAt : null;
    if (base == null) {
      // 기준선 없음 → 본문을 받지 않고 기준선만 심는다.
      // client_id로 매칭된 orphan(remoteId 없음)은 호출부가 심을 대상을 찾을 수 없으니 제외한다.
      if (hit.remoteId === s.id) baseline.push({ postId: s.id, updatedAt: su });
      continue;
    }
    if (su > base) stale.push(s.id);
  }

  return { missing, tombstoned, stale, baseline };
}

// ─────────────────────────────────────────────
// 수정 전파 — 서버본을 로컬 기록에 덮되 미디어는 지킨다
// ─────────────────────────────────────────────

/** mergeServerUpdate가 다루는 미디어·중첩 필드의 구조(전부 선택). TravelRecord의 부분집합이다. */
interface MediaBearing {
  medias?: string[];
  representativePhoto?: string;
  representativePhotoSource?: string;
  snapFrontUri?: string;
  snapBackUri?: string;
  cutPhoto?: { previewUri: string; photos: string[]; frameImage?: string; [k: string]: unknown };
  blogBlocks?: Record<string, any>[];
  perCountryData?: Record<string, { medias?: string[]; representativePhoto?: string; [k: string]: unknown }>;
  thumbs?: Record<string, string>;
}

/**
 * '로컬 파일'인가 — `file://`(또는 `content://`·상대경로 등 http(s)가 아닌 모든 값).
 * 이 기기가 그 글의 작성 기기라는 신호다.
 */
const isLocalUri = (u: unknown): u is string =>
  typeof u === 'string' && u.length > 0 && !/^https?:\/\//i.test(u);

/**
 * ★ 미디어 병합의 단 하나의 규칙 ★
 * **로컬 파일은 서버본을 이긴다 — 단 그 파일이 놓인 '자리'가 서버본에도 그대로 있을 때만.**
 * 자리 대응이 깨지면(배열 장수 변경·배열 자체 소멸) 그 배열과 **그 배열에 딸린 단일 uri까지**
 * 통째로 서버본을 쓴다.
 *
 * 왜 이 한 문장이어야 하는가: 예전엔 배열은 "장수 다르면 서버본", 단일 uri는 "로컬 파일이 항상
 * 승리"라 규칙이 갈렸다. 그 결과 다른 기기가 사진을 1장 추가하면 `medias`는 원격 URL로 바뀌는데
 * `representativePhoto`만 `file://`로 남아, **한 레코드 안에 존재하지 않는 사진 집합을 가리키는
 * 대표사진**이 생겼다(글에서 사진을 다 뺐는데 대표사진만 남는 상태도 같은 뿌리).
 */

/** 단일 uri: 로컬 파일이면 로컬 유지, 아니면(원격 URL이거나 없음) 서버본 채택 */
const pickUri = (lo: unknown, se: string | undefined): string | undefined =>
  isLocalUri(lo) ? lo : se;

/**
 * 배열의 '자리 대응'이 깨졌는가 — 깨졌으면 거기에 딸린 단일 uri도 서버본을 써야 한다.
 * 양쪽 다 배열이 없으면 애초에 딸린 관계가 없으므로 '안 깨졌다'(단일 uri는 독립 판정).
 */
const listReplaced = (lo: unknown, se: string[] | undefined): boolean => {
  const loArr = Array.isArray(lo);
  const seArr = Array.isArray(se);
  if (!loArr && !seArr) return false;
  return !(loArr && seArr && (lo as unknown[]).length === se!.length);
};

/**
 * uri 배열: **장수가 같을 때만** 인덱스별로 로컬 파일을 지킨다.
 * 장수가 달라졌다는 건 다른 기기에서 사진을 넣거나 뺐다는 뜻이라 인덱스 대응이 깨진다 —
 * 그때 섞으면 엉뚱한 사진이 엉뚱한 자리에 붙으므로 서버본을 통째로 채택한다.
 */
const pickUriList = (lo: unknown, se: string[] | undefined): string[] | undefined => {
  if (!se) return se;
  if (!Array.isArray(lo) || lo.length !== se.length) return se;
  return se.map((u, i) => (isLocalUri(lo[i]) ? (lo[i] as string) : u));
};

/** 배열에 딸린 단일 uri: 자리가 갈아치워졌으면 로컬 파일이라도 버리고 서버본을 쓴다 */
const pickTiedUri = (
  lo: unknown,
  se: string | undefined,
  replaced: boolean
): string | undefined => (replaced ? se : pickUri(lo, se));

/**
 * 다른 기기에서 수정된 서버본을 로컬 기록에 병합한다 — **미디어와 로컬 전용 필드는 지킨다.**
 *
 * 왜 통째로 덮으면 안 되는가:
 *   로컬 파일(`file://`)을 가진 기기는 그 글의 **작성 기기**다. 서버 URL로 갈아끼우면
 *   `persistRecordPhotos`가 영속 폴더로 옮겨둔 경로가 날아가 **오프라인에서 사진이 깨진다**
 *   (이 저장소의 과거 실사고 영역 — iOS 컨테이너 경로 유실 건과 같은 뿌리).
 *   반대로 다른 기기에서 받은 글은 애초에 원격 URL이라, 그쪽은 서버본을 그대로 채택해
 *   **사진 변경도 전파된다.**
 *
 * ⚠️ 남는 비대칭: **배열에 딸리지 않은 독립 uri**(스냅 전·후면, 네컷 프레임 배경, 블로그
 *    영상 썸네일 등)는 로컬 파일이 항상 이기므로, 다른 기기에서 그 한 장만 바꾸거나 지운 것은
 *    작성 기기에 전파되지 않는다. 오프라인 보호를 우선한 결과다.
 *    같은 비대칭이 **배열에도** 남는다: 장수가 달라지면(추가·삭제) 서버본을 채택해 전파되지만,
 *    장수가 같은 채로 내용만 통째로 바뀌면 자리별 판정에서 로컬 파일이 이겨 전파되지 않는다.
 *    즉 "작성 기기는 자기 로컬 파일을 지킨다"가 항상 우선이고, 전파는 그 자리가 비었을 때만 된다.
 *
 * ⚠️ 서버본을 채택하면서 참조를 잃은 **로컬 영속 파일은 정리하지 않는다**(디스크 고아).
 *    `deleteRecord`도 원격 URL만 정리하므로 기존 동작과 같다 — 별도 과제다.
 *
 * @param local  현재 로컬 기록
 * @param server 서버에서 다시 받은 같은 글(`fetchPostsByIds` 결과 — `serverUpdatedAt`이 실려 있다)
 * @returns      병합된 새 객체. 입력은 변형하지 않는다.
 */
export function mergeServerUpdate<T extends MergeableRecord>(local: T, server: T): T {
  const l = local as unknown as MediaBearing;
  const s = server as unknown as MediaBearing;
  const out = { ...(server as unknown as Record<string, unknown>) };

  // ── 1) 로컬 전용 필드 — 서버본이 덮으면 안 되는 것들 ──
  // id: 로컬 id를 반드시 유지한다. 서버본의 id(uuid)로 바꾸면 tripGroups.records·countryCovers·
  //     archivedIds가 전부 옛 id를 가리켜 **여행 카드 참조가 통째로 끊긴다.**
  out.id = local.id;
  // remoteId: 로컬에 이미 붙어 있으면 그것을 쓴다(같은 값이지만 서버본이 없을 여지를 막는다)
  out.remoteId = local.remoteId ?? server.remoteId;
  const keepLocal = (key: string) => {
    const v = (local as unknown as Record<string, unknown>)[key];
    if (v !== undefined) out[key] = v;
  };
  // isMyPost   — mapRowToRecord는 false를 기본으로 넣는다. 내 글이 남의 글로 뒤집히면
  //              수정·삭제·재발행 경로가 통째로 막힌다.
  // liked      — 내 좋아요는 로컬 낙관 갱신이 진실에 가깝다(서버 왕복 중일 수 있다).
  // uploadedMediaUrls / albumUploadQuality — 이 기기의 업로드 캐시·화질 기록. 서버 data에는
  //              애초에 실리지 않으며(사진첩은 발행 시 제거), 잃으면 사진첩 전 장을 재업로드한다.
  // mediaAssetIds / mediaTimes — 이 기기 사진첩의 assetId·촬영시각 참조. 다른 기기에서는 무의미.
  // tripGroupId / tripGroupOrder — 여행 카드 id는 기기 로컬 id 공간이다. 서버본 값은 남의 카드 id다.
  // snapViewed — 열람 여부는 뷰어(이 기기) 상태다.
  for (const k of [
    'isMyPost', 'liked', 'uploadedMediaUrls', 'albumUploadQuality',
    'mediaAssetIds', 'mediaTimes', 'tripGroupId', 'tripGroupOrder', 'snapViewed',
  ]) keepLocal(k);

  // ── 2) 미디어 — 위 ★ 규칙(로컬 파일 승리, 단 자리 대응이 성립할 때만) ──
  // medias의 자리가 갈아치워졌으면 거기서 고른 대표사진·대표원본도 함께 서버본으로 간다.
  // (안 그러면 존재하지 않는 사진 집합을 가리키는 대표사진이 남는다)
  const mediasReplaced = listReplaced(l.medias, s.medias);
  out.medias = pickUriList(l.medias, s.medias);
  out.representativePhoto = pickTiedUri(l.representativePhoto, s.representativePhoto, mediasReplaced);
  out.representativePhotoSource = pickTiedUri(l.representativePhotoSource, s.representativePhotoSource, mediasReplaced);
  // 스냅 전·후면은 배열에 딸리지 않은 독립 uri다 — 로컬 파일 승리 규칙 그대로.
  out.snapFrontUri = pickUri(l.snapFrontUri, s.snapFrontUri);
  out.snapBackUri = pickUri(l.snapBackUri, s.snapBackUri);

  if (s.cutPhoto) {
    // previewUri는 photos 4장을 합성한 결과물이라 photos에 딸린다. frameImage는 독립(배경 사진).
    const cutReplaced = listReplaced(l.cutPhoto?.photos, s.cutPhoto.photos);
    out.cutPhoto = {
      ...s.cutPhoto,
      previewUri:
        pickTiedUri(l.cutPhoto?.previewUri, s.cutPhoto.previewUri, cutReplaced) ?? s.cutPhoto.previewUri,
      photos: pickUriList(l.cutPhoto?.photos, s.cutPhoto.photos) ?? s.cutPhoto.photos,
      frameImage: pickUri(l.cutPhoto?.frameImage, s.cutPhoto.frameImage),
    };
  }

  if (Array.isArray(s.blogBlocks)) {
    // 블록은 **id로 대응**시킨다(인덱스가 아니다) — 다른 기기에서 문단을 넣거나 빼도
    // 사진 블록의 로컬 파일을 계속 알아본다. 타입까지 같아야 대응으로 인정한다.
    const localById = new Map<string, Record<string, any>>();
    for (const b of l.blogBlocks ?? []) if (b && typeof b.id === 'string') localById.set(b.id, b);
    out.blogBlocks = s.blogBlocks.map((sb) => {
      const lb = sb && typeof sb.id === 'string' ? localById.get(sb.id) : undefined;
      if (!lb || lb.type !== sb.type) return sb;
      if (sb.type === 'image' || sb.type === 'file') {
        return { ...sb, uri: pickUri(lb.uri, sb.uri) ?? sb.uri };
      }
      if (sb.type === 'images') {
        const sItems: { uri: string }[] = Array.isArray(sb.items) ? sb.items : [];
        const merged = pickUriList(
          (Array.isArray(lb.items) ? lb.items : []).map((it: { uri?: string }) => it?.uri),
          sItems.map((it) => it?.uri)
        );
        return { ...sb, items: sItems.map((it, i) => ({ ...it, uri: merged?.[i] ?? it?.uri })) };
      }
      if (sb.type === 'video') {
        return {
          ...sb,
          uri: pickUri(lb.uri, sb.uri) ?? sb.uri,
          thumbnail: pickUri(lb.thumbnail, sb.thumbnail),
        };
      }
      if (sb.type === 'link') return { ...sb, thumbnail: pickUri(lb.thumbnail, sb.thumbnail) };
      return sb;
    });
  }

  if (s.perCountryData) {
    const pcd: Record<string, Record<string, unknown>> = {};
    for (const [k, sv] of Object.entries(s.perCountryData)) {
      const lv = l.perCountryData?.[k];
      const pcReplaced = listReplaced(lv?.medias, sv.medias); // 국가별 대표사진도 그 국가 medias에 딸린다
      pcd[k] = {
        ...sv,
        medias: pickUriList(lv?.medias, sv.medias),
        representativePhoto: pickTiedUri(lv?.representativePhoto, sv.representativePhoto, pcReplaced),
      };
    }
    out.perCountryData = pcd;
  }

  // thumbs는 '원본 원격 URL → 축소본 URL' 매핑이라 양쪽 다 원격 URL이다(로컬 파일 문제 없음).
  // 합집합으로 두되 서버본이 이긴다 — 로컬에만 있는 항목을 버리면 이 기기가 만든 축소본을
  // 다시 못 찾아 목록이 원본을 내려받는다.
  if (l.thumbs || s.thumbs) out.thumbs = { ...(l.thumbs ?? {}), ...(s.thumbs ?? {}) };

  // ── 3) 기준선 갱신 — 이 사본이 어느 서버 버전에 맞춰졌는지 ──
  const su = server.serverUpdatedAt;
  out.serverUpdatedAt = typeof su === 'number' && Number.isFinite(su) ? su : local.serverUpdatedAt;

  return out as unknown as T;
}
