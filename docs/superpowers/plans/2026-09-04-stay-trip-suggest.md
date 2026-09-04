# 체류 중 주변국 여행 카드 자동 제안 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 체류 중 앱을 열면 최근 14일 사진에서 체류국 밖 여행 묶음을 찾아 "카드 만들까요?"를 알림 1회 + 홈 배너로 제안하고, 탭 한 번에 과거여행 불러오기와 동일한 카드를 만든다.

**Architecture:** 순수 판정(`stayTripSuggest.ts`) · 영속 저장소(`stayTripSuggestStore.ts`) · 14일 창 소형 스캐너(`recentPhotoCountryScan.ts`) · 카드 생성 훅(`useImportTripsIntoCards.ts`, 불러오기 화면에서 추출) 네 유닛 위에 루트 감지기(`StayTripSuggester`)와 홈 배너(`StayTripSuggestBanner`)를 얹는다. 불러오기 화면의 380줄 스캐너는 건드리지 않는다.

**Tech Stack:** React Native(Expo SDK54), TypeScript, expo-media-library, expo-location, expo-notifications, AsyncStorage. 검증은 `tsx`로 직접 실행하는 `*.verify.ts`(jest/vitest 없음).

**설계 문서:** `docs/superpowers/specs/2026-09-04-stay-trip-suggest-design.md`

## Global Constraints

- 언어: 모든 주석·커밋·결과 설명은 한글.
- 커밋: **이 작업에서 만든 파일만 파일 단위로 스테이징**. `git add -A` 금지(작업 트리에 사용자 WIP가 상시 있다). 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- 브랜치: 현재 HEAD(`feat/photo-ai-pool-input`)에서 `git checkout -b feat/stay-trip-suggest`. master 체크아웃은 작업 트리 WIP 때문에 피한다.
- 검증 파일 규약: `eq()` 헬퍼를 파일마다 재정의, `process.exit(1)`로 실패. 실행은 `node node_modules/tsx/dist/cli.mjs <파일>`. 파이프 금지. `npm test` 기존 실패 1건(`event-config.verify.mjs`의 Supabase 프로젝트 일치)은 `.env` 때문이며 코드 결함이 아니다 — 보고서에 "기존 실패 1건 그대로"라고 적는다.
- 순수 모듈(`src/utils/*.ts`, verify 대상)은 `react-native`·`expo-*`를 최상위 import 하지 않는다(tsx가 로드하지 못한다). 네이티브 호출은 별도 파일이나 지연 require.
- 권한 팝업 금지: 사진·위치 권한은 **조회만**(`getPermissionsAsync`/`getForegroundPermissionsAsync`). App Store 5.1.1 방어.
- 감지기 영속 키는 `src/store/persist.ts`의 `DETECTOR_KEYS`가 유일 정의처. 다른 파일에 문자열 리터럴 복붙 금지(`scripts/snap-detect-guard.verify.mjs`가 검사).
- 알림 identifier 상수 이름은 `*_NOTIF_ID` 형식(가드 규칙 5가 수집). 예약(`trigger: {}`) 알림 금지 — 즉시 발송(`trigger: null`)만.
- 햅틱은 `src/utils/haptics`의 의미 함수(`select`, `success`, `warn`…)만. `expo-haptics` 직접 호출 금지.
- 디자인 토큰: 카드 `#2E2E3B`, 보라 네온 `#BF85FC`, 텍스트 흐림 `#A1A1B0`, 구분선 `#1A1A26`. 텍스트는 `src/ui/Text`.
- i18n: `ko.ts`가 타입 원본이므로 새 키는 **ko.ts와 en.ts 양쪽**에 넣는다.
- `countryName`은 한글 원본(지구본·통계 비교 키). 표시만 `countryLabel(ko, lang)`로 변환.
- 타입 검사: `npx tsc --noEmit`. 각 Task 끝에 실행.

---

## 파일 구조

| 파일 | 책임 | 상태 |
|---|---|---|
| `src/utils/stayTripSuggest.ts` | 제안 판정 순수 함수, 상수, 제안→ScannedTrip 변환, 날짜 표시 헬퍼 | 생성 |
| `src/utils/stayTripSuggest.verify.ts` | 위 검증 | 생성 |
| `src/utils/stayTripSuggestStore.ts` | 대기 제안·거절 키 순수 병합/만료/스누즈 + AsyncStorage 읽기쓰기 + 구독 | 생성 |
| `src/utils/stayTripSuggestStore.verify.ts` | 순수 부분 검증 | 생성 |
| `src/utils/recentPhotoCountryScan.ts` | 날짜 창 사진 → 국가 판정 (버킷 샘플링 조립) | 생성 |
| `src/hooks/useImportTripsIntoCards.ts` | 스캔 여행 → 카드 생성(표지 복사·기록·그룹·풀) | 생성(불러오기 화면에서 추출) |
| `src/screens/TravelImportScreen.tsx` | `handleImport`가 위 훅을 쓰도록 축소 | 수정 |
| `src/store/persist.ts` | `DETECTOR_KEYS` 3개 추가 | 수정 |
| `src/store/settingsStore.tsx` | `NotifPrefKey`에 `stayTripSuggest` 추가 | 수정 |
| `src/screens/NotificationSettingsScreen.tsx` | 토글 행 추가 | 수정 |
| `src/components/StayTripSuggester.tsx` | 루트 감지기 | 생성 |
| `src/components/StayTripSuggestBanner.tsx` | 홈 배너 | 생성 |
| `src/screens/MainScreen.tsx` | 배너 배치 | 수정 |
| `App.tsx` | 감지기 마운트 | 수정 |
| `src/navigation/AppNavigator.tsx` | 알림 탭 라우팅 | 수정 |
| `src/i18n/locales/ko.ts`, `en.ts` | 문구 | 수정 |
| `scripts/snap-detect-guard.verify.mjs` | 새 키 3개·감지기 예외 규칙 등록 | 수정 |

---

### Task 0: 브랜치

- [ ] **Step 1: 브랜치 생성**

```bash
git checkout -b feat/stay-trip-suggest
git status --short
```
Expected: 현재 브랜치가 `feat/stay-trip-suggest`, 사용자 WIP 파일(`.gitignore`, `scripts/event-day-run.ps1`, `src/constants/featureFlags.ts`, `src/screens/SocialScreen.tsx`, `src/utils/feedWindow*.ts`)은 그대로 남아 있다. **이 파일들은 절대 스테이징하지 않는다.**

---

### Task 1: 제안 판정 순수 로직

**Files:**
- Create: `src/utils/stayTripSuggest.ts`
- Test: `src/utils/stayTripSuggest.verify.ts`

**Interfaces:**
- Consumes: `clusterForeignTrips`, `ScannedPhoto`, `ScannedTrip`, `TripTextMaker`, `KO_TRIP_TEXT` (`src/utils/pastTripScan.ts`); `overlapsImportedTrip` (`src/utils/scanSampling.ts`)
- Produces:
  - `interface TripSuggestion { key; country; countryName; countryFlag; startDate; endDate; photoCount; photos: {id?, uri, localUri?, creationTime?}[]; lastPhotoAt: number; detectedAt: number; snoozeUntil?: number }`
  - `suggestStayTrips(input): TripSuggestion[]`
  - `suggestionKey(countryName, startDate, endDate): string`
  - `suggestionToScannedTrip(s, text, sessionId): ScannedTrip`
  - `shortYmd('2026.09.05') → '9.5'`
  - 상수 `MIN_SUGGEST_PHOTOS=5`, `RECENT_WINDOW_MS=14d`, `ENDED_WITH_LOCATION_MS=12h`, `ENDED_WITHOUT_LOCATION_MS=24h`

- [ ] **Step 1: 실패하는 검증 파일 작성**

```ts
// src/utils/stayTripSuggest.verify.ts
import {
  suggestStayTrips, suggestionKey, suggestionToScannedTrip, shortYmd,
  MIN_SUGGEST_PHOTOS, RECENT_WINDOW_MS, ENDED_WITH_LOCATION_MS, ENDED_WITHOUT_LOCATION_MS,
} from './stayTripSuggest';
import type { ScannedPhoto } from './pastTripScan';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const H = 3600_000;
const D = 24 * H;
// 2026-09-07(월) 정오 로컬 — 주말(9/5~9/6) 프라하 여행 뒤 월요일에 앱을 연 상황
const NOW = new Date(2026, 8, 7, 12, 0, 0).getTime();

// 사진 생성 헬퍼 — countryName은 pastTripScan.COUNTRY_FLAGS의 한글 원본과 같아야 한다
function photos(code: string, name: string, flag: string, times: number[], idPrefix = code): ScannedPhoto[] {
  return times.map((t, i) => ({ id: `${idPrefix}-${i}`, uri: `ph://${idPrefix}-${i}`, creationTime: t, countryCode: code, countryName: name, countryFlag: flag }));
}
// 9/5 10:00 ~ 9/6 18:00 사이 6장 (프라하)
const CZ_TIMES = [0, 2, 6, 24, 28, 32].map((h) => new Date(2026, 8, 5, 10).getTime() + h * H);
const cz = photos('CZ', '체코', '🇨🇿', CZ_TIMES);
// 체류국(독일) 일상 사진 — 제외 대상
const de = photos('DE', '독일', '🇩🇪', [NOW - 10 * D, NOW - 3 * D, NOW - 2 * H]);
// 거주국(한국) — 귀국이라 제외 대상
const kr = photos('KR', '대한민국', '🇰🇷', [NOW - 13 * D, NOW - 12 * D + H, NOW - 12 * D + 2 * H, NOW - 12 * D + 3 * H, NOW - 12 * D + 4 * H]);

const base = {
  stayCountryCode: 'DE',
  homeCountryCode: 'KR',
  now: NOW,
  currentCountryCode: 'DE' as string | null,
  importedAssetIds: new Set<string>(),
  existingTrips: [] as { countryName?: string; startDate?: string; endDate?: string }[],
  dismissedKeys: [] as string[],
};

// 정상 경로 — 체류국(DE)에 돌아온 뒤, 끝난 프라하 여행 1건이 제안된다
{
  const out = suggestStayTrips({ ...base, photos: [...de, ...cz] });
  eq(out.length, 1, '정상: 체류국 밖 묶음 1건');
  eq(out[0].countryName, '체코', '정상: 국가명 한글 원본');
  eq([out[0].startDate, out[0].endDate], ['2026.09.05', '2026.09.06'], '정상: 기간 = 첫·마지막 사진 날짜');
  eq(out[0].photoCount, 6, '정상: 사진 수');
  eq(out[0].key, '체코:2026.09.05:2026.09.06', '정상: 키 = 국가명:시작:끝');
  eq(out[0].detectedAt, NOW, '정상: 감지 시각 = now');
  eq(out[0].lastPhotoAt, CZ_TIMES[CZ_TIMES.length - 1], '정상: 마지막 사진 시각 보존');
}

// 체류국·거주국 제외 — 독일 일상 사진과 한국 방문 사진은 제안이 되지 않는다
eq(suggestStayTrips({ ...base, photos: de }).length, 0, '체류국 사진만 = 제안 없음');
eq(suggestStayTrips({ ...base, photos: kr }).length, 0, '거주국(귀국) 사진만 = 제안 없음');
// 대소문자 흔들림 — geo.isoCountryCode가 소문자로 오는 기기가 있다
// (현재 위치도 같은 나라로 맞춘다 — 아니면 '위치 ≠ 체류국' 규칙에 걸려 이유가 다른 채 통과한다)
eq(suggestStayTrips({ ...base, photos: cz, stayCountryCode: 'cz', currentCountryCode: 'CZ' }).length, 0, '체류국 코드 소문자 = 여전히 제외');

