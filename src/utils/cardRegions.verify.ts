// src/utils/cardRegions.verify.ts
// 여행 카드에 연결한 방문 지역(TripGroup.visitedRegions)의 순수 규칙 검증.
//
// 지키려는 것:
//   ① 다국가 카드에서 한 나라분만 갈아끼운다(다른 나라 지역이 지워지지 않는다)
//   ② "모름(undefined)"과 "전부 지움([])"이 구분된다 — 동기화 병합이 이 차이로 옛 앱의 키 누락을 견딘다
//   ③ 대륙 지도 시트의 카드 후보·'기타' 기록 분류가 지도 활성화 기준(스냅 제외)과 같다

import { sanitizeCardRegions, replaceCountryRegions, pickCountryCards, liveCardRegions } from './cardRegions';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const tokyo = { iso3: 'JPN', nameEn: 'JP-13', name: '도쿄도' };
const osaka = { iso3: 'JPN', nameEn: 'JP-27', name: '오사카부' };
const madrid = { iso3: 'ESP', nameEn: 'ES-MD', name: '마드리드' };

// ─── sanitizeCardRegions ───
eq(sanitizeCardRegions(undefined), undefined, 'sanitize: undefined → undefined(모름 — 옛 앱 payload)');
eq(sanitizeCardRegions(null), undefined, 'sanitize: null → undefined');
eq(sanitizeCardRegions('JP-13'), undefined, 'sanitize: 배열이 아닌 값 → undefined');
eq(sanitizeCardRegions([]), [], 'sanitize: 빈 배열은 그대로 [] (전부 지움 — undefined와 구분)');
// jsonb가 키를 재정렬해 돌려준 원소도 { iso3, nameEn, name } 순서로 다시 만들어야 지문이 같다
eq(JSON.stringify(sanitizeCardRegions([{ name: '도쿄도', nameEn: 'JP-13', iso3: 'JPN' }])),
  JSON.stringify([tokyo]), 'sanitize: 키 순서를 iso3·nameEn·name으로 고정(jsonb 재정렬 대비)');
eq(sanitizeCardRegions([tokyo, { ...tokyo, name: '다른 이름' }, osaka]), [tokyo, osaka],
  'sanitize: 같은 (iso3, nameEn) 중복은 앞의 것만');
eq(sanitizeCardRegions([{ iso3: 'JPN', nameEn: 'JP-13', name: '도쿄도' }, { iso3: 'KOR', nameEn: 'JP-13', name: 'x' }])?.length, 2,
  'sanitize: 코드가 같아도 나라가 다르면 다른 지역');
eq(sanitizeCardRegions([{ iso3: '', nameEn: 'JP-13', name: 'a' }, { iso3: 'JPN', nameEn: '', name: 'b' }, { iso3: 'JPN' }, null, 3]), [],
  'sanitize: iso3·nameEn이 비었거나 없는 원소·비객체는 버린다');
eq(sanitizeCardRegions([{ iso3: 'JPN', nameEn: 'JP-13', name: 7 }]), [{ iso3: 'JPN', nameEn: 'JP-13', name: '' }],
  'sanitize: name이 문자열이 아니면 빈 문자열(지역은 살린다 — 표시는 코드로 이름을 다시 찾는다)');

// ─── replaceCountryRegions ───
eq(replaceCountryRegions(undefined, 'JPN', [tokyo]), [tokyo], 'replace: 처음 저장');
eq(replaceCountryRegions([tokyo, madrid], 'JPN', [osaka]), [madrid, osaka],
  'replace: 다국가 카드 — 일본분만 갈아끼우고 스페인 지역은 남긴다');
eq(replaceCountryRegions([tokyo], 'JPN', []), [],
  'replace: 전부 해제하면 [](명시적 삭제 — 동기화로 전파돼야 한다)');
eq(replaceCountryRegions(undefined, 'JPN', []), undefined,
  'replace: 원래 없고 고른 것도 없으면 undefined 그대로(헛 업로드 방지)');
eq(replaceCountryRegions([], 'JPN', []), [], 'replace: 이미 []면 [] 유지');
eq(replaceCountryRegions(undefined, 'JPN', [{ ...tokyo, iso3: 'XXX' }]), [tokyo],
  'replace: 고른 원소의 iso3는 저장 대상 나라로 맞춘다');
// QA F4 — 순서를 다시 조립하면 선택을 안 바꾼 저장도 '변경됨'으로 잡혀 헛 업로드가 나간다
eq(JSON.stringify(replaceCountryRegions([madrid, tokyo], 'ESP', [madrid])), JSON.stringify([madrid, tokyo]),
  'replace: [ESP, JPN] 카드에서 스페인 선택을 그대로 저장하면 순서까지 그대로(헛 업로드 없음)');
eq(replaceCountryRegions([tokyo, madrid, osaka], 'JPN', [osaka, tokyo]), [tokyo, madrid, osaka],
  'replace: 고른 순서가 달라도 기존 원소는 제자리');
eq(replaceCountryRegions([tokyo, madrid], 'JPN', [osaka, tokyo]), [tokyo, madrid, osaka],
  'replace: 새로 고른 것만 뒤에 붙는다');
