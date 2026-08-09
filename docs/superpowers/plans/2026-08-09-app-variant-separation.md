# 정식앱·테스트앱 분리(APP_VARIANT) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정식앱은 한 글자도 안 바뀐 채, `APP_VARIANT` 환경변수로 베타(TestFlight 별도 앱)·dev 빌드가 다른 번들 ID·스킴·Supabase(테스트 프로젝트)를 쓰게 한다.

**Architecture:** `app.json`은 정식의 진실로 그대로 두고, `app.config.js`가 그것을 받아 변형에서만 이름·번들·스킴·AdMob·`extra.appVariant`를 덮어쓴다. 코드는 `src/utils/appVariant.ts` 하나로 변형·스킴을 읽고, 스킴 리터럴(appLinks 5곳·auth 3곳)과 AppNavigator 정규식 3곳, 구글 클라이언트 ID 2곳이 그것을 쓴다. Supabase 분리는 EAS 환경변수(preview/development)로만 이뤄진다.

**Tech Stack:** Expo SDK 54(app.config.js dynamic config), expo-constants, EAS Build/Update/Env, Supabase.

## Global Constraints

- **G1(정식 불변):** `APP_VARIANT` 미설정 시 `npx expo config --json` 산출이 전환 전과 **완전 동일**해야 한다. 다르면 커밋 금지.
- **G2(정식 OAuth 보존):** production 변형에서 스킴 해석값은 정확히 `'eorth'`. 코드 폴백도 `'eorth'`.
- 스펙 값(그대로 사용): 베타 이름 `eOrth β`·번들 `com.yunjunsang.eorth.beta`·스킴 `eorthbeta` / dev 이름 `eOrth Dev`·번들 `com.yunjunsang.eorth.dev`·스킴 `eorthdev`.
- AdMob 데모 앱 ID: iOS `ca-app-pub-3940256099942544~1458002511`, Android `ca-app-pub-3940256099942544~3347511713`.
- 운영 하드코딩 값(치환·분기 기준): 프로젝트 ref `blweolnunmsxgztmvzfd`, 구글 웹 클라이언트 `589120466593-6uh5al0l88vkg72i78bdjhdcdurbseln.apps.googleusercontent.com`, 구글 iOS 클라이언트 `589120466593-ak8p39reoek66ksrrqrg2790kohju0a4.apps.googleusercontent.com`.
- 이 저장소 검증 명령: `npx tsc --noEmit` (테스트 프레임워크 없음 — 검증은 tsc + 스크립트 단언 + grep).
- 커밋 메시지 끝: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: 변형 유틸 + 스킴·구글 ID 리터럴 제거

**Files:**
- Create: `src/utils/appVariant.ts`
- Modify: `src/utils/appLinks.ts:10-19` (링크 생성 2 + 정규식 3)
- Modify: `src/services/auth.ts:147,150,225` (makeRedirectUri 3곳), `:266-267` (구글 ID 2곳), `signInWithGoogleNative` 시작부(웹 폴백 가드)
- Modify: `src/navigation/AppNavigator.tsx:105,119,143` (스킴 정규식 3곳)

**Interfaces:**
- Produces: `APP_VARIANT: 'production' | 'beta' | 'development'`, `APP_SCHEME: string` — 이후 태스크·향후 코드가 변형 판별에 쓰는 유일한 창구.
- Consumes: `Constants.expoConfig.extra.appVariant`(Task 2의 app.config.js가 변형 빌드에만 주입, 정식엔 필드 없음)과 `Constants.expoConfig.scheme`.

- [ ] **Step 1: `src/utils/appVariant.ts` 생성**

