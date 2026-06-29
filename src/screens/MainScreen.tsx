import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Dimensions,
  Animated,
  Modal,
  PanResponder,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Circle, Path as SvgPath, Line as SvgLine, Rect as SvgRect, Defs as SvgDefs, LinearGradient as SvgLinearGradient, RadialGradient as SvgRadialGradient, Stop as SvgStop } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { NotificationBellIcon, SearchLineIcon } from '../components/icons';
import GlobeView, { VisitedCountry, GlobeDisplayMode } from '../components/GlobeView';
import { imageToDataUri } from '../utils/imageCompress';
import { showPermissionDeniedAlert } from '../utils/permissionAlert';
import CountryMapView from '../components/CountryMapView';
import MainCoachmark, { CoachStep, CoachRect } from '../components/MainCoachmark';
import { setCoachActive, setCoachBright } from '../components/coachOverlayState';
import { EorthLogo } from '../components/EorthLogo';
import { SegmentedToggle } from '../components/SegmentedToggle';
import SponsoredPackageCard from '../components/SponsoredPackageCard';
import { getSponsoredMarkerItems, getSponsoredByCountryEn, type SponsoredPackage } from '../constants/sponsoredPackages';
import { useRecords } from '../store/recordStore';
import type { TravelRecord } from '../store/recordStore';
import { useSettings, type MapDisplayMode } from '../store/settingsStore';
import type { TabScreenProps } from '../navigation/types';

const { height, width } = Dimensions.get('window');
// 영토 표시 설정 모달 카드 — Figma 325x569 비율 유지(화면에 맞춰 축소)
const DS_CARD_W = Math.min(325, width - 24);
const DS_CARD_H = Math.min(569, height * 0.86, DS_CARD_W * (569 / 325));
const DS_PAD = DS_CARD_W * (29 / 325); // 좌우 패딩 29 (버튼폭 268)
const DS_CARD_TOP = height * (168.85 / 874); // Figma 목업 기준 카드 상단 위치(가운데 아님, 상단 배치)
const DS_PALETTE = ['#BF85FC', '#7B61FF', '#FF6B6B', '#4ECDC4', '#FFD93D'];
const DS_PALETTE_MORE = ['#6BCB77', '#FF8C42', '#4D96FF', '#FF69B4', '#00D2FF', '#E040FB'];
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

// ─── 영토 표시 설정 버튼 아이콘 (보라 배경 + 위경도 격자 지구본) — 지구본/대륙 공용 ───
const GlobeDisplayIcon = () => (
  <Svg width={36} height={36} viewBox="-2 -2 33 33" fill="none">
    <SvgDefs>
      {/* 메뉴바 배경 테두리의 중립 베벨 그라데이션 (검은색 투명 → 흰색) */}
      <SvgLinearGradient id="globeBtnRim" x1="0" y1="0" x2="0.15" y2="1">
        <SvgStop offset="0" stopColor="#666666" stopOpacity="0" />
        <SvgStop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
      </SvgLinearGradient>
    </SvgDefs>
    <Circle cx={14.5} cy={14.5} r={14.5} fill="#751AAD" fillOpacity={0.3} />
    <Circle cx={14.5} cy={14.5} r={13.8} fill="none" stroke="url(#globeBtnRim)" strokeOpacity={0.6} strokeWidth={1.3} />
    <SvgPath
      d="M23.7851 14.4998C23.7851 11.9165 22.8876 9.74402 21.0926 7.98266C19.37 6.2601 17.2696 5.37175 14.7913 5.31795L14.5504 5.31531C11.9671 5.31531 9.77802 6.20458 7.9831 7.98266L7.81884 8.14913C6.15012 9.88032 5.31578 11.9972 5.31575 14.4998L5.31839 14.7411C5.37226 17.2193 6.26057 19.3195 7.9831 21.042C9.72199 22.7484 11.8307 23.6283 14.3095 23.6816L14.5504 23.6842C17.1338 23.6842 19.3145 22.8034 21.0926 21.042C22.8875 19.2638 23.7851 17.0831 23.7851 14.4998ZM24.0982 14.7486C24.0419 17.3063 23.1133 19.4851 21.315 21.2666C19.4757 23.0886 17.214 24 14.5504 24C11.9701 24 9.75963 23.1448 7.93686 21.4357L7.76203 21.2675L7.75983 21.2653C5.9207 19.4261 5 17.1643 5 14.4998C5.00003 11.8353 5.92064 9.58125 7.76071 7.75851C9.61623 5.92033 11.8859 5 14.5504 5C17.2149 5 19.4768 5.92031 21.3159 7.75939C23.1719 9.58159 24.1008 11.8352 24.1008 14.4998L24.0982 14.7486Z"
      fill="#FFFFFF"
    />
    <SvgPath
      d="M15.0576 4.76074C17.5677 4.87152 19.7221 5.81266 21.4912 7.58105L21.8369 7.93652C23.512 9.74267 24.3506 11.9408 24.3506 14.5V14.502L24.3486 14.751V14.7539L24.0986 14.749L24.3477 14.7539C24.29 17.3755 23.3362 19.6166 21.4912 21.4443C19.7213 23.1976 17.5663 24.1297 15.0566 24.2393L14.5508 24.25C11.9094 24.25 9.63652 23.3724 7.76562 21.6182L7.76367 21.6162L7.58887 21.4473L7.58496 21.4443L7.58301 21.4424C5.69564 19.555 4.75005 17.2287 4.75 14.5L4.76074 13.9932C4.87152 11.483 5.81383 9.3355 7.58496 7.58105C9.48847 5.69535 11.8221 4.75 14.5508 4.75L15.0576 4.76074ZM14.5488 5.56543C12.0305 5.56579 9.90574 6.43004 8.15918 8.16016L7.99707 8.3252L7.99609 8.32422C6.37568 10.0063 5.56546 12.0603 5.56543 14.5L5.56836 14.7354L5.58789 15.1836C5.73195 17.4029 6.58789 19.2922 8.1582 20.8633C9.85069 22.5241 11.8982 23.3796 14.3145 23.4316H14.3135L14.5508 23.4336C17.0704 23.4335 19.1874 22.5776 20.917 20.8643C22.6631 19.1343 23.5351 17.0181 23.5352 14.5C23.5351 11.9819 22.6634 9.87402 20.918 8.16113L20.916 8.15918C19.2399 6.48314 17.2011 5.62085 14.7861 5.56836V5.56738L14.5488 5.56543Z"
      stroke="#FFFFFF"
      strokeOpacity={0.5}
      strokeWidth={0.5}
    />
    <SvgPath d="M14.4696 5.45068C12.8913 8.38182 12.2148 11.7639 12.2148 14.695C12.2148 18.3026 13.267 22.5866 14.4696 23.9394" stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={0.7} />
    <SvgPath d="M14.9211 5.45068C16.6747 8.41801 17.1758 12.9831 17.1758 15.0374C17.1758 17.0917 16.4242 22.5699 14.9211 23.9394" stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={0.7} />
    <SvgPath d="M14.4699 5.45068C11.0943 7.25419 9.05859 10.1877 9.05859 15.3728C9.05859 20.5578 11.7592 23.2631 13.5597 23.9394" stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={0.7} />
    <SvgPath d="M14.9207 5.45068C18.2963 7.25419 20.332 10.7006 20.332 15.0374C20.332 19.3743 17.6314 23.2631 15.831 23.9394" stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={0.7} />
    <SvgLine x1={14.8697} y1={5} x2={14.8697} y2={23.9397} stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={0.8} />
    <SvgLine x1={5} y1={14.5204} x2={23.9397} y2={14.5204} stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={0.8} />
    <SvgLine x1={5.90137} y1={18.1783} x2={23.0373} y2={18.1783} stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={0.7} />
    <SvgLine x1={5.90137} y1={10.9635} x2={23.4882} y2={10.9635} stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={0.7} />
  </Svg>
);

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

// 스냅 — 번개 ⚡
const SnapIcon = () => (
  <View style={{ width: FAB_SZ, height: FAB_SZ, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: FAB_C, fontSize: 16, fontWeight: 'bold' }}>⚡</Text>
  </View>
);

