/**
 * 프로필 공용 비주얼 (내 프로필 ProfileScreen과 동일한 룩앤필).
 * 아바타·통계 카드·배지 하이라이트·여행 카드 — FriendProfile이 이걸 써서 내 프로필과 같게 보인다.
 * (ProfileScreen의 인라인 정의를 그대로 옮긴 것)
 */
import React from 'react';
import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Path } from 'react-native-svg';
import { LiquidPressable, GooeyCircle, LiquidCardGlow } from '../LiquidEffects';
import { PersonIcon } from '../icons';
import { andFitText } from '../../utils/fitText';
import { useSkinAccent } from '../../constants/skinTheme';

const SCREEN_WIDTH = Dimensions.get('window').width;
export const THUMB_WIDTH = (SCREEN_WIDTH - 32 - 12) / 2;

const GLASS = {
  innerTop: 'rgba(255,255,255,0.16)',
  innerBottom: 'rgba(255,255,255,0.02)',
  specular: 'rgba(255,255,255,0.55)',
};
export const NEON = { cyan: '#22D3EE', blue: '#3B82F6', purple: '#A855F7', magenta: '#D946EF', pink: '#F472B6' };
export const STAT_GRADS = [
  ['#BF85FC', '#6B21A8'],
  ['#BF85FC', '#6B21A8'],
  ['#BF85FC', '#6B21A8'],
] as const;
export const TRIP_GRADIENT_COLORS: Record<string, [string, string]> = {
  'trip-japan': ['rgba(221,183,255,0.2)', 'rgba(221,183,255,0)'],
  'trip-usa': ['rgba(137,206,255,0.2)', 'rgba(137,206,255,0)'],
  'trip-hongkong': ['rgba(47,217,244,0.2)', 'rgba(47,217,244,0)'],
  'trip-thailand': ['rgba(255,200,100,0.2)', 'rgba(255,200,100,0)'],
  'trip-spain': ['rgba(255,100,100,0.2)', 'rgba(255,100,100,0)'],
};

// 유리 질감 레이어
const GlassFill = ({ intensity = 30, specular = true }: { intensity?: number; specular?: boolean }) => (
  <>
    <BlurView intensity={intensity} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} pointerEvents="none" />
    <LinearGradient colors={[GLASS.innerTop, GLASS.innerBottom]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
    {specular ? (
      <LinearGradient colors={[GLASS.specular, 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '55%', opacity: 0.4 }} pointerEvents="none" />
    ) : null}
  </>
);

const NeonGlass = ({ children, colors = [NEON.cyan, NEON.purple], radius = 18, borderWidth = 1.5, intensity = 24, glowColor, contentStyle }: {
  children?: React.ReactNode; colors?: readonly [string, string, ...string[]]; radius?: number; borderWidth?: number; intensity?: number; glowColor?: string; contentStyle?: any;
}) => (
  <View style={{ shadowColor: glowColor || colors[0], shadowOpacity: 0.9, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 12 }}>
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius, padding: borderWidth }}>
      <View style={[{ borderRadius: radius - borderWidth, overflow: 'hidden', backgroundColor: 'rgba(10,10,15,0.5)' }, contentStyle]}>
        <GlassFill intensity={intensity} />
        {children}
      </View>
    </LinearGradient>
  </View>
);

const NeonRing = ({ size, colors, borderWidth = 2, intensity = 16, children }: {
  size: number; colors: readonly [string, string, ...string[]]; borderWidth?: number; intensity?: number; children?: React.ReactNode;
}) => (
  <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: size / 2, padding: borderWidth, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size - borderWidth * 2, height: size - borderWidth * 2, borderRadius: (size - borderWidth * 2) / 2, overflow: 'hidden', backgroundColor: 'rgba(10,10,15,0.45)', alignItems: 'center', justifyContent: 'center' }}>
      <GlassFill intensity={intensity} />
      {children}
    </View>
  </LinearGradient>
);

