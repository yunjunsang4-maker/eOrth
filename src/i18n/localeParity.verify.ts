// ko/en/ja 번역 리소스 정합성 검증 (jest 미사용).
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

// ─── 4) ja 의 모든 키가 ko 에 있는가 ───
// ja 는 DeepPartial 타입이라 빠진 키는 허용되지만, **없는 키를 새로 만드는 것은 허용되지 않아야**
// 한다. 오타(`comon.next`)나 삭제된 키의 고아 번역은 타입에서 걸리지 않고 조용히 죽은 값이 된다.
{
  const orphan = Object.keys(jaFlat).filter(k => !(k in koFlat));
  if (orphan.length) {
    fail(`ko.ts 에 없는 ja 키 ${orphan.length}개 — 오타이거나 삭제된 키의 고아 번역이다`);
    for (const k of orphan.slice(0, 40)) console.error(`      ${k} = ${JSON.stringify(jaFlat[k])}`);
    if (orphan.length > 40) console.error(`      … 외 ${orphan.length - 40}개`);
  } else {
    ok(`ja 키 ${Object.keys(jaFlat).length}개가 모두 ko 에 존재`);
  }
}

// ─── 5) ja 값에 한글이 섞여 있지 않은가 ───
// ko 문구를 복사해 두고 번역을 잊은 흔적을 잡는다(en 과 같은 검사, 허용 목록만 다르다).
// HANGUL 정규식은 한글 자모·음절만 본다 — 한자(漢字)·가나는 걸리지 않으므로 ja 값에 그대로 쓴다.
const JA_HANGUL_ALLOWED = new Set<string>([
  'settings.langKo', // 언어 선택지의 '한국어' — 자기 언어로 적는 것이 관례다
]);
{
  const leaked = Object.entries(jaFlat)
    .filter(([k, v]) => HANGUL.test(v) && !JA_HANGUL_ALLOWED.has(k));
  if (leaked.length) {
    fail(`ja 값에 한글이 남은 키 ${leaked.length}개 (번역 누락이거나 복사 흔적)`);
    for (const [k, v] of leaked.slice(0, 40)) console.error(`      ${k} = ${JSON.stringify(v)}`);
    if (leaked.length > 40) console.error(`      … 외 ${leaked.length - 40}개`);
  } else {
    ok(`ja 값 ${Object.keys(jaFlat).length}개에 한글 없음 (허용 ${JA_HANGUL_ALLOWED.size}개 제외)`);
  }
  // 허용 목록 썩음 방지 — en 쪽 3)번과 같은 이유다(키가 사라졌는데 허용만 남으면 조용히 통과).
  const stale = [...JA_HANGUL_ALLOWED].filter(k => !(k in jaFlat) || !HANGUL.test(jaFlat[k]));
  if (stale.length) fail(`ja 한글 허용 목록에 죽은 항목: ${stale.join(', ')}`);
  else ok('ja 한글 허용 목록이 실제 키와 일치');
}

// ─── 6) ja 커버리지 보고 (실패 아님) ───
// ja 는 아직 부분 번역이고, 빠진 키는 i18n fallbackLng(ja → en → ko)가 영어로 메운다.
// 그래서 ko 대비 누락을 실패로 다루면 npm test 가 계속 빨갛게 되어 진짜 실패를 가린다.
// ⚠️ 완역 후에는 이 블록을 위 1)번(ko→en)과 같은 형태의 **실패 조건으로 승격**할 것.
//    동시에 i18n/index.ts 의 SELECTABLE_LANGUAGES __DEV__ 게이트도 함께 걷어낸다.
{
  const koCount = Object.keys(koFlat).length;
  const jaCount = Object.keys(jaFlat).filter(k => k in koFlat).length;
  const pct = koCount ? Math.round((jaCount / koCount) * 1000) / 10 : 0;
  console.log(`  · ja 커버리지: ${jaCount} / ${koCount} (${pct}%) — 부분 번역이라 실패로 세지 않는다`);
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
