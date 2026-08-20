---
name: eorth-android-traps
description: eOrth에서 실제로 사고를 냈던 안드로이드·Expo SDK54 새 아키텍처 함정 목록과 회피책. 안드로이드 화면이 안 보이거나 터치가 안 먹거나 블러·영상·카메라·피커가 이상할 때, "안드로이드에서만 이상해", "파리티 점검", "함정 확인", "다시 점검" 요청 시 반드시 사용할 것. 이 함정들은 전부 컴파일도 되고 iOS에서는 정상 동작하므로 타입 검사와 lint가 잡지 못한다.
---

# eOrth 안드로이드·새 아키텍처 함정 목록

전부 **실제로 겪고 값을 치른 것들**이다. 공통점: 컴파일 통과, lint 통과, iOS 정상.
안드로이드 실기기에서만 드러난다.

## 1. 커스텀 래퍼가 children을 통과시키지 않음

**증상:** 소셜·프로필 탭이 통째로 빈 화면.

**원인:** 안드로이드는 본문이 `refreshControl` 안으로 들어가는 구조다. 당겨서 새로고침을
감싼 커스텀 래퍼가 `children`을 내부 컴포넌트로 흘리지 않으면 본문이 사라진다.
iOS는 구조가 달라 멀쩡히 보인다.

**검사:** props를 받아 내부에 전달하는 래퍼를 찾고, 받는 props와 전달하는 props를
대조하라. 특히 `children`, `refreshControl`, `contentContainerStyle`.

## 2. BlurView가 안드로이드에서 no-op

**증상:** 유리 재질이 안드로이드에서 그냥 반투명 사각형.

**회피:** `experimentalBlurMethod` prop이 **필수**다. 없으면 아무 일도 일어나지 않는다.

**추가 규칙:** 블러는 **소면적에만** 쓴다. 대면적은 `SheetBackdrop` 매트로 대체한다.
안드로이드에서 넓은 영역 블러는 프레임을 잡아먹는다.

**검사 패턴:** `BlurView` grep → 각 사용처에 `experimentalBlurMethod`가 있는지.

## 3. RNSVG가 pointerEvents를 무시

**증상:** 오버레이 위/아래 버튼이 안 눌림.

**원인:** 새 아키텍처에서 `Svg`가 `pointerEvents="none"`을 무시하고 터치를 삼킨다.

**회피:** 오버레이 `Svg`는 `<View pointerEvents="none">`으로 **감싼다.** Svg 자체에
prop을 주는 것으로는 해결되지 않는다.

## 4. 한글 폰트가 넓어 고정폭 라벨이 줄바꿈

**증상:** 안드로이드에서만 탭 라벨·버튼 글자가 두 줄로 깨짐.

**원인:** Noto Sans KR의 글자폭이 iOS 기본 한글 폰트보다 넓다.

**회피:** android 전용 `andFitText` 스프레드(한 줄 고정 + 자동 축소)를 적용한다.

## 5. Fabric 플래트닝이 raster prop을 삼킴

**증상:** 회전시킨 요소의 가장자리에 계단현상.

**회피 3종 세트:** 1px 투명 블리드 링 + `collapsable={false}` + 래스터 설정.
`collapsable={false}`가 빠지면 Fabric이 뷰를 평탄화하면서 raster prop을 버린다.

## 6. expo-av Video가 크래시

**증상:** SDK54 새 아키텍처에서 영상 재생 시 앱 종료.

**회피:** `expo-video`를 쓴다. `expo-av`의 Video는 이 프로젝트에서 쓰지 않는다.

## 7. launchCameraAsync 셔터가 안 먹힘

**증상:** 카메라는 뜨는데 촬영 버튼이 반응 없음.

**회피:** `expo-image-picker`의 카메라 대신 `CameraCaptureModal`(expo-camera)을 쓴다.
DM·BlogRecord·순간 전부 교체 완료 상태다. 새 코드가 `launchCameraAsync`를 다시 부르면 재발이다.

## 8. 영상 피커 PHPhotos 3164

**증상:** 영상 선택 시 오류 3164.

**원인:** iCloud 원본이거나 트랜스코딩 실패.

