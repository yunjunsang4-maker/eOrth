# 대륙 지도 퍼즐 활성화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 나라 지도에서 그림 한 장을 지역(admin1) 경계로 쪼개, 방문 지역만 조각이 선명하게 드러나는 퍼즐 모드를 만든다.

**Architecture:** CountryMapView(WebView 안 SVG/D3)에 `userSpaceOnUse` 공유 패턴 2벌(선명/흑백 힌트)을 추가한다 — 패턴 좌표가 지도 좌표계에 고정되므로 모든 지역이 같은 그림의 자기 위치 조각을 자동 샘플링한다. 완성 판정은 RN이 기존 `regionProgress`로 계산해 내려보내고, WebView는 전이(미완성→완성)에서만 경계선 페이드 연출을 재생한다. 기본 아트는 data URI 모듈로 인라인한다(WebView에 baseUrl이 없어 assets/ 경로 참조 불가 — `src/data/glassSpaceBg.ts` 선례).

**Tech Stack:** React Native (Expo SDK 54) · TypeScript · react-native-webview + D3(SVG) · expo-image-picker · expo-image-manipulator(기존 photoCache)

**스펙:** `docs/superpowers/specs/2026-08-06-region-puzzle-design.md`

## Global Constraints

- 모든 주석·커밋 메시지·사용자 문구는 한글로 쓴다(영문판 문구는 en.ts에).
- 이 계획에 명시된 파일만 수정한다. 다른 파일은 절대 건드리지 않는다.
- 각 태스크 종료 조건: `npx tsc --noEmit` 통과, `npm test` 통과(29+개 verify + WebView 문법 검사), eslint 신규 오류 0.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` 한 줄.
- CountryMapView의 WebView 코드는 **TSX 안 템플릿 리터럴 내부**다: 백틱과 `${`를 쓰면 안 되고(리터럴 조기 종료), 정규식·문자열의 백슬래시는 두 겹(`\\u0300`)이어야 하며, `</script`는 `<\/script`로 이스케이프한다. 새 코드는 백슬래시가 필요 없는 문법만 쓴다(아래 제공 코드가 그렇다).
- 빈 조각 힌트 필터 값은 스펙 그대로: `grayscale(1) brightness(0.3)`.
- 미방문 기본색 `#191920`, 검색 강조 `#22323d`, 배경 `#0A0B0F` 등 기존 색은 바꾸지 않는다.
- 지역 매칭 키는 `d.properties.CODE`(예: 'JP-13')다. `NAME_1`(영문 표시명)과 혼동 금지.
- `regionDisplayModes`·`regionColors` 저장 데이터는 **삭제하지 않는다**(읽기만 중단) — 롤백 여지 보존.

---

## 파일 구조

| 파일 | 역할 |
|---|---|
| `scripts/build-puzzle-art.ps1` (신규) | 기본 아트 JPEG 생성 + base64 출력 (재생성용, 1회성 도구) |
| `src/data/puzzleArt.ts` (신규) | `PUZZLE_ART` data URI — 기본 아트 단일 출처 |
| `src/data/puzzleArt.verify.ts` (신규) | data URI 형식·크기 상한 검증 |
| `src/utils/regionModeMigration.ts` (신규) | `normalizeRegionGlobalMode` — 구 저장값('color') → 'photo' 정규화 |
| `src/utils/regionModeMigration.verify.ts` (신규) | 정규화 전수 검증 |
| `src/components/CountryMapView.tsx` (수정) | 퍼즐 패턴 2벌·완성 연출·새 props |
| `src/store/settingsStore.tsx` (수정) | `regionGlobalMode` 타입 교체 + `puzzleImages` 신설 |
| `src/screens/MainScreen.tsx` (수정) | 표시 설정 시트 개편·CountryMapView 연결·햅틱 |
| `src/i18n/locales/ko.ts` / `en.ts` (수정) | 신규 문구 4개 |

---

### Task 1: 기본 아트 data URI 모듈

**Files:**
- Create: `scripts/build-puzzle-art.ps1`
- Create: `src/data/puzzleArt.ts`
- Test: `src/data/puzzleArt.verify.ts`

**Interfaces:**
- Consumes: `assets/intro2-band.png` (기존 에셋 — 여행 카드 콜라주, 1073×433)
- Produces: `export const PUZZLE_ART: string` — `'data:image/jpeg;base64,...'` 형태. Task 4가 import한다.

**배경:** WebView는 `source={{ html }}`로만 떠 baseUrl이 없다 → assets/ 파일을 경로로 참조할 수 없다. `src/data/glassSpaceBg.ts`가 같은 이유로 data URI 인라인을 쓴다. 기본 아트는 앱 톤이 이미 검증된 기존 에셋(인트로 2페이지 여행 카드 콜라주)의 중앙 정사각 크롭으로 만든다 — 신규 그림이 필요해지면 이 스크립트의 입력만 바꿔 재생성한다.

- [ ] **Step 1: 검증 파일 먼저 작성**

`src/data/puzzleArt.verify.ts`:

```ts
// 퍼즐 기본 아트 data URI 형식·크기 검증.
// 크기 상한 400KB: 번들에 인라인되는 문자열이라 무한정 커지면 안 된다.
// (glassSpaceBg와 같은 인라인 방식 — JPEG q70·800px이면 여유 있게 통과)
import { PUZZLE_ART } from './puzzleArt';

let failed = 0;
function ok(cond: boolean, label: string) {
  console.log(`${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failed++;
}

console.log('▶ src/data/puzzleArt.verify.ts');

ok(PUZZLE_ART.startsWith('data:image/jpeg;base64,'), 'JPEG data URI 형식');
ok(PUZZLE_ART.length > 10_000, '실제 이미지가 들어 있다 (플레이스홀더 아님)');
ok(PUZZLE_ART.length < 400_000, '400KB 미만 (번들 크기 상한)');
// base64 본문에 개행·공백이 섞이면 WebView <image href>가 조용히 실패한다
ok(!/[\s]/.test(PUZZLE_ART), '공백·개행 없음');

if (failed > 0) { console.error(`✗ ${failed}개 실패`); process.exit(1); }
console.log('✅ 모든 검증 통과');
```

- [ ] **Step 2: 실패 확인**

Run: `npx tsx src/data/puzzleArt.verify.ts`
Expected: FAIL — `puzzleArt` 모듈 없음 (Cannot find module)

- [ ] **Step 3: 생성 스크립트 작성**

`scripts/build-puzzle-art.ps1`:

```powershell
# 퍼즐 모드 기본 아트 생성 — assets/intro2-band.png 중앙 정사각 크롭 → 800px JPEG q70 → base64
# 실행: powershell -ExecutionPolicy Bypass -File scripts/build-puzzle-art.ps1
# 출력: scripts/puzzle-art-b64.txt (src/data/puzzleArt.ts에 붙여넣을 base64 본문)
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$src = [System.Drawing.Image]::FromFile((Join-Path $root 'assets\intro2-band.png'))
$side = [Math]::Min($src.Width, $src.Height)
$cropX = [int](($src.Width - $side) / 2)
$cropY = [int](($src.Height - $side) / 2)
$bmp = New-Object System.Drawing.Bitmap 800, 800
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
# 원본 PNG의 투명 영역이 JPEG에서 시커멓게 뭉개지지 않게 앱 톤 배경을 먼저 깐다
$gfx.Clear([System.Drawing.ColorTranslator]::FromHtml('#141024'))
$destRect = New-Object System.Drawing.Rectangle 0, 0, 800, 800
$srcRect = New-Object System.Drawing.Rectangle $cropX, $cropY, $side, $side
$gfx.DrawImage($src, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$p = New-Object System.Drawing.Imaging.EncoderParameters 1
$p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 70L)
$tmp = Join-Path $root 'scripts\puzzle-art-tmp.jpg'
$bmp.Save($tmp, $enc, $p)
$gfx.Dispose(); $bmp.Dispose(); $src.Dispose()
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($tmp))
Set-Content -Path (Join-Path $root 'scripts\puzzle-art-b64.txt') -Value $b64 -NoNewline
Remove-Item $tmp
Write-Host "base64 길이: $($b64.Length)"
```

- [ ] **Step 4: 스크립트 실행**

Run: `powershell -ExecutionPolicy Bypass -File scripts/build-puzzle-art.ps1`
Expected: `base64 길이: 100000~350000` 범위 출력, `scripts/puzzle-art-b64.txt` 생성.
길이가 350000을 넘으면 스크립트의 `800`을 `640`으로 줄여 재실행.

- [ ] **Step 5: 데이터 모듈 작성**

`src/data/puzzleArt.ts` — `scripts/puzzle-art-b64.txt` 내용을 붙여넣는다:

```ts
// 대륙 지도 퍼즐 모드 기본 아트 — 사용자가 그림을 고르기 전의 전 국가 공통 원본.
// WebView가 source={{ html }}로만 떠 baseUrl이 없어 assets/를 경로로 참조할 수 없다
// → data URI 인라인 (glassSpaceBg.ts와 같은 방식).
// 재생성: powershell -ExecutionPolicy Bypass -File scripts/build-puzzle-art.ps1
//        (assets/intro2-band.png 중앙 크롭 → 800px JPEG q70 → scripts/puzzle-art-b64.txt)
export const PUZZLE_ART = 'data:image/jpeg;base64,<여기에 b64.txt 내용>';
```

`scripts/puzzle-art-b64.txt`는 커밋하지 않는다(중간 산출물 — 삭제).

- [ ] **Step 6: 검증 통과 확인**

Run: `npx tsx src/data/puzzleArt.verify.ts`
Expected: PASS (✓ 4개)

- [ ] **Step 7: 전체 검증 + 커밋**

Run: `npx tsc --noEmit && npm test`
Expected: 통과 (verify 파일 수가 1 증가)

```bash
git add scripts/build-puzzle-art.ps1 src/data/puzzleArt.ts src/data/puzzleArt.verify.ts
git commit -m "feat(puzzle): 기본 아트 data URI 모듈 — intro2-band 중앙 크롭

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: CountryMapView 퍼즐 렌더링

