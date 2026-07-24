# 장기체류(Stay) 모드 설계

**작성일:** 2026-07-16
**관련 메모:** `eorth-longstay-record-idea`(구상 단계였던 아이디어의 확정본), `eorth-trip-session-grouping`(여행 세션 규칙)

## 배경 · 목표

핵심 타깃(20대) 중 **교환학생·어학연수·인턴십·워킹홀리데이 등 해외 장기체류자**를 위한 기록 방식.

한 학생이 "체류 중엔 거주국가를 체류국으로 바꾸겠다"고 했는데, 실제 코드상 **거주국가는 앱의 여행 판정 기준점**이라 수동으로 바꾸면 부작용이 크다:
- 잠깐 귀국 시 "한국 여행 카드" 오생성·통계 오염
- 되돌리기를 까먹으면 귀국 후에도 국내 기록이 계속 "해외"로 기록됨
- 바꾸는 순간 진행 중이던 해외 세션 강제 종료·카드 파편화
- 과거 여행 불러오기가 체류국 사진을 전부 제외

**목표:** 거주국가를 **바꾸지 않고**, "체류(Stay)"라는 별도 레이어로 장기체류를 표현한다. 체류국 일상은 하나의 열린 체류 카드로 묶이고, 부작용은 설계상 제거된다.

**비목표:** 거주국/여행의 근본 모델 변경 없음. 복잡한 다중 체류 관리 UI 없음(시작/종료만).

## 확정 결정 (Locked Decisions)

1. **체류는 가산 레이어 — 거주국가는 절대 안 바뀐다.**
2. 체류 1건 = **열린(open-ended) 체류 카드 1장, 기간 무제한.**
3. 해외 감지 시 **"여행 / 장기체류" 프롬프트**로 진입.
4. 체류 중 다른 나라 여행 → **별도 여행 카드**(체류 카드엔 체류국 기록만).
5. 체류국은 **방문국으로 카운트**(지구본 색칠 + 방문국 수 + 배지). 단 기록은 체류 카드로 묶임.
6. 위치 표시: 체류 중 **"체류 중"**(내 프로필 + 이웃 모두). "여행 중"과 구분.
7. 잠깐 귀국 → **일시정지(종료 아님)**. 그동안 위치는 거주국 표시. 복귀 시 **재프롬프트 없이 같은 카드 재개.**
8. 종료: **60일 무복귀 넛지 1회** + **위치 표시 탭 → "체류 종료"** 수동 출구. 종료일 = 마지막 체류국 기록일.
9. 통계는 **현재 거주국 기준 동적 계산** → 실제 거주국 변경 시 자동 재집계.
10. 체류 유형: **교환학생 / 어학연수 / 인턴십 / 워킹홀리데이 / 기타.**

## 데이터 모델

체류 카드는 **기존 `TripGroup`을 재사용**한다(카드 렌더·records[]·병합·서버 백업 인프라 그대로). `TripGroup`에 선택 메타를 추가:

```ts
// src/store/recordStore.tsx — TripGroup 확장
interface TripGroupStayMeta {
  type: 'exchange' | 'language' | 'intern' | 'workingHoliday' | 'other';
  status: 'active' | 'paused' | 'ended';
  startedAt: string;   // YYYY-MM-DD (체류 시작)
  endedAt?: string;    // 종료일 (미종료면 없음)
}
interface TripGroup {
  // ...기존 필드...
  stay?: TripGroupStayMeta;  // 있으면 체류 카드, 없으면 일반 여행 카드
}
```

- 체류 카드는 `stay` 메타를 가진 `TripGroup`. 일반 여행 카드와 records/커버 로직 공유.
- **진행 중 체류는 동시에 최대 1개**(한 시점에 한 나라 체류). 여러 체류는 시간순으로 각각 별도 카드(status='ended').
- 로컬 저장(기존 tripGroups persist) + 서버 백업(user_trip_state, 기존 경로에 stay 필드 포함).

## 생애주기 (상태 머신)

기존 `recordStore`의 `linkRecordToTrip`(502–547)·도착 감지 useEffect(549–559)를 확장한다.