const COUNTRY_FLAGS: Record<string, string> = {
  '한국': '🇰🇷',
  '일본': '🇯🇵',
  '프랑스': '🇫🇷',
  '태국': '🇹🇭',
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

const CITY_TO_EN: Record<string, string> = {
  '도쿄': 'Tokyo', '오사카': 'Osaka', '교토': 'Kyoto',
  '후쿠오카': 'Fukuoka', '홋카이도': 'Hokkaido', '오키나와': 'Okinawa',
  '파리': 'Paris', '니스': 'Nice', '리옹': 'Lyon',
  '로마': 'Rome', '밀라노': 'Milan', '피렌체': 'Florence', '베네치아': 'Venice',
  '베를린': 'Berlin', '함부르크': 'Hamburg', '뮌헨': 'Munich', '프랑크푸르트': 'Frankfurt',
  '런던': 'London',
  '서울': 'Seoul', '부산': 'Busan',
  '방콕': 'Bangkok',
};

type Props = TabScreenProps<'MainTab'>;

// 기록 형식 선택 → 이동할 수 있는 작성 화면들
type RecordFormatScreen = 'NewRecord' | 'BlogRecord' | 'CutRecord' | 'SnapRecord' | 'AlbumCreate';

// 전체화면 우주배경 — 메인탭 모든 콘텐츠 뒤에 깔리는 별·무드글로우(비상호작용).
// 별은 글로브 WebView(75% 영역) 밖(헤더·탭 영역)까지 화면 전체로 확장된다(첨부 SVG처럼).
function SpaceBackdrop() {
  const { width: W, height: H } = Dimensions.get('window');
  const stars = useMemo(() => {
    let s = 20260629;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    return Array.from({ length: 320 }, () => ({
      x: +(rnd() * W).toFixed(1),
      y: +(rnd() * H).toFixed(1),
      r: +(0.5 + rnd() * 0.6).toFixed(2),
      o: +(0.5 + rnd() * 0.4).toFixed(2),
    }));
  }, [W, H]);
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
      <SvgDefs>
        <SvgRadialGradient id="sbGlowP" cx="50%" cy="50%" r="50%">
          <SvgStop offset="0%" stopColor="#CA82FF" stopOpacity={0.18} />
          <SvgStop offset="70%" stopColor="#CA82FF" stopOpacity={0} />
        </SvgRadialGradient>
        <SvgRadialGradient id="sbGlowB" cx="50%" cy="50%" r="50%">
          <SvgStop offset="0%" stopColor="#1E3AFF" stopOpacity={0.1} />
          <SvgStop offset="65%" stopColor="#1E3AFF" stopOpacity={0} />
        </SvgRadialGradient>
      </SvgDefs>
      <SvgRect x={0} y={0} width={W} height={H} fill="#0A0B0F" />
      <Circle cx={W * 0.32} cy={H * 0.22} r={W * 0.55} fill="url(#sbGlowB)" />
      <Circle cx={W * 0.24} cy={H * 0.48} r={W * 0.42} fill="url(#sbGlowP)" />
      <Circle cx={W * 0.82} cy={H * 0.8} r={W * 0.44} fill="url(#sbGlowP)" />
      {/* 우주가스 추가 블롭 — globe #bg와 동일한 가장자리 산포 */}
      <Circle cx={W * 0.06} cy={H * 0.28} r={W * 0.42} fill="url(#sbGlowP)" />
      <Circle cx={W * 0.94} cy={H * 0.62} r={W * 0.4} fill="url(#sbGlowP)" />
      <Circle cx={W * 0.1} cy={H * 0.9} r={W * 0.38} fill="url(#sbGlowP)" />
      {stars.map((st, i) => (
        <Circle key={i} cx={st.x} cy={st.y} r={st.r} fill="#ffffff" fillOpacity={st.o} />
      ))}
    </Svg>
  );
}

