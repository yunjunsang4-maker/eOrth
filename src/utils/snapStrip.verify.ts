/**
 * snapStrip 검증 — node node_modules/tsx/dist/cli.mjs src/utils/snapStrip.verify.ts
 */
import { putMineFirst, groupSnapRings } from './snapStrip';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

type S = { id: string; mine?: boolean };
const isMine = (s: S) => s.mine === true;

// 경계 — 빈 배열·내 항목 없음은 순서 그대로
eq(putMineFirst<S>([], isMine), [], '빈 배열 → 빈 배열');
eq(putMineFirst<S>([{ id: 'a' }, { id: 'b' }], isMine).map((s) => s.id), ['a', 'b'], '내 항목 없음 → 순서 유지');

// 정상 — 내 항목이 중간에 있으면 맨 앞으로, 나머지 상대 순서 유지
eq(putMineFirst<S>([{ id: 'a' }, { id: 'me', mine: true }, { id: 'b' }], isMine).map((s) => s.id), ['me', 'a', 'b'], '중간의 내 항목 → 맨 앞');
eq(putMineFirst<S>([{ id: 'me', mine: true }, { id: 'a' }], isMine).map((s) => s.id), ['me', 'a'], '이미 맨 앞 → 그대로');
eq(putMineFirst<S>([{ id: 'a' }, { id: 'b' }, { id: 'me', mine: true }], isMine).map((s) => s.id), ['me', 'a', 'b'], '맨 뒤의 내 항목 → 맨 앞');

// 내 항목 2개(나라별 대표) — 첫 번째만 이동, 두 번째는 제자리(다른 항목과의 상대 순서 유지)
eq(putMineFirst<S>([{ id: 'a' }, { id: 'me1', mine: true }, { id: 'b' }, { id: 'me2', mine: true }], isMine).map((s) => s.id),
  ['me1', 'a', 'b', 'me2'], '내 항목 2개(rank 없음) → 첫 번째만 앞으로');

// rank(timestamp) — 모두 열람 상태면 snapItems가 오래된 순이라, 배열 첫 번째가 아니라 가장 최신 내 항목이 앞에 와야 한다(QA F-1)
type R = S & { ts?: number };
const rank = (s: R) => s.ts ?? 0;
eq(putMineFirst<R>([{ id: 'me-old', mine: true, ts: 1 }, { id: 'a', ts: 2 }, { id: 'me-new', mine: true, ts: 3 }], isMine, rank).map((s) => s.id),
  ['me-new', 'me-old', 'a'], 'rank 있음 → 가장 최신 내 항목이 앞, 나머지 순서 유지');
eq(putMineFirst<R>([{ id: 'me1', mine: true, ts: 5 }, { id: 'me2', mine: true, ts: 5 }], isMine, rank).map((s) => s.id),
  ['me1', 'me2'], 'rank 동점 → 먼저 나온 것 유지');
eq(putMineFirst<R>([{ id: 'a' }, { id: 'me', mine: true }], isMine, rank).map((s) => s.id),
  ['me', 'a'], 'rank 있고 timestamp 없음(0) → 그래도 앞으로');

// 원본 불변 — 화면 useMemo 결과를 다른 곳에서도 쓰므로 mutate하면 안 된다
const src: S[] = [{ id: 'a' }, { id: 'me', mine: true }];
putMineFirst(src, isMine);
eq(src.map((s) => s.id), ['a', 'me'], '입력 배열은 그대로');

// ─────────────────────────────────────────────────────────────
// groupSnapRings — 여행 단위 묶음 + 거주지 '일상' 링 (설계 §6)
// ─────────────────────────────────────────────────────────────
type Snap = {
  id: string;
  user: { handle: string };
  timestamp: number;
  countryName?: string;
  regionName?: string;
  tripGroupId?: string | null;
  snapDaily?: boolean;
  unviewed?: boolean;
};
const DAY = 24 * 60 * 60 * 1000;
const unviewed = (s: Snap) => s.unviewed === true;
const ids = (rings: { id: string }[]) => rings.map((r) => r.id);
const snap = (o: Partial<Snap> & { id: string }): Snap => ({
  user: { handle: 'me' }, timestamp: 0, countryName: '대한민국', ...o,
});

// 경계 — 빈 배열
eq(groupSnapRings<Snap>([], unviewed), [], 'groupSnapRings: 빈 배열 → 빈 배열');

