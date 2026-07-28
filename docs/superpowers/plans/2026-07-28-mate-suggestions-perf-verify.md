# mate_suggestions 성능 리팩터 — 실행 검증 런북

이 리팩터는 **점수가 바뀌지 않아야** 성공이다. 로컬에 Postgres가 없어 정독으로만 검증했으므로,
아래 절차로 실행 비교해 동작 보존을 증명한다.

## 0. 이 문서를 읽는 법 — 0행은 그 자체로 증거가 아니다

이 문서의 거의 모든 검사는 **성공했을 때 0행**을 낸다. 그런데 신원이 없거나, 새 함수가
배포되지 않았거나, 검증 계정에 해당 데이터가 없어도 똑같이 0행이 나온다.
**두 상태는 화면에서 구분되지 않는다.**

그래서 규칙은 하나다:

> **0행을 "통과"로 읽어도 되는 것은, 그 앞의 관문 출력을 직접 눈으로 확인한 경우뿐이다.**
> 관문을 건너뛰거나 관문 출력이 화면에 뜨지 않았다면, 뒤따르는 0행은 아무것도 증명하지 않는다.

관문은 6개다. 순서대로 통과해야 한다.

| 관문 | 무엇을 막는가 | 위치 |
|---|---|---|
| 0 | 새 함수가 배포되지 않아 구·구를 비교하는 것 | §1 (d) |
| A | 신원이 없어 두 함수가 모두 0행을 내는 것 | §2 |
| B | 결과가 비어 있는 계정으로 비교하는 것 | §2 |
| C-1 | rating 축이 결과에 참여하지 않아, 바뀐 경로가 출력에 드러나지 않는 것(내 쪽) | §2 |
| C-2 | 다국가 전개가 없어 다중도(팬아웃)를 검사하지 못하는 것 | §2 |
| C-3 | 후보 쪽에 rating이 없어 crating이 결과에 아예 도달하지 못하는 것 | §2 |

## 1. 두 함수 배포

**두 파일은 서로 독립적이라 실행 순서 자체는 결과에 영향을 주지 않는다.**
`supabase/tmp-perf-verify.sql`은 본문을 통째로 인라인한 자립 파일이라 라이브 함수를 참조하지
않는다 — "구 함수가 살아 있어야 스냅샷이 의미가 있다"는 근거는 사실이 아니다.

다만 아래 순서를 따르면 스냅샷을 올린 직후에 "운영 현행 = 스냅샷"인지 확인할 수 있으므로
이 순서로 진행한다.

**(a) 먼저 `supabase/tmp-perf-verify.sql`을 실행해 `mate_suggestions_old`를 만든다.**

**(b) 운영 현행이 스냅샷과 같은지 확인한다 — `schema.sql`을 돌리기 전에.**

```sql
select p.proname, md5(p.prosrc)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('mate_suggestions', 'mate_suggestions_old');
-- 반드시 2행이 나와야 한다. 1행뿐이면 (a)가 실패한 것이므로 여기서 중단한다.
-- 두 md5가 같아야 '운영 현행 = 스냅샷'이다.
-- 다르면 운영 DB에 레포와 다른 버전이 떠 있다는 뜻이므로, 그 차이를 먼저 확인할 것.
```

`pg_namespace` 조인은 동명 함수가 다른 스키마에 있을 때 잡음이 섞이는 것을 막는다.
**(c)를 이미 실행한 뒤라면 이 확인은 무의미하다**(당연히 달라진다) — 순서를 지킬 것.

이 스냅샷은 **레포 `1406d3c` 시점의 정의**를 인라인한 것이지, "운영 DB의 현재 함수"를
자동으로 캡처한 것이 아니다. 위 md5 확인을 건너뛰면, 운영 DB에 레포와 다른 버전이 떠 있어도
모르고 지나가 이후 비교가 "운영 현행 vs 신규"가 아니게 된다.

md5가 다르면 먼저 **줄바꿈 차이인지**부터 배제할 것 — `prosrc`는 붙여넣은 텍스트를 그대로
저장하므로 CRLF/LF가 섞이면 의미가 같아도 md5가 갈린다. 두 본문을 실제로 꺼내 눈으로 비교한다:

