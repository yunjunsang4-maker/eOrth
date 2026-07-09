import React from 'react';
import Svg, { Rect, Path, Ellipse, Defs, LinearGradient, Stop } from 'react-native-svg';

// 소셜 블로그(저널) 기록 카드 데코 핀 — 시안 Group 2085664575.svg 그대로.
// 우측에 꽂을 땐 원본, 좌측에 꽂을 땐 좌우 반전(flip)으로 사용한다.
export default function BlogPin({ size = 21, flip = false }: { size?: number; flip?: boolean }) {
  const h = (size / 21) * 25;
  return (
    <Svg
      width={size}
      height={h}
      viewBox="0 0 21 25"
      fill="none"
      style={flip ? { transform: [{ scaleX: -1 }] } : undefined}
    >
      <Rect
        x="7.01779" y="14.5269" width="1.77005" height="8.78418"
        transform="rotate(30.1614 7.01779 14.5269)"
        fill="url(#bpin0)" fillOpacity={0.95}
      />
      <Path
        d="M12.8233 18.1443C13.8176 16.2507 12.9951 13.2807 9.7462 11.5727C6.58685 9.70329 3.71629 10.5501 2.72197 12.4437C1.72766 14.3373 3.14143 16.9797 5.9281 18.443C8.68299 20.1679 11.829 20.0378 12.8233 18.1443Z"
        fill="url(#bpin1)" fillOpacity={0.95}
      />
      <Path
        d="M9.45626 7.20264L14.0448 9.94888C14.0448 9.94888 11.4091 14.5505 11.0459 14.75C10.6827 14.9496 9.71751 15.2591 8.32546 14.4471C6.93341 13.6351 6.77598 12.3845 6.79949 12.2203C6.82299 12.0561 9.45626 7.20264 9.45626 7.20264Z"
        fill="url(#bpin2)" fillOpacity={0.95}
      />
      <Path
        d="M17.3374 9.43904C16.3713 11.0489 13.5597 11.1366 11.0575 9.63498C8.5553 8.13336 7.31005 5.61103 8.27615 4.00119C9.24225 2.39136 11.8386 2.87791 14.3408 4.37953C16.843 5.88115 18.3035 7.8292 17.3374 9.43904Z"
        fill="url(#bpin3)" fillOpacity={0.95}
      />
      <Ellipse
        cx="13.2502" cy="6.05771" rx="5.63999" ry="2.59957"
        transform="rotate(30.8853 13.2502 6.05771)"
        fill="url(#bpin4)" fillOpacity={0.95}
      />
      <Defs>
        <LinearGradient id="bpin0" x1="7.93501" y1="18.8944" x2="7.90281" y2="23.311" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#404040" />
          <Stop offset="1" stopColor="#A78BFA" />
        </LinearGradient>
        <LinearGradient id="bpin1" x1="9.7363" y1="11.5544" x2="6.06603" y2="18.544" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#E0C9FF" />
          <Stop offset="1" stopColor="#7C3AED" />
        </LinearGradient>
        <LinearGradient id="bpin2" x1="11.7611" y1="8.58209" x2="8.27041" y2="14.4144" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#E0C9FF" />
          <Stop offset="1" stopColor="#7C3AED" />
        </LinearGradient>
        <LinearGradient id="bpin3" x1="12.3292" y1="5.72034" x2="12.4851" y2="10.5161" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#E0C9FF" />
          <Stop offset="1" stopColor="#7C3AED" />
        </LinearGradient>
        <LinearGradient id="bpin4" x1="12.4225" y1="6.93574" x2="19.5406" y2="2.97909" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#E0C9FF" />
          <Stop offset="1" stopColor="#7C3AED" />
        </LinearGradient>
      </Defs>
    </Svg>
  );
}
