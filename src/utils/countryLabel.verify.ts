// src/utils/countryLabel.verify.ts — 국가명·대륙명 다국어 표(constants/countryNamesI18n.ts) 정합성.
//
// ⚠️ countryLabel()·continentLabel() 자체는 여기서 부르지 못한다. countryLabel.ts가
//    `../screens/MainScreen`(KO_TO_EN)을 import해서 노드에서 읽으면 react-native까지 끌려온다.
//    그래서 countryLabel이 쓰는 재료 — 표·한글명→ISO2(countryNameToIso2) — 만 검증한다.
//    언어 판정(isJapaneseLang 등)은 langKind.verify.ts가 따로 지킨다.
import { COUNTRIES } from '../constants/countries';
import { COUNTRY_NAMES_I18N, CONTINENT_NAMES_I18N, type CountryNameI18n } from '../constants/countryNamesI18n';
import { countryNameToIso2 } from './adCampaignSelect';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const COLS: (keyof CountryNameI18n)[] = ['ja', 'zhHant', 'es', 'fr'];
const isoOf = (term: string) => term.split(' ')[0].toUpperCase();
const allRows = [...Object.entries(COUNTRY_NAMES_I18N), ...Object.entries(CONTINENT_NAMES_I18N)];

// 1. COUNTRIES 전부가 표에 있고 4개 언어 칸이 비어 있지 않다 — 빠지면 그 나라만 영어로 떨어진다
const missing = COUNTRIES.filter((c) => {
  const row = COUNTRY_NAMES_I18N[isoOf(c.term)];
  return !row || COLS.some((k) => !row[k]?.trim());
}).map((c) => c.name);
eq(missing, [], `COUNTRIES ${COUNTRIES.length}개 전부 ja·zhHant·es·fr 값 존재`);
// 개수를 숫자로 박지 않는다 — 지시서는 199개라 했지만 실제는 198개였다. 표 행 수 = COUNTRIES 수만 지킨다
eq(Object.keys(COUNTRY_NAMES_I18N).length, COUNTRIES.length, '표 행 수 = COUNTRIES 수(중복·누락 없음)');

// 2. 표에만 있고 COUNTRIES에 없는 키 — ISO2 오타면 영영 안 쓰이는 죽은 행이 된다
const isoSet = new Set(COUNTRIES.map((c) => isoOf(c.term)));
eq(Object.keys(COUNTRY_NAMES_I18N).filter((k) => !isoSet.has(k)), [], '표의 키는 전부 COUNTRIES ISO2');

// 3. 한글 0 — 한글이 섞이면 "한국어 아닌 언어에 한글이 샌다"는 이 작업의 원래 버그가 재발한다
const hangul = allRows.flatMap(([k, row]) => COLS.filter((c) => /[가-힣ㄱ-ㆎ]/.test(row[c])).map((c) => `${k}.${c}`));
eq(hangul, [], '국가·대륙 표 어디에도 한글 없음');

// 4. zh-Hant 간체자·대륙 어휘 금지(zh-Hant.STYLE.md 2절) — 자주 틀리는 글자만 표본 검사
const SIMPLIFIED = /[国湾门罗亚尔兰马乌纳达维苏爱宾腊麦华联卢圣历时发陆细韩泽]/;
const simp = allRows.filter(([, row]) => SIMPLIFIED.test(row.zhHant)).map(([k, row]) => `${k}:${row.zhHant}`);
eq(simp, [], 'zhHant 값에 간체자 표본(国·湾·门·罗·亚·尔·兰·马…) 없음');
const MAINLAND = /澳大利|意大利|新西|老挝|肯尼|坦桑|沙特|也门|格鲁吉|克罗地|危地马/;
eq(allRows.filter(([, row]) => MAINLAND.test(row.zhHant)).map(([k]) => k), [], 'zhHant에 대륙식 국명(澳大利亞·意大利·新西蘭…) 없음');
eq([COUNTRY_NAMES_I18N.AU.zhHant, COUNTRY_NAMES_I18N.IT.zhHant, COUNTRY_NAMES_I18N.NZ.zhHant], ['澳洲', '義大利', '紐西蘭'], 'zhHant 대만식 대표값: 澳洲·義大利·紐西蘭');

