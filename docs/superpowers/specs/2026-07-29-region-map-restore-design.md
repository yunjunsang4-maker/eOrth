# 대륙 지도 복원 — Natural Earth 데이터 생성·배선·플래그 ON

날짜: 2026-07-29 · 상태: 승인됨

## 배경

대륙(국가 지역) 지도는 2026-07-28 커밋 `cc7c152`로 꺼졌다. 데이터가 GADM 4.1이었는데
라이선스가 상업 이용·재배포를 막아서 `src/data/geo/*.ts` 26개국과 `countryGeo.LOADERS`를
비우고 `REGION_MAP_ENABLED = false`로 전환했다.

대체 소스는 **Natural Earth 10m admin-1**로 확정했다(퍼블릭 도메인). 저장 키 마이그레이션은
선행 작업으로 완료·병합됐다 — 상세는
`docs/superpowers/specs/2026-07-29-region-key-alias-migration-design.md`.

이 문서는 남은 3단계를 다룬다: **NE 지역 데이터 생성 → 소비자 코드 배선 → 플래그 ON.**
이것이 끝나면 지구본/대륙 토글이 다시 나타난다.

## 선행 작업이 남긴 상태

- 사용자의 저장 키는 이미 `` `${ISO3}|${코드}` ``(`USA|US-NY`)로 변환됐다. `regionColors`·
  `regionDisplayModes`·`taggedRegions[].nameEn`·`TravelRecord.regionNameEn` 전부.
- `src/data/regionKeyAliases.ts`에 구 키 821개의 별칭 표가 있다.
- `homeRegions.ISO2_TO_GEO`(26)와 `MainScreen.REGION_COUNTRIES`(26)는 **제거되지 않고
  그대로 남아 있다.** 데이터와 로더만 걷어냈다.

## 폐기하는 이전 계약

선행 계획서는 "`src/data/geo/*.ts`의 `nameEn` 자리에 코드를 넣으라"고 적었다. **이 계약은
폐기한다.** 실제 소비자 코드를 열어보니 `CountryMapView.tsx`에서 `NAME_1`이 매칭 키와
영문 표시명을 겸하고 있다. 코드를 그 자리에 넣으면 지역 검색(`normEn`), 미국 인셋
하드코딩(`f.properties.NAME_1==='Alaska'`), 라벨이 전부 조용히 깨진다. 알래스카가 지도에서
사라지는데 예외는 나지 않는다.

대신 **매칭 키를 별도 속성으로 분리**한다(1절).

## 결정 사항 (사용자 확정)

1. **속성 분리** — `CODE`(매칭) · `NAME_1`(영문 표시·검색) · `NL_NAME_1`(한글 표시).
   `CountryMapView`는 매칭 지점만 `CODE`로 바꾸고 나머지는 그대로 둔다.
2. **인기명소 기능은 UI까지 제거** — 도시·명소 90개를 상위 주로 흡수하기로 확정했으므로
   NE 데이터에 도시 피처가 없다. 데이터 없는 UI를 남기면 누르는 사람은 고장으로 여긴다.
   제거 대상은 **지도 위의 도시 피처 표시**(칩·도시 탭·상위 주 자동매칭)다. `CITY_TO_PROV`
   자체는 GPS 도시명을 거주 지역으로 정규화하는 별개 용도로 계속 쓰이므로 남긴다(2절).
3. 단순화 25% (선행 작업에서 확대 렌더 비교로 승인).
4. 대상 26개국 유지 — 국가 확장은 이 작업의 범위가 아니다.

## 1. 데이터 생성

`scripts/build-region-geo.ts`(신규)가 26개국 파일을 굽는다. `scripts/build-countries10m.md`의
mapshaper 파이프라인과 같은 계열이다.

```
NE 10m admin-1 → 26개국 필터 → dissolve(FRA·ITA·ESP·GBR) → 25% 단순화
              → precision 0.001 → src/data/geo/{ISO3}.ts
```

### 피처 속성

| 속성 | 값 | 출처 | 용도 |
|---|---|---|---|
| `CODE` | `US-NY` | 코드 산출 규칙(아래) | 매칭 키 — 저장 키의 뒷부분 |
| `NAME_1` | `New York` | NE `name_en` 우선, 없으면 `name`. dissolve 국가는 그룹명 | 영문 표시·검색·인셋 판정 |
| `NL_NAME_1` | `뉴욕` | NE `name_ko`, 비면(0.2%) `NAME_1` | 한글 표시 |

