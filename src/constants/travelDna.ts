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
