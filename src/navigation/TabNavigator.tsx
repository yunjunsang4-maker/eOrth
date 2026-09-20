import React from 'react';
import { Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import MainScreen from '../screens/MainScreen';
import StatsScreen from '../screens/StatsScreen';
import SocialScreen from '../screens/SocialScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { CustomTabBar } from '../components/CustomTabBar';
import { useTabBarHidden } from '../components/tabBarVisibility';
import { useCoachActive } from '../components/coachOverlayState';
import type { TabParamList } from './types';

/**
 * 하단 탭 — iOS는 네이티브 UITabBar, Android는 기존 JS 플로팅 바(CustomTabBar).
 *
 * iOS 26에서 시스템이 UITabBar에 리퀴드 글래스를 직접 입히고 스크롤 축소(minimize)까지
 * 붙여 준다. JS로 흉내 낸 GlassSurface 폴백보다 정확하고 공짜라 iOS만 갈아탄다.
 * Android의 Material 바는 시안(보라 알약·드래그 추종)과 전혀 다른 모양이라 그대로 둔다.
 *
 * ⚠️ 두 네비게이터를 **모듈 레벨에서 한 번** 고른다. 한 컴포넌트 안에서 분기하면
 *    각 네비게이터가 부르는 훅 개수가 달라 렌더 트리가 흔들릴 여지가 생긴다.
 *    Platform.OS는 프로세스 수명 동안 상수라 이 선택은 한 번뿐이다.
 * ⚠️ 라우트 이름 4개와 컴포넌트는 양쪽이 **문자 그대로 같아야** 한다 —
 *    딥링크(appLinks)와 탭 상태 복원이 이름으로 걸려 있다.
 *
 * iOS 쪽에서 RecordFab(기록 추가 FAB·스냅)이 빠진다 — CustomTabBar가 렌더하던 것이라
 * MainScreen이 직접 그린다(MainScreen의 `Platform.OS === 'ios' && <RecordFab .../>`).
 */

const Tab = createBottomTabNavigator<TabParamList>();
const NativeTab = createNativeBottomTabNavigator<TabParamList>();

// CustomTabBar의 ACTIVE_COLOR / INACTIVE_COLOR와 같은 값 — 두 바의 색이 갈라지지 않게.
// 아이콘도 CustomTabBar와 같은 모양이다 — 그 파일의 SVG 패스를 흰색 25pt(1x/2x/3x) PNG로
// 래스터한 것(assets/tab-icons). iOS는 이미지를 템플릿으로 틴트하므로 색은 시스템이 입힌다.
// ⚠️ SVG 파일은 안 된다 — 라이브러리의 iOS 쪽에 SVG 디코더가 없다(안드로이드만 지원).
const TAB_ICONS = {
  MainTab: require('../../assets/tab-icons/globe.png'),
  StatsTab: require('../../assets/tab-icons/stats.png'),
  SocialTab: require('../../assets/tab-icons/social.png'),
  ProfileTab: require('../../assets/tab-icons/profile.png'),
};
const ACTIVE_TINT = '#FFFFFF';
const INACTIVE_TINT = '#9DB2CE';

function AndroidTabNavigator() {
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

function IosTabNavigator() {
  // 빠른공유(카드 드래그)·병합 모드와 튜토리얼 중에는 바를 내린다.
  // CustomTabBar는 이 신호로 pointerEvents·딤을 처리했지만, 네이티브 바는 JS가 덮을 수
  // 없으므로 시스템 애니메이션으로 통째로 숨기는 것이 유일한 방법이다.
  const hidden = useTabBarHidden();
  const coachActive = useCoachActive();

  return (
    <NativeTab.Navigator
      // headerShown은 넘기지 않는다 — 네이티브 탭 네비게이터는 헤더를 아예 그리지 않아
      // 그런 옵션 자체가 없다(타입 에러). 상단 헤더는 상위 Stack이 이미 꺼 둔다.
      tabBarActiveTintColor={ACTIVE_TINT}
      tabBarInactiveTintColor={INACTIVE_TINT}
      translucent
      hapticFeedbackEnabled
      // iOS 26+ 전용. 하위 버전은 이 prop을 무시하므로 분기하지 않는다.
      minimizeBehavior="onScrollDown"
      tabBarHidden={hidden || coachActive}
      // lazy:false — 네 탭을 앱 시작 때 전부 마운트한다(2026-09-20 사용자 요청).
      // 네이티브 탭은 누르는 즉시 컨테이너를 바꾸고 JS는 그제야 그 화면을 처음 그리므로,
      // 지연 마운트면 첫 방문마다 화면이 그려질 때까지 빈(검은) 프레임이 보인다. JS 탭바 시절엔
      // 새 화면이 커밋될 때까지 이전 화면이 남아 있어 이 공백이 없었다. 미리 그려 두면 전환이
      // 즉시 되지만 콜드 스타트에 소셜·프로필·통계 마운트 비용이 얹힌다 — 체감이 나쁘면 되돌릴 것.
      screenOptions={{ lazy: false }}
    >
      <NativeTab.Screen
        name="MainTab"
        component={MainScreen}
        options={{
          title: 'Globe',
          tabBarIcon: () => TAB_ICONS.MainTab,
        }}
      />
      <NativeTab.Screen
        name="StatsTab"
        component={StatsScreen}
        options={{
          title: 'Analysis',
          tabBarIcon: () => TAB_ICONS.StatsTab,
        }}
      />
      <NativeTab.Screen
        name="SocialTab"
        component={SocialScreen}
        options={{
          title: 'Social',
          tabBarIcon: () => TAB_ICONS.SocialTab,
        }}
      />
      <NativeTab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          title: 'Profile',
          tabBarIcon: () => TAB_ICONS.ProfileTab,
        }}
      />
    </NativeTab.Navigator>
  );
}

const TabNavigator = Platform.OS === 'ios' ? IosTabNavigator : AndroidTabNavigator;

export default TabNavigator;
