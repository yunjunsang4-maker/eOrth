# 추천 메이트(여행 DNA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 발견 허브의 겹침/친구의친구 두 섹션을 여행 DNA 점수 기반 "추천 메이트" 단일 섹션으로 교체하고, 로컬 여행기록카드 나라를 DNA에 반영한다.

**Architecture:** `travel_overlap_suggestions` drop → `mate_suggestions(match_limit, extra_countries)` RPC(나라50+스타일29+공통메이트21). 프론트는 단일 effect(`fetchMateSuggestions` + 로컬 나라 수집), 단일 섹션, 이유 3종 우선순위 렌더.

**Tech Stack:** Supabase RPC, RN/TS, react-i18next. 스펙: `docs/superpowers/specs/2026-07-22-mate-dna-suggestions-design.md`

**검증 관례:** tsc·ko/en 파리티·RPC SQL 수동검증·파일 단위 스테이징·트레일러 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. 각 태스크 커밋은 독립적으로 tsc green.

---

### Task 1: schema.sql — mate_suggestions RPC (구 RPC drop)

**Files:** Modify `supabase/schema.sql` — 기존 `travel_overlap_suggestions` 블록(주석~grant, ~503행)을 아래로 **교체**

- [ ] Step 1: 교체
```sql
-- ─────────────────────────────────────────────
-- 추천 메이트(여행 DNA): 나라 겹침·여행 스타일(동행/기록형식)·함께 아는 메이트를
--   합산한 total_score로 랭킹. extra_countries는 호출자 로컬(미발행·나만보기·
--   여행기록카드) 나라를 "내 매칭 입력"에만 보강 — 타인에게 비노출.
--   후보 프라이버시는 기존과 동일(visibility<>'private'만 집계).
--   점수: 나라 least(n,5)*10 + 동행 least(n,3)*5 + 형식 least(n,2)*7 + 메이트 least(n,3)*7
-- ─────────────────────────────────────────────
drop function if exists public.travel_overlap_suggestions(int);
create or replace function public.mate_suggestions(match_limit int default 10, extra_countries text[] default '{}')
returns table (
  author_id uuid, handle text, emoji text, profile_photo text,
  shared_count int, sample_countries text[], mutual_count int, style_score int, total_score int
)
language sql security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  my_countries as (
    select p.country_name from public.posts p, me
    where p.author_id = me.uid and p.visibility <> 'private'
      and p.country_name is not null and p.country_name <> ''
    union
    select c from unnest(extra_countries) as c where c is not null and c <> ''
  ),
  my_comps as (
    select distinct comp
    from public.posts p, me, jsonb_array_elements_text(
      case when jsonb_typeof(p.data->'companions') = 'array' then p.data->'companions' else '[]'::jsonb end
    ) as comp
    where p.author_id = me.uid and p.visibility <> 'private'
  ),
  my_vts as (
    select distinct p.view_type from public.posts p, me
    where p.author_id = me.uid and p.visibility <> 'private' and p.view_type is not null
  ),
  my_mates as (
    select case when n.requester_id = me.uid then n.addressee_id else n.requester_id end as mate_id
    from public.neighbors n, me
    where n.status = 'accepted' and (n.requester_id = me.uid or n.addressee_id = me.uid)
  ),
  cand as (
    select p.author_id as cid from public.posts p, me
    where p.author_id <> me.uid and p.visibility <> 'private'
    group by p.author_id
  ),
  cshared as (
    select p.author_id as cid,
           count(distinct p.country_name)::int as shared_count,
           (array_agg(distinct p.country_name))[1:3] as sample_countries
    from public.posts p
    where p.visibility <> 'private'
      and p.country_name in (select country_name from my_countries)
      and p.author_id in (select cid from cand)
    group by p.author_id
  ),
  ccomp as (
    select p.author_id as cid, count(distinct comp)::int as shared_comps
    from public.posts p, jsonb_array_elements_text(
      case when jsonb_typeof(p.data->'companions') = 'array' then p.data->'companions' else '[]'::jsonb end
    ) as comp
    where p.visibility <> 'private' and p.author_id in (select cid from cand)
      and comp in (select comp from my_comps)
    group by p.author_id
  ),
  cvt as (
    select p.author_id as cid, count(distinct p.view_type)::int as shared_vts
    from public.posts p
    where p.visibility <> 'private' and p.author_id in (select cid from cand)
      and p.view_type in (select view_type from my_vts)
    group by p.author_id
  ),
  cmut as (
    select c.cid, count(*)::int as mutual_count
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
      coalesce(m.mutual_count, 0) as mutual_count,
      (least(coalesce(cc.shared_comps,0),3)*5 + least(coalesce(cv.shared_vts,0),2)*7) as style_score,
      (least(coalesce(s.shared_count,0),5)*10
       + least(coalesce(cc.shared_comps,0),3)*5 + least(coalesce(cv.shared_vts,0),2)*7
       + least(coalesce(m.mutual_count,0),3)*7) as total_score
    from cand c
    left join cshared s on s.cid = c.cid
    left join ccomp cc on cc.cid = c.cid
    left join cvt cv on cv.cid = c.cid
    left join cmut m on m.cid = c.cid
  )
  select sc.cid, pp.handle, pp.emoji, pp.profile_photo,
         sc.shared_count, sc.sample_countries, sc.mutual_count, sc.style_score, sc.total_score
  from scored sc
  join public.public_profiles pp on pp.id = sc.cid
  cross join me
  where sc.total_score > 0
    and not public.is_blocked_between(me.uid, sc.cid)
    and not public.are_neighbors(me.uid, sc.cid)
    and not exists (
      select 1 from public.neighbors n
      where ((n.requester_id = me.uid and n.addressee_id = sc.cid)
          or (n.requester_id = sc.cid and n.addressee_id = me.uid))
        and n.status = 'pending'
    )
  order by sc.total_score desc, pp.handle
  limit greatest(1, least(match_limit, 50));
$$;
grant execute on function public.mate_suggestions(int, text[]) to authenticated;
```
- [ ] Step 2: 배치 확인 — 함수가 `is_blocked_between`·`are_neighbors`·`neighbors`·`posts`·`public_profiles`(초기 정의) **뒤**인지(기존 위치 유지 시 자동 충족)
- [ ] Step 3: $$ 짝수·구문 육안 검증, `npx tsc --noEmit`
- [ ] Step 4: 커밋 `feat(db): mate_suggestions RPC(여행 DNA) — travel_overlap_suggestions 대체` + 수동 재실행 안내

