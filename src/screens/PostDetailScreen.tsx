import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  useWindowDimensions,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Modal,
  Alert,
  Share,
  Image,
  Linking,
  Animated,
  Easing,
  PanResponder,
  ActivityIndicator,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { Text, TextInput } from '../ui/Text';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { countryLabel, countryTagLabel } from '../utils/countryLabel';
import { WebView } from 'react-native-webview';
import { useVideoPlayer, VideoView } from 'expo-video';
import Reanimated, {
  useSharedValue, useAnimatedStyle, useAnimatedScrollHandler,
  interpolate, Extrapolation, withTiming, withSpring, runOnJS,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path as SvgPath, Ellipse as SvgEllipse, Circle as SvgCircle, G as SvgG } from 'react-native-svg';
import FeedTape from '../components/FeedTape';
import { SERIF } from '../components/ads/adPolaroidStyles';
import { CommentIcon as CommentSvgIcon, PersonIcon, PaperclipIcon, TrashIcon, CameraIcon, LandscapeIcon, CalendarIcon, PlaneIcon, TransferIcon, PencilIcon, LinkIcon, MegaphoneIcon, ShareIcon, ArchiveIcon, PinIcon, LockClosedIcon, GlobeIcon, ChevronIcon } from '../components/icons';
import { useRecords, TravelRecord, RecordViewType } from '../store/recordStore';
import { useDM } from '../store/dmStore';
import { handleFontStyle } from '../constants/handleFonts';
import { useSkinAccent } from '../constants/skinTheme';
import WeatherIcon, { normalizeWeather } from '../components/WeatherIcon';
import ReportModal from '../components/ReportModal';
import PhotoViewerModal from '../components/PhotoViewerModal';
import RatingStars from '../components/RatingStars';
import { LiquidCardGlow, useEntranceAnimation } from '../components/LiquidEffects';
import { sectionSlices } from '../utils/albumSections';
import AuthorAvatar from '../components/AuthorAvatar';
import { useStageWidth, useStageGutter, STAGE_MAX_W } from '../utils/stage';

const APP_LOGO = require('../../assets/example-avatar.png'); // 예시 기록 '이어스' 프로필 사진(지구본) — 소셜과 통일
import { useSettings } from '../store/settingsStore';
import { timeAgo } from '../utils/timeAgo';
import { andFitText } from '../utils/fitText';
import type { BlogBlock } from '../types/blogBlocks';
import { extractHeadings, blocksToPlainText, blocksToPhotos } from '../types/blogBlocks';
import { toNaverHtml, BlogData } from '../utils/naverBlogConverter';
import { applyViewer, isPostHiddenForViewer } from '../utils/mediaPrivacy';
import { buzz } from '../utils/haptics';
import { fetchPostLikers, PostLiker, likePost, unlikePost } from '../services/social';
import { postLink } from '../utils/appLinks';
import { CUT_LAYOUTS } from '../constants/cutFrames';
import { handleBlock as confirmBlock } from '../utils/reportAndBlock';
import { regionDisplayName } from '../utils/regionLabel';

// 안드로이드 구아키텍처에서 LayoutAnimation 활성화 (신아키텍처/iOS는 기본 동작, 호출은 안전).
// FAQ 아코디언(FAQScreen.tsx:21)·ProfileScreen과 같은 가드다. 이 파일은 예전부터
// LayoutAnimation을 써 왔는데(사진 비율 반영 2곳) 이 가드만 없었다 —
// 티켓 접기/펼치기를 붙이며 저장소 관례에 맞춘다.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * 폭·높이는 더 이상 모듈 최상위에 박제하지 않는다 — 폴드를 펼치면 스토리 페이저의
 * 스크롤 오프셋(`x = index * SCREEN_W`)이 실제 페이지 폭과 어긋나 엉뚱한 스냅을 가리켰다.
 * 폭은 useStageWidth()(클램프된 Stage 폭), 높이는 실제 창 높이를 컴포넌트 본문에서 받고,
 * 모듈 최상위 헬퍼·스타일시트 팩토리에는 인자로 넘긴다.
 */

// 네컷(스트립) 미리보기를 프레임 규격(가로/세로 비율)에 딱 맞게 — 레터박스(여백) 제거
const cutFitStyle = (layout: import('../constants/cutFrames').CutLayout | undefined, SCREEN_W: number, SCREEN_H: number) => {
  const aspect = (layout && CUT_LAYOUTS[layout]?.aspect) || 3 / 4; // width / height
  const maxW = SCREEN_W - 40;
  const maxH = SCREEN_H * 0.7;
  let w = maxW;
  let h = maxW / aspect;
  if (h > maxH) { h = maxH; w = maxH * aspect; }
  return { width: w, height: h };
};

const C = {
  bg: '#0A0A0F',
  card: '#1C1C28',
  cardBorder: '#2A2A3A',
  // 강조색(구 accent/accentDim/accentBorder)은 제거했다 —
  // 스킨 연동을 위해 makeS/makeBlogS/… 팩토리의 (a, tint) 인자로 넘어간다.
  white: '#FFFFFF',
  dim: '#A1A1B0',
  muted: '#5A5A6E',
  red: '#FF6B9D',
};

// 댓글은 recordStore의 commentsByPost에 게시물별로 저장된다 (화면을 나가도 유지)
const commentTime = (c: { time?: string; createdAt: number }) => c.time ?? timeAgo(c.createdAt);

const currencySymbol = (code: string): string => {
  const map: Record<string, string> = {
    KRW: '₩', JPY: '¥', USD: '$',
    EUR: '€', CNY: '¥', GBP: '£',
    AUD: 'A$', CAD: 'C$', CHF: 'CHF',
    HKD: 'HK$', SGD: 'S$', THB: '฿',
    VND: '₫', MYR: 'RM', PHP: '₱',
    IDR: 'Rp', INR: '₹', TRY: '₺',
    MXN: 'MX$', BRL: 'R$', AED: 'AED',
    NZD: 'NZ$', SEK: 'kr', NOK: 'kr',
    DKK: 'kr', CZK: 'Kč', HUF: 'Ft',
    PLN: 'zł',
  };
  return map[code] || code;
};



// ─── 동행자 아이콘 ───
const IC = C.dim;
const ISZ = 14;

const SoloIcon = () => (
  <View style={{ width: ISZ, height: ISZ, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ position: 'absolute', top: 0, width: 5, height: 5, borderRadius: 2.5, backgroundColor: IC }} />
    <View style={{ position: 'absolute', bottom: 0, width: 7, height: 4, borderTopLeftRadius: 3.5, borderTopRightRadius: 3.5, backgroundColor: IC }} />
    <View style={{ position: 'absolute', top: 1, right: 1, width: 1.5, height: 6, borderRadius: 1, backgroundColor: IC, transform: [{ rotate: '-20deg' }] }} />
  </View>
);

const FriendIcon = () => (
  <View style={{ width: ISZ, height: ISZ, alignItems: 'center', justifyContent: 'flex-end' }}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 1 }}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: IC, marginBottom: 1 }} />
        <View style={{ width: 6, height: 3.5, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: IC }} />
      </View>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: IC, marginBottom: 1 }} />
        <View style={{ width: 6, height: 3.5, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: IC }} />
      </View>
    </View>
  </View>
);

const CoupleIcon = () => (
  <View style={{ width: ISZ, height: ISZ }}>
    <View style={{ position: 'absolute', left: 0, bottom: 0, alignItems: 'center' }}>
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: IC, marginBottom: 1 }} />
      <View style={{ width: 6, height: 3.5, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: IC }} />
    </View>
    <View style={{ position: 'absolute', right: 0, bottom: 0, alignItems: 'center' }}>
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: IC, marginBottom: 1 }} />
      <View style={{ width: 6, height: 3.5, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: IC }} />
    </View>
    <View style={{ position: 'absolute', top: 0, left: ISZ / 2 - 3.5, width: 7, height: 6 }}>
      <View style={{ position: 'absolute', top: 0, left: 0, width: 4, height: 4, borderRadius: 2, backgroundColor: IC }} />
      <View style={{ position: 'absolute', top: 0, right: 0, width: 4, height: 4, borderRadius: 2, backgroundColor: IC }} />
      <View style={{ position: 'absolute', bottom: 0, left: 1, width: 5, height: 4, backgroundColor: IC, transform: [{ rotate: '45deg' }] }} />
    </View>
  </View>
);

const FamilyIcon = () => (
  <View style={{ width: ISZ, height: ISZ, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 1 }}>
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: IC, marginBottom: 1 }} />
      <View style={{ width: 5, height: 4, borderTopLeftRadius: 2.5, borderTopRightRadius: 2.5, backgroundColor: IC }} />
    </View>
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: IC, marginBottom: 1 }} />
      <View style={{ width: 4, height: 2.5, borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: IC }} />
    </View>
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: IC, marginBottom: 1 }} />
      <View style={{ width: 5, height: 4, borderTopLeftRadius: 2.5, borderTopRightRadius: 2.5, backgroundColor: IC }} />
    </View>
  </View>
);

const ParentIcon = () => (
  <View style={{ width: ISZ, height: ISZ, alignItems: 'center', justifyContent: 'flex-end' }}>
    <View style={{ position: 'absolute', top: 0, width: 5, height: 5, borderRadius: 2.5, backgroundColor: IC }} />
    <View style={{ width: 8, height: 4, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: IC }} />
    <View style={{ position: 'absolute', right: 0, bottom: 0, width: 1.5, height: 9, borderRadius: 1, backgroundColor: IC, opacity: 0.6 }} />
  </View>
);

const SiblingIcon = () => (
  <View style={{ width: ISZ, height: ISZ, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 1 }}>
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: IC, marginBottom: 1 }} />
      <View style={{ width: 6, height: 4, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: IC }} />
    </View>
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 3.5, height: 3.5, borderRadius: 1.75, backgroundColor: IC, marginBottom: 1 }} />
      <View style={{ width: 5, height: 3, borderTopLeftRadius: 2.5, borderTopRightRadius: 2.5, backgroundColor: IC }} />
    </View>
  </View>
);

const companionIcon = (name: string): React.ReactNode => {
  const map: Record<string, React.ReactNode> = {
    '혼자': <SoloIcon />,
    '친구': <FriendIcon />,
    '연인': <CoupleIcon />,
    '가족': <FamilyIcon />,
    '부모님': <ParentIcon />,
    '형제': <SiblingIcon />,
  };
  return map[name] || <FriendIcon />;
};

// ─── 안쪽을 향하는 셰브런 ───
// 마이티켓(ProfileTicketScreen) 시안 134:1155~1170의 path. 그 파일은 수정 금지이고
// 컴포넌트도 export되어 있지 않아, 여기서 필요한 만큼만(3개 세트) 재구현했다.
const TICK_CHEV_D =
  'M1.67775 0.277683C1.28426 -0.102065 0.657432 -0.090929 0.277684 0.302557C-0.102065 0.696043 -0.0909286 1.32287 0.302557 1.70262L0.990153 0.990153L1.67775 0.277683ZM7.99015 7.98162L8.70458 8.66718C9.07071 8.28563 9.07241 7.68373 8.70845 7.30012L7.99015 7.98162ZM0.275722 14.5909C-0.102901 14.9855 -0.0899736 15.6123 0.304596 15.9909C0.699165 16.3695 1.32596 16.3566 1.70458 15.962L0.990153 15.2764L0.275722 14.5909ZM5.33716 5.1854L6.05546 4.50389L6.04045 4.48807L6.02475 4.47293L5.33716 5.1854ZM7.99015 7.98162L7.27572 7.29607L0.275722 14.5909L0.990153 15.2764L1.70458 15.962L8.70458 8.66718L7.99015 7.98162ZM0.990153 0.990153L0.302557 1.70262L4.64956 5.89786L5.33716 5.1854L6.02475 4.47293L1.67775 0.277683L0.990153 0.990153ZM5.33716 5.1854L4.61886 5.8669L7.27186 8.66313L7.99015 7.98162L8.70845 7.30012L6.05546 4.50389L5.33716 5.1854Z';
const TICK_CHEV_W = 8.9803;
const TICK_CHEV_H = 16.2666;
const TICK_CHEV_PITCH = 7.5; // 시안 좌표 간격(152→159→167)
// 마이티켓은 3개 세트지만 여기선 2개다 — 히어로 두 칸(목적지·기간) 사이에 끼우는 자리라,
// 3개를 쓰면 가운데가 넓어져 'YYYY.MM.DD' 한 줄이 열 폭을 넘어 잘렸다.
const TICK_CHEV_COUNT = 2;
const TICK_CHEV_SET_W = TICK_CHEV_PITCH * (TICK_CHEV_COUNT - 1) + TICK_CHEV_W;

const TicketChevrons = ({ color, flip }: { color: string; flip?: boolean }) => (
  <Svg
    width={TICK_CHEV_SET_W}
    height={TICK_CHEV_H}
    viewBox={`0 0 ${TICK_CHEV_SET_W} ${TICK_CHEV_H}`}
    style={flip ? { transform: [{ scaleX: -1 }] } : undefined}
  >
    {Array.from({ length: TICK_CHEV_COUNT }).map((_, i) => (
      <SvgG key={i} x={i * TICK_CHEV_PITCH}>
        <SvgPath d={TICK_CHEV_D} fill={color} />
      </SvgG>
    ))}
  </Svg>
);

/**
 * ─── 티켓풍 메타 블록 (피드·스트립 상세의 시그니처) ───
 *
 * 국가 태그·작성 시각·별점·여행정보 칩이 전부 같은 칩 언어(틴트 배경 + 라운드 + 12~13px)로
 * 흩어져 있어 위계가 없었다 — 이 화면이 목업처럼 보이던 주범이다. 탑승권 한 장으로 묶는다.
 *
 * 시각 문법은 마이티켓(ProfileTicketScreen)에서 **값만** 옮겨 왔다: 라벨 13px/600/#9CA3AF,
 * 값은 크게·900, 절취선(dash 행)과 마주 보는 셰브런.
 * 다만 배경은 흰 카드가 아니라 이 화면의 다크 문법(반투명 카드 + 헤어라인)이다 —
 * 흰 티켓을 그대로 박으면 마이티켓과 혼동되고 다크 배경에서 과하게 튄다.
 *
 * 라벨(BOARDING PASS/DESTINATION/DATE/…)은 번역하지 않는 **디자인 텍스처**다.
 * 탑승권의 영문 대문자 라벨 자체가 이 블록의 조형이라 i18n 키로 빼지 않았다
 * (값은 전부 데이터이고 국가명·날씨는 기존 i18n 유틸을 그대로 경유한다).
 *
 * 값이 없는 필드는 행 자체를 생략하고, 하나도 없으면 블록을 아예 그리지 않는다.
 */
const TravelTicket = ({ record }: { record: TravelRecord }) => {
  const { s } = useSheets();
  const { t, i18n } = useTranslation();
  const skinAccent = useSkinAccent();
  // 접힘 상태 — 기본은 펼침. 이 컴포넌트 안에 두는 이유와 화면의 travelInfoPref를
  // 재사용하지 않은 이유는 아래 canCollapse 주석 참고.
  const [collapsed, setCollapsed] = useState(false);

  // 목적지 — 기존 renderCountries()와 동일한 데이터 우선순위(countries → country → countryName).
  //
  // 다만 **접기 임계는 다르다(의도)**: 기존 칩은 3개까지 전부 펼쳤지만 티켓은 2개까지만 펼치고
  // 3개부터 "첫 나라 +N"으로 접는다. 히어로 칸은 19px/900 값이 카드 반쪽 폭에 들어가야 하는
  // 자리라 3개를 나란히 두면 넘친다 — 폭 제약에서 온 확정된 설계 결정이지 이식 누락이 아니다.
  // (반대로 countryName 폴백은 기존 칩에 없던 것이라, 국가가 아예 안 보이던 기록이 새로 보인다.)
  const destination =
    record.countries && record.countries.length > 0
      ? record.countries.length <= 2
        ? record.countries.map((c) => `${c.flag} ${countryLabel(c.name, i18n.language)}`).join('   ')
        : `${record.countries[0].flag} ${countryLabel(record.countries[0].name, i18n.language)} +${record.countries.length - 1}`
      : record.country
        ? countryTagLabel(record.country, i18n.language)
        : record.countryName
          ? `${record.countryFlag ? `${record.countryFlag} ` : ''}${countryLabel(record.countryName, i18n.language)}`
          : '';

  // 기간은 마이티켓과 같은 두 줄 표기(시작 / ~종료) — 한 줄로 붙이면 900 웨이트 20px에서 넘친다
  const dateValue = record.startDate
    ? record.endDate && record.endDate !== record.startDate
      ? `${record.startDate}\n~ ${record.endDate}`
      : record.startDate
    : '';

  // 히어로(큰 값)는 목적지·기간 순으로 두 칸까지. 하나뿐이면 왼쪽 한 칸만 쓰고 셰브런도 안 그린다.
  const hero = ([
    destination ? { label: 'DESTINATION', value: destination } : null,
    dateValue ? { label: 'DATE', value: dateValue } : null,
  ].filter(Boolean) as { label: string; value: string }[]);

  const companions = record.companions && record.companions.length > 0 ? record.companions.join(', ') : '';
  const cells: { key: string; label: string; text?: string; node?: React.ReactNode }[] = [];
  if (normalizeWeather(record.weather)) {
    cells.push({
      key: 'weather',
      label: 'WEATHER',
      // 기록 화면과 같은 제작 SVG 세트 — 이모지는 기기 폰트마다 모양이 달랐다(기존 칩과 동일 이유)
      node: <View style={s.ticketIconValue}><WeatherIcon value={record.weather} size={20} color={C.white} /></View>,
    });
  }
  if (record.flightType) cells.push({ key: 'flight', label: 'FLIGHT', text: record.flightType });
  // budget은 **객체**라 amount가 0이어도 truthy다 — 기존 칩 경로는 그대로 "₩ 0"을 그렸는데,
  // 접힌 12px 회색 칩일 때는 티가 안 나던 것이 티켓의 16px/900 흰 값으로는 크게 드러난다.
  // 티켓에서만 amount > 0으로 좁힌다(블로그가 쓰는 아래 infoChip 경로는 건드리지 않는다).
  if (record.budget && record.budget.amount > 0) {
    cells.push({
      key: 'budget',
      label: 'BUDGET',
      text: `${currencySymbol(record.budget.currency)} ${record.budget.amount.toLocaleString()}`,
    });
  }
  if (companions) cells.push({ key: 'companion', label: 'COMPANION', text: companions });
  if (record.rating != null && record.rating > 0) {
    cells.push({
      key: 'rating',
      label: 'RATING',
      // 앱 공용 0.5 단위 별점 — 예전 userRow의 RatingStars를 그대로 옮긴 것
      node: (
        <View style={s.ticketIconValue}>
          <RatingStars score={record.rating} size={13} gap={2} fullColor={skinAccent.accent} emptyColor="rgba(255,255,255,0.18)" />
        </View>
      ),
    });
  }

  if (hero.length === 0 && cells.length === 0) return null;

  /**
   * 접기 가능 여부 — 접힘 상태의 정의가 "히어로 행만 남긴다"이므로 히어로가 없으면
   * 접어도 남는 게 없다. 그런 조합(격자 필드만 있고 국가·기간이 전부 없는 기록)에서는
   * 탭 자체를 비활성화한다.
   *
   * 상태를 화면(PostDetailScreen)의 `travelInfoPref`로 합치지 않은 이유:
   *   ① 기본값이 반대다. `travelInfoOpen = travelInfoPref ?? travelInfoCount <= 2`는
   *      항목이 3개 이상이면 **접힌 채로** 시작하는데, 티켓의 요구는 "기본 펼침"이다.
   *   ② 세는 필드 집합이 다르다. travelInfoCount는 startDate·weather·flightType·budget
   *      4개뿐이라 티켓의 목적지·동행·별점을 모른다.
   *   ③ 지금은 blog(칩)와 feed·cut(티켓)이 상호 배타라 공유해도 런타임 충돌은 없지만,
   *      블로그까지 티켓으로 옮기는 순간 두 경로가 한 상태를 놓고 싸운다.
   * 영속도 불필요하다 — 화면을 나가면 초기값(펼침)으로 돌아가는 편이 예측 가능하다.
   */
  const canCollapse = hero.length > 0;
  const isCollapsed = canCollapse && collapsed;
  const toggle = () => {
    // 이 파일이 이미 쓰는 프리셋(사진 비율 반영 2곳)이자 FAQ 아코디언에서 검증된 방식.
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((v) => !v);
  };

  const body = (
    <>
      {/* 상단 스트립 — 탑승권 브랜드 라인(좌) + 작성 시각·접기 셰브런(우) */}
      <View style={s.ticketStrip}>
        <Text style={s.ticketBrand}>BOARDING PASS</Text>
        <View style={s.ticketStripRight}>
          {!record.isExample && <Text style={s.ticketStamp}>{timeAgo(record.timestamp)}</Text>}
          {/* 접힘 어포던스 — 티켓의 절제된 룩을 지키려 라벨 없이 셰브런만 둔다.
              방향 규약은 이 파일의 여행정보 토글과 같다(펼쳐져 있으면 ▲). */}
          {canCollapse && <ChevronIcon size={16} color="#9CA3AF" up={!isCollapsed} />}
        </View>
      </View>

      {hero.length > 0 && (
        <View style={s.ticketHero}>
          <View style={s.ticketCol}>
            <Text style={s.ticketLabel} {...andFitText}>{hero[0].label}</Text>
            <Text style={s.ticketValue} numberOfLines={2}>{hero[0].value}</Text>
          </View>
          {hero.length > 1 && (
            <>
              {/* 마주 보는 셰브런 — 세로 정렬 계산은 스타일(ticketChevPair.marginTop) 주석 참고 */}
              <View style={s.ticketChevPair}>
                <TicketChevrons color={skinAccent.tint(0.55)} />
                <TicketChevrons color={skinAccent.tint(0.55)} flip />
              </View>
              <View style={[s.ticketCol, s.ticketColRight]}>
                <Text style={s.ticketLabel} {...andFitText}>{hero[1].label}</Text>
                <Text style={[s.ticketValue, s.ticketValueRight]} numberOfLines={2}>{hero[1].value}</Text>
              </View>
            </>
          )}
        </View>
      )}

      {/* 접히면 절취선·격자를 숨기고 히어로 행만 남긴다 — '간략화'의 자연스러운 단위 */}
      {!isCollapsed && hero.length > 0 && cells.length > 0 && (
        <View style={s.ticketPerforation}>
          {/* 좌우 반원 노치 — 카드의 overflow:'hidden'이 반만 남겨 '뚫린 구멍'으로 읽힌다 */}
          <View style={[s.ticketNotch, s.ticketNotchL]} />
          <View style={[s.ticketNotch, s.ticketNotchR]} />
          <View style={s.ticketDashRow}>
            {Array.from({ length: 56 }).map((_, i) => <View key={i} style={s.ticketDash} />)}
          </View>
        </View>
      )}

      {!isCollapsed && cells.length > 0 && (
        <View style={s.ticketGrid}>
          {cells.map((c) => (
            <View key={c.key} style={s.ticketCell}>
              <Text style={s.ticketLabel} {...andFitText}>{c.label}</Text>
              {c.node ?? <Text style={s.ticketCellValue} numberOfLines={2}>{c.text}</Text>}
            </View>
          ))}
        </View>
      )}
    </>
  );

  // 접을 게 없으면 터치 요소로 만들지 않는다 — 눌러도 아무 일 없는 버튼을 만들지 않기 위해.
  if (!canCollapse) return <View style={s.ticket}>{body}</View>;

  // 탭 영역은 티켓 전체. 티켓 내부는 전부 표시 전용(Text·View·아이콘)이라
  // 중첩 터치 요소가 없다 — 탭이 삼켜지거나 겹칠 여지가 없음을 확인했다.
  return (
    <TouchableOpacity
      style={s.ticket}
      activeOpacity={0.9}
      onPress={toggle}
      accessibilityRole="button"
      // 새 키를 만들지 않고 기존 postDetail.travelInfo('여행정보'/'Travel info')를 재사용한다.
      // 펼침/접힘 상태는 문구가 아니라 accessibilityState.expanded로 알린다(스크린리더 표준).
      accessibilityLabel={t('postDetail.travelInfo')}
      accessibilityState={{ expanded: !isCollapsed }}
    >
      {body}
    </TouchableOpacity>
  );
};

