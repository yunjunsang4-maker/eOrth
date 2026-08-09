/**
 * 행사 매칭 엔진 (순수 로직 — 네트워크·파일 입출력 없음)
 *
 * 점수 100 = 성향 7축 70 + 희망 국가 겹침 30.
 * 설계: docs/superpowers/specs/2026-08-09-event-mate-matching-design.md §7
 */
import { scoreAxes, makeTypeLabel, DNA_AXES } from '../docs/event-dna.js';

const AXIS_POINTS = 70 / DNA_AXES.length;   // 축당 10점
const COUNTRY_POINTS = 30;

/** 행에 축 점수와 유형 라벨을 붙이고 결정론적 순서로 정렬한다. */
export function preparePeople(rows) {
  return rows
    .map((r) => {
      const scores = scoreAxes(r.answers ?? {});
      return { ...r, scores, label: makeTypeLabel(scores) };
    })
    // 동점일 때 순서가 결과를 가르므로 정렬을 고정한다 — 두 번 돌려도 같은 짝이 나와야 한다
    .sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)) || String(x.id).localeCompare(String(y.id)));
}

/**
 * 나라별 희소성 — 이 행사 참가자 풀 안에서 계산한다.
 * 30명짜리 풀에서는 절반이 일본을 고르는 게 정상이라, 앱의 전체 사용자 기준을 쓰면 의미가 없다.
 */
export function rarityOf(people) {
  const count = new Map();
  for (const p of people) {
    for (const c of new Set(p.wish_countries ?? [])) count.set(c, (count.get(c) ?? 0) + 1);
  }
  const rarity = new Map();
  for (const [c, n] of count) rarity.set(c, 1 / n);
  return rarity;
}

/**
 * 성향 유사도 — 축당 10점.
 * 나누는 값이 100이 아니라 50인 이유: 무작위 두 사람의 축별 평균 차가 약 33이다.
 * 100으로 나누면 아무나 0.67을 받아 변별력이 사라진다.
 */
export function axisScore(a, b) {
  let sum = 0;
  for (const axis of DNA_AXES) {
    const d = Math.abs(a.scores[axis] - b.scores[axis]);
    sum += AXIS_POINTS * Math.max(0, 1 - d / 50);
  }
  return sum;
}

export function countryScore(a, b, rarity, maxRarity) {
  const mine = new Set(a.wish_countries ?? []);
  // b쪽도 중복 제거 — 안 하면 같은 나라를 여러 번 넣은 사람과 겹칠 때 overlap이 부풀려진다
  const shared = [...new Set(b.wish_countries ?? [])].filter((c) => mine.has(c));
  if (shared.length === 0 || !maxRarity) return { score: 0, shared: [] };
  const overlap = shared.reduce((s, c) => s + (rarity.get(c) ?? 0), 0);
  // 가장 희귀한 나라 하나가 겹치면 만점. 흔한 나라는 여러 개 겹쳐야 만점에 닿는다.
  return { score: COUNTRY_POINTS * Math.min(1, overlap / maxRarity), shared };
}

/** 성별 조건 — 한쪽이라도 'same'이면 동성이어야 한다. 양쪽이 모두 만족할 때만 후보다. */
export function isEligible(a, b) {
  if (a.id === b.id) return false;
  const sameGender = a.gender === b.gender;
  if (a.gender_pref === 'same' && !sameGender) return false;
  if (b.gender_pref === 'same' && !sameGender) return false;
  return true;
}

export function pairScore(a, b, rarity, maxRarity) {
  const axis = axisScore(a, b);
  const { score: country, shared } = countryScore(a, b, rarity, maxRarity);
  return { total: Math.round(axis + country), axis, country, shared };
}

/**
 * 짝짓기 — 점수 내림차순 그리디.
 *
 * 최적해(최대가중매칭)를 쓰지 않는 이유: 수십~백 명 규모에서 총점 차이가 몇 % 수준인 데 비해
 * 구현·검증 부담이 크다. 대신 동점은 (created_at, id) 순서로 갈라 항상 같은 결과가 나오게 한다.
 */
