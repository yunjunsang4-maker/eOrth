/**
 * 지리 좌표 유틸 — 두 GPS 좌표 간 거리 계산 (Haversine)
 *
 * 외부 의존성 없이 순수 함수로 구현하여 어디서든 재사용 가능.
 */

import type { GeoPoint } from './types';

const EARTH_RADIUS_M = 6_371_000; // 지구 반지름 (m)

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * 두 좌표 사이의 직선 거리(m)를 Haversine 공식으로 계산.
 */
export function haversineDistanceM(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 좌표 배열의 평균(중심) 좌표. 빈 배열이면 null.
 * (작은 지역 내 평균이므로 단순 산술 평균으로 충분)
 */
export function averageGeoPoint(points: GeoPoint[]): GeoPoint | null {
  if (points.length === 0) return null;
  const sum = points.reduce(
    (acc, p) => ({
      latitude: acc.latitude + p.latitude,
      longitude: acc.longitude + p.longitude,
    }),
    { latitude: 0, longitude: 0 }
  );
  return {
    latitude: sum.latitude / points.length,
    longitude: sum.longitude / points.length,
  };
}
