# 지역 저장 키 별칭 마이그레이션 (GADM → Natural Earth)

날짜: 2026-07-29 · 상태: 승인됨

## 배경

대륙(국가 지역) 지도의 경계 데이터는 GADM 4.1 Level-1이었다. GADM 라이선스는 학술·비영리
이용만 무료이고 재배포·상업적 이용에 사전 허가를 요구해서, 광고 수익이 있는 앱에 데이터를
넣어 배포할 수 없었다. 2026-07-28 커밋 `cc7c152`로 데이터를 제거하고
`featureFlags.REGION_MAP_ENABLED = false`로 모드를 껐다(iOS 번들 34.4MB → 26.1MB).

대체 소스로 **Natural Earth 10m admin-1**을 실측해 채택했다. Natural Earth는 퍼블릭
도메인이라 상업 이용·재배포·수정에 제약이 없고 출처 표기 의무도 없다. 이미 이 앱이
`src/data/vendorAdmin1.ts`(지구본 딥줌 주/도 구분선)로 같은 데이터의 선(line) 추출본을
배포 중이라, 라이선스 안전성이 이미 검증된 소스다.

문제는 기존 사용자 데이터다. `regionColors`·`taggedRegions`·`regionNameEn`이 GADM 표기를
저장 키로 쓰고 있다("NewYork" 등 공백 제거형). 별칭 매핑 없이 새 데이터로 켜면 사용자가
칠해둔 색과 태깅이 전부 유실된다. 이 문서는 그 마이그레이션을 설계한다.

## 실측 근거 (2026-07-29)

`ne_10m_admin_1_states_provinces.geojson` — 40.7MB, 4,596 피처, 121 필드.

- `name_ko`가 4,589/4,596 = **99.8%** 채워져 있다. 한글명을 수동으로 채울 필요가 거의 없다.
- `iso_3166_2`가 전 대상국에 존재한다.
- FRA·ITA·ESP·GBR은 NE가 GADM보다 한 단계 아래로 세분화돼 있으나(101/110/52/232개),
  `region`·`geonunit` 필드로 상위 병합이 가능하다(18/20/19/4개).
- 26개국 dissolve 후 **701개 지역**(코드 기준 병합). 설계 시점 조사값은 706이었으나,
  구현 중 NE 자체 결함 피처 5건(`iso_3166_2`가 `~`로 끝나는 비공식 코드 — ARE 2·CHN 1·
  COL 1·MEX 1)을 색인 전에 제외하면서 701로 확정됐다. 이름 기준으로 병합하면 더 줄어드는데,
  아랍에미리트의 동명 지역 2개가 잘못 합쳐진 결과다(1절 「병합은 코드 기준」 참고).
- GADM 839개 중 정규화 매칭 실패 168개는 대부분 GADM Level-3에서 뽑았던 **도시·명소
  피처 약 90개**다. NE admin-1에 없는 것이 정상이다.
- 단순화 25%에서 26개국 1.80MB(GADM 2.69MB의 67%). 확대 렌더 비교에서 GADM과 육안 차이가
  거의 없어 25%를 채택한다.

## 결정 사항 (사용자 확정)

1. **도시·명소 피처는 상위 주로 흡수** — 기존 `homeRegions.ts`의 `CITY_TO_PROV` 매핑
   재사용. 데이터 손실 없음. 표시가 '할슈타트' → '오버외스터라이히'로 바뀌는 것은 수용.
2. **기존 한글 표기 유지** — 이미 저장된 `regionName`·`taggedRegions[].name`은 건드리지
   않는다. 사용자가 보던 과거 기록 제목이 바뀌지 않는 것을 우선한다.
3. **미매칭 키는 보존** — 변환 실패분을 삭제하지 않는다. 지도에는 안 뜨지만 데이터는
   남아, 나중에 별칭을 보강하면 자동으로 되살아난다.
4. **1회 일괄 변환** — 읽기 시 해석이 아니라 hydrate 시 재작성. 조회 지점이 MainScreen
   여러 곳·CountryMapView·homeRegions·badgeRules에 흩어져 있어 읽기 해석은 누락 위험이 크다.
5. **원본 스냅샷 보존** — 변환 직전 payload를 `regionKeyBackupV0`에 1회 저장한다.

## 1. 새 저장 키 체계

기존 구조 `` `${ISO3}|${x}` ``를 유지하고 뒷부분만 교체한다. 조회 코드가 `split('|')`을
가정하고 있어 형태 변경은 파급이 크다.

```
AUT|Oberösterreich  →  AUT|AT-4
USA|NewYork         →  USA|US-NY
```

