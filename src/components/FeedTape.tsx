import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

// 소셜 피드(폴라로이드) 기록 카드 데코 테이프 — 시안 2종을 카드별로 랜덤 적용.
//  variant 0: Rectangle 240652793.svg — 찢긴 단면 테이프 (색은 variant 1과 동일한 #D9D9D9로 통일)
//  variant 1: Rectangle 240652795.svg — 사선 테이프 (#D9D9D9)
export default function FeedTape({ variant = 0, scale }: { variant?: 0 | 1; scale?: number }) {
  if (variant === 1) {
    const sc = scale ?? 1.15; // 살짝 축소
    return (
      <Svg width={36 * sc} height={24 * sc} viewBox="0 0 36 24" fill="none">
        <Rect
          y="13.3262" width="13.99" height="33.2263"
          transform="rotate(-72.2817 0 13.3262)"
          fill="#D9D9D9" fillOpacity={0.2}
        />
      </Svg>
    );
  }
  const sc = scale ?? 1.9; // 원본(20×9)이 작아 살짝 키움
  return (
    <Svg width={20 * sc} height={9 * sc} viewBox="0 0 20 9" fill="none">
      <Path
        d="M0 7.99756L1.5751 7.20987L0.0400777 6.29174L1.62072 5.2681L0.0885547 4.22843L1.66815 3.24969L0.139604 2.05564L1.71572 1.22488L0.187906 -0.000234604L19.1827 0.446042L18.9948 8.44384L0 7.99756Z"
        fill="#D9D9D9" fillOpacity={0.2}
      />
    </Svg>
  );
}
