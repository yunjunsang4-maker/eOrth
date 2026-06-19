import React, { forwardRef } from 'react';
import { View, Image, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CUT_LAYOUTS, getCutFrame, CutFrame } from '../constants/cutFrames';
import { AdjustedCoverImage, type CutTransform } from './CutPhotoAdjustModal';

interface Props {
  frameId: string;
  photos: (string | null)[];   // 슬롯별 사진 URI (null = 빈 슬롯)
  width: number;               // 캔버스 가로 px (높이는 aspect로 계산)
  onSlotPress?: (index: number) => void;
  capture?: boolean;           // true면 placeholder/터치 숨김(캡처·미리보기용)
  bgOverride?: string;         // 프레임 배경색 오버라이드 (기본 프레임의 사용자 RGB 색)
  transforms?: (CutTransform | null)[]; // 슬롯별 사진 조정값(이동/확대)
}

// 어두운 필름 베이스 (항상 고정 — 색은 천공에만 적용)
const FILM_BASE = '#1A1512';
// 색 미지정(테마)일 때 천공 기본색 (크림 화이트)
const FILM_HOLE_DEFAULT = '#EFE9DB';

// 필름 천공(스프로킷 홀)을 양쪽 가장자리에 그려 실제 필름 느낌을 낸다
function renderFilmHoles(dir: 'v' | 'h', width: number, height: number, holeColor: string) {
  const vertical = dir === 'v';
  const short = vertical ? width : height; // 천공 영역이 있는 짧은 변
  const long = vertical ? height : width;  // 스트립 진행 방향
  // 실제 35mm 처럼 작고 촘촘한 천공 (가장자리 쪽이 약간 더 넓은 둥근 사각형)
  const holeCross = short * 0.052;         // 가장자리 방향 길이
  const holeLong = short * 0.038;          // 스트립 진행 방향 길이
  const pitch = short * 0.07;              // 홀 간격 (촘촘하게)
  const count = Math.max(2, Math.floor((long - holeLong) / pitch) + 1);
  const start = (long - (count - 1) * pitch) / 2;
  const near = short * 0.072; // 한쪽 천공열 중심
  const far = short * 0.928;  // 반대쪽 천공열 중심
  const radius = Math.min(holeCross, holeLong) * 0.3;

  const holes: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const p = start + i * pitch;
    [near, far].forEach((c, side) => {
      const cx = vertical ? c : p;
      const cy = vertical ? p : c;
      const w = vertical ? holeCross : holeLong;
      const h = vertical ? holeLong : holeCross;
      holes.push(
        <View
          key={`fh-${i}-${side}`}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: cx - w / 2,
            top: cy - h / 2,
            width: w,
            height: h,
            borderRadius: radius,
            backgroundColor: holeColor,
          }}
        />
      );
    });
  }
  return holes;
}

/**
 * cutPhoto 1건을 렌더하는 공용 캔버스.
 * 프레임 배경 위에 레이아웃 슬롯대로 사진을 cover로 채운다.
 * forwardRef로 부모(react-native-view-shot)가 캡처할 수 있다.
 */
const CutPhotoCanvas = forwardRef<View, Props>(
  ({ frameId, photos, width, onSlotPress, capture, bgOverride, transforms }, ref) => {
    const frame: CutFrame | undefined = getCutFrame(frameId);
    if (!frame) return null;

    const spec = CUT_LAYOUTS[frame.layout];
    const height = width / spec.aspect;
    const isFilm = !!spec.film;
    const bgColor = bgOverride ?? (frame.background.type === 'color' ? frame.background.value : undefined);
    // 필름: 베이스는 항상 어두운 필름색 고정, 사용자 색(bgOverride)은 천공에만 적용
    const containerBg = isFilm ? FILM_BASE : bgColor;
    const holeColor = bgOverride ?? FILM_HOLE_DEFAULT;

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
            backgroundColor: containerBg,
          },
        ]}
      >
        {frame.background.type === 'image' && (
          <Image source={frame.background.source} style={[StyleSheet.absoluteFill, frame.backgroundStyle]} resizeMode="cover" />
        )}

        {spec.film && renderFilmHoles(spec.film, width, height, holeColor)}

        {spec.slots.map((s, i) => {
          const uri = photos[i] ?? null;
          const slotStyle = {
            position: 'absolute' as const,
            left: s.x * width,
            top: s.y * height,
            width: s.w * width,
            height: s.h * height,
            borderRadius: isFilm ? 2 : 4,
            overflow: 'hidden' as const,
            backgroundColor: isFilm ? '#FAF8F2' : '#D9DCE1', // 필름은 흰 창, 그 외 중립 회색
          };

          const t = transforms?.[i] ?? null;

          const inner = uri ? (
            // 슬롯 크기 cover에 transform을 직접 걸면 cover가 이미 잘라낸 영역이 검게 비어
            // 조정 모달과 결과가 어긋난다 → 공용 컴포넌트로 동일 기하(전체 비트맵 + 이동/확대) 적용
            <AdjustedCoverImage uri={uri} transform={t} frameW={s.w * width} frameH={s.h * height} />
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
  phTxt: { fontSize: 28, color: '#9AA0A8' },
});
