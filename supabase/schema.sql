-- ============================================================
-- eOrth 백엔드 스키마 (Supabase / PostgreSQL)
--
-- 적용 방법:
--   1) Supabase 대시보드 > SQL Editor > New query
--   2) 이 파일 전체를 붙여넣고 Run
--   3) Storage > New bucket 으로 'media' 버킷 생성 (Public 체크)
--      (또는 아래 storage 섹션의 SQL이 자동 생성)
--
-- 멱등(idempotent)하게 작성되어 여러 번 실행해도 안전합니다.
-- 단계별로 테이블이 추가됩니다: 1) profiles  2) posts  3) neighbors/likes/comments  4) dm
-- ============================================================

-- 공통: updated_at 자동 갱신 트리거 함수
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- ============================================================
-- 1) profiles — 사용자 정체성 (auth.users 1:1)
-- ============================================================
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  handle        text unique,
  emoji         text default '🧳',
  bio           text default '',
  birthday      date,
  gender        text,
  profile_photo text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- 장기체류: 진행 중 체류 국가(ISO)와 상태. 이웃 프로필 위치 표시용(public_profiles 뷰 공개).
  stay_country  text,                              -- ISO 국가 코드 (예: 'KR')
  stay_status   text                               -- 'active' | null
);

-- (기존 테이블 대비) 거주 국가 코드 컬럼. 소유자 전용 — public_profiles 뷰에는 포함하지 않는다.
alter table public.profiles add column if not exists country text;

-- 아이디 표시 폰트(프리미엄 기능) — 타인 화면(프로필·피드)에서도 렌더돼야 하므로 공개 컬럼
alter table public.profiles add column if not exists handle_font text;

-- (2026-07-16) 장기체류 — 진행 중 체류의 국가(ISO)와 상태. 이웃 프로필 위치 표시용.
alter table public.profiles add column if not exists stay_country text;
alter table public.profiles add column if not exists stay_status text; -- 'active' | null

-- 닉네임 폐지: 표시 이름은 handle(아이디)로 통일한다.
-- 뷰/RPC가 nickname 컬럼에 의존하므로 컬럼 삭제 전에 먼저 제거한다(아래에서 nickname 없이 재생성).
drop view if exists public.public_profiles;
drop function if exists public.find_users_by_phone_hashes(text[]);
alter table public.profiles drop column if exists nickname;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

create index if not exists idx_profiles_handle on public.profiles (lower(handle));

alter table public.profiles enable row level security;

-- 테이블 직접 조회는 '본인 행'만 — 타인 프로필은 public_profiles 뷰(PII 제외)로만 조회한다.
-- (기존 profiles_select_all using(true)는 임의 인증 사용자가 REST로 전 사용자의
--  birthday/gender/country 를 수집할 수 있는 구멍이었다. 피드·검색의 타인 표시는
--  아래 public_profiles(definer 뷰) 임베드로 대체 — 클라이언트 select 문자열 참조.)
drop policy if exists "profiles_select_all" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (auth.uid() = id);

-- 본인 프로필만 생성/수정
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- 타인에게 노출할 '공개 컬럼만' 담은 뷰. RLS는 컬럼 단위 제한이 안 되므로
-- birthday·gender 같은 PII를 빼고 이 뷰로 타인 프로필을 조회한다.
-- profiles 테이블 자체는 본인 행만 select 가능해졌으므로, 이 뷰는 definer
-- (security_invoker=false, 소유자 권한으로 RLS 우회)여야 타인 행이 보인다 —
-- 노출 컬럼이 여기 나열된 공개 컬럼으로 한정되므로 안전하다.
-- (본인 전체 프로필은 기존 profiles 테이블에서 직접 조회.)
create or replace view public.public_profiles
  with (security_invoker = false) as
  select id, handle, emoji, bio, profile_photo, created_at, handle_font
  from public.profiles;

grant select on public.public_profiles to authenticated;
-- Supabase 기본 권한(default privileges)이 새 뷰에 anon select를 자동 부여한다 —
-- definer 뷰라 RLS 우회가 '비로그인'까지 적용되므로 반드시 회수한다(실서버 확인됨).
revoke select on public.public_profiles from anon;

-- 아이디(handle) 사용 가능 여부 — 본인(auth.uid()) 제외 중복이 없으면 true.
-- 온보딩·프로필 편집에서 실시간 중복 검사에 사용(최종 방어는 handle UNIQUE 제약).
create or replace function public.is_handle_available(h text)
returns boolean
language sql security definer set search_path = public as $$
  select not exists (
    select 1 from public.profiles
    where lower(handle) = lower(h) and id <> auth.uid()
  );
$$;
grant execute on function public.is_handle_available(text) to authenticated;

-- 아이디(handle) → 이메일 조회. 아이디 로그인 시 Edge Function(login-with-identifier)이
-- service_role 로만 호출한다. anon/authenticated 에는 권한을 주지 않아 이메일이 클라이언트에
-- 노출되지 않는다(공개된 아이디로 타인 이메일 수집 방지).
create or replace function public.email_for_handle(h text)
returns text
language sql security definer set search_path = public as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.handle) = lower(h)
  limit 1;
