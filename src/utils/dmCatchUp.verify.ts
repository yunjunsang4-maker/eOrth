// src/utils/dmCatchUp.verify.ts
import { inboxCatchUpSince, advanceServerSeen, DM_CATCHUP_FALLBACK_MS } from './dmCatchUp';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const NOW = 1_700_000_000_000; // 고정 기준 시각 — now에 의존하는 폴백을 결정적으로 검증
// 받은 서버 메시지 — createdAt이 row.created_at(서버 시각)이라 유일하게 신뢰할 수 있는 기준점
const recv = (createdAt: number, id = `r${createdAt}`) => ({ createdAt, remoteId: id, isMine: false });
// 내가 보낸 메시지(전송 성공) — remoteId는 붙지만 createdAt은 addMessage가 넣은 기기 시계 그대로
const sentOk = (createdAt: number, id = `s${createdAt}`) => ({ createdAt, remoteId: id, isMine: true });
// 내가 보낸 메시지(미전송·전송 실패) — remoteId 없음
const sentLocal = (createdAt: number) => ({ createdAt, isMine: true });

// 1) 경계: 대화가 하나도 없다 (신규 설치 직후) → 기본 되돌아보기 7일
eq(inboxCatchUpSince({}, NOW), NOW - DM_CATCHUP_FALLBACK_MS, '빈 대화 → now - 7일 폴백');

// 2) 정상 경로: 받은 메시지 여러 개 → 그중 최댓값이 워터마크
eq(
  inboxCatchUpSince({ alice: [recv(1000), recv(3000), recv(2000)] }, NOW),
  3000,
  '받은 서버 메시지 중 최댓값을 고른다'
);

// 3) 핵심 케이스(F1): 전송에 성공해 remoteId가 붙은 '내 발신' 메시지의 createdAt은 여전히
//    기기 시계다(pushToBackend가 remoteId만 부착하고 createdAt을 갱신하지 않으며, sendMessage는
//    서버 created_at을 받아오지도 않는다). 시계가 앞선 단말에서 이 값이 워터마크가 되면
//    그 사이 도착한 메시지를 .gt(created_at)이 전부 걸러 영영 못 받는다.
//    ⚠️ remoteId 유무만으로 거르던 이전 구현은 이 케이스에서 실패한다(미래 시각을 그대로 반환).
eq(
  inboxCatchUpSince({ alice: [recv(3000), sentOk(NOW + 86_400_000)] }, NOW),
  3000,
  'F1: 전송 성공한 내 발신(remoteId 있음)의 미래 기기 시계는 워터마크에 끼어들지 못한다'
);

// 4) 로컬 전용(remoteId 없는 내 발신)도 마찬가지로 무시된다
eq(
  inboxCatchUpSince({ alice: [recv(3000), sentLocal(NOW + 86_400_000)] }, NOW),
  3000,
  '미전송·실패한 내 발신의 미래 시각도 무시'
);

// 5) 내가 보낸 것만 있는 대화(상대가 아직 답하지 않음) → 기준점 없음 → 폴백. 의도된 동작이다.
eq(
  inboxCatchUpSince({ alice: [sentOk(1000), sentLocal(2000)] }, NOW),
  NOW - DM_CATCHUP_FALLBACK_MS,
  '내 발신만 있는 대화 → 폴백(받은 기준점이 없다)'
);

// 6) 널 계열: createdAt 누락(구버전 메시지) 항목은 무시하고 나머지에서 고른다
eq(
  inboxCatchUpSince({ alice: [{ remoteId: 'r-old', isMine: false }, recv(5000)] }, NOW),
  5000,
  'createdAt 없는 수신본은 무시'
);

// 7) 널 계열: NaN·Infinity는 최댓값 비교를 오염시키므로 무시한다
eq(
  inboxCatchUpSince({ alice: [recv(NaN, 'r-nan'), recv(Infinity, 'r-inf'), recv(7000)] }, NOW),
  7000,
  'NaN·Infinity createdAt은 무시'
);

// 8) createdAt 없는 수신본만 있는 대화 → 쓸 수 있는 기준점이 없으므로 폴백
eq(
  inboxCatchUpSince({ alice: [{ remoteId: 'r-old', isMine: false }] }, NOW),
  NOW - DM_CATCHUP_FALLBACK_MS,
  'createdAt 없는 수신본뿐이면 폴백'
);

