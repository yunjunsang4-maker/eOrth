# 온보딩 시점 장기체류 사용자(A-full) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 온보딩에서 "지금 장기체류 중"을 선언하면 체류 카드가 생성되고, 과거 사진 가져오기가 그 체류국 사진을 체류 카드로 흡수하며 시작일이 실제 사진 날짜로 자동 백데이팅된다.

**Architecture:** 이미 병합된 장기체류 기능(startStay·TripGroup.stay·stayMachine)을 재사용한다. import 흡수는 검증된 `clusterForeignTrips`를 건드리지 않고, 카드 생성 확정 지점(`ImportPhotoSelectScreen`)에서 순수 함수 `classifyImportTarget`으로 stay/trip 분기만 추가한다. 온보딩 토글 뒤에만 활성화돼 기존 사용자 흐름은 불변.

**Tech Stack:** React Native (Expo), TypeScript, react-i18next. 검증: `npx tsc --noEmit`, `npx tsx <file>.verify.ts`, 수동 플로우.

**참고 스펙:** `docs/superpowers/specs/2026-07-16-onboarding-active-stay-design.md`
**전제:** 장기체류 기능 병합 완료(`startStay(countryName, type)`, `TripGroup.stay {type,status,startedAt,endedAt?,lastActiveAt}`, `activeStayGroup`, `StayType`).

---

## 검증 방식

- 순수 로직은 `src/**/*.verify.ts` + `npx tsx`로 실행(기존 `stayMachine.verify.ts` 패턴).
- UI/스토어는 `npx tsc --noEmit` + 실기기 수동 플로우.

## 파일 구조 (생성/수정)

- 생성: `src/utils/importRouting.ts` — `classifyImportTarget` 순수 함수
- 생성: `src/utils/importRouting.verify.ts` — 단위 검증
- 수정: `src/store/recordStore.tsx` — `absorbIntoStay(recordId, recDate?)` 액션(체류 카드 append + 시작일 백데이팅), 실시간 stay append에도 백데이팅 1줄
- 수정: `src/screens/BasicInfoScreen.tsx` — 장기체류 토글·체류국 모달·유형, handleFinish에서 startStay
- 수정: `src/screens/ImportPhotoSelectScreen.tsx` — classifyImportTarget으로 stay 흡수/trip 분기
- 수정: `src/i18n/locales/ko.ts`·`en.ts` — 온보딩 토글·유형 라벨 문구

---

## Phase 1 — import 분류 순수 함수 (TDD)

### Task 1: classifyImportTarget + 검증

**Files:**
- Create: `src/utils/importRouting.ts`
- Create: `src/utils/importRouting.verify.ts`

- [ ] **Step 1: 검증 파일 먼저 작성 (실패 예상)**

```ts
// src/utils/importRouting.verify.ts
import { classifyImportTarget } from './importRouting';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  if (actual !== expected) { failed++; console.error(`✗ ${msg}\n   expected ${expected}\n   got      ${actual}`); }
  else console.log(`✓ ${msg}`);
}

// 체류국과 같으면 stay
eq(classifyImportTarget('일본', '대한민국', '일본'), 'stay', '체류국 → stay');
// 제3국(거주국·체류국 아님) → trip
eq(classifyImportTarget('태국', '대한민국', '일본'), 'trip', '제3국 → trip');
// 거주국 → skip (import는 이미 제외하지만 방어)
eq(classifyImportTarget('대한민국', '대한민국', '일본'), 'skip', '거주국 → skip');
// 거주국 별칭 '한국' → skip
eq(classifyImportTarget('한국', '대한민국', '일본'), 'skip', '거주국 별칭 한국 → skip');
// 체류 없음(stayCountryName null) → 제3국은 trip, 거주국은 skip
eq(classifyImportTarget('일본', '대한민국', null), 'trip', '체류 없으면 일본도 trip');
eq(classifyImportTarget('대한민국', '대한민국', null), 'skip', '체류 없어도 거주국 skip');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
```

- [ ] **Step 2: 실행해 실패 확인**

Run: `npx tsx src/utils/importRouting.verify.ts`
Expected: FAIL — `classifyImportTarget` not exported.

- [ ] **Step 3: 구현**

```ts
// src/utils/importRouting.ts
// 과거 사진 가져오기에서 스캔된 여행 후보를 어디로 보낼지 판정 (순수).
// 'stay' = 진행 중 체류 카드로 흡수, 'trip' = 별도 여행 카드, 'skip' = 거주국(제외).
// clusterForeignTrips는 거주국을 이미 제외하므로 'skip'은 방어용.
export type ImportTarget = 'stay' | 'trip' | 'skip';

export function classifyImportTarget(
  tripCountryName: string,
  homeCountryName: string | null,
  stayCountryName: string | null,
): ImportTarget {
  const isHome = (n: string) =>
    !!homeCountryName && (n === homeCountryName ||
      (homeCountryName === '대한민국' && n === '한국') ||
      (homeCountryName === '한국' && n === '대한민국'));
  if (stayCountryName && tripCountryName === stayCountryName) return 'stay';
  if (isHome(tripCountryName)) return 'skip';
  return 'trip';
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx tsx src/utils/importRouting.verify.ts`
Expected: `✅ 모든 검증 통과`

