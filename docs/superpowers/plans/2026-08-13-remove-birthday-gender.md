# 생년월일·성별 수집 폐지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App Store 5.1.1(v) 거절 대응 — 생년월일·성별 수집을 완전히 없애고, 만 14세 확인 체크박스와 `onboarded_at` 컬럼으로 대체한다.

**Architecture:** `birthday` 가 온보딩 완료 신호를 겸하고 있어 단순 삭제가 불가능하다. 먼저 서버에 `profiles.onboarded_at` 을 신설·백필하고, 판정 3곳을 갈아탄 뒤에야 두 컬럼과 클라이언트 코드를 지운다. 성별은 앱에서 완전히 사라지지만 행사(`event_participants`)는 별개 테이블이라 손대지 않는다.

**Tech Stack:** React Native (Expo, 새 아키텍처/Fabric), TypeScript, React Navigation, react-i18next, Supabase/PostgreSQL.

## Global Constraints

- **`<Text>`/`<TextInput>` 은 반드시 `../ui/Text` 에서 import.** `react-native` 직접 import는 정적 가드 규칙 7이 실패시킨다.
- **버튼 라벨 `<Text>` 에는 `{...andFitText}` 를 스프레드**한다(`../utils/fitText`). 규칙 10이 강제한다.
- **320dp를 넘는 고정 폭 금지**(규칙 4).
- **문구는 i18n 키로만** 쓴다. `src/i18n/locales/ko.ts` 와 `en.ts` 양쪽. 하드코딩 금지.
- 디자인 토큰: 배경 `#0A0A0F`, 카드 `#2E2E3B`, 보라 네온 `#BF85FC`, 텍스트 흐림 `#A1A1B0`, 구분선 `#1A1A26`.
- **`event_participants` 의 `gender`·`gender_pref` 는 절대 건드리지 않는다.** 별도 테이블이고 행사 매칭에 실제로 쓰인다.
- 각 태스크 끝에 `npx tsc --noEmit` 과 `node scripts/layout-parity.verify.mjs` 가 통과해야 한다.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `supabase/schema.sql` (수정) | `onboarded_at` 신설·백필, 두 컬럼 drop, grant 목록 정리 |
| `src/services/profile.ts` (수정) | `ProfileRow` 타입에서 두 필드 제거, `onboarded_at` 추가, 온보딩 완료 기록 함수 |
| `src/store/settingsStore.tsx` (수정) | `birthday`·`gender` 상태 전면 제거, `Gender` 타입 삭제 |
| `src/screens/BasicInfoScreen.tsx` (수정) | 두 입력칸 삭제, 연령 확인 체크박스 신설 |
| `src/screens/SplashScreen.tsx`, `LoginScreen.tsx` (수정) | 온보딩 완료 판정을 `onboarded_at` 으로 |
| `src/screens/AccountSettingsScreen.tsx` (수정) | 생일·성별 행·모달 제거 |
| `src/components/ProfileSync.tsx`, `src/hooks/useAccountBoundary.ts` (수정) | 두 필드 동기화 제거 |
| `src/i18n/locales/ko.ts`, `en.ts` (수정) | 연령 확인 문구 추가, 죽은 키 제거 |
| `docs/privacy-policy.{md,html}`, `privacy-policy-en.html`, `docs/notices.json` (수정) | 방침 개정 + 앱 공지 |

**태스크 순서가 load-bearing이다.** 서버(Task 1) → 판정 교체(Task 2) → 화면(Task 3~5) → 문서(Task 6). 순서를 바꾸면 중간 상태에서 기존 이용자가 온보딩으로 되돌아간다.

---

## Task 1: 서버 — `onboarded_at` 신설·백필·두 컬럼 drop

**Files:**
- Modify: `supabase/schema.sql` (3곳: 37-38행 컬럼 정의, 161행 grant, 166행 주석)

**Interfaces:**
- Consumes: 없음
- Produces: `profiles.onboarded_at timestamptz`(null 허용). `profiles.birthday`·`profiles.gender` 는 더 이상 존재하지 않는다.

- [ ] **Step 1: 컬럼 정의에서 두 줄 삭제**

`supabase/schema.sql` 의 `create table ... profiles` 안에서 아래 두 줄을 지운다:
```sql
  birthday      date,
  gender        text,
```

