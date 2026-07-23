# 달력 여행 밴드 표시 + 탭 동기화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기록 작성 캘린더에서 기존 여행을 점(●) 대신 국가명 칩이 달린 연결 밴드로 표시하고, 밴드를 탭하면 그 여행의 정보(사진·본문 제외)를 신규 기록 폼에 즉시 채운다.

**Architecture:** 접근 A — 캘린더는 `TravelRecord` 구조를 모른 채 `recordId`만 상위로 넘긴다. `collectRecordedRanges`가 `recordId`·`countryLabel`을 포함하도록 확장하고, `CalendarBottomSheet`가 밴드를 렌더링하며, `NewRecordScreen`의 `applySourceRecord`가 기존 `editRecord` 복원 패턴을 재사용해 폼을 채운다.

**Tech Stack:** React Native (Expo), TypeScript, 자체 `*.verify.ts` 검증 러너(`npm test`), `npx tsc --noEmit` 타입 체크.

**참고 스펙:** `docs/superpowers/specs/2026-07-23-calendar-trip-band-sync-design.md`

**수정 파일 (이 3개만):**
- `src/utils/recordedDates.ts`
- `src/components/record/CalendarBottomSheet.tsx`
- `src/screens/NewRecordScreen.tsx`
- (신규 테스트) `src/utils/recordedDates.verify.ts`

---

## Task 1: `collectRecordedRanges` 확장 (recordId + countryLabel)

**Files:**
- Modify: `src/utils/recordedDates.ts:63-82`
- Test: `src/utils/recordedDates.verify.ts` (신규)

- [ ] **Step 1: 실패하는 검증 테스트 작성**

`src/utils/recordedDates.verify.ts` 생성:

```ts
// collectRecordedRanges 순수 로직 검증 — recordId·countryLabel·제외규칙·겹침
import { collectRecordedRanges } from './recordedDates';
import type { TravelRecord } from '../store/recordStore';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}

const rec = (o: Partial<TravelRecord>): TravelRecord => o as TravelRecord;

const recs: TravelRecord[] = [
  rec({ id: 'r1', countryName: '일본', countryFlag: '🇯🇵', startDate: '2025.04.06', endDate: '2025.04.09' }),
  rec({ id: 'r2', countryName: '베트남',
        countries: [{ flag: '🇻🇳', name: '베트남' }, { flag: '🇹🇭', name: '태국' }],
        startDate: '2025.05.01', endDate: '2025.05.03' }),
  rec({ id: 'd1', countryName: '프랑스', startDate: '2025.06.01', endDate: '2025.06.02', isDraft: true }),
  rec({ id: 'o1', countryName: '미국', startDate: '2025.07.01', endDate: '2025.07.02', isMyPost: false }),
];

const ranges = collectRecordedRanges(recs);

const r1 = ranges.get('2025-04-06');
assert(!!r1 && r1.recordId === 'r1', 'recordId 매핑(r1)');
assert(!!r1 && r1.countryLabel === '일본', '단일국가 라벨=일본');
assert(ranges.has('2025-04-09'), '기간 마지막날 포함');
assert(!ranges.has('2025-04-10'), '기간 밖 미포함');

const r2 = ranges.get('2025-05-01');
assert(!!r2 && r2.countryLabel === '베트남 외 1', '다국가 라벨=베트남 외 1');

assert(!ranges.has('2025-06-01'), '임시저장(draft) 제외');
assert(!ranges.has('2025-07-01'), '타인 글(isMyPost=false) 제외');

const ex = collectRecordedRanges(recs, 'r1');
assert(!ex.has('2025-04-06'), 'excludeId 기록 제외');

const overlap: TravelRecord[] = [
  rec({ id: 'a', countryName: '일본', startDate: '2025.08.01', endDate: '2025.08.05' }),
  rec({ id: 'b', countryName: '태국', startDate: '2025.08.03', endDate: '2025.08.04' }),
];
const ov = collectRecordedRanges(overlap);
assert(ov.get('2025-08-03')?.recordId === 'a', '겹침: 먼저 만난 기록(a) 유지');

if (failures > 0) { console.error(`\n${failures}개 실패`); process.exit(1); }
console.log('\n모든 검증 통과');
```

- [ ] **Step 2: 실패 확인**

