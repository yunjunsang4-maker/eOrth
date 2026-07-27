# 빈 소셜탭 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 신규 사용자의 빈 소셜탭을 "기록 유도"로 재구성하고, eOrth 공식 예시 콘텐츠(예시 기록 1 + 자동 슬라이드 기능 카드 1 + 데모 스냅)를 네이티브하게 주입한다.

**Architecture:** 서버·RLS 무변경. 번들 예시를 `TravelRecord`(플래그 `isExample`)로 상수화해 `allVisible.length===0`일 때 클라이언트가 피드/스냅 링에 주입한다. 이미지는 플레이스홀더 에셋으로 배선하고 나중에 실사진으로 교체(경로 고정, 코드 변경 없음).

**Tech Stack:** React Native (Expo), TypeScript, react-i18next. 검증: `npx tsc --noEmit`, `npx tsx <file>.verify.ts`, 수동 플로우.

**참고 스펙:** `docs/superpowers/specs/2026-07-17-empty-social-tab-design.md`

---

## 검증 방식

- 순수 로직은 `*.verify.ts` + `npx tsx`. UI/스토어는 `npx tsc --noEmit` + 실기기 수동.

## 파일 구조 (생성/수정)

- 수정: `src/store/recordStore.tsx` — `TravelRecord`에 `isExample?: boolean`
- 생성: `assets/example/` — 플레이스홀더 이미지(기존 사진 복사, 나중에 실사진으로 교체)
- 생성: `src/constants/exampleContent.ts` — 예시 기록·데모 스냅·기능 슬라이드 정의
- 생성: `src/utils/carousel.ts` + `.verify.ts` — 다음 슬라이드 인덱스 순수 함수
- 생성: `src/components/social/FeatureShowcaseCard.tsx` — 자동 슬라이드 기능 소개 카드
- 수정: `src/screens/SocialScreen.tsx` — 빈 상태 재구성, 예시/기능 카드·데모 스냅 주입, `isExample` 가드·공식 배지
- 수정: `src/screens/PostDetailScreen.tsx` — `isExample` 읽기전용 가드
- 수정: `src/i18n/locales/ko.ts`·`en.ts` — 문구

---

## Phase 1 — 타입·데이터·자산

### Task 1: TravelRecord.isExample + 플레이스홀더 에셋

**Files:**
- Modify: `src/store/recordStore.tsx:52-55`
- Create: `assets/example/*` (복사)

- [ ] **Step 1: 타입 필드 추가**

`TravelRecord` 인터페이스(52행)에 추가:
```ts
  isExample?: boolean; // eOrth 공식 예시 콘텐츠 — 상호작용 비활성·공식 배지·프로필 이동 차단
```

- [ ] **Step 2: 플레이스홀더 이미지 생성 (기존 사진 복사)**

나중에 실사진으로 교체할 자리. 기존 번들 사진을 복사해 경로만 확보한다:
```bash
mkdir -p "assets/example"
cp assets/nyc_skyline.jpg assets/example/feed1.jpg
cp assets/brooklyn_brick.jpg assets/example/snap1.jpg
cp assets/nyc_skyline.jpg assets/example/feature-globe.jpg
cp assets/brooklyn_brick.jpg assets/example/feature-stats.jpg
cp assets/nyc_skyline.jpg assets/example/feature-badge.jpg
```
(사용자가 나중에 같은 파일명으로 덮어쓰면 코드 변경 없이 반영된다.)

- [ ] **Step 3: 검증 + 커밋**

Run: `npx tsc --noEmit`
Expected: 에러 0.
```bash
git add src/store/recordStore.tsx assets/example
git commit -m "feat(social): TravelRecord.isExample + 예시 콘텐츠 플레이스홀더 에셋"
```

---

### Task 2: exampleContent 상수

**Files:**
- Create: `src/constants/exampleContent.ts`

- [ ] **Step 1: 작성**

번들 require를 uri 문자열로 변환해(`Image.resolveAssetSource`) 예시 `TravelRecord`가 진짜 기록과 동일하게 렌더되게 한다.

