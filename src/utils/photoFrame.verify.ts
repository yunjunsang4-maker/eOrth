/**
 * photoFrame 검증 — node node_modules/tsx/dist/cli.mjs src/utils/photoFrame.verify.ts
 */
import {
  DEFAULT_PHOTO_FRAME, PHOTO_FRAME_RATIOS, PHOTO_FRAME_FILLS,
  isFramed, frameHeight, frameFillColor, normalizePhotoFrame, serializePhotoFrame,
} from './photoFrame';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// 상수 — 작성 화면 칩 순서가 이 배열을 그대로 쓴다
eq(PHOTO_FRAME_RATIOS, ['original', '4:5', '1:1'], '비율 목록 순서: 원본 → 4:5 → 1:1');
eq(PHOTO_FRAME_FILLS, ['black', 'white'], '채움 목록 순서: 검정 → 흰색');
eq(DEFAULT_PHOTO_FRAME, { ratio: 'original', fill: 'black' }, '기본값은 원본·검정');

// isFramed — 원본이면 프레임 미적용(기존 렌더 유지)
eq(isFramed(undefined), false, 'undefined → 미적용');
eq(isFramed(null), false, 'null → 미적용');
eq(isFramed({ ratio: 'original', fill: 'white' }), false, '원본이면 색이 있어도 미적용');
eq(isFramed({ ratio: '4:5', fill: 'black' }), true, '4:5 → 적용');
eq(isFramed({ ratio: '1:1', fill: 'black' }), true, '1:1 → 적용');

// frameHeight — 폭 400 기준. 정수여야 레이아웃이 흔들리지 않는다
eq(frameHeight({ ratio: '4:5', fill: 'black' }, 400), 500, '4:5: 높이 = 폭 × 1.25');
eq(frameHeight({ ratio: '1:1', fill: 'black' }, 400), 400, '1:1: 높이 = 폭');
eq(frameHeight({ ratio: '4:5', fill: 'black' }, 393), 491, '4:5 소수 폭은 반올림(393×1.25=491.25→491)');
eq(frameHeight({ ratio: 'original', fill: 'black' }, 400), null, '원본 → null(호출자가 기존 비율 로직)');
eq(frameHeight(undefined, 400), null, 'undefined → null');

// 채움색
eq(frameFillColor('black'), '#000000', '검정 hex');
eq(frameFillColor('white'), '#FFFFFF', '흰색 hex');

// normalize — 서버에서 온 옛/깨진 값 방어. 알 수 없는 값은 항목별로 기본값
eq(normalizePhotoFrame(undefined), { ratio: 'original', fill: 'black' }, '필드 없음(옛 글) → 기본값');
eq(normalizePhotoFrame(null), { ratio: 'original', fill: 'black' }, 'null → 기본값');
eq(normalizePhotoFrame({ ratio: '4:5', fill: 'white' }), { ratio: '4:5', fill: 'white' }, '정상값 그대로');
eq(normalizePhotoFrame({ ratio: '3:2', fill: 'white' }), { ratio: 'original', fill: 'white' }, '모르는 비율 → 원본, 색은 유지');
eq(normalizePhotoFrame({ ratio: '1:1', fill: 'red' }), { ratio: '1:1', fill: 'black' }, '모르는 색 → 검정, 비율은 유지');
eq(normalizePhotoFrame({ ratio: '1:1' }), { ratio: '1:1', fill: 'black' }, '색 누락 → 검정');
eq(normalizePhotoFrame('4:5'), { ratio: 'original', fill: 'black' }, '객체가 아니면 기본값');

// serialize — 기본값이면 필드 생략(옛 글과 저장 형태 동일), 아니면 그대로
eq(serializePhotoFrame({ ratio: 'original', fill: 'black' }), undefined, '기본값 → undefined(필드 생략)');
eq(serializePhotoFrame({ ratio: 'original', fill: 'white' }), undefined, '원본이면 색이 바뀌어도 생략(렌더에 영향 없음)');
eq(serializePhotoFrame({ ratio: '4:5', fill: 'black' }), { ratio: '4:5', fill: 'black' }, '4:5 검정 → 저장');
eq(serializePhotoFrame({ ratio: '1:1', fill: 'white' }), { ratio: '1:1', fill: 'white' }, '1:1 흰 → 저장');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
