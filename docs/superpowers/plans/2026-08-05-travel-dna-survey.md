# 여행 DNA 설문 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 36문항 7축 설문으로 여행 성향을 측정해 유형 라벨을 만들고, 기존 메이트 매칭의 계절·관심사·성향 3축(35점)을 이 설문축으로 교체한다.

**Architecture:** 채점·라벨 생성은 화면 없이 검증 가능한 순수 함수(`src/utils/travelDnaScore.ts`)로 분리하고, 문항·축·라벨 문구는 단일 출처 상수(`src/constants/travelDna.ts`)에 둔다. 응답 원본과 축 점수는 서버 `travel_dna` 테이블이 진실이며 클라이언트는 읽기 캐시만 갖는다. 매칭 계산은 `mate_suggestions_compute` RPC 안에서만 돌아 축 점수가 외부로 새지 않는다.

**Tech Stack:** React Native (Expo SDK 54) · TypeScript · Supabase(Postgres + RLS + SECURITY DEFINER RPC) · react-i18next

## Global Constraints

- 설계 원본: `docs/superpowers/specs/2026-08-05-travel-dna-survey-design.md`
- 모든 주석·UI 문구는 한글. 영문 문구는 `en` 로케일에만.
- 디자인 토큰: 배경 `#0A0A0F` · 카드 `#2E2E3B` · 보라 네온 `#BF85FC` · 텍스트 흐림 `#A1A1B0` · 구분선 `#1A1A26` · 빨강 `#FF3B30`
- 문항 id는 **재사용 금지**. 삭제한 번호는 비워 두고 새 문항은 다음 번호를 받는다 (`answers` jsonb가 id로 저장된다).
- 축 점수 규약: `0` = A 방향 극단, `100` = B 방향 극단, `50` = 중립.
- 테스트는 jest가 아니라 `*.verify.ts` 자체 assert 방식이다. `npm test`(= `node scripts/run-verify.mjs`)가 `src` 아래 모든 `*.verify.ts`를 실행한다.
- 매 태스크 종료 전 `npx tsc --noEmit` 통과 필수.
- 안전영역은 `react-native-safe-area-context`의 `useSafeAreaInsets`/`SafeAreaView`를 쓴다(전 화면 공통 규칙).
- RPC 반환 컬럼 `season_score`·`interest_score`·`taste_score`는 **삭제 금지**(구버전 앱 호환). 값 `0`으로 유지하고 `survey_score`를 추가한다.

---

### Task 1: 문항·축 상수와 채점 로직

**Files:**
- Create: `src/constants/travelDna.ts`
- Create: `src/utils/travelDnaScore.ts`
- Create: `src/utils/travelDnaScore.verify.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `type DnaAxisId = 'plan'|'pace'|'terrain'|'budget'|'purpose'|'crowd'|'company'`
  - `const DNA_AXES: DnaAxisId[]` (순서 고정 — 서버 `scores` 배열 순서와 1:1)
  - `interface DnaQuestion { id: number; axis: DnaAxisId; weight: 1|2; ko: {s,a,b}; en: {s,a,b} }`
  - `const DNA_QUESTIONS: DnaQuestion[]` (36개)
  - `const ONBOARDING_QUESTION_IDS: number[]` (7개)
  - `type DnaAnswers = Record<number, 'A'|'B'>`
  - `type DnaScores = Record<DnaAxisId, number>`
  - `function scoreAxes(answers: DnaAnswers): DnaScores`
  - `function answeredCount(answers: DnaAnswers): number`
  - `function isValidDna(answers: DnaAnswers): boolean`

- [ ] **Step 1: 문항·축 상수 파일 작성**

`src/constants/travelDna.ts`:

```ts
// 여행 DNA 설문 — 문항·축·라벨 문구의 단일 출처.
// 설계: docs/superpowers/specs/2026-08-05-travel-dna-survey-design.md
//
// ⚠️ 문항 id는 재사용하지 않는다. 응답이 서버에 id로 저장되므로(travel_dna.answers),
//    삭제한 번호를 새 문항이 물려받으면 옛 응답이 엉뚱한 문항의 답으로 해석된다.
//    삭제한 번호는 비워 두고 새 문항은 다음 번호를 받는다.

export type DnaAxisId = 'plan' | 'pace' | 'terrain' | 'budget' | 'purpose' | 'crowd' | 'company';

// ⚠️ 이 순서가 서버 travel_dna.scores 배열의 순서다. 바꾸면 기존 응답의 축이 어긋난다.
export const DNA_AXES: DnaAxisId[] = ['plan', 'pace', 'terrain', 'budget', 'purpose', 'crowd', 'company'];

export interface DnaQuestion {
  id: number;
  axis: DnaAxisId;
  /** 신호 강도 — 2는 그 축을 강하게 드러내는 문항 */
  weight: 1 | 2;
  ko: { s: string; a: string; b: string };
  en: { s: string; a: string; b: string };
}

