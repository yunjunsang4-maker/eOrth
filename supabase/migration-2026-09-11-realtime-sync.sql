-- ============================================================
-- 2026-09-11 · 기기 간 동기화의 **실시간 트리거** (완전 동기화 5단계)
--
-- 단계 번호 정리(문서마다 어긋나지 않게 여기 못 박는다):
--   1단계 `migration-2026-09-08-post-soft-delete.sql`      — 글 수정·삭제의 기기 간 전파
--   2단계 `migration-2026-09-08-tombstone-aggregates.sql`  — 1단계 후속(집계 tombstone 제외 + purge)
--   3단계 `migration-2026-09-08-trip-cards-sync.sql`       — 여행 카드의 기기 간 동기화
--   4단계 `migration-2026-09-09-state-flags-sync.sql`      — 부가상태 집합 6종의 기기 간 동기화
--   5단계 이 파일                                          — 위 셋을 **새로고침 없이** 당겨오는 신호
--
-- schema.sql 에 이미 반영돼 있다
-- (`4-c-3c) user_sync_signals` 절 + 실시간 publication 블록 + 파일 끝 일괄 revoke 목록).
-- 이 파일은 전체 재실행 대신 **바뀐 부분만** 적용하려는 경우용 발췌본이다.
-- 전부 멱등이라 두 방법 중 아무거나, 몇 번 실행해도 안전하다.
--
-- ⚠️ **운영(blweol…)과 테스트(bqwmx…) 양쪽 프로젝트 모두에서 실행할 것.**
--    베타 앱은 테스트 프로젝트를 본다. 한쪽만 실행하면 그쪽에서만 실시간 반영이 되어
--    "아이폰은 바로 뜨는데 안드로이드는 안 뜬다" 같은 오판으로 이어진다.
--
-- ⚠️ 배포 순서: 이 SQL 먼저 → 아래 확인 쿼리 → 그 다음에 OTA.
--    다만 앱이 먼저 나가도 **사고는 없다** — 표가 없으면 앱의 구독이 조용히 아무 이벤트도
--    못 받고, 기존 트리거(포그라운드 복귀 60초 throttle · 프로필 당겨서 새로고침)로
--    이전과 똑같이 동작한다(아래 "표가 없을 때" 절).
--
-- 전제(확장 등): **없다.** pg_cron 도 필요 없다(이번에도 스케줄 잡 미등록).
--   (2단계 델타에서 테스트 프로젝트에 pg_cron 이 없어 3F000 으로 전체 롤백된 사고가 있었다.
--    이 파일은 확장에 의존하지 않으므로 그 함정이 재발하지 않는다.)
--
-- 전제(선행 표): `public.posts` · `public.user_trip_cards`(3단계) · `public.user_state_flags`(4단계)가
--   **이미 있어야 한다.** 셋 다 SERVER-STATE.md 기준 반영 완료 상태다. 없으면 아래 3)의
--   create trigger 가 42P01(relation does not exist)로 실패하며, 그 경우 이 파일 전체가 롤백된다.
-- ============================================================

-- ── 1) 신호 표 ──
-- 왜 새 표인가: posts·user_trip_cards·user_state_flags 를 직접 구독하지 않기 위해서다.
--   ① postgres_changes 는 **바뀐 행 전체**를 내려보낸다. posts.data(jsonb)는 앨범 글이면 사진
--      100장 URL로 수십 KB인데, 남이 누른 좋아요 하나가 만드는 likes_count UPDATE 마다 그
--      본문 전체가 작성자의 모든 기기로 내려온다(앱은 그 값을 쓰지도 않는다 — 순수 이그레스).
--   ② 표 3개를 구독하면 WAL 디코딩과 구독자별 RLS 평가가 3벌 돈다.
-- 이 표는 사용자당 1행·수십 바이트이고, 앱은 **페이로드를 읽지 않는다**(신호일 뿐).
--
-- ⚠️ **데이터 경로가 아니라 트리거다.** 앱은 이벤트가 오면 디바운스 뒤 기존 syncMyRecords()를
--    부를 뿐이다. 여기에 두 번째 병합 경로를 만들면 1~4단계 QA 보증이 통째로 무효가 된다.
create table if not exists public.user_sync_signals (
  user_id   uuid primary key references public.profiles(id) on delete cascade,
  domain    text,                                  -- 마지막 변경 도메인('posts'|'cards'|'flags')
  bumped_at timestamptz not null default now()
);

