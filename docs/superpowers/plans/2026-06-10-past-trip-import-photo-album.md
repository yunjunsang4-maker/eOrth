# 과거 여행 사진 선택 → 원본 복사 → 프로필 앨범 카드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선택한 과거 해외 여행마다 사진을 최대 30장 골라(시간순 위저드) 원본을 앱에 복사 저장하고, 프로필에 여행기록카드(=앨범 사진첩)를 만든다.

**Architecture:** pastTripScan이 여행별 사진 `{id,uri}` 목록을 노출 → 순차 위저드(`ImportPhotoSelectScreen`)에서 ≤30 선택 → `expo-file-system`으로 원본을 `documentDirectory`에 복사 → recordStore에 앨범 record + TripGroup 생성 → ProfileScreen이 tripGroup 파생 카드(`mappedThumbnails`)를 렌더. 순수 경로/필터 로직은 `*.verify.ts`로 TDD.

**Tech Stack:** React Native + Expo, TypeScript, expo-file-system(신규), expo-media-library, recordStore. 테스트: `npx tsx <file>.verify.ts`, `npx tsc --noEmit`.

**WIP 주의:** `TravelImportScreen.tsx`·`ProfileScreen.tsx`·`recordStore.tsx`·`App.tsx`는 사용자가 작업 중인 파일이다. 지정한 영역만 수정하고, 커밋은 해당 Task 파일만 `git add`.

---

## 파일 구조
- `src/utils/pastTripScan.ts` (수정·additive) — `ScannedPhoto.id?`, `ScannedTrip.photos: {id?;uri}[]` 노출.
- `src/utils/importPhotoStore.ts` (신규) — 원본 복사 유틸 + 순수 경로 헬퍼.
- `src/utils/importPhotoStore.verify.ts` (신규) — 순수 헬퍼 검증.
- `src/screens/ImportPhotoSelectScreen.tsx` (신규) — 순차 사진 선택 위저드.
- `src/navigation/AppNavigator.tsx` (수정) — 스크린 등록.
- `src/screens/TravelImportScreen.tsx` (수정) — handleImport → 위저드 네비게이트.
- `src/store/recordStore.tsx` (수정) — `addImportedAlbum` 액션(앨범 record 추가 + id 반환).
- `src/screens/ProfileScreen.tsx` (수정) — `mappedThumbnails`(import된 여행 카드) 렌더.

---

# Phase 1 — 데이터/저장 기반

### Task 1: pastTripScan — 여행별 사진 {id,uri} 노출 (additive)

**Files:**
- Modify: `src/utils/pastTripScan.ts`
- Test: `src/utils/pastTripScan.verify.ts` (기존 ALL PASS 유지 확인만)

- [ ] **Step 1: 타입 + 클러스터링에 photos 추가**

`ScannedPhoto`에 `id?` 추가:
```ts
export interface ScannedPhoto {
  uri: string;
  creationTime: number;
  countryCode: string | null;
  countryName: string;
  countryFlag: string;
  id?: string; // MediaLibrary asset id (원본 복사용). 없으면 uri만 사용
}
```

`ScannedTrip`에 `photos` 추가:
```ts
  photos: { id?: string; uri: string }[]; // 이 여행의 전체 사진(선택/복사용)
```
(`ScannedTrip` 인터페이스 안, `medias` 근처에 한 줄 추가)

`clusterForeignTrips` 내부 클러스터 타입과 채우기를 `{id,uri}` 기반으로 변경:
```ts
  interface Cluster {
    code: string;
    countryName: string;
    countryFlag: string;
    country: string;
    photos: { id?: string; uri: string }[];
    dates: number[];
  }
```
사진 추가/신규 클러스터 생성 시 `photos`에 `{ id: p.id, uri: p.uri }`를 넣는다(기존 `p.uri`만 넣던 자리). 그리고 결과 매핑에서:
```ts
      medias: [c.photos[0].uri],   // 대표 1장(기존: c.photos[0]) — uri로 변경
      photos: c.photos,            // 전체 사진
```
> 나머지 로직(필터·7일·정렬·필드)은 그대로. `medias`는 여전히 string[](첫 사진 uri)이라 verify 통과.

- [ ] **Step 2: verify 그대로 통과 확인**

Run: `npx tsx src/utils/pastTripScan.verify.ts`
Expected: `ALL PASS` (기존 테스트는 uri='a'만 쓰므로 medias[0]='a' 유지)

- [ ] **Step 3: 타입 체크 + 커밋**