export const DNA_QUESTIONS: DnaQuestion[] = [
  // ① 계획 ↔ 즉흥
  { id: 1, axis: 'plan', weight: 2,
    ko: { s: '여행 3일 전, 내 상태는', a: '시간표까지 짜여 있다', b: '항공권만 끊어놨다' },
    en: { s: 'Three days before the trip', a: 'My schedule is planned by the hour', b: 'I only booked the flight' } },
  { id: 2, axis: 'plan', weight: 1,
    ko: { s: '아침에 일어났더니 비가 온다', a: '계획대로 진행한다', b: '나갈 때 우산 챙겨야겠다는 생각만 한다' },
    en: { s: 'You wake up and it is raining', a: 'Stick to the plan', b: 'Just remember to grab an umbrella' } },
  { id: 3, axis: 'plan', weight: 1,
    ko: { s: '식당을 고를 때', a: '미리 예약해둔 맛집', b: '눈과 발이 이끄는 곳' },
    en: { s: 'Choosing a restaurant', a: 'The one I booked ahead', b: 'Wherever my feet take me' } },
  { id: 4, axis: 'plan', weight: 1,
    ko: { s: '짐을 쌀 때', a: '리스트를 만든다', b: '전날 밤 대충 담는다' },
    en: { s: 'Packing', a: 'I make a list', b: 'I throw things in the night before' } },
  { id: 5, axis: 'plan', weight: 2,
    ko: { s: '일정이 틀어지면', a: '속에서 불편함이 나온다', b: '아무 생각이 없다' },
    en: { s: 'When plans fall apart', a: 'It gnaws at me', b: 'I barely notice' } },

  // ② 휴식 ↔ 활동
  { id: 6, axis: 'pace', weight: 2,
    ko: { s: '하루에 도는 장소', a: '한두 곳 여유롭게', b: '하루 꽉 차게' },
    en: { s: 'Places visited per day', a: 'One or two, unhurried', b: 'Pack the day full' } },
  { id: 7, axis: 'pace', weight: 1,
    ko: { s: '여행지의 아침', a: '늦잠과 느긋한 조식', b: '일찍 나가야 하루가 길다' },
    en: { s: 'Mornings on a trip', a: 'Sleep in, slow breakfast', b: 'Out early makes the day longer' } },
  { id: 8, axis: 'pace', weight: 1,
    ko: { s: '숙소에 수영장이 있다', a: '반나절은 여기서', b: '가고 싶지만 내 계획엔 없음' },
    en: { s: 'The hotel has a pool', a: 'Half a day right here', b: 'Tempting, but not on my list' } },
  { id: 9, axis: 'pace', weight: 1,
    ko: { s: '내가 선호하는 것은', a: '나에게 휴식을, 호캉스', b: '여기까지 왔는데 해야지, 액티비티' },
    en: { s: 'What I go for', a: 'A restful hotel stay', b: 'Came all this way — activities' } },
  { id: 10, axis: 'pace', weight: 2,
    ko: { s: '돌아왔을 때 성공한 여행이란', a: '푹 쉬고 온 느낌', b: '다리가 남아돌지 않음' },
    en: { s: 'A trip went well when', a: 'I came back rested', b: 'My legs are wrecked' } },

  // ③ 도시 ↔ 자연
  { id: 11, axis: 'terrain', weight: 2,
    ko: { s: '다음 여행지 후보', a: '빌딩 숲, 뉴욕', b: '평화의 알프스' },
    en: { s: 'Next destination', a: 'Skyscrapers — New York', b: 'Quiet Alps' } },
  { id: 12, axis: 'terrain', weight: 1,
    ko: { s: '여행 후 내 갤러리엔', a: '야경과 건물', b: '풍경과 하늘' },
    en: { s: 'My camera roll after a trip', a: 'Night views and buildings', b: 'Landscapes and sky' } },
  { id: 13, axis: 'terrain', weight: 1,
    ko: { s: '하루가 통째로 비면', a: '쇼핑과 카페', b: '트레킹이나 드라이브' },
    en: { s: 'A whole free day', a: 'Shopping and cafes', b: 'Hiking or a drive' } },
  { id: 14, axis: 'terrain', weight: 1,
    ko: { s: '여행지에서의 만남', a: '살갑게 다가오는 현지인', b: '귀여운 동물과 징그러운 벌레' },
    en: { s: 'Who you meet out there', a: 'Friendly locals', b: 'Cute animals and creepy bugs' } },
  { id: 15, axis: 'terrain', weight: 2,
    ko: { s: '가장 많이 듣는 여행 소리', a: '낯선 거리의 소음', b: '아무 소리 없는 새벽의 고요함' },
    en: { s: 'The sound of my trips', a: 'Noise of unfamiliar streets', b: 'Silence before dawn' } },

  // ④ 알뜰 ↔ 아낌없이
  { id: 16, axis: 'budget', weight: 2,
    ko: { s: '항공권', a: '경유 2번이어도 20만 원 싸면 간다', b: '직항 아니면 여행 시작부터 지친다' },
    en: { s: 'Flights', a: 'Two layovers is fine if it saves money', b: 'Non-stop or the trip starts tired' } },
  { id: 17, axis: 'budget', weight: 2,
    ko: { s: '숙소 예산', a: '수면용', b: '숙소도 여행의 일부' },
    en: { s: 'Accommodation budget', a: 'Just a place to sleep', b: 'The stay is part of the trip' } },
  { id: 18, axis: 'budget', weight: 1,
    ko: { s: '한 끼에 쓰는 돈', a: '가성비 맛집', b: '여행이다, 맘껏 먹어보자' },
    en: { s: 'Spending per meal', a: 'Best value I can find', b: 'It is a trip — go all in' } },
  { id: 19, axis: 'budget', weight: 1,
    ko: { s: '기념품', a: '집 가면 예쁜 쓰레기', b: '보는 순간 열리는 지갑' },
    en: { s: 'Souvenirs', a: 'Clutter once I get home', b: 'My wallet opens itself' } },
  { id: 20, axis: 'budget', weight: 1,
    ko: { s: '예산을 짤 때', a: '하루 상한을 정해둔다', b: '쓰고 나서 정산은 집에 가서' },
    en: { s: 'Budgeting', a: 'I set a daily cap', b: 'I settle the math back home' } },

  // ⑤ 미식 ↔ 관광
  { id: 21, axis: 'purpose', weight: 2,
    ko: { s: '여행지를 고르는 이유', a: '그동안의 다이어트 무의미하게 먹으러', b: '여행은 보는 맛, 관광지로' },
    en: { s: 'Why I pick a destination', a: 'To eat — diet be damned', b: 'To see the sights' } },
  { id: 22, axis: 'purpose', weight: 1,
    ko: { s: '줄이 한 시간인 맛집', a: '기다리는 이유가 있다', b: '입장 시간 얼마 안 남음, 다른 데로' },
    en: { s: 'An hour-long queue for food', a: 'There is a reason people wait', b: 'My entry slot is closing — move on' } },
  { id: 23, axis: 'purpose', weight: 1,
    ko: { s: '일정표에서 먼저 정해지는 것', a: '인스타·유튜브에서 저장해놓은 맛집', b: '해당 도시의 관광지' },
    en: { s: 'What gets locked in first', a: 'Restaurants I saved online', b: 'The city landmarks' } },
  { id: 24, axis: 'purpose', weight: 2,
    ko: { s: '내 여행 사진첩엔', a: '먹기만 한 것 같은 나', b: '풍경과 건물 사진' },
    en: { s: 'My trip album says', a: 'I did nothing but eat', b: 'Scenery and architecture' } },
  { id: 25, axis: 'purpose', weight: 1,
    ko: { s: '여행지에서 가장 아까운 건', a: '맛없는 한 끼', b: '못 본 명소' },
    en: { s: 'The biggest waste on a trip', a: 'A bad meal', b: 'A sight I missed' } },

  // ⑥ 북적임 ↔ 한적함
  { id: 26, axis: 'crowd', weight: 2,
    ko: { s: '유명 관광지', a: '유명한 덴 이유가 있다', b: '사람 많으면 피한다' },
    en: { s: 'Famous attractions', a: 'Famous for a reason', b: 'If it is packed, I skip it' } },
  { id: 27, axis: 'crowd', weight: 2,
    ko: { s: '여행 시기', a: '축제·성수기가 좋다', b: '비수기가 좋다' },
    en: { s: 'When I travel', a: 'Festivals and high season', b: 'Off season' } },
  { id: 28, axis: 'crowd', weight: 1,
    ko: { s: '낯선 골목의 갈림길', a: '사람들이 모인 쪽으로', b: '아무도 없는 쪽으로' },
    en: { s: 'A fork in an unfamiliar alley', a: 'Toward the crowd', b: 'Toward the empty side' } },
  { id: 29, axis: 'crowd', weight: 1,
    ko: { s: 'SNS에서 본 핫플', a: '모두 저장하고 가려고 함', b: '저장만' },
    en: { s: 'Hot spots I see online', a: 'Save them all and go', b: 'Save them and never go' } },
  { id: 30, axis: 'crowd', weight: 1,
    ko: { s: '여행지에서 가장 신나는 순간', a: '사람으로 가득한 광장 한복판', b: '아무도 없는 전망대' },
    en: { s: 'The best moment of a trip', a: 'The middle of a packed square', b: 'An empty lookout' } },

  // ⑦ 혼자 ↔ 함께
  { id: 31, axis: 'company', weight: 2,
    ko: { s: '내 여행 동행자는', a: '길 잘못 들어도 눈치 안 보이는 혼자', b: '안 맞을 순 있어도 둘 이상' },
    en: { s: 'Who I travel with', a: 'Alone — no one to apologize to', b: 'Two or more, friction and all' } },
  { id: 32, axis: 'company', weight: 2,
    ko: { s: '여행지의 저녁 시간', a: '숙소에서 혼자 하루 정리', b: '누구든 붙잡고 한잔' },
    en: { s: 'Evenings on a trip', a: 'Alone at the room, winding down', b: 'A drink with whoever is around' } },
  { id: 33, axis: 'company', weight: 1,
    ko: { s: '일정을 정할 때', a: '내가 가고 싶은 대로', b: '같이 의논해서' },
    en: { s: 'Deciding the itinerary', a: 'Wherever I want to go', b: 'We talk it through' } },
  { id: 34, axis: 'company', weight: 1,
    ko: { s: '사진을 남길 때', a: '셀카 아니면 풍경', b: '서로 찍어주기' },
    en: { s: 'Taking photos', a: 'Selfies or scenery', b: 'We shoot each other' } },
  { id: 35, axis: 'company', weight: 1,
    ko: { s: '여행이 끝나고', a: '혼자 곱씹는 시간이 좋다', b: '같이 얘기해야 완성된다' },
    en: { s: 'After the trip', a: 'I like replaying it alone', b: 'It is not done until we talk' } },
  { id: 36, axis: 'company', weight: 1,
    ko: { s: '여행지에서 사람 만나기', a: '카페 직원과만 대화', b: '게스트하우스·투어에서 어울린다' },
    en: { s: 'Meeting people out there', a: 'Only the cafe staff', b: 'Hostels and group tours' } },
];

// 온보딩 축약판 — 각 축의 weight 2짜리 첫 문항. 36문항은 온보딩에 넣기엔 길다(약 3분).
export const ONBOARDING_QUESTION_IDS: number[] = [1, 6, 11, 16, 21, 26, 31];

/** 축별 라벨 문구 — 명사는 1위 축, 수식어는 2위 축에서 뽑는다(utils/travelDnaScore) */
export interface DnaAxisLabel {
  nounA: string; nounB: string; adjA: string; adjB: string;
  enNounA: string; enNounB: string; enAdjA: string; enAdjB: string;
}

export const DNA_LABELS: Record<DnaAxisId, DnaAxisLabel> = {
  plan:    { nounA: '계획가', nounB: '방랑자', adjA: '계획적인', adjB: '즉흥적인',
             enNounA: 'Planner', enNounB: 'Wanderer', enAdjA: 'Methodical', enAdjB: 'Spontaneous' },
  pace:    { nounA: '휴양객', nounB: '탐험가', adjA: '느긋한', adjB: '부지런한',
             enNounA: 'Unwinder', enNounB: 'Explorer', enAdjA: 'Easygoing', enAdjB: 'Tireless' },
  terrain: { nounA: '도시인', nounB: '자연인', adjA: '도시를 걷는', adjB: '자연을 찾는',
             enNounA: 'City Dweller', enNounB: 'Nature Seeker', enAdjA: 'Street-walking', enAdjB: 'Trail-seeking' },
  budget:  { nounA: '실속파', nounB: '플렉서', adjA: '알뜰한', adjB: '아낌없는',
             enNounA: 'Value Hunter', enNounB: 'Splurger', enAdjA: 'Thrifty', enAdjB: 'Generous' },
  purpose: { nounA: '미식가', nounB: '관람객', adjA: '맛을 좇는', adjB: '눈으로 담는',
             enNounA: 'Food Lover', enNounB: 'Sightseer', enAdjA: 'Flavor-chasing', enAdjB: 'Sight-collecting' },
  crowd:   { nounA: '축제파', nounB: '은둔파', adjA: '북적임을 즐기는', adjB: '조용함을 아끼는',
             enNounA: 'Festival Goer', enNounB: 'Quiet Seeker', enAdjA: 'Crowd-loving', enAdjB: 'Solitude-loving' },
  company: { nounA: '혼행자', nounB: '동행자', adjA: '혼자가 편한', adjB: '함께가 좋은',
             enNounA: 'Solo Traveler', enNounB: 'Companion', enAdjA: 'Solo-minded', enAdjB: 'Company-loving' },
};

/** 라벨이 붙지 않는 기준 — 1위 축 강도가 이 값 미만이면 폴백 문구 */
export const DNA_LABEL_MIN_STRENGTH = 15;
```

- [ ] **Step 2: 채점 검증 파일을 먼저 작성 (실패하는 상태)**

`src/utils/travelDnaScore.verify.ts`:

```ts
// src/utils/travelDnaScore.verify.ts
// 여행 DNA 채점 검증. 이게 깨지면 매칭 점수가 조용히 틀어진다 — 화면상 원인이 안 보인다.
import { DNA_QUESTIONS, DNA_AXES, ONBOARDING_QUESTION_IDS } from '../constants/travelDna';
import { scoreAxes, answeredCount, isValidDna, type DnaAnswers } from './travelDnaScore';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// ── 1) 문항 데이터 무결성 ──
{
  const ids = DNA_QUESTIONS.map((q) => q.id);
  eq(new Set(ids).size, ids.length, '문항 id 중복 없음');
  eq(DNA_QUESTIONS.filter((q) => q.weight !== 1 && q.weight !== 2).length, 0, '가중치는 1 또는 2');
  const axesWithQ = new Set(DNA_QUESTIONS.map((q) => q.axis));
  eq(DNA_AXES.filter((a) => !axesWithQ.has(a)), [], '모든 축에 문항이 1개 이상');
  const missingText = DNA_QUESTIONS.filter((q) => !q.ko.s || !q.ko.a || !q.ko.b || !q.en.s || !q.en.a || !q.en.b);
  eq(missingText.map((q) => q.id), [], '모든 문항에 ko/en 문구가 채워져 있음');
  // 온보딩 축약판은 축마다 정확히 1문항이어야 한다 — 빠진 축이 있으면 그 축이 영영 중립에 머문다
  const onbAxes = ONBOARDING_QUESTION_IDS.map((id) => DNA_QUESTIONS.find((q) => q.id === id)?.axis);
  eq(onbAxes.filter((a) => !a), [], '축약판 id가 모두 실제 문항');
  eq([...new Set(onbAxes)].length, DNA_AXES.length, '축약판이 모든 축을 정확히 한 번씩 덮음');
}