$$;
revoke all on function public.email_for_handle(text) from public;
revoke all on function public.email_for_handle(text) from anon;
revoke all on function public.email_for_handle(text) from authenticated;
grant execute on function public.email_for_handle(text) to service_role;

-- 가입 시 빈 프로필 자동 생성 (클라이언트 upsert와 병행, 어느 쪽이든 안전)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- (선택·수동) 가입 도중 이탈로 남은 '반쪽 계정' 정리.
-- 이메일 인증을 끝내지 않고 방치된 계정만 대상(OAuth 계정은 인증 완료라 제외), 게시물 있으면 제외.
-- 관리자/서비스롤이 필요 시 실행하거나 pg_cron으로 스케줄:  select public.cleanup_unconfirmed_accounts();
-- (auth.users 삭제 → profiles 등 on delete cascade로 함께 정리)
create or replace function public.cleanup_unconfirmed_accounts(older_than interval default interval '7 days')
returns integer language plpgsql security definer set search_path = public, auth as $$
declare
  n integer := 0;
begin
  delete from auth.users u
  where u.email_confirmed_at is null
    and u.created_at < now() - older_than
    and not exists (select 1 from public.posts p where p.author_id = u.id);
  get diagnostics n = row_count;
  return n;
end; $$;

-- 일반 사용자는 실행 불가(관리자/서비스롤 전용)
revoke all on function public.cleanup_unconfirmed_accounts(interval) from public, anon, authenticated;

-- ============================================================
-- 2) posts — 여행 기록(게시물). 본문은 JSONB(TravelRecord)로 저장.
--    사진은 Storage 업로드 후 공개 URL로 치환되어 data 안에 들어간다.
-- ============================================================
create table if not exists public.posts (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null references public.profiles(id) on delete cascade,
  visibility     text not null default 'neighbors', -- public|neighbors|private 중 neighbors/private만 사용 (기본 neighbors)
  view_type      text,                              -- feed | blog | cut | snap | album
  country_name   text,
  data           jsonb not null,                    -- TravelRecord 전체 (미디어는 공개 URL)
  likes_count    int  not null default 0,
  comments_count int  not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists trg_posts_updated on public.posts;
create trigger trg_posts_updated before update on public.posts
  for each row execute function public.set_updated_at();

-- 발행 멱등성: 오프라인 재동기화·불안정 네트워크 재시도가 같은 기록을 다시 발행해도
-- 중복 게시물이 생기지 않도록, 클라이언트 기록 id를 저장하고 작성자별 유일성을 강제한다.
-- (충돌(23505) 시 클라이언트는 기존 게시물 id를 회수해 remoteId로 연결)
alter table public.posts add column if not exists client_id text;
create unique index if not exists uq_posts_author_client
  on public.posts (author_id, client_id) where client_id is not null;

create index if not exists idx_posts_author   on public.posts (author_id);
create index if not exists idx_posts_created   on public.posts (created_at desc);
create index if not exists idx_posts_visibility on public.posts (visibility);

alter table public.posts enable row level security;

-- 조회 초기 정의: 공개글은 누구나 / 본인글은 항상.
-- (neighbors 가시성·차단을 포함한 최종 posts_select 정책은 are_neighbors·is_blocked_between
--  정의 이후 파일 하단에서 다시 교체된다. 여기서 neighbors를 참조하지 않는 이유는
--  are_neighbors가 아직 정의되기 전이기 때문.)
drop policy if exists "posts_select" on public.posts;
create policy "posts_select" on public.posts
  for select to authenticated using (
    visibility = 'public'
    or author_id = auth.uid()
  );

drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own" on public.posts
  for insert to authenticated with check (author_id = auth.uid());

drop policy if exists "posts_update_own" on public.posts;
create policy "posts_update_own" on public.posts
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists "posts_delete_own" on public.posts;
create policy "posts_delete_own" on public.posts
  for delete to authenticated using (author_id = auth.uid());

-- ============================================================
-- 3) post_likes / comments
--    (서로이웃(neighbors) 테이블·정책은 차단 함수 의존성 때문에 4-b 섹션에서 정의)
-- ============================================================
-- 좋아요
create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_likes enable row level security;

drop policy if exists "likes_select_all" on public.post_likes;
create policy "likes_select_all" on public.post_likes
  for select to authenticated using (true);

drop policy if exists "likes_insert_own" on public.post_likes;
create policy "likes_insert_own" on public.post_likes
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "likes_delete_own" on public.post_likes;
create policy "likes_delete_own" on public.post_likes
  for delete to authenticated using (user_id = auth.uid());

-- 좋아요 수 동기화 트리거
create or replace function public.sync_likes_count()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    update public.posts set likes_count = likes_count + 1 where id = new.post_id;
  elsif (tg_op = 'DELETE') then
    update public.posts set likes_count = greatest(0, likes_count - 1) where id = old.post_id;
  end if;
  return null;
end; $$;

drop trigger if exists trg_likes_count on public.post_likes;
create trigger trg_likes_count after insert or delete on public.post_likes
  for each row execute function public.sync_likes_count();

-- 댓글
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  parent_id  uuid references public.comments(id) on delete cascade,
  text       text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_comments_post on public.comments (post_id, created_at);

alter table public.comments enable row level security;