```ts
// src/constants/exampleContent.ts
// eOrth 공식 예시 콘텐츠 — 빈 소셜탭에 주입되는 번들 데이터. 서버 저장/발행 없음.
import { Image } from 'react-native';
import type { TravelRecord } from '../store/recordStore';

const asUri = (m: number) => Image.resolveAssetSource(m).uri;

// 예시 기록 카드 (피드 형식)
export const EXAMPLE_FEED_RECORD: TravelRecord = {
  id: 'example-feed-1',
  user: { name: 'eOrth', emoji: '🌏', handle: 'eorth' },
  country: '🇺🇸 미국', countryName: '미국', countryFlag: '🇺🇸',
  date: '2026.05.20', timestamp: Date.now(),
  content: '뉴욕에서의 하루 — 이렇게 기록을 남겨보세요.',
  viewType: 'feed',
  medias: [asUri(require('../../assets/example/feed1.jpg'))],
  likes: 0, comments: 0, liked: false,
  visibility: 'neighbors',
  isExample: true,
};

// 데모 스냅 (스냅 형식)
export const EXAMPLE_SNAP: TravelRecord = {
  id: 'example-snap-1',
  user: { name: 'eOrth', emoji: '🌏', handle: 'eorth' },
  country: '🇺🇸 미국', countryName: '미국', countryFlag: '🇺🇸',
  date: '2026.05.20', timestamp: Date.now(),
  content: '스냅은 이렇게 보여요',
  viewType: 'snap',
  medias: [asUri(require('../../assets/example/snap1.jpg'))],
  likes: 0, comments: 0, liked: false,
  visibility: 'neighbors',
  isExample: true,
};

// 기능 소개 슬라이드 (지구본·통계·배지)
export interface FeatureSlide { image: number; titleKey: string; descKey: string; }
export const FEATURE_SLIDES: FeatureSlide[] = [
  { image: require('../../assets/example/feature-globe.jpg'), titleKey: 'socialEmpty.featGlobeTitle', descKey: 'socialEmpty.featGlobeDesc' },
  { image: require('../../assets/example/feature-stats.jpg'), titleKey: 'socialEmpty.featStatsTitle', descKey: 'socialEmpty.featStatsDesc' },
  { image: require('../../assets/example/feature-badge.jpg'), titleKey: 'socialEmpty.featBadgeTitle', descKey: 'socialEmpty.featBadgeDesc' },
];
```

주의: `TravelRecord`의 실제 필수 필드를 확인해 누락 없이 채운다(위는 대표 필드 — 실제 타입에 `regionName?` 등 optional은 생략 가능, 필수 필드가 더 있으면 추가). `content`/`likes` 등 필드명이 실제와 다르면 실제 타입에 맞춘다.

- [ ] **Step 2: 검증 + 커밋**

Run: `npx tsc --noEmit`
Expected: 에러 0 (TravelRecord 타입과 정합).
```bash
git add src/constants/exampleContent.ts
git commit -m "feat(social): eOrth 예시 기록·데모 스냅·기능 슬라이드 상수"
```

---

## Phase 2 — 기능 소개 카드

### Task 3: 슬라이드 인덱스 순수 함수 (TDD)

**Files:**
- Create: `src/utils/carousel.ts`, `src/utils/carousel.verify.ts`

- [ ] **Step 1: 검증 먼저 (실패 예상)**

```ts
// src/utils/carousel.verify.ts
import { nextIndex } from './carousel';
let failed = 0;
function eq(a: unknown, e: unknown, m: string) { if (a !== e) { failed++; console.error(`✗ ${m}: expected ${e}, got ${a}`); } else console.log(`✓ ${m}`); }

eq(nextIndex(0, 3), 1, '0→1');
eq(nextIndex(1, 3), 2, '1→2');
eq(nextIndex(2, 3), 0, '2→0 순환');
eq(nextIndex(0, 1), 0, '슬라이드 1개면 제자리');
eq(nextIndex(5, 3), 0, '범위 밖 방어');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
```

Run: `npx tsx src/utils/carousel.verify.ts` → 실패 확인.

- [ ] **Step 2: 구현**

