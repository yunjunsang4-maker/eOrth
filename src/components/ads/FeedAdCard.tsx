import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import type { HouseAd } from '../../constants/houseAds';
import { useAnimationsActive } from '../../hooks/useAnimationsActive';

// 소셜 피드 광고 카드 — 마소너리 그리드에 게시물처럼 끼어드는 광고 슬롯 렌더러.
// 두 가지 형태를 번갈아 렌더한다:
//  - polaroid: 피드 기록 카드(Group 2085664521)와 같은 다크 폴라로이드 + 사진 + 캡션 한 줄
//              (기록 카드의 메타 행 아이디·좋아요·⋯ 은 없음)
//  - sticker:  Group 2085664520 시안 — 살짝 기울어진 라이트 폴라로이드 스티커
//              (반투명 라이트 프레임 + 밝은 사진 영역 + 중앙 헤드라인)
// AdMob 네이티브 전환 시에도 이 렌더러를 재사용한다 — '광고' 배지와 헤드라인(title)
// 상시 노출은 AdMob 필수 요소 규정을 함께 충족한다.
export type FeedAdVariant = 'polaroid' | 'sticker';

const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

interface Props {
  ad: HouseAd;
  variant: FeedAdVariant;
  /** 폴라로이드/스티커 기울기(도) — 슬롯마다 살짝 다르게 주면 자연스럽다 */
  tilt?: number;
  /** 스티커를 게시물 위에 겹쳐 붙이는 오버레이 모드 (시안 iPhone 17 - 54) */
  overlay?: boolean;
  /** 오버레이가 바깥으로 삐져나오는 방향 — 좌측 컬럼 게시물은 오른쪽(gutter)으로 */
  overlaySide?: 'left' | 'right';
  onPress: () => void;
}

export default function FeedAdCard({ ad, variant, tilt = -3, overlay, overlaySide = 'right', onPress }: Props) {
  const { t } = useTranslation();

  // 스티커 오버레이는 게시물을 가리므로 상시 노출 대신 '생겼다 → 사라졌다'를 반복한다.
  // 숨김 동안엔 터치도 통과시켜(기록 카드 조작 방해 없음), 화면 밖/백그라운드에선 사이클 정지.
  const fade = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(false);
  const animationsActive = useAnimationsActive();
  const isStickerOverlay = variant === 'sticker' && !!overlay;
  useEffect(() => {
    if (!isStickerOverlay) return;
    if (!animationsActive) { fade.setValue(0); setShown(false); return; }
    let alive = true;
    const cycle = () => {
      if (!alive) return;
      setShown(true);
      Animated.timing(fade, { toValue: 1, duration: 380, useNativeDriver: true }).start(() => {
        setTimeout(() => {
          if (!alive) return;
          Animated.timing(fade, { toValue: 0, duration: 480, useNativeDriver: true }).start(() => {
            if (!alive) return;
            setShown(false);
            setTimeout(cycle, 2800); // 숨김 유지 후 재등장
          });
        }, 4200); // 표시 유지
      });
    };
    cycle();
    return () => { alive = false; fade.stopAnimation(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStickerOverlay, animationsActive]);

  // ── 스티커 (Group 2085664520): 살짝 기울어진 라이트 폴라로이드 ──
  if (variant === 'sticker') {
    return (
      <Animated.View
        pointerEvents={isStickerOverlay && !shown ? 'none' : 'box-none'}
        style={[
          s.stickerFrame,
          overlay && s.stickerOverlay,
          overlay && (overlaySide === 'left' ? s.stickerOverlayLeft : s.stickerOverlayRight),
          { transform: [{ rotate: `${tilt}deg` }] },
          isStickerOverlay && { opacity: fade },
        ]}
      >
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel={`${t('social.adBadge')} · ${t(ad.titleKey)}`}
        >
          {/* 밝은 사진 영역 + 중앙 헤드라인 (시안: 중앙 정렬 다크 텍스트) */}
          <View style={s.stickerPhoto}>
            <Text style={s.stickerEmoji}>{ad.emoji}</Text>
            <Text style={[s.stickerTitle, { fontFamily: SERIF }]} numberOfLines={2}>{t(ad.titleKey)}</Text>
            <View style={s.badge}>
              <Text style={s.badgeText}>{t('social.adBadge')}</Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ── 폴라로이드: 피드 기록 카드와 동일한 골격 (아이디·좋아요·⋯ 메타 행만 제거) ──
  return (
    <TouchableOpacity
      style={[s.wrap, { transform: [{ rotate: `${tilt}deg` }] }]}
      onPress={onPress}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityLabel={`${t('social.adBadge')} · ${t(ad.titleKey)}`}
    >
      {/* 시안(Group 2085664521): 뒷장이 살짝 어긋나게 겹쳐 두 장이 포개진 입체감 */}
      <View style={s.back} pointerEvents="none" />
      <View style={s.front}>
        <LinearGradient colors={[...ad.gradient]} style={s.media}>
          <Text style={s.mediaEmoji}>{ad.emoji}</Text>
          <View style={s.badge}>
            <Text style={s.badgeText}>{t('social.adBadge')}</Text>
          </View>
        </LinearGradient>
        {/* 사진 밑 캡션 한 줄 — 기록 카드와 동일 */}
        <Text style={[s.caption, { fontFamily: SERIF }]} numberOfLines={1}>{t(ad.titleKey)}</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  // ── 폴라로이드: 피드 기록 카드(d.polaWrap/polaBack/polaFront/polaImg/polaCap)와 동일 ──
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

  // ── 스티커 (Group 2085664520): 반투명 라이트 프레임 + 밝은 사진 + 큰 하단 여백(폴라로이드 턱) ──
  // 시안 비율: 프레임 82×95, 사진 70×66, 좌우 여백 ~7 / 하단 턱 ~20
  stickerFrame: {
    width: 84,
    backgroundColor: 'rgba(217,217,217,0.2)',
    padding: 7,
    paddingBottom: 20,
    marginVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  // 게시물 위에 겹쳐 붙는 오버레이 — 시안 iPhone 17 - 54처럼 하단 코너에서 gutter로 삐져나옴
  stickerOverlay: {
    position: 'absolute',
    bottom: 28,
    marginVertical: 0,
    zIndex: 20,
    elevation: 8,
  },
  stickerOverlayRight: { right: -16 },
  stickerOverlayLeft: { left: -16 },
  stickerPhoto: {
    width: '100%',
    aspectRatio: 1.05,
    backgroundColor: '#D9D9D9',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    gap: 3,
  },
  stickerEmoji: {
    fontSize: 24,
  },
  stickerTitle: {
    color: '#16121F',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '600',
    textAlign: 'center',
  },

  // ── 공통 ──
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(10,10,15,0.55)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
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
