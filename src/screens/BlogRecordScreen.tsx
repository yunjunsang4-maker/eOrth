import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  Modal,
  Alert,
  DeviceEventEmitter,
  PanResponder,
  Linking,
  Animated,
} from 'react-native';
import { Text, TextInput } from '../ui/Text';
import { WebView } from 'react-native-webview';
import { useTranslation } from 'react-i18next';
import { useSkinAccent } from '../constants/skinTheme';
import { countryLabel, continentLabel } from '../utils/countryLabel';
import * as ImagePicker from 'expo-image-picker';
import { compressImage, compressImages } from '../utils/imageCompress';
import CameraCaptureModal from '../components/CameraCaptureModal';
import * as VideoThumbnails from 'expo-video-thumbnails';
import type { MediaType } from 'expo-image-picker';
import { useRecords, type Visibility } from '../store/recordStore';
import { collectRecordedDateKeys, collectRecordedRanges } from '../utils/recordedDates';
import { CalendarBottomSheet } from '../components/record/CalendarBottomSheet';
import { PrivacyModal } from '../components/record/PrivacyModal';
import { detectCurrentCountry } from '../services/snapService';
import { currencyForCountryName } from '../constants/countryCurrency';
import { COUNTRIES, Country, CONTINENT_ORDER } from '../constants/countries';
import { BlogData } from '../utils/naverBlogConverter';
import AutoTocModal from '../components/AutoTocModal';
import { analyzeForToc, applyTocSuggestions, TocSuggestion } from '../utils/autoToc';
import { showPermissionDeniedAlert } from '../utils/permissionAlert';
import type { RootStackScreenProps } from '../navigation/types';
import { useMoments } from '../store/momentStore';
import { matchMoments, countryNameToCode, parseDotDate as parseDotDateMatch } from '../utils/momentMatch';
import MomentListSheet from '../components/moments/MomentListSheet';
import {
  CalendarIcon as SvgCalendarIcon,
  CoinIcon as SvgCoinIcon,
  PartlyCloudyIcon as SvgWeatherIcon,
  PlaneIcon as SvgPlaneIcon,
  TagIcon as SvgTagIcon,
  TakeoffIcon as SvgTakeoffIcon,
  TransferIcon as SvgTransferIcon,
  SoloIcon as SvgSoloIcon,
  FriendIcon as SvgFriendIcon,
  CoupleIcon as SvgCoupleIcon,
  FamilyIcon as SvgFamilyIcon,
  ParentIcon as SvgParentIcon,
  SiblingIcon as SvgSiblingIcon,
  SunIcon as SvgSunIcon,
  CloudyIcon as SvgCloudyIcon,
  RainIcon as SvgRainIcon,
  SnowIcon as SvgSnowIcon,
  PartlyCloudyIcon as SvgPartlyCloudyIcon,
  WindIcon as SvgWindIcon,
  LockClosedIcon as SvgLockClosedIcon,
  LockOpenIcon as SvgLockOpenIcon,
  MapIcon as SvgMapIcon,
  GalleryIcon,
  CameraIcon,
  LinkIcon,
  PaperclipIcon,
  ArchiveIcon as SvgArchiveIcon,
  TrashIcon as SvgTrashIcon,
} from '../components/icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path as SvgPath } from 'react-native-svg';
import * as DocumentPicker from 'expo-document-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  BlogBlock, TextBlock, HeadingBlock, ImageBlock, ImagesBlock, VideoBlock,
  SeparatorBlock, QuoteBlock, LinkBlock, FileBlock,
  TEXT_COLORS, BG_COLORS,
  FONT_OPTIONS, FONT_SIZE_OPTIONS, TextAlign, SeparatorStyle,
  ImageLayout, HeadingLevel,
  createTextBlock, createHeadingBlock, createImageBlock,
  createImagesBlock, createVideoBlock, createVideoPlaceholderBlock, createSeparatorBlock, createQuoteBlock,
  createLinkBlock, createFileBlock,
  blocksToPlainText, blocksToPhotos, blocksToVideoThumbnails,
} from '../types/blogBlocks';
import { useStageWidth, STAGE_MAX_W } from '../utils/stage';
import { andFitText } from '../utils/fitText';

/** 시트 공용 체크 표시 — '✓' 문자는 폰트마다 두께·크기가 달라 SVG로 그린다 */
function SheetCheck() {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
      <SvgPath d="M20 6L9 17l-5-5" stroke="#FFFFFF" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const C = {
  bg: '#0A0A0F', editorBg: '#111118', card: '#2E2E3B', cardLight: '#1E1B33',
  toolbar: '#16161F', toolbarBorder: '#252535',
  // 강조색(구 purpleNeon/purpleDeep/purpleBg/purpleBorder/quoteBg/quoteBorder)은
  // 여기서 제거했다 — 스킨 연동을 위해 makeStyles(a, ad, tint) 인자로 넘어간다.
  white: '#FFFFFF', dim: '#A1A1B0', muted: '#4A4A59', divider: '#1A1A26',
  green: '#34C759', naverGreen: '#03C75A',
  gold: '#FFD700', // 미입력 표시 — 다른 화면(NewRecord/CutTravelInfo)과 같은 값
};

const COMPANIONS = ['혼자', '친구', '연인', '가족', '부모님', '형제'];
const WEATHER_OPTIONS = [
  { label: '맑음',     value: '맑음' },
  { label: '부분흐림', value: '부분흐림' },
  { label: '흐림',     value: '흐림' },
  { label: '비',       value: '비' },
  { label: '눈',       value: '눈' },
  { label: '바람',     value: '바람' },
];
const FLIGHT_OPTIONS = ['직항', '경유'];
const CURRENCIES = ['KRW', 'JPY', 'USD'];
// 표시 문구는 visibilityLabel(), 아이콘은 VISIBILITY_ICON_MAP이 담당한다 (동행자 칩과 동일 구조)
const VISIBILITY_OPTIONS: { value: Visibility }[] = [
  { value: 'neighbors' },
  { value: 'private' },
];
// 글자 크기 라벨 → i18n 키 (FONT_SIZE_OPTIONS.size 기준, 라벨은 UI 문구라 번역)
const FONT_SIZE_KEY: Record<number, string> = {
  13: 'comp2.fontSizeSmall', 15: 'comp2.fontSizeNormal', 18: 'comp2.fontSizeLarge',
  22: 'comp2.fontSizeXLarge', 26: 'comp2.fontSizeHeading',
};

const OTHER_CURRENCIES = [
  { code: 'EUR', name: '유로 (EU)' },
  { code: 'CNY', name: '위안 (중국)' },
  { code: 'GBP', name: '파운드 (영국)' },
  { code: 'AUD', name: '호주 달러' },
  { code: 'CAD', name: '캐나다 달러' },
  { code: 'CHF', name: '스위스 프랑' },
  { code: 'HKD', name: '홍콩 달러' },
  { code: 'SGD', name: '싱가포르 달러' },
  { code: 'THB', name: '바트 (태국)' },
  { code: 'VND', name: '동 (베트남)' },
  { code: 'MYR', name: '링깃 (말레이시아)' },
  { code: 'PHP', name: '페소 (필리핀)' },
  { code: 'IDR', name: '루피아 (인도네시아)' },
  { code: 'INR', name: '루피 (인도)' },
  { code: 'TRY', name: '리라 (튀르키예)' },
  { code: 'AED', name: '디르함 (UAE)' },
  { code: 'NZD', name: '뉴질랜드 달러' },
];

// ─── 공개 범위 아이콘 ───
// 기본 이모지(🏡/🔒)는 기기 폰트마다 모양·크기가 달라 옆의 동행자 칩과 톤이 어긋났다.
// 제작 SVG 세트로 통일한다.
const VISIBILITY_ICON_MAP: Record<string, (color: string) => React.ReactNode> = {
  neighbors: (c) => <SvgFriendIcon size={16} color={c} />,
  private:   (c) => <SvgLockClosedIcon size={16} color={c} />,
};

// ─── 동행자 아이콘 ───
const COMPANION_ICON_MAP: Record<string, (color: string) => React.ReactNode> = {
  '혼자': (c) => <SvgSoloIcon size={16} color={c} />,
  '친구': (c) => <SvgFriendIcon size={16} color={c} />,
  '연인': (c) => <SvgCoupleIcon size={16} color={c} />,
  '가족': (c) => <SvgFamilyIcon size={16} color={c} />,
  '부모님': (c) => <SvgParentIcon size={16} color={c} />,
  '형제': (c) => <SvgSiblingIcon size={16} color={c} />,
};

// ─── 날씨 아이콘 ───
const WEATHER_ICON_MAP: Record<string, React.ReactNode> = {
  '맑음':     <SvgSunIcon size={16} />,
  '부분흐림': <SvgPartlyCloudyIcon size={16} />,
  '흐림':     <SvgCloudyIcon size={16} />,
  '비':       <SvgRainIcon size={16} />,
  '눈':       <SvgSnowIcon size={16} />,
  '바람':     <SvgWindIcon size={16} />,
};
const SEP_STYLES: { label: string; value: SeparatorStyle }[] = [
  { label: '실선', value: 'line' }, { label: '점', value: 'dots' },
  { label: '파선', value: 'dashed' }, { label: '굵은선', value: 'thick' },
  { label: '여백', value: 'space' },
];

// ─── 풀스크린 이미지 뷰어 ───
function FullScreenImageViewer({ images, initialIndex, visible, onClose }: {
  images: string[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
}) {
  // 페이지 폭이 스크롤 오프셋 계산에 들어간다 — 박제하면 폴드 펼침 시 엉뚱한 사진을 가리킨다.
  // 훅이므로 아래 조기 return(!visible)보다 반드시 위에 있어야 한다.
  //
  // 기준은 Stage가 아니라 '창 전체'다. 이건 딤 배경(rgba(0,0,0,0.95)) 위에 사진만 띄우는
  // 전체화면 뷰어라 화면 가득이 의도이고, RN Modal이라 루트 클램프 밖이라서 Stage 폭으로
  // 두면 pagingEnabled ScrollView(창 폭)와 페이지 폭(480)이 어긋나 페이징 자체가 깨진다.
  // 같은 성격의 PhotoViewerModal도 창 전체 기준이다.
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const [idx, setIdx] = useState(initialIndex);
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets(); // 안드로이드 상태바 높이 기기별 편차 보정용

  useEffect(() => {
    if (visible) {
      setIdx(initialIndex);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ x: initialIndex * SCREEN_W, animated: false });
      }, 50);
    }
    // SCREEN_W는 의도적으로 제외 — 뷰어를 열 때의 폭으로 한 번만 위치를 맞춘다.
    // 넣으면 폴드를 펼칠 때마다 initialIndex로 되돌아가 사용자가 보던 사진을 잃는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialIndex]);

  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))}
        >
          {images.map((uri, i) => (
            <View key={i} style={{ width: SCREEN_W, height: SCREEN_H, justifyContent: 'center', alignItems: 'center' }}>
              <Image source={{ uri }} style={{ width: SCREEN_W, height: SCREEN_H * 0.8 }} resizeMode="contain" />
            </View>
          ))}
        </ScrollView>
        {images.length > 1 && (
          <View style={{ position: 'absolute', bottom: 60, alignSelf: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 14 }}>{idx + 1} / {images.length}</Text>
          </View>
        )}
        {/* 안드로이드는 상태바 높이가 기기별로 달라 인셋 기반으로 보정 */}
        <TouchableOpacity onPress={onClose} style={{ position: 'absolute', top: Platform.OS === 'ios' ? 50 : insets.top + 6, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600' }}>✕</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── 슬라이드 이미지 뷰어 (편집용) ───
function SlideImageViewer({ items, width, blockId, onCaptionChange, onImagePress }: {
  items: { uri: string; caption?: string }[];
  width: number;
  blockId: string;
  onCaptionChange: (blockId: string, itemIdx: number, caption: string) => void;
  onImagePress?: (uris: string[], index: number) => void;
}) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  const [activeIdx, setActiveIdx] = useState(0);
  const imgH = width * 0.75;
  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          setActiveIdx(idx);
        }}
        style={{ width, height: imgH }}
        nestedScrollEnabled
      >
        {items.map((item, i) => (
          <TouchableOpacity key={i} activeOpacity={0.85} onPress={() => onImagePress?.(items.map(it => it.uri), i)}>
            <Image source={{ uri: item.uri }} style={{ width, height: imgH, borderRadius: 6 }} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </ScrollView>
      {items.length > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', paddingTop: 6, gap: 5 }}>
          {items.map((_, i) => (
            <View key={i} style={{
              width: i === activeIdx ? 16 : 6, height: 6, borderRadius: 3,
              backgroundColor: i === activeIdx ? skinAccent.accent : '#4A4A59',
            }} />
          ))}
        </View>
      )}
      <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
        style={{ color: '#A1A1B0', fontSize: 12, textAlign: 'center', paddingVertical: 8, paddingHorizontal: 12, fontStyle: 'italic' }}
        placeholder={t('blog.photoCaptionN', { n: activeIdx + 1 })}
        placeholderTextColor="#4A4A59"
        value={items[activeIdx]?.caption || ''}
        onChangeText={v => onCaptionChange(blockId, activeIdx, v)}
      />
    </View>
  );
}

// ─── 로컬 영상 플레이어 (expo-video, SDK 54 New Architecture 대응) ───
function LocalVideoPlayer({ uri, style }: { uri: string; style: any }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = false;
  });
  return (
    <VideoView
      style={style}
      player={player}
      contentFit="contain"
      nativeControls
      allowsFullscreen
    />
  );
}

const LockClosedIcon = ({ size = 12, color = '#FFFFFF' }: { size?: number; color?: string }) => (
  <SvgLockClosedIcon size={size} color={color} />
);

const LockOpenIcon = ({ size = 12, color = '#FFFFFF' }: { size?: number; color?: string }) => (
  <SvgLockOpenIcon size={size} color={color} />
);

const MapIcon = ({ size = 12, color = '#FFFFFF' }: { size?: number; color?: string }) => (
  <SvgMapIcon size={size} color={color} />
);

