# 피드 기록 한 화면 통합 + 사진별 글 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 피드 작성 3단계 마법사를 한 화면 스크롤(사진 페이저+사진별 글 → 국가 → 여행 정보)로 통합하고, 글 구조를 사진별 글로 전환하며 PostDetail 캐러셀에 사진별 글을 표시한다.

**Architecture:** NewRecordScreen(2,773줄)의 step 분기 렌더를 섹션 나열로 리레이아웃한다 — state·저장 로직·모달은 최대 재사용. 사진별 글은 `photoTexts?: string[]`(medias와 index 짝 병렬 배열)로 저장하고, 사진 조작 3개 함수(추가/삭제/재정렬)에서 반드시 함께 조작한다. 하위 호환은 저장 시 대표 사진 글을 `memo`에 복사하는 것으로 해결(피드 미리보기·검색·백업 무수정). PostDetail은 기존 `SlideImageViewerDetail`(pagingEnabled 캐러셀, activeIdx 보유)에 captions prop만 추가한다.

**Tech Stack:** React Native (Expo SDK 54), TypeScript. 새 라이브러리 없음.

**스펙:** `docs/superpowers/specs/2026-07-19-feed-onescreen-design.md`

**검증 방식(레포 컨벤션):** jest 없음 — `npx tsc --noEmit` + 수동 시나리오. 순수 로직이 생기면 verify 스크립트(npx tsx).

**커밋 규칙:** 파일 단위 스테이징(작업 트리 WIP 주의).

**스펙 보정 (계획 확정 사항):**
- 스펙 ①의 "기존 내용 필수 규칙 폐지"는 실제 코드와 다름 — 기존 step 3 필수값은 내용이 아니라 **동행자 + (국가별) 별점**이다(NewRecordScreen canGoNext 라인 1193-1205). 이 둘은 기존 정책 그대로 **유지**한다. 사진별 글은 스펙대로 선택 사항.
- 사진 재정렬(드래그)·사진별 비공개(mediaPrivacy) 기능을 잃지 않기 위해, 큰 페이저 아래에 기존 `DraggablePhotoGrid`를 **축소 썸네일 스트립**으로 유지한다(대표 지정·재정렬·삭제 UI 재사용). 페이저는 "크게 보기 + 사진별 글"을 담당.
- 옛 기록(단일 memo)을 새 화면에서 **편집**할 때: photoTexts가 없으면 대표 사진 캡션 칸에 기존 memo를 시드한다(저장하면 새 구조로 자연 전환). 열람은 기존 렌더 유지(스펙 ③).

---

## 파일 구조

| 파일 | 역할 |
|------|------|
| Modify: `src/store/recordStore.tsx:52-139` | TravelRecord에 `photoTexts?: string[]` 필드 추가 |
| Create: `src/components/record/PhotoPagerSection.tsx` | 큰 사진 페이저 + 현재 사진 글 입력 + 추가 버튼 (신규, 화면 독립) |
| Modify: `src/screens/NewRecordScreen.tsx` | step 제거·섹션 나열·하단 저장 바·photoTexts state/조작/저장 |
| Modify: `src/screens/PostDetailScreen.tsx:216-271, 1812-1827` | SlideImageViewerDetail captions prop + 피드 렌더 연결 |
| Modify: `src/i18n/locales/ko.ts:750-862`, `en.ts` | newRecord 네임스페이스에 신규 키 |

---

### Task 1: TravelRecord.photoTexts 필드 + i18n 키

**Files:**
- Modify: `src/store/recordStore.tsx` (TravelRecord 인터페이스, 라인 52-139의 medias 근처)
- Modify: `src/i18n/locales/ko.ts` (newRecord 네임스페이스, 라인 750-862), `src/i18n/locales/en.ts` (동일 위치)

- [ ] **Step 1: 타입 추가** — `medias?: string[];` 선언 바로 아래에:

