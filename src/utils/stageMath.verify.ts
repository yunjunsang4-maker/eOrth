// Stage 폭 계산 검증 — 이 값이 틀어지면 전 화면 배치가 함께 틀어진다.
// RN을 import하지 않는 순수 모듈만 검사한다(tsx가 react-native를 해석하지 못한다).
import { STAGE_MAX_W, clampStageWidth } from './stageMath';

let fail = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) fail++;
};

console.log('Stage 폭 계산');

// 430이 아니라 480인 이유: Pixel 8 Pro/9 Pro XL이 448dp라
// 430으로 자르면 일반 폰이 레터박스된다.
check(STAGE_MAX_W === 480, `STAGE_MAX_W === 480 (실제 ${STAGE_MAX_W})`);

// 실존 폰 폭은 전부 그대로 통과해야 한다 — 하나라도 깎이면 회귀다.
for (const w of [360, 384, 392, 411, 412, 428, 440, 448]) {
  check(clampStageWidth(w) === w, `폰 ${w}dp는 그대로 통과`);
}

// 대화면만 clamp된다.
check(clampStageWidth(763) === 480, '폴드 펼침 763dp → 480');
check(clampStageWidth(800) === 480, '태블릿 800dp → 480');
check(clampStageWidth(600) === 480, '대화면 기준점 600dp → 480');

// 경계값.
check(clampStageWidth(480) === 480, '480dp 경계는 그대로');
check(clampStageWidth(481) === 480, '481dp는 480으로');

// 방어: 측정 실패로 0이나 NaN이 들어와도 레이아웃이 사라지면 안 된다.
check(clampStageWidth(0) === 0, '0은 0으로 (조기 렌더 시 onLayout 전)');
// !isNaN만 보면 Infinity·undefined 같은 다른 오작동도 통과한다 — 계약값(0)까지 못 박는다.
check(clampStageWidth(NaN) === 0, 'NaN → 0 (전파되지 않는다)');
check(clampStageWidth(Infinity) === 0, 'Infinity → 0');

console.log(fail === 0 ? '\n✅ 통과' : `\n❌ ${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
