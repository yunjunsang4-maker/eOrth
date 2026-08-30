// 매칭 엔진 검증. 여기서 틀리면 엉뚱한 사람에게 남의 인스타 아이디가 발송된다.
import {
  preparePeople, rarityOf, axisScore, countryScore, isEligible, pairScore, matchAll, renderMessage,
  kstToMs, splitByBoundary, slot2Pool, filterFrom,
  selectCarryRows, buildCarryFile, carrySignature, mergeCarryRows,
} from './event-match-core.mjs';
import { EVENT_QUESTIONS } from '../docs/event-dna.js';

let fail = 0;
const eq = (got, want, msg) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? '✓' : '✗'} ${msg}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) fail++;
};
const near = (got, want, tol, msg) => {
  const ok = Math.abs(got - want) <= tol;
  console.log(`  ${ok ? '✓' : '✗'} ${msg}${ok ? '' : ` — got ${got}, want ~${want}`}`);
  if (!ok) fail++;
};

const answersAll = (choice) => Object.fromEntries(EVENT_QUESTIONS.map((q) => [q.id, choice]));
let seq = 0;
const person = (over = {}) => ({
  id: `p${++seq}`, name: `사람${seq}`, gender: 'f', gender_pref: 'any',
  instagram: `user${seq}`, wish_countries: ['일본'], answers: answersAll('A'),
  created_at: `2026-08-09T10:0${seq}:00Z`, ...over,
});

console.log('매칭 엔진');

// ── 성향 점수 ──
{
  const [a, b] = preparePeople([person(), person()]);
  eq(axisScore(a, b), 70, '응답이 같으면 성향 만점 70');
}
{
  const [a, b] = preparePeople([person(), person({ answers: answersAll('B') })]);
  near(axisScore(a, b), 0, 1, '정반대 응답이면 성향 0점 근처');
}

// ── 나라 겹침: 희소성 가중 ──
{
  const people = preparePeople([
    person({ wish_countries: ['일본', '아이슬란드'] }),
    person({ wish_countries: ['일본', '아이슬란드'] }),
    person({ wish_countries: ['일본'] }),
    person({ wish_countries: ['일본'] }),
  ]);
  const rarity = rarityOf(people);
  eq(rarity.get('일본'), 1 / 4, '일본 rarity = 1/4 (4명이 골랐다)');
  eq(rarity.get('아이슬란드'), 1 / 2, '아이슬란드 rarity = 1/2 (2명)');
  const max = Math.max(...rarity.values());
  const rare = countryScore(people[0], people[1], rarity, max);
  const common = countryScore(people[2], people[3], rarity, max);
  eq(rare.shared, ['일본', '아이슬란드'], '겹친 나라 목록');
  eq(rare.score > common.score, true, '희귀한 나라가 겹치면 점수가 더 높다');
  eq(countryScore(people[0], person({ wish_countries: ['페루'] }), rarity, max).score, 0, '겹침 없으면 0');
}

// ── 나라 겹침: 상대방 wish_countries 중복은 점수를 부풀리면 안 된다 ──
// 일본 rarity=1/4(min(1,...) 상한에 안 걸리도록 페루로 max rarity=1을 따로 만든다)
{
  const people = preparePeople([
    person({ wish_countries: ['일본'] }),
    person({ wish_countries: ['일본'] }),
    person({ wish_countries: ['일본'] }),
    person({ wish_countries: ['페루'] }), // max rarity(1)를 페루가 갖도록
    person({ wish_countries: ['일본', '일본', '일본'] }), // 일본 4번째 픽커, 자기 리스트 안에서 중복
  ]);
  const rarity = rarityOf(people);
  const max = Math.max(...rarity.values());
  const clean = countryScore(people[0], people[1], rarity, max);
  const dup = countryScore(people[0], people[4], rarity, max);
  eq(dup.score, clean.score, '상대방 wish_countries 중복이 있어도 점수는 동일해야 한다(상한에 안 걸리는 케이스)');
  eq(dup.shared, ['일본'], '중복이어도 shared엔 나라가 한 번만 들어간다');
}

// ── 성별 조건: 양쪽이 모두 만족해야 한다 ──
{
  const f_same = person({ gender: 'f', gender_pref: 'same' });
  const f_any = person({ gender: 'f', gender_pref: 'any' });
  const m_any = person({ gender: 'm', gender_pref: 'any' });
  const m_same = person({ gender: 'm', gender_pref: 'same' });
  const f_opp = person({ gender: 'f', gender_pref: 'opposite' });
  const m_opp = person({ gender: 'm', gender_pref: 'opposite' });
  const f_opp2 = person({ gender: 'f', gender_pref: 'opposite' }); // 동성끼리 비교용 (같은 객체는 id가 같아 항상 false다)
  eq(isEligible(f_same, f_any), true, '여-same ↔ 여-any: 동성이라 성립');
  eq(isEligible(f_same, m_any), false, '여-same ↔ 남-any: 한쪽이 same이면 이성 불가');
  eq(isEligible(f_any, m_any), true, '둘 다 any면 이성도 성립');
  eq(isEligible(m_same, f_same), false, 'same끼리라도 이성이면 불가');
  // 'opposite'(이성만)은 same의 정확한 반대다 — 동성이면 걸러져야 한다
  eq(isEligible(f_opp, m_any), true, '여-이성만 ↔ 남-무관: 이성이라 성립');
  eq(isEligible(f_opp, f_any), false, '여-이성만 ↔ 여-무관: 동성이면 불가');
  eq(isEligible(f_opp, m_opp), true, '이성만끼리 이성이면 성립');
  eq(isEligible(f_opp, f_opp2), false, '이성만끼리라도 동성이면 불가');
  eq(isEligible(f_opp, m_same), false, '이성만 ↔ 같은 성별만(이성): 같은 성별만 쪽이 막는다');
  eq(isEligible(f_opp, f_same), false, '이성만 ↔ 같은 성별만(동성): 이성만 쪽이 막는다');
}

