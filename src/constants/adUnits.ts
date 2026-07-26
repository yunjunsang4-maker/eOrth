// AdMob 광고 단위 ID — 채널별 분기.
//
// 개발·preview·로컬에서는 반드시 테스트 ID를 쓴다. 실제 광고를 개발 중 클릭하면
// 무효 트래픽으로 판정돼 AdMob 계정이 정지될 수 있다.
//
// 실제 단위 ID를 발급받으면 PROD_NATIVE_UNIT_ID만 교체하고
// featureFlags.ADMOB_ENABLED를 true로 올린다.
import * as Updates from 'expo-updates';
import { getGoogleMobileAds } from '../lib/googleMobileAds';

function getChannel(): string | null {
  try {
    return Updates.channel ?? null;
  } catch {
    return null;
  }
}

// 네이티브 모듈이 없는 바이너리에서는 TestIds를 읽을 수 없다 — 빈 문자열로 두고,
// 실제 요청은 useFeedAdSource가 모듈 유무를 보고 막는다.
const TEST_NATIVE_UNIT_ID = getGoogleMobileAds()?.TestIds.NATIVE ?? '';

// AdMob 계정 발급 전까지는 테스트 ID를 그대로 둔다.
const PROD_NATIVE_UNIT_ID = TEST_NATIVE_UNIT_ID;

export const NATIVE_AD_UNIT_ID =
  getChannel() === 'production' ? PROD_NATIVE_UNIT_ID : TEST_NATIVE_UNIT_ID;