- [ ] **Step 2: `onboarded_at` 신설 + 백필 + drop 블록 추가**

`profiles` 테이블 정의 바로 다음, 다른 `alter table public.profiles add column if not exists ...` 들이 모여 있는 자리에 넣는다:

```sql
-- (2026-08-13) 온보딩 완료 신호. 그전에는 birthday 유무로 판정했는데,
-- App Store 5.1.1(v) 지적으로 생년월일 수집을 폐지하면서 전용 컬럼으로 옮겼다.
alter table public.profiles add column if not exists onboarded_at timestamptz;

-- 백필: birthday 가 있으면 이미 온보딩을 마친 사람이다.
-- ⚠️ 아래 drop 보다 반드시 먼저 실행돼야 한다. 순서가 뒤집히면 기존 이용자 전원이
--    온보딩을 다시 밟는다. (birthday 컬럼이 이미 없는 재실행에서는 do 블록이 조용히 넘어간다)
do $backfill$ begin
  update public.profiles
     set onboarded_at = coalesce(onboarded_at, created_at)
   where birthday is not null and onboarded_at is null;
exception when undefined_column then null; -- 이미 drop된 재실행
end $backfill$;

-- App Store 5.1.1(v): 앱 기능에 쓰지 않는 개인정보는 수집하지 않는다.
-- 성별은 행사(event_participants)에서만 쓰고 그건 별도 테이블이다.
alter table public.profiles drop column if exists birthday;
alter table public.profiles drop column if exists gender;
```

- [ ] **Step 3: `grant update` 목록에서 두 컬럼 제거**

현재 `schema.sql:161` 근처:
```sql
grant update (id, handle, emoji, bio, birthday, gender, profile_photo,
```
`birthday, gender, ` 를 지운다. **이걸 빠뜨리면 drop 이후 재실행이 "column does not exist" 로 죽는다.**

같은 목록에 `onboarded_at` 을 추가한다 — 클라이언트가 온보딩 완료를 직접 기록해야 하므로 update 권한이 필요하다.

- [ ] **Step 4: 166행 주석 갱신**

`-- birthday·gender 같은 PII를 빼고 이 뷰로 타인 프로필을 조회한다.` →
`-- PII를 빼고 이 뷰로 타인 프로필을 조회한다.`

- [ ] **Step 5: 잔여 참조 확인**

Run:
```bash
grep -n "birthday\|[^_]gender" supabase/schema.sql | grep -v event_participants
```
Expected: 위에서 새로 넣은 백필/drop 블록의 주석·SQL만 보이고, `profiles` 를 읽거나 쓰는 다른 구문은 없어야 한다. `event_participants` 의 `gender`/`gender_pref` 는 제외되어 안 나온다.

- [ ] **Step 6: 커밋**

```bash
git add supabase/schema.sql
git commit -m "feat(schema): onboarded_at 신설·백필 후 birthday·gender 컬럼 삭제

App Store 5.1.1(v) — 앱 기능에 쓰지 않는 개인정보 수집 폐지.
birthday가 온보딩 완료 신호를 겸하고 있어 전용 컬럼으로 먼저 옮긴다.
백필은 drop보다 먼저 실행돼야 한다(순서가 뒤집히면 기존 이용자가 온보딩을 다시 밟는다)."
```

> **이 SQL은 사용자가 콘솔에서 실행한다.** 실행 대상은 **운영·테스트 두 프로젝트 모두**다.
> 테스트용은 `node scripts/make-test-schema.mjs bqwmxxhtsvfuyywfuswo <테스트anon키>` 로 만든
> `supabase/test-schema.local.sql` 을 쓰고, 맨 위 오실행 가드 `do $guard$ ... end $guard$;` 블록을
> 지운 뒤 실행해야 한다(계정이 하나라도 있으면 그 가드가 정상 재실행까지 막는다).

---

## Task 2: 온보딩 완료 판정을 `onboarded_at` 으로 교체

**Files:**
- Modify: `src/services/profile.ts` (`ProfileRow` 타입 + 신규 함수)
- Modify: `src/store/settingsStore.tsx` (로컬 신호 필드)
- Modify: `src/screens/SplashScreen.tsx` (3곳)
- Modify: `src/screens/LoginScreen.tsx` (2곳)

