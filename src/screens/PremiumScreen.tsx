import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Image, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Text } from '../ui/Text';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useSkinAccent } from '../constants/skinTheme';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import { StarIcon } from '../components/icons';
import StarFieldBackground from '../components/StarFieldBackground';
import FontShowcaseCard from '../components/premium/FontShowcaseCard';
import LogoShowcaseCard from '../components/premium/LogoShowcaseCard';
import FrameShowcaseCard from '../components/premium/FrameShowcaseCard';
import type { RootStackScreenProps } from '../navigation/types';
import { LAUNCH_FREE_PREMIUM } from '../constants/featureFlags';

// 제작 이모티콘 (assets/emoji) — 기본 시스템 이모지 대신 앱 전용 3D 이모티콘을 쓴다.
// 열쇠 = 잠금 해제(전체 무료), 체크 = 이용 중. LoginScreen과 같은 자산 세트.
const EMOJI_KEY = require('../../assets/emoji/key.png');
const EMOJI_CHECK = require('../../assets/emoji/check.png');

// 프리미엄 소개 — 혜택을 '읽는 목록'이 아니라 '만져보는 쇼케이스'로 보여준다.
// 각 카드 안에서 서체·로고·프레임색을 바꿔볼 수 있고, 실제 적용은 하단 버튼으로 설정에서 한다.
// 배경(별·글로우)·유리 재질·강조색은 앱 공통 시각 언어를 그대로 쓴다.
const COLORS = {
  bg: '#0A0A0F',
  card: 'rgba(46,46,59,0.45)',
  white: '#FFFFFF',
  textDim: '#A1A1B0',
  textMuted: '#8B8B9E',
};