-- 댓글 조회는 '해당 게시물을 볼 수 있는 사용자'로 제한 (posts 가시성과 동일).
-- 기존 select_all(true)는 비공개/neighbors 글의 댓글 내용·작성자를 전원에게 노출했다.
-- (are_neighbors·차단을 포함한 최종 정책은 파일 하단에서 다시 교체된다. 여기서는
--  are_neighbors 정의 이전이라 public/본인 글만 참조하는 초기 정의를 둔다.)
drop policy if exists "comments_select_all" on public.comments;
drop policy if exists "comments_select_visible" on public.comments;
create policy "comments_select_visible" on public.comments
  for select to authenticated using (
    exists (
      select 1 from public.posts p
      where p.id = comments.post_id
        and (
          p.visibility = 'public'
          or p.author_id = auth.uid()
        )
    )
  );

drop policy if exists "comments_insert_own" on public.comments;
create policy "comments_insert_own" on public.comments
  for insert to authenticated with check (author_id = auth.uid());

drop policy if exists "comments_delete_own" on public.comments;
create policy "comments_delete_own" on public.comments
  for delete to authenticated using (author_id = auth.uid());

create or replace function public.sync_comments_count()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    update public.posts set comments_count = comments_count + 1 where id = new.post_id;
  elsif (tg_op = 'DELETE') then
    update public.posts set comments_count = greatest(0, comments_count - 1) where id = old.post_id;
  end if;
  return null;
end; $$;

drop trigger if exists trg_comments_count on public.comments;
create trigger trg_comments_count after insert or delete on public.comments
  for each row execute function public.sync_comments_count();

-- 댓글 좋아요
create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table public.comment_likes enable row level security;

drop policy if exists "comment_likes_select_all" on public.comment_likes;
create policy "comment_likes_select_all" on public.comment_likes
  for select to authenticated using (true);

drop policy if exists "comment_likes_insert_own" on public.comment_likes;
create policy "comment_likes_insert_own" on public.comment_likes
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "comment_likes_delete_own" on public.comment_likes;
create policy "comment_likes_delete_own" on public.comment_likes
  for delete to authenticated using (user_id = auth.uid());

-- ============================================================
-- 3-b) RPC: 친구 찾기 결과의 방문 국가 수
--   여러 사용자의 '비공개가 아닌' 게시물에서 서로 다른 country_name 개수를 집계.
--   SECURITY DEFINER 로 RLS를 우회해 공개 프로필 통계처럼 일관된 값을 돌려준다.
-- ============================================================
create or replace function public.profile_country_counts(ids uuid[])
returns table (author_id uuid, country_count int)
language sql security definer set search_path = public as $$
  select p.author_id, count(distinct p.country_name)::int as country_count
  from public.posts p
  where p.author_id = any(ids)
    and p.country_name is not null and p.country_name <> ''
    and p.visibility <> 'private'
  group by p.author_id;
$$;

grant execute on function public.profile_country_counts(uuid[]) to authenticated;

-- ============================================================
-- 3-c) RPC: 친구 찾기 결과의 서로이웃 수 → neighbor_counts
--   neighbors 테이블 정의(4-b) 이후에 만들어야 하므로(함수 본문이 테이블을 참조),
--   해당 함수는 neighbors 테이블 아래(4-b)에 정의한다.
-- ============================================================

-- ============================================================
-- 4) DM — 1:1 대화 + 메시지 (실시간은 dm_messages를 Realtime publication에 추가)
-- ============================================================
create table if not exists public.dm_threads (
  id        uuid primary key default gen_random_uuid(),
  user_a    uuid not null references public.profiles(id) on delete cascade,
  user_b    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- 항상 작은 uuid가 user_a 가 되도록 정렬해 쌍의 유일성 보장
  unique (user_a, user_b),
  check (user_a < user_b)
);
alter table public.dm_threads enable row level security;

drop policy if exists "threads_select_participant" on public.dm_threads;
create policy "threads_select_participant" on public.dm_threads
  for select to authenticated using (auth.uid() in (user_a, user_b));

drop policy if exists "threads_insert_participant" on public.dm_threads;
create policy "threads_insert_participant" on public.dm_threads
  for insert to authenticated with check (auth.uid() in (user_a, user_b));

create table if not exists public.dm_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.dm_threads(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  type       text not null default 'text',  -- text | image | record
  text       text default '',
  image_url  text,
  record     jsonb,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists idx_dm_messages_thread on public.dm_messages (thread_id, created_at);

alter table public.dm_messages enable row level security;

-- 메시지는 스레드 참여자만 조회/전송
drop policy if exists "messages_select_participant" on public.dm_messages;
create policy "messages_select_participant" on public.dm_messages
  for select to authenticated using (exists (
    select 1 from public.dm_threads t
    where t.id = dm_messages.thread_id and auth.uid() in (t.user_a, t.user_b)
  ));

drop policy if exists "messages_insert_sender" on public.dm_messages;
create policy "messages_insert_sender" on public.dm_messages
  for insert to authenticated with check (
    sender_id = auth.uid() and exists (
      select 1 from public.dm_threads t
      where t.id = dm_messages.thread_id and auth.uid() in (t.user_a, t.user_b)
    )
  );

-- 차단
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
alter table public.blocks enable row level security;

drop policy if exists "blocks_all_own" on public.blocks;
create policy "blocks_all_own" on public.blocks
  for all to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- ============================================================
-- 4-b) 차단의 서버단 강제 (RLS) — UI뿐 아니라 API 단에서도 차단 적용
--   차단 관계(양방향: 내가 차단했거나 / 당했거나)면 서로의 게시물·댓글을 못 보고 DM도 막힌다.
--   blocks 는 RLS(본인 행만 조회)라 정책 안에서 양방향을 보려면 SECURITY DEFINER 함수로 우회한다.
--   blocks 테이블이 위에서 먼저 생성된 뒤 이 섹션이 와야 하므로 여기(섹션 4 끝)에 둔다.
--   기존 posts/comments/DM 정책을 drop+recreate 하므로 schema 재실행 시 마지막 정의(차단 포함)가 적용된다.
-- ============================================================
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

