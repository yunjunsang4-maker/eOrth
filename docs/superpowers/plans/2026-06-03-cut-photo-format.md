# 네컷/컷사진 기록 형식 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앨범을 대체하는 "네컷/컷사진" 기록 형식 추가 — 사용자가 레이아웃 프레임에 사진을 채워 합성 네컷 사진을 만들고 기록으로 저장.

**Architecture:** 정적 프레임 카탈로그 + 재사용 캔버스 컴포넌트(CutPhotoCanvas)를 코어로, 생성 화면(CutRecordScreen)이 캔버스를 편집·캡처한다. 저장은 레이아웃/사진/프레임 데이터 + view-shot 합성 미리보기 이미지 둘 다. 기존 기록 형식(feed/blog/snap) 패턴을 그대로 따른다.

**Tech Stack:** React Native (Expo SDK 54, 디벨롭 빌드), TypeScript, expo-image-picker, **react-native-view-shot(신규)**, 기존 recordStore(Context).

**검증 방식(이 레포 기준):** 자동 테스트 프레임워크 없음 → 각 태스크는 `npx tsc --noEmit`(새 오류 0) + 에뮬레이터 시각 확인 + 커밋으로 검증한다. (`cd "C:\Users\2023user\OneDrive\바탕 화면\eOrth"`)

---

## File Structure

- **Create** `src/constants/cutFrames.ts` — 타입(`CutLayout`, `CutFrame`), 레이아웃 사양(슬롯 비율/캔버스 비율), 프레임 카탈로그(기본+테마).
- **Create** `src/components/CutPhotoCanvas.tsx` — cutPhoto 1건을 렌더(프레임 배경+슬롯에 사진). 편집/표시 공용. ref로 view-shot 캡처 지원.
- **Create** `src/screens/CutRecordScreen.tsx` — 프레임 선택 → 사진 채우기 → 캡처 → 저장.
- **Modify** `src/store/recordStore.tsx` — `RecordViewType`에 `'cut'`, 기록에 `cutPhoto` 필드.
- **Modify** `src/screens/MainScreen.tsx` — FAB_FORMATS·포맷 그리드에 네컷, SCREEN_MAP 2곳에 `cut`, `CutIcon` 추가.
- **Modify** `src/navigation/AppNavigator.tsx` — `CutRecord` 라우트 + import.
- **Modify** `src/screens/SocialScreen.tsx`, `src/screens/PostDetailScreen.tsx` — `viewType==='cut'` → previewUri 이미지 렌더.
- **Modify** `src/screens/ProfileScreen.tsx`, `src/screens/FriendProfileScreen.tsx` — 여행카드 네컷 뱃지(`CutBadgeIcon`).
- **Modify** `package.json`/`package-lock.json` — react-native-view-shot (expo install).

각 커밋 전: `npx tsc --noEmit 2>&1 | Select-String "<수정파일>"` 로 새 오류 0 확인. 커밋은 master 직접 금지 — 작업 시작 시 브랜치 생성(`git checkout -b feat/cut-photo-format`).

---

## Task 0: 의존성 설치 + 브랜치

**Files:** Modify `package.json`, `package-lock.json`

- [ ] **Step 1:** 브랜치 생성
```
git checkout -b feat/cut-photo-format
```
- [ ] **Step 2:** view-shot 설치
```
npx expo install react-native-view-shot
```
- [ ] **Step 3:** 설치 확인
```
node -e "console.log(require('./package.json').dependencies['react-native-view-shot'])"
```
Expected: 버전 문자열 출력(undefined 아님)
- [ ] **Step 4:** Commit
```
git add package.json package-lock.json && git commit -m "chore: add react-native-view-shot for cut-photo capture"
```
> 데이터 변경 아님 → 핫리로드 불필요. 단 네이티브 모듈이라 **다음 빌드/재시작 시 반영**. 이미 설치된 디벨롭 빌드에 react-native-view-shot 네이티브가 없으면 캡처 동작 안 함 → Task 3 검증 시 동작 안 하면 `eas build --profile development --platform android` 재빌드 필요(메모리 [[eorth-emulator-launch]] 참고).

