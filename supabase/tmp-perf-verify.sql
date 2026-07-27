-- ── 성능 리팩터 검증용 스냅샷 (일회용 — 검증 후 이 파일째로 삭제) ──────────
-- mate_suggestions의 리팩터 전 본문을 그대로 복제한 것. 새 함수와 출력을 비교해
-- 동작 보존을 실행으로 증명하는 용도다. schema.sql에 넣지 않는 이유는
-- 유지되는 스키마에 남으면 재실행 때마다 임시 함수가 되살아나기 때문이다.
-- 정리: drop function if exists public.mate_suggestions_old(int, text[]);
--       그리고 이 파일 삭제.
drop function if exists public.mate_suggestions_old(int, text[]);
create or replace function public.mate_suggestions_old(match_limit int default 10, extra_countries text[] default '{}')
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
  -- 둘 다 클라이언트가 쓰는 자유 JSONB라 형식이 보장되지 않는다 — 정규식으로 형식을
  -- 거르고 to_date로 파싱한다(::date는 범위를 벗어나면 예외를 던져 전 사용자 조회가 죽는다,
  -- to_date는 관대하게 보정한다). 형식이 안 맞으면 case가 null → 다음 후보로 넘어간다.
  -- 예외 블록(plpgsql)은 쓰지 않는다 — 행마다 서브트랜잭션이 생겨 느려진다.
  pub as (
    select p.id, p.author_id, p.country_name, p.data,
           coalesce(
             case when p.data->>'startDate' ~ '^[0-9]{4}[./-][0-9]{1,2}[./-][0-9]{1,2}$'
                  then to_date(replace(replace(p.data->>'startDate', '.', '-'), '/', '-'), 'YYYY-MM-DD')
             end,
             case when p.data->>'date' ~ '^[0-9]{4}[./-][0-9]{1,2}[./-][0-9]{1,2}$'
                  then to_date(replace(replace(p.data->>'date', '.', '-'), '/', '-'), 'YYYY-MM-DD')
             end,
             p.created_at::date) as trip_date
    from public.posts p
    where p.visibility <> 'private'
  ),
  -- 나라 단위로 펼친다. country_name(대표 국가)에 더해 data->'countries' 배열도 펼쳐
  -- 다국가 여행이 누락되지 않게 한다(예전엔 대표 국가 1개만 셌다).
  pub_country as (
    select x.author_id, x.data, x.trip_date, c.name
    from pub x
    cross join lateral (
      select x.country_name as name
      union
      select jsonb_array_elements(
        case when jsonb_typeof(x.data->'countries') = 'array' then x.data->'countries' else '[]'::jsonb end
      )->>'name'
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
    select distinct x.country_name as country, x.data->>'regionName' as city
    from pub x, me
    where x.author_id = me.uid and coalesce(x.data->>'regionName', '') <> ''
      and coalesce(x.country_name, '') <> ''
  ),
  my_keywords as (
    select distinct kw
    from pub x, me, jsonb_array_elements_text(
      case when jsonb_typeof(x.data->'keywords') = 'array' then x.data->'keywords' else '[]'::jsonb end
    ) as kw
    where x.author_id = me.uid and kw <> ''
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
    select avg((pc.data->>'rating')::numeric) as r
    from pub_country pc, me
    where pc.author_id = me.uid and pc.name in (select name from my_countries)
      and (pc.data->>'rating') ~ '^[0-9]+(\.[0-9]+)?$'
  ),
  -- 예산은 같은 통화일 때만 비교한다(환율 정보가 없어 다른 통화는 비교 불가).
  -- 내가 가장 많이 쓴 통화 1개를 기준으로 삼는다.
  my_budget as (
    select x.data->'budget'->>'currency' as cur, avg((x.data->'budget'->>'amount')::numeric) as amt
    from pub x, me
    where x.author_id = me.uid and (x.data->'budget'->>'amount') ~ '^[0-9]+(\.[0-9]+)?$'
      and coalesce(x.data->'budget'->>'currency','') <> ''
    group by 1 order by count(*) desc limit 1
  ),
  my_flight as (
    select x.data->>'flightType' as ft
    from pub x, me
    where x.author_id = me.uid and coalesce(x.data->>'flightType','') <> ''
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
    select distinct x.author_id as cid, x.country_name as country, x.data->>'regionName' as city
    from pub x
    join my_cities mc on mc.country = x.country_name and mc.city = x.data->>'regionName'
    where x.author_id in (select cid from cand)
      and x.country_name not in (select name from ubiquitous_countries)
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
    select x.author_id as cid,
           count(distinct kw)::int as n,
           (array_agg(distinct kw))[1:3] as kws
    from pub x, jsonb_array_elements_text(
      case when jsonb_typeof(x.data->'keywords') = 'array' then x.data->'keywords' else '[]'::jsonb end
    ) as kw
    where x.author_id in (select cid from cand) and kw in (select kw from my_keywords)
    group by x.author_id
  ),
  crating as (
    select pc.author_id as cid, avg((pc.data->>'rating')::numeric) as r
    from pub_country pc
    where pc.author_id in (select cid from cand)
      and pc.name in (select name from my_countries)
      and (pc.data->>'rating') ~ '^[0-9]+(\.[0-9]+)?$'
    group by pc.author_id
  ),
  -- 내 기준 통화와 같은 기록만 집계 — 후보당 1행이 되도록 통화로 미리 걸러낸다
  cbudget as (
    select x.author_id as cid, avg((x.data->'budget'->>'amount')::numeric) as amt
    from pub x
    where x.author_id in (select cid from cand)
      and (x.data->'budget'->>'amount') ~ '^[0-9]+(\.[0-9]+)?$'
      and x.data->'budget'->>'currency' = (select cur from my_budget)
    group by x.author_id
  ),
  cflight as (
    select cid, ft from (
      select x.author_id as cid, x.data->>'flightType' as ft,
             row_number() over (partition by x.author_id order by count(*) desc) as rn
      from pub x
      where x.author_id in (select cid from cand) and coalesce(x.data->>'flightType','') <> ''
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
$$;grant execute on function public.mate_suggestions_old(int, text[]) to authenticated;