// ── 짝짓기 ──
{
  // 4명 → 2쌍. 응답이 같은 사람끼리 붙어야 한다.
  const people = preparePeople([
    person({ id: 'x1', answers: answersAll('A') }),
    person({ id: 'x2', answers: answersAll('B') }),
    person({ id: 'x3', answers: answersAll('A') }),
    person({ id: 'x4', answers: answersAll('B') }),
  ]);
  const { pairs, trios, unmatched } = matchAll(people);
  eq(pairs.length, 2, '4명 → 2쌍');
  eq(trios.length, 0, '3인조 없음');
  eq(unmatched.length, 0, '미매칭 없음');
  const ids = pairs.map((p) => [p.a.id, p.b.id].sort().join('+')).sort();
  eq(ids, ['x1+x3', 'x2+x4'], '성향이 같은 사람끼리 묶인다');
}
{
  // 홀수 → 남는 1명은 최고점 짝에 붙어 3인조가 된다
  const people = preparePeople([person(), person(), person()]);
  const { pairs, trios, unmatched } = matchAll(people);
  eq(pairs.length, 0, '3명 → 남는 쌍 없음(3인조로 흡수)');
  eq(trios.length, 1, '3인조 1개');
  eq([trios[0].a, trios[0].b, trios[0].c].every(Boolean), true, '3인조에 세 사람이 다 있다');
  eq(unmatched.length, 0, '미매칭 없음');
}
{
  // 성별 조건 때문에 아무와도 못 묶이는 사람은 사유와 함께 남는다
  const people = preparePeople([
    person({ id: 'f1', gender: 'f', gender_pref: 'same' }),
    person({ id: 'f2', gender: 'f', gender_pref: 'same' }),
    person({ id: 'm1', gender: 'm', gender_pref: 'same' }),
  ]);
  const { pairs, trios, unmatched } = matchAll(people);
  eq(pairs.length, 1, '여성 2명이 한 쌍');
  eq(trios.length, 0, '조건에 안 맞는 사람을 3인조로 밀어넣지 않는다');
  eq(unmatched.map((u) => u.person.id), ['m1'], '남은 사람은 미매칭으로 보고된다');
  eq(
    unmatched[0].reason,
    '성별 조건에 맞는 상대가 아무도 없습니다 — 매칭 상대 조건(같은 성별만/무관/이성만)을 확인하세요.',
    '사유: 애초에 성별 조건이 맞는 상대가 한 명도 없었던 경우로 정확히 분류된다',
  );
}
{
  // '이성만'은 점수를 이겨야 한다 — 성향이 완벽히 같은 동성 상대가 있어도 그쪽으로 붙으면 안 된다.
  // (isEligible만 통과시키고 matchAll에서 조건을 안 보면 여기서 잡힌다)
  const people = preparePeople([
    person({ id: 'o1', gender: 'f', gender_pref: 'opposite', answers: answersAll('A') }),
    person({ id: 'o2', gender: 'f', gender_pref: 'any', answers: answersAll('A') }), // o1과 성향 만점이지만 동성
    person({ id: 'o3', gender: 'm', gender_pref: 'any', answers: answersAll('B') }), // 성향은 정반대지만 이성
  ]);
  const { pairs, trios, unmatched } = matchAll(people);
  eq(trios.length, 0, '이성만인 사람이 낀 3인조는 만들어지지 않는다');
  eq(pairs.map((p) => [p.a.id, p.b.id].sort().join('+')), ['o1+o3'], '이성만은 만점 동성이 아니라 이성과 묶인다');
  eq(unmatched.map((u) => u.person.id), ['o2'], '남는 사람은 o2');
}
{
  // 적격 상대는 있었지만(성별 조건 문제가 아니라) 이미 다른 사람과 짝이 되어 붙을 자리가
  // 없어서 남는 경우 — "성별 조건에 맞는 짝이 없습니다"로 보고하면 운영자가 성비 문제로
  // 오인한다. r1·r2가 먼저 짝이 되고, r3는 그 짝에 3인조로 흡수되지만, r4는 같은 짝에
  // 붙으려 해도(usedPair) 자리가 없어 남는다 — r4는 r1·r2 모두와 적격했다.
  const r1 = person({ id: 'r1', gender: 'f', gender_pref: 'any' });
  const r2 = person({ id: 'r2', gender: 'f', gender_pref: 'any' });
  const r3 = person({ id: 'r3', gender: 'f', gender_pref: 'same' }); // r1·r2와는 동성이라 적격, r4와는 이성이라 부적격
  const r4 = person({ id: 'r4', gender: 'm', gender_pref: 'any' }); // r1·r2와는 적격(양쪽 any), r3와는 부적격
  const people = preparePeople([r1, r2, r3, r4]);
  const { pairs, trios, unmatched } = matchAll(people);
  eq(pairs.length, 0, '남은 쌍 없음(1쌍은 3인조로 승격됨)');
  eq(trios.length, 1, '3인조 1개(r3가 r1·r2 짝에 흡수됨)');
  eq([trios[0].a.id, trios[0].b.id, trios[0].c.id].sort(), ['r1', 'r2', 'r3'], '3인조는 r1·r2·r3');
  eq(unmatched.map((u) => u.person.id), ['r4'], '남은 사람은 r4');
  eq(
    unmatched[0].reason,
    '조건에 맞는 상대는 있었지만 이미 다른 사람과 짝이 되어 붙을 자리가 남지 않았습니다(성비 문제가 아니라 인원 배치가 소진된 것입니다).',
    '사유: 적격 상대는 있었으나 짝이 소진되어 못 붙은 잔여 소진 경우로 정확히 분류된다',
  );
}
{
  // 결정론 — 두 번 돌려도 같은 결과여야 한다(이미 보낸 DM과 어긋나면 안 된다)
  const mk = () => preparePeople([person(), person(), person(), person()]);
  seq = 0; const first = matchAll(mk());
  seq = 0; const second = matchAll(mk());
  eq(first.pairs.map((p) => [p.a.id, p.b.id]), second.pairs.map((p) => [p.a.id, p.b.id]), '같은 입력 → 같은 짝');
}

