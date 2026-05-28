import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, G, Rect } from 'react-native-svg';
import { Colors } from '../../constants';

// ─── 스티커 타입 정의 ──────────────────────────────────────────────────────────

export interface Sticker {
  id: string;
  name: string;
  category: StickerCategory;
  component: React.FC<StickerProps>;
}

export type StickerCategory = 'travel' | 'emotion' | 'weather' | 'food' | 'activity';

export interface StickerProps {
  size?: number;
}

// ─── 카테고리 정보 ─────────────────────────────────────────────────────────────

export const stickerCategories: { id: StickerCategory; label: string; emoji: string }[] = [
  { id: 'travel', label: '여행', emoji: '✈️' },
  { id: 'emotion', label: '감정', emoji: '💜' },
  { id: 'weather', label: '날씨', emoji: '☀️' },
  { id: 'food', label: '음식', emoji: '🍜' },
  { id: 'activity', label: '활동', emoji: '🏄' },
];

// ─── 여행 스티커 ───────────────────────────────────────────────────────────────

const StickerAirplane: React.FC<StickerProps> = ({ size = 48 }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <Circle cx={24} cy={24} r={22} fill={Colors.primary} opacity={0.15} />
    <Path
      d="M34 26v-2l-8-5V13a2 2 0 00-4 0v6l-8 5v2l8-2.5V29l-2 1.5V32l3.5-1 3.5 1v-1.5L26 29v-5.5l8 2.5z"
      fill={Colors.primary}
    />
  </Svg>
);

const StickerSuitcase: React.FC<StickerProps> = ({ size = 48 }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <Circle cx={24} cy={24} r={22} fill={Colors.gold} opacity={0.15} />
    <Rect x={14} y={18} width={20} height={16} rx={3} fill={Colors.gold} opacity={0.8} />
    <Path d="M19 18v-3a3 3 0 013-3h4a3 3 0 013 3v3" stroke={Colors.gold} strokeWidth={2} />
    <Path d="M14 24h20" stroke={Colors.bgDeep} strokeWidth={1.5} />
  </Svg>
);

const StickerPassport: React.FC<StickerProps> = ({ size = 48 }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <Circle cx={24} cy={24} r={22} fill={Colors.success} opacity={0.15} />
    <Rect x={15} y={12} width={18} height={24} rx={2} fill={Colors.success} opacity={0.8} />
    <Circle cx={24} cy={22} r={5} stroke={Colors.bgDeep} strokeWidth={1.5} />
    <Path d="M19 30h10" stroke={Colors.bgDeep} strokeWidth={1.5} strokeLinecap="round" />
  </Svg>
);

// ─── 감정 스티커 ───────────────────────────────────────────────────────────────