**Files:**
- Modify: `src/components/CountryMapView.tsx`

**Interfaces:**
- Consumes: 없음 (독립 — 스토어와 무관)
- Produces (Task 4가 사용):
  - Props 확장: `displayMode?: 'color' | 'photo' | 'puzzle'` ('color'는 구버전 허용치 — 'photo'와 동일 동작), `puzzleImage?: string`, `puzzleComplete?: boolean`
  - `recordedRegions` 원소의 `mode`/`color` 필드는 그대로 두되(타입 호환) 퍼즐 모드에서 무시
  - RN으로 보내는 새 메시지: `{type:'puzzleCompleted'}` — 완성 전이 1회
- WebView 내부 신규 함수: `puzzleGroupOf(d)`, `buildPuzzlePatterns(defs)`, `playPuzzleCompletion(newCodes)`

**동작 요약:** 퍼즐 모드에서 방문 지역은 `pz-sharp-*` 패턴, 미방문은 `pz-hint-*` 패턴으로 채운다. 패턴은 그룹(본토 'm', 인셋 'Alaska'/'Hawaii')마다 자기 bbox 기준 `userSpaceOnUse`로 깔린다. `puzzleImage`가 아직 없으면(변환 중/실패) 기존 사진 모드 규칙으로 폴백한다.