// countryCode null(GPS 없음·구간 미확정) 사진은 클러스터 재료가 아니다
eq(suggestStayTrips({ ...base, photos: cz.map((p) => ({ ...p, countryCode: null })) }).length, 0, '국가 미상 사진 = 제안 없음');

// 최소 장수 — 4장은 안 되고 5장부터
eq(suggestStayTrips({ ...base, photos: cz.slice(0, 4) }).length, 0, '4장 = 최소 미달');
eq(suggestStayTrips({ ...base, photos: cz.slice(0, 5) }).length, 1, '5장 = 제안');
eq(MIN_SUGGEST_PHOTOS, 5, '최소 장수 상수 = 5');

// 종료 판정(위치 있음) — 마지막 사진이 12시간 안이면 아직 여행 중일 수 있다
{
  const fresh = photos('CZ', '체코', '🇨🇿', [NOW - 20 * H, NOW - 15 * H, NOW - 11 * H, NOW - 10 * H, NOW - 9 * H]);
  eq(suggestStayTrips({ ...base, photos: fresh }).length, 0, '마지막 사진 9h 전 + 체류국 위치 = 아직 미종료');
  const done = photos('CZ', '체코', '🇨🇿', [NOW - 20 * H, NOW - 18 * H, NOW - 16 * H, NOW - 14 * H, NOW - 13 * H]);
  eq(suggestStayTrips({ ...base, photos: done }).length, 1, '마지막 사진 13h 전 + 체류국 위치 = 종료');
}
// 종료 판정(위치 없음) — 24시간으로 보수적으로
{
  const p = photos('CZ', '체코', '🇨🇿', [NOW - 30 * H, NOW - 28 * H, NOW - 26 * H, NOW - 25 * H, NOW - 20 * H]);
  eq(suggestStayTrips({ ...base, photos: p, currentCountryCode: null }).length, 0, '위치 없음 + 마지막 20h 전 = 미종료');
  const q = photos('CZ', '체코', '🇨🇿', [NOW - 40 * H, NOW - 38 * H, NOW - 30 * H, NOW - 27 * H, NOW - 25 * H]);
  eq(suggestStayTrips({ ...base, photos: q, currentCountryCode: null }).length, 1, '위치 없음 + 마지막 25h 전 = 종료');
}
// 현재 위치가 제3국이면(아직 여행 중) 아무것도 제안하지 않는다
eq(suggestStayTrips({ ...base, photos: cz, currentCountryCode: 'CZ' }).length, 0, '현재 위치 = 여행국 → 제안 없음');
// 현재 위치가 거주국(잠깐 귀국)이어도 제안하지 않는다 — 체류국에 돌아왔을 때만
eq(suggestStayTrips({ ...base, photos: cz, currentCountryCode: 'KR' }).length, 0, '현재 위치 = 거주국 → 제안 없음');

// 자산 id 제외 — 이미 카드에 들어간 사진은 재료에서 빠진다(그 결과 최소 장수 미달)
eq(suggestStayTrips({ ...base, photos: cz, importedAssetIds: new Set(['CZ-0', 'CZ-1']) }).length, 0, '자산 id 2장 제외 → 4장 = 미달');

// 기간 겹침 제외 — 사용자가 피드 글로 직접 남긴 프라하 여행(앨범형 아님)도 걸러야 한다
eq(
  suggestStayTrips({ ...base, photos: cz, existingTrips: [{ countryName: '체코', startDate: '2026.09.06', endDate: '2026.09.06' }] }).length,
  0,
  '같은 나라 + 하루 겹침 기록 있음 = 제외',
);
eq(
  suggestStayTrips({ ...base, photos: cz, existingTrips: [{ countryName: '오스트리아', startDate: '2026.09.05', endDate: '2026.09.06' }] }).length,
  1,
  '다른 나라 기록은 무관',
);
// 기록에 startDate가 없으면(date만 있는 옛 피드 글) 호출부가 date로 채워 넘긴다 — 여기선 빈 값이면 겹침 아님
eq(suggestStayTrips({ ...base, photos: cz, existingTrips: [{ countryName: '체코' }] }).length, 1, '기간 없는 기록 = 겹침 판정 불가 → 제안 유지');

// 거절 키 제외
eq(suggestStayTrips({ ...base, photos: cz, dismissedKeys: ['체코:2026.09.05:2026.09.06'] }).length, 0, '거절한 키 = 제외');
eq(suggestionKey('체코', '2026.09.05', '2026.09.06'), '체코:2026.09.05:2026.09.06', '키 조립');

// 여러 나라 — 빈(오스트리아)+프라하 연속이면 나라별 2건, 최근 종료가 앞
{
  const at = photos('AT', '오스트리아', '🇦🇹', [0, 1, 2, 3, 4].map((h) => new Date(2026, 8, 3, 9).getTime() + h * H));
  const out = suggestStayTrips({ ...base, photos: [...at, ...cz, ...de] });
  eq(out.map((s) => s.countryName), ['체코', '오스트리아'], '2개국 = 2건, 최근 종료 순');
}

// 변환 — 배너가 카드 생성 훅에 넘길 ScannedTrip. id는 세션마다 달라야 한다(표지 폴더 충돌 방지)
{
  const [s] = suggestStayTrips({ ...base, photos: cz });
  const trip = suggestionToScannedTrip(s, { title: (c) => `${c} 여행`, content: (c, n) => `${c} ${n}장` }, 'sess1');
  eq(trip.id, 'suggest-sess1-체코-2026.09.05', '변환: id에 세션 토큰');
  eq([trip.country, trip.countryName, trip.countryFlag], ['🇨🇿 체코', '체코', '🇨🇿'], '변환: 국가 3필드');
  eq([trip.startDate, trip.endDate, trip.date], ['2026.09.05', '2026.09.06', '2026.09.06'], '변환: 날짜 3필드');
  eq(trip.title, '체코 여행', '변환: 제목은 주입된 text로');
  eq(trip.photoCount, 6, '변환: 장수');
  eq(trip.photos.length, 6, '변환: 사진 목록');
  eq(trip.medias, [trip.photos[0].uri], '변환: medias = 첫 사진');
}

// 날짜 표시 — 배너 한 줄용 'M.D'
eq(shortYmd('2026.09.05'), '9.5', '표시: 앞자리 0 제거');
eq(shortYmd('2026.12.25'), '12.25', '표시: 두 자리 유지');
eq(shortYmd(''), '', '표시: 빈 문자열');
eq(shortYmd('이상한값'), '이상한값', '표시: 형식 아니면 원문');

eq(RECENT_WINDOW_MS, 14 * D, '창 = 14일');
eq(ENDED_WITH_LOCATION_MS, 12 * H, '종료(위치 있음) = 12h');
eq(ENDED_WITHOUT_LOCATION_MS, 24 * H, '종료(위치 없음) = 24h');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
```

- [ ] **Step 2: 실패 확인**

Run: `node node_modules/tsx/dist/cli.mjs src/utils/stayTripSuggest.verify.ts`
Expected: 모듈을 찾지 못해 실패(`Cannot find module './stayTripSuggest'`).

- [ ] **Step 3: 구현**

```ts
// src/utils/stayTripSuggest.ts
/**
 * 체류 중 주변국 여행 제안 — 순수 판정 (설계 §1)
 *
 * 왜 사진 기반인가: 체류 일시정지·재개는 프로필 탭 진입에만 걸려 있고 pausedAt도 없다.
 * 주말 여행자는 여행 중 앱을 안 열 확률이 높아 GPS 이벤트에 기대면 복귀를 영영 모른다.
 * 사진은 여행의 증거 그 자체라, 최근 14일 사진에서 체류국 밖 묶음을 찾는 편이 견고하다.
 *
 * 이 모듈은 verify가 tsx로 돌린다 — react-native·expo import 금지.
 */
import { clusterForeignTrips, type ScannedPhoto, type ScannedTrip, type TripTextMaker, KO_TRIP_TEXT } from './pastTripScan';
import { overlapsImportedTrip } from './scanSampling';

const H = 3600_000;

/** 제안에 필요한 최소 장수 — 과거여행 불러오기(10장)보다 낮다. 당일치기 주말여행 대응. */
export const MIN_SUGGEST_PHOTOS = 5;
/** 매 검사에서 다시 훑는 창. 중복 제거가 있어 같은 제안이 두 번 뜨지 않는다. */
export const RECENT_WINDOW_MS = 14 * 24 * H;
/** 종료 판정 — 현재 위치가 체류국일 때: 마지막 사진이 이만큼 지났으면 끝난 여행 */
export const ENDED_WITH_LOCATION_MS = 12 * H;
/** 종료 판정 — 위치를 못 얻었을 때: 보수적으로 24시간 */
export const ENDED_WITHOUT_LOCATION_MS = 24 * H;

export interface SuggestionPhoto {
  id?: string;
  uri: string;
  localUri?: string;
  creationTime?: number;
}

export interface TripSuggestion {
  /** `${countryName}:${startDate}:${endDate}` — 거절·알림·중복 판정의 식별자. 재스캔에도 같은 값 */
  key: string;
  country: string;      // "🇨🇿 체코"
  countryName: string;  // 한글 원본 — 지구본·통계 비교 키라 번역하지 않는다
  countryFlag: string;
  startDate: string;    // 'YYYY.MM.DD'
  endDate: string;
  photoCount: number;
  photos: SuggestionPhoto[];
  lastPhotoAt: number;  // ms — 종료 판정 근거(디버그·재검증용으로 남긴다)
  detectedAt: number;   // ms — 7일 소멸 기준
  snoozeUntil?: number; // ms — '나중에'로 숨긴 경우
}

export function suggestionKey(countryName: string, startDate: string, endDate: string): string {
  return `${countryName}:${startDate}:${endDate}`;
}

export interface SuggestInput {
  photos: ScannedPhoto[];
  stayCountryCode: string;
  homeCountryCode: string;
  now: number;
  /** 위치를 못 얻으면 null — 그때는 24시간 규칙으로 대체 */
  currentCountryCode: string | null;
  /** 기록 mediaAssetIds + 사진 풀 assetIds 합집합 */
  importedAssetIds: Set<string>;
  /** 모든 viewType의 기록. startDate/endDate가 없는 글은 호출부가 date로 채워 넘긴다 */
  existingTrips: { countryName?: string; startDate?: string; endDate?: string }[];
  dismissedKeys: string[];
  text?: TripTextMaker;
}

/**
 * 최근 사진 → 끝난 주변국 여행 제안 목록 (최근 종료 순).
 *
 * 제외 순서: 국가 미상 → 체류국 → 이미 카드에 들어간 자산 → (클러스터링, 거주국은 여기서 제외)
 *           → 최소 장수 → 종료 판정 → 기간 겹침 기록 → 거절 키.
 */
