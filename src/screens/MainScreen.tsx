import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Animated,
  Modal,
  PanResponder,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { BellIcon, GlobeIcon } from '../components/icons';
import GlobeView, { VisitedCountry, GlobeDisplayMode } from '../components/GlobeView';
import CountryMapView from '../components/CountryMapView';
import { useRecords } from '../store/recordStore';

const { height } = Dimensions.get('window');
const SHEET_HEIGHT = height * 0.6;
const COUNTRY_SHEET_HEIGHT = height * 0.65;

// ─── 대륙 모드 국가 목록 ───
const REGION_COUNTRIES = [
  { code: 'JPN', flag: '🇯🇵', name: '일본' },
  { code: 'CHN', flag: '🇨🇳', name: '중국' },
  { code: 'USA', flag: '🇺🇸', name: '미국' },
  { code: 'DEU', flag: '🇩🇪', name: '독일' },
  { code: 'ESP', flag: '🇪🇸', name: '스페인' },
  { code: 'GBR', flag: '🇬🇧', name: '영국' },
  { code: 'FRA', flag: '🇫🇷', name: '프랑스' },
  { code: 'ITA', flag: '🇮🇹', name: '이탈리아' },
];

const ISO3_TO_KO: Record<string, string> = {
  JPN: '일본', CHN: '중국', USA: '미국', DEU: '독일',
  ESP: '스페인', GBR: '영국', FRA: '프랑스', ITA: '이탈리아',
};

const VISITED_COUNTRIES = [
  { flag: '🇯🇵', name: '일본', visits: 5 },
  { flag: '🇺🇸', name: '미국', visits: 2 },
  { flag: '🇭🇰', name: '홍콩', visits: 1 },
];

// ─── FAB 아이콘 (View 기반) ───
const FAB_SZ = 24;
const FAB_C = '#FFFFFF';

// 피드 — 카메라 (뷰파인더 + 몸체 + 렌즈)
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

// 네컷 — 프레임 안 2×2 (네컷 사진 느낌)
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

const COUNTRY_FLAGS: Record<string, string> = {
  '한국': '🇰🇷',
  '일본': '🇯🇵',
  '프랑스': '🇫🇷',
  '태국': '🇹🇭',
};

const COUNTRY_RECORDS: Record<string, Array<{ date: string; city: string; rating: number }>> = {
  '한국': [
    { date: '2024.10.03', city: '서울', rating: 5 },
    { date: '2023.05.15', city: '부산', rating: 4 },
  ],
  '일본': [
    { date: '2025.03.01', city: '도쿄', rating: 5 },
    { date: '2024.08.01', city: '오사카', rating: 4 },
    { date: '2023.11.10', city: '교토', rating: 5 },
  ],
  '프랑스': [
    { date: '2022.09.10', city: '파리', rating: 5 },
  ],
  '태국': [
    { date: '2023.01.20', city: '방콕', rating: 4 },
  ],
};