```ts
// 앱 변형(정식/베타/개발) 식별 — app.config.js가 '변형 빌드에만' extra.appVariant를 넣는다.
// 정식 빌드에는 필드 자체가 없다(설정 불변 원칙 G1) → 부재 = 'production'.
import Constants from 'expo-constants';

export type AppVariant = 'production' | 'beta' | 'development';

const rawVariant = (Constants.expoConfig?.extra as { appVariant?: string } | undefined)?.appVariant;
export const APP_VARIANT: AppVariant =
  rawVariant === 'beta' || rawVariant === 'development' ? rawVariant : 'production';

// 딥링크 스킴 — app config의 scheme을 그대로 읽는다(정식 'eorth'·베타 'eorthbeta'·dev 'eorthdev').
// scheme은 string | string[]일 수 있고, 어떤 이유로든 비면 정식 값 폴백(G2).
const rawScheme = Constants.expoConfig?.scheme;
export const APP_SCHEME: string = (Array.isArray(rawScheme) ? rawScheme[0] : rawScheme) || 'eorth';
```

- [ ] **Step 2: `appLinks.ts` 스킴 리터럴 5곳 교체**

10~19행의 상수·정규식을 다음으로 교체(스킴이 [a-z]뿐이라 이스케이프 불필요, 정식에서 기존 리터럴과 동일 패턴이 된다):

```ts
import { APP_SCHEME } from './appVariant';

// 생성 스킴은 반드시 소문자 — 안드로이드 인텐트 필터는 스킴 대소문자를 구분한다.
// 변형(베타 eorthbeta://)은 자기 스킴으로 만들고 판다 — DB가 분리돼 정식과 상호작용이 없다.
export const profileLink = (handle: string) => `${APP_SCHEME}://profile/${encodeURIComponent(handle)}`;
export const postLink = (id: string) => `${APP_SCHEME}://post/${encodeURIComponent(id)}`;

// 파싱은 대소문자 무관 + 구형식 호환: <scheme>://user/<handle>(QR·구버전 공유) 포함.
const PROFILE_RE = new RegExp(`${APP_SCHEME}:\\/\\/(?:profile|user)\\/([^\\s/?#]+)`, 'i');
const POST_RE = new RegExp(`${APP_SCHEME}:\\/\\/post\\/([^\\s/?#]+)`, 'i');

// 메시지 본문에서 앱 링크 구간을 분리하기 위한 split용(캡처 그룹 필수)
export const APP_LINK_SPLIT_RE = new RegExp(`(${APP_SCHEME}:\\/\\/(?:profile|user|post)\\/\\S+)`, 'gi');
```

- [ ] **Step 3: `auth.ts` 스킴 3곳 + 구글 ID 2곳 + 웹 폴백 가드**

import 추가: `import { APP_SCHEME, APP_VARIANT } from '../utils/appVariant';`

147·150·225행의 `{ scheme: 'eorth', ... }` 3곳을 `{ scheme: APP_SCHEME, ... }`로.

266-267행 상수를 변형 분기로 교체:

```ts
// 정식은 기존 값 고정(G2). 변형은 EAS env로 주입 — 발급 전(빈 값)엔 네이티브를 건너뛰고
// 웹 OAuth 폴백을 타므로 콘솔 작업이 끝나지 않아도 로그인이 막히지 않는다.
const GOOGLE_WEB_CLIENT_ID = APP_VARIANT === 'production'
  ? '589120466593-6uh5al0l88vkg72i78bdjhdcdurbseln.apps.googleusercontent.com'
  : process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const GOOGLE_IOS_CLIENT_ID = APP_VARIANT === 'production'
  ? '589120466593-ak8p39reoek66ksrrqrg2790kohju0a4.apps.googleusercontent.com'
  : process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
```

`signInWithGoogleNative` 시작부(기존 iOS 분기 위)에 웹 클라이언트 부재 가드 추가:

```ts
  // 변형에서 웹 클라이언트 미발급(빈 값) — 네이티브 SDK 구성 자체가 불가능하므로 웹 OAuth로.
  if (!GOOGLE_WEB_CLIENT_ID) {
    return signInWithProviderWeb('google', i18n.t('authErr.googleFallbackFailed'));
  }