// ── 발송 문구 ──
{
  const [me, partner] = preparePeople([person({ name: '준상', instagram: 'yun' }), person({ name: '지민', instagram: 'jimin' })]);
  const msg = renderMessage({ me, partners: [partner], score: 87, shared: ['아이슬란드'], eventName: 'eOrth 팝업 이벤트' });
  eq(msg.includes('준상'), true, '내 이름 포함');
  eq(msg.includes('@jimin'), true, '상대 아이디 포함');
  eq(msg.includes('@yun'), false, '내 아이디는 내 문구에 안 들어간다');
  eq(msg.includes('87%'), true, '매칭률 포함');
  eq(msg.includes('아이슬란드'), true, '겹친 나라 포함');
}

// ── 발송 문구: 3인조(partners 2명) ──
// 상대가 둘일 때 두 아이디가 모두 들어가고, 자기 아이디는 안 들어가는지가 핵심이다.
// 여기서 틀리면 3인조 중 한 명이 자기 자신의 아이디를 상대로 받는 사고가 난다.
{
  const [me, p1, p2] = preparePeople([
    person({ name: '가영', instagram: 'gayoung' }),
    person({ name: '나윤', instagram: 'nayoon' }),
    person({ name: '다은', instagram: 'daeun' }),
  ]);
  const msg = renderMessage({ me, partners: [p1, p2], score: 70, shared: ['일본'], eventName: 'eOrth 팝업 이벤트' });
  eq(msg.includes('@nayoon'), true, '3인조 문구: 상대1 아이디 포함');
  eq(msg.includes('@daeun'), true, '3인조 문구: 상대2 아이디 포함');
  eq(msg.includes('@gayoung'), false, '3인조 문구: 자기 아이디는 안 들어간다');
}

// ── 발송 문구: 간단 자기소개(선택 입력) ──
// 있으면 상대 줄 아래에 따옴표로 붙고, 없으면 그 줄 자체가 없어야 한다.
// 무조건 붙이면 자기소개를 안 쓴 사람의 자리에 빈 따옴표("")만 있는 줄이 발송된다.
//
// 문구엔 유형 라벨("모험가" 등)에도 따옴표가 쓰인다 — `includes('"')`로 세면 항상 참이라
// 검사가 무력해진다. 그래서 자기소개 줄의 고유 형태(줄바꿈 + 두 칸 들여쓰기 + 따옴표)로만 센다.
const INTRO_LINE = '\n  "';
const introLines = (msg) => msg.split(INTRO_LINE).length - 1;
{
  const [me, partner] = preparePeople([
    person({ name: '준상', instagram: 'yun' }),
    person({ name: '지민', instagram: 'jimin', intro: '사진 찍는 거 좋아해요' }),
  ]);
  const msg = renderMessage({ me, partners: [partner], score: 87, shared: [], eventName: 'eOrth 팝업 이벤트' });
  eq(msg.includes('\n  "사진 찍는 거 좋아해요"'), true, '자기소개 있는 상대: 아이디 줄 아래에 따옴표로 붙는다');
  eq(introLines(msg), 1, '자기소개 줄은 딱 한 줄');
  eq(msg.includes('@jimin (지민 · '), true, '자기소개가 붙어도 상대 아이디 줄은 그대로다');
}
{
  // intro 없음(컬럼 자체가 없는 옛 행) · null(안 쓴 사람) · 공백만 — 셋 다 줄이 안 생겨야 한다
  const [me, pNone, pNull, pBlank] = preparePeople([
    person({ name: '준상', instagram: 'yun' }),
    person({ name: '지민', instagram: 'jimin' }),                  // intro 키 자체가 없음
    person({ name: '가영', instagram: 'gayoung', intro: null }),   // DB nullable → null
    person({ name: '나윤', instagram: 'nayoon', intro: '   ' }),   // 공백만 입력
  ]);
  const base = { me, score: 70, shared: [], eventName: 'eOrth 팝업 이벤트' };
  eq(introLines(renderMessage({ ...base, partners: [pNone] })), 0, 'intro 키가 없으면 자기소개 줄 자체가 없다');
  eq(introLines(renderMessage({ ...base, partners: [pNull] })), 0, 'intro가 null이면 자기소개 줄 자체가 없다');
  eq(introLines(renderMessage({ ...base, partners: [pBlank] })), 0, 'intro가 공백뿐이면 빈 따옴표 줄이 나가지 않는다');
}
{
  // 3인조에서 한 명만 자기소개를 썼을 때 — 쓴 사람에게만 줄이 붙어야 한다
  const [me, p1, p2] = preparePeople([
    person({ name: '준상', instagram: 'yun' }),
    person({ name: '지민', instagram: 'jimin', intro: '유럽 가고 싶어요' }),
    person({ name: '가영', instagram: 'gayoung' }),
  ]);
  const msg = renderMessage({ me, partners: [p1, p2], score: 70, shared: [], eventName: 'eOrth 팝업 이벤트' });
  eq(msg.includes('\n  "유럽 가고 싶어요"'), true, '3인조: 자기소개를 쓴 상대의 소개가 들어간다');
  eq(introLines(msg), 1, '3인조: 자기소개 줄은 쓴 사람 몫 한 줄뿐(안 쓴 상대 자리엔 빈 줄이 없다)');
}

