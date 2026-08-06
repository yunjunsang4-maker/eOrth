// 퍼즐 기본 아트 data URI 형식·크기 검증.
// 크기 상한 400KB: 번들에 인라인되는 문자열이라 무한정 커지면 안 된다.
// (glassSpaceBg와 같은 인라인 방식 — JPEG q70·800px이면 여유 있게 통과)
import { PUZZLE_ART } from './puzzleArt';

let failed = 0;
function ok(cond: boolean, label: string) {
  console.log(`${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failed++;
}

console.log('▶ src/data/puzzleArt.verify.ts');

ok(PUZZLE_ART.startsWith('data:image/jpeg;base64,'), 'JPEG data URI 형식');
ok(PUZZLE_ART.length > 10_000, '실제 이미지가 들어 있다 (플레이스홀더 아님)');
ok(PUZZLE_ART.length < 400_000, '400KB 미만 (번들 크기 상한)');
// base64 본문에 개행·공백이 섞이면 WebView <image href>가 조용히 실패한다
ok(!/[\s]/.test(PUZZLE_ART), '공백·개행 없음');

if (failed > 0) { console.error(`✗ ${failed}개 실패`); process.exit(1); }
console.log('✅ 모든 검증 통과');
