# 안드로이드 전 기종 배치 파리티 설계

2026-08-10 확정. 목표: **안드로이드 어떤 기종에서 열어도 배치가 iOS와 다르지 않게** 한다.
기준은 종전과 같다 — **iOS 화면이 정답, Android 코드만 보정**.

## 0. 출발점 — 무엇이 이미 돼 있고 무엇이 안 돼 있나

`fix/android-parity` 5커밋(ac7e76c·b15075c·5b50c77·bb43336·47a16ca)은 **이미 master에 병합**돼
있다. 폰트 폴백·줄바꿈, 컬러 그림자 iOS 전용화, 하드웨어 서피스 위 블러, 모달 인셋 통일,
RNSVG 터치 삼킴 — 즉 **플랫폼 렌더링 차이는 대부분 해소된 상태**다.

남은 공백은 **기기 크기 대응(반응형)** 하나다. 실측 결과:

| 항목 | 실측 |
|---|---|
| `Dimensions.get('window')` 모듈 최상위 상수 | **40곳 / 34개 파일** (앱 시작 시점 값으로 박제) |
| `Dimensions.addEventListener('change')` | **0곳** (크기 변화 감지 자체가 없음) |
| `useWindowDimensions` | 2개 파일뿐 (`CustomTabBar`, `FriendsScreen`) |
| 태블릿·대화면 breakpoint | **0건** |
| 320dp 초과 고정 폭 | 2건 — `NaverBlogImportScreen.tsx:595`(390), `introVisuals.tsx:301`(367) |
| 전역 `maxFontSizeMultiplier` | **없음** (`fitText.ts:11`과 카드 1곳만 1.2) |

박제된 상수는 **실행 중 창 크기가 바뀔 때만** 문제가 된다 — 폴드 접기/펼치기, 분할화면
리사이즈, 삼성 DeX. 세로 고정이라 회전은 해당 없다.

## 1. 확정 결정 4가지

| 결정 | 값 | 근거 |
|---|---|---|
| 대화면 처리 | **콘텐츠 최대 폭 고정 + 중앙 정렬** | 배치 비율이 iOS 폰과 동일해짐 |
| 최대 폭 | **480dp** | 아래 1.1 |
| 리사이즈 실시간 대응 | **폭이 스크롤 계산에 들어가거나 화면 가득인 12개 파일만** | 나머지는 clamp로 오차가 작아짐 |
| 시스템 글꼴 배율 | **상한 1.2배** | 배치 유지와 접근성의 절충, 기존 `fitText` 값과 일치 |

### 1.1 최대 폭을 430이 아닌 480으로 정한 이유

| 기기 | 폭 |
|---|---|
| 갤럭시 A 저가형 | 360dp |
| 일반 플래그십 | 411~412dp |
| iPhone 16 Pro Max | 440dp |
| **Pixel 8 Pro / 9 Pro XL** | **448dp** |
| 폴드 펼침 | ~763dp (Z Fold 5: 1812x2176 @380dpi) |
| 태블릿 | 800dp+ |

430으로 자르면 **Pixel Pro 계열 일반 폰이 레터박스**가 된다. 지금 멀쩡한 기기를 일부러 깎는
것이라 "모든 기종에서 자연스럽게"에 역행한다. 480이면 실존하는 폰은 전부 영향이 없고,
안드로이드 공식 대화면 기준점인 600dp 이상(폴드 펼침·태블릿)만 중앙 컬럼이 된다.

## 2. Stage — 단일 출처

신규 `src/utils/stage.ts`:

```ts
export const STAGE_MAX_W = 480;
export const useStageWidth = () => Math.min(useWindowDimensions().width, STAGE_MAX_W);
export const stageWidthNow = () => Math.min(Dimensions.get('window').width, STAGE_MAX_W);
```

구현에서는 두 파일로 나눈다 — `stageMath.ts`(순수 계산, RN import 없음)와 `stage.ts`(훅).
이 저장소의 `npm test`는 tsx로 파일을 직접 실행하므로 `react-native`를 import하는 모듈은
검증할 수 없다. 계산부를 분리해야 `clampStageWidth`에 검증을 붙일 수 있다.

- `useStageWidth()` — 실시간 반응이 필요한 곳(§4)
- `stageWidthNow()` — 기존 모듈 상수가 `Dimensions.get('window').width` 대신 호출.
  여전히 박제되지만 clamp된 값이라 폴드 펼침 시 폭 변화가 360→763(2.1배)에서
  360→480(1.3배)로 줄어 어긋남이 눈에 띄지 않는 수준이 된다.

