# src/data/geo/*.ts 재생성 파이프라인

Natural Earth 10m admin-1 → 26개국 지역 폴리곤. 대륙 지도용.

```bash
# 1) NE 원본(약 40.7MB) — 이미 있으면 생략
mkdir -p scripts/geo-tmp
curl.exe -sL -o scripts/geo-tmp/ne10m_admin1.geojson \
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson"

# 2) 생성
node node_modules/tsx/dist/cli.mjs scripts/build-region-geo.ts

# 3) 정합성 확인 (npm test에도 포함돼 있다)
node node_modules/tsx/dist/cli.mjs src/data/regionGeoSync.verify.ts
```

- 코드 산출 규칙은 `scripts/lib/neRegionCode.ts`에만 있다. 여기서 재구현하지 마라 —
  별칭 표와 어긋나면 마이그레이션된 사용자 키가 지도에 없는 지역을 가리킨다.
- 피처 속성: `CODE`(매칭 키) · `NAME_1`(영문 표시) · `NL_NAME_1`(한글 표시).
- 국가를 추가하려면 `neRegionCode.ts`의 `ISO3` + `countryGeo.LOADERS` +
  `homeRegions.ISO2_TO_GEO` + `constants/regionCountries.ts` 넷을 함께 고친다.
  `regionGeoSync.verify.ts`가 어긋남을 잡아준다.
- 단순화율은 생성기의 `SIMPLIFY`. 25%에서 26개국 약 1.8MB.
- `scripts/geo-tmp/`는 커밋하지 않는다.
- 설계 배경: `docs/superpowers/specs/2026-07-29-region-map-restore-design.md`

## NE 원본의 '~' 결함 피처와 mapshaper 조인

NE 원본에는 `iso_3166_2`가 `~`로 끝나는 비공식/미분류 잔재 폴리곤이 5건 섞여 있다
(ARE 2·CHN 1·COL 1·MEX 1 — 실제 행정구역이 아니다). `scripts/lib/neRegionCode.ts`의
`loadNeFeatures`가 이미 이 5건을 걸러낸다.

생성기는 이 필터링을 다시 구현하지 않는다. 대신 `loadNeFeatures`가 승인한
`adm1_code` 집합으로 NE 원본을 미리 걸러(`scripts/geo-tmp/ne10m_filtered.geojson`)
mapshaper에 넘긴다. 이렇게 하지 않으면 mapshaper의 `-filter`는 `adm0_a3`만 보고
국가를 자르므로 이 5건이 각 국가의 피처 집합에 그대로 남고, `-join`이 실패해
CODE/NAME_1/NL_NAME_1이 빈 채로 출력에 섞인다(그 국가에서 "target unmatched" 경고로
드러난다). 정상 실행에서는 unmatched가 0건이어야 한다 — 하나라도 뜨면 원인을
찾을 것(새로운 결함 피처일 수 있다), 조인 실패를 무시하고 넘어가지 말 것.