- [ ] **Step 1: RN 쪽 — Props·변환·payload 확장**

`interface Props`(21행 부근)에 추가:

```ts
  /** 대륙 표시 모드. 'puzzle'이면 puzzleImage 한 장을 지역 경계로 쪼개 보여준다.
      'color'는 구버전 저장값 허용치 — 'photo'와 동일하게 동작한다. */
  displayMode?: 'color' | 'photo' | 'puzzle';
  /** 퍼즐 원본 그림 (data URI 또는 file://). puzzle 모드에서만 쓴다 */
  puzzleImage?: string;
  /** 전 지역 방문 여부 — RN(regionProgress)이 계산한다. WebView는 전이 감지·연출만 담당 */
  puzzleComplete?: boolean;
```

함수 시그니처 구조분해에 `puzzleImage`, `puzzleComplete = false` 추가.

`photoCache` 수집 useEffect(69행 부근): 변환 대상에 퍼즐 이미지를 포함한다 —

```ts
    const targets = Array.from(
      new Set(
        [...recordedRegions.map(r => r.photo), puzzleImage]
          .filter((u): u is string => needsMaterialize(u) && !photoCache[u as string])
      )
    );
```

의존성 배열을 `[recordedRegions, puzzleImage]`로 바꾼다 (기존 eslint 억제 주석이 있으면 유지).

`resolvedRegions` 아래에 추가:

```ts
  // 퍼즐 그림도 같은 규칙: ph:// 등은 변환본으로, 변환 전/실패면 undefined(사진 모드 폴백)
  const resolvedPuzzleImage = useMemo(() => {
    if (!puzzleImage) return undefined;
    if (photoCache[puzzleImage]) return photoCache[puzzleImage];
    if (needsMaterialize(puzzleImage)) return undefined;
    return puzzleImage;
  }, [puzzleImage, photoCache]);
```

`payload` useMemo에 두 필드 추가(의존성에도):

```ts
    puzzleImage: resolvedPuzzleImage,
    puzzleComplete,
```

- [ ] **Step 2: WebView 상태 변수 추가**

`var displayMode = 'color';`(317행 부근) 아래에:

```js
var puzzleImage = null;          // 퍼즐 원본 그림 (data URI/file://)
var puzzleComplete = false;      // RN(regionProgress)이 계산해 내려주는 완성 여부
var puzzlePrevComplete = null;   // null=첫 수신(기준선만 설정, 연출 없음 — 남발 방지)
var prevMatchedCodes = [];       // 직전 매칭 CODE 목록 — '마지막 조각' 글로우 대상 계산용
```

- [ ] **Step 3: getFill에 퍼즐 분기**

`getFill(d)`(473행 부근)의 맨 앞, `var active=...` 다음에 삽입:

```js
  // 퍼즐 모드: 그림 한 장을 공유 패턴으로 — 방문=선명 조각, 미방문=흑백 힌트.
  // 그림이 아직 없으면(변환 중) 아래 기존 규칙으로 폴백한다.
  // 검색 강조는 채움을 덮지 않는다 — emphStroke의 시안 테두리가 담당(조각 그림 유지).
  if(displayMode==='puzzle'&&puzzleImage){
    return active ? 'url(#pz-sharp-'+puzzleGroupOf(d)+')' : 'url(#pz-hint-'+puzzleGroupOf(d)+')';
  }
```

기존 사진 모드 분기의 `var mode=active.mode||displayMode;`는 그대로 둔다('color'/'photo' 동작 불변).

`getFill` 함수 아래에 그룹 판별 함수 추가:

```js
// 피처가 속한 패턴 그룹 — 본토는 'm', 미국 인셋은 주 이름. 패턴 id 접미사로 쓴다.
function puzzleGroupOf(d){
  var n=d.properties.NAME_1||'';
  if(COUNTRY_CODE==='USA'&&(n==='Alaska'||n==='Hawaii')) return n;
  return 'm';
}
```

- [ ] **Step 4: 패턴 2벌 생성**

`updateMap()`(639행 부근)의 `var defs = svgElement.append('defs');` 다음 줄에 `buildPuzzlePatterns(defs);` 호출을 넣고, `updateMap` 위에 함수를 추가:

```js
// 퍼즐 패턴 2벌(선명/흑백 힌트) — 그룹(본토/인셋)마다 자기 bbox 기준.
// userSpaceOnUse가 핵심: 패턴 좌표가 지도 좌표계에 고정되므로 모든 지역이
// 같은 그림의 '자기 위치 조각'을 자동 샘플링한다(조각 정렬 계산 불필요).
// preserveAspectRatio slice = cover-fit: 나라 bbox 비율과 무관하게 그림이 꽉 찬다.
function buildPuzzlePatterns(defs){
  if(displayMode!=='puzzle'||!puzzleImage||!projectionPath||!mainFeatures) return;
  var groups=[{key:'m', b:projectionPath.bounds({type:'FeatureCollection',features:mainFeatures})}];
  insetBoxes.forEach(function(box){
    groups.push({key:box.name, b:[[box.x,box.y],[box.x+box.w,box.y+box.h]]});
  });
  groups.forEach(function(grp){
    var bx=grp.b[0][0], by=grp.b[0][1], bw=grp.b[1][0]-bx, bh=grp.b[1][1]-by;
    if(bw<=0||bh<=0) return;
    [['pz-sharp-',''],['pz-hint-','grayscale(1) brightness(0.3)']].forEach(function(pp){
      var pat=defs.append('pattern')
        .attr('id',pp[0]+grp.key)
        .attr('patternUnits','userSpaceOnUse')
        .attr('x',bx).attr('y',by).attr('width',bw).attr('height',bh);
      var img=pat.append('image')
        .attr('href',puzzleImage).attr('xlink:href',puzzleImage)
        .attr('width',bw).attr('height',bh)
        .attr('preserveAspectRatio','xMidYMid slice');
      if(pp[1]) img.style('filter',pp[1]);
    });
  });
}
```

(그룹 키 'm'/'Alaska'/'Hawaii'는 모두 영숫자라 id로 그대로 안전하다.)

- [ ] **Step 5: 완성 시 경계선 숨김 + 연출**

`updateMap()`의 채움/스트로크 갱신 두 줄(pathElements·insetPathElements)에 stroke-opacity를 추가한다 — 완성 상태에선 경계선이 보이지 않아야 재진입 시에도 유지된다:

```js
  var strokeOp = (displayMode==='puzzle'&&puzzleComplete) ? 0 : 1;
  if (pathElements) pathElements.attr('fill', regionFill).attr('stroke', emphStroke).attr('stroke-width', curStrokeWidth).attr('stroke-opacity', strokeOp).style('pointer-events', 'auto');

  Object.keys(insetPathElements).forEach(function(key) {
    var sel = insetPathElements[key];
    if (sel) sel.attr('fill', regionFill).attr('stroke', emphStroke).attr('stroke-width', curStrokeWidth).attr('stroke-opacity', strokeOp).style('pointer-events', 'auto');
  });
```

(탭은 계속 동작한다 — pointer-events는 그대로 auto.)

`reorderEmph` 함수 아래에 연출 함수 추가:

```js
// 완성 연출: 마지막 조각(새로 매칭된 지역) 흰 글로우 펄스 → 전 경계선 1초 페이드아웃.
// updateMap이 stroke-opacity를 이미 0으로 세팅한 뒤 불리므로, 펄스는 1로 올렸다가
// 트랜지션으로 0에 수렴시킨다(최종 상태는 updateMap의 세팅과 일치).
function playPuzzleCompletion(newCodes){
  if(!pathElements) return;
  var all=[pathElements];
  Object.keys(insetPathElements).forEach(function(k){ if(insetPathElements[k]) all.push(insetPathElements[k]); });
  all.forEach(function(sel){
    var pulse=sel.filter(function(d){ return newCodes.indexOf(d.properties.CODE||'')>=0; });
    pulse.raise()
      .attr('stroke','#FFFFFF').attr('stroke-opacity',1).attr('stroke-width',2)
      .transition().delay(250).duration(1000).attr('stroke-opacity',0);
    sel.filter(function(d){ return newCodes.indexOf(d.properties.CODE||'')<0; })
      .attr('stroke-opacity',1)
      .transition().delay(250).duration(1000).attr('stroke-opacity',0);
  });
  if(window.ReactNativeWebView){
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'puzzleCompleted'}));
  }
}
```

- [ ] **Step 6: 메시지 수신에서 전이 감지**

`handleNativeMessage`의 `setRecordedRegions` 분기를 다음으로 교체:

```js
    if (msg.type === 'setRecordedRegions') {
      recordedRegions = msg.regions || [];
      displayMode = msg.displayMode || 'color';
      defaultColor = msg.defaultColor || '#BF85FC';
      puzzleImage = msg.puzzleImage || null;
      puzzleComplete = !!msg.puzzleComplete;
      updateMap();
      // 완성 전이 감지 — '미완성→완성'으로 바뀐 그 수신에서만 연출.
      // 첫 수신은 기준선만 설정한다(이미 완성 상태로 진입하면 연출 없이 완성 화면).
      if (displayMode === 'puzzle') {
        var cur = recordedRegions.map(function(r){ return r.nameEn; });
        if (puzzlePrevComplete === null) {
          puzzlePrevComplete = puzzleComplete; prevMatchedCodes = cur;
        } else {
          if (puzzleComplete && !puzzlePrevComplete) {
            var newCodes = cur.filter(function(c){ return prevMatchedCodes.indexOf(c) < 0; });
            playPuzzleCompletion(newCodes);
          }
          puzzlePrevComplete = puzzleComplete; prevMatchedCodes = cur;
        }
      }
    }
```

- [ ] **Step 7: 검증**

Run: `npx tsc --noEmit && npx eslint src/components/CountryMapView.tsx && node scripts/check-webview-syntax.mjs src/components/CountryMapView.tsx`
Expected: 모두 통과 — 특히 WebView 문법 검사가 스크립트 블록 파싱 성공을 출력.

- [ ] **Step 8: 커밋**