// ── 분할 불변식: 20~30명 규모, 성별·선호·희망국가를 섞어도 짝이 어긋나지 않아야 한다 ──
// 이 프로젝트에서 가장 비싼 실패는 "한 사람이 두 짝에 들어가는 것"이다 — 그 사람의 인스타 아이디가
// 서로 다른 두 상대에게 전달된다. 개수만 세는 테스트는 이 실패를 못 잡는다.
{
  const genders = ['m', 'f'];
  const countryPool = ['일본', '아이슬란드', '페루', '태국', '이탈리아', '프랑스'];
  const bigPeople = preparePeople(Array.from({ length: 27 }, (_, i) => person({
    id: `g${i}`,
    gender: genders[i % 2],
    gender_pref: ['same', 'any', 'opposite'][i % 3],
    wish_countries: [countryPool[i % countryPool.length], countryPool[(i + 2) % countryPool.length]],
    answers: answersAll(i % 2 === 0 ? 'A' : 'B'),
  })));
  const { pairs, trios, unmatched } = matchAll(bigPeople);

  // ① 모든 id가 pairs∪trios∪unmatched에 정확히 한 번 등장
  const seen = [];
  for (const p of pairs) seen.push(p.a.id, p.b.id);
  for (const t of trios) seen.push(t.a.id, t.b.id, t.c.id);
  for (const u of unmatched) seen.push(u.person.id);
  eq(seen.length, bigPeople.length, '분할 불변식(27명): 등장 횟수 합 = 전체 인원');
  eq(new Set(seen).size, bigPeople.length, '분할 불변식(27명): 모든 id가 중복 없이 정확히 한 번');

  // ② 어떤 짝·3인조도 isEligible을 위반하지 않는다
  let violations = 0;
  for (const p of pairs) if (!isEligible(p.a, p.b)) violations++;
  for (const t of trios) {
    if (!isEligible(t.a, t.b)) violations++;
    if (!isEligible(t.a, t.c)) violations++;
    if (!isEligible(t.b, t.c)) violations++;
  }
  eq(violations, 0, '분할 불변식(27명): 어떤 짝·3인조도 성별 조건을 위반하지 않는다');
}

// ── 타임(슬롯) 분리 ──
{
  // KST → UTC. 실행 머신 시간대에 좌우되면 안 된다(그래서 new Date(문자열)을 안 쓴다).
  eq(kstToMs('2026-09-10 14:00'), Date.UTC(2026, 8, 10, 5, 0), 'KST 14:00 = UTC 05:00');
  eq(kstToMs('2026-09-10T14:00'), Date.UTC(2026, 8, 10, 5, 0), 'T 구분자도 허용');
  eq(kstToMs('2026-09-10 09:00'), Date.UTC(2026, 8, 10, 0, 0), 'KST 09:00 = 같은 날 UTC 00:00');
  eq(kstToMs('2026-09-10 08:00'), Date.UTC(2026, 8, 9, 23, 0), 'KST 08:00 = 전날 UTC 23:00 (날짜가 넘어간다)');
  eq(kstToMs('2026-09-10'), null, '시각이 없으면 null');
  eq(kstToMs('2026-13-10 14:00'), null, '13월은 null (Date.UTC는 조용히 다음 해로 넘긴다)');
  eq(kstToMs('2026-09-10 25:00'), null, '25시는 null');
  eq(kstToMs(''), null, '빈 문자열은 null');
  eq(kstToMs(undefined), null, 'undefined는 null');
}
{
  // 경계 시각 자체는 타임②(after)에 들어간다
  const b = kstToMs('2026-09-10 14:00');
  const row = (id, kst) => ({ id, instagram: id, created_at: new Date(kstToMs(kst)).toISOString() });
  const { before, after, undated } = splitByBoundary([
    row('a', '2026-09-10 10:00'),
    row('b', '2026-09-10 13:59'),
    row('c', '2026-09-10 14:00'),   // 경계 정각
    row('d', '2026-09-10 17:59'),
    { id: 'e', instagram: 'e', created_at: null },
    { id: 'f', instagram: 'f', created_at: '깨진값' },
  ], b);
  eq(before.map((r) => r.id), ['a', 'b'], '경계 이전은 타임①');
  eq(after.map((r) => r.id), ['c', 'd'], '경계 정각은 타임②에 포함');
  eq(undated.map((r) => r.id), ['e', 'f'], 'created_at이 없거나 깨진 행은 따로 분리된다(조용히 버리지 않는다)');
}
{
  // 타임② 풀 = 타임② 참가자 + 타임① 미매칭자. 타임①에서 짝이 된 사람은 절대 안 들어온다.
  // f1·f2는 서로 짝이 되고(동성·same), m1은 성별 조건상 타임①에서 아무와도 못 묶여 이월된다.
  const beforeRows = [
    person({ id: 'f1', gender: 'f', gender_pref: 'same' }),
    person({ id: 'f2', gender: 'f', gender_pref: 'same' }),
    person({ id: 'm1', gender: 'm', gender_pref: 'same' }),
  ];
  const afterRows = [
    person({ id: 'm2', gender: 'm', gender_pref: 'same' }),
    person({ id: 'm3', gender: 'm', gender_pref: 'any' }),
  ];
  const { pool, carried } = slot2Pool(beforeRows, afterRows);
  eq(carried.map((r) => r.id), ['m1'], '타임① 미매칭자만 이월된다');
  eq(pool.map((r) => r.id).sort(), ['m1', 'm2', 'm3'], '타임② 풀 = 타임② 참가자 + 이월자');

  // 핵심 불변식: 타임①에서 짝이 된 사람은 타임② 결과 어디에도 없어야 한다.
  // 여기서 새면 같은 사람에게 문구가 두 번 나가고, 두 상대에게 같은 아이디가 각각 전달된다.
  const first = matchAll(preparePeople(beforeRows));
  const firstMatched = new Set();
  for (const p of first.pairs) { firstMatched.add(p.a.id); firstMatched.add(p.b.id); }
  for (const t of first.trios) { firstMatched.add(t.a.id); firstMatched.add(t.b.id); firstMatched.add(t.c.id); }
  eq([...firstMatched].sort(), ['f1', 'f2'], '타임①에서 짝이 된 사람은 f1·f2');
  const second = matchAll(preparePeople(pool));
  const secondIds = [];
  for (const p of second.pairs) secondIds.push(p.a.id, p.b.id);
  for (const t of second.trios) secondIds.push(t.a.id, t.b.id, t.c.id);
  for (const u of second.unmatched) secondIds.push(u.person.id);
  eq(secondIds.filter((id) => firstMatched.has(id)), [], '타임①에서 짝이 된 사람은 타임② 결과에 없다');
  eq(secondIds.includes('m1'), true, '이월된 m1은 타임②에서 다시 시도된다');
}
{
  // meetNow — 행사 당일 발송(타임①·②)일 때만 "지금 만나세요"가 나간다.
  // 며칠 지난 뒤 이 문장이 나가면 없는 자리로 오라고 부르게 된다.
  const [me, partner] = preparePeople([person({ name: '준상' }), person({ name: '지민' })]);
  const base = { me, partners: [partner], score: 80, shared: [], eventName: 'eOrth 팝업 이벤트' };
  eq(renderMessage({ ...base, meetNow: true }).includes('아직 행사장에 계시다면'), true, '타임①·②(당일 발송): 현장에서 만나라고 안내');
  eq(renderMessage({ ...base, meetNow: false }).includes('아직 행사장에 계시다면'), false, 'meetNow=false면 그 문장이 없다');
  eq(renderMessage(base).includes('아직 행사장에 계시다면'), false, '기본값은 현장 안내 없음(타임 없이 일괄 매칭할 때의 기존 동작)');
}

