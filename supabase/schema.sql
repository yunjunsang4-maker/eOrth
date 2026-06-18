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
  nickname      text,
  emoji         text default '🧳',
  bio           text default '',
  birthday      date,
  gender        text,
  profile_photo text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

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

drop policy if exists "comments_select_all" on public.comments;
create policy "comments_select_all" on public.comments
  for select to authenticated using (true);

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

-- 실시간 DM을 쓰려면 (대시보드 > Database > Replication 에서 dm_messages 추가하거나):
-- alter publication supabase_realtime add table public.dm_messages;
