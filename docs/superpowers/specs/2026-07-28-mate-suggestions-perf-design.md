# mate_suggestions 성능 구조 개선 — 전역 경로에서 `data` 분리

## 목적

`mate_suggestions` RPC가 매 호출마다 전체 공개 게시물의 `data`(레코드 전체 JSON)를 운반한다.
이 운반을 없애 규모가 커졌을 때의 비용을 낮춘다. **점수 결과는 한 점도 바뀌지 않는다.**

체감 지연은 아직 없다(사용자 확인). 측정된 병목이 아니라 **구조적 낭비를 제거**하는 작업이다.

## 진단

비용이 두 종류이고, 이번에 잡는 것은 ①뿐이다.

**① `data` 운반 (이번 범위)**

`pub`(schema.sql:539)이 `visibility <> 'private'`인 **전체 게시물**에 대해 `p.data`를 선택한다.
`data`에는 본문·사진 URL·`perCountryData` 등이 모두 들어 있다.

더 나쁜 것은 `pub_country`(:555)다. `country_name`에 더해 `data->'countries'`를 펼쳐
**(게시물 × 나라)로 행이 불어나는데 `x.data`를 그대로 들고 간다.** 3개국 여행 1건이면
레코드 전체 JSON이 3벌 복제되고, 이것이 전 사용자 게시물에 대해 일어난다.

정작 `data` 전체가 필요한 계산(도시·키워드·별점·예산·항공편)은 **이미 내 것 아니면 후보 200명으로
좁혀져 있다**(`= me.uid` 또는 `in (select cid from cand)`). 즉 전역으로 옮길 이유가 없는 것을
전역으로 옮기고 있다.

**② 전역 집계 스캔 (범위 밖)**

`country_user_counts`·`user_total`·`ubiquitous_countries`는 "이 나라를 몇 명이 방문했나"를
구하므로 **본질적으로 전 사용자를 봐야 한다.** 후보를 아무리 좁혀도 이 스캔은 남는다.

이를 없애려면 보조 테이블+트리거 또는 머티리얼라이즈드 뷰+주기 갱신이 필요한데,
전자는 앱 핵심 테이블의 쓰기 경로에 코드를 넣는 일이고 후자는 pg_cron 가용 여부가 미확정이다.
**측정 없이 감수할 위험이 아니므로 이번 범위에서 뺀다.** ①을 적용한 뒤 `explain analyze`로
실제 병목을 확인하고 판단한다.

## 설계

원칙: **전역으로 도는 것은 좁게, `data`가 필요한 것은 좁혀진 뒤에.**

### `pub` — `data` 대신 `countries`만

나라 전개에 필요한 것은 `data->'countries'`(`{flag, name}` 배열)뿐이다. 이것만 들고 간다.

```
pub(post_id, author_id, country_name, trip_date, countries)
```

- `post_id`는 `data`를 되짚어 읽을 때 쓴다. 지금은 미사용 컬럼(`p.id`)이지만 이 설계에서 하중을 받는다
- `trip_date` 파싱식(`startDate` → `date` → `created_at`, 정규식 가드 + `to_date`)은 **여기 한 곳에만** 둔다.
  다른 곳에 복제하면 중복 로직이 되어 결함이다
- `countries`는 기존 `jsonb_typeof(...) = 'array'` 가드를 그대로 유지한다

### `pub_country` — `data` 복제 제거

`pub.countries`를 펼친다. 출력에서 `data`를 뺀다.

```
pub_country(post_id, author_id, trip_date, name)
```

### `data`가 필요한 CTE — 좁혀진 뒤에 읽는다

두 갈래로 나뉜다. **판단 기준은 전개된 나라(`pc.name`)에 의존하는가**이다.

**(a) 나라 격자가 필요한 것 — `pub_country`에 `post_id`로 조인**

`my_rating`(:636)과 `crating`(:763)은 `pc.name in (select name from my_countries)`로
**전개된 나라**를 거른 뒤 평균을 낸다. (게시물 × 나라) 격자가 결과에 영향을 주므로
반드시 `pub_country`를 거쳐야 한다.

```
from pub_country pc join public.posts p on p.id = pc.post_id
where pc.author_id = me.uid            -- 또는 in (select cid from cand)
```

격자가 다른 축과 어긋나는 문제(3개국 기록의 별점이 3번 반영)는 **알려진 별건**이며
후속 과제 문서에 있다. 이번에 고치지 않는다 — 고치면 성능 변경인지 동작 변경인지 구분이 안 된다.

**(b) 나라 격자가 필요 없는 것 — `public.posts` 직접 조회**

`my_cities`·`my_keywords`·`my_budget`·`my_flight`·`ccity_pairs`·`ckw`·`cbudget`·`cflight`는
`country_name`(대표 국가) 또는 나라와 무관한 필드만 쓴다. `public.posts`를 작성자로 걸러 직접 읽는다.

```
from public.posts p
where p.visibility <> 'private'
  and p.author_id = me.uid             -- 또는 in (select cid from cand)
```

`idx_posts_author`(author_id)를 탄다. `visibility <> 'private'` 조건을 각 CTE가 직접 들고 있어야
`pub`을 거치지 않고도 대상 집합이 동일하다.

## 동작 보존

**이 변경으로 점수가 달라지면 실패다.** 같은 입력에 같은 출력이어야 한다.

특히 지켜야 할 것:

- `visibility <> 'private'` 필터가 모든 경로에 그대로 적용될 것 — `pub`을 안 거치는 CTE는 스스로 걸어야 한다
- `my_rating`·`crating`의 (게시물 × 나라) 격자가 유지될 것
- 나라 전개가 `country_name` ∪ `data->'countries'[].name`로 동일할 것
- 빈 문자열·NULL 나라명 제외 규칙이 동일할 것
- 반환 17컬럼의 이름·순서·타입이 동일할 것

## 검증

로컬에 Postgres가 없어 정독만으로는 동작 보존을 증명할 수 없다. **실행 비교로 증명한다.**

1. 현재 함수를 `mate_suggestions_old`라는 이름으로 그대로 복제해 남긴다(본문 무수정)
2. 새 함수를 배포한다
3. 같은 계정으로 두 함수를 호출해 결과를 비교한다. 차이가 0행이어야 한다

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

양쪽 모두 0행이면 동작 보존이 증명된다. 한쪽만 0행이면 행 수가 다른 것이므로 실패다.

**주의:** 일자 기반 셔플이 들어 있으므로 두 호출은 **같은 날** 이뤄져야 한다.
또 `extra_countries` 기본값(`'{}'`)으로 비교해야 양쪽 입력이 같다.

4. 확인 후 `drop function public.mate_suggestions_old(int, text[]);`

성능 확인은 같은 세션에서:

```sql
explain (analyze, buffers) select * from public.mate_suggestions(10);
```

`pub`·`pub_country`의 실제 행 수와 버퍼 읽기량을 전후 비교한다.

## 범위 밖

- 보조 테이블 + 트리거, 머티리얼라이즈드 뷰, pg_cron (진단 ②)
- `cand`의 `limit 200`에 `order by` 추가
- 별점의 (게시물 × 나라) 격자 정정
- `perCountryData` 반영, `friends.reasonCountry` 신설, 영어 로케일 개선
- 튜닝 상수(자카드 `×2`, 편재 임계 `0.5`) 조정

전부 `docs/superpowers/plans/2026-07-28-mate-suggestion-score-followups.md`에 근거와 함께 있다.
