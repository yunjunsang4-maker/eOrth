# 팔로우 → 서로이웃 모델 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단방향 팔로우 관계를 네이버 블로그식 서로이웃(양방향·수락제)으로 교체하고, 비공개 계정 제거·공개범위 2단계(이웃만/나만보기)·서로이웃 닫힌 피드로 전환한다.

**Architecture:** 서버는 새 `neighbors(requester_id, addressee_id, status)` 테이블 + SECURITY DEFINER RPC로 관계를 관리하고, `posts_select` RLS를 `are_neighbors` 기준으로 재작성한다. 클라이언트는 `social.ts` 서비스와 `recordStore` 액션을 이웃 API로 교체하고, `Visibility` 타입을 2값으로 줄인 뒤 화면·배지·i18n을 정리한다. 기존 맞팔만 자동 이웃으로 이관하는 1회성 SQL을 별도로 둔다.

**Tech Stack:** React Native (Expo), TypeScript, Supabase(Postgres + RLS + RPC), react-i18next. 검증: `npx tsc --noEmit`, 기존 `.verify.ts` 패턴, 수동 플로우.

**참고 스펙:** `docs/superpowers/specs/2026-07-15-follow-to-neighbor-design.md`

---

## 검증 방식 (이 프로젝트 특성)

- 이 저장소에는 jest 등 테스트 러너가 없다. 순수 로직은 `src/**/*.verify.ts` 파일로
  작성하고 `npx tsx <file>` 또는 임시로 `node -r`가 아니라 **`npx tsc --noEmit` 통과 +
  해당 verify를 tsx로 실행**해 확인한다(기존 `badgeRules.verify.ts` 패턴).
- SQL(스키마/RLS/RPC/마이그레이션)은 로컬 단위 테스트가 없다 → 사용자가 Supabase SQL
  편집기에서 실행하고, 클라이언트 플로우로 수동 검증한다.
- UI 변경은 `npx tsc --noEmit` + 실기기 플로우(이웃신청→수락→글 노출→끊기)로 검증한다.

## 파일 구조 (생성/수정)

**서버 (사용자가 Supabase에서 실행)**
- 수정: `supabase/schema.sql` — 최종형(neighbors 테이블·RLS·RPC, posts/comments RLS 재작성, follows/follow_requests/is_private 제거)
- 생성: `supabase/migration-2026-07-15-neighbors.sql` — 1회성 데이터 이관

**서비스**
- 수정: `src/services/social.ts` — 팔로우 API → 이웃 API
- 수정: `src/services/profile.ts`, `src/components/ProfileSync.tsx`, `src/hooks/useAccountBoundary.ts` — is_private 참조 제거

**상태**
- 수정: `src/store/recordStore.tsx` — `Visibility` 2값, 관계 상태·액션 교체

**화면**
- 수정: `FollowerListScreen`, `FriendProfileScreen`, `ProfileScreen`, `FriendSearchScreen`, `NotificationScreen`, `NewRecordScreen`, `BlogRecordScreen`, `CutTravelInfoScreen`, `SnapRecordScreen`, `AccountSettingsScreen`, `SocialScreen`, `SocialExploreScreen`

**배지 / i18n**
- 수정: `src/utils/badgeRules.ts`, `src/utils/badgeRules.verify.ts`, `src/i18n/locales/ko.ts`, `src/i18n/locales/en.ts`

---

## Phase 1 — 서버 (스키마 · RLS · RPC · 마이그레이션)

### Task 1: `neighbors` 테이블 · RLS · 판정 함수를 schema.sql에 추가

**Files:**
- Modify: `supabase/schema.sql` (섹션 3 `follows` 관련 블록을 neighbors로 교체)

- [ ] **Step 1: follows 테이블 정의·정책을 neighbors로 교체**

`schema.sql`에서 `follows` 테이블 생성(섹션 2의 `create table if not exists public.follows ...`)과
섹션 3의 follows 정책 블록(`follows_select_all`/`follows_insert_own`/`follows_delete_own`)을
아래로 교체한다. (follows를 참조하던 posts_select는 Task 3에서 재작성)

