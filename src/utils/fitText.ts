import { Platform } from 'react-native';
import { MAX_FONT_SCALE } from '../ui/Text';

// ─── 안드로이드 전용 텍스트 보정 (iOS 렌더링은 절대 변경하지 않는다) ───
// 앱 글꼴(Inter)에 한글이 없어 한글은 시스템 폰트로 폴백되는데, 안드로이드(Noto Sans KR)는
// iOS(Apple SD 고딕)보다 글리프가 넓고 시스템 글꼴 배율(fontScale)도 그대로 곱해진다.
// 그 결과 iOS 폭 기준의 고정폭 칸에서 한글·단위 라벨이 줄바꿈돼 레이아웃이 밀린다
// → android에서만 한 줄 고정·자동 축소·배율 상한을 적용. <Text {...andFitText}> 로 사용.
// minimumFontScale: 자동 축소의 하한 — 없으면(기본 0.01) 긴 번역문에서 글자가 무한정
// 작아져 읽을 수 없게 된다 (FeatureShowcaseCard의 로컬 구현 0.82와 통일)
export const andFitText = Platform.OS === 'android'
  ? ({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.82, maxFontSizeMultiplier: MAX_FONT_SCALE } as const)
  : ({} as const);

// 고정 크기 디자인 요소(탭바 라벨 등)는 안드로이드에서 시스템 글꼴 배율을 아예 무시(1.0 고정).
// 상한 1.2배에서도 알약 폭이 못 따라가 'Analysis'→'Analysi'처럼 잘렸다. iOS는 그대로(상한 없음).
// 배율 상한 값을 1로 주지 않고 allowFontScaling을 끄는 이유 두 가지:
//  1) RN 0.81 안드로이드 TextAttributeProps.setLineHeight는 상한과 무관하게 SP로 환산해,
//     상한 1로는 글자만 고정되고 lineHeight는 배율대로 커진다. allowFontScaling=false면
//     fontSize·lineHeight 모두 DIP로 환산돼 함께 고정된다(setFontSize·setLineHeight 분기).
//  2) layout-parity 규칙 8이 배율 상한 prop 값을 MAX_FONT_SCALE 단일 출처로 강제한다.
// 키가 andFitText와 겹치지 않아 스프레드 순서에 의존하지 않는다.
export const andNoFontScale = Platform.OS === 'android'
  ? ({ allowFontScaling: false } as const)
  : ({} as const);
