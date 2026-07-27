# 달력 여행 밴드 표시 + 탭 시 정보 동기화 — 설계 문서

- 날짜: 2026-07-23
- 상태: 승인 대기 (스펙 리뷰 전)
- 관련 브랜치: `feat/empty-social-tab` (현재 작업 트리)

## 배경 / 목적

여행 기록 작성 시 날짜 기간을 고르는 캘린더(바텀시트)에는 이미 작성한 내 여행 날짜가 **작은 점(●)** 하나로만 표시된다. 어떤 여행인지 알 수 없고, 탭해도 날짜 기간만 채워진다.

이를 **연결 밴드(기간 띠) + 국가명 칩**으로 바꾸고, 밴드를 탭하면 **그 여행의 정보를 새 기록에 즉시 동기화**해 "같은 여행의 다른 기록"을 빠르게 작성할 수 있게 한다.

## 확정된 결정값

| 항목 | 결정 |
|------|------|
| 표시 형태 | 연결 밴드(기간을 둥근 띠로 이음) + 국가명 칩, 시작/끝에 accent 강조선 |
| 칩 내용 | **국가명만** (국기 이모지·국가코드 제외 — Windows에서 "JP"로 깨지는 문제) |
| 색상 | 하드코딩 금지. 활성 지구본 스킨의 `skinAccent.accent` 연동 (스킨 변경 시 자동 반영) |
| 동기화 범위 | 국가·기간·지역·동행 + 예산·통화·날씨·항공편·평점·태그·공개범위 |
| 동기화 제외 | 사진(medias)·사진별 글(photoTexts)·제목/본문(content)·대표사진 → **비워둠** |
| 적용 방식 | 확인 팝업 없이 **탭 즉시 전체 덮어쓰기** |
| 탭 직후 | 캘린더 바텀시트 **자동 닫힘** → 채워진 폼으로 복귀 |
| 적용 범위 | **신규 작성 시에만** 동기화. 편집 모드(`isEdit`)에선 밴드 표시만, 탭은 기존 날짜 선택 유지 |

## 아키텍처 (접근 A — recordId만 전달)

캘린더 컴포넌트는 `TravelRecord` 구조를 알 필요 없이 **recordId만** 상위로 넘긴다. 실제 필드 채우기는 화면(`NewRecordScreen`)이 담당한다. 느슨한 결합 + 기존 `editRecord` 복원 로직 재사용.

```
collectRecordedRanges(records)              // recordId·countryLabel 포함 Map 생성
        │
        ▼
NewRecordScreen ──(recordedRanges)──► CalendarBottomSheet
        ▲                                     │
        │                            밴드 렌더링 + 국가 칩
        │                                     │  (밴드 탭)
        └──onSelectRecordedTrip(recordId)◄────┘
        │
        ▼
applySourceRecord(record)  // records에서 조회 → 폼 필드 세팅 → 시트 닫기
```

## 변경 대상 (이 3개 파일만 수정)

> CLAUDE.md "지시한 파일만 수정할 것" 규칙 준수.

### 1. `src/utils/recordedDates.ts`

`collectRecordedRanges`의 값 타입을 확장한다.

- 현재: `Map<string, { start: Date; end: Date }>`
- 변경: `Map<string, { start: Date; end: Date; recordId: string; countryLabel: string }>`
  - `countryLabel`: 단일국가면 `countryName`, 다국가면 `"일본 외 2"` 형태 (`countries.length` 기준)
  - 기존 제외 규칙 유지: 타인 글(`isMyPost === false`)·임시저장(`isDraft`)·편집 중 기록(`excludeId`)
- 점(●) 전용 `collectRecordedDateKeys` 결과는 캘린더 밴드 렌더링으로 대체되므로, 캘린더에서의 점 렌더링 경로는 제거한다. (유틸 함수 자체는 다른 소비처가 있으면 유지 — 호출부 확인 후 판단)

### 2. `src/components/record/CalendarBottomSheet.tsx`

- **Props 변경**
  - `recordedRanges`를 확장된 타입으로 수신
  - 신규 `onSelectRecordedTrip?: (recordId: string, start: Date, end: Date) => void`
  - `skinAccent.accent`는 이미 수신/사용 중 → 그대로 밴드·칩 색으로 사용
