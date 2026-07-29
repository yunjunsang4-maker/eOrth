# 지역 저장 키 별칭 마이그레이션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GADM 표기로 저장된 사용자의 지역 색·태깅·기록 키를 Natural Earth ISO 코드 키로 1회 변환해, 대륙 지도를 NE 데이터로 복원해도 사용자 데이터가 유실되지 않게 한다.

**Architecture:** 빌드타임에 GADM 구 키 → NE 코드 별칭 표를 생성해 `src/data/regionKeyAliases.ts`로 굽는다. 런타임에는 순수 함수 모듈이 이 표로 저장 payload를 재작성하고, `settingsStore`·`recordStore`의 hydrate에서 스키마 버전 가드와 함께 1회만 실행한다.

**Tech Stack:** TypeScript, React Native (Expo), tsx(스크립트 실행), 저장소 자체 `*.verify.ts` 검증 러너(`npm test`)

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-07-29-region-key-alias-migration-design.md`. 충돌 시 스펙이 우선한다.
- 신 저장 키 형식은 `` `${ISO3}|${코드}` ``. 기존 `split('|')` 조회 코드를 바꾸지 않는다.
- 코드 형식은 하이픈으로 통일한다. `region_cod`의 점 표기(`ES.CE`)는 `ES-CE`로 정규화한다.
- 이미 저장된 한글 표기(`regionName`, `taggedRegions[].name`)는 **절대 변경하지 않는다**.
- 매칭 실패 키는 **삭제하지 않고 그대로 남긴다**.
- 마이그레이션은 `featureFlags.REGION_MAP_ENABLED` 값과 무관하게 실행한다.
- 파일 수정 규칙(CLAUDE.md): 이 계획에 명시된 파일만 수정한다.
- 모든 코드 주석과 커밋 메시지는 한글로 쓴다.
- 검증 명령: `npx tsc --noEmit` 과 `npm test` 두 개가 모두 통과해야 한다.

### 후속 작업과의 계약 (이 계획의 범위 밖)

NE 지역 데이터(`src/data/geo/*.ts`)를 생성하는 별도 작업은 **각 피처의 `nameEn` 자리에 이 계획이 만든 코드(`AT-4`, `US-NY`)를 넣어야 한다.** 지도 활성화 키가 `` `${ISO3}|${nameEn}` ``로 조립되므로(`MainScreen.tsx:787`), 여기에 지역 이름이 들어가면 마이그레이션한 키와 어긋나 색이 하나도 안 뜬다.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `scripts/build-region-aliases.ts` (신규) | 별칭 표 생성기. GADM 백업 + NE 원본 + `CITY_TO_PROV`를 읽어 표를 굽고 미매칭을 리포트 |
| `scripts/build-region-aliases.md` (신규) | 위 스크립트의 실행 절차 문서 |
| `src/data/regionKeyAliases.ts` (신규·자동 생성) | 별칭 표와 도시 유래 키 목록 |
| `src/constants/homeRegions.ts` (수정) | `CITY_TO_PROV`·`ISO2_TO_GEO`를 export (생성기와 recordStore가 재사용) |
| `src/utils/regionKeyMigration.ts` (신규) | 순수 변환 로직. 스토어 의존 없음 |
| `src/utils/regionKeyMigration.verify.ts` (신규) | 변환 로직 검증 (`npm test`가 자동 수집) |
| `src/store/settingsStore.tsx` (수정) | hydrate 배선, 스키마 버전, 원본 스냅샷, 백업 복원 경로 |
| `src/store/recordStore.tsx` (수정) | hydrate 배선, 스키마 버전 |

---

## Task 1: 별칭 표 생성기와 산출물

**Files:**
- Create: `scripts/build-region-aliases.ts`
- Create: `scripts/build-region-aliases.md`
- Create: `src/data/regionKeyAliases.ts` (스크립트가 생성)
- Modify: `src/constants/homeRegions.ts:29` (`CITY_TO_PROV`에 `export` 추가)

**Interfaces:**
- Consumes: `CITY_TO_PROV` from `src/constants/homeRegions.ts`
- Produces:
  - `REGION_KEY_ALIASES: Record<string, string>` — 키 `` `${ISO3}|${정규화된_구키}` ``, 값 신 코드(`'AT-4'`)
  - `REGION_CITY_ALIAS_KEYS: string[]` — 위 표의 키 중 도시 흡수로 만들어진 것
  - 두 상수 모두 `src/data/regionKeyAliases.ts`에서 export

**사전 준비 (자동화하지 않음):**

GADM 백업은 저장소 **바깥**에 있다. 생성기는 빌드타임에만 이 경로를 읽는다.
```
C:/Users/2023user/OneDrive/바탕 화면/Important2/gadm-backup-2026-07-28/geo/*.ts
```

- [ ] **Step 1: NE 원본 내려받기**

```bash
mkdir -p scripts/geo-tmp
curl.exe -sL -o scripts/geo-tmp/ne10m_admin1.geojson \
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson"
```
약 40.7MB. `scripts/geo-tmp/`는 재생성 가능한 스크래치라 커밋하지 않는다(`.gitignore` 확인).

- [ ] **Step 2: `CITY_TO_PROV`와 `ISO2_TO_GEO`를 export로 바꾸기**

`src/constants/homeRegions.ts`에서 두 상수 선언에 `export`만 붙인다. 값은 건드리지 않는다.

```ts
// 변경 전
const ISO2_TO_GEO: Record<string, string> = {
const CITY_TO_PROV: Record<string, Record<string, string>> = {

// 변경 후 — 별칭 표 생성기와 recordStore(Task 4)가 재사용한다
export const ISO2_TO_GEO: Record<string, string> = {
export const CITY_TO_PROV: Record<string, Record<string, string>> = {
```

- [ ] **Step 3: 생성기 작성**

`scripts/build-region-aliases.ts`
```ts
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
```

- [ ] **Step 4: 생성기 실행**

```bash
node node_modules/tsx/dist/cli.mjs scripts/build-region-aliases.ts
```
기대: `고유 코드 706개`가 출력되고 `코드 중복` 예외가 나지 않는다.

- [ ] **Step 5: 미매칭 목록을 보고 `MANUAL` 표 채우기**

출력된 미매칭 목록에서 **실제 행정구역**만 골라 생성기의 `MANUAL`에 추가한다. 도시·명소는 이미 1단계에서 처리되므로 여기 나오면 `CITY_TO_PROV`에 빠진 항목이다(예: 아랍에미리트는 `CITY_TO_PROV`에 아예 없어서 `Dubai`가 미매칭으로 나온다).

판단 기준: NE 데이터에서 같은 지역을 다른 이름으로 부르는 것이면 `MANUAL`에 넣고, NE에 아예 없는 도시·명소면 그대로 둔다.

Step 4를 다시 실행해 미매칭이 줄어드는 것을 확인한다. **0을 강제하지 않는다** — 남은 것은 보존 정책으로 넘어간다.

- [ ] **Step 6: 절차 문서 작성**

`scripts/build-region-aliases.md`
````markdown
# src/data/regionKeyAliases.ts 재생성 파이프라인

GADM 구 지역 키 → Natural Earth 코드 별칭 표. 대륙 지도 복원 시 사용자 데이터 마이그레이션용.

```bash
# 1) NE 10m admin-1 원본 (약 40.7MB)
mkdir -p scripts/geo-tmp
curl.exe -sL -o scripts/geo-tmp/ne10m_admin1.geojson \
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson"

# 2) 생성
node node_modules/tsx/dist/cli.mjs scripts/build-region-aliases.ts
```

- GADM 백업(`Important2/gadm-backup-2026-07-28/geo`)은 저장소 **밖**에 있다. 빌드타임에만 읽는다.
- 미매칭이 출력되면 실제 행정구역인 것만 스크립트의 `MANUAL` 표에 넣고 다시 돌린다.
  NE에 없는 도시·명소는 그대로 둔다(보존 정책).
- `scripts/geo-tmp/`는 커밋하지 않는다.
- 설계 배경: `docs/superpowers/specs/2026-07-29-region-key-alias-migration-design.md`
````

- [ ] **Step 7: 타입 체크**

```bash
npx tsc --noEmit
```
기대: 오류 없음.

- [ ] **Step 8: 커밋**

```bash
git add scripts/build-region-aliases.ts scripts/build-region-aliases.md \
        src/data/regionKeyAliases.ts src/constants/homeRegions.ts
git commit -m "feat(region): GADM→NE 지역 키 별칭 표 생성기와 산출물"
```

---

## Task 2: 순수 변환 모듈

**Files:**
- Create: `src/utils/regionKeyMigration.ts`
- Create: `src/utils/regionKeyMigration.verify.ts`

**Interfaces:**
- Consumes: `REGION_KEY_ALIASES`, `REGION_CITY_ALIAS_KEYS` (Task 1)
- Produces:
  - `REGION_KEY_SCHEMA = 1`
  - `normRegion(s: string): string`
  - `resolveRegionCode(iso3: string, oldName: string): string | null`
  - `migrateRegionKeyMap<V>(map: Record<string, V>): Record<string, V>`
  - `migrateTaggedRegions<T extends { nameEn: string }>(m: Record<string, T[]>): Record<string, T[]>`
  - `migrateRegionNameEn(iso3: string, nameEn: string): string`
  - `migrateSkinColorStore<S extends { regionColors?: Record<string, string> }>(store: Record<string, S>): Record<string, S>`

- [ ] **Step 1: 실패하는 검증 작성**

`src/utils/regionKeyMigration.verify.ts`
```ts
// src/utils/regionKeyMigration.verify.ts
import {
  REGION_KEY_SCHEMA, normRegion, resolveRegionCode,
  migrateRegionKeyMap, migrateTaggedRegions, migrateRegionNameEn, migrateSkinColorStore,
} from './regionKeyMigration';
import { REGION_KEY_ALIASES, REGION_CITY_ALIAS_KEYS } from '../data/regionKeyAliases';

/** Task 1 생성기가 출력한 매칭 수. 회귀 감지용 고정값이라 표를 다시 구우면 함께 고친다. */
const EXPECTED_ALIAS_COUNT = 0; // ← Task 2 Step 5에서 실제 값으로 교체

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// 1. 정규화
eq(normRegion('Oberösterreich'), 'oberosterreich', '정규화: 발음구별기호·소문자');
eq(normRegion("Provence-Alpes-Côte d'Azur"), 'provencealpescotedazur', '정규화: 기호 제거');