---

## Task 1: 데이터 모델 (recordStore)

**Files:** Modify `src/store/recordStore.tsx` (RecordViewType ~9행, 기록 인터페이스 필드 ~50행대)

- [ ] **Step 1:** `RecordViewType`에 `'cut'` 추가
```ts
export type RecordViewType =
  | 'feed'        // 피드 (기본값)
  | 'blog'        // 블로그
  | 'album'       // 앨범 (보관, 휴면)
  | 'snap'        // 스냅 (BeReal 스타일)
  | 'cut';        // 네컷/컷사진
```
- [ ] **Step 2:** 기록 인터페이스에 `cutPhoto` 옵셔널 필드 추가 (snap 필드 블록 근처)
```ts
  // 네컷 필드 (viewType='cut'일 때)
  cutPhoto?: {
    layout: import('../constants/cutFrames').CutLayout;
    frameId: string;
    photos: string[];      // 슬롯 순서대로 사진 URI
    previewUri: string;    // 합성 미리보기 이미지
  };
```
- [ ] **Step 3:** 검증
```
npx tsc --noEmit 2>&1 | Select-String "recordStore"
```
Expected: recordStore 관련 새 오류 0
- [ ] **Step 4:** Commit
```
git add src/store/recordStore.tsx && git commit -m "feat(record): add 'cut' viewType and cutPhoto field"
```

---

## Task 2: 프레임 카탈로그 + 레이아웃 사양

**Files:** Create `src/constants/cutFrames.ts`

- [ ] **Step 1:** 타입 + 레이아웃 슬롯/비율 + 카탈로그 작성. 슬롯 좌표는 캔버스 대비 비율(0~1). gap은 슬롯 좌표에 미리 반영(여백 포함).

```ts
export type CutLayout = 'two-h' | 'two-v' | 'three-v' | 'four' | 'nine' | 'film';

export interface CutSlot { x: number; y: number; w: number; h: number } // 0~1 비율

export interface CutLayoutSpec {
  label: string;
  aspect: number;     // width / height
  slots: CutSlot[];
}

// gap 비율(슬롯 사이/바깥 여백) 적용한 격자 생성 유틸
function grid(cols: number, rows: number, gap = 0.03): CutSlot[] {
  const out: CutSlot[] = [];
  const cw = (1 - gap * (cols + 1)) / cols;
  const ch = (1 - gap * (rows + 1)) / rows;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out.push({ x: gap + c * (cw + gap), y: gap + r * (ch + gap), w: cw, h: ch });
  return out;
}

export const CUT_LAYOUTS: Record<CutLayout, CutLayoutSpec> = {
  'two-h':   { label: '투컷 가로', aspect: 4 / 3,  slots: grid(2, 1) },
  'two-v':   { label: '투컷 세로', aspect: 3 / 4,  slots: grid(1, 2) },
  'three-v': { label: '3컷 세로',  aspect: 9 / 16, slots: grid(1, 3) },
  'four':    { label: '4컷',       aspect: 1,      slots: grid(2, 2) },
  'nine':    { label: '9컷',       aspect: 1,      slots: grid(3, 3) },
  'film':    { label: '필름',      aspect: 1 / 3,  slots: grid(1, 4, 0.04) },
};

export const cutSlotCount = (l: CutLayout) => CUT_LAYOUTS[l].slots.length;

export type CutBg =
  | { type: 'color'; value: string }
  | { type: 'image'; source: any };

export interface CutFrame {
  id: string;
  name: string;
  category: '기본' | '테마';
  layout: CutLayout;
  background: CutBg;
  border?: { color: string; width: number; radius: number };
}

// 기본 프레임: 레이아웃마다 흰/검 2종
const BASIC: CutFrame[] = (Object.keys(CUT_LAYOUTS) as CutLayout[]).flatMap((l) => ([
  { id: `basic-white-${l}`, name: `${CUT_LAYOUTS[l].label} · 화이트`, category: '기본', layout: l,
    background: { type: 'color', value: '#FFFFFF' }, border: { color: '#FFFFFF', width: 0, radius: 6 } },
  { id: `basic-black-${l}`, name: `${CUT_LAYOUTS[l].label} · 블랙`, category: '기본', layout: l,
    background: { type: 'color', value: '#111114' }, border: { color: '#111114', width: 0, radius: 6 } },
]));

// 테마 프레임: 초기 소수 (색 기반). 배경 이미지 테마는 assets 추가 후 확장.
const THEME: CutFrame[] = [
  { id: 'theme-neon-four', name: '네온 퍼플', category: '테마', layout: 'four',
    background: { type: 'color', value: '#1A0A2E' }, border: { color: '#BF85FC', width: 2, radius: 10 } },
  { id: 'theme-film-mono', name: '모노 필름', category: '테마', layout: 'film',
    background: { type: 'color', value: '#0A0A0F' }, border: { color: '#2E2E3B', width: 1, radius: 4 } },
  { id: 'theme-sunset-two-v', name: '선셋', category: '테마', layout: 'two-v',
    background: { type: 'color', value: '#2E0A1A' }, border: { color: '#FF6B9D', width: 2, radius: 12 } },
];

export const CUT_FRAMES: CutFrame[] = [...BASIC, ...THEME];
export const getCutFrame = (id: string) => CUT_FRAMES.find(f => f.id === id);
```
- [ ] **Step 2:** 검증
```
npx tsc --noEmit 2>&1 | Select-String "cutFrames"
```
Expected: 새 오류 0
- [ ] **Step 3:** Commit
```
git add src/constants/cutFrames.ts && git commit -m "feat(cut): add frame catalog and layout specs"
```