eq(replaceCountryRegions([tokyo, madrid, osaka], 'JPN', [osaka]), [madrid, osaka],
  'replace: 해제한 것만 빠지고 나머지 순서 유지');

// ─── pickCountryCards ───
const recs = [
  { id: 'r1', viewType: 'feed', countryName: '일본' },
  { id: 'r2', viewType: 'snap', countryName: '일본' },                       // 스냅 — 제외
  { id: 'r3', viewType: 'blog', countryName: '스페인', countries: [{ name: '스페인' }, { name: '포르투갈' }] },
  { id: 'r4', viewType: 'feed', countryName: '일본' },                       // 어느 카드에도 없음
  { id: 'r5', viewType: 'album', countryName: '프랑스' },
];
const groups = [
  { id: 'g-jp', records: ['r1', 'r2'] },
  { id: 'g-snap', records: ['r2'] },                                         // 스냅만 담은 카드 — 제외
  { id: 'g-es', records: ['r3'], countryName: '스페인' },                    // 분할 카드(스페인)
  { id: 'g-pt', records: ['r3'], countryName: '포르투갈' },                  // 분할 카드(포르투갈)
  { id: 'g-fr', records: ['r5'] },
];
const ids = (x: { cards: { id: string }[]; looseRecordIds: string[] }) => ({ cards: x.cards.map(c => c.id), loose: x.looseRecordIds });
eq(ids(pickCountryCards(groups, recs, '일본')), { cards: ['g-jp'], loose: ['r4'] },
  'pick: 일본 — 스냅만 든 카드는 빼고, 카드 밖 기록 r4는 기타로');
eq(ids(pickCountryCards(groups, recs, '포르투갈')), { cards: ['g-pt'], loose: [] },
  'pick: 포르투갈 — 같은 기록을 나눠 가진 스페인 분할 카드는 안 뜬다');
eq(ids(pickCountryCards([{ id: 'g-eu', records: ['r3'] }], recs, '포르투갈')), { cards: ['g-eu'], loose: [] },
  'pick: 오버라이드 없는 다국가 카드는 다국가 목록의 나라에서도 뜬다');
eq(ids(pickCountryCards([{ id: 'g-es', records: ['r3'], countryName: '스페인' }], recs, '포르투갈')), { cards: [], loose: ['r3'] },
  'pick: 이 나라 카드가 없으면 다른 나라 분할 카드에 든 기록도 기타로(지역을 달 곳이 남는다)');
eq(ids(pickCountryCards(groups, recs, '독일')), { cards: [], loose: [] }, 'pick: 기록 없는 나라 → 빈 결과');
eq(ids(pickCountryCards(groups, [], '일본')), { cards: [], loose: [] }, 'pick: 기록 0건 → 빈 결과');
eq(ids(pickCountryCards([], recs, '일본')), { cards: [], loose: ['r1', 'r4'] }, 'pick: 카드 0장 → 이 나라 기록 전부 기타(스냅 제외)');

// ─── liveCardRegions (QA F1) — 지도·고아 정리가 시트 편집 범위(pickCountryCards)와 같은 지역만 본다 ───
const KO = { JPN: '일본', ESP: '스페인', PRT: '포르투갈' } as Record<string, string>;
const lisbon = { iso3: 'PRT', nameEn: 'PT-11', name: '리스본' };
const eu = { id: 'g-eu', records: ['r3'], visitedRegions: [madrid, lisbon] };   // 다국가(오버라이드 없음)
eq(liveCardRegions([eu], recs, KO), [madrid, lisbon], 'live: 두 나라 기록이 다 있으면 두 나라 지역 모두 살아 있다');
// 재현 ②: 다국가 카드에서 스페인 기록만 지웠다(r3 대신 포르투갈 전용 기록만 남음)
const recsPtOnly = [{ id: 'r6', viewType: 'feed', countryName: '포르투갈' }];
eq(liveCardRegions([{ id: 'g-eu', records: ['r6'], visitedRegions: [madrid, lisbon] }], recsPtOnly, KO), [lisbon],
  'live: 이 나라 기록이 카드에서 사라지면 그 나라 지역은 죽는다(시트에 안 뜨는 카드의 지역을 그리지 않는다)');
// 재현 ①: 포르투갈 분할 카드가 스페인 카드를 흡수 — 오버라이드가 포르투갈이라 스페인 시트에 안 뜬다
eq(liveCardRegions([{ id: 'g-pt', records: ['r3'], countryName: '포르투갈', visitedRegions: [madrid, lisbon] }], recs, KO), [lisbon],
  'live: 다른 나라 분할 카드에 붙은 지역은 죽는다');
eq(liveCardRegions([{ id: 'g-x', records: ['r1'], visitedRegions: [{ iso3: 'ZZZ', nameEn: 'ZZ-1', name: '?' }] }], recs, KO), [],
  'live: 모르는 국가 코드의 지역은 살아 있지 않다');
eq(liveCardRegions([{ id: 'g-jp', records: ['r1'] }], recs, KO), [], 'live: 지역 없는 카드 → 빈 결과');
eq(liveCardRegions([{ id: 'g-snap', records: ['r2'], visitedRegions: [tokyo] }], recs, KO), [],
  'live: 스냅만 든 카드의 지역은 죽는다(시트 후보와 같은 스냅 제외)');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
