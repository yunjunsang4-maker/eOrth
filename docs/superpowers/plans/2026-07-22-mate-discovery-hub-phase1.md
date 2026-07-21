# 메이트찾기 발견 허브 1단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 메이트찾기(FriendSearchScreen)에 "여행이 겹치는 사람" 발견 섹션과 콜드스타트 초대 카드를 추가해, 여행 데이터 기반 발견 허브로 개편한다.

**Architecture:** 서버에 여행겹침 계산 RPC(`travel_overlap_suggestions`)를 추가하고(기존 `profile_country_counts`의 SECURITY DEFINER·`visibility<>'private'` 프라이버시 모델 미러), 프론트는 진입 시 여행겹침을 별도 effect로 병렬 로드해 리스트를 `여행이 겹치는 사람`→`친구의 친구`→(콜드스타트)`초대 카드` 순으로 렌더한다.

**Tech Stack:** Supabase(Postgres RPC), React Native(Expo)/TypeScript, react-i18next, 기존 `FriendSearchScreen`·`services/social.ts`.

---

## 검증 관례 (이 저장소)

- RN 화면·Supabase RPC용 자동 테스트 러너 없음 → 각 태스크 검증은 아래 조합:
  - `npx tsc --noEmit` (타입·문법)
  - ko/en 키셋 개수 동일 검사(노드 스니펫, i18n 태스크)
  - RPC는 SQL 시드 수동검증(문서화). **schema.sql은 사용자가 수동 재실행**해야 반영됨([[eorth-backend-rollout]])
- 커밋 트레일러: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 파일 단위 스테이징(작업트리 WIP 주의 — [[eorth-uncommitted-wip-entanglement]])

## File Structure

- **Modify** `supabase/schema.sql` — `travel_overlap_suggestions` 함수 + `idx_posts_author_country` 인덱스 추가
- **Modify** `src/services/social.ts` — `TravelOverlapRow` 타입 + `fetchTravelOverlap()` 추가
- **Modify** `src/i18n/locales/ko.ts`, `src/i18n/locales/en.ts` — `friends` 네임스페이스에 6개 키
- **Modify** `src/screens/FriendSearchScreen.tsx` — `ContactFriend` 확장, `FriendItem` 겹침 이유 렌더, 겹침 로드 effect, 리스트 섹션 재구성, `InviteCard` 컴포넌트·스타일

---

### Task 1: 서버 RPC + 인덱스 (schema.sql)

**Files:**
- Modify: `supabase/schema.sql` (인덱스: `idx_posts_visibility` 다음 줄 ~190 / 함수: `profile_country_counts` grant 다음 ~349)

- [ ] **Step 1: 인덱스 추가**

`supabase/schema.sql`에서 아래 줄(190행 근처)
```sql
create index if not exists idx_posts_visibility on public.posts (visibility);
```
바로 다음에 추가:
```sql
create index if not exists idx_posts_author_country on public.posts (author_id, country_name);
```

- [ ] **Step 2: RPC 함수 추가**