**Interfaces:**
- Consumes: Task 1의 `profiles.onboarded_at`
- Produces:
  - `ProfileRow` 에 `onboarded_at: string | null`, `birthday`/`gender` 필드 없음
  - `markOnboarded(): Promise<boolean>` (`src/services/profile.ts`) — 서버에 완료 시각 기록
  - `useSettings()` 에 `onboardedAt: number`(ms, `0`=미완료)와 `setOnboardedAt: (v: number) => void`

- [ ] **Step 1: `ProfileRow` 타입 교체**

`src/services/profile.ts` 의 `ProfileRow` 에서 두 줄을 지우고 한 줄을 넣는다:
```ts
  birthday: string | null; // YYYY-MM-DD   ← 삭제
  gender: string | null;                    ← 삭제
```
```ts
  onboarded_at: string | null; // 온보딩 완료 시각(ISO). null=미완료 — 예전 birthday 역할을 대신한다
```

- [ ] **Step 2: `markOnboarded()` 추가**

`saveMateRecoOptin` 아래에 같은 형태로 넣는다(기존 함수들의 try/catch·withTimeout 관례를 그대로 따른다):

```ts
/**
 * 온보딩 완료를 서버에 기록한다. 이 값이 있으면 다음 실행부터 Main으로 바로 간다.
 *
 * 예전에는 birthday 유무로 판정했으나 App Store 5.1.1(v) 지적으로 생년월일 수집을
 * 폐지하면서 전용 컬럼으로 옮겼다.
 *
 * ⚠️ update 가 아니라 upsertMyProfile 을 쓴다. handle_new_user 트리거가 지연되면
 *    profiles 행이 아직 없을 수 있는데(schema.sql:879 주석이 그 사례를 적고 있다),
 *    update 는 그때 0행을 갱신하고도 error 없이 성공을 반환한다. 그러면 서버에 값이
 *    남지 않아 다음 실행에 사용자가 온보딩으로 되돌아간다. upsert 는 행을 만들어 준다.
 */
export async function markOnboarded(): Promise<boolean> {
  const { ok } = await upsertMyProfile({ onboarded_at: new Date().toISOString() });
  return ok;
}
```

- [ ] **Step 3: `settingsStore` 에 로컬 신호 추가**

오프라인 폴백용이다. `lastSeenNoticeAt` 이 배선된 것과 **같은 7곳**에 평행하게 넣는다 (인터페이스, 영속 타입, useState, hydrate, 저장 payload 객체, 저장 deps 배열, context value). 계정 초기화(`resetSettings`)에서는 **`keepIdentity` 와 무관하게 0으로 지운다** — 다른 계정의 온보딩 완료를 물려받으면 안 된다.

```ts
  onboardedAt: number;
  setOnboardedAt: (v: number) => void;
```
```ts
  onboardedAt?: number;   // 온보딩 완료 시각(ms). 0=미완료. 오프라인 판정용 로컬 사본
```
```ts
  const [onboardedAt, setOnboardedAt] = useState(0);
```
```ts
      setOnboardedAt(typeof p.onboardedAt === 'number' ? p.onboardedAt : 0);
```

- [ ] **Step 4: `SplashScreen` 판정 3곳 교체**

`birthdayRef` 를 `onboardedAtRef` 로 바꾼다. 세 곳 모두:

`:55-59` 부근
```ts
  const { resetSettings, onboardedAt } = useSettings();
  const onboardedAtRef = useRef(onboardedAt);
  onboardedAtRef.current = onboardedAt;
```

`:85-88` 오프라인 분기
```ts
          // 온라인 분기와 같은 기준(로컬 onboardedAt = 온보딩 완료 신호)으로 판정한다.
          // 생략하면 온보딩 중 이탈한 사용자가 비행기모드로 앱을 켜는 것만으로 Main에 들어간다.
          return onboardedAtRef.current > 0 ? 'Main' : 'BasicInfo';
```

`:115` 온라인 분기
```ts
            onboarded = !!(profile && profile.onboarded_at);
```

`:133-136` 타임아웃 폴백
```ts
      const fallback = (): 'Main' | 'BasicInfo' | 'AppIntro' => {
        if (!sessionSeen) return 'AppIntro';
        return onboardedAtRef.current > 0 ? 'Main' : 'BasicInfo';
      };
```

- [ ] **Step 5: `LoginScreen` 판정 2곳 교체**

