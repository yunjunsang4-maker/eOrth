# 온보딩 시점 이미 장기체류 중인 사용자 설계 (A-full)

**작성일:** 2026-07-16
**전제:** 장기체류(Stay) 모드가 이미 구현·병합됨 (`docs/superpowers/specs/2026-07-16-long-stay-mode-design.md`). 이 문서는 그 확장.

## 배경 · 목표

장기체류 기능은 "해외로 나가는 순간"을 감지해 프롬프트를 띄운다. 하지만 **이미 해외에 장기체류 중인 상태에서 앱을 처음 설치**하는 사용자(예: 3개월째 일본 교환학생)는 그 전환이 없다. 자동 프롬프트가 초기값→감지 전환으로 뜨긴 하나:
- "○○에 오셨네요" 문구가 어색
- 체류 시작이 설치 시점부터라 실제 기간(4월~)이 안 담김
- 과거 사진 가져오기(TravelImport)가 체류국 사진을 "해외 여행"으로 오분류

**목표:** 온보딩에서 "지금 장기체류 중"을 선언하게 하고, 과거 사진 가져오기가 그 체류국 사진을 **체류 카드로 흡수**하며 **시작일이 실제 사진 날짜로 자동 백데이팅**되게 한다.

**비목표:** 기존 장기체류 감지·프롬프트·통계 로직 변경 없음(재사용만). import 클러스터링 알고리즘 변경 없음.

## 확정 결정 (Locked Decisions)

1. **온보딩 BasicInfoScreen에 항상 노출** — 거주국가 아래 "장기체류 중" on/off 토글(기본 OFF).
2. 토글 ON이면 펼쳐서: **체류 국가**(모달 선택, 거주국 제외) + **체류 유형**(인라인, 교환/어학/인턴/워홀/기타).
3. **시작일 입력 없음** — 흡수/기록의 가장 이른 날짜로 자동 백데이팅(사진 없으면 오늘).
4. **import 흡수** — 가져오기에서 체류국 사진은 체류 카드로, 제3국은 별도 여행 카드로, 거주국은 제외(기존).
5. **안전 전략** — `clusterForeignTrips`(검증된 클러스터링)는 불변. 라우팅은 **카드 생성 확정 단계**에서만 분기.

## 온보딩 UI (BasicInfoScreen)

거주국가 섹션(현재 292–305행) 아래에 추가:

```
거주국가            🇰🇷 대한민국   [변경]
─────────────────────────────
장기체류 중            [토글 ON/OFF]
  체류 국가          🇯🇵 일본       [변경]   ← ON일 때만
  체류 유형          [교환][어학][인턴][워홀][기타]  ← ON일 때만, 작게
```

- 상태: `stayOn: boolean`(기본 false), `stayCountry: Country | null`, `stayType: StayType`(기본 'exchange').
- 체류 국가 모달은 거주국 선택 모달 패턴 재사용, **거주국(selectedCountry)과 같은 나라는 제외**.
- `canContinue` 확장: `stayOn`이면 `stayCountry`가 있어야 진행 가능.
- 토글 OFF면 아무것도 안 뜸 → 일반 사용자 마찰 최소.

## 체류 생성 타이밍

BasicInfoScreen은 RecordProvider 안(확인됨)이라 `useRecords().startStay` 사용 가능.

`handleFinish`(현재 147–154행)에서 거주국 저장 뒤, TravelImport로 이동하기 **전에** 체류 생성:
```ts
setHomeCountryCode(codeOf(selectedCountry));
// ...
if (stayOn && stayCountry) startStay(stayCountry.name, stayType); // import가 체류를 알도록 이동 전에
navigation.navigate('TravelImport');
```
`startStay`는 이미 "동시 체류 1개" 가드가 있어 중복 안전. 시작일(startedAt)은 오늘로 생성되고, 흡수 시 당겨진다(아래).

## 자동 백데이팅

