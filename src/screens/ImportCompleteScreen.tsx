import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import type { RootStackScreenProps } from '../navigation/types';

export default function ImportCompleteScreen({ navigation, route }: RootStackScreenProps<'ImportComplete'>) {
  const { t } = useTranslation();
  const { tripCount, photoCount, countries } = route.params;

  // 진입 시 체크 아이콘 스케일/페이드 인
  const checkScale = useRef(new Animated.Value(0.6)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const bodyOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(checkScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.timing(checkOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
      Animated.timing(bodyOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();
  }, []);

  // "일본 외 2개 여행" / "일본 여행" / "여행 N개"
  const lead = countries[0];
  const tripLine = lead
    ? tripCount > 1
      ? t('imports.icTripMulti', { flag: lead.flag, name: lead.name, count: tripCount - 1 })
      : t('imports.icTripSingle', { flag: lead.flag, name: lead.name })
    : t('imports.icTripNone', { count: tripCount });

  // "이어스 시작하기" → 메인으로 이동하면서 MainTab에 startTutorial 플래그 전달 → 코치마크 튜토리얼 자동 시작
  const startEorth = () =>
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main', params: { screen: 'MainTab', params: { startTutorial: true } } }],
    });

  return (
    <LinearGradient colors={['#0A0118', '#100620']} style={st.container}>
      <View style={st.content}>
        <Animated.View
          style={[st.checkWrap, { opacity: checkOpacity, transform: [{ scale: checkScale }] }]}
        >
          <View style={st.checkGlow} />
          <LinearGradient colors={['#7B61FF', '#5A42DD']} style={st.checkCircle}>
            <Text style={st.checkMark}>✓</Text>
          </LinearGradient>
        </Animated.View>

        <Animated.View style={{ opacity: bodyOpacity, alignItems: 'center' }}>
          <Text style={st.title}>{t('imports.icTitle')}</Text>
          <Text style={st.tripLine}>{tripLine}</Text>
          <Text style={st.photoLine}>
            {t('imports.icPhotoPrefix')}<Text style={st.accent}>{t('imports.icPhotoCountN', { count: photoCount })}</Text>{t('imports.icPhotoSuffix')}
          </Text>
        </Animated.View>
      </View>

      <Animated.View style={[st.bottom, { opacity: bodyOpacity }]}>
        <TouchableOpacity style={st.primaryBtn} onPress={startEorth} activeOpacity={0.85}>
          <LinearGradient colors={['#7B61FF', '#5A42DD']} style={st.primaryGrad}>
            <Text style={st.primaryTxt}>{t('imports.icStart')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  checkWrap: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },
  checkGlow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(123, 97, 255, 0.18)',
  },
  checkCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7B61FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 20,
    elevation: 10,
  },
  checkMark: { color: '#FFFFFF', fontSize: 52, fontWeight: '800', lineHeight: 58 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginBottom: 16 },
  tripLine: { color: '#BF85FC', fontSize: 17, fontWeight: '700', marginBottom: 6 },
  photoLine: { color: '#A1A1B0', fontSize: 15, fontWeight: '500' },
  accent: { color: '#FFFFFF', fontWeight: '700' },
  bottom: { paddingHorizontal: 24, paddingBottom: 48 },
  primaryBtn: { width: '100%', borderRadius: 999, overflow: 'hidden', marginBottom: 8 },
  primaryGrad: { paddingVertical: 18, alignItems: 'center' },
  primaryTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { paddingVertical: 14, alignItems: 'center' },
  secondaryTxt: { color: '#A1A1B0', fontSize: 15, fontWeight: '600' },
});
