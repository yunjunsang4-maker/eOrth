-- ============================================================
-- 여행 DNA 매칭 점수(total_score) 분포 분석 — 일회성 조회용
--
-- 목적: 메이트찾기의 'N% 일치' 배지를 실제 데이터에 맞게 보정한다.
--       (src/screens/FriendSearchScreen.tsx의 MATCH_SCORE_FULL / 하한 30%)
--
-- 왜 RPC를 직접 못 부르나:
--   mate_suggestions()는 auth.uid()로 '나'를 정하는 SECURITY DEFINER 함수라,
--   SQL 에디터(postgres 롤)에서 부르면 uid가 NULL이라 항상 빈 결과가 나온다.
--   그래서 아래 쿼리는 같은 점수 공식을 '모든 사용자 쌍'에 대해 재현한다.
--
-- 점수 공식 (schema.sql의 mate_suggestions와 동일, 합계 상한 100):
--   least(shared_count,5)*10  -- 겹친 나라   최대 50
-- + least(shared_comps,3)*5   -- 겹친 동행   최대 15
-- + least(shared_vts,2)*7     -- 겹친 기록형식 최대 14
-- + least(mutual_count,3)*7   -- 공통 메이트 최대 21
--
-- ⚠️ 앱은 여기에 더해 '로컬 기록의 나라'(extra_countries)를 클라이언트에서 넘긴다.
--    서버 데이터만으로는 재현할 수 없으므로, 실제 사용자가 보는 점수는 아래보다
--    같거나 조금 높다(겹친 나라가 더 잡힐 수 있음). 하한 추정치로 읽을 것.
--
-- 사용법: Supabase SQL Editor에 통째로 붙여넣고, 보고 싶은 쿼리 블록만 실행.
-- ============================================================

-- ── 공통 CTE (아래 모든 쿼리가 이 정의를 앞에 붙여 쓴다) ──
-- 편의를 위해 뷰로 만들어 두고 마지막에 지운다(권한 있는 롤에서 실행).
create or replace view public._mate_score_pairs as
with
uc as ( -- 사용자 × 방문국 (비공개 글 제외 — RPC와 동일)
  select distinct author_id as uid, country_name as c
  from public.posts
  where visibility <> 'private' and country_name is not null and country_name <> ''
),
ucomp as ( -- 사용자 × 동행
  select distinct p.author_id as uid, comp
  from public.posts p,
       jsonb_array_elements_text(
         case when jsonb_typeof(p.data->'companions') = 'array' then p.data->'companions' else '[]'::jsonb end
       ) as comp
  where p.visibility <> 'private'
),
uvt as ( -- 사용자 × 기록 형식
  select distinct author_id as uid, view_type as vt
  from public.posts
  where visibility <> 'private' and view_type is not null
),
mates as ( -- 수락된 메이트 관계를 양방향으로 전개
  select requester_id as uid, addressee_id as mate from public.neighbors where status = 'accepted'
  union
  select addressee_id as uid, requester_id as mate from public.neighbors where status = 'accepted'
),
shared_c as (
  select a.uid as me, b.uid as cand, count(distinct a.c)::int as shared_count
  from uc a join uc b on b.c = a.c and b.uid <> a.uid
  group by 1, 2
),
shared_comp as (
  select a.uid as me, b.uid as cand, count(distinct a.comp)::int as shared_comps
  from ucomp a join ucomp b on b.comp = a.comp and b.uid <> a.uid
  group by 1, 2
),
shared_vt as (
  select a.uid as me, b.uid as cand, count(distinct a.vt)::int as shared_vts
  from uvt a join uvt b on b.vt = a.vt and b.uid <> a.uid
  group by 1, 2
),
mutual as (
  select m1.uid as me, m2.uid as cand, count(distinct m1.mate)::int as mutual_count
  from mates m1 join mates m2 on m2.mate = m1.mate and m2.uid <> m1.uid
  group by 1, 2
),
pairs as (
  select me, cand from shared_c
  union select me, cand from shared_comp
  union select me, cand from shared_vt
  union select me, cand from mutual
)
select
  p.me,
  p.cand,
  coalesce(sc.shared_count, 0)  as shared_count,
  coalesce(sp.shared_comps, 0)  as shared_comps,
  coalesce(sv.shared_vts, 0)    as shared_vts,
  coalesce(mu.mutual_count, 0)  as mutual_count,
  ( least(coalesce(sc.shared_count, 0), 5) * 10
  + least(coalesce(sp.shared_comps, 0), 3) * 5
  + least(coalesce(sv.shared_vts, 0), 2) * 7
  + least(coalesce(mu.mutual_count, 0), 3) * 7 )::int as total_score
