import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { requestNotificationPermission } from '../services/snapService';
import StarFieldBackground from '../components/StarFieldBackground';
import { IntroAmbient } from './introVisuals';
import ImportCtaButton from '../components/ImportCtaButton';
import { useBlockHardwareBack } from '../hooks/useBlockHardwareBack';
import type { RootStackScreenProps } from '../navigation/types';

// 완료 화면에서 가져온 나라 국기 칩 — 순차로 톡 튀어오르며 나타난다(스프링).
function FlagChip({ flag, name, delay }: { flag: string; name: string; delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: 1, friction: 6, tension: 90, delay, useNativeDriver: true }).start();
  }, [anim, delay]);
  return (
    <Animated.View
      style={[
        st.flagChip,
        { opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] },
      ]}
    >
      <Text style={st.flagChipEmoji}>{flag}</Text>
      <Text style={st.flagChipName} numberOfLines={1}>{name}</Text>
    </Animated.View>
  );
}

export default function ImportCompleteScreen({ navigation, route }: RootStackScreenProps<'ImportComplete'>) {
  // 완료 화면은 뒤로가기로 빠져나가면 안 된다 — 온보딩 경로에서는 이 화면의 CTA가
  // 알림 권한 요청과 튜토리얼 시작을 겸하고, 되돌아갈 이전 단계도 이미 스택에서 정리됐다.
  useBlockHardwareBack();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { tripCount, photoCount, countries, from } = route.params;

  // 진입 시 체크 아이콘 스케일/페이드 인 + 링 버스트(리플)
  const checkScale = useRef(new Animated.Value(0.6)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const bodyOpacity = useRef(new Animated.Value(0)).current;
  const burstScale = useRef(new Animated.Value(0.4)).current;
  const burstOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.sequence([
      Animated.parallel([
        Animated.spring(checkScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.timing(checkOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        // 링 버스트 — 체크 뒤로 한 번 퍼지며 사라지는 축하 리플
        Animated.sequence([
          Animated.timing(burstOpacity, { toValue: 0.5, duration: 120, useNativeDriver: true }),
          Animated.parallel([
            Animated.timing(burstScale, { toValue: 2, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(burstOpacity, { toValue: 0, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]),
        ]),
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

  // "이어스 시작하기" → 온보딩 경로는 축약판 여행 DNA 설문으로, 결과 화면(Task 7)이
  // startTutorial 플래그와 함께 메인 스택 리셋을 이어받는다
  // 온보딩 마지막 단계 — 설문 진입 직전에 알림 권한을 한 번 요청한다 (사용 중 뜬금 팝업 방지)
  const startEorth = async () => {
    // 앱 내(프로필)에서 들어온 경우 — 온보딩이 아니므로 알림 권한 요청·설문 없이
    // 원래 보던 화면으로 돌아간다. 스택에 남은 불러오기 단계들은 함께 정리한다.
    if (from === 'profile') {
      // 스택 루트(Main)로 — 탭 상태는 그대로라 프로필 탭으로 돌아간다.
      // (온보딩 경로는 아래 replace를 타야 한다: 그쪽 스택 루트는 Splash라 popToTop이 부적절)
      navigation.popToTop();
      return;
    }
    await requestNotificationPermission().catch(() => {});
    // 온보딩 마지막 — 축당 1문항(약 40초)만 받는다. 36문항 전체는 여기 넣기엔 길다.
    // 건너뛰면 결과 없이 메인으로 가고, 메이트찾기 배너가 나중에 회수한다.
    navigation.replace('TravelDnaSurvey', { mode: 'onboarding' });
  };

  return (
    <View style={st.container}>
      <StarFieldBackground opacity={0.5} />
      <IntroAmbient />

      <View style={st.content}>
        <Animated.View style={[st.checkWrap, { opacity: checkOpacity, transform: [{ scale: checkScale }] }]}>
          <View style={st.checkGlow} />
          <Animated.View
            style={[st.burstRing, { opacity: burstOpacity, transform: [{ scale: burstScale }] }]}
            pointerEvents="none"
          />
          <LinearGradient
            colors={['#FF14E4', '#00D8F3']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={st.checkCircle}
          >
            <Svg width={52} height={52} viewBox="0 0 24 24" fill="none">
              <SvgPath d="M20 6L9 17l-5-5" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </LinearGradient>
        </Animated.View>

        <Animated.View style={{ opacity: bodyOpacity, alignItems: 'center', width: '100%' }}>
          <Text style={st.title}>{t('imports.icTitle')}</Text>
          <Text style={st.tripLine}>{tripLine}</Text>
          <Text style={st.photoLine}>
            {t('imports.icPhotoPrefix')}<Text style={st.accent}>{t('imports.icPhotoCountN', { count: photoCount })}</Text>{t('imports.icPhotoSuffix')}
          </Text>

          {countries.length > 0 && (
            <View style={st.flagWrap}>
              {countries.map((c, i) => (
                <FlagChip key={`${c.flag}-${c.name}-${i}`} flag={c.flag} name={c.name} delay={500 + i * 90} />
              ))}
            </View>
          )}
        </Animated.View>
      </View>

      <Animated.View style={[st.bottom, { opacity: bodyOpacity, paddingBottom: insets.bottom + 24 }]}>
        <ImportCtaButton gid="importDoneCta" label={t('imports.icStart')} onPress={startEorth} />
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0F' },
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
    backgroundColor: 'rgba(236, 52, 247, 0.16)',
  },
  burstRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: 'rgba(0, 216, 243, 0.9)',
  },
  checkCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    // 컬러 글로우는 iOS 전용 — 안드로이드 elevation은 색 지정 불가(회색 사각 그림자)
    ...Platform.select({
      ios: {
        shadowColor: '#EC34F7',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.85,
        shadowRadius: 22,
      },
      default: {},
    }),
  },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginBottom: 16 },
  tripLine: { color: '#EC34F7', fontSize: 17, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  photoLine: { color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: '500', textAlign: 'center' },
  accent: { color: '#FFFFFF', fontWeight: '700' },

  // 가져온 나라 국기 칩
  flagWrap: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 22,
  },
  flagChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingLeft: 8, paddingRight: 12, paddingVertical: 5, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  flagChipEmoji: { fontSize: 15 },
  flagChipName: { color: '#FFFFFF', fontSize: 12, fontWeight: '500', maxWidth: 120 },

  bottom: { paddingHorizontal: 24 },
});
