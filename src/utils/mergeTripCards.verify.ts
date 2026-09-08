// src/utils/mergeTripCards.verify.ts
// 여행 카드 기기 간 동기화의 판정·병합 규칙 검증.
//
// 이 파일이 지키려는 것 세 가지:
//   ① "서버 목록에 없음"이 절대 삭제로 이어지지 않는다(확립된 불변식)
//   ② 기준선(serverUpdatedAt) 없는 카드가 stale로 안 잡힌다(첫 동기화 전량 재수신 방지)
//   ③ records 합집합에서 **한쪽만 가진 멤버가 사라지지 않는다**
//
// ⚠️ 마지막 블록은 **반증 케이스**다 — "통과하도록 짜맞춘 게 아님"을 스스로 증명하려고,
//    그럴듯하지만 틀린 구현(로컬 우선 / 서버 배열로 교체 / 부재를 삭제로 간주)이었다면
//    반드시 깨지는 값을 고정한다.

import {
  classifyServerCards,
  mergeServerCard,
  toLocalTripCard,
  isUsableTripCardData,
  type MergeableTripCard,
  type ServerTripCard,
  type ServerTripCardRef,
} from './mergeTripCards';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// ─────────────────────────────────────────────
// 픽스처
// ─────────────────────────────────────────────
const D0 = new Date('2026-01-01T00:00:00.000Z');

/** 로컬 카드 — 필요한 필드만 덮어쓴다 */
const card = (over: Partial<MergeableTripCard> & { id: string }): MergeableTripCard => ({
  title: '일본 여행',
  records: [],
  coverRecordId: '',
  createdAt: D0,
  ...over,
});

/** 서버 본문까지 받은 카드 */
const srv = (
  cardId: string,
  data: Partial<ServerTripCard['data']>,
  updatedAt?: number,
): ServerTripCard => ({
  cardId,
  updatedAt,
  data: { id: cardId, title: '일본 여행', records: [], coverRecordId: '', createdAt: D0.toISOString(), ...data },
});

/** 프로브 1행 */
const ref = (cardId: string, updatedAt?: number | null, deletedAt?: number | null): ServerTripCardRef =>
  ({ cardId, updatedAt, deletedAt });

/** 기본 매핑기: remoteId → 로컬 id. 모르면 입력 그대로(호출부 계약) */
const mapper = (table: Record<string, string>) => (remote: string) => table[remote] ?? remote;
const identity = (r: string) => r;

/**
 * "이 기기에 그 기록이 실존하는가" 판정기(죽은 id 청소의 조건 ①).
 * 기본값 `allKnown`은 **청소를 끄는** 값이라, 대부분의 케이스는 이걸로 기존 합집합 규칙만 본다.
 * 청소 자체는 아래 M1 블록에서 `knownOnly([...])`로 따로 고정한다.
 */
const allKnown = () => true;
const knownOnly = (ids: string[]) => (id: string) => ids.includes(id);

// ─────────────────────────────────────────────
// 1. classifyServerCards — 3분류
// ─────────────────────────────────────────────

// 정상 경로: 한 번의 프로브로 세 갈래가 동시에 나온다
{
  const local = [
    card({ id: 'grp-A', serverUpdatedAt: 100 }), // 서버가 더 최신 → stale
    card({ id: 'grp-B', serverUpdatedAt: 500 }), // 서버가 그대로 → 아무것도 아님
    card({ id: 'grp-C', serverUpdatedAt: 100 }), // 삭제표식 → tombstoned
  ];
  const server = [ref('grp-A', 200), ref('grp-B', 500), ref('grp-C', 300, 300), ref('grp-D', 400)];
  eq(classifyServerCards(local, server), { missing: ['grp-D'], tombstoned: ['grp-C'], stale: ['grp-A'] },
    '3분류: 새 카드·삭제된 카드·수정된 카드가 프로브 한 번으로 갈린다');
}

// 경계: 서버 0건이면 전부 빈 배열 — 로컬 카드가 몇 장이든 삭제로 이어지지 않는다
eq(classifyServerCards([card({ id: 'grp-A', serverUpdatedAt: 1 })], []),
  { missing: [], tombstoned: [], stale: [] },
  '서버 0건: 로컬 카드가 있어도 어떤 갈래에도 들어가지 않는다(빈 응답 ≠ 삭제)');

