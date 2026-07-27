# mate_suggestions 성능 구조 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `mate_suggestions` RPC가 전체 공개 게시물의 `data`(레코드 전체 JSON)를 운반하는 구조를 없앤다. 점수 결과는 불변이다.

**Architecture:** 전역으로 도는 CTE(`pub`, `pub_country`)는 나라 전개에 필요한 `countries` 배열만 들고, `data` 전체가 필요한 계산은 작성자로 좁혀진 뒤(`= me.uid` 또는 `in (select cid from cand)`) `public.posts`를 직접 읽는다. 리팩터를 두 단계로 나눠 각 단계가 독립적으로 동작하는 함수를 남긴다 — 먼저 소비처를 옮기고, 그 다음 `data`를 뺀다.

**Tech Stack:** PostgreSQL (Supabase), `language sql` / `security definer` 함수. 클라이언트 변경 없음.

## Global Constraints

- **동작 보존이 최우선이다. 점수가 한 점이라도 달라지면 실패다.** 이 계획의 어떤 태스크도 산식·필터·집계 격자를 바꾸지 않는다
- `visibility <> 'private'` 필터가 모든 경로에 적용될 것. `pub`을 거치지 않는 CTE는 스스로 이 조건을 들고 있어야 한다
- `my_rating`·`crating`의 (게시물 × 나라) 격자를 유지할 것 — 전개된 나라(`pc.name`)로 거른 뒤 평균이며, 이 격자가 결과에 영향을 준다
- 나라 전개는 `country_name` ∪ `data->'countries'[].name`로 동일할 것. 빈 문자열·NULL 나라명 제외 규칙도 동일
- 반환 17컬럼의 이름·순서·타입 불변. `returns table`과 최종 `select`를 매번 대조할 것
- `trip_date` 파싱식(`startDate` → `date` → `created_at`, 정규식 가드 + `to_date`)은 **한 곳에만** 둔다. 복제는 중복 로직 결함이다
- 자유 JSONB에 무가드 `::date`·`::numeric` 금지. 기존 정규식 가드를 그대로 옮길 것
- `security definer set search_path = public`, `grant execute ... to authenticated`, `drop function if exists public.mate_suggestions(int, text[])` 유지
- 모든 주석·커밋 메시지는 한글
- SQL은 로컬에서 실행할 수 없다(Postgres 없음). 각 태스크는 정독 검증 결과를 보고서에 남긴다

## 범위 밖 (건드리지 말 것)

- 보조 테이블 + 트리거, 머티리얼라이즈드 뷰, pg_cron
- `cand`의 `limit 200`에 `order by` 추가
- 별점의 (게시물 × 나라) 격자 정정 — 알려진 별건이며 고치면 성능 변경과 구분이 안 된다
- `perCountryData` 반영, `friends.reasonCountry` 신설, 영어 로케일 개선
- 튜닝 상수(자카드 `×2`, 편재 임계 `0.5`) 조정
- 클라이언트 코드(`src/`) 일체

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `supabase/schema.sql` | `mate_suggestions` 함수 정의 | CTE 재구조화 |
| `supabase/tmp-perf-verify.sql` | 검증용 구 함수 스냅샷 (일회용) | **신규 — 검증 후 삭제** |
| `docs/superpowers/plans/2026-07-28-mate-suggestions-perf-verify.md` | 사용자용 실행 검증 런북 | **신규** |

스냅샷을 `schema.sql`이 아니라 별도 파일에 두는 이유: 유지되는 스키마에 축자 복제본이 들어가면 다음 재실행 때마다 임시 함수가 되살아난다. 파일을 분리하면 이름 자체가 일회용임을 말해주고, 정리가 파일 삭제로 끝난다.

---

### Task 1: 검증 하네스 — 구 함수 스냅샷

**Files:**
- Create: `supabase/tmp-perf-verify.sql`
- **`supabase/schema.sql`은 이 태스크에서 읽기만 한다 — 수정 금지**

**Interfaces:**
- Produces: `public.mate_suggestions_old(match_limit int default 10, extra_countries text[] default '{}')` — 현재 함수와 **완전히 동일한 본문**. Task 4의 비교 검증이 이것을 쓴다.

