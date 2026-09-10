/**
 * 기록 부가상태 **집합** 6종의 기기 간 동기화 — 순수 판정 로직.
 *
 * 왜 필요한가: 보관·차단·음소거·본 스냅·신고 숨김이 전부 `user_app_state` 1행 jsonb에 실려
 * 4초 디바운스로 통째 upsert됐다. 두 기기가 같이 쓰면 나중에 쓴 쪽이 상대의 상태를 통째로
 * 덮어써(last-write-wins), 한 기기에서 푼 보관이 되살아나고 차단이 한쪽에만 남았다.
 * 이 6종을 행 단위 표(`user_state_flags`)로 올리고, 이 파일이 posts·카드와 같은
 * 분류(missing / tombstoned)와 push diff를 담당한다.
 *
 * 이 파일은 **네트워크도 React도 모른다.** 그래야 `*.verify.ts`가 가벼운 픽스처로 돌 수 있다
 * (services/appState.ts를 import하면 supabase가 딸려 와 검증 스크립트가 죽는다).
 * 그래서 서버 shape를 여기서 한 번 더 선언하되, 필드 이름은 `services/appState.ts`의
 * `ServerStateFlagRef`·`StateFlagKey`와 **문자 그대로 같게** 맞춘다.
 *
 * ─────────────────────────────────────────────────────────────
 * kind별 의미론 — **이 표가 이번 설계의 전부다.** 서버 주석(schema.sql 4-c-3b)과 일치한다.
 *
 * | kind            | item_key                              | 제거 전파 | 왜                                   |
 * |-----------------|---------------------------------------|-----------|--------------------------------------|
 * | archived        | remoteId 우선, 미발행은 로컬 id       | ✅ 보관 해제 | 카드와 같은 매핑 문제 — push 때 remoteId로 변환, pull 때 역매핑(실패하면 그대로 유지) |
 * | muted           | handle                                | ✅ 음소거 해제 | `toggleMute`가 handle만 다룬다        |
 * | blocked         | handle(없으면 `name:{표시이름}`)      | ✅ 차단 해제 | 신원 키는 handle 우선 — `BlockedUser` 주석과 `isBlocked`의 판정 규칙이 그렇다 |
 * | viewedSnap      | remoteId                              | ❌ add-only | 로컬 500개 상한 **트림은 사용자 의도가 아니라 축출**이다 |
 * | reportedPost    | 신고한 글 id(피드 글이면 곧 remoteId) | ❌ add-only | 신고 취소 경로가 앱에 없다            |
 * | reportedComment | 댓글 id                               | ❌ add-only | 〃                                     |
 *
 * ⚠️ **add-only 규칙이 이 파일의 핵심 불변식이다.** 두 방향 모두에서 지킨다:
 *    ① push — 로컬에서 사라진 add-only 항목에는 **tombstone을 만들지 않는다**(트림·정리다).
 *    ② pull — 서버에 add-only 항목의 삭제 표식이 있어도 **방어적으로 무시한다**
 *       (옛 번들·수동 조작으로 이상 행이 생겨도 로컬을 지우지 않는다).
 *
 * ⚠️ **삭제가 재추가를 이긴다(알려진 한계).** 서버 upsert가 `deleted_at`을 건드리지 않으므로
 *    한 번 꺼진 (kind,item_key)는 다시 켜도 서버에서 켜지지 않고, 다음 pull이 로컬도 끈다.
 *    그 대신 "앱을 켤 때마다 나가는 전량 시드 upsert가 다른 기기의 끄기를 통째로 되살리는"
 *    훨씬 비싼 사고가 구조적으로 불가능하다. 자세한 이유는 services/appState.ts의
 *    `upsertStateFlags` 주석.
 * ─────────────────────────────────────────────────────────────
 */

export type StateFlagKind =
  | 'archived'
  | 'muted'
  | 'blocked'
  | 'viewedSnap'
  | 'reportedPost'
  | 'reportedComment';

/** 이 표의 kind 전체 — 순회 순서가 결정적이어야 검증이 안정적이다 */
export const STATE_FLAG_KINDS: StateFlagKind[] = [
  'archived', 'muted', 'blocked', 'viewedSnap', 'reportedPost', 'reportedComment',
];

/**
 * **제거를 전파하는** kind. 여기 없는 kind는 add-only다.
 * 새 kind를 추가할 때 이 집합에 넣을지부터 정할 것 — 기본값은 add-only(안전한 쪽)다.
 */
const REMOVABLE_KINDS = new Set<StateFlagKind>(['archived', 'muted', 'blocked']);

