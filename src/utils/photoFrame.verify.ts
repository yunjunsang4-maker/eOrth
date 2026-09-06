/**
 * photoFrame 검증 — node node_modules/tsx/dist/cli.mjs src/utils/photoFrame.verify.ts
 */
import {
  DEFAULT_PHOTO_FRAME, PHOTO_FRAME_RATIOS, PHOTO_FRAME_FILLS,
  isFramed, frameHeight, frameFillColor, frameRatioAspect,
  normalizePhotoFrame, serializePhotoFrame,
} from './photoFrame';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// 상수 — 작성 화면 칩 순서가 이 배열을 그대로 쓴다
eq(PHOTO_FRAME_RATIOS, ['original', '1:1', '4:5', '3:4', '2:3', '9:16', '4:3', '16:9'],
  '비율 목록 순서: 원본 → 정사각 → 세로 4종 → 가로 2종');
eq(PHOTO_FRAME_FILLS, ['black', 'white', 'cream', 'gray', 'charcoal', 'navy', 'lavender', 'pink', 'sky', 'mint'],
  '채움 목록 순서: 무채색 5색 → 유채색 5색');
eq(DEFAULT_PHOTO_FRAME, { ratio: 'original', fill: 'black' }, '기본값은 원본·검정');

// isFramed — 원본이면 프레임 미적용(기존 렌더 유지)
eq(isFramed(undefined), false, 'undefined → 미적용');
eq(isFramed(null), false, 'null → 미적용');
eq(isFramed({ ratio: 'original', fill: 'white' }), false, '원본이면 색이 있어도 미적용');
eq(isFramed({ ratio: '4:5', fill: 'black' }), true, '4:5 → 적용');
eq(isFramed({ ratio: '1:1', fill: 'black' }), true, '1:1 → 적용');
eq(isFramed({ ratio: '16:9', fill: 'mint' }), true, 'v2 신규 비율·색 조합도 적용');

// frameHeight — 폭 400 기준. 정수여야 레이아웃이 흔들리지 않는다
eq(frameHeight({ ratio: '1:1', fill: 'black' }, 400), 400, '1:1: 높이 = 폭');
eq(frameHeight({ ratio: '4:5', fill: 'black' }, 400), 500, '4:5: 높이 = 폭 × 1.25');
eq(frameHeight({ ratio: '3:4', fill: 'black' }, 400), 533, '3:4: 400×4/3=533.33 → 533');
eq(frameHeight({ ratio: '2:3', fill: 'black' }, 400), 600, '2:3: 높이 = 폭 × 1.5');
eq(frameHeight({ ratio: '9:16', fill: 'black' }, 400), 711, '9:16: 400×16/9=711.11 → 711(가장 긴 세로)');
eq(frameHeight({ ratio: '4:3', fill: 'black' }, 400), 300, '4:3: 높이 = 폭 × 0.75(가로)');
eq(frameHeight({ ratio: '16:9', fill: 'black' }, 400), 225, '16:9: 높이 = 폭 × 0.5625(가장 낮음)');
eq(frameHeight({ ratio: '4:5', fill: 'black' }, 393), 491, '4:5 소수 폭은 반올림(393×1.25=491.25→491)');
eq(frameHeight({ ratio: 'original', fill: 'black' }, 400), null, '원본 → null(호출자가 기존 비율 로직)');
eq(frameHeight(undefined, 400), null, 'undefined → null');

// 3:4보다 긴 프레임이 있어야 폰 세로 사진(3:4)에 위아래 띠가 생긴다 — v2의 목적
eq(frameHeight({ ratio: '9:16', fill: 'black' }, 400)! > Math.round(400 * 4 / 3), true,
  '9:16은 폰 세로 사진(3:4)보다 길다 → 위아래 띠 생김');

