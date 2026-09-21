/**
 * eOrth Icons — React Native components (react-native-svg)
 *
 * PALETTE (from eOrth spec)
 *   보라 네온   #BF85FC  주요 아이콘
 *   보라 딥     #6B21A8  보조
 *   금색       #FFD700  Star, Sun
 *   빨강       #FF3B30  Exit, 알림 닷
 */

import React from 'react';
import Svg, { Path, Circle, Rect, G, Defs, LinearGradient, Stop, Mask } from 'react-native-svg';

export type IconProps = {
  size?: number;
  color?: string;
  dot?: boolean;
  dotColor?: string;
};

// ─── ACTIVE COLORS ────────────────────────────────────────────────────
export const COLORS = {
  purpleTop: '#E0C9FF',
  purpleMid: '#A78BFA',
  purpleBot: '#7C3AED',
  goldTop:   '#FFE98A',
  goldBot:   '#E5B100',
  redTop:    '#FF8080',
  redBot:    '#FF3B30',
  dot:       '#FF4D4D',
};

export const PALETTES = {
  purple: {
    purpleTop: '#E0C9FF', purpleMid: '#A78BFA', purpleBot: '#7C3AED',
    goldTop:   '#FFE98A', goldBot:   '#E5B100',
    redTop:    '#FF8080', redBot:    '#FF3B30',
    dot:       '#FF4D4D',
  },
  neon: {
    purpleTop: '#F5A6FF', purpleMid: '#C77DFF', purpleBot: '#9D4EDD',
    goldTop:   '#FFE99A', goldBot:   '#E5B100',
    redTop:    '#FF8FA8', redBot:    '#FF477E',
    dot:       '#FF477E',
  },
  cyan: {
    purpleTop: '#B5F5FF', purpleMid: '#5FB8FF', purpleBot: '#2563EB',
    goldTop:   '#FFE57A', goldBot:   '#E0A600',
    redTop:    '#FF8E91', redBot:    '#FF5A5F',
    dot:       '#FF5A5F',
  },
  mint: {
    purpleTop: '#C9FFE5', purpleMid: '#5FE3A1', purpleBot: '#10B981',
    goldTop:   '#FFE57A', goldBot:   '#E5B100',
    redTop:    '#FF9999', redBot:    '#FF6B6B',
    dot:       '#FF6B6B',
  },
} as const;

export type PaletteName = keyof typeof PALETTES;

export function setPalette(name: PaletteName) {
  Object.assign(COLORS, PALETTES[name]);
}


// ══════════════════════════════════════════════════════════════════════
//   Section 2 — Custom SVG (core)
// ══════════════════════════════════════════════════════════════════════

export const PlaneIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path transform="rotate(-15 48 48)" d="M52 8c3 0 5.5 2 6.5 5l4 16 22 12c2 1 3 3 3 5v3c0 2-2 3-4 3l-22-4-3 16 7 5c1 1 2 2 2 4v3c0 1-1 2-2 2l-12-3-3 6c-1 2-3 2-4 0l-3-6-12 3c-1 0-2-1-2-2v-3c0-2 1-3 2-4l7-5-3-16-22 4c-2 0-4-1-4-3v-3c0-2 1-4 3-5l22-12 4-16C46.5 10 49 8 52 8h0z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const GlobeIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path fillRule="evenodd" clipRule="evenodd" d="M48 8C25.9 8 8 25.9 8 48s17.9 40 40 40 40-17.9 40-40S70.1 8 48 8zm0 8c2 0 5 3 7.5 9.5 1 2.5 1.8 5.5 2.4 8.8H38.1c.6-3.3 1.4-6.3 2.4-8.8C43 19 46 16 48 16zM30 26c-.9 2.6-1.6 5.4-2.1 8.3H17.5c2.7-3.4 6-6.2 9.8-8.3l2.7 0zm38.7 8.3c-.5-2.9-1.2-5.7-2.1-8.3 4 2 7.4 4.9 10.1 8.3H68.7zM12.7 42.3H26.4c-.2 1.9-.3 3.8-.3 5.7s.1 3.8.3 5.7H12.7c-.5-1.8-.7-3.7-.7-5.7s.2-3.9.7-5.7zm21.7 0h27.2c.2 1.9.3 3.8.3 5.7s-.1 3.8-.3 5.7H34.4c-.2-1.9-.3-3.8-.3-5.7s.1-3.8.3-5.7zm35.2 0h13.7c.5 1.8.7 3.7.7 5.7s-.2 3.9-.7 5.7H69.6c.2-1.9.3-3.8.3-5.7s-.1-3.8-.3-5.7zM17.5 61.7h10.4c.5 2.9 1.2 5.7 2.1 8.3-3.8-2.1-7.1-4.9-9.8-8.3h-2.7zm20.6 0h19.8c-.6 3.3-1.4 6.3-2.4 8.8C53 77 50 80 48 80s-5-3-7.5-9.5c-1-2.5-1.8-5.5-2.4-8.8zm28 0h10.4c-2.7 3.4-6.1 6.3-10.1 8.3.9-2.6 1.6-5.4 2.1-8.3z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const PinIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M48 8C32 8 19 21 19 37c0 21 25 47 27 50 1 1 3 1 4 0 2-3 27-29 27-50C77 21 64 8 48 8zm0 38a9 9 0 110-18 9 9 0 010 18z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const CameraIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M36 14c-2 0-4 1-5 3l-3 5h-8c-6 0-10 4-10 10v40c0 6 4 10 10 10h56c6 0 10-4 10-10V32c0-6-4-10-10-10h-8l-3-5c-1-2-3-3-5-3H36zm12 18a18 18 0 110 36 18 18 0 010-36zm0 8a10 10 0 100 20 10 10 0 000-20z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const CompassIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path fillRule="evenodd" clipRule="evenodd" d="M48 8a40 40 0 100 80 40 40 0 000-80zm14 22L40 38l-8 22 22-8 8-22zM48 52a4 4 0 110-8 4 4 0 010 8z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const BackpackIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M36 8c-3 0-6 2-7 5l-1 3c-9 1-16 9-16 18v40c0 8 6 14 14 14h44c8 0 14-6 14-14V34c0-9-7-17-16-18l-1-3c-1-3-4-5-7-5H36zm0 8h24l1 2H35l1-2zm-4 30h32c2 0 4 2 4 4v8c0 2-2 4-4 4H40v-4c0-2-2-4-4-4s-4 2-4 4v4c-2 0-4-2-4-4v-8c0-2 2-4 4-4z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const HeartIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M48 84c-2 0-4-1-5-2C23 65 8 51 8 32c0-11 9-20 20-20 7 0 14 3 20 9 6-6 13-9 20-9 11 0 20 9 20 20 0 19-15 33-35 50-1 1-3 2-5 2z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const StarIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.goldTop} />
        <Stop offset="100%" stopColor={color ?? COLORS.goldBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M48 8c-2 0-3 1-4 3L34 33l-23 3c-2 0-4 1-4 3s0 4 1 5l17 17-4 24c0 2 0 4 2 5s4 1 5 0l20-11 20 11c2 1 4 1 5 0s2-3 2-5l-4-24 17-17c1-1 2-3 1-5s-2-3-4-3l-23-3-10-22c-1-2-2-3-4-3z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const MapIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M32 12L12 18c-3 1-4 3-4 6v54c0 3 3 5 6 4l18-6V12zm8 0v64l16 8V20l-16-8zm24 8v64l20-6c3-1 4-3 4-6V18c0-3-3-5-6-4l-18 6z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const SunsetIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M48 24c-15 0-27 11-29 25h58c-2-14-14-25-29-25zm-40 32a4 4 0 000 8h80a4 4 0 000-8H8zm14 16a4 4 0 000 8h52a4 4 0 000-8H22z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const FlagIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M20 8a4 4 0 014 4v76a4 4 0 11-8 0V12a4 4 0 014-4zm8 4l32 6c5 1 9 1 14 0l8-1c2 0 4 1 4 3v36c0 1-1 3-3 3l-9 2c-7 1-13 1-19-1l-27-5V12z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const TicketIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M16 20c-4 0-8 4-8 8v10a8 8 0 010 16v10c0 4 4 8 8 8h64c4 0 8-4 8-8V62a8 8 0 010-16V36c0-4-4-8-8-8H16zm20 14a4 4 0 014 4v20a4 4 0 11-8 0V38a4 4 0 014-4z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);


