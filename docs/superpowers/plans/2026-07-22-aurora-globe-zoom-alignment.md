# Aurora 지구본 확대 정렬 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aurora(Neon) 지구본을 확대할 때 국경 구분선이 육지 경계에 밀착하고 색면 모자이크가 사라지도록, `GlobeView.tsx`의 Aurora HTML 내 반지름·임계값을 조정한다.

**Architecture:** A안 — 벡터 국경선 반지름을 육지에 근접시켜 정사영 시차를 제거하고(변경1), 고해상 지역창을 더 일찍 활성화해 모자이크 밴드를 덮고(변경2), 10m 벡터선 페이드를 지역창(10m 마스크) 활성과 맞물려 해안선 겹침을 없앤다(변경3). 딥줌 극단에서 잔여 시차가 남으면 C 하이브리드(국경선을 지역 텍스처에 함께 굽기)를 조건부로 얹는다.

**Tech Stack:** React Native (Expo), TypeScript, WebView 내 Three.js + D3 (HTML 문자열 `neonGlobeHTML`).

**설계 문서:** `docs/superpowers/specs/2026-07-22-aurora-globe-zoom-alignment-design.md`

---

## 중요 제약 (모든 태스크 공통)

- **수정 파일은 `src/components/GlobeView.tsx` 단 하나.** 다른 파일 절대 수정 금지 (CLAUDE.md 파일 수정 규칙).
- **Aurora(`neonGlobeHTML`, 약 1745~2708행) 내부만 수정.** Classic(`globeHTML`, 약 54~1743행)의 유사 코드(`REGION_AT = 5` @1264, `smoothstep01(4.5, 5.8, zf)` @1206 등)는 **건드리지 않는다.** Classic은 변수명이 `zf`이고 `= 5`에 공백이 있어 old_string이 겹치지 않는다 — 각 Edit의 old_string을 아래 명시된 그대로 사용하면 Aurora만 매칭된다.
- 자동화 테스트 하네스가 없으므로 각 태스크의 검증은 `npx tsc --noEmit`(TSX 래퍼 타입) + 육안 확인이다. HTML 문자열 내부 JS 로직 오류는 tsc가 잡지 못하므로 숫자 값과 문자열 유일성을 눈으로 재확인한다.
- 수치는 **Fable + 루프 스킬 튜닝의 출발점**이다. Task 4에서 육안으로 최종 확정한다.

---

## File Structure

- **Modify:** `src/components/GlobeView.tsx` — Aurora HTML(`neonGlobeHTML`) 내부의 벡터 국경 반지름 4곳, `REGION_AT` 1곳, `borders10` 페이드 임계값 1곳.

변경 대상 행 (2026-07-22 기준, Edit 전 반드시 재확인):

| 위치 | 현재 | 변경 후 | 소속 |
|------|------|---------|------|
| 2347 | `buildWorldLinesMerged(world110Data, 1.002)` | `... 1.0008)` | Aurora |
| 2350 | `buildWorldLinesMerged(world50Data, 1.002)` | `... 1.0008)` | Aurora |
| 2357 | `buildPolylinesMerged(borders10Lines, 1.0025)` | `... 1.0009)` | Aurora |
| 2369 | `buildPolylinesMerged(admin1Lines, 1.001)` | `... 1.0008)` | Aurora |
| 2377 | `var REGION_AT=5;` | `var REGION_AT=3.5;` | Aurora |
| 2345 | `smoothstep01(4.5, 5.8, z)` | `smoothstep01(3.5, 4.5, z)` | Aurora |

---

## Task 0: 작업 브랜치 생성

**Files:** 없음 (git 작업)

- [ ] **Step 1: 작업 트리 상태 확인**

Run: `git status`
Expected: `feat/empty-social-tab` 브랜치, 워킹 트리 clean (설계 문서 커밋 `ad7b07d` 이후)

- [ ] **Step 2: 전용 브랜치 생성**

```bash
git checkout -b fix/aurora-globe-zoom-alignment
```

Expected: `Switched to a new branch 'fix/aurora-globe-zoom-alignment'`

---

## Task 1: 벡터 국경선 반지름 정렬 (변경 1 — 시차 제거)

**Files:**
- Modify: `src/components/GlobeView.tsx` (Aurora, 약 2347/2350/2357/2369행)

**관찰 대상 (현재 증상):** 확대 시 국경선이 색면 해안선에서 바깥으로 떠 보인다. 원인은 선(R=1.002~1.0025)과 육지(R=1.0/1.0006)의 반지름 차. 이 태스크로 선을 육지에 근접시킨다.

- [ ] **Step 1: 대상 4개 행이 Aurora 내부인지 재확인**