// ★ 불변식 ① — "서버 목록에 없음"은 삭제 근거가 아니다
eq(classifyServerCards(
  [card({ id: 'grp-A', serverUpdatedAt: 1 }), card({ id: 'grp-ONLY-LOCAL', serverUpdatedAt: 1 })],
  [ref('grp-A', 1)],
).tombstoned, [],
  '서버가 언급하지 않은 로컬 카드는 tombstoned가 아니다(부분 응답을 삭제로 오인 금지)');

// 삭제표식이 있는데 로컬에 없으면 아무 일도 없다 — 특히 missing에 들어가면 안 된다
{
  const c = classifyServerCards([], [ref('grp-DEAD', 300, 300)]);
  eq(c, { missing: [], tombstoned: [], stale: [] },
    '로컬에 없는 삭제표식은 무동작 — missing에 넣으면 지운 카드가 되살아난다');
}

// ★ 불변식 ② — 기준선 없는 로컬 카드는 stale이 아니다
eq(classifyServerCards([card({ id: 'grp-A' })], [ref('grp-A', 999)]).stale, [],
  'serverUpdatedAt 없는 로컬 카드는 stale이 아니다(첫 동기화 전량 재수신 방지)');

// 경계: 같거나 더 오래된 서버 시각은 stale이 아니다(내가 방금 올린 카드 재수신 방지)
eq(classifyServerCards([card({ id: 'grp-A', serverUpdatedAt: 500 })], [ref('grp-A', 500)]).stale, [],
  '서버 updated_at == 기준선이면 stale이 아니다');
eq(classifyServerCards([card({ id: 'grp-A', serverUpdatedAt: 500 })], [ref('grp-A', 499)]).stale, [],
  '서버 updated_at < 기준선이면 stale이 아니다');
eq(classifyServerCards([card({ id: 'grp-A', serverUpdatedAt: 500 })], [ref('grp-A', 501)]).stale, ['grp-A'],
  '서버 updated_at > 기준선이면 stale이다(1ms 차이도 잡는다)');

// 널 계열 — undefined / null / 0 을 뭉뚱그리지 않는다
eq(classifyServerCards([card({ id: 'grp-A', serverUpdatedAt: 100 })], [ref('grp-A', 200, undefined)]),
  { missing: [], tombstoned: [], stale: ['grp-A'] }, 'deletedAt undefined는 살아 있음');
eq(classifyServerCards([card({ id: 'grp-A', serverUpdatedAt: 100 })], [ref('grp-A', 200, null)]),
  { missing: [], tombstoned: [], stale: ['grp-A'] }, 'deletedAt null은 살아 있음');
eq(classifyServerCards([card({ id: 'grp-A', serverUpdatedAt: 100 })], [ref('grp-A', 200, 0)]),
  { missing: [], tombstoned: [], stale: ['grp-A'] }, 'deletedAt 0은 표식이 아니다(Date.parse 실패 폴백 방어)');
eq(classifyServerCards([card({ id: 'grp-A', serverUpdatedAt: 100 })], [ref('grp-A', null)]).stale, [],
  'updatedAt null이면 비교 기준이 없으므로 아무 갈래에도 안 넣는다');
eq(classifyServerCards([card({ id: 'grp-A', serverUpdatedAt: 100 })], [ref('grp-A', undefined)]).stale, [],
  'updatedAt undefined도 같다');

// 중복·불량 행 방어
eq(classifyServerCards([], [ref('grp-D', 1), ref('grp-D', 2)]).missing, ['grp-D'],
  '같은 card_id가 두 번 와도 missing은 한 번만');
eq(classifyServerCards([card({ id: 'grp-C', serverUpdatedAt: 1 })], [ref('grp-C', 9, 9), ref('grp-C', 9, 9)]).tombstoned,
  ['grp-C'], '같은 삭제표식이 두 번 와도 tombstoned는 한 번만(재-tombstone 루프 방지)');
eq(classifyServerCards([], [ref('', 1)]).missing, [],
  'card_id가 빈 문자열인 행은 버린다(조회 대상이 될 수 없다)');

// tombstone이 stale·missing과 섞이지 않는다(배타)
{
  const c = classifyServerCards([card({ id: 'grp-C', serverUpdatedAt: 1 })], [ref('grp-C', 999, 999)]);
  eq(c, { missing: [], tombstoned: ['grp-C'], stale: [] },
    '삭제표식이 있으면 updated_at이 아무리 커도 stale이 아니다(지운 카드 본문을 받지 않는다)');
}

