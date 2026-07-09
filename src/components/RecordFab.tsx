import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { NeonFab, FAB_SIZE } from './NeonFab';
import { SnapButton, SNAP_SIZE } from './SnapButton';
import { useCoachOverlay } from './coachOverlayState';
import { useSkinAccent } from '../constants/skinTheme';

const FORMAT_LABEL_KEY: Record<string, string> = {
  feed: 'main.formatFeed', blog: 'main.formatBlog', cut: 'main.formatCut', album: 'main.formatAlbum',
};

const COACH_DIM = 'rgba(0,0,0,0.78)'; // 코치마크 딤과 동일한 어둠

/**
 * 기록 추가 FAB 클러스터 — 네온 "+" 버튼 + 형식 4개 부채꼴 메뉴 + 딤 오버레이.
 *
 * 탭 바보다 위(같은 네비게이터 오버레이 레이어)에 떠서 겹치도록 CustomTabBar 에서 렌더한다.
 * (화면 안에 두면 탭 바가 위에 그려져 FAB 아래쪽이 가려지므로)
 */

const FAB_SZ = 24;
const FAB_C = '#FFFFFF';

// 피드 — 카드(사진)
const FeedIcon = () => (
  <View style={{ width: FAB_SZ, height: FAB_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 8, height: 4, borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: FAB_C }} />
    <View style={{ width: 20, height: 13, borderRadius: 3, backgroundColor: FAB_C, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: '#2E2E3B' }} />
    </View>
  </View>
);

// 블로그 — 글 문서 (헤더 줄 + 본문 줄 3개)
const BlogIcon = () => (
  <View style={{ width: FAB_SZ, height: FAB_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 20, height: 20, gap: 3 }}>
      <View style={{ width: 14, height: 3, borderRadius: 1.5, backgroundColor: FAB_C }} />
      <View style={{ width: 20, height: 2, borderRadius: 1, backgroundColor: FAB_C, opacity: 0.6 }} />
      <View style={{ width: 18, height: 2, borderRadius: 1, backgroundColor: FAB_C, opacity: 0.6 }} />
      <View style={{ width: 16, height: 2, borderRadius: 1, backgroundColor: FAB_C, opacity: 0.6 }} />
    </View>
  </View>
);

// 앨범 — 사진 그리드 (2×2)
const AlbumIcon = () => (
  <View style={{ width: FAB_SZ, height: FAB_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 20, height: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
      <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: FAB_C }} />
      <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: FAB_C }} />
      <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: FAB_C }} />
      <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: FAB_C }} />
    </View>
  </View>
);

// 네컷 — 프레임 안 2×2
const CutIcon = () => (
  <View style={{ width: FAB_SZ, height: FAB_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 18, height: 22, borderWidth: 1.5, borderColor: FAB_C, borderRadius: 3, padding: 2.5, flexDirection: 'row', flexWrap: 'wrap', gap: 2, alignContent: 'center', justifyContent: 'center' }}>
      <View style={{ width: 5.5, height: 5.5, borderRadius: 1, backgroundColor: FAB_C }} />
      <View style={{ width: 5.5, height: 5.5, borderRadius: 1, backgroundColor: FAB_C }} />
      <View style={{ width: 5.5, height: 5.5, borderRadius: 1, backgroundColor: FAB_C }} />
      <View style={{ width: 5.5, height: 5.5, borderRadius: 1, backgroundColor: FAB_C }} />
    </View>
  </View>
);

// 중앙 FAB 기준 위쪽 부채꼴 펼침 타깃 (반경 ~96)
const FAN_TARGETS = [
  { x: -83, y: -48 },
  { x: -33, y: -90 },
  { x: 33, y: -90 },
  { x: 83, y: -48 },
];

const FORMATS: { type: string; icon: React.ReactNode; name: string; screen: string }[] = [
  { type: 'feed', icon: <FeedIcon />, name: '피드', screen: 'NewRecord' },
  { type: 'blog', icon: <BlogIcon />, name: '블로그', screen: 'BlogRecord' },
  { type: 'cut', icon: <CutIcon />, name: '스트립', screen: 'CutRecord' },
  { type: 'album', icon: <AlbumIcon />, name: '사진첩', screen: 'AlbumCreate' },
];

interface RecordFabProps {
  navigation: any;
}