`:236`
```ts
      if (status.profile && status.profile.onboarded_at) dest = 'Main';
```
`:488`
```ts
        destination = status.profile?.onboarded_at ? 'Main' : 'BasicInfo';
```

- [ ] **Step 6: 타입체크로 잔여 참조 확인**

Run: `npx tsc --noEmit`
Expected: `profile.birthday` 를 읽던 곳이 남아 있으면 여기서 잡힌다. 0오류가 될 때까지 고친다.

- [ ] **Step 7: 커밋**

```bash
git add src/services/profile.ts src/store/settingsStore.tsx src/screens/SplashScreen.tsx src/screens/LoginScreen.tsx
git commit -m "feat(onboarding): 완료 판정을 birthday에서 onboarded_at으로 교체

Splash 3곳·Login 2곳. 오프라인 폴백용 로컬 사본(settingsStore.onboardedAt)도 함께 둔다.
생년월일 삭제(다음 커밋)의 전제 작업이다."
```

---

## Task 3: 온보딩 화면 — 두 입력칸 삭제, 연령 확인 체크박스 신설

**Files:**
- Modify: `src/i18n/locales/ko.ts`, `src/i18n/locales/en.ts`
- Modify: `src/screens/BasicInfoScreen.tsx`

**Interfaces:**
- Consumes: Task 2의 `markOnboarded()`, `setOnboardedAt`
- Produces: 없음 (화면 내부 변경)

- [ ] **Step 1: i18n 키 추가**

`basicInfo` 블록에 넣는다. ko:
```ts
    ageConfirm: '만 14세 이상입니다',
    ageConfirmHint: '만 14세 미만은 가입할 수 없습니다.',
```
en:
```ts
    ageConfirm: 'I am 14 years of age or older',
    ageConfirmHint: 'Users under 14 cannot sign up.',
```

- [ ] **Step 2: 두 입력 블록 삭제**

`BasicInfoScreen.tsx` 에서 `{/* 생일 */}` 로 시작하는 `<View style={styles.inputSection}>` 블록 전체(약 308-328행)와 `{/* 성별 */}` 블록 전체(약 330-352행)를 지운다. 그 자리에 아래 체크박스를 넣는다:

```tsx
          {/* 만 14세 확인 — 생년월일을 받지 않는 대신 자기 확인으로 연령 방어선을 유지한다
              (개인정보처리방침 제11조). App Store 5.1.1(v)로 DOB 수집을 폐지했다. */}
          <View style={styles.inputSection}>
            <TouchableOpacity
              style={styles.ageRow}
              onPress={() => setAgeConfirmed((v) => !v)}
              activeOpacity={0.8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: ageConfirmed }}
            >
              <View style={[styles.ageBox, ageConfirmed && styles.ageBoxOn]}>
                {ageConfirmed && (
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                    <SvgPath d="M20 6L9 17l-5-5" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                )}
              </View>
              <Text style={styles.ageLabel}>{t('basicInfo.ageConfirm')}</Text>
            </TouchableOpacity>
            <Text style={styles.birthdayHint}>{t('basicInfo.ageConfirmHint')}</Text>
          </View>
```

`Svg` 는 이미 import돼 있다(18-24행에 `Defs`·`LinearGradient`·`Stop`·`Rect`·`Circle` 을
같이 가져온다). **그 기존 import 블록에 `Path as SvgPath,` 한 줄만 추가**한다 — 새 import 문을
따로 만들지 말 것.

- [ ] **Step 3: 상태·검증·저장 정리**

