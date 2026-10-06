-- ============================================================
-- 2026-10-05 · overlap_with 나라 이름 표본 상한 3 → 30 (+ 이름순 정렬)
--
-- 왜: 타인 프로필 "나와 겹치는 나라 N곳" 행을 탭하면 나라 이름 팝오버가 뜨고, 한 페이지에
--     최대 4개씩 '•••'로 넘겨 본다(FriendProfileScreen). 그런데 서버가 이름을 `[1:3]`으로
--     잘라 내려 주어 4개를 넘는 페이지가 영영 생기지 않았다.
--
-- 무엇: `public.overlap_with` 의 마지막 select 한 곳만 바뀐다.
--   · `[1:3]` → `[1:30]`
--   · `array_agg(sk.country_name)` → `array_agg(sk.country_name order by sk.country_name)`
--     (호출마다 순서가 바뀌면 페이지를 넘길 때 나라가 섞여 보인다)
--   나머지(프로빙 가드·extra 상한 30·tombstone 제외·차단/추천거부 게이트·k-익명 필터)는 schema.sql 본문과
--   한 글자도 다르지 않다. 이름 공개 기준(k_anon_min)은 그대로다 — 늘어나는 것은 '이미 공개 기준을
--   통과한 겹친 나라' 중 몇 개까지 내려 주느냐뿐이다.
--
-- 호환: 반환 타입(shared_count int, sample_countries text[])·인자 불변 → drop 없이 create or replace.
--   앱은 배열 길이를 가정하지 않는다 — 이 SQL이 반영되기 전엔 ≤3개라 '•••'가 안 뜰 뿐 정상 동작한다.
--
-- ⚠️ 운영(blweol…)·테스트(bqwmx…) 양쪽 SQL Editor에서 실행할 것(베타 앱은 테스트 프로젝트를 본다).
-- 재실행 안전(create or replace).
--
-- 롤백: 아래 본문의 마지막 select에서 `order by sk.country_name` 을 빼고 `[1:30]` 을 `[1:3]` 으로
--   되돌려 같은 방식(create or replace)으로 다시 실행한다. 앱은 어느 쪽이든 동작한다.
--
-- 확인:
--   select pg_get_functiondef('public.overlap_with(uuid, text[])'::regprocedure) like '%array_agg(sk.country_name order by sk.country_name)%';  -- true (예전 본문은 false. '[1:30]'은 extra 상한에도 있어 판별에 못 씀)
-- ============================================================

create or replace function public.overlap_with(target uuid, extra_countries text[] default '{}')
returns table (shared_count int, sample_countries text[])
language plpgsql security definer set search_path = public as $$
-- returns table의 출력 컬럼명이 plpgsql 안에서 변수로도 잡힌다 — 조회 안의 같은 이름과
-- 모호해지지 않게 '컬럼 우선'으로 못박는다(mate_suggestions 래퍼와 같은 처리).
#variable_conflict use_column
declare
  norm text;
begin
  if auth.uid() is null then return; end if;

  -- 프로빙 가드(3-b) — 아래 상한 30은 '한 번에 통째로 넣고 반씩 쪼개는' 이분 탐색만 막는다.
  -- 나라를 하나씩 바꿔 재호출하면 배열은 늘 짧으므로 상한에 걸리지 않고, shared_count가
  -- 0인지 1인지만 봐도 target의 방문 여부가 확정된다. 서로 다른 집합의 '종류 수'를 세서
  -- 시간당 20종을 넘기면 그때부터 extra를 버린다(예외는 던지지 않는다).
  norm := coalesce((select string_agg(c, ',' order by c)
                      from unnest(coalesce(extra_countries, '{}')) as c), '');
  if norm <> '' and not public.probe_guard_ok('overlap_with', norm, 20) then
    extra_countries := '{}';
  end if;

  return query
  with me as (select auth.uid() as uid),
  my_countries as (
    select p.country_name from public.posts p, me
    -- 지운 글(tombstone) 제외 — security definer라 posts_select의 필터가 안 탄다.
    where p.deleted_at is null
      and p.author_id = me.uid and p.visibility <> 'private'
      and p.country_name is not null and p.country_name <> ''
    union
    -- ⚠️ 상한 30 — 호출자가 넣은 배열이 그대로 비교 집합이 되므로, 전 세계 국가를 통째로
    --    넣고 배열을 반씩 쪼개 재호출하면(이분 탐색) 대상의 방문국을 전부 특정할 수 있었다.
    select c from unnest(extra_countries[1:30]) as c where c is not null and c <> ''
  ),
  shared as (
    select distinct p.country_name
    from public.posts p, me
    -- 지운 글(tombstone) 제외 — security definer라 posts_select의 필터가 안 탄다.
    where p.deleted_at is null
      and p.author_id = target and p.visibility <> 'private'
      -- 차단 관계면 빈 결과 — mate_suggestions·country_visitors 와 같은 게이트를
      -- 이 함수만 빠뜨려, 나를 차단한 사람의 '이웃 전용' 기록 국가까지 캐낼 수 있었다.
      and not public.is_blocked_between(me.uid, target)
      -- 추천 노출 거부자면 빈 결과 — 프로필의 "겹치는 나라 N곳"도 내 기록으로 상대의
      -- 방문국을 확인하는 경로다(mate_reco_optin 주석 — null은 통과).
      and not exists (
        select 1 from public.profiles pr
        where pr.id = target and pr.mate_reco_optin is false
      )
      and p.country_name in (select country_name from my_countries)
  ),
  -- k-익명성 — 겹친 나라 중 방문자가 k명 미만인 곳은 '이름'을 내주지 않는다.
  -- shared_count(개수)는 그대로라 화면의 "겹치는 나라 N곳"은 변하지 않는다.
  -- 겹친 나라는 보통 한 자릿수라 나라마다 세도 부담이 없다(idx_posts_country_shared).
  shared_k as (
    select s.country_name,
           (select count(distinct p2.author_id)
              from public.posts p2
             -- 지운 글(tombstone) 제외 — security definer라 posts_select의 필터가 안 탄다.
             -- (k-익명성 분모라 여기만 빠뜨리면 이름 공개 임계 판정이 실제보다 관대해진다)
             where p2.deleted_at is null
               and p2.visibility <> 'private'
               and p2.country_name = s.country_name) as visitors
    from shared s
  )
  -- 이름 표본 상한 30(2026-10-05, 예전 3) — 프로필 팝오버가 4개씩 넘겨 보여 주므로 3개로 자르면
  -- 두 번째 페이지가 영영 안 생긴다. 이름 공개 기준(k-익명 필터)은 그대로이고, 애초에 '내 나라
  -- 집합'(my_countries, extra 상한 30)과 겹친 것만 나오므로 30이면 사실상 전부다.
  -- order by — 호출마다 순서가 바뀌면 페이지를 넘길 때 나라가 섞여 보인다.
  select count(*)::int,
         coalesce((array_agg(sk.country_name order by sk.country_name)
                     filter (where sk.visitors >= public.k_anon_min()))[1:30], '{}'::text[])
  from shared_k sk;
end; $$;
grant execute on function public.overlap_with(uuid, text[]) to authenticated;
