# 소셜 탭 스냅 링 — 여행 단위 묶음 + 거주지 시·도 "일상" 링 (2026-09-12)

## 배경
지금 스냅 링은 `작성자+나라`로 묶여(`SocialScreen.snapItems`) 같은 나라 재방문이 한 원에 합쳐지고, 국내 스냅은 지역 구분이 없다. 사용자 결정:
- 링은 **여행 단위**(여행 카드 = 해외는 출국~귀국 세션, 국내는 시·도+7일 규칙).
- 거주국 여행은 **시·도(도·광역시·특별시) 단위**, 해외 거주 사용자도 자기 나라에서 같은 규칙.
- **거주지 시·도**를 저장하고, 거주지에서 찍은 스냅은 여행이 아니라 **고정 "일상" 링 하나**로 모아 여행 링들 **뒤**에 둔다(skrp 방식, 글로벌 지향).
- 거주지 설정은 "현재 위치로 설정"(주 버튼, 강조)과 "직접 선택"(보조 링크) 두 가지를 제안하되 위치 쪽으로 유도.

## 기존 장치 (재사용, 새로 만들지 말 것)
- 여행 카드: `recordStore.linkRecordToTrip`(해외 세션) / `linkByDate`(국내 = `normalizeHomeRegion` 지역 + `GROUP_GAP_MS` 7일). `TripGroup.regionName`이 국내 카드 지역.
- 지역 정규화: `constants/homeRegions.ts` `normalizeHomeRegion(countryCode, raw)` — KR은 `koreaRegions.ts` 17개 프리셋, `ISO2_TO_GEO` 27개국은 지오 행정구역, `getHomeRegions(cc)`로 선택 목록.
- 감지: `services/snapService.detectCurrentCountry({allowPrompt})` → `{countryCode, countryName, city}`. `SnapRecordScreen`은 `detectedCity`를 state로 갖고 있으나 저장 안 함(`:184-230`, 저장 `:407-428`).
- `TravelRecord.regionName / regionNameEn / tripGroupId` 필드는 이미 있다(`recordStore.tsx:180,208`).
- 서버 발행 payload는 record 전체(`services/posts.ts` `data: uploaded`, `uploadedMediaUrls`만 제거) → 새 필드는 자동으로 남의 화면에 도착한다.
- `addRecord` 순서(`recordStore.tsx`): `setRecords` → `linkRecordToTrip(newRecord)` → `publishToBackend(newRecord)`. **링크가 발행보다 먼저**라 카드 id를 발행 전에 심을 수 있다.
- 링 정렬: `utils/snapStrip.putMineFirst`(+verify), 링 UI `SocialScreen.tsx:3237-3345`.

## 결정

### 1. 스냅 저장 시 여행 소속·일상 플래그를 심는다
- `SnapRecordScreen` 저장: 거주국 스냅이면 `regionName = normalizeHomeRegion(homeCountryCode, detectedCity)?.name`(정규화 실패면 `detectedCity` 원문, 없으면 undefined). 사용자가 나라 시트에서 직접 고른 `selectedCountry.region`이 있으면 그것 우선(기존 동작).
- 새 필드 `snapDaily?: boolean` (TravelRecord): 거주국 && `homeRegion`이 설정돼 있고 && 정규화 지역명 === `homeRegion.name` 일 때 true.
- `tripGroupId`: `linkRecordToTrip`/`linkByDate`가 최종 카드 id를 **반환**하도록 바꾸고, `addRecord`가 `viewType==='snap'`이면 `newRecord.tripGroupId = gid`를 **`publishToBackend` 호출 전에** 심는다(객체 mutate + `setRecords` 반영). `snapDaily` 스냅은 카드에 **넣지 않는다**(일상은 여행이 아니다) — `linkRecordToTrip` 진입 시 `rec.snapDaily`면 바로 return(카드 생성·세션 종료 신호 모두 없음).
  - ⚠️ `linkByDate`는 `setTripGroups(prev => …)` 콜백 안에서 카드를 찾는다. 반환값을 내려면 콜백 밖에서 `tripGroupsRef.current`로 먼저 판정하고 동일 결과를 set하는 구조로 바꿔야 한다(다른 호출부 동작 불변 확인).
  - 기존 미포함 사례(회고 기록 등)는 기존 동작 유지.

