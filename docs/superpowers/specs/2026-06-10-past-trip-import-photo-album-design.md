# 선택한 과거 여행 불러오기 → 사진 선택 → 프로필 앨범 카드 (설계)

- 작성일: 2026-06-10
- 대상: eOrth (React Native + Expo)
- 상태: 설계 승인됨 → 구현 계획 작성 예정

## 1. 배경 / 목표

`TravelImportScreen`에서 발견된 과거 해외 여행을 선택해 "불러오기"를 누르면, **각 여행의 사진 중 최대 30장을
선택**하고, 완료 시 선택 사진의 **원본을 앱에 복사 저장**해 **프로필에 여행기록카드(안에 사진첩)** 를 만든다.

### 현재 상태 (확인됨)
- `TravelImportScreen.handleImport`는 선택 여행마다 `addRecord(viewType:'feed', medias:[대표사진])`만 한다(사진 선택·원본 복사 없음).
- `ScannedTrip.medias`는 대표 1장만 노출(클러스터 내부엔 전체 사진 URI `c.photos`가 이미 모여 있음).
- 프로필 카드: `ProfileScreen`이 하드코딩 `TRIP_THUMBNAILS`(+ 가변 `CURRENT_TRIP_THUMBNAILS`, `trips` 상태)로 렌더. `recordStore.tripGroups` 기반 `mappedThumbnails`도 계산되나 현재 렌더에는 미사용(혼재).
- `TripThumbnail { id, emoji, title, country, countryFlag, date, color, records:{id,viewType}[] }` — 카드는 여러 record를 묶는 단위, 탭 → `TripDetail`.
- `expo-file-system`은 **의존성에 없음** → 추가 시 dev 클라이언트 **재빌드** 필요. (`expo-media-library`, `expo-image-manipulator`는 있음)
- `recordStore`: `addRecord`, `tripGroups`, `addTripGroup` 존재. `TravelRecord`에 `viewType:'album'`, `medias`, `visibility` 등 있음.

## 2. 핵심 결정 사항 (확정)

1. **원본 저장 = 앱 내부 복사.** `expo-file-system`으로 선택 사진 원본을 앱 저장소(`documentDirectory`)에 복사해
   영구 보관(갤러리에서 지워도 유지). 이는 **저장공간 기반 수익화**의 근거. (의존성 추가 → 재빌드 필요)
2. **프리미엄/재화/슬롯 구매는 범위 밖.** 사진 한도를 단일 상수 `MAX_PHOTOS_PER_TRIP = 30` 으로 두어
   나중에 프리미엄이 값만 올리는 **seam**으로 설계. 지금은 30 고정.
3. **사진 선택 = 순차 위저드(여행시간순).** 여행 1개씩 사진 그리드에서 ≤30 선택 → 다음 → … → 완료.
4. **완료 시:** 여행별 **앨범 record**(viewType:'album', medias=복사된 원본 URI) 생성 + 프로필 카드로 표시.
   여러 여행이면 **여행시간순으로 카드 생성**.

## 3. 흐름

```
TravelImport(여행 선택) → [불러오기]
  → ImportPhotoSelectScreen (위저드)
      여행1(시간 빠른 것부터) 사진그리드: ≤30 선택 → [다음]
      여행2 … → [완료]
  → 각 여행: 선택 원본 복사(FileSystem) → 앨범 record 생성 + TripGroup 생성
  → 프로필 이동, 여행기록카드(사진첩) 표시
```

## 4. 컴포넌트 / 파일

- **`src/screens/ImportPhotoSelectScreen.tsx` (신규):** 순차 위저드.
  - 입력(route params): `trips: ImportTripInput[]` (시간순 정렬), 각 `{ id, countryName, countryFlag, country, startDate, endDate, title, photos: string[] }`.
  - 상태: 현재 여행 인덱스, 여행별 선택 URI 집합. 상단 진행표시 `n/total`, 카운터 `선택/30`.
  - 30 초과 선택 차단. "다음"/"완료"(마지막) 버튼.
  - 완료 → `onComplete` 로 여행별 선택 결과를 넘겨 저장 처리 → 프로필 이동.
