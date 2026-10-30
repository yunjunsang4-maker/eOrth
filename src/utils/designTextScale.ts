// 시안 폭 기준 글자 배율 — 안드로이드 Profile·Analysis 화면 전용(src/ui/Text.tsx AndroidDesignText).
//
// 배경: 안드로이드 실측에서 글자가 fontSize의 ×1.16~1.19로 렌더됐다(기기 글꼴 배율이
// FONT_SCALE_CAP 1.2 근처까지 걸림). 이 두 화면만 기기 배율을 끄고(allowFontScaling=false)
// 대신 화면 폭 비례로 줄여 iPhone 17 시안과 같은 비율로 보이게 한다.
//
// RN을 import하지 않는다 — npm test(tsx)가 이 파일을 그대로 실행할 수 있어야 한다(stageMath.ts와 같은 이유).

/**
 * 시안 기준 폭(iPhone 17 = 402pt).
 * 보정 손잡이: 비교 기준 아이폰이 다르면(예: 393pt 기종) 이 값만 바꾸면 된다.
 */
export const DESIGN_W = 402;

/**
 * Stage 폭 → 글자 배율. 1을 넘기지 않는다 — iOS도 넓은 폰에서 글자를 키우지 않으므로,
 * 좁은 안드로이드만 iPhone 17 비율로 줄인다. 폭이 비정상(NaN·0·음수)이면 1(손대지 않음).
 */
export function designTextScaleFor(stageW: number): number {
  if (!Number.isFinite(stageW) || stageW <= 0) return 1;
  return Math.min(1, stageW / DESIGN_W);
}

type FontKeys = { fontSize?: unknown; lineHeight?: unknown; letterSpacing?: unknown };
type ScaledFontKeys = { fontSize?: number; lineHeight?: number; letterSpacing?: number };

/**
 * style의 fontSize·lineHeight·letterSpacing 중 **숫자인 것만** k배 한 덮어쓰기 객체.
 * 없는 키는 넣지 않는다 — 중첩 Text가 부모(이미 곱해진) 값을 상속해야 하므로
 * 기본 fontSize를 새로 주입하면 상속이 깨진다.
 */
export function scaleFontKeys(style: FontKeys | null | undefined, k: number): ScaledFontKeys {
  const out: ScaledFontKeys = {};
  if (!style || k === 1) return out;
  if (typeof style.fontSize === 'number') out.fontSize = style.fontSize * k;
  if (typeof style.lineHeight === 'number') out.lineHeight = style.lineHeight * k;
  if (typeof style.letterSpacing === 'number') out.letterSpacing = style.letterSpacing * k;
  return out;
}
