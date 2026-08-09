// 매칭 엔진 검증. 여기서 틀리면 엉뚱한 사람에게 남의 인스타 아이디가 발송된다.
import {
  preparePeople, rarityOf, axisScore, countryScore, isEligible, pairScore, matchAll, renderMessage,
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

// ── 성별 조건: 양쪽이 모두 만족해야 한다 ──
{
  const f_same = person({ gender: 'f', gender_pref: 'same' });
  const f_any = person({ gender: 'f', gender_pref: 'any' });
  const m_any = person({ gender: 'm', gender_pref: 'any' });
  const m_same = person({ gender: 'm', gender_pref: 'same' });
  eq(isEligible(f_same, f_any), true, '여-same ↔ 여-any: 동성이라 성립');
  eq(isEligible(f_same, m_any), false, '여-same ↔ 남-any: 한쪽이 same이면 이성 불가');
  eq(isEligible(f_any, m_any), true, '둘 다 any면 이성도 성립');
  eq(isEligible(m_same, f_same), false, 'same끼리라도 이성이면 불가');
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
  eq(typeof unmatched[0].reason, 'string', '사유 문구 존재');
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

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 통과');
process.exit(fail ? 1 : 0);