const StickerHappy: React.FC<StickerProps> = ({ size = 48 }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <Circle cx={24} cy={24} r={22} fill="#FFD700" opacity={0.2} />
    <Circle cx={24} cy={24} r={16} fill="#FFD700" opacity={0.8} />
    <Circle cx={19} cy={21} r={2} fill={Colors.bgDeep} />
    <Circle cx={29} cy={21} r={2} fill={Colors.bgDeep} />
    <Path d="M18 28c2 3 4.5 4 6 4s4-1 6-4" stroke={Colors.bgDeep} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const StickerLove: React.FC<StickerProps> = ({ size = 48 }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <Circle cx={24} cy={24} r={22} fill="#FF6B8A" opacity={0.15} />
    <Path
      d="M24 36s-12-7.5-12-15c0-4.5 3.5-8 7.5-8 2.5 0 4.5 1.5 4.5 1.5S26.5 13 29 13c4 0 7.5 3.5 7.5 8 0 7.5-12.5 15-12.5 15z"
      fill="#FF6B8A"
    />
  </Svg>
);

const StickerAmazed: React.FC<StickerProps> = ({ size = 48 }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <Circle cx={24} cy={24} r={22} fill={Colors.primary} opacity={0.15} />
    <Circle cx={24} cy={24} r={16} fill={Colors.primary} opacity={0.6} />
    <Circle cx={19} cy={21} r={2.5} fill={Colors.white} />
    <Circle cx={29} cy={21} r={2.5} fill={Colors.white} />
    <Circle cx={24} cy={30} r={3} fill={Colors.white} />
  </Svg>
);

// ─── 날씨 스티커 ───────────────────────────────────────────────────────────────

const StickerSunny: React.FC<StickerProps> = ({ size = 48 }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <Circle cx={24} cy={24} r={22} fill="#FFD700" opacity={0.1} />
    <Circle cx={24} cy={24} r={8} fill="#FFD700" />
    <G stroke="#FFD700" strokeWidth={2} strokeLinecap="round">
      <Path d="M24 10v4M24 34v4M10 24h4M34 24h4M14.3 14.3l2.8 2.8M30.9 30.9l2.8 2.8M33.7 14.3l-2.8 2.8M17.1 30.9l-2.8 2.8" />
    </G>
  </Svg>
);

const StickerRainy: React.FC<StickerProps> = ({ size = 48 }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <Circle cx={24} cy={24} r={22} fill="#64B5F6" opacity={0.1} />
    <Path
      d="M14 26h20a6 6 0 00-2-10h-.5A8 8 0 0016 18a6 6 0 00-2 8z"
      fill="#90CAF9"
    />
    <G stroke="#64B5F6" strokeWidth={2} strokeLinecap="round">
      <Path d="M18 32v4M24 32v4M30 32v4" />
    </G>
  </Svg>
);

const StickerSnowy: React.FC<StickerProps> = ({ size = 48 }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <Circle cx={24} cy={24} r={22} fill={Colors.white} opacity={0.1} />
    <Path d="M24 8v32M12 16l24 16M12 32l24-16" stroke={Colors.white} strokeWidth={1.5} opacity={0.8} />
    <Circle cx={24} cy={24} r={3} fill={Colors.white} />
    <Circle cx={24} cy={12} r={2} fill={Colors.white} opacity={0.6} />
    <Circle cx={24} cy={36} r={2} fill={Colors.white} opacity={0.6} />
  </Svg>
);

// ─── 음식 스티커 ───────────────────────────────────────────────────────────────

const StickerCoffee: React.FC<StickerProps> = ({ size = 48 }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <Circle cx={24} cy={24} r={22} fill="#8D6E63" opacity={0.15} />
    <Path d="M14 20h16v14a4 4 0 01-4 4h-8a4 4 0 01-4-4V20z" fill="#8D6E63" />
    <Path d="M30 22h3a3 3 0 010 6h-3" stroke="#8D6E63" strokeWidth={2} />
    <Path d="M18 14c0-2 1-3 2-3s2 1 2 3M23 14c0-2 1-3 2-3s2 1 2 3" stroke="#8D6E63" strokeWidth={1.5} strokeLinecap="round" opacity={0.6} />
  </Svg>
);

const StickerRamen: React.FC<StickerProps> = ({ size = 48 }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <Circle cx={24} cy={24} r={22} fill="#FF7043" opacity={0.15} />
    <Path d="M10 24h28a12 12 0 01-12 12 12 12 0 01-12-12h-4z" fill="#FF7043" opacity={0.8} />
    <Path d="M10 24h28" stroke="#E64A19" strokeWidth={2} />
    <Path d="M18 16c1 2 0 4 1 6M24 14c1 2 0 4 1 6M30 16c1 2 0 4 1 6" stroke="#FF7043" strokeWidth={1.5} strokeLinecap="round" />
  </Svg>
);

// ─── 활동 스티커 ───────────────────────────────────────────────────────────────

const StickerHiking: React.FC<StickerProps> = ({ size = 48 }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <Circle cx={24} cy={24} r={22} fill={Colors.success} opacity={0.15} />
    <Path d="M14 38l8-14 4 6 8-18" stroke={Colors.success} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    <Circle cx={34} cy={12} r={2} fill={Colors.gold} />
  </Svg>
);

const StickerSwimming: React.FC<StickerProps> = ({ size = 48 }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <Circle cx={24} cy={24} r={22} fill="#29B6F6" opacity={0.15} />
    <Circle cx={20} cy={18} r={3} fill="#29B6F6" />
    <Path d="M14 28c2-2 4-2 6 0s4 2 6 0 4-2 6 0 4 2 6 0" stroke="#29B6F6" strokeWidth={2} strokeLinecap="round" />
    <Path d="M14 34c2-2 4-2 6 0s4 2 6 0 4-2 6 0 4 2 6 0" stroke="#29B6F6" strokeWidth={2} strokeLinecap="round" opacity={0.5} />
    <Path d="M20 22l6 4" stroke="#29B6F6" strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const StickerPhoto: React.FC<StickerProps> = ({ size = 48 }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <Circle cx={24} cy={24} r={22} fill={Colors.primary} opacity={0.15} />
    <Rect x={12} y={16} width={24} height={18} rx={3} stroke={Colors.primary} strokeWidth={2} />
    <Circle cx={24} cy={25} r={5} stroke={Colors.primary} strokeWidth={2} />
    <Circle cx={24} cy={25} r={2} fill={Colors.primary} />
    <Path d="M18 16l2-3h8l2 3" stroke={Colors.primary} strokeWidth={2} />
  </Svg>
);

// ─── 스티커 레지스트리 ─────────────────────────────────────────────────────────

export const stickers: Sticker[] = [
  // 여행
  { id: 'airplane', name: '비행기', category: 'travel', component: StickerAirplane },
  { id: 'suitcase', name: '캐리어', category: 'travel', component: StickerSuitcase },
  { id: 'passport', name: '여권', category: 'travel', component: StickerPassport },
  // 감정
  { id: 'happy', name: '행복', category: 'emotion', component: StickerHappy },
  { id: 'love', name: '사랑', category: 'emotion', component: StickerLove },
  { id: 'amazed', name: '놀람', category: 'emotion', component: StickerAmazed },
  // 날씨
  { id: 'sunny', name: '맑음', category: 'weather', component: StickerSunny },
  { id: 'rainy', name: '비', category: 'weather', component: StickerRainy },
  { id: 'snowy', name: '눈', category: 'weather', component: StickerSnowy },
  // 음식
  { id: 'coffee', name: '커피', category: 'food', component: StickerCoffee },
  { id: 'ramen', name: '라면', category: 'food', component: StickerRamen },
  // 활동
  { id: 'hiking', name: '하이킹', category: 'activity', component: StickerHiking },
  { id: 'swimming', name: '수영', category: 'activity', component: StickerSwimming },
  { id: 'photo', name: '사진', category: 'activity', component: StickerPhoto },
];

export const getStickersByCategory = (category: StickerCategory): Sticker[] =>
  stickers.filter((s) => s.category === category);