`profile_country_counts(uuid[])`의 `grant execute ...` 줄(349행 근처) **다음**에 추가:
```sql
-- ─────────────────────────────────────────────
-- 여행 겹침 추천: 나와 방문국(비공개 아닌 게시물)이 겹치는 다른 사용자를
--   겹친 나라 수로 랭킹. 본인·차단(양방향)·기존메이트·신청중은 제외.
--   프라이버시 모델은 profile_country_counts와 동일(visibility<>'private').
-- ─────────────────────────────────────────────
create or replace function public.travel_overlap_suggestions(match_limit int default 10)
returns table (
  author_id uuid, handle text, emoji text, profile_photo text,
  shared_count int, sample_countries text[]
)
language sql security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  my_countries as (
    select distinct p.country_name
    from public.posts p, me
    where p.author_id = me.uid
      and p.visibility <> 'private'
      and p.country_name is not null and p.country_name <> ''
  ),
  shared as (
    select p.author_id,
           count(distinct p.country_name)::int as shared_count,
           (array_agg(distinct p.country_name))[1:3] as sample_countries
    from public.posts p, me
    where p.author_id <> me.uid
      and p.visibility <> 'private'
      and p.country_name in (select country_name from my_countries)
    group by p.author_id
  )
  select s.author_id, pp.handle, pp.emoji, pp.profile_photo,
         s.shared_count, s.sample_countries
  from shared s
  join public.public_profiles pp on pp.id = s.author_id
  cross join me
  where not public.is_blocked_between(me.uid, s.author_id)
    and not public.are_neighbors(me.uid, s.author_id)
    and not exists (
      select 1 from public.neighbors n
      where ((n.requester_id = me.uid and n.addressee_id = s.author_id)
          or (n.requester_id = s.author_id and n.addressee_id = me.uid))
        and n.status = 'pending'
    )
  order by s.shared_count desc, pp.handle
  limit greatest(1, least(match_limit, 50));
$$;
grant execute on function public.travel_overlap_suggestions(int) to authenticated;
```

- [ ] **Step 3: `public_profiles`가 `id, handle, emoji, profile_photo`를 노출하는지 확인**

Run: `grep -nE "create or replace view public.public_profiles" -A 30 supabase/schema.sql`
Expected: 뷰 select에 `id`(또는 별칭), `handle`, `emoji`, `profile_photo` 컬럼 존재. 없으면(예: `profile_photo` 미노출) 이 태스크에서 뷰 정의에 컬럼 추가(기존 컬럼 정책 유지). `services/social.ts`가 이미 `public_profiles(handle, emoji, profile_photo)`를 쓰므로 대개 존재함.

- [ ] **Step 4: SQL 구문·정합성 확인(수동)**

Supabase SQL 에디터에서 함수 본문을 붙여 `create or replace` 실행 → 에러 없이 생성되면 통과. (로컬 psql 없으므로 문법 검증은 여기서.)

- [ ] **Step 5: RPC 동작 SQL 시드 검증(수동, 문서화)**

아래를 Supabase SQL 에디터에서 실행해 규칙 확인(테스트용 임시 데이터는 이후 롤백):
```sql
-- 임의의 두 테스트 유저 A(나), B가 '일본','프랑스'를 공유한다고 가정할 때
-- A로 로그인된 세션에서:
select * from public.travel_overlap_suggestions(10);
-- 기대: B가 shared_count=2, sample_countries에 '일본','프랑스' 포함.
-- 검증 항목: (1) 겹침0 유저 미반환 (2) are_neighbors(A,B)면 미반환
--            (3) is_blocked_between(A,B)면 미반환 (4) private 게시물만 겹치면 미반환 (5) 본인 미반환
```

- [ ] **Step 6: 사용자 재실행 안내 + 커밋**

계획 실행자는 schema.sql이 **수동 재실행 필요**임을 결과에 명시할 것.
```bash
git add supabase/schema.sql
git commit -m "feat(db): travel_overlap_suggestions RPC + posts(author_id,country_name) 인덱스

나와 방문국이 겹치는 유저를 겹침 수로 랭킹(비공개 게시물 제외, 차단·기존메이트·본인 제외).
profile_country_counts와 동일 프라이버시 모델. schema.sql 수동 재실행 필요.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: i18n 키 추가 (ko/en)

**Files:**
- Modify: `src/i18n/locales/ko.ts` (`friends` 네임스페이스, `suggestedFriends` 근처 ~1236)
- Modify: `src/i18n/locales/en.ts` (동일 위치)

- [ ] **Step 1: ko.ts 키 추가**

`src/i18n/locales/ko.ts`에서
```ts
    suggestedFriends: '추천 메이트',
```
바로 다음에 추가:
```ts
    overlapSection: '여행이 겹치는 사람',
    overlapReason: '함께 다녀온 나라 {{count}}곳',
    inviteCardTitle: '아직 겹치는 사람이 적어요',
    inviteCardBody: '지인을 eOrth로 초대해 함께 여행을 기록해요',
    inviteCta: '초대하기',
    coldStartNudge: '여행 기록을 남기면 겹치는 사람을 찾아드려요',