- `const [birthday, setBirthday] = useState(...)` 와 `const [gender, setGender] = useState<Gender>(...)` 삭제 → `const [ageConfirmed, setAgeConfirmed] = useState(false);` 추가 (기본 꺼짐)
- `useSettings()` 구조분해에서 `birthday: storeBirthday, setBirthday: setStoreBirthday, gender: storeGender, setGender: setStoreGender` 삭제, `setOnboardedAt` 추가
- `import { formatBirthday, isValidBirthday, isOldEnough } from '../utils/birthday';` 삭제
- `import { useSettings, type Gender, type AppLanguage }` → `type Gender` 삭제
- 저장 함수의 `if (!isOldEnough(birthday)) { ... }` 블록을 아래로 교체:
```ts
    // 만 14세 미만 가입 차단(이용약관 제4조 2항·방침 제11조). 서버 조회 전에 먼저 막는다.
    if (!ageConfirmed) {
      Alert.alert(t('basicInfo.noticeTitle'), t('basicInfo.ageConfirmHint'));
      return;
    }
```
- `setStoreBirthday(birthday); setStoreGender(gender);` 삭제 → 그 자리에:
```ts
    // 온보딩 완료 기록 — 다음 실행부터 Main으로 바로 간다. 서버 실패해도 진행을 막지 않는다
    // (로컬 사본이 오프라인 판정을 맡고, 다음 성공한 동기화가 서버를 따라잡는다).
    setOnboardedAt(Date.now());
    markOnboarded().catch(() => {});
```
- `markOnboarded` 를 `../services/profile` 에서 import
- `canContinue` 교체:
```ts
  const canContinue = HANDLE_RE.test(handle.trim()) && ageConfirmed && (!stayOn || !!stayCountry);
```

- [ ] **Step 4: 스타일 추가·정리**

`styles` 에 추가:
```ts
  ageRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ageBox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#A1A1B0',
    alignItems: 'center', justifyContent: 'center',
  },
  ageBoxOn: { backgroundColor: '#BF85FC', borderColor: '#BF85FC' },
  ageLabel: { flex: 1, fontSize: 14, color: '#FFFFFF' },
```
`genderBtn`·`genderBtnActive`·`genderText`·`genderTextActive` 는 **언어 선택이 `styles.genderRow` 를 재사용하고 있으므로 `genderRow` 는 남긴다.** 나머지 넷은 다른 사용처가 없으면 지운다 — 지우기 전에 `grep -n "genderBtn\|genderText" src/screens/BasicInfoScreen.tsx` 로 확인할 것.

- [ ] **Step 5: 검증**

Run: `npx tsc --noEmit && node scripts/layout-parity.verify.mjs`
Expected: 둘 다 통과

- [ ] **Step 6: 커밋**

```bash
git add src/i18n/locales/ko.ts src/i18n/locales/en.ts src/screens/BasicInfoScreen.tsx
git commit -m "feat(onboarding): 생일·성별 입력 제거, 만 14세 확인 체크박스로 대체

App Store 5.1.1(v). 연령 방어선(방침 제11조)은 자기 확인 체크박스로 유지한다."
```

---

## Task 4: 설정 화면·동기화에서 두 값 제거

**Files:**
- Modify: `src/screens/AccountSettingsScreen.tsx`
- Modify: `src/components/ProfileSync.tsx`
- Modify: `src/hooks/useAccountBoundary.ts`

**Interfaces:**
- Consumes: 없음
- Produces: 없음

- [ ] **Step 1: `AccountSettingsScreen` 정리**

- `useSettings()` 구조분해에서 `birthday, setBirthday, gender, setGender` 삭제
- `genderLabel` 함수, `genderDraft` 상태, `setGenderDraft` 호출부 삭제
- 생일 편집 모달과 성별 편집 모달 JSX 블록 전체 삭제
- 설정 목록에서 `label={t('accountSettings.gender')}` 행과 생일 행 삭제
- `import { formatBirthday, isValidBirthday, isOldEnough } from '../utils/birthday';` 삭제
- `styles` 에서 `genderRow` 등 이 화면에서만 쓰던 죽은 스타일 삭제

- [ ] **Step 2: `ProfileSync` 정리**

`:17` 구조분해에서 `birthday, gender` 삭제, `:43` 의 `gender: gender || null,` 과 birthday 관련 줄 삭제, `:71` deps 배열에서 둘 다 삭제.

- [ ] **Step 3: `useAccountBoundary` 정리**

`:29` 의 `birthday,` 와 `:42` 의 `if (p.gender === 'male' || p.gender === 'female') setGender(p.gender);` 삭제. 같은 함수에서 birthday를 로컬에 되살리는 줄도 함께 삭제한다.

- [ ] **Step 4: `settingsStore` 에서 상태 자체 제거**

