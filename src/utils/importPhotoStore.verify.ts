// 실행: npx tsx src/utils/importPhotoStore.verify.ts
import { tripDir, tripPhotoPath } from './importPhotoStore';

let failures = 0;
function assert(c: boolean, m: string) { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } }

// 경로 헬퍼는 base를 인자로 받아 순수하게 동작(파일시스템 접근 없음)
{
  const base = 'file:///app/docs/';
  assert(tripDir(base, 'trip-x') === 'file:///app/docs/trips/trip-x/', 'tripDir 경로');
  assert(tripPhotoPath(base, 'trip-x', 0) === 'file:///app/docs/trips/trip-x/0.jpg', '사진 경로 0');
  assert(tripPhotoPath(base, 'trip-x', 12) === 'file:///app/docs/trips/trip-x/12.jpg', '사진 경로 12');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