// 한국어 국가명 → GeoJSON 영문 이름 매핑 (GlobeView의 KO_NAMES 역방향)
const KO_TO_EN: Record<string, string> = {
  '아프가니스탄':'Afghanistan','알바니아':'Albania','알제리':'Algeria',
  '앙골라':'Angola','아르헨티나':'Argentina','아르메니아':'Armenia',
  '호주':'Australia','오스트리아':'Austria','아제르바이잔':'Azerbaijan',
  '방글라데시':'Bangladesh','벨라루스':'Belarus','벨기에':'Belgium',
  '부탄':'Bhutan','볼리비아':'Bolivia','보스니아 헤르체고비나':'Bosnia and Herzegovina',
  '보츠와나':'Botswana','브라질':'Brazil','브루나이':'Brunei',
  '불가리아':'Bulgaria','캄보디아':'Cambodia','카메룬':'Cameroon','캐나다':'Canada',
  '차드':'Chad','칠레':'Chile','중국':'China','콜롬비아':'Colombia',
  '콩고 공화국':'Congo','코스타리카':'Costa Rica','크로아티아':'Croatia','쿠바':'Cuba',
  '체코':'Czech Republic','콩고민주공화국':'Democratic Republic of the Congo',
  '덴마크':'Denmark','도미니카공화국':'Dominican Republic',
  '에콰도르':'Ecuador','이집트':'Egypt','엘살바도르':'El Salvador',
  '에스토니아':'Estonia','에티오피아':'Ethiopia','핀란드':'Finland','프랑스':'France',
  '조지아':'Georgia','독일':'Germany','가나':'Ghana','그리스':'Greece',
  '과테말라':'Guatemala','기니':'Guinea','가이아나':'Guyana','아이티':'Haiti',
  '온두라스':'Honduras','헝가리':'Hungary','아이슬란드':'Iceland','인도':'India',
  '인도네시아':'Indonesia','이란':'Iran','이라크':'Iraq','아일랜드':'Ireland',
  '이스라엘':'Israel','이탈리아':'Italy','자메이카':'Jamaica','일본':'Japan',
  '요르단':'Jordan','카자흐스탄':'Kazakhstan','케냐':'Kenya',
  '쿠웨이트':'Kuwait','키르기스스탄':'Kyrgyzstan','라오스':'Laos',
  '라트비아':'Latvia','레바논':'Lebanon','리비아':'Libya',
  '리투아니아':'Lithuania','룩셈부르크':'Luxembourg',
  '마다가스카르':'Madagascar','말레이시아':'Malaysia','말리':'Mali',
  '멕시코':'Mexico','몰도바':'Moldova','몽골':'Mongolia','몬테네그로':'Montenegro',
  '모로코':'Morocco','모잠비크':'Mozambique','미얀마':'Myanmar',
  '나미비아':'Namibia','네팔':'Nepal','네덜란드':'Netherlands',
  '뉴질랜드':'New Zealand','니카라과':'Nicaragua','니제르':'Niger',
  '나이지리아':'Nigeria','북한':'North Korea','노르웨이':'Norway',
  '오만':'Oman','파키스탄':'Pakistan','파나마':'Panama',
  '파푸아뉴기니':'Papua New Guinea','파라과이':'Paraguay','페루':'Peru',
  '필리핀':'Philippines','폴란드':'Poland','포르투갈':'Portugal',
  '카타르':'Qatar','루마니아':'Romania','러시아':'Russia',
  '사우디아라비아':'Saudi Arabia','세네갈':'Senegal','세르비아':'Serbia',
  '슬로바키아':'Slovakia','슬로베니아':'Slovenia','소말리아':'Somalia',
  '남아프리카공화국':'South Africa','대한민국':'South Korea','남수단':'South Sudan',
  '스페인':'Spain','스리랑카':'Sri Lanka','수단':'Sudan',
  '스웨덴':'Sweden','스위스':'Switzerland','시리아':'Syria',
  '대만':'Taiwan','타지키스탄':'Tajikistan','탄자니아':'Tanzania',
  '태국':'Thailand','토고':'Togo','튀니지':'Tunisia',
  '튀르키예':'Turkey','투르크메니스탄':'Turkmenistan',
  '우간다':'Uganda','우크라이나':'Ukraine',
  '아랍에미리트':'United Arab Emirates',
  '영국':'United Kingdom','미국':'United States of America',
  '우루과이':'Uruguay','우즈베키스탄':'Uzbekistan',
  '베네수엘라':'Venezuela','베트남':'Vietnam',
  '예멘':'Yemen','잠비아':'Zambia','짐바브웨':'Zimbabwe',
  '그린란드':'Greenland','서사하라':'Western Sahara',
  '팔레스타인':'Palestine','키프로스':'Cyprus','코소보':'Kosovo',
  '북마케도니아':'North Macedonia','에스와티니':'Eswatini',
  '한국':'South Korea',
};

interface Props {
  navigation: any;
}

