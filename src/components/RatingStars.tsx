import React, { useId } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Defs, ClipPath, Rect } from 'react-native-svg';

// 별점 표시(0.5점 단위) — 티켓과 통계가 같은 규칙을 쓰도록 공용화했다.
// 텍스트 ★ 글리프로는 반 칠을 못 해서 SVG로 그린다.
// 반 별 = 빈 별 위에 채운 별을 왼쪽 절반만 클립해 얹은 것.
const STAR_D = 'M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z';

interface RatingStarsProps {
  /** 0~5 원점수 — 표시할 때 0.5 단위로 반올림한다 (4.4 → 4.5, 4.2 → 4.0) */
  score: number;
  size?: number;
  /** 별 사이 간격 — style로 덮어쓸 수 있다 */
  gap?: number;
  fullColor?: string;
  emptyColor?: string;
  style?: StyleProp<ViewStyle>;
}

export default function RatingStars({
  score,
  size = 18,
  gap = 6,
  fullColor = '#FFBC00',
  emptyColor = 'rgba(255,255,255,0.6)',
  style,
}: RatingStarsProps) {
  // clipPath id는 문서 전역이라 인스턴스·별마다 고유해야 한다(useId의 콜론은 id로 못 씀)
  const uid = useId().replace(/:/g, '');
  const rounded = Math.round(score * 2) / 2;

  return (
    <View style={[st.row, { gap }, style]}>
      {[0, 1, 2, 3, 4].map((i) => {
        const ratio = Math.min(1, Math.max(0, rounded - i)); // 1 = 꽉, 0.5 = 반, 0 = 빈
        const clipId = `ratingStar${uid}_${i}`;
        return (
          <Svg key={i} width={size} height={size} viewBox="0 0 24 24">
            <Path d={STAR_D} fill={emptyColor} />
            {ratio > 0 && (
              <>
                <Defs>
                  <ClipPath id={clipId}>
                    <Rect x="0" y="0" width={24 * ratio} height="24" />
                  </ClipPath>
                </Defs>
                <Path d={STAR_D} fill={fullColor} clipPath={`url(#${clipId})`} />
              </>
            )}
          </Svg>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row' },
});