```sql
-- 서로이웃 관계 (양방향·수락제). accepted 행 1개가 두 사람의 대칭 관계를 의미.
create table if not exists public.neighbors (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending',   -- 'pending' | 'accepted'
  created_at   timestamptz not null default now(),
  primary key (requester_id, addressee_id)
);
create index if not exists idx_neighbors_addressee on public.neighbors (addressee_id);
create index if not exists idx_neighbors_status on public.neighbors (status);

alter table public.neighbors enable row level security;

-- 조회: 내가 당사자인 행만 직접 조회(타인 관계 목록은 neighbor_list_of RPC로)
drop policy if exists "neighbors_select_own" on public.neighbors;
create policy "neighbors_select_own" on public.neighbors
  for select to authenticated using (requester_id = auth.uid() or addressee_id = auth.uid());

-- 신청: 내가 requester (차단 관계면 불가)
drop policy if exists "neighbors_insert_own" on public.neighbors;
create policy "neighbors_insert_own" on public.neighbors
  for insert to authenticated with check (
    requester_id = auth.uid() and not public.is_blocked_between(auth.uid(), addressee_id)
  );

-- 수락: 내가 addressee 인 pending 행을 accepted 로
drop policy if exists "neighbors_update_addressee" on public.neighbors;
create policy "neighbors_update_addressee" on public.neighbors
  for update to authenticated using (addressee_id = auth.uid()) with check (addressee_id = auth.uid());

-- 삭제: 당사자 누구나 (신청취소·거절·끊기)
drop policy if exists "neighbors_delete_own" on public.neighbors;
create policy "neighbors_delete_own" on public.neighbors
  for delete to authenticated using (requester_id = auth.uid() or addressee_id = auth.uid());
```

- [ ] **Step 2: 서로이웃 판정 함수 추가**

`is_blocked_between` 정의 뒤(섹션 4-b 근처)에 추가한다.

```sql
create or replace function public.are_neighbors(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.neighbors
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b)
        or (requester_id = b and addressee_id = a))
  );
$$;
grant execute on function public.are_neighbors(uuid, uuid) to authenticated;
```

- [ ] **Step 3: 커밋**

```bash
git add supabase/schema.sql
git commit -m "feat(db): neighbors 테이블·RLS·are_neighbors 판정 함수"
```

---

### Task 2: 이웃 RPC (수락 · 목록 · 카운트 · 추천)

**Files:**
- Modify: `supabase/schema.sql` (기존 follow RPC들을 이웃 RPC로 교체)

- [ ] **Step 1: 수락 RPC — pending → accepted + 수락 알림**

기존 `accept_follow_request` RPC를 교체한다.

```sql
create or replace function public.accept_neighbor(requester uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  update public.neighbors
    set status = 'accepted'
    where requester_id = requester and addressee_id = me and status = 'pending';
  if found then
    insert into public.notifications (user_id, actor_id, type)
      values (requester, me, 'neighbor_accept');
  end if;
end; $$;
grant execute on function public.accept_neighbor(uuid) to authenticated;
```

- [ ] **Step 2: 이웃 목록 RPC (대칭, 단일 목록)**

기존 `follow_list_of`를 교체한다. accepted 관계의 상대 프로필을 반환.

```sql
create or replace function public.neighbor_list_of(target uuid)
returns table (id uuid, handle text, emoji text, profile_photo text)
language sql stable security definer set search_path = public as $$
  select p.id, p.handle, p.emoji, p.profile_photo
  from public.neighbors n
  join public.public_profiles p
    on p.id = case when n.requester_id = target then n.addressee_id else n.requester_id end
  where n.status = 'accepted'
    and (n.requester_id = target or n.addressee_id = target);
$$;
grant execute on function public.neighbor_list_of(uuid) to authenticated;
```

- [ ] **Step 3: 이웃 수 RPC (배치)**

기존 `follower_counts`/`following_counts` 두 개를 하나로 교체한다.

```sql
create or replace function public.neighbor_counts(ids uuid[])
returns table (user_id uuid, neighbor_count int)
language sql stable security definer set search_path = public as $$
  select u as user_id,
    (select count(*) from public.neighbors n
      where n.status = 'accepted' and (n.requester_id = u or n.addressee_id = u))::int
  from unnest(ids) as u;
$$;
grant execute on function public.neighbor_counts(uuid[]) to authenticated;
```

- [ ] **Step 4: 이웃신청 알림 트리거 (pending insert → addressee 알림)**

기존 `notify_on_follow` 트리거를 대체한다. neighbors에 pending이 삽입되면 대상에게
`neighbor_request` 알림을 넣는다(자동수락 경로는 requestNeighbor가 acceptNeighbor를 부르므로
insert가 아니라 update라 이 트리거를 타지 않음 → 신청 알림 중복 없음).

```sql
create or replace function public.notify_on_neighbor_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.status = 'pending') then
    insert into public.notifications (user_id, actor_id, type)
      values (new.addressee_id, new.requester_id, 'neighbor_request');
  end if;
  return null;
end; $$;

drop trigger if exists trg_notify_neighbor_request on public.neighbors;
create trigger trg_notify_neighbor_request after insert on public.neighbors
  for each row execute function public.notify_on_neighbor_request();

drop trigger if exists notify_on_follow on public.follows;
drop function if exists public.notify_on_follow();
```

- [ ] **Step 5: 추천 이웃 RPC 갱신 (is_private 제거)**

기존 `friend_suggestions`를 neighbors 기준으로 교체 — 내 이웃의 이웃 중 아직 나와 이웃이
아닌 사용자, `is_private` 컬럼 참조 제거.