// 9) isMine이 없는 구버전/시드 메시지 — remoteId가 있어도 수신본으로 보고 센다.
//    (isMine은 Message 필수 필드라 실사용에선 항상 있다. 손상 payload에서 undefined면
//     `m.isMine`이 falsy가 되어 포함되는데, 서버본은 시각이 서버 것이므로 안전한 쪽이다.)
eq(
  inboxCatchUpSince({ alice: [{ createdAt: 6000, remoteId: 'r-noflag' }] }, NOW),
  6000,
  'isMine 없는 서버본은 수신본으로 취급'
);

// 10) 여러 대화(handle)에 걸친 최댓값 — 워터마크는 인박스 전체가 하나다(대화별이 아니다)
eq(
  inboxCatchUpSince({ alice: [recv(1000)], bob: [recv(9000)], carol: [recv(4000)] }, NOW),
  9000,
  '여러 대화 중 가장 최근 수신 시각을 쓴다'
);

// 11) 경계: 빈 배열 대화(clearConversation으로 비운 대화)가 섞여도 안전
eq(
  inboxCatchUpSince({ alice: [], bob: [recv(2500)] }, NOW),
  2500,
  '빈 배열 대화는 건너뛴다'
);

// 12) 마지막 수신이 아주 오래됐어도 상한 클램프를 걸지 않는다 —
//     30일 전으로 잘라내면 그 사이 온 메시지를 못 받는다(설계상 의도된 무제한 되돌아보기)
const OLD = NOW - 90 * 24 * 60 * 60 * 1000;
eq(
  inboxCatchUpSince({ alice: [recv(OLD)] }, NOW),
  OLD,
  '90일 전 수신 메시지도 그대로 워터마크(상한 클램프 없음)'
);

// 13) 방어: 손상된 payload로 배열이 아닌 값이 들어와도 throw하지 않는다
eq(
  inboxCatchUpSince({ alice: null as any, bob: [recv(1200)] }, NOW),
  1200,
  '배열이 아닌 대화 항목은 무시(손상 payload 방어)'
);

// ─── advanceServerSeen — '서버에서 이미 본 구간'의 바닥값 ───

// 14) 정상 경로: 조회 결과의 최대 createdAt으로 전진
eq(advanceServerSeen(0, [{ createdAt: 1000 }, { createdAt: 3000 }, { createdAt: 2000 }]), 3000,
  '조회 결과 최대 시각으로 바닥값 전진');

// 15) 절대 내려가지 않는다 — 옛 구간만 돌려받아도 바닥값을 낮추면 그 구간을 또 조회한다
eq(advanceServerSeen(5000, [{ createdAt: 1000 }]), 5000, '더 오래된 결과로는 내려가지 않는다');

// 16) 빈 결과(새 메시지 없음) → 전진할 값이 없으므로 그대로
eq(advanceServerSeen(5000, []), 5000, '빈 결과면 바닥값 유지');

// 17) R1 본체: 바닥값이 0에서 벗어나야 다음 회차가 같은 200건을 재조회하지 않는다
eq(advanceServerSeen(0, [{ createdAt: 4200 }]), 4200, '0 고착 해소 — 첫 조회로 바닥값이 선다');

// 18) NaN·Infinity 차단(중요): 바닥값이 NaN이 되면 since가 NaN → new Date(NaN).toISOString()이
//     RangeError를 던져 fetchInboxSince가 영구히 null만 반환한다(따라잡기 사망).
eq(advanceServerSeen(1000, [{ createdAt: NaN }, { createdAt: Infinity }, { createdAt: 2000 }]), 2000,
  'NaN·Infinity는 바닥값을 오염시키지 못한다');

// 19) createdAt 없는 항목·손상 항목 무시
eq(advanceServerSeen(1000, [{}, undefined as any, { createdAt: 1500 }]), 1500,
  'createdAt 없는 항목·undefined 항목 무시');

// 20) prev가 오염된 값이어도 0으로 복구해 계산한다(방어)
eq(advanceServerSeen(NaN, [{ createdAt: 2000 }]), 2000, 'prev가 NaN이면 0에서 다시 센다');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
