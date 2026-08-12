import React, { useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { Text } from '../ui/Text';
import { andFitText } from '../utils/fitText';
import StarFieldBackground from '../components/StarFieldBackground';
import { GlassButton } from '../components/ui';
import { saveMateRecoOptin } from '../services/profile';
import { emitToast } from '../store/toastStore';
import type { RootStackScreenProps } from '../navigation/types';

type Props = RootStackScreenProps<'MateRecoConsent'>;

const C = {
  bg: '#0A0A0F',
  card: '#2E2E3B',
  neon: '#BF85FC',
  dim: '#A1A1B0',
  divider: '#1A1A26',
  white: '#FFFFFF',
};

/**
 * 온보딩 마지막 — 메이트 추천에 여행 기록을 쓰는 것에 대한 선택 동의.
 *
 * 기본값은 '꺼짐'이다. 선택 동의는 사전 동의가 원칙이라 미리 체크해 두면 다크패턴이 된다.
 * 체크하지 않고 [계속]을 누르면 false(거부)로 저장되어 추천 후보에서 빠진다 — 의도된 동작이다.
 *
 * 저장이 실패해도 온보딩을 막지 않는다. 실패하면 서버 값이 null(유예)로 남고, 소셜 탭의
 * MateRecoConsentBanner 가 나중에 다시 묻는다(안전망).
 */
export default function MateRecoConsentScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [agreed, setAgreed] = useState(false); // 기본 꺼짐 — 위 주석 참조
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    const ok = await saveMateRecoOptin(agreed);
    if (!ok) emitToast(t('mateConsent.saveFail'));
    // 성공·실패와 무관하게 온보딩을 끝낸다. startTutorial 은 MainScreen 이 읽는 살아있는
    // 플래그라 반드시 유지해야 첫 진입 코치마크가 뜬다.
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main', params: { screen: 'MainTab', params: { startTutorial: true } } }],
    });
  };

  // 온보딩 종점 — 뒤로가기로 우회하면 동의 화면을 안 거치고 Main에 도달한다(startTutorial도 유실).
  // 이탈은 화면 안 [계속] 버튼으로만 하도록 막는다(TravelDnaSurveyScreen과 같은 패턴).
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, [])
  );

  return (
    <View style={[st.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <StarFieldBackground opacity={0.5} />

      <View style={st.body}>
        <Text style={st.title}>{t('mateConsent.title')}</Text>
        <Text style={st.lead}>{t('mateConsent.lead')}</Text>

        <View style={st.card}>
          <Text style={st.useLine}>{t('mateConsent.useList')}</Text>
          <View style={st.divider} />
          <Text style={st.notUseLine}>{t('mateConsent.notUseList')}</Text>
        </View>

        <Text style={st.note}>{t('mateConsent.offEffect')}</Text>
        <Text style={st.note}>{t('mateConsent.protection')}</Text>
      </View>

      <TouchableOpacity
        style={st.checkRow}
        onPress={() => setAgreed((v) => !v)}
        activeOpacity={0.8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
      >
        <View style={[st.box, agreed && st.boxOn]}>
          {agreed && (
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <SvgPath d="M20 6L9 17l-5-5" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          )}
        </View>
        <Text style={st.checkLabel}>{t('mateConsent.checkbox')}</Text>
      </TouchableOpacity>

      {saving ? (
        <View style={st.savingRow}><ActivityIndicator color={C.neon} /></View>
      ) : (
        <GlassButton label={t('mateConsent.continue')} onPress={finish} />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: C.white, marginBottom: 8, lineHeight: 32 },
  lead: { fontSize: 14, color: C.dim, marginBottom: 24, lineHeight: 20 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 20 },
  useLine: { fontSize: 14, color: C.white, lineHeight: 20 },
  divider: { height: 1, backgroundColor: C.divider, marginVertical: 12 },
  notUseLine: { fontSize: 14, color: C.dim, lineHeight: 20 },
  note: { fontSize: 12, color: C.dim, lineHeight: 18, marginBottom: 10 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 20 },
  box: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.dim,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  boxOn: { backgroundColor: C.neon, borderColor: C.neon },
  checkLabel: { flex: 1, fontSize: 13, color: C.white, lineHeight: 19 },
  savingRow: { height: 54, alignItems: 'center', justifyContent: 'center' },
});