동작 보존을 정독만으로 증명할 수 없으므로, 리팩터 전 함수를 다른 이름으로 남겨 출력을 직접 비교한다.

**스냅샷은 `schema.sql`에 넣지 않는다.** 유지되는 스키마에 축자 복제본이 들어가면 다음 재실행 때마다 임시 함수가 되살아난다. 별도 파일이라 정리가 파일 삭제로 끝난다.

- [ ] **Step 1: 현재 함수 본문을 그대로 복제**

`supabase/schema.sql`에서 `create or replace function public.mate_suggestions(...)` 부터 그 함수의 `$$;` 까지를 통째로 복사해 **새 파일 `supabase/tmp-perf-verify.sql`**에 붙여넣는다. 붙여넣은 사본에서 함수 이름만 `mate_suggestions_old`로 바꾼다.

**본문은 한 글자도 바꾸지 않는다.** 주석까지 그대로 둔다 — 비교 대상이 현재 동작이어야 하기 때문이다.

파일 전체는 다음 형태다.

```sql
-- ── 성능 리팩터 검증용 스냅샷 (일회용 — 검증 후 이 파일째로 삭제) ──────────
-- mate_suggestions의 리팩터 전 본문을 그대로 복제한 것. 새 함수와 출력을 비교해
-- 동작 보존을 실행으로 증명하는 용도다. schema.sql에 넣지 않는 이유는
-- 유지되는 스키마에 남으면 재실행 때마다 임시 함수가 되살아나기 때문이다.
-- 정리: drop function if exists public.mate_suggestions_old(int, text[]);
--       그리고 이 파일 삭제.
drop function if exists public.mate_suggestions_old(int, text[]);
create or replace function public.mate_suggestions_old(match_limit int default 10, extra_countries text[] default '{}')
returns table (
  «원본 mate_suggestions의 returns table 블록을 복사한 그대로 — 수정 금지»
)
language sql security definer set search_path = public as $$
  «원본 mate_suggestions의 본문을 복사한 그대로 — 수정 금지»
$$;

grant execute on function public.mate_suggestions_old(int, text[]) to authenticated;
```

`«»`로 표시한 두 곳은 원본에서 **복사해 붙이는** 부분이다. 여기에 계획서가 코드를 다시 적지 않는 이유는, 380줄을 옮겨 적으면 옮겨 적는 과정에서 원본과 어긋날 수 있기 때문이다 — 비교 대상이 현재 동작과 다르면 검증 자체가 무의미해진다. Step 2가 복사가 정확한지 기계로 확인한다.

- [ ] **Step 2: 두 함수가 동일한지 기계 대조**

원본과 사본에서 함수명 줄만 제외한 나머지가 같은지 확인한다.

```bash
cd "C:/Users/2023user/OneDrive/바탕 화면/eOrth"
node -e "
const fs=require('fs');
const grab=(file,n)=>{const s=fs.readFileSync(file,'utf8');const i=s.indexOf('create or replace function public.'+n+'(');const j=s.indexOf('\$\$;',i);return s.slice(i,j);};
const a=grab('supabase/schema.sql','mate_suggestions').replace('mate_suggestions','X');
const b=grab('supabase/tmp-perf-verify.sql','mate_suggestions_old').replace('mate_suggestions_old','X');
console.log(a===b?'동일':'다름');
console.log('원본 길이',a.length,'사본 길이',b.length);
"
```

Expected: `동일`

`다름`이 나오면 길이 차이를 보고 어디가 어긋났는지 찾는다. 이 대조가 통과하지 못하면 이후 비교 검증이 무의미하므로, 통과할 때까지 진행하지 말 것.

- [ ] **Step 3: `schema.sql`이 안 바뀌었는지 확인**

```bash
cd "C:/Users/2023user/OneDrive/바탕 화면/eOrth"
git diff --name-only
```

Expected: `supabase/schema.sql`이 **나오지 않는다**. 이 태스크는 새 파일만 만든다.

- [ ] **Step 4: 커밋**

```bash
git add supabase/tmp-perf-verify.sql
git commit -m "test(mate): 성능 리팩터 검증용 구 함수 스냅샷 추가

리팩터 전후 출력을 except로 비교해 동작 보존을 실행으로 증명하기 위한
일회용 파일. schema.sql에는 넣지 않는다 — 유지되는 스키마에 남으면
재실행 때마다 임시 함수가 되살아난다. 검증 후 파일째 삭제한다."
```

