import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ensureAdsInitialized } from './src/lib/googleMobileAds';
import { configureAdContent } from './src/lib/tracking';
import { ADMOB_ENABLED } from './src/constants/featureFlags';
import './src/i18n'; // i18next 초기화(앱 진입 시 1회)
import LanguageBridge from './src/i18n/LanguageBridge';
import AppNavigator from './src/navigation/AppNavigator';
import { RecordProvider } from './src/store/recordStore';
import { DMProvider } from './src/store/dmStore';
import { SettingsProvider } from './src/store/settingsStore';
import { ToastProvider } from './src/store/toastStore';
import { MomentProvider } from './src/store/momentStore';
import SnapDetector from './src/components/SnapDetector';
import MomentNotifier from './src/components/MomentNotifier';
import ErrorBoundary from './src/components/ErrorBoundary';
import BadgeToastHost from './src/components/BadgeToastHost';
import BadgeEvaluator from './src/components/BadgeEvaluator';
import DMToastHost from './src/components/DMToastHost';
import NotiToastHost from './src/components/NotiToastHost';
import ToastHost from './src/components/ToastHost';
import ProfileSync from './src/components/ProfileSync';
import AppStateSync from './src/components/AppStateSync';
import PushTokenSync from './src/components/PushTokenSync';
import ReturnDetector from './src/components/ReturnDetector';
import ReturnDetectNudge from './src/components/ReturnDetectNudge';
import ArrivalNotifier from './src/components/ArrivalNotifier';

export default function App() {
  // 광고 SDK 초기화 — 실패해도 앱 흐름을 막지 않는다(광고는 부가 기능).
  // 네이티브 모듈이 없는 바이너리에서는 getGoogleMobileAds()가 null이라 그냥 넘어간다.
  useEffect(() => {
    if (!ADMOB_ENABLED) return;
    const init = ensureAdsInitialized();
    if (!init) { if (__DEV__) console.log('[AdMob] 네이티브 모듈 없음 — 재빌드 필요'); return; }
    // ⚠️ 여기서 ATT(prepareAdsTracking)를 부르지 않는다.
    // 앱 시작 직후 추적 권한을 물으면 사용자는 아직 광고를 본 적도 없어 맥락이 없고,
    // 위치 권한 팝업과 겹쳐 첫 화면에 시스템 창이 연달아 뜬다(App Store 5.1.1 지적 대상).
    // ATT 요청은 첫 광고를 실제로 불러오는 시점(useFeedAdSource)이 담당한다 —
    // 그쪽이 이미 requestTrackingPermission()을 await 한 뒤 광고를 요청하므로
    // '결정 전에 광고가 나가는' 문제도 없다. SDK 초기화만 여기서 미리 끝내둔다.
    init
      .then(() => {
        if (__DEV__) console.log('[AdMob] SDK 초기화 완료');
        // 콘텐츠 등급(T) 은 권한과 무관하므로 여기서 미리 걸어 첫 광고부터 적용되게 한다.
        return configureAdContent();
      })
      .catch((e) => { if (__DEV__) console.log('[AdMob] SDK 초기화 실패:', e?.message ?? e); });
  }, []);

  // 알림 탭 라우팅은 AppNavigator가 단독으로 담당한다(여기 있던 중복 리스너는 제거).
  // 여기서는 인증·Main 진입 여부를 알 수 없어 로그인 화면 위로 내부 화면을 열거나
  // AppNavigator와 같은 탭을 두 번 라우팅했고, 콜드스타트 응답을 먼저 비워
  // AppNavigator의 콜드스타트 판독과 경합했다. 새 알림 타입도 AppNavigator에 추가할 것.

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular: require('./assets/fonts/Inter_400Regular.ttf'),
    Inter_500Medium: require('./assets/fonts/Inter_500Medium.ttf'),
    Inter_600SemiBold: require('./assets/fonts/Inter_600SemiBold.ttf'),
    Inter_700Bold: require('./assets/fonts/Inter_700Bold.ttf'),
    Inter_800ExtraBold: require('./assets/fonts/Inter_800ExtraBold.ttf'),
    'Montserrat-Black': require('./assets/fonts/Montserrat-Black.ttf'),
    NanumGothic_400Regular: require('./assets/fonts/NanumGothic_400Regular.ttf'),
    NanumMyeongjo_400Regular: require('./assets/fonts/NanumMyeongjo_400Regular.ttf'),
    NanumBrushScript_400Regular: require('./assets/fonts/NanumBrushScript_400Regular.ttf'),
    NanumPenScript_400Regular: require('./assets/fonts/NanumPenScript_400Regular.ttf'),
    NanumSquare: require('./assets/fonts/NanumSquareR.ttf'),
    NanumSquareRound: require('./assets/fonts/NanumSquareRoundR.ttf'),
    NanumBarunGothic: require('./assets/fonts/NanumBarunGothic.ttf'),
    NanumBarunpen: require('./assets/fonts/NanumBarunpen.ttf'),
    MaruBuri: require('./assets/fonts/MaruBuri-Regular.ttf'),
    // 아이디 표시 폰트(프리미엄) — 영어 전용, constants/handleFonts.ts에서 사용
    Pacifico: require('./assets/fonts/Pacifico-Regular.ttf'),
    Caveat: require('./assets/fonts/Caveat-VariableFont_wght.ttf'),
    BebasNeue: require('./assets/fonts/BebasNeue-Regular.ttf'),
    CourierPrime: require('./assets/fonts/CourierPrime-Regular.ttf'),
    Righteous: require('./assets/fonts/Righteous-Regular.ttf'),
    AmaticSC: require('./assets/fonts/AmaticSC-Regular.ttf'),
    PermanentMarker: require('./assets/fonts/PermanentMarker-Regular.ttf'),
    PlayfairDisplay: require('./assets/fonts/PlayfairDisplay-VariableFont_wght.ttf'),
    Orbitron: require('./assets/fonts/Orbitron-VariableFont_wght.ttf'),
    Yuyu: require('./assets/fonts/Yuyu-Regular.ttf'),
  });

  // 폰트 로드 실패(에셋 손상·번들 누락)에도 앱은 시스템 폰트로 진행한다 —
  // error를 무시하면 로딩 스피너에 영구 고착돼 앱을 아예 못 쓴다.
  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0118', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#7B61FF" size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <SettingsProvider>
            <LanguageBridge />
            <RecordProvider>
              <MomentProvider>
                <DMProvider>
                  <ToastProvider>
                    <StatusBar style="light" backgroundColor="#0A0118" translucent />
                    <SnapDetector />
                    <MomentNotifier />
                    <ArrivalNotifier />
                    <ReturnDetector />
                    <ReturnDetectNudge />
                    <ProfileSync />
                    <AppStateSync />
                    <PushTokenSync />
                    <BadgeEvaluator />
                    <AppNavigator />
                    <BadgeToastHost />
                    <DMToastHost />
                    <NotiToastHost />
                    <ToastHost />
                  </ToastProvider>
                </DMProvider>
              </MomentProvider>
            </RecordProvider>
          </SettingsProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
