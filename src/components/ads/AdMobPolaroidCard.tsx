import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../ui/Text';
import { useTranslation } from 'react-i18next';
import type { NativeAd } from 'react-native-google-mobile-ads';
import { getGoogleMobileAds } from '../../lib/googleMobileAds';
import { polaroidStyles, SERIF } from './adPolaroidStyles';

// 네이티브 모듈이 없는 바이너리에서는 null — top-level import를 쓰면 이 파일을
// 불러오는 것만으로 앱이 부팅에 실패한다(googleMobileAds.ts 주석 참고).
const ads = getGoogleMobileAds();

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

  // 모듈이 없으면 admob 소스 자체가 만들어지지 않지만, 방어적으로 한 번 더 막는다.
  if (!ads) return null;
  const { NativeAdView, NativeAsset, NativeAssetType, NativeMediaView } = ads;

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
