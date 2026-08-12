# 생년월일·성별 수집 폐지 — App Store 5.1.1(v) 거절 대응

작성일: 2026-08-13

## 배경

2026-08-12 App Store 심사 거절(1.1.0). Guideline 5.1.1(v) — Legal - Privacy - Data
Collection and Storage.

> The app requires users to provide personal information that is not directly relevant to
> the app's core functionality. … Update the app to not require users to provide the
> following personal information: **Gender, Date of Birth**

지적이 타당하다. 실측 결과 두 값 모두 앱 기능에 쓰이지 않는다:

- **`gender`** — `profiles` 컬럼에 저장만 하고, 앱의 메이트 추천은 여행 DNA 7축과 국가 겹침으로
  계산한다(`mate_suggestions_compute`). 성별을 쓰는 곳은 **행사 부스 매칭**뿐인데, 그건
  `event_participants` 테이블에서 따로 받는다.
- **`birthday`** — 앱 기능에 쓰는 곳이 없다. 다만 두 가지 부수 역할을 하고 있었다:
  ① 만 14세 미만 가입 차단(방침 제11조), ② **온보딩 완료 신호**.

②가 이 작업의 난점이다. `SplashScreen:115`·`LoginScreen:236`·`LoginScreen:488` 이
`profile.birthday` 유무로 "온보딩을 마쳤는가"를 판정한다. 생일을 그냥 선택으로 내리면
건너뛴 사용자가 앱을 켤 때마다 `BasicInfo` 로 되돌아간다.

## 결정

1. **성별은 완전 제거.** 선택 항목으로도 남기지 않는다 — 쓰지 않는 값이다.
2. **생년월일도 완전 제거.** 대신 "만 14세 이상입니다" **확인 체크박스**를 필수로 받는다.
   방침 제11조의 연령 방어선은 유지하면서 DOB 수집 자체가 사라진다.
3. **기존 데이터는 컬럼까지 drop.** "수집하지 않는다"를 스키마로 증명한다.
4. **온보딩 완료 신호는 `profiles.onboarded_at` 신설로 교체.**

`age_confirmed` 값을 온보딩 신호로 겸용하는 안은 기각했다. 한 컬럼이 '연령 확인'과 '온보딩 완료'
두 의미를 지게 되는데, 바로 직전 작업에서 `TravelDnaSurvey` 의 `mode` 파라미터가 문항세트와
온보딩 출신을 겸업하다 우회 버그를 만든 전례가 있다.

## 비목표

- 행사(`event_participants`)의 `gender`·`gender_pref` 는 건드리지 않는다. 별도 테이블이고
  1:1 짝 매칭에 실제로 쓰이며, 행사 페이지에서 별도로 동의를 받는다.
- 생일 기반 기능(생일 배지 등)을 새로 만들지 않는다. 지금 없고, 앞으로도 계획에 없다.

## 1. 서버 (`supabase/schema.sql`)

```sql
alter table public.profiles add column if not exists onboarded_at timestamptz;

-- 백필: birthday 가 있으면 이미 온보딩을 마친 사람이다.
update public.profiles
   set onboarded_at = coalesce(onboarded_at, created_at)
 where birthday is not null and onboarded_at is null;

alter table public.profiles drop column if exists birthday;
alter table public.profiles drop column if exists gender;
```

⚠️ **순서가 load-bearing이다.** 백필을 먼저 하고 drop 해야 기존 7명이 온보딩 완료로 남는다.
뒤집으면 기존 이용자 전원이 온보딩을 다시 밟는다.

함께 고칠 곳(2026-08-13 실측 — SQL 참조는 아래 3곳뿐):
- `schema.sql:37-38` 테이블 정의의 `birthday date` / `gender text` 삭제
- `schema.sql:161` `grant update (...)` 목록에서 `birthday`·`gender` 제거
  — **이걸 빼먹으면 drop 이후 재실행이 "존재하지 않는 컬럼" 오류로 죽는다**
- `schema.sql:166` 주석 문구 갱신

`public_profiles` 뷰는 두 컬럼을 참조하지 않는다(원래 PII를 빼는 뷰라 select 목록에 없음 —
실측 확인). `event_participants`(2771-2772행)의 `gender`·`gender_pref` 는 **별개 테이블이므로
건드리지 않는다.**

재실행은 멱등이어야 한다(`if exists` / `if not exists`). 단 `drop column` 은 되돌릴 수 없으므로
백필 update 가 같은 실행 안에서 먼저 끝나야 한다.

