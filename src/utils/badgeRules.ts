// 배지 자동 활성화 — 사용자의 '내 기록'(isMyPost) 데이터로 판정 가능한 배지만 계산한다.
// 데이터로 판정할 수 없는 배지(지역 특화·날짜 패턴 등)는 카탈로그의 static earned 값을 그대로 둔다.
// 순수 함수로 작성 → 화면과 독립적으로 테스트 가능.

import { COUNTRIES, CONTINENT_ORDER } from '../constants/countries';
// badges.ts가 아니라 badgeVisibility.ts에서 가져온다 — badges.ts에는 배지 이미지 require가
// 40개 넘게 있어, 여기서 그걸 끌고 오면 이 순수 로직의 검증(npm test)이 node에서 못 돈다.
import { HIDDEN_BADGE_IDS } from '../constants/badgeVisibility';

// 판정에 필요한 최소 필드만 받는다(TravelRecord와 느슨하게 호환).
export interface BadgeStatRecord {
  isMyPost?: boolean;
  countryName?: string;
  countries?: { name: string }[];
  rating?: number;
  companions?: string[];
  companionFriends?: string[]; // 함께한 앱 메이트 이름들 (84·85용)
  medias?: string[];
  startDate?: string;
  endDate?: string;
  date?: string;
  regionName?: string;     // 섬 지역 판정용 (자유 입력)
  regionNameEn?: string;
  snapHour?: number; // 촬영 시점 현지 시각의 시(0~23) — 89·90용
  cutPhoto?: { frameId?: string }; // 70 프레임 콜렉터용
  viewType?: string; // 'feed' | 'blog' | 'album' | 'snap' | 'cut' (없으면 'feed')
}

export interface BadgeCatalogEntry {
  id: number;
  earned: boolean;
}

// 기록 외부의 사용자 데이터(설정 등)를 판정에 함께 넘길 때 사용.
export interface BadgeComputeOptions {
  homeCountryName?: string; // 현재 거주국 이름 — 방문국 집계에서 동적 제외(거주국은 '방문'이 아님)
  // 이미 영구 획득한 배지 id (행동 배지 55, 과거 획득분 등). 메타 배지(개수 달성) 카운트에 합산된다.
  alreadyEarnedIds?: number[];
  neighborCount?: number; // 메이트(서로메이트) 수 (78·81·82·83용)
  loginStreak?: number;       // 앱 연속 접속 일수 (112·113·114용)
  daysSinceInstall?: number;  // 앱 설치 후 경과 일수 (115용)
  installedAt?: number | null;// 앱 첫 설치 시각 (116 얼리어답터용)
}

// 앱 출시일 — 배지 116(출시 첫 달 가입) 판정 기준.
const APP_LAUNCH_DATE = Date.UTC(2026, 6, 13); // 2026-07-13
const EARLY_ADOPTER_WINDOW_MS = 31 * 24 * 60 * 60 * 1000; // 출시 후 첫 달(31일)

// 국가별 '여러 지역 방문' 배지: 그 국가에서 서로 다른 지역(regionName) 2곳 이상 기록 시 점등.
// 대륙 기록만 regionName을 남기므로 지구본 기록은 자연히 제외된다.
// 새 국가는 여기에 { id, country }만 추가하면 판정·데이터 배지에 자동 포함된다.
// (country는 constants/countries의 정확한 한글명과 일치해야 함)
export const COUNTRY_REGION_BADGES: { id: number; country: string }[] = [
  { id: 17, country: '일본' },
  { id: 19, country: '미국' },
  { id: 20, country: '중국' },
  // 추가 (125~) — 대륙 기록 국가들
  { id: 125, country: '독일' },
  { id: 126, country: '스페인' },
  { id: 127, country: '영국' },
  { id: 128, country: '프랑스' },
  { id: 129, country: '이탈리아' },
];

// 종교별 대표 국가 그룹 — 그룹 내 국가를 1곳이라도 방문하면 그 종교가 '활성화'된 것으로 본다.
// (배지 21: 서로 다른 종교 3개 이상 활성화 시 점등)
const RELIGION_COUNTRY_GROUPS: string[][] = [
  ['이스라엘'],                                                     // 유대교
  ['인도', '네팔'],                                                 // 힌두교
  ['태국', '미얀마', '스리랑카', '대한민국', '한국', '중국', '일본', '몽골'], // 불교
  ['사우디아라비아', '이란', '이라크'],                             // 이슬람교
  ['이탈리아', '미국', '영국', '러시아', '그리스'],                 // 기독교
];

// 카지노로 유명한 국가 — 이 중 3개국 이상 방문 시 배지 26 점등.
const CASINO_COUNTRIES = ['홍콩', '미국', '싱가포르', '모나코', '필리핀'];

// 영어권 — 모두 방문 시 배지 28 점등.
const ENGLISH_COUNTRIES = ['미국', '영국', '호주', '캐나다', '뉴질랜드'];

// 사막 지역 국가 — 모두 방문 시 배지 29 점등.
const DESERT_COUNTRIES = ['이집트', '사우디아라비아', '아랍에미리트', '몽골'];

