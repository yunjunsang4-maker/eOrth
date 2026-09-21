import { warn } from '../utils/haptics';
import React, { useState, useRef, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  BackHandler,
} from 'react-native';
import { Text } from '../ui/Text';

// 생성 이모티콘(AI 커스텀, 다크 보라 3D 글로시) — 시스템 이모지 대체
const EMOJI_CHECK = require('../../assets/emoji/check.png');
import { useTranslation } from 'react-i18next';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { privacyPolicyUrl, termsUrl } from '../constants/legalLinks';
import * as WebBrowser from 'expo-web-browser';
import { EorthLogo } from '../components/EorthLogo';
import StarFieldBackground from '../components/StarFieldBackground';
import { IntroAmbient } from './introVisuals';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { useDM } from '../store/dmStore';
import { clearPersistedStores } from '../store/persist';
import {
  getPendingDeletion,
  isDeletionExpired,
  cancelAccountDeletion,
  clearLocalDeletionFlag,
  daysUntilPurge,
} from '../store/pendingDeletion';
import { purgeAccountOnServer } from '../services/accountDeletion';
import { signInWithProvider, getAuthProvider, getAuthEmail, signOut } from '../services/auth';
import { getMyProfileStatus } from '../services/profile';
import { useAccountBoundary } from '../hooks/useAccountBoundary';
import { withTimeout } from '../utils/withTimeout';
import * as Network from 'expo-network';
import { GoogleIcon, AppleIcon } from '../components/icons';
import type { RootStackScreenProps } from '../navigation/types';
import { andFitText } from '../utils/fitText';

type Props = RootStackScreenProps<'Login'>;