-- domain 은 **진단용이다. 앱의 판정에 쓰지 않는다.** 신호가 겹치면 마지막 것만 남으므로
-- 이 값으로 "무엇을 동기화할지"를 고르면 반드시 하나를 빠뜨린다(앱은 항상 전체 체인을 돈다).
-- 인덱스 추가 없음 — 조회는 Realtime 의 RLS 평가(user_id = auth.uid())뿐이고 PK 가 커버한다.
-- set_updated_at 트리거도 걸지 않는다 — updated_at 컬럼 자체가 없고 bumped_at 은 함수가 넣는다.

-- ── 2) RLS — 본인 행 **select 만** ──
-- ⚠️ insert/update/delete 정책을 **의도적으로 만들지 않는다.** 쓰는 주체는 아래 트리거뿐이고,
--    트리거 함수가 security definer 라 정책 없이도 쓴다. 클라이언트에 쓰기를 열면
--    남의 기기를 임의로 깨우는(동기화 폭주) 수단이 된다.
alter table public.user_sync_signals enable row level security;

drop policy if exists "user_sync_signals_select_own" on public.user_sync_signals;
create policy "user_sync_signals_select_own" on public.user_sync_signals
  for select to authenticated using (user_id = auth.uid());

-- ── 3) 신호 갱신 함수 + 트리거 3개 ──
-- security definer 인 이유: 위 표에 쓰기 정책이 없어 호출자 권한으로는 못 쓴다(notify_on_like 패턴).
--
-- ⚠️ **예외를 반드시 삼킨다.** 신호 갱신 실패로 본 트랜잭션(글 저장·카드 저장·부가상태 저장)이
--    롤백되면 편의 기능 하나 때문에 실제 데이터가 날아간다(invalidate_mate_cache 와 같은 판단).
--    실패해도 기존 트리거가 남아 있어 반영이 늦어질 뿐이다.
--
-- ⚠️ 성능 — 알아 두고 넘어가는 항목(현 규모에서는 문제 없음):
--    · **사용자당 1행에 몰리는 구조**라, 같은 사용자의 글에 동시 다발 변경이 쏟아지면 그 1행에
--      행 잠금 경합이 이론상 생긴다(현재 규모에서는 무관).
--    · 좋아요·댓글 카운터 갱신이 신호를 만들던 문제는 **posts 트리거의 컬럼 한정으로 이미
--      제거했다**(아래 create trigger 주석). 남은 완화 수단은 현재 필요 없다.
create or replace function public.bump_sync_signal()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  dom text;
begin
  -- 표마다 소유자 컬럼 이름이 다르다: posts=author_id, 나머지=user_id
  -- (DELETE 트리거를 걸지 않으므로 new 는 항상 할당돼 있다 — invalidate_mate_cache 가 tg_op
  --  분기를 해야 했던 이유가 여기엔 없다)
  if tg_table_name = 'posts' then
    uid := new.author_id;
    dom := 'posts';
  elsif tg_table_name = 'user_trip_cards' then
    uid := new.user_id;
    dom := 'cards';
  else
    uid := new.user_id;
    dom := 'flags';
  end if;
  if uid is null then return null; end if;

  insert into public.user_sync_signals (user_id, domain, bumped_at)
    values (uid, dom, now())
    on conflict (user_id) do update
      set bumped_at = now(), domain = excluded.domain;
  return null;
exception when others then
  return null; -- 신호 실패가 본 트랜잭션을 막으면 안 된다
end; $$;

