import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MainScreen from '../screens/MainScreen';
import StatsScreen from '../screens/StatsScreen';
import SocialScreen from '../screens/SocialScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { CustomTabBar } from '../components/CustomTabBar';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

export default function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="MainTab" component={MainScreen} />
      <Tab.Screen name="StatsTab" component={StatsScreen} />
      <Tab.Screen name="SocialTab" component={SocialScreen} />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
