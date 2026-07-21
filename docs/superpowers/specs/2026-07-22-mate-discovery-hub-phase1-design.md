# 메이트찾기 발견 허브 — 1단계 설계 (여행 겹침 발견 + 허브 개편)

**목표:** 메이트찾기 화면을 "발견 허브"로 개편하고, eOrth의 여행 데이터를 활용한 "여행이 겹치는 사람" 추천을 추가해 콜드스타트·빈약한 발견·약한 노출 문제를 한 번에 개선한다.

**아키텍처:** 서버에 여행겹침 계산 RPC(`travel_overlap_suggestions`)를 하나 추가(기존 `profile_country_counts`의 프라이버시 모델을 그대로 미러). 프론트는 메이트찾기 진입 시 여행겹침·친구의친구·내 QR을 병렬 로드하고, 검색 안 할 때의 리스트를 `여행이 겹치는 사람` → `친구의 친구` → (콜드스타트 시) `초대 카드` 섹션으로 재구성한다.

**기술 스택:** Supabase(Postgres RPC, SECURITY DEFINER), React Native(Expo)/TypeScript, 기존 `FriendSearchScreen`·`services/social.ts`·react-i18next.

---

## 범위 (1단계 한정)

**포함:**
1. 서버 RPC `travel_overlap_suggestions` 신규
2. 프론트 서비스 `fetchTravelOverlap`
3. `FriendSearchScreen` 리스트 영역 개편(여행겹침 섹션 + 콜드스타트 초대 카드)
4. `FriendItem` 행에 겹침 이유 문구 렌더
5. i18n 키 추가(ko/en)

**제외(후속 단계 — 별도 스펙):**
- 2단계: 맥락별 진입점(프로필 "여행 겹침 N곳" 배지, 나라별 화면 "이 나라 다녀온 사람", 소셜탭 추천 카드)
- 3단계: 초대 전환 강화(귀속 딥링크로 가입 시 자동 연결 넛지)
- "발견에서 숨기기" 개별 옵트아웃 토글, 도시 단위 겹침, 여행 시기 겹침("같은 주에 일본")

---

## 1. 데이터 모델 / 서버

### 1.1 신규 RPC `travel_overlap_suggestions(match_limit int)`

기존 `profile_country_counts`(schema.sql:338)와 동일한 원칙 — SECURITY DEFINER, **`visibility <> 'private'` 게시물만** 집계(=이미 공개된 방문국 카운트와 같은 노출 범위, 신규 PII 없음). 비공개 계정 개념은 폐지(2026-07-15)되었으므로 계정 단위 제외는 없고, 프라이버시는 게시물 `visibility`로만 통제한다.

**입력:** `match_limit int default 10` (1~50로 클램프)
**반환 테이블:** `author_id uuid, handle text, emoji text, profile_photo text, shared_count int, sample_countries text[]`

**로직:**
- caller = `auth.uid()`
- `my_countries` = 내(`author_id = auth.uid()`) `visibility <> 'private'` 게시물의 distinct `country_name`(빈 문자열·null 제외)
- 후보 = `author_id <> auth.uid()`이고 `country_name in (my_countries)`인 `visibility <> 'private'` 게시물의 작성자
- 후보별 `shared_count` = 나와 겹치는 distinct `country_name` 수, `sample_countries` = 겹친 나라 최대 3개
- **제외:** `is_blocked_between(me, 후보)` / `are_neighbors(me, 후보)` / me↔후보 간 `neighbors.status='pending'` / `shared_count = 0`
- 정렬: `shared_count desc, handle`(결정적)
- `limit greatest(1, least(match_limit, 50))`

**SQL 스케치:**
```sql
create or replace function public.travel_overlap_suggestions(match_limit int default 10)
returns table (
  author_id uuid, handle text, emoji text, profile_photo text,
  shared_count int, sample_countries text[]
)
language sql security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  my_countries as (
    select distinct p.country_name
    from posts p, me
    where p.author_id = me.uid
      and p.visibility <> 'private'
      and p.country_name is not null and p.country_name <> ''
  ),
  shared as (
    select p.author_id,
           count(distinct p.country_name)::int as shared_count,
           (array_agg(distinct p.country_name))[1:3] as sample_countries
    from posts p, me
    where p.author_id <> me.uid
      and p.visibility <> 'private'
      and p.country_name in (select country_name from my_countries)
    group by p.author_id
  )
  select s.author_id, pp.handle, pp.emoji, pp.profile_photo,
         s.shared_count, s.sample_countries
  from shared s
  join public_profiles pp on pp.id = s.author_id
  cross join me
  where not public.is_blocked_between(me.uid, s.author_id)
    and not public.are_neighbors(me.uid, s.author_id)
    and not exists (
      select 1 from neighbors n
      where ((n.requester_id = me.uid and n.addressee_id = s.author_id)
          or (n.requester_id = s.author_id and n.addressee_id = me.uid))
        and n.status = 'pending'
    )
  order by s.shared_count desc, pp.handle
  limit greatest(1, least(match_limit, 50));
$$;
grant execute on function public.travel_overlap_suggestions(int) to authenticated;
```

