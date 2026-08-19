// 매칭 엔진 검증. 여기서 틀리면 엉뚱한 사람에게 남의 인스타 아이디가 발송된다.
import {
  preparePeople, rarityOf, axisScore, countryScore, isEligible, pairScore, matchAll, renderMessage,
  kstToMs, splitByBoundary, slot2Pool,
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

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 통과');
process.exit(fail ? 1 : 0);
