import React, { forwardRef } from 'react';
import { View, Image, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CUT_LAYOUTS, getCutFrame, CutFrame } from '../constants/cutFrames';

interface Props {
  frameId: string;
  photos: (string | null)[];   // 슬롯별 사진 URI (null = 빈 슬롯)
  width: number;               // 캔버스 가로 px (높이는 aspect로 계산)
  onSlotPress?: (index: number) => void;
  capture?: boolean;           // true면 placeholder/터치 숨김(캡처·미리보기용)
}

/**
 * cutPhoto 1건을 렌더하는 공용 캔버스.
 * 프레임 배경 위에 레이아웃 슬롯대로 사진을 cover로 채운다.
 * forwardRef로 부모(react-native-view-shot)가 캡처할 수 있다.
 */
const CutPhotoCanvas = forwardRef<View, Props>(
  ({ frameId, photos, width, onSlotPress, capture }, ref) => {
    const frame: CutFrame | undefined = getCutFrame(frameId);
    if (!frame) return null;

    const spec = CUT_LAYOUTS[frame.layout];
    const height = width / spec.aspect;
    const bgColor = frame.background.type === 'color' ? frame.background.value : undefined;

    return (
      <View
        ref={ref}
        collapsable={false}
        style={[
          {
            width,
            height,
            borderRadius: frame.border?.radius ?? 0,
            overflow: 'hidden',
            borderWidth: frame.border?.width ?? 0,
            borderColor: frame.border?.color,
            backgroundColor: bgColor,
          },
        ]}
      >
        {frame.background.type === 'image' && (
          <Image source={frame.background.source} style={StyleSheet.absoluteFill} resizeMode="cover" />
        )}

        {spec.slots.map((s, i) => {
          const uri = photos[i] ?? null;
          const slotStyle = {
            position: 'absolute' as const,
            left: s.x * width,
            top: s.y * height,
            width: s.w * width,
            height: s.h * height,
            borderRadius: 4,
            overflow: 'hidden' as const,
            backgroundColor: 'rgba(0,0,0,0.18)',
          };

          const inner = uri ? (
            <Image source={{ uri }} style={st.fill} resizeMode="cover" />
          ) : !capture ? (
            <View style={st.ph}>
              <Text style={st.phTxt}>＋</Text>
            </View>
          ) : null;

          if (onSlotPress && !capture) {
            return (
              <TouchableOpacity key={i} style={slotStyle} activeOpacity={0.8} onPress={() => onSlotPress(i)}>
                {inner}
              </TouchableOpacity>
            );
          }
          return (
            <View key={i} style={slotStyle}>
              {inner}
            </View>
          );
        })}
      </View>
    );
  }
);

export default CutPhotoCanvas;

const st = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  ph: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  phTxt: { fontSize: 28, color: 'rgba(255,255,255,0.5)' },
});