// ── 2) 전체 응답 — 한쪽으로 몰면 극단값 ──
{
  const allA: DnaAnswers = {}; DNA_QUESTIONS.forEach((q) => { allA[q.id] = 'A'; });
  const allB: DnaAnswers = {}; DNA_QUESTIONS.forEach((q) => { allB[q.id] = 'B'; });
  eq(DNA_AXES.map((a) => scoreAxes(allA)[a]), DNA_AXES.map(() => 0), '전부 A → 모든 축 0');
  eq(DNA_AXES.map((a) => scoreAxes(allB)[a]), DNA_AXES.map(() => 100), '전부 B → 모든 축 100');
}

// ── 3) 수축 — 축약판 1문항이 극단이 되면 안 된다 ──
{
  const onlyOnb: DnaAnswers = {};
  ONBOARDING_QUESTION_IDS.forEach((id) => { onlyOnb[id] = 'B'; });
  const s = scoreAxes(onlyOnb);
  // plan 축: 전체 가중치 2+1+1+1+2 = 7, 답한 가중치 2 → conf = 2/7
  // raw = 100 → 50 + 50 * (2/7) = 64.28 → 64
  eq(s.plan, 64, '축약판 1문항(B) → 극단(100)이 아니라 64');
  const extremes = DNA_AXES.filter((a) => s[a] === 0 || s[a] === 100);
  eq(extremes, [], '축약판만으로는 어떤 축도 극단이 되지 않는다');
}

// ── 4) 무응답 축은 중립 ──
{
  eq(scoreAxes({})['plan'], 50, '응답 없음 → 50');
  const onlyPlan: DnaAnswers = { 1: 'B' };
  eq(scoreAxes(onlyPlan)['pace'], 50, '해당 축 무응답 → 50');
}

// ── 5) 유효 판정 — 모든 축에 1개 이상 ──
{
  const onb: DnaAnswers = {}; ONBOARDING_QUESTION_IDS.forEach((id) => { onb[id] = 'A'; });
  eq(isValidDna(onb), true, '축약판 7문항 → 유효');
  eq(isValidDna({ 1: 'A' }), false, '한 축만 답함 → 무효');
  eq(isValidDna({}), false, '무응답 → 무효');
  eq(answeredCount(onb), 7, '응답 수 집계');
}

// ── 6) 모르는 id는 무시 (구버전 응답에 삭제된 문항이 남아 있을 수 있다) ──
{
  const withGhost: DnaAnswers = { 1: 'B', 999: 'B' };
  eq(scoreAxes(withGhost)['plan'], scoreAxes({ 1: 'B' })['plan'], '존재하지 않는 문항 id는 무시');
  eq(answeredCount(withGhost), 1, '집계에서도 무시');
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
```

- [ ] **Step 3: 검증이 실패하는지 확인**

Run: `npm test 2>&1 | grep -A 5 "travelDnaScore"`
Expected: FAIL — `Cannot find module './travelDnaScore'`

- [ ] **Step 4: 채점 로직 구현**

`src/utils/travelDnaScore.ts`:

```ts
/**
 * 여행 DNA 채점 (순수 로직, 테스트 대상)
 *
 * 축 점수는 '답한 문항의 가중치'로 정규화한 뒤 응답량에 비례해 중립으로 수축시킨다.
 *
 *   raw   = 100 × Σ(B를 고른 문항의 w) / Σ(답한 문항의 w)
 *   conf  = Σ(답한 문항의 w) / Σ(그 축 모든 문항의 w)
 *   score = round( 50 + (raw - 50) × conf )
 *
 * ⚠️ 수축이 없으면 온보딩 축약판(축당 1문항)에서 점수가 0 아니면 100이 된다.
 *    7문항만 답한 사람이 모든 축에서 극단으로 찍히고 그대로 매칭에 들어간다.
 *    수축 덕분에 응답이 쌓일수록 점수가 자연히 극단으로 자라나 별도 보정이 필요 없다.
 */
import { DNA_QUESTIONS, DNA_AXES, type DnaAxisId, type DnaQuestion } from '../constants/travelDna';

export type DnaAnswers = Record<number, 'A' | 'B'>;
export type DnaScores = Record<DnaAxisId, number>;

// id → 문항 (매 호출마다 배열을 훑지 않게 1회 구성)
const BY_ID = new Map<number, DnaQuestion>(DNA_QUESTIONS.map((q) => [q.id, q]));

/** 응답 수 — 존재하지 않는 문항 id는 세지 않는다 */
export function answeredCount(answers: DnaAnswers): number {
  let n = 0;
  for (const key of Object.keys(answers)) {
    if (BY_ID.has(Number(key))) n += 1;
  }
  return n;
}

export function scoreAxes(answers: DnaAnswers): DnaScores {
  const total: Record<string, number> = {};
  const ans: Record<string, number> = {};
  const bw: Record<string, number> = {};
  for (const axis of DNA_AXES) { total[axis] = 0; ans[axis] = 0; bw[axis] = 0; }

  for (const q of DNA_QUESTIONS) total[q.axis] += q.weight;
  for (const [key, choice] of Object.entries(answers)) {
    const q = BY_ID.get(Number(key));
    if (!q) continue; // 삭제된 문항의 옛 응답 — 조용히 무시
    ans[q.axis] += q.weight;
    if (choice === 'B') bw[q.axis] += q.weight;
  }

  const out = {} as DnaScores;
  for (const axis of DNA_AXES) {
    if (ans[axis] === 0 || total[axis] === 0) { out[axis] = 50; continue; }
    const raw = (100 * bw[axis]) / ans[axis];
    const conf = ans[axis] / total[axis];
    out[axis] = Math.round(50 + (raw - 50) * conf);
  }
  return out;
}

/** 유효 응답 — 모든 축에 답이 1개 이상. 축약판(7문항)도 유효다 */
export function isValidDna(answers: DnaAnswers): boolean {
  const seen = new Set<DnaAxisId>();
  for (const [key, choice] of Object.entries(answers)) {
    const q = BY_ID.get(Number(key));
    if (q && (choice === 'A' || choice === 'B')) seen.add(q.axis);
  }
  return DNA_AXES.every((a) => seen.has(a));
}
```

- [ ] **Step 5: 검증 통과 확인**

Run: `npm test 2>&1 | grep -A 20 "travelDnaScore"`
Expected: 모든 항목 `✓`, 마지막 `✅ 모든 검증 통과`

- [ ] **Step 6: 타입·린트 확인**

Run: `npx tsc --noEmit && npx eslint src/constants/travelDna.ts src/utils/travelDnaScore.ts src/utils/travelDnaScore.verify.ts`
Expected: 출력 없음(오류 0)

- [ ] **Step 7: 커밋**

```bash
git add src/constants/travelDna.ts src/utils/travelDnaScore.ts src/utils/travelDnaScore.verify.ts
git commit -m "feat(dna): 여행 DNA 문항 36개·7축 상수와 채점 로직

응답량 비례 중립 수축(conf) 포함 — 없으면 온보딩 축약판(축당 1문항)에서
점수가 0/100 극단이 되어 7문항만 답한 사람이 확신에 찬 오답으로 매칭에 들어간다.
검증 파일에서 축약판이 극단을 만들지 않는지 직접 잡는다."
```

---

### Task 2: 유형 라벨 생성

**Files:**
- Modify: `src/utils/travelDnaScore.ts` (함수 추가)
- Modify: `src/utils/travelDnaScore.verify.ts` (검증 추가)

**Interfaces:**
- Consumes: Task 1의 `DnaScores`, `DNA_LABELS`, `DNA_AXES`, `DNA_LABEL_MIN_STRENGTH`
- Produces:
  - `interface DnaTypeLabel { key: string; ko: string; en: string }`
  - `function makeTypeLabel(scores: DnaScores): DnaTypeLabel`
  - `key` 형식: `"<1위축><A|B>-<2위축><A|B>"` (예: `purposeA-paceB`), 폴백은 `"neutral"`

- [ ] **Step 1: 라벨 검증을 먼저 추가 (실패하는 상태)**

`src/utils/travelDnaScore.verify.ts`의 `import` 줄에 `makeTypeLabel`을 추가하고, `if (failed)` 줄 **바로 위**에 붙인다:

```ts
// ── 7) 유형 라벨 ──
{
  const mid = {} as any; DNA_AXES.forEach((a) => { mid[a] = 50; });

  // 모든 축이 중립 → 폴백
  eq(makeTypeLabel(mid).key, 'neutral', '전 축 중립 → 폴백 라벨');

  // 1위 purpose(A쪽 20 → 강도 30), 2위 pace(B쪽 85 → 강도 35)... 강도 큰 쪽이 1위다
  const s1 = { ...mid, purpose: 10, pace: 85 };  // 강도 40, 35
  eq(makeTypeLabel(s1).ko, '부지런한 미식가', '1위=명사(미식가), 2위=수식어(부지런한)');
  eq(makeTypeLabel(s1).key, 'purposeA-paceB', '라벨 키 형식');

  // 방향이 뒤집히면 반대쪽 문구
  const s2 = { ...mid, purpose: 90, pace: 15 };  // 강도 40, 35
  eq(makeTypeLabel(s2).ko, '느긋한 관람객', '점수>50이면 B쪽 문구');

  // 동점이면 축 순서(DNA_AXES)가 빠른 쪽이 명사
  const s3 = { ...mid, plan: 90, pace: 90 };
  eq(makeTypeLabel(s3).key, 'planB-paceB', '동점 → 앞선 축이 명사');

  // 결정성 — 같은 입력이면 항상 같은 출력
  eq(makeTypeLabel(s1).key, makeTypeLabel({ ...s1 }).key, '같은 응답 → 같은 라벨');

  // 1위 강도가 문턱 미만이면 폴백 (2위가 아무리 있어도)
  eq(makeTypeLabel({ ...mid, plan: 60 }).key, 'neutral', '1위 강도 10 < 15 → 폴백');
}
```

- [ ] **Step 2: 실패 확인**

Run: `npm test 2>&1 | grep -A 5 "travelDnaScore"`
Expected: FAIL — `makeTypeLabel` is not exported

- [ ] **Step 3: 라벨 생성 구현**

`src/utils/travelDnaScore.ts` 맨 아래에 추가하고, 상단 import에 `DNA_LABELS`·`DNA_LABEL_MIN_STRENGTH`를 더한다:

```ts
export interface DnaTypeLabel { key: string; ko: string; en: string }

/**
 * 유형 라벨 — 가장 강한 축이 명사, 두 번째가 수식어.
 *
 * 7축이면 조합이 128가지라 프로토타입을 미리 쓰는 방식은 커버가 성기다.
 * 조합식이면 작성할 문구가 28개뿐이라 품질을 사람이 통제할 수 있고, 축을 늘려도 규칙이 그대로다.
 *
 * 강도는 중립(50)에서의 거리. 동점이면 DNA_AXES 순서가 빠른 축이 명사를 갖는다 —
 * 결정론적이어야 같은 응답에 항상 같은 라벨이 나온다.
 */
export function makeTypeLabel(scores: DnaScores): DnaTypeLabel {
  const ranked = DNA_AXES
    .map((axis, i) => ({ axis, i, strength: Math.abs(scores[axis] - 50), toB: scores[axis] > 50 }))
    .sort((x, y) => (y.strength - x.strength) || (x.i - y.i));

  const top = ranked[0];
  if (!top || top.strength < DNA_LABEL_MIN_STRENGTH) {
    return { key: 'neutral', ko: '아직 색이 옅은 여행자', en: 'A traveler still taking shape' };
  }
  const second = ranked[1];
  const nl = DNA_LABELS[top.axis];
  const al = DNA_LABELS[second.axis];
  const noun = top.toB ? nl.nounB : nl.nounA;
  const enNoun = top.toB ? nl.enNounB : nl.enNounA;
  const adj = second.toB ? al.adjB : al.adjA;
  const enAdj = second.toB ? al.enAdjB : al.enAdjA;
  return {
    key: `${top.axis}${top.toB ? 'B' : 'A'}-${second.axis}${second.toB ? 'B' : 'A'}`,
    ko: `${adj} ${noun}`,
    en: `${enAdj} ${enNoun}`,
  };
}
```

- [ ] **Step 4: 검증 통과 확인**

Run: `npm test 2>&1 | grep -A 30 "travelDnaScore"`
Expected: 라벨 항목 6개 포함 전부 `✓`

- [ ] **Step 5: 타입·린트 확인**

Run: `npx tsc --noEmit && npx eslint src/utils/travelDnaScore.ts src/utils/travelDnaScore.verify.ts`
Expected: 출력 없음

- [ ] **Step 6: 커밋**

```bash
git add src/utils/travelDnaScore.ts src/utils/travelDnaScore.verify.ts
git commit -m "feat(dna): 유형 라벨 생성 — 강한 2축 조합

1위 축이 명사, 2위가 수식어. 동점은 축 순서로 갈라 결정론을 보장한다
(같은 응답에 라벨이 흔들리면 프로필 배지가 매번 바뀐다)."
```

---

### Task 3: 서버 — travel_dna 테이블·RLS·공개 뷰

**Files:**
- Modify: `supabase/schema.sql` (11번 절 뒤, 12번 절 앞에 새 절 삽입)
- Modify: `supabase/SERVER-STATE.md` (1번 절 "지금 해야 하는 것")

**Interfaces:**
- Consumes: 없음
- Produces:
  - 표 `public.travel_dna(user_id, answers jsonb, scores smallint[], type_key text, answered smallint, updated_at)`
  - `public.public_profiles` 뷰에 `dna_type_key` 컬럼
  - RPC `public.save_travel_dna(p_answers jsonb, p_scores smallint[], p_type_key text, p_answered smallint)`

- [ ] **Step 1: 스키마 추가**

⚠️ **삽입 위치가 중요하다.** `schema.sql`은 SQL Editor에 위에서부터 통째로 붙여넣어 실행되고,
`check_function_bodies`(기본 on)가 `language sql` 함수 본문을 **CREATE 시점에** 카탈로그로 검증한다.
`travel_dna`를 참조하는 곳이 둘이므로 표는 **그 둘보다 모두 먼저** 만들어져야 한다.

| 참조하는 곳 | 위치 | 태스크 |
|---|---|---|
| `mate_suggestions_compute` (language sql) | ~712행 | Task 4 |
| `public_profiles` 최종 재정의 | ~1499행 | Task 3 Step 2 |

→ **`drop function if exists public.travel_overlap_suggestions(int);` 줄 바로 위**(즉 여행 DNA 매칭
섹션이 시작되기 직전, ~704행)에 삽입한다. 이 표의 의존 대상은 `public.profiles`(25행)뿐이라
이 위치가 안전하다.

뒤에 두면 재실행이 `relation "public.travel_dna" does not exist`로 실패해 배포 수단 자체가 깨진다.

```sql
-- ============================================================
-- 3-a) 여행 DNA 설문
--   설계: docs/superpowers/specs/2026-08-05-travel-dna-survey-design.md
--   기록에서 짜내던 계절·관심사·성향 3축(35점)을 이 설문이 대체한다.
--
--   ⚠️ 위치 고정 — mate_suggestions_compute(712행, language sql)와 public_profiles
--      재정의(1499행)가 이 표를 참조한다. 뒤로 옮기면 check_function_bodies가
--      CREATE 시점에 잡아 schema.sql 재실행이 통째로 죽는다.
-- ============================================================
create table if not exists public.travel_dna (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  -- 응답 원본 {"1":"A","2":"B",...}. 문항을 추가하거나 가중치를 바꿔도
  -- 재검사 없이 점수를 다시 계산할 수 있다.
  answers    jsonb not null,
  -- 7축 점수(각 0~100). 순서는 클라이언트 DNA_AXES와 1:1 —
  -- plan, pace, terrain, budget, purpose, crowd, company
  scores     smallint[] not null,
  type_key   text,
  answered   smallint not null default 0,
  updated_at timestamptz not null default now()
);
-- 추천 후보 표본 조회용(최근 갱신순) — mate_suggestions의 3번째 후보 경로가 쓴다
create index if not exists idx_travel_dna_updated on public.travel_dna (updated_at desc);