export const isRemovableFlagKind = (kind: StateFlagKind): boolean => REMOVABLE_KINDS.has(kind);

/** (kind, item_key) 한 쌍 */
export interface StateFlagKey {
  kind: StateFlagKind;
  itemKey: string;
}

/** 프로브 1행 (`probeStateFlags` 결과) */
export interface ServerStateFlagRef extends StateFlagKey {
  updatedAt?: number | null;
  deletedAt?: number | null;
}

/**
 * 로컬 집합 6종을 **서버 키 공간**으로 옮겨 담은 것.
 *
 * ⚠️ `archived`는 호출부가 로컬 기록 id → remoteId로 **변환해서** 넣는다. 변환은 스토어만
 *    할 수 있어서(기록 목록이 필요하다) 여기서 하지 않는다. 변환할 수 없는 항목(미발행)은
 *    로컬 id 그대로 들어온다 — 그것도 정상이다.
 * `sig`는 **본문 지문**이다. 지금은 blocked만 쓰고 나머지는 `undefined`(존재 여부만 본다).
 */
export interface LocalFlagItem {
  key: string;
  sig?: string;
}

export type LocalFlagState = Record<StateFlagKind, LocalFlagItem[]>;

/** 빈 상태 — 호출부·검증이 부분 집합만 넘길 때의 기본값 */
export function emptyFlagState(): LocalFlagState {
  return {
    archived: [], muted: [], blocked: [], viewedSnap: [], reportedPost: [], reportedComment: [],
  };
}

/**
 * 지문 맵의 키. `kind`와 `itemKey`를 한 문자열로 합친다.
 *
 * ⚠️ 구분자 `|`가 **항목 키 안에 들어갈 수도 있다**(표시이름은 사용자 입력이다). 그래도
 *    안전한 이유는 `kind` 쪽에 `|`가 절대 없고 `parseFlagMapKey`가 **첫 `|`에서만** 자르기
 *    때문이다 — 뒤쪽은 통째로 itemKey다.
 */
export const flagMapKey = (kind: StateFlagKind, itemKey: string): string => `${kind}|${itemKey}`;

/** `flagMapKey`의 역 — 잘못된 문자열이면 null(방어) */
export function parseFlagMapKey(mapKey: string): StateFlagKey | null {
  const i = mapKey.indexOf('|');
  if (i <= 0) return null;
  const kind = mapKey.slice(0, i) as StateFlagKind;
  const itemKey = mapKey.slice(i + 1);
  if (!itemKey || !STATE_FLAG_KINDS.includes(kind)) return null;
  return { kind, itemKey };
}

/** 서버 행 하나를 로컬 집합에 넣을 때 쓸 키(매핑 후) */
export interface ClassifiedFlag extends StateFlagKey {
  /**
   * 로컬 집합에서 쓰는 키. `archived`만 remoteId → 로컬 기록 id로 역매핑되고,
   * **매핑에 실패하면 서버 키를 그대로 유지한다**(동기화로 오는 기록은 id === remoteId라
   * 그 값이 곧 로컬 id다 — 자기 치유).
   */
  localKey: string;
}

export interface StateFlagClassification {
  /** 서버에만 있는 **살아 있는** 항목 → 로컬 집합에 넣는다 */
  missingLocally: ClassifiedFlag[];
  /** 서버 표식 + 로컬 존재 + **제거 전파 kind** → 로컬에서 뺀다 */
  tombstonedLocally: ClassifiedFlag[];
}

/**
 * 프로브 결과 한 번을 순회해 **missingLocally / tombstonedLocally** 두 갈래로 나눈다.
 *
 * ⚠️ **"서버 목록에 없다"는 절대 제거 근거가 아니다**(이 저장소의 확립된 불변식).
 *    프로브는 실패 시 null이고 부분 응답도 가능하다. 로컬에서 항목을 빼는 근거는 오직
 *    서버가 준 명시적 `deletedAt` 표식뿐이다. 그래서 이 함수는 **서버 행만 순회한다** —
 *    로컬을 훑으며 '서버에 없는 것'을 찾는 코드 자체가 없어야 사고가 구조적으로 불가능하다.
 *
 * ⚠️ 기준선(updated_at) 비교가 없다. 이 표에는 '내용 수정'이 사실상 없고(blocked 메타뿐),
 *    기준선을 로컬에 심으면 그게 곧 워터마크가 되기 때문이다. 그래서 살아 있는 서버 항목은
 *    **로컬에 없을 때만** 대상이다(이미 있으면 아무것도 안 한다).
 *
 * @param local      로컬 집합(서버 키 공간). `archived`는 remoteId 변환본이어야 한다.
 * @param server     프로브 결과
 * @param mapServerKey 서버 키 → 로컬 키 역매핑. 지금은 `archived`의 remoteId → 로컬 기록 id.
 *                     넘기지 않으면 항등(서버 키를 그대로 로컬 키로 쓴다).
 */
