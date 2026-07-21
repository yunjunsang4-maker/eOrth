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
  Platform,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { andFitText } from '../utils/fitText';

// 시트/모달 배경 재질 — iOS는 블러, Android는 매트(고불투명).
// Android BlurView는 experimentalBlurMethod 없이는 no-op이라 지구본이 선명하게 뚫고 비쳤고,
// 대면적 블러는 실험 옵션을 켜도 성능 부담이 있어 매트 폴백을 쓴다 (탭 바 등 소면적만 실제 블러).
const SheetBackdrop = ({ pointerEvents }: { pointerEvents?: 'none' }) =>
  Platform.OS === 'ios' ? (
    <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} pointerEvents={pointerEvents} />
  ) : (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(16,10,30,0.94)' }]}
      pointerEvents={pointerEvents}
    />
  );
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Path as SvgPath, Line as SvgLine, Rect as SvgRect, Defs as SvgDefs, LinearGradient as SvgLinearGradient, RadialGradient as SvgRadialGradient, Stop as SvgStop } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Typography, Spacing, BorderRadius } from '../constants';
import { NotificationBellIcon, SearchLineIcon } from '../components/icons';
import GlobeView, { VisitedCountry, GlobeDisplayMode } from '../components/GlobeView';
import { getGlobeSkinTheme, GLOBE_SKINS } from '../constants/globeSkins';
import { getSkinAccent } from '../constants/skinTheme';
import { imageToDataUri } from '../utils/imageCompress';
import { showPermissionDeniedAlert } from '../utils/permissionAlert';
import CountryMapView from '../components/CountryMapView';
import GrainOverlay from '../components/GrainOverlay';
import MainCoachmark, { CoachStep, CoachRect } from '../components/MainCoachmark';
import { setCoachActive, setCoachBright } from '../components/coachOverlayState';
import { EorthLogo } from '../components/EorthLogo';
import { SegmentedToggle } from '../components/SegmentedToggle';
import SponsoredPackageCard from '../components/SponsoredPackageCard';
import { getSponsoredMarkerItems, getSponsoredByCountryEn, type SponsoredPackage } from '../constants/sponsoredPackages';
import { useRecords } from '../store/recordStore';
import type { TravelRecord } from '../store/recordStore';
import { COUNTRIES } from '../constants/countries';
import { useSettings, type MapDisplayMode, type SkinColorSet, type TaggedRegion } from '../store/settingsStore';
import { getCountryRegionOptions } from '../constants/homeRegions';
import type { TabScreenProps } from '../navigation/types';

const { height, width } = Dimensions.get('window');
// 영토 표시 설정 모달 카드 — Figma 325x569 비율 유지(화면에 맞춰 축소)
const DS_CARD_W = Math.min(325, width - 24);
const DS_CARD_H = Math.min(569, height * 0.86, DS_CARD_W * (569 / 325));
const DS_PAD = DS_CARD_W * (29 / 325); // 좌우 패딩 29 (버튼폭 268)
const DS_CARD_TOP = height * (168.85 / 874); // Figma 목업 기준 카드 상단 위치(가운데 아님, 상단 배치)
// 스킨별 활성화색 팔레트(각 4색). aurora=보라(뒤 2색 노이즈), cyan=시안. 미지정 스킨(mint 등)은 aurora 폴백.
// 채도 -15%(색상·밝기 유지) — 활성화색이 과포화로 튀지 않게 살짝 낮춤. 원본 대비 HSL S만 ×0.85.
const DS_PALETTES: Record<string, string[]> = {
  aurora: ['#DF43E8', '#C88BF6', '#E1CDFB', '#EB19D2'],
  cyan:   ['#15D3EC', '#12CAE1', '#C8F5FB', '#8FF6EC'],
  mint:   ['#8FF6BD', '#12E17A', '#C8FBD0', '#8FF6A0'],
};
// 통계 화면(연도별·대륙별 막대 색)도 이 팔레트를 사용한다 (StatsScreen)
export const getSkinPalette = (skin: string): string[] => DS_PALETTES[skin] || DS_PALETTES.aurora;
// 모노톤 노이즈(0.5px, #00000040 25%) 적용 색(aurora 2색) — GlobeView와 값 일치 필요 (팔레트 채도 감소분 반영)
const NOISE_ACTIVE_COLORS = ['#E1CDFB', '#EB19D2'];
const isNoiseColor = (c: string) => NOISE_ACTIVE_COLORS.indexOf(c) !== -1;
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
  // 2026-07-20 확장 18개국 (인기 여행국 30위 기반, 사용자 확정)
  { code: 'TUR', flag: '🇹🇷', name: '튀르키예' },
  { code: 'GRC', flag: '🇬🇷', name: '그리스' },
  { code: 'AUT', flag: '🇦🇹', name: '오스트리아' },
  { code: 'PRT', flag: '🇵🇹', name: '포르투갈' },
  { code: 'NLD', flag: '🇳🇱', name: '네덜란드' },
  { code: 'THA', flag: '🇹🇭', name: '태국' },
  { code: 'MYS', flag: '🇲🇾', name: '말레이시아' },
  { code: 'VNM', flag: '🇻🇳', name: '베트남' },
  { code: 'SAU', flag: '🇸🇦', name: '사우디아라비아' },
  { code: 'ARE', flag: '🇦🇪', name: '아랍에미리트' },
  { code: 'MAR', flag: '🇲🇦', name: '모로코' },
  { code: 'EGY', flag: '🇪🇬', name: '이집트' },
  { code: 'TUN', flag: '🇹🇳', name: '튀니지' },
  { code: 'ZAF', flag: '🇿🇦', name: '남아프리카공화국' },
  { code: 'MEX', flag: '🇲🇽', name: '멕시코' },
  { code: 'CAN', flag: '🇨🇦', name: '캐나다' },
  { code: 'BRA', flag: '🇧🇷', name: '브라질' },
  { code: 'COL', flag: '🇨🇴', name: '콜롬비아' },
];