### 2.1 루트 컨테이너

`App.tsx`의 `<SafeAreaProvider>`(현재 118행) 안쪽, Provider 스택과 `NavigationContainer`를
감싸는 위치에 한 겹을 넣는다.

```
<SafeAreaProvider>
  <View style={{ flex:1, backgroundColor:'#0A0A0F' }}>              ← 바깥 여백
    <View style={{ flex:1, width:'100%', maxWidth:480, alignSelf:'center' }}>
      … 기존 Provider 스택 + NavigationContainer …
```

- 탭 바(`CustomTabBar`)도 이 안에 들어가므로 함께 클램프된다. 폴드 펼침 시 탭 바만 화면 끝까지
  늘어나는 어긋남이 생기지 않는다.
- `SafeAreaProvider`는 바깥에 둔다 — 인셋은 실제 화면 기준으로 계산돼야 한다.
- 바깥 배경은 디자인 토큰 `#0A0A0F`.

## 3. 모달 레이어

RN `<Modal>`은 앱 루트가 아니라 **윈도우 최상위**에 그려지므로 §2.1 클램프를 벗어난다.
`<Modal>`은 **35개 파일 83곳**이고 공용 래퍼가 없다.

**핵심 규칙: 딤 배경은 화면 전체를 덮고, 시트 본체만 클램프한다.**
배경까지 좁히면 폴드에서 양옆이 어두워지지 않아 더 어색해진다.

```ts
// 딤 배경(backdrop): flex:1 그대로 — 손대지 않음
// 시트 본체에만 추가:
{ width: '100%', maxWidth: STAGE_MAX_W, alignSelf: 'center' }
```

| 유형 | 건수 | 처리 |
|---|---|---|
| 바텀시트 (`justifyContent: 'flex-end'`) | 36 | 시트 본체에 `maxWidth` 추가 (코드모드) |
| 전체화면 오버레이 | 5 | 클램프하지 않는다 — §4.1의 "화면 가득" 규칙 적용 |
| 중앙 카드 다이얼로그 | 나머지 | **수정 없음** — 고정 폭 카드가 이미 중앙 정렬 |

전체화면 오버레이 5곳(전부 실재 확인):
`components/PhotoViewerModal.tsx`, `components/QuickShareOverlay.tsx`,
`components/PuzzlePhotoAdjustOverlay.tsx`, `components/CutPhotoAdjustModal.tsx`,
`components/CameraCaptureModal.tsx`. 이들은 §4에서 창 전체 기준으로 함께 처리하므로
여기서 별도 작업이 발생하지 않는다.

바텀시트 36곳은 스타일 정의가 일정해 코드모드로 처리하되, 이 저장소는 76곳 코드모드 주입
이력이 있으므로(8/3 감사) **주입 후 전수 diff 검토를 절차에 포함**한다.

## 4. 실시간 반응 대상

선정 기준은 감이 아니라 **"폭이 스크롤 계산에 들어가는가"**다. stale 값이면 어색한 정도가
아니라 기능이 깨지기 때문이다.

```
PhotoViewerModal.tsx:77   contentOffset={{ x: initialIndex * W }}
                    :80   Math.round(contentOffset.x / W)      ← 폭 틀리면 엉뚱한 사진
MediaPickerModal.tsx:100  getItemLayout length/offset          ← 폭 틀리면 스크롤 위치 어긋남
```

기준(§4.1)이 파일마다 다르므로 함께 적는다. **총 12개 파일.**

| 파일 | 기준 | 이유 |
|---|---|---|
| `components/PhotoViewerModal.tsx:22` | 창 전체 | 페이저 오프셋 계산 + 화면 가득 |
| `components/CutPhotoAdjustModal.tsx:10` | 창 전체 | 사진 조정 전체화면 |
| `components/PuzzlePhotoAdjustOverlay.tsx:14` | 창 전체 | 사진 조정 오버레이 |
| `components/QuickShareOverlay.tsx:8` | 창 전체 | 전체화면 오버레이 |
| `components/CameraCaptureModal.tsx` | 창 전체 | 카메라 프리뷰 |
| `components/record/PhotoPagerSection.tsx:10` | Stage | `PAGE_W = SCREEN_W`, pagingEnabled |
| `components/record/MediaPickerModal.tsx:30` | Stage | `getItemLayout` 3열 그리드 |
| `screens/PostDetailScreen.tsx:67` | Stage | 사진 페이저 2곳 (258·1196) |
| `screens/BlogRecordScreen.tsx:90` | Stage | 페이저 2곳 (214·254) |
| `screens/AppIntroScreen.tsx:35` | Stage | 온보딩 페이저 |
| `screens/TripDetailScreen.tsx:34` | Stage | `snapToInterval={cardW + SWIPE_GAP}` |
| `components/PuzzleShareCard.tsx:13` | Stage | 공유 카드 (캡처 산출물 크기 고정) |

