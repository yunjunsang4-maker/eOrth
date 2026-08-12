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
import MateRecoConsentScreen from '../screens/MateRecoConsentScreen';
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
import NoticeScreen from '../screens/NoticeScreen';
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
import TravelDnaSurveyScreen from '../screens/TravelDnaSurveyScreen';
import TravelDnaResultScreen from '../screens/TravelDnaResultScreen';
import TabNavigator from './TabNavigator';
import { navigationRef } from './navigationRef';
import { supabase } from '../services/supabase';
import { exchangeAuthCode, hasActiveSession, wasIntentionalSignOut } from '../services/auth';
import { emitToast } from '../store/toastStore';
import { parseAppLink, openAppLink } from '../utils/appLinks';
import { savePendingInvite } from '../utils/pendingInvite';
import { APP_SCHEME } from '../utils/appVariant';
import type { RootStackParamList } from './types';

const Stack = createStackNavigator<RootStackParamList>();

// 인증 딥링크 판별 — 변형 스킴(eorthbeta:// 등)에서도 동작해야 한다(리터럴이면 베타에서 인증 링크 무반응)
const AUTH_LINK_RE = new RegExp(`${APP_SCHEME}:\\/\\/(reset-password|email-confirm)`, 'i');
const RESET_LINK_RE = new RegExp(`${APP_SCHEME}:\\/\\/reset-password`, 'i');
const CONFIRM_LINK_RE = new RegExp(`${APP_SCHEME}:\\/\\/email-confirm`, 'i');

