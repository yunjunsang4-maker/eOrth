/**
 * appState.ts — 앱 로컬 상태 통합 백업/복원 (user_app_state, 사용자당 1행 jsonb)
 *
 * 로컬이 원본, 서버는 백업본. 설정(스킨·색·알림·배지·통계 등)과 기록 부가상태
 * (보관·신고숨김·음소거·차단목록·본 스냅·카드순서)를 재설치/기기 변경 후 복원한다.
 * PII(핸들·소개·사진 등)는 profiles가 원본이므로 여기 포함하지 않는다.
 *
 * 게이트 원칙(user_trip_state와 동일): 로그인 확정 후 복원 → 복원 뒤에만 백업 허용.
 * (빈 로컬 상태가 서버 백업을 덮어쓰는 사고 방지 — 여행카드 유실 실사고의 교훈)
 */
import { supabase } from './supabase';
import { getMyUserId } from './profile';
import { withTimeout } from '../utils/withTimeout';

// 이 두 함수는 로그인 직후(useAccountBoundary)와 Splash 진입 판정에서 await 된다.
// 즉 사용자가 로딩 화면을 보며 기다리는 경로다 — 상한이 없으면 소켓이 stall 될 때
// (끊김이 아니라 무응답) 스피너가 영원히 돌고 탈출구가 없다. RN fetch 는 기본
// 타임아웃이 없어 OS 레벨까지 수 분 매달린다.
const APP_STATE_TIMEOUT_MS = 8000;

export interface AppStateBackup {
  settings?: Record<string, unknown>; // settingsStore.exportSettingsBackup()
  records?: Record<string, unknown>;  // recordStore.exportLocalStateBackup()
  cardOrder?: string[];               // 프로필 여행카드 순서
  moments?: unknown[];                // momentStore.exportMomentsBackup() — 텍스트/메타 + photoUrl(사진 서버 백업), 로컬 photoUri 제외
}

export async function saveAppState(data: AppStateBackup): Promise<void> {
  if (!supabase) return;
  const uid = await getMyUserId();
  if (!uid) return;
  try {
    await withTimeout(supabase.from('user_app_state').upsert({ user_id: uid, data }), APP_STATE_TIMEOUT_MS);
  } catch {
    /* 무시(타임아웃 포함) — 다음 변경 때 재시도 */
  }
}

