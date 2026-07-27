# mate_suggestions 성능 리팩터 — 실행 검증 런북

이 리팩터는 **점수가 바뀌지 않아야** 성공이다. 로컬에 Postgres가 없어 정독으로만 검증했으므로,
아래 절차로 실행 비교해 동작 보존을 증명한다.

## 1. 두 함수 배포

**두 파일은 서로 독립적이라 실행 순서 자체는 결과에 영향을 주지 않는다.**
`supabase/tmp-perf-verify.sql`은 본문을 통째로 인라인한 자립 파일이라 라이브 함수를 참조하지
않는다 — "구 함수가 살아 있어야 스냅샷이 의미가 있다"는 근거는 사실이 아니다.

다만 아래 순서를 따르면 스냅샷을 올린 직후에 "운영 현행 = 스냅샷"인지 확인할 수 있으므로
이 순서로 진행한다.

**(a) 먼저 `supabase/tmp-perf-verify.sql`을 실행해 `mate_suggestions_old`를 만든다.**

**(b) 운영 현행이 스냅샷과 같은지 확인한다 — `schema.sql`을 돌리기 전에.**

```sql
select proname, md5(prosrc) from pg_proc
where proname in ('mate_suggestions', 'mate_suggestions_old');
-- 두 md5가 같아야 '운영 현행 = 스냅샷'이다.
-- 다르면 운영 DB에 레포와 다른 버전이 떠 있다는 뜻이므로, 그 차이를 먼저 확인할 것.
```

이 스냅샷은 **레포 `1406d3c` 시점의 정의**를 인라인한 것이지, "운영 DB의 현재 함수"를
자동으로 캡처한 것이 아니다. 위 md5 확인을 건너뛰면, 운영 DB에 레포와 다른 버전이 떠 있어도
모르고 지나가 이후 비교가 "운영 현행 vs 신규"가 아니게 된다.

**(c) 그 다음 `supabase/schema.sql`의 `mate_suggestions` 블록을 실행한다.**
트랜잭션으로 감쌀 것:

```sql
begin;
-- schema.sql의 drop function ~ grant execute 까지
commit;
```

`drop function`이 `create`보다 먼저 돌므로 감싸지 않으면 create 실패 시 함수가 사라진 채 남는다.
그 상태에서 앱은 에러 없이 추천 섹션만 빈다.

## 2. 출력 비교 — 이것이 본 검증이다

**관문을 먼저 통과해야 한다.** 관문 없이 비교하면 두 함수가 모두 0행을 내도 "0행 차이 = 통과"로
읽혀 아무것도 검증하지 못한다. `mate_suggestions`는 `me` CTE에서 `auth.uid()`를 쓰는데,
Supabase SQL Editor에는 기본적으로 `request.jwt.claims`가 없어 `auth.uid()`가 NULL이다 —
그러면 `my_countries`·`my_mates`·`cand`가 전부 공집합이 되어 **두 함수 모두 0행**을 반환하고,
`except` 양방향이 0행으로 나와 "동작 보존 증명됨"으로 잘못 읽힌다. 아래 관문 A·B는 정확히
이 거짓 통과를 막기 위한 것이며, 건너뛰면 안 된다.

```sql
begin;
-- 1) 열람자 신원 주입. security definer 함수라 role 변경은 필요 없다.
select set_config('request.jwt.claims',
  json_build_object('sub','<검증할 계정 UUID>','role','authenticated')::text, true);

-- 2) 관문 A — 신원이 잡혔는가. NULL이면 여기서 중단한다.
select auth.uid();

-- 3) 관문 B — 결과가 비어있지 않은가. 0이면 비교는 아무것도 증명하지 못하므로 중단한다.
select count(*) as n_new from public.mate_suggestions(50);
select count(*) as n_old from public.mate_suggestions_old(50);
-- n_new = n_old 이고 둘 다 > 0 이어야 다음으로 간다.

-- 4) 본 비교 — except ALL 이어야 중복 다중도까지 본다.
select * from public.mate_suggestions(50)
except all
select * from public.mate_suggestions_old(50);

select * from public.mate_suggestions_old(50)
except all
select * from public.mate_suggestions(50);
commit;
```

**두 비교 모두 0행이어야 한다.** 행 수 비교는 `except`가 아니라 관문 B의 `count(*)`로 한다 —
`except`(ALL 없음)는 양쪽을 중복 제거한 뒤 비교하므로, "새 함수가 같은 후보를 2번 반환"하는
종류의 결함(다중도 회귀)은 `except`만으로는 양방향 모두 0행으로 통과해버린다. 본 비교에
`except all`을 쓰는 이유가 이것이다. 이번 리팩터가 새로 들인 위험인
`join public.posts p on p.id = pc.post_id`의 팬아웃이 정확히 이 사각과 겹친다.

**셔플이 일자 기반이라 위 전부를 같은 날 실행해야 한다.**

### 검증 계정 전제 조건

