import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  PanResponder,
  Dimensions,
  Linking,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { PersonIcon } from '../components/icons';
import GrainOverlay from '../components/GrainOverlay';
import StarFieldBackground from '../components/StarFieldBackground';
import { useSkinAccent } from '../constants/skinTheme';
import { setTabBarHidden } from '../components/tabBarVisibility';
import { useCardOrder, setCardOrder } from '../store/cardOrderStore';
import {
  LiquidPressable,
  LiquidCardGlow,
} from '../components/LiquidEffects';
import { useRecords } from '../store/recordStore';
import { emitToast } from '../store/toastStore';
import { BADGES, BADGE_CATEGORIES } from '../constants/badges';
import { useSettings } from '../store/settingsStore';
import { COUNTRIES } from '../constants/countries';
import { handleFontStyle } from '../constants/handleFonts';
import { detectCurrentCountry } from '../services/snapService';
import { showPermissionDeniedAlert } from '../utils/permissionAlert';
import { andFitText } from '../utils/fitText';
import { getMyUserId } from '../services/profile';
import MainCoachmark, { CoachStep, CoachRect } from '../components/MainCoachmark';
import { setCoachActive } from '../components/coachOverlayState';
import { fetchFollowerCount } from '../services/social';
import type { TabScreenProps } from '../navigation/types';

// 안드로이드 구아키텍처에서 LayoutAnimation 활성화 (신아키텍처/iOS는 기본 동작, 호출은 안전)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// 프로필 튜토리얼 1회 노출 플래그 키 (계정별)
const PROFILE_TUTORIAL_KEY = '@eorth/profileTutorialSeen';

// 리퀴드 글래스 카드 재정렬용 부드러운 스프링 레이아웃 전환
// (이웃 카드가 순간이동하지 않고 새 위치로 출렁이며 이동)
const LIQUID_LAYOUT = {
  duration: 340,
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.spring, springDamping: 0.78 },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
};

// ─── 컬러 상수 (Figma 디자인 기반) ───
const COLORS = {
  bg:           '#0A0A0F',
  card:         '#2E2E3B',
  divider:      '#1A1A26',
  purpleNeon:   '#BF85FC',
  purpleDeep:   '#6B21A8',
  purpleBg:     'rgba(107,33,168,0.25)',
  purpleBorder: 'rgba(191,133,252,0.3)',
  purpleThumb:  '#1A0A2E',
  white:        '#FFFFFF',
  textDim:      '#A1A1B0',
  textMuted:    '#8B8B9E',
  redBg:        'rgba(255,59,48,0.1)',
  redBorder:    'rgba(255,59,48,0.2)',
  red:          '#FF3B30',
};

// ─── 리퀴드 글래스 (실제 BlurView — 디벨롭 빌드 전용) ───
// Expo Go 에선 안드로이드 backdrop blur 가 동작하지 않아 가짜 그라디언트를 썼지만,
// 디벨롭 빌드에선 진짜 프로스티드 글래스를 깔 수 있다.
const GLASS = {
  border:      'rgba(255,255,255,0.30)',
  innerTop:    'rgba(255,255,255,0.16)',
  innerBottom: 'rgba(255,255,255,0.02)',
  specular:    'rgba(255,255,255,0.55)',
};

// 부모(overflow:hidden + 라운드) 안에 깔아 유리 질감을 만드는 absolute-fill 레이어
// 1) 실제 블러  2) 유리 안쪽 그라디언트  3) 상단 스페큘러(반사) 하이라이트
const GlassFill = ({
  intensity = 30,
  tint = 'dark',
  specular = true,
}: {
  intensity?: number;
  tint?: 'dark' | 'light' | 'default';
  specular?: boolean;
}) => (
  <>
    <BlurView
      intensity={intensity}
      tint={tint}
      experimentalBlurMethod="dimezisBlurView"
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
    <LinearGradient
      colors={[GLASS.innerTop, GLASS.innerBottom]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
    {specular ? (
      <LinearGradient
        colors={[GLASS.specular, 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '55%', opacity: 0.4 }}
        pointerEvents="none"
      />
    ) : null}
  </>
);

// ─── 네온 리퀴드 글래스 (다크모드 — Liquid Glass UI Kit 레퍼런스) ───
const NEON = {
  cyan:    '#22D3EE',
  blue:    '#3B82F6',
  purple:  '#A855F7',
  magenta: '#D946EF',
  pink:    '#F472B6',
};

// 통계 칩 — 앱 메인 보라색 (보라 네온 → 보라 딥) 통일
const STAT_GRADS = [
  ['#BF85FC', '#6B21A8'],
  ['#BF85FC', '#6B21A8'],
  ['#BF85FC', '#6B21A8'],
] as const;

// 네온 그라디언트 보더 + 글래스 (칩/버튼/카드)
const NeonGlass = ({
  children,
  style,
  contentStyle,
  colors = [NEON.cyan, NEON.purple],
  radius = 18,
  borderWidth = 1.5,
  intensity = 24,
  glow = true,
  glowColor,
  specular = true,
}: {
  children?: React.ReactNode;
  style?: any;
  contentStyle?: any;
  colors?: readonly [string, string, ...string[]];
  radius?: number;
  borderWidth?: number;
  intensity?: number;
  glow?: boolean;
  glowColor?: string;
  specular?: boolean;
}) => (
  <View
    style={[
      glow
        ? {
            shadowColor: glowColor || colors[0],
            shadowOpacity: 0.9,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 0 },
            elevation: 12,
          }
        : null,
      style,
    ]}
  >
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: radius, padding: borderWidth }}
    >
      <View
        style={[
          { borderRadius: radius - borderWidth, overflow: 'hidden', backgroundColor: 'rgba(10,10,15,0.5)' },
          contentStyle,
        ]}
      >
        <GlassFill intensity={intensity} specular={specular} />
        {children}
      </View>
    </LinearGradient>
  </View>
);

// ─── 팔로워 카드 (네온 글래스 칩) ───
const StatCard = ({
  value,
  label,
  onPress,
}: {
  value: string;
  label: string;
  onPress?: () => void;
}) => (
  <LiquidPressable onPress={onPress} intensity={0.06} style={styles.statCol}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel} {...andFitText}>{label}</Text>
  </LiquidPressable>
);

// ─── 여행 기록 썸네일 데이터 ───
const SCREEN_WIDTH = Dimensions.get('window').width;
const CELL_SIZE = Math.floor((SCREEN_WIDTH - 4) / 3);
const THUMB_WIDTH = (SCREEN_WIDTH - 32 - 12) / 2; // 2열 그리드

// ─── 기록 형식 아이콘 (FAB과 동일한 View 기반) ───
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
      <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: BADGE_C }} />
      <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: BADGE_C }} />
      <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: BADGE_C }} />
      <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: BADGE_C }} />
    </View>
  </View>
);

const SnapBadgeIcon = () => (
  <Svg width={16} height={18} viewBox="0 0 24 24" fill="none">
    <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill={BADGE_C} />
  </Svg>
);

const CutBadgeIcon = () => (
  <View style={{ width: BADGE_SZ, height: BADGE_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 11, height: 13, borderWidth: 1, borderColor: BADGE_C, borderRadius: 2, padding: 1.5, flexDirection: 'row', flexWrap: 'wrap', gap: 1, alignContent: 'center', justifyContent: 'center' }}>
      <View style={{ width: 3, height: 3, borderRadius: 0.5, backgroundColor: BADGE_C }} />
      <View style={{ width: 3, height: 3, borderRadius: 0.5, backgroundColor: BADGE_C }} />
      <View style={{ width: 3, height: 3, borderRadius: 0.5, backgroundColor: BADGE_C }} />
      <View style={{ width: 3, height: 3, borderRadius: 0.5, backgroundColor: BADGE_C }} />
    </View>
  </View>
);

const VIEW_TYPE_BADGE: Record<string, React.ReactNode> = {
  feed: <FeedBadgeIcon />,
  blog: <BlogBadgeIcon />,
  album: <AlbumBadgeIcon />,
  snap: <SnapBadgeIcon />,
  cut: <CutBadgeIcon />,
};

const VIEW_TYPE_NAMES: Record<string, string> = {
  feed: '피드', blog: '블로그', album: '앨범', snap: '스냅', cut: '스트립',
};

// 하나의 여행 = 하나의 썸네일 (여러 형식 기록 포함)
interface TripThumbnail {
  id: string;
  emoji: string;
  title: string;
  country: string;
  countryFlag: string;
  date: string;
  color: string;
  records: { id: string; viewType: string }[];
  coverUri?: string; // 대표 기록의 첫 사진 — 있으면 카드 썸네일 배경으로 사용
}

// 프로필 여행 카드는 실제 작성 기록으로 채워진다 — 신규 사용자는 빈 상태로 시작 (데모 시드 제거)
const TRIP_THUMBNAILS: TripThumbnail[] = [];

let CURRENT_TRIP_THUMBNAILS = [...TRIP_THUMBNAILS];

// 사용자가 드래그로 지정한 카드 표시 순서(카드 id 배열) — 화면 재진입 시 유지
// displayTrips(mappedThumbnails + trips)를 이 순서로 정렬한다.
// 여기에 없는(새로 만든) 카드는 맨 앞(메인 자리)으로 보낸다.
// 순서 자체는 cardOrderStore(구독+영속)가 관리 — 탭/푸시 동시 인스턴스 간 동기화·재시작 유지.



// ─── 여행 카드 그라디언트 색상 매핑 ───
const TRIP_GRADIENT_COLORS: Record<string, [string, string]> = {
  'trip-japan': ['rgba(221,183,255,0.2)', 'rgba(221,183,255,0)'],
  'trip-usa': ['rgba(137,206,255,0.2)', 'rgba(137,206,255,0)'],
  'trip-hongkong': ['rgba(47,217,244,0.2)', 'rgba(47,217,244,0)'],
  'trip-thailand': ['rgba(255,200,100,0.2)', 'rgba(255,200,100,0)'],
  'trip-spain': ['rgba(255,100,100,0.2)', 'rgba(255,100,100,0)'],
};