export const RecordFab: React.FC<RecordFabProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const skinAccent = useSkinAccent(); // 포맷 버튼 테두리·글로우를 스킨 강조색으로
  // 튜토리얼 중에는 강조 중인 버튼만 밝게, 나머지는 어둡게.
  const { active: coachActive, bright: coachBright } = useCoachOverlay();
  const dimSnap = coachActive && coachBright !== 'snap';
  const dimFab = coachActive && coachBright !== 'fab';

  const [fabOpen, setFabOpen] = useState(false);
  const fabRotate = useRef(new Animated.Value(0)).current;
  const fabOverlay = useRef(new Animated.Value(0)).current;
  const fabAnims = useRef(
    [0, 1, 2, 3].map(() => ({
      translateX: new Animated.Value(0),
      translateY: new Animated.Value(0),
      opacity: new Animated.Value(0),
    }))
  ).current;

  const openFab = () => {
    setFabOpen(true);
    Animated.parallel([
      Animated.timing(fabRotate, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(fabOverlay, { toValue: 1, duration: 220, useNativeDriver: true }),
      ...fabAnims.map((anim, i) =>
        Animated.sequence([
          Animated.delay(i * 40),
          Animated.parallel([
            Animated.spring(anim.translateX, { toValue: FAN_TARGETS[i].x, useNativeDriver: true, tension: 80, friction: 9 }),
            Animated.spring(anim.translateY, { toValue: FAN_TARGETS[i].y, useNativeDriver: true, tension: 80, friction: 9 }),
            Animated.timing(anim.opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
          ]),
        ])
      ),
    ]).start();
  };

  const closeFab = () => {
    Animated.parallel([
      Animated.timing(fabRotate, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(fabOverlay, { toValue: 0, duration: 200, useNativeDriver: true }),
      ...fabAnims.map((anim) =>
        Animated.parallel([
          Animated.timing(anim.translateX, { toValue: 0, duration: 170, useNativeDriver: true }),
          Animated.timing(anim.translateY, { toValue: 0, duration: 170, useNativeDriver: true }),
          Animated.timing(anim.opacity, { toValue: 0, duration: 140, useNativeDriver: true }),
        ])
      ),
    ]).start(() => setFabOpen(false));
  };

  const toggleFab = () => (fabOpen ? closeFab() : openFab());
  const fabRotateDeg = fabRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  return (
    // zIndex/elevation 으로 탭 바(elevation 8)보다 위에 그려지게
    <View style={[StyleSheet.absoluteFill, styles.root]} pointerEvents="box-none">
      {/* 스냅 버튼 (우측, 탭 바 위에 겹치지 않고 떠 있음) */}
      <SnapButton
        onPress={() => navigation.navigate('SnapRecord')}
        style={[styles.snap, { bottom: insets.bottom + 129 }]}
      />
      {/* 튜토리얼 딤 — 스냅 강조 단계가 아닐 때 스냅 버튼을 어둡게 */}
      {dimSnap && (
        <View
          pointerEvents="none"
          style={[styles.snap, { bottom: insets.bottom + 129, width: SNAP_SIZE, height: SNAP_SIZE, borderRadius: SNAP_SIZE / 2, backgroundColor: COACH_DIM }]}
        />
      )}

      {/* 딤 오버레이 (메뉴 열렸을 때 전체 화면) */}
      {fabOpen && (
        <Animated.View style={[styles.fabOverlay, { opacity: fabOverlay }]} pointerEvents="auto">
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeFab} />
        </Animated.View>
      )}

      {/* FAB (중앙) — 탭 바 위에 떠서 겹침 */}
      <View style={[styles.fabWrap, { bottom: insets.bottom + 73 }]} pointerEvents="box-none">
        {/* 형식 버튼 4개 (부채꼴) */}
        {FORMATS.map((fmt, i) => (
          <Animated.View
            key={fmt.type}
            style={[
              styles.fabFormatWrap,
              {
                transform: [
                  { translateX: fabAnims[i].translateX },
                  { translateY: fabAnims[i].translateY },
                ],
                opacity: fabAnims[i].opacity,
              },
            ]}
            pointerEvents={fabOpen ? 'box-none' : 'none'}
          >
            <Text style={styles.fabFormatLabel}>{t(FORMAT_LABEL_KEY[fmt.type] ?? fmt.name)}</Text>
            <TouchableOpacity
              style={[styles.fabFormatBtn, { borderColor: skinAccent.tint(0.4), shadowColor: skinAccent.accent }]}
              activeOpacity={0.85}
              onPress={() => {
                closeFab();
                navigation.navigate(fmt.screen);
              }}
            >
              {/* Android는 experimentalBlurMethod 없이는 BlurView가 no-op — 버튼이 투명하게 뚫려 보였다 */}
              <BlurView intensity={40} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
              {fmt.icon}
            </TouchableOpacity>
          </Animated.View>
        ))}

        {/* 메인 + 버튼 (네온 FAB — Group 2085664476 재현) */}
        <Animated.View style={{ transform: [{ rotate: fabRotateDeg }] }}>
          <NeonFab onPress={toggleFab} accessibilityLabel={t('comp.addRecordA11y')} />
        </Animated.View>

        {/* 튜토리얼 딤 — FAB 강조 단계가 아닐 때 + 버튼을 어둡게 (하단 중앙, NeonFab 위) */}
        {dimFab && (
          <View pointerEvents="none" style={styles.fabDimWrap}>
            <View style={{ width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2, backgroundColor: COACH_DIM }} />
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    zIndex: 40,
    elevation: 40,
  },
  // 스냅 버튼 (우측, 원 오른쪽 모서리가 화면 우측에서 ~46px 안쪽)
  snap: {
    position: 'absolute',
    right: 46,
  },
  fabOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 28,
  },
  fabWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    // 부채꼴로 펼쳐지는 형식 버튼(최대 위로 ~160px)을 모두 영역 안에 포함시켜
    // 부모 bounds 밖이라 터치가 안 먹는 문제를 방지. FAB 본체는 아래에 고정.
    height: 200,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 30,
  },
  fabDimWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fabFormatWrap: {
    position: 'absolute',
    bottom: 2,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 4,
  },
  fabFormatLabel: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  fabFormatBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(46,46,59,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#BF85FC',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
    overflow: 'hidden',
  },
});