이번 리팩터에서 구조가 실제로 바뀐 유일한 경로는 `my_rating`·`crating`의 `post_id` 되짚기다.
**`countries` 배열에 2개국 이상이 들어 있고 `rating`이 채워진 기록을 가진 계정**으로 검증해야
그 경로가 실행된다. 그런 기록이 없으면 0행 차이가 나와도 핵심을 검사하지 않은 것이다.

### 차이가 나왔을 때 — 회귀인지 먼저 가릴 것

아래는 이번 리팩터 이전부터 있던 동점 비결정성이다. 실행계획이 바뀌면 임의 선택이 뒤집혀
정상 리팩터에서도 diff가 날 수 있다. 순서대로 배제한 뒤에 회귀로 판단할 것.

**① 차이가 `sample_countries` 원소 '순서'뿐인가** → 동점 비결정성. 회귀 아님.
사용자 20명 미만이면 모든 나라 가중치가 1.0이라 정렬 키가 상수다. 정규화해 재비교:

```sql
select handle, (select array(select unnest(sample_countries) order by 1)) as sc_sorted
from public.mate_suggestions(50)
except all
select handle, (select array(select unnest(sample_countries) order by 1))
from public.mate_suggestions_old(50);
```

**② 차이가 `taste_score`에 몰려 있는가** → `my_budget` 통화 또는 `my_flight` 동수 확인:

```sql
select p.data->'budget'->>'currency' as cur, count(*)
from public.posts p
where p.author_id = auth.uid() and p.visibility <> 'private'
group by 1 order by 2 desc;
-- 1위가 동수면 기존 비결정성이며 회귀 아님
```

**③ 후보가 200명 미만인가** → 200 이상이면 `cand`의 `limit 200`에 `order by`가 없어
두 함수가 다른 200명을 뽑는다. 이 경우 비교 자체가 무효다.

**④ 위 셋 다 아니면 진짜 회귀다.** 해당 `handle`과 어긋난 컬럼을 알려줄 것 — 어느 축이
틀어졌는지 바로 좁혀진다.

### 보너스 — `extra_countries` 경로도 확인

앱은 `src/services/social.ts`에서 실제로 `extra_countries`를 넘긴다(검증은 위에서 양쪽 모두
기본값 `'{}'`로 호출했다 — 입력을 맞추려면 옳은 선택이다). `my_countries`의 union만 타므로
위험은 낮지만, 위 관문 통과 후 아래로 이 경로까지 한 번 더 덮는다.

```sql
select * from public.mate_suggestions(50, array['일본','태국'])
except all
select * from public.mate_suggestions_old(50, array['일본','태국']);

select * from public.mate_suggestions_old(50, array['일본','태국'])
except all
select * from public.mate_suggestions(50, array['일본','태국']);
-- 둘 다 0행이어야 한다.
```

## 3. 성능 확인

```sql
explain (analyze, buffers) select * from public.mate_suggestions(10);
explain (analyze, buffers) select * from public.mate_suggestions_old(10);
```

새 계획에서는 **`CTE pub` 노드가 사라져 있어야 정상이다**(참조가 `pub_country` 1회뿐이라
PG12+에서 인라인된다). 비교 대상은 `CTE pub_country` 하나이며, 폭이 좁아진 만큼
temp/tuplestore 사용량이 줄어야 한다. 노드가 사라진 것 자체가 성과의 증거이지 결함이 아니다.

`shared read`/`shared hit` 버퍼 수치도 비교한다. 새 쪽의 버퍼 읽기량이 줄어 있으면
의도한 효과가 난 것이다.

지금은 게시물 수가 적어 체감 차이가 없을 수 있다. 그래도 버퍼 수치는 구조 개선을 보여준다.

- `my_rating`·`crating`이 `posts_pkey`에 대한 **Nested Loop + Index Scan**으로 풀리는지 볼 것.
  진짜 위험은 이 경로가 **Hash Join + `posts` Seq Scan**으로 풀려, 후보로 좁히기 전에 전체
  게시물의 `data->>'rating'` JSONB/정규식을 전역으로 평가하는 경우다(옛 함수에는 없던 비용).
  이 형태가 보이면 후속 과제로 기록한다.

## 4. 검증 후 정리

비교가 0행으로 통과하면 스냅샷 함수를 지운다.

```sql
drop function if exists public.mate_suggestions_old(int, text[]);

select proname from pg_proc where proname like 'mate_suggestions%';
-- mate_suggestions 하나만 나와야 한다.
```

`mate_suggestions_old`는 `security definer` + `grant to authenticated`다. 삭제를 잊고
파일까지 지우면, 이후 `mate_suggestions`에 어떤 공개범위 수정을 해도 그 잔존 함수에는
반영되지 않은 채 `authenticated`가 계속 호출할 수 있으므로, 위 확인 쿼리로 반드시 지워졌는지
본 뒤에 넘어갈 것.

그리고 `supabase/tmp-perf-verify.sql` 파일을 삭제한다. 스냅샷은 `schema.sql`에 없으므로
이 두 가지로 정리가 끝난다.
