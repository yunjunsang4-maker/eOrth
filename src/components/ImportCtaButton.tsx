import React, { useState } from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Text } from '../ui/Text';
import Svg, {
  Defs as SvgDefs,
  LinearGradient as SvgLinearGradient,
  Stop as SvgStop,
  Rect as SvgRect,
} from 'react-native-svg';
import { Typography } from '../constants';

// 우리 CTA 디자인 — 이중 그라데이션 링(#FF14E4→#00D8F3) 유리 필 버튼.
// 바깥 링 1.5px + 안쪽 링(6pt 인셋) + 네온 블룸(3겹) + 위쪽 밝은 유리 명암.
// gid: 한 화면에서 여러 번 쓰일 때 SVG 그라데이션 id 충돌을 막는 접두어.
export default function ImportCtaButton({
  label, onPress, gid = 'importCta', disabled = false, loading = false, style,
}: {
  label: string;
  onPress: () => void;
  gid?: string;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [w, setW] = useState(0);
  const H = 64;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.wrap, disabled && styles.disabled, style]}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
    >
      {w > 0 && (() => {
        // 글로우가 링 밖으로 번지도록 버튼보다 큰 캔버스에 그린다 (absoluteFill이면 잘림)
        const PAD = 14;
        return (
          <Svg
            width={w + PAD * 2}
            height={H + PAD * 2}
            style={{ position: 'absolute', top: -PAD, left: -PAD }}
            pointerEvents="none"
          >
            <SvgDefs>
              <SvgLinearGradient id={`${gid}Ring`} x1="0.055" y1="0.184" x2="0.563" y2="2.363">
                <SvgStop offset="0" stopColor="#FF14E4" />
                <SvgStop offset="1" stopColor="#00D8F3" />
              </SvgLinearGradient>
              {/* 유리 볼록면 — 위쪽 밝고 아래로 가라앉는 내부 명암 */}
              <SvgLinearGradient id={`${gid}Fill`} x1="0" y1="0" x2="0" y2="1">
                <SvgStop offset="0" stopColor="#FFFFFF" stopOpacity={0.07} />
                <SvgStop offset="0.45" stopColor="#FFFFFF" stopOpacity={0.02} />
                <SvgStop offset="1" stopColor="#000000" stopOpacity={0.15} />
              </SvgLinearGradient>
              {/* 위쪽 절반에만 걸리는 얇은 하이라이트 */}
              <SvgLinearGradient id={`${gid}TopHi`} x1="0" y1="0" x2="0" y2="1">
                <SvgStop offset="0" stopColor="#FFFFFF" stopOpacity={0.45} />
                <SvgStop offset="0.4" stopColor="#FFFFFF" stopOpacity={0} />
              </SvgLinearGradient>
            </SvgDefs>
            {/* 네온 블룸 — 같은 그라데이션을 넓고 흐리게 겹쳐 번짐을 만든다 */}
            <SvgRect
              x={PAD + 0.75} y={PAD + 0.75} width={w - 1.5} height={H - 1.5} rx={(H - 1.5) / 2}
              fill="none" stroke={`url(#${gid}Ring)`} strokeOpacity={0.06} strokeWidth={11}
            />
            <SvgRect
              x={PAD + 0.75} y={PAD + 0.75} width={w - 1.5} height={H - 1.5} rx={(H - 1.5) / 2}
              fill="none" stroke={`url(#${gid}Ring)`} strokeOpacity={0.1} strokeWidth={6.5}
            />
            <SvgRect
              x={PAD + 0.75} y={PAD + 0.75} width={w - 1.5} height={H - 1.5} rx={(H - 1.5) / 2}
              fill="none" stroke={`url(#${gid}Ring)`} strokeOpacity={0.18} strokeWidth={3.5}
            />
            {/* 내부 유리 명암 채움 */}
            <SvgRect
              x={PAD + 6.5} y={PAD + 7.5} width={w - 13} height={H - 15} rx={(H - 15) / 2}
              fill={`url(#${gid}Fill)`}
            />
            {/* 본체 이중 링 */}
            <SvgRect
              x={PAD + 0.75} y={PAD + 0.75} width={w - 1.5} height={H - 1.5} rx={(H - 1.5) / 2}
              fill="none" stroke={`url(#${gid}Ring)`} strokeWidth={1.5}
            />
            <SvgRect
              x={PAD + 6.5} y={PAD + 7.5} width={w - 13} height={H - 15} rx={(H - 15) / 2}
              fill="none" stroke={`url(#${gid}Ring)`} strokeOpacity={0.4} strokeWidth={1}
            />
            {/* 위쪽 하이라이트 — 안쪽 필 상단에 빛이 맺힌 느낌 */}
            <SvgRect
              x={PAD + 6.5} y={PAD + 7.5} width={w - 13} height={H - 15} rx={(H - 15) / 2}
              fill="none" stroke={`url(#${gid}TopHi)`} strokeWidth={1}
            />
          </Svg>
        );
      })()}
      {loading ? (
        <ActivityIndicator color="#FFFFFF" size="small" />
      ) : (
        <Text style={styles.text}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: Typography.fontFamily.bold,
  },
});
