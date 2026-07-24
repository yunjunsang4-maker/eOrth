// 지역(도시)명 현지화 — 지역명은 한글로 저장되지만 기록에 regionNameEn이 짝으로 남고,
// 한국 시/도는 koreaRegions에 영문명(nameEn)이 있다. 이 둘을 합쳐 KO→EN 지역명 맵을 만든다.
import { KOREA_REGIONS } from '../constants/koreaRegions';
import type { TravelRecord } from '../store/recordStore';

/** 기록쌍(regionName↔regionNameEn) + 한국 시/도로 KO→EN 지역명 맵 구성. */
export function buildRegionEnMap(records: TravelRecord[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const kr of KOREA_REGIONS) m[kr.name] = kr.nameEn;
  for (const r of records) {
    if (r.regionName && r.regionNameEn) m[r.regionName] = r.regionNameEn;
  }
  return m;
}

/** 한글 지역명 → 현재 언어 표기. lang!=='en'이거나 매핑이 없으면 원본(한글) 그대로. */
export function regionLabel(ko: string | undefined | null, lang: string, map: Record<string, string>): string {
  if (!ko) return '';
  if (lang !== 'en') return ko;
  return map[ko] ?? ko;
}