-- ⚠️ **DELETE 트리거는 일부러 없다.** 1~4단계의 삭제는 전부 tombstone(= deleted_at 을 채우는
--    UPDATE)이라 update 트리거가 이미 잡는다. 진짜 hard delete 는 purge cron 뿐인데, 그 대상은
--    "표식이 찍힌 지 30일이 지나 이미 모든 기기가 반영을 끝낸 행"이라 기기를 깨울 이유가 없다
--    (오히려 전 사용자 신호를 한꺼번에 튕겨 동기화 폭주를 만든다).
-- ⚠️ **posts 트리거만 컬럼을 한정한다.** 목록은 `schema.sql` 의 `2) posts` 절 끝에 있는
--    `grant update (visibility, view_type, country_name, data, client_id, deleted_at)` 와
--    **정확히 같은 집합**이다 — 클라이언트가 실제로 바꿀 수 있는 컬럼이 곧 "다른 기기에 알릴
--    가치가 있는 변경"이기 때문이다. **둘은 항상 같이 고칠 것**(한쪽만 늘리면 새 컬럼 변경이
--    조용히 전파되지 않는다).
--    배제되는 것은 정확히 `likes_count`·`comments_count`·`updated_at` 셋이다:
--      · 좋아요·댓글 카운터는 **남의 행동**이라 내 기기를 깨울 이유가 없다. 한정하지 않으면
--        인기 글 하나만으로 작성자의 켜진 모든 기기가 5초마다 syncMyRecords 1회(프로브 3회)를
--        무기한 반복한다(이 구독이 포그라운드 60초 throttle 을 의도적으로 우회하므로 상한이
--        12배가 된다).
--      · 카운터의 기기 간 반영은 기존 `refreshMyPostCounts`(src/store/recordStore.tsx)가 이미
--        담당한다 — 이 한정으로 잃는 기능이 없다.
--      · `updated_at` 은 set_updated_at 트리거가 채우는 파생 값이라 단독으로 바뀌지 않는다.
drop trigger if exists trg_posts_bump_sync_signal on public.posts;
create trigger trg_posts_bump_sync_signal
  after insert or update of visibility, view_type, country_name, data, client_id, deleted_at
  on public.posts
  for each row execute function public.bump_sync_signal();

drop trigger if exists trg_user_trip_cards_bump_sync_signal on public.user_trip_cards;
create trigger trg_user_trip_cards_bump_sync_signal
  after insert or update on public.user_trip_cards
  for each row execute function public.bump_sync_signal();

drop trigger if exists trg_user_state_flags_bump_sync_signal on public.user_state_flags;
create trigger trg_user_state_flags_bump_sync_signal
  after insert or update on public.user_state_flags
  for each row execute function public.bump_sync_signal();

-- ── 4) 실시간 publication 등재 ──
-- ⚠️ **이 한 블록을 빠뜨리면 나머지가 전부 맞아도 앱이 이벤트를 영영 못 받는다.**
--    에러도 안 난다 — dm_messages·notifications 에서 이미 밟은 함정이다.
-- 이미 등재돼 있으면 duplicate_object 로 no-op(멱등).
-- publication 자체가 없는 환경(셀프호스팅 등)은 undefined_object 로 건너뛴다.
do $$ begin
  alter publication supabase_realtime add table public.user_sync_signals;
exception when duplicate_object then null;
        when undefined_object then null;
end $$;

-- ── 5) 위험 권한 회수 ──
-- schema.sql 끝의 일괄 revoke 목록에 이 표를 추가했다. 발췌 실행 시에도 맞추려면 이 한 줄.
-- ⚠️ 여기서 `revoke select` 로 더 좁히지 말 것 — Realtime 의 postgres_changes 는 구독자의
--    select 권한 + RLS 로 전달 여부를 정하므로, select 를 회수하면 이벤트가 조용히 끊긴다.
revoke truncate, references, trigger on public.user_sync_signals from anon, authenticated;


-- ============================================================
-- 반영 확인 — 위 5개를 실행한 뒤 이 블록을 돌려 결과를 확인한다
-- ============================================================
-- 1번: 3개 컬럼(user_id, domain, bumped_at). domain 은 is_nullable='YES'
select column_name, data_type, is_nullable from information_schema.columns
 where table_schema='public' and table_name='user_sync_signals'
 order by ordinal_position;

-- 2번: PK 가 user_id 한 컬럼 — 1행
select a.attname from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
 where i.indrelid = 'public.user_sync_signals'::regclass and i.indisprimary;