from pairs p
left join shared_c    sc on sc.me = p.me and sc.cand = p.cand
left join shared_comp sp on sp.me = p.me and sp.cand = p.cand
left join shared_vt   sv on sv.me = p.me and sv.cand = p.cand
left join mutual      mu on mu.me = p.me and mu.cand = p.cand
-- RPC와 동일한 제외 조건: 이미 메이트거나 신청 대기중이거나 차단 관계면 추천에 안 뜬다
where not public.are_neighbors(p.me, p.cand)
  and not public.is_blocked_between(p.me, p.cand)
  and not exists (
    select 1 from public.neighbors n
    where ((n.requester_id = p.me and n.addressee_id = p.cand)
        or (n.requester_id = p.cand and n.addressee_id = p.me))
      and n.status = 'pending'
  );

-- ============================================================
-- ① 전체 요약 — 추천에 뜰 수 있는 모든 쌍의 점수 분포
-- ============================================================
select
  count(*)                                                          as pair_count,
  count(distinct me)                                                as users_with_any,
  min(total_score)                                                  as min_score,
  round(avg(total_score))                                           as avg_score,
  percentile_disc(0.50) within group (order by total_score)         as p50,
  percentile_disc(0.75) within group (order by total_score)         as p75,
  percentile_disc(0.90) within group (order by total_score)         as p90,
  percentile_disc(0.95) within group (order by total_score)         as p95,
  max(total_score)                                                  as max_score
from public._mate_score_pairs
where total_score > 0;

-- ============================================================
-- ② 히스토그램 — 10점 구간별 몇 쌍인지 (막대로 눈에 보이게)
-- ============================================================
select
  (total_score / 10) * 10                                  as bucket_from,
  (total_score / 10) * 10 + 9                              as bucket_to,
  count(*)                                                 as pairs,
  round(100.0 * count(*) / sum(count(*)) over (), 1)       as pct,
  repeat('█', greatest(1, (count(*) * 40 / greatest(1, max(count(*)) over ()))::int)) as bar
from public._mate_score_pairs
where total_score > 0
group by 1, 2
order by 1;

-- ============================================================
-- ③ 사용자가 실제로 '보는' 점수 — 각자에게 뜨는 1·5·10순위 추천의 점수
--    배지는 상위 10명에게만 붙으므로, 보정 기준은 ①보다 이 분포가 정확하다.
-- ============================================================
with ranked as (
  select me, total_score,
         row_number() over (partition by me order by total_score desc) as rn
  from public._mate_score_pairs
  where total_score > 0
)
select
  rn                                                        as rank_shown,
  count(*)                                                  as users,
  min(total_score)                                          as min_score,
  round(avg(total_score))                                   as avg_score,
  percentile_disc(0.50) within group (order by total_score) as median_score,
  max(total_score)                                          as max_score
from ranked
where rn in (1, 5, 10)
group by rn
order by rn;

-- ============================================================
-- ④ 점수 구성 — 어떤 항목이 실제로 점수를 만드는지 (가중치 조정 판단용)
--    예: 대부분 '겹친 나라'만으로 점수가 난다면 동행·형식 가중치는 무의미하다.
-- ============================================================
select
  count(*)                                                        as pairs,
  round(avg(least(shared_count, 5) * 10))                         as avg_pts_country,
  round(avg(least(shared_comps, 3) * 5))                          as avg_pts_companion,
  round(avg(least(shared_vts, 2) * 7))                            as avg_pts_viewtype,
  round(avg(least(mutual_count, 3) * 7))                          as avg_pts_mutual,
  round(100.0 * count(*) filter (where shared_count > 0) / count(*), 1) as pct_has_country,
  round(100.0 * count(*) filter (where shared_comps > 0) / count(*), 1) as pct_has_companion,
  round(100.0 * count(*) filter (where shared_vts   > 0) / count(*), 1) as pct_has_viewtype,
  round(100.0 * count(*) filter (where mutual_count > 0) / count(*), 1) as pct_has_mutual
from public._mate_score_pairs
where total_score > 0;

-- ============================================================
-- ⑤ 현재 앱 표시값 검증 — 지금 코드가 이 점수를 몇 %로 보여주는지
--    matchPercent = clamp(30, 99, round(score / 100 * 100))
-- ============================================================
with ranked as (
  select me, total_score,
         row_number() over (partition by me order by total_score desc) as rn
  from public._mate_score_pairs
  where total_score > 0
)
select
  total_score,
  greatest(30, least(99, round(total_score::numeric / 100 * 100)))  as shown_percent,
  count(*)                                                          as rows_shown
from ranked
where rn <= 10          -- 앱이 기본으로 받아오는 추천 수
group by 1, 2
order by 1 desc;

-- ── 정리 ──
-- drop view if exists public._mate_score_pairs;
