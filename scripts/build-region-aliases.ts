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
  'ARE|fujairah': 'Fujayrah', // NE 결함 피처(AE-X01~, 아래 ne 필터에서 제외) 대신 진짜 푸자이라(AE-FU)로
  'ARE|dubai': 'Dubay',       // 두바이는 도시가 아니라 에미리트(admin-1) — NE name "Dubay"(AE-DU)
  'USA|washingtondc': 'District of Columbia', // CITY_TO_PROV의 메릴랜드 흡수보다 우선 — NE에 US-DC가 있다
};

/** 정규화: 발음구별기호 제거 + 소문자 + 영숫자만 남김 */
const norm = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// region_cod의 점 표기를 하이픈으로 통일 (ES.CE → ES-CE) + NE 원본의 공백류 오염 제거
// (Île-de-France 피처들의 region_cod가 "FR-IDF\t"처럼 탭이 섞여 들어옴 — 리뷰에서 발견)
const dash = (s: string): string => s.replace(/\./g, '-').replace(/\s+/g, '');

/** 최종 코드 형식 검증: `${ISO2}-${영숫자}` 꼴이 아니면 코드 자체가 오염된 것으로 본다 */
const CODE_RE = /^[A-Z]{2}-[A-Za-z0-9]+$/;

interface NeProps {
  adm0_a3: string; name: string; name_en?: string; name_local?: string;
  name_alt?: string; gn_name?: string; woe_name?: string;
  iso_3166_2?: string; region?: string; region_cod?: string;
  geonunit?: string; gu_a3?: string; adm1_code?: string;
}

const ne: NeProps[] = JSON.parse(readFileSync(NE, 'utf8'))
  .features.map((f: any) => f.properties)
  .filter((p: NeProps) => ISO3.includes(p.adm0_a3))
  // NE 자체 결함 피처 제외 — iso_3166_2가 '~'로 끝나는 것은 NE가 붙인 비공식/미분류 코드로
  // 실제 행정구역이 아니다(중립지대·남중국해 섬·미분류 잔재 폴리곤 등, 총 5건: ARE 2·CHN 1·
  // COL 1·MEX 1). 그중 UAE "Neutral Zone"(AE-X01~)은 name_en이 "Fujairah"라서 그대로 두면
  // 진짜 푸자이라 에미리트 이름과 충돌해 엉뚱한 코드로 별칭된다(리뷰 Critical 1) — 인덱싱
  // 이전에 걸러낸다.
  .filter((p: NeProps) => !(p.iso_3166_2 || '').endsWith('~'));

/** 피처 하나의 최종 코드 — 병합 대상국은 그룹 코드를 쓴다 */
function codeOf(p: NeProps): string {
  const fix = CODE_FIX[`${p.adm0_a3}|${p.name}`];
  let code: string;
  if (fix) {
    code = fix;
  } else {
    const d = DISSOLVE[p.adm0_a3];
    if (d === 'geonunit') code = `GB-${p.gu_a3}`;
    else if (d === 'region') code = dash(p.region_cod || `${p.adm0_a3}-${norm(p.region || '')}`);
    else code = dash(p.iso_3166_2 || p.adm1_code || '');
  }
  // 자체 점검 — NE 원본 결함(공백 오염, 비표준 코드 등)이 최종 코드까지 새는 것을 생성 시점에 막는다
  if (!CODE_RE.test(code)) throw new Error(`코드 형식 이상: "${code}" (${p.adm0_a3} ${p.name})`);
  return code;
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
  if (!code) throw new Error(`코드 없음: ${p.adm0_a3} ${p.name}`);
  codeCache.set(p, code);
  for (const f of ['name', 'name_en'] as const) {
    addName(p.adm0_a3, p[f] as string | undefined, code);
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
