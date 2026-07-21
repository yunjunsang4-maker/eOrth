// 국가명 현지화 — 데이터는 한글 국가명으로 저장되므로, 영어 모드에서 화면 표시용으로만 영문 변환.
// 로직/그룹핑은 항상 한글 원본을 쓰고, 표시 지점에서만 이 헬퍼를 통과시킨다.
import { KO_TO_EN } from '../screens/MainScreen';

/** 한글 국가명 → 현재 언어 표기. lang!=='en'이면 원본(한글) 그대로. */
export function countryLabel(ko: string | undefined | null, lang: string): string {
  if (!ko) return '';
  if (lang !== 'en') return ko;
  return ko === '대한민국' ? 'South Korea' : (KO_TO_EN[ko] ?? ko);
}