export function suggestStayTrips(input: SuggestInput): TripSuggestion[] {
  const stay = input.stayCountryCode.toUpperCase();
  const cur = input.currentCountryCode ? input.currentCountryCode.toUpperCase() : null;

  // 위치를 아는데 체류국이 아니면(아직 여행 중이거나 잠깐 귀국) 제안할 때가 아니다.
  if (cur !== null && cur !== stay) return [];
  const endedBefore = input.now - (cur === null ? ENDED_WITHOUT_LOCATION_MS : ENDED_WITH_LOCATION_MS);

  const eligible = input.photos.filter((p) => {
    if (!p.countryCode) return false;
    if (p.countryCode.toUpperCase() === stay) return false;
    if (p.id && input.importedAssetIds.has(p.id)) return false;
    return true;
  });
  if (eligible.length === 0) return [];

  // 거주국 제외와 (같은 나라 + 7일) 묶음은 기존 클러스터링 그대로. sessionId는 결정적이어도
  // 된다 — 여기서 만든 id는 저장되지 않고, 카드 생성 시 suggestionToScannedTrip이 새로 만든다.
  const trips = clusterForeignTrips(eligible, input.homeCountryCode, input.text ?? KO_TRIP_TEXT, 'suggest');
  const dismissed = new Set(input.dismissedKeys);

  const out: TripSuggestion[] = [];
  for (const t of trips) {
    if (t.photoCount < MIN_SUGGEST_PHOTOS) continue;
    const lastPhotoAt = t.photos.reduce((m, p) => Math.max(m, p.creationTime ?? 0), 0);
    if (lastPhotoAt > endedBefore) continue; // 아직 진행 중일 수 있다
    if (overlapsImportedTrip(t, input.existingTrips)) continue;
    const key = suggestionKey(t.countryName, t.startDate, t.endDate);
    if (dismissed.has(key)) continue;
    out.push({
      key,
      country: t.country,
      countryName: t.countryName,
      countryFlag: t.countryFlag,
      startDate: t.startDate,
      endDate: t.endDate,
      photoCount: t.photoCount,
      photos: t.photos,
      lastPhotoAt,
      detectedAt: input.now,
    });
  }
  return out; // clusterForeignTrips가 이미 최근 종료 순으로 정렬해 둔다
}

/**
 * 제안 → 카드 생성 훅이 받는 ScannedTrip.
 * id에 세션 토큰을 섞는다 — 표지 사진 폴더(trips/{id}/)가 id로 만들어지므로 결정적 id는
 * 같은 여행을 두 번 만들 때 앞 폴더를 덮어쓴다(pastTripScan.newScanSessionId 주석과 같은 이유).
 */
export function suggestionToScannedTrip(s: TripSuggestion, text: TripTextMaker, sessionId: string): ScannedTrip {
  return {
    id: `suggest-${sessionId}-${s.countryName}-${s.startDate}`,
    country: s.country,
    countryName: s.countryName,
    countryFlag: s.countryFlag,
    date: s.endDate,
    startDate: s.startDate,
    endDate: s.endDate,
    rating: 5,
    title: text.title(s.countryName),
    photoCount: s.photoCount,
    content: text.content(s.countryName, s.photoCount),
    medias: s.photos.length ? [s.photos[0].uri] : [],
    photos: s.photos,
    weather: '맑음',
    companions: ['가족'],
  };
}