// 2. 대표 키 해석
eq(resolveRegionCode('USA', 'NewYork'), 'US-NY', '해석: 미국 뉴욕주');
eq(resolveRegionCode('AUT', 'Oberösterreich'), 'AT-4', '해석: 오스트리아 오버외스터라이히');
eq(resolveRegionCode('AUT', 'Hallstatt'), 'AT-4', '해석: 도시 흡수(할슈타트→오버외스터라이히)');
eq(resolveRegionCode('ZZZ', 'Nowhere'), null, '해석: 미등록 국가는 null');

// 3. 멱등성 — 이미 변환된 코드를 다시 넣어도 그대로
eq(resolveRegionCode('USA', 'US-NY'), 'US-NY', '멱등: 코드 재입력');

// 4. 신 키 유일성 — 한 코드가 두 국가에 걸치면 안 된다.
//    (서로 다른 구 키가 같은 신 키를 가리키는 것은 도시 흡수로 정상이다)
{
  const isoByCode = new Map<string, string>();
  const cross: string[] = [];
  for (const [k, code] of Object.entries(REGION_KEY_ALIASES)) {
    const iso = k.slice(0, k.indexOf('|'));
    const prev = isoByCode.get(code);
    if (prev && prev !== iso) cross.push(`${code}: ${prev} vs ${iso}`);
    else if (!prev) isoByCode.set(code, iso);
  }
  eq(cross, [], '유일성: 한 코드가 두 국가에 걸치지 않음');
}