// ─────────────────────────────────────────────
// 2. mergeServerCard — 필드 병합
// ─────────────────────────────────────────────

// records 합집합 — 로컬 순서 유지 + 서버 추가분 뒤, 중복 제거
{
  const local = card({ id: 'grp-A', records: ['rec-1', 'rec-2'], serverUpdatedAt: 1 });
  const server = srv('grp-A', { records: ['P1', 'P3'] }, 2);
  const m = mergeServerCard(local, server, mapper({ P1: 'rec-1', P3: 'rec-3' }), allKnown);
  eq(m.records, ['rec-1', 'rec-2', 'rec-3'],
    'records 합집합: 로컬 전용 rec-2가 살아남고 서버 신규 rec-3가 뒤에 붙는다');
}

// 매핑되지 않는 remoteId는 **버리지 않고 유지** — 그 글이 아직 동기화 전일 수 있다
{
  const m = mergeServerCard(
    card({ id: 'grp-A', records: ['rec-1'] }),
    srv('grp-A', { records: ['P-UNKNOWN'] }),
    identity,
    allKnown,
  );
  eq(m.records, ['rec-1', 'P-UNKNOWN'],
    '매핑 안 되는 서버 기록 id도 멤버로 유지한다(다음 records 동기화가 채운다)');
}

// 중복 제거 — 서버가 같은 id를 두 번 보내거나 로컬과 겹칠 때
{
  const m = mergeServerCard(
    card({ id: 'grp-A', records: ['rec-1', 'rec-1'] }),
    srv('grp-A', { records: ['P1', 'P1', 'P2'] }),
    mapper({ P1: 'rec-1', P2: 'rec-2' }),
    allKnown,
  );
  eq(m.records, ['rec-1', 'rec-2'], '양쪽 중복을 모두 제거한다');
}

// 스칼라 LWW — 제목·국가·날짜·지역은 서버본이 이긴다
{
  const local = card({ id: 'grp-A', title: '옛 제목', countryName: '일본', countryFlag: '🇯🇵', date: '2026.01.01', regionName: '도쿄' });
  const server = srv('grp-A', { title: '새 제목', countryName: '대만', countryFlag: '🇹🇼', date: '2026.02.02', regionName: undefined });
  const m = mergeServerCard(local, server, identity, allKnown);
  eq([m.title, m.countryName, m.countryFlag, m.date, m.regionName],
    ['새 제목', '대만', '🇹🇼', '2026.02.02', undefined],
    '스칼라는 서버본 채택 — regionName을 지운 것까지 전파된다');
}

// 체류 메타도 스칼라와 같다(종료가 전파되어야 한다)
{
  const local = card({ id: 'grp-A', stay: { type: 'study', status: 'active', startedAt: '2026.01.01', lastActiveAt: 10 } });
  const server = srv('grp-A', { stay: { type: 'study', status: 'ended', startedAt: '2026.01.01', endedAt: '2026.03.01', lastActiveAt: 20 } });
  eq(mergeServerCard(local, server, identity, allKnown).stay,
    { type: 'study', status: 'ended', startedAt: '2026.01.01', endedAt: '2026.03.01', lastActiveAt: 20 },
    '체류 메타는 서버본 채택 — 다른 기기에서 종료한 것이 전파된다');
}

// coverRecordId — 매핑 후 멤버에 있으면 채택
{
  const m = mergeServerCard(
    card({ id: 'grp-A', records: ['rec-1'], coverRecordId: 'rec-1' }),
    srv('grp-A', { records: ['P1', 'P2'], coverRecordId: 'P2' }),
    mapper({ P1: 'rec-1', P2: 'rec-2' }),
    allKnown,
  );
  eq(m.coverRecordId, 'rec-2', '대표 기록: 매핑 결과가 합집합 멤버에 있으면 서버본 채택');
}

// coverRecordId — 매핑 결과가 멤버에 없으면 로컬 값을 지킨다(표지가 비지 않게)
{
  const m = mergeServerCard(
    card({ id: 'grp-A', records: ['rec-1'], coverRecordId: 'rec-1' }),
    srv('grp-A', { records: ['P1'], coverRecordId: '' }),
    mapper({ P1: 'rec-1' }),
    allKnown,
  );
  eq(m.coverRecordId, 'rec-1', '대표 기록: 서버 값이 비면 로컬 대표를 유지한다');
}