/** 'YYYY.MM.DD' → 'M.D' (배너 한 줄용). 형식이 아니면 원문 그대로 */
export function shortYmd(ymd: string): string {
  const m = ymd.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (!m) return ymd;
  return `${Number(m[2])}.${Number(m[3])}`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node node_modules/tsx/dist/cli.mjs src/utils/stayTripSuggest.verify.ts`
Expected: 모든 줄 `✓`, 마지막 `✅ 모든 검증 통과`. 실패하면 **구현을** 고친다(검증의 기대값은 설계에서 온 것이다).

- [ ] **Step 5: 타입 검사 후 커밋**

```bash
npx tsc --noEmit
git add src/utils/stayTripSuggest.ts src/utils/stayTripSuggest.verify.ts
git commit -m "feat(stay): 주변국 여행 제안 판정 순수 로직 + 검증

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: 영속 저장소 + 감지기 키 등록 + 가드 갱신

**Files:**
- Create: `src/utils/stayTripSuggestStore.ts`, `src/utils/stayTripSuggestStore.verify.ts`
- Modify: `src/store/persist.ts:43-54` (DETECTOR_KEYS)
- Modify: `scripts/snap-detect-guard.verify.mjs:388-392` (DETECTOR_KEY_VALUES)

**Interfaces:**
- Consumes: `TripSuggestion` (Task 1)
- Produces (순수): `prunePending(list, now)`, `mergePending(prev, fresh, now)`, `visibleSuggestions(list, now)`, `snoozeSuggestion(list, key, now)`, `removeSuggestions(list, keys)`, `parsePending(raw)`, `parseDismissed(raw)`, `SUGGESTION_TTL_MS=7d`, `SNOOZE_MS=24h`
- Produces (영속): `loadPending()`, `savePending(list)`, `loadDismissed()`, `addDismissed(key)`, `loadCheckedAt()`, `saveCheckedAt(ms)`, `subscribePending(fn): () => void`

- [ ] **Step 1: 검증 파일 작성**

```ts
// src/utils/stayTripSuggestStore.verify.ts
import {
  prunePending, mergePending, visibleSuggestions, snoozeSuggestion, removeSuggestions,
  parsePending, parseDismissed, SUGGESTION_TTL_MS, SNOOZE_MS,
} from './stayTripSuggestStore';
import type { TripSuggestion } from './stayTripSuggest';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const H = 3600_000;
const D = 24 * H;
const NOW = 1757200000000;
const mk = (key: string, detectedAt: number, extra: Partial<TripSuggestion> = {}): TripSuggestion => ({
  key, country: '🇨🇿 체코', countryName: '체코', countryFlag: '🇨🇿',
  startDate: '2026.09.05', endDate: '2026.09.06', photoCount: 6,
  photos: [{ uri: 'ph://a' }], lastPhotoAt: detectedAt - D, detectedAt, ...extra,
});

// 만료 — 감지 후 7일이 지나면 조용히 사라진다
eq(prunePending([mk('a', NOW - 8 * D), mk('b', NOW - D)], NOW).map((s) => s.key), ['b'], '7일 지난 제안 제거');
eq(prunePending([mk('a', NOW - 7 * D)], NOW).length, 1, '정확히 7일 = 아직 유지(경계 포함)');
eq(prunePending([], NOW), [], '빈 목록');
// 시계 이상 — 미래 detectedAt은 버린다(fabHighlight와 같은 방어)
eq(prunePending([mk('f', NOW + D)], NOW), [], '미래 시각 제안 제거');

// 병합 — 기존 항목은 detectedAt·snooze를 보존하고 새 키만 뒤에 붙는다
{
  const prev = [mk('a', NOW - 2 * D, { snoozeUntil: NOW + H })];
  const fresh = [mk('a', NOW), mk('b', NOW)];
  const out = mergePending(prev, fresh, NOW);
  eq(out.map((s) => s.key), ['a', 'b'], '병합: 순서 = 기존 → 새 키');
  eq(out[0].detectedAt, NOW - 2 * D, '병합: 기존 detectedAt 보존(소멸 시계가 리셋되지 않는다)');
  eq(out[0].snoozeUntil, NOW + H, '병합: 기존 스누즈 보존');
  eq(out[1].detectedAt, NOW, '병합: 새 항목 detectedAt = now');
}
// 병합은 만료도 함께 — 재검사 시점에 죽은 항목이 되살아나지 않는다
eq(mergePending([mk('old', NOW - 9 * D)], [], NOW), [], '병합: 만료 항목은 새 목록에서 빠진다');
// 사진 목록은 새 스캔 결과로 갱신 — 같은 키인데 사진이 더 잡혔으면 최신을 쓴다
{
  const out = mergePending([mk('a', NOW - D, { photoCount: 5 })], [mk('a', NOW, { photoCount: 7 })], NOW);
  eq(out[0].photoCount, 7, '병합: 사진 수는 최신 스캔');
}

// 표시 — 스누즈 중인 항목은 숨긴다
{
  const list = [mk('a', NOW, { snoozeUntil: NOW + H }), mk('b', NOW, { snoozeUntil: NOW - 1 }), mk('c', NOW)];
  eq(visibleSuggestions(list, NOW).map((s) => s.key), ['b', 'c'], '표시: snoozeUntil이 지났거나 없는 것만');
}

// 스누즈 — 24시간
{
  const out = snoozeSuggestion([mk('a', NOW), mk('b', NOW)], 'a', NOW);
  eq(out[0].snoozeUntil, NOW + SNOOZE_MS, '스누즈: 해당 키에 now+24h');
  eq(out[1].snoozeUntil, undefined, '스누즈: 다른 키는 그대로');
  eq(snoozeSuggestion([mk('a', NOW)], '없는키', NOW).length, 1, '스누즈: 없는 키는 무변화');
}

// 제거 — 카드 생성·거절 후
eq(removeSuggestions([mk('a', NOW), mk('b', NOW), mk('c', NOW)], ['a', 'c']).map((s) => s.key), ['b'], '제거: 여러 키');
eq(removeSuggestions([mk('a', NOW)], []).length, 1, '제거: 빈 키 목록 = 무변화');

// 파싱 — 저장된 JSON이 깨졌거나 형태가 다르면 빈 목록(부가 기능은 되살리지 않는다)
eq(parsePending(null), [], '파싱: null');
eq(parsePending('not json'), [], '파싱: 깨진 JSON');
eq(parsePending('{"a":1}'), [], '파싱: 배열 아님');
eq(parsePending(JSON.stringify([mk('a', NOW), { key: 'no-fields' }, null])).map((s) => s.key), ['a'], '파싱: 필드 빠진 항목만 버림');
eq(parseDismissed(null), [], '파싱(거절): null');
eq(parseDismissed('["a", 1, "b", ""]'), ['a', 'b'], '파싱(거절): 문자열만');

eq(SUGGESTION_TTL_MS, 7 * D, 'TTL = 7일');
eq(SNOOZE_MS, 24 * H, '스누즈 = 24시간');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
```

- [ ] **Step 2: 실패 확인**

Run: `node node_modules/tsx/dist/cli.mjs src/utils/stayTripSuggestStore.verify.ts`
Expected: 모듈 없음으로 실패.

- [ ] **Step 3: `persist.ts`에 키 3개 추가**

`src/store/persist.ts`의 `DETECTOR_KEYS` 객체 안, `albumCreatedAt` 줄 뒤에:

```ts
  // 체류 중 주변국 여행 카드 제안(components/StayTripSuggester · utils/stayTripSuggestStore).
  // 발송 기록은 아니지만 여기 두는 이유는 위 둘(returnAt·albumCreatedAt)과 같다 — records·
  // tripGroups와 짝인 값이라 clearPersistedStores가 records를 지울 때 같이 지워져야 한다.
  // 남으면 '카드는 없는데 제안은 이미 만들었다고 판단'하는 고착이 된다.
  stayTripSuggestCheckedAt: '@eorth/stayTripSuggest/checkedAt', // 마지막 검사 시각(ms) — 12시간 스로틀
  stayTripSuggestPending: '@eorth/stayTripSuggest/pending', // 대기 중 제안 JSON(TripSuggestion[])
  stayTripSuggestDismissed: '@eorth/stayTripSuggest/dismissed', // 거절한 제안 키 JSON(string[])
```

- [ ] **Step 4: 저장소 구현**

```ts
// src/utils/stayTripSuggestStore.ts
/**
 * 주변국 여행 제안의 대기 목록·거절 키 영속 (설계 §4·§5)
 *
 * 감지기(StayTripSuggester)가 쓰고 배너(StayTripSuggestBanner)가 읽는다. 두 컴포넌트가
 * AsyncStorage를 각자 만지면 갱신 시점이 어긋나므로 여기 한 곳에 두고 구독으로 알린다.
 *
 * ⚠️ 순수 구역(verify 대상)에는 import이 없어야 한다. AsyncStorage와 persist 키는
 *    영속 함수 안에서 지연 require한다(tripPhotoPool.ts와 같은 방식).
 */
import type { TripSuggestion } from './stayTripSuggest';

const H = 3600_000;
/** 감지 후 이만큼 지나면 제안은 조용히 사라진다 — 영구 배너는 소음이 된다 */
export const SUGGESTION_TTL_MS = 7 * 24 * H;
/** '나중에'로 숨기는 시간 */
export const SNOOZE_MS = 24 * H;

// ─────────────────────────────────────────────
// 순수 로직 (verify 대상)
// ─────────────────────────────────────────────

/** 만료·미래 시각 항목 제거. 경계(정확히 7일)는 유지 */
export function prunePending(list: TripSuggestion[], now: number): TripSuggestion[] {
  return list.filter((s) => s.detectedAt <= now && now - s.detectedAt <= SUGGESTION_TTL_MS);
}

/**
 * 기존 대기 목록 + 새 스캔 결과 병합.
 * 같은 키는 기존 항목의 detectedAt(소멸 시계)·snoozeUntil을 보존하되 사진 목록·장수는 최신으로.
 * 새 키는 뒤에 붙인다. 만료 항목은 여기서도 걸러 재검사 때 되살아나지 않게 한다.
 */
export function mergePending(prev: TripSuggestion[], fresh: TripSuggestion[], now: number): TripSuggestion[] {
  const alive = prunePending(prev, now);
  const byKey = new Map(fresh.map((s) => [s.key, s]));
  const out: TripSuggestion[] = alive.map((s) => {
    const f = byKey.get(s.key);
    return f ? { ...f, detectedAt: s.detectedAt, snoozeUntil: s.snoozeUntil } : s;
  });
  const seen = new Set(out.map((s) => s.key));
  for (const f of fresh) {
    if (!seen.has(f.key)) { seen.add(f.key); out.push(f); }
  }
  return out;
}

/** 배너에 실제로 보여줄 것 — 스누즈 중이 아닌 항목 */
export function visibleSuggestions(list: TripSuggestion[], now: number): TripSuggestion[] {
  return list.filter((s) => !s.snoozeUntil || s.snoozeUntil <= now);
}

export function snoozeSuggestion(list: TripSuggestion[], key: string, now: number): TripSuggestion[] {
  return list.map((s) => (s.key === key ? { ...s, snoozeUntil: now + SNOOZE_MS } : s));
}

export function removeSuggestions(list: TripSuggestion[], keys: string[]): TripSuggestion[] {
  if (keys.length === 0) return list;
  const drop = new Set(keys);
  return list.filter((s) => !drop.has(s.key));
}

/** 저장 JSON → 목록. 필수 필드가 빠진 항목은 버린다(부가 기능은 되살리지 않는다) */
export function parsePending(raw: string | null): TripSuggestion[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is TripSuggestion => {
      if (!v || typeof v !== 'object') return false;
      const s = v as Partial<TripSuggestion>;
      return typeof s.key === 'string' && !!s.key
        && typeof s.countryName === 'string'
        && typeof s.startDate === 'string' && typeof s.endDate === 'string'
        && typeof s.detectedAt === 'number'
        && Array.isArray(s.photos);
    });
  } catch {
    return [];
  }
}

export function parseDismissed(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string' && !!v);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────
// 영속화 + 구독 (지연 require — verify는 여기까지 오지 않는다)
// ─────────────────────────────────────────────

function storage() {
  return (require('@react-native-async-storage/async-storage') as {
    default: typeof import('@react-native-async-storage/async-storage').default;
  }).default;
}
function keys() {
  return (require('../store/persist') as typeof import('../store/persist')).DETECTOR_KEYS;
}

type Listener = (list: TripSuggestion[]) => void;
const listeners = new Set<Listener>();

/** 대기 목록이 바뀔 때 알림을 받는다. 반환값은 해제 함수 */
export function subscribePending(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export async function loadPending(): Promise<TripSuggestion[]> {
  try {
    return parsePending(await storage().getItem(keys().stayTripSuggestPending));
  } catch {
    return [];
  }
}

export async function savePending(list: TripSuggestion[]): Promise<void> {
  try {
    await storage().setItem(keys().stayTripSuggestPending, JSON.stringify(list));
  } catch {
    // 저장 실패는 조용히 — 다음 검사에서 다시 만들어진다
  }
  for (const fn of listeners) fn(list);
}

export async function loadDismissed(): Promise<string[]> {
  try {
    return parseDismissed(await storage().getItem(keys().stayTripSuggestDismissed));
  } catch {
    return [];
  }
}

export async function addDismissed(key: string): Promise<void> {
  const cur = await loadDismissed();
  if (cur.includes(key)) return;
  try {
    await storage().setItem(keys().stayTripSuggestDismissed, JSON.stringify([...cur, key]));
  } catch {
    // 실패하면 다음 스캔에 한 번 더 뜬다 — 침묵보다 낫다
  }
}

export async function loadCheckedAt(): Promise<number> {
  try {
    const raw = await storage().getItem(keys().stayTripSuggestCheckedAt);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export async function saveCheckedAt(ms: number): Promise<void> {
  try {
    await storage().setItem(keys().stayTripSuggestCheckedAt, String(ms));
  } catch {
    // 실패하면 다음 포그라운드에 한 번 더 검사한다 — 비용은 좌표 조회 수십 회뿐
  }
}
```

- [ ] **Step 5: 가드에 새 키 등록**

`scripts/snap-detect-guard.verify.mjs`의 `DETECTOR_KEY_VALUES`(388행 부근)를:

```js
const DETECTOR_KEY_VALUES = {
  snapSent: '@eorth/snapDetect/sent',
  arrivalSentCountry: '@eorth/arrivalDetect/sentCountry',
  returnAbroadLast: '@eorth/returnDetect/abroadLast',
  // 체류 중 주변국 여행 제안 — 같은 규칙(정의처 하나·초기화 시 삭제·리터럴 복붙 금지)
  stayTripSuggestCheckedAt: '@eorth/stayTripSuggest/checkedAt',
  stayTripSuggestPending: '@eorth/stayTripSuggest/pending',
  stayTripSuggestDismissed: '@eorth/stayTripSuggest/dismissed',
};
```

- [ ] **Step 6: 통과 확인**

```bash
node node_modules/tsx/dist/cli.mjs src/utils/stayTripSuggestStore.verify.ts
node scripts/snap-detect-guard.verify.mjs
npx tsc --noEmit
```
Expected: 두 검증 모두 `✅`, tsc 오류 0.

- [ ] **Step 7: 커밋**

```bash
git add src/utils/stayTripSuggestStore.ts src/utils/stayTripSuggestStore.verify.ts src/store/persist.ts scripts/snap-detect-guard.verify.mjs
git commit -m "feat(stay): 제안 대기 목록·거절 키 영속 저장소 + 감지기 키 3개 등록

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 14일 창 소형 스캐너

**Files:**
- Create: `src/utils/recentPhotoCountryScan.ts`

**Interfaces:**
- Consumes: `bucketRanges`, `probeOrder`, `segmentsFromProbes`, `fillCountries`, `nextBoundaryProbe`, `geocodeWaitMs`, `MAX_BOUNDARY_STEPS`, `ProbePoint` (`scanSampling.ts`); `locateCountry` (`countryLocate.ts`); `countryInfoFromCode`, `ScannedPhoto` (`pastTripScan.ts`); `isPhotoLocationAvailable`, `getLocations` (`modules/photo-location`); `normalizeLocations`, `LatLon` (`utils/photoLocationBatch.ts`)
- Produces: `scanRecentPhotoCountries({ createdAfter, createdBefore, excludeIds }): Promise<ScannedPhoto[]>` — 권한 없으면 `[]`, 실패는 throw.

검증 불가(네이티브 API). 실기기 체크리스트 대상. `.verify.ts`를 만들지 않는다.

- [ ] **Step 1: 구현**

```ts
// src/utils/recentPhotoCountryScan.ts
/**
 * 짧은 날짜 창의 사진에 국가 코드를 붙인다 — 체류 중 주변국 여행 제안용 (설계 §2)
 *
 * TravelImportScreen.startScan(380줄, 8/27 실기기 검증 완료)을 건드리지 않고, 그 화면이
 * 쓰는 순수 유틸(scanSampling·countryLocate)을 같은 순서로 조립한 소형판이다.
 * 진행률·취소·발견 칩·프로파일러 같은 화면 관심사는 없다.
 *
 * 비용: 14일이면 12시간 버킷 최대 28개 → 좌표 조회 수십 회. 사진 장수와 무관하다.
 * 권한: 팝업을 띄우지 않는다. 사진 권한이 없거나 '선택한 사진만'이면 빈 배열.
 */
import { Platform, PermissionsAndroid } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as Location from 'expo-location';
import { locateCountry } from './countryLocate';
import { countryInfoFromCode, type ScannedPhoto } from './pastTripScan';
import { isPhotoLocationAvailable, getLocations } from '../../modules/photo-location';
import { normalizeLocations, type LatLon } from './photoLocationBatch';
import {
  bucketRanges, probeOrder, segmentsFromProbes, fillCountries, nextBoundaryProbe,
  geocodeWaitMs, MAX_BOUNDARY_STEPS, type ProbePoint,
} from './scanSampling';

const PAGE_SIZE = 500;
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/** 사진 권한이 '전체 허용'인가. 요청하지 않는다(5.1.1 방어) */
async function hasFullPhotoAccess(): Promise<boolean> {
  try {
    const perm = await MediaLibrary.getPermissionsAsync();
    if (!perm.granted) return false;
    // '선택한 사진만'은 status가 아니라 accessPrivileges로 온다(TravelImportScreen과 동일)
    if (perm.accessPrivileges === 'limited') return false;
  } catch {
    return false;
  }
  if (Platform.OS === 'android') {
    // API 29 미만엔 이 권한 자체가 없다. 있는데 미승인이면 좌표가 한 건도 안 나온다 — 헛스캔 방지
    if (typeof Platform.Version === 'number' && Platform.Version < 29) return true;
    try {
      return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_MEDIA_LOCATION);
    } catch {
      return false;
    }
  }
  return true;
}

