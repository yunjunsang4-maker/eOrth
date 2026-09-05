# 피드 사진 프레임·채움색 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 피드 게시물의 글쓴이가 사진 프레임 비율(원본/4:5/1:1)과 채움색(검정/흰)을 골라, 상세 화면과 작성 미리보기에서 사진을 `contain`으로 넣고 남는 위아래를 단색으로 채운다.

**Architecture:** 순수 유틸 `src/utils/photoFrame.ts`가 비율·색·정규화를 담당하고 두 화면(상세 `SlideImageViewerDetail`, 작성 `PhotoPagerSection`)이 같은 함수로 높이를 계산한다. 기록에는 게시물 단위 옵션 필드 `photoFrame` 하나만 추가하며, 없거나 원본이면 기존 렌더가 그대로 유지된다. 서버는 `posts.data` jsonb에 기록 전체를 담으므로 스키마 변경이 없다.

**Tech Stack:** React Native(Expo SDK 54, 새 아키텍처), TypeScript, react-i18next, 저장소 자체 검증 스크립트(`*.verify.ts`, `tsx`로 실행).

**Spec:** `docs/superpowers/specs/2026-09-06-feed-photo-frame-design.md`

## Global Constraints

- 결과·주석·커밋 메시지는 모두 한글로 쓴다.
- 지시한 파일만 수정한다. 커밋은 **파일 단위 스테이징**(`git add <파일>`), `git add -A` 금지 — 작업 트리에 사용자 WIP가 상시 있다.
- 검증은 jest/vitest가 아니라 `*.verify.ts` 스크립트다. 실행: `node node_modules/tsx/dist/cli.mjs <파일>`. **파이프 금지**(종료코드가 바뀐다).
- 타입 검사: `npx tsc --noEmit`.
- 햅틱은 `src/utils/haptics`의 의미 함수(`select`, `tap` 등)만 사용. 직접 `expo-haptics` 호출 금지.
- 안드로이드 한글 폰트 줄바꿈 방어: 고정폭 라벨 `Text`에는 `{...andFitText}` 스프레드.
- 채움색 hex: 검정 `#000000`, 흰색 `#FFFFFF`.
- 프레임 비율 값: `'original' | '4:5' | '1:1'`, 채움: `'black' | 'white'`. 기본 `{ ratio: 'original', fill: 'black' }`.
- 범위 밖(손대지 않음): `SocialScreen.tsx` 폴라로이드 카드, `TripDetailScreen.tsx`, 블로그·앨범·네컷·스냅 렌더, `supabase/`.
- 커밋 메시지 끝에 다음 두 줄을 붙인다:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01DamVNVYz2Zur3W5ET5KLHg
  ```

---

## 파일 구조

| 파일 | 역할 |
|---|---|
| `src/utils/photoFrame.ts` (신규) | 타입·상수·`isFramed`·`frameHeight`·`frameFillColor`·`normalizePhotoFrame` 순수 함수 |
| `src/utils/photoFrame.verify.ts` (신규) | 위 함수 검증 스크립트 |
| `src/store/recordStore.tsx` | `TravelRecord.photoFrame?` 필드 |
| `src/i18n/locales/ko.ts`, `en.ts` | `newRecord.actionFrame` 등 4개 키 |
| `src/screens/PostDetailScreen.tsx` | `SlideImageViewerDetail`에 `frame` prop, 피드 분기에서 전달 |
| `src/components/record/PhotoPagerSection.tsx` | 프레임 버튼 + 칩, 미리보기 높이·채움 |
| `src/screens/NewRecordScreen.tsx` | `photoFrame` 상태·저장·이탈 판정 |

---

### Task 1: 공용 유틸 `photoFrame.ts` + 검증

**Files:**
- Create: `src/utils/photoFrame.ts`
- Create: `src/utils/photoFrame.verify.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PhotoFrameRatio = 'original' | '4:5' | '1:1';
  export type PhotoFrameFill = 'black' | 'white';
  export type PhotoFrame = { ratio: PhotoFrameRatio; fill: PhotoFrameFill };
  export const DEFAULT_PHOTO_FRAME: PhotoFrame;
  export const PHOTO_FRAME_RATIOS: readonly PhotoFrameRatio[];
  export const PHOTO_FRAME_FILLS: readonly PhotoFrameFill[];
  export function isFramed(frame?: PhotoFrame | null): boolean;
  export function frameHeight(frame: PhotoFrame | null | undefined, width: number): number | null;
  export function frameFillColor(fill: PhotoFrameFill): string;
  export function normalizePhotoFrame(raw: unknown): PhotoFrame;
  export function serializePhotoFrame(frame: PhotoFrame): PhotoFrame | undefined;
  ```

- [ ] **Step 1: 실패하는 검증 파일 작성**

`src/utils/photoFrame.verify.ts`:

```ts
/**
 * photoFrame 검증 — node node_modules/tsx/dist/cli.mjs src/utils/photoFrame.verify.ts
 */
