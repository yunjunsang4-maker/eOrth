# 온보딩 거주국가 설정 (BasicInfo) — 설계

- 작성일: 2026-06-08
- 대상: eOrth (React Native + Expo)
- 상태: 설계 승인됨 → 구현 계획 작성 예정

## 1. 배경 / 목표

온보딩 이름 입력 단계(`BasicInfoScreen`)에서 **거주국가를 설정**하게 한다. 이 값(`homeCountryCode`)이
다음 단계 `TravelImportScreen`의 "거주국가 밖 해외 여행 분석" 기준이 되므로, 그 기능보다 먼저 만든다.

### 현재 상태 (확인됨)
- 온보딩 순서: Splash → AppIntro → Login → **BasicInfo(이름)** → TravelImport → Main.
- `BasicInfoScreen`: 아바타 + 닉네임 입력 + "다음"(→ 닉네임/사진 저장 → `TravelImport`). 거주국가 입력 없음.
- `settingsStore`에 `homeCountryCode`(기본 `'KR'`)와 `setHomeCountryCode`가 있으나 온보딩에서 설정하지 않음.
- `constants/countries.ts`의 각 국가는 `{ term, flag, name, continent }`이며 `term`이 ISO 코드로 시작한다
  (예: `'kr 대한민국 korea'`, `'jp 일본 japan'`). → `term.split(' ')[0].toUpperCase()`로 ISO 코드 도출 가능.
  이 코드는 `expo-location` reverseGeocode의 `isoCountryCode`와 일치한다.

## 2. 핵심 결정 사항 (확정)

1. **UI = 인라인 검색 모달.** 닉네임 아래 "거주국가" 필드 버튼(기본 표시 `🇰🇷 대한민국`) → 탭 시
   국가 검색 모달(`COUNTRIES` + 검색, 기존 BlogRecord 패턴) → 선택.
2. **저장 = term→ISO 코드.** "다음"에서 `setHomeCountryCode(selected.term.split(' ')[0].toUpperCase())`.
3. **초기값** = 현재 `homeCountryCode`에 해당하는 국가(매칭 실패 시 대한민국).

## 3. 변경 상세 (`src/screens/BasicInfoScreen.tsx`)

- `useSettings()`에서 `homeCountryCode`, `setHomeCountryCode` 추가 수신.
- `import { COUNTRIES } from '../constants/countries';`
- 헬퍼: `codeOf(country) = country.term.split(' ')[0].toUpperCase()`.
- 상태: `selectedCountry`(Country) 초기값 = `COUNTRIES.find(c => codeOf(c) === homeCountryCode) ?? 대한민국`,
  `countryModalVisible`(boolean), `countrySearch`(string).
- UI: 닉네임 섹션 아래에 "거주국가" 라벨 + 선택 버튼(`{flag} {name}`). 버튼 탭 → 모달 열림.
- 모달: 상단 검색 TextInput + `COUNTRIES.filter(검색)` 리스트, 항목 탭 → `setSelectedCountry` + 모달 닫기.
- `handleFinish`: 기존 닉네임/사진 저장에 더해 `setHomeCountryCode(codeOf(selectedCountry))` 후 `TravelImport` 이동.
- `canContinue`는 닉네임 기준 유지(거주국가는 항상 기본값 보유).
- 카피: 부제를 "닉네임과 거주국가를 설정해주세요" 식으로 소폭 보정.

## 4. 손대는 파일

- **수정:** `src/screens/BasicInfoScreen.tsx` (유일)
- 의존: `useSettings`(기존), `constants/countries.ts`(기존).

## 5. 검증

- `npx tsc --noEmit` 통과.
- BasicInfo에서 거주국가 필드 표시(기본 대한민국), 모달 검색·선택 동작.
- "다음" → `homeCountryCode`가 선택 국가의 ISO 코드로 저장됨.
- 재진입 시 저장된 거주국가가 초기 선택으로 복원.
- 이후 `TravelImport` 분석이 이 거주국가 기준으로 동작(해외만).

## 6. 범위 밖

- 프로필 화면 위치 표시(하드코딩 "🇰🇷 대한민국") 연동 — 후속.
- 거주국가 변경을 설정(Settings) 화면에서 하는 UI — 이미 `setHomeCountryCode` 존재, 별도 작업.