// 키 ① 여행 카드 — 같은 나라라도 카드가 다르면 다른 링, 같은 카드면 한 링
eq(ids(groupSnapRings<Snap>([
  snap({ id: 'a1', timestamp: 10, tripGroupId: 'g1' }),
  snap({ id: 'a2', timestamp: 20, tripGroupId: 'g1' }),
  snap({ id: 'b1', timestamp: 30, tripGroupId: 'g2' }),
], unviewed)), ['a2', 'b1'], 'tripGroupId: 같은 카드는 한 링(대표=최신), 다른 카드는 별도 링');

// 키 ② 일상 — tripGroupId가 있어도 snapDaily가 이긴다(일상은 여행이 아니다)
eq(ids(groupSnapRings<Snap>([
  snap({ id: 'd1', timestamp: 10, snapDaily: true, tripGroupId: 'g1' }),
  snap({ id: 'd2', timestamp: 20, snapDaily: true }),
], unviewed)), ['d2'], 'snapDaily: tripGroupId가 있어도 일상 링 하나로 합쳐짐');

// 키 ③ 폴백 — tripGroupId·snapDaily 둘 다 없으면 작성자+나라+지역
eq(ids(groupSnapRings<Snap>([
  snap({ id: 'f1', timestamp: 10, regionName: '서울' }),
  snap({ id: 'f2', timestamp: 20, regionName: '부산' }),
  snap({ id: 'f3', timestamp: 30, countryName: '일본' }),
], unviewed)), ['f1', 'f2', 'f3'], '폴백: 지역·나라가 다르면 각각 다른 링');

// 7일 경계 — 정확히 7일은 같은 묶음, 초과하면 분리 (재방문이 한 원에 합쳐지던 증상)
eq(ids(groupSnapRings<Snap>([
  snap({ id: 'g0', timestamp: 0 }),
  snap({ id: 'g7', timestamp: 7 * DAY }),
], unviewed)), ['g7'], '폴백 7일 경계: 정확히 7일 간격 → 같은 묶음(대표=최신)');
eq(ids(groupSnapRings<Snap>([
  snap({ id: 'h0', timestamp: 0 }),
  snap({ id: 'h8', timestamp: 7 * DAY + 1 }),
], unviewed)), ['h0', 'h8'], '폴백 7일 경계: 7일 초과 → 새 묶음');
// 간격은 직전 스냅 기준 — 하루씩 이어지면 총 10일이라도 한 묶음
eq(ids(groupSnapRings<Snap>([
  snap({ id: 'i0', timestamp: 0 }),
  snap({ id: 'i5', timestamp: 5 * DAY }),
  snap({ id: 'i10', timestamp: 10 * DAY }),
], unviewed)), ['i10'], '폴백 간격은 직전 스냅 기준 — 10일짜리 연속 여행도 한 묶음');

// 대표 = 묶음 안 최신 (입력 순서가 뒤섞여 있어도)
eq(ids(groupSnapRings<Snap>([
  snap({ id: 'j-new', timestamp: 99, tripGroupId: 'g1' }),
  snap({ id: 'j-old', timestamp: 1, tripGroupId: 'g1' }),
], unviewed)), ['j-new'], '대표 = 묶음 안 최신 스냅');

// _hasUnviewed — 묶음 안 어느 하나라도 안 봤으면 true
eq(groupSnapRings<Snap>([
  snap({ id: 'k1', timestamp: 10, tripGroupId: 'g1', unviewed: true }),
  snap({ id: 'k2', timestamp: 20, tripGroupId: 'g1' }),
], unviewed).map((r) => r._hasUnviewed), [true], '_hasUnviewed: 묶음 안 하나라도 안 봤으면 true');
// 안 본 스냅이 첫 원소가 아닐 때 — OR 집계(갱신 분기)를 지우면 이 줄이 깨진다(QA F2 뮤테이션 탈출 방지)
eq(groupSnapRings<Snap>([
  snap({ id: 'k3', timestamp: 30, tripGroupId: 'g2' }),
  snap({ id: 'k4', timestamp: 20, tripGroupId: 'g2', unviewed: true }),
], unviewed).map((r) => r._hasUnviewed), [true], '_hasUnviewed: 대표가 아닌 뒤 원소만 안 봤어도 true');

