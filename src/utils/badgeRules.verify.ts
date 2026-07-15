// 배지 자동 활성화 순수 로직 검증 (jest 미사용). 실행: npx tsx src/utils/badgeRules.verify.ts
import { computeTravelStats, computeEarnedBadgeIds, BadgeStatRecord, BadgeCatalogEntry } from './badgeRules';
import { COUNTRIES } from '../constants/countries';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}

// 카탈로그 더미: 데이터 비판정 배지 한 개(8, 삭제된 id라 영구히 비판정)만 static earned=true로 둔다.
const catalog: BadgeCatalogEntry[] = [
  { id: 8, earned: true },  // 데이터 판정 대상 아님 → 유지되어야 함
  { id: 16, earned: true },  // 데이터 판정 대상 → 데이터로 덮어써야 함
  { id: 1, earned: false },
];

// ── 빈 기록(내 기록 없음) ──
{
  const earned = computeEarnedBadgeIds([], catalog);
  assert(!earned.has(1), '기록 없으면 첫 기록(1) 미획득');
  assert(!earned.has(16), '기록 없으면 일본 재방문(16) 미획득(static 무시)');
  assert(!earned.has(22), '기록 없으면 섬 입문자(22) 미획득(이제 데이터 판정)');
  assert(earned.has(8), '데이터 비판정 배지(8)는 static earned 유지');
}

// ── 동행: 가족(123)·형제(124) ──
{
  const fam = computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', companions: ['가족'] }], catalog);
  assert(fam.has(123), '가족 동행 → 가족 여행(123) 획득');
  assert(!fam.has(124), '형제 없음 → 형제 여행(124) 미획득');

  const sib = computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', companions: ['형제'] }], catalog);
  assert(sib.has(124), '형제 동행 → 형제 여행(124) 획득');

  // 여러 동행 동시 선택 시 각각 점등
  const both = computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', companions: ['가족', '형제', '혼자'] }], catalog);
  assert(both.has(123) && both.has(124) && both.has(9), '가족+형제+혼자 동시 점등');
}

// ── 생일 여행(13): 여행 날짜에 생일(월·일)이 포함 + 피드/블로그/스트립 ──
{
  const opt = { birthday: '1998-03-15' };
  // 여행 기간이 생일을 포함 → 획득
  const inRange: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', viewType: 'feed', startDate: '2025.03.10', endDate: '2025.03.20' },
  ];
  assert(computeTravelStats(inRange, opt).hasBirthdayTrip, '여행기간(03.10~03.20)이 생일(03.15) 포함');
  assert(computeEarnedBadgeIds(inRange, catalog, opt).has(13), '생일 포함 → 생일 여행(13) 획득');

  // 생일 당일 단일 기록(시작=종료) → 획득
  const sameDay: BadgeStatRecord[] = [{ isMyPost: true, countryName: '일본', viewType: 'blog', startDate: '2024.03.15', endDate: '2024.03.15' }];
  assert(computeEarnedBadgeIds(sameDay, catalog, opt).has(13), '생일 당일 기록 → 13 획득');

  // 생일 미포함 → 미획득
  const outRange: BadgeStatRecord[] = [{ isMyPost: true, countryName: '일본', viewType: 'feed', startDate: '2025.07.01', endDate: '2025.07.10' }];
  assert(!computeEarnedBadgeIds(outRange, catalog, opt).has(13), '생일 미포함 → 13 미획득');

  // 스냅·앨범은 인정 안 함(생일이 들어가도)
  const snap: BadgeStatRecord[] = [{ isMyPost: true, countryName: '일본', viewType: 'snap', startDate: '2025.03.15', endDate: '2025.03.15' }];
  assert(!computeEarnedBadgeIds(snap, catalog, opt).has(13), '스냅은 생일 여행(13) 제외');

  // 생일 미설정 → 미획득
  assert(!computeEarnedBadgeIds(inRange, catalog).has(13), '생일 설정 없으면 13 미획득');

  // 해를 넘기는 여행(12.28~01.05)에 생일(01.01) 포함
  const newYear: BadgeStatRecord[] = [{ isMyPost: true, countryName: '일본', viewType: 'cut', startDate: '2024.12.28', endDate: '2025.01.05' }];
  assert(computeEarnedBadgeIds(newYear, catalog, { birthday: '2000-01-01' }).has(13), '해넘이 여행이 1/1 생일 포함 → 13');
}

// ── 당일치기(14)·30일 이상(15) ──
{
  // 시작=종료(0박)면 당일치기
  const sameDay: BadgeStatRecord[] = [{ isMyPost: true, countryName: '일본', startDate: '2025.03.01', endDate: '2025.03.01' }];
  assert(computeTravelStats(sameDay).hasDayTrip, '시작=종료 → 당일치기');
  assert(computeEarnedBadgeIds(sameDay, catalog).has(14), '당일치기(14) 획득');

  // date만 있고 종료일 없음 → 당일치기로 오인하면 안 됨(폴백 금지)
  const dateOnly: BadgeStatRecord[] = [{ isMyPost: true, countryName: '일본', date: '2025.03.01' }];
  assert(!computeTravelStats(dateOnly).hasDayTrip, 'date만 있으면 당일치기 아님');
  assert(!computeEarnedBadgeIds(dateOnly, catalog).has(14), 'date만 → 당일치기(14) 미획득');

  // 시작일만 있고 종료일 없음 → 당일치기 아님
  const startOnly: BadgeStatRecord[] = [{ isMyPost: true, countryName: '일본', startDate: '2025.03.01' }];
  assert(!computeTravelStats(startOnly).hasDayTrip, '시작일만 있으면 당일치기 아님');

  // 1박2일 → 당일치기 아님
  const oneNight: BadgeStatRecord[] = [{ isMyPost: true, countryName: '일본', startDate: '2025.03.01', endDate: '2025.03.02' }];
  assert(!computeTravelStats(oneNight).hasDayTrip, '1박2일은 당일치기 아님');

  // 30일 이상
  const long: BadgeStatRecord[] = [{ isMyPost: true, countryName: '일본', startDate: '2025.03.01', endDate: '2025.04.05' }]; // 35박
  assert(computeTravelStats(long).hasLongTrip, '35박 → 30일 이상');
  assert(computeEarnedBadgeIds(long, catalog).has(15), '30일 이상(15) 획득');

  // 정확히 29박 → 미획득 / 30박 → 획득(경계)
  assert(!computeTravelStats([{ isMyPost: true, countryName: '일본', startDate: '2025.03.01', endDate: '2025.03.30' }]).hasLongTrip, '29박 → 30일 미만');
  assert(computeTravelStats([{ isMyPost: true, countryName: '일본', startDate: '2025.03.01', endDate: '2025.03.31' }]).hasLongTrip, '30박 → 30일 이상');

  // 피드·블로그·스트립만 인정 — 앨범은 날짜가 있어도 14·15 제외
  const albumDay: BadgeStatRecord[] = [{ isMyPost: true, countryName: '일본', viewType: 'album', startDate: '2025.03.01', endDate: '2025.03.01' }];
  assert(!computeTravelStats(albumDay).hasDayTrip, '앨범 0박은 당일치기(14) 제외');
  const albumLong: BadgeStatRecord[] = [{ isMyPost: true, countryName: '일본', viewType: 'album', startDate: '2025.03.01', endDate: '2025.04.10' }];
  assert(!computeTravelStats(albumLong).hasLongTrip, '앨범 40박은 30일(15) 제외');
  // 스트립(cut)은 인정
  const cutDay: BadgeStatRecord[] = [{ isMyPost: true, countryName: '일본', viewType: 'cut', startDate: '2025.03.01', endDate: '2025.03.01' }];
  assert(computeTravelStats(cutDay).hasDayTrip, '스트립 0박 → 당일치기(14) 인정');
}

// ── 매분기 여행(53) — 피드·블로그·스트립 날짜가 4분기 모두 포함 ──
{
  // 각 분기(2월·5월·8월·11월) → 획득
  const fourQ: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', startDate: '2025.02.10', viewType: 'feed' },  // Q1
    { isMyPost: true, countryName: '일본', startDate: '2025.05.10', viewType: 'blog' },  // Q2
    { isMyPost: true, countryName: '일본', startDate: '2025.08.10', viewType: 'cut' },   // Q3
    { isMyPost: true, countryName: '일본', startDate: '2025.11.10', viewType: 'feed' },  // Q4
  ];
  assert(computeTravelStats(fourQ).quartersRecorded.size === 4, '4분기 모두 집계');
  assert(computeEarnedBadgeIds(fourQ, catalog).has(53), '4분기 모두 → 53 획득');

  // 3분기만(Q4 없음) → 미획득
  const threeQ = fourQ.slice(0, 3);
  assert(!computeEarnedBadgeIds(threeQ, catalog).has(53), '3분기만 → 53 미획득');

  // 분기는 연도 무관(다른 해라도 합산)
  const crossYear: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', startDate: '2023.02.10', viewType: 'feed' }, // Q1
    { isMyPost: true, countryName: '일본', startDate: '2024.05.10', viewType: 'feed' }, // Q2
    { isMyPost: true, countryName: '일본', startDate: '2024.08.10', viewType: 'feed' }, // Q3
    { isMyPost: true, countryName: '일본', startDate: '2025.11.10', viewType: 'feed' }, // Q4
  ];
  assert(computeEarnedBadgeIds(crossYear, catalog).has(53), '다른 해라도 4분기 → 53 획득');

  // 스냅은 분기 집계 안 됨 → Q4가 스냅이면 3분기 → 미획득
  const snapQ4: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', startDate: '2025.02.10', viewType: 'feed' },
    { isMyPost: true, countryName: '일본', startDate: '2025.05.10', viewType: 'feed' },
    { isMyPost: true, countryName: '일본', startDate: '2025.08.10', viewType: 'feed' },
    { isMyPost: true, countryName: '일본', startDate: '2025.11.10', viewType: 'snap' },
  ];
  assert(!computeEarnedBadgeIds(snapQ4, catalog).has(53), 'Q4가 스냅 → 53 미획득');
}

