# 지구본 국가 대표사진 핀 설계

**목표:** 이미 사진으로 활성화된 나라에 같은 여행의 새 기록을 추가할 때 ① 대표사진 지정을 강제하지 않고 ② 지구본의 그 나라 사진이 저장 시 확인 없이 자동으로 덮어써지지 않도록 한다.

**배경(현재 동작):** 지구본의 국가 사진은 `MainScreen.getCountryPhoto()`가 그 나라 기록 중 **가장 최신 기록의 대표사진(없으면 첫 미디어 등)**을 매 렌더 계산해서 쓴다(저장된 값 없음, 최신순 폴백). 그래서 같은 나라에 새 기록을 추가하면 그 사진이 즉시 국가 대표가 되고, `NewRecordScreen`은 사진 있는 기록에 대해 `representativePhoto` 미지정 시 저장을 막는다(`missRepPhoto`).

**해결 방식(승인됨):** 국가별 "대표사진 핀"을 명시적으로 저장(Approach A). 핀이 있으면 `getCountryPhoto`가 핀을 우선 사용하고, 없으면 기존 최신순 로직으로 폴백(하위호환). 핀은 **충돌이 생길 때만(2번째+ 기록)** 지연 생성한다.

**기술 스택:** React Native/TypeScript, recordStore(Context + persist).

---

## 1. 데이터 모델

`recordStore`에 영속 상태 추가:

```ts
export interface CountryCover { recordId: string; uri: string }
// key = 정규화된 국가명(records의 countryName, 읽을 때 koAliases로 매칭)
countryCovers: Record<string, CountryCover>;
```

- 영속: persist envelope(recordStore.tsx:437 `useMemo(() => ({ records, ... }))`)와 restore, `exportLocalStateBackup`/`applyLocalStateBackup`, `resetRecords`에 `countryCovers` 포함.
- Context 값·타입(`RecordContextType`)에 `countryCovers`와 아래 함수들 노출.

## 2. getCountryPhoto 중앙화 + 핀 우선

현재 `MainScreen`의 `getCountryPhoto` useCallback을 **recordStore로 이동**해 selector로 노출(MainScreen·NewRecordScreen 공유). 시그니처·폴백 로직은 그대로 두고 맨 앞에 핀 우선 분기만 추가:

```ts
// recordStore 내부
const getCountryCover = useCallback((countryName: string): CountryCover | null => {
  for (const a of koAliases(countryName)) {
    const pin = countryCovers[a];
    if (pin && records.some((r) => r.id === pin.recordId)) return pin; // 핀 기록이 살아있을 때만 유효
  }
  return null;
}, [countryCovers, records]);

const getCountryPhoto = useCallback((countryName: string): string | null => {
  const pin = getCountryCover(countryName);
  if (pin) return pin.uri;
  // ── 이하 기존 최신순 폴백 로직 그대로 (perCountryData → representativePhoto → cut/snap → medias[0]) ──
  ...
}, [getCountryCover, records]);
```

- MainScreen은 로컬 `getCountryPhoto` 제거하고 `useRecords().getCountryPhoto` 사용. 기존 base64 캐시(globePhotoCacheRef)는 그대로.

## 3. 핀 조작 함수 (recordStore)

```ts
// 현재 국가 대표사진을 그대로 고정('유지'). 이미 핀 있으면 no-op.
freezeCountryCover(countryName: string): void
//   구현: getCountryCover가 있으면 return; 없으면 현재 getCountryPhoto가 나온 '그 기록'을 찾아
//   countryCovers[정규화키] = { recordId, uri }. (그 기록을 찾는 내부 헬퍼 getCountryPhotoRecord 사용)

// 특정 기록의 사진으로 핀 교체('바꾸기'/'첫 활성화').
setCountryCover(countryName: string, recordId: string, uri: string): void
```

- 정규화 키: `koAliases(countryName)[0]`(대표 별칭) 하나로 저장, 읽을 때 모든 alias 확인.

## 4. NewRecordScreen 흐름

- 선택된 국가의 **활성화 여부** 판정: `activated = !!getCountryPhoto(country)` (현재 편집 중인 기록 제외 — 신규는 아직 records에 없으므로 자연히 제외됨).
- **저장 검증 완화**(현 963행 `if (!representativePhoto) return missRepPhoto`):
  - `if (!representativePhoto && !activated) return missRepPhoto;` — 활성화된 나라면 미지정 허용.
