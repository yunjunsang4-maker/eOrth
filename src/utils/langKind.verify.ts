// 언어 계열 판정 검증 (jest 미사용).
// 실행: node node_modules/tsx/dist/cli.mjs src/utils/langKind.verify.ts
//
// 이 두 함수가 뒤집히면 국가명·지역명·프레임명·약관 링크가 통째로 반대 언어로 나간다.
// 특히 널 계열이 ko로 떨어지는 규약이 중요하다 — i18next 초기화 전에는 language가
// undefined이고, 그때 영어로 떨어지면 한국어 사용자가 첫 프레임에 영문을 본다.
import { isKoreanLang, isJapaneseLang, isTraditionalChineseLang, spanishVariant } from './langKind';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// ─── isKoreanLang ───
// 정상 경로
eq(isKoreanLang('ko'), true, 'isKoreanLang: ko → true');
// 지역 태그가 붙은 형태. i18n.language는 항상 2글자가 아니다
eq(isKoreanLang('ko-KR'), true, 'isKoreanLang: ko-KR → true (지역 태그 포함)');
// 표기 흔들림 — 대문자로 오는 값(수동 저장본·서버 값)도 같게 봐야 한다
eq(isKoreanLang('KO'), true, 'isKoreanLang: KO → true (대문자 흔들림)');

eq(isKoreanLang('en'), false, 'isKoreanLang: en → false');
eq(isKoreanLang('en-US'), false, 'isKoreanLang: en-US → false');
eq(isKoreanLang('ja'), false, 'isKoreanLang: ja → false — 여기가 뒤집히면 일본어 사용자가 한글을 본다');
eq(isKoreanLang('ja-JP'), false, 'isKoreanLang: ja-JP → false');
// zh-Hant 도 비한국어 = 영어 경로다(의도). 이게 true 가 되면 대만 사용자가 한글을 본다
eq(isKoreanLang('zh-Hant'), false, 'isKoreanLang: zh-Hant → false — 번체는 영어 경로');

// 널 계열 셋을 각각 본다 — 뭉뚱그리면 하나만 통과해도 초기화 전 경로가 깨진다
eq(isKoreanLang(undefined), true, 'isKoreanLang: undefined → true (초기화 전 기본 ko)');
eq(isKoreanLang(null), true, 'isKoreanLang: null → true (초기화 전 기본 ko)');
eq(isKoreanLang(''), true, 'isKoreanLang: 빈 문자열 → true (초기화 전 기본 ko)');

// ─── isJapaneseLang ───
eq(isJapaneseLang('ja'), true, 'isJapaneseLang: ja → true');
eq(isJapaneseLang('ja-JP'), true, 'isJapaneseLang: ja-JP → true');
eq(isJapaneseLang('JA'), true, 'isJapaneseLang: JA → true (대문자 흔들림)');

eq(isJapaneseLang('ko'), false, 'isJapaneseLang: ko → false');
eq(isJapaneseLang('en'), false, 'isJapaneseLang: en → false');
// 널 계열은 ko 기본이므로 일본어가 아니다 — isKoreanLang과 달리 false 쪽으로 떨어진다
eq(isJapaneseLang(''), false, 'isJapaneseLang: 빈 문자열 → false');
eq(isJapaneseLang(undefined), false, 'isJapaneseLang: undefined → false');
eq(isJapaneseLang(null), false, 'isJapaneseLang: null → false');

// ─── isTraditionalChineseLang ───
// 앱의 언어 코드. 이 값이 false 면 번체 전용 표기(上午/下午, {y}年{m}月{d}日)가 통째로 안 나온다
eq(isTraditionalChineseLang('zh-Hant'), true, 'isTraditionalChineseLang: zh-Hant → true (앱 언어 코드)');
// 기기·서버에서 올 수 있는 변형들. 번체를 쓰는 지역은 대만·홍콩·마카오다
eq(isTraditionalChineseLang('zh-TW'), true, 'isTraditionalChineseLang: zh-TW → true (대만)');
eq(isTraditionalChineseLang('zh-HK'), true, 'isTraditionalChineseLang: zh-HK → true (홍콩)');
eq(isTraditionalChineseLang('zh-MO'), true, 'isTraditionalChineseLang: zh-MO → true (마카오)');
eq(isTraditionalChineseLang('zh-Hant-TW'), true, 'isTraditionalChineseLang: zh-Hant-TW → true (스크립트+지역)');
// 표기 흔들림 — 소문자/대문자로 오는 값도 같게 봐야 한다
eq(isTraditionalChineseLang('zh-hant'), true, 'isTraditionalChineseLang: zh-hant → true (소문자 흔들림)');
eq(isTraditionalChineseLang('ZH-HANT'), true, 'isTraditionalChineseLang: ZH-HANT → true (대문자 흔들림)');

