import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AdCampaign } from '../../utils/adCampaignSelect';
import { logAdClick } from '../../services/adCampaigns';
import { polaroidStyles, SERIF } from './adPolaroidStyles';

// 제휴(어필리에이트) 광고 카드 — 하우스 폴라로이드와 같은 스킨을 쓴다.
//
// 링크는 시스템 브라우저로 연다. 커스텀 WebView로 열면 Amazon Associates의
// WebView 금지 조항에 걸리고, 나중에 아마존을 붙일 여지가 사라진다.
//
// 고지 문구(disclosure)는 제휴사마다 필수 문안이 다르므로 캠페인 데이터로 받아
// 캡션 아래에 렌더한다. 84px 스티커에는 물리적으로 들어가지 않기 때문에
// 제휴 광고는 폴라로이드 슬롯 전용이다.

interface Props {
  campaign: AdCampaign;
  /** 폴라로이드 기울기(도) */
  tilt?: number;
  /** 이미지 로드 실패 시 상위에 알려 하우스 카드로 강등시킨다 */
  onFallback?: () => void;
}

export default function AffiliatePolaroidCard({ campaign, tilt = -3, onFallback }: Props) {
  const { t, i18n } = useTranslation();
  const isKo = i18n.language?.startsWith('ko');
  const [imageFailed, setImageFailed] = useState(false);

  const headline = isKo ? campaign.headlineKo : campaign.headlineEn;
  const disclosure = isKo ? campaign.disclosureKo : campaign.disclosureEn;

  const handlePress = async () => {
    // 집계 실패가 링크 이동을 막지 않도록 await하지 않는다.
    void logAdClick(campaign.id);
    try {
      await Linking.openURL(campaign.clickUrl);
    } catch {
      // 열 수 없는 URL은 조용히 무시한다.
    }
  };

  // 이미지가 깨지면 빈 사각형이 남으므로 상위에 알려 하우스 카드로 바꾼다.
  const handleImageError = () => {
    setImageFailed(true);
    onFallback?.();
  };

  if (imageFailed) return null;

  return (
    <TouchableOpacity
      style={[polaroidStyles.wrap, { transform: [{ rotate: `${tilt}deg` }] }]}
      onPress={handlePress}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityLabel={`${t('social.adBadge')} · ${headline}`}
    >
      <View style={polaroidStyles.back} pointerEvents="none" />
      <View style={polaroidStyles.front}>
        <View style={polaroidStyles.media}>
          <Image
            source={{ uri: campaign.imageUrl }}
            style={s.image}
            resizeMode="cover"
            onError={handleImageError}
          />
          <View style={polaroidStyles.badge}>
            <Text style={polaroidStyles.badgeText}>{t('social.adBadge')}</Text>
          </View>
        </View>
        <Text style={[polaroidStyles.caption, { fontFamily: SERIF }]} numberOfLines={1}>
          {headline}
        </Text>
        {!!disclosure && (
          <Text style={s.disclosure} numberOfLines={2}>{disclosure}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  image: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 6,
  },
  // 제휴사 필수 고지 — 작지만 반드시 읽히는 크기를 유지한다.
  disclosure: {
    color: '#A1A1B0',
    fontSize: 9,
    lineHeight: 12,
    paddingTop: 4,
  },
});
