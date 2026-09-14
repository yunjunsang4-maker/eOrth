// collectRecordedRanges 순수 로직 검증 — recordId·countryLabel·제외규칙·겹침
import { collectRecordedRanges, layoutBandRuns } from './recordedDates';
import { buildMonthGrid } from './calendarRange';
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
const d3 = ov.get('2025-08-03');
assert(d3?.recordId === 'a', '중첩: 늦게 끝나는 a(8/5)가 대표 = 맵 값(탭 대상)');
assert(d3?.others?.length === 1 && d3.others[0].recordId === 'b', '중첩: 낀 b는 others로 보존(예전엔 통째로 사라졌다)');
assert(ov.get('2025-08-05')?.others === undefined, '겹침 밖은 others 없음');
// 인수인계(끝나는 날 = 시작하는 날): 탭하면 시작하는 쪽
const handoff: TravelRecord[] = [
  rec({ id: 'es', countryName: '스페인', startDate: '2025.09.01', endDate: '2025.09.06' }),
  rec({ id: 'pt', countryName: '포르투갈', startDate: '2025.09.06', endDate: '2025.09.08' }),
];
const h = collectRecordedRanges(handoff);
assert(h.get('2025-09-06')?.recordId === 'pt' && h.get('2025-09-06')?.others?.[0].recordId === 'es', '인수인계 날: 시작하는 포르투갈=대표, 끝나는 스페인=others');
assert(h.get('2025-09-05')?.others === undefined && h.get('2025-09-07')?.others === undefined, '전날·다음날은 단독');

// ── layoutBandRuns: 행 단위 알약 조각 ──
const runsOf = (recs: TravelRecord[], y: number, m0: number) => layoutBandRuns(buildMonthGrid(y, m0), collectRecordedRanges(recs));
const sig = (r: ReturnType<typeof layoutBandRuns>[number]) => `${r.recordId}:r${r.row}c${r.startCol}-${r.endCol}#${r.tripIndex}`;

// 2025-09: 1일=월(col1), 6일=토(col6), 7일=일(다음 행 col0). 6일은 두 알약이 겹친다
const hr = runsOf(handoff, 2025, 8).map(sig);
assert(hr.join(' ') === 'es:r0c1-6#0 pt:r0c6-6#1 pt:r1c0-1#1', '인수인계: 스페인 1~6, 포르투갈 6·7~8 — 6일 칸을 둘 다 덮음, 행마다 조각(칩도 행마다)');

// 2025-08: 1일=금(col5). 낀 여행 b는 지워지지 않고 a 위에 겹친다
const nr = runsOf(overlap, 2025, 7).map(sig);
assert(nr.join(' ') === 'a:r0c5-6#0 a:r1c0-2#0 b:r1c0-1#1', '낀 여행: a 두 행 + b 한 행, 시작일 순 tripIndex');

// 같은 날 시작한 두 여행: 끝나는 날 순, 그마저 같으면 id 순 — 렌더 순서가 흔들리지 않게
const sameStart: TravelRecord[] = [
  rec({ id: 'y', countryName: '일본', startDate: '2025.10.01', endDate: '2025.10.03' }),
  rec({ id: 'x', countryName: '태국', startDate: '2025.10.01', endDate: '2025.10.03' }),
];
assert(runsOf(sameStart, 2025, 9).map((r) => r.recordId).join() === 'x,y', '같은 시작·종료일이면 id 순으로 고정');

// 지난달부터 이어진 여행: 이 달 첫 행에 조각(칩은 조각마다 붙으므로 별도 표시 없음)
const carry: TravelRecord[] = [rec({ id: 'c', countryName: '미국', startDate: '2025.11.28', endDate: '2025.12.03' })];
assert(runsOf(carry, 2025, 11).map(sig).join() === 'c:r0c1-3#0', '지난달부터 이어진 여행: 12/1(월,col1)~3 조각');
assert(runsOf(carry, 2026, 0).length === 0, '기간 밖 달은 조각 없음');
assert(layoutBandRuns(buildMonthGrid(2025, 0), new Map()).length === 0, '기록 없으면 빈 배열');
// tripIndex는 보이는 달 기준 — 다른 달 여행이 많아도 이 달의 첫 여행은 0
const manyBefore: TravelRecord[] = [
  rec({ id: 'j', countryName: '일본', startDate: '2025.01.03', endDate: '2025.01.05' }),
  rec({ id: 'f', countryName: '태국', startDate: '2025.02.03', endDate: '2025.02.05' }),
  rec({ id: 's', countryName: '미국', startDate: '2025.09.10', endDate: '2025.09.12' }),
];
assert(runsOf(manyBefore, 2025, 8).every((r) => r.tripIndex === 0), '보이는 달에 여행이 하나면 tripIndex 0(칩 첫 색)');

if (failures > 0) { console.error(`\n${failures}개 실패`); process.exit(1); }
console.log('\n모든 검증 통과');