// 열대 지역 국가 — 이 중 5개국 이상 방문 시 배지 30 점등.
const TROPICAL_COUNTRIES = ['인도네시아', '태국', '베트남', '말레이시아', '필리핀', '브라질', '콜롬비아', '콩고', '케냐'];

// 데이터로 자동 판정하는 배지 id 집합. 이 안에 든 배지는 static earned를 무시하고 데이터로만 켠다.
export const DATA_DRIVEN_BADGE_IDS = new Set<number>([
  1,                              // 첫 기록
  2, 3, 4, 5, 6, 7,               // 대륙 첫 방문 (중동 배지는 아시아와 중복이라 제거됨)
  9, 10, 11, 12, 14, 15,          // 동행/스타일
  123, 124,                       // 동행: 가족·형제
  16,                             // 일본 재방문
  18,                             // 중국+일본 둘 다 방문
  21,                             // 종교국가 3종교 이상 방문
  25,                             // 뉴욕 방문(미국 대륙 기록)
  26,                             // 카지노 국가 3개국 이상 방문
  28,                             // 영어권(미국·영국·호주·캐나다·뉴질랜드) 모두 방문
  29,                             // 사막 지역(이집트·사우디·UAE·몽골) 모두 방문
  30,                             // 열대 지역 9개국 중 5개국 이상 방문
  32,                             // 한번에 여러 나라 방문(한 기록 2개국+)
  33,                             // 정확히 1년만에 같은 곳 방문
  ...COUNTRY_REGION_BADGES.map((b) => b.id), // 국가별 여러 지역 방문 (17·19·20 + 추가분)
  34,                             // 같은 나라 재방문 5회
  35, 36, 37, 38, 39, 40, 41, 42, // 방문 국가 수 마일스톤 + 모든 대륙
  43,                             // 모든 등록 국가 방문
  44,                             // 대륙 하나의 모든 국가 방문
  45, 46,                         // 여행기록 개수
  48, 49, 50, 51, 52,             // 별점 기록
  66, 67, 68, 70, 71,             // 블로그10 / 스트립5 / 스냅30 / 프레임5종 / 피드20
  88, 89, 90,                     // 스냅: 스트릭(7일) / 야행성(2~5시) / 일출(5~7시)
  97, 98, 99,                     // 기록 습관: 연속30 / 1·1 / 12·25
  69,                             // 만능 기록자(피드·블로그·스트립·스냅 각 1개+)
  84, 85,                         // 소셜: 앱 메이트 동행 1회 / 3회
  78, 81, 82, 83,                 // 맞팔 메이트 수: 50 / 1 / 10 / 100
  112, 113, 114,                  // 앱 연속 접속: 30 / 50 / 100일
  115, 116,                       // eOrth 1주년(설치 1년) / 얼리어답터(출시 첫 달 가입)
  118, 119, 120, 121,             // 시즌: 벚꽃 / 옥토버페스트 / 카니발 / 오로라
  53,                             // 매분기 여행(4분기 모두 기록)
  54,                             // 매달 여행(12개월 모두 기록)
  63,                             // 새해 여행(12/31~1/1 포함)
  64,                             // 여름휴가 여행(7~8월 기록)
  65,                             // 겨울휴가 여행(1~2월 기록)
  56, 57, 58, 59, 60, 61,         // 배지 개수 달성(메타)
]);

// 메타 배지(배지 N개 달성) — 다른 배지들의 누적 획득 수로 판정한다.
const META_BADGE_THRESHOLDS: Record<number, number> = {
  56: 5,
  57: 10,
  58: 30,
  59: 50,
  60: 100,
  61: 200,
};

// 국가명 → 대륙 매핑 (constants/countries 기반)
const NAME_TO_CONTINENT: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const c of COUNTRIES) map[c.name] = c.continent;
  // 흔한 별칭 보정
  map['한국'] = '아시아';
  return map;
})();

// '기록'으로 인정하는 뷰 형식 — 피드·블로그·스트립(cut). 앨범(보관)·스냅(임시)은 제외.
const DIARY_VIEW_TYPES = new Set<string>(['feed', 'blog', 'cut']);

// '여행기록 개수'(45·46)용 — 피드·블로그·스트립·스냅. 앨범(보관)만 제외.
const JOURNAL_VIEW_TYPES = new Set<string>(['feed', 'blog', 'cut', 'snap']);

// 대륙 → 그 대륙에 속한 국가명 목록 (배지 44: 한 대륙의 모든 국가 방문)
const COUNTRY_NAMES_BY_CONTINENT: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const c of COUNTRIES) {
    const a = m.get(c.continent);
    if (a) a.push(c.name); else m.set(c.continent, [c.name]);
  }
  return m;
})();

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(s?: string): number | null {
  if (!s) return null;
  const t = new Date(s.replace(/\./g, '-')).getTime();
  return Number.isFinite(t) ? t : null;
}

