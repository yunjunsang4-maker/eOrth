// 도시 라벨 데이터 무결성 검증.
//
// 이 표는 지구본 WebView가 canvas에 직접 그리는 원본이라, 값이 비거나 좌표가 어긋나도
// 타입 검사는 통과하고 실기기에서만 드러난다(빈 라벨 / 엉뚱한 자리의 핀).
// 특히 en이 비면 그 도시만 영어 모드에서 한글로 남아 더 이상해 보인다 — 전수로 막는다.
import { CITY_LABELS } from './cityLabels';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// ── 0개가 아닐 것 ──
// 빈 배열이면 아래 "전부 통과" 검사들이 전수 0건으로 조용히 통과한다(무의미한 초록불 방지).
eq(CITY_LABELS.length > 0, true, '도시 목록이 비어 있지 않다');

// ── en: 전수 비어 있지 않을 것 ──
// 공백만 든 값('  ')도 실패 처리한다 — 라벨로 그리면 폭 0의 빈 글자가 된다.
const noEn = CITY_LABELS.filter(c => typeof c.en !== 'string' || c.en.trim() === '').map(c => c.n);
eq(noEn, [], 'en이 빈 도시 없음');

// ── n: 전수 비어 있지 않을 것 ──
// en이 없을 때의 폴백 원천이라, 이쪽이 비면 폴백조차 빈 라벨이 된다.
const noN = CITY_LABELS.filter(c => typeof c.n !== 'string' || c.n.trim() === '').map(c => c.en);
eq(noN, [], 'n(한글명)이 빈 도시 없음');

// ── en은 ASCII일 것 ──
// 캔버스 라벨은 시스템 sans-serif로 그려져 발음기호 글리프가 빠지는 기기가 있다
// (São Paulo → Sao Paulo 로 적어 둔 이유). 한글이 en에 잘못 들어간 경우도 여기서 잡힌다.
const nonAscii = CITY_LABELS.filter(c => /[^\x20-\x7E]/.test(c.en)).map(c => `${c.n}=${c.en}`);
eq(nonAscii, [], 'en에 비ASCII 문자 없음');

// ── 좌표 유효 범위 ──
// 위도 ±90 / 경도 ±180 을 벗어나면 구면 투영이 뒤집혀 반대편 반구에 핀이 찍힌다.
const badLat = CITY_LABELS.filter(c => !Number.isFinite(c.lat) || c.lat < -90 || c.lat > 90).map(c => c.n);
eq(badLat, [], '위도 -90~90 범위 이탈 없음');
const badLon = CITY_LABELS.filter(c => !Number.isFinite(c.lon) || c.lon < -180 || c.lon > 180).map(c => c.n);
eq(badLon, [], '경도 -180~180 범위 이탈 없음');

// 경계값 자체(0, ±90, ±180)는 유효하다 — 위 필터가 그 값을 실패로 잡지 않는지 확인한다.
// (부등호를 <= 로 잘못 바꾸면 적도·날짜변경선 위의 도시가 추가될 때 조용히 터진다)
const inRange = (lat: number, lon: number) =>
  Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lon) && lon >= -180 && lon <= 180;
eq(inRange(0, 0), true, '경계: 적도·본초자오선(0,0)은 유효');
eq(inRange(-90, 180), true, '경계: 남극·날짜변경선(-90,180)은 유효');
eq(inRange(90.1, 0), false, '경계: 위도 90.1은 무효');
eq(inRange(0, -180.1), false, '경계: 경도 -180.1은 무효');
eq(inRange(NaN, 0), false, '널 계열: NaN 좌표는 무효');

// ── t(tier)는 1 또는 2 ──
// 렌더는 t===2 만 따로 걸러 최대 줌에서 등장시킨다. 3 같은 값이 들어오면 그 도시는
// "tier1 취급"이 되어 얕은 줌부터 튀어나온다(조건이 t!==2 가 아니라 t===2 라서).
const badTier = CITY_LABELS.filter(c => c.t !== 1 && c.t !== 2).map(c => `${c.n}=${String(c.t)}`);
eq(badTier, [], 't는 1 또는 2만');

// ── 중복 없음 ──
// 같은 이름이 두 번 들어오면 격자 컬링(CELL=76)에 걸려 하나는 안 보이는 유령 항목이 된다.
const dupN = CITY_LABELS.map(c => c.n).filter((v, i, a) => a.indexOf(v) !== i);
eq(dupN, [], '한글명 중복 없음');
const dupEn = CITY_LABELS.map(c => c.en).filter((v, i, a) => a.indexOf(v) !== i);
eq(dupEn, [], '영문명 중복 없음');

// ── 대표값 표본 ──
// 영어권 통용 표기인지(현지어 고유 표기가 아닌지) 눈으로 고정해 두는 자리.
const by = (n: string) => CITY_LABELS.find(c => c.n === n)?.en;
eq(by('서울'), 'Seoul', '표본: 서울 → Seoul');
eq(by('뮌헨'), 'Munich', '표본: 뮌헨 → Munich (München 아님)');
eq(by('빈'), 'Vienna', '표본: 빈 → Vienna (Wien 아님)');
eq(by('피렌체'), 'Florence', '표본: 피렌체 → Florence (Firenze 아님)');
eq(by('베네치아'), 'Venice', '표본: 베네치아 → Venice (Venezia 아님)');
eq(by('모르는도시'), undefined, '모르는 값: 목록에 없는 이름은 undefined');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log(`\n✅ 모든 검증 통과 (도시 ${CITY_LABELS.length}개)`);
