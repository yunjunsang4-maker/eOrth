// src/data/regionGeoSync.verify.ts
// 별칭 표(마이그레이션된 사용자 키) ↔ 지오 데이터(지도) ↔ 국가 목록 3종의 정합성 검증.
// 이게 깨지면 사용자 색이 조용히 하나도 안 뜬다 — 예외도 로그도 없다.
import { REGION_KEY_ALIASES } from './regionKeyAliases';
import { getCountryGeo, GEO_COUNTRY_CODES } from './countryGeo';
import { ISO2_TO_GEO } from '../constants/homeRegions';
import { REGION_COUNTRIES } from '../constants/regionCountries';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// 지오의 (ISO3, CODE) 집합
const geoCodes = new Set<string>();
for (const iso of GEO_COUNTRY_CODES) {
  const fc = getCountryGeo(iso);
  for (const f of fc?.features ?? []) geoCodes.add(`${iso}|${f.properties.CODE}`);
}

// 1. 별칭 표의 모든 코드가 지오에 존재하는가 (반대 방향은 정상 — NE에만 있는 지역)
{
  const missing: string[] = [];
  for (const [oldKey, code] of Object.entries(REGION_KEY_ALIASES)) {
    const iso = oldKey.slice(0, oldKey.indexOf('|'));
    if (!geoCodes.has(`${iso}|${code}`)) missing.push(`${iso}|${code} (구 키 ${oldKey})`);
  }
  eq(missing, [], '별칭 표의 모든 코드가 지오 데이터에 존재');
}

// 2. 목록 3중 동기화
{
  const fromLoaders = [...GEO_COUNTRY_CODES].sort();
  const fromIso2 = [...new Set(Object.values(ISO2_TO_GEO))].sort();
  const fromCountries = REGION_COUNTRIES.map(c => c.code).sort();
  eq(fromIso2, fromLoaders, '동기화: ISO2_TO_GEO == LOADERS');
  eq(fromCountries, fromLoaders, '동기화: REGION_COUNTRIES == LOADERS');
}

// 3. 지오 피처가 세 속성을 모두 갖추고 CODE 형식이 맞는가
{
  const bad: string[] = [];
  const CODE_RE = /^[A-Z]{2}-[A-Za-z0-9]+$/;
  for (const iso of GEO_COUNTRY_CODES) {
    for (const f of getCountryGeo(iso)?.features ?? []) {
      const p = f.properties || {};
      if (!CODE_RE.test(p.CODE || '')) bad.push(`${iso}: CODE="${p.CODE}"`);
      else if (!p.NAME_1) bad.push(`${iso}|${p.CODE}: NAME_1 없음`);
      else if (!p.NL_NAME_1) bad.push(`${iso}|${p.CODE}: NL_NAME_1 없음`);
    }
  }
  eq(bad.slice(0, 10), [], '지오 피처 속성 3종 + CODE 형식');
}

// 4. 국가 안에서 CODE가 중복되지 않는가
{
  const dup: string[] = [];
  for (const iso of GEO_COUNTRY_CODES) {
    const seen = new Set<string>();
    for (const f of getCountryGeo(iso)?.features ?? []) {
      const c = f.properties?.CODE;
      if (seen.has(c)) dup.push(`${iso}|${c}`); else seen.add(c);
    }
  }
  eq(dup, [], 'CODE 중복 없음');
}

// 5. 병합 대상국의 지역 수
{
  const got: Record<string, number> = {};
  for (const iso of ['FRA', 'ITA', 'ESP', 'GBR']) got[iso] = getCountryGeo(iso)?.features.length ?? 0;
  eq(got, { FRA: 18, ITA: 20, ESP: 19, GBR: 4 }, '병합 대상국 지역 수');
}

// 6. 외곽링 감김 방향(winding)이 전부 CW인가 — 지도의 d3.geoMercator(구면 투영)는
//    외곽링 CW를 가정한다. CCW(RFC 7946, mapshaper 기본 출력)가 섞이면 그 폴리곤이
//    "지구 전체 - 해당 지역"으로 반전돼 나라가 사각형 하나로 칠해지고 탭도 오동작한다.
//    실제로 출시 직전 이 사고가 났다 — 생성기의 reverse-winding이 빠지면 여기서 잡힌다.
{
  const ringArea = (r: number[][]) => {
    let a = 0;
    for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
    return a / 2;
  };
  const ccw: string[] = [];
  for (const iso of GEO_COUNTRY_CODES) {
    for (const f of getCountryGeo(iso)?.features ?? []) {
      const g = f.geometry;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      for (const poly of polys) {
        // 외곽링(첫 링)만 검사 — 구멍(내부링)은 반대 방향이 정상이다
        if (ringArea(poly[0]) > 0) { ccw.push(`${iso}|${f.properties.CODE}`); break; }
      }
    }
  }
  eq(ccw.slice(0, 10), [], '외곽링 winding 전부 CW (d3 구면 투영 요건)');
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