export default function MainScreen({ navigation }: Props) {
  const { records } = useRecords();
  const [hasUnreadAlerts, setHasUnreadAlerts] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [countrySheetOpen, setCountrySheetOpen] = useState(false);

  // 기록형식 선택 모달
  const [formatModalVisible, setFormatModalVisible] = useState(false);
  const [pendingCountry, setPendingCountry] = useState<{ name: string; code: string } | null>(null);

  // 지구본 표시 설정
  const [globeDisplayMode, setGlobeDisplayMode] = useState<GlobeDisplayMode>('flag');
  const [globeColor, setGlobeColor] = useState('#BF85FC');
  const [countryColors, setCountryColors] = useState<Record<string, string>>({});
  const [displaySettingsVisible, setDisplaySettingsVisible] = useState(false);
  const [editingCountryColor, setEditingCountryColor] = useState<string | null>(null);

  // 지구본/대륙 전환
  const [viewMode, setViewMode] = useState<'globe' | 'region'>('globe');
  const [regionCountry, setRegionCountry] = useState<string | null>(null); // ISO3 코드

  // 영→한 역매핑
  const EN_TO_KO: Record<string, string> = useMemo(() => {
    const m: Record<string, string> = {};
    Object.entries(KO_TO_EN).forEach(([ko, en]) => { m[en] = ko; });
    return m;
  }, []);

  // 기록된 국가 → GlobeView에 전달할 방문국가 목록
  const visitedNameSet = useMemo(() => {
    const nameSet = new Set<string>();
    Object.keys(COUNTRY_RECORDS).forEach(ko => {
      const en = KO_TO_EN[ko];
      if (en) nameSet.add(en);
    });
    records.forEach(r => {
      if (r.countryName) {
        const en = KO_TO_EN[r.countryName];
        if (en) nameSet.add(en);
      }
      r.countries?.forEach(c => {
        const en = KO_TO_EN[c.name];
        if (en) nameSet.add(en);
      });
    });
    return nameSet;
  }, [records]);

  const visitedCountries: VisitedCountry[] = useMemo(() => {
    return Array.from(visitedNameSet).map(nameEn => ({
      nameEn,
      color: countryColors[nameEn] || undefined,
    }));
  }, [visitedNameSet, countryColors]);

  const sheetAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const countrySheetAnim = useRef(new Animated.Value(COUNTRY_SHEET_HEIGHT)).current;
  const countryOverlayAnim = useRef(new Animated.Value(0)).current;

  // FAB 확장
  const [fabOpen, setFabOpen] = useState(false);
  const fabRotate = useRef(new Animated.Value(0)).current;
  const fabOverlay = useRef(new Animated.Value(0)).current;
  const fabAnims = useRef([0, 1, 2].map(() => ({
    translateX: new Animated.Value(0),
    opacity: new Animated.Value(0),
  }))).current;

  const openFab = () => {
    setFabOpen(true);
    Animated.parallel([
      Animated.timing(fabRotate, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(fabOverlay, { toValue: 1, duration: 220, useNativeDriver: true }),
      ...fabAnims.map((anim, i) =>
        Animated.sequence([
          Animated.delay(i * 50),
          Animated.parallel([
            Animated.spring(anim.translateX, {
              toValue: -((i + 1) * (52 + 12)),
              useNativeDriver: true,
              tension: 80,
              friction: 9,
            }),
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
          Animated.timing(anim.translateX, { toValue: 0, duration: 180, useNativeDriver: true }),
          Animated.timing(anim.opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        ])
      ),
    ]).start(() => setFabOpen(false));
  };

  const toggleFab = () => (fabOpen ? closeFab() : openFab());

  const FAB_FORMATS = [
    { type: 'feed',  icon: <FeedIcon />,  name: '피드' },
    { type: 'blog',  icon: <BlogIcon />,  name: '블로그' },
    { type: 'cut',   icon: <CutIcon />,   name: '네컷' },
  ];

  const fabRotateDeg = fabRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  const openSheet = () => {
    setSheetOpen(true);
    Animated.parallel([
      Animated.spring(sheetAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 12,
      }),
      Animated.timing(overlayAnim, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeSheet = () => {
    Animated.parallel([
      Animated.timing(sheetAnim, {
        toValue: SHEET_HEIGHT,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(overlayAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSheetOpen(false);
    });
  };

  const sheetPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) sheetAnim.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) {
          closeSheet();
        } else {
          Animated.spring(sheetAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 60,
            friction: 12,
          }).start();
        }
      },
    })
  ).current;

  const openCountrySheet = (countryName: string) => {
    setSelectedCountry(countryName);
    setCountrySheetOpen(true);
    Animated.parallel([
      Animated.spring(countrySheetAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 12,
      }),
      Animated.timing(countryOverlayAnim, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeCountrySheet = () => {
    Animated.parallel([
      Animated.timing(countrySheetAnim, {
        toValue: COUNTRY_SHEET_HEIGHT,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(countryOverlayAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCountrySheetOpen(false);
      setSelectedCountry(null);
    });
  };

  const handleGlobeMessage = (e: any) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data.type === 'countryTapped') {
        const koreanName = data.country;
        const hasRecord = !!COUNTRY_RECORDS[koreanName];
        if (hasRecord && koreanName) {
          openCountrySheet(koreanName);
        } else {
          setPendingCountry({ name: koreanName || data.countryEn, code: '' });
          setFormatModalVisible(true);
        }
      }
    } catch (_) {}
  };

  // 국가 지도 지역 탭 핸들러
  const handleRegionMessage = (e: any) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data.type === 'regionTapped') {
        const countryKo = ISO3_TO_KO[data.countryCode] || data.countryCode;
        const regionName = data.region || data.regionEn;
        setPendingCountry({ name: `${countryKo} - ${regionName}`, code: data.countryCode });
        setFormatModalVisible(true);
      }
    } catch (_) {}
  };

  const handleFormatSelect = (type: string) => {
    setFormatModalVisible(false);
    if (!pendingCountry) return;
    const SCREEN_MAP: Record<string, string> = {
      feed: 'NewRecord',
      blog: 'BlogRecord',
      cut: 'CutRecord',
    };
    navigation.navigate(SCREEN_MAP[type] ?? 'NewRecord', {
      selectedCountry: pendingCountry,
    });
    setPendingCountry(null);
  };

  return (
    <LinearGradient colors={['#0A0118', '#100620']} style={styles.container}>

      {/* ── 헤더 ── */}
      <View style={styles.header}>
        <Text style={styles.headerLogo}>eOrth</Text>
        <TouchableOpacity
          style={styles.headerIcon}
          onPress={() => {
            setHasUnreadAlerts(false);
            navigation.navigate('Notifications');
          }}
        >
          <BellIcon size={24} dot={hasUnreadAlerts} />
        </TouchableOpacity>
      </View>

      {/* ── 지구본 / 국가 지도 영역 ── */}
      <View style={styles.globeArea}>
        {/* 지구본/대륙 전환 토글 (Liquid Glass) */}
        <View style={styles.modeToggleWrap}>
          <BlurView intensity={50} tint="dark" style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, viewMode === 'globe' && styles.modeBtnActive]}
              activeOpacity={0.7}
              onPress={() => { setViewMode('globe'); setRegionCountry(null); }}
            >
              <Text style={[styles.modeBtnText, viewMode === 'globe' && styles.modeBtnTextActive]}>지구본</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, viewMode === 'region' && styles.modeBtnActive]}
              activeOpacity={0.7}
              onPress={() => { setViewMode('region'); setRegionCountry(null); }}
            >
              <Text style={[styles.modeBtnText, viewMode === 'region' && styles.modeBtnTextActive]}>대륙</Text>
            </TouchableOpacity>
          </BlurView>
        </View>

        {/* 뷰 렌더링 */}
        {viewMode === 'globe' ? (
          <>
            <GlobeView size={undefined} fullscreen onMessage={handleGlobeMessage} visitedCountries={visitedCountries} displayMode={globeDisplayMode} defaultColor={globeColor} />
            <TouchableOpacity
              style={styles.globeSettingsBtn}
              activeOpacity={0.7}
              onPress={() => setDisplaySettingsVisible(true)}
            >
              <BlurView intensity={50} tint="dark" style={styles.globeSettingsBtnBlur}>
                <GlobeIcon size={20} color="#BF85FC" />
              </BlurView>
            </TouchableOpacity>
          </>
        ) : regionCountry ? (
          <>
            {/* 국가 지역 지도 */}
            <CountryMapView countryCode={regionCountry} onMessage={handleRegionMessage} />
            {/* 뒤로가기 버튼 */}
            <TouchableOpacity
              style={styles.regionBackBtn}
              activeOpacity={0.7}
              onPress={() => setRegionCountry(null)}
            >
              <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
              <Text style={styles.regionBackArrow}>←</Text>
              <Text style={styles.regionBackText}>{ISO3_TO_KO[regionCountry] || regionCountry}</Text>
            </TouchableOpacity>
          </>
        ) : (
          /* 국가 선택 그리드 */
          <View style={styles.countryGrid}>
            <Text style={styles.countryGridTitle}>국가를 선택하세요</Text>
            <Text style={styles.countryGridSub}>지역별로 기록할 수 있는 국가입니다</Text>
            <View style={styles.countryGridList}>
              {REGION_COUNTRIES.map(c => (
                <TouchableOpacity
                  key={c.code}
                  style={styles.countryGridItem}
                  activeOpacity={0.7}
                  onPress={() => setRegionCountry(c.code)}
                >
                  <Text style={styles.countryGridFlag}>{c.flag}</Text>
                  <Text style={styles.countryGridName}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* ── 스냅 바로가기 버튼 (스냅 카드 그라디언트 보더) ── */}
      <View style={styles.snapQuickWrap}>
        <LinearGradient
          colors={['#FFD60A', '#FF6B9D', '#BF85FC']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <TouchableOpacity
          style={styles.snapQuickBtn}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('SnapRecord')}
        >
          <Text style={styles.snapQuickIcon}>⚡</Text>
          <Text style={styles.snapQuickLabel}>스냅</Text>
        </TouchableOpacity>
      </View>

      {/* ── 하단 핸들 바 (시트 닫혔을 때 노출) ── */}
      {!sheetOpen && (
        <TouchableOpacity style={styles.handleTrigger} onPress={openSheet} activeOpacity={0.8}>
          <LinearGradient
            colors={['transparent', 'rgba(10,1,24,0.85)']}
            style={styles.handleTriggerGradient}
            pointerEvents="none"
          />
          <View style={styles.handleBar} />
          <Text style={styles.handleLabel}>방문한 나라 보기</Text>
        </TouchableOpacity>
      )}

      {/* ── 반투명 오버레이 ── */}
      {sheetOpen && (
        <Animated.View
          style={[styles.overlay, { opacity: overlayAnim }]}
          pointerEvents={sheetOpen ? 'auto' : 'none'}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeSheet} activeOpacity={1} />
        </Animated.View>
      )}

      {/* ── 바텀시트 (Liquid Glass) ── */}
      <Animated.View
        style={[
          styles.bottomSheet,
          { transform: [{ translateY: sheetAnim }] },
        ]}
        pointerEvents={sheetOpen ? 'auto' : 'none'}
      >
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        {/* 시트 핸들 */}
        <View style={styles.sheetHandleArea} {...sheetPan.panHandlers}>
          <View style={styles.sheetHandle} />
        </View>

        {/* 타이틀 */}
        <View style={styles.sheetTitleRow}>
          <Text style={styles.sheetTitle}>방문한 나라</Text>
          <Text style={styles.sheetCount}>{VISITED_COUNTRIES.length}개국</Text>
        </View>

        {/* 나라 리스트 */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sheetList}
        >
          {VISITED_COUNTRIES.map((c, i) => (
            <TouchableOpacity
              key={i}
              style={styles.countryRow}
              activeOpacity={0.7}
              onPress={() => {
                closeSheet();
                navigation.navigate('Country', { name: c.name, flag: c.flag });
              }}
            >
              <Text style={styles.countryFlag}>{c.flag}</Text>
              <View style={styles.countryInfo}>
                <Text style={styles.countryName}>{c.name}</Text>
                <Text style={styles.countryVisits}>{c.visits}회 방문</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      </Animated.View>

      {/* ── 국가 기록 오버레이 ── */}
      {countrySheetOpen && (
        <Animated.View
          style={[styles.overlay, { opacity: countryOverlayAnim, zIndex: 40 }]}
          pointerEvents="auto"
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeCountrySheet} activeOpacity={1} />
        </Animated.View>
      )}

      {/* ── 국가 기록 바텀시트 (Liquid Glass) ── */}
      <Animated.View
        style={[
          styles.countrySheet,
          { transform: [{ translateY: countrySheetAnim }] },
        ]}
        pointerEvents={countrySheetOpen ? 'auto' : 'none'}
      >
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        {/* 핸들 */}
        <TouchableOpacity style={styles.sheetHandleArea} onPress={closeCountrySheet} activeOpacity={0.8}>
          <View style={styles.sheetHandle} />
        </TouchableOpacity>

        {/* 헤더 */}
        <View style={styles.countrySheetHeader}>
          <Text style={styles.countrySheetFlag}>
            {selectedCountry ? COUNTRY_FLAGS[selectedCountry] ?? '🌍' : ''}
          </Text>
          <Text style={styles.countrySheetName}>{selectedCountry}</Text>
        </View>

        {/* 여행 기록 리스트 */}
        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={styles.countryRecordList}>
            {(selectedCountry ? COUNTRY_RECORDS[selectedCountry] ?? [] : []).map((rec, i) => (
              <View key={i} style={styles.countryRecordCard}>
                <View style={styles.countryRecordRow}>
                  <Text style={styles.countryRecordDate}>{rec.date}</Text>
                  <Text style={styles.countryRecordRating}>{'★'.repeat(rec.rating)}</Text>
                </View>
                <Text style={styles.countryRecordCity}>{rec.city}</Text>
              </View>
            ))}
          </View>
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* 새 기록 추가 버튼 */}
        <View style={styles.countrySheetBottom}>
          <TouchableOpacity
            style={styles.countryAddBtn}
            activeOpacity={0.85}
            onPress={() => {
              closeCountrySheet();
              setPendingCountry({ name: selectedCountry || '', code: '' });
              setFormatModalVisible(true);
            }}
          >
            <Text style={styles.countryAddBtnText}>+ 새 기록 추가</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* ── 기록형식 선택 모달 ── */}
      <Modal
        visible={formatModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFormatModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.fmOverlay}
          activeOpacity={1}
          onPress={() => setFormatModalVisible(false)}
        >
          <View style={styles.fmCard}>
            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
            <Text style={styles.fmTitle}>기록 형식 선택</Text>
            <Text style={styles.fmSub}>
              {pendingCountry?.name ? `${pendingCountry.name}의 여행을 어떤 형식으로 기록할까요?` : '어떤 형식으로 기록할까요?'}
            </Text>
            <View style={styles.fmGrid}>
              {[
                { type: 'feed',  icon: <FeedIcon />,  name: '피드' },
                { type: 'blog',  icon: <BlogIcon />,  name: '블로그' },
                { type: 'cut',   icon: <CutIcon />,   name: '네컷' },
              ].map(fmt => (
                <TouchableOpacity
                  key={fmt.type}
                  style={styles.fmItem}
                  activeOpacity={0.7}
                  onPress={() => handleFormatSelect(fmt.type)}
                >
                  <View style={styles.fmIconWrap}>{fmt.icon}</View>
                  <Text style={styles.fmItemText}>{fmt.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── 지구본 표시 설정 모달 ── */}
      <Modal
        visible={displaySettingsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDisplaySettingsVisible(false)}
      >
        <TouchableOpacity
          style={styles.fmOverlay}
          activeOpacity={1}
          onPress={() => setDisplaySettingsVisible(false)}
        >
          <View style={styles.dsCard} onStartShouldSetResponder={() => true}>
            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
            <Text style={styles.dsTitle}>영토 표시 설정</Text>
            <Text style={styles.dsSub}>기록한 국가의 영토를 어떻게 표시할지 선택하세요</Text>

            {/* 모드 선택 */}
            <View style={styles.dsSection}>
              <TouchableOpacity
                style={[styles.dsOption, globeDisplayMode === 'flag' && styles.dsOptionActive]}
                activeOpacity={0.7}
                onPress={() => { setGlobeDisplayMode('flag'); setEditingCountryColor(null); }}
              >
                <Text style={{ fontSize: 24 }}>🏳️</Text>
                <Text style={[styles.dsOptionText, globeDisplayMode === 'flag' && styles.dsOptionTextActive]}>국기</Text>
                {globeDisplayMode === 'flag' && <View style={styles.dsCheck} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dsOption, globeDisplayMode === 'color' && styles.dsOptionActive]}
                activeOpacity={0.7}
                onPress={() => setGlobeDisplayMode('color')}
              >
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: globeColor }} />
                <Text style={[styles.dsOptionText, globeDisplayMode === 'color' && styles.dsOptionTextActive]}>색상</Text>
                {globeDisplayMode === 'color' && <View style={styles.dsCheck} />}
              </TouchableOpacity>
            </View>

            {/* 색상 모드: 기본 색상 + 국가별 색상 */}
            {globeDisplayMode === 'color' && (
              <>
                {/* 기본 색상 */}
                <View style={styles.dsColorSection}>
                  <Text style={styles.dsColorLabel}>기본 색상</Text>
                  <View style={styles.dsColorGrid}>
                    {['#BF85FC', '#7B61FF', '#FF6B6B', '#4ECDC4', '#FFD93D', '#6BCB77', '#FF8C42', '#4D96FF', '#FF69B4', '#00D2FF'].map(c => (
                      <TouchableOpacity
                        key={c}
                        style={[styles.dsColorItem, { backgroundColor: c }, globeColor === c && styles.dsColorItemActive]}
                        activeOpacity={0.7}
                        onPress={() => setGlobeColor(c)}
                      />
                    ))}
                  </View>
                </View>

                {/* 국가별 색상 */}
                <View style={styles.dsColorSection}>
                  <Text style={styles.dsColorLabel}>국가별 색상</Text>
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {Array.from(visitedNameSet).map(nameEn => {
                      const ko = EN_TO_KO[nameEn] || nameEn;
                      const currentColor = countryColors[nameEn] || globeColor;
                      const isEditing = editingCountryColor === nameEn;
                      return (
                        <View key={nameEn}>
                          <TouchableOpacity
                            style={styles.dsCountryRow}
                            activeOpacity={0.7}
                            onPress={() => setEditingCountryColor(isEditing ? null : nameEn)}
                          >
                            <View style={[styles.dsCountryDot, { backgroundColor: currentColor }]} />
                            <Text style={styles.dsCountryName}>{ko}</Text>
                            {countryColors[nameEn] && (
                              <TouchableOpacity
                                style={styles.dsCountryReset}
                                onPress={() => {
                                  setCountryColors(prev => {
                                    const next = { ...prev };
                                    delete next[nameEn];
                                    return next;
                                  });
                                }}
                              >
                                <Text style={styles.dsCountryResetText}>초기화</Text>
                              </TouchableOpacity>
                            )}
                            <Text style={styles.dsCountryArrow}>{isEditing ? '▲' : '▼'}</Text>
                          </TouchableOpacity>
                          {isEditing && (
                            <View style={styles.dsCountryPalette}>
                              {['#BF85FC', '#7B61FF', '#FF6B6B', '#4ECDC4', '#FFD93D', '#6BCB77', '#FF8C42', '#4D96FF', '#FF69B4', '#00D2FF', '#E040FB', '#FF5252', '#448AFF', '#69F0AE', '#FFAB40'].map(c => (
                                <TouchableOpacity
                                  key={c}
                                  style={[styles.dsColorItemSm, { backgroundColor: c }, currentColor === c && countryColors[nameEn] === c && styles.dsColorItemSmActive]}
                                  activeOpacity={0.7}
                                  onPress={() => {
                                    setCountryColors(prev => ({ ...prev, [nameEn]: c }));
                                  }}
                                />
                              ))}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              </>
            )}

            <TouchableOpacity
              style={styles.dsConfirmBtn}
              activeOpacity={0.85}
              onPress={() => { setDisplaySettingsVisible(false); setEditingCountryColor(null); }}
            >
              <Text style={styles.dsConfirmText}>확인</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── FAB 오버레이 ── */}
      {fabOpen && (
        <Animated.View
          style={[styles.fabOverlay, { opacity: fabOverlay }]}
          pointerEvents={fabOpen ? 'auto' : 'none'}
        >
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeFab} />
        </Animated.View>
      )}

      {/* ── FAB ── */}
      <View style={styles.fabWrap}>
        {/* 형식 버튼 4개 */}
        {FAB_FORMATS.map((fmt, i) => (
          <Animated.View
            key={fmt.type}
            style={[
              styles.fabFormatWrap,
              {
                transform: [{ translateX: fabAnims[i].translateX }],
                opacity: fabAnims[i].opacity,
              },
            ]}
            pointerEvents={fabOpen ? 'auto' : 'none'}
          >
            <Text style={styles.fabFormatLabel}>{fmt.name}</Text>
            <TouchableOpacity
              style={styles.fabFormatBtn}
              activeOpacity={0.85}
              onPress={() => {
                closeFab();
                const SCREEN_MAP: Record<string, string> = {
                  feed: 'NewRecord',
                  blog: 'BlogRecord',
                  cut: 'CutRecord',
                };
                navigation.navigate(SCREEN_MAP[fmt.type] ?? 'NewRecord');
              }}
            >
              <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
              {fmt.icon}
            </TouchableOpacity>
          </Animated.View>
        ))}

        {/* 메인 + 버튼 */}
        <TouchableOpacity style={styles.fab} onPress={toggleFab} activeOpacity={0.85}>
          <LinearGradient colors={['#7B61FF', '#5A42DD']} style={styles.fabGradient}>
            <Animated.View style={{ transform: [{ rotate: fabRotateDeg }] }}>
              <Text style={styles.fabIcon}>+</Text>
            </Animated.View>
          </LinearGradient>
        </TouchableOpacity>
      </View>

    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ── 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: Spacing[6],
    paddingBottom: Spacing[3],
  },
  headerLogo: {
    fontSize: 22,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.white,
    letterSpacing: 1,
  },
  headerIcon: {
    padding: Spacing[1],
    position: 'relative',
  },
  redDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF3B30',
  },

  // ── 지구본 영역
  globeArea: {
    flex: 1,
  },

  // ── 핸들 트리거 (시트 닫혔을 때)
  handleTrigger: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 20,
    zIndex: 5,
  },
  handleTriggerGradient: {
    position: 'absolute',
    top: -40,
    left: 0,
    right: 0,
    height: 40,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4A4A59',
    marginBottom: 8,
  },
  handleLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
    letterSpacing: 0.3,
  },

  // ── 오버레이
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 10,
  },

  // ── 바텀시트
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: 'rgba(20,20,35,0.55)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 20,
    overflow: 'hidden',
  },
  sheetHandleArea: {
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 10,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4A4A59',
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[6],
    paddingTop: Spacing[4],
    paddingBottom: Spacing[3],
  },
  sheetTitle: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.white,
  },
  sheetCount: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  sheetList: {
    paddingHorizontal: Spacing[6],
  },

  // ── 나라 행
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[2],
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  countryFlag: { fontSize: 28, marginRight: Spacing[3] },
  countryInfo: { flex: 1 },
  countryName: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.white,
  },
  countryVisits: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    color: Colors.textMuted,
  },

  // ── 국가 기록 바텀시트
  countrySheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: COUNTRY_SHEET_HEIGHT,
    backgroundColor: 'rgba(20,20,35,0.55)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    zIndex: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 25,
    overflow: 'hidden',
  },
  countrySheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[6],
    paddingTop: Spacing[2],
    paddingBottom: Spacing[4],
    gap: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  countrySheetFlag: {
    fontSize: 32,
  },
  countrySheetName: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.white,
  },
  countryRecordList: {
    paddingHorizontal: Spacing[6],
    paddingTop: Spacing[4],
    gap: Spacing[3],
  },
  countryRecordCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: Spacing[2],
  },
  countryRecordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  countryRecordDate: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  countryRecordRating: {
    fontSize: Typography.fontSize.xs,
    color: Colors.gold,
  },
  countryRecordCity: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.white,
  },
  countrySheetBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing[6],
    paddingBottom: 36,
    paddingTop: Spacing[3],
    backgroundColor: 'rgba(30,30,46,0.95)',
  },
  countryAddBtn: {
    backgroundColor: '#7B61FF',
    borderRadius: BorderRadius.full,
    paddingVertical: 16,
    alignItems: 'center',
  },
  countryAddBtnText: {
    color: Colors.white,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.semiBold,
  },

  // ── FAB
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
    bottom: 16,
    right: Spacing[6],
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fab: {
    shadowColor: '#7B61FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 10,
  },
  fabGradient: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabIcon: {
    fontSize: 28,
    color: Colors.white,
    lineHeight: 32,
  },
  fabFormatWrap: {
    position: 'absolute',
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
  fabFormatIcon: {},

  // ── 기록형식 선택 모달
  fmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fmCard: {
    width: '82%',
    backgroundColor: 'rgba(20,20,32,0.5)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  fmTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  fmSub: {
    color: '#A1A1B0',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 22,
    lineHeight: 18,
  },
  fmGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 10,
  },
  fmItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: '#2E2E3B',
    borderRadius: 14,
  },
  fmIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3A3A4A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  fmItemText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  // ── 지구본/대륙 모드 토글
  modeToggleWrap: {
    alignItems: 'center',
    paddingVertical: 6,
    zIndex: 5,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(30,30,42,0.35)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  modeBtn: {
    paddingHorizontal: 22,
    paddingVertical: 8,
    borderRadius: 20,
  },
  modeBtnActive: {
    backgroundColor: 'rgba(191,133,252,0.2)',
  },
  modeBtnText: {
    color: '#A1A1B0',
    fontSize: 13,
    fontWeight: '500',
  },
  modeBtnTextActive: {
    color: '#fff',
    fontWeight: '700',
  },

  // ── 대륙 모드 - 뒤로가기
  regionBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'absolute',
    top: 12,
    left: 16,
    zIndex: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(20,20,30,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    gap: 4,
    overflow: 'hidden',
  },
  regionBackArrow: {
    color: '#BF85FC',
    fontSize: 16,
    fontWeight: '700',
  },
  regionBackText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },

  // ── 대륙 모드 - 국가 선택 그리드
  countryGrid: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  countryGridTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  countryGridSub: {
    color: '#A1A1B0',
    fontSize: 13,
    marginBottom: 24,
  },
  countryGridList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
  },
  countryGridItem: {
    width: '22%',
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: 'rgba(46,46,59,0.6)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.15)',
  },
  countryGridFlag: {
    fontSize: 28,
    marginBottom: 6,
  },
  countryGridName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  globeSettingsBtn: {
    position: 'absolute',
    top: 12,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    overflow: 'hidden',
  },
  globeSettingsBtnBlur: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  snapQuickWrap: {
    position: 'absolute',
    bottom: 60,
    left: 16,
    borderRadius: 21,
    overflow: 'hidden',
    zIndex: 20,
    elevation: 20,
  },
  snapQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(10,1,24,0.9)',
    borderRadius: 19.5,
    margin: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  snapQuickIcon: {
    fontSize: 16,
  },
  snapQuickLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFD60A',
  },
  globeSettingsIcon: {
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── 표시 설정 모달
  dsCard: {
    width: '85%',
    backgroundColor: 'rgba(20,20,32,0.5)',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  dsTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  dsSub: {
    color: '#A1A1B0',
    fontSize: 13,
    marginBottom: 20,
    lineHeight: 18,
  },
  dsSection: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  dsOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#2E2E3B',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  dsOptionActive: {
    borderColor: '#BF85FC',
    backgroundColor: 'rgba(191,133,252,0.1)',
  },
  dsOptionText: {
    color: '#A1A1B0',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  dsOptionTextActive: {
    color: '#fff',
  },
  dsCheck: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#BF85FC',
  },
  dsColorSection: {
    marginBottom: 16,
  },
  dsColorLabel: {
    color: '#A1A1B0',
    fontSize: 13,
    marginBottom: 10,
  },
  dsColorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  dsColorItem: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  dsColorItemActive: {
    borderColor: '#fff',
    borderWidth: 3,
  },
  dsCountryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 10,
  },
  dsCountryDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  dsCountryName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  dsCountryReset: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  dsCountryResetText: {
    color: '#A1A1B0',
    fontSize: 11,
  },
  dsCountryArrow: {
    color: '#A1A1B0',
    fontSize: 10,
  },
  dsCountryPalette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingLeft: 30,
    paddingBottom: 10,
  },
  dsColorItemSm: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  dsColorItemSmActive: {
    borderColor: '#fff',
    borderWidth: 2.5,
  },
  dsConfirmBtn: {
    backgroundColor: '#BF85FC',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  dsConfirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