- **저장 시 처리:**
  1. `activated === false`(첫 기록): 기존대로 `representativePhoto` 필수. 저장 후 핀은 만들지 않음(기록 1개라 최신=자기 자신).
  2. `activated === true`:
     - `representativePhoto` **미지정**: 저장 전에 `representativePhoto = medias[0]`로 자동 지정(카드 커버용). 저장 후 `freezeCountryCover(country)` — 현재 국가사진 고정(새 기록이 최신순으로 덮지 않게).
     - `representativePhoto` **지정 && `representativePhoto !== getCountryPhoto(country)`**: 저장 커밋 직전에 **확인 모달** 표시:
       - 제목/본문: `newRecord.coverConflictTitle`/`coverConflictBody`(나라명 포함) — "이 사진을 {{country}} 지구본 대표로 바꿀까요?"
       - **[유지]** → 저장 후 `freezeCountryCover(country)`
       - **[바꾸기]** → 저장 후 `setCountryCover(country, newRecordId, repHiRes)`
     - `representativePhoto` 지정이지만 현재 국가사진과 **동일**: 프롬프트 생략, `freezeCountryCover(country)`.
- 확인 모달은 저장 플로우를 잠깐 멈추고 선택 후 실제 저장(addRecord)을 완료 → 새 recordId로 핀 설정. (신규 기록 id는 addRecord 반환값 사용)

## 5. 핀 정합성(수명주기)

- **기록 삭제(`deleteRecord`)**: `countryCovers`에서 `recordId === 삭제 id`인 핀 제거 → 자동 폴백(최신). (getCountryCover의 "기록 살아있음" 체크로도 방어되나, 명시적 제거로 맵을 깔끔히 유지)
- **기록 편집으로 대표사진 변경(`updateRecord`)**: 편집 기록이 어떤 나라의 핀이면 그 핀 `uri`를 새 대표사진으로 갱신.
- **resetRecords / applyLocalStateBackup**: `countryCovers`도 초기화/복원.

## 6. 범위·엣지케이스

- **범위**: 핀의 **설정·프롬프트는 사진(피드) 기록 흐름(NewRecordScreen)**에서만. 블로그/네컷 기록은 핀이 있으면 **덮지 않음(유지)**만 하고 프롬프트는 없음(추후 확장). 사용자가 말한 시나리오(피드 사진 기록) 완전 해결.
- 첫 활성화가 블로그/네컷이어도, 이후 피드 기록의 프롬프트/freeze가 그 사진을 핀으로 고정 가능.
- 지정 사진 == 현재 국가사진이면 프롬프트 생략.
- 지역 태그(perCountryData) 기록도 `koAliases` 정규화로 동일 처리.
- 확인 UI: 앱 톤 커스텀 모달(신규 소형 컴포넌트) 또는 `Alert`. 기본은 커스텀 모달(브랜드 일관).

## 7. 테스트/검증

- `npx tsc --noEmit`
- ko/en 키셋 파리티(신규 i18n 키 `newRecord.coverConflictTitle`/`coverConflictBody`)
- 수동 QA:
  1. 새 나라 첫 사진기록 → 대표사진 필수 유지, 지구본 활성화(핀 없음)
  2. 같은 나라 2번째 사진기록, 대표 미지정 → 저장됨, 지구본 사진 그대로(카드 커버=첫 사진)
  3. 2번째 기록 대표 지정(다른 사진) → "바꿀까요?" → 유지: 지구본 그대로 / 바꾸기: 새 사진
  4. 핀 기록 삭제 → 지구본이 다른 기록으로 폴백
  5. 기존 데이터(핀 없는 나라)들 회귀 없음

## 성공 기준

- 이미 활성화된 나라의 새 사진기록에서 대표사진 미지정으로도 저장된다.
- 대표사진을 지정해도 확인(유지/바꾸기) 없이는 지구본 국가 사진이 바뀌지 않는다.
- 기존 기록·나라·삭제·편집·백업 회귀 없음(핀 없으면 기존 최신순 동작).
