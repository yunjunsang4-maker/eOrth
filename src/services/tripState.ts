/**
 * 여행 카드(그룹)·세션 백업/동기화 서비스
 *
 * 두 경로가 공존한다. **둘 다 살아 있어야 한다.**
 *
 *  ① legacy — `user_trip_state` (사용자당 1행 jsonb). `saveTripState`/`fetchTripState`.
 *     재설치/기기 변경 복원용 백업본이고, 카드 전체 + 여행 세션을 통째로 담는다.
 *     두 기기가 같이 쓰면 나중에 쓴 쪽이 이기고(LWW) 복원은 "로컬 카드가 비어 있을 때만" 돈다.
 *     **지우지 말 것** — 아직 옛 번들(런타임 4벌)이 이 경로만 안다.
 *
 *  ② 신규 — `user_trip_cards` (카드 1장 = 1행). 아래 4개 함수.
 *     posts와 같은 방식(프로브 → tombstone → updated_at 기준 LWW + 병합)이라
 *     카드의 생성·수정·삭제가 기기 간 전파되고, 동기화로 들어온 글이 이 기기의 날짜 규칙으로
 *     새로 만든 카드가 아니라 **소스 기기의 진짜 카드**에 붙는다.
 *
 * 로컬(recordStore)이 여전히 원본이다. 기록 참조는 remoteId(posts.id)로 변환해 저장한다 —
 * 재설치 후 서버에서 받은 기록(id=posts.id)과 그대로 이어진다. Supabase 미설정 시 무동작.
 *
 * ⚠️ 여행 세션(tripSession)은 신규 경로에 없다. 세션은 '이 기기의 현재 위치 이벤트'라
 *    기기 간 공유 대상이 아니며 계속 legacy(user_trip_state)에만 남는다.
 */

import { supabase } from './supabase';
import { getMyUserId } from './profile';
// 데이터 초기화에서만 쓴다(clearTripState 안). 방향은 tripState → appState 한쪽뿐이라
// 순환 import가 아니다 — appState는 supabase·profile·withTimeout만 import한다.
import { clearStateFlags } from './appState';

export interface TripStateBackup {
  groups: Array<{
    id: string;
    title: string;
    records: string[];       // remoteId(posts.id) 우선, 미발행 기록은 로컬 id
    coverRecordId: string;
    createdAt: string;       // ISO 문자열
    countryName?: string;
    countryFlag?: string;
    coverUri?: string;
    date?: string;
    regionName?: string;
    stay?: { type: string; status: string; startedAt: string; endedAt?: string; lastActiveAt: number };
  }>;
  session: { groups: Record<string, string>; lastActiveAt: number } | null;
}

/** 카드 1장의 서버 직렬화 형태 — legacy 백업의 groups 원소와 **같은 shape**다(규칙을 두 벌로 갈리게 하지 않는다) */
export type TripCardPayload = TripStateBackup['groups'][number];

/**
 * 직렬화 입력 — recordStore의 `TripGroup`이 구조적으로 그대로 들어맞는다.
 * (여기서 recordStore를 import하면 순환이 된다. 그래서 최소 shape로 받는다.)
 */
export interface SerializableTripGroup {
  id: string;
  title: string;
  records: string[];
  coverRecordId: string;
  createdAt: Date;
  countryName?: string;
  countryFlag?: string;
  coverUri?: string;
  date?: string;
  regionName?: string;
  stay?: TripCardPayload['stay'];
}

/**
 * 카드 1장을 서버 payload로 만든다 — legacy `saveTripState`가 하던 변환과 **같은 규칙**이다
 * (기록 참조를 remoteId 우선으로, createdAt은 ISO 문자열).
 *
 * ⚠️ 키 순서가 고정이어야 한다. 호출부가 `JSON.stringify` 결과를 "서버가 가진 사본"의
 *    지문으로 써서 push diff를 하는데, 키 순서가 흔들리면 바뀐 게 없는 카드가 매번
 *    '변경됨'으로 잡혀 무한히 업로드된다. `stay`도 같은 이유로 평평하게 다시 만든다 —
 *    Postgres jsonb는 키 순서를 자기 규칙대로 재정렬해서 돌려주기 때문에, 서버에서 받은
 *    payload를 그대로 stringify하면 우리가 보낸 것과 문자열이 달라진다.
 *
 * ⚠️ `serverUpdatedAt`은 **싣지 않는다.** 그건 이 기기가 들고 있는 로컬 기준선이지
 *    카드의 내용이 아니다. 실으면 legacy 복원이 그 값을 되살려, 서버 사본을 받은 적도 없는
 *    카드가 '기준선 있음'으로 보여 수정 전파 판정이 틀어진다.
 *
 * @param toRemote 로컬 기록 id → remoteId(없으면 로컬 id 그대로)
 */