```sql
select p.proname, p.prosrc
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('mate_suggestions', 'mate_suggestions_old');
```

**(c) 그 다음 `supabase/schema.sql`의 `mate_suggestions` 블록을 실행한다.**
트랜잭션으로 감쌀 것:

```sql
begin;
-- schema.sql의 drop function ~ grant execute 까지
commit;
```

`drop function`이 `create`보다 먼저 돌므로 감싸지 않으면 create 실패 시 함수가 사라진 채 남는다.
그 상태에서 앱은 에러 없이 추천 섹션만 빈다.

> **이 (c) 단계가 이 문서에서 유일하게 "여러 문장을 한 번에 실행"하는 곳이다.**
> §2부터는 정반대로 한 문장씩 실행해야 한다(§2 도입부 참조).

**(d) 관문 0 — 새 함수가 실제로 배포됐는가.**

(b)의 md5 쿼리를 **한 번 더** 실행한다.

```sql
select p.proname, md5(p.prosrc)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('mate_suggestions', 'mate_suggestions_old');
-- 이번에는 두 md5가 '달라야' 한다.
-- 아직 같다면 (c)가 반영되지 않은 것이다 — 그 상태로 §2를 돌리면
-- 구 함수와 구 함수를 비교하게 되어 모든 비교가 당연히 0행이고, 아무것도 검증하지 못한다.
-- 여기서 중단하고 (c)를 다시 실행할 것.
```

이 관문이 없으면 (b)의 "md5가 같아야 한다"와 (d)의 "md5가 달라야 한다"가 뒤섞여,
(c)를 건너뛴 채 §2로 넘어가도 화면상 아무 이상이 없다. **가장 조용한 거짓 통과 경로다.**

## 2. 출력 비교 — 이것이 본 검증이다

**관문을 먼저 통과해야 한다.** 관문 없이 비교하면 두 함수가 모두 0행을 내도 "0행 차이 = 통과"로
읽혀 아무것도 검증하지 못한다. `mate_suggestions`는 `me` CTE에서 `auth.uid()`를 쓰는데,
Supabase SQL Editor에는 기본적으로 `request.jwt.claims`가 없어 `auth.uid()`가 NULL이다 —
그러면 `my_countries`·`my_mates`·`cand`가 전부 공집합이 되어 **두 함수 모두 0행**을 반환하고,
`except` 양방향이 0행으로 나와 "동작 보존 증명됨"으로 잘못 읽힌다. 아래 관문 A·B·C는 정확히
이 거짓 통과를 막기 위한 것이며, 건너뛰면 안 된다.

> **실행 방식 주의.** 아래 문장들을 통째로 붙여넣어 한 번에 실행하지 말 것 —
> SQL Editor는 마지막 문장의 결과만 보여주므로 관문 출력이 화면에 뜨지 않고,
> 마지막 `except all`의 0행만 보고 "통과"로 오독하게 된다.
> **한 문장씩 실행하고 각 관문의 출력을 눈으로 확인할 것.**
> 그래서 신원 주입은 트랜잭션 로컬(`true`)이 아니라 **세션 고정(`false`)**을 쓴다 —
> 문장별로 실행해도 신원이 유지된다.

> **같은 세션 창을 끝까지 유지할 것.** §2·판별·보너스·§3이 모두 이 신원 위에서 돌아야 한다.
> 탭을 새로 열거나 새로고침하면 신원이 사라지고, 그 뒤의 모든 검사가 조용히 0행이 된다.

> **세션이 유지되지 않는 환경일 때의 대비책.** SQL Editor는 실행마다 풀에서 커넥션을
> 받아올 수 있어, 세션 고정이 다음 실행까지 남지 않는 경우가 있다. 그래서
> **신원에 의존하는 문장은 실행 직전에 `select auth.uid();`로 신원을 확인한 뒤 읽는다.**
> NULL이면 신원 주입을 다시 실행하고, 그래도 유지되지 않으면
> **한 번의 실행에 `set_config` 한 줄 + 확인할 쿼리 한 줄만** 붙여넣어 돌린다.
> 이렇게 하면 마지막 문장의 결과 그리드가 곧 확인할 쿼리의 결과라 관문 출력이 가려지지 않고,
> 세션 유지 여부와 무관하게 신원이 보장된다.