-- ============================================================
-- 서로이웃 관계 (양방향·수락제). accepted 행 1개가 두 사람의 대칭 관계를 의미.
-- is_blocked_between(neighbors_insert_own에서 참조)이 위에서 정의된 뒤라야 하고,
-- are_neighbors 함수 본문이 이 테이블을 참조(check_function_bodies 기본 on에서 검증)하므로
-- 테이블을 함수보다 먼저 만든다.
-- ============================================================
create table if not exists public.neighbors (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending',   -- 'pending' | 'accepted'
  created_at   timestamptz not null default now(),
  primary key (requester_id, addressee_id)
);
create index if not exists idx_neighbors_addressee on public.neighbors (addressee_id);
create index if not exists idx_neighbors_status on public.neighbors (status);

-- 서로이웃(neighbor) 판정 — accepted 관계면 true. SECURITY DEFINER로 정책 안에서 일관 조회.
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

alter table public.neighbors enable row level security;

drop policy if exists "neighbors_select_own" on public.neighbors;
create policy "neighbors_select_own" on public.neighbors
  for select to authenticated using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists "neighbors_insert_own" on public.neighbors;
create policy "neighbors_insert_own" on public.neighbors
  for insert to authenticated with check (
    requester_id = auth.uid() and not public.is_blocked_between(auth.uid(), addressee_id)
  );

drop policy if exists "neighbors_update_addressee" on public.neighbors;
create policy "neighbors_update_addressee" on public.neighbors
  for update to authenticated using (addressee_id = auth.uid()) with check (addressee_id = auth.uid());

drop policy if exists "neighbors_delete_own" on public.neighbors;
create policy "neighbors_delete_own" on public.neighbors
  for delete to authenticated using (requester_id = auth.uid() or addressee_id = auth.uid());

-- posts: 차단 관계면 공개글이라도 안 보이게 (본인 글은 is_blocked_between(me,me)=false 라 영향 없음)
-- + neighbors 가시성 글은 서로이웃(또는 본인)만 볼 수 있다.
drop policy if exists "posts_select" on public.posts;
create policy "posts_select" on public.posts
  for select to authenticated using (
    not public.is_blocked_between(auth.uid(), posts.author_id)
    and (
      author_id = auth.uid()
      or (visibility = 'neighbors' and public.are_neighbors(auth.uid(), posts.author_id))
    )
  );

-- comments: 글 가시성은 posts와 동일 규칙으로 판정 — 차단·서로이웃 포함.
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

-- DM: 차단 관계면 스레드 생성·메시지 전송·조회를 모두 차단
drop policy if exists "threads_select_participant" on public.dm_threads;
create policy "threads_select_participant" on public.dm_threads
  for select to authenticated using (
    auth.uid() in (user_a, user_b)
    and not public.is_blocked_between(user_a, user_b)
  );

drop policy if exists "threads_insert_participant" on public.dm_threads;
create policy "threads_insert_participant" on public.dm_threads
  for insert to authenticated with check (
    auth.uid() in (user_a, user_b)
    and not public.is_blocked_between(user_a, user_b)
  );

drop policy if exists "messages_select_participant" on public.dm_messages;
create policy "messages_select_participant" on public.dm_messages
  for select to authenticated using (exists (
    select 1 from public.dm_threads t
    where t.id = dm_messages.thread_id
      and auth.uid() in (t.user_a, t.user_b)
      and not public.is_blocked_between(t.user_a, t.user_b)
  ));

-- 좋아요 조회를 '해당 게시물/댓글을 볼 수 있는 사용자'로 제한 — 3)의 select_all(true)은
-- private/friends 글의 좋아요(user_id·post_id 쌍)를 글을 못 보는 사용자도 전수 조회할 수
-- 있게 했다(게시물 존재·상호작용 관계 추론 가능). 서브쿼리에 posts/comments RLS가 그대로
-- 적용되므로 "내게 보이는 글"의 좋아요만 보인다. (여기서 교체 — posts 최종 정책 정의 이후)
drop policy if exists "likes_select_all" on public.post_likes;
drop policy if exists "likes_select_visible" on public.post_likes;
create policy "likes_select_visible" on public.post_likes
  for select to authenticated using (
    exists (select 1 from public.posts p where p.id = post_likes.post_id)
  );

drop policy if exists "comment_likes_select_all" on public.comment_likes;
drop policy if exists "comment_likes_select_visible" on public.comment_likes;
create policy "comment_likes_select_visible" on public.comment_likes
  for select to authenticated using (
    exists (select 1 from public.comments c where c.id = comment_likes.comment_id)
  );

