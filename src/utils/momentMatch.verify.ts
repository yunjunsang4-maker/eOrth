// 순간 매칭 로직 검증 (jest 미사용). 실행: npx tsx src/utils/momentMatch.verify.ts
import { matchMoments, tripPeriodOf, countryNameToCode, parseDotDate } from './momentMatch';
import type { TravelMoment } from '../store/momentStore';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}

const at = (s: string) => new Date(s).getTime();
const mk = (over: Partial<TravelMoment>): TravelMoment => ({
  id: 'x', text: 't', createdAt: at('2026-07-02T10:00:00Z'), ...over,
});

// 국가+기간 모두 있으면 AND
{
  const ms = [mk({ countryCode: 'JP' }), mk({ countryCode: 'FR' })];
  const r = matchMoments(ms, { countryCode: 'JP', startMs: at('2026-07-01'), endMs: at('2026-07-04') });
  assert(r.length === 1 && r[0].countryCode === 'JP', '국가+기간 매칭: 일본만');
}
// 기간 앞뒤 1일 여유
{
  const ms = [mk({ countryCode: 'JP', createdAt: at('2026-06-30T20:00:00Z') })];
  const r = matchMoments(ms, { countryCode: 'JP', startMs: at('2026-07-01'), endMs: at('2026-07-04') });
  assert(r.length === 1, '시작 전날 캡처도 1일 패딩으로 포함');
}
// 기간 없으면 국가만
{
  const ms = [mk({ countryCode: 'JP' })];
  assert(matchMoments(ms, { countryCode: 'JP' }).length === 1, '기간 없음 → 국가만으로 매칭');
  assert(matchMoments(ms, { countryCode: 'FR' }).length === 0, '다른 국가는 제외');
}
// 국가 없는 순간(역지오코딩 실패)은 기간 겹칠 때만
{
  const ms = [mk({})];
  assert(matchMoments(ms, { countryCode: 'JP', startMs: at('2026-07-01'), endMs: at('2026-07-04') }).length === 1,
    '국가 없는 순간: 기간 겹치면 포함');
  assert(matchMoments(ms, { countryCode: 'JP' }).length === 0,
    '국가 없는 순간: 기간 정보 없으면 제외');
}
// tripPeriodOf: 기록들의 최소~최대
{
  const p = tripPeriodOf([
    { startDate: '2026.07.02', endDate: '2026.07.03' },
    { date: '2026.07.05' },
  ]);
  assert(p != null && p.startMs === parseDotDate('2026.07.02') && p.endMs === parseDotDate('2026.07.05'),
    'tripPeriodOf: 최소 시작~최대 종료');
  assert(tripPeriodOf([{}]) === null, '날짜 전혀 없으면 null');
}
// countryNameToCode
assert(countryNameToCode('일본') === 'JP', '일본 → JP');
assert(countryNameToCode('없는나라') === null, '미등록 국가 → null');

if (failures > 0) { console.error(`\n❌ ${failures}개 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
