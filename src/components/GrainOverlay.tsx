import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

// Deterministic pseudo-random
const srand = (seed: number) => {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};

interface Props {
  opacity?: number;
  dotCount?: number;
}

export default function GrainOverlay({ opacity = 0.06, dotCount = 120 }: Props) {
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

  return (
    <Svg
      width="100%"
      height="100%"
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      viewBox="0 0 200 200"
      preserveAspectRatio="xMidYMid slice"
    >
      {dots.map((d, i) => (
        <Circle
          key={i}
          cx={d.cx}
          cy={d.cy}
          r={d.r}
          fill="#FFFFFF"
          opacity={d.o * opacity}
        />
      ))}
    </Svg>
  );
}
