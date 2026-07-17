// src/components/social/FeatureShowcaseCard.tsx
// 빈 소셜탭 기능 소개 카드 — 지구본·통계·배지 3슬라이드를 3초 자동 순회.
// 탭 액션 없음(정보 전용). 화면 밖/백그라운드에선 타이머 정지(발열 방지).
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Image, StyleSheet, PanResponder } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FEATURE_SLIDES } from '../../constants/exampleContent';
import { nextIndex } from '../../utils/carousel';
import { useAnimationsActive } from '../../hooks/useAnimationsActive';

export default function FeatureShowcaseCard() {
  const { t } = useTranslation();
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
  return (
    <View style={s.card} {...pan.panHandlers}>
      <Image source={slide.image} style={s.img} resizeMode="cover" />
      <View style={s.overlay}>
        <Text style={s.badge}>{t('socialEmpty.official')}</Text>
        <Text style={s.title}>{t(slide.titleKey)}</Text>
        <Text style={s.desc}>{t(slide.descKey)}</Text>
      </View>
      <View style={s.dots}>
        {FEATURE_SLIDES.map((_, i) => (
          <View key={i} style={[s.dot, i === idx && s.dotOn]} />
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { width: '100%', borderRadius: 16, overflow: 'hidden', backgroundColor: '#161421', aspectRatio: 0.72 },
  img: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, backgroundColor: 'rgba(0,0,0,0.45)' },
  badge: { alignSelf: 'flex-start', fontSize: 9, fontWeight: '800', color: '#0A0A0F', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden', marginBottom: 6 },
  title: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  desc: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 3, lineHeight: 15 },
  dots: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 4 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotOn: { backgroundColor: '#FFFFFF' },
});
