# 팔로우 → 서로이웃 모델 전환 설계

작성일: 2026-07-15
상태: 승인됨 (설계 단계)

## 배경 / 동기

eOrth의 정체성은 "나만의 기록과 공유"다. 현재의 인스타그램식 단방향 팔로우
모델은 불특정 다수에게 노출되는 개방형 소셜에 맞춰져 있어, 앱의 지향(가까운
관계와의 친밀한 여행 기록 공유)과 어긋난다. 관계 모델을 네이버 블로그의
**서로이웃**(양방향·수락제)으로 바꾸고, 공개범위를 단순화해 "닫힌 공유" 구조로
전환한다.

## 목표

1. 단방향 팔로우 → **서로이웃**(양방향, 신청→수락) 관계 모델로 교체
2. **비공개 계정** 기능 제거 (모든 계정이 동일, 노출은 이웃+공개범위로만 결정)
3. 기록 공개범위를 **전체공개/친구만/나만보기(3단계) → 이웃만/나만보기(2단계)** 로 축소
4. 소셜 피드·탐색을 **서로이웃 글만 보이는 닫힌 피드**로 전환
5. 기존 베타 데이터를 안전하게 이관 (관계 손실·의도치 않은 노출 방지)

## 비목표 (YAGNI)

- 단방향 "이웃"(팔로우형) 병행 — 서로이웃 단일 모델만 둔다
- "전체공개" 공개범위 유지 — 완전 제거한다
- 이웃 그룹/즐겨찾기/이웃 수 상한 등 부가 기능 — 이번 범위 아님
- 추천 이웃 알고리즘 개선 — 기존 친구찾기(아이디·QR·추천친구) 그대로 사용

---

## 1. 용어 매핑

| 기존 | 변경 후 |
|------|---------|
| 팔로우 / 언팔로우 | 이웃신청 / 이웃끊기 |
| 팔로워 / 팔로잉 (2개 목록) | **이웃** (1개 목록, 대칭) |
| 맞팔 | 서로이웃 = 이웃 (모든 관계가 대칭이라 별도 개념 소멸) |
| 팔로우 요청 (비공개 계정) | 이웃신청 (모든 관계의 기본 흐름) |
| 비공개 계정 토글 | 제거 |
| 공개범위: 전체공개 / 친구만 / 나만보기 | **이웃만 / 나만보기** |

주: 관계가 대칭이므로 "팔로워 수"와 "팔로잉 수"가 하나의 **이웃 수**로 합쳐진다.

---

## 2. 관계 데이터 모델

### 2.1 새 테이블 `neighbors`

```sql
create table public.neighbors (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending',  -- 'pending' | 'accepted'
  created_at   timestamptz not null default now(),
  primary key (requester_id, addressee_id)
);
```

- **신청**: `(me, target, 'pending')` 삽입
- **수락**: 상대가 보낸 `(target, me, 'pending')` → `status='accepted'`
- **거절 / 신청취소**: 해당 행 삭제
- **이웃끊기**: accepted 관계 행 삭제
- **서로이웃 판정**: 두 사용자 사이에 `status='accepted'` 행이 존재하는가
  (방향 무관 — accepted는 대칭 관계를 의미)

역방향 중복 신청 방지: 신청 전 반대 방향 pending 행이 있으면 신청 대신
**자동 수락**으로 처리(양쪽이 서로 신청 → 즉시 서로이웃). 클라이언트/RPC에서 처리.

### 2.2 판정 헬퍼 (SECURITY DEFINER)

```sql
create or replace function public.are_neighbors(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.neighbors
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b)
        or (requester_id = b and addressee_id = a))
  );
$$;
```

### 2.3 검토한 대안

- **대안 A** — 기존 `follows`를 "양방향 둘 다 있으면 이웃"으로 재해석. 스키마
  변경은 최소지만 "이웃 = follows 2행"이 지저분하고, 한쪽 삭제 시 관계가 깨지며,
  pending 개념을 표현할 수 없다. 기각.
- **대안 B** — 무방향 정규화 테이블 `(user_lo < user_hi, status)`. 중복은 없지만
  pending은 방향(누가 신청했는지)이 필요해 별도 컬럼이 생겨 오히려 복잡. 기각.
- **채택** — `neighbors(requester, addressee, status)`. 신청/수락/취소와 대칭
  노출을 한 테이블로 자연스럽게 표현.

---

## 3. 공개범위 (Visibility)