// ─── 배지 하이라이트 아이템 (리퀴드 구이 서클) ───
let badgeRingSeq = 0; // SVG 그라데이션 id 충돌 방지용 (인스턴스별 고유 id)
const BadgeHighlightItem = ({ emoji, name, glow, earned = true }: { emoji: string; name: string; glow?: string; earned?: boolean }) => {
  const ringId = React.useMemo(() => 'badgeRing' + (badgeRingSeq++), []);
  return (
    <LiquidPressable style={[badgeHL.item, !earned && { opacity: 0.6 }]} intensity={0.1}>
      {/* 배지 원 — Ellipse 2989 채움 + 유리 그라데이션 테두리(stroke만 → 안쪽엔 영향 없음) */}
      <View style={badgeHL.circle}>
        {earned ? (
          <Text style={badgeHL.emoji}>{emoji}</Text>
        ) : (
          <Text style={badgeHL.lockIcon}>🔒</Text>
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
      </View>
    </LiquidPressable>
  );
};

// ─── 배지 전체 목록 모달 ───
const getMetallicColors = (glow: string | undefined): [string, string, string, string] => {
  if (!glow) return ['#FFE072', '#CBA32E', '#FCE9A6', '#A67C1E']; // 골드 기본
  const g = glow.toLowerCase();
  if (g.includes('47,217,244') || g.includes('cyan')) {
    return ['#A5F3FC', '#06B6D4', '#CFFAFE', '#0891B2']; // 사이언
  }
  if (g.includes('168,85,247') || g.includes('purple')) {
    return ['#E9D5FF', '#A855F7', '#F3E8FF', '#7E22CE']; // 퍼플
  }
  if (g.includes('255,100,100') || g.includes('255,70,85') || g.includes('red')) {
    return ['#FECDD3', '#F43F5E', '#FFE4E6', '#BE123C']; // 레드/핑크
  }
  if (g.includes('47,244,150') || g.includes('green')) {
    return ['#A7F3D0', '#10B981', '#D1FAE5', '#047857']; // 그린
  }
  return ['#E2E8F0', '#94A3B8', '#F1F5F9', '#475569']; // 실버
};


function BadgeListModal({
  visible,
  onClose,
  selectedBadgeIds,
  setSelectedBadgeIds,
  earnedBadgeIds,
}: {
  visible: boolean;
  onClose: () => void;
  selectedBadgeIds: number[];
  setSelectedBadgeIds: React.Dispatch<React.SetStateAction<number[]>>;
  earnedBadgeIds: Set<number>;
}) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  const earnedCount = BADGES.filter((b) => earnedBadgeIds.has(b.id)).length;

  // 선택 모드: 기본(false)은 탭하면 확대, 선택 모드(true)는 탭하면 프로필 표시 토글
  const [selectMode, setSelectMode] = useState(false);
  // 확대해서 볼 배지 (null이면 닫힘)
  const [enlargedBadge, setEnlargedBadge] = useState<(typeof BADGES)[number] | null>(null);

  const handleToggleSelect = (badgeId: number, isEarned: boolean) => {
    if (!isEarned) return; // 미획득 배지는 선택 불가
    setSelectedBadgeIds((prev) => {
      if (prev.includes(badgeId)) {
        return prev.filter((id) => id !== badgeId);
      } else {
        if (prev.length >= 5) {
          Alert.alert(t('profile.noticeTitle'), t('profile.badgeMaxAlert'));
          return prev;
        }
        return [...prev, badgeId];
      }
    });
  };

  // 배지 탭 분기: 선택 모드면 토글, 아니면 확대해서 보기
  const handleBadgePress = (badge: (typeof BADGES)[number]) => {
    if (selectMode) {
      handleToggleSelect(badge.id, earnedBadgeIds.has(badge.id));
    } else {
      setEnlargedBadge(badge);
    }
  };

  // 모달을 닫을 때 선택 모드/확대 상태도 초기화
  const handleClose = () => {
    setSelectMode(false);
    setEnlargedBadge(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={blStyles.root} accessibilityViewIsModal>
        {/* 핸들 바 */}
        <View style={blStyles.handle} />
        
        <View style={blStyles.header}>
          <Text style={blStyles.title}>{t('profile.badgeCollection')}</Text>
          <Text style={[blStyles.subtitle, { color: skinAccent.accent }]}>
            {selectMode
              ? t('profile.badgeSelectCount', { count: selectedBadgeIds.length })
              : t('profile.badgeEarnedCount', { earned: earnedCount, total: BADGES.length })}
          </Text>
          <TouchableOpacity
            style={[blStyles.selectBtn, selectMode && [blStyles.selectBtnOn, { backgroundColor: skinAccent.accent, borderColor: skinAccent.accent }]]}
            onPress={() => setSelectMode((v) => !v)}
            activeOpacity={0.8}
          >
            <Text style={[blStyles.selectBtnText, { color: skinAccent.accent }, selectMode && blStyles.selectBtnTextOn]}>
              {selectMode ? t('profile.selectDone') : t('profile.select')}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={blStyles.binderWrapper}>
          <ScrollView
            showsVerticalScrollIndicator={false}
          >
            {BADGE_CATEGORIES.map((cat) => {
              // ids가 있으면 그 순서대로, 없으면 range 구간. extra는 뒤에 덧붙인다.
              const pick = (id: number) => { const b = BADGES.find((x) => x.id === id); return b ? [b] : []; };
              const base = cat.ids
                ? cat.ids.flatMap(pick)
                : BADGES.filter((b) => b.id >= cat.range[0] && b.id <= cat.range[1]);
              const catBadges = cat.extra ? [...base, ...cat.extra.flatMap(pick)] : base;
              // Group into rows of 3
              const rows = [];
              for (let i = 0; i < catBadges.length; i += 3) {
                rows.push(catBadges.slice(i, i + 3));
              }

              return (
                <View key={cat.name} style={blStyles.categorySection}>
                  <Text style={[blStyles.categoryTitle, { color: skinAccent.accent }]}>{cat.name}</Text>
                  {rows.map((row, rowIndex) => (
                    <View key={rowIndex} style={blStyles.row}>
                      {row.map((badge, index) => {
                        const isEarned = earnedBadgeIds.has(badge.id);
                        const isSelected = selectedBadgeIds.includes(badge.id);
                        const metallicColors = getMetallicColors(badge.glow);

                        return (
                          <TouchableOpacity
                            key={badge.id}
                            style={[blStyles.cell, { marginRight: index === 2 ? 0 : 12 }]}
                            activeOpacity={0.75}
                            onPress={() => handleBadgePress(badge)}
                          >
                            {isEarned ? (
                              /* 획득한 메탈릭 코인 */
                              <View style={blStyles.coinWrapper}>
                                <LinearGradient
                                  colors={metallicColors}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 1, y: 1 }}
                                  style={blStyles.coinBorder}
                                >
                                  <LinearGradient
                                    colors={['#1E1B13', '#3A3525']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={blStyles.coinInner}
                                  >
                                    <Text style={blStyles.coinEmoji}>{badge.emoji}</Text>
                                  </LinearGradient>
                                </LinearGradient>
                                {/* 메탈릭 광택 */}
                                <LinearGradient
                                  colors={['rgba(255,255,255,0.4)', 'transparent', 'rgba(0,0,0,0.35)']}
                                  start={{ x: 0.1, y: 0.1 }}
                                  end={{ x: 0.9, y: 0.9 }}
                                  style={blStyles.coinShine}
                                  pointerEvents="none"
                                />
                                {/* 선택 체크 뱃지 */}
                                {isSelected && (
                                  <View style={[blStyles.checkBadge, { backgroundColor: skinAccent.accent }]}>
                                    <Text style={blStyles.checkText}>✓</Text>
                                  </View>
                                )}
                              </View>
                            ) : (
                              /* 미획득 구멍 */
                              <View style={blStyles.emptyHole}>
                                <LinearGradient
                                  colors={['#07070B', '#111116']}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 0, y: 1 }}
                                  style={blStyles.emptyHoleInner}
                                >
                                  <Text style={blStyles.lockIcon}>🔒</Text>
                                </LinearGradient>
                              </View>
                            )}
                            
                            <Text style={[blStyles.cellName, !isEarned && blStyles.lockedText]} numberOfLines={1}>
                              {badge.name}
                            </Text>
                            <Text style={[blStyles.cellDesc, !isEarned && blStyles.lockedText]} numberOfLines={2}>
                              {isEarned ? badge.desc : t('profile.unearnedBadge')}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </View>
              );
            })}
          </ScrollView>
        </View>

        <TouchableOpacity style={blStyles.closeBtn} onPress={handleClose} activeOpacity={0.8}>
          <Text style={blStyles.closeBtnText}>{t('common.close')}</Text>
        </TouchableOpacity>

        {/* 배지 확대 보기 오버레이 */}
        <Modal
          visible={enlargedBadge !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setEnlargedBadge(null)}
        >
          <TouchableOpacity
            style={blStyles.zoomBackdrop}
            accessibilityViewIsModal
            activeOpacity={1}
            onPress={() => setEnlargedBadge(null)}
          >
            {enlargedBadge && (() => {
              const isEarned = earnedBadgeIds.has(enlargedBadge.id);
              const metallicColors = getMetallicColors(enlargedBadge.glow);
              return (
                <TouchableOpacity activeOpacity={1} style={blStyles.zoomCard}>
                  {isEarned ? (
                    <View style={blStyles.zoomCoinWrapper}>
                      <LinearGradient
                        colors={metallicColors}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={blStyles.zoomCoinBorder}
                      >
                        <LinearGradient
                          colors={['#1E1B13', '#3A3525']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={blStyles.zoomCoinInner}
                        >
                          <Text style={blStyles.zoomCoinEmoji}>{enlargedBadge.emoji}</Text>
                        </LinearGradient>
                      </LinearGradient>
                      <LinearGradient
                        colors={['rgba(255,255,255,0.4)', 'transparent', 'rgba(0,0,0,0.35)']}
                        start={{ x: 0.1, y: 0.1 }}
                        end={{ x: 0.9, y: 0.9 }}
                        style={blStyles.zoomCoinShine}
                        pointerEvents="none"
                      />
                    </View>
                  ) : (
                    <View style={blStyles.zoomEmptyHole}>
                      <LinearGradient
                        colors={['#07070B', '#111116']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={blStyles.zoomEmptyHoleInner}
                      >
                        <Text style={blStyles.zoomLockIcon}>🔒</Text>
                      </LinearGradient>
                    </View>
                  )}
                  <Text style={blStyles.zoomName}>{isEarned ? enlargedBadge.name : t('profile.unearnedBadge')}</Text>
                  <Text style={blStyles.zoomDesc}>{isEarned ? enlargedBadge.desc : t('profile.unearnedBadgeDesc')}</Text>
                  {selectedBadgeIds.includes(enlargedBadge.id) && (
                    <View style={[blStyles.zoomSelectedTag, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.tint(0.5) }]}>
                      <Text style={[blStyles.zoomSelectedTagText, { color: skinAccent.accent }]}>{t('profile.shownOnProfile')}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })()}
          </TouchableOpacity>
        </Modal>
      </View>
    </Modal>
  );
}

// ─── 프로필 편집 모달 ───
function EditProfileModal({
  visible,
  currentName,
  currentPhoto,
  onSave,
  onClose,
}: {
  visible: boolean;
  currentName: string;
  currentPhoto: string | null;
  onSave: (name: string, photo: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  const [name, setName] = useState(currentName);
  const [photo, setPhoto] = useState<string | null>(currentPhoto);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showPermissionDeniedAlert(t('permission.gallery'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0].uri);
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert(t('profile.noticeTitle'), t('profile.nicknameRequired'));
      return;
    }
    onSave(name.trim(), photo);
    onClose();
  };

  // 모달이 열릴 때마다 현재 값으로 초기화
  React.useEffect(() => {
    if (visible) {
      setName(currentName);
      setPhoto(currentPhoto);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalRoot}
      >
        {/* 헤더 */}
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.modalCancelBtn}>
            <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{t('profile.editProfile')}</Text>
          <TouchableOpacity onPress={handleSave} style={styles.modalSaveBtn}>
            <Text style={styles.modalSaveText}>{t('editProfile.save')}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.modalContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 프로필 사진 */}
          <View style={styles.modalAvatarSection}>
            <TouchableOpacity onPress={pickImage} activeOpacity={0.8} style={styles.modalAvatarWrap}>
              {photo ? (
                <Image source={{ uri: photo }} style={[styles.modalAvatarImg, { borderColor: skinAccent.tint(0.5) }]} />
              ) : (
                <View style={[styles.modalAvatarPlaceholder, { borderColor: skinAccent.tint(0.5) }]}>
                  <PersonIcon size={50} color="#A0A0B0" />
                </View>
              )}
              {/* 편집 뱃지 */}
              <View style={styles.editBadge}>
                <Text style={styles.editBadgeText}>📷</Text>
              </View>
            </TouchableOpacity>
            <Text style={styles.modalAvatarHint}>{t('profile.avatarHint')}</Text>
          </View>

          {/* 닉네임 입력 */}
          <View style={styles.modalField}>
            <Text style={styles.modalFieldLabel}>{t('profile.nickname')}</Text>
            <View style={[styles.modalInputWrap, { borderColor: skinAccent.tint(0.3) }]}>
              <TextInput
                style={styles.modalInput}
                value={name}
                onChangeText={setName}
                placeholder={t('profile.nicknamePlaceholder')}
                placeholderTextColor={COLORS.textMuted}
                maxLength={20}
                autoCorrect={false}
              />
              <Text style={styles.modalCharCount}>{name.length}/20</Text>
            </View>
          </View>

          {/* 저장 버튼 (하단 대형) */}
          <TouchableOpacity style={styles.modalSaveLargeBtn} onPress={handleSave} activeOpacity={0.85}>
            <Text style={styles.modalSaveLargeText}>{t('profile.saveLarge')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── 사진 전체화면 뷰어 ───
function PhotoViewerModal({
  visible,
  photoUri,
  onClose,
}: {
  visible: boolean;
  photoUri: string;
  onClose: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const currentScale = useRef(1);
  const lastDistance = useRef(0);

  useEffect(() => {
    if (!visible) {
      currentScale.current = 1;
      scale.setValue(1);
    }
  }, [visible]);

  const getDistance = (touches: any[]) => {
    const [t1, t2] = touches;
    return Math.sqrt(
      Math.pow(t2.pageX - t1.pageX, 2) + Math.pow(t2.pageY - t1.pageY, 2)
    );
  };

  const pinchResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        if (evt.nativeEvent.touches.length === 2) {
          lastDistance.current = getDistance([...evt.nativeEvent.touches]);
        }
      },
      onPanResponderMove: (evt) => {
        if (evt.nativeEvent.touches.length === 2) {
          const dist = getDistance([...evt.nativeEvent.touches]);
          if (lastDistance.current > 0) {
            const ratio = dist / lastDistance.current;
            const next = Math.max(1, Math.min(4, currentScale.current * ratio));
            currentScale.current = next;
            scale.setValue(next);
          }
          lastDistance.current = dist;
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        lastDistance.current = 0;
        if (currentScale.current < 1) {
          currentScale.current = 1;
          Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={pvStyles.container} accessibilityViewIsModal>
        {/* 배경 탭으로 닫기 */}
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        {/* 이미지 (핀치 줌) */}
        <View
          style={[pvStyles.imageWrap, { width: SCREEN_W, height: SCREEN_H }]}
          {...pinchResponder.panHandlers}
        >
          <Animated.Image
            source={{ uri: photoUri }}
            style={[pvStyles.image, { width: SCREEN_W, height: SCREEN_H, transform: [{ scale }] }]}
            resizeMode="contain"
          />
        </View>
        {/* X 버튼 */}
        <TouchableOpacity style={pvStyles.closeBtn} onPress={onClose}>
          <Text style={pvStyles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── 아바타 액션 시트 ───
function AvatarActionSheet({
  visible,
  hasPhoto,
  onClose,
  onViewPhoto,
  onChangePhoto,
  onDeletePhoto,
}: {
  visible: boolean;
  hasPhoto: boolean;
  onClose: () => void;
  onViewPhoto: () => void;
  onChangePhoto: () => void;
  onDeletePhoto: () => void;
}) {
  const { t } = useTranslation();
  const translateY = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 12,
      }).start();
    } else {
      translateY.setValue(500);
    }
  }, [visible]);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={asStyles.overlay}>
        {/* 배경 탭으로 닫기 */}
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        {/* 바텀시트 */}
        <Animated.View style={[asStyles.sheet, { transform: [{ translateY }] }]}>
          {/* 핸들 바 */}
          <View style={asStyles.handle} />

          {/* 옵션 카드 */}
          <View style={asStyles.optionsCard}>
            {hasPhoto && (
              <>
                <TouchableOpacity
                  style={asStyles.option}
                  activeOpacity={0.7}
                  onPress={onViewPhoto}
                >
                  <Text style={asStyles.optionIcon}>📷</Text>
                  <Text style={asStyles.optionText}>{t('profile.viewPhoto')}</Text>
                </TouchableOpacity>
                <View style={asStyles.divider} />
              </>
            )}
            <TouchableOpacity
              style={asStyles.option}
              activeOpacity={0.7}
              onPress={onChangePhoto}
            >
              <Text style={asStyles.optionIcon}>✏️</Text>
              <Text style={asStyles.optionText}>{t('profile.changePhoto')}</Text>
            </TouchableOpacity>
            {hasPhoto && (
              <>
                <View style={asStyles.divider} />
                <TouchableOpacity
                  style={asStyles.option}
                  activeOpacity={0.7}
                  onPress={onDeletePhoto}
                >
                  <Text style={asStyles.optionIcon}>🗑️</Text>
                  <Text style={[asStyles.optionText, asStyles.deleteText]}>{t('profile.deletePhoto')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* 취소 카드 */}
          <TouchableOpacity style={asStyles.cancelCard} activeOpacity={0.7} onPress={onClose}>
            <Text style={asStyles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── 드래그 핸들 ───
function DragHandle({
  onStart,
  onMove,
  onEnd,
}: {
  onStart: () => void;
  onMove: (dy: number) => void;
  onEnd: (dy: number) => void;
}) {
  const cbRef = useRef({ onStart, onMove, onEnd });
  cbRef.current = { onStart, onMove, onEnd };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => cbRef.current.onStart(),
      onPanResponderMove: (_, { dy }) => cbRef.current.onMove(dy),
      onPanResponderRelease: (_, { dy }) => cbRef.current.onEnd(dy),
      onPanResponderTerminate: (_, { dy }) => cbRef.current.onEnd(dy),
    })
  ).current;
  return (
    <View {...pan.panHandlers} style={orderSt.handle}>
      <Text style={orderSt.handleIcon}>⠿</Text>
    </View>
  );
}

// ─── 순서 조정 리스트 ───
const ITEM_H = 64;
type TripItem = { id: string; emoji: string; country: string; color: string; viewType: string };

function OrderableList({
  records,
  onReorder,
}: {
  records: TripItem[];
  onReorder: (newRecords: TripItem[]) => void;
}) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const dragOffset = useRef(new Animated.Value(0)).current;
  const activeIdxRef = useRef<number | null>(null);
  const recordsRef = useRef(records);
  recordsRef.current = records;

  const handleDragStart = (idx: number) => {
    activeIdxRef.current = idx;
    setActiveIdx(idx);
    dragOffset.setValue(0);
  };

  const handleDragMove = (idx: number, dy: number) => {
    if (activeIdxRef.current !== idx) return;
    dragOffset.setValue(dy);
  };

  const handleDragEnd = (idx: number, dy: number) => {
    if (activeIdxRef.current !== idx) return;
    const recs = recordsRef.current;
    const newIdx = Math.max(0, Math.min(recs.length - 1, idx + Math.round(dy / ITEM_H)));
    if (newIdx !== idx) {
      const newOrder = [...recs];
      const [removed] = newOrder.splice(idx, 1);
      newOrder.splice(newIdx, 0, removed);
      onReorder(newOrder);
    }
    activeIdxRef.current = null;
    setActiveIdx(null);
    dragOffset.setValue(0);
  };

  return (
    <View>
      {records.map((record, idx) => {
        const isActive = activeIdx === idx;
        return (
          <Animated.View
            key={record.id}
            style={[
              orderSt.item,
              isActive && {
                opacity: 0.85,
                transform: [{ translateY: dragOffset }, { scale: 1.02 }],
                zIndex: 10,
                elevation: 6,
              },
            ]}
          >
            <Text style={orderSt.emoji}>{record.emoji}</Text>
            <View style={orderSt.info}>
              <Text style={orderSt.name}>{record.country}</Text>
            </View>
            <DragHandle
              onStart={() => handleDragStart(idx)}
              onMove={(dy) => handleDragMove(idx, dy)}
              onEnd={(dy) => handleDragEnd(idx, dy)}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}



// ─── 여행 기록 그리드 레이아웃 좌표 계산 유틸 ───
function getCardLayout(idx: number): { x: number; y: number; w: number; h: number } {
  if (idx === 0) {
    return { x: 0, y: 0, w: SCREEN_WIDTH - 32, h: 260 };
  }
  const gridIdx = idx - 1;
  const row = Math.floor(gridIdx / 2);
  const col = gridIdx % 2;
  const cardW = THUMB_WIDTH;
  const cardH = 210;
  const gap = 12;
  const x = col * (cardW + gap);
  const y = 260 + 12 + row * (cardH + gap);
  return { x, y, w: cardW, h: cardH };
}

// ─── 인라인 카드 드래그 제스처 래핑 컴포넌트 ───
interface DraggableCardWrapperProps {
  idx: number;
  activeIdx: number | null;
  hoverIdx: number | null;
  dragOffset: Animated.ValueXY;
  dragScale: Animated.Value;
  onDragStart: (idx: number) => void;
  onDragMove: (idx: number, dx: number, dy: number) => void;
  onDragEnd: (idx: number, dx: number, dy: number) => void;
  onPress: () => void;
  children: React.ReactNode;
  style: any;
}

function DraggableCardWrapper({
  idx,
  activeIdx,
  hoverIdx,
  dragOffset,
  dragScale,
  onDragStart,
  onDragMove,
  onDragEnd,
  onPress,
  children,
  style,
}: DraggableCardWrapperProps) {
  const isDraggingRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  // 최신 idx·콜백을 항상 참조 — 카드 추가/재정렬로 idx가 바뀌어도 stale 클로저 방지
  // (PanResponder는 첫 렌더에 한 번만 생성되므로 직접 캡처하면 옛 값이 박제된다)
  const cbRef = useRef({ idx, onDragStart, onDragMove, onDragEnd, onPress });
  cbRef.current = { idx, onDragStart, onDragMove, onDragEnd, onPress };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => isDraggingRef.current,
      onPanResponderGrant: (evt, gestureState) => {
        isDraggingRef.current = false;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          isDraggingRef.current = true;
          cbRef.current.onDragStart(cbRef.current.idx);
        }, 400);
      },
      onPanResponderMove: (evt, gestureState) => {
        if (isDraggingRef.current) {
          cbRef.current.onDragMove(cbRef.current.idx, gestureState.dx, gestureState.dy);
        } else {
          if (Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10) {
            if (timerRef.current) {
              clearTimeout(timerRef.current);
              timerRef.current = null;
            }
          }
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          cbRef.current.onDragEnd(cbRef.current.idx, gestureState.dx, gestureState.dy);
        } else {
          cbRef.current.onPress();
        }
      },
      onPanResponderTerminate: (evt, gestureState) => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          cbRef.current.onDragEnd(cbRef.current.idx, gestureState.dx, gestureState.dy);
        }
      },
      onPanResponderTerminationRequest: () => !isDraggingRef.current,
    })
  ).current;

  const isActive = activeIdx === idx;
  // 드래그 중인 카드가 이 카드 위에 올라온 상태 → "여기로 바뀐다"는 신호를 준다
  const isHoverTarget = activeIdx !== null && activeIdx !== idx && hoverIdx === idx;

  // 호버 반응 애니메이션 (0 → 1 스프링)
  const hoverAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(hoverAnim, {
      toValue: isHoverTarget ? 1 : 0,
      useNativeDriver: false,
      friction: 7,
      tension: 130,
    }).start();
  }, [isHoverTarget]);

  // 카드 모서리 반경을 그대로 따와 링 오버레이가 카드와 정확히 겹치게 한다
  const cornerRadius = StyleSheet.flatten(style)?.borderRadius ?? 24;
  const hoverScale = hoverAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.95] });

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        style,
        !isActive && { transform: [{ scale: hoverScale }] },
        isActive && {
          transform: [
            { translateX: dragOffset.x },
            { translateY: dragOffset.y },
            { scale: dragScale },
          ],
          zIndex: 1000,
          elevation: 12,
          shadowColor: '#BF85FC',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.5,
          shadowRadius: 20,
        },
      ]}
    >
      {children}
      {/* 드롭 대상 표시 — 유리에 빛이 닿은 듯 리퀴드 글래스 질감을 밝힌다 */}
      {!isActive && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: cornerRadius,
            borderWidth: 1.5,
            borderColor: 'rgba(255,255,255,0.7)',
            overflow: 'hidden',
            opacity: hoverAnim,
          }}
        >
          {/* 유리 안쪽 밝기 상승 (위→아래) */}
          <LinearGradient
            colors={[GLASS.innerTop, 'rgba(255,255,255,0.02)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* 좌상단 스페큘러 — 유리에 빛이 닿는 하이라이트 */}
          <LinearGradient
            colors={[GLASS.specular, 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.75, y: 0.75 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '60%' }}
          />
        </Animated.View>
      )}
    </Animated.View>
  );
}

// ─── 병합 모드 카드 오버레이 — 선택 시 네온 테두리 + 우상단 뱃지(대표/순번), 미선택 시 빈 원 ───
function MergeSelectOverlay({ order, radius, primaryLabel }: { order: number; radius: number; primaryLabel: string }) {
  const selected = order >= 0;
  const skinAccent = useSkinAccent();
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { borderRadius: radius },
        selected && { borderWidth: 2.5, borderColor: skinAccent.accent },
      ]}
    >
      <View style={[mergeSt.badge, !selected && mergeSt.badgeIdle]}>
        {selected && <Text style={mergeSt.badgeTxt}>{order === 0 ? primaryLabel : String(order + 1)}</Text>}
      </View>
    </View>
  );
}

