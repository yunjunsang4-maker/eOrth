import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, {
  Defs as SvgDefs,
  LinearGradient as SvgLinearGradient,
  Stop as SvgStop,
  Rect as SvgRect,
} from 'react-native-svg';
import { Colors } from '../constants';
import { useSkinAccent } from '../constants/skinTheme';

// 시안 카드: 흰 3% 패널 + 그라데이션 1px 스트로크(rx 28). 높이는 onLayout로 측정.
// 테두리 색은 지구본 스킨 연동 — aurora는 시안의 마젠타→시안 유지, 커스텀 스킨은 스킨 링 2-스톱
// (StatsScreen 히어로 카드 테두리와 동일 규칙).
export default function DetailBox({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const skinAccent = useSkinAccent();
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
                <SvgLinearGradient id="detailBoxRing" x1="15%" y1="0%" x2="70%" y2="72%">
                  {skinAccent.ringGradient
                    ? [
                        <SvgStop key="s0" offset="0" stopColor={skinAccent.ringGradient[0]} />,
                        <SvgStop key="s1" offset="0.6" stopColor={skinAccent.ringGradient[1]} stopOpacity={0} />,
                        <SvgStop key="s2" offset="1" stopColor={skinAccent.ringGradient[1]} stopOpacity={0.5} />,
                      ]
                    : [
                        <SvgStop key="s0" offset="0" stopColor="#FF14E4" />,
                        <SvgStop key="s1" offset="0.6" stopColor="#00D8F3" stopOpacity={0} />,
                        <SvgStop key="s2" offset="1" stopColor="#00D8F3" stopOpacity={0.5} />,
                      ]}
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
    fontSize: 15,
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