const darkTheme = {
  dark: true,
  colors: {
    primary: '#BF85FC',
    background: '#0A0A0F',
    card: '#0A0A0F',
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
    // 인증 딥링크(가입 인증·비밀번호 재설정)는 URL 단위로 1회만 처리한다.
    // 콜드 스타트에서 getInitialURL()과 'url' 이벤트가 같은 링크를 각각 전달할 수 있는데,
    // 인증 code는 1회용이라 첫 교환이 성공해도 두 번째 교환이 "이미 사용됨" 오류를 내며
    // 알림을 띄운다 — 인증에 성공하고도 '링크 오류'가 뜨던 원인.
    const processedAuthUrls = new Set<string>();
    // 인증 code 디코드 — 잘못된 퍼센트 인코딩이 섞인 링크에서 URIError로 앱이 죽지 않게
    // 실패는 "code 없음(null)"으로 다뤄 만료 링크와 같은 안내 경로를 타게 한다.
    const decodeCode = (raw: string): string | null => {
      try {
        return decodeURIComponent(raw);
      } catch {
        return null;
      }
    };
    const handleUrl = async (url: string | null) => {
      if (!url) return;
      const trimmed = url.trim();
      if (AUTH_LINK_RE.test(trimmed)) {
        if (processedAuthUrls.has(trimmed)) return;
        processedAuthUrls.add(trimmed);
      }

      // 내비게이션 준비를 기다렸다 이동 — 콜드 스타트에서 1회 재시도로는 컨테이너 마운트를
      // 놓쳐 화면 이동이 영영 안 될 수 있어(세션은 이미 교환됨) 최대 ~5초 재시도한다.
      const navigateWhenReady = (fn: () => void, attempts = 10) => {
        if (navigationRef.current?.isReady()) { fn(); return; }
        if (attempts <= 0) return;
        setTimeout(() => navigateWhenReady(fn, attempts - 1), 500);
      };

      // 비밀번호 재설정 딥링크: code 를 세션으로 교환한 뒤 새 비밀번호 설정 화면으로 이동
      if (RESET_LINK_RE.test(trimmed)) {
        const cm = /[?&]code=([^&]+)/.exec(trimmed);
        const code = cm ? decodeCode(cm[1]) : null;
        if (!code) {
          // 만료/사용된 링크는 Supabase가 code 없이 error_code=otp_expired 로 리다이렉트한다 —
          // 무음 방치하면 "링크를 눌렀는데 아무 일도 없음"이 되므로 반드시 안내한다.
          Alert.alert(tRef.current('login.linkErrorTitle'), tRef.current('login.linkExpiredMsg'));
          return;
        }
        const result = await exchangeAuthCode(code);
        if (!result.ok) {
          // 교환 실패여도 세션이 이미 있으면(중복 전달된 링크의 두 번째 시도 등) 정상 진행
          if (await hasActiveSession()) {
            navigateWhenReady(() => navigationRef.current?.navigate('ResetPassword'));
            return;
          }
          Alert.alert(tRef.current('login.linkErrorTitle'), result.error ?? tRef.current('login.linkExpiredMsg'));
          return;
        }
        navigateWhenReady(() => navigationRef.current?.navigate('ResetPassword'));
        return;
      }

      // 이메일 가입 인증 딥링크: code 를 세션으로 교환 후 Splash로 → 온보딩/메인 자동 분기
      if (CONFIRM_LINK_RE.test(trimmed)) {
        const cm = trimmed.match(/[?&]code=([^&]+)/);
        const code = cm ? decodeCode(cm[1]) : null;
        // Splash가 세션·온보딩 완료 여부를 확인해 BasicInfo(신규) 또는 Main으로 보낸다.
        const goSplash = () =>
          navigateWhenReady(() => navigationRef.current?.reset({ index: 0, routes: [{ name: 'Splash' }] }));
        if (!code) {
          // 만료/이미 사용된 링크는 Supabase가 code 없이 error_code=otp_expired 로 리다이렉트한다.
          // 메일 앱의 보안 스캐너가 링크를 먼저 열어 소비한 경우도 여기로 오는데, /verify 는
          // 인증을 먼저 완료한 뒤 리다이렉트하므로 서버에는 인증이 이미 끝나 있다 —
          // "메일 재요청"이 아니라 로그인 안내가 맞다.
          if (await hasActiveSession()) { goSplash(); return; }
          Alert.alert(tRef.current('login.linkErrorTitle'), tRef.current('login.confirmLinkUsedMsg'));
          return;
        }
        const result = await exchangeAuthCode(code);
        if (!result.ok) {
          // 교환 실패여도 세션이 이미 있으면(중복 전달된 링크의 두 번째 시도 등) 성공과 동일 진행
          if (await hasActiveSession()) { goSplash(); return; }
          Alert.alert(tRef.current('login.linkErrorTitle'), tRef.current('login.confirmLinkUsedMsg'));
          return;
        }
        goSplash();
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
    // handleUrl은 async — 이벤트 경로에도 catch가 없으면 처리 중 예외가 unhandled rejection이 된다
    const sub = Linking.addEventListener('url', ({ url }) => { handleUrl(url).catch(() => {}); });
    Linking.getInitialURL().then(handleUrl).catch(() => {});
    return () => sub.remove();
  }, []);

  // 알림 탭 → 관련 화면으로 이동 — 앱 전체에서 이 리스너 하나만 라우팅한다.
  //   (App.tsx에도 같은 리스너가 있었는데 인증 게이트 없이 이중 라우팅해 로그인 화면 위로
  //    내부 화면이 열리는 문제가 있었다. 새 타입을 추가할 곳도 여기 한 곳이다.)
  //   dm → 대화, snap/moment/arrival → 각 기록 화면, 메이트 신청·수락 → 알림 목록,
  //   like/comment/reply/friend_post → 게시물, 그 외 actor 알림 → 프로필.
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
          // 여행 중 스냅 유도 알림 → 스냅 기록. 알림 발송 시각을 함께 넘겨야
          // 스냅 화면이 "알림 후 몇 초 만에 찍었는지"를 표시할 수 있다.
          navigate('SnapRecord', { notifTimestamp: Number(d.timestamp) || undefined });
        } else if (d.type === 'moment') {
          navigate('MomentCapture'); // 여행 기억 알림 → 모먼트 캡처
        } else if (d.type === 'arrival') {
          navigate('NewRecord'); // 해외 도착 알림 → 기록 작성
        } else if (d.type === 'neighbor_request' || d.type === 'neighbor_accept') {
          // 메이트 신청/수락 → 알림 목록(신청은 목록에서 수락·거절 화면으로 이어진다)
          navigate('Notifications');
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
    // 콜드 스타트: 앱이 꺼진 상태에서 푸시 탭으로 실행된 경우.
    // 처리한 뒤에는 마지막 응답을 비운다 — 비우지 않으면 다음 실행 때마다 같은 알림 화면이
    // 다시 열린다(특히 Android의 sticky moment 알림).
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return undefined;
        routeFromResponse(response);
        return Notifications.clearLastNotificationResponseAsync();
      })
      .catch(() => {});
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
          cardStyle: { backgroundColor: '#0A0A0F' },
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
              backgroundColor: '#0A0A0F',
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
        {/* 과거여행 불러오기 3단계 — 스와이프 뒤로가기를 전부 막는다.
            전역 screenOptions가 gestureEnabled: true라 이 스택은 안드로이드에서도 스와이프가 먹는데,
            이 흐름에서는 그게 화면 안의 '이전'·'프로필로 돌아가기' 버튼을 우회한다:
              · 사진 선택 단계에서 스와이프로 나가면 고른 사진이 확인창 없이 통째로 날아가고
              · 스캔 중에 나가면 진행 상태가 어정쩡하게 남는다.
            이탈은 화면 안 버튼으로만 하도록 통일한다(각 단계에 이탈 수단이 모두 있다). */}
        <Stack.Screen
          name="TravelImport"
          component={TravelImportScreen}
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen
          name="MateRecoConsent"
          component={MateRecoConsentScreen}
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen
          name="ImportPhotoSelect"
          component={ImportPhotoSelectScreen}
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen
          name="ImportComplete"
          component={ImportCompleteScreen}
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen name="Main" component={TabNavigator} options={{ gestureEnabled: false }} />
        {/* 여행 DNA 설문 — 중간 이탈 시 답이 날아가므로 스와이프 뒤로가기를 막는다
            (이탈은 화면 안 '건너뛰기'로만, 확인창을 거친다) */}
        <Stack.Screen
          name="TravelDnaSurvey"
          component={TravelDnaSurveyScreen}
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen
          name="TravelDnaResult"
          component={TravelDnaResultScreen}
          options={{ gestureEnabled: false }}
        />
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
        <Stack.Screen name="Notice" component={NoticeScreen} />
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
          // 작성 중 스와이프로 화면이 닫히면 쓰던 글이 날아간다 — 헤더 닫기 버튼으로만 나가게 한다
          // (다른 작성 화면 CutRecord·CutTravelInfo·NewRecord와 동일 규칙)
          options={{ presentation: 'modal', gestureEnabled: false }}
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
          // 사진 고르는 중 스와이프로 닫히면 선택이 통째로 날아간다 — 닫기 버튼으로만 나가게 한다
          options={{ presentation: 'modal', gestureEnabled: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
