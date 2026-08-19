import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import * as NativeSplash from 'expo-splash-screen';
import './src/utils/appStart'; // JS 시작 시각 기록 — 반드시 스플래시 제어보다 먼저
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { STAGE_MAX_W } from './src/utils/stage';
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
import { TravelDnaProvider } from './src/store/travelDnaStore';
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

// 네이티브 스플래시를 JS 가 직접 내린다.
// 기본 동작은 RN 첫 렌더와 동시에 사라지는 것이라, 기기가 빠르면 로고가 스쳐 지나간다.
// 실제로 내리는 곳은 SplashScreen(영상 화면)이며, 거기서 최소 노출 시간을 보장한 뒤
// 영상 재생과 함께 내린다. 여기서는 '자동으로 사라지지 않게'만 막아둔다.
NativeSplash.preventAutoHideAsync().catch(() => {});

export default function App() {
  // 안전망 — SplashScreen 이 마운트되지 못하는 경로(초기화 예외 등)에서 스플래시가
  // 영원히 남으면 앱이 아예 안 열린 것처럼 보인다. 시간이 지나면 무조건 내린다.
  useEffect(() => {
    const t = setTimeout(() => { NativeSplash.hideAsync().catch(() => {}); }, 5000);
    return () => clearTimeout(t);
  }, []);

  // 광고 SDK 초기화 — 실패해도 앱 흐름을 막지 않는다(광고는 부가 기능).
  // 네이티브 모듈이 없는 바이너리에서는 getGoogleMobileAds()가 null이라 그냥 넘어간다.
  useEffect(() => {
    if (!ADMOB_ENABLED) return;
    const init = ensureAdsInitialized();
    if (!init) { if (__DEV__) console.log('[AdMob] 네이티브 모듈 없음 — 재빌드 필요'); return; }
    // ⚠️ 여기서 ATT(prepareAdsTracking)를 부르지 않는다.
    // 앱 루트는 로그인 전 스플래시 위라, 여기서 물으면 위치 권한 팝업과 겹쳐
    // 첫 화면에 시스템 창이 연달아 뜬다(2026-08-02 App Store 5.1.1 지적 대상).
    // ATT 요청은 로그인·온보딩이 끝난 첫 화면(MainScreen)이 담당한다 — 첫 광고
    // 시점(useFeedAdSource)에만 걸어뒀더니 빈 피드에선 광고 슬롯이 안 생겨 ATT가
    // 영영 안 떴고 2.1로 거절됐다(2026-08-18). useFeedAdSource는 여전히 같은
    // promise를 await 한 뒤 광고를 요청하므로 '결정 전에 광고가 나가는' 문제도 없다.
    // SDK 초기화만 여기서 미리 끝내둔다.
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
      <View style={{ flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#7B61FF" size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* 폴드 펼침·태블릿에서 콘텐츠가 무한정 늘어나지 않게 Stage 폭으로 가둔다.
            바깥 View는 클램프 양옆에 남는 여백의 배경색. SafeAreaProvider를 바깥에 두는
            이유: 인셋은 클램프된 컬럼이 아니라 실제 화면 기준으로 계산돼야 한다. */}
        <View style={{ flex: 1, backgroundColor: '#0A0A0F' }}>
          <View style={{ flex: 1, width: '100%', maxWidth: STAGE_MAX_W, alignSelf: 'center' }}>
            <ErrorBoundary>
              <SettingsProvider>
                <LanguageBridge />
                <TravelDnaProvider>
                  <RecordProvider>
                    <MomentProvider>
                      <DMProvider>
                        <ToastProvider>
                          {/* edge-to-edge에서 backgroundColor/translucent는 안드로이드 no-op(경고만 발생) — style만 유효 */}
                          <StatusBar style="light" />
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
                </TravelDnaProvider>
              </SettingsProvider>
            </ErrorBoundary>
          </View>
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