```sql
-- 1) 열람자 신원을 세션에 고정한다. security definer 함수라 role 변경은 필요 없다.
--    세 번째 인자가 false여야 문장별 실행에서도 유지된다.
--    <검증할 계정 UUID>를 실제 UUID로 반드시 치환할 것. 찾는 법:
--      select id, email from auth.users order by created_at desc limit 20;
select set_config('request.jwt.claims',
  json_build_object('sub','<검증할 계정 UUID>','role','authenticated')::text, false);
```

```sql
-- 2) 관문 A — 신원이 잡혔는가. NULL이면 여기서 중단한다.
--    치환한 UUID와 같은 값이 나오는지까지 확인할 것.
select auth.uid();
```

```sql
-- 3) 관문 B — 결과가 비어있지 않은가. 0이면 비교는 아무것도 증명하지 못하므로 중단한다.
select count(*) as n_new from public.mate_suggestions(50);
```

```sql
select count(*) as n_old from public.mate_suggestions_old(50);
-- n_new = n_old 이고 둘 다 > 0 이어야 다음으로 간다.
```

```sql
-- 4) 관문 C-1 — 이번 리팩터가 바꾼 경로가 '출력에 드러나는가'.
--    이번 리팩터가 구조를 바꾼 유일한 곳은 my_rating·crating의 post_id 되짚기다.
--    그런데 my_rating(내 평균 별점)이 NULL이면 ctaste의 분모·분자에서 rating 항이
--    통째로 빠져 crating 값이 결과에 전혀 반영되지 않는다. 즉 경로가 실행되더라도
--    출력이 달라질 수 없어, 비교가 0행이어도 그 경로는 검사되지 않은 것이다.
--    (내 기록의 나라는 정의상 전부 my_countries에 들어가므로, 아래 조건이 곧 my_rating의 조건이다.)
select count(*) as n_my_rated
from public.posts p
where p.author_id = auth.uid() and p.visibility <> 'private'
  and (p.data->>'rating') ~ '^[0-9]+(\.[0-9]+)?$'
  and (coalesce(p.country_name, '') <> ''
       or exists (
         select 1 from jsonb_array_elements(
           case when jsonb_typeof(p.data->'countries') = 'array'
                then p.data->'countries' else '[]'::jsonb end) e
         where coalesce(e->>'name', '') <> ''));
-- 0이면 중단. rating이 채워진 공개 기록을 가진 계정으로 다시 검증할 것.
```

```sql
-- 5) 관문 C-2 — 다중도(팬아웃)를 검사할 데이터가 있는가.
--    join public.posts p on p.id = pc.post_id 자체는 posts.id가 기본키라 1:1이고 행을
--    불리지 않는다. 실제 위험은 다국가 전개 쪽이다 — 같은 기록이 pub_country에서
--    나라별로 2행 이상 펼쳐지면, crating이 pc.author_id로 group by 할 때 그 기록 하나의
--    평점이 겹치는 나라 수만큼 중복 반영되어 평균이 그 기록 쪽으로 쏠린다.
--    같은 기록이 pub_country에서 2행 이상으로 펼쳐지는 경우가 하나도 없으면
--    비교가 0행이어도 그 위험은 검사하지 않은 것이다.
--    아래는 pub → pub_country의 전개 규칙(country_name UNION countries[].name)을 그대로 옮긴 것이다.
--    후보 누구의 기록이든 그 경로를 태우므로 전체 공개 게시물이 대상이고, auth.uid()와 무관하다.
select count(*) as n_multi_rated from (
  select x.post_id
  from (
    select p.id as post_id, p.country_name,
           case when jsonb_typeof(p.data->'countries') = 'array'
                then p.data->'countries' else '[]'::jsonb end as countries
    from public.posts p
    where p.visibility <> 'private'
      and (p.data->>'rating') ~ '^[0-9]+(\.[0-9]+)?$'
  ) x
  cross join lateral (
    select x.country_name as name
    union
    select jsonb_array_elements(x.countries)->>'name'
  ) c
  where c.name is not null and c.name <> ''
  group by x.post_id
  having count(*) >= 2
) t;
-- 0이면: 그런 기록을 가진 다른 계정으로 다시 검증하거나,
--        이 경로가 미검증으로 남는다는 사실을 기록에 남길 것
```

