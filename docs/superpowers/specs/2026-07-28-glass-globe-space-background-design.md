# 유리 지구본 실사 우주 배경 (2026-07-28)

## 배경

유리 구슬 지구본(`displayMode==='photo'`)의 뒤 배경이 지금은 단색 `#0A0B0F` + CSS로 찍은 흰 점 별 320개뿐이다. 시안은 실사 우주(성단·성운)가 화면 전체에 깔린 모습이고, 사용자가 그 방향을 요청했다.

## 왜 가능한가

`globeHTML`은 배경을 3D 씬이 아니라 DOM 레이어로 그린다.

- `GlobeView.tsx:72` — `#bg { background: #0A0B0F; z-index: 1 }`, 그 안에 `#stars`
- `GlobeView.tsx:162` — `renderer.setClearColor(0x000000, 0)` → WebGL 캔버스가 투명해서 `#bg`가 그대로 비친다

따라서 셰이더를 건드리지 않고 `#bg`에 이미지 한 장을 깔면 된다. 정적 레이어라 런타임 비용은 사실상 0이다.

## 범위

- **적용 대상**: `globeHTML`의 유리 모드(`isGlass()` = `globeDisplayMode === 'photo'`)만.
- **비대상**: aurora(`neonGlobeHTML`)는 손대지 않는다. 색/국기 모드도 기존 검정 배경 그대로.
- `GlobeView`는 `MainScreen.tsx:1274` 한 곳에서만 `fullscreen`으로 쓰인다. 작은 지구본에 배경이 끼는 경우는 없다.

## 이미지

- **원본**: Westerlund 2 성단 — 허블 25주년 "Celestial Fireworks" (NASA, ESA, Hubble Heritage Team STScI/AURA). Wikimedia Commons 경유, 8919×6683.
- **가공**: 성단 위주 상단 크롭(`crop=iw*0.78:ih*0.62:iw*0.16:0`) → 1080×2340 커버 크롭 → 앱 보라 톤 그레이딩

  ```
  eq=saturation=0.15:contrast=1.2:brightness=-0.20,
  colorbalance=rs=0.11:gs=-0.05:bs=0.23:rm=0.15:gm=-0.07:bm=0.27
  ```

  JPEG q6 → 약 190KB, base64 약 259KB.

## 전달 방식

WebView가 `source={{ html }}`로만 뜨고 baseUrl이 없어서 `assets/`의 파일을 경로로 참조할 수 없다. → **base64 data URI를 HTML에 인라인**한다. `WORLD_GEO_INLINE`·`THREE_INLINE`과 같은 기존 패턴이다.

검토 후 버린 대안:

- RN 에셋 + `Asset.fromModule().uri`를 postMessage로 전달 — `file://` 접근 권한이 필요하고 Android에서 불안정, 비동기라 배경 없이 한 번 깜빡인다.
- WebView body 투명 + RN `<Image>`를 뒤에 배치 — Android WebView 투명 처리가 불안정하고 aurora까지 레이어 구조가 바뀐다.

## 변경 사항

### 1. `src/data/glassSpaceBg.ts` (신규)

```ts
export const GLASS_SPACE_BG = 'data:image/jpeg;base64,...';
```

문자열 상수 하나만 내보낸다. 다른 `vendor*.ts` 데이터 파일과 같은 성격.

### 2. `src/components/GlobeView.tsx` — `globeHTML`만

- **CSS**: `#bg.space`에 배경 이미지(`background-size: cover; background-position: center`)를 깔고, 그 위에 `radial-gradient` 비네트를 얹어 상단 타이틀·하단 카드 영역을 눌러 가독성을 확보한다.
- **별밭 루프**(`GlobeView.tsx:167` 부근): 유리일 때 320 → 80개. 실사 별과 이중으로 겹치지 않게 하되 반짝임 연출은 남긴다.
- **토글 2곳**: 부팅 시(`globeDisplayMode` 초기화 직후, `GlobeView.tsx:273`)와 런타임 모드 변경(`GlobeView.tsx:2190`). 각각 `bg.classList.toggle('space', isGlass())`.

### 3. `src/screens/SettingsScreen.tsx`

버전 텍스트(`SettingsScreen.tsx:476`) 아래에 작은 회색 크레딧 한 줄. ESA/Hubble 명의 이미지는 CC BY 4.0이라 출처 표기가 필요하다. 고정 문구로 두고 번역하지 않는다.

```
배경 이미지: NASA, ESA, Hubble Heritage Team (STScI/AURA)
```

## 알려진 리스크

유리 몸체는 `GLASS_OCEAN_ALPHA = 0.88`, 뒷면 대륙이 `GLASS_BACK_OPACITY = 0.12`로 비치는 구조라 **뒤 배경이 밝아지면 구 안쪽도 같이 밝아진다.** 선택한 크롭은 밝은 성운이 하단에만 걸려 영향이 작을 것으로 보지만, 실기기에서 사진 국가의 대비가 약해 보이면 **이미지 밝기를 한 단계 더 내려 재인코딩**하는 것으로 조정한다(코드 변경 없음).

## 검증

1. `npx tsc --noEmit`
2. WebView JS는 tsc가 못 잡는다 — `check-globe-syntax.js`(스크립트 추출 → `node --check`)로 문법 확인
3. 실기기: 사진 ↔ 색 ↔ 국기 모드를 왕복하며 배경이 켜지고 꺼지는지, 상단 타이틀·하단 카드 가독성, 유리 속 사진 대비 확인
