import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography } from '../constants';
import { useRecords } from '../store/recordStore';
import { useSettings } from '../store/settingsStore';
import { useDM } from '../store/dmStore';
import { clearPersistedStores } from '../store/persist';
import { getPendingDeletion, isDeletionExpired, clearLocalDeletionFlag } from '../store/pendingDeletion';
import { purgeAccountOnServer } from '../services/accountDeletion';
import { isSupabaseConfigured } from '../services/supabase';
import { getCurrentSession, signOut } from '../services/auth';
import { isOnline } from '../utils/connectivity';
import { getMyProfileStatus } from '../services/profile';
import { useAccountBoundary } from '../hooks/useAccountBoundary';
import type { RootStackScreenProps } from '../navigation/types';

type Props = RootStackScreenProps<'Splash'>;

export default function SplashScreen({ navigation }: Props) {
  const scaleAnim = useRef(new Animated.Value(0.6)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const { resetRecords } = useRecords();
  const { resetSettings } = useSettings();
  const { resetConversations } = useDM();
  const runAccountBoundary = useAccountBoundary();

  useEffect(() => {
    // Entrance animations
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 60,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      // Glow pulse
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1800, useNativeDriver: true }),
        ]),
        { iterations: 2 }
      ),
    ]).start();

    // 2.8초 후 이동 — 로그인 세션이 있으면 Main으로 자동 로그인, 없으면 AppIntro
    // ⚠️ 임시: 온보딩 플로우 확인용. 자동 로그인을 끄려면 true로 둔다. 작업 끝나면 false로 되돌릴 것!
    const FORCE_ONBOARDING = false;
    const timer = setTimeout(async () => {
      if (isSupabaseConfigured && !FORCE_ONBOARDING) {
        const session = await getCurrentSession();
        // 확실히 오프라인이면 서버 확인(탈퇴 유예·온보딩 판정)을 건너뛰고 즉시 Main 진입 —
        // 오지/기내에서 타임아웃(12초×2)을 기다리며 스플래시에 갇히지 않게 한다.
        // (세션이 있다 = 이 기기에서 온보딩까지 마친 사용자. 유예 검사는 다음 온라인 실행이 처리)
        if (session && (await isOnline()) === false) {
          await runAccountBoundary(); // 내부 서버 호출은 로컬 폴백으로 즉시 종료됨
          navigation.replace('Main');
          return;
        }
        const pending = session ? await getPendingDeletion() : null;
        // 탈퇴 유예(30일) 만료 → 서버(게시물·Storage·auth 계정)까지 영구 파기 후 초기 화면으로.
        // 파기 실패(오프라인 등) 시에도 자동 로그인은 막고, 다음 로그인에서 이어서 처리한다.
        if (session && pending && isDeletionExpired(pending)) {
          const purged = await purgeAccountOnServer('full');
          if (purged) {
            resetRecords();
            resetSettings();
            resetConversations();
            await clearPersistedStores().catch(() => {});
            await clearLocalDeletionFlag().catch(() => {});
          }
          await signOut(); // 파기된(또는 유예 만료된) 계정의 토큰 제거
          navigation.replace('AppIntro');
          return;
        }
        // 탈퇴 유예 중이면 자동 로그인하지 않고 로그인 화면에서 복구 여부를 묻는다
        if (session && !pending) {
          // 계정 경계 처리: 세션이 이전과 다른 계정이면(예: 이메일 인증 딥링크로 진입)
          // 이전 계정 로컬을 비우고 새 계정 데이터를 복원한다. 같은 계정이면 no-op.
          await runAccountBoundary();
          // 온보딩 완료(생일 채움) 여부를 확인해, 미완이면 온보딩으로 재진입시킨다.
          // (인증만 하고 온보딩 중 이탈한 사용자가 재실행 시 프로필 없이 메인에 들어가는 것 방지)
          // ⚠️ getMyProfile은 실패 시 throw가 아니라 null을 반환해 "오프라인=신규"로 오판됐다 —
          //    reached 플래그(getMyProfileStatus)로 서버 도달 여부를 구분한다.
          let onboarded = false;
          const { reached, profile } = await getMyProfileStatus();
          if (!reached) {
            // 서버 도달 실패(오프라인/타임아웃): 세션이 있으니 기존 사용자로 간주(Main) — 재온보딩 강제 방지
            onboarded = true;
          } else {
            onboarded = !!(profile && profile.birthday && profile.birthday.trim());
          }
          navigation.replace(onboarded ? 'Main' : 'BasicInfo');
          return;
        }
      }
      navigation.replace('AppIntro');
    }, 2800);

    return () => clearTimeout(timer);
  }, []);

  const glowScale = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });
  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.5, 1, 0.5],
  });

  return (
    <LinearGradient colors={['#0A0118', '#100620', '#0A0118']} style={styles.container}>
      {/* Background radial glow */}
      <Animated.View
        style={[
          styles.bgGlow,
          { opacity: glowOpacity, transform: [{ scale: glowScale }] },
        ]}
      />

      {/* Globe */}
      <Animated.View
        style={[
          styles.globeContainer,
          { opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        {/* Outer ring */}
        <View style={styles.globeRingOuter} />
        {/* Middle ring */}
        <View style={styles.globeRingMid} />
        {/* Globe body */}
        <LinearGradient
          colors={['#4A2FCB', '#7B61FF', '#C084FC']}
          start={{ x: 0.2, y: 0.1 }}
          end={{ x: 0.8, y: 0.9 }}
          style={styles.globe}
        >
          {/* Latitude lines */}
          <View style={styles.latLine} />
          <View style={[styles.latLine, { top: '55%' }]} />
          {/* Longitude line */}
          <View style={styles.lonLine} />
        </LinearGradient>
      </Animated.View>

      {/* Brand Text */}
      <Animated.View style={[styles.brandContainer, { opacity: textOpacity }]}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.brandLogoImage}
          resizeMode="contain"
        />
        <Text style={styles.brandTagline}>이 어 스</Text>
      </Animated.View>
    </LinearGradient>
  );
}

const GLOBE_SIZE = 160;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgDeep,
  },
  bgGlow: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(123, 97, 255, 0.12)',
  },
  globeContainer: {
    width: GLOBE_SIZE + 60,
    height: GLOBE_SIZE + 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  globeRingOuter: {
    position: 'absolute',
    width: GLOBE_SIZE + 60,
    height: GLOBE_SIZE + 60,
    borderRadius: (GLOBE_SIZE + 60) / 2,
    borderWidth: 1,
    borderColor: 'rgba(123, 97, 255, 0.2)',
  },
  globeRingMid: {
    position: 'absolute',
    width: GLOBE_SIZE + 30,
    height: GLOBE_SIZE + 30,
    borderRadius: (GLOBE_SIZE + 30) / 2,
    borderWidth: 1,
    borderColor: 'rgba(123, 97, 255, 0.35)',
  },
  globe: {
    width: GLOBE_SIZE,
    height: GLOBE_SIZE,
    borderRadius: GLOBE_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7B61FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 20,
  },
  latLine: {
    position: 'absolute',
    top: '35%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  lonLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  brandContainer: {
    alignItems: 'center',
  },
  brandLogoImage: {
    width: 182,
    height: 50,
    marginBottom: 8,
  },
  brandTagline: {
    fontSize: Typography.fontSize.base,
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 8,
    marginTop: 4,
  },
});