// ─── 키워드 표기 통일 ───
// '#' 포함 여부가 화면마다 다르다(피드는 '#서울'로, 블로그는 '서울'로 저장). 그대로 받아오면
// 블로그는 표시할 때 '#'을 덧붙여 '##서울'이 되고, 중복 검사(includes)도 표기가 달라 무력화된다.
// → 받는 경로·추가 경로 모두 선행 '#'을 떼고 저장하고, '#'은 표시할 때만 붙인다.
//   (이미 저장된 기록의 데이터는 손대지 않는다 — 표시/비교 시점에만 정규화)
const stripHash = (s: string): string => s.trim().replace(/^#+/, '').trim();
const normalizeKeywords = (list?: string[] | null): string[] => {
  const out: string[] = [];
  for (const raw of list ?? []) {
    const kw = stripHash(raw ?? '');
    if (kw && !out.includes(kw)) out.push(kw); // 정규화로 같아진 태그는 하나만 남긴다
  }
  return out;
};

type Props = RootStackScreenProps<'BlogRecord'>;

export default function BlogRecordScreen({ navigation, route }: Props) {
  const st = useSt();
  const SCREEN_W = useStageWidth(); // 이미지 블록 폭 — 슬라이드 페이징 폭으로도 쓰인다
  const insets = useSafeAreaInsets(); // 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨)
  const { t, i18n } = useTranslation();
  const skinAccent = useSkinAccent(); // 기록 화면 강조를 지구본 스킨색으로
  const { addRecord, updateRecord, addTripGroup, saveDraft, updateDraft, deleteDraft, drafts, neighbors, records } = useRecords();
  // 동행자·날씨·항공편·공개범위·구분선 값은 저장 키라 유지하고 표시만 번역
  const companionLabel = (c: string) => {
    switch (c) {
      case '혼자': return t('newRecord.compSolo');
      case '친구': return t('newRecord.compFriend');
      case '연인': return t('newRecord.compCouple');
      case '가족': return t('newRecord.compFamily');
      case '부모님': return t('newRecord.compParents');
      case '형제': return t('newRecord.compSibling');
      default: return c;
    }
  };
  const weatherLabel = (v: string) => {
    switch (v) {
      case '맑음': return t('newRecord.wSunny');
      case '부분흐림': return t('newRecord.wPartly');
      case '흐림': return t('newRecord.wCloudy');
      case '비': return t('newRecord.wRain');
      case '눈': return t('newRecord.wSnow');
      case '바람': return t('newRecord.wWind');
      default: return v;
    }
  };
  const flightLabel = (f: string) => (f === '직항' ? t('newRecord.flightDirect') : t('newRecord.flightLayover'));
  const visibilityLabel = (v: Visibility) => {
    switch (v) {
      case 'neighbors': return t('newRecord.visNeighbors');
      case 'private':   return t('newRecord.visPrivate');
      default: return '';
    }
  };
  const sepLabel = (v: SeparatorStyle) => {
    switch (v) {
      case 'line': return t('blog.sepLine');
      case 'dots': return t('blog.sepDots');
      case 'dashed': return t('blog.sepDashed');
      case 'thick': return t('blog.sepThick');
      case 'space': return t('blog.sepSpace');
      default: return '';
    }
  };
  // 함께한 메이트·비공개 대상 목록은 실제 팔로우한 메이트에서 가져온다 (데모 메이트 제거)
  const friendNames = neighbors.map((f) => f.username);

  // ─── 편집 모드 ───
  // 게시물 상세의 '수정'에서 기존 블로그 기록을 받아 미리 채운다
  const editRecord = route?.params?.record;
  const isEdit = !!editRecord;
  // 여행 카드에서 추가하면 그 여행의 정보(기간·동행자·별점·상세)를 받아 신규 작성 시 자동 적용한다
  const tripPrefill = route?.params?.tripPrefill;

  // 국가 (복수 가능 — 첫 번째가 대표 국가)
  const MAX_COUNTRIES = 10;
  const preselected = route?.params?.selectedCountry;
  const [selectedCountries, setSelectedCountries] = useState<Country[]>(() => {
    if (editRecord) {
      // 다국가 기록 편집이면 전체 목록 복원, 아니면 대표 국가만
      const list = (editRecord.countries ?? [])
        .map(cc => COUNTRIES.find(c => c.name === cc.name))
        .filter((c): c is Country => !!c);
      if (list.length > 0) return list;
      const single = COUNTRIES.find(c => c.name === editRecord.countryName);
      return single ? [single] : [];
    }
    const pre = preselected ? COUNTRIES.find(c => c.name === preselected.name.split(' - ')[0]) : null;
    return pre ? [pre] : [];
  });
  const selectedCountry = selectedCountries[0] ?? null; // 대표 국가 — 기존 로직(유효성·표시) 호환
  const toggleCountry = (c: Country) =>
    setSelectedCountries(prev =>
      prev.some(p => p.name === c.name)
        ? prev.filter(p => p.name !== c.name)
        : prev.length >= MAX_COUNTRIES ? prev : [...prev, c]
    );
  const [selectedRegion, setSelectedRegion] = useState<{ name: string; nameEn: string } | null>(() => {
    if (editRecord?.regionName) return { name: editRecord.regionName, nameEn: editRecord.regionNameEn ?? '' };
    return preselected?.region ? { name: preselected.region, nameEn: preselected.regionEn || '' } : null;
  });
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  // 검색어는 모달을 닫을 때 비운다 — 남겨두면 다음에 열었을 때 목록이 필터된 채로 떠서
  // "국가가 몇 개 없다"고 오해하게 된다.
  const closeCountryModal = () => { setCountryModalVisible(false); setCountrySearch(''); };

  // 선택 국가에 이미 기록된 날짜 — 기간 캘린더에 점으로 표시해 같은 여행에 기록을 추가하기 쉽게 (편집 중 기록 제외)
  const recordedDates = useMemo(
    () => collectRecordedDateKeys(records, selectedCountries.map(c => c.name), editRecord?.id),
    [records, selectedCountries, editRecord?.id]
  );

  // 기존 여행 기간 — 국가 구별 없이 전체를 캡슐 밴드로 표시 (피드 기록과 동일 규칙, 편집 중 기록 제외)
  const recordedRanges = useMemo(() => collectRecordedRanges(records, editRecord?.id), [records, editRecord?.id]);

  // useMoments — 서랍용 훅 (matchedMoments useMemo는 startDate/endDate state 이후에 위치)
  const { moments: allMoments } = useMoments();

  // 콘텐츠
  const [title, setTitle] = useState(editRecord?.content ?? '');
  const [subtitle, setSubtitle] = useState(editRecord?.subtitle ?? ''); // 부제목(선택)
  const [subtitleModalVisible, setSubtitleModalVisible] = useState(false);
  const [subtitleDraft, setSubtitleDraft] = useState('');
  const [blocks, setBlocks] = useState<BlogBlock[]>(
    editRecord?.blogBlocks?.length ? editRecord.blogBlocks : [createTextBlock()]
  );
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  // 풀스크린 이미지 뷰어
  const [fullImgVisible, setFullImgVisible] = useState(false);
  const [fullImgList, setFullImgList] = useState<string[]>([]);
  const [fullImgIndex, setFullImgIndex] = useState(0);
  const openFullImage = (uris: string[], index: number) => {
    setFullImgList(uris);
    setFullImgIndex(index);
    setFullImgVisible(true);
  };

  // 메타
  const [memo, setMemo] = useState(editRecord?.memo ?? '');
  const [startDate, setStartDate] = useState(editRecord?.startDate ?? tripPrefill?.startDate ?? '');
  const [endDate, setEndDate] = useState(editRecord?.endDate ?? tripPrefill?.endDate ?? '');

  // ── 작성 화면 참고용 서랍: 선택 국가+날짜로 순간 매칭 ──
  // startDate는 'YYYY.MM.DD' 문자열, parseDotDateMatch로 epoch ms 변환
  const matchedMoments = useMemo(() => {
    const first = selectedCountries[0] ?? null;
    const startMs = parseDotDateMatch(startDate || null);
    const endMs = parseDotDateMatch(endDate || null) ?? startMs;
    return matchMoments(allMoments, {
      countryCode: countryNameToCode(first?.name),
      startMs,
      endMs,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMoments, selectedCountries, startDate, endDate]);

  const [rating, setRating] = useState(editRecord?.rating ?? tripPrefill?.rating ?? 0);
  const [companions, setCompanions] = useState<string[]>(editRecord?.companions ?? tripPrefill?.companions ?? []);
  const [visibility, setVisibility] = useState<Visibility>(editRecord?.visibility ?? 'neighbors');
  const [companionFriends, setCompanionFriends] = useState<string[]>(editRecord?.companionFriends ?? tripPrefill?.companionFriends ?? []);
  const [friendPickerVisible, setFriendPickerVisible] = useState(false);
  const [weather, setWeather] = useState(editRecord?.weather ?? tripPrefill?.weather ?? '');
  const [budget, setBudget] = useState(editRecord?.budget ? String(editRecord.budget.amount) : tripPrefill?.budget ? String(tripPrefill.budget.amount) : '');
  const [currency, setCurrency] = useState(editRecord?.budget?.currency ?? tripPrefill?.budget?.currency ?? 'KRW');
  // 사용자가 통화를 직접 고르면 국가 기반 자동 추천을 멈춘다
  // (편집 모드·여행 카드 프리필로 통화가 이미 정해진 경우도 수동 취급)
  const currencyTouchedRef = useRef(isEdit || !!tripPrefill?.budget);
  const chooseCurrency = (code: string) => { currencyTouchedRef.current = true; setCurrency(code); };
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [flightType, setFlightType] = useState(editRecord?.flightType ?? tripPrefill?.flightType ?? '');
  const [keywords, setKeywords] = useState<string[]>(normalizeKeywords(editRecord?.keywords ?? tripPrefill?.keywords));
  const [keywordInput, setKeywordInput] = useState('');

  // 날짜 캘린더 — "YYYY.MM.DD"를 직접 파싱한다.
  // new Date('YYYY-MM-DD')는 UTC 자정으로 해석돼 UTC 음수 시간대(미주 등)에서 하루 밀리고,
  // Hermes는 비패딩 날짜(2025-4-5)에 Invalid Date를 줄 수 있다 (NewRecordScreen과 동일 파서).
  const parseDotDate = (s?: string): Date => {
    if (s) {
      const [y, m, d] = s.split(/[.\-/]/).map(p => parseInt(p, 10));
      if (
        Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d) &&
        m >= 1 && m <= 12 && d >= 1 && d <= 31
      ) {
        const dt = new Date(y, m - 1, d);
        dt.setHours(0, 0, 0, 0);
        if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) return dt;
      }
    }
    const today = new Date(); today.setHours(0, 0, 0, 0); return today;
  };
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [momentSheetVisible, setMomentSheetVisible] = useState(false); // ✨ 여행 기억 시트 (헤더 버튼)
  const [startDateObj, setStartDateObj] = useState<Date>(() => parseDotDate(editRecord?.startDate ?? tripPrefill?.startDate));
  const [endDateObj, setEndDateObj] = useState<Date>(() => parseDotDate(editRecord?.endDate ?? tripPrefill?.endDate));

  // UI 모달
  const [privateFriends, setPrivateFriends] = useState<string[]>(editRecord?.mediaPrivacy?.[0] ?? []);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [representativePhoto, setRepresentativePhoto] = useState<string | null>(
    editRecord?.representativePhoto ?? null
  );

  // 압축본 uri → 원본 uri 매핑. "지도 대표" 사진은 저장 시 원본에서 고해상도로 재생성한다.
  const originalUriMapRef = useRef<Record<string, string>>({});
  const REP_HIRES_EDGE = 2560;
  const REP_HIRES_QUALITY = 0.9;
  const toRepHiRes = async (uri?: string): Promise<string | undefined> => {
    if (!uri) return uri;
    const original = originalUriMapRef.current[uri];
    if (!original) return uri;
    return compressImage(original, REP_HIRES_EDGE, REP_HIRES_QUALITY);
  };
  const [repPhotoModalVisible, setRepPhotoModalVisible] = useState(false);
  const [travelInfoVisible, setTravelInfoVisible] = useState(false);
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [bgColorPickerVisible, setBgColorPickerVisible] = useState(false);
  const [fontPickerVisible, setFontPickerVisible] = useState(false);
  const [fontSizePickerVisible, setFontSizePickerVisible] = useState(false);
  const [sepStylePickerVisible, setSepStylePickerVisible] = useState(false);
  const [linkModalVisible, setLinkModalVisible] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftListVisible, setDraftListVisible] = useState(false);
  // ─── AI 자동 목차 ───
  const [tocModalVisible, setTocModalVisible] = useState(false);
  const [tocSuggestions, setTocSuggestions] = useState<TocSuggestion[]>([]);
  // 하단 툴바 서브패널
  const [photoMenuVisible, setPhotoMenuVisible] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [fontBarVisible, setFontBarVisible] = useState(false);
  const [headingBarVisible, setHeadingBarVisible] = useState(false);
  const [moreMenuVisible, setMoreMenuVisible] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const blockRefs = useRef<Record<string, TextInput | null>>({});
  const travelScrollRef = useRef<ScrollView>(null);

  // 대표(선택) 국가에 맞춰 기본 통화 자동 추천 — 사용자가 직접 고르기 전까지
  useEffect(() => {
    if (currencyTouchedRef.current) return;
    const cur = currencyForCountryName(selectedCountry?.name);
    if (cur) setCurrency(cur);
     
  }, [selectedCountry?.name]);

  // 위치(국가·도시) 자동 채움 — 신규 작성이고 지정 국가 없이 들어왔을 때, 현재 위치로 1회 프리필
  useEffect(() => {
    if (isEdit || preselected) return;
    let cancelled = false;
    (async () => {
      const { countryCode, countryName, city } = await detectCurrentCountry({ allowPrompt: true });
      if (cancelled || (!countryCode && !countryName)) return;
      const found =
        (countryCode && COUNTRIES.find(c => c.term.split(' ')[0].toUpperCase() === countryCode.toUpperCase())) ||
        (countryName && COUNTRIES.find(c => c.name === countryName || c.term.toLowerCase().includes(countryName.toLowerCase()))) ||
        null;
      if (!found) return;
      setSelectedCountries(prev => (prev.length ? prev : [found]));
      if (city) setSelectedRegion(prev => prev ?? { name: city, nameEn: city });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── 네이버 가져오기 수신 (이벤트) ───
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('naverBlogImported', (imported: BlogData) => {
      // 메타: 비어있는 항목만 채움 (기존 입력 유지)
      if (imported.title) setTitle(prev => prev.trim() ? prev : imported.title);
      if (imported.startDate) setStartDate(prev => prev || imported.startDate!);
      if (imported.endDate) setEndDate(prev => prev || imported.endDate!);
      if (imported.rating) setRating(prev => prev > 0 ? prev : imported.rating!);
      if (imported.companions) setCompanions(prev => prev.length > 0 ? prev : imported.companions!);
      if (imported.weather) setWeather(prev => prev || imported.weather!);
      if (imported.keywords) setKeywords(prev => prev.length > 0 ? prev : normalizeKeywords(imported.keywords));
      if (imported.countryName) {
        setSelectedCountries(prev => {
          if (prev.length) return prev;
          const found = COUNTRIES.find(c => c.name === imported.countryName);
          return found ? [found] : prev;
        });
      }

      // 본문/사진/영상: 원본 순서 보존
      const importedBlocks: BlogBlock[] = [];
      if (imported.orderedBlocks && imported.orderedBlocks.length > 0) {
        // orderedBlocks가 있으면 원본 순서 그대로 블록 생성
        imported.orderedBlocks.forEach(ob => {
          if (ob.type === 'text' && typeof ob.value === 'string' && ob.value.trim()) {
            importedBlocks.push(createTextBlock(ob.value));
          } else if (ob.type === 'images' && Array.isArray(ob.value) && ob.value.length > 0) {
            // 그룹사진(콜라주/슬라이드) → ImagesBlock으로 유지
            const layout = ob.layout || (ob.value.length === 2 ? 'grid2' : 'grid3');
            importedBlocks.push(createImagesBlock(ob.value, layout));
          } else if (ob.type === 'image' && typeof ob.value === 'string' && ob.value) {
            importedBlocks.push(createImageBlock(ob.value));
          } else if (ob.type === 'video' && typeof ob.value === 'string' && ob.value) {
            // 네이버 영상은 앱에서 재생 불가라 그대로 심지 않고, 위치만 표시하는
            // 자리 블록으로 넣는다. 사용자가 탭해 자기 영상으로 채운다.(원본 링크는 보관)
            importedBlocks.push(createVideoPlaceholderBlock(ob.value));
          }
        });
      } else {
        // fallback: orderedBlocks 없으면 기존 방식
        if (imported.body) {
          imported.body.split(/\n\n+/).forEach((p, i) => {
            importedBlocks.push(createTextBlock(p));
            if (imported.photos?.[i]) importedBlocks.push(createImageBlock(imported.photos[i]));
          });
          const usedCount = importedBlocks.filter(b => b.type === 'image').length;
          imported.photos?.slice(usedCount).forEach(uri => importedBlocks.push(createImageBlock(uri)));
        } else if (imported.photos?.length) {
          imported.photos.forEach(uri => importedBlocks.push(createImageBlock(uri)));
        }
      }

      if (importedBlocks.length > 0) {
        setBlocks(prev => {
          const hasContent = prev.some(b =>
            (b.type === 'text' && (b as TextBlock).value.trim()) || b.type !== 'text'
          );
          return hasContent ? [...prev, ...importedBlocks] : importedBlocks;
        });
      }

      showToast(t('blog.naverImported'));
    });
    return () => sub.remove();
  }, []);

  // ─── 자동 임시저장 (30초) ───
  const draftSaveRef = useRef<((silent?: boolean) => void) | null>(null);
  // 최신 내용은 ref로 참조 — deps에 title/blocks를 넣으면 '키 입력마다' interval이
  // 파괴·재생성돼, 연속 타이핑 중에는 30초 저장이 영영 실행되지 않았다
  // (실제 동작이 "마지막 입력 후 30초"가 되어 강제 종료 시 세션 전체가 유실).
  const autosaveContentRef = useRef({ title: '', blocks: [] as BlogBlock[] });
  autosaveContentRef.current = { title, blocks };
  useEffect(() => {
    // 편집 모드(기존 게시물 수정)에서는 임시저장을 만들지 않는다
    if (isEdit) return;
    const timer = setInterval(() => {
      const { title: curTitle, blocks: curBlocks } = autosaveContentRef.current;
      if (!curTitle.trim() && curBlocks.every(b => b.type === 'text' && !(b as TextBlock).value.trim())) return;
      draftSaveRef.current?.(true);
    }, 30000);
    return () => clearInterval(timer);
  }, [isEdit]);

  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 2500); };

  // ─── 블로그 임시저장 목록 (viewType='blog'인 것만, 5일 이내) ───
  const DRAFT_MAX_AGE = 5 * 24 * 60 * 60 * 1000; // 5일 (ms)

  // 마운트 시 5일 지난 블로그 임시저장 자동 삭제 (화면 진입 시 1회만 — 의도된 동작)
  useEffect(() => {
    const now = Date.now();
    drafts
      .filter(d => d.viewType === 'blog' && now - d.timestamp > DRAFT_MAX_AGE)
      .forEach(d => deleteDraft(d.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const blogDrafts = drafts.filter(d => d.viewType === 'blog' && Date.now() - d.timestamp <= DRAFT_MAX_AGE);

  // 남은 일수 계산
  const draftDaysLeft = (timestamp: number) => {
    const remaining = DRAFT_MAX_AGE - (Date.now() - timestamp);
    if (remaining <= 0) return t('blog.expired');
    const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
    return t('blog.daysLeftN', { days });
  };

  // ─── 임시저장 불러오기 ───
  const loadDraft = (draft: typeof drafts[number]) => {
    setDraftId(draft.id);
    // 국가 — 다국가 임시저장이면 전체 목록 복원
    const draftList = (draft.countries ?? [])
      .map(cc => COUNTRIES.find(c => c.name === cc.name))
      .filter((c): c is Country => !!c);
    if (draftList.length > 0) {
      setSelectedCountries(draftList);
    } else if (draft.countryName) {
      const found = COUNTRIES.find(c => c.name === draft.countryName);
      setSelectedCountries(found ? [found] : []);
    } else {
      setSelectedCountries([]);
    }
    // 지역
    if (draft.regionName) {
      setSelectedRegion({ name: draft.regionName, nameEn: draft.regionNameEn ?? '' });
    } else {
      setSelectedRegion(null);
    }
    // 콘텐츠
    if (draft.blogBlocks && draft.blogBlocks.length > 0) {
      setBlocks(draft.blogBlocks);
    } else if (draft.content) {
      setBlocks([createTextBlock(draft.content)]);
    } else {
      setBlocks([createTextBlock()]);
    }
    // 제목: content 필드에 저장되어 있음 — 단, 제목 없이 저장한 초안은 content에
    // 본문 평문 폴백(목록 표시용)이 들어 있으므로, 본문과 같으면 제목으로 복원하지 않는다.
    // (그대로 넣으면 본문 전문이 제목칸(100자)에 주입되고 블록 본문과 이중이 된다)
    const draftBody = draft.blogBlocks && draft.blogBlocks.length > 0 ? blocksToPlainText(draft.blogBlocks) : '';
    setTitle(draft.content && draft.content !== draftBody ? draft.content : '');
    // 메타
    setSubtitle(draft.subtitle || ''); // 미복원 시 초안 부제목 유실 + 편집기 잔존 부제목이 초안에 눌어붙는 오염
    setMemo(draft.memo || '');
    setStartDate(draft.startDate || '');
    setEndDate(draft.endDate || '');
    // 캘린더 Date 객체도 함께 복원 — 아니면 캘린더를 열고 '확인'만 눌러도 초안 날짜가 오늘로 덮인다
    if (draft.startDate) setStartDateObj(parseDotDate(draft.startDate));
    if (draft.endDate) setEndDateObj(parseDotDate(draft.endDate));
    setRating(draft.rating || 0);
    setCompanions(draft.companions || []);
    setCompanionFriends(draft.companionFriends || []);
    setVisibility(draft.visibility ?? 'neighbors');
    setWeather(draft.weather || '');
    setBudget(draft.budget ? String(draft.budget.amount) : '');
    chooseCurrency(draft.budget?.currency || 'KRW');
    setFlightType(draft.flightType || '');
    setKeywords(normalizeKeywords(draft.keywords));
    if (draft.mediaPrivacy && draft.mediaPrivacy[0]) {
      setPrivateFriends(draft.mediaPrivacy[0]);
    } else {
      setPrivateFriends([]);
    }
    setRepresentativePhoto(draft.representativePhoto || null);
    setDraftListVisible(false);
    showToast(t('blog.draftLoaded'));
  };

  // ─── 임시저장 삭제 ───
  const handleDeleteDraft = (id: string) => {
    Alert.alert(t('blog.draftDeleteTitle'), t('blog.draftDeleteMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('blog.delete'), style: 'destructive', onPress: () => {
        deleteDraft(id);
        if (draftId === id) setDraftId(null);
        showToast(t('blog.draftDeleted'));
      }},
    ]);
  };

  // ─── 블록 조작 ───
  const getActiveIndex = () => {
    if (!activeBlockId) return blocks.length - 1;
    const idx = blocks.findIndex(b => b.id === activeBlockId);
    return idx >= 0 ? idx : blocks.length - 1;
  };

  const activeTextBlock = (): TextBlock | null => {
    if (!activeBlockId) return null;
    const b = blocks.find(b => b.id === activeBlockId);
    return b && b.type === 'text' ? b as TextBlock : null;
  };

  const insertBlockAfter = (block: BlogBlock) => {
    const idx = getActiveIndex();
    const updated = [...blocks];
    updated.splice(idx + 1, 0, block);
    if (block.type !== 'text' && block.type !== 'heading' && block.type !== 'quote') {
      const tb = createTextBlock();
      updated.splice(idx + 2, 0, tb);
      setBlocks(updated);
      setTimeout(() => { setActiveBlockId(tb.id); blockRefs.current[tb.id]?.focus(); }, 100);
    } else {
      setBlocks(updated);
      setTimeout(() => { setActiveBlockId(block.id); blockRefs.current[block.id]?.focus(); }, 100);
    }
  };

  const updateBlock = (id: string, changes: Partial<BlogBlock>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...changes } as BlogBlock : b));
  };

  const updateImagesItemCaption = (blockId: string, itemIdx: number, caption: string) => {
    setBlocks(prev => prev.map(b => {
      if (b.id !== blockId || b.type !== 'images') return b;
      const imb = b as ImagesBlock;
      const newItems = imb.items.map((item, i) => i === itemIdx ? { ...item, caption } : item);
      return { ...imb, items: newItems } as ImagesBlock;
    }));
  };

  // 삭제되는 블록이 대표사진을 담고 있으면 대표 지정도 해제
  const clearRepresentativeIfInBlock = (target: BlogBlock | undefined) => {
    if (!target) return;
    if (target.type === 'image' && (target as ImageBlock).uri === representativePhoto) {
      setRepresentativePhoto(null);
    } else if (target.type === 'images') {
      const uris = (target as ImagesBlock).items.map(it => it.uri);
      if (representativePhoto && uris.includes(representativePhoto)) {
        setRepresentativePhoto(null);
      }
    } else if (target.type === 'video' && (target as VideoBlock).thumbnail === representativePhoto) {
      setRepresentativePhoto(null);
    }
  };

  const deleteBlock = (id: string) => {
    if (blocks.length <= 1) {
      const only = blocks[0];
      // 마지막 남은 블록이 사진/영상이면 value:'' 클리어는 무의미(✕가 고장난 것처럼 보이고
      // 발행 시 그대로 포함됨) — 빈 텍스트 블록으로 교체해 실제로 지운다.
      if (only && only.id === id && only.type !== 'text' && only.type !== 'heading' && only.type !== 'quote') {
        clearRepresentativeIfInBlock(only);
        const tb = createTextBlock();
        setBlocks([tb]);
        setActiveBlockId(tb.id);
        setTimeout(() => blockRefs.current[tb.id]?.focus(), 50);
        return;
      }
      updateBlock(id, { value: '' } as any);
      return;
    }
    const idx = blocks.findIndex(b => b.id === id);
    clearRepresentativeIfInBlock(blocks[idx]);
    setBlocks(prev => prev.filter(b => b.id !== id));
    if (idx > 0) {
      const prev = blocks[idx - 1];
      setActiveBlockId(prev.id);
      setTimeout(() => blockRefs.current[prev.id]?.focus(), 50);
    }
  };

  // ─── 서식 적용 (활성 텍스트 블록에) ───
  const toggleFormat = (key: 'bold' | 'italic' | 'underline' | 'strikethrough') => {
    const tb = activeTextBlock();
    if (!tb) return;
    updateBlock(tb.id, { [key]: !tb[key] } as any);
  };

  const setBlockColor = (color: string) => {
    const tb = activeTextBlock();
    if (tb) updateBlock(tb.id, { color } as any);
    setColorPickerVisible(false);
  };

  const setBlockBgColor = (bgColor: string) => {
    const tb = activeTextBlock();
    if (tb) updateBlock(tb.id, { bgColor } as any);
    setBgColorPickerVisible(false);
  };

  const setBlockFontSize = (fontSize: number) => {
    const tb = activeTextBlock();
    if (tb) updateBlock(tb.id, { fontSize } as any);
    setFontSizePickerVisible(false);
  };

  const setBlockFontFamily = (fontFamily: string) => {
    const tb = activeTextBlock();
    if (tb) updateBlock(tb.id, { fontFamily } as any);
    setFontPickerVisible(false);
  };

  const setBlockAlign = (align: TextAlign) => {
    if (!activeBlockId) return;
    const b = blocks.find(blk => blk.id === activeBlockId);
    if (b && (b.type === 'text' || b.type === 'heading')) {
      updateBlock(b.id, { align } as any);
    }
  };

  // ─── 삽입 액션 ───
  const handleAddPhoto = async () => {
    setPhotoMenuVisible(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as MediaType[], allowsMultipleSelection: true, quality: 0.8,
      });
      if (result.canceled) return;
      if (result.assets.length > 1) {
        const originals = result.assets.map(a => a.uri);
        const uris = await compressImages(originals);
        uris.forEach((u, i) => { if (u !== originals[i]) originalUriMapRef.current[u] = originals[i]; });
        const layout: ImageLayout = uris.length === 2 ? 'grid2' : 'grid3';
        insertBlockAfter(createImagesBlock(uris, layout));
      } else if (result.assets.length === 1) {
        const orig = result.assets[0].uri;
        const c = await compressImage(orig);
        if (c !== orig) originalUriMapRef.current[c] = orig;
        insertBlockAfter(createImageBlock(c));
      }
    } catch (err: any) {
      console.error('[handleAddPhoto] error:', err);
      Alert.alert(t('blog.photoPickError'), err?.message || t('blog.photoLoadErrMsg'));
    }
  };

  // expo-image-picker launchCameraAsync가 SDK54/새 아키텍처에서 셔터가 먹지 않아,
  // 검증된 expo-camera(CameraCaptureModal)로 촬영한다(권한도 모달 내부에서 처리).
  const handleCamera = () => {
    setPhotoMenuVisible(false);
    setCameraOpen(true);
  };
  // 촬영 완료 → 압축 후 이미지 블록 삽입 (기존 handleCamera 후처리와 동일)
  const handleCameraCaptured = async (uri: string) => {
    const c = await compressImage(uri);
    if (c !== uri) originalUriMapRef.current[c] = uri;
    insertBlockAfter(createImageBlock(c));
  };

  const handleAddVideo = async () => {
    setPhotoMenuVisible(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'] as MediaType[],
        allowsMultipleSelection: false,
        // 비-Passthrough 프리셋 → iOS가 iCloud 영상을 export 중 자동 다운로드 (PHPhotos 3164 회피, SDK54 대응)
        videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
      });
      if (result.canceled || !result.assets[0]) return;
      const videoUri = result.assets[0].uri;
      // 첫 프레임 썸네일 추출 → 피드/지도 커버 + 영상 단독 게시 지원 (실패해도 영상은 삽입)
      let thumb: string | undefined;
      try {
        const t = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 1000, quality: 0.7 });
        thumb = t.uri;
      } catch (thumbErr) {
        console.warn('[handleAddVideo] 썸네일 추출 실패:', thumbErr);
      }
      insertBlockAfter(createVideoBlock(videoUri, undefined, thumb));
    } catch (err: any) {
      console.warn('[handleAddVideo] error:', err);
      Alert.alert(
        t('blog.videoLoadFailTitle'),
        t('blog.videoLoadFailMsg')
      );
    }
  };

  // 가져오기 자리 표시(placeholder) 블록을 사용자의 로컬 영상으로 채운다 — 위치는 그대로 두고 in-place 대체.
  const handleFillVideoPlaceholder = async (blockId: string) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'] as MediaType[],
        allowsMultipleSelection: false,
        videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
      });
      if (result.canceled || !result.assets[0]) return;
      const videoUri = result.assets[0].uri;
      let thumb: string | undefined;
      try {
        const th = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 1000, quality: 0.7 });
        thumb = th.uri;
      } catch (thumbErr) {
        console.warn('[handleFillVideoPlaceholder] 썸네일 추출 실패:', thumbErr);
      }
      // 자리 블록 → 실제 로컬 영상으로 대체(placeholder 해제, 원본 링크 제거)
      updateBlock(blockId, { uri: videoUri, thumbnail: thumb, placeholder: false, sourceUrl: undefined } as any);
    } catch (err: any) {
      console.warn('[handleFillVideoPlaceholder] error:', err);
      Alert.alert(t('blog.videoLoadFailTitle'), t('blog.videoLoadFailMsg'));
    }
  };

  const handleAddSeparator = (style: SeparatorStyle = 'dots') => {
    insertBlockAfter(createSeparatorBlock(style));
    setSepStylePickerVisible(false);
  };

  const handleAddHeading = (level: HeadingLevel = 2) => {
    insertBlockAfter(createHeadingBlock('', level));
  };

  const handleAddQuote = () => { insertBlockAfter(createQuoteBlock()); };

  const handleAddFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (!result.canceled && result.assets?.[0]) {
        const file = result.assets[0];
        insertBlockAfter(createFileBlock(file.uri, file.name, file.size, file.mimeType ?? undefined));
      }
    } catch (err: any) {
      console.warn('[handleAddFile] error:', err);
      Alert.alert(t('blog.fileSelectError'), err?.message || t('blog.fileLoadErrMsg'));
    }
  };

  const handleAddLink = () => {
    if (!linkUrl.trim()) return;
    insertBlockAfter(createLinkBlock(linkUrl.trim()));
    setLinkUrl('');
    setLinkModalVisible(false);
  };

  // ─── 날짜 포맷 ───
  const fmtDate = (date: Date) =>
    `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;

  const handleCalendarConfirm = (start: Date, end: Date) => {
    setStartDateObj(start);
    setEndDateObj(end);
    setStartDate(fmtDate(start));
    setEndDate(fmtDate(end));
  };

  // ─── 기존 여행 밴드 탭 → 블로그 폼 자동 채움 (신규 작성 시에만 onSelectRecordedTrip으로 전달) ───
  const applySourceRecord = (recordId: string, start: Date, end: Date) => {
    const src = records.find(r => r.id === recordId);
    if (!src) return;
    // 국가 — 다국가 배열 우선, 없으면 대표 국가 1개
    const countries = (src.countries ?? (src.countryName ? [{ flag: src.countryFlag, name: src.countryName }] : []))
      .map((c: { flag: string; name: string }) => COUNTRIES.find(k => k.name === c.name))
      .filter((c): c is Country => !!c);
    if (countries.length > 0) setSelectedCountries(countries);
    // 지역
    setSelectedRegion(src.regionName ? { name: src.regionName, nameEn: src.regionNameEn ?? '' } : null);
    // 기간 — handleCalendarConfirm 재사용으로 문자열·Date 상태 동시 갱신
    handleCalendarConfirm(start, end);
    // 평점
    setRating(src.rating ?? 0);
    // 동행
    setCompanions(src.companions ?? []);
    setCompanionFriends(src.companionFriends ?? []);
    // 예산·통화 — 소스에 예산이 있을 때만 통화까지 복사(자동추천 차단), 없으면 국가 기반 자동추천 유지
    if (src.budget) {
      setBudget(String(src.budget.amount));
      chooseCurrency(src.budget.currency); // currencyTouchedRef 처리 포함
    } else {
      setBudget('');
      currencyTouchedRef.current = false;
    }
    // 날씨·항공·태그·공개범위
    setWeather(src.weather ?? '');
    setFlightType(src.flightType ?? '');
    setKeywords(normalizeKeywords(src.keywords));
    setVisibility(src.visibility ?? 'neighbors');
    // 캘린더 닫고 폼 복귀
    setCalendarVisible(false);
  };

  // ─── 키워드 ───
  const addKeyword = () => {
    const kw = stripHash(keywordInput); // '#' 여러 개·앞뒤 공백까지 정리 (표시할 때만 '#'을 붙인다)
    if (kw && !keywords.includes(kw) && keywords.length < 10) { setKeywords(prev => [...prev, kw]); setKeywordInput(''); }
  };

  // ─── 동행자 ───
  const toggleCompanion = (comp: string) => {
    setCompanions(prev => prev.includes(comp) ? prev.filter(c => c !== comp) : [...prev, comp]);
  };

  const toggleCompanionFriend = (friend: string) => {
    setCompanionFriends(prev => prev.includes(friend) ? prev.filter(f => f !== friend) : [...prev, friend]);
  };
  const removeCompanionFriend = (friend: string) => {
    setCompanionFriends(prev => prev.filter(f => f !== friend));
  };

  const togglePrivateFriend = (friend: string) => {
    setPrivateFriends(prev => prev.includes(friend) ? prev.filter(f => f !== friend) : [...prev, friend]);
  };
  // 전체 비공개/해제 — 목록을 통째로 교체해 개별 메이트 체크 상태까지 즉시 동기화
  const setPrivateFriendsAll = (friends: string[]) => setPrivateFriends(friends);
  // ─── 별점 (0.5 단위) ───
  const STAR_SIZE = 28;
  const STAR_GAP = 6;
  const ratingRowRef = useRef<View>(null);
  const ratingRowPageX = useRef(0);

  const getRatingFromX = (x: number) => {
    let r = 0;
    for (let i = 0; i < 5; i++) {
      const starStart = i * (STAR_SIZE + STAR_GAP);
      if (x < starStart) break;
      r = x <= starStart + STAR_SIZE / 2 ? i + 0.5 : i + 1;
    }
    return Math.max(0, Math.min(5, r));
  };

  const ratingPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        ratingRowRef.current?.measure((_fx, _fy, _w, _h, px) => {
          ratingRowPageX.current = px;
          setRating(getRatingFromX(evt.nativeEvent.pageX - px));
        });
      },
      onPanResponderMove: (evt) => {
        setRating(getRatingFromX(evt.nativeEvent.pageX - ratingRowPageX.current));
      },
    })
  ).current;

  const renderStars = () => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      const isFull = rating >= i;
      const isHalf = rating >= i - 0.5 && rating < i;
      stars.push(
        <View key={i} style={{ width: STAR_SIZE, height: STAR_SIZE }}>
          <Text style={[st.starBase, st.starAbsolute]}>☆</Text>
          {(isFull || isHalf) && (
            <View style={[st.starFillClip, { width: isHalf ? STAR_SIZE / 2 : STAR_SIZE }]}>
              <Text style={[st.starBase, st.starActive, st.starAbsolute]}>★</Text>
            </View>
          )}
        </View>
      );
    }
    return (
      <View ref={ratingRowRef} style={st.ratingRow} {...ratingPanResponder.panHandlers}>
        {stars}
      </View>
    );
  };

  // ─── 임시저장 ───
  const handleDraftSave = (silent = false) => {
    const data = buildRecordData();
    if (draftId) {
      updateDraft(draftId, data);
    } else {
      const id = saveDraft(data);
      setDraftId(id);
    }
    if (!silent) showToast(t('blog.draftSaved'));
  };
  draftSaveRef.current = handleDraftSave;

  // ─── 공통 데이터 빌드 ───
  const buildRecordData = (blocksOverride?: BlogBlock[]) => {
    const srcBlocks = blocksOverride ?? blocks;
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
    const photos = blocksToPhotos(srcBlocks);
    const videoThumbs = blocksToVideoThumbnails(srcBlocks);
    const bodyText = blocksToPlainText(srcBlocks);
    // 커버: 직접 지정한 대표사진 → 본문 사진 → 영상 썸네일 순으로 폴백 (영상 단독 글도 커버 확보)
    const cover = representativePhoto || photos[0] || videoThumbs[0] || undefined;
    return {
      user: { name: '', emoji: '✈️', handle: '' }, // 작성자 정보는 addRecord가 로그인 사용자로 채움
      country: selectedCountry ? `${selectedCountry.flag} ${selectedCountry.name}` : '',
      countryName: selectedCountry?.name || '',
      countryFlag: selectedCountry?.flag || '',
      countries: selectedCountries.map(c => ({ flag: c.flag, name: c.name })),
      regionName: selectedRegion?.name || undefined,
      regionNameEn: selectedRegion?.nameEn || undefined,
      date: startDate || dateStr,
      content: title.trim() || bodyText,
      subtitle: subtitle.trim() || undefined,
      visibility,
      memo: memo.trim() || undefined,
      rating: rating || undefined,
      companions: companions.length > 0 ? companions : undefined,
      companionFriends: companionFriends.length > 0 ? companionFriends : undefined,
      medias: photos.length > 0 ? photos : undefined,
      mediaPrivacy: privateFriends.length > 0 ? { 0: privateFriends } : undefined,
      representativePhoto: cover,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      weather: weather || undefined,
      budget: budget ? { amount: Number(budget), currency } : undefined,
      flightType: flightType || undefined,
      keywords: keywords.length > 0 ? keywords : undefined,
      viewType: 'blog' as const,
      blogBlocks: srcBlocks,
    };
  };

  // ─── 필수 항목 충족 여부 ───
  const canSave = (() => {
    if (!selectedCountry) return false;
    const bodyText = blocksToPlainText(blocks);
    const hasMedia = blocks.some(b => b.type === 'image' || b.type === 'images' || (b.type === 'video' && !(b as any).placeholder && !!b.uri));
    if (!title.trim() && !bodyText && !hasMedia) return false;
    if (companions.length === 0) return false;
    if (rating <= 0) return false;
    return true;
  })();

  // ─── 발행 ───
  const [publishing, setPublishing] = useState(false);
  const publishingRef = useRef(false);
  const publish = async (finalBlocks: BlogBlock[]) => {
    if (publishingRef.current) return; // 중복 발행(이중 저장) 방지
    // 다국가 신규 발행: 게시물은 하나, 프로필 여행 카드를 하나로 할지 국가별로 나눌지 선택 (피드와 동일)
    // 수정 모드는 기존 설정 유지(다이얼로그 없음)
    if (!isEdit && selectedCountries.length > 1) {
      Alert.alert(
        t('newRecord.splitAskTitle'),
        t('newRecord.splitAskMsg', { count: selectedCountries.length }),
        [
          { text: t('newRecord.splitAskCancel'), style: 'cancel' },
          { text: t('newRecord.splitAskSplit'), onPress: () => { doPublish(finalBlocks, true); } },
          { text: t('newRecord.splitAskMerge'), onPress: () => { doPublish(finalBlocks, false); } },
        ]
      );
      return;
    }
    await doPublish(finalBlocks, false);
  };

  const doPublish = async (finalBlocks: BlogBlock[], splitByCountry: boolean) => {
    if (publishingRef.current) return;
    publishingRef.current = true;
    setPublishing(true);
    try {
      const data = {
        ...buildRecordData(finalBlocks),
        // 수정 모드에선 다이얼로그가 없으므로 기존 기록의 분할 설정을 보존
        splitByCountry: (isEdit ? editRecord?.splitByCountry : splitByCountry) || undefined,
      };
      // 지도 대표 사진만 원본 기반 고해상도로 교체 (일반 사진은 1600 유지)
      data.representativePhoto = await toRepHiRes(data.representativePhoto);
      if (isEdit && editRecord) {
        // 작성자는 유지하고 내용(공개 범위 포함)만 갱신
        const { user, ...changes } = data;
        updateRecord(editRecord.id, changes);
      } else {
        const recId = addRecord(data, { linkTrip: !splitByCountry });
        if (splitByCountry) {
          // 같은 기록 하나를 국가별 여행 카드로 (피드 기록과 동일한 패턴).
          // session: 여행 중 작성(실시간)이면 카드가 세션에 등록돼 이후 그 국가의 스냅이 합류한다
          selectedCountries.forEach((c) => {
            addTripGroup(
              {
                title: `${c.name} 여행`,
                records: [recId],
                coverRecordId: recId,
                countryName: c.name,
                countryFlag: c.flag,
              },
              { session: { startDate: data.startDate, endDate: data.endDate, date: data.date } }
            );
          });
        }
      }
      // 발행 성공 — 이 글의 임시저장본은 제거 (남겨두면 초안 목록에서 재발행 → 중복 게시)
      if (draftId) deleteDraft(draftId);
      navigation.goBack();
    } catch {
      // 실패 시에만 재시도 허용 (성공 시 goBack 으로 화면 이탈)
      publishingRef.current = false;
      setPublishing(false);
    }
  };

  // 여행 정보 패널 열기 — 툴바 ✈️ 진입점과 동일하게 인라인 바 4개(사진/폰트/문단/더보기)를 먼저 닫는다.
  // 넷 다 Modal이 아닌 인라인 View라 겹치지는 않지만, 닫지 않으면 패널을 닫았을 때
  // 아까 열어둔 바가 그대로 남아 있어 진입 경로마다 상태가 달라진다.
  const openTravelInfo = () => {
    setPhotoMenuVisible(false);
    setFontBarVisible(false);
    setHeadingBarVisible(false);
    setMoreMenuVisible(false);
    setTravelInfoVisible(true);
  };

  const handleSave = () => {
    if (!selectedCountry) { Alert.alert(t('blog.countrySelectTitle'), t('blog.selectCountryMsg')); return; }
    const bodyText = blocksToPlainText(blocks);
    const hasMedia = blocks.some(b => b.type === 'image' || b.type === 'images' || (b.type === 'video' && !(b as any).placeholder && !!b.uri));
    if (!title.trim() && !bodyText && !hasMedia) { Alert.alert(t('blog.contentTitle'), t('blog.contentMsg')); return; }
    // 동행자·별점은 하단 ✈️ 여행 정보 패널 안에 있어 유저가 존재 자체를 모른다.
    // 안내만 하면 "어디서 입력하냐"로 끝나므로 패널을 바로 열어주는 버튼을 함께 준다.
    // 둘을 한 Alert으로 합친 이유: 여기까지 왔다면 이미 내용은 쓴 상태(위 내용 체크 통과)라
    // 동행자 → 별점으로 Alert이 두 번 연달아 뜨면 "고쳐도 또 막힌다"로 읽힌다.
    // 어차피 같은 패널에서 같이 입력하므로 "여행 정보가 빈다" 한 번으로 안내한다.
    if (companions.length === 0 || rating <= 0) {
      Alert.alert(t('blog.travelInfoNeededTitle'), t('blog.travelInfoNeededMsg'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('blog.travelInfoOpen'), onPress: openTravelInfo },
      ]);
      return;
    }

    // AI 목차 분석: 제안이 2개 이상이면 미리보기 모달, 아니면 그대로 발행
    const suggestions = analyzeForToc(blocks);
    if (suggestions.length >= 2) {
      setTocSuggestions(suggestions);
      setTocModalVisible(true);
      return;
    }
    publish(blocks);
  };

  // ─── 이탈 확인 ───
  // 헤더 '취소'뿐 아니라 Android 하드웨어 뒤로가기·iOS 스와이프백까지 beforeRemove 한 경로로 방어.
  // (기존엔 취소 버튼에만 확인이 있어 제스처/뒤로가기로 나가면 글 전체가 무경고 소실됐다)
  // 내용 판정은 텍스트뿐 아니라 소제목·인용구·사진·영상 블록까지 포함한다.
  const exitGuardRef = useRef({ hasContent: false, isEdit: false });
  exitGuardRef.current = {
    hasContent: !!(
      title.trim() ||
      blocksToPlainText(blocks).trim() ||
      blocks.some((b) => b.type === 'image' || b.type === 'images' || (b.type === 'video' && !(b as any).placeholder && !!b.uri))
    ),
    isEdit,
  };
  // 임시저장 함수는 위 자동저장용 draftSaveRef(항상 최신 handleDraftSave)를 재사용한다

  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e) => {
      if (publishingRef.current) return; // 발행 완료로 인한 정상 이탈은 통과
      const { hasContent, isEdit: editing } = exitGuardRef.current;
      if (!hasContent) return;
      e.preventDefault();
      const leave = () => navigation.dispatch(e.data.action);
      if (editing) {
        Alert.alert(t('blog.editExitTitle'), t('blog.editExitMsg'), [
          { text: t('blog.exit'), style: 'destructive', onPress: leave },
          { text: t('blog.continueEdit'), style: 'cancel' },
        ]);
        return;
      }
      Alert.alert(t('blog.draftExitTitle'), t('blog.draftExitMsg'), [
        { text: t('blog.dontSave'), style: 'destructive', onPress: leave },
        { text: t('blog.saveDraft'), onPress: () => { draftSaveRef.current?.(false); leave(); } },
        { text: t('blog.continueWrite'), style: 'cancel' },
      ]);
    });
    return sub;
    // t는 언어 전환 시에만 바뀌므로 리스너 재등록 대상에서 제외 (NewRecordScreen과 동일 패턴)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  // ─── 국가 필터 ───
  const filteredCountries = countrySearch.trim()
    ? COUNTRIES.filter(c => c.name.includes(countrySearch) || c.term.toLowerCase().includes(countrySearch.toLowerCase()))
    : COUNTRIES;
  const groupedCountries = CONTINENT_ORDER.map(cont => ({
    continent: cont, countries: filteredCountries.filter(c => c.continent === cont),
  })).filter(g => g.countries.length > 0);

  const travelInfoCount = [startDate, endDate, rating > 0 ? 'y' : '', weather, companions.length > 0 ? 'y' : '', budget, flightType].filter(Boolean).length;
  // 필수 항목 미입력 체크
  const travelRequired = !startDate || companions.length === 0 || rating <= 0;
  const countryRequired = !selectedCountry;
  const atb = activeTextBlock();
  const showFormatBar = !!atb;

  // ─── 렌더 ───
  return (
    <SafeAreaView style={st.safe}>
      {/* 헤더 */}
      <View style={st.header}>
        {/* 이탈 확인은 beforeRemove 리스너가 일괄 처리 — 여기서 goBack만 하면 같은 다이얼로그를 탄다 */}
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.headerBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={st.headerBtnText} {...andFitText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        {/*
          제목은 헤더 가로 전체를 덮는 절대배치라, 방어가 없으면 좌우 버튼의 세로 중앙 띠를 삼킨다.
          그 방어를 <Text>가 아니라 래퍼 <View>의 pointerEvents **prop**으로 건다 —
          RN 0.81.5의 Text는 pointerEvents가 타입 선언(Libraries/Text/Text.d.ts:211-213)만 있고
          안드로이드 네이티브 구현이 0건(ReactAndroid/.../views/text/)이라, style이든 prop이든
          안드로이드에선 아무 일도 일어나지 않는다. tsc도 lint도 못 잡고 iOS는 지키기 때문에
          "안드로이드에서만 취소 버튼이 안 눌린다"로 나타났다. 반면 View는 ReactViewGroup에
          구현이 있어 히트테스트 진입 전에 서브트리가 통째로 빠진다(레포 선례 42곳과 같은 형태).

          래퍼에 top/bottom을 주지 않는 이유: 세로 중앙을 지금과 똑같이 재현하려는 것.
          헤더의 alignItems:'center'가 절대배치 자식을 세로 중앙에 놓는데, 래퍼 높이가
          제목 한 줄(= 예전 Text 높이)과 같으므로 픽셀 위치가 그대로 유지된다.
          top:0/bottom:0으로 늘리면 borderBottomWidth:1 때문에 중심이 0.5px 어긋난다.
        */}
        <View style={st.headerTitleWrap} pointerEvents="none">
          <Text style={st.headerTitle}>{isEdit ? t('blog.editTitle') : t('blog.title')}</Text>
        </View>
        <View style={st.headerRight}>
          {/* ✨ 여행 기억 버튼은 국가표시 행 오른쪽 끝으로 이동(헤더 제목과 겹침 방지) */}
          <TouchableOpacity
            onPress={() => setRepPhotoModalVisible(true)}
            style={[st.mapBtn, representativePhoto && [st.mapBtnActive, { borderColor: skinAccent.accent, backgroundColor: skinAccent.tint(0.12) }]]}
            activeOpacity={0.7}
          >
            {representativePhoto ? (
              <Image source={{ uri: representativePhoto }} style={st.mapBtnThumb} />
            ) : (
              <MapIcon size={13} color={C.dim} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPrivacyModalVisible(true)}
            style={[st.lockBtn, privateFriends.length > 0 && [st.lockBtnActive, { borderColor: skinAccent.accent, backgroundColor: skinAccent.tint(0.12) }]]}
            activeOpacity={0.7}
          >
            {privateFriends.length > 0 ? (
              <LockClosedIcon size={13} color={C.white} />
            ) : (
              <LockOpenIcon size={13} color={C.dim} />
            )}
            {privateFriends.length > 0 && (
              <View style={st.lockBadge}>
                <Text style={st.lockBadgeText}>{privateFriends.length}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('NaverBlogImport')} style={st.naverBtn}>
            <Text style={st.naverBtnText}>N</Text>
          </TouchableOpacity>
          {/* 요건 미충족이어도 탭은 받는다 — 예전엔 disabled라 눌러도 무반응이었고
              handleSave 안의 항목별 Alert이 전부 죽은 코드였다(유저는 "저장이 고장났다"고 인식).
              흐린 스타일은 그대로 둬서 "아직 뭔가 남았다"는 신호만 유지하고,
              disabled는 발행 중일 때만 — onPress도 publishing이면 막아 이중 발행/Alert 재진입을 차단한다. */}
          <TouchableOpacity onPress={publishing ? undefined : handleSave} style={[st.saveBtn, { backgroundColor: skinAccent.accentDeep }, (!canSave || publishing) && st.saveBtnDisabled]} disabled={publishing}>
            <Text style={[st.saveBtnText, (!canSave || publishing) && st.saveBtnTextDisabled]} {...andFitText}>{publishing ? t('blog.saving') : t('blog.save')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} style={st.editor} contentContainerStyle={st.editorContent}
          showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* 국가 + 여행 기억(✨) — ✨는 국가표시 열에 맞춰 오른쪽 끝에 배치(헤더 제목 겹침 방지) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <TouchableOpacity style={[st.countryChip, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.tint(0.3) }, countryRequired && st.countryChipRequired, { marginBottom: 0 }]} onPress={() => setCountryModalVisible(true)}>
              <Text style={selectedCountry ? [st.countryChipText, { color: skinAccent.accent }] : st.countryChipPlaceholder}>
                {selectedCountries.length > 0
                  ? selectedCountries.map(c => `${c.flag} ${countryLabel(c.name, i18n.language)}`).join(', ')
                  : t('blog.selectDestination')}
              </Text>
            </TouchableOpacity>
            {countryRequired && <View style={st.requiredDot} />}
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              onPress={() => setMomentSheetVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={t('moments.sheetTitle')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ padding: 4 }}
            >
              <Text style={{ fontSize: 18 }}>✨</Text>
            </TouchableOpacity>
          </View>

          {/* 제목 */}
          <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC" style={st.titleInput} placeholder={t('blog.titlePlaceholder')} placeholderTextColor={C.muted}
            value={title} onChangeText={setTitle} maxLength={100}
            onSubmitEditing={() => { const f = blocks[0]; if (f) { setActiveBlockId(f.id); blockRefs.current[f.id]?.focus(); } }} />
          {/* 부제목(선택) — 있으면 제목 아래 보라색으로 표시, 탭하면 수정 */}
          {!!subtitle.trim() && (
            <TouchableOpacity activeOpacity={0.7} onPress={() => { setSubtitleDraft(subtitle); setSubtitleModalVisible(true); }}>
              <Text style={[st.subtitleText, { color: skinAccent.accent }]}>{subtitle}</Text>
            </TouchableOpacity>
          )}
          <View style={[st.titleDivider, { backgroundColor: skinAccent.accentDeep }]} />

          {/* 블록 렌더 */}
          {blocks.map((block, index) => renderBlock(block, index))}

          {/* 태그 */}
          <View style={st.tagSection}>
            <View style={st.tagInputRow}>
              <Text style={[st.hashIcon, { color: skinAccent.accent }]}>#</Text>
              <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC" style={st.tagInput} placeholder={t('blog.tagPlaceholder')} placeholderTextColor={C.muted}
                value={keywordInput} onChangeText={setKeywordInput} onSubmitEditing={addKeyword} returnKeyType="done" />
            </View>
            {keywords.length > 0 && (
              <View style={st.tagList}>
                {keywords.map(kw => (
                  <TouchableOpacity key={kw} style={[st.tag, { backgroundColor: skinAccent.tint(0.15) }]} onPress={() => setKeywords(prev => prev.filter(k => k !== kw))}>
                    <Text style={[st.tagText, { color: skinAccent.accent }]}>#{kw}</Text>
                    <Text style={st.tagRemove}>✕</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={{ height: 140 }} />
        </ScrollView>

        {/* ── 서브 패널: 사진 메뉴 ── */}
        {photoMenuVisible && (
          <View style={st.subPanel}>
            <SubMenuItem icon={<GalleryIcon size={20} color="#A1A1B0" />} label={t('blog.selectPhoto')} onPress={handleAddPhoto} />
            <SubMenuItem icon={<CameraIcon size={20} color="#A1A1B0" />} label={t('blog.camera')} onPress={handleCamera} />
            <SubMenuItem icon="▶" label={t('blog.video')} onPress={handleAddVideo} />
          </View>
        )}

        {/* ── 서브 패널: 글꼴 서식 ── */}
        {fontBarVisible && (
          <View style={st.subPanel}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.toolRow}>
              {showFormatBar && (
                <>
                  <FormatBtn label="B" active={!!atb?.bold} onPress={() => toggleFormat('bold')} bold />
                  <FormatBtn label="I" active={!!atb?.italic} onPress={() => toggleFormat('italic')} italic />
                  <FormatBtn label="U" active={!!atb?.underline} onPress={() => toggleFormat('underline')} underline />
                  <FormatBtn label="S" active={!!atb?.strikethrough} onPress={() => toggleFormat('strikethrough')} strike />
                  <ToolSep />
                  <FormatBtn label="A" onPress={() => setColorPickerVisible(true)} colorDot={atb?.color || C.white} />
                  <FormatBtn label="▧" onPress={() => setBgColorPickerVisible(true)} colorDot={atb?.bgColor || 'transparent'} />
                  <ToolSep />
                </>
              )}
              <FormatBtn label={t('blog.fontSizeBtn')} onPress={() => setFontSizePickerVisible(true)} />
              <FormatBtn label="Aa" onPress={() => setFontPickerVisible(true)} />
              {showFormatBar && (
                <>
                  <ToolSep />
                  <FormatBtn label="≡" active={atb?.align === 'left' || !atb?.align} onPress={() => setBlockAlign('left')} />
                  <FormatBtn label="≡" active={atb?.align === 'center'} onPress={() => setBlockAlign('center')} />
                  <FormatBtn label="≡" active={atb?.align === 'right'} onPress={() => setBlockAlign('right')} />
                </>
              )}
            </ScrollView>
          </View>
        )}

        {/* ── 서브 패널: 줄정리 (정렬) ── */}
        {headingBarVisible && (
          <View style={st.subPanel}>
            <SubMenuItem icon="⫷" label={t('blog.alignLeft')} onPress={() => { setBlockAlign('left'); setHeadingBarVisible(false); }} />
            <SubMenuItem icon="☰" label={t('blog.alignCenter')} onPress={() => { setBlockAlign('center'); setHeadingBarVisible(false); }} />
            <SubMenuItem icon="⫸" label={t('blog.alignRight')} onPress={() => { setBlockAlign('right'); setHeadingBarVisible(false); }} />
          </View>
        )}

        {/* ── 서브 패널: 더보기(≡) ── */}
        {moreMenuVisible && (
          <View style={st.subPanel}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.toolRow}>
              <ToolBtn icon="T" label={t('blog.subtitle')} onPress={() => { setMoreMenuVisible(false); setSubtitleDraft(subtitle); setSubtitleModalVisible(true); }} />
              <ToolSep />
              <ToolBtn icon="H" label={t('blog.heading')} onPress={() => { setMoreMenuVisible(false); handleAddHeading(2); }} />
              <ToolSep />
              <ToolBtn icon={<LinkIcon size={22} color="#A1A1B0" />} label={t('blog.link')} onPress={() => { setMoreMenuVisible(false); setLinkModalVisible(true); }} />
              <ToolSep />
              <ToolBtn icon={'\u201C'} label={t('blog.quote')} onPress={() => { setMoreMenuVisible(false); handleAddQuote(); }} />
              <ToolSep />
              <ToolBtn icon="—" label={t('blog.separator')} onPress={() => { setMoreMenuVisible(false); setSepStylePickerVisible(true); }} />
              <ToolSep />
              <ToolBtn icon={<PaperclipIcon size={22} color="#A1A1B0" />} label={t('blog.file')} onPress={() => { setMoreMenuVisible(false); handleAddFile(); }} />
            </ScrollView>
          </View>
        )}

        {/* 하단 메인 툴바 */}
        {/* 여기에 insets.bottom 을 더하지 마라 — 이중 가산이 된다.
            루트가 <SafeAreaView style={st.safe}>(위쪽)인데 edges prop 이 없어
            safe-area-context 기본값(top/left/bottom/right 전부 'additive')이 적용되고,
            st.safe 에는 이를 상쇄할 paddingBottom 이 없다. 즉 이 툴바 아래에는
            insets.bottom 이 이미 한 번 깔려 있다. 툴바는 KAV 의 최하단이고
            그 뒤는 전부 Modal(레이아웃 미점유)이라 SafeAreaView 콘텐츠의 시각적 바닥이다.
            같은 구조인 DMScreen 의 st.inputBar 도 인셋을 더하지 않는다.
            저장소의 insets.bottom + 12 선례들은 전부 Modal 안이거나 SafeAreaView 가 없는 화면이다. */}
        <View style={st.toolbar}>
          <View style={st.mainToolRow}>
            <ToolBtn icon={<CameraIcon size={22} color="#A1A1B0" />} label={t('blog.photo')} onPress={() => { setPhotoMenuVisible(!photoMenuVisible); setFontBarVisible(false); setHeadingBarVisible(false); setMoreMenuVisible(false); }} />
            <ToolBtn icon="Aa" label={t('blog.font')} onPress={() => { setFontBarVisible(!fontBarVisible); setPhotoMenuVisible(false); setHeadingBarVisible(false); setMoreMenuVisible(false); }} />
            <ToolBtn icon="☰" label={t('blog.lineCleanup')} onPress={() => { setHeadingBarVisible(!headingBarVisible); setPhotoMenuVisible(false); setFontBarVisible(false); setMoreMenuVisible(false); }} />
            <TouchableOpacity style={st.toolBtn} onPress={() => { setPhotoMenuVisible(false); setFontBarVisible(false); setHeadingBarVisible(false); setMoreMenuVisible(false); setTravelInfoVisible(true); }} activeOpacity={0.6}>
              <View style={st.toolIcon}>
                <SvgPlaneIcon size={22} color="#A1A1B0" />
                {travelRequired && <View style={st.toolRequiredDot} />}
              </View>
              <Text style={st.toolLabel}>{`${t('blog.travel')}${travelInfoCount > 0 ? ` ${travelInfoCount}` : ''}`}</Text>
            </TouchableOpacity>
            <ToolBtn icon="≡" label={t('blog.more')} onPress={() => { setMoreMenuVisible(!moreMenuVisible); setPhotoMenuVisible(false); setFontBarVisible(false); setHeadingBarVisible(false); }} />
            <View style={st.toolbarSpacer} />
            {!isEdit && (
              <TouchableOpacity style={[st.toolbarDraftBtn, { borderColor: skinAccent.tint(0.3) }]} onPress={() => handleDraftSave(false)} activeOpacity={0.7}>
                <Text style={st.toolbarDraftText}>{t('blog.draft')}</Text>
              </TouchableOpacity>
            )}
            {!isEdit && blogDrafts.length > 0 && (
              <TouchableOpacity style={[st.toolbarDraftListBtn, { backgroundColor: skinAccent.tint(0.15) }]} onPress={() => setDraftListVisible(true)} activeOpacity={0.7}>
                <Text style={[st.toolbarDraftListText, { color: skinAccent.accent }]}>{t('blog.listN', { count: blogDrafts.length })}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* ─── 모달들 ─── */}

      {/* 글자색 */}
      <PickerModal visible={colorPickerVisible} onClose={() => setColorPickerVisible(false)} title={t('blog.textColor')}>
        <View style={st.colorGrid}>
          {TEXT_COLORS.map(c => (
            <TouchableOpacity key={c} style={[st.colorDot, { backgroundColor: c }, atb?.color === c && [st.colorDotActive, { borderColor: skinAccent.accent }]]}
              onPress={() => setBlockColor(c)} />
          ))}
        </View>
      </PickerModal>

      {/* 배경색 */}
      <PickerModal visible={bgColorPickerVisible} onClose={() => setBgColorPickerVisible(false)} title={t('blog.bgColor')}>
        <View style={st.colorGrid}>
          {BG_COLORS.map((c, i) => (
            <TouchableOpacity key={i} style={[st.colorDot, { backgroundColor: c === 'transparent' ? '#333' : c, borderStyle: c === 'transparent' ? 'dashed' : 'solid' },
              atb?.bgColor === c && [st.colorDotActive, { borderColor: skinAccent.accent }]]}
              onPress={() => setBlockBgColor(c)}>
              {c === 'transparent' && <Text style={{ color: C.dim, fontSize: 10 }} {...andFitText}>{t('blog.none')}</Text>}
            </TouchableOpacity>
          ))}
        </View>
      </PickerModal>

      {/* 글꼴 크기 */}
      <PickerModal visible={fontSizePickerVisible} onClose={() => setFontSizePickerVisible(false)} title={t('blog.fontSize')}>
        {FONT_SIZE_OPTIONS.map(opt => (
          <TouchableOpacity key={opt.size} style={[st.pickerOption, atb?.fontSize === opt.size && [st.pickerOptionActive, { backgroundColor: skinAccent.tint(0.12) }]]}
            onPress={() => setBlockFontSize(opt.size)}>
            <Text style={[st.pickerOptionText, { fontSize: opt.size }, atb?.fontSize === opt.size && [st.pickerOptionTextActive, { color: skinAccent.accent }]]}>{t((FONT_SIZE_KEY[opt.size] ?? opt.label) as any)}</Text>
            {atb?.fontSize === opt.size && <Text style={[st.checkMark, { color: skinAccent.accent }]}>✓</Text>}
          </TouchableOpacity>
        ))}
      </PickerModal>

      {/* 글꼴 종류 */}
      <PickerModal visible={fontPickerVisible} onClose={() => setFontPickerVisible(false)} title={t('blog.fontFamily')}>
        {FONT_OPTIONS.map(opt => (
          <TouchableOpacity key={opt.value} style={[st.pickerOption, atb?.fontFamily === opt.value && [st.pickerOptionActive, { backgroundColor: skinAccent.tint(0.12) }]]}
            onPress={() => setBlockFontFamily(opt.value)}>
            <Text style={[st.pickerOptionText, opt.value !== 'System' && { fontFamily: opt.value }, atb?.fontFamily === opt.value && [st.pickerOptionTextActive, { color: skinAccent.accent }]]}>{opt.value === 'System' ? t('comp2.fontDefault') : opt.label}</Text>
            {atb?.fontFamily === opt.value && <Text style={[st.checkMark, { color: skinAccent.accent }]}>✓</Text>}
          </TouchableOpacity>
        ))}
      </PickerModal>

      {/* 구분선 스타일 */}
      <PickerModal visible={sepStylePickerVisible} onClose={() => setSepStylePickerVisible(false)} title={t('blog.sepStyle')}>
        {SEP_STYLES.map(opt => (
          <TouchableOpacity key={opt.value} style={st.pickerOption} onPress={() => handleAddSeparator(opt.value)}>
            <Text style={st.pickerOptionText}>{sepLabel(opt.value)}</Text>
          </TouchableOpacity>
        ))}
      </PickerModal>

      {/* 링크 입력 */}
      <PickerModal visible={linkModalVisible} onClose={() => setLinkModalVisible(false)} title={t('blog.insertLink')}>
        <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC" style={st.schedInput} placeholder="https://..." placeholderTextColor={C.muted}
          value={linkUrl} onChangeText={setLinkUrl} autoCapitalize="none" keyboardType="url" />
        <TouchableOpacity style={[st.schedConfirmBtn, { backgroundColor: skinAccent.accentDeep }]} onPress={handleAddLink}>
          <Text style={st.schedConfirmText} {...andFitText}>{t('blog.insert')}</Text>
        </TouchableOpacity>
      </PickerModal>

      {/* 부제목 입력 */}
      <PickerModal visible={subtitleModalVisible} onClose={() => setSubtitleModalVisible(false)} title={t('blog.subtitle')}>
        <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC" style={st.schedInput} placeholder={t('blog.subtitlePlaceholder')} placeholderTextColor={C.muted}
          value={subtitleDraft} onChangeText={setSubtitleDraft} maxLength={60} autoFocus />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {!!subtitle.trim() && (
            <TouchableOpacity style={[st.schedConfirmBtn, { flex: 1, backgroundColor: '#2E2E3B' }]} onPress={() => { setSubtitle(''); setSubtitleModalVisible(false); }}>
              <Text style={[st.schedConfirmText, { color: '#A1A1B0' }]} {...andFitText}>{t('blog.subtitleRemove')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[st.schedConfirmBtn, { flex: 1, backgroundColor: skinAccent.accentDeep }]} onPress={() => { setSubtitle(subtitleDraft.trim()); setSubtitleModalVisible(false); }}>
            <Text style={st.schedConfirmText} {...andFitText}>{t('common.confirm')}</Text>
          </TouchableOpacity>
        </View>
      </PickerModal>

      {/* 여행정보 패널 */}
      <Modal visible={travelInfoVisible} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => setTravelInfoVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} accessibilityViewIsModal>
        <View style={{ flex: 1 }}>
          {/* backdrop을 패널의 형제(뒤 절대배치)로 둬야 내부 ScrollView 스크롤이 씹히지 않는다.
              패널을 TouchableOpacity로 감싸고 onStartShouldSetResponder로 막던 방식은 스크롤 제스처를 가로챘음 */}
          <TouchableOpacity style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.6)' }]} activeOpacity={1} onPress={() => setTravelInfoVisible(false)} />
          {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) */}
          <View style={[st.travelPanel, { paddingBottom: Platform.OS === 'ios' ? 30 : insets.bottom + 18 }]}>
            <View style={st.panelHandle} />
            <ScrollView ref={travelScrollRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={st.panelTitle}>{t('blog.travelInfoTitle')}</Text>

              {/* 날짜 */}
              <PanelRow label="" icon={<SvgCalendarIcon size={18} color={skinAccent.accent} />} labelText={t('blog.date')} required>
                <TouchableOpacity
                  style={st.dateBtn}
                  onPress={() => setCalendarVisible(true)}
                  activeOpacity={0.85}
                >
                  <View style={st.dateBtnCol}>
                    <Text style={st.dateBtnLabel} {...andFitText}>{t('blog.departDate')}</Text>
                    <Text style={st.dateBtnVal}>{startDate || '—'}</Text>
                  </View>
                  <Text style={st.dateBtnArrow}>→</Text>
                  <View style={st.dateBtnCol}>
                    <Text style={st.dateBtnLabel} {...andFitText}>{t('blog.arriveDate')}</Text>
                    <Text style={st.dateBtnVal}>{endDate || '—'}</Text>
                  </View>
                  <View style={{ marginLeft: 10 }}><SvgCalendarIcon size={18} color={skinAccent.accent} /></View>
                </TouchableOpacity>
              </PanelRow>

              {/* 동행자 (필수) */}
              <PanelRow label="" icon={<SvgFriendIcon size={18} color={skinAccent.accent} />} labelText={t('blog.companionSelect')} required>
                <View style={st.chipRow}>
                  {COMPANIONS.map(comp => {
                    const isActive = companions.includes(comp);
                    const iconColor = isActive ? skinAccent.accent : C.dim;
                    return (
                      <TouchableOpacity key={comp} style={[st.chip, isActive && [st.chipActive, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.tint(0.3) }]]} onPress={() => toggleCompanion(comp)}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          {COMPANION_ICON_MAP[comp]?.(iconColor)}
                          <Text style={[st.chipText, isActive && [st.chipTextActive, { color: skinAccent.accent }]]}>{companionLabel(comp)}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {companionFriends.length > 0 && (
                  <View style={[st.chipRow, { marginTop: 8 }]}>
                    {companionFriends.map(friend => (
                      <View key={friend} style={[st.friendChip, { backgroundColor: skinAccent.accentDeep, borderColor: skinAccent.accent }]}>
                        <View style={[st.friendChipAvatar, { backgroundColor: skinAccent.tint(0.3) }]}>
                          <Text style={st.friendChipAvatarTxt}>{friend[0]}</Text>
                        </View>
                        <Text style={[st.friendChipName, { color: skinAccent.accent }]}>{friend}</Text>
                        <TouchableOpacity onPress={() => removeCompanionFriend(friend)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                          <Text style={{ color: C.muted, fontSize: 10 }}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                <TouchableOpacity style={[st.addFriendBtn, { borderColor: skinAccent.tint(0.3) }]} onPress={() => setFriendPickerVisible(true)} activeOpacity={0.75}>
                  <SvgFriendIcon size={16} color={skinAccent.accent} />
                  <Text style={[st.addFriendTxt, { color: skinAccent.accent }]}>{t('blog.addAppFriend')}</Text>
                  {companionFriends.length > 0 && (
                    <View style={[st.addFriendBadge, { backgroundColor: skinAccent.accentDeep }]}><Text style={st.addFriendBadgeTxt}>{companionFriends.length}</Text></View>
                  )}
                </TouchableOpacity>
              </PanelRow>

              {/* 별점 (필수) */}
              <PanelRow label="" icon={null} labelText={t('blog.rating')} required>
                <View style={st.ratingWrap}>
                  {renderStars()}
                  {rating > 0
                    ? <Text style={[st.ratingScore, { color: skinAccent.accent }]}>{rating.toFixed(1)} / 5.0</Text>
                    : <Text style={st.ratingScoreEmpty}>{t('blog.ratingEmpty')}</Text>}
                </View>
              </PanelRow>

              {/* 공개 범위 */}
              <PanelRow label="" icon={<LockOpenIcon size={18} color={skinAccent.accent} />} labelText={t('blog.visibility')}>
                <View style={st.chipRow}>
                  {VISIBILITY_OPTIONS.map(opt => {
                    const isActive = visibility === opt.value;
                    return (
                      <TouchableOpacity key={opt.value} style={[st.chip, isActive && [st.chipActive, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.tint(0.3) }]]} onPress={() => setVisibility(opt.value)}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          {VISIBILITY_ICON_MAP[opt.value]?.(isActive ? skinAccent.accent : C.dim)}
                          <Text style={[st.chipText, isActive && [st.chipTextActive, { color: skinAccent.accent }]]}>{visibilityLabel(opt.value)}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </PanelRow>
              {/* 칩 라벨('메이트만')과 실제 처리 범위가 어긋나지 않게 붙이는 안내 — i18n 주석 참조 */}
              <Text style={st.visNotice}>
                {visibility === 'private' ? t('newRecord.visNoticePrivate') : t('newRecord.visNoticeNeighbors')}
              </Text>

              {/* 구분선 */}
              <View style={st.optDivider} />
              <Text style={st.optNotice}>{t('blog.optionalNotice')}</Text>

              {/* 예산 */}
              <PanelRow label="" icon={<SvgCoinIcon size={18} color={skinAccent.accent} />} labelText={t('blog.budget')}>
                <View style={st.budgetRow}>
                  {CURRENCIES.map(c => (
                    <TouchableOpacity key={c} style={[st.currencyChip, currency === c && [st.currencyChipActive, { backgroundColor: skinAccent.accentDeep, borderColor: skinAccent.accent }]]} onPress={() => chooseCurrency(c)}>
                      <Text style={[st.currencyTxt, currency === c && [st.currencyTxtActive, { color: skinAccent.accent }]]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={[st.currencyChip, !CURRENCIES.includes(currency) && [st.currencyChipActive, { backgroundColor: skinAccent.accentDeep, borderColor: skinAccent.accent }]]}
                    onPress={() => { setCurrencySearch(''); setCurrencyModalVisible(true); }}
                  >
                    <Text style={[st.currencyTxt, !CURRENCIES.includes(currency) && [st.currencyTxtActive, { color: skinAccent.accent }]]}>
                      {CURRENCIES.includes(currency) ? t('blog.otherCurrency') : currency}
                    </Text>
                  </TouchableOpacity>
                  <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC" style={st.budgetInput} placeholder={t('blog.amountPlaceholder')} placeholderTextColor={C.muted}
                    value={budget} onChangeText={v => setBudget(v.replace(/[^0-9]/g, ''))} keyboardType="numeric" maxLength={12} />
                </View>
              </PanelRow>

              {/* 날씨 */}
              <PanelRow label="" icon={<SvgWeatherIcon size={18} color={skinAccent.accent} />} labelText={t('blog.weather')}>
                <View style={st.chipRow}>
                  {WEATHER_OPTIONS.map(w => {
                    const isActive = weather === w.value;
                    return (
                      <TouchableOpacity key={w.value} style={[st.chip, isActive && [st.chipActive, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.tint(0.3) }]]} onPress={() => setWeather(isActive ? '' : w.value)}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          {WEATHER_ICON_MAP[w.value]}
                          <Text style={[st.chipText, isActive && [st.chipTextActive, { color: skinAccent.accent }]]}>{weatherLabel(w.value)}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </PanelRow>

              {/* 직항/경유 */}
              <PanelRow label="" icon={<SvgPlaneIcon size={18} color={skinAccent.accent} />} labelText={t('blog.flightTitle')}>
                <View style={st.chipRow}>
                  {FLIGHT_OPTIONS.map(f => {
                    const isActive = flightType === f;
                    return (
                      <TouchableOpacity key={f} style={[st.chip, isActive && [st.chipActive, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.tint(0.3) }]]} onPress={() => setFlightType(isActive ? '' : f)}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          {f === '직항'
                            ? <SvgTakeoffIcon size={14} color={isActive ? skinAccent.accent : C.dim} />
                            : <SvgTransferIcon size={14} color={isActive ? skinAccent.accent : C.dim} />}
                          <Text style={[st.chipText, isActive && [st.chipTextActive, { color: skinAccent.accent }]]}>{flightLabel(f)}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </PanelRow>

              {/* 키워드 */}
              <PanelRow label="" icon={<SvgTagIcon size={18} color={skinAccent.accent} />} labelText={t('blog.keyword')}>
                <View style={st.kwWrap}>
                  {keywords.length > 0 && (
                    <View style={st.kwTagRow}>
                      {keywords.map(kw => (
                        <TouchableOpacity key={kw} style={[st.kwTag, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.tint(0.35) }]} onPress={() => setKeywords(prev => prev.filter(k => k !== kw))}>
                          <Text style={[st.kwTagText, { color: skinAccent.accent }]}>#{kw}</Text>
                          <Text style={st.kwTagDel}> ✕</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC" style={st.kwInput} placeholder={t('comp2.keywordPlaceholder')} placeholderTextColor={C.muted}
                    value={keywordInput} onChangeText={v => {
                      if (v.endsWith(' ')) {
                        // 중복 검사도 '#' 제거 후 값으로 — 제거 전 값(#seoul)로 검사하고 제거 후
                        // 값(seoul)을 저장하면 같은 태그가 중복 저장돼 key 충돌·이중 삭제가 났다.
                        // (엔터 경로 addKeyword와 동일 규칙 — stripHash 공용)
                        const tag = stripHash(v);
                        if (tag && !keywords.includes(tag) && keywords.length < 10) {
                          setKeywords(prev => [...prev, tag]);
                        }
                        setKeywordInput('');
                      } else {
                        setKeywordInput(v);
                      }
                    }}
                    onFocus={() => setTimeout(() => travelScrollRef.current?.scrollToEnd({ animated: true }), 300)}
                    returnKeyType="done" onSubmitEditing={addKeyword} />
                </View>
              </PanelRow>

              {/* 메모 (비공개) */}
              <PanelRow label="" icon={null} labelText={t('blog.memoLabel')}>
                <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC" style={st.memoInput} placeholder={t('blog.memoPlaceholder')} placeholderTextColor={C.muted}
                  value={memo} onChangeText={setMemo} multiline textAlignVertical="top"
                  onFocus={() => setTimeout(() => travelScrollRef.current?.scrollToEnd({ animated: true }), 300)} />
              </PanelRow>

              <View style={{ height: 120 }} />
            </ScrollView>
            <TouchableOpacity onPress={() => setTravelInfoVisible(false)} activeOpacity={0.85} style={st.panelDoneWrap}>
              <LinearGradient colors={skinAccent.btnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.panelDoneBtn}>
                <Text style={st.panelDoneText}>{t('common.done')}</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* 캘린더 — 공용 CalendarBottomSheet. 여행정보 패널이 이미 Modal이라 asOverlay로 렌더 (iOS Modal-in-Modal 회피) */}
            <CalendarBottomSheet
              visible={calendarVisible}
              initialStart={startDateObj}
              initialEnd={endDateObj}
              onConfirm={handleCalendarConfirm}
              onClose={() => setCalendarVisible(false)}
              recordedDates={recordedDates}
              recordedRanges={recordedRanges}
              onSelectRecordedTrip={isEdit ? undefined : applySourceRecord}
              asOverlay
            />

            {/* 앱 메이트 선택 오버레이 (여행정보 패널 위에 표시) */}
            {friendPickerVisible && (
              <View style={st.calOverlay}>
                <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setFriendPickerVisible(false)} />
                {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) */}
                <View style={[st.friendPickerSheet, { paddingBottom: Platform.OS === 'ios' ? 30 : insets.bottom + 18 }]}>
                  <View style={st.panelHandle} />
                  <Text style={st.panelTitle}>{t('blog.appFriendSelect')}</Text>
                  <ScrollView style={{ maxHeight: 300 }}>
                    {friendNames.length === 0 ? (
                      <Text style={{ color: '#A1A1B0', fontSize: 13, textAlign: 'center', paddingVertical: 28 }}>
                        {t('blog.noFollowedFriends')}
                      </Text>
                    ) : friendNames.map(friend => {
                      const isSelected = companionFriends.includes(friend);
                      return (
                        <TouchableOpacity
                          key={friend}
                          style={[st.friendPickerItem, isSelected && { backgroundColor: skinAccent.tint(0.12), borderColor: skinAccent.tint(0.5) }]}
                          onPress={() => toggleCompanionFriend(friend)}
                          activeOpacity={0.75}
                        >
                          <View style={[st.friendPickerAvatar, isSelected && { backgroundColor: skinAccent.tint(0.3) }]}>
                            <Text style={[st.friendPickerAvatarTxt, isSelected && { color: skinAccent.accent }]}>{friend[0]}</Text>
                          </View>
                          <Text style={[st.friendPickerName, isSelected && st.friendPickerNameOn]} numberOfLines={1}>{friend}</Text>
                          <View style={[st.friendPickerCheck, isSelected && [st.friendPickerCheckActive, { backgroundColor: skinAccent.accent, borderColor: skinAccent.accent }]]}>
                            {isSelected && <SheetCheck />}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <TouchableOpacity onPress={() => setFriendPickerVisible(false)} activeOpacity={0.85} style={st.panelDoneWrap}>
                    <LinearGradient colors={skinAccent.btnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.panelDoneBtn}>
                      <Text style={st.panelDoneText}>{t('common.done')}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* 기타 통화 선택 오버레이 (여행정보 패널 위에 표시) */}
            {currencyModalVisible && (
              <View style={st.calOverlay}>
                <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setCurrencyModalVisible(false)} />
                {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) */}
                <View style={[st.currModalSheet, { paddingBottom: Platform.OS === 'ios' ? 30 : insets.bottom + 18 }]}>
                  <View style={st.panelHandle} />
                  <Text style={st.panelTitle}>{t('blog.currencySelect')}</Text>
                  <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                    style={st.currModalSearch}
                    value={currencySearch}
                    onChangeText={setCurrencySearch}
                    placeholder={t('blog.currencySearchPlaceholder')}
                    placeholderTextColor={C.muted}
                    autoFocus
                  />
                  <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
                    {OTHER_CURRENCIES
                      .filter(c => {
                        const q = currencySearch.trim().toLowerCase();
                        return !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
                      })
                      .map((c) => {
                        const on = currency === c.code;
                        return (
                          <TouchableOpacity
                            key={c.code}
                            style={[st.currModalItem, on && { backgroundColor: skinAccent.tint(0.12), borderColor: skinAccent.tint(0.5) }]}
                            onPress={() => { chooseCurrency(c.code); setCurrencyModalVisible(false); }}
                            activeOpacity={0.75}
                          >
                            <Text style={[st.currModalCode, { color: skinAccent.accent }]}>{c.code}</Text>
                            <Text style={[st.currModalName, on && { color: C.white, fontWeight: '600' }]}>{c.name}</Text>
                            {on && (
                              <View style={[st.friendPickerCheck, { backgroundColor: skinAccent.accent, borderColor: skinAccent.accent }]}>
                                <SheetCheck />
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                  </ScrollView>
                </View>
              </View>
            )}
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>


      {/* 국가 모달 */}
      <Modal visible={countryModalVisible} animationType="slide" onRequestClose={closeCountryModal}>
        <SafeAreaView style={st.modalSafe} accessibilityViewIsModal>
          <View style={st.modalHeader}>
            <TouchableOpacity onPress={closeCountryModal}><Text style={[st.modalClose, { color: skinAccent.accent }]}>{t('common.close')}</Text></TouchableOpacity>
            <Text style={st.modalTitle}>{t('blog.countrySelectTitle')}</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* 검색 — autoFocus는 두지 않는다. 모달을 열자마자 키보드가 목록 절반을 가려
              대륙별로 훑어보는 사용 방식을 막았다. 검색이 필요하면 탭 한 번이면 된다. */}
          <View style={st.searchWrap}>
            <View style={st.searchBox}>
              <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
                style={st.searchField}
                placeholder={t('blog.countrySearchPlaceholder')}
                placeholderTextColor={C.muted}
                value={countrySearch}
                onChangeText={setCountrySearch}
                returnKeyType="search"
              />
              {countrySearch.length > 0 && (
                <TouchableOpacity onPress={() => setCountrySearch('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={st.searchClear}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* 선택한 국가 — 목록 안에서는 대륙별로 흩어져 무엇을 골랐는지 확인이 안 됐다.
              여기서 바로 확인·해제할 수 있게 하고, 첫 번째가 대표 국가임을 표시한다. */}
          {selectedCountries.length > 0 && (
            <View style={st.pickedWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={st.pickedRow}
              >
                {selectedCountries.map((c, idx) => (
                  <TouchableOpacity
                    key={c.name}
                    style={[st.pickedChip, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.tint(0.35) }]}
                    onPress={() => toggleCountry(c)}
                    activeOpacity={0.75}
                  >
                    {idx === 0 && (
                      <Text style={[st.pickedRep, { color: skinAccent.accent, backgroundColor: skinAccent.tint(0.25) }]}>
                        {t('newRecord.repBadge')}
                      </Text>
                    )}
                    <Text style={[st.pickedTxt, { color: skinAccent.accent }]}>
                      {c.flag} {countryLabel(c.name, i18n.language)}
                    </Text>
                    <Text style={[st.pickedX, { color: skinAccent.accent }]}>✕</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={st.pickedCount}>
                {t('newRecord.countrySelectedDone', { count: selectedCountries.length })}
                {selectedCountries.length < MAX_COUNTRIES ? t('newRecord.countryCanAdd') : t('newRecord.countryMax')}
              </Text>
            </View>
          )}

          {/* keyboardShouldPersistTaps — 키보드가 떠 있을 때 국가를 탭하면 첫 탭이
              키보드 닫기에 먹혀 선택이 되지 않던 문제를 막는다. */}
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {groupedCountries.length === 0 ? (
              <Text style={st.countryEmpty}>{t('blog.countryNoResult')}</Text>
            ) : groupedCountries.map(g => (
              <View key={g.continent}>
                <Text style={st.continentLabel}>{continentLabel(g.continent, i18n.language)}</Text>
                {g.countries.map(country => {
                  const picked = selectedCountries.some(p => p.name === country.name);
                  // 최대치에 도달하면 미선택 국가는 탭해도 아무 일이 없었다 — 눌리지 않음을 눈으로 보여준다
                  const blocked = !picked && selectedCountries.length >= MAX_COUNTRIES;
                  return (
                    <TouchableOpacity
                      key={country.name}
                      style={[
                        st.countryItem,
                        picked && [st.countryItemActive, { backgroundColor: skinAccent.tint(0.1) }],
                        blocked && st.countryItemBlocked,
                      ]}
                      disabled={blocked}
                      onPress={() => toggleCountry(country)}
                    >
                      <Text style={st.countryItemText}>
                        {country.flag} {countryLabel(country.name, i18n.language)}
                      </Text>
                      {picked && <Text style={[st.countryItemCheck, { color: skinAccent.accent }]}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>


      {/* 임시저장 목록 — 비공개 대상 선택 시트와 같은 디자인 언어(카드형 행·아이콘 배지·그라데이션 CTA) */}
      <Modal visible={draftListVisible} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => setDraftListVisible(false)}>
        <View style={st.dlOverlay} accessibilityViewIsModal>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setDraftListVisible(false)} />
          {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) */}
          <View style={[st.dlSheet, { paddingBottom: Platform.OS === 'ios' ? 30 : insets.bottom + 18 }]}>
            <View style={st.dlHandle} />

            <View style={st.dlHeader}>
              <View style={[st.dlHeaderIcon, { backgroundColor: skinAccent.tint(0.14), borderColor: skinAccent.tint(0.3) }]}>
                <SvgArchiveIcon size={18} color={skinAccent.accent} />
              </View>
              <Text style={st.dlTitle}>{t('blog.draftListTitle')}</Text>
              {blogDrafts.length > 0 && (
                <View style={[st.dlCountPill, { backgroundColor: skinAccent.tint(0.16), borderColor: skinAccent.tint(0.35) }]}>
                  <Text style={[st.dlCountTxt, { color: skinAccent.accent }]}>{blogDrafts.length}</Text>
                </View>
              )}
            </View>

            {blogDrafts.length === 0 ? (
              <View style={st.dlEmptyWrap}>
                <SvgArchiveIcon size={30} color={C.muted} />
                <Text style={st.dlEmptyTxt}>{t('blog.noDrafts')}</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={st.dlScroll}>
                {blogDrafts.map(draft => {
                  const draftDate = new Date(draft.timestamp);
                  const dateLabel = `${draftDate.getMonth() + 1}/${draftDate.getDate()} ${String(draftDate.getHours()).padStart(2, '0')}:${String(draftDate.getMinutes()).padStart(2, '0')}`;
                  const preview = draft.content || t('blog.noContent');
                  const isCurrent = draftId === draft.id;
                  return (
                    <View
                      key={draft.id}
                      style={[st.dlItem, isCurrent && { backgroundColor: skinAccent.tint(0.1), borderColor: skinAccent.accent }]}
                    >
                      <TouchableOpacity style={st.dlItemMain} onPress={() => loadDraft(draft)} activeOpacity={0.75}>
                        <View style={st.dlItemHead}>
                          <Text style={[st.dlItemTitle, isCurrent && st.dlItemTitleOn]} numberOfLines={1}>
                            {preview.length > 30 ? preview.slice(0, 30) + '...' : preview}
                          </Text>
                          {isCurrent && (
                            <Text style={[st.dlBadge, { color: skinAccent.accent, backgroundColor: skinAccent.tint(0.2) }]}>
                              {t('blog.editing')}
                            </Text>
                          )}
                        </View>
                        <View style={st.dlItemMeta}>
                          {draft.countryFlag ? (
                            <Text style={st.dlMetaCountry}>{draft.countryFlag} {countryLabel(draft.countryName, i18n.language)}</Text>
                          ) : null}
                          <Text style={st.dlMetaDate}>{dateLabel}</Text>
                          {/* 만료 임박 안내 — 목록에서 눈에 걸리도록 알약으로 */}
                          <View style={st.dlExpiryPill}>
                            <Text style={st.dlExpiryTxt}>{draftDaysLeft(draft.timestamp)}</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={st.dlDeleteBtn}
                        onPress={() => handleDeleteDraft(draft.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <SvgTrashIcon size={16} color="#FF3B30" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            <TouchableOpacity onPress={() => setDraftListVisible(false)} activeOpacity={0.85} style={st.dlDoneWrap}>
              <LinearGradient colors={skinAccent.btnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.dlDoneBtn}>
                <Text style={st.dlDoneTxt}>{t('common.close')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 인앱 카메라 촬영 (expo-camera) — 촬영 후 이미지 블록 삽입 */}
      <CameraCaptureModal
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(uri) => { void handleCameraCaptured(uri); }}
      />

      {/* 토스트 */}
      {toastMsg !== '' && (
        <View style={st.toast} pointerEvents="none"><Text style={st.toastText}>{toastMsg}</Text></View>
      )}

      <FullScreenImageViewer images={fullImgList} initialIndex={fullImgIndex} visible={fullImgVisible} onClose={() => setFullImgVisible(false)} />

      <AutoTocModal
        visible={tocModalVisible}
        suggestions={tocSuggestions}
        onConfirm={(accepted) => {
          setTocModalVisible(false);
          publish(applyTocSuggestions(blocks, accepted));
        }}
        onSkip={() => {
          setTocModalVisible(false);
          publish(blocks);
        }}
        onClose={() => setTocModalVisible(false)}
      />

      <PrivacyModal
        visible={privacyModalVisible}
        selectedFriends={privateFriends}
        allFriends={friendNames}
        onToggle={togglePrivateFriend}
        onSetAll={setPrivateFriendsAll}
        onClose={() => setPrivacyModalVisible(false)}
        desc={t('blog.privacyDesc')}
        allPrivateDesc={t('blog.allPrivateDesc')}
      />

      <RepPhotoModal
        visible={repPhotoModalVisible}
        photos={[...blocksToPhotos(blocks), ...blocksToVideoThumbnails(blocks)]}
        selectedPhoto={representativePhoto}
        onSelect={(uri, original) => { if (uri && original) originalUriMapRef.current[uri] = original; setRepresentativePhoto(uri); }}
        onClose={() => setRepPhotoModalVisible(false)}
      />

      {/* ✨ 여행 기억 — 선택 국가·날짜에 매칭되는 순간 목록 (헤더 버튼으로 열림) */}
      <MomentListSheet
        visible={momentSheetVisible}
        onClose={() => setMomentSheetVisible(false)}
        moments={matchedMoments}
        tripTitle={
          selectedCountries.length > 0
            ? `${selectedCountries[0].flag} ${selectedCountries[0].name}`
            : ''
        }
      />

    </SafeAreaView>
  );

  // ─── 블록 렌더 함수 ───
  function renderBlock(block: BlogBlock, index: number) {
    switch (block.type) {
      case 'text': {
        const tb = block as TextBlock;
        // 커스텀 한글 서체(단일 굵기 파일)에 fontWeight를 얹으면 안드로이드는 해당 굵기
        // 변형을 찾다 실패해 시스템 폰트로 통째로 폴백한다 → 안드로이드는 서체 유지 우선.
        // 고정 lineHeight 26은 '제목급'(26px)에서 한글 상하가 잘려 글자 크기에 비례시킨다.
        const customFam = tb.fontFamily && tb.fontFamily !== 'System' ? tb.fontFamily : undefined;
        return (
          <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC" key={block.id}
            ref={ref => { blockRefs.current[block.id] = ref; }}
            style={[st.textBlock, {
              fontSize: tb.fontSize || 15, textAlign: tb.align || 'left',
              lineHeight: Math.max(26, Math.round((tb.fontSize || 15) * 1.4)),
              fontWeight: customFam && Platform.OS === 'android' ? 'normal' : (tb.bold ? '700' : '400'),
              fontStyle: tb.italic ? 'italic' : 'normal',
              textDecorationLine: tb.underline ? (tb.strikethrough ? 'underline line-through' : 'underline') : (tb.strikethrough ? 'line-through' : 'none'),
              color: tb.color || C.white,
              backgroundColor: tb.bgColor && tb.bgColor !== 'transparent' ? tb.bgColor : undefined,
              fontFamily: customFam,
            }]}
            placeholder={index === 0 && blocks.length === 1 ? t('blog.bodyPlaceholder') : ''}
            placeholderTextColor={C.muted}
            value={tb.value} onChangeText={v => updateBlock(block.id, { value: v } as any)}
            onFocus={() => setActiveBlockId(block.id)} multiline textAlignVertical="top" scrollEnabled={false} />
        );
      }
      case 'heading': {
        const hb = block as HeadingBlock;
        const sizes = { 1: 26, 2: 22, 3: 18 };
        return (
          <View key={block.id} style={st.headingWrap}>
            <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
              ref={ref => { blockRefs.current[block.id] = ref; }}
              style={[st.headingInput, { fontSize: sizes[hb.level], textAlign: hb.align || 'left' }]}
              placeholder={t('blog.headingPlaceholder', { level: hb.level })} placeholderTextColor={C.muted}
              value={hb.value} onChangeText={v => updateBlock(block.id, { value: v } as any)}
              onFocus={() => setActiveBlockId(block.id)} multiline scrollEnabled={false} />
            <TouchableOpacity style={st.blockRemoveBtn} onPress={() => deleteBlock(block.id)}>
              <Text style={st.blockRemoveText}>✕</Text>
            </TouchableOpacity>
          </View>
        );
      }
      case 'image': {
        const ib = block as ImageBlock;
        return (
          <View key={block.id} style={st.imageBlock}>
            <TouchableOpacity activeOpacity={0.85} onPress={() => openFullImage([ib.uri], 0)}>
              <Image source={{ uri: ib.uri }} style={st.imageBlockImg} resizeMode="cover" />
            </TouchableOpacity>
            <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC" style={st.captionInput} placeholder={t('blog.photoCaptionPlaceholder')} placeholderTextColor={C.muted}
              value={ib.caption || ''} onChangeText={v => updateBlock(block.id, { caption: v } as any)} />
            <TouchableOpacity style={st.imageRemoveBtn} onPress={() => deleteBlock(block.id)}>
              <Text style={st.imageRemoveText}>✕</Text>
            </TouchableOpacity>
          </View>
        );
      }
      case 'images': {
        const imb = block as ImagesBlock;
        const isSlide = imb.layout === 'slide';
        const cols = imb.layout === 'grid3' ? 3 : 2;
        const imgW = (SCREEN_W - 48 - (cols - 1) * 4) / cols;
        const slideW = SCREEN_W - 48;
        return (
          <View key={block.id} style={st.imagesBlock}>
            {isSlide ? (
              <SlideImageViewer items={imb.items} width={slideW} blockId={block.id} onCaptionChange={updateImagesItemCaption} onImagePress={openFullImage} />
            ) : (
              <View style={st.imagesGrid}>
                {imb.items.map((item, i) => (
                  <View key={i} style={{ width: imgW, marginRight: i % cols < cols - 1 ? 4 : 0, marginBottom: 4 }}>
                    <TouchableOpacity activeOpacity={0.85} onPress={() => openFullImage(imb.items.map(it => it.uri), i)}>
                      <Image source={{ uri: item.uri }} style={[st.gridImg, { width: imgW, height: imgW * 0.75 }]} resizeMode="cover" />
                    </TouchableOpacity>
                    <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC" style={st.gridCaptionInput} placeholder={t('blog.gridCaptionPlaceholder')} placeholderTextColor={C.muted}
                      value={item.caption || ''} onChangeText={v => updateImagesItemCaption(block.id, i, v)} />
                  </View>
                ))}
              </View>
            )}
            <View style={st.layoutBtnRow}>
              {(['grid2', 'grid3', 'slide'] as ImageLayout[]).map(l => (
                <TouchableOpacity key={l} style={[st.layoutBtn, imb.layout === l && [st.layoutBtnActive, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.accent }]]}
                  onPress={() => updateBlock(block.id, { layout: l } as any)}>
                  <Text style={[st.layoutBtnText, imb.layout === l && [st.layoutBtnTextActive, { color: skinAccent.accent }]]} {...andFitText}>
                    {l === 'grid2' ? t('blog.grid2') : l === 'grid3' ? t('blog.grid3') : t('blog.slide')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={st.imageRemoveBtn} onPress={() => deleteBlock(block.id)}>
              <Text style={st.imageRemoveText}>✕</Text>
            </TouchableOpacity>
          </View>
        );
      }
      case 'video': {
        const vb = block as VideoBlock;
        // 가져오기 자리 표시 — 위치만 알려주고 사용자가 자기 영상으로 채운다 (네이버 영상은 앱에서 재생 불가)
        if (vb.placeholder) {
          return (
            <View key={block.id} style={st.imageBlock}>
              <View style={[st.videoBlockPlayer, st.videoPlaceholder, { borderColor: skinAccent.tint(0.35) }]}>
                <Text style={{ fontSize: 34 }}>📹</Text>
                <Text style={st.videoPlaceholderTitle}>{t('blog.videoPlaceholderTitle')}</Text>
                <TouchableOpacity style={[st.videoPlaceholderBtn, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.tint(0.4) }]} activeOpacity={0.8} onPress={() => handleFillVideoPlaceholder(block.id)}>
                  <Text style={[st.videoPlaceholderBtnText, { color: skinAccent.accent }]} {...andFitText}>{t('blog.videoPlaceholderHint')}</Text>
                </TouchableOpacity>
                {!!vb.sourceUrl && (
                  <TouchableOpacity onPress={() => Linking.openURL(vb.sourceUrl!)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={st.videoPlaceholderLink}>{t('blog.videoPlaceholderOriginal')}</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={st.videoLabel}><Text style={st.videoLabelText}>▶ {t('blog.video')}</Text></View>
              <TouchableOpacity style={st.imageRemoveBtn} onPress={() => deleteBlock(block.id)}>
                <Text style={st.imageRemoveText}>✕</Text>
              </TouchableOpacity>
            </View>
          );
        }
        const isLocalVideo = vb.uri && (vb.uri.startsWith('file://') || vb.uri.startsWith('content://') || vb.uri.startsWith('/'));
        const isEmbedVideo = vb.uri && vb.uri.startsWith('http');
        // 네이버TV embed → 모바일 시청 페이지로 변환
        const getPlayableUrl = (uri: string) => {
          // tv.naver.com/embed/XXXXX → m.tv.naver.com/v/XXXXX
          const naverEmbedMatch = uri.match(/tv\.naver\.com\/embed\/([A-Za-z0-9]+)/);
          if (naverEmbedMatch) return `https://m.tv.naver.com/v/${naverEmbedMatch[1]}`;
          // player.naver.com → m.tv.naver.com/v/
          const playerMatch = uri.match(/player\.naver\.com[^"]*vid=([A-Za-z0-9]+)/);
          if (playerMatch) return `https://m.tv.naver.com/v/${playerMatch[1]}`;
          return uri;
        };
        const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
        return (
          <View key={block.id} style={st.imageBlock}>
            {isLocalVideo ? (
              <LocalVideoPlayer uri={vb.uri} style={st.videoBlockPlayer} />
            ) : isEmbedVideo ? (
              <View style={st.videoBlockPlayer}>
                <WebView
                  source={{ uri: getPlayableUrl(vb.uri) }}
                  style={{ flex: 1, backgroundColor: '#000' }}
                  userAgent={MOBILE_UA}
                  allowsInlineMediaPlayback={true}
                  mediaPlaybackRequiresUserAction={false}
                  allowsFullscreenVideo={true}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  scrollEnabled={false}
                  nestedScrollEnabled={false}
                  onError={() => console.warn('[WebView Video] load error')}
                />
              </View>
            ) : (
              <TouchableOpacity
                style={[st.videoBlockPlayer, { justifyContent: 'center', alignItems: 'center' }]}
                activeOpacity={0.7}
                onPress={() => { if (vb.uri) Linking.openURL(vb.uri); }}
              >
                <Text style={{ color: '#fff', fontSize: 40 }}>▶</Text>
                <Text style={{ color: C.dim, fontSize: 12, marginTop: 8 }} {...andFitText}>{t('blog.externalVideo')}</Text>
              </TouchableOpacity>
            )}
            <View style={st.videoLabel}>
              <Text style={st.videoLabelText}>▶ {t('blog.video')}</Text>
            </View>
            <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC" style={st.captionInput} placeholder={t('blog.videoCaptionPlaceholder')} placeholderTextColor={C.muted}
              value={vb.caption || ''} onChangeText={v => updateBlock(block.id, { caption: v } as any)} />
            <TouchableOpacity style={st.imageRemoveBtn} onPress={() => deleteBlock(block.id)}>
              <Text style={st.imageRemoveText}>✕</Text>
            </TouchableOpacity>
          </View>
        );
      }
      case 'separator': {
        const sb = block as SeparatorBlock;
        return (
          <TouchableOpacity key={block.id} style={st.sepBlock} activeOpacity={0.6} onLongPress={() => deleteBlock(block.id)}>
            {sb.style === 'line' && <View style={st.sepLine} />}
            {sb.style === 'dots' && (
              <View style={st.sepDotsRow}><View style={st.sepLine} /><View style={st.sepDots}><View style={[st.sepDot, { backgroundColor: skinAccent.accent }]} /><View style={[st.sepDot, { backgroundColor: skinAccent.accent }]} /><View style={[st.sepDot, { backgroundColor: skinAccent.accent }]} /></View><View style={st.sepLine} /></View>
            )}
            {sb.style === 'dashed' && <View style={[st.sepLine, { borderStyle: 'dashed', borderWidth: 1, borderColor: '#3A3A4A', height: 0 }]} />}
            {sb.style === 'thick' && <View style={[st.sepLine, { height: 3, backgroundColor: skinAccent.accent, opacity: 0.3 }]} />}
            {sb.style === 'space' && <View style={{ height: 40 }} />}
          </TouchableOpacity>
        );
      }
      case 'quote': {
        const qb = block as QuoteBlock;
        return (
          <View key={block.id} style={[st.quoteBlock, { backgroundColor: skinAccent.tint(0.06), borderLeftColor: skinAccent.accent }]}>
            <Text style={[st.quoteMark, { color: skinAccent.accent }]}>"</Text>
            <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC" ref={ref => { blockRefs.current[block.id] = ref; }}
              style={st.quoteInput} placeholder={t('blog.quotePlaceholder')} placeholderTextColor={C.muted}
              value={qb.value} onChangeText={v => updateBlock(block.id, { value: v } as any)}
              onFocus={() => setActiveBlockId(block.id)} multiline scrollEnabled={false} />
            <TouchableOpacity style={st.blockRemoveBtn} onPress={() => deleteBlock(block.id)}>
              <Text style={st.blockRemoveText}>✕</Text>
            </TouchableOpacity>
          </View>
        );
      }
      case 'link': {
        const lb = block as LinkBlock;
        return (
          <View key={block.id} style={st.linkBlock}>
            <LinkIcon size={16} color="#A1A1B0" />
            <Text style={st.linkUrl} numberOfLines={1}>{lb.url}</Text>
            <TouchableOpacity style={st.blockRemoveBtn} onPress={() => deleteBlock(block.id)}>
              <Text style={st.blockRemoveText}>✕</Text>
            </TouchableOpacity>
          </View>
        );
      }
      case 'file': {
        const fb = block as FileBlock;
        const sizeStr = fb.fileSize ? (fb.fileSize < 1024 * 1024 ? `${(fb.fileSize / 1024).toFixed(0)}KB` : `${(fb.fileSize / (1024 * 1024)).toFixed(1)}MB`) : '';
        return (
          <View key={block.id} style={st.fileBlock}>
            <PaperclipIcon size={20} color="#A1A1B0" />
            <View style={{ flex: 1 }}>
              <Text style={st.fileName} numberOfLines={1}>{fb.fileName}</Text>
              {sizeStr ? <Text style={st.fileSize}>{sizeStr}</Text> : null}
            </View>
            <TouchableOpacity style={st.blockRemoveBtn} onPress={() => deleteBlock(block.id)}>
              <Text style={st.blockRemoveText}>✕</Text>
            </TouchableOpacity>
          </View>
        );
      }
      default: return null;
    }
  }
}

