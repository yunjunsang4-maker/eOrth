// 국가명 현지화 — 데이터는 한글 국가명으로 저장되므로, 영어 모드에서 화면 표시용으로만 영문 변환.
// 로직/그룹핑은 항상 한글 원본을 쓰고, 표시 지점에서만 이 헬퍼를 통과시킨다.
// 판정이 "en인가"가 아니라 "ko인가"인 이유는 utils/langKind.ts 주석 참고 —
// 한국어가 아닌 모든 언어(ja 포함)는 영문 표기를 받는다.
import { KO_TO_EN } from '../screens/MainScreen';
import { SHORT_COUNTRY_EN } from '../constants/countryDisplay';
import { countryEnglishName } from '../constants/countries';
import { isKoreanLang } from './langKind';

// 대륙 한글명 → 영문 (국가 선택 목록의 대륙 그룹 헤더 등). CONTINENT_ORDER의 6개 + 통합 '아메리카' 포함.
const CONTINENT_EN: Record<string, string> = {
  '아시아': 'Asia', '유럽': 'Europe', '북아메리카': 'North America', '남아메리카': 'South America',
  '아메리카': 'Americas', '아프리카': 'Africa', '오세아니아': 'Oceania',
};

/** 한글 대륙명 → 현재 언어 표기. 한국어면 원본(한글), 그 외 언어는 영문. */
export function continentLabel(ko: string | undefined | null, lang: string): string {
  if (!ko) return '';
  if (isKoreanLang(lang)) return ko;
  return CONTINENT_EN[ko] ?? ko;
}

/** 한글 국가명 → 현재 언어 표기. 한국어면 원본(한글), 그 외 언어는 영문. */
export function countryLabel(ko: string | undefined | null, lang: string): string {
  if (!ko) return '';
  if (isKoreanLang(lang)) return ko;
  if (SHORT_COUNTRY_EN[ko]) return SHORT_COUNTRY_EN[ko]; // 미국→U.S, 영국→U.K
  if (ko === '대한민국') return 'South Korea';
  // KO_TO_EN(지구본 GeoJSON 이름 브리지)에 없어도 COUNTRIES의 term에서 영문을 뽑는다 —
  // 두 표가 어긋난 국가가 생겨도 영어 모드에 한글 국가명이 그대로 새지 않게 하는 안전망.
  // countryEnglishName은 COUNTRIES에 없는 값이면 입력을 그대로 돌려주므로 마지막 폴백은 ko와 같다.
  return KO_TO_EN[ko] ?? countryEnglishName(ko);
}

/**
 * "🇯🇵 일본"처럼 [국기 + 한글국가명] 결합 문자열의 이름 부분만 현지화(국기는 유지).
 * 국기가 없으면 전체를 국가명으로 취급. record.country 표시용.
 */
export function countryTagLabel(tag: string | undefined | null, lang: string): string {
  if (!tag) return '';
  const sp = tag.indexOf(' ');
  if (sp <= 0) return countryLabel(tag, lang);
  const flag = tag.slice(0, sp);
  const name = tag.slice(sp + 1).trim();
  return `${flag} ${countryLabel(name, lang)}`;
}
