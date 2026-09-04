# 체류 중 주변국 여행 카드 자동 제안 설계

**작성일:** 2026-09-04
**관련 문서:** `2026-07-16-long-stay-mode-design.md`(체류 모드), `2026-06-08-past-trip-import-foreign-photos-design.md`(과거여행 스캔), `2026-09-01` 과거여행 불러오기 즉시 카드 생성(메모 `eorth-past-import-instant-card`)

## 배경 · 목표

1차 타깃인 유럽 유학생·교환학생은 **한 도시에 살면서 주변국을 짧게 자주 여행**한다. 현재 앱은 체류 중 제3국 방문을 별도 여행 카드로 분리하는 규칙은 갖췄지만, 카드는 매번 사용자가 직접 만들어야 한다. 주말마다 나가는 사람에게 이 마찰이 누적되면 카드가 쌓이지 않는다.

**목표:** 체류국으로 돌아오면 "프라하 여행 카드 만들까요?"가 이미 떠 있고, 탭 한 번에 과거여행 불러오기와 같은 카드가 생긴다.

**비목표:** 완전 자동 생성(오판이 피드에 남음), 사진 선택 화면(주말마다 반복하기엔 무거움), 체류 일시정지·재개 판정의 진입점 확장.

## 확정 결정 (Locked Decisions)

1. **제안 → 한 번 탭으로 생성.** 사용자 의사 확인은 하되 사진 선택 단계는 없다.
2. **노출은 로컬 알림 1회 + 홈 피드 최상단 제안 카드.** 제안은 감지 후 7일이면 자동 소멸.
3. **감지는 사진 기반.** GPS 일시정지·재개 시각에 의존하지 않는다. 체류 중 앱을 열 때마다(12시간 1회 제한) 최근 14일 사진을 훑어 체류국 밖 사진 묶음을 찾는다.
4. **생성 결과물은 과거여행 불러오기와 동일.** 무작위 표지 1장 복사, `viewType: 'album'` 카드, 여행 그룹 생성, 사진 풀 참조 보관.
5. **권한 팝업을 띄우지 않는다.** 사진 권한이 이미 허용된 경우에만 동작(App Store 5.1.1 방어 정책과 동일).
6. **불러오기 화면의 스캐너(`startScan`)는 건드리지 않는다.** 8/27 실기기 검증을 마친 코드라 14일 창 전용 소형 스캐너를 새로 조립한다.
7. **카드 생성 본체는 훅으로 추출해 두 경로가 공유한다.** 저장 규칙이 둘로 갈라지는 것을 막는다.

## 구성 요소

### 1. 판정 로직 — `src/utils/stayTripSuggest.ts` (순수 함수) + `stayTripSuggest.verify.ts`

```ts
export interface TripSuggestion {
  key: string;             // `${countryCode}:${startDate}:${endDate}` — 거절·알림 식별자
  countryCode: string;
  countryName: string;
  countryFlag: string;
  startDate: string;       // 'YYYY.MM.DD'
  endDate: string;
  photoCount: number;
  photos: ScannedPhoto[];  // 풀 보관용
  detectedAt: number;      // ms — 7일 소멸 기준
}

export function suggestStayTrips(input: {
  photos: ScannedPhoto[];          // 최근 14일, countryCode 판정 완료
  stayCountryCode: string;
  homeCountryCode: string;
  now: number;
  currentCountryCode: string | null; // 위치 못 얻으면 null
  importedAssetIds: Set<string>;   // 기록 mediaAssetIds + poolAssetIds
  existingTrips: { countryName?: string; startDate?: string; endDate?: string }[]; // 모든 viewType
  dismissedKeys: string[];
}): TripSuggestion[]
```

규칙:
- **제외 순서:** `countryCode` 없음 → 제외. 체류국·거주국 → 제외(거주국은 귀국이라 제안 대상 아님). 이미 카드에 들어간 자산 id → 제외.
- **클러스터링:** 기존 `clusterForeignTrips`(같은 나라 + 7일 이내 합류, 나라 바뀌면 새 묶음)를 재사용. 호출 전에 체류국 사진을 걸러 넘긴다.
- **최소 사진 수:** `MIN_SUGGEST_PHOTOS = 5`. 과거여행 불러오기(10장)보다 낮다. 당일치기 주말여행 대응.
- **종료 판정:** 묶음의 마지막 사진 시각이 `now - 12h` 이전 **그리고** `currentCountryCode === stayCountryCode`. 위치가 `null`이면 마지막 사진이 `now - 24h` 이전으로 대체.
- **기간 겹침 제외:** 기존 `overlapsImportedTrip`(같은 나라명 + 하루라도 겹침)을 **모든 viewType 기록**에 대해 적용. 사용자가 피드·블로그·컷으로 직접 남긴 여행도 걸러야 한다.
- **거절 제외:** `dismissedKeys`에 있는 키 제외. 키는 같은 여행이 재스캔돼도 동일하도록 나라 코드+기간으로 만든다.