```sql
create or replace function public.friend_suggestions(max_count int default 10)
returns table (id uuid, handle text, emoji text, profile_photo text, mutual_count int)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  my_neighbors as (
    select case when n.requester_id = (select uid from me) then n.addressee_id else n.requester_id end as nid
    from public.neighbors n
    where n.status = 'accepted'
      and ((select uid from me) in (n.requester_id, n.addressee_id))
  ),
  candidates as (
    select case when n.requester_id = mn.nid then n.addressee_id else n.requester_id end as cid
    from my_neighbors mn
    join public.neighbors n on n.status = 'accepted' and mn.nid in (n.requester_id, n.addressee_id)
  )
  select p.id, p.handle, p.emoji, p.profile_photo, count(*)::int as mutual_count
  from candidates c
  join public.public_profiles p on p.id = c.cid
  where c.cid <> (select uid from me)
    and c.cid not in (select nid from my_neighbors)
    and not public.is_blocked_between((select uid from me), c.cid)
  group by p.id, p.handle, p.emoji, p.profile_photo
  order by mutual_count desc
  limit max_count;
$$;
grant execute on function public.friend_suggestions(int) to authenticated;
```

- [ ] **Step 6: 사용하지 않는 함수 드롭**

```sql
drop function if exists public.accept_follow_request(uuid);
drop function if exists public.follow_list_of(uuid, text);
drop function if exists public.follower_counts(uuid[]);
drop function if exists public.following_counts(uuid[]);
drop function if exists public.is_private_account(uuid);
```

- [ ] **Step 7: 커밋**

```bash
git add supabase/schema.sql
git commit -m "feat(db): 이웃 RPC(accept/list/counts/suggestions), 구 follow RPC 제거"
```

---

### Task 3: posts / comments RLS를 이웃 기준으로 재작성 + is_private 제거

**Files:**
- Modify: `supabase/schema.sql` (posts_select, comments_select_visible, public_profiles 뷰, profiles.is_private)

- [ ] **Step 1: posts_select 재작성**

섹션 4-b의 posts_select 정책(is_private·follows 참조본)을 아래로 교체한다.

```sql
drop policy if exists "posts_select" on public.posts;
create policy "posts_select" on public.posts
  for select to authenticated using (
    not public.is_blocked_between(auth.uid(), posts.author_id)
    and (
      author_id = auth.uid()
      or (visibility = 'neighbors' and public.are_neighbors(auth.uid(), posts.author_id))
    )
  );
```

- [ ] **Step 2: comments_select_visible 재작성**

```sql
drop policy if exists "comments_select_visible" on public.comments;
create policy "comments_select_visible" on public.comments
  for select to authenticated using (
    exists (
      select 1 from public.posts p
      where p.id = comments.post_id
        and not public.is_blocked_between(auth.uid(), p.author_id)
        and (
          p.author_id = auth.uid()
          or (p.visibility = 'neighbors' and public.are_neighbors(auth.uid(), p.author_id))
        )
    )
  );
```

- [ ] **Step 3: public_profiles 뷰에서 is_private 제거**

`public_profiles` 뷰 정의에서 `is_private` 컬럼을 제거한다(뷰가 `select ... is_private ...`
형태면 해당 컬럼만 삭제). 뷰를 참조하는 조인은 컬럼명을 명시하므로 안전하다.

- [ ] **Step 4: profiles.is_private 컬럼 드롭**

`profiles` 테이블 정의에서 `is_private boolean ...` 컬럼 라인을 제거하고, 파일 하단에
멱등 드롭을 추가한다.

```sql
alter table public.profiles drop column if exists is_private;
```

- [ ] **Step 5: follow_requests / follows 테이블·트리거 정리**

`follow_requests` 테이블과 그 정책, `notify_on_follow` 등 follows 트리거, `follows` 테이블을
schema.sql에서 제거한다. 알림 타입 문자열(`follow`,`follow_request`,`follow_accept`)을 쓰는
곳이 있으면 `neighbor_request`,`neighbor_accept`로 정리한다.

```sql
drop table if exists public.follow_requests cascade;
drop table if exists public.follows cascade;
```

- [ ] **Step 6: 커밋**

```bash
git add supabase/schema.sql
git commit -m "feat(db): posts/comments RLS 이웃 기준 재작성, is_private·follows 제거"
```

---

### Task 4: 1회성 데이터 마이그레이션 SQL