체류 카드의 `stay.startedAt`은 표시용 시작일. 기록(사진)이 체류 카드에 붙을 때, 그 기록의 여행 날짜가 현재 startedAt보다 이르면 startedAt을 그 날짜로 당긴다. `lastActiveAt`은 건드리지 않는다(현재 체류 중이므로 넛지 판정은 now 기준 유지 — 백데이팅이 넛지를 오발화시키지 않음).

recordStore에 헬퍼: 체류 카드에 기록을 붙이는 경로(import 흡수·실시간 append 공통)에서 `startedAt = min(startedAt, recDate)` 적용.

## import 흡수 (안전 라우팅)

**클러스터링 불변.** `clusterForeignTrips`는 그대로 체류국 사진도 7일 갭으로 후보를 만든다. 라우팅은 **카드 실제 생성 지점**(TravelImportScreen `handleImport`→`ImportPhotoSelect` 하류의 확정 로직 — 계획에서 정확한 위치 확정)에서만:

- 선택된 후보의 국가 == 진행 중 체류국 → **체류 카드에 사진 흡수**(체류 TripGroup에 앨범/기록 append), 새 여행 카드 만들지 않음. 흡수된 사진들의 최이른 날짜로 startedAt 백데이팅.
- 국가 == 제3국(거주국·체류국 아님) → 기존대로 별도 여행 카드.
- 국가 == 거주국 → 기존대로 제외.

**순수 분류 함수로 분리:** `classifyImportTarget(tripCountryName, homeCountryName, stayCountryName) → 'stay' | 'trip' | 'skip'` — verify로 단위 검증. 화면은 이 결과로 분기만.

**선택 UI:** 체류국 후보에는 작은 라벨("체류에 포함")을 붙여 사용자가 인지하게 한다(폴리시 최소 — 여러 클러스터로 보여도 흡수 시 한 체류 카드로 합쳐짐).

## 엣지 케이스

- 토글 ON인데 체류국 미선택 → 진행 불가(canContinue).
- 체류국 == 거주국 → 모달에서 제외(선택 자체 차단).
- import 건너뛰기 → 체류 카드는 오늘 시작 빈 카드로 남고, 이후 실시간 기록으로 자연 당겨짐.
- 이미 온보딩에서 체류 생성됨 → 앱 진입 후 위치 감지가 체류국을 잡아도 `decideOnVisitedChange`가 "체류국·active"로 보고 프롬프트 안 띄움(중복 방지, 기존 로직).
- 사진 가져오기의 체류국 후보가 MIN_TRIP_PHOTOS 미만이라 목록에서 빠져도 문제 없음(흡수는 선택된 것만).

## 영향 받는 파일

- `src/screens/BasicInfoScreen.tsx` — 토글·체류국 모달·유형, handleFinish에서 startStay
- `src/store/recordStore.tsx` — 체류 카드 기록 append 시 startedAt 자동 백데이팅(흡수·실시간 공통 헬퍼)
- `src/utils/importRouting.ts`(신규) + `.verify.ts` — `classifyImportTarget` 순수 함수
- `src/screens/TravelImportScreen.tsx` / `ImportPhotoSelectScreen`(확정 지점) — 흡수 라우팅, 체류국 후보 라벨
- `src/i18n/locales/ko.ts`·`en.ts` — 온보딩 토글·라벨 문구
- (기존 재사용: `startStay`, `stayMachine`, 체류 카드 렌더)

## 검증

- `classifyImportTarget`·백데이팅 순수 로직 → `*.verify.ts`(tsx 실행).
- `npx tsc --noEmit`.
- 수동 플로우: 온보딩에서 토글 ON→일본·교환학생 선택→사진 가져오기→일본 사진이 체류 카드로 흡수·시작일이 최이른 사진 날짜로→제3국 사진은 별도 여행 카드→거주국 사진 제외. 토글 OFF 사용자는 기존 온보딩 그대로(회귀 없음).

## 롤아웃 노트

- 서버 스키마 변경 없음(체류 컬럼은 이미 존재). 순수 클라이언트 변경.
- 기존 사용자·토글 OFF 신규 사용자는 온보딩·import 동작 불변.