```ts
// src/utils/carousel.ts
// 자동 슬라이드 다음 인덱스 (순환).
export function nextIndex(current: number, count: number): number {
  if (count <= 0) return 0;
  return (current + 1) % count;
}
```

Run: `npx tsx src/utils/carousel.verify.ts` → `✅ 통과`.

- [ ] **Step 3: 커밋**
```bash
git add src/utils/carousel.ts src/utils/carousel.verify.ts
git commit -m "feat(social): 캐러셀 다음 인덱스 순수 함수 + 검증"
```

---

### Task 4: FeatureShowcaseCard 컴포넌트

**Files:**
- Create: `src/components/social/FeatureShowcaseCard.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
// src/components/social/FeatureShowcaseCard.tsx
// 빈 소셜탭 기능 소개 카드 — 3초 자동 슬라이드(지구본·통계·배지), 스와이프, 화면 밖 정지.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Image, StyleSheet, PanResponder, Dimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FEATURE_SLIDES } from '../../constants/exampleContent';
import { nextIndex } from '../../utils/carousel';
import { useAnimationsActive } from '../../hooks/useAnimationsActive';

const W = Dimensions.get('window').width;
const CARD_W = (W - 32 - 12) / 2; // 2단 매거진 카드 폭 근사(피드 카드와 맞춤 — 실제 폭 상수 있으면 그걸로)

export default function FeatureShowcaseCard() {
  const { t } = useTranslation();
  const [idx, setIdx] = useState(0);
  const active = useAnimationsActive();
  const count = FEATURE_SLIDES.length;

  useEffect(() => {
    if (!active || count <= 1) return;
    const iv = setInterval(() => setIdx((i) => nextIndex(i, count)), 3000);
    return () => clearInterval(iv);
  }, [active, count]);

  const swipe = useCallback((dir: 1 | -1) => {
    setIdx((i) => (dir === 1 ? nextIndex(i, count) : (i - 1 + count) % count));
  }, [count]);

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderRelease: (_e, g) => { if (g.dx < -30) swipe(1); else if (g.dx > 30) swipe(-1); },
  })).current;

  const slide = FEATURE_SLIDES[idx];
  return (
    <View style={[s.card, { width: CARD_W }]} {...pan.panHandlers}>
      <Image source={slide.image} style={s.img} resizeMode="cover" />
      <View style={s.overlay}>
        <Text style={s.badge}>eOrth 공식</Text>
        <Text style={s.title}>{t(slide.titleKey)}</Text>
        <Text style={s.desc}>{t(slide.descKey)}</Text>
      </View>
      <View style={s.dots}>
        {FEATURE_SLIDES.map((_, i) => (
          <View key={i} style={[s.dot, i === idx && s.dotOn]} />
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#161421', aspectRatio: 0.72, marginBottom: 12 },
  img: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, backgroundColor: 'rgba(0,0,0,0.45)' },
  badge: { alignSelf: 'flex-start', fontSize: 9, fontWeight: '800', color: '#0A0A0F', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden', marginBottom: 6 },
  title: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  desc: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 3, lineHeight: 15 },
  dots: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 4 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotOn: { backgroundColor: '#FFFFFF' },
});
```

주의: `useAnimationsActive` 훅 경로·시그니처를 확인(기존 GooeyCircle 등이 사용). `CARD_W`는 SocialScreen의 실제 카드 폭 상수가 있으면 맞춘다.

- [ ] **Step 2: 검증 + 커밋**

Run: `npx tsc --noEmit`
Expected: 에러 0.
```bash
git add src/components/social/FeatureShowcaseCard.tsx
git commit -m "feat(social): 자동 슬라이드 기능 소개 카드"
```

---

## Phase 3 — SocialScreen 통합

### Task 5: 빈 상태 재구성 + 예시/기능 카드·데모 스냅 주입

**Files:**
- Modify: `src/screens/SocialScreen.tsx`

- [ ] **Step 1: import·빈 판정**