Run: `npx tsx src/utils/recordedDates.verify.ts`
Expected: 타입 에러 또는 실행 실패 — 현재 `collectRecordedRanges` 반환값에 `recordId`/`countryLabel`이 없어 `r1.recordId` 접근이 컴파일/런타임에서 실패.

- [ ] **Step 3: 최소 구현 — 반환 타입 확장**

`src/utils/recordedDates.ts`의 `collectRecordedRanges`(63-82행)를 아래로 교체:

```ts
/** 밴드(기존 여행) 한 칸의 메타 — 캘린더 렌더링·탭 동기화에서 사용 */
export type RecordedRange = { start: Date; end: Date; recordId: string; countryLabel: string };

/** 기록의 국가 라벨 — 단일이면 국가명, 다국가면 '일본 외 2' */
const countryLabelOf = (r: TravelRecord): string => {
  const names = (r.countries?.map(c => c.name).filter(Boolean) as string[] | undefined) ?? [];
  if (names.length === 0 && r.countryName) names.push(r.countryName);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names[0]} 외 ${names.length - 1}`;
};

/**
 * 기록이 있는 날 → 그 기록의 전체 기간·recordId·국가라벨 맵('YYYY-MM-DD' → RecordedRange).
 * 국가 구별 없음. 겹치는 기록이 있으면 먼저 만난 기록을 유지한다.
 */
export function collectRecordedRanges(
  records: TravelRecord[],
  excludeId?: string,
): Map<string, RecordedRange> {
  const out = new Map<string, RecordedRange>();
  for (const r of records) {
    if (excludeId && r.id === excludeId) continue;
    if (r.isMyPost === false || r.isDraft) continue;
    const start = parseLocal(r.startDate) ?? parseLocal(r.date);
    const end = parseLocal(r.endDate) ?? start;
    if (!start || !end) continue;
    const days = Math.round((end.getTime() - start.getTime()) / 86400000);
    if (days < 0 || days > 400) continue;
    const meta: RecordedRange = { start, end, recordId: r.id, countryLabel: countryLabelOf(r) };
    for (let i = 0; i <= days; i++) {
      const key = toRecordedDateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
      if (!out.has(key)) out.set(key, meta);
    }
  }
  return out;
}
```

- [ ] **Step 4: 검증 통과 확인**

Run: `npx tsx src/utils/recordedDates.verify.ts`
Expected: 모든 `✓` 출력 후 "모든 검증 통과", 종료코드 0

- [ ] **Step 5: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음. (소비처인 `CalendarBottomSheet.recordedRanges` prop은 아직 `{start,end}` 타입이지만, 더 넓은 `RecordedRange` 맵은 메서드 파라미터 이변성으로 할당 허용 — 컴파일 통과)

- [ ] **Step 6: 커밋**

```bash
git add src/utils/recordedDates.ts src/utils/recordedDates.verify.ts
git commit -m "feat(record): collectRecordedRanges에 recordId·countryLabel 추가"
```

---

## Task 2: `CalendarBottomSheet` — 밴드 렌더링 + 국가 칩 + 탭 동기화 콜백

**Files:**
- Modify: `src/components/record/CalendarBottomSheet.tsx` (props 12행·타입 47-50행·handleDayPress 88-102행·셀 렌더 168-188행·스타일 274-300행 부근)

UI 컴포넌트라 단위 테스트 대신 `tsc` + 수동 검증으로 확인한다.

- [ ] **Step 1: RecordedRange 타입 import 추가**

파일 상단 import 블록(12행 `useSkinAccent` import 아래)에 추가:

```ts
import type { RecordedRange } from '../../utils/recordedDates';
```

- [ ] **Step 2: props 목록에 `onSelectRecordedTrip` 추가**

29-38행의 구조분해에서 `recordedRanges,` 다음 줄에 추가:

```ts
  recordedDates,
  recordedRanges,
  onSelectRecordedTrip,
