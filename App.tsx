import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import * as NativeSplash from 'expo-splash-screen';
import './src/utils/appStart'; // JS 시작 시각 기록 — 반드시 스플래시 제어보다 먼저
import { StatusBar } from 'expo-status-bar';
import { useFonts, loadAsync as loadFontsAsync } from 'expo-font';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { STAGE_MAX_W } from './src/utils/stage';
import { ensureAdsInitialized } from './src/lib/googleMobileAds';
import { configureAdContent } from './src/lib/tracking';
import { ADMOB_ENABLED } from './src/constants/featureFlags';
import './src/i18n'; // i18next 초기화(앱 진입 시 1회)
import LanguageBridge from './src/i18n/LanguageBridge';
import HapticsBridge from './src/components/HapticsBridge';
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
import StayTripSuggester from './src/components/StayTripSuggester';
import ArrivalNotifier from './src/components/ArrivalNotifier';
import { markLateFontsLoaded, LATE_HANDLE_FONT_NAMES, LATE_BLOG_FONT_NAMES, type LateFontName } from './src/constants/lateFonts';

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

  // 시작 시 기다리는 글꼴은 첫 화면(Splash·인트로·로그인·Main 기본 UI)이 실제로 쓰는 것만:
  // Inter 5종(constants/theme.ts Typography.fontFamily — 전 화면 공용) + Montserrat-Black(CustomTabBar 로고 등).
  // 예전엔 25종(~34MB)을 전부 기다리느라 그동안 스피너만 떠 있었다.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular: require('./assets/fonts/Inter_400Regular.ttf'),
    Inter_500Medium: require('./assets/fonts/Inter_500Medium.ttf'),
    Inter_600SemiBold: require('./assets/fonts/Inter_600SemiBold.ttf'),
    Inter_700Bold: require('./assets/fonts/Inter_700Bold.ttf'),
    Inter_800ExtraBold: require('./assets/fonts/Inter_800ExtraBold.ttf'),
    'Montserrat-Black': require('./assets/fonts/Montserrat-Black.ttf'),
  });

  // 나머지 19종(블로그 글꼴 types/blogBlocks.ts, 프리미엄 아이디 폰트 constants/handleFonts.ts)은
  // 핵심 글꼴이 끝난 뒤 백그라운드로 올린다 — 같이 시작하면 디스크 읽기를 다퉈 핵심 6종이 늦어진다.
  // ⚠️ 키(글꼴 이름)는 기록·서버(user.font 등)에 저장된 값이라 절대 바꾸지 말 것. 목록은
  // constants/lateFonts.ts의 LATE_FONT_NAMES와 같아야 한다(Record<LateFontName, …>라 어긋나면 tsc가 잡는다).
  // 등록이 끝나면 markLateFontsLoaded로 알린다 — 그 전에는 화면들이 이 글꼴 이름을 스타일에 넣지 않는다.
  // 등록 전에 이름을 넣고 그리면 iOS Fabric 텍스트 캐시가 시스템 폰트 결과를 세션 내내 재사용하기 때문이다
  // (constants/lateFonts.ts 머리 주석).
  // 이름별로 따로 loadAsync 하는 이유: 맵을 한 번에 넘기면 expo-font가 Promise.all로 묶어, 하나만 실패해도
  // 나머지는 등록됐는데 어느 것이 됐는지 알 수 없다. 이름별로 받으면 성공한 것만 정확히 mark한다
  // (병렬성은 같다 — expo-font도 내부에서 이름별로 동시에 올린다).
  // 실패한 글꼴은 mark하지 않는다 — 그 글꼴은 계속 시스템 폰트로 보이고(넣어도 폴백이라 모양은 같다), 앱은 계속 간다.
  // ponytail: 실패 글꼴 재시도 없음(예전과 같다). 필요해지면 재시도 성공 시 그 이름만 markLateFontsLoaded 하면 된다.
  // 두 그룹으로 나눠 알린다(constants/lateFonts.ts) — 아이디 폰트 10종(영문, 합 ~1.5MB) 먼저, 끝나면 블로그 글꼴 9종(합 ~31MB).
  // 예전엔 19종이 다 끝나야 1회 알려서 작은 영문 폰트가 10MB짜리 NanumBarunpen을 기다렸다.
  // 그룹을 '동시'가 아니라 '차례로' 시작하는 이유: expo-font 14 loadAsync는 JS에선 이름별 병렬(Font.js
  // loadFontInNamespaceAsync)이지만, 실제 등록인 네이티브 ExpoFontLoader.loadAsync는 AsyncFunction이라
  // 직렬 큐 하나에서 돈다 — iOS DispatchQueue(label: "expo.modules.AsyncFunctionQueue")(직렬 기본값),
  // Android HandlerThread("expo.modules.AsyncFunctionQueue")(expo-modules-core). 동시에 시작하면 블로그
  // 글꼴 등록이 큐 앞을 차지해 아이디 그룹이 그 뒤로 밀릴 수 있다. 등록은 어차피 하나씩이라 차례로 해도
  // 전체 완료 시각은 거의 같다(잃는 것은 블로그 그룹 asset.downloadAsync와의 겹침 정도).
  // 구독 화면(useLateFontsLoaded)은 그룹마다 1회, 최대 2회 다시 렌더된다(예전 1회).
  // ponytail: 그룹 단위 알림 — 이름별 mark로 쪼개면 리렌더가 19회라 그룹 2개로 멈췄다.
  const coreFontsSettled = fontsLoaded || !!fontError;
  useEffect(() => {
    if (!coreFontsSettled) return;
    const lateFonts: Record<LateFontName, number> = {
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
    };
    // 그룹 하나를 올리고 성공한 이름만 알린다. 이름별 catch라 Promise.all은 reject하지 않는다 — 그래서
    // 아이디 그룹이 일부 실패해도 블로그 그룹은 이어서 시작된다.
    const loadGroup = (names: readonly LateFontName[]) =>
      Promise.all(
        names.map((name) =>
          loadFontsAsync(name, lateFonts[name]).then(
            () => name,
            (e) => { if (__DEV__) console.warn(`[Font] 백그라운드 글꼴 로드 실패(${name}) — 해당 글꼴은 시스템 폰트로 진행`, e); return null; },
          ),
        ),
      ).then((done) => markLateFontsLoaded(done.filter((n): n is LateFontName => n !== null)));
    loadGroup(LATE_HANDLE_FONT_NAMES).then(() => loadGroup(LATE_BLOG_FONT_NAMES));
  }, [coreFontsSettled]);

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
                <HapticsBridge />
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
                          <StayTripSuggester />
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