// ─── 형식 배지 아이콘 ───
const BADGE_SZ = 14;
const BADGE_C = '#FFFFFF';
const FeedBadgeIcon = () => (
  <View style={{ width: BADGE_SZ, height: BADGE_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 5, height: 2.5, borderTopLeftRadius: 1, borderTopRightRadius: 1, backgroundColor: BADGE_C }} />
    <View style={{ width: 12, height: 8, borderRadius: 2, backgroundColor: BADGE_C, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 5, height: 5, borderRadius: 2.5, borderWidth: 1.2, borderColor: '#2E2E3B' }} />
    </View>
  </View>
);
const BlogBadgeIcon = () => (
  <View style={{ width: BADGE_SZ, height: BADGE_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 12, height: 12, gap: 1.5 }}>
      <View style={{ width: 8, height: 2, borderRadius: 1, backgroundColor: BADGE_C }} />
      <View style={{ width: 12, height: 1.5, borderRadius: 0.75, backgroundColor: BADGE_C, opacity: 0.6 }} />
      <View style={{ width: 10, height: 1.5, borderRadius: 0.75, backgroundColor: BADGE_C, opacity: 0.6 }} />
      <View style={{ width: 9, height: 1.5, borderRadius: 0.75, backgroundColor: BADGE_C, opacity: 0.6 }} />
    </View>
  </View>
);
const AlbumBadgeIcon = () => (
  <View style={{ width: BADGE_SZ, height: BADGE_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 12, height: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 1.5 }}>
      {[0, 1, 2, 3].map((i) => <View key={i} style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: BADGE_C }} />)}
    </View>
  </View>
);
const SnapBadgeIcon = () => (
  <Svg width={16} height={18} viewBox="0 0 24 24" fill="none"><Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill={BADGE_C} /></Svg>
);
const CutBadgeIcon = () => (
  <View style={{ width: BADGE_SZ, height: BADGE_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 11, height: 13, borderWidth: 1, borderColor: BADGE_C, borderRadius: 2, padding: 1.5, flexDirection: 'row', flexWrap: 'wrap', gap: 1, alignContent: 'center', justifyContent: 'center' }}>
      {[0, 1, 2, 3].map((i) => <View key={i} style={{ width: 3, height: 3, borderRadius: 0.5, backgroundColor: BADGE_C }} />)}
    </View>
  </View>
);
export const VIEW_TYPE_BADGE: Record<string, React.ReactNode> = {
  feed: <FeedBadgeIcon />, blog: <BlogBadgeIcon />, album: <AlbumBadgeIcon />, snap: <SnapBadgeIcon />, cut: <CutBadgeIcon />,
};

