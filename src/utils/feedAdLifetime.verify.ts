// src/utils/feedAdLifetime.verify.ts — 피드 광고 만료·재요청 쿨다운·지연 destroy
import { AD_TTL_MS, AD_RETRY_COOLDOWN_MS, isAdExpired, inAdRetryCooldown, createAdRetirement } from './feedAdLifetime';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const T0 = 1_700_000_000_000;

// ── 만료(1시간) ──
eq(AD_TTL_MS, 3_600_000, 'TTL = 1시간(Google: ads expire after an hour)');
eq(isAdExpired(T0, T0), false, '방금 받은 광고는 만료 아님');
eq(isAdExpired(T0, T0 + AD_TTL_MS - 1), false, '경계 직전(59:59.999)은 아직 유효');
eq(isAdExpired(T0, T0 + AD_TTL_MS), true, '정확히 1시간이면 만료');
eq(isAdExpired(T0, T0 + 3 * AD_TTL_MS), true, '한참 지난 광고는 만료');
// 기기 시계를 뒤로 돌린 경우 — 만료로 보면 멀쩡한 광고를 버리고 재요청한다
eq(isAdExpired(T0, T0 - 60_000), false, '시계가 뒤로 가도 만료 아님');

// ── 재요청 쿨다운 ──
eq(inAdRetryCooldown(undefined, T0), false, '실패 기록 없음 → 바로 요청');
eq(inAdRetryCooldown(T0, T0), true, '방금 실패 → 쉼');
eq(inAdRetryCooldown(T0, T0 + AD_RETRY_COOLDOWN_MS - 1), true, '쿨다운 직전 → 아직 쉼');
eq(inAdRetryCooldown(T0, T0 + AD_RETRY_COOLDOWN_MS), false, '쿨다운 경과 → 재요청');
// 시계가 뒤로 가면 쿨다운이 무한히 길어질 수 있다 — 쉬지 않고 재요청을 허용한다
eq(inAdRetryCooldown(T0, T0 - 5_000), false, '시계가 뒤로 가면 쿨다운으로 묶지 않음');

// ── 지연 destroy: 그리는 셀이 있는 동안 destroy 금지 ──
{
  const destroyed: string[] = [];
  const r = createAdRetirement<string>((ad) => destroyed.push(ad));

  // 아무도 안 그리는 광고를 retire → 즉시 destroy(Google: destroy must be called on all ads)
  r.retire('idle');
  eq(destroyed, ['idle'], '그리는 셀 없음: retire 즉시 destroy');

  // 셀 1개가 그리는 중 retire → 보류, 그 셀이 release하면 destroy
  r.retain('A');
  r.retire('A');
  eq(destroyed, ['idle'], '그리는 셀 있음: retire해도 destroy 보류(해제된 광고를 그리지 않게)');
  r.release('A');
  eq(destroyed, ['idle', 'A'], '마지막 셀 release → destroy');
  r.release('A');
  eq(destroyed, ['idle', 'A'], '여분 release는 두 번 destroy하지 않는다');

  // 셀 2개(같은 광고) — 둘 다 놓아야 destroy
  r.retain('B'); r.retain('B');
  r.retire('B');
  r.release('B');
  eq(destroyed.includes('B'), false, '셀 2개 중 1개만 release: 아직 보류');
  r.release('B');
  eq(destroyed.includes('B'), true, '셀 2개 모두 release → destroy');

  // retire 안 된(보관 중) 광고는 release돼도 destroy하지 않는다 — 재마운트 때 다시 쓴다
  r.retain('C');
  r.release('C');
  eq(destroyed.includes('C'), false, '보관 중 광고는 마운트 0이어도 destroy 안 함');

  // 가장 흔한 실제 경로(QA F2 변이 ①): 셀이 놓고 떠난 뒤 1시간이 지나 새 셀이 retire → 그리는 셀 0이니 즉시 destroy.
  // release가 카운트 0 항목을 지우지 않으면 retire가 '그리는 중'으로 오판해 영영 destroy하지 않는다(누수)
  r.retain('E');
  r.release('E');
  r.retire('E');
  eq(destroyed.filter((x) => x === 'E').length, 1, '놓은 뒤 retire → 즉시 destroy 1회');

  // 여분 release로 카운트가 음수로 내려가면 안 된다(QA F2 변이 ②) — 내려가면 다음 retain이 0이 되어 마지막 release에서 destroy를 놓친다
  r.release('F'); // 그린 적 없는데 release(여분)
  r.retain('F');
  r.retire('F');
  eq(destroyed.includes('F'), false, '여분 release 뒤 retain·retire: 그리는 중이라 보류');
  r.release('F');
  eq(destroyed.filter((x) => x === 'F').length, 1, '여분 release 뒤에도 마지막 release에서 destroy 1회');

  // destroy 총 횟수 — 각 광고 정확히 1회(이중 destroy·누락 모두 잡는다)
  eq([...destroyed].sort(), ['A', 'B', 'E', 'F', 'idle'], 'destroy 총 5회, 광고마다 1회');
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
