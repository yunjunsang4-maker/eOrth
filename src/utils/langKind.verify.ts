// 언어 계열 판정 검증 (jest 미사용).
// 실행: node node_modules/tsx/dist/cli.mjs src/utils/langKind.verify.ts
//
// 이 두 함수가 뒤집히면 국가명·지역명·프레임명·약관 링크가 통째로 반대 언어로 나간다.
// 특히 널 계열이 ko로 떨어지는 규약이 중요하다 — i18next 초기화 전에는 language가
// undefined이고, 그때 영어로 떨어지면 한국어 사용자가 첫 프레임에 영문을 본다.
import { isKoreanLang, isJapaneseLang, isTraditionalChineseLang } from './langKind';

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

// 세 함수가 동시에 true인 값은 없어야 한다(4분기 코드의 전제)
for (const l of ['ko', 'ko-KR', 'en', 'ja', 'ja-JP', 'zh-Hant', 'zh-TW', 'zh-CN', '', 'fr']) {
  const hits = [isKoreanLang(l), isJapaneseLang(l), isTraditionalChineseLang(l)].filter(Boolean).length;
  eq(hits <= 1, true, `배타성: '${l}'은 ko·ja·zh-Hant 중 둘 이상 참이 아님`);
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
