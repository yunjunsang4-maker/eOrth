# 홍콩·마카오 별도 지역 분리 설계

## 목표

현재 홍콩·마카오는 세계 지도 데이터에 없어 **중국 영역에 합쳐진다**. 대만처럼 **별도 지역**으로 분리해, 지구본에서 따로 색칠·사진 활성화되고, 그곳에서 찍은 사진이 홍콩/마카오로 잡히게 한다.

## 현재 상태 (탐색 결과)

- **이미 있음**: `constants/countries.ts`에 홍콩(`hk 홍콩 hong kong` 🇭🇰 아시아)·마카오(`mo 마카오 macau` 🇲🇴 아시아) 등록됨 → 국기·한글명·대륙·통계·배지는 자동 반영. 홍콩은 CASINO_COUNTRIES에도 포함.
- **없음**: ① 지구본 지도 폴리곤(`vendorWorldGeo.ts`, 177개 feature, China=idx30 MultiPolygon, Taiwan=idx162) ② `countryLocate.ts`(사진 GPS→나라, ray casting) EN_TO_ISO 매핑 ③ `MainScreen.tsx` KO_TO_EN ④ `GlobeView.tsx` EN_TO_ISO·KO_NAMES.
- **판정 경로**: 사진→나라는 `countryLocate.ts`의 `locateCountry`(ray casting, winding 무관). `countryGeo.ts`는 별개(지도뷰·거주지역).
- **winding**: 지구본은 d3.geoPath 렌더 → Taiwan·China 모두 **CW(시계방향, signed area<0)**. 신규 폴리곤도 CW여야 정상 채움(반대면 지구 전체가 채워짐).

## 핵심 충돌: 순서

홍콩/마카오 좌표는 중국 폴리곤 안에 있다. 두 요구가 상충:
- **지구본 그리기**: 나중 feature가 위에 그려짐 → 홍콩/마카오가 중국 **뒤(끝)**에 와야 보임.
- **GPS 판정**: 먼저 매칭되는 나라 채택 → 홍콩/마카오가 중국보다 **먼저** 잡혀야 함.

→ 배열 순서 하나로 둘 다 만족 불가. **분리 해결**: feature는 배열 **끝에 추가**(그리기 위), 판정은 `countryLocate`에서 **bbox 면적 작은 것 먼저** 테스트(엔클레이브 일반 규칙 — 홍콩·마카오뿐 아니라 모든 내포 영토에 올바름).

## 설계

### 1. 지도 폴리곤 추가 — `vendorWorldGeo.ts`
- features 배열 **끝에** 2개 추가(중국 뒤 → 지구본에서 위에 그려짐):
  - `{"name":"Hong Kong"}` — 홍콩 영역 간소화 폴리곤(CW). 대략 lon 113.83–114.44, lat 22.14–22.55를 따르는 8각형(북쪽은 선전 경계 ~22.55 안쪽).
  - `{"name":"Macau"}` — 마카오 간소화 폴리곤(CW). lon 113.52–113.60, lat 22.10–22.22 소형 사각형.
- 둘 다 CW(signed area 음수) 확인 후 삽입.

### 2. 판정 우선순위 — `countryLocate.ts`
- shape 목록을 **bbox 면적 오름차순 정렬**(작은 영토 먼저) 후 point-in-polygon. → 중국 안의 홍콩/마카오 좌표가 홍콩/마카오로 판정.
- EN_TO_ISO에 `'Hong Kong':'hk', 'Macau':'mo'` 추가(없으면 shape 자체가 스킵됨).

### 3. 이름 매핑
- `MainScreen.tsx` KO_TO_EN: `'홍콩':'Hong Kong', '마카오':'Macau'`.
- `GlobeView.tsx` EN_TO_ISO: `"Hong Kong":"hk", "Macau":"mo"`.
- `GlobeView.tsx` KO_NAMES: `"Hong Kong":"홍콩", "Macau":"마카오"`.
- (일관성: 영문 표기 "Macau"로 통일 — countries.ts term·ISO 'mo'와 일치.)

## 소급 (비목표)
- 이미 "중국"으로 저장된 홍콩/마카오 지역 사진은 **자동 재분류 안 함**(YAGNI). 앞으로 찍는 사진만 올바로 분류. (원하면 별도 마이그레이션.)

## 파일 변경 목록
- `src/data/vendorWorldGeo.ts` — 홍콩·마카오 feature 2개 추가(끝).
- `src/utils/countryLocate.ts` — bbox 면적 정렬 + EN_TO_ISO 2개.
- `src/screens/MainScreen.tsx` — KO_TO_EN 2개.
- `src/components/GlobeView.tsx` — EN_TO_ISO·KO_NAMES 각 2개.

## 검증
- `npx tsc --noEmit`, `npx tsx src/utils/countryLocate.verify.ts`(있으면).
- Python으로 신규 폴리곤 CW·면적 정렬 확인.
- 수동: ① 홍콩/마카오 GPS 사진 → 홍콩/마카오로 분류(중국 아님) ② 지구본에서 홍콩/마카오 별도 색칠·사진 활성 ③ 중국 본토 사진은 여전히 중국 ④ 통계·배지 대륙(아시아) 정상.

## 비목표 (YAGNI)
- 정밀 폴리곤(간소화로 충분). 소급 재분류. 대만↔중국 병합(요청 아님).
