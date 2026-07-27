# 프리미엄 출시 기념 무료 개방 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프리미엄 혜택에서 광고 제거·사진첩 원본 백업을 빼고, 남은 3종을 출시 기념으로 전원 무료 개방한다.

**Architecture:** `LAUNCH_FREE_PREMIUM` 플래그 하나로 `settingsStore`가 내보내는 `isPremium`을 덮어쓴다. 18개 파일에 흩어진 게이트 코드는 손대지 않는다. 재화 시스템 도입 시 플래그만 내리면 원상 복구된다.

**Tech Stack:** React Native (Expo SDK 54) · TypeScript · react-i18next

**설계 문서:** `docs/superpowers/specs/2026-07-27-premium-launch-free-design.md`

## Global Constraints

- 언어: 모든 주석·커밋 메시지는 한글로 작성한다
- 삭제 금지: 원본 백업 업로드 경로(`services/posts.ts`의 `albumQuality`)와 삭제되는 혜택의 i18n 키는 **지우지 않는다** — 재화 도입 시 재사용한다
- 저장값 불변: `setIsPremium`이 쓰는 저장값은 건드리지 않는다. 노출 시점에만 덮어쓴다
- 각 태스크는 `npx tsc --noEmit` 통과 후 커밋한다

## 테스트 전략

이 변경은 **UI 게이트 토글**이라 순수 로직 단위 테스트의 가치가 낮다. 이 저장소의 테스트(`npm test` = `*.verify.ts`)는 순수 함수 검증용이고, 여기서 바뀌는 것은 대부분 React 컴포넌트의 조건부 렌더다.

따라서 각 태스크의 검증은 다음으로 한다:

1. `npx tsc --noEmit` — 타입 오류 0
2. `npm test` — 기존 18개 파일이 계속 통과(회귀 없음 확인)
3. 마지막 태스크 후 실기기 체크리스트

억지로 테스트를 만들지 않는다.

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `src/constants/featureFlags.ts` | 빌드 환경 기반 플래그 | `LAUNCH_FREE_PREMIUM` 추가 |
| `src/store/settingsStore.tsx` | 설정 상태·영속화 | context 노출값만 덮어쓰기 (1줄) |
| `src/screens/SocialScreen.tsx` | 소셜 피드 | 광고 슬롯 조건에서 `isPremium` 제거 |
| `src/store/recordStore.tsx` | 기록 상태·업로드 | 사진첩 업로드 화질 고정 |
| `src/screens/PremiumScreen.tsx` | 페이월 | 혜택 3행·재백업 버튼 숨김·무료 안내 CTA |
| `src/screens/SettingsScreen.tsx` | 설정 화면 | 프리미엄 토글 숨김 |
| `src/i18n/locales/{ko,en}.ts` | 다국어 문구 | 무료 안내 키 추가 |

---

### Task 1: 무료 개방 스위치

이 태스크만 끝나도 남은 혜택 3종이 전원 열린다. 이후 태스크는 혜택을 빼는 작업이다.

**Files:**
- Modify: `src/constants/featureFlags.ts` (파일 끝에 추가)
- Modify: `src/store/settingsStore.tsx:683`

**Interfaces:**
- Produces: `LAUNCH_FREE_PREMIUM: boolean` — 이후 모든 태스크가 이 상수를 import 한다

- [ ] **Step 1: 플래그 추가**

`src/constants/featureFlags.ts` 파일 끝에 추가한다.

```ts
/**
 * 출시 기념 프리미엄 전체 무료 개방.
 *
 * 수익 구조를 구독에서 앱내 재화로 바꾸는 중인데 재화 종류·가격이 아직 없다.
 * 그동안 프리미엄 구조는 그대로 두고 혜택만 전원 개방한다.
 *
 * true인 동안 settingsStore가 내보내는 isPremium이 항상 true가 되므로
 * 게이트 코드(18개 파일)를 건드리지 않아도 된다.
 * 재화 시스템이 준비되면 이 값을 false로 내리고 게이트를 재화 보유 여부로 바꾼다.
 */
export const LAUNCH_FREE_PREMIUM = true;
```

