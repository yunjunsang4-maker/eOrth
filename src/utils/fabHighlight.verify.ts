// src/utils/fabHighlight.verify.ts
import { shouldHighlightAlbum, FAB_HIGHLIGHT_WINDOW_MS } from './fabHighlight';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

const NOW = 1756600000000;
const DAY = 24 * 3600_000;

// 널 계열 — 귀국 판정이 한 번도 없었던 기기(첫 설치·데이터 초기화 직후)는 강조하지 않는다
eq(shouldHighlightAlbum(null, null, NOW), false, '귀국 기록 없음 = 강조 안 함');
// 정상 경로 — 귀국 직후 아직 사진첩을 안 만든 상태가 이 기능의 본 목적
eq(shouldHighlightAlbum(NOW - DAY, null, NOW), true, '귀국 1일 후 + 앨범 없음 = 강조');
// 경계 — 7일 창을 넘기면 조용히 사라져야 한다(영구 배지는 소음이 된다)
eq(shouldHighlightAlbum(NOW - 8 * DAY, null, NOW), false, '귀국 8일 후 = 소멸 (7일 창)');
// 해제 조건 — 귀국 '이후' 만든 앨범이 하나라도 있으면 유도가 끝난 것
eq(shouldHighlightAlbum(NOW - DAY, NOW - 3600_000, NOW), false, '귀국 후 앨범 만듦 = 강조 해제');
// 귀국 '전'에 만든 앨범은 이번 여행과 무관하므로 해제 근거가 못 된다
eq(shouldHighlightAlbum(NOW - DAY, NOW - 2 * DAY, NOW), true, '귀국 전에 만든 앨범은 무관 = 강조 유지');
// 기기 시계를 되돌리거나 타임존 점프로 미래 timestamp가 저장된 경우 방어
eq(shouldHighlightAlbum(NOW + DAY, null, NOW), false, '미래 timestamps(시계 이상) 방어');
eq(FAB_HIGHLIGHT_WINDOW_MS, 7 * DAY, '강조 창 = 7일');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