// ─── 하위 컴포넌트 ───
function ToolBtn({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  const st = useSt();
  return (
    <TouchableOpacity style={st.toolBtn} onPress={onPress} activeOpacity={0.6}>
      <View style={st.toolIcon}>{typeof icon === 'string' ? <Text style={{ fontSize: 22, color: '#A1A1B0' }}>{icon}</Text> : icon}</View>
      <Text style={st.toolLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function ToolSep() { const st = useSt(); return <View style={st.toolSep} />; }

function SubMenuItem({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  const st = useSt();
  return (
    <TouchableOpacity style={st.subMenuItem} onPress={onPress} activeOpacity={0.6}>
      <View style={st.subMenuIcon}>{typeof icon === 'string' ? <Text style={{ fontSize: 20, color: '#A1A1B0' }}>{icon}</Text> : icon}</View>
      <Text style={st.subMenuLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function FormatBtn({ label, active, onPress, bold, italic, underline, strike, colorDot }: {
  label: string; active?: boolean; onPress: () => void;
  bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; colorDot?: string;
}) {
  const skinAccent = useSkinAccent();
  const st = useSt();
  return (
    <TouchableOpacity style={[st.fmtBtn, active && [st.fmtBtnActive, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.accent }]]} onPress={onPress} activeOpacity={0.6}>
      <Text style={[st.fmtBtnText,
        bold && { fontWeight: '900' }, italic && { fontStyle: 'italic' },
        underline && { textDecorationLine: 'underline' }, strike && { textDecorationLine: 'line-through' },
        active && { color: skinAccent.accent },
      ]}>{label}</Text>
      {colorDot && <View style={[st.fmtColorDot, { backgroundColor: colorDot === 'transparent' ? '#555' : colorDot }]} />}
    </TouchableOpacity>
  );
}

function PickerModal({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const st = useSt();
  return (
    <Modal visible={visible} transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={onClose}>
      {/* statusBarTranslucent 모달은 안드로이드 adjustResize가 꺼져 KAV로 키보드를 직접 회피 (autoFocus 입력 포함) */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableOpacity style={st.overlayBg} activeOpacity={1} onPress={onClose} accessibilityViewIsModal>
          <View style={st.pickerCard} onStartShouldSetResponder={() => true}>
            <Text style={st.pickerTitle}>{title}</Text>
            {children}
          </View>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PanelRow({ label, icon, labelText, required, children }: {
  label: string; icon?: React.ReactNode | null; labelText?: string; required?: boolean; children: React.ReactNode;
}) {
  const skinAccentReq = useSkinAccent();
  const st = useSt();
  const displayLabel = labelText || label;
  return (
    <View style={st.panelRow}>
      <View style={st.panelLabelRow}>
        {icon && <View style={{ marginRight: 6 }}>{icon}</View>}
        <Text style={st.panelLabel}>{displayLabel}</Text>
        {required && <Text style={[st.reqTag, { color: skinAccentReq.accent }]}>✱</Text>}
      </View>
      {children}
    </View>
  );
}

// ─── 지도 대표 사진 선택 모달 ───
function RepPhotoModal({
  visible,
  photos,
  selectedPhoto,
  onSelect,
  onClose,
}: {
  visible: boolean;
  photos: string[];
  selectedPhoto: string | null;
  onSelect: (uri: string | null, original?: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  // 카드 폭만 Stage 폭에서 파생된다 — rpm은 모듈 최상위 스타일시트라 폭만 인라인으로 내렸다.
  const photoCardW = (useStageWidth() - 56) / 3;
  const insets = useSafeAreaInsets(); // 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨)
  const translateY = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 13,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: 500,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const handlePickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as MediaType[],
        allowsMultipleSelection: false,
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      const orig = result.assets[0].uri;
      onSelect(await compressImage(orig), orig);
    } catch (err: any) {
      console.error('[RepPhotoModal pick gallery] error:', err);
      Alert.alert(t('blog.photoPickError'), err?.message || t('blog.repPhotoErrMsg'));
    }
  };

  const isSelectedFromGallery = selectedPhoto && !photos.includes(selectedPhoto);
  const displayPhotos = isSelectedFromGallery ? [selectedPhoto, ...photos] : photos;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={rpm.overlay} accessibilityViewIsModal>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        {/* 안드로이드 내비바 인셋 보정 (모달이 내비바 아래까지 확장됨) */}
        <Animated.View style={[rpm.sheet, { paddingBottom: Platform.OS === 'ios' ? 30 : insets.bottom + 12 }, { transform: [{ translateY }] }]}>
          {/* 핸들 */}
          <View style={rpm.handle} />

          {/* 헤더 — 아이콘을 accent 배지에 넣는 다른 시트들과 동일 구조 */}
          <View style={rpm.header}>
            <View style={[rpm.headerIcon, { backgroundColor: skinAccent.tint(0.14), borderColor: skinAccent.tint(0.3) }]}>
              <MapIcon size={18} color={skinAccent.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={rpm.headerTitle}>{t('blog.repPhotoTitle')}</Text>
              <Text style={rpm.headerDesc}>{t('blog.repPhotoDesc')}</Text>
            </View>
          </View>

          {/* 갤러리에서 가져오기 */}
          <TouchableOpacity
            style={[rpm.galleryBtn, { backgroundColor: skinAccent.tint(0.12), borderColor: skinAccent.tint(0.32) }]}
            onPress={handlePickFromGallery}
            activeOpacity={0.8}
          >
            <GalleryIcon size={16} color={skinAccent.accent} />
            <Text style={[rpm.galleryBtnTxt, { color: skinAccent.accent }]}>{t('blog.repPhotoPickBtn')}</Text>
          </TouchableOpacity>

          {displayPhotos.length === 0 ? (
            <View style={rpm.emptyWrap}>
              <GalleryIcon size={30} color="#4A4A59" />
              <Text style={rpm.emptyTxt}>{t('blog.repPhotoEmpty')}</Text>
            </View>
          ) : (
            <>
              {/* 목록 머리 — '대표 해제'를 다른 시트의 '전체 해제'와 같은 자리에 둔다 */}
              <View style={rpm.listHead}>
                <Text style={rpm.listHeadTxt}>{t('blog.photo')}</Text>
                {selectedPhoto && (
                  <TouchableOpacity onPress={() => onSelect(null)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={rpm.clearTxt}>{t('blog.clearRep')}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* 사진 썸네일 그리드 */}
              <ScrollView style={rpm.gridScroll} contentContainerStyle={rpm.gridContainer} showsVerticalScrollIndicator={false}>
                {displayPhotos.map((uri, idx) => {
                  const isSelected = selectedPhoto === uri;
                  return (
                    <TouchableOpacity
                      key={`${uri}-${idx}`}
                      style={[rpm.photoCard, { width: photoCardW }, isSelected && { borderColor: skinAccent.accent }]}
                      onPress={() => onSelect(uri)}
                      activeOpacity={0.8}
                    >
                      <Image source={{ uri }} style={rpm.photoImg} resizeMode="cover" />
                      {isSelected && (
                        <View style={[rpm.selectedBadge, { backgroundColor: skinAccent.accent }]}>
                          <Text style={rpm.selectedMark}>{t('comp.representative')}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          )}

          {/* 완료 */}
          <TouchableOpacity onPress={onClose} activeOpacity={0.85} style={rpm.doneWrap}>
            <LinearGradient colors={skinAccent.btnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={rpm.doneBtn}>
              <Text style={rpm.doneTxt}>{t('common.done')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── 스타일 ───
/**
 * 스타일시트를 지구본 스킨색의 함수로 만든다.
 *
 * 이 화면의 강조색(C.purpleNeon/purpleDeep와 그 알파 변형)이 모듈 최상위 StyleSheet에
 * 박혀 있어서, 스킨을 cyan/mint로 바꿔도 블로그 기록 화면만 보라색으로 남아 있었다.
 * 35곳을 호출부마다 덮는 대신 스타일시트 자체를 스킨의 함수로 바꾼다 —
 * 색을 쓰는 모든 지점이 자동으로 따라오고, 새 스타일을 추가할 때도 빠뜨릴 일이 없다.
 *
 * a=accent(밝은 강조), ad=accentDeep(진한 강조), tint=밝은 강조의 알파 틴트.
 */
const makeStyles = (a: string, ad: string, tint: (alpha: number) => string) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.divider },
  headerBtn: { paddingHorizontal: 14, paddingVertical: 10 },
  headerBtnText: { color: C.dim, fontSize: 14 },
  // 절대배치는 래퍼 View가 갖는다(Text의 pointerEvents는 안드로이드 구현이 없어 무효 — 호출부 주석 참조).
  // top/bottom을 비워 둬야 header의 alignItems:'center'가 예전 Text와 같은 자리에 놓는다.
  headerTitleWrap: { position: 'absolute', left: 0, right: 0 },
  headerTitle: { color: C.white, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mapBtn: { width: 26, height: 26, borderRadius: 6, backgroundColor: '#2E2E3B', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  mapBtnActive: { borderWidth: 1, borderColor: a },
  mapBtnThumb: { width: '100%', height: '100%', borderRadius: 5 },
  naverBtn: { width: 26, height: 26, borderRadius: 6, backgroundColor: C.naverGreen, alignItems: 'center', justifyContent: 'center' },
  naverBtnText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  lockBtn: { width: 26, height: 26, borderRadius: 6, backgroundColor: '#2E2E3B', alignItems: 'center', justifyContent: 'center' },
  lockBtnActive: { backgroundColor: tint(0.4), borderWidth: 1, borderColor: a },
  lockBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: '#FF3B30', borderRadius: 8, width: 13, height: 13, alignItems: 'center', justifyContent: 'center' },
  lockBadgeText: { color: '#FFF', fontSize: 8, fontWeight: '800' },
  saveBtn: { backgroundColor: ad, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 },
  saveBtnDisabled: { backgroundColor: C.muted, opacity: 0.4 },
  saveBtnText: { color: C.white, fontSize: 13, fontWeight: '700' },
  saveBtnTextDisabled: { color: C.dim },

  editor: { flex: 1, backgroundColor: C.editorBg },
  editorContent: { paddingHorizontal: 20, paddingTop: 12 },

  // 국가
  countryChip: { alignSelf: 'flex-start', backgroundColor: tint(0.25), borderRadius: 18, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: tint(0.3), marginBottom: 12 },
  countryChipText: { color: a, fontSize: 13, fontWeight: '600' },
  countryChipPlaceholder: { color: C.muted, fontSize: 13 },
  // 미입력 표시 — 골드. 스킨 accent(보라/시안/민트)와 겹치지 않아 '아직 안 채움'이
  // 강조 요소와 구분되고, 빨강처럼 오류로 읽히지도 않는다.
  countryChipRequired: { borderColor: C.gold, borderWidth: 1.5 },
  requiredDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.gold, marginLeft: 6 },

  titleInput: { color: C.white, fontSize: 24, fontWeight: '700', paddingVertical: 4, minHeight: 36 },
  subtitleText: { color: '#AA54C1', fontSize: 15, fontWeight: '600', marginTop: 4 },
  titleDivider: { height: 2, backgroundColor: ad, marginTop: 6, marginBottom: 14, width: 36, borderRadius: 1 },

  // 블록
  textBlock: { color: C.white, lineHeight: 26, paddingVertical: 3, minHeight: 26 },
  headingWrap: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: 8 },
  headingInput: { flex: 1, color: C.white, fontWeight: '700', paddingVertical: 4 },
  imageBlock: { marginVertical: 10, borderRadius: 10, overflow: 'hidden', backgroundColor: '#1A1A2E' },
  imageBlockImg: { width: '100%', aspectRatio: 16 / 10 },
  videoBlockPlayer: { width: '100%', height: 200, backgroundColor: '#000', borderRadius: 8 },
  videoLabel: { position: 'absolute' as const, top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  videoLabelText: { color: '#fff', fontSize: 11, fontWeight: '600' as const },
  // 가져오기 동영상 자리 표시
  videoPlaceholder: { backgroundColor: '#15131F', borderWidth: 1, borderColor: tint(0.35), borderStyle: 'dashed' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8 },
  videoPlaceholderTitle: { color: C.white, fontSize: 14, fontWeight: '700' as const },
  videoPlaceholderBtn: { backgroundColor: tint(0.15), borderWidth: 1, borderColor: tint(0.4), borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  videoPlaceholderBtnText: { color: a, fontSize: 13, fontWeight: '600' as const },
  videoPlaceholderLink: { color: C.dim, fontSize: 12, textDecorationLine: 'underline' as const, marginTop: 2 },
  captionInput: { color: C.dim, fontSize: 12, textAlign: 'center', paddingVertical: 8, paddingHorizontal: 12, fontStyle: 'italic' },
  imageRemoveBtn: { position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  imageRemoveText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  imagesBlock: { marginVertical: 10, borderRadius: 10, overflow: 'hidden', backgroundColor: '#1A1A2E', padding: 4 },
  imagesGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridImg: { borderRadius: 6 },
  gridCaptionInput: { color: '#A1A1B0', fontSize: 10, textAlign: 'center', paddingVertical: 2, paddingHorizontal: 4, fontStyle: 'italic' },
  layoutBtnRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 8 },
  layoutBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: C.cardLight },
  layoutBtnActive: { backgroundColor: tint(0.25) },
  layoutBtnText: { color: C.muted, fontSize: 11 },
  layoutBtnTextActive: { color: a },
  sepBlock: { paddingVertical: 16 },
  sepLine: { flex: 1, height: 1, backgroundColor: '#3A3A4A' },
  sepDotsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sepDots: { flexDirection: 'row', gap: 5 },
  sepDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: a, opacity: 0.5 },
  quoteBlock: { marginVertical: 10, backgroundColor: tint(0.06), borderLeftWidth: 3, borderLeftColor: a, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'flex-start' },
  quoteMark: { color: a, fontSize: 26, fontWeight: '700', opacity: 0.35, marginRight: 6, marginTop: -6 },
  quoteInput: { flex: 1, color: C.dim, fontSize: 14, fontStyle: 'italic', lineHeight: 22, minHeight: 22, paddingVertical: 0 },
  linkBlock: { marginVertical: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: C.cardLight, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.divider, gap: 8 },
  linkUrl: { flex: 1, color: '#64B5F6', fontSize: 13, textDecorationLine: 'underline' },
  fileBlock: { marginVertical: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: C.cardLight, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.divider, gap: 10 },
  fileName: { color: C.white, fontSize: 13, fontWeight: '500' },
  fileSize: { color: C.muted, fontSize: 11, marginTop: 2 },
  blockRemoveBtn: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  blockRemoveText: { color: '#fff', fontSize: 11 },

  // 태그
  tagSection: { marginTop: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.divider },
  tagInputRow: { flexDirection: 'row', alignItems: 'center' },
  hashIcon: { color: a, fontSize: 16, fontWeight: '700', marginRight: 4 },
  tagInput: { flex: 1, height: 34, color: C.white, fontSize: 14 },
  tagList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', backgroundColor: tint(0.25), borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, gap: 4 },
  tagText: { color: a, fontSize: 12, fontWeight: '500' },
  tagRemove: { color: C.muted, fontSize: 9 },

  // 툴바
  toolbar: { backgroundColor: C.toolbar, borderTopWidth: 1, borderTopColor: C.toolbarBorder, paddingBottom: Platform.OS === 'ios' ? 18 : 6 },
  mainToolRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 6 },
  toolRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 5 },
  toolBtn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8, minWidth: 52 },
  toolIcon: { alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: 2, height: 26 },
  toolLabel: { fontSize: 11, color: C.muted },
  // 아이콘 위에 겹치는 배지라 툴바색 링을 둘러 아이콘 실루엣과 분리한다.
  toolRequiredDot: { position: 'absolute' as const, top: -2, right: -6, width: 9, height: 9, borderRadius: 4.5, backgroundColor: C.gold, borderWidth: 1.5, borderColor: C.toolbar },
  toolSep: { width: 1, height: 22, backgroundColor: C.toolbarBorder },
  toolbarSpacer: { flex: 1 },
  toolbarDraftBtn: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, marginRight: 4, borderWidth: 1, borderColor: tint(0.3) },
  toolbarDraftText: { color: C.dim, fontSize: 12, fontWeight: '600' },
  toolbarDraftListBtn: { borderRadius: 16, paddingHorizontal: 10, paddingVertical: 8, marginRight: 4, backgroundColor: tint(0.25) },
  toolbarDraftListText: { color: a, fontSize: 11, fontWeight: '700' },
  // 서브패널
  subPanel: { backgroundColor: C.toolbar, borderTopWidth: 1, borderTopColor: C.toolbarBorder, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6 },
  subMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  subMenuIcon: { alignItems: 'center' as const, justifyContent: 'center' as const, width: 24, height: 24 },
  subMenuLabel: { fontSize: 15, color: C.white, fontWeight: '500' },
  fmtBtn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 6, minWidth: 36, borderRadius: 4 },
  fmtBtnActive: { backgroundColor: tint(0.15) },
  fmtBtnText: { fontSize: 14, color: C.dim },
  fmtColorDot: { width: 10, height: 3, borderRadius: 1.5, marginTop: 2 },

  // 피커 공통
  overlayBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  // 고정 폭이 아니라 width:'100%'라 창 폭을 그대로 먹는다 — Modal은 루트 클램프 밖
  pickerCard: { width: '100%', maxWidth: STAGE_MAX_W, backgroundColor: C.card, borderRadius: 16, padding: 18 },
  pickerTitle: { color: C.white, fontSize: 15, fontWeight: '700', textAlign: 'center', marginBottom: 14 },
  pickerOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.divider },
  pickerOptionActive: { backgroundColor: tint(0.25), borderRadius: 8, borderBottomColor: 'transparent' },
  pickerOptionText: { color: C.white, fontSize: 15 },
  pickerOptionTextActive: { color: a, fontWeight: '600' },
  checkMark: { color: a, fontSize: 16, fontWeight: '700' },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  colorDotActive: { borderColor: a },

  // 링크 입력
  schedInput: { height: 44, backgroundColor: C.cardLight, borderRadius: 10, paddingHorizontal: 14, color: C.white, fontSize: 14, borderWidth: 1, borderColor: C.divider, marginBottom: 12 },
  schedConfirmBtn: { backgroundColor: ad, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  schedConfirmText: { color: C.white, fontSize: 14, fontWeight: '700' },

  // 스티커 패널
  // 공용 시트 토큰 — 임시저장·비공개 대상 선택 시트와 같은 값
  panelHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.22)', alignSelf: 'center', marginTop: 4, marginBottom: 16 },

  // 여행정보 패널
  // left/right:0 대신 width+maxWidth+alignSelf — Modal은 루트 클램프 밖이라
  // left/right로 붙이면 폴드·태블릿에서 창 폭 전체로 늘어난다
  travelPanel: { position: 'absolute', bottom: 0, width: '100%', maxWidth: STAGE_MAX_W, alignSelf: 'center', backgroundColor: '#16161F', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)', maxHeight: '78%', paddingHorizontal: 18, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 30 : 18 },
  panelTitle: { color: C.white, fontSize: 16, fontWeight: '700', marginBottom: 16 },
  panelRow: { marginBottom: 18, gap: 8 },
  panelLabelRow: { flexDirection: 'row' as const, alignItems: 'center' as const },
  panelLabel: { color: C.dim, fontSize: 13, fontWeight: '600' },
  reqTag: { color: a, fontSize: 11, fontWeight: '700', marginLeft: 4 },
  dateBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: C.cardLight, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: C.divider },
  dateBtnCol: { flex: 1 },
  dateBtnLabel: { fontSize: 11, color: C.muted, marginBottom: 4 },
  dateBtnVal: { fontSize: 15, fontWeight: '600' as const, color: C.white },
  dateBtnArrow: { fontSize: 18, color: C.muted, marginHorizontal: 12 },
  ratingRow: { flexDirection: 'row' as const, gap: 6, alignItems: 'center' as const },
  starBase: { fontSize: 24, color: '#3A3A55', textAlign: 'center' as const, lineHeight: 28, width: 28 },
  starAbsolute: { position: 'absolute' as const, left: 0, top: 0, width: 28 },
  starFillClip: { position: 'absolute' as const, left: 0, top: 0, height: 28, overflow: 'hidden' as const },
  starActive: { color: '#FBBF24' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: C.cardLight, borderWidth: 1, borderColor: 'transparent' },
  chipActive: { backgroundColor: tint(0.25), borderColor: tint(0.3) },
  chipText: { color: C.dim, fontSize: 13 },
  chipTextActive: { color: a },
  ratingWrap: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  ratingScore: { color: a, fontSize: 13, fontWeight: '600' },
  ratingScoreEmpty: { color: C.muted, fontSize: 12 },
  optDivider: { height: 1, backgroundColor: C.divider, marginVertical: 8 },
  optNotice: { color: C.muted, fontSize: 11, textAlign: 'center' as const, marginBottom: 14 },
  visNotice: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 6, marginBottom: 2 },
  budgetRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, gap: 8 },
  currencyChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: C.cardLight, borderWidth: 1, borderColor: 'transparent' },
  currencyChipActive: { backgroundColor: tint(0.25), borderColor: tint(0.3) },
  currencyTxt: { color: C.dim, fontSize: 12, fontWeight: '600' },
  currencyTxtActive: { color: a },
  budgetInput: { flex: 1, minWidth: 80, height: 36, backgroundColor: C.cardLight, borderRadius: 8, paddingHorizontal: 10, color: C.white, fontSize: 13, borderWidth: 1, borderColor: C.divider },
  kwWrap: { gap: 8 },
  kwTagRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  kwTag: { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: tint(0.25), borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  kwTagText: { color: a, fontSize: 12, fontWeight: '500' },
  kwTagDel: { color: C.muted, fontSize: 9 },
  kwInput: { height: 36, backgroundColor: C.cardLight, borderRadius: 8, paddingHorizontal: 10, color: C.white, fontSize: 13, borderWidth: 1, borderColor: C.divider },
  memoInput: { color: C.white, fontSize: 13, lineHeight: 20, minHeight: 56, backgroundColor: C.cardLight, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.divider },
  panelDoneWrap: { marginTop: 12, borderRadius: 16, overflow: 'hidden' as const },
  panelDoneBtn: { paddingVertical: 15, alignItems: 'center' },
  panelDoneText: { color: C.white, fontSize: 15, fontWeight: '700' },

  // 국가 모달
  modalSafe: { flex: 1, backgroundColor: C.bg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.divider },
  modalClose: { color: a, fontSize: 15, fontWeight: '600' },
  modalTitle: { color: C.white, fontSize: 16, fontWeight: '700' },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 10 },
  // 지우기(✕) 버튼을 품기 위해 입력칸을 컨테이너로 쓰고 TextInput은 안에서 늘어난다
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    height: 40, backgroundColor: C.cardLight, borderRadius: 10, paddingHorizontal: 14,
    borderWidth: 1, borderColor: C.divider,
  },
  searchField: { flex: 1, color: C.white, fontSize: 14, paddingVertical: 0 },
  searchClear: { color: C.dim, fontSize: 13, fontWeight: '700' },

  // 선택한 국가 칩 줄
  pickedWrap: { paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.divider },
  pickedRow: { paddingHorizontal: 16, gap: 6, alignItems: 'center' },
  pickedChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  pickedRep: { fontSize: 9, fontWeight: '700', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, overflow: 'hidden' },
  pickedTxt: { fontSize: 13, fontWeight: '600' },
  pickedX: { fontSize: 11, fontWeight: '700' },
  pickedCount: { color: C.dim, fontSize: 11, paddingHorizontal: 16, paddingTop: 8 },

  continentLabel: { color: C.dim, fontSize: 11, fontWeight: '600', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  // 체크는 문자로 이어 붙이지 않고 우측에 고정 — 국가명 길이에 따라 위치가 흔들리지 않는다
  countryItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.divider },
  countryItemActive: { backgroundColor: tint(0.25) },
  countryItemBlocked: { opacity: 0.35 },
  countryItemText: { color: C.white, fontSize: 15, flexShrink: 1 },
  countryItemCheck: { fontSize: 15, fontWeight: '700', marginLeft: 10 },
  countryEmpty: { color: C.muted, fontSize: 14, textAlign: 'center' as const, paddingVertical: 48 },

  // 임시저장 목록 — 비공개 대상 선택 시트(components/record/PrivacyModal)와 같은 디자인 언어
  dlOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' as const },
  dlSheet: {
    // Modal은 루트 클램프 밖이라 폭을 여기서 다시 잡는다(딤 배경 dlOverlay는 전체 폭 유지)
    width: '100%' as const, maxWidth: STAGE_MAX_W, alignSelf: 'center' as const,
    backgroundColor: '#16161F', borderTopLeftRadius: 26, borderTopRightRadius: 26,
    borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 18, paddingBottom: Platform.OS === 'ios' ? 30 : 18, maxHeight: '78%',
  },
  dlHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.22)', alignSelf: 'center' as const, marginTop: 10, marginBottom: 18 },
  dlHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, marginBottom: 14 },
  dlHeaderIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1 },
  dlTitle: { flex: 1, color: C.white, fontSize: 16, fontWeight: '700' },
  dlCountPill: { minWidth: 26, height: 24, borderRadius: 12, borderWidth: 1, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 8 },
  dlCountTxt: { fontSize: 12, fontWeight: '700' },

  dlEmptyWrap: { alignItems: 'center' as const, gap: 10, paddingVertical: 46 },
  dlEmptyTxt: { color: C.muted, fontSize: 14 },
  dlScroll: { maxHeight: 380 },

  // 행은 카드로 — 선택(편집 중) 상태는 배경 틴트 + 테두리를 함께 켠다
  dlItem: {
    flexDirection: 'row' as const, alignItems: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14,
    borderWidth: 1, borderColor: 'transparent', marginBottom: 8, overflow: 'hidden' as const,
  },
  dlItemMain: { flex: 1, paddingHorizontal: 14, paddingVertical: 12 },
  dlItemHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 5 },
  dlItemTitle: { flex: 1, color: '#A1A1B0', fontSize: 14.5, fontWeight: '600' },
  dlItemTitleOn: { color: C.white, fontWeight: '700' },
  dlBadge: { fontSize: 10, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7, overflow: 'hidden' as const },
  dlItemMeta: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  dlMetaCountry: { color: C.dim, fontSize: 12 },
  dlMetaDate: { color: C.muted, fontSize: 11 },
  dlExpiryPill: { backgroundColor: 'rgba(255,214,10,0.14)', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
  dlExpiryTxt: { color: '#FFD60A', fontSize: 10, fontWeight: '700' },
  // 삭제는 파괴적 동작이라 빨강 유지 — 라벨 대신 아이콘으로 폭을 줄여 제목이 더 길게 보인다
  dlDeleteBtn: { paddingHorizontal: 14, alignSelf: 'stretch' as const, justifyContent: 'center' as const, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.07)' },

  dlDoneWrap: { marginTop: 14, borderRadius: 16, overflow: 'hidden' as const },
  dlDoneBtn: { paddingVertical: 15, alignItems: 'center' as const },
  dlDoneTxt: { color: C.white, fontSize: 15, fontWeight: '700' },

  // 캘린더 오버레이
  calOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' as const, zIndex: 10 },

  // 통화 모달
  currModalSheet: { backgroundColor: '#16161F', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 18, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 30 : 18, width: '100%', maxWidth: STAGE_MAX_W, alignSelf: 'center' },
  currModalSearch: { height: 42, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, paddingHorizontal: 14, color: C.white, fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 12 },
  currModalItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'transparent', marginBottom: 8 },
  currModalCode: { color: a, fontSize: 14, fontWeight: '700' as const, width: 44 },
  currModalName: { flex: 1, color: '#A1A1B0', fontSize: 14 },

  // 앱 메이트 관련
  friendChip: { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: tint(0.25), borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, gap: 6 },
  friendChipAvatar: { width: 20, height: 20, borderRadius: 10, backgroundColor: ad, alignItems: 'center' as const, justifyContent: 'center' as const },
  friendChipAvatarTxt: { color: C.white, fontSize: 10, fontWeight: '700' as const },
  friendChipName: { color: a, fontSize: 12, fontWeight: '500' as const },
  addFriendBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: 10, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: C.cardLight, borderRadius: 10, borderWidth: 1, borderColor: tint(0.3), alignSelf: 'flex-start' as const },
  addFriendTxt: { color: a, fontSize: 13, fontWeight: '600' as const },
  addFriendBadge: { backgroundColor: ad, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  addFriendBadgeTxt: { color: C.white, fontSize: 10, fontWeight: '700' as const },
  friendPickerSheet: { backgroundColor: '#16161F', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)', maxHeight: '62%', paddingHorizontal: 18, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 30 : 18, width: '100%', maxWidth: STAGE_MAX_W, alignSelf: 'center' },
  friendPickerItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'transparent', marginBottom: 8 },
  friendPickerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center' as const, justifyContent: 'center' as const },
  friendPickerAvatarTxt: { color: C.white, fontSize: 15, fontWeight: '700' as const },
  friendPickerName: { flex: 1, color: '#A1A1B0', fontSize: 14.5, fontWeight: '600' as const },
  friendPickerNameOn: { color: C.white, fontWeight: '700' as const },
  friendPickerCheck: { width: 23, height: 23, borderRadius: 11.5, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)', alignItems: 'center' as const, justifyContent: 'center' as const },
  friendPickerCheckActive: { backgroundColor: a, borderColor: a },

  // 토스트
  toast: { position: 'absolute', bottom: 100, alignSelf: 'center', backgroundColor: 'rgba(30,30,50,0.95)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});

/** 현재 스킨색으로 만든 스타일시트 — 스킨이 바뀔 때만 다시 만든다 */
function useSt() {
  const { accent, accentDeep, tint } = useSkinAccent();
  return useMemo(() => makeStyles(accent, accentDeep, tint), [accent, accentDeep, tint]);
}



const rpm = StyleSheet.create({
  // 다른 시트(임시저장·비공개 대상 선택)와 같은 디자인 언어
  // overlay는 딤 배경(flex:1 + rgba) — 좁히면 폴드에서 양옆이 안 어두워지므로 전면 유지한다.
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  // sheet는 콘텐츠 래퍼. RN Modal이라 루트 클램프 밖이고 photoCardW가 Stage 폭(≤480)
  // 기준이라, 시트를 같은 폭으로 가두고 중앙에 둬야 썸네일 3열이 시트 폭과 맞는다.
  sheet: {
    backgroundColor: '#16161F', borderTopLeftRadius: 26, borderTopRightRadius: 26,
    borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 18, paddingBottom: 30, maxHeight: '82%',
    width: '100%', maxWidth: STAGE_MAX_W, alignSelf: 'center',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.22)', alignSelf: 'center', marginTop: 10, marginBottom: 18 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  headerIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  headerDesc: { fontSize: 12, color: '#A1A1B0', marginTop: 3, lineHeight: 16 },

  galleryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderRadius: 14, paddingVertical: 13, marginBottom: 14,
  },
  galleryBtnTxt: { fontSize: 14, fontWeight: '700' },

  // 목록 머리 — 다른 시트의 '전체 해제'와 같은 자리·같은 형태
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 2 },
  listHeadTxt: { fontSize: 11, fontWeight: '700', color: '#7A7A89', letterSpacing: 0.6 },
  clearTxt: { fontSize: 12, color: '#FF3B30', fontWeight: '700' },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 46 },
  emptyTxt: { fontSize: 14, color: '#7A7A89', textAlign: 'center', lineHeight: 20 },

  gridScroll: { maxHeight: 330 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 10 },
  // 좌우 패딩 18*2 + gap 10*2 = 56
  // width는 Stage 폭에서 파생되므로 호출부에서 인라인으로 주입한다.
  photoCard: {
    aspectRatio: 1, borderRadius: 14, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 2, borderColor: 'transparent',
  },
  photoImg: { width: '100%', height: '100%' },
  // 선택 표시 — 하단 전체를 덮던 보라 띠 대신 우상단 배지 + 은은한 하단 그라데이션 없이 깔끔하게
  selectedBadge: {
    position: 'absolute', top: 6, right: 6,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 9,
  },
  selectedMark: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '700' },

  doneWrap: { marginTop: 14, borderRadius: 16, overflow: 'hidden' },
  doneBtn: { paddingVertical: 15, alignItems: 'center' },
  doneTxt: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});