### 코드 산출 로직은 공유 모듈로 추출한다

**이번 설계에서 가장 깨지기 쉬운 지점이다.** 코드를 만드는 규칙(`iso_3166_2` /
`region_cod` / `GB-${gu_a3}`, 점→하이픈 정규화, 콜롬비아 보고타·스페인 멜리야 보정 2건,
`~`로 끝나는 결함 피처 5건 제외, 1차 이름 우선 2패스 색인)이 이미
`scripts/build-region-aliases.ts` 안에 있다.

새 스크립트에 같은 로직을 다시 쓰면 반드시 어긋난다. 어긋나는 순간 마이그레이션해둔
사용자 키와 지도의 `CODE`가 안 맞아 색이 하나도 안 뜬다 — 예외도 로그도 없다.

→ `scripts/lib/neRegionCode.ts`로 추출해 두 스크립트가 공유한다. `build-region-aliases.ts`도
이걸 쓰도록 바꾼다. 규칙이 한 곳에만 존재하게 된다.

### 1차 이름 충돌 assert

공유 모듈에 "서로 다른 코드의 두 피처가 같은 1차 이름(`name`/`name_en`)을 주장하면 throw"를
넣는다. 선행 작업에서 파킹한 잔여 위험이다 — `USA|washington`(워싱턴주 vs D.C.)과
`MEX|mexico`(멕시코주 vs 연방구)가 현재는 NE 피처 순서 덕에 우연히 정답이다. NE를 다시
받는 이번이 정확히 위험한 시점이다.

### 미국 인셋 축소

NE의 미국 admin-1은 51개(50주+D.C.)라 **괌과 호놀룰루가 없다.** 괌은 NE에서 별도
국가(`GUM`)로 잡히고, 호놀룰루는 GADM Level-3 도시 피처였다. 인셋은 알래스카·하와이 둘만
남는다. 괌 기록이 있던 사용자는 미국 지도에서 그 지역을 못 본다 — 기록 자체와 지구본
표시는 영향받지 않는다.

목표 용량 약 1.8MB. 번들 26.1MB → 약 27.9MB.

## 2. 소비자 코드 배선

### `src/data/countryGeo.ts`

`LOADERS`에 26줄 복원. `getCountryGeo`·`GEO_COUNTRY_CODES` 시그니처는 불변.

### `src/components/CountryMapView.tsx`

| 바꿀 것 | 이유 |
|---|---|
| `activeRecordFor` 호출 6곳의 `d.properties.NAME_1` → `CODE` | 활성 지역 판정이 저장 키와 같은 축이어야 한다 |
| `onRegionClick`의 `regionEn: NAME_1` → `CODE` | MainScreen이 이 값을 `regionNameEn`으로 저장한다 |
| `prefOf`·`isCity`·`setPopular` 경로 제거 | 도시 피처가 없어 항상 항등 함수 |
| 인셋 `['Alaska','Hawaii','Guam','Honolulu']` → `['Alaska','Hawaii']`, 564행 Honolulu 특례 제거 | NE 미국에 둘이 없다 |
| 검색(`normEn`)·라벨·툴팁 | **그대로 둔다** — `NAME_1`/`NL_NAME_1`이 계속 이름이다 |

### `src/constants/homeRegions.ts`

두 번째로 미묘한 곳이다. `normalizeHomeRegion`은 GPS 도시명("Yokohama")을 거주 지역으로
정규화하는데, 지금은 `r.nameEn`을 문자열 비교에 쓴다. `nameEn`이 `JP-14`가 되면 **이 비교가
조용히 무의미해진다.** 아무 지역도 안 잡히고 `null`을 반환해 거주국 기록의 지역 그룹핑이
통째로 죽는다.

→ `HomeRegion`에 영문명을 하나 더 둔다.

```ts
interface HomeRegion {
  name: string;    // 한글 표시명 (NL_NAME_1)
  nameEn: string;  // 저장 키 = CODE ('JP-14')  ← 호출부가 저장하는 값
  latin: string;   // 영문명 (NAME_1) — 매칭 전용
}
```

`nameEn`이 코드를 담아 이름과 내용이 어긋나지만, 이 값을 저장하는 호출부
(`taggedRegions`·`regionNameEn`)가 이미 마이그레이션된 코드 체계다. 여기서 이름을 바꾸면
오히려 저장 계층과 어긋난다. 주석으로 못 박는다.