// 한 기록의 숙박일수(밤 수). 날짜가 없으면 null.
function nightsOf(r: BadgeStatRecord): number | null {
  const start = parseDate(r.startDate) ?? parseDate(r.date);
  const end = parseDate(r.endDate) ?? start;
  if (start == null || end == null) return null;
  return Math.max(0, Math.round((end - start) / DAY_MS));
}

// 여행 날짜 범위[start, end]가 12/31과 1/1을 모두 포함하는가(해를 넘기는 여행).
function tripCrossesNewYear(start: number, end: number): boolean {
  const startY = new Date(start).getUTCFullYear();
  const endY = new Date(end).getUTCFullYear();
  for (let y = startY + 1; y <= endY; y++) {
    const dec31 = Date.parse(`${y - 1}-12-31`); // 전년 12/31
    const jan1 = Date.parse(`${y}-01-01`);       // 당해 1/1
    if (start <= dec31 && end >= jan1) return true; // 둘 다 범위 안
  }
  return false;
}

// 같은 여행으로 묶는 날짜 간격(recordStore의 그룹 결합 기준과 동일하게 7일).
const TRIP_GAP_MS = 7 * DAY_MS;

// 한 국가의 기록들을 '여행 단위'로 묶어 방문 횟수를 센다.
// reps: 각 기록의 대표 날짜(시작일/날짜). 7일 넘게 떨어지면 별도 여행으로 계산.
// 날짜가 전혀 없으면 분리할 수 없으므로 기록이 있으면 최소 1회로 본다(과대 집계 방지).
function countDistinctTrips(reps: (number | null)[]): number {
  const dated = reps.filter((n): n is number => n != null).sort((a, b) => a - b);
  if (dated.length === 0) return reps.length > 0 ? 1 : 0;
  let trips = 1;
  for (let i = 1; i < dated.length; i++) {
    if (dated[i] - dated[i - 1] > TRIP_GAP_MS) trips += 1;
  }
  return trips;
}

export interface TravelStats {
  recordCount: number;
  diaryRecordCount: number; // 피드·블로그·스트립(cut) 형식 기록 수
  journalRecordCount: number; // 피드·블로그·스트립·스냅 형식 기록 수(앨범 제외) — 45·46용
  countryCount: number;
  countries: Set<string>;
  diaryCountries: Set<string>; // 피드·블로그·스트립 기록으로 방문한 국가
  feedRecordCount: number;     // 피드 형식 기록 수 (viewType 미지정=feed 포함)
  blogRecordCount: number;     // 블로그 형식 기록 수
  snapRecordCount: number;     // 스냅 형식 기록 수
  maxSnapStreak: number;       // 스냅을 연속으로 기록한 최대 일수 (88용)
  hasNightSnap: boolean;       // 현지 새벽 2~5시(2,3,4시) 스냅이 있는가 (89용)
  hasSunriseSnap: boolean;     // 현지 오전 5~7시(5,6시) 스냅이 있는가 (90용)
  cutRecordCount: number;      // 스트립(cut) 기록 수
  cutFrames: Set<string>;      // 스트립에서 사용한 서로 다른 프레임(frameId) 집합
  viewTypesUsed: Set<string>;  // 사용한 뷰 형식 집합(feed/blog/cut/snap/album) — 69용
  companionFriendRecordCount: number; // 앱 메이트와 동행한 기록 수 (84·85용)
  maxDiaryStreak: number;       // 기록(피드·블로그·스트립)을 연속한 최대 일수 (97용)
  hasNewYearDayRecord: boolean; // 1월 1일 기록이 있는가 (98용)
  hasChristmasRecord: boolean;  // 12월 25일 기록이 있는가 (99용)
  hasSakuraRecord: boolean;     // 3~4월 일본 기록 (118용)
  hasOktoberfestRecord: boolean;// 10월 독일 기록 (119용)
  hasCarnivalRecord: boolean;   // 2~3월 브라질 기록 (120용)
  hasAuroraRecord: boolean;     // 겨울(12·1·2월) 노르웨이/아이슬란드/핀란드 기록 (121용)
  continents: Set<string>;
  ratings: Set<number>;
  companions: Set<string>;
  hasDayTrip: boolean;
  hasLongTrip: boolean;   // 30일 이상
  hasNewYearTrip: boolean;    // 여행 날짜가 12/31~1/1을 포함(해 넘김)하는 기록이 있는가
  hasMultiCountryRecord: boolean; // 한 기록에 2개국 이상 담긴 기록(피드·블로그·스트립)이 있는가
  hasAnnualRevisit: boolean;  // 같은 여행지·같은 월일에 정확히 1년 차이로 방문한 기록이 있는가
  quartersRecorded: Set<number>; // 피드·블로그·스트립 기록 날짜가 속한 분기(1~4) 집합
  monthsRecorded: Set<number>;   // 피드·블로그·스트립 기록 날짜가 속한 월(1~12) 집합
  japanVisits: number;        // 일본 방문 횟수(여행 단위)
  maxCountryVisits: number;   // 한 국가 최다 방문 횟수(여행 단위)
  regionsByCountry: Map<string, Set<string>>; // 국가 → 방문한 서로 다른 지역(regionName) 집합
  // 거주국 이름(별칭 포함). 방문국 집계에서는 제외되지만 '전 국가/대륙 정복'(43·44)
  // 판정에서는 covered로 합류시켜야 해서 통계에 남긴다.
  homeNames: Set<string>;
}

