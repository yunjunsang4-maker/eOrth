import React from 'react';
import { Text as RNText, TextInput as RNTextInput } from 'react-native';
import type { TextProps, TextInputProps } from 'react-native';

/**
 * 시스템 글꼴 배율 상한.
 *
 * React 19에서 함수형 컴포넌트의 defaultProps가 제거되어
 * `Text.defaultProps = { maxFontSizeMultiplier }` 전역 주입이 동작하지 않는다.
 * 그래서 래퍼를 두고 import 출처를 바꾼다(eslint no-restricted-imports로 강제).
 *
 * 값 1.2는 utils/fitText.ts의 andFitText와 같은 기준이다(fitText가 이 상수를 import한다).
 *
 * ⚠️ 이 상한은 iOS에도 적용된다 — 목표가 "두 플랫폼이 다르지 않게"인데 Android만
 * 자르면 사용자가 배율을 올렸을 때 오히려 갈라지기 때문이다. 대가로 iOS Dynamic Type이
 * 120%에서 멈춘다. iOS를 원래대로 되돌리려면 아래 한 줄을 바꾼다:
 *   const CAP = Platform.OS === 'android' ? MAX_FONT_SCALE : undefined;
 * 그리고 두 컴포넌트의 maxFontSizeMultiplier에 CAP을 넘긴다.
 */
export const MAX_FONT_SCALE = 1.2;

// props를 뒤에 펼쳐 개별 화면이 필요하면 상한을 덮어쓸 수 있게 한다.
// forwardRef는 필수다 — TextInput은 .focus()/.blur()를 ref로 호출하는 화면이 있고
// (LoginScreen·PostDetailScreen·BlogRecordScreen), ref를 흘리지 않으면 조용히 깨진다.
export const Text = React.forwardRef<React.ComponentRef<typeof RNText>, TextProps>(
  (props, ref) => <RNText ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />,
);
Text.displayName = 'Text';

export const TextInput = React.forwardRef<React.ComponentRef<typeof RNTextInput>, TextInputProps>(
  (props, ref) => <RNTextInput ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />,
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
