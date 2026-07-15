# 장기체류(Stay) 모드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 거주국가를 바꾸지 않는 별도 "체류(Stay)" 레이어로 해외 장기체류(교환·어학·인턴·워홀)를 표현한다 — 열린 체류 카드, 일시정지·재개, 종료 넛지·수동 종료, 방문국 동적 재집계, 이웃 노출.

**Architecture:** 체류 전환 판정을 순수 모듈(`stayMachine.ts`)로 뽑아 `*.verify.ts`로 단위 검증하고, `recordStore`가 이를 호출해 `TripGroup`(체류 메타 확장)을 관리한다. 통계는 현재 거주국 기준 동적 계산으로 통일하고, 체류 상태는 `profiles`에 동기화해 이웃 프로필에 반영한다.

**Tech Stack:** React Native (Expo), TypeScript, Supabase(Postgres + RLS + 뷰), react-i18next. 검증: `npx tsc --noEmit`, `npx tsx <file>.verify.ts`, 수동 플로우.

**참고 스펙:** `docs/superpowers/specs/2026-07-16-long-stay-mode-design.md`

---

## 검증 방식 (이 프로젝트 특성)

- jest 없음. 순수 로직은 `src/**/*.verify.ts`로 작성하고 `npx tsx <file>`로 실행, `console.assert` + 실패 시 `process.exit(1)` 패턴(기존 `badgeRules.verify.ts` 참고).
- UI/스토어 통합은 `npx tsc --noEmit` + 실기기 수동 플로우로 검증한다.
- SQL(profiles 컬럼·뷰)은 사용자가 Supabase에서 실행 후 이웃 노출 수동 검증.

## 파일 구조 (생성/수정)

**순수 로직 (신규)**
- 생성: `src/utils/stayMachine.ts` — 체류 상태·전환 판정 순수 함수
- 생성: `src/utils/stayMachine.verify.ts` — 단위 검증

**상태/스토어**
- 수정: `src/store/recordStore.tsx` — `TripGroup`에 stay 메타, 진입/append/일시정지/재개/종료, 60일 넛지 신호, 진입 프롬프트 요청 상태
- 수정: `src/store/settingsStore.tsx` — (넛지 1회 플래그) `stayNudgeDismissedFor` 영속

**UI**
- 생성: `src/components/record/StayPromptModal.tsx` — 여행/장기체류 진입 + 유형 선택
- 생성: `src/components/profile/StayManageSheet.tsx` — 위치 탭 시 종료/카드 보기 시트
- 수정: `src/screens/ProfileScreen.tsx` — 위치 "체류 중" + 탭 + 넛지 알럿
- 수정: `src/screens/FriendProfileScreen.tsx` — 이웃 위치에 체류국 반영
- 수정: `src/components/profile/ProfileVisuals.tsx` — TripCard 체류 배지·기간

**통계**
- 수정: `src/utils/badgeRules.ts` + `src/utils/badgeRules.verify.ts` — 거주국 동적 제외
- 수정: `src/screens/StatsScreen.tsx` — 방문국 집계에서 거주국 제외

**서버/동기화**
- 수정: `supabase/schema.sql` — `profiles.stay_country`/`stay_status`, `public_profiles` 뷰 확장
- 수정: `src/components/ProfileSync.tsx` + `src/services/profile.ts` — push/read

**체류국=홈처럼**
- 수정: `src/screens/NewRecordScreen.tsx`·`src/screens/SnapRecordScreen.tsx`·`src/services/snapService.ts` — 지역 프리셋·해외 알림 억제

**i18n**
- 수정: `src/i18n/locales/ko.ts` + `src/i18n/locales/en.ts`

---

## Phase 1 — 순수 상태 머신 (TDD)

### Task 1: 체류 타입 정의

**Files:**
- Create: `src/utils/stayMachine.ts`

- [ ] **Step 1: 타입·상수 작성**

```ts
// src/utils/stayMachine.ts
// 체류(Stay) 전환 판정 — 순수 로직. recordStore가 이 결과로 TripGroup/세션을 조작한다.
export type StayType = 'exchange' | 'language' | 'intern' | 'workingHoliday' | 'other';
export type StayStatus = 'active' | 'paused' | 'ended';

// 진행 중/일시정지 체류의 최소 상태 (판정에 필요한 것만)
export interface StaySnapshot {
  countryCode: string;   // 체류국 ISO 대문자 (예: 'JP')
  status: StayStatus;
  lastActiveAt: number;  // 마지막으로 체류국에 있던 시각(ms)
}

// 현위치 국가 전환 시 결정
export interface VisitedDecision {
  pauseStay: boolean;        // 진행 중 체류를 일시정지
  resumeStay: boolean;       // 일시정지 체류국으로 복귀 → 재개
  isNewAbroadCountry: boolean; // 거주국도 체류국도 아닌 새 해외국 (프롬프트 후보)
}

export const STAY_NUDGE_MS = 60 * 24 * 60 * 60 * 1000; // 60일 무복귀 넛지
```

