// src/utils/calendarRange.verify.ts
import {
  toDateKey,
  isSameDay,
  isBeforeDay,
  buildMonthGrid,
  daysInMonth,
  shiftMonth,
  nightsBetween,
  tripLength,
} from './calendarRange';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const d = (y: number, m: number, day: number, h = 0) => new Date(y, m - 1, day, h);

// ── toDateKey ── 한 자리 월·일이 0으로 채워져야 사전순 비교가 날짜 순서와 같아진다
eq(toDateKey(d(2026, 8, 30)), '2026-08-30', 'toDateKey: 두 자리 월·일');
eq(toDateKey(d(2026, 1, 5)), '2026-01-05', 'toDateKey: 한 자리 월·일은 0 패딩');
// 시각이 달라도 같은 키 — 시트가 자정 정규화를 놓친 Date를 받아도 비교가 흔들리면 안 된다
eq(toDateKey(d(2026, 8, 30, 23)), toDateKey(d(2026, 8, 30, 0)), 'toDateKey: 시각은 무시');

// ── isSameDay / isBeforeDay ──
eq(isSameDay(d(2026, 8, 30, 1), d(2026, 8, 30, 22)), true, 'isSameDay: 같은 날 다른 시각');
eq(isSameDay(d(2026, 8, 30), d(2026, 8, 31)), false, 'isSameDay: 하루 차이');
eq(isBeforeDay(d(2026, 8, 30), d(2026, 9, 1)), true, 'isBeforeDay: 월 경계를 넘어도 순서 유지');
eq(isBeforeDay(d(2026, 12, 31), d(2027, 1, 1)), true, 'isBeforeDay: 연 경계를 넘어도 순서 유지');
eq(isBeforeDay(d(2026, 8, 30), d(2026, 8, 30)), false, 'isBeforeDay: 같은 날은 false(경계)');
eq(isBeforeDay(d(2026, 9, 1), d(2026, 8, 30)), false, 'isBeforeDay: 역순은 false');

// ── buildMonthGrid ── 길이가 흔들리면 월 전환 때 시트 높이가 출렁인다
eq(buildMonthGrid(2026, 7).length, 42, 'buildMonthGrid: 항상 42칸(6주 고정)');
// 2026-08-01은 토요일(getDay 6) → 앞에 null 6칸
eq(buildMonthGrid(2026, 7).slice(0, 6).every(c => c === null), true, 'buildMonthGrid: 1일 요일만큼 앞 패딩(2026-08은 토요일=6칸)');
eq(buildMonthGrid(2026, 7)[6] ? toDateKey(buildMonthGrid(2026, 7)[6]!) : null, '2026-08-01', 'buildMonthGrid: 패딩 다음 칸이 1일');
eq(buildMonthGrid(2026, 7).filter(Boolean).length, 31, 'buildMonthGrid: 31일 달');
// 2026-02는 평년 28일 / 2024-02는 윤년 29일 — 윤년 처리를 Date에 맡기고 있는지 확인
eq(buildMonthGrid(2026, 1).filter(Boolean).length, 28, 'buildMonthGrid: 평년 2월은 28일');
eq(buildMonthGrid(2024, 1).filter(Boolean).length, 29, 'buildMonthGrid: 윤년 2월은 29일(경계)');
// 그리드의 날짜는 전부 자정 정규화 — 시각이 남으면 isSameDay 밖의 비교에서 어긋난다
eq(buildMonthGrid(2026, 7).filter(Boolean).every(c => c!.getHours() === 0 && c!.getMinutes() === 0), true, 'buildMonthGrid: 모든 칸이 자정 정규화');

// ── daysInMonth ──
eq(daysInMonth(2026, 0), 31, 'daysInMonth: 1월');
eq(daysInMonth(2026, 1), 28, 'daysInMonth: 평년 2월');
eq(daysInMonth(2024, 1), 29, 'daysInMonth: 윤년 2월');
eq(daysInMonth(2026, 3), 30, 'daysInMonth: 4월');

// ── shiftMonth ── 연 경계 롤오버가 틀리면 ‹ › 로 해를 넘길 때 엉뚱한 달이 뜬다
eq(shiftMonth(2026, 7, 1), { year: 2026, month: 8 }, 'shiftMonth: 다음 달');
eq(shiftMonth(2026, 11, 1), { year: 2027, month: 0 }, 'shiftMonth: 12월 +1 → 다음 해 1월(경계)');
eq(shiftMonth(2026, 0, -1), { year: 2025, month: 11 }, 'shiftMonth: 1월 -1 → 지난 해 12월(경계)');
eq(shiftMonth(2026, 7, 0), { year: 2026, month: 7 }, 'shiftMonth: 0이면 제자리');
// 연·월 점프는 여러 달을 한 번에 건너뛴다 — 12의 배수·초과분 모두 맞아야 한다
eq(shiftMonth(2026, 7, 12), { year: 2027, month: 7 }, 'shiftMonth: +12개월은 같은 달 다음 해');
eq(shiftMonth(2026, 7, -20), { year: 2024, month: 11 }, 'shiftMonth: -20개월(연 2회 롤오버)');

// ── nightsBetween ──
eq(nightsBetween(d(2026, 8, 1), d(2026, 8, 4)), 3, 'nightsBetween: 8/1~8/4는 3박');
eq(nightsBetween(d(2026, 8, 1), d(2026, 8, 1)), 0, 'nightsBetween: 당일은 0박(경계)');
eq(nightsBetween(d(2026, 8, 4), d(2026, 8, 1)), 0, 'nightsBetween: 역순이면 0(음수 금지)');
eq(nightsBetween(d(2026, 8, 30), d(2026, 9, 2)), 3, 'nightsBetween: 월 경계를 넘는 기간');
eq(nightsBetween(d(2026, 12, 30), d(2027, 1, 2)), 3, 'nightsBetween: 연 경계를 넘는 기간');
eq(nightsBetween(d(2026, 2, 27), d(2026, 3, 1)), 2, 'nightsBetween: 평년 2월 말 → 3월');
eq(nightsBetween(d(2024, 2, 27), d(2024, 3, 1)), 3, 'nightsBetween: 윤년 2월 말 → 3월(29일 포함)');
// 시각이 섞여 들어와도 '박' 수는 날짜만으로 세야 한다 — 23시 출발/1시 도착이 0박이 되면 안 된다
eq(nightsBetween(d(2026, 8, 1, 23), d(2026, 8, 2, 1)), 1, 'nightsBetween: 시각이 달라도 날짜 기준 1박');

// ── tripLength ──
eq(tripLength(d(2026, 8, 1), d(2026, 8, 4)), { nights: 3, days: 4 }, 'tripLength: 3박 4일');
eq(tripLength(d(2026, 8, 1), d(2026, 8, 1)), { nights: 0, days: 1 }, 'tripLength: 당일치기는 0박 1일(경계)');
eq(tripLength(d(2026, 8, 4), d(2026, 8, 1)), { nights: 0, days: 1 }, 'tripLength: 역순도 0박 1일로 수렴');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