```

- [ ] **Step 3: props 타입 확장**

47-50행의 타입 정의를 아래로 교체:

```ts
  /** 'YYYY-MM-DD' 키 집합 — 이미 기록이 있는 날짜(점 표시, 밴드 미제공 시 폴백). utils/recordedDates 참조 */
  recordedDates?: Set<string>;
  /** 'YYYY-MM-DD' → 그 기록의 기간·recordId·국가라벨. 있으면 밴드로 렌더링된다 */
  recordedRanges?: Map<string, RecordedRange>;
  /** 밴드(기존 여행)를 탭했을 때 호출 — 신규 작성 시에만 전달. 있으면 탭 즉시 이 콜백으로 동기화한다 */
  onSelectRecordedTrip?: (recordId: string, start: Date, end: Date) => void;
```

- [ ] **Step 4: `handleDayPress` 교체 — 밴드 탭 분기**

88-102행의 `handleDayPress`를 아래로 교체:

```ts
  const handleDayPress = (date: Date) => {
    const range = recordedRanges?.get(toDateKey(date));
    // 신규 작성: 밴드(기존 여행) 탭 → 여행 정보 동기화 후 상위에서 시트 닫음
    if (range && onSelectRecordedTrip) {
      onSelectRecordedTrip(range.recordId, range.start, range.end);
      return;
    }
    if (!selectingEnd) {
      // 편집/앨범 모드: 밴드 탭 시 기간만 통째 선택 (기존 동작 유지)
      if (range) {
        setTempStart(range.start); setTempEnd(range.end); setSelectingEnd(false);
        return;
      }
      setTempStart(date); setTempEnd(null); setSelectingEnd(true);
    } else {
      if (isBefore(date, tempStart!)) { setTempStart(date); setTempEnd(null); }
      else { setTempEnd(date); setSelectingEnd(false); }
    }
  };
