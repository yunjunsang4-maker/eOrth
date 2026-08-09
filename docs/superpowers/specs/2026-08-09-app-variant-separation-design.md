# 정식앱·테스트앱 분리 (APP_VARIANT) 설계

2026-08-09 확정. 목표: **한 기기에 정식앱과 베타앱이 공존**하고(번들 ID 분리), **테스트 데이터가
운영 DB에 섞이지 않게**(Supabase 프로젝트 분리) 한다. 베타는 TestFlight 별도 앱으로 배포한다.

**대원칙: production 변형은 산출물이 현재와 완전히 동일해야 한다.**
1.1.0이 심사 중이므로 `APP_VARIANT` 미설정 = 지금과 같은 앱. 모든 분기는 변수 설정 시에만 발동한다.

---

## 1. 변형 매트릭스

| | production (정식) | beta (TestFlight) | development (dev 빌드) |
|---|---|---|---|
| 앱 이름 | eOrth | eOrth β | eOrth Dev |
| 번들/패키지 | `com.yunjunsang.eorth` **(불변)** | `com.yunjunsang.eorth.beta` | `com.yunjunsang.eorth.dev` |
| 딥링크 스킴 | `eorth` **(불변)** | `eorthbeta` | `eorthdev` |
| Supabase | 운영 프로젝트 `blweolnunmsxgztmvzfd` **(불변)** | **신규 테스트 프로젝트** | 테스트 프로젝트(베타와 공유) |
| EAS 업데이트 채널 | production (기존) | preview (기존) | development (기존) |
| AdMob | 실제 ID **(불변)** | Google 데모 앱 ID + 테스트 유닛 | 데모 ID |
| 구글 iOS OAuth | 기존 클라이언트 **(불변)** | 베타 번들용 신규 클라이언트 | 신규(베타와 공유 가능 여부는 번들별 — dev 번들용 별도) |

- 스킴에 하이픈을 쓰지 않는 이유: appLinks 유틸의 소문자 검증·파싱 규칙과 충돌 여지를 없애기 위함.
- 테스트 Supabase는 **빈 DB로 시작**한다(2026-08-07 베타 계정 전량 정리로 이관할 데이터 없음).
  베타에서는 계정을 새로 가입한다.

## 2. 코드 변경 (이 저장소)

1. **`app.json` → `app.config.js`** — 내용을 그대로 옮기고 `process.env.APP_VARIANT`
   ('beta' | 'development' | 미설정)로 이름·번들·패키지·스킴·AdMob 앱 ID만 분기.
   미설정이면 모든 값이 현재 app.json과 동일.
2. **`eas.json`** — `beta-ios` 프로필을 `beta`(iOS+Android)로 정리, `preview`·`development`
   프로필 env에 `APP_VARIANT` 추가. **production 프로필은 무변경.**
3. **스킴 하드코딩 제거** — `src/services/auth.ts`의 `makeRedirectUri({ scheme: 'eorth' })`
   3곳(reset-password·email-confirm·auth-callback)과 `src/utils/appLinks.ts`가
   `expo-constants`의 `expoConfig.scheme`을 읽도록. production에서 읽힌 값이 `'eorth'`인지
   검증 코드로 확인 후에만 진행.
4. **구글 클라이언트 ID 변형화** — `auth.ts`의 `GOOGLE_IOS_CLIENT_ID`(웹 ID는 Supabase
   프로젝트별이므로 함께)를 변형별 분기. 베타 값 발급 전까지는 빈 값 → 기존 폴백(웹 OAuth)이
   동작하므로 코드가 콘솔 작업을 기다리지 않는다.
5. **EAS 환경변수** — EAS `preview`·`development` 환경의
   `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY`를 테스트 프로젝트 값으로 교체(현재는 3환경 모두 운영).

## 3. 콘솔 작업 (저장소 밖 — 절차만 여기 기록)

1. **테스트 Supabase 프로젝트 생성** → `schema.sql` 실행 + Edge Function 4종 배포
   (`send-push`·`report-alert`·`login-with-identifier`·`delete-account`) + `media` 공개 버킷
   + Vault·시크릿(cron-setup 절차) — SERVER-STATE.md 절차 재사용.
2. **⚠️ schema.sql 하드코딩 치환 필수** — `notify_send_push`·`notify_on_dm`·신고 알림 트리거에
   운영 URL(`blweolnunmsxgztmvzfd.supabase.co`)과 운영 anon 키가 박혀 있다. 그대로 실행하면
   테스트 트리거가 **운영 send-push를 호출**한다(send-push의 재조회 검증 덕에 실피해는 없지만
   베타 푸시가 안 옴). 테스트 프로젝트 URL·anon 키로 치환한 사본으로 실행한다.
3. **ASC에 "eOrth β" 앱 등록**(번들 `com.yunjunsang.eorth.beta`) → 기존 `eas build --profile
   beta` + `eas submit` 파이프라인 재사용. 진행 중인 정식 1.1.0 심사와 무관(별개 앱).
4. **Google Cloud**: 베타 번들용 iOS OAuth 클라이언트 + 베타 패키지용 Android 클라이언트
   (EAS 키스토어 SHA-1) 발급 → **테스트 Supabase provider에 웹+iOS 둘 다 등록**
   (aud=iOS ID 함정 — eorth-google-ios-clientid-supabase 메모리 절차), Redirect URL에
   `eorthbeta://auth-callback` 등록.
5. Apple Sign-In capability는 새 App ID에 활성(EAS 자동 처리 기대, 실패 시 개발자 콘솔 수동).

## 4. 리스크와 게이트 (진행 금지 조건)

| # | 위험 | 게이트 |
|---|------|--------|
| G1 | config 전환이 정식 산출물을 바꿈 | 전환 전 `npx expo config --json` 스냅샷 저장 → 전환 후(변수 미설정) diff **완전 동일**해야 커밋 |
| G2 | 스킴 코드 변경이 정식 OAuth를 깨뜨림 | production 변형에서 스킴 해석값 `'eorth'` 확인 + 베타 실기기 로그인 왕복 검증 후에만 정식 채널 OTA |
| G3 | 테스트 트리거의 운영 함수 호출 | 3-2 치환 절차. 미치환이어도 send-push 재조회 방어로 무해(베타 푸시 부재만) |

이미 만들어진 산출물(심사 중인 1.1.0 바이너리, 게시된 production OTA)은 어떤 경우에도 영향받지 않는다.

## 5. 구현 순서

1. 테스트 Supabase 셋업(콘솔) — 코드와 독립이라 먼저/병렬 가능
2. 코드 변경(G1·G2 게이트 통과 → 커밋)
3. EAS 환경변수 교체 → `eas build --profile beta` → TestFlight 제출
4. 베타 실기기 검증: 가입·로그인(이메일/구글)·게시·DM·푸시 — 전부 테스트 DB에서만 발생하는지 확인
5. (베타 검증 후) dev 빌드도 같은 변형으로 재빌드

## 6. 제외 범위 (YAGNI)

- 운영 데이터의 테스트 프로젝트 미러링/복제 — 빈 DB로 충분
- 베타 전용 기능 플래그 체계 — 필요해지면 별도 설계
- 기존 TestFlight(구 베타, 같은 번들) 정리 — 자연 만료. 새 빌드 올리지 않으면 됨
- Android 베타의 Play 내부 테스트 트랙 — 현재 iOS 중심 검증이므로 APK internal 배포 유지
