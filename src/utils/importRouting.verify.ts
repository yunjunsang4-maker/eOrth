// src/utils/importRouting.verify.ts
import { classifyImportTarget } from './importRouting';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  if (actual !== expected) { failed++; console.error(`✗ ${msg}\n   expected ${expected}\n   got      ${actual}`); }
  else console.log(`✓ ${msg}`);
}

// 체류국과 같으면 stay
eq(classifyImportTarget('일본', '대한민국', '일본'), 'stay', '체류국 → stay');
// 제3국(거주국·체류국 아님) → trip
eq(classifyImportTarget('태국', '대한민국', '일본'), 'trip', '제3국 → trip');
// 거주국 → skip (import는 이미 제외하지만 방어)
eq(classifyImportTarget('대한민국', '대한민국', '일본'), 'skip', '거주국 → skip');
// 거주국 별칭 '한국' → skip
eq(classifyImportTarget('한국', '대한민국', '일본'), 'skip', '거주국 별칭 한국 → skip');
// 체류 없음(stayCountryName null) → 제3국은 trip, 거주국은 skip
eq(classifyImportTarget('일본', '대한민국', null), 'trip', '체류 없으면 일본도 trip');
eq(classifyImportTarget('대한민국', '대한민국', null), 'skip', '체류 없어도 거주국 skip');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
