import React, { useState, useMemo, useRef, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,  TextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  PanResponder,
  ActivityIndicator,
  Linking,
  Alert,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useTranslation } from 'react-i18next';
import { continentLabel } from '../utils/countryLabel';
import { useSkinAccent } from '../constants/skinTheme';
import { useRecords, type Visibility } from '../store/recordStore';
import { COUNTRIES, CONTINENT_ORDER } from '../constants/countries';
import { DraggableCountryList } from '../components/record/DraggableLists';
import PhotoPagerSection from '../components/record/PhotoPagerSection';
import { CalendarBottomSheet } from '../components/record/CalendarBottomSheet';
import { PrivacyModal } from '../components/record/PrivacyModal';
import { MediaPickerModal } from '../components/record/MediaPickerModal';
import { FriendPickerModal } from '../components/record/FriendPickerModal';
import { CurrencyPickerModal } from '../components/record/CurrencyPickerModal';
import { compressImage, compressImages } from '../utils/imageCompress';
import { withTimeout } from '../utils/withTimeout';
import { getMaxRecordPhotos } from '../constants/limits';
import { getHomeRegions, normalizeHomeRegion } from '../constants/homeRegions';
import { collectRecordedDateKeys, collectRecordedRanges } from '../utils/recordedDates';
import { useSettings } from '../store/settingsStore';
import { detectCurrentCountry } from '../services/snapService';
import { currencyForCountryName } from '../constants/countryCurrency';
import type { RootStackScreenProps } from '../navigation/types';
import { useMoments } from '../store/momentStore';
import { matchMoments, countryNameToCode } from '../utils/momentMatch';
import MomentListSheet from '../components/moments/MomentListSheet';
import {
  PlaneIcon as DesignerPlaneIcon,
  CameraIcon as DesignerCameraIcon,
  SearchIcon as SvgSearchIcon,
  CalendarIcon as SvgCalendarIcon,
  GalleryIcon as SvgGalleryIcon,
  LockClosedIcon as SvgLockClosedIcon,
  LockOpenIcon as SvgLockOpenIcon,
  CoinIcon as SvgCoinIcon,
  TagIcon as SvgTagIcon,
  TakeoffIcon as SvgTakeoffIcon,
  TransferIcon as SvgTransferIcon,
  PartlyCloudyIcon as SvgWeatherIcon,
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
} from '../components/icons';

if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}
// AlbumCreateScreen 등이 './NewRecordScreen' 경로로 import 하므로 재export 유지
export { CalendarBottomSheet } from '../components/record/CalendarBottomSheet';

const { width: SCREEN_W } = Dimensions.get('window');

const COLORS = {
  bg: '#0A0A0F',
  card: '#2E2E3B',
  divider: '#1A1A26',
  purpleNeon: '#BF85FC',
  purpleDeep: '#6B21A8',
  white: '#FFFFFF',
  textDim: '#A1A1B0',
  textMuted: '#4A4A59',
  gold: '#FFD700',
  error: '#FF3B30',
};

// ─── 커스텀 아이콘 (SVG 래퍼) ───
const IC = COLORS.purpleNeon;

const SearchIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => (
  <SvgSearchIcon size={size} color={color} />
);

const CalendarIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => (
  <SvgCalendarIcon size={size} color={color} />
);

const GalleryIcon = ({ size = 20, color = IC }: { size?: number; color?: string }) => (
  <SvgGalleryIcon size={size} color={color} />
);

const CameraIcon = ({ size = 32, color = IC }: { size?: number; color?: string }) => (
  <DesignerCameraIcon size={size} color={color} />
);

const LockClosedIcon = ({ size = 12, color = COLORS.white }: { size?: number; color?: string }) => (
  <SvgLockClosedIcon size={size} color={color} />
);

const LockOpenIcon = ({ size = 12, color = COLORS.white }: { size?: number; color?: string }) => (
  <SvgLockOpenIcon size={size} color={color} />
);

const CoinIcon = ({ size = 18, color = IC }: { size?: number; color?: string }) => (
  <SvgCoinIcon size={size} color={color} />
);

const WeatherIcon = ({ size = 18, color = IC }: { size?: number; color?: string }) => (
  <SvgWeatherIcon size={size} />
);

const PlaneIcon = ({ size = 18, color = IC }: { size?: number; color?: string }) => (
  <DesignerPlaneIcon size={size} color={color} />
);

const TagIcon = ({ size = 18, color = IC }: { size?: number; color?: string }) => (
  <SvgTagIcon size={size} color={color} />
);

const TakeoffIcon = ({ size = 14, color = IC }: { size?: number; color?: string }) => (
  <SvgTakeoffIcon size={size} color={color} />
);

const TransferIcon = ({ size = 14, color = IC }: { size?: number; color?: string }) => (
  <SvgTransferIcon size={size} color={color} />
);

// ─── 동행자 아이콘 ───

const SoloIcon = ({ color = IC }: { color?: string }) => (
  <SvgSoloIcon size={16} color={color} />
);

const FriendIcon = ({ color = IC }: { color?: string }) => (
  <SvgFriendIcon size={16} color={color} />
);

const CoupleIcon = ({ color = IC }: { color?: string }) => (
  <SvgCoupleIcon size={16} color={color} />
);

const FamilyIcon = ({ color = IC }: { color?: string }) => (
  <SvgFamilyIcon size={16} color={color} />
);

const ParentIcon = ({ color = IC }: { color?: string }) => (
  <SvgParentIcon size={16} color={color} />
);

const SiblingIcon = ({ color = IC }: { color?: string }) => (
  <SvgSiblingIcon size={16} color={color} />
);

const COMPANION_ICONS: Record<string, React.ReactNode> = {
  '혼자': <SoloIcon />,
  '친구': <FriendIcon />,
  '연인': <CoupleIcon />,
  '가족': <FamilyIcon />,
  '부모님': <ParentIcon />,
  '형제': <SiblingIcon />,
};

// ─── 날씨 개별 아이콘 ───
const SunIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => (
  <SvgSunIcon size={size} color={color} />
);
const CloudyIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => (
  <SvgCloudyIcon size={size} color={color} />
);
const RainIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => (
  <SvgRainIcon size={size} color={color} />
);
const SnowIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => (
  <SvgSnowIcon size={size} color={color} />
);
const PartlyCloudyIcon = ({ size = 16 }: { size?: number; color?: string }) => (
  <SvgPartlyCloudyIcon size={size} />
);
const WindIcon = ({ size = 16, color = IC }: { size?: number; color?: string }) => (
  <SvgWindIcon size={size} color={color} />
);

// 색을 스킨 강조색으로 주입할 수 있게 함수형으로 둔다 (부분흐림은 다색 디자인 아이콘이라 색 무시)
const WEATHER_ICON_MAP: Record<string, (color: string) => React.ReactNode> = {
  '맑음':     (c) => <SunIcon size={16} color={c} />,
  '부분흐림': () => <PartlyCloudyIcon size={16} />,
  '흐림':     (c) => <CloudyIcon size={16} color={c} />,
  '비':       (c) => <RainIcon size={16} color={c} />,
  '눈':       (c) => <SnowIcon size={16} color={c} />,
  '바람':     (c) => <WindIcon size={16} color={c} />,
};

// 캘린더/비공개 모달은 components/record/ 로 분리

// 국가 데이터: 공용 모듈(../constants/countries)에서 가져옴

const ISO_TO_COUNTRY = COUNTRIES.reduce<Record<string, { flag: string; name: string }>>((acc, c) => {
  const code = c.term.split(' ')[0].toUpperCase();
  acc[code] = { flag: c.flag, name: c.name };
  return acc;
}, {});

function geoJsonToCountry(name: string, code?: string) {
  const cleanName = name.split(' - ')[0].toLowerCase();
  if (code) {
    const codeUpper = code.toUpperCase();
    // Try code matching (either direct 2-letter match, or convert 3-letter match)
    const byCode = ISO_TO_COUNTRY[codeUpper];
    if (byCode) return byCode;
    
    // Convert common 3-letter codes to 2-letter codes
    const iso3ToIso2: Record<string, string> = {
      JPN: 'JP', CHN: 'CN', USA: 'US', DEU: 'DE', ESP: 'ES',
      GBR: 'GB', FRA: 'FR', ITA: 'IT', KOR: 'KR'
    };
    const converted = iso3ToIso2[codeUpper];
    if (converted && ISO_TO_COUNTRY[converted]) {
      return ISO_TO_COUNTRY[converted];
    }
  }
  const found = COUNTRIES.find(c => c.name === cleanName || c.term.includes(cleanName));
  return found ? { flag: found.flag, name: found.name } : null;
}

const DEFAULT_COMPANIONS = ['혼자', '친구', '연인', '가족', '부모님', '형제'];

