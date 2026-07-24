/**
 * 프로필 공용 비주얼 (내 프로필 ProfileScreen과 동일한 룩앤필).
 * 아바타·통계 카드·배지 하이라이트·여행 카드 — FriendProfile이 이걸 써서 내 프로필과 같게 보인다.
 * (ProfileScreen의 인라인 정의를 그대로 옮긴 것)
 */
import React from 'react';
import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { LiquidPressable, LiquidCardGlow } from '../LiquidEffects';
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

// ─── 아바타 — 프로필 탭과 동일 (128 링, PersonIcon 기본 프사, 글래스 틴트, 사진 없을 때만 그라데이션 링) ───
export const ProfileAvatar = ({ photo }: { photo?: string | null }) => {
  const skinAccent = useSkinAccent(); // 링 그라데이션을 스킨 강조색으로
  return (
    <View style={pv.avatarRing}>
      {photo ? (
        <Image source={{ uri: photo }} style={pv.avatarImg} />
      ) : (
        <View style={pv.avatar}>
          <PersonIcon size={50} color="#A0A0B0" />
        </View>
      )}
      {/* 사진 위 글래스 틴트 + 림 — ProfileScreen과 동일 재현 */}
      <Svg width={110} height={110} viewBox="0 0 111 111" fill="none" style={pv.avatarInner} pointerEvents="none">
        <Defs>
          <SvgLinearGradient id="pvAvatarInnerGrad" x1="74" y1="48.5" x2="99.5" y2="95.5" gradientUnits="userSpaceOnUse">
            <Stop stopColor="#000000" stopOpacity="0" />
            <Stop offset="1" stopColor="#FFFFFF" />
          </SvgLinearGradient>
        </Defs>
        <Circle cx="55.5" cy="55.5" r="55" fill="#751AAD" fillOpacity="0.1" stroke="url(#pvAvatarInnerGrad)" strokeWidth="0.5" />
      </Svg>
      {!photo && (
        <Svg width={128} height={128} viewBox="0 0 128 128" fill="none" style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <SvgLinearGradient id="pvAvatarRingGrad" x1="64" y1="0" x2="96" y2="64" gradientUnits="userSpaceOnUse">
              <Stop stopColor={skinAccent.ringGradient?.[0] ?? '#00D8F3'} />
              <Stop offset="1" stopColor={skinAccent.ringGradient?.[1] ?? '#EC34F7'} />
            </SvgLinearGradient>
          </Defs>
          <Circle cx="64" cy="64" r="61" stroke="url(#pvAvatarRingGrad)" strokeWidth="6" fill="none" />
        </Svg>
      )}
    </View>
  );
};

// ─── 통계 — 프로필 탭과 동일 (박스 없는 숫자+라벨) ───
export const StatCard = ({ value, label, onPress }: {
  value: string; label: string; onPress?: () => void;
}) => (
  <LiquidPressable onPress={onPress} intensity={0.06} style={pv.statCol}>
    <Text style={pv.statValue}>{value}</Text>
    <Text style={pv.statLabel} {...andFitText}>{label}</Text>
  </LiquidPressable>
);

// ─── 배지 하이라이트 — ProfileScreen의 유리 디자인과 동일 (Ellipse 2989 채움 + 유리 그라데이션 테두리) ───
let pvBadgeRingSeq = 0; // SVG 그라데이션 id 충돌 방지용 (인스턴스별 고유 id)
export const BadgeHighlightItem = ({ emoji, image, earned = true }: { emoji: string; image?: ImageSourcePropType; name?: string; glow?: string; earned?: boolean }) => {
  const ringId = React.useMemo(() => 'pvBadgeRing' + (pvBadgeRingSeq++), []);
  return (
    <LiquidPressable style={[pv.badgeItem, !earned && { opacity: 0.6 }]} intensity={0.1}>
      {/* 커스텀 이미지 배지는 자체 테두리가 있어 유리 링·회색 채움 없이 이미지만 렌더 */}
      <View style={[pv.badgeCircle, !!image && pv.badgeCircleImage]}>
        {image ? (
          <Image source={image} style={pv.badgeImg} resizeMode="contain" />
        ) : (
          <>
            {earned ? (
              <Text style={pv.badgeEmoji}>{emoji}</Text>
            ) : (
              <Text style={pv.badgeLock}>🔒</Text>
            )}
            <Svg width={64} height={64} viewBox="0 0 64 64" fill="none" style={StyleSheet.absoluteFill} pointerEvents="none">
              <Defs>
                <SvgLinearGradient id={ringId} x1="13" y1="0" x2="51" y2="64" gradientUnits="userSpaceOnUse">
                  <Stop stopColor="#FFFFFF" stopOpacity="0.7" />
                  <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.08" />
                </SvgLinearGradient>
              </Defs>
              <Circle cx="32" cy="32" r="31.4" stroke={`url(#${ringId})`} strokeWidth="1.2" fill="none" />
            </Svg>
          </>
        )}
      </View>
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
    <LiquidPressable onPress={onPress} style={main ? thumbSt.mainCard : thumbSt.gridCard} intensity={0.02}>
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
  profileRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 20, marginBottom: 14, paddingVertical: 12, overflow: 'hidden', position: 'relative' },
  // 프로필 탭과 동일 치수 (링 128 / 아바타 120 / 글래스 오버레이 110)
  avatarRing: { width: 128, height: 128, borderRadius: 64, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#1F1F22', alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 120, height: 120, borderRadius: 60 },
  avatarInner: { position: 'absolute', top: 9, left: 9 },
  profileInfo: { flex: 1, justifyContent: 'flex-start', paddingTop: 2 },
  userName: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.4, marginBottom: 8 },
  userHandle: { fontSize: 13, color: '#BF85FC', marginBottom: 2 },
  userLocation: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  userBio: { fontSize: 12, color: '#A1A1B0', marginTop: 6, lineHeight: 16 },
  // 통계 — 프로필 탭과 동일 (박스 없는 숫자+라벨)
  statsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 29, marginTop: 23 },
  statCol: { alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', fontFamily: 'Inter_800ExtraBold', color: '#FFFFFF', lineHeight: 26 },
  statLabel: { fontSize: 13, color: '#FFFFFF', marginTop: 4, lineHeight: 16 },
  divider: { height: 1, backgroundColor: '#1A1A26', marginHorizontal: -16, marginBottom: 7 },
  // 배지 스크롤/원 — ProfileScreen의 badgeHL과 동일 수치 (본문 패딩 16 + paddingLeft 4 = 왼쪽 20)
  badgeScroll: { marginBottom: 16, height: 72 },
  badgeScrollContent: { paddingLeft: 4, paddingRight: 8, gap: 21, flexDirection: 'row', alignItems: 'center' },
  badgeItem: { alignItems: 'center', width: 64 },
  badgeCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#D9D9D933', // #D9D9D9 20% — Ellipse 2989 채움
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeEmoji: { fontSize: 24 },
  badgeLock: { fontSize: 22 },
  // 커스텀 이미지 배지 — 회색 원 채움 제거(메달 자체 테두리 사용)
  badgeCircleImage: { backgroundColor: 'transparent' },
  badgeImg: { width: 64, height: 64 },
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