// ─── 묶음 설정 모달 ───
function GroupMergeModal({
  visible,
  selectedRecords,
  onClose,
  onSave,
}: {
  visible: boolean;
  selectedRecords: TripItem[];
  onClose: () => void;
  onSave: (title: string, coverRecordId: string, ordered: TripItem[]) => void;
}) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  const [title, setTitle] = useState('');
  const [cover, setCover] = useState(selectedRecords[0]?.id ?? '');
  const [ordered, setOrdered] = useState<TripItem[]>([...selectedRecords]);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setCover(selectedRecords[0]?.id ?? '');
      setOrdered([...selectedRecords]);
    }
  }, [visible]);

  const handleSave = () => {
    if (!title.trim()) {
      Alert.alert(t('profile.noticeTitle'), t('profile.groupNameRequired'));
      return;
    }
    onSave(title.trim(), cover, ordered);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={gmSt.sheet}>
          <View style={gmSt.handle} />
          <Text style={gmSt.sheetTitle}>{t('profile.groupSettings')}</Text>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* 묶음 제목 */}
            <Text style={[gmSt.sectionLabel, { color: skinAccent.accent }]}>{t('profile.groupTitle')}</Text>
            <View style={gmSt.inputWrap}>
              <TextInput
                style={gmSt.input}
                value={title}
                onChangeText={setTitle}
                placeholder={t('profile.groupTitlePlaceholder')}
                placeholderTextColor={COLORS.textMuted}
                maxLength={30}
              />
            </View>
            <Text style={gmSt.inputHint}>{t('profile.groupTitleHint')}</Text>

            {/* 대표 기록 선택 */}
            <Text style={[gmSt.sectionLabel, { color: skinAccent.accent }]}>{t('profile.groupCover')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={gmSt.coverScroll}
              contentContainerStyle={gmSt.coverContent}
              nestedScrollEnabled
            >
              {ordered.map((record) => (
                <TouchableOpacity
                  key={record.id}
                  style={gmSt.coverThumb}
                  onPress={() => setCover(record.id)}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      gmSt.thumbBg,
                      { backgroundColor: record.color },
                      cover === record.id && { borderColor: skinAccent.accent },
                    ]}
                  >
                    <Text style={gmSt.thumbEmoji}>{record.emoji}</Text>
                    {cover === record.id && (
                      <View style={[gmSt.coverCheckBadge, { backgroundColor: skinAccent.accent }]}>
                        <Text style={gmSt.coverCheckText}>✓</Text>
                      </View>
                    )}
                  </View>
                  <Text style={gmSt.thumbLabel} numberOfLines={1}>
                    {record.country.split(' ').slice(1).join(' ')}
                  </Text>
                  {cover !== record.id && (
                    <Text style={[gmSt.setAsLabel, { color: skinAccent.accent }]}>{t('profile.setAsCover')}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* 기록 순서 조정 */}
            <Text style={[gmSt.sectionLabel, { color: skinAccent.accent }]}>{t('profile.recordOrder')}</Text>
            <OrderableList records={ordered} onReorder={setOrdered} />

            {/* 저장 */}
            <TouchableOpacity style={gmSt.saveBtn} onPress={handleSave} activeOpacity={0.85}>
              <Text style={gmSt.saveBtnText}>{t('profile.saveLarge')}</Text>
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// 국가코드(ISO2) → {이름, 국기} — 공용 COUNTRIES 전체에서 생성 (일부 국가만 있던 데모 맵 대체)
const COUNTRY_DATA: Record<string, { name: string; flag: string }> = COUNTRIES.reduce(
  (acc, c) => {
    acc[c.term.split(' ')[0].toUpperCase()] = { name: c.name, flag: c.flag };
    return acc;
  },
  {} as Record<string, { name: string; flag: string }>,
);

// ─── 메인 프로필 화면 ───
// pushed: 소셜에서 내 아이디를 눌러 스택으로 푸시된 경우 — 좌상단을 뒤로가기로, 우상단 설정은 비운다.
type ProfileScreenProps = TabScreenProps<'ProfileTab'> & { pushed?: boolean; onBack?: () => void };
export default function ProfileScreen({ navigation, route, pushed, onBack }: ProfileScreenProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const skinAccent = useSkinAccent(); // 섹션 링크·부제 등 강조를 스킨색으로
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [badgeListVisible, setBadgeListVisible] = useState(false);

  // ── 프로필 튜토리얼(코치마크) — 계정당 프로필 탭 첫 진입 시 1회 ──
  const avatarRef = useRef<any>(null);
  const badgeRef = useRef<any>(null);
  const archiveRef = useRef<any>(null);
  const [coachVisible, setCoachVisible] = useState(false);
  const [coachSteps, setCoachSteps] = useState<CoachStep[]>([]);
  const tutorialStarted = useRef(false); // 같은 세션에서 포커스마다 재실행 방지

  // 튜토리얼 중에는 탭 바도 함께 어둡게 처리되도록 전역 신호 동기화.
  useEffect(() => {
    setCoachActive(coachVisible);
    return () => setCoachActive(false);
  }, [coachVisible]);

  const measureRect = (ref: React.MutableRefObject<any>) =>
    new Promise<CoachRect | null>((resolve) => {
      const node = ref.current;
      if (!node || typeof node.measureInWindow !== 'function') return resolve(null);
      node.measureInWindow((x: number, y: number, width: number, height: number) => {
        if ([x, y, width, height].some((v) => typeof v !== 'number' || Number.isNaN(v))) resolve(null);
        else resolve({ x, y, width, height });
      });
    });

  useFocusEffect(
    useCallback(() => {
      if (tutorialStarted.current) return;
      tutorialStarted.current = true;
      let cancelled = false;
      (async () => {
        const uid = (await getMyUserId().catch(() => null)) || 'guest';
        const key = `${PROFILE_TUTORIAL_KEY}:${uid}`;
        const seen = await AsyncStorage.getItem(key).catch(() => null);
        if (seen || cancelled) return;
        setTimeout(async () => {
          if (cancelled) return;
          const [avatar, badge, archive] = await Promise.all([
            measureRect(avatarRef),
            measureRect(badgeRef),
            measureRect(archiveRef),
          ]);
          // 아바타는 원형이라 원형 스포트라이트로 강조
          const avatarCircle = avatar
            ? { cx: avatar.x + avatar.width / 2, cy: avatar.y + avatar.height / 2, r: Math.max(avatar.width, avatar.height) / 2 + 4 }
            : undefined;
          // 배지 강조 링은 배지(글로우 포함)를 넉넉히 감싸도록 측정값을 확장(특히 세로 여유).
          const badgeRect: CoachRect | null = badge
            ? { x: badge.x - 4, y: badge.y - 12, width: badge.width + 8, height: badge.height + 24 }
            : null;
          // 여행 기록 강조 링도 동일하게 넉넉히 확장.
          const archiveRect: CoachRect | null = archive
            ? { x: archive.x - 4, y: archive.y - 12, width: archive.width + 8, height: archive.height + 24 }
            : null;
          setCoachSteps([
            {
              rect: null,
              title: t('profile.coach1Title'),
              desc: t('profile.coach1Desc'),
            },
            {
              rect: avatar,
              shape: 'circle',
              circleWin: avatarCircle,
              tipBelow: true, // 아바타는 화면 상단이라 말풍선을 아래쪽에 둬 가리지 않게
              title: t('profile.coach2Title'),
              desc: t('profile.coach2Desc'),
            },
            {
              rect: badgeRect,
              title: t('profile.coach3Title'),
              desc: t('profile.coach3Desc'),
            },
            {
              rect: archiveRect,
              title: t('profile.coach4Title'),
              desc: t('profile.coach4Desc'),
            },
          ]);
          setCoachVisible(true);
          AsyncStorage.setItem(key, '1').catch(() => {});
        }, 450);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  // 배지 획득 토스트를 누르면 openBadgeList 파라미터로 진입 → 배지 리스트 모달 자동 열기(1회).
  useEffect(() => {
    if (route.params?.openBadgeList) {
      setBadgeListVisible(true);
      navigation.setParams({ openBadgeList: undefined });
    }
  }, [route.params?.openBadgeList]);
  // 프로필에 표시할 대표 배지는 settingsStore에서 영속 관리(selectedBadgeIds/setSelectedBadgeIds로 별칭).
  // 저장된 값이 없을 때만 '획득한' 배지 중 앞 5개로 1회 자동 채운다(아래 effect).
  const didSeedBadgesRef = useRef(false);

  // ─── 여행 기록 순서 편집 상태 ───
  const [trips, setTrips] = useState<TripThumbnail[]>(() => {
    return [...CURRENT_TRIP_THUMBNAILS];
  });
  const [isDragging, setIsDragging] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  // 화면 이탈 시 드래그로 숨긴 탭 바가 남지 않게 안전 복원
  useEffect(() => () => setTabBarHidden(false), []);
  // 카드 표시 순서(id 배열) — 드래그 재정렬은 이 순서만 갱신한다
  const cardOrder = useCardOrder(); // 공유 스토어 — 다른 인스턴스의 재정렬도 즉시 반영
  // ─── 여행 카드 합치기(병합 모드) — 탭 순서 유지, 첫 번째로 선택한 카드가 대표 ───
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelected, setMergeSelected] = useState<string[]>([]);
  const dragOffset = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const dragScale = useRef(new Animated.Value(1)).current;
  // 현재 드래그 카드가 올라가 있는 대상 카드 인덱스 (그 카드가 네온 링으로 반응)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const hoverIdxRef = useRef<number | null>(null);

  // 드롭 중심 좌표가 어느 카드 슬롯 위에 있는지 찾는다 (-1이면 없음)
  const findTargetIdx = (idx: number, dx: number, dy: number) => {
    const layout = getCardLayout(idx);
    const cx = layout.x + layout.w / 2 + dx;
    const cy = layout.y + layout.h / 2 + dy;
    for (let i = 0; i < displayTrips.length; i++) {
      const t = getCardLayout(i);
      if (cx >= t.x && cx <= t.x + t.w && cy >= t.y && cy <= t.y + t.h) {
        return i;
      }
    }
    return -1;
  };

  // 드롭/제자리 복귀 시 카드를 부드럽게 정착시키는 리퀴드 스프링
  const settle = (onDone?: () => void) => {
    Animated.parallel([
      Animated.spring(dragOffset, {
        toValue: { x: 0, y: 0 },
        useNativeDriver: false,
        friction: 7,
        tension: 65,
      }),
      Animated.spring(dragScale, {
        toValue: 1,
        useNativeDriver: false,
        friction: 7,
        tension: 65,
      }),
    ]).start(({ finished }) => {
      if (finished) onDone?.();
    });
  };

  const handleDragStart = (idx: number) => {
    if (mergeMode) return; // 병합 모드 중엔 순서 변경 드래그 비활성
    // 진행 중인 정착 애니메이션이 있으면 멈추고 새 드래그 시작
    dragOffset.stopAnimation();
    dragScale.stopAnimation();
    hoverIdxRef.current = null;
    setHoverIdx(null);
    setActiveIdx(idx);
    dragOffset.setValue({ x: 0, y: 0 });
    // 카드가 톡 튀지 않고 부드럽게 떠오르도록 스케일을 스프링으로 확대
    Animated.spring(dragScale, {
      toValue: 1.05,
      useNativeDriver: false,
      friction: 6,
      tension: 140,
    }).start();
    setIsDragging(true);
    // 드래그(순서 변경) 동안 하단 탭 바 잠시 숨김 — 하단 카드 이동 시 가리지 않게
    setTabBarHidden(true);
  };

  const handleDragMove = (idx: number, dx: number, dy: number) => {
    if (mergeMode) return;
    dragOffset.setValue({ x: dx, y: dy });
    // 현재 올라가 있는 대상 카드를 갱신 (경계를 넘을 때만 setState → 매 프레임 리렌더 방지)
    const target = findTargetIdx(idx, dx, dy);
    const hv = target !== -1 && target !== idx ? target : null;
    if (hoverIdxRef.current !== hv) {
      hoverIdxRef.current = hv;
      setHoverIdx(hv);
    }
  };

  const handleDragEnd = (idx: number, dx: number, dy: number) => {
    if (mergeMode) return;
    setIsDragging(false);
    setTabBarHidden(false);
    hoverIdxRef.current = null;
    setHoverIdx(null);

    const targetIdx = findTargetIdx(idx, dx, dy);

    if (targetIdx !== -1 && targetIdx !== idx) {
      // displayTrips(병합된 전체 목록) 기준으로 순서를 재배열하고 id 순서만 저장한다.
      // → mappedThumbnails(컨텍스트) 카드와 메인 카드도 자유롭게 이동 가능
      const newOrder = [...displayTrips];
      const [removed] = newOrder.splice(idx, 1);
      newOrder.splice(targetIdx, 0, removed);
      const ids = newOrder.map((t) => t.id);

      // 이웃 카드들은 LayoutAnimation으로 새 위치까지 출렁이며 이동,
      // 끌던 카드는 새 자리(targetIdx)에서 손가락 위치 → 슬롯으로 스프링 정착
      LayoutAnimation.configureNext(LIQUID_LAYOUT);
      setCardOrder(ids);
      setActiveIdx(targetIdx);
      settle(() => setActiveIdx(null));
    } else {
      // 유효한 대상이 없으면 원래 자리로 부드럽게 복귀
      settle(() => setActiveIdx(null));
    }
  };

  const {
    handle,
    bio,
    profilePhoto,
    setProfilePhoto,
    homeCountryCode,
    arrivalDetect,
    currentVisitedCountryCode,
    setCurrentVisitedCountryCode,
    representativeBadgeIds: selectedBadgeIds,
    setRepresentativeBadgeIds: setSelectedBadgeIds,
    badgeEarnedAt,
    handleFont,
    isPremium,
    notifPrefs,
  } = useSettings();
  const profileName = handle; // 디자인(iPhone 17-52)과 동일하게 아이디를 @ 없이 그대로 표시
  // 아이디 표시 폰트(프리미엄) — 해지 시 기본 폰트로(잠금), 선택값은 보존돼 재구독 시 복원
  const nameFontStyle = handleFontStyle(isPremium ? handleFont : null);

  // 현재 위치(국가)를 실제로 감지해 '여행 중' 상태를 갱신 — 감지 안 되면 거주국으로(허위 여행 표시 방지)
  // 알림 마스터 토글도 함께 검사 — 설정 화면은 마스터 OFF 시 도착 감지를 꺼진 것으로 표시하므로
  // 실제 동작도 일치시키고, 꺼질 때는 '여행 중' 표시를 거주국으로 되돌린다.
  useEffect(() => {
    if (!arrivalDetect || !notifPrefs.master) {
      setCurrentVisitedCountryCode(homeCountryCode);
      return;
    }
    let cancelled = false;
    (async () => {
      const { countryCode } = await detectCurrentCountry();
      if (cancelled) return;
      setCurrentVisitedCountryCode(countryCode ? countryCode.toUpperCase() : homeCountryCode);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivalDetect, notifPrefs.master, homeCountryCode]);

  const { records, tripGroups, archivedIds, followingUsers, mergeTripGroups } = useRecords();

  // 팔로워 수 — 백엔드(supabase)에서 로드. 미연결 시 0.
  const [followerCount, setFollowerCount] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      const uid = await getMyUserId();
      if (uid && alive) setFollowerCount(await fetchFollowerCount(uid));
    })();
    return () => { alive = false; };
  }, []);

  // 배지 판정·획득은 전역 BadgeEvaluator가 담당한다. 여기선 '표시'만:
  //  - 획득 집합은 영구 저장된 badgeEarnedAt에서 읽는다(중복 계산 제거).
  const earnedBadgeIds = useMemo(
    () => new Set<number>(Object.keys(badgeEarnedAt).map(Number)),
    [badgeEarnedAt]
  );

  // 대표 배지 기본값: 저장된 선택이 없을 때만 획득 배지 중 앞 5개로 최초 1회 채운다.
  // (이미 저장된 사용자 선택은 절대 덮어쓰지 않음)
  useEffect(() => {
    if (didSeedBadgesRef.current) return;
    didSeedBadgesRef.current = true;
    if (selectedBadgeIds.length > 0) return; // 영속 복원된 선택이 있으면 시드하지 않음
    const defaults = BADGES.filter((b) => earnedBadgeIds.has(b.id)).slice(0, 5).map((b) => b.id);
    if (defaults.length > 0) setSelectedBadgeIds(defaults);
  }, [earnedBadgeIds, selectedBadgeIds, setSelectedBadgeIds]);

  const mappedThumbnails = useMemo(() => {
    return tripGroups.map(group => {
      const groupRecords = group.records
        .map(id => records.find(r => r.id === id))
        .filter(Boolean)
        // 보관된 기록은 카드에서 제외 → 전부 보관되면 카드 자체가 숨겨진다
        .filter(r => !archivedIds.includes((r as NonNullable<typeof r>).id)) as typeof records;

      const firstRec = groupRecords[0];
      const coverRec = groupRecords.find(r => r.id === group.coverRecordId) ?? firstRec;
      const uniqueViewTypes = Array.from(new Set(groupRecords.map(r => r.viewType || 'feed')));

      // 카드가 `${countryFlag} ${title}`로 그리므로, 제목에 이미 국기가 박혀 있으면 떼어낸다
      // (과거에 "🇺🇸 미국 여행" 형식으로 저장된 그룹 대비 방어)
      const flag = group.countryFlag || firstRec?.countryFlag || '';
      const title = flag && group.title.startsWith(flag)
        ? group.title.slice(flag.length).trim()
        : group.title;

      // 다국가 분할 카드: 그룹에 표시 오버라이드(국가·커버·날짜)가 있으면 기록 값 대신 사용
      const groupDate = group.date ?? firstRec?.date;
      return {
        id: group.id,
        emoji: firstRec?.user.emoji || '🗼',
        title,
        country: group.countryName || firstRec?.countryName || '',
        countryFlag: flag,
        date: groupDate ? groupDate.slice(0, 7) : '',
        color: TRIP_GRADIENT_COLORS[group.id] ? group.id : 'trip-japan',
        records: groupRecords.map(r => ({ id: r.id, viewType: r.viewType || 'feed' })),
        uniqueViewTypes,
        coverUri: group.coverUri ?? coverRec?.representativePhoto ?? coverRec?.medias?.[0], // 오버라이드 → 크롭본 → 썸네일 순
      };
    }).filter(t => t.records.length > 0);
  }, [tripGroups, records, archivedIds]);

  // import/기록 기반 여행 카드(mappedThumbnails)를 맨 앞에 병합
  // → 새로 만든 카드가 기본으로 큰 메인 카드 자리를 차지하고, 기존 카드는 그리드로 밀린다
  const baseTrips = useMemo(
    () => [...mappedThumbnails, ...trips],
    [mappedThumbnails, trips]
  );

  // 사용자가 드래그로 지정한 순서(cardOrder)대로 정렬.
  // cardOrder에 없는(새로 만든) 카드는 맨 앞으로 → 메인 카드 자리를 차지한다.
  const displayTrips = useMemo(() => {
    if (cardOrder.length === 0) return baseTrips;
    const orderIndex = new Map(cardOrder.map((id, i) => [id, i] as const));
    return [...baseTrips].sort((a, b) => {
      const ia = orderIndex.has(a.id) ? (orderIndex.get(a.id) as number) : -1;
      const ib = orderIndex.has(b.id) ? (orderIndex.get(b.id) as number) : -1;
      return ia - ib;
    });
  }, [baseTrips, cardOrder]);

  // ─── 여행 카드 합치기 (병합 모드) ───
  // tripGroups 기반 카드만 합칠 수 있다 (legacy 더미 카드는 그룹 데이터가 없음)
  const mergeableIds = useMemo(() => new Set(tripGroups.map((g) => g.id)), [tripGroups]);

  const toggleMergeSelect = (id: string) => {
    if (!mergeableIds.has(id)) return;
    setMergeSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const exitMergeMode = () => {
    setMergeMode(false);
    setMergeSelected([]);
  };

  const confirmMerge = () => {
    const [targetId, ...sourceIds] = mergeSelected;
    const target = displayTrips.find((tr) => tr.id === targetId);
    if (!target || sourceIds.length === 0) return;
    Alert.alert(
      t('profile.mergeConfirmTitle'),
      t('profile.mergeConfirmMsg', { count: mergeSelected.length, title: `${target.countryFlag} ${target.title}`.trim() }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.mergeAction'),
          style: 'destructive',
          onPress: () => {
            LayoutAnimation.configureNext(LIQUID_LAYOUT);
            mergeTripGroups(targetId, sourceIds);
            // 드래그 순서 목록에서 사라진 카드 id 정리
            if (cardOrder.length > 0) {
              const ids = cardOrder.filter((id) => !sourceIds.includes(id));
                      setCardOrder(ids);
            }
            exitMergeMode();
            emitToast(t('profile.mergeDone'));
          },
        },
      ]
    );
  };

  const handleChangePhoto = async () => {
    setActionSheetVisible(false);

    // 권한 확인
    const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      if (!canAskAgain) {
        // 권한이 영구적으로 거부된 경우 → 설정 화면으로 유도
        Alert.alert(
          t('profile.galleryPermTitle'),
          t('profile.galleryPermMsg'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('profile.goToSettings'),
              onPress: () => Linking.openSettings(),
            },
          ]
        );
      } else {
        Alert.alert(t('profile.permNeededTitle'), t('profile.permNeededMsg'));
      }
      return;
    }

    // 갤러리 열기 (사진 유무와 관계없이 동일 흐름)
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setProfilePhoto(result.assets[0].uri);
    }
  };

  const handleDeletePhoto = () => {
    setActionSheetVisible(false);
    Alert.alert(
      t('profile.deletePhotoTitle'),
      t('profile.deletePhotoMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.delete'),
          style: 'destructive',
          onPress: () => setProfilePhoto(null),
        },
      ]
    );
  };

  const handleViewPhoto = () => {
    setActionSheetVisible(false);
    setTimeout(() => setPhotoViewerVisible(true), 150);
  };

  const openTripDetail = (trip: TripThumbnail) => {
    navigation.navigate('TripDetail', { trip });
  };


  return (
    <View style={styles.safeArea}>
      {/* 별 배경 (Stars.svg) — 콘텐츠 뒤에 깔린다. 다른 배경 요소(블롭·오로라 그라데이션)는 제거됨 */}
      <StarFieldBackground />

      <ScrollView
        style={[styles.container, { backgroundColor: 'transparent' }]}
        contentContainerStyle={[styles.content, { paddingBottom: 110 }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!isDragging}
      >
        {/* 상단 헤더 — 소셜에서 푸시된 내 프로필이면 좌:뒤로가기 / 우:빈칸, 아니면 로고+설정 */}
        {pushed ? (
          <View style={[styles.headerRow, { paddingTop: insets.top + 11, paddingLeft: 12 }]}>
            <TouchableOpacity
              onPress={() => (onBack ? onBack() : navigation.goBack())}
              style={styles.settingBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('friends.back')}
            >
              <Text style={styles.backIcon}>‹</Text>
            </TouchableOpacity>
            {/* 우상단 설정 자리 — 비워둠(레이아웃 유지용 플레이스홀더) */}
            <View style={styles.settingBtn} />
          </View>
        ) : (
        <View style={[styles.headerRow, { paddingTop: insets.top + 11 }]}>
          <Svg width={116} height={47} viewBox="0 0 116 47" fill="none">
            <Path
              d="M12.7309 14.6189C15.1149 14.6189 17.1056 15.5249 18.7029 17.3367C20.3241 19.1248 21.1347 21.3658 21.1347 24.0598C21.1347 26.7538 20.3241 29.0067 18.7029 30.8186C17.1056 32.6066 15.1149 33.5007 12.7309 33.5007C10.5614 33.5007 8.8687 32.7854 7.65283 31.355V40.1522H1.71652V15.1196H7.65283V16.7646C8.8687 15.3341 10.5614 14.6189 12.7309 14.6189ZM8.68989 26.8849C9.38127 27.6001 10.2872 27.9577 11.4077 27.9577C12.5282 27.9577 13.4342 27.6001 14.1255 26.8849C14.8169 26.1697 15.1626 25.228 15.1626 24.0598C15.1626 22.8916 14.8169 21.9499 14.1255 21.2347C13.4342 20.5195 12.5282 20.1618 11.4077 20.1618C10.2872 20.1618 9.38127 20.5195 8.68989 21.2347C7.99851 21.9499 7.65283 22.8916 7.65283 24.0598C7.65283 25.228 7.99851 26.1697 8.68989 26.8849ZM30.727 18.4453C31.0607 17.2771 31.7283 16.3712 32.7296 15.7275C33.7309 15.0838 34.8514 14.762 36.0911 14.762V21.342C34.7322 21.1274 33.4925 21.3777 32.372 22.0929C31.2753 22.8082 30.727 23.9763 30.727 25.5975V33H24.7907V15.1196H30.727V18.4453ZM47.6494 33.5007C45.0031 33.5007 42.7502 32.5947 40.8906 30.7828C39.031 28.9471 38.1012 26.7061 38.1012 24.0598C38.1012 21.4135 39.031 19.1844 40.8906 17.3725C42.7502 15.5368 45.0031 14.6189 47.6494 14.6189C50.3195 14.6189 52.5725 15.5368 54.4082 17.3725C56.2678 19.1844 57.1976 21.4135 57.1976 24.0598C57.1976 26.7061 56.2678 28.9471 54.4082 30.7828C52.5725 32.5947 50.3195 33.5007 47.6494 33.5007ZM47.6494 27.7789C48.6984 27.7789 49.5566 27.4332 50.2242 26.7418C50.9156 26.0505 51.2612 25.1564 51.2612 24.0598C51.2612 22.9631 50.9156 22.0691 50.2242 21.3777C49.5566 20.6863 48.6984 20.3407 47.6494 20.3407C46.6243 20.3407 45.766 20.6863 45.0746 21.3777C44.4071 22.0691 44.0733 22.9631 44.0733 24.0598C44.0733 25.1564 44.4071 26.0505 45.0746 26.7418C45.766 27.4332 46.6243 27.7789 47.6494 27.7789ZM70.5118 12.9382C68.4615 12.7951 67.4363 13.5222 67.4363 15.1196H70.5118V20.8055H67.4363V33H61.5V20.8055H59.2471V15.1196H61.5C61.5 12.5448 62.251 10.5779 63.753 9.21902C65.2788 7.86011 67.5317 7.26409 70.5118 7.43098V12.9382Z"
              fill="#FFFFFF"
            />
            <Path
              d="M80.6461 12.6521C79.9785 13.3196 79.1799 13.6534 78.2501 13.6534C77.3203 13.6534 76.5097 13.3196 75.8184 12.6521C75.1508 11.9607 74.8171 11.1501 74.8171 10.2203C74.8171 9.29054 75.1508 8.49188 75.8184 7.82435C76.5097 7.15681 77.3203 6.82304 78.2501 6.82304C79.1799 6.82304 79.9785 7.15681 80.6461 7.82435C81.3375 8.49188 81.6831 9.29054 81.6831 10.2203C81.6831 11.1501 81.3375 11.9607 80.6461 12.6521ZM75.282 33V15.1196H81.2183V33H75.282ZM85.7141 33V6.89457H91.6504V33H85.7141ZM101.404 26.2412C102 27.6955 103.335 28.4226 105.409 28.4226C106.696 28.4226 107.781 28.0054 108.663 27.171L112.955 30.1749C111.19 32.3921 108.628 33.5007 105.266 33.5007C102.238 33.5007 99.8066 32.6186 97.9708 30.8543C96.1589 29.0663 95.253 26.8134 95.253 24.0955C95.253 21.4016 96.147 19.1486 97.9351 17.3367C99.7231 15.5249 102 14.6189 104.765 14.6189C107.436 14.6189 109.641 15.5129 111.381 17.301C113.122 19.089 113.992 21.33 113.992 24.024C113.992 24.8108 113.908 25.5498 113.741 26.2412H101.404ZM101.332 22.1287H108.198C107.722 20.4599 106.601 19.6254 104.837 19.6254C103.001 19.6254 101.833 20.4599 101.332 22.1287Z"
              fill="#FFFFFF"
            />
          </Svg>
          <LiquidPressable
            style={styles.settingBtn}
            onPress={() => navigation.navigate('Settings')}
            intensity={0.12}
          >
            <Svg width={22} height={22} viewBox="0 0 27 27" fill="none">
              <Path
                d="M23.6061 14.1787L25.3441 15.7265C25.6651 15.9943 25.8795 16.3682 25.9487 16.7805C26.0178 17.1928 25.937 17.6162 25.721 17.9741L23.6254 21.5542C23.4628 21.8283 23.2306 22.0545 22.9525 22.2099C22.6711 22.3656 22.3551 22.4482 22.0335 22.4502C21.834 22.4514 21.6355 22.4216 21.4452 22.3618L19.2208 21.6273C18.8311 21.8772 18.4261 22.1009 18.0057 22.2983L17.5385 24.5537C17.4521 24.9685 17.2211 25.3392 16.8868 25.5996C16.5482 25.8647 16.1285 26.0046 15.6986 25.9957H11.3594C10.9295 26.0046 10.5098 25.8647 10.1712 25.5996C9.83762 25.3389 9.60735 24.9683 9.5214 24.5537L9.05229 22.2983C8.6374 22.0983 8.23486 21.8735 7.84684 21.6254L5.61474 22.3618C5.42441 22.4216 5.22593 22.4514 5.02643 22.4502C4.70548 22.4479 4.3902 22.3653 4.10937 22.2099C3.83144 22.055 3.59932 21.8295 3.43647 21.5561L1.26589 17.9741C1.04023 17.613 0.954008 17.182 1.02338 16.7618C1.09275 16.3417 1.31295 15.9613 1.64271 15.6919L3.37879 13.498V12.8174L1.64079 11.2696C1.31984 11.0018 1.10539 10.6279 1.03627 10.2156C0.967149 9.80327 1.04792 9.37985 1.26396 9.02197L3.43454 5.44187C3.59713 5.16782 3.82927 4.94163 4.10744 4.78623C4.38828 4.63081 4.70355 4.54819 5.02451 4.54589C5.22221 4.53341 5.42066 4.55157 5.61281 4.59972L7.8007 5.36881C8.19162 5.11886 8.59664 4.89518 9.01576 4.69778L9.48487 2.44244C9.57082 2.02784 9.80109 1.65719 10.1347 1.39648C10.4732 1.13142 10.893 0.991503 11.3228 1.0004H15.6256C16.0554 0.991503 16.4752 1.13142 16.8137 1.39648C17.1502 1.65989 17.3809 2.03097 17.4635 2.44244L17.9326 4.69778C18.3492 4.89646 18.751 5.12078 19.1381 5.37073L21.3721 4.63625C21.6201 4.55559 21.882 4.52727 22.1415 4.55308C22.4009 4.5789 22.6522 4.65829 22.8794 4.78623C23.1582 4.94389 23.3889 5.17077 23.5523 5.43995L25.721 9.02197C25.9497 9.38002 26.0403 9.80906 25.9759 10.229C25.9115 10.649 25.6965 11.0312 25.3711 11.3042L23.6061 12.8078V14.1787Z"
                stroke="#FFFFFF"
                strokeWidth={2}
              />
              <Path
                d="M18.3043 13.4977C18.3043 14.7725 17.7979 15.9952 16.8965 16.8966C15.9951 17.7981 14.7726 18.3045 13.4978 18.3045C12.2231 18.3045 11.0006 17.7981 10.0992 16.8966C9.1978 15.9952 8.69141 14.7725 8.69141 13.4977C8.69141 12.2229 9.1978 11.0002 10.0992 10.0988C11.0006 9.19735 12.2231 8.69092 13.4978 8.69092C14.7726 8.69092 15.9951 9.19735 16.8965 10.0988C17.7979 11.0002 18.3043 12.2229 18.3043 13.4977Z"
                stroke="#FFFFFF"
                strokeWidth={2}
              />
            </Svg>
          </LiquidPressable>
        </View>
        )}

        {/* 프로필 헤더 (아바타 + 정보) */}
        <View style={styles.profileRow}>
          <GrainOverlay opacity={0.03} dotCount={60} />
          {/* 아바타 — 순수 그라데이션 링 (글로우 없음) */}
          <LiquidPressable onPress={() => setActionSheetVisible(true)} intensity={0.08}>
            <View ref={avatarRef} collapsable={false} style={styles.avatarRing}>
                {profilePhoto ? (
                  <Image source={{ uri: profilePhoto }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatar}>
                    <PersonIcon size={50} color="#A0A0B0" />
                  </View>
                )}
                {/* 사진 위 글래스 틴트 + 림 — Ellipse 2997.svg 그대로 재현 */}
                <Svg width={110} height={110} viewBox="0 0 111 111" fill="none" style={styles.avatarInner} pointerEvents="none">
                  <Defs>
                    <SvgLinearGradient id="avatarInnerGrad" x1="74" y1="48.5" x2="99.5" y2="95.5" gradientUnits="userSpaceOnUse">
                      <Stop stopColor="#000000" stopOpacity="0" />
                      <Stop offset="1" stopColor="#FFFFFF" />
                    </SvgLinearGradient>
                  </Defs>
                  <Circle cx="55.5" cy="55.5" r="55" fill="#751AAD" fillOpacity="0.1" stroke="url(#avatarInnerGrad)" strokeWidth="0.5" />
                </Svg>
                {/* 그라데이션 테두리 — Ellipse 2985.svg 그대로 재현 (4px stroke). */}
                {/* 기본 프사(사진 미설정)일 때만 표시하고, 실제 프사가 설정되면 그라데이션 링을 제거한다. */}
                {!profilePhoto && (
                  <Svg width={128} height={128} viewBox="0 0 128 128" fill="none" style={StyleSheet.absoluteFill} pointerEvents="none">
                    <Defs>
                      <SvgLinearGradient id="avatarRingGrad" x1="64" y1="0" x2="96" y2="64" gradientUnits="userSpaceOnUse">
                        <Stop stopColor={skinAccent.ringGradient?.[0] ?? '#00D8F3'} />
                        <Stop offset="1" stopColor={skinAccent.ringGradient?.[1] ?? '#EC34F7'} />
                      </SvgLinearGradient>
                    </Defs>
                    <Circle cx="64" cy="64" r="61" stroke="url(#avatarRingGrad)" strokeWidth="6" fill="none" />
                  </Svg>
                )}
            </View>
          </LiquidPressable>

          {/* 이름 · 위치 · 소개 · 통계 */}
          <View style={styles.profileInfo}>
            <Text style={[styles.userName, nameFontStyle]}>{profileName}</Text>
            <View style={styles.statusRow}>
              <Text style={styles.userLocation}>
                {(() => {
                  const home = COUNTRY_DATA[homeCountryCode] || { name: '대한민국', flag: '🇰🇷' };
                  const visit = COUNTRY_DATA[currentVisitedCountryCode];
                  // 알려진 국가이고 거주국과 다를 때만 '여행 중' (그 외엔 거주국 표시 — 허위 '일본' 폴백 제거)
                  if (arrivalDetect && currentVisitedCountryCode && currentVisitedCountryCode !== homeCountryCode && visit) {
                    return t('profile.traveling', { flag: visit.flag, name: visit.name });
                  }
                  return `${home.flag} ${home.name}`;
                })()}
              </Text>
            </View>
            {/* 소개(bio) — 위치와 통계 사이. 한 줄로 제한하고 넘치면 …처리. 없으면 여백 0 */}
            {!!bio && <Text style={styles.userBio} numberOfLines={1} ellipsizeMode="tail">{bio}</Text>}
            <View style={styles.statsRow}>
              <StatCard value={String(displayTrips.length)} label={t('profile.tripCount')} />
              <StatCard value={String(followingUsers.length)} label={t('profile.following')} onPress={() => navigation.navigate('FollowingList')} />
              <StatCard value={String(followerCount)} label={t('profile.followers')} onPress={() => navigation.navigate('FollowerList')} />
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Travel badge 섹션 (튜토리얼 강조 대상) */}
        <View ref={badgeRef} collapsable={false}>
          {/* Travel badge 헤더 */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Travel badge</Text>
            <TouchableOpacity onPress={() => setBadgeListVisible(true)}>
              <Text style={[styles.sectionLink, { color: skinAccent.accent }]}>{t('profile.seeAll')}</Text>
            </TouchableOpacity>
          </View>

          {/* 배지 하이라이트 (구이 서클) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={badgeHL.scroll}
            contentContainerStyle={badgeHL.scrollContent}
          >
            {selectedBadgeIds.map((id) => {
              const badge = BADGES.find(b => b.id === id);
              if (!badge) return null;
              return (
                <BadgeHighlightItem key={badge.id} emoji={badge.emoji} name={badge.name} glow={badge.glow} earned={earnedBadgeIds.has(badge.id)} />
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.divider} />

        {/* Travel archive 헤더 (튜토리얼 강조 대상) */}
        <View ref={archiveRef} collapsable={false}>
          <View style={gridSt.gridHeaderRow}>
            <Text style={styles.sectionTitle}>Travel archive</Text>
            {/* 카드 합치기 — 합칠 수 있는 카드(tripGroups)가 2장 이상일 때만 노출 */}
            {(mergeMode || mergeableIds.size >= 2) && (
              <TouchableOpacity
                onPress={() => (mergeMode ? exitMergeMode() : setMergeMode(true))}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.sectionLink, { color: skinAccent.accent }]}>{mergeMode ? t('profile.mergeCancel') : t('profile.mergeCards')}</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={[styles.archiveSubtitle, { color: skinAccent.accent }]}>
            {mergeMode ? t('profile.mergeGuide') : t('profile.archiveCount', { count: displayTrips.length })}
          </Text>
        </View>

        {displayTrips.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 36, gap: 6 }}>
            <Text style={{ fontSize: 40 }}>🗺️</Text>
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>{t('profile.emptyTitle')}</Text>
            <Text style={{ color: '#A1A1B0', fontSize: 13, textAlign: 'center' }}>{t('profile.emptyDesc')}</Text>
          </View>
        )}

        {displayTrips.length > 0 && (
          <DraggableCardWrapper
            idx={0}
            activeIdx={activeIdx}
            hoverIdx={hoverIdx}
            dragOffset={dragOffset}
            dragScale={dragScale}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onPress={() => (mergeMode ? toggleMergeSelect(displayTrips[0].id) : openTripDetail(displayTrips[0]))}
            style={thumbSt.mainCard}
          >
            {/* 출렁이는 글로우 배경 */}
            <LiquidCardGlow
              width={SCREEN_WIDTH}
              height={320}
              color={displayTrips[0].id === 'trip-japan' ? '#DDB7FF' : '#A855F7'}
              opacity={0.34}
            />
            <LinearGradient
              colors={TRIP_GRADIENT_COLORS[displayTrips[0].id] || ['rgba(221,183,255,0.2)', 'rgba(221,183,255,0)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {/* 썸네일 사진(import 시 선택) — 있으면 사진 배경, 없으면 기존 이모지 */}
            {displayTrips[0].coverUri ? (
              <>
                <Image source={{ uri: displayTrips[0].coverUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <LinearGradient
                  colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']}
                  style={StyleSheet.absoluteFill}
                />
                {/* flex:1 스페이서 — 정보 바(블러)를 하단으로 밀어준다 */}
                <View style={thumbSt.mainEmojiWrap} />
              </>
            ) : (
              <View style={thumbSt.mainEmojiWrap}>
                <Text style={thumbSt.mainEmoji}>{displayTrips[0].emoji}</Text>
              </View>
            )}
            <BlurView
              intensity={48}
              tint="dark"
              experimentalBlurMethod="dimezisBlurView"
              style={thumbSt.mainInfoBar}
            >
              <View style={{ flex: 1 }}>
                <Text style={thumbSt.mainTitle}>{displayTrips[0].countryFlag} {displayTrips[0].title}</Text>
                <Text style={thumbSt.mainDate}>{displayTrips[0].date}</Text>
              </View>
              <View style={thumbSt.mainBadges}>
                {Array.from(new Set(displayTrips[0].records.map((r) => r.viewType || 'feed'))).map((vt) => (
                  <LiquidPressable key={vt} style={thumbSt.mainBadge} intensity={0.15}>
                    {VIEW_TYPE_BADGE[vt] || null}
                  </LiquidPressable>
                ))}
              </View>
            </BlurView>
            {mergeMode && mergeableIds.has(displayTrips[0].id) && (
              <MergeSelectOverlay
                order={mergeSelected.indexOf(displayTrips[0].id)}
                radius={20}
                primaryLabel={t('profile.mergePrimary')}
              />
            )}
          </DraggableCardWrapper>
        )}

        {/* 여행 썸네일 - 그리드 카드 (2열 + 리퀴드 프레스 + 글로우) */}
        <View style={thumbSt.grid}>
          {displayTrips.slice(1).map((trip, sliceIdx) => {
            const idx = sliceIdx + 1;
            return (
              <DraggableCardWrapper
                key={trip.id}
                idx={idx}
                activeIdx={activeIdx}
                hoverIdx={hoverIdx}
                dragOffset={dragOffset}
                dragScale={dragScale}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onPress={() => (mergeMode ? toggleMergeSelect(trip.id) : openTripDetail(trip))}
                style={thumbSt.gridCard}
              >
                {/* 출렁이는 글로우 */}
                <LiquidCardGlow
                  width={THUMB_WIDTH}
                  height={260}
                  color={TRIP_GRADIENT_COLORS[trip.id]?.[0]?.replace(/[,\s]0\.\d+\)/, ',1)') || '#A855F7'}
                  opacity={0.3}
                />
                <LinearGradient
                  colors={TRIP_GRADIENT_COLORS[trip.id] || ['rgba(221,183,255,0.2)', 'rgba(221,183,255,0)']}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                {/* 썸네일 사진(import 시 선택) — 있으면 사진 배경, 없으면 기존 이모지 */}
                {trip.coverUri ? (
                  <>
                    <Image source={{ uri: trip.coverUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    <LinearGradient
                      colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']}
                      style={StyleSheet.absoluteFill}
                    />
                    {/* flex:1 스페이서 — 정보 바(블러)를 하단으로 밀어준다 */}
                    <View style={thumbSt.gridEmojiWrap} />
                  </>
                ) : (
                  <View style={thumbSt.gridEmojiWrap}>
                    <Text style={thumbSt.gridEmoji}>{trip.emoji}</Text>
                  </View>
                )}
                <BlurView
                  intensity={44}
                  tint="dark"
                  experimentalBlurMethod="dimezisBlurView"
                  style={thumbSt.gridInfoBar}
                >
                  <Text style={thumbSt.gridTitle} {...andFitText}>{trip.countryFlag} {trip.title}</Text>
                  <Text style={thumbSt.gridDate}>{trip.date}</Text>
                  <View style={thumbSt.gridBadges}>
                    {Array.from(new Set(trip.records.map((r) => r.viewType || 'feed'))).map((vt) => (
                      <LiquidPressable key={vt} style={thumbSt.gridBadge} intensity={0.15}>
                        {VIEW_TYPE_BADGE[vt] || null}
                      </LiquidPressable>
                    ))}
                  </View>
                </BlurView>
                {mergeMode && mergeableIds.has(trip.id) && (
                  <MergeSelectOverlay
                    order={mergeSelected.indexOf(trip.id)}
                    radius={30}
                    primaryLabel={t('profile.mergePrimary')}
                  />
                )}
              </DraggableCardWrapper>
            );
          })}
        </View>

      </ScrollView>

      {/* 병합 모드 하단 고정 바 — 2장 이상 선택 시 활성화 */}
      {mergeMode && (
        <View style={[mergeSt.bar, { bottom: insets.bottom + 96 }]} pointerEvents="box-none">
          <TouchableOpacity
            style={[mergeSt.barBtn, { backgroundColor: skinAccent.accent }, mergeSelected.length < 2 && mergeSt.barBtnDisabled]}
            disabled={mergeSelected.length < 2}
            onPress={confirmMerge}
            activeOpacity={0.85}
          >
            <Text style={[mergeSt.barBtnTxt, mergeSelected.length < 2 && mergeSt.barBtnTxtDisabled]}>
              {t('profile.mergeBtn', { count: mergeSelected.length })}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 아바타 액션 시트 */}
      <AvatarActionSheet
        visible={actionSheetVisible}
        hasPhoto={!!profilePhoto}
        onClose={() => setActionSheetVisible(false)}
        onViewPhoto={handleViewPhoto}
        onChangePhoto={handleChangePhoto}
        onDeletePhoto={handleDeletePhoto}
      />

      {/* 사진 전체화면 뷰어 */}
      {profilePhoto && (
        <PhotoViewerModal
          visible={photoViewerVisible}
          photoUri={profilePhoto}
          onClose={() => setPhotoViewerVisible(false)}
        />
      )}

      {/* 배지 전체 목록 모달 */}
      <BadgeListModal
        visible={badgeListVisible}
        onClose={() => setBadgeListVisible(false)}
        selectedBadgeIds={selectedBadgeIds}
        setSelectedBadgeIds={setSelectedBadgeIds}
        earnedBadgeIds={earnedBadgeIds}
      />

      {/* 프로필 튜토리얼 코치마크 */}
      <MainCoachmark
        visible={coachVisible}
        steps={coachSteps}
        onClose={() => setCoachVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  auroraTop: {
    position: 'absolute',
    top: -60,
    left: -40,
    right: -40,
    height: 380,
  },

  // 헤더
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    // 목업(iPhone 17 - 52.svg) 정확 배치: 부모 content paddingHorizontal(16) 상쇄 후
    // 워드마크 Svg 좌측 36px(잉크 ≈37.7), 기어 우측 24px
    marginHorizontal: -16,
    paddingLeft: 36,
    paddingRight: 24,
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  settingBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { fontSize: 28, color: COLORS.white, lineHeight: 28 },

  // 프로필 헤더 행 (아바타 + 정보)
  profileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
    marginBottom: 14,
    paddingVertical: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#1F1F22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  profileInfo: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  userName: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  userHandle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#AA54C1',
    marginBottom: 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userLocation: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  userBio: {
    fontSize: 12,
    color: COLORS.textDim,
    marginTop: 6,
    // 통계(statsRow marginTop:23)와의 간격을 좁힘 — 소개 있을 때만 적용(조건부 렌더). 유효 간격 ≈8
    marginBottom: -15,
    lineHeight: 16,
  },
  statusDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.white,
    marginLeft: 5,
    marginTop: 7,
  },

  // 통계 행 — 상태 텍스트 아래, 3개 묶음 가로 정렬
  statsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 29, // 열 중심 간격 ≈60px 목표
    marginTop: 23,
  },
  // 각 묶음: 숫자(위)+라벨(아래) 가운데 정렬
  statCol: {
    alignItems: 'center',
  },
  avatarRing: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 사진 위 글래스 틴트/림 오버레이 (110x110, 128 링 안에서 중앙)
  avatarInner: {
    position: 'absolute',
    top: 9,
    left: 9,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800', // 굵게 (Gilroy-Bold 쓰면 그걸로)
    fontFamily: 'Inter_800ExtraBold',
    color: '#FFFFFF',
    lineHeight: 26,
  },
  statLabel: {
    fontSize: 13,
    color: '#FFFFFF',
    marginTop: 4, // 숫자~라벨 ≈10px
    lineHeight: 16,
  },
  followingExpandedWrap: {
    marginTop: 8,
    backgroundColor: '#1A1A26',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },

  // 구분선
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: -1,
    marginBottom: 16,
  },
  // 섹션 헤더 (Travel badge / Travel archive)
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 23,
    fontFamily: 'Inter_800ExtraBold',
    color: COLORS.white,
  },
  sectionLink: {
    fontSize: 11,
    fontWeight: '600',
    color: '#AA54C1',
  },
  archiveSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#AA54C1',
    marginTop: -4,
    marginBottom: 16,
  },
  friendsSectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.purpleNeon,
    marginBottom: 8,
    marginTop: 8,
  },
  friendBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  friendBarAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.purpleDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendBarInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
  friendBarUsername: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.purpleNeon,
  },
  friendBarAbroad: {
    fontSize: 12,
    color: COLORS.purpleNeon,
    marginTop: 2,
  },
  friendBarHome: {
    fontSize: 12,
    color: COLORS.textDim,
    marginTop: 2,
  },
  itemDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginLeft: 48,
  },
  itemDividerFull: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginLeft: 80,
  },

  // 섹션 라벨
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.purpleNeon,
    marginBottom: 10,
  },
  groupLabel: {
    fontSize: 10,
    color: COLORS.textDim,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },

  // 여행 아이템
  tripItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  tripThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: COLORS.purpleThumb,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripEmoji: {
    fontSize: 20,
  },
  tripInfo: {
    flex: 1,
    gap: 2,
  },
  tripCountry: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
  },
  tripDate: {
    fontSize: 10,
    color: COLORS.textDim,
  },
  tripStars: {
    fontSize: 10,
    color: COLORS.purpleNeon,
  },

  // 획득 배지
  badgesScroll: {
    marginBottom: 4,
  },
  badgesContent: {
    gap: 10,
    paddingVertical: 4,
  },
  badgeCard: {
    width: 72,
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.2)',
  },
  badgeCardLocked: {
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: '#1A1A24',
  },
  badgeEmoji: {
    fontSize: 26,
  },
  badgeName: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textDim,
    textAlign: 'center',
  },
  badgeLock: {
    fontSize: 10,
  },

  // 프리미엄 배너
  premiumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.purpleBg,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
    borderRadius: 14,
    padding: 16,
    marginTop: 20,
    gap: 12,
  },
  premiumIcon: {
    fontSize: 24,
  },
  premiumInfo: {
    flex: 1,
  },
  premiumTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.purpleNeon,
    marginBottom: 2,
  },
  premiumSub: {
    fontSize: 11,
    color: COLORS.textDim,
  },

  // 설정 그룹
  settingGroup: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingIcon: {
    fontSize: 16,
    width: 24,
  },
  settingLabel: {
    fontSize: 13,
    color: COLORS.white,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  settingValue: {
    fontSize: 11,
    color: COLORS.textDim,
  },
  chevron: {
    fontSize: 18,
    color: COLORS.textMuted,
  },
  premiumBadge: {
    backgroundColor: 'rgba(107,33,168,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.3)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  premiumBadgeText: {
    fontSize: 9,
    color: COLORS.purpleNeon,
  },

  // 로그아웃
  logoutBtn: {
    backgroundColor: COLORS.redBg,
    borderWidth: 1,
    borderColor: COLORS.redBorder,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  logoutText: {
    fontSize: 14,
    color: COLORS.red,
  },

  // 버전
  versionText: {
    fontSize: 10,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 20,
  },

  // ─── 편집 모달 스타일 ───
  modalRoot: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  modalCancelBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  modalCancelText: {
    fontSize: 14,
    color: COLORS.textDim,
  },
  modalSaveBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  modalSaveText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.purpleNeon,
  },
  modalContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 48,
  },

  // 모달 아바타
  modalAvatarSection: {
    alignItems: 'center',
    marginBottom: 36,
  },
  modalAvatarWrap: {
    position: 'relative',
    marginBottom: 10,
  },
  modalAvatarPlaceholder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: COLORS.purpleDeep,
    borderWidth: 2,
    borderColor: 'rgba(191,133,252,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAvatarImg: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: 'rgba(191,133,252,0.5)',
  },
  modalAvatarText: {
    fontSize: 38,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  editBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.purpleDeep,
    borderWidth: 2,
    borderColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadgeText: {
    fontSize: 14,
  },
  modalAvatarHint: {
    fontSize: 12,
    color: COLORS.purpleNeon,
  },

  // 모달 입력 필드
  modalField: {
    marginBottom: 28,
  },
  modalFieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.purpleNeon,
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  modalInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.3)',
    paddingHorizontal: 16,
  },
  modalInput: {
    flex: 1,
    color: COLORS.white,
    fontSize: 15,
    paddingVertical: 15,
  },
  modalCharCount: {
    fontSize: 11,
    color: COLORS.textMuted,
  },

  // 모달 저장 버튼
  modalSaveLargeBtn: {
    backgroundColor: COLORS.purpleDeep,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  modalSaveLargeText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.purpleNeon,
  },
});