---

## Task 3: CutPhotoCanvas 컴포넌트

**Files:** Create `src/components/CutPhotoCanvas.tsx`

cutPhoto 1건(또는 편집 중 상태)을 렌더. 프레임 배경 위에 레이아웃 슬롯대로 사진을 cover로 채움. 빈 슬롯은 placeholder(+). `onSlotPress`로 편집 화면이 슬롯 탭을 받음. `forwardRef`로 부모(view-shot)가 캡처.

- [ ] **Step 1:** 컴포넌트 작성
```tsx
import React, { forwardRef } from 'react';
import { View, Image, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CUT_LAYOUTS, getCutFrame, CutFrame } from '../constants/cutFrames';

interface Props {
  frameId: string;
  photos: (string | null)[];   // 슬롯별 사진 URI (null=빈)
  width: number;               // 캔버스 가로 px (높이는 aspect로 계산)
  onSlotPress?: (index: number) => void;
  capture?: boolean;           // true면 placeholder/터치 숨김(캡처용)
}

const CutPhotoCanvas = forwardRef<View, Props>(({ frameId, photos, width, onSlotPress, capture }, ref) => {
  const frame: CutFrame | undefined = getCutFrame(frameId);
  if (!frame) return null;
  const spec = CUT_LAYOUTS[frame.layout];
  const height = width / spec.aspect;
  const bg = frame.background.type === 'color' ? { backgroundColor: frame.background.value } : null;

  return (
    <View ref={ref} collapsable={false}
      style={[{ width, height, borderRadius: frame.border?.radius ?? 0, overflow: 'hidden',
                borderWidth: frame.border?.width ?? 0, borderColor: frame.border?.color }, bg]}>
      {frame.background.type === 'image' && (
        <Image source={frame.background.source} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}
      {spec.slots.map((s, i) => {
        const uri = photos[i] ?? null;
        const slotStyle = {
          position: 'absolute' as const,
          left: s.x * width, top: s.y * height, width: s.w * width, height: s.h * height,
          borderRadius: 4, overflow: 'hidden' as const, backgroundColor: 'rgba(0,0,0,0.18)',
        };
        const inner = uri
          ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          : (!capture ? <View style={st.ph}><Text style={st.phТxt}>＋</Text></View> : null);
        return onSlotPress && !capture
          ? <TouchableOpacity key={i} style={slotStyle} activeOpacity={0.8} onPress={() => onSlotPress(i)}>{inner}</TouchableOpacity>
          : <View key={i} style={slotStyle}>{inner}</View>;
      })}
    </View>
  );
});
export default CutPhotoCanvas;

const st = StyleSheet.create({
  ph: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  phТxt: { fontSize: 28, color: 'rgba(255,255,255,0.5)' },
});
```
> 주의: 위 `phТxt`의 키릴 문자 오타 금지 — 실제 작성 시 `phTxt`로. (플랜 렌더링 이슈 회피용 표기)
- [ ] **Step 2:** 검증 — tsc + 임시로 CutRecordScreen 없이 확인 어려우므로 Task 4에서 화면에 올려 시각 확인. 여기선 tsc만.
```
npx tsc --noEmit 2>&1 | Select-String "CutPhotoCanvas"
```
Expected: 새 오류 0
- [ ] **Step 3:** Commit
```
git add src/components/CutPhotoCanvas.tsx && git commit -m "feat(cut): add CutPhotoCanvas renderer (slots + frame, view-shot ref)"
```