// ─── 좋아요 하트 (SVG) ───
// 텍스트 글리프(♥/♡)는 폰트에 따라 모양·크기가 흔들려 SVG로 그린다.
const HeartSvg = ({ filled, size = 22, color }: { filled: boolean; size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <SvgPath
      d="M12 21c-.4 0-.8-.14-1.1-.4C5.9 16.3 2 12.8 2 8.9 2 5.9 4.4 3.5 7.4 3.5c1.7 0 3.4.8 4.6 2.2 1.2-1.4 2.9-2.2 4.6-2.2 3 0 5.4 2.4 5.4 5.4 0 3.9-3.9 7.4-8.9 11.7-.3.26-.7.4-1.1.4z"
      fill={filled ? (color ?? C.red) : 'none'}
      stroke={filled ? (color ?? C.red) : C.dim}
      strokeWidth={1.7}
    />
  </Svg>
);

// ─── 슬라이드 이미지 뷰어 (상세보기용) ───
const SlideImageViewerDetail = ({ items, onImagePress, captions, fullBleed }: { items: { uri: string; caption?: string }[]; onImagePress?: (uris: string[], index: number) => void; captions?: string[]; fullBleed?: boolean }) => {
  const skinAccent = useSkinAccent();
  const SCREEN_W = useStageWidth(); // 슬라이드 폭 = 페이징 오프셋. 실시간이어야 한다.
  const [activeIdx, setActiveIdx] = useState(0);
  const [ratios, setRatios] = useState<Record<number, number>>({}); // index → 세로/가로 비율
  // fullBleed: 화면 폭 가득(엣지-투-엣지, 모서리 각지게) / 기본: 본문 좌우 패딩(20+20)과 일치
  const slideW = fullBleed ? SCREEN_W : SCREEN_W - 40;
  const imgRadius = fullBleed ? 0 : 8;
  // 각 사진의 원본 비율을 읽어 박스를 맞춤 (크롭 방지).
  // 전부 읽은 뒤 한 번에 반영한다 — 장마다 도착 순서대로 반영하면 컨테이너 높이가
  // 여러 번 바뀌며 본문이 계단식으로 밀렸다(레이아웃 점프). 한 번의 변화도 부드럽게.
  useEffect(() => {
    let alive = true;
    if (!items.length) return;
    const acc: Record<number, number> = {};
    let left = items.length;
    const done = () => {
      if (!alive) return;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setRatios(acc);
    };
    items.forEach((it, i) => {
      Image.getSize(
        it.uri,
        (w, h) => { if (w > 0) acc[i] = h / w; if (--left === 0) done(); },
        () => { if (--left === 0) done(); },
      );
    });
    return () => { alive = false; };
  }, [items]);
  // 너무 길거나 넓은 사진은 적당히 제한(0.6~1.4)
  const heightFor = (i: number) => slideW * Math.min(Math.max(ratios[i] ?? 0.75, 0.6), 1.4);
  const containerH = Math.max(slideW * 0.75, ...items.map((_, i) => heightFor(i)));
  return (
    <View style={{ marginBottom: 14 }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          // 오버스크롤/빠른 스와이프로 범위 밖 인덱스가 되면 인디케이터·사진별 글이 꺼진다 — 클램프
          const idx = Math.min(items.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / slideW)));
          setActiveIdx(idx);
        }}
        style={{ width: slideW, height: containerH }}
      >
        {items.map((item, i) => (
          <TouchableOpacity
            key={i}
            activeOpacity={0.85}
            onPress={() => onImagePress?.(items.map(it => it.uri), i)}
            style={{ width: slideW, height: containerH, alignItems: 'center', justifyContent: 'center' }}
          >
            <View style={{ width: slideW, height: heightFor(i), borderRadius: imgRadius, overflow: 'hidden' }}>
              <Image source={{ uri: item.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              {/* 사진별 글 — 사진 밖 별도 텍스트였던 걸 사진 하단 그라데이션 위로 올려
                  사진과 글이 한 덩어리로 읽히게 한다 */}
              {captions && captions[i] ? (
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.74)']}
                  style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingTop: 28, paddingBottom: 10 }}
                >
                  <Text style={{ color: '#F4F4FA', fontSize: 13, lineHeight: 19 }} numberOfLines={4}>
                    {captions[i]}
                  </Text>
                </LinearGradient>
              ) : null}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {items.length > 1 && (
        <>
          {/* 몇 번째 사진인지 — 점만으로는 5장 이상에서 위치가 안 읽힌다 */}
          <View style={{ position: 'absolute', top: 10, right: 10, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '600' }}>{activeIdx + 1}/{items.length}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', paddingTop: 8, gap: 5 }}>
            {items.map((_, i) => (
              <View key={i} style={{
                width: i === activeIdx ? 16 : 6, height: 6, borderRadius: 3,
                backgroundColor: i === activeIdx ? skinAccent.accent : '#4A4A59',
              }} />
            ))}
          </View>
        </>
      )}
    </View>
  );
};