**진입:**
- 도착 감지(`arrivalDetect` ON)로 `currentVisitedCountryCode`가 **거주국 아닌 새 나라**로 전환 + 그 나라에 진행 중 체류/여행 결정 없음 → **프롬프트 모달**:
  - **여행** → 기존 여행 세션/카드 동작(변경 없음).
  - **장기체류** → 유형 선택 → 체류 카드 생성(`stay.status='active'`, `startedAt=오늘`), tripSession을 이 카드로 설정.
  - 닫기(dismiss) → 기본 **여행**.
- **감지 OFF 사용자 폴백:** 위치 표시 탭 또는 해외 첫 기록 작성 시 "장기체류 시작" 수동 진입 제공.

**체류 진행 중(active):**
- 체류국 실시간 기록 → 체류 카드에 append(기존 세션 append 로직 재사용).
- 체류국 기록에 **지역 프리셋 ON**(국내와 동일하게 `getHomeRegions`를 체류국 기준으로), **"해외!" 스냅 알림 억제**(`isAbroad` 판정 시 체류국도 홈처럼 취급).

**체류국 이탈 → 일시정지(paused):**
- **거주국(한국) 복귀:** 국내 기록(카드 없음, 거주국 불변), 위치 표시 = 거주국, 체류 status='paused'.
- **제3국 여행:** 별도 여행 카드(결정 4), 체류 status='paused'.
- `countryGuessed`(위치 폴백) 기록은 이탈/종료 신호로 쓰지 않음(기존 가드 재사용).

**체류국 복귀 → 재개:**
- 진행 중(paused) 체류가 있는 나라로 다시 감지 → **프롬프트 없이** 같은 카드 status='active'로 재개, 은은한 토스트("일본 체류를 이어가요").

**종료(ended):**
- **넛지:** 체류국에 **60일** 무복귀 + 거주국/타지에 체류 → 앱 진입 시 **1회** "체류가 끝났나요?" → 종료 or "아직요"(paused 유지).
- **수동:** 위치 표시 탭 → 시트 → "체류 종료"(+ "체류 카드 보기").
- 종료 시 `status='ended'`, `endedAt` = **마지막 체류국 기록일**. 이후 그 나라 재방문은 새 여행/체류로 판정(종료된 체류는 재개 안 함).

## 위치 표시

내 프로필(`ProfileScreen` 1878–1890) + 이웃 프로필(`FriendProfileScreen` 134–141) 공통 규칙:

| 상태 | 표시 | 탭 동작 |
|------|------|--------|
| 체류 진행 중 | `🇯🇵 일본 체류 중` | 시트: 체류 종료 / 체류 카드 보기 |
| 체류 일시정지·거주국에 있음 | `🇰🇷 대한민국` | 없음 |
| 단순 여행 중 | `🇯🇵 일본 여행 중`(기존) | 없음 |
| 그 외 | 거주국 | 없음 |

**이웃 노출:** 체류 상태를 서버에 동기화해야 이웃이 "체류 중"을 본다.
- `profiles`에 `stay_country`(text, null 가능), `stay_status`(text) 추가. `profiles.country`(거주국)는 그대로.
- `public_profiles` 뷰에 `stay_country`/`stay_status` 노출(거주국과 동일한 이웃 공개 정책).
- `ProfileSync`가 진행 중 체류의 국가/상태를 push, 종료/일시정지 시 null/paused로 갱신.
- `FriendProfileScreen`의 `friendLocation`이 `stay_status='active'`면 체류국을 "체류 중"으로 우선 표시.

## 통계 · 지도 (동적 재집계)

**원칙:** `방문한 나라 = (기록의 모든 나라) − (현재 거주국)`. 항상 **현재 거주국 기준으로 계산**, 기록에 박제하지 않음.