---

### Task 2: `data` 소비 CTE를 좁혀진 소스로 이전

**Files:**
- Modify: `supabase/schema.sql` — `mate_suggestions` 함수 내부 (`mate_suggestions_old`는 **건드리지 않는다**)

**Interfaces:**
- Consumes: 없음
- Produces: `pub`에 `post_id` 컬럼(기존 `p.id`의 별칭). Task 3이 이를 유지한다.

이 태스크가 끝나면 `pub.data`·`pub_country.data`를 읽는 곳이 **하나도 없게** 된다. 컬럼 자체는 아직 남아 있으므로 함수는 계속 동작한다. Task 3에서 제거한다.

**판단 기준:** 전개된 나라(`pc.name`)에 의존하면 `pub_country`를 거쳐 `post_id`로 되짚어 조인하고, 아니면 `public.posts`를 직접 읽는다.

**이동 대상은 정확히 10개다.** 함수 전체를 훑어 `pub`/`pub_country`를 통해 `data`에 접근하는 CTE를 전수 조사한 결과다. 하나라도 빠뜨리면 Task 3에서 컴파일이 깨진다.

| CTE | 현재 소스 | 이동 후 | 이유 |
|---|---|---|---|
| `my_cities` | `pub` | `public.posts` 직접 | 대표 국가(`country_name`)만 씀 |
| `my_keywords` | `pub` | `public.posts` 직접 | 나라 무관 |
| `my_budget` | `pub` | `public.posts` 직접 | 나라 무관 |
| `my_flight` | `pub` | `public.posts` 직접 | 나라 무관 |
| `my_rating` | `pub_country` | `pub_country` + `post_id` 조인 | **전개된 나라로 거름 — 격자 필요** |
| `ccity_pairs` | `pub` | `public.posts` 직접 | 대표 국가만 씀 |
| `ckw` | `pub` | `public.posts` 직접 | 나라 무관 |
| `cbudget` | `pub` | `public.posts` 직접 | 나라 무관 |
| `cflight` | `pub` | `public.posts` 직접 | 나라 무관 |
| `crating` | `pub_country` | `pub_country` + `post_id` 조인 | **전개된 나라로 거름 — 격자 필요** |

`data`를 안 쓰는 나머지 소비처(`user_total`, `country_user_counts`, `my_countries`, `my_seasons`, `my_recent`, `cand`, `cand_weight_sum`, `cshared_pairs`, `crecent`, `cseason`, `pub_season`)는 **건드리지 않는다.**

- [ ] **Step 1: `pub`·`pub_country`에 `post_id` 노출**

`pub`의 `select p.id,` 를 `select p.id as post_id,` 로 바꾼다. 나머지는 그대로 둔다(`p.data`도 아직 남긴다).

`pub_country`에 `post_id`를 추가한다:

```sql
  pub_country as (
    select x.post_id, x.author_id, x.data, x.trip_date, c.name
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
```

- [ ] **Step 2: 나라 격자가 필요 없는 내 입력 4개를 `public.posts` 직접 조회로**

`my_cities`, `my_keywords`, `my_budget`, `my_flight`를 아래로 교체한다. `visibility <> 'private'`을 각자 들고 있어야 `pub`과 대상 집합이 같다.

```sql
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
```

```sql
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
```

- [ ] **Step 3: 나라 격자가 필요한 `my_rating`을 `post_id` 조인으로**

`pc.name in (select name from my_countries)`로 전개된 나라를 거른 뒤 평균이므로 `pub_country`를 거쳐야 한다. 격자를 바꾸지 않는다.

```sql
  my_rating as (
    select avg((p.data->>'rating')::numeric) as r
    from pub_country pc
    join public.posts p on p.id = pc.post_id
    cross join me
    where pc.author_id = me.uid and pc.name in (select name from my_countries)
      and (p.data->>'rating') ~ '^[0-9]+(\.[0-9]+)?$'
  ),
```

- [ ] **Step 4: 후보 계산 3개를 `public.posts` 직접 조회로**

`ccity_pairs`, `ckw`, `cbudget`, `cflight`를 교체한다.

