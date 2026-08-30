import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';
import { useTranslation } from 'react-i18next';

/**
 * 피드 첫 로딩 자리표시 — 2단 매거진 배치를 그대로 흉내 낸 회색 카드.
 *
 * 왜 필요한가: `feedPosts`는 세션마다 빈 배열로 시작한다. 첫 로딩 플래그가 없던 동안에는
 * 그 순간이 '빈 피드'로 판정돼, 이웃 글이 많은 사용자에게도 **"피드가 비었어요" 예시 화면이
 * 번쩍인 뒤** 진짜 피드로 바뀌었다. 빈 화면보다 나쁜, 사실과 다른 상태다.
 * 여기서는 아무 주장도 하지 않는 자리표시만 보여준다.
 *
 * 높이는 실제 카드 분포에 맞춰 좌우를 다르게 뒀다 — 같은 높이로 두면 로딩이 끝나는 순간
 * 레이아웃이 크게 튄다.
 */
const LEFT_HEIGHTS = [210, 150, 240];
const RIGHT_HEIGHTS = [160, 230, 180];

function ShimmerCard({ height, delay }: { height: number; delay: number }) {
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, delay, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, delay]);
  return <Animated.View style={[s.card, { height, opacity: pulse }]} />;
}

export default function FeedSkeleton() {
  const { t } = useTranslation();
  return (
    // 스크린리더에는 '불러오는 중'만 알린다 — 회색 상자 6개를 하나씩 읽어줄 이유가 없다
    <View style={s.row} accessible accessibilityRole="progressbar" accessibilityLabel={t('common.loading')}>
      <View style={s.col}>
        {LEFT_HEIGHTS.map((h, i) => <ShimmerCard key={`l${i}`} height={h} delay={i * 120} />)}
      </View>
      <View style={s.col}>
        {RIGHT_HEIGHTS.map((h, i) => <ShimmerCard key={`r${i}`} height={h} delay={i * 120 + 60} />)}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 2 },
  col: { flex: 1, gap: 10 },
  card: { borderRadius: 16, backgroundColor: '#1E1E2B' },
});
