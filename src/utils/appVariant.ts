// 앱 변형(정식/베타/개발) 식별 — app.config.js가 '변형 빌드에만' extra.appVariant를 넣는다.
// 정식 빌드에는 필드 자체가 없다(설정 불변 원칙 G1) → 부재 = 'production'.
import Constants from 'expo-constants';

export type AppVariant = 'production' | 'beta' | 'development';

const rawVariant = (Constants.expoConfig?.extra as { appVariant?: string } | undefined)?.appVariant;
export const APP_VARIANT: AppVariant =
  rawVariant === 'beta' || rawVariant === 'development' ? rawVariant : 'production';

// 딥링크 스킴 — app config의 scheme을 그대로 읽는다(정식 'eorth'·베타 'eorthbeta'·dev 'eorthdev').
// scheme은 string | string[]일 수 있고, 어떤 이유로든 비면 정식 값 폴백(G2).
const rawScheme = Constants.expoConfig?.scheme;
export const APP_SCHEME: string = (Array.isArray(rawScheme) ? rawScheme[0] : rawScheme) || 'eorth';