// ── --from 하한(이틀 행사에서 전날 참가자 재매칭 방지) ──
{
  const from = kstToMs('2026-09-10 00:00');
  const row = (id, kst) => ({ id, instagram: id, name: id, created_at: new Date(kstToMs(kst)).toISOString() });
  const { kept, dropped, undated } = filterFrom([
    row('prev', '2026-09-09 15:00'),      // 1일차 참가자 — 빠져야 한다
    row('edge_out', '2026-09-09 23:59'),  // 하한 1분 전
    row('edge_in', '2026-09-10 00:00'),   // 하한 정각 — **포함**
    row('today', '2026-09-10 11:00'),
    { id: 'nil', instagram: 'nil', name: 'nil', created_at: null },
    { id: 'bad', instagram: 'bad', name: 'bad', created_at: '깨진값' },
  ], from);
  eq(kept.map((r) => r.id), ['edge_in', 'today'], '하한 정각은 포함(kept), 그 이전은 제외');
  eq(dropped.map((r) => r.id), ['prev', 'edge_out'], '하한 이전 행은 dropped로 분리된다(몇 명이 빠졌는지 세야 한다)');
  eq(undated.map((r) => r.id), ['nil', 'bad'], 'created_at이 없거나 깨진 행은 조용히 버리지 않고 따로 돌려준다');
}
{
  // 경계: 빈 배열·null 입력에서 터지지 않아야 한다(제외 목록 때문에 0건이 되는 일이 실제로 있다)
  eq(filterFrom([], kstToMs('2026-09-10 00:00')), { kept: [], dropped: [], undated: [] }, '빈 배열은 전부 빈 결과');
  eq(filterFrom(undefined, kstToMs('2026-09-10 00:00')), { kept: [], dropped: [], undated: [] }, 'rows가 undefined여도 터지지 않는다');
}
{
  // KST 벽시계 파싱 함정 회귀 — 하한은 KST인데 created_at은 UTC다.
  // new Date('2026-09-10 00:00')을 쓰면 머신 시간대로 해석돼 9시간 어긋나고,
  // 그러면 1일차 저녁(KST 15:00 = UTC 06:00) 참가자가 2일차 풀에 남는다.
  const from = kstToMs('2026-09-10 00:00');
  eq(from, Date.UTC(2026, 8, 9, 15, 0), '--from "2026-09-10 00:00"(KST) = UTC 2026-09-09 15:00');
  const { kept } = filterFrom([{ id: 'k', created_at: '2026-09-09T14:59:00Z' }], from); // KST 9/9 23:59
  eq(kept.map((r) => r.id), [], 'KST 9/9 23:59 제출은 9/10 하한에 안 걸린다(9시간 어긋나면 여기서 잡힌다)');
}

