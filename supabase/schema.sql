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

-- 아이디(handle) 유일성은 '대소문자 무시' 기준이어야 한다.
-- 테이블 정의의 `handle text unique`(profiles_handle_key)는 대소문자를 구분해
-- 'Alice'와 'alice'가 동시에 등록될 수 있었다 — 반면 가용성 검사(is_handle_available)와
-- 아이디 로그인(email_for_handle)은 lower() 기준이라 사칭 아이디가 만들어졌다.
-- → lower(handle) UNIQUE 인덱스를 최종 방어선으로 둔다(기존 비유니크 lower 인덱스는 대체).
--   (대소문자만 구분하던 profiles_handle_key는 이 인덱스의 부분집합이라 그대로 둔다 —
--    드롭해도 되지만 남겨도 무해하고, 드롭은 되돌리기 어려워 보수적으로 유지.)
-- ⚠️ 이미 대소문자만 다른 중복 handle이 있으면 유니크 인덱스를 만들 수 없다.
--    그 경우 아래 블록이 경고만 남기고 넘어가므로(스키마 전체 실행 실패 방지),
--    중복을 정리한 뒤 이 파일을 다시 실행할 것. 중복 조회:
--      select lower(handle), count(*) from public.profiles
--       where handle is not null group by 1 having count(*) > 1;
do $$
declare dup_count int;
begin
  select count(*) into dup_count from (
    select lower(handle)
    from public.profiles
    where handle is not null
    group by 1
    having count(*) > 1
  ) d;

  if dup_count > 0 then
    raise warning '[eOrth] 대소문자만 다른 중복 handle % 건 — uq_profiles_handle_lower 생성을 건너뜁니다. 중복 정리 후 재실행하세요.', dup_count;
  else
    create unique index if not exists uq_profiles_handle_lower on public.profiles (lower(handle));
    -- 유니크 인덱스가 조회용 인덱스 역할까지 대신하므로 기존 비유니크 인덱스는 정리
    drop index if exists public.idx_profiles_handle;
  end if;
end $$;

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

-- ⚠️ 탈퇴 안전장치 위조 방어 (출시 전 감사 2026-08-02, CRITICAL)
-- 위 정책은 '본인 행'만 허용할 뿐 컬럼 제한이 없어서, 사용자가 자기 행의
-- deletion_requested_at 을 임의 과거 시각으로 직접 써넣을 수 있었다. 그런데
-- delete-account Edge Function 이 검사하는 두 조건이 하필 이 컬럼이다:
--   ① 탈퇴 신청이 있는가(deletion_requested_at is not null)
--   ② 유예기간(30일)이 지났는가
-- 즉 사용자가 쓸 수 있는 값으로 두 안전장치를 모두 통과시켜, 유예기간을 건너뛰고
-- 계정을 즉시 영구 파기할 수 있었다(scope='content' 는 날짜 조건조차 없다).
-- 세션이 탈취된 기기에서 게시물·DM·사진이 되돌릴 수 없이 삭제된다.
-- posts/neighbors/dm_messages 와 같은 컬럼 수준 권한 패턴으로 막는다.
--
--   · updated_at 은 트리거(set_updated_at)가 채우므로 권한 부여가 필요 없다.
--   · deletion_requested_at/deletion_reason 은 request_account_deletion()·
--     cancel_account_deletion()(security definer)만 갱신한다 — 소유자 권한이라
--     이 회수의 영향을 받지 않는다.
--   · created_at 은 애초에 변경 대상이 아니다.
--   · id 는 반드시 포함해야 한다 — 클라이언트가 upsert 로 프로필을 저장하는데
--     (services/profile.ts:54 가 payload 에 id 를 넣는다) PostgREST 의 upsert 는
--     ON CONFLICT DO UPDATE SET 에 payload 의 모든 컬럼을 넣으므로, id 권한이 없으면
--     프로필 동기화 전체가 'permission denied for column id' 로 깨진다.
--     위 profiles_update_own 의 with check (auth.uid() = id) 가 결과 행의 소유자를
--     강제하므로, id 를 열어도 남의 uuid 로 바꾸는 것은 불가능하다(자기 id 재기입만 가능).
-- insert/select/delete 권한은 건드리지 않는다(update 만 회수 후 컬럼 단위 재부여).
revoke update on public.profiles from authenticated;
grant update (id, handle, emoji, bio, birthday, gender, profile_photo,
              country, handle_font, stay_country, stay_status)
  on public.profiles to authenticated;

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
create index if not exists idx_posts_author_country on public.posts (author_id, country_name);

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

-- 카운터 컬럼 보호 — RLS(posts_update_own)는 '행' 단위라 작성자가 자기 글의
-- likes_count/comments_count 를 임의 값으로 조작할 수 있었다(좋아요 수 위조).
-- 컬럼 수준 권한으로 클라이언트가 실제로 갱신하는 컬럼만 허용한다.
--   · 클라이언트 갱신 컬럼: updatePost(src/services/posts.ts) → visibility, view_type, country_name, data
--     (client_id 는 현재 insert 에서만 쓰지만, 향후 재발행 보정 여지를 남겨 함께 허용)
--   · updated_at 은 트리거(set_updated_at)가 채운다 — 컬럼 권한은 'UPDATE 문이 명시한
--     컬럼'에만 적용되므로 트리거 갱신에는 권한이 필요 없다.
--   · likes_count/comments_count 는 sync_likes_count/sync_comments_count(security definer)가
--     소유자 권한으로 갱신하므로 이 회수의 영향을 받지 않는다.
-- insert/select/delete 권한은 건드리지 않는다(update 만 회수 후 컬럼 단위 재부여).
revoke update on public.posts from authenticated;
grant update (visibility, view_type, country_name, data, client_id)
  on public.posts to authenticated;

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
-- security definer 필수 — 트리거 함수는 기본적으로 '좋아요를 누른 사용자' 권한으로 돌아
-- posts_update_own(작성자만 update) RLS에 걸린다. 그러면 타인 글의 likes_count 갱신이
-- 에러 없이 0행 no-op으로 조용히 실패해 좋아요 수가 늘지 않는다(감사 2026-08-01).
create or replace function public.sync_likes_count()
returns trigger language plpgsql security definer set search_path = public as $$
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

-- 본문 길이 상한 — 클라이언트 maxLength(500)와 짝을 이루는 서버측 방어.
-- 없으면 REST 직접 호출로 수 MB 댓글을 넣어 피드·상세 렌더와 대역폭을 태울 수 있다.
-- not valid: 기존 행은 검사하지 않고 이후 insert/update 부터 적용(재실행 안전).
alter table public.comments drop constraint if exists comments_text_len;
alter table public.comments add constraint comments_text_len
  check (char_length(text) between 1 and 500) not valid;

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

-- (sync_likes_count와 동일 이유로 security definer — 타인 글 댓글 수 갱신이 RLS로 막히면
--  댓글 수가 0에 머문다.)
create or replace function public.sync_comments_count()
returns trigger language plpgsql security definer set search_path = public as $$
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

-- [선택·수동] 카운터 소급 보정 — 위 두 함수가 security definer가 되기 전에 쌓인
-- 좋아요·댓글은 RLS에 막혀 카운트에 반영되지 않았다(타인 글의 카운터가 0에 머묾).
-- 실제 행 수로 다시 세는 1회 보정. 재실행해도 결과가 같지만 전체 게시물 update라
-- 자동 실행하지 않고 필요할 때 SQL Editor에서 아래 두 문장을 직접 실행할 것.
--
-- update public.posts p
--    set likes_count = coalesce(c.n, 0)
--   from (select id from public.posts) ids
--   left join (select post_id, count(*)::int as n from public.post_likes group by 1) c
--          on c.post_id = ids.id
--  where p.id = ids.id and p.likes_count is distinct from coalesce(c.n, 0);
--
-- update public.posts p
--    set comments_count = coalesce(c.n, 0)
--   from (select id from public.posts) ids
--   left join (select post_id, count(*)::int as n from public.comments group by 1) c
--          on c.post_id = ids.id
--  where p.id = ids.id and p.comments_count is distinct from coalesce(c.n, 0);

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
    -- 차단 관계는 집계에서 제외 — 차단당한 사용자에게 상대의 '이웃 전용' 기록 기준
    -- 방문국 수가 그대로 노출되던 것을 막는다.
    -- (is_blocked_between 은 이 함수보다 아래에서 정의되므로 인라인으로 쓴다)
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.author_id)
         or (b.blocker_id = p.author_id and b.blocked_id = auth.uid())
    )
  group by p.author_id;
$$;

grant execute on function public.profile_country_counts(uuid[]) to authenticated;

-- ============================================================
-- 3-b-2) RPC: 추천 메이트(여행 DNA) → mate_suggestions
--   함수 본문이 is_blocked_between·are_neighbors(4-b)를 참조하므로
--   (check_function_bodies 기본 on에서 검증) 해당 함수는 4-b 섹션 아래에 정의한다.
-- ============================================================

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

-- 읽음 표시(read_at) — UPDATE 정책이 아예 없어서 '읽음' 기능을 붙이는 순간
-- 조용한 0행 no-op이 된다(RLS는 정책 없는 명령을 에러 없이 막는다). 미리 열어 둔다.
--   · 대상: 내가 '받은' 메시지(발신자가 내가 아닌) 중 내가 참여한 스레드의 행
--   · 컬럼: read_at 만 (본문·이미지 위조 방지 — 컬럼 수준 권한으로 강제)
drop policy if exists "messages_update_read" on public.dm_messages;
create policy "messages_update_read" on public.dm_messages
  for update to authenticated
  using (
    sender_id <> auth.uid() and exists (
      select 1 from public.dm_threads t
      where t.id = dm_messages.thread_id and auth.uid() in (t.user_a, t.user_b)
    )
  )
  with check (
    sender_id <> auth.uid() and exists (
      select 1 from public.dm_threads t
      where t.id = dm_messages.thread_id and auth.uid() in (t.user_a, t.user_b)
    )
  );

revoke update on public.dm_messages from authenticated;
grant update (read_at) on public.dm_messages to authenticated;

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

