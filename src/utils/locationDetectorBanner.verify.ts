// src/utils/locationDetectorBanner.verify.ts
import { anyLocationDetectorActive, shouldShowLocationBanner, type LocationDetectorToggles } from './locationDetectorBanner';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// 모든 감지 토글이 꺼진 기준 상태. 각 케이스는 여기서 한 축만 바꿔 축의 영향만 본다.
const OFF: LocationDetectorToggles = {
  master: true,
  arrivalDetect: false,
  snapEnabled: false,
  travelMoment: false,
  returnDetect: false,
};

// ── anyLocationDetectorActive: 위치를 읽는 감지기가 살아 있는가 ──

// 경계(0개): master만 켜져 있고 감지 토글이 전부 꺼짐 → 아무도 위치를 읽지 않는다.
eq(anyLocationDetectorActive(OFF), false, '감지 토글 0개: 위치를 쓰는 감지기 없음');

// 정상 경로: 네 축을 각각 하나씩만 켜 본다. 하나라도 켜지면 배너를 띄운다.
// 넷을 뭉뚱그려 한 번만 검사하면 조건식에서 축 하나가 빠져도 통과해 버린다.
//
// ⚠️ 라벨을 정확히 읽을 것 — 이 검사들은 **순수 함수만** 부르고 감지기 소스
//    (ArrivalNotifier.tsx 등)를 열지 않는다. "그래서 그 감지기가 실제로 위치를 읽는다"는
//    보증이 아니다. 감지기 쪽 게이트(`!notifPrefs.master ||`)를 떼어내도 이 파일은 전부
//    통과한다. 함수와 감지기의 대응은 locationDetectorBanner.ts 헤더의 표가 근거이고,
//    그 표 자체는 지금 아무 검사도 지키지 않는다(11차 QA 발견 27).
eq(anyLocationDetectorActive({ ...OFF, arrivalDetect: true }), true, 'arrivalDetect 단독 → 배너 표시(감지기 소스는 검사하지 않음)');
eq(anyLocationDetectorActive({ ...OFF, snapEnabled: true }), true, 'snapEnabled 단독 → 배너 표시(감지기 소스는 검사하지 않음)');
eq(anyLocationDetectorActive({ ...OFF, travelMoment: true }), true, 'travelMoment 단독 → 배너 표시(감지기 소스는 검사하지 않음)');
eq(anyLocationDetectorActive({ ...OFF, returnDetect: true }), true, 'returnDetect 단독 → 배너 표시(감지기 소스는 검사하지 않음)');

// master는 감지기 4종 공통의 상위 게이트다. 꺼지면 하위 토글 값과 무관하게 아무도 안 돈다.
// (알림 설정 화면도 master가 꺼지면 하위 토글을 disabled + 꺼짐으로 표시한다)
eq(
  anyLocationDetectorActive({ master: false, arrivalDetect: true, snapEnabled: true, travelMoment: true, returnDetect: true }),
  false,
  'master OFF: 하위 토글이 전부 켜져 있어도 감지기는 안 돈다',
);

// 최대치: master + 넷 전부 → 당연히 활성
eq(
  anyLocationDetectorActive({ master: true, arrivalDetect: true, snapEnabled: true, travelMoment: true, returnDetect: true }),
  true,
  '전부 ON: 활성',
);

// ── shouldShowLocationBanner: 배너를 띄울 것인가 ──

const ALL_ON: LocationDetectorToggles = {
  master: true, arrivalDetect: true, snapEnabled: true, travelMoment: true, returnDetect: true,
};

// 핵심 케이스 — 이번 수정이 겨냥한 상태: 토글은 켜져 있는데 권한이 없어 기능이 조용히 죽은 상태.
eq(shouldShowLocationBanner(false, ALL_ON), true, '권한 없음 + 감지 토글 ON: 배너 표시');

// 권한이 있으면 알릴 것이 없다.
eq(shouldShowLocationBanner(true, ALL_ON), false, '권한 있음: 배너 숨김');

// null = 아직 확인 전(비동기 조회 중). false와 뭉뚱그리면 화면 진입 직후 배너가 번쩍인다.
eq(shouldShowLocationBanner(null, ALL_ON), false, '권한 확인 전(null): 배너 숨김 — 진입 시 깜빡임 방지');

// 권한이 없어도 쓸 기능이 없으면 조르지 않는다(불필요한 권한 요구 자체가 5.1.1 위험).
eq(shouldShowLocationBanner(false, OFF), false, '권한 없음 + 감지 토글 전부 OFF: 배너 숨김');

// master만 꺼도 배너가 사라져야 한다 — 하위 토글은 켜진 채 남아 있지만 아무도 위치를 안 쓴다.
eq(
  shouldShowLocationBanner(false, { ...ALL_ON, master: false }),
  false,
  '권한 없음 + master OFF: 배너 숨김(하위 토글이 켜져 있어도)',
);

// 최소 활성: 감지 토글 하나만 켜져 있어도 그 하나는 죽어 있으므로 알려야 한다.
eq(
  shouldShowLocationBanner(false, { ...OFF, snapEnabled: true }),
  true,
  '권한 없음 + snapEnabled 하나만 ON: 배너 표시',
);

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