// 가입·로그인 통합 화면 — 이메일/비밀번호 경로는 폐지되고 소셜(Google·Apple)만 남는다.
// 신규/기존 구분은 화면이 아니라 인증 후 프로필의 onboarded_at으로 판정한다(아래 handleSocialLogin).
export default function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  // i18n.language는 약관·방침의 한/영 게시본을 고르는 데 쓴다(legalLinks).
  const { t, i18n } = useTranslation();
  const { setSignUpMethod, setSignUpEmail, resetSettings, setOnboardedAt } = useSettings();
  const { resetRecords } = useRecords();
  const { resetConversations } = useDM();
  const runAccountBoundary = useAccountBoundary();

  // Social login modals state
  const [socialModal, setSocialModal] = useState<'google' | 'apple' | null>(null);
  const [socialLoading, setSocialLoading] = useState(false);
  const [authSuccess, setAuthSuccess] = useState(false);
  // 시도 세대 — 45초 안전장치가 오버레이를 닫은 뒤 매달렸던 SDK 프라미스가 3분 시점에
  // 풀리면(시트 타임아웃) 두 번째 알림이 또 떴다. 안전장치가 세대를 올리면 늦은 결과는 폐기한다.
  const socialAttemptRef = useRef(0);

  // 오버레이 최후 안전장치 — 이 오버레이는 취소 버튼이 없고 뒤로가기도 막혀 있어(아래 BackHandler),
  // 로딩이 안 풀리면 앱 강제종료 외에 탈출구가 없다. 내부 호출마다 타임아웃을 걸었지만
  // 예상 못 한 경로가 매달릴 경우를 대비해 여기서 한 번 더 끊는다.
  // 정상 흐름의 최악(토큰 15s + 프로필 12s + 표시 0.6s ≈ 28s)보다 넉넉히 잡아 오탐을 막는다.
  useEffect(() => {
    if (!socialLoading) return;
    const timer = setTimeout(() => {
      socialAttemptRef.current += 1; // 진행 중이던 시도 무효화 — 늦게 풀린 프라미스가 알림·이동을 못 하게
      setSocialLoading(false);
      setSocialModal(null);
      setAuthSuccess(false);
      Alert.alert(t('login.loginFailed'), t('authErr.timeout'));
    }, 45000);
    return () => clearTimeout(timer);
  }, [socialLoading, t]);

  // 로딩 중 안드로이드 뒤로가기 차단 — Modal이던 시절 onRequestClose가 하던 역할.
  // (절대위치 View로 바꾸며 백 버튼 처리가 사라져, 로딩 중 화면 이탈이 가능해지는 것을 막는다)
  useEffect(() => {
    if (socialModal === null) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [socialModal]);

  // 실제 소셜 로그인 (Supabase OAuth). 로딩/성공 오버레이만 모달로 표시하고
  // 실제 인증은 인앱 브라우저에서 진행된다. (가짜 계정 선택 화면 없음)
  const handleSocialLogin = async (provider: 'google' | 'apple') => {
    if (socialLoading) return; // 중복 탭 방지
    // 네트워크 사전 점검 — 끊긴 상태면 명확히 안내(브라우저가 '취소'로 오표기되는 것 방지)
    try {
      const net = await Network.getNetworkStateAsync();
      if (net.isConnected === false) {
        Alert.alert(t('login.loginFailed'), t('login.networkError'));
        return;
      }
    } catch {
      // 점검 실패 시 그냥 진행
    }
    const myAttempt = ++socialAttemptRef.current;
    setSocialModal(provider);
    setSocialLoading(true);
    setAuthSuccess(false);
    const result = await signInWithProvider(provider);
    // 45초 안전장치가 이미 이 시도를 끝냈으면(알림도 띄웠음) 늦은 결과는 조용히 폐기
    if (myAttempt !== socialAttemptRef.current) return;
    if (!result.ok) {
      setSocialModal(null);
      setSocialLoading(false);
      // 사용자가 인증창을 닫아 취소한 경우엔 오류 알림을 띄우지 않는다.
      if (!result.cancelled) {
        Alert.alert(t('login.loginFailed'), result.error || t('login.tryAgain'));
      }
      return;
    }
    setAuthSuccess(true);
    // 온보딩을 마친 사용자면 로그인(Main), 아니면 온보딩(BasicInfo).
    // ⚠️ DB 트리거가 가입 즉시 빈 프로필 행을 생성하므로 "행 존재"로 판정하면 신규도 기존으로 오판된다.
    //    → onboarded_at이 채워졌는지(온보딩 완료 신호)로 신규/기존을 구분한다.
    // 프로필 조회 실패 시에도 멈추지 않도록 기본값(BasicInfo)으로 안전하게 진행
    let dest: 'BasicInfo' | 'Main' = 'BasicInfo';
    let reached = false; // 프로필 조회가 서버에 도달했는가(신규/기존 판정 신뢰 가능 여부)
    // 계정의 원래 가입 수단을 반영한다. 연동 계정이면 최초 provider가 우선(예: 이메일 계정에 구글 연동 시 email 유지).
    // 조회 실패 시 방금 사용한 provider로 폴백.
    let accountProvider: 'email' | 'google' | 'apple' = provider;
    let accountEmail: string | null = null;
    try {
      // 병렬 조회 + 타임아웃 (느린/끊긴 네트워크에서 무한 대기 방지)
      const [status, original, email] = await withTimeout(
        Promise.all([getMyProfileStatus(), getAuthProvider(), getAuthEmail()]),
        12000,
      );
      reached = status.reached;
      if (status.profile && status.profile.onboarded_at) {
        dest = 'Main';
        // 서버가 온보딩 완료를 알고 있으면 로컬 사본을 채운다 — 오프라인 판정이 이 값만 본다.
        setOnboardedAt(Date.parse(status.profile.onboarded_at) || Date.now());
      }
      if (original) accountProvider = original;
      accountEmail = email;
    } catch {
      // 타임아웃/조회 실패 → reached=false 로 처리(아래에서 Splash 재평가)
    }
    const applyInfo = () => {
      setSignUpMethod(accountProvider);
      if (accountEmail) setSignUpEmail(accountEmail);
    };
    // 성공 표시를 잠깐 보여준 뒤 진행. 네비게이션 완료까지 로딩 인디케이터를 유지한다.
    await new Promise((r) => setTimeout(r, 600));
    try {
      if (!reached) {
        // 프로필 판정 불가(일시적 오류) → 온보딩/메인으로 잘못 보내지 않고 Splash에서 재평가한다.
        applyInfo();
        navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
        return;
      }
      // OAuth는 이미 Supabase 세션 생성됨 → 가입정보 적용 후 분기
      await proceedAfterAuth(applyInfo, dest);
    } finally {
      setSocialLoading(false);
      setSocialModal(null);
    }
  };

  // 약관·방침 열기 — 설정 화면과 동일하게 인앱 브라우저, 실패 시 주소를 직접 안내한다.
  const openLegal = (url: string) => {
    WebBrowser.openBrowserAsync(url).catch(() => {
      Alert.alert(t('settings.terms'), url);
    });
  };

  const handleGooglePress = () => handleSocialLogin('google');
  const handleApplePress = () => handleSocialLogin('apple');

  // ─── 탈퇴 유예 계정 처리 ───
  // 로그인 성공 시 탈퇴 신청 여부(서버 플래그)를 확인한다.
  //  - 유예 기간(30일) 내 → 복구 여부를 묻고, 복구하면 서버 플래그 해제 후 Main 진입
  //  - 만료 → 서버(게시물·Storage·auth 계정)까지 영구 파기 후 새 가입 안내
  // applySignup: 가입 정보(이메일·가입 수단 등) 적용 콜백. 파기 후에도 다시 적용되도록 콜백으로 받는다.
  const purgeLocalData = () => {
    resetRecords();
    resetSettings();
    resetConversations();
    clearPersistedStores().catch(() => {});
  };

  // 인증 후엔 로그인/온보딩 화면을 스택에서 제거(뒤로가기로 복귀 방지)
  const goTo = (dest: 'BasicInfo' | 'Main') =>
    navigation.reset({ index: 0, routes: [{ name: dest }] });

  // destination: 신규 가입은 온보딩(BasicInfo), 기존 사용자 로그인은 Main
  const proceedAfterAuth = async (applySignup: () => void, destination: 'BasicInfo' | 'Main' = 'BasicInfo') => {
    // 계정 전환이면 로컬을 비우고 새 계정 데이터를 복원한 뒤 진행
    await runAccountBoundary();

    // 서버 플래그 우선 조회(도달 실패 시 로컬 캐시 폴백) — 조회 자체는 throw하지 않는다
    const pending = await getPendingDeletion();

    if (!pending) {
      applySignup();
      goTo(destination);
      return;
    }

    if (isDeletionExpired(pending)) {
      // 유예 만료 — 서버까지 영구 파기. 실패 시 로컬도 지우지 않고 다음 로그인에서 재시도한다.
      const purged = await purgeAccountOnServer('full');
      await signOut(); // 파기 성공 여부와 무관하게 만료 계정으로는 진입시키지 않는다
      if (!purged) {
        Alert.alert(t('login.purgeFailTitle'), t('login.purgeFailMsg'));
        return;
      }
      purgeLocalData();
      await clearLocalDeletionFlag().catch(() => {});
      Alert.alert(t('login.purgedTitle'), t('login.purgedMsg'));
      return;
    }

    warn(); // 되돌릴 수 없는 동작을 묻는 중
    Alert.alert(
      t('login.recoverTitle'),
      t('login.recoverMsg', { days: daysUntilPurge(pending) }),
      [
        {
          text: t('login.recoverFresh'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              // 콘텐츠만 서버 파기(계정·로그인 수단은 유지) 후 재온보딩
              const purged = await purgeAccountOnServer('content');
              if (!purged) {
                Alert.alert(t('login.purgeFailTitle'), t('login.purgeFailMsg'));
                return;
              }
              purgeLocalData();
              await clearLocalDeletionFlag().catch(() => {});
              applySignup();
              goTo('BasicInfo');
            })();
          },
        },
        {
          text: t('login.recoverRestore'),
          onPress: () => {
            void (async () => {
              // 서버 플래그 해제가 확인돼야 복구 완료 — 실패 시 진입시키면
              // 30일 후 안전망 파기가 복구된 줄 아는 계정을 지워버린다.
              try {
                await cancelAccountDeletion();
              } catch {
                Alert.alert(t('login.recoverFailTitle'), t('login.recoverFailMsg'));
                return;
              }
              // recoverFresh와 동일하게 가입 정보를 적용한다 — 빠뜨리면 가입 수단이 기본값('email')로
              // 남아 소셜 계정이 이메일 계정으로 오인되고(비밀번호 변경·탈퇴 흐름이 어긋남) 이메일도 기본값이 된다.
              applySignup();
              goTo('Main');
            })();
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <StarFieldBackground opacity={0.5} />
      <IntroAmbient />
      {/* 입력 필드가 없어 키보드가 뜨지 않으므로 KeyboardAvoidingView는 두지 않는다.
          ScrollView는 작은 화면(가로 모드·큰 글씨 설정)에서 약관 상자가 잘리는 것만 막는 용도라
          flexGrow:1 + space-between으로 로고는 위, 버튼·약관 묶음은 아래에 붙고 가운데가 빈다. */}
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand — 온보딩과 동일한 eorth 워드마크 */}
        <View style={styles.brandSection}>
          <EorthLogo width={150} />
          <Text style={styles.tagline}>{t('login.tagline')}</Text>
        </View>

        {/* 하단 묶음: 약관 문구 → 법적 문서 → 소셜 버튼. 로고와 떨어뜨려 화면 아래쪽에 모은다. */}
        <View style={styles.bottomGroup}>
        {/* 약관 안내 — 가입 시점에 전문을 볼 수단이 없으면 심사에서 지적되고, 문서 이름만
            걸어두면 무엇에 동의하는지도 알 수 없다. 그래서 ① 무엇에 동의하는지 한 문장,
            ② 문서별로 어떤 내용을 담는지 한 줄 요약, ③ 탭하면 전문(인앱 브라우저) 세 가지를 함께 둔다.
            문장 안의 단어를 쪼개 링크로 만들지 않는 이유는 언어별 어순 때문에 깨지기 때문이다.
            가입·로그인이 한 화면으로 합쳐져 문구도 termsLogin 하나로 고정한다. */}
        <Text style={styles.termsText}>{t('login.termsLogin')}</Text>
        <View style={styles.legalBox}>
          <TouchableOpacity
            style={styles.legalRow}
            onPress={() => openLegal(termsUrl(i18n.language))}
            accessibilityRole="link"
            accessibilityLabel={`${t('settings.termsTitle')} ${t('login.legalView')}`}
          >
            <View style={styles.legalTextCol}>
              <Text style={styles.legalTitle}>{t('settings.termsTitle')}</Text>
              <Text style={styles.legalDesc}>{t('login.legalTermsDesc')}</Text>
            </View>
            <Text style={styles.legalView}>{t('login.legalView')}</Text>
          </TouchableOpacity>
          <View style={styles.legalDivider} />
          <TouchableOpacity
            style={styles.legalRow}
            onPress={() => openLegal(privacyPolicyUrl(i18n.language))}
            accessibilityRole="link"
            accessibilityLabel={`${t('settings.privacyPolicy')} ${t('login.legalView')}`}
          >
            <View style={styles.legalTextCol}>
              <Text style={styles.legalTitle}>{t('settings.privacyPolicy')}</Text>
              <Text style={styles.legalDesc}>{t('login.legalPrivacyDesc')}</Text>
            </View>
            <Text style={styles.legalView}>{t('login.legalView')}</Text>
          </TouchableOpacity>
        </View>

        {/* Social login options — 가입·로그인 공용 진입점 */}
        <View style={styles.socialSection}>
          {/* Google */}
          <TouchableOpacity
            style={styles.socialBtn}
            activeOpacity={0.85}
            onPress={handleGooglePress}
            disabled={socialLoading}
            accessibilityRole="button"
            accessibilityLabel={t('login.googleContinue')}
          >
            <GoogleIcon size={20} />
            <Text style={styles.socialBtnText} {...andFitText}>{t('login.googleContinue')}</Text>
          </TouchableOpacity>

          {/* Apple — iOS 전용 노출 (App Store 정책상 iOS에서만 제공) */}
          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={[styles.socialBtn, styles.appleBtn]}
              activeOpacity={0.85}
              onPress={handleApplePress}
              disabled={socialLoading}
              accessibilityRole="button"
              accessibilityLabel={t('login.appleContinue')}
            >
              <AppleIcon size={20} color="#FFFFFF" />
              <Text style={[styles.socialBtnText, { color: Colors.white }]} {...andFitText}>
                {t('login.appleContinue')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        </View>
      </ScrollView>

      {/* 소셜 로그인 로딩 오버레이 — Modal 금지, 절대위치 View로 그린다.
          iOS에서 Modal이 fade로 뜨는 도중에 구글 네이티브 시트를 present하면 UIKit이
          전환 충돌로 시트 표시를 조용히 거부해 SDK 프라미스가 영영 안 풀린다(간헐 '씹힘').
          라이브러리 공식 문서도 로딩 인디케이터 모달과의 동시 표시를 금지한다.
          (사진 피커 뒤 터치 먹통 때 세운 '짧은 수명 로딩 오버레이는 Modal 금지' 규칙과 동일) */}
      {socialModal !== null && (
        <View style={styles.socialModalOverlay}>
          <View style={styles.loaderCard}>
            {authSuccess ? (
              <>
                <Image source={EMOJI_CHECK} style={styles.loaderEmoji} />
                <Text style={styles.loaderText}>{t('login.loginSuccess')}</Text>
              </>
            ) : (
              <>
                <ActivityIndicator size="large" color="#EC34F7" />
                <Text style={styles.loaderText}>{t('login.signingIn')}</Text>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0F' }, // 온보딩과 동일 배경
  scroll: {
    flexGrow: 1,
    justifyContent: 'space-between', // 로고는 위·버튼 묶음은 아래, 가운데는 비운다
    paddingHorizontal: Spacing[4],
  },
  bottomGroup: {
    // 짧은 화면에서 로고와 붙어버리지 않도록 최소 간격만 보장 — 나머지는 space-between이 채운다.
    // 아래 여백은 묶음을 바닥에서 띄워 로고와의 거리를 좁힌다(양끝에 완전히 붙이면 너무 벌어짐).
    marginTop: Spacing[8],
    marginBottom: Spacing[16],
  },

  // Brand — eorth 워드마크 (온보딩과 동일)
  brandSection: {
    alignItems: 'center',
    marginTop: Spacing[20], // 위에서 띄워 하단 묶음과의 거리를 좁힌다
    gap: Spacing[3],
  },
  tagline: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: '#9E9CA1',
    textAlign: 'center',
  },

  // Social
  socialSection: {
    gap: Spacing[3],
    marginTop: Spacing[5] + 3, // 약관 상자 아래에 온다 — 3px는 사용자 미세 조정
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    paddingVertical: 15,
    paddingHorizontal: Spacing[5],
    gap: Spacing[2],
  },
  appleBtn: {
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  socialBtnText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.semiBold,
    color: '#333333',
  },

  // Terms
  termsText: {
    color: Colors.textMuted,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    textAlign: 'center',
    lineHeight: 18,
  },
  legalBox: {
    marginTop: 10,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  legalTextCol: { flex: 1 },
  legalTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
  },
  legalDesc: {
    color: Colors.textMuted,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    lineHeight: 17,
    marginTop: 3,
  },
  legalView: {
    color: Colors.primaryLight,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
  },
  legalDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 14,
  },

  // 소셜 로그인 로딩 오버레이 — Modal이 아닌 절대위치 View(위 JSX 주석 참조).
  // zIndex/elevation으로 화면 내 최상단 보장(형제 요소들 위).
  socialModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 1, 15, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[6],
    zIndex: 100,
    elevation: 100,
  },
  loaderCard: {
    minWidth: 200,
    backgroundColor: '#131018',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 32,
    paddingHorizontal: 40,
    alignItems: 'center',
    gap: 16,
  },
  loaderEmoji: {
    width: 46,
    height: 46,
  },
  loaderText: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
});
