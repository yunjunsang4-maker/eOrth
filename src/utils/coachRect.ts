// 코치마크(튜토리얼) 강조 요소의 측정값 판정 — 순수 함수만 둔다.
//
// ⚠️ 이 파일은 import를 두지 않는다. npm test(scripts/run-verify.mjs)가 *.verify.ts를
//    node에서 tsx로 실행하는데, react-native를 import하면 node에서 실행되지 않는다.
//    플랫폼에 의존하는 측정 로직은 coachStart.ts에 있다.

export interface CoachRectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * measureInWindow 결과가 쓸 수 있는 값인지 판정한다.
 *
 * 폭·높이 0은 '아직 레이아웃 전'이라는 뜻이므로 무효로 본다.
 * (기존 세 화면의 측정 헬퍼는 NaN만 걸러내고 0을 통과시켰다. 레이아웃 전에 측정되면
 *  스포트라이트가 화면 좌상단에 점으로 찍힌다.)
 *
 * 좌표의 부호는 따지지 않는다 — 스크롤로 화면 위로 밀린 요소는 정상적으로 음수 y를 갖는다.
 */
export function isValidRect(r: unknown): r is CoachRectLike {
  if (!r || typeof r !== 'object') return false;
  const { x, y, width, height } = r as Record<string, unknown>;
  if (![x, y, width, height].every((v) => typeof v === 'number' && Number.isFinite(v))) return false;
  return (width as number) > 0 && (height as number) > 0;
}