// ─── 블로그 블록 렌더러 ───
// ─── 블로그 영상 플레이어 (로컬: expo-video, 임베드: WebView) ───
const BlogLocalVideo = ({ uri }: { uri: string }) => {
  const { blogS } = useSheets();
  const player = useVideoPlayer(uri, (p) => { p.loop = false; p.muted = false; });
  return (
    <VideoView style={blogS.video} player={player} contentFit="contain" nativeControls allowsFullscreen />
  );
};

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const getPlayableVideoUrl = (uri: string) => {
  const naverEmbedMatch = uri.match(/tv\.naver\.com\/embed\/([A-Za-z0-9]+)/);
  if (naverEmbedMatch) return `https://m.tv.naver.com/v/${naverEmbedMatch[1]}`;
  const playerMatch = uri.match(/player\.naver\.com[^"]*vid=([A-Za-z0-9]+)/);
  if (playerMatch) return `https://m.tv.naver.com/v/${playerMatch[1]}`;
  return uri;
};

/**
 * 블로그 본문의 단일 이미지 블록.
 *
 * 4:3 고정 + cover였던 탓에 세로로 찍은 사진은 위아래가 잘려 나갔다. 같은 사진이
 * 소셜 피드에서는 원본 비율로 보여서 화면마다 다르게 보이기도 했다. 원본 비율을 재서
 * 그대로 그리되, 지나치게 길거나 넓은 사진이 화면을 독점하지 않게 제한한다 —
 * 범위(0.6~1.4)는 같은 파일의 SlideImageViewerDetail과 맞췄다.
 */
const BlogImageBlock = ({ uri, caption, onImagePress }: {
  uri: string;
  caption?: string;
  onImagePress?: (uris: string[], index: number) => void;
}) => {
  const { blogS } = useSheets();
  const [ratio, setRatio] = useState<number | null>(null); // 높이/너비
  useEffect(() => {
    let alive = true;
    setRatio(null); // uri가 바뀌면 이전 사진의 비율을 그대로 쓰지 않는다
    Image.getSize(
      uri,
      (w, h) => {
        if (!alive || w <= 0) return;
        // 측정 전 4:3 자리에서 실제 비율로 바뀌는 순간이 튀지 않게
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setRatio(Math.min(Math.max(h / w, 0.6), 1.4));
      },
      () => {}, // 실패하면 기본 4:3 유지
    );
    return () => { alive = false; };
  }, [uri]);
  return (
    <View style={blogS.imageWrap}>
      <TouchableOpacity activeOpacity={0.85} onPress={() => onImagePress?.([uri], 0)}>
        {/* RN의 aspectRatio는 너비/높이라 h/w의 역수를 넣는다 */}
        <Image
          source={{ uri }}
          style={[blogS.image, ratio != null && { aspectRatio: 1 / ratio }]}
          resizeMode="cover"
        />
      </TouchableOpacity>
      {caption ? <Text style={blogS.caption}>{caption}</Text> : null}
    </View>
  );
};

const BlogVideoBlock = ({ uri, caption }: { uri: string; caption?: string }) => {
  const { blogS } = useSheets();
  const { t } = useTranslation();
  const isLocal = uri.startsWith('file://') || uri.startsWith('content://') || uri.startsWith('/');
  const isEmbed = uri.startsWith('http');
  return (
    <View style={blogS.imageWrap}>
      {isLocal ? (
        <BlogLocalVideo uri={uri} />
      ) : isEmbed ? (
        <View style={blogS.video}>
          <WebView
            source={{ uri: getPlayableVideoUrl(uri) }}
            style={{ flex: 1, backgroundColor: '#000' }}
            userAgent={MOBILE_UA}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsFullscreenVideo
            javaScriptEnabled
            domStorageEnabled
          />
        </View>
      ) : (
        <TouchableOpacity style={[blogS.video, { justifyContent: 'center', alignItems: 'center' }]} activeOpacity={0.7} onPress={() => Linking.openURL(uri).catch(() => {})}>
          <Text style={{ color: '#fff', fontSize: 40 }}>▶</Text>
          <Text style={{ color: '#A1A1B0', fontSize: 12, marginTop: 8 }} {...andFitText}>{t('blog.externalVideo')}</Text>
        </TouchableOpacity>
      )}
      {caption ? <Text style={blogS.caption}>{caption}</Text> : null}
    </View>
  );
};

const BlogBlockRenderer = ({
  block,
  fontScale,
  onImagePress,
}: {
  block: BlogBlock;
  fontScale: number;
  onImagePress?: (uris: string[], index: number) => void;
}) => {
  const { blogS } = useSheets();
  const skinAccent = useSkinAccent(); // 인용구 등 강조를 스킨색으로
  switch (block.type) {
    case 'text': {
      const fs = (block.fontSize || 15) * fontScale;
      // 커스텀 한글 서체(단일 굵기)에 fontWeight를 얹으면 안드로이드는 시스템 폰트로
      // 통째로 폴백한다 → 안드로이드는 서체 유지를 우선한다 (작성 화면과 동일 규칙)
      const customFam = block.fontFamily && block.fontFamily !== 'System' ? block.fontFamily : undefined;
      return (
        <Text
          style={[
            blogS.text,
            { fontSize: fs, lineHeight: fs * 1.7 },
            block.bold && { fontWeight: customFam && Platform.OS === 'android' ? 'normal' : '700' },
            block.italic && { fontStyle: 'italic' },
            (block.underline || block.strikethrough) && {
              textDecorationLine: block.underline
                ? (block.strikethrough ? 'underline line-through' : 'underline')
                : 'line-through',
            },
            block.color && { color: block.color },
            block.bgColor && block.bgColor !== 'transparent' && { backgroundColor: block.bgColor },
            block.align && { textAlign: block.align },
            customFam && { fontFamily: customFam },
          ]}
        >
          {block.value}
        </Text>
      );
    }
    case 'heading': {
      const sizes = { 1: 24, 2: 20, 3: 17 };
      const fs = sizes[block.level] * fontScale;
      return (
        <Text
          style={[
            blogS.heading,
            { fontSize: fs, lineHeight: fs * 1.4 },
            block.align && { textAlign: block.align },
          ]}
        >
          {block.value}
        </Text>
      );
    }
    case 'image':
      return <BlogImageBlock uri={block.uri} caption={block.caption} onImagePress={onImagePress} />;
    case 'images': {
      if (block.layout === 'slide') {
        return <SlideImageViewerDetail items={block.items} onImagePress={onImagePress} />;
      }
      const cols = block.layout === 'grid3' ? 3 : 2;
      return (
        <View style={blogS.imagesGrid}>
          {block.items.map((item, i) => (
            <View key={i} style={{ width: `${100 / cols - 1}%` as any }}>
              <TouchableOpacity activeOpacity={0.85} onPress={() => onImagePress?.(block.items.map(it => it.uri), i)}>
                <Image source={{ uri: item.uri }} style={blogS.gridImage} resizeMode="cover" />
              </TouchableOpacity>
              {item.caption ? <Text style={blogS.caption}>{item.caption}</Text> : null}
            </View>
          ))}
        </View>
      );
    }
    case 'separator': {
      const sepStyles: Record<string, any> = {
        line: { borderBottomWidth: 1, borderBottomColor: '#2A2A3A' },
        dots: { borderBottomWidth: 1, borderStyle: 'dotted', borderBottomColor: '#2A2A3A' },
        dashed: { borderBottomWidth: 1, borderStyle: 'dashed', borderBottomColor: '#2A2A3A' },
        thick: { borderBottomWidth: 3, borderBottomColor: '#2A2A3A' },
        space: { height: 32 },
      };
      return <View style={[blogS.separator, sepStyles[block.style] || sepStyles.line]} />;
    }
    case 'quote':
      return (
        <View style={[blogS.quote, { borderLeftColor: skinAccent.accent, backgroundColor: skinAccent.tint(0.06) }]}>
          <Text style={[blogS.quoteText, { fontSize: 15 * fontScale }]}>{block.value}</Text>
        </View>
      );
    case 'link':
      return (
        <TouchableOpacity
          style={blogS.linkCard}
          activeOpacity={0.7}
          onPress={() => Linking.openURL(block.url).catch(() => {})}
        >
          {block.thumbnail ? (
            <Image source={{ uri: block.thumbnail }} style={blogS.linkThumb} />
          ) : null}
          <View style={blogS.linkInfo}>
            <Text style={blogS.linkTitle} numberOfLines={1}>
              {block.title || block.url}
            </Text>
            {block.description ? (
              <Text style={blogS.linkDesc} numberOfLines={2}>{block.description}</Text>
            ) : null}
            <Text style={blogS.linkUrl} numberOfLines={1}>{block.url}</Text>
          </View>
        </TouchableOpacity>
      );
    case 'video':
      // 가져오기 자리 표시(채워지지 않은 placeholder)는 읽기 화면에서 숨긴다
      if ((block as any).placeholder || !block.uri) return null;
      return <BlogVideoBlock uri={block.uri} caption={block.caption} />;
    case 'file': {
      const sizeStr = block.fileSize ? (block.fileSize < 1024 * 1024 ? `${(block.fileSize / 1024).toFixed(0)}KB` : `${(block.fileSize / (1024 * 1024)).toFixed(1)}MB`) : '';
      return (
        <View style={blogS.fileBlock}>
          <PaperclipIcon size={20} color="#A1A1B0" />
          <View style={{ flex: 1 }}>
            <Text style={blogS.fileName} numberOfLines={1}>{block.fileName}</Text>
            {sizeStr ? <Text style={blogS.fileSize}>{sizeStr}</Text> : null}
          </View>
        </View>
      );
    }
    default:
      return null;
  }
};

// ─── 목차(TOC) 컴포넌트 ───
const TableOfContents = ({
  headings,
  onPress,
}: {
  headings: { id: string; level: number; text: string }[];
  onPress: (id: string) => void;
}) => {
  const { blogS } = useSheets();
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  const [open, setOpen] = useState(false);
  if (headings.length === 0) return null;
  return (
    <View style={[blogS.tocWrap, { backgroundColor: skinAccent.tint(0.06), borderColor: skinAccent.tint(0.12) }]}>
      <TouchableOpacity style={blogS.tocToggle} onPress={() => setOpen(!open)} activeOpacity={0.7}>
        <Text style={[blogS.tocToggleText, { color: skinAccent.accent }]}>📋 {t('comp2.toc')}</Text>
        <Text style={blogS.tocArrow}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open &&
        headings.map((h) => (
          <TouchableOpacity
            key={h.id}
            style={[blogS.tocItem, { paddingLeft: 16 + (h.level - 1) * 16 }]}
            onPress={() => onPress(h.id)}
            activeOpacity={0.7}
          >
            <Text style={blogS.tocItemText}>{h.text}</Text>
          </TouchableOpacity>
        ))}
    </View>
  );
};

// ── 스냅 스토리 뷰어 (자립형 — 내부에서 스냅 인덱스 관리) ──
// 같은 스토리 안에서 스냅 사진이 바뀔 때 부드럽게 크로스페이드
function CrossfadePhoto({ uri }: { uri?: string }) {
  const { storyS } = useSheets();
  const op = useRef(new Animated.Value(1)).current;
  const prev = useRef(uri);
  useEffect(() => {
    if (prev.current !== uri) {
      prev.current = uri;
      op.setValue(0.4);
      Animated.timing(op, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [uri]);
  if (!uri) {
    return <View style={storyS.bgPlaceholder}><Text style={{ fontSize: 64, opacity: 0.2 }}>📸</Text></View>;
  }
  return <Animated.Image source={{ uri }} style={[storyS.bgPhoto, { opacity: op }]} resizeMode="cover" />;
}

// ── 큐브 페이지: scrollX 기반으로 100% UI 스레드에서 3D rotateY 회전 ──
function SnapCubePage({ index, scrollX, width, leftCube, rightCube, children }: {
  index: number; scrollX: any; width: number; leftCube: boolean; rightCube: boolean; children: React.ReactNode;
}) {
  // 같은 유저/여행 경계는 평범한 슬라이드(회전 0), 다른 유저 경계만 큐브 회전
  const cubeStyle = useAnimatedStyle(() => {
    const input = [(index - 1) * width, index * width, (index + 1) * width];
    const lA = leftCube ? 88 : 0;
    const rA = rightCube ? -88 : 0;
    const rotateY = interpolate(scrollX.value, input, [lA, 0, rA], Extrapolation.CLAMP);
    const pivot = interpolate(scrollX.value, input, [leftCube ? -width / 2 : 0, 0, rightCube ? width / 2 : 0], Extrapolation.CLAMP);
    const scale = interpolate(scrollX.value, input, [leftCube ? 0.93 : 1, 1, rightCube ? 0.93 : 1], Extrapolation.CLAMP);
    return {
      transform: [
        { perspective: width * 1.6 },
        { translateX: pivot },
        { rotateY: `${rotateY}deg` },
        { translateX: -pivot },
        { scale },
      ],
    };
  });
  const shadeStyle = useAnimatedStyle(() => {
    const input = [(index - 1) * width, index * width, (index + 1) * width];
    const opacity = interpolate(scrollX.value, input, [leftCube ? 0.5 : 0, 0, rightCube ? 0.5 : 0], Extrapolation.CLAMP);
    return { opacity };
  });
  return (
    <Reanimated.View style={[{ width, height: '100%', backfaceVisibility: 'hidden' }, cubeStyle]}>
      {children}
      <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, shadeStyle]} />
    </Reanimated.View>
  );
}

function SnapViewerModal({
  visible,
  onClose,
  viewers = [],
}: {
  visible: boolean;
  onClose: () => void;
  viewers?: { handle: string; name: string; time: number; emoji?: string }[];
}) {
  const { viewerS } = useSheets();
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  const viewerInsets = useSafeAreaInsets(); // pageSheet가 안드로이드에선 전체화면이라 상단 인셋 보정
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {/* pageSheet는 안드로이드에서 무시되어 전체화면이 되므로 상단 인셋을 직접 보정 */}
      <View style={[viewerS.root, Platform.OS === 'android' && { paddingTop: viewerInsets.top }]} accessibilityViewIsModal>
        {/* 드래그바 */}
        <View style={viewerS.handle} />
        <Text style={viewerS.title}>{t('postDetail.snapViewersTitle')}</Text>
        <Text style={[viewerS.subtitle, { color: skinAccent.accent }]}>{t('postDetail.totalReadN', { count: viewers.length })}</Text>

        <ScrollView contentContainerStyle={viewerS.list} showsVerticalScrollIndicator={false}>
          {viewers.length === 0 && (
            <Text style={[viewerS.subtitle, { color: skinAccent.accent }]}>{t('postDetail.noSnapViewers')}</Text>
          )}
          {viewers.map((v, i) => (
            <View key={i} style={viewerS.row}>
              <View style={viewerS.avatar}>
                <Text style={viewerS.avatarText}>{v.emoji}</Text>
              </View>
              <View style={viewerS.info}>
                <Text style={viewerS.name}>{v.name}</Text>
                <Text style={viewerS.handleText}>@{v.handle}</Text>
              </View>
              <Text style={viewerS.time}>{v.time}</Text>
            </View>
          ))}
        </ScrollView>
        
        {/* 닫기 버튼은 margin:20을 유지해야 해서 폭 클램프를 래퍼가 맡는다
            (버튼에 직접 width:'100%'+margin을 주면 40dp 넘친다). */}
        <View style={viewerS.footer}>
          <TouchableOpacity style={viewerS.closeBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={viewerS.closeBtnText} {...andFitText}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function SnapStoryViewer({
  initialPostId, records, navigation, toggleLike, deleteRecord, archiveRecord, markSnapViewed,
}: {
  initialPostId: string;
  records: TravelRecord[];
  navigation: any;
  toggleLike: (id: string) => void;
  deleteRecord: (id: string) => void;
  archiveRecord: (id: string) => void;
  markSnapViewed: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { s, shareS, storyS } = useSheets();
  // 스토리 페이지 폭·높이 — 폭은 Stage(클램프), 높이는 실제 창. 스크롤 오프셋 계산에 들어간다.
  const SCREEN_W = useStageWidth();
  // ⋯ 메뉴는 Modal(루트 클램프 밖) 안에서 오른쪽 끝에 붙는다 — 레터박스만큼 안쪽으로
  const stageGutter = useStageGutter();
  const { height: SCREEN_H } = useWindowDimensions();
  const insets = useSafeAreaInsets(); // 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨)
  const skinAccent = useSkinAccent(); // 댓글 배지·전송 버튼 등 강조를 스킨색으로
  // 내 프로필(사진·아이디)은 실시간 설정에서 읽어, 프로필 변경이 내 스냅 헤더에 즉시 반영되게 한다
  const { handle: myHandle, profilePhoto: myPhoto, handleFont: myHandleFont, isPremium: myPremium } = useSettings();
  // 작성자별로 그룹화된 전체 스냅 목록 (같은 작성자끼리 연속 배치)
  const allSnaps = useMemo(() => records.filter((r: any) => r.viewType === 'snap'), [records]);
  // 작성자 + 국가별로 그룹화 (같은 사용자라도 다른 나라면 별도 스토리)
  const getStoryKey = (s: any) =>
    `${s.user.handle}::${s.countryName || s.snapDetectedCountry || ''}`;

  // 스토리(유저+국가) 단위 그룹 — 선택한 스토리를 맨 앞으로
  const stories = useMemo(() => {
    const byKey: Record<string, any[]> = {};
    const order: string[] = [];
    const initialSnap = allSnaps.find((r: any) => r.id === initialPostId);
    const startKey = initialSnap ? getStoryKey(initialSnap) : '';
    allSnaps.forEach((s: any) => {
      const k = getStoryKey(s);
      if (!byKey[k]) { byKey[k] = []; order.push(k); }
      byKey[k].push(s);
    });
    const keys = [startKey, ...order.filter(k => k !== startKey)].filter(k => byKey[k]);
    // 스토리 안 스냅은 제일 먼저 올린 것부터(오름차순) 재생
    return keys.map(k => ({
      key: k,
      snaps: [...byKey[k]].sort((a: any, b: any) => (a.timestamp ?? 0) - (b.timestamp ?? 0)),
    }));
  }, [allSnaps, initialPostId]);

  // 초기 위치는 한 번만 확정 (이후 store 변경으로 뷰어가 점프하지 않게).
  // stories가 처음 채워진 렌더에서 계산해, 데이터가 늦게 와도 올바른 위치를 잡는다.
  const initPosRef = useRef<{ si: number; li: number } | null>(null);
  if (initPosRef.current === null && stories.length > 0) {
    let pos = { si: 0, li: 0 };
    for (let si = 0; si < stories.length; si++) {
      // 해당 스토리를 열면 제일 먼저 올린 스냅(li=0)부터 재생
      if (stories[si].snaps.some((s: any) => s.id === initialPostId)) { pos = { si, li: 0 }; break; }
    }
    initPosRef.current = pos;
  }
  const initPos = initPosRef.current ?? { si: 0, li: 0 };

  const [storyIdx, setStoryIdx] = useState(initPos.si);
  const [localIdx, setLocalIdx] = useState(initPos.li);
  const currentStory = stories[storyIdx];
  const currentSnap = currentStory?.snaps[Math.min(localIdx, (currentStory?.snaps.length || 1) - 1)];
  // 스냅 열람 시 viewed 처리 — 스냅 id가 바뀔 때만 실행(snapViewed 변경으로 인한 재실행 방지)
  useEffect(() => {
    if (currentSnap && !currentSnap.isExample && !currentSnap.isMyPost && !currentSnap.snapViewed) markSnapViewed(currentSnap.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSnap?.id]);

  const [commentSheetOpen, setCommentSheetOpen] = useState(false);
  const [viewerListOpen, setViewerListOpen] = useState(false);
  const [replyBarOpen, setReplyBarOpen] = useState(false);
  const { commentsByPost, addComment: addCommentToStore, reportPost, neighbors, isBlocked, refreshComments } = useRecords();
  // ── 공유 시트 (인스타식: 메이트 DM으로 보내기 + 외부 공유) ──
  const { sendRecord, conversations } = useDM();
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  // 대화량 많은 메이트 순 — 소셜 피드 빠른공유와 동일 기준
  const shareFriends = useMemo(
    () => neighbors
      .map((f) => ({ id: f.id, name: f.username, handle: f.username, emoji: '🧳' }))
      .sort((a, b) => (conversations[b.handle]?.length ?? 0) - (conversations[a.handle]?.length ?? 0)),
    [neighbors, conversations]
  );
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const replyInputRef = useRef<TextInput>(null);
  const commentInputRef = useRef<TextInput>(null);
  const sendingCommentRef = useRef(false);

  const commentSheetAnim = useRef(new Animated.Value(SCREEN_H * 0.6)).current;
  const commentOverlayAnim = useRef(new Animated.Value(0)).current;
  // 댓글 시트는 화면 하단 고정(absolute)이라 내부 KeyboardAvoidingView만으로는 입력창이 키보드에
  // 가린다. 키보드 높이만큼 시트 전체를 위로 들어올려 입력창이 항상 키보드 위에 보이게 한다.
  const keyboardLift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: any) => {
      Animated.timing(keyboardLift, {
        toValue: e.endCoordinates?.height ?? 0,
        duration: e.duration || 220,
        useNativeDriver: true,
      }).start();
    };
    const onHide = (e: any) => {
      Animated.timing(keyboardLift, {
        toValue: 0,
        duration: e?.duration || 200,
        useNativeDriver: true,
      }).start();
    };
    const s1 = Keyboard.addListener(showEvt, onShow);
    const s2 = Keyboard.addListener(hideEvt, onHide);
    return () => { s1.remove(); s2.remove(); };
  }, [keyboardLift]);

  // ── Reanimated 큐브 캐러셀 (스토리 단위 페이지) ──
  const scrollRef = useRef<any>(null);
  const scrollX = useSharedValue(initPos.si * SCREEN_W);
  const ty = useSharedValue(0); // 아래로 끌어 닫기
  const onStoryChange = (i: number) => {
    const t = Math.max(0, Math.min(stories.length - 1, i));
    setStoryIdx(t); setLocalIdx(0);
  };
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => { scrollX.value = e.contentOffset.x; },
    onMomentumEnd: (e) => { runOnJS(onStoryChange)(Math.round(e.contentOffset.x / SCREEN_W)); },
  });
  const dismissStyle = useAnimatedStyle(() => {
    const scale = interpolate(ty.value, [0, SCREEN_H], [1, 0.86], Extrapolation.CLAMP);
    const radius = interpolate(ty.value, [0, 120], [0, 22], Extrapolation.CLAMP);
    return { transform: [{ translateY: ty.value }, { scale }], borderRadius: radius };
  });
  useEffect(() => {
    if (initPos.si > 0) {
      const t = setTimeout(() => scrollRef.current?.scrollTo({ x: initPos.si * SCREEN_W, animated: false }), 0);
      return () => clearTimeout(t);
    }
  }, []);

  // 댓글 시트 드래그 닫기 PanResponder — Hook이므로 early return 위에서 생성한다.
  // (콜백은 렌더 시점이 아닌 제스처 시점에 실행되므로 아래의 closeCommentSheet 전방 참조는 안전)
  const commentSheetPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4,
      onPanResponderMove: (_, g) => { if (g.dy > 0) commentSheetAnim.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) closeCommentSheet();
        else Animated.spring(commentSheetAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }).start();
      },
    })
  ).current;

  // 표시할 스냅이 없으면 닫기 — 렌더 중 부수효과 금지, useEffect에서 처리
  useEffect(() => {
    if (!currentSnap || stories.length === 0) navigation.goBack();
  }, [currentSnap, stories.length, navigation]);

  // ── 스토리 자동 넘김 + 진행 바 + 길게 눌러 일시정지 ──
  const STORY_DURATION = 5000; // 스냅 1장 노출 시간(ms)
  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const [paused, setPaused] = useState(false);
  const [dragPaused, setDragPaused] = useState(false); // 아래로 끌어 닫기 드래그 중 일시정지
  // 꾹 누르는 동안 UI 전체 페이드 아웃 — 사진만 보기 (인스타 스토리 패턴)
  const uiOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(uiOpacity, { toValue: paused ? 0 : 1, duration: 150, useNativeDriver: true }).start();
  }, [paused, uiOpacity]);
  const advanceRef = useRef<(dir: 'next' | 'prev') => void>(() => {});

  // 어떤 오버레이도 안 떠 있고 일시정지/드래그 아니면 재생
  const storyPlaying =
    !paused && !dragPaused && !commentSheetOpen && !replyBarOpen && !menuVisible && !reportVisible && !viewerListOpen && !shareSheetOpen;

  // 스냅이 바뀌면 진행도 리셋
  useEffect(() => { progressAnim.setValue(0); }, [storyIdx, localIdx]);

  // 다음 스냅 이미지 미리 받기 — 자동 넘김 전환 시 깜빡임/로딩 감소
  useEffect(() => {
    if (!currentStory) return;
    const next = localIdx < currentStory.snaps.length - 1
      ? currentStory.snaps[localIdx + 1]
      : stories[storyIdx + 1]?.snaps?.[0];
    const uri = next && (next.snapBackUri || next.snapFrontUri || next.medias?.[0]);
    if (uri) Image.prefetch(uri).catch(() => {});
  }, [storyIdx, localIdx, currentStory, stories]);

  // 재생 중일 때 현재 값에서 이어서 진행, 완료되면 다음으로
  useEffect(() => {
    if (!storyPlaying) { progressAnim.stopAnimation(); return; }
    progressAnim.stopAnimation((v: number) => {
      const remaining = STORY_DURATION * (1 - v);
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: Math.max(0, remaining),
        easing: Easing.linear,
        useNativeDriver: false,
      }).start(({ finished }) => { if (finished) advanceRef.current('next'); });
    });
    return () => { progressAnim.stopAnimation(); };
  }, [storyPlaying, storyIdx, localIdx]);

  // 표시 중인 스냅이 바뀌면 그 스냅의 서버 댓글을 불러온다.
  // PostDetail 본문 이펙트는 '진입한' 스냅 하나만 조회해서, 스토리를 넘기면 다른 스냅의
  // 서버 댓글이 붙지 않아 댓글 수가 0으로 보였다.
  // 한 번 불러온 스냅은 다시 부르지 않는다 — 넘겼다 돌아올 때의 중복 조회와,
  // refreshComments가 commentsByPost를 갱신해 재렌더될 때의 재호출 루프를 함께 막는다.
  // 진입 스냅(initialPostId)은 본문 이펙트가 이미 조회하므로 미리 넣어 둔다.
  const fetchedCommentsRef = useRef<Set<string>>(new Set([initialPostId]));
  useEffect(() => {
    const id = currentSnap?.id;
    const remoteId = currentSnap?.remoteId;
    if (!id || !remoteId || currentSnap?.isExample) return;
    if (fetchedCommentsRef.current.has(id)) return;
    // await 전에 넣어 동시 중복 호출을 막고, 실패하면 되돌려 다음 진입 때 재시도되게 한다
    fetchedCommentsRef.current.add(id);
    refreshComments(id, remoteId).catch(() => { fetchedCommentsRef.current.delete(id); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSnap?.id, currentSnap?.remoteId, refreshComments]);

  if (!currentSnap || stories.length === 0) return null;

  // 수정 3: 차단된 사용자의 댓글·답글 필터 (PostComment에 handle 없으므로 name으로 매칭)
  const rawSnapComments = commentsByPost[currentSnap.id] ?? [];
  const comments = rawSnapComments
    .filter((c: any) => !isBlocked({ name: c.name }))
    .map((c: any) => ({
      ...c,
      replies: c.replies ? c.replies.filter((r: any) => !isBlocked({ name: r.name })) : c.replies,
    }));
  const totalComments = comments.reduce((sum: number, c) => sum + 1 + (c.replies?.length || 0), 0);
  const isMyPost = currentSnap.isMyPost === true;

  const addComment = () => {
    // 연타 가드 — 입력 비우기에만 의존하면 두 번 눌린 사이에 같은 댓글이 두 번 저장된다
    // (서버 addComment 에 멱등키가 없어 중복 행이 그대로 남는다).
    if (sendingCommentRef.current || !commentText.trim()) return;
    sendingCommentRef.current = true;
    setTimeout(() => { sendingCommentRef.current = false; }, 800);
    addCommentToStore(currentSnap.id, commentText.trim(), replyTo?.id);
    setReplyTo(null);
    setCommentText('');
  };
  const handleReply = (id: string, name: string) => { setReplyTo({ id, name }); commentInputRef.current?.focus(); };
  const cancelReply = () => setReplyTo(null);

  const goToStory = (target: number) => {
    if (target < 0 || target >= stories.length) { navigation.goBack(); return; }
    scrollRef.current?.scrollTo({ x: target * SCREEN_W, animated: true });
  };
  // 같은 스토리 안에선 사진만 교체(localIdx), 끝이면 다음 스토리로(큐브)
  const advance = (dir: 'next' | 'prev') => {
    if (replyBarOpen || commentSheetOpen) return;
    const len = currentStory.snaps.length;
    if (dir === 'next') {
      if (localIdx < len - 1) setLocalIdx(localIdx + 1);
      else goToStory(storyIdx + 1);
    } else {
      if (localIdx > 0) setLocalIdx(localIdx - 1);
      else goToStory(storyIdx - 1);
    }
  };
  const onTapPage = (evt: any) => {
    if (replyBarOpen || commentSheetOpen) return;
    advance(evt.nativeEvent.locationX < SCREEN_W / 3 ? 'prev' : 'next');
  };
  // 자동 넘김 타이머가 최신 advance를 참조하도록 (stale 클로저 방지)
  advanceRef.current = advance;

  // 아래로 끌어 닫기 (gesture-handler + reanimated, 가로 스크롤과 공존)
  const closeViewer = () => navigation.goBack();
  const dismissGesture = Gesture.Pan()
    .activeOffsetY([14, 9999])
    .failOffsetX([-18, 18])
    .onStart(() => { 'worklet'; runOnJS(setDragPaused)(true); }) // 드래그 동안 자동 넘김 정지
    .onUpdate((e) => { 'worklet'; if (e.translationY > 0) ty.value = e.translationY; })
    .onEnd((e) => {
      'worklet';
      if (e.translationY > 100 || e.velocityY > 700) {
        ty.value = withTiming(SCREEN_H, { duration: 180 }, () => { runOnJS(closeViewer)(); });
        // 닫히는 중이므로 재개 불필요
      } else {
        ty.value = withSpring(0, { damping: 18, stiffness: 180 });
        runOnJS(setDragPaused)(false); // 취소(원위치)면 자동 넘김 재개
      }
    });

  // 한 스토리(유저) 페이지 렌더 — 같은 스토리는 사진만 교체
  const renderStoryPage = (story: any, si: number) => {
    const li = si === storyIdx ? Math.min(localIdx, story.snaps.length - 1) : 0;
    const s = story.snaps[li];
    // 이 페이지(스냅) 기준 댓글 수 — currentSnap 기준(totalComments)으로 그리면 다른 페이지에 오표시됨
    const sComments = commentsByPost[s.id] ?? [];
    const sTotalComments = sComments.reduce((sum: number, c: any) => sum + 1 + (c.replies?.length || 0), 0);
    const late = (s.snapLateSeconds && s.snapLateSeconds > 0)
      ? (s.snapLateSeconds < 60 ? t('postDetail.snapLateSec', { sec: s.snapLateSeconds }) : t('postDetail.snapLateMinSec', { min: Math.floor(s.snapLateSeconds / 60), sec: s.snapLateSeconds % 60 }))
      : '';
    return (
      <>
        <CrossfadePhoto uri={s.snapBackUri || s.snapFrontUri || s.medias?.[0]} />
        {/* 탭으로 넘기기 — 하단(캡션·지역 배지·액션)·상단 헤더 영역은 제외해 오탭 방지 */}
        <Pressable
          style={{ position: 'absolute', left: 0, right: 0, top: 64, bottom: 140 }}
          onPress={onTapPage}
          onLongPress={() => setPaused(true)}
          delayLongPress={200}
          onPressOut={() => setPaused(false)}
        />
        {/* PiP(다른 방향 사진)는 꾹 눌러도 사진과 함께 계속 보인다 — 페이드 래퍼 밖 */}
        {s.snapBackUri && s.snapFrontUri && (
          <LinearGradient colors={['#00D8F3', '#7B61FF', '#FF14E4']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={storyS.pipWrap}>
            <Image source={{ uri: s.snapFrontUri }} style={storyS.pipImg} resizeMode="cover" />
          </LinearGradient>
        )}
        {/* 꾹 누르는 동안(paused) 오버레이 UI 전체가 페이드 아웃되고 사진만 남는다 (인스타 스토리 패턴) */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: uiOpacity }]} pointerEvents={paused ? 'none' : 'box-none'}>
        {/* 안드로이드 상태바 인셋 보정 — 스토리 뷰어 루트에 SafeAreaView가 없어 전체가 edge-to-edge다.
            스타일의 리터럴 50은 iPhone 노치 기준값이라 안드로이드에선 기기별 상태바 높이와 어긋난다.
            직계 형제 bottomGradient(insets.bottom + 16)와 같은 방식으로 맞춘다 */}
        <LinearGradient colors={['rgba(0,0,0,0.6)', 'transparent']} style={[storyS.topGradient, { paddingTop: Platform.OS === 'ios' ? 50 : insets.top + 16 }]} pointerEvents="box-none">
          <View style={storyS.progressRow}>
            {story.snaps.map((_: any, k: number) => {
              const isCurrentPage = si === storyIdx;
              const isPast = isCurrentPage && k < li;
              const isActive = isCurrentPage && k === li;
              return (
                <View key={k} style={storyS.progressSeg}>
                  {isActive ? (
                    <Animated.View style={[storyS.progressFill, { width: progressWidth }]} />
                  ) : (
                    <View style={[storyS.progressFill, { width: isPast ? '100%' : '0%' }]} />
                  )}
                </View>
              );
            })}
          </View>
          <View style={storyS.topRow}>
            {/* 프로필 사진·아이디 탭 → 프로필 화면 (내 스냅이면 내 프로필로, 예시는 이동 금지) */}
            <TouchableOpacity
              style={storyS.authorTap}
              activeOpacity={s.isExample ? 1 : 0.7}
              accessibilityRole="button"
              accessibilityLabel={s.isMyPost === true ? t('postDetail.myProfileA11y') : t('postDetail.authorProfileA11y')}
              onPress={() => {
                if (s.isExample) return;
                navigation.navigate('FriendProfile', s.isMyPost === true
                  ? { userId: s.authorId ?? s.id, username: myHandle || s.user.name, handle: myHandle }
                  : { userId: s.authorId ?? s.id, username: s.user.name, handle: s.user.handle });
              }}
            >
              <View style={storyS.avatarRing}><View style={[storyS.avatar, s.isExample && { overflow: 'hidden' }]}>
                {s.isExample ? (
                  <Image source={APP_LOGO} style={{ width: 40, height: 40 }} resizeMode="cover" />
                ) : (
                  // 내 스냅은 실시간 설정 사진, 타인 스냅은 작성자 프로필 사진.
                  // 타인 분기(s.user.photo)가 없어 남의 스냅은 항상 실루엣으로 보였다.
                  // AuthorAvatar가 사진 없음·로드 실패를 모두 사람 실루엣으로 폴백한다.
                  <AuthorAvatar photo={s.isMyPost === true ? myPhoto : s.user?.photo} size={40} emojiSize={22} />
                )}
              </View></View>
              <View style={storyS.userInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {/* 예시 콘텐츠는 @핸들 대신 'eOrth 공식' 필 배지만 표시 (기능 소개 카드와 동일 룩) */}
                  {s.isExample ? (
                    <Text style={storyS.officialBadge}>{t('socialEmpty.official')}</Text>
                  ) : (
                    <Text style={[storyS.handle, handleFontStyle(s.isMyPost === true ? (myPremium ? myHandleFont : null) : s.user.font)]}>@{s.isMyPost === true ? (myHandle || s.user.handle) : s.user.handle}</Text>
                  )}
                </View>
                {!s.isExample && <Text style={storyS.timeText}>{timeAgo(s.timestamp)}</Text>}
              </View>
            </TouchableOpacity>
            {!s.isExample && (
              <TouchableOpacity onPress={() => setMenuVisible(true)} style={storyS.moreBtn} accessibilityRole="button" accessibilityLabel={t('postDetail.more')}><Text style={storyS.moreBtnText}>···</Text></TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => navigation.goBack()} style={storyS.closeBtn} accessibilityRole="button" accessibilityLabel={t('common.close')}><Text style={storyS.closeBtnText}>✕</Text></TouchableOpacity>
          </View>
        </LinearGradient>
        {/* 스냅 및 촬영지연 뱃지 비활성화 */}
        {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) */}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={[storyS.bottomGradient, { paddingBottom: Platform.OS === 'ios' ? 36 : insets.bottom + 16 }]} pointerEvents="box-none">
          {s.snapDetectedCountry && (
            <View style={storyS.locationBadge}>
              <PinIcon size={13} color="#FFFFFF" />
              <Text style={storyS.locationText}>{countryLabel(s.snapDetectedCountry, i18n.language)}{s.regionName ? ` · ${regionDisplayName(s.regionName, s.regionNameEn, i18n.language)}` : ''}</Text>
            </View>
          )}
          {s.snapCaption ? <Text style={storyS.caption}>{s.snapCaption}</Text> : null}
          <View style={storyS.actionRow}>
            {s.isMyPost === true ? (
              /* 내가 올린 스냅 */
              <>
                <TouchableOpacity style={storyS.actionBtnWithLabel} onPress={() => setViewerListOpen(true)} accessibilityRole="button" accessibilityLabel={t('postDetail.viewersA11y')}>
                  <EyesSvg size={20} />
                  <Text style={storyS.actionLabel}>{s.snapViewers?.length ?? 0}</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                {!s.isExample && (
                  <TouchableOpacity style={storyS.actionBtn} onPress={openCommentSheet} accessibilityRole="button" accessibilityLabel={t('postDetail.commentA11y')}>
                    <CommentSvg size={22} color="#fff" />
                    {sTotalComments > 0 && (<View style={[storyS.commentCountBadge, { backgroundColor: skinAccent.accent }]}><Text style={storyS.commentCountText}>{sTotalComments}</Text></View>)}
                  </TouchableOpacity>
                )}
                {!s.isExample && (
                  <TouchableOpacity style={storyS.actionBtn} onPress={() => toggleLike(s.id)} accessibilityRole="button" accessibilityLabel={s.liked ? t('postDetail.unlike') : t('postDetail.like')}>
                    <Text style={[storyS.actionIcon, s.liked && { color: '#FF6B9D' }]}>{s.liked ? '♥' : '♡'}</Text>
                  </TouchableOpacity>
                )}
                {!s.isExample && (
                  <TouchableOpacity style={storyS.actionBtn} onPress={handleSharePost} accessibilityRole="button" accessibilityLabel={t('postDetail.shareA11y')}>
                    <SendPlaneSvg size={22} />
                  </TouchableOpacity>
                )}
              </>
            ) : (
              /* 타인이 올린 스냅 */
              <>
                {!s.isExample && (
                  <TouchableOpacity style={storyS.replyWrap} activeOpacity={0.8} onPress={() => { setReplyBarOpen(true); setTimeout(() => replyInputRef.current?.focus(), 100); }} accessibilityRole="button" accessibilityLabel={t('postDetail.sendMessageA11y')}>
                    <View style={storyS.replyInput} pointerEvents="none"><Text style={storyS.replyPlaceholder}>{t('postDetail.sendMessagePlaceholder')}</Text></View>
                  </TouchableOpacity>
                )}
                {!s.isExample && (
                  <TouchableOpacity style={storyS.actionBtn} onPress={openCommentSheet} accessibilityRole="button" accessibilityLabel={t('postDetail.commentA11y')}>
                    <CommentSvg size={22} color="#fff" />
                    {sTotalComments > 0 && (<View style={[storyS.commentCountBadge, { backgroundColor: skinAccent.accent }]}><Text style={storyS.commentCountText}>{sTotalComments}</Text></View>)}
                  </TouchableOpacity>
                )}
                {/* 예시 스냅은 좋아요·공유 아이콘 모두 숨김 (댓글·답장도 위에서 숨김) */}
                {!s.isExample && (
                  <TouchableOpacity style={storyS.actionBtn} onPress={() => toggleLike(s.id)} accessibilityRole="button" accessibilityLabel={s.liked ? t('postDetail.unlike') : t('postDetail.like')}>
                    <Text style={[storyS.actionIcon, s.liked && { color: '#FF6B9D' }]}>{s.liked ? '♥' : '♡'}</Text>
                  </TouchableOpacity>
                )}
                {!s.isExample && (
                  <TouchableOpacity style={storyS.actionBtn} onPress={handleSharePost} accessibilityRole="button" accessibilityLabel={t('postDetail.shareA11y')}><SendPlaneSvg size={22} /></TouchableOpacity>
                )}
              </>
            )}
          </View>
        </LinearGradient>
        </Animated.View>
      </>
    );
  };

  // 댓글 시트
  const openCommentSheet = () => {
    setCommentSheetOpen(true);
    Animated.parallel([
      Animated.spring(commentSheetAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }),
      Animated.timing(commentOverlayAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  };
  const closeCommentSheet = () => {
    Animated.parallel([
      Animated.timing(commentSheetAnim, { toValue: SCREEN_H * 0.6, duration: 280, useNativeDriver: true }),
      Animated.timing(commentOverlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setCommentSheetOpen(false));
  };

  // 링크에는 서버 id(remoteId)를 우선 사용 — 로컬 id는 받은 쪽 기기에서 조회 불가
  const handleCopyLink = async () => { setMenuVisible(false); await Clipboard.setStringAsync(postLink(currentSnap.remoteId ?? currentSnap.id)); setToastMsg(t('social.linkCopiedToast')); setTimeout(() => setToastMsg(''), 2000); };
  // 공유 아이콘 → 인스타처럼 시트에서 메이트 DM 전송 또는 외부 공유를 고른다
  const handleSharePost = () => { setMenuVisible(false); setShareSheetOpen(true); };
  const handleShareExternal = () => {
    setShareSheetOpen(false);
    // 공유 시트 모달이 닫히는 중에 시스템 공유 시트를 띄우면 iOS가 무시한다 — 닫힘 완료 후 호출
    const id = currentSnap.remoteId ?? currentSnap.id;
    setTimeout(() => { Share.share({ message: t('comp2.sharePostMsg', { link: postLink(id) }) }); }, 400);
  };
  const handleSendToFriend = (f: { name: string; handle: string }) => {
    setShareSheetOpen(false);
    const rec = records.find((r) => r.id === currentSnap.id);
    if (!rec) return;
    sendRecord(f.handle, rec);
    setToastMsg(t('comp2.toastSentTo', { name: f.name }));
    setTimeout(() => setToastMsg(''), 2000);
  };
  const handleDelete = () => { setMenuVisible(false); Alert.alert(t('postDetail.deletePostTitle'), t('postDetail.deletePostMsg'), [{ text: t('common.cancel'), style: 'cancel' }, { text: t('postDetail.delete'), style: 'destructive', onPress: () => { deleteRecord(currentSnap.id); navigation.goBack(); } }]); };
  // 보관하기 — 일반 게시물 메뉴(handleArchive)와 동일 UX: 확인 후 토스트·닫기
  const handleArchive = () => {
    setMenuVisible(false);
    Alert.alert(t('social.archiveConfirmTitle'), t('social.archiveConfirmMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('postDetail.archiveAction'), onPress: () => { archiveRecord(currentSnap.id); setToastMsg(t('social.archivedToast')); setTimeout(() => { setToastMsg(''); navigation.goBack(); }, 1000); } },
    ]);
  };
  const handleReport = () => { setMenuVisible(false); setReportVisible(true); };

  // 시안(Group.svg): 두 줄 텍스트가 든 말풍선 아웃라인 — 스냅 스토리 전용 댓글 아이콘
  const CommentSvg = ({ size = 20, color = '#fff' }: { size?: number; color?: string }) => (
    <Svg width={size * (25 / 23)} height={size} viewBox="0 0 25 23" fill="none">
      <SvgPath d="M2.77778 7.68154C2.77778 6.54653 2.77778 5.77572 2.83056 5.17974C2.87917 4.59965 2.96944 4.30166 3.08055 4.09506L0.605556 2.8925C0.2625 3.53483 0.125 4.21955 0.061111 4.96387C-1.24176e-07 5.69229 0 6.59023 0 7.68154H2.77778ZM2.77778 10.5952V7.68154H0V10.5952H2.77778ZM0 10.5952V17.2172H2.77778V10.5952H0ZM0 17.2172V21.0766H2.77778V17.2172H0ZM0 21.0766C0 22.7864 2.16944 23.6433 3.4375 22.4341L1.47361 20.5614C1.58044 20.4594 1.71658 20.39 1.86479 20.3619C2.013 20.3338 2.16664 20.3482 2.30625 20.4034C2.44586 20.4585 2.56519 20.5519 2.64912 20.6717C2.73305 20.7916 2.77783 20.9325 2.77778 21.0766H0ZM3.4375 22.4341L7.52083 18.5417L5.55555 16.6689L1.47361 20.5614L3.4375 22.4341ZM16.9444 15.8928H7.51944V18.5417H16.9444V15.8928ZM20.7056 15.6041C20.4889 15.7101 20.1778 15.7962 19.5681 15.8425C18.9431 15.8915 18.1347 15.8928 16.9444 15.8928V18.5417C18.0889 18.5417 19.0292 18.5417 19.7944 18.4834C20.575 18.4225 21.2931 18.2913 21.9667 17.9642L20.7056 15.6041ZM21.9194 14.4466C21.6531 14.945 21.2282 15.3502 20.7056 15.6041L21.9667 17.9642C23.012 17.4563 23.8618 16.6459 24.3944 15.6492L21.9194 14.4466ZM22.2222 10.8601C22.2222 11.9951 22.2222 12.7659 22.1694 13.3619C22.1208 13.942 22.0306 14.24 21.9194 14.4466L24.3944 15.6492C24.7375 15.0068 24.875 14.3221 24.9389 13.5778C25.0014 12.8494 25 11.9514 25 10.8601H22.2222ZM22.2222 7.68154V10.8601H25V7.68154H22.2222ZM21.9194 4.09506C22.0306 4.30166 22.1208 4.59833 22.1694 5.17974C22.2222 5.77572 22.2222 6.54653 22.2222 7.68154H25C25 6.59023 25 5.69361 24.9389 4.96387C24.875 4.21955 24.7375 3.53483 24.3944 2.8925L21.9194 4.09506ZM20.7056 2.93753C21.2282 3.19147 21.6531 3.59667 21.9194 4.09506L24.3944 2.8925C23.8618 1.89573 23.012 1.08533 21.9667 0.57744L20.7056 2.93753ZM16.9444 2.64881C18.1347 2.64881 18.9431 2.64881 19.5681 2.69914C20.1764 2.74549 20.4889 2.83158 20.7056 2.93753L21.9667 0.57744C21.2931 0.250312 20.575 0.119197 19.7944 0.058274C19.0306 1.95844e-07 18.0889 0 16.9444 0V2.64881ZM8.05555 2.64881H16.9444V0H8.05555V2.64881ZM4.29444 2.93753C4.51111 2.83158 4.82222 2.74549 5.43194 2.69914C6.05694 2.64881 6.86528 2.64881 8.05555 2.64881V0C6.91111 0 5.97083 1.95844e-07 5.20555 0.058274C4.425 0.119197 3.70694 0.250312 3.03333 0.57744L4.29444 2.93753ZM3.08055 4.09506C3.34687 3.59667 3.77179 3.19147 4.29444 2.93753L3.03333 0.57744C1.98803 1.08533 1.13818 1.89573 0.605556 2.8925L3.08055 4.09506ZM7.51944 18.5417V15.8928C6.78279 15.893 6.07637 16.1722 5.55555 16.6689L7.51944 18.5417Z" fill={color} />
      <SvgPath d="M7.66699 6.6665H18.3337M7.66699 11.9998H14.3337" stroke={color} strokeWidth={1.98} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
  // 디자인 시안(iPhone 17 - 63) 화이트 아웃라인 아이콘 — 조회(👀)·공유(종이비행기)
  const EyesSvg = ({ size = 20, color = '#FFFFFF' }: { size?: number; color?: string }) => (
    <Svg width={size * 1.5} height={size} viewBox="0 0 36 24" fill="none">
      <SvgEllipse cx={10} cy={12} rx={7.5} ry={9.5} stroke={color} strokeWidth={2.4} />
      <SvgEllipse cx={26} cy={12} rx={7.5} ry={9.5} stroke={color} strokeWidth={2.4} />
      <SvgCircle cx={11.5} cy={14.5} r={3} fill={color} />
      <SvgCircle cx={27.5} cy={14.5} r={3} fill={color} />
    </Svg>
  );
  // 시안(akar-icons_paper-airplane.svg): 종이비행기 아웃라인 — 스냅 스토리 전용 공유 아이콘
  const SendPlaneSvg = ({ size = 22, color = '#FFFFFF' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <SvgPath d="M11.0531 18.6664L21.7643 22.4978C21.9442 22.5625 22.1364 22.5861 22.3266 22.567C22.5169 22.5479 22.7005 22.4865 22.864 22.3873C23.0275 22.2881 23.1667 22.1536 23.2716 21.9937C23.3764 21.8338 23.4442 21.6524 23.4699 21.4629L25.6551 4.94528C25.7881 3.93962 24.7463 3.18945 23.8269 3.62695L3.06145 13.5389C2.03478 14.0289 2.11178 15.5106 3.18511 15.8921L6.03178 16.9048L7.58345 17.4496M15.1668 20.1364L12.8451 24.0168C12.0868 24.9595 10.5596 24.4263 10.5596 23.2199V20.1131C10.5597 19.5268 10.7804 18.962 11.1779 18.5311L20.5624 9.62473" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );

  return (
    <View style={storyS.container}>
      <GestureDetector gesture={dismissGesture}>
        <Reanimated.View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, dismissStyle]}>
          <Reanimated.ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            contentOffset={{ x: initPos.si * SCREEN_W, y: 0 }}
            style={StyleSheet.absoluteFill}
          >
            {stories.map((story: any, si: number) => (
              <SnapCubePage key={story.key} index={si} scrollX={scrollX} width={SCREEN_W} leftCube={si > 0} rightCube={si < stories.length - 1}>
                {renderStoryPage(story, si)}
              </SnapCubePage>
            ))}
          </Reanimated.ScrollView>
        </Reanimated.View>
      </GestureDetector>

      {/* 인라인 메시지 입력 */}
      {replyBarOpen && (
        <>
          <Pressable style={storyS.inlineOverlay} onPress={() => { setReplyBarOpen(false); setCommentText(''); }} />
          <KeyboardAvoidingView style={storyS.inlineInputWrap} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
            {/* 이 입력줄은 autoFocus로 항상 키보드와 함께 떠서(닫히면 blur로 사라짐)
                키보드가 내비바를 덮음 — 안드로이드 인셋 가산 불필요, 고정 여백만 */}
            <View style={[storyS.inlineInputRow, { paddingBottom: Platform.OS === 'ios' ? 34 : 14 }]}>
              <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                ref={replyInputRef}
                style={storyS.inlineInput}
                placeholder={t('postDetail.sendMessagePlaceholder')}
                placeholderTextColor="rgba(255,255,255,0.45)"
                value={commentText}
                onChangeText={setCommentText}
                onSubmitEditing={() => { addComment(); setReplyBarOpen(false); }}
                returnKeyType="send"
                autoFocus
                onBlur={() => { if (!commentText.trim()) setReplyBarOpen(false); }}
              />
              <TouchableOpacity
                style={[storyS.inlineSendBtn, { backgroundColor: skinAccent.accent }, !commentText.trim() && { opacity: 0.35 }]}
                onPress={() => { addComment(); setReplyBarOpen(false); }}
                disabled={!commentText.trim()}
              >
                <Text style={storyS.inlineSendText}>{t('postDetail.send')}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </>
      )}

      {/* 댓글 바텀시트 오버레이 */}
      {commentSheetOpen && (
        <Animated.View style={[storyS.sheetOverlay, { opacity: commentOverlayAnim }]} pointerEvents="auto">
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeCommentSheet} activeOpacity={1} />
        </Animated.View>
      )}

      {/* 댓글 바텀시트 — 키보드 높이만큼 시트 전체를 위로 들어올린다(입력창이 키보드에 안 가리게) */}
      <Animated.View style={[storyS.commentSheet, { transform: [{ translateY: Animated.subtract(commentSheetAnim, keyboardLift) }] }]} pointerEvents={commentSheetOpen ? 'auto' : 'none'}>
        <View style={storyS.csHandleArea} {...commentSheetPan.panHandlers}>
          <View style={storyS.csHandle} />
        </View>
        <View style={storyS.csTitleRow}>
          <Text style={storyS.csTitle}>{t('social.comments')}</Text>
          <Text style={storyS.csCount}>{totalComments}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            {comments.map((c: any) => (
              <View key={c.id}>
                <View style={storyS.csCommentItem}>
                  <View style={storyS.csAvatar}><AuthorAvatar photo={c.photo} emoji={c.emoji} size={32} emojiSize={15} /></View>
                  <View style={{ flex: 1 }}>
                    <View style={storyS.csTopRow}><Text style={storyS.csName}>{c.name}</Text><Text style={storyS.csTime}>{commentTime(c)}</Text></View>
                    <Text style={storyS.csText}>{c.text}</Text>
                    <TouchableOpacity onPress={() => handleReply(c.id, c.name)}><Text style={storyS.csReplyBtn}>{t('postDetail.reply')}</Text></TouchableOpacity>
                  </View>
                </View>
                {c.replies && c.replies.map((r: any) => (
                  <View key={r.id} style={[storyS.csCommentItem, { marginLeft: 42 }]}>
                    <View style={storyS.csAvatar}><AuthorAvatar photo={r.photo} emoji={r.emoji} size={32} emojiSize={13} /></View>
                    <View style={{ flex: 1 }}>
                      <View style={storyS.csTopRow}><Text style={storyS.csName}>{r.name}</Text><Text style={storyS.csTime}>{commentTime(r)}</Text></View>
                      <Text style={storyS.csText}>{r.text}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}
            {comments.length === 0 && <Text style={{ color: '#5A5A6E', fontSize: 14, textAlign: 'center', marginTop: 32 }}>{t('postDetail.noComments')}</Text>}
          </ScrollView>
          {replyTo && (
            <View style={storyS.csReplyBar}>
              <Text style={[storyS.csReplyBarText, { color: skinAccent.accent }]}>{t('postDetail.replyingTo', { name: replyTo.name })}</Text>
              <TouchableOpacity onPress={cancelReply}><Text style={storyS.csReplyBarCancel}>✕</Text></TouchableOpacity>
            </View>
          )}
          <View style={storyS.csInputBar}>
            <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC" ref={commentInputRef} style={storyS.csInput} placeholder={replyTo ? t('postDetail.replyToPlaceholder', { name: replyTo.name }) : t('postDetail.commentPlaceholder')} placeholderTextColor="#5A5A6E" value={commentText} onChangeText={setCommentText} onSubmitEditing={addComment} returnKeyType="send" maxLength={500} />
            <TouchableOpacity style={[storyS.csSendBtn, { backgroundColor: skinAccent.accent }, !commentText.trim() && { backgroundColor: "#2A2A3A" }]} onPress={addComment} disabled={!commentText.trim()}>
              <Text style={[storyS.csSendText, !commentText.trim() && { color: '#5A5A6E' }]}>{t('postDetail.send')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {/* 메뉴 모달 */}
      <Modal visible={menuVisible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={[s.menuOverlay, { paddingRight: 20 + stageGutter }]} activeOpacity={1} onPress={() => setMenuVisible(false)} accessibilityViewIsModal>
          <View style={s.menuCard}>
            <TouchableOpacity style={s.menuItem} onPress={handleCopyLink} activeOpacity={0.7}>
              <LinkIcon size={16} color="#fff" /><Text style={s.menuItemText}>{t('social.copyLink')}</Text>
            </TouchableOpacity>
            {isMyPost ? (
              <><View style={s.menuDivider} />
              <TouchableOpacity style={s.menuItem} onPress={handleArchive} activeOpacity={0.7}>
                <ArchiveIcon size={16} color="#fff" /><Text style={s.menuItemText}>{t('postDetail.archiveAction')}</Text>
              </TouchableOpacity>
              <View style={s.menuSectionDivider} />
              <TouchableOpacity style={s.menuItem} onPress={handleDelete} activeOpacity={0.7}>
                <TrashIcon size={16} color="#FF3B30" /><Text style={[s.menuItemText, { color: '#FF3B30' }]}>{t('postDetail.deleteAction')}</Text>
              </TouchableOpacity></>
            ) : (
              <><View style={s.menuSectionDivider} />
              <TouchableOpacity style={s.menuItem} onPress={() => { setMenuVisible(false); setReportVisible(true); }} activeOpacity={0.7}>
                <MegaphoneIcon size={16} color="#FF3B30" /><Text style={[s.menuItemText, { color: '#FF3B30' }]}>{t('social.reportLong')}</Text>
              </TouchableOpacity></>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 공유 시트 — 메이트 DM으로 보내기(대화량 많은 순) + 외부 공유 */}
      <Modal visible={shareSheetOpen} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setShareSheetOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} accessibilityViewIsModal>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShareSheetOpen(false)} />
          <View style={shareS.sheet}>
            <View style={shareS.handle} />
            <Text style={shareS.title}>{t('social.friendPickerTitle')}</Text>
            <ScrollView style={{ maxHeight: 320, flexShrink: 1 }}>
              {shareFriends.map((f) => (
                <TouchableOpacity key={f.handle} style={shareS.friendRow} activeOpacity={0.7} onPress={() => handleSendToFriend(f)}>
                  <View style={shareS.friendAvatar}><Text style={{ fontSize: 18 }}>{f.emoji}</Text></View>
                  <Text style={shareS.friendName}>{f.name}</Text>
                  <Text style={[shareS.friendSend, { color: skinAccent.accent }]}>{t('postDetail.send')}</Text>
                </TouchableOpacity>
              ))}
              {shareFriends.length === 0 && (
                <Text style={shareS.empty}>{t('postDetail.shareNoFriends')}</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={shareS.externalBtn} activeOpacity={0.8} onPress={handleShareExternal}>
              <ShareIcon size={16} color="#FFFFFF" />
              <Text style={shareS.externalTxt}>{t('postDetail.shareExternal')}</Text>
            </TouchableOpacity>
            <View style={{ height: 24 }} />
          </View>
        </View>
      </Modal>

      <ReportModal visible={reportVisible} onClose={() => setReportVisible(false)} onSubmit={(reason) => { setReportVisible(false); reportPost(currentSnap.id, reason); setToastMsg(t('social.reportReceivedToast')); setTimeout(() => setToastMsg(''), 2000); }} />
      {toastMsg !== '' && <View style={s.toast} pointerEvents="none"><Text style={s.toastText}>{toastMsg}</Text></View>}
      <SnapViewerModal
        visible={viewerListOpen}
        onClose={() => setViewerListOpen(false)}
        viewers={(currentSnap.snapViewers ?? []).map((v: { handle: string; name: string; time: number }) => ({
          name: v.name,
          handle: v.handle,
          time: timeAgo(v.time),
          emoji: '👤',
        }))}
      />
    </View>
  );
}

type RouteParams = {
  PostDetail: { postId: string; record?: TravelRecord };
};

export default function PostDetailScreen() {
  const { blogS, s } = useSheets();
  const { t, i18n } = useTranslation();
  // 네컷 미리보기 크기 계산용 — 폭은 Stage(클램프), 높이는 실제 창.
  const SCREEN_W = useStageWidth();
  // ⋯ 메뉴는 Modal(루트 클램프 밖) 안에서 오른쪽 끝에 붙는다 — 레터박스만큼 안쪽으로
  const stageGutter = useStageGutter();
  const { height: SCREEN_H } = useWindowDimensions();
  const skinAccent = useSkinAccent(); // 카테고리 배지·메모 박스 등 강조를 스킨색으로
  const insets = useSafeAreaInsets();
  // 키보드가 떠 있는 동안엔 내비바 인셋 하단 패딩이 무의미(키보드가 내비바를 덮음) — 잔여 여백 방지
  const [kbVisible, setKbVisible] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s1 = Keyboard.addListener(showEvt, () => setKbVisible(true));
    const s2 = Keyboard.addListener(hideEvt, () => setKbVisible(false));
    return () => { s1.remove(); s2.remove(); };
  }, []);
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'PostDetail'>>();
  const { postId } = route.params;
  const { records, feedPosts, toggleLike, deleteRecord, archiveRecord, unarchiveRecord, updateRecord, markSnapViewed, commentsByPost, addComment: addCommentToStore, toggleCommentLike, deleteComment, neighbors, requestNeighbor, cancelNeighborRequest, removeNeighbor, isNeighbor, isNeighborRequested, currentViewer, refreshComments, reportPost, isBlocked, archivedIds, reportedPostIds, blockUser, reportedCommentIds, reportComment } = useRecords();
  // 스냅 스토리 뷰어 소스 — 소셜 탭 스토리 링과 동일한 필터(공개범위·차단·보관·신고·뷰어 숨김) 적용.
  // 무필터로 넘기면 차단/신고한 사용자의 스냅이 스와이프로 그대로 재생된다.
  const { handle: globalHandle, profilePhoto: globalProfilePhoto, handleFont: myHandleFont, isPremium: myPremium } = useSettings();
  // 내 글은 미리보기 뷰어(currentViewer), 타인 글은 '나'(내 핸들)를 뷰어로 —
  // 서버 data에 전체 사진이 내려오므로 안 거르면 작성자가 나에게 숨긴 사진이 보인다.
  const viewerFor = (r: TravelRecord) =>
    r.isMyPost || r.user?.handle === globalHandle ? currentViewer : (globalHandle || null);
  const snapViewerRecords = useMemo(
    () =>
      [...records, ...feedPosts]
        .filter(
          (r) =>
            r.visibility === 'neighbors' &&
            !isBlocked(r.user) &&
            !archivedIds.includes(r.id) &&
            !reportedPostIds.includes(r.id)
        )
        .filter((r) => !isPostHiddenForViewer(r, viewerFor(r)))
        .map((r) => applyViewer(r, viewerFor(r))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [records, feedPosts, archivedIds, reportedPostIds, currentViewer, isBlocked, globalHandle]
  );

  // 수정 3: 차단된 사용자의 댓글·답글 필터 (PostComment에 handle 없으므로 name으로 매칭)
  const rawComments = commentsByPost[postId] ?? [];
  // 차단한 사용자 + 신고한 댓글은 즉시 사라져야 한다(App Store 1.2 UGC 요건).
  const comments = rawComments
    .filter((c) => !isBlocked({ name: c.name }) && !reportedCommentIds.includes(c.id))
    .map((c) => ({
      ...c,
      replies: c.replies
        ? c.replies.filter((r) => !isBlocked({ name: r.name }) && !reportedCommentIds.includes(r.id))
        : c.replies,
    }));
  // 신고할 댓글 id (모달 대상) — 게시물 신고와 모달은 같고 대상만 다르다
  const [commentReportId, setCommentReportId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [showCompanions, setShowCompanions] = useState(false);
  // null = 자동: 채워진 항목이 2개 이하면 접을 이유가 없어 펼쳐서 시작, 3개 이상이면 접힘
  const [travelInfoPref, setTravelInfoPref] = useState<boolean | null>(null);
  const [heartBurst, setHeartBurst] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [fontScale, setFontScale] = useState(1);
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [likersVisible, setLikersVisible] = useState(false);
  const [likers, setLikers] = useState<PostLiker[]>([]);
  const [likersLoading, setLikersLoading] = useState(false);
  const [fullImgVisible, setFullImgVisible] = useState(false);
  const [fullImgList, setFullImgList] = useState<string[]>([]);
  const [fullImgIndex, setFullImgIndex] = useState(0);
  const openFullImage = (uris: string[], index: number) => {
    setFullImgList(uris);
    setFullImgIndex(index);
    setFullImgVisible(true);
  };
  const commentInputRef = useRef<TextInput>(null);
  const sendingCommentRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const blockYPositions = useRef<Record<string, number>>({});
  // 더블탭 좋아요
  const heartScale = useRef(new Animated.Value(0)).current;
  const lastTapRef = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 언마운트 시 더블탭 단일탭 타이머 정리 (unmounted setState 방지)
  useEffect(() => () => { if (singleTapTimer.current) clearTimeout(singleTapTimer.current); }, []);

  // 스토어에 없는 글(타인 프로필에서 조회한 공개 글)은 라우트로 넘어온 record 폴백 사용.
  // 폴백은 로컬 상태로 들고 좋아요를 직접 반영/서버 동기화한다 (store toggleLike는 스토어 글만 처리).
  const [fallbackRecord, setFallbackRecord] = useState<TravelRecord | null>(route.params.record ?? null);
  const storeRecord = records.find((r) => r.id === postId) ?? feedPosts.find((r) => r.id === postId);
  const rawRecord = storeRecord ?? fallbackRecord ?? undefined;
  const handleToggleLike = () => {
    // 예시 콘텐츠는 서버 호출 금지
    if (rawRecord?.isExample) return;
    if (storeRecord) {
      toggleLike(postId);
      return;
    }
    if (!fallbackRecord) return;
    const nowLiked = !fallbackRecord.liked;
    setFallbackRecord({
      ...fallbackRecord,
      liked: nowLiked,
      likes: nowLiked ? fallbackRecord.likes + 1 : Math.max(0, fallbackRecord.likes - 1),
    });
    const remoteId = fallbackRecord.remoteId ?? fallbackRecord.id;
    if (remoteId) {
      (nowLiked ? likePost(remoteId) : unlikePost(remoteId)).catch(() => {
        // 서버 실패 → 낙관 반영 롤백
        setFallbackRecord((p) =>
          p ? { ...p, liked: !nowLiked, likes: nowLiked ? Math.max(0, p.likes - 1) : p.likes + 1 } : p
        );
      });
    }
  };
  // 백엔드 게시물이면 댓글을 서버에서 불러온다 (로컬 글은 remoteId 없음 → 무동작)
  // 예시 콘텐츠(isExample)는 서버 글이 아니므로 조회 생략
  useEffect(() => {
    if (!rawRecord?.remoteId || rawRecord?.isExample) return;
    setCommentsLoading(true);
    refreshComments(postId, rawRecord.remoteId).finally(() => setCommentsLoading(false));
    // postId/remoteId가 바뀔 때만 댓글 재조회 (refreshComments는 스토어 액션)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, rawRecord?.remoteId]);
  // 뷰어 시점에서 비공개 사진을 제거한 사본 — 내 글은 미리보기 뷰어, 타인 글은 나
  const record = rawRecord ? applyViewer(rawRecord, viewerFor(rawRecord)) : rawRecord;

  // ⚠️ 훅은 아래 if (!record) early return보다 먼저 선언해야 한다 (rules-of-hooks)

  // 스냅 뷰어에 '전체 목록'을 넘길지 '이 글 하나'만 넘길지 — 진입 시 한 번만 확정한다.
  // (initPosRef의 "위치는 한 번만 확정" 철학과 동일)
  // 매 렌더 재평가하면, 뷰어 안에서 신고(reportPost)한 순간 그 글이 snapViewerRecords에서
  // 빠지면서 판정이 '전체 목록'→'단독'으로 뒤집혀 방금 신고한 글만 남은 스토리에 갇힌다.
  // 고정해 두면 신고 후에도 전체 목록을 유지해, 신고한 글만 목록에서 빠지고 인접 스토리로 넘어간다.
  // rawRecord가 잡히기 전(피드 로딩 중)에는 판정하지 않는다 — 성급히 '단독'으로 굳지 않게.
  const snapFallbackRef = useRef<boolean | null>(null);
  if (snapFallbackRef.current === null && rawRecord) {
    snapFallbackRef.current = !snapViewerRecords.some((r) => r.id === postId);
  }

  // 스트립 풀스크린 목록 — 내 글이면 합성본 뒤에 슬롯 원본(낱장)을 붙여 확대해 볼 수 있게.
  // 타인 글의 슬롯 원본 URI는 작성자 기기의 로컬 경로라 열리지 않으므로 합성본만 보여준다.
  const cutViewerUris = useMemo(() => {
    const p = record?.cutPhoto;
    if (!p?.previewUri) return [] as string[];
    const mine = record?.isMyPost === true || record?.user.handle === globalHandle;
    return mine && p.photos && p.photos.length > 0 ? [p.previewUri, ...p.photos] : [p.previewUri];
  }, [record, globalHandle]);

  // 좋아요 버튼 스프링 — 탭 반응이 없으면 눌렸는지 애매하다
  const likeScale = useRef(new Animated.Value(1)).current;
  const springLike = () => {
    likeScale.setValue(0.75);
    Animated.spring(likeScale, { toValue: 1, friction: 3.5, tension: 220, useNativeDriver: true }).start();
  };

  // 진입 스태거 — 유저행→미디어→정보 순서로 살짝 튀며 등장(프리미엄 화면과 동일 재료)
  const entUser = useEntranceAnimation(0);
  const entMedia = useEntranceAnimation(70);
  const entInfo = useEntranceAnimation(140);
  // 스크롤 시작 후에만 헤더 구분선 표시 — 맨 위에서는 콘텐츠와 한 면처럼 떠 있게
  const [scrolled, setScrolled] = useState(false);

  if (!record) {
    return (
      <View style={s.container}>
        <View style={[s.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} accessibilityRole="button" accessibilityLabel={t('postDetail.back')}>
            <Text style={s.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>{t('postDetail.postTitle')}</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={s.emptyWrap}>
          <Text style={s.emptyText}>{t('postDetail.postNotFound')}</Text>
        </View>
      </View>
    );
  }

  const viewType: RecordViewType = record.viewType || 'feed';
  // 헤더 타이틀: 국가명 우선, 없으면 형식 라벨
  const typeLabel =
    viewType === 'blog' ? t('postDetail.typeBlog') :
    viewType === 'album' ? t('postDetail.typeAlbum') :
    viewType === 'cut' ? t('postDetail.typeCut') :
    viewType === 'snap' ? t('postDetail.typeSnap') : t('postDetail.typeFeed');
  const headerTitleText = record.countryName
    ? `${record.countryFlag ? record.countryFlag + ' ' : ''}${countryLabel(record.countryName, i18n.language)}`
    : typeLabel;
  // 여행정보 펼침 여부 — 사용자가 토글했으면 그 값, 아니면 항목 수 기준 자동
  const travelInfoCount = [record.startDate, record.weather, record.flightType, record.budget].filter(Boolean).length;
  const travelInfoOpen = travelInfoPref ?? travelInfoCount <= 2;
  // ── 티켓풍 메타 블록을 그릴지 ──
  // 피드·스트립에서만 쓴다. 앨범은 게시물이 아니라 사진 모음이고, 블로그는 본문 블록이
  // 주인공이라 기존 배치(여행정보 토글 + 칩)를 그대로 둔다.
  // 조건은 TravelTicket 내부의 "하나도 없으면 안 그린다" 판정과 같은 필드 집합이다 —
  // 여기서 true인데 티켓이 비면 국가·시각·별점이 어디에도 안 남는다.
  const ticketOn =
    (viewType === 'feed' || viewType === 'cut') &&
    !!(
      record.countries?.length ||
      record.country ||
      record.countryName ||
      record.startDate ||
      normalizeWeather(record.weather) ||
      record.flightType ||
      // amount > 0 조건은 TravelTicket의 budget 셀과 반드시 같아야 한다 —
      // 여기만 넓으면 '0원 예산'뿐인 게시물이 티켓을 켜 놓고 티켓은 빈 채로 null을 반환해,
      // 아래 !ticketOn 가드에 가려진 작성시각·국가가 어디에도 안 남는다.
      (record.budget != null && record.budget.amount > 0) ||
      record.companions?.length ||
      (record.rating != null && record.rating > 0)
    );
  // 본문 텍스트(피드·앨범) — 일정 길이 이상이면 "더보기"로 접기
  // 피드에서 photoTexts가 있으면 memo는 대표 글 복사본이라 캐러셀에서 표시됨 → bodyText 숨김
  const bodyText = (viewType === 'feed' && record.photoTexts && record.photoTexts.length > 0)
    ? ''
    : (record.memo || record.content || '');
  const bodyLong = bodyText.trim().length > 150;

  const addComment = () => {
    // 연타 가드 — 위 스토리 댓글과 같은 이유(서버 멱등키 없음)
    if (sendingCommentRef.current || !commentText.trim()) return;
    sendingCommentRef.current = true;
    setTimeout(() => { sendingCommentRef.current = false; }, 800);
    // remoteId 오버라이드 — 스토어에 없는 폴백 글(타인 프로필)도 댓글이 서버에 저장되게
    addCommentToStore(postId, commentText.trim(), replyTo?.id, record.remoteId ?? undefined);
    setReplyTo(null);
    setCommentText('');
    // 새 댓글이 렌더된 뒤 맨 아래로 스크롤
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
  };

  const handleReply = (id: string, name: string) => {
    setReplyTo({ id, name });
    commentInputRef.current?.focus();
  };

  const cancelReply = () => {
    setReplyTo(null);
  };

  const canShowLikers = !!rawRecord?.remoteId && record.likes > 0;
  const openLikers = async () => {
    if (!canShowLikers) return;
    setLikersVisible(true);
    setLikersLoading(true);
    const list = await fetchPostLikers(rawRecord!.remoteId!);
    setLikers(list);
    setLikersLoading(false);
  };

  const confirmDeleteComment = (commentId: string) => {
    Alert.alert(t('postDetail.deleteCommentTitle'), t('postDetail.deleteCommentMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('postDetail.delete'), style: 'destructive', onPress: () => deleteComment(postId, commentId) },
    ]);
  };

  const totalComments = comments.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0);
  const isMyPost = record?.isMyPost === true;
  // 보관된 게시물이면 상세 ⋯ 메뉴를 '보관 해제 / 삭제'만 노출한다
  const isArchived = !!record?.id && archivedIds.includes(record.id);

  // 링크에는 서버 id(remoteId)를 우선 사용 — 로컬 id는 받은 쪽 기기에서 조회 불가
  const shareId = record?.remoteId ?? postId;
  const handleCopyLink = async () => {
    setMenuVisible(false);
    await Clipboard.setStringAsync(postLink(shareId));
    setToastMsg(t('social.linkCopiedToast'));
    setTimeout(() => setToastMsg(''), 2000);
  };

  const handleSharePost = () => {
    setMenuVisible(false);
    // 메뉴 모달이 닫히는 동안 공유 시트를 띄우면 표시할 화면이 없어 무동작 → 모달 닫힘 후 호출
    setTimeout(() => {
      Share.share({ message: t('comp2.sharePostMsg', { link: postLink(shareId) }) }).catch(() => {});
    }, 350);
  };

  const handleExportToNaver = () => {
    setMenuVisible(false);
    const bodyText = record.blogBlocks ? blocksToPlainText(record.blogBlocks) : record.content;
    const photos = record.blogBlocks ? blocksToPhotos(record.blogBlocks) : (record.medias || []);
    const blogData: BlogData = {
      title: record.content.trim() || `${record.countryFlag ?? ''} ${record.countryName ?? ''}`.trim() || t('postDetail.travelRecord'),
      body: bodyText,
      photos,
      memo: record.memo,
      startDate: record.startDate,
      endDate: record.endDate,
      rating: record.rating,
      companions: record.companions,
      weather: record.weather,
      keywords: record.keywords,
      countryName: record.countryName,
      countryFlag: record.countryFlag,
    };
    const html = toNaverHtml(blogData);
    Alert.alert(t('postDetail.naverExportTitle'), t('postDetail.naverExportMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('postDetail.htmlCopy'),
        onPress: async () => {
          await Clipboard.setStringAsync(html);
          setToastMsg(t('postDetail.htmlCopied'));
          setTimeout(() => setToastMsg(''), 2000);
        },
      },
      {
        text: t('postDetail.textShare'),
        onPress: () => {
          const lines: string[] = [];
          if (record.countryFlag && record.countryName) lines.push(`📍 ${record.countryFlag} ${record.countryName}`);
          if (record.startDate && record.endDate) lines.push(`📅 ${record.startDate} ~ ${record.endDate}`);
          if (bodyText) lines.push('', bodyText);
          if (record.keywords?.length) lines.push('', record.keywords.map((k) => `#${k}`).join(' '));
          lines.push('', t('postDetail.shareFooter'));
          Share.share({ message: lines.join('\n') });
        },
      },
    ]);
  };

  const handleArchive = () => {
    setMenuVisible(false);
    Alert.alert(
      t('social.archiveConfirmTitle'),
      t('social.archiveConfirmMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('postDetail.archiveAction'),
          onPress: () => {
            archiveRecord(record.id);
            setToastMsg(t('social.archivedToast'));
            setTimeout(() => { setToastMsg(''); navigation.goBack(); }, 1000);
          },
        },
      ]
    );
  };

  // 보관 해제 — 보관된 게시물 상세 메뉴에서. 해제 후 목록(보관함)으로 돌아간다.
  const handleUnarchive = () => {
    setMenuVisible(false);
    unarchiveRecord(record.id);
    setToastMsg(t('misc.unarchivedToast'));
    setTimeout(() => { setToastMsg(''); navigation.goBack(); }, 1000);
  };

  // 내 게시물 공개범위 토글 (이웃 공개 ↔ 비공개). updateRecord가 로컬·영속·백엔드 동기화까지 처리.
  const handleToggleVisibility = () => {
    setMenuVisible(false);
    const next = record.visibility === 'private' ? 'neighbors' : 'private';
    updateRecord(record.id, { visibility: next });
    setToastMsg(t(next === 'private' ? 'social.madePrivateToast' : 'social.madePublicToast'));
    setTimeout(() => setToastMsg(''), 2000);
  };

  const handleDelete = () => {
    setMenuVisible(false);
    Alert.alert(t('postDetail.deletePostTitle'), t('postDetail.deletePostMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('postDetail.delete'), style: 'destructive',
        onPress: () => {
          deleteRecord(record.id);
          navigation.goBack();
        },
      },
    ]);
  };

  const handleReport = () => {
    setMenuVisible(false);
    setReportVisible(true);
  };

  // 수정 6: 타인 게시물 차단 — SocialScreen과 동일한 UX (confirmBlock Alert + blockedToast + goBack)
  const handleBlockAuthor = () => {
    setMenuVisible(false);
    const authorUser = {
      name: record.user.name,
      emoji: record.user.emoji ?? '🧳',
      handle: record.user.handle,
      id: typeof record.authorId === 'string' ? record.authorId : undefined,
    };
    confirmBlock(authorUser.handle ?? authorUser.name, () => {
      blockUser(authorUser);
      setToastMsg(t('social.blockedToast'));
      setTimeout(() => { setToastMsg(''); navigation.goBack(); }, 1200);
    }, t);
  };

  // 더블탭: 좋아요(이미 좋아요면 유지) + 하트 버스트 애니메이션
  // 예시 콘텐츠는 좋아요 비활성
  const triggerLikeBurst = () => {
    if (record.isExample) return;
    if (!record.liked) handleToggleLike();
    buzz('light');
    setHeartBurst(true);
    heartScale.setValue(0);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 80 }),
      Animated.timing(heartScale, { toValue: 0, duration: 250, delay: 450, useNativeDriver: true }),
    ]).start(() => setHeartBurst(false));
  };
  // 단일 탭(풀스크린)과 더블 탭(좋아요) 구분
  const handleMediaTap = (onSingle: () => void) => {
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      if (singleTapTimer.current) { clearTimeout(singleTapTimer.current); singleTapTimer.current = null; }
      lastTapRef.current = 0;
      triggerLikeBurst();
    } else {
      lastTapRef.current = now;
      singleTapTimer.current = setTimeout(() => { onSingle(); singleTapTimer.current = null; }, 280);
    }
  };

  const renderCountries = () => {
    if (!record.countries || record.countries.length === 0) {
      return record.country ? (
        <View style={[s.countryTag, { backgroundColor: skinAccent.tint(0.12) }]}>
          <Text style={[s.countryTagText, { color: skinAccent.accent }]} {...andFitText}>{countryTagLabel(record.country, i18n.language)}</Text>
        </View>
      ) : null;
    }
    if (record.countries.length <= 3) {
      return record.countries.map((c, i) => (
        <View key={i} style={[s.countryTag, { backgroundColor: skinAccent.tint(0.12) }]}>
          <Text style={[s.countryTagText, { color: skinAccent.accent }]} {...andFitText}>{c.flag} {countryLabel(c.name, i18n.language)}</Text>
        </View>
      ));
    }
    return (
      <>
        <View style={[s.countryTag, { backgroundColor: skinAccent.tint(0.12) }]}>
          <Text style={[s.countryTagText, { color: skinAccent.accent }]} {...andFitText}>{record.countries[0].flag} {countryLabel(record.countries[0].name, i18n.language)}</Text>
        </View>
        <View style={[s.countryTag, { backgroundColor: skinAccent.tint(0.12) }]}>
          <Text style={[s.countryTagText, { color: skinAccent.accent }]} {...andFitText}>+{record.countries.length - 1}</Text>
        </View>
      </>
    );
  };

  const CommentSvg = ({ size = 20, color = C.dim }: { size?: number; color?: string }) => (
    <CommentSvgIcon size={size} color={color} />
  );

  // ── 스냅: 인스타 스토리 스타일 전체화면 ──
  if (viewType === 'snap') {
    // 스냅 뷰어는 소셜 탭 스토리 링과 같은 필터 목록(snapViewerRecords)에서 스토리를 만든다.
    // 다만 열려는 스냅이 그 목록에 '없는' 경우가 있다 —
    //   · 예시 스냅(isExample): 스토어에 저장되지 않는 로컬 상수
    //   · 보관한 스냅(보관함 탭): archivedIds로 목록에서 걸러진다
    //   · 메이트 프로필→여행 상세(게스트)에서 route.params.record로 넘어온 스냅: 스토어에 없다
    // 이때 목록만 넘기면 뷰어가 대상을 못 찾아 엉뚱한 스토리(첫 번째)가 재생되거나,
    // 목록이 비면 열리자마자 닫혔다. 그런 경우 이 글 하나만 단독 스토리로 재생한다.
    // (rawRecord가 아니라 뷰어 필터를 거친 record — 작성자가 나에게 숨긴 사진이 새지 않게)
    // 판정은 snapFallbackRef가 진입 시 한 번만 내린다 — 뷰어 안에서 신고/보관해도
    // 목록이 갑자기 '단독 스토리'로 붕괴하지 않게(위 snapFallbackRef 주석 참조).
    const snapRecords = snapFallbackRef.current ? [record] : snapViewerRecords;
    return (
      <SnapStoryViewer
        initialPostId={postId}
        // 메이트 스냅은 feedPosts에 있다 — records만 넘기면 메이트 스냅을 열 때 내 스토리가
        // 재생되거나(내 스냅 존재 시) 뷰어가 열리자마자 닫힌다. 소셜 탭 스토리 링과 동일 소스+동일 필터.
        records={snapRecords}
        navigation={navigation}
        toggleLike={toggleLike}
        deleteRecord={deleteRecord}
        archiveRecord={archiveRecord}
        markSnapViewed={markSnapViewed}
      />
    );
  }

  // 사진/네컷/placeholder 위에 공통으로 올리는 동행자 오버레이
  const companionsOverlay = record.companions && record.companions.length > 0 ? (
    <>
      <TouchableOpacity
        style={s.tagBtn}
        activeOpacity={0.8}
        onPress={() => setShowCompanions(!showCompanions)}
      >
        <PersonIcon size={14} color="#fff" />
      </TouchableOpacity>
      {showCompanions && (
        <View style={s.companionPopup}>
          {record.companions.map((comp, i) => (
            <View key={i} style={s.companionPopupItem}>
              <View style={s.companionIconWrap}>{companionIcon(comp)}</View>
              <Text style={s.companionPopupText}>{comp}</Text>
            </View>
          ))}
        </View>
      )}
    </>
  ) : null;

  // ── 스트립(cut) '책상 위 인화지' 연출 재료 ──
  // 데코 테이프 2종 랜덤 — id 해시라 게시물마다 고정(리렌더에도 안 바뀜).
  // SocialScreen 폴라로이드 카드와 동일한 기법·동일한 해시식.
  const tapeVariant = (Math.abs(
    String(record.id).split('').reduce((acc: number, ch: string) => ((acc * 31 + ch.charCodeAt(0)) | 0), 7)
  ) % 2) as 0 | 1;
  // 인화지에 손으로 적은 메모 같은 한 줄 캡션(세리프).
  // 제목(content)이 본문으로도 나오는 경우엔 같은 글을 두 번 읽히므로 국가·날짜로 대체한다.
  const cutTitle = (record.content || '').trim();
  const cutCaption =
    cutTitle && cutTitle !== bodyText.trim()
      ? cutTitle
      : [
          record.countryName
            ? `${record.countryFlag ? `${record.countryFlag} ` : ''}${countryLabel(record.countryName, i18n.language)}`
            : '',
          record.startDate || '',
        ]
          .filter(Boolean)
          .join('   ·   ');

  // 더블탭 좋아요 하트 버스트 (사진/네컷 위 오버레이)
  const heartOverlay = heartBurst ? (
    <Animated.View pointerEvents="none" style={[s.heartBurst, { transform: [{ scale: heartScale }] }]}>
      <Text style={s.heartBurstIcon}>♥</Text>
    </Animated.View>
  ) : null;

  return (
    <View style={s.container}>
      {/* 헤더 — 구분선은 스크롤을 시작한 뒤에만(맨 위에선 콘텐츠와 한 면처럼) */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: scrolled ? C.cardBorder : 'transparent' }]}>
          <View style={s.headerSide}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} accessibilityRole="button" accessibilityLabel={t('postDetail.back')}>
              <Text style={s.backIcon}>‹</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.headerTitle} numberOfLines={1}>{headerTitleText}</Text>
          <View style={[s.headerSide, { justifyContent: 'flex-end', gap: 8 }]}>
            {viewType === 'blog' && record.blogBlocks && record.blogBlocks.length > 0 && (
              <TouchableOpacity
                onPress={() => setFontScale((p) => (p >= 1.4 ? 0.85 : p + 0.15))}
                style={s.menuBtn}
                accessibilityRole="button"
                accessibilityLabel={t('postDetail.fontSizeA11y')}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: fontScale !== 1 ? skinAccent.accent : C.dim }} {...andFitText}>{t('blog.fontSizeBtn')}</Text>
              </TouchableOpacity>
            )}
            {!record.isExample && (
              <TouchableOpacity onPress={() => setMenuVisible(true)} style={s.menuBtn} accessibilityRole="button" accessibilityLabel={t('postDetail.menuA11y')}>
                <Text style={s.menuDots}>···</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => setShowCompanions(false)}
          onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 8)}
          scrollEventThrottle={32}
        >
              {/* ── 유저 정보 + 이미지 + 본문 ── */}
              {(() => {
                const isMyPost = record.isMyPost === true || record.user.handle === globalHandle;
                const postDisplayName = isMyPost
                  ? `@${globalHandle}`
                  : (record.user.name ? record.user.name : `@${record.user.handle}`);
                // 작성자 uuid — 메이트 관계 판정은 반드시 uuid 기준
                const authorId = typeof record.authorId === 'string' && record.authorId ? record.authorId : null;
                // 메이트 3상태: 메이트 / 신청됨 / 없음 — 스토어 판정 사용
                const neighborState: 'neighbor' | 'requested' | 'none' = authorId
                  ? (isNeighbor(authorId) ? 'neighbor' : isNeighborRequested(authorId) ? 'requested' : 'none')
                  : 'none';
                const neighborLabel =
                  neighborState === 'neighbor' ? t('friends.neighborActive')
                  : neighborState === 'requested' ? t('friends.neighborRequested')
                  : t('friends.neighborRequest');
                const neighborA11y =
                  neighborState === 'none' ? t('friends.neighborRequest') : t('friends.neighborActive');
                const onNeighborPress = () => {
                  if (!authorId) return;
                  buzz('light');
                  // 없음→신청, 신청됨→취소, 메이트→끊기
                  if (neighborState === 'neighbor') removeNeighbor(authorId);
                  else if (neighborState === 'requested') cancelNeighborRequest(authorId);
                  else requestNeighbor(authorId);
                };
                return (
                  <Animated.View style={[s.userRow, entUser]}>
                    <TouchableOpacity
                      style={s.authorTouch}
                      activeOpacity={record.isExample ? 1 : 0.7}
                      accessibilityRole="button"
                      accessibilityLabel={isMyPost ? t('postDetail.myProfileA11y') : t('postDetail.authorProfileA11y')}
                      onPress={() => {
                        if (record.isExample) return;
                        navigation.navigate('FriendProfile', isMyPost
                          ? { userId: record.authorId ?? record.id, username: globalHandle || record.user.name, handle: globalHandle }
                          : { userId: record.authorId ?? record.id, username: record.user.name, handle: record.user.handle });
                      }}
                    >
                      <View style={[s.avatar, record.isExample && { overflow: 'hidden' }]}>
                        {record.isExample ? (
                          <Image source={APP_LOGO} style={{ width: 42, height: 42 }} resizeMode="cover" />
                        ) : isMyPost && globalProfilePhoto ? (
                          <Image source={{ uri: globalProfilePhoto }} style={{ width: 42, height: 42, borderRadius: 21 }} />
                        ) : record.user.photo ? (
                          <Image source={{ uri: record.user.photo }} style={{ width: 42, height: 42, borderRadius: 21 }} />
                        ) : (
                          <PersonIcon size={24} color="#A0A0B0" />
                        )}
                      </View>
                      <View style={s.userInfo}>
                        {/* 아이디 폰트(프리미엄) — 내 글은 내 설정값, 타인 글은 서버 handle_font */}
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          {/* 예시 콘텐츠는 @핸들 대신 'eOrth 공식' 필 배지만 표시 (기능 소개 카드와 동일 룩) */}
                          {record.isExample ? (
                            <Text style={s.officialBadge}>{t('socialEmpty.official')}</Text>
                          ) : (
                            <Text style={[s.userName, handleFontStyle(isMyPost ? (myPremium ? myHandleFont : null) : record.user.font)]}>{postDisplayName}</Text>
                          )}
                        </View>
                        {/* 티켓이 그려지면 국가·작성시각은 그쪽으로 흡수된다(같은 값 두 번 노출 방지) */}
                        {!ticketOn && (
                          <View style={s.userMeta}>
                            {renderCountries()}
                            {!record.isExample && <Text style={s.dateMeta}>{timeAgo(record.timestamp)}</Text>}
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                    {!ticketOn && record.rating != null && record.rating > 0 && (
                      // 앱 공용 0.5 단위 별점 — 예전 '★'.repeat는 4.5점이 별 4개로 잘렸다
                      // (티켓이 있으면 RATING 칸으로 옮겨간다)
                      <RatingStars
                        score={record.rating}
                        size={13}
                        gap={2}
                        fullColor={skinAccent.accent}
                        emptyColor="rgba(255,255,255,0.18)"
                      />
                    )}
                    {!isMyPost && authorId && !record.isExample && (
                      <TouchableOpacity
                        style={[s.followBtn, { backgroundColor: skinAccent.accent }, neighborState !== 'none' && s.followingBtn]}
                        onPress={onNeighborPress}
                        accessibilityRole="button"
                        accessibilityLabel={neighborA11y}
                      >
                        <Text style={[s.followBtnText, neighborState !== 'none' && s.followingBtnText]}>
                          {neighborLabel}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </Animated.View>
                );
              })()}

              {/* ── 블로그 콘텐츠 ── (스냅은 viewType==='snap'에서 early return 처리) */}
              {viewType === 'blog' && record.blogBlocks && record.blogBlocks.length > 0 ? (
                <>
                  {/* 카테고리 뱃지 */}
                  {record.blogCategory && (
                    <View style={[blogS.categoryBadge, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.tint(0.25) }]}>
                      <Text style={[blogS.categoryBadgeText, { color: skinAccent.accent }]}>{record.blogCategory}</Text>
                    </View>
                  )}

                  {/* 목차 */}
                  <TableOfContents
                    headings={extractHeadings(record.blogBlocks)}
                    onPress={(id) => {
                      const y = blockYPositions.current[id];
                      if (y != null) {
                        scrollRef.current?.scrollTo({ y, animated: true });
                      }
                    }}
                  />

                  {/* 블록 렌더링 */}
                  {record.blogBlocks.map((block) =>
                    block.type === 'heading' ? (
                      <View
                        key={block.id}
                        onLayout={(e) => {
                          blockYPositions.current[block.id] = e.nativeEvent.layout.y;
                        }}
                      >
                        <BlogBlockRenderer block={block} fontScale={fontScale} onImagePress={openFullImage} />
                      </View>
                    ) : (
                      <BlogBlockRenderer key={block.id} block={block} fontScale={fontScale} />
                    )
                  )}
                </>
              ) : (
                <>
                  {viewType === 'cut' && record.cutPhoto?.previewUri ? (
                    /* 네컷: 합성 미리보기 — '책상 위 인화지' 실물 연출
                       (글로우 + 기울임 + 그림자 + 데코 테이프 + 세리프 캡션) */
                    <>
                    <Animated.View style={[s.mediaWrap, entMedia]}>
                      {/* 뒤 은은한 글로우 — 프레임색을 따라감(프레임 사진이면 스킨색) */}
                      <LiquidCardGlow
                        width={SCREEN_W - 40}
                        height={cutFitStyle(record.cutPhoto!.layout, SCREEN_W, SCREEN_H).height}
                        color={record.cutPhoto!.frameColor || skinAccent.accent}
                        opacity={0.12}
                      />
                      {/* 기울임 계단현상은 래스터화+블리드 링 3종 세트로 방지 (SocialScreen 폴라로이드와 동일 기법) */}
                      <View style={s.cutTiltWrap}>
                        {/* 데코 테이프 — 인화지 위 모서리에 붙인다(2종 중 게시물별 고정 랜덤).
                            기울임 래퍼 '안'이라 종이와 같이 기울어져 실제로 붙은 것처럼 읽힌다.
                            variant 1(사선 테이프)은 원본 높이가 커서 조금 더 올린다 —
                            −13은 SocialScreen 원본값 그대로다(cutTiltWrap의 블리드 여유가 이를 받는다). */}
                        <View pointerEvents="none" style={[s.cutTape, tapeVariant === 1 && { top: -13 }]}>
                          <FeedTape variant={tapeVariant} />
                        </View>
                        <View collapsable={false} style={{ margin: -1, padding: 1 }} shouldRasterizeIOS renderToHardwareTextureAndroid>
                          <TouchableOpacity activeOpacity={0.9} onPress={() => handleMediaTap(() => openFullImage(cutViewerUris, 0))}>
                            <Image source={{ uri: record.cutPhoto!.previewUri }} style={[s.cutImage, cutFitStyle(record.cutPhoto!.layout, SCREEN_W, SCREEN_H)]} resizeMode="cover" />
                          </TouchableOpacity>
                        </View>
                      </View>
                      {companionsOverlay}
                      {heartOverlay}
                    </Animated.View>
                    {/* 인화지에 적은 메모 — 세리프 + 흐린 색. 종이와 같은 각도로 살짝 눕힌다.
                        mediaWrap '밖'에 두는 이유: 안에 넣으면 컨테이너가 캡션만큼 길어져
                        bottom 기준으로 붙는 동행자 버튼(tagBtn)이 사진을 벗어나 캡션 위로 내려온다.
                        배경 비네트·텍스처는 넣지 않는다 — 이 화면은 캡처·공유 대상이라 절제를 우선. */}
                    {!!cutCaption && (
                      <Text style={s.cutCaption} numberOfLines={1} ellipsizeMode="tail">{cutCaption}</Text>
                    )}
                    </>
                  ) : viewType === 'album' && record.medias && record.medias.length > 0 ? (
                    /* 사진첩: 게시물이 아닌 앨범 — 전체 사진 그리드 + 장수 표기 (좋아요·댓글·여행정보 없음)
                       섹션(albumSections)이 있으면 섹션 제목별로 나눠 그린다 (보기 전용) */
                    <>
                      {(record.albumSections && record.albumSections.length > 0
                        ? sectionSlices(record.albumSections, record.medias.length)
                        : [null]
                      ).map((sec) => (
                        <View key={sec?.id ?? 'flat'}>
                          {sec && (
                            <View style={s.albumSectionHeader}>
                              <Text style={s.albumSectionTitle}>{sec.title}</Text>
                              <Text style={s.albumSectionCount}>{sec.count}</Text>
                            </View>
                          )}
                          <View style={s.albumGrid}>
                            {(sec ? record.medias!.slice(sec.start, sec.end) : record.medias!).map((uri, i) => {
                              const globalIdx = sec ? sec.start + i : i;
                              return (
                                <TouchableOpacity
                                  key={`${uri}-${globalIdx}`}
                                  activeOpacity={0.85}
                                  onPress={() => handleMediaTap(() => openFullImage(record.medias!, globalIdx))}
                                >
                                  <Image source={{ uri }} style={s.albumGridImg} />
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      ))}
                      <Text style={s.albumCount}>{t('postDetail.albumPhotoCount', { count: record.medias.length })}</Text>
                    </>
                  ) : record.medias && record.medias.length > 0 ? (
                    /* 피드: 실제 첨부 사진 캐러셀 — 좌우 여백 없이 화면 폭 가득(엣지-투-엣지) */
                    <Animated.View style={[s.mediaWrap, s.mediaFullBleed, entMedia]}>
                      <SlideImageViewerDetail
                        items={record.medias.map((uri) => ({ uri }))}
                        onImagePress={(uris, i) => handleMediaTap(() => openFullImage(uris, i))}
                        captions={record.photoTexts}
                        fullBleed
                      />
                      {companionsOverlay}
                      {heartOverlay}
                    </Animated.View>
                  ) : (
                    /* 사진 없음: 그라데이션 placeholder */
                    <LinearGradient
                      colors={
                        viewType === 'album' ? ['#2E1A0A', '#1A0A2E'] :
                        ['#1A0A2E', '#3B1E8E']
                      }
                      style={s.imageArea}
                    >
                      <View style={{ opacity: 0.4 }}>
                        {viewType === 'album' ? <CameraIcon size={48} color="#fff" /> : <LandscapeIcon size={48} color="#fff" />}
                      </View>
                      <View style={[s.viewTypeBadge, { backgroundColor: skinAccent.tint(0.12) }]}>
                        <Text style={[s.viewTypeText, { color: skinAccent.accent }]}>
                          {viewType === 'feed' ? t('postDetail.typeFeed') : viewType === 'cut' ? t('postDetail.typeCut') : t('postDetail.typeAlbum')}
                        </Text>
                      </View>
                      {companionsOverlay}
                    </LinearGradient>
                  )}

                  {bodyText ? (
                    <Text
                      style={[
                        s.content,
                        { marginBottom: bodyLong && !bodyExpanded ? 2 : (bodyText.trim().length > 50 ? 4 : 0) },
                      ]}
                      numberOfLines={bodyLong && !bodyExpanded ? 6 : undefined}
                    >
                      {bodyText}
                    </Text>
                  ) : null}
                  {bodyLong && !bodyExpanded && (
                    <TouchableOpacity onPress={() => setBodyExpanded(true)} accessibilityRole="button" accessibilityLabel={t('postDetail.bodyMoreA11y')}>
                      <Text style={[s.moreBtn, { color: skinAccent.accent }]}>{t('postDetail.more')}</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

          {/* ── 이하 공통: 정보 칩, 메모, 키워드, 좋아요, 댓글 ── */}
          <View>

          {/* ── 키워드 (여행정보 위, 항상 표시 — 앨범은 사진 모음이라 제외) ── */}
          {viewType !== 'album' && record.keywords && record.keywords.length > 0 && (
            <View style={s.keywords}>
              {record.keywords.map((k) => (
                <View key={k} style={[s.keyword, { backgroundColor: skinAccent.tint(0.12) }]}>
                  <Text style={[s.keywordText, { color: skinAccent.accent }]}>#{k}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── 티켓풍 메타 블록 (피드·스트립) ──
              예전에는 국가 태그·작성시각·별점·여행정보 칩이 화면 곳곳에 같은 칩 언어로
              흩어져 있었다. 한 장의 탑승권으로 묶어 이 화면의 위계를 만든다. */}
          {ticketOn && <TravelTicket record={record} />}

          {/* ── 여행정보 토글 버튼 (블로그 전용) ──
              피드·스트립은 위 티켓이 흡수했다. 앨범은 원래부터 제외. */}
          {!ticketOn && viewType !== 'album' && (record.startDate || record.weather || record.budget || record.flightType) && (
            <TouchableOpacity
              style={[s.travelInfoBtn, { backgroundColor: skinAccent.tint(0.12), borderColor: skinAccent.tint(0.2) }]}
              activeOpacity={0.8}
              onPress={() => setTravelInfoPref(!travelInfoOpen)}
            >
              <CalendarIcon size={14} color={skinAccent.accent} />
              <Text style={[s.travelInfoBtnText, { color: skinAccent.accent }]} {...andFitText}>{t('postDetail.travelInfo')}</Text>
              <ChevronIcon size={16} color={skinAccent.accent} up={travelInfoOpen} />
            </TouchableOpacity>
          )}

          {/* ── 정보 칩들 (블로그 전용 — 피드·스트립은 티켓으로 흡수) ── */}
          {!ticketOn && viewType !== 'album' && travelInfoOpen && (record.startDate || record.weather || record.budget || record.flightType) && (
            <View style={s.infoRow}>
              {record.startDate && record.endDate && (
                <View style={s.infoChip}>
                  <CalendarIcon size={13} color="#A1A1B0" />
                  <Text style={s.infoChipText}>{record.startDate} ~ {record.endDate}</Text>
                </View>
              )}
              {normalizeWeather(record.weather) && (
                <View style={s.weatherChip}>
                  {/* 기록 화면과 같은 제작 SVG 세트 — 이모지는 기기 폰트마다 모양이 달랐다 */}
                  <WeatherIcon value={record.weather} size={18} color="#A1A1B0" />
                </View>
              )}
              {record.flightType && (
                <View style={s.infoChip}>
                  {record.flightType === '직항' ? <PlaneIcon size={13} color="#A1A1B0" /> : <TransferIcon size={13} color="#A1A1B0" />}
                  <Text style={s.infoChipText}>{record.flightType}</Text>
                </View>
              )}
              {record.budget && (
                <View style={s.infoChip}>
                  <Text style={s.infoChipText}>
                    {currencySymbol(record.budget.currency)}{' '}{record.budget.amount.toLocaleString()}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── 메모 (본문에 글이 나오는 피드·앨범·스트립은 중복 방지, 블로그만 표시) ── */}
          {record.memo && viewType === 'blog' && (
            <View style={[s.memoBox, { backgroundColor: skinAccent.tint(0.06), borderLeftColor: skinAccent.accent }]}>
              <Text style={s.memoText}>{record.memo}</Text>
            </View>
          )}

          {/* ── 좋아요 · 댓글 수 + 댓글 목록 (앨범은 사진 모음이라 소셜 요소 없음) ── */}
          {viewType !== 'album' && (<>
          <Animated.View style={[s.statsRow, entInfo]}>
            <View style={[s.statBtn, record.liked && s.statBtnLiked]}>
              <TouchableOpacity onPress={() => { if (record.isExample) return; buzz('light'); springLike(); handleToggleLike(); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={record.liked ? t('postDetail.unlike') : t('postDetail.like')}>
                <Animated.View style={{ transform: [{ scale: likeScale }] }}>
                  <HeartSvg filled={!!record.liked} />
                </Animated.View>
              </TouchableOpacity>
              <TouchableOpacity onPress={openLikers} disabled={!canShowLikers || !!record.isExample} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('postDetail.likersA11y')}>
                <Text style={[s.statCount, record.liked && { color: C.red }]}>{record.likes}</Text>
              </TouchableOpacity>
            </View>
            {!record.isExample && (
              <TouchableOpacity style={s.statBtn} onPress={() => commentInputRef.current?.focus()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={t('postDetail.commentInputA11y')}>
                <CommentSvg />
                <Text style={s.statCount}>{totalComments}</Text>
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* ── 구분선 ── */}
          <View style={s.divider} />

          {/* ── 댓글 목록 ── */}
          <Text style={s.commentTitle}>{t('postDetail.commentCountN', { count: totalComments })}</Text>
          {comments.map((c) => (
            <View key={c.id}>
              <View style={s.commentItem}>
                {/* 아바타/이름 탭 → 작성자 프로필 (서버 댓글만 authorId 보유) */}
                <TouchableOpacity
                  style={s.commentAvatar}
                  disabled={!c.authorId}
                  onPress={() => c.authorId && navigation.navigate('FriendProfile', { userId: c.authorId, username: c.name })}
                >
                  <AuthorAvatar photo={c.photo} emoji={c.emoji} size={32} emojiSize={15} />
                </TouchableOpacity>
                <View style={s.commentBody}>
                  <View style={s.commentTopRow}>
                    <Text
                      style={s.commentName}
                      onPress={c.authorId ? () => navigation.navigate('FriendProfile', { userId: c.authorId!, username: c.name }) : undefined}
                    >
                      {c.name}
                    </Text>
                    <Text style={s.commentTime}>{commentTime(c)}</Text>
                  </View>
                  <Text style={s.commentText}>{c.text}</Text>
                  <View style={s.commentActions}>
                    <TouchableOpacity style={s.commentLikeBtn} onPress={() => { buzz('light'); toggleCommentLike(postId, c.id); }}>
                      <Text style={[s.commentLikeIcon, c.liked && { color: C.red }]}>{c.liked ? '♥' : '♡'}</Text>
                      {!!c.likes && <Text style={s.commentLikeCount}>{c.likes}</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleReply(c.id, c.name)}>
                      <Text style={s.commentActionText} {...andFitText}>{t('postDetail.reply')}</Text>
                    </TouchableOpacity>
                    {c.isMine ? (
                      <TouchableOpacity onPress={() => confirmDeleteComment(c.id)}>
                        <Text style={[s.commentActionText, { color: C.red }]} {...andFitText}>{t('postDetail.delete')}</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity onPress={() => setCommentReportId(c.id)}>
                        <Text style={s.commentActionText} {...andFitText}>{t('social.report')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
              {/* 답글 목록 */}
              {c.replies && c.replies.length > 0 && c.replies.map((r) => (
                <View key={r.id} style={s.replyItem}>
                  <TouchableOpacity
                    style={s.commentAvatar}
                    disabled={!r.authorId}
                    onPress={() => r.authorId && navigation.navigate('FriendProfile', { userId: r.authorId, username: r.name })}
                  >
                    <AuthorAvatar photo={r.photo} emoji={r.emoji} size={32} emojiSize={13} />
                  </TouchableOpacity>
                  <View style={s.commentBody}>
                    <View style={s.commentTopRow}>
                      <Text
                        style={s.commentName}
                        onPress={r.authorId ? () => navigation.navigate('FriendProfile', { userId: r.authorId!, username: r.name }) : undefined}
                      >
                        {r.name}
                      </Text>
                      <Text style={s.commentTime}>{commentTime(r)}</Text>
                    </View>
                    <Text style={s.commentText}>{r.text}</Text>
                    <View style={s.commentActions}>
                      <TouchableOpacity style={s.commentLikeBtn} onPress={() => { buzz('light'); toggleCommentLike(postId, r.id); }}>
                        <Text style={[s.commentLikeIcon, r.liked && { color: C.red }]}>{r.liked ? '♥' : '♡'}</Text>
                        {!!r.likes && <Text style={s.commentLikeCount}>{r.likes}</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleReply(r.id, r.name)}>
                        <Text style={s.commentActionText} {...andFitText}>{t('postDetail.reply')}</Text>
                      </TouchableOpacity>
                      {r.isMine ? (
                        <TouchableOpacity onPress={() => confirmDeleteComment(r.id)}>
                          <Text style={[s.commentActionText, { color: C.red }]} {...andFitText}>{t('postDetail.delete')}</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity onPress={() => setCommentReportId(r.id)}>
                          <Text style={s.commentActionText} {...andFitText}>{t('social.report')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ))}
          {commentsLoading && comments.length === 0 ? (
            <ActivityIndicator color={skinAccent.accent} style={{ marginTop: 20 }} />
          ) : comments.length === 0 ? (
            <Text style={s.commentEmpty}>{t('trip.noComments')}</Text>
          ) : null}
          </>)}
          <View style={{ height: 16 }} />
          </View>
        </ScrollView>

        {/* ── 답글 표시 바 ── */}
        {replyTo && (
          <View style={s.replyBar}>
            <Text style={[s.replyBarText, { color: skinAccent.accent }]}>{t('postDetail.replyingTo', { name: replyTo.name })}</Text>
            <TouchableOpacity onPress={cancelReply}>
              <Text style={s.replyBarCancel}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* ── 댓글 입력 (앨범 및 예시 콘텐츠 제외) ── */}
        {viewType !== 'album' && !record.isExample && (
        // 안드로이드 내비바 인셋 보정 (키보드가 떠 있으면 인셋 불필요 — 키보드가 내비바를 덮음)
        <View style={[s.inputBar, { paddingBottom: Platform.OS === 'ios' ? 28 : kbVisible ? 12 : insets.bottom + 12 }]}>
          <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
            ref={commentInputRef}
            style={s.input}
            placeholder={replyTo ? t('postDetail.replyToPlaceholder', { name: replyTo.name }) : t('postDetail.commentPlaceholder')}
            placeholderTextColor={C.muted}
            value={commentText}
            onChangeText={setCommentText}
            onSubmitEditing={addComment}
            returnKeyType="send"
            maxLength={500}
          />
          <TouchableOpacity
            style={[s.sendBtn, { backgroundColor: skinAccent.accent }, !commentText.trim() && s.sendBtnDisabled]}
            onPress={addComment}
            disabled={!commentText.trim()}
          >
            <Text style={[s.sendText, !commentText.trim() && s.sendTextDisabled]}>{t('postDetail.send')}</Text>
          </TouchableOpacity>
        </View>
        )}
      </KeyboardAvoidingView>

      {/* 동행자 팝업 닫기용 오버레이 */}
      {showCompanions && (
        <Pressable
          style={s.dismissOverlay}
          onPress={() => setShowCompanions(false)}
        />
      )}

      {/* ── 메뉴 모달 ── */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        statusBarTranslucent navigationBarTranslucent
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={[s.menuOverlay, { paddingRight: 20 + stageGutter }]}
          accessibilityViewIsModal
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={s.menuCard}>
            {isArchived ? (
              /* 보관된 게시물 — 보관 해제 / 삭제만 노출 */
              <>
                <TouchableOpacity style={s.menuItem} onPress={handleUnarchive} activeOpacity={0.7}>
                  <ArchiveIcon size={16} color="#fff" />
                  <Text style={s.menuItemText}>{t('misc.unarchive')}</Text>
                </TouchableOpacity>
                <View style={s.menuSectionDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleDelete} activeOpacity={0.7}>
                  <TrashIcon size={16} color="#FF3B30" />
                  <Text style={[s.menuItemText, { color: '#FF3B30' }]}>{t('postDetail.deleteAction')}</Text>
                </TouchableOpacity>
              </>
            ) : (
            <>
            {/* 공통 메뉴 */}
            <TouchableOpacity style={s.menuItem} onPress={handleCopyLink} activeOpacity={0.7}>
              <LinkIcon size={16} color="#fff" />
              <Text style={s.menuItemText}>{t('social.copyLink')}</Text>
            </TouchableOpacity>
            <View style={s.menuDivider} />
            <TouchableOpacity style={s.menuItem} onPress={handleSharePost} activeOpacity={0.7}>
              <ShareIcon size={16} color="#fff" />
              <Text style={s.menuItemText}>{t('postDetail.shareAction')}</Text>
            </TouchableOpacity>

            {viewType === 'blog' && (
              <>
                <View style={s.menuDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleExportToNaver} activeOpacity={0.7}>
                  <View style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: '#03C75A', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>N</Text>
                  </View>
                  <Text style={s.menuItemText}>{t('postDetail.naverExportTitle')}</Text>
                </TouchableOpacity>
              </>
            )}

            {isMyPost ? (
              <>
                <View style={s.menuDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleToggleVisibility} activeOpacity={0.7}>
                  {record.visibility === 'private'
                    ? <GlobeIcon size={16} color="#fff" />
                    : <LockClosedIcon size={16} color="#fff" />}
                  <Text style={s.menuItemText}>{t(record.visibility === 'private' ? 'social.makePublic' : 'social.makePrivate')}</Text>
                </TouchableOpacity>
                <View style={s.menuDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleArchive} activeOpacity={0.7}>
                  <ArchiveIcon size={16} color="#fff" />
                  <Text style={s.menuItemText}>{t('postDetail.archiveAction')}</Text>
                </TouchableOpacity>
                <View style={s.menuDivider} />
                <TouchableOpacity style={s.menuItem} onPress={() => {
                  setMenuVisible(false);
                  if (viewType === 'blog') {
                    navigation.navigate('BlogRecord', { record: rawRecord });
                  } else if (viewType === 'album') {
                    // 사진첩 편집(추가·삭제·섹션 정리)은 전용 화면(TripRecord)에서 — 차단 알림 대체
                    if (rawRecord) navigation.navigate('TripRecord', { record: rawRecord, viewType: 'album' });
                  } else {
                    navigation.navigate('NewRecord', { record: rawRecord });
                  }
                }} activeOpacity={0.7}>
                  <PencilIcon size={16} color="#fff" />
                  <Text style={s.menuItemText}>{t('postDetail.editAction')}</Text>
                </TouchableOpacity>
                <View style={s.menuSectionDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleDelete} activeOpacity={0.7}>
                  <TrashIcon size={16} color="#FF3B30" />
                  <Text style={[s.menuItemText, { color: '#FF3B30' }]}>{t('postDetail.deleteAction')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={s.menuSectionDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleReport} activeOpacity={0.7}>
                  <MegaphoneIcon size={16} color="#FF3B30" />
                  <Text style={[s.menuItemText, { color: '#FF3B30' }]}>{t('social.reportLong')}</Text>
                </TouchableOpacity>
                {/* 수정 6: 타인 게시물 차단 — SocialScreen과 동일 패턴 */}
                <View style={s.menuDivider} />
                <TouchableOpacity style={s.menuItem} onPress={handleBlockAuthor} activeOpacity={0.7}>
                  <PersonIcon size={16} color="#FF3B30" />
                  <Text style={[s.menuItemText, { color: '#FF3B30' }]}>{t('social.blockTitle')}</Text>
                </TouchableOpacity>
              </>
            )}
            </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── 신고 모달 ── */}
      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSubmit={(reason) => {
          setReportVisible(false);
          reportPost(record.id, reason);
          setToastMsg(t('social.reportReceivedToast'));
          setTimeout(() => setToastMsg(''), 2000);
        }}
      />

      {/* 댓글 신고 — 접수 즉시 해당 댓글이 목록에서 사라진다(App Store 1.2) */}
      <ReportModal
        visible={commentReportId !== null}
        onClose={() => setCommentReportId(null)}
        onSubmit={(reason) => {
          const id = commentReportId;
          setCommentReportId(null);
          if (id) reportComment(postId, id, reason);
          setToastMsg(t('social.reportReceivedToast'));
          setTimeout(() => setToastMsg(''), 2000);
        }}
      />

      {/* ── 좋아요한 사람 목록 ── */}
      <Modal visible={likersVisible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setLikersVisible(false)}>
        <TouchableOpacity style={s.likersOverlay} activeOpacity={1} onPress={() => setLikersVisible(false)} accessibilityViewIsModal>
          {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) */}
          <View style={[s.likersSheet, { paddingBottom: Platform.OS === 'ios' ? 28 : insets.bottom + 12 }]}>
            <View style={s.likersHandle} />
            <Text style={s.likersTitle}>{t('postDetail.likersCountN', { count: likers.length })}</Text>
            {likersLoading ? (
              <ActivityIndicator color={skinAccent.accent} style={{ marginTop: 24 }} />
            ) : likers.length === 0 ? (
              <Text style={s.commentEmpty}>{t('postDetail.noLikers')}</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
                {likers.map((u) => (
                  <TouchableOpacity
                    key={u.id}
                    style={s.likerRow}
                    activeOpacity={0.7}
                    onPress={() => { setLikersVisible(false); navigation.navigate('FriendProfile', { userId: u.id, username: u.name, handle: u.handle }); }}
                  >
                    <AuthorAvatar photo={u.photo} emoji={u.emoji} size={38} emojiSize={17} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={s.likerName}>{u.name}</Text>
                      {!!u.handle && <Text style={s.likerHandle}>@{u.handle}</Text>}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── 토스트 ── */}
      {toastMsg !== '' && (
        <View style={s.toast} pointerEvents="none">
          <Text style={s.toastText}>{toastMsg}</Text>
        </View>
      )}

      {/* ── 풀스크린 이미지 뷰어 ── */}
      {/* 전체화면 사진 뷰어 — 스와이프 + 핀치 줌 + n/m (공용) */}
      <PhotoViewerModal
        visible={fullImgVisible}
        uris={fullImgList}
        initialIndex={fullImgIndex}
        onClose={() => setFullImgVisible(false)}
      />
    </View>
  );
}

// SCREEN_W/SCREEN_H는 useSheets()가 매 렌더의 실측값으로 넘긴다(모듈 최상위 박제 금지).
const makeS = (a: string, tint: (alpha: number) => string, SCREEN_W: number, SCREEN_H: number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  // 예시 콘텐츠 공식 배지 — 기능 소개 카드(FeatureShowcaseCard.badge)와 동일 룩
  officialBadge: { alignSelf: 'center', fontSize: 9, fontWeight: '800', color: '#0A0A0F', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },

  // ── 헤더 ──
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: C.cardBorder,
  },
  // 좌(뒤로가기)·우(메뉴) 동일 폭 → 가운데 제목이 버튼 개수와 무관하게 항상 화면 중앙
  headerSide: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { fontSize: 22, color: C.white, marginTop: -1 },
  headerTitle: { flexShrink: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: C.white, marginHorizontal: 8 },
  menuBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center',
  },
  menuDots: { fontSize: 16, color: C.dim, letterSpacing: 2, marginTop: -2 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: C.muted, fontSize: 14 },

  // ── 미디어 전체 영역 (여백 없이, 위까지) ──
  // 인스타 스토리식 상단 오버레이

  // ── 유저 정보 ──
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18,
  },
  authorTouch: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  followBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: a },
  followBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  followingBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.cardBorder },
  followingBtnText: { color: C.dim },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: tint(0.12), alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: tint(0.2),
  },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '700', color: C.white },
  userMeta: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4,
  },
  countryTag: {
    backgroundColor: tint(0.12),
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4,
  },
  countryTagText: { fontSize: 11, fontWeight: '600', color: a },
  dateMeta: { fontSize: 11, color: C.muted },
  ratingStars: { fontSize: 13, color: a, letterSpacing: 1.5 },

  // ── 이미지 ──
  imageArea: {
    width: '100%', aspectRatio: 4 / 3, borderRadius: 16, marginBottom: 18,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    zIndex: 10,
  },

  // ── 실제 사진/네컷 영역 ──
  mediaWrap: { position: 'relative', marginBottom: 4 },
  // 피드 캐러셀 — 스크롤 본문 패딩(20)을 상쇄해 화면 폭 가득 채운다
  mediaFullBleed: { marginHorizontal: -20 },
  // 스트립 기울임 — '책상 위 인화지'. 그림자는 iOS만(Android elevation은 투명 래퍼에서
  // 사각 그림자가 그대로 드러난다 — 깊이감은 뒤 글로우가 대신한다)
  cutTiltWrap: {
    alignSelf: 'center',
    transform: [{ rotate: '-1.5deg' }],
    // ── 테이프 블리드 여유 (margin −14 / padding +14) ──
    // 데코 테이프는 absolute + 음수 top이라 '부모 경계 밖'에 놓이기 쉬운데, 안드로이드는
    // 경계를 벗어난 절대배치 자식을 클리핑하는 경우가 잦다(형제에 renderToHardwareTextureAndroid가
    // 걸려 합성 경로가 더 민감하다). iOS는 멀쩡해서 tsc·lint·layout-parity 어느 것도 못 잡는다.
    // 원본(SocialScreen d.polaFront)은 padding 10이 있어 top:-8/-13이 카드 '안쪽'에 떨어졌다 —
    // 여기엔 그 패딩이 없었으므로 같은 조건을 만들어 준다.
    // 상쇄 margin으로 레이아웃 위치는 그대로 두는 건 이 저장소의 블리드 링 기법
    // (바로 아래 래스터화 래퍼의 `margin:-1, padding:1`)과 같은 원리다.
    marginTop: -14,
    paddingTop: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.45,
        shadowRadius: 16,
      },
      default: {},
    }),
  },
  // 사진첩(앨범) 그리드 — 본문 패딩(20+20) 안 3열
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginBottom: 10 },
  albumGridImg: {
    width: Math.floor((SCREEN_W - 40 - 4) / 3),
    height: Math.floor((SCREEN_W - 40 - 4) / 3),
    borderRadius: 4,
    backgroundColor: '#1F1F22',
  },
  albumCount: { color: '#A1A1B0', fontSize: 12, marginBottom: 10 },
  albumSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, paddingBottom: 8 },
  albumSectionTitle: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  albumSectionCount: { fontSize: 12, color: '#A1A1B0' },
  cutImage: {
    width: SCREEN_W - 40, height: SCREEN_H * 0.6, borderRadius: 12,
    marginBottom: 14, backgroundColor: '#000', alignSelf: 'center',
  },
  // 인화지 위 데코 테이프 — 소셜 폴라로이드(d.polaTape)와 같은 배치값(top −8, variant 1은 −13).
  // 절대배치 자식의 top은 부모의 '패딩 안쪽'(content box)이 기준이라, 위 cutTiltWrap의
  // paddingTop 14 덕분에 −13까지도 부모 경계 밖으로 나가는 픽셀이 0이다.
  //   variant 0(높이 ≈ 17.1): 바깥 위 모서리 기준 +6 ~ +23.1
  //   variant 1(높이 ≈ 27.6): 바깥 위 모서리 기준 +1 ~ +28.6
  cutTape: {
    position: 'absolute', top: -8, left: 0, right: 0,
    alignItems: 'center', zIndex: 5, elevation: 5,
  },
  // 인화지 아래 손글씨풍 캡션 — 세리프(SERIF)는 광고·소셜 폴라로이드 캡션과 같은 서체 규약.
  // 종이(cutTiltWrap −1.5deg)와 같은 각도로 눕혀 '인화지에 적은 메모'로 읽히게 한다.
  cutCaption: {
    fontFamily: SERIF, fontSize: 13, color: 'rgba(255,255,255,0.55)',
    textAlign: 'center', alignSelf: 'center',
    maxWidth: '86%', marginTop: 2, marginBottom: 10,
    transform: [{ rotate: '-1.5deg' }],
  },
  heartBurst: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', zIndex: 20,
  },
  heartBurstIcon: {
    fontSize: 96, color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 16,
  },
  commentEmpty: {
    color: C.muted, fontSize: 14, textAlign: 'center',
    marginTop: 20, marginBottom: 8,
  },
  viewTypeBadge: {
    position: 'absolute', top: 12, right: 12,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  viewTypeText: { fontSize: 11, fontWeight: '600', color: a },
  tagBtn: {
    position: 'absolute', bottom: 12, left: 12,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  companionPopup: {
    position: 'absolute', bottom: 12, left: 50,
    backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, gap: 6,
  },
  companionPopupItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  companionPopupText: { fontSize: 12, color: '#fff', fontWeight: '500' },

  // ── 본문 ──
  content: {
    // 아래 키워드와 한 덩어리로 읽히도록 좁게 — 섹션 경계는 statsRow에서 벌린다.
    // 15px/24는 주변 칩·라벨과 크기가 거의 같아 "본문이 본문으로 안 읽혔다".
    // 16px/27로 한 단계 올려 글이 이 화면의 주인공임을 크기로 말한다(색은 유지).
    fontSize: 16, color: C.white, lineHeight: 27, marginBottom: 12,
  },

  // ── 티켓풍 메타 블록 (피드·스트립) ──
  // 흰 카드가 아니라 다크 티켓이다 — 마이티켓과의 혼동을 피하고 이 화면의 문법을 지킨다.
  // overflow:'hidden'은 절취선 좌우의 반원 노치를 '반만' 남겨 구멍처럼 보이게 하는 장치이기도 하다.
  ticket: {
    marginTop: 10, marginBottom: 16,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14,
    borderRadius: 14, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  ticketStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  // 작성 시각 + 접기 셰브런을 한 덩어리로(우측 정렬)
  ticketStripRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // 소형 대문자 + 넓은 자간 — 이 화면 라벨류의 공통 문법(댓글 제목과 같은 계열)
  ticketBrand: { fontSize: 10, fontWeight: '800', letterSpacing: 1.8, color: '#6B7280' },
  ticketStamp: { fontSize: 11, color: C.muted },
  ticketHero: { flexDirection: 'row', alignItems: 'flex-start' },
  ticketCol: { flex: 1 },
  ticketColRight: { alignItems: 'flex-end' },
  // 라벨 13px/600/#9CA3AF — 마이티켓 statLabel과 같은 값. 영문 대문자라 자간을 얹었다.
  ticketLabel: { fontSize: 13, fontWeight: '600', color: '#9CA3AF', letterSpacing: 1.2 },
  // 값은 크게·900(마이티켓 subValue 문법). lineHeight를 명시해야 플랫폼별 기본 행간 차이로
  // 셰브런 세로 정렬이 어긋나지 않는다 — 안드로이드 타이트 행간 글리프 잘림 방지도 겸한다.
  // 20이 아니라 19인 건 'YYYY.MM.DD' 한 줄이 히어로 반쪽 열에 들어가는 실측 상한이기 때문이다.
  ticketValue: { fontSize: 19, fontWeight: '900', color: C.white, lineHeight: 24, marginTop: 4 },
  ticketValueRight: { textAlign: 'right' },
  // marginTop 24 ≈ 라벨 한 줄(≈15.5) + 값 marginTop(4) + (값 lineHeight 24 − 셰브런 16.27)/2
  // → 셰브런이 값 첫 줄의 세로 중앙에 온다(마이티켓 chevPair와 같은 계산 방식).
  ticketChevPair: { flexDirection: 'row', gap: 16, alignItems: 'center', marginTop: 24, paddingHorizontal: 6 },
  // ── 절취선 ──
  // marginHorizontal은 카드 좌우 패딩(16)을 상쇄해 선이 카드 끝까지 닿게 한다.
  ticketPerforation: { height: 24, justifyContent: 'center', marginHorizontal: -16, marginTop: 12 },
  ticketDashRow: { flexDirection: 'row', overflow: 'hidden', marginHorizontal: 16 },
  ticketDash: { width: 5, height: 1.5, backgroundColor: 'rgba(255,255,255,0.22)', marginRight: 4 },
  // 반원 노치 — 배경색 원을 카드 밖으로 절반 내밀고 overflow:'hidden'으로 잘라 낸다
  ticketNotch: {
    position: 'absolute', top: 5, width: 14, height: 14, borderRadius: 7,
    backgroundColor: C.bg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  ticketNotchL: { left: -7 },
  ticketNotchR: { right: -7 },
  // ── 하단 필드 격자 ──
  ticketGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 12 },
  ticketCell: { minWidth: 76 },
  ticketCellValue: { fontSize: 16, fontWeight: '900', color: C.white, lineHeight: 21, marginTop: 4 },
  // 아이콘·별점처럼 텍스트가 아닌 값의 자리 — 텍스트 값(marginTop 4 + 상승분)과 광학적으로 맞춘다
  ticketIconValue: { marginTop: 7, flexDirection: 'row', alignItems: 'center' },

  // ── 정보 칩들 ──
  infoRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12,
    alignItems: 'center',
  },
  infoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    // 매트 단색 대신 반투명 유리 톤 — 배경(우주 검정)이 살짝 비쳐 가볍게 보인다
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  companionIconWrap: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  infoChipText: { fontSize: 12, color: C.dim },
  weatherChip: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── 여행정보 토글 버튼 ──
  // 위 본문(글·사진·키워드)과 시각적으로 분리되도록 위 여백을 더 준다 —
  // 다른 블록은 marginBottom 18로 균일한데 이 버튼만 위 여백이 없어 붙어 보였다.
  travelInfoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    marginTop: 10, marginBottom: 14,
    backgroundColor: tint(0.12), borderWidth: 1, borderColor: tint(0.2),
  },
  travelInfoBtnText: { fontSize: 13, color: a, fontWeight: '600' },

  // ── 메모 ──
  memoBox: {
    backgroundColor: tint(0.06), borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14,
    borderLeftWidth: 3, borderLeftColor: a,
  },
  memoText: { fontSize: 13, color: C.dim, lineHeight: 20, fontStyle: 'italic' },

  // ── 키워드 ──
  keywords: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  keyword: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
    backgroundColor: tint(0.12),
  },
  keywordText: { fontSize: 12, color: a, fontWeight: '500' },

  // ── 좋아요 · 댓글 ──
  // 본문 영역과 소셜(반응) 영역의 경계 — 여기서 크게 벌려 두 덩어리를 나눈다
  // 이전에는 아이콘+숫자가 배경 위에 그대로 떠 있어 본문 텍스트와 시각적 무게가 같았다.
  // 누를 수 있는 것으로 읽히지도 않았다. 유리 알약으로 감싸 '반응 영역'임을 형태로 말한다.
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 14 },
  statBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  // 좋아요를 누른 상태 — 하트 색만 바뀌던 것을 알약 전체가 받도록. 스킨색이 아니라
  // 붉은 계열을 쓰는 건 하트의 기존 규약(C.red)을 따르는 것이다.
  statBtnLiked: {
    backgroundColor: 'rgba(255,107,157,0.12)',
    borderColor: 'rgba(255,107,157,0.38)',
  },
  statIcon: { fontSize: 22, color: C.dim },
  statCount: { fontSize: 14, fontWeight: '700', color: C.white },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.cardBorder, marginBottom: 16 },

  // ── 댓글 목록 ──
  // 섹션 제목은 '라벨'이지 본문이 아니다 — 티켓 라벨과 같은 문법(작게·자간·#9CA3AF)으로
  // 통일해, 본문 16px과 무게가 겹치지 않게 한 단계 낮춘다.
  commentTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: '#9CA3AF', marginBottom: 14 },
  commentItem: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  commentAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.card, alignItems: 'center', justifyContent: 'center',
  },
  commentBody: { flex: 1 },
  commentTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  commentName: { fontSize: 13, fontWeight: '600', color: C.white },
  commentTime: { fontSize: 11, color: C.muted },
  commentText: { fontSize: 13, color: C.dim, lineHeight: 19 },
  moreBtn: { color: a, fontSize: 13, fontWeight: '600', marginTop: 2, marginBottom: 6 },
  // ── 좋아요한 사람 목록 ──
  likersOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  likersSheet: {
    // Modal은 루트 클램프 밖이라 폭을 여기서 다시 잡는다(딤 배경 likersOverlay는 전체 폭 유지)
    width: '100%', maxWidth: STAGE_MAX_W, alignSelf: 'center',
    backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, maxHeight: '70%',
  },
  likersHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.cardBorder, marginBottom: 12 },
  likersTitle: { fontSize: 16, fontWeight: '700', color: C.white, marginBottom: 12 },
  likerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  likerName: { fontSize: 14, fontWeight: '600', color: C.white },
  likerHandle: { fontSize: 12, color: C.dim, marginTop: 1 },
  commentActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 },
  commentLikeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  commentLikeIcon: { fontSize: 14, color: C.dim },
  commentLikeCount: { fontSize: 12, color: C.dim },
  commentActionText: { fontSize: 12, color: C.muted, fontWeight: '600' },
  replyItem: { flexDirection: 'row', gap: 8, marginBottom: 12, marginLeft: 42 },
  replyBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.cardBorder,
  },
  replyBarText: { fontSize: 12, color: a, fontWeight: '600' },
  replyBarCancel: { fontSize: 16, color: C.muted, paddingHorizontal: 4 },

  // ── 댓글 입력 ──
  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: C.cardBorder,
    backgroundColor: C.bg,
  },
  input: {
    flex: 1, height: 40, borderRadius: 20,
    backgroundColor: C.card, paddingHorizontal: 16,
    color: C.white, fontSize: 14,
  },
  sendBtn: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20,
    backgroundColor: a,
  },
  sendBtnDisabled: {
    backgroundColor: C.cardBorder,
  },
  sendText: { fontSize: 13, fontWeight: '700', color: '#0A0A0F' },
  sendTextDisabled: { color: C.muted },

  // ── 동행자 팝업 닫기 오버레이 ──
  dismissOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 5,
  },

  // ── 메뉴 모달 ──
  menuOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start', alignItems: 'flex-end',
    paddingTop: 110, paddingRight: 20,
  },
  menuCard: {
    width: 180, backgroundColor: C.card,
    borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 12,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    height: 48, paddingHorizontal: 16, gap: 10,
  },
  menuItemText: { fontSize: 14, color: C.white, fontWeight: '500' },
  menuDivider: { height: 1, backgroundColor: '#3A3A4A' },
  menuSectionDivider: { height: 6, backgroundColor: '#1A1A26' },

  // ── 토스트 ──
  toast: {
    position: 'absolute', bottom: 100, alignSelf: 'center',
    backgroundColor: 'rgba(30,30,50,0.95)',
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12,
  },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});

// ── 스냅 상세 스타일 ──
// ── 블로그 블록 스타일 ──
const makeBlogS = (a: string, tint: (alpha: number) => string) => StyleSheet.create({
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: tint(0.15),
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: tint(0.25),
  },
  categoryBadgeText: { fontSize: 12, fontWeight: '600', color: a },
  text: {
    fontSize: 15, color: '#FFFFFF', lineHeight: 26, marginBottom: 6,
  },
  heading: {
    fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginTop: 20, marginBottom: 10,
  },
  imageWrap: { marginBottom: 14, borderRadius: 12, overflow: 'hidden' },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12 },
  video: { width: '100%', height: 220, backgroundColor: '#000', borderRadius: 12 },
  caption: {
    fontSize: 12, color: '#A1A1B0', textAlign: 'center', marginTop: 6,
    fontStyle: 'italic',
  },
  imagesGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14,
  },
  gridImage: { width: '100%', aspectRatio: 1, borderRadius: 8 },
  separator: { marginVertical: 16 },
  quote: {
    borderLeftWidth: 3, borderLeftColor: a,
    backgroundColor: tint(0.06),
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 8,
    marginBottom: 12,
  },
  quoteText: { color: '#A1A1B0', fontStyle: 'italic', lineHeight: 24 },
  linkCard: {
    flexDirection: 'row', backgroundColor: '#1C1C28',
    borderRadius: 12, overflow: 'hidden', marginBottom: 14,
    borderWidth: 1, borderColor: '#2A2A3A',
  },
  linkThumb: { width: 80, height: 80 },
  linkInfo: { flex: 1, padding: 10, gap: 4 },
  linkTitle: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  linkDesc: { fontSize: 11, color: '#A1A1B0', lineHeight: 16 },
  linkUrl: { fontSize: 10, color: '#5A5A6E' },
  fileBlock: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1C28', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#2A2A3A', gap: 10, marginBottom: 12 },
  fileName: { color: '#FFFFFF', fontSize: 13, fontWeight: '500' },
  fileSize: { color: '#5A5A6E', fontSize: 11, marginTop: 2 },
  tocWrap: {
    backgroundColor: tint(0.06),
    borderRadius: 12, marginBottom: 18, overflow: 'hidden',
    borderWidth: 1, borderColor: tint(0.12),
  },
  tocToggle: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  tocToggleText: { fontSize: 14, fontWeight: '600', color: a },
  tocArrow: { fontSize: 12, color: '#A1A1B0' },
  tocItem: { paddingVertical: 8, paddingRight: 16 },
  tocItemText: { fontSize: 13, color: '#A1A1B0' },
});

// ── 모먼트 스토리 스타일 ──
// ── 스냅 스토리 전체화면 스타일 ──
const makeStoryS = (a: string, tint: (alpha: number) => string, SCREEN_W: number, SCREEN_H: number) => StyleSheet.create({
  // 예시 콘텐츠 공식 배지 — 기능 소개 카드와 동일 룩, 스토리 헤더에선 살짝 크게
  officialBadge: { alignSelf: 'center', fontSize: 12, fontWeight: '800', color: '#0A0A0F', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  bgPhoto: {
    ...StyleSheet.absoluteFillObject,
    width: SCREEN_W,
    height: SCREEN_H,
  },
  bgPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1A0A2E',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 상단 그라데이션
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 32,
    zIndex: 10,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 10, // 진행 바를 상단에서 조금 내림
    marginBottom: 12,
  },
  progressSeg: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8, // 아이디·올린 시간 줄을 진행 바에서 조금 내림
  },
  // 아바타+아이디를 감싸는 탭 영역 — flex:1로 더보기·닫기 버튼을 우측에 유지
  authorTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  // 시안(iPhone 17 - 63): 링 없는 40pt 아바타 + 아이디·시간 한 줄 배치
  avatarRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tint(0.4),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  handle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  timeText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // 시안: 배경 원 없이 글리프만
  moreBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  moreBtnText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: -4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  closeBtnText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '400',
  },

  // PIP (전면 사진) — 시안: 좌상단, 시안→보라→마젠타 네온 그라데이션 테두리
  pipWrap: {
    position: 'absolute',
    top: 150,
    left: 24, // 사이드에서 조금 더 안쪽으로 (기존 16)
    width: SCREEN_W * 0.32,
    height: SCREEN_W * 0.48, // 세로를 늘려 1:1.5 비율 (기존 0.416 ≈ 1:1.3)
    borderRadius: 22,
    padding: 3,
    zIndex: 8,
  },
  pipImg: {
    width: '100%',
    height: '100%',
    borderRadius: 19,
  },

  // SNAP 뱃지
  snapBadge: {
    position: 'absolute',
    top: 110,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    zIndex: 8,
  },
  snapBadgeText: {
    color: '#FFD60A',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // 촬영 지연 뱃지
  lateBadge: {
    position: 'absolute',
    top: 145,
    right: 16,
    backgroundColor: 'rgba(255,214,10,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    zIndex: 8,
  },
  lateBadgeText: {
    color: '#FFD60A',
    fontSize: 11,
    fontWeight: '700',
  },

  // 하단 그라데이션
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 36,
    paddingTop: 100,
    zIndex: 10,
  },
  // 시안(Group 2085664529): 하단 중앙 알약형 위치 배지 — #1C1C1C 20% 투명 유리 느낌, 높이 28
  locationBadge: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(28,28,28,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 18,
  },
  locationText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  caption: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 24,
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  timeLeft: {
    color: '#FFD60A',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 14,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // 하단 액션 바
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8, // 조회·댓글·공유 아이콘을 사이드에서 조금 떨어뜨림 (기본 여백 16 + 8)
  },
  replyWrap: {
    flex: 1,
  },
  replyInput: {
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  replyPlaceholder: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnWithLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    marginLeft: 8, // 조회 아이콘을 사이드에서 조금 더 떨어뜨림 (액션 줄 여백 24 + 8)
    paddingRight: 12,
    gap: 6,
  },
  actionLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  actionIcon: {
    fontSize: 24,
    color: '#FFFFFF',
  },
  commentCountBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: a,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  commentCountText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── 인라인 메시지 입력 ──
  inlineOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 25,
  },
  inlineInputWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 26,
  },
  inlineInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 34,
    gap: 10,
    backgroundColor: 'rgba(20,20,30,0.92)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  inlineInput: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  inlineSendBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 21,
    backgroundColor: a,
  },
  inlineSendText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── 댓글 바텀시트 ──
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 30,
  },
  commentSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_H * 0.6,
    backgroundColor: '#1C1C28',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 40,
    overflow: 'hidden',
  },
  csHandleArea: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  csHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4A4A59',
  },
  csTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A3A',
    gap: 8,
  },
  csTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  csCount: {
    fontSize: 13,
    fontWeight: '500',
    color: '#A1A1B0',
  },
  csCommentItem: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  csAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2E2E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  csTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  csName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  csTime: {
    fontSize: 11,
    color: '#5A5A6E',
  },
  csText: {
    fontSize: 13,
    color: '#A1A1B0',
    lineHeight: 19,
  },
  csReplyBtn: {
    fontSize: 11,
    color: '#5A5A6E',
    fontWeight: '600',
    marginTop: 4,
  },
  csReplyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#2A2A3A',
  },
  csReplyBarText: {
    fontSize: 12,
    color: a,
    fontWeight: '600',
  },
  csReplyBarCancel: {
    fontSize: 16,
    color: '#5A5A6E',
    paddingHorizontal: 4,
  },
  csInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: '#2A2A3A',
  },
  csInput: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2E2E3B',
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 14,
  },
  csSendBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: a,
  },
  csSendText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0A0A0F',
  },
});

