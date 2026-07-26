import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView,
  type NativeAd,
} from 'react-native-google-mobile-ads';
import { polaroidStyles, SERIF } from './adPolaroidStyles';

// AdMob 네이티브 광고 카드 — 하우스·제휴 폴라로이드와 같은 스킨.
//
// 왜 별도 컴포넌트인가: AdMob은 광고 자산을 NativeAdView 안에서 NativeAsset으로
// 감싸야 하고 클릭·노출 집계를 SDK가 가져간다. 공식 캐비엇에 "자산 뷰를 다른 뷰로
// 감싸지 말 것"이 명시돼 있어 TouchableOpacity onPress 구조를 재사용할 수 없다.
//
// 「광고」 배지와 헤드라인 상시 노출은 AdMob 네이티브 필수 요소를 충족한다.

interface Props {
  ad: NativeAd;
  /** 폴라로이드 기울기(도) */
  tilt?: number;
}

export default function AdMobPolaroidCard({ ad, tilt = -3 }: Props) {
  const { t } = useTranslation();

  return (
    <NativeAdView nativeAd={ad} style={[polaroidStyles.wrap, { transform: [{ rotate: `${tilt}deg` }] }]}>
      <View style={polaroidStyles.back} pointerEvents="none" />
      <View style={polaroidStyles.front}>
        <View style={polaroidStyles.media}>
          <NativeMediaView style={s.media} resizeMode="cover" />
          <View style={polaroidStyles.badge}>
            <Text style={polaroidStyles.badgeText}>{t('social.adBadge')}</Text>
          </View>
        </View>
        <NativeAsset assetType={NativeAssetType.HEADLINE}>
          <Text style={[polaroidStyles.caption, { fontFamily: SERIF }]} numberOfLines={1}>
            {ad.headline ?? ''}
          </Text>
        </NativeAsset>
      </View>
    </NativeAdView>
  );
}

const s = StyleSheet.create({
  media: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 6,
  },
});
