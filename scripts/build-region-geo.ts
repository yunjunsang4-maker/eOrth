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

// mapshaper의 -filter는 adm0_a3만으로 국가를 자르는데, NE 원본에는 loadNeFeatures가
// 이미 걸러낸 '~' 결함 피처(ARE 2·CHN 1·COL 1·MEX 1, 실제 행정구역이 아닌 잔재 폴리곤)가
// 같은 국가 안에 여전히 섞여 있다. 그 피처는 attrs.json에 없으니 조인이 비어서 CODE가
// 빈 채로 출력에 남는다 — '~' 판정 규칙을 여기서 다시 구현하는 대신, loadNeFeatures가
// 이미 승인한 adm1_code 집합으로 원본을 미리 걸러 mapshaper에 넘긴다.
const validAdm1 = new Set(feats.map((p) => String(p.adm1_code)));
const rawFC = JSON.parse(readFileSync(NE, 'utf8'));
const filteredFC = {
  type: 'FeatureCollection',
  features: rawFC.features.filter((f: any) => validAdm1.has(String(f.properties.adm1_code))),
};
const NE_FILTERED = `${TMP}/ne10m_filtered.geojson`;
writeFileSync(NE_FILTERED, JSON.stringify(filteredFC));

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const mapshaper = (args: string[]) =>
  execFileSync(process.execPath, ['node_modules/mapshaper/bin/mapshaper', ...args], { stdio: 'inherit' });

const counts: Record<string, number> = {};
for (const iso of ISO3) {
  const out = `${TMP}/${iso}.json`;
  mapshaper([
    NE_FILTERED,
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