### 2. 소형 스캐너 — `src/utils/recentPhotoCountryScan.ts`

`scanRecentPhotoCountries({ createdAfter, createdBefore }): Promise<ScannedPhoto[]>`

- `MediaLibrary.getAssetsAsync({ createdAfter, createdBefore, mediaType: 'photo', sortBy: 'creationTime' })`를 페이지 단위로 읽는다. 스프레드 금지, 루프 push(Hermes 인자 한계).
- 기존 `scanSampling.ts`의 12시간 버킷 샘플링(`bucketRanges` → `probeOrder` → `segmentsFromProbes` → `fillCountries` → `nextBoundaryProbe`)을 그대로 조립. 프로브는 `getAssetInfoAsync(id, { shouldDownloadFromNetwork: false })`로 좌표를 얻고, `locateCountry` 폴리곤 1순위, 실패분만 `reverseGeocodeAsync` 폴백(`GEOCODE_MIN_GAP_MS` 준수).
- 안드로이드는 `ACCESS_MEDIA_LOCATION` **check만**(request 금지, API 29 미만은 건너뜀). 미승인이면 빈 배열.
- 14일 창은 버킷 최대 28개라 좌표 조회는 수십 회. 실패는 예외로 올리고 호출자가 삼킨다.

### 3. 카드 생성 훅 — `src/hooks/useImportTripsIntoCards.ts` (리팩터)

`TravelImportScreen.handleImport`의 3~6단계를 순수 이동:

```ts
const importTrips = useImportTripsIntoCards();
await importTrips(trips: ScannedTrip[], opts?: { onProgress?(done, total) }): Promise<{
  createdRecordIds: string[]; tripGroupIds: string[]; photoCount: number; coverErrors: string[];
}>
```

- 내부 순서(불변): `classifyImportTarget` → `pickCoverCandidates` + `copyTripCover` → `addImportedAlbum` → `'stay'`면 `absorbIntoStay`, `'trip'`이면 `addTripGroup` → `saveTripPool`.
- 화면 관심사(`setImportProgress`, `navigation.reset`, `Alert`, `setLastImportAt`)는 훅 밖에 남긴다. `TravelImportScreen`은 이 훅을 호출하도록 바꾸되 결과가 같아야 한다.
- 표지 복사 전부 실패해도 카드는 만든다(기존 규칙).

### 4. 감지기 — `src/components/StayTripSuggester.tsx` (App.tsx 루트)

- **게이트(스캔):** `activeStayGroup?.stay?.status !== 'ended'` && 사진 권한 `granted`(`accessPrivileges === 'limited'`는 제외). 알림 설정과 무관하게 스캔·배너는 동작한다.
- **게이트(알림 발송만):** 알림 설정 `master` && `stayTripSuggest`.
- **트리거:** 포그라운드 복귀(`AppState` active). `DETECTOR_KEYS.stayTripSuggestCheckedAt`로 12시간 스로틀.
- **절차:** `detectCurrentCountry()`(팝업 없음) → `scanRecentPhotoCountries({ createdAfter: now - 14d })` → `suggestStayTrips(...)` → 새 키만 골라 `pending`에 추가하고 로컬 알림 발송.
- **알림:** `scheduleNotificationAsync({ identifier: \`stayTripSuggest:${key}\`, content: { title, body, data: { type: 'stayTripSuggest' } }, trigger: null })`. 제안 키당 1회. 알림 설정에 `NotifPrefKey` **`stayTripSuggest`**(기본 `true`, 위치 권한 불필요) 추가, `NotificationSettingsScreen`에 토글 노출.
- **라우팅:** `AppNavigator.routeFromData`에 `stayTripSuggest → Main(홈 탭)` 분기 추가.
- **영속 키(`persist.ts` `DETECTOR_KEYS`에 등록):**
  - `stayTripSuggestCheckedAt: '@eorth/stayTripSuggest/checkedAt'` (ms)
  - `stayTripSuggestPending: '@eorth/stayTripSuggest/pending'` (JSON `TripSuggestion[]`)
  - `stayTripSuggestDismissed: '@eorth/stayTripSuggest/dismissed'` (JSON `string[]`)
  - 등록만 하면 `clearPersistedStores`와 `snap-detect-guard.verify.mjs`에 자동 포함된다. 문자열 복붙 금지.