import {
  DEFAULT_PHOTO_FRAME, PHOTO_FRAME_RATIOS, PHOTO_FRAME_FILLS,
  isFramed, frameHeight, frameFillColor, normalizePhotoFrame, serializePhotoFrame,
} from './photoFrame';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// 상수 — 작성 화면 칩 순서가 이 배열을 그대로 쓴다
eq(PHOTO_FRAME_RATIOS, ['original', '4:5', '1:1'], '비율 목록 순서: 원본 → 4:5 → 1:1');
eq(PHOTO_FRAME_FILLS, ['black', 'white'], '채움 목록 순서: 검정 → 흰색');
eq(DEFAULT_PHOTO_FRAME, { ratio: 'original', fill: 'black' }, '기본값은 원본·검정');

// isFramed — 원본이면 프레임 미적용(기존 렌더 유지)
eq(isFramed(undefined), false, 'undefined → 미적용');
eq(isFramed(null), false, 'null → 미적용');
eq(isFramed({ ratio: 'original', fill: 'white' }), false, '원본이면 색이 있어도 미적용');
eq(isFramed({ ratio: '4:5', fill: 'black' }), true, '4:5 → 적용');
eq(isFramed({ ratio: '1:1', fill: 'black' }), true, '1:1 → 적용');

// frameHeight — 폭 400 기준. 정수여야 레이아웃이 흔들리지 않는다
eq(frameHeight({ ratio: '4:5', fill: 'black' }, 400), 500, '4:5: 높이 = 폭 × 1.25');
eq(frameHeight({ ratio: '1:1', fill: 'black' }, 400), 400, '1:1: 높이 = 폭');
eq(frameHeight({ ratio: '4:5', fill: 'black' }, 393), 491, '4:5 소수 폭은 반올림(393×1.25=491.25→491)');
eq(frameHeight({ ratio: 'original', fill: 'black' }, 400), null, '원본 → null(호출자가 기존 비율 로직)');
eq(frameHeight(undefined, 400), null, 'undefined → null');

// 채움색
eq(frameFillColor('black'), '#000000', '검정 hex');
eq(frameFillColor('white'), '#FFFFFF', '흰색 hex');

// normalize — 서버에서 온 옛/깨진 값 방어. 알 수 없는 값은 항목별로 기본값
eq(normalizePhotoFrame(undefined), { ratio: 'original', fill: 'black' }, '필드 없음(옛 글) → 기본값');
eq(normalizePhotoFrame(null), { ratio: 'original', fill: 'black' }, 'null → 기본값');
eq(normalizePhotoFrame({ ratio: '4:5', fill: 'white' }), { ratio: '4:5', fill: 'white' }, '정상값 그대로');
eq(normalizePhotoFrame({ ratio: '3:2', fill: 'white' }), { ratio: 'original', fill: 'white' }, '모르는 비율 → 원본, 색은 유지');
eq(normalizePhotoFrame({ ratio: '1:1', fill: 'red' }), { ratio: '1:1', fill: 'black' }, '모르는 색 → 검정, 비율은 유지');
eq(normalizePhotoFrame({ ratio: '1:1' }), { ratio: '1:1', fill: 'black' }, '색 누락 → 검정');
eq(normalizePhotoFrame('4:5'), { ratio: 'original', fill: 'black' }, '객체가 아니면 기본값');

