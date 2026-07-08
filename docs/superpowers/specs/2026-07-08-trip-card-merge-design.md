# 여행 카드 합치기 (프로필 탭 트래블 아카이브) — 설계

날짜: 2026-07-08
상태: 사용자 승인 완료

## 목적

프로필 탭의 Travel archive에서 자동 그룹핑(출국~귀국 세션, 국가별 분리)으로 나뉜 여행 카드들을
사용자가 직접 골라 하나의 카드로 합칠 수 있게 한다.

## 사용자 결정 사항

- 인터랙션: **선택 모드** — 헤더 우측 버튼으로 모드 진입, 카드 탭으로 2장 이상 선택, 하단 바에서 확정
- 대표 카드: **첫 번째로 선택한 카드** — 제목·커버·국기·날짜를 유지하고 나머지 카드의 기록만 흡수
- 카드 분리(되돌리기) 기능은 v1 범위에서 제외

## UI 설계

### 진입점 (Travel archive 헤더 우측)
- `gridSt.gridHeaderRow`에 우측 버튼 추가 — Travel badge 헤더의 "전체 보기"(`sectionLink`)와 같은 스타일
- 합칠 수 있는 카드(tripGroups 기반 카드)가 2장 미만이면 버튼 숨김
- 병합 모드 중에는 라벨이 "취소"로 바뀜

### 선택 모드
- 안내 문구(아카이브 부제 자리): "합칠 카드를 순서대로 선택하세요 — 첫 번째 카드가 대표가 돼요"
- 카드 탭 = 선택/해제 (여행 상세 이동 대신). 선택 카드에 보라 네온 테두리 + 체크 뱃지, 첫 카드에 "대표" 뱃지
- 모드 중 길게 눌러 드래그(순서 변경) 비활성
- 하단 고정 바: "n장 합치기" 버튼, 2장 이상 선택 시 활성화
- legacy 더미 카드(tripGroups에 없는 id)는 선택 불가 (현재 실데이터는 전부 tripGroups)

### 확정 흐름
1. "n장 합치기" 탭 → Alert 확인: "선택한 n장을 '{대표 카드 제목}'(으)로 합칠까요? 합친 후에는 되돌릴 수 없어요."
2. 확인 시 `mergeTripGroups(targetId, sourceIds)` 호출
3. cardOrder(드래그 순서)에서 삭제된 카드 id 제거
4. LayoutAnimation으로 그리드 재배치 + 병합 모드 종료

## 데이터 설계

### recordStore: `mergeTripGroups(targetId: string, sourceIds: string[])`
- target 그룹의 `records`에 source 그룹들의 record id를 **중복 제거하며** 순서대로 이어붙임
- source 그룹은 tripGroups에서 삭제
- target의 title/coverRecordId/coverUri/countryName/countryFlag/date/regionName은 그대로 유지
- 저장은 기존 스토어 영속화 경로(AsyncStorage) 그대로 사용

### 엣지 케이스
- 다국가 분할 카드: 같은 기록이 두 카드에 있어도 중복 제거로 안전
- 여행 수 통계(displayTrips.length): 자동 감소
- 보관된 기록: mappedThumbnails 단계에서 기존과 동일하게 필터됨

## 수정 파일

| 파일 | 변경 |
|---|---|
| `src/store/recordStore.tsx` | mergeTripGroups 추가 (타입+구현+provider) |
| `src/screens/ProfileScreen.tsx` | 헤더 버튼, 선택 모드, 하단 바, 병합 실행 |
| `src/i18n/locales/ko.ts` / `en.ts` | profile.merge* 키 추가 |

## 검증

- `npx tsc --noEmit` 통과
- 수동 시나리오: 카드 2장 병합 / 3장 병합 / 1장만 선택 시 버튼 비활성 / 취소 / 병합 후 여행 상세·통계·드래그 정상
