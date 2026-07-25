// 코치마크 측정값 판정 검증 (jest 미사용). 실행: npx tsx src/utils/coachRect.verify.ts
import { isValidRect } from './coachRect';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}

// ── 정상 값 ──
{
  assert(isValidRect({ x: 10, y: 20, width: 60, height: 60 }) === true, '정상 rect는 유효');
  assert(isValidRect({ x: 0, y: 0, width: 1, height: 1 }) === true, '원점 1x1도 유효');
  assert(isValidRect({ x: -30, y: -120, width: 100, height: 40 }) === true,
    '음수 좌표는 유효 — 스크롤로 화면 위로 밀린 요소의 정상 값');
  assert(isValidRect({ x: 0.5, y: 12.75, width: 60.25, height: 60.25 }) === true, '소수 좌표 유효');
}

// ── 레이아웃 전(0 크기) ──
{
  assert(isValidRect({ x: 0, y: 0, width: 0, height: 0 }) === false, '0x0은 무효(레이아웃 전)');
  assert(isValidRect({ x: 10, y: 10, width: 0, height: 50 }) === false, '폭 0은 무효');
  assert(isValidRect({ x: 10, y: 10, width: 50, height: 0 }) === false, '높이 0은 무효');
  assert(isValidRect({ x: 10, y: 10, width: -5, height: 50 }) === false, '음수 폭은 무효');
  assert(isValidRect({ x: 10, y: 10, width: 50, height: -5 }) === false, '음수 높이는 무효');
}

// ── 비정상 수치 ──
{
  assert(isValidRect({ x: NaN, y: 0, width: 10, height: 10 }) === false, 'NaN은 무효');
  assert(isValidRect({ x: 0, y: NaN, width: 10, height: 10 }) === false, 'y가 NaN이어도 무효');
  assert(isValidRect({ x: 0, y: 0, width: Infinity, height: 10 }) === false, 'Infinity는 무효');
  assert(isValidRect({ x: -Infinity, y: 0, width: 10, height: 10 }) === false, '-Infinity는 무효');
  assert(isValidRect({ x: '10', y: 0, width: 10, height: 10 }) === false, '문자열 좌표는 무효');
}

// ── 구조 자체가 없는 경우 ──
{
  assert(isValidRect(null) === false, 'null 안전');
  assert(isValidRect(undefined) === false, 'undefined 안전');
  assert(isValidRect({}) === false, '빈 객체는 무효');
  assert(isValidRect({ x: 0, y: 0, width: 10 }) === false, '필드 누락은 무효');
  assert(isValidRect(42) === false, '숫자 인자 안전');
  assert(isValidRect('rect') === false, '문자열 인자 안전');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