```

- [ ] **Step 5: 셀 렌더링 교체 — 밴드 배경·강조선·국가 칩**

159-192행의 `<View style={calS.grid}>` … `</View>` 블록 전체를 아래로 교체:

```tsx
          <View style={calS.grid}>
            {grid.map((date, idx) => {
              if (!date) return <View key={`e-${idx}`} style={{ width: CELL_SIZE, height: CELL_SIZE }} />;
              const dow = date.getDay();
              const isToday = isSameDay(date, today);
              const isStart = isRangeStart(date);
              const isEnd   = isRangeEnd(date);
              const inRange = isInRange(date);
              const isEdge  = isStart || isEnd;
              const key = toDateKey(date);
              const band = recordedRanges?.get(key);
              const isTripStart = !!band && isSameDay(date, band.start);
              const isTripEnd   = !!band && isSameDay(date, band.end);
              const bandLeftRound  = !!band && (isTripStart || dow === 0);
              const bandRightRound = !!band && (isTripEnd   || dow === 6);
              const hasDot = !band && !!recordedDates?.has(key); // 밴드 없을 때만 점 폴백
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => handleDayPress(date)}
                  activeOpacity={0.7}
                  style={[calS.dayCell, { width: CELL_SIZE, height: CELL_SIZE },
                    band && [calS.recordBand, { backgroundColor: skinAccent.tint(0.20) }],
                    bandLeftRound && calS.recordBandLeft,
                    bandRightRound && calS.recordBandRight,
                    inRange && !isEdge && [calS.inRange, { backgroundColor: skinAccent.tint(0.18) }],
                    isStart && [calS.rangeStartCell, { backgroundColor: skinAccent.tint(0.18) }],
                    isEnd   && [calS.rangeEndCell, { backgroundColor: skinAccent.tint(0.18) }],
                  ]}
                >
                  {band && isTripStart && (
                    <View style={[calS.tripEdge, calS.tripEdgeLeft, { backgroundColor: skinAccent.accent }]} />
                  )}
                  {band && isTripEnd && (
                    <View style={[calS.tripEdge, calS.tripEdgeRight, { backgroundColor: skinAccent.accent }]} />
                  )}
                  {band && isTripStart && !!band.countryLabel && (
                    <View style={[calS.countryChip, { backgroundColor: skinAccent.accent }]} pointerEvents="none">
                      <Text style={calS.countryChipText} numberOfLines={1}>{band.countryLabel}</Text>
                    </View>
                  )}
                  <View style={[calS.dayInner, isEdge && [calS.edgeCircle, { backgroundColor: skinAccent.accent }]]}>
                    <Text style={[calS.dayText,
                      isToday && !isEdge && [calS.todayText, { color: skinAccent.accent }],
                      dow===0 && !isEdge && calS.sundayText,
                      dow===6 && !isEdge && calS.saturdayText,
                      isEdge && calS.edgeText,
                    ]}>{date.getDate()}</Text>
                    {hasDot && <View style={[calS.recordDot, { backgroundColor: skinAccent.accent }]} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
```

- [ ] **Step 6: 스타일 추가**

`calS` StyleSheet(209행~)에서 `recordDot` 정의(300행) 아래에 추가:

```ts
  // 기존 여행 밴드 — 셀 전체를 채워 인접일이 이어져 보이게 한다
  recordBand: {},
  recordBandLeft:  { borderTopLeftRadius: 10, borderBottomLeftRadius: 10 },
  recordBandRight: { borderTopRightRadius: 10, borderBottomRightRadius: 10 },
  // 여행 시작/끝 강조선 (레이아웃에 영향 없게 절대배치)
  tripEdge:      { position: 'absolute', top: 6, bottom: 6, width: 2, borderRadius: 1 },
  tripEdgeLeft:  { left: 0 },
  tripEdgeRight: { right: 0 },
  // 국가명 칩 — 밴드 시작일 셀 상단에 얹음
  countryChip: {
    position: 'absolute', top: -7, left: 2, zIndex: 5,
    maxWidth: CELL_SIZE + 20, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8,
  },
  countryChipText: { fontSize: 9, fontWeight: '700', color: '#0A0A0F' },
```

- [ ] **Step 7: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 8: 커밋**

```bash
git add src/components/record/CalendarBottomSheet.tsx
git commit -m "feat(record): 캘린더에 여행 밴드+국가칩 렌더링, 탭 동기화 콜백 prop 추가"
```

---

## Task 3: `NewRecordScreen` — `applySourceRecord` + 콜백 연결

**Files:**
- Modify: `src/screens/NewRecordScreen.tsx` (상태 선언부 805행 부근·CalendarBottomSheet 사용부 1819-1827행)

- [ ] **Step 1: `applySourceRecord` 헬퍼 추가**

805행 `const [keywordQuery, setKeywordQuery] = useState('');` 바로 아래에 추가. (이 위치는 참조하는 모든 setter — `setSelectedCountries`·`setActiveCountryIdx`·`setSelectedRegion`·`setStartDate`·`setEndDate`·`setSelectedCompanions`·`setCompanionFriends`·`setRating`·`setBudget`·`setCurrency`·`setWeather`·`setFlightType`·`setKeywords`·`setVisibility` — 와 `perCountryStore`·`currencyTouchedRef`·`parseDotDate`·`records`·`setCalendarVisible` 선언 이후이다.)

```tsx
  // 캘린더에서 기존 여행 밴드를 탭하면 그 여행 정보를 신규 폼에 채운다.
  // 사진(medias)·사진별 글(photoTexts)·제목/본문(content)·대표사진은 비운 채 유지한다.
  const applySourceRecord = (recordId: string, start: Date, end: Date) => {
    const src = records.find(r => r.id === recordId);
    if (!src) return;
    // 국가 — 다국가 배열 우선, 없으면 대표 국가 1개
    const countries = src.countries ?? (src.countryName ? [{ flag: src.countryFlag, name: src.countryName }] : []);
    setSelectedCountries(countries);
    setActiveCountryIdx(0);
    // 국가별 날짜·별점 시드 (다국가 기록 전환용)
    if (src.perCountryData) {
      for (const [name, d] of Object.entries(src.perCountryData)) {
        perCountryStore.current[name] = {
          startDate: parseDotDate(d.startDate),
          endDate: parseDotDate(d.endDate),
          rating: d.rating ?? 0,
        };
      }
    }
    // 대표(첫) 국가 데이터로 활성 폼 채움 — 시드 있으면 그 값, 없으면 탭한 밴드 기간
    const firstName = countries[0]?.name;
    const pcd = firstName ? perCountryStore.current[firstName] : null;
    if (pcd) { setStartDate(pcd.startDate); setEndDate(pcd.endDate); setRating(pcd.rating); }
    else     { setStartDate(start); setEndDate(end); setRating(src.rating ?? 0); }
    // 지역
    setSelectedRegion(src.regionName ? { name: src.regionName, nameEn: src.regionNameEn ?? '' } : null);
    // 동행
    setSelectedCompanions(src.companions ?? []);
    setCompanionFriends(src.companionFriends ?? []);
    // 예산·통화 — 자동 통화추천을 멈추기 위해 touched 처리
    setBudget(src.budget ? String(src.budget.amount) : '');
    setCurrency(src.budget?.currency ?? 'KRW');
    currencyTouchedRef.current = true;
    // 날씨·항공·태그·공개범위
    setWeather(src.weather ?? '');
    setFlightType(src.flightType ?? '');
    setKeywords(src.keywords ?? []);
    setVisibility(src.visibility ?? 'neighbors');
    // 캘린더 닫고 폼 복귀
    setCalendarVisible(false);
  };
```

- [ ] **Step 2: CalendarBottomSheet에 콜백 전달**

1819-1827행의 `<CalendarBottomSheet … />`에서 `recordedRanges={recordedRanges}` 다음 줄에 추가:

```tsx
        recordedRanges={recordedRanges}
        onSelectRecordedTrip={isEdit ? undefined : applySourceRecord}
```

(편집 모드에서는 `undefined` → 밴드는 표시되지만 탭 시 기존 날짜 선택 동작 유지. 편집 중 기록을 타 기록으로 덮어쓰는 사고 방지.)

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/screens/NewRecordScreen.tsx
git commit -m "feat(record): 밴드 탭 시 여행 정보 동기화(applySourceRecord) 연결"
```

---

## Task 4: 통합 검증

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 전체 검증 러너 + 타입 체크**

Run: `npm test`
Expected: `recordedDates.verify.ts` 포함 모든 검증 통과, 종료코드 0

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 2: 수동 시나리오 (신규 작성)**

`npx expo start` 후 다음을 확인:

1. 새 기록 작성 → 날짜 캘린더 열기
2. 기존 여행이 **연결 밴드 + 국가명 칩**(국기·코드 없음)으로, **지구본 스킨 accent 색**으로 표시되는지 — 여러 주에 걸친 여행, 한 달 2개 여행 포함
3. 밴드의 아무 날이나 탭 → 캘린더가 **자동으로 닫힘**
4. 폼에 **국가·기간·지역·동행·예산·통화·날씨·항공·평점·태그·공개범위**가 채워지고, **사진·제목·본문은 비어있는지** 확인
5. 다국가 여행 밴드를 탭한 뒤 국가 칩 전환(`switchCountry`) 시 날짜·별점이 국가별로 정상 표시되는지
6. 설정에서 지구본 스킨 변경 후 밴드·칩 색이 따라 바뀌는지

- [ ] **Step 3: 수동 시나리오 (호환성 — 회귀 없음)**

1. **편집 모드**: 기존 기록 편집 진입 → 캘린더에서 밴드는 보이되, 밴드 탭 시 정보 덮어쓰기 없이 **날짜 기간만** 선택되는지
2. **앨범 만들기**(`AlbumCreateScreen`): 캘린더에 기존처럼 **점(●)**이 표시되고 날짜 선택이 정상인지 (밴드/동기화 미적용)

- [ ] **Step 4: 결과 기록**

검증 결과(통과/실패 항목)를 요약한다. 실패 시 해당 Task로 돌아가 수정 후 재검증.

---

## Self-Review 결과

- **스펙 커버리지**: 표시 형태(Task 2)·국가만 칩(Task 1 countryLabel + Task 2 렌더)·스킨색 연동(Task 2 `skinAccent`)·동기화 범위(Task 3 applySourceRecord)·즉시 덮어쓰기·자동 닫힘(Task 3)·신규 전용(Task 3 `isEdit ? undefined`)·엣지(겹침 Task 1, 다국가 Task 3, 제외규칙 Task 1) 모두 태스크에 매핑됨.
- **Placeholder 스캔**: 없음. 모든 코드 블록은 실제 구현 내용.
- **타입 일관성**: `RecordedRange`(Task 1 정의) → `CalendarBottomSheet` prop(Task 2) → `onSelectRecordedTrip(recordId, start, end)` 시그니처(Task 2) → `applySourceRecord(recordId, start, end)`(Task 3) 일치. setter 이름은 실제 소스(NewRecordScreen 606·608·771·772·788·789·802·803·804행 등)와 대조 확인.