// ─── 사진 뷰어 스타일 ───
const pvStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    flex: 1,
  },
  closeBtn: {
    position: 'absolute',
    top: 56,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

// ─── 여행 기록 3열 그리드 스타일 ───
const gridSt = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    marginHorizontal: -16,
    marginBottom: 20,
  },
  cell: {
    width: CELL_SIZE,
    height: Math.floor(CELL_SIZE * 1.4),
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    position: 'relative',
  },
  cellEmoji: {
    fontSize: 36,
  },
  cellCountry: {
    fontSize: 11,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  typeBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  typeBadgeIcon: {
    fontSize: 12,
  },
  gridHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  gridHeaderTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  editBtnText: {
    fontSize: 14,
    color: '#BF85FC',
    fontWeight: '500',
  },
  tripCount: {
    fontSize: 12,
    color: '#A1A1B0',
  },
  checkbox: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2E2E3B',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#BF85FC',
    borderColor: '#BF85FC',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    lineHeight: 16,
  },
  selectedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(191,133,252,0.18)',
  },

  // ── 행 기반 그리드 ──
  rowContainer: {
    marginHorizontal: -16,
    marginBottom: 20,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    gap: 2,
  },

  // ── 묶음 셀 ──
  groupCell: {
    width: CELL_SIZE * 2 + 2,
    height: Math.floor(CELL_SIZE * 1.4),
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  groupCoverEmoji: {
    fontSize: 44,
  },
  groupOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    paddingRight: 34,
    gap: 2,
  },
  groupFlags: {
    fontSize: 13,
    color: '#FFFFFF',
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  groupBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  groupBadgeIcon: {
    fontSize: 13,
  },
});

