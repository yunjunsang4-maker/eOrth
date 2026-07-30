// 운영자 공지 순수 로직 검증 (jest 미사용).
import { parseNotices, visibleNotices, hasUnreadNotice, latestPublishedAt } from './noticeFeed';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failures++; console.error(`  ✗ ${msg}`); }
}

const DAY = 24 * 60 * 60 * 1000;
// 날짜만 적힌 publishedAt은 '로컬 자정'으로 해석되므로 기대값도 로컬로 만든다
const T = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};
const NOW = T('2026-08-01');

const raw = {
  notices: [
    { id: 'a', kind: 'terms', title: '약관 개정', titleEn: 'Terms update', body: '본문', bodyEn: 'Body', publishedAt: '2026-07-31', effectiveDate: '2026-08-07' },
    { id: 'b', kind: 'service', title: '점검 안내', publishedAt: '2026-07-20' },
  ],
};

// -- parseNotices --
{
  const ko = parseNotices(raw, 'ko');
  assert(ko.length === 2, '정상 항목 2개 파싱');
  assert(ko[0].title === '약관 개정' && ko[0].body === '본문', 'ko는 한국어 필드');
  assert(ko[0].effectiveDate === '2026-08-07', '시행일 원문 보존');
  assert(ko[0].publishedAt === T('2026-07-31'), 'YYYY-MM-DD → 그 날짜의 로컬 자정');
  assert(ko[1].kind === 'service', 'kind 기본값/보존');

  const en = parseNotices(raw, 'en');
  assert(en[0].title === 'Terms update', 'en은 titleEn 우선');
  assert(en[0].body === 'Body', 'en은 bodyEn 우선');
  assert(en[1].title === '점검 안내', 'en 필드가 없으면 한국어로 폴백');
}

// 배열을 그대로 줘도 받는다(JSON 최상위 형태가 바뀌어도 견딘다)
{
  assert(parseNotices([{ id: 'x', title: 't', publishedAt: '2026-07-01' }], 'ko').length === 1, '최상위 배열도 파싱');
}

// 깨진 항목만 버리고 나머지는 살린다 — 공지 하나 때문에 전체가 안 보이면 안 된다
{
  const mixed = parseNotices({ notices: [
    null,
    'nope',
    { id: '', title: 't', publishedAt: '2026-07-01' },      // id 없음
    { id: 'n1', title: 't', publishedAt: 'not-a-date' },     // 날짜 깨짐
    { id: 'n2', publishedAt: '2026-07-01' },                 // 제목 없음
    { id: 'ok', title: '정상', publishedAt: '2026-07-01' },
  ] }, 'ko');
  assert(mixed.length === 1 && mixed[0].id === 'ok', '깨진 항목 5개는 버리고 정상 1개만');
}

// id 중복은 첫 번째만
{
  const dup = parseNotices({ notices: [
    { id: 'same', title: '먼저', publishedAt: '2026-07-01' },
    { id: 'same', title: '나중', publishedAt: '2026-07-02' },
  ] }, 'ko');
  assert(dup.length === 1 && dup[0].title === '먼저', 'id 중복은 첫 항목만');
}

// 입력이 아예 아닌 경우에도 죽지 않는다
{
  assert(parseNotices(null, 'ko').length === 0, 'null → 빈 목록');
  assert(parseNotices('문자열', 'ko').length === 0, '문자열 → 빈 목록');
  assert(parseNotices({}, 'ko').length === 0, 'notices 없는 객체 → 빈 목록');
}

// 게시일 당일 새벽에도 보여야 한다 (회귀 — 2026-07-31 실제 장애)
// UTC 자정으로 해석하면 한국(UTC+9)에서 그날 오전 9시가 되어, 새벽에 연 사용자에게
// 공지가 "아직 게시 전"으로 숨었다. 날짜만 적힌 값은 로컬 달력 기준이어야 한다.
{
  const list = parseNotices({ notices: [{ id: 'today', title: '오늘 공지', publishedAt: '2026-07-31' }] }, 'ko');
  const dawn = new Date(2026, 6, 31, 2, 32).getTime(); // 그날 새벽 2시 32분(로컬)
  assert(visibleNotices(list, dawn).length === 1, '게시일 당일 새벽 2시에도 보인다');
  assert(hasUnreadNotice(list, 0, dawn) === true, '게시일 당일 새벽에 배지가 켜진다');
  const before = new Date(2026, 6, 30, 23, 59).getTime(); // 전날 밤
  assert(visibleNotices(list, before).length === 0, '전날 밤에는 아직 안 보인다');
}