**Files:**
- Create: `supabase/migration-2026-07-15-neighbors.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- ============================================================
-- 1회성 데이터 마이그레이션 (2026-07-15) — Supabase SQL 편집기에서 한 번만 실행
-- 팔로우 → 서로이웃 전환. schema.sql(최종형)을 먼저 실행한 뒤 이 파일을 실행한다.
-- ⚠️ 재실행 금지: 맞팔 이관은 on conflict로 멱등이나, 관계/공개범위 상태를 되돌릴 수 있다.
-- ============================================================

-- 1) 맞팔(양방향 follows)만 accepted 이웃으로 이관. 단방향 follows는 버린다.
--    (이 시점에 follows 테이블이 아직 존재해야 하므로, schema.sql의 follows drop보다
--     먼저 실행하거나, follows를 임시 보존한 상태에서 이 블록을 먼저 돌린다. 아래 순서 주석 참고)
insert into public.neighbors (requester_id, addressee_id, status)
select f1.follower_id, f1.following_id, 'accepted'
from public.follows f1
join public.follows f2
  on f2.follower_id = f1.following_id
 and f2.following_id = f1.follower_id
where f1.follower_id < f1.following_id
on conflict do nothing;

-- 2) 게시물 공개범위 이관: public·friends → neighbors, private 유지.
update public.posts
  set visibility = 'neighbors',
      data = jsonb_set(data, '{visibility}', '"neighbors"')
where visibility in ('public', 'friends');

-- 확인용(주석 해제해 실행):
-- select visibility, count(*) from public.posts group by visibility;
-- select count(*) from public.neighbors where status = 'accepted';
```

- [ ] **Step 2: 실행 순서 주석 명시**

파일 상단에 실행 순서를 적는다: **(a)** follows를 아직 드롭하지 않은 상태에서 이 마이그레이션의
1)·2)를 먼저 실행 → **(b)** 그다음 schema.sql 최종형(neighbors/RLS/RPC + follows·is_private 드롭)을
실행. 즉 "이관 먼저, 드롭 나중". 사용자에게 이 순서를 안내한다.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migration-2026-07-15-neighbors.sql
git commit -m "feat(db): 팔로우→이웃 1회성 마이그레이션(맞팔 자동 이웃·공개범위 이관)"
```

---

## Phase 2 — 서비스 · 스토어

### Task 5: `social.ts` 를 이웃 API로 교체

**Files:**
- Modify: `src/services/social.ts:13-376` (팔로우/요청/추천 블록)

- [ ] **Step 1: 관계 조회·변경 함수 교체**

`followUser`~`fetchFollowingCount`(라인 13–182)와 요청 블록(211–257)을 아래로 교체한다.
차단·미설정 가드는 기존과 동일 패턴 유지.

```ts
// ─── 이웃 (서로이웃) ───
export interface NeighborProfile {
  id: string;
  handle: string | null;
  emoji: string | null;
  photo: string | null; // 아바타 URL
}

// 이웃신청 — 상대가 이미 나에게 pending이면 자동 수락(양쪽 신청 → 즉시 서로이웃)
export async function requestNeighbor(targetId: string): Promise<void> {
  if (!supabase || !targetId) return;
  const uid = await getMyUserId();
  if (!uid || uid === targetId) return;
  // 반대 방향 pending이 있으면 수락으로 처리
  const { data: reverse } = await supabase
    .from('neighbors')
    .select('status')
    .eq('requester_id', targetId).eq('addressee_id', uid)
    .maybeSingle();
  if (reverse) { await acceptNeighbor(targetId); return; }
  const { error } = await supabase.from('neighbors')
    .insert({ requester_id: uid, addressee_id: targetId, status: 'pending' });
  if (error && error.code !== '23505') throw error;
}

export async function cancelNeighborRequest(targetId: string): Promise<void> {
  if (!supabase || !targetId) return;
  const uid = await getMyUserId();
  if (!uid) return;
  const { error } = await supabase.from('neighbors')
    .delete().eq('requester_id', uid).eq('addressee_id', targetId).eq('status', 'pending');
  if (error) throw error;
}

export async function acceptNeighbor(requesterId: string): Promise<void> {
  if (!supabase || !requesterId) return;
  const { error } = await supabase.rpc('accept_neighbor', { requester: requesterId });
  if (error) throw error;
}

export async function declineNeighbor(requesterId: string): Promise<void> {
  if (!supabase || !requesterId) return;
  const uid = await getMyUserId();
  if (!uid) return;
  const { error } = await supabase.from('neighbors')
    .delete().eq('requester_id', requesterId).eq('addressee_id', uid).eq('status', 'pending');
  if (error) throw error;
}

// 이웃 끊기 — accepted 관계 삭제 (양쪽 방향 어느 행이든)
export async function removeNeighbor(otherId: string): Promise<void> {
  if (!supabase || !otherId) return;
  const uid = await getMyUserId();
  if (!uid) return;
  const { error } = await supabase.from('neighbors')
    .delete()
    .or(`and(requester_id.eq.${uid},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${uid})`)
    .eq('status', 'accepted');
  if (error) throw error;
}

// 내 이웃 목록 (오류 시 null → 로컬 캐시 유지)
export async function fetchNeighbors(): Promise<NeighborProfile[] | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  try {
    const { data, error } = await supabase.rpc('neighbor_list_of', { target: uid });
    if (error) return null;
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id, handle: r.handle ?? null, emoji: r.emoji ?? null, photo: r.profile_photo ?? null,
    }));
  } catch { return null; }
}

