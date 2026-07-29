# src/data/regionKeyAliases.ts 재생성 파이프라인

GADM 구 지역 키 → Natural Earth 코드 별칭 표. 대륙 지도 복원 시 사용자 데이터 마이그레이션용.

```bash
# 1) NE 10m admin-1 원본 (약 40.7MB)
mkdir -p scripts/geo-tmp
curl.exe -sL -o scripts/geo-tmp/ne10m_admin1.geojson \
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson"

# 2) 생성
node node_modules/tsx/dist/cli.mjs scripts/build-region-aliases.ts
```

- GADM 백업(`Important2/gadm-backup-2026-07-28/geo`)은 저장소 **밖**에 있다. 빌드타임에만 읽는다.
- 미매칭이 출력되면 실제 행정구역인 것만 스크립트의 `MANUAL` 표에 넣고 다시 돌린다.
  NE에 없는 도시·명소는 그대로 둔다(보존 정책).
- `scripts/geo-tmp/`는 커밋하지 않는다.
- 설계 배경: `docs/superpowers/specs/2026-07-29-region-key-alias-migration-design.md`

## 최종 실행 결과 (2026-07-29, 최종 리뷰 수정 반영 후)

구 키 839개 중 821개 매칭, 미매칭 14개. 고유 코드 701개, 도시 흡수 144개.
(839는 GADM 파일에 나온 `NAME_1` 등장 횟수 총계로 중복을 포함한다. 매칭/미매칭 수는
중복을 제거한 고유 키 기준이라 821 + 14 < 839가 된다.)

리뷰에서 발견된 Critical 2건을 고치며 NE 결함 피처 5건(ARE 2·CHN 1·COL 1·MEX 1, 전부
`iso_3166_2`가 `~`로 끝나는 비공식/미분류 코드)을 인덱싱 대상에서 제외해 고유 코드가
706 → 701로 줄었다. 아래 "자체 점검" 절 참고.

### 최종 리뷰 반영 (색인 2패스화 + MANUAL 2건)

- **색인 2패스화 (Critical)** — `addName`이 first-wins라 한 패스로 돌면 앞선 피처의
  *부차* 이름(`name_alt` 등)이 뒤 피처의 *1차* 이름을 선점한다. 실제로 陝西의
  `name_alt` `"Shǎnxī"`가 정규화되어 `shanxi`가 되는 바람에, 진짜 山西(`name:"Shanxi"`,
  `CN-SX`)가 자기 이름을 못 갖고 `CHN|shanxi`가 `CN-SN`(섬서성)으로 오매칭됐다.
  이제 1패스에서 모든 피처의 `name`·`name_en`·코드를 먼저 확정하고, 2패스에서
  `name_local`·`name_alt`·`gn_name`·`woe_name`과 병합 그룹명으로 빈 자리만 채운다.
  `MANUAL`로는 못 고친다 — `MANUAL`도 결국 같은 `index`를 거치기 때문이다.
- `MANUAL['ARE|dubai'] = 'Dubay'` — 두바이는 도시가 아니라 에미리트(admin-1)이고
  NE에 `AE-DU`(`name:"Dubay"`)로 존재한다. 미매칭 → 정매칭.
- `MANUAL['USA|washingtondc'] = 'District of Columbia'` — `CITY_TO_PROV`가 메릴랜드로
  흡수하던 것을 NE의 정확한 `US-DC`로 바로잡았다(`MANUAL`이 도시 흡수보다 먼저 평가된다).
  이 항목이 도시 흡수에서 빠져 도시 흡수 수가 145 → 144가 됐다.

회귀 방지 검사는 `src/utils/regionKeyMigration.verify.ts`에 있다: 같은 국가 안에서
비-도시 별칭 키 2개 이상이 한 코드를 가리키면 실패한다(정당한 동의어
`EGY|aluqsur` ↔ `EGY|luxor`만 허용 목록).

## 자체 점검: 코드 형식 검증

