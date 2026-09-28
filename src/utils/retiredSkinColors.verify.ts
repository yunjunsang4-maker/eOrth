// src/utils/retiredSkinColors.verify.ts
import { remapRetiredColor, remapRetiredColorMap, remapRetiredSkinStore } from './retiredSkinColors';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

eq(remapRetiredColor('#C88BF6'), '#A47DE9', 'aurora 옛 기본색 → 새 라벤더');
eq(remapRetiredColor('#8ff6bd'), '#1DFFBB', '소문자 저장값도 교체');
eq(remapRetiredColor('#EB19D2'), '#EB19D2', '살아남은 색은 그대로(노이즈 색 포함)');
eq(remapRetiredColorMap({ Japan: '#8FF6A0', France: '#15D3EC' }), { Japan: '#12E17A', France: '#15D3EC' }, '국가별 색 맵');
eq(
  remapRetiredSkinStore({ mint: { globeColor: '#8FF6BD', countryColors: { Korea: '#8FF6A0' }, regionColors: { 'USA|US-NY': '#C88BF6' } } }),
  { mint: { globeColor: '#1DFFBB', countryColors: { Korea: '#12E17A' }, regionColors: { 'USA|US-NY': '#A47DE9' } } },
  '스킨별 묶음 세 필드 전부',
);

if (failed) { console.error(`\n${failed}건 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
