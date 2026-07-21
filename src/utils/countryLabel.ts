// 국가명 현지화 — 데이터는 한글 국가명으로 저장되므로, 영어 모드에서 화면 표시용으로만 영문 변환.
// 로직/그룹핑은 항상 한글 원본을 쓰고, 표시 지점에서만 이 헬퍼를 통과시킨다.
import { KO_TO_EN } from '../screens/MainScreen';

/** 한글 국가명 → 현재 언어 표기. lang!=='en'이면 원본(한글) 그대로. */
export function countryLabel(ko: string | undefined | null, lang: string): string {
  if (!ko) return '';
  if (lang !== 'en') return ko;
  return ko === '대한민국' ? 'South Korea' : (KO_TO_EN[ko] ?? ko);
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