// ── 이틀 행사 통합: 2일차 실행이 1일차 행을 완전히 배제하는가 ──
// 이 저장소에서 가장 비싼 실패는 "같은 사람에게 문구가 두 번 나가는 것"이다.
// --from 없이 2일차에 --slot 1 --boundary "2026-09-10 14:00"을 돌리면 1일차 참가자 전원이
// before에 들어와 재매칭된다 — 그 경로가 --from으로 막히는지를 여기서 확인한다.
{
  const day1 = [
    person({ id: 'd1a', created_at: '2026-09-09T02:00:00Z' }),                       // KST 9/9 11:00 (타임①)
    person({ id: 'd1b', created_at: '2026-09-09T02:10:00Z' }),                       // KST 9/9 11:10 (타임①)
    person({ id: 'd1solo', gender: 'm', gender_pref: 'same', created_at: '2026-09-09T08:00:00Z' }), // KST 9/9 17:00, 1일차 최종 미매칭이 될 사람
  ];
  const day2 = [
    person({ id: 'd2a', created_at: '2026-09-10T02:00:00Z' }),                       // KST 9/10 11:00 (타임①)
    person({ id: 'd2b', created_at: '2026-09-10T02:10:00Z' }),                       // KST 9/10 11:10 (타임①)
    person({ id: 'd2c', created_at: '2026-09-10T08:00:00Z' }),                       // KST 9/10 17:00 (타임②)
  ];
  const all = [...day1, ...day2];

  // ① 대조군: --from 없이 2일차 boundary만 쓰면 1일차가 통째로 타임①에 섞인다(고치려는 결함 그 자체)
  const noFrom = splitByBoundary(all, kstToMs('2026-09-10 14:00'));
  eq(noFrom.before.map((r) => r.id), ['d1a', 'd1b', 'd1solo', 'd2a', 'd2b'],
    '대조군: --from이 없으면 1일차 참가자가 2일차 타임①에 전원 섞인다');

  // ② 2일차 타임① — --from 적용 후 boundary
  const d2 = filterFrom(all, kstToMs('2026-09-10 00:00'));
  eq(d2.dropped.map((r) => r.id), ['d1a', 'd1b', 'd1solo'], '2일차 --from이 1일차 3명을 제외한다');
  const d2split = splitByBoundary(d2.kept, kstToMs('2026-09-10 14:00'));
  eq(d2split.before.map((r) => r.id), ['d2a', 'd2b'], '2일차 타임① 풀에 1일차가 한 명도 없다');
  eq(d2split.after.map((r) => r.id), ['d2c'], '2일차 타임② 참가자');

  // ③ **--prev-* 를 주지 않으면** 2일차 어느 풀에도 1일차 미매칭자(d1solo)가 들어가면 안 된다.
  //    전날 이월은 --prev-* 를 명시하고 본인이 동의한 경우에만 일어나는 옵트인 경로다
  //    (조건부 이월 케이스는 이 파일 아래쪽 이월 파일 절에서 따로 검증한다).
  //    기본값이 "이월 안 함"이어야 하는 이유: 자리에 없는 사람에게 "지금 만나세요"가 나가는 것을 막는다.
  const { pool, carried } = slot2Pool(d2split.before, d2split.after);
  eq(pool.map((r) => r.id).sort(), ['d2c'], '2일차 타임② 풀 = 2일차 타임② 참가자뿐(1일차 미매칭 이월 없음)');
  eq(carried.map((r) => r.id), [], '2일차 타임①은 짝이 다 지어져 이월자가 없다');
  eq(pool.some((r) => day1.some((d) => d.id === r.id)), false, '2일차 타임② 풀에 1일차 행이 단 하나도 없다');

  // ④ 1일차 실행(9/9 저녁) — 그 시점에 DB에는 1일차 행만 있다. 이때 --from은 행사 전
  //    실기기 테스트 제출을 걷어내는 역할을 한다.
  const testRow = person({ id: 'test1', created_at: '2026-09-05T05:00:00Z' }); // 행사 전 테스트 제출
  const atDay1Evening = [testRow, ...day1];
  const d1 = filterFrom(atDay1Evening, kstToMs('2026-09-09 00:00'));
  eq(d1.dropped.map((r) => r.id), ['test1'], '1일차 --from이 행사 전 테스트 제출을 걷어낸다');
  const d1split = splitByBoundary(d1.kept, kstToMs('2026-09-09 14:00'));
  eq(d1split.before.map((r) => r.id), ['d1a', 'd1b'], '1일차 타임①');
  const d1slot2 = slot2Pool(d1split.before, d1split.after);
  eq(d1slot2.pool.map((r) => r.id).sort(), ['d1solo'], '1일차 타임② 풀 = 1일차 타임② 참가자(d1solo)뿐');

  // ⑤ --from은 **하한만** 있고 상한은 없다 — 의도된 설계다(행사 당일에 미래 행은 존재하지 않는다).
  //    그래서 행사가 다 끝난 뒤 1일차 리포트를 재현하려고 --from "2026-09-09 00:00"으로
  //    다시 돌리면 2일차 행까지 딸려 들어온다. 재현이 필요하면 --exclude 로 빼거나
  //    1일차 산출 파일(event-report-2026-09-09-slot*.local.html)을 그대로 보관해 쓴다.
  //    이 성질을 명시적으로 못 박아 둔다 — "창(window)"으로 오해하면 재현 결과가 조용히 달라진다.
  const replay = filterFrom(all, kstToMs('2026-09-09 00:00'));
  eq(replay.kept.map((r) => r.id), ['d1a', 'd1b', 'd1solo', 'd2a', 'd2b', 'd2c'],
    '--from은 하한만이다: 행사 종료 후 1일차 값으로 재실행하면 2일차 행도 포함된다(상한 없음)');
}

// ── 조건부 이월: 상태 파일 방식 ──
// 전날을 **다시 계산하지 않고** 타임② 실행이 확정한 명단 파일을 그대로 읽는다.
// 재계산 방식은 1일차 타임② 이후 자정까지 들어오는 지각 제출 때문에 중복 발송을 냈다(아래 회귀 케이스).

// 그날의 타임①→② 를 실제 CLI 와 같은 순서로 돌려 최종 결과를 얻는 헬퍼.
const runDay = (dayRows, boundaryKst, carryIn = []) => {
  const { before, after } = splitByBoundary(dayRows, kstToMs(boundaryKst));
  const slot1Pool = mergeCarryRows(before, carryIn).merged;
  const { pool } = slot2Pool(slot1Pool, after);
  const slot1 = matchAll(preparePeople(slot1Pool));
  const slot2 = matchAll(preparePeople(pool));
  const cardIds = [];
  for (const r of [slot1, slot2]) {
    for (const p of r.pairs) cardIds.push(p.a.id, p.b.id);
    for (const t of r.trios) cardIds.push(t.a.id, t.b.id, t.c.id);
  }
  return { slot1, slot2, pool, cardIds };
};

