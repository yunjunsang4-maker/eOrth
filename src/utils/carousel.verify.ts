// src/utils/carousel.verify.ts
import { nextIndex } from './carousel';
let failed = 0;
function eq(a: unknown, e: unknown, m: string) { if (a !== e) { failed++; console.error(`✗ ${m}: expected ${e}, got ${a}`); } else console.log(`✓ ${m}`); }

eq(nextIndex(0, 3), 1, '0→1');
eq(nextIndex(1, 3), 2, '1→2');
eq(nextIndex(2, 3), 0, '2→0 순환');
eq(nextIndex(0, 1), 0, '슬라이드 1개면 제자리');
eq(nextIndex(5, 3), 0, '범위 밖 방어');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