- [ ] **Step 5: 커밋**

```bash
git add src/utils/importRouting.ts src/utils/importRouting.verify.ts
git commit -m "feat(import): 가져오기 대상 분류(stay/trip/skip) 순수 함수 + 검증"
```

---

## Phase 2 — recordStore 흡수·백데이팅

### Task 2: absorbIntoStay 액션 + 실시간 append 백데이팅

**Files:**
- Modify: `src/store/recordStore.tsx` (컨텍스트 타입, Provider, linkRecordToTrip 체류 분기)

- [ ] **Step 1: absorbIntoStay 액션 추가**

`endStay` 정의 근처(Provider 내부, tripGroupsRef 이후)에 추가:

```ts
// import 흡수 등 — 체류 카드에 기록을 붙이고 시작일을 그 기록 날짜로 당긴다(백데이팅).
// lastActiveAt은 건드리지 않는다(현재 체류 중이라 넛지는 now 기준 유지).
const absorbIntoStay = (recordId: string, recDate?: string) => {
  const apply = (list: TripGroup[]) => list.map((g) => {
    if (!g.stay || g.stay.status === 'ended') return g;
    const records2 = g.records.includes(recordId) ? g.records : [...g.records, recordId];
    const started = (recDate && recDate < g.stay.startedAt) ? recDate : g.stay.startedAt;
    return { ...g, records: records2, coverRecordId: g.coverRecordId || recordId, stay: { ...g.stay, startedAt: started } };
  });
  setTripGroups(apply);
  tripGroupsRef.current = apply(tripGroupsRef.current);
};
```

(날짜 문자열 'YYYY.MM.DD'는 사전순=시간순이라 `recDate < startedAt` 비교가 옳다.)

- [ ] **Step 2: 컨텍스트 노출**

RecordContextType(startStay/endStay 옆)에 `absorbIntoStay: (recordId: string, recDate?: string) => void;` 추가, Provider value에 `absorbIntoStay` 추가.

- [ ] **Step 3: 실시간 stay append에도 백데이팅 반영**

`linkRecordToTrip`의 체류 분기(active 체류 카드에 append하는 `grow` 부분)에서 stay 갱신에 startedAt min을 추가한다. 기존:
```ts
? { ...g, records: [...g.records, rec.id], coverRecordId: g.coverRecordId || rec.id, stay: { ...g.stay!, lastActiveAt: Date.now() } }
```
를 아래로:
```ts
? { ...g, records: [...g.records, rec.id], coverRecordId: g.coverRecordId || rec.id,
    stay: { ...g.stay!, lastActiveAt: Date.now(),
      startedAt: (() => { const d = rec.startDate || rec.date; return d && d < g.stay!.startedAt ? d : g.stay!.startedAt; })() } }
```

- [ ] **Step 4: 검증**