```

- [ ] **Step 4: `AppNavigator.tsx` 정규식 3곳 교체**

import 추가: `import { APP_SCHEME } from '../utils/appVariant';`

컴포넌트 밖(모듈 스코프)에 상수 3개를 만들고 105·119·143행이 쓰게 한다:

```ts
// 인증 딥링크 판별 — 변형 스킴(eorthbeta:// 등)에서도 동작해야 한다(리터럴이면 베타에서 인증 링크 무반응)
const AUTH_LINK_RE = new RegExp(`${APP_SCHEME}:\\/\\/(reset-password|email-confirm)`, 'i');
const RESET_LINK_RE = new RegExp(`${APP_SCHEME}:\\/\\/reset-password`, 'i');
const CONFIRM_LINK_RE = new RegExp(`${APP_SCHEME}:\\/\\/email-confirm`, 'i');
```

- 105행: `if (/eorth:\/\/(reset-password|email-confirm)/i.test(trimmed))` → `if (AUTH_LINK_RE.test(trimmed))`
- 119행: `if (/eorth:\/\/reset-password/i.test(trimmed))` → `if (RESET_LINK_RE.test(trimmed))`
- 143행: `if (/eorth:\/\/email-confirm/i.test(trimmed))` → `if (CONFIRM_LINK_RE.test(trimmed))`

- [ ] **Step 5: 검증**

```powershell
npx tsc --noEmit   # 오류 0
```

Grep `eorth:\/\/`(정규식·백틱 문자열)을 `src/**`에서 검색 — **코드 리터럴 잔존 0**이어야 한다(주석·appVariant.ts의 `'eorth'` 폴백만 허용). `scheme: 'eorth'`도 검색해 0건 확인.

- [ ] **Step 6: Commit**

```bash
git add src/utils/appVariant.ts src/utils/appLinks.ts src/services/auth.ts src/navigation/AppNavigator.tsx
git commit -m "feat(variant): 앱 변형 유틸 도입 — 스킴·구글 ID 리터럴을 APP_VARIANT 기반으로"
```

---

### Task 2: app.config.js (G1 게이트)

**Files:**
- Create: `app.config.js`, `scripts/snapshot-expo-config.mjs`, `scripts/assert-variant-config.mjs`
- Modify 없음 — **app.json은 그대로 둔다**(정식의 진실).

**Interfaces:**
- Consumes: 없음 (app.json을 `({ config })`로 받는다)
- Produces: 변형 빌드의 `extra.appVariant`(Task 1의 appVariant.ts가 읽음), 변형별 name/scheme/번들/AdMob.

- [ ] **Step 1: 전환 전 스냅샷 (실패 기준 확보)**

`scripts/snapshot-expo-config.mjs` 생성:

```js
// expo config 산출을 파일로 저장 — PowerShell 리다이렉트의 UTF-16/BOM 문제를 피해 node가 직접 쓴다.
// execFileSync + 인자 배열(고정 명령) — 셸 문자열 조립 없음.
// 사용법: node scripts/snapshot-expo-config.mjs <출력파일> [APP_VARIANT값]
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [, , outFile, variant] = process.argv;
if (!outFile) { console.error('사용법: node scripts/snapshot-expo-config.mjs <출력파일> [변형]'); process.exit(1); }
const env = { ...process.env };
if (variant) env.APP_VARIANT = variant; else delete env.APP_VARIANT;
// Windows에서 npx는 .cmd라 shell 없이는 최신 Node가 EINVAL을 던진다.
// 인자가 전부 고정 리터럴이라 shell:true여도 조립되는 사용자 입력이 없다.
const isWin = process.platform === 'win32';
const out = execFileSync(isWin ? 'npx.cmd' : 'npx', ['expo', 'config', '--json'], { encoding: 'utf8', env, shell: isWin });
writeFileSync(outFile, out);
console.log('저장:', outFile, out.length, 'bytes');
```

실행(전환 전 기준본 — app.config.js 생성 **전에** 반드시 먼저):

```powershell
node scripts/snapshot-expo-config.mjs "$env:TEMP\expo-config-before.json"
```

- [ ] **Step 2: `app.config.js` 생성**

```js
// 앱 변형(APP_VARIANT) 동적 설정 — app.json(정식의 진실)을 받아 '변형에서만' 덮어쓴다.
// ⚠️ G1: APP_VARIANT 미설정이면 config를 그대로 반환해야 한다(정식 산출 바이트 동일).
//    scripts/snapshot-expo-config.mjs + 비교로 검증하기 전엔 이 파일을 커밋하지 말 것.
const VARIANTS = {
  beta:        { name: 'eOrth β',   suffix: '.beta', scheme: 'eorthbeta' },
  development: { name: 'eOrth Dev', suffix: '.dev',  scheme: 'eorthdev' },
};

// AdMob 데모 앱 ID(Google 공식 샘플) — 변형은 실계정 대신 데모+테스트 유닛을 쓴다
const DEMO_ADMOB_IOS = 'ca-app-pub-3940256099942544~1458002511';
const DEMO_ADMOB_ANDROID = 'ca-app-pub-3940256099942544~3347511713';

module.exports = ({ config }) => {
  const variant = VARIANTS[process.env.APP_VARIANT];
  if (!variant) return config; // 정식(및 변수 미설정 로컬) — app.json 그대로

  return {
    ...config,
    name: variant.name,
    scheme: variant.scheme,
    ios: { ...config.ios, bundleIdentifier: config.ios.bundleIdentifier + variant.suffix },
    android: { ...config.android, package: config.android.package + variant.suffix },
    // appVariant는 변형에만 주입 — 정식 config에 필드를 추가하면 G1이 깨진다
    extra: { ...config.extra, appVariant: process.env.APP_VARIANT },
    plugins: config.plugins.map((p) => {
      if (!Array.isArray(p)) return p;
      const [name, opts] = p;
      if (name === 'react-native-google-mobile-ads') {
        return [name, { ...opts, iosAppId: DEMO_ADMOB_IOS, androidAppId: DEMO_ADMOB_ANDROID }];
      }
      // 베타 번들용 iOS 구글 클라이언트 발급 후 EAS env로 주입 — 미주입이면 정식 값 유지(무해:
      // 번들 불일치로 네이티브 로그인은 실패하고 auth.ts가 웹 OAuth로 폴백한다)
      if (name === '@react-native-google-signin/google-signin' && process.env.GOOGLE_SIGNIN_IOS_URL_SCHEME) {
        return [name, { ...opts, iosUrlScheme: process.env.GOOGLE_SIGNIN_IOS_URL_SCHEME }];
      }
      return p;
    }),
  };
};
```

- [ ] **Step 3: G1 검증 — 전환 후 산출이 기준본과 동일한가**

```powershell
node scripts/snapshot-expo-config.mjs "$env:TEMP\expo-config-after.json"
node -e "const f=require('node:fs');const a=f.readFileSync(process.env.TEMP+'/expo-config-before.json','utf8'),b=f.readFileSync(process.env.TEMP+'/expo-config-after.json','utf8');if(a!==b){console.error('G1 FAIL: 정식 config가 달라짐');process.exit(1)}console.log('G1 PASS: 완전 동일')"
```

Expected: `G1 PASS`. FAIL이면 app.config.js를 고치기 전까지 진행 금지.

- [ ] **Step 4: 변형 단언 스크립트 생성·실행**

`scripts/assert-variant-config.mjs`:

```js
// APP_VARIANT 변형 산출 단언 — G1의 반대편(변형이 실제로 달라지는가).
// execFileSync + 인자 배열(고정 명령) — 셸 문자열 조립 없음.
import { execFileSync } from 'node:child_process';

// Windows에서 npx는 .cmd라 shell 없이는 최신 Node가 EINVAL을 던진다(고정 인자라 안전).
const isWin = process.platform === 'win32';
const load = (variant) => {
  const env = { ...process.env, APP_VARIANT: variant };
  return JSON.parse(execFileSync(isWin ? 'npx.cmd' : 'npx', ['expo', 'config', '--json'], { encoding: 'utf8', env, shell: isWin }));
};
let failed = 0;
const assert = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + msg); if (!cond) failed++; };
const findPlugin = (cfg, name) => cfg.plugins.find((p) => Array.isArray(p) && p[0] === name)?.[1];

const beta = load('beta');
assert(beta.name === 'eOrth β', 'beta 이름');
assert(beta.scheme === 'eorthbeta', 'beta 스킴');
assert(beta.ios.bundleIdentifier === 'com.yunjunsang.eorth.beta', 'beta iOS 번들');
assert(beta.android.package === 'com.yunjunsang.eorth.beta', 'beta Android 패키지');
assert(beta.extra.appVariant === 'beta', 'beta extra.appVariant');
assert(findPlugin(beta, 'react-native-google-mobile-ads')?.iosAppId === 'ca-app-pub-3940256099942544~1458002511', 'beta AdMob 데모(iOS)');

const dev = load('development');
assert(dev.name === 'eOrth Dev', 'dev 이름');
assert(dev.scheme === 'eorthdev', 'dev 스킴');
assert(dev.ios.bundleIdentifier === 'com.yunjunsang.eorth.dev', 'dev iOS 번들');
assert(dev.android.package === 'com.yunjunsang.eorth.dev', 'dev Android 패키지');

console.log(failed ? `실패 ${failed}건` : '전부 통과');
process.exit(failed ? 1 : 0);
```

```powershell
node scripts/assert-variant-config.mjs
```

Expected: `전부 통과`.

- [ ] **Step 5: Commit**

```bash
git add app.config.js scripts/snapshot-expo-config.mjs scripts/assert-variant-config.mjs
git commit -m "feat(variant): app.config.js 도입 — APP_VARIANT 변형만 덮어쓰기 (G1 diff 검증 통과)"
```

---

### Task 3: eas.json 프로필 정비

**Files:**
- Modify: `eas.json` (development·preview env 추가, beta-ios→beta 개명, submit 프로필)

**Interfaces:**
- Consumes: app.config.js의 `APP_VARIANT` 해석 (Task 2)
- Produces: `eas build --profile beta|preview|development` 가 변형 앱을 빌드.

- [ ] **Step 1: eas.json 수정**

`build.development.env`에 `"APP_VARIANT": "development"`, `build.preview.env`에 `"APP_VARIANT": "beta"` 추가. `build.beta-ios`를 `build.beta`로 개명하고 env에 `"APP_VARIANT": "beta"`·기존 `"EXPO_NO_CAPABILITY_SYNC": "1"` 유지. `submit["beta-ios"]`를 `submit.beta`로 개명하되 `ascAppId`는 `"REPLACE_WITH_BETA_ASC_APP_ID"` 문구로 바꾼다(베타 앱을 ASC에 등록해야 발급되는 외부 값 — 미기입 시 submit이 시끄럽게 실패하도록 의도된 센티널). **production 빌드·submit 프로필은 한 글자도 바꾸지 않는다.** 결과 전문:

```json
{
  "cli": { "version": ">= 16.0.0", "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development",
      "environment": "development",
      "env": { "APP_VARIANT": "development" },
      "android": { "buildType": "apk" },
      "ios": { "simulator": false }
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "environment": "preview",
      "env": { "APP_VARIANT": "beta" },
      "android": { "buildType": "apk" }
    },
    "beta": {
      "channel": "preview",
      "environment": "preview",
      "distribution": "store",
      "autoIncrement": true,
      "env": { "APP_VARIANT": "beta", "EXPO_NO_CAPABILITY_SYNC": "1" }
    },
    "production": {
      "channel": "production",
      "environment": "production",
      "autoIncrement": true,
      "env": { "EXPO_NO_CAPABILITY_SYNC": "1" },
      "android": { "buildType": "app-bundle" }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "ascAppId": "6778678243",
        "ascApiKeyPath": "C:\\Users\\2023user\\OneDrive\\바탕 화면\\Important2\\AuthKey_A876QJ4G4K.p8",
        "ascApiKeyId": "A876QJ4G4K",
        "ascApiKeyIssuerId": "83d5dfe2-6ef9-44af-931b-66df3e6f46de"
      }
    },
    "beta": {
      "ios": {
        "ascAppId": "REPLACE_WITH_BETA_ASC_APP_ID",
        "ascApiKeyPath": "C:\\Users\\2023user\\OneDrive\\바탕 화면\\Important2\\AuthKey_A876QJ4G4K.p8",
        "ascApiKeyId": "A876QJ4G4K",
        "ascApiKeyIssuerId": "83d5dfe2-6ef9-44af-931b-66df3e6f46de"
      }
    }
  }
}
```

- [ ] **Step 2: 검증**

```powershell
node -e "const e=require('./eas.json');const p=e.build.production;const want={channel:'production',environment:'production',autoIncrement:true,env:{EXPO_NO_CAPABILITY_SYNC:'1'},android:{buildType:'app-bundle'}};if(JSON.stringify(p)!==JSON.stringify(want)){console.error('FAIL: production 프로필 변경됨');process.exit(1)};if(e.build['beta-ios']){console.error('FAIL: beta-ios 잔존');process.exit(1)};console.log('PASS: production 불변, beta env=',e.build.beta.env.APP_VARIANT)"
```

Expected: `PASS: production 불변, beta env= beta`

- [ ] **Step 3: Commit**

```bash
git add eas.json
git commit -m "feat(variant): eas.json — beta 프로필 신설(구 beta-ios), preview·development에 APP_VARIANT"
```

---

### Task 4: 테스트 스키마 생성 스크립트 + 콘솔 절차 문서

**Files:**
- Create: `scripts/make-test-schema.mjs`, `docs/beta-environment-setup.md`
- Modify: `.gitignore` (생성물 제외)

**Interfaces:**
- Consumes: `supabase/schema.sql` (운영 하드코딩 포함 원본)
- Produces: `supabase/test-schema.local.sql`(비추적 생성물), 콘솔 실행 절차 문서.

- [ ] **Step 1: `scripts/make-test-schema.mjs` 생성 (G3)**

```js
// 테스트 Supabase용 schema 사본 생성 — 운영 하드코딩(URL·anon 키)을 테스트 값으로 치환한다.
// 치환하지 않고 실행하면 테스트 DB의 푸시/신고 트리거가 '운영' Edge Function을 호출한다
// (send-push의 재조회 검증 덕에 실피해는 없지만 베타 푸시가 영영 안 온다 — spec G3).
// 사용법: node scripts/make-test-schema.mjs <테스트프로젝트ref> <테스트anon키>
import { readFileSync, writeFileSync } from 'node:fs';

const [, , ref, anonKey] = process.argv;
if (!ref || !anonKey) {
  console.error('사용법: node scripts/make-test-schema.mjs <테스트프로젝트ref> <테스트anon키>');
  process.exit(1);
}
const PROD_REF = 'blweolnunmsxgztmvzfd';
let sql = readFileSync('supabase/schema.sql', 'utf8');

// ① 프로젝트 URL 치환 (Edge Function 호출 트리거들)
const urlCount = (sql.match(new RegExp(PROD_REF, 'g')) ?? []).length;
if (urlCount === 0) { console.error('FAIL: 운영 ref가 스키마에 없음 — 스크립트/스키마 불일치'); process.exit(1); }
sql = sql.split(PROD_REF).join(ref);

// ② 운영 anon 키(JWT) 치환 — 'Bearer eyJ…' 형태 전부
const jwtRe = /Bearer eyJ[A-Za-z0-9_.-]+/g;
const jwtCount = (sql.match(jwtRe) ?? []).length;
if (jwtCount === 0) { console.error('FAIL: 하드코딩 anon 키를 찾지 못함'); process.exit(1); }
sql = sql.replace(jwtRe, 'Bearer ' + anonKey);

// ③ 잔존 검사
if (sql.includes(PROD_REF)) { console.error('FAIL: 운영 ref 잔존'); process.exit(1); }

writeFileSync('supabase/test-schema.local.sql', sql);
console.log(`완료: supabase/test-schema.local.sql (URL ${urlCount}곳, anon 키 ${jwtCount}곳 치환)`);
```

- [ ] **Step 2: `.gitignore`에 생성물 추가**

`.gitignore` 끝에 한 줄 추가: `supabase/test-schema.local.sql`

- [ ] **Step 3: `docs/beta-environment-setup.md` 생성**

아래 내용 그대로(코드펜스 안 명령 포함):

````markdown
# 베타 환경 셋업 절차 (콘솔 작업)

코드는 전부 준비돼 있다(APP_VARIANT). 아래는 저장소 밖 콘솔 작업의 실행 순서다.
전 과정에서 **운영 프로젝트(blweolnunmsxgztmvzfd)·정식 앱은 건드리지 않는다.**

## 1. 테스트 Supabase 프로젝트
1. supabase.com 대시보드 → New project (이름 예: eorth-test, 리전 운영과 동일 권장)
2. 새 프로젝트의 **ref**와 **anon key**(Project Settings > API) 확보
3. 스키마 사본 생성 후 SQL Editor에서 실행:
   `node scripts/make-test-schema.mjs <테스트ref> <테스트anon키>` → `supabase/test-schema.local.sql` 내용 실행
4. Edge Function 4종 배포:
   `supabase functions deploy send-push report-alert login-with-identifier delete-account --project-ref <테스트ref>`
5. Storage → `media` 버킷 생성(public) — 운영과 동일 구성
6. Authentication → URL Configuration → Redirect URLs에 `eorthbeta://auth-callback`,
   `eorthbeta://reset-password`, `eorthbeta://email-confirm`, `eorthdev://auth-callback` 추가
7. (푸시 멱등·정리 cron은 베타에선 선택 — 필요 시 SERVER-STATE.md 절차 재사용)

## 2. EAS 환경변수 (preview·development 환경을 테스트 프로젝트로)
현재 두 환경 모두 운영 값을 갖고 있다 — 교체한다:

    eas env:list --environment preview
    eas env:update --environment preview --variable-name EXPO_PUBLIC_SUPABASE_URL --value https://<테스트ref>.supabase.co
    eas env:update --environment preview --variable-name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <테스트anon키>

development 환경도 동일 2건 교체. 로컬 `expo start` 개발도 테스트를 보게 하려면 `.env`도 같은 값으로.

## 3. App Store Connect — 베타 앱 등록
1. ASC → 앱 추가: 이름 `eOrth β`, 번들 `com.yunjunsang.eorth.beta`
   (App ID·capability는 EAS가 첫 빌드에서 자동 생성·동기화가 기본 — 실패할 때만 개발자 콘솔 수동)
2. 새 앱의 **Apple ID(숫자)**를 `eas.json` submit.beta의 `REPLACE_WITH_BETA_ASC_APP_ID` 자리에 기입

## 4. Google Cloud (구글 로그인) — 나중에 해도 됨(그 전엔 웹 OAuth 폴백으로 동작)
운영과 같은 프로젝트(589120466593)에 클라이언트 추가:
1. **웹 클라이언트**(테스트 Supabase 콜백용) — 승인된 리디렉션 URI:
   `https://<테스트ref>.supabase.co/auth/v1/callback`
2. **iOS 클라이언트** — 번들 정확히 `com.yunjunsang.eorth.beta`
3. **Android 클라이언트** — 패키지 `com.yunjunsang.eorth.beta` + SHA-1
   (`eas credentials -p android` 로 베타 키스토어 지문 확인)
4. 테스트 Supabase → Auth Providers → Google: 웹 client ID/secret 입력, **Client IDs에 웹+iOS 둘 다** 등록
   (iOS 네이티브 idToken의 aud=iOS ID — 웹만 넣으면 안드로이드만 통과하는 함정)
5. EAS env 추가(preview·development 동일):

    eas env:create --environment preview --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value <웹클라이언트ID> --visibility plaintext
    eas env:create --environment preview --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value <iOS클라이언트ID> --visibility plaintext
    eas env:create --environment preview --name GOOGLE_SIGNIN_IOS_URL_SCHEME --value com.googleusercontent.apps.<iOS클라이언트ID의 .apps... 앞부분> --visibility plaintext

## 5. Firebase (Android 빌드 전제)
`google-services.json`이 운영 패키지만 담고 있어 베타/dev **Android** 빌드는 이대로면 실패한다
("No matching client found"). Firebase 콘솔 → 프로젝트 설정 → Android 앱 추가로
`com.yunjunsang.eorth.beta`·`com.yunjunsang.eorth.dev` 두 앱을 추가하고, 병합된
`google-services.json`을 내려받아 저장소의 것을 교체한다(운영 client 항목은 그대로 포함 → 정식 무영향).
**iOS 베타는 이 단계 없이 빌드 가능.**

## 6. 빌드·제출·검증

    eas build --profile beta --platform ios      # eOrth β (TestFlight용)
    eas submit --profile beta --platform ios

검증 체크리스트(베타 실기기):
- 정식앱과 나란히 설치되는가(이름 eOrth β)
- 회원가입(이메일) → 가입 인증 메일 링크가 '베타 앱'으로 돌아오는가(eorthbeta://)
- 구글 로그인(4번 완료 전엔 웹 OAuth 창으로 뜨는 게 정상)
- 게시·DM·알림이 **테스트 프로젝트에만** 생기는가(운영 대시보드에 안 보여야 함)
- 정식앱 로그인·피드가 이전과 동일하게 동작하는가(G2 최종 확인 — 이 확인 전 정식 채널 OTA 금지)
````

- [ ] **Step 4: 스크립트 동작 검증 (가짜 값으로)**

```powershell
node scripts/make-test-schema.mjs testref0000000000000 eyJFAKE.FAKE.FAKE
node -e "const s=require('node:fs').readFileSync('supabase/test-schema.local.sql','utf8');if(s.includes('blweolnunmsxgztmvzfd')){console.error('FAIL: 운영 ref 잔존');process.exit(1)};console.log('PASS: 치환 완전')"
Remove-Item supabase/test-schema.local.sql
```

Expected: `완료: … 치환` 후 `PASS: 치환 완전`.

- [ ] **Step 5: Commit**

```bash
git add scripts/make-test-schema.mjs docs/beta-environment-setup.md .gitignore
git commit -m "feat(variant): 테스트 스키마 치환 스크립트 + 베타 환경 셋업 절차 문서"
```

---

## 실행 후 남는 것 (코드 밖 — docs/beta-environment-setup.md 순서대로)

콘솔 작업(테스트 Supabase·ASC·Google·Firebase·EAS env)과 베타 빌드·검증은 사용자 실행 몫.
**G2 최종 게이트: 베타 실기기 로그인 왕복 확인 전에는 정식 채널 OTA를 내보내지 않는다**
(Task 1의 코드가 정식 OAuth 경로를 지나가므로).