export async function scanRecentPhotoCountries(opts: {
  createdAfter: number;
  createdBefore: number;
  excludeIds?: Set<string>;
}): Promise<ScannedPhoto[]> {
  if (!(await hasFullPhotoAccess())) return [];

  // ── 1) 날짜 창 페이지네이션 ──
  const assets: MediaLibrary.Asset[] = [];
  let after: string | undefined;
  let hasNext = true;
  while (hasNext) {
    const page = await MediaLibrary.getAssetsAsync({
      first: PAGE_SIZE, after, mediaType: 'photo', sortBy: 'creationTime',
      createdAfter: opts.createdAfter, createdBefore: opts.createdBefore,
    });
    if (page.assets.length === 0) break;
    // 스프레드 금지 — Hermes 인자 한계(TravelImportScreen과 같은 이유)
    for (const a of page.assets) {
      if (!a.creationTime) continue; // 시각 없는 사진은 기간에 놓을 수 없다
      if (opts.excludeIds?.has(a.id)) continue;
      assets.push(a);
    }
    after = page.endCursor;
    hasNext = page.hasNextPage;
  }
  if (assets.length === 0) return [];
  assets.sort((x, y) => (x.creationTime || 0) - (y.creationTime || 0));
  const total = assets.length;

  // ── 2) 좌표 → 국가 (오프라인 폴리곤 1순위, 실패분만 지오코딩, 0.5도 캐시) ──
  const geocodeCache: Record<string, { code: string; name: string } | null> = {};
  let lastGeocodeAt = 0;
  const countryAt = async (lat: number, lon: number) => {
    const key = `${Math.round(lat * 2) / 2}_${Math.round(lon * 2) / 2}`;
    let geo = geocodeCache[key];
    if (geo !== undefined) return geo;
    geo = locateCountry(lat, lon);
    if (!geo) {
      const wait = geocodeWaitMs(lastGeocodeAt, Date.now());
      if (wait > 0) await sleep(wait);
      lastGeocodeAt = Date.now();
      try {
        const res = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
        const addr = res && res[0];
        geo = addr?.isoCountryCode ? { code: addr.isoCountryCode, name: addr.country || addr.isoCountryCode } : null;
      } catch {
        geo = null;
      }
    }
    geocodeCache[key] = geo;
    return geo;
  };

  // ── 3) 버킷 샘플링 — 탐침 후보를 네이티브 배치로 먼저(있으면) ──
  const buckets = bucketRanges(assets);
  let prefetched: Map<string, LatLon> | null = null;
  if (isPhotoLocationAvailable) {
    const ids: string[] = [];
    for (const b of buckets) for (const idx of probeOrder(b.start, b.end)) ids.push(assets[idx].id);
    try {
      prefetched = normalizeLocations(await getLocations(ids));
      if (ids.length > 0 && prefetched.size === 0) prefetched = null; // 네이티브가 제 역할을 못함 → 폴백
    } catch {
      prefetched = null;
    }
  }
  const localUriById = new Map<string, string>();
  const probeCountry = async (index: number): Promise<string | null> => {
    const asset = assets[index];
    try {
      let lat: number; let lon: number;
      const pre = prefetched?.get(asset.id);
      if (pre) {
        lat = pre.latitude; lon = pre.longitude;
      } else if (prefetched) {
        const one = normalizeLocations(await getLocations([asset.id]));
        const loc = one.get(asset.id);
        if (!loc) return null;
        prefetched.set(asset.id, loc);
        lat = loc.latitude; lon = loc.longitude;
      } else {
        const info = await MediaLibrary.getAssetInfoAsync(asset.id, { shouldDownloadFromNetwork: false });
        if (info.localUri) localUriById.set(asset.id, info.localUri);
        lat = Number(info.location?.latitude);
        lon = Number(info.location?.longitude);
        if (!info.location || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      }
      const geo = await countryAt(lat, lon);
      return geo ? geo.code : null;
    } catch {
      return null;
    }
  };

  const probes: ProbePoint[] = [];
  for (const b of buckets) {
    for (const idx of probeOrder(b.start, b.end)) {
      const code = await probeCountry(idx);
      probes.push({ index: idx, code });
      if (code) break;
    }
  }
  // ── 4) 국가 전환 경계 이분 탐색 ──
  const known = probes.filter((p) => p.code != null).sort((a, b) => a.index - b.index);
  for (let k = 1; k < known.length; k++) {
    if (known[k].code === known[k - 1].code) continue;
    let lo = known[k - 1].index;
    let hi = known[k].index;
    for (let step = 0; step < MAX_BOUNDARY_STEPS; step++) {
      const mid = nextBoundaryProbe(lo, hi);
      if (mid == null) break;
      const code = await probeCountry(mid);
      probes.push({ index: mid, code });
      if (code == null) break;
      if (code === known[k - 1].code) lo = mid;
      else if (code === known[k].code) hi = mid;
      else break;
    }
  }

  // ── 5) 구간 확정 → 전체 사진에 국가 채우기 ──
  const codes = fillCountries(total, segmentsFromProbes(probes, total));
  const out: ScannedPhoto[] = [];
  for (let i = 0; i < total; i++) {
    const code = codes[i];
    if (!code) continue;
    const a = assets[i];
    const info = countryInfoFromCode(code);
    out.push({
      id: a.id,
      uri: localUriById.get(a.id) || a.uri,
      localUri: localUriById.get(a.id),
      creationTime: a.creationTime,
      countryCode: code,
      countryName: info.countryName,
      countryFlag: info.countryFlag,
    });
  }
  return out;
}
```

- [ ] **Step 2: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 오류 0. `modules/photo-location`·`photoLocationBatch`의 export 이름이 다르면 `TravelImportScreen.tsx:48-53`의 import 문을 그대로 따라 맞춘다.

- [ ] **Step 3: 커밋**

```bash
git add src/utils/recentPhotoCountryScan.ts
git commit -m "feat(stay): 14일 창 사진 국가 판정 소형 스캐너

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 카드 생성 훅 추출 + 불러오기 화면 전환

**Files:**
- Create: `src/hooks/useImportTripsIntoCards.ts`
- Modify: `src/screens/TravelImportScreen.tsx:111-114` (COVER_COPY_TRIES 제거), `:1089-1198` (handleImport 축소), import 정리

**Interfaces:**
- Consumes: `classifyImportTarget`, `copyTripCover`, `pickCoverCandidates`, `saveTripPool`, `useRecords().{addImportedAlbum, addTripGroup, activeStayGroup, absorbIntoStay}`, `useSettings().homeCountryCode`, `COUNTRIES`
- Produces: `useImportTripsIntoCards(): (trips: ScannedTrip[], onProgress?: (done: number, total: number) => void) => Promise<ImportTripsResult>` where `ImportTripsResult = { tripCount; photoCount; countries: {flag; name}[]; coverErrors: string[]; created: { record: TravelRecord; tripGroupId: string | null }[] }`, `COVER_COPY_TRIES = 8`

이 Task는 **동작 변화가 없어야 한다.** 검증 파일이 없는 대신 (1) tsc (2) `npm test` 회귀 (3) 옮긴 코드의 순서·인자가 원본과 글자 단위로 같은지 diff로 확인한다.

- [ ] **Step 1: 훅 작성**

```ts
// src/hooks/useImportTripsIntoCards.ts
/**
 * 스캔된 여행(ScannedTrip) → 여행 카드 생성. 과거여행 불러오기(TravelImportScreen.handleImport)의
 * 저장 단계를 그대로 옮긴 것이다 — 체류 중 주변국 여행 제안 배너가 같은 결과물을 만들어야
 * 해서 화면 밖으로 꺼냈다. 저장 규칙이 둘로 갈라지면 한쪽만 고쳐지는 사고가 난다.
 *
 * 순서(불변): classifyImportTarget → 표지 1장 복사 → addImportedAlbum → (체류 흡수 | 여행 그룹) → 사진 풀 보관
 * 화면 관심사(진행 UI·네비게이션·Alert·lastImportAt)는 호출부에 남긴다.
 */
import { useCallback, useRef } from 'react';
import { COUNTRIES } from '../constants/countries';
import { useSettings } from '../store/settingsStore';
import { useRecords, type TravelRecord } from '../store/recordStore';
import type { ScannedTrip } from '../utils/pastTripScan';
import { copyTripCover } from '../utils/importPhotoStore';
import { classifyImportTarget } from '../utils/importRouting';
import { pickCoverCandidates, saveTripPool } from '../utils/tripPhotoPool';

// 썸네일 후보 수. 무작위로 뽑은 사진은 iCloud 오프로드·content:// 자산 등으로 확보에
// 실패할 수 있어 넉넉히 받아 두고 순서대로 시도한다(전부 실패해도 카드는 만든다).
// 3장이었을 땐 그 여행 사진이 대부분 오프로드된 사용자에게서 전부 실패해 목업 카드가 됐다.
export const COVER_COPY_TRIES = 8;

export interface ImportTripsResult {
  tripCount: number;                       // 새로 만든 여행 카드 수(체류 흡수분 제외)
  photoCount: number;                      // 카드에 연결해 둔 분석 사진 총 장수
  countries: { flag: string; name: string }[];
  coverErrors: string[];                   // 썸네일 확보 실패 사유(개발 빌드 진단용)
  created: { record: TravelRecord; tripGroupId: string | null }[];
}

export function useImportTripsIntoCards() {
  const { homeCountryCode } = useSettings();
  const { addImportedAlbum, addTripGroup, activeStayGroup, absorbIntoStay } = useRecords();
  // await 사이에 체류 상태가 바뀔 수 있어 최신 값을 ref로 본다
  const stayRef = useRef(activeStayGroup);
  stayRef.current = activeStayGroup;

  return useCallback(async (
    trips: ScannedTrip[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<ImportTripsResult> => {
    let tripCount = 0;
    let photoCount = 0;
    const countries: { flag: string; name: string }[] = [];
    const coverErrors: string[] = [];
    const created: ImportTripsResult['created'] = [];
    const homeCountryName = COUNTRIES.find((c) => c.term.split(' ')[0].toUpperCase() === (homeCountryCode || '').toUpperCase())?.name ?? null;
    const stay = stayRef.current;
    const stayCountryName = stay?.stay?.status !== 'ended' ? (stay?.countryName ?? null) : null;

    for (let i = 0; i < trips.length; i++) {
      const trip = trips[i];
      onProgress?.(i, trips.length);

      // 갈 곳을 먼저 정한다 — 거주국(skip)이면 기록을 만들지 않는다.
      // (기록부터 만들고 나중에 건너뛰면 어느 카드에도 안 붙은 기록이 남는다)
      const target = classifyImportTarget(trip.countryName, homeCountryName, stayCountryName);
      if (target === 'skip') continue;

      // 썸네일 — 분석된 사진 중 무작위 1장. 후보 순서도 무작위다(실패 시 옆 인덱스는 같은 장면).
      const cover = await copyTripCover(
        trip.id,
        pickCoverCandidates(trip.photos, COVER_COPY_TRIES).map((c) => ({ id: c.id, uri: c.uri, localUri: c.localUri })),
      );
      const coverUri = cover.uri ?? undefined;
      // 후보를 전부 실패해도 카드는 만든다 — 썸네일 없는 카드가, 여행이 통째로 안 들어오는 것보다 낫다
      if (!coverUri && cover.error) coverErrors.push(`${trip.countryName}: ${cover.error}`);
      const coverSrc = cover.source ? trip.photos.find((p) => p.uri === cover.source!.uri) : undefined;

      const mediaAssetIds: Record<string, string> = {};
      const mediaTimes: Record<string, number> = {};
      if (coverUri && coverSrc?.id) mediaAssetIds[coverUri] = coverSrc.id;
      if (coverUri && coverSrc?.creationTime) mediaTimes[coverUri] = coverSrc.creationTime;

      const rec = addImportedAlbum({
        country: trip.country, countryName: trip.countryName, countryFlag: trip.countryFlag,
        date: trip.date, startDate: trip.startDate, endDate: trip.endDate,
        title: trip.title,
        medias: coverUri ? [coverUri] : [],
        representativePhoto: coverUri,
        mediaAssetIds,
        mediaTimes,
        // 사진첩이 아니라 카드 표지다 — 여행 상세의 형식 목록·프로필 카드 배지에서 빠진다.
        isImportCover: true,
      });

      // 진행 중 체류국 사진이면 체류 카드로 흡수(백데이팅), 제3국이면 별도 여행 카드
      let groupId: string | null = null;
      if (target === 'stay') {
        absorbIntoStay(rec.id, trip.startDate);
        groupId = stay?.id ?? null;
      } else {
        // 제목에 국기를 넣지 않는다 — 프로필 카드가 `${countryFlag} ${title}`로 렌더링해 중복됨
        groupId = addTripGroup({ title: trip.title, records: [rec.id], coverRecordId: rec.id }).id;
        tripCount += 1;
        countries.push({ flag: trip.countryFlag, name: trip.countryName });
      }
      created.push({ record: rec, tripGroupId: groupId });

      // 분석된 사진을 카드에 연결해 보관 — 원본은 복사하지 않고 갤러리 참조만 남긴다
      if (groupId) {
        await saveTripPool({
          tripGroupId: groupId,
          recordId: rec.id,
          country: trip.country, countryName: trip.countryName, countryFlag: trip.countryFlag,
          title: trip.title, startDate: trip.startDate, endDate: trip.endDate,
          photos: trip.photos.map((p) => ({ id: p.id, uri: p.uri, creationTime: p.creationTime })),
        });
        photoCount += trip.photos.length;
      }
    }
    onProgress?.(trips.length, trips.length);
    return { tripCount, photoCount, countries, coverErrors, created };
  }, [homeCountryCode, addImportedAlbum, addTripGroup, absorbIntoStay]);
}
```

- [ ] **Step 2: `TravelImportScreen.handleImport` 축소**

`src/screens/TravelImportScreen.tsx`에서:

(a) 111~114행의 `COVER_COPY_TRIES` 선언(주석 포함)을 삭제한다.

(b) import 정리 — 아래 넷은 `handleImport`에서만 쓰였다. 각 이름을 파일 내에서 grep해 다른 사용처가 없으면 import에서 뺀다:
  - `copyTripCover` (`'../utils/importPhotoStore'`) — 없으면 import 줄 삭제
  - `classifyImportTarget` (`'../utils/importRouting'`) — 없으면 import 줄 삭제
  - `pickCoverCandidates`, `saveTripPool` (`'../utils/tripPhotoPool'`) — 같은 줄의 `poolAssetIds`, `syncTripPools`는 스캔에서 쓰므로 남긴다
  - `COUNTRIES` — 다른 사용처가 있으면 남긴다(확인 필수)

(c) `useRecords()` 구조분해(426행)에서 `addImportedAlbum, addTripGroup, absorbIntoStay`를 빼고 `activeStayGroup`은 다른 사용처가 있으면 남긴다(grep으로 확인). 그 아래에 추가:

```ts
  const importTrips = useImportTripsIntoCards();
```
와 상단 import:
```ts
import { useImportTripsIntoCards } from '../hooks/useImportTripsIntoCards';
```

(d) `handleImport` 전체를 다음으로 교체:

```ts
  const handleImport = async () => {
    if (importingRef.current) return; // 이중 탭 방지 — state는 다음 렌더에야 반영된다
    const chosen = chosenTrips();
    if (chosen.length === 0) return;
    importingRef.current = true;
    setIsImporting(true);
    setImportProgress({ done: 0, total: chosen.length });
    try {
      // 저장 단계는 hooks/useImportTripsIntoCards가 맡는다(주변국 여행 제안 배너와 공유).
      const result = await importTrips(chosen, (done, total) => setImportProgress({ done, total }));
      // 다음 재스캔의 기본 기간 기준점 — 실제로 카드가 만들어진 경우에만 갱신한다.
      // (0건이면 기준을 옮기면 안 된다. 이번에 안 담은 사진들이 다음 스캔에서 기간 밖으로
      //  밀려나 영영 못 찾게 되기 때문)
      if (result.photoCount > 0) setLastImportAt(Date.now());
      // 개발 빌드 한정 진단 — 콘솔을 못 보는 상황에서도 왜 썸네일이 비었는지 읽을 수 있게.
      if (__DEV__ && result.coverErrors.length > 0) {
        Alert.alert('[DEV] 썸네일 확보 실패', result.coverErrors.slice(0, 3).join('\n\n'));
      }
      success();
      navigation.reset({
        index: 1,
        routes: [
          { name: 'Main' },
          { name: 'ImportComplete', params: { tripCount: result.tripCount, photoCount: result.photoCount, countries: result.countries, from: route.params?.from, mode: 'quick' } },
        ],
      });
    } catch (err) {
      console.error('Quick import failed:', err);
      importingRef.current = false;
      setIsImporting(false);
      setImportProgress(null);
      Alert.alert(t('imports.saveFailTitle'), t('imports.saveFailMsg'));
    }
  };
```

- [ ] **Step 3: 동일성 확인**

```bash
git diff src/screens/TravelImportScreen.tsx
```
확인 항목: 삭제된 블록의 `classifyImportTarget(...)`·`copyTripCover(...)`·`addImportedAlbum({...})`·`absorbIntoStay(...)`·`addTripGroup({...})`·`saveTripPool({...})` 호출 인자가 훅의 것과 **글자 단위로 같다**. 다르면 훅을 고친다(원본이 기준).

- [ ] **Step 4: 검사**

```bash
npx tsc --noEmit
npm test > test-out.txt 2>&1; type test-out.txt
```
Expected: tsc 0건. `npm test`는 기존 실패 1건(`event-config.verify.mjs` Supabase 프로젝트 일치)만. 확인 후 `test-out.txt` 삭제(커밋 금지).

- [ ] **Step 5: 커밋**

```bash
git add src/hooks/useImportTripsIntoCards.ts src/screens/TravelImportScreen.tsx
git commit -m "refactor(import): 카드 생성 단계를 useImportTripsIntoCards 훅으로 추출

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 알림 설정 토글 + i18n

**Files:**
- Modify: `src/store/settingsStore.tsx:43-48`
- Modify: `src/screens/NotificationSettingsScreen.tsx:353-361`
- Modify: `src/i18n/locales/ko.ts:509-513` 부근, `src/i18n/locales/en.ts:496-500` 부근 (notifSettings) + 새 블록 `stayTripSuggest`

**Interfaces:**
- Produces: `NotifPrefKey`에 `'stayTripSuggest'`(기본 `true`), i18n 키 `notifSettings.stayTripLabel/stayTripDesc`, `stayTripSuggest.*`

- [ ] **Step 1: settingsStore**

`src/store/settingsStore.tsx` 43~48행:

```ts
export type NotifPrefKey =
  | 'master' | 'friendTrip' | 'likes' | 'messages' | 'newFollower'
  | 'returnDetect' | 'memoryRemind' | 'marketing' | 'travelMoment'
  | 'stayTripSuggest'; // 체류 중 주변국 여행 카드 제안 알림(위치 권한 불필요 — 사진 기반)
const DEFAULT_NOTIF_PREFS: Record<NotifPrefKey, boolean> = {
  master: true, friendTrip: true, likes: true, messages: true, newFollower: true,
  returnDetect: false, memoryRemind: true, marketing: false, travelMoment: true,
  stayTripSuggest: true,
};
```
(기존 줄의 정확한 형태는 파일을 읽고 맞춘다. 핵심은 union에 추가 + 기본값 `true`. hydrate가 `{ ...DEFAULT_NOTIF_PREFS, ...saved }`라 기존 설치도 자동으로 `true`.)

- [ ] **Step 2: 설정 화면 행 추가**

`NotificationSettingsScreen.tsx` 여행 감지 섹션의 마지막 `ToggleRow`(returnDetect, `isLast` 있음)에서 `isLast`를 빼고, 그 뒤에:

```tsx
          <ToggleRow
            icon={<Text style={{ fontSize: 18 }}>🧳</Text>}
            label={t('notifSettings.stayTripLabel')}
            description={t('notifSettings.stayTripDesc')}
            value={notifPrefs.stayTripSuggest}
            onValueChange={(v) => setNotifPref('stayTripSuggest', v)}
            disabled={!masterEnabled}
            isLast
          />
```
(`notifPrefs`·`setNotifPref`·`masterEnabled`·`Text`는 이 화면에 이미 있다 — 119~124행 참고.)

- [ ] **Step 3: i18n ko**

`ko.ts` `notifSettings` 블록, `returnDesc` 줄 뒤:
```ts
    stayTripLabel: '주변국 여행 카드 제안',
    stayTripDesc: '체류 중 다녀온 주변국 여행을 사진에서 찾아 카드로 만들지 알려줘요',
```
`ko.ts` `arrivalDetect` 블록 뒤(2109행 부근)에 새 블록:
```ts
  // 체류 중 주변국 여행 카드 제안 — 감지기(StayTripSuggester)·홈 배너(StayTripSuggestBanner)
  stayTripSuggest: {
    notifTitle: '{{country}} 여행 카드 만들까요?',
    notifTitleMany: '여행 카드 {{count}}건 만들까요?',
    notifBody: '사진 {{count}}장을 찾았어요. 탭 한 번이면 카드가 생겨요',
    bannerTitle: '다녀온 여행이 있네요',
    row: '{{country}} · {{start}} ~ {{end}} · 사진 {{count}}장',
    create: '카드 만들기',
    createMany: '카드 {{count}}장 만들기',
    later: '나중에',
    dismissA11y: '이 제안 안 보기',
    createdToast: '여행 카드 {{count}}장을 만들었어요',
    createFail: '카드를 만들지 못했어요. 잠시 후 다시 시도해 주세요',
  },
```

- [ ] **Step 4: i18n en**

`en.ts` `notifSettings` 블록, `returnDesc` 줄 뒤:
```ts
    stayTripLabel: 'Nearby trip card suggestions',
    stayTripDesc: 'While staying abroad, we find nearby trips in your photos and offer to make a card',
```
`en.ts` `arrivalDetect` 블록 뒤:
```ts
  stayTripSuggest: {
    notifTitle: 'Make a card for your {{country}} trip?',
    notifTitleMany: 'Make {{count}} trip cards?',
    notifBody: 'Found {{count}} photos. One tap creates the card',
    bannerTitle: 'Looks like you took a trip',
    row: '{{country}} · {{start}} ~ {{end}} · {{count}} photos',
    create: 'Make card',
    createMany: 'Make {{count}} cards',
    later: 'Later',
    dismissA11y: 'Hide this suggestion',
    createdToast: 'Created {{count}} trip cards',
    createFail: "Couldn't create the card. Please try again later",
  },
```

- [ ] **Step 5: 검사 후 커밋**

```bash
npx tsc --noEmit
git add src/store/settingsStore.tsx src/screens/NotificationSettingsScreen.tsx src/i18n/locales/ko.ts src/i18n/locales/en.ts
git commit -m "feat(stay): 주변국 여행 카드 제안 알림 토글 + 문구(ko/en)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 루트 감지기 + 마운트 + 알림 라우팅 + 가드

**Files:**
- Create: `src/components/StayTripSuggester.tsx`
- Modify: `App.tsx:142-143` (마운트), `src/navigation/AppNavigator.tsx:237-239` (라우팅), `scripts/snap-detect-guard.verify.mjs:560-565` (규칙 8 목록)

**Interfaces:**
- Consumes: Task 1~3·5 전부, `detectCurrentCountry`, `requestNotificationPermission` (`snapService`), `collectImportedAssetIds` (`scanSampling`), `poolAssetIds`, `syncTripPools` (`tripPhotoPool`), `countryNameToCode` (`utils/momentMatch`), `countryLabel`
- Produces: `STAY_TRIP_SUGGEST_NOTIF_ID = 'stay-trip-suggest'`, 알림 `data.type === 'stayTripSuggest'`

- [ ] **Step 1: 감지기 구현**

```tsx
// src/components/StayTripSuggester.tsx
/**
 * StayTripSuggester — 체류 중 주변국 여행을 사진에서 찾아 카드 생성을 제안 (설계 §4)
 *
 * 다른 감지기 4종과 같은 자리(App.tsx 루트)·같은 트리거(포그라운드)지만 판정 재료가
 * GPS 이벤트가 아니라 **최근 14일 사진**이다. 여행 중 앱을 한 번도 안 열어도, 체류
 * 일시정지가 안 돌았어도(프로필 탭 진입에만 걸려 있다) 사진만 있으면 잡힌다.
 *
 * 게이트: 진행 중 체류가 있고 사진 권한이 전체 허용일 때만. 권한 팝업은 띄우지 않는다.
 * 스로틀: 12시간(영속 — 콜드 스타트에도 유지). 예외가 나면 스로틀을 갱신하지 않아
 *         다음 포그라운드에 재시도한다(비용이 좌표 조회 수십 회라 되돌리기 장치가 필요 없다).
 * 알림: 새 제안 키가 생겼을 때만, 고정 identifier로 교체 발송(트레이 누적 방지).
 *       알림 토글이 꺼져 있어도 스캔·배너는 동작한다 — 토글은 발송만 막는다.
 *
 * ReturnDetector처럼 재진입 잠금 외의 세대 무효화·abort는 두지 않는다. 저장하는 것이 발송
 * 기록이 아니라 제안 목록이고 매 검사가 덮어쓰므로 고착이라는 상태가 없다. 예외 처리만
 * 네 감지기와 같은 모양이다(snap-detect-guard 규칙 8).
 */
import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import i18n from '../i18n';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { detectCurrentCountry, requestNotificationPermission } from '../services/snapService';
import { countryNameToCode } from '../utils/momentMatch';
import { countryLabel } from '../utils/countryLabel';
import { collectImportedAssetIds } from '../utils/scanSampling';
import { poolAssetIds, syncTripPools } from '../utils/tripPhotoPool';
import { scanRecentPhotoCountries } from '../utils/recentPhotoCountryScan';
import { suggestStayTrips, RECENT_WINDOW_MS } from '../utils/stayTripSuggest';
import {
  loadPending, savePending, loadDismissed, loadCheckedAt, saveCheckedAt, mergePending,
} from '../utils/stayTripSuggestStore';

// 검사 간격 — 사진 스캔이라 위치 감지기(2분)보다 훨씬 드물게. 주말 여행 뒤 월요일에
// 앱을 열면 한 번 돌고, 그날은 다시 돌지 않는다.
const CHECK_INTERVAL = 12 * 60 * 60 * 1000;
// 고정 identifier — 같은 값으로 다시 보내면 앞 알림을 교체한다(스냅·순간 알림과 같은 관례)
const STAY_TRIP_SUGGEST_NOTIF_ID = 'stay-trip-suggest';
// 재진입 방지 — 스캔이 수 초 걸리는 동안 포그라운드 전환이 연달아 와도 한 번만 돈다
let checking = false;

export default function StayTripSuggester() {
  const { homeCountryCode, notifPrefs } = useSettings();
  const { activeStayGroup, records, tripGroups } = useRecords();
  // 기록·카드 목록은 매 기록마다 바뀐다 — deps에 넣으면 effect가 난사된다. 스캔 시점의
  // 최신 목록만 있으면 되므로 ref로 본다(TravelImportScreen의 recordsRef와 같은 이유).
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const tripGroupsRef = useRef(tripGroups);
  tripGroupsRef.current = tripGroups;

  // 진행 중(종료 아님) 체류국 — paused도 포함한다. 체류국 복귀 판정은 사진·위치가 하지
  // 체류 상태 머신(프로필 탭 진입에만 걸림)에 기대지 않는다.
  const stayCountryCode = useMemo(() => {
    if (!activeStayGroup?.stay || activeStayGroup.stay.status === 'ended') return null;
    return countryNameToCode(activeStayGroup.countryName);
  }, [activeStayGroup]);
  const notifyEnabled = notifPrefs.master && notifPrefs.stayTripSuggest;

  // 체류가 끝나면 대기 제안을 비운다 — 체류 카드가 없는데 "체류 중 여행" 제안이 남는 것을 막는다
  useEffect(() => {
    if (stayCountryCode) return;
    loadPending().then((p) => { if (p.length > 0) return savePending([]); }).catch(() => {});
  }, [stayCountryCode]);

  useEffect(() => {
    if (!stayCountryCode) return;

    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const now = Date.now();
        const checkedAt = await loadCheckedAt();
        if (now - checkedAt < CHECK_INTERVAL) return;

        // 위치는 종료 판정 보조 — 못 얻으면 24시간 규칙으로 대체된다(팝업 없음)
        const { countryCode } = await detectCurrentCountry();

        // 이미 카드에 들어간 사진 제외 — 기록의 표지 + 카드에 보관해 둔 분석 사진 전량
        const importedIds = collectImportedAssetIds(recordsRef.current);
        const pools = await syncTripPools(tripGroupsRef.current.map((g) => g.id));
        for (const id of poolAssetIds(pools)) importedIds.add(id);

        const photos = await scanRecentPhotoCountries({
          createdAfter: now - RECENT_WINDOW_MS,
          createdBefore: now,
          excludeIds: importedIds,
        });

        // 기간 겹침 판정은 모든 형식의 기록을 본다 — 피드·블로그로 직접 남긴 여행도 걸러야 한다.
        // startDate가 없는 글(옛 피드)은 date 하루로 본다.
        const existingTrips = recordsRef.current.map((r) => ({
          countryName: r.countryName,
          startDate: r.startDate ?? r.date,
          endDate: r.endDate ?? r.startDate ?? r.date,
        }));
        const dismissedKeys = await loadDismissed();
        const fresh = suggestStayTrips({
          photos, stayCountryCode, homeCountryCode, now,
          currentCountryCode: countryCode, importedAssetIds: importedIds, existingTrips, dismissedKeys,
        });

        const prev = await loadPending();
        const prevKeys = new Set(prev.map((s) => s.key));
        const merged = mergePending(prev, fresh, now);
        await savePending(merged);
        await saveCheckedAt(now); // 여기까지 왔으면 이번 검사는 끝난 것 — 예외면 갱신하지 않는다

        const added = fresh.filter((s) => !prevKeys.has(s.key));
        if (added.length === 0 || !notifyEnabled) return;
        const hasPermission = await requestNotificationPermission();
        if (!hasPermission) return;
        const total = added.reduce((n, s) => n + s.photoCount, 0);
        await Notifications.scheduleNotificationAsync({
          identifier: STAY_TRIP_SUGGEST_NOTIF_ID,
          content: {
            title: added.length === 1
              ? i18n.t('stayTripSuggest.notifTitle', { country: countryLabel(added[0].countryName, i18n.language) })
              : i18n.t('stayTripSuggest.notifTitleMany', { count: added.length }),
            body: i18n.t('stayTripSuggest.notifBody', { count: total }),
            data: { type: 'stayTripSuggest' },
            sound: true,
          },
          trigger: null, // 즉시 발송
        });
      } catch (e) {
        // 사진 조회·지오코딩·알림 API는 throw할 수 있고 check()는 await 없이 불린다.
        // 삼키지 않으면 unhandled rejection. checkedAt을 갱신하지 않았으므로 다음 포그라운드에 재시도.
        if (__DEV__) console.warn('[StayTripSuggester] check() 예외 — 삼키고 계속:', e);
      } finally {
        checking = false;
      }
    };

    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    check(); // 앱 실행 시 1회
    return () => sub.remove();
  }, [stayCountryCode, homeCountryCode, notifyEnabled]);

  return null; // UI 없음
}
```

⚠️ `TravelRecord.date`가 `'YYYY.MM.DD'`가 아닌 형식이면 `overlapsImportedTrip`이 `null`로 떨어져 겹침 아님으로 처리된다(안전한 방향). 타입 검사에서 `r.date`가 string이 아니라고 하면 `String(r.date)`로 감싼다.

- [ ] **Step 2: App.tsx 마운트**

`App.tsx`에 import 추가(`ReturnDetector` import 줄 근처):
```ts
import StayTripSuggester from './src/components/StayTripSuggester';
```
`<ReturnDetectNudge />` 다음 줄에:
```tsx
                          <StayTripSuggester />
```

- [ ] **Step 3: 알림 탭 라우팅**

`AppNavigator.tsx` `routeFromData`의 `returnDetect` 분기 뒤에:
```ts
        } else if (d.type === 'stayTripSuggest') {
          // 주변국 여행 카드 제안 → 홈(지구본). 배너가 헤더 아래에 떠 있다
          navigate('Main');
```
207~212행의 주석 목록에 `stayTripSuggest → 홈`을 한 줄 추가한다.

- [ ] **Step 4: 가드 규칙 8에 등록**

`scripts/snap-detect-guard.verify.mjs` 560~565행의 배열에 추가:
```js
  ['src/components/StayTripSuggester.tsx', 'StayTripSuggester'],
```
배열 위에 한 줄 주석: `// 다섯 번째(StayTripSuggester)는 사진 기반이라 규칙 1의 발송 기록 검사는 받지 않고 예외 처리 모양만 맞춘다.`

- [ ] **Step 5: 검사**

```bash
npx tsc --noEmit
node scripts/snap-detect-guard.verify.mjs
```
Expected: tsc 0건. 가드 전부 `✓` — 특히 규칙 5(identifier 유일성: `STAY_TRIP_SUGGEST_NOTIF_ID`가 수집되고 충돌 없음), 규칙 4(`trigger: {` 없음), 규칙 8(`[StayTripSuggester]` 태그 catch, `\n    };`로 닫히는 check 선언 형태).

- [ ] **Step 6: 커밋**

```bash
git add src/components/StayTripSuggester.tsx App.tsx src/navigation/AppNavigator.tsx scripts/snap-detect-guard.verify.mjs
git commit -m "feat(stay): 주변국 여행 제안 감지기(사진 기반, 12h 스로틀) + 알림 라우팅

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: 홈 배너 + MainScreen 배치

**Files:**
- Create: `src/components/StayTripSuggestBanner.tsx`
- Modify: `src/screens/MainScreen.tsx:1683-1687` (헤더와 globeArea 사이), import 추가

**Interfaces:**
- Consumes: Task 1·2·4·5, `emitToast`, `countryLabel`, `useTranslation`, `select`/`success`/`warn` (`utils/haptics`), `Text` (`ui/Text`), `andFitText` (`utils/fitText`), `newScanSessionId` (`pastTripScan`)
- Produces: `<StayTripSuggestBanner onCreated={(records: TravelRecord[]) => void} />`

- [ ] **Step 1: 배너 구현**

```tsx
// src/components/StayTripSuggestBanner.tsx
/**
 * 체류 중 주변국 여행 카드 제안 배너 — 홈 헤더 아래 (설계 §5)
 *
 * 제안이 없으면 자리도 차지하지 않는다. 대기 목록은 stayTripSuggestStore가 단일 출처이고
 * 감지기가 갱신하면 구독으로 즉시 반영된다.
 * [카드 만들기] = 과거여행 불러오기와 같은 결과물(useImportTripsIntoCards).
 * [나중에] = 24시간 숨김. [×] = 거절(재스캔에도 안 뜸).
 * 스타일은 MateRecoConsentBanner를 따른다.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { Text } from '../ui/Text';
import { andFitText } from '../utils/fitText';
import { countryLabel } from '../utils/countryLabel';
import { emitToast } from '../store/toastStore';
import { select, success, warn } from '../utils/haptics';
import type { TravelRecord } from '../store/recordStore';
import { newScanSessionId, type TripTextMaker } from '../utils/pastTripScan';
import { useImportTripsIntoCards } from '../hooks/useImportTripsIntoCards';
import { shortYmd, suggestionToScannedTrip, type TripSuggestion } from '../utils/stayTripSuggest';
import {
  loadPending, savePending, subscribePending, addDismissed,
  visibleSuggestions, snoozeSuggestion, removeSuggestions,
} from '../utils/stayTripSuggestStore';

const C = {
  card: '#2E2E3B',
  neon: '#BF85FC',
  dim: '#A1A1B0',
  divider: '#1A1A26',
  white: '#FFFFFF',
};

interface Props {
  /** 카드 생성 직후 호출 — 호출부(MainScreen)가 한 건이면 그 카드로 이동한다 */
  onCreated?: (records: TravelRecord[]) => void;
}

