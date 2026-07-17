import React from 'react';
import Svg, { Circle, Line, Path, Defs, ClipPath, G } from 'react-native-svg';

// eOrth 로고의 지구본 마크 (Group 2085664471.svg) — 예시 공식 프로필 아바타용.
// 흰 선 지구본. 배경(검정 원)은 호출부(아바타 컨테이너)가 제공한다.
// 위경선은 원 밖으로 삐져나오지 않게 clip 처리.
export const EorthGlobeMark: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <Svg width={size} height={size} viewBox="34 10 47 47" fill="none">
    <Defs>
      <ClipPath id="eorthGlobeClip">
        <Circle cx={57} cy={38} r={15.5} />
      </ClipPath>
    </Defs>
    {/* 위경선 — 지구본 원 안으로만 */}
    <G clipPath="url(#eorthGlobeClip)">
      <Path d="M57 13C53.5 19.5 52 27 52 33.5C52 41.5 54.3333 51 57 54" stroke="#fff" strokeWidth={0.8} />
      <Path d="M58 13C61.8889 19.5802 63 29.7037 63 34.2593C63 38.8148 61.3333 50.963 58 54" stroke="#fff" strokeWidth={0.8} />
      <Path d="M57 13C49.5143 16.9994 45 23.5046 45 35.0029C45 46.5011 50.9889 52.5002 54.9814 54" stroke="#fff" strokeWidth={0.8} />
      <Path d="M58 13C65.4857 16.9994 70 24.642 70 34.2593C70 43.8765 64.0111 52.5002 60.0186 54" stroke="#fff" strokeWidth={0.8} />
      <Line x1={57.4} y1={12} x2={57.4} y2={54} stroke="#fff" strokeWidth={0.8} />
      <Line x1={36} y1={33.6} x2={78} y2={33.6} stroke="#fff" strokeWidth={0.8} />
      <Line x1={38} y1={41.6} x2={76} y2={41.6} stroke="#fff" strokeWidth={0.8} />
      <Line x1={38} y1={25.6} x2={77} y2={25.6} stroke="#fff" strokeWidth={0.8} />
    </G>
    {/* 지구본 외곽 원 */}
    <Circle cx={57} cy={38} r={15.5} stroke="#fff" strokeWidth={1} fill="none" />
    {/* 하단 작은 위성 원 (로고의 서브 글로브) */}
    <Circle cx={56.5} cy={46.5} r={6.75} stroke="#fff" strokeWidth={1.2} fill="#0B0A0E" />
  </Svg>
);