상단 import:
```ts
import FeatureShowcaseCard from '../components/social/FeatureShowcaseCard';
import { EXAMPLE_FEED_RECORD, EXAMPLE_SNAP } from '../constants/exampleContent';
```
컴포넌트 내부, `columns` useMemo 근처 위에:
```ts
const isEmptyFeed = allVisible.length === 0;
```

- [ ] **Step 2: 피드에 예시 주입**

`columns`(2509행)가 소비하는 소스를 교체한다. 현재 `timelineWithAds`를 쓰는 자리에서, 빈 피드면 예시 기록 + 기능 카드 마커를 넣은 배열을 쓰도록:
```ts
const feedSource = isEmptyFeed
  ? [EXAMPLE_FEED_RECORD, { _featureCard: true, id: 'feature-card' }]
  : timelineWithAds;
```
`columns`가 `timelineWithAds` 대신 `feedSource`를 사용하게 바꾼다(useMemo 의존성도 feedSource로).

- [ ] **Step 3: 렌더 분기 — 기능 카드**

masonry 렌더(2642행, `if (item._adSlot) return <FeedAdCard .../>` 근처)에 기능 카드 분기 추가:
```tsx
if (item._featureCard) {
  return <FeatureShowcaseCard key={item.id} />;
}
```
(기존 `_adSlot`/DiaryCard 분기는 유지. 빈 피드일 땐 하우스광고가 안 붙으니 충돌 없음.)

- [ ] **Step 4: 데모 스냅 주입**

스냅 링 렌더(2550행, `snapItems.length > 0 && (...)`)의 소스를 교체 — 내 스냅이 없을 때 데모 스냅을 보여준다:
```ts
const snapDisplay = snapItems.length === 0 ? [EXAMPLE_SNAP] : snapItems;
```
그리고 `snapItems.length > 0 && (`를 `snapDisplay.length > 0 && (`로, 내부 `snapItems.map`을 `snapDisplay.map`으로 바꾼다. 데모 스냅 탭은 기존 스냅 스토리 뷰어로 그대로 열린다(EXAMPLE_SNAP도 record라 동일 경로).

- [ ] **Step 5: 빈 상태 문구·CTA 재구성**

빈 상태 블록(2599–2638행)에서 문구·CTA를 결정 2로 바꾼다:
- 상단 문구: `t('socialEmpty.title')`("기록을 남기면 여기서 이웃과 나눠져요")
- 주 CTA: "첫 기록 남기기" → 기록 작성 진입(기존 앱의 기록작성 네비게이션 — RecordFab/지구본 경로 확인해 동일하게). 스킨색 강조.
- 추천 친구·친구찾기: 하단 보조로 축소 유지.

(예시 카드가 피드에 이미 뜨므로, emptyWrap은 문구+CTA 중심으로 가볍게.)

- [ ] **Step 6: 검증 + 커밋**

Run: `npx tsc --noEmit`
Expected: 에러 0.
```bash
git add src/screens/SocialScreen.tsx
git commit -m "feat(social): 빈 피드 재구성·예시 기록/기능 카드·데모 스냅 주입"
```

---

### Task 6: isExample 상호작용 가드·공식 배지 (DiaryCard) + PostDetail 읽기전용

**Files:**
- Modify: `src/screens/SocialScreen.tsx` (DiaryCard 렌더)
- Modify: `src/screens/PostDetailScreen.tsx`

- [ ] **Step 1: DiaryCard 공식 배지·상호작용 가드**

SocialScreen의 카드 렌더(DiaryCard/DiaryCardMemo) 내부에서 `item.isExample`을 읽어:
- 헤더의 `@handle` 옆에 공식 배지 `{item.isExample && <Text style={...}>eOrth 공식</Text>}` 렌더.
- 좋아요/댓글/신고/차단/작성자 프로필 이동 핸들러 진입부에 `if (item.isExample) return;` 가드(또는 해당 버튼 자체를 isExample일 때 숨김). 탭(상세 이동)만 허용.

정확한 위치: DiaryCard의 onPress(좋아요=toggleLike, 신고=reportPost, 차단=blockUser, 작성자 탭=FriendProfile 네비)들을 찾아 각각 가드. 카드 본문 탭(PostDetail 이동)은 유지.