export default function StayTripSuggestBanner({ onCreated }: Props) {
  const { t, i18n } = useTranslation();
  const importTrips = useImportTripsIntoCards();
  const [pending, setPending] = useState<TripSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  // 스누즈 만료를 렌더 시점에 다시 판정하기 위한 now — 앱이 열려 있는 동안 정확할 필요는 없다
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    loadPending().then((p) => { if (alive) { setPending(p); setNow(Date.now()); } }).catch(() => {});
    const off = subscribePending((p) => { if (alive) { setPending(p); setNow(Date.now()); } });
    return () => { alive = false; off(); };
  }, []);

  const visible = useMemo(() => visibleSuggestions(pending, now), [pending, now]);

  // 카드 제목·본문을 현재 언어로 (TravelImportScreen.tripText와 같은 규칙)
  const tripText = useMemo<TripTextMaker>(() => {
    const loc = (ko: string) => countryLabel(ko, i18n.language);
    return {
      title: (c) => t('imports.tripTitle', { country: loc(c) }),
      content: (c, n) => t('imports.tripContent', { country: loc(c), count: n }),
    };
  }, [t, i18n.language]);

  const create = useCallback(async () => {
    if (busy || visible.length === 0) return;
    setBusy(true);
    select();
    try {
      const sessionId = newScanSessionId();
      const trips = visible.map((s) => suggestionToScannedTrip(s, tripText, sessionId));
      const result = await importTrips(trips);
      await savePending(removeSuggestions(pending, visible.map((s) => s.key)));
      success();
      const records = result.created.map((c) => c.record);
      if (records.length !== 1) emitToast(t('stayTripSuggest.createdToast', { count: records.length }));
      onCreated?.(records);
    } catch (e) {
      if (__DEV__) console.warn('[StayTripSuggestBanner] 카드 생성 실패:', e);
      warn();
      emitToast(t('stayTripSuggest.createFail'));
    } finally {
      setBusy(false);
    }
  }, [busy, visible, pending, tripText, importTrips, onCreated, t]);

  const later = useCallback(async () => {
    select();
    let next = pending;
    const at = Date.now();
    for (const s of visible) next = snoozeSuggestion(next, s.key, at);
    await savePending(next);
  }, [pending, visible]);

  const dismiss = useCallback(async () => {
    select();
    for (const s of visible) await addDismissed(s.key);
    await savePending(removeSuggestions(pending, visible.map((s) => s.key)));
  }, [pending, visible]);

  if (visible.length === 0) return null;

  return (
    <View style={st.wrap}>
      <View style={st.headRow}>
        <Text style={st.title}>{t('stayTripSuggest.bannerTitle')}</Text>
        <TouchableOpacity onPress={dismiss} disabled={busy} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel={t('stayTripSuggest.dismissA11y')}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <SvgPath d="M18 6L6 18M6 6l12 12" stroke={C.dim} strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </TouchableOpacity>
      </View>
      {visible.map((s) => (
        <Text key={s.key} style={st.row} numberOfLines={1}>
          {s.countryFlag} {t('stayTripSuggest.row', {
            country: countryLabel(s.countryName, i18n.language),
            start: shortYmd(s.startDate), end: shortYmd(s.endDate), count: s.photoCount,
          })}
        </Text>
      ))}
      <View style={st.btnRow}>
        <TouchableOpacity style={[st.btn, st.laterBtn]} onPress={later} disabled={busy} activeOpacity={0.85}>
          <Text style={st.laterTxt} {...andFitText}>{t('stayTripSuggest.later')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.btn, st.createBtn]} onPress={create} disabled={busy} activeOpacity={0.85}>
          {busy ? (
            <ActivityIndicator color="#1A1A26" />
          ) : (
            <Text style={st.createTxt} {...andFitText}>
              {visible.length === 1 ? t('stayTripSuggest.create') : t('stayTripSuggest.createMany', { count: visible.length })}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {
    marginHorizontal: 12, marginTop: 4, padding: 14,
    backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.divider,
    zIndex: 6, // 지구본 토글(zIndex 5)보다 위
  },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: 14, fontWeight: '700', color: C.white, lineHeight: 20 },
  row: { fontSize: 12, color: C.dim, lineHeight: 18, marginTop: 6 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  laterBtn: { borderWidth: 1, borderColor: C.divider },
  laterTxt: { fontSize: 13, color: C.dim, fontWeight: '600' },
  createBtn: { backgroundColor: C.neon },
  createTxt: { fontSize: 13, color: '#1A1A26', fontWeight: '700' },
});
```

- [ ] **Step 2: MainScreen 배치**

`src/screens/MainScreen.tsx` import에(80행 `InviteNudgeModal` 근처):
```ts
import StayTripSuggestBanner from '../components/StayTripSuggestBanner';
```
헤더 `</View>`(1683행) 바로 다음, `{/* ── 지구본 / 국가 지도 영역 ── */}` 앞에:
```tsx
      {/* ── 체류 중 주변국 여행 카드 제안 — 제안이 없으면 렌더되지 않는다 ── */}
      <StayTripSuggestBanner
        onCreated={(recs) => { if (recs.length === 1) navigation.navigate('TripRecord', { record: recs[0] }); }}
      />
