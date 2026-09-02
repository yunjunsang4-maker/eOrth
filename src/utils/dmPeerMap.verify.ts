import { normalizePeerMap, invertPeerMap, prunePeerMap } from './dmPeerMap';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const UID_A = '11111111-2222-3333-4444-555555555555';
const UID_B = '66666666-7777-8888-9999-000000000000';

// ─── normalizePeerMap: 저장 payload 가드 ───
// 정상 경로
eq(normalizePeerMap({ alice: UID_A, bob: UID_B }), { alice: UID_A, bob: UID_B }, '정상: 두 항목 그대로 통과');
// 경계 — 빈 맵
eq(normalizePeerMap({}), {}, '경계: 빈 객체는 빈 맵');
// 널 계열은 셋을 따로 본다 — 구버전 payload에는 peers 필드가 아예 없다(undefined)
eq(normalizePeerMap(undefined), {}, '널: undefined(구버전 payload — 이 필드가 없던 시절)');
eq(normalizePeerMap(null), {}, '널: null');
eq(normalizePeerMap(''), {}, "널: 빈 문자열");
// 손상 payload — throw하면 부분 복원 상태가 저장으로 원본을 덮어쓴다. 조용히 버려야 한다
eq(normalizePeerMap([UID_A, UID_B]), {}, '손상: 배열은 통째로 무시(맵이 아님)');
eq(normalizePeerMap('alice'), {}, '손상: 문자열은 통째로 무시');
eq(normalizePeerMap({ alice: 123 }), {}, '손상: 값이 숫자인 항목 제거');
eq(normalizePeerMap({ alice: null }), {}, '손상: 값이 null인 항목 제거');
eq(normalizePeerMap({ alice: { id: UID_A } }), {}, '손상: 값이 객체인 항목 제거');
eq(normalizePeerMap({ alice: '' }), {}, '손상: 값이 빈 문자열인 항목 제거');
eq(normalizePeerMap({ '': UID_A }), {}, '손상: 빈 handle 키 제거(대화 키가 될 수 없다)');
// 섞인 경우 — 멀쩡한 항목은 살아남아야 한다(전부 버리면 영속화한 의미가 없다)
eq(normalizePeerMap({ alice: UID_A, bob: 7 }), { alice: UID_A }, '혼합: 손상 항목만 버리고 정상 항목은 보존');
// ⚠️ 차단급 회귀 방어 — 폴백 항목(handle === uuid)이 이미 저장돼 있으면 복원 단계에서 치유해야 한다.
//    복원까지 막지 않으면, 이 결함을 한 번 겪은 기기는 매 실행 '복원 → if(!handle) 통과 → 재조회
//    없음 → 재저장'을 돌며 임시 uuid 행이 진짜 대화를 영구 대체한 상태에서 빠져나오지 못한다.
eq(
  normalizePeerMap({ [UID_A]: UID_A, alice: UID_B }),
  { alice: UID_B },
  '치유: 이미 저장된 폴백(<uuid> → 같은 uuid)은 복원 시 버린다',
);
eq(normalizePeerMap({ [UID_A]: UID_A }), {}, '치유: 폴백뿐이면 빈 맵(재조회 경로로 돌아간다)');

// ─── invertPeerMap: 역방향 맵 (따라잡기가 실제로 조회하는 방향) ───
eq(invertPeerMap({ alice: UID_A, bob: UID_B }), { [UID_A]: 'alice', [UID_B]: 'bob' }, '정상: uuid → handle 역전');
eq(invertPeerMap({}), {}, '경계: 빈 맵');
// 폴백 항목(handle === uuid)은 프로필 조회 실패 때 생긴 임시 이름이다 — 진짜 handle이 이겨야 한다
eq(
  invertPeerMap({ [UID_A]: UID_A, alice: UID_A }),
  { [UID_A]: 'alice' },
  '폴백 우선순위: 폴백(<uuid>)이 먼저 있어도 진짜 handle이 이긴다',
);
eq(
  invertPeerMap({ alice: UID_A, [UID_A]: UID_A }),
  { [UID_A]: 'alice' },
  '폴백 우선순위: 폴백이 뒤에 와도 진짜 handle을 덮어쓰지 못한다',
);
// 아이디 변경으로 진짜 handle이 둘 걸리면 나중(=최신 등록) 것이 이긴다
eq(
  invertPeerMap({ oldname: UID_A, newname: UID_A }),
  { [UID_A]: 'newname' },
  '아이디 변경: 진짜 handle끼리 겹치면 나중 항목이 최신',
);

// ─── prunePeerMap: 저장 직전 가지치기 ───
eq(
  prunePeerMap({ alice: UID_A, bob: UID_B }, { alice: [], bob: [] }),
  { alice: UID_A, bob: UID_B },
  '정상: 대화가 있는 항목은 전부 보존',
);
// 대화가 없는 항목은 버린다 — 무한 누적 방지(프로필만 스쳐 본 상대)
eq(
  prunePeerMap({ alice: UID_A, stranger: UID_B }, { alice: [] }),
  { alice: UID_A },
  '가지치기: 대화 키가 없는 상대(프로필만 조회)는 제거',
);
// ⚠️ 핵심 케이스 — clearConversation은 빈 배열을 남긴다. 길이로 판정하면 '비운 대화'의 매핑이
//    사라지는데, 서버엔 메시지가 남아 있어 따라잡기가 계속 그 상대를 물어오는 바로 그 자리다.
eq(
  prunePeerMap({ alice: UID_A }, { alice: [] }),
  { alice: UID_A },
  '비운 대화: 메시지 0건이어도 키가 있으면 보존(길이 기준이면 안 된다)',
);
// ⚠️ 차단급 회귀 방어 — 폴백으로 합류한 메시지는 conversations에 '<uuid>' 키를 만들어 버리므로
//    '키 존재' 조건만으로는 저장을 통과한다. 저장되면 다음 콜드 스타트에 프로필 재조회가 영영
//    막혀(if(!handle)이 truthy) 임시 uuid 행이 진짜 대화를 영구 대체한다.
eq(
  prunePeerMap({ [UID_A]: UID_A, alice: UID_B }, { [UID_A]: [], alice: [] }),
  { alice: UID_B },
  '폴백 차단: 대화 키가 있어도 폴백(<uuid> → 같은 uuid)은 저장하지 않는다',
);
eq(
  prunePeerMap({ [UID_A]: UID_A }, { [UID_A]: [] }),
  {},
  '폴백 차단: 폴백뿐이면 저장할 것이 없다',
);
eq(prunePeerMap({ alice: UID_A }, {}), {}, '경계: 대화가 하나도 없으면 전부 제거');
eq(prunePeerMap({}, { alice: [] }), {}, '경계: 매핑이 비어 있으면 빈 맵');
// 널 계열 — 리셋 직후 등에서 들어올 수 있다
eq(prunePeerMap({ alice: UID_A }, undefined as unknown as Record<string, unknown>), {}, '널: conversations가 undefined면 빈 맵');
// 프로토타입 키를 대화 키로 오인하지 않는다(hasOwnProperty로 검사하는 이유)
eq(
  prunePeerMap({ toString: UID_A }, { alice: [] }),
  {},
  '함정: toString 같은 프로토타입 키는 대화가 있는 것으로 세지 않는다',
);

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