- [ ] **Step 2: PostDetail isExample 읽기전용**

예시 카드 탭 → PostDetail로 record 폴백 전달됨. PostDetailScreen에서 `record?.isExample`이면:
- 댓글 서버 조회(refreshComments/fetch) 스킵.
- 댓글 입력창 숨김(또는 비활성).
- 좋아요·신고·차단 비활성.
정확한 위치는 PostDetail의 댓글 로드 useEffect·입력창·액션을 찾아 `isExample` 가드.

- [ ] **Step 3: 검증 + 커밋**

Run: `npx tsc --noEmit`
Expected: 에러 0.
```bash
git add src/screens/SocialScreen.tsx src/screens/PostDetailScreen.tsx
git commit -m "feat(social): 예시 콘텐츠 공식 배지·읽기전용 가드"
```

---

## Phase 4 — i18n

### Task 7: 문구 (ko/en)

**Files:**
- Modify: `src/i18n/locales/ko.ts`, `src/i18n/locales/en.ts`

- [ ] **Step 1: ko 최상위에 socialEmpty 블록**

```ts
socialEmpty: {
  title: '기록을 남기면 여기서 이웃과 나눠져요',
  cta: '첫 기록 남기기',
  official: 'eOrth 공식',
  feedHint: '이렇게 기록을 남겨보세요',
  featGlobeTitle: '지구본에 내 여행을 색칠',
  featGlobeDesc: '다녀온 나라가 지구본에 물들어요',
  featStatsTitle: '여행 통계 한눈에',
  featStatsDesc: '방문한 나라·기록을 숫자로',
  featBadgeTitle: '여행 배지 수집',
  featBadgeDesc: '기록을 남기면 배지가 열려요',
},
```

- [ ] **Step 2: en 동일 키**

```ts
socialEmpty: {
  title: 'Post a record and it appears here for neighbors',
  cta: 'Create your first record',
  official: 'eOrth Official',
  feedHint: 'Try recording like this',
  featGlobeTitle: 'Color your globe',
  featGlobeDesc: 'Countries you visit light up your globe',
  featStatsTitle: 'Travel stats at a glance',
  featStatsDesc: 'Your countries and records in numbers',
  featBadgeTitle: 'Collect travel badges',
  featBadgeDesc: 'Records unlock badges',
},
```

- [ ] **Step 3: 검증 + 커밋**

Run: `npx tsc --noEmit`
```bash
git add src/i18n/locales/ko.ts src/i18n/locales/en.ts
git commit -m "feat(i18n): 빈 소셜탭 문구·기능 슬라이드(ko/en)"
```

---

## Phase 5 — 검증

### Task 8: 전체 검증

**Files:** (없음)

- [ ] **Step 1: 순수 로직**
Run: `npx tsx src/utils/carousel.verify.ts`
Expected: `✅ 통과`.

- [ ] **Step 2: 타입 체크**
Run: `npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 3: 수동 플로우 (실기기)**
- 신규(기록·이웃 0) 소셜탭 → 재구성된 문구 + "첫 기록 남기기" CTA
- 피드에 **예시 기록 카드**(공식 배지) + **기능 소개 카드**(3초 자동 슬라이드·스와이프·점) 노출
- 스냅 링에 **데모 스냅**(공식) → 탭 시 스토리
- 예시 카드 좋아요/댓글/신고/작성자탭 **비활성**, 본문 탭 → 상세(읽기전용)
- 첫 기록 남기면 예시 피드 2장 사라짐, 첫 스냅 올리면 데모 스냅 사라짐

- [ ] **Step 4: 완료 커밋(코드 변경 없으면 생략)**

---

## 롤아웃 노트

- 순수 클라이언트(서버·SQL 무변경). 기존 사용자는 피드에 콘텐츠 있어 예시 미노출.
- **사진 교체**: `assets/example/*` 를 사용자가 보낸 실사진으로 덮어쓰면 코드 변경 없이 반영(파일명 유지). feed1/snap1/feature-globe/feature-stats/feature-badge.
- 후속: 콘텐츠 원격설정 승격(하우스광고처럼) 가능.
