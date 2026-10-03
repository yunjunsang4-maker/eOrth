// src/components/icons/palette.verify.ts — 아이콘 팔레트 구독 저장소
import { PALETTES, setPalette, getPalette, subscribePalette } from './palette';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

let calls = 0;
const unsub = subscribePalette(() => { calls++; });

// 초깃값은 예전 모듈 COLORS와 같아야 한다 — 하이드레이트 전 첫 화면 아이콘 색
eq(getPalette() === PALETTES.purple, true, '초깃값: purple 팔레트');

// 같은 팔레트 재설정 → 알림 없음. 하이드레이트·백업 복원이 같은 스킨을 다시 넣을 때 전 아이콘이 헛 리렌더되지 않게
setPalette('purple');
eq(calls, 0, '같은 이름 재설정: 알림 0회');

// 변경 → 알림 1회 + 스냅샷 참조 변경(useSyncExternalStore가 리렌더를 거는 조건)
const before = getPalette();
setPalette('cyan');
eq(calls, 1, 'purple→cyan: 알림 1회');
eq(getPalette() !== before, true, 'purple→cyan: 스냅샷 참조가 바뀜');
eq(getPalette().purpleTop, '#B5F5FF', 'purple→cyan: 새 색을 읽음');

// getSnapshot은 변경 사이에 같은 참조를 돌려줘야 한다 — 매번 새 객체면 useSyncExternalStore가 무한 리렌더
eq(getPalette() === getPalette(), true, '연속 조회: 같은 참조');

// 변경 직후 같은 값 재설정 → 추가 알림 없음
setPalette('cyan');
eq(calls, 1, 'cyan 재설정: 알림 그대로 1회');

// 구독 해제 후에는 알리지 않는다 — 언마운트된 아이콘에 setState가 가지 않게
unsub();
setPalette('mint');
eq(calls, 1, '구독 해제 후 변경: 알림 없음');
eq(getPalette().purpleTop, '#C9FFE5', '구독 해제와 무관하게 값은 바뀜');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