// 타인 프로필의 이웃 목록
export const fetchNeighborsOf = (userId: string): Promise<NeighborProfile[] | null> =>
  (async () => {
    if (!supabase || !userId) return null;
    try {
      const { data, error } = await supabase.rpc('neighbor_list_of', { target: userId });
      if (error) return null;
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id, handle: r.handle ?? null, emoji: r.emoji ?? null, photo: r.profile_photo ?? null,
      }));
    } catch { return null; }
  })();

// 이웃 수 (오류 시 null)
export async function fetchNeighborCount(userId: string): Promise<number | null> {
  if (!supabase || !userId) return null;
  try {
    const { data, error } = await supabase.rpc('neighbor_counts', { ids: [userId] });
    if (error) return null;
    const row = (data as { user_id: string; neighbor_count: number }[] | null)?.[0];
    return row?.neighbor_count ?? 0;
  } catch { return null; }
}

// 내가 보낸 대기 신청 대상 id (버튼 '신청됨' 표시용)
export async function fetchMyOutgoingNeighborRequests(): Promise<string[] | null> {
  if (!supabase) return null;
  const uid = await getMyUserId();
  if (!uid) return null;
  try {
    const { data, error } = await supabase.from('neighbors')
      .select('addressee_id').eq('requester_id', uid).eq('status', 'pending');
    if (error) return null;
    return (data ?? []).map((r: any) => r.addressee_id as string);
  } catch { return null; }
}
```

- [ ] **Step 2: 받은 신청 목록 인터페이스 교체**

`IncomingFollowRequest`/`fetchIncomingFollowRequests`(260–292)를 교체한다.

```ts
export interface IncomingNeighborRequest {
  requesterId: string;
  handle: string | null;
  emoji: string | null;
  photo: string | null;
  createdAt: number;
}

export async function fetchIncomingNeighborRequests(): Promise<IncomingNeighborRequest[]> {
  if (!supabase) return [];
  const uid = await getMyUserId();
  if (!uid) return [];
  try {
    const { data, error } = await supabase
      .from('neighbors')
      .select('requester_id, created_at, profiles:public_profiles!neighbors_requester_id_fkey(handle, emoji, profile_photo)')
      .eq('addressee_id', uid).eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return (data as any[]).map((r) => {
      const p = r.profiles ?? {};
      return {
        requesterId: r.requester_id as string,
        handle: p.handle ?? null, emoji: p.emoji ?? null, photo: p.profile_photo ?? null,
        createdAt: new Date(r.created_at).getTime(),
      };
    });
  } catch { return []; }
}
```

- [ ] **Step 3: 차단 시 이웃 관계 정리**

`blockUser`에 차단 대상과의 neighbors 행 삭제를 추가한다(차단해도 서로 이웃 목록에 남는 것 방지).
RLS(posts_select)의 `not is_blocked_between`이 노출은 이미 막지만, 목록 표시 일관성을 위해 정리.

```ts
// blockUser 내부, blocks insert 성공 뒤
await supabase.from('neighbors')
  .delete()
  .or(`and(requester_id.eq.${uid},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${uid})`);