```sql
-- 6) 관문 C-3 — crating이 후보 쪽에서도 살아 있는가.
--    ctaste는 rating 항을 게이트할 때 내 쪽(my_rating)과 후보 쪽(crating) 둘 다 not null이어야
--    한다(`(select r from my_rating) is not null and cr.r is not null`). 관문 C-1은 내 쪽만
--    확인했다 — 내가 공유하는 나라 중 어느 한 곳에서라도 나 아닌 후보가 유효한 평점을 남긴
--    적이 없으면 crating은 모든 후보에서 NULL이 되어, 이번 리팩터가 구조를 바꾼 유일한
--    지점(crating의 post_id 되짚기)이 출력에 전혀 드러나지 않는다. 그 상태에서는 0행 비교가
--    이 경로에 대해 아무것도 증명하지 못한다.
--    아래 pc는 §2 보너스 절의 pc를 그대로 재사용하고 rating 정규식만 더한 것이다
--    — country_name UNION countries[].name, schema.sql의 pub → pub_country와 같은 전개다.
--    (author_id = auth.uid() 쪽 name 집합은 내 나라 전체가 아니라 내 rating이 있는 나라로
--    좁힌 부분집합이다. 관문 C-1을 통과했다면 공집합이 아니고 my_countries의 부분집합이므로,
--    여기서 겹침이 나오면 실제 my_countries와도 반드시 겹친다 — 보수적으로 좁혀도 안전하다.)
with pc as (
  select x.author_id, c.name
  from (
    select p.author_id, p.country_name,
           case when jsonb_typeof(p.data->'countries') = 'array'
                then p.data->'countries' else '[]'::jsonb end as countries
    from public.posts p
    where p.visibility <> 'private'
      and (p.data->>'rating') ~ '^[0-9]+(\.[0-9]+)?$'
  ) x
  cross join lateral (
    select x.country_name as name
    union
    select jsonb_array_elements(x.countries)->>'name'
  ) c
  where c.name is not null and c.name <> ''
)
select count(distinct pc.author_id) as n_candidate_rated
from pc
where pc.author_id <> auth.uid()
  and pc.name in (select name from pc where author_id = auth.uid());
-- 0이면 중단: 이 리팩터의 유일한 변경 경로(crating)가 출력에 전혀 나타나지 않는다는 뜻이다.
-- rating을 남긴 후보가 나와 나라를 공유하는 다른 계정으로 다시 검증하거나,
-- '이 경로는 미검증으로 남는다'는 사실을 기록에 남길 것.
```

```sql
-- 7) 본 비교 — except ALL 이어야 중복 다중도까지 본다.
--    실행 직전에 select auth.uid();가 대상 UUID를 내는지 다시 확인하고 돌릴 것.
select * from public.mate_suggestions(50)
except all
select * from public.mate_suggestions_old(50);
```

```sql
select * from public.mate_suggestions_old(50)
except all
select * from public.mate_suggestions(50);
```

```sql
-- 8) 사후 관문 — 본 비교가 정말 신원 안에서 돌았는가.
--    관문 A·B를 통과한 뒤에도 커넥션이 바뀌면 7)만 신원 없이 돌 수 있고,
--    그때 두 비교는 양쪽 다 0행이라 화면상 완벽한 통과로 보인다.
--    비교 '앞뒤'로 신원을 확인해야 그 구간이 신원 안이었음이 보장된다.
select auth.uid() as uid,
       (select count(*) from public.mate_suggestions(50)) as n_new;
-- uid가 NULL이거나 n_new = 0이면 7)의 0행은 무효다. 신원을 다시 넣고 7)부터 다시 할 것.
-- 판별·보너스 쿼리도 같은 방식으로 앞뒤를 감쌀 것.
```

