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
      // `...r`이라 서버 행의 컬럼(intro 등)이 그대로 person에 실린다 — 필드를 골라 담지 않는다
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

/**
 * 성별 조건 — 'same'은 동성만, 'opposite'는 이성만, 'any'는 무관.
 * 한쪽의 조건만 맞아서는 안 되고, 양쪽이 모두 만족할 때만 후보다.
 * (모르는 값이 들어오면 'any'처럼 통과한다 — 제약은 DB의 check가 맡는다.)
 */
export function isEligible(a, b) {
  if (a.id === b.id) return false;
  const sameGender = a.gender === b.gender;
  if (a.gender_pref === 'same' && !sameGender) return false;
  if (b.gender_pref === 'same' && !sameGender) return false;
  if (a.gender_pref === 'opposite' && sameGender) return false;
  if (b.gender_pref === 'opposite' && sameGender) return false;
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
        reason = '성별 조건에 맞는 상대가 아무도 없습니다 — 매칭 상대 조건(같은 성별만/무관/이성만)을 확인하세요.';
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

// ============================================================
// 타임(슬롯) 분리 — 행사를 두 타임으로 끊어 각각 매칭할 때 쓴다.
// 서버에는 아무것도 추가하지 않는다. created_at 하나로 갈린다.
// ============================================================

/**
 * KST(UTC+9, 서머타임 없음) 벽시계 문자열 → UTC 밀리초.
 *
 * `new Date('2026-09-10 14:00')`은 **실행 머신의 시간대로** 해석된다. created_at은 UTC로
 * 저장되므로, 그대로 비교하면 9시간이 어긋나 '오전 참가자가 오후 타임에 통째로 섞이는'
 * 형태로 조용히 틀린다. 그래서 Date.UTC로 직접 만들고 9시간을 뺀다 — 머신 시간대와 무관하다.
 * 형식이 틀리면 null을 돌려준다(호출부가 안내하고 멈춘다).
 */
export function kstToMs(text) {
  const m = String(text ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  // Date.UTC는 범위를 넘겨도 조용히 다음 달·다음 날로 넘어간다 — 오타를 통과시키지 않도록 먼저 막는다
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return Date.UTC(y, mo - 1, d, h, mi) - 9 * 60 * 60 * 1000;
}

/**
 * created_at 기준으로 경계 앞(before)과 뒤(after)를 가른다. **경계 시각 자체는 after에 들어간다.**
 * created_at이 없거나 깨진 행은 어느 타임인지 판정할 수 없으므로 따로 돌려준다 —
 * 조용히 버리면 그 사람만 어느 리포트에도 안 나오고 아무도 눈치채지 못한다.
 */
export function splitByBoundary(rows, boundaryMs) {
  const before = [], after = [], undated = [];
  for (const r of rows ?? []) {
    const t = r.created_at ? Date.parse(r.created_at) : NaN;
    if (Number.isNaN(t)) undated.push(r);
    else if (t < boundaryMs) before.push(r);
    else after.push(r);
  }
  return { before, after, undated };
}

/**
 * **하한(포함) 이전 행을 매칭 풀에서 통째로 뺀다.** 반환: `{ kept, dropped, undated }`.
 *
 * 왜 필요한가 — `splitByBoundary`만으로는 **이틀짜리 행사에서 반드시 사고가 난다.**
 * `--slot 1 --boundary "2026-09-10 14:00"`은 "경계 이전 전부"를 타임①로 잡으므로,
 * 2일차 오후에 돌리면 **1일차 참가자 전원이 다시 풀에 들어온다.** 그러면 이미 짝을 받아
 * 발송까지 끝난 사람에게 문구가 두 번 나가고, 서로 다른 두 상대에게 같은 사람의 인스타
 * 아이디가 각각 전달된다(이 프로젝트에서 가장 비싼 실패). 행사 전에 넣어 본 실기기 테스트
 * 제출도 같은 경로로 당일 풀에 섞인다 — `--exclude`로 아이디를 하나씩 적는 것보다
 * "이 시각 이후만"이 훨씬 안전하다.
 *
 * created_at 파싱은 `splitByBoundary`와 **동일한 방식**이다(`Date.parse`) — created_at은
 * UTC ISO 문자열이라 그게 맞다. 하한 값 자체(fromMs)는 KST 벽시계 문자열을 `kstToMs`로
 * 바꿔서 넘긴다. `new Date('2026-09-10 00:00')`을 쓰면 머신 시간대로 해석돼 9시간 어긋난다.
 *
 * created_at이 없거나 깨진 행은 버리지 않고 따로 돌려준다 — `splitByBoundary`의 undated와
 * 같은 철학이다. 조용히 버리면 그 사람만 어느 리포트에도 안 나오고 아무도 눈치채지 못한다.
 */
export function filterFrom(rows, fromMs) {
  const kept = [], dropped = [], undated = [];
  for (const r of rows ?? []) {
    const t = r.created_at ? Date.parse(r.created_at) : NaN;
    if (Number.isNaN(t)) undated.push(r);
    else if (t < fromMs) dropped.push(r);   // 하한 시각 정각은 포함이다(kept)
    else kept.push(r);
  }
  return { kept, dropped, undated };
}

/**
 * 타임② 풀 = 타임② 참가자 + **타임① 미매칭자**.
 *
 * 타임①에서 이미 짝이 된 사람은 절대 다시 넣지 않는다 — 넣으면 그 사람에게 문구가 두 번 나가고,
 * 서로 다른 두 상대에게 같은 사람의 아이디가 각각 전달된다(이 프로젝트에서 가장 비싼 실패).
 * 타임① 매칭은 결정론이라 여기서 다시 계산해도 실제로 발송했던 결과와 같다 —
 * 그래서 "누구를 이미 보냈는지" 상태 파일을 들고 다닐 필요가 없다.
 */
export function slot2Pool(beforeRows, afterRows) {
  const first = matchAll(preparePeople(beforeRows ?? []));
  const carriedIds = new Set(first.unmatched.map((u) => u.person.id));
  const carried = (beforeRows ?? []).filter((r) => carriedIds.has(r.id));
  return { pool: [...(afterRows ?? []), ...carried], carried };
}

// ============================================================
// 다음 날 조건부 이월 — **상태 파일 방식**.
//
// 이전 구현(prevDayCarry)은 전날 창의 행으로 전날 매칭을 다시 계산했다. 그 방식은
// "전날 재계산 = 전날 실제 발송 결과"라는 전제 위에 서 있었는데, **그 전제가 거짓이었다.**
// INSERT 정책은 행사 마지막 날 18시까지 열려 있고 부스 QR도 살아 있어서, 1일차 타임②를
// 실행한 18:05 이후에도 자정까지 약 6시간 동안 지각 제출이 계속 들어온다. 그 한 건이
// 전날 풀에 섞이면 짝 구성이 바뀌어,
//   · 이미 짝을 받아 **발송까지 끝난 사람이 미매칭으로 뒤집혀 다음 날 다시 카드로 나오거나**
//     (이 프로젝트가 "가장 비싼 실패"로 규정한 중복 발송 — QA fixture로 실제 재현됨)
//   · 진짜 미매칭 동의자가 재계산에선 짝 성립으로 판정돼 **조용히 이월에서 누락**된다.
// 같은 날 타임①→② 이월(slot2Pool)에는 이 함정이 없다 — `before`는 `created_at < boundary`라
// 나중에 행이 늘어날 수 없다. **전날 창만 위쪽이 열려 있었다.**
//
// 그래서 재계산을 버리고, 타임② 실행이 **그 순간의 명단을 파일로 확정**해 다음 날이 그걸
// 그대로 읽는다. 파일이 곧 "그때 실제로 보낸 결과"이므로 지각 제출도 exclude 차이도
// 결과를 바꾸지 못한다.
// ============================================================

/**
 * 그날 **최종 미매칭자 중 `carry_next_day === true`인 사람의 원본 행**을 고른다.
 *
 * `=== true`로 엄격히 본다 — 컬럼이 없던 시절의 옛 행은 `undefined`이고 그건 "동의 안 함"이다.
 * 느슨하게 보면 값이 없는 사람이 전원 이월돼 정반대 결과가 된다.
 *
 * `unmatched`의 원소는 `preparePeople`을 거친 사람(scores·label이 붙어 있다)이라
 * 그대로 저장하면 파일에 계산 결과가 섞인다. `poolRows`에서 **원본 행**을 되찾아 담는다.
 */
export function selectCarryRows(unmatched, poolRows) {
  const byId = new Map((poolRows ?? []).map((r) => [r.id, r]));
  const out = [];
  for (const u of unmatched ?? []) {
    const row = byId.get(u?.person?.id);
    if (row && row.carry_next_day === true) out.push(row);
  }
  return out;
}

/**
 * 이월 파일 내용을 만든다.
 *
 * **시각(Date.now)을 절대 넣지 않는다.** 같은 인자로 다시 돌리면 내용이 바이트까지 같아야
 * "명단이 달라졌다"를 탐지할 수 있다. 생성 시각을 넣으면 매 실행이 달라져 그 탐지가 죽는다.
 * 파일의 신원은 시각이 아니라 `day`(= `--from`의 날짜)다 — 재실행해도 파일명이 갈리지 않는다.
 */
export function buildCarryFile({ event, day, from, boundary, exclude, rows }) {
  const list = rows ?? [];
  return {
    version: 1,
    event: event ?? null,
    day,
    from,
    boundary: boundary ?? null,
    exclude: exclude ?? '',
    count: list.length,
    rows: list,
  };
}

/**
 * 두 이월 파일이 **같은 명단·같은 실행 창**인지 비교할 지문.
 *
 * 키 순서나 행 순서에 흔들리면 안 된다(정렬은 결정론이지만 지문까지 거기 기대지 않는다).
 * 이 지문이 다르면 "리포트만 다시 뽑으려던 재실행이 실제로는 다른 명단을 덮어쓰려 한다"는
 * 뜻이므로 호출부가 멈춘다.
 */
export function carrySignature(payload) {
  const ids = (payload?.rows ?? []).map((r) => r?.id).sort();
  return JSON.stringify({
    day: payload?.day ?? null,
    from: payload?.from ?? null,
    boundary: payload?.boundary ?? null,
    exclude: payload?.exclude ?? '',
    ids,
  });
}

/**
 * 이월 파일의 행을 당일 풀에 합친다.
 *
 * 같은 id가 이미 당일 풀에 있으면 넣지 않는다 — 넣으면 한 사람이 두 번 매칭돼
 * 자기 자신과 짝이 되거나 카드가 둘 나온다. (유니크 인덱스가 `(event_code, instagram)`이라
 * 정상 경로에선 안 겹치지만, 파일을 잘못 준 실수까지 여기서 막는다.)
 */
export function mergeCarryRows(dayRows, carryRows) {
  const seen = new Set((dayRows ?? []).map((r) => r.id));
  const merged = [...(dayRows ?? [])];
  const added = [];
  const skipped = [];
  for (const r of carryRows ?? []) {
    if (seen.has(r.id)) { skipped.push(r); continue; }
    seen.add(r.id);
    merged.push(r);
    added.push(r);
  }
  return { merged, added, skipped };
}

/**
 * 한 사람에게 보낼 DM 문구. partners는 1명(짝) 또는 2명(3인조).
 * meetNow=true는 **행사 당일에 보내는 경우**다(타임①=행사 중, 타임②=18시 종료 직후) —
 * 그때만 지금 만나라고 한다. 며칠 지난 뒤 이 문장이 나가면 없는 자리로 오라고 부르는 셈이 된다.
 */
export function renderMessage({ me, partners, score, shared, eventName, meetNow = false }) {
  // 자기소개는 선택 입력이라 안 쓴 사람이 많다(null·빈 문자열·공백만). 있을 때만 아랫줄에 붙인다 —
  // 무조건 붙이면 빈 따옴표("")만 있는 줄이 상대에게 그대로 발송된다.
  const who = partners.map((p) => {
    const line = `@${p.instagram} (${p.name} · ${p.label.ko})`;
    const intro = String(p.intro ?? '').trim();
    return intro ? `${line}\n  "${intro}"` : line;
  }).join('\n');
  const many = partners.length > 1;
  const lines = [
    `${me.name}님, ${eventName} 결과입니다 🌍`,
    ``,
    `${me.name}님의 여행 유형은 "${me.label.ko}"예요.`,
    `매칭된 ${many ? '분들' : '분'} (매칭률 ${score}%):`,
    who,
  ];
  if (shared.length) lines.push(`${many ? '세' : '두'} 분 다 ${shared.join('·')}에 가고 싶다고 하셨어요.`);
  lines.push(``, `서로의 아이디를 양쪽에 모두 보내드렸어요.`);
  lines.push(meetNow
    ? `아직 행사장에 계시다면 지금 바로 인사 나눠보세요! 🙌`
    : `편하게 인사 나눠보세요!`);
  return lines.join('\n');
}
