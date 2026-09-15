# 기록 작성 — 기간에 맞춘 사진 자동 불러오기 격자 (2026-09-13)

## 배경
기록 작성(`NewRecordScreen`)은 기간(startDate~endDate)을 고른 뒤에도 사진 추가가 iOS 시스템 선택기(`ImagePicker.launchImageLibraryAsync`)라 사용자가 수천 장에서 직접 찾아야 한다. 사진첩 만들기(`AlbumCreateScreen`)에는 이미 "기간 내 사진 페이지 로드 + 날짜별 필터 + GPS 나라 필터 + 다중 선택 격자"가 있다(`:250-300`, `:355-400`, `:750-900`).

사용자 결정: **기간 사진 격자를 기본으로 띄우고, 격자 안에 "전체 사진첩에서 고르기"를 두어 시스템 선택기로도 갈 수 있게 한다**(1안).

## 결정

### 1. 새 공용 컴포넌트 `components/record/DateRangePhotoSheet.tsx`
`AlbumCreateScreen`의 선택 단계 로직을 옮겨 만든 독립 시트(Modal, `MediaPickerModal`과 같은 재질·색 토큰). props:
```ts
{
  visible: boolean;
  startDate: Date; endDate: Date;          // 하루 경계는 00:00:00~23:59:59.999 (AlbumCreate fetchPage와 동일)
  countryName?: string | null;             // 있으면 GPS 나라 필터 칩 노출(기본 OFF)
  max: number;                             // 이번에 담을 수 있는 남은 장수(>=1)
  excludeUris?: string[];                  // 이미 담긴 원본 uri — 격자에서 '담김' 표시·선택 불가
  onConfirm: (uris: string[]) => void;     // 표시 가능한 uri(iOS localUri 우선) 배열
  onOpenSystemPicker: () => void;          // "전체 사진첩에서 고르기"
  onClose: () => void;
}
```
- 로드: `MediaLibrary.getAssetsAsync({ first: 200, after, mediaType:'photo', sortBy:'creationTime', createdAfter, createdBefore })` 페이지네이션, `onEndReached`로 다음 페이지. 스크린샷(`mediaSubtypes` 'screenshot')은 제외하지 않는다(기록엔 캡처를 넣고 싶을 수 있다).
- iOS `ph://`는 `getAssetInfoAsync({shouldDownloadFromNetwork:false})`로 `localUri` 변환(AlbumCreate와 동일). iCloud 오프로드(localUri 없음)는 셀에 구름 배지, 선택은 허용(기존 `addNewOriginals`가 다운로드·진행률 처리).
- 날짜별 칩(전체/일자), 전체 선택/해제(상한만큼), 꾹 눌러 크게 보기(`PhotoViewerModal`), 권한 limited 안내 — AlbumCreate와 동일 UX.
- GPS 나라 필터: `countryName`이 있을 때만 칩. 판정은 **`utils/photoCountryFilter`(countryLocate 위임)**. 위치 조회는 `isPhotoLocationAvailable`이면 **`fetchLocationsInBatches`로 표시 중인 사진을 한 번에**(iOS Photos DB), 아니면 AlbumCreate 방식(장당 `getAssetInfoAsync`, 10장마다 진행률). GPS 없는 사진은 항상 표시.
- 하단: 주 버튼 "N장 담기"(선택 0이면 비활성) + 보조 링크 **"전체 사진첩에서 고르기"** → `onOpenSystemPicker()`.
- 기간이 바뀌면(props) 목록을 새로 로드하고 선택을 비운다.

### 2. `NewRecordScreen` 연결
- `selectMedia`(:494): 남은 자리 `slots` 계산은 그대로. **기간이 유효하면**(startDate·endDate가 Date) 시스템 선택기 대신 `DateRangePhotoSheet`를 연다(`max=slots`, `countryName=selectedCountries[0]?.name`, `excludeUris=Object.values(originalUriMapRef.current)` + medias 원본).
- `onConfirm(uris)`: 기존 ImagePicker 결과 경로와 **동일한 함수**(`addNewOriginals` → `setMedias`/`setPhotoTexts` 상한 slice)로 흘린다. 새 경로를 만들지 말 것.
- `onOpenSystemPicker`: 시트를 닫고 **닫힘 애니메이션 뒤(≥350ms)** 기존 `launchImageLibraryAsync` 흐름 실행. ⚠️ 이 화면 주석(:1948-1954)이 경고하는 RN Modal ↔ 네이티브 피커 present/dismiss 엇갈림 사고를 밟지 않도록 **시트가 완전히 닫힌 뒤에만** 피커를 띄운다(`onDismiss` 또는 타이머).
- 시트 안 사진 가져오는 중 표시는 기존 `loadingMedia` 절대위치 오버레이 그대로(시트를 먼저 닫고 오버레이).
- 수정 모드(editRecord)도 동일. 기간이 없으면(이론상 없음) 기존 시스템 선택기.
- 시스템 선택기 함수는 `launchSystemPicker`로 분리해 두 진입(시트 링크·폴백)이 같은 코드를 쓴다.

### 3. 손대지 않는 것
`AlbumCreateScreen.tsx`는 이번에 **수정하지 않는다**(자기 격자 유지). 공용 컴포넌트로 옮겨 타는 것은 후속. `PhotoPagerSection`·`MediaPickerModal`·`addNewOriginals` 로직 불변.

### 4. 손댈 파일
새 `src/components/record/DateRangePhotoSheet.tsx`, `src/screens/NewRecordScreen.tsx`(selectMedia 분기·시트 마운트), `src/i18n/locales/ko.ts`·`en.ts`(시트 문구 — 가능한 한 `album.*` 기존 키 재사용, 새 키는 `newRecord.rangePicker*`), 필요 시 `src/utils/photoCountryFilter.ts` 시그니처 재사용만(변경 없음 목표).

### 5. 검증
- 순수 판정(날짜 경계 ms 계산, 상한 내 전체 선택, 제외 uri 처리)은 `utils/dateRangePhotoPick.ts`(+`.verify.ts`)로 빼서 verify.
- `tsc` 0, `npm test` 기준선.
- 실기기 iOS: 기간 7일 지정 → 시트에 그 기간 사진만, 날짜 칩, 나라 필터 ON 시 국내 사진 제외, "전체 사진첩에서 고르기" → 시스템 선택기 정상, 돌아온 뒤 터치 정상(Modal 함정), iCloud 사진 선택 시 다운로드 진행률, 30장 상한.

### 6. 범위 밖
AlbumCreateScreen의 공용 컴포넌트 이전, 영상, 사진 AI 추천 연동.