alter table public.travel_dna enable row level security;

drop policy if exists "dna_select_own" on public.travel_dna;
create policy "dna_select_own" on public.travel_dna
  for select to authenticated using (user_id = auth.uid());

-- 쓰기는 아래 RPC(security definer)로만. 클라이언트가 직접 insert 하면
-- 점수를 임의로 조작해 매칭을 올릴 수 있다.
revoke insert, update, delete on public.travel_dna from anon, authenticated;

-- 응답 저장 — 점수·라벨은 클라이언트가 계산해 보내지만, 서버가 응답 원본과 함께
-- 보관하므로 이상이 발견되면 answers로 재계산해 덮어쓸 수 있다.
create or replace function public.save_travel_dna(
  p_answers jsonb, p_scores smallint[], p_type_key text, p_answered smallint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  -- 축 개수가 어긋나면 매칭 계산에서 조용히 틀어지므로 여기서 막는다
  if array_length(p_scores, 1) is distinct from 7 then
    raise exception 'travel_dna.scores must have exactly 7 elements';
  end if;
  insert into public.travel_dna (user_id, answers, scores, type_key, answered, updated_at)
  values (auth.uid(), p_answers, p_scores, p_type_key, coalesce(p_answered, 0), now())
  on conflict (user_id) do update
    set answers = excluded.answers, scores = excluded.scores,
        type_key = excluded.type_key, answered = excluded.answered, updated_at = now();
end; $$;
grant execute on function public.save_travel_dna(jsonb, smallint[], text, smallint) to authenticated;
```

- [ ] **Step 2: 공개 뷰에 유형 라벨만 노출**

`supabase/schema.sql`에서 **두 번째** `create or replace view public.public_profiles`(파일 하단, `stay_status`가 있는 정의)를 찾아 `from public.profiles` 바로 위에 컬럼을 추가한다:

```sql
         case when auth.uid() = id or public.are_neighbors(auth.uid(), id) then stay_status else null end as stay_status,
         -- 여행 DNA는 '유형 라벨만' 공개한다. 축 점수는 본인만 —
         -- 매칭 계산은 security definer RPC 안에서 도니 점수를 열 이유가 없고,
         -- '혼자 ↔ 함께' 같은 축은 그대로 노출되면 불편할 수 있다.
         (select d.type_key from public.travel_dna d where d.user_id = profiles.id) as dna_type_key
  from public.profiles
```

- [ ] **Step 3: 서버 상태 문서에 실행 대기 기록**

`supabase/SERVER-STATE.md`의 `## 1. 지금 해야 하는 것 — 없음 (2026-08-05 기준)` 제목과 그 아래 문단을 다음으로 교체한다:

```markdown
## 1. 지금 해야 하는 것 — 1건 (여행 DNA 설문)

| # | 무엇을 | 어디서 | 왜 |
|---|---|---|---|
| 1 | `schema.sql` 재실행 | SQL Editor | `travel_dna` 표·RLS·`save_travel_dna` RPC, `public_profiles.dna_type_key`, `mate_suggestions_compute` 재편(계절·관심사·성향 → 설문축), 캐시 무효화 트리거 확장 |

앱보다 **서버를 먼저** 올려도 안전하다 — 아무도 설문을 안 한 상태라 설문축이 0이고
정규화가 기록 축 65점 만점으로 돌아간다. 구버전 앱은 `season/interest/taste` 컬럼을
그대로 받는다(값 0).

```sql
-- 반영 확인
select count(*) from public.travel_dna;                      -- 표 없으면 에러 = 미반영
select proname from pg_proc where pronamespace='public'::regnamespace
   and proname in ('save_travel_dna','mate_suggestions_compute');
select column_name from information_schema.columns
 where table_name='public_profiles' and column_name='dna_type_key';
```

2026-08-05 확장성 작업의 서버 반영 2건은 같은 날 완료됐다(아래 2번 표 참조).
```

- [ ] **Step 4: SQL 문법 확인**

Run: `node -e "const s=require('fs').readFileSync('supabase/schema.sql','utf8'); const o=(s.match(/\$\$/g)||[]).length; console.log('달러 인용 짝:', o, o%2===0?'OK':'홀수 — 어딘가 안 닫힘');"`
Expected: `달러 인용 짝: <짝수> OK`

- [ ] **Step 5: 커밋**

```bash
git add supabase/schema.sql supabase/SERVER-STATE.md
git commit -m "feat(dna): travel_dna 테이블·RLS·저장 RPC와 공개 뷰 유형 라벨

쓰기는 save_travel_dna(security definer)로만 — 클라이언트가 직접 insert 하면
점수를 조작해 매칭을 올릴 수 있다. 공개 뷰에는 type_key만 싣고 축 점수는 본인만 본다."
```

---

### Task 4: 서버 — 매칭 점수 재편

**Files:**
- Modify: `supabase/schema.sql` (`mate_suggestions_compute` 본문, 캐시 무효화 트리거)

**Interfaces:**
- Consumes: Task 3의 `travel_dna` 표
- Produces: `mate_suggestions` 반환에 `survey_score int` 추가. `season_score`·`interest_score`·`taste_score`는 컬럼 유지·값 `0`.

- [ ] **Step 1: 반환 시그니처에 survey_score 추가**

`mate_suggestions_compute`와 캐시 래퍼 `mate_suggestions`의 `returns table (...)` 두 곳, 그리고 래퍼의 `jsonb_to_recordset ... as r(...)` 정의와 `return query select` 목록에 `survey_score int`를 **`mutual_score` 바로 뒤**에 넣는다. 네 곳 모두 순서가 같아야 한다.

```sql
  mutual_score int, survey_score int,
```

- [ ] **Step 2: 설문 유사도 계산 CTE 추가**

`mate_suggestions_compute` 본문에서 `-- 2단계: 후보에만 비싼 계산.` 주석 위에 삽입한다:

```sql
  -- 설문 성향 — 축별 점수 차를 유사도로 바꿔 합산(축당 5점, 7축 = 35점).
  -- 나누는 값이 100이 아니라 50인 이유: 무작위 두 사람의 축별 평균 차이가 약 33이라
  -- 100으로 나누면 아무나 0.67을 받아 변별력이 사라진다.
  my_dna as (select scores from public.travel_dna, me where user_id = me.uid),
  csurvey as (
    select d.user_id as cid,
           round(sum(greatest(0, 1 - abs(a.v - b.v) / 50.0) * 5))::int as n
    from public.travel_dna d
    join my_dna m on true
    cross join lateral unnest(m.scores) with ordinality as a(v, i)
    cross join lateral unnest(d.scores) with ordinality as b(v, j)
    where d.user_id in (select cid from cand) and a.i = b.j
    group by d.user_id
  ),
```

- [ ] **Step 3: 후보 선정에 설문 완료자 경로 추가**

`cand as (` 블록 안, `union` 으로 이어진 두 번째 select 뒤에 세 번째 경로를 추가한다:

```sql
      union
      -- 3번째 경로 — 설문 완료자 표본.
      -- 기존 두 경로(나라 겹침·공통 메이트)는 기록이 있어야 걸린다.
      -- 이게 없으면 기록 없는 신규는 설문을 마쳐도 후보에 못 들어와 추천이 0이다.
      select d.user_id as cid
      from public.travel_dna d
      order by d.updated_at desc
      limit 100
```

- [ ] **Step 4: 점수 합산과 정규화 교체**

점수 계산 블록에서 `season_score`·`interest_score`·`taste_score` 세 줄을 상수 0으로 바꾸고 설문축을 더한다:

```sql
      0 as season_score,
      0 as interest_score,
      0 as taste_score,
      round(least(coalesce(m.mutual_count,0), 3) / 3.0 * 10)::int as mutual_score,
      coalesce(cs.n, 0) as survey_score
```

`from` 절에 `left join csurvey cs on cs.cid = sc.cid`를 추가하고, `total_score` 계산을 교체한다:

```sql
      -- 둘 다 유효 응답이 있을 때만 100점 만점. 아니면 기록 축(65) 만점을 100으로 환산한다 —
      -- 설문축을 0으로 두면 설문 안 한 사람이 추천에서 부당하게 밀린다.
      case when sc.survey_score is null or not exists (select 1 from my_dna)
        then round((sc.place_score + sc.recency_score + sc.mutual_score) * 100.0 / 65)::int
        else (sc.place_score + sc.recency_score + sc.mutual_score + sc.survey_score)
      end as total_score
```

`picked` CTE의 두 select 목록과 최종 projection에도 `survey_score`를 같은 자리에 추가한다.

- [ ] **Step 5: 죽은 계산 CTE 제거**

점수를 `0`으로 바꾸는 것만으로는 **계산이 그대로 돈다.** 스펙이 약속한 성능 이득
(오늘 캐시까지 넣어야 했던 그 RPC의 계산량 감소)이 나오려면 CTE 자체를 지워야 한다.

`mate_suggestions_compute`에서 아래 CTE를 삭제한다:

```
my_keywords, my_rating, my_budget, my_flight     -- 내 취향 추출
ckeywords, crating, cbudget, cflight             -- 후보 취향 추출
pub_season, cseason                              -- 계절 판정
```

이들을 참조하던 `left join`도 함께 지운다(`k`, `r`, `se`, `ct` 별칭).

`pub` CTE의 `trip_date` 계산과 `safe_to_date` 호출은 **남긴다** — `recency_score`(시의성)가
아직 쓴다. `pub_season`만 지운다.

반환 컬럼 `shared_keywords`는 시그니처 유지를 위해 남기되 `'{}'::text[]`를 반환한다.
구버전 앱은 이 값이 비면 관심사 근거 문구를 건너뛰고 다음 분기로 넘어간다(무해).

```sql
         p.shared_cities, '{}'::text[] as shared_keywords
```

- [ ] **Step 6: 캐시 무효화 트리거 확장**

`invalidate_mate_cache` 트리거 정의 아래에 추가한다:

```sql
-- 설문을 마쳐도 캐시(TTL 6시간) 때문에 추천이 안 바뀌던 문제 — posts 외에 여기도 무효화한다.
drop trigger if exists trg_dna_invalidate_mate_cache on public.travel_dna;
create trigger trg_dna_invalidate_mate_cache
  after insert or update on public.travel_dna
  for each row execute function public.invalidate_mate_cache();
```

`invalidate_mate_cache`는 `new.author_id`를 읽으므로 `travel_dna`에서는 동작하지 않는다. 함수를 두 표 모두에서 쓰도록 고친다:

```sql
create or replace function public.invalidate_mate_cache()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  -- ⚠️ DELETE 트리거에서 new 는 미할당이라 필드를 읽으면 예외가 난다. 반드시 tg_op 로 분기할 것.
  -- 표마다 사용자 컬럼 이름이 다르다: posts=author_id, travel_dna=user_id
  if tg_table_name = 'travel_dna' then
    uid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  else
    uid := case when tg_op = 'DELETE' then old.author_id else new.author_id end;
  end if;
  delete from public.mate_suggestions_cache where user_id = uid;
  return null;
exception when others then
  return null; -- 캐시 정리 실패가 저장을 막으면 안 된다
end; $$;
```

- [ ] **Step 7: SQL 문법·시그니처 정합 확인**

Run: `node -e "const s=require('fs').readFileSync('supabase/schema.sql','utf8'); const n=(s.match(/survey_score/g)||[]).length; console.log('survey_score 등장:', n, n>=6?'OK(시그니처 2 + 래퍼 2 + 계산 + projection)':'부족 — 빠진 자리 확인'); const d=(s.match(/\$\$/g)||[]).length; console.log('달러 인용 짝:', d%2===0?'OK':'홀수');"`
Expected: `survey_score 등장: 6 이상 OK`, `달러 인용 짝: OK`

- [ ] **Step 8: 커밋**

```bash
git add supabase/schema.sql
git commit -m "feat(dna): 매칭 점수 재편 — 계절·관심사·성향 3축을 설문축 35점으로 교체

· 후보 선정에 '설문 완료자 표본' 3번째 경로 — 없으면 기록 없는 신규는 설문을 마쳐도 추천 0
· 한쪽이라도 설문 미완료면 기록 축 65점 만점을 100으로 환산(미완료자가 밀리지 않게)
· invalidate_mate_cache를 posts/travel_dna 양쪽에서 쓰도록 컬럼 분기(안 하면 6시간 반영 지연)
· season/interest/taste 컬럼은 값 0으로 유지 — 지우면 구버전 앱이 깨진다"
```

---

### Task 5: 클라이언트 서비스와 스토어

**Files:**
- Create: `src/services/travelDna.ts`
- Create: `src/store/travelDnaStore.tsx`
- Modify: `App.tsx` (Provider 등록)

**Interfaces:**
- Consumes: Task 1·2의 `scoreAxes`/`makeTypeLabel`/`isValidDna`, Task 3의 RPC
- Produces:
  - `fetchMyDna(): Promise<{ answers: DnaAnswers; scores: DnaScores; typeKey: string|null; answered: number } | null>`
  - `saveMyDna(answers: DnaAnswers): Promise<boolean>`
  - `useTravelDna(): { answers, scores, typeKey, label, answered, isComplete, hasAny, submit, refresh }`

- [ ] **Step 1: 서비스 작성**

`src/services/travelDna.ts`:

```ts
/**
 * 여행 DNA 서비스 — 서버가 진실이다.
 *
 * 점수·라벨은 클라이언트가 계산해 함께 올린다. 서버가 응답 원본(answers)도 보관하므로
 * 문항이나 가중치가 바뀌면 재검사 없이 재계산해 덮어쓸 수 있다.
 */
import { supabase } from './supabase';
import { scoreAxes, makeTypeLabel, answeredCount, type DnaAnswers, type DnaScores } from '../utils/travelDnaScore';
import { DNA_AXES } from '../constants/travelDna';

export interface MyDna {
  answers: DnaAnswers;
  scores: DnaScores;
  typeKey: string | null;
  answered: number;
}

/** 실패·미설정·미응답은 전부 null (호출부가 '아직 안 함'으로 처리) */
export async function fetchMyDna(): Promise<MyDna | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('travel_dna')
      .select('answers, scores, type_key, answered')
      .maybeSingle();
    if (error || !data) return null;
    const answers = (data.answers ?? {}) as DnaAnswers;
    return {
      answers,
      // 서버 배열을 그대로 믿지 않고 로컬에서 다시 계산한다 — 문항이 바뀌었을 수 있다
      scores: scoreAxes(answers),
      typeKey: (data.type_key as string) ?? null,
      answered: (data.answered as number) ?? answeredCount(answers),
    };
  } catch {
    return null;
  }
}

export async function saveMyDna(answers: DnaAnswers): Promise<boolean> {
  if (!supabase) return false;
  try {
    const scores = scoreAxes(answers);
    const { error } = await supabase.rpc('save_travel_dna', {
      p_answers: answers,
      // ⚠️ 순서는 DNA_AXES 기준 — 서버 scores 배열과 1:1이어야 한다
      p_scores: DNA_AXES.map((a) => scores[a]),
      p_type_key: makeTypeLabel(scores).key,
      p_answered: answeredCount(answers),
    });
    return !error;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: 스토어 작성**

`src/store/travelDnaStore.tsx`:

```tsx
/**
 * 여행 DNA 상태 — 서버 우선. 로컬은 읽기 캐시일 뿐이다.
 *
 * settingsStore에 얹지 않는다: settingsStore는 로컬 우선(local-first) 전제인데
 * 여행 DNA는 정반대로 서버가 진실이다. 한 파일에 두면 두 원칙이 뒤엉킨다.
 *
 * 로그아웃 시 캐시를 지운다 — 계정 귀속 데이터라 남기면 다음 계정에 남의 유형이 보인다.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadEnvelope, saveEnvelope, STORE_KEYS } from './persist';
import { fetchMyDna, saveMyDna } from '../services/travelDna';
import { scoreAxes, makeTypeLabel, isValidDna, answeredCount, type DnaAnswers, type DnaScores, type DnaTypeLabel } from '../utils/travelDnaScore';
import { DNA_QUESTIONS } from '../constants/travelDna';

interface TravelDnaValue {
  answers: DnaAnswers;
  scores: DnaScores;
  label: DnaTypeLabel;
  answered: number;
  /** 모든 축에 답이 1개 이상 — 매칭에 반영되는 기준 */
  isComplete: boolean;
  /** 36문항 전부 답함 */
  isFull: boolean;
  submit: (answers: DnaAnswers) => Promise<boolean>;
  refresh: () => Promise<void>;
  clear: () => void;
}

