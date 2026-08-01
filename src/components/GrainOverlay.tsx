import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

// Deterministic pseudo-random
const srand = (seed: number) => {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};

interface Props {
  opacity?: number;
  dotCount?: number;
  color?: string; // 점 색 (기본 흰색; 다크 노이즈엔 '#000000')
}

export default function GrainOverlay({ opacity = 0.06, dotCount = 120, color = '#FFFFFF' }: Props) {
  const dots = useMemo(() => {
    const arr = [];
    for (let i = 0; i < dotCount; i++) {
      arr.push({
        cx: srand(i * 7 + 1) * 200,
        cy: srand(i * 13 + 3) * 200,
        r: srand(i * 3 + 5) * 1.2 + 0.4,
        o: srand(i * 11 + 7) * 0.5 + 0.2,
      });
    }
    return arr;
  }, [dotCount]);

  // 새 아키텍처의 RNSVG는 Svg에 직접 준 pointerEvents를 무시한다 —
  // 반드시 View(pointerEvents="none")로 감싸야 터치가 아래로 통과한다(StarFieldBackground와 동일).
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 200 200"
        preserveAspectRatio="xMidYMid slice"
      >
        {dots.map((d, i) => (
          <Circle
            key={i}
            cx={d.cx}
            cy={d.cy}
            r={d.r}
            fill={color}
            opacity={d.o * opacity}
          />
        ))}
      </Svg>
    </View>
  );
}
