# 여행 기억(순간 메모) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 해외 여행 중 상시 알림을 탭해 순간 감정을 한 줄로 남기고, 여행 카드·기록 작성 화면에서 참고용으로 다시 보는 기능.

**Architecture:** 새 `momentStore`(Context+persist)에 순간을 로컬 저장하고, `SnapDetector`를 본뜬 `MomentNotifier`가 해외 체류 중 고정 알림을 게시한다. 알림 탭 → `MomentCapture` 모달 화면(기존 스냅 알림 딥링크 패턴). 매칭 로직은 순수 함수(`momentMatch.ts`)로 분리해 verify 스크립트로 검증한다.

**Tech Stack:** React Native (Expo SDK 54), TypeScript, expo-notifications ~0.32.17(설치됨), expo-location ~19.0.8(설치됨), expo-image-picker ~17.0.10(설치됨), react-i18next.

**스펙:** `docs/superpowers/specs/2026-07-19-travel-moments-design.md`

**검증 방식(레포 컨벤션):** 이 레포는 jest가 없다. 순수 로직은 `npx tsx <file>.verify.ts` 스크립트(badgeRules.verify.ts 방식), 그 외는 `npx tsc --noEmit` + 수동 시나리오로 검증한다. CLAUDE.md 규칙(오류 확인·호환성 확인)을 각 태스크 마지막에 수행한다.

**커밋 규칙:** 작업 트리에 미커밋 WIP가 많다 — 반드시 파일 단위로 스테이징한다(`git add <각 파일>`).

---

## 파일 구조

| 파일 | 역할 |
|------|------|
| Create: `src/store/momentStore.tsx` | TravelMoment 타입 + Context/Provider/useMoments (persist) |
| Create: `src/utils/momentMatch.ts` | 여행·작성화면 매칭 순수 함수 |
| Create: `src/utils/momentMatch.verify.ts` | 매칭 로직 검증 스크립트 |
| Create: `src/services/momentService.ts` | 고정 알림 게시/존재확인/제거 |
| Create: `src/components/MomentNotifier.tsx` | 해외 감지 → 알림 게시/재게시/제거 (SnapDetector 패턴) |
| Create: `src/screens/MomentCaptureScreen.tsx` | 캡처 시트(텍스트+무드+사진+위치칩) |
| Create: `src/components/moments/MomentCard.tsx` | 순간 카드(목록·서랍 공용) + 확대 모달 |
| Create: `src/components/moments/MomentListSheet.tsx` | 여행 기억 목록 시트(삭제 포함) |
| Create: `src/components/moments/MomentDrawer.tsx` | 작성 화면 상단 배너+서랍(순수 참고용) |
| Modify: `src/store/persist.ts` | STORE_KEYS에 moments 추가 |
| Modify: `App.tsx` | MomentProvider·MomentNotifier 마운트, 알림 응답 분기 + 콜드스타트 처리 |
| Modify: `src/navigation/types.ts` | RootStackParamList에 MomentCapture 추가 |
| Modify: `src/navigation/AppNavigator.tsx`(또는 실제 스택 파일) | MomentCapture 스크린 등록 |
| Modify: `src/store/settingsStore.tsx` | notifPrefs에 travelMoment 키 추가 |
| Modify: `src/screens/NotificationSettingsScreen.tsx` | 토글 행 추가 |
| Modify: `src/screens/ProfileScreen.tsx` | 여행 카드 ✨ 아이콘 + MomentListSheet 연결 |
| Modify: `src/screens/NewRecordScreen.tsx`, `BlogRecordScreen.tsx`, `CutRecordScreen.tsx` | MomentDrawer 마운트 |
| Modify: `src/services/appState.ts` | 백업 페이로드에 moments(사진 제외) 편승 |
| Modify: `src/i18n/locales/ko.ts`, `en.ts` | `moments` 네임스페이스 키 |

---

### Task 1: momentStore + persist 키 + Provider 마운트

**Files:**
- Create: `src/store/momentStore.tsx`
- Modify: `src/store/persist.ts:19-24` (STORE_KEYS)
- Modify: `App.tsx:79-96` (Provider 스택)

- [ ] **Step 1: STORE_KEYS에 moments 추가** — `src/store/persist.ts`의 STORE_KEYS에 한 줄:

```ts
export const STORE_KEYS = {
  records: '@eorth/records',
  settings: '@eorth/settings',
  dm: '@eorth/dm',
  feedCache: '@eorth/feedCache', // 소셜 피드 캐시
  moments: '@eorth/moments', // 여행 기억(순간 메모)
} as const;
```

- [ ] **Step 2: momentStore 작성** — `src/store/momentStore.tsx` 생성 (toastStore/settingsStore와 같은 Context 패턴, usePersistence 시그니처는 `(key, hydrate, serialize, deps) => hydrated`):

