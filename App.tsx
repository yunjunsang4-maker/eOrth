import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { View, ActivityIndicator } from 'react-native';
import * as Notifications from 'expo-notifications';
import AppNavigator from './src/navigation/AppNavigator';
import { RecordProvider } from './src/store/recordStore';
import { DMProvider } from './src/store/dmStore';
import { SettingsProvider } from './src/store/settingsStore';
import { navigationRef } from './src/navigation/navigationRef';
import SnapDetector from './src/components/SnapDetector';
import ErrorBoundary from './src/components/ErrorBoundary';

export default function App() {
  // 알림 탭 → 스냅 화면으로 이동
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'snap') {
        const nav = navigationRef.current;
        if (nav?.isReady()) {
          nav.navigate('SnapRecord', { notifTimestamp: Number(data.timestamp) || undefined });
        }
      }
    });
    return () => subscription.remove();
  }, []);

  const [fontsLoaded] = useFonts({
    Inter_400Regular: require('./assets/fonts/Inter_400Regular.ttf'),
    Inter_500Medium: require('./assets/fonts/Inter_500Medium.ttf'),
    Inter_600SemiBold: require('./assets/fonts/Inter_600SemiBold.ttf'),
    Inter_700Bold: require('./assets/fonts/Inter_700Bold.ttf'),
    Inter_800ExtraBold: require('./assets/fonts/Inter_800ExtraBold.ttf'),
    NanumGothic_400Regular: require('./assets/fonts/NanumGothic_400Regular.ttf'),
    NanumMyeongjo_400Regular: require('./assets/fonts/NanumMyeongjo_400Regular.ttf'),
    NanumBrushScript_400Regular: require('./assets/fonts/NanumBrushScript_400Regular.ttf'),
    NanumPenScript_400Regular: require('./assets/fonts/NanumPenScript_400Regular.ttf'),
    NanumSquare: require('./assets/fonts/NanumSquareR.ttf'),
    NanumSquareRound: require('./assets/fonts/NanumSquareRoundR.ttf'),
    NanumBarunGothic: require('./assets/fonts/NanumBarunGothic.ttf'),
    NanumBarunpen: require('./assets/fonts/NanumBarunpen.ttf'),
    MaruBuri: require('./assets/fonts/MaruBuri-Regular.ttf'),
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
      <ErrorBoundary>
        <SettingsProvider>
          <RecordProvider>
            <DMProvider>
              <StatusBar style="light" backgroundColor="#0A0118" translucent />
              <SnapDetector />
              <AppNavigator />
            </DMProvider>
          </RecordProvider>
        </SettingsProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