**두 비교 모두 0행이어야 한다.** 행 수 비교는 `except`가 아니라 관문 B의 `count(*)`로 한다 —
`except`(ALL 없음)는 양쪽을 중복 제거한 뒤 비교하므로, "새 함수가 같은 후보를 2번 반환"하는
종류의 결함(다중도 회귀)은 `except`만으로는 양방향 모두 0행으로 통과해버린다. 본 비교에
`except all`을 쓰는 이유가 이것이다. 이번 리팩터가 강화한 위험인 다국가 전개
(`pub_country`가 한 기록을 나라별로 여러 행으로 펼치는 것)의 팬아웃이 정확히 이 사각과 겹친다.

**셔플이 일자 기반이라 §2·판별·보너스 전부를 같은 날(같은 `current_date`) 실행해야 한다.**
UTC 자정을 넘기면 `by_shuffle`과 `my_recent`가 바뀌어 리팩터와 무관한 diff가 난다.

### 차이가 나왔을 때 — 회귀인지 먼저 가릴 것

아래는 이번 리팩터 이전부터 있던 동점 비결정성이다. 실행계획이 바뀌면 임의 선택이 뒤집혀
정상 리팩터에서도 diff가 날 수 있다. 순서대로 배제한 뒤에 회귀로 판단할 것.

> **판별 쿼리도 전부 신원을 고정한 같은 세션에서 실행해야 한다.**
> 신원 없이 돌리면 두 함수가 모두 0행을 내어 "차이 없음"이 나오는데,
> 이는 아무것도 검증하지 않은 결과이며, **본 비교에서 나온 실재하는 회귀를 지워버린다.**
> 각 판별 쿼리 직전에 `select auth.uid();`가 대상 UUID를 내는지 확인할 것.

**① 차이가 `sample_countries` 원소 '순서'뿐인가** → 동점 비결정성. 회귀 아님.
사용자 20명 미만이면 모든 나라 가중치가 1.0이라 정렬 키가 상수다. 정규화해 재비교:

```sql
select author_id, handle, emoji, profile_photo, shared_count,
       (select array(select unnest(sample_countries) order by 1)) as sc_sorted,
       mutual_count, style_score, total_score,
       place_score, recency_score, season_score, interest_score, taste_score,
       mutual_score, shared_cities, shared_keywords
from public.mate_suggestions(50)
except all
select author_id, handle, emoji, profile_photo, shared_count,
       (select array(select unnest(sample_countries) order by 1)),
       mutual_count, style_score, total_score,
       place_score, recency_score, season_score, interest_score, taste_score,
       mutual_score, shared_cities, shared_keywords
from public.mate_suggestions_old(50);
-- 두 함수 이름을 맞바꿔 반대 방향도 한 번 더 실행할 것.
```

**`sample_countries`만 정규화하고 나머지 17개 컬럼은 전부 그대로 실어야 한다.**
`handle`과 정렬된 나라 배열만 남기고 비교하면, `taste_score`가 어긋난 진짜 회귀가
0행으로 사라진다 — 이 단계가 회귀를 지우는 도구가 되어버린다.
(`shared_cities`·`shared_keywords`는 `array_agg(distinct ...)`라 순서가 결정적이므로
정규화 대상이 아니다. 순서 비결정성이 있는 배열은 `sample_countries` 하나뿐이다.)

**② 차이가 `taste_score`에 몰려 있는가** → `my_budget` 통화 또는 `my_flight` 동수 확인.
**두 쿼리 모두 실제 CTE와 같은 필터를 써야 한다** — 필터를 빼고 세면 존재하지 않는 동수를
보여주거나 실재하는 동수를 가린다.

```sql
-- 통화 동수 확인 (my_budget과 같은 필터)
select p.data->'budget'->>'currency' as cur, count(*)
from public.posts p
where p.author_id = auth.uid() and p.visibility <> 'private'
  and (p.data->'budget'->>'amount') ~ '^[0-9]+(\.[0-9]+)?$'
  and coalesce(p.data->'budget'->>'currency','') <> ''
group by 1 order by 2 desc;
```

```sql
-- 항공편 동수 확인 (my_flight와 같은 필터)
select p.data->>'flightType' as ft, count(*)
from public.posts p
where p.author_id = auth.uid() and p.visibility <> 'private'
  and coalesce(p.data->>'flightType','') <> ''
group by 1 order by 2 desc;
```

둘 중 하나라도 1위가 동수면 기존 비결정성이며 회귀가 아니다.