// ─── 배지 하이라이트 스타일 ───
const badgeHL = StyleSheet.create({
  // 배지 원 — Ellipse 2989 (단색 반투명 회색) 채움. 테두리는 위에 SVG stroke 그라데이션으로 그림
  circle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#D9D9D933', // #D9D9D9 20%


    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    marginBottom: 16,
    height: 72,
  },
  scrollContent: {
    paddingLeft: 4,
    paddingRight: 8,
    gap: 21,
    flexDirection: 'row',
    alignItems: 'center',
  },
  item: {
    alignItems: 'center',
    width: 64,
  },
  glassCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 8,
    elevation: 10,
  },
  glassCircleGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  emoji: {
    fontSize: 24,
  },
  lockIcon: {
    fontSize: 22,
  },
  name: {
    fontSize: 12,
    color: '#CFC2D6',
    textAlign: 'center',
  },
  moreCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    fontSize: 11,
    color: '#BF85FC',
    textAlign: 'center',
    lineHeight: 15,
  },
});

// ─── 배지 전체 목록 모달 스타일 ───
const blStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#BF85FC',
    fontWeight: '600',
  },
  binderWrapper: {
    flex: 1,
    marginHorizontal: 16,
    backgroundColor: '#151522', // 앨범 내지 보드 색상 (동전 케이스 느낌의 플라스틱/가죽 질감 톤)
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 16,
    // 보드 판 입체감을 위한 그림자
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 16,
  },
  cell: {
    width: Math.floor((SCREEN_WIDTH - 32 - 32 - 24) / 3) - 1, // 3열 정렬 (소수점 올림 wrap 방지)
    alignItems: 'center',
  },
  categorySection: {
    marginBottom: 24,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#BF85FC',
    marginBottom: 12,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  coinWrapper: {
    width: 66,
    height: 66,
    borderRadius: 33,
    position: 'relative',
    marginBottom: 8,
    // 메탈릭 입체감 그림자 (양각)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 5,
  },
  coinBorder: {
    width: '100%',
    height: '100%',
    borderRadius: 33,
    padding: 3, // 테두리 링 두께
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinInner: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinEmoji: {
    fontSize: 26,
  },
  coinShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 33,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  checkBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#BF85FC',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  checkText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyHole: {
    width: 66,
    height: 66,
    borderRadius: 33,
    padding: 2.5,
    backgroundColor: '#0D0D14', // 음각 어두운 테두리
    marginBottom: 8,
    // 구멍 입체감 그림자 (음각)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 3,
    elevation: 2,
  },
  emptyHoleInner: {
    width: '100%',
    height: '100%',
    borderRadius: 30.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIcon: {
    fontSize: 16,
    opacity: 0.35,
  },
  cellName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 2,
  },
  cellDesc: {
    fontSize: 10,
    color: '#A1A1B0',
    textAlign: 'center',
    lineHeight: 13,
    paddingHorizontal: 4,
  },
  lockedText: {
    color: 'rgba(255,255,255,0.25)',
  },
  closeBtn: {
    margin: 16,
    marginTop: 8,
    backgroundColor: '#2E2E3B',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  // 선택 모드 토글 버튼 (헤더 우측)
  selectBtn: {
    position: 'absolute',
    right: 16,
    top: 0,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.5)',
    backgroundColor: 'rgba(191,133,252,0.08)',
  },
  selectBtnOn: {
    backgroundColor: '#BF85FC',
    borderColor: '#BF85FC',
  },
  selectBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#BF85FC',
  },
  selectBtnTextOn: {
    color: '#0A0A0F',
  },
  // 배지 확대 오버레이
  zoomBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  zoomCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#151522',
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  zoomCoinWrapper: {
    width: 150,
    height: 150,
    borderRadius: 75,
    position: 'relative',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  zoomCoinBorder: {
    width: '100%',
    height: '100%',
    borderRadius: 75,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomCoinInner: {
    width: '100%',
    height: '100%',
    borderRadius: 69,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomCoinEmoji: {
    fontSize: 64,
  },
  zoomCoinShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 75,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  zoomEmptyHole: {
    width: 150,
    height: 150,
    borderRadius: 75,
    padding: 5,
    backgroundColor: '#0D0D14',
    marginBottom: 20,
  },
  zoomEmptyHoleInner: {
    width: '100%',
    height: '100%',
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomLockIcon: {
    fontSize: 40,
    opacity: 0.35,
  },
  zoomName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  zoomDesc: {
    fontSize: 13,
    color: '#A1A1B0',
    textAlign: 'center',
    lineHeight: 19,
  },
  zoomSelectedTag: {
    marginTop: 18,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.5)',
  },
  zoomSelectedTagText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#BF85FC',
  },
});