export function serializeTripCard(
  g: SerializableTripGroup,
  toRemote: (recordId: string) => string,
): TripCardPayload {
  const s = g.stay;
  // createdAt 방어 — 서버에서 받은 payload를 되돌릴 때 값이 깨져 있으면 toISOString()이 throw한다.
  // 백업 한 번이 예외로 통째로 죽는 것보다, 그 카드만 epoch로 떨어지는 편이 낫다.
  const made = g.createdAt instanceof Date ? g.createdAt : new Date(g.createdAt as unknown as string);
  return {
    id: g.id,
    title: g.title,
    records: (g.records ?? []).map(toRemote),
    coverRecordId: toRemote(g.coverRecordId),
    createdAt: (Number.isFinite(made.getTime()) ? made : new Date(0)).toISOString(),
    countryName: g.countryName,
    countryFlag: g.countryFlag,
    // 로컬 파일 경로를 그대로 싣는다. 받는 기기에는 그 파일이 없어 카드가 이모지 그라데이션
    // 폴백으로 그려진다 — 기존 동작이며 의도된 한계다(사진 자체를 옮기려면 업로드가 필요한데,
    // 조용한 동기화의 비용 전제가 깨진다).
    coverUri: g.coverUri,
    date: g.date,
    regionName: g.regionName,
    stay: s
      ? { type: s.type, status: s.status, startedAt: s.startedAt, endedAt: s.endedAt, lastActiveAt: s.lastActiveAt }
      : undefined,
  };
}

/**
 * push diff용 지문 — 같은 내용이면 항상 같은 문자열이 나와야 한다.
 * 서버에서 받은 payload에도 이 함수를 써야 지문이 맞는다(위 키 순서 주석 참조).
 */
export function tripCardJson(p: TripCardPayload): string {
  return JSON.stringify(
    serializeTripCard(
      {
        id: p.id,
        title: p.title,
        records: p.records,
        coverRecordId: p.coverRecordId,
        createdAt: new Date(p.createdAt),
        countryName: p.countryName,
        countryFlag: p.countryFlag,
        coverUri: p.coverUri,
        date: p.date,
        regionName: p.regionName,
        stay: p.stay,
      },
      (id) => id, // 이미 서버 형태(remoteId 변환 완료) — 다시 변환하지 않는다
    ),
  );
}

// ─────────────────────────────────────────────
// ① legacy — user_trip_state (사용자당 1행). 은퇴 조건은 아래 주석 참조.
// ─────────────────────────────────────────────

// 백업 저장 — 실패는 조용히 넘어간다(다음 변경 때 자동 재시도되는 best-effort 백업)
//
// ⚠️ 신규 경로(user_trip_cards)가 생긴 뒤에도 **계속 부른다(dual-write).** 옛 번들 기기는
//    이 경로로만 복원하기 때문이다. 은퇴 조건: 베타·정식 런타임 4벌이 모두 새 번들로 올라가고,
//    그 뒤에도 옛 번들에서 복원할 사용자가 없다고 판단될 때. 그때 이 함수와 fetchTripState,
//    그리고 recordStore의 legacy 복원 effect를 함께 걷어낸다(세션 백업 경로가 여기 얹혀 있으니
//    세션을 어디에 둘지 먼저 정할 것).
//
// @returns 성공 여부. 호출부가 "같은 내용을 또 올리지 않기" 위한 판정에 쓴다 —
//          실패한 회차는 기록하지 않아야 다음 변경 때 다시 시도된다.
//          (옛 계약은 `Promise<void>`였고 호출부가 반환을 안 봤다. 값을 더한 것뿐이라 호환된다.)
export async function saveTripState(data: TripStateBackup): Promise<boolean> {
  if (!supabase) return false;
  const uid = await getMyUserId();
  if (!uid) return false;
  try {
    const { error } = await supabase.from('user_trip_state').upsert({ user_id: uid, data });
    return !error;
  } catch {
    return false; /* 무시 — best-effort */
  }
}

