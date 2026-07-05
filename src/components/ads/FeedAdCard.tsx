import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import type { HouseAd } from '../../constants/houseAds';

// 소셜 피드 광고 카드 — 마소너리 그리드에 게시물처럼 끼어드는 광고 슬롯 렌더러.
//  - polaroid: 목업(살짝 기울어진 폴라로이드) 스타일 — 밝은 프레임 + 하단 캡션(헤드라인)
//  - feed:     일반 피드 카드와 같은 골격의 다크 카드
// AdMob 네이티브 전환 시에도 이 렌더러를 재사용한다 — '광고' 배지와 헤드라인(title)
// 상시 노출은 AdMob 필수 요소 규정을 함께 충족한다.
export type FeedAdVariant = 'polaroid' | 'feed';

interface Props {
  ad: HouseAd;
  variant: FeedAdVariant;
  /** 폴라로이드 기울기(도) — 슬롯마다 살짝 다르게 주면 자연스럽다 */
  tilt?: number;
  onPress: () => void;
}

export default function FeedAdCard({ ad, variant, tilt = -3, onPress }: Props) {
  const { t } = useTranslation();

  if (variant === 'polaroid') {
    return (
      <TouchableOpacity
        style={[s.polaroid, { transform: [{ rotate: `${tilt}deg` }] }]}
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${t('social.adBadge')} · ${t(ad.titleKey)}`}
      >
        <LinearGradient colors={[...ad.gradient]} style={s.polaroidMedia}>
          <Text style={s.mediaEmoji}>{ad.emoji}</Text>
        </LinearGradient>
        <Text style={s.polaroidCaption} numberOfLines={1}>{t(ad.titleKey)}</Text>
        <View style={s.polaroidBadge}>
          <Text style={s.badgeText}>{t('social.adBadge')}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={s.feedCard}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${t('social.adBadge')} · ${t(ad.titleKey)}`}
    >
      <LinearGradient colors={[...ad.gradient]} style={s.feedMedia}>
        <Text style={s.mediaEmoji}>{ad.emoji}</Text>
        <View style={s.feedBadge}>
          <Text style={s.badgeText}>{t('social.adBadge')}</Text>
        </View>
      </LinearGradient>
      <View style={s.feedBody}>
        <Text style={s.feedTitle} numberOfLines={1}>{t(ad.titleKey)}</Text>
        <Text style={s.feedDesc} numberOfLines={2}>{t(ad.bodyKey)}</Text>
        <View style={s.ctaBtn}>
          <Text style={s.ctaText}>{t(ad.ctaKey)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  // ── 폴라로이드 ──
  polaroid: {
    backgroundColor: '#ECECF1',
    borderRadius: 6,
    padding: 8,
    paddingBottom: 10,
    marginVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  polaroidMedia: {
    height: 120,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  polaroidCaption: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#3A3A46',
    textAlign: 'center',
  },
  polaroidBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(10,10,15,0.55)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },

  // ── 피드 카드형 ──
  feedCard: {
    backgroundColor: '#2E2E3B',
    borderRadius: 18,
    overflow: 'hidden',
    marginVertical: 6,
  },
  feedMedia: {
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(10,10,15,0.55)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  feedBody: {
    padding: 12,
    gap: 4,
  },
  feedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  feedDesc: {
    fontSize: 12,
    color: '#A1A1B0',
    lineHeight: 17,
  },
  ctaBtn: {
    marginTop: 8,
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.35)',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#BF85FC',
  },

  // 공통
  mediaEmoji: {
    fontSize: 44,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