const Ctx = createContext<TravelDnaValue | null>(null);

export function TravelDnaProvider({ children }: { children: React.ReactNode }) {
  const [answers, setAnswers] = useState<DnaAnswers>({});

  // 마운트 시 로컬 캐시 → 서버 순으로 채운다(오프라인에서도 내 유형은 보여야 한다)
  useEffect(() => {
    (async () => {
      const cached = await loadEnvelope<DnaAnswers>(STORE_KEYS.travelDna);
      if (cached && typeof cached === 'object') setAnswers(cached);
      const remote = await fetchMyDna();
      if (remote) {
        setAnswers(remote.answers);
        saveEnvelope(STORE_KEYS.travelDna, remote.answers);
      }
    })();
  }, []);

  const submit = useCallback(async (next: DnaAnswers) => {
    setAnswers(next);                              // 낙관 반영 — 결과 화면이 바로 그려진다
    saveEnvelope(STORE_KEYS.travelDna, next);
    return saveMyDna(next);                        // 실패해도 로컬은 남는다(다음 진입에 재시도)
  }, []);

  const refresh = useCallback(async () => {
    const remote = await fetchMyDna();
    if (remote) { setAnswers(remote.answers); saveEnvelope(STORE_KEYS.travelDna, remote.answers); }
  }, []);

  const clear = useCallback(() => { setAnswers({}); saveEnvelope(STORE_KEYS.travelDna, {}); }, []);

  const value = useMemo<TravelDnaValue>(() => {
    const scores = scoreAxes(answers);
    return {
      answers, scores,
      label: makeTypeLabel(scores),
      answered: answeredCount(answers),
      isComplete: isValidDna(answers),
      isFull: answeredCount(answers) >= DNA_QUESTIONS.length,
      submit, refresh, clear,
    };
  }, [answers, submit, refresh, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTravelDna(): TravelDnaValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTravelDna must be used within TravelDnaProvider');
  return v;
}
```

- [ ] **Step 3: 영속 키 추가**

`src/store/persist.ts`의 `STORE_KEYS` 객체에 한 줄 추가한다:

```ts
  travelDna: 'eorth.travelDna',
```

- [ ] **Step 4: Provider 등록**

`App.tsx`에서 `RecordProvider`(또는 그에 준하는 스토어 Provider)를 감싸는 위치에 `TravelDnaProvider`를 넣는다. import를 추가하고 트리에 감싼다:

```tsx
import { TravelDnaProvider } from './src/store/travelDnaStore';
```

- [ ] **Step 5: 타입·린트 확인**

Run: `npx tsc --noEmit && npx eslint src/services/travelDna.ts src/store/travelDnaStore.tsx App.tsx`
Expected: 출력 없음

- [ ] **Step 6: 커밋**

```bash
git add src/services/travelDna.ts src/store/travelDnaStore.tsx src/store/persist.ts App.tsx
git commit -m "feat(dna): 여행 DNA 서비스·스토어 — 서버 우선, 로컬은 읽기 캐시

settingsStore(로컬 우선)에 얹지 않는다 — 두 원칙이 뒤엉킨다.
서버 배열을 그대로 믿지 않고 answers로 매번 재계산한다(문항이 바뀌었을 수 있다)."
```

---

### Task 6: 설문 화면

**Files:**
- Create: `src/screens/TravelDnaSurveyScreen.tsx`
- Modify: `src/navigation/types.ts`
- Modify: `src/navigation/AppNavigator.tsx`
- Modify: `src/i18n/locales/ko.ts`, `src/i18n/locales/en.ts`

**Interfaces:**
- Consumes: Task 5의 `useTravelDna`, Task 1의 `DNA_QUESTIONS`/`ONBOARDING_QUESTION_IDS`
- Produces: 라우트 `TravelDnaSurvey: { mode: 'full' | 'onboarding' }`

- [ ] **Step 1: 라우트 타입 추가**

`src/navigation/types.ts`의 `RootStackParamList`에 추가한다:

```ts
  TravelDnaSurvey: { mode: 'full' | 'onboarding' };
  TravelDnaResult: { from?: 'onboarding' } | undefined;
```

- [ ] **Step 2: 문구 추가**

`src/i18n/locales/ko.ts`에 최상위 키로 추가한다:

```ts
  dna: {
    surveyTitle: '여행 성향 알아보기',
    progress: '{{current}} / {{total}}',
    skip: '건너뛰기',
    prev: '이전',
    quitTitle: '그만둘까요?',
    quitMsg: '지금까지 고른 답은 저장되지 않아요.',
    quitOk: '그만두기',
    saveFailed: '저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
    resultTitle: '내 여행 DNA',
    retake: '다시 검사하기',
    continueSurvey: '이어서 답하기',
    startSurvey: '성향 알아보기',
    bannerTitle: '여행 성향을 알려주세요',
    bannerDesc: '비슷한 취향의 메이트를 먼저 보여드려요',
    accuracy: '정확도 {{percent}}%',
    axisPlan: '계획 · 즉흥',
    axisPace: '휴식 · 활동',
    axisTerrain: '도시 · 자연',
    axisBudget: '알뜰 · 아낌없이',
    axisPurpose: '미식 · 관광',
    axisCrowd: '북적임 · 한적함',
    axisCompany: '혼자 · 함께',
  },
```

`src/i18n/locales/en.ts`에 같은 구조로 추가한다:

```ts
  dna: {
    surveyTitle: 'Find your travel type',
    progress: '{{current}} / {{total}}',
    skip: 'Skip',
    prev: 'Back',
    quitTitle: 'Stop the survey?',
    quitMsg: "Your answers so far won't be saved.",
    quitOk: 'Stop',
    saveFailed: "Couldn't save. Please try again in a moment.",
    resultTitle: 'My Travel DNA',
    retake: 'Retake',
    continueSurvey: 'Continue',
    startSurvey: 'Find my type',
    bannerTitle: 'Tell us how you travel',
    bannerDesc: "We'll show mates with similar taste first",
    accuracy: '{{percent}}% complete',
    axisPlan: 'Planned · Spontaneous',
    axisPace: 'Restful · Active',
    axisTerrain: 'City · Nature',
    axisBudget: 'Thrifty · Generous',
    axisPurpose: 'Food · Sights',
    axisCrowd: 'Crowds · Quiet',
    axisCompany: 'Solo · Together',
  },
```

- [ ] **Step 3: 설문 화면 작성**

`src/screens/TravelDnaSurveyScreen.tsx`:

```tsx
/**
 * 여행 DNA 설문 — 전체(36문항)와 온보딩 축약판(7문항) 공용.
 *
 * 한 화면에 한 문항. 고르면 바로 다음으로 넘어간다(확인 버튼 없음) —
 * 36문항에서 탭이 두 배가 되면 완주율이 떨어진다.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { DNA_QUESTIONS, ONBOARDING_QUESTION_IDS } from '../constants/travelDna';
import { useTravelDna } from '../store/travelDnaStore';
import type { DnaAnswers } from '../utils/travelDnaScore';
import type { RootStackScreenProps } from '../navigation/types';

const C = { bg: '#0A0A0F', card: '#2E2E3B', neon: '#BF85FC', dim: '#A1A1B0', line: '#1A1A26' };

export default function TravelDnaSurveyScreen({ navigation, route }: RootStackScreenProps<'TravelDnaSurvey'>) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { answers: saved, submit } = useTravelDna();
  const onboarding = route.params?.mode === 'onboarding';

  const questions = useMemo(
    () => (onboarding
      ? DNA_QUESTIONS.filter((q) => ONBOARDING_QUESTION_IDS.includes(q.id))
      : DNA_QUESTIONS),
    [onboarding]
  );

  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<DnaAnswers>(saved);
  const [saving, setSaving] = useState(false);
  const q = questions[idx];
  const text = i18n.language.startsWith('en') ? q.en : q.ko;

  const finish = async (next: DnaAnswers) => {
    setSaving(true);
    const ok = await submit(next);
    setSaving(false);
    if (!ok) { Alert.alert('', t('dna.saveFailed')); return; }
    navigation.replace('TravelDnaResult', onboarding ? { from: 'onboarding' } : undefined);
  };

  const choose = (choice: 'A' | 'B') => {
    if (saving) return;
    Haptics.selectionAsync().catch(() => {});
    const next = { ...answers, [q.id]: choice };
    setAnswers(next);
    if (idx + 1 < questions.length) { setIdx(idx + 1); return; }
    finish(next);
  };

  const quit = () => {
    if (Object.keys(answers).length === 0) { navigation.goBack(); return; }
    Alert.alert(t('dna.quitTitle'), t('dna.quitMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('dna.quitOk'), style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  };

  // 안드로이드 뒤로가기는 '이전 문항'으로 — 화면을 통째로 벗어나면 답이 다 날아간다
  useFocusEffect(
    React.useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (idx > 0) { setIdx(idx - 1); return true; }
        quit();
        return true;
      });
      return () => sub.remove();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idx, answers, saving])
  );

  return (
    <View style={[st.container, { paddingTop: insets.top + 12 }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={quit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={st.skip}>{t('dna.skip')}</Text>
        </TouchableOpacity>
        <Text style={st.progress}>{t('dna.progress', { current: idx + 1, total: questions.length })}</Text>
      </View>

      <View style={st.barTrack}>
        <View style={[st.barFill, { width: `${((idx + 1) / questions.length) * 100}%` }]} />
      </View>

      <View style={st.body}>
        <Text style={st.situation}>{text.s}</Text>
        <TouchableOpacity style={st.choice} activeOpacity={0.85} onPress={() => choose('A')}>
          <Text style={st.choiceText}>{text.a}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.choice} activeOpacity={0.85} onPress={() => choose('B')}>
          <Text style={st.choiceText}>{text.b}</Text>
        </TouchableOpacity>
      </View>

      <View style={[st.footer, { paddingBottom: insets.bottom + 16 }]}>
        {idx > 0 && (
          <TouchableOpacity onPress={() => setIdx(idx - 1)}>
            <Text style={st.prev}>{t('dna.prev')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skip: { color: C.dim, fontSize: 14 },
  progress: { color: C.dim, fontSize: 13, fontWeight: '600' },
  barTrack: { height: 3, borderRadius: 2, backgroundColor: C.line, marginTop: 14, overflow: 'hidden' },
  barFill: { height: 3, borderRadius: 2, backgroundColor: C.neon },
  body: { flex: 1, justifyContent: 'center', gap: 14 },
  situation: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginBottom: 18, lineHeight: 30 },
  choice: {
    backgroundColor: C.card, borderRadius: 18, paddingVertical: 22, paddingHorizontal: 20,
    borderWidth: 1, borderColor: C.line,
  },
  choiceText: { color: '#FFFFFF', fontSize: 16, lineHeight: 24 },
  footer: { minHeight: 44, justifyContent: 'center' },
  prev: { color: C.dim, fontSize: 14 },
});
```

- [ ] **Step 4: 타입·린트 확인**

라우트 등록(`AppNavigator.tsx`)은 Task 7에서 두 화면을 한 번에 붙인다 — 여기서 등록하면
아직 없는 `TravelDnaResultScreen`을 import하게 되어 이 태스크가 단독으로 컴파일되지 않는다.

Run: `npx tsc --noEmit && npx eslint src/screens/TravelDnaSurveyScreen.tsx src/navigation/types.ts src/i18n/locales/ko.ts src/i18n/locales/en.ts`
Expected: 출력 없음

- [ ] **Step 5: 커밋**

```bash
git add src/screens/TravelDnaSurveyScreen.tsx src/navigation/types.ts src/i18n/locales/ko.ts src/i18n/locales/en.ts
git commit -m "feat(dna): 설문 화면 — 전체 36문항·온보딩 축약판 7문항 공용

한 화면 한 문항, 고르면 즉시 다음으로(확인 버튼 없음) — 36문항에서 탭이
두 배가 되면 완주율이 떨어진다. 안드로이드 뒤로가기는 이전 문항으로 연결한다."
```

---

### Task 7: 결과 화면

**Files:**
- Create: `src/screens/TravelDnaResultScreen.tsx`
- Modify: `src/navigation/AppNavigator.tsx` (설문·결과 두 화면의 라우트를 여기서 함께 등록한다)

**Interfaces:**
- Consumes: Task 5의 `useTravelDna`, Task 1의 `DNA_AXES`·`DNA_LABELS`
- Produces: 라우트 `TravelDnaResult`

- [ ] **Step 1: 결과 화면 작성**

`src/screens/TravelDnaResultScreen.tsx`:

```tsx
/**
 * 여행 DNA 결과 — 유형 라벨 + 7축 막대.
 *
 * 축 점수는 본인만 본다(서버 public_profiles에는 type_key만 실린다).
 * 온보딩에서 들어온 경우 '시작하기'가 메인으로 보내고, 그 외에는 뒤로 돌아간다.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { DNA_AXES, DNA_LABELS, DNA_QUESTIONS, type DnaAxisId } from '../constants/travelDna';
import { useTravelDna } from '../store/travelDnaStore';
import type { RootStackScreenProps } from '../navigation/types';

const C = { bg: '#0A0A0F', card: '#2E2E3B', neon: '#BF85FC', dim: '#A1A1B0', line: '#1A1A26' };

const AXIS_LABEL_KEY: Record<DnaAxisId, string> = {
  plan: 'dna.axisPlan', pace: 'dna.axisPace', terrain: 'dna.axisTerrain',
  budget: 'dna.axisBudget', purpose: 'dna.axisPurpose', crowd: 'dna.axisCrowd',
  company: 'dna.axisCompany',
};

export default function TravelDnaResultScreen({ navigation, route }: RootStackScreenProps<'TravelDnaResult'>) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { scores, label, answered, isFull } = useTravelDna();
  const fromOnboarding = route.params?.from === 'onboarding';
  const en = i18n.language.startsWith('en');
  const percent = Math.round((answered / DNA_QUESTIONS.length) * 100);

  return (
    <View style={[st.container, { paddingTop: insets.top + 12 }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Text style={st.title}>{t('dna.resultTitle')}</Text>

        <LinearGradient
          colors={['rgba(191,133,252,0.22)', 'rgba(107,33,168,0.18)']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={st.typeCard}
        >
          <Text style={st.typeText}>{en ? label.en : label.ko}</Text>
          <Text style={st.accuracy}>{t('dna.accuracy', { percent })}</Text>
        </LinearGradient>

        {DNA_AXES.map((axis) => {
          const v = scores[axis];
          const L = DNA_LABELS[axis];
          return (
            <View key={axis} style={st.axisRow}>
              <Text style={st.axisName}>{t(AXIS_LABEL_KEY[axis])}</Text>
              <View style={st.track}>
                <View style={[st.marker, { left: `${v}%` }]} />
              </View>
              <View style={st.poleRow}>
                <Text style={st.pole}>{en ? L.enAdjA : L.adjA}</Text>
                <Text style={st.pole}>{en ? L.enAdjB : L.adjB}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={[st.footer, { paddingBottom: insets.bottom + 16 }]}>
        {!isFull && (
          <TouchableOpacity
            style={st.primary}
            activeOpacity={0.85}
            onPress={() => navigation.replace('TravelDnaSurvey', { mode: 'full' })}
          >
            <Text style={st.primaryText}>{t('dna.continueSurvey')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => (fromOnboarding ? navigation.replace('Main') : navigation.goBack())}
        >
          <Text style={st.secondaryText}>{fromOnboarding ? t('common.done') : t('common.close')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 16 },
  typeCard: { borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 26, borderWidth: 1, borderColor: 'rgba(191,133,252,0.35)' },
  typeText: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  accuracy: { color: C.dim, fontSize: 12, marginTop: 8 },
  axisRow: { marginBottom: 20 },
  axisName: { color: C.dim, fontSize: 12, marginBottom: 8 },
  track: { height: 6, borderRadius: 3, backgroundColor: C.line, justifyContent: 'center' },
  marker: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: C.neon, marginLeft: -7 },
  poleRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  pole: { color: 'rgba(255,255,255,0.45)', fontSize: 11 },
  footer: { gap: 12, alignItems: 'center' },
  primary: { backgroundColor: C.neon, borderRadius: 999, paddingVertical: 15, paddingHorizontal: 40, alignSelf: 'stretch', alignItems: 'center' },
  primaryText: { color: '#0A0A0F', fontSize: 16, fontWeight: '800' },
  secondaryText: { color: C.dim, fontSize: 14, paddingVertical: 8 },
});
```

- [ ] **Step 2: 라우트 등록 — 설문·결과 두 화면을 함께**

`src/navigation/AppNavigator.tsx`에 import를 추가하고, `<Stack.Screen name="Main" ...>` 아래에 넣는다:

```tsx
import TravelDnaSurveyScreen from '../screens/TravelDnaSurveyScreen';
import TravelDnaResultScreen from '../screens/TravelDnaResultScreen';
```

```tsx
        {/* 여행 DNA 설문 — 중간 이탈 시 답이 날아가므로 스와이프 뒤로가기를 막는다
            (이탈은 화면 안 '건너뛰기'로만, 확인창을 거친다) */}
        <Stack.Screen
          name="TravelDnaSurvey"
          component={TravelDnaSurveyScreen}
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen name="TravelDnaResult" component={TravelDnaResultScreen} />
```

- [ ] **Step 3: 타입·린트 확인**

Run: `npx tsc --noEmit && npx eslint src/screens/TravelDnaResultScreen.tsx src/navigation/AppNavigator.tsx`
Expected: 출력 없음

- [ ] **Step 4: 커밋**

```bash
git add src/screens/TravelDnaResultScreen.tsx src/navigation/AppNavigator.tsx
git commit -m "feat(dna): 결과 화면 — 유형 라벨 + 7축 막대

축 점수는 본인만 본다. 축약판만 답한 상태면 '이어서 답하기'로 전체 문항을 잇는다."
```

---

### Task 8: 진입점 3곳

**Files:**
- Modify: `src/screens/ImportCompleteScreen.tsx` (온보딩)
- Modify: `src/screens/FriendSearchScreen.tsx` (배너)
- Modify: `src/screens/ProfileScreen.tsx` (결과 카드)

**Interfaces:**
- Consumes: Task 5의 `useTravelDna`, Task 6·7의 라우트

- [ ] **Step 1: 온보딩 — 완료 화면의 CTA를 설문으로 연결**

`src/screens/ImportCompleteScreen.tsx`의 `startEorth` 함수에서, 온보딩 경로(`from !== 'profile'`)일 때 메인 대신 축약판 설문으로 보낸다:

```tsx
  const startEorth = async () => {
    if (from === 'profile') {
      navigation.popToTop();
      return;
    }
    await requestNotificationPermission().catch(() => {});
    // 온보딩 마지막 — 축당 1문항(약 40초)만 받는다. 36문항 전체는 여기 넣기엔 길다.
    // 건너뛰면 결과 없이 메인으로 가고, 메이트찾기 배너가 나중에 회수한다.
    navigation.replace('TravelDnaSurvey', { mode: 'onboarding' });
  };
```

축약판 결과 화면의 '시작하기'가 `navigation.replace('Main')`으로 메인에 진입하므로(Task 7),
튜토리얼 플래그가 필요하면 `replace('Main', { screen: 'MainTab', params: { startTutorial: true } })`로 바꾼다.

- [ ] **Step 2: 메이트찾기 — 상단 배너**

`src/screens/FriendSearchScreen.tsx`에 import와 훅을 추가하고, 추천 메이트 섹션 위에 배너를 넣는다:

```tsx
import { useTravelDna } from '../store/travelDnaStore';
```

```tsx
  const { isComplete: dnaComplete, isFull: dnaFull, label: dnaLabel } = useTravelDna();
```

```tsx
      {/* 여행 DNA 배너 — 매칭 동기가 가장 큰 자리. 완료 전까지만 노출한다 */}
      {!dnaFull && (
        <TouchableOpacity
          style={dnaBanner.wrap}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('TravelDnaSurvey', { mode: 'full' })}
        >
          <View style={{ flex: 1 }}>
            <Text style={dnaBanner.title}>
              {dnaComplete ? t('dna.continueSurvey') : t('dna.bannerTitle')}
            </Text>
            <Text style={dnaBanner.desc}>{t('dna.bannerDesc')}</Text>
          </View>
          <Text style={dnaBanner.cta}>
            {dnaComplete ? t('dna.continueSurvey') : t('dna.startSurvey')}
          </Text>
        </TouchableOpacity>
      )}
