# 발견 허브 2단계(맥락 진입점) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 타인 프로필 겹침 줄 · 나라별 화면 방문자 칩 · 소셜 피드 추천 메이트 카드 3개 진입점 추가.
**Architecture:** RPC 2개(overlap_with·country_visitors) + services 2함수 + 화면 3곳. 실패/빈 결과는 조용히 숨김.
**Tech Stack:** Supabase RPC, RN/TS. 스펙: `docs/superpowers/specs/2026-07-22-mate-discovery-phase2-design.md`
**검증 관례:** tsc·ko/en 파리티·파일 단위 스테이징·트레일러 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`·태스크별 커밋 green.

---

### Task 1: schema.sql — RPC 2개

**Files:** Modify `supabase/schema.sql` — `grant execute on function public.mate_suggestions(int, text[]) to authenticated;` 바로 다음에 추가:

```sql
-- ─────────────────────────────────────────────
-- 특정 유저와의 여행 겹침(타인 프로필 "나와 겹치는 나라 N곳" 줄).
--   extra_countries는 호출자 로컬 나라 보강(내 매칭 입력 전용).
-- ─────────────────────────────────────────────
create or replace function public.overlap_with(target uuid, extra_countries text[] default '{}')
returns table (shared_count int, sample_countries text[])
language sql security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  my_countries as (
    select p.country_name from public.posts p, me
    where p.author_id = me.uid and p.visibility <> 'private'
      and p.country_name is not null and p.country_name <> ''
    union
    select c from unnest(extra_countries) as c where c is not null and c <> ''
  ),
  shared as (
    select distinct p.country_name
    from public.posts p
    where p.author_id = target and p.visibility <> 'private'
      and p.country_name in (select country_name from my_countries)
  )
  select count(*)::int as shared_count,
         coalesce((array_agg(s.country_name))[1:3], '{}'::text[]) as sample_countries
  from shared s;
$$;
grant execute on function public.overlap_with(uuid, text[]) to authenticated;

-- ─────────────────────────────────────────────
-- 나라별 화면 "이 나라 다녀온 사람" — 비공개 아닌 게시물 보유 유저(본인·차단 제외,
--   메이트 포함: 발견이 아닌 사실 나열 목적). 게시물 수 내림차순.
--   파라미터명 target_country: public_profiles.country 컬럼과의 모호성 회피.
-- ─────────────────────────────────────────────
create or replace function public.country_visitors(target_country text, match_limit int default 12)
returns table (author_id uuid, handle text, emoji text, profile_photo text, visit_posts int)
language sql security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  v as (
    select p.author_id, count(*)::int as visit_posts
    from public.posts p, me
    where p.visibility <> 'private'
      and p.country_name = target_country
      and p.author_id <> me.uid
    group by p.author_id
  )
  select v.author_id, pp.handle, pp.emoji, pp.profile_photo, v.visit_posts
  from v
  join public.public_profiles pp on pp.id = v.author_id
  cross join me
  where not public.is_blocked_between(me.uid, v.author_id)
  order by v.visit_posts desc, pp.handle
  limit greatest(1, least(match_limit, 50));
$$;
grant execute on function public.country_visitors(text, int) to authenticated;
```

- [ ] 삽입 + `$$` 짝수 확인 + tsc + 커밋 `feat(db): overlap_with·country_visitors RPC(맥락 진입점)` (수동 재실행 필요 명시)

### Task 2: i18n 1키 + services 2함수

- [ ] ko.ts `misc` 네임스페이스(countryVisitCount 근처): `countryVisitorsTitle: '이 나라 다녀온 사람',` / en.ts: `countryVisitorsTitle: "Travelers who've been here",`
- [ ] social.ts에 fetchMateSuggestions 아래 추가:
```ts
// 특정 유저와의 여행 겹침(타인 프로필 줄). 실패 시 null(줄 미표시).
export async function fetchOverlapWith(targetId: string, extraCountries: string[] = []): Promise<{ sharedCount: number; sampleCountries: string[] } | null> {
  if (!supabase || !targetId) return null;
  try {
    const { data, error } = await supabase.rpc('overlap_with', { target: targetId, extra_countries: extraCountries });
    if (error || !data) return null;
    const row = (data as any[])[0];
    if (!row) return null;
    return { sharedCount: row.shared_count ?? 0, sampleCountries: row.sample_countries ?? [] };
  } catch { return null; }
}