```sql
  ccity_pairs as (
    select distinct p.author_id as cid, p.country_name as country, p.data->>'regionName' as city
    from public.posts p
    join my_cities mc on mc.country = p.country_name and mc.city = p.data->>'regionName'
    where p.visibility <> 'private'
      and p.author_id in (select cid from cand)
      and p.country_name not in (select name from ubiquitous_countries)
  ),
```

```sql
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
```

```sql
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
```

- [ ] **Step 5: 나라 격자가 필요한 `crating`을 `post_id` 조인으로**

```sql
  crating as (
    select pc.author_id as cid, avg((p.data->>'rating')::numeric) as r
    from pub_country pc
    join public.posts p on p.id = pc.post_id
    where pc.author_id in (select cid from cand)
      and pc.name in (select name from my_countries)
      and (p.data->>'rating') ~ '^[0-9]+(\.[0-9]+)?$'
    group by pc.author_id
  ),
```

- [ ] **Step 6: `pub`/`pub_country`의 `data` 소비가 0인지 확인**

`mate_suggestions` 함수 범위 안에서 `x.data`·`pc.data`(즉 `pub`/`pub_country` 별칭을 통한 `data` 접근)가 남아 있지 않아야 한다. 남아도 되는 것은 `p.data`(= `public.posts` 직접 접근)와 `pub` 정의 자체의 `p.data->>'startDate'`/`'date'`/`'countries'`뿐이다.

```bash
cd "C:/Users/2023user/OneDrive/바탕 화면/eOrth"
awk '/create or replace function public.mate_suggestions\(/,/^\$\$;/' supabase/schema.sql | grep -n "x\.data\|pc\.data"
```

Expected: `pub`/`pub_country` **정의 안**의 `x.data->'countries'` 한 줄만 남는다(Task 3에서 정리). 그 밖의 `x.data`·`pc.data`가 나오면 이전이 덜 끝난 것이다.

- [ ] **Step 7: 정독 검증**

다음을 직접 확인하고 보고서에 근거와 함께 적는다.

1. `public.posts`를 직접 읽도록 바꾼 8개(`my_cities`, `my_keywords`, `my_budget`, `my_flight`, `ccity_pairs`, `ckw`, `cbudget`, `cflight`)가 **각자** `visibility <> 'private'`을 들고 있는가 — `pub`을 안 거치므로 상속되지 않는다. 하나라도 빠지면 나만 보기 기록이 점수에 섞여 개인정보 원칙이 깨진다
2. `my_rating`·`crating` 2개가 여전히 `pub_country`를 거쳐 `pc.name`으로 거르는가 (격자 보존). 이 둘은 `pub_country` → `pub` 경유라 visibility가 상속된다
3. 위 표의 10개를 전부 옮겼는가 — 빠뜨리면 Task 3에서 깨진다
4. `post_id`로 조인하는 곳의 조인이 행을 불리지 않는가 — `posts.id`는 기본키라 1:1
5. 정규식 가드가 전부 그대로 옮겨졌는가 (`rating`, `budget.amount`)
6. 모든 CTE가 사용 전 정의되는가
7. 최종 `select` 17컬럼이 `returns table`과 이름·순서·타입 일치하는가
8. 괄호와 `$$`가 균형인가
9. `mate_suggestions_old`는 손대지 않았는가

- [ ] **Step 8: 타입·테스트 확인**

```bash
npx tsc --noEmit
npm test
```

Expected: tsc 0 errors, 19개 verify 파일 전체 통과. (SQL만 바꿨으므로 회귀가 없어야 정상이다.)

- [ ] **Step 9: 커밋**

```bash
git add supabase/schema.sql
git commit -m "perf(mate): data 소비 CTE를 좁혀진 소스로 이전

내 입력과 후보 계산이 전역 스캔 결과(pub) 대신 posts를 작성자로 걸러
직접 읽는다. 전개된 나라에 의존하는 my_rating·crating만 pub_country를
거쳐 post_id로 되짚어 조인해 (게시물×나라) 격자를 유지한다.

pub.data는 아직 남아 있으나 이제 소비처가 없다."
```

---

### Task 3: `pub`·`pub_country`에서 `data` 제거

