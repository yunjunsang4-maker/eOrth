# 대륙 지도 복원 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Natural Earth 지역 데이터를 생성해 배선하고 `REGION_MAP_ENABLED`를 켜서, 대륙 지도와 지구본/대륙 토글을 되살린다.

**Architecture:** 코드 산출 규칙을 `scripts/lib/neRegionCode.ts`로 추출해 별칭 표 생성기와 새 지오 생성기가 공유한다. 지오 데이터는 매칭 키(`CODE`)와 표시명(`NAME_1`·`NL_NAME_1`)을 분리해 담고, 소비자 코드는 매칭 지점만 `CODE`로 바꾼다. 플래그 전환은 마지막 커밋으로 분리한다.

**Tech Stack:** TypeScript, React Native (Expo), mapshaper(단순화), tsx(스크립트 실행), 저장소 자체 `*.verify.ts` 검증 러너(`npm test`)

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-07-29-region-map-restore-design.md`. 충돌 시 스펙이 우선한다.
- 매칭 키는 `CODE`, 표시명은 `NAME_1`(영문)·`NL_NAME_1`(한글). **`NAME_1`에 코드를 넣지 않는다** — 이전 계획서의 계약은 폐기됐다.
- 저장 키 형식은 `` `${ISO3}|${CODE}` ``. 선행 마이그레이션이 이미 사용자 데이터를 이 형식으로 바꿔놨다.
- 코드 산출 규칙은 `scripts/lib/neRegionCode.ts` **한 곳에만** 존재한다. 어느 스크립트에도 복제하지 않는다.
- 모든 코드 주석과 커밋 메시지는 한글로 쓴다.
- 검증 명령: `npx tsc --noEmit` 과 `npm test` 두 개가 모두 통과해야 한다.
- 스크립트 실행은 `node node_modules/tsx/dist/cli.mjs <file>` (전역 tsx 없음). 셸은 Windows Git Bash.
- `scripts/geo-tmp/`는 커밋하지 않는다(이미 gitignore됨). NE 원본이 이미 받아져 있다: `scripts/geo-tmp/ne10m_admin1.geojson`.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `scripts/lib/neRegionCode.ts` (신규) | NE 피처 로딩·코드 산출·정규화·충돌 assert. 두 생성기의 단일 진실 원천 |
| `scripts/build-region-aliases.ts` (수정) | 공유 모듈을 쓰도록 리팩터. `MANUAL` 별칭표는 여기 유지 |
| `scripts/build-region-geo.ts` (신규) | 26개국 지오 파일 생성기 |
| `scripts/build-region-geo.md` (신규) | 위 스크립트 실행 절차 |
| `src/data/geo/{ISO3}.ts` × 26 (신규·자동 생성) | 국가별 지역 FeatureCollection |
| `src/data/countryGeo.ts` (수정) | `LOADERS` 26줄 복원 |
| `src/constants/regionCountries.ts` (신규) | `REGION_COUNTRIES` 추출 — 검증이 import할 수 있어야 한다 |
| `src/data/regionGeoSync.verify.ts` (신규) | 별칭↔지오 교차 검증 + 목록 3중 동기화 |
| `scripts/check-webview-syntax.mjs` (신규) | 템플릿 리터럴 안 JS의 문법 검사 |
| `src/components/CountryMapView.tsx` (수정) | 매칭 지점 `CODE`로, 인기명소 경로 제거, 인셋 축소 |
| `src/constants/homeRegions.ts` (수정) | `HomeRegion.latin` 추가, `isCityFeature` 제거, 옵션 평탄화 |
| `src/screens/MainScreen.tsx` (수정) | 인기명소 UI 제거, `REGION_COUNTRIES` import 전환 |
| `src/constants/featureFlags.ts` (수정) | `REGION_MAP_ENABLED = true` — 마지막 커밋 |

---

## Task 1: 코드 산출 로직 공유 모듈 추출

**Files:**
- Create: `scripts/lib/neRegionCode.ts`
- Modify: `scripts/build-region-aliases.ts`

**Interfaces:**
- Produces (모두 `scripts/lib/neRegionCode.ts`에서 export):
  - `ISO3: string[]` — 대상 26개국
  - `DISSOLVE: Record<string, 'region' | 'geonunit'>`
  - `NeProps` 인터페이스
  - `norm(s: string): string`
  - `loadNeFeatures(path: string): NeProps[]`
  - `codeOf(p: NeProps): string`
  - `assertNoPrimaryNameConflict(feats: NeProps[]): void`
  - `primaryNameCode(iso: string, name: string, code: string): string`

**이 태스크의 성공 기준은 특이하다:** 리팩터이므로 `src/data/regionKeyAliases.ts`가 **바이트 단위로 변하지 않아야** 한다. 변했다면 규칙이 바뀐 것이고, 그건 사용자 데이터와 어긋난다는 뜻이다.

- [ ] **Step 1: 현재 산출물의 해시를 기록**

```bash
git rev-parse HEAD:src/data/regionKeyAliases.ts
```
이 값을 적어둔다. Step 5에서 비교한다.

- [ ] **Step 2: 공유 모듈 작성**

`scripts/build-region-aliases.ts`에서 아래 조각을 그대로 옮긴다: `ISO3`, `DISSOLVE`, `CODE_FIX`, `norm`, `dash`, `CODE_RE`, `NeProps`, NE 로딩 + `~` 필터, `codeOf`. **로직을 고치지 말고 옮기기만 한다.** 새로 추가하는 것은 `assertNoPrimaryNameConflict`·`primaryNameCode`·`PRIMARY_NAME_WINNER`뿐이다.

`scripts/lib/neRegionCode.ts`
```ts
/**
 * Natural Earth 10m admin-1 코드 산출 — 별칭 표 생성기와 지오 생성기의 단일 진실 원천.
 *
 * 이 규칙이 두 곳에 복제되면 반드시 어긋나고, 어긋나는 순간 마이그레이션해둔 사용자
 * 저장 키(`${ISO3}|${CODE}`)와 지도의 CODE가 안 맞아 색이 하나도 안 뜬다 — 예외도
 * 로그도 없이 조용히. 규칙을 바꿔야 하면 반드시 여기서만 바꾼다.
 */