```ts
  // 사진별 글 — medias와 index가 짝인 병렬 배열(빈 글은 ''). 피드 한 화면 개편(2026-07-19)부터 사용.
  // 사진 추가·삭제·재정렬 시 반드시 medias와 함께 조작할 것. 옛 기록엔 없음(단일 memo 렌더 유지).
  photoTexts?: string[];
```

- [ ] **Step 2: i18n 키 추가** — ko.ts newRecord 네임스페이스 끝에:

```ts
    photoTextLabel: '이 사진의 글 ({{n}}/{{total}})',
    photoTextPlaceholder: '이 순간의 이야기를 적어보세요',
    photoEmpty: '사진을 추가해 시작해보세요',
    sectionPhoto: '사진',
    sectionCountry: '국가 선택',
    sectionTripInfo: '여행 정보',
```
en.ts 같은 위치에:

```ts
    photoTextLabel: 'Text for this photo ({{n}}/{{total}})',
    photoTextPlaceholder: 'Write about this moment',
    photoEmpty: 'Add photos to get started',
    sectionPhoto: 'Photos',
    sectionCountry: 'Country',
    sectionTripInfo: 'Trip info',
```

- [ ] **Step 3: 타입 체크** — Run: `npx tsc --noEmit` / Expected: 오류 0
- [ ] **Step 4: 커밋**

```bash
git add src/store/recordStore.tsx src/i18n/locales/ko.ts src/i18n/locales/en.ts
git commit -m "feat(feed): TravelRecord.photoTexts 필드 + 한 화면 개편 i18n 키"
```

---

### Task 2: NewRecordScreen — photoTexts state와 사진 조작 동기화

**Files:**
- Modify: `src/screens/NewRecordScreen.tsx` — `medias` state 선언부, `addNewOriginals`(라인 ~603-610), `removeMedia`(~637-658), `handleReorderMedias`(~660-685), 편집 하이드레이션(editRecord 초기값 구성부)

- [ ] **Step 1: state 추가** — `medias` state 선언 옆에:

```tsx
// 사진별 글 — medias와 index 짝. 편집 모드: 기존 photoTexts 복원,
// 옛 기록(photoTexts 없음)이면 대표 사진 위치에 memo를 시드해 새 구조로 자연 전환.
const [photoTexts, setPhotoTexts] = useState<string[]>(() => {
  if (!editRecord) return [];
  const base = (editRecord.medias ?? []).map((_, i) => editRecord.photoTexts?.[i] ?? '');
  if (!editRecord.photoTexts && editRecord.memo) {
    const repIdx = Math.max(0, (editRecord.medias ?? []).indexOf(editRecord.representativePhotoSource ?? editRecord.representativePhoto ?? ''));
    if (base.length > 0) base[repIdx] = editRecord.memo;
  }
  return base;
});
```
(editRecord medias 초기값이 실제로 어떤 변수로 구성되는지 라인 700대에서 확인해 동일 소스를 쓸 것 — medias state 초기값과 길이가 반드시 일치해야 한다.)

- [ ] **Step 2: 추가 동기화** — `addNewOriginals`에서 medias에 N장을 append하는 지점에 함께:

```tsx
setPhotoTexts((prev) => [...prev, ...added.map(() => '')]); // added = 실제 추가된 uri 배열
```

- [ ] **Step 3: 삭제 동기화** — `removeMedia(idx)`에서 medias splice와 함께:

```tsx
setPhotoTexts((prev) => prev.filter((_, i) => i !== idx));
```

- [ ] **Step 4: 재정렬 동기화** — `handleReorderMedias`가 새 순서 배열(from→to 또는 newOrder)로 medias를 재배열하는 로직과 **동일한 변환**을 photoTexts에 적용. 기존 함수가 mediaPrivacy 인덱스도 재정렬하고 있으므로 같은 방식/같은 위치에서 처리한다(구현 시 해당 함수의 실제 재배열 코드를 읽고 그대로 미러링).

- [ ] **Step 5: 타입 체크** — Run: `npx tsc --noEmit` / Expected: 오류 0
- [ ] **Step 6: 커밋**

