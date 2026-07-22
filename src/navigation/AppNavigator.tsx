import React, { useEffect, useRef } from 'react';
import { Alert, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
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
import ProfileTicketScreen from '../screens/ProfileTicketScreen';
import UserFollowListScreen from '../screens/UserFollowListScreen';
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
import MomentCaptureScreen from '../screens/MomentCaptureScreen';
import AlbumCreateScreen from '../screens/AlbumCreateScreen';
import FriendsScreen from '../screens/FriendsScreen';
import DMScreen from '../screens/DMScreen';
import BestCutScreen from '../screens/BestCutScreen';
import TabNavigator from './TabNavigator';
import { navigationRef } from './navigationRef';
import { supabase } from '../services/supabase';
import { exchangeAuthCode, wasIntentionalSignOut } from '../services/auth';
import { emitToast } from '../store/toastStore';
import { parseAppLink, openAppLink } from '../utils/appLinks';
import { savePendingInvite } from '../utils/pendingInvite';
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

  // 딥링크: eorth://user/<handle> → 메이트찾기 화면을 해당 핸들로 검색 상태로 연다
  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url) return;
      const trimmed = url.trim();

      // 내비게이션 준비를 기다렸다 이동 — 콜드 스타트에서 1회 재시도로는 컨테이너 마운트를
      // 놓쳐 화면 이동이 영영 안 될 수 있어(세션은 이미 교환됨) 최대 ~5초 재시도한다.
      const navigateWhenReady = (fn: () => void, attempts = 10) => {
        if (navigationRef.current?.isReady()) { fn(); return; }
        if (attempts <= 0) return;
        setTimeout(() => navigateWhenReady(fn, attempts - 1), 500);
      };

      // 비밀번호 재설정 딥링크: code 를 세션으로 교환한 뒤 새 비밀번호 설정 화면으로 이동
      if (/eorth:\/\/reset-password/i.test(trimmed)) {
        const cm = /[?&]code=([^&]+)/.exec(trimmed);
        const code = cm ? decodeURIComponent(cm[1]) : null;
        if (!code) {
          // 만료/사용된 링크는 Supabase가 code 없이 error_code=otp_expired 로 리다이렉트한다 —
          // 무음 방치하면 "링크를 눌렀는데 아무 일도 없음"이 되므로 반드시 안내한다.
          Alert.alert(tRef.current('login.linkErrorTitle'), tRef.current('login.linkExpiredMsg'));
          return;
        }
        const result = await exchangeAuthCode(code);
        if (!result.ok) {
          Alert.alert(tRef.current('login.linkErrorTitle'), result.error ?? tRef.current('login.linkExpiredMsg'));
          return;
        }
        navigateWhenReady(() => navigationRef.current?.navigate('ResetPassword'));
        return;
      }

      // 이메일 가입 인증 딥링크: code 를 세션으로 교환 후 Splash로 → 온보딩/메인 자동 분기
      if (/eorth:\/\/email-confirm/i.test(trimmed)) {
        const cm = /[?&]code=([^&]+)/.exec(trimmed);
        const code = cm ? decodeURIComponent(cm[1]) : null;
        if (!code) {
          Alert.alert(tRef.current('login.linkErrorTitle'), tRef.current('login.linkExpiredMsg'));
          return;
        }
        const result = await exchangeAuthCode(code);
        if (!result.ok) {
          Alert.alert(tRef.current('login.linkErrorTitle'), result.error ?? tRef.current('login.linkExpiredMsg'));
          return;
        }
        // Splash가 세션·온보딩 완료 여부를 확인해 BasicInfo(신규) 또는 Main으로 보낸다.
        navigateWhenReady(() => navigationRef.current?.reset({ index: 0, routes: [{ name: 'Splash' }] }));
        return;
      }

      // eorth://profile|user/<handle> → 해당 프로필 화면으로 직행 (조회 실패 시 메이트찾기 폴백)
      // eorth://post/<id> → 해당 게시물 상세로 직행
      const link = parseAppLink(trimmed);
      if (!link) return;
      // 방어 심화: 인증되어 본화면(Main)에 진입한 상태에서만 내부 화면으로 이동한다.
      // 미인증 상태의 딥링크로 인증 화면이 열리는 것을 막고, 콜드 스타트에서는
      // Main 진입까지 잠시(최대 ~5초) 기다렸다 이동(그 사이 인증 안 되면 무시).
      const tryGo = (attempts: number) => {
        const authed = navigationRef.current?.getRootState?.()?.routes?.some((r) => r.name === 'Main');
        if (authed) {
          openAppLink(link, (name, params) =>
            (navigationRef.current?.navigate as (n: string, p?: object) => void)?.(name, params)
          ).catch(() => {});
        } else if (attempts > 0) {
          setTimeout(() => tryGo(attempts - 1), 800);
        } else if (link.type === 'profile') {
          // attempts 소진 = 미인증(로그인/온보딩 전) — 초대 링크를 버리지 않고 보관.
          // 온보딩 완료 후 첫 메인 진입(MainScreen)에서 메이트 연결 넛지로 소비된다(원샷·7일 만료).
          // 수신 즉시가 아니라 소진 시점에 저장하는 이유: 콜드 스타트의 로그인 유저는
          // 재시도 중 Main에 진입해 정상 직행하므로, 그 경우 넛지가 중복되지 않게 한다.
          savePendingInvite(link.handle);
        }
      };
      tryGo(6);
    };
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    Linking.getInitialURL().then(handleUrl).catch(() => {});
    return () => sub.remove();
  }, []);

  // 푸시 알림 탭 → 관련 화면으로 이동
  //   dm → 해당 대화, like/comment/reply/friend_post → 게시물, 메이트 → 프로필.
  //   인증되어 Main에 진입한 뒤에만 이동(콜드 스타트는 최대 ~6.4초 재시도). 동일 알림 중복 처리 방지.
  useEffect(() => {
    const processed = new Set<string>();
    const routeFromData = (data: unknown) => {
      const d = (data ?? {}) as Record<string, unknown>;
      const go = (attempts: number) => {
        const authed = navigationRef.current?.getRootState?.()?.routes?.some((r) => r.name === 'Main');
        if (!authed || !navigationRef.current?.isReady()) {
          if (attempts > 0) setTimeout(() => go(attempts - 1), 800);
          return;
        }
        const navigate = (name: string, params?: object) =>
          (navigationRef.current?.navigate as (n: string, p?: object) => void)?.(name, params);
        if (d.type === 'dm' && d.handle) {
          const h = String(d.handle);
          navigate('DM', { friend: { name: h, handle: h, emoji: '💬' } });
        } else if (d.type === 'snap') {
          navigate('SnapRecord'); // 여행 중 스냅 유도 알림 → 스냅 기록
        } else if (d.type === 'moment') {
          navigate('MomentCapture'); // 여행 기억 알림 → 모먼트 캡처
        } else if (d.type === 'arrival') {
          navigate('NewRecord'); // 해외 도착 알림 → 기록 작성
        } else if (d.postId) {
          openAppLink({ type: 'post', id: String(d.postId) }, navigate).catch(() => {});
        } else if (d.actorId) {
          navigate('FriendProfile', { userId: String(d.actorId) });
        }
      };
      go(8);
    };
    const routeFromResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification?.request?.identifier;
      if (id) { if (processed.has(id)) return; processed.add(id); }
      routeFromData(response.notification?.request?.content?.data);
    };
    // 앱 실행 중(포그라운드/백그라운드) 탭
    const sub = Notifications.addNotificationResponseReceivedListener(routeFromResponse);
    // 콜드 스타트: 앱이 꺼진 상태에서 푸시 탭으로 실행된 경우
    Notifications.getLastNotificationResponseAsync().then(routeFromResponse).catch(() => {});
    return () => sub.remove();
  }, []);

  // 세션 무효화 대응: refresh 토큰 만료·서버측 로그아웃 등으로 SIGNED_OUT 이 발생하면
  // 로그인 플로우(Splash)로 강제 이동한다. 토큰만 끊기고 화면은 로그인 상태로 남아
  // API가 401만 받던 문제를 막는다. (이미 인증 전 화면이면 중복 이동·루프 방지)
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return;
      // 사용자가 직접 실행한 로그아웃/탈퇴/재설정이면 해당 화면이 흐름을 책임진다 — 오탐 안내 방지
      if (wasIntentionalSignOut()) return;
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
        <Stack.Screen
          name="ProfileTicket"
          component={ProfileTicketScreen}
          options={{
            // 탑시트: 위에서 아래로 내려오고, 위로 스와이프하면 닫힌다(vertical-inverted).
            // 전역 cardStyleInterpolator(가로 슬라이드)를 화면 전용 세로 인터폴레이터로 덮어쓴다.
            // transparentModal: 뒤 화면(프로필 탭)을 계속 렌더 — 티켓 카드 실루엣 밖·파인 노치로 프로필이 비친다.
            presentation: 'transparentModal',
            cardStyle: { backgroundColor: 'transparent' },
            gestureDirection: 'vertical-inverted',
            // 닫기 버튼 없이 스와이프로만 닫는 화면 — 화면 어디서든 위로 끌면 닫히게 인식 범위 확장
            gestureResponseDistance: 1000,
            cardStyleInterpolator: ({ current, layouts }) => ({
              cardStyle: {
                transform: [
                  {
                    translateY: current.progress.interpolate({
                      inputRange: [0, 1],
                      // 화면 위(-height)에서 시작해 0으로 내려온다(탑시트)
                      outputRange: [-layouts.screen.height, 0],
                      // clamp: 아래로 과도하게 스와이프(progress>1) 시 외삽으로 밀려 내려가는 것 방지.
                      // 위로 스와이프 닫기(progress 1→0)는 그대로 동작.
                      extrapolate: 'clamp',
                    }),
                  },
                ],
              },
            }),
          }}
        />
        <Stack.Screen name="UserFollowList" component={UserFollowListScreen} />
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
          name="MomentCapture"
          component={MomentCaptureScreen}
          options={{
            presentation: 'transparentModal',
            animation: 'slide_from_bottom',
            headerShown: false,
            cardStyle: { backgroundColor: 'transparent' },
          }}
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