**③ 후보가 200명 미만인가** → 200 이상이면 `cand`의 `limit 200`에 `order by`가 없어
두 함수가 다른 200명을 뽑는다. 이 경우 비교 자체가 무효다.

```sql
-- cand는 전체 사용자의 부분집합이므로 이 값이 200 미만이면 ③은 배제된다.
select count(*) as n_users from public.profiles;
-- 200 이상이면 상한만으로는 판정할 수 없다. 이때는 cand의 정의를 그대로 옮겨
-- 실제 후보 수를 세야 하며, 정확히 200이 나오면 비교 결과를 신뢰하지 말 것.
```

**④ 위 셋 다 아니면 진짜 회귀다.** 해당 `handle`과 어긋난 컬럼을 알려줄 것 — 어느 축이
틀어졌는지 바로 좁혀진다. 회귀로 판정되면 운영 함수를 되돌린다:
`supabase/tmp-perf-verify.sql`의 본문이 곧 리팩터 이전 정의이므로,
함수명만 `mate_suggestions`로 바꿔 다시 올리면 원상 복구된다(§4의 정리는 그 뒤에 한다).

### 보너스 — `extra_countries` 경로도 확인

앱은 `src/services/social.ts`에서 실제로 `extra_countries`를 넘긴다(본 비교는 위에서 양쪽 모두
기본값 `'{}'`로 호출했다 — 입력을 맞추려면 옳은 선택이다). `my_countries`의 union만 타므로
위험은 낮지만, 위 관문 통과 후 아래로 이 경로까지 한 번 더 덮는다.

**넘길 나라를 아무거나 고르면 이 검사는 아무것도 하지 않는다.** 이미 내 기록에 있는 나라를
넘기면 union이 무변화라 본 비교와 완전히 같은 쿼리가 되고, 아무도 방문하지 않은 나라를 넘기면
`country_weight`에 행이 없어 `my_weight_sum`이 그대로라 역시 무변화다. 둘 다 "0행 통과"로 보인다.
아래로 **남의 기록엔 있고 내 기록엔 없는** 나라 2개를 먼저 고른다.

```sql
with pc as (
  select x.author_id, c.name
  from (
    select p.author_id, p.country_name,
           case when jsonb_typeof(p.data->'countries') = 'array'
                then p.data->'countries' else '[]'::jsonb end as countries
    from public.posts p
    where p.visibility <> 'private'
  ) x
  cross join lateral (
    select x.country_name as name
    union
    select jsonb_array_elements(x.countries)->>'name'
  ) c
  where c.name is not null and c.name <> ''
)
select name, count(distinct author_id) as visitors
from pc
where author_id <> auth.uid()
  and name not in (select name from pc where author_id = auth.uid())
group by 1 order by 2 desc limit 10;
-- 결과가 비면 이 보너스 검사는 어떤 나라를 넣어도 무변화다.
--   → '이 경로는 미검증'으로 기록에 남기고 넘어갈 것. 0행을 통과로 읽지 말 것.
```

치환할 자리가 있으면 언젠가 잊고 넘어간다 — UUID 자리는 잊으면 캐스트 에러로 죽지만,
나라 이름은 `'일본','태국'`처럼 그럴듯한 값이라 잊어도 조용히 0행만 내는 무변화 비교가
되어 본 비교를 한 번 더 돌린 것과 구분되지 않는다. 그래서 아래는 치환 없이, 위 선택 쿼리를
스칼라 서브쿼리로 그대로 끼워 넣어 매번 새로 계산한다.

```sql
with pc as (
  select x.author_id, c.name
  from (
    select p.author_id, p.country_name,
           case when jsonb_typeof(p.data->'countries') = 'array'
                then p.data->'countries' else '[]'::jsonb end as countries
    from public.posts p
    where p.visibility <> 'private'
  ) x
  cross join lateral (
    select x.country_name as name
    union
    select jsonb_array_elements(x.countries)->>'name'
  ) c
  where c.name is not null and c.name <> ''
)
select * from public.mate_suggestions(50, (
  select array_agg(name) from (
    select name, count(distinct author_id) as visitors
    from pc
    where author_id <> auth.uid()
      and name not in (select name from pc where author_id = auth.uid())
    group by 1 order by 2 desc limit 2
  ) t
))
except all
select * from public.mate_suggestions_old(50, (
  select array_agg(name) from (
    select name, count(distinct author_id) as visitors
    from pc
    where author_id <> auth.uid()
      and name not in (select name from pc where author_id = auth.uid())
    group by 1 order by 2 desc limit 2
  ) t
));
```

