# 피드 사진 프레임 v2 — 비율 확장·색 팔레트·마지막 선택 기억 (2026-09-06)

v1 설계(`2026-09-06-feed-photo-frame-design.md`)의 확장. v1은 비율 3종(원본/4:5/1:1)·색 2종(검정/흰)이었다.

## 배경

- 폰 세로 사진(3:4)은 4:5·1:1보다 길어서 **좌우 띠만** 생겼다. 위아래 띠를 보려면 3:4보다 긴 프레임이 필요하다.
- 팀원 피드백: 검정·흰 외에 여러 색이 있으면 좋겠다.
- "간편하게 적용": 매번 고르지 않도록 마지막 선택을 기억해 새 글의 기본값으로 쓴다.

## 결정 사항

| 항목 | 결정 |
|---|---|
| 비율 | 원본 · 1:1 · 4:5 · 3:4 · 2:3 · 9:16 · 4:3 · 16:9 (이 순서) |
| 색 | 준비된 10색 고정 팔레트 (사진 색 추출·자유 피커 없음) |
| 마지막 선택 기억 | 설정 스토어에 **로컬 persist만**(서버 백업 제외), 새 글 기본값. 수정 모드는 그 글의 값 우선 |
| UI | 비율 칩 가로 스크롤 한 줄(모양 아이콘+라벨), 색 스와치 가로 스크롤 한 줄(원형). 원본이면 색 줄 흐림·비활성 |
| 범위 밖 | 상세 화면 코드 변경 없음(유틸이 새 비율·색을 처리), 소셜 카드·블로그·앨범·서버 |

## 1. 유틸 — `src/utils/photoFrame.ts`

```ts
export type PhotoFrameRatio = 'original' | '1:1' | '4:5' | '3:4' | '2:3' | '9:16' | '4:3' | '16:9';
export type PhotoFrameFill =
  | 'black' | 'white' | 'cream' | 'gray' | 'charcoal'
  | 'navy' | 'lavender' | 'pink' | 'sky' | 'mint';

export const PHOTO_FRAME_RATIOS: readonly PhotoFrameRatio[] =
  ['original', '1:1', '4:5', '3:4', '2:3', '9:16', '4:3', '16:9'];
export const PHOTO_FRAME_FILLS: readonly PhotoFrameFill[] =
  ['black', 'white', 'cream', 'gray', 'charcoal', 'navy', 'lavender', 'pink', 'sky', 'mint'];
```

높이/폭 배수(`RATIO_MULT`): `1:1`→1, `4:5`→5/4, `3:4`→4/3, `2:3`→3/2, `9:16`→16/9, `4:3`→3/4, `16:9`→9/16.

채움 hex(`FILL_HEX`):

| 키 | hex | 이름(ko/en) |
|---|---|---|
| black | #000000 | 검정 / Black |
| white | #FFFFFF | 흰색 / White |
| cream | #F5EFE6 | 크림 / Cream |
| gray | #D9D9DE | 연회색 / Light gray |
| charcoal | #2E2E3B | 진회색 / Charcoal |
| navy | #1B2A4A | 네이비 / Navy |
| lavender | #C9B8F0 | 라벤더 / Lavender |
| pink | #F4C7D4 | 연분홍 / Blush |
| sky | #BFDCF2 | 하늘 / Sky |
| mint | #C4EBDD | 민트 / Mint |

새 함수:
```ts
/** 비율 칩의 모양 아이콘용 폭/높이 비. 원본은 null. */
export function frameRatioAspect(ratio: PhotoFrameRatio): number | null;
```
`isFramed`·`frameHeight`·`frameFillColor`·`normalizePhotoFrame`·`serializePhotoFrame`·`DEFAULT_PHOTO_FRAME`은 시그니처 유지.
`normalizePhotoFrame`은 목록 기반이라 새 키를 자동 수용하고, v1에 저장된 `black`/`white`도 그대로 유효하다.

검증(`photoFrame.verify.ts`) 추가 케이스: 비율 7종의 폭 400 높이(400·500·533·600·711·300·225), 색 10종 hex,
`frameRatioAspect`(1:1→1, 4:5→0.8, 16:9→1.777…, original→null), 모르는 색 `'red'`→black, 목록 순서.