// ══════════════════════════════════════════════════════════════════════
//   Section 3 — Main screen FAB + Bell
// ══════════════════════════════════════════════════════════════════════

export const BellIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M48 10c-3 0-5 2-5 5v3c-13 2-22 13-22 27v12c0 3-1 6-3 8l-4 5c-3 4 0 10 5 10h58c5 0 8-6 5-10l-4-5c-2-2-3-5-3-8V45c0-14-9-25-22-27v-3c0-3-2-5-5-5zm-7 78c0 4 3 7 7 7s7-3 7-7H41z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

// 통계 — 막대그래프. 탭 바의 Analysis 아이콘과 같은 글리프를 공용 세트로 뺀 것
// (튜토리얼 말풍선 등 탭 바 밖에서도 같은 표현을 쓰기 위함).
export const ChartIcon: React.FC<IconProps> = ({ size = 24, color = '#FFFFFF' }) => {
  const bars = [
    { x: 1, h: 5 },   // 좌 → 우로 높낮이가 다른 5개 막대
    { x: 5, h: 9 },
    { x: 9, h: 7 },
    { x: 13, h: 13 },
    { x: 17, h: 9 },
  ];
  return (
    <Svg width={size} height={(size * 14) / 18} viewBox="0 0 20 14" fill="none">
      {bars.map((b) => (
        <Rect
          key={b.x}
          x={b.x}
          y={14 - b.h}
          width={1.5}
          height={b.h}
          rx={0.4}
          stroke={color}
          strokeWidth={1}
        />
      ))}
    </Svg>
  );
};

// 알림 끔 — BellIcon과 같은 종 실루엣에 사선 하나(음소거 관례).
// 사선은 종 색과 같은 색으로 긋고, 겹치는 자리에 배경색 테두리를 깔아 형태가 뭉개지지 않게 한다.
export const BellOffIcon: React.FC<IconProps & { slashBg?: string }> = ({
  size = 64, color, dot = false, dotColor = COLORS.dot, slashBg = '#12121A',
}) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M48 10c-3 0-5 2-5 5v3c-13 2-22 13-22 27v12c0 3-1 6-3 8l-4 5c-3 4 0 10 5 10h58c5 0 8-6 5-10l-4-5c-2-2-3-5-3-8V45c0-14-9-25-22-27v-3c0-3-2-5-5-5zm-7 78c0 4 3 7 7 7s7-3 7-7H41z" />
    </G>
    {/* 사선 — 바탕 테두리(굵게) 위에 본선(가늘게) */}
    <Path d="M18 16L78 82" stroke={slashBg} strokeWidth={14} strokeLinecap="round" />
    <Path d="M18 16L78 82" stroke={color ?? COLORS.purpleMid} strokeWidth={8} strokeLinecap="round" />
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

