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

- `my_rating`·`crating`은 `pub_country`와 `public.posts`를 모두 읽어 `posts` 접근이 논리적으로 2회다. 계획된 구조이고 `posts.id`가 기본키라 비용이 작아야 하지만, 실행계획에서 이 두 경로가 **인덱스 탐색(Index Scan)으로 풀리는지** 한 번 확인할 것. Seq Scan이면 후속 과제로 남긴다.

## 4. 검증 후 정리

비교가 0행으로 통과하면 스냅샷 함수를 지운다.

```sql
drop function if exists public.mate_suggestions_old(int, text[]);
```

그리고 `supabase/tmp-perf-verify.sql` 파일을 삭제한다. 스냅샷은 `schema.sql`에 없으므로
이 두 가지로 정리가 끝난다.