**성능:** `posts(author_id, country_name)` 인덱스가 없으면 추가(`profile_country_counts`도 같은 스캔을 하므로 공통 이득). schema.sql 하단 인덱스 블록에 `create index if not exists posts_author_country_idx on public.posts(author_id, country_name);` 추가.

> ⚠️ schema.sql은 사용자가 수동 재실행해야 반영됨(기존 관례 — [[eorth-backend-rollout]]).

### 1.2 `public_profiles` 컬럼 확인

RPC가 `pp.id, handle, emoji, profile_photo`를 참조하므로 `public_profiles` 뷰가 이 4개를 노출하는지 확인(기존 `services/social.ts`의 `public_profiles(handle, emoji, profile_photo)` 사용으로 존재 확인됨; `id`는 PK). 없으면 뷰 정의 보강.

---

## 2. 프론트 서비스

`src/services/social.ts`에 추가:

```ts
export interface TravelOverlapRow {
  authorId: string;
  handle: string;
  emoji: string | null;
  profilePhoto: string | null;
  sharedCount: number;
  sampleCountries: string[]; // country_name(한글, 예: '일본')
}

export async function fetchTravelOverlap(limit = 10): Promise<TravelOverlapRow[]> {
  // RPC가 서버에서 auth.uid()로 본인을 판정하므로 클라에서 uid를 조회할 필요 없음
  const { data, error } = await supabase.rpc('travel_overlap_suggestions', { match_limit: limit });
  if (error || !data) return []; // 부가 기능 — 실패 시 빈 배열(섹션 미표시)
  return (data as any[]).map(r => ({
    authorId: r.author_id, handle: r.handle, emoji: r.emoji,
    profilePhoto: r.profile_photo, sharedCount: r.shared_count,
    sampleCountries: r.sample_countries ?? [],
  }));
}
```

호출부에서 `TravelOverlapRow` → 기존 `ContactFriend` 형태로 매핑(아래 2.1)하되 겹침 필드를 함께 실어 이유 문구를 렌더한다.

### 2.1 `ContactFriend` 타입 확장 (`FriendSearchScreen.tsx`)

```ts
interface ContactFriend {
  // ...기존 필드...
  sharedCount?: number;       // 여행겹침 행일 때만
  sharedCountries?: string[]; // 겹친 나라 샘플(한글 country_name)
}
```

---

## 3. 화면 (FriendSearchScreen = 발견 허브)

제목("메이트 찾기")·QR 카드·검색창·QR 스캔 모달은 **변경 없음**. 검색하지 않을 때의 리스트만 재구성한다.

### 3.1 데이터 로드

진입 시 병렬 로드(기존 suggestions 로드 effect 확장):
```ts
const [overlap, setOverlap] = useState<ContactFriend[]>([]);
// effect 내부에서 fetchTravelOverlap(10) + fetchFriendSuggestions(10) 병렬
```
- 여행겹침 매핑: `sampleCountries`/`sharedCount`를 실어 ContactFriend 생성
- **중복 제거:** 여행겹침에 등장한 authorId 집합을 만들어, 친구의친구(suggestions)에서 그 id들을 제외(겹침이 더 강한 신호)
- 차단 제외는 기존 `notBlocked` 필터 재사용(서버 제외 + 클라 폴백 이중)

### 3.2 리스트 렌더 구조

```
[ QR 카드 ]              ← 유지
[ 검색창 ]               ← 유지
── ScrollView ──
검색 중?  → 검색 결과(기존, 변경 없음)
아니면:
  overlap.length > 0:
     ▸ "여행이 겹치는 사람" (friends.overlapSection)
       renderRows(overlap)   // 이유 문구 포함
  fofSuggestions.length > 0:
     ▸ "친구의 친구" (friends.suggestedFriends)
       renderRows(fofSuggestions)
  (overlap.length + fofSuggestions.length) < 3:
     ▸ 초대 카드(InviteCard) — CTA는 기존 handleShareMe 재사용
  overlap==0 && fofSuggestions==0 (콜드스타트):
     초대 카드 + 넛지 문구(friends.coldStartNudge) + 기존 검색/QR 안내
```
- 각 섹션은 비면 숨김. 지금의 "맨 텍스트 한 줄" 빈 상태는 **초대 카드 + 넛지**로 대체.
- 초대 카드 상시 노출 아님(QR 카드에 ↗공유 이미 존재 → 중복 방지). 겹침+친구의친구 합이 3 미만일 때만.