- **소멸:** 로드 시 `detectedAt + 7d < now`인 제안 제거. 체류가 `ended`가 되면 `pending` 전부 제거.

### 5. 홈 제안 카드 — `src/components/StayTripSuggestBanner.tsx` (MainScreen 헤더 바로 아래)

- 홈(MainScreen)은 피드가 아니라 전체화면 지구본이다. 배너는 헤더(로고·종) 바로 아래, 지구본 영역 위에 오버레이 카드로 놓는다. 제안이 없으면 자리도 차지하지 않는다.
- 한 건: 국기 + "체코 여행 · 9.5 ~ 9.7 · 사진 37장", 버튼 **[카드 만들기] [나중에]**, 우상단 작은 ×(안 만들기).
- 여러 건: 같은 카드 안에 행으로 쌓이고 [카드 만들기]는 전부 생성.
- **카드 만들기:** `useImportTripsIntoCards`로 생성 → `pending`에서 제거 → 한 건이면 생성된 카드(`TripRecord`)로 이동, 여러 건이면 토스트 "카드 N장 만들었어요".
- **나중에:** `snoozeUntil = now + 24h`를 `pending` 항목에 기록해 숨김.
- **×:** 키를 `dismissed`에 추가, `pending`에서 제거. 이후 재스캔에도 안 뜬다.
- 스타일은 `MateRecoConsentBanner`를 따른다(카드 #2E2E3B, 보라 네온 #BF85FC). 햅틱은 `utils/haptics` 의미 함수만.
- `pending` 읽기·쓰기는 감지기와 배너가 공유하므로 `src/utils/stayTripSuggestStore.ts`(AsyncStorage 래퍼 + 구독)로 한 곳에 둔다.

## 데이터 흐름

```
포그라운드 → StayTripSuggester
  → detectCurrentCountry()            (위치, 팝업 없음)
  → scanRecentPhotoCountries(14d)     (사진 → 국가)
  → suggestStayTrips(...)             (순수 판정)
  → stayTripSuggestStore.add(new)     (영속)
  → 로컬 알림(새 키만)

MainScreen → StayTripSuggestBanner ← stayTripSuggestStore.subscribe
  [카드 만들기] → useImportTripsIntoCards(ScannedTrip[]) → recordStore/tripPhotoPool
  [나중에]      → snoozeUntil
  [×]           → dismissed
```

## 오류 처리

| 상황 | 동작 |
|---|---|
| 사진 권한 없음·limited | 조용히 건너뜀. 팝업 없음 |
| 위치 못 얻음 | 종료 판정을 마지막 사진 24시간 경과로 대체 |
| 스캔 예외 | 삼키고 `checkedAt`은 갱신하지 않아 다음 포그라운드에 재시도 |
| 표지 복사 실패 | 카드는 만들고 `__DEV__`에서만 사유 노출(기존 규칙) |
| 같은 여행을 사용자가 직접 기록함 | 기간 겹침 제외(전체 viewType)로 제안 안 뜸 |
| iCloud 오프로드 사진 | 스캔은 `shouldDownloadFromNetwork: false`, 표지 복사만 기존 3단계 폴백 |

## 검증

- `stayTripSuggest.verify.ts`: 체류국·거주국 제외, 자산 id 제외, 최소 5장, 종료 판정(위치 있음/없음 두 경로), 전체 viewType 기간 겹침, 거절 키, 키 결정성.
- `stayTripSuggestStore.verify.ts`: 7일 소멸, 24시간 스누즈, 체류 종료 시 전량 제거.
- `npx tsc --noEmit`, `npm test`(snap-detect-guard 포함).
- `TravelImportScreen` 훅 전환은 기존 verify로 회귀 확인. 실기기 체크리스트: 과거여행 불러오기 결과 동일, 체류 중 주말여행 후 알림·배너·생성·이동.

## 범위 밖

- 체류 일시정지·재개 판정이 프로필 탭 진입에만 걸려 있는 문제(`ProfileScreen`만 `currentVisitedCountryCode` 갱신). 사진 기반이라 이 기능에 영향 없음.
- 사진 권한을 한 번도 준 적 없는 체류자에게 권하는 안내.
- 체류국 안 도시 이동(베를린→뮌헨)의 서브 카드. 별도 설계.