Run: `grep -n "buildWorldLinesMerged(world110Data\|buildWorldLinesMerged(world50Data\|buildPolylinesMerged(borders10Lines\|buildPolylinesMerged(admin1Lines" src/components/GlobeView.tsx`
Expected: 각 1건씩, 모두 2340~2370행대(Aurora `updateVectorLines()` 내부). Classic에는 이 함수명이 없어야 함(Classic은 `buildBorders`/`buildBordersMerged` 사용).

- [ ] **Step 2: 110m 국경 반지름 변경**

old_string:
```
    vecBorders110=buildWorldLinesMerged(world110Data, 1.002); globe.add(vecBorders110);
```
new_string:
```
    vecBorders110=buildWorldLinesMerged(world110Data, 1.0008); globe.add(vecBorders110);
```

- [ ] **Step 3: 50m 국경 반지름 변경**

old_string:
```
    vecBorders50=buildWorldLinesMerged(world50Data, 1.002); globe.add(vecBorders50);
```
new_string:
```
    vecBorders50=buildWorldLinesMerged(world50Data, 1.0008); globe.add(vecBorders50);
```

- [ ] **Step 4: 10m 국경 반지름 변경**

old_string:
```
    borders10Group=buildPolylinesMerged(borders10Lines, 1.0025); globe.add(borders10Group);
```
new_string:
```
    borders10Group=buildPolylinesMerged(borders10Lines, 1.0009); globe.add(borders10Group);
```

- [ ] **Step 5: admin1(주/도선) 반지름 변경**

old_string:
```
    admin1Group=buildPolylinesMerged(admin1Lines, 1.001); globe.add(admin1Group);
```
new_string:
```
    admin1Group=buildPolylinesMerged(admin1Lines, 1.0008); globe.add(admin1Group);
```

- [ ] **Step 6: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 신규 오류 없음 (기존 무관 오류가 있으면 diff로 확인해 이번 변경과 무관함을 확인)

- [ ] **Step 7: 커밋**

```bash
git add src/components/GlobeView.tsx
git commit -m "fix(globe): Aurora 벡터 국경선 반지름을 육지에 근접(시차 제거)

110m/50m 1.002→1.0008, 10m 1.0025→1.0009, admin1 1.001→1.0008.
정사영에서 선-육지 반지름 차를 ~10배 축소해 확대 시 어긋남 완화.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 지역창 조기 활성 (변경 2 — 모자이크 밴드 제거)

**Files:**
- Modify: `src/components/GlobeView.tsx` (Aurora, 약 2377행)

**관찰 대상 (현재 증상):** 줌 2.6~4.5에서 육지가 4096 전역 텍스처로 늘어나 모자이크. 고해상 지역창(3072)이 `REGION_AT*0.9=4.5`부터라 이 밴드를 덮지 못함.

- [ ] **Step 1: Aurora의 `REGION_AT`만 대상인지 확인**

Run: `grep -n "var REGION_AT" src/components/GlobeView.tsx`
Expected: 2건. `var REGION_AT = 5;`(공백 있음, Classic @1264)와 `var REGION_AT=5;`(공백 없음, Aurora @2377). 아래 old_string(공백 없음)은 Aurora만 매칭.

- [ ] **Step 2: REGION_AT 값 변경 (Aurora만)**

old_string:
```
var REGION_AT=5; // 전역 텍스처 LOD 재생성을 없앤 대신 지역 창이 더 일찍 채움을 이어받는다
```
new_string:
```
var REGION_AT=3.5; // 지역 창을 더 일찍 켜 모자이크 밴드(줌 2.6~4.5) 제거 — 활성 z>=3.15, land10m 요청 z>2.45
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 신규 오류 없음

- [ ] **Step 4: 커밋**

```bash
git add src/components/GlobeView.tsx
git commit -m "fix(globe): Aurora 지역창 조기 활성(REGION_AT 5→3.5)

고해상 지역창이 줌 ~3.15부터 채움을 이어받아 확대 시 육지 모자이크 밴드 제거.
전역 4096 텍스처는 유지(8192 iOS 메모리 함정 회피).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 10m 벡터선 페이드 정합 (변경 3 — 해안선 겹침 제거)

**Files:**
- Modify: `src/components/GlobeView.tsx` (Aurora, 약 2345행)

**관찰 대상 (현재 증상):** 지역창 채움은 10m 마스크인데, 그 시점 보이는 벡터선이 50m라 해안선이 서로 다르게 그려져 겹침. `borders10` 페이드를 지역창 활성 대역으로 앞당겨 채움 마스크(10m)와 선(10m) 원본을 일치시킨다.

- [ ] **Step 1: Aurora의 `t10` 정의행만 대상인지 확인**

Run: `grep -n "smoothstep01(4.5, 5.8" src/components/GlobeView.tsx`
Expected: 2건. `smoothstep01(4.5, 5.8, zf)`(Classic @1206)와 `smoothstep01(4.5, 5.8, z)`(Aurora @2345). 아래 old_string(`z)`)은 Aurora만 매칭.

- [ ] **Step 2: borders10 페이드 임계값 변경 (Aurora만)**

old_string:
```
  var t10=borders10Lines ? smoothstep01(4.5, 5.8, z) : 0;
