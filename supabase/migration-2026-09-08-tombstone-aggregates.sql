-- ============================================================
-- 2026-09-08 · 집계 함수의 tombstone 제외 + 표식 정리(purge) 등록
--
-- 같은 날의 선행 델타 `migration-2026-09-08-post-soft-delete.sql` 의 **후속**이다.
-- 그쪽으로 soft delete(`posts.deleted_at`)와 `posts_select` RLS 필터까지 들어갔지만,
-- **SECURITY DEFINER 함수는 소유자 권한으로 돌아 posts 의 RLS 가 아예 적용되지 않는다.**
-- 그래서 집계 함수들은 지운 글을 여전히 살아있는 글로 세고 있다:
--   · 프로필 글 수가 실제보다 많게 보인다(post_counts — 가장 눈에 띈다)
--   · 지운 글이 방문국 통계·메이트 추천 점수·나라별 방문자·겹침 판정에 계속 반영된다
-- 그리고 표식을 지우는 주체가 없어 tombstone 행이 무한히 누적된다.
--
-- schema.sql 에 이미 반영돼 있다. 이 파일은 전체 재실행 대신 **바뀐 부분만** 적용하려는
-- 경우용 발췌본이다. 전부 멱등(`create or replace` / `cron.schedule` 은 덮어쓴다)이라
-- 두 방법 중 아무거나, 몇 번 실행해도 안전하다.
--
-- ⚠️ **운영(blweol…)과 테스트(bqwmx…) 양쪽 프로젝트 모두에서 실행할 것.**
--    베타 앱은 테스트 프로젝트를 본다. 직전 델타에서 운영에만 넣고 발행 직전에 잡힌
--    사례가 있다 — 한쪽만 실행하면 그쪽에서만 증상이 사라져 "고쳐졌다"고 오판하게 된다.
--
-- ⚠️ 앱 코드 변경은 없다. 배포 순서 제약도 없다(구 번들과 완전히 호환된다 —
--    집계 값이 더 정확해질 뿐 계약(반환 컬럼)이 그대로다).
--
-- ⚠️ 함수 본문은 schema.sql 과 **내용상 동일**해야 한다. 여기서만 고치면
--    다음 schema.sql 재실행이 조용히 되돌린다. (이 파일은 schema.sql 에서 기계적으로
--    발췌해 만들었다. 단 줄끝이 이 파일은 LF, schema.sql 은 CRLF 라 **바이트 비교는
--    5개 전부 불일치로 나온다** — 대조할 땐 줄끝을 정규화하고 비교할 것.)
--
-- 참고: schema.sql 을 통째로 재실행하는 도중에는 posts_select · comments_insert_own ·
--    likes_insert_own 이 잠깐 게이트 없는 초기 버전(파일 앞부분 정의)으로 존재하는
--    창이 있다. 기존 성질이며(이번 변경이 만든 것 아님) 파일 끝까지 실행되면 닫힌다 —
--    재실행을 중간에 끊지 말 것.
-- ============================================================


-- ============================================================
-- 1) 집계 함수 5개 — 서브쿼리 9곳에 `deleted_at is null` 추가
--
-- 시그니처(인자·반환 타입)는 하나도 바꾸지 않았다 — 앱이 호출 중이다.
-- 그래서 `drop function` 없이 `create or replace` 만으로 교체된다.
--
-- ⚠️ schema.sql 에는 mate_suggestions_compute 앞에 `drop function if exists` 3줄
--    (travel_overlap_suggestions / mate_suggestions 래퍼 / 본체)이 있지만 **여기서는
--    일부러 뺐다.** 반환 컬럼 목록이 바뀌던 시절의 잔재이고, 이번엔 시그니처가 그대로라
--    replace 로 충분하다. 그 drop 을 여기에 옮겨 오면 **앱이 실제로 호출하는 래퍼
--    public.mate_suggestions 까지 지워지고** 이 파일은 래퍼를 다시 만들지 않으므로
--    추천 화면이 통째로 죽는다(래퍼 정의는 schema.sql 12번 절에 있다).
-- ============================================================

