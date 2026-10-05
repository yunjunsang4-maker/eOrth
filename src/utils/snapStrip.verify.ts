/**
 * snapStrip 검증 — node node_modules/tsx/dist/cli.mjs src/utils/snapStrip.verify.ts
 */
import { putMineFirst, groupSnapRings, isSnapTripOngoing, snapRingKeys, orderSnapStrip, pickRetroDailySnapIds,
  shouldRunRetroDaily, pickStrayDailySnapIds, pickCardsEmptiedByDetach, restoreRetroDailyDone, planRetroDetach } from './snapStrip';

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

// ─────────────────────────────────────────────────────────────
// isSnapTripOngoing — 내 여행 링 + 배지 조건(카드 날짜 범위 ±1일, 2026-09-27)
// ─────────────────────────────────────────────────────────────
// now는 2026-09-27 정오(로컬) 고정 — 판정이 로컬 자정으로 내리므로 시각은 결과에 영향이 없어야 한다
const NOW = new Date(2026, 8, 27, 12, 0).getTime();
const recs = [
  { id: 'us1', startDate: '2026.05.01', endDate: '2026.05.10' }, // 끝난 미국 여행
  { id: 'now1', date: '2026.09.25' }, { id: 'now2', startDate: '2026.09.26', endDate: '2026.09.28' }, // 오늘 포함
  { id: 'e1', date: '2026.09.26' }, // 어제 끝남
  { id: 'e2', date: '2026.09.25' }, // 그저께 끝남
];
const cards = [
  { id: 'us', records: ['us1'] },
  { id: 'now', records: ['now1', 'now2'] },
  { id: 'end1', records: ['e1'] },
  { id: 'end2', records: ['e2'] },
  { id: 'stay', records: ['us1'], stay: { status: 'active' } }, // 기록 날짜는 옛날이어도 체류 진행 중
  { id: 'stayEnded', records: ['now1'], stay: { status: 'ended' } }, // 체류 끝 → 날짜 규칙으로 떨어짐
  { id: 'stayPaused', records: ['us1'], stay: { status: 'paused' } }, // 체류 중 귀국 → 날짜 규칙(5월) → 끝
];
const ongo = (rep: { id: string; tripGroupId?: string | null; timestamp?: number; date?: string }) =>
  isSnapTripOngoing(rep, cards, recs, NOW);

// 원래 증상 — 몇 달 전 끝난 여행 링에는 배지가 붙으면 안 된다
eq(ongo({ id: 's', tripGroupId: 'us' }), false, '진행 중: 끝난 과거 여행(5월) → false');
eq(ongo({ id: 's', tripGroupId: 'now' }), true, '진행 중: 카드 기간이 오늘 포함 → true');
// 1일 여유 경계 — 종료 다음날은 진행 중, 이틀 뒤는 끝
eq(ongo({ id: 's', tripGroupId: 'end1' }), true, '진행 중: 종료 다음날 → true(1일 여유)');
eq(ongo({ id: 's', tripGroupId: 'end2' }), false, '진행 중: 종료 이틀 뒤 → false');
// 체류 카드는 날짜와 무관하게 status로
eq(ongo({ id: 's', tripGroupId: 'stay' }), true, '진행 중: 체류 active(기록은 옛날) → true');
// 체류 ended면 날짜 규칙 — now1(9/25)은 이틀 전이라 false. 'ended' 분기를 지우면 여기서 true로 깨진다
eq(ongo({ id: 's', tripGroupId: 'stayEnded' }), false, '진행 중: 체류 ended → 날짜 규칙(이틀 전) → false');
eq(ongo({ id: 's', tripGroupId: 'stayPaused' }), false, '진행 중: 체류 paused(귀국 중) → 날짜 규칙 → false');
// 카드 없음(tripGroupId 없는 옛 스냅·편입 실패) → 대표 스냅 timestamp
eq(ongo({ id: 's', timestamp: new Date(2026, 8, 27, 9, 0).getTime() }), true, '진행 중: 카드 없음 + 오늘 timestamp → true');
eq(ongo({ id: 's', tripGroupId: 'gone', timestamp: new Date(2026, 8, 20).getTime() }), false, '진행 중: 카드 id가 목록에 없음 + 1주 전 timestamp → false');
// 카드는 있는데 기록 날짜가 비었으면 대표 스냅 자신의 date로
eq(isSnapTripOngoing({ id: 's', tripGroupId: 'x', date: '2026.09.27' }, [{ id: 'x', records: ['missing'] }], recs, NOW),
  true, '진행 중: 카드 기간 null → 대표 스냅 date(오늘) → true');