`CameraCaptureModal.tsx`는 현재 모듈 상수를 쓰지 않으므로 확인만 하고 필요 시에만 손댄다.

**제외 — `components/MainCoachmark.tsx:21`**: 후보로 보이지만 상수는 초기값일 뿐이고
136행에서 `onLayout` 측정값(`rootSize`)으로 갱신된다. 이미 자가 치유하므로 건드리지 않는다.

### 4.1 폭의 기준을 둘로 나눈다

사진 뷰어를 480dp로 클램프하면 폴드에서 손해다 — 763dp 화면에 480dp 사진만 띄우고 양옆을
버리게 된다. **의도가 보존되는 쪽이 진짜 파리티**이므로 기준을 나눈다.

| 의도 | 기준 | 대상 |
|---|---|---|
| **"화면 가득"** | 창 전체 (`useWindowDimensions`) | 사진 뷰어, 카메라, 사진 조정 오버레이 |
| **"폰 레이아웃"** | Stage 480dp (`useStageWidth`) | 그 외 전부 — 피드·시트·카드·페이저 |

iOS 폰에서 화면 가득이던 것은 폴드에서도 화면 가득인 것이 맞다.

### 4.2 나머지 30곳

모듈 상수 형태를 유지한 채 `Dimensions.get('window').width` → `stageWidthNow()`로 치환한다.

### 4.3 고정 폭 오버플로우 2건

`NaverBlogImportScreen.tsx:595`(width: 390), `introVisuals.tsx:301`(width: 367) —
360dp 기기에서 넘친다. `'100%'` + `maxWidth`로 교체한다.

## 5. 글꼴 배율 상한

**React 19.1이므로 `Text.defaultProps = { maxFontSizeMultiplier }` 트릭은 쓸 수 없다.**
React 19에서 함수형 컴포넌트의 `defaultProps`가 제거됐다. `<Text>`는 93개 파일 1728곳,
`<TextInput>`은 78곳이다.

**상한은 Android 전용이다** (2026-08-11 사용자 확정). `utils/fitText.ts:3`의 "iOS 렌더링은 절대
변경하지 않는다" 원칙을 지킨다 — iOS는 이 프로젝트의 기준(정답)이므로 기준을 바꾸면 파리티의
잣대 자체가 흔들리고, 접근성 후퇴도 iOS 사용자에게만 생긴다.

신규 `src/ui/Text.tsx`:

```tsx
import { Platform, Text as RNText, TextInput as RNTextInput } from 'react-native';
export const MAX_FONT_SCALE = 1.2;
const CAP = Platform.OS === 'android' ? MAX_FONT_SCALE : undefined;   // iOS는 무제한 유지
export const Text = (p) => <RNText maxFontSizeMultiplier={CAP} {...p} />;
export const TextInput = (p) => <RNTextInput maxFontSizeMultiplier={CAP} {...p} />;
```

- `{...p}`를 뒤에 두어 개별 화면이 필요하면 덮어쓸 수 있게 한다.
- `undefined`는 RN에서 "상한 없음"이므로 iOS 동작은 현재와 완전히 동일하다.
- 구현 시 `Text`/`TextInput`은 **동명 타입 별칭도 함께 export**해야 한다 — RN 원본이 클래스라
  값·타입을 겸하고, `useRef<TextInput>(null)` 같은 기존 코드가 타입 자리에서 이 이름을 쓴다.
- `utils/fitText.ts:11`의 하드코딩 `1.2`도 `MAX_FONT_SCALE`을 참조하게 바꿔 상수를 한 곳으로 모은다.
- **적용**: 93개 파일의 `import { Text } from 'react-native'`를 코드모드로 분리 교체.
  `View`·`StyleSheet` 등은 `react-native`에 그대로 두고 `Text`/`TextInput`만 `src/ui/Text`에서
  가져오게 하며, 파일 깊이에 따라 상대 경로를 계산한다.