// ── 소셜: 좋아요(76)·동행(84·85·77)·댓글(75) ──
{
  // 좋아요 합산 100 → 76
  const likes: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', likes: 60 },
    { isMyPost: true, countryName: '일본', likes: 40 },
  ];
  assert(computeTravelStats(likes).likesReceived === 100, '좋아요 합산 100');
  assert(computeEarnedBadgeIds(likes, catalog).has(76), '좋아요 100 → 76 획득');
  assert(!computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', likes: 99 }], catalog).has(76), '좋아요 99 → 76 미획득');

  // 앱 친구 동행: 1회 → 84, 3회 → 85
  const comp = (friends: string[]): BadgeStatRecord => ({ isMyPost: true, countryName: '일본', companionFriends: friends });
  assert(computeEarnedBadgeIds([comp(['민지'])], catalog).has(84) && !computeEarnedBadgeIds([comp(['민지'])], catalog).has(85), '동행 1회 → 84 O, 85 X');
  const three = [comp(['민지']), comp(['하윤']), comp(['도이'])];
  assert(computeEarnedBadgeIds(three, catalog).has(85), '동행 3회 → 85 획득');
  // companionFriends 없으면 미획득
  assert(!computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', companions: ['혼자'] }], catalog).has(84), '동행친구 없으면 84 미획득');

  // 같은 친구 5회 → 77
  const sameFive = Array.from({ length: 5 }, () => comp(['민지']));
  assert(computeTravelStats(sameFive).maxSameFriendCompanions === 5, '같은 친구 5회 집계');
  assert(computeEarnedBadgeIds(sameFive, catalog).has(77), '같은 친구 5회 → 77 획득');
  // 서로 다른 친구 5회(각 1회) → 77 미획득
  const diffFive = ['a', 'b', 'c', 'd', 'e'].map((f) => comp([f]));
  assert(!computeEarnedBadgeIds(diffFive, catalog).has(77), '다른 친구 각 1회 → 77 미획득');

  // 댓글 50개 → 75 (옵션 전달)
  assert(computeEarnedBadgeIds([], catalog, { commentsWritten: 50 }).has(75), '댓글 50개 → 75 획득');
  assert(!computeEarnedBadgeIds([], catalog, { commentsWritten: 49 }).has(75), '댓글 49개 → 75 미획득');

  // 공유 10회 → 74
  assert(computeEarnedBadgeIds([], catalog, { sharesSent: 10 }).has(74), '공유 10회 → 74 획득');
  assert(!computeEarnedBadgeIds([], catalog, { sharesSent: 9 }).has(74), '공유 9회 → 74 미획득');

  // 앱 연속 접속(112·113·114)
  const login = (n: number) => computeEarnedBadgeIds([], catalog, { loginStreak: n });
  assert(login(30).has(112) && !login(30).has(113), '연속 30일 → 112 O, 113 X');
  assert(login(50).has(113) && !login(50).has(114), '연속 50일 → 113 O, 114 X');
  assert(login(100).has(114), '연속 100일 → 114 획득');
  assert(!login(29).has(112), '연속 29일 → 112 미획득');

  // 설치 후 1년(115)
  assert(computeEarnedBadgeIds([], catalog, { daysSinceInstall: 365 }).has(115), '설치 365일 → 115 획득');
  assert(!computeEarnedBadgeIds([], catalog, { daysSinceInstall: 364 }).has(115), '설치 364일 → 115 미획득');

  // 얼리어답터(116) — 출시 2026-07-13 + 첫 달
  const LAUNCH = Date.UTC(2026, 6, 13);
  const DAY = 86400000;
  assert(computeEarnedBadgeIds([], catalog, { installedAt: LAUNCH + 5 * DAY }).has(116), '출시 5일 후 설치 → 116 획득');
  assert(computeEarnedBadgeIds([], catalog, { installedAt: LAUNCH - 3 * DAY }).has(116), '출시 전(베타) 설치 → 116 획득');
  assert(!computeEarnedBadgeIds([], catalog, { installedAt: LAUNCH + 40 * DAY }).has(116), '출시 40일 후 설치 → 116 미획득');
  assert(!computeEarnedBadgeIds([], catalog, {}).has(116), '설치일 없음 → 116 미획득');

  // 이웃 수(78·81·82·83)
  const friends = (n: number) => computeEarnedBadgeIds([], catalog, { neighborCount: n });
  assert(friends(1).has(81) && !friends(1).has(82), '이웃 1명 → 81 O, 82 X');
  assert(friends(10).has(82) && !friends(10).has(78), '이웃 10명 → 82 O, 78 X');
  assert(friends(50).has(78) && !friends(50).has(83), '이웃 50명 → 78 O, 83 X');
  assert(friends(100).has(83), '이웃 100명 → 83 획득');
  assert(!friends(0).has(81), '이웃 0명 → 81 미획득');
}

// ── 만능 기록자(69) — 피드·블로그·스트립·스냅 각각 1개 이상 ──
{
  const allFour: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', viewType: 'feed' },
    { isMyPost: true, countryName: '일본', viewType: 'blog' },
    { isMyPost: true, countryName: '일본', viewType: 'cut' },
    { isMyPost: true, countryName: '일본', viewType: 'snap' },
  ];
  assert(computeEarnedBadgeIds(allFour, catalog).has(69), '4형식 모두 → 69 획득');

  // 스냅 빠짐 → 미획득
  assert(!computeEarnedBadgeIds(allFour.slice(0, 3), catalog).has(69), '스냅 빠짐 → 69 미획득');

  // 앨범은 무관 — 피드·블로그·스트립·스냅 다 있으면 획득
  const withAlbum = [...allFour, { isMyPost: true, countryName: '일본', viewType: 'album' as const }];
  assert(computeEarnedBadgeIds(withAlbum, catalog).has(69), '앨범 추가돼도 4형식 충족 → 69 획득');
}

// ── 스트립 형식 배지(67·70) ──
{
  const cut = (frame: string): BadgeStatRecord =>
    ({ isMyPost: true, countryName: '일본', viewType: 'cut', cutPhoto: { frameId: frame } });

  // 스트립 5개 → 67
  const five = Array.from({ length: 5 }, () => cut('theme-film-mono'));
  assert(computeTravelStats(five).cutRecordCount === 5, '스트립 5개 집계');
  assert(computeEarnedBadgeIds(five, catalog).has(67), '스트립 5개 → 67 획득');
  assert(!computeEarnedBadgeIds(Array.from({ length: 4 }, () => cut('f')), catalog).has(67), '스트립 4개 → 67 미획득');

  // 서로 다른 프레임 5종 → 70
  const frames = ['f1', 'f2', 'f3', 'f4', 'f5'].map((f) => cut(f));
  assert(computeTravelStats(frames).cutFrames.size === 5, '프레임 5종 집계');
  assert(computeEarnedBadgeIds(frames, catalog).has(70), '프레임 5종 → 70 획득');
  // 같은 프레임 5개 → 1종 → 70 미획득
  assert(!computeEarnedBadgeIds(five, catalog).has(70), '같은 프레임만 → 70 미획득');

  // 피드는 스트립으로 안 셈
  const feed = Array.from({ length: 5 }, () => ({ isMyPost: true, countryName: '일본', viewType: 'feed' as const }));
  assert(computeTravelStats(feed).cutRecordCount === 0, '피드는 스트립 카운트 0');
}

// ── 스냅 스트릭(88) — 7일 연속 스냅 ──
{
  const snapOn = (day: string): BadgeStatRecord => ({ isMyPost: true, countryName: '일본', viewType: 'snap', date: day });
  // 7일 연속(05.01~05.07) → 88
  const week = ['2025.05.01', '2025.05.02', '2025.05.03', '2025.05.04', '2025.05.05', '2025.05.06', '2025.05.07'].map(snapOn);
  assert(computeTravelStats(week).maxSnapStreak === 7, '7일 연속 집계');
  assert(computeEarnedBadgeIds(week, catalog).has(88), '7일 연속 → 88 획득');

  // 중간에 하루 빠짐(6일 최대 연속) → 미획득
  const gap = ['2025.05.01', '2025.05.02', '2025.05.03', '2025.05.05', '2025.05.06', '2025.05.07', '2025.05.08'].map(snapOn);
  assert(computeTravelStats(gap).maxSnapStreak === 4, '04일 빠짐 → 최대 연속 4 (05.05~08)');
  assert(!computeEarnedBadgeIds(gap, catalog).has(88), '연속 끊기면 → 88 미획득');

  // 같은 날 스냅 여러 개는 1일로 카운트
  const sameDay = [snapOn('2025.05.01'), snapOn('2025.05.01'), snapOn('2025.05.02')];
  assert(computeTravelStats(sameDay).maxSnapStreak === 2, '같은 날 중복은 1일');

  // 피드 7일 연속은 스냅 스트릭 아님
  const feedWeek = week.map((r) => ({ ...r, viewType: 'feed' as const }));
  assert(computeTravelStats(feedWeek).maxSnapStreak === 0, '피드는 스냅 스트릭 0');
}