// serialize — 기본값이면 필드 생략(옛 글과 저장 형태 동일), 아니면 그대로
eq(serializePhotoFrame({ ratio: 'original', fill: 'black' }), undefined, '기본값 → undefined(필드 생략)');
eq(serializePhotoFrame({ ratio: 'original', fill: 'white' }), undefined, '원본이면 색이 바뀌어도 생략(렌더에 영향 없음)');
eq(serializePhotoFrame({ ratio: '4:5', fill: 'black' }), { ratio: '4:5', fill: 'black' }, '4:5 검정 → 저장');
eq(serializePhotoFrame({ ratio: '1:1', fill: 'white' }), { ratio: '1:1', fill: 'white' }, '1:1 흰 → 저장');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
```

- [ ] **Step 2: 실패 확인**

Run: `node node_modules/tsx/dist/cli.mjs src/utils/photoFrame.verify.ts`
Expected: `Cannot find module './photoFrame'` 류의 오류로 종료코드 1.

- [ ] **Step 3: 구현**

`src/utils/photoFrame.ts`:

```ts
// 피드 사진 프레임 — 게시물 단위로 글쓴이가 고르는 비율·채움색.
// 상세(SlideImageViewerDetail)와 작성 미리보기(PhotoPagerSection)가 이 함수로 같은 높이를
// 계산해야 두 화면이 어긋나지 않는다. 원본('original')이면 프레임을 안 쓰고 기존
// 비율대로 렌더가 유지된다(옛 글 호환).

export type PhotoFrameRatio = 'original' | '4:5' | '1:1';
export type PhotoFrameFill = 'black' | 'white';
export type PhotoFrame = { ratio: PhotoFrameRatio; fill: PhotoFrameFill };

export const PHOTO_FRAME_RATIOS: readonly PhotoFrameRatio[] = ['original', '4:5', '1:1'];
export const PHOTO_FRAME_FILLS: readonly PhotoFrameFill[] = ['black', 'white'];
export const DEFAULT_PHOTO_FRAME: PhotoFrame = { ratio: 'original', fill: 'black' };

// 높이/폭 배수. 원본은 없음.
const RATIO_MULT: Record<Exclude<PhotoFrameRatio, 'original'>, number> = { '4:5': 5 / 4, '1:1': 1 };
const FILL_HEX: Record<PhotoFrameFill, string> = { black: '#000000', white: '#FFFFFF' };

/** 프레임이 실제로 적용되는가. 원본·undefined·null은 false. */
export function isFramed(frame?: PhotoFrame | null): boolean {
  return !!frame && frame.ratio !== 'original';
}

/** 프레임 높이(px, 반올림). 원본이면 null — 호출자가 기존 비율 로직을 쓴다. */
export function frameHeight(frame: PhotoFrame | null | undefined, width: number): number | null {
  if (!frame || frame.ratio === 'original') return null;
  return Math.round(width * RATIO_MULT[frame.ratio]);
}

/** 채움색 hex. */
export function frameFillColor(fill: PhotoFrameFill): string {
  return FILL_HEX[fill];
}

/** 저장된 값 정규화 — 옛 글(필드 없음)·서버에서 온 깨진 값을 항목별 기본값으로 떨어뜨린다. */
export function normalizePhotoFrame(raw: unknown): PhotoFrame {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PHOTO_FRAME };
  const r = (raw as { ratio?: unknown }).ratio;
  const f = (raw as { fill?: unknown }).fill;
  return {
    ratio: PHOTO_FRAME_RATIOS.includes(r as PhotoFrameRatio) ? (r as PhotoFrameRatio) : DEFAULT_PHOTO_FRAME.ratio,
    fill: PHOTO_FRAME_FILLS.includes(f as PhotoFrameFill) ? (f as PhotoFrameFill) : DEFAULT_PHOTO_FRAME.fill,
  };
}