```

- [ ] **Step 4: 알림 타입·추천 인터페이스 정리**

- `FollowNotificationType`을 `'neighbor_request' | 'neighbor_accept'`로, `fetchFollowNotifications`의
  `.in('type', [...])`도 동일 값으로 변경(함수명은 `fetchNeighborNotifications`로).
- `FriendSuggestion`에서 `isPrivate` 필드와 매핑(`is_private`) 제거. `fetchFriendSuggestions`의
  결과 매핑에서 `isPrivate` 줄 삭제.

- [ ] **Step 5: 검증**

```bash
npx tsc --noEmit
```
Expected: social.ts 자체는 통과. (호출부 미변경으로 다른 파일에서 에러가 남는 것은 Task 6–13에서 해소)

- [ ] **Step 6: 커밋**

```bash
git add src/services/social.ts
git commit -m "feat(social): 팔로우 API를 이웃(서로이웃) API로 교체"
```

---

### Task 6: is_private 클라이언트 참조 제거

**Files:**
- Modify: `src/services/profile.ts`, `src/components/ProfileSync.tsx`, `src/hooks/useAccountBoundary.ts`, `src/store/settingsStore.tsx`(있으면)

- [ ] **Step 1: is_private 읽기/쓰기 제거**

각 파일에서 `is_private`/`isPrivate` 참조를 찾아 제거한다.
- 프로필 upsert/select에서 `is_private` 컬럼 제거
- settingsStore의 계정 공개 여부 상태·세터 제거(있으면)

Run(참조 위치 확인): `rg -n "is_private|isPrivate" src`

- [ ] **Step 2: 검증**

```bash
npx tsc --noEmit
```
Expected: 위 파일들에서 is_private 관련 에러 없음(설정 화면 토글은 Task 12에서 제거).

- [ ] **Step 3: 커밋**

```bash
git add src/services/profile.ts src/components/ProfileSync.tsx src/hooks/useAccountBoundary.ts src/store/settingsStore.tsx
git commit -m "refactor: is_private(비공개 계정) 클라이언트 참조 제거"
```

---

### Task 7: `recordStore` — Visibility 2값 + 관계 상태·액션 교체

**Files:**
- Modify: `src/store/recordStore.tsx:39`(Visibility), 관계 상태·액션·컨텍스트 타입

- [ ] **Step 1: Visibility 타입 축소**

```ts
// recordStore.tsx:39
export type Visibility = 'private' | 'neighbors';
```

- [ ] **Step 2: 관계 상태 이름·타입 교체**

`followingUsers`→`neighbors`, `pendingFollowRequests`→`outgoingNeighborRequests` 로 상태를
바꾸고, 받은 신청 `incomingNeighborRequests` 상태를 추가한다. persist 페이로드(`RecordPersistPayload`)의
`followingUsers` 키도 `neighbors`로 바꾸고, hydrate 시 구 키 폴백을 둔다.

```ts
// hydrate 폴백 예 (usePersistence의 복원 콜백 안)
setNeighbors(Array.isArray(p.neighbors) ? p.neighbors : (Array.isArray((p as any).followingUsers) ? (p as any).followingUsers : []));
```

- [ ] **Step 3: 액션 교체**

컨텍스트 인터페이스와 구현에서 아래로 교체(호출부 시그니처는 Task 8–11에서 맞춘다):
- `followUser/unfollowUser` → `requestNeighbor(id)/removeNeighbor(id)`
- `requestFollow/cancelFollowRequest` → `requestNeighbor(id)/cancelNeighborRequest(id)`
- `acceptFollowRequest/declineFollowRequest`(있으면) → `acceptNeighbor(id)/declineNeighbor(id)`
- `setFollowMutual` 제거
- `refreshFollowing` → `refreshNeighbors` (내부에서 `fetchNeighbors` + `fetchMyOutgoingNeighborRequests`)
- `isFollowRequested(id)` → `isNeighborRequested(id)` (outgoingNeighborRequests 기준)
- 신규 헬퍼 `isNeighbor(id)` (neighbors 기준)

각 액션은 기존 낙관적 업데이트 + `.catch(notifySyncError)` 패턴을 유지하고, import를
`../services/social`의 새 함수명으로 교체한다.

- [ ] **Step 4: 가져온 앨범 기본 공개범위**

`addImportedAlbum`의 `visibility: 'friends'` → `visibility: 'neighbors'`로 변경
(hydrate의 `rec-import-*` 보정도 `'friends'`→`'neighbors'`로).

- [ ] **Step 5: 검증**

```bash
npx tsc --noEmit
```
Expected: recordStore 내부는 통과, 호출 화면들에서 이름 불일치 에러가 남음(Task 8–13에서 해소).

- [ ] **Step 6: 커밋**

```bash
git add src/store/recordStore.tsx
git commit -m "feat(store): Visibility 2값·이웃 관계 상태/액션 교체"
```

---

## Phase 3 — 화면

> 각 화면 Task는 **먼저 현재 코드를 읽고**(Read), 팔로우 관련 심볼·라벨을 이웃으로 교체한다.
> 라벨 문자열은 i18n 키를 통하므로(Task 14) 여기서는 store/service 심볼과 상태머신만 맞춘다.

### Task 8: FriendProfileScreen — 이웃신청/신청됨/이웃 버튼 + 이웃 수

**Files:**
- Modify: `src/screens/FriendProfileScreen.tsx`

- [ ] **Step 1: 관계 상태머신 교체**

useRecords 구조분해에서 `followingUsers, followUser, unfollowUser, setFollowMutual,
requestFollow, cancelFollowRequest, isFollowRequested`를 `neighbors, requestNeighbor,
removeNeighbor, cancelNeighborRequest, isNeighbor, isNeighborRequested`로 교체.
버튼 상태를 3-state로: **이웃 아님→이웃신청 / 신청 보냄→신청됨(취소) / 이웃→이웃(끊기)**.

```ts
const neighborState: 'none' | 'requested' | 'neighbor' =
  isNeighbor(realId) ? 'neighbor' : isNeighborRequested(realId) ? 'requested' : 'none';