// 시각까지 지정한 ISO 문자열은 그 시각을 그대로 따른다
{
  const list = parseNotices({ notices: [{ id: 'iso', title: '예약', publishedAt: '2026-07-31T18:00:00+09:00' }] }, 'ko');
  const at1759 = Date.parse('2026-07-31T17:59:00+09:00');
  const at1801 = Date.parse('2026-07-31T18:01:00+09:00');
  assert(visibleNotices(list, at1759).length === 0, 'ISO 지정 시각 전에는 안 보인다');
  assert(visibleNotices(list, at1801).length === 1, 'ISO 지정 시각 후에는 보인다');
}

// -- visibleNotices: 예약 게시 --
{
  const list = parseNotices({ notices: [
    { id: 'past', title: '지난 공지', publishedAt: '2026-07-20' },
    { id: 'today', title: '오늘 공지', publishedAt: '2026-08-01' },
    { id: 'future', title: '예약 공지', publishedAt: '2026-08-10' },
  ] }, 'ko');
  const vis = visibleNotices(list, NOW);
  assert(vis.length === 2, '미래 게시분은 숨긴다(예약 게시)');
  assert(vis[0].id === 'today' && vis[1].id === 'past', '최신순 정렬');
  assert(visibleNotices(list, T('2026-08-10')).length === 3, '게시일이 되면 나타난다');
}

// -- hasUnreadNotice --
{
  const list = parseNotices(raw, 'ko'); // a: 7/31, b: 7/20
  assert(hasUnreadNotice(list, 0, NOW) === true, '한 번도 안 봤으면 미읽음');
  assert(hasUnreadNotice(list, T('2026-07-20'), NOW) === true, '더 최신 공지가 있으면 미읽음');
  assert(hasUnreadNotice(list, T('2026-07-31'), NOW) === false, '최신까지 봤으면 읽음');
  // 예약 공지는 게시 전까지 배지를 띄우지 않는다
  const withFuture = parseNotices({ notices: [{ id: 'f', title: '예약', publishedAt: '2026-09-01' }] }, 'ko');
  assert(hasUnreadNotice(withFuture, 0, NOW) === false, '미래 공지는 배지를 띄우지 않는다');
}

// -- latestPublishedAt --
{
  const list = parseNotices(raw, 'ko');
  assert(latestPublishedAt(list, NOW) === T('2026-07-31'), '보이는 것 중 가장 최신 게시 시각');
  assert(latestPublishedAt([], NOW, 123) === 123, '보이는 공지가 없으면 기존 값 유지');
  // 목록을 연 뒤에는 미읽음이 사라져야 한다(왕복 확인)
  const seen = latestPublishedAt(list, NOW);
  assert(hasUnreadNotice(list, seen, NOW) === false, '목록을 열어 저장하면 배지가 꺼진다');
}

// 게시일이 하루 뒤인 공지는 다음 날 다시 배지를 켠다
{
  const list = parseNotices({ notices: [
    { id: 'a', title: '어제', publishedAt: '2026-07-31' },
    { id: 'b', title: '내일', publishedAt: '2026-08-02' },
  ] }, 'ko');
  const seen = latestPublishedAt(list, NOW);
  assert(hasUnreadNotice(list, seen, NOW) === false, '오늘 기준으론 다 읽음');
  assert(hasUnreadNotice(list, seen, NOW + DAY) === true, '다음 날 새 공지가 게시되면 다시 미읽음');
}

console.log(failures === 0 ? '\n모든 검증 통과' : `\n실패 ${failures}건`);
if (failures > 0) process.exitCode = 1;
