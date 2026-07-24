# 비이웃 프로필 — 카운트 동기화 + 잠금 안내 설계

## 목표

이웃이 아닌 사용자의 프로필을 볼 때, **여행수·이웃수 카운팅은 서버에서 동기화해 보여주되**, 여행기록 카드 영역은 인스타그램 비공개 계정처럼 **지구본+자물쇠 아이콘 1개 + 설명 문구 1줄**로 대체한다. 여행기록 자체는 여전히 이웃 전용(프라이버시 모델 불변).

## 배경 / 현재 동작

- 공개범위는 `'neighbors'`(이웃만) / `'private'`(나만보기) 2단계.
- `fetchUserPosts(userId)`는 `visibility='neighbors'` 글만 조회하고, 실제 접근은 RLS `posts_select`(`are_neighbors()`)가 판정 → **비이웃은 빈 목록**.
- `FriendProfileScreen`:
  - 여행수 스탯 = `display.trips.length` (posts에서 파생) → 비이웃은 **0**.
  - 이웃수 스탯 = `fetchNeighborCount`(`neighbor_counts` RPC, SECURITY DEFINER) → **이미 동기화됨**.
  - Travel archive = trips 0이면 "공개된 여행 없음" 텍스트.

즉 비이웃은 여행수 0 + 밋밋한 빈 텍스트를 본다. 이걸 **동기화된 카운트 + 잠금 안내**로 바꾼다.

## 범위

`FriendProfileScreen`에서 **뷰어가 비이웃**(`!isSelf && !isNeighbor(realId)`)일 때만 동작. 본인·이웃은 기존 UI 그대로.

## 설계

### A. 여행수 스탯 = 서버 동기화 기록 수

- **서버**: `post_counts(ids uuid[])` RPC 신설 — `neighbor_counts`와 동일 패턴(`language sql stable security definer set search_path = public`). 각 사용자의 `visibility='neighbors'` 글 수를 반환. RLS를 우회하는 공개 통계값(이웃수와 동일 취급).
  ```sql
  create or replace function public.post_counts(ids uuid[])
  returns table (user_id uuid, post_count int)
  language sql stable security definer set search_path = public as $$
    select u as user_id,
      (select count(*) from public.posts p
        where p.author_id = u and p.visibility = 'neighbors')::int
    from unnest(ids) as u;
  $$;
  grant execute on function public.post_counts(uuid[]) to authenticated;
  ```
  - `supabase/schema.sql`에 함수 추가 + `supabase/migration-2026-07-17-post-counts.sql`(수동 실행용) 작성.
- **클라이언트**: `src/services/social.ts`에 `fetchPostCount(userId): Promise<number|null>` 추가(`post_counts` RPC 호출, `fetchNeighborCount`와 동형).
- **화면**: `FriendProfileScreen.loadProfile`에서 `fetchPostCount`를 병렬 fetch → `postCount` state 저장. 여행수 StatCard 값을 `postCount ?? display.trips.length`로 사용(서버값 우선, 실패 시 로컬 폴백). 이웃·본인도 동일하게 동기화된 값 표시.
  - 참고: 다국가 분할 기록은 카드가 여러 장이지만 서버 카운트는 게시물 1개로 셈(희귀 케이스, 허용).

### B. 비이웃 잠금 안내 UI

- `const locked = !isSelf && !neighborNow;`
- `locked`이면 Travel badge 섹션 + Travel archive 섹션(카드/빈 텍스트) 대신 **잠금 안내 블록** 렌더:
  - 가운데 **지구본+자물쇠 아이콘**(신규 컴포넌트 `GlobeLockIcon`, react-native-svg: 위경도 격자 원 + 중앙/배지 자물쇠, 앱 톤 색).
  - 아래 **제목 1줄 + 서브 1줄**(문구는 커스텀 — 기본값 제공, 최종 문구는 사용자 확정 후 교체).
  - 스탯 행(여행수·이웃수)·이웃신청·DM 버튼은 그대로 노출.
- 이웃/본인: 기존 배지·아카이브 그대로.

### i18n (ko/en)

`socialEmpty`/`friends` 네임스페이스에 키 추가(동일 트리):
- `friends.lockedTitle` — 기본값 ko "이웃만 여행기록을 볼 수 있어요" / en "Only neighbors can see travel records"
- `friends.lockedDesc` — 기본값 ko "이웃이 되면 여행기록이 공개돼요" / en "Become neighbors to unlock their records"
  - (최종 문구는 사용자 커스텀으로 교체)

## 파일 변경 목록

- `supabase/schema.sql` — `post_counts` 함수 추가.
- `supabase/migration-2026-07-17-post-counts.sql` — 신규(수동 실행).
- `src/services/social.ts` — `fetchPostCount` 추가.
- `src/components/GlobeLockIcon.tsx` — 신규(지구본+자물쇠 SVG 아이콘).
- `src/screens/FriendProfileScreen.tsx` — postCount fetch·여행수 스탯 동기화·비이웃 잠금 블록.
- `src/i18n/locales/ko.ts`, `src/i18n/locales/en.ts` — 잠금 문구 키.

## 프라이버시 / 검증

- 여행기록 원문은 여전히 RLS로 이웃 전용(변경 없음). 공개되는 건 **카운트(집계)**뿐.
- `post_counts`는 집계값만 반환(개별 글 노출 없음) — 이웃수와 동일한 공개 수준.
- 검증: `npx tsc --noEmit`. 비이웃/이웃/본인 3케이스 UI 확인. 서버 마이그레이션 수동 실행 후 카운트 표시 확인.

## 비목표 (YAGNI)

- 여행기록을 비이웃에게 여는 것(프라이버시 모델 변경) — 하지 않음.
- 전체공개 공개범위 단계 신설 — 하지 않음.
- 미리보기(썸네일) 노출 — 하지 않음.
