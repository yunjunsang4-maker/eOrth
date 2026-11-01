import React from 'react';
import { Platform } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
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
 * iOS 26에서 시스템이 UITabBar에 리퀴드 글래스를 직접 입혀 준다. JS로 흉내 낸 GlassSurface
 * 폴백보다 정확하고 공짜라 iOS만 갈아탄다. 스크롤 축소는 시스템 minimize(왼쪽 작은 알약으로
 * 모임)를 끄고, modules/tab-scroll-bridge가 바 전체를 제자리에서 작게 줄인다(인스타그램식).
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

// 안드로이드 탭 미리 마운트(2026-11-01 탭 바 지연 진단 ①).
// bottom-tabs는 lazy 기본값이 true라 Stats·Social·Profile을 처음 누르는 그 렌더 패스에서 화면 전체를 마운트한다
// (화면당 수백 ms 추정 — 그동안 탭 바도 멈춘다). iOS처럼 lazy:false로 두면 콜드 스타트에 세 화면 마운트가
// 지구본 첫 렌더와 겹친다. 그래서 지구본 탭에 머무는 동안, 시작 뒤 잠시 기다렸다가 유휴 시점에 한 탭씩
// navigation.preload로 마운트한다(React Navigation 7 — BottomTabView가 preloadedRouteKeys를 렌더 조건에 넣는다).
// 미리 마운트된 탭은 STATE_INACTIVE라 창에 붙지 않아(UI 스레드 측정·그리기 없음) 비용은 JS 마운트·뷰 생성뿐이다.
//  · 지구본 탭에서만 한다 — 다른 탭에서 작업 중(소셜 빠른공유 드래그 등)일 때 새 화면 마운트 effect
//    (setTabBarHidden(false) 등 전역 신호)가 끼어들지 않게. 떠나면 멈추고 돌아오면 남은 탭부터 이어간다.
//  · 튜토리얼 중엔 하지 않는다 — 코치마크 애니메이션·측정과 JS를 다투지 않게.
//  · 이미 가 본 탭을 다시 preload해도 무해하다(이미 마운트돼 있어 렌더 조건만 하나 더 참이 된다).
// ponytail: 지구본 '준비' 신호(GlobeView 내부 globeReady)는 밖으로 나오지 않아 고정 지연으로 대신한다.
//           느린 기기에서 지구본 부팅과 겹치면 PRELOAD_START_MS를 늘리거나 globeReady를 노출해 그 뒤로 미룰 것.
const PRELOAD_START_MS = 3000; // 지구본 탭 진입(=앱 진입) 뒤 첫 탭까지 — 지구본 WebView 부팅·첫 페이로드 주입 뒤로
const PRELOAD_GAP_MS = 1000;   // 탭 사이 — 한 번에 몰아 마운트하면 그 사이 누른 탭이 JS 큐에서 밀린다
const PRELOAD_IDLE_TIMEOUT_MS = 2000; // 유휴가 끝내 안 오면(계속 바쁨) 이 시간 뒤엔 그냥 한다

function AndroidTabPreloader({ state, navigation }: { state: any; navigation: any }) {
  const coachActive = useCoachActive();
  // 'Main' 스택 라우트 자체의 포커스 — 위에 스택 화면(온보딩 ImportComplete·상세·딥링크 화면 등)이 덮고 있으면 false.
  // 이 컴포넌트는 tabBar로 렌더돼 탭별 NavigationProvider 바깥, 즉 Main 라우트의 NavigationProvider 안이라
  // IsFocusedContext가 Main 라우트 값이다(@react-navigation/core NavigationProvider.tsx). 덮인 채로 마운트하면
  // ① 온보딩에선 곧 Main이 새 key로 reset돼 전부 버려지고 ② 체류 종료 Alert가 덮은 화면 위에 뜬다(QA F1).
  const mainFocused = useIsFocused();
  const onGlobe = state.routes[state.index]?.name === 'MainTab';
  const [done, setDone] = React.useState<string[]>([]);
  // params가 있는 탭은 건너뛴다 — 이미 navigate로 간(=마운트된) 탭이고, PRELOAD는 params 없이 오면 그 탭의
  // params를 undefined로 덮어써 openBadgeList 같은 1회성 파라미터와 경합한다(TabRouter PRELOAD, QA F3).
  const next = state.routes.find((r: any) => r.name !== 'MainTab' && r.params == null && !done.includes(r.name))?.name as string | undefined;

  React.useEffect(() => {
    if (!mainFocused || !onGlobe || coachActive || !next) return;
    let idleId: number | null = null;
    const timer = setTimeout(() => {
      idleId = requestIdleCallback(() => {
        idleId = null;
        navigation.preload(next);
        setDone((d) => [...d, next]);
      }, { timeout: PRELOAD_IDLE_TIMEOUT_MS });
    }, done.length === 0 ? PRELOAD_START_MS : PRELOAD_GAP_MS);
    return () => {
      clearTimeout(timer);
      if (idleId != null) cancelIdleCallback(idleId);
    };
  }, [mainFocused, onGlobe, coachActive, next, done.length, navigation]);

  return null;
}

function AndroidTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => (
        <>
          <CustomTabBar {...props} />
          <AndroidTabPreloader state={props.state} navigation={props.navigation} />
        </>
      )}
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
      // 시스템 minimize는 끈다 — 바가 왼쪽 작은 알약으로 모여 버린다(2026-10-09 사용자 요청).
      // 스크롤 축소는 tab-scroll-bridge(Swift)가 tabBar.transform으로 제자리에서 한다.
      minimizeBehavior="never"
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
