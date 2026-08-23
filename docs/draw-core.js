/**
 * 부스 뽑기 재고 — 순수 로직.
 *
 * 브라우저(docs/draw.html)와 Node(scripts/draw-core.verify.mjs)가 이 파일을 그대로 읽는다.
 * 생성물이 아니다 — 번들 생성물로 두면 "재생성 검사가 항상 통과하는" 함정이 다시 생긴다.
 *
 * 상태는 절대 제자리에서 고치지 않는다. 모든 함수가 새 객체를 돌려준다.
 */

export const STATE_VERSION = 1;

/** 추출 순서 고정 — 가중 추출이 이 순서로 구간을 훑는다 */
export const GRADE_KEYS = ['g1', 'g2', 'g3', 'g4', 'g5', 'miss'];

/**
 * 등급 정의. 등급 차이는 stripe 색 하나로만 낸다 —
 * 등급마다 카드를 다시 칠하면 6종이 서로 다른 앱처럼 보인다.
 */
export const GRADES = {
  g1:   { rank: '1등', cls: 'FIRST CLASS', seat: '01A', stripe: '#FFD9A0',
          prize: '후쿠오카 왕복 항공권', gold: true },
  g2:   { rank: '2등', cls: 'BUSINESS',    seat: '04C', stripe: '#BF85FC',
          prize: '필름카메라' },
  g3:   { rank: '3등', cls: 'PREMIUM',     seat: '12B', stripe: '#9C6BE8',
          prize: '세계 간식 5개 + 스티커' },
  g4:   { rank: '4등', cls: 'ECONOMY',     seat: '27A', stripe: '#A1A1B0',
          prize: '세계 간식 3개 + 스티커' },
  g5:   { rank: '5등', cls: 'BASIC',       seat: '44F', stripe: '#6E6E82',
          prize: '세계 간식 1개 + 스티커' },
  miss: { rank: '꽝',  cls: 'STANDBY',     seat: '---', stripe: '#3A3A48',
          prize: '다음 기회에', isVoid: true },
};

/**
 * 날짜별 초기 재고. 이월 계산을 하지 않는 이유는 D1 데이터가 날아갔을 때
 * 조용히 2명이 당첨되는 것을 막기 위해서다.
 *
 * ⚠️ 1등 항공권은 D2에만 있다(사용자 확정). D1의 g1이 0이라 가중치도 0이고,
 *    첫날 화면에 1등이 나올 수 있는 경로 자체가 없다.
 * ⚠️ miss(꽝)는 아직 미정이라 0이다. 정해지면 이 표만 고치면 된다.
 *    스티커 발주가 정확히 1,000매(여유 0)라 꽝 지급 여부와 함께 정해야 한다.
 */
export const DAY_POOLS = {
  D1: { g1: 0, g2: 1, g3: 50, g4: 150, g5: 300, miss: 0 },
  D2: { g1: 1, g2: 1, g3: 50, g4: 150, g5: 300, miss: 0 },
};

/**
 * 탑승권에 찍히는 날짜와 편명.
 * ⚠️ 행사 날짜가 아직 확정되지 않아 임시값이다. 확정되면 여기만 고친다.
 */
export const EVENT_DAYS = {
  D1: { label: '첫날',   date: '09 SEP 2026', flight: 'EO 0910' },
  D2: { label: '둘째날', date: '10 SEP 2026', flight: 'EO 0911' },
};

export function makePool(day) {
  if (!DAY_POOLS[day]) throw new Error(`정의되지 않은 날짜: ${day}`);
  return { version: STATE_VERSION, day, remaining: { ...DAY_POOLS[day] }, history: [] };
}

export function remaining(state) {
  return { ...state.remaining };
}

export function totalRemaining(state) {
  return GRADE_KEYS.reduce((n, k) => n + (state.remaining[k] || 0), 0);
}

export function isExhausted(state) {
  return totalRemaining(state) === 0;
}

/**
 * 남은 수량을 가중치로 하는 비복원 추출.
 * 소진된 등급은 가중치가 0이라 후보에서 자동으로 빠지므로 별도 확률표가 필요 없다.
 *
 * rand와 now를 주입받는 이유는 검증에서 시드를 고정하기 위해서다.
 */
export function drawOne(state, rand = Math.random, now = Date.now()) {
  if (isExhausted(state)) throw new Error('재고가 모두 소진되어 더 뽑을 수 없습니다');

  const total = totalRemaining(state);
  // rand()가 1을 돌려주는 구현을 대비해 마지막 표로 고정한다 — 안 그러면 grade가 null이 된다
  let ticket = Math.min(Math.floor(rand() * total), total - 1);

  let grade = null;
  for (const k of GRADE_KEYS) {
    const n = state.remaining[k] || 0;
    if (ticket < n) { grade = k; break; }
    ticket -= n;
  }

  return {
    grade,
    state: {
      ...state,
      remaining: { ...state.remaining, [grade]: state.remaining[grade] - 1 },
      history: [...state.history, { at: now, grade }],
    },
  };
}

/** 마지막 1건 되돌리기. 부스에서 오조작은 반드시 생긴다. */
export function undoLast(state) {
  if (!state.history.length) return state;
  const last = state.history[state.history.length - 1];
  return {
    ...state,
    remaining: { ...state.remaining, [last.grade]: (state.remaining[last.grade] || 0) + 1 },
    history: state.history.slice(0, -1),
  };
}

/** 관리자 보정 — 실물이 먼저 떨어졌을 때 해당 등급을 0으로 내린다 */
export function setRemaining(state, grade, n) {
  if (!GRADE_KEYS.includes(grade)) throw new Error(`알 수 없는 등급: ${grade}`);
  if (!Number.isInteger(n) || n < 0) throw new Error(`재고는 0 이상의 정수여야 합니다: ${n}`);
  return { ...state, remaining: { ...state.remaining, [grade]: n } };
}

/** 등급별 발권 수 */
export function tally(state) {
  const out = {};
  for (const h of state.history) out[h.grade] = (out[h.grade] || 0) + 1;
  return out;
}

/**
 * 저장된 상태 복원. 형태가 조금이라도 어긋나면 null을 돌려준다 —
 * 깨진 상태로 부스를 돌리면 재고가 조용히 틀어지고 아무도 못 알아챈다.
 */
export function restore(raw) {
  if (!raw) return null;
  let o;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  if (o.version !== STATE_VERSION) return null;
  if (!DAY_POOLS[o.day]) return null;
  if (!o.remaining || typeof o.remaining !== 'object') return null;
  if (!Array.isArray(o.history)) return null;
  for (const k of Object.keys(o.remaining)) {
    if (!GRADE_KEYS.includes(k)) return null;
    if (!Number.isInteger(o.remaining[k]) || o.remaining[k] < 0) return null;
  }
  // 등급 키가 하나라도 빠지면 거부한다 — 빠진 등급은 0으로 취급돼 재고 수백 개가 조용히 증발한다.
  // 잘린 JSON을 붙여넣는 것이 관리 패널 '상태 붙여넣기'의 가장 흔한 오사용이다.
  if (!GRADE_KEYS.every((k) => k in o.remaining)) return null;
  // 이력 항목의 형태까지 본다. 항목이 깨져 있으면 undoLast가 remaining에 'undefined' 키를 만들고,
  // 그 오염된 상태가 저장된 뒤 다음 새로고침에서 통째로 버려진다(그날 재고와 이력이 전부 사라진다).
  for (const h of o.history) {
    if (!h || typeof h !== 'object') return null;
    if (typeof h.at !== 'number') return null;
    if (!GRADE_KEYS.includes(h.grade)) return null;
  }
  return o;
}
