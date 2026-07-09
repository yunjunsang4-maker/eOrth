import React, { forwardRef } from 'react';
import { View, Image, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CUT_LAYOUTS, getCutFrame, CutFrame, CutLayout } from '../constants/cutFrames';
import { AdjustedCoverImage, type CutTransform } from './CutPhotoAdjustModal';
import { handleFontStyle } from '../constants/handleFonts';

/** 하단 여백 스탬프 — 날짜(무료)·문구+폰트(프리미엄). 생성 시점 값이 cutPhoto.stamp로 박제된다 */
export interface CutStamp {
  date?: string;   // 표시할 날짜 문자열 (예: 2026.07.06)
  text?: string;   // 문구
  fontId?: string; // 문구 폰트 — HANDLE_FONTS id
}

interface Props {
  frameId: string;
  photos: (string | null)[];   // 슬롯별 사진 URI (null = 빈 슬롯)
  width: number;               // 캔버스 가로 px (높이는 aspect로 계산)
  onSlotPress?: (index: number) => void;
  capture?: boolean;           // true면 placeholder/터치 숨김(캡처·미리보기용)
  bgOverride?: string;         // 프레임 배경색 오버라이드 (기본 프레임의 사용자 RGB 색)
  bgImageOverride?: string;    // 프레임 배경 사진 uri (프리미엄: 사진 프레임) — 색 위에 cover로 깔림
  transforms?: (CutTransform | null)[]; // 슬롯별 사진 조정값(이동/확대)
  showLogo?: boolean;          // eOrth 브랜드 로고 표시 — 프리미엄(스트립 로고 제거)이면 false
  stamp?: CutStamp;            // 하단 여백 날짜·문구 스탬프 (여백 있는 레이아웃에서만 렌더)
}

// 하단 여백 로고 크기 — 캔버스 '폭' 대비 비율. 레이아웃별 임시값(보고 조정).
// 이 맵에 있는 레이아웃(하단 여백 있는 5종)에만 로고를 넣는다 — 나머지는 로고 없음.
const LOGO_SCALE: Partial<Record<CutLayout, number>> = {
  'two-v': 0.11,   // 2컷 세로 — 하단 여백이 가장 큼 (28%)
  'three-v': 0.09, // 3컷 세로
  'four': 0.085,   // 4컷 (2x2 정사각)
  'six-v': 0.09,   // 6컷 세로
  'nine': 0.08,    // 9컷
  'film': 0.12,    // 필름 세로(모노 필름) — 하단 빈 공간(~높이 24%)에 로고·날짜·문구
  'four-stagger': 0.075, // 4컷 엇갈림(나이트 콘택트) — 하단 ~12% 밴드
};

/** 하단 여백(로고·스탬프 영역)이 있는 레이아웃인지 — CutRecordScreen이 스탬프 UI 노출 여부에 사용 */
export const cutHasBottomBand = (layout: CutLayout): boolean => LOGO_SCALE[layout] != null;

// 배경 밝기 판정 — 로고 색을 배경에 맞춰 어둡게/밝게 (판정 불가 시 밝은 배경 취급)
const isLightHex = (hex?: string): boolean => {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return true;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
};

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
  ({ frameId, photos, width, onSlotPress, capture, bgOverride, bgImageOverride, transforms, showLogo, stamp }, ref) => {
    const frame: CutFrame | undefined = getCutFrame(frameId);
    if (!frame) return null;

    const spec = CUT_LAYOUTS[frame.layout];
    const height = width / spec.aspect;
    const isFilm = !!spec.film;
    const bgColor = bgOverride ?? (frame.background.type === 'color' ? frame.background.value : undefined);
    // 필름: 베이스는 항상 어두운 필름색 고정, 사용자 색(bgOverride)은 천공에만 적용
    const containerBg = isFilm ? FILM_BASE : bgColor;
    const holeColor = bgOverride ?? FILM_HOLE_DEFAULT;

    // 하단 여백 스택 — 여백 있는 레이아웃(LOGO_SCALE)에만: [문구 → 날짜 → 로고] 세로 중앙 정렬
    const logoScale = LOGO_SCALE[frame.layout];
    const hasBand = logoScale != null;
    const renderLogo = !!showLogo && hasBand;
    const renderStamp = hasBand && !!(stamp?.text || stamp?.date);
    const slotBottom = Math.max(...spec.slots.map((s) => s.y + s.h));
    const logoSize = Math.max(8, width * (logoScale ?? 0));
    const captionSize = Math.max(9, width * 0.06);
    const dateSize = Math.max(7, width * 0.034);
    // 이미지 배경(테마·사용자 사진)은 밝기를 알 수 없어 밝은 글자로 고정
    const logoLight = frame.background.type === 'image' || bgImageOverride ? false : isLightHex(containerBg);
    // 문구는 또렷하게, 날짜는 중간, 로고는 은은하게 — 배경 밝기에 맞춰 반전
    const capColor = logoLight ? 'rgba(30,28,40,0.62)' : 'rgba(255,255,255,0.85)';
    const dateColor = logoLight ? 'rgba(30,28,40,0.48)' : 'rgba(255,255,255,0.70)';

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

        {/* 사용자 사진 프레임(프리미엄) — 색/테마 배경 위에 cover로 깔림 */}
        {!!bgImageOverride && (
          <Image source={{ uri: bgImageOverride }} style={StyleSheet.absoluteFill} resizeMode="cover" />
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

        {(renderLogo || renderStamp) && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: slotBottom * height,
              height: (1 - slotBottom) * height,
              alignItems: 'center',
              justifyContent: 'center',
              gap: Math.max(2, width * 0.014),
            }}
          >
            {renderStamp && !!stamp?.text && (
              <Text
                numberOfLines={1}
                style={[
                  { fontSize: captionSize, color: capColor, maxWidth: width * 0.9, textAlign: 'center' },
                  handleFontStyle(stamp.fontId),
                ]}
              >
                {stamp.text}
              </Text>
            )}
            {renderStamp && !!stamp?.date && (
              <Text style={{ fontSize: dateSize, color: dateColor, letterSpacing: dateSize * 0.12 }}>
                {stamp.date}
              </Text>
            )}
            {renderLogo && (
              <Text
                style={{
                  fontFamily: 'Gilroy-Black',
                  fontSize: logoSize,
                  letterSpacing: logoSize * 0.06,
                  color: logoLight ? 'rgba(30,28,40,0.40)' : 'rgba(255,255,255,0.60)',
                }}
              >
                eOrth
              </Text>
            )}
          </View>
        )}
      </View>
    );
  }
);

CutPhotoCanvas.displayName = 'CutPhotoCanvas';

export default CutPhotoCanvas;

const st = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  ph: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  phTxt: { fontSize: 28, color: '#9AA0A8' },
});
