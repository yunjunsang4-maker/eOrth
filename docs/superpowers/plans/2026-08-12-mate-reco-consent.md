# 메이트 추천 선택 동의 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 신규 가입자에게는 온보딩 마지막에, 기존 이용자에게는 소셜 탭 배너로 메이트 추천 활용 동의를 묻는다.

**Architecture:** 서버는 이미 완비돼 있다(`profiles.mate_reco_optin`, `set_mate_reco_optin()`, `fetchMateRecoOptin`/`saveMateRecoOptin`). 순수 클라이언트 작업이다. 온보딩 종점 3곳을 새 동의 화면으로 모으고, 그 화면이 기존 `reset(Main, startTutorial:true)` 를 대신 수행한다. 기존 이용자는 `mate_reco_optin === null` 일 때만 소셜 피드 최상단에 배너를 띄운다.

**Tech Stack:** React Native (Expo, 새 아키텍처/Fabric), TypeScript, React Navigation, react-i18next, Supabase.

## Global Constraints

- **`<Text>`/`<TextInput>` 은 반드시 `../ui/Text` 에서 import.** `react-native` 직접 import는 정적 가드 규칙 7이 실패시킨다.
- **버튼 라벨 `<Text>` 에는 `{...andFitText}` 를 스프레드**한다(`../utils/fitText`). 규칙 10이 강제한다.
- **320dp를 넘는 고정 폭 금지**(규칙 4). 폭은 `%` 또는 flex로 잡는다.
- **문구는 i18n 키로만** 쓴다. `src/i18n/locales/ko.ts` 와 `en.ts` 양쪽에 넣는다. 하드코딩 금지.
- 디자인 토큰: 배경 `#0A0A0F`, 카드 `#2E2E3B`, 보라 네온 `#BF85FC`, 텍스트 흐림 `#A1A1B0`, 구분선 `#1A1A26`.
- **`mate_reco_optin` 은 3-상태**다: `null`=미결정(유예, 추천 포함), `true`=동의, `false`=거부. 화면은 `=== null` 로만 '미결정'을 판정한다. `!optin` 은 `false` 와 `null` 을 구분하지 못하므로 쓰지 않는다.
- 각 태스크 끝에 `npx tsc --noEmit` 과 `node scripts/layout-parity.verify.mjs` 가 통과해야 한다.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/screens/MateRecoConsentScreen.tsx` (신규) | 온보딩 마지막 동의 화면. 저장 후 Main으로 reset. |
| `src/components/MateRecoConsentBanner.tsx` (신규) | 기존 이용자용 배너. 표시 조건 판정·저장·닫기를 자체 처리. |
| `src/store/settingsStore.tsx` (수정) | `mateRecoAskedAt` 영속 상태 추가(배너 닫은 시각). |
| `src/navigation/AppNavigator.tsx` (수정) | `MateRecoConsent` 라우트 등록. |
| `src/navigation/types.ts` (수정) | 라우트 파라미터 타입. |
| `src/screens/TravelImportScreen.tsx` (수정) | 온보딩 출구 1 → 동의 화면. |
| `src/screens/TravelDnaSurveyScreen.tsx` (수정) | 온보딩 출구 2 → 동의 화면. |
| `src/screens/TravelDnaResultScreen.tsx` (수정) | 온보딩 출구 3 → 동의 화면. |
| `src/screens/SocialScreen.tsx` (수정) | 배너를 피드 최상단에 렌더. |
| `src/i18n/locales/ko.ts`, `en.ts` (수정) | 문구. |

---

## Task 1: i18n 문구 추가

동의 화면과 배너가 쓸 문구를 먼저 넣는다. 이후 태스크가 전부 이 키를 참조한다.

**Files:**
- Modify: `src/i18n/locales/ko.ts`
- Modify: `src/i18n/locales/en.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `t('mateConsent.*')` 키 12종 — `title`, `lead`, `useList`, `notUseList`, `offEffect`, `protection`, `checkbox`, `continue`, `bannerTitle`, `bannerBody`, `bannerAgree`, `bannerDecline`, `saveFail`

- [ ] **Step 1: ko.ts 에 `mateConsent` 블록 추가**

`settings` 블록 바로 앞(또는 알파벳 순서상 자연스러운 위치)에 넣는다.

