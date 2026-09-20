// ko/en/ja/zh-Hant/es/es-ES 번역 리소스 정합성 검증 (jest 미사용).
// 실행: node node_modules/tsx/dist/cli.mjs src/i18n/localeParity.verify.ts
//
// i18n 은 fallbackLng: 'ko' 다(index.ts 주석 참고 — badge.* 때문에 바꾸면 회귀).
// 그래서 en.ts 에 키를 빠뜨려도 런타임은 조용히 한국어를 내보낸다. 그 사고를 여기서 잡는다.
//
// 주의: locales/*.ts 를 직접 import 한다. src/i18n/index.ts 를 import 하면 expo-localization
// 이 딸려와 노드 실행이 죽는다. ko/en 은 import 없는 순수 `as const` 객체라 그대로 읽힌다.
// constants/currencies 는 countries → countryDisplay 까지 전부 의존성 없는 순수 상수라
// 여기서 그대로 읽힌다(실측). 목록을 복사해 두면 추가 방향에서 이 검증이 무력해진다.
import ko from './locales/ko';
import en from './locales/en';
import ja from './locales/ja';
import zhHant from './locales/zh-Hant';
import es from './locales/es';
import esES from './locales/es-ES';
import { OTHER_CURRENCIES } from '../constants/currencies';

let failed = 0;
function fail(msg: string) { failed++; console.error(`  ✗ ${msg}`); }
function ok(msg: string) { console.log(`  ✓ ${msg}`); }

type Tree = Record<string, unknown>;

/** 중첩 객체를 'a.b.c' → 값 으로 평탄화. 값은 전부 문자열인 리소스 구조를 전제한다. */
function flatten(node: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (typeof node === 'string') { out[prefix] = node; return out; }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Tree)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

const koFlat = flatten(ko);
const enFlat = flatten(en);
const jaFlat = flatten(ja);
const zhHantFlat = flatten(zhHant);
const esFlat = flatten(es);
const esESFlat = flatten(esES);

// i18next 복수형 접미사. 스페인어는 `clave_one` / `clave_other` 두 벌로 적으므로 ko 대조·커버리지
// 계산에서는 접미사를 벗긴 **기본 키**로 센다(벗기지 않으면 복수형 키가 전부 고아로 잡힌다).
// ⚠️ ko.ts 에 이 접미사로 끝나는 키가 생기면 잘못 벗겨진다 — 현재 0개인 것을 확인했고,
//    생기면 여기서 예외를 두는 대신 ko 쪽 키 이름을 바꾸는 편이 낫다.
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const baseKey = (k: string) => k.replace(PLURAL_SUFFIX, '');

// 부분 번역 언어 목록. 아래 4)·5)·6) 검사가 이 목록을 순회하므로, 부분 번역 언어를 더할 때
// 검사 블록을 복사하지 말고 여기 한 줄만 추가한다(복사하면 한쪽만 고쳐지는 사고가 난다).
// ⚠️ 'es' 는 두 변형(es-419 · es-ES)의 **공통 기반** 리소스다. 여기 도는 것은 그 기반 하나뿐이고,
//    덮어쓰기(es-ES.ts)는 커버리지 대상이 아니라 아래 5-3) 이 따로 본다(작아야 정상이라 %가 무의미).
const PARTIAL_LANGS = [
  ['ja', jaFlat],
  ['zh-Hant', zhHantFlat],
  ['es', esFlat],
] as const;

// ─── 1) ko 의 모든 키가 en 에 있는가 ───
// 반대 방향(en 에만 있는 키)은 실패로 다루지 않는다. badge.* 는 en 전용이 설계다 —
// 한국어 원문은 constants/badges.ts 상수가 단일 출처이고 ko.ts 에는 두지 않는다.
{
  const missing = Object.keys(koFlat).filter(k => !(k in enFlat));
  if (missing.length) {
    fail(`en.ts 에 없는 키 ${missing.length}개 — 영어 모드에서 한글이 샌다`);
    for (const k of missing.slice(0, 40)) console.error(`      ${k} = ${JSON.stringify(koFlat[k])}`);
    if (missing.length > 40) console.error(`      … 외 ${missing.length - 40}개`);
  } else {
    ok(`ko 키 ${Object.keys(koFlat).length}개가 모두 en 에 존재`);
  }
}