```
new_string:
```
  var t10=borders10Lines ? smoothstep01(3.5, 4.5, z) : 0;
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 신규 오류 없음

- [ ] **Step 4: 커밋**

```bash
git add src/components/GlobeView.tsx
git commit -m "fix(globe): Aurora 10m 벡터선 페이드를 지역창 활성과 정합(4.5~5.8→3.5~4.5)

지역창(10m 마스크) 활성 대역에서 10m 벡터선이 주선이 되어 채움-선 해안선 겹침 제거.
10m 데이터 도착 전에는 기존 50m 벡터로 자연 폴백.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 육안 검증 및 튜닝 (Fable + 루프)

**Files:** 없음 (실행/관찰). 필요 시 Task 1~3의 수치를 재조정하는 추가 커밋만.

- [ ] **Step 1: 앱 실행**

Run: `npx expo start` (또는 에뮬레이터: `npx expo start --android`)
참고: 에뮬레이터는 ANGLE 렌더러 + wipe-data 필요(메모리 `eorth-emulator-launch`).

- [ ] **Step 2: Aurora 지구본에서 방문국으로 줌 3/4/5/6 단계 관찰**

체크리스트:
1. 색면(육지) 모자이크가 사라졌는가
2. 국경선이 해안선에 밀착하는가(바깥으로 뜨지 않음)
3. z-파이팅 깜빡임이 없는가 — 있으면 Task 1 반지름을 1.0008 → 1.001~1.0012로 상향
4. 지역창 전환 시 활성색이 순간적으로 꺼지지 않는가
5. 날짜변경선 부근(경도 ±180°)에서 창이 전역으로 폴백하며 깨지지 않는가

- [ ] **Step 3: 회귀 확인**

- Classic 지구본으로 전환 → 확대해도 이전과 동일(무영향) 확인
- 피드 광고 슬롯/하단 탭/색활성화 유지 확인

- [ ] **Step 4: 필요 시 수치 재조정 후 커밋**

육안으로 확정한 `REGION_AT`, 반지름, 페이드 임계값이 초기값과 다르면 해당 행만 재수정 후:
```bash
git add src/components/GlobeView.tsx
git commit -m "fix(globe): Aurora 확대 정렬 수치 육안 튜닝 확정"
```

- [ ] **Step 5: C 하이브리드 필요 여부 판정**

Step 2에서 가장 깊은 줌에도 잔여 시차가 눈에 띄면 Task 5(C 하이브리드)를 진행. 충분하면 Task 5 생략하고 종료.

---

## Task 5 (조건부): C 하이브리드 — 딥줌 국경선을 지역 텍스처에 함께 굽기

> Task 4에서 딥줌 잔여 시차가 확인된 경우에만 진행. 그렇지 않으면 생략.

**Files:**
- Modify: `src/components/GlobeView.tsx` (Aurora `buildRegionTexture()` 약 2417~2461행, `updateVectorLines()`의 `borders10` opacity 로직 약 2361행)

**목표:** 딥줌 구간에서 채움+국경선을 한 투영·한 반지름 래스터로 만들어 완전 정렬. 지역 캔버스(3072/좁은 span)라 선 선명도 유지.

- [ ] **Step 1: 관찰 — 현재 지역 텍스처에는 선이 구워지지 않음**

`buildRegionTexture()`는 `destination-in`(10m 마스크) 후 `source-over`로 복귀하고 끝난다(약 2455행). 선은 별도 벡터(`borders10Group`)로만 그려진다.

- [ ] **Step 2: 지역 캔버스에 10m 국경선 흰 스트로크 굽기 (벡터 borders10과 동일 소스)**

`buildRegionTexture()`의 `if(land10){…}` 마스크 블록 종료(`}` 약 2456행) 직후, 반환(`var tex=...` 약 2457행) 직전에 아래를 삽입한다.

**중요 — 원본 해상도 일치:** 채움은 `land10`(10m) 마스크로 잘려 있으므로, 구워지는 선도 반드시 벡터 `borders10Group`과 같은 소스인 **`borders10Lines`(10m 해안+국경)**여야 채움 가장자리와 선이 정확히 겹친다. `src.features`(50m 국가 폴리곤)를 스트로크하면 해안선 모양(50m)이 마스크(10m)와 달라 "선이 뜨는" 증상이 재발하므로 쓰지 않는다. `borders10Lines`는 폴리라인 배열(`lines[i]`=좌표 배열)이라 `path(f)`가 아니라 수동 `moveTo/lineTo`로 그린다. 창 밖 라인은 `land10[i].b`와 동일한 bounds-스킵 패턴으로 건너뛴다(라인 경계 1회 캐시 `bl.__b`).

old_string:
```
    ctx.fill();
    ctx.globalCompositeOperation='source-over';
  }
  var tex=new THREE.CanvasTexture(c);
