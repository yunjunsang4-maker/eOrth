/**
 * countryLocate 검증 — npx tsx src/utils/countryLocate.verify.ts
 * 대표 좌표가 올바른 ISO2로 판정되는지, 바다는 null인지 확인한다.
 */
import {
  locateCountry, isOfflineCountryTrusted, countryNameKoByCode, countryCodeByNameEn,
  unmappedCountryNames,
} from './countryLocate';

// ⚠️ **이 줄은 파일에서 가장 먼저 실행되어야 한다.** locateCountry가 한 번이라도 돌면 인덱스가
//    생겨 "디코드 전"이라는 조건이 사라진다. countryNameKoByCode는 스스로 디코드하지 않는다는
//    계약(렌더 경로 방어, QA F2)을 지키는지 여기서만 볼 수 있다.
const koBeforeDecode = countryNameKoByCode('GU');

const CASES: { name: string; lat: number; lon: number; expect: string | null }[] = [
  { name: '도쿄',        lat: 35.6762,  lon: 139.6503,  expect: 'JP' },
  { name: '오사카',      lat: 34.6937,  lon: 135.5023,  expect: 'JP' },
  { name: '서울',        lat: 37.5665,  lon: 126.9780,  expect: 'KR' },
  { name: '부산',        lat: 35.1796,  lon: 129.0756,  expect: 'KR' },
  { name: '파리',        lat: 48.8566,  lon: 2.3522,    expect: 'FR' },
  { name: '런던',        lat: 51.5074,  lon: -0.1278,   expect: 'GB' },
  { name: '뉴욕',        lat: 40.7128,  lon: -74.0060,  expect: 'US' },
  { name: '방콕',        lat: 13.7563,  lon: 100.5018,  expect: 'TH' },
  { name: '시드니',      lat: -33.8688, lon: 151.2093,  expect: 'AU' },
  { name: '로마',        lat: 41.9028,  lon: 12.4964,   expect: 'IT' },
  { name: '베를린',      lat: 52.5200,  lon: 13.4050,   expect: 'DE' },
  { name: '타이베이',    lat: 25.0330,  lon: 121.5654,  expect: 'TW' },
  { name: '하노이',      lat: 21.0285,  lon: 105.8542,  expect: 'VN' },
  { name: '모스크바',    lat: 55.7558,  lon: 37.6173,   expect: 'RU' },
  { name: '태평양(바다)', lat: 20,      lon: -160,      expect: null },

  // ─── 남북 접경 (2026-09-09 회귀 방어) ───────────────────────────────────────
  // 110m 폴리곤(vendorWorldGeo)은 남한이 꼭짓점 19개뿐이라 휴전선이 실제보다 남쪽으로 처져,
  // 아래 남측 지점들이 전부 KP로 판정됐다 → 가본 적 없는 북한 여행 카드가 만들어졌다.
  // 2026-09-09에 data/koreaBorder10m으로 이 두 나라만 교체했고, 2026-09-11에 전 세계가
  // 10m(vendorCountries10m)로 바뀌면서 그 파일은 삭제했다. 실패하면 원천이 110m로 돌아간 것이다.
  { name: '임진각',      lat: 37.888,   lon: 126.741,   expect: 'KR' },
  { name: '도라산역',    lat: 37.90,    lon: 126.71,    expect: 'KR' },
  { name: '제3땅굴',     lat: 37.936,   lon: 126.694,   expect: 'KR' },
  { name: '연천',        lat: 38.096,   lon: 127.075,   expect: 'KR' },
  { name: '철원',        lat: 38.146,   lon: 127.313,   expect: 'KR' },
  { name: '고성통일전망대', lat: 38.578, lon: 128.36,    expect: 'KR' },

  // 110m엔 아예 없던 섬들 — null로 떨어져 매번 네트워크 역지오코딩으로 폴백했다
  { name: '제주',        lat: 33.499,   lon: 126.531,   expect: 'KR' },
  { name: '울릉도',      lat: 37.484,   lon: 130.906,   expect: 'KR' },
  { name: '백령도',      lat: 37.9646,  lon: 124.6797,  expect: 'KR' },
  { name: '통영',        lat: 34.8544,  lon: 128.4331,  expect: 'KR' },
  { name: '목포',        lat: 34.8118,  lon: 126.3922,  expect: 'KR' },

  // ─── 북한은 다시 'KP'를 그대로 낸다 ───────────────────────────────────────────
  // 2라운드에서 `NEVER_CONFIRM`으로 KP를 null로 눌렀다가 3라운드에 되돌렸다.
  // 이유: **외국인 사용자는 실제로 북한에 갈 수 있고**, 방북 중에는 로밍이 안 돼 대개
  // 오프라인이다. 오프라인 판정을 막으면 그들의 여행이 영영 안 잡힌다.
  // "이 판정을 믿을 것인가"는 순수 기하 함수가 아니라 `isOfflineCountryTrusted`가 정한다.
  { name: '평양',        lat: 39.019,   lon: 125.738,   expect: 'KP' },
  { name: '개성',        lat: 37.97,    lon: 126.55,    expect: 'KP' },
  { name: '신의주',      lat: 40.1006,  lon: 124.3982,  expect: 'KP' },
  // ↑ 110m 시절엔 CN(중국)으로 오판되던 곳이다. 10m로 KP 폴리곤에 정확히 들어왔다.

  // ⚠️ 남측 실좌표인데 KP 폴리곤 안에 있는 곳들. `locateCountry`는 여기서도 KP를 낸다 —
  //    이 오차를 흡수하는 것은 폴리곤이 아니라 거주국 기반 신뢰 판정이다(아래 별도 검증).
  //    (2라운드의 37.8583/126.5186은 한강 수면 좌표라 근거가 될 수 없어 실좌표로 교체)
  { name: '강화평화전망대(실좌표)', lat: 37.8836, lon: 126.4494, expect: 'KP' },
  { name: '강화제적봉',  lat: 37.8790,  lon: 126.4560,  expect: 'KP' },
  { name: '판문점',      lat: 37.955,   lon: 126.677,   expect: 'KP' },

  // 남측 접경 인접지는 그대로 KR — 10m 교체가 국경을 남쪽으로 밀지 않았다는 증거
  { name: '강화창후리',  lat: 37.7900,  lon: 126.3900,  expect: 'KR' },
  { name: '김포애기봉',  lat: 37.748,   lon: 126.580,   expect: 'KR' },

  // 북한과 국경을 맞댄 이웃 나라도 그대로
  { name: '단둥(중국)',  lat: 40.1236,  lon: 124.3947,  expect: 'CN' },
  { name: '훈춘(중국)',  lat: 42.8626,  lon: 130.3660,  expect: 'CN' },
  { name: '하산(러시아)', lat: 42.4306, lon: 130.6436,  expect: 'RU' },

  { name: '동해상(바다)', lat: 37.5,    lon: 131.5,     expect: null },

  // ─── 유럽 국경 근접 오판 (2026-09-11 회귀 방어) ─────────────────────────────
  // 행사 중 "유럽 국경 근처 사진이 다른 나라로 찍힌다"는 제보의 실체. 아래는 전부
  // 110m에서 **옆 나라로** 판정되던 지점이며, 10m 전면 교체로 바로잡혔다.
  // 실패하면 원천이 110m로 되돌아간 것이다.
  { name: '제네바(110m는 FR)',      lat: 46.2044, lon: 6.1432,   expect: 'CH' },
  { name: '모나코(110m는 FR)',      lat: 43.7384, lon: 7.4246,   expect: 'MC' },
  { name: '산마리노(110m는 IT)',    lat: 43.9424, lon: 12.4578,  expect: 'SM' },
  { name: '파두츠 LI(110m는 AT)',   lat: 47.1410, lon: 9.5209,   expect: 'LI' },
  { name: '안도라(110m는 FR)',      lat: 42.5063, lon: 1.5218,   expect: 'AD' },
  { name: '지브롤터(110m는 ES)',    lat: 36.1408, lon: -5.3536,  expect: 'GI' },
  { name: '가르미슈 DE(110m는 AT)', lat: 47.4917, lon: 11.0958,  expect: 'DE' },
  { name: '마스트리흐트 NL(110m는 BE)', lat: 50.8514, lon: 5.6909, expect: 'NL' },
  { name: '아헨 DE(110m는 BE)',     lat: 50.7753, lon: 6.0839,   expect: 'DE' },
  { name: '샤모니 FR(110m는 IT)',   lat: 45.9237, lon: 6.8694,   expect: 'FR' },

  // ⚠️ 바티칸만 10m로도 못 고친다. vendorCountries10m는 mapshaper 30% 단순화판이라
  //    Vatican 피처의 폴리곤이 통째로 사라진 **null 지오메트리**다(258개 중 유일).
  //    좌표 판정은 이탈리아로 떨어지고 한글 이름만 살아 있다(아래 countryNameKoByCode).
  //    고치려면 vendorCountries10m 재생성이 필요하므로 이 값은 '현재 데이터의 사실'이다.
  { name: '바티칸(10m에 폴리곤 없음)', lat: 41.9029, lon: 12.4534, expect: 'IT' },

  // 110m엔 아예 없어 매번 네트워크 지오코딩으로 폴백하던 곳들.
  // 행사장처럼 네트워크가 불안하면 이 사진들이 미상 → 앞뒤 구간 국가를 물려받아
  // 여행이 통째로 한국 구간에 흡수됐다.
  { name: '몰타 발레타',  lat: 35.8989, lon: 14.5146,  expect: 'MT' },
  { name: '세우타(스페인령)', lat: 35.8894, lon: -5.3213, expect: 'ES' },
  { name: '하파란다(스웨덴)', lat: 65.8256, lon: 24.1345, expect: 'SE' },
  { name: '오키나와 나하', lat: 26.2124, lon: 127.6809, expect: 'JP' },
  { name: '대마도',       lat: 34.2028, lon: 129.2867, expect: 'JP' },
  { name: '괌',           lat: 13.4443, lon: 144.7937, expect: 'GU' },
  { name: '사이판',       lat: 15.2123, lon: 145.7545, expect: 'MP' },
  { name: '발리 덴파사르', lat: -8.4095, lon: 115.1889, expect: 'ID' },
  { name: '푸켓',         lat: 7.8804,  lon: 98.3923,  expect: 'TH' },
  { name: '푸꾸옥',       lat: 10.2289, lon: 103.9571, expect: 'VN' },
  { name: '몰디브 말레',  lat: 4.1755,  lon: 73.5093,  expect: 'MV' },
  { name: '이스탄불',     lat: 41.0082, lon: 28.9784,  expect: 'TR' },
  // 110m엔 싱가포르 피처 자체가 없어 말레이시아 폴리곤에 먹혔다(작은 영토 우선 정렬로도 못 고친다)
  { name: '싱가포르',     lat: 1.3521,  lon: 103.8198, expect: 'SG' },

  // ⚠️ 아래 두 건은 "고쳐야 할 값"이 아니라 **현재 데이터의 한계 기록**이다.
  //    30% 단순화는 섬을 지우고 해안선을 안쪽으로 깎는다 → 판정이 null(미상)이 되어
  //    호출부가 지오코딩으로 폴백한다. 틀린 나라가 아니므로 방향은 안전하다.
  { name: '보라카이(10m에도 섬 없음)',   lat: 11.9674, lon: 121.9248, expect: null },
  { name: '벤티밀리아 해안(단순화로 바다)', lat: 43.7906, lon: 7.6083, expect: null },
  { name: '벤티밀리아 내륙(200m 안쪽)',   lat: 43.8000, lon: 7.6100,  expect: 'IT' },

  // ─── 국경 도시 양쪽 — 0.5도 캐시 격자가 삼키던 쌍 ───────────────────────────
  // 폴리곤이 정확해도 호출부 캐시가 0.5도(≈55km)면 옆 나라 사진이 같은 나라로 찍힌다.
  // 그래서 TravelImportScreen·recentPhotoCountryScan의 캐시를 0.05도로 줄이고
  // 오프라인 판정은 아예 캐시하지 않게 바꿨다(2026-09-11). 아래가 그 근거 좌표다.
  { name: '바젤(CH)',        lat: 47.5596, lon: 7.5886,  expect: 'CH' },
  { name: '생루이(FR)',      lat: 47.5900, lon: 7.5600,  expect: 'FR' },
  { name: '바일암라인(DE)',  lat: 47.5900, lon: 7.6200,  expect: 'DE' },
  { name: '코펜하겐(DK)',    lat: 55.6761, lon: 12.5683, expect: 'DK' },
  { name: '말뫼(SE)',        lat: 55.6050, lon: 13.0038, expect: 'SE' },
  { name: '빈(AT)',          lat: 48.2082, lon: 16.3738, expect: 'AT' },
  { name: '브라티슬라바(SK)', lat: 48.1486, lon: 17.1077, expect: 'SK' },
  { name: '니스(FR)',        lat: 43.7102, lon: 7.2620,  expect: 'FR' },

  // ─── 알려진 한계: 스위스 안 월경지 2곳이 옆 나라로 판정된다 (QA 2026-09-11 F4) ───
  // 30% 단순화가 월경지 폴리곤을 삼켰다. 위 벤티밀리아·보라카이와 달리 이건 null(미상)이
  // 아니라 **다른 나라로 확정**되므로 방향이 안전하지 않다 — 지오코딩 폴백조차 안 탄다.
  // 그래도 고치지 않는 이유: 둘 다 인구 2천 명대이고, 110m에서도 맞았을 리 없으며,
  // 해결하려면 vendorCountries10m 재생성이 필요하다.
  // 기대값을 **실측값(CH)** 으로 박아 둔다 — 나중에 데이터가 좋아지면 이 줄이 깨져서 알게 된다.
  { name: '캄피오네 디탈리아(IT 월경지 → CH 오판)', lat: 45.9698, lon: 8.9711, expect: 'CH' },
  { name: '부싱언 암 호흐라인(DE 월경지 → CH 오판)', lat: 47.6953, lon: 8.6903, expect: 'CH' },
];