```bash
git add src/screens/NewRecordScreen.tsx
git commit -m "feat(feed): photoTexts state — 사진 추가·삭제·재정렬과 동기화"
```

---

### Task 3: PhotoPagerSection 컴포넌트 (큰 페이저 + 사진별 글 입력)

**Files:**
- Create: `src/components/record/PhotoPagerSection.tsx`

- [ ] **Step 1: 컴포넌트 작성** — PostDetail의 SlideImageViewerDetail(pagingEnabled ScrollView + activeIdx) 패턴을 작성용으로 변형:

```tsx
// 피드 작성 — 큰 사진 페이저 + 현재 사진의 글 입력.
// 사진을 넘기면 아래 입력칸이 그 사진의 글로 전환된다. 재정렬·대표 지정·비공개는
// 아래 썸네일 스트립(기존 DraggablePhotoGrid)이 담당하고, 이 컴포넌트는 크게 보기+글만.
import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, StyleSheet, Dimensions } from 'react-native';
import { useTranslation } from 'react-i18next';

const SCREEN_W = Dimensions.get('window').width;
const PAGE_W = SCREEN_W; // 화면 폭 전체(최대한 크게)
const PAGE_H = Math.round(SCREEN_W * 1.05);

export default function PhotoPagerSection({
  medias, photoTexts, representativePhoto, onChangeText, onAddPress,
}: {
  medias: string[];
  photoTexts: string[];
  representativePhoto: string | null;
  onChangeText: (index: number, text: string) => void;
  onAddPress: () => void;
}) {
  const { t } = useTranslation();
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // 사진 삭제 등으로 배열이 줄면 activeIdx 보정
  useEffect(() => {
    if (activeIdx > medias.length - 1) setActiveIdx(Math.max(0, medias.length - 1));
  }, [medias.length, activeIdx]);

  if (medias.length === 0) {
    return (
      <TouchableOpacity style={st.empty} onPress={onAddPress} activeOpacity={0.8}
        accessibilityRole="button" accessibilityLabel={t('newRecord.photoEmpty')}>
        <Text style={st.emptyPlus}>＋</Text>
        <Text style={st.emptyText}>{t('newRecord.photoEmpty')}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View>
      <View>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setActiveIdx(Math.round(e.nativeEvent.contentOffset.x / PAGE_W))}
          style={{ width: PAGE_W, height: PAGE_H }}
        >
          {medias.map((uri, i) => (
            <Image key={`${uri}-${i}`} source={{ uri }} style={{ width: PAGE_W, height: PAGE_H }} resizeMode="cover" />
          ))}
        </ScrollView>
        {/* n/N + 대표 표시 */}
        <View style={st.counter}><Text style={st.counterText}>{activeIdx + 1} / {medias.length}</Text></View>
        {representativePhoto === medias[activeIdx] && (
          <View style={st.repBadge}><Text style={st.repBadgeText}>{t('newRecord.missRepPhoto').replace(' 지정', '')}</Text></View>
        )}
        {/* 도트 인디케이터 */}
        <View style={st.dots}>
          {medias.map((_, i) => (
            <View key={i} style={[st.dot, i === activeIdx && st.dotOn]} />
          ))}
        </View>
      </View>
      {/* 현재 사진의 글 */}
      <View style={st.captionBox}>
        <Text style={st.captionLabel}>
          {t('newRecord.photoTextLabel', { n: activeIdx + 1, total: medias.length })}
        </Text>
        <TextInput
          style={st.captionInput}
          placeholder={t('newRecord.photoTextPlaceholder')}
          placeholderTextColor="#5a5a68"
          value={photoTexts[activeIdx] ?? ''}
          onChangeText={(v) => onChangeText(activeIdx, v)}
          multiline
        />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  empty: {
    height: 220, marginHorizontal: 16, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: '#6B21A8', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  emptyPlus: { color: '#BF85FC', fontSize: 34 },
  emptyText: { color: '#A1A1B0', fontSize: 13 },
  counter: {
    position: 'absolute', top: 10, right: 12, backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
  },
  counterText: { color: '#FFFFFF', fontSize: 11 },
  repBadge: {
    position: 'absolute', top: 10, left: 12, backgroundColor: '#BF85FC',
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2,
  },
  repBadgeText: { color: '#12061f', fontSize: 10, fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 4, alignSelf: 'center', position: 'absolute', bottom: 10 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotOn: { backgroundColor: '#BF85FC', width: 12 },
  captionBox: { marginHorizontal: 16, marginTop: 10 },
  captionLabel: { color: '#BF85FC', fontSize: 11, fontWeight: '700', marginBottom: 6 },
  captionInput: {
    backgroundColor: '#17131f', borderWidth: 1, borderColor: '#2E2E3B', borderRadius: 12,
    color: '#FFFFFF', padding: 12, minHeight: 72, textAlignVertical: 'top', fontSize: 14,
  },
});
```
(repBadge 라벨의 replace는 임시 처리 — 구현 시 ko '대표'/en 'Cover' 전용 키 `repBadge`를 newRecord에 추가하는 편이 깔끔하면 그렇게 하고 ko/en 대칭 유지.)