### 2. 거주지 시·도 `homeRegion`
- `settingsStore`: `homeRegion: { name: string; nameEn: string } | null` (기본 null) + setter, persist, **서버 설정 백업 포함**(homeCountryCode와 같은 묶음). 거주 국가를 바꾸면 `homeRegion`은 null로 리셋.
- `homeRegionPromptShown: boolean` persist(로컬만, 백업 제외) — 제안 시트 1회 노출용.
- 새 컴포넌트 `components/HomeRegionSheet.tsx`(기존 바텀시트 재질·토큰 따름):
  - 제목/설명(i18n), **주 버튼 "현재 위치로 설정"**(보라 네온, 크게): `detectCurrentCountry({allowPrompt:true})` → countryCode !== homeCountryCode면 "거주 국가 밖" 안내 후 유지; 같으면 `normalizeHomeRegion(home, city)` → 성공 시 저장·닫기, 실패 시 city 원문으로 저장(`nameEn`은 city 원문).
  - **보조 링크 "직접 선택"**(작은 텍스트): `getHomeRegions(homeCountryCode)` 목록(KR 17 / 27개국 지오). 목록이 비는 나라는 텍스트 입력 1줄.
  - 권한 요청은 버튼 탭 뒤에만(5.1.1 방어). 거부 시 안내 + 직접 선택 유도.
- 진입 2곳: `SettingsScreen` 거주 국가 항목 아래 "거주 지역"(현재 값 표시, 탭→시트), `SnapRecordScreen` 저장 직후 거주국 스냅 && `homeRegion==null` && `!homeRegionPromptShown` → 시트 1회(닫아도 `promptShown=true`).

### 3. 링 묶음 규칙 — 순수 함수 `groupSnapRings` (`utils/snapStrip.ts`, verify)
입력: 스냅 배열(작성자 handle, timestamp, countryName, regionName, tripGroupId, snapDaily, 열람 여부), 옵션.
- 키: `snapDaily` → `${handle}::daily`; `tripGroupId` → `${handle}::trip:${id}`; 둘 다 없으면 `${handle}::${country}::${region||''}` 안에서 timestamp 정렬 후 **7일 초과 간격마다 새 묶음**(`::b{n}`).
- 대표 = 묶음 안 최신 스냅, `_hasUnviewed`는 묶음 안 어느 하나라도.
- 순서: 여행 링은 기존 규칙(안 본 것 먼저, 전부 봤으면 오래된 순) 유지 → **일상 링(내 것·남의 것 전부)은 그 뒤에**(안 본 일상 먼저, 그 다음 오래된 순).
- `putMineFirst`는 **여행 링에만** 적용. 내 여행 링이 없으면 '내 스냅 +' 자리표시가 앞에 오고 내 일상 링은 뒤에 남는다.
- 라벨: `snapDaily` → i18n `snap.dailyRing`("일상") + 집 아이콘(기존 아이콘 자원 재사용, 없으면 SVG 한 줄); 국내 여행 → `regionName`; 해외 → 나라명(기존). 링 탭은 지금처럼 대표 스냅 `PostDetail`.
- `SocialScreen.snapItems`는 이 함수 호출로 교체(열람 판정·차단 필터는 기존 그대로 앞단에서).

### 4. 손댈 파일
`src/screens/SocialScreen.tsx`, `src/utils/snapStrip.ts`(+`.verify.ts`), `src/screens/SnapRecordScreen.tsx`, `src/store/recordStore.tsx`(타입 `snapDaily`, `addRecord`/링크 반환값), `src/store/settingsStore.tsx`, 새 `src/components/HomeRegionSheet.tsx`, `src/screens/SettingsScreen.tsx`(진입 1항목), `src/i18n/locales/ko.ts`·`en.ts`, `src/store/persist.ts`(키 필요 시). 서버 SQL 없음.

### 5. 범위 밖
과거 국내 스냅 지역 소급, 여행 안 스냅 연속 뷰어, 프로필 테이블 거주 지역 공개, 온보딩 단계 추가.

### 6. 검증
- `snapStrip.verify.ts`: daily/trip/폴백 키, 7일 경계(정확히 7일=같은 묶음, 초과=분리), 대표=최신, 일상 링 항상 뒤, 안 본 일상 우선, 내 여행 링 없을 때 자리표시, 남의 daily도 뒤.
- `homeRegions`/normalize는 기존 verify 유지. `tsc` 0, `npm test` 기준선.
- 실기기: 서울 거주 설정 → 서울 스냅이 "일상" 링 뒤쪽, 부산 스냅이 "부산" 링, 일본 스냅이 일본 링; 위치 거부 시 직접 선택 흐름.
