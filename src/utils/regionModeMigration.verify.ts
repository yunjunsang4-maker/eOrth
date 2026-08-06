// 대륙 표시 모드 저장값 정규화 검증 — 구 'color' 및 정크는 전부 'photo'로.
import { normalizeRegionGlobalMode } from './regionModeMigration';

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const ok = actual === expected;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) { console.log(`   기대: ${expected} / 실제: ${actual}`); failed++; }
}

console.log('▶ src/utils/regionModeMigration.verify.ts');

eq(normalizeRegionGlobalMode('puzzle'), 'puzzle', "'puzzle'은 유지");
eq(normalizeRegionGlobalMode('photo'), 'photo', "'photo'는 유지");
eq(normalizeRegionGlobalMode('color'), 'photo', "구 저장값 'color' → 'photo' (색 단독 모드 폐지)");
eq(normalizeRegionGlobalMode(undefined), 'photo', '없음 → photo (기본값)');
eq(normalizeRegionGlobalMode(null), 'photo', 'null → photo');
eq(normalizeRegionGlobalMode('PUZZLE'), 'photo', '대소문자 다른 정크 → photo (엄격 일치)');
eq(normalizeRegionGlobalMode(42), 'photo', '숫자 정크 → photo');

if (failed > 0) { console.error(`✗ ${failed}개 실패`); process.exit(1); }
console.log('✅ 모든 검증 통과');
