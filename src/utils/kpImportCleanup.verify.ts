/**
 * kpImportCleanup 검증 — node node_modules/tsx/dist/cli.mjs src/utils/kpImportCleanup.verify.ts
 * 잘못 만들어진 북한 여행 카드 표지 기록만 골라내는지, 사용자 기록은 건드리지 않는지 확인한다.
 */
import { findWronglyImportedKpRecords, isNorthKoreaName, KP_CLEANUP_CUTOFF_MS } from './kpImportCleanup';
import { countryInfoFromCode } from './pastTripScan';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

type R = { id: string; countryName?: string; isImportCover?: boolean; timestamp?: number };

// 1) 정상 경로 — 불러오기 표지 + 북한이면 대상
eq(
  findWronglyImportedKpRecords([{ id: 'a', countryName: 'North Korea', isImportCover: true }]),
  ['a'],
  '정상: 불러오기 표지 + North Korea → 대상',
);

// 2) ⚠️ **저장 경로 재현** — 손으로 'North Korea'를 박은 픽스처는 실제 사고를 못 잡는다.
//    불러오기가 실제로 무엇을 저장하는지 그 함수를 직접 불러 확인한다:
//    TravelImportScreen이 countryInfoFromCode(code)를 폴백 이름 없이 부르므로 결과는 'KP'다.
//    이 케이스가 깨지면 정리 함수가 실제 오염 데이터를 0건 잡는다(2026-09-09 QA F1).
const stored = countryInfoFromCode('KP').countryName;
eq(stored, 'KP', "저장 경로 실측: countryInfoFromCode('KP').countryName");
eq(
  findWronglyImportedKpRecords([{ id: 'real', countryName: stored, isImportCover: true }]),
  ['real'],
  '저장 경로가 실제로 만드는 값으로 만든 표지 기록 → 대상',
);
// 대조군 — 같은 함수가 KR에 대해서는 정상 이름을 주고, 그건 대상이 아니다
eq(countryInfoFromCode('KR').countryName, '대한민국', "저장 경로 실측: KR은 '대한민국'");
eq(
  findWronglyImportedKpRecords([
    { id: 'kr', countryName: countryInfoFromCode('KR').countryName, isImportCover: true },
  ]),
  [],
  '저장 경로가 만든 KR 표지 기록은 제외',
);

// 3) 이름 표기 4종 전부 잡혀야 한다 (오프라인 폴리곤은 영문, 역지오코딩은 로케일별 한글)
const four: R[] = [
  { id: 'en', countryName: 'North Korea', isImportCover: true },
  { id: 'ko', countryName: '북한', isImportCover: true },
  { id: 'full', countryName: '조선민주주의인민공화국', isImportCover: true },
  { id: 'csv', countryName: 'Korea, North', isImportCover: true },
];
eq(findWronglyImportedKpRecords(four), ['en', 'ko', 'full', 'csv'], '표기 4종 전부 대상');

// 4) 표기 흔들림 — 앞뒤 공백·대소문자는 무시한다 (사용자 입력과 가져오기 데이터가 섞이는 필드)
eq(
  findWronglyImportedKpRecords([
    { id: 'sp', countryName: '  North Korea  ', isImportCover: true },
    { id: 'lc', countryName: 'north korea', isImportCover: true },
    { id: 'uc', countryName: 'NORTH KOREA', isImportCover: true },
    { id: 'kosp', countryName: ' 북한 ', isImportCover: true },
  ]),
  ['sp', 'lc', 'uc', 'kosp'],
  '표기 흔들림: 앞뒤 공백·대소문자 무시',
);

// 5) ⚠️ 가장 중요한 방어 — 사용자가 손으로 만든 북한 기록은 절대 대상이 아니다(데이터 파괴 방지)
eq(
  findWronglyImportedKpRecords([
    { id: 'manual1', countryName: 'North Korea' },                       // isImportCover 없음
    { id: 'manual2', countryName: '북한', isImportCover: false },        // 명시적 false
    { id: 'manual3', countryName: 'KP' },                                // 실제 저장값이어도 예외 없음
  ]),
  [],
  'isImportCover가 아닌 북한 기록은 제외(사용자 직접 생성) — 저장값 KP도 예외 없음',
);

// 6) 회귀 방어 — 다른 나라 표지 기록은 남는다
eq(
  findWronglyImportedKpRecords([
    { id: 'kr', countryName: 'South Korea', isImportCover: true },
    { id: 'jp', countryName: 'Japan', isImportCover: true },
    { id: 'ko-kr', countryName: '대한민국', isImportCover: true },
  ]),
  [],
  '다른 나라 표지 기록은 제외',
);

