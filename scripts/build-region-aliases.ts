/**
 * GADM 구 지역 키 → Natural Earth 코드 별칭 표 생성기
 *
 * 실행: node node_modules/tsx/dist/cli.mjs scripts/build-region-aliases.ts
 * 산출: src/data/regionKeyAliases.ts
 *
 * 절차와 배경은 scripts/build-region-aliases.md 참고.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { CITY_TO_PROV } from '../src/constants/homeRegions';
import {
  ISO3, DISSOLVE, NeProps, norm, loadNeFeatures, codeOf,
  assertNoPrimaryNameConflict, primaryNameCode,
} from './lib/neRegionCode';

const NE = 'scripts/geo-tmp/ne10m_admin1.geojson';
const GADM = 'C:/Users/2023user/OneDrive/바탕 화면/Important2/gadm-backup-2026-07-28/geo';
const OUT = 'src/data/regionKeyAliases.ts';

// 1~3단계로 잡히지 않는 표기차 — 미매칭 리포트를 보고 사람이 채운다
// (키: `${ISO3}|${정규화된_구키}`, 값: NE 쪽 이름 또는 병합 그룹명)
const MANUAL: Record<string, string> = {
  'JPN|naoasaki': 'Nagasaki',   // GADM 쪽 오타
  'NLD|fryslan': 'Friesland',
  'EGY|aluqsur': 'Luxor',
  // 미매칭 리포트를 보고 여기에 추가한다
  'COL|bogotadc': 'Bogota',                              // GADM "Bogotá D.C." ↔ NE "Bogota"(수도특별구)
  'EGY|alwadialjadid': 'New Valley',                      // GADM "Al Wadi al Jadid" ↔ NE name_en "New Valley"
  'ESP|islascanarias': 'Canary Is.',                      // GADM "Islas Canarias" ↔ NE region명 "Canary Is."
  'GRC|athos': 'Mount Athos',                             // GADM "Athos" ↔ NE name_alt "Mount Athos"
  'MAR|laayouneboujdoursakiaelh': 'Laâyoune-Boujdour-Sakia El Hamra', // GADM 원본 이름이 잘려있음(SakiaElH)
  'ARE|fujairah': 'Fujayrah', // NE 결함 피처(AE-X01~, 아래 ne 필터에서 제외) 대신 진짜 푸자이라(AE-FU)로
  'ARE|dubai': 'Dubay',       // 두바이는 도시가 아니라 에미리트(admin-1) — NE name "Dubay"(AE-DU)
  'USA|washingtondc': 'District of Columbia', // CITY_TO_PROV의 메릴랜드 흡수보다 우선 — NE에 US-DC가 있다

  // ── 기계적 표기차 / NE가 더 굵게 묶은 경우 ──
  'TUN|ariana': 'Manouba',           // NE 10m에는 아리아나 주 폴리곤이 없다 — 주 전역이 마누바(TN-14)에 흡수돼 있음을 표본점으로 확인
  'VNM|backan': 'Northeast Vietnam', // NE는 박깐성을 개별 피처로 두지 않고 '동북부(Đông Bắc, VN-53)' 블록에 넣었다
  'VNM|ongnai': 'Đông Nam Bộ',       // 동나이성 → NE '동남부(VN-39)' 블록
  'VNM|hungyen': 'Red River Delta',  // 흥옌성 → NE '홍강 삼각주(Đồng Bằng Sông Hồng, VN-66)' 블록

  // ── 그리스: 구 7광역 → NE 현행 13페리페리아 '대표 지역' 매핑 (사용자 확정) ──
  // GADM의 구 광역(분권행정구)은 NE의 페리페리아 여러 개를 묶은 것이라 1:1이 성립하지 않는다.
  // 경계가 정확히 같지는 않지만, 각 구 광역을 가장 가까운 페리페리아 하나로 보내 사용자가
  // 칠해둔 색과 태깅이 살아나게 한다. 아래 섬·명소 4건은 MANUAL_ABSORBED로 '흡수'로도 표시한다.
  'GRC|aegean': 'South Aegean',                     // 구 '에게'는 북·남에게 둘을 묶은 것 — 방문 대부분(산토리니·미코노스·로도스)이 남에게해다
  'GRC|epirusandwesternmacedonia': 'Epirus',        // 구 '이피로스·서마케도니아' → 이름 앞머리이자 인구 중심인 이피로스
  'GRC|macedoniaandthrace': 'Centre Macedonia',     // 구 '마케도니아·트라키아' → 테살로니키가 속한 중앙마케도니아
  'GRC|peloponnesewesterngreeceand': 'Peloponnese', // 구 '펠로폰네소스·서그리스·이오니아' → 이름 앞머리인 펠로폰네소스
  'GRC|thessalyandcentralgreece': 'Thessalia',      // 구 '테살리아·중부그리스' → 이름 앞머리인 테살리아
  'GRC|santorini': 'South Aegean',                  // 산토리니(티라)는 남에게해 소속 섬
  'GRC|mykonos': 'South Aegean',                    // 미코노스는 남에게해 소속 섬
  'GRC|zakynthos': 'Ionian Islands',                // 자킨토스는 이오니아 제도 소속 섬 (구 광역 이름과 달리 펠로폰네소스가 아니다)
  'GRC|meteora': 'Thessalia',                       // 메테오라(칼람바카)는 테살리아 내륙
};

/**
 * MANUAL 항목 중 "광역이 아니라 그 안에 흡수된 작은 단위"인 키 — 도시 흡수(city)로 표시한다.
 *
 * 두 가지 효과가 있다.
 * 1) migrateRegionKeyMap의 충돌 규칙: 같은 코드에 상위 광역 값과 이 값이 동시에 오면 상위가 이긴다.
 * 2) regionKeyMigration.verify.ts의 '오합병' 검사가 이 정당한 흡수를 오탐하지 않는다.
 */