export default function PremiumScreen({ navigation }: RootStackScreenProps<'Premium'>) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent(); // 강조·테두리를 지구본 스킨색으로
  const { isPremium, setIsPremium } = useSettings();
  const { records, rebackupAlbumOriginals } = useRecords();

  // 압축본으로 백업돼 있는 내 사진첩 수 — 프리미엄이면 원본 재백업 대상
  const compressedAlbums = records.filter(
    (r) => r.isMyPost !== false && r.viewType === 'album' && !!r.remoteId && r.albumUploadQuality === 'compressed'
  ).length;
  const [backingUp, setBackingUp] = useState(false);
  const handleRebackup = async () => {
    if (backingUp) return;
    setBackingUp(true);
    try {
      const { upgraded, failed } = await rebackupAlbumOriginals();
      Alert.alert(
        t('premium.backupDoneTitle'),
        failed > 0
          ? t('premium.backupDonePartial', { upgraded, failed })
          : t('premium.backupDoneMsg', { upgraded })
      );
    } finally {
      setBackingUp(false);
    }
  };

  const handleSubscribe = () => {
    // 베타 체험 시작 — 결제(RevenueCat) 연동 시 구매 플로우로 교체
    setIsPremium(true);
    navigation.goBack();
  };

  // 카드에서 고른 건 미리보기라 실제 적용은 설정에서 한다.
  // 설정에서 들어온 경우엔 되돌아가기(스택에 Settings가 겹쳐 쌓이는 걸 막는다).
  const handleApply = () => {
    const routes = navigation.getState()?.routes ?? [];
    const prev = routes[routes.length - 2];
    if (prev?.name === 'Settings') navigation.goBack();
    else navigation.navigate('Settings');
  };

  return (
    <SafeAreaView style={st.safeArea}>
      <StarFieldBackground opacity={0.5} />

      {/* 헤더 */}
      <View style={st.header}>
        <TouchableOpacity style={st.backBtn} activeOpacity={0.7} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={t('settings.back')}>
          <Text style={st.backIcon}>✕</Text>
        </TouchableOpacity>
        <View style={st.headerPlaceholder} />
      </View>

      <ScrollView style={st.scroll} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        {/* 히어로 */}
        <View style={st.hero}>
          <View style={[st.heroIconWrap, { borderColor: skinAccent.tint(0.35), backgroundColor: skinAccent.tint(0.14) }]}>
            <StarIcon size={40} />
          </View>
          <Text style={st.heroTitle}>{t('premium.paywallTitle')}</Text>

          {/* 무료 개방 배지 — 이 화면의 주인공을 상단으로 올린다 */}
          {LAUNCH_FREE_PREMIUM && (
            <View style={[st.freeBadge, { borderColor: skinAccent.tint(0.4), backgroundColor: skinAccent.tint(0.16) }]}>
              <Image source={EMOJI_KEY} style={st.badgeEmoji} />
              <Text style={[st.freeBadgeTxt, { color: skinAccent.accent }]}>{t('premium.launchFreeTitle')}</Text>
            </View>
          )}

          <Text style={st.heroSub}>
            {LAUNCH_FREE_PREMIUM ? t('premium.launchFreeDesc') : t('premium.paywallSubtitle')}
          </Text>
        </View>

        {/* 혜택 쇼케이스 — 순차 등장 */}
        <FontShowcaseCard delay={0} />
        <LogoShowcaseCard delay={90} />
        <FrameShowcaseCard delay={180} />

        {/* 압축본 사진첩을 원본으로 재백업 — 원본 백업이 혜택에서 빠진 동안은 숨긴다 */}
        {!LAUNCH_FREE_PREMIUM && isPremium && compressedAlbums > 0 && (
          <TouchableOpacity
            style={[st.backupBtn, { borderColor: skinAccent.tint(0.35) }]}
            onPress={handleRebackup}
            disabled={backingUp}
            activeOpacity={0.8}
          >
            {backingUp ? (
              <ActivityIndicator color={skinAccent.accent} size="small" />
            ) : (
              <Text style={[st.backupBtnTxt, { color: skinAccent.accent }]}>
                {t('premium.backupCta', { count: compressedAlbums })}
              </Text>
            )}
            <Text style={st.backupHint}>{t('premium.backupHint')}</Text>
          </TouchableOpacity>
        )}

        {/* CTA — 무료 개방 중에는 '구매' 대신 '적용하러 가기' */}
        {LAUNCH_FREE_PREMIUM ? (
          <TouchableOpacity activeOpacity={0.85} onPress={handleApply} style={st.ctaTop}>
            <LinearGradient
              colors={[skinAccent.accent, skinAccent.accentDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={st.ctaBtn}
            >
              <Text style={st.ctaText}>{t('premium.applyCta')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : isPremium ? (
          <View style={[st.ctaBtn, st.ctaActive, st.ctaTop, { borderColor: skinAccent.tint(0.35) }]}>
            <Image source={EMOJI_CHECK} style={st.ctaEmoji} />
            <Text style={[st.ctaActiveText, { color: skinAccent.accent }]}>{t('premium.paywallActive')}</Text>
          </View>
        ) : (
          <TouchableOpacity activeOpacity={0.85} onPress={handleSubscribe} style={st.ctaTop}>
            <LinearGradient
              colors={[skinAccent.accent, skinAccent.accentDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={st.ctaBtn}
            >
              <Text style={st.ctaText}>{t('premium.paywallCta')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        <Text style={st.footnote}>
          {LAUNCH_FREE_PREMIUM ? t('premium.launchFreeNote') : t('premium.paywallNote')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 20, color: COLORS.textDim },
  headerPlaceholder: { width: 40 },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },

  hero: { alignItems: 'center', marginTop: 8, marginBottom: 24 },
  heroIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.white, marginBottom: 10 },
  freeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 11,
    paddingRight: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 12,
  },
  badgeEmoji: { width: 18, height: 18 },
  freeBadgeTxt: { fontSize: 13, fontWeight: '700' },
  heroSub: { fontSize: 13, color: COLORS.textDim, textAlign: 'center', lineHeight: 19 },

  backupBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: COLORS.card,
  },
  backupBtnTxt: { fontSize: 14, fontWeight: '700' },
  backupHint: { fontSize: 11, color: COLORS.textMuted, marginTop: 4, paddingHorizontal: 16, textAlign: 'center' },

  ctaTop: { marginTop: 10 },
  ctaBtn: {
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontSize: 16, fontWeight: 'bold', color: COLORS.white },
  ctaActive: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(107,33,168,0.2)',
    borderWidth: 1,
  },
  ctaEmoji: { width: 20, height: 20 },
  ctaActiveText: { fontSize: 15, fontWeight: '700' },

  footnote: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center', marginTop: 14, lineHeight: 16 },
});