---

## Task 4: CutRecordScreen (생성 화면)

**Files:** Create `src/screens/CutRecordScreen.tsx`

흐름: ① 프레임 선택(탭 기본/테마 + 카탈로그 그리드) → ② 캔버스에서 슬롯 탭 → expo-image-picker 단일 선택 → 해당 슬롯 채움 → ③ "저장" → view-shot 캡처 → useRecords로 저장 후 navigation.goBack.

- [ ] **Step 1:** 화면 작성 (핵심 골격 — 스타일/헤더는 BlogRecordScreen 패턴 따름)
```tsx
import React, { useState, useRef, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Dimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { captureRef } from 'react-native-view-shot';
import CutPhotoCanvas from '../components/CutPhotoCanvas';
import { CUT_FRAMES, CUT_LAYOUTS, cutSlotCount, getCutFrame } from '../constants/cutFrames';
import { useRecords } from '../store/recordStore';

const SCREEN_W = Dimensions.get('window').width;

export default function CutRecordScreen({ navigation, route }: { navigation: any; route: any }) {
  const { addRecord } = useRecords();                      // 실제 store API 확인 후 사용 (Step 0)
  const selectedCountry = route?.params?.selectedCountry ?? null;
  const [tab, setTab] = useState<'기본' | '테마'>('기본');
  const [frameId, setFrameId] = useState<string>(CUT_FRAMES.find(f => f.category === '기본')!.id);
  const [photos, setPhotos] = useState<(string | null)[]>([]);
  const canvasRef = useRef<View>(null);

  const frame = getCutFrame(frameId)!;
  const slotN = cutSlotCount(frame.layout);
  const frames = useMemo(() => CUT_FRAMES.filter(f => f.category === tab), [tab]);

  const pickFrame = (id: string) => {
    setFrameId(id);
    setPhotos(Array(cutSlotCount(getCutFrame(id)!.layout)).fill(null));
  };
  const fillSlot = async (i: number) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('권한 필요', '갤러리 접근 권한이 필요해요.'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (!r.canceled && r.assets[0]) setPhotos(p => { const n = [...p]; n[i] = r.assets[0].uri; return n; });
  };
  const save = async () => {
    if (photos.filter(Boolean).length < slotN) { Alert.alert('알림', '모든 칸에 사진을 넣어주세요.'); return; }
    let previewUri = '';
    try { previewUri = await captureRef(canvasRef, { format: 'jpg', quality: 0.9 }); }
    catch (e) { Alert.alert('오류', '미리보기 생성에 실패했어요.'); return; }
    addRecord({ /* 공통 필드: country 등 selectedCountry 매핑 */
      viewType: 'cut',
      cutPhoto: { layout: frame.layout, frameId, photos: photos as string[], previewUri },
    } as any);
    navigation.goBack();
  };

  return (
    <View style={st.root}>
      {/* 헤더(취소/네컷/저장) — BlogRecordScreen 헤더 스타일 재사용 */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={st.cancel}>취소</Text></TouchableOpacity>
        <Text style={st.title}>네컷</Text>
        <TouchableOpacity onPress={save}><Text style={st.save}>저장</Text></TouchableOpacity>
      </View>
      {/* 캔버스 */}
      <View style={st.canvasWrap}>
        <CutPhotoCanvas ref={canvasRef} frameId={frameId} photos={photos} width={SCREEN_W * 0.7} onSlotPress={fillSlot} />
      </View>
      {/* 탭 */}
      <View style={st.tabs}>
        {(['기본','테마'] as const).map(t => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={[st.tab, tab===t && st.tabOn]}>
            <Text style={[st.tabTxt, tab===t && st.tabTxtOn]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {/* 프레임 카탈로그(가로 스크롤 미리보기) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.cat}>
        {frames.map(f => (
          <TouchableOpacity key={f.id} onPress={() => pickFrame(f.id)} style={[st.catItem, frameId===f.id && st.catItemOn]}>
            <CutPhotoCanvas frameId={f.id} photos={Array(cutSlotCount(f.layout)).fill(null)} width={84} capture />
            <Text style={st.catLabel} numberOfLines={1}>{f.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
// st: StyleSheet — 디자인 토큰(배경 #0A0A0F, 보라 #BF85FC 등) 사용. (구현 시 작성)
```
> **Step 0 선행 확인:** `recordStore`의 실제 기록 추가 API 이름/시그니처를 grep으로 확인하고 `addRecord` 자리에 맞춘다(`useRecords` export 확인). 공통 필드(country/date 등) 매핑도 BlogRecordScreen의 저장 호출을 참고해 맞춘다.
- [ ] **Step 1b:** st(StyleSheet) 디자인 토큰으로 작성 (배경/헤더/탭/카탈로그).
- [ ] **Step 2:** 검증 tsc
```
npx tsc --noEmit 2>&1 | Select-String "CutRecordScreen"
```
Expected: 새 오류 0
- [ ] **Step 3:** (Task 5 후) 에뮬레이터에서 진입→프레임 선택→사진 채움→저장 시각 확인.
- [ ] **Step 4:** Commit
```
git add src/screens/CutRecordScreen.tsx && git commit -m "feat(cut): add CutRecordScreen (frame select, fill slots, capture, save)"
```