-- 차단 시 양방향 서로이웃 관계(및 대기 중 신청)를 서버에서 정리 — 클라이언트는 RLS상
-- '상대→나' 방향 행을 못 지우므로 트리거(SECURITY DEFINER)로 함께 삭제한다.
create or replace function public.cleanup_neighbors_on_block()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.neighbors
   where (requester_id = new.blocker_id and addressee_id = new.blocked_id)
      or (requester_id = new.blocked_id and addressee_id = new.blocker_id);
  return new;
end; $$;

drop trigger if exists trg_cleanup_follows_on_block on public.blocks;
drop trigger if exists trg_cleanup_neighbors_on_block on public.blocks;
create trigger trg_cleanup_neighbors_on_block after insert on public.blocks
  for each row execute function public.cleanup_neighbors_on_block();

-- 타인 프로필의 서로이웃 목록 — neighbors select가 당사자 행으로 제한되어(neighbors_select_own)
-- 직접 조회하면 빈 결과가 나오므로 SECURITY DEFINER RPC로 제공한다.
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

-- 여러 사용자의 서로이웃 수(accepted 관계)를 한 번에 집계 — 친구 찾기 결과 표시용.
-- (3-c에서 예고한 함수. neighbors 테이블 정의 이후라야 본문 검증을 통과한다.)
create or replace function public.neighbor_counts(ids uuid[])
returns table (user_id uuid, neighbor_count int)
language sql stable security definer set search_path = public as $$
  select u as user_id,
    (select count(*) from public.neighbors n
      where n.status = 'accepted' and (n.requester_id = u or n.addressee_id = u))::int
  from unnest(ids) as u;
$$;
grant execute on function public.neighbor_counts(uuid[]) to authenticated;

-- 이전 follows 모델의 잔여 함수 정리 (재실행 안전)
-- follows/follow_requests 테이블이 마이그레이션용으로 임시 유지된 경우, 거기 붙은
-- 옛 트리거·정책이 아래 함수들을 참조하고 있어(2BP01) 먼저 전부 떼어내야 한다.
-- 이름을 나열하지 않고 카탈로그에서 조회해 일괄 제거한다 (테이블이 없으면 아무것도 안 함).
do $$
declare r record;
begin
  for r in
    select tg.tgname, c.relname
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('follows', 'follow_requests')
      and not tg.tgisinternal
  loop
    execute format('drop trigger if exists %I on public.%I', r.tgname, r.relname);
  end loop;
  for r in
    select pol.policyname, pol.tablename
    from pg_policies pol
    where pol.schemaname = 'public'
      and pol.tablename in ('follows', 'follow_requests')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;
drop function if exists public.is_private_account(uuid);
drop function if exists public.cleanup_follows_on_block();
drop function if exists public.follow_list_of(uuid, text);
drop function if exists public.follower_counts(uuid[]);
drop function if exists public.following_counts(uuid[]);

-- 신고 접수 — 클라이언트 로컬 숨김과 별개로 운영자가 확인할 수 있게 서버에 저장한다.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own" on public.reports
  for insert to authenticated with check (reporter_id = auth.uid());
-- 조회는 운영자(service role)만 — 일반 사용자 select 정책 없음

-- 신고 접수 시 운영자 이메일 알림 — insert마다 Edge Function(report-alert)을 호출한다.
-- pg_net(net.http_post)은 비동기 큐 방식이라 호출·발송이 실패해도 신고 insert는 막히지
-- 않으며(예외도 흡수), 대시보드 Webhooks 활성화(supabase_functions 스키마)에 의존하지 않는다.
-- 선행 조건: ① supabase functions deploy report-alert
--            ② supabase secrets set RESEND_API_KEY=... REPORT_ALERT_EMAIL=...
-- Authorization의 anon key는 앱 번들에 포함되는 공개 키다(민감정보 아님) —
-- Edge Function의 기본 JWT 검증을 통과시키는 용도.
create extension if not exists pg_net;
create or replace function public.notify_report_alert()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform net.http_post(
    url := 'https://blweolnunmsxgztmvzfd.supabase.co/functions/v1/report-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsd2VvbG51bm1zeGd6dG12emZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDg4MDgsImV4cCI6MjA5NjY4NDgwOH0.PQeY2ShGmCAxiwDEOQSOcgIVsSkJ_PyeG1VE8uI5fc8'
    ),
    -- Edge Function이 기대하는 DB 웹훅 표준 payload 형태를 그대로 만든다
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'reports',
      'schema', 'public',
      'record', to_jsonb(new),
      'old_record', null
    )
  );
  return new;
exception when others then
  return new; -- 알림 실패가 신고 접수를 막으면 안 된다
end;
$$;
drop trigger if exists reports_email_alert on public.reports;
create trigger reports_email_alert
  after insert on public.reports
  for each row execute function public.notify_report_alert();

