// src/components/social/FeatureShowcaseCard.tsx
// 빈 소셜탭 기능 소개 카드 — 지구본·통계·배지·프리미엄 슬라이드를 3초 자동 순회.
// 프리미엄 슬라이드만 탭 가능(onPremiumPress → 프리미엄 팝업), 나머지는 정보 전용.
// 화면 밖/백그라운드에선 타이머 정지(발열 방지).
//
// 레이아웃은 Figma 시안(133:2316 지구본 · 132:2253 통계 · 132:2207 배지) 기준.
// 카드 258×362 → 삽화 242(66.85%) + 하단 밴드 122. 시안 수치는 카드 폭 258 기준이라
// 실제 카드 폭(2열 메이슨리: 390 - 좌우 24×2 - 간격 10 → 166dp, 배율 0.643)으로 환산해 상수화했다.
// (예: 제목 20 → 12.9, 설명 16 → 10.3, 배지 높이 25 → 16.1, 좌패딩 20 → 12.9)
// 밴드는 시안대로 rgba(217,217,217,0.2) — 카드 배경 #0A0A0F 위에 얹혀 #333337로 합성된다.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Image, StyleSheet, PanResponder, TouchableOpacity } from 'react-native';
import { Text, FONT_SCALE_CAP } from '../../ui/Text';
import { useTranslation } from 'react-i18next';
import { FEATURE_SLIDES } from '../../constants/exampleContent';
import { nextIndex } from '../../utils/carousel';
import { useAnimationsActive } from '../../hooks/useAnimationsActive';
import { useSkinAccent } from '../../constants/skinTheme';

export default function FeatureShowcaseCard({ onPremiumPress }: { onPremiumPress?: () => void }) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  const [idx, setIdx] = useState(0);
  const active = useAnimationsActive();
  const count = FEATURE_SLIDES.length;

  useEffect(() => {
    if (!active || count <= 1) return;
    const iv = setInterval(() => setIdx((i) => nextIndex(i, count)), 3000);
    return () => clearInterval(iv);
  }, [active, count]);

  const swipe = useCallback((dir: 1 | -1) => {
    setIdx((i) => (dir === 1 ? nextIndex(i, count) : (i - 1 + count) % count));
  }, [count]);

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderRelease: (_e, g) => { if (g.dx < -30) swipe(1); else if (g.dx > 30) swipe(-1); },
  })).current;

  const slide = FEATURE_SLIDES[idx] ?? FEATURE_SLIDES[0];
  const isPremium = !!slide.isPremium;
  // 시안은 한 줄 고정(whitespace-nowrap). 밴드 높이가 고정이라 줄바꿈되면 넘치므로,
  // 긴 번역문(영문)·큰 시스템 글꼴에서는 한 줄을 유지한 채 살짝 줄여 맞춘다.
  // fitOneLine은 래퍼 <Text>에 뒤로 펼쳐지므로 래퍼가 깐 상한을 덮어쓴다.
  // 여기서 숫자를 주면 iOS까지 잘리므로 반드시 android 전용 FONT_SCALE_CAP을 쓴다.
  const fitOneLine = { numberOfLines: 1 as const, adjustsFontSizeToFit: true, minimumFontScale: 0.82, maxFontSizeMultiplier: FONT_SCALE_CAP };
  return (
    <View style={s.card} {...pan.panHandlers}>
      <Image source={slide.image} style={s.img} resizeMode="cover" />

      {/* 하단 밴드 — 배지 pill + 제목 + 설명 */}
      <View style={s.band}>
        <View style={[s.badge, isPremium && [s.badgePremium, { backgroundColor: skinAccent.accentDeep }]]}>
          {isPremium && slide.badgeKey ? (
            <Text style={[s.badgeSuffix, s.badgeSuffixPremium]}>{t(slide.badgeKey)}</Text>
          ) : (
            <>
              {/* 시안: eOrth = Montserrat-Black 16.13 / 공식 = 12 (같은 흰 pill 안 두 톤) */}
              <Text style={s.badgeBrand}>eOrth</Text>
              <Text style={s.badgeSuffix}>{t('socialEmpty.officialSuffix')}</Text>
            </>
          )}
        </View>
        <Text style={s.title} {...fitOneLine}>{t(slide.titleKey)}</Text>
        <Text style={[s.desc, isPremium && s.descPremium]} {...fitOneLine}>{t(slide.descKey)}</Text>
        {isPremium && slide.ctaKey && (
          <Text style={[s.ctaHint, { color: skinAccent.accent }]} {...fitOneLine}>{t(slide.ctaKey)}</Text>
        )}
      </View>

      <View style={s.dots}>
        {FEATURE_SLIDES.map((_, i) => (
          <View key={i} style={[s.dot, i === idx && s.dotOn]} />
        ))}
      </View>

      {/* 프리미엄 슬라이드만 탭 가능 — 카드 전체를 덮는 투명 터치 레이어(스와이프는 부모 PanResponder가 처리) */}
      {isPremium && (
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={0.85}
          onPress={onPremiumPress}
          accessibilityRole="button"
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  // 258×362 = 0.713. 배경은 밴드 반투명 합성 기준색(#0A0A0F)과 일치해야 시안 색(#333337)이 나온다.
  card: { width: '100%', aspectRatio: 0.713, borderRadius: 16, overflow: 'hidden', backgroundColor: '#0A0A0F' },
  img: { width: '100%', height: '66.85%' }, // 242/362

  band: { flex: 1, backgroundColor: 'rgba(217,217,217,0.2)', paddingHorizontal: 13, paddingTop: 10 }, // 20·17 → 12.9·10.9 (프리미엄 4줄이 클리핑되지 않게 1dp 당김)

  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    height: 16,        // 25 → 16.1
    borderRadius: 8,   // pill (시안 radius 31 = 완전 라운드)
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
  },
  // 프리미엄 배지·CTA 색은 호출부에서 스킨으로 주입 — 여기 값은 폴백
  badgePremium: { backgroundColor: '#6B21A8' },
  badgeBrand: { fontFamily: 'Montserrat-Black', fontSize: 10.5, color: '#000000', includeFontPadding: false }, // 16.13 → 10.4
  badgeSuffix: { fontSize: 7.5, fontWeight: '800', color: '#000000', marginLeft: 2, includeFontPadding: false }, // 12 → 7.7
  badgeSuffixPremium: { color: '#FFFFFF', marginLeft: 0 },

  title: { color: '#EDEDEC', fontSize: 13, lineHeight: 18.5, fontWeight: '800', marginTop: 3 }, // 20 → 12.9 (lineHeight 1.44)
  desc: { color: 'rgba(237,237,236,0.7)', fontSize: 10.5, lineHeight: 15, marginTop: 1 }, // 16 → 10.3
  descPremium: { marginTop: 0 },
  ctaHint: { color: '#BF85FC', fontSize: 10, lineHeight: 13, fontWeight: '800' }, // 프리미엄 전용 4번째 줄 — 밴드(≈77) 안에 들어가도록 여백 없음

  dots: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 4 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotOn: { backgroundColor: '#FFFFFF' },
});
