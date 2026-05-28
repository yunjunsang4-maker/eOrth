import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import SplashScreen from '../screens/SplashScreen';
import AppIntroScreen from '../screens/AppIntroScreen';
import LoginScreen from '../screens/LoginScreen';
import BasicInfoScreen from '../screens/BasicInfoScreen';
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
import AlbumRecordScreen from '../screens/AlbumRecordScreen';
import BlogRecordScreen from '../screens/BlogRecordScreen';
import NaverBlogImportScreen from '../screens/NaverBlogImportScreen';
import SnapRecordScreen from '../screens/SnapRecordScreen';
import FriendsScreen from '../screens/FriendsScreen';
import DMScreen from '../screens/DMScreen';
import TabNavigator from './TabNavigator';
import { navigationRef } from './navigationRef';

const Stack = createStackNavigator();

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
        <Stack.Screen name="Main" component={TabNavigator} />
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
            cardStyleInterpolator: ({ current }) => ({
              cardStyle: {
                opacity: current.progress,
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
          name="AlbumRecord"
          component={AlbumRecordScreen}
          options={{ presentation: 'modal', gestureEnabled: false }}
        />
        <Stack.Screen
          name="BlogRecord"
          component={BlogRecordScreen}
          options={{ presentation: 'modal' }}
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