```ts
  mateConsent: {
    // 온보딩 마지막 동의 화면. 개인정보처리방침 제1장 4)·제7장과 같은 사실을 말해야 한다
    // — 문구를 바꿀 때 docs/privacy-policy.md 도 함께 본다.
    title: '메이트 추천에 내 여행 기록을 쓸까요?',
    lead: '비슷한 곳을 다녀온 사람을 찾아주는 기능이에요.',
    useList: '사용하는 것 · 내가 방문한 나라·도시 이름',
    notUseList: '사용하지 않는 것 · 사진, 글 내용, 날짜',
    offEffect: '끄면 내 방문 국가가 다른 이용자의 추천 목록에 나타나지 않습니다. 대신 나에게 표시되는 추천의 정확도도 함께 낮아집니다.',
    protection: '같은 곳을 다녀온 사람이 적으면 이름을 표시하지 않아, 추천 결과로 개인을 특정할 수 없게 처리합니다.',
    checkbox: '메이트 추천에 내 여행 기록을 사용하는 데 동의합니다 (선택)',
    continue: '계속',
    saveFail: '설정을 저장하지 못했어요. 설정 > 계정에서 언제든 바꿀 수 있습니다.',
    bannerTitle: '메이트 추천에 내 여행 기록을 쓸까요?',
    bannerBody: '내가 방문한 나라·도시 이름을 다른 이용자와의 공통점 계산에 사용합니다. 사진·글·날짜는 사용하지 않습니다.',
    bannerAgree: '사용 동의',
    bannerDecline: '사용 안 함',
  },
```

- [ ] **Step 2: en.ts 에 같은 블록 추가**

```ts
  mateConsent: {
    title: 'Use your travel records for mate suggestions?',
    lead: 'This is how we find people who have been to similar places.',
    useList: 'What we use · Names of countries and cities you visited',
    notUseList: 'What we do not use · Photos, post text, dates',
    offEffect: 'If you turn this off, your visited countries will not appear in other users\' suggestion lists. The suggestions shown to you will also become less accurate.',
    protection: 'Where few users have visited the same place, names are withheld so individuals cannot be identified from suggestion results.',
    checkbox: 'I agree to use my travel records for mate suggestions (optional)',
    continue: 'Continue',
    saveFail: 'Could not save your setting. You can change it anytime in Settings > Account.',
    bannerTitle: 'Use your travel records for mate suggestions?',
    bannerBody: 'We use the names of countries and cities you visited to find things you have in common with others. Photos, post text, and dates are not used.',
    bannerAgree: 'Allow',
    bannerDecline: 'Don\'t use',
  },
```

- [ ] **Step 3: 두 로케일 키가 일치하는지 확인**

Run:
```bash
node -e "const ko=require('fs').readFileSync('src/i18n/locales/ko.ts','utf8');const en=require('fs').readFileSync('src/i18n/locales/en.ts','utf8');const k=[...ko.matchAll(/^\s{4}(\w+):/gm)].map(m=>m[1]);const e=[...en.matchAll(/^\s{4}(\w+):/gm)].map(m=>m[1]);const miss=k.filter(x=>!e.includes(x));console.log('ko에만 있는 키:',miss.length?miss:'없음')"
```
Expected: `ko에만 있는 키: 없음`

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음 (종료 코드 0)

- [ ] **Step 5: 커밋**

```bash
git add src/i18n/locales/ko.ts src/i18n/locales/en.ts
git commit -m "i18n(consent): 메이트 추천 동의 화면·배너 문구 추가"
```

---

## Task 2: settingsStore 에 `mateRecoAskedAt` 추가

배너를 닫은 시각을 기기에 남긴다. 7일 뒤 재노출 판정에 쓴다.

**Files:**
- Modify: `src/store/settingsStore.tsx` (7곳)

**Interfaces:**
- Consumes: 없음
- Produces: `useSettings()` 가 `mateRecoAskedAt: number` 와 `setMateRecoAskedAt: (v: number) => void` 를 노출한다. 값 `0` = 한 번도 닫지 않음.

- [ ] **Step 1: 인터페이스에 필드 추가**

`lastSeenNoticeAt: number;` / `setLastSeenNoticeAt: (v: number) => void;` 바로 아래(약 185~186행)에:

```ts
  mateRecoAskedAt: number;
  setMateRecoAskedAt: (v: number) => void;
```

- [ ] **Step 2: 영속 형태에 필드 추가**

`lastSeenNoticeAt?: number;` 주석 줄 아래(약 257행)에:

```ts
  mateRecoAskedAt?: number;      // 메이트 추천 동의 배너를 닫은 시각(ms). 7일 뒤 재노출
```

- [ ] **Step 3: useState 추가**

`const [lastSeenNoticeAt, setLastSeenNoticeAt] = useState(0);` 아래(약 337행)에:

```ts
  const [mateRecoAskedAt, setMateRecoAskedAt] = useState(0); // 동의 배너를 닫은 시각
```

- [ ] **Step 4: hydrate 추가**

`setLastSeenNoticeAt(typeof p.lastSeenNoticeAt === 'number' ? p.lastSeenNoticeAt : 0);` 아래(약 481행)에:

```ts
      setMateRecoAskedAt(typeof p.mateRecoAskedAt === 'number' ? p.mateRecoAskedAt : 0);
```

- [ ] **Step 5: 저장 payload 두 곳에 추가**

약 533행(객체 리터럴)과 약 584행(deps 배열) 각각의 `lastSeenNoticeAt,` 아래에:

```ts
      mateRecoAskedAt,
```

- [ ] **Step 6: 계정 초기화에 추가**

`setLastSeenNoticeAt(0);` 아래(약 661행)에:

```ts
    // 배너 워터마크도 데이터 축이다 — 안 지우면 새 계정이 이전 계정의 '닫음' 시각을 물려받아
    // 유예 상태인데도 배너를 못 본다.
    setMateRecoAskedAt(0);
```

- [ ] **Step 7: context value 에 추가**

`setLastSeenNoticeAt,` 아래(약 837행)에:

```ts
        mateRecoAskedAt,
        setMateRecoAskedAt,
```

- [ ] **Step 8: 타입체크로 7곳이 다 맞는지 확인**

Run: `npx tsc --noEmit`
Expected: 오류 없음. (인터페이스에만 넣고 context value에 빠뜨리면 여기서 잡힌다)

- [ ] **Step 9: 커밋**

```bash
git add src/store/settingsStore.tsx
git commit -m "feat(settings): 메이트 추천 동의 배너 재노출 판정용 mateRecoAskedAt 추가"
```

---

## Task 3: 동의 화면 신설 + 라우트 등록

**Files:**
- Create: `src/screens/MateRecoConsentScreen.tsx`
- Modify: `src/navigation/types.ts`
- Modify: `src/navigation/AppNavigator.tsx`

**Interfaces:**
- Consumes: Task 1의 `t('mateConsent.*')`, 기존 `saveMateRecoOptin(optin: boolean): Promise<boolean>` (`src/services/profile`)
- Produces: 라우트 `MateRecoConsent`(파라미터 없음). 이 화면은 진입 시 스택을 정리하고 `Main`(`startTutorial: true`)으로 reset한다.

- [ ] **Step 1: 라우트 타입 추가**

`src/navigation/types.ts` 의 `RootStackParamList` 에서 `TravelImport` 항목 근처에 추가:

```ts
  MateRecoConsent: undefined;
```

- [ ] **Step 2: 화면 파일 생성**

Create `src/screens/MateRecoConsentScreen.tsx`:

```tsx
import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { Text } from '../ui/Text';
import { andFitText } from '../utils/fitText';
import StarFieldBackground from '../components/StarFieldBackground';
import { GlassButton } from '../components/ui';
import { saveMateRecoOptin } from '../services/profile';
import { emitToast } from '../store/toastStore';
import type { RootStackScreenProps } from '../navigation/types';

type Props = RootStackScreenProps<'MateRecoConsent'>;

const C = {
  bg: '#0A0A0F',
  card: '#2E2E3B',
  neon: '#BF85FC',
  dim: '#A1A1B0',
  divider: '#1A1A26',
  white: '#FFFFFF',
};

/**
 * 온보딩 마지막 — 메이트 추천에 여행 기록을 쓰는 것에 대한 선택 동의.
 *
 * 기본값은 '꺼짐'이다. 선택 동의는 사전 동의가 원칙이라 미리 체크해 두면 다크패턴이 된다.
 * 체크하지 않고 [계속]을 누르면 false(거부)로 저장되어 추천 후보에서 빠진다 — 의도된 동작이다.
 *
 * 저장이 실패해도 온보딩을 막지 않는다. 실패하면 서버 값이 null(유예)로 남고, 소셜 탭의
 * MateRecoConsentBanner 가 나중에 다시 묻는다(안전망).
 */
export default function MateRecoConsentScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [agreed, setAgreed] = useState(false); // 기본 꺼짐 — 위 주석 참조
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    const ok = await saveMateRecoOptin(agreed);
    if (!ok) emitToast(t('mateConsent.saveFail'));
    // 성공·실패와 무관하게 온보딩을 끝낸다. startTutorial 은 MainScreen 이 읽는 살아있는
    // 플래그라 반드시 유지해야 첫 진입 코치마크가 뜬다.
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main', params: { screen: 'MainTab', params: { startTutorial: true } } }],
    });
  };

  return (
    <View style={[st.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <StarFieldBackground opacity={0.5} />

      <View style={st.body}>
        <Text style={st.title}>{t('mateConsent.title')}</Text>
        <Text style={st.lead}>{t('mateConsent.lead')}</Text>

        <View style={st.card}>
          <Text style={st.useLine}>{t('mateConsent.useList')}</Text>
          <View style={st.divider} />
          <Text style={st.notUseLine}>{t('mateConsent.notUseList')}</Text>
        </View>

        <Text style={st.note}>{t('mateConsent.offEffect')}</Text>
        <Text style={st.note}>{t('mateConsent.protection')}</Text>
      </View>

      <TouchableOpacity
        style={st.checkRow}
        onPress={() => setAgreed((v) => !v)}
        activeOpacity={0.8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
      >
        <View style={[st.box, agreed && st.boxOn]}>
          {agreed && (
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <SvgPath d="M20 6L9 17l-5-5" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          )}
        </View>
        <Text style={st.checkLabel}>{t('mateConsent.checkbox')}</Text>
      </TouchableOpacity>

      {saving ? (
        <View style={st.savingRow}><ActivityIndicator color={C.neon} /></View>
      ) : (
        <GlassButton label={t('mateConsent.continue')} onPress={finish} />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: C.white, marginBottom: 8, lineHeight: 32 },
  lead: { fontSize: 14, color: C.dim, marginBottom: 24, lineHeight: 20 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 20 },
  useLine: { fontSize: 14, color: C.white, lineHeight: 20 },
  divider: { height: 1, backgroundColor: C.divider, marginVertical: 12 },
  notUseLine: { fontSize: 14, color: C.dim, lineHeight: 20 },
  note: { fontSize: 12, color: C.dim, lineHeight: 18, marginBottom: 10 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 20 },
  box: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.dim,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  boxOn: { backgroundColor: C.neon, borderColor: C.neon },
  checkLabel: { flex: 1, fontSize: 13, color: C.white, lineHeight: 19 },
  savingRow: { height: 54, alignItems: 'center', justifyContent: 'center' },
});
```

- [ ] **Step 3: 라우트 등록**

`src/navigation/AppNavigator.tsx` 에서 `TravelImportScreen` import 아래에:

```tsx
import MateRecoConsentScreen from '../screens/MateRecoConsentScreen';
```

`<Stack.Screen name="TravelImport" ... />` 근처(온보딩 화면들이 모인 곳)에:

```tsx
        <Stack.Screen name="MateRecoConsent" component={MateRecoConsentScreen} />
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음

- [ ] **Step 5: 정적 가드 — 규칙 7·10 확인**

Run: `node scripts/layout-parity.verify.mjs`
Expected: `✅ 통과`. 실패하면 `<Text>` import 출처(`../ui/Text`)나 라벨의 `andFitText` 누락이다.

- [ ] **Step 6: 커밋**

```bash
git add src/screens/MateRecoConsentScreen.tsx src/navigation/types.ts src/navigation/AppNavigator.tsx
git commit -m "feat(consent): 온보딩 메이트 추천 동의 화면 신설"
```

---

## Task 4: 온보딩 출구 3곳을 동의 화면으로

**Files:**
- Modify: `src/screens/TravelImportScreen.tsx:423-426`
- Modify: `src/screens/TravelDnaSurveyScreen.tsx:150-153`
- Modify: `src/screens/TravelDnaResultScreen.tsx:498-501`

**Interfaces:**
- Consumes: Task 3의 라우트 `MateRecoConsent`
- Produces: 없음 (동의 화면이 유일한 Main 진입점이 된다)

세 곳 모두 **온보딩 분기에서만** 바꾼다. `fromProfile` / `!onboarding` / `!fromOnboarding` 인 조기 반환은 손대지 않는다 — 그 경로는 기존 이용자다.

- [ ] **Step 1: TravelImportScreen 출구 교체**

`leaveImport` 안의 reset 블록을 바꾼다. 앞의 `if (fromProfile) { navigation.goBack(); return; }` 와 `await requestNotificationPermission()` 은 그대로 둔다.

변경 전:
```tsx
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main', params: { screen: 'MainTab', params: { startTutorial: true } } }],
    });