- `CITY_TO_PROV`는 **남긴다.** 도시 피처 판정용이 아니라 GPS 도시→주 정규화용으로 여전히
  유효하다. 반환값이 GADM 주 이름이므로 `latin`과 대조하도록 바꾼다.
- `isCityFeature` 제거.
- `getCountryRegionOptions`는 항상 비는 `cities`를 없애고 `HomeRegion[]`를 반환하도록
  평탄화한다.

### `src/screens/MainScreen.tsx`

인기명소 칩(1417-1423)·`popularActive` state(684)·`showPopular` prop(1444)·
스타일(2394-2398) 제거. `getCountryRegionOptions` 반환 형태 변경 반영(839).

## 3. 플래그 전환

동기화 4곳 중 2곳은 이미 온전하다.

| 지점 | 현재 | 할 일 |
|---|---|---|
| `homeRegions.ISO2_TO_GEO` | 26개 그대로 | 없음 |
| `MainScreen.REGION_COUNTRIES` | 26개 그대로 | 없음 |
| `src/data/geo/*.ts` | 디렉터리 없음 | 생성 |
| `countryGeo.LOADERS` | `{}` | 26줄 복원 |

**코치마크 토글 단계는 자동으로 돌아온다.** `MainScreen.tsx:486-489`가
`...(REGION_MAP_ENABLED ? [토글 단계] : [])` 형태이고, `toggleRef` 측정(`:431`)과 번역 키
(`main.coachToggleTitle/Desc`)가 그대로 남아 있다. 손댈 것이 없다.

플래그 전환은 **마지막 커밋으로 분리**한다. 데이터와 소비자 코드가 전부 들어간 뒤 한 줄만
바꾸면, 문제가 생겼을 때 그 커밋만 되돌려 즉시 끌 수 있다. 같은 커밋에서 이 플래그의 긴
주석(현재 "OSM으로 재구축한다"고 적혀 있음)을 실제 이력에 맞게 고친다.

## 4. 검증

### 가장 중요한 자동 검증

`REGION_KEY_ALIASES`의 모든 값(코드)이 새 geo 데이터의 `CODE` 집합에 존재하는지 대조한다.
둘 다 `src/data/` 아래에 있어 `*.verify.ts`가 직접 import할 수 있다.

이게 어긋나면 마이그레이션해둔 사용자 키가 지도에 없는 지역을 가리켜 **색이 조용히 하나도
안 뜬다.** 두 단계로 나눠 설계한 이유가 정확히 이 위험이고, 완전히 자동화된다.

반대 방향(geo에는 있는데 별칭 표에 없는 코드)은 정상이다 — NE에만 있고 GADM에는 없던
지역이다.

### 생성기 자체 점검 — 실패하면 파일을 쓰지 않는다

- 코드 형식 `^[A-Z]{2}-[A-Za-z0-9]+$`
- 1차 이름 충돌 assert (1절)
- dissolve 결과 개수: FRA 18 · ITA 20 · ESP 19 · GBR 4

### 목록 3중 동기화

`LOADERS` 키 == `ISO2_TO_GEO` 값 == `REGION_COUNTRIES` 코드. 하나만 빠져도 그 나라에서
조용히 빈 지도가 나온다.

### WebView JS 문법 검사

`CountryMapView.tsx:197-676`은 템플릿 리터럴 안의 JS라 **TypeScript가 오타를 전혀 안
잡는다.** 이번에 그 안을 여러 곳 고치므로, `<script>` 본문을 뽑아 파서에 통과시키는 검사를
둔다. 저장소에 이런 스크립트가 아직 없어 새로 만든다.

### 수동 확인 (자동화 불가)

- 26개국을 순회하며 지도가 그려지고 지역 탭이 반응하는지
- 마이그레이션을 거친 기존 데이터에서 색·태깅이 실제로 지도에 뜨는지 (이 작업의 최종 목적)
- 미국 인셋(알래스카·하와이)과 지역 검색

## 범위 밖

- **대상 국가 확장** — NE는 전 세계를 담고 있어 국가 추가가 거의 공짜지만, 이번 작업은
  기존 26개국 복원이다. 한국(KOR) 추가도 여기 포함된다.
- **도시·명소 폴리곤 복원** — 상위 주 흡수로 대체하기로 확정했다.
- **선행 작업에서 파킹한 나머지 2건** — `applySettingsBackup`의 무조건 스키마 상승,
  `MainScreen:791`의 코드 노출 가능성. 둘 다 이 작업과 독립적이다.