/**
 * 신규 표(user_trip_cards)의 내 카드를 **전부 삭제 표식 처리**한다 — 설정 > 데이터 초기화용.
 *
 * ⚠️ hard delete가 아니라 tombstone인 이유: 행이 사라지면 다른 기기는 "지웠다"와 "조회 실패"를
 *    구분할 수 없어 그 기기에 카드가 그대로 남는다. 표식을 남겨야 **삭제가 전파**된다
 *    (posts의 `deleteAllMyPosts`와 같은 판단).
 * ⚠️ `.is('deleted_at', null)`: 이미 표식이 찍힌 행의 시각을 덮어쓰지 않는다.
 */
export async function clearTripCards(): Promise<boolean> {
  if (!supabase) return false;
  const uid = await getMyUserId();
  if (!uid) return false;
  try {
    const { error } = await supabase
      .from('user_trip_cards')
      .update({ deleted_at: new Date().toISOString(), data: {} })
      .eq('user_id', uid)
      .is('deleted_at', null);
    return !error;
  } catch {
    return false; /* 무시 — 표가 아직 없는 서버 포함 */
  }
}

// 백업 삭제 — 설정 > 데이터 초기화용 (남겨두면 재설치/재로그인 복원이 지운 카드를 되살린다)
//
// ⚠️ **신규 표도 여기서 함께 정리한다.** legacy만 지우면 ① 다음 pull이 `user_trip_cards`의
//    서버 사본을 전부 `missing`으로 받아 **카드를 되살리고**, ② 그 살아 있는 행들이 복원
//    effect의 게이트를 영구히 닫아 이후 재설치에서 legacy 복원까지 영영 안 돌게 만든다.
//    호출부(SettingsScreen)를 고치지 않아도 되도록 이 함수 안에서 부른다 — 계약은 그대로
//    `Promise<void>`이고 실패는 여전히 내부에서 삼킨다(초기화 흐름을 막지 않는다).
// ⚠️ `resetRecords`에는 절대 넣으면 안 된다 — 그쪽은 계정 전환에도 쓰여서, 넣으면 전환할 때마다
//    이전 계정의 서버 카드를 지우게 된다.
// ⚠️ **부가상태 집합(user_state_flags)도 여기서 함께 정리한다**(2026-09-10 QA H2).
//    이 함수가 데이터 초기화 흐름의 유일한 서버 정리 지점이라(SettingsScreen:368), 여기서 안
//    지우면 다음 pull 한 번이 보관·차단·음소거·본 스냅·신고 숨김을 통째로 되살린다.
//    카드와 같은 이유로 hard delete가 아니라 tombstone이고, 실패는 삼킨다.
//    (이름은 '여행 카드' 계열인데 부가상태까지 지우는 것이 어색하지만, 화면 파일을 건드리지
//     않는 대신 초기화 정리를 이 한 곳에 모으는 쪽을 택했다 — 카드 H2에서 확립된 관행이다.)
export async function clearTripState(): Promise<void> {
  if (!supabase) return;
  await clearTripCards();
  await clearStateFlags();
  const uid = await getMyUserId();
  if (!uid) return;
  try {
    await supabase.from('user_trip_state').delete().eq('user_id', uid);
  } catch {
    /* 무시 — best-effort */
  }
}

