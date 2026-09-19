// 언어 계열 판정 검증 (jest 미사용).
// 실행: node node_modules/tsx/dist/cli.mjs src/utils/langKind.verify.ts
//
// 이 두 함수가 뒤집히면 국가명·지역명·프레임명·약관 링크가 통째로 반대 언어로 나간다.
// 특히 널 계열이 ko로 떨어지는 규약이 중요하다 — i18next 초기화 전에는 language가
// undefined이고, 그때 영어로 떨어지면 한국어 사용자가 첫 프레임에 영문을 본다.
import { isKoreanLang, isJapaneseLang } from './langKind';

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

// 두 함수가 동시에 true인 값은 없어야 한다(3분기 코드의 전제)
for (const l of ['ko', 'ko-KR', 'en', 'ja', 'ja-JP', '', 'fr']) {
  eq(isKoreanLang(l) && isJapaneseLang(l), false, `배타성: '${l}'은 ko·ja 동시 참이 아님`);
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