```sql
with pc as (
  select x.author_id, c.name
  from (
    select p.author_id, p.country_name,
           case when jsonb_typeof(p.data->'countries') = 'array'
                then p.data->'countries' else '[]'::jsonb end as countries
    from public.posts p
    where p.visibility <> 'private'
  ) x
  cross join lateral (
    select x.country_name as name
    union
    select jsonb_array_elements(x.countries)->>'name'
  ) c
  where c.name is not null and c.name <> ''
)
select * from public.mate_suggestions_old(50, (
  select array_agg(name) from (
    select name, count(distinct author_id) as visitors
    from pc
    where author_id <> auth.uid()
      and name not in (select name from pc where author_id = auth.uid())
    group by 1 order by 2 desc limit 2
  ) t
))
except all
select * from public.mate_suggestions(50, (
  select array_agg(name) from (
    select name, count(distinct author_id) as visitors
    from pc
    where author_id <> auth.uid()
      and name not in (select name from pc where author_id = auth.uid())
    group by 1 order by 2 desc limit 2
  ) t
));
-- 둘 다 0행이어야 한다.
```

이 보너스가 "새 입력"이 되도록 보장하는 것은 위 스칼라 서브쿼리 자체다 — 거기서 고르는 이름은
`my_countries`에 없던 것이면서 `country_weight`에 행이 있으므로, `my_weight_sum`이 반드시
커지고 `cand`가 넓어진다. 치환할 자리가 없으므로 이 보장은 항상 지켜진다. 다만 위 선택 쿼리
(눈으로 미리 확인하는 쪽)가 0행이면 `array_agg`가 NULL이 되어 `extra_countries`가 사실상
빈 배열과 같아지고, 아래 두 비교는 본 비교와 동일한 무변화 쿼리가 된다 — 그 경우 0행을
통과로 읽지 말고 **'이 경로는 미검증으로 남는다'**는 사실을 기록에 남길 것.

## 3. 성능 확인

**먼저 신원이 살아 있는지 확인한다.**

```sql
select auth.uid();
-- NULL이면 §2의 신원 주입을 다시 실행한 뒤에 계획을 잴 것.
-- 신원 없이 재면 cand가 공집합인 상태의 계획을 재게 된다. 그런데 pub_country는 전 게시물을
-- 스캔하므로 버퍼 수치가 그럴듯하게 찍혀 오히려 더 기만적이다. 이 상태에서는
-- CTE pub_country 비교도, crating의 Nested Loop vs Hash Join 판정도 성립하지 않는다.
```

```sql
explain (analyze, buffers) select * from public.mate_suggestions(10);
```

```sql
explain (analyze, buffers) select * from public.mate_suggestions_old(10);
```

> **주의 — 이 두 계획에는 내부 노드가 보이지 않는다.** 두 함수는 `security definer`이고
> `set search_path = public`이 걸려 있어, PostgreSQL이 SQL 함수를 호출부에 인라인하지 않는다
> (둘 중 하나만 있어도 인라인은 거부된다). 출력은 사실상 `Function Scan on mate_suggestions`
> 한 줄이다. **여기서 "`CTE pub` 노드가 안 보인다"를 성과로 읽으면 안 된다** —
> 인라인되어 사라진 것이 아니라 계획 자체가 감춰진 것이고, 같은 이유로 구 함수 쪽에도
> `CTE pub`은 보이지 않는다. 노드 유무로는 두 함수를 구분할 수 없다.

이 두 줄에서 유효한 비교는 **`Function Scan` 노드에 누적된 buffers(`shared hit`/`shared read`)와
실행 시간**뿐이다. 함수 내부에서 읽은 버퍼도 이 노드에 누적되므로 이 수치는 의미가 있다.
새 쪽의 버퍼 읽기량이 줄어 있으면 의도한 효과가 난 것이다.

