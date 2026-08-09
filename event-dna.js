// ⚠️ 생성물입니다. 직접 고치지 마세요 — 다음 npm test에서 되돌려집니다.
// 원본: scripts/event-dna-entry.ts (→ src/constants/travelDna.ts, src/utils/travelDnaScore.ts, src/constants/countries.ts)
// 재생성: node scripts/build-event-dna.mjs

// src/constants/travelDna.ts
var DNA_AXES = ["plan", "pace", "terrain", "budget", "purpose", "crowd", "company"];
var DNA_QUESTIONS = [
  // ① 계획 ↔ 즉흥
  {
    id: 1,
    axis: "plan",
    weight: 2,
    ko: { s: "여행 3일 전, 내 상태는", a: "시간표까지 짜여 있다", b: "항공권만 끊어놨다" },
    en: { s: "Three days before the trip", a: "My schedule is planned by the hour", b: "I only booked the flight" }
  },
  {
    id: 2,
    axis: "plan",
    weight: 1,
    ko: { s: "아침에 일어났더니 비가 온다", a: "계획대로 진행한다", b: "나갈 때 우산 챙겨야겠다는 생각만 한다" },
    en: { s: "You wake up and it is raining", a: "Stick to the plan", b: "Just remember to grab an umbrella" }
  },
  {
    id: 3,
    axis: "plan",
    weight: 1,
    ko: { s: "식당을 고를 때", a: "미리 예약해둔 맛집", b: "눈과 발이 이끄는 곳" },
    en: { s: "Choosing a restaurant", a: "The one I booked ahead", b: "Wherever my feet take me" }
  },
  {
    id: 4,
    axis: "plan",
    weight: 1,
    ko: { s: "짐을 쌀 때", a: "리스트를 만든다", b: "전날 밤 대충 담는다" },
    en: { s: "Packing", a: "I make a list", b: "I throw things in the night before" }
  },
  {
    id: 5,
    axis: "plan",
    weight: 2,
    ko: { s: "일정이 틀어지면", a: "기분이 안좋아진다", b: "아무 생각이 없다" },
    en: { s: "When plans fall apart", a: "It sours my mood", b: "I barely notice" }
  },
  // ② 휴식 ↔ 활동
  {
    id: 6,
    axis: "pace",
    weight: 2,
    ko: { s: "하루에 도는 장소", a: "한두 곳 여유롭게", b: "하루종일 알차게" },
    en: { s: "Places visited per day", a: "One or two, unhurried", b: "Pack the day full" }
  },
  {
    id: 7,
    axis: "pace",
    weight: 1,
    ko: { s: "여행지의 아침", a: "늦잠과 느긋한 조식", b: "일찍 나가야 하루가 길다" },
    en: { s: "Mornings on a trip", a: "Sleep in, slow breakfast", b: "Out early makes the day longer" }
  },
  {
    id: 8,
    axis: "pace",
    weight: 1,
    ko: { s: "숙소에 수영장이 있다", a: "반나절은 여기서, 휴식을", b: "가고 싶지만 밖을 나가야 더 재밌다" },
    en: { s: "The hotel has a pool", a: "Half a day right here, resting", b: "Tempting, but outside is more fun" }
  },
  {
    id: 9,
    axis: "pace",
    weight: 1,
    ko: { s: "내가 선호하는 것은", a: "나에게 휴식을, 호캉스", b: "여기까지 왔는데 해야지, 액티비티" },
    en: { s: "What I go for", a: "A restful hotel stay", b: "Came all this way — activities" }
  },
  {
    id: 10,
    axis: "pace",
    weight: 2,
    ko: { s: "돌아왔을 때 성공한 여행이란", a: "푹 쉬고 온 느낌", b: "다리가 남아돌지 않음" },
    en: { s: "A trip went well when", a: "I came back rested", b: "My legs are wrecked" }
  },
  // ③ 도시 ↔ 자연
  {
    id: 11,
    axis: "terrain",
    weight: 2,
    ko: { s: "다음 여행지 후보", a: "빌딩 숲, 뉴욕", b: "평화의 알프스" },
    en: { s: "Next destination", a: "Skyscrapers — New York", b: "Quiet Alps" }
  },
  {
    id: 12,
    axis: "terrain",
    weight: 1,
    ko: { s: "여행 후 내 갤러리엔", a: "도시의 건물들", b: "풍경과 하늘" },
    en: { s: "My camera roll after a trip", a: "City buildings", b: "Landscapes and sky" }
  },
  {
    id: 13,
    axis: "terrain",
    weight: 1,
    ko: { s: "하루가 통째로 비면", a: "쇼핑과 카페", b: "트레킹이나 드라이브" },
    en: { s: "A whole free day", a: "Shopping and cafes", b: "Hiking or a drive" }
  },
  {
    id: 14,
    axis: "terrain",
    weight: 1,
    ko: { s: "여행지에서의 만남", a: "살갑게 다가오는 현지인", b: "청풍명월" },
    en: { s: "Who you meet out there", a: "Friendly locals", b: "Just the breeze and the moon" }
  },
  {
    id: 15,
    axis: "terrain",
    weight: 2,
    ko: { s: "가장 많이 듣는 여행 소리", a: "북적북적한 사람들의 소리", b: "마음이 편안해지는 자연의 소리" },
    en: { s: "The sound of my trips", a: "The buzz of a crowd", b: "The calm of nature" }
  },
  // ④ 알뜰 ↔ 아낌없이
  {
    id: 16,
    axis: "budget",
    weight: 2,
    ko: { s: "항공권", a: "경유 2번이어도 20만 원 싸면 간다", b: "직항 아니면 여행 시작부터 지친다" },
    en: { s: "Flights", a: "Two layovers is fine if it saves money", b: "Non-stop or the trip starts tired" }
  },
  {
    id: 17,
    axis: "budget",
    weight: 2,
    ko: { s: "숙소 예산", a: "잠만 자면 된다", b: "숙소도 여행의 일부" },
    en: { s: "Accommodation budget", a: "Just a place to sleep", b: "The stay is part of the trip" }
  },
  {
    id: 18,
    axis: "budget",
    weight: 1,
    ko: { s: "한 끼에 쓰는 돈", a: "가성비 맛집", b: "여행이다, 맘껏 먹어보자" },
    en: { s: "Spending per meal", a: "Best value I can find", b: "It is a trip — go all in" }
  },
  {
    id: 19,
    axis: "budget",
    weight: 1,
    ko: { s: "기념품", a: "집 가면 예쁜 쓰레기", b: "보는 순간 열리는 지갑" },
    en: { s: "Souvenirs", a: "Clutter once I get home", b: "My wallet opens itself" }
  },
  {
    id: 20,
    axis: "budget",
    weight: 1,
    ko: { s: "예산을 짤 때", a: "하루 상한을 정해둔다", b: "쓰고 나서 정산은 집에 가서" },
    en: { s: "Budgeting", a: "I set a daily cap", b: "I settle the math back home" }
  },
  // ⑤ 미식 ↔ 관광
  {
    id: 21,
    axis: "purpose",
    weight: 2,
    ko: { s: "여행지를 고르는 이유", a: "여행지의 맛집", b: "여행은 보는 맛, 관광지" },
    en: { s: "Why I pick a destination", a: "For the food", b: "For the sights" }
  },
  {
    id: 22,
    axis: "purpose",
    weight: 1,
    ko: { s: "줄이 한 시간인 맛집", a: "기다리는 이유가 있다", b: "다른 데로 간다" },
    en: { s: "An hour-long queue for food", a: "There is a reason people wait", b: "I go somewhere else" }
  },
  {
    id: 23,
    axis: "purpose",
    weight: 1,
    ko: { s: "일정표에서 먼저 정해지는 것", a: "인스타·유튜브에서 저장해놓은 맛집", b: "해당 도시의 관광지" },
    en: { s: "What gets locked in first", a: "Restaurants I saved online", b: "The city landmarks" }
  },
  {
    id: 24,
    axis: "purpose",
    weight: 2,
    ko: { s: "내 여행 사진첩엔", a: "음식 사진 한 가득", b: "풍경과 건물 사진" },
    en: { s: "My trip album says", a: "Full of food photos", b: "Scenery and architecture" }
  },
  {
    id: 25,
    axis: "purpose",
    weight: 1,
    ko: { s: "여행지에서 가장 아까운 건", a: "맛없는 한 끼", b: "못 본 명소" },
    en: { s: "The biggest waste on a trip", a: "A bad meal", b: "A sight I missed" }
  },
  // ⑥ 북적임 ↔ 한적함
  {
    id: 26,
    axis: "crowd",
    weight: 2,
    ko: { s: "유명 관광지", a: "유명한 곳은 이유가 있다", b: "사람 많으면 피한다" },
    en: { s: "Famous attractions", a: "Famous for a reason", b: "If it is packed, I skip it" }
  },
  {
    id: 27,
    axis: "crowd",
    weight: 2,
    ko: { s: "여행 시기", a: "축제·성수기가 좋다", b: "비수기가 좋다" },
    en: { s: "When I travel", a: "Festivals and high season", b: "Off season" }
  },
  {
    id: 28,
    axis: "crowd",
    weight: 1,
    ko: { s: "낯선 골목의 갈림길", a: "사람들이 모인 쪽으로", b: "아무도 없는 쪽으로" },
    en: { s: "A fork in an unfamiliar alley", a: "Toward the crowd", b: "Toward the empty side" }
  },
  {
    id: 29,
    axis: "crowd",
    weight: 1,
    ko: { s: "SNS에서 본 핫플", a: "모두 저장하고 가려고 함", b: "저장만" },
    en: { s: "Hot spots I see online", a: "Save them all and go", b: "Save them and never go" }
  },
  {
    id: 30,
    axis: "crowd",
    weight: 1,
    ko: { s: "여행지에서 가장 신나는 순간", a: "사람으로 가득한 광장 한복판", b: "아무도 없는 전망대" },
    en: { s: "The best moment of a trip", a: "The middle of a packed square", b: "An empty lookout" }
  },
  // ⑦ 혼자 ↔ 함께
  {
    id: 31,
    axis: "company",
    weight: 2,
    ko: { s: "내 여행 동행자는", a: "길 잘못 들어도 눈치 안 보이는 혼자", b: "안 맞을 순 있어도 둘 이상" },
    en: { s: "Who I travel with", a: "Alone — no one to apologize to", b: "Two or more, friction and all" }
  },
  {
    id: 32,
    axis: "company",
    weight: 2,
    ko: { s: "여행지의 저녁 시간", a: "숙소에서 혼자 하루 정리", b: "누구든 붙잡고 한잔" },
    en: { s: "Evenings on a trip", a: "Alone at the room, winding down", b: "A drink with whoever is around" }
  },
  {
    id: 33,
    axis: "company",
    weight: 1,
    ko: { s: "일정을 정할 때", a: "내가 가고 싶은 대로", b: "같이 의논해서" },
    en: { s: "Deciding the itinerary", a: "Wherever I want to go", b: "We talk it through" }
  },
  {
    id: 34,
    axis: "company",
    weight: 1,
    ko: { s: "사진을 남길 때", a: "셀카 아니면 풍경", b: "서로 찍어주기" },
    en: { s: "Taking photos", a: "Selfies or scenery", b: "We shoot each other" }
  },
  {
    id: 35,
    axis: "company",
    weight: 1,
    ko: { s: "여행이 끝나고", a: "혼자 곱씹는 시간이 좋다", b: "같이 얘기해야 완성된다" },
    en: { s: "After the trip", a: "I like replaying it alone", b: "It is not done until we talk" }
  },
  {
    id: 36,
    axis: "company",
    weight: 1,
    ko: { s: "여행지에서 사람 만나기", a: "카페 직원과만 대화", b: "게스트하우스·투어에서 어울린다" },
    en: { s: "Meeting people out there", a: "Only the cafe staff", b: "Hostels and group tours" }
  }
];
var DNA_LABELS = {
  plan: {
    nounA: "계획가",
    nounB: "방랑자",
    adjA: "계획적인",
    adjB: "즉흥적인",
    enNounA: "Planner",
    enNounB: "Wanderer",
    enAdjA: "Methodical",
    enAdjB: "Spontaneous"
  },
  pace: {
    nounA: "휴양객",
    nounB: "탐험가",
    adjA: "느긋한",
    adjB: "부지런한",
    enNounA: "Unwinder",
    enNounB: "Explorer",
    enAdjA: "Easygoing",
    enAdjB: "Tireless"
  },
  terrain: {
    nounA: "도시인",
    nounB: "자연인",
    adjA: "도시를 걷는",
    adjB: "자연을 찾는",
    enNounA: "City Dweller",
    enNounB: "Nature Seeker",
    enAdjA: "Street-walking",
    enAdjB: "Trail-seeking"
  },
  budget: {
    nounA: "실속파",
    nounB: "플렉서",
    adjA: "알뜰한",
    adjB: "아낌없는",
    enNounA: "Value Hunter",
    enNounB: "Splurger",
    enAdjA: "Thrifty",
    enAdjB: "Generous"
  },
  purpose: {
    nounA: "미식가",
    nounB: "관람객",
    adjA: "맛을 좇는",
    adjB: "눈으로 담는",
    enNounA: "Food Lover",
    enNounB: "Sightseer",
    enAdjA: "Flavor-chasing",
    enAdjB: "Sight-collecting"
  },
  crowd: {
    nounA: "축제파",
    nounB: "은둔파",
    adjA: "북적임을 즐기는",
    adjB: "조용함을 아끼는",
    enNounA: "Festival Goer",
    enNounB: "Quiet Seeker",
    enAdjA: "Crowd-loving",
    enAdjB: "Solitude-loving"
  },
  company: {
    nounA: "혼행자",
    nounB: "동행자",
    adjA: "혼자가 편한",
    adjB: "함께가 좋은",
    enNounA: "Solo Traveler",
    enNounB: "Companion",
    enAdjA: "Solo-minded",
    enAdjB: "Company-loving"
  }
};
var DNA_LABEL_MIN_STRENGTH = 15;