## 2. 설정 스토어 — `src/store/settingsStore.tsx`

- 상태 `lastPhotoFrame: PhotoFrame | null`(기본 null), `setLastPhotoFrame(f: PhotoFrame | null)`.
- `SettingsPersistPayload`에 `lastPhotoFrame?: PhotoFrame | null`(과거 저장본엔 없음 → optional).
- hydrate: `setLastPhotoFrame(p.lastPhotoFrame ? normalizePhotoFrame(p.lastPhotoFrame) : null)`.
- persist 스냅샷 객체와 그 의존성 배열에 추가.
- `resetSettings`(계정 전환)에서 `null`로.
- **서버 백업(`exportSettingsBackup`/`applySettingsBackup`)에는 넣지 않는다** — 기기 취향값이고 기록 자체에 프레임이 저장되므로 기기 간 복원 가치가 낮다. `lastImportAt`처럼 주석으로 이유를 남긴다.
- 컨텍스트 타입·Provider value에 노출.

## 3. 작성 화면 — `src/screens/NewRecordScreen.tsx`

- `const { homeCountryCode, isPremium, lastPhotoFrame, setLastPhotoFrame } = useSettings();`
- 초기 상태: 수정 모드면 `normalizePhotoFrame(editRecord.photoFrame)`(옛 글은 원본 유지), 신규면 `lastPhotoFrame ?? { ...DEFAULT_PHOTO_FRAME }`.
- 저장 성공 경로(add·update 모두)에서 `setLastPhotoFrame(photoFrame)` — 원본을 골랐어도 기억한다(다음 글도 원본으로 시작).
- 사진 0장이면 프레임은 저장 객체에 `undefined`(기존 `serializePhotoFrame` 그대로).

## 4. 작성 페이저 — `src/components/record/PhotoPagerSection.tsx`

- 비율 줄: `ScrollView horizontal`(indicator 숨김, `contentContainerStyle` gap 6, paddingHorizontal 16). 칩은 `flex:1` 제거(내용 폭).
  칩 내부: 모양 아이콘(폭 16 고정, `aspectRatio = frameRatioAspect(r)`, 테두리 1.5, 모서리 2. 원본은 아이콘 없이 라벨만) + 라벨(`원본` i18n / 비율 문자열).
- 색 줄: `ScrollView horizontal`, 원형 스와치 28px(`borderRadius 14`, 테두리 1 `#4A4A59`). 선택 시 바깥 링(패딩 2, 테두리 2 스킨 강조색). 원본이면 줄 전체 `opacity 0.4` + `disabled`.
  접근성: `accessibilityLabel = t(FILL_NAME_KEY[f])`, `accessibilityState={{ selected, disabled }}`.
- 색 이름 i18n: `newRecord.frameFills` 객체(`black`…`mint`)로 ko/en 추가. v1의 `frameFillBlack`·`frameFillWhite` 키는 제거(페이저만 썼다).
- 햅틱은 `select()`만. 라벨 `Text`에 `andFitText`.
- 프레임 버튼·`bleed`·페이저 높이 로직은 v1 그대로.

## 5. 상세 화면

변경 없음. `frameHeight`가 새 비율을 계산하고 `frameFillColor`가 새 색을 준다. 16:9는 높이가 폭의 0.5625배로 가장 낮다 — 사진별 글 그라데이션(`paddingTop 28`)은 그 안에서도 문제없다.

## 6. 검증

1. `node node_modules/tsx/dist/cli.mjs src/utils/photoFrame.verify.ts` 통과.
2. `npx tsc --noEmit` 오류 0, `npm test` 전체 통과.
3. 수동: 세로 사진 + 9:16 → 위아래 띠, 가로 사진 + 4:5 → 위아래 띠, 세로 사진 + 16:9 → 좌우 큰 띠. 색 10종 전환 즉시 반영.
   새 글 진입 시 직전 선택이 미리 적용, 수정 모드는 그 글의 값. 옛 글(프레임 없음) 수정 진입 → 원본.
4. 실기기 검증 전 OTA 금지.