```

- [ ] **Step 2: en.ts 키 추가**

`src/i18n/locales/en.ts`에서 `suggestedFriends: 'Suggested mates',` 바로 다음에 추가:
```ts
    overlapSection: 'People who share your travels',
    overlapReason: '{{count}} countries in common',
    inviteCardTitle: 'Not many overlaps yet',
    inviteCardBody: 'Invite friends to eOrth and log trips together',
    inviteCta: 'Invite',
    coldStartNudge: "Log your trips and we'll find people who share them",
```

- [ ] **Step 3: ko/en 키셋 개수 동일 검증**

Run:
```bash
node -e 'const fs=require("fs");const k=f=>(fs.readFileSync(f,"utf8").match(/^\s*[A-Za-z0-9_]+:/gm)||[]).length;console.log("ko",k("src/i18n/locales/ko.ts"),"en",k("src/i18n/locales/en.ts"))'
```
Expected: ko와 en 숫자가 **동일**(각각 6개씩 늘어 이전과 같은 차이 유지). 다르면 오타/누락 수정.

- [ ] **Step 4: tsc**

Run: `npx tsc --noEmit`
Expected: 에러 없음(exit 0).

- [ ] **Step 5: 커밋**

```bash
git add src/i18n/locales/ko.ts src/i18n/locales/en.ts
git commit -m "feat(i18n): 메이트찾기 발견 허브 키(여행겹침·초대 카드)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 프론트 서비스 `fetchTravelOverlap` (services/social.ts)

**Files:**
- Modify: `src/services/social.ts`

- [ ] **Step 1: 타입·함수 추가**

`src/services/social.ts` 파일 하단(또는 `fetchFriendSuggestions` 근처)에 추가:
```ts
export interface TravelOverlapRow {
  authorId: string;
  handle: string;
  emoji: string | null;
  profilePhoto: string | null;
  sharedCount: number;
  sampleCountries: string[]; // country_name(한글, 예: '일본')
}

// 나와 방문국이 겹치는 사용자 — RPC가 서버에서 auth.uid()로 본인 판정하므로 클라 uid 불필요.
// 부가 기능 — 실패 시 빈 배열(섹션 미표시).
export async function fetchTravelOverlap(limit = 10): Promise<TravelOverlapRow[]> {
  const { data, error } = await supabase.rpc('travel_overlap_suggestions', { match_limit: limit });
  if (error || !data) return [];
  return (data as any[]).map((r) => ({
    authorId: r.author_id,
    handle: r.handle,
    emoji: r.emoji,
    profilePhoto: r.profile_photo,
    sharedCount: r.shared_count,
    sampleCountries: r.sample_countries ?? [],
  }));
}
```

- [ ] **Step 2: `supabase` import 확인**

Run: `grep -nE "import .*supabase" src/services/social.ts`
Expected: `supabase`가 이미 import됨(파일 내 다른 rpc 호출 존재). 없으면 `import { supabase } from './supabase';` 추가.

- [ ] **Step 3: tsc**

Run: `npx tsc --noEmit`
Expected: 에러 없음(exit 0).

- [ ] **Step 4: 커밋**