// ─── 썸네일 그리드 스타일 ───
const thumbSt = StyleSheet.create({
  // 메인 카드 (첫 번째 여행)
  mainCard: {
    width: '100%',
    height: 260,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(217,217,217,0.2)',
    marginBottom: 16,
  },
  mainEmojiWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainEmoji: {
    fontSize: 72,
  },
  mainInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(14,14,17,0.16)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 20,
    paddingVertical: 16,
    overflow: 'hidden',
  },
  mainTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  mainDate: {
    fontSize: 12,
    color: '#CFC2D6',
    marginTop: 2,
  },
  mainBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  mainBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.42)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  // 그리드 카드 (나머지 여행들)
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  gridCard: {
    width: THUMB_WIDTH,
    height: 210,
    borderRadius: 30,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(217,217,217,0.2)',
  },
  gridEmojiWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridEmoji: {
    fontSize: 48,
  },
  gridInfoBar: {
    backgroundColor: 'rgba(14,14,17,0.16)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
    overflow: 'hidden',
  },
  gridTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  gridDate: {
    fontSize: 12,
    color: '#CFC2D6',
  },
  gridBadges: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  gridBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.42)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});

// ─── 여행 상세 모달 스타일 ───
const detailSt = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1E1E2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: 'rgba(191,133,252,0.2)',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3A55',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#A1A1B0',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  list: {
    gap: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A3A',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(191,133,252,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemEmoji: {
    fontSize: 22,
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemType: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  itemDesc: {
    fontSize: 12,
    color: '#A1A1B0',
  },
  itemArrow: {
    fontSize: 22,
    color: '#BF85FC',
    fontWeight: '300',
  },
});