// 널 계열 — 날짜 근거가 전혀 없으면 끝난 것으로(옛 증상 쪽으로 넘어지지 않게)
eq(ongo({ id: 's' }), false, '진행 중: 카드·date·timestamp 전부 없음 → false');
eq(ongo({ id: 's', tripGroupId: null, timestamp: 0 }), false, '진행 중: tripGroupId null + timestamp 0 → false');

// ─────────────────────────────────────────────────────────────
// snapRingKeys / _ringKey — 스냅 뷰어가 링과 같은 묶음을 재생하는 근거(2026-09-29)
// ─────────────────────────────────────────────────────────────
// 키 형식 3종 — 뷰어는 이 키로 스토리를 묶으므로 형식이 바뀌면 링과 뷰어가 함께 바뀌어야 한다
eq(snapRingKeys([
  snap({ id: 'k-d', snapDaily: true, tripGroupId: 'g1' }),
  snap({ id: 'k-t', tripGroupId: 'g1' }),
  snap({ id: 'k-f', regionName: '서울' }),
]), ['me::daily', 'me::trip:g1', 'me::대한민국::서울::b0'], 'snapRingKeys: 일상 > 여행 카드 > 폴백(버킷 b0)');
// 원래 결함 — 같은 나라라도 여행 카드가 다르면 키가 달라야 한다(옛 뷰어 키 `handle::나라`는 같았다)
eq(new Set(snapRingKeys([snap({ id: 'a', tripGroupId: 'g1' }), snap({ id: 'b', tripGroupId: 'g2' })])).size, 2,
  'snapRingKeys: 같은 나라·다른 카드 → 키 2개');
// 폴백 7일 초과 분리 — 버킷 번호가 키에 들어간다
eq(snapRingKeys([snap({ id: 'x0', timestamp: 0 }), snap({ id: 'x8', timestamp: 7 * DAY + 1 })]),
  ['me::대한민국::::b0', 'me::대한민국::::b1'], 'snapRingKeys: 폴백 7일 초과 → b0/b1');
// 널 계열 — user가 없으면 handle은 빈 문자열(크래시 금지)
eq(snapRingKeys([{ id: 'nu', user: null, tripGroupId: 'g1' }]), ['::trip:g1'], 'snapRingKeys: user null → 빈 handle');
eq(snapRingKeys([]), [], 'snapRingKeys: 빈 배열 → 빈 배열');
// groupSnapRings의 _ringKey는 snapRingKeys와 같은 값 — 링 줄 순서를 뷰어가 키로 옮겨 쓴다
eq(groupSnapRings<Snap>([
  snap({ id: 'r1', timestamp: 10, tripGroupId: 'g1', unviewed: true }),
  snap({ id: 'r2', timestamp: 20, snapDaily: true }),
], unviewed).map((r) => r._ringKey), ['me::trip:g1', 'me::daily'], 'groupSnapRings: _ringKey = snapRingKeys 값');

