# 추천 메이트 점수 구체화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `mate_suggestions` RPC의 점수를 나라 희소성 가중 + 6개 축으로 재설계하고, 클라이언트가 축별 근거를 표시하게 한다.

**Architecture:** 점수 계산은 전부 Postgres RPC 안에서 끝난다(SQL 함수 1개 교체). 클라이언트는 RPC가 주는 축별 점수·겹친 도시·키워드를 받아 근거 문구와 % 배지만 그린다. 기존 반환 컬럼(`shared_count`·`sample_countries`·`mutual_count`·`style_score`·`total_score`)을 모두 유지해 구버전 앱이 깨지지 않게 한다.

**Tech Stack:** PostgreSQL (Supabase RPC, `security definer`) · TypeScript · React Native

**설계 문서:** `docs/superpowers/specs/2026-07-28-mate-suggestion-score-design.md`

## Global Constraints

- 언어: 모든 주석·커밋 메시지는 한글로 작성한다
- **개인정보**: 계산 입력은 `visibility <> 'private'`인 기록만. 시간 정보는 점수 계산에만 쓰고 **반환값·근거 문구에 날짜를 노출하지 않는다**. 시기 비교는 월 단위(계절) 이상 해상도만 사용한다
- **하위 호환**: RPC 반환에서 기존 5개 컬럼(`shared_count`, `sample_countries`, `mutual_count`, `style_score`, `total_score`)을 제거하지 않는다. `style_score`는 `interest_score + taste_score`로 채운다
- 총점 만점은 정확히 **100** (그대로 %로 표시)
- RPC는 `security definer set search_path = public` 유지, `grant execute ... to authenticated` 유지
- 각 태스크는 `npx tsc --noEmit` 통과 후 커밋한다

## 테스트 전략

이 변경의 핵심은 **SQL 함수**다. 이 저장소의 테스트(`npm test` = `node scripts/run-verify.mjs`가 `src/**/*.verify.ts`를 tsx로 실행)는 순수 TS 함수 검증용이라 SQL을 직접 돌릴 수 없다.

검증을 두 층으로 나눈다:

1. **순수 함수는 TS로 추출해 테스트한다** — % 표시 규칙과 근거 문구 선택은 클라이언트 로직이므로 TS에 두고 `*.verify.ts`로 검증한다.
2. **SQL은 실행 검증** — Supabase SQL 에디터에서 함수를 직접 호출해 컬럼·점수 합·분포·폴백을 확인한다. 각 태스크에 실행할 쿼리를 그대로 적어둔다.

계절 판정은 SQL 안에서만 쓰이므로(클라이언트는 `season_score`만 받는다) TS 유틸로 빼지 않는다 — 쓰이지 않는 코드를 만들지 않는다.

억지로 SQL 단위 테스트 프레임워크를 도입하지 않는다.

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `supabase/schema.sql` | `mate_suggestions` 함수 정의 | 함수 본문 전면 교체 |
| `src/utils/matchScore.ts` | 점수 → % 표시 규칙, 근거 문구 선택 (순수 함수) | **신규** |
| `src/utils/matchScore.verify.ts` | 표시 규칙·근거 선택 검증 | **신규** |
| `src/services/social.ts` | `MateSuggestionRow` 타입·매핑 | 축별 점수 필드 추가 |
| `src/screens/FriendSearchScreen.tsx` | 근거 문구·% 배지 | `matchScore.ts` 사용으로 교체 |
| `src/i18n/locales/{ko,en}.ts` | 근거 문구 키 | 신규 키 추가 |

---

### Task 1: 매칭 % 표시 규칙

가장 작고 의존성 없는 조각부터 시작한다. 설계의 "하한 30% 제거, 15 미만은 배지 숨김"을 순수 함수로 만든다.

**Files:**
- Create: `src/utils/matchScore.ts`
- Create: `src/utils/matchScore.verify.ts`

**Interfaces:**
- Produces: `matchPercent(score?: number | null): number | null` — 배지에 쓸 %. `null`이면 배지를 그리지 않는다. `MATCH_BADGE_MIN: number` 상수도 함께 내보낸다. Task 5(화면)가 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/utils/matchScore.verify.ts` 생성:

```ts
// 매칭 % 표시 규칙 검증.
import { matchPercent, MATCH_BADGE_MIN } from './matchScore';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const ok = actual === expected;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) { console.log(`   기대: ${expected} / 실제: ${actual}`); failed++; }
}

console.log('▶ src/utils/matchScore.verify.ts');