/** 저장용 — 원본이면 필드를 생략해 옛 글과 저장 형태를 같게 한다(불필요한 diff 방지). */
export function serializePhotoFrame(frame: PhotoFrame): PhotoFrame | undefined {
  return isFramed(frame) ? { ratio: frame.ratio, fill: frame.fill } : undefined;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node node_modules/tsx/dist/cli.mjs src/utils/photoFrame.verify.ts`
Expected: 모든 줄 `✓`, 마지막 `✅ 모든 검증 통과`, 종료코드 0.

- [ ] **Step 5: 커밋**

```bash
git add src/utils/photoFrame.ts src/utils/photoFrame.verify.ts
git commit -m "feat(photo-frame): 피드 사진 프레임 비율·채움색 순수 유틸 + 검증"
```
(커밋 메시지 끝에 Global Constraints의 두 줄 추가)

---

### Task 2: 기록 타입 필드 + i18n 키

**Files:**
- Modify: `src/store/recordStore.tsx:107` (`photoTexts?: string[];` 바로 아래)
- Modify: `src/i18n/locales/ko.ts:1038` (`actionDelete: '삭제',` 바로 아래)
- Modify: `src/i18n/locales/en.ts:1023` (`actionDelete: 'Delete',` 바로 아래)

**Interfaces:**
- Consumes: Task 1의 `PhotoFrame` 타입.
- Produces: `TravelRecord.photoFrame?: PhotoFrame`; i18n 키 `newRecord.actionFrame`, `newRecord.frameRatioOriginal`, `newRecord.frameFillBlack`, `newRecord.frameFillWhite`.

- [ ] **Step 1: 타입 필드 추가**

`src/store/recordStore.tsx` 상단 import 근처에 추가:

```ts
import type { PhotoFrame } from '../utils/photoFrame';
```

`photoTexts?: string[];` 줄(107행) 바로 아래에 추가:

```ts
  // 피드 사진 프레임(2026-09-06) — 게시물 단위. 없거나 ratio가 'original'이면 기존 렌더(비율대로).
  // fill은 4:5·1:1일 때만 쓰인다. 사진 추가·삭제·재정렬과 무관. utils/photoFrame 참조.
  photoFrame?: PhotoFrame;
```

- [ ] **Step 2: i18n 키 추가**

`src/i18n/locales/ko.ts`의 `actionDelete: '삭제',` 바로 아래:

```ts
    actionFrame: '프레임',
    frameRatioOriginal: '원본',
    frameFillBlack: '검정',
    frameFillWhite: '흰색',
```

`src/i18n/locales/en.ts`의 `actionDelete: 'Delete',` 바로 아래:

```ts
    actionFrame: 'Frame',
    frameRatioOriginal: 'Original',
    frameFillBlack: 'Black',
    frameFillWhite: 'White',
```

- [ ] **Step 3: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 오류 0. (i18n 타입이 `ko.ts`에서 파생되므로 en.ts 키 누락 시 여기서 잡힌다.)

- [ ] **Step 4: 커밋**

```bash
git add src/store/recordStore.tsx src/i18n/locales/ko.ts src/i18n/locales/en.ts
git commit -m "feat(photo-frame): TravelRecord.photoFrame 필드·작성 화면 i18n 키"
```

---

### Task 3: 상세 화면 캐러셀에 프레임 적용

**Files:**
- Modify: `src/screens/PostDetailScreen.tsx:229-260` (`SlideImageViewerDetail` 시그니처·비율 로직), `:270-285` (슬라이드 렌더), `:2128-2135` (피드 분기 호출)

**Interfaces:**
- Consumes: Task 1 `PhotoFrame`, `isFramed`, `frameHeight`, `frameFillColor`, `normalizePhotoFrame`; Task 2 `record.photoFrame`.
- Produces: `SlideImageViewerDetail` prop `frame?: PhotoFrame` (옵션. 블로그 블록 호출 474행은 넘기지 않아 기존 동작).

- [ ] **Step 1: import 추가**

`src/screens/PostDetailScreen.tsx` import 블록(`import { andFitText } from '../utils/fitText';` 56행 근처) 아래:

```ts
import { isFramed, frameHeight, frameFillColor, normalizePhotoFrame, type PhotoFrame } from '../utils/photoFrame';
```

- [ ] **Step 2: 컴포넌트 시그니처와 높이 로직 수정**

현재(230행):

```tsx
const SlideImageViewerDetail = ({ items, onImagePress, captions, fullBleed }: { items: { uri: string; caption?: string }[]; onImagePress?: (uris: string[], index: number) => void; captions?: string[]; fullBleed?: boolean }) => {
```

변경:

```tsx
// frame: 피드 프레임(게시물 단위). 있으면 높이를 비율로 고정하고 사진을 contain + 채움색으로 넣는다.
// 없으면(블로그 블록·옛 글) 사진마다 원본 비율을 읽어 그리는 기존 동작.
const SlideImageViewerDetail = ({ items, onImagePress, captions, fullBleed, frame }: { items: { uri: string; caption?: string }[]; onImagePress?: (uris: string[], index: number) => void; captions?: string[]; fullBleed?: boolean; frame?: PhotoFrame }) => {
```

`useEffect`(비율 읽기) 첫 줄을 다음처럼 바꿔 프레임 모드에서는 `Image.getSize`를 건너뛴다:

현재:
```ts
  useEffect(() => {
    let alive = true;
    if (!items.length) return;
```
변경:
```ts
  const framed = isFramed(frame);
  useEffect(() => {
    let alive = true;
    // 프레임 모드는 높이가 비율로 고정이라 원본 비율을 읽을 필요가 없다
    if (!items.length || framed) return;
```

`useEffect` 의존성 `[items]` → `[items, framed]`.

`containerH` 계산 현재:
```ts
  const heightFor = (i: number) => slideW * Math.min(Math.max(ratios[i] ?? 0.75, 0.6), 1.4);
  const containerH = Math.max(slideW * 0.75, ...items.map((_, i) => heightFor(i)));
```
변경:
```ts
  const fixedH = frameHeight(frame, slideW); // 프레임 모드면 모든 슬라이드 동일 높이
  const heightFor = (i: number) => fixedH ?? slideW * Math.min(Math.max(ratios[i] ?? 0.75, 0.6), 1.4);
  const containerH = fixedH ?? Math.max(slideW * 0.75, ...items.map((_, i) => heightFor(i)));
  const fillColor = framed && frame ? frameFillColor(frame.fill) : undefined;
```

- [ ] **Step 3: 슬라이드 렌더에 채움색·contain 적용**

현재(280-281행):
```tsx
            <View style={{ width: slideW, height: heightFor(i), borderRadius: imgRadius, overflow: 'hidden' }}>
              <Image source={{ uri: item.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
```
변경:
```tsx
            <View style={{ width: slideW, height: heightFor(i), borderRadius: imgRadius, overflow: 'hidden', backgroundColor: fillColor }}>
              <Image source={{ uri: item.uri }} style={{ width: '100%', height: '100%' }} resizeMode={framed ? 'contain' : 'cover'} />
```

- [ ] **Step 4: 피드 분기에서 prop 전달**

현재(2130-2135행):
```tsx
                      <SlideImageViewerDetail
                        items={record.medias.map((uri) => ({ uri }))}
                        onImagePress={(uris, i) => handleMediaTap(() => openFullImage(uris, i))}
                        captions={record.photoTexts}
                        fullBleed
                      />
```
변경:
```tsx
                      <SlideImageViewerDetail
                        items={record.medias.map((uri) => ({ uri }))}
                        onImagePress={(uris, i) => handleMediaTap(() => openFullImage(uris, i))}
                        captions={record.photoTexts}
                        fullBleed
                        frame={normalizePhotoFrame(record.photoFrame)}
                      />
```

- [ ] **Step 5: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 오류 0.

- [ ] **Step 6: 커밋**

```bash
git add src/screens/PostDetailScreen.tsx
git commit -m "feat(photo-frame): 상세 피드 캐러셀 — 프레임 비율 고정·contain·채움색"
```

---

### Task 4: 작성 화면 사진 페이저 — 프레임 버튼·칩·미리보기

**Files:**
- Modify: `src/components/record/PhotoPagerSection.tsx` (props, 페이저 높이·이미지, 액션 바, 칩 행, 스타일)

**Interfaces:**
- Consumes: Task 1 전부, Task 2 i18n 키.
- Produces: props `frame: PhotoFrame`, `onChangeFrame: (f: PhotoFrame) => void` (필수). Task 5가 전달한다.

- [ ] **Step 1: import·props 추가**

import 블록에 추가:
```ts
import { select } from '../../utils/haptics';
import {
  PHOTO_FRAME_RATIOS, PHOTO_FRAME_FILLS, isFramed, frameHeight, frameFillColor,
  type PhotoFrame, type PhotoFrameRatio, type PhotoFrameFill,
} from '../../utils/photoFrame';
```

파일 첫 주석 블록에 한 줄 추가:
```ts
// 프레임(비율·채움색)은 게시물 단위 — 액션 바 넷째 버튼으로 칩을 펼쳐 고른다(2026-09-06).
```

props 시그니처 현재:
```ts
export default function PhotoPagerSection({
  medias, photoTexts, representativePhoto, onChangeText, onAddPress,
  onSetRepresentative, onRemove, onPrivacyPress, privacyMarks,
}: {
  medias: string[];
  photoTexts: string[];
  representativePhoto: string | null;
  onChangeText: (index: number, text: string) => void;
  onAddPress: () => void;
  onSetRepresentative: (index: number) => void;
  onRemove: (index: number) => void;
  onPrivacyPress: (index: number) => void;
  privacyMarks?: boolean[];
}) {
```
변경:
```ts
export default function PhotoPagerSection({
  medias, photoTexts, representativePhoto, onChangeText, onAddPress,
  onSetRepresentative, onRemove, onPrivacyPress, privacyMarks, frame, onChangeFrame,
}: {
  medias: string[];
  photoTexts: string[];
  representativePhoto: string | null;
  onChangeText: (index: number, text: string) => void;
  onAddPress: () => void;
  onSetRepresentative: (index: number) => void;
  onRemove: (index: number) => void;
  onPrivacyPress: (index: number) => void;
  privacyMarks?: boolean[];
  frame: PhotoFrame;
  onChangeFrame: (f: PhotoFrame) => void;
}) {
```

- [ ] **Step 2: 페이저 높이·이미지 렌더를 프레임에 맞춤**

현재:
```ts
  const PAGE_H = Math.round(SCREEN_W * 1.05);
  const [activeIdx, setActiveIdx] = useState(0);
```
변경(훅 순서 유지 — `useState`는 조기 return 위):
```ts
  // 프레임 모드면 상세와 같은 높이(utils/photoFrame), 원본이면 기존 1.05:1 크롭 미리보기
  const PAGE_H = frameHeight(frame, PAGE_W) ?? Math.round(SCREEN_W * 1.05);
  const framed = isFramed(frame);
  const fillColor = framed ? frameFillColor(frame.fill) : undefined;
  const [activeIdx, setActiveIdx] = useState(0);
  const [frameOpen, setFrameOpen] = useState(false); // 프레임 칩 행 펼침
```

이미지 렌더 현재:
```tsx
            <Image key={`${uri}-${i}`} source={{ uri }} style={{ width: PAGE_W, height: PAGE_H }} resizeMode="cover" />
```
변경:
```tsx
            <Image key={`${uri}-${i}`} source={{ uri }} style={{ width: PAGE_W, height: PAGE_H, backgroundColor: fillColor }} resizeMode={framed ? 'contain' : 'cover'} />
```

- [ ] **Step 3: 액션 바에 프레임 버튼 추가**

삭제 버튼 `</TouchableOpacity>` 바로 **앞**(비공개 버튼 다음)에 삽입:

```tsx
        {/* 프레임 버튼 — 비율·채움색 칩 행을 토글. 프레임이 적용돼 있으면 활성 스타일 */}
        <TouchableOpacity
          style={[st.actionBtn, (framed || frameOpen) && [st.actionBtnActive, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.accent }]]}
          onPress={() => { select(); setFrameOpen((v) => !v); }}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={t('newRecord.actionFrame')}
        >
          <Text style={[st.actionBtnIcon, (framed || frameOpen) && { color: skinAccent.accent }]}>▭</Text>
          <Text style={[st.actionBtnText, (framed || frameOpen) && { color: skinAccent.accent }]} {...andFitText}>{t('newRecord.actionFrame')}</Text>
        </TouchableOpacity>
```

- [ ] **Step 4: 칩 행 추가**

액션 바 `</View>`(삭제 버튼 닫힌 뒤) 바로 **다음**, `{/* 현재 사진의 글 */}` 위에 삽입:

```tsx
      {/* 프레임 칩 — 비율 한 줄 + 채움색 한 줄. 원본이면 색 칩은 흐리게·비활성(채움이 없으니 의미 없음) */}
      {frameOpen && (
        <View style={st.frameRows}>
          <View style={st.frameRow}>
            {PHOTO_FRAME_RATIOS.map((r: PhotoFrameRatio) => {
              const on = frame.ratio === r;
              return (
                <TouchableOpacity
                  key={r}
                  style={[st.chip, on && { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.accent }]}
                  onPress={() => { select(); onChangeFrame({ ...frame, ratio: r }); }}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[st.chipText, on && { color: skinAccent.accent }]} {...andFitText}>
                    {r === 'original' ? t('newRecord.frameRatioOriginal') : r}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={[st.frameRow, !framed && { opacity: 0.4 }]}>
            {PHOTO_FRAME_FILLS.map((f: PhotoFrameFill) => {
              const on = frame.fill === f;
              return (
                <TouchableOpacity
                  key={f}
                  style={[st.chip, on && { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.accent }]}
                  onPress={() => { select(); onChangeFrame({ ...frame, fill: f }); }}
                  disabled={!framed}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: !framed }}
                >
                  <View style={[st.chipSwatch, { backgroundColor: frameFillColor(f) }]} />
                  <Text style={[st.chipText, on && { color: skinAccent.accent }]} {...andFitText}>
                    {f === 'black' ? t('newRecord.frameFillBlack') : t('newRecord.frameFillWhite')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
```

- [ ] **Step 5: 스타일 추가**

`st` StyleSheet의 `captionBox:` 줄 바로 위에 추가:

```ts
  // 프레임 칩 행 — 액션 바와 같은 좌우 여백, 버튼과 같은 어두운 바탕
  frameRows: { marginHorizontal: 16, marginTop: 8, gap: 6 },
  frameRow: { flexDirection: 'row', gap: 6 },
  chip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 7, borderRadius: 10,
    backgroundColor: '#17131f', borderWidth: 1, borderColor: '#2E2E3B',
  },
  chipText: { fontSize: 12, color: '#A1A1B0', fontWeight: '600' },
  chipSwatch: { width: 12, height: 12, borderRadius: 3, borderWidth: 1, borderColor: '#4A4A59' },
```

- [ ] **Step 6: 타입 검사**

Run: `npx tsc --noEmit`
Expected: **`NewRecordScreen.tsx`에서 `frame`·`onChangeFrame` 누락 오류 1건만** 남는다(Task 5에서 해소). 그 외 오류 0.

- [ ] **Step 7: 커밋**

```bash
git add src/components/record/PhotoPagerSection.tsx
git commit -m "feat(photo-frame): 작성 사진 페이저 — 프레임 버튼·비율/색 칩·미리보기 채움"
```

---

### Task 5: 작성 화면 상태·저장 연결 + 전체 검증

**Files:**
- Modify: `src/screens/NewRecordScreen.tsx:28` (import), `:430` 근처(상태), `:1155` 근처(저장 객체), `:1230` 근처(이탈 판정), `:1360` 근처(PhotoPagerSection 호출)

**Interfaces:**
- Consumes: Task 1 `PhotoFrame`, `DEFAULT_PHOTO_FRAME`, `isFramed`, `normalizePhotoFrame`, `serializePhotoFrame`; Task 4 props.

- [ ] **Step 1: import**

`import { useRecords, type Visibility } from '../store/recordStore';`(28행) 아래:

```ts
import { isFramed, normalizePhotoFrame, serializePhotoFrame, type PhotoFrame } from '../utils/photoFrame';
```

- [ ] **Step 2: 상태 추가**

`photoTexts` useState 블록이 끝나는 곳(약 440행 `});` 다음) 아래에 추가:

```ts
  // 피드 사진 프레임(비율·채움색) — 게시물 단위. 수정 모드는 기존 값 복원, 옛 글·신규는 원본·검정.
  const [photoFrame, setPhotoFrame] = useState<PhotoFrame>(() => normalizePhotoFrame(editRecord?.photoFrame));
```

- [ ] **Step 3: 저장 객체에 포함**

저장 객체의 `photoTexts,` 줄(1155행) 바로 아래:

```ts
        photoFrame: serializePhotoFrame(photoFrame), // 원본이면 undefined → 옛 글과 같은 형태
```

- [ ] **Step 4: 이탈 판정에 포함**

현재(1229-1232행):
```ts
  const hasInput =
    selectedCountries.length > 0 || medias.length > 0 || photoTexts.some(text => text.trim().length > 0) ||
    rating > 0 || selectedCompanions.length > 0 || keywords.length > 0 ||
    !!budget || !!weather || !!flightType;
```
변경:
```ts
  const hasInput =
    selectedCountries.length > 0 || medias.length > 0 || photoTexts.some(text => text.trim().length > 0) ||
    rating > 0 || selectedCompanions.length > 0 || keywords.length > 0 ||
    !!budget || !!weather || !!flightType || isFramed(photoFrame);
```

- [ ] **Step 5: PhotoPagerSection에 전달**

`privacyMarks={...}` 줄 바로 아래:

```tsx
              frame={photoFrame}
              onChangeFrame={setPhotoFrame}
```

- [ ] **Step 6: 타입 검사·검증 전체**

Run: `npx tsc --noEmit`
Expected: 오류 0.

Run: `npm test > "%TEMP%\eorth-test.log" 2>&1` 후 로그 파일을 읽는다(파이프 금지).
Expected: `photoFrame.verify.ts` 통과 포함 전체 통과. 단 `scripts/event-config.verify.mjs`의 "Supabase 프로젝트 일치" 1건은 로컬 `.env` 차이로 기존부터 실패 — 코드 결함이 아니며 보고서에 "기존 실패 1건 그대로"로 적는다.

- [ ] **Step 7: 저장 형태 확인(수동 검토)**

`src/services/posts.ts:95-105`를 읽어 발행 시 기록 복사본에서 `uploadedMediaUrls`만 지우고 나머지 필드가 그대로 `data`에 실리는지 확인한다. 필드 화이트리스트가 없으므로 `photoFrame`은 추가 코드 없이 서버로 간다. 화이트리스트가 발견되면 그 목록에 `photoFrame`을 추가한다.

- [ ] **Step 8: 커밋**

```bash
git add src/screens/NewRecordScreen.tsx
git commit -m "feat(photo-frame): 작성 화면 — 프레임 상태·저장·수정 복원·이탈 판정"
```

---

## 수동 확인 체크리스트(시뮬레이터·실기기)

실기기 검증 전에는 OTA를 쏘지 않는다.

1. 새 피드 글 → 사진 2장(가로 1·세로 1) → 프레임 버튼 → `4:5` + `흰색`: 미리보기 높이가 폭×1.25로 고정되고 가로 사진 위아래에 흰 띠, 세로 사진은 꽉 참.
2. `원본` 선택: 색 칩이 흐려지고 눌리지 않음, 미리보기가 기존 1.05:1 크롭으로 복귀.
3. `1:1` + `검정` 저장 → 상세 화면 캐러셀이 정사각·검정 채움·`contain`, 두 장 넘겨도 높이 변화·점프 없음, 사진별 글 그라데이션 정상.
4. 옛 글(프레임 없음) 열기: 기존과 동일하게 비율대로 렌더.
5. 3의 글을 수정 모드로 열기: 프레임 버튼 활성, 칩에 `1:1`·`검정` 선택 상태 복원.
6. 블로그 글 상세의 이미지 블록: 변화 없음.
7. 안드로이드: 위 1·3 반복(`contain`·배경색은 RN `Image` 기본 기능이라 함정 없음).