import { readFileSync } from 'node:fs';

/** 대륙 지도 대상 국가(ISO3) — countryGeo.LOADERS·ISO2_TO_GEO·REGION_COUNTRIES와 일치해야 한다 */
export const ISO3 = ['ARE','AUT','BRA','CAN','CHN','COL','DEU','EGY','ESP','FRA','GBR','GRC',
                     'ITA','JPN','MAR','MEX','MYS','NLD','PRT','SAU','THA','TUN','TUR','USA','VNM','ZAF'];

// 병합 대상국 — NE admin-1이 GADM Level-1보다 한 단계 아래라 상위로 묶는다
export const DISSOLVE: Record<string, 'region' | 'geonunit'> = {
  FRA: 'region', ITA: 'region', ESP: 'region', GBR: 'geonunit',
};

// NE 데이터 자체 결함 보정 — 같은 코드가 두 지역에 붙어 있다
const CODE_FIX: Record<string, string> = {
  'COL|Bogota': 'CO-DC',   // 쿤디나마르카와 CO-CUN 중복
  'ESP|Melilla': 'ES-ML',  // 세우타와 ES.CE 중복
};

/**
 * 1차 이름(name·name_en)이 겹치면서 최종 코드가 다른 피처 쌍의 승자를 못 박는다.
 * 못 박지 않으면 NE 피처 순서에 따라 승자가 바뀌어, 사용자의 워싱턴주 색이 어느 날
 * 조용히 D.C.로 간다. 여기 없는 새 충돌은 assert가 throw한다.
 */
const PRIMARY_NAME_WINNER: Record<string, string> = {
  'USA|washington': 'US-WA',  // 워싱턴주가 이긴다 — D.C.는 'districtofcolumbia'로 따로 잡힌다
  'MEX|mexico': 'MX-MEX',     // 멕시코주가 이긴다 — 연방구는 'distritofederal'로 따로 잡힌다
};

/** 정규화: 발음구별기호 제거 + 소문자 + 영숫자만 남김 */
export const norm = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// region_cod의 점 표기를 하이픈으로 통일 (ES.CE → ES-CE) + NE 원본의 공백류 오염 제거
// (Île-de-France 피처들의 region_cod가 "FR-IDF\t"처럼 탭이 섞여 들어온다)
const dash = (s: string): string => s.replace(/\./g, '-').replace(/\s+/g, '');

/** 최종 코드 형식 검증: `${ISO2}-${영숫자}` 꼴이 아니면 코드 자체가 오염된 것으로 본다 */
const CODE_RE = /^[A-Z]{2}-[A-Za-z0-9]+$/;

export interface NeProps {
  adm0_a3: string; name: string; name_en?: string; name_local?: string;
  name_alt?: string; gn_name?: string; woe_name?: string;
  name_ko?: string;
  iso_3166_2?: string; region?: string; region_cod?: string;
  geonunit?: string; gu_a3?: string; adm1_code?: string;
}

/**
 * NE geojson에서 대상 26개국 피처를 읽는다.
 * iso_3166_2가 '~'로 끝나는 것은 NE가 붙인 비공식/미분류 코드로 실제 행정구역이 아니다
 * (중립지대·남중국해 섬·미분류 잔재 폴리곤 등 5건: ARE 2·CHN 1·COL 1·MEX 1). 그중 UAE
 * "Neutral Zone"(AE-X01~)은 name_en이 "Fujairah"라서 두면 진짜 푸자이라와 충돌한다.
 */
export function loadNeFeatures(path: string): NeProps[] {
  return JSON.parse(readFileSync(path, 'utf8'))
    .features.map((f: any) => f.properties)
    .filter((p: NeProps) => ISO3.includes(p.adm0_a3))
    .filter((p: NeProps) => !(p.iso_3166_2 || '').endsWith('~'));
}

/** 피처 하나의 최종 코드 — 병합 대상국은 그룹 코드를 쓴다 */
export function codeOf(p: NeProps): string {
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
  if (!CODE_RE.test(code)) throw new Error(`코드 형식 이상: "${code}" (${p.adm0_a3} ${p.name})`);
  return code;
}

/** 1차 이름이 겹치면서 코드가 다른데 승자가 선언돼 있지 않으면 throw */
export function assertNoPrimaryNameConflict(feats: NeProps[]): void {
  const byKey = new Map<string, Set<string>>();
  for (const p of feats) {
    const code = codeOf(p);
    for (const f of ['name', 'name_en'] as const) {
      const v = p[f];
      if (!v) continue;
      const k = `${p.adm0_a3}|${norm(v)}`;
      if (!byKey.has(k)) byKey.set(k, new Set());
      byKey.get(k)!.add(code);
    }
  }
  const undeclared: string[] = [];
  for (const [k, codes] of byKey) {
    // 코드가 하나면 충돌이 아니다(영국 Halton 두 피처처럼 둘 다 GB-ENG로 접히는 경우 포함)
    if (codes.size < 2) continue;
    if (!PRIMARY_NAME_WINNER[k]) undeclared.push(`${k} → ${[...codes].join(' vs ')}`);
  }
  if (undeclared.length) {
    throw new Error(
      '1차 이름 충돌이 선언되지 않았다. neRegionCode.ts의 PRIMARY_NAME_WINNER에 승자를 못 박아라:\n  '
      + undeclared.join('\n  '),
    );
  }
}