-- ⚠️ 관계 위조 방어 (감사 2026-08-01, CRITICAL)
-- 위 정책은 '내가 addressee인 행'만 허용하지만 컬럼 제한이 없어서, addressee가 자기 앞으로
-- 온 pending 행의 requester_id 를 임의의 다른 사용자 UUID로 바꾸고 status='accepted' 로
-- 만들면 '동의한 적 없는 사람과의 서로이웃 관계'를 만들 수 있었다(with check도 addressee만
-- 보므로 통과). 서로이웃은 비공개 기록 열람 권한이라 실제 정보 유출로 이어진다.
--
-- 이중 방어:
--   ① 컬럼 수준 권한 — authenticated 는 status 컬럼만 update 가능.
--   ② BEFORE UPDATE 트리거 — 관계의 두 당사자(PK)는 어떤 경로로도 불변.
-- 클라이언트 흐름은 그대로 동작한다: 수락은 accept_neighbor RPC(security definer, status만
-- 변경), 거절/취소/끊기는 delete(src/services/social.ts) — 직접 update 호출은 없다.
revoke update on public.neighbors from authenticated;
grant update (status) on public.neighbors to authenticated;

create or replace function public.neighbors_freeze_parties()
returns trigger language plpgsql as $$
begin
  if new.requester_id is distinct from old.requester_id
     or new.addressee_id is distinct from old.addressee_id then
    raise exception 'neighbors_parties_immutable';
  end if;
  return new;
end; $$;

drop trigger if exists trg_neighbors_freeze_parties on public.neighbors;
create trigger trg_neighbors_freeze_parties before update on public.neighbors
  for each row execute function public.neighbors_freeze_parties();

drop policy if exists "neighbors_delete_own" on public.neighbors;
create policy "neighbors_delete_own" on public.neighbors
  for delete to authenticated using (requester_id = auth.uid() or addressee_id = auth.uid());

-- ─────────────────────────────────────────────
-- 추천 메이트(여행 DNA) — 희소성 기반 6개 축 점수. 만점 100(그대로 %로 표시).
--
-- 축 배점: 나라(희소성) 25 + 도시 15 + 시의성 15 + 시기 10 + 관심사 15 + 성향 10 + 공통메이트 10
--
-- 예전 설계에서 바뀐 점:
--   · 나라를 '개수'가 아니라 '희소성 가중'으로 — 아이슬란드 겹침이 일본 겹침보다 값지다.
--     정규화는 '가중 자카드'다(내 가중합 + 후보 가중합 - 겹친 가중합으로 나눔).
--     내 가중합만으로 나누면 한 호출 안에서 상수라 후보 간 순위가 안 바뀐다 —
--     후보 쪽 넓이를 분모에 넣어야 '많이 다닌 사람이 항상 유리'가 실제로 사라진다.
--   · 기록형식·동행자 축 제거 — 2종만 겹쳐도 만점이라 사실상 전원이 받았고,
--     변별에 기여하지 않으면서 점수를 상단에 뭉치게 하는 주범이었다.
--
-- 개인정보: visibility <> 'private' 기록만 사용. 날짜는 점수 계산에만 쓰고 반환하지 않는다.
--   시기 비교는 월 단위(계절)까지만 — 일 단위 비교는 실시간 위치 추적으로 읽힐 수 있다.
--
-- 성능: 후보를 먼저 좁히고(1단계) 비싼 JSONB 추출은 그 후보에만 돌린다(2단계).
--
-- 반환 시그니처(9→17컬럼)가 바뀌어 create or replace만으로는 교체 불가(postgres가
-- "cannot change return type of existing function"으로 거부) — 기존 mate_suggestions(int, text[])를
-- 명시적으로 drop한 뒤 재정의한다. travel_overlap_suggestions(int)는 이전 리네이밍 잔재 정리용.
-- ─────────────────────────────────────────────
-- 자유 JSONB 날짜 문자열 → date, 실패하면 null (예외를 던지지 않는다).
-- to_date는 '관대하다'고 알려져 있지만 월 13 이상·연 0 같은 '범위 밖' 값에는 예외를 던진다
-- (PG10+). data->>'startDate' 는 클라이언트가 자유롭게 쓰는 값이라 잘못된 기록 단 한 건이
-- mate_suggestions 전체를 죽였다(감사 2026-08-01). 그래서 파싱 전에 범위를 직접 검증한다.
--   · plpgsql exception 블록을 쓰지 않는 이유: 행마다 서브트랜잭션이 생겨 느려진다
--     (mate_suggestions 는 전체 공개 게시물을 1회 스캔한다).
--   · 일(day) 처리는 두 갈래다: 32 이상은 아래 범위 검증에서 탈락해 null 이 되고,
--     31 이하지만 그 달에 없는 날(예: 2-31)은 to_date가 다음 달로 굴려 보정한다.
--     어느 쪽도 예외를 던지지 않으며, 이 함수의 용도(월 단위 계절 판정)에는 충분하다.
--   · immutable + strict: 인덱스/CTE 재사용에 안전하고 null 입력은 호출 없이 null.
create or replace function public.safe_to_date(s text)
returns date
language sql immutable strict as $$
  select case
    when s ~ '^[0-9]{4}[./-][0-9]{1,2}[./-][0-9]{1,2}$'
     and split_part(translate(s, './', '--'), '-', 1)::int between 1 and 9999
     and split_part(translate(s, './', '--'), '-', 2)::int between 1 and 12
     and split_part(translate(s, './', '--'), '-', 3)::int between 1 and 31
    then to_date(translate(s, './', '--'), 'YYYY-MM-DD')
  end;
$$;
grant execute on function public.safe_to_date(text) to authenticated;