// ─────────────────────────────────────────────────────────────
// orderSnapStrip — 링 줄 최종 순서(SocialScreen에서 옮김). 뷰어의 '다음 링'도 이 순서
// ─────────────────────────────────────────────────────────────
const NOW2 = new Date(2026, 8, 27, 12, 0).getTime();
const liveCards = [{ id: 'live', records: ['lr'] }, { id: 'old', records: ['or'] }];
const liveRecs = [{ id: 'lr', date: '2026.09.27' }, { id: 'or', date: '2026.05.01' }];
const isMe = (s: { user?: { handle?: string } | null }) => s.user?.handle === 'me';
const rings = (list: Snap[]) => groupSnapRings<Snap>(list, unviewed);
// 진행 중인 내 여행 링 → 맨 앞으로(일상은 여전히 뒤)
eq(ids(orderSnapStrip(rings([
  snap({ id: 'o-other', user: { handle: 'b' }, timestamp: 5, tripGroupId: 'x', unviewed: true }),
  snap({ id: 'o-live', timestamp: 3, tripGroupId: 'live' }),
  snap({ id: 'o-daily', user: { handle: 'c' }, timestamp: 9, snapDaily: true }),
]), isMe, liveCards, liveRecs, NOW2)), ['o-live', 'o-other', 'o-daily'], 'orderSnapStrip: 진행 중 내 여행 링 → 맨 앞');
// 끝난 내 여행 링은 제자리 — 몇 달 전 링이 앞줄을 차지하지 않게
eq(ids(orderSnapStrip(rings([
  snap({ id: 'p-other', user: { handle: 'b' }, timestamp: 5, tripGroupId: 'x', unviewed: true }),
  snap({ id: 'p-old', timestamp: 3, tripGroupId: 'old' }),
]), isMe, liveCards, liveRecs, NOW2)), ['p-other', 'p-old'], 'orderSnapStrip: 끝난 내 여행 링 → 순서 그대로');
eq(orderSnapStrip<Snap>([], isMe, liveCards, liveRecs, NOW2), [], 'orderSnapStrip: 빈 배열 → 빈 배열');

// ─────────────────────────────────────────────────────────────
// pickRetroDailySnapIds — 거주 지역이 정해진 뒤 이미 저장된 거주지 스냅을 소급해 일상으로
// ─────────────────────────────────────────────────────────────
// 정규화 스텁: 실제 normalizeHomeRegion 대신 '수원시 → 경기'만 아는 표(지오 데이터 없이 돈다)
const norm = (raw: string) => (raw === '수원시' ? '경기' : null);
const KR = '대한민국';
const rd = (o: { id: string; viewType?: string; isMyPost?: boolean; snapDaily?: boolean; countryName?: string; regionName?: string }) =>
  ({ viewType: 'snap', countryName: KR, ...o });