`src/store/settingsStore.tsx` 에서 아래를 모두 지운다(위치는 `grep -n "birthday\|gender\|Gender"` 로 확인):
- `export type Gender = 'male' | 'female' | '';` (22행)
- 인터페이스의 `birthday`/`setBirthday`/`gender`/`setGender` (73-76행)
- 영속 타입의 `birthday?`/`gender?` (209-210행)
- `useState` 두 개 (271-272행)
- hydrate 두 줄 (393-394행)
- 저장 payload 객체·deps 배열의 `birthday,`/`gender,` (494-495, 547-548행)
- `resetSettings` 의 `setGender('')`/`setBirthday('')` (622, 626행)
- 613-614행 주석에서 "온보딩 완료 신호가 birthday라" 부분을 `onboarded_at` 기준으로 갱신

- [ ] **Step 5: 죽은 i18n 키·유틸 정리**

Run:
```bash
grep -rn "basicInfo.birthday\|basicInfo.gender\|accountSettings.gender" src/ | grep -v locales
```
Expected: 출력 없음. 그러면 `ko.ts`/`en.ts` 에서 해당 키들을 지운다.

`src/utils/birthday.ts` 를 쓰는 곳이 남았는지 확인:
```bash
grep -rn "utils/birthday" src/
```
출력이 없으면 파일을 삭제한다.

- [ ] **Step 6: 검증**

Run: `npx tsc --noEmit && node scripts/layout-parity.verify.mjs && npx expo lint 2>&1 | tail -3`
Expected: typecheck 0오류, 가드 통과, lint **에러 0**(경고는 기존 수준 ~269)

- [ ] **Step 7: 커밋**

```bash
git add src/screens/AccountSettingsScreen.tsx src/components/ProfileSync.tsx src/hooks/useAccountBoundary.ts src/store/settingsStore.tsx src/i18n/locales/ko.ts src/i18n/locales/en.ts
git commit -m "refactor: 생일·성별을 앱 전역에서 제거

설정 화면·프로필 동기화·계정 경계·로컬 스토어. 기기에 PII를 남기지 않는다."
```

---

## Task 5: 개인정보처리방침 개정 — 8/19분과 병합

**Files:**
- Modify: `docs/privacy-policy.md`
- Modify: `docs/privacy-policy.html`
- Modify: `docs/privacy-policy-en.html`
- Modify: `docs/notices.json`
- Modify: `docs/.published.json` (게시 후 자동 갱신)

**Interfaces:**
- Consumes: 없음
- Produces: 없음

시행 전인 8/19 개정(메이트 추천 활용 명시)에 이번 내용을 합친다. **공고일 2026-08-13 / 시행일 2026-08-20.**

- [ ] **Step 1: 시행일을 3본 모두 2026-08-20 으로**

- `privacy-policy.md`: 헤더 표의 `| 시행일 | 2026-08-19 |`, 본문 `**시행일: 2026-08-19**`, 하단 `**공고일: 2026-08-12 / 시행일: 2026-08-19**` → 각각 `2026-08-20`, 공고일은 `2026-08-13`
- `privacy-policy.html`: `<p class="meta">시행일: 2026년 8월 19일</p>` → `8월 20일`, 하단 `공고일: 2026년 8월 12일 / 시행일: 2026년 8월 19일` → `8월 13일 / 8월 20일`
- `privacy-policy-en.html`: `Effective date: August 19, 2026` → `August 20, 2026`, `Announced: August 12, 2026 / Effective: August 19, 2026` → `August 13, 2026 / August 20, 2026`

- [ ] **Step 2: 제1장 2) 프로필에서 생년월일·성별 삭제**

3본 모두에서 프로필 수집 항목 중 생년월일·성별에 해당하는 항목을 지운다. 남는 항목(아이디·이모지·소개·프로필 사진·거주 국가 등)은 그대로 둔다.

- [ ] **Step 3: 제11조 개정**

`privacy-policy.md` 제11조 본문에 한 문장을 추가한다:
```
가입 시 만 14세 이상임을 확인받으며, **생년월일은 수집하지 않습니다.**
```
`privacy-policy.html` 은 `<p>` 로, `privacy-policy-en.html` 은 다음 문장으로:
```
At sign-up we ask you to confirm that you are 14 or older; we do not collect your date of birth.
```

- [ ] **Step 4: 개정 이력을 한 항목으로 병합**