const MANUAL_ABSORBED = new Set([
  'GRC|santorini', 'GRC|mykonos', 'GRC|zakynthos', 'GRC|meteora', // 섬·명소 → 소속 페리페리아
  'TUN|ariana',                                                    // 아리아나 주 → NE 마누바 폴리곤
]);

const ne = loadNeFeatures(NE);
assertNoPrimaryNameConflict(ne);

// 검색 인덱스: `${ISO3}|${정규화된_이름}` → 코드
const index: Record<string, string> = {};
const addName = (iso: string, name: string | undefined, code: string) => {
  if (!name) return;
  for (const v of String(name).split('|')) {
    const k = `${iso}|${norm(v)}`;
    if (v.trim() && !index[k]) index[k] = code;
  }
};
// 색인은 반드시 2패스로 돈다(리뷰 Critical 1).
// addName이 first-wins라 한 패스로 돌면 앞선 피처의 *부차* 이름이 뒤 피처의 *1차* 이름을
// 선점한다. 실제 사례: 陝西(Shaanxi)의 name_alt "Shǎnxī"가 정규화되면 "shanxi"가 되어,
// 뒤에 오는 진짜 山西(Shanxi, CN-SX)가 자기 이름을 못 갖고 CN-SN으로 오매칭됐다.
// 1패스에서 모든 피처의 1차 이름(name, name_en)과 코드를 먼저 확정하면
// 어떤 피처의 1차 이름도 다른 피처의 별칭에 빼앗기지 않는다.
const codeCache = new Map<NeProps, string>();
// 1패스 — 1차 이름 + 멱등성용 코드 자기항목
for (const p of ne) {
  const code = codeOf(p);
  codeCache.set(p, code);
  for (const f of ['name', 'name_en'] as const) {
    const v = p[f] as string | undefined;
    // 승자가 선언된 1차 이름은 그 코드로 고정 (NE 피처 순서에 좌우되지 않게)
    if (v) addName(p.adm0_a3, v, primaryNameCode(p.adm0_a3, v, code));
  }
  // 멱등성용 — 코드 자신도 인덱스에 넣는다 (이미 변환된 값을 다시 넣어도 안전)
  addName(p.adm0_a3, code, code);
}
// 2패스 — 부차 이름과 병합 그룹명(빈 자리만 채운다)
for (const p of ne) {
  const code = codeCache.get(p)!;
  for (const f of ['name_local', 'name_alt', 'gn_name', 'woe_name'] as const) {
    addName(p.adm0_a3, p[f] as string | undefined, code);
  }
  // 3단계용 — 병합 그룹명
  const d = DISSOLVE[p.adm0_a3];
  if (d) addName(p.adm0_a3, p[d] as string | undefined, code);
}