- [ ] **Step 2: settingsStore 노출값 덮어쓰기**

`src/store/settingsStore.tsx` 상단 import 구역에 추가한다.

```ts
import { LAUNCH_FREE_PREMIUM } from '../constants/featureFlags';
```

683번째 줄 근처 context value의 `isPremium,`을 아래로 바꾼다. **`setIsPremium`은 그대로 둔다.**

```ts
        // 출시 기념 무료 개방 중에는 저장값과 무관하게 항상 프리미엄으로 취급한다.
        // (저장값 자체는 건드리지 않아 플래그를 내리면 원래 상태로 돌아온다)
        isPremium: LAUNCH_FREE_PREMIUM || isPremium,
        setIsPremium,
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 0

- [ ] **Step 4: 회귀 확인**

Run: `npm test`
Expected: 18개 파일 전체 통과

- [ ] **Step 5: 커밋**

```bash
git add src/constants/featureFlags.ts src/store/settingsStore.tsx
git commit -m "feat(premium): 출시 기념 무료 개방 스위치 추가

LAUNCH_FREE_PREMIUM이 참인 동안 settingsStore가 내보내는 isPremium을
항상 true로 덮어쓴다. 저장값은 그대로 두므로 플래그를 내리면 원래
상태로 돌아온다. 게이트 코드는 한 줄도 건드리지 않는다."
```

---

### Task 2: 광고 제거 혜택 삭제

**이 태스크가 수익에 직결된다.** 무료 개방으로 전원이 프리미엄 상태가 되므로, 광고 조건에 `isPremium`이 남아 있으면 **아무에게도 광고가 나가지 않는다.**

**Files:**
- Modify: `src/screens/SocialScreen.tsx:2713-2715` 및 해당 `useMemo` 의존성 배열(2742 근처)

**Interfaces:**
- Consumes: Task 1의 `LAUNCH_FREE_PREMIUM` (직접 참조하지는 않지만, 전원 프리미엄이 된다는 전제가 이 변경의 이유다)

- [ ] **Step 1: 광고 슬롯 조건에서 isPremium 제거**

현재 코드:

```ts
  const timelineWithAds = useMemo(() => {
    // 프리미엄 구독자는 광고 제거
    if (!FEED_ADS_ENABLED || isPremium || timelineItems.length < 2) return timelineItems;
```

아래로 바꾼다.

```ts
  const timelineWithAds = useMemo(() => {
    // (2026-07 수익구조 변경) 광고 제거는 프리미엄 혜택에서 빠졌다 — 전원 노출.
    // 추후 앱내 재화 상품으로 되살릴 수 있다.
    if (!FEED_ADS_ENABLED || timelineItems.length < 2) return timelineItems;
```

- [ ] **Step 2: 의존성 배열에서 isPremium 제거**

같은 `useMemo`의 의존성 배열을 찾는다(2742번째 줄 근처).

```ts
  }, [timelineItems, isPremium]);
```

아래로 바꾼다.

```ts
  }, [timelineItems]);
```

- [ ] **Step 3: 남은 isPremium 참조 확인**

Run: `grep -n "isPremium" src/screens/SocialScreen.tsx`

Expected: 광고 관련 참조는 사라지고, 아이디 폰트 관련 참조(`handleFontStyle`에 쓰이는 것들)만 남는다. 폰트는 유지되는 혜택이므로 **건드리지 않는다.**

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 0. `isPremium` 변수가 다른 곳에서 계속 쓰이므로 "미사용" 경고는 나오지 않는다.

- [ ] **Step 5: 커밋**

```bash
git add src/screens/SocialScreen.tsx
git commit -m "feat(premium): 광고 제거를 프리미엄 혜택에서 삭제

