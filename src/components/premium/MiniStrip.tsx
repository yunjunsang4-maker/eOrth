import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Text } from '../../ui/Text';

// 프리미엄 소개 화면 전용 미니 네컷 스트립 미리보기.
// 실제 편집기(CutPhotoCanvas)를 띄우기엔 무거워서, 2컷 세로 스트립의
// 슬롯 비율·로고 규칙만 동일하게 맞춘 가벼운 재현본을 쓴다.
// 로고 제거 / 프레임 커스텀 두 카드가 함께 쓴다.

const PHOTO_A = require('../../../assets/example/feed1.jpg');
const PHOTO_B = require('../../../assets/example/snap1.jpg');

// CutPhotoCanvas와 같은 로고 자산 — 밝은 배경엔 검정, 어두운 배경엔 흰색
const LOGO_WHITE = require('../../../assets/logo-white.png');
const LOGO_BLACK = require('../../../assets/logo-black.png');
const LOGO_ASPECT = 160 / 44;

// 배경 밝기 판정 — CutPhotoCanvas의 isLightHex와 동일 기준
const isLightHex = (hex?: string): boolean => {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return true;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
};

// constants/cutFrames.ts의 twoSlotsV()와 같은 배치 (1:2 비율, 사진 4:3)
const SLOTS = [
  { x: 0.06, y: 0.03, w: 0.88, h: 0.33 },
  { x: 0.06, y: 0.39, w: 0.88, h: 0.33 },
];

interface MiniStripProps {
  /** 스트립 가로 폭 — 높이는 1:2 비율로 자동 계산 */
  width: number;
  frameColor: string;
  /** false면 하단 로고를 비운다 (스트립 로고 제거 혜택 시연) */
  showLogo?: boolean;
  /** 로고 대신 넣을 문구 스탬프 (프레임 커스텀 혜택 시연) */
  stamp?: string;
}

export default function MiniStrip({ width, frameColor, showLogo = true, stamp }: MiniStripProps) {
  const height = width * 2;
  const light = isLightHex(frameColor);
  const logoW = width * 0.44;
  const inkColor = light ? 'rgba(30,28,40,0.62)' : 'rgba(255,255,255,0.85)';

  return (
    <View style={[st.strip, { width, height, backgroundColor: frameColor }]}>
      {SLOTS.map((s, i) => (
        <Image
          key={i}
          source={i === 0 ? PHOTO_A : PHOTO_B}
          style={{
            position: 'absolute',
            left: s.x * width,
            top: s.y * height,
            width: s.w * width,
            height: s.h * height,
          }}
          resizeMode="cover"
        />
      ))}

      {/* 하단 여백 — 로고 또는 스탬프 자리 */}
      <View style={[st.footer, { top: height * 0.73, height: height * 0.22 }]}>
        {showLogo ? (
          <Image
            source={light ? LOGO_BLACK : LOGO_WHITE}
            style={{ width: logoW, height: logoW / LOGO_ASPECT, opacity: light ? 0.55 : 0.7 }}
            resizeMode="contain"
          />
        ) : stamp ? (
          <Text style={[st.stamp, { color: inkColor }]} numberOfLines={1}>
            {stamp}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  strip: {
    borderRadius: 6,
    overflow: 'hidden',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stamp: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
