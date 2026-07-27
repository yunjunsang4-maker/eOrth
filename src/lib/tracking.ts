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
 * - iOS 외 플랫폼: 항상 true (ATT는 iOS 전용 개념 — 안드로이드는 별도 동의 체계)
 * - 이미 결정된 상태면 시스템 팝업 없이 현재 값을 그대로 반환한다
 * - 모듈이 없거나 오류면 false(비개인화)로 안전하게 떨어진다
 */
export function requestTrackingPermission(): Promise<boolean> {
  if (requested) return requested;
  requested = (async () => {
    if (Platform.OS !== 'ios') return true;
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
  const ads = getGoogleMobileAds();
  if (!ads) return granted;
  try {
    await ads.default().setRequestConfiguration({
      maxAdContentRating: ads.MaxAdContentRating.T,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });
  } catch {
    /* 설정 실패해도 광고 자체는 동작 — 조용히 넘어간다 */
  }
  return granted;
}
