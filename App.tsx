import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import './src/i18n'; // i18next 초기화(앱 진입 시 1회)
import LanguageBridge from './src/i18n/LanguageBridge';
import AppNavigator from './src/navigation/AppNavigator';
import { RecordProvider } from './src/store/recordStore';
import { DMProvider } from './src/store/dmStore';
import { SettingsProvider } from './src/store/settingsStore';
import { ToastProvider } from './src/store/toastStore';
import { MomentProvider } from './src/store/momentStore';
import { navigationRef } from './src/navigation/navigationRef';
import SnapDetector from './src/components/SnapDetector';
import MomentNotifier from './src/components/MomentNotifier';
import ErrorBoundary from './src/components/ErrorBoundary';
import BadgeToastHost from './src/components/BadgeToastHost';
import BadgeEvaluator from './src/components/BadgeEvaluator';
import DMToastHost from './src/components/DMToastHost';
import ToastHost from './src/components/ToastHost';
import ProfileSync from './src/components/ProfileSync';
import AppStateSync from './src/components/AppStateSync';

export default function App() {
  // 알림 탭 → 화면 이동 (snap / moment 분기)
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'snap') {
        const nav = navigationRef.current;
        if (nav?.isReady()) {
          nav.navigate('SnapRecord', { notifTimestamp: Number(data.timestamp) || undefined });
        }
      }
      if (data?.type === 'moment') {
        const nav = navigationRef.current;
        if (nav?.isReady()) nav.navigate('MomentCapture');
      }
    });

    // 콜드스타트: 종료 상태에서 moment 알림 탭으로 열린 경우 — 네비 준비를 기다렸다 이동
    let coldStartTimer: ReturnType<typeof setInterval> | null = null;
    Notifications.getLastNotificationResponseAsync().then((response) => {
      const data = response?.notification.request.content.data;
      if (data?.type !== 'moment') return;
      let tries = 0;
      coldStartTimer = setInterval(() => {
        const nav = navigationRef.current;
        tries += 1;
        if (nav?.isReady()) { if (coldStartTimer) clearInterval(coldStartTimer); nav.navigate('MomentCapture'); }
        else if (tries > 20) { if (coldStartTimer) clearInterval(coldStartTimer); } // 10초 포기
      }, 500);
    });

    return () => {
      subscription.remove();
      if (coldStartTimer) clearInterval(coldStartTimer);
    };
  }, []);

  const [fontsLoaded] = useFonts({
    Inter_400Regular: require('./assets/fonts/Inter_400Regular.ttf'),
    Inter_500Medium: require('./assets/fonts/Inter_500Medium.ttf'),
    Inter_600SemiBold: require('./assets/fonts/Inter_600SemiBold.ttf'),
    Inter_700Bold: require('./assets/fonts/Inter_700Bold.ttf'),
    Inter_800ExtraBold: require('./assets/fonts/Inter_800ExtraBold.ttf'),
    'Gilroy-Black': require('./assets/fonts/Gilroy-Black.ttf'),
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

  if (!fontsLoaded) {
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
                    <ProfileSync />
                    <AppStateSync />
                    <BadgeEvaluator />
                    <AppNavigator />
                    <BadgeToastHost />
                    <DMToastHost />
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