export function classifyServerFlags(
  local: LocalFlagState,
  server: ServerStateFlagRef[],
  mapServerKey?: (kind: StateFlagKind, itemKey: string) => string,
): StateFlagClassification {
  const missingLocally: ClassifiedFlag[] = [];
  const tombstonedLocally: ClassifiedFlag[] = [];
  if (!server || server.length === 0) return { missingLocally, tombstonedLocally };

  // 로컬 집합을 kind별 Set으로. **서버 키와 로컬 키 둘 다** 넣는다 —
  // archived처럼 역매핑이 걸리는 kind에서 "이미 로컬에 있다"를 어느 쪽 표기로도 판정할 수
  // 있어야 하기 때문이다(매핑이 되는 기록/안 되는 기록이 한 집합에 섞여 있다).
  const localByKind = new Map<StateFlagKind, Set<string>>();
  for (const kind of STATE_FLAG_KINDS) {
    const set = new Set<string>();
    for (const it of local?.[kind] ?? []) if (it?.key) set.add(it.key);
    localByKind.set(kind, set);
  }

  const seen = new Set<string>(); // 같은 (kind,item_key)가 두 번 오는 경우(중복 행) 방어

  for (const s of server) {
    if (!s?.itemKey || !s.kind) continue;
    if (!STATE_FLAG_KINDS.includes(s.kind)) continue; // 모르는 kind는 무시(상위 호환)
    const mk = flagMapKey(s.kind, s.itemKey);
    if (seen.has(mk)) continue;
    seen.add(mk);

    const localKey = mapServerKey ? mapServerKey(s.kind, s.itemKey) : s.itemKey;
    const localSet = localByKind.get(s.kind)!;
    const hasLocal = localSet.has(localKey) || localSet.has(s.itemKey);

    // ── 갈래 1) 삭제 표식 ──
    if (typeof s.deletedAt === 'number' && s.deletedAt > 0) {
      // ⚠️ add-only kind의 표식은 **방어적으로 무시한다.** 그 kind에서 '사라짐'의 원인은
      //    사용자의 끄기가 아니라 트림·정리이고, 그런 표식은 애초에 우리가 만들지 않는다.
      //    서버에 이상 행이 있어도 로컬을 지우지 않는다.
      if (!isRemovableFlagKind(s.kind)) continue;
      // 로컬에 없으면 아무것도 하지 않는다. **missingLocally로도 넣지 않는다** —
      // 꺼진 항목을 받아오면 다른 기기에서 끈 것이 되살아난다.
      if (hasLocal) tombstonedLocally.push({ kind: s.kind, itemKey: s.itemKey, localKey });
      continue;
    }

    // ── 갈래 2) 살아 있는데 로컬에 없다 → 넣는다 ──
    if (!hasLocal) missingLocally.push({ kind: s.kind, itemKey: s.itemKey, localKey });
  }

  return { missingLocally, tombstonedLocally };
}

export interface FlagPushRow extends StateFlagKey {
  /** 지문(blocked만). 호출부가 이 값으로 실제 payload(data)를 만든다 */
  sig?: string;
  /**
   * 이 행에만 `deleted_at: null`을 실어 **꺼진 행을 되살려야 하는가**.
   * `diffForPush`의 `explicitAdds`에 있는 키에만 true다 — 아래 함수 주석의 ⚠️ 참조.
   */
  revive: boolean;
}

export interface StateFlagPushDiff {
  /** 새로 켜졌거나 본문(지문)이 바뀐 항목 */
  upserts: FlagPushRow[];
  /** **제거 전파 kind**에서만 나오는 끄기 표식 */
  tombstones: StateFlagKey[];
}

