// src/utils/tripVisitStats.verify.ts
import { buildVisitEvents, yearlyCountsFromEvents, activeYearAverageFromEvents } from './tripVisitStats';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const R = (id: string, extra: object = {}) => ({ id, countryName: '일본', countryFlag: '🇯🇵', date: '2025.03.01', ...extra });

// 1. 핵심 — 한 카드에 기록 3개여도 방문은 1회
eq(
  buildVisitEvents([{ records: ['a', 'b', 'c'] }], [R('a'), R('b'), R('c')]),
  [{ countries: [{ name: '일본', flag: '🇯🇵' }], year: '2025', hasRegion: false }],
  '카드 1장 + 기록 3개 = 방문 1회',
);

// 2. 카드 오버라이드(다국가 분할)가 첫 멤버 값보다 우선
eq(
  buildVisitEvents(
    [{ records: ['a'], countryName: '포르투갈', countryFlag: '🇵🇹', date: '2024.07.10' }],
    [R('a', { countryName: '스페인', countryFlag: '🇪🇸' })],
  ),
  [{ countries: [{ name: '포르투갈', flag: '🇵🇹' }], year: '2024', hasRegion: false }],
  '카드 오버라이드 우선(국가·날짜)',
);

// 3. 카드 미소속 기록은 기록 1건 = 방문 1회 폴백
eq(
  buildVisitEvents([{ records: ['a'] }], [R('a'), R('loose', { date: '2023.01.02' })]),
  [
    { countries: [{ name: '일본', flag: '🇯🇵' }], year: '2025', hasRegion: false },
    { countries: [{ name: '일본', flag: '🇯🇵' }], year: '2023', hasRegion: false },
  ],
  '미소속 기록 폴백',
);

// 4. 미소속 다국가 기록 — 이벤트 1개에 국가 N개 (연도별 1회, 국가별 각 1회)
{
  const ev = buildVisitEvents([], [R('m', { countries: [{ name: '스페인', flag: '🇪🇸' }, { name: '포르투갈', flag: '🇵🇹' }] })]);
  eq(ev.length, 1, '다국가 미소속 기록 = 이벤트 1개');
  eq(ev[0].countries.length, 2, '  그 이벤트에 국가 2개');
}

// 5. 타인 글(isMyPost=false)은 카드 멤버든 미소속이든 제외
eq(
  buildVisitEvents([{ records: ['x'] }], [R('x', { isMyPost: false }), R('y', { isMyPost: false })]),
  [],
  '타인 글 제외',
);

// 6. 빈 카드(기록 전부 삭제)는 방문 아님 + 그 id는 폴백으로도 안 살아남
eq(buildVisitEvents([{ records: ['gone'] }], []), [], '빈 카드 제외');

// 7. 삭제된 멤버는 걸러지고 남은 멤버 기준으로 해석
eq(
  buildVisitEvents([{ records: ['gone', 'a'] }], [R('a')]),
  [{ countries: [{ name: '일본', flag: '🇯🇵' }], year: '2025', hasRegion: false }],
  '삭제 멤버 필터 후 첫 생존 멤버 기준',
);

// 8. 날짜 폴백: 카드 date 없음 → 첫 멤버 date 없음 → startDate
eq(
  buildVisitEvents([{ records: ['a'] }], [R('a', { date: undefined, startDate: '2022.11.05' })]),
  [{ countries: [{ name: '일본', flag: '🇯🇵' }], year: '2022', hasRegion: false }],
  '연도: startDate 폴백',
);

// 9. 지역(도시) 방문 표시 — "도시로 기록하면 국가도 방문으로 센다" 규칙의 근거 값.
//    화면(StatsScreen/StatsDetailScreen)은 hasRegion=true인 이벤트를 거주국이어도 방문으로 통과시킨다.
{
  // 카드 자체에 지역이 있으면(국내 지역 카드 "부산 여행") true
  eq(
    buildVisitEvents([{ records: ['a'], regionName: '부산' }], [R('a', { countryName: '대한민국', countryFlag: '🇰🇷' })]),
    [{ countries: [{ name: '대한민국', flag: '🇰🇷' }], year: '2025', hasRegion: true }],
    '카드 regionName → hasRegion=true',
  );
  // 카드엔 없어도 멤버 기록에 지역이 있으면 true
  eq(
    buildVisitEvents([{ records: ['a'] }], [R('a', { countryName: '대한민국', countryFlag: '🇰🇷', regionName: '부산' })]),
    [{ countries: [{ name: '대한민국', flag: '🇰🇷' }], year: '2025', hasRegion: true }],
    '멤버 regionName → hasRegion=true',
  );
  // 카드 미소속 폴백 기록도 동일
  eq(
    buildVisitEvents([], [R('loose', { countryName: '대한민국', countryFlag: '🇰🇷', regionName: '제주' })]),
    [{ countries: [{ name: '대한민국', flag: '🇰🇷' }], year: '2025', hasRegion: true }],
    '미소속 기록 regionName → hasRegion=true',
  );
}

// 9. 연도별 집계 + 연평균
{
  const ev = buildVisitEvents(
    [{ records: ['a'] }, { records: ['b'], date: '2025.05.01' }, { records: ['c'], date: '2023.02.01' }],
    [R('a'), R('b'), R('c')],
  );
  eq(yearlyCountsFromEvents(ev), { '2025': 2, '2023': 1 }, '연도별: 카드 단위 집계');
  eq(activeYearAverageFromEvents(ev), '1.5', '연평균: (2+1)/2년');
}

// 10. 날짜를 못 읽는 이벤트는 연도별에서 제외되지만 이벤트 자체는 존재(국가별 집계용)
{
  const ev = buildVisitEvents([{ records: ['a'] }], [R('a', { date: '어느날' })]);
  eq(ev.length, 1, '날짜 불명 이벤트 존재');
  eq(yearlyCountsFromEvents(ev), {}, '  연도별에선 제외');
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