// 채움색 — 스와치 hex. 잘못되면 미리보기와 상세가 다른 색으로 그려진다
eq(frameFillColor('black'), '#000000', '검정 hex');
eq(frameFillColor('white'), '#FFFFFF', '흰색 hex');
eq(frameFillColor('cream'), '#F5EFE6', '크림 hex');
eq(frameFillColor('gray'), '#D9D9DE', '연회색 hex');
eq(frameFillColor('charcoal'), '#2E2E3B', '진회색 hex(카드 토큰과 동일)');
eq(frameFillColor('navy'), '#1B2A4A', '네이비 hex');
eq(frameFillColor('lavender'), '#C9B8F0', '라벤더 hex');
eq(frameFillColor('pink'), '#F4C7D4', '연분홍 hex');
eq(frameFillColor('sky'), '#BFDCF2', '하늘 hex');
eq(frameFillColor('mint'), '#C4EBDD', '민트 hex');

// frameRatioAspect — 비율 칩의 모양 아이콘(폭/높이). 원본은 아이콘 없음
eq(frameRatioAspect('1:1'), 1, '1:1 아이콘은 정사각');
eq(frameRatioAspect('4:5'), 0.8, '4:5 → 0.8(세로로 김)');
eq(frameRatioAspect('3:4'), 0.75, '3:4 → 0.75');
eq(frameRatioAspect('2:3'), 2 / 3, '2:3 → 0.666…');
eq(frameRatioAspect('9:16'), 0.5625, '9:16 → 0.5625(가장 홀쭉)');
eq(frameRatioAspect('4:3'), 4 / 3, '4:3 → 1.333…(가로로 김)');
eq(frameRatioAspect('16:9'), 16 / 9, '16:9 → 1.777…');
eq(frameRatioAspect('original'), null, '원본 → null(아이콘 없이 라벨만)');

// normalize — 서버에서 온 옛/깨진 값 방어. 알 수 없는 값은 항목별로 기본값
eq(normalizePhotoFrame(undefined), { ratio: 'original', fill: 'black' }, '필드 없음(옛 글) → 기본값');
eq(normalizePhotoFrame(null), { ratio: 'original', fill: 'black' }, 'null → 기본값');
eq(normalizePhotoFrame({ ratio: '4:5', fill: 'white' }), { ratio: '4:5', fill: 'white' }, '정상값 그대로');
// v1(비율 3종·색 2종)으로 저장된 글이 v2에서도 그대로 살아야 한다
eq(normalizePhotoFrame({ ratio: '1:1', fill: 'white' }), { ratio: '1:1', fill: 'white' }, 'v1 저장본(1:1·흰) 그대로 유효');
eq(normalizePhotoFrame({ ratio: '16:9', fill: 'mint' }), { ratio: '16:9', fill: 'mint' }, 'v2 신규 비율·색 수용');
eq(normalizePhotoFrame({ ratio: '3:2', fill: 'white' }), { ratio: 'original', fill: 'white' }, '모르는 비율 → 원본, 색은 유지');
eq(normalizePhotoFrame({ ratio: '1:1', fill: 'red' }), { ratio: '1:1', fill: 'black' }, '모르는 색 → 검정, 비율은 유지');
eq(normalizePhotoFrame({ ratio: '1:1' }), { ratio: '1:1', fill: 'black' }, '색 누락 → 검정');
eq(normalizePhotoFrame('4:5'), { ratio: 'original', fill: 'black' }, '객체가 아니면 기본값');

// serialize — 기본값이면 필드 생략(옛 글과 저장 형태 동일), 아니면 그대로
eq(serializePhotoFrame({ ratio: 'original', fill: 'black' }), undefined, '기본값 → undefined(필드 생략)');
eq(serializePhotoFrame({ ratio: 'original', fill: 'white' }), undefined, '원본이면 색이 바뀌어도 생략(렌더에 영향 없음)');
eq(serializePhotoFrame({ ratio: '4:5', fill: 'black' }), { ratio: '4:5', fill: 'black' }, '4:5 검정 → 저장');
eq(serializePhotoFrame({ ratio: '1:1', fill: 'white' }), { ratio: '1:1', fill: 'white' }, '1:1 흰 → 저장');
eq(serializePhotoFrame({ ratio: '9:16', fill: 'lavender' }), { ratio: '9:16', fill: 'lavender' }, 'v2 조합 → 저장');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
