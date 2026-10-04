// src/services/photoAI/recoStorage.verify.ts
//
// 죽은 그룹 청소(sweepRecoStates)의 순수 판정부 검증.
// AsyncStorage는 recoStorage.ts 안에서 지연 require라 이 파일은 RN 없이 tsx로 돈다.
import {
  recoStateKeyToTripGroupId,
  selectDeadRecoKeys,
  RECO_STATE_KEY_PREFIX,
  runSerialByKey,
} from './recoStorage';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// ── runSerialByKey: dismissRecoCard 연타 경합 ──
// dismissRecoCard 자체는 AsyncStorage(지연 require)를 쓰므로 node에서 못 돌린다. 그래서 같은 읽기-수정-쓰기를
// 가짜 비동기 저장소로 재현하고, dismissRecoCard가 쓰는 줄 세우기(runSerialByKey)를 씌웠을 때만 둘 다 남는지 본다.
(async () => {
  const tick = () => new Promise<void>((r) => setTimeout(r, 1));
  const store = new Map<string, string[]>();
  const read = async (gid: string) => { await tick(); return [...(store.get(gid) ?? [])]; };
  const write = async (gid: string, ids: string[]) => { await tick(); store.set(gid, ids); };
  const dismissRaw = async (gid: string, id: string) => {
    const ids = await read(gid);
    if (ids.includes(id)) return;
    await write(gid, [...ids, id]);
  };

  // 대조군 — 줄 세우기 없이 연타하면 둘 다 빈 상태를 읽어 앞선 닫음이 빠진다(이 결함을 재현하는지 확인)
  store.set('g', []);
  await Promise.all([dismissRaw('g', 'c1'), dismissRaw('g', 'c2')]);
  eq(store.get('g'), ['c2'], '대조군: 줄 세우기 없으면 연타 시 앞선 닫음(c1)이 사라진다');

  // 줄 세우기 — 세 번 연타해도 전부 남고 순서도 탭 순서
  store.set('g', []);
  await Promise.all(['c1', 'c2', 'c3'].map((id) => runSerialByKey('g', () => dismissRaw('g', id))));
  eq(store.get('g'), ['c1', 'c2', 'c3'], '줄 세우기: 연타 3회가 모두 저장된다(탭 순서)');

  // 같은 카드 중복 연타 — 한 번만 들어간다(뒤 작업이 앞 작업의 쓰기를 읽는다)
  store.set('g', []);
  await Promise.all([runSerialByKey('g', () => dismissRaw('g', 'c1')), runSerialByKey('g', () => dismissRaw('g', 'c1'))]);
  eq(store.get('g'), ['c1'], '같은 카드 연타: 중복 없이 1개');

  // 앞 작업 실패가 뒤 작업을 막지 않고, 실패는 그 호출자에게만 간다
  store.set('g', []);
  const bad = runSerialByKey('g', async () => { await tick(); throw new Error('저장 실패'); });
  const good = runSerialByKey('g', () => dismissRaw('g', 'c9'));
  const badResult = await bad.then(() => 'ok', () => 'rejected');
  await good;
  eq(badResult, 'rejected', '실패한 작업은 자기 호출자에게 reject');
  eq(store.get('g'), ['c9'], '앞 작업이 실패해도 뒤 작업은 돈다');

  // dismissRecoCard 자체가 줄 세우기를 거치는지 — 위 시험은 가짜 저장소라 실제 함수에서 래퍼를 빼도 통과한다(QA F3).
  // 그래서 소스에서 dismissRecoCard 본문(다음 export 전까지)이 runSerialByKey(tripGroupId, …)를 부르는지 본다.
  {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'recoStorage.ts'), 'utf8').replace(/\r\n/g, '\n');
    const body = src.split('export function dismissRecoCard(')[1]?.split('\nexport ')[0] ?? '';
    eq(/runSerialByKey\(\s*tripGroupId\s*,/.test(body), true, 'dismissRecoCard 본문이 runSerialByKey(tripGroupId, …)로 줄을 선다');
  }

  // 다른 여행끼리는 서로 기다리지 않는다 — 느린 g1 뒤에 g2가 줄 서지 않음
  const order: string[] = [];
  const slow = runSerialByKey('g1', async () => { await new Promise((r) => setTimeout(r, 30)); order.push('g1'); });
  const fast = runSerialByKey('g2', async () => { await tick(); order.push('g2'); });
  await Promise.all([slow, fast]);
  eq(order, ['g2', 'g1'], '다른 tripGroupId는 병렬(서로 줄 서지 않음)');

  if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
  console.log('\n✅ 모든 검증 통과');
})().catch((e) => { console.error('✗ 비동기 검증 예외', e); process.exit(1); });