Run: `npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 5: 커밋**

```bash
git add src/store/recordStore.tsx
git commit -m "feat(store): absorbIntoStay(체류 흡수+시작일 백데이팅), 실시간 append 백데이팅"
```

---

## Phase 3 — 온보딩 (BasicInfoScreen)

### Task 3: i18n 키

**Files:**
- Modify: `src/i18n/locales/ko.ts`, `src/i18n/locales/en.ts`

- [ ] **Step 1: ko의 basicInfo 블록에 키 추가**

```ts
stayToggle: '지금 해외에 장기체류 중',
stayCountryLabel: '체류 국가',
stayTypeLabel: '체류 유형',
stayCountryPlaceholder: '나라 선택',
```

- [ ] **Step 2: en의 basicInfo 블록에 동일 키**

```ts
stayToggle: 'Currently on a long stay abroad',
stayCountryLabel: 'Stay country',
stayTypeLabel: 'Stay type',
stayCountryPlaceholder: 'Select country',
```

- [ ] **Step 3: 검증 + 커밋**

Run: `npx tsc --noEmit`
```bash
git add src/i18n/locales/ko.ts src/i18n/locales/en.ts
git commit -m "feat(i18n): 온보딩 장기체류 토글·라벨 문구"
```

---

### Task 4: BasicInfoScreen 토글·체류국·유형·startStay

**Files:**
- Modify: `src/screens/BasicInfoScreen.tsx`

- [ ] **Step 1: import·훅 추가**

상단에 추가:
```ts
import { Switch } from 'react-native';
import { useRecords } from '../store/recordStore';
import type { StayType } from '../utils/stayMachine';
```
컴포넌트 내부에 `const { startStay } = useRecords();`

유형 목록 상수(파일 상단, DEFAULT_COUNTRY 근처):
```ts
const STAY_TYPES: { value: StayType; key: string }[] = [
  { value: 'exchange', key: 'stay.typeExchange' },
  { value: 'language', key: 'stay.typeLanguage' },
  { value: 'intern', key: 'stay.typeIntern' },
  { value: 'workingHoliday', key: 'stay.typeWorkingHoliday' },
  { value: 'other', key: 'stay.typeOther' },
];
```

- [ ] **Step 2: 상태 추가**

기존 상태 근처:
```ts
const [stayOn, setStayOn] = useState(false);
const [stayCountry, setStayCountry] = useState<Country | null>(null);
const [stayType, setStayType] = useState<StayType>('exchange');
const [stayCountryModalVisible, setStayCountryModalVisible] = useState(false);
```

- [ ] **Step 3: UI — 거주국가 섹션 아래에 토글 블록**

거주국가 `</View>`(현재 305행) 다음에:
```tsx
{/* 장기체류 */}
<View style={styles.inputSection}>
  <View style={styles.stayToggleRow}>
    <Text style={styles.inputLabel}>{t('basicInfo.stayToggle')}</Text>
    <Switch value={stayOn} onValueChange={setStayOn}
      trackColor={{ false: '#3A3A46', true: '#6B21A8' }} thumbColor={stayOn ? '#BF85FC' : '#f4f3f4'} />
  </View>
  {stayOn && (
    <>
      <TouchableOpacity style={styles.inputWrapper} activeOpacity={0.8}
        onPress={() => { setCountrySearch(''); setStayCountryModalVisible(true); }}>
        <Text style={[styles.input, { paddingVertical: 16 }]}>
          {stayCountry ? `${stayCountry.flag} ${stayCountry.name}` : t('basicInfo.stayCountryPlaceholder')}
        </Text>
        <Text style={styles.charCount}>{t('common.change')}</Text>
      </TouchableOpacity>
      <View style={styles.stayTypeRow}>
        {STAY_TYPES.map((ty) => (
          <TouchableOpacity key={ty.value} onPress={() => setStayType(ty.value)}
            style={[styles.stayTypeChip, stayType === ty.value && styles.stayTypeChipOn]} activeOpacity={0.8}>
            <Text style={[styles.stayTypeChipTxt, stayType === ty.value && styles.stayTypeChipTxtOn]}>{t(ty.key)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  )}
</View>
```

스타일(styles StyleSheet에 추가):
```ts
stayToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
stayTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
stayTypeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.04)' },
stayTypeChipOn: { borderColor: '#BF85FC', backgroundColor: 'rgba(191,133,252,0.18)' },
stayTypeChipTxt: { color: '#A1A1B0', fontSize: 13, fontWeight: '600' },
stayTypeChipTxtOn: { color: '#FFFFFF' },
```

- [ ] **Step 4: 체류국 선택 모달 (거주국 모달 재사용)**

거주국 모달(현재 countryModalVisible로 여닫는 Modal, 대략 321행 이하)을 찾아, 그 아래에 **동일 구조의 체류국 모달**을 추가한다. 리스트는 같은 검색 필터를 쓰되 **거주국(selectedCountry)과 같은 나라는 제외**하고, 선택 시 `setStayCountry(country); setStayCountryModalVisible(false);`. 거주국 모달의 렌더 구조(검색 TextInput + 리스트 항목)를 그대로 복제하되 대상 상태만 stayCountry/stayCountryModalVisible로, 필터에 `.filter(c => codeOf(c) !== codeOf(selectedCountry))` 추가.

- [ ] **Step 5: canContinue·handleFinish**

`canContinue`(현재 157행)에 체류 조건 추가:
```ts
const canContinue = HANDLE_RE.test(handle.trim()) && isValidBirthday(birthday) && gender !== '' && (!stayOn || !!stayCountry);
```

`handleFinish`(현재 150–154행)에서 거주국 저장 뒤·navigate 전:
```ts
setHomeCountryCode(codeOf(selectedCountry));
setStoreBirthday(birthday);
setStoreGender(gender);
setStoreLanguage(language);
if (stayOn && stayCountry) startStay(stayCountry.name, stayType); // import가 체류를 알도록 이동 전에
navigation.navigate('TravelImport');
```

- [ ] **Step 6: 검증 + 커밋**

Run: `npx tsc --noEmit`
```bash
git add src/screens/BasicInfoScreen.tsx
git commit -m "feat(onboarding): 장기체류 토글·체류국 모달·유형, 온보딩서 체류 시작"
```

---

## Phase 4 — import 흡수 라우팅

### Task 5: ImportPhotoSelectScreen 분기

**Files:**
- Modify: `src/screens/ImportPhotoSelectScreen.tsx:49, 158-170`

- [ ] **Step 1: 훅·파생값 추가**

`useRecords` 구조분해(49행)에 `activeStayGroup, absorbIntoStay` 추가:
```ts
const { addImportedAlbum, addTripGroup, activeStayGroup, absorbIntoStay } = useRecords();
```
import·파생(컴포넌트 상단):
```ts
import { classifyImportTarget } from '../utils/importRouting';
import { COUNTRIES } from '../constants/countries';
import { useSettings } from '../store/settingsStore'; // 이미 import돼 있으면 생략
// ...
const { homeCountryCode } = useSettings(); // 이미 구조분해 중이면 병합
const homeCountryName = COUNTRIES.find((c) => c.term.split(' ')[0].toUpperCase() === (homeCountryCode || '').toUpperCase())?.name ?? null;
const stayCountryName = activeStayGroup?.stay?.status !== 'ended' ? (activeStayGroup?.countryName ?? null) : null;
```

- [ ] **Step 2: 생성 분기 교체**

현재 166–170행:
```ts
        // 제목에 국기를 넣지 않는다 ...
        addTripGroup({ title: t.title, records: [recId], coverRecordId: recId });
        tripCount += 1;
        photoCount += copied.length;
        countries.push({ flag: t.countryFlag, name: t.countryName });
```
를 아래로:
```ts
        const target = classifyImportTarget(t.countryName, homeCountryName, stayCountryName);
        if (target === 'stay') {
          absorbIntoStay(recId, t.startDate); // 체류 카드로 흡수 + 시작일 백데이팅
          photoCount += copied.length;
        } else if (target === 'trip') {
          addTripGroup({ title: t.title, records: [recId], coverRecordId: recId });
          tripCount += 1;
          photoCount += copied.length;
          countries.push({ flag: t.countryFlag, name: t.countryName });
        }
        // 'skip'(거주국)은 clusterForeignTrips가 이미 제외 — 방어적으로 무시
```
(변수명 `t`가 이 루프에서 스캔 여행 항목이면 그대로. 번역 함수 `t`와 충돌하면 실제 코드의 루프 변수명을 확인해 맞춘다 — 이 파일은 map 콜백에서 여행 항목을 무슨 이름으로 받는지 158행 위쪽을 보고 일치시킬 것.)

- [ ] **Step 3: 검증 + 커밋**

Run: `npx tsc --noEmit`
Expected: 에러 0.
```bash
git add src/screens/ImportPhotoSelectScreen.tsx
git commit -m "feat(import): 체류국 사진은 체류 카드로 흡수(백데이팅), 제3국은 여행 카드"
```

---

## Phase 5 — 검증

### Task 6: 전체 검증

**Files:** (없음 — 검증 전용)

- [ ] **Step 1: 순수 로직**

Run: `npx tsx src/utils/importRouting.verify.ts && npx tsx src/utils/stayMachine.verify.ts`
Expected: 둘 다 `✅ 통과`.

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 3: 수동 플로우 (실기기/에뮬)**

- 온보딩: 거주국 한국 → 장기체류 토글 ON → 체류국 일본(한국 제외 확인)·유형 교환학생 → 계속
- 사진 가져오기: 일본 사진 선택 → 완료 → 프로필에 **일본 체류 카드**에 사진 흡수, 시작일이 **가장 이른 일본 사진 날짜**로
- 같은 import에 태국 사진 있으면 → **별도 태국 여행 카드**
- 토글 OFF로 온보딩하면 기존과 동일(체류 카드 없음, 일본 사진은 일반 여행 카드) — 회귀 없음
- 온보딩서 체류 만든 뒤 앱 진입 → 위치 감지가 일본 잡아도 프롬프트 안 뜸(중복 방지)

- [ ] **Step 4: 완료 커밋(문서 상태 갱신 등, 코드 변경 없으면 생략)**

---

## 롤아웃 노트

- 서버 스키마 변경 없음(체류 컬럼 기존). 순수 클라이언트.
- 토글 OFF 신규·기존 사용자는 온보딩·import 동작 불변.
- 체류 카드는 동시 1개 — 온보딩서 만들면 이후 자동 프롬프트는 그 나라에 대해 안 뜬다.
- **의도적 defer(폴리시):** 스펙의 "가져오기 선택 목록에서 체류국 후보에 '체류에 포함' 라벨" 표시는 이번 범위에서 제외(TravelImportScreen 선택 UI 변경 필요, 흡수 동작엔 영향 없음). 필요 시 후속.