-- ── 1-1) profile_country_counts — 방문국 수 집계 (서브쿼리 1곳) ──
create or replace function public.profile_country_counts(ids uuid[])
returns table (author_id uuid, country_count int)
language sql security definer set search_path = public as $$
  select p.author_id, count(distinct p.country_name)::int as country_count
  from public.posts p
  where p.author_id = any(ids)
    -- 지운 글(tombstone) 제외 — security definer라 posts_select의 필터가 안 탄다.
    -- ⚠️ 이 저장소의 집계 함수 5개(profile_country_counts / mate_suggestions_compute /
    --    overlap_with / country_visitors / post_counts, 총 9개 서브쿼리)가 전부 같은
    --    처지다. SECURITY DEFINER 함수는 소유자 권한으로 돌아 posts의 RLS 자체가 적용되지
    --    않으므로, posts_select에 넣은 `deleted_at is null` 조건이 여기까지 오지 않는다.
    --    RLS 우회는 이 함수들의 목적(공개 통계를 일관되게 내려면 필요하다)이라 없앨 수 없고,
    --    대신 삭제 표식을 함수 본문에서 직접 걸러야 한다. 빠뜨리면 지운 글이 방문국 통계·
    --    추천 점수·프로필 글 수에 영원히 남는다(purge 전까지가 아니라, 표식 행이 있는 한).
    --    아래 4개 함수에는 같은 조건을 한 줄 주석으로만 달았다.
    and p.deleted_at is null
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