// 5. 충돌 규칙 — 도시와 상위 주가 같은 신 키로 접히면 주 값이 이긴다
eq(migrateRegionKeyMap({ 'AUT|Oberösterreich': '#AAA', 'AUT|Hallstatt': '#BBB' }),
   { 'AUT|AT-4': '#AAA' }, '충돌: 상위 주 값 우선');
eq(migrateRegionKeyMap({ 'AUT|Hallstatt': '#BBB', 'AUT|Oberösterreich': '#AAA' }),
   { 'AUT|AT-4': '#AAA' }, '충돌: 입력 순서와 무관');
eq(migrateRegionKeyMap({ 'AUT|Hallstatt': '#BBB' }),
   { 'AUT|AT-4': '#BBB' }, '충돌: 주 값이 없으면 도시 값 채택');

// 6. 미매칭 보존
eq(migrateRegionKeyMap({ 'AUT|알수없는지역': '#CCC' }),
   { 'AUT|알수없는지역': '#CCC' }, '보존: 미매칭 키는 그대로');
eq(migrateRegionKeyMap({ 'malformed': '#DDD' }),
   { 'malformed': '#DDD' }, '보존: 형식이 다른 키는 그대로');

// 7. 맵 멱등성
{
  const once = migrateRegionKeyMap({ 'USA|NewYork': '#111' });
  eq(migrateRegionKeyMap(once), once, '멱등: 두 번 변환해도 동일');
}