무료 개방으로 전원이 프리미엄 상태가 되므로, 광고 슬롯 조건에
isPremium이 남아 있으면 아무에게도 광고가 나가지 않는다.
조건과 useMemo 의존성에서 제거해 전원 노출로 바꾼다."
```

---

### Task 3: 사진첩 원본 백업 잠금

**Files:**
- Modify: `src/store/recordStore.tsx:814`
- Modify: `src/screens/PremiumScreen.tsx` (재백업 버튼 블록, 104번째 줄 근처)

**Interfaces:**
- Consumes: Task 1의 `LAUNCH_FREE_PREMIUM`

- [ ] **Step 1: 업로드 화질 기본값 고정**

`src/store/recordStore.tsx:814` 현재 코드:

```ts
      albumQuality: rec.albumUploadQuality ?? (isPremium ? 'original' : 'compressed'),
```

아래로 바꾼다.

```ts
      // (2026-07 수익구조 변경) 원본 백업은 프리미엄 혜택에서 빠졌다 — 전원 압축본.
      // rec.albumUploadQuality가 명시된 기존 기록은 그대로 존중한다.
      // 추후 앱내 재화로 해제할 때 이 자리에 조건을 다시 넣는다.
      albumQuality: rec.albumUploadQuality ?? 'compressed',
