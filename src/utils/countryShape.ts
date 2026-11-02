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
 * 감량: 직전에 남긴 점에서 0.5px 미만인 점만 버린다(화면에서 안 보이는 점만 뺀다).
 *   예전엔 점 수 상한(maxPts)에 맞춰 i += step으로 일률 솎았는데, 지역마다 따로 솎이다 보니
 *   이웃 지역 경계가 서로 다른 점으로 잘려 꼭짓점이 빠진 모서리(미국 와이오밍·콜로라도·유타 등)와
 *   주 사이에 빈 틈이 뚫렸다(2026-11-02 사용자 보고, 미리보기 폭에서 미국 실루엣의 1.6%가 빔 → 0.25%).
 *   ponytail: 점 수 상한이 없다 — 미리보기 폭(≈300px)에서 미국 ≈5천·캐나다 ≈1.2만 점. 세 호출부 모두
 *   useMemo로 한 번 그리는 정적 Svg라 감당 가능. 무거워지면 지역 간 공유 경계를 한 번만 감량하는 방식으로.
 */
export function buildSilhouettePaths(
  shape: CountryShape,
  frameW: number,
  frameH: number,
): { linePath: string; dimPath: string } {
  const k = frameW / shape.dx;
  const tol = 0.5 / k; // 0.5px를 투영계 단위로
  let d = '';
  for (const ring of shape.rings) {
    let seg = '';
    let n = 0;
    let lx = 0, ly = 0;
    for (let i = 0; i < ring.length; i++) {
      const [px, py] = ring[i];
      if (n > 0 && Math.hypot(px - lx, py - ly) < tol) continue;
      lx = px; ly = py;
      seg += (n === 0 ? 'M' : 'L') + ((px - shape.minX) * k).toFixed(1) + ' ' + ((py - shape.minY) * k).toFixed(1);
      n++;
    }
    if (n >= 3) d += seg + 'Z';
  }
  return { linePath: d, dimPath: `M0 0H${frameW.toFixed(1)}V${frameH.toFixed(1)}H0Z` + d };
}
