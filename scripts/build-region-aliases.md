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

## 최종 실행 결과 (2026-07-29)

구 키 839개 중 820개 매칭, 미매칭 15개. 고유 코드 706개, 도시 흡수 145개.

## 남은 미매칭 15건과 그 이유

`MANUAL`에 넣지 않고 그대로 둔 항목들 — 전부 실제 행정구역과 다른 세분화이거나
NE 데이터 자체에 없는 도시/명소/영토이기 때문에, 이름만 바꿔서는 올바르게 별칭을
붙일 수 없다.

- `ARE|Dubai` — `CITY_TO_PROV`에 ARE 항목이 아예 없어 도시 흡수가 안 됨. 두바이는
  행정구역(에미리트)이자 도시이지만, 이번 태스크 범위 밖(보존 정책으로 이관).
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