```

- [ ] **Step 2: 재백업 버튼 숨기기**

`src/screens/PremiumScreen.tsx`에 압축본을 원본으로 다시 올리는 버튼이 있다. 원본 백업을 잠갔으므로 무료 개방 중에는 노출하지 않는다.

현재 코드:

```tsx
        {/* 프리미엄 활성 + 압축본 사진첩 존재 → 원본 화질로 재백업 */}
        {isPremium && compressedAlbums > 0 && (
```

아래로 바꾼다.

```tsx
        {/* 압축본 사진첩을 원본으로 재백업 — 원본 백업이 혜택에서 빠진 동안은 숨긴다 */}
        {!LAUNCH_FREE_PREMIUM && isPremium && compressedAlbums > 0 && (
```

같은 파일 상단에 import를 추가한다(Task 4에서도 쓴다).

```ts
import { LAUNCH_FREE_PREMIUM } from '../constants/featureFlags';
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 0

- [ ] **Step 4: 커밋**

```bash
git add src/store/recordStore.tsx src/screens/PremiumScreen.tsx
git commit -m "feat(premium): 사진첩 원본 백업 잠금

원본 백업을 프리미엄 혜택에서 빼고 전원 압축본 업로드로 통일한다.
서버 저장소 비용 때문이다. 업로드 경로(posts.ts의 albumQuality)는
남겨둬 추후 앱내 재화로 해제할 수 있게 한다.

압축본을 원본으로 되돌리는 재백업 버튼도 무료 개방 중에는 숨긴다."
```

---

### Task 4: 페이월을 무료 안내 화면으로

**Files:**
- Modify: `src/screens/PremiumScreen.tsx` (혜택 배열 54-60, CTA 블록 121-138)
- Modify: `src/i18n/locales/ko.ts`
- Modify: `src/i18n/locales/en.ts`

**Interfaces:**
- Consumes: Task 3에서 추가한 `LAUNCH_FREE_PREMIUM` import

- [ ] **Step 1: i18n 키 추가 (ko)**

`src/i18n/locales/ko.ts`의 `premium` 섹션에 추가한다. 기존 `benefitAds*`·`benefitBackup*` 키는 **지우지 않는다.**

```ts
    launchFreeTitle: '출시 기념 전체 무료',
    launchFreeDesc: '아래 기능을 지금은 모두 무료로 쓸 수 있어요.',
```

- [ ] **Step 2: i18n 키 추가 (en)**

`src/i18n/locales/en.ts`의 같은 섹션에 추가한다.

```ts
    launchFreeTitle: 'Free for launch',
    launchFreeDesc: 'All features below are free to use right now.',
```

- [ ] **Step 3: 혜택 목록을 3행으로**

`src/screens/PremiumScreen.tsx:54-60`의 `benefits` 배열에서 광고·원본 백업 행을 지운다.

```tsx
  const benefits = [
    // (2026-07 수익구조 변경) 광고 제거·사진첩 원본 백업은 혜택에서 제외.
    //  문구 키(benefitAds*, benefitBackup*)는 재화 도입 때 재사용하려고 남겨뒀다.
    { icon: <LanguageIcon size={22} />, title: t('premium.benefitFontTitle'),  desc: t('premium.benefitFontDesc') },
    { icon: <StickerIcon size={22} />,  title: t('premium.benefitLogoTitle'),  desc: t('premium.benefitLogoDesc') },
    { icon: <PaletteIcon size={22} />,  title: t('premium.benefitFrameTitle'), desc: t('premium.benefitFrameDesc') },
  ];
```

`MegaphoneIcon`과 `GalleryIcon`이 이 파일에서 더 이상 쓰이지 않으면 import 구문에서 지운다. 다른 곳에서 쓰고 있으면 그대로 둔다. 확인: `grep -n "MegaphoneIcon\|GalleryIcon" src/screens/PremiumScreen.tsx`

- [ ] **Step 4: CTA를 무료 안내로**

현재 코드(121번째 줄 근처):

```tsx
        {/* CTA */}
        {isPremium ? (
          <View style={[st.ctaBtn, st.ctaActive, { borderColor: skinAccent.tint(0.35) }]}>
            <Text style={st.ctaActiveText}>✓ {t('premium.paywallActive')}</Text>
          </View>
        ) : (
```

아래로 바꾼다. **`LAUNCH_FREE_PREMIUM` 분기를 맨 앞에 둔다** — 무료 개방 중에는 `isPremium`이 항상 참이라 기존 "✓ 이용 중" 표시가 나오는데, 그건 구독 중이라는 뜻이라 사실과 다르다.

```tsx
        {/* CTA */}
        {LAUNCH_FREE_PREMIUM ? (
          <View style={[st.ctaBtn, st.ctaActive, { borderColor: skinAccent.tint(0.35) }]}>
            <Text style={st.ctaActiveText}>🎉 {t('premium.launchFreeTitle')}</Text>
          </View>
        ) : isPremium ? (
          <View style={[st.ctaBtn, st.ctaActive, { borderColor: skinAccent.tint(0.35) }]}>
            <Text style={st.ctaActiveText}>✓ {t('premium.paywallActive')}</Text>
          </View>
        ) : (
```

- [ ] **Step 5: 히어로 문구를 무료 안내로**

같은 파일 88번째 줄 근처의 히어로 부제를 바꾼다.

```tsx
          <Text style={st.heroSub}>
            {LAUNCH_FREE_PREMIUM ? t('premium.launchFreeDesc') : t('premium.paywallSubtitle')}
          </Text>
```

- [ ] **Step 6: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 오류 0

- [ ] **Step 7: lint로 미사용 import 확인**

Run: `npx eslint src/screens/PremiumScreen.tsx`
Expected: 미사용 아이콘 import 경고가 없어야 한다. 나오면 Step 3으로 돌아가 해당 import를 지운다.

- [ ] **Step 8: 커밋**

```bash
git add src/screens/PremiumScreen.tsx src/i18n/locales/ko.ts src/i18n/locales/en.ts
git commit -m "feat(premium): 페이월을 출시 기념 무료 안내 화면으로

혜택 목록에서 광고 제거·원본 백업을 빼 3행으로 줄이고, 구매 CTA 자리에
무료 안내를 띄운다. LAUNCH_FREE_PREMIUM 분기를 isPremium보다 앞에 둔 이유는,
무료 개방 중 isPremium이 항상 참이라 '구독 이용 중'으로 잘못 보이기 때문이다.

삭제한 혜택의 i18n 키는 재화 도입 때 재사용하려고 남겨뒀다."
```

---

### Task 5: 설정 프리미엄 토글 숨김

**Files:**
- Modify: `src/screens/SettingsScreen.tsx:374-377`

**Interfaces:**
- Consumes: Task 1의 `LAUNCH_FREE_PREMIUM`

- [ ] **Step 1: import 추가**

`src/screens/SettingsScreen.tsx` 상단에 추가한다. 이 파일이 이미 `featureFlags`에서 무언가를 import 하고 있으면 그 구문에 이름을 더한다.

```ts
import { LAUNCH_FREE_PREMIUM } from '../constants/featureFlags';
```

- [ ] **Step 2: 토글 항목 조건부 렌더**

현재 코드(376번째 줄):

```tsx
            // 베타 체험 토글 — 결제(RevenueCat) 연동 시 구매 화면 진입으로 교체
            { icon: <StarIcon size={22} />, label: t('settings.premiumToggle'), toggle: isPremium, onToggle: setIsPremium },
```

아래로 바꾼다. 배열에서 조건부로 빼야 하므로 스프레드를 쓴다.

```tsx
            // 베타 체험 토글 — 무료 개방 중에는 의미가 없어 숨긴다.
            // (플래그를 내리면 다시 나타난다. 결제 연동 시 구매 화면 진입으로 교체)
            ...(LAUNCH_FREE_PREMIUM
              ? []
              : [{ icon: <StarIcon size={22} />, label: t('settings.premiumToggle'), toggle: isPremium, onToggle: setIsPremium }]),
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`

Expected: 오류 0. 배열 요소 타입이 안 맞는다는 오류가 나면, 해당 `items` 배열의 원소 타입을 확인해 명시적으로 타입을 붙인다. 예:

```tsx
            ...(LAUNCH_FREE_PREMIUM
              ? []
              : [{ icon: <StarIcon size={22} />, label: t('settings.premiumToggle'), toggle: isPremium, onToggle: setIsPremium } as const]),
```

- [ ] **Step 4: 회귀 확인**

Run: `npm test`
Expected: 18개 파일 전체 통과

- [ ] **Step 5: 커밋**

```bash
git add src/screens/SettingsScreen.tsx
git commit -m "feat(premium): 무료 개방 중 설정의 프리미엄 체험 토글 숨김

전원 프리미엄 상태라 토글이 아무 효과가 없다. 플래그를 내리면
다시 나타난다."
```

---

### Task 6: 실기기 검증

코드 변경은 없다. 앞선 다섯 태스크의 결과를 실제 앱에서 확인한다.

**Files:** 없음

- [ ] **Step 1: 앱 실행**

Run: `npx expo start`

기기에서 Reload JS. 네이티브 변경이 없으므로 재빌드는 필요 없다.

- [ ] **Step 2: 광고 노출 확인**

소셜 탭에 들어가 광고 슬롯이 보이는지 확인한다. 게시물이 2개 이상이어야 첫 슬롯이 나온다.

Expected: 광고가 보인다. **안 보이면 Task 2가 반영되지 않은 것이다.**

- [ ] **Step 3: 잠금 해제 확인**

설정 화면에서 확인한다.

- 아이디 폰트: 잠금 배지 없이 바로 선택 가능
- 스트립 로고 제거: 토글로 노출
- 프리미엄 체험 토글: **보이지 않아야 한다**

- [ ] **Step 4: 페이월 확인**

설정이나 다른 경로로 프리미엄 화면에 진입한다.

Expected:
- 혜택이 **3행**(폰트·로고·프레임)
- 부제가 "아래 기능을 지금은 모두 무료로 쓸 수 있어요"
- CTA가 "🎉 출시 기념 전체 무료"
- 원본 재백업 버튼이 **보이지 않는다**

- [ ] **Step 5: 사진첩 업로드 확인**

사진첩을 하나 만들어 업로드한다.

Expected: 압축본으로 업로드된다. 검증이 어려우면 이 항목은 코드 확인(`recordStore.tsx:814`이 `'compressed'` 고정)으로 갈음한다.

- [ ] **Step 6: 결과 보고**

문제가 있으면 해당 태스크로 돌아가 고친다. 모두 정상이면 완료를 보고한다.

---

## 완료 후

- 브랜치: `feat/premium-launch-free`
- `superpowers:finishing-a-development-branch` 스킬로 통합 방식을 결정한다

## 범위 밖

- 앱내 재화 시스템 설계(종류·가격·구매 흐름)
- RevenueCat 등 결제 연동
- 사진 장수 상향 재도입