// ─── 묶음 설정 모달 스타일 ───
const gmSt = StyleSheet.create({
  sheet: {
    backgroundColor: '#1E1E2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderTopColor: 'rgba(191,133,252,0.2)',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3A55',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#BF85FC',
    marginBottom: 10,
    marginTop: 20,
    letterSpacing: 0.3,
  },
  inputWrap: {
    backgroundColor: '#2A2A3A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.25)',
    paddingHorizontal: 14,
  },
  input: {
    color: '#FFFFFF',
    fontSize: 15,
    paddingVertical: 13,
  },
  inputHint: {
    fontSize: 11,
    color: '#A1A1B0',
    marginTop: 6,
  },
  coverScroll: {
    marginBottom: 4,
  },
  coverContent: {
    gap: 12,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  coverThumb: {
    width: 72,
    alignItems: 'center',
    gap: 5,
  },
  thumbBg: {
    width: 72,
    height: 72,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  thumbEmoji: {
    fontSize: 28,
  },
  coverCheckBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#BF85FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverCheckText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
    lineHeight: 14,
  },
  thumbLabel: {
    fontSize: 10,
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '600',
  },
  setAsLabel: {
    fontSize: 9,
    color: '#BF85FC',
    textAlign: 'center',
  },
  saveBtn: {
    backgroundColor: '#6B21A8',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});

// ─── 순서 조정 리스트 스타일 ───
const orderSt = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A3A',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    gap: 12,
  },
  emoji: {
    fontSize: 22,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  handle: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleIcon: {
    fontSize: 20,
    color: '#A1A1B0',
  },
});