/**
 * push diff — "지금 로컬 상태" vs "이 기기가 마지막으로 서버에 올린 상태".
 *
 * ⚠️ tombstone 대상은 "로컬에 없다"가 아니라 **"이 기기가 직접 올린 적 있는데 지금 없다"**다.
 *    (`lastPushed`가 기준이라는 뜻 — 카드의 `lastPushedRef`와 같은 규칙.) 그래서 계정 전환이나
 *    부팅 직후의 빈 상태로는 tombstone이 나갈 수 없다. 호출부는 계정 경계에서 이 맵을 반드시
 *    비운다(안 비우면 이전 계정의 항목 전체에 표식을 쏜다).
 *
 * ⚠️ **add-only kind는 tombstone을 만들지 않는다.** viewedSnap의 500개 트림, 신고 목록의
 *    정리 같은 '축출'을 사용자의 끄기로 오해하면 상대 기기의 상태를 지운다.
 *
 * ⚠️ **`revive`가 이 함수의 두 번째 축이다(2026-09-10 QA H1).** 서버 upsert는 `deleted_at`을
 *    건드리지 않는 것이 원칙인데(그래야 앱을 켤 때마다 나가는 전량 시드가 다른 기기의 끄기를
 *    되살리지 않는다), 그 원칙만으로는 **한 번 끈 키를 다시 켤 수 없다** — 차단 해제 후
 *    재차단이 조용히 풀려 서버 `blocks`와 로컬 목록이 영구히 어긋났다.
 *    그래서 **"사용자가 방금 명시적으로 켠 키"**(`explicitAdds`)에만 `revive: true`를 세우고,
 *    호출부는 그 행에만 `deleted_at: null`을 실어 표적 부활시킨다.
 *    - 시드·에코 upsert(빈 지문 맵에서 나온 전량)는 `explicitAdds`에 없으므로 **절대 revive되지
 *      않는다** — 카드에서 `deleted_at: null`을 금지했던 사고(부팅 시드가 남의 삭제를 되살림)를
 *      그대로 막으면서 재추가만 살리는 구분선이 바로 이것이다.
 *    - 이미 살아 있는 행에 `deleted_at: null`을 다시 쓰는 것은 무해한 no-op이다.
 *
 * @param local        로컬 집합(서버 키 공간)
 * @param lastPushed   `flagMapKey()` → 지문. 지문 없는 kind는 빈 문자열을 쓴다.
 * @param explicitAdds 사용자 행동으로 **방금 켠** 키(`flagMapKey()` 형식). 넘기지 않으면 revive 없음.
 */
export function diffForPush(
  local: LocalFlagState,
  lastPushed: Map<string, string>,
  explicitAdds?: ReadonlySet<string>,
): StateFlagPushDiff {
  const upserts: FlagPushRow[] = [];
  const tombstones: StateFlagKey[] = [];

  const present = new Set<string>();
  for (const kind of STATE_FLAG_KINDS) {
    const seen = new Set<string>(); // 같은 키가 로컬 배열에 두 번 있는 경우 방어
    for (const it of local?.[kind] ?? []) {
      if (!it?.key || seen.has(it.key)) continue;
      seen.add(it.key);
      const mk = flagMapKey(kind, it.key);
      present.add(mk);
      const sig = it.sig ?? '';
      if (lastPushed.get(mk) !== sig) {
        upserts.push({ kind, itemKey: it.key, sig: it.sig, revive: !!explicitAdds?.has(mk) });
      }
    }
  }

  for (const mk of lastPushed.keys()) {
    if (present.has(mk)) continue;
    const parsed = parseFlagMapKey(mk);
    if (!parsed) continue;
    if (!isRemovableFlagKind(parsed.kind)) continue; // add-only — 소실은 축출이다(위 ⚠️)
    tombstones.push(parsed);
  }

  return { upserts, tombstones };
}

/**
 * `viewedSnapIds` 병합 — **상한(500)을 넘길 추가는 버린다.**
 *
 * ⚠️ 왜 "받은 뒤 자르기"가 아니라 "넘칠 만큼은 안 받기"인가 (2026-09-10 QA M2):
 *    viewedSnap은 add-only라 로컬에서 밀려난 항목에도 **삭제 표식이 안 나간다** → 서버에서는
 *    계속 살아 있다. `[...prev, ...서버분].slice(-500)`으로 자르면 밀려난 항목이 다음 pull에서
 *    또 `missingLocally`로 잡혀 뒤에 붙고, 그만큼 앞쪽이 또 밀려난다 —
 *    **500칸 창이 매 pull마다 영원히 회전한다**(안정 상태가 없다. 이미 본 스냅의 링이 계속
 *    다시 켜지고, 매번 영속 저장·리렌더가 헛돈다).
 *    빈 칸(`limit - prev.length`)만큼만 받으면 로컬이 가득 찬 순간 **추가가 0이 되어 수렴한다.**
 *
 * 규칙
 * - `prev`(로컬)는 **절대 자르지 않는다.** 로컬은 이 기기가 실제로 본 목록이고 이미
 *   `markSnapViewed`의 `slice(-500)`로 상한이 지켜진다. legacy blob 복원 등으로 prev가 상한을
 *   넘겨 들어와도 여기서 잘라 버리면 "본 스냅"이 사라진다 — 그때는 추가만 0이 된다.
 * - `incoming`은 **오래된 것 → 최신 순**으로 들어온다(호출부가 서버 `updated_at`으로 정렬).
 *   빈 칸이 모자라면 **뒤쪽(최신)부터** 채운다.
 * - 바뀐 게 없으면 `prev`를 **참조 그대로** 돌려준다(헛 리렌더·헛 저장 방지).
 */
