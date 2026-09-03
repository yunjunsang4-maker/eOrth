// src/services/photoAI/recoStorage.verify.ts
//
// 죽은 그룹 청소(sweepRecoStates)의 순수 판정부 검증.
// AsyncStorage는 recoStorage.ts 안에서 지연 require라 이 파일은 RN 없이 tsx로 돈다.
import {
  recoStateKeyToTripGroupId,
  selectDeadRecoKeys,
  RECO_STATE_KEY_PREFIX,
} from './recoStorage';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// ── recoStateKeyToTripGroupId: 키 → tripGroupId 정확 분해 ──
eq(recoStateKeyToTripGroupId(`${RECO_STATE_KEY_PREFIX}trip-a`), 'trip-a', '상태 키에서 gid 복원');
eq(recoStateKeyToTripGroupId(`${RECO_STATE_KEY_PREFIX}gid/슬래시 포함`), 'gid/슬래시 포함',
  'gid에 구분자·한글이 섞여도 접두사 뒤 전체가 gid다');
// 핵심 경계: 같은 모듈의 LOG_KEY('@photoAI/recoLog')는 '/' 하나 차이로 상태 키가 아니다.
// startsWith 오판으로 로그를 지우면 v1 수집 데이터가 통째로 사라진다.
eq(recoStateKeyToTripGroupId('@photoAI/recoLog'), null, '접두가 비슷한 로그 키는 상태 키가 아니다');
eq(recoStateKeyToTripGroupId(RECO_STATE_KEY_PREFIX), null, '접두사만 있고 gid가 비면 상태 키가 아니다');
eq(recoStateKeyToTripGroupId('eorth-trip-photo-pool'), null, '무관한 키는 null');

// ── selectDeadRecoKeys: 죽은 그룹 것만 고른다 ──
// 불변식: 살아 있는 여행의 키는 절대 고르지 않는다. 오삭제는 수 분짜리 재분석
// (앨범 폴백 200장)과 닫음 기록 유실이고, 누수는 몇 KB 잔존일 뿐이다.
{
  const keys = [
    `${RECO_STATE_KEY_PREFIX}trip-a`,
    `${RECO_STATE_KEY_PREFIX}trip-b`,
    `${RECO_STATE_KEY_PREFIX}trip-ab`,
    '@photoAI/recoLog',
    'eorth-trip-photo-pool',
  ];
  eq(selectDeadRecoKeys(keys, ['trip-a']),
    [`${RECO_STATE_KEY_PREFIX}trip-b`, `${RECO_STATE_KEY_PREFIX}trip-ab`],
    '살아 있는 trip-a는 남기고 죽은 것만 — trip-ab는 별개 gid(접두 오판 없음)');
  eq(selectDeadRecoKeys(keys, ['trip-ab']),
    [`${RECO_STATE_KEY_PREFIX}trip-a`, `${RECO_STATE_KEY_PREFIX}trip-b`],
    '역방향 접두(trip-ab만 생존)에서도 trip-a를 오판하지 않는다');
  eq(selectDeadRecoKeys(keys, ['trip-a', 'trip-b', 'trip-ab']), [],
    '전부 살아 있으면 고르는 것이 없다');
  eq(selectDeadRecoKeys(keys, []), [],
    'alive가 비면 아무것도 고르지 않는다 — hydrate 실패가 빈 목록으로 위장할 수 있다');
  eq(selectDeadRecoKeys(keys, ['trip-z']),
    [`${RECO_STATE_KEY_PREFIX}trip-a`, `${RECO_STATE_KEY_PREFIX}trip-b`, `${RECO_STATE_KEY_PREFIX}trip-ab`],
    '상태 키가 아닌 키(로그·pool)는 어떤 경우에도 삭제 대상이 아니다');
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