// i18next 복수형 접미사(_one/_other 등)는 ko 에 짝이 없는 것이 정상이다.
// ko 는 복수형이 없어 기본 키 하나로 끝나기 때문. en 전용 키는 애초에 검사하지 않으므로
// 여기서 따로 걸러낼 필요는 없고, 이 주석은 "왜 안 세는지"를 남기기 위한 것이다.

// ─── 2) en 값에 한글이 섞여 있지 않은가 ───
// 번역을 안 한 채 ko 문구를 복사해 온 흔적을 잡는다.
// 의도적으로 한글인 키만 명시적으로 허용한다 — 늘리기 전에 정말 번역 불가인지 따져볼 것.
const HANGUL = /[ㄱ-ㆎ가-힣]/;
const EN_HANGUL_ALLOWED = new Set<string>([
  'settings.langKo', // 언어 선택지의 '한국어' — 자기 언어로 적는 것이 관례다
]);
{
  const leaked = Object.entries(enFlat)
    .filter(([k, v]) => HANGUL.test(v) && !EN_HANGUL_ALLOWED.has(k));
  if (leaked.length) {
    fail(`en 값에 한글이 남은 키 ${leaked.length}개 (허용 목록에 넣을 게 아니면 번역할 것)`);
    for (const [k, v] of leaked.slice(0, 40)) console.error(`      ${k} = ${JSON.stringify(v)}`);
    if (leaked.length > 40) console.error(`      … 외 ${leaked.length - 40}개`);
  } else {
    ok(`en 값 ${Object.keys(enFlat).length}개에 한글 없음 (허용 ${EN_HANGUL_ALLOWED.size}개 제외)`);
  }
}

// ─── 3) 허용 목록이 썩지 않았는가 ───
// 키가 사라졌는데 허용 목록만 남으면, 다음에 같은 이름의 키가 생겼을 때 조용히 통과한다.
{
  const stale = [...EN_HANGUL_ALLOWED].filter(k => !(k in enFlat) || !HANGUL.test(enFlat[k]));
  if (stale.length) fail(`한글 허용 목록에 죽은 항목: ${stale.join(', ')}`);
  else ok('한글 허용 목록이 실제 키와 일치');
}

// ─── 4) 부분 번역 언어의 모든 키가 ko 에 있는가 ───
// 부분 번역은 DeepPartial 타입이라 빠진 키는 허용되지만, **없는 키를 새로 만드는 것은 허용되지
// 않아야** 한다. 오타(`comon.next`)나 삭제된 키의 고아 번역은 타입에서 걸리지 않고 조용히
// 죽은 값이 된다.
// 복수형 접미사(`_one`/`_other` …)는 벗긴 기본 키로 대조한다 — ko 에는 복수형이 없어
// 접미사 붙은 짝이 애초에 존재하지 않는다.
for (const [lang, flat] of PARTIAL_LANGS) {
  const orphan = Object.keys(flat).filter(k => !(baseKey(k) in koFlat));
  if (orphan.length) {
    fail(`ko.ts 에 없는 ${lang} 키 ${orphan.length}개 — 오타이거나 삭제된 키의 고아 번역이다`);
    for (const k of orphan.slice(0, 40)) console.error(`      ${k} = ${JSON.stringify(flat[k])}`);
    if (orphan.length > 40) console.error(`      … 외 ${orphan.length - 40}개`);
  } else {
    ok(`${lang} 키 ${Object.keys(flat).length}개가 모두 ko 에 존재`);
  }
}

