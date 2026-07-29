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

const NE = 'scripts/geo-tmp/ne10m_admin1.geojson';
const GADM = 'C:/Users/2023user/OneDrive/바탕 화면/Important2/gadm-backup-2026-07-28/geo';
const OUT = 'src/data/regionKeyAliases.ts';

const ISO3 = ['ARE','AUT','BRA','CAN','CHN','COL','DEU','EGY','ESP','FRA','GBR','GRC',
              'ITA','JPN','MAR','MEX','MYS','NLD','PRT','SAU','THA','TUN','TUR','USA','VNM','ZAF'];

// 병합 대상국 — NE admin-1이 GADM Level-1보다 한 단계 아래라 상위로 묶는다
const DISSOLVE: Record<string, 'region' | 'geonunit'> = {
  FRA: 'region', ITA: 'region', ESP: 'region', GBR: 'geonunit',
};

// NE 데이터 자체 결함 보정 — 같은 코드가 두 지역에 붙어 있다 (스펙 1절)
const CODE_FIX: Record<string, string> = {
  'COL|Bogota': 'CO-DC',   // 쿤디나마르카와 CO-CUN 중복
  'ESP|Melilla': 'ES-ML',  // 세우타와 ES.CE 중복
};

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
};

/** 정규화: 발음구별기호 제거 + 소문자 + 영숫자만 남김 */
const norm = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** region_cod의 점 표기를 하이픈으로 통일 (ES.CE → ES-CE) */
const dash = (s: string): string => s.replace(/\./g, '-');

interface NeProps {
  adm0_a3: string; name: string; name_en?: string; name_local?: string;
  name_alt?: string; gn_name?: string; woe_name?: string;
  iso_3166_2?: string; region?: string; region_cod?: string;
  geonunit?: string; gu_a3?: string; adm1_code?: string;
}

const ne: NeProps[] = JSON.parse(readFileSync(NE, 'utf8'))
  .features.map((f: any) => f.properties)
  .filter((p: NeProps) => ISO3.includes(p.adm0_a3));

/** 피처 하나의 최종 코드 — 병합 대상국은 그룹 코드를 쓴다 */
function codeOf(p: NeProps): string {
  const fix = CODE_FIX[`${p.adm0_a3}|${p.name}`];
  if (fix) return fix;
  const d = DISSOLVE[p.adm0_a3];
  if (d === 'geonunit') return `GB-${p.gu_a3}`;
  if (d === 'region') return dash(p.region_cod || `${p.adm0_a3}-${norm(p.region || '')}`);
  return dash(p.iso_3166_2 || p.adm1_code || '');
}

// 검색 인덱스: `${ISO3}|${정규화된_이름}` → 코드
const index: Record<string, string> = {};
const addName = (iso: string, name: string | undefined, code: string) => {
  if (!name) return;
  for (const v of String(name).split('|')) {
    const k = `${iso}|${norm(v)}`;
    if (v.trim() && !index[k]) index[k] = code;
  }
};
for (const p of ne) {
  const code = codeOf(p);
  if (!code) throw new Error(`코드 없음: ${p.adm0_a3} ${p.name}`);
  // 2단계용 — 피처 이름들
  for (const f of ['name', 'name_en', 'name_local', 'name_alt', 'gn_name', 'woe_name'] as const) {
    addName(p.adm0_a3, p[f] as string | undefined, code);
  }
  // 3단계용 — 병합 그룹명
  const d = DISSOLVE[p.adm0_a3];
  if (d) addName(p.adm0_a3, p[d] as string | undefined, code);
  // 멱등성용 — 코드 자신도 인덱스에 넣는다 (이미 변환된 값을 다시 넣어도 안전)
  addName(p.adm0_a3, code, code);
}

/** 구 키 하나를 코드로 해석. cityHop=true면 도시 흡수를 거친 것 */
function resolve(iso: string, oldName: string): { code: string; city: boolean } | null {
  const n = norm(oldName);
  // 4단계 수동 별칭을 먼저 본다 (1~3단계가 오답을 낼 때 덮어쓸 수 있어야 한다)
  const man = MANUAL[`${iso}|${n}`];
  if (man) { const c = index[`${iso}|${norm(man)}`]; if (c) return { code: c, city: false }; }
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