// 일상 링은 항상 여행 링 뒤 — 일상이 더 최신이어도
eq(ids(groupSnapRings<Snap>([
  snap({ id: 'daily', timestamp: 100, snapDaily: true }),
  snap({ id: 'trip', timestamp: 10, tripGroupId: 'g1' }),
], unviewed)), ['trip', 'daily'], '일상 링은 더 최신이어도 여행 링 뒤');

// 남의 일상도 뒤 — 일상 판정은 작성자와 무관하다
eq(ids(groupSnapRings<Snap>([
  snap({ id: 'other-daily', user: { handle: 'other' }, timestamp: 100, snapDaily: true }),
  snap({ id: 'my-trip', timestamp: 10, tripGroupId: 'g1' }),
], unviewed)), ['my-trip', 'other-daily'], '남의 일상 링도 여행 링 뒤');

// 일상 링끼리 — 안 본 것 먼저, 그 다음 오래된 순
eq(ids(groupSnapRings<Snap>([
  snap({ id: 'dA', user: { handle: 'a' }, timestamp: 10, snapDaily: true }),
  snap({ id: 'dB', user: { handle: 'b' }, timestamp: 20, snapDaily: true, unviewed: true }),
  snap({ id: 'dC', user: { handle: 'c' }, timestamp: 5, snapDaily: true }),
], unviewed)), ['dB', 'dC', 'dA'], '일상 링: 안 본 것 먼저, 그 다음 오래된 순');

// 여행 링 기존 규칙 — 안 본 게 하나라도 있으면 등장 순 유지
eq(ids(groupSnapRings<Snap>([
  snap({ id: 't-new', timestamp: 100, tripGroupId: 'g1' }),
  snap({ id: 't-old', user: { handle: 'b' }, timestamp: 1, tripGroupId: 'g2', unviewed: true }),
], unviewed)), ['t-new', 't-old'], '여행 링: 안 본 게 있으면 등장 순 유지(기존 동작)');
// 전부 봤으면 오래된 순으로 재정렬
eq(ids(groupSnapRings<Snap>([
  snap({ id: 't2-new', timestamp: 100, tripGroupId: 'g1' }),
  snap({ id: 't2-old', user: { handle: 'b' }, timestamp: 1, tripGroupId: 'g2' }),
], unviewed)), ['t2-old', 't2-new'], '여행 링: 전부 봤으면 오래된 순');

// 같은 카드 id라도 작성자가 다르면 다른 링 — 카드 id는 기기 로컬 생성이라 충돌 가능
eq(ids(groupSnapRings<Snap>([
  snap({ id: 'p1', user: { handle: 'a' }, timestamp: 10, tripGroupId: 'g1', unviewed: true }),
  snap({ id: 'p2', user: { handle: 'b' }, timestamp: 20, tripGroupId: 'g1', unviewed: true }),
], unviewed)), ['p1', 'p2'], '같은 tripGroupId라도 작성자가 다르면 다른 링');

// 널 계열 — tripGroupId가 null/undefined면 폴백으로 떨어진다
eq(ids(groupSnapRings<Snap>([
  snap({ id: 'n1', timestamp: 0, tripGroupId: null }),
  snap({ id: 'n2', timestamp: 1, tripGroupId: undefined }),
], unviewed)), ['n2'], 'tripGroupId null/undefined → 폴백 묶음(같은 나라·지역·7일 내라 한 링)');

// '내 여행 링 없음' 조합 — 여행 링은 남의 것뿐이고 내 일상은 뒤에 남는다(자리표시 배치의 전제)
eq(groupSnapRings<Snap>([
  snap({ id: 'mine-daily', timestamp: 50, snapDaily: true }),
  snap({ id: 'other-trip', user: { handle: 'other' }, timestamp: 10, tripGroupId: 'g9', unviewed: true }),
], unviewed).map((r) => `${r.id}:${r._isDaily}`),
  ['other-trip:false', 'mine-daily:true'], '내 여행 링이 없으면 내 일상 링은 뒤에 남는다');

// 원본 불변 — 화면 useMemo 결과를 다른 곳에서도 쓰므로 mutate하면 안 된다
const gsrc: Snap[] = [snap({ id: 'z1', timestamp: 2 }), snap({ id: 'z2', timestamp: 1 })];
groupSnapRings(gsrc, unviewed);
eq(ids(gsrc), ['z1', 'z2'], 'groupSnapRings: 입력 배열은 그대로');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