{
  // (a) 최종 미매칭 중 동의자만 고른다. `=== true` 로만 본다 —
  //     컬럼이 없던 시절의 옛 행(undefined)·null 은 "동의 안 함"이다.
  const rows = [
    person({ id: 'yes', carry_next_day: true }),
    person({ id: 'no', carry_next_day: false }),
    person({ id: 'old' }),                        // 키 자체가 없음
    person({ id: 'nul', carry_next_day: null }),
    person({ id: 'matched', carry_next_day: true }),
  ];
  const unmatched = [{ person: { id: 'yes' } }, { person: { id: 'no' } },
    { person: { id: 'old' } }, { person: { id: 'nul' } }];
  eq(selectCarryRows(unmatched, rows).map((r) => r.id), ['yes'],
    '(a) 최종 미매칭 중 carry_next_day === true 인 사람만 이월 대상');
  // (b) 짝이 된 사람(matched)은 unmatched 에 없으므로 구조적으로 이월될 수 없다
  eq(selectCarryRows(unmatched, rows).some((r) => r.id === 'matched'), false,
    '(b) 짝이 된 사람은 이월 목록에 들어갈 수 없다(unmatched 에서만 고른다)');
  eq(selectCarryRows([], rows), [], '미매칭이 없으면 이월도 없다');
  eq(selectCarryRows(undefined, undefined), [], 'undefined 입력에도 터지지 않는다');
  // 원본 행을 담아야 한다 — preparePeople 이 붙인 scores/label 이 파일에 새면 안 된다
  eq('scores' in selectCarryRows(unmatched, rows)[0], false, '이월 행은 원본 행(계산 결과가 섞이지 않는다)');
}
{
  // 이월 파일에는 **시각이 들어가지 않는다** — 같은 인자면 내용이 완전히 같아야
  // "명단이 달라졌다"를 탐지할 수 있다. 시각을 넣으면 매 실행이 달라져 탐지가 죽는다.
  const rows = [person({ id: 'a', carry_next_day: true })];
  const mk = () => buildCarryFile({
    event: 'popup01', day: '2026-09-09', from: '2026-09-09 00:00',
    boundary: '2026-09-09 14:00', exclude: 'test_staff', rows,
  });
  eq(JSON.stringify(mk()) === JSON.stringify(mk()), true, '같은 인자면 이월 파일 내용이 완전히 같다(시각이 안 들어간다)');
  eq(mk().count, 1, 'count 는 rows 길이');
  eq(mk().day, '2026-09-09', 'day 가 파일의 신원(= --from 날짜)');
  eq(mk().exclude, 'test_staff', '실행 인자 원문(exclude)이 함께 남는다');
  eq(JSON.stringify(mk()).includes('scores'), false, '파일에 계산 결과가 섞이지 않는다');
}
{
  // --overwrite-carry 가드: 명단이 같으면 통과, 다르면 막아야 한다.
  const base = { event: 'popup01', day: '2026-09-09', from: '2026-09-09 00:00', boundary: '2026-09-09 14:00', exclude: '' };
  const p = person({ id: 'p1', instagram: 'p1', carry_next_day: true });
  const q = person({ id: 'q1', instagram: 'q1', carry_next_day: true });
  const a = buildCarryFile({ ...base, rows: [p, q] });
  const b = buildCarryFile({ ...base, rows: [q, p] });   // 순서만 다름
  const c = buildCarryFile({ ...base, rows: [p] });      // 명단이 다름
  const d = buildCarryFile({ ...base, exclude: 'test_x', rows: [p, q] }); // 실행 창이 다름
  eq(carrySignature(a) === carrySignature(b), true, '행 순서만 다르면 같은 명단으로 본다(덮어쓰기 막지 않는다)');
  eq(carrySignature(a) === carrySignature(c), false, '명단이 다르면 지문이 다르다 → 덮어쓰기 차단');
  eq(carrySignature(a) === carrySignature(d), false, 'exclude 가 다르면 지문이 다르다 → 덮어쓰기 차단');
}
{
  // mergeCarryRows: 같은 id 를 두 번 넣지 않는다(한 사람이 두 번 매칭되는 것을 막는다)
  const dayRows = [person({ id: 'd1' }), person({ id: 'd2' })];
  const carryIn = [person({ id: 'c1' }), person({ id: 'd2' })];  // d2 는 이미 당일 풀에 있음
  const { merged, added, skipped } = mergeCarryRows(dayRows, carryIn);
  eq(merged.map((r) => r.id), ['d1', 'd2', 'c1'], '이월 행은 뒤에 붙고, 중복 id 는 안 들어간다');
  eq(added.map((r) => r.id), ['c1'], '실제로 합류한 사람만 added');
  eq(skipped.map((r) => r.id), ['d2'], '이미 있던 사람은 skipped 로 보고된다(조용히 버리지 않는다)');
  eq(mergeCarryRows(undefined, undefined), { merged: [], added: [], skipped: [] }, 'undefined 입력에도 터지지 않는다');
}