```bash
git add src/components/CountryMapView.tsx
git commit -m "feat(puzzle): 나라 지도 퍼즐 렌더링 — 공유 패턴 2벌·완성 연출

userSpaceOnUse 패턴이 지도 좌표계에 고정돼 모든 지역이 같은 그림의
자기 위치 조각을 자동 샘플링한다. 완성 판정은 RN이 내려주고(puzzleComplete),
WebView는 미완성→완성 전이에서만 새 조각 글로우+경계선 페이드를 재생한다.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: settingsStore — 모드 타입 교체 + puzzleImages

**Files:**
- Create: `src/utils/regionModeMigration.ts`
- Test: `src/utils/regionModeMigration.verify.ts`
- Modify: `src/store/settingsStore.tsx`
- Modify: `src/screens/MainScreen.tsx` (컴파일 유지용 최소 수정 2곳 — UI 개편은 Task 4)

**Interfaces:**
- Produces (Task 4가 사용):
  - `type RegionGlobalMode = 'photo' | 'puzzle'` / `normalizeRegionGlobalMode(v: unknown): RegionGlobalMode` (regionModeMigration.ts)
  - `useSettings()`에 `puzzleImages: Record<string, string>` (키=ISO3, 값=URI), `setPuzzleImages: React.Dispatch<React.SetStateAction<Record<string, string>>>`
  - `regionGlobalMode`의 타입이 `RegionGlobalMode`로 바뀜

- [ ] **Step 1: 정규화 검증 먼저 작성**

`src/utils/regionModeMigration.verify.ts`:

```ts
// 대륙 표시 모드 저장값 정규화 검증 — 구 'color' 및 정크는 전부 'photo'로.
import { normalizeRegionGlobalMode } from './regionModeMigration';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const ok = actual === expected;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) { console.log(`   기대: ${expected} / 실제: ${actual}`); failed++; }
}

console.log('▶ src/utils/regionModeMigration.verify.ts');

eq(normalizeRegionGlobalMode('puzzle'), 'puzzle', "'puzzle'은 유지");
eq(normalizeRegionGlobalMode('photo'), 'photo', "'photo'는 유지");
eq(normalizeRegionGlobalMode('color'), 'photo', "구 저장값 'color' → 'photo' (색 단독 모드 폐지)");
eq(normalizeRegionGlobalMode(undefined), 'photo', '없음 → photo (기본값)');
eq(normalizeRegionGlobalMode(null), 'photo', 'null → photo');
eq(normalizeRegionGlobalMode('PUZZLE'), 'photo', '대소문자 다른 정크 → photo (엄격 일치)');
eq(normalizeRegionGlobalMode(42), 'photo', '숫자 정크 → photo');

if (failed > 0) { console.error(`✗ ${failed}개 실패`); process.exit(1); }
console.log('✅ 모든 검증 통과');
```

- [ ] **Step 2: 실패 확인**

Run: `npx tsx src/utils/regionModeMigration.verify.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 정규화 구현**

`src/utils/regionModeMigration.ts`:

```ts
// 대륙(지역) 지도 전역 표시 모드 — 2026-08-06 퍼즐 도입과 함께 '색 단독' 모드 폐지.
// 구 저장본의 'color'와 알 수 없는 값은 전부 'photo'로 정규화한다.
// (regionDisplayModes·regionColors 저장 데이터는 지우지 않는다 — 읽기만 중단, 롤백 여지)
export type RegionGlobalMode = 'photo' | 'puzzle';

export function normalizeRegionGlobalMode(v: unknown): RegionGlobalMode {
  return v === 'puzzle' ? 'puzzle' : 'photo';
}
```

Run: `npx tsx src/utils/regionModeMigration.verify.ts` → PASS

- [ ] **Step 4: settingsStore 수정**

`src/store/settingsStore.tsx`에서 (앵커는 현재 코드 기준 — 편집 전 반드시 해당 부분을 읽을 것):

1. 상단 import에 추가: `import { normalizeRegionGlobalMode, type RegionGlobalMode } from '../utils/regionModeMigration';`
2. 컨텍스트 타입(114–115행 부근):
   ```ts
   regionGlobalMode: RegionGlobalMode;
   setRegionGlobalMode: React.Dispatch<React.SetStateAction<RegionGlobalMode>>;
   ```
3. 같은 타입 블록의 `regionColors` 항목 아래에 추가:
   ```ts
   // 나라별 퍼즐 그림 (키: ISO3, 값: 사진 URI). 없으면 기본 아트(PUZZLE_ART) 사용
   puzzleImages: Record<string, string>;
   setPuzzleImages: React.Dispatch<React.SetStateAction<Record<string, string>>>;
   ```
4. `SettingsPersistPayload`(214행 부근):
   ```ts
   regionGlobalMode?: 'color' | 'photo' | 'puzzle'; // 구 저장본 'color'는 hydrate에서 'photo'로 정규화
   ```
   그리고 `regionColors?` 아래에 `puzzleImages?: Record<string, string>;` 추가.
5. state(281행 부근): `useState<RegionGlobalMode>('photo')` 로 교체(기본값 'color' → 'photo'), 그 아래에
   ```ts
   const [puzzleImages, setPuzzleImages] = useState<Record<string, string>>({});
   ```