```
(`navigation.navigate('TripRecord', { record })`는 이 화면이 이미 쓰는 타입 — `RootStackParamList.TripRecord: { record: TravelRecord; viewType? }`.)

- [ ] **Step 3: 검사**

```bash
npx tsc --noEmit
npm test > test-out.txt 2>&1; type test-out.txt
```
Expected: tsc 0건. npm test는 기존 실패 1건만. `test-out.txt` 삭제.

- [ ] **Step 4: 커밋**

```bash
git add src/components/StayTripSuggestBanner.tsx src/screens/MainScreen.tsx
git commit -m "feat(stay): 홈 헤더 아래 주변국 여행 카드 제안 배너

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: 마무리 — 문서·체크리스트

**Files:**
- Modify: `docs/superpowers/specs/2026-09-04-stay-trip-suggest-design.md` (구현 상태 줄 추가)
- Create: `docs/superpowers/plans/2026-09-04-stay-trip-suggest-device-checklist.md`

- [ ] **Step 1: 실기기 체크리스트 작성**

```markdown
# 주변국 여행 카드 제안 — 실기기 체크리스트

전제: 개발 빌드 또는 베타 OTA. 사진 권한 '전체 허용', 위치 권한 허용. 진행 중 체류 카드 1건.

## 회귀 (Task 4 — 카드 생성 훅 추출)
- [ ] 프로필 → 과거여행 불러오기 → 결과 선택 → 저장: 카드 수·썸네일·완료 화면 수치가 이전과 같다
- [ ] 체류국 사진이 섞인 스캔: 체류 카드로 흡수(백데이팅), 제3국은 별도 카드
- [ ] 저장 후 여행 상세 → 사진첩 만들기: 풀 사진이 뜬다(saveTripPool 정상)

## 제안 (감지기·배너)
- [ ] 체류국에서 앱 실행 → 12시간 안에 두 번 열어도 스캔은 한 번(로그 `[StayTripSuggester]` 없음, 배터리 튐 없음)
- [ ] 최근 14일에 주변국 사진 5장 이상(마지막 사진 12시간 이상 경과) → 알림 1회 + 홈 헤더 아래 배너
- [ ] 알림 탭 → 홈으로 이동, 배너 보임
- [ ] [카드 만들기] → 카드 1건이면 여행 상세로 이동, 프로필 카드 목록에 썸네일 카드
- [ ] 같은 조건으로 앱 재시작 → 배너 다시 안 뜸(자산 id·기간 겹침 제외)
- [ ] [나중에] → 사라짐, 24시간 뒤(기기 시각 조정) 재노출
- [ ] [×] → 사라짐, 재시작·재스캔에도 안 뜸
- [ ] 알림 설정에서 '주변국 여행 카드 제안' 끔 → 알림은 안 오고 배너는 뜬다
- [ ] 사진 권한 '선택한 사진만' → 아무 일도 없음(팝업 없음)
- [ ] 체류 종료 → 배너 사라짐
- [ ] 안드로이드: ACCESS_MEDIA_LOCATION 미승인 → 조용히 0건(팝업 없음)
```

- [ ] **Step 2: 설계 문서에 상태 줄**

설계 문서 `**관련 문서:**` 줄 아래에:
```markdown
**구현:** 2026-09-04 `feat/stay-trip-suggest` — 계획 `docs/superpowers/plans/2026-09-04-stay-trip-suggest.md`, 실기기 체크리스트 `…-device-checklist.md`. 실기기 검증 전까지 OTA 금지.
```

- [ ] **Step 3: 최종 검사 후 커밋**

```bash
npx tsc --noEmit
npm test > test-out.txt 2>&1; type test-out.txt
git add docs/superpowers/specs/2026-09-04-stay-trip-suggest-design.md docs/superpowers/plans/2026-09-04-stay-trip-suggest-device-checklist.md
git commit -m "docs(stay): 주변국 여행 제안 실기기 체크리스트 + 설계 상태

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git log --oneline feat/photo-ai-pool-input..HEAD
```
Expected: 이 브랜치에 커밋 9개(계획 1 + Task 1~8). `test-out.txt`는 삭제.