/** 구 키 하나를 코드로 해석. cityHop=true면 도시 흡수를 거친 것 */
function resolve(iso: string, oldName: string): { code: string; city: boolean } | null {
  const n = norm(oldName);
  // 4단계 수동 별칭을 먼저 본다 (1~3단계가 오답을 낼 때 덮어쓸 수 있어야 한다)
  const man = MANUAL[`${iso}|${n}`];
  if (man) { const c = index[`${iso}|${norm(man)}`]; if (c) return { code: c, city: MANUAL_ABSORBED.has(`${iso}|${n}`) }; }
  // 1단계 도시 흡수
  const prov = CITY_TO_PROV[iso]?.[n];
  if (prov && norm(prov) !== n) {
    const c = index[`${iso}|${norm(prov)}`];
    if (c) return { code: c, city: true };
  }
  // 2·3단계 이름/그룹명 일치
  const c = index[`${iso}|${n}`];
  return c ? { code: c, city: false } : null;
}

// GADM 백업에서 구 키 전량 수집
const aliases: Record<string, string> = {};
const cityKeys: string[] = [];
const unmatched: string[] = [];
let total = 0;
for (const file of readdirSync(GADM)) {
  const iso = file.replace('.ts', '');
  if (!ISO3.includes(iso)) continue;
  const txt = readFileSync(`${GADM}/${file}`, 'utf8');
  const names = [...txt.matchAll(/"NAME_1":"([^"]*)"/g)].map((m) => m[1]);
  for (const name of names) {
    total++;
    const key = `${iso}|${norm(name)}`;
    if (aliases[key]) continue;
    const r = resolve(iso, name);
    if (!r) { unmatched.push(`${iso}|${name}`); continue; }
    aliases[key] = r.code;
    if (r.city) cityKeys.push(key);
  }
}

// 자체 점검 — 실패하면 생성하지 않는다
const codes = new Set<string>();
for (const iso of ISO3) {
  const list = ne.filter((p) => p.adm0_a3 === iso).map(codeOf);
  const groups = new Set(list);
  for (const c of groups) {
    if (codes.has(c)) throw new Error(`코드 중복: ${c} (${iso})`);
    codes.add(c);
  }
}
for (const [iso, m] of Object.entries(CITY_TO_PROV)) {
  for (const k of Object.keys(m)) {
    if (norm(k) !== k) throw new Error(`CITY_TO_PROV 키가 정규화형이 아님: ${iso}.${k}`);
  }
}

const header = [
  '// 자동 생성 — scripts/build-region-aliases.ts. 직접 수정 금지.',
  '// GADM 구 지역 키 → Natural Earth 코드 별칭 표.',
  `// 구 키 ${total}개 중 ${Object.keys(aliases).length}개 매칭, 미매칭 ${unmatched.length}개.`,
  '//',
  '// 미매칭 목록 (그대로 보존되며 지도에는 뜨지 않는다):',
  ...unmatched.map((u) => `//   ${u}`),
  '',
].join('\n');

writeFileSync(OUT, header +
  `export const REGION_KEY_ALIASES: Record<string, string> = ${JSON.stringify(aliases, null, 1)};\n\n` +
  `export const REGION_CITY_ALIAS_KEYS: string[] = ${JSON.stringify(cityKeys.sort(), null, 1)};\n`);

console.log(`구 키 ${total} → 매칭 ${Object.keys(aliases).length} / 미매칭 ${unmatched.length}`);
console.log(`도시 흡수 ${cityKeys.length}개, 고유 코드 ${codes.size}개`);
if (unmatched.length) console.log('\n미매칭:\n  ' + unmatched.join('\n  '));
