// src/services/photoAI/recoTypes.verify.ts
import { mediasFingerprint, dhashHamming } from './recoTypes';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// ── mediasFingerprint ──
eq(mediasFingerprint(['a', 'b']) === mediasFingerprint(['a', 'b']), true, '같은 입력 = 같은 지문');
eq(mediasFingerprint(['a', 'b']) === mediasFingerprint(['b', 'a']), false, '순서 변경 감지');
eq(mediasFingerprint(['a']) === mediasFingerprint(['a', 'b']), false, '추가 감지');
eq(mediasFingerprint([]).startsWith('0:'), true, '빈 배열도 안전');

// ── dhashHamming ──
eq(dhashHamming('0000000000000000', '0000000000000000'), 0, '동일 해시 거리 0');
eq(dhashHamming('0000000000000000', 'ffffffffffffffff'), 64, '반전 해시 거리 64');
eq(dhashHamming('0000000000000000', '0000000000000001'), 1, '1비트 차이');
eq(dhashHamming(undefined, '0000000000000000'), 64, 'undefined는 최대 거리');
eq(dhashHamming('짧음', '0000000000000000'), 64, '형식 불량은 최대 거리');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
