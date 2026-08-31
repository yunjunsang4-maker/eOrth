import React, { useRef, useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from '../ui/Text';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { NeonFab, FAB_SIZE } from './NeonFab';
import { SnapButton, SNAP_SIZE } from './SnapButton';
import { useCoachOverlay } from './coachOverlayState';
import { usePendingOpenRecordFab, consumeOpenRecordFab } from './recordFabState';
import { useSkinAccent } from '../constants/skinTheme';
import { DETECTOR_KEYS } from '../store/persist';
import { FORMAT_RECO_ENABLED } from '../constants/featureFlags';
import { shouldHighlightAlbum } from '../utils/fabHighlight';

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

  // 소셜 '첫 기록 남기기' 등에서 온 원격 요청 → 마운트/신호 시 형식 메뉴를 펼친다.
  const pendingOpen = usePendingOpenRecordFab();
  useEffect(() => {
    if (pendingOpen && consumeOpenRecordFab()) openFab();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpen]);

  // 귀국 후 7일 이내이고 아직 사진첩을 안 만들었으면 사진첩 버튼에 점 배지를 띄운다.
  // 의존성이 fabOpen인 이유: 이 컴포넌트는 탭 바 위 오버레이라 화면 전환에도 언마운트되지
  // 않는다(마운트 시 1회만 읽으면 앨범을 만들고 돌아와도 배지가 계속 남는다). 메뉴를 여닫는
  // 순간이 곧 배지를 보게 되는 순간이라, 그때 다시 읽으면 항상 최신이다.
  const [highlightAlbum, setHighlightAlbum] = useState(false);
  useEffect(() => {
    if (!FORMAT_RECO_ENABLED) return;
    let cancelled = false;
    (async () => {
      try {
        const [ret, created] = await Promise.all([
          AsyncStorage.getItem(DETECTOR_KEYS.returnAt),
          AsyncStorage.getItem(DETECTOR_KEYS.albumCreatedAt),
        ]);
        if (cancelled) return;
        setHighlightAlbum(
          shouldHighlightAlbum(ret ? Number(ret) : null, created ? Number(created) : null, Date.now())
        );
      } catch {
        // 읽기 실패는 '강조 안 함'으로 둔다 — 부가 유도라 조용히 빠지는 쪽이 옳다
      }
    })();
    return () => { cancelled = true; };
  }, [fabOpen]);

  return (
    // zIndex/elevation 으로 탭 바(elevation 8)보다 위에 그려지게
    <View style={[StyleSheet.absoluteFill, styles.root]} pointerEvents="box-none">
      {/* 스냅 버튼 (우측, 탭 바 위에 겹치지 않고 떠 있음) */}
      <SnapButton
        onPress={() => navigation.navigate('SnapRecord')}
        style={[styles.snap, { bottom: insets.bottom + 129 }]}
      />
      {/* 튜토리얼 오버레이 — 강조 단계가 아니면 어둡게, 강조 단계면 투명.
          어느 쪽이든 터치는 차단한다(pointerEvents auto): 코치마크의 터치 차단막은 화면 '안'에
          있어 이 레이어(내비게이터 오버레이, 화면 위)를 못 막는다 — 딤만 하고 차단을 안 하면
          튜토리얼 도중 스냅 버튼이 그대로 눌려 카메라가 튜토리얼 위로 열렸다. */}
      {coachActive && (
        <View
          pointerEvents="auto"
          style={[styles.snap, { bottom: insets.bottom + 129, width: SNAP_SIZE, height: SNAP_SIZE, borderRadius: SNAP_SIZE / 2, backgroundColor: dimSnap ? COACH_DIM : 'transparent' }]}
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
              {/* iOS만 실블러. Android는 매트로 대체한다.
                  · 원래 주석("experimentalBlurMethod 없이는 no-op — 투명하게 뚫려 보였다")은 맞지만,
                    dimezisBlurView를 켜면 이번엔 반대로 흰 블룸이 생겼다. expo-blur 15.0.8의
                    ExpoBlurView.configureBlurView()는 blurView.setupWith(findOptimalBlurRoot(), …)로
                    '조상 뷰'(rnscreens Screen 또는 android.R.id.content)를 통째로 스냅샷해 흐린다.
                    그래서 버튼 '뒤'가 아니라 이 버튼 '위'에 형제로 그려지는 흰 아이콘(FAB_C)까지
                    스냅샷에 들어가고, 흐려진 그 흰빛이 버튼 자기 배경으로 칠해진다.
                    (S21+ 실측: 아이콘 가장자리 바깥 휘도 +83, 약 10px에 걸쳐 감쇠, 초과분이 완전 무채색
                     = 아이콘의 흰색. 감쇠폭 10px은 intensity 40 / blurReductionFactor 4 = 10 과 일치)
                  · MainScreen의 GlobeBtnGlass(:428)가 같은 dimezis 문제로 이미 매트로 대체돼 있다.
                  · 매트 색은 그 전례와 같은 rgba(22,18,32,0.6). 위의 backgroundColor rgba(46,46,59,0.35)와
                    합쳐 투과율 26%라 밝은 지구본 위에서도 "뚫려" 보이지 않고, 어두운 배경 위 합성값은
                    블룸을 뺀 기존 안드로이드 렌더와 휘도 오차 2 이내다. */}
              {Platform.OS === 'ios' ? (
                <BlurView intensity={40} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.fabFormatMatte]} />
              )}
              {fmt.icon}
            </TouchableOpacity>
            {/* 귀국 유도 배지 — TouchableOpacity 안이 아니라 '형제'로 둔다.
                fabFormatBtn은 overflow:'hidden'(안드로이드 매트의 사각 모서리를 자르려고)이라
                버튼 안에 넣으면 원 밖으로 걸치는 부분이 통째로 잘린다.
                좌표를 bottom·left:'50%' 기준으로 잡은 이유: 이 래퍼는 left:0/right:0 전폭이라
                right로 잡으면 화면 오른쪽 끝에 붙고, top으로 잡으면 위에 있는 라벨 높이에
                끌려다닌다(Noto Sans KR이 영문보다 높아 ko/en에서 위치가 달라진다).
                래퍼 아래쪽 끝 = 버튼 아래쪽 끝이므로 bottom 46 = 버튼 상단(52) 언저리로 고정된다. */}
            {fmt.type === 'album' && highlightAlbum && (
              <View pointerEvents="none" style={styles.albumBadge} />
            )}
          </Animated.View>
        ))}

        {/* 메인 + 버튼 (네온 FAB — Group 2085664476 재현) */}
        <Animated.View style={{ transform: [{ rotate: fabRotateDeg }] }}>
          <NeonFab onPress={toggleFab} accessibilityLabel={t('comp.addRecordA11y')} />
        </Animated.View>

        {/* 튜토리얼 오버레이 — FAB 강조 단계가 아니면 어둡게, 강조 단계면 투명.
            어느 쪽이든 + 버튼 터치는 차단(스냅 오버레이와 동일한 이유). 래퍼는 box-none으로 두고
            원(circle)만 auto — 전폭 스트립이 주변 터치까지 삼키지 않게 한다. */}
        {coachActive && (
          <View pointerEvents="box-none" style={styles.fabDimWrap}>
            <View
              pointerEvents="auto"
              style={{ width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2, backgroundColor: dimFab ? COACH_DIM : 'transparent' }}
            />
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
    // 컬러 글로우는 iOS 전용 — 안드로이드 elevation은 색 지정 불가(회색 사각 그림자)
    ...Platform.select({
      ios: {
        shadowColor: '#BF85FC',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
      },
      default: {},
    }),
    overflow: 'hidden',
  },
  // 안드로이드 전용 유리 채움 — GlobeBtnGlass(MainScreen.tsx:428)와 같은 값.
  // borderRadius 는 부모 overflow:'hidden' 클리핑과 이중 방어 — 절대위치 자식에
  // 라운드 클리핑이 안 걸리는 기기에서 불투명 매트의 사각 모서리가 새는 것을 막는다.
  fabFormatMatte: {
    backgroundColor: 'rgba(22,18,32,0.6)',
    borderRadius: 26,
  },
  // 사진첩 유도 점 배지 — 버튼 우상단에 걸치게. 펄스 애니메이션은 넣지 않는다
  // (안드로이드 elevation은 색을 못 주고, Animated 무한 반복은 FAB가 상주 오버레이라
  //  화면 내내 돈다. 점만으로도 눈에 띄어 비용 대비 효과가 없다.)
  albumBadge: {
    position: 'absolute',
    bottom: 46,      // 래퍼 하단(=버튼 하단) 기준. 버튼 높이 52 → 상단 언저리에 걸친다
    left: '50%',
    marginLeft: 18,  // 버튼 반폭 26 → 배지(10)가 오른쪽 테두리에 걸친다
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#BF85FC',
    borderWidth: 1.5,
    borderColor: '#0A0A0F', // 버튼 테두리와 겹쳐도 점이 뭉개지지 않게 배경색으로 분리
    zIndex: 5,
  },
});