- **현재 문제:** `StatsScreen`(482–506)·`badgeRules`는 거주국을 안 빼서 내 거주국도 방문국에 섞임. → 거주국 제외를 추가(동적).
- **효과 1:** 실제 거주국 KR→US 변경 시 US 제외·KR 편입으로 **자동 재집계**(결정 9).
- **효과 2:** 체류국은 거주국이 아니므로 자연히 방문국 카운트(결정 5)에 포함 — 지구본 색칠·방문국 수·배지 반영.
- **구현:** `computeTravelStats`/`computeEarnedBadgeIds`에 `homeCountryName` 옵션 추가해 `diaryCountries`/`countries` 집계에서 제외. `StatsScreen`의 `visitedCountriesSet`도 거주국 제외. 체류국은 제외 대상 아님.
- 체류국 기록은 통계엔 방문국으로 잡히되, **카드로는 체류 카드에 묶임**(집계와 그룹핑은 독립).

## 체류 카드 비주얼

- 기존 `TripCard`(ProfileVisuals) 레이아웃 재사용 + **구분 배지**: "체류 · 교환학생" 같은 유형 라벨.
- 기간 표기: `2026.3 ~ 진행 중`(미종료) / `2026.3 ~ 2026.8`(종료).
- 프로필 여행 카드 목록에 일반 여행 카드와 함께 노출(정렬은 기존 규칙).

## 엣지 케이스

- 감지 OFF → 수동 시작(폴백).
- 종료된 체류 국가 재방문(나중에 관광) → 종료 체류 재개 안 함, 새 여행/체류 프롬프트.
- 체류국을 과거에 여행한 적 있음 → 별개(체류는 새 카드).
- 앱 진입 시점 감지: 현재 감지 갱신이 프로필 화면 포커스 기준 → 프롬프트를 **홈→해외 전환 순간**에 띄우도록 감지 트리거를 앱 진입/전환 레벨로 조정 필요.
- 동시 진행 체류 1개 제약: 이미 진행 중 체류가 있는데 또 다른 나라 장기체류 시작하려 하면(드묾) 기존 체류 종료 후 신규.

## 영향 받는 파일 (조사 기준)

- `src/store/recordStore.tsx` — TripGroup에 stay 메타, `linkRecordToTrip`/도착 감지에 체류 분기, 재개/일시정지/종료, 60일 넛지 판정
- `src/store/settingsStore.tsx` — (필요 시) 진행 중 체류 상태 브리지/영속
- `src/screens/ProfileScreen.tsx` — 위치 표시 "체류 중" + 탭 시트(종료/카드 보기)
- `src/screens/FriendProfileScreen.tsx` — 이웃 위치에 체류국 반영
- `src/components/ProfileSync.tsx` + `src/services/profile.ts` — stay_country/stay_status push·read
- `supabase/schema.sql` — profiles에 stay_country/stay_status, public_profiles 뷰 확장(사용자가 실행)
- `src/utils/badgeRules.ts` + `src/screens/StatsScreen.tsx` — 거주국 동적 제외(방문국 집계)
- `src/screens/NewRecordScreen.tsx`·`SnapRecordScreen.tsx`·`snapService.ts` — 체류국을 홈처럼(지역 프리셋·해외 알림 억제)
- `src/components/profile/ProfileVisuals.tsx`(TripCard) — 체류 배지·기간 표기
- 신규: 체류 진입 프롬프트 모달 컴포넌트, 체류 유형 선택 UI, i18n 키(ko/en)

## 검증

- `npx tsc --noEmit` 통과.
- 순수 로직(체류 상태 머신: 진입→append→이탈 일시정지→복귀 재개→60일 종료)은 `*.verify.ts`로 단위 검증(기존 badgeRules.verify 패턴).
- SQL(profiles 컬럼·뷰)은 사용자가 Supabase에서 실행 후 이웃 노출 수동 검증.
- 수동 플로우(실기기): 해외 감지→장기체류 선택→체류국 기록 append→방학 귀국(일시정지·국내)→복귀(재개)→제3국 여행(별도 카드)→종료(넛지/수동)→통계·지구본·이웃 위치 확인.

## 확정된 소소한 항목

- 프롬프트에 "다시 안 물어보기" 없음(답하면 그 나라 세션/체류가 생겨 재노출 안 됨). 닫기 = 여행 기본.
- 체류 유형 5종 고정(교환학생/어학연수/인턴십/워킹홀리데이/기타). "기타"는 우선 라벨만(자유 입력은 후속).