-- 검색·프로필 단건 조회도 차단 관계면 서버에서 숨김 — 1)의 public_profiles 뷰를
-- 차단 필터 포함으로 재정의한다 (is_blocked_between이 이 지점에서야 정의되므로 여기서 교체).
-- definer(security_invoker=false) 유지 — profiles 테이블은 본인 행만 select 가능하므로
-- 타인 공개 컬럼은 이 뷰가 유일한 통로다. auth.uid()는 definer 뷰 안에서도 호출자 기준이라
-- 차단 필터는 그대로 동작한다.
create or replace view public.public_profiles
  with (security_invoker = false) as
  select id, handle, emoji, bio, profile_photo, created_at, handle_font,
         -- 거주국(country): 서로이웃인 상대에게만 노출, 그 외 null.
         -- '소유자 전용' 원칙(PII 제외)의 유일한 예외 — 사용자 결정(2026-07-10).
         -- definer 뷰 안에서도 auth.uid()는 호출자 기준이라 관계 판정이 그대로 동작한다.
         case
           when public.are_neighbors(auth.uid(), profiles.id)
           then country
           else null
         end as country,
         -- (2026-07-16) 장기체류 — 위치 정보라 본인·이웃(서로이웃)에게만 노출, 그 외 null.
         -- (위 country(거주국)와 동일한 이웃 조건부 정책 + 본인 예외)
         case when auth.uid() = id or public.are_neighbors(auth.uid(), id) then stay_country else null end as stay_country,
         case when auth.uid() = id or public.are_neighbors(auth.uid(), id) then stay_status else null end as stay_status
  from public.profiles
  where not public.is_blocked_between(auth.uid(), id);
-- 재정의 이후에도 anon 회수 보장 (definer 뷰 — 비로그인 노출 방지, 1) 섹션 주석 참조)
revoke select on public.public_profiles from anon;
-- ⚠️ DML 권한 회수 필수 — 이 뷰는 단순 뷰라 자동 업데이트(is_updatable)가 가능하고,
-- definer 뷰의 DML은 소유자(postgres) 권한으로 실행돼 profiles의 RLS를 우회한다.
-- Supabase 기본 권한이 anon/authenticated에 INSERT/UPDATE/DELETE를 자동 부여하므로
-- 반드시 회수해야 타인 프로필 수정 구멍이 막힌다 (실서버 is_updatable=YES 확인, 2026-07-10).
revoke insert, update, delete, truncate, references, trigger
  on public.public_profiles from anon, authenticated;
revoke all on public.public_profiles from public;

-- ============================================================
-- 4-c) 알림 — 서로이웃 알림 (neighbors insert/수락 시 수신자에게 쌓임)
-- ============================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,  -- 수신자
  type text not null check (type in ('neighbor_request', 'neighbor_accept')),
  actor_id uuid not null references public.profiles(id) on delete cascade, -- 행위자
  read boolean not null default false,
  created_at timestamptz not null default now()
);
-- 기존 DB의 타입 제약을 서로이웃 타입으로 교체 (follow* → neighbor_request/neighbor_accept)
-- 순서 중요: 옛 제약을 먼저 떼야(neighbor_* 는 옛 제약이 허용 안 함) 데이터 이관이 가능하다.
--   1) 제약 드롭 → 2) follow* 행 이관/정리 → 3) 새 제약 추가.
alter table public.notifications drop constraint if exists notifications_type_check;
update public.notifications set type = 'neighbor_request' where type = 'follow_request';
update public.notifications set type = 'neighbor_accept'  where type = 'follow_accept';
delete from public.notifications where type not in ('neighbor_request', 'neighbor_accept');
alter table public.notifications add constraint notifications_type_check
  check (type in ('neighbor_request', 'neighbor_accept'));
create index if not exists idx_notifications_user on public.notifications (user_id, created_at desc);
-- 같은 (수신자·행위자·타입)당 알림 1건 유지 — 반복 신청/재수락 스팸 방지.
-- (아래 서로이웃 알림 insert는 이 유일 인덱스에 맞춰 on conflict 업서트로 처리한다.)
create unique index if not exists uq_notifications_actor_type on public.notifications (user_id, actor_id, type);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- 서로이웃 신청(pending insert) → 대상에게 신청 알림
create or replace function public.notify_on_neighbor_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.status = 'pending') then
    insert into public.notifications (user_id, actor_id, type)
      values (new.addressee_id, new.requester_id, 'neighbor_request')
      on conflict (user_id, actor_id, type) do update set created_at = now(), read = false;
  end if;
  return null;
end; $$;

drop trigger if exists trg_notify_neighbor_request on public.neighbors;
create trigger trg_notify_neighbor_request after insert on public.neighbors
  for each row execute function public.notify_on_neighbor_request();

-- 이전 follows 알림 함수 정리 (follows에 붙어 있던 트리거는 위 4-b 카탈로그 일괄 정리에서 제거됨)
drop function if exists public.notify_on_follow();