drop function if exists public.travel_overlap_suggestions(int);
-- 래퍼(12번 절)와 본체를 둘 다 먼저 떨어뜨린 뒤 재정의한다.
-- 래퍼는 본체에 의존하므로 순서가 중요하다(본체를 drop하려면 래퍼가 먼저 없어야 안전).
drop function if exists public.mate_suggestions(int, text[]);
drop function if exists public.mate_suggestions_compute(int, text[]);
-- ⚠️ 이 함수는 '계산 본체'다. 앱이 호출하는 이름은 아래(파일 끝 12번 절)의 캐시 래퍼
--    public.mate_suggestions 이며, 그 래퍼가 이 함수를 하루 몇 번만 부른다.
--    본체를 직접 호출하면 캐시를 우회해 매번 전역 스캔이 돈다 — 진단 목적 외에는 쓰지 말 것.
create or replace function public.mate_suggestions_compute(match_limit int default 10, extra_countries text[] default '{}')
returns table (
  author_id uuid, handle text, emoji text, profile_photo text,
  shared_count int, sample_countries text[], mutual_count int, style_score int, total_score int,
  place_score int, recency_score int, season_score int, interest_score int, taste_score int,
  mutual_score int,
  shared_cities text[], shared_keywords text[]
)
language sql security definer set search_path = public as $$
  with me as (select auth.uid() as uid),

  -- 공개 기록만. 여행 날짜는 startDate → date → 작성 시각 순으로 정한다.
  -- date는 recordStore의 필수 필드고 startDate는 선택이라, startDate만 보면 대다수 기록이
  -- 발행 시각으로 계절 판정된다(2019년 겨울 여행을 오늘 가져오면 '여름 여행자'가 된다).
  -- 둘 다 클라이언트가 쓰는 자유 JSONB라 형식이 보장되지 않는다 — safe_to_date로 파싱한다
  -- (형식·범위가 안 맞으면 예외 대신 null → coalesce가 다음 후보로 넘어간다).
  -- to_date를 직접 쓰면 월 13 같은 값 하나로 전 사용자 조회가 죽는다(safe_to_date 주석 참조).
  -- 전역 1회 스캔. data 전체(본문·사진 URL·perCountryData 포함)를 들고 다니지 않는다 —
  -- 나라 전개에 필요한 countries 배열만 남긴다. data가 필요한 계산은 작성자로 좁혀진 뒤
  -- public.posts를 직접 읽는다.
  pub as (
    select p.id as post_id, p.author_id, p.country_name,
           coalesce(
             public.safe_to_date(p.data->>'startDate'),
             public.safe_to_date(p.data->>'date'),
             p.created_at::date) as trip_date,
           case when jsonb_typeof(p.data->'countries') = 'array'
                then p.data->'countries' else '[]'::jsonb end as countries
    from public.posts p
    where p.visibility <> 'private'
  ),
  -- 나라 단위로 펼친다. country_name(대표 국가)에 더해 countries 배열도 펼쳐
  -- 다국가 여행이 누락되지 않게 한다(예전엔 대표 국가 1개만 셌다).
  pub_country as (
    select x.post_id, x.author_id, x.trip_date, c.name
    from pub x
    cross join lateral (
      select x.country_name as name
      union
      select jsonb_array_elements(x.countries)->>'name'
    ) c
    where c.name is not null and c.name <> ''
  ),
  -- 계절 판정 — 월 단위. 일 단위로 내려가지 않는다(개인정보 원칙).
  pub_season as (
    select pc.*,
      case when extract(month from pc.trip_date) in (12,1,2) then 'winter'
           when extract(month from pc.trip_date) between 3 and 5 then 'spring'
           when extract(month from pc.trip_date) between 6 and 8 then 'summer'
           else 'fall' end as season
    from pub_country pc
  ),

  -- 나라별 방문 사용자 수 → 희소성 가중치.
  -- 표본이 적으면(전체 20명 미만) 희소성은 신호가 아니라 노이즈라 균등 가중으로 폴백한다.
  user_total as (select count(distinct author_id)::int as n from pub_country),
  country_user_counts as (
    select pc.name, count(distinct pc.author_id)::int as visitors
    from pub_country pc
    group by pc.name
  ),
  country_weight as (
    select cuc.name,
           case when (select n from user_total) < 20 then 1.0
                else 1.0 / ln(exp(1) + cuc.visitors)
           end as w
    from country_user_counts cuc
  ),
  -- 편재(遍在) 국가 — 전체 사용자의 절반 이상이 방문한 나라. 도시 축에서 제외한다.
  -- 나라까지 대조해도 국내 기록(양쪽의 '서울')은 둘 다 대한민국이라 걸러지지 않아,
  -- 여행 취향 유사성 없이 도시 축이 만점이 된다.
  -- 표본 부족(<20명)이면 이 비율은 신호가 아니라 노이즈라 제외 규칙도 함께 끈다
  -- (나라 축 희소성 폴백과 같은 조건). greatest는 0 나눗셈 방어.
  ubiquitous_countries as (
    select cuc.name
    from country_user_counts cuc
    where (select n from user_total) >= 20
      and cuc.visitors::numeric / greatest((select n from user_total), 1) >= 0.5
  ),

  -- 내 입력. extra_countries는 호출자 로컬(미발행·나만보기) 나라 보강 — 내 매칭 입력에만 쓰고
  -- 타인에게 노출하지 않는다.
  my_countries as (
    select pc.name from pub_country pc, me where pc.author_id = me.uid
    union
    select c from unnest(extra_countries) as c where c is not null and c <> ''
  ),
  -- 도시는 (나라, 도시) 쌍으로 들고 다닌다 — 동명 지역의 오매칭을 막는다.
  -- 나라는 기록의 대표 국가(country_name)를 쓴다. pub_country로 펼치면 다국가 기록에서
  -- 한 도시가 그 여행의 모든 나라와 짝지어져 없는 쌍이 생긴다.
  my_cities as (
    select distinct p.country_name as country, p.data->>'regionName' as city
    from public.posts p, me
    where p.author_id = me.uid and p.visibility <> 'private'
      and coalesce(p.data->>'regionName', '') <> ''
      and coalesce(p.country_name, '') <> ''
  ),
  my_keywords as (
    select distinct kw
    from public.posts p, me, jsonb_array_elements_text(
      case when jsonb_typeof(p.data->'keywords') = 'array' then p.data->'keywords' else '[]'::jsonb end
    ) as kw
    where p.author_id = me.uid and p.visibility <> 'private' and kw <> ''
  ),
  my_seasons as (
    select distinct ps.name, ps.season
    from pub_season ps, me where ps.author_id = me.uid
  ),
  -- 시의성: 최근 1년 내 다녀온 나라(날짜 자체는 반환하지 않는다)
  my_recent as (
    select distinct pc.name
    from pub_country pc, me
    where pc.author_id = me.uid and pc.trip_date >= current_date - interval '1 year'
  ),
  my_rating as (
    select avg((p.data->>'rating')::numeric) as r
    from pub_country pc
    join public.posts p on p.id = pc.post_id
    cross join me
    where pc.author_id = me.uid and pc.name in (select name from my_countries)
      and (p.data->>'rating') ~ '^[0-9]+(\.[0-9]+)?$'
  ),
  -- 예산은 같은 통화일 때만 비교한다(환율 정보가 없어 다른 통화는 비교 불가).
  -- 내가 가장 많이 쓴 통화 1개를 기준으로 삼는다.
  my_budget as (
    select p.data->'budget'->>'currency' as cur, avg((p.data->'budget'->>'amount')::numeric) as amt
    from public.posts p, me
    where p.author_id = me.uid and p.visibility <> 'private'
      and (p.data->'budget'->>'amount') ~ '^[0-9]+(\.[0-9]+)?$'
      and coalesce(p.data->'budget'->>'currency','') <> ''
    group by 1 order by count(*) desc limit 1
  ),
  my_flight as (
    select p.data->>'flightType' as ft
    from public.posts p, me
    where p.author_id = me.uid and p.visibility <> 'private'
      and coalesce(p.data->>'flightType','') <> ''
    group by 1 order by count(*) desc limit 1
  ),
  my_mates as (
    select case when n.requester_id = me.uid then n.addressee_id else n.requester_id end as mate_id
    from public.neighbors n, me
    where n.status = 'accepted' and (n.requester_id = me.uid or n.addressee_id = me.uid)
  ),

  -- 1단계: 후보 좁히기(싼 필터) — 나라가 겹치거나 공통 메이트가 있는 사람만, 최대 200명.
  cand as (
    select cid from (
      select pc.author_id as cid
      from pub_country pc, me
      where pc.author_id <> me.uid and pc.name in (select name from my_countries)
      union
      select case when n2.requester_id = mm.mate_id then n2.addressee_id else n2.requester_id end as cid
      from my_mates mm
      join public.neighbors n2 on n2.status = 'accepted'
        and (n2.requester_id = mm.mate_id or n2.addressee_id = mm.mate_id)
    ) u, me
    where u.cid <> me.uid
    group by cid
    limit 200
  ),

  -- 2단계: 후보에만 비싼 계산.
  -- 나라 — (후보, 나라) 쌍을 먼저 distinct로 만든 뒤 가중치를 합한다.
  -- (sum(distinct w)로 하면 가중치가 우연히 같은 두 나라가 하나로 합쳐진다)
  my_weight_sum as (
    select greatest(sum(cw.w), 0.0001) as s
    from my_countries mc join country_weight cw on cw.name = mc.name
  ),
  -- 후보 본인이 방문한 나라들의 가중치 합(S_cand) — 가중 자카드 분모의 '후보 쪽 넓이'.
  -- 후보(cand)에 대해서만 계산한다(전 사용자로 돌리면 비싸다).
  -- (후보, 나라) 쌍을 먼저 distinct로 만든 뒤 합해야 같은 나라를 여러 번 기록한 사람의
  -- 가중치가 부풀지 않는다. country_weight는 나라당 1행이라 조인이 행을 불리지 않는다.
  cand_weight_sum as (
    select t.cid, sum(cw.w) as s
    from (
      select distinct pc.author_id as cid, pc.name
      from pub_country pc
      where pc.author_id in (select cid from cand)
    ) t
    join country_weight cw on cw.name = t.name
    group by t.cid
  ),
  cshared_pairs as (
    select distinct pc.author_id as cid, pc.name
    from pub_country pc
    where pc.author_id in (select cid from cand)
      and pc.name in (select name from my_countries)
  ),
  cshared as (
    select sp.cid,
           count(*)::int as shared_count,
           -- 희소한 나라를 앞에 둔다 — 근거 문구가 "아이슬란드"를 먼저 말하게
           (array_agg(sp.name order by cw.w desc))[1:3] as sample_countries,
           sum(cw.w) as shared_weight
    from cshared_pairs sp
    join country_weight cw on cw.name = sp.name
    group by sp.cid
  ),
  -- 도시 — (나라, 도시)가 모두 같을 때만 겹침으로 센다. 편재 국가는 제외한다.
  -- my_cities가 (나라, 도시) distinct라 조인은 기록 1행당 최대 1건, 행이 불지 않는다.
  ccity_pairs as (
    select distinct p.author_id as cid, p.country_name as country, p.data->>'regionName' as city
    from public.posts p
    join my_cities mc on mc.country = p.country_name and mc.city = p.data->>'regionName'
    where p.visibility <> 'private'
      and p.author_id in (select cid from cand)
      and p.country_name not in (select name from ubiquitous_countries)
  ),
  ccity as (
    select cp.cid,
           count(*)::int as n,
           -- 이름이 같고 나라만 다른 도시가 표본에 둘 다 들어가지 않게 distinct로 모은다
           (array_agg(distinct cp.city))[1:3] as cities
    from ccity_pairs cp
    group by cp.cid
  ),
  crecent as (
    select pc.author_id as cid, count(distinct pc.name)::int as n
    from pub_country pc
    where pc.author_id in (select cid from cand)
      and pc.name in (select name from my_recent)
      and pc.trip_date >= current_date - interval '1 year'
    group by pc.author_id
  ),
  -- 시기: 겹친 (나라, 계절) 쌍의 개수 — 같은 조합을 여러 번 갔다고 더 세지 않는다
  cseason as (
    select t.cid, count(*)::int as n
    from (
      select distinct ps.author_id as cid, ps.name, ps.season
      from pub_season ps
      join my_seasons ms on ms.name = ps.name and ms.season = ps.season
      where ps.author_id in (select cid from cand)
    ) t
    group by t.cid
  ),
  ckw as (
    select p.author_id as cid,
           count(distinct kw)::int as n,
           (array_agg(distinct kw))[1:3] as kws
    from public.posts p, jsonb_array_elements_text(
      case when jsonb_typeof(p.data->'keywords') = 'array' then p.data->'keywords' else '[]'::jsonb end
    ) as kw
    where p.visibility <> 'private'
      and p.author_id in (select cid from cand) and kw in (select kw from my_keywords)
    group by p.author_id
  ),
  crating as (
    select pc.author_id as cid, avg((p.data->>'rating')::numeric) as r
    from pub_country pc
    join public.posts p on p.id = pc.post_id
    where pc.author_id in (select cid from cand)
      and pc.name in (select name from my_countries)
      and (p.data->>'rating') ~ '^[0-9]+(\.[0-9]+)?$'
    group by pc.author_id
  ),
  -- 내 기준 통화와 같은 기록만 집계 — 후보당 1행이 되도록 통화로 미리 걸러낸다
  cbudget as (
    select p.author_id as cid, avg((p.data->'budget'->>'amount')::numeric) as amt
    from public.posts p
    where p.visibility <> 'private'
      and p.author_id in (select cid from cand)
      and (p.data->'budget'->>'amount') ~ '^[0-9]+(\.[0-9]+)?$'
      and p.data->'budget'->>'currency' = (select cur from my_budget)
    group by p.author_id
  ),
  cflight as (
    select cid, ft from (
      select p.author_id as cid, p.data->>'flightType' as ft,
             row_number() over (partition by p.author_id order by count(*) desc) as rn
      from public.posts p
      where p.visibility <> 'private'
        and p.author_id in (select cid from cand) and coalesce(p.data->>'flightType','') <> ''
      group by 1, 2
    ) t where rn = 1
  ),
  -- 성향 3항목. 판정 불가한 항목은 '미충족'이 아니라 분모에서 뺀다
  -- (예산을 아무도 안 적었다고 점수가 깎이면 안 된다).
  ctaste as (
    select c.cid,
      ((case when (select r from my_rating) is not null and cr.r is not null then 1 else 0 end)
       + (case when (select amt from my_budget) is not null and cb.amt is not null then 1 else 0 end)
       + (case when (select ft from my_flight) is not null and cf.ft is not null then 1 else 0 end)) as denom,
      ((case when (select r from my_rating) is not null and cr.r is not null
                  and abs(cr.r - (select r from my_rating)) <= 1.0 then 1 else 0 end)
       + (case when (select amt from my_budget) is not null and cb.amt is not null
                  and cb.amt between (select amt from my_budget) / 2 and (select amt from my_budget) * 2
                 then 1 else 0 end)
       + (case when (select ft from my_flight) is not null and cf.ft = (select ft from my_flight)
                 then 1 else 0 end)) as num
    from cand c
    left join crating cr on cr.cid = c.cid
    left join cbudget cb on cb.cid = c.cid
    left join cflight cf on cf.cid = c.cid
  ),
  cmut as (
    select c.cid, count(distinct mm.mate_id)::int as mutual_count
    from cand c
    join my_mates mm on true
    join public.neighbors n2 on n2.status = 'accepted'
      and ((n2.requester_id = mm.mate_id and n2.addressee_id = c.cid)
        or (n2.addressee_id = mm.mate_id and n2.requester_id = c.cid))
    group by c.cid
  ),

  scored as (
    select c.cid,
      coalesce(s.shared_count, 0) as shared_count,
      coalesce(s.sample_countries, '{}'::text[]) as sample_countries,
      coalesce(ci.cities, '{}'::text[]) as shared_cities,
      coalesce(k.kws, '{}'::text[]) as shared_keywords,
      coalesce(m.mutual_count, 0) as mutual_count,
      -- 나라(희소성 가중 자카드) 25 + 도시 15
      -- 분모는 합집합의 가중합(S_me + S_cand - 겹침). 내 가중합만으로 나누면 한 호출 안에서
      -- 상수라 후보 순위가 shared_weight 순위와 같아져 활동량 편향이 전혀 안 걷힌다.
      -- ×2는 스케일 보정 튜닝 상수 — 자카드는 두 나라 집합이 완전히 같을 때만 1.0이라
      -- 현실적인 좋은 매칭(0.3~0.5)이 늘 한 자릿수가 된다. "합집합의 절반을 공유하면 만점"의
      -- 의미이며, 실기기 점수 분포를 본 뒤 조정할 값이다.
      -- 표본 부족(<20명) 폴백에서는 모든 w = 1.0이라 자연히 순수 개수 자카드가 된다(의도됨).
      (round(least(coalesce(s.shared_weight,0)
                   / greatest((select s from my_weight_sum) + coalesce(cws.s, 0)
                              - coalesce(s.shared_weight,0), 0.0001)
                   * 2, 1.0) * 25)
       + round(least(coalesce(ci.n,0), 3) / 3.0 * 15))::int as place_score,
      round(least(coalesce(r.n,0), 2) / 2.0 * 15)::int as recency_score,
      round(least(coalesce(se.n,0), 2) / 2.0 * 10)::int as season_score,
      round(least(coalesce(k.n,0), 3) / 3.0 * 15)::int as interest_score,
      -- 성향: 판정 가능 항목이 2개 미만이면 분모를 3으로 고정해 비례 축소한다.
      -- 1/1로 나누면 항목 하나만 맞아도 만점이라, 이번 재설계가 제거한 '기록형식·동행자'와
      -- 같은 실패 양식이 된다(사실상 전원 만점). 항목 1개 적중은 10점이 아니라 약 3.3점.
      -- 기준 자체(별점차 1.0 / 예산 2배 / 항공편 일치)는 실제 분포를 본 뒤 조일 사안이라
      -- 이번엔 건드리지 않는다.
      (case when coalesce(ct.denom,0) = 0 then 0
            when ct.denom >= 2 then round(ct.num::numeric / ct.denom * 10)::int
            else round(ct.num::numeric / 3 * 10)::int end) as taste_score,
      round(least(coalesce(m.mutual_count,0), 3) / 3.0 * 10)::int as mutual_score
    from cand c
    left join cshared s on s.cid = c.cid
    left join cand_weight_sum cws on cws.cid = c.cid
    left join ccity ci on ci.cid = c.cid
    left join crecent r on r.cid = c.cid
    left join cseason se on se.cid = c.cid
    left join ckw k on k.cid = c.cid
    left join ctaste ct on ct.cid = c.cid
    left join cmut m on m.cid = c.cid
  ),
  visible as (
    select sc.*,
      (sc.place_score + sc.recency_score + sc.season_score
       + sc.interest_score + sc.taste_score + sc.mutual_score) as total_score
    from scored sc, me
    where not public.is_blocked_between(me.uid, sc.cid)
      and not public.are_neighbors(me.uid, sc.cid)
      and not exists (
        select 1 from public.neighbors n
        where ((n.requester_id = me.uid and n.addressee_id = sc.cid)
            or (n.requester_id = sc.cid and n.addressee_id = me.uid))
          and n.status = 'pending'
      )
  ),
  ranked as (
    select v.*,
      row_number() over (order by v.total_score desc, v.cid) as by_score
    from visible v where v.total_score > 0
  ),
  -- 다양성 2번 그룹(셔플) 후보는 by_score 상위 K에 들지 못한 잔여분으로만 한정한다.
  -- ranked 전체에 셔플 등수를 매기면 이미 점수순으로 뽑힌 행이 셔플 상위에도 걸려
  -- 그 자리가 증발해 정원(least(match_limit,50) - K)을 못 채우는 문제가 있었다.
  rest as (
    select r.*,
      -- 다양성: 일자 기반 결정적 셔플. 매일 바뀌되 같은 날 재조회하면 같은 순서라
      -- 스크롤·새로고침에 목록이 튀지 않는다.
      row_number() over (order by md5(r.cid::text || current_date::text)) as by_shuffle
    from ranked r
    where r.by_score > greatest(1, (least(match_limit, 50) * 7) / 10)
  ),
  picked as (
    -- 상위 70%는 점수순, 나머지 30%는 셔플에서 채운다(신규·저활동 사용자 노출 기회)
    select cid, shared_count, sample_countries, shared_cities, shared_keywords, mutual_count,
           place_score, recency_score, season_score, interest_score, taste_score, mutual_score, total_score
    from ranked where by_score <= greatest(1, (least(match_limit, 50) * 7) / 10)
    union all
    select cid, shared_count, sample_countries, shared_cities, shared_keywords, mutual_count,
           place_score, recency_score, season_score, interest_score, taste_score, mutual_score, total_score
    from rest
    where by_shuffle <= greatest(1, least(match_limit, 50) - (least(match_limit, 50) * 7) / 10)
  )
  select p.cid, pp.handle, pp.emoji, pp.profile_photo,
         p.shared_count, p.sample_countries, p.mutual_count,
         -- style_score는 구버전 앱 호환 — 관심사+성향으로 채운다
         (p.interest_score + p.taste_score) as style_score,
         p.total_score,
         p.place_score, p.recency_score, p.season_score, p.interest_score, p.taste_score,
         p.mutual_score,
         p.shared_cities, p.shared_keywords
  from picked p
  join public.public_profiles pp on pp.id = p.cid
  order by p.total_score desc, pp.handle
  limit greatest(1, least(match_limit, 50));
