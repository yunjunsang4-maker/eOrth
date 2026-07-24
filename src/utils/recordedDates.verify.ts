// collectRecordedRanges 순수 로직 검증 — recordId·countryLabel·제외규칙·겹침
import { collectRecordedRanges } from './recordedDates';
import type { TravelRecord } from '../store/recordStore';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}

const rec = (o: Partial<TravelRecord>): TravelRecord => o as TravelRecord;

const recs: TravelRecord[] = [
  rec({ id: 'r1', countryName: '일본', countryFlag: '🇯🇵', startDate: '2025.04.06', endDate: '2025.04.09' }),
  rec({ id: 'r2', countryName: '베트남',
        countries: [{ flag: '🇻🇳', name: '베트남' }, { flag: '🇹🇭', name: '태국' }],
        startDate: '2025.05.01', endDate: '2025.05.03' }),
  rec({ id: 'd1', countryName: '프랑스', startDate: '2025.06.01', endDate: '2025.06.02', isDraft: true }),
  rec({ id: 'o1', countryName: '미국', startDate: '2025.07.01', endDate: '2025.07.02', isMyPost: false }),
];

const ranges = collectRecordedRanges(recs);

const r1 = ranges.get('2025-04-06');
assert(!!r1 && r1.recordId === 'r1', 'recordId 매핑(r1)');
assert(!!r1 && r1.countryLabel === '일본', '단일국가 라벨=일본');
assert(ranges.has('2025-04-09'), '기간 마지막날 포함');
assert(!ranges.has('2025-04-10'), '기간 밖 미포함');

const r2 = ranges.get('2025-05-01');
assert(!!r2 && r2.countryLabel === '베트남 외 1', '다국가 라벨=베트남 외 1');

assert(!ranges.has('2025-06-01'), '임시저장(draft) 제외');
assert(!ranges.has('2025-07-01'), '타인 글(isMyPost=false) 제외');

const ex = collectRecordedRanges(recs, 'r1');
assert(!ex.has('2025-04-06'), 'excludeId 기록 제외');

const overlap: TravelRecord[] = [
  rec({ id: 'a', countryName: '일본', startDate: '2025.08.01', endDate: '2025.08.05' }),
  rec({ id: 'b', countryName: '태국', startDate: '2025.08.03', endDate: '2025.08.04' }),
];
const ov = collectRecordedRanges(overlap);
assert(ov.get('2025-08-03')?.recordId === 'a', '겹침: 먼저 만난 기록(a) 유지');

if (failures > 0) { console.error(`\n${failures}개 실패`); process.exit(1); }
console.log('\n모든 검증 통과');