// ─── 아바타 (구이 그라디언트 링) ───
export const ProfileAvatar = ({ photo, initial }: { photo?: string | null; initial?: string }) => {
  const skinAccent = useSkinAccent(); // 아바타 글로우색을 스킨 강조색으로 (링 무지개는 유지)
  return (
  <GooeyCircle size={104} color={skinAccent.accent} glowOpacity={0.6}>
    <LinearGradient colors={[NEON.cyan, NEON.purple, NEON.magenta]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={pv.avatarRing}>
      {photo ? (
        <Image source={{ uri: photo }} style={pv.avatarImg} />
      ) : (
        <View style={pv.avatar}>
          {initial ? <Text style={pv.avatarText}>{initial.toUpperCase()}</Text> : <PersonIcon size={44} color="#A0A0B0" />}
        </View>
      )}
    </LinearGradient>
  </GooeyCircle>
  );
};

// ─── 통계 카드 ───
export const StatCard = ({ value, label, onPress, grad }: {
  value: string; label: string; onPress?: () => void; grad?: readonly [string, string, ...string[]];
}) => {
  const skinAccent = useSkinAccent(); // 통계 카드 유리 그라데이션을 스킨 강조색으로 (aurora=기존값)
  const g = grad || ([skinAccent.accent, skinAccent.accentDeep] as const);
  return (
  <LiquidPressable onPress={onPress} intensity={0.08}>
    <NeonGlass colors={g} glowColor={g[0]} radius={16} borderWidth={1.3} intensity={22} contentStyle={pv.statCardContent}>
      <Text style={pv.statValue}>{value}</Text>
      <Text style={pv.statLabel} {...andFitText}>{label}</Text>
    </NeonGlass>
  </LiquidPressable>
  );
};

// ─── 배지 하이라이트 ───
export const BadgeHighlightItem = ({ emoji, glow, earned = true }: { emoji: string; name?: string; glow?: string; earned?: boolean }) => {
  const skinAccent = useSkinAccent(); // 배지 글로우색을 스킨 강조색으로 (링 무지개는 유지)
  return (
  <LiquidPressable style={[pv.badgeItem, !earned && { opacity: 0.6 }]} intensity={0.1}>
    <GooeyCircle size={64} color={glow || skinAccent.accent} glowOpacity={earned ? 0.5 : 0.12}>
      <NeonRing size={58} borderWidth={1.6} intensity={20} colors={earned ? [NEON.cyan, NEON.purple, NEON.magenta] : ['rgba(255,255,255,0.25)', 'rgba(255,255,255,0.1)']}>
        {earned ? <Text style={pv.badgeEmoji}>{emoji}</Text> : <Text style={pv.badgeLock}>🔒</Text>}
      </NeonRing>
    </GooeyCircle>
  </LiquidPressable>
  );
};

export interface TripCardData {
  id: string;
  emoji: string;
  title: string;
  countryFlag: string;
  date: string;
  coverUri?: string;
  records: { id: string; viewType: string }[];
}

// ─── 여행 카드 (메인/그리드) ───
export const TripCard = ({ trip, main, onPress }: { trip: TripCardData; main?: boolean; onPress?: () => void }) => {
  const grad = TRIP_GRADIENT_COLORS[trip.id] || ['rgba(221,183,255,0.2)', 'rgba(221,183,255,0)'];
  const glowColor = grad[0]?.replace(/[,\s]0\.\d+\)/, ',1)') || '#A855F7';
  return (
    <LiquidPressable onPress={onPress} style={main ? thumbSt.mainCard : thumbSt.gridCard} intensity={0.12}>
      <LiquidCardGlow width={main ? SCREEN_WIDTH : THUMB_WIDTH} height={main ? 320 : 260} color={glowColor} opacity={main ? 0.34 : 0.3} />
      <LinearGradient colors={grad} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
      {trip.coverUri ? (
        <>
          <Image source={{ uri: trip.coverUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']} style={StyleSheet.absoluteFill} />
          <View style={main ? thumbSt.mainEmojiWrap : thumbSt.gridEmojiWrap} />
        </>
      ) : (
        <View style={main ? thumbSt.mainEmojiWrap : thumbSt.gridEmojiWrap}>
          <Text style={main ? thumbSt.mainEmoji : thumbSt.gridEmoji}>{trip.emoji}</Text>
        </View>
      )}
      <BlurView intensity={main ? 48 : 44} tint="dark" experimentalBlurMethod="dimezisBlurView" style={main ? thumbSt.mainInfoBar : thumbSt.gridInfoBar}>
        {main ? (
          <>
            <View style={{ flex: 1 }}>
              <Text style={thumbSt.mainTitle}>{trip.countryFlag} {trip.title}</Text>
              <Text style={thumbSt.mainDate}>{trip.date}</Text>
            </View>
            <View style={thumbSt.mainBadges}>
              {Array.from(new Set(trip.records.map((r) => r.viewType || 'feed'))).map((vt) => <View key={vt} style={thumbSt.mainBadge}>{VIEW_TYPE_BADGE[vt] || null}</View>)}
            </View>
          </>
        ) : (
          <>
            <Text style={thumbSt.gridTitle} {...andFitText}>{trip.countryFlag} {trip.title}</Text>
            <Text style={thumbSt.gridDate}>{trip.date}</Text>
            <View style={thumbSt.gridBadges}>
              {Array.from(new Set(trip.records.map((r) => r.viewType || 'feed'))).map((vt) => <View key={vt} style={thumbSt.gridBadge}>{VIEW_TYPE_BADGE[vt] || null}</View>)}
            </View>
          </>
        )}
      </BlurView>
    </LiquidPressable>
  );
};

export const pv = StyleSheet.create({
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 14, paddingVertical: 16, overflow: 'hidden', position: 'relative' },
  avatarRing: { width: 102, height: 102, borderRadius: 51, padding: 3, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#1F1F22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 96, height: 96, borderRadius: 48, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  avatarText: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF' },
  profileInfo: { flex: 1, justifyContent: 'center' },
  userName: { fontSize: 24, fontWeight: '600', color: '#FFFFFF', marginBottom: 2, textShadowColor: 'rgba(191,133,252,0.4)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },
  userHandle: { fontSize: 13, color: '#BF85FC', marginBottom: 2 },
  userLocation: { fontSize: 12, color: '#CFC2D6', letterSpacing: 0.6 },
  userBio: { fontSize: 12, color: '#A1A1B0', marginTop: 6, lineHeight: 16 },
  statsRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  statCardContent: { paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center' },
  statValue: { fontSize: 13, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 1 },
  statLabel: { fontSize: 10, color: '#CFC2D6', letterSpacing: 0.4 },
  divider: { height: 1, backgroundColor: '#1A1A26', marginHorizontal: -16, marginBottom: 7 },
  badgeScroll: { marginBottom: 7, height: 88 },
  badgeScrollContent: { paddingLeft: 16, paddingRight: 8, gap: 14, flexDirection: 'row', alignItems: 'center' },
  badgeItem: { alignItems: 'center', width: 60 },
  badgeEmoji: { fontSize: 24 },
  badgeLock: { fontSize: 22 },
  gridHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  gridHeaderTitle: { fontSize: 24, fontWeight: '700', color: '#FFFFFF' },
  tripCount: { fontSize: 12, color: '#A1A1B0' },
  tripGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
});

const thumbSt = StyleSheet.create({
  mainCard: { width: '100%', height: 260, borderRadius: 32, overflow: 'hidden', position: 'relative', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 12 },
  mainEmojiWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mainEmoji: { fontSize: 72 },
  mainInfoBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(14,14,17,0.16)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 20, paddingVertical: 16, overflow: 'hidden' },
  mainTitle: { fontSize: 24, fontWeight: '700', color: '#FFFFFF' },
  mainDate: { fontSize: 12, color: '#CFC2D6', marginTop: 2 },
  mainBadges: { flexDirection: 'row', gap: 8 },
  mainBadge: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: 'rgba(255,255,255,0.42)', backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  gridCard: { width: THUMB_WIDTH, height: 210, borderRadius: 24, overflow: 'hidden', position: 'relative', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(255,255,255,0.05)' },
  gridEmojiWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gridEmoji: { fontSize: 48 },
  gridInfoBar: { backgroundColor: 'rgba(14,14,17,0.16)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 12, paddingVertical: 10, gap: 3, overflow: 'hidden' },
  gridTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  gridDate: { fontSize: 12, color: '#CFC2D6' },
  gridBadges: { flexDirection: 'row', gap: 6, marginTop: 4 },
  gridBadge: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.42)', backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
});