---

## Task 5: 진입점/네비 연결 (앨범 자리 대체)

**Files:** Modify `src/screens/MainScreen.tsx`, `src/navigation/AppNavigator.tsx`

- [ ] **Step 1:** MainScreen에 `CutIcon` 추가 (기존 View 기반 아이콘 패턴, FAB_SZ 사용). 4칸 격자 미니 아이콘.
```tsx
const CutIcon = () => (
  <View style={{ width: FAB_SZ, height: FAB_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 18, height: 18, flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
      {[0,1,2,3].map(i => <View key={i} style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: FAB_C }} />)}
    </View>
  </View>
);
```
- [ ] **Step 2:** `FAB_FORMATS`에 네컷 추가
```tsx
  const FAB_FORMATS = [
    { type: 'feed',  icon: <FeedIcon />,  name: '피드' },
    { type: 'blog',  icon: <BlogIcon />,  name: '블로그' },
    { type: 'cut',   icon: <CutIcon />,   name: '네컷' },
  ];
```
- [ ] **Step 3:** 포맷 모달 그리드(같은 배열 리터럴)에도 네컷 추가 (`{ type: 'cut', icon: <CutIcon />, name: '네컷' }`).
- [ ] **Step 4:** SCREEN_MAP 2곳에 `cut: 'CutRecord',` 추가 (handleFormatSelect 및 FAB 버튼 onPress).
- [ ] **Step 5:** AppNavigator에 import + 라우트
```tsx
import CutRecordScreen from '../screens/CutRecordScreen';
// ...
<Stack.Screen name="CutRecord" component={CutRecordScreen}
  options={{ presentation: 'modal', gestureEnabled: false }} />
```
- [ ] **Step 6:** 검증 tsc(MainScreen/AppNavigator 새 오류 0) + 에뮬레이터: + → 네컷 보임 → 진입.
- [ ] **Step 7:** Commit
```
git add src/screens/MainScreen.tsx src/navigation/AppNavigator.tsx && git commit -m "feat(cut): wire CutRecord into FAB formats and navigation"
```