```tsx
// 여행 기억(순간 메모) 저장소 — 새로운 기록 형식이 아니다.
// TravelRecord·피드·통계·배지와 완전 분리된 개인 메모 레이어. 로컬 우선 저장.
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { usePersistence, STORE_KEYS } from './persist';

export interface TravelMoment {
  id: string;
  text: string;          // 한 줄 메모 (필수)
  mood?: string;         // 이모지 1개 (선택)
  photoUri?: string;     // 로컬 사진 1장 (선택) — 서버 백업 제외
  countryCode?: string;  // ISO2 대문자 (매칭용, 역지오코딩 실패 시 없음)
  countryName?: string;  // 표시용 국가명 (기기 언어 기준)
  regionName?: string;   // 도시/지역 (가능할 때만)
  createdAt: number;     // epoch ms
}

interface MomentContextValue {
  moments: TravelMoment[]; // 최신순
  addMoment: (m: Omit<TravelMoment, 'id' | 'createdAt'>) => void;
  removeMoment: (id: string) => void;
  hydrated: boolean;
}

const MomentContext = createContext<MomentContextValue | null>(null);

// recordStore와 같은 난수 기반 id (uuid 미설치 레포 컨벤션)
const genMomentId = () =>
  `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function MomentProvider({ children }: { children: React.ReactNode }) {
  const [moments, setMoments] = useState<TravelMoment[]>([]);

  const addMoment = useCallback((m: Omit<TravelMoment, 'id' | 'createdAt'>) => {
    setMoments((prev) => [{ ...m, id: genMomentId(), createdAt: Date.now() }, ...prev]);
  }, []);

  const removeMoment = useCallback((id: string) => {
    setMoments((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const hydrated = usePersistence<{ moments: TravelMoment[] }>(
    STORE_KEYS.moments,
    (p) => setMoments(Array.isArray(p.moments) ? p.moments : []),
    () => ({ moments }),
    [moments],
  );

  const value = useMemo(
    () => ({ moments, addMoment, removeMoment, hydrated }),
    [moments, addMoment, removeMoment, hydrated],
  );
  return <MomentContext.Provider value={value}>{children}</MomentContext.Provider>;
}

export function useMoments(): MomentContextValue {
  const ctx = useContext(MomentContext);
  if (!ctx) throw new Error('useMoments must be used within MomentProvider');
  return ctx;
}
```

- [ ] **Step 3: App.tsx에 Provider 마운트** — `RecordProvider` 바로 안쪽에 `MomentProvider`를 감싼다(MomentNotifier가 useRecords·useSettings를 쓰므로 둘 안쪽이어야 함):

```tsx
<RecordProvider>
  <MomentProvider>
    <DMProvider>
      ...기존 그대로...
    </DMProvider>
  </MomentProvider>
</RecordProvider>
```
import 추가: `import { MomentProvider } from './src/store/momentStore';`

- [ ] **Step 4: 타입 체크** — Run: `npx tsc --noEmit` / Expected: 오류 0

- [ ] **Step 5: 커밋**

```bash
git add src/store/momentStore.tsx src/store/persist.ts App.tsx
git commit -m "feat(moments): momentStore 신설 — 여행 기억 로컬 저장소(persist)"
```

---

### Task 2: 매칭 순수 함수 + verify 스크립트

**Files:**
- Create: `src/utils/momentMatch.ts`
- Create: `src/utils/momentMatch.verify.ts`

- [ ] **Step 1: momentMatch.ts 작성**

```ts
// 순간 메모 ↔ 여행/작성화면 매칭 — 순수 함수 (스펙 ③·④의 매칭 규칙).
// 규칙: 국가·기간 둘 다 알면 AND, 국가만 알면 국가, 순간에 국가가 없으면(역지오코딩 실패) 기간만.
import { COUNTRIES } from '../constants/countries';
import type { TravelMoment } from '../store/momentStore';

const DAY_MS = 24 * 60 * 60 * 1000;
// 항공편·시차로 기록 날짜와 캡처 시각이 하루쯤 어긋날 수 있어 앞뒤 1일 여유
const TRIP_PAD_MS = DAY_MS;

// 한글 국가명 → ISO2 코드 (SnapDetector와 동일한 term 규칙)
export function countryNameToCode(name?: string | null): string | null {
  if (!name) return null;
  const c = COUNTRIES.find((k) => k.name === name);
  return c ? c.term.split(' ')[0].toUpperCase() : null;
}

// 'YYYY.MM.DD' 또는 'YYYY-MM-DD' → epoch ms (badgeRules.parseDate와 동일 규칙)
export function parseDotDate(s?: string | null): number | null {
  if (!s) return null;
  const t = new Date(s.replace(/\./g, '-')).getTime();
  return Number.isFinite(t) ? t : null;
}

// 여행 그룹에 속한 기록들의 날짜에서 [최소 시작, 최대 종료]를 뽑는다. 날짜가 하나도 없으면 null.
export function tripPeriodOf(
  records: { startDate?: string; endDate?: string; date?: string }[],
): { startMs: number; endMs: number } | null {
  let start: number | null = null;
  let end: number | null = null;
  for (const r of records) {
    const s = parseDotDate(r.startDate) ?? parseDotDate(r.date);
    const e = parseDotDate(r.endDate) ?? s;
    if (s != null && (start == null || s < start)) start = s;
    if (e != null && (end == null || e > end)) end = e;
  }
  return start != null && end != null ? { startMs: start, endMs: end } : null;
}

export interface MomentMatchQuery {
  countryCode?: string | null; // ISO2 (없으면 국가 무시)
  startMs?: number | null;
  endMs?: number | null;
}

export function matchMoments(moments: TravelMoment[], q: MomentMatchQuery): TravelMoment[] {
  return moments.filter((m) => {
    const bothCodes = !!m.countryCode && !!q.countryCode;
    const codeOk = bothCodes && m.countryCode!.toUpperCase() === q.countryCode!.toUpperCase();
    const hasPeriod = q.startMs != null && q.endMs != null;
    const dateOk =
      hasPeriod &&
      m.createdAt >= (q.startMs as number) - TRIP_PAD_MS &&
      m.createdAt <= (q.endMs as number) + TRIP_PAD_MS;
    if (bothCodes && hasPeriod) return codeOk && dateOk;
    if (bothCodes) return codeOk;   // 기간 정보 없음 → 국가만
    if (hasPeriod) return dateOk;   // 국가 정보 없는 순간 → 날짜 겹칠 때만 (스펙 ④)
    return false;
  });
}
```

- [ ] **Step 2: verify 스크립트 작성** — `src/utils/momentMatch.verify.ts` (badgeRules.verify.ts와 같은 형식):

```ts
// 순간 매칭 로직 검증 (jest 미사용). 실행: npx tsx src/utils/momentMatch.verify.ts
import { matchMoments, tripPeriodOf, countryNameToCode, parseDotDate } from './momentMatch';
import type { TravelMoment } from '../store/momentStore';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}

const at = (s: string) => new Date(s).getTime();
const mk = (over: Partial<TravelMoment>): TravelMoment => ({
  id: 'x', text: 't', createdAt: at('2026-07-02T10:00:00Z'), ...over,
});

// 국가+기간 모두 있으면 AND
{
  const ms = [mk({ countryCode: 'JP' }), mk({ countryCode: 'FR' })];
  const r = matchMoments(ms, { countryCode: 'JP', startMs: at('2026-07-01'), endMs: at('2026-07-04') });
  assert(r.length === 1 && r[0].countryCode === 'JP', '국가+기간 매칭: 일본만');
}
// 기간 앞뒤 1일 여유
{
  const ms = [mk({ countryCode: 'JP', createdAt: at('2026-06-30T20:00:00Z') })];
  const r = matchMoments(ms, { countryCode: 'JP', startMs: at('2026-07-01'), endMs: at('2026-07-04') });
  assert(r.length === 1, '시작 전날 캡처도 1일 패딩으로 포함');
}
// 기간 없으면 국가만
{
  const ms = [mk({ countryCode: 'JP' })];
  assert(matchMoments(ms, { countryCode: 'JP' }).length === 1, '기간 없음 → 국가만으로 매칭');
  assert(matchMoments(ms, { countryCode: 'FR' }).length === 0, '다른 국가는 제외');
}
// 국가 없는 순간(역지오코딩 실패)은 기간 겹칠 때만
{
  const ms = [mk({})];
  assert(matchMoments(ms, { countryCode: 'JP', startMs: at('2026-07-01'), endMs: at('2026-07-04') }).length === 1,
    '국가 없는 순간: 기간 겹치면 포함');
  assert(matchMoments(ms, { countryCode: 'JP' }).length === 0,
    '국가 없는 순간: 기간 정보 없으면 제외');
}
// tripPeriodOf: 기록들의 최소~최대
{
  const p = tripPeriodOf([
    { startDate: '2026.07.02', endDate: '2026.07.03' },
    { date: '2026.07.05' },
  ]);
  assert(p != null && p.startMs === parseDotDate('2026.07.02') && p.endMs === parseDotDate('2026.07.05'),
    'tripPeriodOf: 최소 시작~최대 종료');
  assert(tripPeriodOf([{}]) === null, '날짜 전혀 없으면 null');
}
// countryNameToCode
assert(countryNameToCode('일본') === 'JP', '일본 → JP');
assert(countryNameToCode('없는나라') === null, '미등록 국가 → null');

if (failures > 0) { console.error(`\n❌ ${failures}개 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
```

- [ ] **Step 3: verify 실행** — Run: `npx tsx src/utils/momentMatch.verify.ts` / Expected: `✅ 모든 검증 통과`

- [ ] **Step 4: 타입 체크** — Run: `npx tsc --noEmit` / Expected: 오류 0

- [ ] **Step 5: 커밋**

```bash
git add src/utils/momentMatch.ts src/utils/momentMatch.verify.ts
git commit -m "feat(moments): 순간↔여행 매칭 순수 함수 + verify"
```

---

### Task 3: i18n 키 + 캡처 화면 + 네비게이션

**Files:**
- Modify: `src/i18n/locales/ko.ts`, `src/i18n/locales/en.ts` (최상위에 `moments` 네임스페이스 추가)
- Create: `src/screens/MomentCaptureScreen.tsx`
- Modify: `src/navigation/types.ts:86-146` (RootStackParamList)
- Modify: 스택 등록 파일 — `Grep "SnapRecord" src/navigation/`으로 Stack.Screen 등록 위치를 찾아 같은 파일에 추가

- [ ] **Step 1: i18n 키 추가** — ko.ts / en.ts 각각 최상위에:

```ts
// ko.ts
moments: {
  captureTitle: '지금 이 순간',
  placeholder: '지금 느낌을 한 줄로 남겨보세요',
  addPhoto: '사진',
  save: '저장',
  saved: '✨ 순간이 저장됐어요',
  notifTitle: '여행 중이네요! ✨',
  notifBody: '지금 이 순간의 감정을 남겨보세요',
  drawerBanner: '✨ 이 여행의 순간 {{count}}개',
  sheetTitle: '여행 기억',
  deleteTitle: '이 순간을 삭제할까요?',
  deleteConfirm: '삭제',
  settingsLabel: '여행 중 순간 기록 알림',
  settingsDesc: '해외 여행 중 순간 메모 알림을 띄워요',
},
```

```ts
// en.ts
moments: {
  captureTitle: 'This moment',
  placeholder: 'Capture how you feel in one line',
  addPhoto: 'Photo',
  save: 'Save',
  saved: '✨ Moment saved',
  notifTitle: 'You are traveling! ✨',
  notifBody: 'Capture how this moment feels',
  drawerBanner: '✨ {{count}} moments from this trip',
  sheetTitle: 'Trip memories',
  deleteTitle: 'Delete this moment?',
  deleteConfirm: 'Delete',
  settingsLabel: 'Travel moment reminder',
  settingsDesc: 'Show a reminder to capture moments while abroad',
},
```

- [ ] **Step 2: RootStackParamList에 라우트 추가** — `src/navigation/types.ts`:

```ts
MomentCapture: undefined;
```

- [ ] **Step 3: MomentCaptureScreen 작성** — `src/screens/MomentCaptureScreen.tsx`. 디자인 토큰(#0A0A0F 배경, #2E2E3B 카드, #BF85FC 보라 네온), safe-area 컨벤션(useSafeAreaInsets) 준수:

```tsx
// 순간 캡처 시트 — 알림 탭으로만 진입(스펙: 알림 단독 진입점).
// 텍스트(필수) + 무드 이모지(선택) + 사진 1장(선택) + 자동 시간·위치. 2초 안에 입력 시작이 목표.
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { useMoments } from '../store/momentStore';
import { useToast } from '../store/toastStore';
import { detectCurrentCountry } from '../services/snapService';
import { locateCountry } from '../utils/countryLocate';
import * as Location from 'expo-location';

const MOODS = ['😊', '🥹', '😮', '😌', '🤩', '😭'];

export default function MomentCaptureScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { addMoment } = useMoments();
  const { pushToast } = useToast();

  const [text, setText] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  // 위치는 비동기로 채운다 — 실패해도 저장에 지장 없음(오프라인 필수 동작)
  const [geo, setGeo] = useState<{ code?: string; name?: string; region?: string }>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 1차: OS 역지오코딩 (snapService 재사용)
        const { countryCode, countryName, city } = await detectCurrentCountry();
        if (cancelled) return;
        if (countryCode || countryName) {
          setGeo({ code: countryCode ?? undefined, name: countryName ?? undefined, region: city ?? undefined });
          return;
        }
        // 2차: 오프라인 폴백 — 좌표만으로 GeoJSON 판정 (countryLocate)
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') return;
        const loc = await Location.getLastKnownPositionAsync();
        if (!loc || cancelled) return;
        const hit = locateCountry(loc.coords.latitude, loc.coords.longitude);
        if (hit && !cancelled) setGeo({ code: hit.code, name: hit.name });
      } catch { /* 위치 실패는 무시 — 시간만 저장 */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  };

  const save = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    addMoment({
      text: trimmed,
      mood: mood ?? undefined,
      photoUri: photoUri ?? undefined,
      countryCode: geo.code,
      countryName: geo.name,
      regionName: geo.region,
    });
    pushToast(t('moments.saved'));
    navigation.goBack();
  };

  return (
    <View style={st.root}>
      {/* 배경 탭으로 닫기 */}
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => navigation.goBack()} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[st.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={st.grab} />
          <Text style={st.title}>✨ {t('moments.captureTitle')}</Text>
          <TextInput
            style={st.input}
            placeholder={t('moments.placeholder')}
            placeholderTextColor="#5a5a68"
            value={text}
            onChangeText={setText}
            autoFocus
            multiline
            maxLength={200}
          />
          <View style={st.moodRow}>
            {MOODS.map((m) => (
              <TouchableOpacity key={m} onPress={() => setMood(mood === m ? null : m)}>
                <Text style={[st.mood, mood === m && st.moodOn]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={st.bottomRow}>
            <TouchableOpacity style={st.chip} onPress={pickPhoto}>
              {photoUri
                ? <Image source={{ uri: photoUri }} style={st.thumb} />
                : <Text style={st.chipText}>📷 {t('moments.addPhoto')}</Text>}
            </TouchableOpacity>
            {geo.name ? (
              <View style={st.chip}>
                <Text style={st.chipText}>📍 {geo.region || geo.name}</Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={[st.saveBtn, !text.trim() && { opacity: 0.4 }]}
              onPress={save}
              disabled={!text.trim()}
            >
              <Text style={st.saveText}>{t('moments.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#17131f', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: '#2E2E3B', padding: 16,
  },
  grab: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#2E2E3B', alignSelf: 'center', marginBottom: 12 },
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 10 },
  input: {
    backgroundColor: '#211b2e', borderWidth: 1, borderColor: '#2E2E3B', borderRadius: 12,
    color: '#FFFFFF', padding: 12, minHeight: 64, textAlignVertical: 'top', fontSize: 15,
  },
  moodRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  mood: { fontSize: 26, opacity: 0.45 },
  moodOn: { opacity: 1, transform: [{ scale: 1.15 }] },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  chip: {
    borderWidth: 1, borderColor: '#6B21A8', borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  chipText: { color: '#BF85FC', fontSize: 12 },
  thumb: { width: 28, height: 28, borderRadius: 6 },
  saveBtn: {
    marginLeft: 'auto', backgroundColor: '#BF85FC', borderRadius: 16,
    paddingHorizontal: 18, paddingVertical: 8,
  },
  saveText: { color: '#12061f', fontWeight: '700', fontSize: 14 },
});
```

- [ ] **Step 4: 스크린 등록** — `Grep "SnapRecord" src/navigation/`으로 `Stack.Screen name="SnapRecord"` 등록 파일·옵션을 확인하고, 같은 파일에 투명 모달로 등록:

```tsx
<Stack.Screen
  name="MomentCapture"
  component={MomentCaptureScreen}
  options={{ presentation: 'transparentModal', animation: 'slide_from_bottom', headerShown: false }}
/>
```
(해당 스택의 기존 options 표기 방식이 다르면 그 방식을 따른다 — 예: screenOptions 공통 + 개별 오버라이드)

- [ ] **Step 5: 타입 체크** — Run: `npx tsc --noEmit` / Expected: 오류 0

- [ ] **Step 6: 수동 확인(선택, 에뮬레이터 가동 시)** — 임시로 아무 버튼에 `navigation.navigate('MomentCapture')`를 연결하지 **말고**, 다음 태스크의 알림 경유로 확인한다(스펙: 인앱 진입점 없음).

- [ ] **Step 7: 커밋**

```bash
git add src/screens/MomentCaptureScreen.tsx src/navigation/types.ts src/i18n/locales/ko.ts src/i18n/locales/en.ts
git add <Step 4에서 수정한 네비게이터 파일>
git commit -m "feat(moments): 캡처 시트 화면 + MomentCapture 라우트 + i18n"
```

---

### Task 4: 알림 서비스 + MomentNotifier + 딥링크

**Files:**
- Create: `src/services/momentService.ts`
- Create: `src/components/MomentNotifier.tsx`
- Modify: `App.tsx:28-39` (알림 응답 리스너 확장 + 콜드스타트), `App.tsx:79-96` (MomentNotifier 마운트)

- [ ] **Step 1: momentService 작성** — `src/services/momentService.ts`:

```ts
// 여행 기억 상시 알림 — 게시/존재확인/제거.
// 문자열은 호출부(MomentNotifier)가 i18n으로 만들어 넘긴다(서비스는 순수 유지).
// 안드로이드: sticky(고정 알림, 스와이프 불가 기기에선 고정·가능 기기에선 재게시 규칙으로 보완).
// iOS: sticky 미지원 → 일반 알림 + '지워져 있으면 재게시' 규칙(스펙 ②).
import * as Notifications from 'expo-notifications';

export const MOMENT_NOTIF_ID = 'travel-moment-ongoing';

export async function postMomentNotification(title: string, body: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: MOMENT_NOTIF_ID, // 같은 id로 게시하면 교체되어 중복 알림이 쌓이지 않는다
    content: {
      title,
      body,
      sticky: true, // Android 전용 — iOS에선 무시됨
      data: { type: 'moment' },
    },
    trigger: null, // 즉시 게시
  });
}

// 알림창에 아직 떠 있는지 — 떠 있으면 재게시하지 않는다(포그라운드 전환마다 재알림 방지)
export async function isMomentNotificationPresented(): Promise<boolean> {
  const list = await Notifications.getPresentedNotificationsAsync();
  return list.some((n) => n.request.identifier === MOMENT_NOTIF_ID);
}

export async function dismissMomentNotification(): Promise<void> {
  try { await Notifications.dismissNotificationAsync(MOMENT_NOTIF_ID); } catch { /* 없으면 무시 */ }
}
```

- [ ] **Step 2: MomentNotifier 작성** — `src/components/MomentNotifier.tsx` (SnapDetector와 동일 골격 — 4시간 위치 스로틀·체류국 제외·마스터 토글 게이트를 그대로 따르되, "떠 있는지"는 포그라운드마다 확인):

```tsx
// MomentNotifier — 해외 체류 중 '순간 기록' 상시 알림을 유지하는 컴포넌트.
// SnapDetector와 같은 패턴: 앱 실행/포그라운드 전환 시 위치 확인.
// 해외면 알림이 떠 있게 유지(지워졌으면 재게시), 귀국하면 제거. App.tsx에 마운트.
import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { COUNTRIES } from '../constants/countries';
import { detectCurrentCountry, isAbroad, requestNotificationPermission } from '../services/snapService';
import { postMomentNotification, isMomentNotificationPresented, dismissMomentNotification } from '../services/momentService';

const LOCATION_CHECK_INTERVAL = 4 * 60 * 60 * 1000; // 위치 재확인은 4시간마다(SnapDetector와 동일)

export default function MomentNotifier() {
  const { t } = useTranslation();
  const { homeCountryCode, notifPrefs } = useSettings();
  const { activeStayGroup } = useRecords();
  const lastLocCheckRef = useRef(0);
  const abroadRef = useRef<boolean | null>(null); // 마지막 위치 판정 캐시

  // 진행 중 체류국은 해외로 치지 않는다 (SnapDetector와 동일 규칙)
  const stayCountryCode = useMemo(() => {
    if (activeStayGroup?.stay?.status !== 'active') return null;
    const name = activeStayGroup.countryName;
    if (!name) return null;
    return COUNTRIES.find((c) => c.name === name)?.term.split(' ')[0].toUpperCase() ?? null;
  }, [activeStayGroup]);

  useEffect(() => {
    if (!notifPrefs.master || !notifPrefs.travelMoment) {
      dismissMomentNotification(); // 토글 끄면 즉시 내린다
      abroadRef.current = null;
      return;
    }

    const check = async () => {
      const now = Date.now();
      // 위치 판정은 스로틀, 알림 존재 확인·재게시는 매 포그라운드마다
      if (abroadRef.current === null || now - lastLocCheckRef.current >= LOCATION_CHECK_INTERVAL) {
        lastLocCheckRef.current = now;
        const { countryCode } = await detectCurrentCountry();
        if (countryCode) abroadRef.current = isAbroad(countryCode, homeCountryCode, stayCountryCode);
        // countryCode를 못 얻으면 직전 판정 유지(오프라인 대응)
      }
      if (abroadRef.current === true) {
        if (!(await isMomentNotificationPresented())) {
          const ok = await requestNotificationPermission();
          if (ok) await postMomentNotification(t('moments.notifTitle'), t('moments.notifBody'));
        }
      } else if (abroadRef.current === false) {
        await dismissMomentNotification(); // 귀국 → 제거
      }
    };

    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    check(); // 앱 실행 시 1회
    return () => sub.remove();
  }, [notifPrefs.master, notifPrefs.travelMoment, homeCountryCode, stayCountryCode, t]);

  return null;
}
```
주의: `notifPrefs.travelMoment` 키는 Task 5에서 추가된다. **Task 5를 먼저 하지 않으면 tsc가 실패하므로, 이 태스크의 tsc/커밋은 Step 4까지 마친 뒤 Task 5와 함께 진행해도 된다** (또는 Task 5 Step 1만 먼저 수행).

- [ ] **Step 3: App.tsx 알림 응답 분기 확장** — 기존 리스너(라인 28-39)의 `if (data?.type === 'snap')` 아래에 분기 추가:

```tsx
if (data?.type === 'moment') {
  const nav = navigationRef.current;
  if (nav?.isReady()) nav.navigate('MomentCapture');
}
```

- [ ] **Step 4: 콜드스타트 처리** — 같은 useEffect 안에서, 앱이 종료 상태에서 알림 탭으로 열린 경우(리스너가 못 받을 수 있음)를 처리. 리스너 등록 코드 아래 추가:

```tsx
// 콜드스타트: 종료 상태에서 알림 탭으로 열린 경우 — 네비 준비를 기다렸다 이동
Notifications.getLastNotificationResponseAsync().then((response) => {
  const data = response?.notification.request.content.data;
  if (data?.type !== 'moment') return;
  let tries = 0;
  const timer = setInterval(() => {
    const nav = navigationRef.current;
    tries += 1;
    if (nav?.isReady()) { clearInterval(timer); nav.navigate('MomentCapture'); }
    else if (tries > 20) clearInterval(timer); // 10초 포기
  }, 500);
});
```
(기존 snap 콜드스타트 처리가 이미 있으면 그 분기에 moment만 추가한다 — 파일을 먼저 읽고 판단.)

- [ ] **Step 5: MomentNotifier 마운트** — App.tsx의 `<SnapDetector />` 옆에:

```tsx
<SnapDetector />
<MomentNotifier />
```
import: `import MomentNotifier from './src/components/MomentNotifier';`

- [ ] **Step 6: 커밋은 Task 5와 함께** (travelMoment 키 의존)

---

### Task 5: 설정 토글 (notifPrefs.travelMoment)

**Files:**
- Modify: `src/store/settingsStore.tsx:28,31` (NotifPrefKey 유니온 + 기본값)
- Modify: `src/screens/NotificationSettingsScreen.tsx:84-93` (토글 행)

- [ ] **Step 1: settingsStore에 키 추가** — 라인 28 유니온에 `'travelMoment'` 추가, 라인 31 기본값에 `travelMoment: true` 추가:

```ts
  | 'returnDetect' | 'memoryRemind' | 'marketing' | 'travelMoment';
```
```ts
  returnDetect: false, memoryRemind: true, marketing: false, travelMoment: true,
```
(hydrate가 `{ ...DEFAULT_NOTIF_PREFS, ...저장값 }`으로 병합하므로 기존 사용자도 자동으로 기본 켜짐.)

- [ ] **Step 2: 설정 화면 토글 행 추가** — `NotificationSettingsScreen.tsx`의 토글 목록(라인 84-93 부근)에서 memoryRemind 행 뒤에 기존 ToggleRow 패턴 그대로:

```tsx
<ToggleRow
  icon={<Text style={{ fontSize: 18 }}>✨</Text>}
  label={t('moments.settingsLabel')}
  description={t('moments.settingsDesc')}
  value={notifPrefs.travelMoment}
  onValueChange={(v) => setNotifPref('travelMoment', v)}
/>
```
(이 화면의 실제 value/onValueChange 헬퍼 이름을 라인 84-120에서 확인해 동일하게 맞춘다 — 기존 행들과 완전히 같은 호출 형태여야 한다. 마스터 OFF 시 비활성 처리도 기존 행과 동일하게.)

- [ ] **Step 3: 타입 체크** — Run: `npx tsc --noEmit` / Expected: 오류 0 (Task 4의 travelMoment 참조 포함 전체 통과)

- [ ] **Step 4: Task 4+5 커밋**

```bash
git add src/services/momentService.ts src/components/MomentNotifier.tsx App.tsx
git add src/store/settingsStore.tsx src/screens/NotificationSettingsScreen.tsx
git commit -m "feat(moments): 해외 상시 알림(MomentNotifier)+딥링크+설정 토글"
```

---

### Task 6: 순간 카드 컴포넌트 + 여행 카드 ✨ + 목록 시트

**Files:**
- Create: `src/components/moments/MomentCard.tsx`
- Create: `src/components/moments/MomentListSheet.tsx`
- Modify: `src/screens/ProfileScreen.tsx` — 카드 2곳(히어로 ~라인 2061, 그리드 ~라인 2138) + 시트 state

- [ ] **Step 1: MomentCard 작성** — `src/components/moments/MomentCard.tsx` (목록·서랍 공용):

```tsx
// 순간 카드 — 여행 기억 목록·작성 화면 서랍 공용. 탭하면 onPress(확대 보기 등).
import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import type { TravelMoment } from '../../store/momentStore';

export function formatMomentTime(createdAt: number): string {
  const d = new Date(createdAt);
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

export default function MomentCard({
  moment, onPress, onLongPress, compact,
}: {
  moment: TravelMoment;
  onPress?: () => void;
  onLongPress?: () => void;
  compact?: boolean; // 서랍(가로 스크롤)용 축소 카드
}) {
  const place = moment.regionName || moment.countryName;
  return (
    <TouchableOpacity
      style={[st.card, compact && st.cardCompact]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.8}
    >
      <View style={st.topRow}>
        {moment.mood ? <Text style={st.mood}>{moment.mood}</Text> : null}
        {moment.photoUri ? <Image source={{ uri: moment.photoUri }} style={st.thumb} /> : null}
      </View>
      <Text style={st.text} numberOfLines={compact ? 3 : undefined}>{moment.text}</Text>
      <Text style={st.meta}>
        {place ? `📍 ${place} · ` : ''}{formatMomentTime(moment.createdAt)}
      </Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: '#17131f', borderWidth: 1, borderColor: '#2E2E3B',
    borderRadius: 14, padding: 12, marginBottom: 10,
  },
  cardCompact: { width: 150, marginBottom: 0, marginRight: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  mood: { fontSize: 20 },
  thumb: { width: 28, height: 28, borderRadius: 6, marginLeft: 'auto' },
  text: { color: '#E8E8F0', fontSize: 13, lineHeight: 19 },
  meta: { color: '#A1A1B0', fontSize: 10, marginTop: 6 },
});
```

- [ ] **Step 2: MomentListSheet 작성** — `src/components/moments/MomentListSheet.tsx` (ProfileScreen의 BadgeListModal과 같은 Modal pageSheet 방식):

```tsx
// 여행 기억 목록 시트 — 여행 카드 ✨ 아이콘 탭으로 열림. 시간순 목록 + 길게 눌러 삭제.
import React from 'react';
import { View, Text, Modal, FlatList, Alert, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useMoments, TravelMoment } from '../../store/momentStore';
import MomentCard from './MomentCard';

export default function MomentListSheet({
  visible, onClose, moments, tripTitle,
}: {
  visible: boolean;
  onClose: () => void;
  moments: TravelMoment[]; // 이미 해당 여행으로 매칭된 목록
  tripTitle: string;
}) {
  const { t } = useTranslation();
  const { removeMoment } = useMoments();

  const confirmDelete = (m: TravelMoment) => {
    Alert.alert(t('moments.deleteTitle'), m.text, [
      { text: t('common.close'), style: 'cancel' },
      { text: t('moments.deleteConfirm'), style: 'destructive', onPress: () => removeMoment(m.id) },
    ]);
  };

  const sorted = [...moments].sort((a, b) => a.createdAt - b.createdAt); // 시간순

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={st.root}>
        <View style={st.handle} />
        <Text style={st.title}>✨ {t('moments.sheetTitle')}</Text>
        <Text style={st.subtitle}>{tripTitle}</Text>
        <FlatList
          data={sorted}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <MomentCard moment={item} onLongPress={() => confirmDelete(item)} />
          )}
        />
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0F' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#2E2E3B', alignSelf: 'center', marginTop: 10 },
  title: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', textAlign: 'center', marginTop: 14 },
  subtitle: { color: '#A1A1B0', fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: 8 },
});
```
`common.close` 키가 없으면 ko/en에서 실제 존재하는 취소 키를 확인해 교체한다(예: `common.cancel`).

- [ ] **Step 3: ProfileScreen 연결** — ProfileScreen 함수 컴포넌트(라인 1540대, badgeEarnedAt 읽는 곳 근처)에 추가:

```tsx
const { moments } = useMoments();
const [momentSheetTrip, setMomentSheetTrip] = useState<TripThumbnail | null>(null);

// 여행별 매칭된 순간 목록 (국가코드 + 그룹 기록들의 날짜 범위)
const momentsByTrip = useMemo(() => {
  const map = new Map<string, TravelMoment[]>();
  for (const trip of mappedThumbnails) {
    const fullRecs = trip.records
      .map((r) => records.find((x) => x.id === r.id))
      .filter(Boolean) as typeof records;
    const period = tripPeriodOf(fullRecs);
    const matched = matchMoments(moments, {
      countryCode: countryNameToCode(trip.country),
      startMs: period?.startMs,
      endMs: period?.endMs,
    });
    if (matched.length > 0) map.set(trip.id, matched);
  }
  return map;
}, [moments, mappedThumbnails, records]);
```
import 추가:
```tsx
import { useMoments, TravelMoment } from '../store/momentStore';
import { matchMoments, tripPeriodOf, countryNameToCode } from '../utils/momentMatch';
import MomentListSheet from '../components/moments/MomentListSheet';
```
`mappedThumbnails`가 스코프에 없으면(변수명이 다르면) 라인 1624 부근의 실제 이름을 확인해 맞춘다.

- [ ] **Step 4: 카드 2곳에 ✨ 아이콘** — 히어로 카드(라인 ~2061 `stayBadge` 부근)와 그리드 카드(라인 ~2138)에 각각, `stayLabel` 표시 옆에:

```tsx
{momentsByTrip.has(trip.id) && (
  <TouchableOpacity
    onPress={() => setMomentSheetTrip(trip)}
    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
  >
    <Text style={{ fontSize: 14 }}>✨</Text>
  </TouchableOpacity>
)}
```
(히어로 카드 쪽은 변수명이 `displayTrips[0]`이므로 `trip` 대신 그것을 쓴다. 카드 전체 onPress(TripDetail 이동)와 겹치지 않도록 반드시 별도 TouchableOpacity로.)

화면 하단(다른 Modal들 옆)에 시트 렌더:

```tsx
<MomentListSheet
  visible={momentSheetTrip != null}
  onClose={() => setMomentSheetTrip(null)}
  moments={momentSheetTrip ? momentsByTrip.get(momentSheetTrip.id) ?? [] : []}
  tripTitle={momentSheetTrip ? `${momentSheetTrip.countryFlag} ${momentSheetTrip.title}` : ''}
/>
```

- [ ] **Step 5: 타입 체크** — Run: `npx tsc --noEmit` / Expected: 오류 0

- [ ] **Step 6: 커밋**

```bash
git add src/components/moments/MomentCard.tsx src/components/moments/MomentListSheet.tsx src/screens/ProfileScreen.tsx
git commit -m "feat(moments): 여행 카드 ✨ 아이콘 + 여행 기억 목록 시트"
```

---

### Task 7: 작성 화면 서랍(MomentDrawer) — 순수 참고용

**Files:**
- Create: `src/components/moments/MomentDrawer.tsx`
- Modify: `src/screens/NewRecordScreen.tsx`, `src/screens/BlogRecordScreen.tsx`, `src/screens/CutRecordScreen.tsx`

- [ ] **Step 1: MomentDrawer 작성**:

```tsx
// 기록 작성 화면 상단 서랍 — 순수 참고용(스펙 ④). 삽입·복사 없음.
// 매칭되는 순간이 있을 때만 배너 표시 → 펼치면 가로 카드 → 탭하면 확대 모달.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Image, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TravelMoment } from '../../store/momentStore';
import MomentCard, { formatMomentTime } from './MomentCard';

export default function MomentDrawer({ moments }: { moments: TravelMoment[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [enlarged, setEnlarged] = useState<TravelMoment | null>(null);

  if (moments.length === 0) return null;
  const sorted = [...moments].sort((a, b) => a.createdAt - b.createdAt);

  return (
    <View style={st.wrap}>
      <TouchableOpacity style={st.banner} onPress={() => setOpen(!open)} activeOpacity={0.8}>
        <Text style={st.bannerText}>{t('moments.drawerBanner', { count: moments.length })}</Text>
        <Text style={st.bannerArrow}>{open ? '▴' : '▾'}</Text>
      </TouchableOpacity>
      {open && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.row}>
          {sorted.map((m) => (
            <MomentCard key={m.id} moment={m} compact onPress={() => setEnlarged(m)} />
          ))}
        </ScrollView>
      )}
      {/* 확대 보기 — 보면서 직접 쓰는 용도라 어떤 액션 버튼도 없다 */}
      <Modal visible={enlarged != null} transparent animationType="fade" onRequestClose={() => setEnlarged(null)}>
        <TouchableOpacity style={st.dim} activeOpacity={1} onPress={() => setEnlarged(null)}>
          {enlarged && (
            <View style={st.big}>
              {enlarged.mood ? <Text style={st.bigMood}>{enlarged.mood}</Text> : null}
              {enlarged.photoUri ? <Image source={{ uri: enlarged.photoUri }} style={st.bigPhoto} /> : null}
              <Text style={st.bigText}>{enlarged.text}</Text>
              <Text style={st.bigMeta}>
                {(enlarged.regionName || enlarged.countryName) ? `📍 ${enlarged.regionName || enlarged.countryName} · ` : ''}
                {formatMomentTime(enlarged.createdAt)}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginTop: 8 },
  banner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(191,133,252,0.12)', borderWidth: 1, borderColor: '#6B21A8',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
  },
  bannerText: { color: '#BF85FC', fontSize: 12, fontWeight: '600' },
  bannerArrow: { color: '#BF85FC', fontSize: 12 },
  row: { marginTop: 8 },
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 32 },
  big: {
    backgroundColor: '#17131f', borderWidth: 1, borderColor: '#2E2E3B',
    borderRadius: 16, padding: 20,
  },
  bigMood: { fontSize: 32, marginBottom: 8 },
  bigPhoto: { width: '100%', height: 180, borderRadius: 12, marginBottom: 10 },
  bigText: { color: '#FFFFFF', fontSize: 16, lineHeight: 24 },
  bigMeta: { color: '#A1A1B0', fontSize: 11, marginTop: 10 },
});
```

- [ ] **Step 2: NewRecordScreen 통합** — 이 화면은 선택 국가 배열 state(라인 473-476 부근, editRecord.countries 초기값)와 날짜 state(라인 699-701 부근 `newStartInit`/`newEndInit` 초기값의 useState)를 가진다. 해당 state의 실제 변수명을 확인한 뒤(예: `countries`, `startDate`, `endDate`), 컴포넌트 안에서:

```tsx
const { moments } = useMoments();
const matchedMoments = useMemo(() => {
  const first = /* 선택 국가 배열 첫 항목 */;
  const startMs = /* 시작 날짜 state */ ? (시작 Date).getTime() : null;
  const endMs = /* 종료 날짜 state */ ? (종료 Date).getTime() : startMs;
  return matchMoments(moments, {
    countryCode: countryNameToCode(first?.name),
    startMs, endMs,
  });
}, [moments, /* 국가·날짜 state들 */]);
```
렌더 트리 상단(제목 입력 위 헤더 아래)에 `<MomentDrawer moments={matchedMoments} />` 추가.
import: `useMoments`, `matchMoments`, `countryNameToCode`, `MomentDrawer`.

**주의:** 위 주석 자리는 실제 변수명 확인 후 채운다. 날짜가 Date 객체인지 'YYYY.MM.DD' 문자열인지 확인하고 문자열이면 `parseDotDate` 사용. 날짜 미입력 상태면 null을 넘겨 국가만으로 매칭(스펙 ④).

- [ ] **Step 3: BlogRecordScreen·CutRecordScreen 통합** — 각 파일에서 `Grep "detectCurrentCountry|selectedCountry|tripPeriod"`로 국가·날짜 state를 찾은 뒤 Step 2와 동일한 패턴으로 `<MomentDrawer />`를 화면 상단에 추가. 국가 state가 없는 화면 구조라면(예: Cut은 촬영 후 정보 입력) 정보 입력 단계 화면에 붙인다.

- [ ] **Step 4: 타입 체크** — Run: `npx tsc --noEmit` / Expected: 오류 0

- [ ] **Step 5: 커밋**

```bash
git add src/components/moments/MomentDrawer.tsx src/screens/NewRecordScreen.tsx src/screens/BlogRecordScreen.tsx src/screens/CutRecordScreen.tsx
git commit -m "feat(moments): 작성 화면 참고용 서랍(MomentDrawer) — 피드·블로그·스트립"
```

---

### Task 8: appState 백업 편승 (사진 제외)

**Files:**
- Modify: `src/services/appState.ts`

- [ ] **Step 1: 파일 구조 파악** — `src/services/appState.ts`를 읽고 백업 페이로드에 설정·기록 부가상태가 어떻게 직렬화/복원되는지 확인(주석에 "설정(스킨·색·알림·배지·통계 등)과 기록 부가상태"라고 명시된 파일).

- [ ] **Step 2: moments 편승** — 기존 페이로드 필드들과 같은 방식으로 `moments` 배열 추가. 직렬화 시 **photoUri는 제거**(스펙: 사진은 로컬 전용):

```ts
// 직렬화 측 (기존 페이로드 구성부에 추가)
moments: moments.map(({ photoUri, ...rest }) => rest),
```
복원 측은 기존 필드들의 hydrate 방식과 동일하게 momentStore로 주입한다. appState가 스토어 밖(모듈 함수)이라 Context를 못 쓰는 구조면, momentStore에 recordStore/settingsStore가 쓰는 것과 같은 명령형 브리지(예: ref 등록)를 추가한다 — 기존 파일에서 다른 스토어가 어떻게 연결됐는지 그대로 따른다.

- [ ] **Step 3: 타입 체크** — Run: `npx tsc --noEmit` / Expected: 오류 0

- [ ] **Step 4: 커밋**

```bash
git add src/services/appState.ts src/store/momentStore.tsx
git commit -m "feat(moments): 서버 백업 채널에 순간 메모 편승(사진 제외)"
```

---

### Task 9: 최종 검증

- [ ] **Step 1: 전체 타입 체크** — Run: `npx tsc --noEmit` / Expected: 오류 0
- [ ] **Step 2: verify 스크립트 재실행** — Run: `npx tsx src/utils/momentMatch.verify.ts` 및 `npx tsx src/utils/badgeRules.verify.ts` / Expected: 둘 다 `✅ 모든 검증 통과` (배지 쪽 회귀 없음 확인)
- [ ] **Step 3: 수동 시나리오 (에뮬레이터 — ANGLE 렌더러 + dev 빌드, 메모리 참조)**
  - 설정 > 알림에 "여행 중 순간 기록 알림" 토글 노출·동작
  - (해외 위치 목킹) 알림 게시 → 탭 → 캡처 시트 → 저장 → 토스트
  - 저장한 순간이 프로필 여행 카드 ✨ → 목록 시트에 표시, 길게 눌러 삭제
  - 피드 작성 화면에서 같은 국가 선택 시 배너 → 서랍 → 확대 보기(액션 버튼 없음 확인)
  - 오프라인(비행기 모드)에서 캡처 저장 동작
- [ ] **Step 4: 실기기 확인 항목(출시 전, EAS 빌드 필요)** — 안드로이드: 고정 알림·재게시·귀국 제거 / iOS: 알림 지운 뒤 앱 재실행 시 재게시, 콜드스타트 딥링크
- [ ] **Step 5: 남은 변경 커밋 + 푸시**

```bash
git status --short   # 계획 외 파일이 섞이지 않았는지 확인
git push origin <현재 브랜치>
```