```
변경 후:
```tsx
    // 온보딩 종점은 동의 화면이다 — Main reset은 그 화면이 대신 수행한다.
    navigation.replace('MateRecoConsent');
```

- [ ] **Step 2: TravelDnaSurveyScreen 출구 교체**

`leave` 안의 reset을 같은 방식으로 바꾼다. `if (!onboarding) { navigation.goBack(); return; }` 는 그대로 둔다.

변경 후:
```tsx
    // 온보딩 종점은 동의 화면이다 — Main reset은 그 화면이 대신 수행한다.
    navigation.replace('MateRecoConsent');
```

- [ ] **Step 3: TravelDnaResultScreen 출구 교체**

'완료' 버튼 `onPress` 안의 reset을 바꾼다. `if (!fromOnboarding) { navigation.goBack(); return; }` 는 그대로 둔다. 기존의 긴 주석(“replace가 아니라 reset을 쓴다”)은 더 이상 맞지 않으므로 함께 교체한다.

변경 후:
```tsx
            // 온보딩 종점은 동의 화면이다 — 스택 정리(reset)와 startTutorial 전달은
            // MateRecoConsentScreen 이 대신 수행한다.
            navigation.replace('MateRecoConsent');
```

- [ ] **Step 4: 잔여 출구가 없는지 전수 확인**

Run:
```bash
grep -rn "name: 'Main'" src/screens/*.tsx | grep -v MainScreen
```
Expected: `MateRecoConsentScreen.tsx` 한 줄과 `ImportPhotoSelectScreen.tsx:510`(중간 경유지 — ImportComplete로 이어지므로 종점이 아니다) 두 줄만 남는다. 다른 화면이 남아 있으면 그 경로도 교체해야 한다.

- [ ] **Step 5: 타입체크 + 가드**

Run: `npx tsc --noEmit && node scripts/layout-parity.verify.mjs`
Expected: 둘 다 통과

- [ ] **Step 6: 커밋**

```bash
git add src/screens/TravelImportScreen.tsx src/screens/TravelDnaSurveyScreen.tsx src/screens/TravelDnaResultScreen.tsx
git commit -m "feat(consent): 온보딩 종점 3곳을 동의 화면으로 — Main reset은 동의 화면이 수행"
```

---

## Task 5: 재동의 배너

**Files:**
- Create: `src/components/MateRecoConsentBanner.tsx`
- Modify: `src/screens/SocialScreen.tsx` (FriendsTab 의 ScrollView 최상단)

**Interfaces:**
- Consumes: Task 1의 `t('mateConsent.banner*')`, Task 2의 `useSettings().mateRecoAskedAt`/`setMateRecoAskedAt`, 기존 `fetchMateRecoOptin()`/`saveMateRecoOptin()`
- Produces: `<MateRecoConsentBanner />` — 파라미터 없는 자족 컴포넌트. 조건이 맞지 않으면 `null` 을 반환한다.

- [ ] **Step 1: 배너 컴포넌트 생성**

Create `src/components/MateRecoConsentBanner.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { Text } from '../ui/Text';
import { andFitText } from '../utils/fitText';
import { useSettings } from '../store/settingsStore';
import { fetchMateRecoOptin, saveMateRecoOptin } from '../services/profile';
import { emitToast } from '../store/toastStore';

const C = {
  card: '#2E2E3B',
  neon: '#BF85FC',
  dim: '#A1A1B0',
  divider: '#1A1A26',
  white: '#FFFFFF',
};

/** 배너를 닫은 뒤 다시 뜨기까지의 간격 */
const REASK_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 기존 이용자용 재동의 배너.
 *
 * 신규 가입자는 온보딩(MateRecoConsentScreen)에서 이미 답하므로 여기 걸리지 않는다.
 * 서버 값이 null(=아직 물어본 적 없음)일 때만 뜬다 — `!optin` 으로 판정하면 '거부(false)'까지
 * 걸려서 이미 답한 사람에게 계속 묻게 된다.
 *
 * 닫기(✕)는 로컬에 시각만 남기고 서버 값은 건드리지 않는다. 7일 뒤 다시 뜬다.
 */
