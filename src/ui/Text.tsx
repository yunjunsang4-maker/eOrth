import React from 'react';
import { Platform, Text as RNText, TextInput as RNTextInput } from 'react-native';
import type { TextProps, TextInputProps } from 'react-native';

/**
 * 시스템 글꼴 배율 상한값.
 *
 * React 19에서 함수형 컴포넌트의 defaultProps가 제거되어
 * `Text.defaultProps = { maxFontSizeMultiplier }` 전역 주입이 동작하지 않는다.
 * 그래서 래퍼를 두고 import 출처를 바꾼다(eslint no-restricted-imports로 강제).
 *
 * 값 1.2는 utils/fitText.ts의 andFitText와 같은 기준이다(fitText가 이 상수를 import한다).
 */
export const MAX_FONT_SCALE = 1.2;

/**
 * 실제로 넘기는 상한 — **Android 전용**이고 iOS는 상한이 없다.
 *
 * 왜 Android만인가:
 * 1. 이 저장소의 기존 원칙이 "iOS 렌더링은 절대 변경하지 않는다"이다(utils/fitText.ts:3).
 *    이 프로젝트에서 파리티의 기준(정답)이 iOS라서, iOS를 건드리면 두 플랫폼이
 *    같은지 재는 잣대 자체가 흔들린다.
 * 2. 접근성 후퇴가 iOS 사용자에게만 생긴다 — 시각 보조가 필요한 사용자가 Dynamic Type을
 *    더 키우지 못하게 된다. Android는 Noto Sans KR 글리프가 넓어 배율을 그대로 곱하면
 *    고정폭 칸이 실제로 깨지므로 자를 이유가 있지만, iOS는 그 이유가 없다.
 * 3. 이미 Android 전용인 andFitText와 기준이 일치한다.
 *
 * iOS에서 `undefined`가 "상한 없음"인 근거(RN 0.81.5 소스 확인).
 * 이 앱은 새 아키텍처(Fabric)이므로 Fabric 경로 기준으로 적는다:
 * - Libraries/Text/TextProps.js:173-180 — "`null/undefined` (default): inherit from the
 *   parent node or the global default (0)". 즉 prop을 안 준 것과 같은 기본값이다.
 * - ReactCommon/.../attributedstring/TextAttributes.h:54 —
 *   `Float maxFontSizeMultiplier{quiet_NaN()}` 로 기본값이 NaN(미설정)이다.
 * - ReactCommon/.../textlayoutmanager/platform/ios/.../RCTAttributedTextUtils.mm:110-112 —
 *   NaN이면 0.0으로 보고, `0.0 >= 1.0`이 거짓이라 fminf 클램프를 건너뛰고
 *   fontSizeMultiplier를 그대로 반환한다 = 상한 없음.
 * (레거시 Paper 경로인 Libraries/Text/RCTTextAttributes.mm:27·248-249도 로직이 동일하다.)
 * 따라서 prop을 조건부로 빼지 않고 undefined를 넘겨도 동작이 동일하다.
 */
export const FONT_SCALE_CAP = Platform.OS === 'android' ? MAX_FONT_SCALE : undefined;

// props를 뒤에 펼쳐 개별 화면이 필요하면 상한을 덮어쓸 수 있게 한다.
// forwardRef는 필수다 — TextInput은 .focus()/.blur()를 ref로 호출하는 화면이 있고
// (LoginScreen·PostDetailScreen·BlogRecordScreen), ref를 흘리지 않으면 조용히 깨진다.
export const Text = React.forwardRef<React.ComponentRef<typeof RNText>, TextProps>(
  (props, ref) => <RNText ref={ref} maxFontSizeMultiplier={FONT_SCALE_CAP} {...props} />,
);
Text.displayName = 'Text';

export const TextInput = React.forwardRef<React.ComponentRef<typeof RNTextInput>, TextInputProps>(
  (props, ref) => <RNTextInput ref={ref} maxFontSizeMultiplier={FONT_SCALE_CAP} {...props} />,
);
TextInput.displayName = 'TextInput';

// RN의 Text/TextInput은 클래스라 값이면서 동시에 타입이다. 위 const만 내보내면
// `useRef<TextInput>(null)`(LoginScreen 144·145행, PostDetailScreen 774·775·1468행)이나
// `useRef<Record<string, TextInput | null>>`(BlogRecordScreen 567행)처럼 타입 자리에서
// 쓰던 코드가 "값을 타입으로 썼다"며 깨진다. 인스턴스 타입을 같은 이름으로 함께 내보내
// import 한 줄만 바꿔도 되게 한다.
// (값과 타입은 TS에서 선언 공간이 달라 같은 이름이 공존할 수 있다. RN의 원본도 클래스
//  하나로 둘을 겸하므로 이쪽이 원본과 같은 사용감을 준다 — no-redeclare는 의도된 병합이다.)
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type Text = RNText;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type TextInput = RNTextInput;
