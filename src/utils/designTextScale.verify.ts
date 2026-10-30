// src/utils/designTextScale.verify.ts
import { DESIGN_W, designTextScaleFor, scaleFontKeys } from './designTextScale';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// 보정 손잡이 값이 바뀌면 아래 기대값도 다시 봐야 하므로 먼저 고정해 둔다
eq(DESIGN_W, 402, 'DESIGN_W = 402 (iPhone 17)');

// 정상: 실측 기기 384dp → 384/402
eq(designTextScaleFor(384), 384 / 402, '384dp 안드로이드 → 0.955…');
eq(Math.abs(designTextScaleFor(384) - 0.9552) < 0.0001, true, '384dp 배율 ≈ 0.9552');
// 경계: 시안 폭과 같으면 그대로
eq(designTextScaleFor(402), 1, '402dp(시안 폭) → 1');
// 넓은 폰은 키우지 않는다(iOS도 안 키움)
eq(designTextScaleFor(448), 1, '448dp(Pixel Pro XL) → 1로 상한');
// 널 계열·비정상 폭은 손대지 않음(1)
eq(designTextScaleFor(NaN), 1, 'NaN → 1');
eq(designTextScaleFor(Infinity), 1, 'Infinity → 1');
eq(designTextScaleFor(0), 1, '0(레이아웃 전) → 1');
eq(designTextScaleFor(-10), 1, '음수 → 1');

// scaleFontKeys: 세 키 중 숫자만 곱한다
eq(scaleFontKeys({ fontSize: 20, lineHeight: 30, letterSpacing: -0.5 }, 0.5),
  { fontSize: 10, lineHeight: 15, letterSpacing: -0.25 }, '숫자 세 키 모두 ×k');
// 없는 키는 넣지 않는다 — 중첩 Text 상속을 깨지 않기 위해
eq(scaleFontKeys({ fontSize: 20 }, 0.5), { fontSize: 10 }, 'fontSize만 있으면 fontSize만');
eq(scaleFontKeys({ color: '#fff' } as never, 0.5), {}, '글자 크기 키 없으면 빈 객체(기본 fontSize 주입 금지)');
// 문자열/undefined 는 무시
eq(scaleFontKeys({ fontSize: '20' as never, lineHeight: undefined, letterSpacing: 1 }, 0.5),
  { letterSpacing: 0.5 }, '문자열·undefined 키는 무시');
// 널 입력
eq(scaleFontKeys(null, 0.5), {}, 'null 스타일 → 빈 객체');
eq(scaleFontKeys(undefined, 0.5), {}, 'undefined 스타일 → 빈 객체');
// k=1이면 덮어쓸 것이 없다
eq(scaleFontKeys({ fontSize: 20 }, 1), {}, 'k=1 → 빈 객체');
// 0은 유효한 숫자 — 곱해서 0 유지
eq(scaleFontKeys({ letterSpacing: 0 }, 0.5), { letterSpacing: 0 }, 'letterSpacing 0도 숫자로 처리');

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