$$;
-- 본체는 클라이언트가 직접 못 부르게 한다 — 호출 경로는 캐시 래퍼 하나로 고정(12번 절).
revoke all on function public.mate_suggestions_compute(int, text[]) from public, anon, authenticated;

-- ─────────────────────────────────────────────
-- 특정 유저와의 여행 겹침(타인 프로필 "나와 겹치는 나라 N곳" 줄).
--   extra_countries는 호출자 로컬 나라 보강(내 매칭 입력 전용).
-- ─────────────────────────────────────────────
create or replace function public.overlap_with(target uuid, extra_countries text[] default '{}')
returns table (shared_count int, sample_countries text[])
language sql security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  my_countries as (
    select p.country_name from public.posts p, me
    where p.author_id = me.uid and p.visibility <> 'private'
      and p.country_name is not null and p.country_name <> ''
    union
    -- ⚠️ 상한 30 — 호출자가 넣은 배열이 그대로 비교 집합이 되므로, 전 세계 국가를 통째로
    --    넣고 배열을 반씩 쪼개 재호출하면(이분 탐색) 대상의 방문국을 전부 특정할 수 있었다.
    select c from unnest(extra_countries[1:30]) as c where c is not null and c <> ''
  ),
  shared as (
    select distinct p.country_name
    from public.posts p, me
    where p.author_id = target and p.visibility <> 'private'
      -- 차단 관계면 빈 결과 — mate_suggestions·country_visitors 와 같은 게이트를
      -- 이 함수만 빠뜨려, 나를 차단한 사람의 '이웃 전용' 기록 국가까지 캐낼 수 있었다.
      and not public.is_blocked_between(me.uid, target)
      and p.country_name in (select country_name from my_countries)
  )
  select count(*)::int as shared_count,
         coalesce((array_agg(s.country_name))[1:3], '{}'::text[]) as sample_countries
  from shared s;
$$;
grant execute on function public.overlap_with(uuid, text[]) to authenticated;

-- ─────────────────────────────────────────────
-- 나라별 화면 "이 나라 다녀온 사람" — 비공개 아닌 게시물 보유 유저(본인·차단 제외,
--   메이트 포함: 발견이 아닌 사실 나열 목적). 게시물 수 내림차순.
--   파라미터명 target_country: public_profiles.country 컬럼과의 모호성 회피.
-- ─────────────────────────────────────────────
create or replace function public.country_visitors(target_country text, match_limit int default 12)
returns table (author_id uuid, handle text, emoji text, profile_photo text, visit_posts int)
language sql security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  v as (
    select p.author_id, count(*)::int as visit_posts
    from public.posts p, me
    where p.visibility <> 'private'
      and p.country_name = target_country
      and p.author_id <> me.uid
    group by p.author_id
  )
  select v.author_id, pp.handle, pp.emoji, pp.profile_photo, v.visit_posts
  from v
  join public.public_profiles pp on pp.id = v.author_id
  cross join me
  where not public.is_blocked_between(me.uid, v.author_id)
  order by v.visit_posts desc, pp.handle
  limit greatest(1, least(match_limit, 50));
