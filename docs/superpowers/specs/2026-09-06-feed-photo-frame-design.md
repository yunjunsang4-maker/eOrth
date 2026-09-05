# 피드 사진 프레임·채움색 (2026-09-06)

## 배경

상세 피드 화면(`PostDetailScreen`의 `SlideImageViewerDetail`)은 사진마다 원본 비율을 읽어
폭 가득·비율대로 그린다(0.6~1.4 클램프). 그래서

- 파노라마·긴 세로 사진은 위아래가 잘리고,
- 여러 장이면 가장 큰 사진 높이에 컨테이너를 맞춰 작은 사진 위아래에 배경색이 의도 없이 비치며,
- 게시물마다 높이가 들쭉날쭉하다.

인스타그램 편집앱처럼 **글쓴이가 프레임 비율과 채움색을 골라** 사진을 `contain`으로 넣고
남는 위아래를 단색으로 채우는 기능을 넣는다.

## 결정 사항

| 항목 | 결정 |
|---|---|
| 채움 방식 | 글쓴이가 색 선택 |
| 색 팔레트 | 검정 `#000000` · 흰색 `#FFFFFF` 2색 |
| 프레임 비율 | 글쓴이가 선택: 원본 / 4:5 / 1:1 |
| 적용 단위 | 게시물 하나에 하나(사진별 아님) |
| 적용 범위 | 상세 피드 캐러셀 + 작성 화면 사진 페이저 미리보기 |
| 범위 밖 | 소셜 탭 폴라로이드 카드(1:1 크롭 유지), 여행 상세 표지, 블로그·앨범·네컷·스냅 |

## 1. 데이터

`src/store/recordStore.tsx`의 `TravelRecord`에 옵션 필드 추가:

```ts
// 피드 사진 프레임 — 게시물 단위. 없거나 ratio가 'original'이면 기존 렌더(비율대로) 유지.
// fill은 4:5·1:1일 때만 쓰이며 기본 'black'. 사진 추가·삭제·재정렬과 무관하다.
photoFrame?: { ratio: 'original' | '4:5' | '1:1'; fill: 'black' | 'white' };
```

- 옛 기록: 필드 없음 → 지금과 동일. 마이그레이션 없음.
- 서버: `posts.data` jsonb에 기록 전체가 실리므로 SQL·컬럼 변경 없음. 발행·수정 경로
  (`services/posts.ts`)는 기록 객체를 통째로 직렬화하므로 별도 매핑 코드 불필요
  (구현 시 필드가 잘려 나가는 화이트리스트가 없는지 확인한다).
- 축소본(`thumbs`)·비공개(`mediaPrivacy`)와 독립.

## 2. 공용 로직 — `src/utils/photoFrame.ts`

두 화면이 같은 계산을 쓰게 순수 함수로 뺀다.

```ts
export type PhotoFrameRatio = 'original' | '4:5' | '1:1';
export type PhotoFrameFill = 'black' | 'white';
export type PhotoFrame = { ratio: PhotoFrameRatio; fill: PhotoFrameFill };

export const DEFAULT_PHOTO_FRAME: PhotoFrame = { ratio: 'original', fill: 'black' };
export const PHOTO_FRAME_RATIOS: PhotoFrameRatio[] = ['original', '4:5', '1:1'];
export const PHOTO_FRAME_FILLS: PhotoFrameFill[] = ['black', 'white'];

/** 프레임이 실제로 적용되는가(원본이면 false). undefined 안전. */
export function isFramed(frame?: PhotoFrame | null): boolean;
/** 프레임 높이. 원본이면 null(호출자가 기존 비율 로직 사용). */
export function frameHeight(frame: PhotoFrame | undefined, width: number): number | null;
/** 채움색 hex. */
export function frameFillColor(fill: PhotoFrameFill): string;
/** 저장된 값 정규화 — 알 수 없는 값은 기본값으로(서버에서 온 옛/깨진 데이터 방어). */
export function normalizePhotoFrame(raw: unknown): PhotoFrame;
```

검증: `src/utils/photoFrame.verify.ts` (저장소 규약 `*.verify.ts`, `npm test`에 포함).
케이스: 4:5 높이 = width×1.25, 1:1 = width, original = null, undefined/깨진 값 정규화,
fill 색상 매핑.

## 3. 상세 화면 — `SlideImageViewerDetail` (`PostDetailScreen.tsx`)

- 새 prop `frame?: PhotoFrame`. 피드 분기(2130행 부근)에서만
  `frame={normalizePhotoFrame(record.photoFrame)}`을 넘긴다. 블로그 블록 호출(474행)은
  prop을 안 넘기므로 영향 없음.