// 8. taggedRegions — nameEn만 바뀌고 한글명은 불변, 중복 제거
eq(migrateTaggedRegions({
     AUT: [{ name: '오버외스터라이히', nameEn: 'Oberösterreich' },
           { name: '할슈타트', nameEn: 'Hallstatt' }],
   }),
   { AUT: [{ name: '오버외스터라이히', nameEn: 'AT-4' }] },
   '태깅: 한글명 유지 + 중복 제거');

// 9. 기록의 regionNameEn
eq(migrateRegionNameEn('USA', 'NewYork'), 'US-NY', '기록: 코드로 변환');
eq(migrateRegionNameEn('USA', '알수없음'), '알수없음', '기록: 미매칭은 원본 유지');

// 10. 스키마 버전
eq(REGION_KEY_SCHEMA, 1, '스키마 버전 = 1');

// 11. 도시 유래 키 목록이 별칭 표의 부분집합인지
{
  const bad = REGION_CITY_ALIAS_KEYS.filter((k) => !(k in REGION_KEY_ALIASES));
  eq(bad, [], '도시 키 목록이 별칭 표에 모두 존재');
}

// 12. 중첩 순회 — 스킨별 지역 색까지 변환되는지
eq(migrateSkinColorStore({
     aurora: { globeColor: '#000', countryColors: {}, regionColors: { 'USA|NewYork': '#111' } },
   }),
   { aurora: { globeColor: '#000', countryColors: {}, regionColors: { 'USA|US-NY': '#111' } } },
   '중첩: 스킨별 지역 색도 변환');

// 13. 전수 변환율 — Task 1 생성 결과를 고정값으로 박아 회귀를 잡는다.
//     아래 값은 Task 2 Step 5에서 생성기 출력을 보고 채운다.
eq(Object.keys(REGION_KEY_ALIASES).length, EXPECTED_ALIAS_COUNT, '전수: 별칭 수 고정');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
```

- [ ] **Step 2: 검증을 돌려 실패를 확인**

```bash
node node_modules/tsx/dist/cli.mjs src/utils/regionKeyMigration.verify.ts
```
기대: FAIL — `Cannot find module './regionKeyMigration'`

- [ ] **Step 3: 변환 모듈 구현**

`src/utils/regionKeyMigration.ts`
```ts
/**
 * GADM → Natural Earth 지역 저장 키 마이그레이션 (순수 함수)
 *
 * 저장 키가 GADM 표기(`USA|NewYork`)에서 ISO 코드(`USA|US-NY`)로 바뀐다.
 * 스토어에 의존하지 않으므로 regionKeyMigration.verify.ts로 단독 검증할 수 있다.
 *
 * 설계: docs/superpowers/specs/2026-07-29-region-key-alias-migration-design.md
 */
import { REGION_KEY_ALIASES, REGION_CITY_ALIAS_KEYS } from '../data/regionKeyAliases';

/** 영속 payload의 지역 키 스키마 버전. 이 값보다 낮으면 hydrate에서 1회 변환한다. */
export const REGION_KEY_SCHEMA = 1;

const CITY_KEYS = new Set(REGION_CITY_ALIAS_KEYS);

/** 정규화: 발음구별기호 제거 + 소문자 + 영숫자만 (생성기와 동일 규칙) */
export const normRegion = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** 구 지역명(또는 이미 변환된 코드)을 신 코드로. 못 찾으면 null */
export function resolveRegionCode(iso3: string, oldName: string): string | null {
  return REGION_KEY_ALIASES[`${iso3}|${normRegion(oldName)}`] ?? null;
}