// ⚠️ 간체는 별도 언어다(아직 미지원). true 로 잡으면 간체 사용자에게 번체가 나간다
eq(isTraditionalChineseLang('zh'), false, 'isTraditionalChineseLang: zh → false (번체로 단정 불가)');
eq(isTraditionalChineseLang('zh-CN'), false, 'isTraditionalChineseLang: zh-CN → false (간체)');
eq(isTraditionalChineseLang('zh-Hans'), false, 'isTraditionalChineseLang: zh-Hans → false (간체 스크립트)');
eq(isTraditionalChineseLang('zh-Hans-CN'), false, 'isTraditionalChineseLang: zh-Hans-CN → false (간체)');
eq(isTraditionalChineseLang('zh-SG'), false, 'isTraditionalChineseLang: zh-SG → false (싱가포르는 간체)');

eq(isTraditionalChineseLang('ko'), false, 'isTraditionalChineseLang: ko → false');
eq(isTraditionalChineseLang('ja'), false, 'isTraditionalChineseLang: ja → false');
eq(isTraditionalChineseLang('en'), false, 'isTraditionalChineseLang: en → false');
// 널 계열 — ko 기본이므로 번체가 아니다(isJapaneseLang 과 같은 쪽)
eq(isTraditionalChineseLang(''), false, 'isTraditionalChineseLang: 빈 문자열 → false');
eq(isTraditionalChineseLang(undefined), false, 'isTraditionalChineseLang: undefined → false');
eq(isTraditionalChineseLang(null), false, 'isTraditionalChineseLang: null → false');


// ─── spanishVariant ───
// 앱의 두 언어 코드. 이 둘이 뒤집히면 스페인 사용자가 12시간 표기를, 중남미 사용자가 24시간을 본다
eq(spanishVariant('es-ES'), 'ES', "spanishVariant: es-ES → 'ES' (앱 언어 코드 · 스페인식)");
eq(spanishVariant('es-419'), '419', "spanishVariant: es-419 → '419' (앱 언어 코드 · 중남미 중립형)");
// 표기 흔들림 — 저장본·서버 값이 소문자/대문자로 올 수 있다
eq(spanishVariant('es-es'), 'ES', "spanishVariant: es-es → 'ES' (소문자 흔들림)");
eq(spanishVariant('ES-ES'), 'ES', "spanishVariant: ES-ES → 'ES' (대문자 흔들림)");
eq(spanishVariant('ES-419'), '419', "spanishVariant: ES-419 → '419' (대문자 흔들림)");
// 스크립트 서브태그가 끼어도 지역이 ES 면 스페인식
eq(spanishVariant('es-Latn-ES'), 'ES', "spanishVariant: es-Latn-ES → 'ES' (스크립트 끼움)");

// ⚠️ 기본값은 '419'다 — es.ts(중남미 중립형)가 공통 기반이라 리소스 계층과 같은 방향이다.
// 여기가 'ES'로 뒤집히면 지역 없는 'es' 사용자 전원이 24시간 표기를 본다
eq(spanishVariant('es'), '419', "spanishVariant: es → '419' (지역 없음 = 공통 기반)");
eq(spanishVariant('es-MX'), '419', "spanishVariant: es-MX → '419' (멕시코)");
eq(spanishVariant('es-AR'), '419', "spanishVariant: es-AR → '419' (아르헨티나)");
eq(spanishVariant('es-US'), '419', "spanishVariant: es-US → '419' (미국 내 스페인어)");

// 스페인어가 아니면 null. 기본값('419')으로 떨어지면 영어 사용자가 스페인어 표기를 본다
eq(spanishVariant('ko'), null, 'spanishVariant: ko → null');
eq(spanishVariant('en'), null, 'spanishVariant: en → null');
eq(spanishVariant('en-ES'), null, 'spanishVariant: en-ES → null (스페인에서 쓰는 영어)');
// 첫 서브태그가 정확히 'es'일 때만 — startsWith('es')로 적으면 이것들이 스페인어로 잡힌다
eq(spanishVariant('est'), null, "spanishVariant: est → null (startsWith('es') 오탐 방지)");
eq(spanishVariant('eo'), null, 'spanishVariant: eo → null (에스페란토)');
// 널 계열 — ko 기본이므로 스페인어가 아니다(isJapaneseLang 과 같은 쪽)
eq(spanishVariant(''), null, 'spanishVariant: 빈 문자열 → null');
eq(spanishVariant(undefined), null, 'spanishVariant: undefined → null');
eq(spanishVariant(null), null, 'spanishVariant: null → null');

// 네 판정이 동시에 걸리는 값은 없어야 한다(다분기 코드의 전제).
// spanishVariant 는 boolean 이 아니라 null 여부로 센다.
for (const l of ['ko', 'ko-KR', 'en', 'ja', 'ja-JP', 'zh-Hant', 'zh-TW', 'zh-CN', 'es-419', 'es-ES', '', 'fr']) {
  const hits = [isKoreanLang(l), isJapaneseLang(l), isTraditionalChineseLang(l), spanishVariant(l) !== null]
    .filter(Boolean).length;
  eq(hits <= 1, true, `배타성: '${l}'은 ko·ja·zh-Hant·es 중 둘 이상 참이 아님`);
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