// 내 기록만 모아 통계를 집계한다.
// 기준은 StatsScreen과 동일하게 `isMyPost !== false` — isMyPost가 명시적으로 false인 기록만 제외하고,
// 값이 없는(undefined) 기록(시드 등)은 내 여행으로 본다. (두 화면 숫자 불일치 방지)
export function computeTravelStats(records: BadgeStatRecord[], options?: BadgeComputeOptions): TravelStats {
  const mine = records.filter((r) => r.isMyPost !== false);

  const countries = new Set<string>();
  const diaryCountries = new Set<string>();
  const continents = new Set<string>();
  const ratings = new Set<number>();
  const companions = new Set<string>();
  const quartersRecorded = new Set<number>();
  const monthsRecorded = new Set<number>();
  let feedRecordCount = 0;
  let blogRecordCount = 0;
  let snapRecordCount = 0;
  const snapDays = new Set<number>(); // 스냅을 기록한 날짜(자정 기준) 집합
  let hasNightSnap = false;
  let hasSunriseSnap = false;
  let cutRecordCount = 0;
  const cutFrames = new Set<string>();
  const viewTypesUsed = new Set<string>();
  let companionFriendRecordCount = 0;
  const diaryDays = new Set<number>(); // 기록을 남긴 날짜(자정 기준) — 97 연속 기록
  let hasNewYearDayRecord = false;
  let hasChristmasRecord = false;
  let hasSakuraRecord = false;
  let hasOktoberfestRecord = false;
  let hasCarnivalRecord = false;
  let hasAuroraRecord = false;
  let diaryRecordCount = 0;
  let journalRecordCount = 0;
  let hasDayTrip = false;
  let hasLongTrip = false;
  let hasNewYearTrip = false;
  let hasMultiCountryRecord = false;
  // 국가별 기록 대표 날짜 모음 → 마지막에 '여행 단위'로 묶어 국가별 방문 횟수를 센다.
  const repsByCountry = new Map<string, (number | null)[]>();
  // 국가 → 방문한 서로 다른 지역(regionName) 집합. regionName은 대륙 기록에서만 채워진다.
  const regionsByCountry = new Map<string, Set<string>>();
  // '같은 여행지|같은 월일' → 방문 연도 집합. 1년 차이(연속 연도)가 있으면 33 점등.
  const annualVisits = new Map<string, Set<number>>();

  // 거주국은 방문국이 아니다 — 현재 거주국 기준 동적 제외('대한민국'↔'한국' 별칭 포함)
  const homeNames = new Set<string>();
  if (options?.homeCountryName) {
    homeNames.add(options.homeCountryName);
    if (options.homeCountryName === '대한민국') homeNames.add('한국');
    if (options.homeCountryName === '한국') homeNames.add('대한민국');
  }

  for (const r of mine) {
    const rep = parseDate(r.startDate) ?? parseDate(r.date); // 이 기록의 대표 날짜
    const isDiary = DIARY_VIEW_TYPES.has(r.viewType ?? 'feed'); // 피드·블로그·스트립만 '기록'으로 인정
    viewTypesUsed.add(r.viewType ?? 'feed'); // 69: 사용한 형식 집합
    if (JOURNAL_VIEW_TYPES.has(r.viewType ?? 'feed')) journalRecordCount += 1; // 45·46용(스냅 포함, 앨범 제외)
    // 형식별 개수 집계 (66 블로그/67 스트립/68 스냅/71 피드)
    const vt = r.viewType ?? 'feed';
    if (vt === 'feed') feedRecordCount += 1;
    else if (vt === 'blog') blogRecordCount += 1;
    else if (vt === 'snap') {
      snapRecordCount += 1;
      if (rep != null) snapDays.add(Math.floor(rep / DAY_MS) * DAY_MS); // 자정 기준 날짜
      // 현지 시각 기준 시간대 스냅 — 89 야행성(2~5시), 90 일출(5~7시)
      if (typeof r.snapHour === 'number') {
        if (r.snapHour >= 2 && r.snapHour < 5) hasNightSnap = true;
        if (r.snapHour >= 5 && r.snapHour < 7) hasSunriseSnap = true;
      }
    }
    else if (vt === 'cut') {
      cutRecordCount += 1;
      if (r.cutPhoto?.frameId) cutFrames.add(r.cutPhoto.frameId);
    }
    // 방문 국가 (대표 + 복수 국가). 한 기록 내 중복 국가는 한 번만 처리한다.
    const names = new Set<string>();
    if (r.countryName) names.add(r.countryName);
    if (r.countries) for (const c of r.countries) if (c?.name) names.add(c.name);
    for (const n of names) {
      // 거주국 제외 — 단 도시(지역)를 붙인 기록은 거주국이어도 방문이다(통계 화면과 동일 규칙, 2026-08-13).
      // 도시 없는 거주국 기록(홈 스냅 등)은 종전대로 제외 — 스냅은 GPS 감지 국가가 실려
      // 이 보호가 없으면 집에서 찍은 스냅만으로 방문국 배지가 진행된다.
      if (homeNames.has(n) && !r.regionName) continue;
      countries.add(n);
      if (isDiary) diaryCountries.add(n); // 형식 기록으로 방문한 국가
      const cont = NAME_TO_CONTINENT[n];
      if (cont) continents.add(cont);
      // 재방문 계열(16 일본·34 같은 나라)도 피드·블로그·스트립만 인정
      if (isDiary) {
        const arr = repsByCountry.get(n);
        if (arr) arr.push(rep); else repsByCountry.set(n, [rep]);
      }
    }

    // 한 기록에 2개국 이상(한번에 여러 나라) — 피드·블로그·스트립만 인정
    if (isDiary && names.size >= 2) hasMultiCountryRecord = true;

    // 정확히 1년만에 같은 곳: 같은 여행지(국가+지역) + 같은 월일의 방문 연도를 모은다.
    if (isDiary && rep != null) {
      const d = new Date(rep);
      const mmdd = `${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
      const region = (r.regionName ?? r.regionNameEn ?? '').trim();
      const country = r.countryName ?? (r.countries && r.countries[0]?.name) ?? '';
      if (country) {
        const key = `${country}|${region}|${mmdd}`;
        let ys = annualVisits.get(key);
        if (!ys) { ys = new Set(); annualVisits.set(key, ys); }
        ys.add(d.getUTCFullYear());
      }
    }

    // 국가별 방문 지역 수집 — 피드·블로그·스트립 기록만 인정(스냅·앨범 제외).
    // (대륙 기록에서만 regionName이 채워지므로 지구본 기록은 자연 제외)
    const region = (r.regionName ?? r.regionNameEn ?? '').trim();
    if (region && isDiary) {
      const c = r.countryName ?? (r.countries && r.countries[0]?.name);
      if (c) {
        let set = regionsByCountry.get(c);
        if (!set) { set = new Set(); regionsByCountry.set(c, set); }
        set.add(region);
      }
    }

    // 기간 관련 배지(생일·당일치기·30일)는 피드·블로그·스트립 기록만 인정한다.
    if (isDiary) {
      diaryRecordCount += 1;
      // 매분기/매달 여행 + 연속 기록(97) + 특정일(98·99): 기록 날짜에서 파생
      if (rep != null) {
        const d = new Date(rep);
        const month = d.getUTCMonth() + 1; // 1~12
        const day = d.getUTCDate();
        quartersRecorded.add(Math.floor((month - 1) / 3) + 1);
        monthsRecorded.add(month);
        diaryDays.add(Math.floor(rep / DAY_MS) * DAY_MS); // 97 연속 기록
        if (month === 1 && day === 1) hasNewYearDayRecord = true;  // 98 새해 첫 기록
        if (month === 12 && day === 25) hasChristmasRecord = true; // 99 크리스마스
        // 시즌 배지 (국가 + 월) — 118·119·120·121
        if (names.has('일본') && (month === 3 || month === 4)) hasSakuraRecord = true;
        if (names.has('독일') && month === 10) hasOktoberfestRecord = true;
        if (names.has('브라질') && (month === 2 || month === 3)) hasCarnivalRecord = true;
        if ((names.has('노르웨이') || names.has('아이슬란드') || names.has('핀란드')) && (month === 12 || month === 1 || month === 2)) hasAuroraRecord = true;
      }
      // 새해 여행: 여행 날짜 범위로 판정
      if (rep != null) {
        const end = parseDate(r.endDate) ?? rep;
        if (tripCrossesNewYear(rep, end)) hasNewYearTrip = true;
      }
      // 30일 이상
      const nights = nightsOf(r);
      if (nights != null && nights >= 30) hasLongTrip = true;
      // 당일치기: 시작일·종료일이 모두 명시되고 같은 날(0박)일 때만.
      // (종료일 없이 date만 있는 기록을 0박으로 오인하지 않도록 폴백을 쓰지 않는다)
      if (r.startDate && r.endDate) {
        const sd = parseDate(r.startDate);
        const ed = parseDate(r.endDate);
        if (sd != null && ed != null && Math.round((ed - sd) / DAY_MS) === 0) hasDayTrip = true;
      }
    }
    // 별점(48~52)은 별점을 다는 형식(피드·블로그·스트립)에서만 집계
    if (isDiary && typeof r.rating === 'number' && r.rating >= 1 && r.rating <= 5) {
      ratings.add(r.rating);
    }
    if (r.companions) for (const comp of r.companions) companions.add(comp);

    // 소셜: 앱 메이트 동행 집계(84·85)
    if (r.companionFriends && r.companionFriends.length > 0) {
      companionFriendRecordCount += 1;
    }
  }

  // 국가별 방문 횟수(여행 단위) 산출
  let maxCountryVisits = 0;
  for (const reps of repsByCountry.values()) {
    maxCountryVisits = Math.max(maxCountryVisits, countDistinctTrips(reps));
  }


  // 연속 일수 공통 계산 (자정 timestamp 집합 → 최대 연속일)
  const maxConsecutiveDays = (daySet: Set<number>): number => {
    const sorted = [...daySet].sort((a, b) => a - b);
    let max = sorted.length > 0 ? 1 : 0;
    let cur = max;
    for (let i = 1; i < sorted.length; i++) {
      cur = (sorted[i] - sorted[i - 1] === DAY_MS) ? cur + 1 : 1;
      if (cur > max) max = cur;
    }
    return max;
  };
  const maxSnapStreak = maxConsecutiveDays(snapDays);   // 88
  const maxDiaryStreak = maxConsecutiveDays(diaryDays); // 97

  // 정확히 1년만에 같은 곳: 같은 여행지·월일에 연속 연도(Y, Y+1)가 있으면 true
  let hasAnnualRevisit = false;
  for (const ys of annualVisits.values()) {
    for (const y of ys) { if (ys.has(y + 1)) { hasAnnualRevisit = true; break; } }
    if (hasAnnualRevisit) break;
  }

  return {
    recordCount: mine.length,
    diaryRecordCount,
    journalRecordCount,
    countryCount: countries.size,
    countries,
    diaryCountries,
    feedRecordCount,
    blogRecordCount,
    snapRecordCount,
    maxSnapStreak,
    hasNightSnap,
    hasSunriseSnap,
    cutRecordCount,
    cutFrames,
    viewTypesUsed,
    companionFriendRecordCount,
    maxDiaryStreak,
    hasNewYearDayRecord,
    hasChristmasRecord,
    hasSakuraRecord,
    hasOktoberfestRecord,
    hasCarnivalRecord,
    hasAuroraRecord,
    continents,
    ratings,
    companions,
    hasDayTrip,
    hasLongTrip,
    hasNewYearTrip,
    hasMultiCountryRecord,
    hasAnnualRevisit,
    quartersRecorded,
    monthsRecorded,
    maxCountryVisits,
    regionsByCountry,
    homeNames,
    japanVisits: countDistinctTrips(repsByCountry.get('일본') ?? []), // 기록 수가 아니라 여행 단위
  };
}

// 최종 획득 배지 id 집합을 계산한다.
// - 데이터 판정 가능한 배지: 통계로 켠다.
// - 그 외 배지: 카탈로그의 static earned 값을 유지한다.
// - 메타 배지: 위에서 켜진 (메타 제외) 배지 수로 판정한다.
export function computeEarnedBadgeIds(
  records: BadgeStatRecord[],
  catalog: BadgeCatalogEntry[],
  options?: BadgeComputeOptions
): Set<number> {
  const s = computeTravelStats(records, options);
  const earned = new Set<number>();
  const on = (id: number, cond: boolean) => { if (cond) earned.add(id); };

  // ── 첫 기록 (피드·블로그·스트립 형식으로 기록했을 때) ──
  on(1, s.diaryRecordCount >= 1);

  // ── 대륙 첫 방문 ──
  on(2, s.continents.has('아시아'));
  on(3, s.continents.has('유럽'));
  on(4, s.continents.has('북아메리카'));
  on(5, s.continents.has('남아메리카'));
  on(6, s.continents.has('오세아니아'));
  on(7, s.continents.has('아프리카'));
  // 모든 대륙 1개국 이상 — 피드·블로그·스트립 기록 기준(2~7과 달리 형식 제한)
  const diaryContinents = new Set<string>();
  for (const c of s.diaryCountries) { const cont = NAME_TO_CONTINENT[c]; if (cont) diaryContinents.add(cont); }
  on(42, diaryContinents.size >= CONTINENT_ORDER.length);

  // ── 동행/스타일 ──
  on(9, s.companions.has('혼자'));
  on(10, s.companions.has('연인'));
  on(11, s.companions.has('부모님'));
  on(12, s.companions.has('친구'));
  on(123, s.companions.has('가족'));
  on(124, s.companions.has('형제'));
  on(14, s.hasDayTrip);
  on(15, s.hasLongTrip);

  // ── 재방문 ──
  on(16, s.japanVisits >= 2);          // 일본 재방문
  on(34, s.maxCountryVisits >= 5);     // 같은 나라 재방문 5회

  // ── 중국·일본 둘 다 방문 (피드·블로그·스트립 기록 기준) ──
  on(18, s.diaryCountries.has('중국') && s.diaryCountries.has('일본'));

  // ── 종교국가 방문: 서로 다른 종교 3개 이상 활성화 (피드·블로그·스트립 기록만 인정) ──
  const activeReligions = RELIGION_COUNTRY_GROUPS.filter((g) => g.some((c) => s.diaryCountries.has(c))).length;
  on(21, activeReligions >= 3);

  // ── 카지노 국가 방문: 홍콩·미국·싱가포르·모나코·필리핀 중 3개국 이상 (피드·블로그·스트립) ──
  on(26, CASINO_COUNTRIES.filter((c) => s.diaryCountries.has(c)).length >= 3);

  // ── 영어권 모두 방문: 미국·영국·호주·캐나다·뉴질랜드 전부 (피드·블로그·스트립) ──
  on(28, ENGLISH_COUNTRIES.every((c) => s.diaryCountries.has(c)));

  // ── 사막 지역 모두 방문: 이집트·사우디아라비아·아랍에미리트·몽골 전부 (피드·블로그·스트립) ──
  on(29, DESERT_COUNTRIES.every((c) => s.diaryCountries.has(c)));

  // ── 열대 지역 방문: 9개국 중 5개국 이상 (피드·블로그·스트립) ──
  on(30, TROPICAL_COUNTRIES.filter((c) => s.diaryCountries.has(c)).length >= 5);

  // ── 한번에 여러 나라 방문: 한 기록에 2개국 이상 (피드·블로그·스트립) ──
  on(32, s.hasMultiCountryRecord);

  // ── 정확히 1년만에 같은 곳: 같은 여행지·같은 월일에 1년 차이 방문 (피드·블로그·스트립) ──
  on(33, s.hasAnnualRevisit);

  // ── 국가별 여러 지역 방문 (대륙 기록 기준, 서로 다른 지역 2곳 이상) ──
  for (const def of COUNTRY_REGION_BADGES) {
    on(def.id, (s.regionsByCountry.get(def.country)?.size ?? 0) >= 2);
  }

  // ── 뉴욕 방문 (미국 대륙 기록의 뉴욕 지역) ──
  // regionsByCountry는 대륙 기록 + 피드·블로그·스트립만 담으므로 지구본·스냅·앨범은 자동 제외.
  const usRegions = s.regionsByCountry.get('미국');
  // 지역명이 없고 코드(regionNameEn = 'US-NY')만 남은 기록도 인정한다 — 지역 키가
  // 코드 체계로 마이그레이션된 뒤 저장된 기록이 이름 비교만으로는 걸리지 않았다.
  const visitedNewYork = usRegions
    ? [...usRegions].some((r) => {
        const x = r.toLowerCase().replace(/\s+/g, '');
        return x.includes('뉴욕') || x.includes('newyork') || x.includes('us-ny');
      })
    : false;
  on(25, visitedNewYork);

  // ── 방문 국가 수 마일스톤 (피드·블로그·스트립 기록 기준) ──
  // 통계 카드용 countryCount(모든 형식)와 달리, 배지는 diaryCountries로 판정한다.
  const diaryCountryCount = s.diaryCountries.size;
  on(35, diaryCountryCount >= 3);
  on(36, diaryCountryCount >= 5);
  on(37, diaryCountryCount >= 10);
  on(38, diaryCountryCount >= 20);
  on(39, diaryCountryCount >= 30);
  on(40, diaryCountryCount >= 50);
  on(41, diaryCountryCount >= 100);

  // ── 모든 등록 국가 방문 (피드·블로그·스트립) ──
  // 대한민국은 별칭 '한국'으로 기록됐을 수 있어 보정.
  // 거주국은 방문국 집계(diaryCountries)에서 빠지지만, '전 국가'·'대륙 정복'은 사는 나라를
  // 안 가본 나라로 두면 구조적으로 달성 불가라 이 판정에서만 covered로 합류시킨다.
  // (43·44 전용 지역 변수라 다른 배지·방문국 카운트에는 영향이 없다)
  const coveredCountries = new Set(s.diaryCountries);
  for (const h of s.homeNames) coveredCountries.add(h);
  if (coveredCountries.has('한국')) coveredCountries.add('대한민국');
  on(43, COUNTRIES.every((c) => coveredCountries.has(c.name)));

  // ── 대륙 정복자: 한 대륙의 모든 국가 방문 (피드·블로그·스트립) ──
  let conqueredContinent = false;
  for (const names of COUNTRY_NAMES_BY_CONTINENT.values()) {
    if (names.every((n) => coveredCountries.has(n))) { conqueredContinent = true; break; }
  }
  on(44, conqueredContinent);

  // ── 여행기록 개수: 피드·블로그·스트립·스냅 기록 수(앨범 제외) ──
  on(45, s.journalRecordCount >= 5);
  on(46, s.journalRecordCount >= 10);

  // ── 별점 기록 ──
  on(48, s.ratings.has(1));
  on(49, s.ratings.has(2));
  on(50, s.ratings.has(3));
  on(51, s.ratings.has(4));
  on(52, s.ratings.has(5));

  // ── 매분기 여행: 피드·블로그·스트립 기록 날짜가 4분기 모두 포함 ──
  on(53, s.quartersRecorded.size === 4);

  // ── 매달 여행: 피드·블로그·스트립 기록 날짜가 12개월 모두 포함 ──
  on(54, s.monthsRecorded.size === 12);

  // ── 새해 여행: 여행 날짜가 12/31~1/1을 포함(해 넘김) (피드·블로그·스트립) ──
  on(63, s.hasNewYearTrip);

  // ── 여름휴가 여행: 7월 또는 8월 기록 (피드·블로그·스트립) ──
  on(64, s.monthsRecorded.has(7) || s.monthsRecorded.has(8));

  // ── 겨울휴가 여행: 1월 또는 2월 기록 (피드·블로그·스트립) ──
  on(65, s.monthsRecorded.has(1) || s.monthsRecorded.has(2));

  // ── 형식별 개수 배지 ──
  on(66, s.blogRecordCount >= 10); // 블로그의 달인: 블로그 10개
  on(67, s.cutRecordCount >= 5);   // 스트립 큐레이터: 스트립 5개 작성
  on(68, s.snapRecordCount >= 30); // 스냅 마스터: 스냅 30개
  on(70, s.cutFrames.size >= 5);   // 프레임 콜렉터: 서로 다른 프레임 5종
  on(71, s.feedRecordCount >= 20); // 피드의 달인: 피드 20개 작성
  on(88, s.maxSnapStreak >= 7);    // 스냅 스트릭: 7일 연속 스냅
  on(89, s.hasNightSnap);          // 야행성 스냅: 현지 새벽 2~5시 스냅
  on(90, s.hasSunriseSnap);        // 일출 스냅: 현지 오전 5~7시 스냅

  // ── 기록 습관 배지 ──
  on(97, s.maxDiaryStreak >= 30);  // 꾸준함의 힘: 30일 연속 기록
  on(98, s.hasNewYearDayRecord);   // 새해 첫 기록: 1월 1일
  on(99, s.hasChristmasRecord);    // 크리스마스 트래블러: 12월 25일

  // ── 시즌 배지 (국가 + 계절) ──
  on(118, s.hasSakuraRecord);      // 벚꽃 시즌: 3~4월 일본
  on(119, s.hasOktoberfestRecord); // 옥토버페스트: 10월 독일
  on(120, s.hasCarnivalRecord);    // 카니발: 2~3월 브라질
  on(121, s.hasAuroraRecord);      // 오로라: 겨울 노르웨이/아이슬란드/핀란드

  // ── 만능 기록자: 피드·블로그·스트립·스냅 각각 1개 이상 ──
  on(69, ['feed', 'blog', 'cut', 'snap'].every((v) => s.viewTypesUsed.has(v)));

  // ── 소셜 배지 ──
  on(84, s.companionFriendRecordCount >= 1);       // 첫 동행: 앱 메이트 동행 1회
  on(85, s.companionFriendRecordCount >= 3);       // 동행 메이트: 앱 메이트 동행 3회

  // ── 메이트 수 ──
  const neighborCount = options?.neighborCount ?? 0;
  on(81, neighborCount >= 1);    // 첫 메이트
  on(82, neighborCount >= 10);   // 인싸의 시작
  on(78, neighborCount >= 50);   // 소셜 나비
  on(83, neighborCount >= 100);  // 인맥왕

  // ── 앱 연속 접속일 (112·113·114) ──
  const streak = options?.loginStreak ?? 0;
  on(112, streak >= 30);  // 꾸준한 여행자
  on(113, streak >= 50);  // 충성 유저
  on(114, streak >= 100); // eOrth 마니아

  // ── eOrth 1주년: 설치 후 365일 경과 ──
  on(115, (options?.daysSinceInstall ?? 0) >= 365);

  // ── 얼리어답터: 출시 후 첫 달(31일) 이내 설치 ──
  on(116, options?.installedAt != null && options.installedAt < APP_LAUNCH_DATE + EARLY_ADOPTER_WINDOW_MS);

  // ── 데이터로 판정하지 않는 배지: static earned 값을 유지 ──
  for (const b of catalog) {
    if (DATA_DRIVEN_BADGE_IDS.has(b.id)) continue; // 데이터 판정 대상은 위에서 결정됨
    if (b.earned) earned.add(b.id);
  }

  // ── 메타 배지: 데이터/static 획득 + 이미 영구 획득(행동 배지 등)을 합쳐 판정(메타 자신은 제외) ──
  // 출시 축소로 숨긴 배지는 사용자에게 보이지 않으므로 개수에 넣지 않는다(숨김 해제 시 자동 합산 복귀).
  const metaIds = new Set(Object.keys(META_BADGE_THRESHOLDS).map(Number));
  const countSet = new Set<number>();
  for (const id of earned) if (!metaIds.has(id) && !HIDDEN_BADGE_IDS.has(id)) countSet.add(id);
  if (options?.alreadyEarnedIds) {
    // 폐기(카탈로그에서 삭제)된 배지가 badgeEarnedAt에 남아 있을 수 있다 — 더는 존재하지 않는
    // 배지가 메타 카운트를 부풀리지 않게, 영구 획득분은 카탈로그에 있는 id만 센다.
    const catalogIds = new Set(catalog.map((b) => b.id));
    for (const id of options.alreadyEarnedIds) {
      if (!metaIds.has(id) && !HIDDEN_BADGE_IDS.has(id) && catalogIds.has(id)) countSet.add(id);
    }
  }
  const total = countSet.size;
  for (const [idStr, threshold] of Object.entries(META_BADGE_THRESHOLDS)) {
    on(Number(idStr), total >= threshold);
  }

  return earned;
}
