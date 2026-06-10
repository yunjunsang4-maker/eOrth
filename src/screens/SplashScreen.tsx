import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography } from '../constants';
import { useRecords } from '../store/recordStore';
import { useSettings } from '../store/settingsStore';
import { useDM } from '../store/dmStore';
import { clearPersistedStores } from '../store/persist';
import { getPendingDeletion, isDeletionExpired, cancelAccountDeletion } from '../store/pendingDeletion';
import type { RootStackScreenProps } from '../navigation/types';

const { width, height } = Dimensions.get('window');

type Props = RootStackScreenProps<'Splash'>;

export default function SplashScreen({ navigation }: Props) {
  const scaleAnim = useRef(new Animated.Value(0.6)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const { resetRecords } = useRecords();
  const { resetSettings } = useSettings();
  const { resetConversations } = useDM();

  // 탈퇴 유예(30일) 만료 시 영구 파기
  useEffect(() => {
    (async () => {
      const pending = await getPendingDeletion();
      if (pending && isDeletionExpired(pending)) {
        resetRecords();
        resetSettings();
        resetConversations();
        await clearPersistedStores().catch(() => {});
        await cancelAccountDeletion().catch(() => {});
      }
    })();
  }, []);

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

    // Navigate to AppIntro after 2.8s
    const timer = setTimeout(() => {
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