let pass = 0, fail = 0;
const t0 = Date.now();
for (const c of CASES) {
  const r = locateCountry(c.lat, c.lon);
  const got = r?.code ?? null;
  const ok = got === c.expect;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}: expect=${c.expect} got=${got}${r ? ` (${r.name})` : ''}`);
}
// ─── isOfflineCountryTrusted — 오프라인 판정을 믿을지 정하는 정책 ───
// 한국 거주자는 방북이 법적으로 불가하므로 KP 판정은 접경 오차로 본다(→ 지오코딩 재확인).
// 거주국이 한국이 아니면 실제 방북이 가능하므로 KP를 그대로 믿는다.
const TRUST: { code: string; home: string | undefined; expect: boolean; why: string }[] = [
  { code: 'KP', home: 'KR', expect: false, why: '거주국 KR + KP → 불신(접경 오차로 본다)' },
  { code: 'KP', home: 'kr', expect: false, why: '거주국 소문자 kr도 같게 취급' },
  { code: 'KP', home: 'JP', expect: true,  why: '거주국 JP + KP → 신뢰(실제 방북 가능)' },
  { code: 'KP', home: 'US', expect: true,  why: '거주국 US + KP → 신뢰' },
  { code: 'KP', home: undefined, expect: true, why: '거주국 미설정 + KP → 신뢰(막지 않는다)' },
  { code: 'KR', home: 'KR', expect: true,  why: 'KP가 아니면 거주국과 무관하게 신뢰(KR)' },
  { code: 'CN', home: 'KR', expect: true,  why: 'KP가 아니면 거주국과 무관하게 신뢰(CN)' },
  { code: 'JP', home: undefined, expect: true, why: 'KP가 아니면 거주국 미설정도 신뢰' },
];
for (const t of TRUST) {
  const got = isOfflineCountryTrusted(t.code, t.home);
  const ok = got === t.expect;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${t.why}: expect=${t.expect} got=${got}`);
}