뒷부분 코드의 출처는 셋으로 갈린다.

| 대상 | 출처 | 예 |
|---|---|---|
| 일반 22개국 | `iso_3166_2` | `AT-4`, `US-NY` |
| FRA · ITA · ESP | `region_cod` (병합 단위) | `IT-23`, `FR-GUF` |
| GBR | `gu_a3`에 `GB-` 접두 | `GB-ENG` |

`region_cod`는 점 표기(`ES.CE`), `iso_3166_2`는 하이픈(`AT-1`)이므로 **점을 하이픈으로
정규화**해 통일한다.

### NE 데이터 결함 보정 (2건)

실측에서 발견한 중복이다. 수동 보정표로 처리한다.

| 국가 | 문제 | 보정 |
|---|---|---|
| COL | 보고타와 쿤디나마르카가 둘 다 `CO-CUN` | 보고타 → `CO-DC` |
| ESP | 세우타와 멜리야가 둘 다 `ES.CE` | 멜리야 → `ES-ML` |

`adm1_code`(`COL-1399` 등)는 전부 유일하므로 최후 폴백으로 쓸 수 있다.

### 병합은 코드 기준

그룹 병합을 이름으로 하면 안 된다. 아랍에미리트에 `Neutral Zone`이라는 같은 이름의 서로
다른 지역이 2개 있어(`AE-X01~`, `AE-X02~`) 이름으로 묶으면 9개가 8개로 합쳐진다.

보정 후 26개국 **701개 코드가 전부 유일**함을 확인했다(NE 결함 피처 5건 제외 후 확정값).

## 2. 별칭 표 생성 (빌드타임)

저장소 관행(`scripts/build-countries10m.md` + 자동 생성 TS)을 따른다.

```
scripts/build-region-aliases.md   ← 절차 문서
src/data/regionKeyAliases.ts      ← 자동 생성: Record<'ISO3|구키', '신코드'>
```

**입력 3종**

- GADM 백업의 839개 `NAME_1` (`Important2/gadm-backup-2026-07-28/geo/*.ts`)
- NE admin-1 (1절의 보정·정규화 적용본)
- 기존 `homeRegions.ts`의 `CITY_TO_PROV` (도시 → 상위 주, 90개)

**매칭 4단계 — 먼저 맞는 것을 채택**

1. **도시 흡수** — `CITY_TO_PROV[ISO3][정규화(구키)]`에 걸리면 상위 주 이름으로 치환한 뒤
   2단계부터 다시 해석한다. 할슈타트 → `Oberösterreich` → `AUT|AT-4`.
2. **정규화 이름 일치** — 공백·발음구별기호·대소문자를 제거해 NE의 `name`, `name_en`,
   `name_local`, `name_alt`, `gn_name`, `woe_name`와 대조한다. `name_alt`는 `|` 구분
   다중값이라 쪼개서 본다. 정규화 규칙은 `homeRegions.ts`의 기존 `fold`와 동일하게 맞춘다.
3. **병합 그룹명 일치** — FRA·ITA·ESP·GBR은 `region`·`geonunit` 값과 대조한다.
   프랑스 `Bretagne`, 이탈리아 `Toscana` 같은 상위 이름이 여기서 잡힌다.
4. **수동 별칭표** — 나머지. 그리스 음차(`Attica`→`Attiki`), 네덜란드 `Fryslân`→`Friesland`,
   이집트 `AlUqsur`→`Luxor`, GADM 오타 `Naoasaki`→`Nagasaki`, 모로코 구 행정구역 개편분 등.

1~3단계가 대부분을 흡수하고 수동으로 채울 것은 20~40개 수준으로 예상한다. 생성 스크립트가
미매칭 목록을 출력하므로, 그걸 보고 4단계 표를 채운 뒤 다시 돌리는 반복으로 좁힌다.

**미매칭 0을 강제하지 않는다.** 남은 것은 보존 정책으로 넘기고, 스크립트가 파일 상단
주석에 남은 목록을 기록한다.

## 3. 런타임 마이그레이션

### 모듈 구성

순수 함수로 분리한다 — 저장소의 `*.verify.ts` 검증 관행을 쓰기 위해서다.

```
src/utils/regionKeyMigration.ts        ← 순수 변환 로직 (스토어 의존 없음)
src/utils/regionKeyMigration.verify.ts ← 실데이터 검증
```

### 실행 지점과 멱등성

`settingsStore`·`recordStore`의 hydrate 두 곳. 영속 payload에 `regionKeySchema?: number`를
추가하고, 없거나 `< 1`이면 변환 후 `1`로 저장한다. 이미 `1`이면 건너뛴다.