- [ ] **Step 2: 타입 체크** — Run: `npx tsc --noEmit` / Expected: 오류 0
- [ ] **Step 3: 커밋**

```bash
git add src/components/record/PhotoPagerSection.tsx src/i18n/locales/ko.ts src/i18n/locales/en.ts
git commit -m "feat(feed): PhotoPagerSection — 큰 사진 페이저 + 사진별 글 입력"
```

---

### Task 4: NewRecordScreen 리레이아웃 — step 제거·섹션 나열·하단 저장 바

가장 큰 태스크. **기존 각 step의 JSX 블록(1: 1464-1599, 2: 1600-1687, 3: 1688-2000)을 삭제하지 말고 섹션으로 재배치**한다 — 내부 UI·핸들러는 그대로.

**Files:**
- Modify: `src/screens/NewRecordScreen.tsx`

- [ ] **Step 1: step 인프라 제거** — `const [step, setStep] = useState(1)`(468), `TOTAL_STEPS`(440), `StepProgressBar` 렌더(1443-1444), `StepNavBar` 렌더(2007-2020)와 두 컴포넌트 정의(211-233, 284-331), `canGoNext`의 step 분기 제거. step을 참조하는 모든 곳(`grep -n "\bstep\b" 으로 전수 확인`)을 정리한다. 컴포넌트 정의는 다른 화면이 import하지 않는 것을 확인 후 삭제.

- [ ] **Step 2: 섹션 재배치** — ScrollView(1450+) 안을 다음 순서로:

```tsx
{/* ① 사진 — 큰 페이저 + 사진별 글 + 관리 스트립 */}
<Text style={s.sectionLabel}>📷 {t('newRecord.sectionPhoto')}</Text>
<PhotoPagerSection
  medias={medias}
  photoTexts={photoTexts}
  representativePhoto={representativePhoto}
  onChangeText={(i, v) => setPhotoTexts((prev) => prev.map((x, k) => (k === i ? v : x)))}
  onAddPress={selectMedia}
/>
{medias.length > 0 && (
  <>
    {/* 기존 step 2의 갤러리/카메라 버튼 + DraggablePhotoGrid 블록을 여기로 이동(축소 스트립 역할) */}
  </>
)}

{/* ② 국가 선택 — 기존 step 1 블록 전체 이동. 선택 완료 시 칩 요약 + 변경 버튼 */}
<Text style={s.sectionLabel}>🌍 {t('newRecord.sectionCountry')}</Text>
{/* 기존 step 1 JSX */}
{/* 여행 기억 서랍 — 기존 {step === 3 && <MomentDrawer/>}(1707)를 조건 제거하고 이 위치로 */}
<MomentDrawer moments={matchedMoments} />

{/* ③ 여행 정보 — 기존 step 3 블록(날짜·동행·별점·날씨·예산·키워드 등) 이동 */}
<Text style={s.sectionLabel}>🗓️ {t('newRecord.sectionTripInfo')}</Text>
{/* 기존 step 3 JSX (MomentDrawer 부분 제외) */}
```
국가 선택 "칩으로 접힘" UI: 기존 step 1 블록에 이미 선택 국가 리스트 UI가 있으므로, `selectedCountries.length > 0 && !countryExpanded`일 때 요약 칩(국기+이름+[변경])만 보여주고 [변경] 탭 시 `countryExpanded` state로 전체 UI를 펼치는 래퍼를 씌운다:

```tsx
const [countryExpanded, setCountryExpanded] = useState(selectedCountries.length === 0);
```

- [ ] **Step 3: 하단 고정 저장 바 + 일괄 검증** — StepNavBar 자리에:

```tsx
// 섹션 Y좌표 기록용
const sectionYRef = useRef<{ photo: number; country: number; info: number }>({ photo: 0, country: 0, info: 0 });
// 각 섹션 래퍼 View에 onLayout={(e) => { sectionYRef.current.photo = e.nativeEvent.layout.y; }}

const missing = (): { key: 'photo' | 'country' | 'info'; msg: string } | null => {
  if (medias.length === 0) return { key: 'photo', msg: t('newRecord.missPhoto') };
  if (!representativePhoto) return { key: 'photo', msg: t('newRecord.missRepPhoto') };
  if (selectedCountries.length === 0) return { key: 'country', msg: t('newRecord.missCountry') };
  if (selectedCompanions.length === 0) return { key: 'info', msg: t('newRecord.missCompanion') };
  if (!allRatingsFilled) return { key: 'info', msg: t('newRecord.missRating') };
  return null;
};
// allRatingsFilled = 기존 canGoNext step3의 국가별 별점 검사식을 그대로 변수로 추출

const canSave = missing() == null;
const onSavePress = () => {
  const miss = missing();
  if (miss) {
    scrollRef.current?.scrollTo({ y: sectionYRef.current[miss.key], animated: true });
    // 기존 필수 미충족 안내(1380-1394)의 토스트/알림 방식 재사용해 miss.msg 표시
    return;
  }
  handleSave();
};
```

