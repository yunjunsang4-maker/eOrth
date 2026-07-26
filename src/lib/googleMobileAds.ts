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

let initPromise: Promise<unknown> | null = null;

/**
 * SDK 초기화를 앱 전체에서 딱 한 번만 실행하고 그 Promise를 공유한다.
 *
 * Google은 초기화가 끝나기 전의 광고 요청을 지원하지 않는다. 앱 시작 직후 소셜 탭으로
 * 바로 들어가면 초기화보다 요청이 먼저 나갈 수 있으므로, 요청하는 쪽에서 이 Promise를
 * await 해야 한다. App.tsx는 앱 진입 시 미리 불러 워밍업만 한다.
 *
 * 네이티브 모듈이 없으면 null — 호출부는 광고를 건너뛴다.
 */
export function ensureAdsInitialized(): Promise<unknown> | null {
  const ads = getGoogleMobileAds();
  if (!ads) return null;
  if (!initPromise) initPromise = ads.default().initialize();
  return initPromise;
}