### 3.3 `FriendItem` 이유 문구

`FriendItem`에 겹침 이유 렌더 추가(옵셔널):
- `item.sharedCountries?.length`가 있으면 기존 "🌍 N개국" 줄 **대신** 겹침 줄 표시:
  `🌍 {t('friends.overlapReason', { count: item.sharedCount })} · {나라 샘플}`
  - 나라 샘플은 `sampleCountries`를 `countryLabel`(영어 모드 변환)로 매핑해 `·`로 join
- 겹침 필드가 없으면 기존 렌더 그대로(친구의친구는 국가수 표시 유지)

### 3.4 InviteCard 컴포넌트

`FriendSearchScreen` 내부 소형 컴포넌트. 카드 UI + CTA 버튼.
- 제목 `friends.inviteCardTitle`, 본문 `friends.inviteCardBody`, 버튼 `friends.inviteCta`
- onPress = 기존 `handleShareMe`(shareMeMessage 공유) 재사용

### 3.5 i18n 키 (ko/en, `friends` 네임스페이스)

| 키 | ko | en |
|----|----|----|
| overlapSection | 여행이 겹치는 사람 | People who share your travels |
| overlapReason | 함께 다녀온 나라 {{count}}곳 | {{count}} countries in common |
| inviteCardTitle | 아직 겹치는 사람이 적어요 | Not many overlaps yet |
| inviteCardBody | 지인을 eOrth로 초대해 함께 여행을 기록해요 | Invite friends to eOrth and log trips together |
| inviteCta | 초대하기 | Invite |
| coldStartNudge | 여행 기록을 남기면 겹치는 사람을 찾아드려요 | Log your trips and we'll find people who share them |

> ko/en 키셋은 반드시 동일 개수 유지([[eorth-i18n-setup]] — 과거 키 불일치 사고 방지).

---

## 4. 프라이버시 & 엣지케이스

- 여행겹침은 `visibility <> 'private'` 게시물만 사용 → 노출 범위 = 기존 공개 방문국 카운트와 동일(신규 PII 없음)
- 차단(양방향)·기존 메이트·신청중·본인 → 서버 RPC 제외 + 클라 폴백
- 비공개 계정 개념 없음(폐지) → 계정 단위 제외 없음. 프로액티브 노출을 원치 않는 사용자용 "발견에서 숨기기" 토글은 **1단계 제외**(후속)
- 베타 소규모 풀: 겹침이 0/짧아도 섹션 숨김 + 콜드스타트 초대 카드로 자연스럽게
- RPC 실패(오프라인 등): `fetchTravelOverlap`이 빈 배열 반환 → 섹션 미표시(앱 흐름 영향 없음)
- `country_name`이 한글이 아닌 코드로 저장된 레코드가 섞였을 가능성 → 샘플 표시 시 `countryLabel`이 매핑 못 하면 원문 그대로(기존 라벨 유틸 동작과 동일)

---

## 5. 테스트

**RPC(SQL, 수동):** Supabase에 시드 후 검증
- 나와 나라가 겹치는 유저 → `shared_count`·`sample_countries` 정확
- 겹침 0 유저 → 미반환
- 차단(양방향)/기존 메이트/신청중/본인 → 제외 확인
- `visibility='private'` 게시물만 겹치는 유저 → 미반환(비공개 제외)

**프론트:**
- `npx tsc --noEmit` 통과(신규 타입·키)
- 수동: 겹침 섹션·이유 문구(🌍 N곳 · 나라)·친구의친구 중복 제거·콜드스타트 초대 카드·차단 유저 미노출·영어 모드 나라명 변환
- ko/en 키셋 개수 동일 검증(node 스크립트)

**참고:** Supabase RPC용 앱 테스트 하네스가 없어 RPC는 SQL/수동 검증(기존 관례).

---

## 성공 기준

- 여행이 겹치는 실유저가 있으면 메이트찾기 진입 즉시 "여행이 겹치는 사람" 섹션에 이유 문구와 함께 노출된다
- 겹치는 사람이 없거나 신규 유저(콜드스타트)면 맨 텍스트 대신 초대 카드 + 넛지가 뜬다
- 기존 검색·QR·친구의친구 기능은 회귀 없이 그대로 동작한다
- 차단·기존 메이트·본인은 어떤 섹션에도 나타나지 않는다
