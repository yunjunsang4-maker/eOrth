# 소셜탭 미디어 비공개 — 뷰어 식별 기반 정식 연동 설계

작성일: 2026-06-15

## 배경 / 문제

피드 기록(`NewRecordScreen`)·블로그 기록(`BlogRecordScreen`)에서 사진별 비공개 대상을 고를 수 있고, 그 값은 기록의 `mediaPrivacy: Record<number, string[]>`(미디어 index → 비공개 친구 이름 목록)로 저장된다. 그러나 **소셜탭(피드/상세) 어디에서도 이 값을 읽어 사진을 거르지 않는다.**

- `SocialScreen.tsx:1177` — `const medias = item.medias || []` (전체 사용)
- `SocialScreen.tsx:1497-1498` — 썸네일/대표를 `medias[0]` 그대로
- `PostDetailScreen.tsx:970` — `record.medias` 그대로 렌더
- 피드 필터(`SocialScreen.tsx:2007`)는 기록 단위 `visibility`(friends/public)만 확인

즉 "전체 비공개"나 친구별 비공개를 설정해도 소셜탭에 **아무 효과가 없다.**

추가 제약: `mediaPrivacy`에 저장되는 대상은 `DUMMY_FRIENDS`의 "이름"(`김민수`, `이서연`…)이며 실제 사용자/handle 엔티티와 연결돼 있지 않다. 앱에 "특정 친구로 로그인/전환" 개념이 없어 "지금 보는 사람(뷰어)"을 정하는 수단이 없다.

## 목표

소셜탭에서 비공개 설정이 실제로 동작하도록 **뷰어 식별 기반**으로 연동한다. 단일 사용자 프로토타입에서도 검증 가능하도록, 피드 상단에서 "친구로 보기"를 전환해 그 친구 시점으로 사진이 가려지는지 확인할 수 있게 한다.

## 결정 사항 (확정)

1. **뷰어 식별**: 소셜 피드 상단의 글로벌 "○○로 보기" 토글로 현재 뷰어를 정한다. 이 값이 피드 카드·썸네일·게시물 상세에 일괄 적용된다.
2. **가림 방식**: 비공개로 가려진 사진은 그 뷰어에게 **아예 제거**한다(medias에서 빼고 장수도 줄어듦). 비공개 사실 자체가 드러나지 않는다.
3. 이건 **미리보기 도구**다 — 저장된 기록 데이터는 바뀌지 않는다.

## 접근법

**채택: 공유 컨텍스트 + 순수 util**

- `RecordsProvider`(`useRecords()`)에 `currentViewer: string | null` 상태 추가. `null` = 작성자/전체공개 시점.
- 순수 함수 util `src/utils/mediaPrivacy.ts`가 기록+뷰어를 받아 "보이는 사진"을 계산. 피드·썸네일·상세가 모두 이 함수를 호출.
- 소셜 피드 상단 칩에서 `currentViewer`를 변경, 같은 값을 상세도 읽음.

(대안 B: 별도 ViewerContext — Provider 추가/배선 증가로 현재 규모엔 과함. 대안 C: 상세 로컬 상태 — 글로벌 피드 토글 결정과 불일치. 둘 다 제외.)

## 상세 설계

### 1. 뷰어 후보 / 식별

- `DUMMY_FRIENDS`(현재 `NewRecordScreen` 내부 상수)를 단일 출처 `src/constants/friends.ts`로 추출한다.
- `NewRecordScreen`, `BlogRecordScreen`, 새 뷰어 스위처가 이 상수를 공유한다.
- 스위처 옵션: `전체 보기(작성자 시점)`(= `currentViewer = null`) + 각 친구 이름. 선택값이 `currentViewer`.

### 2. 핵심 순수 함수 (`src/utils/mediaPrivacy.ts`)

```ts
// viewer=null 이면 전체 노출. 아니면 원본 medias의 각 index i에 대해
// mediaPrivacy[i]에 viewer가 '없는' 항목만 통과시킨다. 인덱스는 항상 원본 기준.
export function visibleMediaIndices(
  record: { medias?: string[]; mediaPrivacy?: Record<number, string[]> },
  viewer: string | null
): number[];

export function visibleMedias(record, viewer): string[];

// 대표사진이 가려지면 첫 번째 보이는 사진으로 폴백. 보이는 사진이 0장이면 undefined.
export function visibleRepresentative(
  record: { medias?: string[]; mediaPrivacy?: Record<number, string[]>; representativePhoto?: string },
  viewer: string | null
): string | undefined;
```

규칙:
- `viewer === null` → 필터 없음(전체).
- `mediaPrivacy`가 없거나 해당 index 항목이 없으면 그 사진은 공개.
- 대표사진(`representativePhoto`)이 가려지면 → 보이는 사진 중 첫 번째로 폴백.
- 보이는 사진 0장이면 → 이미지 없음. **게시물 자체는 노출**(비공개는 사진 단위, 게시물 단위가 아님).

### 3. 적용 지점

- `SocialScreen`:
  - 상단에 글로벌 "○○로 보기" 칩 추가(`currentViewer` 읽기/쓰기).
  - 피드 카드 미디어(`item.medias`, ~1177)를 `visibleMedias(item, currentViewer)`로 교체.
  - 썸네일/대표(~1497-1498)를 `visibleRepresentative` / `visibleMedias[0]`로 교체.
- `PostDetailScreen`:
  - 갤러리(`record.medias`, ~970)를 `visibleMedias(record, currentViewer)`로 교체.

### 4. 엣지 케이스 / 주의

- 미리보기 도구 — 저장 데이터 불변.
- 내 글에도 적용(친구 시점 미리보기의 핵심). 작성자 본인 시점(`null`)은 전부 보임.
- 전부 가려지면 게시물은 남기고 사진만 사라짐.
- 블로그(`blogBlocks`)는 사진 렌더 경로가 달라(`blocksToPhotos`) **이번 범위에선 대표사진까지만 반영**, 본문 블록 사진 필터는 후속 분리(스코프 관리).
- mediaPrivacy 인덱스는 원본 medias 기준 — 가림 후 재인덱싱하지 않는다(필터만).

### 5. 테스트

리포의 `*.verify.ts` 패턴(`src/store/dmShareLogic.verify.ts`)을 따라 `src/utils/mediaPrivacy.verify.ts`로 순수 함수 단위 검증:
- 전체공개(viewer=null) → 전부 노출
- 일부 가림 → 해당 index만 제외
- 대표사진 가림 → 첫 보이는 사진으로 폴백
- 전부 가림 → 빈 배열 + 대표 undefined
- mediaPrivacy 없음 → 전부 노출

## 범위 밖 (Non-goals)

- 실제 멀티 유저 인증/친구 엔티티 모델링
- 블로그 본문 블록 사진의 뷰어별 필터(후속)
- 저장 데이터(mediaPrivacy) 자체의 변경