// 정상 — 서울 거주자의 서울 스냅(일상 표시 없음)이 잡힌다. 이번 버그의 그 첫 스냅이다
eq(pickRetroDailySnapIds([rd({ id: 'a', regionName: '서울' })], KR, '서울', norm), ['a'], '소급: 거주국·거주 지역 스냅 → 대상');
// 다른 나라 — 도쿄 여행 스냅은 일상이 아니다
eq(pickRetroDailySnapIds([rd({ id: 'b', countryName: '일본', regionName: '서울' })], KR, '서울', norm), [], '소급: 다른 나라 → 제외');
// 같은 나라 다른 지역 — 제주 여행은 여행 링에 남아야 한다
eq(pickRetroDailySnapIds([rd({ id: 'c', regionName: '제주' })], KR, '서울', norm), [], '소급: 거주국 안 다른 지역 → 제외');
// 이미 일상 — 다시 고르면 매번 서버 갱신이 나간다(멱등성의 근거)
eq(pickRetroDailySnapIds([rd({ id: 'd', regionName: '서울', snapDaily: true })], KR, '서울', norm), [], '소급: 이미 snapDaily → 제외');
// 스냅이 아닌 기록 — 피드·블로그는 링과 무관하고 카드에서 빼면 안 된다
eq(pickRetroDailySnapIds([rd({ id: 'e', viewType: 'feed', regionName: '서울' })], KR, '서울', norm), [], '소급: 스냅 아님 → 제외');
eq(pickRetroDailySnapIds([rd({ id: 'e2', viewType: undefined, regionName: '서울' })], KR, '서울', norm), [], '소급: viewType 없음(=feed) → 제외');
// 남의 글 방어 — records는 내 글 목록이지만 isMyPost=false가 섞여도 서버 갱신을 쏘면 안 된다
eq(pickRetroDailySnapIds([rd({ id: 'f', regionName: '서울', isMyPost: false })], KR, '서울', norm), [], '소급: isMyPost=false → 제외');
// 널 계열 — 거주 지역 미설정(null/undefined/'')이면 아무것도 고르지 않는다
eq(pickRetroDailySnapIds([rd({ id: 'g', regionName: '서울' })], KR, null, norm), [], '소급: homeRegion null → 빈 배열');
eq(pickRetroDailySnapIds([rd({ id: 'g', regionName: '서울' })], KR, undefined, norm), [], '소급: homeRegion undefined → 빈 배열');
eq(pickRetroDailySnapIds([rd({ id: 'g', regionName: '서울' })], KR, '', norm), [], '소급: homeRegion 빈 문자열 → 빈 배열');
eq(pickRetroDailySnapIds([rd({ id: 'g', regionName: '서울' })], null, '서울', norm), [], '소급: 거주국 미설정 → 빈 배열');
// 지역 없는 스냅 — 위치 실패로 거주국 폴백된 스냅은 어디서 찍었는지 모른다
eq(pickRetroDailySnapIds([rd({ id: 'h' }), rd({ id: 'h2', regionName: '' })], KR, '서울', norm), [], '소급: regionName 없음/빈 문자열 → 제외');
// 정규화 폴백 — 저장 시 원문(수원시)이 남은 스냅도 프리셋(경기) 거주자면 일상
eq(pickRetroDailySnapIds([rd({ id: 'i', regionName: '수원시' })], KR, '경기', norm), ['i'], '소급: 정규화 폴백 수원시 → 경기 일치');
eq(pickRetroDailySnapIds([rd({ id: 'i', regionName: '수원시' })], KR, '경기'), [], '소급: 정규화 함수 없으면 원문 비교만');
// 정규화 실패 국가 — 프리셋 없는 나라는 도시 원문끼리 같으면 일치(시트·스냅 저장이 같은 규칙)
eq(pickRetroDailySnapIds([rd({ id: 'j', countryName: '몽골', regionName: 'Ulaanbaatar' })], '몽골', 'Ulaanbaatar', () => null), ['j'], '소급: 정규화 실패 → 원문 일치');
// 섞인 목록 — 대상만, 입력 순서대로
eq(pickRetroDailySnapIds([
  rd({ id: 'k1', regionName: '서울' }),
  rd({ id: 'k2', regionName: '제주' }),
  rd({ id: 'k3', regionName: '서울', snapDaily: true }),
  rd({ id: 'k4', regionName: '서울' }),
], KR, '서울', norm), ['k1', 'k4'], '소급: 섞인 목록 → 대상만 입력 순서대로');
eq(pickRetroDailySnapIds([], KR, '서울', norm), [], '소급: 빈 목록 → 빈 배열');


