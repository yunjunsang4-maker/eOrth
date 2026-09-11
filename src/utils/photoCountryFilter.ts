// 사진 GPS 좌표 → 특정 국가 안인지 오프라인 판정 (사진첩 "이 국가 사진만" 필터용).
//
// ⚠️ 2026-09-11: 이 파일이 들고 있던 **두 번째 point-in-polygon 구현**(110m vendorWorldGeo +
//    자체 GEO_NAME_FIX + 자체 inRing)을 전부 지우고 `countryLocate`에 위임한다.
//    왜: 국가 판정이 두 곳에 있으면 한쪽만 고쳐진다. 실제로 그렇게 됐다 — 여행 불러오기는
//    10m로 올려 제네바를 CH로 맞췄는데, 이 필터는 110m라 같은 사진을 FR로 봐서
//    '스위스 사진만' 필터에서 조용히 사라졌다. 이제 **판정은 countryLocate 한 곳**뿐이다.
//    부수 효과: 구멍(내부 링) 처리와 작은 영토 우선 정렬이 공짜로 따라온다(옛 inRing은 구멍을 무시했다).
//
// API 모양은 호출부(`AlbumCreateScreen`)를 안 건드리려고 그대로 뒀다. `getCountryFeature`가
// 돌려주는 값은 이제 GeoJSON 피처가 아니라 **불투명 토큰**이다 — 안을 들여다보지 말 것.
import { NO_POLYGON_CODES, countryCodeByNameEn, locateCountry } from './countryLocate';

/** `getCountryFeature`의 반환 — 내부 표현이다. 호출부는 truthy 검사와 전달만 한다. */
export type CountryToken = { code: string };

/**
 * 영문 국가명 → 판정 토큰. 이름을 ISO2로 못 풀면 null(호출부가 `countryFeature &&`로 거른다).
 * 이름 표기 흔들림(`Czech Republic` vs `Czechia` 등)은 countryLocate의 별칭 표가 흡수한다.
 */
export function getCountryFeature(nameEn: string): CountryToken | null {
  const code = countryCodeByNameEn(nameEn);
  // 폴리곤이 없는 나라(바티칸)는 토큰을 안 준다. 주면 모든 좌표가 false가 되어
  // 필터가 "사진 0장"이 된다 — 110m 시절엔 피처를 못 찾아 필터가 그냥 꺼졌었다.
  return code && !NO_POLYGON_CODES.has(code) ? { code } : null;
}

/**
 * 좌표가 그 국가 안인지. Natural Earth 10m 기준이라 국경 정밀도는 여행 불러오기와 동일하다.
 * ⚠️ 폴리곤이 없는 나라(바티칸 — 10m 단순화에서 소실)는 항상 false다.
 */
export function pointInCountry(token: CountryToken, lat: number, lon: number): boolean {
  return locateCountry(lat, lon)?.code === token.code;
}
