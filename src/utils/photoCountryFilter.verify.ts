/**
 * photoCountryFilter 검증 — node node_modules/tsx/dist/cli.mjs src/utils/photoCountryFilter.verify.ts
 *
 * 이 파일이 지키는 것: 사진첩 "이 국가 사진만" 필터가 **countryLocate 한 곳**만 보는가.
 * 2026-09-11 이전엔 여기에 110m 기반 두 번째 point-in-polygon 구현이 따로 있었고,
 * 여행 불러오기만 10m로 올린 탓에 같은 좌표를 두 화면이 다른 나라로 봤다.
 */
import fs from 'fs';
import path from 'path';
import { getCountryFeature, pointInCountry } from './photoCountryFilter';
import { NO_POLYGON_CODES, countryCodeByNameEn, polygonlessCountryCodes } from './countryLocate';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// ── 1) 이름 → 토큰 ────────────────────────────────────────────────────────────
// 호출부(AlbumCreateScreen)는 MainScreen.KO_TO_EN의 값 + '대한민국'일 때만 'South Korea'를 넘긴다.
eq(getCountryFeature('South Korea'), { code: 'KR' }, "이름 → 토큰: 'South Korea'");
eq(getCountryFeature('United States of America'), { code: 'US' }, '이름 → 토큰: 미국 표준명');
// 별칭 — KO_TO_EN이 110m·일반 표기를 들고 있어 10m 축약명과 다르다
eq(getCountryFeature('Czech Republic'), { code: 'CZ' }, "별칭: 'Czech Republic' → CZ(10m는 Czechia)");
eq(getCountryFeature('Ivory Coast'), { code: 'CI' }, "별칭: 'Ivory Coast' → CI(10m는 Côte d'Ivoire)");
eq(getCountryFeature('The Bahamas'), { code: 'BS' }, "별칭: 'The Bahamas' → BS(10m는 Bahamas)");
eq(getCountryFeature('  France  '), { code: 'FR' }, '앞뒤 공백 무시');
// 널 계열·미지의 값 — 기본값으로 떨어지면 필터가 엉뚱한 나라를 걸러낸다
eq(getCountryFeature('Zedland'), null, '모르는 이름 → null');
eq(getCountryFeature(''), null, '빈 문자열 → null');
eq(getCountryFeature(undefined as unknown as string), null, 'undefined → null');
// 폴리곤이 없는 나라는 토큰을 주면 안 된다 — 주면 모든 좌표가 false라 "사진 0장"이 된다
eq(getCountryFeature('Vatican City'), null, '바티칸(10m에 폴리곤 없음) → null = 필터 비활성');
// NO_POLYGON_CODES가 데이터와 어긋나면 다른 나라에서 같은 사고가 난다
eq(polygonlessCountryCodes(), [...NO_POLYGON_CODES], 'NO_POLYGON_CODES가 실제 데이터와 일치');

// ── 2) 좌표 판정 — 대표 5개국 + 이웃 나라 좌표 ────────────────────────────────
// 이웃 좌표가 false여야 한다는 쪽이 본론이다. 110m 시절엔 국경이 밀려 옆 나라 사진이 섞였다.
const PAIRS: { en: string; inside: [number, number]; outside: [number, number]; why: string }[] = [
  { en: 'United States of America', inside: [34.0522, -118.2437], outside: [49.2827, -123.1207], why: '미국(LA) / 캐나다(밴쿠버)' },
  { en: 'Czech Republic',           inside: [50.0755, 14.4378],   outside: [48.1486, 17.1077],   why: '체코(프라하) / 슬로바키아(브라티슬라바)' },
  { en: 'United Kingdom',           inside: [51.5074, -0.1278],   outside: [53.3498, -6.2603],   why: '영국(런던) / 아일랜드(더블린)' },
  { en: 'Serbia',                   inside: [44.7866, 20.4489],   outside: [45.8150, 15.9819],   why: '세르비아(베오그라드) / 크로아티아(자그레브)' },
  { en: 'South Korea',              inside: [37.5665, 126.9780],  outside: [35.6762, 139.6503],  why: '대한민국(서울) / 일본(도쿄)' },
];
for (const p of PAIRS) {
  const tok = getCountryFeature(p.en);
  if (!tok) { failed++; console.error(`✗ ${p.why}: 토큰을 못 만들었다`); continue; }
  eq(pointInCountry(tok, p.inside[0], p.inside[1]), true, `${p.why} — 안쪽 true`);
  eq(pointInCountry(tok, p.outside[0], p.outside[1]), false, `${p.why} — 이웃 나라 false`);
}
// 바다는 어느 나라에도 안 들어간다(GPS 있는 사진이 무조건 통과하면 필터가 무의미)
eq(pointInCountry({ code: 'KR' }, 20, -160), false, '태평양 한가운데 → false');

// ── 3) MainScreen.KO_TO_EN 값 전수 — 하나라도 안 풀리면 그 나라 필터가 조용히 사라진다 ──
// KO_TO_EN을 import할 수 없다(MainScreen이 react-native를 끌고 와 tsx 변환이 깨진다).
// 그렇다고 값 목록을 여기 복사하면 표가 두 벌이 되어 언젠가 어긋난다 → **소스를 읽어 훑는다.**
{
  const src = fs.readFileSync(path.resolve(__dirname, '../screens/MainScreen.tsx'), 'utf8');
  const start = src.indexOf('export const KO_TO_EN');
  const block = start < 0 ? '' : src.slice(start, src.indexOf('};', start));
  const values = [...new Set([...block.matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]))];
  // getCountryFeature가 아니라 countryCodeByNameEn으로 훑는다 — 여기서 보는 것은 "이름이
  // 코드로 풀리는가"이고, 바티칸은 코드는 풀리되 폴리곤이 없어 일부러 토큰을 안 준다.
  const unresolved = values.filter((v) => !countryCodeByNameEn(v));
  eq(values.length > 150, true, `KO_TO_EN 값을 실제로 읽었다(${values.length}개)`);
  eq(unresolved, [], `KO_TO_EN 값 전수가 ISO로 풀린다 (안 풀린 것: ${unresolved.join(', ') || '없음'})`);
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
