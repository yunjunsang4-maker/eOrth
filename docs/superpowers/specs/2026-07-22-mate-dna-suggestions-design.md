# 추천 메이트 — 여행 DNA 설계 (발견 허브 1.5단계)

**목표:** "여행이 겹치는 사람"+"친구의 친구" 두 섹션을 **여행 DNA 점수 기반 "추천 메이트" 단일 섹션**으로 통합한다. DNA에는 서버 발행 기록뿐 아니라 **로컬 여행기록카드(tripGroups)·미발행/나만보기 기록의 나라**도 반영한다(사용자 확정).

**아키텍처:** 기존 `travel_overlap_suggestions`를 폐기(drop)하고, 다차원 점수를 계산하는 `mate_suggestions(match_limit int, extra_countries text[])` RPC로 교체. 클라이언트는 로컬 나라 목록을 `extra_countries`로 전달해 내 DNA를 보강한다. 프론트는 단일 effect·단일 섹션으로 단순화하고, 행마다 가장 강한 신호를 이유 문구로 보여준다.

---

## 1. DNA 점수 (서버)

### RPC `mate_suggestions(match_limit int default 10, extra_countries text[] default '{}')`

반환: `author_id uuid, handle text, emoji text, profile_photo text, shared_count int, sample_countries text[], mutual_count int, style_score int, total_score int`

**내 DNA 입력:**
- `my_countries` = 내 서버 게시물(`visibility <> 'private'`) distinct `country_name` **∪ `extra_countries`**(로컬 여행기록카드·미발행·나만보기 기록의 나라 — 클라 전달)
- `my_comps` = 내 게시물 `data->'companions'` distinct 원소(jsonb_array_elements_text)
- `my_vts` = 내 게시물 distinct `view_type`

**후보:** `visibility <> 'private'` 게시물이 1개 이상인 다른 유저 전체. 제외 규칙 기존 동일(본인·`is_blocked_between`·`are_neighbors`·양방향 pending).

**점수(정수, 최대 100):**
| 차원 | 계산 | 최대 |
|------|------|-----|
| 나라 겹침 | `least(shared_count, 5) * 10` | 50 |
| 스타일: 동행 | `least(겹친 동행 유형 수, 3) * 5` | 15 |
| 스타일: 기록 형식 | `least(겹친 view_type 수, 2) * 7` | 14 |
| 함께 아는 메이트 | `least(mutual_count, 3) * 7` | 21 |

- `style_score` = 동행 + 기록형식 (최대 29)
- `mutual_count` = 내 메이트(accepted) 중 후보와도 메이트인 수 — neighbors 테이블로 계산(기존 "친구의 친구" 신호 흡수)
- `total_score` = 나라 + 스타일 + 메이트. **`total_score > 0`만 반환**, 정렬 `total_score desc, handle`, limit 1~50 클램프
- `sample_countries` = 겹친 나라 최대 3개(기존 동일). 겹침 0이면 빈 배열
- 대륙 유사도는 제외(서버에 나라→대륙 매핑 없음, 나라 겹침이 대체)

**프라이버시:** `extra_countries`는 호출자 본인의 매칭 입력에만 사용 — 타인이 나를 후보로 볼 때는 여전히 내 서버 `visibility <> 'private'` 게시물만 쓰임(비공개 데이터 비노출 유지). 후보 데이터도 기존과 동일하게 비공개 제외.

**정리:** `drop function if exists public.travel_overlap_suggestions(int);` 추가(재실행 시 자동 정리). **schema.sql 재실행 필요.**

## 2. 프론트

### services/social.ts
- `fetchTravelOverlap`/`TravelOverlapRow` → `fetchMateSuggestions`/`MateSuggestionRow`로 교체(신규 필드 mutualCount·styleScore·totalScore). 이 화면 외 호출자 없음 확인 후 구 함수 제거.
- `fetchFriendSuggestions`는 FriendSearchScreen에서만 쓰면 화면에서 호출 제거(함수 자체는 다른 호출자 있으면 유지).

### FriendSearchScreen
- **로컬 나라 수집:** `useRecords()`의 `records`(isMyPost)의 `countryName` ∪ `tripGroups`의 `countryName`(있는 것만) → distinct 배열로 `fetchMateSuggestions(10, extraCountries)` 전달
- effect 2개(overlap+suggestions) → **1개**로 통합, 중복제거 파생값 삭제
- 섹션 1개: `friends.suggestedFriends`("추천 메이트") — `overlapSection` 키는 데드로 잔존
- `ContactFriend`에 `mutualCount?: number`, `styleScore?: number` 추가
- **FriendItem 이유 문구 우선순위:** ① `sharedCountries.length>0` → 기존 겹침 문구 ② `mutualCount>0` → `friends.mutualReason` ③ 그 외(styleScore>0) → `friends.styleReason`
- 초대 카드·콜드스타트 조건 유지(추천 <3명 → InviteCard, 0명 → 넛지)

### i18n (friends 네임스페이스, ko/en 파리티)
| 키 | ko | en |
|----|----|----|
| mutualReason | 함께 아는 메이트 {{count}}명 | {{count}} mutual mates |
| styleReason | 여행 스타일이 비슷해요 | Similar travel style |

## 3. 테스트/검증
- RPC: SQL 시드 수동검증 — 겹침·동행·형식·공통메이트 각 차원 점수, total 0 미반환, 제외 규칙, extra_countries 합집합 반영
- 프론트: `npx tsc --noEmit`, ko/en 키 파리티, 수동 QA(단일 섹션·이유 3종·초대카드·콜드스타트·차단 제외)

## 성공 기준
- 추천 메이트 단일 섹션에 DNA 점수순으로 노출, 행마다 겹침/공통메이트/스타일 중 가장 강한 이유 표시
- 로컬 여행기록카드만 있는(서버 발행 없는) 나라도 내 매칭에 반영
- 기존 검색·초대 카드·콜드스타트·차단 제외 회귀 없음
