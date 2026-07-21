import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useSkinAccent } from '../constants/skinTheme';
import { useSettings } from '../store/settingsStore';
import { useRecords } from '../store/recordStore';
import {
  StarIcon, LanguageIcon, GalleryIcon, StickerIcon, PaletteIcon, MegaphoneIcon,
} from '../components/icons';
import type { RootStackScreenProps } from '../navigation/types';

// 프리미엄 소개(페이월) — 혜택 6종 요약 + 구독 CTA.
// 베타: CTA가 isPremium 로컬 토글을 켠다. RevenueCat 연동 시 구매 플로우 호출로 교체.
const COLORS = {
  bg: '#0A0A0F',
  card: 'rgba(46,46,59,0.45)',
  cardBorder: 'rgba(255,255,255,0.08)',
  purpleNeon: '#BF85FC',
  white: '#FFFFFF',
  textDim: '#A1A1B0',
  textMuted: '#8B8B9E',
};

export default function PremiumScreen({ navigation }: RootStackScreenProps<'Premium'>) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent(); // 구독 버튼·테두리 강조를 스킨색으로
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

  // 혜택 목록 — 설정 프리미엄 그룹과 동일한 아이콘 사용
  const benefits = [
    { icon: <MegaphoneIcon size={22} />, title: t('premium.benefitAdsTitle'),   desc: t('premium.benefitAdsDesc') },
    { icon: <LanguageIcon size={22} />, title: t('premium.benefitFontTitle'),   desc: t('premium.benefitFontDesc') },
    { icon: <GalleryIcon size={22} />,  title: t('premium.benefitPhotosTitle'), desc: t('premium.benefitPhotosDesc') },
    { icon: <GalleryIcon size={22} />,  title: t('premium.benefitBackupTitle'), desc: t('premium.benefitBackupDesc') },
    { icon: <StickerIcon size={22} />,  title: t('premium.benefitLogoTitle'),   desc: t('premium.benefitLogoDesc') },
    { icon: <PaletteIcon size={22} />,  title: t('premium.benefitFrameTitle'),  desc: t('premium.benefitFrameDesc') },
  ];

  const handleSubscribe = () => {
    // 베타 체험 시작 — 결제(RevenueCat) 연동 시 구매 플로우로 교체
    setIsPremium(true);
    navigation.goBack();
  };

  return (
    <SafeAreaView style={st.safeArea}>
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
          <View style={[st.heroIconWrap, { borderColor: skinAccent.tint(0.35) }]}>
            <StarIcon size={40} />
          </View>
          <Text style={st.heroTitle}>{t('premium.paywallTitle')}</Text>
          <Text style={st.heroSub}>{t('premium.paywallSubtitle')}</Text>
        </View>

        {/* 혜택 목록 */}
        <View style={st.benefitList}>
          {benefits.map((b) => (
            <View key={b.title} style={st.benefitRow}>
              <View style={st.benefitIcon}>{b.icon}</View>
              <View style={st.benefitTextWrap}>
                <Text style={st.benefitTitle}>{b.title}</Text>
                <Text style={st.benefitDesc}>{b.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* 프리미엄 활성 + 압축본 사진첩 존재 → 원본 화질로 재백업 */}
        {isPremium && compressedAlbums > 0 && (
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

        {/* CTA */}
        {isPremium ? (
          <View style={[st.ctaBtn, st.ctaActive, { borderColor: skinAccent.tint(0.35) }]}>
            <Text style={st.ctaActiveText}>✓ {t('premium.paywallActive')}</Text>
          </View>
        ) : (
          <TouchableOpacity activeOpacity={0.85} onPress={handleSubscribe}>
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

        <Text style={st.footnote}>{t('premium.paywallNote')}</Text>
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

  hero: { alignItems: 'center', marginTop: 8, marginBottom: 28 },
  heroIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(107,33,168,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.white, marginBottom: 6 },
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

  benefitList: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingVertical: 6,
    marginBottom: 24,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  benefitIcon: { width: 28, alignItems: 'center' },
  benefitTextWrap: { flex: 1 },
  benefitTitle: { fontSize: 14, fontWeight: '700', color: COLORS.white, marginBottom: 2 },
  benefitDesc: { fontSize: 12, color: COLORS.textDim, lineHeight: 17 },

  ctaBtn: {
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontSize: 16, fontWeight: 'bold', color: COLORS.white },
  ctaActive: {
    backgroundColor: 'rgba(107,33,168,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.35)',
  },
  ctaActiveText: { fontSize: 15, fontWeight: '700', color: COLORS.purpleNeon },

  footnote: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center', marginTop: 14, lineHeight: 16 },
});