Run: `npx tsc --noEmit` → pastTripScan 신규 오류 없음
```bash
git add src/utils/pastTripScan.ts
git commit -m "feat(import): expose per-trip photos {id,uri} from clusterForeignTrips"
```

---

### Task 2: 원본 복사 유틸 (importPhotoStore)

**Files:**
- Create: `src/utils/importPhotoStore.ts`
- Test: `src/utils/importPhotoStore.verify.ts`

먼저 의존성 추가:
- [ ] **Step 0: expo-file-system 설치 (재빌드 필요)**

Run: `npx expo install expo-file-system`
> 네이티브 모듈이므로 이후 dev 클라이언트 **재빌드** 필요(`npx expo run:ios`/`run:android` 또는 EAS). 설치만으로 JS 타입은 사용 가능.

- [ ] **Step 1: 실패 테스트 (순수 경로 헬퍼)**

```ts
// 실행: npx tsx src/utils/importPhotoStore.verify.ts
import { tripDir, tripPhotoPath } from './importPhotoStore';

let failures = 0;
function assert(c: boolean, m: string) { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } }

// 경로 헬퍼는 base를 인자로 받아 순수하게 동작(파일시스템 접근 없음)
{
  const base = 'file:///app/docs/';
  assert(tripDir(base, 'trip-x') === 'file:///app/docs/trips/trip-x/', 'tripDir 경로');
  assert(tripPhotoPath(base, 'trip-x', 0) === 'file:///app/docs/trips/trip-x/0.jpg', '사진 경로 0');
  assert(tripPhotoPath(base, 'trip-x', 12) === 'file:///app/docs/trips/trip-x/12.jpg', '사진 경로 12');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: 실패 확인**

Run: `npx tsx src/utils/importPhotoStore.verify.ts`
Expected: FAIL — `Cannot find module './importPhotoStore'`

- [ ] **Step 3: 구현**

```ts
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

// ── 순수 경로 헬퍼 (테스트 대상) ──
export function tripDir(base: string, tripId: string): string {
  return `${base}trips/${tripId}/`;
}
export function tripPhotoPath(base: string, tripId: string, index: number): string {
  return `${tripDir(base, tripId)}${index}.jpg`;
}

export interface PhotoRef { id?: string; uri: string }

/**
 * 선택 사진 원본을 앱 저장소(documentDirectory)로 복사한다.
 * - id가 있으면 MediaLibrary.getAssetInfoAsync로 localUri(file://)를 얻어 복사(iOS ph:// 대응).
 * - 실패한 장은 건너뛰고 성공한 복사본 URI만 반환.
 */
export async function copyTripOriginals(tripId: string, items: PhotoRef[]): Promise<string[]> {
  const base = FileSystem.documentDirectory;
  if (!base) return [];
  const dir = tripDir(base, tripId);
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // 이미 존재하면 무시
  }

  const out: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      let from = it.uri;
      if (it.id) {
        const info = await MediaLibrary.getAssetInfoAsync(it.id, { shouldDownloadFromNetwork: true });
        from = (info.localUri || info.uri || it.uri) as string;
      }
      const to = tripPhotoPath(base, tripId, out.length);
      await FileSystem.copyAsync({ from, to });
      out.push(to);
    } catch (e) {
      // 이 장은 건너뜀
    }
  }
  return out;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx tsx src/utils/importPhotoStore.verify.ts`
Expected: `ALL PASS`

- [ ] **Step 5: 타입 체크 + 커밋**

Run: `npx tsc --noEmit` → importPhotoStore 신규 오류 없음
```bash
git add src/utils/importPhotoStore.ts src/utils/importPhotoStore.verify.ts package.json package-lock.json
git commit -m "feat(import): original photo copy util (expo-file-system)"
```

---

### Task 3: recordStore — 앨범 record 추가 액션 (id 반환)

**Files:**
- Modify: `src/store/recordStore.tsx`

- [ ] **Step 1: 컨텍스트 타입 + 액션 추가**

`RecordContextType`에 추가:
```ts
  addImportedAlbum: (data: {
    countryName: string; countryFlag: string; country: string;
    date: string; startDate: string; endDate: string;
    title: string; medias: string[];
  }) => string; // 생성된 record id 반환
