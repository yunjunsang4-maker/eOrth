// 지역(도시)명 현지화 — 지역명은 한글로 저장되지만 기록에 regionNameEn이 짝으로 남고,
// 한국 시/도는 koreaRegions에 영문명(nameEn)이 있다. 이 둘을 합쳐 KO→EN 지역명 맵을 만든다.
import { KOREA_REGIONS } from '../constants/koreaRegions';
import type { TravelRecord } from '../store/recordStore';

// regionNameEn은 저장 키(지도 색·태깅 매칭용)와 영어 모드 표시 라벨을 겸한다.
// 지역 키 마이그레이션 이후 이 값은 ISO 코드(`US-NY`)가 되므로, 표시에 그대로 쓰면
// 영어 모드 사용자가 "NewYork" 대신 "US-NY"를 보게 된다. 저장 값은 그대로 두고 표시만 폴백한다.
const REGION_CODE_RE = /^[A-Z]{2}-/;

/** regionNameEn이 표시용 이름이 아니라 마이그레이션된 ISO 코드인지 */
export const isRegionCode = (s: string | undefined | null): boolean =>
  !!s && REGION_CODE_RE.test(s);

/**
 * 영어 모드 지역 표시명. regionNameEn이 코드 형태면 한글 regionName으로 폴백한다.
 * (MainScreen·PostDetailScreen·통계 화면이 같은 판정을 쓰도록 여기 한 곳에 둔다)
 */
export function regionDisplayName(
  regionName: string | undefined | null,
  regionNameEn: string | undefined | null,
  lang: string,
): string {
  const ko = regionName ?? '';
  if (lang !== 'en') return ko;
  if (!regionNameEn || isRegionCode(regionNameEn)) return ko;
  return regionNameEn;
}

/** 기록쌍(regionName↔regionNameEn) + 한국 시/도로 KO→EN 지역명 맵 구성. */
export function buildRegionEnMap(records: TravelRecord[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const kr of KOREA_REGIONS) m[kr.name] = kr.nameEn;
  for (const r of records) {
    // 코드는 표시용이 아니므로 맵에 넣지 않는다 → regionLabel이 한글 원본으로 폴백한다
    if (r.regionName && r.regionNameEn && !isRegionCode(r.regionNameEn)) m[r.regionName] = r.regionNameEn;
  }
  return m;
}

/** 한글 지역명 → 현재 언어 표기. lang!=='en'이거나 매핑이 없으면 원본(한글) 그대로. */
export function regionLabel(ko: string | undefined | null, lang: string, map: Record<string, string>): string {
  if (!ko) return '';
  if (lang !== 'en') return ko;
  return map[ko] ?? ko;
}