지금은 게시물 수가 적어 체감 차이가 없을 수 있다. 그래도 버퍼 수치는 구조 개선을 보여준다.

### 노드 형태까지 보려면 — 본문을 평문 쿼리로 실행한다

본문은 레포에서 바로 가져오면 된다 — 신규는 `supabase/schema.sql`의 `mate_suggestions` 블록,
구본은 `supabase/tmp-perf-verify.sql`의 `mate_suggestions_old` 블록에서 `$$ ... $$` 사이다.
운영 DB에 실제로 떠 있는 본문으로 재고 싶다면 이렇게 꺼낸다:

```sql
select p.proname, p.prosrc
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('mate_suggestions', 'mate_suggestions_old');
```

본문을 에디터에 붙여넣고 `match_limit` → `10`, `extra_countries` → `'{}'::text[]`로
치환한 뒤(`with me as (select auth.uid() as uid), ...`로 시작하는 그대로 실행 가능하다)
`explain (analyze, buffers)`를 앞에 붙여 실행한다. 같은 세션이므로 `auth.uid()`는 그대로 살아 있다.
**이 평문 실행 직전에도 `select auth.uid();`로 신원을 확인할 것** — 신원이 없으면 `cand`가
공집합이라 아래 두 항목 중 어느 것도 계획에 나타나지 않고, "위험한 형태가 안 보인다"로 오독된다.
이 계획에서 확인할 것:

- 새 계획에서는 **`CTE pub` 노드가 사라져 있어야 정상이다**(참조가 `pub_country` 1회뿐이라
  PG12+에서 인라인된다). 비교 대상은 `CTE pub_country` 하나이며, 폭이 좁아진 만큼
  temp/tuplestore 사용량이 줄어야 한다. 노드가 사라진 것 자체가 성과의 증거이지 결함이 아니다.
- `my_rating`·`crating`이 `posts_pkey`에 대한 **Nested Loop + Index Scan**으로 풀리는지 볼 것.
  진짜 위험은 이 경로가 **Hash Join + `posts` Seq Scan**으로 풀려, 후보로 좁히기 전에 전체
  게시물의 `data->>'rating'` JSONB/정규식을 전역으로 평가하는 경우다(옛 함수에는 없던 비용).
  이 형태가 보이면 후속 과제로 기록한다.

## 4. 검증 후 정리

**§2의 비교가 관문 0·A·B·C를 모두 통과한 상태에서 0행이었을 때만** 스냅샷 함수를 지운다.
관문을 하나라도 못 본 채 0행만 확인했다면 정리하지 말 것 — 스냅샷을 지우면 다시 비교할 수 없다.

```sql
drop function if exists public.mate_suggestions_old(int, text[]);
```

```sql
select p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'mate_suggestions%';
-- mate_suggestions 하나만 나와야 한다.
```

`mate_suggestions_old`는 `security definer` + `grant to authenticated`다. 삭제를 잊고
파일까지 지우면, 이후 `mate_suggestions`에 어떤 공개범위 수정을 해도 그 잔존 함수에는
반영되지 않은 채 `authenticated`가 계속 호출할 수 있으므로, 위 확인 쿼리로 반드시 지워졌는지
본 뒤에 넘어갈 것. `drop`은 시그니처가 다르면 `if exists` 때문에 조용히 아무것도 하지 않으므로,
이 확인 쿼리를 건너뛰면 안 된다.

**세션에 고정한 신원도 반드시 해제한다.**

```sql
select set_config('request.jwt.claims', '', false);
```

```sql
select auth.uid();
-- NULL이어야 한다.
```

`is_local = false`로 넣었기 때문에 커넥션이 풀로 돌아가도 설정이 남을 수 있다. 그대로 두면
같은 대시보드에서 이후에 돌리는 쿼리들이 그 사용자 신원으로 실행되어, 무관한 작업의 결과를
조용히 왜곡한다.

마지막으로 `supabase/tmp-perf-verify.sql` 파일을 삭제한다. 스냅샷은 `schema.sql`에 없으므로
이 세 가지(함수 drop·신원 해제·파일 삭제)로 정리가 끝난다.