```

같은 파일 StyleSheet에 추가한다:

```tsx
const dnaBanner = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#2E2E3B', borderRadius: 16, padding: 16,
    marginHorizontal: 16, marginBottom: 14,
    borderWidth: 1, borderColor: 'rgba(191,133,252,0.35)',
  },
  title: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  desc: { color: '#A1A1B0', fontSize: 12, marginTop: 4 },
  cta: { color: '#BF85FC', fontSize: 13, fontWeight: '700' },
});
```

- [ ] **Step 3: 프로필 — 결과 카드**

`src/screens/ProfileScreen.tsx`에 import와 훅을 추가하고, 배지 섹션 근처에 카드를 넣는다:

```tsx
import { useTravelDna } from '../store/travelDnaStore';
```

```tsx
  const { label: dnaLabel, isComplete: dnaComplete } = useTravelDna();
```

```tsx
      {/* 여행 DNA — 완료 전이면 검사 유도, 완료면 유형 표시(탭하면 결과·재검사) */}
      <TouchableOpacity
        style={dnaCard.wrap}
        activeOpacity={0.85}
        onPress={() =>
          dnaComplete
            ? navigation.navigate('TravelDnaResult')
            : navigation.navigate('TravelDnaSurvey', { mode: 'full' })
        }
      >
        <Text style={dnaCard.label}>{t('dna.resultTitle')}</Text>
        <Text style={dnaCard.value}>
          {dnaComplete ? (i18n.language.startsWith('en') ? dnaLabel.en : dnaLabel.ko) : t('dna.startSurvey')}
        </Text>
      </TouchableOpacity>