// 5. fr 아포스트로피는 ’(U+2019) — fr.STYLE.md 2절. 곧은 ' 가 섞이면 검수에서 전량 반려된다
eq(allRows.filter(([, row]) => row.fr.includes("'")).map(([k]) => k), [], 'fr 값에 곧은 아포스트로피 없음');
eq(COUNTRY_NAMES_I18N.CI.fr, 'Côte d’Ivoire', 'fr 코트디부아르는 ’ 사용');

// 6. 민감 지명 — en(Taiwan·Hong Kong·Macau·Palestine·Kosovo)처럼 단독 중립 지명. 귀속·국호 표기 금지
const SENSITIVE = ['TW', 'HK', 'MO', 'PS', 'XK'];
const attributed = SENSITIVE.flatMap((k) => COLS.filter((c) => /中国|中國|中華|China|Chine|RAE|RAS|SAR|État|Estado|特別|特别/.test(COUNTRY_NAMES_I18N[k][c])).map((c) => `${k}.${c}`));
eq(attributed, [], '대만·홍콩·마카오·팔레스타인·코소보에 귀속·국호 표기 없음');
eq(COLS.map((c) => COUNTRY_NAMES_I18N.TW[c]), ['台湾', '台灣', 'Taiwán', 'Taïwan'], '대만 4개 언어');
eq(COLS.map((c) => COUNTRY_NAMES_I18N.HK[c]), ['香港', '香港', 'Hong Kong', 'Hong Kong'], '홍콩 4개 언어');

// 7. countryLabel이 밟는 경로: 한글명 → ISO2 → 칸
const via = (ko: string, col: keyof CountryNameI18n) => {
  const iso = countryNameToIso2(ko);
  return iso ? COUNTRY_NAMES_I18N[iso]?.[col] ?? null : null;
};
eq(via('미국', 'ja'), 'アメリカ', 'ja 미국 → アメリカ (정식 국호 아닌 일상 표기)');
eq(via('영국', 'ja'), 'イギリス', 'ja 영국 → イギリス');
eq(via('대한민국', 'ja'), '韓国', 'ja 대한민국 → 韓国');
eq(via('대한민국', 'zhHant'), '韓國', 'zhHant 대한민국 → 韓國');
eq(via('미국', 'zhHant'), '美國', 'zhHant 미국 → 美國');
eq(via('멕시코', 'es'), 'México', 'es 멕시코 → México');
eq(via('미국', 'es'), 'EE. UU.', 'es 미국 → EE. UU. (en U.S.A처럼 짧게)');
eq(via('독일', 'fr'), 'Allemagne', 'fr 독일 → Allemagne');
eq(via('보스니아 헤르체고비나', 'ja'), 'ボスニア・ヘルツェゴビナ', '공백 든 한글명도 ISO2로 찾음');
// 모르는 값은 null → countryLabel이 기존 영문 경로로 넘긴다(표에서 엉뚱한 값을 뽑지 않음)
eq(via('아틀란티스', 'ja'), null, '모르는 국가명 → null(영문 경로로)');
eq(via('', 'fr'), null, "빈 문자열 → null");

// 8. 대륙 7개 — CONTINENT_ORDER 6개 + 통합 '아메리카'
eq(Object.keys(CONTINENT_NAMES_I18N).sort(), ['남아메리카', '북아메리카', '아메리카', '아시아', '아프리카', '오세아니아', '유럽'].sort(), '대륙 7개 키');
const continentsUsed = [...new Set(COUNTRIES.map((c) => c.continent))].filter((k) => !CONTINENT_NAMES_I18N[k]);
eq(continentsUsed, [], 'COUNTRIES에 쓰인 대륙은 전부 표에 있음');
eq(CONTINENT_NAMES_I18N['아메리카'].ja, 'アメリカ大陸', 'ja 통합 아메리카는 미국(アメリカ)과 구분되는 アメリカ大陸');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