// src/utils/travelDnaScore.ts
var BY_ID = new Map(DNA_QUESTIONS.map((q) => [q.id, q]));
function scoreAxes(answers) {
  const total = {};
  const ans = {};
  const bw = {};
  for (const axis of DNA_AXES) {
    total[axis] = 0;
    ans[axis] = 0;
    bw[axis] = 0;
  }
  for (const q of DNA_QUESTIONS) total[q.axis] += q.weight;
  for (const [key, choice] of Object.entries(answers)) {
    const q = BY_ID.get(Number(key));
    if (!q) continue;
    ans[q.axis] += q.weight;
    if (choice === "B") bw[q.axis] += q.weight;
  }
  const out = {};
  for (const axis of DNA_AXES) {
    if (ans[axis] === 0 || total[axis] === 0) {
      out[axis] = 50;
      continue;
    }
    const raw = 100 * bw[axis] / ans[axis];
    const conf = ans[axis] / total[axis];
    out[axis] = Math.round(50 + (raw - 50) * conf);
  }
  return out;
}
function isValidDna(answers) {
  const seen = /* @__PURE__ */ new Set();
  for (const [key, choice] of Object.entries(answers)) {
    const q = BY_ID.get(Number(key));
    if (q && (choice === "A" || choice === "B")) seen.add(q.axis);
  }
  return DNA_AXES.every((a) => seen.has(a));
}
function makeTypeLabel(scores) {
  const ranked = DNA_AXES.map((axis, i) => ({ axis, i, strength: Math.abs(scores[axis] - 50), toB: scores[axis] > 50 })).sort((x, y) => y.strength - x.strength || x.i - y.i);
  const top = ranked[0];
  if (!top || top.strength < DNA_LABEL_MIN_STRENGTH) {
    return { key: "neutral", ko: "아직 색이 옅은 여행자", en: "A traveler still taking shape" };
  }
  const second = ranked[1];
  const nl = DNA_LABELS[top.axis];
  const al = DNA_LABELS[second.axis];
  const noun = top.toB ? nl.nounB : nl.nounA;
  const enNoun = top.toB ? nl.enNounB : nl.enNounA;
  const adj = second.toB ? al.adjB : al.adjA;
  const enAdj = second.toB ? al.enAdjB : al.enAdjA;
  return {
    key: `${top.axis}${top.toB ? "B" : "A"}-${second.axis}${second.toB ? "B" : "A"}`,
    ko: `${adj} ${noun}`,
    en: `${enAdj} ${enNoun}`
  };
}

