---
name: eorth-build-routing
description: eOrth의 EAS 빌드·OTA·제출 명령을 대상(개발/베타/정식)에 맞게 고르고, 잘못 쏘는 사고를 막는다. "빌드해줘", "OTA 쏴줘", "업데이트 배포", "테스트플라이트 올려줘", "어떤 프로필로 빌드해야 해", "채널 뭐로 해야 해", "다시 빌드", "재배포" 요청 시 반드시 사용할 것. 프로필 이름과 채널 이름이 어긋나 있어 직관대로 고르면 틀린다.
---

# eOrth 빌드·OTA 라우팅

## 먼저 알아야 할 함정

**`preview` 프로필의 채널은 `development`가 아니라 `beta`다.** 이름이 preview라서
미리보기용으로 보이지만, 실제로는 안드로이드 베타 배포용이다. 여기에 정식용을 재발행하면
베타 사용자 기기에 정식 번들이 덮인다.

**정식 OTA에는 `--environment production`이 필수다.** 빼면 다른 환경 변수 묶음으로
번들이 만들어져 나간다. 되돌리려면 다시 쏘는 수밖에 없고, 그 사이 사용자는 깨진 앱을 쓴다.

## eas.json 실제 구성

| 프로필 | channel | environment | APP_VARIANT | distribution | Android |
|---|---|---|---|---|---|
| `development` | development | development | development | internal | apk |
| `preview` | **beta** | preview | beta | internal | apk |
| `beta` | beta | preview | beta | store | (aab) |
| `production` | production | production | *(미지정)* | (store) | app-bundle |

`production` 프로필에는 `APP_VARIANT`가 없다 — 기본값 경로를 탄다. 변형별 번들ID는
`app.config.js`가 `APP_VARIANT`로 갈라내므로, 정식 빌드가 기본값을 타는 것이 의도다.

제출 설정(`submit`)은 iOS만 있고 ascAppId가 정식 `6778678243` / 베타 `6799705229`로 다르다.

## 대상별 명령

**개발용 dev 클라이언트 (실기기 디버깅)**
```
eas build --profile development --platform android
```
로컬 gradle 빌드는 하지 마라 — 한글 경로와 RAM 문제로 실패한다.
**로컬 `prebuild`는 특히 금지다.** `android/`를 지우고 크래시한다.

**안드로이드 베타 배포**
```
eas build --profile preview --platform android
```

**iOS 베타 (TestFlight)**
```
eas build --profile beta --platform ios
eas submit --profile beta --platform ios --latest
```

**정식 빌드**
```
eas build --profile production --platform ios
eas submit --profile production --platform ios --latest
```

**정식 OTA**
```
eas update --branch production --environment production --message "설명"
```
`--environment production`을 빠뜨리지 마라.

## 쏘기 전에 반드시

1. `node scripts/assert-variant-config.mjs` — 변형이 실제로 갈라지는지 단언
2. `npx tsc --noEmit` / `npm test`
3. `.env` 변경이 있었다면 `npx expo start -c` (캐시를 비우지 않으면 옛 값이 박힌다)
4. 정식 대상이면 `supabase/SERVER-STATE.md`로 서버 SQL·Edge Function 반영 확인
5. `docs/`를 고쳤다면 `npm run pages:publish` — master 커밋만으로는 공개본이 안 바뀐다
   (GitHub Pages는 `gh-pages` 브랜치에서 서비스된다)

## 실행 주체 — 누가 치는가

**대화식 자격증명을 요구하는 명령은 사용자가 직접 실행해야 한다.** Apple 로그인,
키체인 접근, EAS 최초 인증 등이 그렇다. 에이전트가 붙잡고 있으면 프롬프트에서 멈춘 채
타임아웃된다.

이런 명령을 만나면 실행하지 말고 **"사용자가 실행해야 함"으로 보고하고 명령문을 그대로 제시하라.**
사용자는 프롬프트에 `! <명령>` 형태로 쳐서 결과를 세션에 들여올 수 있다.

## 절대 하지 말 것

- `production` 대상 작업을 `preview` 채널로 발행
- `--environment` 없이 정식 OTA
- 로컬 `expo prebuild`
- 베타에 운영 AdMob ID (자기 클릭이 쌓여 계정 위험)
- 검사 실패를 남겨둔 채 빌드

## 테스트 시나리오

**정상:** "안드로이드 베타 올려줘" → `preview` 프로필 선택 → 사전 검사 4종 통과 확인 →
`eas build --profile preview --platform android` 제시.

**에러:** "정식 OTA 쏴줘"인데 `SERVER-STATE.md`에 미실행 SQL이 있다 → **쏘지 않는다.**
"서버 SQL 미반영 — OTA가 먼저 나가면 신규 기능이 런타임에 깨짐"으로 차단 보고.