**Files:**
- Modify: `supabase/schema.sql` — `mate_suggestions` 함수 내부 (`mate_suggestions_old`는 **건드리지 않는다**)

**Interfaces:**
- Consumes: Task 2가 만든 `pub.post_id`, 그리고 `pub`/`pub_country`에 `data` 소비처가 없는 상태
- Produces: 없음 (최종 형태)

- [ ] **Step 1: `pub`이 `data` 대신 `countries`만 들도록 교체**

```sql
  -- 전역 1회 스캔. data 전체(본문·사진 URL·perCountryData 포함)를 들고 다니지 않는다 —
  -- 나라 전개에 필요한 countries 배열만 남긴다. data가 필요한 계산은 작성자로 좁혀진 뒤
  -- public.posts를 직접 읽는다.
  pub as (
    select p.id as post_id, p.author_id, p.country_name,
           coalesce(
             case when p.data->>'startDate' ~ '^[0-9]{4}[./-][0-9]{1,2}[./-][0-9]{1,2}$'
                  then to_date(replace(replace(p.data->>'startDate', '.', '-'), '/', '-'), 'YYYY-MM-DD')
             end,
             case when p.data->>'date' ~ '^[0-9]{4}[./-][0-9]{1,2}[./-][0-9]{1,2}$'
                  then to_date(replace(replace(p.data->>'date', '.', '-'), '/', '-'), 'YYYY-MM-DD')
             end,
             p.created_at::date) as trip_date,
           case when jsonb_typeof(p.data->'countries') = 'array'
                then p.data->'countries' else '[]'::jsonb end as countries
    from public.posts p
    where p.visibility <> 'private'
  ),
```

`trip_date` 파싱식은 원본과 **한 글자도 다르지 않아야 한다.** 다른 곳에 복제하지 않는다.

- [ ] **Step 2: `pub_country`가 `pub.countries`를 펼치도록 교체**

```sql
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
```

`jsonb_typeof` 가드는 `pub`으로 옮겨졌으므로 `x.countries`는 항상 배열이다. 전개 결과·제외 규칙은 원본과 동일하다.

- [ ] **Step 3: `data` 잔존 확인**

```bash
cd "C:/Users/2023user/OneDrive/바탕 화면/eOrth"
awk '/create or replace function public.mate_suggestions\(/,/^\$\$;/' supabase/schema.sql | grep -n "data"
```

Expected: `p.data` 형태만 나온다 — `pub` 정의의 `startDate`/`date`/`countries` 3곳과, Task 2에서 `public.posts`를 직접 읽도록 바꾼 CTE들. `x.data`·`pc.data`는 **0건**이어야 한다.

- [ ] **Step 4: 정독 검증**

1. `pub_season`이 `pc.*`로 새 컬럼 구성을 받아도 `my_seasons`·`cseason`이 쓰는 `author_id`·`name`·`season`이 그대로인가
2. `pub_country`를 쓰는 모든 CTE(`user_total`, `country_user_counts`, `my_countries`, `my_recent`, `my_rating`, `cand`, `cand_weight_sum`, `cshared_pairs`, `crecent`, `crating`)가 제거된 `data` 컬럼을 참조하지 않는가
3. 나라 전개 집합이 원본과 동일한가 — `country_name` ∪ `countries[].name`, NULL·빈 문자열 제외
4. 모든 CTE가 사용 전 정의되는가
5. 최종 `select` 17컬럼이 `returns table`과 일치하는가
6. 괄호와 `$$`가 균형인가
7. `drop function if exists`의 시그니처가 `(int, text[])`인가

- [ ] **Step 5: 타입·테스트 확인**

```bash
npx tsc --noEmit
npm test
```

Expected: tsc 0 errors, 19개 verify 파일 전체 통과.

- [ ] **Step 6: 커밋**

```bash
git add supabase/schema.sql
git commit -m "perf(mate): 전역 CTE에서 data 운반 제거

pub이 레코드 전체 JSON 대신 countries 배열만 들고, pub_country는
그것을 펼친다. 나라 전개로 행이 불어날 때 data가 복제되던 문제가
사라진다. 전개 집합·제외 규칙·점수는 불변."
```

---

### Task 4: 사용자 실행 검증 런북

**Files:**
- Create: `docs/superpowers/plans/2026-07-28-mate-suggestions-perf-verify.md`

