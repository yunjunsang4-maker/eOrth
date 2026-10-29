// src/utils/blockMatch.verify.ts — 차단 판정(handle + 계정 uuid) 규칙 검증
import { isBlockedIn, isProfileUuid, matchesBlockEntry } from './blockMatch';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const UID_A = '11111111-2222-3333-4444-555555555555';
const UID_B = '99999999-8888-7777-6666-555555555555';

// 백필로 uuid까지 채워진 정상 차단 항목
const alice = { name: 'alice', handle: 'alice', id: UID_A };
// handle 없는 구버전 항목(이름만)
const legacy = { name: '김여행' };

// 이번 수정의 본 버그 — 상대가 아이디를 alice → alice_new로 바꾼 뒤 캐시된 글이 새 handle로 온다
eq(isBlockedIn([alice], { name: 'alice_new', handle: 'alice_new', id: UID_A }), true,
  'id 일치·handle 다름(아이디 변경) → 차단');

// 기존 규칙 유지 — id 없이 handle만 넘기는 화면(DM 토스트 등)
eq(isBlockedIn([alice], { handle: 'alice' }), true, 'handle 일치(id 없음) → 차단');

// id가 한쪽에만 있으면 handle 규칙으로 떨어진다
eq(isBlockedIn([{ name: 'bob', handle: 'bob' }], { handle: 'bob', id: UID_B }), true,
  '차단 항목에 id 없음 + handle 일치 → 차단(handle 폴백)');
eq(isBlockedIn([{ name: 'bob', handle: 'bob' }], { handle: 'bob2', id: UID_B }), false,
  '차단 항목에 id 없음 + handle 다름 → 차단 아님');
eq(isBlockedIn([alice], { handle: 'alice_new' }), false,
  '조회 쪽 id 없음 + handle 다름 → 차단 아님(id가 없으면 알 수 없다)');

// 다른 사람의 uuid면 handle이 달라도 당연히 차단 아님
eq(isBlockedIn([alice], { handle: 'carol', id: UID_B }), false, 'id 다름·handle 다름 → 차단 아님');

// 구버전 이름 전용 항목 — 이름 폴백은 여기서만
eq(isBlockedIn([legacy], { name: '김여행', handle: 'kim' }), true, '구버전 이름 전용 항목: 이름 일치 → 차단');
eq(isBlockedIn([legacy], { handle: '김여행' }), false, '구버전 이름 전용 항목: name 안 넘기면 → 차단 아님');

// 동명이인 보호 — handle 있는 항목은 이름을 보지 않는다
eq(isBlockedIn([alice], { name: 'alice', handle: 'alice2' }), false,
  '같은 표시이름·다른 handle → 차단 아님(동명이인 오탐 방지)');

// 합성 id('dm-핸들')는 uuid가 아니라 id 비교에 쓰지 않는다 — 우연 일치로 오탐하지 않게
eq(matchesBlockEntry({ name: 'x', handle: 'old', id: 'dm-old' }, { handle: 'new', id: 'dm-old' }), false,
  '비-uuid 합성 id 일치는 무시 → handle 규칙(다름) → 차단 아님');

// 널 계열 — 빈 문자열·undefined는 일치로 치지 않는다
eq(isBlockedIn([{ name: '', handle: '', id: '' }], { name: '', handle: '', id: '' }), false,
  '전부 빈 문자열 → 차단 아님');
eq(isBlockedIn([], { handle: 'alice', id: UID_A }), false, '차단 목록 비었음 → 차단 아님');

// isProfileUuid — recordStore 백필이 '채울 대상'을 고르는 기준. 합성 id를 '있음'으로 보면 영영 안 채워진다
eq(isProfileUuid(UID_A), true, 'isProfileUuid: 정상 uuid → true');
eq(isProfileUuid('dm-alice'), false, "isProfileUuid: 오프라인 차단 합성값 'dm-핸들' → false(백필 대상)");
eq(isProfileUuid(''), false, 'isProfileUuid: 빈 문자열 → false');
eq(isProfileUuid(undefined), false, 'isProfileUuid: undefined → false');
eq(isProfileUuid(null), false, 'isProfileUuid: null → false');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