- **`src/utils/pastTripScan.ts` (소폭, additive):** `ScannedTrip`에 `photos: string[]` 추가, `clusterForeignTrips`에서
  `photos: c.photos`로 채움. (`medias`는 그대로 [첫 장] → verify 통과)
- **`src/utils/importPhotoStore.ts` (신규):** 원본 복사 유틸.
  - `copyOriginals(tripId, uris): Promise<string[]>` — 각 URI를 `documentDirectory + 'trips/'+tripId+'/'` 로 `FileSystem.copyAsync`. iOS `ph://` 자산은 `MediaLibrary.getAssetInfoAsync`의 `localUri`로 해석 후 복사. 실패한 장은 건너뛰고 성공 URI만 반환.
- **`src/screens/TravelImportScreen.tsx` (수정):** `handleImport` → 선택 여행을 **시간순 정렬**해 `ImportPhotoSelectScreen`으로 네비게이트(각 여행의 `photos` 포함). (직접 addRecord 제거)
- **`src/store/recordStore.tsx` (수정):** import 저장 헬퍼 — 여행별 album record 생성 + 묶는 TripGroup 생성(기존 `addRecord`/`addTripGroup` 재사용 또는 전용 액션 추가).
- **`src/screens/ProfileScreen.tsx` (수정·연결부):** tripGroup(또는 import로 추가된 카드)을 **실제 렌더**하도록 카드 소스를 정리해 import된 여행이 카드로 보이게 한다. 카드 탭 → 사진첩(앨범 그리드).
- **`App.tsx`/`package.json`:** `expo-file-system` 추가(+ dev 재빌드).

## 5. 데이터

- **앨범 record:** `{ user, country, countryName, countryFlag, date, startDate, endDate, content:'', medias:[복사원본URI…], isMyPost:true, visibility:'private', viewType:'album' }`.
- **프로필 카드:** import된 여행을 카드 단위로 묶어 표시(앨범 record를 그 카드의 사진첩으로).
- **원본 파일 경로:** `FileSystem.documentDirectory + 'trips/' + tripId + '/' + index + '.jpg'`.

## 6. 한도 (프리미엄 seam)

- `export const MAX_PHOTOS_PER_TRIP = 30;` (위저드가 단일 참조). 선택이 한도에 도달하면 추가 선택 비활성 + "30/30" 표시.
- 나중에 프리미엄 권한/구매 슬롯이 이 한도값만 조정하도록 (예: `getMaxPhotos(entitlement)`)을 위한 단일 지점.

## 7. 에러 처리

- 권한/파일 복사 실패: 실패한 사진은 건너뛰고 성공분만 저장, 사용자에게 일부 실패 시 토스트.
- 선택 0장인 여행: 그 여행은 카드 생성 건너뜀(또는 최소 1장 안내).
- 저장 중 로딩 인디케이터, 완료 후 프로필로 `reset`.

## 8. 범위 밖 (이번 작업 아님)

- 프리미엄 권한·앱내 재화·슬롯 구매·IAP(결제) — seam만.
- 임포트 사진 편집/캡션/순서변경.
- 프로필 카드 시스템 전면 재설계(하드코딩 카드 제거 등) — 이번엔 import된 여행이 카드로 보이게 하는 최소 연결만.

## 9. 검증

- `npx tsx src/utils/pastTripScan.verify.ts` → ALL PASS (additive `photos` 추가 후에도).
- `npx tsc --noEmit` 통과.
- 여행 1개 선택 → 위저드 1단계 → 완료 → 프로필에 그 여행 카드 + 사진첩.
- 여러 개 선택 → 시간순 위저드 → 시간순 카드 생성.
- 30장 초과 선택 차단.
- 완료 후 갤러리에서 원본 삭제해도 앱 사진첩 사진 유지(복사 확인).

## 10. 단계 (구현 시 분리 가능)

- **Phase 1:** `expo-file-system` 추가 + 원본 복사 유틸 + `ScannedTrip.photos` 노출.
- **Phase 2:** `ImportPhotoSelectScreen` 위저드 + TravelImport 네비게이션.
- **Phase 3:** 저장(album record + TripGroup) + 프로필 카드 연결.