// ─── 액션 시트 스타일 ───
const asStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    paddingHorizontal: 12,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  optionsCard: {
    backgroundColor: '#1E1E2E',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 17,
    paddingHorizontal: 20,
    gap: 12,
  },
  optionIcon: {
    fontSize: 18,
    width: 26,
    textAlign: 'center',
  },
  optionText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  deleteText: {
    color: '#FF3B30',
  },
  divider: {
    height: 1,
    backgroundColor: '#2E2E3B',
    marginLeft: 58,
  },
  cancelCard: {
    backgroundColor: '#1E1E2E',
    borderRadius: 20,
    paddingVertical: 17,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    color: '#A1A1B0',
    fontWeight: '500',
  },
});

// ─── 병합 모드 (카드 합치기) 스타일 ───
const mergeSt = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#BF85FC',
  },
  badgeIdle: {
    backgroundColor: 'rgba(10,10,15,0.45)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  badgeTxt: {
    color: '#0A0A0F',
    fontSize: 12,
    fontWeight: '800',
  },
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  barBtn: {
    width: '100%',
    borderRadius: 26,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#BF85FC',
  },
  barBtnDisabled: {
    backgroundColor: '#2E2E3B',
  },
  barBtnTxt: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0A0A0F',
  },
  barBtnTxtDisabled: {
    color: '#A1A1B0',
  },
});