// ─── 0.5도 격자가 왜 위험한가 — 바젤 3국이 **같은 셀**에 들어간다 ───
// 캐시 키가 0.5도면 아래 셋이 한 칸이라, 먼저 판정된 나라가 나머지 사진에도 그대로 쓰인다.
// 0.05도로 줄이면 셋이 갈라진다. 이 assert가 깨지면 격자 축소의 근거가 사라진 것이다.
// 호출부(TravelImportScreen·recentPhotoCountryScan)의 키 계산과 같은 식을 쓴다 — 0.5도는 `*2/2`,
// 0.05도는 `*20/20`. 나눗셈으로 바꿔 쓰면 부동소수 결과가 달라져 근거가 흐려진다.
const cell = (lat: number, lon: number, inv: number) =>
  `${Math.round(lat * inv) / inv}_${Math.round(lon * inv) / inv}`;
const TRIO: [string, number, number][] = [
  ['바젤', 47.5596, 7.5886], ['생루이', 47.5900, 7.5600], ['바일암라인', 47.5900, 7.6200],
];
const GRID: [string, number, number][] = [
  ['바젤 3국이 0.5도 셀 1칸에 뭉친다(옛 캐시의 결함)', new Set(TRIO.map(([, a, o]) => cell(a, o, 2))).size, 1],
  ['0.05도 셀에서는 3칸으로 갈라진다', new Set(TRIO.map(([, a, o]) => cell(a, o, 20))).size, 3],
  ['폴리곤 판정 자체는 3개국으로 갈린다', new Set(TRIO.map(([, a, o]) => locateCountry(a, o)?.code)).size, 3],
];
for (const [why, got, want] of GRID) {
  const ok = got === want;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${why}: expect=${want} got=${got}`);
}

// ─── 10m 이름 → ISO 매핑 전수 ───────────────────────────────────────────────
// 매핑에도 제외 집합에도 없는 이름이 하나라도 있으면 그 나라 사진이 조용히 미상이 된다.
{
  const left = unmappedCountryNames();
  const ok = left.length === 0;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  10m 전 피처 매핑 또는 제외: 남은 이름 ${left.length}건 ${left.join(', ')}`);
}

