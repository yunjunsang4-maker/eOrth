// docs/event-dna.js(생성물) 검증 — npm test가 실행한다.
// 생성기를 고쳤을 때 14문항 규칙과 채점 결과가 조용히 바뀌는 것을 막는다.
import {
  EVENT_QUESTIONS, DNA_AXES, DNA_LABELS, COUNTRIES,
  scoreAxes, makeTypeLabel, isValidDna, normalizeInstagram,
} from '../docs/event-dna.js';

let fail = 0;
const eq = (got, want, msg) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? '✓' : '✗'} ${msg}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) fail++;
};
const truthy = (v, msg) => eq(Boolean(v), true, msg);

console.log('event-dna 번들');

// ── 문항 ──
eq(EVENT_QUESTIONS.length, 14, '문항 14개');
eq(EVENT_QUESTIONS.every((q) => q.weight === 2), true, '전부 weight 2');
for (const axis of DNA_AXES) {
  eq(EVENT_QUESTIONS.filter((q) => q.axis === axis).length, 2, `${axis} 축 2문항`);
}
eq(EVENT_QUESTIONS.map((q) => q.id), [1, 5, 6, 10, 11, 15, 16, 17, 21, 24, 26, 27, 31, 32], '문항 id·순서');
truthy(EVENT_QUESTIONS.every((q) => q.ko.s && q.ko.a && q.ko.b), '한국어 문구 존재');

// ── 채점: 14문항만 답해도 수축(conf) 때문에 극단으로 안 간다 ──
const allB = Object.fromEntries(EVENT_QUESTIONS.map((q) => [q.id, 'B']));
const allA = Object.fromEntries(EVENT_QUESTIONS.map((q) => [q.id, 'A']));
// plan 축: 앱 전체 가중치 7(2+1+1+1+2), 여기서 답한 가중치 4 → conf 4/7
eq(scoreAxes(allB).plan, 79, '전부 B → plan 79 (100이 아니라 수축된 값)');
eq(scoreAxes(allA).plan, 21, '전부 A → plan 21');
// company 축만 문항이 6개(31~36)라 전체 가중치가 8 → conf 4/8 = 0.5
eq(scoreAxes(allB).company, 75, '전부 B → company 75 (축마다 conf가 다르다)');
eq(scoreAxes({}).plan, 50, '무응답 → 50 중립');
eq(isValidDna(allB), true, '14문항이면 모든 축에 답이 있다 → 유효');

// ── 라벨: 같은 응답에 항상 같은 결과 ──
const label = makeTypeLabel(scoreAxes(allB));
eq(makeTypeLabel(scoreAxes(allB)), label, '라벨 결정론');
truthy(label.ko.length > 0, '라벨 한국어 문구');
eq(makeTypeLabel(Object.fromEntries(DNA_AXES.map((a) => [a, 50]))).key, 'neutral', '전부 중립 → 폴백 라벨');

// ── 나라 ──
// 실제 COUNTRIES는 198개(2026-08-09 기준) — 정확한 개수가 아니라 목록이 통째로
// 비어버리는 회귀만 잡으면 되므로 여유 있는 하한선을 쓴다.
truthy(COUNTRIES.length > 150, `나라 목록 ${COUNTRIES.length}개`);
truthy(COUNTRIES.every((c) => c.name && c.flag && c.term), '나라 항목 필드');

// ── 인스타 아이디 정규화 ──
eq(normalizeInstagram('@Travel_Kim'), 'travel_kim', '@ 제거 + 소문자');
eq(normalizeInstagram('  travel.kim  '), 'travel.kim', '공백 제거');
eq(normalizeInstagram('https://www.instagram.com/travel_kim/'), 'travel_kim', 'URL에서 아이디 추출');
eq(normalizeInstagram('여행김'), null, '한글은 거부');
eq(normalizeInstagram('a'.repeat(31)), null, '31자는 거부');
eq(normalizeInstagram(''), null, '빈 값은 거부');
eq(normalizeInstagram('kim@gmail.com'), null, '이메일은 거부');

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 통과');
process.exit(fail ? 1 : 0);
