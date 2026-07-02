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
-- 단계별로 테이블이 추가됩니다: 1) profiles  2) posts  3) follows/likes/comments  4) dm
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
  updated_at    timestamptz not null default now()
);

-- (기존 테이블 대비) 거주 국가 코드 컬럼. 소유자 전용 — public_profiles 뷰에는 포함하지 않는다.
alter table public.profiles add column if not exists country text;

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

-- 모든 로그인 사용자는 프로필을 조회 가능(친구 검색·피드 표시용)
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select to authenticated using (true);

-- 본인 프로필만 생성/수정
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- 타인에게 노출할 '공개 컬럼만' 담은 뷰. RLS는 컬럼 단위 제한이 안 되므로
-- birthday·gender 같은 PII를 빼고 이 뷰로 조회하도록 클라이언트 read 경로를 전환할 것.
-- (본인 전체 프로필은 기존 profiles 테이블에서 직접 조회. security_invoker로 호출자 RLS 적용.)
create or replace view public.public_profiles
  with (security_invoker = true) as
  select id, handle, emoji, bio, profile_photo, created_at
  from public.profiles;

grant select on public.public_profiles to authenticated;

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
  visibility     text not null default 'public',   -- public | friends | private
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

create index if not exists idx_posts_author   on public.posts (author_id);
create index if not exists idx_posts_created   on public.posts (created_at desc);
create index if not exists idx_posts_visibility on public.posts (visibility);

-- follows 테이블은 아래 posts 조회 정책(friends 가시성)에서 참조하므로 먼저 생성한다.
create table if not exists public.follows (
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists idx_follows_following on public.follows (following_id);

alter table public.posts enable row level security;

-- 조회: 공개글은 누구나 / 본인글은 항상 / friends 글은 작성자를 내가 팔로우 중일 때
drop policy if exists "posts_select" on public.posts;
create policy "posts_select" on public.posts
  for select to authenticated using (
    visibility = 'public'
    or author_id = auth.uid()
    or (visibility = 'friends' and exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid() and f.following_id = posts.author_id
    ))
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
-- 3) follows / post_likes / comments
--    (follows 테이블 자체는 2) posts 정책 의존성 때문에 위에서 이미 생성됨)
-- ============================================================
alter table public.follows enable row level security;

drop policy if exists "follows_select_all" on public.follows;
create policy "follows_select_all" on public.follows
  for select to authenticated using (true);

drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own" on public.follows
  for insert to authenticated with check (follower_id = auth.uid());

drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own" on public.follows
  for delete to authenticated using (follower_id = auth.uid());

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
-- 기존 select_all(true)는 비공개/friends 글의 댓글 내용·작성자를 전원에게 노출했다.
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
          or (p.visibility = 'friends' and exists (
            select 1 from public.follows f
            where f.follower_id = auth.uid() and f.following_id = p.author_id
          ))
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
-- 3-c) RPC: 친구 찾기 결과의 팔로워 수
--   여러 사용자의 팔로워 수(follows.following_id 기준)를 한 번에 집계.
--   N명을 N쿼리 없이 한 번에 받기 위함. SECURITY DEFINER 로 일관된 공개 통계 제공.
-- ============================================================
create or replace function public.follower_counts(ids uuid[])
returns table (user_id uuid, follower_count int)
language sql security definer set search_path = public as $$
  select f.following_id as user_id, count(*)::int as follower_count
  from public.follows f
  where f.following_id = any(ids)
  group by f.following_id;
$$;

grant execute on function public.follower_counts(uuid[]) to authenticated;

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

-- posts: 차단 관계면 공개글이라도 안 보이게 (본인 글은 is_blocked_between(me,me)=false 라 영향 없음)
drop policy if exists "posts_select" on public.posts;
create policy "posts_select" on public.posts
  for select to authenticated using (
    not public.is_blocked_between(auth.uid(), posts.author_id)
    and (
      visibility = 'public'
      or author_id = auth.uid()
      or (visibility = 'friends' and exists (
        select 1 from public.follows f
        where f.follower_id = auth.uid() and f.following_id = posts.author_id
      ))
    )
  );