```
new_string:
```
    ctx.fill();
    ctx.globalCompositeOperation='source-over';
  }
  // C 하이브리드: 10m 국경/해안선(벡터 borders10과 동일 소스)을 같은 proj·같은 캔버스에 구워
  // 딥줌 시차를 원천 제거. 마스크(destination-in) 이후 source-over라 채움 위에 얹힌다.
  // 벡터 borders10Group은 지역창 활성 시 페이드아웃(updateVectorLines)해 이중 표시 방지.
  if(borders10Lines){
    ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.lineWidth=2; ctx.lineJoin='round'; ctx.lineCap='round';
    ctx.beginPath();
    for(var bi=0;bi<borders10Lines.length;bi++){
      var bl=borders10Lines[bi];
      if(!bl.__b){ // 라인 경계 1회 캐시 — 창 밖 라인 스킵(land10[i].b와 동일 패턴)
        var mnx=180,mny=90,mxx=-180,mxy=-90;
        for(var bk=0;bk<bl.length;bk++){ var pk=bl[bk]; if(pk[0]<mnx)mnx=pk[0]; if(pk[0]>mxx)mxx=pk[0]; if(pk[1]<mny)mny=pk[1]; if(pk[1]>mxy)mxy=pk[1]; }
        bl.__b=[mnx,mny,mxx,mxy];
      }
      var bb=bl.__b;
      if(bb[2]<wMinLon||bb[0]>wMaxLon||bb[3]<wMinLat||bb[1]>wMaxLat) continue; // 창 밖 스킵
      for(var bj=0;bj<bl.length;bj++){
        var bp=proj(bl[bj]);
        if(bj===0) ctx.moveTo(bp[0],bp[1]); else ctx.lineTo(bp[0],bp[1]);
      }
    }
    ctx.stroke();
  }
  var tex=new THREE.CanvasTexture(c);
```

- [ ] **Step 3: 딥줌에서 10m 벡터선 페이드아웃(굽은 선과 이중 표시 방지)**

`updateVectorLines()`에서 `borders10Group` opacity가 지역창 완전 활성(`regionMat`이 거의 1)일 때 0으로 수렴하도록 보정한다. 지역창 페이드값을 참조.

old_string:
```
  if(borders10Group){ var o3=0.92*t10; borders10Group.userData.mat.opacity=o3; borders10Group.visible=o3>0.01; }
```
new_string:
```
  // 지역창이 켜질수록 벡터 10m선은 물러난다 — 굽은 선(지역 텍스처)과 이중으로 겹치지 않게.
  var regFade=(typeof regionMat!=='undefined' && regionMat) ? regionMat.opacity : 0;
  if(borders10Group){ var o3=0.92*t10*(1-regFade); borders10Group.userData.mat.opacity=o3; borders10Group.visible=o3>0.01; }
```

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 신규 오류 없음

- [ ] **Step 5: 육안 검증**

앱 실행 후 딥줌(줌 5~6+)에서:
1. 국경선이 채움 해안선과 완전 밀착(굽은 선이므로 시차 0)
2. 지역창 페이드 인/아웃 시 선이 이중으로 겹치거나 급히 사라지지 않음
3. 선이 육지 밖 바다로 새지 않음(마스크 이후 스트로크 확인)

- [ ] **Step 6: 커밋**

```bash
git add src/components/GlobeView.tsx
git commit -m "fix(globe): Aurora 딥줌 국경선을 지역 텍스처에 함께 굽기(C 하이브리드)

채움+선을 한 투영·한 캔버스 래스터로 만들어 딥줌 잔여 시차 완전 제거.
지역창 활성 대역에서 벡터 10m선은 페이드아웃해 이중 표시 방지.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 완료 기준 (Definition of Done)

- Aurora 지구본 확대 시: 육지 모자이크 없음, 국경선이 해안선에 밀착, z-파이팅 없음
- `npx tsc --noEmit` 신규 오류 없음
- Classic 지구본 무영향 (수정 범위 밖)
- 광고 슬롯/탭/색활성화/날짜변경선 폴백 회귀 없음
- 수정 파일은 `src/components/GlobeView.tsx` 하나