-- ── 1-2) mate_suggestions_compute — 추천 계산 본체 (서브쿼리 3곳: pub / my_cities / ccity_pairs) ──
-- 프로빙 가드·k-익명성 로직은 한 글자도 건드리지 않았다. 필터 3줄만 추가됐다.
create or replace function public.mate_suggestions_compute(match_limit int default 10, extra_countries text[] default '{}')
returns table (
  author_id uuid, handle text, emoji text, profile_photo text,
  shared_count int, sample_countries text[], mutual_count int, style_score int, total_score int,
  place_score int, recency_score int, season_score int, interest_score int, taste_score int,
  mutual_score int, survey_score int,
  shared_cities text[], shared_keywords text[],
  dna_type_key text
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
           -- 도시는 k-익명성 판정(city_user_counts)에만 쓴다. 짧은 문자열 하나라
           -- 위 주석의 '데이터를 들고 다니지 않는다' 원칙을 깨지 않으면서,
           -- 도시별 방문자 수를 위해 전역 스캔을 한 번 더 도는 것을 막는다.
           p.data->>'regionName' as region_name,
           coalesce(
             public.safe_to_date(p.data->>'startDate'),
             public.safe_to_date(p.data->>'date'),
             p.created_at::date) as trip_date,
           case when jsonb_typeof(p.data->'countries') = 'array'
                then p.data->'countries' else '[]'::jsonb end as countries
    from public.posts p
    -- 지운 글(tombstone) 제외 — security definer라 posts_select의 필터가 안 탄다.
    where p.deleted_at is null
      and p.visibility <> 'private'
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
  -- 나라별 방문 사용자 수 → 희소성 가중치.
  -- 표본이 적으면(전체 20명 미만) 희소성은 신호가 아니라 노이즈라 균등 가중으로 폴백한다.
  user_total as (select count(distinct author_id)::int as n from pub_country),
  country_user_counts as (
    select pc.name, count(distinct pc.author_id)::int as visitors
    from pub_country pc
    group by pc.name
  ),
  -- 도시별 방문자 수 — 도시 근거 문구(shared_cities)의 k-익명성 판정용.
  -- (나라, 도시) 쌍으로 센다 — ccity가 같은 쌍으로 겹침을 판정하므로 기준이 일치해야 한다.
  -- 도시는 나라보다 훨씬 좁아 재식별이 쉽다(같은 나라 안에서도 소도시는 방문자가 한둘이다).
  city_user_counts as (
    select pb.country_name as country, pb.region_name as city,
           count(distinct pb.author_id)::int as visitors
    from pub pb
    where coalesce(pb.region_name, '') <> '' and coalesce(pb.country_name, '') <> ''
    group by pb.country_name, pb.region_name
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
  --
  -- ⚠️ 상한 30 — overlap_with과 같은 규칙(그쪽 주석 참조). 호출자가 넣은 배열이 그대로
  --    후보 선별·겹침 판정의 비교 집합이 되므로, 전 세계 국가를 통째로 넣고 배열을 반씩
  --    쪼개 재호출하면(이분 탐색) 추천에 뜬 사람의 방문국을 특정할 수 있다.
  --    overlap_with에는 이 방어가 있었는데 여기만 빠져 있었다(2026-08-11).
  --    '1개씩 여러 번' 부르는 경로는 길이로 못 막으므로 래퍼(12번 절)의 probe_guard_ok가 센다.
  my_countries as (
    select pc.name from pub_country pc, me where pc.author_id = me.uid
    union
    select c from unnest(extra_countries[1:30]) as c where c is not null and c <> ''
  ),
  -- 도시는 (나라, 도시) 쌍으로 들고 다닌다 — 동명 지역의 오매칭을 막는다.
  -- 나라는 기록의 대표 국가(country_name)를 쓴다. pub_country로 펼치면 다국가 기록에서
  -- 한 도시가 그 여행의 모든 나라와 짝지어져 없는 쌍이 생긴다.
  my_cities as (
    select distinct p.country_name as country, p.data->>'regionName' as city
    from public.posts p, me
    -- 지운 글(tombstone) 제외 — security definer라 posts_select의 필터가 안 탄다.
    where p.deleted_at is null
      and p.author_id = me.uid and p.visibility <> 'private'
      and coalesce(p.data->>'regionName', '') <> ''
      and coalesce(p.country_name, '') <> ''
  ),
  -- 시의성: 최근 1년 내 다녀온 나라(날짜 자체는 반환하지 않는다)
  my_recent as (
    select distinct pc.name
    from pub_country pc, me
    where pc.author_id = me.uid and pc.trip_date >= current_date - interval '1 year'
  ),
  my_mates as (
    select case when n.requester_id = me.uid then n.addressee_id else n.requester_id end as mate_id
    from public.neighbors n, me
    where n.status = 'accepted' and (n.requester_id = me.uid or n.addressee_id = me.uid)
  ),

  -- 1단계: 후보 좁히기(싼 필터) — 나라가 겹치거나 공통 메이트가 있는 사람만, 최대 200명.
  cand as (
    select cid from (
      select pc.author_id as cid, 0 as pri
      from pub_country pc, me
      where pc.author_id <> me.uid and pc.name in (select name from my_countries)
      union all
      select case when n2.requester_id = mm.mate_id then n2.addressee_id else n2.requester_id end as cid, 0 as pri
      from my_mates mm
      join public.neighbors n2 on n2.status = 'accepted'
        and (n2.requester_id = mm.mate_id or n2.addressee_id = mm.mate_id)
      union all
      -- 3번째 경로 — 설문 완료자 표본.
      -- 기존 두 경로(나라 겹침·공통 메이트)는 기록이 있어야 걸린다.
      -- 이게 없으면 기록 없는 신규는 설문을 마쳐도 후보에 못 들어와 추천이 0이다.
      -- union 안에서 order by/limit을 괄호 없이 붙이면 이 분기가 아니라 union 전체 결과에
      -- 걸려버린다(그리고 바깥 스코프에는 d.updated_at이 안 보여 파싱조차 안 된다) —
      -- 그래서 이 분기만 별도 하위질의로 감싼다.
      -- 호출자가 설문을 안 했으면 이 경로를 아예 끈다: 설문축이 0인 후보 100명이
      -- 후보 풀에 섞여 rest(다양성 셔플) 자리를 먹어, 나라 겹침·공통 메이트로 걸린
      -- 진짜 근거 있는 후보의 노출 자리를 빼앗는다. 이 경로의 목적(§8)은 어디까지나
      -- '설문을 마친 호출자'가 추천 0이 되는 걸 막는 것이다.
      -- my_dna CTE는 cand보다 뒤에 정의돼 참조할 수 없어(비재귀 WITH는 앞선 CTE만 보인다)
      -- exists 하위질의로 직접 확인한다.
      select cid, 1 as pri from (
        select d.user_id as cid
        from public.travel_dna d
        where exists (select 1 from public.travel_dna my, me where my.user_id = me.uid)
        order by d.updated_at desc
        limit 100
      ) dna_sample
    ) u, me
    where u.cid <> me.uid
    group by cid
    -- pri 0(나라 겹침·공통 메이트, 기록 근거 있음)을 pri 1(설문 표본만)보다 항상 앞세운다 —
    -- 안 그러면 200명 상한에서 기록 근거가 있는 좋은 후보가 무관한 설문 표본에 밀려날 수 있다.
    -- union all + group by cid로 중복은 여기서 걷어낸다(distinct 두 경로에 걸린 후보는 pri=0으로 남는다).
    order by min(pri), cid
    limit 200
  ),

  -- 설문 성향 — 축별 점수 차를 유사도로 바꿔 합산(축당 5점, 7축 = 35점).
  -- 나누는 값이 100이 아니라 50인 이유: 무작위 두 사람의 축별 평균 차이가 약 33이라
  -- 100으로 나누면 아무나 0.67을 받아 변별력이 사라진다.
  --
  -- 여기에 응답량 가중치 f를 곱하는 이유(중요):
  -- 클라이언트 채점은 응답이 적으면 점수를 중립 50으로 수축시킨다(§5). 수축은 '얕은 근거가
  -- 강한 결론을 내지 못하게' 하려는 장치인데, 거리(차이) 기반 유사도에서는 정반대로 작동한다 —
  -- 모두를 가운데로 모으면 서로 닮아 보이기 때문이다.
  -- 실제로 온보딩 축약판(7문항)은 conf ≈ 2/7이라 모든 축이 정확히 36 아니면 64가 되고,
  -- 축약판끼리는 축별 차이가 0 아니면 28 → 유사도 1.0 또는 0.44 → 기대 ~25/35가 나온다.
  -- 36문항을 다 답한 두 사람은 점수가 넓게 퍼져 평균 차이 ≈ 33 → 약 12/35다.
  -- 즉 덜 답할수록 낯선 사람과 더 잘 맞아 보이고, pickReason의 문턱 20을 쉽게 넘어
  -- 공통점이 없는 상대에게 "여행 성향이 잘 맞아요"가 붙는다.
  -- → 두 사람 중 '적게 답한 쪽'의 응답량으로 설문축 전체를 감쇠시킨다.
  --
  -- 그리고 총점 정규화의 분모(아래 visible)는 반드시 이 f를 따라가야 한다.
  -- 분모를 100으로 고정하면 설문축이 35f점밖에 안 실리므로 축약판 사용자의 총점 상한이
  -- 65+35f로 눌리고, 설문을 아예 안 한 사람(분모 65 → 상한 100)보다 낮아진다.
  -- '조금 답한 것'이 '안 답한 것'보다 불리해지는 역전이라, 실제 실린 가중치만큼만 분모를 키운다.
  my_dna as (select scores, answered from public.travel_dna, me where user_id = me.uid),
  csurvey as (
    select x.cid, x.f, least(35, round(x.raw * x.f))::int as n
    from (
      select d.user_id as cid,
             least(1.0, least(m.answered, d.answered)::numeric / 36) as f,
             sum(greatest(0, 1 - abs(a.v - b.v) / 50.0) * 5) as raw
      from public.travel_dna d
      join my_dna m on true
      cross join lateral unnest(m.scores) with ordinality as a(v, i)
      cross join lateral unnest(d.scores) with ordinality as b(v, j)
      where d.user_id in (select cid from cand) and a.i = b.j
      -- m.answered는 CTE 컬럼이라 함수 종속성이 안 잡힌다 — group by에 직접 넣어야 한다.
      group by d.user_id, d.answered, m.answered
    ) x
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
           -- 희소한 나라를 앞에 둔다 — 근거 문구가 "아이슬란드"를 먼저 말하게.
           -- ⚠️ 단 방문자가 k명 미만인 나라는 이름에서 뺀다(k-익명성 — k_anon_min 주석 참조).
           --    이 정렬은 '가장 식별력 높은 나라를 맨 앞에 놓는' 것이라, 거르지 않으면
           --    근거 문구가 재식별에 최적화된 형태가 된다.
           --    shared_count와 shared_weight(점수)는 거르지 않는다 — 순위 정확도는 그대로 두고
           --    화면에 나가는 이름만 무디게 한다. 전부 걸러지면 null → scored에서 '{}'가 된다.
           (array_agg(sp.name order by cw.w desc)
              filter (where cuc.visitors >= public.k_anon_min()))[1:3] as sample_countries,
           sum(cw.w) as shared_weight
    from cshared_pairs sp
    join country_weight cw on cw.name = sp.name
    -- 나라당 1행이라 조인이 행을 불리지 않는다(country_weight와 같은 이유)
    join country_user_counts cuc on cuc.name = sp.name
    group by sp.cid
  ),
  -- 도시 — (나라, 도시)가 모두 같을 때만 겹침으로 센다. 편재 국가는 제외한다.
  -- my_cities가 (나라, 도시) distinct라 조인은 기록 1행당 최대 1건, 행이 불지 않는다.
  ccity_pairs as (
    select distinct p.author_id as cid, p.country_name as country, p.data->>'regionName' as city
    from public.posts p
    join my_cities mc on mc.country = p.country_name and mc.city = p.data->>'regionName'
    -- 지운 글(tombstone) 제외 — security definer라 posts_select의 필터가 안 탄다.
    where p.deleted_at is null
      and p.visibility <> 'private'
      and p.author_id in (select cid from cand)
      and p.country_name not in (select name from ubiquitous_countries)
  ),
  ccity as (
    select cp.cid,
           count(*)::int as n,
           -- 이름이 같고 나라만 다른 도시가 표본에 둘 다 들어가지 않게 distinct로 모은다.
           -- k-익명성: 방문자가 k명 미만인 도시는 이름에서 뺀다(겹침 개수 n과 점수는 그대로).
           -- 도시는 나라보다 좁아 재식별이 쉬우므로 나라와 같은 임계를 그대로 적용한다.
           (array_agg(distinct cp.city)
              filter (where cuc.visitors >= public.k_anon_min()))[1:3] as cities
    from ccity_pairs cp
    -- (나라, 도시)당 1행이라 조인이 행을 불리지 않는다. ccity_pairs와 city_user_counts는
    -- 같은 visibility 조건에서 나오므로 짝이 없어 행이 사라지는 경우도 없다.
    join city_user_counts cuc on cuc.country = cp.country and cuc.city = cp.city
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
      -- 관심사 키워드 추출(ckw)을 걷어내며 같이 사라졌다 — 구버전 호환을 위해 컬럼만 남긴다.
      '{}'::text[] as shared_keywords,
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
      -- season/interest/taste는 설문축으로 대체됐다. 구버전 앱이 이 컬럼을 읽으므로
      -- 시그니처는 유지하되 값만 0으로 고정한다(옛 계절·관심사·성향 계산 CTE는 위에서 전부 삭제했다).
      0 as season_score,
      0 as interest_score,
      0 as taste_score,
      round(least(coalesce(m.mutual_count,0), 3) / 3.0 * 10)::int as mutual_score,
      coalesce(cs.n, 0) as survey_score,
      -- 이 쌍에 실제로 실린 설문축 가중치(0~1). 총점 분모가 이 값을 따라간다(csurvey 주석).
      coalesce(cs.f, 0) as survey_f,
      -- coalesce가 위에서 null을 0으로 지우므로 survey_score is null로는 '설문 없음'을 못 가른다
      -- (양쪽 다 설문을 안 해도 0으로 보여 정상 응답과 구분이 안 됐다). csurvey는 my_dna와
      -- inner join이라 행이 있다는 것 자체가 호출자·후보 양쪽 다 설문을 마쳤다는 뜻이다.
      (cs.cid is not null) as has_survey
    from cand c
    left join cshared s on s.cid = c.cid
    left join cand_weight_sum cws on cws.cid = c.cid
    left join ccity ci on ci.cid = c.cid
    left join crecent r on r.cid = c.cid
    left join cmut m on m.cid = c.cid
    left join csurvey cs on cs.cid = c.cid
  ),
  visible as (
    select sc.*,
      -- 둘 다 유효 응답이 있을 때만(has_survey) 설문축을 더한다. 아니면 기록 축(65) 만점을
      -- 100으로 환산한다 — 설문축을 0으로 두면 설문 안 한 사람(또는 상대)이 추천에서 부당하게 밀린다.
      -- 설문이 있을 때의 분모는 100 고정이 아니라 65 + 35×f다. 설문축에 f만큼만 실렸으므로
      -- 분모도 딱 그만큼만 키워야 만점이 100으로 맞는다(f=1이면 분모 100, f=0이면 65 —
      -- 위 has_survey=false 분기와 같은 식이 된다). 자세한 이유는 csurvey 주석 참조.
      -- least(100, ...)은 반올림 방어: survey_score를 정수로 반올림한 뒤 실수 분모로 나누므로
      -- 최대 0.5점의 올림 오차가 100을 아주 살짝 넘겨(최대 100.6) 101%가 표시될 수 있다.
      case when not sc.has_survey
        then round((sc.place_score + sc.recency_score + sc.mutual_score) * 100.0 / 65)::int
        else least(100, round((sc.place_score + sc.recency_score + sc.mutual_score + sc.survey_score)
                              * 100.0 / (65 + 35 * sc.survey_f)))::int
      end as total_score
    from scored sc, me
    where not public.is_blocked_between(me.uid, sc.cid)
      and not public.are_neighbors(me.uid, sc.cid)
      -- 추천 노출을 거부한 사람은 후보에서 뺀다(mate_reco_optin 주석 참조).
      -- 'is false'라 null(미결정=유예)은 그대로 통과한다 — `= false`로 쓰면 기존
      -- 이용자가 전부 사라진다. 호출자 본인 쪽에는 이 조건을 걸지 않는다(거부해도
      -- 내가 받는 추천은 막지 않는다).
      and not exists (
        select 1 from public.profiles pr
        where pr.id = sc.cid and pr.mate_reco_optin is false
      )
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
           place_score, recency_score, season_score, interest_score, taste_score, mutual_score, survey_score, total_score
    from ranked where by_score <= greatest(1, (least(match_limit, 50) * 7) / 10)
    union all
    select cid, shared_count, sample_countries, shared_cities, shared_keywords, mutual_count,
           place_score, recency_score, season_score, interest_score, taste_score, mutual_score, survey_score, total_score
    from rest
    where by_shuffle <= greatest(1, least(match_limit, 50) - (least(match_limit, 50) * 7) / 10)
  )
  select p.cid, pp.handle, pp.emoji, pp.profile_photo,
         p.shared_count, p.sample_countries, p.mutual_count,
         -- style_score는 구버전 앱 호환 — 관심사+성향으로 채운다(둘 다 0 고정이라 항상 0)
         (p.interest_score + p.taste_score) as style_score,
         p.total_score,
         p.place_score, p.recency_score, p.season_score, p.interest_score, p.taste_score,
         p.mutual_score, p.survey_score,
         p.shared_cities, '{}'::text[] as shared_keywords,
         -- 유형 라벨만 공개(§9) — public_profiles가 이미 그 규칙으로 노출을 좁혀뒀다.
         pp.dna_type_key
  from picked p
  join public.public_profiles pp on pp.id = p.cid
  order by p.total_score desc, pp.handle
  limit greatest(1, least(match_limit, 50));
$$;
-- 본체는 클라이언트가 직접 못 부르게 한다 — 호출 경로는 캐시 래퍼 하나로 고정(12번 절).
revoke all on function public.mate_suggestions_compute(int, text[]) from public, anon, authenticated;

-- ── 1-3) overlap_with — 타인 프로필 "겹치는 나라 N곳" (서브쿼리 3곳: my_countries / shared / shared_k) ──
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
  select count(*)::int,
         coalesce((array_agg(sk.country_name)
                     filter (where sk.visitors >= public.k_anon_min()))[1:3], '{}'::text[])
  from shared_k sk;
end; $$;
grant execute on function public.overlap_with(uuid, text[]) to authenticated;

-- ── 1-4) country_visitors — "이 나라 다녀온 사람" (서브쿼리 1곳) ──
create or replace function public.country_visitors(target_country text, match_limit int default 12)
returns table (author_id uuid, handle text, emoji text, profile_photo text, visit_posts int)
language sql security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  v as (
    select p.author_id, count(*)::int as visit_posts
    from public.posts p, me
    -- 지운 글(tombstone) 제외 — security definer라 posts_select의 필터가 안 탄다.
    where p.deleted_at is null
      and p.visibility <> 'private'
      and p.country_name = target_country
      and p.author_id <> me.uid
      -- 추천 노출 거부자는 목록에서 뺀다(mate_reco_optin 주석 — null은 통과)
      and not exists (
        select 1 from public.profiles pr
        where pr.id = p.author_id and pr.mate_reco_optin is false
      )
    group by p.author_id
  ),
  -- k-익명성 — 다녀온 사람이 k명 미만인 나라는 목록 자체를 내주지 않는다(k_anon_min 주석 참조).
  -- 한두 명뿐인 나라에서는 이 목록이 곧 '저 사람이 그 나라에 다녀왔다'는 지목이 되고,
  -- 나라 이름을 바꿔가며 훑으면 소수만 다녀온 나라들이 그대로 드러난다.
  -- 게시물 수가 아니라 '사람 수'로 센다 — 한 사람이 여러 번 기록해도 1명이다.
  vk as (select count(*)::int as n from v)
  select v.author_id, pp.handle, pp.emoji, pp.profile_photo, v.visit_posts
  from v
  join public.public_profiles pp on pp.id = v.author_id
  cross join me
  cross join vk
  where not public.is_blocked_between(me.uid, v.author_id)
    and vk.n >= public.k_anon_min()
  order by v.visit_posts desc, pp.handle
  limit greatest(1, least(match_limit, 50));