$$;
grant execute on function public.country_visitors(text, int) to authenticated;

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
-- + 댓글 '작성자'와의 차단도 판정(2026-07-20) — 제3자의 글에 남긴 댓글이 차단 관계
--   양쪽에게 서로 보이던 틈을 서버에서 차단(그 전까지는 차단한 쪽만 클라이언트
--   이름 매칭으로 걸렀고, 차단당한 쪽에는 그대로 보였다).
drop policy if exists "comments_select_visible" on public.comments;
create policy "comments_select_visible" on public.comments
  for select to authenticated using (
    not public.is_blocked_between(auth.uid(), comments.author_id)
    and exists (
      select 1 from public.posts p
      where p.id = comments.post_id
        and not public.is_blocked_between(auth.uid(), p.author_id)
        and (
          p.author_id = auth.uid()
          or (p.visibility = 'neighbors' and public.are_neighbors(auth.uid(), p.author_id))
        )
    )
  );

-- 좋아요/댓글 '쓰기'도 차단·가시성 게이트 — 3)의 insert_own(본인 행 검사만)은 차단당한
-- 사용자가 캐시된 피드 등으로 알고 있는 post id에 좋아요·댓글을 삽입해 작성자에게 알림을
-- 유발할 수 있었다(2026-07-20 감사 H1). 대상 게시물이 '내게 보이는 글'일 때만 삽입 허용.
-- exists 서브쿼리에 posts RLS(posts_select)가 그대로 적용되므로 차단·가시성 판정이 항상
-- 최종 select 정책과 일치한다. (3)의 정책을 같은 이름으로 교체 — posts 최종 정책 정의 이후)
drop policy if exists "likes_insert_own" on public.post_likes;
create policy "likes_insert_own" on public.post_likes
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_likes.post_id)
  );

drop policy if exists "comments_insert_own" on public.comments;
create policy "comments_insert_own" on public.comments
  for insert to authenticated with check (
    author_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = comments.post_id)
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
    and (n.requester_id = target or n.addressee_id = target)
    -- 차단 관계면 빈 목록. 조인하는 public_profiles 는 '목록에 뜬 사람과 나'의 차단만
    -- 거르고 'target 과 나'의 차단은 보지 않아서, 차단당한 사용자가 상대의 메이트 전원을
    -- 받아가고 그 uuid로 재호출해 소셜 그래프를 단계적으로 수집할 수 있었다.
    and not public.is_blocked_between(auth.uid(), target);
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

-- 여러 사용자의 공유 기록 수(visibility='neighbors' 글)를 한 번에 집계 — 비이웃 프로필의 여행수 스탯 표시용.
-- 이웃수(neighbor_counts)와 동일하게 집계값만 반환하는 공개 통계(개별 글 노출 없음). RLS 우회 위해 security definer.
create or replace function public.post_counts(ids uuid[])
returns table (user_id uuid, post_count int)
language sql stable security definer set search_path = public as $$
  select u as user_id,
    (select count(*) from public.posts p
      where p.author_id = u and p.visibility = 'neighbors')::int
  from unnest(ids) as u;
$$;
grant execute on function public.post_counts(uuid[]) to authenticated;

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

-- ⚠️ 신고 폭탄 방어 (출시 전 감사 2026-08-02)
-- 신고 '내용' 위조는 report-alert 가 재조회로 막지만 '건수'는 못 막았다. 로그인 사용자가
-- insert 를 반복하면 건마다 트리거 → net.http_post → 운영자 메일이 발송돼, 메일함과
-- Resend 쿼터가 소진되고 **그 뒤 들어오는 진짜 신고 알림이 유실**된다(각 행이 새로 생성돼
-- 함수의 5분 신선도 검사도 전부 통과한다). reason 에 수 MB 문자열을 넣으면 메일 본문까지 부푼다.
--   ① 길이 제한 — feedback.content 와 같은 기준
--   ② 같은 대상 중복 신고 차단 — 재신고는 의미가 없고, 폭탄의 가장 쉬운 경로다
alter table public.reports drop constraint if exists reports_reason_len;
alter table public.reports add constraint reports_reason_len
  check (reason is null or char_length(reason) <= 1000) not valid;
create unique index if not exists uq_reports_reporter_post
  on public.reports (reporter_id, post_id) where post_id is not null;

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
declare
  recent_count int;
begin
  -- ⚠️ 메일 폭탄 차단 (출시 전 감사 2026-08-02)
  -- 신고 접수 자체는 항상 남긴다(운영자가 나중에 조회 가능). 다만 '메일 발송'은
  -- 같은 신고자가 1시간에 10건을 넘기면 생략한다 — 넘치는 알림이 진짜 신고를 묻어버리고
  -- Resend 쿼터까지 태우는 게 실제 피해이기 때문이다. post_id 가 null 인 신고는
  -- 중복 방지 인덱스로 막히지 않으므로 이 빈도 제한이 유일한 방어선이다.
  select count(*) into recent_count
    from public.reports
   where reporter_id = new.reporter_id
     and created_at > now() - interval '1 hour';
  if recent_count > 10 then
    return new;
  end if;

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

-- ============================================================
-- 9-b) 여행 DNA 설문
--   설계: docs/superpowers/specs/2026-08-05-travel-dna-survey-design.md
--   기록에서 짜내던 계절·관심사·성향 3축(35점)을 이 설문이 대체한다.
--   ⚠️ 위치 고정 — 바로 아래 public_profiles 재정의가 이 표를 참조한다.
--      뒤로 옮기면 schema.sql 재실행이 "relation does not exist"로 죽는다.
-- ============================================================
create table if not exists public.travel_dna (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  -- 응답 원본 {"1":"A","2":"B",...}. 문항을 추가하거나 가중치를 바꿔도
  -- 재검사 없이 점수를 다시 계산할 수 있다.
  answers    jsonb not null,
  -- 7축 점수(각 0~100). 순서는 클라이언트 DNA_AXES와 1:1 —
  -- plan, pace, terrain, budget, purpose, crowd, company
  scores     smallint[] not null,
  type_key   text,
  answered   smallint not null default 0,
  updated_at timestamptz not null default now()
);
-- 추천 후보 표본 조회용(최근 갱신순) — mate_suggestions의 3번째 후보 경로가 쓴다
create index if not exists idx_travel_dna_updated on public.travel_dna (updated_at desc);

alter table public.travel_dna enable row level security;

drop policy if exists "dna_select_own" on public.travel_dna;
create policy "dna_select_own" on public.travel_dna
  for select to authenticated using (user_id = auth.uid());

-- 쓰기는 아래 RPC(security definer)로만. 클라이언트가 직접 insert 하면
-- 점수를 임의로 조작해 매칭을 올릴 수 있다.
-- truncate도 반드시 회수 — RLS는 행 단위 DML만 막고 TRUNCATE는 검사하지 않는다.
-- Supabase 기본 권한이 authenticated에 폭넓게 부여하므로 명시적으로 떼지 않으면
-- 로그인한 아무나 표 전체를 통째로 지울 수 있다.
revoke insert, update, delete, truncate, references, trigger
  on public.travel_dna from anon, authenticated;