// coverUri — 로컬 파일 보호 / 원격 URL이면 서버본 / 로컬 없음이면 서버본
eq(mergeServerCard(card({ id: 'grp-A', coverUri: 'file:///me/a.jpg' }), srv('grp-A', { coverUri: 'file:///other/b.jpg' }), identity, allKnown).coverUri,
  'file:///me/a.jpg', 'coverUri: 로컬 파일은 서버본(다른 기기의 경로)에 밀리지 않는다');
eq(mergeServerCard(card({ id: 'grp-A', coverUri: 'https://cdn/x.jpg' }), srv('grp-A', { coverUri: 'file:///other/b.jpg' }), identity, allKnown).coverUri,
  'file:///other/b.jpg', 'coverUri: 로컬이 원격 URL이면 서버본을 쓴다');
eq(mergeServerCard(card({ id: 'grp-A' }), srv('grp-A', { coverUri: 'file:///other/b.jpg' }), identity, allKnown).coverUri,
  'file:///other/b.jpg', 'coverUri: 로컬에 없으면 서버본을 쓴다');
eq(mergeServerCard(card({ id: 'grp-A', coverUri: '' }), srv('grp-A', { coverUri: undefined }), identity, allKnown).coverUri,
  undefined, 'coverUri: 양쪽 다 없으면 undefined(빈 문자열은 로컬 파일로 치지 않는다)');

// createdAt은 로컬 유지 — 정렬 안정성
{
  const m = mergeServerCard(card({ id: 'grp-A' }), srv('grp-A', { createdAt: '2020-05-05T00:00:00.000Z' }), identity, allKnown);
  eq(m.createdAt, D0, 'createdAt은 로컬 유지(카드 정렬이 동기화마다 흔들리지 않게)');
}

// serverUpdatedAt 갱신 / 서버에 없으면 로컬 유지(퇴행 방지)
eq(mergeServerCard(card({ id: 'grp-A', serverUpdatedAt: 100 }), srv('grp-A', {}, 200), identity, allKnown).serverUpdatedAt,
  200, 'serverUpdatedAt은 서버 값으로 갱신한다');
eq(mergeServerCard(card({ id: 'grp-A', serverUpdatedAt: 100 }), srv('grp-A', {}, undefined), identity, allKnown).serverUpdatedAt,
  100, 'serverUpdatedAt: 서버가 안 주면 로컬 기준선을 유지한다(퇴행 금지)');

// tombstone 잔재(data = {})를 받아도 로컬을 훼손하지 않는다
{
  const local = card({ id: 'grp-A', title: '내 카드', records: ['rec-1'], serverUpdatedAt: 1 });
  const m = mergeServerCard(local, { cardId: 'grp-A', updatedAt: 9, data: {} }, identity, allKnown);
  eq(m, local, '쓸 수 없는 본문(data={})이면 로컬을 그대로 돌려준다 — 제목이 undefined로 덮이지 않는다');
}
eq(isUsableTripCardData({}), false, 'isUsableTripCardData: 빈 객체는 카드가 아니다');
eq(isUsableTripCardData(undefined), false, 'isUsableTripCardData: undefined는 카드가 아니다');
eq(isUsableTripCardData({ title: '제목' }), false, 'isUsableTripCardData: records 배열이 없으면 카드가 아니다');
eq(isUsableTripCardData({ title: '제목', records: [] }), true, 'isUsableTripCardData: 멤버 0장짜리 카드는 유효하다(진행 중 체류 카드)');

// 입력 비변형
{
  const local = card({ id: 'grp-A', records: ['rec-1'], title: '옛 제목' });
  const before = JSON.stringify(local);
  mergeServerCard(local, srv('grp-A', { records: ['P2'], title: '새 제목' }), identity, allKnown);
  eq(JSON.stringify(local), before, '입력 로컬 카드를 변형하지 않는다');
}

// ─────────────────────────────────────────────
// 2-b. 죽은 id 청소 (M1) — 합집합의 단 하나의 예외
//
// 상대 기기의 미발행 기록은 그쪽 로컬 id로 카드에 실려 온다. 그 글이 발행되면 소스 기기는
// 직렬화에서 remoteId로 갈아끼워 스스로 청소하는데, 순수 합집합이면 이쪽이 죽은 id를 계속
// 안고 push해 **소스 기기까지 재감염**시킨다. 두 조건이 동시에 참일 때만 버려야 한다.
// ─────────────────────────────────────────────

