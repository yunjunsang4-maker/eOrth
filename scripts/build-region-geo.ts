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

/**
 * 병합 대상국(FRA·ITA·ESP·GBR) 그룹의 한글 표시명 — CODE 기준.
 *
 * 병합 그룹은 NE 피처 여러 개를 CODE로 접은 것이라 그룹 자체의 name_ko가 없다. 개별 피처의
 * name_ko(예: 잉글랜드를 이루는 152개 카운티 중 "체셔웨스트 체스터")를 그대로 두면
 * -dissolve2 copy-fields가 그룹의 *첫* 피처 값을 복사해, 잉글랜드 한글명이 임의의 하위
 * 구역명이 된다. 그 이름이 칩·소급 태깅 시트에 뜨고 taggedRegions로 영속 저장되므로
 * 그룹 단위 한글명을 여기서 못 박는다.
 *
 * 출처: GADM 백업(gadm-backup-2026-07-28)의 NL_NAME_1 구 광역명 + 통용 한글 표기.
 * CODE는 저장 키이므로 절대 바꾸지 않는다 — 여기서 바꾸는 것은 표시명뿐이다.
 */
const GROUP_NAME_KO: Record<string, string> = {
  // 프랑스 18개 région
  'FR-ARA': '오베르뉴론알프', 'FR-BFC': '부르고뉴프랑슈콩테', 'FR-BRE': '브르타뉴',
  'FR-COR': '코르시카', 'FR-CVL': '상트르발드루아르', 'FR-GES': '그랑에스트',
  'FR-GUA': '과들루프', 'FR-GUF': '프랑스령 기아나', 'FR-HDF': '오드프랑스',
  'FR-IDF': '일드프랑스', 'FR-LRE': '레위니옹', 'FR-MAY': '마요트',
  'FR-MTQ': '마르티니크', 'FR-NAQ': '누벨아키텐', 'FR-NOR': '노르망디',
  'FR-OCC': '옥시타니', 'FR-PAC': '프로방스알프코트다쥐르', 'FR-PDL': '페이드라루아르',
  // 이탈리아 20개 regione
  'IT-21': '피에몬테', 'IT-23': '발레다오스타', 'IT-25': '롬바르디아',
  'IT-32': '트렌티노알토아디제', 'IT-34': '베네토', 'IT-36': '프리울리베네치아줄리아',
  'IT-42': '리구리아', 'IT-45': '에밀리아로마냐', 'IT-52': '토스카나',
  'IT-55': '움브리아', 'IT-57': '마르케', 'IT-62': '라치오',
  'IT-65': '아브루초', 'IT-67': '몰리세', 'IT-72': '캄파니아',
  'IT-75': '풀리아', 'IT-77': '바실리카타', 'IT-78': '칼라브리아',
  'IT-82': '시칠리아', 'IT-88': '사르데냐',
  // 스페인 19개 comunidad autónoma (+ 세우타·멜리야 자치시)
  'ES-AN': '안달루시아', 'ES-AR': '아라곤', 'ES-AS': '아스투리아스',
  'ES-CB': '칸타브리아', 'ES-CE': '세우타', 'ES-CL': '카스티야이레온',
  'ES-CM': '카스티야라만차', 'ES-CN': '카나리아 제도', 'ES-CT': '카탈루냐',
  'ES-EX': '에스트레마두라', 'ES-GA': '갈리시아', 'ES-LO': '라리오하',
  'ES-MD': '마드리드', 'ES-ML': '멜리야', 'ES-MU': '무르시아',
  'ES-NA': '나바라', 'ES-PM': '발레아레스 제도', 'ES-PV': '바스크',
  'ES-VC': '발렌시아',
  // 영국 4개 구성국
  'GB-ENG': '잉글랜드', 'GB-NIR': '북아일랜드', 'GB-SCT': '스코틀랜드', 'GB-WLS': '웨일스',
};

// 코드 규칙 자체 점검 — 실패하면 아무것도 쓰지 않는다
const feats = loadNeFeatures(NE);
assertNoPrimaryNameConflict(feats);

// 피처 하나가 가질 속성 3종을 미리 계산해 adm1_code로 색인해 둔다.
// (mapshaper의 JS 표현식에서는 이 파일의 함수를 못 쓰므로 계산 결과를 조인으로 주입한다)
interface Attrs { adm1_code: string; CODE: string; NAME_1: string; NL_NAME_1: string }
const rows: Attrs[] = [];
const missingKo: string[] = [];
for (const p of feats) {
  const code = codeOf(p);
  const d = DISSOLVE[p.adm0_a3];
  // 병합 대상국은 그룹명이 표시명이 된다 (프랑스 département가 아니라 région을 보여준다)
  const nameEn = d ? String((p as any)[d] || p.name_en || p.name) : (p.name_en || p.name);
  // 한글명도 같은 원칙 — 병합 대상국은 개별 피처의 name_ko(하위 구역명)를 쓰면 안 된다.
  let nameKo: string;
  if (d) {
    nameKo = GROUP_NAME_KO[code] || '';
    if (!nameKo) { missingKo.push(`${code} (${p.adm0_a3} ${nameEn})`); nameKo = nameEn; }
  } else {
    nameKo = p.name_ko && String(p.name_ko).trim() ? String(p.name_ko).trim() : nameEn;
  }
  rows.push({ adm1_code: String(p.adm1_code), CODE: code, NAME_1: nameEn, NL_NAME_1: nameKo });
}
// 병합 그룹에 한글명이 빠지면 하위 구역명이 그대로 노출되므로, 조용히 넘기지 않고 멈춘다.
// (NE를 새로 받아 그룹이 늘어나는 순간이 정확히 이게 깨지는 시점이다)
if (missingKo.length) {
  throw new Error(
    'GROUP_NAME_KO에 한글명이 없는 병합 그룹이 있다. 이 표에 추가해라:\n  '
    + [...new Set(missingKo)].join('\n  '),
  );
}
writeFileSync(`${TMP}/attrs.json`, JSON.stringify(rows));

// mapshaper의 -filter는 adm0_a3만으로 국가를 자르는데, NE 원본에는 loadNeFeatures가
// 이미 걸러낸 '~' 결함 피처(ARE 2·CHN 1·COL 1·MEX 1, 실제 행정구역이 아닌 잔재 폴리곤)가
// 같은 국가 안에 여전히 섞여 있다. 그 피처는 attrs.json에 없으니 조인이 비어서 CODE가
// 빈 채로 출력에 남는다 — '~' 판정 규칙을 여기서 다시 구현하는 대신, loadNeFeatures가
// 이미 승인한 adm1_code 집합으로 원본을 미리 걸러 mapshaper에 넘긴다.
const validAdm1 = new Set(feats.map((p) => String(p.adm1_code)));
// 조인 키(adm1_code)가 전역 유일하다는 전제 — 깨지면 mapshaper가 다른 나라 속성을 붙여
// 폴리곤이 조용히 오염된다(예외도 경고도 없다). NE 4,596 피처에서 중복 0을 확인했지만,
// NE를 새로 받았을 때 이 전제가 유지되는지는 여기서 못 박아 둔다.
if (validAdm1.size !== feats.length) {
  const seen = new Set<string>();
  const dup = feats.map((p) => String(p.adm1_code)).filter((c) => seen.has(c) || (seen.add(c), false));
  throw new Error(`adm1_code가 유일하지 않다(조인이 어긋난다): ${[...new Set(dup)].join(', ')}`);
}
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