기존 `2026-08-19:` 항목을 `2026-08-20:` 으로 바꾸고, 뒤에 이번 내용을 이어 붙인다. md 예시:
```
- 2026-08-20: 메이트 추천에 **방문한 나라·도시 이름**이 이용된다는 점을 명시(제1장 4, 제2장)하고 이를 **거부할 수 있는 선택 동의**를 신설(제7장). 아울러 **생년월일·성별 수집을 폐지**하여 제1장 2)의 수집 항목에서 삭제하고, 제11조에 만 14세 이상 확인 방식과 생년월일 미수집을 명시.
```
html 2본에도 같은 내용을 `<li>` 로 반영한다.

- [ ] **Step 5: 앱 내 공지 교체**

`docs/notices.json` 에서 `"id": "2026-08-19-privacy"` 항목을 **통째로 지우고** 아래를 그 자리에 넣는다. (평소엔 id를 바꾸지 않지만, 공지 **내용이 실질적으로 바뀌었으므로 다시 읽혀야 한다.**)

```json
    {
      "id": "2026-08-20-privacy",
      "kind": "privacy",
      "title": "개인정보처리방침 개정 안내",
      "titleEn": "Privacy Policy update",
      "publishedAt": "2026-08-13",
      "effectiveDate": "2026-08-20",
      "body": "개인정보처리방침이 2026년 8월 20일부터 개정됩니다.\n\n수집 항목이 줄어듭니다\n· 생년월일과 성별을 더 이상 수집하지 않습니다. 이미 저장돼 있던 값도 모두 삭제했습니다.\n· 가입 시에는 만 14세 이상인지만 확인합니다.\n\n메이트 추천 관련 안내\n· 메이트 추천에 이용자가 방문한 나라·도시 이름이 사용된다는 점을 명시했습니다. 사진·글·날짜는 사용하지 않습니다.\n· 기록의 공개 범위를 '메이트만'으로 설정한 경우에도 방문한 나라·도시 이름은 메이트가 아닌 이용자의 추천 계산에 이용되고 있었습니다. 이 처리를 방침에 정확히 반영했습니다.\n· 같은 곳을 방문한 이용자가 적으면 이름을 표시하지 않아, 추천 결과로 개인을 특정할 수 없게 처리합니다.\n\n새로 생긴 권리\n· 설정 > 계정에서 '메이트 추천에 내 여행 기록 사용'을 끌 수 있습니다. 끄더라도 다른 기능은 그대로 이용할 수 있습니다.\n\n전문은 설정 > 개인정보처리방침에서 확인하실 수 있습니다.",
      "bodyEn": "Our Privacy Policy will be updated on August 20, 2026.\n\nWe collect less than before\n· We no longer collect your date of birth or gender. Values already stored have been deleted.\n· At sign-up we only ask you to confirm that you are 14 or older.\n\nAbout mate suggestions\n· Clarified that the names of countries and cities you have visited are used to compute mate suggestions. Photos, post text, and dates are not used.\n· Even when a record's visibility was set to \"mates only,\" those place names were already being used to compute suggestions for users who are not your mates. The policy now states this accurately.\n· Where few users have visited the same place, names are withheld so individuals cannot be identified from suggestion results.\n\nNew control\n· In Settings > Account you can turn off \"Use my travel records for mate suggestions.\" Turning it off does not restrict your use of any other feature.\n\nYou can read the full text in Settings > Privacy Policy."
    },
```

- [ ] **Step 6: 정합성 검사**

Run: `node scripts/check-docs-sync.mjs`
Expected: `privacy-policy`·`privacy-policy-en` 시행일이 **모두 2026-08-20** 으로 일치, `notices.json` 파싱 성공, 게시 대기 경고만 남음

- [ ] **Step 7: 커밋 후 게시**

```bash
git add docs/privacy-policy.md docs/privacy-policy.html docs/privacy-policy-en.html docs/notices.json
git commit -m "docs(privacy): 생년월일·성별 수집 폐지 반영 — 8/19 개정분과 병합, 시행 2026-08-20"
npm run pages:publish
git add docs/.published.json
git commit -m "chore(pages): 방침 개정 게시 지문 갱신"
```

- [ ] **Step 8: 게시 확인**

Run: `node scripts/check-docs-sync.mjs`
Expected: `✓ 게시본과 일치 (7개 파일)`

---

## Task 6: 전체 검증

**Files:** 없음(검증만)

**Interfaces:**
- Consumes: Task 1~5 전부
- Produces: 없음

- [ ] **Step 1: 전 검사**

