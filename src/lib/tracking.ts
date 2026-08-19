import { Platform } from 'react-native';
import { getGoogleMobileAds } from './googleMobileAds';

// 앱 추적 투명성(ATT) — iOS에서 AdMob이 IDFA를 쓰려면 사용자 허락이 필요하다.
// 요청하지 않으면 심사에서 거절될 수 있고, 통과해도 IDFA를 못 받아 광고 단가가 떨어진다.
//
// googleMobileAds.ts와 같은 이유로 접근을 이 파일 한 곳으로 모은다 —
// 네이티브 모듈이 없는 바이너리(구 dev client·Expo Go)에서 import만으로 던지는 것을 흡수한다.
type TrackingModule = typeof import('expo-tracking-transparency');

let cached: TrackingModule | null | undefined;
function getTracking(): TrackingModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-tracking-transparency') as TrackingModule;
  } catch {
    cached = null;
  }
  return cached;
}

let requested: Promise<boolean> | null = null;

/**
 * ATT 권한을 요청하고 '추적 허용 여부'를 돌려준다. 앱 생애주기에서 1회만 실제 요청한다.
 *
 * - iOS 외 플랫폼: false(비개인화) — 아래 ⚠️ 참조
 * - 이미 결정된 상태면 시스템 팝업 없이 현재 값을 그대로 반환한다
 * - 모듈이 없거나 오류면 false(비개인화)로 안전하게 떨어진다
 *
 * ⚠️ 안드로이드는 true(추적 허용)를 반환하고 있었다. ATT가 iOS 전용 개념인 건 맞지만,
 *    호출부(useFeedAdSource)가 이 값을 그대로 `requestNonPersonalizedAdsOnly: !granted`
 *    로 쓰기 때문에 결과적으로 **동의 절차 없이 개인화 광고가 나갔다.** "안드로이드는
 *    별도 동의 체계"라는 전제였으나 그 체계(Google UMP 동의 폼)는 아직 도입되지 않았다.
 *    EEA·영국 사용자에게 동의 없이 개인화 광고를 내보내는 것은 AdMob EU 사용자 동의 정책
 *    위반이므로, UMP 를 붙이기 전까지는 비개인화로 고정한다(수익은 줄지만 정책은 지킨다).
 *    UMP 도입 시 이 자리에서 AdsConsent 결과를 반환하도록 바꿀 것.
 */
export function requestTrackingPermission(): Promise<boolean> {
  if (requested) return requested;
  requested = (async () => {
    if (Platform.OS !== 'ios') return false;
    const tr = getTracking();
    if (!tr) return false;
    try {
      // 이미 물어본 적이 있으면 다시 묻지 않는다(iOS가 한 번만 허용)
      const cur = await tr.getTrackingPermissionsAsync();
      if (cur.status !== 'undetermined') return cur.status === 'granted';
      const res = await tr.requestTrackingPermissionsAsync();
      return res.status === 'granted';
    } catch {
      return false;
    }
  })();
  return requested;
}

/**
 * 광고 요청 전 준비 — ATT 권한을 미리 물어보고 콘텐츠 등급을 설정한다.
 *
 * 개인화 여부(NPA)는 전역 설정이 아니라 '요청 단위' 옵션이라
 * useFeedAdSource가 requestTrackingPermission() 결과로 직접 넘긴다.
 * 여기서는 앱 진입 시 권한 팝업을 미리 띄워, 첫 광고 요청이 결정을 기다리지 않게 한다.
 *
 * 등급 T(청소년) — 여행 앱에 부적절한 광고가 섞이지 않게 상한을 둔다.
 */
export async function prepareAdsTracking(): Promise<boolean> {
  const granted = await requestTrackingPermission();
  await configureAdContent();
  return granted;
}

/**
 * 광고 콘텐츠 등급만 설정한다 — **권한 팝업을 띄우지 않는다.**
 *
 * ATT 요청과 분리한 이유: 등급 설정은 앱 시작 시 미리 해둬야 첫 광고부터 적용되는데,
 * ATT 를 로그인 전 스플래시 위에서 물으면 다른 권한 팝업과 겹쳐 심사에서 지적된다
 * (2026-08-02, 5.1.1). 그래서 App.tsx 는 이 함수만 부르고, ATT 요청은 온보딩이 끝난
 * 첫 화면(MainScreen)이 맡는다 — 첫 광고 시점(useFeedAdSource)에만 걸어뒀더니
 * 빈 피드에선 광고 슬롯이 안 생겨 ATT 가 영영 안 떴고 2.1 로 거절됐다(2026-08-18).
 *
 * 등급 T(청소년) — 여행 앱에 부적절한 광고가 섞이지 않게 상한을 둔다.
 */
export async function configureAdContent(): Promise<void> {
  const ads = getGoogleMobileAds();
  if (!ads) return;
  try {
    await ads.default().setRequestConfiguration({
      maxAdContentRating: ads.MaxAdContentRating.T,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });
  } catch {
    /* 설정 실패해도 광고 자체는 동작 — 조용히 넘어간다 */
  }
}