- **재발 방지**: `eslint.config.js`에 `no-restricted-imports`를 추가해 `react-native`에서
  `Text`/`TextInput`을 직접 import하면 lint 오류가 나게 한다. 이게 없으면 새 화면을 만들 때
  조용히 원상복귀된다.

이 코드모드가 이번 작업에서 가장 큰 diff(93파일)다. 기계적이고 되돌리기 쉽지만 커밋은 분리한다.

## 6. 포함하는 기존 이슈 1건

`statusBarTranslucent`가 안드로이드 Modal의 키보드 `adjustResize`를 끄는 알려진 동작 때문에,
KeyboardAvoidingView가 없는 입력 모달에서 키보드가 입력창을 가린다. 8/3 감사에서 "실기기 QA 후
판단"으로 남아 있으나, **iOS와 배치가 명백히 달라지는 케이스**이므로 이번 범위에 넣는다.

대상 5곳: `screens/MainScreen.tsx` 국가시트(1676)·지역태깅(1553),
`screens/TripRecordScreen.tsx` 섹션이름(670), `screens/BlogRecordScreen.tsx` PickerModal,
`components/record/CurrencyPickerModal.tsx`.

행 번호는 8/3 감사 시점 기준이므로 착수 시 재확인한다.

## 7. 범위 밖

메모리의 잔여 파리티 목록 중 **색감·성능 항목은 배치 문제가 아니므로 제외**한다 —
컬러 shadowColor 22곳, 대면적 `dimezisBlurView` 9곳 프레임 드랍, 저휘도 그라데이션 밴딩,
`useNativeDriver:false` 25곳, RN Image→expo-image 전환.

대화면 **적응형 레이아웃**(태블릿 2열 피드 등)도 제외한다. 요구는 "iOS와 다르지 않게"이므로
레이아웃 재구성은 요구에 반한다.

## 8. 검증

### 8.1 자동
`npx tsc --noEmit` / `npm run lint` / `npm test`

### 8.2 에뮬레이터 4종 스크린샷 대조

| 프로파일 | 폭 | 확인 항목 |
|---|---|---|
| 저가 폰 | 360dp | 오버플로우 2건 해소, 한글 라벨 줄바꿈 |
| 플래그십 | 411dp | **변화가 없어야 함** (회귀 검사) |
| 폴드 접음↔펼침 | ~411 ↔ ~763dp | 접힌 상태로 실행 후 펼치기 — §4 실시간 12개 파일 |
| 태블릿 | 800dp | Stage 중앙 정렬, 탭 바 폭 일치 |

이 PC에서는 **ANGLE 렌더러 + wipe-data**가 필요하다.

글꼴 배율은 별도 축으로 각 프로파일에서 확인한다:

```
adb shell settings put system font_scale 1.3
adb shell wm density 480        # 삼성 "화면 크게 보기" 재현
```

### 8.3 실기기 필요 — 에뮬레이터로 판단 금지

`GlobeView`·WebView는 에뮬레이터에서 느려 판단이 불가능하다. **지구본·대면적 블러 화면은
스크린샷 대조 대상에서 제외하고 실기기 확인 항목으로 넘긴다.** 이 항목들에 대해 에뮬레이터
결과만으로 "검증 완료"라고 적지 않는다.

## 9. 커밋 분리

파일이 겹치지 않도록 나눈다.

1. `src/utils/stage.ts` + `App.tsx` 루트 클램프
2. 바텀시트 36곳 `maxWidth` (코드모드 + 전수 diff 검토)
3. §4 실시간 12개 파일 — 창 전체 5곳 + Stage 7곳
4. 나머지 상수 30곳 `stageWidthNow()` 치환 + 고정 폭 오버플로우 2건
5. `src/ui/Text.tsx` + import 교체 93파일 + eslint 가드
6. 키보드 모달 KAV 5곳

2번 코드모드가 3번 대상 파일을 건드리지 않는지 주입 전에 확인한다 —
`PhotoViewerModal`·`CutPhotoAdjustModal` 등은 시트가 아니므로 원래 대상이 아니지만,
`justifyContent: 'flex-end'` 문자열만 보고 고르면 오탐이 섞일 수 있다.

## 10. 관련 문서

- 이전 파리티 감사: `fix/android-parity` 5커밋 (병합 완료)
- 안드로이드 유리 재질 규칙 / 한글 폰트 줄바꿈 / 안전영역 컨벤션 — 기존 규칙을 깨지 않는다
- 에뮬레이터 실행법: ANGLE 렌더러 + wipe-data