/** 이 구 키가 도시 흡수로 만들어졌는지 — 충돌 시 상위 주에 양보한다 */
const isCitySourced = (iso3: string, oldName: string): boolean =>
  CITY_KEYS.has(`${iso3}|${normRegion(oldName)}`);

/**
 * `${ISO3}|${구지역명}` 키 맵을 `${ISO3}|${코드}`로 재작성.
 * - 미매칭 키와 형식이 다른 키는 그대로 남긴다(삭제하지 않는다)
 * - 도시와 상위 주가 같은 코드로 접히면 상위 주 값이 이긴다(입력 순서 무관)
 */
export function migrateRegionKeyMap<V>(map: Record<string, V>): Record<string, V> {
  const next: Record<string, V> = {};
  const fromCity = new Set<string>();

  for (const [key, value] of Object.entries(map)) {
    const sep = key.indexOf('|');
    if (sep < 0) { next[key] = value; continue; }
    const iso3 = key.slice(0, sep);
    const oldName = key.slice(sep + 1);
    const code = resolveRegionCode(iso3, oldName);
    if (!code) { next[key] = value; continue; }

    const newKey = `${iso3}|${code}`;
    const city = isCitySourced(iso3, oldName);
    // 이미 상위 주 값이 들어와 있으면 도시 값은 버린다
    if (newKey in next && city) continue;
    // 도시 값이 먼저 들어와 있었다면 상위 주 값으로 덮는다
    if (newKey in next && !city && !fromCity.has(newKey)) continue;
    next[newKey] = value;
    if (city) fromCity.add(newKey); else fromCity.delete(newKey);
  }
  return next;
}

/** taggedRegions의 nameEn을 코드로. 한글명(name)은 건드리지 않고 코드 기준 중복 제거 */
export function migrateTaggedRegions<T extends { nameEn: string }>(
  m: Record<string, T[]>,
): Record<string, T[]> {
  const next: Record<string, T[]> = {};
  for (const [iso3, list] of Object.entries(m)) {
    if (!Array.isArray(list)) { next[iso3] = list; continue; }
    const seen = new Set<string>();
    const fromCity = new Set<string>();
    const out: T[] = [];
    for (const item of list) {
      if (!item || typeof item.nameEn !== 'string') continue;
      const code = resolveRegionCode(iso3, item.nameEn);
      if (!code) { out.push(item); continue; }
      const city = isCitySourced(iso3, item.nameEn);
      if (seen.has(code)) {
        // 이미 도시 유래로 들어간 자리는 상위 주 항목으로 교체한다
        if (city || !fromCity.has(code)) continue;
        const at = out.findIndex((x) => x.nameEn === code);
        if (at >= 0) out[at] = { ...item, nameEn: code };
        fromCity.delete(code);
        continue;
      }
      seen.add(code);
      if (city) fromCity.add(code);
      out.push({ ...item, nameEn: code });
    }
    next[iso3] = out;
  }
  return next;
}

/** 기록의 regionNameEn을 코드로. 미매칭이면 원본을 그대로 돌려준다 */
export function migrateRegionNameEn(iso3: string, nameEn: string): string {
  return resolveRegionCode(iso3, nameEn) ?? nameEn;
}

/**
 * 스킨별로 중첩된 지역 색까지 변환.
 * 이 함수를 빠뜨리면 스킨을 바꿔 쓰던 사용자만 색이 사라진다.
 */