// ─── 5) 부분 번역 언어 값에 한글이 섞여 있지 않은가 ───
// ko 문구를 복사해 두고 번역을 잊은 흔적을 잡는다(en 과 같은 검사, 허용 목록만 다르다).
// HANGUL 정규식은 한글 자모·음절만 본다 — 한자(漢字)·가나는 걸리지 않으므로 값에 그대로 쓴다.
// 허용은 언어마다 `settings.langKo`(언어 선택지의 '한국어') 하나뿐이다.
const PARTIAL_HANGUL_ALLOWED = new Set<string>([
  'settings.langKo', // 언어 선택지의 '한국어' — 자기 언어로 적는 것이 관례다
]);
for (const [lang, flat] of PARTIAL_LANGS) {
  const leaked = Object.entries(flat)
    .filter(([k, v]) => HANGUL.test(v) && !PARTIAL_HANGUL_ALLOWED.has(k));
  if (leaked.length) {
    fail(`${lang} 값에 한글이 남은 키 ${leaked.length}개 (번역 누락이거나 복사 흔적)`);
    for (const [k, v] of leaked.slice(0, 40)) console.error(`      ${k} = ${JSON.stringify(v)}`);
    if (leaked.length > 40) console.error(`      … 외 ${leaked.length - 40}개`);
  } else {
    ok(`${lang} 값 ${Object.keys(flat).length}개에 한글 없음 (허용 ${PARTIAL_HANGUL_ALLOWED.size}개 제외)`);
  }
  // 허용 목록 썩음 방지 — en 쪽 3)번과 같은 이유다(키가 사라졌는데 허용만 남으면 조용히 통과).
  const stale = [...PARTIAL_HANGUL_ALLOWED].filter(k => !(k in flat) || !HANGUL.test(flat[k]));
  if (stale.length) fail(`${lang} 한글 허용 목록에 죽은 항목: ${stale.join(', ')}`);
  else ok(`${lang} 한글 허용 목록이 실제 키와 일치`);
}

// ─── 5-1) zh-Hant 값에 간체자가 섞여 있지 않은가 ───
// 번체(대만) 전용 리소스인데 간체자가 들어가면 대만 사용자에게 대륙 표기가 나간다.
// 타입·폴백은 이걸 못 잡고, 검수자가 아니면 눈으로도 잘 안 보인다(글자 하나 차이).
//
// ⚠️ **완전한 간체 판별이 아니라 흔한 실수 방지용**이다. 간체자는 2,000자가 넘고 그중에는
//    번체와 자형이 같은 글자도 많아 기계적 전수 판별은 사전 없이는 불가능하다. 여기 목록은
//    zh-Hant.STYLE.md 2절이 지목한 것 + 앱 UI 문구에서 실제로 자주 튀는 글자만 모았다.
//    통과했다고 번체임이 보증되지 않는다 — 현지인 검수는 그대로 필요하다.
const SIMPLIFIED_CHARS = new Set<string>([
  // STYLE.md 2절이 직접 지목한 것 (國 設 錄 會 數 與 從 這 個 時)
  '国', '设', '录', '会', '数', '与', '从', '这', '个', '时',
  // UI 문구에서 자주 튀는 것 (麼 為 們 門 間 來 說 對 應 發 讓 見 過 還 進 現 開 關 點 長 樣 認 請 電 網 頁 圖 號 語 義)
  '么', '为', '们', '门', '间', '来', '说', '对', '应', '发',
  // '后'는 뺐다 — 번체에서도 皇后·太后로 살아 있는 정자라 오탐이 난다
  '让', '见', '过', '还', '进', '现', '开', '关', '点',
  '长', '样', '认', '请', '电', '网', '页', '图', '号', '语', '义',
  // 앱 용어집(STYLE 3절)과 직결된 것 (儲 選 擇 標 記 種 顯 動 態 傳 學 屬 錢 幣)
  '储', '选', '择', '标', '记', '种', '显', '动', '态', '传', '学', '属', '钱', '币',
]);
{
  const hits: Array<[string, string, string]> = [];
  for (const [k, v] of Object.entries(zhHantFlat)) {
    for (const ch of v) if (SIMPLIFIED_CHARS.has(ch)) { hits.push([k, v, ch]); break; }
  }
  if (hits.length) {
    fail(`zh-Hant 값에 간체자가 섞인 키 ${hits.length}개 — 대만 표기가 아니다(zh-Hant.STYLE.md 2절)`);
    for (const [k, v, ch] of hits.slice(0, 40)) console.error(`      ${k} = ${JSON.stringify(v)}  ← '${ch}'`);
    if (hits.length > 40) console.error(`      … 외 ${hits.length - 40}개`);
  } else {
    ok(`zh-Hant 값에 흔한 간체자 ${SIMPLIFIED_CHARS.size}자 없음 (전수 판별 아님 — 위 주석 참고)`);
  }
}