```bash
git add src/services/social.ts
git commit -m "feat(social): fetchTravelOverlap 서비스(여행겹침 RPC 래퍼)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `ContactFriend` 확장 + `FriendItem` 겹침 이유 렌더 (FriendSearchScreen.tsx)

**Files:**
- Modify: `src/screens/FriendSearchScreen.tsx` (타입 ~60, `FriendItem` ~74-128)

- [ ] **Step 1: `ContactFriend`에 겹침 필드 추가**

`interface ContactFriend {` 블록 마지막 필드 다음에 추가:
```ts
  sharedCount?: number;       // 여행겹침 행일 때만
  sharedCountries?: string[]; // 겹친 나라 샘플(한글 country_name)
```

- [ ] **Step 2: `countryLabel` import 추가**

파일 상단 import 블록에 추가(이미 있으면 생략):
```ts
import { countryLabel } from '../utils/countryLabel';
```
Run(확인): `grep -nE "countryLabel" src/screens/FriendSearchScreen.tsx`

- [ ] **Step 3: `FriendItem`에서 `i18n` 구조분해**

`FriendItem` 내부의
```ts
  const { t } = useTranslation();
```
를 다음으로 교체:
```ts
  const { t, i18n } = useTranslation();
```

- [ ] **Step 4: 겹침 이유 줄 렌더**

`FriendItem`의 아래 블록(현재 ~103-109)
```tsx
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <GlobeIcon size={12} color="#A1A1B0" />
          <Text style={s.friendCountries} {...andFitText}>
            {item.countries > 0 ? t('friends.countriesVisitedN', { count: item.countries }) : t('friends.noVisitRecord')}
            {item.followers ? ` · ${t('friends.followers')} ${item.followers}` : ''}
          </Text>
        </View>
```
를 다음으로 교체:
```tsx
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <GlobeIcon size={12} color="#A1A1B0" />
          <Text style={s.friendCountries} {...andFitText}>
            {item.sharedCountries && item.sharedCountries.length > 0
              ? `${t('friends.overlapReason', { count: item.sharedCount ?? item.sharedCountries.length })} · ${item.sharedCountries.map((c) => countryLabel(c, i18n.language)).join(' · ')}`
              : (
                  <>
                    {item.countries > 0 ? t('friends.countriesVisitedN', { count: item.countries }) : t('friends.noVisitRecord')}
                    {item.followers ? ` · ${t('friends.followers')} ${item.followers}` : ''}
                  </>
                )}
          </Text>
        </View>
```

- [ ] **Step 5: tsc**

Run: `npx tsc --noEmit`
Expected: 에러 없음(exit 0).

- [ ] **Step 6: 커밋**

```bash
git add src/screens/FriendSearchScreen.tsx
git commit -m "feat(friends): ContactFriend 겹침 필드 + FriendItem 이유 문구 렌더

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 여행겹침 로드 effect (FriendSearchScreen.tsx)

**Files:**
- Modify: `src/screens/FriendSearchScreen.tsx` (suggestions effect 근처 ~293-322)

- [ ] **Step 1: `fetchTravelOverlap` import 추가**

`import { fetchFriendSuggestions } from '../services/social';` 줄을 다음으로 교체:
```ts
import { fetchFriendSuggestions, fetchTravelOverlap } from '../services/social';
```

- [ ] **Step 2: overlap state + 로드 effect 추가**

suggestions state/effect(`const [suggestions, setSuggestions] = useState<ContactFriend[]>([]);` ~294) **다음**에 추가:
```ts
  // 여행이 겹치는 사람 — 진입 시 1회 로드(부가 기능, 실패 시 섹션 미표시)
  const [overlap, setOverlap] = useState<ContactFriend[]>([]);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    (async () => {
      try {
        const rows = await fetchTravelOverlap(10);
        if (!alive || rows.length === 0) return;
        setOverlap(
          rows.map((r) => ({
            id: r.authorId,
            name: r.handle || t('friends.travelerDefault'),
            initial: (r.handle || '?').slice(0, 1),
            username: r.handle || '',
            countries: 0,
            photo: r.profilePhoto,
            emoji: r.emoji,
            sharedCount: r.sharedCount,
            sharedCountries: r.sampleCountries,
          }))
        );
      } catch {
        /* 부가 기능 — 실패 시 섹션 미표시 */
      }
    })();
    return () => { alive = false; };
  }, []);
```

- [ ] **Step 3: tsc**

Run: `npx tsc --noEmit`
Expected: 에러 없음(exit 0).

- [ ] **Step 4: 커밋**

```bash
git add src/screens/FriendSearchScreen.tsx
git commit -m "feat(friends): 여행겹침 목록 로드 effect

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 리스트 섹션 재구성 + 중복제거 + InviteCard (FriendSearchScreen.tsx)

**Files:**
- Modify: `src/screens/FriendSearchScreen.tsx` (파생값 ~365-370, 리스트 렌더 ~496-519, `InviteCard`·스타일)

- [ ] **Step 1: 중복제거 파생값 추가**

`const visibleSuggestions = suggestions.filter(notBlocked);` 줄을 다음으로 교체:
```ts
  const visibleOverlap = overlap.filter(notBlocked);
  const overlapIds = new Set(visibleOverlap.map((o) => o.id));
  // 여행겹침에 이미 뜬 유저는 친구의친구에서 제외(겹침이 더 강한 신호)
  const visibleSuggestions = suggestions.filter(notBlocked).filter((s0) => !overlapIds.has(s0.id));
```

- [ ] **Step 2: `InviteCard` 컴포넌트 추가**

`FriendSearchScreen` 컴포넌트 함수 **위**(파일 상단 `FriendItem` 정의 다음)에 추가:
```tsx
// 콜드스타트/추천 희소 시 노출되는 초대 카드 — 기존 공유(handleShareMe) 재사용
function InviteCard({ onInvite, accent }: { onInvite: () => void; accent: string }) {
  const { t } = useTranslation();
  return (
    <View style={s.inviteCard}>
      <Text style={s.inviteCardTitle}>{t('friends.inviteCardTitle')}</Text>
      <Text style={s.inviteCardBody}>{t('friends.inviteCardBody')}</Text>
      <TouchableOpacity
        style={[s.inviteCardBtn, { backgroundColor: accent }]}
        activeOpacity={0.85}
        onPress={onInvite}
        accessibilityRole="button"
        accessibilityLabel={t('friends.inviteCta')}
      >
        <Text style={s.inviteCardBtnText}>{t('friends.inviteCta')}</Text>
      </TouchableOpacity>
    </View>
  );
}
```

- [ ] **Step 3: 리스트 렌더 재구성**

현재 리스트 렌더(ScrollView 내부 `{isSearching ? (...) : visibleSuggestions.length > 0 ? (...) : (...)}` ~496-519)를 다음으로 교체:
```tsx
        {isSearching ? (
          /* 검색 결과 (아이디/핸들) */
          <>
            <Text style={[s.sectionLabel, { color: skinAccent.accent }]}>{t('friends.searchResults')}</Text>
            {searching ? (
              <ActivityIndicator color={skinAccent.accent} style={{ marginTop: 40 }} />
            ) : searchError ? (
              <Text style={s.emptyText}>{t('friends.searchError')}</Text>
            ) : displayList.length === 0 ? (
              <Text style={s.emptyText}>{t('friends.noResultSearch')}</Text>
            ) : (
              renderRows(displayList)
            )}
          </>
        ) : (
          <>
            {visibleOverlap.length > 0 && (
              <>
                <Text style={[s.sectionLabel, { color: skinAccent.accent }]}>{t('friends.overlapSection')}</Text>
                {renderRows(visibleOverlap)}
              </>
            )}
            {visibleSuggestions.length > 0 && (
              <>
                <Text style={[s.sectionLabel, { color: skinAccent.accent }]}>{t('friends.suggestedFriends')}</Text>
                {renderRows(visibleSuggestions)}
              </>
            )}
            {(visibleOverlap.length + visibleSuggestions.length) < 3 && myCode ? (
              <InviteCard onInvite={handleShareMe} accent={skinAccent.accentDeep} />
            ) : null}
            {visibleOverlap.length === 0 && visibleSuggestions.length === 0 && (
              <Text style={s.emptyText}>{t('friends.coldStartNudge')}</Text>
            )}
          </>
        )}
```

- [ ] **Step 4: InviteCard 스타일 추가**

`const s = StyleSheet.create({` 블록 안에 추가(기존 색 토큰 `C`·값 재사용):
```ts
  inviteCard: {
    marginTop: 20,
    marginHorizontal: 4,
    padding: 18,
    borderRadius: 16,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.divider,
    alignItems: 'center',
  },
  inviteCardTitle: { color: C.white, fontSize: 15, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  inviteCardBody: { color: C.dim, fontSize: 13, lineHeight: 18, marginBottom: 14, textAlign: 'center' },
  inviteCardBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 999 },
  inviteCardBtnText: { color: C.white, fontSize: 14, fontWeight: '700' },
```

- [ ] **Step 5: tsc**

Run: `npx tsc --noEmit`
Expected: 에러 없음(exit 0). (`C.card/divider/white/dim`, `myCode`, `handleShareMe`, `skinAccent.accentDeep`는 이미 파일에 존재)

- [ ] **Step 6: 커밋**

```bash
git add src/screens/FriendSearchScreen.tsx
git commit -m "feat(friends): 발견 허브 리스트 재구성(여행겹침·친구의친구·초대 카드·콜드스타트)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 최종 검증 (수동 QA 체크리스트)

**Files:** (없음 — 검증만)

- [ ] **Step 1: 전체 tsc**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: ko/en 키셋 파리티 재확인**

Run:
```bash
node -e 'const fs=require("fs");const k=f=>(fs.readFileSync(f,"utf8").match(/^\s*[A-Za-z0-9_]+:/gm)||[]);const a=k("src/i18n/locales/ko.ts"),b=k("src/i18n/locales/en.ts");console.log("ko",a.length,"en",b.length,a.length===b.length?"OK":"MISMATCH")'
```
Expected: `OK`.

- [ ] **Step 3: 실기기/에뮬레이터 수동 QA**

`npx expo start -c` 후 메이트찾기 진입해 확인:
- 여행이 겹치는 실유저가 있으면 "여행이 겹치는 사람" 섹션 + "🌍 함께 다녀온 나라 N곳 · 일본·프랑스" 이유 문구 노출
- 같은 유저가 친구의친구에도 있으면 겹침 섹션에만 노출(중복 제거)
- 겹침·친구의친구가 적으면(<3) 초대 카드 노출, 버튼 → 공유 시트
- 둘 다 0(콜드스타트)면 초대 카드 + 넛지 문구
- 차단 유저는 어떤 섹션에도 미노출
- 검색·QR·친구의친구 회귀 없음
- 영어 모드: 섹션명·이유 문구·나라명 영문 변환

- [ ] **Step 4: schema.sql 재실행 안내**

사용자에게 **Supabase에서 schema.sql 재실행**(또는 Task 1 함수·인덱스만 실행) 필요함을 명시. 재실행 전에는 `travel_overlap_suggestions`가 없어 겹침 섹션이 비어 보임(폴백 정상).

---

## Self-Review 결과

**Spec coverage:**
- RPC(1.1) → Task 1 ✓ / public_profiles 확인(1.2) → Task 1 Step 3 ✓
- fetchTravelOverlap(2) → Task 3 ✓ / ContactFriend 확장(2.1) → Task 4 Step 1 ✓
- 데이터 로드·중복제거(3.1) → Task 5, Task 6 Step 1 ✓
- 리스트 섹션(3.2) → Task 6 Step 3 ✓ / FriendItem 이유(3.3) → Task 4 Step 4 ✓
- InviteCard(3.4) → Task 6 Step 2·4 ✓ / i18n 키(3.5) → Task 2 ✓
- 프라이버시·엣지(4) → Task 1(서버 제외)·Task 5/6(클라 폴백·섹션 숨김) ✓
- 테스트(5) → 각 태스크 검증 + Task 7 ✓

**Placeholder scan:** 모든 코드 블록 구체적. TODO/TBD 없음.

**Type consistency:** `TravelOverlapRow`(authorId/handle/emoji/profilePhoto/sharedCount/sampleCountries) → Task 5에서 `ContactFriend`(sharedCount/sharedCountries)로 매핑 일관. `fetchTravelOverlap`/`travel_overlap_suggestions`/`match_limit` 명칭 태스크 간 일치.