6. hydrate(392행 부근): `setRegionGlobalMode(p.regionGlobalMode ?? 'color');` 를 다음으로 교체:
   ```ts
   setRegionGlobalMode(normalizeRegionGlobalMode(p.regionGlobalMode));
   // 퍼즐 그림 URI는 iOS 재빌드 시 컨테이너 절대경로가 깨진다 — profilePhoto와 같은 복구
   setPuzzleImages(Object.fromEntries(
     Object.entries(p.puzzleImages ?? {}).map(([k, v]) => [k, remapDocUri(v)])
   ));
   ```
7. 저장 스냅샷 함수(477행 부근 `regionColors,` 아래)와 의존성 배열(528행 부근 `regionColors,` 아래) 양쪽에 `puzzleImages,` 추가.
8. `resetSettings` 안에서 `setRegionColors({})`가 있는 곳을 찾아 바로 아래에 `setPuzzleImages({});` 추가. `setRegionGlobalMode('color')`가 있으면 `setRegionGlobalMode('photo')`로 교체.
9. `exportSettingsBackup`/`applySettingsBackup`(629행 부근)에는 **추가하지 않는다**. exportSettingsBackup 함수 위에 주석 한 줄 추가:
   ```ts
   // puzzleImages는 백업에 넣지 않는다 — 로컬 파일 경로라 다른 기기에서 무의미하다
   ```
10. Provider의 value 객체에 `puzzleImages, setPuzzleImages,` 추가.

- [ ] **Step 5: MainScreen 컴파일 유지 (임시 — Task 4가 이 블록을 전면 교체)**

`src/screens/MainScreen.tsx` 두 곳만:

1. `dsSnapshot` ref 타입(644행 부근): `regionGlobalMode: 'color' | 'photo';` → `regionGlobalMode: 'photo' | 'puzzle';`
2. 표시 설정 시트의 `setRegionGlobalMode('color')` 호출(2211행 부근) → `setRegionGlobalMode('photo')` 로 교체하고 바로 위에 주석: `{/* 임시 — Task 4에서 사진/퍼즐 토글로 교체 */}`

(이 시점에 '색상' 버튼이 사진 모드를 가리키는 어색한 상태가 되지만, 컴파일·동작은 유지되고 Task 4가 블록을 통째로 바꾼다.)

- [ ] **Step 6: 검증 + 커밋**

Run: `npx tsc --noEmit && npm test && npx eslint src/store/settingsStore.tsx src/utils/regionModeMigration.ts`
Expected: 모두 통과 (verify +1)

```bash
git add src/utils/regionModeMigration.ts src/utils/regionModeMigration.verify.ts src/store/settingsStore.tsx src/screens/MainScreen.tsx
git commit -m "feat(puzzle): 대륙 모드 타입 photo|puzzle 교체 + 나라별 퍼즐 그림 저장

구 'color'는 hydrate에서 photo로 정규화(저장 데이터는 보존 — 읽기만 중단).
puzzleImages는 remapDocUri로 iOS 컨테이너 경로 복구, 서버 백업에는 제외.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: MainScreen — 시트 개편·지도 연결·햅틱·i18n

**Files:**
- Modify: `src/screens/MainScreen.tsx`
- Modify: `src/i18n/locales/ko.ts`, `src/i18n/locales/en.ts`

**Interfaces:**
- Consumes: `PUZZLE_ART`(Task 1) · `puzzleImages`/`setPuzzleImages`(Task 3) · CountryMapView의 `puzzleImage`/`puzzleComplete` props와 `puzzleCompleted` 메시지(Task 2)
- Produces: 없음 (종단 화면)

- [ ] **Step 1: i18n 키 추가**

`ko.ts`의 `main` 섹션, `modeDefault: '기본',`(630행 부근) 아래:

```ts
    regionPhotoMode: '지역별 사진',
    puzzle: '퍼즐',
    puzzleImageLabel: '퍼즐 그림',
    puzzleDefaultArt: '기본 아트',
    puzzleFromAlbum: '앨범',
```

`en.ts`의 같은 자리(`grep -n "modeDefault" src/i18n/locales/en.ts`):

```ts
    regionPhotoMode: 'Photos by region',
    puzzle: 'Puzzle',
    puzzleImageLabel: 'Puzzle image',
    puzzleDefaultArt: 'Default art',
    puzzleFromAlbum: 'Album',
```

- [ ] **Step 2: import·훅 연결**

MainScreen 상단에 추가(기존 import 블록에 맞춰):

```ts
import { PUZZLE_ART } from '../data/puzzleArt';
```

`useSettings()` 구조분해(595행 부근 `regionColors, setRegionColors,` 아래)에 `puzzleImages, setPuzzleImages,` 추가.

`ImagePicker`가 이미 import돼 있는지 확인(`grep -n "expo-image-picker" src/screens/MainScreen.tsx`) — 없으면 `import * as ImagePicker from 'expo-image-picker';` 추가.

- [ ] **Step 3: recordedRegions에서 색 읽기 중단**

`recordedRegions` useMemo(784행 부근)에서:
- `regionsMap.set(...)` 두 곳의 `mode: regionDisplayModes[key] || undefined,`와 `color: regionColors[key] || undefined,` 줄 삭제 (Map 값 타입 선언에서도 `mode`/`color` 제거)
- 의존성 배열에서 `regionDisplayModes, regionColors` 제거
- useMemo 위 주석에 한 줄 추가: `// 2026-08-06 퍼즐 도입 — 지역별 색/모드 읽기 중단(저장 데이터는 보존, regionModeMigration 참고)`

- [ ] **Step 4: 퍼즐 그림 선택 상태·핸들러**