// 검색 — 라인형 돋보기 (MynaUI search-line)
export const SearchLineIcon: React.FC<IconProps> = ({ size = 24, color = '#A9A9A9' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={1.6} />
    <Path d="M20 20L16.65 16.65" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
  </Svg>
);

/**
 * 셰브론(꺾쇠) — 접기/펼치기 토글용. 기본은 아래 방향(닫힘).
 * `up`이면 위를 향한다. 텍스트 글리프(▲▼)와 달리 굵기·끝맺음이 일정하고
 * 폰트에 좌우되지 않아 다른 라인 아이콘들과 결이 맞는다.
 */
export const ChevronIcon: React.FC<IconProps & { up?: boolean }> = ({ size = 24, color = '#FFFFFF', up = false }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d={up ? 'M6 14.5L12 9L18 14.5' : 'M6 9.5L12 15L18 9.5'}
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

/**
 * 뒤로가기 화살표 — 헤더의 원형 뒤로 버튼용.
 * 원래 텍스트 글리프 '←'(U+2190)를 썼는데, 앱 폰트(Inter)에 이 글리프가 없어
 * 안드로이드가 시스템 폰트로 폴백한다. 그 폴백 글리프는 획이 머리카락처럼 가늘고
 * 기준선이 달라 40dp 원 안에서 좌·하로 치우쳐 iOS와 전혀 다르게 보였다.
 * (2026-08-18 에뮬레이터 6배 확대로 확인 — '‹'(U+2039)는 폰트에 있어 멀쩡하다)
 * ChevronIcon과 같은 이유·같은 규격(stroke 2, 라운드 캡)으로 SVG로 그린다.
 */
export const BackArrowIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
    <Path
      d="M17 10H3M9 16L3 10L9 4"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

/**
 * 뒤로가기 chevron — 사용자 시안(9×16, 흰 60%). 2026-09-17 블로그 기록 화면에서 시작해 앱의 모든
 * 뒤로가기 버튼(←·‹ 글자, BackArrowIcon)을 이걸로 통일했다. 박스·배경 없이 이 아이콘만 38 터치 영역 가운데에 둔다.
 * size는 높이 기준(폭은 9/16 비율). BackArrowIcon(가로 화살표)은 뒤로가기 외 용도가 남을 수 있어 삭제하지 않는다.
 */
export const BackChevronIcon: React.FC<IconProps & { opacity?: number }> = ({ size = 16, color = '#FFFFFF', opacity = 0.6 }) => (
  <Svg width={(size * 9) / 16} height={size} viewBox="0 0 9 16" fill="none">
    <Path d="M6.73106 0.331257C7.20072 -0.122001 7.94888 -0.108709 8.40214 0.360945C8.8554 0.830599 8.84211 1.57877 8.37245 2.03202L7.55176 1.18164L6.73106 0.331257ZM1.18201 7.54362L0.329289 8.36188C-0.10771 7.90648 -0.109742 7.18807 0.324673 6.7302L1.18201 7.54362ZM8.40448 13.3634C8.8564 13.8343 8.84097 14.5825 8.37002 15.0344C7.89907 15.4863 7.15095 15.4708 6.69903 14.9999L7.55176 14.1816L8.40448 13.3634ZM3.59614 4.99916L2.7388 4.18573L2.75672 4.16685L2.77545 4.14877L3.59614 4.99916ZM1.18201 7.54362L2.03474 6.72536L8.40448 13.3634L7.55176 14.1816L6.69903 14.9999L0.329289 8.36188L1.18201 7.54362ZM7.55176 1.18164L8.37245 2.03202L4.41684 5.84954L3.59614 4.99916L2.77545 4.14877L6.73106 0.331257L7.55176 1.18164ZM3.59614 4.99916L4.45348 5.81258L2.03935 8.35705L1.18201 7.54362L0.324673 6.7302L2.7388 4.18573L3.59614 4.99916Z" fill={color} fillOpacity={opacity} />
  </Svg>
);

// 알림(헤더) — 라인형 종 (Group.svg, 23×28 viewBox, stroke 2)
export const NotificationBellIcon: React.FC<IconProps> = ({ size = 24, color = '#FFFFFF', dot = false, dotColor = COLORS.dot }) => (
  <Svg width={(size * 23) / 28} height={size} viewBox="0 0 23 28" fill="none">
    <Path
      d="M11.9404 25.8135C11.7393 25.9575 11.4859 26.04 11.1973 26.04C10.9084 26.04 10.6544 25.9576 10.4531 25.8135H11.9404ZM11.1973 1C11.4467 1.00007 11.577 1.07903 11.6426 1.14453C11.7082 1.21011 11.7871 1.34088 11.7871 1.59082V3.40332L12.6357 3.5332C16.241 4.08796 18.7861 7.13055 18.7861 11.1348V14.9521C18.7862 16.083 19.1538 17.2901 19.9854 18.1533L21.2129 19.6865V19.6875C21.6728 20.3007 21.1892 21.2683 20.4229 21.2686H1.97168C1.20726 21.2686 0.723372 20.3059 1.17676 19.6924L2.41211 18.1484C3.24075 17.2856 3.60734 16.0811 3.60742 14.9521V11.1348C3.60742 7.13047 6.15343 4.08787 9.75879 3.5332L10.6064 3.40332V1.59082C10.6064 1.34088 10.6854 1.21011 10.751 1.14453C10.8166 1.07896 10.9474 1 11.1973 1Z"
      stroke={color}
      strokeWidth={2}
      strokeLinejoin="round"
    />
    {dot && <Circle cx={18} cy={6} r={3} fill={dotColor} />}
  </Svg>
);

export const FeedIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Rect x={10} y={14} width={76} height={20} rx={6} />
      <Rect x={10} y={40} width={76} height={20} rx={6} />
      <Rect x={10} y={66} width={76} height={20} rx={6} />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const MomentIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M48 8c-2 0-3 1-3 3-1 9-3 14-7 18s-9 6-18 7c-2 0-3 1-3 3s1 3 3 3c9 1 14 3 18 7s6 9 7 18c0 2 1 3 3 3s3-1 3-3c1-9 3-14 7-18s9-6 18-7c2 0 3-1 3-3s-1-3-3-3c-9-1-14-3-18-7s-6-9-7-18c0-2-1-3-3-3z" />
      <Path opacity={0.7} d="M78 60c-1 0-2 1-2 2-1 5-2 8-4 10s-5 3-10 4c-1 0-2 1-2 2s1 2 2 2c5 1 8 2 10 4s3 5 4 10c0 1 1 2 2 2s2-1 2-2c1-5 2-8 4-10s5-3 10-4c1 0 2-1 2-2s-1-2-2-2c-5-1-8-2-10-4s-3-5-4-10c0-1-1-2-2-2z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const StoryboardIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M14 18c-3 0-6 3-6 6v48c0 3 3 6 6 6h2v-6a4 4 0 014-4h4a4 4 0 014 4v6h40v-6a4 4 0 014-4h4a4 4 0 014 4v6h2c3 0 6-3 6-6V24c0-3-3-6-6-6h-2v6a4 4 0 01-4 4h-4a4 4 0 01-4-4v-6H28v6a4 4 0 01-4 4h-4a4 4 0 01-4-4v-6h-2zm22 16h24a4 4 0 014 4v20a4 4 0 01-4 4H36a4 4 0 01-4-4V38a4 4 0 014-4z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const AlbumIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Rect x={8} y={8} width={38} height={38} rx={6} />
      <Rect x={50} y={8} width={38} height={38} rx={6} />
      <Rect x={8} y={50} width={38} height={38} rx={6} />
      <Rect x={50} y={50} width={38} height={38} rx={6} />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);


// ══════════════════════════════════════════════════════════════════════
//   Section 4 — NewRecord (input UI)
// ══════════════════════════════════════════════════════════════════════

export const SearchIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path fillRule="evenodd" clipRule="evenodd" d="M40 8a32 32 0 1019.6 57.2l16.6 16.6a6 6 0 008.5-8.5L68.1 56.7A32 32 0 0040 8zm0 12a20 20 0 110 40 20 20 0 010-40z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const CalendarIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M28 8a4 4 0 014 4v4h32v-4a4 4 0 118 0v4h4c5 0 9 4 9 9v55c0 5-4 9-9 9H20c-5 0-9-4-9-9V25c0-5 4-9 9-9h4v-4a4 4 0 014-4zm-9 32v40c0 1 1 2 2 2h54c1 0 2-1 2-2V40H19zm14 8h8a3 3 0 010 6h-8a3 3 0 010-6zm18 0h8a3 3 0 010 6h-8a3 3 0 010-6zm-18 14h8a3 3 0 010 6h-8a3 3 0 010-6zm18 0h8a3 3 0 010 6h-8a3 3 0 010-6z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const GalleryIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M16 12c-4 0-8 4-8 8v56c0 4 4 8 8 8h64c4 0 8-4 8-8V20c0-4-4-8-8-8H16zm54 14a6 6 0 110 12 6 6 0 010-12zM18 70l16-22 12 16 14-10 18 16v6c0 1-1 2-2 2H20c-1 0-2-1-2-2v-6z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const LockClosedIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M48 8c-12 0-22 10-22 22v8h-2c-5 0-9 4-9 9v33c0 5 4 9 9 9h48c5 0 9-4 9-9V47c0-5-4-9-9-9h-2v-8c0-12-10-22-22-22zm0 10c7 0 12 5 12 12v8H36v-8c0-7 5-12 12-12zm0 38a8 8 0 014 15v7a4 4 0 11-8 0v-7a8 8 0 014-15z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const LockOpenIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M48 8c-12 0-22 10-22 22v8h-2c-5 0-9 4-9 9v33c0 5 4 9 9 9h48c5 0 9-4 9-9V47c0-5-4-9-9-9H36v-8c0-7 5-12 12-12 6 0 11 4 12 9a4 4 0 008-2c-2-10-11-17-20-17zm0 48a8 8 0 014 15v7a4 4 0 11-8 0v-7a8 8 0 014-15z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const CoinIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M48 8a40 40 0 100 80 40 40 0 000-80zm0 14a26 26 0 110 52 26 26 0 010-52zm0 6a4 4 0 00-4 4v2h-2a8 8 0 000 16h12a2 2 0 010 4H40a4 4 0 100 8h4v2a4 4 0 008 0v-2h2a8 8 0 000-16H42a2 2 0 010-4h14a4 4 0 000-8h-4v-2a4 4 0 00-4-4z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const TagIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M14 10c-3 0-6 3-6 6v32c0 2 1 3 2 4l36 36c2 2 6 2 8 0l32-32c2-2 2-6 0-8L50 12c-1-1-2-2-4-2H14zm14 14a8 8 0 110 16 8 8 0 010-16z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const TakeoffIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M14 78a4 4 0 010-8h68a4 4 0 010 8H14zm70-46l-6-6c-2-2-4-2-6-1l-16 9-26-12c-1-1-3 0-4 1l-3 3c-1 1-1 3 1 4l20 16-13 7-9-4c-1-1-2 0-3 1l-2 2c-1 1-1 2 0 3l9 8c1 2 3 2 4 1l54-30c1-1 1-2 0-2z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const TransferIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M10 60a4 4 0 014-4h64l-7-7a4 4 0 116-6l14 14a4 4 0 010 6L77 77a4 4 0 11-6-6l7-7H14a4 4 0 01-4-4zm76-30a4 4 0 01-4 4H18l7 7a4 4 0 11-6 6L5 33a4 4 0 010-6l14-14a4 4 0 116 6l-7 7h64a4 4 0 014 4z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);


// ══════════════════════════════════════════════════════════════════════
//   Section 4 — NewRecord (companions)
// ══════════════════════════════════════════════════════════════════════

export const SoloIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Circle cx={48} cy={30} r={14} />
      <Path d="M20 82c0-15 13-28 28-28s28 13 28 28a4 4 0 01-4 4H24a4 4 0 01-4-4z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const FriendIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Circle cx={32} cy={32} r={12} />
      <Circle cx={64} cy={32} r={12} />
      <Path d="M8 80c0-13 11-24 24-24s24 11 24 24a4 4 0 01-4 4H12a4 4 0 01-4-4z" />
      <Path opacity={0.75} d="M48 80c0-7-3-13-7-17 5-5 14-7 23-7 13 0 24 11 24 24a4 4 0 01-4 4H52c-2 0-4-1-4-4z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const CoupleIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Circle cx={32} cy={28} r={12} />
      <Circle cx={64} cy={28} r={12} />
      <Path opacity={0.9} d="M48 86c-3 0-5-1-7-3-13-11-23-21-23-32 0-7 5-13 12-13 6 0 9 3 11 7l7 7 7-7c2-4 5-7 11-7 7 0 12 6 12 13 0 11-10 21-23 32-2 2-4 3-7 3z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const FamilyIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Circle cx={26} cy={26} r={10} />
      <Circle cx={70} cy={26} r={10} />
      <Circle cx={48} cy={48} r={8} />
      <Path d="M8 72c0-10 8-18 18-18s18 8 18 18v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-8z" />
      <Path d="M52 72c0-10 8-18 18-18s18 8 18 18v8a4 4 0 01-4 4H56a4 4 0 01-4-4v-8z" />
      <Path d="M36 78c0-7 5-12 12-12s12 5 12 12v6a4 4 0 01-4 4H40a4 4 0 01-4-4v-6z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const ParentIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Circle cx={34} cy={26} r={12} />
      <Circle cx={66} cy={26} r={12} />
      <Path d="M10 76c0-12 11-22 24-22s24 10 24 22v8a4 4 0 01-4 4H14a4 4 0 01-4-4v-8z" />
      <Path opacity={0.75} d="M50 84v-8c0-7-3-13-7-18 6-3 14-4 23-4 13 0 22 9 22 21v9a4 4 0 01-4 4H54c-3 0-4-1-4-4z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const SiblingIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Circle cx={32} cy={34} r={11} />
      <Circle cx={64} cy={26} r={9} />
      <Path d="M10 80c0-12 10-22 22-22s22 10 22 22v4a4 4 0 01-4 4H14a4 4 0 01-4-4v-4z" />
      <Path opacity={0.75} d="M50 72c0-10 6-18 14-18s14 8 14 18v12a4 4 0 01-4 4H54c-3 0-4-1-4-4v-12z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);


// ══════════════════════════════════════════════════════════════════════
//   Section 4 — NewRecord (weather)
// ══════════════════════════════════════════════════════════════════════

export const SunIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.goldTop} />
        <Stop offset="100%" stopColor={color ?? COLORS.goldBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Circle cx={48} cy={48} r={18} />
      <Path d="M48 8a4 4 0 014 4v8a4 4 0 01-8 0v-8a4 4 0 014-4zm0 64a4 4 0 014 4v8a4 4 0 01-8 0v-8a4 4 0 014-4zM8 48a4 4 0 014-4h8a4 4 0 010 8h-8a4 4 0 01-4-4zm64 0a4 4 0 014-4h8a4 4 0 010 8h-8a4 4 0 01-4-4zM19.8 19.8a4 4 0 015.6 0l5.7 5.7a4 4 0 11-5.6 5.6l-5.7-5.7a4 4 0 010-5.6zm45.2 45.2a4 4 0 015.6 0l5.7 5.7a4 4 0 11-5.6 5.6l-5.7-5.7a4 4 0 010-5.6zM76.2 19.8a4 4 0 010 5.6l-5.7 5.7a4 4 0 11-5.6-5.6l5.7-5.7a4 4 0 015.6 0zM31 65a4 4 0 010 5.6l-5.7 5.7a4 4 0 11-5.6-5.6l5.7-5.7a4 4 0 015.6 0z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const CloudyIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M28 72c-11 0-20-9-20-20s9-20 20-20c2 0 4 0 6 1 4-9 13-15 23-15 14 0 25 11 25 25 0 1 0 3-1 4 5 3 9 9 9 16 0 10-8 18-18 18H28h0z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const RainIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M28 58c-11 0-20-9-20-20s9-20 20-20c2 0 4 0 6 1 4-9 13-15 23-15 14 0 25 11 25 25 0 1 0 3-1 4 5 3 9 9 9 16 0 10-8 18-18 18H28h0z" />
      <Path d="M26 70a3 3 0 016 0v8a3 3 0 01-6 0v-8zm14 6a3 3 0 016 0v8a3 3 0 01-6 0v-8zm14-6a3 3 0 016 0v8a3 3 0 01-6 0v-8zm14 6a3 3 0 016 0v8a3 3 0 01-6 0v-8z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const SnowIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M28 58c-11 0-20-9-20-20s9-20 20-20c2 0 4 0 6 1 4-9 13-15 23-15 14 0 25 11 25 25 0 1 0 3-1 4 5 3 9 9 9 16 0 10-8 18-18 18H28h0z" />
      <Circle cx={28} cy={78} r={3} />
      <Circle cx={48} cy={84} r={3} />
      <Circle cx={68} cy={78} r={3} />
      <Circle cx={38} cy={86} r={2} />
      <Circle cx={58} cy={86} r={2} />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const WindIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M10 28a4 4 0 014-4h44a10 10 0 100-20 10 10 0 00-9 6 4 4 0 11-7-3 18 18 0 1116 26H14a4 4 0 01-4-4zm0 22a4 4 0 014-4h62a14 14 0 110 28 14 14 0 01-13-9 4 4 0 117 -3 6 6 0 106-9H14a4 4 0 01-4-4zm0 22a4 4 0 014-4h32a10 10 0 110 20 10 10 0 01-9-6 4 4 0 117-3 2 2 0 102-3H14a4 4 0 01-4-4z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const PartlyCloudyIcon: React.FC<IconProps> = ({ size = 64, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-purple" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={COLORS.purpleTop} />
        <Stop offset="55%" stopColor={COLORS.purpleMid} />
        <Stop offset="100%" stopColor={COLORS.purpleBot} />
      </LinearGradient>
      <LinearGradient id="eorth-gold" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={COLORS.goldTop} />
        <Stop offset="100%" stopColor={COLORS.goldBot} />
      </LinearGradient>
    </Defs>
      <Circle cx={30} cy={28} r={11} fill="url(#eorth-gold)" />
      <Path strokeWidth={5} strokeLinecap="round" d="M30 8v6 M30 42v6 M10 28h6 M44 28h6 M16 14l4 4 M40 38l4 4 M44 14l-4 4 M20 38l-4 4" fill="none" stroke="url(#eorth-gold)" />
      <Path d="M34 84c-11 0-20-9-20-20s9-20 20-20c2 0 4 0 6 1 4-9 13-15 23-15 14 0 25 11 25 25 0 1 0 3-1 4 5 3 9 9 9 16 0 10-8 18-18 18H34h0z" fill="url(#eorth-purple)" />
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);


// ══════════════════════════════════════════════════════════════════════
//   Section 5 — Settings
// ══════════════════════════════════════════════════════════════════════

export const PersonIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Circle cx={48} cy={32} r={16} />
      <Path d="M16 82c0-15 14-28 32-28s32 13 32 28a4 4 0 01-4 4H20a4 4 0 01-4-4z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const LockIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M48 8c-12 0-22 10-22 22v10h-2c-5 0-9 4-9 9v31c0 5 4 9 9 9h48c5 0 9-4 9-9V49c0-5-4-9-9-9h-2V30c0-12-10-22-22-22zm0 10c7 0 12 5 12 12v10H36V30c0-7 5-12 12-12z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

// 2026-09-20 시안 SVG(12×12 원+사선 아웃라인, stroke 1) — stroke 기반이라 color는 <G stroke>로
export const BlockIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 12 12" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G stroke={color ?? "url(#eorth-grad)"} strokeWidth={1} fill="none">
      <Path d="M6 11C8.76142 11 11 8.76142 11 6C11 3.23858 8.76142 1 6 1C3.23858 1 1 3.23858 1 6C1 8.76142 3.23858 11 6 11Z" />
      <Path d="M2.5 9.5L9.5 2.5" />
    </G>
    {dot && <Circle cx={9.5} cy={2.5} r={1.2} fill={dotColor} />}
  </Svg>
);
// 경고 삼각형(느낌표) — ⋯ 메뉴의 '신고하기'용. 확성기(MegaphoneIcon) 대신 쓴다.
// 2026-09-20 시안 SVG(16×16 경고 삼각형+느낌표, fill) — 신고하기 아이콘. 시안 원색은 #FF0138이고 color prop으로 받는다
export const WarningIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M7.74002 3.95427C7.85527 3.75314 8.14537 3.75314 8.26061 3.95428L13.2164 12.6036C13.331 12.8036 13.1866 13.0527 12.9561 13.0527H3.04404C2.81353 13.0527 2.66914 12.8036 2.78374 12.6036L7.74002 3.95427ZM8.25995 1.78243C8.1444 1.58285 7.85625 1.58285 7.7407 1.78243L0.927699 13.5503C0.811909 13.7503 0.956227 14.0007 1.18733 14.0007H14.8133C15.0444 14.0007 15.1887 13.7503 15.073 13.5503L8.25995 1.78243ZM8.4211 10.9673C8.4211 10.8016 8.28679 10.6673 8.1211 10.6673H7.879C7.71331 10.6673 7.579 10.8016 7.579 10.9673V11.7007C7.579 11.8663 7.71331 12.0007 7.879 12.0007H8.1211C8.28679 12.0007 8.4211 11.8663 8.4211 11.7007V10.9673ZM8.4211 6.96732C8.4211 6.80163 8.28679 6.66732 8.1211 6.66732H7.879C7.71331 6.66732 7.579 6.80163 7.579 6.96732V9.03398C7.579 9.19967 7.71331 9.33398 7.879 9.33398H8.1211C8.28679 9.33398 8.4211 9.19967 8.4211 9.03398V6.96732Z" />
    </G>
    {dot && <Circle cx={13} cy={3} r={1.5} fill={dotColor} />}
  </Svg>
);

export const ArchiveIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M10 16c0-4 4-8 8-8h60c4 0 8 4 8 8v6c0 4-3 7-7 8v44c0 6-4 10-10 10H29c-6 0-10-4-10-10V30c-5-1-9-4-9-8v-6zm32 28a4 4 0 000 8h12a4 4 0 000-8H42z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const EyeIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M48 22C26 22 9 39 4 48c5 9 22 26 44 26s39-17 44-26C87 39 70 22 48 22zm0 12a14 14 0 110 28 14 14 0 010-28z" />
      <Circle cx={48} cy={48} r={6} fill="#0B0518" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const GlobeSkinIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Circle cx={42} cy={48} r={32} />
      <Path opacity={0.95} d="M76 14c-1 0-2 1-2 2-1 5-2 7-4 9s-4 3-9 4c-1 0-2 1-2 2s1 2 2 2c5 1 7 2 9 4s3 4 4 9c0 1 1 2 2 2s2-1 2-2c1-5 2-7 4-9s4-3 9-4c1 0 2-1 2-2s-1-2-2-2c-5-1-7-2-9-4s-3-4-4-9c0-1-1-2-2-2z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const LanguageIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M26 10C16 10 8 18 8 28v40c0 10 8 18 18 18h2v-12a3 3 0 016 0v12h30c10 0 18-8 18-18V28c0-10-8-18-18-18H26zm6 16h28a3 3 0 010 6H50v3c0 8-4 14-9 18 3 2 6 3 9 4a3 3 0 11-2 6c-5-1-9-3-13-6-4 3-8 5-13 6a3 3 0 01-2-6c3-1 6-2 9-4-5-4-9-10-9-18a3 3 0 116 0c0 6 4 11 9 14 5-3 9-8 9-14H32a3 3 0 010-6z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const MoonIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M50 10C32 10 18 24 18 42c0 20 16 36 36 36 13 0 25-7 32-19a3 3 0 00-3-5c-19 0-34-15-34-34 0-3 0-6 1-9a3 3 0 00-3-3z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const QuestionIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path fillRule="evenodd" clipRule="evenodd" d="M48 8a40 40 0 100 80 40 40 0 000-80zm-1 16c-7 0-13 5-14 12a4 4 0 008 1c0-3 3-5 6-5s6 2 6 5c0 2-1 4-4 5-3 1-5 3-5 6v3a4 4 0 008 0v-1c5-2 9-7 9-13 0-7-7-13-14-13zm1 38a5 5 0 100 10 5 5 0 000-10z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const ChatIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M16 10c-4 0-8 4-8 8v44c0 4 4 8 8 8h10v12c0 2 3 4 5 2l18-14h31c4 0 8-4 8-8V18c0-4-4-8-8-8H16z" />
      <Rect x={22} y={28} width={52} height={6} rx={3} fill="#0B0518" />
      <Rect x={22} y={42} width={36} height={6} rx={3} fill="#0B0518" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const DocumentIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M20 12c-4 0-8 4-8 8v56c0 4 4 8 8 8h56c4 0 8-4 8-8V36L60 12H20zm38 4l24 22H60c-1 0-2-1-2-2V16z" />
      <Rect x={22} y={46} width={42} height={4} rx={2} fill="#0B0518" />
      <Rect x={22} y={56} width={52} height={4} rx={2} fill="#0B0518" />
      <Rect x={22} y={66} width={32} height={4} rx={2} fill="#0B0518" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const InfoIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path fillRule="evenodd" clipRule="evenodd" d="M48 8a40 40 0 100 80 40 40 0 000-80zm0 14a5 5 0 110 10 5 5 0 010-10zm-4 18a4 4 0 008 0v-1h-8v1zm0 0h8v28a4 4 0 11-8 0V40z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const ExitIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.redTop} />
        <Stop offset="100%" stopColor={color ?? COLORS.redBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M20 8c-6 0-12 6-12 12v56c0 6 6 12 12 12h28c6 0 12-6 12-12v-8a4 4 0 10-8 0v8c0 2-2 4-4 4H20c-2 0-4-2-4-4V20c0-2 2-4 4-4h28c2 0 4 2 4 4v8a4 4 0 008 0v-8c0-6-6-12-12-12H20zm54 30c-2-2-4-2-6 0s-2 4 0 6l5 5H42a4 4 0 100 8h31l-5 5c-2 2-2 4 0 6s4 2 6 0l12-12c2-2 2-4 0-6L74 38z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);


// ══════════════════════════════════════════════════════════════════════
//   Section 6 — Profile
// ══════════════════════════════════════════════════════════════════════

export const GearIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path fillRule="evenodd" clipRule="evenodd" d="M42 8c-2 0-4 1-4 3l-2 7c-3 1-6 3-9 5l-7-3c-2-1-4 0-5 1l-7 12c-1 2 0 4 1 5l5 5v9l-5 5c-1 1-2 3-1 5l7 12c1 1 3 2 5 1l7-3c3 2 6 4 9 5l2 7c0 2 2 3 4 3h12c2 0 4-1 4-3l2-7c3-1 6-3 9-5l7 3c2 1 4 0 5-1l7-12c1-2 0-4-1-5l-5-5v-9l5-5c1-1 2-3 1-5l-7-12c-1-1-3-2-5-1l-7 3c-3-2-6-4-9-5l-2-7c0-2-2-3-4-3H42zm6 28a12 12 0 100 24 12 12 0 000-24z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);


// ══════════════════════════════════════════════════════════════════════
//   Section 7 — Social
// ══════════════════════════════════════════════════════════════════════

// 댓글 말풍선 — 앱 전체 단일 출처(2026-09-20 사용자 지정 시안 SVG, 21×20 아웃라인·꼬리 왼쪽 아래).
// 다른 화면에서 로컬로 다시 그리지 말고 이걸 쓴다. size는 높이 기준(폭은 21/20 비율).
export const CommentIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size * (21 / 20)} height={size} viewBox="0 0 21 20" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      fill={color ?? "url(#eorth-grad)"}
      d="M1.63714 13.5531C-0.999805 7.08153 3.76148 0 10.7492 0H11.1257C13.6355 0.00062193 16.0423 0.997911 17.817 2.77261C19.5917 4.5473 20.589 6.95413 20.5896 9.46393C20.5899 10.8476 20.3176 12.2178 19.7883 13.4963C19.2589 14.7747 18.4828 15.9363 17.5044 16.9147C16.526 17.8932 15.3643 18.6692 14.0859 19.1986C12.8075 19.728 11.4373 20.0003 10.0536 20H0.880546C0.698283 20.0002 0.520469 19.9437 0.371674 19.8384C0.22288 19.7332 0.110452 19.5843 0.049926 19.4124C-0.0106002 19.2405 -0.0162363 19.054 0.0337966 18.8787C0.0838295 18.7035 0.187061 18.5481 0.329227 18.434L2.64125 16.5771C2.69068 16.5375 2.72597 16.483 2.74183 16.4217C2.75768 16.3604 2.75326 16.2955 2.72923 16.237L1.63714 13.5531ZM10.7492 1.75953C5.00958 1.75953 1.0999 7.57419 3.2653 12.8892L4.35855 15.5742C4.52512 15.9835 4.55516 16.4356 4.44421 16.8634C4.33326 17.2911 4.08724 17.6717 3.74272 17.9484L3.38025 18.2405H10.0536C11.2062 18.2408 12.3476 18.014 13.4126 17.573C14.4775 17.1321 15.4452 16.4856 16.2602 15.6706C17.0752 14.8555 17.7217 13.8879 18.1627 12.8229C18.6036 11.758 18.8304 10.6166 18.8301 9.46393C18.8295 7.42079 18.0176 5.4615 16.5729 4.01678C15.1281 2.57206 13.1689 1.76015 11.1257 1.75953H10.7492Z"
    />
    {dot && <Circle cx={17} cy={4} r={2.2} fill={dotColor} />}
  </Svg>
);

