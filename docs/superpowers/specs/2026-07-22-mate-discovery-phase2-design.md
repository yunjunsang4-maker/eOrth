# 발견 허브 2단계 — 맥락별 진입점 설계

**목표:** 메이트 발견을 메이트찾기 화면 밖 3곳의 맥락에 심는다: ① 타인 프로필 "나와 겹치는 나라" 줄 ② 나라별 화면 "이 나라 다녀온 사람" ③ 소셜 피드 "추천 메이트" 카드.

**아키텍처:** 소형 RPC 2개 추가(`overlap_with`, `country_visitors` — mate_suggestions와 동일 프라이버시 모델: `visibility <> 'private'`만 집계). 소셜 카드는 기존 `fetchMateSuggestions` 재사용(RPC 추가 없음). 각 진입점은 실패/빈 결과 시 조용히 숨김(부가 기능).

---

## 1. 서버 RPC (schema.sql, mate_suggestions 블록 뒤)

### `overlap_with(target uuid, extra_countries text[] default '{}')`
→ `(shared_count int, sample_countries text[])` 1행. 내 나라(서버 ∪ extra) ∩ target의 비공개 아닌 게시물 나라. 샘플 최대 3개, 없으면 count 0 + 빈 배열(coalesce).

### `country_visitors(target_country text, match_limit int default 12)`
→ `(author_id, handle, emoji, profile_photo, visit_posts int)`. 해당 나라의 비공개 아닌 게시물 보유 유저(본인 제외·차단 양방향 제외 — **메이트는 포함**: 발견이 아니라 사실 나열 목적). 게시물 수 desc, handle 타이브레이크, limit 1~50 클램프. 파라미터명 `target_country`(public_profiles의 country 컬럼과 모호성 회피).

프라이버시: 두 RPC 모두 후보/대상 데이터는 `visibility <> 'private'` 게시물만 — 기존 profile_country_counts·mate_suggestions와 동일 노출 범위. **schema.sql 재실행 필요.**

## 2. 프론트

### services/social.ts
- `fetchOverlapWith(targetId, extraCountries) → { sharedCount, sampleCountries } | null`
- `fetchCountryVisitors(countryName, limit) → CountryVisitor[]` (`{authorId, handle, emoji, profilePhoto, visitPosts}`)

### ① FriendProfileScreen — 겹침 줄
- `!isSelf`일 때 진입 시 `fetchOverlapWith(realId, 로컬나라)` — 로컬나라 = records(`isMyPost !== false`) ∪ tripGroups의 countryName(메이트찾기와 동일 수집)
- bio 아래·statsRow 위에 `sharedCount > 0`일 때만: `🌍 나와 겹치는 나라 N곳 · 일본·프랑스` — `friends.overlapReason` 재사용 + countryLabel(영어 변환). accent 색 소형 텍스트

### ② CountryScreen — 이 나라 다녀온 사람
- 진입 시 `fetchCountryVisitors(country.name, 12)`
- 스탯 카드 아래 섹션(빈 결과·오프라인이면 섹션 숨김): 제목 `misc.countryVisitorsTitle` + **가로 스크롤 칩**(아바타 사진 또는 PersonIcon + handle) → 탭 시 `FriendProfile` 이동

### ③ SocialScreen — 추천 메이트 카드
- 진입 시 `fetchMateSuggestions(3, 로컬나라)` 1회(부가 기능, 실패 무시)
- 피드 2번째 게시물 뒤에 카드 1개 삽입(`_mateSlot`) — 추천 있고 피드 항목 ≥2일 때만. **광고 시스템과 독립**(프리미엄 광고 제거와 무관하게 노출 — 광고가 아니라 발견 기능)
- 카드: 제목 `friends.suggestedFriends`("추천 메이트") + 최대 3명(아바타+handle) + CTA `social.adInviteCta`("메이트 찾기") → FriendSearch 이동. 행 탭 → FriendProfile
- 빈 피드는 기존 빈 상태(추천·친구찾기 CTA 이미 존재)가 담당 — 카드 미삽입

### i18n (신규 1쌍)
`misc.countryVisitorsTitle`: ko `'이 나라 다녀온 사람'` / en `'Travelers who\'ve been here'` — 나머지는 기존 키 재사용(overlapReason·suggestedFriends·adInviteCta)

## 3. 검증
RPC SQL 수동검증(겹침 0/차단/비공개 제외·방문자 정렬), tsc, ko/en 파리티, 수동 QA(3 진입점 노출/숨김·탭 이동·영어 모드)

## 성공 기준
- 타인 프로필에서 나와 겹치는 나라가 있으면 한 줄 표시(없으면 아무것도 없음)
- 나라별 화면에서 그 나라를 다녀온 다른 유저가 칩으로 노출·탭 시 프로필 이동
- 소셜 피드 상단부에 추천 메이트 카드 1개(추천 있을 때만), 기존 피드·광고 회귀 없음
