# 피드 캐시 영속화 설계

## 목표

소셜 피드(`feedPosts`)를 기기에 영속화해, 오프라인으로 앱을 재시작해도 마지막으로 본 피드가 보이게 한다. 데이터(글·메타)만 캐시하고 이미지는 OS 캐시에 맡긴다(best-effort).

## 배경 / 현재 동작

- `feedPosts`는 recordStore의 세션 한정 state — 앱 재시작 시 빈 배열로 시작, `refreshFeed()`(hydrated 후 1회)가 서버에서 채운다.
- 오프라인이면 `refreshFeed`가 실패해 피드가 계속 비어 있고, 빈 소셜탭(예시 콘텐츠)이 노출된다.
- 오프라인 견고화(2026-07-07) 때 "피드 캐시는 남은 갭"으로 보류했던 항목.

## 설계

### 저장 (write-through)

- `refreshFeed` 성공 경로에서 `setFeedPosts(...)` 직후, 같은 배열을 AsyncStorage에 fire-and-forget 저장.
- 키: `@eorth/feedCache` (`persist.ts`의 `STORE_KEYS`에 추가).
- 형식: 기존 봉투 스키마 `{ version: SCHEMA_VERSION, updatedAt, payload: TravelRecord[] }` 재사용.
- 크기 캡: `slice(0, 100)` (fetchFeed 서버 limit과 동일 수준 — 스토리지 폭주 방지).
- 저장 실패는 무시(다음 refresh 때 재시도되는 셈).

### 복원 (mount-time hydrate)

- recordStore 마운트 시 1회 `@eorth/feedCache`를 읽어 `setFeedPosts(payload)`.
- **race 가드**: 서버 `refreshFeed`가 이미 성공해 피드를 채웠다면 캐시로 덮어쓰지 않는다 — `feedFreshRef`(refreshFeed 성공 시 true)를 확인하고, 복원도 함수형 업데이트로 `prev.length > 0`이면 prev 유지.
- 버전 불일치·파싱 실패 시 조용히 무시(캐시는 재생성 가능 데이터라 백업 불필요 — records의 `.corrupt` 보존 로직과 달리 단순 폐기).

### 계정 안전 (타인 콘텐츠 잔존 방지)

- `STORE_KEYS.feedCache` 추가 + `clearPersistedStores()`의 `multiRemove`에 포함 → 계정 전환·데이터 초기화 플로우에서 함께 삭제된다.
- `resetRecords()`에서 `setFeedPosts([])` (이미 비우고 있다면 유지 확인).

### 표시 동작

- 오프라인 재시작: 캐시된 피드가 그대로 렌더 — 빈 소셜탭 예시 콘텐츠 대신 실제 콘텐츠. 사진은 OS 이미지 캐시에 남아 있을 때만 보임.
- 온라인 재시작: 캐시가 먼저 보였다가(즉시 렌더) `refreshFeed` 성공 시 최신으로 교체 — 체감 로딩 개선 부수효과.
- 좋아요·차단·신고 필터: 렌더 파이프라인(SocialScreen)이 이미 feedPosts에 뷰어 필터를 적용하므로 캐시본에도 동일 적용됨. 좋아요 상태는 캐시 시점 값, 온라인 복귀 시 갱신.
- 스냅 '안 본 링': `viewedSnapIds`가 이미 영속이라 캐시 피드와 조합해 정상 동작.

## 파일 변경 목록

- `src/store/persist.ts` — `STORE_KEYS.feedCache` 추가, `clearPersistedStores` multiRemove에 포함.
- `src/store/recordStore.tsx` — 캐시 복원(마운트 1회, race 가드), `refreshFeed` 성공 시 저장, `resetRecords` 비움 확인.

## 검증

- `npx tsc --noEmit`.
- 수동: ① 온라인 실행→피드 로드→기내모드→앱 재시작→피드 보이는지 ② 온라인 재시작 시 캐시→최신 교체 ③ 데이터 초기화/계정 전환 후 캐시 삭제 확인.

## 비목표 (YAGNI)

- 이미지 디스크 캐시(expo-image 전환) — 별도 작업.
- 댓글(commentsByPost) 캐시 — 상세 진입 시 조회 유지.
- 좋아요·이웃신청 등 오프라인 뮤테이션 큐 — 별도 갭.