-- 응답 저장 — 점수·라벨은 클라이언트가 계산해 보내지만, 서버가 응답 원본과 함께
-- 보관하므로 이상이 발견되면 answers로 재계산해 덮어쓸 수 있다.
create or replace function public.save_travel_dna(
  p_answers jsonb, p_scores smallint[], p_type_key text, p_answered smallint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  -- 축 개수가 어긋나면 매칭 계산에서 조용히 틀어지므로 여기서 막는다
  if array_length(p_scores, 1) is distinct from 7 then
    raise exception 'travel_dna.scores must have exactly 7 elements';
  end if;
  insert into public.travel_dna (user_id, answers, scores, type_key, answered, updated_at)
  values (auth.uid(), p_answers, p_scores, p_type_key, coalesce(p_answered, 0), now())
  on conflict (user_id) do update
    set answers = excluded.answers, scores = excluded.scores,
        type_key = excluded.type_key, answered = excluded.answered, updated_at = now();
end; $$;
grant execute on function public.save_travel_dna(jsonb, smallint[], text, smallint) to authenticated;

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
         case when auth.uid() = id or public.are_neighbors(auth.uid(), id) then stay_status else null end as stay_status,
         -- 여행 DNA는 '유형 라벨만' 공개한다. 축 점수는 본인만 —
         -- 매칭 계산은 security definer RPC 안에서 도니 점수를 열 이유가 없고,
         -- '혼자 ↔ 함께' 같은 축은 그대로 노출되면 불편할 수 있다.
         (select d.type_key from public.travel_dna d where d.user_id = profiles.id) as dna_type_key
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
--
-- ⚠️ 재실행 안전성 (감사 2026-08-01 수정)
--   예전에는 여기서 `delete ... where type not in ('neighbor_request','neighbor_accept')` 로
--   정리했는데, 10-b에서 like/comment/reply/friend_post 타입이 추가된 뒤로는 이 파일을
--   재실행할 때마다 '신형 알림 전량 삭제'가 되는 파괴적 코드였다.
--   → 삭제 조건과 제약 목록을 모두 '현재 유효한 전체 타입'으로 맞춘다. 즉 남는 삭제 대상은
--     정말로 옛 모델(follow_*)의 잔재뿐이고, 재실행 시에는 0행 no-op이다.
--   (제약은 10-b에서 동일 목록으로 한 번 더 drop+add 되지만 결과는 같다.)
alter table public.notifications drop constraint if exists notifications_type_check;
update public.notifications set type = 'neighbor_request' where type = 'follow_request';
update public.notifications set type = 'neighbor_accept'  where type = 'follow_accept';
delete from public.notifications
 where type not in ('neighbor_request', 'neighbor_accept', 'like', 'comment', 'reply', 'friend_post');
alter table public.notifications add constraint notifications_type_check
  check (type in ('neighbor_request', 'neighbor_accept', 'like', 'comment', 'reply', 'friend_post'));
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

-- ⚠️ 푸시 증폭 차단 (감사 2026-08-01)
-- 10-f의 푸시 트리거를 collapse 대응으로 `after insert or update`로 넓혔기 때문에,
-- 전 컬럼 update가 열려 있으면 사용자가 자기 알림 행에
--   update notifications set created_at = now(), read = false where id = '<내 알림 id>';
-- 를 반복하는 것만으로 매번 net.http_post → send-push 를 일으킬 수 있다
-- (created_at 이 now()라 send-push의 5분 최신성 검증도 통과한다).
-- posts/neighbors/dm_messages 와 같은 컬럼 수준 권한 패턴으로 막는다.
--   · 클라이언트가 갱신하는 컬럼은 read 뿐이다
--     (markAllNotificationsRead / markNotificationsRead, src/services/social.ts)
--   · 트리거 내부의 on conflict do update(created_at·read·post_id 갱신)는
--     security definer 함수가 소유자 권한으로 실행하므로 이 회수의 영향을 받지 않는다.
revoke update on public.notifications from authenticated;
grant update (read) on public.notifications to authenticated;

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

-- 업로드/수정/삭제는 본인 폴더(media/<uid>/...)만. 읽기는 아래 참고.
--
-- ⚠️ 목록 조회 차단 (출시 전 감사 2026-08-02, CRITICAL)
-- 이전 정책은 `using (bucket_id = 'media')` 라 폴더 제한이 없어서, 로그인한
-- 아무 사용자나 storage list API 로 **남의 폴더 파일 목록을 통째로** 받아낼 수 있었다.
-- 이 버킷은 public 이라 URL만 알면 비인증으로도 원본을 내려받을 수 있고, 그
-- 유일한 방어선이 "경로를 추측할 수 없다"(<uid>/<ts>-<랜덤7자>)였는데 목록 조회가
-- 열려 있으면 그 전제가 무너진다. uid 는 public_profiles 로 공개돼 있으므로
--   POST /storage/v1/object/list/media  {"prefix":"<피해자 uid>/"}
-- 한 번이면 파일명을 전부 얻고, 그 뒤엔 인증 없이 public URL 로 원본을 받는다.
-- 대상에 visibility='private' 기록 사진, 이웃 전용 사진, DM 이미지가 포함되고
-- 차단한 상대도 막지 못한다.
--
-- → select 는 본인 폴더로 축소한다. 앱은 목록 조회를 쓰지 않고(services/media.ts 는
--   upload/getPublicUrl/remove 만 사용) 이미지 표시는 RLS 를 타지 않는 public URL
--   경로라 화면은 그대로 동작한다. 근본 해결은 아래 [선택/후속] 의 private 버킷 전환.
drop policy if exists "media_read_all" on storage.objects;  -- 옛 이름(전체 허용) 제거
drop policy if exists "media_read_own" on storage.objects;  -- 재실행 안전
create policy "media_read_own" on storage.objects
  for select to authenticated using (
    bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text
  );

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
--   ⚠️ 아래를 켤 때 select 정책을 다시 버킷 전체로 넓히지 말 것 — 그러면 위에서 막은
--      목록 조회 구멍이 되살아난다. 서명 URL 발급은 RLS 를 타지 않으므로 본인 폴더
--      정책(media_read_own)을 그대로 두면 된다.
--
-- update storage.buckets set public = false where id = 'media';
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
alter table public.profiles add column if not exists deletion_reason text;

-- 탈퇴 신청 — 이미 신청돼 있으면 최초 신청 시각 유지(중복 신청으로 유예가 연장되지 않게).
-- 신청 시각을 반환해 클라이언트가 로컬 캐시와 동기화한다.
-- p_reason: 탈퇴 사유 문자열 (기본값 null, 없는 인자로 호출된 구버전 클라이언트와 호환).
create or replace function public.request_account_deletion(p_reason text default null)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare ts timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  -- 유예 시각은 최초 신청 시각 유지(중복 신청으로 연장 방지)하되,
  -- 사유는 '이번 신청에 적은 사유'가 우선이다. 예전에는 coalesce(deletion_reason, p_reason)이라
  -- 취소 후 다시 신청해도 옛 사유가 남아 새 사유가 무시됐다(감사 2026-08-01).
  update public.profiles
     set deletion_requested_at = coalesce(deletion_requested_at, now()),
         deletion_reason       = coalesce(p_reason, deletion_reason)
   where id = auth.uid()
   returning deletion_requested_at into ts;
  return ts;
end; $$;
grant execute on function public.request_account_deletion(text) to authenticated;

-- 탈퇴 신청 취소(계정 복구)
create or replace function public.cancel_account_deletion()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  -- 사유도 함께 지운다 — 취소했는데 탈퇴 사유가 남아 있으면 다음 신청에 옛 사유가 섞이고,
  -- 남길 이유도 없는 개인정보다(감사 2026-08-01).
  update public.profiles
     set deletion_requested_at = null,
         deletion_reason       = null
   where id = auth.uid();
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

-- ============================================================
-- 10) 원격 푸시 알림 인프라
--     a) push_tokens — Expo 푸시 토큰 + 알림 수신 설정
--     b) notifications 타입·컬럼 확장 (like, comment, friend_post)
--     c) 좋아요 알림 저장 트리거
--     d) 댓글 알림 저장 트리거
--     e) 친구 새 기록 알림 저장 트리거 (이웃 대상 bulk insert)
--     f) notifications insert → send-push Edge Function 호출 트리거
-- ============================================================

-- ============================================================
-- 10-a) push_tokens
--   PK(user_id, token): 사용자가 여러 기기를 등록할 수 있음.
--   prefs jsonb: 앱에서 저장한 notifPrefs(master·likes·comments·newFollower·friendTrip·marketing).
--               없는 키 = 기본값(아래 Edge Function 규칙 참조).
-- ============================================================
create table if not exists public.push_tokens (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  token      text not null,
  platform   text,                        -- 'ios' | 'android'
  prefs      jsonb not null default '{}', -- notifPrefs 사본 (클라이언트가 함께 upsert)
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);
create index if not exists idx_push_tokens_user on public.push_tokens (user_id);

drop trigger if exists trg_push_tokens_updated on public.push_tokens;
create trigger trg_push_tokens_updated before update on public.push_tokens
  for each row execute function public.set_updated_at();

alter table public.push_tokens enable row level security;

-- 본인 토큰만 insert/upsert/update/delete/select (service_role은 RLS 우회)
drop policy if exists "push_tokens_all_own" on public.push_tokens;
create policy "push_tokens_all_own" on public.push_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 계정 전환 시 같은 기기 토큰이 이전 계정 소유로 남는 것 회수(2026-07-20 감사 H2).
-- 클라이언트 unregister가 오프라인 등으로 실패해도, 다음에 이 기기에서 로그인한 계정이
-- 등록 시점에 이 RPC로 소유권을 가져가 이전 계정으로의 푸시 발송을 끊는다.
-- RLS는 본인 행만 지울 수 있으므로 definer 함수로 우회 — 삭제 대상은 '정확히 이 토큰' 행뿐이라
-- 임의 사용자가 남의 토큰 목록을 조회·삭제하는 데 쓸 수 없다(토큰 문자열 자체가 기기 비밀).
create or replace function public.claim_push_token(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_tokens where token = p_token and user_id <> auth.uid();
$$;
revoke all on function public.claim_push_token(text) from public;
grant execute on function public.claim_push_token(text) to authenticated;

-- ============================================================
-- 10-b) notifications 타입 확장 — like / comment / friend_post 추가
--   post_id: 좋아요·댓글·친구 기록 알림에서 해당 게시물 id (딥링크용).
--   기존 neighbor_request/neighbor_accept는 post_id null.
-- ============================================================
alter table public.notifications add column if not exists post_id uuid references public.posts(id) on delete cascade;

-- 타입 제약을 확장된 목록으로 교체 (drop → recreate, idempotent)
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('neighbor_request', 'neighbor_accept', 'like', 'comment', 'reply', 'friend_post'));

-- uq_notifications_actor_type 유일 인덱스:
-- like/comment는 같은 게시물에 대한 중복 알림을 막지 않는다(like는 1인당 1개라 자연 방지;
-- comment는 여러 번 가능하므로 post_id 포함 유일 인덱스로 교체).
-- 기존 인덱스(user_id, actor_id, type)는 neighbor_*에서 유용하므로 유지하되
-- 좋아요·댓글은 트리거에서 (user_id, actor_id, type, post_id) 조합으로 on conflict 처리.
-- → 인덱스는 그대로 두고, 아래 트리거에서 on conflict(user_id, actor_id, type) do update만
--   neighbor_*에 적용하고 like/comment/friend_post는 insert(중복 허용, 단 like는 별도 방어).

-- ============================================================
-- 10-c) 좋아요 알림 저장 트리거
--   post_likes insert 시 → 게시물 작성자(본인 제외)에게 type='like' 알림.
--   join 경로: post_likes.post_id → posts.author_id
-- ============================================================
create or replace function public.notify_on_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  post_author uuid;
begin
  select author_id into post_author
    from public.posts where id = new.post_id;

  -- 자기 글 좋아요는 알림 없음 + 차단 관계면 알림 자체를 만들지 않음(정책 교체 전 잔존 행 방어 포함)
  if post_author is null or post_author = new.user_id
     or public.is_blocked_between(post_author, new.user_id) then
    return null;
  end if;

  -- (user_id=수신자, actor_id=행위자, type, post_id) 복합 충돌 처리:
  -- 같은 (수신자, 행위자, type, post_id) 중복 방지 — post_likes PK가 (post_id, user_id)라
  -- 한 사람이 같은 글에 좋아요를 두 번 누를 수 없으므로 사실상 중복 없음.
  insert into public.notifications (user_id, actor_id, type, post_id)
    values (post_author, new.user_id, 'like', new.post_id)
    on conflict (user_id, actor_id, type) do update
      set created_at = now(), read = false, post_id = excluded.post_id;
  return null;