$$;
grant execute on function public.country_visitors(text, int) to authenticated;

-- ── 1-5) post_counts — 비이웃 프로필의 글 수 (서브쿼리 1곳) ──
create or replace function public.post_counts(ids uuid[])
returns table (user_id uuid, post_count int)
language sql stable security definer set search_path = public as $$
  select u as user_id,
    (select count(*) from public.posts p
      -- 지운 글(tombstone) 제외 — security definer라 posts_select의 필터가 안 탄다.
      -- (가장 눈에 띄는 증상 — 이게 없으면 프로필의 글 수가 실제보다 많게 보인다)
      where p.deleted_at is null
        and p.author_id = u and p.visibility = 'neighbors')::int
  from unnest(ids) as u;
$$;
grant execute on function public.post_counts(uuid[]) to authenticated;

-- 추천 캐시 1회 비우기 — 캐시에는 필터 적용 **전** 점수(지운 글 포함)가 남아 있고 TTL이
-- 6시간이라, 안 비우면 그동안 낡은 추천이 노출된다. schema.sql 전체 재실행 경로에는 이
-- 문장이 이미 있으므로(:2779 부근), 이걸 빼면 "재실행 또는 델타" 두 경로가 동등하지 않게
-- 된다. 재실행해도 안전(캐시는 다음 호출에서 지연 재생성).
delete from public.mate_suggestions_cache;