-- 3번: 트리거 3개가 **정확히** 이 이름으로 걸려야 한다 — 3행. 기대 정의:
--      · trg_posts_bump_sync_signal            → AFTER INSERT OR UPDATE OF
--        **visibility, view_type, country_name, data, client_id, deleted_at** ON public.posts
--        (UPDATE OF 목록이 안 보이면 컬럼 한정이 빠진 것이다 — 좋아요·댓글 카운터가 신호를
--         만들게 되므로 drop 후 재생성할 것)
--      · trg_user_trip_cards_bump_sync_signal  → AFTER INSERT OR UPDATE (컬럼 한정 없음)
--      · trg_user_state_flags_bump_sync_signal → AFTER INSERT OR UPDATE (컬럼 한정 없음)
--      (information_schema.triggers 가 아니라 pg_get_triggerdef 를 쓰는 이유가 바로 이것이다:
--       전자는 UPDATE OF 컬럼 목록을 보여주지 않아 "있는데 다르게 걸린" 트리거를 못 잡는다.
--       또 INSERT/UPDATE 를 각각 별도 행으로 쪼개 보여줘 개수 세기가 헷갈린다)
select tgname, pg_get_triggerdef(oid) from pg_trigger
 where tgname in ('trg_posts_bump_sync_signal',
                  'trg_user_trip_cards_bump_sync_signal',
                  'trg_user_state_flags_bump_sync_signal')
   and not tgisinternal
 order by tgname;

-- 4번: publication 등재 — **가장 조용히 실패하는 항목이다. 반드시 확인할 것.** 1행
select schemaname, tablename from pg_publication_tables
 where pubname = 'supabase_realtime' and tablename = 'user_sync_signals';

-- 5번: RLS 켜짐(t) — 1행
select relrowsecurity from pg_class where oid = 'public.user_sync_signals'::regclass;

-- 6번: 정책이 **select 1개뿐**이어야 한다. insert/update/delete 정책이 보이면 잘못 실행된 것이다
--      (클라이언트가 남의 기기를 깨울 수 있게 된다)
select policyname, cmd, qual, with_check from pg_policies
 where tablename='user_sync_signals';

-- 7번: authenticated 의 SELECT **권한**(grant) — t 여야 한다.
--      RLS 정책(6번)이 있어도 테이블 권한이 없으면 postgres_changes 가 이벤트를 전달하지 않는다.
--      이 표에 명시 grant 를 두지 않고 Supabase 기본 권한(alter default privileges)에 기대고
--      있으므로(user_trip_cards·user_state_flags 와 같은 형태), 그 전제가 프로젝트 설정 차이로
--      깨졌는지를 여기서만 볼 수 있다. f 가 나오면 `grant select on public.user_sync_signals
--      to authenticated;` 한 줄을 실행할 것.
select has_table_privilege('authenticated', 'public.user_sync_signals', 'select');

-- ⚠️ 위 7개는 "객체가 있다"만 본다. 실제로 도는지는 앱 계정(authenticated) 세션으로
--    글을 하나 저장한 뒤 `select * from public.user_sync_signals where user_id = auth.uid();`
--    의 bumped_at 이 방금 시각으로 올라가는지, 그리고 다른 기기에서 새로고침 없이 반영되는지까지
--    봐야 확정된다.


-- ============================================================
-- 표가 없을 때(= 이 SQL 을 아직 안 돌렸을 때) 앱은 어떻게 되는가 — 하위 호환 계약
--
--   subscribeSyncSignals() → 채널은 열리지만 **이벤트가 하나도 안 온다**(에러도 안 난다).
--   → 실시간 반영만 꺼지고, 기존 트리거 둘(포그라운드 복귀 60초 throttle · 프로필 당겨서
--     새로고침)이 그대로 남아 4단계까지의 동작은 완전히 동일하다.
--
-- publication 등재만 빠진 경우도 증상이 **똑같다**(조용한 무동작). 그래서 확인 쿼리 4번이 중요하다.
-- ============================================================


-- ============================================================
-- (선택·미등록) 신호 행 정리 — cron 에 등록하지 않는다
--
-- 사용자당 1행·수십 바이트라 쌓이지 않는다(upsert 라 행이 늘지 않는다). 계정이 지워지면
-- profiles 의 on delete cascade 가 함께 지운다. 지울 이유가 생기지 않는 표다.
--
-- 되돌리기(기능 철회 시) — 트리거를 먼저 떼고 표를 지운다. 순서를 뒤집으면 트리거가 없는
-- 표를 참조해 실패한다:
--
-- drop trigger if exists trg_posts_bump_sync_signal on public.posts;
-- drop trigger if exists trg_user_trip_cards_bump_sync_signal on public.user_trip_cards;
-- drop trigger if exists trg_user_state_flags_bump_sync_signal on public.user_state_flags;
-- drop function if exists public.bump_sync_signal();
-- do $$ begin
--   alter publication supabase_realtime drop table public.user_sync_signals;
-- exception when others then null;
-- end $$;
-- drop table if exists public.user_sync_signals;
-- ============================================================
