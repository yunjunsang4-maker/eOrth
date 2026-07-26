// 피드 광고 폴라로이드 카드 공용 스킨.
//
// 하우스(FeedAdCard) · 제휴(AffiliatePolaroidCard) · AdMob(AdMobPolaroidCard)
// 세 렌더러가 같은 겉모습을 공유한다. AdMob 네이티브는 자산을 NativeAdView 안에서
// NativeAsset으로 감싸야 해서 컴포넌트를 합칠 수 없고, 스타일만 공유한다.
//
// 값은 피드 기록 카드(SocialScreen d.polaWrap/polaBack/polaFront/polaImg/polaCap)와
// 동일하게 맞춘 것이므로 임의로 바꾸지 말 것 — 마소너리 레이아웃이 어긋난다.
import { StyleSheet, Platform } from 'react-native';

export const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

export const polaroidStyles = StyleSheet.create({
  wrap: {},
  back: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#2B2B30',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 0,
    transform: [{ rotate: '-5deg' }],
  },
  front: {
    backgroundColor: '#333337',
    borderRadius: 0,
    padding: 10,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  media: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 6,
    backgroundColor: '#2A2735',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: { color: '#FFFFFF', fontSize: 12, paddingTop: 8 },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(10,10,15,0.55)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  mediaEmoji: {
    fontSize: 44,
  },
});