### Task 2: i18n 2키

**Files:** ko.ts/en.ts `friends` 네임스페이스, `overlapReason` 다음 줄
- [ ] ko: `mutualReason: '함께 아는 메이트 {{count}}명',` / `styleReason: '여행 스타일이 비슷해요',`
- [ ] en: `mutualReason: '{{count}} mutual mates',` / `styleReason: 'Similar travel style',`
- [ ] 파리티 검증(node) + tsc + 커밋 `feat(i18n): 추천 메이트 DNA 이유 키(mutualReason·styleReason)`

### Task 3: services/social.ts — fetchMateSuggestions 추가

**Files:** Modify `src/services/social.ts` (기존 fetchTravelOverlap 아래 추가 — 구 함수 제거는 Task 4에서)
- [ ] 추가:
```ts
export interface MateSuggestionRow {
  authorId: string; handle: string; emoji: string | null; profilePhoto: string | null;
  sharedCount: number; sampleCountries: string[]; mutualCount: number; styleScore: number; totalScore: number;
}
export async function fetchMateSuggestions(limit = 10, extraCountries: string[] = []): Promise<MateSuggestionRow[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.rpc('mate_suggestions', { match_limit: limit, extra_countries: extraCountries });
    if (error || !data) return [];
    return (data as any[]).map((r) => ({
      authorId: r.author_id, handle: r.handle, emoji: r.emoji ?? null, profilePhoto: r.profile_photo ?? null,
      sharedCount: r.shared_count, sampleCountries: r.sample_countries ?? [],
      mutualCount: r.mutual_count ?? 0, styleScore: r.style_score ?? 0, totalScore: r.total_score ?? 0,
    }));
  } catch { return []; }
}
```
- [ ] tsc + 커밋 `feat(social): fetchMateSuggestions(여행 DNA RPC 래퍼)`