---

## Task 6: 표시(소셜/상세)에서 cut 렌더

**Files:** Modify `src/screens/SocialScreen.tsx`, `src/screens/PostDetailScreen.tsx`

- [ ] **Step 1:** SocialScreen 타임라인 렌더 분기(`if (vt === 'album')` 인근)에 `cut` 분기 추가 — `record.cutPhoto.previewUri`를 `<Image>`로 카드 렌더(종횡비는 layout aspect). 없으면 스킵.
- [ ] **Step 2:** PostDetailScreen에 `viewType==='cut'` 시 previewUri 전체 이미지 렌더 분기 추가.
- [ ] **Step 3:** 검증 tsc + (시드에 cut 샘플 1건 임시 추가해) 시각 확인 후 임시 시드 제거 또는 유지.
- [ ] **Step 4:** Commit
```
git add src/screens/SocialScreen.tsx src/screens/PostDetailScreen.tsx && git commit -m "feat(cut): render cut posts via preview image"
```

---

## Task 7: 프로필 여행카드 네컷 뱃지

**Files:** Modify `src/screens/ProfileScreen.tsx`, `src/screens/FriendProfileScreen.tsx`

- [ ] **Step 1:** ProfileScreen `VIEW_TYPE_BADGE`/`VIEW_TYPE_NAMES`에 `cut` 추가 + `CutBadgeIcon`(BADGE_SZ 4칸 격자).
- [ ] **Step 2:** FriendProfileScreen도 동일하게 cut 뱃지 매핑(있다면).
- [ ] **Step 3:** 검증 tsc + 에뮬레이터 시각 확인.
- [ ] **Step 4:** Commit
```
git add src/screens/ProfileScreen.tsx src/screens/FriendProfileScreen.tsx && git commit -m "feat(cut): add cut badge to trip cards"
```

---

## Task 8: 통합 검증

- [ ] **Step 1:** 앱 재시작(네이티브 view-shot 반영 위해, 필요 시 dev 빌드 재빌드).
- [ ] **Step 2:** 전 흐름: + → 네컷 → 프레임 선택(기본/테마) → 6개 레이아웃 각각 슬롯 채움 → 저장 → 소셜/프로필에 네컷 표시 확인.
- [ ] **Step 3:** `npx tsc --noEmit` 새 오류 0 최종 확인.
- [ ] **Step 4:** finishing-a-development-branch 스킬로 master 병합/PR 결정.

---

## Self-Review (스펙 대비)

- 데이터+미리보기 둘 다 → Task 1(cutPhoto.previewUri) ✓
- 기본+테마 프레임 → Task 2(BASIC/THEME 카탈로그) ✓
- 6개 레이아웃(2H/2V/3V/4/9/film) → Task 2(CUT_LAYOUTS) ✓
- 갤러리 사진 채우기 → Task 4(fillSlot) ✓
- view-shot 캡처 → Task 0 설치 + Task 4(captureRef) ✓
- 앨범 자리 대체(FAB/네비/표시) → Task 5·6·7 ✓
- 카메라/슬롯 줌 편집/커스텀 프레임 → 비범위(스펙대로 제외) ✓
- 타입 일관성: `CutLayout`/`cutSlotCount`/`getCutFrame`/`CUT_FRAMES` 전 태스크 동일 시그니처 사용 ✓

> 미확정 1건: `recordStore`의 기록 추가 API 정확한 이름(addRecord 가정). Task 4 Step 0에서 grep으로 확정 후 맞춘다.