- [ ] **Step 2: 커밋**

```bash
git add src/utils/stayMachine.ts
git commit -m "feat(stay): 체류 타입·상수 정의"
```

---

### Task 2: 전환 판정 함수 + 검증

**Files:**
- Modify: `src/utils/stayMachine.ts`
- Create: `src/utils/stayMachine.verify.ts`

- [ ] **Step 1: 검증 파일 먼저 작성 (실패 예상)**

```ts
// src/utils/stayMachine.verify.ts
import { decideOnVisitedChange, shouldNudgeEnd, STAY_NUDGE_MS, StaySnapshot } from './stayMachine';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const stayJP: StaySnapshot = { countryCode: 'JP', status: 'active', lastActiveAt: 1000 };
const pausedJP: StaySnapshot = { countryCode: 'JP', status: 'paused', lastActiveAt: 1000 };

// 거주국(KR) 복귀 → active 체류 일시정지
eq(decideOnVisitedChange({ visitedCountryCode: 'KR', homeCountryCode: 'KR', stay: stayJP }),
   { pauseStay: true, resumeStay: false, isNewAbroadCountry: false }, 'KR 복귀 → 일시정지');

// 체류국(JP) 유지 (이미 active) → 아무 것도 안 함
eq(decideOnVisitedChange({ visitedCountryCode: 'JP', homeCountryCode: 'KR', stay: stayJP }),
   { pauseStay: false, resumeStay: false, isNewAbroadCountry: false }, 'JP 유지 → none');

// 체류국(JP) 복귀 (paused) → 재개
eq(decideOnVisitedChange({ visitedCountryCode: 'JP', homeCountryCode: 'KR', stay: pausedJP }),
   { pauseStay: false, resumeStay: true, isNewAbroadCountry: false }, 'JP 복귀 → 재개');

// 제3국(TH) 감지 (JP active 중) → 체류 일시정지 + 새 해외국
eq(decideOnVisitedChange({ visitedCountryCode: 'TH', homeCountryCode: 'KR', stay: stayJP }),
   { pauseStay: true, resumeStay: false, isNewAbroadCountry: true }, 'TH → 일시정지+새국');

// 체류 없음 + 새 해외국(JP) → 프롬프트 후보
eq(decideOnVisitedChange({ visitedCountryCode: 'JP', homeCountryCode: 'KR', stay: null }),
   { pauseStay: false, resumeStay: false, isNewAbroadCountry: true }, '체류없음 새 해외국');

// 넛지: paused + 60일 경과
eq(shouldNudgeEnd(pausedJP, 1000 + STAY_NUDGE_MS), true, '넛지: 60일 경과');
eq(shouldNudgeEnd(pausedJP, 1000 + STAY_NUDGE_MS - 1), false, '넛지: 60일 미만');
eq(shouldNudgeEnd(stayJP, 1000 + STAY_NUDGE_MS), false, '넛지: active는 제외');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
```

- [ ] **Step 2: 실행해 실패 확인**

Run: `npx tsx src/utils/stayMachine.verify.ts`
Expected: FAIL — `decideOnVisitedChange`/`shouldNudgeEnd` not exported.

- [ ] **Step 3: 함수 구현**

`stayMachine.ts`에 추가:

```ts
export function decideOnVisitedChange(p: {
  visitedCountryCode: string;
  homeCountryCode: string;
  stay: StaySnapshot | null;
}): VisitedDecision {
  const visited = (p.visitedCountryCode || '').toUpperCase();
  const home = (p.homeCountryCode || '').toUpperCase();
  const stay = p.stay;
  if (!visited || visited === home) {
    return { pauseStay: !!stay && stay.status === 'active', resumeStay: false, isNewAbroadCountry: false };
  }
  // 해외
  if (stay && stay.countryCode.toUpperCase() === visited) {
    return { pauseStay: false, resumeStay: stay.status === 'paused', isNewAbroadCountry: false };
  }
  // 체류국이 아닌 새 해외국
  return { pauseStay: !!stay && stay.status === 'active', resumeStay: false, isNewAbroadCountry: true };
}

export function shouldNudgeEnd(stay: StaySnapshot | null, now: number): boolean {
  return !!stay && stay.status === 'paused' && now - stay.lastActiveAt >= STAY_NUDGE_MS;
}
```

- [ ] **Step 4: 실행해 통과 확인**

Run: `npx tsx src/utils/stayMachine.verify.ts`
Expected: PASS — `✅ 모든 검증 통과`.

- [ ] **Step 5: 커밋**

```bash
git add src/utils/stayMachine.ts src/utils/stayMachine.verify.ts
git commit -m "feat(stay): 현위치 전환/넛지 판정 함수 + 검증"
```

---

## Phase 2 — recordStore 통합

### Task 3: TripGroup에 stay 메타 추가

