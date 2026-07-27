// AdMob 광고 단위 ID — 채널별 분기.
//
// 개발·preview·로컬에서는 반드시 테스트 ID를 쓴다. 실제 광고를 개발 중 클릭하면
// 무효 트래픽으로 판정돼 AdMob 계정이 정지될 수 있다.
//
// 광고 단위 ID(이 파일)와 앱 ID(app.json의 iosAppId·androidAppId)는 별개다.
// 앱 ID는 Info.plist / AndroidManifest에 박히므로 바꾸면 EAS 재빌드가 필요하고,
// 이 파일만 고치면 반영되지 않는다.
//
// 단위 ID도 앱 ID도 iOS·Android가 각각 다른 값이다 — AdMob 콘솔에서 플랫폼별로
// 앱을 따로 등록하기 때문이다. 한쪽 값을 다른 쪽에 쓰면 광고가 채워지지 않는다.
import { Platform } from 'react-native';
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

// 실제 네이티브 광고 단위 (AdMob 콘솔 발급). production 채널에서만 쓰인다 —
// 개발 중 실제 광고를 클릭하면 무효 트래픽으로 계정이 정지될 수 있기 때문이다.
const PROD_NATIVE_UNIT_ID = Platform.select({
  ios:     'ca-app-pub-8527185933702377/3969196407',
  android: 'ca-app-pub-8527185933702377/5845384854',
}) ?? '';

export const NATIVE_AD_UNIT_ID =
  getChannel() === 'production' ? PROD_NATIVE_UNIT_ID : TEST_NATIVE_UNIT_ID;