// 총점이 100 만점이라 점수를 그대로 %로 쓴다
eq(matchPercent(72), 72, '72점 = 72%');
eq(matchPercent(15), 15, '임계값 15점 = 15% (배지 표시)');

// 임계 미만은 배지를 아예 숨긴다 — 예전 하한 30%가 근거 없는 매칭을
// 30%로 부풀려 보이게 하던 것을 없앤다
eq(matchPercent(14), null, '14점 = null (배지 숨김)');
eq(matchPercent(1), null, '1점 = null');
eq(matchPercent(0), null, '0점 = null');
eq(matchPercent(undefined), null, 'undefined = null');
eq(matchPercent(null), null, 'null = null');
eq(matchPercent(-5), null, '음수 = null');
eq(matchPercent(NaN), null, 'NaN = null');

// 100%는 과한 확신이라 99로 막는다
eq(matchPercent(100), 99, '100점 = 99% (상한)');
eq(matchPercent(120), 99, '초과 점수도 99%');

// 소수는 반올림
eq(matchPercent(72.4), 72, '72.4 → 72');
eq(matchPercent(72.6), 73, '72.6 → 73');

eq(MATCH_BADGE_MIN, 15, '임계 상수 노출');

if (failed > 0) { console.log(`\n❌ ${failed}건 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx tsx src/utils/matchScore.verify.ts`
Expected: FAIL — `Cannot find module './matchScore'`

- [ ] **Step 3: 최소 구현**

`src/utils/matchScore.ts` 생성:

```ts
// 여행 DNA 점수 → 매칭률(%) 표시 규칙.
//
// mate_suggestions.total_score는 만점이 정확히 100이라(축 배점 합) 점수를 그대로 %로 쓴다.
//
// 예전엔 하한 30%를 뒀는데, 근거가 거의 없는 매칭도 30%로 보여 "점수가 사실과
// 안 맞는다"는 인상을 줬다. 하한을 없애고 대신 임계 미만이면 배지 자체를 숨긴다
// (근거 문구는 그대로 보여주므로 정보가 사라지지는 않는다).
export const MATCH_BADGE_MIN = 15; // 이 점수 미만이면 % 배지를 그리지 않는다
const MATCH_MAX_PERCENT = 99;      // 100%는 과한 확신

/** 배지에 표시할 % — null이면 배지를 그리지 않는다 */
export function matchPercent(score?: number | null): number | null {
  if (score == null || !Number.isFinite(score)) return null;
  if (score < MATCH_BADGE_MIN) return null;
  return Math.min(MATCH_MAX_PERCENT, Math.round(score));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx tsx src/utils/matchScore.verify.ts`
Expected: PASS — `✅ 모든 검증 통과`

- [ ] **Step 5: 전체 테스트·타입 확인**

Run: `npm test && npx tsc --noEmit`
Expected: 19개 파일 전체 통과(기존 18 + 신규 1), 타입 오류 0

- [ ] **Step 6: 커밋**

```bash
git add src/utils/matchScore.ts src/utils/matchScore.verify.ts
git commit -m "feat(mate): 매칭 % 표시 규칙 유틸

하한 30%를 없애고 임계(15점) 미만은 배지를 숨긴다 — 근거가 거의 없는
매칭이 30%로 부풀려 보이던 것을 바로잡는다. 근거 문구는 그대로 표시."
```

---

### Task 2: 근거 문구 선택 로직

어떤 축이 가장 기여했는지 골라 문구 키를 정하는 순수 함수. 화면에서 분리해 테스트한다.

**Files:**
- Modify: `src/utils/matchScore.ts` (Task 1에서 만든 파일에 추가)
- Modify: `src/utils/matchScore.verify.ts` (검증 추가)

**Interfaces:**
- Consumes: Task 1의 파일
- Produces: `pickReason(input: ReasonInput): ReasonResult | null`, 그리고 타입 `ReasonInput`·`ReasonResult`. Task 5(화면)가 소비한다.

```ts
export interface ReasonInput {
  placeScore: number; recencyScore: number; seasonScore: number;
  interestScore: number; tasteScore: number; mutualCount: number;
  sharedCities: string[]; sharedKeywords: string[]; sharedCount: number;
}
export interface ReasonResult { key: string; params: Record<string, string | number> }
```

- [ ] **Step 1: 실패하는 테스트 추가**

`src/utils/matchScore.verify.ts`의 **첫 줄 import를 아래로 교체**한다(ESM 모듈은 import를 파일 상단에 모은다):

```ts
import { matchPercent, MATCH_BADGE_MIN, pickReason } from './matchScore';
```

그리고 파일 끝의 `if (failed > 0)` 블록 **앞에** 아래를 삽입한다:

```ts
// ── 근거 문구 선택 ──
const base = {
  placeScore: 0, recencyScore: 0, seasonScore: 0, interestScore: 0, tasteScore: 0,
  mutualCount: 0, sharedCities: [] as string[], sharedKeywords: [] as string[], sharedCount: 0,
};

// 도시가 있으면 나라보다 강한 근거 — "둘 다 교토"가 "둘 다 일본"보다 구체적이다
eq(
  pickReason({ ...base, placeScore: 30, sharedCities: ['교토'], sharedCount: 1 })?.key,
  'friends.reasonCity',
  '도시 겹침이 나라보다 우선',
);

// 도시가 없으면 나라
eq(
  pickReason({ ...base, placeScore: 20, sharedCount: 1 })?.key,
  'friends.overlapReason',
  '도시 없으면 나라 근거',
);

// 장소가 없으면 시의성
eq(pickReason({ ...base, recencyScore: 15 })?.key, 'friends.reasonRecent', '장소 없으면 시의성');

// 그다음 관심사
eq(
  pickReason({ ...base, interestScore: 15, sharedKeywords: ['미식'] })?.key,
  'friends.reasonInterest',
  '관심사 근거',
);

// 그다음 계절
eq(pickReason({ ...base, seasonScore: 10 })?.key, 'friends.reasonSeason', '계절 근거');

// 그다음 공통 메이트
eq(pickReason({ ...base, mutualCount: 2 })?.key, 'friends.mutualReason', '공통 메이트 근거');

// 성향만 있으면 스타일 문구
eq(pickReason({ ...base, tasteScore: 7 })?.key, 'friends.styleReason', '성향 근거');

// 아무 근거도 없으면 null (호출부가 중립 문구로 폴백)
eq(pickReason({ ...base }), null, '근거 없으면 null');

// 장소 점수가 있어도 도시·나라 데이터가 없으면 다음 축으로 넘어간다
eq(
  pickReason({ ...base, placeScore: 10, sharedCount: 0, recencyScore: 15 })?.key,
  'friends.reasonRecent',
  '장소 근거 데이터 없으면 다음 축',
);

// 시의성 문구에는 날짜 관련 파라미터가 없어야 한다 (개인정보 원칙)
eq(Object.keys(pickReason({ ...base, recencyScore: 15 })?.params ?? {}).length, 0,
   '시의성 문구에 날짜 파라미터 없음');
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx tsx src/utils/matchScore.verify.ts`
Expected: FAIL — `pickReason` 관련 오류(export 없음)

- [ ] **Step 3: 구현 추가**

`src/utils/matchScore.ts` 끝에 아래를 추가한다:

```ts
// ── 추천 근거 문구 선택 ──
//
// 총점만 보여주면 "왜 이 사람인지"를 알 수 없다. 가장 기여도 높은 축을 골라 설명한다.
// 우선순위는 '구체적일수록 앞'이다 — 도시 > 나라 > 시의성 > 관심사 > 계절 > 공통 메이트 > 성향.
//
// ⚠️ 개인정보: 시의성 문구에 날짜·기간을 넣지 않는다("3일 전"·"지난주" 금지).
//    실시간 위치 추적으로 읽힐 수 있어 "최근"까지만 표현한다.
export interface ReasonInput {
  placeScore: number;
  recencyScore: number;
  seasonScore: number;
  interestScore: number;
  tasteScore: number;
  mutualCount: number;
  sharedCities: string[];
  sharedKeywords: string[];
  sharedCount: number;
}

export interface ReasonResult {
  key: string;
  params: Record<string, string | number>;
}

/** 가장 기여도 높은 축의 문구 키. 근거가 없으면 null(호출부가 중립 문구로 폴백) */
export function pickReason(input: ReasonInput): ReasonResult | null {
  if (input.placeScore > 0 && input.sharedCities.length > 0) {
    return { key: 'friends.reasonCity', params: { city: input.sharedCities[0] } };
  }
  if (input.placeScore > 0 && input.sharedCount > 0) {
    return { key: 'friends.overlapReason', params: { count: input.sharedCount } };
  }
  if (input.recencyScore > 0) {
    // 날짜 없음 — "최근"만 (개인정보 원칙)
    return { key: 'friends.reasonRecent', params: {} };
  }
  if (input.interestScore > 0 && input.sharedKeywords.length > 0) {
    return { key: 'friends.reasonInterest', params: { keyword: input.sharedKeywords[0] } };
  }
  if (input.seasonScore > 0) {
    return { key: 'friends.reasonSeason', params: {} };
  }
  if (input.mutualCount > 0) {
    return { key: 'friends.mutualReason', params: { count: input.mutualCount } };
  }
  if (input.tasteScore > 0) {
    return { key: 'friends.styleReason', params: {} };
  }
  return null;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx tsx src/utils/matchScore.verify.ts`
Expected: PASS

- [ ] **Step 5: 전체 테스트·타입 확인**

Run: `npm test && npx tsc --noEmit`
Expected: 19개 파일 전체 통과, 타입 오류 0

- [ ] **Step 6: 커밋**

```bash
git add src/utils/matchScore.ts src/utils/matchScore.verify.ts
git commit -m "feat(mate): 추천 근거 문구 선택 로직

가장 기여도 높은 축을 골라 설명한다. 우선순위는 구체적일수록 앞
(도시 > 나라 > 시의성 > 관심사 > 계절 > 공통 메이트 > 성향).

시의성 문구에는 날짜를 넣지 않는다 — '3일 전' 같은 표현은 실시간 위치
추적으로 읽힐 수 있어 '최근'까지만 표현한다(개인정보 원칙)."
```

---

### Task 3: RPC 재작성 — 희소성 가중 + 6개 축

이 계획의 핵심. SQL 함수 하나를 통째로 교체한다.

**Files:**
- Modify: `supabase/schema.sql` (기존 `mate_suggestions` 정의 — `drop function if exists public.travel_overlap_suggestions(int);` 줄부터 `grant execute on function public.mate_suggestions(int, text[]) to authenticated;` 줄까지)

**Interfaces:**
- Produces: RPC `mate_suggestions(match_limit int, extra_countries text[])`가 아래 컬럼을 반환한다. Task 4(서비스)가 소비한다.
  - 기존 유지: `author_id uuid, handle text, emoji text, profile_photo text, shared_count int, sample_countries text[], mutual_count int, style_score int, total_score int`
  - 신규: `place_score int, recency_score int, season_score int, interest_score int, taste_score int, shared_cities text[], shared_keywords text[]`

- [ ] **Step 1: 기존 함수 정의 위치 확인**

Run: `grep -n "drop function if exists public.travel_overlap_suggestions" supabase/schema.sql`
Expected: 한 줄 출력(교체 시작 지점). 이 줄 위의 주석 블록(`-- 추천 메이트(여행 DNA)...`)부터 `grant execute on function public.mate_suggestions(int, text[]) to authenticated;`까지가 교체 대상이다.

- [ ] **Step 2: 함수 본문 교체**

위에서 찾은 범위를 아래로 통째로 바꾼다.

```sql
-- ─────────────────────────────────────────────
-- 추천 메이트(여행 DNA) — 희소성 기반 6개 축 점수. 만점 100(그대로 %로 표시).
--
-- 축 배점: 나라(희소성) 25 + 도시 15 + 시의성 15 + 시기 10 + 관심사 15 + 성향 10 + 공통메이트 10
--
-- 예전 설계에서 바뀐 점:
--   · 나라를 '개수'가 아니라 '희소성 가중'으로 — 아이슬란드 겹침이 일본 겹침보다 값지다.
--     정규화(내 나라들의 가중치 합으로 나눔)가 '많이 다닌 사람이 항상 유리'를 없앤다.
--   · 기록형식·동행자 축 제거 — 2종만 겹쳐도 만점이라 사실상 전원이 받았고,
--     변별에 기여하지 않으면서 점수를 상단에 뭉치게 하는 주범이었다.
--
-- 개인정보: visibility <> 'private' 기록만 사용. 날짜는 점수 계산에만 쓰고 반환하지 않는다.
--   시기 비교는 월 단위(계절)까지만 — 일 단위 비교는 실시간 위치 추적으로 읽힐 수 있다.
--
-- 성능: 후보를 먼저 좁히고(1단계) 비싼 JSONB 추출은 그 후보에만 돌린다(2단계).
-- ─────────────────────────────────────────────
drop function if exists public.travel_overlap_suggestions(int);
create or replace function public.mate_suggestions(match_limit int default 10, extra_countries text[] default '{}')
returns table (
  author_id uuid, handle text, emoji text, profile_photo text,
  shared_count int, sample_countries text[], mutual_count int, style_score int, total_score int,
  place_score int, recency_score int, season_score int, interest_score int, taste_score int,
  shared_cities text[], shared_keywords text[]
)
language sql security definer set search_path = public as $$
  with me as (select auth.uid() as uid),

  -- 공개 기록만. 여행 시작일이 없으면 작성 시각으로 대체한다.
  pub as (
    select p.id, p.author_id, p.country_name, p.data,
           coalesce(nullif(p.data->>'startDate','')::date, p.created_at::date) as trip_date
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
  country_weight as (
    select pc.name,
           case when (select n from user_total) < 20 then 1.0
                else 1.0 / ln(exp(1) + count(distinct pc.author_id))
           end as w
    from pub_country pc
    group by pc.name
  ),

  -- 내 입력. extra_countries는 호출자 로컬(미발행·나만보기) 나라 보강 — 내 매칭 입력에만 쓰고
  -- 타인에게 노출하지 않는다.
  my_countries as (
    select pc.name from pub_country pc, me where pc.author_id = me.uid
    union
    select c from unnest(extra_countries) as c where c is not null and c <> ''
  ),
  my_cities as (
    select distinct x.data->>'regionName' as city
    from pub x, me
    where x.author_id = me.uid and coalesce(x.data->>'regionName', '') <> ''
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
  ccity as (
    select x.author_id as cid,
           count(distinct x.data->>'regionName')::int as n,
           (array_agg(distinct x.data->>'regionName'))[1:3] as cities
    from pub x
    where x.author_id in (select cid from cand)
      and x.data->>'regionName' in (select city from my_cities)
    group by x.author_id
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
      -- 나라(희소성 정규화) 25 + 도시 15
      (round(least(coalesce(s.shared_weight,0) / (select s from my_weight_sum), 1.0) * 25)
       + round(least(coalesce(ci.n,0), 3) / 3.0 * 15))::int as place_score,
      round(least(coalesce(r.n,0), 2) / 2.0 * 15)::int as recency_score,
      round(least(coalesce(se.n,0), 2) / 2.0 * 10)::int as season_score,
      round(least(coalesce(k.n,0), 3) / 3.0 * 15)::int as interest_score,
      (case when coalesce(ct.denom,0) = 0 then 0
            else round(ct.num::numeric / ct.denom * 10)::int end) as taste_score,
      round(least(coalesce(m.mutual_count,0), 3) / 3.0 * 10)::int as mutual_score
    from cand c
    left join cshared s on s.cid = c.cid
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
      row_number() over (order by v.total_score desc, v.cid) as by_score,
      -- 다양성: 일자 기반 결정적 셔플. 매일 바뀌되 같은 날 재조회하면 같은 순서라
      -- 스크롤·새로고침에 목록이 튀지 않는다.
      row_number() over (order by md5(v.cid::text || current_date::text)) as by_shuffle
    from visible v where v.total_score > 0
  ),
  picked as (
    -- 상위 70%는 점수순, 나머지 30%는 셔플에서 채운다(신규·저활동 사용자 노출 기회)
    select * from ranked where by_score <= greatest(1, (least(match_limit, 50) * 7) / 10)
    union
    select * from ranked
    where by_score > greatest(1, (least(match_limit, 50) * 7) / 10)
      and by_shuffle <= greatest(1, least(match_limit, 50) - (least(match_limit, 50) * 7) / 10)
  )
  select p.cid, pp.handle, pp.emoji, pp.profile_photo,
         p.shared_count, p.sample_countries, p.mutual_count,
         -- style_score는 구버전 앱 호환 — 관심사+성향으로 채운다
         (p.interest_score + p.taste_score) as style_score,
         p.total_score,
         p.place_score, p.recency_score, p.season_score, p.interest_score, p.taste_score,
         p.shared_cities, p.shared_keywords
  from picked p
  join public.public_profiles pp on pp.id = p.cid
  order by p.total_score desc, pp.handle
  limit greatest(1, least(match_limit, 50));
$$;
grant execute on function public.mate_suggestions(int, text[]) to authenticated;
```

- [ ] **Step 3: Supabase에서 스키마 재실행**

Supabase 대시보드 → SQL Editor에서 `supabase/schema.sql` 전체를 실행한다.
Expected: 오류 없이 완료. `mate_suggestions` 함수가 새 시그니처로 교체된다.

- [ ] **Step 4: 컬럼·점수 합 검증**

SQL Editor에서 실행:

```sql
select author_id, total_score,
       place_score, recency_score, season_score, interest_score, taste_score,
       style_score, shared_count, shared_cities, shared_keywords
from public.mate_suggestions(10, '{}');
```

Expected:
- 16개 컬럼이 모두 반환된다(기존 9 + 신규 7)
- `total_score`가 0보다 크고 100 이하
- `style_score = interest_score + taste_score`
- 각 축 점수가 배점 상한을 넘지 않는다(place ≤ 40, recency ≤ 15, season ≤ 10, interest ≤ 15, taste ≤ 10)

- [ ] **Step 5: 점수 분포 확인 (상단에 뭉치지 않는지)**

```sql
select total_score, count(*) from public.mate_suggestions(50, '{}')
group by total_score order by total_score desc;
```

Expected: 점수가 한두 값에 몰리지 않고 퍼져 있다. 전부 같은 점수라면 축이 동작하지 않는 것이므로 Step 2를 재검토한다.

- [ ] **Step 6: 희소성 폴백 확인**

```sql
-- 전체 사용자 수가 20 미만이면 모든 가중치가 1.0이어야 한다(폴백)
select count(distinct p.author_id) as users from public.posts p where p.visibility <> 'private';
```

Expected: 결과가 20 미만이면 현재 희소성은 꺼진 상태(균등 가중)이며, 이는 의도된 동작이다. 20 이상이면 희소성이 적용된다. 어느 쪽이든 Step 4·5가 통과하면 정상이다.

- [ ] **Step 7: 커밋**

```bash
git add supabase/schema.sql
git commit -m "feat(mate): 추천 점수를 희소성 기반 6개 축으로 재작성

나라를 개수가 아니라 희소성 가중으로 평가하고, 내 나라들의 가중치 합으로
정규화해 '많이 다닌 사람이 항상 상위'를 없앤다. 도시·시의성·시기·관심사·성향을
축으로 더하고, 사실상 전원 만점이던 기록형식·동행자 축은 제거한다.

다양성: 상위 70%는 점수순, 나머지는 일자 기반 결정적 셔플(같은 날 재조회 시
순서 유지). 성능: 후보를 200명으로 좁힌 뒤 비싼 JSONB 추출을 돌린다.

개인정보: 날짜는 점수 계산에만 쓰고 반환하지 않는다. 시기 비교는 계절(월) 단위.
style_score는 관심사+성향으로 채워 구버전 앱 호환을 유지한다."
```

---

### Task 4: 서비스 계층 — 축별 점수 전달

**Files:**
- Modify: `src/services/social.ts` (`MateSuggestionRow` 인터페이스와 `fetchMateSuggestions` 매핑)

**Interfaces:**
- Consumes: Task 3의 RPC 반환 컬럼
- Produces: `MateSuggestionRow`에 `placeScore`, `recencyScore`, `seasonScore`, `interestScore`, `tasteScore`, `sharedCities`, `sharedKeywords` 추가. Task 5가 소비한다.

- [ ] **Step 1: 인터페이스 확장**

`src/services/social.ts`의 `MateSuggestionRow`를 아래로 바꾼다:

```ts
// 부가 기능 — 실패 시 빈 배열(섹션 미표시).
export interface MateSuggestionRow {
  authorId: string;
  handle: string;
  emoji: string | null;
  profilePhoto: string | null;
  sharedCount: number;
  sampleCountries: string[]; // country_name(한글, 예: '일본') — 희소한 나라가 앞에 온다
  mutualCount: number;
  styleScore: number;
  totalScore: number;
  // 축별 점수 — 어느 근거로 추천됐는지 문구를 만드는 데 쓴다(만점 100의 구성 요소)
  placeScore: number;    // 나라(희소성) + 도시
  recencyScore: number;  // 최근 1년 내 겹친 나라
  seasonScore: number;   // 같은 나라·같은 계절
  interestScore: number; // 키워드 겹침
  tasteScore: number;    // 별점·예산·항공편
  sharedCities: string[];   // 겹친 도시(최대 3)
  sharedKeywords: string[]; // 겹친 키워드(최대 3)
}
```

- [ ] **Step 2: 매핑 확장**

같은 파일 `fetchMateSuggestions`의 `.map(...)` 블록을 아래로 바꾼다:

```ts
    return (data as any[]).map((r) => ({
      authorId: r.author_id,
      handle: r.handle,
      emoji: r.emoji ?? null,
      profilePhoto: r.profile_photo ?? null,
      sharedCount: r.shared_count,
      sampleCountries: r.sample_countries ?? [],
      mutualCount: r.mutual_count ?? 0,
      styleScore: r.style_score ?? 0,
      totalScore: r.total_score ?? 0,
      // 구버전 RPC(축별 점수 없음)에서도 앱이 깨지지 않게 전부 기본값을 둔다
      placeScore: r.place_score ?? 0,
      recencyScore: r.recency_score ?? 0,
      seasonScore: r.season_score ?? 0,
      interestScore: r.interest_score ?? 0,
      tasteScore: r.taste_score ?? 0,
      sharedCities: r.shared_cities ?? [],
      sharedKeywords: r.shared_keywords ?? [],
    }));
```

- [ ] **Step 3: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 오류 0

- [ ] **Step 4: 커밋**

```bash
git add src/services/social.ts
git commit -m "feat(mate): 추천 결과에 축별 점수·겹친 도시·키워드 전달

근거 문구를 만들려면 총점만으로는 부족하다. 구버전 RPC에서도 깨지지 않게
새 필드는 전부 기본값(0/빈 배열)을 둔다."
```

---

### Task 5: 화면 연결 — 근거 문구·% 배지

**Files:**
- Modify: `src/screens/FriendSearchScreen.tsx`
- Modify: `src/i18n/locales/ko.ts`
- Modify: `src/i18n/locales/en.ts`

**Interfaces:**
- Consumes: Task 1의 `matchPercent`, Task 2의 `pickReason`, Task 4의 축별 점수

- [ ] **Step 1: i18n 키 추가 (ko)**

`src/i18n/locales/ko.ts`의 `friends` 섹션에서 `styleReason` 키를 찾아 그 **뒤에** 추가한다:

```ts
    reasonCity: '{{city}}를 둘 다 다녀왔어요',
    reasonRecent: '최근 같은 곳을 다녀왔어요',
    reasonInterest: '#{{keyword}} 관심사가 같아요',
    reasonSeason: '비슷한 계절에 여행하는 편이에요',
```

- [ ] **Step 2: i18n 키 추가 (en)**

`src/i18n/locales/en.ts`의 같은 위치에 추가한다:

```ts
    reasonCity: 'You both visited {{city}}',
    reasonRecent: 'You both traveled somewhere similar recently',
    reasonInterest: 'You share an interest in #{{keyword}}',
    reasonSeason: 'You travel in similar seasons',
```

- [ ] **Step 3: 로컬 % 계산을 공용 유틸로 교체**

`src/screens/FriendSearchScreen.tsx`에서 아래 블록(주석 포함)을 **삭제**한다:

```ts
// 여행 DNA 점수 → 매칭률(%).
// mate_suggestions.total_score는 가중치 상한의 합이 정확히 100이다(schema.sql):
//   겹친 나라 min(n,5)*10=50 + 동행 min(n,3)*5=15 + 기록형식 min(n,2)*7=14 + 공통 메이트 min(n,3)*7=21
// 따라서 점수를 그대로 %로 쓴다. 하한 30%는 표시용(한 곳만 겹쳐도 10%로 보이면 무의미).
const MATCH_SCORE_FULL = 100;
const matchPercent = (score?: number): number | null => {
  if (!score || score <= 0) return null;
  return Math.max(30, Math.min(99, Math.round((score / MATCH_SCORE_FULL) * 100)));
};
```

그리고 파일 상단 import 구역(다른 `../utils/...` import 옆)에 추가한다:

```ts
import { matchPercent, pickReason } from '../utils/matchScore';
```

- [ ] **Step 4: 행 타입에 축별 점수 추가**

같은 파일의 `ContactFriend` 인터페이스에서 `matchScore?: number;` 줄 **뒤에** 추가한다:

```ts
  placeScore?: number;      // 축별 점수 — 추천 근거 문구 선택에 쓴다
  recencyScore?: number;
  seasonScore?: number;
  interestScore?: number;
  tasteScore?: number;
  sharedCities?: string[];
  sharedKeywords?: string[];
```

- [ ] **Step 5: 추천 결과 매핑에 축별 점수 전달**

같은 파일에서 `matchScore: r.totalScore,` 줄 **뒤에** 추가한다:

```ts
          placeScore: r.placeScore,
          recencyScore: r.recencyScore,
          seasonScore: r.seasonScore,
          interestScore: r.interestScore,
          tasteScore: r.tasteScore,
          sharedCities: r.sharedCities,
          sharedKeywords: r.sharedKeywords,
```

- [ ] **Step 6: 근거 문구를 pickReason으로 교체**

같은 파일의 `reasonText` 계산 블록(`// 추천 이유 한 줄` 주석부터 폴백 문자열이 끝나는 줄까지)을 아래로 바꾼다:

```ts
  // 추천 이유 한 줄 — 가장 기여도 높은 축을 pickReason이 고른다(도시 > 나라 > 시의성 …).
  // 근거가 없을 때: 검색 결과는 방문국·메이트 수를, 추천 행은 중립 문구를 쓴다
  // (추천 행은 방문국 수를 조회하지 않아 '방문 기록 없음'이 되면 오표기가 된다).
  const reason = pickReason({
    placeScore: item.placeScore ?? 0,
    recencyScore: item.recencyScore ?? 0,
    seasonScore: item.seasonScore ?? 0,
    interestScore: item.interestScore ?? 0,
    tasteScore: item.tasteScore ?? 0,
    mutualCount: item.mutualCount ?? 0,
    sharedCities: item.sharedCities ?? [],
    sharedKeywords: item.sharedKeywords ?? [],
    sharedCount: item.sharedCount ?? shared.length,
  });
  const reasonText = reason
    ? t(reason.key, reason.params)
    : item.fromSuggestion
      ? t('friends.suggestedReason')
      : `${item.countries > 0 ? t('friends.countriesVisitedN', { count: item.countries }) : t('friends.noVisitRecord')}${item.followers ? ` · ${t('friends.followers')} ${item.followers}` : ''}`;
```

- [ ] **Step 7: 타입·테스트 확인**

Run: `npx tsc --noEmit && npm test`
Expected: 타입 오류 0, 19개 파일 전체 통과

- [ ] **Step 8: lint 확인**

Run: `npx eslint src/screens/FriendSearchScreen.tsx src/utils/matchScore.ts`
Expected: 에러 0

- [ ] **Step 9: 커밋**

```bash
git add src/screens/FriendSearchScreen.tsx src/i18n/locales/ko.ts src/i18n/locales/en.ts
git commit -m "feat(mate): 추천 근거를 축별 점수로 설명, % 배지 규칙 교체

화면에 박혀 있던 matchPercent를 공용 유틸로 옮기고(하한 30% 제거,
15점 미만은 배지 숨김), 근거 문구를 pickReason이 고른 축으로 표시한다.
도시·관심사·계절 문구 키를 ko/en에 추가."
```

---

### Task 6: 실기기 검증

코드 변경은 없다. 앞선 태스크의 결과를 실제 앱에서 확인한다.

**Files:** 없음

- [ ] **Step 1: 앱 실행**

Run: `npx expo start`

기기에서 Reload JS. 네이티브 변경이 없으므로 재빌드는 필요 없다.

- [ ] **Step 2: 추천 목록 확인**

메이트 찾기 화면에 진입한다.

Expected:
- 추천 섹션에 사람이 뜬다
- % 배지가 **30~99에 뭉치지 않고** 퍼져 있다(예전엔 하한 30% 때문에 전부 30 이상)
- 점수가 낮은 행은 배지 없이 근거 문구만 보인다

- [ ] **Step 3: 근거 문구 확인**

Expected:
- 도시가 겹치는 사람은 "○○를 둘 다 다녀왔어요"
- 나라만 겹치면 "N개국을 함께 다녀왔어요"
- **어떤 문구에도 날짜·기간이 없다** ("3일 전"·"지난주"가 나오면 개인정보 원칙 위반 — Task 2로 돌아갈 것)

- [ ] **Step 4: 다양성 확인**

같은 날 화면을 나갔다 다시 들어온다.

Expected: 목록 순서가 그대로다(일자 기반 결정적 셔플). 날짜가 바뀌면 하위 30%가 바뀐다.

- [ ] **Step 5: 결과 보고**

문제가 있으면 해당 태스크로 돌아가 고친다. 모두 정상이면 완료를 보고한다.

---

## 완료 후

- `superpowers:finishing-a-development-branch` 스킬로 통합 방식을 결정한다
- **서버 반영 필수**: Supabase에서 `schema.sql` 재실행이 끝나야 앱에 새 점수가 나온다(Task 3 Step 3)

## 범위 밖

- 추천 결과 피드백 수집(좋아요/관심없음)
- 머티리얼라이즈드 뷰·캐시 레이어
- 사용자가 점수 기준을 조정하는 UI
