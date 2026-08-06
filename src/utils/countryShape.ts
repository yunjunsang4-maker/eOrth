import { getCountryGeo } from '../data/countryGeo';

/**
 * 나라 실루엣(지역 경계 포함) 투영 공용 유틸.
 * 원래 PuzzlePhotoAdjustOverlay 안에 있던 것을 퍼즐 관련 UI 3곳(범위 조정 오버레이,
 * 표시 설정 시트의 실루엣 미리보기, 완성 공유 카드)이 같이 쓰도록 분리했다.
 *
 * 지도(WebView)의 d3.geoMercator와 같은 투영 수식을 쓴다(스케일 무관 — 비율만 쓴다).
 * 프레임/미리보기 비율을 shape.dx/dy로 잡으면 지도 cover-fit 결과와 잘림 없이 일치한다.
 */

// 메르카토르 투영 (경위도 → 투영계). 특이점(±90°) 방지로 위도 ±85° 클램프
export function mercPt(lon: number, lat: number): [number, number] {
  const r = Math.PI / 180;
  const la = Math.max(-85, Math.min(85, lat));
  return [lon * r, -Math.log(Math.tan(Math.PI / 4 + (la * r) / 2))];
}

export interface CountryShape {
  rings: [number, number][][];
  total: number;
  minX: number;
  minY: number;
  dx: number;
  dy: number;
}

// 나라 실루엣 투영 — 링 좌표(투영계)와 bbox. 지도의 본토 그룹과 같은 피처 집합을 쓴다.
export function buildCountryShape(countryCode: string): CountryShape | null {
  const geo = getCountryGeo(countryCode);
  if (!geo) return null;
  let feats: any[] = geo.features;
  if (countryCode === 'USA') {
    // 지도와 동일 규칙 — 알래스카·하와이는 인셋이라 본토 bbox에서 제외
    feats = feats.filter((f: any) => f.properties.NAME_1 !== 'Alaska' && f.properties.NAME_1 !== 'Hawaii');
  }
  const rings: [number, number][][] = [];
  let total = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of feats) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      for (const ring of poly) {
        const pr: [number, number][] = [];
        for (const [lon, lat] of ring) {
          const p = mercPt(lon, lat);
          if (p[0] < minX) minX = p[0];
          if (p[0] > maxX) maxX = p[0];
          if (p[1] < minY) minY = p[1];
          if (p[1] > maxY) maxY = p[1];
          pr.push(p);
        }
        rings.push(pr);
        total += pr.length;
      }
    }
  }
  const dx = maxX - minX, dy = maxY - minY;
  if (!(dx > 0) || !(dy > 0)) return null;
  return { rings, total, minX, minY, dx, dy };
}

/**
 * 실루엣 SVG 패스 — 프레임(frameW×frameH)에 맞춰 스케일한 링 패스.
 * - linePath: 나라 링들(테두리 선·클립 패스 공용 — 클립은 evenodd 규칙으로 쓴다)
 * - dimPath: 바깥 사각형 + 링 → evenodd로 나라 밖만 어둡게 덮는 딤 패스
 * maxPts: 가이드/미리보기 용도라 점을 감량한다(원본 수만 점을 그대로 그리면 무겁다)
 */
export function buildSilhouettePaths(
  shape: CountryShape,
  frameW: number,
  frameH: number,
  maxPts: number = 4000,
): { linePath: string; dimPath: string } {
  const k = frameW / shape.dx;
  const step = Math.max(1, Math.ceil(shape.total / maxPts));
  let d = '';
  for (const ring of shape.rings) {
    let seg = '';
    let n = 0;
    for (let i = 0; i < ring.length; i += step) {
      const x = ((ring[i][0] - shape.minX) * k).toFixed(1);
      const y = ((ring[i][1] - shape.minY) * k).toFixed(1);
      seg += (n === 0 ? 'M' : 'L') + x + ' ' + y;
      n++;
    }
    if (n >= 3) d += seg + 'Z';
  }
  return { linePath: d, dimPath: `M0 0H${frameW.toFixed(1)}V${frameH.toFixed(1)}H0Z` + d };
}
