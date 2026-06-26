import React, { useEffect } from 'react';
import { Linking } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import SplashScreen from '../screens/SplashScreen';
import AppIntroScreen from '../screens/AppIntroScreen';
import LoginScreen from '../screens/LoginScreen';
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
import FriendSearchScreen from '../screens/FriendSearchScreen';
import BlockedUsersScreen from '../screens/BlockedUsersScreen';
import ArchivedPostsScreen from '../screens/ArchivedPostsScreen';
import FriendProfileScreen from '../screens/FriendProfileScreen';
import FollowingListScreen from '../screens/FollowingListScreen';
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
  // 딥링크: eorth://user/<handle> → 친구찾기 화면을 해당 핸들로 검색 상태로 연다
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      const m = /eorth:\/\/user\/(.+)$/i.exec(url.trim());
      if (!m) return;
      const handle = decodeURIComponent(m[1]).replace(/^@/, '').replace(/\/+$/, '');
      if (!handle || handle === 'unknown') return;
      const go = () => navigationRef.current?.navigate('FriendSearch', { initialQuery: handle });
      // 콜드 스타트면 네비게이터 준비를 기다렸다 이동
      if (navigationRef.current?.isReady()) go();
      else setTimeout(go, 1000);
    };
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    Linking.getInitialURL().then(handleUrl).catch(() => {});
    return () => sub.remove();
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
        <Stack.Screen name="Friends" component={FriendsScreen} />
        <Stack.Screen name="DM" component={DMScreen} />
        <Stack.Screen name="BestCut" component={BestCutScreen} />
        <Stack.Screen name="FriendSearch" component={FriendSearchScreen} />
        <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
        <Stack.Screen name="ArchivedPosts" component={ArchivedPostsScreen} />
        <Stack.Screen name="FriendProfile" component={FriendProfileScreen} />
        <Stack.Screen name="FollowingList" component={FollowingListScreen} />
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