**Interfaces:**
- Consumes: Task 1의 `mate_suggestions_old`, Task 3까지의 새 `mate_suggestions`

SQL은 이 환경에서 실행할 수 없다. 사용자가 Supabase 대시보드에서 실행해 동작 보존을 증명하는 절차를 문서로 남긴다.

- [ ] **Step 1: 런북 작성**

`docs/superpowers/plans/2026-07-28-mate-suggestions-perf-verify.md`에 아래 내용을 쓴다.

````markdown
# mate_suggestions 성능 리팩터 — 실행 검증 런북

이 리팩터는 **점수가 바뀌지 않아야** 성공이다. 로컬에 Postgres가 없어 정독으로만 검증했으므로,
아래 절차로 실행 비교해 동작 보존을 증명한다.

## 1. 두 함수 배포

**순서가 중요하다.** 스냅샷을 먼저 올려야 비교 대상이 리팩터 전 동작이 된다.

**(a) 먼저 `supabase/tmp-perf-verify.sql`을 실행한다** — 아직 구 함수가 살아 있는 상태여야
스냅샷이 의미가 있으므로, 이 파일을 schema.sql보다 **먼저** 돌린다.

**(b) 그 다음 `supabase/schema.sql`의 `mate_suggestions` 블록을 실행한다.**
트랜잭션으로 감쌀 것:

```sql
begin;
-- schema.sql의 drop function ~ grant execute 까지
commit;
```

`drop function`이 `create`보다 먼저 돌므로 감싸지 않으면 create 실패 시 함수가 사라진 채 남는다.
그 상태에서 앱은 에러 없이 추천 섹션만 빈다.

## 2. 출력 비교 — 이것이 본 검증이다

**같은 날, 같은 계정으로** 두 함수를 호출해 비교한다. 셔플이 일자 기반이라 날짜가 넘어가면
결과가 달라진다.

```sql
-- 새 함수에만 있는 행
select * from public.mate_suggestions(50)
except
select * from public.mate_suggestions_old(50);

-- 구 함수에만 있는 행
select * from public.mate_suggestions_old(50)
except
select * from public.mate_suggestions(50);
```

**두 쿼리 모두 0행이어야 한다.** 한쪽만 0행이면 행 수가 다른 것이므로 실패다.

차이가 나오면 그 행의 `handle`과 어긋난 컬럼을 알려줄 것 — 어느 축이 틀어졌는지 바로 좁혀진다.

## 3. 성능 확인

```sql
explain (analyze, buffers) select * from public.mate_suggestions(10);
explain (analyze, buffers) select * from public.mate_suggestions_old(10);
```

`pub`·`pub_country` 노드의 실제 행 수와 `shared read`/`shared hit` 버퍼 수치를 비교한다.
새 쪽의 버퍼 읽기량이 줄어 있으면 의도한 효과가 난 것이다.

지금은 게시물 수가 적어 체감 차이가 없을 수 있다. 그래도 버퍼 수치는 구조 개선을 보여준다.

## 4. 검증 후 정리

비교가 0행으로 통과하면 스냅샷 함수를 지운다.

```sql
drop function if exists public.mate_suggestions_old(int, text[]);
```

그리고 `supabase/tmp-perf-verify.sql` 파일을 삭제한다. 스냅샷은 `schema.sql`에 없으므로
이 두 가지로 정리가 끝난다.
````

- [ ] **Step 2: 커밋**

```bash
git add docs/superpowers/plans/2026-07-28-mate-suggestions-perf-verify.md
git commit -m "docs(mate): 성능 리팩터 실행 검증 런북

구 함수와 출력을 except로 대조해 동작 보존을 증명하는 절차.
셔플이 일자 기반이라 같은 날 비교해야 한다는 조건 포함."
```

---

## 완료 후 사용자 작업

1. 런북대로 Supabase에서 `schema.sql` 재실행
2. `except` 비교 양방향 0행 확인
3. `explain (analyze, buffers)` 전후 비교
4. 통과하면 `mate_suggestions_old`를 DB에서 drop하고 `supabase/tmp-perf-verify.sql` 파일 삭제

**4번을 잊으면 검증용 임시 함수가 DB에 남는다.** 완료 보고 시 반드시 안내할 것.