export async function fetchAppState(): Promise<AppStateBackup | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  try {
    const { data, error } = await withTimeout(
      supabase.from('user_app_state').select('data').eq('user_id', uid).maybeSingle(),
      APP_STATE_TIMEOUT_MS,
    );
    if (error || !data?.data) return null;
    return data.data as AppStateBackup;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// ② 신규 — user_state_flags (부가상태 집합의 **항목 1개 = 1행**)
//
// 위 legacy(user_app_state)는 사용자당 1행 jsonb 통째 upsert라 두 기기가 서로를 덮어쓴다.
// 보관을 풀었는데 되살아나고 차단이 한쪽에만 남던 증상이 거기서 나왔다. 집합 6종만
// 행으로 승격해 posts·카드와 같은 방식(프로브 → tombstone → 병합)으로 돌린다.
//
// ⚠️ **legacy 함수 둘은 한 줄도 바꾸지 않았다.** 옛 번들 기기가 그 경로로만 복원하고,
//    설정 스칼라·cardOrder·moments·countryCovers는 **여전히 legacy 통째 백업(LWW)**이다
//    (이번 범위 밖 — 알려진 한계).
//
// ⚠️ **표가 아직 없는 서버**(SQL 미실행)에서는 아래 네 함수가 모두 조용히 실패한다
//    (probe → null / fetch → [] / upsert → false / tombstone → false).
//    그러면 집합 동기화만 꺼지고 앱은 legacy 경로로 이전과 똑같이 돈다 — 하위 호환 계약이다.
//    판정은 오류 메시지 문자열이 아니라 **supabase-js의 error 객체 유무**로만 한다.
// ─────────────────────────────────────────────

/** 집합 종류. 서버 `user_state_flags.kind` 값과 문자 그대로 같다 */
export type StateFlagKind =
  | 'archived'
  | 'muted'
  | 'blocked'
  | 'viewedSnap'
  | 'reportedPost'
  | 'reportedComment';

/** (kind, item_key) 한 쌍 — 이 표의 논리 키 */
export interface StateFlagKey {
  kind: StateFlagKind;
  itemKey: string;
}

/** 프로브 응답 1행 — 본문(data)은 받지 않는다 */
export interface ServerStateFlagRef extends StateFlagKey {
  /**
   * user_state_flags.updated_at(ms).
   * ⚠️ **로컬 어디에도 저장하지 않는다.** 이 표에는 '수정'이라는 개념이 사실상 없어
   *    LWW 기준선이 필요 없고, 기준선을 로컬에 심으면 그게 곧 워터마크가 된다.
   *    지금은 add-only kind(viewedSnap)를 병합할 때 **정렬 순서**로만 쓴다(인메모리).
   */
  updatedAt?: number | null;
  /** user_state_flags.deleted_at(ms). 값이 있으면 **사용자가 명시적으로 껐다**는 뜻 */
  deletedAt?: number | null;
}

/** 본문(data)까지 받은 1행 — 지금은 blocked만 data를 쓴다 */
export interface ServerStateFlag extends StateFlagKey {
  data?: Record<string, unknown> | null;
}

const toMs = (v: unknown): number | undefined => {
  if (typeof v !== 'string' || !v) return undefined;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : undefined;
};

const KNOWN_KINDS = new Set<string>([
  'archived', 'muted', 'blocked', 'viewedSnap', 'reportedPost', 'reportedComment',
]);

/** kind별로 묶는다 — 조회·수정 필터를 `.eq('kind', k).in('item_key', [...])`로 단순화하기 위함 */
function groupByKind<T extends StateFlagKey>(keys: T[]): Map<StateFlagKind, T[]> {
  const out = new Map<StateFlagKind, T[]>();
  for (const k of keys) {
    if (!k?.itemKey || !KNOWN_KINDS.has(k.kind)) continue;
    const list = out.get(k.kind);
    if (list) list.push(k);
    else out.set(k.kind, [k]);
  }
  return out;
}

/**
 * 내 부가상태 행의 (kind, item_key, updated_at, deleted_at) 프로브 — 본문을 안 받아 응답이 작다.
 *
 * ⚠️ 실패는 반드시 `null`이다(빈 배열 아님 — 이 저장소의 확립된 계약).
 *    빈 배열로 돌려주면 호출부가 "서버에 아무것도 없다"로 오해한다.
 *    (그래도 삭제로는 이어지지 않는다 — "서버 목록에 없음"은 삭제 근거가 아니라는 불변식이
 *     utils/mergeStateFlags 쪽에 구조적으로 박혀 있다.)
 *
 * ⚠️ **카드와 달리 페이지네이션이 필수다.** 집합 합계는 수백~수천 행 규모다
 *    (viewedSnap만 상한 500 + 보관·차단·음소거·신고). PostgREST 기본 상한(1000행)에
 *    걸리면 못 본 행이 '서버에 없음'이 되어 매 세션 재업로드된다. posts의 fetchMyPostIds와
 *    같은 규격(PAGE=200, range, 안전 상한)으로 끊어 받는다.
 */
export async function probeStateFlags(): Promise<ServerStateFlagRef[] | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  try {
    const PAGE = 200;
    const MAX_ROWS = 6000; // 안전 상한 — 비정상 응답으로 루프가 무한정 도는 것을 막는다
    const out: ServerStateFlagRef[] = [];
    const seen = new Set<string>(); // 페이지 경계가 겹칠 때의 중복 제거
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const { data, error } = await supabase
        .from('user_state_flags')
        .select('kind, item_key, updated_at, deleted_at')
        .eq('user_id', uid)
        // 페이지 경계가 흔들리지 않게 PK 순서로 고정 정렬한다(정렬이 없으면 같은 행을
        // 두 페이지에서 보거나 아예 못 볼 수 있다)
        .order('kind', { ascending: true })
        .order('item_key', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        if (from === 0) return null; // 첫 페이지부터 실패(표 없음 포함) — 실패는 null
        break;                       // 중간 실패는 받은 것까지만(부분 목록)
      }
      if (!data || data.length === 0) break;
      for (const row of data as any[]) {
        const kind = row?.kind as string | undefined;
        const itemKey = row?.item_key as string | undefined;
        if (!kind || !itemKey || !KNOWN_KINDS.has(kind)) continue; // 모르는 kind는 조용히 무시(상위 호환)
        const k = `${kind}|${itemKey}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({
          kind: kind as StateFlagKind,
          itemKey,
          updatedAt: toMs(row?.updated_at) ?? null,
          deletedAt: toMs(row?.deleted_at) ?? null,
        });
      }
      if (data.length < PAGE) break; // 마지막 페이지
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * 주어진 키들의 본문(data)을 받는다 — 지금 호출부는 **blocked의 표시용 메타**가 필요할 때뿐이다.
 * (나머지 kind는 '있다/없다'가 전부라 본문을 받을 이유가 없다.)
 *
 * 실패한 청크는 건너뛰고 받은 것만 반환한다(빈 배열도 정상 반환값).
 */
export async function fetchStateFlags(keys: StateFlagKey[]): Promise<ServerStateFlag[]> {
  if (!supabase || keys.length === 0) return [];
  const uid = await getMyUserId();
  if (!uid) return [];
  try {
    const CHUNK = 200; // 대량 키를 .in() 하나로 보내면 URL 길이 한도에 걸린다(posts와 같은 규격)
    const out: ServerStateFlag[] = [];
    for (const [kind, list] of groupByKind(keys)) {
      const itemKeys = list.map((k) => k.itemKey);
      for (let i = 0; i < itemKeys.length; i += CHUNK) {
        const { data, error } = await supabase
          .from('user_state_flags')
          .select('kind, item_key, data')
          .eq('user_id', uid)
          .eq('kind', kind)
          // 프로브와 본문 조회 사이에 다른 기기가 껐을 수 있다 — 꺼진 항목을 되살리지 않는다
          .is('deleted_at', null)
          .in('item_key', itemKeys.slice(i, i + CHUNK));
        if (error || !data) continue; // 실패 청크는 건너뛴다
        for (const row of data as any[]) {
          const itemKey = row?.item_key as string | undefined;
          if (!itemKey) continue;
          const payload = row?.data;
          out.push({
            kind,
            itemKey,
            data: payload && typeof payload === 'object' && !Array.isArray(payload)
              ? (payload as Record<string, unknown>)
              : null,
          });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * 켜진 항목을 올린다. **성공/실패만 돌려준다** — 서버 시각을 회수하지 않는 이유는
 * 이 표에 기준선(로컬에 심는 updated_at) 개념이 없기 때문이다(위 ServerStateFlagRef 주석).
 *
 * ⚠️ **기본은 `deleted_at`을 payload에 넣지 않는 것이다.** 카드와 같은 규칙이고, 여기서는
 *    이유가 하나 더 있다: 이 표의 push 지문(`lastFlagsPushedRef`)은 **세션 ref라 앱을 켤 때마다
 *    비어 있고, 그래서 첫 push가 로컬 집합 전량을 upsert한다.** 그 전량 시드가 `deleted_at: null`을
 *    실으면 **다른 기기가 끈 항목을 통째로 되살린다**(보관 해제·차단 해제가 조용히 무효화된다).
 *    컬럼을 아예 건드리지 않으면 그 사고가 구조적으로 불가능하다.
 *    - INSERT면 컬럼 기본값이 null이라 새 항목은 정상.
 *    - UPDATE면 `deleted_at`이 그대로라 **끄기가 켜기를 이긴다.**
 *
 * ⚠️ **예외는 `revive: true` 행뿐이다(2026-09-10 QA H1).** 그 규칙만으로는 한 번 끈 키를
 *    다시 켤 수 없어서, **차단 해제 후 재차단이 조용히 풀리고 서버 `blocks`와 로컬 목록이
 *    영구히 어긋났다**(목록에 없으니 UI로 해제도 못 한다). 그래서 호출부가
 *    "사용자가 방금 명시적으로 켰다"고 표시한 행에만 `deleted_at: null`을 실어 부활시킨다.
 *    판정은 `utils/mergeStateFlags`의 `diffForPush(local, lastPushed, explicitAdds)`가 하고
 *    여기서는 시키는 대로만 한다 — **규칙이 두 곳에 있으면 갈린다.**
 *
 * ⚠️ **두 갈래는 반드시 따로 보낸다.** PostgREST는 한 배열 안 객체들의 **키 집합이 다르면**
 *    `PGRST102(All object keys must match)`로 거절하고, 통과시키는 구현이라면 오히려 더 나쁘다 —
 *    빠진 쪽이 컬럼 기본값(null)으로 채워져 **시드 행까지 부활**한다. 섞어 보내지 말 것.
 *
 * ⚠️ `updated_at`은 보내지 않는다 — 서버 트리거가 채운다. 기기 시계를 실으면 시계가 미래로
 *    튄 기기가 영원히 이기는 워터마크 사고가 난다.
 */
export async function upsertStateFlags(
  rows: { kind: StateFlagKind; itemKey: string; data?: Record<string, unknown> | null; revive?: boolean }[],
): Promise<boolean> {
  if (!supabase || rows.length === 0) return false;
  const uid = await getMyUserId();
  if (!uid) return false;
  try {
    const CHUNK = 100;
    const valid = rows.filter((r) => !!r?.itemKey && KNOWN_KINDS.has(r.kind));
    if (valid.length === 0) return false;
    // 키 집합이 다른 두 갈래 — 위 ⚠️ 참조. 섞어 보내면 안 된다.
    const groups: { list: typeof valid; revive: boolean }[] = [
      { list: valid.filter((r) => !r.revive), revive: false },
      { list: valid.filter((r) => !!r.revive), revive: true },
    ];
    for (const g of groups) {
      for (let i = 0; i < g.list.length; i += CHUNK) {
        const payload = g.list.slice(i, i + CHUNK).map((r) => (
          g.revive
            ? { user_id: uid, kind: r.kind, item_key: r.itemKey, data: r.data ?? null, deleted_at: null }
            : { user_id: uid, kind: r.kind, item_key: r.itemKey, data: r.data ?? null }
        ));
        const { error } = await supabase
          .from('user_state_flags')
          .upsert(payload, { onConflict: 'user_id,kind,item_key' });
        // 한 청크라도 실패하면 통째로 실패로 본다 — 지문을 안 심으면 다음 회차에 전부 다시
        // 올라갈 뿐이고(upsert는 멱등), 절반만 심으면 판정이 어긋난 채로 굳는다.
        if (error) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * 꺼진 항목의 삭제 표식 — 행을 지우지 않는다.
 *
 * 행이 사라지면 다른 기기가 "사용자가 껐다"와 "이번 조회가 부분 실패했다"를 구분할 수 없다
 * (posts·카드와 같은 이유).
 *
 * 본문(data)도 함께 비운다 — 표식만 남기면 차단 해제한 사람의 이름·이모지가 서버에 계속 남는다.
 * 받는 기기는 표식만 보고 지우므로 본문은 필요 없다.
 *
 * `.is('deleted_at', null)`을 거는 이유: 이미 찍힌 표식의 시각을 덮어쓰지 않는다
 * (덮으면 나중에 purge를 걸었을 때 기준일이 계속 밀린다).
 *
 * ⚠️ `deleted_at`에 기기 시계를 쓴다(PostgREST에 `now()`를 보낼 방법이 없다). **워터마크가
 *    아니다** — 이 값은 "표식이 있다/없다"로만 읽히고 어떤 비교에도 쓰이지 않는다
 *    (purge를 등록하면 그때 처음 시각으로 읽히며, 그 정확도 요구는 30일 단위다).
 *    카드(`tombstoneTripCards`)와 같은 판단이다.
 *
 * ⚠️ 호출부는 **제거 전파 대상 kind**(archived·muted·blocked)만 넘겨야 한다. add-only kind의
 *    로컬 소실은 사용자 의도가 아니라 축출(트림·정리)이다 — 그 판정은 utils/mergeStateFlags의
 *    `diffForPush`가 하고, 여기서는 다시 검사하지 않는다(두 곳에 규칙을 두면 갈린다).
 */
export async function tombstoneStateFlags(keys: StateFlagKey[]): Promise<boolean> {
  if (!supabase || keys.length === 0) return false;
  const uid = await getMyUserId();
  if (!uid) return false;
  try {
    const CHUNK = 200;
    const groups = groupByKind(keys);
    if (groups.size === 0) return false;
    const now = new Date().toISOString();
    for (const [kind, list] of groups) {
      const itemKeys = list.map((k) => k.itemKey);
      for (let i = 0; i < itemKeys.length; i += CHUNK) {
        const { error } = await supabase
          .from('user_state_flags')
          .update({ deleted_at: now, data: null })
          .eq('user_id', uid)
          .eq('kind', kind)
          .is('deleted_at', null)
          .in('item_key', itemKeys.slice(i, i + CHUNK));
        if (error) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * **내 부가상태 행 전체**에 삭제 표식 — 설정 > 데이터 초기화용 (2026-09-10 QA H2).
 *
 * ⚠️ 없으면 초기화가 무효가 된다(**이 기능이 만든 새 회귀였다**). 변경 전에는 초기화가
 *    `resetRecords`로 6개 집합을 비우고 `AppStateSync`가 빈 집합을 `user_app_state`에 덮어써
 *    서버 사본까지 사라졌다. 이제는 행 표가 원본이라, 지우지 않으면 **다음 pull 한 번이
 *    보관·차단·음소거·본 스냅·신고 숨김을 통째로 되살린다.**
 *    (`resetRecords`가 지문 맵을 비우므로 push diff는 표식을 하나도 만들지 않는다 —
 *     즉 이 함수 말고는 서버 행을 끌 수단이 없다.)
 *
 * ⚠️ **hard delete가 아니라 tombstone이다.** 행이 사라지면 다른 기기가 "초기화했다"와
 *    "이번 조회가 부분 실패했다"를 구분할 수 없어 그 기기에 상태가 그대로 남는다
 *    (posts `deleteAllMyPosts`·카드 `clearTripCards`와 같은 판단).
 *
 * ⚠️ **`resetRecords`에는 절대 넣지 마라** — 그쪽은 계정 전환에도 쓰여서, 넣으면 전환할 때마다
 *    이전 계정의 서버 상태를 지우게 된다(카드 H2 수정과 같은 주의).
 *
 * 호출부는 `services/tripState.ts`의 `clearTripState` 하나뿐이다(초기화 흐름이 이미 그 함수를
 * 타므로 화면을 고치지 않아도 된다 — `SettingsScreen.tsx:368`에서 확인).
 */
export async function clearStateFlags(): Promise<boolean> {
  if (!supabase) return false;
  const uid = await getMyUserId();
  if (!uid) return false;
  try {
    const { error } = await supabase
      .from('user_state_flags')
      .update({ deleted_at: new Date().toISOString(), data: null })
      .eq('user_id', uid)
      // 이미 찍힌 표식의 시각을 덮어쓰지 않는다(purge 기준일이 계속 밀린다)
      .is('deleted_at', null);
    return !error;
  } catch {
    return false;
  }
}