// ══════════════════════════════════════════════════════════════════════
//   Section 8 — Missing UI icons (emoji → SVG)
// ══════════════════════════════════════════════════════════════════════

// 답장 — 뒤로 향하는 화살표(리플라이). DM 메시지 롱프레스 메뉴 등.
export const ReplyIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Path
      d="M40 26 L16 50 L40 74"
      stroke={color ?? COLORS.purpleMid}
      strokeWidth={8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M16 50 H54 C69 50 80 61 80 76 V80"
      stroke={color ?? COLORS.purpleMid}
      strokeWidth={8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {dot && <Circle cx={82} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

// 복사 — 겹친 두 페이지(카피). DM 메시지 롱프레스 메뉴 등.
export const CopyIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Rect x={34} y={34} width={46} height={50} rx={9} stroke={color ?? COLORS.purpleMid} strokeWidth={8} fill="none" />
    <Path
      d="M22 62 V24 C22 19 26 15 31 15 H60"
      stroke={color ?? COLORS.purpleMid}
      strokeWidth={8}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    {dot && <Circle cx={82} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

// 추가 — 끝이 둥근 굵은 십자(＋). "새로 만들기" 액션용 (기록 추가 등).
export const PlusIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M48 12a6 6 0 016 6v24h24a6 6 0 010 12H54v24a6 6 0 01-12 0V54H18a6 6 0 010-12h24V18a6 6 0 016-6z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const PencilIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M72 8c-2 0-4 1-6 3L14 63c-1 1-2 3-2 4l-4 18c0 2 0 3 2 4 1 1 2 1 3 1h1l18-4c2 0 3-1 4-2l52-52c3-3 3-8 0-11L76 11c-2-2-4-3-6-3h2zm0 10l9 9-6 6-9-9 6-6zM60 33l9 9-36 36-12 3 3-12 36-36z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const TrashIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.redTop} />
        <Stop offset="100%" stopColor={color ?? COLORS.redBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M36 8c-3 0-6 3-6 6v4H14a4 4 0 100 8h4v50c0 7 5 12 12 12h36c7 0 12-5 12-12V26h4a4 4 0 100-8H66v-4c0-3-3-6-6-6H36zm2 10h20v2H38v-2zM26 26h44v50c0 2-2 4-4 4H30c-2 0-4-2-4-4V26zm12 10a4 4 0 014 4v28a4 4 0 11-8 0V40a4 4 0 014-4zm20 0a4 4 0 014 4v28a4 4 0 11-8 0V40a4 4 0 014-4z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const HomeIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M48 8c-1 0-3 1-4 2L6 42c-2 2-2 5 0 7s5 2 7 0l3-2v33c0 4 4 8 8 8h16V62c0-2 2-4 4-4h8c2 0 4 2 4 4v26h16c4 0 8-4 8-8V47l3 2c2 2 5 2 7 0s2-5 0-7L52 10c-1-1-3-2-4-2z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

// 2026-09-20 시안 SVG(13×13 체인 아웃라인, stroke 1.0833) — 이 아이콘만 fill이 아니라 stroke라 color는 stroke로 넘긴다
export const LinkIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 13 13" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G stroke={color ?? "url(#eorth-grad)"} strokeWidth={1.08333} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <Path d="M7.3365 5.66289C6.89267 5.21966 6.29107 4.9707 5.66383 4.9707C5.03658 4.9707 4.43499 5.21966 3.99116 5.66289L2.31795 7.33556C1.87426 7.77925 1.625 8.38102 1.625 9.0085C1.625 9.63597 1.87426 10.2377 2.31795 10.6814C2.76164 11.1251 3.36342 11.3744 3.99089 11.3744C4.61836 11.3744 5.22014 11.1251 5.66383 10.6814L6.50016 9.8451" />
      <Path d="M5.66406 7.3365C6.10789 7.77973 6.70949 8.02868 7.33673 8.02868C7.96397 8.02868 8.56557 7.77973 9.0094 7.3365L10.6826 5.66383C11.1263 5.22014 11.3756 4.61836 11.3756 3.99089C11.3756 3.36342 11.1263 2.76164 10.6826 2.31795C10.2389 1.87426 9.63714 1.625 9.00967 1.625C8.38219 1.625 7.78042 1.87426 7.33673 2.31795L6.5004 3.15429" />
    </G>
    {dot && <Circle cx={10.5} cy={2.5} r={1.3} fill={dotColor} />}
  </Svg>
);

export const PaperclipIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill="none" stroke={color ?? "url(#eorth-grad)"} strokeWidth={7} strokeLinecap="round">
      <Path d="M68 48L40 76c-7 7-18 7-25 0s-7-18 0-25l32-32c5-5 12-5 17 0s5 12 0 17L34 66c-2 2-6 2-8 0s-2-6 0-8l28-28" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const PaletteIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path fillRule="evenodd" clipRule="evenodd" d="M48 8C25.9 8 8 25.9 8 48s17.9 40 40 40c4 0 7-3 7-7 0-2-1-3-2-5-1-1-2-3-2-5 0-4 3-7 7-7h8c13 0 24-11 24-24C88 23 70 8 48 8zM24 44a6 6 0 110 12 6 6 0 010-12zm10-16a6 6 0 110 12 6 6 0 010-12zm28 0a6 6 0 110 12 6 6 0 010-12zm12 16a6 6 0 110 12 6 6 0 010-12z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const MegaphoneIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M76 10c-2 0-4 1-5 3L52 36H20c-6 0-10 4-10 10v4c0 6 4 10 10 10h4l6 24c1 3 3 4 6 4h8c3 0 6-3 5-6l-5-22h8l19 23c1 2 3 3 5 3 4 0 8-4 8-8V18c0-4-4-8-8-8z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const SparkleIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.goldTop} />
        <Stop offset="100%" stopColor={color ?? COLORS.goldBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M48 4c-2 0-3 1-4 3-3 14-6 22-12 28s-14 9-28 12c-2 1-3 2-3 4s1 3 3 4c14 3 22 6 28 12s9 14 12 28c1 2 2 3 4 3s3-1 4-3c3-14 6-22 12-28s14-9 28-12c2-1 3-2 3-4s-1-3-3-4c-14-3-22-6-28-12s-9-14-12-28c-1-2-2-3-4-3z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const EmailIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M16 18c-4 0-8 4-8 8v44c0 4 4 8 8 8h64c4 0 8-4 8-8V26c0-4-4-8-8-8H16zm2 10l28 20c1 1 3 1 4 0l28-20c2 0 2 1 2 2L50 52c-1 1-3 1-4 0L16 30v-2z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const TargetIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path fillRule="evenodd" clipRule="evenodd" d="M48 8a40 40 0 100 80 40 40 0 000-80zm0 12a28 28 0 110 56 28 28 0 010-56zm0 10a18 18 0 100 36 18 18 0 000-36zm0 10a8 8 0 110 16 8 8 0 010-16z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const LandscapeIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Circle cx={28} cy={28} r={10} />
      <Path d="M6 74l22-32c2-2 5-2 7 0l13 18 10-14c2-2 5-2 7 0l25 28c2 3 0 6-3 6H9c-3 0-5-3-3-6z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const StickerIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path fillRule="evenodd" clipRule="evenodd" d="M48 8a40 40 0 100 80 40 40 0 000-80zM32 38a6 6 0 110 12 6 6 0 010-12zm32 0a6 6 0 110 12 6 6 0 010-12zM30 60c0-2 2-4 4-4h28c2 0 4 2 4 4 0 8-8 16-18 16S30 68 30 60z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

// 공유 종이비행기 — 앱 전체 단일 출처(2026-09-20 사용자 지정 시안 SVG, 22×21 아웃라인).
// 시안은 "실루엣 path를 mask로 삼아 안쪽 스트로크만 남기는" 구조라 그대로 옮겼다(mask id는 인스턴스별 고유).
// 다른 화면에서 로컬로 다시 그리지 말고 이걸 쓴다. size는 폭 기준(높이는 21/22 비율).
const SHARE_PLANE_SILHOUETTE = 'M21.5846 0.279171C21.2093 -0.0437219 20.6199 -0.089922 20.0104 0.15834C19.3695 0.419295 1.86576 8.03673 1.15324 8.34795C1.02365 8.39364 -0.108174 8.82214 0.00841053 9.7766C0.112486 10.6371 1.02215 10.9935 1.13323 11.0347L5.58295 12.5806C5.87817 13.5777 6.96646 17.2565 7.20713 18.0424C7.35724 18.5323 7.60192 19.176 8.03073 19.3086C8.407 19.4558 8.78127 19.3212 9.02345 19.1283L11.7439 16.568L16.1356 20.0432L16.2402 20.1066C16.5384 20.2407 16.8241 20.3077 17.0968 20.3077C17.3075 20.3077 17.5096 20.2676 17.7027 20.1874C18.3607 19.9132 18.6239 19.2771 18.6514 19.205L21.9318 1.9043C22.132 0.980297 21.8538 0.510172 21.5846 0.279171Z';
const SHARE_PLANE_STROKE = 'M9.5 13.2695L8.95201 12.7407C8.86897 12.8268 8.80735 12.9312 8.77217 13.0455L9.5 13.2695ZM8.03073 18.0424L7.31234 18.2951C7.42142 18.6052 7.71716 18.8103 8.04581 18.8038C8.37447 18.7972 8.66185 18.5806 8.75856 18.2664L8.03073 18.0424ZM18.2507 5.29835C18.5428 4.99571 18.5342 4.51361 18.2316 4.22155C17.9289 3.92949 17.4468 3.93807 17.1548 4.24071L17.7027 4.76953L18.2507 5.29835ZM9.5 13.2695L8.77217 13.0455L7.3029 17.8183L8.03073 18.0424L8.75856 18.2664L10.2278 13.4936L9.5 13.2695ZM8.03073 18.0424L8.74912 17.7897L6.71839 12.0168L6 12.2695L5.28161 12.5222L7.31234 18.2951L8.03073 18.0424ZM17.7027 4.76953L17.1548 4.24071L8.95201 12.7407L9.5 13.2695L10.048 13.7984L18.2507 5.29835L17.7027 4.76953ZM21.5846 0.279171L20.5912 1.4337L20.5927 1.43502L21.5846 0.279171ZM20.0104 0.15834L20.5847 1.56899L20.585 1.56887L20.0104 0.15834ZM1.15324 8.34795L1.65969 9.78436C1.69457 9.77206 1.72899 9.7585 1.76288 9.74369L1.15324 8.34795ZM0.00841053 9.7766L1.52047 9.59373L1.52025 9.59193L0.00841053 9.7766ZM1.13323 11.0347L0.604441 12.463C0.614053 12.4666 0.623702 12.47 0.633384 12.4734L1.13323 11.0347ZM5.58295 12.5806L7.04337 12.1482C6.90403 11.6776 6.54643 11.3029 6.08279 11.1419L5.58295 12.5806ZM7.20713 18.0424L5.75081 18.4883L5.75087 18.4885L7.20713 18.0424ZM8.03073 19.3086L8.58572 17.8902C8.55107 17.8766 8.51594 17.8644 8.4804 17.8534L8.03073 19.3086ZM9.02345 19.1283L9.97246 20.3196C10.0052 20.2935 10.0368 20.2661 10.0673 20.2375L9.02345 19.1283ZM11.7439 16.568L12.689 15.3736C12.0967 14.9049 11.2502 14.9412 10.7001 15.4589L11.7439 16.568ZM16.1356 20.0432L15.1905 21.2376C15.2399 21.2766 15.2916 21.3126 15.3454 21.3453L16.1356 20.0432ZM16.2402 20.1066L15.45 21.4087C15.5034 21.4411 15.5588 21.4702 15.6158 21.4959L16.2402 20.1066ZM17.7027 20.1874L18.2869 21.594L18.2885 21.5933L17.7027 20.1874ZM18.6514 19.205L20.0744 19.7482C20.1065 19.664 20.1311 19.5772 20.1478 19.4887L18.6514 19.205ZM21.9318 1.9043L20.4433 1.58187C20.4405 1.59473 20.4379 1.60763 20.4354 1.62056L21.9318 1.9043ZM21.5846 0.279171L22.5779 -0.875361C21.6272 -1.69336 20.3749 -1.63475 19.4358 -1.25219L20.0104 0.15834L20.585 1.56887C20.7053 1.51987 20.7682 1.52314 20.7681 1.52313C20.7665 1.52301 20.7461 1.5212 20.7124 1.50809C20.6779 1.4946 20.6346 1.47108 20.5912 1.4337L21.5846 0.279171ZM20.0104 0.15834L19.4361 -1.25231C18.7717 -0.981805 1.23891 6.6485 0.543601 6.9522L1.15324 8.34795L1.76288 9.74369C2.49261 9.42496 19.9672 1.82039 20.5847 1.56899L20.0104 0.15834ZM1.15324 8.34795L0.64679 6.91154C0.518198 6.95688 0.0106489 7.14574 -0.474231 7.54128C-0.968131 7.94417 -1.65067 8.75584 -1.50343 9.96127L0.00841053 9.7766L1.52025 9.59193C1.52484 9.62947 1.52458 9.67875 1.51393 9.73357C1.50347 9.7874 1.48591 9.83171 1.46902 9.86395C1.43854 9.92213 1.41674 9.92984 1.45125 9.90169C1.48349 9.8754 1.53176 9.84496 1.5867 9.81738C1.63883 9.7912 1.67228 9.77992 1.65969 9.78436L1.15324 8.34795ZM0.00841053 9.7766L-1.50365 9.95947C-1.38659 10.9273 -0.816235 11.5587 -0.37857 11.906C0.0560873 12.2509 0.480837 12.4172 0.604441 12.463L1.13323 11.0347L1.66201 9.60633C1.67462 9.61099 1.65554 9.60461 1.62091 9.58684C1.58421 9.56799 1.54599 9.54448 1.51495 9.51985C1.48328 9.49471 1.47879 9.48408 1.48624 9.49543C1.49081 9.50241 1.49845 9.51565 1.5057 9.53472C1.51318 9.55438 1.51819 9.57489 1.52047 9.59373L0.00841053 9.7766ZM1.13323 11.0347L0.633384 12.4734L5.08311 14.0193L5.58295 12.5806L6.08279 11.1419L1.63307 9.59594L1.13323 11.0347ZM5.58295 12.5806L4.12254 13.013C4.41577 14.0034 5.50739 17.6935 5.75081 18.4883L7.20713 18.0424L8.66345 17.5964C8.42552 16.8194 7.34057 13.152 7.04337 12.1482L5.58295 12.5806ZM7.20713 18.0424L5.75087 18.4885C5.83332 18.7576 5.96977 19.1679 6.18514 19.553C6.37456 19.8916 6.79321 20.5203 7.58106 20.7637L8.03073 19.3086L8.4804 17.8534C8.6714 17.9124 8.7837 18.0107 8.8258 18.0533C8.86543 18.0935 8.8673 18.1082 8.84369 18.066C8.82211 18.0274 8.79322 17.9664 8.75953 17.8792C8.72647 17.7937 8.69484 17.6988 8.66339 17.5962L7.20713 18.0424ZM8.03073 19.3086L7.47574 20.7269C8.51364 21.133 9.45468 20.7321 9.97246 20.3196L9.02345 19.1283L8.07444 17.937C8.10886 17.9096 8.15832 17.8796 8.23561 17.8618C8.32495 17.8412 8.45365 17.8385 8.58572 17.8902L8.03073 19.3086ZM9.02345 19.1283L10.0673 20.2375L12.7878 17.6772L11.7439 16.568L10.7001 15.4589L7.97962 18.0192L9.02345 19.1283ZM11.7439 16.568L10.7988 17.7624L15.1905 21.2376L16.1356 20.0432L17.0807 18.8488L12.689 15.3736L11.7439 16.568ZM16.1356 20.0432L15.3454 21.3453L15.45 21.4087L16.2402 20.1066L17.0304 18.8046L16.9258 18.7411L16.1356 20.0432ZM16.2402 20.1066L15.6158 21.4959C16.0722 21.701 16.5706 21.8308 17.0968 21.8308V20.3077V18.7846C17.0776 18.7846 17.0046 18.7804 16.8646 18.7174L16.2402 20.1066ZM17.0968 20.3077V21.8308C17.5062 21.8308 17.907 21.7517 18.2869 21.594L17.7027 20.1874L17.1186 18.7808C17.1134 18.7829 17.1108 18.7835 17.1098 18.7837C17.1086 18.7839 17.1049 18.7846 17.0968 18.7846V20.3077ZM17.7027 20.1874L18.2885 21.5933C19.5531 21.0664 20.0131 19.9085 20.0744 19.7482L18.6514 19.205L17.2285 18.6618C17.2409 18.6293 17.2435 18.6273 17.2352 18.6432C17.2272 18.6584 17.2133 18.6822 17.1943 18.7075C17.1523 18.7636 17.1229 18.779 17.117 18.7815L17.7027 20.1874ZM18.6514 19.205L20.1478 19.4887L23.4282 2.18803L21.9318 1.9043L20.4354 1.62056L17.155 18.9212L18.6514 19.205ZM21.9318 1.9043L23.4204 2.22673C23.7214 0.837071 23.3294 -0.230555 22.5764 -0.876679L21.5846 0.279171L20.5927 1.43502C20.564 1.41042 20.5368 1.38072 20.5142 1.34687C20.491 1.31215 20.4794 1.28315 20.4747 1.26752C20.4645 1.23304 20.5012 1.31426 20.4433 1.58187L21.9318 1.9043Z';
export const ShareIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => {
  // mask id는 문서 전역이라 같은 화면에 여러 개 있을 때 서로 가리키지 않도록 인스턴스별로 고유하게(콜론은 id 불가)
  const maskId = `sharePlane${React.useId().replace(/:/g, '')}`;
  return (
    <Svg width={size} height={size * (21 / 22)} viewBox="0 0 22 21" fill="none">
      <Defs>
        <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
          <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
          <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
        </LinearGradient>
        <Mask id={maskId} maskUnits="userSpaceOnUse" x={-2} y={-2} width={26} height={25}>
          <Path d={SHARE_PLANE_SILHOUETTE} fill="white" />
        </Mask>
      </Defs>
      <Path d={SHARE_PLANE_STROKE} fill={color ?? "url(#eorth-grad)"} mask={`url(#${maskId})`} />
      {dot && <Circle cx={18.5} cy={2.5} r={2} fill={dotColor} />}
    </Svg>
  );
};

// 기기에 저장(내려받기) — 아래 화살표 + 받침 트레이
export const DownloadIcon: React.FC<IconProps> = ({ size = 64, color, dot = false, dotColor = COLORS.dot }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Defs>
      <LinearGradient id="eorth-grad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor={color ?? COLORS.purpleTop} stopOpacity={color ? 1 : 1} />
        <Stop offset="55%" stopColor={color ?? COLORS.purpleMid} />
        <Stop offset="100%" stopColor={color ?? COLORS.purpleBot} />
      </LinearGradient>
    </Defs>
    <G fill={color ?? "url(#eorth-grad)"}>
      <Path d="M42 8h12v26h14L48 58 28 34h14V8z" />
      <Path d="M16 62h12v14h40V62h12v18c0 5-4 9-9 9H25c-5 0-9-4-9-9V62z" />
    </G>
    {dot && <Circle cx={76} cy={20} r={9} fill={dotColor} />}
  </Svg>
);

export const GoogleIcon: React.FC<IconProps & { color?: string }> = ({ size = 64, color }) => {
  if (color) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          fill={color}
        />
        <Path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill={color}
        />
        <Path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          fill={color}
        />
        <Path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          fill={color}
        />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </Svg>
  );
};

export const AppleIcon: React.FC<IconProps & { color?: string }> = ({ size = 64, color = '#FFFFFF' }) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.22.67-2.94 1.5-.63.73-1.18 1.87-1.03 2.97 1.12.09 2.27-.57 2.98-1.41z"
        fill={color}
      />
    </Svg>
  );
};

