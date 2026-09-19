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