export function migrateSkinColorStore<S extends { regionColors?: Record<string, string> }>(
  store: Record<string, S>,
): Record<string, S> {
  return Object.fromEntries(
    Object.entries(store).map(([skin, set]) => [
      skin, { ...set, regionColors: migrateRegionKeyMap(set?.regionColors ?? {}) },
    ]),
  ) as Record<string, S>;
}
```

- [ ] **Step 4: 검증을 돌려 통과 확인**

```bash
node node_modules/tsx/dist/cli.mjs src/utils/regionKeyMigration.verify.ts
```
기대: `✅ 모든 검증 통과`

실패하면 **구현이 아니라 기대값을 먼저 의심하지 말 것.** Task 1의 별칭 표가 `AUT|hallstatt → AT-4`를 담고 있는지 `src/data/regionKeyAliases.ts`에서 직접 확인한다.

- [ ] **Step 5: `EXPECTED_ALIAS_COUNT` 채우기**

검증 13번은 지금 실패한다(고정값이 `0`). Task 1 Step 4의 생성기 출력에서 매칭 수를 읽어 적는다.

```
구 키 839 → 매칭 812 / 미매칭 27      ← 이 "812"를 쓴다
```

`src/utils/regionKeyMigration.verify.ts`의 `EXPECTED_ALIAS_COUNT`를 그 값으로 바꾸고 다시 돌린다.

```bash
node node_modules/tsx/dist/cli.mjs src/utils/regionKeyMigration.verify.ts
```
기대: 13개 검증 전부 통과.

이 고정값은 회귀 감지용이다. 나중에 별칭 표를 다시 구우면 이 값도 같이 고쳐야 한다.

- [ ] **Step 6: 전체 검증과 타입 체크**

```bash
npm test
npx tsc --noEmit
```
기대: 둘 다 통과. `npm test`는 기존 verify 파일들도 함께 돌린다.

- [ ] **Step 7: 커밋**

```bash
git add src/utils/regionKeyMigration.ts src/utils/regionKeyMigration.verify.ts
git commit -m "feat(region): 지역 저장 키 마이그레이션 순수 로직 + 검증"
```

---

## Task 3: settingsStore 배선

**Files:**
- Modify: `src/store/settingsStore.tsx` (payload 타입, hydrate, 저장 payload 2곳, `importSettingsBackup`)

**Interfaces:**
- Consumes: `REGION_KEY_SCHEMA`, `migrateRegionKeyMap`, `migrateTaggedRegions`, `migrateSkinColorStore` (Task 2)
- Produces: 영속 payload에 `regionKeySchema?: number`, `regionKeyBackupV0?: unknown`

- [ ] **Step 1: import 추가**

`src/store/settingsStore.tsx` 상단 import 블록 끝에 추가한다.
```ts
import {
  REGION_KEY_SCHEMA, migrateRegionKeyMap, migrateTaggedRegions, migrateSkinColorStore,
} from '../utils/regionKeyMigration';
```

- [ ] **Step 2: 영속 payload 타입에 두 필드 추가**

`SettingsPersistPayload` 인터페이스에서 `skinColorStore?: ...` 줄 **아래**에 추가한다.
```ts
  // 지역 저장 키 스키마 (GADM 표기 → NE 코드). 없거나 낮으면 hydrate에서 1회 변환한다.
  regionKeySchema?: number;
  // 변환 직전 원본 스냅샷 — 사고 시 복구용. 몇 버전 뒤 제거한다.
  regionKeyBackupV0?: unknown;
```

- [ ] **Step 3: 상태 두 개 추가**

`const [skinColorStore, setSkinColorStore] = useState<Record<string, SkinColorSet>>({});` 바로 **아래**에 추가한다.
```ts
  const [regionKeySchema, setRegionKeySchema] = useState(0);
  const [regionKeyBackupV0, setRegionKeyBackupV0] = useState<unknown>(null);
```

- [ ] **Step 4: hydrate에 변환 삽입**

hydrate 콜백에서 `setRegionDisplayModes(p.regionDisplayModes ?? {});` 부터
`setSkinColorStore(p.skinColorStore ?? {});` 까지 **네 줄을 아래 블록으로 교체**한다.

```ts
      // 지역 저장 키 마이그레이션 (GADM 표기 → NE 코드) — 스키마가 낮을 때 1회만.
      // 실패하면 원본을 그대로 두고 버전도 올리지 않는다(다음 실행에서 재시도).
      // 부분 적용 상태로 굳어 디바운스 저장이 원본을 덮는 것을 막는다.
      const needMigrate = (p.regionKeySchema ?? 0) < REGION_KEY_SCHEMA;
      let rDisplay = p.regionDisplayModes ?? {};
      let rColors = p.regionColors ?? {};
      let rTagged = p.taggedRegions ?? {};
      let rSkins = p.skinColorStore ?? {};
      if (needMigrate) {
        try {
          setRegionKeyBackupV0({
            regionDisplayModes: rDisplay, regionColors: rColors,
            taggedRegions: rTagged, skinColorStore: rSkins,
          });
          rDisplay = migrateRegionKeyMap(rDisplay);
          rColors = migrateRegionKeyMap(rColors);
          rTagged = migrateTaggedRegions(rTagged);
          rSkins = migrateSkinColorStore(rSkins); // 스킨별 중첩 지역 색
          setRegionKeySchema(REGION_KEY_SCHEMA);
        } catch (e) {
          console.warn('[regionKey] 마이그레이션 실패 — 원본 유지', e);
          rDisplay = p.regionDisplayModes ?? {};
          rColors = p.regionColors ?? {};
          rTagged = p.taggedRegions ?? {};
          rSkins = p.skinColorStore ?? {};
          setRegionKeyBackupV0(p.regionKeyBackupV0 ?? null);
        }
      } else {
        setRegionKeySchema(p.regionKeySchema ?? 0);
        setRegionKeyBackupV0(p.regionKeyBackupV0 ?? null);
      }
      setRegionDisplayModes(rDisplay);
      setRegionColors(rColors);
      setTaggedRegions(rTagged);
      setSkinColorStore(rSkins);