`regionProgress` useMemo(858행 부근) 아래에 추가:

```ts
  // 현재 나라의 퍼즐 그림 — 사용자가 고른 게 없으면 기본 아트
  const puzzleImage = regionCountry ? (puzzleImages[regionCountry] ?? PUZZLE_ART) : PUZZLE_ART;
  // 퍼즐 그림 후보 — 이 나라 기록의 대표사진들(recordedRegions와 같은 규칙으로 이미 수집됨)
  const puzzleCandidates = useMemo(
    () => Array.from(new Set(recordedRegions.map(r => r.photo).filter((u): u is string => !!u))),
    [recordedRegions]
  );
  // 앨범에서 퍼즐 그림 선택
  const pickPuzzleImage = useCallback(async () => {
    if (!regionCountry) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setPuzzleImages(prev => ({ ...prev, [regionCountry]: uri }));
    }
  }, [regionCountry, setPuzzleImages]);
```

- [ ] **Step 5: CountryMapView 연결 + 완성 햅틱**

CountryMapView 호출부(1503행 부근) `showPopular={popularActive}` 아래에:

```tsx
                puzzleImage={puzzleImage}
                puzzleComplete={!!regionProgress && regionProgress.total > 0 && regionProgress.visited === regionProgress.total}
```

`handleRegionMessage`를 찾아(`grep -n "handleRegionMessage" src/screens/MainScreen.tsx`) `regionTapped` 처리와 같은 층위에 추가:

```ts
      if (d?.type === 'puzzleCompleted') {
        // 퍼즐 완성 — WebView 연출과 동시에 성공 햅틱
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        return;
      }
```

(`expo-haptics`가 import 안 돼 있으면 `import * as Haptics from 'expo-haptics';` 추가. 기존에 `buzz` 유틸을 쓰고 있으면 그 컨벤션을 따른다.)

- [ ] **Step 6: 표시 설정 시트 — 전역 토글 교체**

2204–2227행 부근(Task 3에서 임시 수정한 블록)을 통째로 교체:

```tsx
                {/* 대륙 글로벌 모드 — 지역별 사진 / 퍼즐 (색 단독 모드는 2026-08-06 폐지) */}
                <View style={styles.dsColorSection}>
                  <Text style={styles.dsColorLabel}>{t('main.globalDefault')}</Text>
                  <View style={styles.dsSection}>
                    <TouchableOpacity
                      style={[styles.dsOption, regionGlobalMode !== 'puzzle' && [styles.dsOptionActive, { borderColor: skinAccent.accent, backgroundColor: skinAccent.tint(0.1) }]]}
                      activeOpacity={0.7}
                      onPress={() => setRegionGlobalMode('photo')}
                    >
                      <Text style={{ fontSize: 24 }}>🖼️</Text>
                      <Text style={[styles.dsOptionText, regionGlobalMode !== 'puzzle' && styles.dsOptionTextActive]}>{t('main.regionPhotoMode')}</Text>
                      {regionGlobalMode !== 'puzzle' && <View style={[styles.dsCheck, { backgroundColor: skinAccent.accent }]} />}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dsOption, regionGlobalMode === 'puzzle' && [styles.dsOptionActive, { borderColor: skinAccent.accent, backgroundColor: skinAccent.tint(0.1) }]]}
                      activeOpacity={0.7}
                      onPress={() => setRegionGlobalMode('puzzle')}
                    >
                      <Text style={{ fontSize: 24 }}>🧩</Text>
                      <Text style={[styles.dsOptionText, regionGlobalMode === 'puzzle' && styles.dsOptionTextActive]}>{t('main.puzzle')}</Text>
                      {regionGlobalMode === 'puzzle' && <View style={[styles.dsCheck, { backgroundColor: skinAccent.accent }]} />}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 퍼즐 그림 선택 — 기본 아트 / 이 나라 기록 사진 / 앨범 */}
                {regionGlobalMode === 'puzzle' && (
                  <View style={styles.dsColorSection}>
                    <Text style={styles.dsColorLabel}>{t('main.puzzleImageLabel')}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                      {[PUZZLE_ART, ...puzzleCandidates].map((uri, i) => {
                        const selected = puzzleImage === uri;
                        return (
                          <TouchableOpacity
                            key={`${i}-${uri.slice(-24)}`}
                            activeOpacity={0.8}
                            onPress={() => {
                              if (!regionCountry) return;
                              // 기본 아트 선택 = 사용자 지정 제거(기본값 복귀)
                              setPuzzleImages(prev => {
                                const next = { ...prev };
                                if (uri === PUZZLE_ART) delete next[regionCountry];
                                else next[regionCountry] = uri;
                                return next;
                              });
                            }}
                          >
                            <Image
                              source={{ uri }}
                              style={{ width: 56, height: 56, borderRadius: 8, borderWidth: 2, borderColor: selected ? skinAccent.accent : 'transparent' }}
                            />
                            {i === 0 && (
                              <Text style={{ color: '#A1A1B0', fontSize: 9, textAlign: 'center', marginTop: 2 }}>{t('main.puzzleDefaultArt')}</Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={pickPuzzleImage}
                        style={{ width: 56, height: 56, borderRadius: 8, borderWidth: 1, borderColor: '#3E3155', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ color: '#A1A1B0', fontSize: 20 }}>＋</Text>
                        <Text style={{ color: '#A1A1B0', fontSize: 9 }}>{t('main.puzzleFromAlbum')}</Text>
                      </TouchableOpacity>
                    </ScrollView>
                  </View>
                )}
```