// ─── countryNameKoByCode — 앱 나라 목록에 없는 영토의 한글 이름 ──────────────
// constants/countries.ts에 없는 코드는 여행 카드 이름이 'GU'·'MP'처럼 코드로 떨어졌다.
const KO: [string, string | undefined][] = [
  ['GU', '괌'],
  ['MP', '북마리아나 제도'],
  ['VA', '바티칸 시국'],  // 폴리곤이 없어도 이름은 있어야 한다(위 바티칸 케이스 참조)
  ['GI', '지브롤터'],
  ['MT', '몰타'],
  ['gu', '괌'],           // 소문자도 같게 취급
  ['CY', '키프로스'],     // N. Cyprus가 CY를 가로채면 '북키프로스'가 된다
  ['SO', '소말리아'],     // Somaliland가 SO를 가로채면 '소말릴란드'가 된다
  ['ZZ', undefined],      // 모르는 코드는 undefined — 기본값으로 떨어지면 안 된다
  ['', undefined],        // 빈 문자열
];
for (const [code, want] of KO) {
  const got = countryNameKoByCode(code);
  const ok = got === want;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  countryNameKoByCode('${code}'): expect=${want} got=${got}`);
}
// 디코드 전에는 답하지 않는다(파일 맨 위에서 미리 받아둔 값). 이 두 줄이 짝이다:
// 위 'GU'는 CASES 루프가 이미 인덱스를 세운 뒤라 '괌'이고, 아래는 그 전이라 undefined다.
{
  const ok = koBeforeDecode === undefined;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  디코드 전 countryNameKoByCode('GU'): expect=undefined got=${koBeforeDecode}`);
}

// ─── 프로토타입 키 입력 (QA F3) ───────────────────────────────────────────────
// 객체 리터럴을 `obj[key]`로 읽으면 'constructor'가 함수로 잡혀 .toUpperCase()에서 죽는다.
// 이 조회는 AlbumCreateScreen의 useMemo 안에서 돌아 **화면이 크래시**한다. 110m 시절엔 null이었다.
for (const bad of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']) {
  const got = countryCodeByNameEn(bad);
  const gotKo = countryNameKoByCode(bad);
  const ok = got === undefined && gotKo === undefined;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  프로토타입 키 '${bad}' → undefined (throw 금지): got=${got}/${gotKo}`);
}

// 성능 — 인덱스 빌드 후 1만 회 판정 시간
const t1 = Date.now();
for (let i = 0; i < 10000; i++) locateCountry(35 + (i % 10) * 0.01, 135 + (i % 10) * 0.01);
const t2 = Date.now();
console.log(`\n초기화+전체 케이스: ${t1 - t0}ms / 판정 1만회: ${t2 - t1}ms`);
console.log(fail === 0 ? 'ALL PASS' : `${fail} FAILED`);
if (fail > 0) process.exit(1);
