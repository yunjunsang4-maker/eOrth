// 지역 표시명 현지화 검증 — 실제 지오 데이터로 확인한다(모킹 없음).
import { regionDisplayName } from './regionLabel';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failures++; console.error(`  ✗ ${msg}`); }
}

// -- regionDisplayName --
{
  assert(regionDisplayName('서울', 'KR-11', 'ko') === '서울', '한국어면 한글 원문');
  assert(regionDisplayName('서울', 'Seoul', 'en') === 'Seoul', '영문 이름이면 그대로');
  // 마이그레이션된 코드가 한글로 새던 문제(2026-09-28 스냅 링 거주지 라벨)
  assert(regionDisplayName('서울', 'KR-11', 'en') === 'Seoul', 'KR-11 코드 → 지오 영문명');
  assert(regionDisplayName('도쿄', 'JP-13', 'ja') === 'Tokyo', 'JP-13 코드 → 지오 영문명(ja도 영문)');
  assert(regionDisplayName('서울', undefined, 'en') === 'Seoul', 'regionNameEn 없음 → 한국 시/도 프리셋');
  assert(regionDisplayName('어딘가', 'XX-99', 'en') === '어딘가', '지오·프리셋 모두 없음 → 한글 원문');
  assert(regionDisplayName(undefined, undefined, 'en') === '', '둘 다 없음 → 빈 문자열');
}

console.log(failures === 0 ? '\n모든 검증 통과' : `\n실패 ${failures}건`);
if (failures > 0) process.exitCode = 1;