```

같은 파일 StyleSheet에 추가한다:

```tsx
const dnaCard = StyleSheet.create({
  wrap: {
    backgroundColor: '#2E2E3B', borderRadius: 16, padding: 18,
    marginHorizontal: 16, marginTop: 14,
    borderWidth: 1, borderColor: '#1A1A26',
  },
  label: { color: '#A1A1B0', fontSize: 12 },
  value: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', marginTop: 6 },
});
```

- [ ] **Step 4: 타입·린트 확인**

Run: `npx tsc --noEmit && npx eslint src/screens/ImportCompleteScreen.tsx src/screens/FriendSearchScreen.tsx src/screens/ProfileScreen.tsx`
Expected: 출력 없음

- [ ] **Step 5: 커밋**

```bash
git add src/screens/ImportCompleteScreen.tsx src/screens/FriendSearchScreen.tsx src/screens/ProfileScreen.tsx
git commit -m "feat(dna): 진입점 3곳 — 온보딩 축약판·메이트찾기 배너·프로필 카드

온보딩은 축당 1문항(약 40초)만 받는다. 건너뛰어도 배너가 나중에 회수한다."
```

---

### Task 9: 매칭 결과에 설문 반영

**Files:**
- Modify: `src/services/social.ts`
- Modify: `src/utils/matchScore.ts`
- Modify: `src/screens/FriendSearchScreen.tsx`

**Interfaces:**
- Consumes: Task 4의 `survey_score`
- Produces: `MateSuggestionRow.surveyScore: number`

- [ ] **Step 1: 서비스 매핑 추가**

`src/services/social.ts`의 `MateSuggestionRow` 인터페이스에 추가한다:

```ts
  surveyScore: number;   // 설문 성향 유사도(0~35). 한쪽이라도 미완료면 0