**Files:**
- Modify: `src/store/recordStore.tsx:140-154` (TripGroup), `:419` (makeTripGroup)

- [ ] **Step 1: 타입 확장**

`TripGroup` 인터페이스(140–154)에 추가:

```ts
import type { StayType, StayStatus } from '../utils/stayMachine';

export interface TripGroupStayMeta {
  type: StayType;
  status: StayStatus;
  startedAt: string;    // YYYY-MM-DD
  endedAt?: string;
  lastActiveAt: number; // 마지막으로 체류국에 있던 시각(ms) — 넛지 판정
}

export interface TripGroup {
  // ...기존 필드 유지...
  stay?: TripGroupStayMeta; // 있으면 체류 카드
}
```

- [ ] **Step 2: tsc 통과 확인**

Run: `npx tsc --noEmit`
Expected: 에러 0 (선택적 필드라 기존 코드 영향 없음).

- [ ] **Step 3: 커밋**

```bash
git add src/store/recordStore.tsx
git commit -m "feat(store): TripGroup에 체류(stay) 메타 필드"
```

---

### Task 4: 체류 시작/조회 액션

**Files:**
- Modify: `src/store/recordStore.tsx` (컨텍스트 타입 261 부근, provider 내부)

- [ ] **Step 1: 진행 중 체류 조회 + 시작 액션 추가**

Provider 내부(`makeTripGroup` 근처)에 추가:

```ts
// 진행 중/일시정지 체류 카드 (동시 최대 1개)
const activeStayGroup = tripGroups.find((g) => g.stay && g.stay.status !== 'ended') ?? null;

// 체류 시작 — 현재 감지된 해외국으로 체류 카드 생성(active) + 세션 등록
const startStay = (countryName: string, type: StayType) => {
  const today = new Date();
  const ymd = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
  const ng: TripGroup = {
    ...makeTripGroup(countryName, { id: '', countryName } as TravelRecord),
    records: [],
    stay: { type, status: 'active', startedAt: ymd, lastActiveAt: Date.now() },
  };
  setTripGroups((prev) => [ng, ...prev]);
  tripGroupsRef.current = [ng, ...tripGroupsRef.current];
  const opened: TripSession = { groups: { [countryName]: ng.id }, lastActiveAt: Date.now() };
  setTripSession(opened);
  tripSessionRef.current = opened;
};

// 체류 종료 — status='ended', endedAt=마지막 체류국 기록일(없으면 오늘)
const endStay = (groupId: string) => {
  setTripGroups((prev) => prev.map((g) => {
    if (g.id !== groupId || !g.stay) return g;
    const dates = g.records
      .map((id) => records.find((r) => r.id === id))
      .map((r) => r && (r.endDate || r.startDate || r.date))
      .filter(Boolean) as string[];
    const endedAt = dates.sort().slice(-1)[0] || g.stay.startedAt;
    return { ...g, stay: { ...g.stay, status: 'ended', endedAt } };
  }));
};
```

- [ ] **Step 2: 컨텍스트 타입·value에 노출**

컨텍스트 인터페이스(`mergeTripGroups` 근처)에 추가하고 Provider value(1651 부근)에 `activeStayGroup, startStay, endStay`를 넣는다:

```ts
// 인터페이스
activeStayGroup: TripGroup | null;
startStay: (countryName: string, type: StayType) => void;
endStay: (groupId: string) => void;
```

- [ ] **Step 3: tsc 통과 확인**

