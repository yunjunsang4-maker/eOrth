// 콘텐츠가 놓이는 최대 폭(Stage) — 배치 파리티의 단일 출처.
//
// 480인 이유: 실존하는 안드로이드 폰의 최대 폭이 448dp(Pixel 9 Pro XL)이고
// iPhone 16 Pro Max가 440pt다. 480으로 두면 모든 폰이 지금과 똑같이 화면을 채우고,
// 안드로이드 공식 대화면 기준점인 600dp 이상(폴드 펼침·태블릿)만 중앙 컬럼이 된다.
// 430으로 낮추면 Pixel Pro 계열 일반 폰이 레터박스되어 오히려 손해다.
//
// RN을 import하지 않는다 — npm test(tsx)가 이 파일을 그대로 실행할 수 있어야 한다.
export const STAGE_MAX_W = 480;

/** 창 폭을 Stage 폭으로 자른다. NaN이 들어오면 전파시키지 않고 0으로 떨어뜨린다. */
export function clampStageWidth(windowWidth: number): number {
  if (!Number.isFinite(windowWidth)) return 0;
  return Math.min(windowWidth, STAGE_MAX_W);
}