```tsx
{/* 하단 고정 저장 바 — 미충족 시 흐림, 눌러도 미충족 섹션으로 안내 */}
<View style={s.saveBar}>
  <TouchableOpacity style={[s.saveBtn, !canSave && { opacity: 0.4 }]} onPress={onSavePress}>
    <Text style={s.saveBtnText}>{editRecord ? t('newRecord.editTitle') : t('common.save') /* 실제 키 확인 */}</Text>
  </TouchableOpacity>
</View>
```
saveBar 스타일: 하단 고정(borderTop #1A1A26, 배경 rgba(10,10,15,0.92), safe-area 하단 패딩). ScrollView contentContainer 하단에 저장 바 높이만큼 paddingBottom.

- [ ] **Step 4: 타입 체크 + step 잔존 검사** — Run: `npx tsc --noEmit` 및 `grep -n "setStep\|step ===" src/screens/NewRecordScreen.tsx` / Expected: tsc 0, grep 0건
- [ ] **Step 5: 커밋**

```bash
git add src/screens/NewRecordScreen.tsx
git commit -m "feat(feed): 작성 화면 한 화면 통합 — 사진 페이저·섹션 나열·하단 저장 바"
```

---

### Task 5: 저장 로직 — photoTexts 저장 + memo 하위 호환 복사

**Files:**
- Modify: `src/screens/NewRecordScreen.tsx` — `doSave`(1242-1355)의 payload 구성부(1284-1314)

- [ ] **Step 1: payload에 photoTexts + memo 복사** — payload 객체에:

```tsx
// 사진별 글 저장 + 하위 호환: 대표 사진의 글을 memo로 복사(피드 미리보기·검색·백업이 memo를 읽음)
photoTexts,
memo: photoTexts[repIndex] ?? '',
```
`repIndex`는 medias에서 대표 사진의 index: 기존 doSave가 대표 사진을 어떻게 식별하는지(representativePhoto가 압축본 uri인지 원본인지, 라인 1274-1282의 toRepHiRes 입력) 확인해 같은 기준으로 `medias.indexOf(...)`. 기존 `memo` state와 그 입력 UI는 제거한다(사진별 글이 전부 — 스펙 ②). memo state를 참조하던 곳 전수 확인(`grep -n "memo" 해당 파일`).

- [ ] **Step 2: 타입 체크** — Run: `npx tsc --noEmit` / Expected: 오류 0
- [ ] **Step 3: 커밋**

```bash
git add src/screens/NewRecordScreen.tsx
git commit -m "feat(feed): photoTexts 저장 + 대표 글 memo 복사(하위 호환)"
```

---

### Task 6: PostDetail — 캐러셀 사진별 글 표시

**Files:**
- Modify: `src/screens/PostDetailScreen.tsx` — `SlideImageViewerDetail`(216-271), 피드 렌더(1812-1827), 본문(memo) 렌더부

- [ ] **Step 1: SlideImageViewerDetail에 captions prop 추가**:

```tsx
// props에 추가
captions?: string[]; // 사진별 글 — index 짝. 있으면 현재 사진의 글을 캐러셀 아래에 표시

// 컴포넌트 JSX 마지막(인디케이터 아래)에 추가
{captions && captions[activeIdx] ? (
  <Text style={{ color: '#E8E8F0', fontSize: 14, lineHeight: 21, marginTop: 10, paddingHorizontal: 4 }}>
    {captions[activeIdx]}
  </Text>
) : null}
```

- [ ] **Step 2: 피드 렌더 연결** — 1812-1827의 SlideImageViewerDetail 호출부에 `captions={record.photoTexts}` 전달.

- [ ] **Step 3: memo 중복 표시 방지** — photoTexts가 있는 기록은 memo가 대표 글의 복사본이므로, 기존 memo 본문 블록 렌더 조건에 `!record.photoTexts`를 추가한다(옛 기록은 그대로 memo 렌더 — 스펙 ③ 하위 호환). memo를 그리는 정확한 위치는 `grep -n "record.memo\|\.memo" src/screens/PostDetailScreen.tsx`로 찾고, 피드 viewType 경로만 수정(블로그·앨범·스냅 경로는 건드리지 않음).

- [ ] **Step 4: 타입 체크** — Run: `npx tsc --noEmit` / Expected: 오류 0
- [ ] **Step 5: 커밋**

```bash
git add src/screens/PostDetailScreen.tsx
git commit -m "feat(feed): PostDetail 캐러셀에 사진별 글 표시 — 옛 기록은 기존 렌더"
```

---

### Task 7: 최종 검증

- [ ] **Step 1: 타입 체크 + verify 회귀** — Run: `npx tsc --noEmit`, `npx tsx src/utils/momentMatch.verify.ts`, `npx tsx src/utils/badgeRules.verify.ts` / Expected: 전부 통과
- [ ] **Step 2: 수동 시나리오 (dev 서버, 스펙 ⑥)**
  - 신규 작성: 글 먼저 → 국가 → 사진 순서로 입력해도 저장 가능
  - 흐린 저장 버튼 탭 → 첫 미충족 섹션으로 스크롤 + 안내
  - 사진 3장에 다른 글 → 저장 → PostDetail에서 넘기며 글 전환
  - 사진 삭제·재정렬·대표 변경 후 글-사진 짝 유지 확인
  - 대표 사진 글이 소셜/피드 목록 미리보기에 노출(memo 경유)
  - 옛 기록 열람(기존 렌더)·옛 기록 편집(대표 캡션에 memo 시드) 확인
  - 여행 카드 경유 진입(tripPeriod 적용), 다국가 작성(국가별 별점), 여행 기억 서랍(✨) 노출
  - 키보드: 사진별 글 입력 시 저장 바·입력칸 가림 없는지 (iOS/Android)
- [ ] **Step 3: 잔여 변경 확인 + 푸시**

```bash
git status --short   # 계획 외 파일 오염 확인
git push origin feat/empty-social-tab
```
