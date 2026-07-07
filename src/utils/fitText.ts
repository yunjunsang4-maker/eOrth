import { Platform } from 'react-native';

// ─── 안드로이드 전용 텍스트 보정 (iOS 렌더링은 절대 변경하지 않는다) ───
// 앱 글꼴(Inter)에 한글이 없어 한글은 시스템 폰트로 폴백되는데, 안드로이드(Noto Sans KR)는
// iOS(Apple SD 고딕)보다 글리프가 넓고 시스템 글꼴 배율(fontScale)도 그대로 곱해진다.
// 그 결과 iOS 폭 기준의 고정폭 칸에서 한글·단위 라벨이 줄바꿈돼 레이아웃이 밀린다
// → android에서만 한 줄 고정·자동 축소·배율 상한을 적용. <Text {...andFitText}> 로 사용.
export const andFitText = Platform.OS === 'android'
  ? ({ numberOfLines: 1, adjustsFontSizeToFit: true, maxFontSizeMultiplier: 1.2 } as const)
  : ({} as const);
