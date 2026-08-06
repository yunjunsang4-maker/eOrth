// 대륙(지역) 지도 전역 표시 모드 — 2026-08-06 퍼즐 도입과 함께 '색 단독' 모드 폐지.
// 구 저장본의 'color'와 알 수 없는 값은 전부 'photo'로 정규화한다.
// (regionDisplayModes·regionColors 저장 데이터는 지우지 않는다 — 읽기만 중단, 롤백 여지)
export type RegionGlobalMode = 'photo' | 'puzzle';

export function normalizeRegionGlobalMode(v: unknown): RegionGlobalMode {
  return v === 'puzzle' ? 'puzzle' : 'photo';
}