// ── 🔴 회귀: 지각 제출이 있어도 중복 발송 0 · 이월 누락 0 ──
// QA 가 재현한 F1 과 같은 구조다. 1일차 타임②(18:05) 실행 뒤 자정까지 지각 제출이 들어온다.
// 옛 재계산 방식은 그 한 건 때문에 짝 구성이 뒤집혀 **이미 발송한 사람이 다음 날 다시 카드로
// 나왔다.** 상태 파일 방식은 18:05 시점의 명단을 파일로 못 박으므로 지각 행이 결과를 못 바꾼다.
{
  // p·q 는 1일차 타임②에서 짝이 된다(둘 다 여성). p 는 동의 체크를 켰지만 짝이 됐으므로 이월 대상이 아니다.
  // p 는 '같은 성별만'이라 남성 지각자와는 3인조로도 붙을 수 없다 — 그래서 재계산하면 홀로 남는다.
  const p = person({ id: 'p', instagram: 'p', gender: 'f', gender_pref: 'same', carry_next_day: true, answers: answersAll('B'), created_at: '2026-09-09T08:00:00Z' });
  const q = person({ id: 'q', instagram: 'q', gender: 'f', gender_pref: 'any', answers: answersAll('A'), created_at: '2026-09-09T08:01:00Z' });
  // 지각자: 9/9 20:00 KST(= 11:00Z). q 와 성향이 완전히 같아 재계산이면 q 를 더 높은 점수로 가져간다.
  const late = person({ id: 'late', instagram: 'late', gender: 'm', gender_pref: 'any', answers: answersAll('A'), created_at: '2026-09-09T11:00:00Z' });
  const d2 = person({ id: 'd2', instagram: 'd2', gender: 'f', gender_pref: 'same', created_at: '2026-09-10T02:00:00Z' });

  // ① 1일차 18:05 실행 — 그 시점 DB 에는 p·q 만 있다
  const day1 = runDay([p, q], '2026-09-09 14:00');
  eq(day1.cardIds.sort(), ['p', 'q'], '1일차: p·q 가 짝이 되어 카드로 발송됨');
  const carryFile = buildCarryFile({
    event: 'popup01', day: '2026-09-09', from: '2026-09-09 00:00',
    boundary: '2026-09-09 14:00', exclude: '',
    rows: selectCarryRows(day1.slot2.unmatched, day1.pool),
  });
  eq(carryFile.rows.map((r) => r.id), [], '1일차 이월 파일: 짝이 된 p 는 들어가지 않는다(미매칭이 없다)');

  // ② 그 뒤 지각 제출 1건이 들어온다. 2일차는 **파일을 읽을 뿐** 전날을 다시 계산하지 않는다.
  const day2 = runDay([d2], '2026-09-10 14:00', carryFile.rows);
  eq(day2.cardIds.includes('p'), false,
    '🔴 지각 제출이 있어도 이미 발송한 p 가 2일차 카드로 다시 나오지 않는다(중복 발송 0)');
  eq(day2.pool.concat(day2.slot1.unmatched.map((u) => u.person)).some((r) => r.id === 'late'), false,
    '지각자는 전날 창 재계산 경로가 없어 2일차 풀에 끼어들 수 없다');

  // ③ 대조군 — 옛 재계산 방식이었다면 어떻게 뒤집혔는지 고정해 둔다.
  //    지각자를 포함해 1일차를 다시 계산하면 q 가 late 에게 가고 p 가 미매칭이 된다.
  const recomputed = runDay([p, q, late], '2026-09-09 14:00');
  const wouldCarry = selectCarryRows(recomputed.slot2.unmatched, recomputed.pool);
  eq(wouldCarry.map((r) => r.id), ['p'],
    '대조군: 재계산 방식이었다면 발송이 끝난 p 가 이월 대상으로 뒤집혔다(이것이 F1의 정체)');
}
{
  // 반대 방향(조용한 누락)도 막혔는지 — 진짜 미매칭 동의자가 지각자와 짝지어져 이월에서 빠지던 결함.
  const yes = person({ id: 'yes', instagram: 'yes', gender: 'f', gender_pref: 'same', carry_next_day: true, created_at: '2026-09-09T08:00:00Z' });
  const no = person({ id: 'no', instagram: 'no', gender: 'm', gender_pref: 'opposite', carry_next_day: false, created_at: '2026-09-09T08:01:00Z' });
  const late = person({ id: 'late', instagram: 'late', gender: 'f', gender_pref: 'same', created_at: '2026-09-09T11:00:00Z' });

  const day1 = runDay([yes, no], '2026-09-09 14:00');
  eq(day1.slot2.unmatched.map((u) => u.person.id).sort(), ['no', 'yes'], '1일차: 둘 다 최종 미매칭');
  const carryRows = selectCarryRows(day1.slot2.unmatched, day1.pool);
  eq(carryRows.map((r) => r.id), ['yes'], '동의자 yes 만 이월 파일에 담긴다(미동의 no 는 제외)');

  // 대조군: 재계산이었다면 late 가 yes 와 짝이 되어 이월에서 조용히 사라진다
  const recomputed = runDay([yes, no, late], '2026-09-09 14:00');
  eq(selectCarryRows(recomputed.slot2.unmatched, recomputed.pool).map((r) => r.id), [],
    '대조군: 재계산 방식이었다면 동의자 yes 가 이월에서 조용히 누락됐다');

  // (c) 이월자가 다음 날 타임①에서도 미매칭이면 타임②에 나타난다 / (d) 당일 참가자와 짝이 된다
  const dayF = person({ id: 'dayF', instagram: 'dayf', gender: 'f', gender_pref: 'same', created_at: '2026-09-10T02:00:00Z' });
  const dayM = person({ id: 'dayM', instagram: 'daym', gender: 'm', gender_pref: 'same', created_at: '2026-09-10T02:01:00Z' });
  const lateF = person({ id: 'lateF', instagram: 'latef', gender: 'f', gender_pref: 'same', created_at: '2026-09-10T08:00:00Z' });

  // (d) 타임①에 같은 조건 여성(dayF)이 있으면 이월자 yes 와 바로 짝이 된다
  const okDay = runDay([dayF], '2026-09-10 14:00', carryRows);
  eq(okDay.slot1.pairs.map((p) => [p.a.id, p.b.id].sort().join('+')), ['dayF+yes'],
    '(d) 이월자가 당일 타임① 참가자와 짝이 된다');

  // (c) 타임①에 남성만 있으면 이월자는 또 미매칭 → 타임②의 lateF 와 짝이 된다
  const spillDay = runDay([dayM, lateF], '2026-09-10 14:00', carryRows);
  eq(spillDay.slot1.unmatched.map((u) => u.person.id).sort(), ['dayM', 'yes'], '(c) 이월자가 당일 타임①에서 또 미매칭');
  eq(spillDay.pool.map((r) => r.id).sort(), ['dayM', 'lateF', 'yes'], '(c) 이월자가 당일 타임② 풀에 나타난다');
  eq(spillDay.slot2.pairs.map((p) => [p.a.id, p.b.id].sort().join('+')), ['lateF+yes'],
    '(c) 이월자가 당일 타임②에서 짝이 된다');
}

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 통과');
process.exit(fail ? 1 : 0);
