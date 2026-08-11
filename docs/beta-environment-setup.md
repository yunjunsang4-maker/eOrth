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
   `eorthbeta://reset-password`, `eorthbeta://email-confirm`, `eorthdev://auth-callback`,
   `eorthdev://reset-password`, `eorthdev://email-confirm` 추가
7. (푸시 멱등·정리 cron은 베타에선 선택 — 필요 시 SERVER-STATE.md 절차 재사용)

## 2. EAS 환경변수 (preview·development 환경을 테스트 프로젝트로)
현재 두 환경 모두 운영 값을 갖고 있다 — 교체한다:

    eas env:list --environment preview
    eas env:update --environment preview --variable-name EXPO_PUBLIC_SUPABASE_URL --value https://<테스트ref>.supabase.co
    eas env:update --environment preview --variable-name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <테스트anon키>

development 환경도 동일 2건 교체. 로컬 `expo start` 개발도 테스트를 보게 하려면 `.env`도 같은 값으로.

`APP_VARIANT`는 `eas.json`의 `build.*.env`로 **빌드**에는 이미 주입되지만, **`eas update`(OTA)는 이 값을 읽지 않는다** —
OTA 번들도 변형(베타/dev) 산출을 받으려면 EAS 환경변수로도 등록해야 한다:

    eas env:create --environment preview --name APP_VARIANT --value beta --visibility plaintext
    eas env:create --environment development --name APP_VARIANT --value development --visibility plaintext

⚠️ **production 환경에는 `APP_VARIANT`를 절대 넣지 않는다.** production에 값이 들어가면 app.config.js가
정식 산출 대신 변형 산출(번들 ID·스킴·데모 AdMob 등)로 갈라져 정식 OTA가 깨진다 — G1(미설정=정식)이 성립하는 것은
production 환경에 이 변수가 없을 때뿐이다.

## 3. App Store Connect — 베타 앱 등록
1. ASC → 앱 추가: 이름 `eOrth β`, 번들 `com.yunjunsang.eorth.beta`
   (App ID·capability는 EAS가 첫 빌드에서 자동 생성·동기화가 기본 — 실패할 때만 개발자 콘솔 수동)
2. 새 앱의 **Apple ID(숫자)**를 `eas.json` submit.beta의 `REPLACE_WITH_BETA_ASC_APP_ID` 자리에 기입

## 4. Google Cloud (구글 로그인)

⚠️ **1·4번은 필수다. 미루면 베타에서 구글 로그인이 아예 안 된다.**
이전 판에는 "나중에 해도 됨 — 그 전엔 웹 OAuth 폴백으로 동작"이라고 적혀 있었는데 **틀렸다.**
클라이언트 ID가 없으면 앱이 웹 OAuth로 폴백하는 것은 맞지만, **그 폴백도 테스트 Supabase의
Google provider가 켜져 있어야** 동작한다. 꺼진 상태에서는 `provider is not enabled`로 즉시 실패한다
(2026-08-11에 실제로 이 순서로 막혔다). 2·3·5번(네이티브 로그인)만 나중으로 미룰 수 있다.

클라이언트를 만들 프로젝트:
- 정식 클라이언트는 **589120466593**에 있으나 **현재 계정에서 보이지 않는다.** 찾을 필요 없다 —
  정식 자격증명을 편집하는 위험도 피할 겸, 베타용은 Firebase 프로젝트
  **572294422089(`eorth-6ea51`)** 에 새로 만든다. OAuth 클라이언트는 프로젝트 간 독립이라 정상 동작한다.
- 자격증명 목록의 `Web client (auto created by Google Service)`는 Firebase가 자동 생성한 것이고
  이 앱은 Firebase Auth를 쓰지 않아 미사용이다. **재사용하지 말고 새로 만들 것.**
- 2·3번(네이티브용)도 **1번 웹 클라이언트와 같은 프로젝트**에 만들어야 audience 검증을 통과한다.

1. **웹 클라이언트**(테스트 Supabase 콜백용) — 승인된 리디렉션 URI:
   `https://<테스트ref>.supabase.co/auth/v1/callback`
   (Supabase의 Google provider 화면이 표시하는 Callback URL을 그대로 복사하는 게 안전하다)
   → 동의 화면이 "테스트" 상태면 **테스트 사용자에 본인 계정을 추가**해야 로그인된다.
2. **iOS 클라이언트** — 번들 정확히 `com.yunjunsang.eorth.beta`
   (`iosUrlScheme`은 네이티브 설정이라 **재빌드해야** 반영된다. OTA로는 안 된다)
3. **Android 클라이언트** — 패키지 `com.yunjunsang.eorth.beta` + SHA-1
   (`eas credentials -p android` 로 베타 키스토어 지문 확인)
4. 테스트 Supabase → Auth Providers → Google: **활성화 후** 웹 client ID/secret 입력.
   2번까지 마쳤다면 **Client IDs에 웹+iOS 둘 다** 등록
   (iOS 네이티브 idToken의 aud=iOS ID — 웹만 넣으면 안드로이드만 통과하는 함정)
   → 네이티브 iOS를 쓸 때는 `external_google_skip_nonce_check: true`도 필요하다(운영에서 겪은 2차 함정).

**콘솔 없이 검증하는 법** (`<ref>`·`<anon키>`는 테스트 프로젝트 값):

    # 공급자 on/off 확인 — google:true 여야 한다
    curl -s "https://<ref>.supabase.co/auth/v1/settings" -H "apikey: <anon키>"

    # 실제로 물린 client_id 확인 — 302 Location에 나온다
    curl -s -o /dev/null -D - "https://<ref>.supabase.co/auth/v1/authorize?provider=google&redirect_to=eorthbeta%3A%2F%2Fauth-callback" | grep -i ^location

  그 Location URL을 다시 curl 해서 **302면 리디렉션 URI 등록까지 정상**, 400이면 `redirect_uri_mismatch`다.
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

## 7. OTA(eas update) 규칙

빌드 프로필의 채널은 베타/dev와 정식/preview 구독자를 분리하도록 `beta`·`development`·`production` 3개다
(구 베타 TestFlight 빌드가 `preview` 채널을 구독 중이므로 새 베타와 채널을 공유하면 안 된다 — 어느 쪽으로
발행해도 다른 한쪽이 깨진다).

- **베타 OTA**: `eas update --channel beta --environment preview`
- **정식 OTA**: `eas update --channel production --environment production`
  — **`--environment`를 생략하지 말 것.** 생략하면 로컬 `.env`가 번들에 그대로 인라인되는데, §2에서
  `.env`를 테스트 프로젝트 값으로 바꿔둔 상태라면 정식 사용자 전원이 빈 테스트 DB를 보게 되는 사고가 된다.
- **dev OTA**(있다면): `eas update --channel development --environment development`