// ─── 메인 컴포넌트 ───
export default function NewRecordScreen({ navigation, route }: RootStackScreenProps<'NewRecord'>) {
  const { t, i18n } = useTranslation();
  const skinAccent = useSkinAccent(); // 기록 화면 강조를 지구본 스킨색으로
  const { addRecord, updateRecord, addTripGroup, neighbors, records, activeStayGroup } = useRecords();
  // 동행자 값(혼자/친구…)은 저장 키라 유지하고 표시만 번역
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
  // 함께한 친구·비공개 대상 목록은 실제 팔로우한 친구에서 가져온다 (데모 친구 제거)
  const friendNames = neighbors.map((f) => f.username);

  // ─── 편집 모드 ───
  // 소셜 피드 '편집'(editRecord) 또는 게시물 상세 '수정'(record)에서 기존 기록을 받아 미리 채운다
  const editRecord = route.params?.editRecord ?? route.params?.record;
  const isEdit = !!editRecord;
  // 여행 카드에서 추가하면 그 여행 기간을 받아 신규 작성 시 날짜에 자동 적용한다
  const tripPeriod = route.params?.tripPeriod;
  const parseDotDate = (s?: string): Date => {
    if (s) {
      // "2025.04.13" / "2025-4-5" 등 구분자(. - /)·비패딩 모두 직접 파싱.
      // new Date(문자열)은 Hermes에서 비패딩 날짜에 Invalid Date가 될 수 있어 쓰지 않는다.
      const [y, m, d] = s.split(/[.\-/]/).map(p => parseInt(p, 10));
      if (
        Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d) &&
        m >= 1 && m <= 12 && d >= 1 && d <= 31
      ) {
        const dt = new Date(y, m - 1, d);
        dt.setHours(0, 0, 0, 0);
        // 월/일 롤오버(예: 2월 31일 → 3월 3일) 방지: 파싱값과 동일해야 유효
        if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) return dt;
      }
    }
    const today = new Date(); today.setHours(0, 0, 0, 0); return today;
  };
  // 다국가 기록이면 대표 국가의 데이터로 활성 상태를 채운다 (top-level medias는 전체 합본이므로)
  const editFirstCountryData = editRecord?.perCountryData?.[editRecord.countryName];

  const [hintMsg, setHintMsg] = useState(''); // 필수 미충족 안내 토스트
  const savedRef = useRef(false);             // 저장 후 이탈은 확인 다이얼로그 건너뜀
  const scrollRef = useRef<ScrollView>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  // 섹션 Y 좌표 캐시 (저장 바 스크롤 이동용)
  const sectionYRef = useRef<{ photo: number; country: number; required: number; optional: number }>({ photo: 0, country: 0, required: 0, optional: 0 });
  // 접이식 박스 상태 — 신규 작성: country 먼저, 편집: 전부 접힘
  const [openBox, setOpenBox] = useState<'country' | 'required' | 'optional' | null>(
    () => (editRecord ? null : 'country')
  );
  const toggleBox = (box: 'country' | 'required' | 'optional') => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenBox(prev => (prev === box ? null : box));
  };

  // Step 1 - 국가 (복수 선택)
  const MAX_COUNTRIES = 10;
  const [countrySearch,     setCountrySearch]     = useState('');
  const [selectedCountries, setSelectedCountries] = useState<{ flag: string; name: string }[]>(
    editRecord
      ? editRecord.countries ?? [{ flag: editRecord.countryFlag, name: editRecord.countryName }]
      : []
  );
  const [selectedRegion, setSelectedRegion] = useState<{ name: string; nameEn: string } | null>(
    editRecord?.regionName ? { name: editRecord.regionName, nameEn: editRecord.regionNameEn ?? '' } : null
  );

  // 거주국가(국내) 여부 — 국내 기록은 지역(시/도) 선택으로 여행 카드를 구분한다
  const { homeCountryCode, isPremium } = useSettings();
  const maxRecordPhotos = getMaxRecordPhotos(isPremium); // 기록당 사진 상한 (프리미엄 100장)
  const homeCountryName = useMemo(
    () => COUNTRIES.find(c => c.term.split(' ')[0].toUpperCase() === (homeCountryCode || '').toUpperCase())?.name ?? null,
    [homeCountryCode]
  );
  const isDomesticSelected = !!homeCountryName && selectedCountries.some(c => c.name === homeCountryName);

  // 진행 중 체류국(active/paused 모두 — ended 아니면 기록 작성 시 지역 프리셋 제공)
  const stayCountryName = activeStayGroup?.stay?.status !== 'ended' ? (activeStayGroup?.countryName ?? null) : null;
  const stayCountryCode = useMemo(
    () => (stayCountryName ? COUNTRIES.find((c) => c.name === stayCountryName)?.term.split(' ')[0].toUpperCase() ?? null : null),
    [stayCountryName]
  );
  const isStaySelected = !!stayCountryName && selectedCountries.some(c => c.name === stayCountryName);

  // 지역 프리셋 대상 국가 코드 — 거주국 우선, 없으면 체류국
  const regionCountryCode = isDomesticSelected ? homeCountryCode : isStaySelected ? stayCountryCode : null;
  // 거주국가의 지역 프리셋 — 한국은 시/도, countryGeo 수록국(일본·미국 등)은 주/현. 없으면 칩 숨김
  const homeRegions = useMemo(
    () => (regionCountryCode ? getHomeRegions(regionCountryCode) : getHomeRegions(homeCountryCode)),
    [regionCountryCode, homeCountryCode]
  );

  // 이미 기록된 날짜 — 국가 구별 없이 전체 내 기록을 캘린더에 점으로 표시 (편집 중 기록 제외)
  const recordedDates = useMemo(
    () => collectRecordedDateKeys(records, null, editRecord?.id),
    [records, editRecord?.id]
  );
  // 날짜 키 → 그 기록의 전체 기간 — 여행 날짜 캘린더에서 점 찍힌 날 탭 시 기간 통째 선택용
  const recordedRanges = useMemo(
    () => collectRecordedRanges(records, editRecord?.id),
    [records, editRecord?.id]
  );

  // useMoments — 서랍용 훅 (matchedMoments useMemo는 startDate/endDate state 이후에 위치)
  const { moments: allMoments } = useMoments();

  useEffect(() => {
    const params = route?.params;
    if (params?.selectedCountry) {
      const rawName = params.selectedCountry.name;
      const countryNameOnly = rawName.split(' - ')[0];
      const mapped = geoJsonToCountry(countryNameOnly, params.selectedCountry.code);
      if (mapped && !selectedCountries.some(c => c.name === mapped.name)) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setSelectedCountries(prev => [...prev, mapped]);
        setOpenBox(null); // 지구본 등 경유 진입 시 박스 접힘
      }
      if (params.selectedCountry.region) {
        setSelectedRegion({
          name: params.selectedCountry.region,
          nameEn: params.selectedCountry.regionEn || '',
        });
      }
    }
  }, [route?.params]);

  // 위치(국가·도시) 자동 채움 — 신규 작성이고 지정 국가 없이 들어왔을 때, 현재 위치로 1회 프리필
  useEffect(() => {
    if (isEdit) return;
    if (route?.params?.selectedCountry) return; // 글로브 등에서 국가 지정해 들어온 경우는 패스
    let cancelled = false;
    (async () => {
      const { countryCode, countryName, city } = await detectCurrentCountry();
      if (cancelled || (!countryCode && !countryName)) return;
      const mapped = geoJsonToCountry(countryName ?? '', countryCode ?? undefined);
      if (!mapped) return;
      setSelectedCountries(prev => (prev.length === 0 ? [mapped] : prev)); // 비어있을 때만
      if (city) {
        // 국내 또는 체류국이면 GPS 도시명을 지역 프리셋으로 정규화(수원시→경기, Kyoto→교토부) — 카드 파편화 방지
        const isHome = mapped.name === homeCountryName;
        const isStay = !isHome && mapped.name === stayCountryName;
        const normCode = isHome ? homeCountryCode : isStay ? stayCountryCode : null;
        const reg = normCode ? normalizeHomeRegion(normCode, city) : null;
        setSelectedRegion(prev => prev ?? (reg ? { name: reg.name, nameEn: reg.nameEn } : { name: city, nameEn: city }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groupedCountries = useMemo(() => {
    const filtered = COUNTRIES.filter(c => c.term.toLowerCase().includes(countrySearch.toLowerCase()));
    const sorted   = [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    return CONTINENT_ORDER.map(continent => ({
      continent,
      countries: sorted.filter(c => c.continent === continent),
    })).filter(g => g.countries.length > 0);
  }, [countrySearch]);

  // Step 2 - 미디어 (다국가여도 사진은 여행 전체 공용 — 국가 구분 없이 한 번에 입력)
  const [medias,            setMedias]           = useState<string[]>(editRecord?.medias ?? []);

  // 사진별 글 — medias와 index 짝. 편집 모드: 기존 photoTexts 복원.
  // 옛 기록(photoTexts 없음)이면 대표 사진 위치에 memo를 시드해 새 구조로 자연 전환.
  // medias 초기값이 editRecord.medias 이므로 길이가 항상 일치한다.
  const [photoTexts, setPhotoTexts] = useState<string[]>(() => {
    if (!editRecord) return [];
    const base = (editRecord.medias ?? []).map((_, i) => editRecord.photoTexts?.[i] ?? '');
    if (!editRecord.photoTexts && editRecord.memo) {
      // representativePhotoSource는 medias의 압축본 uri와 일치 → indexOf 매칭 가능.
      // representativePhoto(고해상도)는 medias uri와 다를 수 있으므로 우선순위를 Source에 둔다.
      const repUri = editRecord.representativePhotoSource ?? editRecord.representativePhoto ?? '';
      const repIdx = repUri ? Math.max(0, (editRecord.medias ?? []).indexOf(repUri)) : 0;
      // 대표 사진 매칭 실패(-1) 시 첫 사진(0번)에 시드 — 의도된 폴백
      if (base.length > 0) base[repIdx] = editRecord.memo;
    }
    return base;
  });

  const [mediaPrivacy,      setMediaPrivacy]      = useState<Record<number, string[]>>(
    editRecord?.mediaPrivacy ?? {}
  );
  const [privacyModalIndex, setPrivacyModalIndex] = useState<number | null>(null);
  // 편집 재진입 시엔 저장된 고해상도 URI가 아니라 '원본(medias 항목)' URI로 복원해야
  // 그리드의 '지도대표' 표시(uri === representativePhoto)와 삭제 시 해제 비교가 동작한다.
  const [representativePhoto, setRepresentativePhoto] = useState<string | null>(
    editRecord?.representativePhotoSource ?? editRecord?.representativePhoto ?? null
  );

  // 압축본 uri → 원본 uri 매핑. "지도 대표" 사진은 저장 시 이 원본에서 고해상도로 다시 생성한다.
  const originalUriMapRef = useRef<Record<string, string>>({});
  // 지도 대표용 고해상도(장변 2560 / 품질 0.9) — 일반 미디어(1600/0.75)보다 선명
  const REP_HIRES_EDGE = 2560;
  const REP_HIRES_QUALITY = 0.9;
  // 대표 사진을 원본 기반 고해상도로 변환. 원본을 모르면(편집 등) 기존 uri 그대로 사용.
  const toRepHiRes = async (uri?: string): Promise<string | undefined> => {
    if (!uri) return uri;
    const original = originalUriMapRef.current[uri];
    if (!original) return uri;
    return compressImage(original, REP_HIRES_EDGE, REP_HIRES_QUALITY);
  };

  // 저장 중복 클릭 방지
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // 원본 uri 배열 → 이미 추가된 것·중복을 제거한 뒤 압축본 반환 + (압축본→원본) 매핑 기록.
  // 압축본 URI는 매번 달라 중복 비교가 안 되므로 반드시 '원본' 기준으로 dedup 한다.
  const addNewOriginals = async (originals: string[], currentMedias: string[]): Promise<string[]> => {
    const addedOriginals = new Set(currentMedias.map(u => originalUriMapRef.current[u] ?? u));
    const uniqueFresh = Array.from(new Set(originals.filter(o => !addedOriginals.has(o))))
      .slice(0, maxRecordPhotos - currentMedias.length);
    const compressed = await compressImages(uniqueFresh);
    compressed.forEach((u, i) => { if (u !== uniqueFresh[i]) originalUriMapRef.current[u] = uniqueFresh[i]; });
    return compressed;
  };

  const selectMedia = async () => {
    const slots = maxRecordPhotos - medias.length;
    if (slots <= 0) {
      Alert.alert(t('newRecord.noticeTitle'), t('newRecord.maxPhotosN', { max: maxRecordPhotos }));
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: slots, // slots>=1 보장 (0이면 무제한이 되어 상한 초과 위험)
        quality: 0.8,
      });
      if (!result.canceled && result.assets) {
        setLoadingMedia(true);
        const compressed = await addNewOriginals(result.assets.map(a => a.uri), medias);
        setMedias(prev => [...prev, ...compressed].slice(0, maxRecordPhotos));
        // medias 상한(slice)과 동일한 개수만 추가 — 두 배열 길이 어긋남 방지
        setPhotoTexts((prev) => {
          const addedCount = Math.max(0, Math.min(compressed.length, maxRecordPhotos - prev.length));
          return [...prev, ...Array(addedCount).fill('')];
        });
      }
    } catch (e: any) {
      Alert.alert(t('newRecord.loadFailTitle'), e?.message ?? t('newRecord.loadPhotoFailMsg'));
    } finally {
      setLoadingMedia(false);
    }
  };

  const removeMedia = (index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const removedUri = medias[index];
    if (removedUri && removedUri === representativePhoto) {
      setRepresentativePhoto(null);
    }
    setMedias(prev => prev.filter((_, i) => i !== index));
    // 삭제된 인덱스의 글 슬롯도 함께 제거
    setPhotoTexts(prev => prev.filter((_, i) => i !== index));
    // Realign mediaPrivacy indices after deletion
    setMediaPrivacy(prev => {
      const updatedPrivacy: Record<number, string[]> = {};
      Object.keys(prev).forEach(keyStr => {
        const key = Number(keyStr);
        const val = prev[key];
        if (key > index) {
          updatedPrivacy[key - 1] = val;
        } else if (key < index) {
          updatedPrivacy[key] = val;
        }
      });
      return updatedPrivacy;
    });
  };

  // 페이저 통합으로 미사용 — 재정렬 재도입 시 사용
  const handleReorderMedias = (fromIdx: number, toIdx: number) => {
    // 1. Reorder medias array
    let updatedMedias = [...medias];
    const [movedMedia] = updatedMedias.splice(fromIdx, 1);
    updatedMedias.splice(toIdx, 0, movedMedia);
    setMedias(updatedMedias);

    // 2. Reorder photoTexts — medias와 동일한 splice 변환 미러링
    setPhotoTexts(prev => {
      const updated = [...prev];
      const [movedText] = updated.splice(fromIdx, 1);
      updated.splice(toIdx, 0, movedText);
      return updated;
    });

    // 3. Reorder mediaPrivacy object to align with new indices
    setMediaPrivacy(prev => {
      const updatedPrivacy: Record<number, string[]> = {};
      Object.keys(prev).forEach(keyStr => {
        const key = Number(keyStr);
        const val = prev[key];
        if (key === fromIdx) {
          updatedPrivacy[toIdx] = val;
        } else if (fromIdx < toIdx && key > fromIdx && key <= toIdx) {
          updatedPrivacy[key - 1] = val;
        } else if (fromIdx > toIdx && key < fromIdx && key >= toIdx) {
          updatedPrivacy[key + 1] = val;
        } else {
          updatedPrivacy[key] = val;
        }
      });
      return updatedPrivacy;
    });
  };

  const toggleMediaPrivacyFriend = (mediaIdx: number, friend: string) => {
    setMediaPrivacy(prev => {
      const current = prev[mediaIdx] || [];
      const updated = current.includes(friend)
        ? current.filter(f => f !== friend)
        : [...current, friend];
      return { ...prev, [mediaIdx]: updated };
    });
  };

  // 비공개 대상 전체 설정(전체 비공개) / 전체 해제 — 한 번에 목록을 통째로 교체해
  // 개별 친구 체크 상태까지 즉시 동기화한다.
  const setMediaPrivacyAll = (mediaIdx: number, friends: string[]) => {
    setMediaPrivacy(prev => ({ ...prev, [mediaIdx]: friends }));
  };

  // Step 3 - 제목 · 날짜 · 글 · 별점
  const todayInit = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
  // 신규 작성이면 여행 카드에서 넘어온 기간(tripPeriod)을 기본 날짜로, 없으면 오늘
  const newStartInit = tripPeriod?.startDate ? parseDotDate(tripPeriod.startDate) : todayInit;
  const newEndInit = tripPeriod?.endDate ? parseDotDate(tripPeriod.endDate) : newStartInit;
  const [title]                               = useState(editRecord?.content ?? '');
  const [startDate,       setStartDate]       = useState(
    editRecord ? parseDotDate(editFirstCountryData?.startDate ?? editRecord.startDate ?? editRecord.date) : newStartInit
  );
  const [endDate,         setEndDate]         = useState(
    editRecord ? parseDotDate(editFirstCountryData?.endDate ?? editRecord.endDate ?? editRecord.date) : newEndInit
  );

  // ── 작성 화면 참고용 서랍: 선택 국가+날짜로 순간 매칭 ──
  // startDate/endDate는 Date 타입(NewRecordScreen 내부 parseDotDate 반환값)
  const matchedMoments = useMemo(() => {
    const first = selectedCountries[0] ?? null;
    const startMs = startDate instanceof Date ? startDate.getTime() : null;
    const endMs = endDate instanceof Date ? endDate.getTime() : (startMs ?? null);
    return matchMoments(allMoments, {
      countryCode: countryNameToCode(first?.name),
      startMs,
      endMs,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMoments, selectedCountries, startDate, endDate]);

  const [calendarVisible, setCalendarVisible] = useState(false);
  const [momentSheetVisible, setMomentSheetVisible] = useState(false); // ✨ 여행 기억 시트 (헤더 버튼)
  // memo state 제거 — 사진별 글(photoTexts)이 본문을 대체하고 저장 시 대표 글을 memo로 복사함
  const [rating,          setRating]          = useState(editFirstCountryData?.rating ?? editRecord?.rating ?? 0);
  // 공개 범위 (공통) — 편집 시 기존 값 유지, 신규는 친구만 기본
  const [visibility,      setVisibility]      = useState<Visibility>(editRecord?.visibility ?? 'neighbors');

  // ── 국가별 데이터 관리 (2개국 이상 선택 시) ──
  const isMultiCountry = selectedCountries.length > 1;
  const [activeCountryIdx, setActiveCountryIdx] = useState(0);

  const handleReorder = (newCountries: { flag: string; name: string }[]) => {
    const activeCountryName = selectedCountries[activeCountryIdx]?.name;
    setSelectedCountries(newCountries);
    if (activeCountryName) {
      const newIdx = newCountries.findIndex(c => c.name === activeCountryName);
      if (newIdx !== -1) {
        setActiveCountryIdx(newIdx);
      } else {
        setActiveCountryIdx(0);
      }
    } else {
      setActiveCountryIdx(0);
    }
  };

  const handleRemoveCountry = (name: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedCountries(prev => {
      const filtered = prev.filter(p => p.name !== name);
      const activeCountryName = selectedCountries[activeCountryIdx]?.name;
      // 제거된 국가의 국가별 데이터도 폐기 — 저장 시 잔존 데이터가 섞이지 않게
      delete perCountryStore.current[name];
      if (activeCountryName === name) {
        setActiveCountryIdx(0);
        // 활성 국가를 제거하면 전역 날짜·별점에 그 국가 값이 남아, 이후 저장 시
        // 새 활성 국가(0번) 이름으로 기록되는 이월 오염이 생긴다 — switchCountry와 동일하게 로드/초기화
        const nextName = filtered[0]?.name;
        const data = nextName ? perCountryStore.current[nextName] : null;
        if (data) {
          setStartDate(data.startDate);
          setEndDate(data.endDate);
          setRating(data.rating);
        } else {
          setStartDate(todayInit);
          setEndDate(todayInit);
          setRating(0);
        }
      } else if (activeCountryName) {
        const newIdx = filtered.findIndex(c => c.name === activeCountryName);
        setActiveCountryIdx(newIdx !== -1 ? newIdx : 0);
      } else {
        setActiveCountryIdx(0);
      }
      return filtered;
    });
  };

  // 국가별로 구분해 받는 건 날짜·별점뿐 — 사진은 여행 전체 공용(전역 medias)
  const perCountryStore = useRef<Record<string, {
    startDate: Date;
    endDate: Date;
    rating: number;
  }>>(
    // 편집 모드: 기존 국가별 데이터를 시딩해서 국가 전환 시 그대로 표시
    (() => {
      const store: Record<string, { startDate: Date; endDate: Date; rating: number }> = {};
      if (editRecord?.perCountryData) {
        for (const [name, d] of Object.entries(editRecord.perCountryData)) {
          store[name] = {
            startDate: parseDotDate(d.startDate),
            endDate: parseDotDate(d.endDate),
            rating: d.rating ?? 0,
          };
        }
      }
      return store;
    })()
  );

  // 현재 국가 데이터 저장
  const saveCurrentCountryData = () => {
    const name = selectedCountries[activeCountryIdx]?.name;
    if (name) {
      perCountryStore.current[name] = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        rating,
      };
    }
  };

  // 국가 전환 (날짜·별점만 국가별로 스왑 — 사진은 공용이라 그대로 둔다)
  const switchCountry = (newIdx: number) => {
    if (newIdx === activeCountryIdx) return;
    saveCurrentCountryData();
    const newName = selectedCountries[newIdx]?.name;
    const data = newName ? perCountryStore.current[newName] : null;
    if (data) {
      setStartDate(data.startDate);
      setEndDate(data.endDate);
      setRating(data.rating);
    } else {
      setStartDate(todayInit);
      setEndDate(todayInit);
      setRating(0);
    }
    setActiveCountryIdx(newIdx);
  };

  const STAR_SIZE = 32;
  const STAR_GAP  = 6;
  const ratingRowRef    = useRef<View>(null);
  const ratingRowPageX  = useRef(0);

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
      onMoveShouldSetPanResponder:  () => true,
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
        <View key={i} style={s.starWrap}>
          <Text style={[s.starChar, s.starAbsolute]}>☆</Text>
          {(isFull || isHalf) && (
            <View style={[s.starFillClip, { width: isHalf ? STAR_SIZE / 2 : STAR_SIZE }]}>
              <Text style={[s.starChar, s.starCharActive, s.starAbsolute]}>★</Text>
            </View>
          )}
        </View>
      );
    }
    return (
      <View ref={ratingRowRef} style={s.ratingRow} {...ratingPanResponder.panHandlers}>
        {stars}
      </View>
    );
  };

  const formatDate = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;

  // 동행자 (step 3)
  const [selectedCompanions, setSelectedCompanions] = useState<string[]>(editRecord?.companions ?? []);
  const [companionFriends,   setCompanionFriends]   = useState<string[]>(editRecord?.companionFriends ?? []);
  const [friendPickerVisible, setFriendPickerVisible] = useState(false);

  const toggleCompanion = (comp: string) => {
    setSelectedCompanions(prev => prev.includes(comp) ? prev.filter(c => c !== comp) : [...prev, comp]);
  };
  const toggleCompanionFriend = (friend: string) => {
    setCompanionFriends(prev =>
      prev.includes(friend) ? prev.filter(f => f !== friend) : [...prev, friend]
    );
  };
  const removeCompanionFriend = (friend: string) => {
    setCompanionFriends(prev => prev.filter(f => f !== friend));
  };

  // 선택 항목 (step 3)
  const [budget,     setBudget]     = useState(editRecord?.budget ? String(editRecord.budget.amount) : '');
  const [currency,   setCurrency]   = useState(editRecord?.budget?.currency ?? 'KRW');
  // 사용자가 통화를 직접 고르면 국가 기반 자동 추천을 멈춘다 (편집 모드는 처음부터 수동 취급)
  const currencyTouchedRef = useRef(isEdit);
  const chooseCurrency = (code: string) => { currencyTouchedRef.current = true; setCurrency(code); };
  // 대표(첫) 국가에 맞춰 기본 통화 자동 추천 — 사용자가 직접 고르기 전까지
  useEffect(() => {
    if (currencyTouchedRef.current) return;
    const cur = currencyForCountryName(selectedCountries[0]?.name);
    if (cur) setCurrency(cur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCountries[0]?.name]);
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [weather,    setWeather]    = useState(editRecord?.weather ?? '');
  const [flightType, setFlightType] = useState(editRecord?.flightType ?? '');
  const [keywords,   setKeywords]   = useState<string[]>(editRecord?.keywords ?? []);
  const [keywordQuery, setKeywordQuery] = useState('');

  const CURRENCIES     = ['KRW', 'JPY', 'USD'];
  // OTHER_CURRENCIES 목록은 components/record/CurrencyPickerModal 로 이동
  // 라벨 이모지 제거 — 버튼에 SVG 날씨 아이콘(WEATHER_ICON_MAP)이 이미 있어 이중 표시였음
  const WEATHER_OPTIONS = [
    { label: t('newRecord.wSunny'),  value: '맑음' },
    { label: t('newRecord.wPartly'), value: '부분흐림' },
    { label: t('newRecord.wCloudy'), value: '흐림' },
    { label: t('newRecord.wRain'),   value: '비' },
    { label: t('newRecord.wSnow'),   value: '눈' },
    { label: t('newRecord.wWind'),   value: '바람' },
  ];
  const FLIGHT_OPTIONS  = ['직항', '경유'];
  const flightLabel = (f: string) => (f === '직항' ? t('newRecord.flightDirect') : t('newRecord.flightLayover'));
  const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
    { value: 'neighbors', label: `🏡 ${t('newRecord.visNeighbors')}` },
    { value: 'private',   label: `🔒 ${t('newRecord.visPrivate')}` },
  ];
  const KEYWORD_OPTIONS = ['#맛집','#쇼핑','#자연','#역사','#휴양','#액티비티','#도시','#힐링','#백패킹','#럭셔리'];

  const toggleKeyword = (kw: string) =>
    setKeywords(prev => prev.includes(kw) ? prev.filter(k => k !== kw) : [...prev, kw]);

  // ── 미디어 로딩 상태 ──
  const [loadingMedia,            setLoadingMedia]            = useState(false);

  // ── 미디어 선택 모달 (상한 초과 시) ──
  const [mediaPickerVisible,  setMediaPickerVisible]  = useState(false);
  const [mediaPickerAssets,   setMediaPickerAssets]   = useState<MediaLibrary.Asset[]>([]);
  const [mediaPickerSelected, setMediaPickerSelected] = useState<Set<string>>(new Set());
  const [mediaPickerMax,      setMediaPickerMax]      = useState(maxRecordPhotos);
  // 모달 열기 전 iCloud 사유로 제외된 장수 — 완료 메시지 안내에 사용
  const cloudSkippedRef = useRef(0);
  // 기간 내 사진이 검색 상한(500장)을 넘어 일부만 확인했는지 — 완료 메시지 안내에 사용
  const truncatedRef = useRef(false);

  const toggleMediaPickerItem = (id: string) => {
    setMediaPickerSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= mediaPickerMax) return prev;
        next.add(id);
      }
      return next;
    });
  };

  // ph:// 에셋을 표시·복사 가능한 로컬 file:// 로 변환한다 (ph:// 그대로 두면
  // 새 아키텍처에서 검은 타일로 뜸). 원본이 기기에 없는(iCloud 오프로드) 사진은
  // cloud로 분리해 돌려주고, 호출부가 2차 다운로드(downloadCloudAssets)를 시도한다.
  const resolveImportable = async (
    assets: MediaLibrary.Asset[]
  ): Promise<{ ok: { asset: MediaLibrary.Asset; uri: string }[]; cloud: MediaLibrary.Asset[] }> => {
    const probed = await Promise.all(
      assets.map(async (asset) => {
        try {
          if (Platform.OS === 'ios' && asset.uri.startsWith('ph://')) {
            const info = await MediaLibrary.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: false });
            return info.localUri
              ? { kind: 'ok' as const, asset, uri: info.localUri }
              : { kind: 'cloud' as const, asset }; // localUri 없음 = iCloud 오프로드 → 2차 시도 대상
          }
          return { kind: 'ok' as const, asset, uri: asset.uri };
        } catch {
          return { kind: 'cloud' as const, asset }; // 판정 실패도 2차 시도에 넘겨본다
        }
      })
    );
    return {
      ok: probed.filter((p): p is { kind: 'ok'; asset: MediaLibrary.Asset; uri: string } => p.kind === 'ok')
        .map(({ asset, uri }) => ({ asset, uri })),
      cloud: probed.filter((p) => p.kind === 'cloud').map((p) => p.asset),
    };
  };

  // iCloud 오프로드 사진 2차 시도 — 네트워크 다운로드 허용 + 장당 타임아웃.
  // 순차 처리(동시 다운로드로 인한 실패·메모리 급증 방지)하며 진행률을 표시한다.
  // 장수 제한 없음: 기간 내 전부 시도해 선택 모달에 올리고, 기록에 담을 장수는 모달에서 고른다.
  // 오래 걸릴 수 있어 취소 버튼 제공 — 취소 시 그때까지 받은 것만 반영.
  const ICLOUD_DL_TIMEOUT_MS = 15000;
  const [cloudProgress, setCloudProgress] = useState<{ done: number; total: number } | null>(null);
  const cloudCancelRef = useRef(false);
  const downloadCloudAssets = async (
    assets: MediaLibrary.Asset[]
  ): Promise<{ asset: MediaLibrary.Asset; uri: string }[]> => {
    if (assets.length === 0) return [];
    const oks: { asset: MediaLibrary.Asset; uri: string }[] = [];
    cloudCancelRef.current = false;
    setCloudProgress({ done: 0, total: assets.length });
    try {
      for (let i = 0; i < assets.length; i++) {
        if (cloudCancelRef.current) break; // 사용자 취소 → 받은 것까지만 사용
        try {
          const info = await withTimeout(
            MediaLibrary.getAssetInfoAsync(assets[i], { shouldDownloadFromNetwork: true }),
            ICLOUD_DL_TIMEOUT_MS
          );
          if (info?.localUri) oks.push({ asset: assets[i], uri: info.localUri });
        } catch {
          // 다운로드 실패/타임아웃 → 제외 유지 (완료 알림의 iCloud 안내에 집계됨)
        }
        setCloudProgress({ done: i + 1, total: assets.length });
      }
    } finally {
      setCloudProgress(null);
    }
    return oks;
  };

  // iCloud 제외분 안내 문구 (없으면 빈 문자열)
  const cloudNote = (skipped: number) =>
    skipped > 0 ? t('newRecord.cloudNote', { count: skipped }) : '';

  // 500장 상한으로 일부만 확인했을 때의 안내 문구 (없으면 빈 문자열)
  const truncatedNote = () => (truncatedRef.current ? t('newRecord.truncatedNote') : '');

  const confirmMediaPickerSelection = async () => {
    const selectedAssets = mediaPickerAssets.filter(a => mediaPickerSelected.has(a.id));
    setMediaPickerVisible(false);
    setLoadingMedia(true);

    try {
      // 모달의 사진은 대부분 이미 확보된 로컬본이지만, iCloud분이 섞였을 수 있어 2차 시도 포함
      const { ok: localOk, cloud } = await resolveImportable(selectedAssets);
      const cloudOk = await downloadCloudAssets(cloud);
      const ok = [...localOk, ...cloudOk];
      const resolvedUris = await addNewOriginals(ok.map((p) => p.uri), medias);

      setMedias((prev) => [...prev, ...resolvedUris].slice(0, maxRecordPhotos));
      // medias 상한(slice)과 동일한 개수만 추가 — 두 배열 길이 어긋남 방지
      setPhotoTexts((prev) => {
        const addedCount = Math.max(0, Math.min(resolvedUris.length, maxRecordPhotos - prev.length));
        return [...prev, ...Array(addedCount).fill('')];
      });

      // 모달에는 이미 가져올 수 있는 사진만 담겼으므로, 제외 안내는 모달 열기 전 집계분을 쓴다
      if (resolvedUris.length === 0) {
        Alert.alert(t('newRecord.noticeTitle'), t('newRecord.allDuplicateMsg') + cloudNote(cloudSkippedRef.current));
      } else {
        Alert.alert(t('newRecord.loadDoneTitle'), t('newRecord.loadedNPhotos', { count: resolvedUris.length }) + truncatedNote() + cloudNote(cloudSkippedRef.current));
      }
    } catch (e: any) {
      Alert.alert(t('newRecord.loadFailTitle'), e?.message ?? t('newRecord.galleryLoadFailMsg'));
    } finally {
      setLoadingMedia(false);
    }
  };

  // ── 일괄 검증 ──
  // 모든 선택 국가에 평점이 채워졌는지 (활성 국가는 전역 rating, 나머지는 국가별 저장값)
  const allRatingsFilled = selectedCountries.every((c, idx) =>
    idx === activeCountryIdx ? rating > 0 : (perCountryStore.current[c.name]?.rating ?? 0) > 0
  );

  const missing = (): { key: 'photo' | 'country' | 'required'; msg: string } | null => {
    if (medias.length === 0) return { key: 'photo', msg: t('newRecord.missPhoto') };
    if (!representativePhoto) return { key: 'photo', msg: t('newRecord.missRepPhoto') };
    if (selectedCountries.length === 0) return { key: 'country', msg: t('newRecord.missCountry') };
    if (selectedCompanions.length === 0) return { key: 'required', msg: t('newRecord.missCompanion') };
    if (!allRatingsFilled) return { key: 'required', msg: isMultiCountry ? t('newRecord.missAllCountryRatings') : t('newRecord.missRating') };
    return null;
  };

  const canSave = missing() === null;

  const handleSave = async () => {
    if (selectedCountries.length === 0) {
      Alert.alert(t('newRecord.selectCountryTitle'), t('newRecord.selectCountryMsg'));
      return;
    }
    // 다국가 신규 작성: 하나의 여행으로 합칠지, 국가별로 나눌지 선택
    // (수정 모드는 기존 합본 구조 유지 — 분할하면 기존 게시물·댓글과의 연결이 깨짐)
    if (!isEdit && selectedCountries.length > 1) {
      Alert.alert(
        t('newRecord.splitAskTitle'),
        t('newRecord.splitAskMsg', { count: selectedCountries.length }),
        [
          { text: t('newRecord.splitAskCancel'), style: 'cancel' },
          { text: t('newRecord.splitAskSplit'), onPress: () => { doSave(true); } },
          { text: t('newRecord.splitAskMerge'), onPress: () => { doSave(false); } },
        ]
      );
      return;
    }
    await doSave(false);
  };

  const doSave = async (splitByCountry: boolean) => {
    if (savingRef.current) return; // 중복 실행 방지 (다이얼로그 이중 탭 등)
    savingRef.current = true;
    setSaving(true);
    try {
      // 현재 활성 국가 데이터 저장
      saveCurrentCountryData();

      const first = selectedCountries[0];

      // 국가별 데이터 수집 — 날짜·별점만 (사진은 여행 전체 공용 medias)
      const pcd: Record<string, { startDate?: string; endDate?: string; rating?: number }> = {};
      let firstRating = 0;
      let firstStart = formatDate(todayInit);
      let firstEnd = formatDate(todayInit);

      selectedCountries.forEach((c, i) => {
        const d = perCountryStore.current[c.name];
        if (d) {
          pcd[c.name] = {
            startDate: formatDate(d.startDate),
            endDate: formatDate(d.endDate),
            rating: d.rating,
          };
          if (i === 0) {
            firstRating = d.rating;
            firstStart = formatDate(d.startDate);
            firstEnd = formatDate(d.endDate);
          }
        }
      });

      // 지도 대표 사진만 원본 기반 고해상도로 교체 (일반 미디어는 1600 유지).
      // 편집에서 대표가 안 바뀌었으면 기존 고해상도를 유지한다 — 이번 세션엔 원본 매핑이 없어
      // toRepHiRes가 압축본(1600)을 그대로 돌려줘 지도 커버 화질이 떨어지기 때문.
      const repUnchanged =
        isEdit && editRecord && !!representativePhoto &&
        representativePhoto === editRecord.representativePhotoSource;
      const firstRepHiRes = repUnchanged
        ? editRecord!.representativePhoto
        : await toRepHiRes(representativePhoto || undefined);

      // 사진별 글 저장 + 하위 호환: 대표 사진의 글을 memo로 복사
      // (피드 미리보기·검색·백업이 memo를 읽으므로 대표 글을 채워 둠)
      const repIndex = Math.max(0, medias.indexOf(representativePhoto ?? ''));

      const payload = {
        country: `${first.flag} ${first.name}`,
        countryName: first.name,
        countryFlag: first.flag,
        countries: selectedCountries,
        // "국가별로 나누기" 선택 시 — 게시물은 하나지만 프로필 카드는 국가별로 그려진다.
        // 수정 모드에선 선택 다이얼로그가 없으므로 기존 기록의 값을 보존한다.
        splitByCountry: (isEdit ? editRecord?.splitByCountry : splitByCountry) || undefined,
        regionName: selectedRegion?.name || undefined,
        regionNameEn: selectedRegion?.nameEn || undefined,
        perCountryData: Object.keys(pcd).length > 0 ? pcd : undefined,
        representativePhoto: firstRepHiRes,
        representativePhotoSource: representativePhoto || undefined, // 편집 재진입 매칭용 (medias 항목 URI)
        date: firstStart,
        content: title || (selectedCountries.length === 1
          ? t('newRecord.defaultTitleOne', { country: first.name })
          : t('newRecord.defaultTitleMany', { country: first.name, count: selectedCountries.length - 1 })),
        photoTexts,
        memo: photoTexts[repIndex] ?? '',
        rating: firstRating,
        companions: selectedCompanions,
        companionFriends,
        visibility,
        medias,
        mediaPrivacy,
        startDate: firstStart,
        endDate: firstEnd,
        budget:     budget ? { amount: Number(budget), currency } : undefined,
        weather:    weather    || undefined,
        flightType: flightType || undefined,
        keywords:   keywords.length > 0 ? keywords : undefined,
      };

      if (isEdit && editRecord) {
        // 작성자·형식은 유지하고 내용(공개 범위 포함)만 갱신
        updateRecord(editRecord.id, payload);
      } else {
        const recId = addRecord(
          {
            user: { name: '', emoji: '✈️', handle: '' }, // addRecord가 로그인 사용자로 채움
            viewType: 'feed',
            ...payload,
          },
          // 나누기 모드에선 자동 그룹(대표국 1장) 대신 아래에서 국가별 카드를 직접 만든다
          { linkTrip: !splitByCountry }
        );
        if (splitByCountry) {
          // 같은 기록 하나를 국가별 여행 카드로 — 날짜는 국가별, 커버는 공용 대표사진.
          // session: 여행 중 작성(실시간)이면 카드가 세션에 등록돼 이후 그 국가의 스냅이 합류한다
          selectedCountries.forEach((c) => {
            const d = pcd[c.name];
            addTripGroup(
              {
                title: `${c.name} 여행`, // 자동 그룹(linkRecordToTrip)과 동일한 이름 규칙
                records: [recId],
                coverRecordId: recId,
                countryName: c.name,
                countryFlag: c.flag,
                date: d?.startDate,
              },
              { session: { startDate: d?.startDate, endDate: d?.endDate, date: d?.startDate } }
            );
          });
        }
      }
      savedRef.current = true;
      navigation.goBack();
    } catch {
      // 저장 실패 시에만 재시도 허용 (성공 시 goBack 으로 화면 이탈)
      savingRef.current = false;
      setSaving(false);
    }
  };

  // 입력 중 이탈 방지 (취소/뒤로가기/제스처) — 저장 시엔 건너뜀
  // 최신 입력 여부는 ref로 참조 → 리스너는 1회만 등록 (키 입력마다 재구독 방지)
  const hasInput =
    selectedCountries.length > 0 || medias.length > 0 || photoTexts.some(text => text.trim().length > 0) ||
    rating > 0 || selectedCompanions.length > 0 || keywords.length > 0 ||
    !!budget || !!weather || !!flightType;
  const hasInputRef = useRef(hasInput);
  hasInputRef.current = hasInput;

  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e) => {
      if (savedRef.current || !hasInputRef.current) return;
      e.preventDefault();
      Alert.alert(t('newRecord.cancelWriteTitle'), t('newRecord.cancelWriteMsg'), [
        { text: t('newRecord.continueWrite'), style: 'cancel' },
        { text: t('newRecord.exit'), style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return sub;
  }, [navigation]);

  // 필수 미충족 시 빠진 항목 안내
  const showHint = (msg: string) => { setHintMsg(msg); setTimeout(() => setHintMsg(''), 2200); };

  // 하단 저장 바 버튼 핸들러
  const handleSaveBarPress = async () => {
    if (savingRef.current) return; // 저장 중복 클릭 방지
    const miss = missing();
    if (miss) {
      showHint(miss.msg);
      // 미충족 박스 자동 펼침 후 LayoutAnimation 완료 후 scrollTo (LayoutAnimation ~300ms)
      if (miss.key === 'country' || miss.key === 'required') {
        const targetBox = miss.key === 'country' ? 'country' : 'required';
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setOpenBox(targetBox);
        setTimeout(() => {
          scrollRef.current?.scrollTo({ y: sectionYRef.current[miss.key], animated: true });
        }, 350);
      } else {
        scrollRef.current?.scrollTo({ y: sectionYRef.current[miss.key], animated: true });
      }
      return;
    }
    // 저장 플래그는 doSave가 직접 관리한다 (다국가 다이얼로그 취소 시 플래그 리셋 불필요)
    await handleSave();
  };

  // 키워드 추가 (선행 # 정규화 + 중복 방지 + 빈값 무시 + 개수/길이 제한)
  const KEYWORD_MAX = 10;
  const KEYWORD_MAXLEN = 20;
  const addKeyword = (raw: string) => {
    const base = raw.trim().replace(/^#+/, '').trim().slice(0, KEYWORD_MAXLEN);
    if (!base) { setKeywordQuery(''); return; }
    const tag = `#${base}`;
    setKeywords(prev => {
      if (prev.includes(tag)) return prev;
      if (prev.length >= KEYWORD_MAX) { showHint(t('newRecord.keywordMax', { max: KEYWORD_MAX })); return prev; }
      return [...prev, tag];
    });
    setKeywordQuery('');
  };

  // summary 헬퍼 — 박스 A
  const countrySummary = (): string => {
    if (selectedCountries.length === 0) return '';
    if (selectedCountries.length === 1) return `${selectedCountries[0].flag} ${selectedCountries[0].name}`;
    return t('newRecord.countryOthers', { name: `${selectedCountries[0].flag} ${selectedCountries[0].name}`, count: selectedCountries.length - 1 });
  };

  // summary 헬퍼 — 박스 B (날짜·동행자·별점)
  const requiredSummary = (): string => {
    const parts: string[] = [];
    if (startDate && endDate) {
      const sd = `${String(startDate.getMonth()+1).padStart(2,'0')}.${String(startDate.getDate()).padStart(2,'0')}`;
      const ed = `${String(endDate.getMonth()+1).padStart(2,'0')}.${String(endDate.getDate()).padStart(2,'0')}`;
      parts.push(sd === ed ? sd : `${sd}~${ed}`);
    }
    if (selectedCompanions.length > 0) parts.push(companionLabel(selectedCompanions[0]) + (selectedCompanions.length > 1 ? ` 외 ${selectedCompanions.length-1}` : ''));
    if (rating > 0) parts.push(`★${rating.toFixed(1)}`);
    return parts.join(' · ');
  };

  // summary 헬퍼 — 박스 C (선택 입력 항목 수)
  const optionalFilledCount = (): number => {
    let n = 0;
    if (budget) n++;
    if (weather) n++;
    if (flightType) n++;
    if (keywords.length > 0) n++;
    if (visibility !== 'neighbors') n++;
    return n;
  };

  // ─── 렌더 ───
  return (
    <SafeAreaView style={s.safeArea}>
      {/* 헤더 */}
      <View style={s.header}>
        <TouchableOpacity style={s.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={s.cancelTxt}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{isEdit ? t('newRecord.editTitle') : t('newRecord.newTitle')}</Text>
        {/* ✨ 여행 기억 — 선택한 국가·날짜에 매칭되는 순간 목록 (참고용) */}
        <TouchableOpacity
          style={{ width: 44, alignItems: 'flex-end', padding: 4 }}
          onPress={() => setMomentSheetVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={t('moments.sheetTitle')}
        >
          <Text style={{ fontSize: 16 }}>✨</Text>
        </TouchableOpacity>
      </View>

      {/* Android: edge-to-edge(SDK54)에서 adjustResize가 무력화될 수 있어 'height'로 스크롤 영역을 직접 축소 */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEnabled={scrollEnabled}
        >

          {/* ══════════════════ ① 사진 섹션 ══════════════════ */}
          <View
            onLayout={(e) => { sectionYRef.current.photo = e.nativeEvent.layout.y; }}
          >
            <Text style={s.sectionLabel}>{t('newRecord.sectionPhoto')}</Text>

            {/* 큰 페이저 + 사진별 글 입력 + 액션(대표·비공개·삭제) */}
            <PhotoPagerSection
              medias={medias}
              photoTexts={photoTexts}
              representativePhoto={representativePhoto}
              onChangeText={(i, v) => setPhotoTexts((prev) => prev.map((x, k) => (k === i ? v : x)))}
              onAddPress={selectMedia}
              onSetRepresentative={(idx) => {
                const uri = medias[idx];
                if (uri) setRepresentativePhoto(prev => prev === uri ? null : uri);
              }}
              onRemove={removeMedia}
              onPrivacyPress={(idx) => setPrivacyModalIndex(idx)}
              privacyMarks={medias.map((_, idx) => (mediaPrivacy[idx]?.length ?? 0) > 0)}
            />

            {loadingMedia && (
              <View style={{ marginTop: 12, marginVertical: 12, alignItems: 'center', gap: 6 }}>
                <ActivityIndicator color={skinAccent.accent} size="large" />
                {cloudProgress && (
                  <>
                    <Text style={s.cloudProgressText}>
                      {t('newRecord.cloudDownloading', { done: cloudProgress.done, total: cloudProgress.total })}
                    </Text>
                    <TouchableOpacity
                      style={[s.cloudCancelBtn, { backgroundColor: skinAccent.tint(0.12), borderColor: skinAccent.tint(0.3) }]}
                      onPress={() => { cloudCancelRef.current = true; }}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={t('newRecord.cloudCancelA11y')}
                    >
                      <Text style={[s.cloudCancelText, { color: skinAccent.accent }]}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            {/* 갤러리 선택 버튼은 사진 있을 때만 표시 */}
            {medias.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <TouchableOpacity
                  style={[s.addMediaBtn, { borderColor: skinAccent.tint(0.35) }, medias.length >= maxRecordPhotos && s.addMediaBtnDisabled]}
                  onPress={selectMedia}
                  activeOpacity={0.8}
                  disabled={medias.length >= maxRecordPhotos}
                >
                  <View style={s.addMediaLeft}>
                    <DesignerCameraIcon size={20} color={skinAccent.accent} />
                    <View>
                      <Text style={s.addMediaText}>{t('newRecord.selectFromGallery')}</Text>
                      <Text style={s.addMediaSub}>{t('newRecord.maxPhotosSub', { max: maxRecordPhotos })}</Text>
                    </View>
                  </View>
                  <View style={[s.addMediaCountBadge, { backgroundColor: skinAccent.tint(0.15) }]}>
                    <Text style={[s.addMediaCountTxt, { color: skinAccent.accent }]}>{medias.length}/{maxRecordPhotos}</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ══════════════════ ② 박스 A: 국가 선택 ══════════════════ */}
          <View
            onLayout={(e) => { sectionYRef.current.country = e.nativeEvent.layout.y; }}
          >
            <CollapsibleBox
              title={t('newRecord.sectionCountry')}
              summary={countrySummary()}
              expanded={openBox === 'country'}
              onToggle={() => toggleBox('country')}
            >
              {/* 선택된 국가 목록 */}
              {selectedCountries.length === 1 && (
                <View style={s.selectedChipsWrap}>
                  {selectedCountries.map((c) => (
                    <View key={c.name} style={[s.countryChip, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.tint(0.3) }]}>
                      <Text style={[s.countryChipText, { color: skinAccent.accent }]}>{c.flag} {c.name}</Text>
                      <TouchableOpacity
                        onPress={() => handleRemoveCountry(c.name)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={s.countryChipRemove}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {selectedCountries.length >= 2 && (
                <View style={{ marginBottom: 12 }}>
                  <DraggableCountryList
                    countries={selectedCountries}
                    onReorder={handleReorder}
                    onRemove={handleRemoveCountry}
                    onDragStateChange={(isDragging) => setScrollEnabled(!isDragging)}
                  />
                  <Text style={s.draggableHelperText}>
                    {t('newRecord.dragCountryHint')}
                  </Text>
                </View>
              )}

              {/* 국내 지역 선택 */}
              {(isDomesticSelected || isStaySelected) && homeRegions.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={s.regionPickLabel}>{t('newRecord.domesticRegionLabel')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                      {homeRegions.map((r) => {
                        const active = selectedRegion?.name === r.name;
                        return (
                          <TouchableOpacity
                            key={r.name}
                            style={[s.regionPickChip, active && [s.regionPickChipActive, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.accent }]]}
                            onPress={() => setSelectedRegion(active ? null : { name: r.name, nameEn: r.nameEn })}
                            activeOpacity={0.75}
                          >
                            <Text style={[s.regionPickChipText, active && [s.regionPickChipTextActive, { color: skinAccent.accent }]]}>{r.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              )}

              {/* 검색창 */}
              <View style={[s.searchCard, selectedCountries.length > 0 ? [s.searchCardSelected, { borderColor: skinAccent.accent }] : null]}>
                <View style={s.searchRow}>
                  <SearchIcon size={16} color={COLORS.textDim} />
                  <TextInput
                    style={s.searchInput}
                    placeholder={selectedCountries.length > 0
                      ? t('newRecord.searchMore')
                      : t('newRecord.searchCountry')}
                    placeholderTextColor={COLORS.textMuted}
                    value={countrySearch}
                    onChangeText={setCountrySearch}
                  />
                  {countrySearch.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setCountrySearch('')}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={s.clearBtnTxt}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* 검색 결과 */}
              {countrySearch.length >= 1 && (
                <View style={s.countryResultBox}>
                  <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {groupedCountries.length === 0 ? (
                      <Text style={s.noResultText}>{t('newRecord.noResult')}</Text>
                    ) : (
                      groupedCountries.map(({ continent, countries }) => (
                        <View key={continent}>
                          <Text style={[s.continentHeader, { color: skinAccent.accent }]}>{continentLabel(continent, i18n.language)}</Text>
                          {countries.map(c => {
                            const isSelected = selectedCountries.some(sc => sc.name === c.name);
                            return (
                              <TouchableOpacity
                                key={c.name}
                                style={[s.countryItem, isSelected && [s.countryItemSelected, { backgroundColor: skinAccent.tint(0.08) }]]}
                                onPress={() => {
                                  if (isSelected) {
                                    handleRemoveCountry(c.name);
                                  } else if (selectedCountries.length < MAX_COUNTRIES) {
                                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                    setSelectedCountries(prev => [...prev, { flag: c.flag, name: c.name }]);
                                  }
                                }}
                              >
                                <Text style={s.countryIcon}>{c.flag}</Text>
                                <Text style={[s.countryName, isSelected && [s.countryNameSelected, { color: skinAccent.accent }]]}>{c.name}</Text>
                                {isSelected && <Text style={[s.countryCheckMark, { color: skinAccent.accent }]}>✓</Text>}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ))
                    )}
                  </ScrollView>
                </View>
              )}

              {/* 안내 문구 */}
              {selectedCountries.length === 0 && countrySearch.length === 0 && (
                <Text style={s.stepHint}>{t('newRecord.countryHint')}</Text>
              )}

              {/* 선택 완료 확인 */}
              {selectedCountries.length > 0 && countrySearch.length === 0 && (
                <View style={[s.selectedBadge, { backgroundColor: skinAccent.tint(0.12) }]}>
                  <Text style={[s.selectedBadgeTxt, { color: skinAccent.accent }]}>✓ {t('newRecord.countrySelectedDone', { count: selectedCountries.length })}{selectedCountries.length < MAX_COUNTRIES ? t('newRecord.countryCanAdd') : t('newRecord.countryMax')}</Text>
                </View>
              )}

              {/* 여행 기억(✨)은 헤더 우측 버튼 → MomentListSheet로 이동(사용자 결정) */}
            </CollapsibleBox>
          </View>

          {/* ══════════════════ ③ 박스 B: 필수 여행 정보 ══════════════════ */}
          <View
            onLayout={(e) => { sectionYRef.current.required = e.nativeEvent.layout.y; }}
          >
            <CollapsibleBox
              title={t('newRecord.boxRequired')}
              summary={requiredSummary()}
              expanded={openBox === 'required'}
              onToggle={() => toggleBox('required')}
            >
              <View style={s.step3Wrap}>
                {/* 국가별 탭 (2개국 이상) */}
                {isMultiCountry && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.countryTabScroll} contentContainerStyle={s.countryTabContent}>
                    {selectedCountries.map((c, idx) => (
                      <TouchableOpacity
                        key={c.name}
                        style={[s.countryTab, idx === activeCountryIdx && [s.countryTabActive, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.accent }]]}
                        onPress={() => switchCountry(idx)}
                        activeOpacity={0.75}
                      >
                        <Text style={[s.countryTabText, idx === activeCountryIdx && [s.countryTabTextActive, { color: skinAccent.accent }]]}>{c.flag} {c.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                {/* 날짜 (국가별) */}
                <View style={s.fieldBlock}>
                  <View style={s.perCountryLabelRow}>
                    <Text style={s.fieldLabelReq}>{t('newRecord.date')}</Text>
                    <Text style={[s.reqTag, { color: skinAccent.accent }]}>✱</Text>
                    {isMultiCountry && (
                      <Text style={[s.perCountryHint, { color: skinAccent.accent, backgroundColor: skinAccent.tint(0.1) }]}>{selectedCountries[activeCountryIdx]?.flag} {selectedCountries[activeCountryIdx]?.name}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={s.dateBtn}
                    onPress={() => setCalendarVisible(true)}
                    activeOpacity={0.85}
                  >
                    <View style={s.dateBtnCol}>
                      <Text style={s.dateBtnLabel}>{t('newRecord.departDate')}</Text>
                      <Text style={s.dateBtnVal}>{formatDate(startDate)}</Text>
                    </View>
                    <Text style={s.dateBtnArrow}>→</Text>
                    <View style={s.dateBtnCol}>
                      <Text style={s.dateBtnLabel}>{t('newRecord.arriveDate')}</Text>
                      <Text style={s.dateBtnVal}>{formatDate(endDate)}</Text>
                    </View>
                    <View style={{ marginLeft: 10 }}><CalendarIcon size={18} color={skinAccent.accent} /></View>
                  </TouchableOpacity>
                </View>

                {/* ── 동행자 선택 ── */}
                <View style={s.companionSection}>
                  <View style={s.fieldLabelRow}>
                    <Text style={s.companionSectionLabel}>{t('newRecord.companionSelect')}</Text>
                    <Text style={[s.reqTag, { color: skinAccent.accent }]}>✱</Text>
                  </View>
                  {/* 컴팩트 칩 */}
                  <View style={s.companionChipWrap}>
                    {DEFAULT_COMPANIONS.map(comp => {
                      const isActive = selectedCompanions.includes(comp);
                      const iconColor = isActive ? skinAccent.accent : COLORS.textDim;
                      const COMP_ICONS: Record<string, React.ReactNode> = {
                        '혼자': <SoloIcon color={iconColor} />,
                        '친구': <FriendIcon color={iconColor} />,
                        '연인': <CoupleIcon color={iconColor} />,
                        '가족': <FamilyIcon color={iconColor} />,
                        '부모님': <ParentIcon color={iconColor} />,
                        '형제': <SiblingIcon color={iconColor} />,
                      };
                      return (
                        <TouchableOpacity
                          key={comp}
                          style={[s.companionChip, isActive && [s.companionChipActive, { backgroundColor: skinAccent.pill, borderColor: skinAccent.accent }]]}
                          onPress={() => toggleCompanion(comp)}
                          activeOpacity={0.75}
                        >
                          <View style={s.companionChipIconWrap}>{COMP_ICONS[comp]}</View>
                          <Text style={[s.companionChipTxt, isActive && s.companionChipTxtActive]}>{companionLabel(comp)}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {/* 선택된 앱 친구 칩 */}
                  {companionFriends.length > 0 && (
                    <View style={s.customChipRow}>
                      {companionFriends.map(friend => (
                        <View key={friend} style={[s.friendChip, { backgroundColor: skinAccent.accentDeep, borderColor: skinAccent.accent }]}>
                          <View style={[s.friendChipAvatar, { backgroundColor: skinAccent.tint(0.3) }]}>
                            <Text style={[s.friendChipAvatarTxt, { color: skinAccent.accent }]}>{friend[0]}</Text>
                          </View>
                          <Text style={s.friendChipName}>{friend}</Text>
                          <TouchableOpacity
                            onPress={() => removeCompanionFriend(friend)}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Text style={s.customChipX}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                  {/* 앱 친구 추가 버튼 */}
                  <TouchableOpacity
                    style={s.addFriendBtn}
                    onPress={() => setFriendPickerVisible(true)}
                    activeOpacity={0.75}
                  >
                    <FriendIcon color={skinAccent.accent} />
                    <Text style={s.addFriendTxt}>{t('newRecord.addAppFriend')}</Text>
                    {companionFriends.length > 0 && (
                      <View style={[s.addFriendBadge, { backgroundColor: skinAccent.tint(0.15) }]}>
                        <Text style={[s.addFriendBadgeTxt, { color: skinAccent.accent }]}>{companionFriends.length}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>

                {/* 별점 (국가별) */}
                <View style={s.fieldBlock}>
                  <View style={s.ratingLabelRow}>
                    <View style={s.perCountryLabelRow}>
                      <Text style={s.fieldLabelReq}>{t('newRecord.ratingLabel')}</Text>
                      <Text style={[s.reqTag, { color: skinAccent.accent }]}>✱</Text>
                      {isMultiCountry && (
                        <Text style={[s.perCountryHint, { color: skinAccent.accent, backgroundColor: skinAccent.tint(0.1) }]}>{selectedCountries[activeCountryIdx]?.flag} {selectedCountries[activeCountryIdx]?.name}</Text>
                      )}
                    </View>
                    {rating > 0
                      ? <Text style={[s.ratingScore, { color: skinAccent.accent }]}>{rating.toFixed(1)} / 5.0</Text>
                      : <Text style={s.ratingScoreEmpty}>{t('newRecord.ratingEmpty')}</Text>}
                  </View>
                  <View style={s.ratingCard}>
                    {renderStars()}
                  </View>
                </View>
              </View>
            </CollapsibleBox>
          </View>

          {/* ══════════════════ ④ 박스 C: 선택 여행 정보 ══════════════════ */}
          <View
            onLayout={(e) => { sectionYRef.current.optional = e.nativeEvent.layout.y; }}
          >
            <CollapsibleBox
              title={t('newRecord.boxOptional')}
              summary={optionalFilledCount() > 0 ? t('newRecord.boxOptionalCount', { count: optionalFilledCount() }) : undefined}
              expanded={openBox === 'optional'}
              onToggle={() => toggleBox('optional')}
            >
            <View style={s.step3Wrap}>
              {/* 공개 범위 (공통) */}
              <View style={s.fieldBlock}>
                <View style={s.fieldLabelRow}>
                  <Text style={s.fieldLabelReq}>{t('newRecord.visibility')}</Text>
                </View>
                <View style={s.companionChipWrap}>
                  {VISIBILITY_OPTIONS.map(opt => {
                    const isActive = visibility === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[s.companionChip, isActive && [s.companionChipActive, { backgroundColor: skinAccent.pill, borderColor: skinAccent.accent }]]}
                        onPress={() => setVisibility(opt.value)}
                        activeOpacity={0.75}
                      >
                        <Text style={[s.companionChipTxt, isActive && s.companionChipTxtActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* 예산 */}
              <View style={s.optRow}>
                <View style={s.optRowHeader}>
                  <CoinIcon size={18} color={skinAccent.accent} />
                  <Text style={s.optRowTitle}>{t('newRecord.budget')}</Text>
                  {budget ? <Text style={[s.optCardValue, { color: skinAccent.accent, backgroundColor: skinAccent.tint(0.12) }]}>{Number(budget).toLocaleString()} {currency}</Text> : null}
                </View>
                <View style={s.optBudgetRow}>
                  {CURRENCIES.map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[s.optCurrencyChip, currency === c && [s.optCurrencyChipActive, { backgroundColor: skinAccent.accentDeep, borderColor: skinAccent.accent }]]}
                      onPress={() => chooseCurrency(c)}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.optCurrencyTxt, currency === c && s.optCurrencyTxtActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                  {/* 기타 통화 버튼 */}
                  <TouchableOpacity
                    style={[s.optCurrencyChip, !CURRENCIES.includes(currency) && [s.optCurrencyChipActive, { backgroundColor: skinAccent.accentDeep, borderColor: skinAccent.accent }]]}
                    onPress={() => { setCurrencySearch(''); setCurrencyModalVisible(true); }}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.optCurrencyTxt, !CURRENCIES.includes(currency) && s.optCurrencyTxtActive]}>
                      {CURRENCIES.includes(currency) ? t('newRecord.otherCurrency') : currency}
                    </Text>
                  </TouchableOpacity>
                  <TextInput
                    style={s.optBudgetInput}
                    placeholder={t('newRecord.amountPlaceholder')}
                    placeholderTextColor={COLORS.textMuted}
                    value={budget}
                    onChangeText={v => setBudget(v.replace(/[^0-9]/g, ''))}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* 날씨 */}
              <View style={s.optRow}>
                <View style={s.optRowHeader}>
                  <WeatherIcon size={18} color={skinAccent.accent} />
                  <Text style={s.optRowTitle}>{t('newRecord.weather')}</Text>
                  {weather ? <Text style={[s.optCardValue, { color: skinAccent.accent, backgroundColor: skinAccent.tint(0.12) }]}>{WEATHER_OPTIONS.find(w => w.value === weather)?.label}</Text> : null}
                </View>
                <View style={s.optChipRow}>
                  {WEATHER_OPTIONS.map(w => (
                    <TouchableOpacity
                      key={w.value}
                      style={[s.optSmallBtn, weather === w.value && [s.optSmallBtnActive, { backgroundColor: skinAccent.accentDeep, borderColor: skinAccent.accent }]]}
                      onPress={() => setWeather(weather === w.value ? '' : w.value)}
                      activeOpacity={0.75}
                    >
                      {WEATHER_ICON_MAP[w.value]?.(skinAccent.accent)}
                      <Text style={[s.optSmallTxt, weather === w.value && s.optSmallTxtActive]}>
                        {w.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 직항/경유 */}
              <View style={s.optRow}>
                <View style={s.optRowHeader}>
                  <DesignerPlaneIcon size={18} color={skinAccent.accent} />
                  <Text style={s.optRowTitle}>{t('newRecord.flightTitle')}</Text>
                  {flightType ? <Text style={[s.optCardValue, { color: skinAccent.accent, backgroundColor: skinAccent.tint(0.12) }]}>{flightLabel(flightType)}</Text> : null}
                </View>
                <View style={s.optChipRow}>
                  {FLIGHT_OPTIONS.map(f => (
                    <TouchableOpacity
                      key={f}
                      style={[s.optFlightBtn, flightType === f && [s.optFlightBtnActive, { backgroundColor: skinAccent.accentDeep, borderColor: skinAccent.accent }]]}
                      onPress={() => setFlightType(flightType === f ? '' : f)}
                      activeOpacity={0.75}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        {f === '직항' ? <TakeoffIcon size={14} color={flightType === f ? skinAccent.accent : COLORS.textDim} /> : <TransferIcon size={14} color={flightType === f ? skinAccent.accent : COLORS.textDim} />}
                        <Text style={[s.optFlightTxt, flightType === f && s.optFlightTxtActive]}>
                          {flightLabel(f)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 여행 키워드 */}
              <View style={s.optRow}>
                <View style={s.optRowHeader}>
                  <TagIcon size={18} color={skinAccent.accent} />
                  <Text style={s.optRowTitle}>{t('newRecord.keyword')}</Text>
                  {keywords.length > 0 && <Text style={[s.optCardValue, { color: skinAccent.accent, backgroundColor: skinAccent.tint(0.12) }]}>{t('newRecord.keywordCountN', { count: keywords.length })}</Text>}
                </View>
                {/* 태그 + 입력창 인라인 */}
                <View style={s.kwInputBox}>
                  {keywords.map(kw => (
                    <TouchableOpacity
                      key={kw}
                      style={[s.kwTag, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.tint(0.35) }]}
                      onPress={() => setKeywords(prev => prev.filter(k => k !== kw))}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.kwTagTxt, { color: skinAccent.accent }]}>{kw}</Text>
                      <Text style={[s.kwTagDel, { color: skinAccent.tint(0.6) }]}> ✕</Text>
                    </TouchableOpacity>
                  ))}
                  <TextInput
                    style={s.kwInlineInput}
                    value={keywordQuery}
                    onChangeText={v => {
                      // 스페이스 입력 시 태그 추가
                      if (v.endsWith(' ')) addKeyword(v);
                      else setKeywordQuery(v);
                    }}
                    placeholder={keywords.length === 0 ? t('newRecord.keywordPlaceholder') : '#'}
                    placeholderTextColor={COLORS.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={() => addKeyword(keywordQuery)}
                  />
                </View>
                <Text style={s.kwHint}>{t('newRecord.keywordHint')}</Text>
              </View>
            </View>
            </CollapsibleBox>
          </View>

          {/* 하단 저장 바 높이만큼 여백 확보 */}
          <View style={{ height: 80 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 필수 미충족 안내 토스트 */}
      {hintMsg !== '' && (
        <View style={[s.hintToast, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.tint(0.35) }]} pointerEvents="none">
          <Text style={[s.hintToastText, { color: skinAccent.accent }]}>{hintMsg}</Text>
        </View>
      )}

      {/* 하단 고정 저장 바 */}
      <View style={s.saveBar}>
        <TouchableOpacity
          style={[s.saveBarBtn, { backgroundColor: skinAccent.accentDeep }, !canSave && s.saveBarBtnDisabled]}
          onPress={handleSaveBarPress}
          activeOpacity={0.85}
          disabled={saving}
        >
          <Text style={s.saveBarBtnTxt}>{saving ? t('newRecord.saving') : t('newRecord.save')}</Text>
        </TouchableOpacity>
      </View>

      {/* 캘린더 바텀시트 */}
      <CalendarBottomSheet
        visible={calendarVisible}
        initialStart={startDate}
        initialEnd={endDate}
        onConfirm={(s, e) => { setStartDate(s); setEndDate(e); }}
        onClose={() => setCalendarVisible(false)}
        recordedDates={recordedDates}
        recordedRanges={recordedRanges}
      />

      {/* ✨ 여행 기억 — 선택 국가·날짜에 매칭되는 순간 목록 (헤더 버튼으로 열림) */}
      <MomentListSheet
        visible={momentSheetVisible}
        onClose={() => setMomentSheetVisible(false)}
        moments={matchedMoments}
        tripTitle={countrySummary()}
      />

      {/* 🔒 비공개 친구 선택 모달 */}
      <PrivacyModal
        visible={privacyModalIndex !== null}
        selectedFriends={privacyModalIndex !== null ? (mediaPrivacy[privacyModalIndex] || []) : []}
        allFriends={friendNames}
        onToggle={friend => privacyModalIndex !== null && toggleMediaPrivacyFriend(privacyModalIndex, friend)}
        onSetAll={friends => privacyModalIndex !== null && setMediaPrivacyAll(privacyModalIndex, friends)}
        onClose={() => setPrivacyModalIndex(null)}
      />

      {/* 앱 친구 선택 모달 */}
      <FriendPickerModal
        visible={friendPickerVisible}
        friends={friendNames}
        selected={companionFriends}
        onToggle={toggleCompanionFriend}
        onClose={() => setFriendPickerVisible(false)}
      />

      {/* 기타 통화 선택 모달 */}
      <CurrencyPickerModal
        visible={currencyModalVisible}
        search={currencySearch}
        onSearchChange={setCurrencySearch}
        selected={currency}
        onSelect={(code) => { chooseCurrency(code); setCurrencyModalVisible(false); }}
        onClose={() => setCurrencyModalVisible(false)}
      />

      {/* ── 미디어 선택 모달 (상한 초과 시) ── */}
      <MediaPickerModal
        visible={mediaPickerVisible}
        assets={mediaPickerAssets}
        selected={mediaPickerSelected}
        max={mediaPickerMax}
        onToggle={toggleMediaPickerItem}
        onConfirm={confirmMediaPickerSelection}
        onClose={() => setMediaPickerVisible(false)}
      />

    </SafeAreaView>
  );
}

// ─── 접이식 섹션 박스 (이 화면 전용) ───
function CollapsibleBox({
  title,
  summary,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  summary?: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={s.cBox}>
      <TouchableOpacity
        style={s.cBoxHeader}
        onPress={onToggle}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.cBoxTitle}>{title}</Text>
          {!expanded && !!summary && (
            <Text style={s.cBoxSummary} numberOfLines={1}>{summary}</Text>
          )}
        </View>
        <Text style={s.cBoxChevron}>{expanded ? '▴' : '▾'}</Text>
      </TouchableOpacity>
      {expanded && <View style={s.cBoxBody}>{children}</View>}
    </View>
  );
}

// ─── 스타일 ───
const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  cancelBtn: { padding: 4 },
  cancelTxt: { fontSize: 16, color: COLORS.textMuted },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: COLORS.white },

  scroll:   { flex: 1 },
  content:  { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },

  // ── 섹션 라벨 ──
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.purpleNeon,
    letterSpacing: 0.6,
    marginBottom: 10,
  },

  // ── 국가 섹션 접힘 요약 ──
  countryCollapseRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  countryChangeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.purpleNeon,
  },
  countryChangeBtnTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.purpleNeon,
  },

  // ── 하단 고정 저장 바 ──
  saveBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingBottom: 24,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  saveBarBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: COLORS.purpleDeep,
  },
  saveBarBtnDisabled: {
    opacity: 0.4,
  },
  saveBarBtnTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },

  stepHint: {
    marginTop: 20,
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
  },

  // ── 국가 섹션 UI ──
  searchCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  searchCardSelected: {
    borderColor: COLORS.purpleNeon,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  searchInput: {
    flex: 1,
    color: COLORS.white,
    fontSize: 16,
    padding: 0,
  },
  clearBtnTxt: { fontSize: 14, color: COLORS.textDim, fontWeight: '600' },

  countryResultBox: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    marginTop: 8,
    maxHeight: 320,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  continentHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.purpleNeon,
    letterSpacing: 0.8,
    paddingTop: 12,
    paddingBottom: 4,
    paddingHorizontal: 2,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  countryIcon: { fontSize: 22, marginRight: 14 },
  countryName: { fontSize: 15, color: COLORS.white },
  countryNameSelected: { color: COLORS.purpleNeon, fontWeight: '600' },
  countryItemSelected: {
    backgroundColor: 'rgba(191,133,252,0.08)',
  },
  countryCheckMark: {
    marginLeft: 'auto',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.purpleNeon,
  },
  noResultText: { color: COLORS.textDim, fontSize: 14, textAlign: 'center', marginVertical: 24 },

  selectedChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  countryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.3)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 6,
  },
  countryChipText: {
    fontSize: 13,
    color: COLORS.purpleNeon,
    fontWeight: '600',
  },
  countryChipRemove: {
    fontSize: 11,
    color: COLORS.textDim,
    fontWeight: '700',
  },

  selectedBadge: {
    marginTop: 14,
    alignSelf: 'center',
    backgroundColor: 'rgba(191,133,252,0.12)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  selectedBadgeTxt: {
    fontSize: 13,
    color: COLORS.purpleNeon,
    fontWeight: '600',
  },

  // ── 국가별 탭 (Step 2, 3 공용) ──
  countryTabScroll: {
    marginBottom: 14,
  },
  countryTabContent: {
    gap: 8,
  },
  countryTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  countryTabActive: {
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderColor: COLORS.purpleNeon,
  },
  countryTabText: {
    fontSize: 13,
    color: COLORS.textDim,
    fontWeight: '500',
  },
  countryTabTextActive: {
    color: COLORS.purpleNeon,
    fontWeight: '700',
  },
  perCountryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  perCountryHint: {
    fontSize: 11,
    color: COLORS.purpleNeon,
    backgroundColor: 'rgba(191,133,252,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },

  // ── Step 2 ──
  addMediaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(191,133,252,0.35)',
    borderStyle: 'dashed',
  },
  addMediaBtnDisabled: {
    opacity: 0.4,
  },
  addMediaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  addMediaText: { fontSize: 15, color: COLORS.white, fontWeight: '600' },
  addMediaSub:  { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  addMediaCountBadge: {
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  addMediaCountTxt: { fontSize: 13, color: COLORS.purpleNeon, fontWeight: '700' },

  // 사진 썸네일/드래그 행 스타일은 components/record/DraggableLists 로 이동

  // ── Step 3 ──
  step3Wrap: {
    gap: 16,
  },
  fieldBlock: {
    gap: 8,
  },
  // 필수 항목 라벨 — 흰색
  fieldLabelReq: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
  },
  // 라벨 + 필수 태그 행
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // 필수 표시 태그
  reqTag: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.purpleNeon,
    lineHeight: 14,
  },
  // 선택 항목 라벨 — 회색 (Step 4·5용)
  fieldInput: {
    backgroundColor: COLORS.card,   // #2E2E3B
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: COLORS.white,
    fontSize: 15,
  },
  memoInput: {
    height: 120,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  charCount: {
    alignSelf: 'flex-end',
    marginTop: 4,
    fontSize: 11,
    color: COLORS.textMuted,
  },
  hintToast: {
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.35)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  hintToastText: { color: COLORS.purpleNeon, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dateBtnCol: { flex: 1 },
  dateBtnLabel: { fontSize: 11, color: COLORS.textMuted, marginBottom: 4 },
  dateBtnVal:   { fontSize: 15, fontWeight: '600', color: COLORS.white },
  dateBtnArrow: { fontSize: 18, color: COLORS.textMuted, marginHorizontal: 12 },

  ratingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ratingScore: {
    fontSize: 13,
    color: COLORS.purpleNeon,
    fontWeight: '700',
  },
  ratingScoreEmpty: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  ratingCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  starWrap: { width: 32, height: 32 },
  starAbsolute: { position: 'absolute', left: 0, top: 0, width: 32 },
  starFillClip: { position: 'absolute', left: 0, top: 0, height: 32, overflow: 'hidden' },
  starChar: { fontSize: 28, color: '#3A3A4A', textAlign: 'center', lineHeight: 32, width: 32 },
  starCharActive: { color: COLORS.gold },

  // ── Step 4 ──
  companionSection: {
    gap: 12,
  },
  companionSectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
  },
  // 컴팩트 칩 래퍼
  companionChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  // 컴팩트 칩 (작은 pill 형태)
  companionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: COLORS.divider,
    gap: 5,
  },
  companionChipActive: {
    backgroundColor: 'rgba(107,33,168,0.3)',
    borderColor: COLORS.purpleNeon,
  },
  companionChipIconWrap: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  companionChipTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDim,
  },
  companionChipTxtActive: { color: COLORS.white },

  // 직접입력으로 추가된 칩
  customChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  customChipX:   { fontSize: 12, color: 'rgba(255,255,255,0.6)' },

  // 앱 친구 칩
  friendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.purpleDeep,
    borderRadius: 20,
    paddingRight: 12,
    paddingLeft: 4,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.purpleNeon,
  },
  friendChipAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(191,133,252,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendChipAvatarTxt: { fontSize: 11, color: COLORS.purpleNeon, fontWeight: '700' },
  friendChipName: { fontSize: 13, color: COLORS.white, fontWeight: '600' },

  // 앱 친구 추가 버튼
  addFriendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderStyle: 'dashed' as any,
  },
  addFriendTxt: { fontSize: 14, color: COLORS.textDim, fontWeight: '500' },
  addFriendBadge: {
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 'auto' as any,
  },
  addFriendBadgeTxt: { fontSize: 11, color: COLORS.purpleNeon, fontWeight: '700' },

  // Step 5에서도 쓰는 칩 (날씨·비행·키워드)

  // ── Step 5 ──

  // 공통 옵션 행
  optRow: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  optRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  optRowTitle: { fontSize: 13, fontWeight: '600', color: COLORS.white },
  optCardValue: {
    fontSize: 11,
    color: COLORS.purpleNeon,
    fontWeight: '600',
    backgroundColor: 'rgba(191,133,252,0.12)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },

  // 예산 (compact)
  optBudgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  optCurrencyChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  optCurrencyChipActive: {
    backgroundColor: COLORS.purpleDeep,
    borderColor: COLORS.purpleNeon,
  },
  optCurrencyTxt:       { fontSize: 12, fontWeight: '700', color: COLORS.textDim },
  optCurrencyTxtActive: { color: COLORS.white },
  optBudgetInput: {
    flex: 1,
    minWidth: 80,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.divider,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  // 날씨 / 직항 공통 칩 행
  optChipRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  optSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.divider,
    gap: 4,
  },
  optSmallBtnActive: {
    backgroundColor: COLORS.purpleDeep,
    borderColor: COLORS.purpleNeon,
  },
  optSmallTxt:       { fontSize: 12, color: COLORS.textDim, fontWeight: '500' },
  optSmallTxtActive: { color: COLORS.white, fontWeight: '600' },

  // 직항/경유 버튼
  optFlightBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  optFlightBtnActive: {
    backgroundColor: COLORS.purpleDeep,
    borderColor: COLORS.purpleNeon,
  },
  optFlightTxt:       { fontSize: 13, fontWeight: '600', color: COLORS.textDim },
  optFlightTxtActive: { color: COLORS.white },

  // 키워드 인풋 박스 (태그 + 입력 인라인)
  kwInputBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.divider,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
    minHeight: 42,
  },
  kwHint: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  kwTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.35)',
  },
  kwTagTxt: { fontSize: 13, color: COLORS.purpleNeon, fontWeight: '600' },
  kwTagDel: { fontSize: 11, color: 'rgba(191,133,252,0.6)' },
  kwInlineInput: {
    fontSize: 13,
    color: COLORS.white,
    padding: 0,
    minWidth: 80,
    flex: 1,
  },

  // (비공개 모달 스타일은 pm 객체로 분리됨)

  // 기타 통화 모달 스타일은 components/record/CurrencyPickerModal 로 이동

  cloudProgressText: {
    fontSize: 12,
    color: COLORS.textDim,
  },
  // 국내 지역 선택 칩
  regionPickLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDim,
    marginBottom: 8,
  },
  regionPickChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  regionPickChipActive: {
    backgroundColor: 'rgba(191,133,252,0.15)',
    borderColor: COLORS.purpleNeon,
  },
  regionPickChipText: {
    fontSize: 13,
    color: COLORS.textDim,
    fontWeight: '600',
  },
  regionPickChipTextActive: {
    color: COLORS.purpleNeon,
  },
  cloudCancelBtn: {
    marginTop: 2,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(191,133,252,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.3)',
  },
  cloudCancelText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.purpleNeon,
  },

  // 모달 전체 배경

  // 로딩

  // 제목

  // 날짜 범위

  // 날짜 수정 버튼

  // 안내 문구

  // 버튼 행

  // 토스트
  draggableHelperText: {
    fontSize: 12,
    color: '#A1A1B0',
    marginTop: 4,
    marginBottom: 12,
    paddingHorizontal: 4,
  },

  // ── 접이식 박스 ──
  cBox: {
    backgroundColor: '#17131f',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.card,
    marginHorizontal: 0,
    marginTop: 10,
    overflow: 'hidden',
  },
  cBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  cBoxTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.purpleNeon,
    letterSpacing: 0.6,
  },
  cBoxSummary: {
    fontSize: 11,
    color: COLORS.textDim,
    marginTop: 2,
  },
  cBoxChevron: {
    fontSize: 14,
    color: COLORS.purpleNeon,
    marginLeft: 8,
  },
  cBoxBody: {
    paddingHorizontal: 14,
    paddingBottom: 16,
    paddingTop: 4,
  },
});

// 드래그 앤 드롭 리스트(국가/사진)는 components/record/DraggableLists 로 분리

// ─── 앱 친구 선택 모달 스타일 ───
// 앱 친구 선택 모달은 components/record/FriendPickerModal 로 분리
// 미디어 선택 모달은 components/record/MediaPickerModal 로 분리