- **밴드 렌더링** (셀 단위)
  - 해당 날짜가 range에 속하면 배경 틴트(accent 22% 상당) 적용
  - 둥근 모서리: **여행 시작일 또는 주 시작(일요일/그리드 첫 열)** → 왼쪽 라운드 + 좌측 accent 강조선 / **여행 종료일 또는 주 끝(토요일/그리드 마지막 열)** → 오른쪽 라운드 + 우측 accent 강조선
  - 여러 주에 걸친 여행은 주 경계에서 끊기되 각 세그먼트가 자연스럽게 이어져 보이도록 처리
  - **국가 칩**: 여행 시작일 셀에 절대배치, 텍스트 = `countryLabel`, 배경 = accent
- **탭 처리** (`handleDayPress`)
  - 탭한 날이 range에 속하면 `onSelectRecordedTrip(recordId, start, end)` 호출 → 상위에서 시트 닫음
  - range 밖의 날은 기존 동작(시작/종료일 수동 선택) 유지
  - `onSelectRecordedTrip`이 없으면(=편집 모드) 기존처럼 range 탭 시 날짜 기간만 선택

### 3. `src/screens/NewRecordScreen.tsx`

- 확장된 `collectRecordedRanges`로 `recordedRanges` 계산 (기존 `useMemo` 확장)
- `CalendarBottomSheet`에 `onSelectRecordedTrip` 전달 (신규 작성일 때만; 편집 모드면 미전달)
- **`applySourceRecord(record: TravelRecord)` 헬퍼 추가** — 기존 `editRecord` 복원 패턴 재사용
  - 세팅: `selectedCountries`(`countries ?? [{flag,name}]`), `selectedRegion`, `startDate`/`endDate`(`parseDotDate`), `selectedCompanions`, `companionFriends`, `rating`, `budget`/`currency`, `weather`, `flightType`, `keywords`, `visibility`
  - 다국가: `countries` 배열 복사 + `perCountryData` 존재 시 `perCountryStore`에 시드, `activeCountryIdx = 0`
  - **손대지 않음**: `medias`, `photoTexts`, `content`(제목/본문), `representativePhoto`
  - 마지막에 `setCalendarVisible(false)`

## 엣지 케이스

- **겹치는 여행**(같은 날 2개 이상): `recordedRanges`는 dateKey당 한 항목만 보유 → 후순위는 무시(첫 매치 유지). 흔치 않아 별도 UI 없음.
- **다국가 평점**: 국가별 평점 구조이므로 활성 국가(0번) 기준으로 폼 평점 세팅.
- **편집 모드**: 동기화 탭 비활성 (밴드는 표시). 편집 중 기록을 타 기록 정보로 덮어쓰는 사고 방지.
- **제외 규칙 유지**: 타인 글·임시저장·편집 중 기록은 밴드로 표시하지 않음.

## 검증 계획

- **타입 체크**: `npx tsc --noEmit` 무오류
- **수동 테스트 시나리오** (신규 기록 작성):
  1. 새 기록 → 날짜 캘린더 열기
  2. 기존 여행이 **밴드 + 국가명 칩**으로, **스킨 accent 색**으로 표시되는지 확인 (여러 주 걸친 여행, 한 달 2개 여행 포함)
  3. 밴드 탭 → 캘린더 자동 닫힘
  4. 폼에 국가·기간·지역·동행·예산·날씨·항공·평점·태그·공개범위가 채워지고 **사진·제목·본문은 비어있는지** 확인
  5. 지구본 스킨 변경 후 밴드 색이 따라 바뀌는지 확인
- **호환성 확인** (CLAUDE.md 규칙):
  - 편집 모드에서 기존 날짜 선택 동작이 깨지지 않는지
  - 다국가 기록 동기화 후 국가 전환(`switchCountry`) 정상 동작
  - 공통 컴포넌트·네비게이션 영향 없음 (수정 파일 3개로 한정)

## 범위 밖 (YAGNI)

- 확인 팝업 / 되돌리기 UI
- 겹치는 여행 선택 UI
- 편집 모드 동기화
- 사진·본문까지 복제하는 "완전 복제" 모드