Run: `npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 4: 커밋**

```bash
git add src/store/recordStore.tsx
git commit -m "feat(store): 체류 시작/종료/조회 액션"
```

---

### Task 5: linkRecordToTrip·도착 감지에 체류 반영

**Files:**
- Modify: `src/store/recordStore.tsx:502-559`

- [ ] **Step 1: 체류국 실시간 기록을 체류 카드에 append**

`linkRecordToTrip`(502)에서 국내 분기 앞에 체류 분기를 추가한다. 현재 active 체류국과 기록 국가가 같으면 체류 카드에 append하고 lastActiveAt 갱신:

```ts
const linkRecordToTrip = (rec: TravelRecord, opts?: { countryGuessed?: boolean }) => {
  const country = rec.countryName;
  if (!country) return;
  if (!coversNow(rec)) { linkByDate(rec); return; }

  // 진행 중 체류국의 실시간 기록 → 체류 카드에 합류(세션과 별개로 stay 카드에 직접)
  const stayG = tripGroupsRef.current.find((g) => g.stay && g.stay.status === 'active' && (g.countryName ?? country) === country);
  if (stayG && country !== homeCountryName) {
    if (!stayG.records.includes(rec.id)) {
      const grow = (list: TripGroup[]) => list.map((g) =>
        g.id === stayG.id ? { ...g, records: [...g.records, rec.id], stay: { ...g.stay!, lastActiveAt: Date.now() } } : g);
      setTripGroups((prev) => grow(prev));
      tripGroupsRef.current = grow(tripGroupsRef.current);
    }
    return;
  }
  // ...기존 국내/해외 세션 로직 유지...
```

- [ ] **Step 2: 도착 감지 useEffect에 일시정지/재개 반영**

`prevVisitedRef` useEffect(549–559)를 `decideOnVisitedChange`로 교체한다:

```ts
import { decideOnVisitedChange, StaySnapshot } from '../utils/stayMachine';
import { COUNTRIES } from '../constants/countries';

const codeOfCountryName = (name: string | undefined): string | null => {
  if (!name) return null;
  return COUNTRIES.find((c) => c.name === name)?.term.split(' ')[0].toUpperCase() ?? null;
};

const prevVisitedRef = useRef(currentVisitedCountryCode);
useEffect(() => {
  const prev = prevVisitedRef.current;
  prevVisitedRef.current = currentVisitedCountryCode;
  if (prev === currentVisitedCountryCode) return;

  const stayGroup = tripGroupsRef.current.find((g) => g.stay && g.stay.status !== 'ended');
  const snap: StaySnapshot | null = stayGroup
    ? { countryCode: codeOfCountryName(stayGroup.countryName) ?? '', status: stayGroup.stay!.status, lastActiveAt: stayGroup.stay!.lastActiveAt }
    : null;
  const d = decideOnVisitedChange({ visitedCountryCode: currentVisitedCountryCode, homeCountryCode, stay: snap });

  if ((d.pauseStay || d.resumeStay) && stayGroup) {
    setTripGroups((prev2) => prev2.map((g) =>
      g.id === stayGroup.id ? { ...g, stay: { ...g.stay!, status: d.pauseStay ? 'paused' : 'active', lastActiveAt: d.resumeStay ? Date.now() : g.stay!.lastActiveAt } } : g));
  }
  // 새 해외국 프롬프트 요청 — 이미 여행 세션이 없을 때만
  if (d.isNewAbroadCountry) {
    const visitName = COUNTRIES.find((c) => c.term.split(' ')[0].toUpperCase() === currentVisitedCountryCode.toUpperCase())?.name ?? null;
    const alreadyTravel = !!(tripSessionRef.current && visitName && tripSessionRef.current.groups[visitName]);
    if (visitName && !alreadyTravel) setStayPromptCountry(visitName);
  }
}, [currentVisitedCountryCode, homeCountryCode]);
```

- [ ] **Step 3: 프롬프트 요청 상태 추가**

Provider 상단에 `const [stayPromptCountry, setStayPromptCountry] = useState<string | null>(null);`를 추가하고 컨텍스트 value에 `stayPromptCountry, setStayPromptCountry` 노출.

- [ ] **Step 4: tsc 통과 확인**

Run: `npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 5: 커밋**

```bash
git add src/store/recordStore.tsx
git commit -m "feat(store): 체류 append·일시정지/재개·진입 프롬프트 요청"
```

---

### Task 6: 60일 넛지 1회 플래그

**Files:**
- Modify: `src/store/settingsStore.tsx` (영속 상태 추가)

- [ ] **Step 1: 넛지 dismiss 플래그 영속**

`settingsStore`에 `stayNudgeDismissedFor: string | null`(넛지를 닫은 체류 카드 id) 상태·세터를 추가하고 persist payload에 포함(기존 `homeCountryCode` 패턴을 그대로 따른다).

- [ ] **Step 2: tsc 통과 확인**

Run: `npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 3: 커밋**

```bash
git add src/store/settingsStore.tsx
git commit -m "feat(settings): 체류 종료 넛지 1회 플래그"
```

---

## Phase 3 — 진입 프롬프트 · 위치 표시 · 탭

### Task 7: 체류 진입 프롬프트 모달

**Files:**
- Create: `src/components/record/StayPromptModal.tsx`

- [ ] **Step 1: 모달 컴포넌트 작성**

```tsx
// src/components/record/StayPromptModal.tsx
import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GlassButton } from '../ui';
import type { StayType } from '../../utils/stayMachine';

const TYPES: { value: StayType; key: string }[] = [
  { value: 'exchange', key: 'stay.typeExchange' },
  { value: 'language', key: 'stay.typeLanguage' },
  { value: 'intern', key: 'stay.typeIntern' },
  { value: 'workingHoliday', key: 'stay.typeWorkingHoliday' },
  { value: 'other', key: 'stay.typeOther' },
];