const onNeighborPress = () => {
  if (neighborState === 'none') requestNeighbor(realId);
  else if (neighborState === 'requested') cancelNeighborRequest(realId);
  else Alert.alert(t('friends.removeNeighborTitle'), t('friends.removeNeighborMsg'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('friends.removeNeighbor'), style: 'destructive', onPress: () => removeNeighbor(realId) },
  ]);
};
```

- [ ] **Step 2: 카운트 교체 — 팔로워/팔로잉 → 이웃 수 1개**

`fetchFollowerCount`/`fetchFollowingCount` 두 호출을 `fetchNeighborCount(userId)` 하나로 교체.
프로필 통계 3개(여행수·팔로워·팔로잉)를 **여행수·이웃**으로(또는 2개+빈칸 정리). `followerCount`/
`followingCount` 상태를 `neighborCount` 하나로.

- [ ] **Step 3: 검증 + 커밋**

```bash
npx tsc --noEmit
git add src/screens/FriendProfileScreen.tsx
git commit -m "feat(friends): 프로필 이웃신청 버튼·이웃 수"
```

---

### Task 9: FollowerListScreen — 이웃 1목록 + 받은 신청

**Files:**
- Modify: `src/screens/FollowerListScreen.tsx` (파일명은 유지, 내용만 이웃 목록으로)

- [ ] **Step 1: 데이터 소스 교체**

`fetchFollowers`/`fetchFollowing` 2탭 구조를 제거하고, `fetchNeighborsOf(userId)`(또는 본인은
`fetchNeighbors`)로 **단일 이웃 목록**을 로드. 상단에 `fetchIncomingNeighborRequests`로 **받은
이웃신청** 섹션(수락/거절 버튼: `acceptNeighbor`/`declineNeighbor`).

- [ ] **Step 2: 항목 액션 교체**

- 맞팔 버튼 제거(모든 항목이 이웃)
- "팔로워 제거(X)" → "이웃 끊기": `removeNeighbor(id)`
- 수락 시 목록 즉시 반영(요청 섹션에서 제거 + 이웃 목록에 추가)

- [ ] **Step 3: 검증 + 커밋**

```bash
npx tsc --noEmit
git add src/screens/FollowerListScreen.tsx
git commit -m "feat(friends): 이웃 목록 + 받은 이웃신청 화면"
```

---

### Task 10: FriendSearchScreen — 이웃신청 버튼

**Files:**
- Modify: `src/screens/FriendSearchScreen.tsx`

- [ ] **Step 1: 액션 교체**

검색·추천 결과의 팔로우 버튼을 이웃신청으로: `requestNeighbor`/`isNeighborRequested`/`isNeighbor`
기반 3-state. `FriendSuggestion.isPrivate` 분기(팔로우 vs 요청) 제거 — 항상 이웃신청.

- [ ] **Step 2: 검증 + 커밋**

```bash
npx tsc --noEmit
git add src/screens/FriendSearchScreen.tsx
git commit -m "feat(friends): 검색·추천 이웃신청 버튼"
```

---

### Task 11: NotificationScreen — 이웃신청/수락 알림

**Files:**
- Modify: `src/screens/NotificationScreen.tsx`

- [ ] **Step 1: 알림 타입·수락 액션 교체**

`fetchFollowNotifications`→`fetchNeighborNotifications`, 타입 `follow/follow_request/follow_accept`
→ `neighbor_request/neighbor_accept`. 신청 알림에서 수락 버튼 → `acceptNeighbor(actorId)`.
문구는 i18n 키로(Task 14).

- [ ] **Step 2: 검증 + 커밋**

```bash
npx tsc --noEmit
git add src/screens/NotificationScreen.tsx
git commit -m "feat(notif): 이웃신청·수락 알림"
```

---

### Task 12: 작성 화면 공개범위 2단계 + 설정 비공개 토글 제거

**Files:**
- Modify: `src/screens/NewRecordScreen.tsx`, `src/screens/BlogRecordScreen.tsx`, `src/screens/CutTravelInfoScreen.tsx`, `src/screens/SnapRecordScreen.tsx`, `src/screens/AccountSettingsScreen.tsx`

- [ ] **Step 1: 공개범위 옵션 2개로**

각 작성 화면의 `VISIBILITY_OPTIONS`(또는 동등물)를 2개로, 기본값 `'neighbors'`.

```ts
const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'neighbors', label: `🏡 ${t('newRecord.visNeighbors')}` },
  { value: 'private',   label: `🔒 ${t('newRecord.visPrivate')}` },
];
// useState<Visibility>(editRecord?.visibility ?? 'neighbors')
// SnapRecordScreen의 하드코딩 visibility: 'friends' → 'neighbors'
```

`'public'`/`'friends'`를 참조하던 초기값·비교를 `'neighbors'`로 정리한다.

- [ ] **Step 2: 설정 비공개 계정 토글 제거**

`AccountSettingsScreen.tsx`에서 계정 공개/비공개 토글 UI와 관련 상태·핸들러를 제거한다
(`is_private` 세팅 저장 로직 포함).

- [ ] **Step 3: 검증 + 커밋**

```bash
npx tsc --noEmit
git add src/screens/NewRecordScreen.tsx src/screens/BlogRecordScreen.tsx src/screens/CutTravelInfoScreen.tsx src/screens/SnapRecordScreen.tsx src/screens/AccountSettingsScreen.tsx
git commit -m "feat(record): 공개범위 이웃만/나만보기 2단계, 비공개 토글 제거"
```

---

### Task 13: 피드 필터 정리 (SocialScreen · SocialExploreScreen · PostDetailScreen)

**Files:**
- Modify: `src/screens/SocialScreen.tsx:2422`, `src/screens/SocialExploreScreen.tsx:152`, `src/screens/PostDetailScreen.tsx:1228`

- [ ] **Step 1: visibility 비교 교체**

- SocialScreen `allVisible` 필터: `(r.visibility === 'friends' || r.visibility === 'public')`
  → `r.visibility === 'neighbors'`.
- PostDetailScreen 동일 패턴 교체.
- SocialExploreScreen: `r.visibility === 'public'` → `r.visibility === 'neighbors'`
  (탐색도 닫힌 피드이므로 이웃 글 기준. 서버 RLS가 실제 게이트이며 클라 필터는 표시 일관성용).

- [ ] **Step 2: 검증 + 커밋**

```bash
npx tsc --noEmit
git add src/screens/SocialScreen.tsx src/screens/SocialExploreScreen.tsx src/screens/PostDetailScreen.tsx
git commit -m "feat(feed): 피드·탐색 필터를 이웃 공개범위 기준으로"
```

---

## Phase 4 — 배지 · i18n · 검증

### Task 14: 배지·i18n 문구 정리

**Files:**
- Modify: `src/utils/badgeRules.ts`, `src/utils/badgeRules.verify.ts`, `src/i18n/locales/ko.ts`, `src/i18n/locales/en.ts`

- [ ] **Step 1: 배지 옵션 이름 변경**

`badgeRules.ts`의 `mutualFriendCount` → `neighborCount`(주석 "맞팔"→"이웃"), 임계값 로직 유지.
호출부(`useBadgeEarning.ts`)에서 옵션 전달 이름을 맞춘다.

- [ ] **Step 2: verify 갱신**

`badgeRules.verify.ts`의 `mutualFriendCount` 참조를 `neighborCount`로 바꾸고 실행.

Run: `npx tsx src/utils/badgeRules.verify.ts`
Expected: 모든 assert 통과.

- [ ] **Step 3: i18n 키 정리**

`ko.ts`/`en.ts`에서 아래를 정리한다.
- 공개범위: `visPublic`(제거), `visFriends`→`visNeighbors`('이웃만'/'Neighbors'), `visPrivate`('나만 보기'/'Only me') 유지
- 관계: `followBack`,`mutualYes`,`mutualMark`,`followersTitle`,`noFollowers` 등 → 이웃 문구
- 신규 키: `neighborRequest`('이웃신청'), `neighborRequested`('신청됨'), `neighbor`('이웃'),
  `removeNeighbor`('이웃 끊기'), `removeNeighborTitle`,`removeNeighborMsg`, `acceptNeighbor`('수락'),
  `declineNeighbor`('거절'), `incomingRequests`('받은 이웃신청') — ko/en 양쪽

- [ ] **Step 4: 검증 + 커밋**

```bash
npx tsc --noEmit
git add src/utils/badgeRules.ts src/utils/badgeRules.verify.ts src/i18n/locales/ko.ts src/i18n/locales/en.ts
git commit -m "feat(i18n): 이웃 문구·공개범위 2단계, 배지 이웃 수 라벨"
```

---

### Task 15: 전체 타입 체크 + 수동 플로우 검증

**Files:** (없음 — 검증 전용)

- [ ] **Step 1: 전체 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 2: 잔여 참조 스캔**

Run: `rg -n "follow|Follow|is_private|isPrivate|mutual|'public'|'friends'" src --glob '!**/*.verify.ts'`
Expected: 남은 결과는 전부 의도된 것(예: 무관한 'follow' 단어)인지 눈으로 확인. 관계/공개범위
관련 잔재가 없어야 함.

- [ ] **Step 3: 서버 적용 안내**

사용자에게 순서 안내: **(1)** `migration-2026-07-15-neighbors.sql`의 이관 블록 실행(follows 존재
상태) → **(2)** `schema.sql` 최종형 실행(neighbors/RLS/RPC + follows·is_private 드롭).

- [ ] **Step 4: 수동 플로우 검증 (실기기 2계정)**

- A가 B에게 이웃신청 → B 알림에 신청 표시 → B 수락 → 서로 이웃 목록에 상호 노출
- A의 '이웃만' 기록이 B 피드·프로필에 노출, 비이웃 C에게는 안 보임
- '나만보기' 기록은 본인만
- 이웃 끊기 → 양쪽 목록에서 사라지고 상대 '이웃만' 글이 서로 안 보임
- 양쪽이 동시에 신청 → 자동 서로이웃(신청됨이 아니라 바로 이웃)

- [ ] **Step 5: 완료 커밋(문서 상태 갱신 등, 코드 변경 없으면 생략)**

---

## 롤아웃 노트

- 단방향 팔로우였던 관계는 마이그레이션에서 소멸 → 사용자에게 "이웃을 다시 추가해 주세요" 안내
  (출시 노트/공지).
- 기존 전체공개 글은 이웃만으로 축소되어 비이웃에게 안 보이게 됨(의도된 닫힌 피드).
- 서버 SQL은 1회 실행, 재실행 금지(관계·공개범위 상태 훼손 위험).