`codeOf()`가 만든 최종 코드는 전부 `^[A-Z]{2}-[A-Za-z0-9]+$` 형식을 통과해야 하며,
아니면 생성기가 예외를 던지고 산출물을 만들지 않는다. NE 원본 데이터 자체의 결함이
별칭 표까지 새는 것을 생성 시점에 막기 위함 — 실제로 아래 2건을 잡아냈다.

- **UAE 결함 피처 오매칭**: NE에 UAE 피처가 진짜 푸자이라(`name:"Fujayrah"`,
  `iso_3166_2:"AE-FU"`)와 별개로 `name:"Neutral Zone"`이면서 `name_en`이 정확히
  `"Fujairah"`인 잔재 피처(`iso_3166_2:"AE-X01~"`)가 하나 더 있다. 이름 인덱싱이
  후자를 먼저 잡아 GADM의 정상 "Fujairah" 키가 존재하지 않는 폴리곤 코드로
  별칭됐었다. `iso_3166_2`가 `~`로 끝나는 피처(ARE 2건·CHN "Paracel Islands"·
  COL/MEX 이름 없는 잔재 1건씩, 총 5건)를 NE 로딩 단계에서 전부 제외하고,
  `MANUAL`에 `'ARE|fujairah': 'Fujayrah'`를 추가해 진짜 AE-FU로 가게 했다.
- **탭 문자 오염**: NE 원본의 Île-de-France 피처 8개 전부 `region_cod` 값이
  `"FR-IDF\t"`로 오염돼 있었다(파리 포함). `dash()`가 점만 하이픈으로 바꾸고
  공백류는 그대로 두던 것을 고쳐, 이제 모든 공백 문자를 제거한다.

수정 후 전체 별칭 값을 정규식으로 재검증해 위반 0건을 확인했다.

## 남은 미매칭 14건과 그 이유

`MANUAL`에 넣지 않고 그대로 둔 항목들 — 전부 실제 행정구역과 다른 세분화이거나
NE 데이터 자체에 없는 도시/명소/영토이기 때문에, 이름만 바꿔서는 올바르게 별칭을
붙일 수 없다.

- `GRC|Aegean`, `GRC|EpirusandWesternMacedonia`, `GRC|MacedoniaandThrace`,
  `GRC|Peloponnese,WesternGreeceand`, `GRC|ThessalyandCentralGreece` — GADM 쪽
  그리스 구 지역 구분이 NE의 13개 페리페리(현행 칼리크라티스 구획)보다 굵어서,
  이름 하나가 NE의 서로 다른 지역 2개를 합친 것과 대응한다(예: "MacedoniaandThrace" =
  Central Macedonia + East Macedonia and Thrace). 동일 지역의 표기차가 아니라
  세분화 자체가 달라 병합(dissolve) 로직 없이는 별칭을 붙일 수 없다.
- `GRC|Santorini`, `GRC|Mykonos`, `GRC|Zakynthos`, `GRC|Meteora` — `CITY_TO_PROV`가
  이들을 위 굵은 그리스 지역명으로 흡수하려 하지만, 그 지역명 자체가 NE에 없어
  흡수가 실패하고 도시명 직접 매칭도 실패한다(명소/섬 단위라 NE admin-1에 없음).
- `TUN|Ariana` — 튀니지의 실제 주(governorate)이지만 NE 10m admin-1 데이터셋에
  아리아나 주 자체가 통째로 빠져 있다(NE 데이터 결함/공백).
- `USA|Guam` — 괌은 미국의 준주(territory)로, NE의 US admin-1 데이터셋은 50개 주 +
  DC만 포함하고 준주는 다루지 않는다.
- `VNM|BắcKạn`, `VNM|ĐồngNai`, `VNM|HưngYên` — 베트남의 실제 성(province)이지만
  NE 데이터셋에 해당 성이 없다(일부는 "Đông Nam Bộ" 같은 옛 광역권으로만 존재).

이 15건은 지도에는 반영되지 않고 구 키 그대로 보존된다(보존 정책, 후속 태스크).