export function matchAll(people) {
  const rarity = rarityOf(people);
  const maxRarity = rarity.size ? Math.max(...rarity.values()) : 0;

  const candidates = [];
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i], b = people[j];
      if (!isEligible(a, b)) continue;
      candidates.push({ a, b, ...pairScore(a, b, rarity, maxRarity) });
    }
  }
  // 동점이면 먼저 제출한 사람 쪽이 앞선다 — 입력이 같으면 결과가 항상 같아야 한다
  candidates.sort((x, y) => (y.total - x.total)
    || String(x.a.created_at).localeCompare(String(y.a.created_at))
    || String(x.a.id).localeCompare(String(y.a.id))
    || String(x.b.id).localeCompare(String(y.b.id)));

  const taken = new Set();
  const pairs = [];
  for (const c of candidates) {
    if (taken.has(c.a.id) || taken.has(c.b.id)) continue;
    taken.add(c.a.id); taken.add(c.b.id);
    pairs.push({ a: c.a, b: c.b, score: c.total, shared: c.shared });
  }

  // 남은 사람은 이미 만들어진 짝 중 '양쪽 모두와 성별 조건이 맞는' 최고점 짝에 붙여 3인조로.
  // "짝이 없습니다"를 보내는 것보다 낫고, 성비가 기울면 실제로 발생한다.
  const trios = [];
  const unmatched = [];
  const usedPair = new Set();
  for (const p of people) {
    if (taken.has(p.id)) continue;
    let best = null;
    for (const pair of pairs) {
      if (usedPair.has(pair)) continue;
      if (!isEligible(p, pair.a) || !isEligible(p, pair.b)) continue;
      const s = pairScore(p, pair.a, rarity, maxRarity).total + pairScore(p, pair.b, rarity, maxRarity).total;
      if (!best || s > best.s) best = { pair, s };
    }
    if (best) {
      usedPair.add(best.pair);
      trios.push({ a: best.pair.a, b: best.pair.b, c: p });
      taken.add(p.id);
    } else {
      // 사유를 세 경우로 구분한다 — 뭉뚱그리면 운영자가 "성비가 안 맞았다"로 잘못 결론 낼 수 있다.
      // 실제로는 적격한 상대가 있었는데 그들이 이미 다 다른 사람과 묶여서 자리가 없는 경우일 수 있다.
      const hasEligiblePartner = people.some((q) => q.id !== p.id && isEligible(p, q));
      let reason;
      if (!hasEligiblePartner) {
        // 애초에 이 사람과 성별 조건이 맞는 상대가 한 명도 없었다
        reason = '성별 조건에 맞는 상대가 아무도 없습니다 — 매칭 상대 조건(같은 성별만/상관없음)을 확인하세요.';
      } else if (pairs.length === 0) {
        // 적격 상대는 있었지만 풀 전체에서 짝이 한 쌍도 만들어지지 않았다 — 참가자 수 자체가 부족했다
        reason = '조건에 맞는 상대는 있었지만 참가자 수가 적어 짝이 하나도 만들어지지 않았습니다.';
      } else {
        // 적격 상대도 있었고 짝도 만들어졌지만, 이 사람을 붙일 수 있는 짝은 이미 다른 사람에게 소진됐다
        reason = '조건에 맞는 상대는 있었지만 이미 다른 사람과 짝이 되어 붙을 자리가 남지 않았습니다(성비 문제가 아니라 인원 배치가 소진된 것입니다).';
      }
      unmatched.push({ person: p, reason });
    }
  }
  // 3인조로 승격된 짝은 pairs에서 뺀다 — 안 빼면 같은 사람에게 문구가 두 번 나간다
  return { pairs: pairs.filter((p) => !usedPair.has(p)), trios, unmatched };
}

/** 한 사람에게 보낼 DM 문구. partners는 1명(짝) 또는 2명(3인조). */
export function renderMessage({ me, partners, score, shared, eventName }) {
  const who = partners.map((p) => `@${p.instagram} (${p.name} · ${p.label.ko})`).join('\n');
  const many = partners.length > 1;
  const lines = [
    `${me.name}님, ${eventName} 결과입니다 🌍`,
    ``,
    `${me.name}님의 여행 유형은 "${me.label.ko}"예요.`,
    `매칭된 ${many ? '분들' : '분'} (매칭률 ${score}%):`,
    who,
  ];
  if (shared.length) lines.push(`${many ? '세' : '두'} 분 다 ${shared.join('·')}에 가고 싶다고 하셨어요.`);
  lines.push(``, `서로의 아이디를 양쪽에 모두 보내드렸어요. 편하게 인사 나눠보세요!`);
  return lines.join('\n');
}