// 나라별 화면 "이 나라 다녀온 사람". 실패 시 빈 배열(섹션 미표시).
export interface CountryVisitor {
  authorId: string; handle: string; emoji: string | null; profilePhoto: string | null; visitPosts: number;
}
export async function fetchCountryVisitors(countryName: string, limit = 12): Promise<CountryVisitor[]> {
  if (!supabase || !countryName) return [];
  try {
    const { data, error } = await supabase.rpc('country_visitors', { target_country: countryName, match_limit: limit });
    if (error || !data) return [];
    return (data as any[]).map((r) => ({
      authorId: r.author_id, handle: r.handle, emoji: r.emoji ?? null,
      profilePhoto: r.profile_photo ?? null, visitPosts: r.visit_posts ?? 0,
    }));
  } catch { return []; }
}
```
- [ ] 파리티 + tsc + 커밋 `feat: 맥락 진입점 서비스(fetchOverlapWith·fetchCountryVisitors)+i18n`

### Task 3: FriendProfileScreen 겹침 줄

- [ ] `!isSelf && realId`일 때 진입 effect: 로컬나라(records `isMyPost !== false` ∪ tripGroups countryName, FriendSearchScreen과 동일 수집) → `fetchOverlapWith(realId, localCountries)` → state
- [ ] bio 줄(`{!!display.bio && …}`)과 statsRow 사이에, `sharedCount > 0`일 때만:
```tsx
{!isSelf && !!overlap && overlap.sharedCount > 0 && (
  <Text style={s.overlapLine} numberOfLines={1}>
    🌍 {t('friends.overlapReason', { count: overlap.sharedCount })} · {overlap.sampleCountries.map((c) => countryLabel(c, i18n.language)).join(' · ')}
  </Text>
)}
```
- [ ] 스타일 `overlapLine`(fontSize 12, skinAccent 또는 accent 계열, marginTop 2~4) — 파일 관례 따름. countryLabel/useRecords import 확인
- [ ] tsc + 커밋 `feat(profile): 타인 프로필 나와 겹치는 나라 줄`

### Task 4: CountryScreen 방문자 칩

- [ ] 진입 effect: `fetchCountryVisitors(country.name, 12)` → state. 빈 배열이면 섹션 미렌더
- [ ] 스탯 카드 행(statsRow) 아래 섹션: 제목 `t('misc.countryVisitorsTitle')` + 가로 ScrollView 칩(아바타: profilePhoto Image 또는 PersonIcon, 아래 handle 한 줄) — 탭 → `navigation.navigate('FriendProfile', { userId: v.authorId, username: v.handle || '' })`
- [ ] 네비 타입 확인(Country가 RootStack이면 그대로 동작), 스타일은 화면 기존 카드 톤(#2E2E3B 계열) 따름
- [ ] tsc + 커밋 `feat(country): 이 나라 다녀온 사람 칩`

### Task 5: SocialScreen 추천 메이트 카드

- [ ] state+effect: `fetchMateSuggestions(3, localCountries)`(records·tripGroups는 useRecords에서) 1회, 실패 무시
- [ ] `timelineWithAds` useMemo **다음에** 새 memo: 추천 ≥1 && 항목 ≥2면 2번째 항목 뒤 `{ _mateSlot: true, id: 'mate-slot' }` 1개 삽입(프리미엄 여부 무관 — 광고 아님). 기존 timelineWithAds 로직은 수정 금지
- [ ] 렌더러의 `if (item._adSlot)` 분기 **앞**에 `if (item._mateSlot)` 분기: 카드 — 제목 `t('friends.suggestedFriends')`, 최대 3행(아바타+handle, 탭→FriendProfile), 하단 CTA `t('social.adInviteCta')` → `navigation.navigate('FriendSearch')`
- [ ] 헤더 계산 등 `_adSlot`을 특별 취급하는 코드가 있으면(`h[c] += item._adSlot …` 부근) `_mateSlot`도 동일 취급 필요한지 확인·반영
- [ ] tsc + 커밋 `feat(social): 피드 추천 메이트 카드(_mateSlot)`

### Task 6: 최종 검증
- [ ] tsc·파리티·최종 리뷰·수동 QA 안내(3 진입점, schema 재실행)