- `isFramed(frame)`이면:
  - `Image.getSize` 비율 읽기와 0.6~1.4 클램프를 건너뛴다(레이아웃 애니메이션도 불필요).
  - `containerH = frameHeight(frame, slideW)`, 모든 슬라이드 높이 동일.
  - 슬라이드 박스 `backgroundColor = frameFillColor(frame.fill)`, `<Image resizeMode="contain">`.
- 아니면 기존 로직 그대로.
- 사진별 글 하단 그라데이션(`transparent → rgba(0,0,0,0.74)`)은 그대로. 흰 채움 위에서도
  검정 그라데이션 위 흰 글자라 가독성 유지.
- 하트·동행 오버레이는 컨테이너 기준이라 변경 없음.

## 4. 작성 화면 — `PhotoPagerSection.tsx`, `NewRecordScreen.tsx`

### PhotoPagerSection
- 새 props: `frame: PhotoFrame`, `onChangeFrame: (f: PhotoFrame) => void`.
- 페이저 높이: `frameHeight(frame, PAGE_W) ?? Math.round(PAGE_W * 1.05)`(원본이면 기존 크롭 미리보기).
- 프레임 모드면 각 페이지 배경을 채움색으로, `resizeMode="contain"`.
- 액션 바에 넷째 버튼 **프레임** 추가(기존 3버튼과 같은 `st.actionBtn` 스타일, 활성 시
  강조색). 누르면 액션 바 아래에 칩 두 줄 토글:
  - 비율 칩: `원본 · 4:5 · 1:1`
  - 색 칩: `검정 · 흰색` — `ratio === 'original'`이면 흐리게(opacity 0.4) + 비활성.
- 햅틱은 `utils/haptics`의 의미 함수(`select` 계열)만 사용, 직접 `Haptics.*` 금지.
- 라벨은 `andFitText` 스프레드 적용(안드로이드 한글 폰트 줄바꿈 방어).

### NewRecordScreen
- `const [photoFrame, setPhotoFrame] = useState<PhotoFrame>(() => normalizePhotoFrame(editRecord?.photoFrame))`.
- 저장 객체(1155행 부근 `photoTexts` 옆)에 `photoFrame` 포함. 단 `ratio === 'original'`이고
  fill이 기본이면 필드를 생략해 옛 글과 저장 형태를 같게 한다(불필요한 diff 방지).
- "작성 중 내용 있음" 판정은 바꾸지 않는다 — 프레임은 사진이 있어야 의미가 있고 사진이 있으면 이미 참이다.
  (QA F-2: 판정에 넣으면 사진을 전부 지운 빈 폼에서도 이탈 경고가 뜬다.)
- 폼을 통째로 비우는 초기화 경로는 없다(캘린더 밴드 적용은 사진·글을 유지) — 리셋 단계 없음.

### i18n
`ko`/`en`에 키 추가: `newRecord.actionFrame`(프레임/Frame), `newRecord.frameRatioOriginal`(원본/Original),
`newRecord.frameFillBlack`(검정/Black), `newRecord.frameFillWhite`(흰색/White). 4:5·1:1은 숫자라 번역 없음.

## 5. 오류·경계 처리

- 사진 0장: 프레임 UI를 안 보인다(빈 상태 버튼만).
- 서버에서 온 깨진 값(`ratio: '3:2'` 등): `normalizePhotoFrame`이 기본값으로 떨어뜨려 렌더가 죽지 않는다.
- 로컬 미발행 기록·수정 재발행: 필드가 기록 객체에 붙어 있으므로 기존 경로로 함께 이동.
- 안드로이드: `resizeMode="contain"`·배경색은 RN `Image` 기본 기능. 알려진 함정(RNSVG 터치삼킴,
  refreshControl 래퍼, BlurView) 해당 없음.

## 6. 검증

1. `npx tsc --noEmit` 통과.
2. `npm test`(verify 파일) 통과 — `photoFrame.verify.ts` 신규.
3. 수동: 새 글에서 4:5 흰 선택 → 미리보기 높이·흰 띠 확인 → 저장 → 상세에서 같은 모양.
   옛 글 열기 → 변화 없음. 수정 모드 진입 → 선택값 복원. 여러 장 혼합 비율 → 높이 고정·점프 없음.
4. 실기기 검증은 별도(iOS·Android 각 1회) — 통과 전 OTA 금지 관행 유지.

## 7. 구현 순서

1. `utils/photoFrame.ts` + verify.
2. `recordStore` 타입.
3. `SlideImageViewerDetail` 렌더.
4. `PhotoPagerSection` UI + i18n.
5. `NewRecordScreen` 상태·저장·초기화.
6. tsc·npm test·수동 확인.