-- ============================================================
-- 2) tombstone 정리(purge) cron 등록
--
-- 근거·트레이드오프·cascade·Storage 주의는 cron-setup.sql 의 2-b) 절 주석에 전부 있다.
-- **cron-setup.sql 을 통째로 재실행해도 되고**(같은 이름의 잡은 덮어써지므로 안전),
-- 이 블록만 실행해도 된다. 확장 활성화(pg_cron)는 cron-setup.sql 이 이미 다루므로
-- 여기서는 그대로 두었다 — 이 프로젝트에는 이미 잡이 4개 돌고 있어 확장은 켜져 있다.
--
-- 요약: 매일 04:50 UTC, 표식이 찍힌 지 30일 지난 행을 실제로 지운다.
--   · 30일보다 짧게: 그보다 오래 잠들어 있던 기기가 표식을 놓쳐 그 글이 영구히 남는다
--   · 30일보다 길게: 표식 행이 더 오래 쌓인다(본문 data 는 삭제 시점에 이미 비워져 가볍다)
--   · 이 delete 가 돌아야 post_likes·comments·notifications 의 cascade 가 비로소 돈다
--   · Storage 파일은 이 purge 로 지워지지 않는다(별도 과제)
-- ============================================================
select cron.schedule(
  'purge-deleted-posts',
  '50 4 * * *',
  $$delete from public.posts where deleted_at is not null and deleted_at < now() - interval '30 days'$$
);