Run: `npx tsc --noEmit && node scripts/layout-parity.verify.mjs && npm test`
Expected: typecheck 0오류, 가드 10규칙 통과, `npm test` 는 행사 가드 1건(`.env` 가 테스트 프로젝트를 가리키는 동안 발생하는 기존 실패)을 제외하고 통과

- [ ] **Step 2: 잔여 참조 전수 확인**

Run:
```bash
grep -rn "birthday\|Birthday" src/ | grep -v locales
grep -rn "[^_]gender\|Gender" src/ | grep -v locales | grep -v event
```
Expected: 둘 다 출력 없음. 남아 있으면 지운다.

- [ ] **Step 3: 커밋(위 단계에서 고친 게 있을 때만)**

```bash
git add -A && git commit -m "chore: 생일·성별 잔여 참조 정리"
```

- [ ] **Step 4: 수동 확인 항목 (실행자는 사용자에게 전달한다)**

1. **신규 가입**: 체크박스를 안 누르면 `[다음]` 이 **비활성**. 누르면 활성 → 진행됨
2. **온보딩 화면에 생일·성별 입력칸이 없다**
3. **기존 계정 재실행**: 앱을 껐다 켜도 `BasicInfo` 로 돌아가지 않고 Main으로 간다 ← 백필이 제대로 됐는지 보는 결정적 항목
4. **오프라인 재실행**: 비행기모드로 켜도 Main으로 간다(로컬 `onboardedAt`)
5. **설정 > 계정**: 생일·성별 행이 없다
6. **온보딩 중 이탈 후 재실행**: `BasicInfo` 로 돌아온다(완료 기록이 없으므로)

---

## Self-Review

**스펙 커버리지**

| 스펙 요구 | 태스크 |
|---|---|
| `onboarded_at` 신설 + 백필(drop보다 먼저) | Task 1 Step 2 |
| `birthday`·`gender` 컬럼 drop | Task 1 Step 2 |
| `grant update` 목록 정리 | Task 1 Step 3 |
| 온보딩 화면에서 두 입력 제거 | Task 3 Step 2·3 |
| 만 14세 확인 체크박스(필수, 기본 꺼짐) | Task 3 Step 2·3 |
| 완료 판정 교체 (Splash 3·Login 2) | Task 2 Step 4·5 |
| 로컬 폴백 교체 | Task 2 Step 3·4 |
| 설정 화면에서 제거 | Task 4 Step 1 |
| 로컬 상태(settingsStore) 제거 | Task 4 Step 4 |
| ProfileSync·useAccountBoundary 정리 | Task 4 Step 2·3 |
| 방침 3본 개정 + 8/19분 병합 | Task 5 Step 1~4 |
| 앱 공지 id 새로 발급 | Task 5 Step 5 |
| 게시 | Task 5 Step 7·8 |
| `event_participants` 불변 | Task 1 Step 5 검증에서 확인 |

누락 없음. 스펙 §6-1(ASC 데이터 수집 신고·심사 메모)과 §7(재빌드·재제출)은 **코드 작업이 아니라 콘솔 작업**이므로 태스크가 아니라 아래 "구현 후 사람이 할 일"로 옮겼다.

**플레이스홀더**: 없음.

**타입 일관성**: `markOnboarded(): Promise<boolean>` — Task 2에서 정의, Task 3에서 같은 이름으로 호출. `onboardedAt: number` / `setOnboardedAt: (v: number) => void` — Task 2에서 정의, Task 3에서 사용. `ProfileRow.onboarded_at: string | null` — Task 2에서 정의, 같은 태스크의 Splash/Login에서 사용.

---

## 구현 후 사람이 할 일 (코드 아님)

1. **SQL 실행** — `supabase/schema.sql` 을 **운영**에, `make-test-schema.mjs` 생성물을 **테스트**에.
   백필과 drop이 한 실행 안에 있어야 한다.
2. **App Store Connect > 앱 개인정보** — 성별·생년월일을 **수집 안 함**으로 내린다.
   방침과 어긋나면 같은 5.1.1 조항으로 재거절될 수 있다.
3. **재빌드·재제출** — `eas build --profile production --platform ios` → `eas submit`.
   심사 메모에 "Guideline 5.1.1(v) 지적에 따라 성별·생년월일 수집을 완전히 제거하고 연령 확인
   체크박스로 대체했다"를 적는다. **OTA로는 심사가 안 된다.**
