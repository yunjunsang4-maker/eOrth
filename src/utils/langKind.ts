// 언어 계열 판정 — 이 파일은 import 0(순수)을 유지할 것. 검증(langKind.verify.ts)이 노드에서
// 직접 읽고, 표시 유틸(countryLabel·regionLabel·cutFrames 등)이 전부 여기에 의존한다.
//
// 왜 "en인가?"가 아니라 "ko인가?"로 묻는가 —
// 앱이 ko/en 2개였던 시절 코드는 `lang !== 'en' ? 한국어 : 영어` 로 적혀 있었다.
// 세 번째 언어(ja)가 들어오면 그 식은 **일본어 사용자에게 한국어를 내보낸다.**
// 데이터 원본이 한글이라 "한국어일 때만 원본, 그 외는 전부 영어 경로"가 맞는 기본값이다.
// (ja 전용 표기는 ja.ts 키가 담당하고, 키가 없으면 i18next 폴백이 en을 준다.)

/**
 * i18n.language('ko' | 'ko-KR' | 'en-US' | 'ja' …)가 한국어 계열인지.
 * 비어 있으면 한국어로 본다(초기화 전 = ko 기본).
 */
export const isKoreanLang = (lang?: string | null): boolean =>
  !lang || String(lang).toLowerCase().startsWith('ko');

/**
 * 일본어 계열인지. ja 전용 표기(날짜 `{y}年{m}月`, 시각 `午前/午後`)가 있는 곳에서만 쓴다.
 * 대부분의 분기는 isKoreanLang 하나로 충분하다 — 3분기를 늘리지 말 것.
 */
export const isJapaneseLang = (lang?: string | null): boolean =>
  !!lang && String(lang).toLowerCase().startsWith('ja');

/**
 * 번체 중국어(대만·홍콩·마카오) 계열인지. `'zh-Hant'`가 앱의 언어 코드이고,
 * 기기·서버에서 `'zh-TW'`/`'zh-HK'`/`'zh-Hant-TW'` 같은 변형이 들어와도 같게 본다.
 *
 * ⚠️ 간체(`'zh'`·`'zh-CN'`·`'zh-Hans'`·`'zh-SG'`)는 **false**다. 번체와 간체는 글자와 어휘가
 *    모두 달라 별도 언어로 다루며(zh-Hant.STYLE.md 2절), 간체는 아직 지원하지 않는다.
 *    여기서 간체까지 true 로 잡으면 간체 사용자에게 번체가 나간다.
 *    지역 태그 없는 맨 `'zh'` 도 번체로 단정할 수 없어 false 쪽(= 영어 경로)에 둔다.
 */
export const isTraditionalChineseLang = (lang?: string | null): boolean => {
  if (!lang) return false;
  const l = String(lang).toLowerCase();
  if (!l.startsWith('zh')) return false;
  if (l.includes('hans')) return false; // zh-Hans, zh-Hans-CN — 간체 명시
  // 번체를 쓰는 지역: 대만·홍콩·마카오. 'zh-Hant' 는 스크립트 태그로 직접 번체를 지정한다.
  return l.includes('hant') || /\b(tw|hk|mo)\b/.test(l.replace(/-/g, ' '));
};

/**
 * 스페인어 변형 판정 — 스페인식('ES')인가 중남미 중립형('419')인가, 아니면 스페인어가 아닌가(null).
 *
 * 앱의 언어 코드는 `'es-419'`(중남미 중립형)와 `'es-ES'`(스페인식) 둘이고, 리소스는
 * 공통 기반 `es.ts` + 스페인식 덮어쓰기 `es-ES.ts` 두 벌이다(i18n/index.ts 주석).
 * 표기가 갈리는 곳(시각 12/24시간 등)은 이 함수 하나로 판정한다.
 *
 * ⚠️ **기본값은 '419'다.** `'es'`·`'es-MX'`·`'es-AR'` 처럼 지역이 스페인이 아니거나 없는 코드는
 *    전부 중남미 중립형으로 본다 — es.ts 가 공통 기반이라 그게 리소스 계층과 같은 방향이다.
 *    ES 쪽을 기본으로 두면 중남미 사용자가 「9:05」(24시간)를 보게 된다.
 * ⚠️ 첫 서브태그가 정확히 'es' 일 때만 스페인어다. `startsWith('es')` 로 적으면
 *    에스페란토('eo' 는 아니지만 'est' 같은 오탈자)나 미지의 코드가 스페인어로 잡힌다.
 */
export const spanishVariant = (lang?: string | null): 'ES' | '419' | null => {
  if (!lang) return null;
  const parts = String(lang).toLowerCase().split('-');
  if (parts[0] !== 'es') return null;
  // 지역 서브태그가 'es'(스페인)면 스페인식. 'es-Latn-ES' 같은 스크립트 끼움도 같게 본다.
  return parts.slice(1).includes('es') ? 'ES' : '419';
};