// ─── 영토 표시 설정 버튼 아이콘 (스킨색 배경 + 위경도 격자 지구본) — 지구본/대륙 공용 ───
// tint: 원 배경색(알파 포함) — 스킨 pill과 동일 규격(aurora 기본값 = 기존 #751AAD 30%)
const GlobeDisplayIcon = ({ tint = 'rgba(117,26,173,0.3)' }: { tint?: string }) => (
  <Svg width={36} height={36} viewBox="-2 -2 33 33" fill="none">
    <SvgDefs>
      {/* 메뉴바 배경 테두리의 중립 베벨 그라데이션 (검은색 투명 → 흰색) */}
      <SvgLinearGradient id="globeBtnRim" x1="0" y1="0" x2="0.15" y2="1">
        <SvgStop offset="0" stopColor="#666666" stopOpacity="0" />
        <SvgStop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
      </SvgLinearGradient>
    </SvgDefs>
    <Circle cx={14.5} cy={14.5} r={14.5} fill={tint} />
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

// REGION_COUNTRIES에서 파생 — 국가 추가 시 목록 한 곳만 고치면 됨.
// (하드코딩 8개국이던 시절, 신규 국가에서 국가 칩이 ISO3로 뜨고 지역 활성색이 안 그려지는 버그가 있었음)
const ISO3_TO_KO: Record<string, string> = Object.fromEntries(
  REGION_COUNTRIES.map((c) => [c.code, c.name])
);

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

// 국가 시트 헤더 국기 — 로컬 4개국 외에는 전체 국가 목록(COUNTRIES)에서 찾는다.
// (기존엔 4개국 외 모든 방문국이 🌍 폴백으로 표시됐다)
const flagForCountry = (name: string): string =>
  COUNTRY_FLAGS[name] ??
  COUNTRIES.find((c) => c.name === (name === '한국' ? '대한민국' : name))?.flag ??
  '🌍';


// 한국어 국가명 → GeoJSON 영문 이름 매핑 (GlobeView의 KO_NAMES 역방향)
// 사진첩 국가(GPS) 필터도 이 표로 세계 GeoJSON 피처를 찾는다 (AlbumCreateScreen)
export const KO_TO_EN: Record<string, string> = {
  '벨리즈': 'Belize', '베냉': 'Benin', '부르키나파소': 'Burkina Faso', '부룬디': 'Burundi', '중앙아프리카공화국': 'Central African Republic', '지부티': 'Djibouti', '동티모르': 'East Timor', '적도기니': 'Equatorial Guinea', '에리트레아': 'Eritrea', '피지': 'Fiji', '가봉': 'Gabon', '감비아': 'Gambia', '레소토': 'Lesotho', '라이베리아': 'Liberia', '말라위': 'Malawi', '모리타니': 'Mauritania', '르완다': 'Rwanda', '시에라리온': 'Sierra Leone', '솔로몬제도': 'Solomon Islands', '수리남': 'Suriname', '바하마': 'The Bahamas', '트리니다드 토바고': 'Trinidad and Tobago', '바누아투': 'Vanuatu', '코트디부아르': 'Ivory Coast', '기니비사우': 'Guinea Bissau',
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
  '홍콩':'Hong Kong','마카오':'Macau', // 중국에서 분리한 별도 지역
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

// '한국'(과거여행 가져오기 구버전 표기) ↔ '대한민국'(COUNTRIES 표준) 별칭.
// 기록에 두 표기가 섞여 있어(badgeRules도 동일 보정) 이름 비교는 반드시 별칭 집합으로 한다 —
// 아니면 국내 기록의 대표 사진이 지구본에 안 뜨고, '한국' 기록만 있는 사용자는 지구본을
// 탭해도 기존 기록 시트 대신 "새 기록 추가"가 뜬다.
const koAliases = (name?: string | null): string[] =>
  name === '대한민국' || name === '한국' ? ['대한민국', '한국'] : name ? [name] : [];
const matchesCountry = (
  r: { countryName?: string; countries?: { name: string }[] },
  name: string
): boolean => {
  const set = koAliases(name);
  return set.includes(r.countryName ?? '') || !!r.countries?.some((c) => set.includes(c.name));
};

type Props = TabScreenProps<'MainTab'>;

// 기록 형식 선택 → 이동할 수 있는 작성 화면들
type RecordFormatScreen = 'NewRecord' | 'BlogRecord' | 'CutRecord' | 'SnapRecord' | 'AlbumCreate';

// 전체화면 우주배경 — 메인탭 모든 콘텐츠 뒤에 깔리는 별·무드글로우(비상호작용).
// 별은 글로브 WebView(75% 영역) 밖(헤더·탭 영역)까지 화면 전체로 확장된다(첨부 SVG처럼).
function SpaceBackdrop({ glow = '#CA82FF', glow2 = '#1E3AFF' }: { glow?: string; glow2?: string }) {
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
          <SvgStop offset="0%" stopColor={glow} stopOpacity={0.18} />
          <SvgStop offset="70%" stopColor={glow} stopOpacity={0} />
        </SvgRadialGradient>
        <SvgRadialGradient id="sbGlowB" cx="50%" cy="50%" r="50%">
          <SvgStop offset="0%" stopColor={glow2} stopOpacity={0.1} />
          <SvgStop offset="65%" stopColor={glow2} stopOpacity={0} />
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
  const { t, i18n } = useTranslation();
  const { records, tripGroups } = useRecords();
  // 기록의 지역/국가명 현지화 — 영어 모드면 지역은 regionNameEn, 국가는 KO_TO_EN(로컬)
  // 한글 국가명 → 영어(영어 모드). MainScreen은 countryLabel util을 import하면 순환이라 로컬 KO_TO_EN 사용
  const countryEn = (ko: string): string => {
    if (i18n.language !== 'en' || !ko) return ko;
    return ko === '대한민국' ? 'South Korea' : (KO_TO_EN[ko] ?? ko);
  };
  const recPlace = (rec: { regionName?: string; regionNameEn?: string; countryName?: string }): string => {
    if (rec.regionName) return i18n.language === 'en' && rec.regionNameEn ? rec.regionNameEn : rec.regionName;
    return countryEn(rec.countryName || '');
  };

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
  // 유저당 1회 — 이미 봤으면 자동 시작은 스킵하고, 설정의 '튜토리얼 보기'(replay)만 통과
  useEffect(() => {
    if (!route.params?.startTutorial) return;
    if (tutorialSeen && route.params.startTutorial !== 'replay') {
      navigation.setParams({ startTutorial: undefined });
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
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
          title: t('main.coachGlobeTitle'),
          desc: t('main.coachGlobeDesc'),
        },
        { rect: toggle, title: t('main.coachToggleTitle'), desc: t('main.coachToggleDesc') },
        { rect: settings, title: t('main.coachFormTitle'), desc: t('main.coachFormDesc') },
        { rect: snap, shape: 'circle', circleWin: snapCircle, tipBottom: bottomTipBottom, keepBright: 'snap', title: t('main.coachSnapTitle'), desc: t('main.coachSnapDesc') },
        { rect: fab, tipBottom: bottomTipBottom, keepBright: 'fab', title: t('main.coachFabTitle'), desc: t('main.coachFabDesc') },
      ]);
      setCoachVisible(true);
      setTutorialSeen(true); // 유저당 1회 — 표시된 순간 본 것으로 기록(서버 백업 포함)
      // 재진입(탭 전환 후 복귀) 시 다시 뜨지 않도록 플래그 제거
      navigation.setParams({ startTutorial: undefined });
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
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
    globeSkin, setGlobeSkin,
    isPremium,
    globeDisplayMode, setGlobeDisplayMode,
    regionGlobalMode, setRegionGlobalMode,
    globeColor, setGlobeColor,
    countryColors, setCountryColors,
    countryDisplayModes, setCountryDisplayModes,
    regionDisplayModes, setRegionDisplayModes,
    regionColors, setRegionColors,
    taggedRegions, setTaggedRegions,
    dismissedRegionTagChips, setDismissedRegionTagChips,
    skinColorStore, setSkinColorStore,
    tutorialSeen, setTutorialSeen,
  } = useSettings();
  const [displaySettingsVisible, setDisplaySettingsVisible] = useState(false);
  const [editingCountryColor, setEditingCountryColor] = useState<string | null>(null);

  // 표시 설정 모달은 라이브로 적용되므로, 열 때 스냅샷을 떠두고 "취소(바깥 탭)" 시 원복한다
  const dsSnapshot = useRef<{
    globeDisplayMode: MapDisplayMode;
    globeColor: string;
    globeSkin: string;
    countryColors: Record<string, string>;
    countryDisplayModes: Record<string, MapDisplayMode>;
    regionGlobalMode: 'color' | 'photo';
    regionDisplayModes: Record<string, 'color' | 'photo'>;
    regionColors: Record<string, string>;
    skinColorStore: Record<string, SkinColorSet>;
  } | null>(null);
  const openDisplaySettings = () => {
    dsSnapshot.current = { globeDisplayMode, globeColor, globeSkin, countryColors, countryDisplayModes, regionGlobalMode, regionDisplayModes, regionColors, skinColorStore };
    setDisplaySettingsVisible(true);
  };
  const cancelDisplaySettings = () => {
    const s = dsSnapshot.current;
    if (s) {
      // 스킨 먼저 복원 — setGlobeSkin(테마드 세터)이 색 스왑+아이콘 팔레트를 수행하므로, 그 뒤에 스냅샷 색으로 덮어써야 한다
      if (s.globeSkin !== globeSkin) setGlobeSkin(s.globeSkin);
      setGlobeDisplayMode(s.globeDisplayMode);
      setGlobeColor(s.globeColor);
      setCountryColors(s.countryColors);
      setCountryDisplayModes(s.countryDisplayModes);
      setRegionGlobalMode(s.regionGlobalMode);
      setRegionDisplayModes(s.regionDisplayModes);
      setRegionColors(s.regionColors);
      setSkinColorStore(s.skinColorStore); // 미리보기 중 스킨 스왑이 저장소에 남긴 값까지 원복
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
    if (!perm.granted) { showPermissionDeniedAlert(t('permission.gallery')); return; }
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
  // 국가 선택 그리드는 7개+돋보기만 노출 — 전체 목록(26개국)은 검색 시트에서 (사용자 확정 디자인)
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [countryPickerSearch, setCountryPickerSearch] = useState('');
  // 대륙(국가 지역) 화면 검색/필터
  const [regionSearch, setRegionSearch] = useState('');
  const [popularActive, setPopularActive] = useState(false); // "인기명소 모아보기" — 눌러야 도시 선/강조 표시

  // 영→한 역매핑 — 별칭이 있는 영문명은 '먼저 정의된 표준 표기'가 이긴다.
  // (마지막 항목이 덮어쓰면 'South Korea'→'한국'이 되어, '대한민국'으로 저장된
  //  국내 기록의 대표 사진 조회가 전부 빗나갔다)
  const EN_TO_KO: Record<string, string> = useMemo(() => {
    const m: Record<string, string> = {};
    Object.entries(KO_TO_EN).forEach(([ko, en]) => { if (!m[en]) m[en] = ko; });
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
    const aliases = koAliases(countryName); // '한국'/'대한민국' 혼재 기록 모두 매칭
    const matchingRecords = records.filter(r => matchesCountry(r, countryName));
    for (const r of matchingRecords) {
      for (const a of aliases) {
        if (r.perCountryData?.[a]?.representativePhoto) {
          return r.perCountryData[a].representativePhoto;
        }
      }
      if (aliases.includes(r.countryName ?? '') && r.representativePhoto) {
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
  // 지구본 스킨 — 색 활성화(aurora) 폼에만 적용, classic은 기본 테마 유지
  const globeSkinTheme = globeVariant === 'aurora' ? getGlobeSkinTheme(globeSkin) : undefined;
  // 앱 강조색 — 지구본 스킨에 맞춘 통일 색(단계적 마이그레이션). aurora는 기존값과 동일.
  const skinAccent = getSkinAccent(globeSkin);
  // 대륙 칩(국가표시·인기명소) 내부 배경 — 스킨 강조색을 어둡게 깐 불투명색(기존 #2A0F3E 대체)
  const skinChipBg = `rgb(${Math.round(skinAccent.rgb[0] * 0.22)},${Math.round(skinAccent.rgb[1] * 0.22)},${Math.round(skinAccent.rgb[2] * 0.22)})`;
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

    // 소급 태깅 지역 병합 — 기록 유래 지역이 우선, 태그는 nameEn 미중복분만 추가.
    // 태그 지역의 사진은 이 국가 기록의 대표사진 폴백(없으면 undefined → 색 모드).
    const tagged = taggedRegions[regionCountry] || [];
    if (tagged.length > 0) {
      let countryPhoto: string | undefined;
      for (const r of records) {
        if (r.viewType === 'snap') continue;
        const matchCountry = r.countryName === countryKo || r.countries?.some(c => c.name === countryKo);
        if (!matchCountry) continue;
        countryPhoto = r.perCountryData?.[countryKo]?.representativePhoto
          || (r.countryName === countryKo ? r.representativePhoto : undefined)
          || (r.viewType === 'cut' ? r.cutPhoto?.previewUri : undefined)
          || (r.medias && r.medias.length > 0 ? r.medias[0] : undefined);
        if (countryPhoto) break;
      }
      tagged.forEach(tr => {
        if (regionsMap.has(tr.nameEn)) return;
        const key = `${regionCountry}|${tr.nameEn}`;
        regionsMap.set(tr.nameEn, {
          name: tr.name,
          nameEn: tr.nameEn,
          key,
          photo: countryPhoto,
          mode: regionDisplayModes[key] || undefined,
          color: regionColors[key] || undefined,
        });
      });
    }

    return Array.from(regionsMap.values());
  }, [records, regionCountry, regionDisplayModes, regionColors, taggedRegions]);

  // ── 방문 지역 소급 태깅 (지구본 기록만 있는 국가의 대륙 지역 활성화) ──
  const [regionTagSheetVisible, setRegionTagSheetVisible] = useState(false);
  const [regionTagSearch, setRegionTagSearch] = useState('');
  const [regionTagSelection, setRegionTagSelection] = useState<Set<string>>(new Set());
  // 선택 가능한 지역 목록 — 인기명소 도시(상단 고정) + 광역
  const regionTagOptions = useMemo(
    () => (regionCountry ? getCountryRegionOptions(regionCountry) : { provinces: [], cities: [] }),
    [regionCountry],
  );
  // 이 국가의 지구본 기록 수 (스냅 제외 — 대륙 활성화 규칙과 동일 기준)
  const regionCountryRecordCount = useMemo(() => {
    if (!regionCountry) return 0;
    const countryKo = ISO3_TO_KO[regionCountry];
    if (!countryKo) return 0;
    return records.filter(r =>
      r.viewType !== 'snap' && (r.countryName === countryKo || r.countries?.some(c => c.name === countryKo)),
    ).length;
  }, [records, regionCountry]);
  const showRegionTagChip =
    !!regionCountry && regionCountryRecordCount > 0 && recordedRegions.length === 0
    && !dismissedRegionTagChips.includes(regionCountry);
  const openRegionTagSheet = useCallback(() => {
    if (!regionCountry) return;
    setRegionTagSelection(new Set((taggedRegions[regionCountry] || []).map(t => t.nameEn)));
    setRegionTagSearch('');
    setRegionTagSheetVisible(true);
  }, [regionCountry, taggedRegions]);
  const saveRegionTags = useCallback(() => {
    if (!regionCountry) return;
    const all = [...regionTagOptions.cities, ...regionTagOptions.provinces];
    const list: TaggedRegion[] = all
      .filter(o => regionTagSelection.has(o.nameEn))
      .map(o => ({ name: o.name, nameEn: o.nameEn }));
    setTaggedRegions(prev => {
      const next = { ...prev };
      if (list.length === 0) delete next[regionCountry];
      else next[regionCountry] = list;
      return next;
    });
    setRegionTagSheetVisible(false);
  }, [regionCountry, regionTagOptions, regionTagSelection, setTaggedRegions]);
  // 시트 내 검색 필터 (한글명·영문명 모두 매칭)
  const regionTagFilter = useCallback((list: { name: string; nameEn: string }[]) => {
    const q = regionTagSearch.trim();
    if (!q) return list;
    const ql = q.toLowerCase();
    return list.filter(o => o.name.includes(q) || o.nameEn.toLowerCase().includes(ql));
  }, [regionTagSearch]);

  // 고아(orphan) 표시 설정 정리 — 기록이 사라진 국가/지역의 설정을 영속 저장소에서 제거
  // (영속화 이후 누적 방지. 변경 없으면 같은 참조 반환 → 불필요한 저장/렌더 없음)
  useEffect(() => {
    const validRegions = new Set<string>();
    records.forEach(r => { if (r.regionNameEn) validRegions.add(r.regionNameEn); });
    // 소급 태깅 지역의 색/모드 설정도 유효 — 태그가 살아있는 동안 지역별 설정이 지워지지 않게 포함
    Object.values(taggedRegions).forEach(list => list.forEach(tr => validRegions.add(tr.nameEn)));
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
    // 소급 태깅·칩 닫음 목록 정리 — 그 국가 기록(스냅 제외)이 전부 사라지면 함께 제거
    const recordedCountryKos = new Set<string>();
    records.forEach(r => {
      if (r.viewType === 'snap') return;
      if (r.countryName) recordedCountryKos.add(r.countryName);
      r.countries?.forEach(c => recordedCountryKos.add(c.name));
    });
    const hasCountryRecord = (iso3: string) => recordedCountryKos.has(ISO3_TO_KO[iso3] || '');
    setTaggedRegions(prev => {
      const remove = Object.keys(prev).filter(k => !hasCountryRecord(k));
      if (remove.length === 0) return prev;
      const next = { ...prev };
      remove.forEach(k => delete next[k]);
      return next;
    });
    setDismissedRegionTagChips(prev => {
      const next = prev.filter(hasCountryRecord);
      return next.length === prev.length ? prev : next;
    });
  }, [records, visitedNameSet, taggedRegions, setCountryColors, setCountryDisplayModes, setRegionDisplayModes, setRegionColors, setTaggedRegions, setDismissedRegionTagChips]);

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
        const hasRecord = records.some(r => r.viewType !== 'snap' && matchesCountry(r, koreanName));

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
      {/* 우주가스 색을 스킨에 맞춤 — 주 블롭=스킨 강조색, 보조(파랑) 블롭=스킨 그라데이션 보조색(aurora는 기존 파랑 유지) */}
      <SpaceBackdrop glow={skinAccent.accent} glow2={getGlobeSkinTheme(globeSkin)?.gradTo ?? '#1E3AFF'} />

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
          <GlobeView size={undefined} fullscreen onMessage={handleGlobeMessage} visitedCountries={globeVisitedCountries} displayMode={globeForcedMode} defaultColor={globeColor} variant={globeVariant} themeOverride={globeSkinTheme} sponsoredItems={sponsoredMarkerItems} />
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
          accessibilityLabel={t('main.notifA11y')}
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
                { value: 'globe', label: t('main.toggleGlobe') },
                { value: 'region', label: t('main.toggleRegion') },
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
              accessibilityLabel={t('main.globeFormA11y')}
            >
              <BlurView intensity={50} tint="dark" experimentalBlurMethod="dimezisBlurView" style={styles.globeSettingsBtnBlur}>
                <GlobeDisplayIcon tint={skinAccent.pill} />
              </BlurView>
            </TouchableOpacity>
            {/* 활성화 색 변경 — 형태 전환 버튼 왼쪽. 현재 색을 원으로 보여주고 탭하면 표시설정(팔레트) 열림 */}
            <TouchableOpacity
              style={styles.globeColorBtn}
              activeOpacity={0.7}
              onPress={openDisplaySettings}
              accessibilityRole="button"
              accessibilityLabel={t('main.activeColorA11y')}
            >
              <BlurView intensity={50} tint="dark" experimentalBlurMethod="dimezisBlurView" style={styles.globeSettingsBtnBlur}>
                <View style={[styles.globeColorDot, { backgroundColor: globeColor }, isNoiseColor(globeColor) && { overflow: 'hidden' }]}>
                  {isNoiseColor(globeColor) && <GrainOverlay color="#000000" opacity={0.5} dotCount={40} />}
                </View>
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
                placeholder={t('main.regionSearchPlaceholder')}
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
                  accessibilityLabel={t('main.clearSearchA11y')}
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
              {/* 국가 표시 칩 — 메뉴탭바 배경 테두리(흰색/검은색 베벨) 그라데이션 + 스킨 어두운 배경 */}
              <LinearGradient
                colors={['rgba(102,102,102,0)', 'rgba(255,255,255,0.6)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.15, y: 1 }}
                style={styles.regionChipBorder}
              >
                <TouchableOpacity
                  style={[styles.regionChipInner, { backgroundColor: skinChipBg }]}
                  activeOpacity={0.8}
                  onPress={() => setRegionSearch('')}
                >
                  <Text style={styles.regionChipText}>{countryEn(ISO3_TO_KO[regionCountry] || regionCountry)}</Text>
                </TouchableOpacity>
              </LinearGradient>
              {/* 인기명소 모아보기 — 활성: 스킨 버튼 그라데이션 / 비활성: 흰색/검은색 베벨 */}
              <LinearGradient
                colors={popularActive ? skinAccent.btnGradient : ['rgba(102,102,102,0)', 'rgba(255,255,255,0.6)']}
                start={{ x: 0, y: 0 }}
                end={popularActive ? { x: 1, y: 1 } : { x: 0.15, y: 1 }}
                style={styles.popularChipBorder}
              >
                <TouchableOpacity
                  style={[styles.popularChipInner, { backgroundColor: skinChipBg }]}
                  activeOpacity={0.8}
                  onPress={() => setPopularActive((v) => !v)}
                >
                  <Text style={styles.regionChipText}>{t('main.popularSpots')}</Text>
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
            {/* 방문 지역 소급 태깅 안내 칩 — 기록은 있는데 활성 지역이 없는 국가에서만 */}
            {showRegionTagChip && (
              <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 148, alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: skinChipBg, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', paddingLeft: 16, paddingRight: 8, paddingVertical: 10 }}>
                  <TouchableOpacity activeOpacity={0.8} onPress={openRegionTagSheet} accessibilityRole="button">
                    <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>
                      {t('main.regionTagChip', { count: regionCountryRecordCount })}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                    onPress={() => setDismissedRegionTagChips(prev => (regionCountry && !prev.includes(regionCountry) ? [...prev, regionCountry] : prev))}
                    accessibilityRole="button"
                    accessibilityLabel={t('main.regionTagDismissA11y')}
                  >
                    <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginLeft: 10, padding: 4 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {/* 방문 지역 선택 시트 (소급 태깅) */}
            <Modal visible={regionTagSheetVisible} transparent animationType="slide" onRequestClose={() => setRegionTagSheetVisible(false)}>
              <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                <TouchableOpacity
                  style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' }}
                  activeOpacity={1}
                  onPress={() => setRegionTagSheetVisible(false)}
                />
                <View style={{ backgroundColor: '#15151F', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 14, paddingHorizontal: 20, paddingBottom: insets.bottom + 16, maxHeight: '78%' }}>
                  <View style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 14 }} />
                  <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '700', textAlign: 'center' }}>{t('main.regionTagTitle')}</Text>
                  <Text style={{ color: '#A1A1B0', fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 12 }}>
                    {t('main.regionTagSub', { country: ISO3_TO_KO[regionCountry] || '' })}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#22222E', borderRadius: 12, paddingHorizontal: 12, marginBottom: 6 }}>
                    <SearchLineIcon size={18} color="#A9A9A9" />
                    <TextInput
                      style={{ flex: 1, color: '#FFFFFF', fontSize: 14, paddingVertical: 10, marginLeft: 8 }}
                      value={regionTagSearch}
                      onChangeText={setRegionTagSearch}
                      placeholder={t('main.regionTagSearchPh')}
                      placeholderTextColor="#7A7A88"
                    />
                  </View>
                  <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    {([
                      ['main.regionTagPopular', regionTagFilter(regionTagOptions.cities)],
                      ['main.regionTagProvinces', regionTagFilter(regionTagOptions.provinces)],
                    ] as const).map(([labelKey, list]) => (
                      list.length === 0 ? null : (
                        <View key={labelKey}>
                          <Text style={{ color: '#A1A1B0', fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 2 }}>{t(labelKey)}</Text>
                          {list.map(o => {
                            const sel = regionTagSelection.has(o.nameEn);
                            return (
                              <TouchableOpacity
                                key={o.nameEn}
                                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.07)' }}
                                activeOpacity={0.7}
                                onPress={() => setRegionTagSelection(prev => {
                                  const next = new Set(prev);
                                  if (next.has(o.nameEn)) next.delete(o.nameEn); else next.add(o.nameEn);
                                  return next;
                                })}
                              >
                                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: sel ? skinAccent.accent : 'rgba(255,255,255,0.3)', backgroundColor: sel ? skinAccent.accent : 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                  {sel && <Text style={{ color: '#0A0A0F', fontSize: 13, fontWeight: '800' }}>✓</Text>}
                                </View>
                                <Text style={{ color: '#FFFFFF', fontSize: 15 }}>{o.name}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )
                    ))}
                  </ScrollView>
                  <TouchableOpacity style={{ marginTop: 14, borderRadius: 14, overflow: 'hidden' }} activeOpacity={0.85} onPress={saveRegionTags}>
                    <LinearGradient colors={skinAccent.btnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingVertical: 14, alignItems: 'center' }}>
                      <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>{t('main.regionTagSave', { count: regionTagSelection.size })}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
            {/* 뒤로가기 버튼 (Figma — 좌측 셰브론 아이콘) */}
            <TouchableOpacity
              style={styles.regionBackBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={() => { setRegionCountry(null); setRegionSearch(''); setPopularActive(false); }}
              accessibilityRole="button"
              accessibilityLabel={t('main.backToCountryA11y')}
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
              accessibilityLabel={t('main.territoryDisplayA11y')}
            >
              <BlurView intensity={50} tint="dark" experimentalBlurMethod="dimezisBlurView" style={styles.globeSettingsBtnBlur}>
                <GlobeDisplayIcon tint={skinAccent.pill} />
              </BlurView>
            </TouchableOpacity>
          </>
        ) : (
          /* 국가 선택 그리드 */
          <View style={[styles.countryGrid, { paddingBottom: insets.bottom + 73 }]}>
            <Text style={styles.countryGridTitle}>{t('main.selectCountry')}</Text>
            <Text style={styles.countryGridSub}>{t('main.selectCountrySub')}</Text>
            <View style={styles.countryGridList}>
              {/* 7개 국가 + 8번째 칸은 돋보기(전체 목록 시트) — 사용자 확정 디자인 */}
              {REGION_COUNTRIES.slice(0, 7).map(c => (
                <TouchableOpacity
                  key={c.code}
                  style={styles.countryGridItem}
                  activeOpacity={0.7}
                  onPress={() => { setRegionCountry(c.code); setRegionSearch(''); setPopularActive(false); }}
                >
                  <Text style={styles.countryGridFlag}>{c.flag}</Text>
                  <Text style={styles.countryGridName}>{countryEn(c.name)}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.countryGridItem, styles.countryGridSearchItem]}
                activeOpacity={0.7}
                onPress={() => { setCountryPickerSearch(''); setCountryPickerVisible(true); }}
                accessibilityRole="button"
                accessibilityLabel={t('main.selectCountry')}
              >
                <SearchLineIcon size={30} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── 전체 국가 목록 시트 (돋보기) ── */}
        <Modal
          visible={countryPickerVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setCountryPickerVisible(false)}
        >
          <View style={styles.countryPickerOverlay} accessibilityViewIsModal>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setCountryPickerVisible(false)} />
            <View style={styles.countryPickerSheet}>
              <View style={styles.countryPickerHandle} />
              <Text style={styles.countryPickerTitle}>{t('main.selectCountry')}</Text>
              <TextInput
                style={styles.countryPickerInput}
                placeholder={t('main.countrySearchPh')}
                placeholderTextColor="#5a5a68"
                value={countryPickerSearch}
                onChangeText={setCountryPickerSearch}
              />
              <ScrollView style={{ maxHeight: height * 0.45 }} keyboardShouldPersistTaps="handled">
                {REGION_COUNTRIES
                  .filter(c => { const q = countryPickerSearch.trim(); return !q || c.name.includes(q) || countryEn(c.name).toLowerCase().includes(q.toLowerCase()); })
                  .map(c => (
                    <TouchableOpacity
                      key={c.code}
                      style={styles.countryPickerRow}
                      activeOpacity={0.7}
                      onPress={() => {
                        setCountryPickerVisible(false);
                        setRegionCountry(c.code); setRegionSearch(''); setPopularActive(false);
                      }}
                    >
                      <Text style={styles.countryPickerFlag}>{c.flag}</Text>
                      <Text style={styles.countryPickerName}>{countryEn(c.name)}</Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
              <View style={{ height: insets.bottom + 16 }} />
            </View>
          </View>
        </Modal>
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
          <Text style={styles.handleLabel}>{t('main.viewVisitedCountries')}</Text>
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
          <SheetBackdrop />
          {/* 시트 핸들 */}
          <View style={styles.sheetHandleArea} {...sheetPan.panHandlers}>
            <View style={styles.sheetHandle} />
          </View>

          {/* 타이틀 */}
          <View style={styles.sheetTitleRow}>
            <Text style={styles.sheetTitle}>{t('main.visitedCountries')}</Text>
            <Text style={styles.sheetCount}>{t('main.countriesCount', { count: VISITED_COUNTRIES.length })}</Text>
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
                  <Text style={styles.countryName}>{countryEn(c.name)}</Text>
                  <Text style={styles.countryVisits} {...andFitText}>{t('main.visitsCountSuffix', { count: c.visits })}</Text>
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
          <SheetBackdrop />
        {/* 핸들 */}
        <TouchableOpacity style={styles.sheetHandleArea} onPress={closeCountrySheet} activeOpacity={0.8}>
          <View style={styles.sheetHandle} />
        </TouchableOpacity>

        {/* 헤더 */}
        <View style={styles.countrySheetHeader}>
          <Text style={styles.countrySheetFlag}>
            {selectedCountry ? flagForCountry(selectedCountry) : ''}
          </Text>
          <Text style={styles.countrySheetName}>{selectedCountry}</Text>
        </View>

        {/* 여행 기록 리스트 (실제 기록) */}
        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={styles.countryRecordList}>
            {(selectedCountry
              ? records.filter(r => matchesCountry(r, selectedCountry))
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
                <Text style={styles.countryRecordCity}>{recPlace(rec)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* 새 기록 추가 버튼 */}
        <View style={styles.countrySheetBottom}>
          <TouchableOpacity
            style={[styles.countryAddBtn, { backgroundColor: skinAccent.accent }]}
            activeOpacity={0.85}
            onPress={() => {
              closeCountrySheet();
              setPendingCountry({ name: selectedCountry || '', code: '' });
              setFormatModalVisible(true);
            }}
          >
            <Text style={styles.countryAddBtnText}>+ {t('comp2.addNewRecord')}</Text>
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
            <SheetBackdrop />
            <Text style={styles.fmTitle}>{t('main.recordFormatTitle')}</Text>
            <Text style={styles.fmSub}>
              {pendingCountry?.name ? t('main.recordFormatPromptCountry', { country: pendingCountry.name }) : t('main.recordFormatPrompt')}
            </Text>
            <View style={styles.fmGrid}>
              {[
                { type: 'feed',  icon: <FeedIcon />,  name: t('main.formatFeed') },
                { type: 'blog',  icon: <BlogIcon />,  name: t('main.formatBlog') },
                { type: 'cut',   icon: <CutIcon />,   name: t('main.formatCut') },
                { type: 'album', icon: <AlbumIcon />, name: t('main.formatAlbum') },
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
            <SheetBackdrop />
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
                        {recPlace(rec)}
                      </Text>
                      <Text style={styles.rrItemDate}>{rec.date}</Text>
                    </View>
                    {!!rec.rating && <Text style={styles.rrRating}>{'★'.repeat(rec.rating)}</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={[styles.countryAddBtn, { width: '100%', marginTop: 16, backgroundColor: skinAccent.accent }]}
              activeOpacity={0.85}
              onPress={() => {
                setRegionRecordsVisible(false);
                setFormatModalVisible(true);
              }}
            >
              <Text style={styles.countryAddBtnText}>+ {t('comp2.addNewRecord')}</Text>
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
            <SheetBackdrop pointerEvents="none" />
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
                <Text style={styles.dsTitle}>{t('main.territoryDisplayTitle')}</Text>
                <Text style={styles.dsSub}>{t('main.territoryDisplaySub')}</Text>

                {/* 지구본 스킨 (본체 색) — aurora(색 활성화) 폼에만 적용되므로 그때만 노출 */}
                {globeVariant === 'aurora' && (<>
                <Text style={[dsm.sectionLabel, { marginTop: 6 }]}>{t('settings.globeSkin')}</Text>
                <View style={dsm.skinRow}>
                  {GLOBE_SKINS.map(s => {
                    const selected = globeSkin === s.id;
                    const locked = s.premium && !isPremium;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={dsm.skinItem}
                        activeOpacity={0.8}
                        onPress={() => {
                          if (locked) { setDisplaySettingsVisible(false); navigation.navigate('Premium'); return; }
                          setGlobeSkin(s.id); // 테마드 세터가 스킨별 저장 색 복원까지 수행
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={t(s.labelKey)}
                      >
                        <LinearGradient colors={s.preview} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[dsm.skinCircle, selected && dsm.skinCircleActive]}>
                          {locked && <Text style={dsm.skinLock}>🔒</Text>}
                        </LinearGradient>
                        <Text style={[dsm.skinLabel, selected && dsm.skinLabelActive]} numberOfLines={1}>{t(s.labelKey)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                </>)}

                {/* 활성화 색상 팔레트 (국기/갤러리 옵션 제거 — 색상만) */}
                <Text style={[dsm.sectionLabel, { marginTop: 16 }]}>{t('main.defaultColor')}</Text>
                <View style={dsm.paletteRow}>
                  {getSkinPalette(globeSkin).map(c => (
                    <TouchableOpacity key={c} activeOpacity={0.8} onPress={() => { setGlobeColor(c); setGlobeDisplayMode('color'); }}>
                      <View style={[dsm.swatch, { backgroundColor: c }, isNoiseColor(c) && { overflow: 'hidden' }, globeColor === c && dsm.swatchActive]}>
                        {isNoiseColor(c) && <GrainOverlay color="#000000" opacity={0.5} dotCount={100} />}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 국가별 색상 리스트 (하단 페이드) */}
                <Text style={[dsm.sectionLabel, { marginTop: 18 }]}>{t('main.countryColors')}</Text>
                <View style={dsm.listWrap}>
                  {visitedNameSet.size === 0 ? (
                    <Text style={dsm.emptyHint}>{t('main.noRecordedCountries')}</Text>
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
                            <Text style={dsm.countryName} numberOfLines={1}>{countryEn(ko)}</Text>
                            <Svg width={12} height={8} viewBox="0 0 12 8">
                              <SvgPath d="M1 1.5 6 6.5 11 1.5" stroke="#8B8B91" strokeWidth={1.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            </Svg>
                          </TouchableOpacity>
                          {isEditing && (
                            <View style={dsm.countryPalette}>
                              {getSkinPalette(globeSkin).map(c => (
                                <TouchableOpacity key={c} activeOpacity={0.8} onPress={() => setCountryColors(prev => ({ ...prev, [nameEn]: c }))}>
                                  <View style={[dsm.swatchSm, { backgroundColor: c }, isNoiseColor(c) && { overflow: 'hidden' }, (countryColors[nameEn] || globeColor) === c && dsm.swatchSmActive]}>
                                    {isNoiseColor(c) && <GrainOverlay color="#000000" opacity={0.5} dotCount={80} />}
                                  </View>
                                </TouchableOpacity>
                              ))}
                              {countryColors[nameEn] && (
                                <TouchableOpacity
                                  style={dsm.countryReset}
                                  onPress={() => setCountryColors(prev => { const next = { ...prev }; delete next[nameEn]; return next; })}
                                >
                                  <Text style={dsm.countryResetText}>{t('main.reset')}</Text>
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
                <Text style={styles.dsTitle}>{t('main.regionDisplayTitle')}</Text>
                <Text style={styles.dsSub}>{t('main.regionDisplaySub')}</Text>

                {/* 대륙 글로벌 기본 모드 선택 */}
                <View style={styles.dsColorSection}>
                  <Text style={styles.dsColorLabel}>{t('main.globalDefault')}</Text>
                  <View style={styles.dsSection}>
                    <TouchableOpacity
                      style={[styles.dsOption, regionGlobalMode !== 'photo' && [styles.dsOptionActive, { borderColor: skinAccent.accent, backgroundColor: skinAccent.tint(0.1) }]]}
                      activeOpacity={0.7}
                      onPress={() => setRegionGlobalMode('color')}
                    >
                      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: globeColor }} />
                      <Text style={[styles.dsOptionText, regionGlobalMode !== 'photo' && styles.dsOptionTextActive]}>{t('main.color')}</Text>
                      {regionGlobalMode !== 'photo' && <View style={[styles.dsCheck, { backgroundColor: skinAccent.accent }]} />}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dsOption, regionGlobalMode === 'photo' && [styles.dsOptionActive, { borderColor: skinAccent.accent, backgroundColor: skinAccent.tint(0.1) }]]}
                      activeOpacity={0.7}
                      onPress={() => setRegionGlobalMode('photo')}
                    >
                      <Text style={{ fontSize: 24 }}>🖼️</Text>
                      <Text style={[styles.dsOptionText, regionGlobalMode === 'photo' && styles.dsOptionTextActive]}>{t('main.photo')}</Text>
                      {regionGlobalMode === 'photo' && <View style={[styles.dsCheck, { backgroundColor: skinAccent.accent }]} />}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 지역별 개별 설정 */}
                <View style={[styles.dsColorSection, { flex: 1, maxHeight: 300 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.dsColorLabel}>{t('main.perRegion')}</Text>
                    {/* 방문 지역 소급 태깅 편집 — 표시 설정을 유지·닫고 태깅 시트를 연다 */}
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => { confirmDisplaySettings(); setTimeout(openRegionTagSheet, 300); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={{ color: skinAccent.accent, fontSize: 13, fontWeight: '600' }}>{t('main.regionTagEdit')} ›</Text>
                    </TouchableOpacity>
                  </View>
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
                                  const label = m === 'default' ? t('main.modeDefault') : m === 'color' ? t('main.color') : t('main.photo');
                                  const active = currentMode === m;
                                  return (
                                    <TouchableOpacity
                                      key={m}
                                      style={[styles.dsSegmentBtn, active && [styles.dsSegmentBtnActive, { backgroundColor: skinAccent.accent }]]}
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
                                {getSkinPalette(globeSkin).map(c => (
                                  <TouchableOpacity key={c} activeOpacity={0.8} onPress={() => setRegionColors(prev => ({ ...prev, [r.key]: c }))}>
                                    <View style={[styles.dsColorItemSm, { backgroundColor: c }, isNoiseColor(c) && { overflow: 'hidden' }, (regionColors[r.key] || globeColor) === c && styles.dsColorItemSmActive]}>
                                      {isNoiseColor(c) && <GrainOverlay color="#000000" opacity={0.5} dotCount={80} />}
                                    </View>
                                  </TouchableOpacity>
                                ))}
                                {regionColors[r.key] && (
                                  <TouchableOpacity
                                    style={styles.dsCountryReset}
                                    onPress={() => setRegionColors(prev => { const next = { ...prev }; delete next[r.key]; return next; })}
                                  >
                                    <Text style={styles.dsCountryResetText}>{t('main.reset')}</Text>
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
              style={[dsm.confirmBtn, { backgroundColor: skinAccent.accentDeep }]}
              activeOpacity={0.85}
              onPress={confirmDisplaySettings}
            >
              <Text style={dsm.confirmText}>{t('common.confirm')}</Text>
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
  galleryBtn: { height: 49, borderRadius: 15, backgroundColor: '#2E2E3B', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  galleryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sectionLabel: { color: '#9A9A9A', fontSize: 13, fontWeight: '600', marginBottom: 14 },
  // 지구본 스킨 선택 행
  skinRow: { flexDirection: 'row', gap: 18, marginBottom: 4 },
  skinItem: { alignItems: 'center', gap: 6, width: 60 },
  skinCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  skinCircleActive: { borderColor: '#FFFFFF' },
  skinLock: { fontSize: 16 },
  skinLabel: { color: '#9A9A9A', fontSize: 11 },
  skinLabelActive: { color: '#FFFFFF', fontWeight: '600' },
  paletteRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  swatch: { width: 34, height: 34, borderRadius: 17 },
  swatchActive: { borderWidth: 2, borderColor: '#fff' },
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
  headerIcon: {
    padding: Spacing[1],
    position: 'relative',
    // 로고가 translateY -8 로 올라가 있어, 종 아이콘도 로고 시각 중심에 맞춰 올림
    transform: [{ translateY: -11 }],
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
  // 8번째 칸(돋보기) — 아이콘만 중앙 배치, 타일 높이는 국기+이름 타일과 맞춤
  countryGridSearchItem: {
    justifyContent: 'center',
    minHeight: 76,
  },
  // 전체 국가 목록 시트
  countryPickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  countryPickerSheet: {
    backgroundColor: '#17131f', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: '#2E2E3B', paddingHorizontal: 16, paddingTop: 10,
  },
  countryPickerHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#2E2E3B', alignSelf: 'center', marginBottom: 12 },
  countryPickerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  countryPickerInput: {
    backgroundColor: '#211b2e', borderWidth: 1, borderColor: '#2E2E3B', borderRadius: 12,
    color: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 8,
  },
  countryPickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A26',
  },
  countryPickerFlag: { fontSize: 24 },
  countryPickerName: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },

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
  // 활성화 색 변경 버튼 — 형태 전환 버튼(right:16) 왼쪽에 나란히 (36 + 10 gap)
  globeColorBtn: {
    position: 'absolute',
    top: 12,
    right: 62,
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
  globeColorDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
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
