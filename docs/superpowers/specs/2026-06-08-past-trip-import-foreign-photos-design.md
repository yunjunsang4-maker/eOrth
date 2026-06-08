# 과거 여행 불러오기 — 거주국가 밖 사진 분석 (설계)

- 작성일: 2026-06-08
- 대상: eOrth (React Native + Expo)
- 상태: 설계 승인됨 → 구현 계획 작성 예정

## 1. 배경 / 목표

온보딩의 "과거 여행 불러오기"(`TravelImportScreen`)를 폴라스텝스처럼 — **갤러리를 분석해
거주국가가 아닌 곳에서 찍힌 사진**으로 과거 해외 여행을 자동 발견·기록하도록 개선한다.

### 현재 상태 (확인됨)
- `src/screens/TravelImportScreen.tsx`는 이미 폴라스텝스식 스캔을 한다:
  갤러리 asset → `getAssetInfoAsync`로 GPS → `Location.reverseGeocodeAsync`로 국가 →
  시간(7일)·위치 변경 기준 시간순 클러스터링 → 여행 카드 선택 → `addRecord` → Main.
- 그러나 **거주국가(국내, 코드의 `KR` 분기)도 포함**하고, **GPS 없는 사진을 "월별 추억"**으로 섞어 넣는다.
- 못 찾거나 권한 거부 시 **가짜 샘플 `SUGGESTED_TRIPS`(일본/프랑스/미국)** 로 폴백한다.
- 거주국가는 `src/store/settingsStore.tsx`의 `homeCountryCode`(기본 `'KR'`)에 있으나
  이 화면은 현재 사용하지 않는다.

## 2. 핵심 결정 사항 (확정)

1. **결과 = 해외 GPS 사진만.** 포함 조건: `GPS 있음` && `isoCountryCode !== homeCountryCode`.
   거주국가에서 찍은 사진(국내)과 위치정보(GPS) 없는 사진은 **제외**.
2. **거주국가 기준 = `settingsStore.homeCountryCode`** (기본 `'KR'`). `useSettings()`로 읽는다.
3. **데모 샘플 제거.** 해외 0개/권한 거부 시 가짜 여행 대신 **솔직한 빈 상태**를 보여준다.

## 3. 변경 상세 (`src/screens/TravelImportScreen.tsx` 단일 파일)

### 3.1 거주국가 연동
- `import { useSettings } from '../store/settingsStore';` 추가, 컴포넌트에서 `const { homeCountryCode } = useSettings();`.

### 3.2 지오코딩 필터링
- reverseGeocode 결과의 `isoCountryCode`를 각 사진에 캡처.
- **GPS가 없거나 지오코딩 실패한 사진은 건너뛴다**(과거의 `no_gps_*` 월별 그룹 생성 로직 제거).
- **`isoCountryCode === homeCountryCode`인 사진은 건너뛴다**(국내 제외).
- 통과한(해외) 사진만 `parsedPhotos`에 넣는다.

### 3.3 국가 매핑 정리
- `COUNTRY_FLAGS`에 `KR: { name: '한국', flag: '🇰🇷' }` 추가
  (거주국가가 한국이 아닌 사용자에겐 한국도 "해외"이므로 표시 가능해야 함).
- 기존 `KR` 전용 지역 세분화(제주/부산/서울 등) 분기는 **제거**. 거주국가는 어차피 제외되고,
  해외는 **국가 단위**(`countryName`)로 표시한다.
- 미등록 국가코드 폴백: `{ name: addr.country || countryCode, flag: '✈️' }` 유지.
- 클러스터 식별 키 `locationKey = isoCountryCode`(국가 단위). 시간순 7일/위치변경 분할은 그대로.

### 3.4 클러스터 → 여행 카드
- 기존 변환 로직 재사용. `no_gps` 관련 분기/제목("…의 추억")은 제거(이제 해외만 존재).
- 결과는 최신순 정렬, 선택 토글, 하단 가져오기 바, `addRecord` 흐름 그대로.

### 3.5 빈 결과 / 권한 처리
- `SUGGESTED_TRIPS`와 `usingMockData` 경로 **삭제**.
- 스캔 완료 후 `scannedTrips.length === 0`이면 **빈 상태 뷰**:
  - 문구: "🔍 해외에서 찍은 사진을 찾지 못했어요" + 보조 안내
    ("거주국가 밖에서 GPS가 기록된 사진이 없어요. 위치 접근을 허용하면 더 잘 찾을 수 있어요.").
  - 버튼: `수동으로 기록`(→ `navigation.reset` to Main) / `건너뛰기`(→ Main).
- **갤러리 권한 거부:** 가짜 스캔 대신 빈 상태로 안내(샘플 대체 제거).
- **위치 권한 거부:** asset은 읽되 지오코딩 불가 → 해외 판별 불가 → 빈 상태 + "위치 권한 필요" 안내.

### 3.6 카피 보정
- 부제: "내 갤러리에서 **거주국가 밖**에서 찍은 사진을 분석해 다녀온 해외 여행을 자동으로 찾아드려요" 식으로 소폭 수정.

## 4. 손대는 파일

- **수정:** `src/screens/TravelImportScreen.tsx` (유일)
- 의존: `useSettings`(기존), `useRecords`(기존), `expo-media-library`/`expo-location`(기존).

## 5. 검증

- `npx tsc --noEmit` 통과.
- 해외 GPS 사진 → 국가/기간별 여행 카드로 묶임, 국내·무GPS 사진은 결과에서 제외.
- 해외 0개 또는 권한 거부 → 빈 상태(가짜 샘플 안 뜸), `수동으로 기록`/`건너뛰기` 동작.
- 선택 → 가져오기 → `addRecord` → Main 정상.
- 거주국가가 KR이 아닌 경우(설정 변경 시) 한국도 해외로 잡힘.

## 6. 범위 밖 (이번 작업 아님)

- 사진 품질/베스트컷 분석(`photoAI` 파이프라인) 연동 — 이번엔 위치 기반 발견만.
- 여행 카드 썸네일 AI 생성.
- 거주국가를 온보딩에서 설정하는 별도 단계(이미 `homeCountryCode` 기본값 사용).
