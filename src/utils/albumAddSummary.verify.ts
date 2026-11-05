// src/utils/albumAddSummary.verify.ts
import { dayKeyToDate, summarizeAddedDays } from './albumAddSummary';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// 로컬 필드로 되읽어 비교한다 — toISOString은 UTC라 시간대마다 결과가 달라진다
const local = (d: Date | null) => (d ? [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()] : null);

// ── dayKeyToDate ──
// 정상: 그날 로컬 자정 — 시트(dayRangeMs)가 이 값으로 00:00~23:59:59.999를 잡는다
eq(local(dayKeyToDate('2026.03.02')), [2026, 3, 2, 0, 0], '정상: 2026.03.02 → 로컬 3월 2일 00:00');
// 경계: 연말·윤일
eq(local(dayKeyToDate('2025.12.31')), [2025, 12, 31, 0, 0], '경계: 12월 31일');
eq(local(dayKeyToDate('2028.02.29')), [2028, 2, 29, 0, 0], '경계: 윤년 2월 29일');
// 없는 날짜 — Date가 다음 달로 넘기는 것을 막는다(엉뚱한 날 사진이 뜨면 안 된다)
eq(dayKeyToDate('2026.02.30'), null, '없는 날짜 2026.02.30 → null');
eq(dayKeyToDate('2026.13.01'), null, '없는 달 13월 → null');
// AlbumTimeline '날짜 미상' 그룹 키 — 날짜 시트 대신 일반 선택기로 가야 한다
eq(dayKeyToDate('undated'), null, "'undated' → null");
// 널 계열 각각
eq(dayKeyToDate(''), null, "'' → null");
eq(dayKeyToDate(undefined), null, 'undefined → null');
eq(dayKeyToDate(null), null, 'null → null');
// 표기 흔들림 — 다른 구분자·공백은 타임라인 키가 아니다
eq(dayKeyToDate('2026-03-02'), null, "하이픈 구분 '2026-03-02' → null");
eq(dayKeyToDate(' 2026.03.02'), null, '앞 공백 → null');

// ── summarizeAddedDays ──
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
// 정상: 같은 날 여러 장은 하루로, 날짜는 오름차순
eq(
  summarizeAddedDays([at(2026, 3, 3), at(2026, 3, 2), at(2026, 3, 2, 18)]),
  { days: ['2026.03.02', '2026.03.03'], dated: 3, undated: 0 },
  '정상: 3장 → 3월 2일·3일(오름차순), 날짜 미상 0',
);
// 자정 직전·직후는 다른 날 — 로컬 날짜 기준
eq(
  summarizeAddedDays([new Date(2026, 2, 2, 23, 59).getTime(), new Date(2026, 2, 3, 0, 1).getTime()]).days,
  ['2026.03.02', '2026.03.03'],
  '경계: 23:59와 00:01은 서로 다른 날',
);
// 시각 없는 사진 — undefined·null·0·NaN 각각 '날짜 미상'
eq(summarizeAddedDays([undefined, null, 0, NaN, at(2026, 3, 2)]), { days: ['2026.03.02'], dated: 1, undated: 4 }, '널 계열 4종은 날짜 미상으로 센다');
// 0장
eq(summarizeAddedDays([]), { days: [], dated: 0, undated: 0 }, '빈 배열 → 모두 0');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