### 3.1 타입 변경

```ts
// 기존: export type Visibility = 'private' | 'friends' | 'public';
export type Visibility = 'private' | 'neighbors';
```

- `'private'` — **나만 보기** (내부 값 유지, 라벨만 변경 → 마이그레이션 축소)
- `'neighbors'` — **이웃만** (기존 `friends`·`public`을 흡수)
- 작성 화면 4곳(New/Blog/Cut/Snap)의 공개범위 옵션을 2개로, 기본값 `'neighbors'`

### 3.2 작성 화면 공개범위 UI

```
🔒 나만 보기   (private)
🏡 이웃만      (neighbors)   ← 기본값
```

---

## 4. 서버 규칙 (RLS)

### 4.1 `posts_select` 재작성

```sql
create policy "posts_select" on public.posts
  for select to authenticated using (
    not public.is_blocked_between(auth.uid(), posts.author_id)
    and (
      author_id = auth.uid()
      or (visibility = 'neighbors' and public.are_neighbors(auth.uid(), posts.author_id))
    )
  );
```

- `visibility = 'private'`는 작성자 본인만 (위 첫 분기)
- `is_private_account` 분기·`follows` 참조 완전 제거

### 4.2 `comments_select_visible`

posts RLS에 위임된 구조 유지 — 서브쿼리의 가시성 로직을 위 규칙과 동일하게
`are_neighbors` 기준으로 교체.

### 4.3 RPC 교체

| 기존 RPC | 변경 |
|----------|------|
| `follow_list_of(target, mode)` | `neighbor_list_of(target)` — 단일 이웃 목록 |
| `follower_counts(ids[])` | `neighbor_counts(ids[])` — 이웃 수 |
| `profile_country_counts` | 유지 (visibility `<> 'private'` 조건만 확인) |
| `is_private_account` | 삭제 |

### 4.4 `neighbors` 테이블 RLS

- select: 본인이 당사자(requester 또는 addressee)인 행만 직접 조회 가능.
  타인 관계 목록은 `neighbor_list_of` RPC(SECURITY DEFINER)로 조회.
- insert: `requester_id = auth.uid()` (신청)
- update: `addressee_id = auth.uid()` 이고 pending → accepted (수락)
- delete: 당사자(requester 또는 addressee) 누구나 (신청취소·거절·끊기)

---

## 5. 데이터 마이그레이션 (1회성 SQL)

`supabase/migration-2026-07-15-neighbors.sql` 별도 파일 (schema.sql엔 최종형만).

1. `neighbors` 테이블 + 인덱스 + RLS + RPC 생성
2. **맞팔만** accepted 이웃으로 이관:
   ```sql
   insert into public.neighbors (requester_id, addressee_id, status)
   select f1.follower_id, f1.following_id, 'accepted'
   from public.follows f1
   join public.follows f2
     on f2.follower_id = f1.following_id
    and f2.following_id = f1.follower_id
   where f1.follower_id < f1.following_id  -- 쌍당 1행(중복 방지)
   on conflict do nothing;
   ```
   단방향 follows는 이관하지 않음(관계 소멸).
3. 게시물 공개범위 이관 (컬럼 + data JSON 양쪽):
   ```sql
   update public.posts
     set visibility = 'neighbors',
         data = jsonb_set(data, '{visibility}', '"neighbors"')
   where visibility in ('public', 'friends');
   -- private은 그대로 (나만보기)
   ```
4. 정리: `follows`, `follow_requests` 테이블 드롭, `profiles.is_private` 컬럼 드롭,
   `public_profiles` 뷰에서 `is_private` 제거, `is_private_account` 함수 드롭
5. 실행 순서: 2·3(데이터 이관)을 4(드롭)보다 먼저

> 이전 사례(가져온 앨범 visibility)와 동일하게, 서버 SQL은 사용자가 Supabase SQL
> 편집기에서 1회 실행. 재실행 금지(맞팔 이관·드롭은 멱등적이나 관계 상태를 되돌릴 수 있음).

---

## 6. 클라이언트 변경 범위

### 6.1 서비스 (`src/services/`)

- `social.ts`: `followUser/unfollowUser/fetchFollowers/fetchFollowing/removeFollower`
  → `requestNeighbor / acceptNeighbor / declineNeighbor / cancelNeighborRequest /
  removeNeighbor / fetchNeighbors / fetchIncomingRequests / fetchOutgoingRequests`.
  `isMutual` 계산 로직 제거(모든 이웃이 대칭).
