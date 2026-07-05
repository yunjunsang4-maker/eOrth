import React, { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import SplashScreen from '../screens/SplashScreen';
import AppIntroScreen from '../screens/AppIntroScreen';
import LoginScreen from '../screens/LoginScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
import BasicInfoScreen from '../screens/BasicInfoScreen';
import TravelImportScreen from '../screens/TravelImportScreen';
import ImportPhotoSelectScreen from '../screens/ImportPhotoSelectScreen';
import ImportCompleteScreen from '../screens/ImportCompleteScreen';
import CountryScreen from '../screens/CountryScreen';
import AccountSettingsScreen from '../screens/AccountSettingsScreen';
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen';
import NotificationScreen from '../screens/NotificationScreen';
import NewRecordScreen from '../screens/NewRecordScreen';
import SettingsScreen from '../screens/SettingsScreen';
import PremiumScreen from '../screens/PremiumScreen';
import FAQScreen from '../screens/FAQScreen';
import FeedbackScreen from '../screens/FeedbackScreen';
import FriendSearchScreen from '../screens/FriendSearchScreen';
import BlockedUsersScreen from '../screens/BlockedUsersScreen';
import ArchivedPostsScreen from '../screens/ArchivedPostsScreen';
import FriendProfileScreen from '../screens/FriendProfileScreen';
import FollowingListScreen from '../screens/FollowingListScreen';
import FollowerListScreen from '../screens/FollowerListScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import StatsDetailScreen from '../screens/StatsDetailScreen';
import TripRecordScreen from '../screens/TripRecordScreen';
import TripGroupScreen from '../screens/TripGroupScreen';
import TripDetailScreen from '../screens/TripDetailScreen';
import PostDetailScreen from '../screens/PostDetailScreen';
import BlogRecordScreen from '../screens/BlogRecordScreen';
import CutRecordScreen from '../screens/CutRecordScreen';
import CutTravelInfoScreen from '../screens/CutTravelInfoScreen';
import NaverBlogImportScreen from '../screens/NaverBlogImportScreen';
import SnapRecordScreen from '../screens/SnapRecordScreen';
import AlbumCreateScreen from '../screens/AlbumCreateScreen';
import FriendsScreen from '../screens/FriendsScreen';
import DMScreen from '../screens/DMScreen';
import BestCutScreen from '../screens/BestCutScreen';
import TabNavigator from './TabNavigator';
import { navigationRef } from './navigationRef';
import { supabase } from '../services/supabase';
import { exchangeAuthCode } from '../services/auth';
import { emitToast } from '../store/toastStore';
import type { RootStackParamList } from './types';

const Stack = createStackNavigator<RootStackParamList>();

const darkTheme = {
  dark: true,
  colors: {
    primary: '#BF85FC',
    background: '#0A0118',
    card: '#0A0118',
    text: '#FFFFFF',
    border: '#1A1A26',
    notification: '#BF85FC',
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' as const },
    medium: { fontFamily: 'System', fontWeight: '500' as const },
    bold: { fontFamily: 'System', fontWeight: '700' as const },
    heavy: { fontFamily: 'System', fontWeight: '900' as const },
  },
};

export default function AppNavigator() {
  // 세션 만료 안내 문구를 항상 최신 언어로 쓰기 위한 ref (onAuthStateChange 콜백은 마운트 시 1회 등록)
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;

  // 딥링크: eorth://user/<handle> → 친구찾기 화면을 해당 핸들로 검색 상태로 연다
  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url) return;
      const trimmed = url.trim();

      // 비밀번호 재설정 딥링크: code 를 세션으로 교환한 뒤 새 비밀번호 설정 화면으로 이동
      if (/eorth:\/\/reset-password/i.test(trimmed)) {
        const cm = /[?&]code=([^&]+)/.exec(trimmed);
        const code = cm ? decodeURIComponent(cm[1]) : null;
        if (!code) return;
        const result = await exchangeAuthCode(code);
        if (!result.ok) return;
        const goReset = () => navigationRef.current?.navigate('ResetPassword');
        if (navigationRef.current?.isReady()) goReset();
        else setTimeout(goReset, 1000);
        return;
      }

      // 이메일 가입 인증 딥링크: code 를 세션으로 교환 후 Splash로 → 온보딩/메인 자동 분기
      if (/eorth:\/\/email-confirm/i.test(trimmed)) {
        const cm = /[?&]code=([^&]+)/.exec(trimmed);
        const code = cm ? decodeURIComponent(cm[1]) : null;
        if (!code) return;
        const result = await exchangeAuthCode(code);
        if (!result.ok) return;
        // Splash가 세션·온보딩 완료 여부를 확인해 BasicInfo(신규) 또는 Main으로 보낸다.
        const goSplash = () => navigationRef.current?.reset({ index: 0, routes: [{ name: 'Splash' }] });
        if (navigationRef.current?.isReady()) goSplash();
        else setTimeout(goSplash, 1000);
        return;
      }

      // eorth://user/<handle> → 친구찾기 화면을 해당 핸들로 검색 상태로 연다
      const m = /eorth:\/\/user\/(.+)$/i.exec(trimmed);
      if (!m) return;
      const handle = decodeURIComponent(m[1]).replace(/^@/, '').replace(/\/+$/, '');
      if (!handle || handle === 'unknown') return;
      // 방어 심화: 인증되어 본화면(Main)에 진입한 상태에서만 내부 화면으로 이동한다.
      // 미인증 상태의 딥링크로 인증 화면이 열리는 것을 막고, 콜드 스타트에서는
      // Main 진입까지 잠시(최대 ~5초) 기다렸다 이동(그 사이 인증 안 되면 무시).
      const tryGo = (attempts: number) => {
        const authed = navigationRef.current?.getRootState?.()?.routes?.some((r) => r.name === 'Main');
        if (authed) {
          // ts: 같은 핸들로 재진입해도 화면이 검색어를 다시 채우도록 매번 새 값 전달
          navigationRef.current?.navigate('FriendSearch', { initialQuery: handle, ts: Date.now() });
        } else if (attempts > 0) {
          setTimeout(() => tryGo(attempts - 1), 800);
        }
        // attempts 소진 = 미인증으로 간주 → 딥링크 무시
      };
      tryGo(6);
    };
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    Linking.getInitialURL().then(handleUrl).catch(() => {});
    return () => sub.remove();
  }, []);

  // 세션 무효화 대응: refresh 토큰 만료·서버측 로그아웃 등으로 SIGNED_OUT 이 발생하면
  // 로그인 플로우(Splash)로 강제 이동한다. 토큰만 끊기고 화면은 로그인 상태로 남아
  // API가 401만 받던 문제를 막는다. (이미 인증 전 화면이면 중복 이동·루프 방지)
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return;
      const current = navigationRef.current?.getCurrentRoute()?.name;
      if (current && ['Splash', 'AppIntro', 'Login'].includes(current)) return;
      // 인증 화면이 아닌 곳에서 SIGNED_OUT = 강제 로그아웃(세션 만료 등) → 이유를 안내한다.
      emitToast(tRef.current('login.sessionExpired'));
      navigationRef.current?.reset({ index: 0, routes: [{ name: 'Splash' }] });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <NavigationContainer theme={darkTheme} ref={navigationRef}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: '#0A0118' },
          animation: 'slide_from_right',
          gestureEnabled: true,
          gestureDirection: 'horizontal',
          gestureResponseDistance: 150,
          // 스와이프 뒤로가기 중 이전 화면이 분리되어 흰 화면이 깜빡이는 버그 방지
          detachPreviousScreen: false,
          cardStyleInterpolator: ({ current, next, layouts }) => ({
            cardStyle: {
              transform: [
                {
                  translateX: current.progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [layouts.screen.width, 0],
                  }),
                },
              ],
            },
            overlayStyle: {
              backgroundColor: '#0A0118',
              opacity: current.progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.6],
              }),
            },
          }),
        }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="AppIntro" component={AppIntroScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        <Stack.Screen name="BasicInfo" component={BasicInfoScreen} />
        <Stack.Screen name="TravelImport" component={TravelImportScreen} />
        <Stack.Screen name="ImportPhotoSelect" component={ImportPhotoSelectScreen} />
        <Stack.Screen
          name="ImportComplete"
          component={ImportCompleteScreen}
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen name="Main" component={TabNavigator} options={{ gestureEnabled: false }} />
        <Stack.Screen name="Country" component={CountryScreen} />
        <Stack.Screen name="AccountSettings" component={AccountSettingsScreen} />
        <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
        <Stack.Screen name="Notifications" component={NotificationScreen} />
        <Stack.Screen
          name="NewRecord"
          component={NewRecordScreen}
          options={{ presentation: 'modal', gestureEnabled: false }}
        />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Premium" component={PremiumScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="FAQ" component={FAQScreen} />
        <Stack.Screen name="Feedback" component={FeedbackScreen} />
        <Stack.Screen name="Friends" component={FriendsScreen} />
        <Stack.Screen name="DM" component={DMScreen} />
        <Stack.Screen name="BestCut" component={BestCutScreen} />
        <Stack.Screen name="FriendSearch" component={FriendSearchScreen} />
        <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
        <Stack.Screen name="ArchivedPosts" component={ArchivedPostsScreen} />
        <Stack.Screen name="FriendProfile" component={FriendProfileScreen} />
        <Stack.Screen name="FollowingList" component={FollowingListScreen} />
        <Stack.Screen name="FollowerList" component={FollowerListScreen} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} />
        <Stack.Screen name="StatsDetail" component={StatsDetailScreen} />
        <Stack.Screen name="TripRecord" component={TripRecordScreen} />
        <Stack.Screen name="TripGroup" component={TripGroupScreen} />
        <Stack.Screen name="TripDetail" component={TripDetailScreen} />
        <Stack.Screen
          name="PostDetail"
          component={PostDetailScreen}
          options={{
            cardStyle: { backgroundColor: 'transparent' },
            // 게시물이 펼쳐지듯 줌인 + 페이드로 상세 진입
            transitionSpec: {
              open: { animation: 'timing', config: { duration: 300 } },
              close: { animation: 'timing', config: { duration: 220 } },
            },
            cardStyleInterpolator: ({ current }) => ({
              cardStyle: {
                opacity: current.progress,
                transform: [
                  {
                    scale: current.progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.9, 1],
                    }),
                  },
                ],
              },
              overlayStyle: {
                backgroundColor: '#000',
                opacity: current.progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.5],
                }),
              },
            }),
          }}
        />
        <Stack.Screen
          name="BlogRecord"
          component={BlogRecordScreen}
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen
          name="CutRecord"
          component={CutRecordScreen}
          options={{ presentation: 'modal', gestureEnabled: false }}
        />
        <Stack.Screen
          name="CutTravelInfo"
          component={CutTravelInfoScreen}
          options={{ presentation: 'modal', gestureEnabled: false }}
        />
        <Stack.Screen
          name="NaverBlogImport"
          component={NaverBlogImportScreen}
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen
          name="SnapRecord"
          component={SnapRecordScreen}
          options={{ presentation: 'modal', gestureEnabled: false }}
        />
        <Stack.Screen
          name="AlbumCreate"
          component={AlbumCreateScreen}
          options={{ presentation: 'modal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