// ─────────────────────────────────────────────────────────────
// shouldRunRetroDaily — 소급은 거주국마다 1회(QA F1: 지역 오탭 한 번에 옛 여행 스냅이 일상이 되던 문제)
// ─────────────────────────────────────────────────────────────
const mine = [{ id: 'm1', isMyPost: true }];
// 기존 사용자(거주 지역은 있는데 소급이 한 번도 안 돈 상태) — 한 번은 돌아야 6일 전 서울 스냅이 합쳐진다
eq(shouldRunRetroDaily('KR', '서울', undefined, mine), true, '1회: 플래그 없음(undefined) + 거주 지역 있음 → 돈다');
eq(shouldRunRetroDaily('KR', '서울', null, mine), true, '1회: 플래그 null → 돈다');
eq(shouldRunRetroDaily('KR', '서울', [], mine), true, '1회: 플래그 빈 집합(계정 리셋 직후) → 돈다');
// 같은 나라 안에서 지역만 바꾼 경우 — 서울→부산 오탭이 부산 여행 스냅을 건드리면 안 된다
eq(shouldRunRetroDaily('KR', '부산', ['KR'], mine), false, '1회: 같은 거주국으로 이미 돎 → 지역을 바꿔도 안 돈다');
// 거주국이 바뀌면 새 나라로 한 번 더
eq(shouldRunRetroDaily('JP', '도쿄', ['KR'], mine), true, '1회: 거주국 변경 KR→JP → 한 번 더 돈다');
// QA R2 — KR→JP→KR 왕복. 코드 하나만 담던 시절엔 'KR' !== 'JP'라 KR이 또 돌았다
eq(shouldRunRetroDaily('KR', '부산', ['KR', 'JP'], mine), false, '1회: KR→JP→KR 왕복 → KR은 다시 안 돈다(R2)');
// 대소문자 흔들림 — 설정값이 소문자로 들어와도 같은 나라로 본다(플래그는 대문자로 저장)
eq(shouldRunRetroDaily('kr', '서울', ['KR'], mine), false, '1회: 코드 소문자 kr ↔ 플래그 KR → 같은 나라');
// 거주 지역 없음 — 이때 돌아서 플래그를 세우면 정작 지역을 처음 정하는 회차가 막힌다
eq(shouldRunRetroDaily('KR', null, undefined, mine), false, '1회: 거주 지역 null → 안 돈다');
eq(shouldRunRetroDaily('KR', '', undefined, mine), false, '1회: 거주 지역 빈 문자열 → 안 돈다');
eq(shouldRunRetroDaily(null, '서울', undefined, mine), false, '1회: 거주국 null → 안 돈다');
eq(shouldRunRetroDaily('', '서울', undefined, mine), false, '1회: 거주국 빈 문자열 → 안 돈다');
// QA R3 — 계정 전환 중 "빈 기록 + 이전 계정 거주 지역" 회차, 새 기기 hydrate 직후 빈 목록.
// 여기서 돌면 0건으로 플래그만 서서 뒤이어 내려오는 기록이 영영 소급되지 않는다
eq(shouldRunRetroDaily('KR', '서울', undefined, []), false, '1회: 기록 0건 → 안 돈다(플래그도 안 섬, R3)');
// 남의 글만 있는 목록도 "내 기록 0건"이다
eq(shouldRunRetroDaily('KR', '서울', undefined, [{ id: 'o1', isMyPost: false }]), false, '1회: 남의 글만 있음 → 안 돈다(R3)');
// isMyPost가 빠진 기록은 내 것으로 본다 — pickRetroDailySnapIds의 `isMyPost !== false`와 같은 규칙
eq(shouldRunRetroDaily('KR', '서울', undefined, [{ id: 'u1' }]), true, '1회: isMyPost 미지정 기록 → 내 기록으로 보고 돈다');

// ─────────────────────────────────────────────────────────────
// restoreRetroDailyDone — 영속본 복원 + 옛 형식(코드 하나) 마이그레이션(QA R2)
// ─────────────────────────────────────────────────────────────
// 옛 형식 — 이 키를 처음 만든 작업본이 남긴 값
eq(restoreRetroDailyDone('KR'), ['KR'], '복원: 옛 형식 문자열 KR → [KR]');
eq(restoreRetroDailyDone('kr'), ['KR'], '복원: 옛 형식 소문자 kr → [KR]');
eq(restoreRetroDailyDone(['KR', 'JP']), ['KR', 'JP'], '복원: 새 형식 배열 → 그대로');
eq(restoreRetroDailyDone(['kr', 'KR', ' jp ']), ['KR', 'JP'], '복원: 대소문자·공백 흔들림 → 대문자로 정리, 중복 제거');
// 과거 저장본(키 없음)·리셋 값 — 아직 안 돎
eq(restoreRetroDailyDone(undefined), [], '복원: undefined(과거 저장본) → 빈 집합');
eq(restoreRetroDailyDone(null), [], '복원: null → 빈 집합');
eq(restoreRetroDailyDone(''), [], '복원: 빈 문자열 → 빈 집합');
// 깨진 값 — 모르는 값은 "안 돎"으로 떨어진다(최악이어도 한 번 더 도는 것)
eq(restoreRetroDailyDone(['KR', 3, null, '']), ['KR'], '복원: 배열 안 비문자열·빈 문자열 → 버린다');
eq(restoreRetroDailyDone(42), [], '복원: 숫자 → 빈 집합');
eq(restoreRetroDailyDone({ KR: true }), [], '복원: 객체 → 빈 집합');