end; $$;

drop trigger if exists trg_notify_like on public.post_likes;
create trigger trg_notify_like after insert on public.post_likes
  for each row execute function public.notify_on_like();

-- ============================================================
-- 10-d) 댓글/답글 알림 저장 트리거
--   최상위 댓글(parent_id null) → 게시물 작성자에게 type='comment' 알림.
--   답글(parent_id 있음)      → 부모 댓글 작성자에게 type='reply' 알림.
--   (게시물 작성자에게 답글 중복 알림은 보내지 않는다 — 각자 관련 알림만 받게)
-- ============================================================
create or replace function public.notify_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target uuid;
  ntype  text;
begin
  if new.parent_id is not null then
    -- 답글 → 부모 댓글 작성자에게
    select author_id into target from public.comments where id = new.parent_id;
    ntype := 'reply';
  else
    -- 최상위 댓글 → 게시물 작성자에게
    select author_id into target from public.posts where id = new.post_id;
    ntype := 'comment';
  end if;

  -- 대상이 없거나 본인 행위(자기 글/자기 댓글)면 알림 없음 + 차단 관계면 생성하지 않음
  if target is null or target = new.author_id
     or public.is_blocked_between(target, new.author_id) then
    return null;
  end if;

  -- 댓글/답글은 여러 번 올 수 있어 uq_notifications_actor_type 인덱스 충돌 가능.
  -- on conflict do update로 (대상,행위자,타입)별 가장 최근 알림만 유지(timestamp 갱신).
  insert into public.notifications (user_id, actor_id, type, post_id)
    values (target, new.author_id, ntype, new.post_id)
    on conflict (user_id, actor_id, type) do update
      set created_at = now(), read = false, post_id = excluded.post_id;
  return null;
end; $$;

drop trigger if exists trg_notify_comment on public.comments;
create trigger trg_notify_comment after insert on public.comments
  for each row execute function public.notify_on_comment();

-- ============================================================
-- 10-e) 친구 새 기록 알림 — posts insert 시 이웃들에게 type='friend_post' 알림
--   visibility 'neighbors'(또는 'public') 게시물만 대상.
--   bulk insert ... select — 이웃 수가 많아도 N 쿼리 없이 1 쿼리로 처리.
-- ============================================================
create or replace function public.notify_on_friend_post()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- private 게시물은 이웃에게도 알림 안 함
  if new.visibility = 'private' then
    return null;
  end if;

  -- accepted 이웃 전원에게 알림 삽입 (on conflict: 같은 작성자의 이전 friend_post 알림 갱신)
  insert into public.notifications (user_id, actor_id, type, post_id)
  select
    case
      when n.requester_id = new.author_id then n.addressee_id
      else n.requester_id
    end as user_id,
    new.author_id,
    'friend_post',
    new.id
  from public.neighbors n
  where n.status = 'accepted'
    and (n.requester_id = new.author_id or n.addressee_id = new.author_id)
    -- 차단 관계 제외 — 차단 시 neighbors 행이 트리거로 삭제되지만, 삭제 실패/타이밍 잔존 방어
    -- (is_blocked_between은 대칭 판정이라 한쪽이 작성자면 그대로 쓸 수 있다)
    and not public.is_blocked_between(n.requester_id, n.addressee_id)
  on conflict (user_id, actor_id, type) do update
    set created_at = now(), read = false, post_id = excluded.post_id;

  return null;
end; $$;

drop trigger if exists trg_notify_friend_post on public.posts;
create trigger trg_notify_friend_post after insert on public.posts
  for each row execute function public.notify_on_friend_post();

-- ============================================================
-- 10-f) notifications insert → send-push Edge Function 호출
--   report-alert 트리거와 동일한 pg_net 패턴.
--   예외 흡수 — 푸시 발송 실패가 알림 저장을 막으면 안 된다.
--
--   선행 조건:
--     ① supabase functions deploy send-push
--     ② (시크릿 없음 — service_role은 SUPABASE_SERVICE_ROLE_KEY 자동 주입)
--
--   INSERT 전용이면 안 되는 이유 (감사 2026-08-01):
--     uq_notifications_actor_type 유일 인덱스 때문에 같은 (수신자·행위자·타입)의 두 번째
--     알림부터는 insert가 아니라 `on conflict do update`(created_at 갱신 + read=false)로
--     collapse 된다. AFTER INSERT 전용 트리거는 이때 발화하지 않아, 예를 들어 같은 사람이
--     내 다른 글에 댓글을 달면 알림 목록에는 뜨지만 푸시는 영영 오지 않았다.
--     → INSERT OR UPDATE 로 확장하되, UPDATE 경로는 '읽지 않은 상태로 되살아난' 경우
--       (read=false 이면서 created_at 이 갱신됨)에만 발화시켜 중복 푸시를 막는다.
--       사용자가 알림을 읽음 처리(read=true)하는 update 는 created_at 이 그대로라 발화 안 함.
--     ⚠️ 남는 한계: collapse 시 post_id 가 최신 것으로 덮여 이전 알림의 딥링크는 사라진다.
--        (알림 1건 유지가 목표인 설계라 의도된 손실 — 분리하려면 유일 인덱스 설계 변경 필요)
-- ============================================================
create or replace function public.notify_send_push()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- 재알림(collapse)만 발화. 그 외 update(읽음 처리 등)는 조용히 통과.
    if not (new.read = false and new.created_at is distinct from old.created_at) then
      return new;
    end if;
  end if;

  perform net.http_post(
    url := 'https://blweolnunmsxgztmvzfd.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsd2VvbG51bm1zeGd6dG12emZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDg4MDgsImV4cCI6MjA5NjY4NDgwOH0.PQeY2ShGmCAxiwDEOQSOcgIVsSkJ_PyeG1VE8uI5fc8'
    ),
    -- UPDATE(collapse) 경로에서도 'INSERT'로 보낸다 — send-push는 payload를 신뢰하지 않고
    -- record.id로 notifications를 재조회해 검증하므로, 이 값은 '알림 발송 요청'을 뜻하는
    -- 고정 라벨일 뿐이다(send-push의 body.type 분기와 계약을 맞추기 위함).
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'notifications',
      'schema', 'public',
      'record', to_jsonb(new),
      'old_record', null
    )
  );
  return new;
exception when others then
  return new; -- 푸시 실패가 알림 저장을 막으면 안 된다
end;
$$;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push
  after insert or update on public.notifications
  for each row execute function public.notify_send_push();

-- ============================================================
-- 10-g) DM 새 메시지 → send-push 직접 호출(내용 숨김 백그라운드 푸시)
--   notifications 테이블을 거치지 않는다: (수신자·행위자·type) 유일 인덱스 collapse로
--   발신자당 최초 1회만 푸시되는 문제를 피해 메시지별로 발송한다.
--   위조/재전송 방어는 send-push가 message_id로 dm_messages를 재조회해 처리.
--   본인/차단 관계면 호출을 생략(불필요 발송 절감). report-alert와 동일한 pg_net 패턴.
--   Authorization의 anon key는 앱 번들에 포함되는 공개 키(Edge Function 기본 JWT 검증 통과용).
-- ============================================================

-- 발송 완료한 DM message_id 기록 — send-push 멱등성 근거(출시 전 감사 2026-08-02).
-- 위 anon key 로 이 함수를 직접 호출할 수 있고 발신자는 자기 message_id 를 알 수 있어,
-- 같은 id 로 반복 호출하면 피해자 단말에 푸시가 반복 발사됐다. 유니크 제약이 그 반복을 막는다.
-- (service role 만 접근 — 일반 사용자 정책 없음. 오래된 행은 아래 주석의 정리 SQL 참고.)
create table if not exists public.dm_push_sent (
  message_id uuid primary key references public.dm_messages(id) on delete cascade,
  sent_at    timestamptz not null default now()
);
alter table public.dm_push_sent enable row level security;
create index if not exists idx_dm_push_sent_at on public.dm_push_sent (sent_at);
-- [선택·수동] 보존 정리: delete from public.dm_push_sent where sent_at < now() - interval '7 days';

create or replace function public.notify_on_dm()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  recipient uuid;
begin
  select case when t.user_a = new.sender_id then t.user_b else t.user_a end
    into recipient
    from public.dm_threads t where t.id = new.thread_id;

  if recipient is null or recipient = new.sender_id
     or public.is_blocked_between(recipient, new.sender_id) then
    return new;
  end if;

  perform net.http_post(
    url := 'https://blweolnunmsxgztmvzfd.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsd2VvbG51bm1zeGd6dG12emZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDg4MDgsImV4cCI6MjA5NjY4NDgwOH0.PQeY2ShGmCAxiwDEOQSOcgIVsSkJ_PyeG1VE8uI5fc8'
    ),
    body := jsonb_build_object('type', 'dm', 'message_id', new.id)
  );
  return new;
exception when others then
  return new; -- 푸시 실패가 메시지 저장을 막으면 안 된다
end;
$$;

drop trigger if exists trg_notify_dm on public.dm_messages;
create trigger trg_notify_dm
  after insert on public.dm_messages
  for each row execute function public.notify_on_dm();

-- ============================================================
-- 11) 피드 광고 캠페인 — 제휴(어필리에이트) 캠페인 원격 관리
-- ============================================================
-- 앱 업데이트 없이 캠페인을 교체·종료하기 위해 서버에서 관리한다.
-- 국가 타겟팅(target_countries)은 서버가 아니라 클라이언트에서 필터링한다 —
-- 사용자의 여행 국가를 서버로 보내지 않기 위함(개인정보처리방침 부담 회피).
-- 따라서 조회는 활성 캠페인 전체를 내려주고, 매칭은 앱이 한다.