`REGION_MAP_ENABLED` 값과 무관하게 실행한다. 플래그가 꺼져 있어도 데이터를 미리 정리해
두는 편이 안전하다.

### 변환 대상 5곳

하나라도 빠지면 데이터가 어긋난다.

| 대상 | 처리 |
|---|---|
| `settingsStore.regionColors` | 키 재작성 |
| `settingsStore.skinColorStore[스킨].regionColors` | **중첩 순회** — 가장 놓치기 쉬움 |
| `settingsStore.regionDisplayModes` | 키 재작성 (`regionColors`와 동일한 복합 키) |
| `settingsStore.taggedRegions[ISO3][].nameEn` | 값 재작성, `name`(한글)은 유지 |
| `recordStore` `TravelRecord.regionNameEn` | 값 재작성, `regionName`(한글)은 유지 |

`regionNameEn`은 `src/services/`·`supabase/` 어디에도 없다. **서버로 동기화되지 않는
로컬 전용 값**이므로 서버 마이그레이션은 필요 없다.

### 충돌 규칙

도시를 상위 주로 흡수하므로 두 구 키가 하나의 신 키로 접힌다(할슈타트와 오버외스터라이히가
둘 다 `AUT|AT-4`).

**상위 주 값이 이긴다.** 도시에서 올라온 값은 그 주에 값이 없을 때만 채택한다. 사용자가
주 자체에 칠해둔 색이 도시 색으로 덮이는 것을 막는다. `taggedRegions`는 배열이므로 신 키
기준으로 중복 제거한다.

### 실패 안전

변환 함수가 throw하면 원본을 그대로 두고 버전도 올리지 않는다. 다음 실행에서 다시
시도한다. 부분 적용 상태로 굳는 것을 막는다.

### 백업 복원 경로

`applySettingsBackup`(설계 초안에서는 `importSettingsBackup`이라 적었으나 실제 함수명)도
같은 변환기를 통과시킨다. 옛 백업 JSON이 들어올 수 있는데,
이걸 빠뜨리면 복원한 사용자만 조용히 깨진다.

### 원본 스냅샷

변환 직전 payload를 `regionKeyBackupV0` 한 필드에 1회 저장한다. 색·태깅만이라 용량은
무시할 수준이다. 미매칭 보존으로 대부분 막았지만 충돌 규칙으로 덮이는 값(도시에 칠한 색)은
사라지므로, 사고 시 복구 경로를 남긴다. 몇 버전 뒤 제거한다.

## 4. 검증

`src/utils/regionKeyMigration.verify.ts`를 저장소 관행대로 작성한다(자체 assert, ✓/✗ 출력,
0/1 종료 — `npm test`가 자동으로 집어간다).

### 자동 검증 8항목

1. **전수 변환율** — 839개 구 키를 전부 넣고 매칭 수와 미매칭 목록이 기대값과 일치하는지.
   미매칭 목록을 고정값으로 박아 회귀를 잡는다.
2. **신 키 유일성** — 변환 결과 701개 코드가 충돌하지 않는지.
3. **멱등성** — `migrate(migrate(x)) === migrate(x)`.
4. **충돌 규칙** — 도시와 상위 주에 둘 다 색이 있을 때 주 색이 남는지.
5. **미매칭 보존** — 매칭 실패 키가 삭제되지 않고 남는지.
6. **중첩 순회** — `skinColorStore[스킨].regionColors`도 변환됐는지.
7. **한글명 불변** — `regionName`, `taggedRegions[].name`이 그대로인지.
8. **스키마 버전** — 실행 후 `1`이 되고 재실행 시 건너뛰는지.

**검증의 진실 원천은 `src/data/regionKeyAliases.ts`다.** GADM 백업은 `Important2/` 아래
저장소 바깥에 있어서, verify가 거기에 의존하면 다른 기기나 CI에서 깨진다.

### 수동 확인

- 실기기에서 기존 사용자 데이터로 대륙 지도에 진입해 색·태깅이 유지되는지
- 백업 export → import 왕복

## 범위 밖

- **NE 데이터 자체의 생성**(`src/data/geo/*.ts` 26개, `LOADERS` 복원,
  `REGION_MAP_ENABLED` 켜기) — 별도 작업. 이 문서는 키 마이그레이션만 다룬다.
- **도시·명소 피처의 폴리곤 복원** — 상위 주 흡수로 대체하기로 확정했다.
- **한국 시/도 프리셋**(`koreaRegions`) — GADM과 무관해 영향받지 않는다.