```

`RecordProvider` 안에 구현(기존 `addRecord` 근처):
```ts
  const addImportedAlbum = (data: {
    countryName: string; countryFlag: string; country: string;
    date: string; startDate: string; endDate: string;
    title: string; medias: string[];
  }): string => {
    const id = `rec-import-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const rec: TravelRecord = {
      id,
      user: { name: '', emoji: '🗺️', handle: '' },
      country: data.country,
      countryName: data.countryName,
      countryFlag: data.countryFlag,
      date: data.date,
      startDate: data.startDate,
      endDate: data.endDate,
      content: data.title,
      likes: 0, comments: 0, liked: false,
      isMyPost: true,
      visibility: 'private',
      timestamp: Date.now(),
      viewType: 'album',
      medias: data.medias,
    };
    setRecords((prev) => [rec, ...prev]);
    return id;
  };
```

Provider value 객체에 `addImportedAlbum` 추가.

- [ ] **Step 2: 타입 체크 + 커밋**

Run: `npx tsc --noEmit` → recordStore 신규 오류 없음
```bash
git add src/store/recordStore.tsx
git commit -m "feat(import): addImportedAlbum action returning new record id"
```

---

# Phase 2 — 위저드 + 네비게이션

### Task 4: ImportPhotoSelectScreen (순차 사진 선택 위저드)

**Files:**
- Create: `src/screens/ImportPhotoSelectScreen.tsx`

route params: `{ trips: ImportTrip[] }` (시간순 정렬). 완료 시 직접 저장하고 Main으로 reset.

- [ ] **Step 1: 컴포넌트 작성**

```tsx
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Image,
  Dimensions, ActivityIndicator, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRecords } from '../store/recordStore';
import { copyTripOriginals, type PhotoRef } from '../utils/importPhotoStore';

export const MAX_PHOTOS_PER_TRIP = 30; // 프리미엄 seam: 나중에 이 한도만 상향

export interface ImportTrip {
  id: string;
  country: string; countryName: string; countryFlag: string;
  title: string; date: string; startDate: string; endDate: string;
  photos: PhotoRef[];
}

const { width } = Dimensions.get('window');
const COL = 3;
const CELL = Math.floor((width - 16 * 2 - 8 * (COL - 1)) / COL);

export default function ImportPhotoSelectScreen({ navigation, route }: any) {
  const { trips } = route.params as { trips: ImportTrip[] };
  const { addImportedAlbum, addTripGroup } = useRecords();

  const [index, setIndex] = useState(0);
  // 여행별 선택된 사진 uri 집합
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  const trip = trips[index];
  const sel = selected[trip.id] ?? [];
  const isLast = index === trips.length - 1;

  const toggle = (uri: string) => {
    setSelected((prev) => {
      const cur = prev[trip.id] ?? [];
      if (cur.includes(uri)) return { ...prev, [trip.id]: cur.filter((u) => u !== uri) };
      if (cur.length >= MAX_PHOTOS_PER_TRIP) {
        Alert.alert('알림', `여행당 최대 ${MAX_PHOTOS_PER_TRIP}장까지 선택할 수 있어요.`);
        return prev;
      }
      return { ...prev, [trip.id]: [...cur, uri] };
    });
  };

  const next = () => {
    if (!isLast) { setIndex((i) => i + 1); return; }
    save();
  };

  const save = async () => {
    setSaving(true);
    try {
      for (const t of trips) {
        const uris = selected[t.id] ?? [];
        if (uris.length === 0) continue; // 선택 0장 → 카드 생성 안 함
        const items: PhotoRef[] = t.photos.filter((p) => uris.includes(p.uri));
        const copied = await copyTripOriginals(t.id, items);
        if (copied.length === 0) continue;
        const recId = addImportedAlbum({
          country: t.country, countryName: t.countryName, countryFlag: t.countryFlag,
          date: t.date, startDate: t.startDate, endDate: t.endDate,
          title: t.title, medias: copied,
        });
        addTripGroup({ title: `${t.countryFlag} ${t.title}`, records: [recId], coverRecordId: recId });
      }
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (e) {
      setSaving(false);
      Alert.alert('저장 실패', '사진을 가져오는 중 문제가 발생했어요.');
    }
  };

  if (saving) {
    return (
      <LinearGradient colors={['#0A0118', '#100620']} style={st.center}>
        <ActivityIndicator color="#7B61FF" size="large" />
        <Text style={st.savingText}>여행 사진첩을 만들고 있어요…</Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0A0118', '#100620']} style={st.container}>
      <View style={st.header}>
        <Text style={st.step}>{index + 1} / {trips.length}</Text>
        <Text style={st.title}>{trip.countryFlag} {trip.title}</Text>
        <Text style={st.sub}>가져올 사진을 선택하세요 (최대 {MAX_PHOTOS_PER_TRIP}장)</Text>
        <Text style={st.counter}>{sel.length} / {MAX_PHOTOS_PER_TRIP}</Text>
      </View>

      <FlatList
        data={trip.photos}
        keyExtractor={(p, i) => p.uri + i}
        numColumns={COL}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        columnWrapperStyle={{ gap: 8 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => {
          const on = sel.includes(item.uri);
          return (
            <TouchableOpacity activeOpacity={0.8} onPress={() => toggle(item.uri)} style={{ width: CELL, height: CELL }}>
              <Image source={{ uri: item.uri }} style={st.cell} />
              <View style={[st.check, on && st.checkOn]}>{on && <Text style={st.checkTxt}>✓</Text>}</View>
            </TouchableOpacity>
          );
        }}
      />

      <View style={st.bottom}>
        <TouchableOpacity style={st.nextBtn} onPress={next} activeOpacity={0.85}>
          <LinearGradient colors={['#7B61FF', '#5A42DD']} style={st.nextGrad}>
            <Text style={st.nextTxt}>{isLast ? '완료' : '다음'}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  savingText: { color: '#FFFFFF', fontSize: 14 },
  header: { paddingTop: 70, paddingHorizontal: 16, paddingBottom: 8 },
  step: { color: '#7B61FF', fontSize: 12, fontWeight: '700', letterSpacing: 2, marginBottom: 6 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  sub: { color: '#A1A1B0', fontSize: 13 },
  counter: { color: '#BF85FC', fontSize: 13, fontWeight: '700', marginTop: 6 },
  cell: { width: '100%', height: '100%', borderRadius: 8, backgroundColor: '#2A2735' },
  check: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  checkOn: { backgroundColor: '#7B61FF', borderColor: '#7B61FF' },
  checkTxt: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 40, backgroundColor: 'rgba(10,1,24,0.95)' },
  nextBtn: { borderRadius: 999, overflow: 'hidden' },
  nextGrad: { paddingVertical: 18, alignItems: 'center' },
  nextTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
```

- [ ] **Step 2: 타입 체크 + 커밋**

Run: `npx tsc --noEmit` → 신규 오류 없음
```bash
git add src/screens/ImportPhotoSelectScreen.tsx
git commit -m "feat(import): photo-select wizard screen (<=30 per trip, sequential)"
```

---

### Task 5: 네비게이션 등록 + TravelImport 연결

**Files:**
- Modify: `src/navigation/AppNavigator.tsx`
- Modify: `src/screens/TravelImportScreen.tsx`

- [ ] **Step 1: AppNavigator 등록**

상단 import에 추가:
```ts
import ImportPhotoSelectScreen from '../screens/ImportPhotoSelectScreen';
```
`TravelImport` Stack.Screen 줄 아래에 추가:
```tsx
        <Stack.Screen name="ImportPhotoSelect" component={ImportPhotoSelectScreen} />
```

- [ ] **Step 2: TravelImport.handleImport → 위저드로 네비게이트(시간순)**

`handleImport`를 아래로 교체(직접 addRecord 제거, 위저드로 이동):
```tsx
  const handleImport = () => {
    const chosen = scannedTrips
      .filter((t) => selectedIds.includes(t.id))
      .sort((a, b) => new Date(a.startDate.replace(/\./g, '-')).getTime() - new Date(b.startDate.replace(/\./g, '-')).getTime());
    if (chosen.length === 0) return;
    const trips = chosen.map((t) => ({
      id: t.id,
      country: t.country, countryName: t.countryName, countryFlag: t.countryFlag,
      title: t.title, date: t.date, startDate: t.startDate, endDate: t.endDate,
      photos: t.photos, // {id?,uri}[]
    }));
    navigation.navigate('ImportPhotoSelect', { trips });
  };
```
> `useRecords()`의 `addRecord` import가 이제 미사용이면 제거. `isImporting` 상태/관련 UI가 더 이상 안 쓰이면 그대로 둬도 무방(컴파일 영향 없음).

- [ ] **Step 3: 타입 체크 + 커밋(파일별)**

Run: `npx tsc --noEmit`
```bash
git add src/navigation/AppNavigator.tsx && git commit -m "feat(import): register ImportPhotoSelect screen"
git add src/screens/TravelImportScreen.tsx && git commit -m "feat(import): handleImport navigates to photo-select wizard (chronological)"
```

---

# Phase 3 — 프로필 카드 표시

### Task 6: ProfileScreen — import된 여행(tripGroup) 카드 렌더

**Files:**
- Modify: `src/screens/ProfileScreen.tsx`

ProfileScreen은 이미 `mappedThumbnails`(tripGroups 파생)를 계산하지만 렌더에는 하드코딩 `trips`만 쓴다. import로 생긴 여행이 보이도록 **mappedThumbnails를 렌더 목록 앞에 병합**한다.

- [ ] **Step 1: 렌더 목록 병합**

`trips`를 그대로 쓰던 렌더 직전에, 표시용 목록을 만든다. `mappedThumbnails`(line ~1504 정의) 정의 아래에 추가:
```tsx
  // import/기록 기반 여행 카드(mappedThumbnails)를 하드코딩 trips 앞에 병합해 표시
  const displayTrips = useMemo(
    () => [...mappedThumbnails, ...trips],
    [mappedThumbnails, trips]
  );
```
그리고 렌더에서 `trips.length` / `trips[0]` / `trips.slice(1)` / `trips.map(...)`로 카드를 그리는 부분을 **`displayTrips`** 로 바꾼다(헤더 카운트 `{trips.length}개의 여행` → `{displayTrips.length}개의 여행`, 히어로 `trips[0]` → `displayTrips[0]`, 그리드 `trips.slice(1)` → `displayTrips.slice(1)`).
> 실제 변수명/렌더 위치는 현재 파일 구조에 맞춰 적용. 순서 조정/그룹 편집 등 기존 기능은 `trips`(하드코딩)에만 동작해도 무방(이번 범위는 표시).

- [ ] **Step 2: 카드 탭 → 사진첩(앨범) 동작 확인**

`openTripDetail(displayTrips[i])`로 탭 시 `TripDetail`에 전달되는 카드가 `records:[{id, viewType:'album'}]`를 포함 → 기존 앨범 렌더 경로로 사진첩이 보이는지 확인. (TripDetail이 album record의 `medias`를 그리드로 표시)

- [ ] **Step 3: 타입 체크 + 커밋**

Run: `npx tsc --noEmit` → ProfileScreen 신규 오류 없음
```bash
git add src/screens/ProfileScreen.tsx
git commit -m "feat(import): render trip-group derived cards (imported trips) in profile"
```

---

### Task 7: 통합 점검 (수동)

**Files:** 없음

- [ ] **Step 1: 정적 검증**

Run:
```bash
npx tsx src/utils/pastTripScan.verify.ts
npx tsx src/utils/importPhotoStore.verify.ts
npx tsc --noEmit
```
Expected: 두 verify `ALL PASS`, tsc 신규 오류 없음(archive 제외).

- [ ] **Step 2: 앱 시나리오** (expo-file-system 추가 → **dev 재빌드 후**)

Run: 재빌드된 dev 클라이언트로 실행
확인:
- 과거여행 결과에서 여행 1개 선택 → 불러오기 → 위저드 1단계 → ≤30 선택 → 완료 → 프로필에 카드.
- 여러 개 선택 → **시간순**으로 위저드 진행 → 시간순 카드 생성.
- 30장 초과 선택 차단(알림).
- 카드 탭 → 사진첩(앨범 그리드)로 선택 사진 표시.
- **완료 후 갤러리에서 원본 삭제해도** 앱 사진첩 사진 유지(복사 확인).

---

## 자체 검토 메모
- **스펙 커버리지:** 원본복사(Task2 expo-file-system), 한도 seam(Task4 MAX_PHOTOS_PER_TRIP), 순차 위저드(Task4), 시간순(Task5 정렬), 앨범 record(Task3), TripGroup+프로필 카드(Task4 save, Task6), photos 노출(Task1). 매핑됨.
- **타입 일관성:** `PhotoRef{id?,uri}`(Task2)=`ScannedTrip.photos`(Task1)=`ImportTrip.photos`(Task4). `addImportedAlbum`/`addTripGroup` 시그니처 일치.
- **WIP 보호:** Task별 해당 파일만 커밋. ProfileScreen/recordStore/TravelImport/App는 사용자 WIP 위에 수정.
- **리스크:** ① expo-file-system은 재빌드 전엔 실기기 복사 테스트 불가(정적 검증만). ② ProfileScreen 렌더 병합은 파일이 WIP·대형이라 변수명/위치를 현재 구조에 맞춰 적용 필요.
- **플레이스홀더 없음:** 모든 코드 스텝에 실제 코드 포함.
