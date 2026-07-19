# 지구본 기록 기반 대륙 지역 소급 활성화 (Region Retro-Tagging)

날짜: 2026-07-20 · 상태: 승인됨

## 배경

대륙(국가 지도) 뷰의 지역 활성화는 기록의 `regionNameEn`으로만 동작한다. 이 값은
"대륙 기록" 플로우나 거주국 지역 프리셋으로 기록할 때만 저장되므로, 일반 지구본
기록(해외 여행 카드)이 있는 국가라도 대륙 뷰에서는 아무 지역도 켜지지 않는다.
기존 기록에는 도시·지역 정보가 전혀 없어(레코드에 city/location 필드 없음) 자동
유추가 불가능하다.

## 결정 사항 (사용자 확정)

1. **지역 출처: 수동 소급 태깅** — 사용자가 직접 방문 지역을 선택 (GPS 유추 없음)
2. **진입점: 대륙 뷰 안내 칩** — 기록은 있는데 활성 지역이 없는 국가에서 노출
3. **저장: 국가별 독립 저장** — 기록과 분리된 `taggedRegions` 맵. 여행카드와 연결
   없음. 시트에서 한 번에 멀티선택

## 데이터 모델

`settingsStore`(이미 지역 표시 설정을 영속)에 추가:

```ts
taggedRegions: Record<string /* ISO3 */, { name: string; nameEn: string }[]>;
setTaggedRegions(iso3: string, regions: { name: string; nameEn: string }[]): void;
dismissedRegionTagChips: string[]; // 칩 X로 닫은 국가 ISO3 목록
dismissRegionTagChip(iso3: string): void;
```

- persist payload·hydrate·serialize·deps에 두 필드 포함 (스키마 버전 불변 —
  없으면 `{}`/`[]` 폴백이라 하위호환)
- **정리 규칙**: 해당 국가 기록(스냅 제외)이 0개가 되면 그 국가의 태그와 dismissed
  항목 삭제 — MainScreen의 기존 고아 prune useEffect에서 처리

## MainScreen 통합

- `recordedRegions` useMemo에서 병합: 기록 유래 지역(사진 포함) 우선, 태그 유래
  지역은 `nameEn` 미중복분만 추가. 태그 지역의 photo는 국가 대표사진 폴백(없으면
  undefined → 색 모드), key는 기존 규칙 `${ISO3}|${nameEn}` 그대로 → 지역별
  색/사진 설정 호환.
- **안내 칩**: 대륙 뷰에서 `해당 국가 기록 ≥ 1(스냅 제외) && recordedRegions 0개
  && !dismissed` 일 때 지도 하단 칩 영역에 "기록 N개가 있어요 · 방문 지역
  추가하기" 노출. 우측 X로 닫으면 해당 국가 영구 숨김.
- **지역 선택 시트**: 하단 시트, 해당 국가의 광역(주) + 인기명소 도시 목록을
  멀티선택 체크로 표시. 인기명소를 최상단 고정, 그 아래 광역 가나다순. 상단 검색
  입력(지역 수 많은 국가 대응). 저장 시 `setTaggedRegions` → 지도 즉시 반영.
  이미 태깅된 국가는 지역 표시 설정 시트의 "방문 지역 편집" 버튼으로 재진입.
- 인기명소 도시를 태깅하면 기존 `prefOf` 로직으로 상위 주가 활성화됨 — 지도 쪽
  변경 불필요. `CountryMapView`는 수정하지 않는다.

## 지역 목록 소스

`getCountryGeo(ISO3)` features에서 `{ name: NL_NAME_1 || NAME_1, nameEn: NAME_1 }`
추출. 도시 피처 판별은 homeRegions의 CITY_TO_PROV와 동일 규칙(자기 자신이 아닌
주로 매핑되면 도시) — 도시는 "인기명소" 섹션, 나머지는 "광역" 섹션.

## 검증

- `npx tsc --noEmit`
- 병합·prune 로직 verify 스크립트(`npx tsx`)
- 수동: 칩 노출 → 태깅 → 활성 확인 → 기록 전체 삭제 시 태그 정리, 지역별 색/사진
  설정 동작, 언어(ko/en) 표기