**회피(현행):** `launchImageLibraryAsync`에 **비-Passthrough 프리셋**을 준다 —
`videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality`.
이러면 iOS가 export 도중 iCloud 원본을 자동으로 내려받는다.
현재 위치는 `BlogRecordScreen.tsx`의 `handleAddVideo`(945~946행, 근거 주석 포함).

> **옛 토큰 주의 — `preferredAssetRepresentationMode`로 grep하지 마라.**
> 이 스킬은 한동안 회피책을 그 이름으로 적어 두었으나, 해당 토큰은 **코드베이스 전체에
> 0건**이다. SDK54 대응 과정에서 `videoExportPreset` 방식으로 **의도적으로 대체**됐다.
> 옛 이름으로 검색하면 0건이 나오고, 그걸 "회피 코드 소실"로 오판하기 쉽다
> (2026-08-20 파리티 점검에서 실제로 이 혼선이 났다). 소실이 아니라 대체다.

## 9. Modal 껍데기가 남아 터치 먹통

**증상:** 사진 피커를 닫은 뒤 화면은 정상인데 아무것도 안 눌림. 에러도 없고 **앱 재시작으로만 복구**.

**회피:** 짧은 수명의 로딩 오버레이에 `Modal`을 쓰지 마라. 절대위치 `View`로 만든다.

**역방향도 금지:** `Modal`을 닫은 **직후** 네이티브 시트를 present하면 씹힌다
(구글 로그인이 이걸로 안 떴다). 한 틱 이상 띄워라.

## 10. PanResponder stale 클로저

**증상:** 드래그 중 최신 상태가 아닌 옛날 값으로 동작.

**원인:** `useRef(PanResponder.create(...))`는 첫 렌더의 클로저를 박제한다.

**회피:** 콜백을 `cbRef`에 담아 경유시킨다.

## 11. iOS 컨테이너 경로 사진 유실 (참고 — iOS 쪽)

재빌드하면 앱 컨테이너 경로가 바뀌어 저장된 절대경로 URI가 깨진다.
`remapDocumentUris`가 record·moment·settings hydrate 전부에서 복구한다. 새 저장 경로를
추가하면 이 함수도 같이 갱신해야 한다.

---

## 오탐 — 다시 조사하지 마라

| 신고 | 실제 |
|---|---|
| AdMob validator "Ad attribution missing" | RN `Text`를 못 읽는 것. 요건은 충족돼 있음 |
| 온보딩 하단 터치 불가 | 탭 좌표 실수로 인한 오탐 |
| S21+ 렉 | dev 모드에서 정상 범위 |

## 회피 코드는 한 줄짜리라 조용히 사라진다

위 회피책 상당수가 prop 한 줄이다. 리팩터링·자동 포맷·컴포넌트 교체 중에 없어져도
아무 경고가 안 뜬다. 따라서 **함정 API를 찾는 것과 동시에, 회피 prop이 아직 붙어 있는지**를
확인하라:

`experimentalBlurMethod` · `collapsable={false}` · `View pointerEvents="none"` 래핑 ·
`videoExportPreset`(옛 `preferredAssetRepresentationMode` 아님 — 함정 8 참고) · `andFitText`

단, **회피 소실을 사람 눈으로만 세지 마라.** 2026-08-20 점검에서 `pointerEvents` 재발
3건을 찾고도 4번째(`MainScreen`의 "영토 표시 설정" 카드 테두리)를 놓쳤고, 정적 규칙을
만드는 도중에야 드러났다. `Svg`의 `pointerEvents`와 `View` 래퍼 건수는 이제
`scripts/layout-parity.verify.mjs` **규칙 11·12**가 기계적으로 본다 — `npm test`를 먼저
돌리고, 이 스킬로는 그 규칙이 못 보는 것(잔여 갭은 각 규칙 주석에 적혀 있다)을 확인하라.

## 테스트 시나리오

**정상:** "안드로이드 파리티 점검" → 11개 함정을 각각 grep → 후보마다 주변 코드를 읽어
실제 재발인지 판정 → 회피 prop 소실 여부까지 확인 → 위치와 예상 증상으로 보고.

**에러:** grep 후보가 수백 건이라 전수 확인이 불가능하다 → **표본만 보고 "깨끗함"으로
결론 내지 않는다.** "범위를 N건으로 좁힘"이라고 명시하고 무엇을 못 봤는지 적는다.