### Task 4: FriendSearchScreen 통합 + 구 코드 제거

**Files:** Modify `src/screens/FriendSearchScreen.tsx`, `src/services/social.ts`(구 함수 제거)
- [ ] `ContactFriend`에 `mutualCount?: number; styleScore?: number;` 추가
- [ ] import: `fetchFriendSuggestions, fetchTravelOverlap` → `fetchMateSuggestions`. `useRecords()` 구조분해에 `records, tripGroups` 추가
- [ ] 기존 suggestions effect + overlap effect(2개)를 **단일 effect**로 교체:
```ts
  // 추천 메이트(여행 DNA) — 진입 시 1회 로드. 로컬 여행기록카드·미발행·나만보기 나라도
  // extra_countries로 보강(내 매칭 입력 전용 — 타인에게 비노출)
  const [suggestions, setSuggestions] = useState<ContactFriend[]>([]);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    (async () => {
      try {
        const localCountries = Array.from(new Set([
          ...records.filter((r) => r.isMyPost && r.countryName).map((r) => r.countryName as string),
          ...tripGroups.map((g) => g.countryName).filter((c): c is string => !!c),
        ]));
        const rows = await fetchMateSuggestions(10, localCountries);
        if (!alive || rows.length === 0) return;
        setSuggestions(rows.map((r) => ({
          id: r.authorId,
          name: r.handle || t('friends.travelerDefault'),
          initial: (r.handle || '?').slice(0, 1),
          username: r.handle || '',
          countries: 0,
          photo: r.profilePhoto,
          emoji: r.emoji,
          sharedCount: r.sharedCount,
          sharedCountries: r.sampleCountries,
          mutualCount: r.mutualCount,
          styleScore: r.styleScore,
        })));
      } catch { /* 부가 기능 — 실패 시 섹션 미표시 */ }
    })();
    return () => { alive = false; };
  }, []);
```
- [ ] 파생값: `visibleOverlap`/`overlapIds` 삭제, `const visibleSuggestions = suggestions.filter(notBlocked);` 복원
- [ ] 렌더: 비검색 분기에서 겹침 섹션 블록 삭제, 추천 섹션(`friends.suggestedFriends`) 유지, InviteCard 조건 `visibleSuggestions.length < 3 && myCode`, 콜드스타트 `visibleSuggestions.length === 0`
- [ ] FriendItem 이유 우선순위:
```tsx
            {item.sharedCountries && item.sharedCountries.length > 0
              ? `${t('friends.overlapReason', { count: item.sharedCount ?? item.sharedCountries.length })} · ${item.sharedCountries.map((c) => countryLabel(c, i18n.language)).join(' · ')}`
              : item.mutualCount && item.mutualCount > 0
                ? t('friends.mutualReason', { count: item.mutualCount })
                : item.styleScore && item.styleScore > 0
                  ? t('friends.styleReason')
                  : (
                      <>
                        {item.countries > 0 ? t('friends.countriesVisitedN', { count: item.countries }) : t('friends.noVisitRecord')}
                        {item.followers ? ` · ${t('friends.followers')} ${item.followers}` : ''}
                      </>
                    )}
```
- [ ] social.ts에서 `fetchTravelOverlap`/`TravelOverlapRow` 제거. `fetchFriendSuggestions`는 다른 호출자 grep — 없으면 함께 제거, 있으면 유지
- [ ] tsc + 잔여 grep(`fetchTravelOverlap|visibleOverlap|overlapIds` 없음) + 커밋 `feat(friends): 추천 메이트 단일 섹션(여행 DNA) — 겹침·친구의친구 통합`

### Task 5: 최종 검증
- [ ] 전체 tsc, ko/en 파리티, `git log` 확인
- [ ] 사용자 안내: **schema.sql 재실행 필요**(drop+create 멱등), 수동 QA 체크리스트