// ─── 5-2) 스페인어 복수형이 두 벌로 갖춰져 있는가 ───
// 스페인어는 ko/ja/zh 와 달리 단수·복수 형태가 다르다. i18next 접미사(`clave_one`/`clave_other`)로
// 두 벌을 적지 않으면 「1 viajes」(1개인데 복수형)가 그대로 화면에 나간다. 타입은 못 잡는다 —
// es.ts 의 WithPlurals 타입은 접미사 키를 **허용**할 뿐 짝을 강제하지 않는다.
//
// 검사 두 가지:
//   (a) `_one` 이 있으면 `_other` 도, 그 반대도 있어야 한다.
//   (b) `{{count}}` 가 든 키가 접미사 없이 단독으로 있으면 실패 — 수량 명사가 붙는 자리인데
//       한 벌만 적은 흔적이다. 단 수량 명사 없이 `+{{count}}` 처럼만 쓰는 키는 예외다.
const ES_COUNT_BARE_ALLOWED = new Set<string>([
  // '{{place}} +{{count}}' — 「파리 +3」처럼 명사 없이 숫자만 덧붙인다. 복수형이 필요 없다
  'main.countrySheetMorePlaces',
]);
{
  const ones = new Set(Object.keys(esFlat).filter(k => k.endsWith('_one')).map(k => k.slice(0, -4)));
  const others = new Set(Object.keys(esFlat).filter(k => k.endsWith('_other')).map(k => k.slice(0, -6)));
  const lonely = [
    ...[...ones].filter(b => !others.has(b)).map(b => `${b}_one (짝 _other 없음)`),
    ...[...others].filter(b => !ones.has(b)).map(b => `${b}_other (짝 _one 없음)`),
  ];
  if (lonely.length) {
    fail(`es 복수형 짝이 빠진 키 ${lonely.length}개 — 「1 viajes」가 화면에 나간다`);
    for (const m of lonely.slice(0, 40)) console.error(`      ${m}`);
  } else {
    ok(`es 복수형 ${ones.size}쌍이 _one/_other 두 벌 모두 존재`);
  }

  const bare = Object.entries(esFlat)
    .filter(([k, v]) => !PLURAL_SUFFIX.test(k) && v.includes('{{count}}') && !ES_COUNT_BARE_ALLOWED.has(k));
  if (bare.length) {
    fail(`es 에 {{count}} 가 든 단수/복수 미분리 키 ${bare.length}개 — _one/_other 두 벌로 나누거나 ES_COUNT_BARE_ALLOWED 에 넣을 것`);
    for (const [k, v] of bare.slice(0, 40)) console.error(`      ${k} = ${JSON.stringify(v)}`);
  } else {
    ok(`es 의 {{count}} 키가 모두 복수형 두 벌 (허용 ${ES_COUNT_BARE_ALLOWED.size}개 제외)`);
  }

  // 허용 목록 썩음 방지 — 3)·5) 와 같은 이유(키가 사라졌는데 허용만 남으면 다음에 같은 이름이
  // 생겼을 때 조용히 통과한다).
  const stale = [...ES_COUNT_BARE_ALLOWED]
    .filter(k => !(k in esFlat) || !esFlat[k].includes('{{count}}') || PLURAL_SUFFIX.test(k));
  if (stale.length) fail(`es {{count}} 허용 목록에 죽은 항목: ${stale.join(', ')}`);
  else ok('es {{count}} 허용 목록이 실제 키와 일치');
}