// 백업 조회 — 없음/실패 시 null
export async function fetchTripState(): Promise<TripStateBackup | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  try {
    const { data, error } = await supabase
      .from('user_trip_state')
      .select('data')
      .eq('user_id', uid)
      .maybeSingle();
    if (error || !data?.data) return null;
    return data.data as TripStateBackup;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// ② 신규 — user_trip_cards (카드 1장 = 1행)
//
// ⚠️ **표가 아직 없는 서버**(SQL 미실행)에서는 네 함수 모두 조용히 실패한다
//    (probe → null / fetch → [] / upsert → null / tombstone → false).
//    그러면 카드 동기화만 꺼지고 앱은 legacy 경로로 이전과 똑같이 돈다.
//    ⚠️ **컬럼이 없는 구 서버를 위한 단계형 폴백은 만들지 않는다** — posts와 달리 이 표는
//       처음부터 deleted_at을 갖고 태어나므로, "컬럼만 없는 서버"라는 상태가 존재할 수 없다.
// ─────────────────────────────────────────────

/** 프로브 응답 1행 — 본문(data)은 받지 않는다 */
export interface ServerTripCardRef {
  cardId: string;
  /** user_trip_cards.updated_at(ms). 수정 전파 판정 기준 */
  updatedAt?: number | null;
  /** user_trip_cards.deleted_at(ms). 값이 있으면 **사용자가 명시적으로 지운 카드**다 */
  deletedAt?: number | null;
}

/** 본문까지 받은 카드 1장 */
export interface ServerTripCard {
  cardId: string;
  updatedAt?: number;
  data: TripCardPayload;
}

const toMs = (v: unknown): number | undefined => {
  if (typeof v !== 'string' || !v) return undefined;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : undefined;
};

/**
 * 내 카드의 id + updated_at + deleted_at 프로브 — 본문(data)을 받지 않아 응답이 작다.
 *
 * ⚠️ 실패는 반드시 `null`이다(빈 배열 아님 — 이 저장소의 확립된 계약).
 *    빈 배열로 돌려주면 호출부가 "서버에 카드가 하나도 없다"로 오해한다.
 *    (그래도 삭제로는 이어지지 않는다 — "서버 목록에 없음"은 삭제 근거가 아니라는 불변식이
 *     merge 쪽에 있다. 다만 로컬 카드를 전부 '서버에 없음'으로 보고 재업로드하게 된다.)
 *
 * 페이징하지 않는다. 카드는 사용자당 수십 개 규모이고, PostgREST 기본 상한(1000행)을 넘는
 * 사용자는 현실적으로 없다. 넘더라도 못 본 카드는 '서버에 없음'이 되어 재업로드될 뿐이다.
 */
export async function probeTripCards(): Promise<ServerTripCardRef[] | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  try {
    const { data, error } = await supabase
      .from('user_trip_cards')
      .select('card_id, updated_at, deleted_at')
      .eq('user_id', uid);
    if (error || !data) return null; // 표 없음·네트워크 실패 전부 여기 — 조용히 포기
    const out: ServerTripCardRef[] = [];
    for (const row of data as any[]) {
      const cardId = row?.card_id as string | undefined;
      if (!cardId) continue;
      out.push({
        cardId,
        updatedAt: toMs(row?.updated_at) ?? null,
        deletedAt: toMs(row?.deleted_at) ?? null,
      });
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * 주어진 card_id들의 본문을 받는다 — probeTripCards의 짝.
 *
 * 실패한 청크는 건너뛰고 받은 것만 반환한다(빈 배열도 정상 반환값). 호출부는 병합만 하므로
 * 부분 결과가 로컬을 훼손하지 않고, 못 받은 것은 다음 회차에 다시 잡힌다.
 */
export async function fetchTripCards(cardIds: string[]): Promise<ServerTripCard[]> {
  if (!supabase || cardIds.length === 0) return [];
  const uid = await getMyUserId();
  if (!uid) return [];
  try {
    const CHUNK = 200; // 대량 id를 .in() 하나로 보내면 URL 길이 한도에 걸린다(posts와 같은 규격)
    const out: ServerTripCard[] = [];
    for (let i = 0; i < cardIds.length; i += CHUNK) {
      const { data, error } = await supabase
        .from('user_trip_cards')
        .select('card_id, data, updated_at')
        .eq('user_id', uid)
        // 프로브와 본문 조회 사이에 다른 기기가 지웠을 수 있다 — 지운 카드를 되살리지 않는다
        .is('deleted_at', null)
        .in('card_id', cardIds.slice(i, i + CHUNK));
      if (error || !data) continue; // 실패 청크는 건너뛴다
      for (const row of data as any[]) {
        const cardId = row?.card_id as string | undefined;
        const payload = row?.data;
        if (!cardId || !payload || typeof payload !== 'object') continue;
        out.push({ cardId, updatedAt: toMs(row?.updated_at), data: payload as TripCardPayload });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * 바뀐 카드를 올린다.
 *
 * @returns cardId → 서버 updated_at(ms) 맵. **실패는 null.**
 *          호출부는 이 값으로 각 카드의 기준선(serverUpdatedAt)을 심는다 — 안 심으면
 *          자기가 방금 올린 카드가 다음 pull에서 'stale'로 잡혀 계속 다시 내려온다
 *          (posts의 updatePost와 같은 패턴).
 *
 * ⚠️ **`deleted_at`을 건드리지 않는다(payload에 없다).** 즉 이미 표식이 찍힌 카드는 이 upsert로
 *    되살아나지 않는다 — 삭제가 동시 수정을 이긴다. 이게 맞는 이유 셋:
 *    ① 카드 id는 `grp-{ms}-{rand4}`라 **재사용되지 않으므로** 표식을 풀어야 할 상황이 없다.
 *    ② A가 카드를 지웠는데 B의 편집 push가 그걸 되살리면 안 된다(B는 다음 pull에서 표식을 보고
 *       로컬에서도 지운다 — 자기 치유).
 *    ③ "데이터 초기화"(clearTripCards)와 경합하는 대기 중 push가 방금 찍은 표식을 풀어버리는
 *       사고를 구조적으로 막는다. INSERT면 컬럼 기본값이 null이라 새 카드는 정상이다.
 * ⚠️ `updated_at`은 보내지 않는다 — 서버 트리거(set_updated_at)가 채운다. 기기 시계를
 *    실으면 시계가 미래로 튄 기기의 카드가 영원히 이기는 워터마크 사고가 난다.
 */
export async function upsertTripCards(
  cards: { cardId: string; data: TripCardPayload }[],
): Promise<Map<string, number> | null> {
  if (!supabase || cards.length === 0) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  try {
    const CHUNK = 100;
    const out = new Map<string, number>();
    for (let i = 0; i < cards.length; i += CHUNK) {
      const rows = cards.slice(i, i + CHUNK).map((c) => ({
        user_id: uid,
        card_id: c.cardId,
        data: c.data,
      }));
      const { data, error } = await supabase
        .from('user_trip_cards')
        .upsert(rows, { onConflict: 'user_id,card_id' })
        .select('card_id, updated_at');
      // 한 청크라도 실패하면 통째로 실패로 본다 — 기준선을 안 심으면 다음 변경 때 전부
      // 다시 올라갈 뿐이고(upsert는 멱등), 절반만 심으면 판정이 어긋난 채로 굳는다.
      if (error || !data) return null;
      for (const row of data as any[]) {
        const cardId = row?.card_id as string | undefined;
        const at = toMs(row?.updated_at);
        if (cardId && at !== undefined) out.set(cardId, at);
      }
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * 카드 삭제 표식 — 행을 지우지 않는다.
 *
 * 행이 사라지면 다른 기기가 "사용자가 카드를 지웠다"와 "이번 조회가 부분 실패했다"를
 * 구분할 수 없어 로컬 카드를 지워도 되는지 판정할 수 없다(posts와 같은 이유).
 *
 * 본문(data)도 함께 비운다 — 표식만 남기면 지운 카드의 제목·커버 경로가 서버에 계속 남는다.
 * 받는 기기는 표식만 보고 지우므로 본문은 필요 없다.
 *
 * `.is('deleted_at', null)`을 거는 이유: 이미 표식이 찍힌 행의 시각을 덮어쓰지 않는다
 * (덮으면 나중에 purge를 걸었을 때 기준일이 계속 밀린다).
 */
export async function tombstoneTripCards(cardIds: string[]): Promise<boolean> {
  if (!supabase || cardIds.length === 0) return false;
  const uid = await getMyUserId();
  if (!uid) return false;
  try {
    const { error } = await supabase
      .from('user_trip_cards')
      .update({ deleted_at: new Date().toISOString(), data: {} })
      .eq('user_id', uid)
      .is('deleted_at', null)
      .in('card_id', cardIds);
    return !error;
  } catch {
    return false;
  }
}