- `posts.ts`: 쿼리 자체는 RLS 위임이라 변경 최소. 주석의 friends/public 서술 갱신.
- `profile.ts`, `ProfileSync.tsx`, `useAccountBoundary.ts`: `is_private` 참조 제거.

### 6.2 Store (`recordStore.tsx`)

- `Visibility` 타입 2값으로
- `followingUsers` → `neighbors`, `pendingFollowRequests` → `outgoingNeighborRequests`,
  받은 신청 `incomingNeighborRequests` 상태 추가
- 액션: `followUser/unfollowUser/requestFollow/cancelFollowRequest/setFollowMutual`
  → `requestNeighbor/removeNeighbor/acceptNeighbor/declineNeighbor/cancelNeighborRequest`
- `refreshFollowing` → `refreshNeighbors`
- 가져온 앨범 기본 공개범위는 이미 `'friends'` → `'neighbors'`로 변경

### 6.3 화면

| 화면 | 변경 |
|------|------|
| `FollowerListScreen` | 팔로워/팔로잉 2탭 → **이웃 1목록 + 받은 이웃신청** 섹션 |
| `FriendProfileScreen` | 팔로우 버튼 → 이웃신청/신청됨/이웃 상태 버튼; 팔로워·팔로잉 카운트 2개 → **이웃 수 1개** |
| `ProfileScreen` | 프로필 통계의 팔로워/팔로잉 → 이웃 수 |
| `FriendSearchScreen` | 팔로우 → 이웃신청 |
| `NotificationScreen` | 팔로우 알림 → 이웃신청/수락 알림 |
| `NewRecord/Blog/Cut/Snap` | 공개범위 옵션 3→2(나만보기·이웃만), 기본 이웃만 |
| `AccountSettingsScreen` | 비공개 계정 토글 제거 |
| `SocialScreen` / `SocialExploreScreen` | 피드 필터를 이웃 글 기준으로 (RLS가 서버단 보장, 클라 필터는 `visibility` 2값 대응) |

### 6.4 배지 (`badgeRules.ts`)

- `mutualFriendCount` → `neighborCount` (라벨/주석), 임계값(1/10/50/100) 로직 유지.
- 배지 78/81/82/83 문구를 "이웃 수" 기준으로 i18n 갱신.

### 6.5 i18n (`ko.ts` / `en.ts`)

- `followBack`, `mutualYes`, `mutualMark`, `followersTitle`, `noFollowers`,
  `visPublic/visFriends/visPrivate` 등 관계·공개범위 문구를 이웃/2단계 공개범위로 교체.
- 신규 키: `neighborRequest`(이웃신청), `neighborRequested`(신청됨),
  `neighbor`(이웃), `acceptNeighbor`, `declineNeighbor`, `incomingRequests` 등.

---

## 7. 엣지 케이스 / 위험

- **계정 전환/로그아웃**: 로컬 이웃 목록도 서버가 원천. 기존 로그아웃 로컬 보존
  원칙 유지(내 기록만 보존, 관계는 서버 재조회).
- **차단**: `is_blocked_between`는 그대로. 차단 시 이웃 관계도 서버에서 함께 정리
  (차단 시 `neighbors` 행 삭제 트리거 또는 클라이언트 처리).
- **단방향 follows였던 사용자**: 마이그레이션으로 관계 소멸 → 다시 이웃신청 필요.
  출시 노트/안내로 커버.
- **이미 가져온 앨범(friends)**: `neighbors`로 자동 이관되어 계속 이웃에게 보임.
- **공개 글 소멸**: 기존에 전체공개였던 글이 이웃만으로 축소 → 비이웃에게 안 보이게 됨.
  의도된 동작(닫힌 피드). 마이그레이션 안내 필요.

---

## 8. 구현 순서 (단계)

1. **DB/서버**: `neighbors` 테이블·RLS·RPC, `posts_select` 재작성, 마이그레이션 SQL
2. **서비스/Store**: social.ts·recordStore.tsx 이웃 API로 교체, Visibility 2값
3. **화면**: 관계 UI(이웃 목록/신청/프로필 버튼·카운트), 공개범위 2단계, 비공개 토글 제거
4. **배지·i18n**: 라벨/문구 정리
5. **검증**: `npx tsc --noEmit`, 이웃 신청→수락→글 노출→끊기 플로우 실기기 확인
