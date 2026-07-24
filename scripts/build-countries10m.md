# src/data/vendorCountries10m.ts 재생성 파이프라인

10m 나라별 폴리곤(일체형 벡터 대륙 채움+테두리용). Natural Earth 10m admin-0 → 단순화 → TopoJSON → TS 문자열.

```bash
mkdir -p scripts/geo-tmp && cd scripts/geo-tmp

# 1) Natural Earth 10m admin-0 countries (약 13MB GeoJSON, NAME/NAME_KO 포함)
curl.exe -sL -o ne10m_countries.geojson \
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson"

# 2) 필드 정리(name=NAME, name_ko=NAME_KO) + 단순화(30%, 굴곡 유지) + TopoJSON(object명 countries, 양자화 1e5)
#    현실적 굴곡을 더 원하면 simplify % 를 40~50 으로 올릴 것(크기 증가).
npx -y mapshaper ne10m_countries.geojson \
  -filter-fields NAME,NAME_KO -rename-fields name=NAME,name_ko=NAME_KO \
  -simplify visvalingam 30% keep-shapes -clean \
  -rename-layers countries \
  -o format=topojson quantization=100000 ne10m.topo.json

# 3) TS 번들 문자열로 래핑 → src/data/vendorCountries10m.ts
node -e "const fs=require('fs');const s=fs.readFileSync('ne10m.topo.json','utf8');fs.writeFileSync('../../src/data/vendorCountries10m.ts','export const COUNTRIES_10M_TOPO = '+JSON.stringify(s)+';\n');"
```

- 앱 사용: WebView가 `need10mCountries` 요청 → RN이 `COUNTRIES_10M_TOPO` 전송 → HTML `topoDecode(JSON.parse(topo),'countries')`.
- `name`은 앱 규약(영문 표준명)과 일치, `name_ko`는 한글명.
- 결과 크기 ~1.35MB(30%). 기존 vendorLand10m(4MB)+vendorBorders10m(4.8MB)을 대체하므로 순 번들 감소.
- scripts/geo-tmp/ 는 재생성 가능한 스크래치라 커밋 제외(.gitignore).