// ─── 5-3) es-ES(스페인식 덮어쓰기)가 es.ts 에 없는 키를 갖고 있지 않은가 ───
// es-ES.ts 는 es.ts 를 덮어쓰는 용도라 **es.ts 에 있는 키만** 가져야 한다. 여기 없는 키를 적으면
// 계층(es-ES → es → en)에서 es 를 못 덮고 혼자 떠 있는 죽은 값이 된다(타입은 DeepPartial<typeof es>
// 라 잡아 주지만, 복수형 접미사 키는 es 쪽 WithPlurals 를 타고 들어와 느슨해질 수 있다).
// 접미사를 **벗기지 않고 그대로** 대조한다 — `regionTagChip_one` 을 덮어쓰려면 es 에도 그 접미사
// 키가 똑같이 있어야 실제로 덮인다.
//
// ⚠️ 커버리지는 보고하지 않는다. 덮어쓰기는 차이 나는 키만 두는 것이 정상이라 %가 작을수록 옳다.
//    (es.STYLE.md 4절 차이표가 단일 출처 — 표에 없는 키를 es-ES.ts 에 넣지 않는다.)
{
  const orphan = Object.keys(esESFlat).filter(k => !(k in esFlat));
  if (orphan.length) {
    fail(`es.ts 에 없는 es-ES 키 ${orphan.length}개 — 덮어쓸 대상이 없어 죽은 값이다`);
    for (const k of orphan.slice(0, 40)) console.error(`      ${k} = ${JSON.stringify(esESFlat[k])}`);
  } else {
    ok(`es-ES 키 ${Object.keys(esESFlat).length}개가 모두 es 에 존재 (덮어쓰기라 커버리지는 안 센다)`);
  }
}

// ─── 6) 부분 번역 언어 커버리지 보고 (실패 아님) ───
// 빠진 키는 i18n fallbackLng(→ en → ko)가 영어로 메운다. 그래서 ko 대비 누락을 실패로 다루면
// npm test 가 계속 빨갛게 되어 진짜 실패를 가린다.
// ⚠️ 완역 후에는 그 언어를 위 1)번(ko→en)과 같은 형태의 **실패 조건으로 승격**할 것.
//    동시에 i18n/index.ts 의 SELECTABLE_LANGUAGES __DEV__ 게이트에서도 그 언어를 꺼낸다.
{
  const koCount = Object.keys(koFlat).length;
  for (const [lang, flat] of PARTIAL_LANGS) {
    // 복수형 두 벌(_one/_other)을 2개로 세면 커버리지가 부풀어 오른다 → 기본 키로 접어 중복 제거
    const n = new Set(Object.keys(flat).map(baseKey).filter(k => k in koFlat)).size;
    const pct = koCount ? Math.round((n / koCount) * 1000) / 10 : 0;
    console.log(`  · ${lang} 커버리지: ${n} / ${koCount} (${pct}%) — 부분 번역이라 실패로 세지 않는다`);
  }
}

// ─── 7) 통화 이름 키가 목록과 짝이 맞는가 ───
// constants/currencies.ts 의 코드 목록은 여기 키가 없으면 코드(EUR)만 덩그러니 보인다.
// ⚠️ 목록을 여기 복사하지 말 것 — 사본을 두면 currencies.ts 에 통화를 추가하고 ko/en 키를
//    빠뜨렸을 때 사본은 그대로라 이 검증이 조용히 통과한다(추가 방향에서 무력화).
const CURRENCY_CODES = OTHER_CURRENCIES;
{
  for (const [name, flat] of [['ko', koFlat], ['en', enFlat]] as const) {
    const missing = CURRENCY_CODES.filter(c => !(`currency.${c}` in flat));
    if (missing.length) fail(`${name}.ts 에 없는 통화 이름: ${missing.join(', ')}`);
    else ok(`${name}.ts 에 통화 이름 ${CURRENCY_CODES.length}개 모두 존재`);
  }
  const extra = Object.keys(koFlat)
    .filter(k => k.startsWith('currency.'))
    .map(k => k.slice('currency.'.length))
    .filter(c => !CURRENCY_CODES.includes(c));
  if (extra.length) fail(`constants/currencies.ts 목록에 없는 통화 키: ${extra.join(', ')}`);
  else ok('통화 키에 목록 밖 항목 없음');
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