-- ============================================================
-- 4-c-2) user_trip_state — 여행 카드(그룹)·세션 백업 (재설치/기기 변경 복원용)
--   여행 카드와 세션은 로컬이 원본이고 이 테이블은 백업본(사용자당 1행 jsonb).
--   기록 참조는 posts.id(remoteId)로 저장해 재설치 후 서버에서 받은 기록과 이어진다.
-- ============================================================
create table if not exists public.user_trip_state (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_user_trip_state_updated on public.user_trip_state;
create trigger trg_user_trip_state_updated before update on public.user_trip_state
  for each row execute function public.set_updated_at();

alter table public.user_trip_state enable row level security;

drop policy if exists "user_trip_state_all_own" on public.user_trip_state;
create policy "user_trip_state_all_own" on public.user_trip_state
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- 4-c-3) user_app_state — 앱 로컬 상태 통합 백업 (재설치/기기 변경 복원용)
--   설정(스킨·색·알림·배지·통계 등)과 기록 부가상태(보관·신고숨김·음소거·본 스냅·카드순서)는
--   로컬이 원본이고 이 테이블은 백업본(사용자당 1행 jsonb). PII(프로필 필드)는 profiles가
--   원본이므로 여기 포함하지 않는다. 복원·백업 게이트는 여행카드(user_trip_state)와 동일 원칙:
--   로그인 확정 후 복원 → 복원 뒤에만 백업 허용 (빈 로컬이 백업을 덮어쓰는 사고 방지).
-- ============================================================
create table if not exists public.user_app_state (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_user_app_state_updated on public.user_app_state;
create trigger trg_user_app_state_updated before update on public.user_app_state
  for each row execute function public.set_updated_at();

alter table public.user_app_state enable row level security;

drop policy if exists "user_app_state_all_own" on public.user_app_state;
create policy "user_app_state_all_own" on public.user_app_state
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- 4-d) RPC: 추천 친구 — 내 서로이웃의 서로이웃(2단계, mutual)
--   neighbors 조회가 본인 행으로 제한되어 클라이언트가 직접 계산할 수 없으므로
--   SECURITY DEFINER RPC로 집계한다. 이미 서로이웃/본인/차단 관계는 제외.
-- ============================================================
-- 반환 컬럼 변경(is_private 제거) 시 create or replace가 불가하므로 먼저 drop
drop function if exists public.friend_suggestions(int);
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

-- ============================================================
-- 4-e) 서로이웃 신청 수락 — 대상(addressee)이 pending 행을 accepted로 바꾸고 신청자에게 알림.
--   addressee만 update 가능(neighbors_update_addressee)이므로 클라이언트가 직접 update해도
--   되지만, 수락 알림까지 원자적으로 처리하려고 SECURITY DEFINER RPC로 감싼다.
-- ============================================================
create or replace function public.accept_neighbor(requester uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  update public.neighbors
    set status = 'accepted'
    where requester_id = requester and addressee_id = me and status = 'pending';
  if found then
    insert into public.notifications (user_id, actor_id, type)
      values (requester, me, 'neighbor_accept')
      on conflict (user_id, actor_id, type) do update set created_at = now(), read = false;
  end if;
end; $$;
grant execute on function public.accept_neighbor(uuid) to authenticated;

-- 이전 follows 모델 잔여 객체 정리 — 테이블 cascade drop이 소속 정책·트리거·인덱스를 함께 제거한다.
-- (follows/follow_requests 관련 함수는 위에서 이미 drop 처리됨)
drop function if exists public.accept_follow_request(uuid);
drop function if exists public.notify_on_follow_request();
drop table if exists public.follow_requests cascade;
drop table if exists public.follows cascade;

drop policy if exists "messages_insert_sender" on public.dm_messages;
create policy "messages_insert_sender" on public.dm_messages
  for insert to authenticated with check (
    sender_id = auth.uid() and exists (
      select 1 from public.dm_threads t
      where t.id = dm_messages.thread_id
        and auth.uid() in (t.user_a, t.user_b)
        and not public.is_blocked_between(t.user_a, t.user_b)
    )
  );

-- ============================================================
-- 5) (제거됨 2026-07-03) 연락처 전화번호 매칭 — 친구 추가는 아이디 검색·QR·추천 친구로만.
--    기존 개인정보(전화 해시)와 관련 객체를 정리하기 위해 drop한다.
--    주의: drop trigger는 '테이블'이 없으면 IF EXISTS여도 에러(42P01)라 쓰지 않는다 —
--    테이블 drop이 소속 트리거를 함께 제거하므로 아래 두 줄로 충분(재실행 안전).
-- ============================================================
drop function if exists public.find_users_by_phone_hashes(text[]);
drop table if exists public.user_phones;

-- ============================================================
-- (2026-07-15) follows→neighbors 전환 — 비공개 계정(is_private) 개념 폐지.
--   공개범위는 public | neighbors 두 값만 사용하며 계정 단위 비공개 플래그는 없앤다.
--   is_private 를 참조하던 뷰·함수는 위에서 이미 재정의했으므로 마지막에 컬럼을 제거한다.
-- ============================================================
alter table public.profiles drop column if exists is_private;

-- ============================================================
-- Storage — 게시물/프로필 사진 (public 버킷 'media')
-- ============================================================
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- 누구나 읽기(공개 URL), 업로드/수정/삭제는 본인 폴더(media/<uid>/...)만
drop policy if exists "media_read_all" on storage.objects;
create policy "media_read_all" on storage.objects
  for select to authenticated using (bucket_id = 'media');