export function StayPromptModal({ countryName, onTravel, onStay, onClose }: {
  countryName: string | null;
  onTravel: () => void;
  onStay: (type: StayType) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [pickType, setPickType] = useState(false);
  const visible = !!countryName;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          {!pickType ? (
            <>
              <Text style={s.title}>{t('stay.promptTitle', { country: countryName ?? '' })}</Text>
              <Text style={s.desc}>{t('stay.promptDesc')}</Text>
              <GlassButton label={t('stay.chooseTravel')} onPress={() => { onTravel(); }} style={{ marginTop: 16 }} />
              <GlassButton label={t('stay.chooseStay')} onPress={() => setPickType(true)} style={{ marginTop: 10 }} />
            </>
          ) : (
            <>
              <Text style={s.title}>{t('stay.typeTitle')}</Text>
              {TYPES.map((ty) => (
                <TouchableOpacity key={ty.value} style={s.typeRow} onPress={() => onStay(ty.value)} activeOpacity={0.8}>
                  <Text style={s.typeTxt}>{t(ty.key)}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: 28 },
  card: { backgroundColor: '#161421', borderRadius: 24, padding: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  desc: { color: '#A1A1B0', fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 },
  typeRow: { paddingVertical: 15, alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  typeTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
```

- [ ] **Step 2: tsc 통과 확인**

Run: `npx tsc --noEmit`
Expected: 에러 0 (i18n 키는 Task 10에서 추가 — 문자열 키라 tsc는 통과).

- [ ] **Step 3: 커밋**

```bash
git add src/components/record/StayPromptModal.tsx
git commit -m "feat(stay): 진입 프롬프트 모달(여행/장기체류·유형)"
```

---

### Task 8: 위치 표시 "체류 중" + 관리 시트 + 프롬프트 마운트

**Files:**
- Create: `src/components/profile/StayManageSheet.tsx`
- Modify: `src/screens/ProfileScreen.tsx:1876-1890`

- [ ] **Step 1: 관리 시트 컴포넌트 작성**

```tsx
// src/components/profile/StayManageSheet.tsx
import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

export function StayManageSheet({ visible, onEnd, onOpenCard, onClose }: {
  visible: boolean; onEnd: () => void; onOpenCard: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={s.sheet}>
          <TouchableOpacity style={s.row} onPress={onOpenCard}><Text style={s.txt}>{t('stay.openCard')}</Text></TouchableOpacity>
          <TouchableOpacity style={s.row} onPress={onEnd}><Text style={[s.txt, { color: '#FF3B30' }]}>{t('stay.endStay')}</Text></TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#161421', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34, paddingTop: 8 },
  row: { paddingVertical: 17, alignItems: 'center' },
  txt: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
```

- [ ] **Step 2: ProfileScreen 위치 표시 교체 + 시트/프롬프트 마운트**

`ProfileScreen`의 위치 표시(1878–1890)를 체류 우선으로 바꾸고, 탭 시 시트를 연다. useRecords에서 `activeStayGroup, startStay, endStay, stayPromptCountry, setStayPromptCountry`를 구조분해:

```tsx
// 위치 텍스트 로직
const stayActive = activeStayGroup?.stay?.status === 'active';
// ...
<TouchableOpacity disabled={!stayActive} onPress={() => setStaySheetVisible(true)} activeOpacity={stayActive ? 0.6 : 1}>
  <Text style={styles.userLocation}>
    {(() => {
      const home = COUNTRY_DATA[homeCountryCode] || { name: '대한민국', flag: '🇰🇷' };
      if (stayActive && activeStayGroup?.countryName) {
        return t('stay.stayingIn', { flag: activeStayGroup.countryFlag || '📍', name: activeStayGroup.countryName });
      }
      const visit = COUNTRY_DATA[currentVisitedCountryCode];
      if (arrivalDetect && currentVisitedCountryCode && currentVisitedCountryCode !== homeCountryCode && visit) {
        return t('profile.traveling', { flag: visit.flag, name: visit.name });
      }
      return `${home.flag} ${home.name}`;
    })()}
  </Text>
</TouchableOpacity>
```

그리고 화면 하단에 마운트:

```tsx
<StayManageSheet
  visible={staySheetVisible}
  onOpenCard={() => { setStaySheetVisible(false); const thumb = displayTrips.find((tr) => tr.id === activeStayGroup?.id); if (thumb) openTripDetail(thumb); }}
  onEnd={() => { setStaySheetVisible(false); if (activeStayGroup) endStay(activeStayGroup.id); }}
  onClose={() => setStaySheetVisible(false)}
/>
<StayPromptModal
  countryName={stayPromptCountry}
  onTravel={() => setStayPromptCountry(null)}
  onStay={(type) => { if (stayPromptCountry) startStay(stayPromptCountry, type); setStayPromptCountry(null); }}
  onClose={() => setStayPromptCountry(null)}
/>
```

`const [staySheetVisible, setStaySheetVisible] = useState(false);` 추가.

- [ ] **Step 3: 60일 넛지 알럿**

ProfileScreen 마운트 시 `shouldNudgeEnd`로 넛지 판정 useEffect 추가. `stayNudgeDismissedFor !== activeStayGroup.id`이고 넛지 대상이면 `Alert.alert`로 "체류 종료?" → 종료 or dismiss(`setStayNudgeDismissedFor(activeStayGroup.id)`):

```tsx
useEffect(() => {
  if (!activeStayGroup?.stay) return;
  const snap = { countryCode: '', status: activeStayGroup.stay.status, lastActiveAt: activeStayGroup.stay.lastActiveAt };
  if (shouldNudgeEnd(snap, Date.now()) && stayNudgeDismissedFor !== activeStayGroup.id) {
    Alert.alert(t('stay.nudgeTitle'), t('stay.nudgeMsg', { country: activeStayGroup.countryName ?? '' }), [
      { text: t('stay.nudgeKeep'), style: 'cancel', onPress: () => setStayNudgeDismissedFor(activeStayGroup.id) },
      { text: t('stay.endStay'), style: 'destructive', onPress: () => { endStay(activeStayGroup.id); setStayNudgeDismissedFor(activeStayGroup.id); } },
    ]);
  }
}, [activeStayGroup?.id]);
```

- [ ] **Step 4: tsc 통과 확인**

Run: `npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 5: 커밋**

```bash
git add src/components/profile/StayManageSheet.tsx src/screens/ProfileScreen.tsx
git commit -m "feat(stay): 위치 '체류 중' 표시·관리 시트·진입 프롬프트·60일 넛지"
```

---

### Task 8b: 수동 체류 시작 (감지 OFF 폴백)

도착 감지를 끈 사용자는 프롬프트가 안 뜨므로 수동 진입이 필요하다(스펙 엣지케이스).

**Files:**
- Modify: `src/screens/SettingsScreen.tsx` (설정 항목 추가)

- [ ] **Step 1: 설정에 "장기체류 시작" 항목**

`SettingsScreen`에 항목 추가 — 눌러 국가(기존 거주국 선택 모달 재사용)와 유형(StayPromptModal의 유형 리스트 재사용)을 고르면 `startStay(countryName, type)` 호출. 진행 중 체류가 이미 있으면 "종료 후 시작" 안내(Alert). useRecords에서 `activeStayGroup, startStay`를 구조분해.

- [ ] **Step 2: tsc 통과 확인**

Run: `npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 3: 커밋**

```bash
git add src/screens/SettingsScreen.tsx
git commit -m "feat(stay): 감지 OFF 사용자용 수동 장기체류 시작(설정)"
```

---

### Task 9: 체류 카드 배지·기간 (TripCard)

**Files:**
- Modify: `src/components/profile/ProfileVisuals.tsx` (TripCard, TripCardData)

- [ ] **Step 1: TripCardData에 stay 요약 전달 + 배지 렌더**

`TripCardData`에 `stayLabel?: string`(예: "체류 · 교환학생"), `datePeriod?: string`(예: "2026.3 ~ 진행 중")를 추가하고, TripCard 내부에 있으면 배지·기간을 그린다. ProfileScreen에서 카드 매핑 시 `stay`가 있으면 채운다.

- [ ] **Step 2: tsc 통과 확인**

Run: `npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 3: 커밋**

```bash
git add src/components/profile/ProfileVisuals.tsx src/screens/ProfileScreen.tsx
git commit -m "feat(stay): 체류 카드 배지·기간 표기"
```

---

### Task 10: i18n 키

**Files:**
- Modify: `src/i18n/locales/ko.ts`, `src/i18n/locales/en.ts`

- [ ] **Step 1: 키 추가 (ko)**

`profile` 섹션 근처에 `stay` 블록 추가:

```ts
stay: {
  stayingIn: '{{flag}} {{name}} 체류 중',
  promptTitle: '{{country}}에 오셨네요',
  promptDesc: '이번 방문은 여행인가요, 장기체류인가요?',
  chooseTravel: '여행',
  chooseStay: '장기체류',
  typeTitle: '어떤 체류인가요?',
  typeExchange: '교환학생', typeLanguage: '어학연수', typeIntern: '인턴십', typeWorkingHoliday: '워킹홀리데이', typeOther: '기타',
  openCard: '체류 카드 보기', endStay: '체류 종료',
  nudgeTitle: '체류가 끝났나요?', nudgeMsg: '{{country}} 체류 카드를 마무리할까요?', nudgeKeep: '아직요',
  cardBadge: '체류 · {{type}}', ongoing: '진행 중',
},
```

- [ ] **Step 2: 키 추가 (en)**

동일 구조로 영어 값 추가(`stayingIn: '{{flag}} {{name}} · Staying'`, `chooseTravel: 'Trip'`, `chooseStay: 'Long stay'`, 유형 Exchange/Language study/Internship/Working holiday/Other, `endStay: 'End stay'` 등).

- [ ] **Step 3: tsc 통과 확인**

Run: `npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 4: 커밋**

```bash
git add src/i18n/locales/ko.ts src/i18n/locales/en.ts
git commit -m "feat(i18n): 장기체류 문구(ko/en)"
```

---

## Phase 4 — 통계 동적 재집계

### Task 11: 배지 방문국 집계에서 거주국 제외

**Files:**
- Modify: `src/utils/badgeRules.ts:406-413` (집계), `computeTravelStats`/`computeEarnedBadgeIds` 옵션
- Modify: `src/utils/badgeRules.verify.ts`

- [ ] **Step 1: verify에 케이스 추가 (실패 예상)**

`badgeRules.verify.ts`에 "거주국은 방문국·diaryCountries에서 제외" 케이스 추가 — 예: 대한민국 feed 기록 + 일본 feed 기록, `homeCountryName='대한민국'` 옵션으로 `diaryCountries`에 대한민국 미포함, 일본 포함 검증.

- [ ] **Step 2: 실행해 실패 확인**

Run: `npx tsx src/utils/badgeRules.verify.ts`
Expected: FAIL — 현재는 거주국도 집계됨.

- [ ] **Step 3: 옵션·제외 구현**

`BadgeComputeOptions`에 `homeCountryName?: string` 추가. `computeTravelStats`의 국가 집계(406–413)에서 `n === homeCountryName`이면 `countries`/`diaryCountries`에 넣지 않는다:

```ts
for (const n of names) {
  if (options?.homeCountryName && n === options.homeCountryName) continue; // 거주국 제외(동적)
  countries.add(n);
  if (isDiary) diaryCountries.add(n);
  // ...
```

- [ ] **Step 4: 실행해 통과 확인**

Run: `npx tsx src/utils/badgeRules.verify.ts`
Expected: PASS.

- [ ] **Step 5: 호출부에 homeCountryName 전달**

`useBadgeEarning`·`ProfileScreen`·`FriendProfileScreen` 등 `computeEarnedBadgeIds` 호출부에 `{ homeCountryName }`을 넘긴다(현재 거주국 기준 → 변경 시 자동 재집계).

- [ ] **Step 6: 커밋**

```bash
git add src/utils/badgeRules.ts src/utils/badgeRules.verify.ts src/hooks/useBadgeEarning.ts src/screens/ProfileScreen.tsx src/screens/FriendProfileScreen.tsx
git commit -m "feat(stats): 방문국 집계에서 현재 거주국 동적 제외"
```

---

### Task 12: StatsScreen 방문국 수 거주국 제외

**Files:**
- Modify: `src/screens/StatsScreen.tsx:482-506`

- [ ] **Step 1: 거주국 제외 반영**

`visitedCountriesSet` 집계에서 `homeCountryName`(거주국 코드→이름)과 같은 국가는 건너뛴다. 체류국은 거주국이 아니므로 자연히 포함된다.

- [ ] **Step 2: tsc 통과 확인**

Run: `npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 3: 커밋**

```bash
git add src/screens/StatsScreen.tsx
git commit -m "feat(stats): 통계 방문국 수에서 거주국 제외"
```

---

## Phase 5 — 서버 동기화 (이웃 노출)

### Task 13: profiles 스키마 + public_profiles 뷰

**Files:**
- Modify: `supabase/schema.sql`

- [ ] **Step 1: 컬럼·뷰 확장**

`profiles`에 컬럼 추가, `public_profiles` 뷰에 노출:

```sql
alter table public.profiles add column if not exists stay_country text;
alter table public.profiles add column if not exists stay_status text; -- 'active'|null
-- public_profiles 뷰 재정의에 stay_country, stay_status 컬럼 추가 (거주국 country와 동일 노출 정책)
```

`public_profiles` 뷰 정의(schema.sql)를 찾아 select 목록에 `stay_country, stay_status`를 추가한다.

- [ ] **Step 2: 커밋 (사용자가 Supabase에서 실행)**

```bash
git add supabase/schema.sql
git commit -m "feat(db): profiles 체류국·상태 컬럼, public_profiles 노출"
```

---

### Task 14: ProfileSync push + 이웃 프로필 반영

**Files:**
- Modify: `src/components/ProfileSync.tsx:15-39`, `src/services/profile.ts`, `src/screens/FriendProfileScreen.tsx:134-141`

- [ ] **Step 1: ProfileSync가 체류 상태 push**

`profiles.country`가 ISO 코드(homeCountryCode)이므로 `stay_country`도 **ISO 코드**로 일관되게 저장한다. `ProfileSync`가 useRecords의 `activeStayGroup`을 읽어 체류국명을 코드로 변환해 `baseFields`에 포함:

```ts
import { COUNTRIES } from '../constants/countries';
const stayCode = activeStayGroup?.stay?.status === 'active'
  ? (COUNTRIES.find((c) => c.name === activeStayGroup.countryName)?.term.split(' ')[0].toUpperCase() ?? null)
  : null;
// baseFields:
stay_country: stayCode,
stay_status: stayCode ? 'active' : null,
```

- [ ] **Step 2: profile.ts fetch에 컬럼 포함**

`profile.ts`의 public_profiles 조회 select에 `stay_country, stay_status`를 추가하고, 반환 타입(`profileRow`)에 필드 추가.

- [ ] **Step 3: FriendProfileScreen 위치에 체류 우선 반영**

`friendLocation`(134–141)을 `profileRow.stay_status === 'active' && profileRow.stay_country`면 `t('stay.stayingIn', ...)`로, 아니면 기존 거주국 표시로:

```ts
if (profileRow?.stay_status === 'active' && profileRow?.stay_country) {
  const info = countryInfoFromCode(profileRow.stay_country.toUpperCase()); // stay_country는 ISO 코드
  return t('stay.stayingIn', { flag: info.countryFlag, name: info.countryName });
}
// ...기존 로직...
```

`countryInfoFromCode`는 FriendProfileScreen이 이미 import해 쓰는 함수(136행)를 재사용한다.

- [ ] **Step 4: tsc 통과 확인**

Run: `npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 5: 커밋**

```bash
git add src/components/ProfileSync.tsx src/services/profile.ts src/screens/FriendProfileScreen.tsx
git commit -m "feat(stay): 체류 상태 서버 동기화·이웃 프로필 체류국 표시"
```

---

## Phase 6 — 체류국을 홈처럼 (지역 프리셋·알림 억제)

### Task 15: 체류국 지역 프리셋 + 해외 알림 억제

**Files:**
- Modify: `src/screens/NewRecordScreen.tsx:484-492`, `src/screens/SnapRecordScreen.tsx`, `src/services/snapService.ts:71-77`

- [ ] **Step 1: NewRecord 지역 프리셋을 체류국까지**

`NewRecordScreen`에서 `activeStayGroup`을 읽어, 선택 국가가 체류국이면 국내처럼 `getHomeRegions(체류국코드)`를 로드하고 `isDomesticSelected` 판정에 체류국 포함.

- [ ] **Step 2: snapService.isAbroad에 체류국 예외**

`isAbroad`가 체류국도 홈처럼 취급하도록 `stayCountryCode` 인자를 추가:

```ts
export function isAbroad(currentCountryCode: string | null, homeCountryCode: string, stayCountryCode?: string | null): boolean {
  if (!currentCountryCode) return false;
  const cur = currentCountryCode.toUpperCase();
  if (cur === homeCountryCode.toUpperCase()) return false;
  if (stayCountryCode && cur === stayCountryCode.toUpperCase()) return false; // 체류국은 해외 알림 억제
  return true;
}
```

호출부(SnapRecordScreen 등)에서 진행 중 체류국 코드를 넘긴다.

- [ ] **Step 3: tsc 통과 확인**

Run: `npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 4: 커밋**

```bash
git add src/screens/NewRecordScreen.tsx src/screens/SnapRecordScreen.tsx src/services/snapService.ts
git commit -m "feat(stay): 체류국을 홈처럼 — 지역 프리셋·해외 알림 억제"
```

---

## Phase 7 — 검증

### Task 16: 전체 검증

**Files:** (없음 — 검증 전용)

- [ ] **Step 1: 순수 로직 검증**

Run: `npx tsx src/utils/stayMachine.verify.ts && npx tsx src/utils/badgeRules.verify.ts`
Expected: 둘 다 `✅ 통과`.

- [ ] **Step 2: 전체 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 3: 서버 적용 안내**

사용자에게 `supabase/schema.sql`의 profiles 컬럼·public_profiles 뷰 변경을 Supabase SQL 편집기에서 실행하도록 안내.

- [ ] **Step 4: 수동 플로우 검증 (실기기)**

- 해외 감지 → "장기체류" 선택 → 유형 → 체류 카드 생성
- 체류국 기록이 체류 카드에 쌓임, "🇯🇵 일본 체류 중" 표시, 지역 프리셋·해외 알림 억제 확인
- 방학 귀국 → 국내 기록(카드 없음)·위치 한국, 체류 일시정지
- 복귀 → 재프롬프트 없이 같은 카드 재개
- 제3국 여행 → 별도 여행 카드
- 위치 탭 → 체류 종료 / 60일 넛지 → 종료
- 통계·지구본에 체류국 방문국 반영, 이웃 프로필에 "체류 중" 노출
- 거주국을 실제로 변경 → 방문국/배지 자동 재집계 확인

- [ ] **Step 5: 완료 커밋(문서 상태 갱신 등, 코드 변경 없으면 생략)**

---

## 롤아웃 노트

- **동작 변경(주의):** 방문국 통계에서 이제 거주국이 제외된다 — 기존 사용자는 "방문한 나라" 수가 줄어들 수 있음(의도됨, 거주국은 방문이 아님).
- 서버 SQL(profiles 컬럼·뷰)은 사용자가 1회 실행. preview/production 동일 프로젝트면 자동 반영.
- 체류는 동시 1개. 새 나라 장기체류 시작 전 기존 체류 종료 필요(UI에서 안내).
