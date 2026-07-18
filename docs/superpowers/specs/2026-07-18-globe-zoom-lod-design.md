# 3D 지구본 딥줌 + 구글맵식 LOD(지역명·국경 해상도) 설계

## 목표

기본 3D 지구본(색 활성화 폼)에서:
1. **확대 범위 대폭 확장** (현재의 ~2.5배 이상 깊이)
2. 확대할수록 **나라 이름 → 주요 도시 이름**이 구글맵처럼 단계적으로 등장
3. 확대 시 **국경선이 50m 중해상도로 교체**되어 매끄럽게 보임

사진 모드 지구본 개선은 별도 후속(이번 스코프 아님 — 단, 줌·라벨·국경 LOD는 같은 3D 지구본이라 모든 표시 모드에서 동작).

## 현재 구조 (탐색 결과)

- 3D 지구본: 구 반지름 1.0, `PerspectiveCamera(45°, near 0.1)`, 줌=카메라 dolly `targetZ` 1.3(최근접)~5.0. 글로우 셸 반지름 1.08.
- 국경선: `buildBorders(worldData, color)` — 110m GeoJSON(`vendorWorldGeo.ts`, 179 feature)의 THREE.Line 그룹. 저해상도라 확대 시 각짐.
- 라벨: 나라/도시 이름 렌더 **없음** (광고 미니카드 DOM만).
- topojson 디코더 없음(vendorD3는 d3만).

## 설계

### 1. 딥줌 (2단계 줌)

- **1단계(기존)**: dolly `targetZ` 5.0→1.3.
- **2단계(신규)**: `targetZ`가 1.3에 닿으면 추가 핀치는 `camera.zoom` 배율(1→3)로 처리 — 카메라를 구·글로우 셸 안으로 이동시키지 않아 클리핑·글로우 붕괴 없음. 합산 확대력 ≈ 기존 대비 3배+.
- **회전 감도 보정**: 드래그 회전량을 유효 줌에 반비례(`0.005 / effZoom`) — 확대 상태에서 지구가 휙 돌지 않게(구글맵 감성 필수).
- 유효 줌 지표 `effZoom`(dolly 근접도 × camera.zoom)을 LOD·라벨 단계 판정에 공용 사용.

### 2. 국경 50m LOD

- **데이터**: world-atlas의 `countries-50m` TopoJSON(약 800KB)을 받아 `src/data/vendorWorld50m.ts`로 번들(문자열). TopoJSON→GeoJSON 변환용 **미니 디코더**(topojson-client의 feature/mesh 해당분, ~60줄)를 지구본 HTML에 인라인.
- **동작**: `effZoom`이 임계(예: 확대 50% 지점) 초과 시 1회 파싱(이후 캐시) → ① `buildBorders`를 50m 데이터로 재구축 ② 대륙 채움 텍스처(`buildTexture`)도 50m worldData로 재생성 — 채움 경계와 선이 어긋나지 않게 세트로 교체. 임계 미만 복귀 시 110m로 되돌림(재생성 아닌 캐시 스왑).
- 색·국기·사진 활성화 매핑은 이름 키(`properties.name`) 기준이라 50m에서도 동일 동작. 홍콩·마카오 폴리곤은 50m 데이터에 자체 포함(없으면 110m에서 추가한 방식으로 동일 주입).
- 파싱·텍스처 재생성은 rAF 밖 비동기로, 전환 중엔 기존 표시 유지(끊김 없음).

### 3. 지역명 라벨 (나라 + 주요 도시)

- **렌더**: 단일 `<canvas id="label-layer">` 오버레이(pointer-events:none, z-index 광고핀 아래). 매 프레임(회전/줌 변화 시만) clear 후 `fillText` — DOM 수십 개 갱신보다 저렴.
- **나라 라벨**: `d3.geoCentroid`(1회 캐시) → 3D 투영(`project(camera)`, 전면 반구만). 표기는 한글(`KO_NAMES`), 흰색+어두운 헤일로. 등장 규칙: 나라의 위경도 bbox 면적 사전계산 → `effZoom` 단계별로 큰 나라부터 개수 확대(줌 낮음: 상위 ~20 → 최대 줌: 전체). 겹침 방지: 화면 그리드 셀 점유 체크(먼저 그린 큰 나라 우선).
- **도시 라벨**: 신규 `src/data/cityLabels.ts` — 세계 주요 도시 ~150개 `{ nameKo, lat, lon, tier(1=수도급·2=대도시) }` 직접 작성. `effZoom` 상위 단계에서 tier 1 → tier 2 순 등장, 작은 점 + 이름. 나라 라벨과 동일 겹침 회피.
- 폰트: 시스템 폰트(WebView), 크기 줌 비례 상한.

## 파일 변경 목록

- `src/components/GlobeView.tsx` — 3D HTML: 2단계 줌·감도 보정, label-layer 캔버스+라벨 엔진, 50m 스왑 로직, topojson 미니 디코더.
- `src/data/vendorWorld50m.ts` — 신규(countries-50m TopoJSON 문자열).
- `src/data/cityLabels.ts` — 신규(주요 도시 ~150개 한글 라벨).
- (필요 시) `src/data/vendorWorldGeo.ts` 홍콩·마카오와의 50m 정합 주입.

## 검증

- `npx tsc --noEmit`.
- 데이터: Python으로 50m TopoJSON 파싱·feature 수·홍콩/마카오 존재 확인.
- 수동: ① 최대 확대가 기존보다 훨씬 깊고 클리핑 없음 ② 확대 중 국경이 매끄럽게 교체(채움과 어긋남 없음) ③ 나라→도시 라벨 단계 등장·겹침 없음 ④ 회전 감도 자연스러움 ⑤ 저사양 프레임 확인 ⑥ 색·국기·사진 모드 모두 정상.

## 비목표 (YAGNI)

- 주/도(admin-1) 경계·이름 — 데이터 수 MB, 제외.
- 네온(aurora) 폼 딥줌 — 후속.
- 사진 모드 텍스처 해상도 개선 — 별도 진행 중 사안.
- 도시 탭 상호작용 — 라벨은 표시 전용.
