// react-native-google-mobile-ads 안전 접근자.
//
// 이 패키지는 네이티브 모듈이라, 패키지가 포함되지 않은 바이너리(패키지 추가 이전에
// 만든 dev client, Expo Go)에서는 **import 하는 것만으로** TurboModuleRegistry가
// 던진다 — "'RNGoogleMobileAdsModule' could not be found".
// top-level import면 그 순간 앱 전체가 부팅에 실패한다.
//
// 그래서 패키지 진입은 이 파일 한 곳으로만 하고, 로드 실패를 흡수해 null로 바꾼다.
// 호출부는 null이면 광고만 조용히 끄고 나머지 화면은 정상 동작시킨다.
// (타입만 필요한 곳은 `import type`을 쓰면 런타임 import가 남지 않는다.)

type AdsModule = typeof import('react-native-google-mobile-ads');

let cached: AdsModule | null | undefined;

/** 네이티브 모듈이 있으면 패키지를, 없으면 null을 준다. 결과는 캐시된다. */
export function getGoogleMobileAds(): AdsModule | null {
  if (cached !== undefined) return cached;
  try {
    // import가 아니라 require여야 한다 — 실패를 잡으려면 로드 시점이 이 try 안이어야 한다.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('react-native-google-mobile-ads') as AdsModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** 이 바이너리에 AdMob 네이티브 모듈이 들어 있는지. */
export const GOOGLE_MOBILE_ADS_AVAILABLE = getGoogleMobileAds() !== null;