const makeViewerS = (a: string, tint: (alpha: number) => string) => StyleSheet.create({
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
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: a,
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '600',
  },
  // pageSheet Modal은 루트 클램프 밖(안드로이드에선 아예 전체화면)이라, 콘텐츠를
  // 여기서 다시 Stage 폭으로 가둔다. root(불투명 페이지 배경)는 전면 유지 —
  // root까지 좁히면 양옆에 모달 기본 배경이 드러난다.
  list: {
    paddingHorizontal: 20,
    gap: 16,
    width: '100%',
    maxWidth: STAGE_MAX_W,
    alignSelf: 'center',
  },
  footer: {
    width: '100%',
    maxWidth: STAGE_MAX_W,
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A26',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2E2E3B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 20,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  handleText: {
    fontSize: 12,
    color: '#A1A1B0',
  },
  time: {
    fontSize: 12,
    color: '#4A4A59',
  },
  closeBtn: {
    margin: 20,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#2E2E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});

// ─── 스냅 공유 시트 (메이트 DM 전송 + 외부 공유) 스타일 ───
const makeShareS = (a: string, tint: (alpha: number) => string) => StyleSheet.create({
  sheet: {
    // Modal은 루트 클램프 밖이라 폭을 여기서 다시 잡는다(딤 배경은 전체 폭 유지)
    width: '100%',
    maxWidth: STAGE_MAX_W,
    alignSelf: 'center',
    backgroundColor: '#1A1A28',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '75%',
    flexShrink: 1,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 },
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  friendAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2E2E3B', alignItems: 'center', justifyContent: 'center' },
  friendName: { flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  friendSend: { color: a, fontSize: 13, fontWeight: '700' },
  empty: { color: '#8B8B9E', fontSize: 13, textAlign: 'center', paddingVertical: 28 },
  externalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    borderRadius: 22,
    paddingVertical: 13,
    backgroundColor: '#2E2E3B',
  },
  externalTxt: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});

/**
 * 스타일시트를 지구본 스킨색의 함수로 — 강조색이 시트 5개에 흩어져 하드코딩돼 있어
 * 스킨을 바꿔도 이 화면 일부만 보라로 남았다. 호출부를 하나씩 덮는 대신 시트 자체를
 * 스킨의 함수로 두면 색을 쓰는 지점이 자동으로 따라오고 새 스타일에서도 빠뜨리지 않는다.
 * a=accent(밝은 강조), tint=그 알파 틴트. 스킨이 바뀔 때만 다시 만든다.
 */
function useSheets() {
  const { accent, tint } = useSkinAccent();
  // 폭·높이 의존 스타일이 있어 창 크기도 의존성에 넣는다 — 폴드를 펼치면 시트를 다시 만든다.
  const SCREEN_W = useStageWidth();
  const { height: SCREEN_H } = useWindowDimensions();
  return useMemo(() => ({
    s: makeS(accent, tint, SCREEN_W, SCREEN_H),
    blogS: makeBlogS(accent, tint),
    storyS: makeStoryS(accent, tint, SCREEN_W, SCREEN_H),
    viewerS: makeViewerS(accent, tint),
    shareS: makeShareS(accent, tint),
  }), [accent, tint, SCREEN_W, SCREEN_H]);
}