create table if not exists public.ad_campaigns (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  partner           text not null,               -- airalo / klook / coupang / getyourguide
  headline_ko       text not null,
  headline_en       text not null,
  image_url         text not null,
  click_url         text not null,
  disclosure_ko     text,                        -- 제휴사 필수 고지 문구(쿠팡 등)
  disclosure_en     text,
  target_countries  text[] not null default '{}',-- ISO2 대문자. 빈 배열이면 전체 대상
  locales           text[] not null default '{ko,en}',
  weight            int  not null default 1,
  starts_at         timestamptz,
  ends_at           timestamptz,
  active            boolean not null default true,
  click_count       int  not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists ad_campaigns_active_idx
  on public.ad_campaigns (active, starts_at, ends_at);

alter table public.ad_campaigns enable row level security;

-- 조회: 활성이고 기간 내인 행만 누구나(비로그인 포함) 볼 수 있다.
drop policy if exists ad_campaigns_select_active on public.ad_campaigns;
create policy ad_campaigns_select_active on public.ad_campaigns
  for select
  using (
    active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at   is null or ends_at   >= now())
  );

-- 삽입·수정·삭제 정책 없음 → service_role(정책 우회)만 쓰기 가능.

-- 클릭 집계: 익명 카운터. 사용자 식별자를 저장하지 않는다.
-- (노출은 집계하지 않는다 — 스크롤마다 RPC가 나가고 방침에 항목이 늘어난다.)
create or replace function public.log_ad_click(p_campaign_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ad_campaigns
     set click_count = click_count + 1
   where id = p_campaign_id;
$$;

-- 실행 권한은 로그인 사용자로 한정 (감사 2026-08-01).
-- anon 에게 열려 있으면 공개 anon key만으로 아무나 click_count 를 무한 증가시켜
-- 제휴 성과 지표를 오염시킬 수 있었다. 광고 슬롯(FeedAdSlot)은 소셜 피드에서만 렌더되고
-- 소셜 피드는 로그인 이후 화면이라, anon 회수로 깨지는 클라이언트 흐름은 없다
-- (logAdClick 실패는 src/services/adCampaigns.ts 에서 무시 — 링크 이동이 우선).
-- ⚠️ 남는 한계: 로그인 사용자의 반복 호출은 여전히 막지 못한다(사용자 식별자를 저장하지
--    않는다는 방침상 rate limit을 걸 자리가 없다). 지표는 '대략치'로만 취급할 것.
revoke all on function public.log_ad_click(uuid) from public, anon;
grant execute on function public.log_ad_click(uuid) to authenticated;

-- ============================================================
-- 11) 알림 보존 정리
--   앱은 7일 지난 알림을 조회·집계에서 제외한다(클라이언트 NOTIFICATION_MAX_AGE_MS).
--   서버 행은 그대로 쌓이므로 주기적으로 지운다 — 안 지우면 테이블·인덱스가 무한히
--   커지고, 사용자당 행이 많아지면 unread count 집계도 느려진다.
--   관리자/서비스롤이 실행하거나 pg_cron으로 스케줄:
--     select cron.schedule('purge-notifications', '0 4 * * *', $$select public.purge_old_notifications()$$);
-- ============================================================
create or replace function public.purge_old_notifications(older_than interval default interval '30 days')
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer := 0;
begin
  -- 클라이언트 표시 기준(7일)보다 넉넉히 잡는다 — 기준을 늘릴 여지를 남기고,
  -- 읽지 않은 알림이 곧바로 사라져 사용자가 놓치는 일을 피한다.
  delete from public.notifications where created_at < now() - older_than;
  get diagnostics n = row_count;
  return n;
end; $$;

-- 일반 사용자는 실행 불가(관리자/서비스롤 전용)
revoke all on function public.purge_old_notifications(interval) from public, anon, authenticated;

-- ============================================================
-- 12) 추천 메이트(여행 DNA) 결과 캐시
--
--   왜 필요한가: mate_suggestions_compute 는 호출 1회에 private 아닌 posts 전량을 나라 단위로
--   펼치고 희소성 가중치까지 계산한다. 규모에 정비례하는 비용인데, 클라이언트는 발견 화면에
--   들어올 때마다(SocialScreen·FriendSearchScreen) 이걸 그대로 호출하고 있었다.
--   게시물이 수만 건이 되면 이 함수 하나가 인스턴스 CPU를 독점한다.
--
--   해법: 사용자·파라미터 조합별로 결과를 저장하고 TTL 안에서는 그대로 돌려준다.
--   pg_cron 배치가 아니라 '첫 호출 때 계산해 넣는' 지연 캐시라 등록할 스케줄이 없고,
--   가입 직후 사용자도 첫 진입에서 바로 결과를 받는다.
-- ============================================================
create table if not exists public.mate_suggestions_cache (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  -- 같은 사용자라도 match_limit·extra_countries(로컬 나라 보강)가 다르면 결과가 다르다.
  params_key  text not null,
  rows        jsonb not null,
  computed_at timestamptz not null default now(),
  primary key (user_id, params_key)
);

alter table public.mate_suggestions_cache enable row level security;
-- 클라이언트는 이 표를 직접 읽거나 쓰지 않는다 — 접근 경로는 아래 security definer 함수뿐.
-- (RLS 켜고 정책을 두지 않으면 authenticated 는 아무 행도 못 본다)
revoke all on table public.mate_suggestions_cache from anon, authenticated;

-- 내 기록이 늘면 내 추천 입력이 달라진다 → 내 캐시를 버려 다음 진입에서 새로 계산되게.
-- (타인 캐시는 건드리지 않는다. 하루 안에 새 사용자가 반영되지 않는 정도는 TTL로 흡수)
create or replace function public.invalidate_mate_cache()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  -- ⚠️ DELETE 트리거에서 new 는 미할당이라 필드를 읽으면 예외가 난다(coalesce로도 못 피한다).
  --    반드시 tg_op 로 분기할 것.
  if tg_op = 'DELETE' then uid := old.author_id; else uid := new.author_id; end if;
  delete from public.mate_suggestions_cache where user_id = uid;
  return null;
exception when others then
  return null; -- 캐시 정리 실패가 게시물 저장을 막으면 안 된다
end; $$;

drop trigger if exists trg_posts_invalidate_mate_cache on public.posts;
create trigger trg_posts_invalidate_mate_cache
  after insert or delete on public.posts
  for each row execute function public.invalidate_mate_cache();

-- 캐시 래퍼 — 앱이 호출하는 이름은 계속 mate_suggestions 다(클라이언트 변경 없음).
-- TTL 6시간: 추천 목록의 신선도보다 인스턴스 CPU를 지키는 쪽이 중요하고, 새 기록을 올리면
-- 위 트리거가 즉시 무효화하므로 '내가 뭘 해도 안 바뀌는' 체감은 생기지 않는다.
create or replace function public.mate_suggestions(match_limit int default 10, extra_countries text[] default '{}')
returns table (
  author_id uuid, handle text, emoji text, profile_photo text,
  shared_count int, sample_countries text[], mutual_count int, style_score int, total_score int,
  place_score int, recency_score int, season_score int, interest_score int, taste_score int,
  mutual_score int,
  shared_cities text[], shared_keywords text[]
)
language plpgsql security definer set search_path = public as $$
-- returns table(...)의 출력 컬럼명(author_id·handle·…)은 plpgsql 안에서 변수로도 잡힌다.
-- 아래 return query 가 같은 이름의 컬럼을 조회하므로 모호성이 생길 수 있어 '컬럼 우선'으로 못박는다.
#variable_conflict use_column
declare
  me     uuid := auth.uid();
  key    text;
  cached jsonb;
  fresh  jsonb;
begin
  if me is null then return; end if;

  -- 파라미터 정규화 — 순서만 다른 같은 나라 목록이 서로 다른 캐시 항목이 되지 않게 정렬해서 해싱한다.
  key := match_limit::text || ':' || md5(coalesce(
           (select string_agg(c, ',' order by c) from unnest(coalesce(extra_countries, '{}')) as c), ''));

  select c.rows into cached
    from public.mate_suggestions_cache c
   where c.user_id = me and c.params_key = key
     and c.computed_at > now() - interval '6 hours';

  if cached is null then
    select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into fresh
      from public.mate_suggestions_compute(match_limit, extra_countries) s;
    insert into public.mate_suggestions_cache (user_id, params_key, rows, computed_at)
    values (me, key, fresh, now())
    on conflict (user_id, params_key)
      do update set rows = excluded.rows, computed_at = excluded.computed_at;
    cached := fresh;
  end if;

  return query
  select r.author_id, r.handle, r.emoji, r.profile_photo,
         r.shared_count, r.sample_countries, r.mutual_count, r.style_score, r.total_score,
         r.place_score, r.recency_score, r.season_score, r.interest_score, r.taste_score,
         r.mutual_score, r.shared_cities, r.shared_keywords
    from jsonb_to_recordset(cached) as r(
      author_id uuid, handle text, emoji text, profile_photo text,
      shared_count int, sample_countries text[], mutual_count int, style_score int, total_score int,
      place_score int, recency_score int, season_score int, interest_score int, taste_score int,
      mutual_score int, shared_cities text[], shared_keywords text[]
    );
end; $$;

grant execute on function public.mate_suggestions(int, text[]) to authenticated;

-- 오래된 캐시 정리(선택) — 행이 사용자당 몇 개라 급하지 않다. 필요하면 pg_cron에 등록:
--   select cron.schedule('purge-mate-cache', '30 4 * * *',
--     $$delete from public.mate_suggestions_cache where computed_at < now() - interval '7 days'$$);

-- ============================================================
-- 실행 후 사후 점검 (수동)
--   handle 대소문자 유일 인덱스는 '이미 중복이 있으면' 경고만 남기고 건너뛴다(1) 섹션).
--   경고는 SQL Editor 출력에서 놓치기 쉬우므로, 실행 뒤 아래 한 줄로 실제 생성 여부를 확인할 것.
--   결과가 1이면 정상, 0이면 중복 정리 후 이 파일을 다시 실행해야 한다.
--
-- select count(*) from pg_indexes
--  where schemaname = 'public' and indexname = 'uq_profiles_handle_lower';
--
--   0이 나왔다면 중복 목록:
-- select lower(handle), count(*) from public.profiles
--  where handle is not null group by 1 having count(*) > 1;
-- ============================================================