/** 1차 이름 색인에 쓸 코드 — 승자가 선언된 키는 그 값으로 고정한다 */
export function primaryNameCode(iso: string, name: string, code: string): string {
  return PRIMARY_NAME_WINNER[`${iso}|${norm(name)}`] ?? code;
}
```

- [ ] **Step 3: 별칭 생성기를 공유 모듈 사용으로 전환**

`scripts/build-region-aliases.ts`에서 위로 옮긴 조각들을 **삭제**하고 import로 바꾼다. `MANUAL` 별칭표와 GADM 읽기·매칭 4단계·출력은 그대로 남긴다.

```ts
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { CITY_TO_PROV } from '../src/constants/homeRegions';
import {
  ISO3, DISSOLVE, NeProps, norm, loadNeFeatures, codeOf,
  assertNoPrimaryNameConflict, primaryNameCode,
} from './lib/neRegionCode';

const NE = 'scripts/geo-tmp/ne10m_admin1.geojson';
const ne = loadNeFeatures(NE);
assertNoPrimaryNameConflict(ne);
```

1패스에서 1차 이름을 넣을 때 `primaryNameCode`를 거치도록 바꾼다.

```ts
// 1패스 — 1차 이름 + 멱등성용 코드 자기항목
for (const p of ne) {
  const code = codeOf(p);
  for (const f of ['name', 'name_en'] as const) {
    const v = p[f] as string | undefined;
    // 승자가 선언된 1차 이름은 그 코드로 고정 (NE 피처 순서에 좌우되지 않게)
    if (v) addName(p.adm0_a3, v, primaryNameCode(p.adm0_a3, v, code));
  }
  addName(p.adm0_a3, code, code);
}
```

2패스와 나머지는 손대지 않는다.

- [ ] **Step 4: 별칭 표 재생성**

```bash
node node_modules/tsx/dist/cli.mjs scripts/build-region-aliases.ts
```
기대: `구 키 839 → 매칭 821 / 미매칭 14`, `고유 코드 701`. assert 예외가 나지 않아야 한다.

- [ ] **Step 5: 산출물이 변하지 않았는지 확인 — 이 태스크의 핵심 검증**

```bash
git diff --stat src/data/regionKeyAliases.ts
```
기대: **출력이 비어 있음**(변경 없음).

변경이 있다면 리팩터가 규칙을 바꾼 것이다. `git diff`로 무엇이 달라졌는지 확인하고, 의도치 않은 변경이면 되돌린다. **차이를 그대로 커밋하지 마라** — 사용자 저장 키와 어긋난다.

- [ ] **Step 6: 충돌 assert가 실제로 동작하는지 확인**

`PRIMARY_NAME_WINNER`에서 `'USA|washington'` 줄을 잠시 주석 처리하고 Step 4를 다시 실행한다.

기대: `1차 이름 충돌이 선언되지 않았다` 예외가 나고 파일이 쓰이지 않는다.

확인했으면 주석을 되돌리고 Step 4를 다시 실행해 정상 생성되는 것을 본다.

- [ ] **Step 7: 타입 체크와 커밋**

```bash
npx tsc --noEmit
npm test
git add scripts/lib/neRegionCode.ts scripts/build-region-aliases.ts
git commit -m "refactor(region): NE 코드 산출 로직을 공유 모듈로 추출 + 1차 이름 충돌 assert"
```
`src/data/regionKeyAliases.ts`는 변경이 없으므로 커밋에 포함되지 않는다.

---

## Task 2: 지오 데이터 생성과 배선

**Files:**
- Create: `scripts/build-region-geo.ts`
- Create: `scripts/build-region-geo.md`
- Create: `src/data/geo/{ISO3}.ts` × 26 (스크립트가 생성)
- Create: `src/constants/regionCountries.ts`
- Create: `src/data/regionGeoSync.verify.ts`
- Modify: `src/data/countryGeo.ts`
- Modify: `src/screens/MainScreen.tsx` (`REGION_COUNTRIES` import 전환)

**Interfaces:**
- Consumes: `scripts/lib/neRegionCode.ts`의 전량 (Task 1)
- Produces:
  - 지오 파일 형식: `const GEO: any = {...}; export default GEO;`
  - 피처 속성: `CODE`(매칭 키) · `NAME_1`(영문 표시) · `NL_NAME_1`(한글 표시)
  - `src/constants/regionCountries.ts`: `REGION_COUNTRIES: { code: string; flag: string; name: string }[]`

- [ ] **Step 1: 기존 지오 파일의 형식을 확인**

백업에 이전 형식이 남아 있다. 새 파일도 같은 골격이어야 `countryGeo.LOADERS`의 `require(...).default`가 그대로 동작한다.

```bash
head -c 400 "C:/Users/2023user/OneDrive/바탕 화면/Important2/gadm-backup-2026-07-28/geo/AUT.ts"
tail -c 120 "C:/Users/2023user/OneDrive/바탕 화면/Important2/gadm-backup-2026-07-28/geo/AUT.ts"
```

확인할 것: 상단 주석 → `const GEO: any = {...}` → 마지막 줄의 export 형태. 이 골격을 그대로 재현한다.

- [ ] **Step 2: `REGION_COUNTRIES`를 상수 모듈로 추출**

검증 스크립트가 이 목록을 import해야 하는데, 지금은 `MainScreen.tsx` 안에 있어 불가능하다(react-native를 import하는 화면 파일이라 node에서 못 읽는다).

`MainScreen.tsx`의 **98-126행**(`const REGION_COUNTRIES = [` 부터 `];` 까지)이 대상이다. 26개 항목을 값 하나 바꾸지 말고 그대로 옮긴다.

```bash
sed -n '97,126p' src/screens/MainScreen.tsx
```

`src/constants/regionCountries.ts` (신규) — 위 출력의 배열을 그대로 붙이고 `export`를 붙인다.
```ts
// 대륙 모드 국가 목록 — countryGeo.LOADERS·homeRegions.ISO2_TO_GEO와 항상 일치해야 한다.
// (regionGeoSync.verify.ts가 셋을 교차 검증한다)
export const REGION_COUNTRIES = [
  { code: 'JPN', flag: '🇯🇵', name: '일본' },
  // ↑ 98-126행에서 옮긴 26개 항목 전부
];
```

`MainScreen.tsx`에서는 98-126행을 지우고 import로 바꾼다. `ISO3_TO_KO`(`:163`)가 이 배열에서 파생되므로 import만 걸면 그대로 동작한다.
```ts
import { REGION_COUNTRIES } from '../constants/regionCountries';
```

옮긴 뒤 개수를 확인한다.
```bash
grep -c "code:" src/constants/regionCountries.ts
```
기대: `26`

- [ ] **Step 3: 지오 생성기 작성**

`scripts/build-region-geo.ts`
```ts
/**
 * Natural Earth 10m admin-1 → 국가별 지역 폴리곤 (src/data/geo/{ISO3}.ts)
 *
 * 실행: node node_modules/tsx/dist/cli.mjs scripts/build-region-geo.ts
 * 절차와 배경은 scripts/build-region-geo.md 참고.
 *
 * 코드 산출 규칙은 scripts/lib/neRegionCode.ts에만 있다 — 여기서 재구현하지 마라.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ISO3, DISSOLVE, codeOf, loadNeFeatures, assertNoPrimaryNameConflict } from './lib/neRegionCode';

const NE = 'scripts/geo-tmp/ne10m_admin1.geojson';
const TMP = 'scripts/geo-tmp';
const OUT_DIR = 'src/data/geo';
const SIMPLIFY = '25%';

// 코드 규칙 자체 점검 — 실패하면 아무것도 쓰지 않는다
const feats = loadNeFeatures(NE);
assertNoPrimaryNameConflict(feats);

// 피처 하나가 가질 속성 3종을 미리 계산해 adm1_code로 색인해 둔다.
// (mapshaper의 JS 표현식에서는 이 파일의 함수를 못 쓰므로 계산 결과를 조인으로 주입한다)
interface Attrs { adm1_code: string; CODE: string; NAME_1: string; NL_NAME_1: string }
const rows: Attrs[] = [];
for (const p of feats) {
  const code = codeOf(p);
  const d = DISSOLVE[p.adm0_a3];
  // 병합 대상국은 그룹명이 표시명이 된다 (프랑스 département가 아니라 région을 보여준다)
  const nameEn = d ? String((p as any)[d] || p.name_en || p.name) : (p.name_en || p.name);
  const nameKo = p.name_ko && String(p.name_ko).trim() ? String(p.name_ko).trim() : nameEn;
  rows.push({ adm1_code: String(p.adm1_code), CODE: code, NAME_1: nameEn, NL_NAME_1: nameKo });
}
writeFileSync(`${TMP}/attrs.json`, JSON.stringify(rows));

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const mapshaper = (args: string[]) =>
  execFileSync(process.execPath, ['node_modules/mapshaper/bin/mapshaper', ...args], { stdio: 'inherit' });

const counts: Record<string, number> = {};
for (const iso of ISO3) {
  const out = `${TMP}/${iso}.json`;
  mapshaper([
    NE,
    '-filter', `adm0_a3 === '${iso}'`,
    // 미리 계산한 속성을 adm1_code로 붙인다.
    // string-fields가 없으면 mapshaper가 'COL-1399'를 숫자로 추론하려다 조인이 어긋난다.
    '-join', `${TMP}/attrs.json`, 'keys=adm1_code,adm1_code', 'string-fields=adm1_code',
    // 병합은 CODE 기준 — 이름으로 묶으면 동명 지역이 잘못 합쳐진다
    '-dissolve2', 'CODE', 'copy-fields=NAME_1,NL_NAME_1',
    '-simplify', 'visvalingam', SIMPLIFY, 'keep-shapes',
    '-clean',
    '-filter-fields', 'CODE,NAME_1,NL_NAME_1',
    '-o', 'format=geojson', 'precision=0.001', out,
  ]);
  const fc = JSON.parse(readFileSync(out, 'utf8'));
  counts[iso] = fc.features.length;

  const banner = [
    '// 자동 생성 — scripts/build-region-geo.ts. 직접 수정 금지.',
    '// Natural Earth 10m admin-1 (퍼블릭 도메인), visvalingam 25% 단순화.',
    '// CODE=매칭 키(저장 키의 뒷부분) · NAME_1=영문 표시명 · NL_NAME_1=한글 표시명.',
    '// CODE에 표시명을 넣거나 NAME_1에 코드를 넣지 마라 — 지도 검색·인셋이 조용히 깨진다.',
    '',
  ].join('\n');
  writeFileSync(`${OUT_DIR}/${iso}.ts`, `${banner}const GEO: any = ${JSON.stringify(fc)};\nexport default GEO;\n`);
}

// 병합 결과 개수 점검 — 스펙 4절
const EXPECT: Record<string, number> = { FRA: 18, ITA: 20, ESP: 19, GBR: 4 };
for (const [iso, n] of Object.entries(EXPECT)) {
  if (counts[iso] !== n) throw new Error(`${iso} 지역 수 ${counts[iso]} — 기대 ${n}. dissolve가 어긋났다.`);
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`생성 완료: ${ISO3.length}개국 / 지역 ${total}개`);
for (const iso of ISO3) console.log(`  ${iso} ${counts[iso]}`);
```

- [ ] **Step 4: mapshaper 확인 후 생성**

```bash
ls node_modules/mapshaper/bin/mapshaper || npm i -D mapshaper
node node_modules/tsx/dist/cli.mjs scripts/build-region-geo.ts
du -bc src/data/geo/*.ts | tail -1
```

기대: 26개국이 출력되고 `FRA 18 / ITA 20 / ESP 19 / GBR 4`가 맞아 예외가 없다. 총 지역 수는 700 안팎, 용량은 약 1.8MB. 3MB를 크게 넘으면 `SIMPLIFY`를 낮춰 다시 굽는다.

- [ ] **Step 5: `LOADERS` 복원**

`src/data/countryGeo.ts`의 `const LOADERS: Record<string, () => any> = {};`를 26줄로 채운다. 파일 상단 주석의 "데이터는 현재 비어 있다" 문단도 현재 상태에 맞게 고친다.

```ts
const LOADERS: Record<string, () => any> = {
  ARE: () => require('./geo/ARE').default,
  AUT: () => require('./geo/AUT').default,
  BRA: () => require('./geo/BRA').default,
  CAN: () => require('./geo/CAN').default,
  CHN: () => require('./geo/CHN').default,
  COL: () => require('./geo/COL').default,
  DEU: () => require('./geo/DEU').default,
  EGY: () => require('./geo/EGY').default,
  ESP: () => require('./geo/ESP').default,
  FRA: () => require('./geo/FRA').default,
  GBR: () => require('./geo/GBR').default,
  GRC: () => require('./geo/GRC').default,
  ITA: () => require('./geo/ITA').default,
  JPN: () => require('./geo/JPN').default,
  MAR: () => require('./geo/MAR').default,
  MEX: () => require('./geo/MEX').default,
  MYS: () => require('./geo/MYS').default,
  NLD: () => require('./geo/NLD').default,
  PRT: () => require('./geo/PRT').default,
  SAU: () => require('./geo/SAU').default,
  THA: () => require('./geo/THA').default,
  TUN: () => require('./geo/TUN').default,
  TUR: () => require('./geo/TUR').default,
  USA: () => require('./geo/USA').default,
  VNM: () => require('./geo/VNM').default,
  ZAF: () => require('./geo/ZAF').default,
};
```

- [ ] **Step 6: 교차 검증 작성 — 이 태스크에서 가장 중요한 산출물**

`src/data/regionGeoSync.verify.ts`
```ts
// src/data/regionGeoSync.verify.ts
// 별칭 표(마이그레이션된 사용자 키) ↔ 지오 데이터(지도) ↔ 국가 목록 3종의 정합성 검증.
// 이게 깨지면 사용자 색이 조용히 하나도 안 뜬다 — 예외도 로그도 없다.
import { REGION_KEY_ALIASES } from './regionKeyAliases';
import { getCountryGeo, GEO_COUNTRY_CODES } from './countryGeo';
import { ISO2_TO_GEO } from '../constants/homeRegions';
import { REGION_COUNTRIES } from '../constants/regionCountries';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// 지오의 (ISO3, CODE) 집합
const geoCodes = new Set<string>();
for (const iso of GEO_COUNTRY_CODES) {
  const fc = getCountryGeo(iso);
  for (const f of fc?.features ?? []) geoCodes.add(`${iso}|${f.properties.CODE}`);
}

// 1. 별칭 표의 모든 코드가 지오에 존재하는가 (반대 방향은 정상 — NE에만 있는 지역)
{
  const missing: string[] = [];
  for (const [oldKey, code] of Object.entries(REGION_KEY_ALIASES)) {
    const iso = oldKey.slice(0, oldKey.indexOf('|'));
    if (!geoCodes.has(`${iso}|${code}`)) missing.push(`${iso}|${code} (구 키 ${oldKey})`);
  }
  eq(missing, [], '별칭 표의 모든 코드가 지오 데이터에 존재');
}

// 2. 목록 3중 동기화
{
  const fromLoaders = [...GEO_COUNTRY_CODES].sort();
  const fromIso2 = [...new Set(Object.values(ISO2_TO_GEO))].sort();
  const fromCountries = REGION_COUNTRIES.map(c => c.code).sort();
  eq(fromIso2, fromLoaders, '동기화: ISO2_TO_GEO == LOADERS');
  eq(fromCountries, fromLoaders, '동기화: REGION_COUNTRIES == LOADERS');
}

// 3. 지오 피처가 세 속성을 모두 갖추고 CODE 형식이 맞는가
{
  const bad: string[] = [];
  const CODE_RE = /^[A-Z]{2}-[A-Za-z0-9]+$/;
  for (const iso of GEO_COUNTRY_CODES) {
    for (const f of getCountryGeo(iso)?.features ?? []) {
      const p = f.properties || {};
      if (!CODE_RE.test(p.CODE || '')) bad.push(`${iso}: CODE="${p.CODE}"`);
      else if (!p.NAME_1) bad.push(`${iso}|${p.CODE}: NAME_1 없음`);
      else if (!p.NL_NAME_1) bad.push(`${iso}|${p.CODE}: NL_NAME_1 없음`);
    }
  }
  eq(bad.slice(0, 10), [], '지오 피처 속성 3종 + CODE 형식');
}

// 4. 국가 안에서 CODE가 중복되지 않는가
{
  const dup: string[] = [];
  for (const iso of GEO_COUNTRY_CODES) {
    const seen = new Set<string>();
    for (const f of getCountryGeo(iso)?.features ?? []) {
      const c = f.properties?.CODE;
      if (seen.has(c)) dup.push(`${iso}|${c}`); else seen.add(c);
    }
  }
  eq(dup, [], 'CODE 중복 없음');
}

// 5. 병합 대상국의 지역 수
{
  const got: Record<string, number> = {};
  for (const iso of ['FRA', 'ITA', 'ESP', 'GBR']) got[iso] = getCountryGeo(iso)?.features.length ?? 0;
  eq(got, { FRA: 18, ITA: 20, ESP: 19, GBR: 4 }, '병합 대상국 지역 수');
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
```

- [ ] **Step 7: 검증 실행**

```bash
node node_modules/tsx/dist/cli.mjs src/data/regionGeoSync.verify.ts
```
기대: 5개 검사 전부 통과.

**검사 1이 실패하면 여기서 멈추고 보고하라.** 별칭 표와 지오의 코드 규칙이 어긋났다는 뜻이고, 그대로 진행하면 사용자 색이 안 뜬다. Task 1의 공유 모듈이 양쪽에 실제로 쓰이고 있는지부터 확인한다.

- [ ] **Step 8: 절차 문서 작성**

`scripts/build-region-geo.md`
````markdown
# src/data/geo/*.ts 재생성 파이프라인

Natural Earth 10m admin-1 → 26개국 지역 폴리곤. 대륙 지도용.

```bash
# 1) NE 원본(약 40.7MB) — 이미 있으면 생략
mkdir -p scripts/geo-tmp
curl.exe -sL -o scripts/geo-tmp/ne10m_admin1.geojson \
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson"

# 2) 생성
node node_modules/tsx/dist/cli.mjs scripts/build-region-geo.ts

# 3) 정합성 확인 (npm test에도 포함돼 있다)
node node_modules/tsx/dist/cli.mjs src/data/regionGeoSync.verify.ts
```

- 코드 산출 규칙은 `scripts/lib/neRegionCode.ts`에만 있다. 여기서 재구현하지 마라 —
  별칭 표와 어긋나면 마이그레이션된 사용자 키가 지도에 없는 지역을 가리킨다.
- 피처 속성: `CODE`(매칭 키) · `NAME_1`(영문 표시) · `NL_NAME_1`(한글 표시).
- 국가를 추가하려면 `neRegionCode.ts`의 `ISO3` + `countryGeo.LOADERS` +
  `homeRegions.ISO2_TO_GEO` + `constants/regionCountries.ts` 넷을 함께 고친다.
  `regionGeoSync.verify.ts`가 어긋남을 잡아준다.
- 단순화율은 생성기의 `SIMPLIFY`. 25%에서 26개국 약 1.8MB.
- `scripts/geo-tmp/`는 커밋하지 않는다.
- 설계 배경: `docs/superpowers/specs/2026-07-29-region-map-restore-design.md`
````

- [ ] **Step 9: 전체 검증과 커밋**

```bash
npx tsc --noEmit
npm test
git add scripts/build-region-geo.ts scripts/build-region-geo.md src/data/geo \
        src/data/countryGeo.ts src/data/regionGeoSync.verify.ts \
        src/constants/regionCountries.ts src/screens/MainScreen.tsx
git commit -m "feat(region): NE 지역 데이터 26개국 생성 + LOADERS 복원 + 정합성 검증"
```

---

## Task 3: CountryMapView 배선

**Files:**
- Create: `scripts/check-webview-syntax.mjs`
- Modify: `src/components/CountryMapView.tsx`
- Modify: `src/screens/MainScreen.tsx` (`showPopular` prop 한 줄만)

**Interfaces:**
- Consumes: 지오 피처의 `CODE`·`NAME_1`·`NL_NAME_1` (Task 2)
- Produces: `regionTapped` 메시지의 `regionEn`이 이제 **코드**다 (MainScreen이 `regionNameEn`으로 저장한다)

**이 파일의 199~676행은 템플릿 리터럴 안의 JS라 TypeScript가 오타를 전혀 안 잡는다.** 그래서 문법 검사 스크립트를 먼저 만든다.

- [ ] **Step 1: WebView JS 문법 검사 스크립트 작성**

파싱만 하고 실행하지 않도록 `node --check`를 쓴다.

`scripts/check-webview-syntax.mjs`
```js
/**
 * 템플릿 리터럴 안에 든 WebView용 JS의 문법 검사.
 *
 * tsc는 문자열 안을 보지 않으므로 이 안의 오타는 런타임(빈 화면)에서야 드러난다.
 * <script> ... </script> 블록을 뽑아 `node --check`로 파싱만 시킨다(실행하지 않는다).
 *
 * 실행: node scripts/check-webview-syntax.mjs <파일...>
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const files = process.argv.slice(2);
if (!files.length) { console.error('사용법: node scripts/check-webview-syntax.mjs <파일...>'); process.exit(1); }

const dir = mkdtempSync(join(tmpdir(), 'wvsyntax-'));
let failed = 0;
try {
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const blocks = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    if (!blocks.length) { console.log(`- ${file}: <script> 블록 없음 (건너뜀)`); continue; }
    blocks.forEach((body, i) => {
      // ${...} 보간은 파서가 못 읽으므로 자리표시자로 치환한다(문법 구조는 보존된다)
      const code = body.replace(/\$\{[^}]*\}/g, '0');
      const tmp = join(dir, `block-${i}.js`);
      writeFileSync(tmp, code);
      try {
        execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
        console.log(`✓ ${file} <script> #${i + 1} (${code.length}자)`);
      } catch (e) {
        failed++;
        console.error(`✗ ${file} <script> #${i + 1}:\n${String(e.stderr || e.message).trim()}`);
      }
    });
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
if (failed) { console.error(`\n${failed}개 블록 문법 오류`); process.exit(1); }
console.log('\n✅ WebView JS 문법 통과');
```

- [ ] **Step 2: 수정 전 기준선 확인**

```bash
node scripts/check-webview-syntax.mjs src/components/CountryMapView.tsx
```
기대: 통과. 여기서 실패하면 스크립트 쪽 문제이므로 먼저 고친다(예: d3 인라인 블록이 섞여 들어온 경우 해당 블록을 건너뛰도록 조정).

- [ ] **Step 3: 매칭 지점을 `CODE`로 전환**

`src/components/CountryMapView.tsx`에서 아래를 바꾼다. **표시·검색·인셋은 건드리지 않는다.**

`activeRecordFor`에 넘기는 값 — `d.properties.NAME_1` → `d.properties.CODE`:
```js
// :385 부근
var nameEn=d.properties.CODE||'';
// :421, :426, :432, :445 부근 (각각 var n=d.properties.NAME_1||'';)
var n=d.properties.CODE||'';
// :647
pathElements.filter(function(d){ return !!activeRecordFor(d.properties.CODE||''); }).raise();
```

`onRegionClick`(`:468` 부근) — 표시명은 `NL_NAME_1`, 전달 키는 `CODE`:
```js
var name=d.properties.NL_NAME_1||d.properties.NAME_1||'';
var nameEn=d.properties.CODE||'';   // MainScreen이 regionNameEn으로 저장하는 값
```

`:653`의 `searchedRegion` 비교는 검색 결과(이름 기반)이므로 **`NAME_1` 그대로 둔다.**

- [ ] **Step 4: 인기명소 경로 제거**

도시 피처가 없으므로 아래를 지운다.

`prefOf`(`:405-409`)를 삭제하고 `activeRecordFor`가 직접 비교하게 한다:
```js
// 이 지역에 기록이 있으면 그 기록 반환. (도시 피처는 상위 주로 흡수돼 데이터에 없다)
function activeRecordFor(code){
  for(var i=0;i<recordedRegions.length;i++){
    if(recordedRegions[i].nameEn===code) return recordedRegions[i];
  }
  return null;
}
```

이어서 지운다.
- `isCity`·`CITY_TO_PROV` 참조와 `:651`의 도시 raise 줄
- `setPopular` 메시지 핸들러, `:117`·`:126`의 postMessage 두 줄, `Props`의 `showPopular`
- `regionPointer`(`:479` 부근)에서 숨긴 도시를 걸러내던 분기

- [ ] **Step 5: 미국 인셋 축소**

```js
// :501 — NE 미국 admin-1은 50주+D.C.뿐. 괌은 별도 국가(GUM), 호놀룰루는 GADM 도시 피처였다.
var insets=['Alaska','Hawaii'];
```
`:508`의 인셋 필터에서 `Honolulu`·`Guam` 조건을 빼고, `:564`의 `box.name==='Hawaii' && ...==='Honolulu'` 특례도 뺀다. 이 세 곳은 `NAME_1` 기준 그대로다.

- [ ] **Step 6: 문법 검사와 타입 체크**

```bash
node scripts/check-webview-syntax.mjs src/components/CountryMapView.tsx
npx tsc --noEmit
```
`showPopular`를 제거했으므로 `MainScreen`이 아직 넘기고 있으면 tsc가 잡는다. 그 prop 한 줄만 지워 통과시킨다(인기명소 UI 전체 정리는 Task 4).

- [ ] **Step 7: 커밋**

```bash
npm test
git add scripts/check-webview-syntax.mjs src/components/CountryMapView.tsx src/screens/MainScreen.tsx
git commit -m "feat(region): 대륙 지도 매칭을 CODE 기준으로 전환 + 인기명소 경로 제거"
```

---

## Task 4: homeRegions와 MainScreen 정리

**Files:**
- Modify: `src/constants/homeRegions.ts`
- Modify: `src/screens/MainScreen.tsx`

**Interfaces:**
- Consumes: 지오의 `CODE`·`NAME_1`·`NL_NAME_1` (Task 2)
- Produces: `HomeRegion { name: string; nameEn: string; latin: string }` — `nameEn`은 **코드**, `latin`이 영문명
- `getCountryRegionOptions(geoKey: string): HomeRegion[]` (평탄 배열로 변경)

**가장 미묘한 함정:** `normalizeHomeRegion`은 GPS 도시명("Yokohama")을 거주 지역으로 정규화하는데 지금은 `r.nameEn`을 문자열 비교에 쓴다. `nameEn`이 `JP-14`가 되면 이 비교가 **조용히 무의미해진다** — 예외 없이 항상 `null`을 반환해 거주국 기록의 지역 그룹핑이 통째로 죽는다.

- [ ] **Step 1: `HomeRegion`에 `latin` 추가**

`src/constants/homeRegions.ts`
```ts
export interface HomeRegion {
  name: string;   // 한글 표시명 (NL_NAME_1)
  // 저장 키 = 지오의 CODE ('JP-14'). 이름과 내용이 어긋나 보이지만, 이 값을 저장하는
  // 호출부(taggedRegions.nameEn·TravelRecord.regionNameEn)가 이미 코드 체계로
  // 마이그레이션돼 있다. 여기서 이름을 바꾸면 오히려 저장 계층과 어긋난다.
  nameEn: string;
  latin: string;  // 영문명 (NAME_1) — GPS 도시명 매칭 전용, 저장하지 않는다
}
```

- [ ] **Step 2: 지역 목록 생성부를 세 속성으로 전환**

`getCountryRegionOptions`(`:66`)에서 `isCityFeature` 분기를 지우고 평탄한 배열을 반환한다.
```ts
/** 대륙 지도 국가(ISO3)의 선택 가능한 지역 목록. nameEn은 지도 매칭 키(CODE)와 동일. */
export function getCountryRegionOptions(geoKey: string): HomeRegion[] {
  const features: any[] = getCountryGeo(geoKey)?.features ?? [];
  const seen = new Set<string>();
  const out: HomeRegion[] = [];
  for (const f of features) {
    const p = f?.properties ?? {};
    if (!p.CODE || seen.has(p.CODE)) continue;
    seen.add(p.CODE);
    out.push({ name: p.NL_NAME_1 || p.NAME_1, nameEn: p.CODE, latin: p.NAME_1 || '' });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return out;
}
```

`getHomeRegions`(`:99` 부근)의 루프도 같은 형태로 바꾼다(정렬·캐시는 유지).

`isCityFeature`(`:57`)를 삭제한다. **`CITY_TO_PROV`는 남긴다** — 다음 스텝에서 계속 쓴다.

- [ ] **Step 3: `normalizeHomeRegion`을 `latin` 기준으로**

```ts
export function normalizeHomeRegion(countryCode?: string | null, raw?: string | null): HomeRegion | null {
  if (!raw) return null;
  const cc = (countryCode || '').toUpperCase();
  if (cc === 'KR') {
    const kr = normalizeKoreaRegion(raw);
    return kr ? { name: kr.name, nameEn: kr.nameEn, latin: kr.nameEn } : null;
  }
  const regions = getHomeRegions(cc);
  if (regions.length === 0) return null;
  const q = fold(raw).replace(/[\s\-'’.]/g, '');
  // 1) 도시 → 상위 주 매핑 우선 (Yokohama→Kanagawa 등)
  //    CITY_TO_PROV 값은 GADM 주 이름이므로 코드가 아니라 latin(영문명)과 대조한다.
  const geoKey = ISO2_TO_GEO[cc];
  const viaCity = geoKey ? CITY_TO_PROV[geoKey]?.[q] : undefined;
  if (viaCity) {
    const vq = fold(viaCity).replace(/[\s\-'’.]/g, '');
    return regions.find(r => fold(r.latin).replace(/[\s\-'’.]/g, '') === vq) ?? null;
  }
  return (
    regions.find(r => {
      const en = fold(r.latin).replace(/[\s\-'’.]/g, '');
      return !!en && (q.includes(en) || en.includes(q) || raw.includes(r.name));
    }) ?? null
  );
}
```

`!!en &&` 가드가 중요하다 — `latin`이 비면 `''.includes`가 항상 참이라 아무 지역이나 잡힌다.

- [ ] **Step 4: MainScreen의 인기명소 UI 제거**

`src/screens/MainScreen.tsx`에서 지운다.
- `popularActive` state (`:684` 부근)
- 인기명소 칩 블록 (`:1414-1425` 부근, `LinearGradient` + `popularChipInner`)
- `popularChipBorder`·`popularChipInner` 스타일 (`:2394-2400` 부근)
- `setPopularActive` 호출 전부 (토글 `onChange`의 `setPopularActive(false)` 포함)

`getCountryRegionOptions` 호출부(`:839`)를 평탄 배열에 맞춘다.
```ts
const regionOptions = useMemo(
  () => (regionCountry ? getCountryRegionOptions(regionCountry) : []),
  [regionCountry],
);
```
이 값을 쓰던 곳의 `.provinces`/`.cities` 참조를 없앤다. `.cities`를 렌더하던 블록이 있으면 함께 제거한다 — tsc가 전부 잡아준다.

- [ ] **Step 5: 타입 체크와 검증**

```bash
npx tsc --noEmit
npm test
node scripts/check-webview-syntax.mjs src/components/CountryMapView.tsx
```
기대: 전부 통과. tsc 오류가 남으면 `.provinces`/`.cities` 잔재이거나 `latin` 누락이다.

- [ ] **Step 6: 커밋**

```bash
git add src/constants/homeRegions.ts src/screens/MainScreen.tsx
git commit -m "feat(region): HomeRegion에 latin 추가 + 인기명소 UI 제거"
```

---

## Task 5: 플래그 전환

**Files:**
- Modify: `src/constants/featureFlags.ts:55-77`

**Interfaces:**
- Consumes: Task 2~4의 데이터와 배선 전부

한 줄 변경과 주석 갱신뿐이다. 별도 커밋으로 두는 이유는 **문제가 생겼을 때 이 커밋만 되돌려 즉시 끌 수 있게** 하기 위해서다.

- [ ] **Step 1: 플래그를 켜고 주석을 현재 이력에 맞게 고친다**

현재 주석은 "재개 방법: OpenStreetMap(ODbL)으로 839개 지역을 다시 받아..."라고 적혀 있는데 사실과 다르다. 실제로는 Natural Earth로 복원했다.

```ts
/**
 * 대륙(국가 지역) 지도 모드 활성화 여부.
 *
 * 지역 경계 데이터가 GADM 4.1이었는데, GADM 라이선스는 학술·비영리 이용만 무료이고
 * 재배포·상업적 이용은 사전 허가를 요구한다. 광고 수익이 있는 앱에 데이터를 넣어
 * 배포하는 것은 양쪽 모두에 해당해서, 출시 전에 데이터를 빼고 이 모드를 껐다(2026-07-28).
 *
 * 2026-07-29 Natural Earth 10m admin-1(퍼블릭 도메인)로 복원해 다시 켰다.
 * 사용자의 저장 키는 GADM 표기에서 ISO 코드로 마이그레이션됐다
 * (src/utils/regionKeyMigration.ts). 데이터 재생성은 scripts/build-region-geo.md 참고.
 *
 * 한국 시/도 프리셋(koreaRegions)은 이 플래그와 무관하게 계속 동작한다.
 */
export const REGION_MAP_ENABLED = true;
```

- [ ] **Step 2: 전체 검증**

```bash
npx tsc --noEmit
npm test
node scripts/check-webview-syntax.mjs src/components/CountryMapView.tsx
```
기대: 전부 통과.

- [ ] **Step 3: 코치마크 토글 단계가 되살아나는지 코드로 확인**

```bash
grep -n "REGION_MAP_ENABLED" src/screens/MainScreen.tsx
```
기대: 두 곳이 나온다 — 토글 렌더 분기(`:1313` 부근)와 코치 단계 분기(`:487` 부근). 둘 다 이제 참이 되므로 토글과 튜토리얼 단계가 함께 돌아온다. **코드 수정은 필요 없다.**

- [ ] **Step 4: 커밋**

```bash
git add src/constants/featureFlags.ts
git commit -m "feat(region): 대륙 지도 모드 재활성화 (Natural Earth 데이터)"
```

---

## 완료 후 수동 확인 (자동화 불가)

구현이 끝나도 아래는 사람이 실기기에서 확인해야 한다. 이걸 하기 전에는 "완료"라고 보고하지 않는다.

- [ ] 지구본/대륙 토글이 다시 보이고 전환이 동작한다
- [ ] 26개국을 순회하며 지도가 그려지고 지역 탭이 반응한다
- [ ] **마이그레이션을 거친 기존 데이터에서 색·태깅이 실제로 지도에 뜬다** (이 작업 전체의 최종 목적)
- [ ] 미국 지도의 알래스카·하와이 인셋이 정상이다
- [ ] 지역 검색이 영문·한글 모두로 동작한다
- [ ] 거주국(한국 외)에서 GPS 기반 지역 그룹핑이 여전히 동작한다 (`normalizeHomeRegion`)
- [ ] 첫 실행 튜토리얼에 토글 단계가 다시 나온다

## 범위 밖

- 대상 국가 확장(한국 포함) — 기존 26개국 복원이 이 계획의 범위다
- 도시·명소 폴리곤 복원 — 상위 주 흡수로 대체 확정
- 선행 작업에서 파킹한 2건(`applySettingsBackup`의 무조건 스키마 상승, `MainScreen:791`의 코드 노출)