drop policy if exists "media_write_own" on storage.objects;
create policy "media_write_own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media_update_own" on storage.objects;
create policy "media_update_own" on storage.objects
  for update to authenticated using (
    bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media_delete_own" on storage.objects;
create policy "media_delete_own" on storage.objects
  for delete to authenticated using (
    bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- [선택/후속] 비공개 콘텐츠 보호 — media 버킷 private 전환
--   'media'는 현재 public 버킷이라 URL만 알면 비인증 접근이 가능하다.
--   private/friends 글의 사진까지 보호하려면 버킷을 private로 바꾸고
--   클라이언트가 supabase.storage.createSignedUrl()로 서명 URL을 발급하도록 전환해야 한다.
--   ⚠️ 클라이언트 서명 URL 전환 전에 아래를 실행하면 기존 공개 URL 이미지가 모두 깨지므로
--      반드시 클라이언트 작업과 함께 적용할 것. (그래서 기본은 주석 처리해 둔다.)
--
-- update storage.buckets set public = false where id = 'media';
-- drop policy if exists "media_read_all" on storage.objects;
-- create policy "media_read_auth" on storage.objects
--   for select to authenticated using (bucket_id = 'media');  -- 접근은 서명 URL 발급 경로로만
-- ============================================================

-- 실시간 DM을 쓰려면 (대시보드 > Database > Replication 에서 dm_messages 추가하거나):
-- alter publication supabase_realtime add table public.dm_messages;

-- ============================================================
-- 8) 피드백 — 설정 > 피드백 보내기 (인앱 폼)
--   로그인 사용자만 본인 명의로 제출(insert). 조회 정책은 의도적으로 없음 —
--   앱에서는 읽지 않고 Supabase 대시보드(service_role)에서만 확인한다.
-- ============================================================
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  content text not null check (char_length(content) between 1 and 1000),
  app_version text,
  platform text,
  created_at timestamptz not null default now()
);
create index if not exists idx_feedback_created on public.feedback (created_at desc);

alter table public.feedback enable row level security;

drop policy if exists "feedback_insert_own" on public.feedback;
create policy "feedback_insert_own" on public.feedback
  for insert to authenticated with check (user_id = auth.uid());

-- ============================================================
-- 9) 계정 삭제 — 탈퇴 유예(30일) 서버 권위 플래그 + 만료 파기
--   흐름:
--     탈퇴 신청  → request_account_deletion() 이 profiles.deletion_requested_at 기록
--     유예 내 복구 → cancel_account_deletion() 이 플래그 해제
--     유예 만료  → 클라이언트가 Edge Function(delete-account)을 호출해
--                  Storage 파일 + auth.users(→ cascade로 전체 데이터) 파기
--     미복귀 계정 → purge_expired_deletion_requests() 를 pg_cron 으로 주기 실행(아래 주석)
--   배포: supabase functions deploy delete-account  (Edge Function도 함께 배포할 것)
-- ============================================================
alter table public.profiles add column if not exists deletion_requested_at timestamptz;

-- 탈퇴 신청 — 이미 신청돼 있으면 최초 신청 시각 유지(중복 신청으로 유예가 연장되지 않게).
-- 신청 시각을 반환해 클라이언트가 로컬 캐시와 동기화한다.
create or replace function public.request_account_deletion()
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare ts timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  update public.profiles
     set deletion_requested_at = coalesce(deletion_requested_at, now())
   where id = auth.uid()
   returning deletion_requested_at into ts;
  return ts;
end; $$;
grant execute on function public.request_account_deletion() to authenticated;

-- 탈퇴 신청 취소(계정 복구)
create or replace function public.cancel_account_deletion()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  update public.profiles set deletion_requested_at = null where id = auth.uid();
end; $$;
grant execute on function public.cancel_account_deletion() to authenticated;

-- 유예가 지나도 재로그인하지 않는 계정의 안전망 파기.
-- ⚠️ Supabase는 storage.objects의 SQL 직접 삭제를 트리거(protect_delete)로 금지한다 —
--    Storage 파일까지 지우는 정식 안전망은 Edge Function(delete-account, scope='sweep')이며
--    pg_cron + pg_net 이 매일 호출한다(아래 등록 절차). 이 SQL 함수는 DB 행만 지우는
--    수동 폴백(Storage 파일은 남음)으로만 남겨둔다.
--
-- [pg_cron 등록 절차 — 대시보드 SQL Editor에서 1회 실행]
--  1) Extensions에서 pg_cron, pg_net 활성화
--  2) service_role 키를 Vault에 저장:
--     select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
--  3) 스케줄 등록(매일 18:00 UTC = KST 새벽 3시):
--     select cron.schedule('purge-deleted-accounts', '0 18 * * *', $cron$
--       select net.http_post(
--         url := 'https://blweolnunmsxgztmvzfd.supabase.co/functions/v1/delete-account',
--         headers := jsonb_build_object(
--           'Content-Type', 'application/json',
--           'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
--         ),
--         body := '{"scope":"sweep"}'::jsonb
--       );
--     $cron$);
create or replace function public.purge_expired_deletion_requests(grace_days int default 30)
returns integer
language plpgsql security definer set search_path = public, auth as $$
declare n integer := 0;
begin
  delete from auth.users u
   using public.profiles p
   where u.id = p.id
     and p.deletion_requested_at is not null
     and p.deletion_requested_at < now() - make_interval(days => grace_days);
  get diagnostics n = row_count;
  return n;
end; $$;

-- 일반 사용자는 실행 불가(관리자/서비스롤 전용)
revoke all on function public.purge_expired_deletion_requests(int) from public, anon, authenticated;