-- comments: 차단한/당한 사용자의 댓글은 숨김 (+ 기존 글 가시성 유지)
drop policy if exists "comments_select_visible" on public.comments;
create policy "comments_select_visible" on public.comments
  for select to authenticated using (
    not public.is_blocked_between(auth.uid(), comments.author_id)
    and exists (
      select 1 from public.posts p
      where p.id = comments.post_id
        and (
          p.visibility = 'public'
          or p.author_id = auth.uid()
          or (p.visibility = 'friends' and exists (
            select 1 from public.follows f
            where f.follower_id = auth.uid() and f.following_id = p.author_id
          ))
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

-- follows: 차단 관계면 팔로우 생성 불가 — 2)의 기존 정책을 차단 검사 포함으로 교체
drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own" on public.follows
  for insert to authenticated with check (
    follower_id = auth.uid()
    and not public.is_blocked_between(auth.uid(), following_id)
  );

-- follows 조회는 본인이 당사자인 행으로 제한 — 임의 사용자의 팔로워/팔로잉 전수 조회 방지.
-- (팔로워 '수'는 follower_counts RPC(SECURITY DEFINER)가 제공하고, posts/comments/DM 정책의
--  follows 서브쿼리는 모두 f.follower_id = auth.uid() 행만 참조하므로 이 제한과 호환된다.)
drop policy if exists "follows_select_all" on public.follows;
drop policy if exists "follows_select_own" on public.follows;
create policy "follows_select_own" on public.follows
  for select to authenticated using (
    follower_id = auth.uid() or following_id = auth.uid()
  );

-- 차단 시 양방향 팔로우 관계를 서버에서 정리 — 클라이언트는 '내 팔로우'만 지울 수 있고
-- '상대→나' 방향은 RLS 때문에 못 지우므로 트리거(SECURITY DEFINER)로 함께 삭제한다.
create or replace function public.cleanup_follows_on_block()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.follows
   where (follower_id = new.blocker_id and following_id = new.blocked_id)
      or (follower_id = new.blocked_id and following_id = new.blocker_id);
  return new;
end; $$;

drop trigger if exists trg_cleanup_follows_on_block on public.blocks;
create trigger trg_cleanup_follows_on_block after insert on public.blocks
  for each row execute function public.cleanup_follows_on_block();

-- 검색·프로필 단건 조회도 차단 관계면 서버에서 숨김 — 1)의 public_profiles 뷰를
-- 차단 필터 포함으로 재정의한다 (is_blocked_between이 이 지점에서야 정의되므로 여기서 교체).
create or replace view public.public_profiles
  with (security_invoker = true) as
  select id, handle, emoji, bio, profile_photo, created_at
  from public.profiles
  where not public.is_blocked_between(auth.uid(), id);

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
-- 5) user_phones — 연락처 기반 친구 찾기용 전화번호 해시
--    개인정보(전화 해시)는 profiles(전체 조회 허용)와 분리해 별도 테이블에 둔다.
--    SELECT 정책을 두지 않아 직접 조회 불가 → 매칭은 SECURITY DEFINER RPC로만.
-- ============================================================
create table if not exists public.user_phones (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  phone_hash text not null,             -- sha256(정규화 전화번호), 클라이언트에서 해시
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_user_phones_hash on public.user_phones (phone_hash);

drop trigger if exists trg_user_phones_updated on public.user_phones;
create trigger trg_user_phones_updated before update on public.user_phones
  for each row execute function public.set_updated_at();

alter table public.user_phones enable row level security;

-- 본인 행만 등록/수정 (SELECT 정책 없음 → 일반 조회 차단)
drop policy if exists "user_phones_insert_own" on public.user_phones;
create policy "user_phones_insert_own" on public.user_phones
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "user_phones_update_own" on public.user_phones;
create policy "user_phones_update_own" on public.user_phones
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "user_phones_delete_own" on public.user_phones;
create policy "user_phones_delete_own" on public.user_phones
  for delete to authenticated using (user_id = auth.uid());

-- 연락처 전화 해시 목록으로 가입자 매칭 (caller가 가진 해시만 비교 → 추가 정보 노출 없음)
create or replace function public.find_users_by_phone_hashes(hashes text[])
returns table (id uuid, handle text, emoji text, profile_photo text, phone_hash text)
language sql security definer set search_path = public as $$
  select pr.id, pr.handle, pr.emoji, pr.profile_photo, up.phone_hash
  from public.user_phones up
  join public.profiles pr on pr.id = up.user_id
  where up.phone_hash = any(hashes)
    and up.user_id <> auth.uid();
$$;

grant execute on function public.find_users_by_phone_hashes(text[]) to authenticated;

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