운영·테스트 **두 프로젝트 모두** 반영한다. 테스트만 빠뜨리면 베타에서 이 기능이 전부 실패한다
(2026-08-13에 같은 실수를 겪었다 — 테스트용은 `scripts/make-test-schema.mjs` 생성물을 쓰고,
맨 위 오실행 가드 do 블록을 지운 뒤 실행).

## 2. 온보딩 화면 (`src/screens/BasicInfoScreen.tsx`)

| 항목 | 변경 |
|---|---|
| 아이디 | 필수 유지 |
| 생일 | **입력칸·검증·상태 삭제** |
| 성별 | **입력칸·검증·상태 삭제** |
| 만 14세 이상 확인 | **신설 · 필수 체크박스** (기본 꺼짐) |
| 언어·거주국가·장기체류 | 그대로 |

```ts
const canContinue = HANDLE_RE.test(handle.trim()) && ageConfirmed && (!stayOn || !!stayCountry);
```

`[다음]` 을 누를 때 `onboarded_at` 을 서버에 기록한다. 기록 실패 시의 처리는 기존
프로필 저장 실패 처리와 같은 방식을 따른다(화면이 진행을 막지 않되 사용자에게 알린다).

체크박스 문구(신규 i18n 키):
- ko: `만 14세 이상입니다` / en: `I am 14 years of age or older`

## 3. 온보딩 완료 판정 교체

`profile.birthday` → `profile.onboarded_at` 로 바꾼다:
- `src/screens/SplashScreen.tsx:115`
- `src/screens/LoginScreen.tsx:236`
- `src/screens/LoginScreen.tsx:488`

로컬 폴백(`SplashScreen:87`·`:135` 의 `birthdayRef`)도 `settingsStore` 의 새 플래그로 교체한다.
오프라인에서 "신규인지 기존인지" 판정하는 경로라 빠뜨리면 오프라인 사용자가 온보딩으로 돌아간다.

## 4. 설정 화면 (`src/screens/AccountSettingsScreen.tsx`)

생일·성별 행과 두 편집 모달을 통째로 제거한다(약 8곳). `isOldEnough`/`isValidBirthday` 참조도
함께 정리한다. **연령 확인은 가입 시 1회이므로 설정에 노출하지 않는다.**

## 5. 로컬 상태 (`src/store/settingsStore.tsx`)

`birthday`·`gender` 상태·영속 필드·hydrate·초기화·context를 제거한다. 기기에 PII를 남기지 않기
위해서다. `ProfileSync.tsx`·`useAccountBoundary.ts` 의 참조도 함께 정리한다.

## 6. 개인정보처리방침·앱 공지

- 제1장 2) 프로필: 수집 항목에서 **생년월일·성별 삭제**
- 제11조: "가입 시 만 14세 이상임을 확인받으며, **생년월일은 수집하지 않는다**"로 개정
- md·ko html·en html 3본 동일 반영 + 개정 이력
- 새 시행일 지정 + `docs/notices.json` 앱 내 공지 추가 + `npm run pages:publish`

이번 개정은 **수집 항목이 줄어드는** 변경이라 이용자에게 불리하지 않다. 제13조의 7일 전 고지를
따른다.

## 7. 심사 재제출

이번 변경은 JS라 OTA로도 나가지만, **App Store 심사는 바이너리 기준이므로 새 빌드가 필요하다**:
`eas build --profile production --platform ios` → `eas submit`.

빌드 전에 서버 반영이 끝나 있어야 한다. 순서: 서버 → 클라이언트 병합 → 빌드 → 제출.

## 검증

- `npx tsc --noEmit` — 두 값을 지운 뒤 남은 참조를 여기서 잡는다
- `node scripts/layout-parity.verify.mjs` — 새 체크박스가 규칙 1~10 준수
- `npm test` — 문서 시행일 정합성 포함
- 수동: 신규 가입 왕복(체크 안 하면 [다음] 비활성), 기존 계정 재실행 시 온보딩으로 안 돌아갈 것,
  오프라인 실행 시에도 마찬가지일 것, 설정에 생일·성별이 없을 것

## 남은 위험

- 백필과 drop의 순서를 지키지 않으면 기존 이용자가 온보딩으로 돌아간다. SQL을 한 번에 실행한다.
- 체크박스는 자기 신고라 실제 연령을 보증하지 않는다. 방침 제11조도 "허용하지 않는다"와
  "확인 시 지체 없이 파기"를 함께 적고 있어 문구가 실제와 어긋나지 않는다.
