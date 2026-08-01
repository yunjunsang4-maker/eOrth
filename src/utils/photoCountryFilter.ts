// 사진 GPS 좌표 → 특정 국가 안인지 오프라인 판정 (사진첩 "이 국가 사진만" 필터용).
// 지구본과 같은 세계 GeoJSON을 재사용해 네트워크·역지오코딩 없이 즉시 판정한다.
import { WORLD_GEO_TEXT } from '../data/vendorWorldGeo';

type Ring = [number, number][]; // [lon, lat]
type Feature = { properties: { name: string }; geometry: { type: string; coordinates: any } };

// GeoJSON의 구식 국가명 → 표준 이름. countryLocate.ts·GlobeView의 GEO_NAME_FIX와 같은 표다
// (같은 GeoJSON을 쓰므로 세 곳이 항상 같아야 한다).
// 이 보정이 없으면 호출부가 넘기는 표준명('United States of America' 등)이 피처의 구식
// 이름('USA')과 안 맞아 미국·영국·세르비아 등에서 GPS 필터가 조용히 사라진다.
const GEO_NAME_FIX: Record<string, string> = {
  'USA': 'United States of America',
  'England': 'United Kingdom',
  'Republic of Serbia': 'Serbia',
  'United Republic of Tanzania': 'Tanzania',
  'Macedonia': 'North Macedonia',
  'Swaziland': 'Eswatini',
  'Republic of the Congo': 'Congo',
  'West Bank': 'Palestine',
};

let worldGeo: { features: Feature[] } | null = null;
const featureCache: Record<string, Feature | null> = {};

/** 영문 국가명(GeoJSON properties.name) → 피처. 최초 호출 때 한 번만 파싱한다. */
export function getCountryFeature(nameEn: string): Feature | null {
  if (nameEn in featureCache) return featureCache[nameEn];
  if (!worldGeo) {
    try { worldGeo = JSON.parse(WORLD_GEO_TEXT); } catch { worldGeo = { features: [] }; }
  }
  // 표준명·구식 이름 어느 쪽으로 물어봐도 찾도록 양방향으로 대조한다.
  const f = worldGeo!.features.find((x) => {
    const raw = x.properties?.name;
    return !!raw && (raw === nameEn || (GEO_NAME_FIX[raw] ?? raw) === nameEn);
  }) ?? null;
  featureCache[nameEn] = f;
  return f;
}

// 레이 캐스팅 — 홀(내부 링)은 국가 판정 용도에선 무시해도 충분하다
function inRing(ring: Ring, lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 좌표가 국가 폴리곤 안인지. 국경 정밀도는 지구본 지도 수준(접경 지역 오차 가능). */
export function pointInCountry(feature: Feature, lat: number, lon: number): boolean {
  const g = feature.geometry;
  if (!g) return false;
  if (g.type === 'Polygon') return inRing(g.coordinates[0] as Ring, lon, lat);
  if (g.type === 'MultiPolygon') {
    return (g.coordinates as Ring[][][]).some((poly) => inRing(poly[0] as unknown as Ring, lon, lat));
  }
  return false;
}