// ① 로컬에 없음 + ② 서버 목록에도 없음 → **버린다**
{
  const m = mergeServerCard(
    card({ id: 'grp-A', records: ['rec-1', 'recDEAD'], serverUpdatedAt: 1 }),
    srv('grp-A', { records: ['P1'] }, 2),
    mapper({ P1: 'rec-1' }),
    knownOnly(['rec-1']), // recDEAD는 이 기기에 실존하지 않는다
  );
  eq(m.records, ['rec-1'],
    '죽은 id 청소: 로컬에 없고 서버 목록에서도 사라진 id는 버린다(소스 기기 재감염 차단)');
}

// ①만 참(로컬에 없지만 서버는 아직 들고 있다) → **유지** (아직 동기화 전인 상대 글)
{
  const m = mergeServerCard(
    card({ id: 'grp-A', records: ['P-UNSYNCED'], serverUpdatedAt: 1 }),
    srv('grp-A', { records: ['P-UNSYNCED'] }, 2),
    identity,
    knownOnly([]), // 이 기기에는 아직 그 기록이 없다
  );
  eq(m.records, ['P-UNSYNCED'],
    '죽은 id 청소: 서버가 아직 들고 있는 id는 로컬에 없어도 유지한다(다음 records 동기화가 채운다)');
}

// ②만 참(서버 목록엔 없지만 이 기기에 실존) → **유지** (이 기기의 로컬 전용 미발행 기록)
{
  const m = mergeServerCard(
    card({ id: 'grp-A', records: ['rec-LOCALONLY'], serverUpdatedAt: 1 }),
    srv('grp-A', { records: [] }, 2),
    identity,
    knownOnly(['rec-LOCALONLY']),
  );
  eq(m.records, ['rec-LOCALONLY'],
    '죽은 id 청소: 서버 목록에 없어도 이 기기에 실존하는 기록은 유지한다(미발행 글 보호)');
}

// 대표 기록이 청소 대상이면 표지가 죽은 id를 가리키지 않아야 한다
{
  const m = mergeServerCard(
    card({ id: 'grp-A', records: ['recDEAD', 'rec-1'], coverRecordId: 'recDEAD', serverUpdatedAt: 1 }),
    srv('grp-A', { records: ['P1'], coverRecordId: 'P1' }, 2),
    mapper({ P1: 'rec-1' }),
    knownOnly(['rec-1']),
  );
  eq([m.records, m.coverRecordId], [['rec-1'], 'rec-1'],
    '죽은 id 청소: 대표가 청소되면 서버 대표(합집합 멤버)로 갈아탄다');
}

// ─────────────────────────────────────────────
// 3. toLocalTripCard — 새 카드 만들기(missing)
// ─────────────────────────────────────────────
{
  const c = toLocalTripCard(
    srv('grp-Z', { title: '대만 여행', records: ['P1', 'P9'], coverRecordId: 'P9', countryName: '대만', coverUri: 'file:///other/b.jpg' }, 777),
    mapper({ P1: 'rec-1' }),
  );
  eq(c, {
    id: 'grp-Z',
    title: '대만 여행',
    records: ['rec-1', 'P9'],
    coverRecordId: 'P9',
    createdAt: D0,
    countryName: '대만',
    countryFlag: undefined,
    coverUri: 'file:///other/b.jpg',
    date: undefined,
    regionName: undefined,
    stay: undefined,
    serverUpdatedAt: 777,
  }, '새 카드: 서버 card_id를 그대로 쓰고 기록만 매핑한다(매핑 안 되는 P9는 유지)');
}
eq(toLocalTripCard({ cardId: 'grp-Z', data: {} }, identity), null,
  '새 카드: 쓸 수 없는 본문이면 null(호출부가 건너뛴다)');
eq(toLocalTripCard({ cardId: '', data: { title: 'x', records: [] } }, identity), null,
  '새 카드: card_id가 없으면 null');
{
  const c = toLocalTripCard(srv('grp-Z', { records: ['P1', 'P2'], coverRecordId: 'P-GONE' }), mapper({ P1: 'rec-1', P2: 'rec-2' }));
  eq(c?.coverRecordId, 'rec-1', '새 카드: 대표가 멤버에 없으면 남은 첫 기록으로 승계한다');
}
{
  const c = toLocalTripCard(srv('grp-Z', { records: [], createdAt: '깨진값' }), identity);
  eq(Number.isFinite(c?.createdAt.getTime() ?? NaN), true,
    '새 카드: createdAt이 깨져 있어도 유효한 Date를 만든다(카드가 사라지지 않게)');
}