-- ============================================================
-- 반영 확인 — 위를 실행한 뒤 이 블록을 돌려 결과를 확인한다.
-- **운영·테스트 양쪽에서 각각 확인할 것.**
-- ============================================================

-- 1번: 함수 5개 각각 정의문에 deleted_at 필터가 들어갔는지.
--      5행이 나오고 has_filter 가 **전부 true** 여야 한다.
--      `n` 은 그 함수 안의 필터 개수이고 기대값은 아래와 같다(합계 9):
--        country_visitors 1 / mate_suggestions_compute 3 / overlap_with 3 /
--        post_counts 1 / profile_country_counts 1
--      ⚠️ 세는 문자열이 `.deleted_at is null`(앞에 별칭 점이 붙은 형태)인 이유 —
--         pg_get_functiondef 는 본문의 SQL 주석까지 그대로 돌려준다. 점 없이 세면
--         profile_country_counts 의 설명 주석에 있는 `deleted_at is null` 이 함께 잡혀
--         n 이 1 이 아니라 2 로 나온다. 점을 붙이면 실제 조건절만 센다.
select p.proname,
       pg_get_functiondef(p.oid) like '%.deleted_at is null%' as has_filter,
       (length(pg_get_functiondef(p.oid))
        - length(replace(pg_get_functiondef(p.oid), '.deleted_at is null', ''))
       ) / length('.deleted_at is null') as n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
 where ns.nspname = 'public'
   and p.proname in ('profile_country_counts', 'mate_suggestions_compute',
                     'overlap_with', 'country_visitors', 'post_counts')
 order by p.proname;

-- 2번: cron 잡 등록 확인 — 'purge-deleted-posts' 한 줄이 나와야 한다.
select jobname from cron.job where jobname = 'purge-deleted-posts';

-- 2번 보강: 스케줄과 활성 여부까지 함께 보려면
-- select jobname, schedule, active, command from cron.job where jobname = 'purge-deleted-posts';

-- 3번(선택): 래퍼가 살아 있는지 — 위 ⚠️ 의 사고를 냈다면 여기서 0행이 나온다.
select proname from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
 where ns.nspname = 'public' and p.proname = 'mate_suggestions';
