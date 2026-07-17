import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, {
  Defs as SvgDefs,
  LinearGradient as SvgLinearGradient,
  Stop as SvgStop,
  Rect as SvgRect,
} from 'react-native-svg';
import { Colors } from '../constants';

// 시안 카드: 흰 3% 패널 + 그라데이션 1px 스트로크(rx 28). 높이는 onLayout로 측정.
// 테두리는 연도별 방문 통계 카드(GradientHalfCard)와 동일한 #CECFCD 대각선 그라데이션(스킨 무관).
export default function DetailBox({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View style={styles.wrap}>
      {!!title && <Text style={styles.title}>{title}</Text>}
      <View
        style={styles.card}
        onLayout={(e) =>
          setSize({
            w: Math.round(e.nativeEvent.layout.width),
            h: Math.round(e.nativeEvent.layout.height),
          })
        }
      >
        {children}
        {size.w > 0 && size.h > 0 && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg width={size.w} height={size.h}>
              <SvgDefs>
                {/* 연도별 방문 통계(GradientHalfCard) 테두리와 동일 그라데이션 — #CECFCD 대각선(좌상단 진하게, 가운데 투명, 우하단 약하게) */}
                <SvgLinearGradient id="detailBoxRing" x1="0" y1="0" x2="1" y2="1">
                  <SvgStop offset="0" stopColor="#CECFCD" stopOpacity={1} />
                  <SvgStop offset="0.4" stopColor="#CECFCD" stopOpacity={0} />
                  <SvgStop offset="0.6" stopColor="#CECFCD" stopOpacity={0} />
                  <SvgStop offset="1" stopColor="#CECFCD" stopOpacity={0.45} />
                </SvgLinearGradient>
              </SvgDefs>
              <SvgRect
                x={0.5}
                y={0.5}
                width={size.w - 1}
                height={size.h - 1}
                rx={28}
                stroke="url(#detailBoxRing)"
                strokeWidth={1}
                fill="none"
              />
            </Svg>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 20 },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 28,
    paddingVertical: 6,
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
});