export default function MainScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { records, tripGroups } = useRecords();

  // ── 튜토리얼(코치마크) ──
  // 측정 대상: 지구본(WebView) / 모드 토글 / 지구본 설정 버튼 / 스냅 버튼 / FAB. measureInWindow를 쓰므로 any로 둔다.
  const globeRef = useRef<any>(null);
  const toggleRef = useRef<any>(null);
  const settingsRef = useRef<any>(null);
  // 스냅 버튼은 탭 바 오버레이(RecordFab) 안이라 직접 측정이 불가하다.
  // 같은 절대 제약(right:46, bottom:insets.bottom+129, 60×60)으로 숨김 앵커를 깔고 이를 측정해
  // Dimensions 높이 오차(내비바 등) 없이 실제 위치를 얻는다.
  const snapAnchorRef = useRef<any>(null);
  const [coachVisible, setCoachVisible] = useState(false);
  const [coachSteps, setCoachSteps] = useState<CoachStep[]>([]);

  // 튜토리얼 중에는 탭 바도 함께 어둡게 처리되도록 전역 신호 동기화.
  useEffect(() => {
    setCoachActive(coachVisible);
    return () => setCoachActive(false);
  }, [coachVisible]);

  const measure = (ref: React.MutableRefObject<any>) =>
    new Promise<CoachRect | null>((resolve) => {
      const node = ref.current;
      if (!node || typeof node.measureInWindow !== 'function') return resolve(null);
      node.measureInWindow((x: number, y: number, width: number, height: number) => {
        if ([x, y, width, height].some((v) => typeof v !== 'number' || Number.isNaN(v))) {
          resolve(null);
        } else {
          resolve({ x, y, width, height });
        }
      });
    });

  // 기록 완성 화면에서 "튜토리얼 진행하기"로 들어온 경우 자동 시작
  useEffect(() => {
    if (!route.params?.startTutorial) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const [globe, toggle, settings, snapMeasured] = await Promise.all([
        measure(globeRef),
        measure(toggleRef),
        measure(settingsRef),
        measure(snapAnchorRef), // 숨김 앵커 → 스냅 버튼 실제 위치
      ]);
      if (cancelled) return;
      // FAB(+) 는 CustomTabBar 레이어(탭 바 위)로 이동해 ref 측정이 불가하다.
      // 위치가 결정적이라 RecordFab 와 동일한 상수로 강조 영역을 계산한다.
      const WIN_W = Dimensions.get('window').width;
      const FAB_BTN = 56;
      const fab: CoachRect = {
        x: WIN_W / 2 - FAB_BTN / 2,
        y: height - ((insets.bottom || 0) + 73) - FAB_BTN, // 하단 중앙, 탭 바 위 겹침
        width: FAB_BTN,
        height: FAB_BTN,
      };
      const SNAP_BTN = 60;
      // 측정 성공 시 실제 위치, 실패 시 상수 폴백
      const snap: CoachRect = snapMeasured ?? {
        x: WIN_W - 46 - SNAP_BTN, // 우측 (오른쪽 모서리 46px 안쪽)
        y: height - ((insets.bottom || 0) + 129) - SNAP_BTN, // 탭 바 위 우측
        width: SNAP_BTN,
        height: SNAP_BTN,
      };
      // 하단 버튼(스냅·FAB)을 강조하는 단계의 말풍선은 가장 높은 하단 버튼(스냅) 위로 올린다.
      // 스냅·FAB는 탭 바 위 오버레이(말풍선보다 앞 레이어)라, 겹치면 버튼이 말풍선을 가리기 때문.
      // 박스 하단을 스냅 버튼 위 24px 지점에 고정 → 위로 펼쳐짐. (측정된 실제 y 기준)
      const bottomTipBottom = height - snap.y + 24;
      // 스냅 버튼은 원형이라 사각형 대신 원형 스포트라이트로 강조(사각 테두리 제거).
      // 반지름은 기존 사각 강조(버튼 + PAD 8)와 동일하게 유지.
      const snapCircle = {
        cx: snap.x + snap.width / 2,
        cy: snap.y + snap.height / 2,
        r: snap.width / 2 + 8,
      };
      // 지구본(WebView)의 실제 프레임에서 three.js 투영 상수로 원을 계산.
      // GlobeView는 두 형태(aurora·classic) 모두 카메라를 화면 정중앙(camera.position.y=0)에 두고
      // 디스크를 화면 폭의 85%로 그린다 → 중심=세로 정중앙, 반지름≈폭×0.44(지름 0.85의 반 + 여유).
      const globeCircle = globe
        ? { cx: globe.x + globe.width / 2, cy: globe.y + globe.height / 2, r: globe.width * 0.44 }
        : undefined;
      setCoachSteps([
        {
          rect: globe,
          shape: 'circle', // 지구본은 원형으로 강조
          circleWin: globeCircle,
          title: '여행 지구본 🌏',
          desc: '방문한 나라가 활성화돼요. 나라를 탭하면 그 나라의 기록을 추가하거나 볼 수 있어요.',
        },
        { rect: toggle, title: '지구본 · 대륙 전환', desc: '지구본과 대륙(국가 지역) 지도를 자유롭게 전환할 수 있어요.' },
        { rect: settings, title: '지구본 형태 전환', desc: '버튼을 누를 때마다 기록한 나라를 색상 지구본과 사진 지구본으로 번갈아 전환할 수 있어요.' },
        { rect: snap, shape: 'circle', circleWin: snapCircle, tipBottom: bottomTipBottom, keepBright: 'snap', title: '스냅 기록 ⚡', desc: '여행지에 도착한 순간을 빠르게 남기는 스냅 기록이에요.' },
        { rect: fab, tipBottom: bottomTipBottom, keepBright: 'fab', title: '기록 추가 +', desc: '피드 · 블로그 · 스트립 · 사진첩 등 원하는 형식으로 새 기록을 추가해요.' },
      ]);
      setCoachVisible(true);
      // 재진입(탭 전환 후 복귀) 시 다시 뜨지 않도록 플래그 제거
      navigation.setParams({ startTutorial: undefined });
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [route.params?.startTutorial]);

  // 실제 미확인 알림 수에 연동돼야 함. 현재 알림 소스(NOTIS)가 비어 있어 기본은 점 없음.
  // (추후 알림 스토어가 생기면 미확인 개수>0일 때 true로 연동)
  const [hasUnreadAlerts, setHasUnreadAlerts] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // 광고(스폰서) 패키지 — 지구본 마커 탭 시 뜨는 카드
  const [selectedAd, setSelectedAd] = useState<SponsoredPackage | null>(null);
  // 지구본 팝업광고(스폰서 마커) 노출 여부 — 현재 숨김(추후 활성화 시 true)
  const SHOW_GLOBE_ADS = false;
  const sponsoredMarkerItems = useMemo(() => (SHOW_GLOBE_ADS ? getSponsoredMarkerItems() : []), []);
  // 방문한 나라 바텀시트 활성화 여부 (첫 출시 시 제외, 추후 보완하여 활성화 예정)
  const SHOW_VISITED_SHEET = false;
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [countrySheetOpen, setCountrySheetOpen] = useState(false);

  // 기록형식 선택 모달
  const [formatModalVisible, setFormatModalVisible] = useState(false);
  const [pendingCountry, setPendingCountry] = useState<{ name: string; code: string; region?: string; regionEn?: string } | null>(null);

  // 지역(주) 기존 기록 보기 모달
  const [regionRecordsVisible, setRegionRecordsVisible] = useState(false);
  const [regionRecords, setRegionRecords] = useState<TravelRecord[]>([]);
  const [regionRecordsTitle, setRegionRecordsTitle] = useState('');

  // 지구본/대륙 표시 설정 — settingsStore에서 영속 관리
  const {
    globeVariant, setGlobeVariant,
    globeDisplayMode, setGlobeDisplayMode,
    regionGlobalMode, setRegionGlobalMode,
    globeColor, setGlobeColor,
    countryColors, setCountryColors,
    countryDisplayModes, setCountryDisplayModes,
    regionDisplayModes, setRegionDisplayModes,
    regionColors, setRegionColors,
  } = useSettings();
  const [displaySettingsVisible, setDisplaySettingsVisible] = useState(false);
  const [editingCountryColor, setEditingCountryColor] = useState<string | null>(null);
  const [dsShowMoreColors, setDsShowMoreColors] = useState(false); // 기본 색상 팔레트 '+' 확장

  // 표시 설정 모달은 라이브로 적용되므로, 열 때 스냅샷을 떠두고 "취소(바깥 탭)" 시 원복한다
  const dsSnapshot = useRef<{
    globeDisplayMode: MapDisplayMode;
    globeColor: string;
    countryColors: Record<string, string>;
    countryDisplayModes: Record<string, MapDisplayMode>;
    regionGlobalMode: 'color' | 'photo';
    regionDisplayModes: Record<string, 'color' | 'photo'>;
    regionColors: Record<string, string>;
  } | null>(null);
  const openDisplaySettings = () => {
    dsSnapshot.current = { globeDisplayMode, globeColor, countryColors, countryDisplayModes, regionGlobalMode, regionDisplayModes, regionColors };
    setDisplaySettingsVisible(true);
  };
  const cancelDisplaySettings = () => {
    const s = dsSnapshot.current;
    if (s) {
      setGlobeDisplayMode(s.globeDisplayMode);
      setGlobeColor(s.globeColor);
      setCountryColors(s.countryColors);
      setCountryDisplayModes(s.countryDisplayModes);
      setRegionGlobalMode(s.regionGlobalMode);
      setRegionDisplayModes(s.regionDisplayModes);
      setRegionColors(s.regionColors);
    }
    dsSnapshot.current = null;
    setEditingCountryColor(null);
    setDisplaySettingsVisible(false);
  };
  const confirmDisplaySettings = () => {
    dsSnapshot.current = null;
    setEditingCountryColor(null);
    setDisplaySettingsVisible(false);
  };

  // 갤러리에서 사진 가져오기 → 표시 모드를 사진으로 전환
  const handlePickGlobePhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { showPermissionDeniedAlert('갤러리'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!res.canceled) {
      setGlobeDisplayMode('photo');
      setEditingCountryColor(null);
    }
  };

  // (국가/지역별 개별 표시 설정도 settingsStore에서 영속 관리 — 위 useSettings 참조)

  // 지구본/대륙 전환
  const [viewMode, setViewMode] = useState<'globe' | 'region'>('globe');
  const [regionCountry, setRegionCountry] = useState<string | null>(null); // ISO3 코드
  // 대륙(국가 지역) 화면 검색/필터
  const [regionSearch, setRegionSearch] = useState('');
  const [popularActive, setPopularActive] = useState(false); // "인기명소 모아보기" — 눌러야 도시 선/강조 표시

  // 영→한 역매핑
  const EN_TO_KO: Record<string, string> = useMemo(() => {
    const m: Record<string, string> = {};
    Object.entries(KO_TO_EN).forEach(([ko, en]) => { m[en] = ko; });
    return m;
  }, []);

  // 기록된 국가 → GlobeView에 전달할 방문국가 목록
  const visitedNameSet = useMemo(() => {
    const nameSet = new Set<string>();
    records.forEach(r => {
      if (r.viewType === 'snap') return; // 스냅만 기록된 국가는 지구본 활성화 제외 (실제 기록이 있어야 활성화)
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

  // 특정 국가의 대표 사진 찾기 (records만 읽으므로 useCallback으로 안정화 → visitedCountries memo가 매 렌더 재계산되지 않음)
  const getCountryPhoto = useCallback((countryName: string) => {
    const matchingRecords = records.filter(r => r.countryName === countryName || r.countries?.some(c => c.name === countryName));
    for (const r of matchingRecords) {
      if (r.perCountryData?.[countryName]?.representativePhoto) {
        return r.perCountryData[countryName].representativePhoto;
      }
      if (r.countryName === countryName && r.representativePhoto) {
        return r.representativePhoto;
      }
      if (r.viewType === 'cut' && r.cutPhoto?.previewUri) {
        return r.cutPhoto.previewUri;
      }
      if (r.viewType === 'snap' && r.snapBackUri) {
        return r.snapBackUri;
      }
      if (r.medias && r.medias.length > 0) {
        return r.medias[0];
      }
    }
    return null; // 실제 기록 사진이 없으면 사진 없음(색상 모드) — 가짜 stock 이미지 제거
  }, [records]);

  // 지구본(WebView)은 file:// 이미지를 직접 못 그려서, 대표 사진을 작은 data URI(base64)로 변환해 캐시
  const globePhotoCacheRef = useRef<Record<string, string>>({});
  const [globePhotoVersion, setGlobePhotoVersion] = useState(0);

  const visitedCountries: VisitedCountry[] = useMemo(() => {
    return Array.from(visitedNameSet).map(nameEn => {
      const koName = EN_TO_KO[nameEn] || nameEn;
      return {
        nameEn,
        color: countryColors[nameEn] || undefined,
        photo: getCountryPhoto(koName) || undefined,
        mode: countryDisplayModes[nameEn] || undefined,
      };
    });
  }, [visitedNameSet, countryColors, countryDisplayModes, EN_TO_KO, getCountryPhoto]);

  // 대표 사진(file://)을 지구본용 data URI 로 변환 (아직 변환 안 된 것만)
  useEffect(() => {
    let cancelled = false;
    const uris = Array.from(new Set(visitedCountries.map(c => c.photo).filter(Boolean) as string[]));
    const todo = uris.filter(u => globePhotoCacheRef.current[u] === undefined);
    if (todo.length === 0) return;
    (async () => {
      let changed = false;
      for (const u of todo) {
        const d = await imageToDataUri(u);
        if (cancelled) return;
        globePhotoCacheRef.current[u] = d ?? ''; // '' = 변환 실패(재시도 안 함)
        if (d) changed = true;
      }
      if (changed && !cancelled) setGlobePhotoVersion(v => v + 1);
    })();
    return () => { cancelled = true; };
  }, [visitedCountries]);

  // 지구본 형태별 강제 표시 모드: aurora = 색상(color), classic = 사진(photo)
  const globeForcedMode: GlobeDisplayMode = globeVariant === 'aurora' ? 'color' : 'photo';
  // 폼이 모드를 강제하므로 개별 mode를 덮어쓰고, 사진은 변환된 data URI 로 교체
  const globeVisitedCountries = useMemo(
    () => visitedCountries.map(c => ({
      ...c,
      mode: globeForcedMode,
      photo: c.photo ? (globePhotoCacheRef.current[c.photo] || undefined) : undefined,
    })),
    [visitedCountries, globeForcedMode, globePhotoVersion],
  );

  // 현재 선택된 대륙 국가의 기록된 지역 목록
  const recordedRegions = useMemo(() => {
    if (!regionCountry) return [];
    const countryKo = ISO3_TO_KO[regionCountry];
    if (!countryKo) return [];

    const regionsMap = new Map<string, { name: string; nameEn: string; key: string; photo?: string; mode?: 'color' | 'photo'; color?: string }>();

    // 실제 기록(store)에서 이 국가의 기록된 지역 수집
    records.forEach(r => {
      if (r.viewType === 'snap') return; // 스냅만 기록된 지역은 대륙(지역) 활성화 제외
      const matchCountry = r.countryName === countryKo || r.countries?.some(c => c.name === countryKo);
      if (matchCountry && r.regionNameEn) {
        let photo: string | undefined;
        if (r.perCountryData?.[countryKo]?.representativePhoto) {
          photo = r.perCountryData[countryKo].representativePhoto;
        } else if (r.countryName === countryKo && r.representativePhoto) {
          photo = r.representativePhoto;
        } else if (r.viewType === 'cut' && r.cutPhoto?.previewUri) {
          photo = r.cutPhoto.previewUri;
        } else if (r.medias && r.medias.length > 0) {
          photo = r.medias[0];
        }

        const key = `${regionCountry}|${r.regionNameEn}`; // 국가별 복합 키 (동명 지역 충돌 방지)
        regionsMap.set(r.regionNameEn, {
          name: r.regionName || r.regionNameEn,
          nameEn: r.regionNameEn,
          key,
          photo,
          mode: regionDisplayModes[key] || undefined,
          color: regionColors[key] || undefined,
        });
      }
    });

    return Array.from(regionsMap.values());
  }, [records, regionCountry, regionDisplayModes, regionColors]);

  // 고아(orphan) 표시 설정 정리 — 기록이 사라진 국가/지역의 설정을 영속 저장소에서 제거
  // (영속화 이후 누적 방지. 변경 없으면 같은 참조 반환 → 불필요한 저장/렌더 없음)
  useEffect(() => {
    const validRegions = new Set<string>();
    records.forEach(r => { if (r.regionNameEn) validRegions.add(r.regionNameEn); });
    const prune = <T,>(obj: Record<string, T>, valid: Set<string>): Record<string, T> => {
      const remove = Object.keys(obj).filter(k => !valid.has(k));
      if (remove.length === 0) return obj;
      const next = { ...obj };
      remove.forEach(k => delete next[k]);
      return next;
    };
    // 지역 키는 `${ISO3}|${regionEn}` 복합 → region 부분만 떼서 유효성 검사
    const pruneRegion = <T,>(obj: Record<string, T>): Record<string, T> => {
      const remove = Object.keys(obj).filter(k => {
        const regionPart = k.includes('|') ? k.split('|')[1] : k;
        return !validRegions.has(regionPart);
      });
      if (remove.length === 0) return obj;
      const next = { ...obj };
      remove.forEach(k => delete next[k]);
      return next;
    };
    setCountryColors(prev => prune(prev, visitedNameSet));
    setCountryDisplayModes(prev => prune(prev, visitedNameSet));
    setRegionDisplayModes(prev => pruneRegion(prev));
    setRegionColors(prev => pruneRegion(prev));
  }, [records, visitedNameSet, setCountryColors, setCountryDisplayModes, setRegionDisplayModes, setRegionColors]);

  const sheetAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const countrySheetAnim = useRef(new Animated.Value(COUNTRY_SHEET_HEIGHT)).current;
  const countryOverlayAnim = useRef(new Animated.Value(0)).current;

  // FAB(기록 추가)는 CustomTabBar 레이어의 RecordFab 로 이동 (탭 바 위 겹침). 여기선 렌더하지 않음.

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

  // 국가 시트에서 여행 기록 탭 → 그 기록이 속한 '여행 기록 카드'(TripDetail)로 이동.
  // ProfileScreen의 여행 카드(mappedThumbnails)와 동일한 파라미터를 만들어, 어디서 열든 같은 카드가 뜨게 한다.
  // TripDetail은 trip.id로 라이브 그룹을 다시 찾으므로 id(group.id)만 맞으면 기록·제목·기간이 실측된다.
  // 그룹이 없는 예외 기록(국가/날짜 없음)만 기존처럼 기록 상세(PostDetail)로 폴백.
  const openTripCardForRecord = (rec: TravelRecord) => {
    closeCountrySheet();
    const group = tripGroups.find((g) => g.records.includes(rec.id));
    if (!group) {
      navigation.navigate('PostDetail', { postId: rec.id });
      return;
    }
    const groupRecords = group.records
      .map((id) => records.find((r) => r.id === id))
      .filter(Boolean) as TravelRecord[];
    const firstRec = groupRecords[0] ?? rec;
    const flag = firstRec.countryFlag || '';
    const title = flag && group.title.startsWith(flag) ? group.title.slice(flag.length).trim() : group.title;
    navigation.navigate('TripDetail', {
      trip: {
        id: group.id,
        emoji: firstRec.user?.emoji || '🗼',
        title,
        country: firstRec.countryName || rec.countryName || '',
        countryFlag: firstRec.countryFlag || '',
        date: firstRec.date ? firstRec.date.slice(0, 7) : (rec.date ? rec.date.slice(0, 7) : ''),
        // ProfileScreen mappedThumbnails와 동일: 자동 그룹 id는 그라데이션 키가 아니므로 기본값
        color: 'trip-japan',
        records: groupRecords.map((r) => ({ id: r.id, viewType: r.viewType || 'feed' })),
      },
    });
  };

  const handleGlobeMessage = (e: any) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data.type === 'sponsoredTapped') {
        const pkg = getSponsoredByCountryEn(data.countryEn);
        if (pkg) setSelectedAd(pkg);
        return;
      }
      if (data.type === 'countryTapped') {
        const koreanName = data.country;
        // 스냅만 있는 국가는 활성화되지 않으므로 '기록 없음'으로 취급(탭 시 새 기록 추가)
        const hasRecord = records.some(r => r.viewType !== 'snap' && (r.countryName === koreanName || r.countries?.some(c => c.name === koreanName)));

        if (hasRecord && koreanName) {
          openCountrySheet(koreanName);
        } else {
          setPendingCountry({ name: koreanName || data.countryEn, code: '' });
          setFormatModalVisible(true);
        }
      }
    } catch (err) {
      if (__DEV__) console.warn('지구본 메시지 파싱 실패:', err, e?.nativeEvent?.data);
    }
  };

  // 국가 지도 지역 탭 핸들러
  const handleRegionMessage = (e: any) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data.type === 'regionTapped') {
        const countryKo = ISO3_TO_KO[data.countryCode] || data.countryCode;
        const regionName = data.region || data.regionEn;
        setPendingCountry({
          name: `${countryKo} - ${regionName}`,
          code: data.countryCode,
          region: data.region,
          regionEn: data.regionEn,
        });
        // 이 지역(주)의 기존 기록 찾기 (스냅은 활성화 대상이 아니므로 제외)
        const matched = records.filter(r => {
          if (r.viewType === 'snap') return false;
          const inCountry = r.countryName === countryKo || r.countries?.some(c => c.name === countryKo);
          const regionMatch =
            (data.regionEn && r.regionNameEn === data.regionEn) ||
            (data.region && r.regionName === data.region);
          return inCountry && regionMatch;
        });
        if (matched.length > 0) {
          setRegionRecords(matched);
          setRegionRecordsTitle(`${countryKo} · ${regionName}`);
          setRegionRecordsVisible(true);
        } else {
          setFormatModalVisible(true);
        }
      }
    } catch (err) {
      if (__DEV__) console.warn('지역 지도 메시지 파싱 실패:', err, e?.nativeEvent?.data);
    }
  };

  const handleFormatSelect = (type: string) => {
    setFormatModalVisible(false);
    if (!pendingCountry) return;
    const SCREEN_MAP: Record<string, RecordFormatScreen> = {
      feed: 'NewRecord',
      blog: 'BlogRecord',
      cut: 'CutRecord',
      snap: 'SnapRecord',
      album: 'AlbumCreate',
    };
    navigation.navigate(SCREEN_MAP[type] ?? 'NewRecord', {
      selectedCountry: pendingCountry,
    });
    setPendingCountry(null);
  };

  return (
    // 배경을 지구본 배경(#0A0A0F)과 동일하게 — 하단에 보라색이 남지 않고 끝까지 이어짐
    <LinearGradient colors={['#0A0A0F', '#0A0A0F']} style={styles.container}>

      {/* ── 전체화면 우주배경 (별·글로우) — 모든 콘텐츠 뒤, 터치 통과 ── */}
      <SpaceBackdrop />

      {/* 튜토리얼용 숨김 앵커 — 탭 바 오버레이의 스냅 버튼(RecordFab)과 동일한 절대 제약.
          코치마크가 이 위치를 측정해 스냅 버튼을 정확히 강조한다(보이지 않음·터치 통과). */}
      <View
        ref={snapAnchorRef}
        collapsable={false}
        pointerEvents="none"
        style={{ position: 'absolute', right: 46, bottom: (insets.bottom || 0) + 129, width: 60, height: 60, opacity: 0 }}
      />

      {/* ── 전체화면 지구본 — 헤더/토글 뒤(화면 맨 위~맨 아래). 헤더·토글이 위로 오버레이됨 ── */}
      {viewMode === 'globe' && (
        <View ref={globeRef} collapsable={false} style={StyleSheet.absoluteFill}>
          <GlobeView size={undefined} fullscreen onMessage={handleGlobeMessage} visitedCountries={globeVisitedCountries} displayMode={globeForcedMode} defaultColor={globeColor} variant={globeVariant} sponsoredItems={sponsoredMarkerItems} />
        </View>
      )}

      {/* ── 헤더 ── */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
        {/* 로고를 살짝 위로 (레이아웃 영향 없이 시각적으로만 이동) */}
        <View style={{ transform: [{ translateY: -8 }] }}>
          <EorthLogo width={125} height={56} />
        </View>
        <TouchableOpacity
          style={styles.headerIcon}
          onPress={() => {
            setHasUnreadAlerts(false);
            navigation.navigate('Notifications');
          }}
          accessibilityRole="button"
          accessibilityLabel="알림"
        >
          <NotificationBellIcon size={24} dot={hasUnreadAlerts} />
        </TouchableOpacity>
      </View>

      {/* ── 지구본 / 국가 지도 영역 ── */}
      {/* box-none: 빈 영역 터치는 뒤의 전체화면 글로브로 통과(토글·설정 등 자식만 터치 수신) */}
      <View style={styles.globeArea} pointerEvents="box-none">
        {/* 지구본/대륙 전환 토글 (Liquid Glass) */}
        <View style={styles.modeToggleWrap}>
          {/* 알약 토글 자체만 측정/강조하도록 ref를 내부 래퍼에 부착 (wrap은 가로 전체라 제외) */}
          <View ref={toggleRef} collapsable={false}>
            <SegmentedToggle
              options={[
                { value: 'globe', label: '지구본' },
                { value: 'region', label: '대륙' },
              ]}
              value={viewMode}
              onChange={(v) => { setViewMode(v); setRegionCountry(null); setRegionSearch(''); setPopularActive(false); }}
            />
          </View>
        </View>

        {/* 뷰 렌더링 */}
        {viewMode === 'globe' ? (
          <>
            {/* 영역별 표시설정 버튼 — 누르면 지구본 형태 교체
                (aurora=단색 활성화 ↔ classic=사진 활성화) */}
            <TouchableOpacity
              ref={settingsRef}
              style={styles.globeSettingsBtn}
              activeOpacity={0.7}
              onPress={() => setGlobeVariant(v => (v === 'aurora' ? 'classic' : 'aurora'))}
              accessibilityRole="button"
              accessibilityLabel="지구본 형태 전환"
            >
              <BlurView intensity={50} tint="dark" style={styles.globeSettingsBtnBlur}>
                <GlobeDisplayIcon />
              </BlurView>
            </TouchableOpacity>
          </>
        ) : regionCountry ? (
          <>
            {/* 검색바 (Figma 8:385) */}
            <View style={styles.regionSearchWrap}>
              <TextInput
                style={styles.regionSearchInput}
                value={regionSearch}
                onChangeText={setRegionSearch}
                placeholder="구체적인 지역을 검색해주세요"
                placeholderTextColor="#A9A9A9"
                returnKeyType="search"
              />
              {regionSearch.length > 0 && (
                <TouchableOpacity
                  style={styles.regionClearBtn}
                  activeOpacity={0.7}
                  onPress={() => setRegionSearch('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="검색어 지우기"
                >
                  <Text style={styles.regionClearText}>✕</Text>
                </TouchableOpacity>
              )}
              <SearchLineIcon size={24} color="#A9A9A9" />
            </View>

            {/* 필터 칩 행 (Figma 8:392 + 8:395), 우측 정렬 + 가로 스크롤 */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.regionChipsRow}
              contentContainerStyle={styles.regionChipsContent}
            >
              {/* 국가 표시 칩 — 메뉴탭바 배경 테두리(흰색/검은색 베벨) 그라데이션 */}
              <LinearGradient
                colors={['rgba(102,102,102,0)', 'rgba(255,255,255,0.6)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.15, y: 1 }}
                style={styles.regionChipBorder}
              >
                <TouchableOpacity
                  style={styles.regionChipInner}
                  activeOpacity={0.8}
                  onPress={() => setRegionSearch('')}
                >
                  <Text style={styles.regionChipText}>{ISO3_TO_KO[regionCountry] || regionCountry}</Text>
                </TouchableOpacity>
              </LinearGradient>
              {/* 인기명소 모아보기 — 활성: 시안→마젠타 / 비활성: 흰색/검은색 베벨 그라데이션 */}
              <LinearGradient
                colors={popularActive ? ['#00D8F3', '#FF14E4'] : ['rgba(102,102,102,0)', 'rgba(255,255,255,0.6)']}
                start={{ x: 0, y: 0 }}
                end={popularActive ? { x: 1, y: 1 } : { x: 0.15, y: 1 }}
                style={styles.popularChipBorder}
              >
                <TouchableOpacity
                  style={styles.popularChipInner}
                  activeOpacity={0.8}
                  onPress={() => setPopularActive((v) => !v)}
                >
                  <Text style={styles.regionChipText}>인기명소 모아보기 👀</Text>
                </TouchableOpacity>
              </LinearGradient>
            </ScrollView>

            {/* 국가 지역 지도 — globeArea 전체(로고 아래까지)를 채우는 배경. 검색바·칩은 위에 떠 있음 */}
            <View style={styles.regionMapFill}>
              <CountryMapView
                countryCode={regionCountry}
                countryName={ISO3_TO_KO[regionCountry] || ''}
                fill
                chipBottom={insets.bottom + 96}
                onMessage={handleRegionMessage}
                recordedRegions={recordedRegions}
                displayMode={regionGlobalMode}
                defaultColor={countryColors[KO_TO_EN[ISO3_TO_KO[regionCountry]]] || globeColor}
                searchQuery={regionSearch}
                showPopular={popularActive}
              />
            </View>
            {/* 뒤로가기 버튼 (Figma — 좌측 셰브론 아이콘) */}
            <TouchableOpacity
              style={styles.regionBackBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={() => { setRegionCountry(null); setRegionSearch(''); setPopularActive(false); }}
              accessibilityRole="button"
              accessibilityLabel="국가 선택으로 돌아가기"
            >
              <Svg width={16} height={28} viewBox="33 156 12 22">
                <SvgPath
                  d="M42.0981 159.422C42.6142 158.924 43.4364 158.939 43.9345 159.455C44.4326 159.971 44.418 160.793 43.9019 161.291L43 160.357L42.0981 159.422ZM36 167.348L35.0629 168.248C34.5827 167.747 34.5804 166.958 35.0578 166.454L36 167.348ZM43.9371 173.744C44.4337 174.262 44.4168 175.084 43.8992 175.58C43.3817 176.077 42.5595 176.06 42.0629 175.542L43 174.643L43.9371 173.744ZM38.653 164.552L37.7108 163.658L37.7305 163.638L37.7511 163.618L38.653 164.552ZM36 167.348L36.9371 166.449L43.9371 173.744L43 174.643L42.0629 175.542L35.0629 168.248L36 167.348ZM43 160.357L43.9019 161.291L39.5549 165.487L38.653 164.552L37.7511 163.618L42.0981 159.422L43 160.357ZM38.653 164.552L39.5952 165.446L36.9422 168.242L36 167.348L35.0578 166.454L37.7108 163.658L38.653 164.552Z"
                  fill="#FFFFFF"
                  fillOpacity={0.6}
                />
              </Svg>
            </TouchableOpacity>
            {/* 영토 표시 설정 (대륙 모드에서도 진입) */}
            <TouchableOpacity
              style={styles.globeSettingsBtn}
              activeOpacity={0.7}
              onPress={openDisplaySettings}
              accessibilityRole="button"
              accessibilityLabel="영토 표시 설정"
            >
              <BlurView intensity={50} tint="dark" style={styles.globeSettingsBtnBlur}>
                <GlobeDisplayIcon />
              </BlurView>
            </TouchableOpacity>
          </>
        ) : (
          /* 국가 선택 그리드 */
          <View style={[styles.countryGrid, { paddingBottom: insets.bottom + 73 }]}>
            <Text style={styles.countryGridTitle}>국가를 선택하세요</Text>
            <Text style={styles.countryGridSub}>지역별로 기록할 수 있는 국가입니다</Text>
            <View style={styles.countryGridList}>
              {REGION_COUNTRIES.map(c => (
                <TouchableOpacity
                  key={c.code}
                  style={styles.countryGridItem}
                  activeOpacity={0.7}
                  onPress={() => { setRegionCountry(c.code); setRegionSearch(''); setPopularActive(false); }}
                >
                  <Text style={styles.countryGridFlag}>{c.flag}</Text>
                  <Text style={styles.countryGridName}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* 스냅 버튼(SNAP)은 CustomTabBar 레이어의 RecordFab 로 이동 (탭 바 위 우측에 떠 있음) */}

      {/* ── 하단 핸들 바 (시트 닫혔을 때 노출) ── */}
      {SHOW_VISITED_SHEET && !sheetOpen && (
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
      {SHOW_VISITED_SHEET && sheetOpen && (
        <Animated.View
          style={[styles.overlay, { opacity: overlayAnim }]}
          pointerEvents={sheetOpen ? 'auto' : 'none'}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeSheet} activeOpacity={1} />
        </Animated.View>
      )}

      {/* ── 바텀시트 (Liquid Glass) ── */}
      {SHOW_VISITED_SHEET && (
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
      )}

      {/* ── 국가 기록 오버레이 + 바텀시트 (탭바·FAB 위에 표시되도록 Modal로 렌더) ── */}
      <Modal
        visible={countrySheetOpen}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={closeCountrySheet}
      >
        {/* 오버레이 */}
        <Animated.View
          style={[styles.overlay, { opacity: countryOverlayAnim }]}
          pointerEvents="auto"
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeCountrySheet} activeOpacity={1} />
        </Animated.View>

        {/* 바텀시트 (Liquid Glass) */}
        <Animated.View
          style={[
            styles.countrySheet,
            { transform: [{ translateY: countrySheetAnim }] },
          ]}
          pointerEvents="auto"
          accessibilityViewIsModal
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

        {/* 여행 기록 리스트 (실제 기록) */}
        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={styles.countryRecordList}>
            {(selectedCountry
              ? records.filter(r => r.countryName === selectedCountry || r.countries?.some(c => c.name === selectedCountry))
              : []
            ).map((rec) => (
              <TouchableOpacity
                key={rec.id}
                style={styles.countryRecordCard}
                activeOpacity={0.7}
                onPress={() => openTripCardForRecord(rec)}
              >
                <View style={styles.countryRecordRow}>
                  <Text style={styles.countryRecordDate}>{rec.date}</Text>
                  {!!rec.rating && <Text style={styles.countryRecordRating}>{'★'.repeat(rec.rating)}</Text>}
                </View>
                <Text style={styles.countryRecordCity}>{rec.regionName || rec.countryName}</Text>
              </TouchableOpacity>
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
      </Modal>

      {/* ── 기록형식 선택 모달 ── */}
      <Modal
        visible={formatModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFormatModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.fmOverlay}
          accessibilityViewIsModal
          activeOpacity={1}
          onPress={() => setFormatModalVisible(false)}
        >
          <View style={styles.fmCard} onStartShouldSetResponder={() => true}>
            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
            <Text style={styles.fmTitle}>기록 형식 선택</Text>
            <Text style={styles.fmSub}>
              {pendingCountry?.name ? `${pendingCountry.name}의 여행을 어떤 형식으로 기록할까요?` : '어떤 형식으로 기록할까요?'}
            </Text>
            <View style={styles.fmGrid}>
              {[
                { type: 'feed',  icon: <FeedIcon />,  name: '피드' },
                { type: 'blog',  icon: <BlogIcon />,  name: '블로그' },
                { type: 'cut',   icon: <CutIcon />,   name: '스트립' },
                { type: 'album', icon: <AlbumIcon />, name: '사진첩' },
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

      {/* ── 지역(주) 기존 기록 보기 모달 ── */}
      <Modal
        visible={regionRecordsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRegionRecordsVisible(false)}
      >
        <TouchableOpacity
          style={styles.fmOverlay}
          accessibilityViewIsModal
          activeOpacity={1}
          onPress={() => setRegionRecordsVisible(false)}
        >
          <View style={styles.rrCard} onStartShouldSetResponder={() => true}>
            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
            <Text style={styles.fmTitle}>{regionRecordsTitle}</Text>
            <Text style={styles.fmSub}>{regionRecords.length}개의 기록</Text>

            <ScrollView style={{ width: '100%', maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {regionRecords.map(rec => {
                const photo =
                  rec.representativePhoto ||
                  (rec.regionName && rec.perCountryData?.[rec.countryName]?.representativePhoto) ||
                  rec.cutPhoto?.previewUri ||
                  rec.snapBackUri ||
                  rec.medias?.[0];
                return (
                  <TouchableOpacity
                    key={rec.id}
                    style={styles.rrItem}
                    activeOpacity={0.7}
                    onPress={() => {
                      setRegionRecordsVisible(false);
                      navigation.navigate('PostDetail', { postId: rec.id });
                    }}
                  >
                    {photo ? (
                      <Image source={{ uri: photo }} style={styles.rrThumb} />
                    ) : (
                      <View style={[styles.rrThumb, styles.rrThumbEmpty]} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rrItemTitle} numberOfLines={1}>
                        {rec.regionName || rec.countryName}
                      </Text>
                      <Text style={styles.rrItemDate}>{rec.date}</Text>
                    </View>
                    {!!rec.rating && <Text style={styles.rrRating}>{'★'.repeat(rec.rating)}</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={[styles.countryAddBtn, { width: '100%', marginTop: 16 }]}
              activeOpacity={0.85}
              onPress={() => {
                setRegionRecordsVisible(false);
                setFormatModalVisible(true);
              }}
            >
              <Text style={styles.countryAddBtnText}>+ 새 기록 추가</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── 영토 표시 설정 모달 ── */}
      <Modal
        visible={displaySettingsVisible}
        transparent
        animationType="fade"
        onRequestClose={cancelDisplaySettings}
      >
        <TouchableOpacity
          style={[styles.fmOverlay, { justifyContent: 'flex-start', paddingTop: DS_CARD_TOP }]}
          accessibilityViewIsModal
          activeOpacity={1}
          onPress={cancelDisplaySettings}
        >
          <View style={styles.dsCard} onStartShouldSetResponder={() => true}>
            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
            {/* 그라데이션 유리 테두리 (Figma) — 카드와 정확히 같은 px 크기로 그려 정렬 */}
            <Svg
              width={DS_CARD_W}
              height={DS_CARD_H}
              viewBox="0 0 325 569"
              preserveAspectRatio="none"
              style={{ position: 'absolute', top: 0, left: 0 }}
              pointerEvents="none"
            >
              <SvgDefs>
                <SvgLinearGradient id="dsBorder0" x1="32" y1="18.9326" x2="284.107" y2="511.12" gradientUnits="userSpaceOnUse">
                  <SvgStop stopColor="#666666" />
                  <SvgStop offset="1" stopColor="#666666" stopOpacity="0" />
                </SvgLinearGradient>
                <SvgLinearGradient id="dsBorder1" x1="316.5" y1="553.5" x2="173.5" y2="380.5" gradientUnits="userSpaceOnUse">
                  <SvgStop stopColor="#FFFFFF" />
                  <SvgStop offset="1" stopColor="#999999" stopOpacity="0" />
                </SvgLinearGradient>
              </SvgDefs>
              <SvgRect x={0.85} y={0.85} width={323.3} height={567.3} rx={29.15} fill="none" stroke="url(#dsBorder0)" strokeWidth={1.7} />
              <SvgRect x={0.85} y={0.85} width={323.3} height={567.3} rx={29.15} fill="none" stroke="url(#dsBorder1)" strokeOpacity={0.5} strokeWidth={1.7} />
            </Svg>

            {viewMode === 'globe' ? (
              <>
                <Text style={styles.dsTitle}>영토 표시 설정</Text>
                <Text style={styles.dsSub}>기록한 국가의 영토를 어떻게 표시할지 선택하세요</Text>

                {/* 국기 / 색상 세그먼트 토글 (솔리드 보라 + 라벤더 글로우) */}
                <View style={dsm.toggleRow}>
                  <TouchableOpacity
                    style={[dsm.toggleBtn, globeDisplayMode !== 'color' ? dsm.toggleBtnActive : dsm.toggleBtnIdle]}
                    activeOpacity={0.85}
                    onPress={() => { setGlobeDisplayMode('flag'); setEditingCountryColor(null); }}
                  >
                    <Text style={dsm.toggleText}>국기</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[dsm.toggleBtn, globeDisplayMode === 'color' ? dsm.toggleBtnActive : dsm.toggleBtnIdle]}
                    activeOpacity={0.85}
                    onPress={() => setGlobeDisplayMode('color')}
                  >
                    <Text style={dsm.toggleText}>색상</Text>
                  </TouchableOpacity>
                </View>

                {/* 갤러리에서 가져오기 */}
                <TouchableOpacity style={dsm.galleryBtn} activeOpacity={0.85} onPress={handlePickGlobePhoto}>
                  <Text style={dsm.galleryText}>갤러리에서 가져오기</Text>
                </TouchableOpacity>

                {/* 기본 색상 팔레트 */}
                <Text style={dsm.sectionLabel}>기본 색상</Text>
                <View style={dsm.paletteRow}>
                  {DS_PALETTE.map(c => (
                    <TouchableOpacity key={c} activeOpacity={0.8} onPress={() => { setGlobeColor(c); setGlobeDisplayMode('color'); }}>
                      <View style={[dsm.swatch, { backgroundColor: c }, globeColor === c && dsm.swatchActive]} />
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity activeOpacity={0.8} onPress={() => setDsShowMoreColors(v => !v)}>
                    <View style={dsm.addSwatch}>
                      <Svg width={18} height={18} viewBox="0 0 14 14">
                        <SvgPath d="M7 1.5a1 1 0 0 1 1 1V6h3.5a1 1 0 1 1 0 2H8v3.5a1 1 0 1 1-2 0V8H2.5a1 1 0 1 1 0-2H6V2.5a1 1 0 0 1 1-1z" fill="#E7E7E7" fillOpacity={0.7} />
                      </Svg>
                    </View>
                  </TouchableOpacity>
                </View>
                {dsShowMoreColors && (
                  <View style={[dsm.paletteRow, { marginTop: 10, flexWrap: 'wrap' }]}>
                    {DS_PALETTE_MORE.map(c => (
                      <TouchableOpacity key={c} activeOpacity={0.8} onPress={() => { setGlobeColor(c); setGlobeDisplayMode('color'); }}>
                        <View style={[dsm.swatch, { backgroundColor: c }, globeColor === c && dsm.swatchActive]} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* 국가별 색상 리스트 (하단 페이드) */}
                <Text style={[dsm.sectionLabel, { marginTop: 18 }]}>국가별 색상</Text>
                <View style={dsm.listWrap}>
                  {visitedNameSet.size === 0 ? (
                    <Text style={dsm.emptyHint}>기록한 국가가 없습니다</Text>
                  ) : (
                  <>
                  <ScrollView style={{ flex: 1 }} nestedScrollEnabled showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }}>
                    {Array.from(visitedNameSet).map(nameEn => {
                      const ko = EN_TO_KO[nameEn] || nameEn;
                      const dotColor = countryColors[nameEn] || globeColor;
                      const isEditing = editingCountryColor === nameEn;
                      return (
                        <View key={nameEn}>
                          <TouchableOpacity
                            style={dsm.countryRow}
                            activeOpacity={0.7}
                            onPress={() => setEditingCountryColor(isEditing ? null : nameEn)}
                          >
                            <View style={[dsm.countryDot, { backgroundColor: dotColor }]} />
                            <Text style={dsm.countryName} numberOfLines={1}>{ko}</Text>
                            <Svg width={12} height={8} viewBox="0 0 12 8">
                              <SvgPath d="M1 1.5 6 6.5 11 1.5" stroke="#8B8B91" strokeWidth={1.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            </Svg>
                          </TouchableOpacity>
                          {isEditing && (
                            <View style={dsm.countryPalette}>
                              {[...DS_PALETTE, ...DS_PALETTE_MORE].map(c => (
                                <TouchableOpacity key={c} activeOpacity={0.8} onPress={() => setCountryColors(prev => ({ ...prev, [nameEn]: c }))}>
                                  <View style={[dsm.swatchSm, { backgroundColor: c }, (countryColors[nameEn] || globeColor) === c && dsm.swatchSmActive]} />
                                </TouchableOpacity>
                              ))}
                              {countryColors[nameEn] && (
                                <TouchableOpacity
                                  style={dsm.countryReset}
                                  onPress={() => setCountryColors(prev => { const next = { ...prev }; delete next[nameEn]; return next; })}
                                >
                                  <Text style={dsm.countryResetText}>초기화</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </ScrollView>
                  <LinearGradient
                    colors={['rgba(10,11,15,0)', 'rgba(10,11,15,0.9)']}
                    style={dsm.listFade}
                    pointerEvents="none"
                  />
                  </>
                  )}
                </View>
              </>
            ) : (
              <>
                <Text style={styles.dsTitle}>대륙 지도 표시 설정</Text>
                <Text style={styles.dsSub}>대륙 지도 내 각 지역의 표시 방식을 선택하세요</Text>

                {/* 대륙 글로벌 기본 모드 선택 */}
                <View style={styles.dsColorSection}>
                  <Text style={styles.dsColorLabel}>글로벌 기본 설정</Text>
                  <View style={styles.dsSection}>
                    <TouchableOpacity
                      style={[styles.dsOption, regionGlobalMode !== 'photo' && styles.dsOptionActive]}
                      activeOpacity={0.7}
                      onPress={() => setRegionGlobalMode('color')}
                    >
                      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: globeColor }} />
                      <Text style={[styles.dsOptionText, regionGlobalMode !== 'photo' && styles.dsOptionTextActive]}>색상</Text>
                      {regionGlobalMode !== 'photo' && <View style={styles.dsCheck} />}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dsOption, regionGlobalMode === 'photo' && styles.dsOptionActive]}
                      activeOpacity={0.7}
                      onPress={() => setRegionGlobalMode('photo')}
                    >
                      <Text style={{ fontSize: 24 }}>🖼️</Text>
                      <Text style={[styles.dsOptionText, regionGlobalMode === 'photo' && styles.dsOptionTextActive]}>사진</Text>
                      {regionGlobalMode === 'photo' && <View style={styles.dsCheck} />}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 지역별 개별 설정 */}
                <View style={[styles.dsColorSection, { flex: 1, maxHeight: 300 }]}>
                  <Text style={styles.dsColorLabel}>지역별 개별 설정</Text>
                  {recordedRegions.length === 0 ? (
                    <Text style={{ color: '#A1A1B0', fontSize: 13, textAlign: 'center', marginVertical: 20 }}>
                      기록된 지역이 없습니다.
                    </Text>
                  ) : (
                    <ScrollView style={{ flex: 1 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                      {recordedRegions.map(r => {
                        const currentMode = (regionDisplayModes[r.key] || 'default') as 'color' | 'photo' | 'default';
                        const effectiveMode = currentMode === 'default' ? regionGlobalMode : currentMode;
                        const regionColor = regionColors[r.key] || globeColor;
                        const isEditing = editingCountryColor === r.key;

                        return (
                          <View key={r.key} style={{ marginBottom: 8 }}>
                            <View style={styles.dsCountryRow}>
                              {effectiveMode === 'color' ? (
                                <TouchableOpacity
                                  style={[styles.dsCountryDot, { backgroundColor: regionColor }]}
                                  onPress={() => setEditingCountryColor(isEditing ? null : r.key)}
                                />
                              ) : (
                                <View style={[styles.dsCountryDot, { backgroundColor: '#2E2E3B', alignItems: 'center', justifyContent: 'center' }]}>
                                  {effectiveMode === 'photo' && <Text style={{ fontSize: 10 }}>🖼️</Text>}
                                </View>
                              )}
                              <Text style={styles.dsCountryName} numberOfLines={1}>{r.name}</Text>

                              <View style={styles.dsSegmentWrap}>
                                {(['default', 'color', 'photo'] as const).map(m => {
                                  const label = m === 'default' ? '기본' : m === 'color' ? '색상' : '사진';
                                  const active = currentMode === m;
                                  return (
                                    <TouchableOpacity
                                      key={m}
                                      style={[styles.dsSegmentBtn, active && styles.dsSegmentBtnActive]}
                                      onPress={() => {
                                        setRegionDisplayModes(prev => {
                                          const next = { ...prev };
                                          if (m === 'default') {
                                            delete next[r.key];
                                          } else {
                                            next[r.key] = m;
                                          }
                                          return next;
                                        });
                                        if (m !== 'color' && editingCountryColor === r.key) setEditingCountryColor(null);
                                      }}
                                    >
                                      <Text style={[styles.dsSegmentText, active && styles.dsSegmentTextActive]}>{label}</Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            </View>

                            {/* 지역별 색상 선택 (색상 모드일 때 점 탭으로 펼침) */}
                            {isEditing && effectiveMode === 'color' && (
                              <View style={styles.dsCountryPalette}>
                                {[...DS_PALETTE, ...DS_PALETTE_MORE].map(c => (
                                  <TouchableOpacity key={c} activeOpacity={0.8} onPress={() => setRegionColors(prev => ({ ...prev, [r.key]: c }))}>
                                    <View style={[styles.dsColorItemSm, { backgroundColor: c }, (regionColors[r.key] || globeColor) === c && styles.dsColorItemSmActive]} />
                                  </TouchableOpacity>
                                ))}
                                {regionColors[r.key] && (
                                  <TouchableOpacity
                                    style={styles.dsCountryReset}
                                    onPress={() => setRegionColors(prev => { const next = { ...prev }; delete next[r.key]; return next; })}
                                  >
                                    <Text style={styles.dsCountryResetText}>초기화</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>
              </>
            )}

            <TouchableOpacity
              style={dsm.confirmBtn}
              activeOpacity={0.85}
              onPress={confirmDisplaySettings}
            >
              <Text style={dsm.confirmText}>확인</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* FAB(기록 추가)는 CustomTabBar 레이어의 RecordFab 로 렌더 (탭 바 위 겹침) */}

      {/* ── 튜토리얼 코치마크 ── */}
      <MainCoachmark
        visible={coachVisible}
        steps={coachSteps}
        onClose={() => setCoachVisible(false)}
        onStepChange={(step) => setCoachBright(step?.keepBright ?? null)}
      />

      {/* ── 광고(스폰서) 패키지 카드 ── */}
      <SponsoredPackageCard pkg={selectedAd} onClose={() => setSelectedAd(null)} />

    </LinearGradient>
  );
}

// ── 영토 표시 설정 모달 (Figma Frame_2147230197 100% 구현) ──
const dsm = StyleSheet.create({
  toggleRow: { flexDirection: 'row', gap: 11, height: 53, marginBottom: 13 },
  toggleBtn: { flex: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  toggleBtnIdle: { backgroundColor: '#2E2E3B' },
  toggleBtnActive: {
    backgroundColor: '#6B21A8',
    borderWidth: 1.5,
    borderColor: '#CA83FF',
    shadowColor: '#CA83FF',
    shadowOpacity: 0.7,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  toggleText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  galleryBtn: { height: 49, borderRadius: 15, backgroundColor: '#2E2E3B', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  galleryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sectionLabel: { color: '#9A9A9A', fontSize: 13, fontWeight: '600', marginBottom: 14 },
  paletteRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  swatch: { width: 34, height: 34, borderRadius: 17 },
  swatchActive: { borderWidth: 2, borderColor: '#fff' },
  addSwatch: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#2E2E3B', alignItems: 'center', justifyContent: 'center' },
  listWrap: { flex: 1, marginTop: 4, position: 'relative' },
  emptyHint: { color: '#6F6F7A', fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 24 },
  listFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 48 },
  countryRow: { flexDirection: 'row', alignItems: 'center', height: 31, marginBottom: 6 },
  countryDot: { width: 19, height: 19, borderRadius: 9.5, borderWidth: 1, borderColor: '#fff', marginRight: 12 },
  countryName: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700' },
  countryPalette: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8, paddingLeft: 31, alignItems: 'center' },
  swatchSm: { width: 24, height: 24, borderRadius: 12 },
  swatchSmActive: { borderWidth: 2, borderColor: '#fff' },
  countryReset: { paddingHorizontal: 10, height: 24, borderRadius: 12, backgroundColor: '#2E2E3B', alignItems: 'center', justifyContent: 'center' },
  countryResetText: { color: '#A1A1B0', fontSize: 11, fontWeight: '600' },
  confirmBtn: { height: 49, borderRadius: 15, backgroundColor: '#6B21A8', alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ── 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[6],
    paddingBottom: Spacing[3],
  },
  headerLogoImage: {
    width: 95,
    height: 26,
  },
  headerIcon: {
    padding: Spacing[1],
    position: 'relative',
    // 로고가 translateY -8 로 올라가 있어, 종 아이콘도 로고 시각 중심에 맞춰 올림
    transform: [{ translateY: -11 }],
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

  // ── 대륙 지도를 globeArea 전체로 채우는 배경 (검색바·칩 뒤)
  regionMapFill: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },

  // ── 대륙(국가 지역) 검색바 (Figma 8:385: 353×36, radius 23, 흰색 10%)
  regionSearchWrap: {
    zIndex: 2,
    height: 36,
    marginTop: 16,
    marginLeft: 24,
    marginRight: 64, // 우상단 표시 설정 버튼과 겹치지 않도록 여백 확보
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  regionSearchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    letterSpacing: -0.4,
    padding: 0,
    marginRight: 8,
  },
  // ── 검색 초기화(X) 버튼 — 검색 아이콘 옆
  regionClearBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  regionClearText: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '700',
  },
  // ── 필터 칩 행 (Figma 8:392 + 8:395), 우측 정렬
  regionChipsRow: {
    zIndex: 2,
    marginTop: 14,
    flexGrow: 0,
  },
  regionChipsContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 24,
  },
  regionChipBorder: {
    borderRadius: 15.5,
    padding: 1,
  },
  regionChipInner: {
    height: 28,
    borderRadius: 14.5,
    // 불투명이어야 테두리 그라데이션이 배경(가운데)으로 비치지 않음
    // (#751AAD 30%가 다크 배경 위에 깔린 색과 동일)
    backgroundColor: '#2A0F3E',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regionChipActive: {
    borderWidth: 1,
    borderColor: '#00D8F3',
  },
  // ── 인기명소 칩 그라데이션 테두리 (시안→마젠타). LinearGradient 래퍼 + 1px 패딩으로 구현
  popularChipBorder: {
    borderRadius: 15.5,
    padding: 1,
  },
  popularChipInner: {
    height: 28,
    borderRadius: 14.5,
    // 불투명이어야 그라데이션이 가운데로 비치지 않음 (#751AAD 30%가 다크 배경 위에 깔린 색)
    backgroundColor: '#2A0F3E',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regionChipText: {
    color: '#FFFFFF',
    fontSize: 12.6,
    letterSpacing: 0.5,
    lineHeight: 16,
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

  // ── 지역(주) 기존 기록 모달
  rrCard: {
    width: '86%',
    backgroundColor: 'rgba(20,20,32,0.5)',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  rrItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  rrThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#2E2E3B',
  },
  rrThumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rrItemTitle: {
    color: '#fff',
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
  },
  rrItemDate: {
    color: '#A1A1B0',
    fontSize: 12,
    marginTop: 2,
  },
  rrRating: {
    color: '#FFD93D',
    fontSize: 12,
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
  // ── 대륙 모드 - 뒤로가기
  regionBackBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: 12,
    left: 16,
    zIndex: 10,
    padding: 8,
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
    // 상단 토글 바의 흐름 오프셋을 무시하고 지도 영역 전체 기준 수직 정중앙에 배치
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  globeSettingsIcon: {
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── 표시 설정 모달
  dsCard: {
    width: DS_CARD_W,
    height: DS_CARD_H,
    paddingTop: 36,
    paddingHorizontal: DS_PAD,
    paddingBottom: 22,
    borderRadius: 29,
    backgroundColor: 'rgba(10,11,15,0.8)',
    overflow: 'hidden',
  },
  dsTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'left',
    marginBottom: 8,
  },
  dsSub: {
    color: '#9A9A9A',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 18,
    lineHeight: 18,
  },
  dsSection: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  dsOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#2E2E3B',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
    minWidth: 80,
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
  dsSegmentWrap: {
    flexDirection: 'row',
    backgroundColor: '#1E1E28',
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  dsSegmentBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dsSegmentBtnActive: {
    backgroundColor: '#BF85FC',
  },
  dsSegmentText: {
    color: '#A1A1B0',
    fontSize: 12,
    fontWeight: '600',
  },
  dsSegmentTextActive: {
    color: '#fff',
  },
});