```

주의: 원래 `setTaggedRegions(p.taggedRegions ?? {});`와 `setDismissedRegionTagChips(...)` 사이에 있던 다른 줄은 그대로 둔다. `dismissedRegionTagChips`는 ISO3만 담아 변환 대상이 아니다.

- [ ] **Step 5: 저장 payload 두 곳에 필드 추가**

`skinColorStore,` 가 나오는 곳이 두 군데다(디바운스 deps 배열과 payload 빌더). **둘 다** 바로 아래에 추가한다.
```ts
      regionKeySchema,
      regionKeyBackupV0,
```
한 곳만 넣으면 저장은 되는데 변경이 감지되지 않거나 그 반대가 된다.

- [ ] **Step 6: 백업 복원 경로에 같은 변환 적용**

`importSettingsBackup` 안에서 아래 두 줄을 찾아 교체한다.
```ts
// 변경 전
    if (v.regionColors && typeof v.regionColors === 'object') setRegionColors(v.regionColors);
    if (v.taggedRegions && typeof v.taggedRegions === 'object') setTaggedRegions(v.taggedRegions);

// 변경 후 — 옛 백업 JSON에는 GADM 키가 들어 있다.
// 여기를 빠뜨리면 백업을 복원한 사용자만 조용히 깨진다.
    if (v.regionColors && typeof v.regionColors === 'object') setRegionColors(migrateRegionKeyMap(v.regionColors as Record<string, string>));
    if (v.taggedRegions && typeof v.taggedRegions === 'object') setTaggedRegions(migrateTaggedRegions(v.taggedRegions as Record<string, TaggedRegion[]>));
```

같은 함수 안의 `regionDisplayModes`와 `skinColorStore` 복원 줄도 같은 방식으로 감싼다.
```ts
    if (v.regionDisplayModes && typeof v.regionDisplayModes === 'object') setRegionDisplayModes(migrateRegionKeyMap(v.regionDisplayModes as Record<string, 'color' | 'photo'>));
    if (v.skinColorStore && typeof v.skinColorStore === 'object') setSkinColorStore(migrateSkinColorStore(v.skinColorStore as Record<string, SkinColorSet>));