```

`fetchMateSuggestions`의 매핑에 추가한다:

```ts
      surveyScore: r.survey_score ?? 0,
```

- [ ] **Step 2: 근거 문구에서 제거된 축 정리**

`src/utils/matchScore.ts`의 `ReasonInput`에서 `seasonScore`·`interestScore`·`tasteScore`를 지우고 `surveyScore`를 넣는다. `pickReason` 본문에서 해당 분기 3개를 지우고 설문 분기를 넣는다:

```ts
export interface ReasonInput {
  recencyScore: number;
  surveyScore: number;
  mutualCount: number;
  sharedCities: string[];
  sharedCount: number;
}
```

```ts
  if (input.recencyScore > 0) {
    return { key: 'friends.reasonRecent', params: {} };
  }
  // 설문 성향 — 기록 근거가 없을 때의 주력 문구다(신규 사용자는 여기만 남는다)
  if (input.surveyScore >= 20) {
    return { key: 'friends.reasonDna', params: {} };
  }
  if (input.mutualCount > 0) {
    return { key: 'friends.mutualReason', params: { count: input.mutualCount } };
  }
  return null;
```

`src/i18n/locales/ko.ts`의 `friends` 안에 추가한다:

```ts
    reasonDna: '여행 성향이 잘 맞아요',
```

`src/i18n/locales/en.ts`의 `friends` 안에 추가한다:

```ts
    reasonDna: 'Your travel styles line up',
```

- [ ] **Step 3: 호출부 정리**

`src/screens/FriendSearchScreen.tsx`와 `src/screens/SocialScreen.tsx`에서 `pickReason(...)`에 넘기는 객체를 새 인터페이스에 맞춘다. `seasonScore`·`interestScore`·`tasteScore`·`sharedKeywords`를 지우고 `surveyScore: r.surveyScore`를 넣는다.

- [ ] **Step 4: 타입·린트·검증 확인**

Run: `npx tsc --noEmit && npm test 2>&1 | grep -E "전체 통과|실패" && npx eslint src/services/social.ts src/utils/matchScore.ts src/screens/FriendSearchScreen.tsx src/screens/SocialScreen.tsx`
Expected: tsc 출력 없음 · `✅ 전체 통과` · eslint 출력 없음

- [ ] **Step 5: 커밋**

```bash
git add src/services/social.ts src/utils/matchScore.ts src/screens/FriendSearchScreen.tsx src/screens/SocialScreen.tsx src/i18n/locales/ko.ts src/i18n/locales/en.ts
git commit -m "feat(dna): 추천 근거에 설문 성향 반영, 제거된 3축 참조 정리

기록 근거가 없는 신규 사용자에게는 설문이 유일한 근거 문구가 된다."
```

---

## 실기기 확인 (배포 전)

코드로 검증할 수 없는 것들이다.

- [ ] 온보딩 7문항 → 결과 → 메인 진입이 끊기지 않는지
- [ ] 축약판만 답한 상태에서 결과 화면의 축 막대가 **중앙 근처**에 모여 있는지 (수축이 작동하는 증거)
- [ ] 메이트찾기 배너가 완료 후 사라지는지, 부분 완료면 '이어서 답하기'로 바뀌는지
- [ ] 설문 도중 안드로이드 뒤로가기가 이전 문항으로 가는지, 첫 문항에서는 확인창이 뜨는지
- [ ] `schema.sql` 재실행 후 추천 매칭률이 이전과 크게 달라지지 않는지(설문 미완료자끼리는 65점 정규화로 비슷해야 한다)
- [ ] 설문 완료 직후 메이트찾기를 다시 열면 추천이 갱신되는지 (캐시 무효화 트리거 확인)

## 서버 반영

```
1. supabase/schema.sql 재실행 (SQL Editor)
2. 앱 배포
```

서버를 먼저 올려도 안전하다 — 아무도 설문을 안 한 상태라 설문축이 0이고 정규화가 기록 축 65점 만점으로 돌아간다.