export default function MateRecoConsentBanner() {
  const { t } = useTranslation();
  const { mateRecoAskedAt, setMateRecoAskedAt } = useSettings();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    // 닫은 지 7일이 안 됐으면 서버를 조회하지도 않는다(불필요한 왕복 방지).
    if (mateRecoAskedAt && Date.now() - mateRecoAskedAt < REASK_AFTER_MS) return;
    fetchMateRecoOptin()
      .then((v) => { if (alive && v === null) setVisible(true); })
      .catch(() => {});
    return () => { alive = false; };
  }, [mateRecoAskedAt]);

  if (!visible) return null;

  const answer = async (optin: boolean) => {
    if (busy) return;
    setBusy(true);
    const ok = await saveMateRecoOptin(optin);
    if (ok) {
      setVisible(false);
    } else {
      // 저장 실패 — 서버는 여전히 null 이므로 배너를 남긴다. 잘못된 화면을 만들지 않는다.
      emitToast(t('mateConsent.saveFail'));
      setBusy(false);
    }
  };

  const dismiss = () => {
    setMateRecoAskedAt(Date.now());
    setVisible(false);
  };

  return (
    <View style={st.wrap}>
      <View style={st.headRow}>
        <Text style={st.title}>{t('mateConsent.bannerTitle')}</Text>
        <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="닫기">
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <SvgPath d="M18 6L6 18M6 6l12 12" stroke={C.dim} strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </TouchableOpacity>
      </View>
      <Text style={st.body}>{t('mateConsent.bannerBody')}</Text>
      <View style={st.btnRow}>
        <TouchableOpacity style={[st.btn, st.declineBtn]} onPress={() => answer(false)} disabled={busy} activeOpacity={0.85}>
          <Text style={st.declineTxt} {...andFitText}>{t('mateConsent.bannerDecline')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.btn, st.agreeBtn]} onPress={() => answer(true)} disabled={busy} activeOpacity={0.85}>
          <Text style={st.agreeTxt} {...andFitText}>{t('mateConsent.bannerAgree')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {
    marginHorizontal: 12, marginTop: 12, padding: 14,
    backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.divider,
  },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: 14, fontWeight: '700', color: C.white, lineHeight: 20 },
  body: { fontSize: 12, color: C.dim, lineHeight: 18, marginTop: 6 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  declineBtn: { borderWidth: 1, borderColor: C.divider },
  declineTxt: { fontSize: 13, color: C.dim, fontWeight: '600' },
  agreeBtn: { backgroundColor: C.neon },
  agreeTxt: { fontSize: 13, color: '#1A1A26', fontWeight: '700' },
});
```

- [ ] **Step 2: SocialScreen 에 렌더**

`src/screens/SocialScreen.tsx` 상단 import에 추가:

```tsx
import MateRecoConsentBanner from '../components/MateRecoConsentBanner';
```

`FriendsTab` 의 `<Animated.ScrollView ...>` 여는 태그 **바로 다음 줄**(스냅 스토리 라인 `{snapDisplay.length > 0 && (` 보다 위)에 넣는다:

```tsx
        {/* 유예 상태인 기존 이용자에게만 뜬다 — 컴포넌트가 스스로 판정하고, 아니면 null 이다 */}
        <MateRecoConsentBanner />
```

- [ ] **Step 3: 타입체크 + 가드**

Run: `npx tsc --noEmit && node scripts/layout-parity.verify.mjs`
Expected: 둘 다 통과

- [ ] **Step 4: 커밋**

```bash
git add src/components/MateRecoConsentBanner.tsx src/screens/SocialScreen.tsx
git commit -m "feat(consent): 기존 이용자용 재동의 배너 — 소셜 피드 최상단, 7일 뒤 재노출"
```

---

## Task 6: 전체 검증 + 스펙 반영

**Files:**
- Modify: `supabase/SERVER-STATE.md` (해당 '남은 것' 문단)

**Interfaces:**
- Consumes: Task 1~5 전부
- Produces: 없음

- [ ] **Step 1: 전체 검사**

Run: `npx tsc --noEmit && node scripts/layout-parity.verify.mjs && npx expo lint`
Expected: typecheck 0오류, 가드 `✅ 통과`, lint 0 errors(경고는 기존 수준)

- [ ] **Step 2: SERVER-STATE.md 의 미구현 문단 갱신**

`**남은 것 — 아직 안 한 작업:**` 로 시작하는 문단에서 온보딩 동의 화면·재동의 배너가 **구현됐다**는 사실과, 개인정보처리방침 명시가 `0bfe8b7`(2026-08-19 시행)로 **완료됐다**는 사실을 반영한다. 남은 위험(배너를 계속 무시하는 이용자는 유예로 남음)만 남긴다.

- [ ] **Step 3: 커밋**

```bash
git add supabase/SERVER-STATE.md
git commit -m "docs(server): 메이트 추천 동의 UI 구현 완료 반영"
```

- [ ] **Step 4: 수동 확인 항목 (실기기/에뮬레이터)**

아래는 자동 검사로 못 잡는다. 실행자는 이 목록을 사용자에게 전달한다.

1. **신규 가입 — 건너뛰기 경로**: 가입 → BasicInfo → TravelImport에서 '건너뛰기' → **동의 화면이 뜬다** → 체크 없이 [계속] → 메인 진입 + 코치마크가 뜬다
2. **신규 가입 — 가져오기 경로**: TravelImport에서 가져오기 → ImportComplete → DNA 설문 → 결과 '완료' → **동의 화면이 뜬다**
3. **DNA 설문 건너뛰기 경로**: 설문에서 나가기 → **동의 화면이 뜬다**
4. **프로필 진입은 영향 없음**: 기존 계정으로 프로필 > '과거 여행 불러오기' → 건너뛰기 → **동의 화면이 뜨지 않고** 프로필로 복귀한다
5. **배너**: 유예(`null`) 계정으로 소셜 탭 → 배너가 보임 → [사용 안 함] → 사라짐 → 앱 재시작해도 안 뜸
6. **배너 닫기**: 다른 유예 계정에서 ✕ → 사라짐 → 앱 재시작해도 7일간 안 뜸
7. **설정 토글 연동**: 설정 > 계정의 토글이 위에서 고른 값과 일치한다

---

## Self-Review

**스펙 커버리지**

| 스펙 요구 | 태스크 |
|---|---|
| 온보딩 동의 화면(기본 꺼짐, 계속 버튼) | Task 3 |
| 온보딩 종점 3곳 연결 + `fromProfile` 예외 | Task 4 |
| 저장 실패해도 온보딩 진행 | Task 3 Step 2 (`finish`) |
| `startTutorial: true` 유지 | Task 3 Step 2, Task 4 |
| 재동의 배너(소셜 최상단, null일 때만) | Task 5 |
| 닫기 → 7일 뒤 재노출 | Task 2 + Task 5 (`REASK_AFTER_MS`) |
| 서버 작업 없음 | 전 태스크 — 서버 파일 미변경 |
| i18n ko/en 양쪽 | Task 1 |
| 가드 규칙 7·10 준수 | Task 3 Step 5, Task 5 Step 3 |

누락 없음.

**플레이스홀더**: 없음. 모든 코드 단계에 실제 코드가 들어 있다.

**타입 일관성**: `saveMateRecoOptin(optin: boolean): Promise<boolean>`, `fetchMateRecoOptin(): Promise<boolean | null>` — Task 3·5에서 같은 시그니처로 쓴다. `mateRecoAskedAt: number` / `setMateRecoAskedAt: (v: number) => void` — Task 2에서 정의하고 Task 5에서 같은 이름으로 쓴다. 라우트 이름 `MateRecoConsent` — Task 3에서 등록하고 Task 4에서 같은 문자열로 참조한다.