// 7) 널 계열 — '' / undefined 각각. 뭉뚱그리면 빈 이름이 북한으로 오인될 수 있다
eq(findWronglyImportedKpRecords([{ id: 'e', countryName: '', isImportCover: true }]), [], "countryName='' → 제외");
eq(findWronglyImportedKpRecords([{ id: 'u', isImportCover: true }]), [], 'countryName=undefined → 제외');
eq(isNorthKoreaName(undefined), false, 'isNorthKoreaName(undefined) = false');
eq(isNorthKoreaName(''), false, "isNorthKoreaName('') = false");

// 8) 경계 — 빈 배열 (정리 effect가 아무 일도 하지 않아야 하는 정상 상태)
eq(findWronglyImportedKpRecords([] as R[]), [], '빈 배열 → 대상 0건');

// 9) 모르는 값 — 비슷하지만 다른 이름은 대상이 아니다
eq(isNorthKoreaName('Korea'), false, "'Korea'는 남북 구분 불가 → 대상 아님");
eq(isNorthKoreaName('South Korea'), false, "'South Korea' → 대상 아님");

// 10) 혼합 목록에서 순서를 보존하며 대상만 고른다
eq(
  findWronglyImportedKpRecords([
    { id: 'jp', countryName: 'Japan', isImportCover: true },
    { id: 'kp1', countryName: 'North Korea', isImportCover: true },
    { id: 'mine', countryName: 'North Korea' },
    { id: 'kp2', countryName: '북한', isImportCover: true },
  ]),
  ['kp1', 'kp2'],
  '혼합 목록: 대상만 원래 순서대로',
);

// 11) 커트오프 — 외국인 사용자의 **진짜 방북**을 지우지 않기 위한 세 번째 조건.
//     커트오프 이후에 만들어진 KP 표지 기록은 지오코딩이 확인해 준 실제 여행이다.
// 이 한 줄만 날짜를 박는다 — 상수가 의도한 값인지 고정하는 게 목적이다.
// 아래 경계 케이스들은 전부 상수를 참조하므로 상수를 바꾸면 같이 따라온다.
// 값이 수정일(2026-09-10)이 아니라 10-01인 이유는 kpImportCleanup.ts 주석 참조(OTA 확산 여유).
eq(KP_CLEANUP_CUTOFF_MS, Date.parse('2026-10-01T00:00:00+09:00'), '커트오프 = 2026-10-01 KST 자정');
eq(
  findWronglyImportedKpRecords([
    { id: 'before', countryName: 'KP', isImportCover: true, timestamp: KP_CLEANUP_CUTOFF_MS - 1 },
  ]),
  ['before'],
  '커트오프 직전(-1ms) → 대상',
);
eq(
  findWronglyImportedKpRecords([
    { id: 'exact', countryName: 'KP', isImportCover: true, timestamp: KP_CLEANUP_CUTOFF_MS },
  ]),
  [],
  '커트오프 정각 → 제외(경계는 미만만 대상)',
);
eq(
  findWronglyImportedKpRecords([
    { id: 'after', countryName: 'KP', isImportCover: true, timestamp: KP_CLEANUP_CUTOFF_MS + 1 },
  ]),
  [],
  '커트오프 직후(+1ms) → 제외 — 다른 두 조건은 맞지만 시각만 이후인 진짜 방북',
);
// timestamp 없음/비정상 = 오염 시기 옛 기록이라는 뜻이므로 대상에 포함한다
eq(
  findWronglyImportedKpRecords([
    { id: 'nots', countryName: 'KP', isImportCover: true },
    { id: 'nan', countryName: 'KP', isImportCover: true, timestamp: NaN },
  ]),
  ['nots', 'nan'],
  'timestamp 없음·NaN → 대상(옛 기록 = 오염 시기)',
);
// 커트오프만으로는 못 지운다 — 세 조건 동시 충족이 원칙
eq(
  findWronglyImportedKpRecords([
    { id: 'old-manual', countryName: 'KP', timestamp: 0 },                          // 표지 아님
    { id: 'old-other', countryName: 'Japan', isImportCover: true, timestamp: 0 },   // 북한 아님
  ]),
  [],
  '커트오프 이전이어도 나머지 두 조건을 못 채우면 제외',
);

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
