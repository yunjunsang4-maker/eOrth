import React from 'react';
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';

// 지구본 + 자물쇠 아이콘 — 비이웃 프로필 잠금 안내용.
// 지구본(위경도 격자 원)을 옅게 그리고, 중앙에 자물쇠를 또렷하게 얹어 '잠긴 여행기록'을 표현.
export default function GlobeLockIcon({
  size = 72,
  color = '#BF85FC',
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* 지구본 — 원 + 격자(옅게) */}
      <Circle cx={50} cy={50} r={38} stroke={color} strokeWidth={2} fill="none" opacity={0.9} />
      <Ellipse cx={50} cy={50} rx={14} ry={38} stroke={color} strokeWidth={1.4} fill="none" opacity={0.3} />
      <Line x1={12} y1={50} x2={88} y2={50} stroke={color} strokeWidth={1.4} opacity={0.3} />
      <Line x1={19} y1={31} x2={81} y2={31} stroke={color} strokeWidth={1.4} opacity={0.3} />
      <Line x1={19} y1={69} x2={81} y2={69} stroke={color} strokeWidth={1.4} opacity={0.3} />

      {/* 자물쇠 — 중앙, 배경 원판으로 격자와 분리 */}
      <Circle cx={50} cy={52} r={20} fill="#0A0A0F" opacity={0.85} />
      {/* 고리(shackle) */}
      <Path
        d="M43 49 v-4 a7 7 0 0 1 14 0 v4"
        stroke={color}
        strokeWidth={2.4}
        fill="none"
        strokeLinecap="round"
      />
      {/* 몸체 */}
      <Rect x={40} y={49} width={20} height={15} rx={3} fill={color} />
      {/* 열쇠구멍 */}
      <Circle cx={50} cy={55} r={2} fill="#0A0A0F" />
      <Rect x={49} y={55} width={2} height={5} rx={1} fill="#0A0A0F" />
    </Svg>
  );
}