// src/constants/countries.ts
var COUNTRIES = [
  { term: "kr 대한민국 korea", flag: "🇰🇷", name: "대한민국", continent: "아시아" },
  { term: "jp 일본 japan", flag: "🇯🇵", name: "일본", continent: "아시아" },
  { term: "cn 중국 china", flag: "🇨🇳", name: "중국", continent: "아시아" },
  { term: "tw 대만 taiwan", flag: "🇹🇼", name: "대만", continent: "아시아" },
  { term: "hk 홍콩 hong kong", flag: "🇭🇰", name: "홍콩", continent: "아시아" },
  { term: "mo 마카오 macau", flag: "🇲🇴", name: "마카오", continent: "아시아" },
  { term: "th 태국 thailand", flag: "🇹🇭", name: "태국", continent: "아시아" },
  { term: "vn 베트남 vietnam", flag: "🇻🇳", name: "베트남", continent: "아시아" },
  { term: "ph 필리핀 philippines", flag: "🇵🇭", name: "필리핀", continent: "아시아" },
  { term: "id 인도네시아 indonesia", flag: "🇮🇩", name: "인도네시아", continent: "아시아" },
  { term: "my 말레이시아 malaysia", flag: "🇲🇾", name: "말레이시아", continent: "아시아" },
  { term: "sg 싱가포르 singapore", flag: "🇸🇬", name: "싱가포르", continent: "아시아" },
  { term: "kh 캄보디아 cambodia", flag: "🇰🇭", name: "캄보디아", continent: "아시아" },
  { term: "la 라오스 laos", flag: "🇱🇦", name: "라오스", continent: "아시아" },
  { term: "mm 미얀마 myanmar burma", flag: "🇲🇲", name: "미얀마", continent: "아시아" },
  { term: "bn 브루나이 brunei", flag: "🇧🇳", name: "브루나이", continent: "아시아" },
  { term: "tl 동티모르 east timor timor-leste", flag: "🇹🇱", name: "동티모르", continent: "아시아" },
  { term: "in 인도 india", flag: "🇮🇳", name: "인도", continent: "아시아" },
  { term: "lk 스리랑카 sri lanka", flag: "🇱🇰", name: "스리랑카", continent: "아시아" },
  { term: "np 네팔 nepal", flag: "🇳🇵", name: "네팔", continent: "아시아" },
  { term: "bt 부탄 bhutan", flag: "🇧🇹", name: "부탄", continent: "아시아" },
  { term: "pk 파키스탄 pakistan", flag: "🇵🇰", name: "파키스탄", continent: "아시아" },
  { term: "bd 방글라데시 bangladesh", flag: "🇧🇩", name: "방글라데시", continent: "아시아" },
  { term: "mv 몰디브 maldives", flag: "🇲🇻", name: "몰디브", continent: "아시아" },
  { term: "mn 몽골 mongolia", flag: "🇲🇳", name: "몽골", continent: "아시아" },
  { term: "kz 카자흐스탄 kazakhstan", flag: "🇰🇿", name: "카자흐스탄", continent: "아시아" },
  { term: "uz 우즈베키스탄 uzbekistan", flag: "🇺🇿", name: "우즈베키스탄", continent: "아시아" },
  { term: "tm 투르크메니스탄 turkmenistan", flag: "🇹🇲", name: "투르크메니스탄", continent: "아시아" },
  { term: "tj 타지키스탄 tajikistan", flag: "🇹🇯", name: "타지키스탄", continent: "아시아" },
  { term: "kg 키르기스스탄 kyrgyzstan", flag: "🇰🇬", name: "키르기스스탄", continent: "아시아" },
  { term: "af 아프가니스탄 afghanistan", flag: "🇦🇫", name: "아프가니스탄", continent: "아시아" },
  { term: "ir 이란 iran", flag: "🇮🇷", name: "이란", continent: "아시아" },
  { term: "iq 이라크 iraq", flag: "🇮🇶", name: "이라크", continent: "아시아" },
  { term: "sa 사우디아라비아 saudi arabia", flag: "🇸🇦", name: "사우디아라비아", continent: "아시아" },
  { term: "ae 아랍에미리트 uae united arab emirates", flag: "🇦🇪", name: "아랍에미리트", continent: "아시아" },
  { term: "kw 쿠웨이트 kuwait", flag: "🇰🇼", name: "쿠웨이트", continent: "아시아" },
  { term: "bh 바레인 bahrain", flag: "🇧🇭", name: "바레인", continent: "아시아" },
  { term: "qa 카타르 qatar", flag: "🇶🇦", name: "카타르", continent: "아시아" },
  { term: "om 오만 oman", flag: "🇴🇲", name: "오만", continent: "아시아" },
  { term: "ye 예멘 yemen", flag: "🇾🇪", name: "예멘", continent: "아시아" },
  { term: "jo 요르단 jordan", flag: "🇯🇴", name: "요르단", continent: "아시아" },
  { term: "il 이스라엘 israel", flag: "🇮🇱", name: "이스라엘", continent: "아시아" },
  { term: "ps 팔레스타인 palestine", flag: "🇵🇸", name: "팔레스타인", continent: "아시아" },
  { term: "lb 레바논 lebanon", flag: "🇱🇧", name: "레바논", continent: "아시아" },
  { term: "sy 시리아 syria", flag: "🇸🇾", name: "시리아", continent: "아시아" },
  { term: "tr 튀르키예 turkey turkiye", flag: "🇹🇷", name: "튀르키예", continent: "아시아" },
  { term: "cy 키프로스 cyprus", flag: "🇨🇾", name: "키프로스", continent: "아시아" },
  { term: "am 아르메니아 armenia", flag: "🇦🇲", name: "아르메니아", continent: "아시아" },
  { term: "az 아제르바이잔 azerbaijan", flag: "🇦🇿", name: "아제르바이잔", continent: "아시아" },
  { term: "ge 조지아 georgia", flag: "🇬🇪", name: "조지아", continent: "아시아" },
  { term: "gb 영국 uk united kingdom", flag: "🇬🇧", name: "영국", continent: "유럽" },
  { term: "fr 프랑스 france", flag: "🇫🇷", name: "프랑스", continent: "유럽" },
  { term: "de 독일 germany", flag: "🇩🇪", name: "독일", continent: "유럽" },
  { term: "it 이탈리아 italy", flag: "🇮🇹", name: "이탈리아", continent: "유럽" },
  { term: "es 스페인 spain", flag: "🇪🇸", name: "스페인", continent: "유럽" },
  { term: "pt 포르투갈 portugal", flag: "🇵🇹", name: "포르투갈", continent: "유럽" },
  { term: "nl 네덜란드 netherlands", flag: "🇳🇱", name: "네덜란드", continent: "유럽" },
  { term: "be 벨기에 belgium", flag: "🇧🇪", name: "벨기에", continent: "유럽" },
  { term: "ch 스위스 switzerland", flag: "🇨🇭", name: "스위스", continent: "유럽" },
  { term: "at 오스트리아 austria", flag: "🇦🇹", name: "오스트리아", continent: "유럽" },
  { term: "se 스웨덴 sweden", flag: "🇸🇪", name: "스웨덴", continent: "유럽" },
  { term: "no 노르웨이 norway", flag: "🇳🇴", name: "노르웨이", continent: "유럽" },
  { term: "dk 덴마크 denmark", flag: "🇩🇰", name: "덴마크", continent: "유럽" },
  { term: "fi 핀란드 finland", flag: "🇫🇮", name: "핀란드", continent: "유럽" },
  { term: "is 아이슬란드 iceland", flag: "🇮🇸", name: "아이슬란드", continent: "유럽" },
  { term: "ie 아일랜드 ireland", flag: "🇮🇪", name: "아일랜드", continent: "유럽" },
  { term: "pl 폴란드 poland", flag: "🇵🇱", name: "폴란드", continent: "유럽" },
  { term: "cz 체코 czech republic czechia", flag: "🇨🇿", name: "체코", continent: "유럽" },
  { term: "sk 슬로바키아 slovakia", flag: "🇸🇰", name: "슬로바키아", continent: "유럽" },
  { term: "hu 헝가리 hungary", flag: "🇭🇺", name: "헝가리", continent: "유럽" },
  { term: "ro 루마니아 romania", flag: "🇷🇴", name: "루마니아", continent: "유럽" },
  { term: "bg 불가리아 bulgaria", flag: "🇧🇬", name: "불가리아", continent: "유럽" },
  { term: "gr 그리스 greece", flag: "🇬🇷", name: "그리스", continent: "유럽" },
  { term: "hr 크로아티아 croatia", flag: "🇭🇷", name: "크로아티아", continent: "유럽" },
  { term: "si 슬로베니아 slovenia", flag: "🇸🇮", name: "슬로베니아", continent: "유럽" },
  { term: "rs 세르비아 serbia", flag: "🇷🇸", name: "세르비아", continent: "유럽" },
  { term: "ba 보스니아 헤르체고비나 bosnia herzegovina", flag: "🇧🇦", name: "보스니아 헤르체고비나", continent: "유럽" },
  { term: "me 몬테네그로 montenegro", flag: "🇲🇪", name: "몬테네그로", continent: "유럽" },
  { term: "mk 북마케도니아 north macedonia", flag: "🇲🇰", name: "북마케도니아", continent: "유럽" },
  { term: "al 알바니아 albania", flag: "🇦🇱", name: "알바니아", continent: "유럽" },
  { term: "xk 코소보 kosovo", flag: "🇽🇰", name: "코소보", continent: "유럽" },
  { term: "ru 러시아 russia", flag: "🇷🇺", name: "러시아", continent: "유럽" },
  { term: "ua 우크라이나 ukraine", flag: "🇺🇦", name: "우크라이나", continent: "유럽" },
  { term: "by 벨라루스 belarus", flag: "🇧🇾", name: "벨라루스", continent: "유럽" },
  { term: "md 몰도바 moldova", flag: "🇲🇩", name: "몰도바", continent: "유럽" },
  { term: "ee 에스토니아 estonia", flag: "🇪🇪", name: "에스토니아", continent: "유럽" },
  { term: "lv 라트비아 latvia", flag: "🇱🇻", name: "라트비아", continent: "유럽" },
  { term: "lt 리투아니아 lithuania", flag: "🇱🇹", name: "리투아니아", continent: "유럽" },
  { term: "lu 룩셈부르크 luxembourg", flag: "🇱🇺", name: "룩셈부르크", continent: "유럽" },
  { term: "mc 모나코 monaco", flag: "🇲🇨", name: "모나코", continent: "유럽" },
  { term: "ad 안도라 andorra", flag: "🇦🇩", name: "안도라", continent: "유럽" },
  { term: "li 리히텐슈타인 liechtenstein", flag: "🇱🇮", name: "리히텐슈타인", continent: "유럽" },
  { term: "sm 산마리노 san marino", flag: "🇸🇲", name: "산마리노", continent: "유럽" },
  { term: "va 바티칸 vatican", flag: "🇻🇦", name: "바티칸", continent: "유럽" },
  { term: "mt 몰타 malta", flag: "🇲🇹", name: "몰타", continent: "유럽" },
  { term: "us 미국 usa united states", flag: "🇺🇸", name: "미국", continent: "북아메리카" },
  { term: "ca 캐나다 canada", flag: "🇨🇦", name: "캐나다", continent: "북아메리카" },
  { term: "mx 멕시코 mexico", flag: "🇲🇽", name: "멕시코", continent: "북아메리카" },
  { term: "gt 과테말라 guatemala", flag: "🇬🇹", name: "과테말라", continent: "북아메리카" },
  { term: "bz 벨리즈 belize", flag: "🇧🇿", name: "벨리즈", continent: "북아메리카" },
  { term: "hn 온두라스 honduras", flag: "🇭🇳", name: "온두라스", continent: "북아메리카" },
  { term: "sv 엘살바도르 el salvador", flag: "🇸🇻", name: "엘살바도르", continent: "북아메리카" },
  { term: "ni 니카라과 nicaragua", flag: "🇳🇮", name: "니카라과", continent: "북아메리카" },
  { term: "cr 코스타리카 costa rica", flag: "🇨🇷", name: "코스타리카", continent: "북아메리카" },
  { term: "pa 파나마 panama", flag: "🇵🇦", name: "파나마", continent: "북아메리카" },
  { term: "cu 쿠바 cuba", flag: "🇨🇺", name: "쿠바", continent: "북아메리카" },
  { term: "jm 자메이카 jamaica", flag: "🇯🇲", name: "자메이카", continent: "북아메리카" },
  { term: "ht 아이티 haiti", flag: "🇭🇹", name: "아이티", continent: "북아메리카" },
  { term: "do 도미니카공화국 dominican republic", flag: "🇩🇴", name: "도미니카공화국", continent: "북아메리카" },
  { term: "tt 트리니다드 토바고 trinidad tobago", flag: "🇹🇹", name: "트리니다드 토바고", continent: "북아메리카" },
  { term: "bs 바하마 bahamas", flag: "🇧🇸", name: "바하마", continent: "북아메리카" },
  { term: "bb 바베이도스 barbados", flag: "🇧🇧", name: "바베이도스", continent: "북아메리카" },
  { term: "gd 그레나다 grenada", flag: "🇬🇩", name: "그레나다", continent: "북아메리카" },
  { term: "lc 세인트루시아 saint lucia", flag: "🇱🇨", name: "세인트루시아", continent: "북아메리카" },
  { term: "vc 세인트빈센트 그레나딘 saint vincent grenadines", flag: "🇻🇨", name: "세인트빈센트 그레나딘", continent: "북아메리카" },
  { term: "ag 앤티가 바부다 antigua barbuda", flag: "🇦🇬", name: "앤티가 바부다", continent: "북아메리카" },
  { term: "kn 세인트키츠 네비스 saint kitts nevis", flag: "🇰🇳", name: "세인트키츠 네비스", continent: "북아메리카" },
  { term: "dm 도미니카 dominica", flag: "🇩🇲", name: "도미니카", continent: "북아메리카" },
  { term: "br 브라질 brazil", flag: "🇧🇷", name: "브라질", continent: "남아메리카" },
  { term: "ar 아르헨티나 argentina", flag: "🇦🇷", name: "아르헨티나", continent: "남아메리카" },
  { term: "cl 칠레 chile", flag: "🇨🇱", name: "칠레", continent: "남아메리카" },
  { term: "co 콜롬비아 colombia", flag: "🇨🇴", name: "콜롬비아", continent: "남아메리카" },
  { term: "pe 페루 peru", flag: "🇵🇪", name: "페루", continent: "남아메리카" },
  { term: "ec 에콰도르 ecuador", flag: "🇪🇨", name: "에콰도르", continent: "남아메리카" },
  { term: "bo 볼리비아 bolivia", flag: "🇧🇴", name: "볼리비아", continent: "남아메리카" },
  { term: "py 파라과이 paraguay", flag: "🇵🇾", name: "파라과이", continent: "남아메리카" },
  { term: "uy 우루과이 uruguay", flag: "🇺🇾", name: "우루과이", continent: "남아메리카" },
  { term: "ve 베네수엘라 venezuela", flag: "🇻🇪", name: "베네수엘라", continent: "남아메리카" },
  { term: "gy 가이아나 guyana", flag: "🇬🇾", name: "가이아나", continent: "남아메리카" },
  { term: "sr 수리남 suriname", flag: "🇸🇷", name: "수리남", continent: "남아메리카" },
  { term: "eg 이집트 egypt", flag: "🇪🇬", name: "이집트", continent: "아프리카" },
  { term: "ma 모로코 morocco", flag: "🇲🇦", name: "모로코", continent: "아프리카" },
  { term: "tn 튀니지 tunisia", flag: "🇹🇳", name: "튀니지", continent: "아프리카" },
  { term: "dz 알제리 algeria", flag: "🇩🇿", name: "알제리", continent: "아프리카" },
  { term: "ly 리비아 libya", flag: "🇱🇾", name: "리비아", continent: "아프리카" },
  { term: "sd 수단 sudan", flag: "🇸🇩", name: "수단", continent: "아프리카" },
  { term: "ss 남수단 south sudan", flag: "🇸🇸", name: "남수단", continent: "아프리카" },
  { term: "et 에티오피아 ethiopia", flag: "🇪🇹", name: "에티오피아", continent: "아프리카" },
  { term: "er 에리트레아 eritrea", flag: "🇪🇷", name: "에리트레아", continent: "아프리카" },
  { term: "dj 지부티 djibouti", flag: "🇩🇯", name: "지부티", continent: "아프리카" },
  { term: "so 소말리아 somalia", flag: "🇸🇴", name: "소말리아", continent: "아프리카" },
  { term: "ke 케냐 kenya", flag: "🇰🇪", name: "케냐", continent: "아프리카" },
  { term: "tz 탄자니아 tanzania", flag: "🇹🇿", name: "탄자니아", continent: "아프리카" },
  { term: "ug 우간다 uganda", flag: "🇺🇬", name: "우간다", continent: "아프리카" },
  { term: "rw 르완다 rwanda", flag: "🇷🇼", name: "르완다", continent: "아프리카" },
  { term: "bi 부룬디 burundi", flag: "🇧🇮", name: "부룬디", continent: "아프리카" },
  { term: "za 남아프리카공화국 south africa", flag: "🇿🇦", name: "남아프리카공화국", continent: "아프리카" },
  { term: "ng 나이지리아 nigeria", flag: "🇳🇬", name: "나이지리아", continent: "아프리카" },
  { term: "gh 가나 ghana", flag: "🇬🇭", name: "가나", continent: "아프리카" },
  { term: "sn 세네갈 senegal", flag: "🇸🇳", name: "세네갈", continent: "아프리카" },
  { term: "ci 코트디부아르 ivory coast cote divoire", flag: "🇨🇮", name: "코트디부아르", continent: "아프리카" },
  { term: "cm 카메룬 cameroon", flag: "🇨🇲", name: "카메룬", continent: "아프리카" },
  { term: "ao 앙골라 angola", flag: "🇦🇴", name: "앙골라", continent: "아프리카" },
  { term: "mz 모잠비크 mozambique", flag: "🇲🇿", name: "모잠비크", continent: "아프리카" },
  { term: "zw 짐바브웨 zimbabwe", flag: "🇿🇼", name: "짐바브웨", continent: "아프리카" },
  { term: "zm 잠비아 zambia", flag: "🇿🇲", name: "잠비아", continent: "아프리카" },
  { term: "mw 말라위 malawi", flag: "🇲🇼", name: "말라위", continent: "아프리카" },
  { term: "mg 마다가스카르 madagascar", flag: "🇲🇬", name: "마다가스카르", continent: "아프리카" },
  { term: "mu 모리셔스 mauritius", flag: "🇲🇺", name: "모리셔스", continent: "아프리카" },
  { term: "sc 세이셸 seychelles", flag: "🇸🇨", name: "세이셸", continent: "아프리카" },
  { term: "km 코모로 comoros", flag: "🇰🇲", name: "코모로", continent: "아프리카" },
  { term: "cf 중앙아프리카공화국 central african republic", flag: "🇨🇫", name: "중앙아프리카공화국", continent: "아프리카" },
  { term: "cg 콩고 congo", flag: "🇨🇬", name: "콩고", continent: "아프리카" },
  { term: "cd 콩고민주공화국 democratic republic of the congo drc", flag: "🇨🇩", name: "콩고민주공화국", continent: "아프리카" },
  { term: "ga 가봉 gabon", flag: "🇬🇦", name: "가봉", continent: "아프리카" },
  { term: "gq 적도기니 equatorial guinea", flag: "🇬🇶", name: "적도기니", continent: "아프리카" },
  { term: "st 상투메 프린시페 sao tome principe", flag: "🇸🇹", name: "상투메 프린시페", continent: "아프리카" },
  { term: "cv 카보베르데 cape verde", flag: "🇨🇻", name: "카보베르데", continent: "아프리카" },
  { term: "gw 기니비사우 guinea-bissau", flag: "🇬🇼", name: "기니비사우", continent: "아프리카" },
  { term: "gn 기니 guinea", flag: "🇬🇳", name: "기니", continent: "아프리카" },
  { term: "sl 시에라리온 sierra leone", flag: "🇸🇱", name: "시에라리온", continent: "아프리카" },
  { term: "lr 라이베리아 liberia", flag: "🇱🇷", name: "라이베리아", continent: "아프리카" },
  { term: "tg 토고 togo", flag: "🇹🇬", name: "토고", continent: "아프리카" },
  { term: "bj 베냉 benin", flag: "🇧🇯", name: "베냉", continent: "아프리카" },
  { term: "bf 부르키나파소 burkina faso", flag: "🇧🇫", name: "부르키나파소", continent: "아프리카" },
  { term: "ml 말리 mali", flag: "🇲🇱", name: "말리", continent: "아프리카" },
  { term: "ne 니제르 niger", flag: "🇳🇪", name: "니제르", continent: "아프리카" },
  { term: "td 차드 chad", flag: "🇹🇩", name: "차드", continent: "아프리카" },
  { term: "mr 모리타니 mauritania", flag: "🇲🇷", name: "모리타니", continent: "아프리카" },
  { term: "gm 감비아 gambia", flag: "🇬🇲", name: "감비아", continent: "아프리카" },
  { term: "na 나미비아 namibia", flag: "🇳🇦", name: "나미비아", continent: "아프리카" },
  { term: "bw 보츠와나 botswana", flag: "🇧🇼", name: "보츠와나", continent: "아프리카" },
  { term: "ls 레소토 lesotho", flag: "🇱🇸", name: "레소토", continent: "아프리카" },
  { term: "sz 에스와티니 eswatini swaziland", flag: "🇸🇿", name: "에스와티니", continent: "아프리카" },
  { term: "au 호주 australia", flag: "🇦🇺", name: "호주", continent: "오세아니아" },
  { term: "nz 뉴질랜드 new zealand", flag: "🇳🇿", name: "뉴질랜드", continent: "오세아니아" },
  { term: "pg 파푸아뉴기니 papua new guinea", flag: "🇵🇬", name: "파푸아뉴기니", continent: "오세아니아" },
  { term: "fj 피지 fiji", flag: "🇫🇯", name: "피지", continent: "오세아니아" },
  { term: "sb 솔로몬제도 solomon islands", flag: "🇸🇧", name: "솔로몬제도", continent: "오세아니아" },
  { term: "vu 바누아투 vanuatu", flag: "🇻🇺", name: "바누아투", continent: "오세아니아" },
  { term: "ws 사모아 samoa", flag: "🇼🇸", name: "사모아", continent: "오세아니아" },
  { term: "to 통가 tonga", flag: "🇹🇴", name: "통가", continent: "오세아니아" },
  { term: "fm 미크로네시아 micronesia", flag: "🇫🇲", name: "미크로네시아", continent: "오세아니아" },
  { term: "pw 팔라우 palau", flag: "🇵🇼", name: "팔라우", continent: "오세아니아" },
  { term: "mh 마셜제도 marshall islands", flag: "🇲🇭", name: "마셜제도", continent: "오세아니아" },
  { term: "ki 키리바시 kiribati", flag: "🇰🇮", name: "키리바시", continent: "오세아니아" },
  { term: "tv 투발루 tuvalu", flag: "🇹🇻", name: "투발루", continent: "오세아니아" },
  { term: "nr 나우루 nauru", flag: "🇳🇷", name: "나우루", continent: "오세아니아" }
];

// scripts/event-dna-entry.ts
var EVENT_QUESTIONS = DNA_QUESTIONS.filter((q) => q.weight === 2);
var INSTAGRAM_RE = /^[a-z0-9._]{1,30}$/;
function normalizeInstagram(raw) {
  if (!raw) return null;
  let v = String(raw).trim();
  const url = v.match(/instagram\.com\/([^/?#\s]+)/i);
  if (url) v = url[1];
  v = v.replace(/^@+/, "").trim().toLowerCase();
  return INSTAGRAM_RE.test(v) ? v : null;
}
export {
  COUNTRIES,
  DNA_AXES,
  DNA_LABELS,
  DNA_QUESTIONS,
  EVENT_QUESTIONS,
  INSTAGRAM_RE,
  isValidDna,
  makeTypeLabel,
  normalizeInstagram,
  scoreAxes
};