// ─────────────────────────────────────────────
// 4. 반증 케이스 — 그럴듯하지만 틀린 구현이었다면 반드시 깨지는 값들
//    (통과하도록 짜맞춘 검증이 아님을 스스로 증명한다)
// ─────────────────────────────────────────────

// 반증 A: "로컬 우선"으로 짰다면 제목이 '옛 제목'으로 남아 실패한다
eq(mergeServerCard(card({ id: 'grp-A', title: '옛 제목' }), srv('grp-A', { title: '새 제목' }), identity, allKnown).title,
  '새 제목', '반증: 제목은 로컬이 아니라 서버가 이긴다(로컬 우선 구현이면 깨진다)');

// 반증 B: "records를 서버 배열로 교체"로 짰다면 rec-LOCAL이 사라져 실패한다
eq(mergeServerCard(card({ id: 'grp-A', records: ['rec-LOCAL'] }), srv('grp-A', { records: ['P1'] }), mapper({ P1: 'rec-1' }), allKnown).records,
  ['rec-LOCAL', 'rec-1'], '반증: records는 교체가 아니라 합집합이다(교체 구현이면 rec-LOCAL이 사라진다)');

// 반증 C: "매핑 실패한 서버 id는 버린다"로 짰다면 결과가 ['rec-1']이라 실패한다
eq(mergeServerCard(card({ id: 'grp-A', records: ['rec-1'] }), srv('grp-A', { records: ['P-UNSYNCED'] }), identity, allKnown).records.length,
  2, '반증: 매핑 실패한 서버 기록 id를 버리지 않는다(버리는 구현이면 길이가 1이 된다)');

// 반증 D: "서버에 없는 로컬 카드를 지운다"로 짰다면 tombstoned에 grp-LOCAL이 들어와 실패한다
eq(classifyServerCards([card({ id: 'grp-LOCAL', serverUpdatedAt: 5 })], [ref('grp-OTHER', 5)]),
  { missing: ['grp-OTHER'], tombstoned: [], stale: [] },
  '반증: 서버에 없는 로컬 카드는 tombstoned가 아니다(부재를 삭제로 보는 구현이면 깨진다)');

// 반증 E: "기준선 없으면 무조건 stale"로 짰다면 stale에 grp-A가 들어와 실패한다
eq(classifyServerCards([card({ id: 'grp-A' })], [ref('grp-A', 1)]),
  { missing: [], tombstoned: [], stale: [] },
  '반증: 기준선 없는 카드는 stale이 아니다(무조건 stale 구현이면 첫 동기화가 전량 재수신한다)');

// 반증 G: 죽은 id 청소를 "로컬에 없으면 버린다"(조건 ①만)로 짰다면 아직 동기화 전인
//         상대 글이 사라져 길이가 0이 된다. 반대로 "서버에 없으면 버린다"(조건 ②만)로 짰다면
//         아래 두 번째 단언에서 로컬 전용 미발행 글이 사라진다.
eq(mergeServerCard(card({ id: 'grp-A', records: ['P-UNSYNCED'], serverUpdatedAt: 1 }),
  srv('grp-A', { records: ['P-UNSYNCED'] }, 2), identity, knownOnly([])).records.length, 1,
  '반증: 조건 ①만으로 버리는 구현이면 아직 안 받은 상대 글이 사라진다');
eq(mergeServerCard(card({ id: 'grp-A', records: ['rec-MINE'], serverUpdatedAt: 1 }),
  srv('grp-A', { records: [] }, 2), identity, knownOnly(['rec-MINE'])).records.length, 1,
  '반증: 조건 ②만으로 버리는 구현이면 내 미발행 글이 사라진다');

// 반증 F: coverUri에서 "항상 서버본"으로 짰다면 로컬 파일이 밀려 실패한다
eq(mergeServerCard(card({ id: 'grp-A', coverUri: 'file:///me/a.jpg' }), srv('grp-A', { coverUri: 'https://cdn/z.jpg' }), identity, allKnown).coverUri,
  'file:///me/a.jpg', '반증: coverUri는 항상 서버본이 아니다(로컬 파일이 이긴다)');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