(`Image`가 react-native에서 import돼 있는지 확인 — MainScreen은 대형 파일이라 이미 있을 가능성이 높다. 없으면 추가.)

- [ ] **Step 7: 지역별 개별 설정 단순화**

2229행 부근 "지역별 개별 설정" 블록에서:
- 세그먼트(`dsSegmentWrap`의 `(['default','color','photo'] as const).map(...)` 전체)와 색 팔레트 블록(`isEditing && effectiveMode === 'color' && (...)`) 삭제
- `currentMode`/`effectiveMode`/`isEditing` 변수와 지역용 `editingCountryColor` 세팅 삭제
- 행에는 사진 유무 표시(dot: 사진 있으면 🖼️, 없으면 빈 dot)와 지역 이름만 남긴다:

```tsx
                      {recordedRegions.map(r => (
                        <View key={r.key} style={{ marginBottom: 8 }}>
                          <View style={styles.dsCountryRow}>
                            <View style={[styles.dsCountryDot, { backgroundColor: '#2E2E3B', alignItems: 'center', justifyContent: 'center' }]}>
                              {!!r.photo && <Text style={{ fontSize: 10 }}>🖼️</Text>}
                            </View>
                            <Text style={styles.dsCountryName} numberOfLines={1}>{r.name}</Text>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
```

- 섹션 헤더의 소급 태깅 진입점(`main.regionTagEdit` TouchableOpacity)은 **그대로 유지**한다.
- 이 시점에 `regionDisplayModes`/`setRegionDisplayModes`/`regionColors`/`setRegionColors`가 MainScreen에서 완전히 미사용이 되면: `useSettings()` 구조분해·dsSnapshot(타입/스냅샷/복원)·계정경계 prune(975행 부근 `setRegionDisplayModes(prev => pruneRegion(prev))` 등)까지 흔적을 확인해서, **prune과 dsSnapshot 복원은 남기고**(저장 데이터 정리·취소 복원은 여전히 유효) UI 참조만 없앤다. eslint 미사용 경고가 나면 해당 변수만 정리.

- [ ] **Step 8: dsSnapshot에 puzzleImages 추가**

dsSnapshot ref 타입에 `puzzleImages: Record<string, string>;` 추가, `openDisplaySettings`의 스냅샷 객체에 `puzzleImages,` 추가, `cancelDisplaySettings`에 `setPuzzleImages(s.puzzleImages);` 추가 — 시트에서 그림을 바꿨다가 바깥 탭(취소)하면 원복돼야 한다.

- [ ] **Step 9: 검증**

Run: `npx tsc --noEmit && npm test && npx eslint src/screens/MainScreen.tsx src/i18n/locales/ko.ts src/i18n/locales/en.ts`
Expected: 모두 통과

수동 시나리오(에뮬레이터/실기기 가능 시 — 불가하면 보고서에 미검증 명시):
1. 대륙 모드 진입 → 표시 설정 → 퍼즐 선택 → 방문 지역이 그림 조각, 미방문이 흑백 힌트
2. 그림 후보에서 기록 사진 선택 → 지도 즉시 반영, 바깥 탭 취소 → 원복
3. 지역별 사진 모드로 되돌리기 → 기존 동작
4. 미국(인셋) 지도에서 알래스카/하와이 조각이 자기 박스 그림으로 채워짐

- [ ] **Step 10: 커밋**

```bash
git add src/screens/MainScreen.tsx src/i18n/locales/ko.ts src/i18n/locales/en.ts
git commit -m "feat(puzzle): 표시 설정 사진/퍼즐 개편 — 그림 선택·완성 햅틱·색 UI 제거

대륙 모드는 지역별 사진/퍼즐 둘만. 퍼즐 그림은 기본 아트/이 나라 기록
사진/앨범에서 선택(나라별 저장, 취소 시 스냅샷 원복). 지역별 색 세그먼트와
팔레트는 제거하되 소급 태깅 진입점과 저장 데이터는 유지한다.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review 결과 (계획 작성 후 점검)

- **스펙 커버리지**: 렌더링 A안(패턴 2벌)=Task 2 · 완성 판정/연출=Task 2(+RN 계산 Task 4 Step 5) · 데이터 모델/마이그레이션/remap=Task 3 · 설정 UI/그림 선택=Task 4 · 기본 아트=Task 1 · ph→file 변환=Task 2 Step 1 · 지역 데이터 미수록 국가=대륙 모드 자체가 그 나라에선 안 열리므로(기존 동작) 추가 가드 불요, `puzzleComplete`는 `total > 0` 조건으로 이중 방어.
- **스펙과 다른 점 1건 (의도)**: 완성 판정을 WebView 자체 계산에서 **RN(regionProgress) 계산 후 전달**로 바꿨다 — 같은 기준(regionGeoLookup, 기존 verify로 이미 검증됨)을 한 곳만 유지해 드리프트를 없앤다. WebView는 전이 감지·연출만 담당한다. 스펙의 "RN 왕복 불필요" 취지(어긋남 방지)는 동일하게 충족.
- **타입 일관성**: `RegionGlobalMode`(Task 3) ↔ CountryMapView `displayMode` prop('color' 허용치 포함, Task 2) ↔ MainScreen 전달부(Task 4) 확인. `puzzleImage`/`puzzleComplete` 이름 전 태스크 동일.
- **플레이스홀더 없음** 확인.