export function mergeViewedSnap(prev: string[], incoming: string[], limit = 500): string[] {
  if (!incoming || incoming.length === 0) return prev;
  const have = new Set(prev);
  const fresh: string[] = [];
  for (const k of incoming) {
    if (!k || have.has(k)) continue;
    have.add(k); // incoming 자체의 중복도 거른다
    fresh.push(k);
  }
  if (fresh.length === 0) return prev;
  const room = limit - prev.length;
  if (room <= 0) return prev; // 로컬이 이미 가득 — 서버의 옛 항목이 최신을 밀어내지 않는다
  const take = fresh.length <= room ? fresh : fresh.slice(-room);
  return [...prev, ...take];
}

/**
 * blocked 항목의 **표시용 메타** 직렬화 — 서버 `data` 컬럼에 그대로 들어간다.
 *
 * ⚠️ 키 순서를 고정한다. Postgres jsonb는 키 순서를 자기 규칙대로 **재정렬해서 돌려주므로**,
 *    서버에서 받은 값을 그대로 `JSON.stringify`하면 우리가 보낸 문자열과 달라진다
 *    (카드에서 실제로 밟은 함정 — 안 고치면 바뀐 게 없는 항목이 매번 '변경됨'으로 잡힌다).
 */
export function blockedFlagData(b: {
  name?: unknown; emoji?: unknown; handle?: unknown; id?: unknown; blockedAt?: unknown;
}): Record<string, unknown> {
  return {
    name: typeof b.name === 'string' ? b.name : '',
    emoji: typeof b.emoji === 'string' ? b.emoji : '',
    handle: typeof b.handle === 'string' ? b.handle : '',
    id: typeof b.id === 'string' ? b.id : '',
    blockedAt: typeof b.blockedAt === 'number' ? b.blockedAt : 0,
  };
}

/**
 * blocked 항목의 push 지문.
 *
 * ⚠️ **`blockedAt`을 일부러 뺐다.** 그건 '차단한 시각'이라는 기기 로컬 값이고, 내용이 바뀐 게
 *    아니라 시각만 다른 사본을 매번 다시 올릴 이유가 없다. 카드 QA가 고정한 규칙
 *    ("지문에 서버·시계 값 금지")과 같은 눈이다. 더 중요한 것은 무한 재업로드 차단이다:
 *    pull이 상대 기기의 `blockedAt`을 로컬에 심으면 지문이 그 값을 포함할 경우 **로컬 사본이
 *    바뀐 것으로 잡혀 곧바로 되올라가고**, 상대는 그걸 또 받는다.
 *    반대로 신원·표시 필드(name·emoji·handle·id)는 바뀌면 올라가야 한다 —
 *    특히 `id`(profile uuid)는 차단 직후 백필되며 그 갱신이 상대 기기에도 가야 한다.
 */
export function blockedFlagSig(b: {
  name?: unknown; emoji?: unknown; handle?: unknown; id?: unknown;
}): string {
  const d = blockedFlagData(b);
  return JSON.stringify([d.name, d.emoji, d.handle, d.id]);
}

/**
 * blocked 항목의 신원 키 — handle 우선, 없으면 `name:{표시이름}`.
 *
 * `BlockedUser.handle`은 optional이다(과거 저장본엔 없다). `isBlocked`도 "handle이 있으면
 * handle로, 없으면 표시이름으로" 판정하므로 같은 규칙을 그대로 쓴다. `name:` 접두사를 붙이는
 * 이유는 표시이름이 우연히 남의 handle과 같아 두 항목이 한 행을 다투는 것을 막기 위함이다.
 */
export function blockedFlagKey(b: { handle?: string; name?: string }): string {
  if (b?.handle) return b.handle;
  return b?.name ? `name:${b.name}` : '';
}