// ─────────────────────────────────────────────────────────────
// planRetroDetach — 떼어내기를 바로 / tombstone 뒤 / 미룸 중 무엇으로 할지(QA F2·R1)
// ─────────────────────────────────────────────────────────────
// 비는 카드가 없으면 서버에 걸 것이 없다 — pull 전이어도 바로 뗀다
eq(planRetroDetach(0, true, false, false), 'detach', '떼기: 비는 카드 0장 → pull 전이어도 바로');
// Supabase 미설정 빌드 — tombstone이 늘 false라 기다리면 영영 못 뗀다
eq(planRetroDetach(2, false, false, false), 'detach', '떼기: Supabase 미설정 → 바로');
// QA R1 — 이번 세션 카드 pull 전에는 로컬 멤버 판정이 낡았을 수 있다
eq(planRetroDetach(1, true, false, false), 'defer', '떼기: 카드 pull 전 → 미룸(R1)');
eq(planRetroDetach(1, true, true, false), 'tombstone', '떼기: 카드 pull 뒤 → tombstone 먼저');
// 앞 회차 tombstone이 아직 응답 대기 — 겹쳐 보내지 않는다
eq(planRetroDetach(1, true, true, true), 'defer', '떼기: tombstone 진행 중 → 미룸');

// ─────────────────────────────────────────────────────────────
// pickStrayDailySnapIds — 이미 일상인데 카드에 남은 스냅(다른 기기가 표시한 것)
// ─────────────────────────────────────────────────────────────
const sg = [{ records: ['s1', 'f1'] }, { records: ['s3'] }];
eq(pickStrayDailySnapIds([
  { id: 's1', viewType: 'snap', snapDaily: true },   // 일상 + 카드 안 → 대상
  { id: 's2', viewType: 'snap', snapDaily: true },   // 일상이지만 카드 밖 → 제외
  { id: 's3', viewType: 'snap' },                    // 카드 안이지만 일상 아님(여행 스냅) → 제외
  { id: 'f1', viewType: 'feed', snapDaily: true },   // 스냅 아님 → 피드는 카드에서 떼면 안 된다
], sg), ['s1'], 'stray: 일상 스냅이면서 카드에 있는 것만');
eq(pickStrayDailySnapIds([{ id: 's1', viewType: 'snap', snapDaily: true }], []), [], 'stray: 카드 0장 → 빈 배열');
eq(pickStrayDailySnapIds([], sg), [], 'stray: 기록 0건 → 빈 배열');

// ─────────────────────────────────────────────────────────────
// pickCardsEmptiedByDetach — 떼어내면 비는 카드 = tombstone을 먼저 걸어야 할 카드(QA F2)
// ─────────────────────────────────────────────────────────────
// 이번 버그의 그 카드 — 첫 서울 스냅 하나로 만들어진 '서울 여행' 카드
eq(pickCardsEmptiedByDetach([{ id: 'seoul', records: ['a'] }], ['a']), ['seoul'], '빈 카드: 유일한 멤버를 떼면 → 대상');
// 피드가 섞인 카드는 남는다 — tombstone하면 안 된다
eq(pickCardsEmptiedByDetach([{ id: 'busan', records: ['a', 'feed1'] }], ['a']), [], '빈 카드: 다른 멤버가 남음 → 제외');
// 원래 비어 있던 카드(진행 중 체류 등)는 이번 정리가 비운 게 아니다
eq(pickCardsEmptiedByDetach([{ id: 'empty', records: [] }], ['a']), [], '빈 카드: 원래 빈 카드 → 제외');
// 체류 카드 — KP 정리와 같은 방어(체류 메타 유실 방지)
eq(pickCardsEmptiedByDetach([{ id: 'stay', records: ['a'], stay: { country: 'X' } }], ['a']), [], '빈 카드: 체류 카드 → 제외');
eq(pickCardsEmptiedByDetach([{ id: 'c1', records: ['a', 'b'] }, { id: 'c2', records: ['b'] }, { id: 'c3', records: ['z'] }], ['a', 'b']),
  ['c1', 'c2'], '빈 카드: 여러 장 중 전부 떼이는 카드만, 입력 순서대로');
eq(pickCardsEmptiedByDetach([{ id: 'c1', records: ['a'] }], []), [], '빈 카드: 떼어낼 id 없음 → 빈 배열');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