```

- [ ] **Step 7: 타입 체크와 검증**

```bash
npx tsc --noEmit
npm test
```
기대: 둘 다 통과.

- [ ] **Step 8: 커밋**

```bash
git add src/store/settingsStore.tsx
git commit -m "feat(region): settingsStore 지역 키 마이그레이션 배선 + 원본 스냅샷"
```

---

## Task 4: recordStore 배선

**Files:**
- Modify: `src/store/recordStore.tsx` (payload 타입, hydrate)

**Interfaces:**
- Consumes: `REGION_KEY_SCHEMA`, `migrateRegionNameEn` (Task 2), `ISO2_TO_GEO` (Task 1), `COUNTRIES`(기존 import)
- Produces: 영속 payload에 `regionKeySchema?: number`

- [ ] **Step 1: import 추가와 ISO3 헬퍼**

`src/store/recordStore.tsx` 상단 import 블록 끝에 추가한다. `COUNTRIES`는 이미 import돼 있다.
```ts
import { REGION_KEY_SCHEMA, migrateRegionNameEn } from '../utils/regionKeyMigration';
import { ISO2_TO_GEO } from '../constants/homeRegions'; // Task 1에서 export로 바꿔둔 것
```

기록에는 ISO3가 없고 한글 국가명(`countryName`)만 있다. `COUNTRIES[i].term`의 **첫 토큰이 ISO2**이므로(198개 전부 확인됨) 이를 거쳐 ISO3를 얻는다. import 블록 아래에 헬퍼를 둔다.

```ts
/** 한글 국가명 → ISO3 (지역 키 마이그레이션용). term 첫 토큰이 ISO2다: 'jp 일본 japan' */
const KO_TO_ISO3: Record<string, string> = Object.fromEntries(
  COUNTRIES.map((c) => {
    const iso2 = String(c.term).split(/\s+/)[0].toUpperCase();
    return [c.name, ISO2_TO_GEO[iso2] ?? ''];
  }).filter(([, iso3]) => iso3),
);
```

대륙 지도 대상 26개국이 전부 이 표에 들어오는 것을 확인했다. 그 외 국가는 표에 없고, 아래 변환에서 그대로 통과한다(보존 정책).

- [ ] **Step 2: 영속 payload 타입에 필드 추가**

`RecordPersistPayload` 인터페이스에 추가한다.
```ts
  // 지역 저장 키 스키마 (GADM 표기 → NE 코드). settingsStore와 독립적으로 관리한다.
  regionKeySchema?: number;
```

- [ ] **Step 3: 상태 추가**

records 상태 선언 근처에 추가한다.
```ts
  const [regionKeySchema, setRegionKeySchema] = useState(0);
```

- [ ] **Step 4: hydrate에서 records 변환**

hydrate 콜백의 `setRecords(...)` 블록에서, 각 레코드를 만드는 `.map((r) => {...})` 안의 **반환 객체에** 아래 필드를 더한다. 기존 필드는 그대로 둔다.

```ts
            // 지역 키 마이그레이션 — regionName(한글)은 건드리지 않는다.
            // 이 값은 서버로 동기화되지 않는 로컬 전용 필드다.
            // 26개국 밖이거나 미매칭이면 원본이 그대로 유지된다(보존 정책).
            regionNameEn: (needRegionMigrate && r.regionNameEn && KO_TO_ISO3[r.countryName])
              ? migrateRegionNameEn(KO_TO_ISO3[r.countryName], r.regionNameEn)
              : r.regionNameEn,
```

`.map` 바로 위에 플래그를 선언한다.
```ts
      const needRegionMigrate = (p.regionKeySchema ?? 0) < REGION_KEY_SCHEMA;
```

`setRecords(...)` 호출 **다음 줄**에 버전 갱신을 넣는다.
```ts
      setRegionKeySchema(REGION_KEY_SCHEMA);
```

- [ ] **Step 5: 저장 payload에 필드 추가**

`RecordPersistPayload`를 만드는 곳과 디바운스 deps **양쪽**에 `regionKeySchema,`를 추가한다.

- [ ] **Step 6: 타입 체크와 검증**

```bash
npx tsc --noEmit
npm test
```
기대: 둘 다 통과.

- [ ] **Step 7: 커밋**

```bash
git add src/store/recordStore.tsx
git commit -m "feat(region): recordStore 지역 키 마이그레이션 배선"
```

---

## 완료 후 수동 확인 (자동화 불가)

구현이 끝나도 아래 두 가지는 사람이 실기기에서 확인해야 한다. 이걸 하기 전에는 "완료"라고 보고하지 않는다.

- [ ] 기존 사용자 데이터가 있는 기기에서 앱 실행 → 대륙 지도 진입 → 색·태깅이 그대로인지
- [ ] 설정에서 백업 export → 앱 재설치 → import → 지역 색이 복원되는지

## 남은 작업 (이 계획의 범위 밖)

- `src/data/geo/*.ts` 26개국 NE 데이터 생성(단순화 25%)과 `countryGeo.ts`의 `LOADERS` 복원
- `featureFlags.REGION_MAP_ENABLED = true`로 전환
- 위 데이터의 `nameEn` 자리에 **코드**를 넣을 것 (Global Constraints의 계약 참고)
