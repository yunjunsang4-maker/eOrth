/**
 * countryLocate 검증 — npx tsx src/utils/countryLocate.verify.ts
 * 대표 좌표가 올바른 ISO2로 판정되는지, 바다는 null인지 확인한다.
 */
import { locateCountry, isOfflineCountryTrusted } from './countryLocate';

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
  // data/koreaBorder10m(Natural Earth 10m)로 교체해 고쳤다. 실패하면 그 교체가 풀린 것이다.
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

// 성능 — 인덱스 빌드 후 1만 회 판정 시간
const t1 = Date.now();
for (let i = 0; i < 10000; i++) locateCountry(35 + (i % 10) * 0.01, 135 + (i % 10) * 0.01);
const t2 = Date.now();
console.log(`\n초기화+전체 케이스: ${t1 - t0}ms / 판정 1만회: ${t2 - t1}ms`);
console.log(fail === 0 ? 'ALL PASS' : `${fail} FAILED`);
if (fail > 0) process.exit(1);