// ── 기록 습관(97·98·99·101·102·103·104) ──
{
  // 97: 30일 연속 기록(피드)
  const streak30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.UTC(2025, 0, 1 + i)); // 2025-01-01 ~ 01-30
    const s = `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
    return { isMyPost: true, countryName: '일본', viewType: 'feed' as const, startDate: s };
  });
  assert(computeTravelStats(streak30).maxDiaryStreak === 30, '30일 연속 집계');
  assert(computeEarnedBadgeIds(streak30, catalog).has(97), '30일 연속 → 97 획득');
  assert(!computeEarnedBadgeIds(streak30.slice(0, 29), catalog).has(97), '29일 연속 → 97 미획득');

  // 98 1/1, 99 12/25
  assert(computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', viewType: 'feed', startDate: '2025.01.01' }], catalog).has(98), '1/1 기록 → 98');
  assert(computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', viewType: 'blog', startDate: '2025.12.25' }], catalog).has(99), '12/25 기록 → 99');
  assert(!computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', viewType: 'feed', startDate: '2025.01.02' }], catalog).has(98), '1/2 → 98 미획득');

  // 101 비 10회, 102 눈 5회
  const rain = (n: number) => Array.from({ length: n }, () => ({ isMyPost: true, countryName: '일본', viewType: 'feed' as const, weather: '비' }));
  assert(computeEarnedBadgeIds(rain(10), catalog).has(101), '비 10회 → 101');
  assert(!computeEarnedBadgeIds(rain(9), catalog).has(101), '비 9회 → 101 미획득');
  const snow = (n: number) => Array.from({ length: n }, () => ({ isMyPost: true, countryName: '일본', viewType: 'feed' as const, weather: '눈' }));
  assert(computeEarnedBadgeIds(snow(5), catalog).has(102), '눈 5회 → 102');
  assert(!computeEarnedBadgeIds(snow(4), catalog).has(102), '눈 4회 → 102 미획득');

  // 103 별점5 10개, 104 별점1 3개
  const star = (val: number, n: number) => Array.from({ length: n }, () => ({ isMyPost: true, countryName: '일본', viewType: 'feed' as const, rating: val }));
  assert(computeEarnedBadgeIds(star(5, 10), catalog).has(103), '별점5 10개 → 103');
  assert(!computeEarnedBadgeIds(star(5, 9), catalog).has(103), '별점5 9개 → 103 미획득');
  assert(computeEarnedBadgeIds(star(1, 3), catalog).has(104), '별점1 3개 → 104');
  assert(!computeEarnedBadgeIds(star(1, 2), catalog).has(104), '별점1 2개 → 104 미획득');
  // 스냅 날씨/별점은 미집계(피드·블로그·스트립만)
  assert(!computeEarnedBadgeIds(Array.from({ length: 10 }, () => ({ isMyPost: true, countryName: '일본', viewType: 'snap' as const, weather: '비' })), catalog).has(101), '스냅 비는 101 무관');
}

// ── 시즌 배지(118·119·120·121) — 국가 + 계절 ──
{
  const rec = (country: string, date: string): BadgeStatRecord => ({ isMyPost: true, countryName: country, viewType: 'feed', startDate: date });
  // 118 벚꽃: 3~4월 일본
  assert(computeEarnedBadgeIds([rec('일본', '2025.03.20')], catalog).has(118), '3월 일본 → 118');
  assert(computeEarnedBadgeIds([rec('일본', '2025.04.05')], catalog).has(118), '4월 일본 → 118');
  assert(!computeEarnedBadgeIds([rec('일본', '2025.05.01')], catalog).has(118), '5월 일본 → 118 미획득');
  assert(!computeEarnedBadgeIds([rec('한국', '2025.03.20')], catalog).has(118), '3월 한국 → 118 미획득(일본 아님)');
  // 119 옥토버페스트: 10월 독일
  assert(computeEarnedBadgeIds([rec('독일', '2025.10.01')], catalog).has(119), '10월 독일 → 119');
  assert(!computeEarnedBadgeIds([rec('독일', '2025.09.30')], catalog).has(119), '9월 독일 → 119 미획득');
  // 120 카니발: 2~3월 브라질
  assert(computeEarnedBadgeIds([rec('브라질', '2025.02.15')], catalog).has(120), '2월 브라질 → 120');
  assert(!computeEarnedBadgeIds([rec('브라질', '2025.04.01')], catalog).has(120), '4월 브라질 → 120 미획득');
  // 121 오로라: 겨울(12·1·2) 노르웨이/아이슬란드/핀란드
  assert(computeEarnedBadgeIds([rec('아이슬란드', '2025.01.10')], catalog).has(121), '1월 아이슬란드 → 121');
  assert(computeEarnedBadgeIds([rec('핀란드', '2025.12.20')], catalog).has(121), '12월 핀란드 → 121');
  assert(!computeEarnedBadgeIds([rec('노르웨이', '2025.07.01')], catalog).has(121), '7월 노르웨이 → 121 미획득(겨울 아님)');
  assert(!computeEarnedBadgeIds([rec('일본', '2025.01.10')], catalog).has(121), '1월 일본 → 121 미획득(대상국 아님)');
  // 스냅은 시즌 배지 무관(피드·블로그·스트립만)
  assert(!computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', viewType: 'snap', startDate: '2025.03.20' }], catalog).has(118), '스냅 3월 일본 → 118 무관');
}

// ── 야행성 스냅(89) — 현지 새벽 2~5시(2,3,4시) ──
{
  const snapAt = (hour: number): BadgeStatRecord => ({ isMyPost: true, countryName: '일본', viewType: 'snap', date: '2025.05.01', snapHour: hour });
  assert(computeEarnedBadgeIds([snapAt(2)], catalog).has(89), '02시 스냅 → 89 획득');
  assert(computeEarnedBadgeIds([snapAt(3)], catalog).has(89), '03시 스냅 → 89 획득');
  assert(computeEarnedBadgeIds([snapAt(4)], catalog).has(89), '04시 스냅 → 89 획득');
  assert(!computeEarnedBadgeIds([snapAt(5)], catalog).has(89), '05시 스냅 → 89 미획득(경계)');
  assert(!computeEarnedBadgeIds([snapAt(1)], catalog).has(89), '01시 스냅 → 89 미획득');
  assert(!computeEarnedBadgeIds([snapAt(14)], catalog).has(89), '14시 스냅 → 89 미획득');
  // snapHour 없으면 미획득
  assert(!computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', viewType: 'snap', date: '2025.05.01' }], catalog).has(89), 'snapHour 없으면 89 미획득');
  // 피드 3시는 무관
  assert(!computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', viewType: 'feed', snapHour: 3 }], catalog).has(89), '피드(스냅 아님)는 89 무관');

  // 일출 스냅(90) — 5,6시
  assert(computeEarnedBadgeIds([snapAt(5)], catalog).has(90), '05시 스냅 → 90 획득');
  assert(computeEarnedBadgeIds([snapAt(6)], catalog).has(90), '06시 스냅 → 90 획득');
  assert(!computeEarnedBadgeIds([snapAt(7)], catalog).has(90), '07시 스냅 → 90 미획득(경계)');
  assert(!computeEarnedBadgeIds([snapAt(4)], catalog).has(90), '04시 스냅 → 90 미획득');
  // 89와 90은 겹치지 않음(5시는 90만, 4시는 89만)
  assert(computeEarnedBadgeIds([snapAt(5)], catalog).has(90) && !computeEarnedBadgeIds([snapAt(5)], catalog).has(89), '05시는 90만(89 아님)');
}

// ── 블로그의 달인(66)·스냅 마스터(68) ──
{
  const recs = (vt: 'blog' | 'snap', n: number): BadgeStatRecord[] =>
    Array.from({ length: n }, () => ({ isMyPost: true, countryName: '일본', viewType: vt }));

  assert(computeEarnedBadgeIds(recs('blog', 10), catalog).has(66), '블로그 10개 → 66 획득');
  assert(!computeEarnedBadgeIds(recs('blog', 9), catalog).has(66), '블로그 9개 → 66 미획득');
  assert(computeEarnedBadgeIds(recs('snap', 30), catalog).has(68), '스냅 30개 → 68 획득');
  assert(!computeEarnedBadgeIds(recs('snap', 29), catalog).has(68), '스냅 29개 → 68 미획득');
  // 형식 교차 카운트 안 됨
  assert(!computeEarnedBadgeIds(recs('snap', 10), catalog).has(66), '스냅 10개는 66(블로그) 아님');
}

// ── 피드의 달인(71) — 피드 20개 작성 ──
{
  const feed = (n: number, vt: 'feed' | 'blog' = 'feed'): BadgeStatRecord[] =>
    Array.from({ length: n }, () => ({ isMyPost: true, countryName: '일본', viewType: vt }));

  assert(computeTravelStats(feed(20)).feedRecordCount === 20, '피드 20개 집계');
  assert(computeEarnedBadgeIds(feed(20), catalog).has(71), '피드 20개 → 71 획득');
  assert(!computeEarnedBadgeIds(feed(19), catalog).has(71), '피드 19개 → 71 미획득');
  // viewType 미지정도 피드로 카운트
  const noVt: BadgeStatRecord[] = Array.from({ length: 20 }, () => ({ isMyPost: true, countryName: '일본' }));
  assert(computeEarnedBadgeIds(noVt, catalog).has(71), 'viewType 미지정 20개(=피드) → 71 획득');
  // 블로그는 피드로 안 셈
  assert(!computeEarnedBadgeIds(feed(20, 'blog'), catalog).has(71), '블로그 20개 → 71 미획득');
}

// ── 겨울휴가 여행(65) — 1월 또는 2월 기록 (피드·블로그·스트립) ──
{
  assert(computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', startDate: '2025.01.20', viewType: 'feed' }], catalog).has(65), '1월 기록 → 65 획득');
  assert(computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', startDate: '2025.02.14', viewType: 'cut' }], catalog).has(65), '2월 기록 → 65 획득');
  assert(!computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', startDate: '2025.03.01', viewType: 'feed' }], catalog).has(65), '3월 기록 → 65 미획득');
  assert(!computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', startDate: '2025.12.31', viewType: 'feed' }], catalog).has(65), '12월 기록 → 65 미획득');
  assert(!computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', startDate: '2025.01.20', viewType: 'snap' }], catalog).has(65), '스냅 1월 → 65 미획득');
}

// ── 여름휴가 여행(64) — 7월 또는 8월 기록 (피드·블로그·스트립) ──
{
  assert(computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', startDate: '2025.07.15', viewType: 'feed' }], catalog).has(64), '7월 기록 → 64 획득');
  assert(computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', startDate: '2025.08.03', viewType: 'blog' }], catalog).has(64), '8월 기록 → 64 획득');
  assert(!computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', startDate: '2025.06.30', viewType: 'feed' }], catalog).has(64), '6월 기록 → 64 미획득');
  assert(!computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', startDate: '2025.09.01', viewType: 'feed' }], catalog).has(64), '9월 기록 → 64 미획득');
  // 스냅 7월은 미인정
  assert(!computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', startDate: '2025.07.15', viewType: 'snap' }], catalog).has(64), '스냅 7월 → 64 미획득');
}

// ── 새해 여행(63) — 여행 날짜가 12/31~1/1 포함(해 넘김) ──
{
  // 12/30~1/2 → 획득
  const cross: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', startDate: '2024.12.30', endDate: '2025.01.02', viewType: 'feed' },
  ];
  assert(computeEarnedBadgeIds(cross, catalog).has(63), '12/30~1/2 → 63 획득');

  // 정확히 12/31~1/1 → 획득
  const exact: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', startDate: '2024.12.31', endDate: '2025.01.01', viewType: 'blog' },
  ];
  assert(computeEarnedBadgeIds(exact, catalog).has(63), '12/31~1/1 → 63 획득');

  // 12/25~12/31 (1/1 미포함) → 미획득
  const noJan: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', startDate: '2024.12.25', endDate: '2024.12.31', viewType: 'feed' },
  ];
  assert(!computeEarnedBadgeIds(noJan, catalog).has(63), '12/31까지만(1/1 없음) → 63 미획득');

  // 12/31 단일 기록(종료일 없음) → 미획득
  const single: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', startDate: '2024.12.31', viewType: 'feed' },
  ];
  assert(!computeEarnedBadgeIds(single, catalog).has(63), '12/31 단일일 → 63 미획득');

  // 스냅으로 해넘이 → 미인정
  const snap: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', startDate: '2024.12.30', endDate: '2025.01.02', viewType: 'snap' },
  ];
  assert(!computeEarnedBadgeIds(snap, catalog).has(63), '스냅 해넘이 → 63 미획득');
}

// ── 매달 여행(54) — 피드·블로그·스트립 날짜가 12개월 모두 포함 ──
{
  const mk = (mm: number, vt: 'feed' | 'snap' = 'feed'): BadgeStatRecord =>
    ({ isMyPost: true, countryName: '일본', startDate: `2025.${String(mm).padStart(2, '0')}.10`, viewType: vt });

  // 12개월 모두 → 획득
  const all12 = Array.from({ length: 12 }, (_, i) => mk(i + 1));
  assert(computeTravelStats(all12).monthsRecorded.size === 12, '12개월 모두 집계');
  assert(computeEarnedBadgeIds(all12, catalog).has(54), '12개월 모두 → 54 획득');

  // 11개월(12월 없음) → 미획득
  const eleven = all12.slice(0, 11);
  assert(!computeEarnedBadgeIds(eleven, catalog).has(54), '11개월 → 54 미획득');

  // 12월이 스냅이면 11개월 → 미획득
  const decSnap = [...all12.slice(0, 11), mk(12, 'snap')];
  assert(!computeEarnedBadgeIds(decSnap, catalog).has(54), '12월이 스냅 → 54 미획득');
}

// ── 모든 등록 국가 방문(43) — COUNTRIES 전체를 피드·블로그·스트립으로 ──
{
  // 모든 국가 기록 → 43 획득
  const all = COUNTRIES.map((c) => ({ isMyPost: true, countryName: c.name, viewType: 'feed' as const }));
  assert(computeEarnedBadgeIds(all, catalog).has(43), '모든 등록 국가 기록 → 43 획득');

  // 한 나라라도 빠지면 미획득
  const minusOne = all.slice(0, all.length - 1);
  assert(!computeEarnedBadgeIds(minusOne, catalog).has(43), '1개국 빠짐 → 43 미획득');

  // 모든 국가지만 하나가 스냅이면 미획득
  const oneSnap = all.map((r, i) => (i === 0 ? { ...r, viewType: 'snap' as const } : r));
  assert(!computeEarnedBadgeIds(oneSnap, catalog).has(43), '1개국이 스냅 → 43 미획득');
}

// ── 여행기록 개수(45·46) — 피드·블로그·스트립·스냅 (앨범 제외) ──
{
  const mk = (vt: 'feed' | 'blog' | 'cut' | 'snap' | 'album', n: number): BadgeStatRecord[] =>
    Array.from({ length: n }, () => ({ isMyPost: true, countryName: '일본', viewType: vt }));

  // 피드 5개 → 45
  assert(computeEarnedBadgeIds(mk('feed', 5), catalog).has(45), '피드 5개 → 45 획득');
  // 스냅도 인정 → 스냅 5개 → 45
  assert(computeEarnedBadgeIds(mk('snap', 5), catalog).has(45), '스냅 5개 → 45 획득');
  // 앨범은 제외 → 앨범 10개 → 미획득
  assert(!computeEarnedBadgeIds(mk('album', 10), catalog).has(45), '앨범 10개 → 45 미획득');

  // 혼합: 피드3+스냅2(=5) → 45, 10 미만이라 46 미획득
  const mixed: BadgeStatRecord[] = [...mk('feed', 3), ...mk('snap', 2)];
  assert(computeTravelStats(mixed).journalRecordCount === 5, '피드3+스냅2 = 5');
  assert(computeEarnedBadgeIds(mixed, catalog).has(45) && !computeEarnedBadgeIds(mixed, catalog).has(46), '5개 → 45 O, 46 X');

  // 10개(피드5+스냅3+스트립2) → 46
  const ten: BadgeStatRecord[] = [...mk('feed', 5), ...mk('snap', 3), ...mk('cut', 2)];
  assert(computeEarnedBadgeIds(ten, catalog).has(46), '10개 → 46 획득');
  // 앨범 섞이면 카운트 안 됨: 피드5+앨범5 = 5 → 46 미획득
  assert(!computeEarnedBadgeIds([...mk('feed', 5), ...mk('album', 5)], catalog).has(46), '앨범 5개는 미집계 → 46 미획득');
}

// ── 대륙 정복자(44) — 한 대륙의 모든 국가 방문 (피드·블로그·스트립) ──
{
  const oceania = COUNTRIES.filter((c) => c.continent === '오세아니아');
  // 오세아니아 전 국가 기록 → 44 획득
  const allOceania = oceania.map((c) => ({ isMyPost: true, countryName: c.name, viewType: 'feed' as const }));
  assert(computeEarnedBadgeIds(allOceania, catalog).has(44), '오세아니아 전 국가 → 44 획득');

  // 한 나라 빠짐 → 미획득
  const minusOne = allOceania.slice(0, allOceania.length - 1);
  assert(!computeEarnedBadgeIds(minusOne, catalog).has(44), '대륙 1개국 빠짐 → 44 미획득');

  // 한 나라가 스냅이면 미획득
  const oneSnap = allOceania.map((r, i) => (i === 0 ? { ...r, viewType: 'snap' as const } : r));
  assert(!computeEarnedBadgeIds(oneSnap, catalog).has(44), '대륙 1개국이 스냅 → 44 미획득');
}

// ── 모든 대륙 1개국(42) — 피드·블로그·스트립 기록 기준 ──
{
  const sixContinents: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', viewType: 'feed' },     // 아시아
    { isMyPost: true, countryName: '프랑스', viewType: 'feed' },   // 유럽
    { isMyPost: true, countryName: '미국', viewType: 'blog' },     // 북아메리카
    { isMyPost: true, countryName: '브라질', viewType: 'cut' },    // 남아메리카
    { isMyPost: true, countryName: '호주', viewType: 'feed' },     // 오세아니아
    { isMyPost: true, countryName: '이집트', viewType: 'feed' },   // 아프리카
  ];
  assert(computeEarnedBadgeIds(sixContinents, catalog).has(42), '6대륙 형식 기록 → 42 획득');

  // 아프리카만 스냅이면 5대륙 → 미획득
  const africaSnap: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', viewType: 'feed' },
    { isMyPost: true, countryName: '프랑스', viewType: 'feed' },
    { isMyPost: true, countryName: '미국', viewType: 'feed' },
    { isMyPost: true, countryName: '브라질', viewType: 'feed' },
    { isMyPost: true, countryName: '호주', viewType: 'feed' },
    { isMyPost: true, countryName: '이집트', viewType: 'snap' },  // 스냅 → 제외
  ];
  assert(!computeEarnedBadgeIds(africaSnap, catalog).has(42), '아프리카가 스냅 → 5대륙 → 42 미획득');
}

// ── 첫 기록(1): 피드·블로그·스트립(cut)만 인정, 스냅·앨범 제외 ──
{
  // 스냅·앨범만 있으면 미획득
  const onlySnapAlbum: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', viewType: 'snap' },
    { isMyPost: true, countryName: '일본', viewType: 'album', medias: ['a'] },
  ];
  assert(computeTravelStats(onlySnapAlbum).diaryRecordCount === 0, '스냅·앨범은 기록(첫기록)에서 제외');
  assert(!computeEarnedBadgeIds(onlySnapAlbum, catalog).has(1), '스냅·앨범만 → 첫 기록(1) 미획득');

  // 피드 1개면 획득
  assert(computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', viewType: 'feed' }], catalog).has(1), '피드 → 첫 기록(1) 획득');
  // 블로그 1개면 획득
  assert(computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', viewType: 'blog' }], catalog).has(1), '블로그 → 첫 기록(1) 획득');
  // 스트립(cut) 1개면 획득
  assert(computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', viewType: 'cut' }], catalog).has(1), '스트립(cut) → 첫 기록(1) 획득');
  // viewType 미지정(기본 feed)도 획득
  assert(computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본' }], catalog).has(1), 'viewType 미지정(기본 feed) → 첫 기록(1) 획득');
}

// ── isMyPost 기준: StatsScreen과 동일하게 `!== false` (undefined도 내 것) ──
{
  const recs: BadgeStatRecord[] = [
    { countryName: '일본' },                  // isMyPost 미지정(시드 형태) → 포함
    { isMyPost: true, countryName: '프랑스' },  // 명시 true → 포함
    { isMyPost: false, countryName: '미국' },   // 명시 false → 제외
  ];
  const s = computeTravelStats(recs);
  assert(s.recordCount === 2, 'undefined+true는 내 기록, false만 제외 → 2');
  assert(s.countries.has('일본') && s.countries.has('프랑스') && !s.countries.has('미국'), '미국(=false)만 빠짐');
}

// ── 통계 집계 ──
{
  const recs: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', rating: 5, companions: ['혼자'], medias: ['a', 'b'], startDate: '2025.03.01', endDate: '2025.03.01' },
    { isMyPost: true, countryName: '일본', rating: 3, companions: ['친구'], startDate: '2025.04.01', endDate: '2025.05.10' },
    { isMyPost: true, countryName: '프랑스', countries: [{ name: '프랑스' }, { name: '독일' }], medias: ['c'] },
    { isMyPost: false, countryName: '미국' }, // isMyPost === false → 집계 제외
  ];
  const s = computeTravelStats(recs);
  assert(s.recordCount === 3, '내 기록 수 3 (isMyPost=false인 미국 제외)');
  assert(s.countryCount === 3, '방문국 3개(일본·프랑스·독일, 중복 일본 1회 계산)');
  assert(s.continents.has('아시아') && s.continents.has('유럽'), '대륙 아시아+유럽 감지');
  assert(s.japanVisits === 2, '일본 방문 2회(여행 단위, 03월·04월 별도)');
  assert(s.hasDayTrip === true, '당일치기(0박) 감지');
  assert(s.hasLongTrip === true, '30일 이상(약 40박) 감지');
  assert(s.ratings.has(5) && s.ratings.has(3), '별점 5,3 기록');
  assert(s.companions.has('혼자') && s.companions.has('친구'), '동행 혼자/친구');
}

// ── 판정 결과 ──
{
  const recs: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', rating: 5, companions: ['혼자'], startDate: '2025.03.01', endDate: '2025.03.01' },
    { isMyPost: true, countryName: '일본', rating: 5, companions: ['연인'], startDate: '2025.07.01', endDate: '2025.07.05' }, // 별도 여행(4개월 뒤)
    { isMyPost: true, countryName: '프랑스' },
    { isMyPost: true, countryName: '독일' },
  ];
  const earned = computeEarnedBadgeIds(recs, catalog);
  assert(earned.has(1), '첫 기록(1) 획득');
  assert(earned.has(2), '아시아 첫발(2) 획득');
  assert(earned.has(3), '유럽 첫발(3) 획득');
  assert(earned.has(9), '홀로 여행(9) 획득');
  assert(earned.has(10), '커플 여행(10) 획득');
  assert(!earned.has(123), '가족 동행 없으면 가족 여행(123) 미획득');
  assert(earned.has(14), '당일치기(14) 획득');
  assert(earned.has(16), '일본 재방문(16) 획득(여행 2회: 03월·07월)');
  assert(earned.has(35), '3개국 방문(35) 획득');
  assert(!earned.has(36), '5개국(36)은 미획득(3개국뿐)');
  // 마일스톤도 피드·블로그·스트립만 인정 — 스냅·앨범 국가는 제외
  {
    const mixedFmt: BadgeStatRecord[] = [
      { isMyPost: true, countryName: '일본', viewType: 'feed' },
      { isMyPost: true, countryName: '프랑스', viewType: 'blog' },
      { isMyPost: true, countryName: '독일', viewType: 'snap' },   // 스냅 → 제외
      { isMyPost: true, countryName: '스페인', viewType: 'album' }, // 앨범 → 제외
    ];
    assert(!computeEarnedBadgeIds(mixedFmt, catalog).has(35), '형식 기록 2개국(스냅·앨범 제외) → 35 미획득');
    const allDiary: BadgeStatRecord[] = [
      { isMyPost: true, countryName: '일본', viewType: 'feed' },
      { isMyPost: true, countryName: '프랑스', viewType: 'blog' },
      { isMyPost: true, countryName: '독일', viewType: 'cut' },
    ];
    assert(computeEarnedBadgeIds(allDiary, catalog).has(35), '형식 기록 3개국 → 35 획득');
  }
  assert(earned.has(52), '별점5점(52) 획득');
  assert(!earned.has(48), '별점1점(48)은 미획득');
  // 별점은 피드·블로그·스트립에서만 — 스냅·앨범에 rating이 있어도 무시
  {
    const nonRatingFmt: BadgeStatRecord[] = [
      { isMyPost: true, countryName: '일본', rating: 3, viewType: 'snap' },
      { isMyPost: true, countryName: '일본', rating: 4, viewType: 'album' },
    ];
    const e2 = computeEarnedBadgeIds(nonRatingFmt, catalog);
    assert(!e2.has(50) && !e2.has(51), '스냅·앨범 별점은 50·51 미인정');
    // 같은 별점을 블로그·스트립으로 → 인정
    const ratingFmt: BadgeStatRecord[] = [
      { isMyPost: true, countryName: '일본', rating: 3, viewType: 'blog' },
      { isMyPost: true, countryName: '일본', rating: 4, viewType: 'cut' },
    ];
    const e3 = computeEarnedBadgeIds(ratingFmt, catalog);
    assert(e3.has(50) && e3.has(51), '블로그·스트립 별점 → 50·51 획득');
  }
}

// ── 일본 재방문(16)은 '여행 단위' (기록 수 아님) ──
{
  // 같은 여행(같은 주)에 일본 기록 3개 → 1회 방문 → 16 미획득
  const sameTrip: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', startDate: '2025.03.01' },
    { isMyPost: true, countryName: '일본', startDate: '2025.03.02' },
    { isMyPost: true, countryName: '일본', startDate: '2025.03.03' },
  ];
  assert(computeTravelStats(sameTrip).japanVisits === 1, '같은 주 일본 기록 3개 → 1회 방문');
  assert(!computeEarnedBadgeIds(sameTrip, catalog).has(16), '같은 여행이면 재방문(16) 미획득');

  // 다른 시기 2번 방문 → 2회 → 16 획득
  const twoTrips: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', startDate: '2025.03.01' },
    { isMyPost: true, countryName: '일본', startDate: '2025.09.01' },
  ];
  assert(computeTravelStats(twoTrips).japanVisits === 2, '3월·9월 → 2회 방문');
  assert(computeEarnedBadgeIds(twoTrips, catalog).has(16), '다른 시기 2회면 재방문(16) 획득');

  // 날짜 없는 일본 기록 여러 개 → 분리 불가 → 1회로 본다(과대 집계 방지)
  const undated: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본' },
    { isMyPost: true, countryName: '일본' },
  ];
  assert(computeTravelStats(undated).japanVisits === 1, '날짜 없는 일본 기록 2개 → 1회(보수적)');

  // 형식 제한: 스냅·앨범 일본 방문은 16에 안 셈
  const snapJapan: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', startDate: '2024.03.01', viewType: 'snap' },
    { isMyPost: true, countryName: '일본', startDate: '2024.09.01', viewType: 'album' },
  ];
  assert(computeTravelStats(snapJapan).japanVisits === 0, '스냅·앨범 일본 → japanVisits 0');
  assert(!computeEarnedBadgeIds(snapJapan, catalog).has(16), '스냅·앨범 일본 2회 → 16 미획득');
}

// ── 같은 나라 재방문 5회(34) — 어느 국가든 최다 방문 기준 ──
{
  // 베트남을 시기 다르게 5번 → maxCountryVisits=5 → 34 획득
  const five: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '베트남', startDate: '2024.01.01' },
    { isMyPost: true, countryName: '베트남', startDate: '2024.04.01' },
    { isMyPost: true, countryName: '베트남', startDate: '2024.07.01' },
    { isMyPost: true, countryName: '베트남', startDate: '2024.10.01' },
    { isMyPost: true, countryName: '베트남', startDate: '2025.01.01' },
  ];
  assert(computeTravelStats(five).maxCountryVisits === 5, '베트남 5회 → maxCountryVisits 5');
  assert(computeEarnedBadgeIds(five, catalog).has(34), '같은 나라 5회 재방문(34) 획득');

  // 4번이면 미획득
  const four = five.slice(0, 4);
  assert(!computeEarnedBadgeIds(four, catalog).has(34), '4회면 재방문5회(34) 미획득');

  // 같은 여행(같은 주)에 5개 기록이면 1회 → 미획득
  const sameWeek: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '베트남', startDate: '2024.01.01' },
    { isMyPost: true, countryName: '베트남', startDate: '2024.01.02' },
    { isMyPost: true, countryName: '베트남', startDate: '2024.01.03' },
    { isMyPost: true, countryName: '베트남', startDate: '2024.01.04' },
    { isMyPost: true, countryName: '베트남', startDate: '2024.01.05' },
  ];
  assert(computeTravelStats(sameWeek).maxCountryVisits === 1, '같은 주 5개 기록 → 1회');
  assert(!computeEarnedBadgeIds(sameWeek, catalog).has(34), '같은 여행이면 34 미획득');

  // 형식 제한: 스냅 5회는 34에 안 셈
  const snapFive: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '베트남', startDate: '2024.01.01', viewType: 'snap' },
    { isMyPost: true, countryName: '베트남', startDate: '2024.04.01', viewType: 'snap' },
    { isMyPost: true, countryName: '베트남', startDate: '2024.07.01', viewType: 'snap' },
    { isMyPost: true, countryName: '베트남', startDate: '2024.10.01', viewType: 'snap' },
    { isMyPost: true, countryName: '베트남', startDate: '2025.01.01', viewType: 'snap' },
  ];
  assert(computeTravelStats(snapFive).maxCountryVisits === 0, '스냅 5회 → maxCountryVisits 0');
  assert(!computeEarnedBadgeIds(snapFive, catalog).has(34), '스냅 5회 → 34 미획득');
}

// ── 섬 방문 횟수(22·23·24) — 섬나라 + 섬지역, 여행 단위 ──
{
  // 섬나라2 + 섬지역1 = 3회 → 섬 입문자(22)
  const islands: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', startDate: '2024.01.01' },                       // 섬나라
    { isMyPost: true, countryName: '필리핀', startDate: '2024.04.01' },                     // 섬나라
    { isMyPost: true, countryName: '대한민국', regionName: '제주도', startDate: '2024.07.01' }, // 섬지역(비섬나라)
  ];
  assert(computeTravelStats(islands).islandVisits === 3, '섬나라2 + 섬지역1 = 3회');
  assert(computeEarnedBadgeIds(islands, catalog).has(22), '섬 3회 → 섬 입문자(22)');
  assert(!computeEarnedBadgeIds(islands, catalog).has(23), '3회면 섬 탐험가(23) 미획득');

  // 같은 섬 여행에서 글 여러 개 → 1회
  const sameIslandTrip: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', regionName: '오키나와', startDate: '2024.01.01' },
    { isMyPost: true, countryName: '일본', regionName: '오키나와', startDate: '2024.01.03' },
  ];
  assert(computeTravelStats(sameIslandTrip).islandVisits === 1, '같은 섬 여행 → 1회');

  // 서로 다른 섬 5회 → 섬 탐험가(23)
  const fiveIslands: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', startDate: '2024.01.01' },
    { isMyPost: true, countryName: '대만', startDate: '2024.03.01' },
    { isMyPost: true, countryName: '몰디브', startDate: '2024.05.01' },
    { isMyPost: true, countryName: '영국', startDate: '2024.07.01' },
    { isMyPost: true, countryName: '뉴질랜드', startDate: '2024.09.01' },
  ];
  assert(computeTravelStats(fiveIslands).islandVisits === 5, '서로 다른 섬 5회');
  assert(computeEarnedBadgeIds(fiveIslands, catalog).has(23), '섬 5회 → 섬 탐험가(23)');

  // 내륙 국가/지역 → 섬 0회
  const inland: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '프랑스', regionName: '파리', startDate: '2024.01.01' },
  ];
  assert(computeTravelStats(inland).islandVisits === 0, '내륙 국가/지역 → 섬 0회');

  // 형식 제한: 스냅·앨범 섬 기록은 islandVisits에 안 셈
  const nonDiaryIslands: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', viewType: 'snap', startDate: '2024.01.01' },
    { isMyPost: true, countryName: '대만', viewType: 'album', startDate: '2024.04.01' },
    { isMyPost: true, countryName: '몰디브', viewType: 'snap', startDate: '2024.07.01' },
  ];
  assert(computeTravelStats(nonDiaryIslands).islandVisits === 0, '스냅·앨범 섬 방문은 미집계');

  // 같은 섬들을 피드·블로그·스트립으로 → 정상 집계
  const diaryIslands: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', viewType: 'feed', startDate: '2024.01.01' },
    { isMyPost: true, countryName: '대만', viewType: 'blog', startDate: '2024.04.01' },
    { isMyPost: true, countryName: '몰디브', viewType: 'cut', startDate: '2024.07.01' },
  ];
  assert(computeTravelStats(diaryIslands).islandVisits === 3, '형식 기록 섬 3회 집계');
  assert(computeEarnedBadgeIds(diaryIslands, catalog).has(22), '형식 기록 섬 3회 → 22 획득');
}

// ── 정확히 1년만에 같은 곳(33) — 같은 여행지·같은 월일, 1년 차이 (피드·블로그·스트립) ──
{
  // 같은 곳(일본 도쿄), 같은 월일(03.15), 1년 차이 → 획득
  const annual: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', regionName: '도쿄', startDate: '2024.03.15', viewType: 'feed' },
    { isMyPost: true, countryName: '일본', regionName: '도쿄', startDate: '2025.03.15', viewType: 'blog' },
  ];
  assert(computeEarnedBadgeIds(annual, catalog).has(33), '같은 곳·같은 날짜·1년차 → 33 획득');

  // 날짜 다름(03.15 vs 03.16) → 미획득
  const diffDay: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', regionName: '도쿄', startDate: '2024.03.15', viewType: 'feed' },
    { isMyPost: true, countryName: '일본', regionName: '도쿄', startDate: '2025.03.16', viewType: 'feed' },
  ];
  assert(!computeEarnedBadgeIds(diffDay, catalog).has(33), '날짜 다르면 → 33 미획득');

  // 2년 차이(정확히 1년 아님) → 미획득
  const twoYears: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', regionName: '도쿄', startDate: '2023.03.15', viewType: 'feed' },
    { isMyPost: true, countryName: '일본', regionName: '도쿄', startDate: '2025.03.15', viewType: 'feed' },
  ];
  assert(!computeEarnedBadgeIds(twoYears, catalog).has(33), '2년 차이 → 33 미획득');

  // 다른 곳(도쿄 vs 오사카) 같은 날짜·1년차 → 미획득
  const diffPlace: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', regionName: '도쿄', startDate: '2024.03.15', viewType: 'feed' },
    { isMyPost: true, countryName: '일본', regionName: '오사카', startDate: '2025.03.15', viewType: 'feed' },
  ];
  assert(!computeEarnedBadgeIds(diffPlace, catalog).has(33), '다른 지역 → 33 미획득');

  // 스냅이면 미인정
  const annualSnap: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', regionName: '도쿄', startDate: '2024.03.15', viewType: 'snap' },
    { isMyPost: true, countryName: '일본', regionName: '도쿄', startDate: '2025.03.15', viewType: 'snap' },
  ];
  assert(!computeEarnedBadgeIds(annualSnap, catalog).has(33), '스냅이면 → 33 미획득');
}

// ── 한번에 여러 나라 방문(32) — 한 기록에 2개국 이상 (피드·블로그·스트립) ──
{
  // 한 기록에 2개국 → 획득
  const multi: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '프랑스', countries: [{ name: '프랑스' }, { name: '독일' }], viewType: 'feed' },
  ];
  assert(computeEarnedBadgeIds(multi, catalog).has(32), '한 기록 2개국 → 32 획득');

  // 단일국 기록 여러 개 → 미획득
  const singles: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '프랑스', viewType: 'feed' },
    { isMyPost: true, countryName: '독일', viewType: 'feed' },
  ];
  assert(!computeEarnedBadgeIds(singles, catalog).has(32), '단일국 기록만 → 32 미획득');

  // 스냅의 다국 기록은 미인정
  const multiSnap: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '프랑스', countries: [{ name: '프랑스' }, { name: '독일' }], viewType: 'snap' },
  ];
  assert(!computeEarnedBadgeIds(multiSnap, catalog).has(32), '스냅 다국 기록 → 32 미획득');
}

// ── 무비자 입국(31) — 비자 필요국·자국 제외, 무비자 5개국 이상 (피드·블로그·스트립) ──
{
  // 무비자 5개국(프랑스·일본·태국·호주·멕시코) → 획득
  const five: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '프랑스', viewType: 'feed' },
    { isMyPost: true, countryName: '일본', viewType: 'feed' },
    { isMyPost: true, countryName: '태국', viewType: 'blog' },
    { isMyPost: true, countryName: '호주', viewType: 'cut' },
    { isMyPost: true, countryName: '멕시코', viewType: 'feed' },
  ];
  assert(computeEarnedBadgeIds(five, catalog).has(31), '무비자 5개국 → 31 획득');

  // 비자 필요국(중국·인도·이집트)은 무비자 카운트에서 제외 → 무비자는 프랑스·일본 2개뿐 → 미획득
  const withVisaReq: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '프랑스', viewType: 'feed' },
    { isMyPost: true, countryName: '일본', viewType: 'feed' },
    { isMyPost: true, countryName: '중국', viewType: 'feed' },
    { isMyPost: true, countryName: '인도', viewType: 'feed' },
    { isMyPost: true, countryName: '이집트', viewType: 'feed' },
  ];
  assert(!computeEarnedBadgeIds(withVisaReq, catalog).has(31), '비자 필요국 제외 → 무비자 2개국뿐 → 31 미획득');

  // 자국(대한민국)은 카운트 안 함
  const withHome: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '대한민국', viewType: 'feed' },
    { isMyPost: true, countryName: '프랑스', viewType: 'feed' },
    { isMyPost: true, countryName: '일본', viewType: 'feed' },
    { isMyPost: true, countryName: '태국', viewType: 'feed' },
    { isMyPost: true, countryName: '호주', viewType: 'feed' },
  ];
  assert(!computeEarnedBadgeIds(withHome, catalog).has(31), '자국 제외 → 무비자 4개국 → 31 미획득');

  // 형식 제한: 스냅은 미인정
  const oneSnap: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '프랑스', viewType: 'feed' },
    { isMyPost: true, countryName: '일본', viewType: 'feed' },
    { isMyPost: true, countryName: '태국', viewType: 'feed' },
    { isMyPost: true, countryName: '호주', viewType: 'feed' },
    { isMyPost: true, countryName: '멕시코', viewType: 'snap' },
  ];
  assert(!computeEarnedBadgeIds(oneSnap, catalog).has(31), '5개국 중 1개 스냅 → 31 미획득');
}

// ── 열대 지역 방문(30) — 9개국 중 5개국 이상 (피드·블로그·스트립) ──
{
  const five: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '인도네시아', viewType: 'feed' },
    { isMyPost: true, countryName: '태국', viewType: 'feed' },
    { isMyPost: true, countryName: '베트남', viewType: 'blog' },
    { isMyPost: true, countryName: '브라질', viewType: 'cut' },
    { isMyPost: true, countryName: '케냐', viewType: 'feed' },
  ];
  assert(computeEarnedBadgeIds(five, catalog).has(30), '열대 5개국 → 30 획득');

  // 4개국 → 미획득
  assert(!computeEarnedBadgeIds([
    { isMyPost: true, countryName: '인도네시아', viewType: 'feed' },
    { isMyPost: true, countryName: '태국', viewType: 'feed' },
    { isMyPost: true, countryName: '필리핀', viewType: 'feed' },
    { isMyPost: true, countryName: '콩고', viewType: 'feed' },
  ], catalog).has(30), '열대 4개국 → 30 미획득');

  // 5개국이지만 1개가 스냅 → 4개로 미획득
  assert(!computeEarnedBadgeIds([
    { isMyPost: true, countryName: '인도네시아', viewType: 'feed' },
    { isMyPost: true, countryName: '태국', viewType: 'feed' },
    { isMyPost: true, countryName: '베트남', viewType: 'feed' },
    { isMyPost: true, countryName: '브라질', viewType: 'feed' },
    { isMyPost: true, countryName: '케냐', viewType: 'snap' },
  ], catalog).has(30), '5개국 중 1개 스냅 → 30 미획득');
}

// ── 사막 지역 모두 방문(29) — 이집트·사우디·UAE·몽골 전부 (피드·블로그·스트립) ──
{
  const all4: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '이집트', viewType: 'feed' },
    { isMyPost: true, countryName: '사우디아라비아', viewType: 'blog' },
    { isMyPost: true, countryName: '아랍에미리트', viewType: 'cut' },
    { isMyPost: true, countryName: '몽골', viewType: 'feed' },
  ];
  assert(computeEarnedBadgeIds(all4, catalog).has(29), '사막 4개국 모두 → 29 획득');

  // 몽골 빠짐 → 미획득
  assert(!computeEarnedBadgeIds([
    { isMyPost: true, countryName: '이집트', viewType: 'feed' },
    { isMyPost: true, countryName: '사우디아라비아', viewType: 'feed' },
    { isMyPost: true, countryName: '아랍에미리트', viewType: 'feed' },
  ], catalog).has(29), '몽골 빠짐 → 29 미획득');

  // UAE가 앨범이면 미인정
  assert(!computeEarnedBadgeIds([
    { isMyPost: true, countryName: '이집트', viewType: 'feed' },
    { isMyPost: true, countryName: '사우디아라비아', viewType: 'feed' },
    { isMyPost: true, countryName: '아랍에미리트', viewType: 'album' },
    { isMyPost: true, countryName: '몽골', viewType: 'feed' },
  ], catalog).has(29), 'UAE 앨범 → 29 미획득');
}

// ── 영어권 모두 방문(28) — 미국·영국·호주·캐나다·뉴질랜드 전부 (피드·블로그·스트립) ──
{
  const all5: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '미국', viewType: 'feed' },
    { isMyPost: true, countryName: '영국', viewType: 'feed' },
    { isMyPost: true, countryName: '호주', viewType: 'blog' },
    { isMyPost: true, countryName: '캐나다', viewType: 'cut' },
    { isMyPost: true, countryName: '뉴질랜드', viewType: 'feed' },
  ];
  assert(computeEarnedBadgeIds(all5, catalog).has(28), '영어권 5개국 모두 → 28 획득');

  // 하나 빠짐(캐나다 없음) → 미획득
  assert(!computeEarnedBadgeIds([
    { isMyPost: true, countryName: '미국', viewType: 'feed' },
    { isMyPost: true, countryName: '영국', viewType: 'feed' },
    { isMyPost: true, countryName: '호주', viewType: 'feed' },
    { isMyPost: true, countryName: '뉴질랜드', viewType: 'feed' },
  ], catalog).has(28), '캐나다 빠짐 → 28 미획득');

  // 호주가 스냅이면 미인정
  assert(!computeEarnedBadgeIds([
    { isMyPost: true, countryName: '미국', viewType: 'feed' },
    { isMyPost: true, countryName: '영국', viewType: 'feed' },
    { isMyPost: true, countryName: '호주', viewType: 'snap' },
    { isMyPost: true, countryName: '캐나다', viewType: 'feed' },
    { isMyPost: true, countryName: '뉴질랜드', viewType: 'feed' },
  ], catalog).has(28), '호주 스냅 → 28 미획득');
}

// ── 한자 문화권 모두 방문(27) — 중국·일본·베트남 전부 (피드·블로그·스트립) ──
{
  const all3: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '중국', viewType: 'feed' },
    { isMyPost: true, countryName: '일본', viewType: 'blog' },
    { isMyPost: true, countryName: '베트남', viewType: 'cut' },
  ];
  assert(computeEarnedBadgeIds(all3, catalog).has(27), '중국·일본·베트남 모두 → 27 획득');

  // 둘만 → 미획득
  assert(!computeEarnedBadgeIds([
    { isMyPost: true, countryName: '중국', viewType: 'feed' },
    { isMyPost: true, countryName: '일본', viewType: 'feed' },
  ], catalog).has(27), '베트남 빠짐 → 27 미획득');

  // 베트남이 스냅이면 미인정
  assert(!computeEarnedBadgeIds([
    { isMyPost: true, countryName: '중국', viewType: 'feed' },
    { isMyPost: true, countryName: '일본', viewType: 'feed' },
    { isMyPost: true, countryName: '베트남', viewType: 'snap' },
  ], catalog).has(27), '베트남 스냅 → 27 미획득');
}

// ── 카지노 국가 방문(26) — 홍콩·미국·싱가포르·모나코·필리핀 중 3개국 (피드·블로그·스트립) ──
{
  const three: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '홍콩', viewType: 'feed' },
    { isMyPost: true, countryName: '싱가포르', viewType: 'blog' },
    { isMyPost: true, countryName: '모나코', viewType: 'cut' },
  ];
  assert(computeEarnedBadgeIds(three, catalog).has(26), '카지노 3개국 → 26 획득');

  // 2개국 → 미획득
  assert(!computeEarnedBadgeIds([
    { isMyPost: true, countryName: '미국', viewType: 'feed' },
    { isMyPost: true, countryName: '필리핀', viewType: 'feed' },
  ], catalog).has(26), '카지노 2개국 → 26 미획득');

  // 형식 제한: 스냅·앨범은 미인정
  assert(!computeEarnedBadgeIds([
    { isMyPost: true, countryName: '홍콩', viewType: 'snap' },
    { isMyPost: true, countryName: '싱가포르', viewType: 'album' },
    { isMyPost: true, countryName: '모나코', viewType: 'snap' },
  ], catalog).has(26), '스냅·앨범 3개국 → 26 미획득');
}

// ── 종교국가 방문(21) — 서로 다른 종교 3개 이상 ──
{
  // 불교(일본)+기독교(이탈리아)+힌두교(인도) = 3종교 → 획득
  const three: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본' },     // 불교
    { isMyPost: true, countryName: '이탈리아' }, // 기독교
    { isMyPost: true, countryName: '인도' },     // 힌두교
  ];
  assert(computeEarnedBadgeIds(three, catalog).has(21), '3종교(불교·기독교·힌두교) → 21 획득');

  // 2종교만 → 미획득
  const two: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본' },     // 불교
    { isMyPost: true, countryName: '이스라엘' }, // 유대교
  ];
  assert(!computeEarnedBadgeIds(two, catalog).has(21), '2종교 → 21 미획득');

  // 같은 종교 여러 국가는 1종교로만 카운트(불교: 태국·한국·중국) → 미획득
  const sameReligion: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '태국' },
    { isMyPost: true, countryName: '대한민국' },
    { isMyPost: true, countryName: '중국' },
  ];
  assert(!computeEarnedBadgeIds(sameReligion, catalog).has(21), '불교 3개국이라도 1종교 → 21 미획득');

  // 이슬람(이란)+유대교(이스라엘)+기독교(영국) = 3종교 → 획득
  const mix: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '이란' },
    { isMyPost: true, countryName: '이스라엘' },
    { isMyPost: true, countryName: '영국' },
  ];
  assert(computeEarnedBadgeIds(mix, catalog).has(21), '이슬람·유대·기독 → 21 획득');

  // 형식 제한: 스냅·앨범·지구본(형식 외) 방문은 종교 활성화에 안 셈
  const nonDiary: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', viewType: 'snap' },
    { isMyPost: true, countryName: '이탈리아', viewType: 'album' },
    { isMyPost: true, countryName: '인도', viewType: 'snap' },
  ];
  assert(!computeEarnedBadgeIds(nonDiary, catalog).has(21), '스냅·앨범 3종교 → 21 미획득');
  // 같은 3종교를 피드·블로그·스트립으로 → 획득
  const diary: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', viewType: 'feed' },
    { isMyPost: true, countryName: '이탈리아', viewType: 'blog' },
    { isMyPost: true, countryName: '인도', viewType: 'cut' },
  ];
  assert(computeEarnedBadgeIds(diary, catalog).has(21), '형식 기록 3종교 → 21 획득');
}

// ── 중국+일본 둘 다 방문(18) — 피드·블로그·스트립만 인정 ──
{
  // 둘 다 형식 기록 → 획득
  const both: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '중국', viewType: 'feed' },
    { isMyPost: true, countryName: '일본', viewType: 'blog' },
  ];
  assert(computeEarnedBadgeIds(both, catalog).has(18), '중국+일본(형식 기록) → 18 획득');

  // 일본만 → 미획득
  assert(!computeEarnedBadgeIds([{ isMyPost: true, countryName: '일본', viewType: 'feed' }], catalog).has(18), '일본만 → 18 미획득');

  // 중국이 스냅/앨범이면 인정 안 함
  const chinaSnap: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '중국', viewType: 'snap' },
    { isMyPost: true, countryName: '일본', viewType: 'feed' },
  ];
  assert(!computeEarnedBadgeIds(chinaSnap, catalog).has(18), '중국이 스냅이면 → 18 미획득');

  // 한 기록에 두 나라 모두(복수 국가) 스트립 → 획득
  const multi: BadgeStatRecord[] = [{ isMyPost: true, countryName: '중국', countries: [{ name: '중국' }, { name: '일본' }], viewType: 'cut' }];
  assert(computeEarnedBadgeIds(multi, catalog).has(18), '한 스트립 기록에 중국+일본 → 18 획득');
}

// ── 국가별 여러 지역 방문 (17 일본 등) — 대륙 기록의 서로 다른 지역 2곳 이상 ──
{
  // 일본 2개 지역(도쿄·오사카) → 17 획득
  const twoRegions: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', regionName: '도쿄' },
    { isMyPost: true, countryName: '일본', regionName: '오사카' },
  ];
  assert(computeTravelStats(twoRegions).regionsByCountry.get('일본')?.size === 2, '일본 지역 2개 집계');
  assert(computeEarnedBadgeIds(twoRegions, catalog).has(17), '일본 2개 지역 → 여러지역 방문(17) 획득');

  // 같은 지역만 여러 번 → 1개 → 미획득
  const sameRegion: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', regionName: '도쿄' },
    { isMyPost: true, countryName: '일본', regionName: '도쿄' },
  ];
  assert(!computeEarnedBadgeIds(sameRegion, catalog).has(17), '같은 지역만 → 17 미획득');

  // 지구본 기록(regionName 없음)은 지역으로 안 셈 → 미획득
  const globeOnly: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본' },
    { isMyPost: true, countryName: '일본' },
  ];
  assert(!computeEarnedBadgeIds(globeOnly, catalog).has(17), '지구본 기록(지역 없음) → 17 미획득');

  // 국가별 독립 — 미국 2지역은 19, 일본엔 영향 없음
  const usa: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '미국', regionName: '뉴욕' },
    { isMyPost: true, countryName: '미국', regionName: 'LA' },
  ];
  const e = computeEarnedBadgeIds(usa, catalog);
  assert(e.has(19) && !e.has(17) && !e.has(20), '미국 2지역 → 19만 획득(17·20 아님)');

  // 추가 국가: 프랑스 2지역(파리·니스) → 128
  const fr: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '프랑스', regionName: '파리' },
    { isMyPost: true, countryName: '프랑스', regionName: '니스' },
  ];
  assert(computeEarnedBadgeIds(fr, catalog).has(128), '프랑스 2지역 → 프랑스투어(128) 획득');
  // 독일 1지역 → 미획득
  assert(!computeEarnedBadgeIds([{ isMyPost: true, countryName: '독일', regionName: '베를린' }], catalog).has(125), '독일 1지역 → 125 미획득');

  // 뉴욕 방문(25): 미국 대륙 기록의 뉴욕 지역
  assert(computeEarnedBadgeIds([{ isMyPost: true, countryName: '미국', regionName: '뉴욕', viewType: 'feed' }], catalog).has(25), '미국 뉴욕 기록 → 25 획득');
  assert(computeEarnedBadgeIds([{ isMyPost: true, countryName: '미국', regionNameEn: 'NewYork', viewType: 'blog' }], catalog).has(25), '영문 NewYork → 25 획득');
  assert(!computeEarnedBadgeIds([{ isMyPost: true, countryName: '미국', regionName: 'LA', viewType: 'feed' }], catalog).has(25), '미국 다른 지역(LA) → 25 미획득');
  assert(!computeEarnedBadgeIds([{ isMyPost: true, countryName: '미국', viewType: 'feed' }], catalog).has(25), '미국 지구본 기록(지역 없음) → 25 미획득');
  assert(!computeEarnedBadgeIds([{ isMyPost: true, countryName: '미국', regionName: '뉴욕', viewType: 'snap' }], catalog).has(25), '스냅 뉴욕 → 25 미획득');

  // 형식 제한: 스냅·앨범의 지역은 인정 안 함(피드·블로그·스트립만)
  const snapAlbumRegions: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', regionName: '도쿄', viewType: 'snap' },
    { isMyPost: true, countryName: '일본', regionName: '오사카', viewType: 'album' },
  ];
  assert((computeTravelStats(snapAlbumRegions).regionsByCountry.get('일본')?.size ?? 0) === 0, '스냅·앨범 지역은 미집계');
  assert(!computeEarnedBadgeIds(snapAlbumRegions, catalog).has(17), '스냅·앨범 2지역 → 17 미획득');

  // 스트립+블로그 혼합은 인정
  const cutBlog: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', regionName: '도쿄', viewType: 'cut' },
    { isMyPost: true, countryName: '일본', regionName: '교토', viewType: 'blog' },
  ];
  assert(computeEarnedBadgeIds(cutBlog, catalog).has(17), '스트립+블로그 2지역 → 17 획득');
}

// ── 메타 배지(배지 5개 달성=56) ──
{
  // 충분히 많은 국가/동행으로 5개 이상 배지를 켠다
  const recs: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', companions: ['혼자', '연인', '친구', '부모님'], rating: 5 },
    { isMyPost: true, countryName: '일본' },
    { isMyPost: true, countryName: '프랑스' },
    { isMyPost: true, countryName: '독일' },
  ];
  const earned = computeEarnedBadgeIds(recs, catalog);
  // 1,2,3,9,10,11,12,35,52,8(static) = 10개 → 56(>=5),57(>=10) 켜짐
  assert(earned.has(56), '배지 5개 달성(56) 획득');
  assert(earned.has(57), '배지 10개 달성(57) 획득');
  assert(!earned.has(58), '배지 30개(58)는 미획득');
}

// ── 메타 카운트는 이미 영구 획득(행동 배지 등)도 합산 (alreadyEarnedIds) ──
{
  const emptyCat: BadgeCatalogEntry[] = []; // static 가산 없는 깨끗한 카탈로그로 격리
  // 데이터로는 4개(1,2,9,10)만 획득
  const recs: BadgeStatRecord[] = [
    { isMyPost: true, countryName: '일본', companions: ['혼자', '연인'] }, // 1,2,9,10
  ];
  assert(!computeEarnedBadgeIds(recs, emptyCat).has(56), '데이터 4개뿐 → 56 미획득');

  // 행동 배지 55를 이미 획득 → 5개째 → 56 점등
  assert(computeEarnedBadgeIds(recs, emptyCat, { alreadyEarnedIds: [55] }).has(56), '데이터4 + 영구획득(55) = 5개 → 56 획득');

  // 메타 id는 카운트에서 제외(메타를 alreadyEarned로 줘도 카운트 안 늘어남)
  assert(!computeEarnedBadgeIds(recs, emptyCat, { alreadyEarnedIds: [56, 57, 58] }).has(56), '메타 id만 추가 → 데이터 4개라 56 미획득');

  // 중복 방지: 이미 데이터로 켜진 id를 또 줘도 1개로만 카운트
  assert(!computeEarnedBadgeIds(recs, emptyCat, { alreadyEarnedIds: [1, 2, 9, 10] }).has(56), '데이터와 겹치는 id 중복 → 여전히 4개 → 56 미획득');
}

console.log(failures === 0 ? '\n✅ 모든 검증 통과' : `\n❌ ${failures}건 실패`);
process.exit(failures === 0 ? 0 : 1);
